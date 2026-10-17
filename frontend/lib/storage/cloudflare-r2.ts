import "server-only";
import { createHash, createHmac } from "node:crypto";

/** Private Cloudflare R2 S3-compatible client. No public buckets or signed browser URLs. */
function config() {
  const account = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
  const access = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
  const secret = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.CLINIXAI_STORAGE_BUCKET?.trim();
  if (!account || !access || !secret || !bucket || !/^[a-f0-9]{32}$/.test(account)) {
    throw new Error("Private R2 storage not configured: account, access key, secret and bucket required");
  }
  return { access, secret, bucket, endpoint: `https://${account}.r2.cloudflarestorage.com` };
}
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
function sign(secret: string | Buffer, value: string) {
  return createHmac("sha256", secret).update(value).digest();
}
function encodedKey(key: string) {
  if (!key || key.startsWith("/") || key.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Invalid object key");
  }
  return key.split("/").map(encodeURIComponent).join("/");
}
async function request(method: "PUT" | "GET" | "DELETE", key: string, content?: Buffer, contentType?: string) {
  const cfg = config();
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${encodedKey(key)}`);
  const time = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = time.slice(0, 8);
  const bodyHash = sha(content ?? Buffer.alloc(0));
  const headers: Record<string, string> = {
    host: url.host, "x-amz-date": time, "x-amz-content-sha256": bodyHash,
  };
  if (contentType) headers["content-type"] = contentType;
  const keys = Object.keys(headers).sort();
  const signedHeaders = keys.join(";");
  const canonicalHeaders = keys.map(k => `${k}:${headers[k].trim()}\n`).join("");
  const canonical = [method, url.pathname, "", canonicalHeaders, signedHeaders, bodyHash].join("\n");
  const scope = `${date}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", time, scope, sha(canonical)].join("\n");
  const kDate = sign("AWS4" + cfg.secret, date);
  const kRegion = sign(kDate, "auto");
  const kService = sign(kRegion, "s3");
  const kSigning = sign(kService, "aws4_request");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.access}/${scope}, SignedHeaders=${signedHeaders}, Signature=${createHmac("sha256", kSigning).update(stringToSign).digest("hex")}`;
  const response = await fetch(url, { method, headers, body: content ? new Uint8Array(content) : undefined, cache: "no-store" });
  if (!response.ok) throw new Error(`Private object storage request failed (${response.status})`);
  return response;
}
export const r2ObjectStorage = {
  async put(key: string, data: Buffer, contentType: string) { await request("PUT", key, data, contentType); },
  async get(key: string): Promise<Buffer> { return Buffer.from(await (await request("GET", key)).arrayBuffer()); },
  async remove(key: string) { await request("DELETE", key); },
};
