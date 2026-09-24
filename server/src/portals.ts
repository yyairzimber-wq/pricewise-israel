import { Writable } from "node:stream";
import { checkServerIdentity, type PeerCertificate } from "node:tls";
import { Client, enterPassiveModeIPv4 } from "basic-ftp";
import type { ChainSource } from "./config.ts";
import { SERVER_CONFIG } from "./config.ts";
import { parseFileName, type FileKind } from "./filenames.ts";

export interface RemoteFile {
  name: string;
  kind: FileKind;
  chainCode: string;
  storeId: string | null;
  publishedAt: string | null;
  /** HTTP URL, or FTP path for Cerberus. */
  location: string;
}

export interface Portal {
  /** Latest Stores file for the chain. */
  latestStores(): Promise<RemoteFile | null>;
  /** Latest file of `kind` for each store (optionally only the given stores). */
  latestPerStore(kind: "pricefull" | "promofull", storeIds?: string[]): Promise<RemoteFile[]>;
  download(file: RemoteFile): Promise<Uint8Array>;
  close(): Promise<void>;
  /** Optional progress messages for slow listings. */
  onProgress?: (msg: string) => void;
}

export function portalFor(source: ChainSource): Portal {
  switch (source.portal.type) {
    case "cerberus":
      return new CerberusPortal(source, source.portal.username);
    case "shufersal":
      return new ShufersalPortal(source);
    case "publishprice":
      return new PublishPricePortal(source, source.portal.baseUrl);
    case "laib":
      return new LaibPortal(source);
    case "bina":
      return new BinaPortal(source, source.portal.host);
    case "hazihinam":
      return new HaziHinamPortal(source);
    case "superpharm":
      return new SuperPharmPortal(source);
  }
}

// ---------------------------------------------------------------------------

function toRemote(name: string, location: string, codes: string[], listedAt?: string | null): RemoteFile | null {
  const p = parseFileName(name);
  if (!p || !codes.includes(p.chainCode)) return null;
  return { name, kind: p.kind, chainCode: p.chainCode, storeId: p.storeId, publishedAt: p.publishedAt ?? listedAt ?? null, location };
}

function newestByStore(files: RemoteFile[], kind: FileKind, storeIds?: string[]): RemoteFile[] {
  const want = storeIds ? new Set(storeIds) : null;
  const best = new Map<string, RemoteFile>();
  for (const f of files) {
    if (f.kind !== kind || !f.storeId || (want && !want.has(f.storeId))) continue;
    const cur = best.get(f.storeId);
    if (!cur || (f.publishedAt ?? "") > (cur.publishedAt ?? "")) best.set(f.storeId, f);
  }
  return [...best.values()];
}

function newest(files: RemoteFile[], kind: FileKind): RemoteFile | null {
  return files.filter((f) => f.kind === kind).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))[0] ?? null;
}

async function httpBytes(url: string, timeoutMs = 120_000): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { "User-Agent": SERVER_CONFIG.userAgent }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function httpText(url: string): Promise<string> {
  return new TextDecoder().decode(await httpBytes(url, 60_000));
}

// ---------------------------------------------------------------------------
// Cerberus — url.retail.publishedprices.co.il (FTPS, public username, empty password)
// ---------------------------------------------------------------------------

const CERBERUS_HOST = "url.retail.publishedprices.co.il";

/**
 * The portal serves a certificate for "*.publishedprices.co.il", which by the
 * TLS rules doesn't cover the two-level host "url.retail.publishedprices.co.il".
 * The CA chain is still fully verified by Node; we only relax the *name* check,
 * only for this host, and only to a certificate issued to publishedprices.co.il.
 */
function cerberusIdentity(host: string, cert: PeerCertificate): Error | undefined {
  const names = (cert.subjectaltname ?? "").split(",").map((s) => s.trim());
  if (host === CERBERUS_HOST && (names.includes("DNS:*.publishedprices.co.il") || names.includes("DNS:publishedprices.co.il"))) return undefined;
  return checkServerIdentity(host, cert);
}

class CerberusPortal implements Portal {
  private client: Client | null = null;
  private listing: RemoteFile[] | null = null;
  private readonly source: ChainSource;
  private readonly username: string;
  constructor(source: ChainSource, username: string) {
    this.source = source;
    this.username = username;
  }

  private async ftp(): Promise<Client> {
    if (this.client && !this.client.closed) return this.client;
    const c = new Client(90_000);
    // The server advertises a data IP different from the control IP and EPSV
    // hangs; plain PASV with the advertised IP is what works.
    c.prepareTransfer = enterPassiveModeIPv4;
    await c.access({
      host: CERBERUS_HOST,
      user: this.username,
      password: "",
      secure: true,
      secureOptions: { checkServerIdentity: cerberusIdentity },
    });
    this.client = c;
    return c;
  }

  private async list(): Promise<RemoteFile[]> {
    if (this.listing) return this.listing;
    const entries = await (await this.ftp()).list();
    this.listing = entries
      .map((e) => toRemote(e.name, e.name, this.source.codes, e.modifiedAt?.toISOString()))
      .filter((f): f is RemoteFile => !!f);
    return this.listing;
  }

  async latestStores() {
    return newest(await this.list(), "stores");
  }
  async latestPerStore(kind: "pricefull" | "promofull", storeIds?: string[]) {
    return newestByStore(await this.list(), kind, storeIds);
  }
  async download(file: RemoteFile) {
    const chunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk);
        cb();
      },
    });
    await (await this.ftp()).downloadTo(sink, file.location);
    return new Uint8Array(Buffer.concat(chunks));
  }
  async close() {
    this.client?.close();
  }
}

// ---------------------------------------------------------------------------
// Shufersal — prices.shufersal.co.il (HTML grid, Azure blob links)
// ---------------------------------------------------------------------------

const SHUFERSAL_CAT: Record<FileKind, number> = { price: 1, pricefull: 2, promo: 3, promofull: 4, stores: 5 };

class ShufersalPortal implements Portal {
  private readonly source: ChainSource;
  constructor(source: ChainSource) {
    this.source = source;
  }

  private async page(kind: FileKind, storeId = "0", page = 1): Promise<RemoteFile[]> {
    const html = await httpText(`https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=${SHUFERSAL_CAT[kind]}&storeId=${storeId}&page=${page}`);
    const urls = [...html.matchAll(/https:\/\/pricesprodpublic\.blob\.core\.windows\.net\/[^"'\s<>]+/g)].map((m) => m[0].replace(/&amp;/g, "&"));
    return urls
      .map((u) => toRemote(decodeURIComponent(new URL(u).pathname.split("/").pop() ?? ""), u, this.source.codes))
      .filter((f): f is RemoteFile => !!f);
  }

  async latestStores() {
    return newest(await this.page("stores"), "stores");
  }
  /**
   * The site answers each listing request in ~15 s. Per-branch lookups are fine
   * for a small sample; for many branches, walk the chain-wide list instead
   * (~20 files per page, newest first) — minutes instead of hours.
   */
  async latestPerStore(kind: "pricefull" | "promofull", storeIds?: string[]) {
    if (storeIds && storeIds.length <= 20) {
      const out: RemoteFile[] = [];
      for (const id of storeIds) out.push(...newestByStore(await this.page(kind, id), kind, [id]));
      return out;
    }
    const all: RemoteFile[] = [];
    const seen = new Set<string>();
    for (let page = 1; page <= 200; page++) {
      const files = await this.page(kind, "0", page);
      const fresh = files.filter((f) => !seen.has(f.name));
      if (!fresh.length) break; // past the last page the site repeats or returns nothing
      fresh.forEach((f) => seen.add(f.name));
      all.push(...fresh);
      this.onProgress?.(`  ${kind}: עמוד ${page} (${all.length} קבצים)`);
    }
    return newestByStore(all, kind, storeIds);
  }

  onProgress?: (msg: string) => void;
  async download(file: RemoteFile) {
    // Blob links carry short-lived SAS tokens: re-list if one has expired.
    try {
      return await httpBytes(file.location);
    } catch (e) {
      const fresh = (await this.page(file.kind, file.storeId ?? "0")).find((f) => f.name === file.name);
      if (!fresh) throw e;
      return httpBytes(fresh.location);
    }
  }
  async close() {}
}

// ---------------------------------------------------------------------------
// PublishPrice — prices.<chain>.co.il (file list embedded in a <script>)
// ---------------------------------------------------------------------------

class PublishPricePortal implements Portal {
  private listing: RemoteFile[] | null = null;
  private readonly source: ChainSource;
  private readonly baseUrl: string;
  constructor(source: ChainSource, baseUrl: string) {
    this.source = source;
    this.baseUrl = baseUrl;
  }

  private async list(): Promise<RemoteFile[]> {
    if (this.listing) return this.listing;
    const html = await httpText(this.baseUrl);
    const path = html.match(/const path = ['"]([^'"]*)['"]/)?.[1] ?? "";
    const filesJson = html.match(/const files = (\[.*?\]);?\s*\n/s)?.[1];
    if (!filesJson) throw new Error(`could not read file list from ${this.baseUrl}`);
    const files = JSON.parse(filesJson) as { name: string }[];
    const base = this.baseUrl.replace(/\/$/, "");
    this.listing = files
      .map((f) => toRemote(f.name, path ? `${base}/${path}/${f.name}` : `${base}/${f.name}`, this.source.codes))
      .filter((f): f is RemoteFile => !!f);
    return this.listing;
  }

  async latestStores() {
    return newest(await this.list(), "stores");
  }
  async latestPerStore(kind: "pricefull" | "promofull", storeIds?: string[]) {
    return newestByStore(await this.list(), kind, storeIds);
  }
  download(file: RemoteFile) {
    return httpBytes(file.location);
  }
  async close() {}
}

// ---------------------------------------------------------------------------
// Laibcatalog — laibcatalog.co.il JSON API (Victory, Mahsanei Hashuk)
// ---------------------------------------------------------------------------

class LaibPortal implements Portal {
  private listing: RemoteFile[] | null = null;
  private readonly source: ChainSource;
  constructor(source: ChainSource) {
    this.source = source;
  }

  private async list(): Promise<RemoteFile[]> {
    if (this.listing) return this.listing;
    const all: RemoteFile[] = [];
    for (const code of this.source.codes) {
      const res = await fetch(`https://laibcatalog.co.il/webapi/api/getfiles?edi=${code}`, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) continue;
      const files = (await res.json()) as { fileName: string; fileDate?: string }[];
      for (const f of files) {
        const r = toRemote(f.fileName, `https://laibcatalog.co.il/webapi/${code}/${f.fileName}`, this.source.codes);
        if (r) all.push(r);
      }
    }
    this.listing = all;
    return all;
  }

  async latestStores() {
    return newest(await this.list(), "stores");
  }
  async latestPerStore(kind: "pricefull" | "promofull", storeIds?: string[]) {
    return newestByStore(await this.list(), kind, storeIds);
  }
  download(file: RemoteFile) {
    return httpBytes(file.location);
  }
  async close() {}
}

// ---------------------------------------------------------------------------
// Bina — <chain>.binaprojects.com (JSON listing behind a session cookie)
// Serves King Store, Zol Vebegadol, Good Pharm, Super Sapir and more.
// ---------------------------------------------------------------------------

const BINA_TYPE: Partial<Record<FileKind, number>> = { stores: 1, pricefull: 4, promofull: 5 };

class BinaPortal implements Portal {
  private readonly source: ChainSource;
  private readonly base: string;
  private cookie = "";
  private listings = new Map<FileKind, RemoteFile[]>();
  onProgress?: (msg: string) => void;
  constructor(source: ChainSource, host: string) {
    this.source = source;
    this.base = `https://${host}.binaprojects.com`;
  }

  private async session(): Promise<string> {
    if (this.cookie) return this.cookie;
    const res = await fetch(`${this.base}/Main.aspx`, { headers: { "User-Agent": SERVER_CONFIG.userAgent }, signal: AbortSignal.timeout(60_000) });
    this.cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    return this.cookie;
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: { "User-Agent": SERVER_CONFIG.userAgent, Cookie: await this.session() }, signal: AbortSignal.timeout(90_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  }

  private async list(kind: FileKind): Promise<RemoteFile[]> {
    const cached = this.listings.get(kind);
    if (cached) return cached;
    const all: RemoteFile[] = [];
    for (const code of this.source.codes) {
      const q = new URLSearchParams({ _: code, wReshet: "הכל", WFileType: String(BINA_TYPE[kind] ?? 0), WDate: "", WStore: "" });
      const rows = await this.getJson<{ FileNm: string }[]>(`${this.base}/MainIO_Hok.aspx?${q}`);
      for (const r of rows) {
        const f = toRemote(r.FileNm, r.FileNm, this.source.codes);
        if (f) all.push(f);
      }
    }
    this.listings.set(kind, all);
    return all;
  }

  async latestStores() {
    return newest(await this.list("stores"), "stores");
  }
  async latestPerStore(kind: "pricefull" | "promofull", storeIds?: string[]) {
    return newestByStore(await this.list(kind), kind, storeIds);
  }
  async download(file: RemoteFile) {
    // Download.aspx answers with [{ SPath }] — the real file URL.
    const [first] = await this.getJson<{ SPath: string }[]>(`${this.base}/Download.aspx?FileNm=${encodeURIComponent(file.location)}`);
    if (!first?.SPath) throw new Error(`no download path for ${file.name}`);
    return httpBytes(first.SPath);
  }
  async close() {}
}

// ---------------------------------------------------------------------------
// Paged HTML listings (Hazi Hinam, Super-Pharm): walk pages until nothing new.
// ---------------------------------------------------------------------------

async function walkPages(urlFor: (page: number) => string, extract: (html: string) => string[], codes: string[], maxPages: number, progress?: (m: string) => void): Promise<RemoteFile[]> {
  const out: RemoteFile[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    const urls = extract(await httpText(urlFor(page)));
    const fresh = urls.filter((u) => !seen.has(u));
    if (!fresh.length) break;
    for (const u of fresh) {
      seen.add(u);
      const name = decodeURIComponent(new URL(u).pathname.split("/").pop() ?? "");
      const f = toRemote(name, u, codes);
      if (f) out.push(f);
    }
    if (page % 5 === 0) progress?.(`  עמוד ${page} (${out.length} קבצים)`);
  }
  return out;
}

const HAZI_TYPE: Partial<Record<FileKind, number>> = { stores: 3, pricefull: 1, promofull: 2 };

class HaziHinamPortal implements Portal {
  private readonly source: ChainSource;
  private listings = new Map<FileKind, RemoteFile[]>();
  onProgress?: (msg: string) => void;
  constructor(source: ChainSource) {
    this.source = source;
  }
  private async list(kind: FileKind): Promise<RemoteFile[]> {
    const cached = this.listings.get(kind);
    if (cached) return cached;
    // The site lists one day at a time: today and yesterday (Israel time).
    const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
    const all: RemoteFile[] = [];
    for (const d of [day(0), day(1)]) {
      all.push(
        ...(await walkPages(
          (p) => `https://shop.hazi-hinam.co.il/Prices?d=${d}&t=${HAZI_TYPE[kind]}&f=null&p=${p}`,
          (html) => [...html.matchAll(/https:\/\/hazihinamprod01\.blob\.core\.windows\.net\/[^"'\s<>]+/g)].map((m) => m[0].replace(/&amp;/g, "&")),
          this.source.codes,
          40,
          this.onProgress,
        )),
      );
    }
    this.listings.set(kind, all);
    return all;
  }
  async latestStores() {
    return newest(await this.list("stores"), "stores");
  }
  async latestPerStore(kind: "pricefull" | "promofull", storeIds?: string[]) {
    return newestByStore(await this.list(kind), kind, storeIds);
  }
  download(file: RemoteFile) {
    return httpBytes(file.location);
  }
  async close() {}
}

const SUPERPHARM_CAT: Partial<Record<FileKind, string>> = { stores: "Stores", pricefull: "PriceFull", promofull: "PromoFull" };

class SuperPharmPortal implements Portal {
  private readonly source: ChainSource;
  private listings = new Map<FileKind, RemoteFile[]>();
  onProgress?: (msg: string) => void;
  constructor(source: ChainSource) {
    this.source = source;
  }
  private async list(kind: FileKind): Promise<RemoteFile[]> {
    const cached = this.listings.get(kind);
    if (cached) return cached;
    const all = await walkPages(
      (p) => `https://prices.super-pharm.co.il/?Category-equals=${SUPERPHARM_CAT[kind]}&page=${p}`,
      (html) => [...html.matchAll(/href="(\/Download\/[^"]+)"/g)].map((m) => `https://prices.super-pharm.co.il${m[1].replace(/&amp;/g, "&")}`),
      this.source.codes,
      kind === "stores" ? 2 : 80,
      this.onProgress,
    );
    this.listings.set(kind, all);
    return all;
  }
  async latestStores() {
    return newest(await this.list("stores"), "stores");
  }
  async latestPerStore(kind: "pricefull" | "promofull", storeIds?: string[]) {
    return newestByStore(await this.list(kind), kind, storeIds);
  }
  download(file: RemoteFile) {
    return httpBytes(file.location);
  }
  async close() {}
}
