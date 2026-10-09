"""Benchmark harness: runs each agent over the labeled corpus and reports
measured per-class precision / recall / F1 / false-negative rate.

Labels are scenario-design labels (not expert-adjudicated ground truth);
results are engineering regression indicators, NOT clinical qualification.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from nexus_agents.agents import (ActionTakenAgent, DechallengeAgent,
                                 FollowUpQuestionnaireAgent,
                                 InclusionExclusionAgent, IcsrDuplicateAgent,
                                 LiteratureDuplicateAgent, RechallengeAgent)
from nexus_agents.schemas import ICSR, LiteratureArticle


def prf(preds: list[str], labels: list[str]) -> dict:
    classes = sorted(set(labels) | set(preds))
    out, n = {}, len(labels)
    correct = sum(p == l for p, l in zip(preds, labels))
    for c in classes:
        tp = sum(p == l == c for p, l in zip(preds, labels))
        fp = sum(p == c and l != c for p, l in zip(preds, labels))
        fn = sum(l == c and p != c for p, l in zip(preds, labels))
        prec = tp / (tp + fp) if tp + fp else None
        rec = tp / (tp + fn) if tp + fn else None
        f1 = (2 * prec * rec / (prec + rec)) if prec and rec else None
        out[c] = {"precision": prec, "recall": rec, "f1": f1,
                  "fnr": (fn / (tp + fn)) if tp + fn else None, "support": sum(l == c for l in labels)}
    return {"n": n, "accuracy": round(correct / n, 3), "per_class": out}


def main() -> dict:
    corpus = json.loads((ROOT / "corpus" / "corpus.json").read_text())
    results = {"label_basis": corpus["label_basis"]}

    a = LiteratureDuplicateAgent()
    preds, labels = [], []
    for it in corpus["literature_pairs"]:
        preds.append(a.assess_pair(LiteratureArticle(**it["a"]),
                                   LiteratureArticle(**it["b"])).payload["relationship"])
        labels.append(it["label"])
    results["literature_duplicate_detection"] = prf(preds, labels)

    a = IcsrDuplicateAgent()
    preds, labels = [], []
    for it in corpus["icsr_pairs"]:
        preds.append(a.compare(ICSR(**it["a"]), ICSR(**it["b"])).payload["classification"])
        labels.append(it["label"])
    results["icsr_duplicate_detection"] = prf(preds, labels)

    a = InclusionExclusionAgent()
    preds, labels = [], []
    for it in corpus["screening"]:
        preds.append(a.screen(LiteratureArticle(**it["article"]), it["product_scope"],
                              duplicate_suspected=it.get("duplicate_suspected", False)
                              ).payload["flag"])
        labels.append(it["label"])
    results["inclusion_exclusion"] = prf(preds, labels)

    for name, cls, key, field in [
            ("action_taken", ActionTakenAgent, "action_taken", "e2b_gk8"),
            ("dechallenge", DechallengeAgent, "dechallenge", "dechallenge"),
            ("rechallenge", RechallengeAgent, "rechallenge", "rechallenge")]:
        agent = cls()
        preds, labels = [], []
        for it in corpus[key]:
            res = agent.assess(ICSR(**it["case"])) if key != "action_taken" \
                else agent.extract(ICSR(**it["case"]))
            container = (res.payload["actions"] if key == "action_taken"
                         else res.payload["drug_event_pairs"])
            preds.append(container[0][field])
            labels.append(it["label"])
        results[name] = prf(preds, labels)

    # follow-up gap recall (set-based, per case)
    agent = FollowUpQuestionnaireAgent()
    hits = tot = 0
    for it in corpus["followup"]:
        res = agent.generate(ICSR(**it["case"]))
        gaps = {q["gap"] for q in res.payload["questions"]}
        for g in it.get("expect_gaps", []):
            tot += 1; hits += g in gaps
        for g in it.get("expect_gaps_absent", []):
            tot += 1; hits += g not in gaps
    results["followup_questionnaire"] = {"n": tot, "gap_detection_accuracy": round(hits / tot, 3)}

    # ---- adversarial hold-out (agents not tuned against these) ----
    adv = corpus["adversarial"]
    adv_res = {}
    a = ActionTakenAgent()
    preds = [a.extract(ICSR(**it["case"])).payload["actions"][0]["e2b_gk8"] for it in adv["action_taken"]]
    adv_res["action_taken"] = {"metrics": prf(preds, [it["label"] for it in adv["action_taken"]]),
                               "predictions": preds}
    a = DechallengeAgent()
    preds = [a.assess(ICSR(**it["case"])).payload["drug_event_pairs"][0]["dechallenge"] for it in adv["dechallenge"]]
    adv_res["dechallenge"] = {"metrics": prf(preds, [it["label"] for it in adv["dechallenge"]]),
                              "predictions": preds}
    a = RechallengeAgent()
    preds = [a.assess(ICSR(**it["case"])).payload["drug_event_pairs"][0]["rechallenge"] for it in adv["rechallenge"]]
    adv_res["rechallenge"] = {"metrics": prf(preds, [it["label"] for it in adv["rechallenge"]]),
                              "predictions": preds}
    a = LiteratureDuplicateAgent()
    preds = [a.assess_pair(LiteratureArticle(**it["a"]), LiteratureArticle(**it["b"])).payload["relationship"]
             for it in adv["literature_pairs"]]
    adv_res["literature_duplicate_detection"] = {"metrics": prf(preds, [it["label"] for it in adv["literature_pairs"]]),
                                                 "predictions": preds}
    a = InclusionExclusionAgent()
    preds = [a.screen(LiteratureArticle(**it["article"]), it["product_scope"]).payload["flag"] for it in adv["screening"]]
    adv_res["inclusion_exclusion"] = {"metrics": prf(preds, [it["label"] for it in adv["screening"]]),
                                      "predictions": preds}
    results["adversarial_holdout"] = adv_res

    out = ROOT / "validation" / "benchmark_results.json"
    out.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    main()
