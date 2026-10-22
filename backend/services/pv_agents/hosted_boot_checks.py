"""One-time synthetic staging acceptance from INSIDE the hosted WSGI worker.

No network client or external credential holder is required. The server reads its
own staging-only secret and invokes the exact hosted WSGI route handlers. This is
NOT external-HTTP/TLS acceptance, model qualification, or real-client KB isolation.
Never print the token, synthetic source content, or audit payloads.
"""
import io
import json
import logging
import os
import secrets

LOG = logging.getLogger("nexus.staging.boot_acceptance")

def run_hosted_checks(application):
    if (os.environ.get("RENDER") != "true" or
        os.environ.get("NEXUS_PV_STAGING_PROBE_ENABLED") != "true" or
        os.environ.get("NEXUS_PV_AGENTS_ENABLED") == "true"):
        return
    token = os.environ.get("NEXUS_PV_STAGING_DIAGNOSTIC_TOKEN", "")
    if len(token) < 64:
        LOG.warning("staging_acceptance unavailable: diagnostic_token_not_configured")
        return

    def post(path, bearer):
        body = json.dumps({"request_id": "renderboot-" + secrets.token_hex(10)}).encode()
        env = {"REQUEST_METHOD": "POST", "PATH_INFO": path, "CONTENT_LENGTH": str(len(body)),
               "wsgi.input": io.BytesIO(body)}
        if bearer is not None:
            env["HTTP_AUTHORIZATION"] = "Bearer " + bearer
        response = {}
        def start(status, headers):
            response["status"] = int(status.split()[0])
        result = json.loads(b"".join(application(env, start)))
        return response["status"], result

    for label, path, bearer in (
        ("inventory", "/v1/staging/specialist-readiness", token),
        ("dispatch", "/v1/staging/synthetic-dispatch", token),
        ("composition", "/v1/staging/synthetic-composition", token),
        ("invalid_bearer", "/v1/staging/specialist-readiness", "invalid-token"),
        ("missing_bearer", "/v1/staging/synthetic-dispatch", None),
    ):
        try:
            status, body = post(path, bearer)
            expected = 200 if label in ("inventory", "dispatch", "composition") else 401
            valid = status == expected
            if label in ("inventory", "dispatch", "composition") and valid:
                valid = body.get("total_slots") == 27 and body.get("clinical_release_authorized") is False and bool(body.get("audit_id"))
            if label == "composition" and body.get("dry_run_slots_passed") != 27:
                valid = False
            LOG.warning(
                "staging_acceptance route=%s http_status=%d passed=%s slots=%s executed=%s audit_present=%s",
                label, status, str(valid).lower(),
                body.get("total_slots", "na") if valid else "na",
                body.get("executed_specialists", "na") if valid else "na",
                str(bool(body.get("audit_id"))).lower() if valid else "na",
            )
            if label == "composition" and valid:
                LOG.warning("synthetic_composition passed=%s python_engines=%s native_dependency_fixtures=%s clinical_release=false",
                    body.get("dry_run_slots_passed"),body.get("actual_python_engine_slots"),body.get("native_dependency_fixture_slots"))
        except Exception as exc:
            LOG.error("staging_acceptance route=%s failed_closed=%s", label, type(exc).__name__)
