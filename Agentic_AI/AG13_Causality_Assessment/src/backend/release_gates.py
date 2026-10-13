"""Formal release gating for causality automation.

This module intentionally separates software readiness from clinical/regulatory qualification. A failed
or missing gate keeps causality in human-review mode.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class ReleaseEvidence:
    unit_tests_passed: bool
    audit_chain_verified: bool
    kb_snapshot_validated: bool
    controlled_policy_pinned: bool
    tenant_isolation_tested: bool
    e2e_regression_passed: bool
    real_expert_benchmark_passed: bool
    medical_rule_signoff: bool
    csv_validation_approved: bool
    security_review_passed: bool


MANDATORY = tuple(ReleaseEvidence.__dataclass_fields__.keys())


def evaluate_release(e: ReleaseEvidence) -> dict:
    values = asdict(e)
    failed = [k for k, v in values.items() if not v]
    return {
        "qualified": not failed,
        "failed_gates": failed,
        "passed_gates": [k for k, v in values.items() if v],
        "automation_allowed": not failed,
        "rule": "all mandatory causality release gates must pass",
    }
