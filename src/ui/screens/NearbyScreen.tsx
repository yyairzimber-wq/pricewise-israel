import { Clock, LocateFixed, MapPin, Navigation } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getChain } from "../../core/data/chains";
import { formatILS } from "../../core/services/format";
import { distanceKm, formatDistance, navigationLinks, openState } from "../../core/services/geo";
import { bestPrice, freshness } from "../../core/services/pricing";
import type { Branch, PriceQuote } from "../../core/types";
import { useGeo } from "../../state/geo";
import { useAsync, useProduct, useProviders, useQuotes } from "../../state/hooks";
import { useApp } from "../../state/store";
import { ChainAvatar, DemoBanner, EmptyState, ProductThumb, Sheet, SkeletonRows } from "../components/primitives";
import { TopBar } from "../components/TopBar";

export function NearbyScreen() {
  const [params] = useSearchParams();
  const productId = params.get("product") ?? undefined;
  const productQ = useProduct(productId);
  const product = productQ.data ?? null;
  const quotesQ = useQuotes(product);
  const { branches: branchProvider, prices: priceProvider } = useProviders();
  const followed = useApp((s) => s.followedChains);
  const radiusKm = useApp((s) => s.radiusKm);
  const prefs = useApp((s) => s.prefs);
  const [chainFilter, setChainFilter] = useState<string | null>(null);
  const [navTarget, setNavTarget] = useState<Branch | null>(null);
  const loc = useGeo();
  const locate = loc.locate;

  const chainIds = product && quotesQ.data ? followed.filter((id) => quotesQ.data!.some((q) => q.chainId === id)) : followed;
  const branchesQ = useAsync(
    () => branchProvider.getBranches({ near: loc.point, radiusKm: loc.status === "granted" ? radiusKm : undefined, chainIds, limit: 80 }),
    [branchProvider, loc.point.lat, loc.point.lng, radiusKm, chainIds.join(",")],
  );

  // Prices differ between branches of the same chain, so ask for each listed branch's own price.
  const branchIdsKey = (branchesQ.data ?? []).map((b) => b.id).join(",");
  const branchQuotesQ = useAsync(
    async () => (product && branchIdsKey ? priceProvider.getQuotes(product, { branchIds: branchIdsKey.split(",") }) : []),
    [priceProvider, product?.id, branchIdsKey],
  );

  type ShownPrice = { price: number; stale: boolean; kind: string; scope: "branch" | "chain" };
  const toShown = (q: PriceQuote, scope: ShownPrice["scope"]): ShownPrice | null => {
    const b = bestPrice(q, prefs);
    return b ? { price: b.price, stale: freshness(q.updatedAt, prefs.maxAgeHours) === "stale", kind: b.kind, scope } : null;
  };
  const priceByChain = useMemo(() => {
    const m = new Map<string, ShownPrice>();
    for (const q of quotesQ.data ?? []) {
      const p = toShown(q, "chain");
      if (p) m.set(q.chainId, p);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotesQ.data, prefs]);
  const priceByBranch = useMemo(() => {
    const m = new Map<string, ShownPrice>();
    for (const q of branchQuotesQ.data ?? []) {
      const p = q.branchId ? toShown(q, "branch") : null;
      if (p) m.set(q.branchId!, p);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchQuotesQ.data, prefs]);

  // Town-level (approximate) pins sit at the town centre and would look closer
  // than they are: rank them as if 3 km further, after precisely-located branches.
  const rankDistance = (b: Branch) => distanceKm(loc.point, b) + (b.approximateLocation ? 3 : 0);
  const list = (branchesQ.data ?? []).filter((b) => !chainFilter || b.chainId === chainFilter).sort((a, b) => rankDistance(a) - rankDistance(b))
    .slice(0, 40);
  const chainsInList = [...new Set((branchesQ.data ?? []).map((b) => b.chainId))].map(getChain);
  const anyDemo = (branchesQ.data ?? []).some((b) => b.source.kind === "demo");

  return (
    <div className="page">
      <TopBar back={!!productId} title="סניפים קרובים" />
      <h1 className="large-title">סניפים קרובים</h1>
      <p className="subtitle">{loc.status === "granted" ? `ברדיוס ${radiusKm} ק״מ ממך` : `מציגים סביב ${loc.label}`}</p>

      {product && (
        <div className="card pad" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <ProductThumb product={product} />
          <div className="row-main">
            <div className="small muted">מחירים עבור</div>
            <b>{product.name}</b>
          </div>
        </div>
      )}

      {loc.status !== "granted" && (
        <div className="card pad" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <span className="tile-icon blue">
            <LocateFixed size={20} />
          </span>
          <div className="row-main">
            <b>{loc.status === "denied" ? "הגישה למיקום נחסמה" : "מצאו סניפים לידכם"}</b>
            <div className="small muted">
              {loc.status === "denied" ? "אפשר לאשר מיקום בהגדרות הדפדפן. בינתיים מוצג מרכז תל אביב." : "המיקום משמש רק לחישוב מרחק ואינו נשמר."}
            </div>
          </div>
          {loc.status !== "denied" && (
            <button className="btn sm primary" onClick={locate} disabled={loc.status === "asking"}>
              {loc.status === "asking" ? <span className="spinner" /> : "אישור מיקום"}
            </button>
          )}
        </div>
      )}

      {anyDemo && (
        <div style={{ marginBottom: 12 }}>
          <DemoBanner>
            <b>סניפי הדגמה.</b> מיקומי הסניפים, הכתובות ושעות הפתיחה כאן אינם אמיתיים — הם מדגימים את החוויה עד לחיבור מאגר סניפים.
          </DemoBanner>
        </div>
      )}

      {chainsInList.length > 1 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          <button className={`chip ${!chainFilter ? "on" : ""}`} onClick={() => setChainFilter(null)}>
            כל הרשתות
          </button>
          {chainsInList.map((c) => (
            <button key={c.id} className={`chip ${chainFilter === c.id ? "on" : ""}`} onClick={() => setChainFilter(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {branchesQ.loading && !branchesQ.data ? (
        <SkeletonRows count={6} />
      ) : list.length === 0 ? (
        <EmptyState icon={<MapPin size={34} />} title="לא נמצאו סניפים" text="נסו להגדיל את הרדיוס בהגדרות או לבחור רשת אחרת." />
      ) : (
        <div className="list stagger">
          {list.map((b) => {
            const chain = getChain(b.chainId);
            const d = distanceKm(loc.point, b);
            const open = b.hours ? openState(b.hours) : null;
            const price = priceByBranch.get(b.id) ?? priceByChain.get(b.chainId);
            return (
              <div className="row" key={b.id} style={{ alignItems: "flex-start", paddingBlock: 14 }}>
                <ChainAvatar chain={chain} />
                <div className="row-main">
                  <div className="row-title">{b.name}</div>
                  <div className="row-sub">{b.address}</div>
                  <div className="meta-line">
                    {b.approximateLocation ? (
                      <span style={{ fontWeight: 600, color: "var(--warn)" }} title="נמצא רק מיקום היישוב, המרחק אינו מדויק">מיקום משוער · ~{formatDistance(d)}</span>
                    ) : (
                      <span className="num" style={{ fontWeight: 600, color: "var(--text-2)" }}>{formatDistance(d)}</span>
                    )}
                    {open ? (
                      <span className="dot" style={{ color: open.open ? "var(--accent-strong)" : "var(--danger)", fontWeight: 600 }}>
                        <Clock style={{ verticalAlign: "-2px" }} /> {open.open ? "פתוח" : "סגור"} · {open.label}
                      </span>
                    ) : (
                      <span className="dot">
                        <Clock style={{ verticalAlign: "-2px" }} /> שעות פתיחה לא ידועות
                      </span>
                    )}
                  </div>
                  {product && (
                    <div style={{ marginTop: 6 }}>
                      {price && !price.stale ? (
                        <span className="badge green num">
                          {formatILS(price.price)} {price.kind === "promo" ? "· מבצע" : price.kind === "club" ? "· מועדון" : ""}
                        </span>
                      ) : (
                        <span className="badge">אין לנו כרגע מחיר מאומת</span>
                      )}
                      {price && !price.stale && <span className="tiny faint" style={{ marginInlineStart: 6 }}>{price.scope === "branch" ? "מחיר בסניף הזה" : "מחיר רשתי"}</span>}
                    </div>
                  )}
                </div>
                <button className="btn sm tinted" onClick={() => setNavTarget(b)} aria-label={`ניווט אל ${b.name}`}>
                  <Navigation size={16} /> ניווט
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Sheet open={!!navTarget} onClose={() => setNavTarget(null)} label="ניווט לסניף">
        {navTarget && (
          <>
            <h2>ניווט ל{navTarget.name}</h2>
            <p className="lead">{navTarget.address}</p>
            {navTarget.source.kind === "demo" && (
              <div style={{ marginBottom: 12 }}>
                <DemoBanner>
                  <b>זהו סניף הדגמה.</b> המיקום אינו של סניף אמיתי — הניווט יוביל לנקודה אקראית בעיר.
                </DemoBanner>
              </div>
            )}
            <div style={{ display: "grid", gap: 10 }}>
              {(() => {
                const links = navigationLinks(navTarget, navTarget.name);
                return (
                  <>
                    <a className="btn primary block" href={links.waze} target="_blank" rel="noreferrer">Waze</a>
                    <a className="btn block" href={links.google} target="_blank" rel="noreferrer">Google Maps</a>
                    <a className="btn block" href={links.apple} target="_blank" rel="noreferrer">Apple Maps</a>
                  </>
                );
              })()}
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
