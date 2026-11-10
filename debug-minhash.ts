// Test MinHash directly
class MinHash {
  private readonly numHashes: number;
  private readonly seeds: number[];

  constructor(numHashes: number = 128) {
    this.numHashes = numHashes;
    this.seeds = Array.from({ length: numHashes }, (_, i) => i * 31 + 17);
  }

  getSignature(tokens: string[]): number[] {
    console.log('tokens:', tokens);
    console.log('numHashes:', this.numHashes);

    const signature = new Array(this.numHashes).fill(Infinity);
    for (const token of tokens) {
      const tokenHash = this.hashToken(token);
      console.log('token:', token, 'tokenHash:', tokenHash);
      for (let i = 0; i < this.numHashes; i++) {
        const hash = this.mix(tokenHash, this.seeds[i]);
        if (hash < signature[i]) signature[i] = hash;
      }
    }
    return signature;
  }

  static jaccardSimilarity(sigA: number[], sigB: number[]): number {
    let matches = 0;
    for (let i = 0; i < sigA.length; i++) {
      if (sigA[i] === sigB[i]) matches++;
    }
    return matches / sigA.length;
  }

  private hashToken(token: string): number {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  private mix(hash: number, seed: number): number {
    let h = hash ^ seed;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h ^= h >>> 16;
    return h >>> 0;
  }
}

const minHash = new MinHash(128);

// Test with tokens from the records
const tokens1 = ["drugx", "and", "liver", "injury", "study", "of", "drugx", "hepatotoxicity", "metabolitey"];
const tokens2 = ["metabolitey", "role", "in", "drugx", "toxicity", "mechanism", "of", "metabolitey", "in", "drugx-induced", "injury", "compoundz"];

console.log('tokens1:', tokens1);
console.log('tokens2:', tokens2);

const sig1 = minHash.getSignature(tokens1);
console.log('sig1 length:', sig1.length, 'first 5:', sig1.slice(0, 5));

const sig2 = minHash.getSignature(tokens2);
console.log('sig2 length:', sig2.length, 'first 5:', sig2.slice(0, 5));

function jaccardSimilarity(sigA: number[], sigB: number[]): number {
  let matches = 0;
  for (let i = 0; i < sigA.length; i++) {
    if (sigA[i] === sigB[i]) matches++;
  }
  return matches / sigA.length;
}

console.log('Similarity:', jaccardSimilarity(sig1, sig2));