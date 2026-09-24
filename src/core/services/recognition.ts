import type { CatalogProvider, RecognitionProvider } from "../providers/types";
import type { RecognitionCandidate, RecognitionResult } from "../types";
import { decodeBarcodeFromImage } from "./barcode";

/** Top candidate must be this sure — and clearly ahead of #2 — to skip the chooser. */
const CONFIDENT = 0.8;
const MARGIN = 0.2;

/**
 * Photo → product pipeline:
 *  1. If a barcode is visible in the photo, decode it and look it up (exact).
 *  2. Otherwise ask the vision model for candidates.
 *  3. Resolve each candidate against the catalog (barcode first, then text).
 *  4. Only auto-open when confident; otherwise the UI asks the user to pick.
 */
export async function recognizeProduct(
  image: Blob,
  deps: { recognizer: RecognitionProvider; catalog: CatalogProvider },
): Promise<RecognitionResult> {
  const code = await decodeBarcodeFromImage(image);
  if (code) {
    const product = await deps.catalog.getByBarcode(code);
    if (product) {
      return {
        method: "barcode-in-photo",
        confident: true,
        candidates: [{ name: product.name, brand: product.brand, barcode: code, confidence: 1, product }],
        source: { kind: "ai", label: "ברקוד זוהה בתמונה" },
      };
    }
  }

  const result = await deps.recognizer.recognize(image);
  const resolved = await Promise.all(result.candidates.slice(0, 5).map((c) => resolve(c, deps.catalog)));
  resolved.sort((a, b) => b.confidence - a.confidence);

  const [top, second] = resolved;
  const confident =
    !deps.recognizer.isDemo &&
    !!top?.product &&
    top.confidence >= CONFIDENT &&
    (!second || top.confidence - second.confidence >= MARGIN);

  return { ...result, candidates: resolved, confident };
}

async function resolve(c: RecognitionCandidate, catalog: CatalogProvider): Promise<RecognitionCandidate> {
  if (c.product) return c;
  if (c.barcode) {
    const byCode = await catalog.getByBarcode(c.barcode).catch(() => null);
    if (byCode) return { ...c, product: byCode };
  }
  const query = [c.brand, c.name].filter(Boolean).join(" ");
  const hits = await catalog.search(query, 1).catch(() => []);
  // Fall back to just the name if brand+name was too specific.
  const hit = hits[0] ?? (await catalog.search(c.name, 1).catch(() => []))[0];
  return hit ? { ...c, product: hit } : c;
}
