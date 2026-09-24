import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

/** Retail barcode formats found on Israeli grocery packaging. */
const FORMATS = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128];

function makeReader() {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
}

/** Continuous scan from the camera. Returns controls to stop the stream. */
export async function startCameraScan(
  video: HTMLVideoElement,
  onResult: (code: string) => void,
  deviceId?: string,
): Promise<IScannerControls> {
  const reader = makeReader();
  const constraints: MediaStreamConstraints = {
    audio: false,
    video: deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  };
  return reader.decodeFromConstraints(constraints, video, (result) => {
    if (result) onResult(result.getText());
  });
}

/** Try to read a barcode from a still photo (the photo flow checks this before calling AI). */
export async function decodeBarcodeFromImage(blob: Blob): Promise<string | null> {
  const url = URL.createObjectURL(blob);
  try {
    const result = await makeReader().decodeFromImageUrl(url);
    return result.getText();
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}
