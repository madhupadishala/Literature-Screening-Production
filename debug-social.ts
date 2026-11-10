const text = "Patient is a former smoker with 20 pack-year history, quit 5 years ago. Occasional alcohol use. Works as a construction worker.";

const smokingPatterns = [
  { pattern: /\b(never\s+smoked|non-?smoker|non-smoker|never smoked)\b/gi, status: 'NEVER' as const },
  { pattern: /\b(former\s+smoker|ex-?smoker|quit\s+smoking|stopped\s+smoking|quit\s+smoking)\b/gi, status: 'FORMER' as const },
  { pattern: /\b(current\s+smoker|smokes|smoking|smoker)\b/gi, status: 'CURRENT' as const },
];

let smoking: 'NEVER' | 'FORMER' | 'CURRENT' | 'UNKNOWN' = 'UNKNOWN';

for (const pattern of smokingPatterns) {
  if (pattern.pattern.test(text)) {
    console.log('Matched pattern:', pattern.status);
    console.log('Pattern regex:', pattern.pattern);
    break;
  }
}

// Pack years - improved regex
const packYearMatch = text.match(/(\d+(?:\.\d+)?)\s*pack.?years?/gi);
console.log('Pack year match:', packYearMatch);
if (packYearMatch) {
  console.log('Pack years:', parseFloat(packYearMatch[1]));
}

// Alcohol - fixed patterns
const text = "Patient is a former smoker with 20 pack-year history, quit 5 years ago. Occasional alcohol use. Works as a construction worker.";
let alcohol: 'NONE' | 'OCCASIONAL' | 'MODERATE' | 'HEAVY' | 'UNKNOWN' = 'UNKNOWN';
if (/\b(heavy\s+drinker|alcohol\s+abuse|alcoholic|heavy\s+alcohol)\b/gi.test(text)) alcohol = 'HEAVY';
else if (/\b(moderate\s+drinker|social\s+drinker)\b/gi.test(text) || /\b(moderate\s+alcohol)\b/gi.test(text)) alcohol = 'MODERATE';
else if (/\b(occasional\s+drinker|social\s+drinking)\b/gi.test(text) || /\b(occasional\s+alcohol|social\s+drinking)\b/gi.test(text)) alcohol = 'OCCASIONAL';
else if (/\b(teetotaler|non-?drinker|no\s+alcohol|non-drinker)\b/gi.test(text)) alcohol = 'NONE';

console.log('Alcohol:', alcohol);

// Occupation
const text2 = "Patient is a former smoker with 20 pack-year history, quit 5 years ago. Occasional alcohol use. Works as a construction worker.";
const occPatterns = [
  /(?:work(?:ed)?\s+as|occupation|job|employed\s+as|works?\s+as)\s+([^.]+)/gi,
  /\b(?:works?\s+as|employed\s+as)\s+([^.]+)/gi,
];
let occupation: string | undefined;
for (const pattern of [
  /(?:work(?:ed)?\s+as|occupation|job|employed\s+as|works?\s+as)\s+([^.]+)/gi,
  /\b(?:works?\s+as|employed\s+as)\s+([^.]+)/gi,
]) {
  const match = text.match(pattern);
  if (match) {
    console.log('Occupation match:', match[1]);
    break;
  }
}
" 2>&1