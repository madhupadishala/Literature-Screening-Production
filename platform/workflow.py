WORKFLOW_ORDER = ["Hits", "Screening", "Intake", "QC", "Reports"]

def next_stage(stage):
    if stage not in WORKFLOW_ORDER:
        return "Hits"

    index = WORKFLOW_ORDER.index(stage)

    if index == len(WORKFLOW_ORDER) - 1:
        return stage

    return WORKFLOW_ORDER[index + 1]

def previous_stage(stage):
    if stage not in WORKFLOW_ORDER:
        return "Hits"

    index = WORKFLOW_ORDER.index(stage)

    if index == 0:
        return stage

    return WORKFLOW_ORDER[index - 1]
