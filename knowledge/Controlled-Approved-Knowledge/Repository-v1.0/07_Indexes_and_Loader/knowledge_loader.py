#!/usr/bin/env python3
"""ClinixAI governed knowledge loader.

Reads knowledge.jsonl or chunks.jsonl, validates production eligibility,
and emits records for a vector-store adapter. This file intentionally does
not hard-code a specific database client.
"""
from __future__ import annotations
import argparse, json, hashlib
from pathlib import Path

def read_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_no}: invalid JSON: {exc}") from exc

def validate_chunk(record: dict, production: bool) -> None:
    required = {"chunk_id", "ko_id", "title", "domain", "version", "status", "section", "text", "content_hash_sha256"}
    missing = required - record.keys()
    if missing:
        raise ValueError(f"{record.get('chunk_id', '<unknown>')}: missing {sorted(missing)}")
    actual = hashlib.sha256(record["text"].encode("utf-8")).hexdigest()
    if actual != record["content_hash_sha256"]:
        raise ValueError(f"{record['chunk_id']}: hash mismatch")
    if production and not (record.get("status") == "Approved" and record.get("effective_for_production") is True):
        raise ValueError(f"{record['chunk_id']}: non-approved content cannot enter production")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="chunks.jsonl")
    parser.add_argument("--output", default="vector_seed.jsonl")
    parser.add_argument("--production", action="store_true")
    args = parser.parse_args()
    source, target = Path(args.input), Path(args.output)
    count = 0
    with target.open("w", encoding="utf-8") as out:
        for record in read_jsonl(source):
            validate_chunk(record, args.production)
            vector_record = {
                "id": record["chunk_id"],
                "document": record["text"],
                "metadata": {
                    "ko_id": record["ko_id"],
                    "title": record["title"],
                    "domain": record["domain"],
                    "version": record["version"],
                    "status": record["status"],
                    "section": record["section"],
                    "source_file": record.get("source_file"),
                    "regulatory_reference": record.get("regulatory_reference"),
                    "content_hash_sha256": record["content_hash_sha256"],
                },
            }
            out.write(json.dumps(vector_record, ensure_ascii=False) + "\n")
            count += 1
    print(f"Validated and emitted {count} vector records to {target}")

if __name__ == "__main__":
    main()
