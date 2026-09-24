# PriceWise backend contract

The app talks to prices through `PriceProvider`, products through `CatalogProvider`
and branches through `BranchProvider` (`src/core/providers/types.ts`). In **api**
mode the HTTP implementations in `src/core/providers/http.ts` call the endpoints
below. Any backend that honours this contract works; nothing in the UI changes.

## Where real prices come from

Since 2015, under the Food Act's price-transparency rules (חוק קידום התחרות בענף המזון),
large Israeli chains must publish machine-readable files for every branch:

| File | Content |
|------|---------|
| `Stores*.xml` | branch list: id, name, address, city |
| `PriceFull*.xml` / `Price*.xml` | shelf price per item code (barcode) per branch, with `PriceUpdateDate` |
| `PromoFull*.xml` / `Promo*.xml` | promotions: price, min quantity, validity, club-only flag |

Each chain hosts the files on its own portal. **This repo includes a working
implementation in `server/`** (see "The bundled server" below).

### Portals (verified 2026-09-23)

| Portal | Chains | Access |
|--------|--------|--------|
| `url.retail.publishedprices.co.il` (Cerberus) | רמי לוי, יוחננוף, אושר עד, טיב טעם, פרשמרקט | FTPS, public username per chain, empty password |
| `prices.shufersal.co.il` | שופרסל | HTML grid → Azure blob links (short-lived SAS) |
| `prices.carrefour.co.il` | קרפור | file list embedded in a `<script>` |
| `laibcatalog.co.il` | ויקטורי, מחסני השוק | JSON: `/webapi/api/getfiles?edi=<chain code>` |

Some portals block non-Israeli IPs, so run ingestion from an Israeli host.

### Quirks the parser handles

- Files named `.gz` that are actually ZIP archives (Cerberus); `Stores` files in UTF-16LE.
- Two XML dialects: `ItemNm`/`PriceUpdateDate` vs `ItemName`/`PriceUpdateTime`; flat
  promotions vs promotions with `Groups/PromotionItem` holding per-item reward data.
- The city field in `Stores` files is a CBS settlement code (3000 = ירושלים). It's
  resolved using the official list on data.gov.il.
- Internal item codes (produce "100", test items "6") are dropped. Only real barcodes
  can be matched across chains.
- `MinPurchaseAmount` of `0.00` doesn't mean a minimum-purchase condition.

### What "updated" means

`PriceUpdateDate` in the files is when the chain last **changed** a price, which
can be a year ago. What proves the price is still current is the file itself,
published daily. So `PriceQuote.updatedAt` = **file publication time**, and the
change time is stored separately (`prices.price_changed_at`).

### Promotions we price (and the ones we don't)

A deal becomes `promo`/`club` only when its per-unit price is certain: "X units for Y ₪"
or fixed-price deals (reward types 1/3/10), for all customers (ClubId 0) or club
members (ClubId 1), currently active, not weighted. **Excluded:** coupons,
credit-card deals (ClubId 2/3), basket-level conditions, gifts/1+1/"second at half
price", mixed-price groups. At chain level, a deal shows only if at least half
the sampled branches run it.

### Chain price

A chain's `regular` is the price most of its sampled branches charge. `source.label`
says how many share it ("המחיר ב-4 מתוך 5 סניפים שנבדקו"). With `branchId`, the
quote is that branch's own price.

### Branch data

Stores files have addresses but **no coordinates and no opening hours**. `hours`
is omitted, and the app shows "שעות פתיחה לא ידועות".

Addresses are messy ("7 דרך הערבה", "שד.הארזים", "רוטישילד", even URLs), so
`server/src/geocode.ts` normalises them and tries, in order:

1. **Nominatim structured search** (street + city). Precise or nothing.
2. **Photon** (OSM, fuzzy). Catches typos and abbreviations, but its fuzziness also
   returns similarly-named streets in *other* towns (seen: "השומר 10, בני ברק" →
   a street called "בני ברק" in Tel Aviv). A Photon hit is kept **only if both the
   town and the street name verify** (one-letter typo tolerance on names of 5+
   letters). Otherwise it's discarded, because a wrong pin is worse than an
   approximate one.
3. **Nominatim town lookup.** Flagged `approximateLocation`, and the app shows
   "מיקום משוער".

`npm run geocode -- --retry-approximate` re-tries town-level and missing branches,
and never downgrades an existing result.

Before you ship: check each portal's terms of use, and replace public Nominatim
with your own instance or a commercial geocoder.

## The bundled server

```bash
npm run ingest -- --stores 5          # 5 branches per chain (≈2–4 min); --stores all for everything
npm run ingest -- --chains shufersal  # one chain
npm run geocode                        # coordinates for ingested branches (1 req/s)
npm run api                            # http://localhost:8787
node server/src/cli.ts serve --refresh-hours 6   # serve + re-ingest every 6 h
```

SQLite at `server/data/pricewise.db` (Node's built-in `node:sqlite`, no native deps).
Downloads are cached in `server/.cache/`. Re-parse without re-downloading with `--reparse`.
Then in the app: **הגדרות → מקור נתונים → שרת מחירים → `http://localhost:8787`**.

## Endpoints

All responses are JSON. 404 means "not found" (not an error).

```
GET /products?barcode=7290000066318            → Product | 404
GET /products?q=קורנפלקס&limit=20                → Product[]
GET /products/{id}                              → Product | 404
GET /prices?productId=…&barcode=…&chains=a,b&branchId=…   → PriceQuote[]
GET /prices/history?productId=…&chainId=…&days=30         → PricePoint[]
GET /branches?lat=…&lng=…&radiusKm=10&chains=a,b&limit=40 → Branch[]
```

### PriceQuote

```jsonc
{
  "productId": "api:7290000066318",
  "chainId": "shufersal",            // ids from src/core/data/chains.ts
  "branchId": "shufersal-001",       // optional
  "regular": 4.9,                    // null = listed but price unknown
  "promo": { "unitPrice": 3.95, "label": "2 ב-7.90 ₪", "minQuantity": 2, "validUntil": "2026-10-01T00:00:00Z" },
  "club":  { "unitPrice": 4.5, "clubName": "מועדון שופרסל" },
  "currency": "ILS",
  "updatedAt": "2026-09-23T06:10:00Z",   // when the CHAIN last confirmed this price
  "source": { "kind": "transparency-feed", "label": "קובץ שקיפות מחירים — שופרסל", "url": "https://…" }
}
```

Rules the app enforces on whatever you return:

- A quote older than the user's limit (24 h / 3 days / week) is shown as "לא עדכני" and never picked as cheapest.
- A chain with no quote is listed under "אין לנו כרגע מחיר מאומת". Never fill gaps with estimates.
- `promo` only counts when the shopper's quantity meets `minQuantity`; `club` only when the user turns club prices on.
- `source.kind: "demo"` makes the UI show the demo warning, so never use it for real data.

### Product / Branch

See `Product` and `Branch` in `src/core/types.ts`. Hours are keyed 0 (Sunday) to 6 (Saturday), `null` = closed.

## AI recognition endpoint

`POST /recognize` (or `/pw-api/recognize`) with `{ "image": "<base64 jpeg>", "mediaType": "image/jpeg" }` →
`{ "candidates": [{ "name", "brand", "sizeText", "barcode", "confidence" }] }`.
Implemented in `server/src/recognize.ts` (Claude vision, structured output, server-side
refusal fallback). Needs `ANTHROPIC_API_KEY` in the server's environment; without it the
endpoint returns **503** and the app explains that AI isn't set up. The app first tries to
decode a barcode in the photo on the device, and only calls the endpoint when there isn't one.

All endpoints are also served under the `/pw-api` prefix. When `dist/` exists, the server
also serves the web app itself at `/`, so one server can host everything.
