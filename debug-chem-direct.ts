// Direct test of the chemical overlap function logic
function findChemicalOverlapMatches(records: any[], threshold: number): any[] {
    const matches: any[] = [];

    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const a = records[i];
        const b = records[j];

        const chemicalsA = new Set((a.chemicals || []).map(c => c.toLowerCase()));
        const chemicalsB = new Set((b.chemicals || []).map(c => c.toLowerCase()));

        if (chemicalsA.size === 0 || chemicalsB.size === 0) continue;

        const intersection = new Set([...chemicalsA].filter(x => chemicalsB.has(x)));
        const union = new Set([...chemicalsA, ...chemicalsB]);
        const jaccard = intersection.size / union.size;

        if (jaccard >= 0.6) {
          console.log('Match found! Jaccard:', jaccard);
          console.log('intersection:', [...intersection]);
          console.log('union:', [...union]);
        } else {
          console.log('No match. Jaccard:', jaccard);
        }
      }
    }

    return [];
}

const records = [
  {
    title: "DrugX and Liver Injury",
    abstract: "Study of DrugX hepatotoxicity",
    chemicals: ["DrugX", "MetaboliteY"],
    source: "PUBMED",
    source_id: "pubmed-555"
  },
  {
    title: "MetaboliteY Role in DrugX Toxicity",
    abstract: "Mechanism of MetaboliteY in DrugX-induced injury",
    chemicals: ["DrugX", "MetaboliteY", "CompoundZ"],
    source: "LOCAL",
    source_id: "local-002"
  }
];

findChemicalOverlapMatches(records, 0.6);