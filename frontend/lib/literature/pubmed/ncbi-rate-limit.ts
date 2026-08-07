import "server-only";

// NCBI's published limits: 3 requests/second without an API key, 10/second
// with one (set NCBI_API_KEY). Every eutils call in this app -- search,
// summary, and per-article abstract fetch -- goes through this single
// limiter so a 500-article run can't burst past NCBI's limit and get
// temporarily blocked mid-run.
function requestsPerSecond(): number {
  return process.env.NCBI_API_KEY?.trim() ? 10 : 3;
}

let queue: Promise<void> = Promise.resolve();
let lastRunAt = 0;

async function throttle(): Promise<void> {
  const runAfter = queue;
  let release: () => void;

  queue = new Promise((resolve) => {
    release = resolve;
  });

  await runAfter;

  const minIntervalMs = 1000 / requestsPerSecond();
  const wait = Math.max(0, lastRunAt + minIntervalMs - Date.now());

  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  lastRunAt = Date.now();
  release!();
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export async function ncbiFetch(
  url: URL,
  init: RequestInit = {},
  attempt = 1,
): Promise<Response> {
  await throttle();

  const timeoutMs = Math.max(
    5_000,
    Math.min(Number(process.env.LITERATURE_CONNECTOR_TIMEOUT_MS || 30_000), 120_000),
  );

  const response = await fetch(url, {
    ...init,
    headers: {
      "User-Agent":
        process.env.LITERATURE_CONNECTOR_USER_AGENT || "ClinixAI-Literature-Intelligence/1.0",
      ...(init.headers || {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok && RETRYABLE_STATUS.has(response.status) && attempt <= 3) {
    // Exponential backoff: 1s, 2s, 4s. NCBI's 429s are usually transient
    // load-shedding, not a hard ban, so a short backoff and retry is
    // appropriate rather than failing the whole article immediately.
    const backoffMs = 1000 * 2 ** (attempt - 1);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    return ncbiFetch(url, init, attempt + 1);
  }

  return response;
}

export function ncbiBaseUrl(): string {
  return process.env.PUBMED_EUTILS_BASE_URL?.trim() || "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
}

export function addNcbiIdentity(url: URL): void {
  const apiKey = process.env.NCBI_API_KEY?.trim();
  const email = process.env.NCBI_EMAIL?.trim();
  const tool = process.env.NCBI_TOOL?.trim() || "ClinixAI";

  if (apiKey) url.searchParams.set("api_key", apiKey);
  if (email) url.searchParams.set("email", email);
  url.searchParams.set("tool", tool);
}
