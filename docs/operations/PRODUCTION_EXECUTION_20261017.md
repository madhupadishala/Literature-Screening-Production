# Production execution — 17 October 2026

Supersedes the prepared-only status in SUBMISSIONS_AND_RENDER_RESOLUTION_20261017.md.

## Submissions access applied

Executed the approved grant script through a single Postgres transaction on old-mountain-48148190 / br-muddy-tooth-b3186ol1 / literature_screening_prod. Connection credentials were resolved by the database connector rather than exposed to a shell command.

Confirmed afterward for support@theclinixai.com in clinixai-prod / clinixai-prod-primary / PROD:

- Tenant Submissions entitlement: enabled.
- Workspace Submissions entitlement: enabled.
- MODULE_VIEWER: active.
- The actual navigation-access query returns CASE_PROCESSING, INTAKE, LITERATURE, SUBMISSIONS.

Grant history is recorded by the approved script. No tenant, user, case or other PV record was deleted. Viewer assignment does not enable submission creation or transmission.

## Render synchronized

Published and deployed 4417031e695056404fb3269ca6ae950fcb349cba, retaining the reviewed Vercel release and operations scripts. Render deploy dep-db9avdqjnfac73bk1s00 completed live. The existing tracked integration branch was fast-forwarded to the reviewed release; no force push or history replacement was used.

The connector exposes deploy but no service-settings PATCH, and no Render API key was available in the runner. Accordingly the service branch name and healthCheckPath field were not changed. The implemented compatibility fix makes both GET/HEAD / and /healthz pure liveness endpoints. The default root probe no longer receives a clinical-disabled 503. /readyz still checks audit and token-scope configuration and can return 503 when dependencies fail. Clinical routes remain disabled under the existing gate.

This is an operational fallback, not a claim that the dashboard's explicit healthCheckPath is now /healthz. The deployment script now pins 4417031e (including the root-liveness fix) and remains available to make that provider-side setting change when run with an injected Render API key.

## Compact case worklist and navigation

- Moved navigation styles to CSS modules so Next Link elements receive their styles.
- Flat header, full tenant/client/user/role labels, nonwrapping System Health, and compact module navigation.
- Worklist uses 16px container padding, 12px gaps, 32px controls, 36px table rows, 12px body/column labels, 14px titles, crisp borders and 3px radii.
- Case/intake metadata is presented in one-line cells with intake ID available as the case link's title.
- Sticky table headings and contained horizontal scrolling on narrow screens.
- Loading/error counts use an em dash; request failures cannot masquerade as a zero-case worklist. Empty-data and filter-no-match states are distinct. Aborted requests cannot restore stale case data.
- Context authorization remains server-enforced. The Submissions navigation click posts the new signed context before navigation.

## Verification

- Nine Python WSGI runtime contracts passed, including root GET/HEAD while clinical execution is disabled.
- Twenty-one auth/context integration tests passed with mocked database/credentials.
- Chromium browser checks passed with synthetic API fixtures at 1920, 1280, 768 and 390px. Assertions cover row height, page overflow, full client labels, styled/nonwrapping health links, metrics, filtering, error/retry/empty states, and scoped Submissions navigation.
- TypeScript, targeted ESLint, git diff checks and the optimized production build passed.
- Browser fixture cases were not written to the production database. These checks do not qualify the clinical algorithms or establish all 27 agents executing.

Reproduce the UI test after a frontend production build and installing Chromium for Playwright:

```sh
cd frontend
NEXUS_TEST_START_SERVER=1 npm run test:ui:cases
```

An existing browser binary can be supplied through PLAYWRIGHT_CHROMIUM_EXECUTABLE. NEXUS_UI_SCREENSHOTS optionally records internal test screenshots; they contain synthetic cases only.
