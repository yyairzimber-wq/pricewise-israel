import { SERVER_CONFIG, SOURCES } from "./config.ts";
import { createApiServer } from "./api.ts";
import { openDb } from "./db.ts";
import { geocodeStores, importGeocache } from "./geocode.ts";
import { ingest } from "./ingest.ts";
import { status } from "./repo.ts";
import { recognitionConfigured } from "./recognize.ts";
import { publishVercel } from "./publish.ts";
import { exportStatic } from "./export.ts";
import fs from "node:fs";

/**
 *   node server/src/cli.ts ingest [--chains shufersal,rami-levy] [--stores 5|all] [--reparse]
 *   node server/src/cli.ts geocode [--limit 200] [--all-stores] [--retry-approximate]
 *   node server/src/cli.ts serve [--port 8787] [--refresh-hours 6 --stores all] [--ingest-on-start]
 *   node server/src/cli.ts refresh [--stores all] [--publish-vercel] [--force]   (one cycle, for a scheduler)
 *   node server/src/cli.ts publish-vercel [--dry-run]   (also: serve … --publish-vercel)
 *   node server/src/cli.ts export-static [--out site]
 *   node server/src/cli.ts geocache-export|geocache-import
 *   node server/src/cli.ts status
 */

const [cmd = "help", ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? (rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : "true") : undefined;
};
const log = (m: string) => console.log(m);

const db = openDb(SERVER_CONFIG.dbPath);

switch (cmd) {
  case "ingest": {
    const stores = flag("stores") ?? "5";
    const chains = flag("chains")?.split(",");
    const unknown = chains?.filter((c) => !SOURCES.some((s) => s.chainId === c));
    if (unknown?.length) {
      console.error(`unknown chains: ${unknown.join(", ")}. known: ${SOURCES.map((s) => s.chainId).join(", ")}`);
      process.exit(1);
    }
    const started = Date.now();
    const reports = await ingest(db, { chains, storesPerChain: stores === "all" ? "all" : Math.max(1, Number(stores)), reparse: flag("reparse") === "true", log });
    console.log(`\nסיכום (${Math.round((Date.now() - started) / 1000)} שניות):`);
    console.table(reports.map((r) => ({ chain: r.chainId, priceFiles: r.priceFiles, prices: r.prices, promoFiles: r.promoFiles, promos: r.promos, skipped: r.skipped, errors: r.errors.length })));
    const errors = reports.reduce((n, r) => n + r.errors.length, 0);
    const fresh = reports.reduce((n, r) => n + r.priceFiles + r.promoFiles, 0);
    if (errors) {
      console.log(`⚠ ${errors} שגיאות — פירוט בשורות ✗ למעלה.`);
      process.exitCode = 2;
    } else if (fresh === 0) {
      console.log("✓ אין קבצים חדשים מאז הקליטה הקודמת — הנתונים כבר עדכניים. (הרשתות מפרסמות קבצים מלאים פעם ביום.)");
    } else {
      console.log(`✓ נקלטו ${fresh} קבצים חדשים.`);
    }
    break;
  }
  case "geocode": {
    const r = await geocodeStores(db, {
      onlyWithPrices: flag("all-stores") !== "true",
      limit: Number(flag("limit") ?? 200),
      retryApproximate: flag("retry-approximate") === "true",
      log,
    });
    console.log(`
מתוך ${r.attempted}: כתובת מדויקת ${r.address} · רחוב ${r.street} · עיר בלבד ${r.city} · לא נמצא ${r.none}`);
    break;
  }
  case "serve": {
    const port = Number(flag("port") ?? SERVER_CONFIG.port);
    // Also serve the built app if it exists (single-server deployment).
    const distDir = new URL("../../dist/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
    const server = createApiServer(db, { corsOrigin: process.env.CORS_ORIGIN, staticDir: fs.existsSync(distDir) ? distDir : undefined });
    server.on("error", (e: NodeJS.ErrnoException) => {
      if (e.code === "EADDRINUSE") {
        console.error(`פורט ${port} כבר תפוס — כנראה השרת כבר רץ בחלון אחר. עצרו אותו, או הריצו עם --port 8788.`);
        process.exit(1);
      }
      throw e;
    });
    server.listen(port, () => {
      console.log(`PriceWise API → http://localhost:${port}  (db: ${SERVER_CONFIG.dbPath})`);
      console.log(recognitionConfigured() ? "AI recognition: on" : "AI recognition: off (set ANTHROPIC_API_KEY to enable)");
    });
    // Chains publish PriceFull/PromoFull files daily (and partial updates hourly):
    // optionally refresh in-process so the API never serves yesterday's prices.
    const hours = Number(flag("refresh-hours") ?? 0);
    if (hours > 0) {
      const stores = flag("stores") ?? "5";
      let running = false;
      const refresh = async () => {
        if (running) return;
        running = true;
        try {
          const log = (m: string) => console.log(`[refresh] ${m}`);
          await ingest(db, { storesPerChain: stores === "all" ? "all" : Number(stores), log });
          // Locate branches that appeared since last time (1 req/s, polite).
          await geocodeStores(db, { onlyWithPrices: true, limit: 300, log });
          // Optionally push the fresh prices to the public Vercel link.
          if (flag("publish-vercel") === "true") {
            const r = publishVercel(db, log);
            log(`published ${r.url ?? ""}`);
          }
        } catch (e) {
          console.error("[refresh] failed", e);
        } finally {
          running = false;
        }
      };
      setInterval(refresh, hours * 3_600_000);
      console.log(`auto-refresh every ${hours}h (${stores} branches per chain)`);
      // Serve right away; with --ingest-on-start the first refresh runs in the background now.
      if (flag("ingest-on-start") === "true") void refresh();
    }
    break;
  }
  case "refresh": {
    // One full cycle, for a scheduler: new price files → new branch locations → (optionally) publish.
    const started = Date.now();
    const stamp = () => new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
    console.log(`=== refresh started ${stamp()} ===`);
    const stores = flag("stores") ?? "all";
    const reports = await ingest(db, { storesPerChain: stores === "all" ? "all" : Number(stores), log });
    const fresh = reports.reduce((n, r) => n + r.priceFiles + r.promoFiles, 0);
    const errors = reports.reduce((n, r) => n + r.errors.length, 0);
    console.log(`ingest: ${fresh} new files, ${errors} errors`);
    const restored = importGeocache(db, "server/geocache.json");
    if (restored) console.log(`restored ${restored} saved branch locations`);
    await geocodeStores(db, { onlyWithPrices: true, limit: Number(flag("geocode-limit") ?? 300), log });
    if (flag("publish-vercel") === "true") {
      if (fresh === 0 && flag("force") !== "true") console.log("no new files — skipping publish");
      else {
        const r = publishVercel(db, log);
        console.log(`published ${r.url ?? ""}`);
      }
    }
    console.log(`=== refresh done ${stamp()} (${Math.round((Date.now() - started) / 60000)} min) ===`);
    if (errors && flag("allow-partial") !== "true") process.exitCode = 2;
    break;
  }
  case "export-static": {
    const out = flag("out") ?? "site";
    const r = exportStatic(db, out, log);
    console.log(`✓ ${r.products} products · ${(r.bytes / 1e6).toFixed(1)}MB → ${out}/data`);
    break;
  }
  case "geocache-export": {
    // Branch coordinates → a small JSON committed to the repo, so a fresh cloud run doesn't re-geocode everything.
    const rows = db.prepare("SELECT chain_id, store_id, address, lat, lng, geo_precision FROM stores WHERE geocoded_at IS NOT NULL ORDER BY chain_id, CAST(store_id AS INTEGER)").all();
    fs.writeFileSync(flag("out") ?? "server/geocache.json", JSON.stringify(rows));
    console.log(`✓ ${rows.length} branch locations`);
    break;
  }
  case "geocache-import": {
    console.log(`✓ ${importGeocache(db, flag("in") ?? "server/geocache.json")} branch locations restored`);
    break;
  }
  case "publish-vercel": {
    const r = publishVercel(db, log, { deploy: flag("dry-run") !== "true" });
    console.log(r.url ? `✓ פורסם: ${r.url}` : "✓ נבנה (dry-run, לא הועלה)");
    break;
  }
  case "status":
    console.log(JSON.stringify(status(db), null, 2));
    break;
  default:
    console.log("usage: cli.ts ingest|geocode|serve|status  (see header comment)");
}
