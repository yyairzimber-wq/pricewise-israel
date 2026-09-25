import { formatSize } from "../../services/format";
import type { Product, RecognitionResult } from "../../types";
import type { CatalogProvider, RecognitionProvider } from "../types";
import { RecognitionNotConfigured } from "./recognizers";

/** Something that can turn text read off a package into ranked catalog products. */
export interface TextMatchProvider {
  match(text: string, limit?: number): Promise<{ product: Product; score: number; matched: string[] }[]>;
}

/**
 * Fallback matcher for catalogs without a local word index (API mode): search
 * each distinctive word and rank products by how many of the words they contain.
 */
export class CatalogTextMatcher implements TextMatchProvider {
  private readonly catalog: CatalogProvider;
  constructor(catalog: CatalogProvider) {
    this.catalog = catalog;
  }
  async match(text: string, limit = 6) {
    const words = [...new Set(text.match(/[א-ת]{3,}/g) ?? [])].slice(0, 12);
    const hits = new Map<string, { product: Product; score: number; matched: string[] }>();
    for (const w of words) {
      for (const p of await this.catalog.search(w, 20).catch(() => [])) {
        const h = hits.get(p.id) ?? { product: p, score: 0, matched: [] };
        h.score += 3;
        h.matched.push(w);
        hits.set(p.id, h);
      }
    }
    return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

type Worker = import("tesseract.js").Worker;
let workerPromise: Promise<Worker> | null = null;

/** One shared Tesseract worker, created on first use (downloads ~5MB once, then cached by the browser). */
function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker(["heb", "eng"]);
    // Sparse text: packages have scattered words at many sizes, not paragraphs.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    return worker;
  })();
  workerPromise.catch(() => (workerPromise = null));
  return workerPromise;
}

/** Start downloading the OCR engine in the background (e.g. when the camera opens). */
export function warmUpOcr() {
  void getWorker().catch(() => {});
}

/**
 * Greyscale + strong contrast at ~1600px (small photos are enlarged — Tesseract
 * reads small print much better that way), plus an inverted copy for
 * light-on-dark print. Tuned on real Israeli pack photos.
 */
async function prepare(image: Blob, maxSide = 1600): Promise<[HTMLCanvasElement, HTMLCanvasElement]> {
  const bitmap = await createImageBitmap(image);
  const scale = Math.min(2.5, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const make = () => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };
  const normal = make();
  const ctx = normal.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const inv = new ImageData(w, h);
  const factor = (1 + 0.4) / (1 - 0.4); // contrast +40%
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    const v = Math.max(0, Math.min(255, (g - 127.5) * factor + 127.5));
    d[i] = d[i + 1] = d[i + 2] = v;
    inv.data[i] = inv.data[i + 1] = inv.data[i + 2] = 255 - v;
    inv.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const inverted = make();
  inverted.getContext("2d")!.putImageData(inv, 0, 0);
  return [normal, inverted];
}

/**
 * Free, on-device product recognition: read the text printed on the package
 * (Tesseract, Hebrew + English, runs in the browser — the photo never leaves
 * the phone) and match the words against the product catalog.
 *
 * Works well on text-heavy packs (milk, cheese, cereals, cleaning products);
 * packs that are mostly a stylised logo may not be read — the user then gets
 * the chooser / manual search. A barcode in the photo is still tried first.
 */
export class OcrRecognizer implements RecognitionProvider {
  readonly id = "ocr";
  readonly isDemo = false;
  private readonly matcher: TextMatchProvider;
  constructor(matcher: TextMatchProvider) {
    this.matcher = matcher;
  }

  async recognize(image: Blob): Promise<RecognitionResult> {
    const [worker, [normal, inverted]] = await Promise.all([getWorker(), prepare(image)]);
    const texts: string[] = [];
    for (const canvas of [normal, inverted]) {
      const { data } = await worker.recognize(canvas);
      texts.push(data.text);
    }
    const matches = await this.matcher.match(texts.join("\n"), 6);
    return {
      candidates: matches.map((m) => ({
        name: m.product.name,
        brand: m.product.brand,
        sizeText: m.product.size ? formatSize(m.product.size) : undefined,
        barcode: m.product.barcode,
        // Word-weight sum → 0..0.95: two distinctive words + pack size ≥ 0.9. A single
        // matching word stays below 0.55 — it could be on many packs.
        confidence: Math.min(m.matched.length >= 2 ? 0.95 : 0.55, Math.round((m.score / 14) * 100) / 100),
        product: m.product,
      })),
      confident: false,
      method: "text",
      source: { kind: "ai", label: "זיהוי לפי הכיתוב על האריזה (בתוך המכשיר)" },
    };
  }
}

/**
 * Try the AI endpoint first; if it isn't configured (no API key) — or fails —
 * read the package on-device instead. Adding a key later switches to AI with no
 * app change.
 */
export class FallbackRecognizer implements RecognitionProvider {
  readonly id = "ai-or-ocr";
  readonly isDemo = false;
  private readonly primary: RecognitionProvider;
  private readonly fallback: RecognitionProvider;
  private primaryMissing = false;
  constructor(primary: RecognitionProvider, fallback: RecognitionProvider) {
    this.primary = primary;
    this.fallback = fallback;
  }

  async recognize(image: Blob): Promise<RecognitionResult> {
    if (!this.primaryMissing) {
      try {
        return await this.primary.recognize(image);
      } catch (e) {
        if (e instanceof RecognitionNotConfigured) this.primaryMissing = true;
      }
    }
    return this.fallback.recognize(image);
  }
}
