import { gzipSync } from "node:zlib";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { chainQuote, cleanManufacturer, guessCategory, parseSize, sizeFromName, type StorePrice, type StorePromo } from "../src/aggregate.ts";
import { toXmlText } from "../src/decode.ts";
import { parseFileName } from "../src/filenames.ts";
import { israelLocalToIso } from "../src/israelTime.ts";
import { isComparableBarcode, parsePriceXml, parsePromoXml, parseStoresXml, promoUnitPrice } from "../src/parse.ts";

// Trimmed from real files downloaded on 2026-09-23.
const CERBERUS_PRICE = `<Root><ChainId>7290058140886</ChainId><SubChainId>1</SubChainId><StoreId>39</StoreId><Items>
  <Item><PriceUpdateDate>2025-01-19 16:03:55</PriceUpdateDate><ItemCode>6</ItemCode><ItemType>1</ItemType><ItemNm>פריט חדש בדיקה</ItemNm><ItemPrice>30.6</ItemPrice></Item>
  <Item><PriceUpdateDate>2026-09-22 11:06:12</PriceUpdateDate><ItemCode>7290000066318</ItemCode><ItemType>1</ItemType><ItemNm>במבה 80 גרם</ItemNm><ManufacturerName>אסם</ManufacturerName><UnitQty>גרם</UnitQty><Quantity>80</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>4.9</ItemPrice></Item>
</Items></Root>`;

const SHUFERSAL_PRICE = `﻿<Root><ChainID>7290027600007</ChainID><SubChainID>001</SubChainID><StoreID>001</StoreID><Items>
  <Item><PriceUpdateTime>2025-12-28T14:15:00</PriceUpdateTime><ItemCode>7290000066318</ItemCode><ItemType>1</ItemType><ItemName>במבה 80 ג</ItemName><ManufactureName>אסם</ManufactureName><UnitQty>גרמים</UnitQty><Quantity>80.00</Quantity><bIsWeighted>0</bIsWeighted><ItemPrice>5.20</ItemPrice><ItemStatus /></Item>
</Items></Root>`;

const FLAT_PROMO = `<Root><ChainId>7290058140886</ChainId><StoreId>39</StoreId><Promotions count="3">
  <Promotion><PromotionId>1</PromotionId><PromotionDescription>ספרינג 3 יח' ב-10 ש"ח</PromotionDescription><PromotionStartDate>2026-08-02</PromotionStartDate><PromotionStartHour>00:00:00</PromotionStartHour><PromotionEndDate>2099-10-03</PromotionEndDate><PromotionEndHour>23:59:00</PromotionEndHour><RewardType>1</RewardType><DiscountType>1</DiscountType><MinQty>3</MinQty><DiscountedPrice>10</DiscountedPrice>
    <AdditionalRestrictions><AdditionalIsCoupon>0</AdditionalIsCoupon><Clubs><ClubId>0</ClubId></Clubs><AdditionalIsTotal>0</AdditionalIsTotal></AdditionalRestrictions>
    <PromotionItems count="2"><Item><ItemCode>7290001247129</ItemCode></Item><Item><ItemCode>7290001247112</ItemCode></Item></PromotionItems></Promotion>
  <Promotion><PromotionId>2</PromotionId><PromotionDescription>בקבוקים ב-17.90 למשלמים באשראי</PromotionDescription><PromotionEndDate>2099-10-03</PromotionEndDate><RewardType>1</RewardType><MinQty>1</MinQty><DiscountedPrice>17.9</DiscountedPrice>
    <AdditionalRestrictions><AdditionalIsCoupon>0</AdditionalIsCoupon><Clubs><ClubId>2</ClubId></Clubs></AdditionalRestrictions><PromotionItems><Item><ItemCode>7290000000001</ItemCode></Item></PromotionItems></Promotion>
  <Promotion><PromotionId>3</PromotionId><PromotionDescription>2+1 מתנה</PromotionDescription><PromotionEndDate>2099-10-03</PromotionEndDate><RewardType>9</RewardType><MinQty>3</MinQty><DiscountedPrice>0</DiscountedPrice><PromotionItems><Item><ItemCode>7290000000002</ItemCode></Item></PromotionItems></Promotion>
</Promotions></Root>`;

const GROUPED_PROMO = `<Root><ChainID>7290876100000</ChainID><StoreID>001</StoreID><Promotions>
  <Promotion><PromotionID>0001231505</PromotionID><PromotionDescription>פוקאציה קפוא ב10</PromotionDescription><PromotionStartDateTime>2026-08-24T00:00:00.000</PromotionStartDateTime><PromotionEndDateTime>2099-10-03T23:59:00.000</PromotionEndDateTime><ClubID>0</ClubID><AdditionalIsCoupon>0</AdditionalIsCoupon><AdditionalRestrictions/>
    <Groups><Group><GroupID>1</GroupID><MinPurchaseAmount>0.00</MinPurchaseAmount><DiscountType/><PromotionItems>
      <PromotionItem><ItemCode>7290002603474</ItemCode><RewardType>3</RewardType><MinQty>1</MinQty><DiscountedPrice>10.00</DiscountedPrice><bIsWeighted>0</bIsWeighted></PromotionItem>
      <PromotionItem><ItemCode>7290002603481</ItemCode><RewardType>3</RewardType><MinQty>1</MinQty><DiscountedPrice>10.00</DiscountedPrice><bIsWeighted>0</bIsWeighted></PromotionItem>
    </PromotionItems></Group></Groups></Promotion>
  <Promotion><PromotionID>91115</PromotionID><PromotionDescription>20ש - קופון ח"ע אסם</PromotionDescription><PromotionEndDateTime>2099-01-01T00:00:00.000</PromotionEndDateTime><ClubID>0 - כלל הלקוחות</ClubID><AdditionalIsCoupon>1</AdditionalIsCoupon>
    <Groups><Group><MinPurchaseAmount>20.00</MinPurchaseAmount><PromotionItems><PromotionItem><ItemCode>7290000000003</ItemCode><RewardType>0</RewardType><MinQty>1</MinQty><DiscountedPrice>26.90</DiscountedPrice></PromotionItem></PromotionItems></Group></Groups></Promotion>
</Promotions></Root>`;

const STORES_SUBCHAINS = `<Root><ChainID>7290058140886</ChainID><ChainName>רמי לוי שיווק השקמה</ChainName><SubChains><SubChain><SubChainID>001</SubChainID><Stores>
  <Store><StoreID>001</StoreID><StoreName>תלפיות</StoreName><Address>האומן,15</Address><City>3000</City><ZipCode>9342110</ZipCode></Store>
</Stores></SubChain></SubChains></Root>`;

describe("decode", () => {
  it("unwraps gzip, ZIP-named-.gz and UTF-16LE", () => {
    const xml = "<Root><StoreId>1</StoreId></Root>";
    expect(toXmlText(gzipSync(Buffer.from(xml)))).toBe(xml);
    expect(toXmlText(zipSync({ "a.xml": new TextEncoder().encode(xml) }))).toBe(xml);
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("<Root>שלום</Root>", "utf16le")]);
    expect(toXmlText(utf16)).toBe("<Root>שלום</Root>");
  });
});

describe("file names", () => {
  it("parses every portal dialect", () => {
    expect(parseFileName("pricefull7290058140886-039-202609230521.gz")).toMatchObject({ kind: "pricefull", storeId: "39", publishedAt: "2026-09-23T02:21:00.000Z" });
    expect(parseFileName("PriceFull7290027600007-001-001-20260923-030000.gz")).toMatchObject({ kind: "pricefull", storeId: "1", publishedAt: "2026-09-23T00:00:00.000Z" });
    expect(parseFileName("Stores7290696200003-000-20260923060100-060100.gz")).toMatchObject({ kind: "stores", storeId: null });
    expect(parseFileName("readme.txt")).toBeNull();
  });

  it("converts Israel local time across DST", () => {
    expect(israelLocalToIso("2026-01-15 10:00:00")).toBe("2026-01-15T08:00:00.000Z"); // IST +2
    expect(israelLocalToIso("2026-07-15 10:00:00")).toBe("2026-07-15T07:00:00.000Z"); // IDT +3
  });
});

describe("price files", () => {
  it("normalises Cerberus and Shufersal dialects to the same record", () => {
    const a = parsePriceXml(CERBERUS_PRICE);
    const b = parsePriceXml(SHUFERSAL_PRICE);
    expect(a.storeId).toBe("39");
    expect(b.storeId).toBe("1");
    const bambaA = a.items.find((i) => i.itemCode === "7290000066318")!;
    const bambaB = b.items.find((i) => i.itemCode === "7290000066318")!;
    expect(bambaA).toMatchObject({ name: "במבה 80 גרם", manufacturer: "אסם", price: 4.9, quantity: 80 });
    expect(bambaB).toMatchObject({ name: "במבה 80 ג", manufacturer: "אסם", price: 5.2, quantity: 80 });
  });

  it("drops internal item codes that can't be compared across chains", () => {
    expect(isComparableBarcode("6", "1")).toBe(false);
    expect(isComparableBarcode("7290000066318", "0")).toBe(false);
    expect(isComparableBarcode("7290000066318", "1")).toBe(true);
  });
});

describe("promotions", () => {
  it("prices 'X for Y' deals and rejects credit-card and gift deals", () => {
    const { promos } = parsePromoXml(FLAT_PROMO);
    expect(promoUnitPrice(promos[0])).toEqual({ unitPrice: 3.33, scope: "all" });
    expect(promos[0].itemCodes).toHaveLength(2);
    expect(promoUnitPrice(promos[1])).toBeNull(); // ClubId 2 = credit card
    expect(promoUnitPrice(promos[2])).toBeNull(); // 2+1 gift
  });

  it("handles the grouped dialect: MinPurchaseAmount 0.00 is not a basket condition, coupons are rejected", () => {
    const { promos } = parsePromoXml(GROUPED_PROMO);
    expect(promos[0].isBasketLevel).toBe(false);
    expect(promoUnitPrice(promos[0])).toEqual({ unitPrice: 10, scope: "all" });
    expect(promoUnitPrice(promos[1])).toBeNull();
  });

  it("ignores expired promotions", () => {
    const { promos } = parsePromoXml(FLAT_PROMO.replace("2099-10-03", "2020-01-01"));
    expect(promoUnitPrice(promos[0])).toBeNull();
  });
});

describe("stores", () => {
  it("reads branches inside sub-chains, keeping the CBS city code", () => {
    const s = parseStoresXml(STORES_SUBCHAINS);
    expect(s.chainName).toBe("רמי לוי שיווק השקמה");
    expect(s.stores[0]).toMatchObject({ storeId: "1", name: "תלפיות", address: "האומן,15", city: "3000" });
  });
});

describe("chainQuote", () => {
  const P = (storeId: string, price: number, at = "2026-09-23T03:00:00.000Z"): StorePrice => ({ storeId, price, filePublishedAt: at, priceChangedAt: null });
  const meta = { chainId: "rami-levy", chainName: "רמי לוי", portalUrl: "https://x" };
  const now = Date.parse("2026-09-23T10:00:00Z");

  it("uses the price most branches charge and says how many share it", () => {
    const q = chainQuote("api:1", [P("1", 5.9), P("2", 5.9), P("3", 6.5)], [], meta, now)!;
    expect(q.regular).toBe(5.9);
    expect(q.source.kind).toBe("transparency-feed");
    expect(q.source.label).toContain("2 מתוך 3");
  });

  it("stamps updatedAt with the file publication time, not the price-change time", () => {
    const q = chainQuote("api:1", [{ storeId: "1", price: 5, filePublishedAt: "2026-09-23T03:00:00.000Z", priceChangedAt: "2024-01-01T00:00:00.000Z" }], [], meta, now)!;
    expect(q.updatedAt).toBe("2026-09-23T03:00:00.000Z");
  });

  it("shows a promo only if at least half the branches run it", () => {
    const promo = (storeId: string): StorePromo => ({ storeId, promoId: "p", description: "", scope: "all", clubLabel: null, minQty: 2, unitPrice: 5, totalPrice: 10, endsAt: null });
    const prices = [P("1", 6.9), P("2", 6.9), P("3", 6.9), P("4", 6.9)];
    expect(chainQuote("api:1", prices, [promo("1")], meta, now)!.promo).toBeUndefined();
    expect(chainQuote("api:1", prices, [promo("1"), promo("2")], meta, now)!.promo).toMatchObject({ unitPrice: 5, label: "2 ב-10 ₪", minQuantity: 2 });
  });

  it("cleans placeholder manufacturers and doesn't file milk chocolate under dairy", () => {
    expect(cleanManufacturer("---")).toBeUndefined();
    expect(cleanManufacturer("לא ידוע")).toBeUndefined();
    expect(cleanManufacturer("אסם")).toBe("אסם");
    expect(guessCategory("שוקולד פרה חלב 100ג עלית").category).toBe("snacks");
    expect(guessCategory("חלב בקרטון 3% שומן 1 ל").category).toBe("dairy");
  });

  it("parses pack sizes from the files' unit strings", () => {
    expect(parseSize(80, "גרמים", false)).toEqual({ amount: 80, unit: "g" });
    expect(parseSize(500, 'מ"ל', false)).toEqual({ amount: 500, unit: "ml" });
    expect(parseSize(1.5, "ליטרים", false)).toEqual({ amount: 1.5, unit: "l" });
    expect(parseSize(1, 'ק"ג', true)).toEqual({ amount: 1, unit: "kg" });
  });

  it("trusts the size in the name over a wrong UnitQty (real case: 400 g cereal filed as litres)", () => {
    expect(parseSize(400, "ליטר", false, "קורנפלקס תלמה 400 גר")).toEqual({ amount: 400, unit: "g" });
    expect(parseSize(448, "גרם", false, "קורנפלקס דבש 448ג תלמה")).toEqual({ amount: 448, unit: "g" });
    expect(parseSize(1.5, "ליטר", false, "קוקה קולה 1.5 ל")).toEqual({ amount: 1.5, unit: "l" });
    expect(sizeFromName("במבה 80 גרם אסם")).toEqual({ amount: 80, unit: "g" });
    expect(sizeFromName("גבינה לבנה 5%")).toBeUndefined();
    expect(sizeFromName("קוקה קולה 6*1.5 ליטר")).toEqual({ amount: 9, unit: "l" });
    expect(sizeFromName("טונה 4X160 גרם")).toEqual({ amount: 640, unit: "g" });
  });
});
