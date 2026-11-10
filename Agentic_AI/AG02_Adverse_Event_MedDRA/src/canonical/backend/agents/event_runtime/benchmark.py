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
