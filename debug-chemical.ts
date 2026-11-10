// Test chemical overlap Jaccard calculation
const chemicalsA = new Set(["DrugX", "MetaboliteY"].map(c => c.toLowerCase()));
const chemicalsB = new Set(["DrugX", "MetaboliteY", "CompoundZ"].map(c => c.toLowerCase()));

console.log('chemicalsA:', [...chemicalsA]);
console.log('chemicalsB:', [...chemicalsB]);

const intersection = new Set([...chemicalsA].filter(x => chemicalsB.has(x)));
const union = new Set([...chemicalsA, ...chemicalsB]);

console.log('intersection:', [...intersection]);
console.log('union:', [...union]);
console.log('intersection size:', intersection.size);
console.log('union size:', union.size);
console.log('Jaccard:', intersection.size / union.size);