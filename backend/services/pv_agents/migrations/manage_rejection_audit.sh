#!/usr/bin/env bash
# Run with migration-owner DATABASE_URL against a designated staging DB only.
set -euo pipefail
: "${DATABASE_URL:?staging DATABASE_URL required}"
[[ "${NEXUS_STAGE:-}" == "staging" ]] || { echo "Refusing non-staging migration"; exit 3; }
base="$(cd "$(dirname "$0")" && pwd)"
case "${1:-}" in
  pre)
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc "
      SELECT current_database(),current_user;
      SELECT coalesce(to_regclass('public.pv_agent_rejection_audit')::text,'absent');"
    ;;
  apply)
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$base/002_rejection_audit.sql"
    ;;
  post)
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$base/002_verify_rejection_audit.sql"
    ;;
  rollback)
    [[ "${NEXUS_AUDIT_ROLLBACK_CONFIRMED:-}" == "YES_EMPTY_ONLY" ]] || exit 3
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$base/002_rollback_rejection_audit.sql"
    ;;
  *) echo "Usage: NEXUS_STAGE=staging DATABASE_URL=... $0 pre|apply|post|rollback"; exit 2 ;;
esac
