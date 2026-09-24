/**
 * Identify a grocery product from a photo of its packaging, with Claude vision.
 * Runs on the server so the API key never ships inside the app.
 *
 * Credentials: ANTHROPIC_API_KEY in the server's environment (or an
 * `ant auth login` profile). Without them, /recognize answers 503 and the app
 * says AI recognition isn't configured.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const Candidate = z.object({
  name: z.string().describe("Product name in Hebrew as printed on the pack, without brand or size"),
  brand: z.string().nullable().describe("Brand / manufacturer, in Hebrew if printed in Hebrew"),
  sizeText: z.string().nullable().describe('Net size exactly as printed, e.g. "750 גרם", "1.5 ליטר"'),
  barcode: z.string().nullable().describe("Barcode digits only if they are clearly legible in the photo"),
  confidence: z.number().describe("0..1 — how sure you are this is the exact product (brand + variant + size)"),
});

const Result = z.object({
  isProduct: z.boolean().describe("False if the photo does not show a retail product"),
  candidates: z.array(Candidate).describe("1–4 best guesses, most likely first"),
});

const SYSTEM = `You identify supermarket products sold in Israel from photos of their packaging.
Read the visible text (Hebrew and English), logo, colours and pack size.
Return up to 4 candidates, most likely first. Distinguish variants carefully (e.g. 3% vs 1% milk, 500g vs 750g).
Calibrate confidence honestly: use ≥0.8 only when brand, variant and size are all clearly readable.
If size or variant is not visible, lower confidence and offer the plausible variants as separate candidates.
Never guess a barcode — include it only if every digit is legible.`;

export interface RecognizedCandidate {
  name: string;
  brand?: string;
  sizeText?: string;
  barcode?: string;
  confidence: number;
}

export class RecognitionUnavailable extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  try {
    client = new Anthropic();
    return client;
  } catch (e) {
    throw new RecognitionUnavailable((e as Error).message);
  }
}

export function recognitionConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

export async function recognizeImage(imageBase64: string, mediaType: "image/jpeg" | "image/png"): Promise<RecognizedCandidate[]> {
  const response = await getClient().beta.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: betaZodOutputFormat(Result) },
    // If a request is declined by a safety classifier, the API retries it on a
    // fallback model inside the same call instead of failing.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: "Identify this product." },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) return [];
  const out = response.parsed_output;
  if (!out.isProduct) return [];
  return out.candidates.slice(0, 4).map((c) => ({
    name: c.name,
    brand: c.brand ?? undefined,
    sizeText: c.sizeText ?? undefined,
    barcode: c.barcode && /^\d{8,14}$/.test(c.barcode) ? c.barcode : undefined,
    confidence: Math.max(0, Math.min(1, c.confidence)),
  }));
}

export { Anthropic };
