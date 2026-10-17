# Nexus 27 specialist execution contract — 15 October 2026

Engineering status only. **Do not state that all 27 agents are live.** Registry
presence, importability, injection ports and hosted operation are four different
levels of readiness.

## Dispatcher sources

- **7 original direct bindings:** AG01, AG06, AG14, AG15, AG21, AG22, AG23.
- **2 authorized-corpus duplicate bindings:** AG18, AG19 via
  `duplicate_repository`. They execute real recovered pair-comparison engines
  but the server must supply a SQL/RLS-enforced candidate repository before binding.
- **2 added direct bindings:** AG10 (translation, private configured provider for
  non-identical language pairs) and AG25 (structured ICSR minimum validity criteria).
  Both are review-only/unqualified.
- **4 injected recovered Python bindings:** AG03, AG04, AG09, AG24 via
  `approved_llm` using the shared `complete_json` contract. Do not bind without
  an approved private structured LLM service and evidence-grounding validation.
- **12 engine-specific internal service ports:** AG02, AG05, AG07, AG08, AG11,
  AG12, AG13, AG16, AG17, AG20, AG26, AG27 via `specialist_services`.
  These ports reject unrecognized agents, mismatched scope/identity, unsupported
  statuses and missing human review. They **do not** implement or confirm the
  underlying clinical specialist logic; connect actual native specialist engines
  (Python/TypeScript as appropriate) before marking any of these bound.

## Host registration prerequisites

The trusted Python host may call
`build_dispatcher(signing_secret=..., router=..., duplicate_repository=...,
approved_llm=..., specialist_services=...)`. All dependencies must be approved
server-owned objects; never permit browser-selected service names, endpoints or
knowledge scope. Optional dependencies omitted = corresponding specialists
**not bound**, not silently replaced by stubs.

## Release gates

1. Run shared Python tests at final SHA; preserve CI security controls.
2. Verify each recovered engine with synthetic source data and exact evidence spans.
3. Wire native service implementations to the 12 service ports with authenticated
   tenant+client isolation and source-based knowledge retrieval.
4. Verify downstream privacy (no patient data transmitted to unapproved providers),
   model selection, audit logs, failure handling and rate limits.
5. Test each of all 27 through signed dispatcher envelope on hosted staging; verify
   actual outputs and source citations rather than registry counts.
6. Require independent PV/QA/security sign-off before clinical autonomy.

R2 attachment roundtrip/isolation and feature activation remain deferred in issue #103.


## 15 October 2026 — implementation update

The earlier service-port inventory is superseded by the [27-agent hosted release plan](../../../docs/NEXUS_27_AGENT_LIVE_AND_DYNAMIC_KB_RELEASE_PLAN.md). Since that inventory, AG05, AG07, AG16 and AG27 gained real conservative, source-grounded Python processing engines registered by default. AG11 and AG13 gained opt-in injection for genuine recovered native pipelines with strict case/client checks; absence of approved pipelines leaves these specialists unbound. Six engines (AG02, AG08, AG12, AG17, AG20, AG26) still require integration into their approved native hosted runtimes, not just empty ports. Signed approved knowledge-folder hot-discovery was added to the shared KB router. **No hosted 27-agent qualification, autonomous clinical authorization or production activation is implied.**
