import type {
  ActualValidationOutput,
  ExpectedValidationOutput,
  FieldValidationResult,
  ScenarioValidationResult,
  ValidationCategory,
  ValidationSeverity,
} from "../types/ValidationTypes";

type ComparableValue = string | number | boolean | string[] | number[] | undefined | null;

function normalizeString(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeArray(value: unknown[]): string[] {
  return value
    .filter((item): item is string | number | boolean => item !== null && item !== undefined)
    .map((item) => normalizeString(String(item)))
    .filter(Boolean)
    .sort();
}

function valuesMatch(expected: ComparableValue, actual: ComparableValue): boolean {
  if (expected === undefined || expected === null) {
    return actual === undefined || actual === null;
  }

  if (Array.isArray(expected)) {
    const expectedArray = normalizeArray(expected);
    const actualArray = Array.isArray(actual) ? normalizeArray(actual) : [];

    if (expectedArray.length === 0) {
      return actualArray.length === 0;
    }

    return expectedArray.every((item) => actualArray.includes(item));
  }

  if (typeof expected === "boolean") {
    return Boolean(actual) === expected;
  }

  return normalizeString(String(expected)) === normalizeString(String(actual ?? ""));
}

function calculateSetMetrics(expected: string[], actual: string[]) {
  const expectedSet = new Set(normalizeArray(expected));
  const actualSet = new Set(normalizeArray(actual));

  let truePositive = 0;

  for (const item of actualSet) {
    if (expectedSet.has(item)) {
      truePositive += 1;
    }
  }

  const falsePositive = Math.max(actualSet.size - truePositive, 0);
  const falseNegative = Math.max(expectedSet.size - truePositive, 0);

  const precision =
    truePositive + falsePositive === 0 ? 1 : truePositive / (truePositive + falsePositive);

  const recall =
    truePositive + falseNegative === 0 ? 1 : truePositive / (truePositive + falseNegative);

  const f1Score =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    precision,
    recall,
    f1Score,
  };
}

function getSeverity(matched: boolean, confidence?: number): ValidationSeverity {
  if (matched && confidence !== undefined && confidence < 0.75) return "WARNING";
  if (matched) return "PASS";
  return "FAIL";
}

export class AccuracyCalculator {
  static compareScenario(params: {
    scenarioId: string;
    title: string;
    category: ValidationCategory;
    expected: ExpectedValidationOutput;
    actual: ActualValidationOutput;
  }): ScenarioValidationResult {
    const { scenarioId, title, category, expected, actual } = params;

    const fieldResults: FieldValidationResult[] = [];
    const expectedKeys = Object.keys(expected) as Array<keyof ExpectedValidationOutput>;

    for (const field of expectedKeys) {
      const expectedValue = expected[field] as ComparableValue;
      const actualValue = actual[field] as ComparableValue;
      const matched = valuesMatch(expectedValue, actualValue);

      fieldResults.push({
        field,
        expected: expectedValue,
        actual: actualValue,
        matched,
        confidence: actual.confidence,
        severity: getSeverity(matched, actual.confidence),
        comment: matched ? "Matched expected output." : "Did not match expected output.",
      });
    }

    const totalFields = fieldResults.length;
    const matchedFields = fieldResults.filter((field) => field.matched).length;

    const accuracy = totalFields === 0 ? 1 : matchedFields / totalFields;

    const arrayMetricFields: Array<keyof ExpectedValidationOutput> = [
      "productNames",
      "companyProducts",
      "adverseEvents",
      "medicalHistory",
      "concomitantDrugs",
      "treatmentDrugs",
    ];

    const arrayMetrics = arrayMetricFields.map((field) => {
      const expectedArray = Array.isArray(expected[field]) ? (expected[field] as string[]) : [];
      const actualArray = Array.isArray(actual[field]) ? (actual[field] as string[]) : [];
      return calculateSetMetrics(expectedArray, actualArray);
    });

    const precision =
      arrayMetrics.length === 0
        ? accuracy
        : arrayMetrics.reduce((sum, metric) => sum + metric.precision, 0) / arrayMetrics.length;

    const recall =
      arrayMetrics.length === 0
        ? accuracy
        : arrayMetrics.reduce((sum, metric) => sum + metric.recall, 0) / arrayMetrics.length;

    const f1Score =
      precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    const failedFields = fieldResults.filter((field) => field.severity === "FAIL").length;
    const warningFields = fieldResults.filter((field) => field.severity === "WARNING").length;

    const status: ValidationSeverity =
      failedFields > 0 ? "FAIL" : warningFields > 0 ? "WARNING" : "PASS";

    return {
      scenarioId,
      title,
      category,
      status,
      fieldResults,
      accuracy,
      precision,
      recall,
      f1Score,
      confidence: actual.confidence,
      warnings: actual.warnings ?? [],
      evidence: actual.evidence ?? [],
    };
  }

  static aggregate(results: ScenarioValidationResult[]) {
    const total = results.length;

    if (total === 0) {
      return {
        passed: 0,
        warnings: 0,
        failed: 0,
        overallAccuracy: 0,
        overallPrecision: 0,
        overallRecall: 0,
        overallF1Score: 0,
        averageConfidence: undefined,
      };
    }

    const passed = results.filter((result) => result.status === "PASS").length;
    const warnings = results.filter((result) => result.status === "WARNING").length;
    const failed = results.filter((result) => result.status === "FAIL").length;

    const overallAccuracy =
      results.reduce((sum, result) => sum + result.accuracy, 0) / total;

    const overallPrecision =
      results.reduce((sum, result) => sum + result.precision, 0) / total;

    const overallRecall =
      results.reduce((sum, result) => sum + result.recall, 0) / total;

    const overallF1Score =
      results.reduce((sum, result) => sum + result.f1Score, 0) / total;

    const confidenceValues = results
      .map((result) => result.confidence)
      .filter((value): value is number => typeof value === "number");

    const averageConfidence =
      confidenceValues.length === 0
        ? undefined
        : confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length;

    return {
      passed,
      warnings,
      failed,
      overallAccuracy,
      overallPrecision,
      overallRecall,
      overallF1Score,
      averageConfidence,
    };
  }
}