"""Exact-span evaluation against independently adjudicated labels.
python -m event_agent.benchmark gold.json predictions.json
Both JSON arrays contain case_id, patient_id, document_id, block_id, start, end.
patient_id uses document-scoped identity; offsets are block-relative.
"""
import json
import sys

def evaluate(gold, predictions):
    fields = ("case_id", "patient_id", "document_id", "block_id", "start", "end")
    def keys(rows):
        result = [tuple(row[f] for f in fields) for row in rows]
        if len(set(result)) != len(result):
            raise ValueError("duplicate benchmark records")
        return set(result)
    g, p = keys(gold), keys(predictions)
    tp, fp, fn = len(g & p), len(p - g), len(g - p)
    return {"gold_events": len(g), "predicted_events": len(p), "true_positive": tp,
            "false_positive": fp, "false_negative": fn,
            "precision": tp / (tp + fp) if tp + fp else None,
            "recall": tp / (tp + fn) if tp + fn else None,
            "f1": 2*tp/(2*tp+fp+fn) if 2*tp+fp+fn else None,
            "missed": [dict(zip(fields, k)) for k in sorted(g-p)],
            "extra": [dict(zip(fields, k)) for k in sorted(p-g)],
            "clinical_qualification": False}

if __name__ == "__main__":
    print(json.dumps(evaluate(json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))), indent=2))

def evaluate_coding(gold, predictions):
    """Concept-level LLT/PT evaluation; no autonomous clinical qualification."""
    def index(rows):
        values = {}
        for row in rows:
            key = (row["case_id"], row["concept_id"])
            if key in values:
                raise ValueError("duplicate coding concept")
            values[key] = row
        return values
    from Agentic_AI.shared.validation import exact_concept_score
    shared_score = exact_concept_score(gold, predictions, fields=("pt_code", "llt_code"))
    g, p = index(gold), index(predictions)
    common = g.keys() & p.keys()
    pt = sum(bool(g[k].get("pt_code")) and g[k]["pt_code"] == p[k].get("pt_code") for k in common)
    llt = sum(bool(g[k].get("llt_code")) and g[k]["llt_code"] == p[k].get("llt_code") for k in common)
    return {"gold_concepts": len(g), "predicted_concepts": len(p),
            "missing_concepts": len(g.keys()-p.keys()), "extra_concepts": len(p.keys()-g.keys()),
            "pt_correct": pt, "llt_correct": llt,
            "pt_recall": pt / len(g) if g else None,
            "llt_recall": llt / len(g) if g else None,
            "clinical_qualification": False}
