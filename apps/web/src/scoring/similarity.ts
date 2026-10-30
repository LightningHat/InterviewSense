export function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

export function splitIntoSentences(text: string): string[] {
  if (!text || text.trim().length === 0) return [];
  // Split on sentence boundaries (., !, ?, newline) while preserving meaningful clauses
  const rawSentences = text
    .split(/(?<=[.?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // If text doesn't contain terminal punctuation, split by commas/conjunctions if long
  if (rawSentences.length === 1 && rawSentences[0].length > 100) {
    const clauses = rawSentences[0]
      .split(/,\s+|\s+(?:and|but|while|whereas|because)\s+/i)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    return clauses.length > 1 ? clauses : rawSentences;
  }

  return rawSentences;
}

export function checkKeywords(text: string, keywords?: string[]): boolean {
  if (!keywords || keywords.length === 0) return false;
  const lowerText = text.toLowerCase();
  for (const kw of keywords) {
    const cleanKw = kw.trim().toLowerCase();
    if (!cleanKw) continue;
    // Word boundary or substring match for technical acronyms/terms
    const regex = new RegExp(`(^|[^a-z0-9])${cleanKw}([^a-z0-9]|$)`, 'i');
    if (regex.test(lowerText) || lowerText.includes(cleanKw)) {
      return true;
    }
  }
  return false;
}

