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

/**
 * Fast normaliser for search indexes (runs once per product, and per keystroke on
 * the query): lower-case, drop niqqud, every non-letter/digit becomes a space.
 * ~10× cheaper than `normalize`, which matters over 100k+ products on a phone.
 */
export function normalizeFast(text: string): string {
  return text.toLowerCase().replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** The query as normalised words (empty = nothing to search for). */
export function prepareQuery(query: string): string[] {
  return normalizeFast(query).split(" ").filter(Boolean);
}

/** Cheap pre-check: does every query word occur somewhere in the (already normalised) text? */
export function containsAll(q: string[], flat: string): boolean {
  for (const t of q) if (!flat.includes(t)) return false;
  return q.length > 0;
}

/**
 * Score how well an already-normalised name matches the query words; 0 = no match.
 * Every query word must appear. Beyond that, WHERE it appears decides the rank:
 * grocery names lead with what the product is ("חלב בקרטון 3%", "לחם ברמן"), while
 * a word buried later usually means a different product ("שוקולד פרה חלב",
 * "פירורי לחם", "רוטב עגבניות"). So an exact word beats a prefix, which beats a
 * fragment inside a word, earlier beats later, and a name that STARTS with the
 * first query word gets a bonus.
 */
export function scoreNormalized(q: string[], flat: string): number {
  if (!q.length || !containsAll(q, flat)) return 0;
  const words = flat.split(" ");
  let score = 0;
  for (const t of q) {
    let best = 0;
    for (let i = 0; i < words.length; i++) {
      const early = Math.max(0, 6 - i);
      if (words[i] === t) best = Math.max(best, 10 + early);
      else if (words[i].startsWith(t)) best = Math.max(best, 6 + early);
    }
    score += best || 2; // 2 = inside a word (e.g. a glued name)
  }
  if (words[0] === q[0] || words[0].startsWith(q[0])) score += 8;
  return score;
}

/** Convenience for one-off matching (small lists, tests). */
export function matchScore(query: string, haystack: string): number {
  return scoreNormalized(prepareQuery(query), normalizeFast(haystack));
}

export function isBarcode(text: string): boolean {
  return /^\d{8,14}$/.test(text.trim());
}
