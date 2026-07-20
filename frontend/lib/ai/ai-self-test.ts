import { getAISettings } from "./ai-settings";
import { validateAIRuntime } from "./runtime-validator";
import { parseHitsAIResult } from "./hits-result-parser";
import { parseScreeningAIResult } from "./screening-result-parser";

export interface AISelfTestCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface AISelfTestResult {
  passed: boolean;
  provider: string;
  model: string;
  checks: AISelfTestCheck[];
  executedAt: string;
}

export function runAISelfTest(): AISelfTestResult {
  const settings = getAISettings();
  const runtimeValidation = validateAIRuntime();

  const hitsResult = parseHitsAIResult(JSON.stringify({
    isHit: true,
    confidence: 0.91,
    classification: "hit",
    reasons: ["Safety information detected."],
    detectedProducts: ["Example Product"],
    detectedEvents: ["Example Event"],
    detectedSpecialSituations: [],
    recommendedNextStep: "send_to_screening",
  }));

  const screeningResult = parseScreeningAIResult(JSON.stringify({
    decision: "INCLUDE",
    confidence: 91,
    reason: "ADVERSE_EVENT",
    findings: [
      {
        rule: "Adverse Event",
        passed: true,
        score: 91,
        comment: "Adverse event identified.",
      },
    ],
  }));

  const checks: AISelfTestCheck[] = [
    {
      name: "runtime_configuration",
      passed: runtimeValidation.valid,
      message: runtimeValidation.valid
        ? "AI runtime configuration is valid."
        : "AI runtime configuration contains failures.",
    },
    {
      name: "hits_parser",
      passed:
        hitsResult.isHit &&
        hitsResult.classification === "hit" &&
        hitsResult.recommendedNextStep === "send_to_screening",
      message: "Hits parser produced a normalized result.",
    },
    {
      name: "screening_parser",
      passed:
        screeningResult.decision === "INCLUDE" &&
        screeningResult.reason === "ADVERSE_EVENT" &&
        screeningResult.confidence === 91,
      message: "Screening parser produced a normalized result.",
    },
  ];

  return {
    passed: checks.every((check) => check.passed),
    provider: settings.provider,
    model: settings.model,
    checks,
    executedAt: new Date().toISOString(),
  };
}
