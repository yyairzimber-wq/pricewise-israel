/** Normalise Hebrew/English text for matching: strip niqqud, quotes and punctuation. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[֑-ׇ]/g, "") // niqqud & cantillation
    .replace(/["'`׳״\-–—.,/\\()%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

/** Score how well `haystack` matches the query (0 = no match). */
export function matchScore(query: string, haystack: string): number {
  const q = tokens(query);
  if (!q.length) return 0;
  const hay = normalize(haystack);
  let score = 0;
  for (const t of q) {
    if (hay.includes(` ${t}`) || hay.startsWith(t)) score += 2;
    else if (hay.includes(t)) score += 1;
    else return 0;
  }
  return score;
}

export function isBarcode(text: string): boolean {
  return /^\d{8,14}$/.test(text.trim());
}
