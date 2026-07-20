import "server-only";

export async function fetchJson<T>(
  url: URL,
  init: RequestInit = {},
): Promise<T> {
  const timeoutMs = Math.max(
    5_000,
    Math.min(
      Number(process.env.LITERATURE_CONNECTOR_TIMEOUT_MS || 30_000),
      120_000,
    ),
  );

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent":
        process.env.LITERATURE_CONNECTOR_USER_AGENT ||
        "ClinixAI-Literature-Intelligence/1.0",
      ...(init.headers || {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Connector returned HTTP ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  return (await response.json()) as T;
}

export function parseIsoDate(value: unknown): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  const year = raw.match(/\b(19|20)\d{2}\b/)?.[0];
  return year ? `${year}-01-01` : undefined;
}

export function normalizeDoi(value: unknown): string | undefined {
  const raw = String(value || "")
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();

  return raw || undefined;
}

export function normalizedTitle(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildDedupeKey(input: {
  doi?: string;
  pmid?: string;
  title: string;
  publicationDate?: string;
}): string {
  if (input.doi) return `doi:${input.doi.toLowerCase()}`;
  if (input.pmid) return `pmid:${input.pmid}`;

  const year = input.publicationDate?.slice(0, 4) || "unknown";
  return `title:${normalizedTitle(input.title)}:${year}`;
}
