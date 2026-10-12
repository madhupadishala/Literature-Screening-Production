import os

BASE_DIR = "backend/shared_agents"

agents = [
    "adverse_event", "drug_role", "seriousness", "causality", "listedness",
    "country_incidence", "patient", "reporter", "day_zero", "historical_classification",
    "lit_duplicate", "icsr_duplicate", "followup_questionnaire", "inclusion_exclusion",
    "action_taken", "dechallenge", "rechallenge", "medical_history", "literature_screening",
    "icsr_validity", "product_identity", "article_retrieval", "narrative",
    "pregnancy_special", "indication", "event_outcome", "regulatory_clock"
]

special_helpers = {
    "product_identity": ["helpers.py"],
    "narrative": ["helpers.py"],
    "article_retrieval": ["fulltext_fetcher.py"]
}

placeholder_agent = """def run_agent(input_data):
    \"\"\"Placeholder for agent logic.\"\"\"
    return {"result": None}
"""

placeholder_contract = """schema = {
    "result": "string"
}
"""

placeholder_test = """import pytest
from backend.shared_agents.{agent}.agent import run_agent

def test_run_agent_placeholder():
    result = run_agent({})
    assert "result" in result
"""

placeholder_readme = """# {agent} Agent

## Capability
Describe the agent’s purpose here.

## Dependencies
- List dependencies here

## Module Consumers
- List consuming modules here

## Qualification State
Pending
"""

for agent in agents:
    agent_dir = os.path.join(BASE_DIR, agent)
    os.makedirs(os.path.join(agent_dir, "tests"), exist_ok=True)

    # agent.py
    with open(os.path.join(agent_dir, "agent.py"), "w") as f:
        f.write(placeholder_agent)

    # contract.py
    with open(os.path.join(agent_dir, "contract.py"), "w") as f:
        f.write(placeholder_contract)

    # tests
    with open(os.path.join(agent_dir, "tests", f"test_{agent}.py"), "w") as f:
        f.write(placeholder_test.format(agent=agent))

    # README.md
    with open(os.path.join(agent_dir, "README.md"), "w") as f:
        f.write(placeholder_readme.format(agent=agent.replace("_", " ").title()))

    # special helpers
    if agent in special_helpers:
        for helper in special_helpers[agent]:
            with open(os.path.join(agent_dir, helper), "w") as f:
                f.write("# Placeholder for helper functions\n")
