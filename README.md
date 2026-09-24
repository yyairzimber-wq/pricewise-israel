# PriceWise ישראל

השוואת מחירי מוצרי סופר בישראל: מצלמים או סורקים מוצר, ורואים איפה הוא זול יותר, עם מקור ומועד עדכון לכל מחיר.

**Stack:** React 19 + TypeScript + Vite, Zustand, ZXing (barcode). Node server (SQLite, Claude vision) for real prices and AI. Hebrew/RTL-first, light/dark, responsive. Capacitor Android project included.

## Run

```bash
npm install
npm run dev        # http://localhost:5197
npm test           # pricing rules, demo data sanity, quantity parser
npm run build      # typecheck + production build → dist/
```

### On your phone, at home (same Wi-Fi)

```bash
npm run api          # window 1: the price server
npm run dev:phone    # window 2: HTTPS dev server on your network
```

Open `https://<this-computer's-IP>:5197` on the phone (`ipconfig` shows the IP). Accept the one-time certificate warning, because the certificate is self-signed and HTTPS is required for the camera. Allow Node.js on *Private networks* if Windows Firewall asks. Phone mode talks to the price server through the dev proxy (`/pw-api`), with no settings to change.

## Honesty rules (enforced in code, not just UI)

- **No invented prices.** `DemoPriceProvider` only prices the bundled demo catalog. Every quote it returns is tagged `source.kind: "demo"`, and the UI shows a demo warning wherever prices appear. Real products, such as a barcode found on Open Food Facts, get **"אין לנו כרגע מחיר מאומת"**.
- Every price shows **when it was updated** and **where it came from**.
- **Regular, sale and club prices are kept separate.** Multi-buy deals count only when the quantity qualifies, and club prices only when the user turns them on.
- **Stale prices** (older than the user's limit) are shown for reference but never chosen as "the cheapest".
- Demo barcodes use the GS1 `200–299` internal-use range, so they can never match a real product.
- Demo branches are clearly marked, and the app warns before navigating to one.

## Architecture

```
src/core/                  ← no React; portable to React Native / a server
  types.ts                 domain model (Product, PriceQuote, Branch, DataSource…)
  providers/
    types.ts               CatalogProvider · PriceProvider · BranchProvider · RecognitionProvider
    registry.ts            the ONE place that picks implementations (demo vs api)
    catalog/               Demo · OpenFoodFacts (real product data, no prices) · Composite
    prices/, branches/     Demo implementations
    http.ts                HTTP implementations for a real backend (docs/API.md)
    recognition/           HttpVisionRecognizer (Claude) · DemoRecognizer
  services/
    pricing.ts             compareProduct, compareBasket, freshness, bestPrice (pure, tested)
    recognition.ts         photo → barcode-in-photo → AI → catalog match → confident?
    barcode.ts             ZXing camera + still-image decoding
    geo.ts, format.ts, text.ts
  data/                    chains (reference) + demo/ (clearly-labelled sample data)
src/state/                 Zustand store (persisted) + hooks (useProviders, useQuotes…)
src/ui/                    screens, components, layout
```

## Real prices: the bundled server (`server/`)

The server downloads the price files that chains are required by law to publish, from 7 portal types covering **22 chains**: Shufersal, Rami Levy, Yochananof, Osher Ad, Tiv Taam, Freshmarket, Carrefour, Victory, Mahsanei Hashuk, Hazi Hinam, Super-Pharm, Keshet Teamim, Dor Alon, Stop Market, Politzer, King Store, Zol Vebegadol, Good Pharm, Super Sapir, Shuk Hayir, Shefa Birkat Hashem and Bareket. It normalises them into SQLite and serves the app's API. Chains whose feeds need a password (Salach Dabach, Yellow, Super Yuda) are deliberately not included. Product photos come from Open Food Facts where available.

```bash
npm run ingest -- --stores 5   # real prices from 5 branches per chain (--stores all = every branch)
npm run geocode                # branch coordinates (OpenStreetMap, 1 req/s)
npm run api                    # http://localhost:8787
```

Then in the app: **הגדרות → מקור נתונים → שרת מחירים → `http://localhost:8787`**, or set `VITE_DATA_MODE=api` and `VITE_API_BASE_URL`. No UI code changes. Portal details, parser quirks, and the exact rules for "updated", promotions and the chain price are in [docs/API.md](docs/API.md).

```
server/src/
  config.ts       chains → portal + GS1 chain codes
  portals.ts      Cerberus (FTPS) · Shufersal · PublishPrice · Laibcatalog · Bina · Hazi Hinam · Super-Pharm
  decode.ts       gzip / ZIP-disguised-as-gz / UTF-16 / windows-1255
  parse.ts        both XML dialects → PriceRecord / PromoRecord / StoreRecord; promoUnitPrice rules
  aggregate.ts    branch rows → chain PriceQuote (mode price, coverage label, promo majority rule)
  ingest.ts       download (cached) → parse → SQLite; delists items missing from a PriceFull
  repo.ts, api.ts HTTP API (docs/API.md contract)
  geocode.ts      address normalisation → Nominatim → verified Photon; settlements.ts: CBS city codes
  recognize.ts    POST /recognize — Claude vision (key stays on the server)
  images.ts       product photos from Open Food Facts, cached
```

**AI recognition ("צלם מוצר"):** start the server with `ANTHROPIC_API_KEY` in its environment (PowerShell: `$env:ANTHROPIC_API_KEY="…"`, then `npm run api`). Without it, `/recognize` answers 503 and the app says AI isn't set up. Barcodes visible in a photo are still read on the device.

## Public link on Vercel (static snapshot)

Live at **https://pricewise-israel.vercel.app**. Vercel can't run the price server, which needs an Israeli IP and a ~3 GB database, so the server exports a compact **daily snapshot** (`server/src/export.ts`, about 64 MB and 1,000 files). The app reads it in `static` mode (`src/core/providers/static.ts`). The link works even when this computer is off, and prices simply age: after 72 h they show as "לא עדכני".

```bash
npm run publish:vercel     # build + export + deploy (~15 min), uses this machine's Vercel login
node server/src/cli.ts serve --refresh-hours 6 --stores all --publish-vercel   # auto-publish after each refresh
```

Branch-level prices are reconstructed from per-chain exceptions. Branch-specific promotions and price history aren't in the snapshot. AI recognition isn't available on the static site. Vercel Hobby is for non-commercial use, so move to Pro before commercial launch.

## Deploying (one server: app + prices + AI)

The server must run **in Israel**, because some portals block foreign IPs. Examples: a VPS in AWS `il-central-1` (Tel Aviv) or an Israeli hosting provider. Point a domain at it, then:

```bash
cp deploy/.env.example deploy/.env      # DOMAIN=…, ANTHROPIC_API_KEY=… (optional)
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

Caddy provides HTTPS automatically. The container serves at once and ingests in the background (the first full run takes about 1.5 h), then every 6 h. Data lives in a Docker volume.

## Screens

Home · Photo capture · Barcode scan · Search · Comparison results · Product details (with price trend) · Basket comparison (split basket, and **cheapest near me including travel cost**, using each branch's own prices) · Nearby branches (per-branch prices, Waze/Google/Apple navigation) · Favorites (**price-drop alerts**) · Scan history · Settings.

## Android app

The Capacitor project is in `android/` (camera, location and RTL already configured).

1. Deploy the server first. The app needs an HTTPS address.
2. Put that address in `.env.native` (`VITE_API_BASE_URL=https://<domain>/pw-api`).
3. Install **Android Studio** (it brings the JDK and Android SDK).
4. Run `npm run build:native` then `npm run android`, and build or run from Android Studio.

Publishing on Google Play needs a developer account (a one-time $25 fee). An iOS build needs a Mac with Xcode and an Apple Developer account ($99/year). Run `npm i @capacitor/ios && npx cap add ios` there.
