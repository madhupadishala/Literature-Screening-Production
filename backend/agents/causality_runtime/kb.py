"""Knowledge layer: structure-aware chunks, metadata-filtered hybrid retrieval (BM25 + dense, RRF,
rerank), extractive verified citations, and rule->clause drift detection.
In-memory reference implementation; schema.sql shows the Postgres FTS + pgvector target."""
import hashlib
import math
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Protocol

from .schemas import Citation

_STOP = set("a an the of and or to in for on with is are was were be by as at it this that from".split())


def tokenize(s: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", s.lower()) if t not in _STOP]


@dataclass(frozen=True)
class Chunk:
    kb: str                     # methodology | regulatory | product | literature
    source: str
    section_id: str
    text: str
    version: str
    jurisdiction: str = "global"
    effective_date: date = date.min
    superseded_on: date | None = None
    tenant_scope: str | None = None     # None = shared; else only that tenant
    doc_type: str = "guideline"

    @property
    def key(self) -> str:
        return f"{self.tenant_scope or 'GLOBAL'}|{self.jurisdiction}|{self.source}|{self.section_id}|{self.version}"

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.text.encode()).hexdigest()


class Embedder(Protocol):
    def embed(self, text: str) -> list[float]: ...


class HashingEmbedder:
    """Deterministic offline stand-in. Swap for a real embedding model in production."""

    def __init__(self, dim: int = 256):
        self.dim = dim

    def embed(self, text: str) -> list[float]:
        v = [0.0] * self.dim
        for t in tokenize(text):
            h = int(hashlib.md5(t.encode()).hexdigest(), 16)
            v[h % self.dim] += 1.0 if (h >> 64) & 1 else -1.0
        n = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / n for x in v]


class Reranker(Protocol):
    def score(self, query: str, text: str) -> float: ...


class OverlapReranker:
    """Stand-in for a cross-encoder."""

    def score(self, query: str, text: str) -> float:
        q, t = set(tokenize(query)), set(tokenize(text))
        return len(q & t) / (len(q) or 1)


@dataclass
class Hit:
    chunk: Chunk
    score: float


class KnowledgeStore:
    def __init__(self, embedder: Embedder | None = None, reranker: Reranker | None = None):
        self.chunks: list[Chunk] = []
        self._vec: dict[str, list[float]] = {}
        self.embedder = embedder or HashingEmbedder()
        self.reranker = reranker or OverlapReranker()

    def add(self, c: Chunk) -> None:
        self.chunks.append(c)
        self._vec[c.key] = self.embedder.embed(c.text)

    # ---- eligibility: the metadata filter runs BEFORE any scoring
    @staticmethod
    def eligible(c: Chunk, kbs, jurisdiction: str, as_of: date, tenant: str | None) -> bool:
        return (c.kb in kbs
                and c.jurisdiction in ("global", jurisdiction)
                and c.effective_date <= as_of
                and (c.superseded_on is None or as_of < c.superseded_on)
                and (c.tenant_scope is None or c.tenant_scope == tenant))

    def get(self, kb: str, source: str, section_id: str, as_of: date, jurisdiction: str = "global",
            tenant: str | None = None) -> Chunk | None:
        cands = [c for c in self.chunks if c.source == source and c.section_id == section_id
                 and self.eligible(c, {kb}, jurisdiction, as_of, tenant)]
        return max(cands, key=lambda c: c.effective_date) if cands else None

    def search(self, query: str, kbs, jurisdiction: str, as_of: date, tenant: str | None,
               top_k: int = 5, pool: int = 20) -> list[Hit]:
        kbs = set(kbs)
        docs = [c for c in self.chunks if self.eligible(c, kbs, jurisdiction, as_of, tenant)]
        if not docs:
            return []
        q = tokenize(query)
        toks = [tokenize(c.text) for c in docs]
        n, avgdl = len(docs), (sum(len(t) for t in toks) / len(docs)) or 1.0
        df = {w: sum(1 for t in toks if w in t) for w in set(q)}
        bm = []
        for t in toks:
            s = 0.0
            for w in set(q):
                f = t.count(w)
                if f:
                    idf = math.log(1 + (n - df[w] + 0.5) / (df[w] + 0.5))
                    s += idf * f * 2.5 / (f + 1.5 * (0.25 + 0.75 * len(t) / avgdl))
            bm.append(s)
        qv = self.embedder.embed(query)
        dense = [sum(a * b for a, b in zip(qv, self._vec[c.key])) for c in docs]

        def ranks(scores):
            order = sorted(range(len(scores)), key=lambda i: -scores[i])
            return {i: r for r, i in enumerate(order)}
        rb, rd = ranks(bm), ranks(dense)
        fused = {i: (1 / (60 + rb[i]) if bm[i] > 0 else 0) + 1 / (60 + rd[i]) for i in range(len(docs))}
        top = sorted(fused, key=lambda i: -fused[i])[:pool]
        reranked = sorted(top, key=lambda i: -self.reranker.score(query, docs[i].text))
        return [Hit(docs[i], self.reranker.score(query, docs[i].text)) for i in reranked[:top_k]]


# ---------- citations (extractive => verbatim by construction, then re-verified)
def _norm(s): return re.sub(r"\s+", " ", s).strip().lower()


def best_quote(chunk: Chunk, query: str, max_len: int = 300) -> str | None:
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", chunk.text) if s.strip()]
    q = set(tokenize(query))
    best = max(sents, key=lambda s: len(q & set(tokenize(s))), default=None)
    return best[:max_len] if best else None


def make_citation(chunk: Chunk, quote: str | None) -> Citation | None:
    if not quote or _norm(quote) not in _norm(chunk.text):
        return None
    return Citation(kb=chunk.kb, source=chunk.source, section_id=chunk.section_id,
                    version=chunk.version, quote=quote)


def verify_citation(c: Citation, store: KnowledgeStore) -> bool:
    return any(k.source == c.source and k.section_id == c.section_id and k.version == c.version
               and _norm(c.quote) in _norm(k.text) for k in store.chunks)


# ---------- drift: rule -> clause links vs the KB
def pins_for(links, store: KnowledgeStore, as_of: date, jurisdiction="global", tenant=None) -> dict[str, str]:
    """Run after a human validates the linked clauses; stores their content hashes."""
    out = {}
    for l in links.values():
        c = store.get(l.kb, l.source, l.section_id, as_of, jurisdiction, tenant)
        if c:
            out[c.key] = c.sha256
    return out


def check_link(link, store: KnowledgeStore, pins: dict[str, str], as_of: date,
               jurisdiction="global", tenant=None) -> tuple[str, Chunk | None]:
    if link.section_id.startswith("UNMAPPED"):
        return "unmapped", None
    c = store.get(link.kb, link.source, link.section_id, as_of, jurisdiction, tenant)
    if c is None:
        return "missing", None
    if c.version != link.version:
        return "version_mismatch", c
    if c.key not in pins:
        return "unpinned", c
    if pins[c.key] != c.sha256:
        return "content_changed", c
    return "ok", c


def check_drift(links: dict, store, pins, as_of, jurisdiction="global", tenant=None) -> dict[str, str]:
    return {rid: check_link(l, store, pins, as_of, jurisdiction, tenant)[0] for rid, l in links.items()}


# ---------- ingestion
def ingest_markdown(store: KnowledgeStore, text: str, *, kb: str, source: str, version: str,
                    jurisdiction: str = "global", effective_date: date = date.min,
                    superseded_on: date | None = None, tenant_scope: str | None = None,
                    doc_type: str = "guideline") -> int:
    """Split on '## <section_id> <title>' headings: one chunk per section, never fixed windows."""
    n = 0
    for part in re.split(r"(?m)^##\s+", text)[1:]:
        head, _, body = part.partition("\n")
        sid, _, title = head.strip().partition(" ")
        store.add(Chunk(kb=kb, source=source, section_id=sid, text=(title + "\n" + body).strip(),
                        version=version, jurisdiction=jurisdiction, effective_date=effective_date,
                        superseded_on=superseded_on, tenant_scope=tenant_scope, doc_type=doc_type))
        n += 1
    return n


def load_kb_dir(store: KnowledgeStore, path: str) -> int:
    """Files: '---' header (key: value lines) '---' then '## section_id Title' sections."""
    total = 0
    for f in sorted(Path(path).glob("*.md")):
        raw = f.read_text()
        _, hdr, body = raw.split("---", 2)
        m = dict(l.split(":", 1) for l in hdr.strip().splitlines() if ":" in l)
        m = {k.strip(): v.strip() for k, v in m.items()}
        d = lambda k: date.fromisoformat(m[k]) if m.get(k) else None
        total += ingest_markdown(
            store, body, kb=m["kb"], source=m["source"], version=m["version"],
            jurisdiction=m.get("jurisdiction", "global"), effective_date=d("effective_date") or date.min,
            superseded_on=d("superseded_on"), tenant_scope=m.get("tenant_scope") or None,
            doc_type=m.get("doc_type", "guideline"))
    return total
