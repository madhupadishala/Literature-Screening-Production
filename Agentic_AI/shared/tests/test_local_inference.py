"""Local-only PV inference cannot access cloud model endpoints."""
import pytest
from Agentic_AI.shared.local_inference import (
    LocalInferenceUnavailable, LocalOnlyMedicalLLM, require_loopback_endpoint,
)

@pytest.mark.parametrize("url",[
    "https://api.openai.com/v1", "https://api.groq.com/openai/v1",
    "http://10.0.0.3:11434/v1", "http://ollama:11434/v1",
    "http://169.254.169.254:80/v1", "https://127.0.0.1:11434/v1",
    "http://localhost:11434@evil.example:80/v1",
    "http://127.0.0.1:11434/v1?next=https://api.openai.com",
])
def test_remote_or_ambiguous_endpoint_blocked(url):
    with pytest.raises(LocalInferenceUnavailable):
        require_loopback_endpoint(url)

@pytest.mark.parametrize("url",[
    "http://127.0.0.1:11434/v1", "http://localhost:11434/v1",
    "http://[::1]:11434/v1",
])
def test_loopback_only(url):
    assert require_loopback_endpoint(url) == url

def test_model_denied_by_default(monkeypatch):
    monkeypatch.delenv("NEXUS_PV_INFERENCE_MODE",raising=False)
    monkeypatch.setenv("NEXUS_PV_LOCAL_OPENAI_BASE_URL","http://127.0.0.1:11434/v1")
    monkeypatch.setenv("NEXUS_PV_LOCAL_MODEL","local-test")
    with pytest.raises(LocalInferenceUnavailable):
        LocalOnlyMedicalLLM()

def test_malformed_model_endpoint_denied(monkeypatch):
    monkeypatch.setenv("NEXUS_PV_INFERENCE_MODE","local_only")
    monkeypatch.setenv("NEXUS_PV_LOCAL_OPENAI_BASE_URL","https://api.groq.com/openai/v1")
    monkeypatch.setenv("NEXUS_PV_LOCAL_MODEL","local-test")
    with pytest.raises(LocalInferenceUnavailable):
        LocalOnlyMedicalLLM()
