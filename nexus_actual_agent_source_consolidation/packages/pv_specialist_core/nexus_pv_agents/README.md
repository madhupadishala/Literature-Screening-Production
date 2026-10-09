# TheClinixAI Nexus — Eight Specialist Pharmacovigilance Agents (Engineering Release 1.0.0)

Standalone, Nexus-ready implementation of the eight specialist agents defined in the
Golden Master Prompt v2.0, with a controlled regulatory knowledge register, labeled
validation corpus, executable test evidence and benchmark results.

## Layout

```
nexus_agents/            agent package (typed contracts in schemas.py, contract v1.0.0)
  agents/                the eight specialist agents (one module each)
  knowledge_register.py  controlled regulatory register (approval-gated)
  terminology.py         licensed-MedDRA interface + development placeholder
  orchestration.py       3 E2E workflows + LangGraph adapter contract
data/regulatory_register.json   11 verified register entries (checksum-controlled)
corpus/                  labeled scenario corpus (build_corpus.py -> corpus.json)
tests/                   run_tests.py harness + test_agents.py + test_e2e.py
validation/              benchmark.py, benchmark_results.json, test_evidence.txt
```

## Run

```bash
python3 corpus/build_corpus.py        # regenerate labeled corpus
python3 tests/run_tests.py            # 33 tests; exit 0 only if all pass
python3 validation/benchmark.py       # measured metrics incl. adversarial hold-out
```

## Hard rules encoded

- Decisions only from APPROVED knowledge-register rules (license-blocked MedDRA entry cannot drive coding).
- Facts and inferences are separate fields; inferences are never promoted silently.
- EXACT ICSR duplicates require deterministic identifiers; field similarity caps at PROBABLE + human review.
- G.k.8 codes 1/2/3/4/0/9 exactly per ICH E2B(R3) IG; NA=9 requires documented precondition.
- Dechallenge is derived (G.k.8 + E.i.7); rechallenge maps to G.k.9.i.4 (1/2/3/4); the rechallenge agent never recommends performing a rechallenge.
- Processing failure can never produce a false negative (explicit failure envelope).
- Literature records are never auto-discarded unless a confirmed bibliographic duplicate.

## Status

Engineering release. NOT clinically qualified. See FINAL_REPORT.md for the full
per-agent table, measured performance, blockers and release gating.
