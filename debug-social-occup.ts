const text = "Patient is a former smoker with 20 pack-year history, quit 5 years ago. Occasional alcohol use. Works as a construction worker.";

const occPatterns = [
  /(?:work(?:ed)?\s+as|occupation|job|employed\s+as|works?\s+as)\s+([^.]+)/gi,
  /\b(?:works?\s+as|employed\s+as)\s+([^.]+)/gi,
  /(?:work(?:ed)?\s+as|occupation|job|employed\s+as|works?\s+as)\s+([^.]*\.?$)/gi,
];

for (const pattern of occPatterns) {
  const match = text.match(pattern);
  console.log('Pattern:', pattern);
  console.log('Match:', match);
  if (match) {
    console.log('Group 1:', match[1]);
    console.log('Group 1 trimmed:', match[1]?.trim());
  }
}