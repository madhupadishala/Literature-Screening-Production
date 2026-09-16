import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const migrationsDir = path.resolve(process.cwd(), "database", "migrations");
const files = (await readdir(migrationsDir))
  .filter((name) => /^\d{3}_.*\.sql$/.test(name))
  .sort();

for (const file of files) {
  const sql = await readFile(path.join(migrationsDir, file));
  const checksum = createHash("sha256").update(sql).digest("hex");
  console.log(`MIGRATION_CHECKSUM ${file} ${checksum}`);
}
