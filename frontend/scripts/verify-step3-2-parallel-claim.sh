#!/usr/bin/env bash
set -euo pipefail
export PGHOST=localhost PGUSER=nexus_test PGDATABASE=nexus_test PGPASSWORD=nexus_test
psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE retry_claim_test (id text PRIMARY KEY, tenant_id text NOT NULL, status text NOT NULL);
INSERT INTO retry_claim_test VALUES ('p1','t1','HITS_REVIEW'),('p2','t2','HITS_REVIEW');
SQL
# Session A obtains a row lock and holds it while Session B races for the same claim.
(psql -v ON_ERROR_STOP=1 -Atc "BEGIN; UPDATE retry_claim_test SET status='HITS_RUNNING' WHERE id='p1' AND tenant_id='t1' AND status='HITS_REVIEW' RETURNING id; SELECT pg_sleep(3); COMMIT;" > /tmp/retry-claim-a.out) &
a=$!
sleep 1
(psql -v ON_ERROR_STOP=1 -Atc "UPDATE retry_claim_test SET status='HITS_RUNNING' WHERE id='p1' AND tenant_id='t1' AND status='HITS_REVIEW' RETURNING id;" > /tmp/retry-claim-b.out) &
b=$!
wait "$a"
wait "$b"
grep -qx 'p1' /tmp/retry-claim-a.out || { echo 'First claim did not acquire row'; exit 1; }
if grep -qx 'p1' /tmp/retry-claim-b.out; then echo 'Second concurrent claim wrongly acquired same row'; exit 1; fi
psql -v ON_ERROR_STOP=1 -Atc "UPDATE retry_claim_test SET status='HITS_RUNNING' WHERE id='p2' AND tenant_id='t1' AND status='HITS_REVIEW' RETURNING id;" > /tmp/retry-cross-tenant.out
if grep -qx 'p2' /tmp/retry-cross-tenant.out; then echo 'Cross-tenant claim succeeded'; exit 1; fi
echo 'PostgreSQL simultaneous competing sessions: PASS (one successful claim, no cross-tenant claim)'
