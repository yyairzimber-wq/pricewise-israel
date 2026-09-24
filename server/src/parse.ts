import { XMLParser } from "fast-xml-parser";
import { normalizeStoreId } from "./filenames.ts";
import { israelLocalToIso } from "./israelTime.ts";

/**
 * Normalises the XML dialects published under the price-transparency rules.
 * Tag names are lower-cased so "ItemNm" / "ItemName" / "ITEMNAME" all meet,
 * and every field is read through an alias list.
 */

const ARRAYS = new Set(["item", "product", "promotion", "store", "subchain", "promotionitem", "group", "clubid", "branch"]);
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  transformTagName: (t) => t.toLowerCase(),
  isArray: (name) => ARRAYS.has(name),
});

type Node = Record<string, unknown>;

function rootOf(xml: string): Node {
  const doc = parser.parse(xml.replace(/^﻿/, "")) as Node;
  const key = Object.keys(doc).find((k) => k !== "?xml");
  if (!key) throw new Error("empty XML document");
  return doc[key] as Node;
}

function str(n: Node | undefined, ...keys: string[]): string | undefined {
  if (!n) return undefined;
  for (const k of keys) {
    const v = n[k];
    if (v != null && typeof v !== "object" && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

function num(n: Node | undefined, ...keys: string[]): number | undefined {
  const s = str(n, ...keys);
  if (s == null) return undefined;
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) ? v : undefined;
}

function scalars(v: unknown): string[] {
  const list = Array.isArray(v) ? v : v == null ? [] : [v];
  return list.filter((x) => x != null && typeof x !== "object" && String(x).trim() !== "").map((x) => String(x).trim());
}

function arr(n: unknown, ...path: string[]): Node[] {
  let cur: unknown = n;
  for (const p of path) {
    if (cur == null || typeof cur !== "object") return [];
    cur = (cur as Node)[p];
  }
  if (Array.isArray(cur)) return cur as Node[];
  return cur && typeof cur === "object" ? [cur as Node] : [];
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

export interface PriceRecord {
  itemCode: string;
  itemType: string | undefined;
  name: string;
  manufacturer?: string;
  unitQty?: string;
  quantity?: number;
  unitOfMeasure?: string;
  isWeighted: boolean;
  qtyInPackage?: number;
  price: number;
  unitOfMeasurePrice?: number;
  priceChangedAt: string | null;
}

export interface PriceFile {
  chainCode?: string;
  storeId: string | null;
  items: PriceRecord[];
}

export function parsePriceXml(xml: string): PriceFile {
  const root = rootOf(xml);
  const nodes = [...arr(root, "items", "item"), ...arr(root, "products", "product"), ...arr(root, "item")];
  const items: PriceRecord[] = [];
  for (const it of nodes) {
    const itemCode = str(it, "itemcode");
    const price = num(it, "itemprice");
    const name = str(it, "itemname", "itemnm", "manufactureritemdescription", "manufactureitemdescription");
    if (!itemCode || price == null || !name) continue;
    items.push({
      itemCode,
      itemType: str(it, "itemtype"),
      name,
      manufacturer: str(it, "manufacturername", "manufacturename"),
      unitQty: str(it, "unitqty"),
      quantity: num(it, "quantity"),
      unitOfMeasure: str(it, "unitofmeasure"),
      isWeighted: str(it, "bisweighted") === "1",
      qtyInPackage: num(it, "qtyinpackage"),
      price,
      unitOfMeasurePrice: num(it, "unitofmeasureprice"),
      priceChangedAt: israelLocalToIso(str(it, "priceupdatedate", "priceupdatetime")),
    });
  }
  return { chainCode: str(root, "chainid"), storeId: normalizeStoreId(str(root, "storeid")), items };
}

/** Only real retail barcodes can be matched across chains; internal codes (produce "100", "6") cannot. */
export function isComparableBarcode(code: string, itemType?: string): boolean {
  if (itemType === "0") return false;
  return /^\d{8,14}$/.test(code) && !/^0{4}/.test(code);
}

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

export type ClubScope = "all" | "club" | "other";

export interface PromoRecord {
  promoId: string;
  description: string;
  startsAt: string | null;
  endsAt: string | null;
  rewardType: string | undefined;
  minQty: number | undefined;
  /** Price paid for `minQty` units. */
  totalPrice: number | undefined;
  club: ScopeInfo;
  isCoupon: boolean;
  isBasketLevel: boolean;
  isWeighted: boolean;
  /** Items in a single group all share minQty/price; false = mixed, can't price reliably. */
  uniform: boolean;
  itemCodes: string[];
}

interface ScopeInfo {
  scope: ClubScope;
  label?: string;
}

export interface PromoFile {
  chainCode?: string;
  storeId: string | null;
  promos: PromoRecord[];
}

function clubScope(values: string[]): ScopeInfo {
  if (!values.length) return { scope: "all" };
  const ids = values.map((v) => parseInt(v, 10));
  if (ids.some((i) => i === 0)) return { scope: "all" };
  if (ids.every((i) => i === 1)) return { scope: "club", label: values.find((v) => v.includes("-"))?.split("-").slice(1).join("-").trim() };
  return { scope: "other" };
}

export function parsePromoXml(xml: string): PromoFile {
  const root = rootOf(xml);
  const nodes = [...arr(root, "promotions", "promotion"), ...arr(root, "promotion")];
  const promos: PromoRecord[] = [];

  for (const p of nodes) {
    const promoId = str(p, "promotionid");
    if (!promoId) continue;
    const restrictions = (p["additionalrestrictions"] as Node) || {};
    const groups = arr(p, "groups", "group");

    let itemNodes: Node[];
    let rewardType = str(p, "rewardtype");
    let minQty = num(p, "minqty");
    let totalPrice = num(p, "discountedprice");
    let uniform = true;
    let isWeighted = false;

    if (groups.length) {
      // Shufersal dialect: per-item reward data inside groups.
      itemNodes = groups.flatMap((g) => arr(g, "promotionitems", "promotionitem"));
      const first = itemNodes[0];
      rewardType = str(first, "rewardtype");
      minQty = num(first, "minqty");
      totalPrice = num(first, "discountedprice");
      isWeighted = itemNodes.some((i) => str(i, "bisweighted") === "1");
      uniform =
        groups.length === 1 &&
        itemNodes.every((i) => num(i, "minqty") === minQty && num(i, "discountedprice") === totalPrice && str(i, "rewardtype") === rewardType);
    } else {
      itemNodes = arr(p, "promotionitems", "item");
    }

    const clubValues = [
      ...scalars((restrictions["clubs"] as Node | undefined)?.["clubid"]),
      ...scalars((p["clubs"] as Node | undefined)?.["clubid"]),
      ...scalars(p["clubid"]),
    ];

    promos.push({
      promoId,
      description: str(p, "promotiondescription") ?? "",
      startsAt: israelLocalToIso(str(p, "promotionstartdatetime", "promotionstartdate"), str(p, "promotionstarthour")),
      endsAt: israelLocalToIso(str(p, "promotionenddatetime", "promotionenddate"), str(p, "promotionendhour")),
      rewardType,
      minQty,
      totalPrice,
      club: clubScope(clubValues),
      isCoupon: (str(restrictions, "additionaliscoupon") ?? str(p, "additionaliscoupon")) === "1",
      isBasketLevel: (str(restrictions, "additionalistotal") ?? str(p, "additionalistotal")) === "1" || (num(groups[0], "minpurchaseamount") ?? 0) > 0,
      isWeighted,
      uniform,
      itemCodes: itemNodes.map((i) => str(i, "itemcode")).filter((c): c is string => !!c),
    });
  }
  return { chainCode: str(root, "chainid"), storeId: normalizeStoreId(str(root, "storeid")), promos };
}

/**
 * Per-unit price of a promotion, or null if we can't state it with certainty.
 * Accepted: "X units for Y ₪" and fixed-price deals (reward types 1, 3, 10),
 * for all customers or club members. Rejected: coupons, credit-card deals,
 * basket-level conditions, gifts / 1+1 / percent-off-second-item, weighted items.
 */
export function promoUnitPrice(p: PromoRecord, at = Date.now()): { unitPrice: number; scope: "all" | "club" } | null {
  if (p.isCoupon || p.isBasketLevel || p.isWeighted || !p.uniform) return null;
  if (p.club.scope === "other") return null;
  if (!["1", "3", "10"].includes(p.rewardType ?? "")) return null;
  const qty = p.minQty ?? 0;
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) return null;
  if (!p.totalPrice || p.totalPrice <= 0) return null;
  if (p.startsAt && Date.parse(p.startsAt) > at) return null;
  if (p.endsAt && Date.parse(p.endsAt) < at) return null;
  return { unitPrice: Math.round((p.totalPrice / qty) * 100) / 100, scope: p.club.scope };
}

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export interface StoreRecord {
  storeId: string;
  subChainId?: string;
  name: string;
  address?: string;
  city?: string;
  zip?: string;
  storeType?: string;
}

export function parseStoresXml(xml: string): { chainCode?: string; chainName?: string; stores: StoreRecord[] } {
  const root = rootOf(xml);
  const inner = (root["envelope"] as Node) ?? root;
  const out: StoreRecord[] = [];
  const push = (s: Node, subChainId?: string) => {
    const storeId = normalizeStoreId(str(s, "storeid", "branchid", "storenumber"));
    if (!storeId) return;
    out.push({
      storeId,
      subChainId: str(s, "subchainid") ?? subChainId,
      name: str(s, "storename", "branchname") ?? `סניף ${storeId}`,
      address: str(s, "address", "branchaddress"),
      city: str(s, "city", "cityname"),
      zip: str(s, "zipcode"),
      storeType: str(s, "storetype"),
    });
  };
  for (const sc of arr(inner, "subchains", "subchain")) {
    for (const s of arr(sc, "stores", "store")) push(s, str(sc, "subchainid"));
  }
  for (const s of [...arr(inner, "stores", "store"), ...arr(inner, "store"), ...arr(inner, "branches", "branch")]) push(s);
  return { chainCode: str(inner, "chainid") ?? str(root, "chainid"), chainName: str(inner, "chainname") ?? str(root, "chainname"), stores: out };
}
