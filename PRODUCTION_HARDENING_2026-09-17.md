# Production hardening — 2026-09-17

## Completed
- Dedicated PostgreSQL database created: `literature_screening_prod`
- Repository migrations 001–016 applied to the production database
- Production tenant created: `clinixai-prod` / `TheClinixAI Production`
- Super Admin identity created: `admin@theclinixai.com`
- Super Admin membership assigned: `CLINIXAI_SUPER_ADMIN`
- Login UI updated on this branch to default to `clinixai-prod`

## Intentionally pending
- Super Admin password hash: must be provisioned through the secure seed/bootstrap path; plaintext credentials must not be committed or logged.
- Vercel `DATABASE_URL` and `DATABASE_SSL_MODE=require`: must be added to the production project environment.
- `EVIDENCE_STORE_BACKEND=database`
- `OPENAI_API_KEY`
- controlled knowledge loading/configuration
- `INTERNAL_MONITORING_TOKEN`
- `RELEASE_BASE_URL`, `RELEASE_VERSION`, release gate execution

## Verification target
After environment configuration and redeploy:
1. `/api/health/live` => 200
2. `/api/health/ready` => 200
3. `/api/ai/health` => configured/healthy
4. Login with `admin@theclinixai.com` on tenant `clinixai-prod`
5. PubMed search => screening => evidence persistence smoke test
6. Production release gate => passed
