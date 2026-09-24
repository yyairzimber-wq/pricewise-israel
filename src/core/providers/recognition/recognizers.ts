import { DEMO_PRODUCTS } from "../../data/demo/products";
import { formatSize } from "../../services/format";
import type { RecognitionCandidate, RecognitionResult } from "../../types";
import type { RecognitionProvider } from "../types";

/** The server has no AI credentials configured. */
export class RecognitionNotConfigured extends Error {}

/**
 * Calls the vision endpoint (POST /recognize on the price server, see
 * server/src/recognize.ts), which runs Claude on the photo server-side so the API key never reaches the device.
 */
export class HttpVisionRecognizer implements RecognitionProvider {
  readonly id = "vision-http";
  readonly isDemo = false;
  constructor(private readonly endpoint: string) {}

  async recognize(image: Blob): Promise<RecognitionResult> {
    const { data, mediaType } = await toJpegBase64(image);
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: data, mediaType }),
      signal: AbortSignal.timeout(45_000),
    });
    if (res.status === 503) throw new RecognitionNotConfigured();
    if (!res.ok) throw new Error(`recognition failed: HTTP ${res.status}`);
    const json = (await res.json()) as { candidates: RecognitionCandidate[] };
    return {
      candidates: json.candidates ?? [],
      confident: false, // decided later by the pipeline, after catalog matching
      method: "vision",
      source: { kind: "ai", label: "זיהוי AI מתמונה" },
    };
  }
}

/**
 * Stand-in used when no AI endpoint is configured. It does NOT look at the
 * image; it offers a handful of demo products and always asks the user to
 * choose, so it never pretends to have recognised anything.
 */
export class DemoRecognizer implements RecognitionProvider {
  readonly id = "demo";
  readonly isDemo = true;

  async recognize(image: Blob): Promise<RecognitionResult> {
    await new Promise((r) => setTimeout(r, 900));
    const seed = image.size % DEMO_PRODUCTS.length;
    const picks = [0, 1, 2, 3].map((i) => DEMO_PRODUCTS[(seed + i * 7) % DEMO_PRODUCTS.length]);
    return {
      candidates: picks.map((p, i) => ({
        name: p.name,
        brand: p.brand,
        sizeText: formatSize(p.size),
        barcode: p.barcode,
        confidence: 0.4 - i * 0.05,
        product: p,
      })),
      confident: false,
      method: "vision",
      source: { kind: "demo", label: "זיהוי הדגמה — AI לא מחובר" },
    };
  }
}

/** Downscale to ≤1280px JPEG before upload: faster, cheaper, and plenty for reading a label. */
export async function toJpegBase64(blob: Blob, maxSide = 1280): Promise<{ data: string; mediaType: "image/jpeg" }> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { data: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" };
}

/** Real-data mode without an AI endpoint: say so instead of guessing. */
export class UnavailableRecognizer implements RecognitionProvider {
  readonly id = "unavailable";
  readonly isDemo = false;
  async recognize(): Promise<RecognitionResult> {
    throw new RecognitionNotConfigured();
  }
}
