# Test Plan: [Feature/Sprint]

## Scope
- In: [features]
- Out: [explicit exclusions]

## Strategy
- Unit: [coverage target %]
- Integration: [key flows]
- E2E: [critical paths]
- Contract: [consumer-driven]

## Environments
| Env | Purpose | Data | Reset |
|-----|---------|------|-------|
| dev | Integration | Synthetic | Daily |
| staging | E2E/Perf | Prod-like | Per sprint |
| prod | Canary | Real | N/A |

## Exit Criteria
- All Must-pass tests: Pass
- Critical/High defects: 0
- Performance benchmarks: Met
- Security scan: Clean