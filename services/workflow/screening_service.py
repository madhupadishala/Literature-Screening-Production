import pandas as pd

def run_screening(records_df):
    processed = []

    for _, row in records_df.iterrows():
        title = str(row.get("Title", "")).lower()
        abstract = str(row.get("Abstract", "")).lower()

        if any(word in title or word in abstract for word in ["death", "fatal", "life-threatening"]):
            decision = "Include"
            classification = "Literature; Serious"
            confidence = 95
            reason = "Serious safety signal detected."
        elif any(word in title or word in abstract for word in ["pregnancy", "foetal", "fetal"]):
            decision = "Include"
            classification = "Literature; Pregnancy Report"
            confidence = 90
            reason = "Pregnancy exposure/special situation detected."
        elif any(word in title or word in abstract for word in ["adverse", "toxicity", "injury", "reaction"]):
            decision = "Include"
            classification = "Literature; Possible ICSR"
            confidence = 88
            reason = "Possible adverse event detected."
        else:
            decision = "Needs Review"
            classification = "Literature; Review Required"
            confidence = 70
            reason = "Insufficient evidence for automatic exclusion."

        item = row.to_dict()
        item.update({
            "Decision": decision,
            "Outcome": "ICSR" if decision == "Include" else "Review",
            "Classification": classification,
            "Confidence": confidence,
            "Rationale": reason,
            "Current_Stage": "Intake" if decision == "Include" else "Screening",
            "Status": "Screened",
        })

        processed.append(item)

    return pd.DataFrame(processed)
