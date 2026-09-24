import { gunzipSync } from "node:zlib";
import { unzipSync } from "fflate";

/**
 * Portal files arrive as gzip, as ZIP disguised with a .gz extension (Cerberus),
 * or as plain XML — in UTF-8, UTF-16LE (Rami Levy's Stores file) or windows-1255.
 */
export function toXmlText(input: Uint8Array): string {
  let bytes = input;
  for (let i = 0; i < 3; i++) {
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = new Uint8Array(gunzipSync(bytes));
    else if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const entries = Object.values(unzipSync(bytes));
      if (!entries.length) throw new Error("empty zip");
      bytes = entries.sort((a, b) => b.length - a.length)[0];
    } else break;
  }
  return decodeText(bytes);
}

export function decodeText(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder("utf-8").decode(b.subarray(3));
  if (b.length > 3 && b[0] === 0x3c && b[1] === 0x00) return new TextDecoder("utf-16le").decode(b);

  const head = new TextDecoder("latin1").decode(b.subarray(0, 200));
  const declared = head.match(/encoding\s*=\s*["']([\w-]+)["']/i)?.[1]?.toLowerCase();
  if (declared && /1255|hebrew/.test(declared)) return new TextDecoder("windows-1255").decode(b);

  const utf8 = new TextDecoder("utf-8").decode(b);
  // Undeclared legacy files: lots of replacement chars means it wasn't UTF-8.
  const bad = (utf8.slice(0, 20_000).match(/�/g) ?? []).length;
  return bad > 20 ? new TextDecoder("windows-1255").decode(b) : utf8;
}
