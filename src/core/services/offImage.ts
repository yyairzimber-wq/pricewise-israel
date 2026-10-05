/**
 * Open Food Facts product photos (open data, CC-BY-SA). The snapshot stores a
 * photo as "he.29" (language.revision) instead of the whole URL, which keeps
 * 150k products' worth of JSON small; this rebuilds the URL.
 */

const BASE = "https://images.openfoodfacts.org/images/products";

/** OFF's folder layout: 13 digits split 3/3/3/rest; short codes (≤8) are used as is. */
export function offFolder(code: string): string {
  if (code.length <= 8) return code;
  const p = code.padStart(13, "0");
  return `${p.slice(0, 3)}/${p.slice(3, 6)}/${p.slice(6, 9)}/${p.slice(9)}`;
}

export type OffImageSize = 100 | 200 | 400;

/** "he.29" → full URL (or pass a full URL through). */
export function expandImage(barcode: string, ref: string, size: OffImageSize = 400): string {
  if (/^https?:/.test(ref)) return ref;
  const [lang, rev] = ref.split(".");
  return `${BASE}/${offFolder(barcode)}/front_${lang}.${rev}.${size}.jpg`;
}

/** Full OFF URL → "he.29" when it round-trips exactly, otherwise the URL unchanged. */
export function compactImage(barcode: string, url: string): string {
  const m = /\/front_([a-z]{2,3})\.(\d+)\.(?:\d+|full)\.jpg$/.exec(url);
  if (!m) return url;
  const ref = `${m[1]}.${m[2]}`;
  return expandImage(barcode, ref).replace(/\.400\.jpg$/, "") === url.replace(/\.(?:\d+|full)\.jpg$/, "") ? ref : url;
}

/** Small version for list thumbnails (OFF serves 100/200/400/full). */
export function thumbOf(url: string): string {
  return url.replace(/\.(?:400|full)\.jpg$/, ".200.jpg");
}
