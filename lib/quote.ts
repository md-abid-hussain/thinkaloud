/**
 * The quote check: evidence for "explained" must be the learner's own words.
 * Keep this in step with normalize_quote() in db/migrations/001_init.sql, which enforces the same rule.
 */
export function normalizeQuote(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export const MIN_QUOTE_LENGTH = 8;

export function quoteAppearsIn(quote: string, source: string): boolean {
  const q = normalizeQuote(quote);
  return q.length >= MIN_QUOTE_LENGTH && normalizeQuote(source).includes(q);
}
