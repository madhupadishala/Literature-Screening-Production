export function normalizeProductIdentityText(value: string | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Conservatively separates a trailing strength expression from a source-exact
 * Product Master identity. This is not fuzzy matching: exactly one configured
 * source-present term must be a prefix and the remainder must contain only
 * numeric strength tokens/units.
 */
export function stripTrailingStrengthQualifier(input: {
  reportedProduct: string;
  sourceExactTerms: string[];
}): string | undefined {
  const reportedNormalized = normalizeProductIdentityText(input.reportedProduct);
  if (!reportedNormalized) return undefined;

  const candidates = input.sourceExactTerms.flatMap((term) => {
    const normalizedTerm = normalizeProductIdentityText(term);
    if (
      !normalizedTerm ||
      reportedNormalized === normalizedTerm ||
      !reportedNormalized.startsWith(normalizedTerm + " ")
    ) {
      return [];
    }

    const remainder = reportedNormalized.slice(normalizedTerm.length).trim();
    const tokens = remainder.split(" ").filter(Boolean);
    if (tokens.length === 0 || tokens.length > 6) return [];

    const strengthUnit =
      /^(?:mg|g|mcg|ug|ml|l|iu|unit|units|meq|mmol|mol|percent)$/i;
    const numberToken = /^\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?$/;
    const connector = /^(?:per|x)$/i;

    const strengthLike =
      tokens.some((token) => numberToken.test(token)) &&
      tokens.every(
        (token) =>
          numberToken.test(token) ||
          strengthUnit.test(token) ||
          connector.test(token),
      );

    return strengthLike ? [term] : [];
  });

  const unique = [
    ...new Map(
      candidates.map((candidate) => [
        normalizeProductIdentityText(candidate),
        candidate,
      ]),
    ).values(),
  ];

  return unique.length === 1 ? unique[0] : undefined;
}
