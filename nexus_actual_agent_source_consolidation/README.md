# Nexus uploaded agent consolidation

This archive contains the **actual extracted source** of the eight-agent Kimi package and the five-agent nested v2 package. Its standalone included pytest suites passed: **33** and **9** tests respectively.

It does **not** prove Nexus integration, clinical qualification, or Vercel readiness. Its implementation files have not yet been committed to the Nexus GitHub repository. Previous Nexus agents are already in the repository and are not copied into this archive.

Run tests:

```bash
cd packages/kimi_8/nexus_pv_agents && PYTHONPATH=. python -m pytest -q tests
cd packages/v2_5/nexus_agents_v2 && PYTHONPATH=. python -m pytest -q tests
```

The ZIP is a source transfer package, not a production-ready Vercel application.
