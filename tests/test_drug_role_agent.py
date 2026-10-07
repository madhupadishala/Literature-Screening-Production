from backend.agents.drug_role import DrugRoleOrchestrator, DrugRole, Ownership


def test_core_role_and_ownership_classification():
    text = (
        "The patient had been receiving Metformin chronically for diabetes. "
        "Amoxicillin was suspected of causing urticaria and was discontinued after the reaction. "
        "Cetirizine was administered for treatment of the rash."
    )

    agent = DrugRoleOrchestrator()
    result = agent.classify(
        case_id="ICSR-001",
        tenant_id="tenant-a",
        source_type="spontaneous",
        text=text,
        candidate_drugs=["Metformin", "Amoxicillin", "Cetirizine"],
        company_products=[
            {
                "trade_name": "Amoxicillin",
                "aliases": [],
                "active_ingredients": ["amoxicillin"],
            }
        ],
    )

    by_name = {x.normalized_name.lower(): x for x in result.classifications}

    assert by_name["amoxicillin"].role == DrugRole.SUSPECT
    assert by_name["amoxicillin"].ownership == Ownership.COMPANY
    assert by_name["cetirizine"].role == DrugRole.TREATMENT
    assert by_name["metformin"].role == DrugRole.CONCOMITANT


def test_absence_from_product_master_does_not_force_non_company():
    text = "DrugX was suspected of causing rash."
    agent = DrugRoleOrchestrator()
    result = agent.classify(
        case_id="ICSR-002",
        tenant_id="tenant-a",
        source_type="literature",
        text=text,
        candidate_drugs=["DrugX"],
        company_products=[],
    )

    item = result.classifications[0]
    assert item.role == DrugRole.SUSPECT
    assert item.ownership == Ownership.UNKNOWN


def test_historical_and_treatment_are_separate_from_suspect():
    text = (
        "The patient previously received Carbamazepine five years ago. "
        "Prednisolone was given for treatment of the reaction."
    )
    agent = DrugRoleOrchestrator()
    result = agent.classify(
        case_id="ICSR-003",
        tenant_id="tenant-a",
        source_type="literature",
        text=text,
        candidate_drugs=["Carbamazepine", "Prednisolone"],
    )

    by_name = {x.normalized_name.lower(): x for x in result.classifications}
    assert by_name["carbamazepine"].role == DrugRole.HISTORICAL
    assert by_name["prednisolone"].role == DrugRole.TREATMENT
