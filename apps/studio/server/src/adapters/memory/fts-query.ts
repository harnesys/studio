/** Build a safe FTS5 MATCH query: quote each token for phrase-OR search. */
export function buildFtsMatchQuery(query: string): string | undefined {
  const tokens = query
    .trim()
    .split(/[^\p{L}\p{N}_]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return undefined;
  }
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"`).join(' OR ');
}
