import { Car, LocateFixed, MapPin, Navigation } from "lucide-react";
import { useMemo } from "react";
import { formatILS } from "../../core/services/format";
import { distanceKm, formatDistance, navigationLinks } from "../../core/services/geo";
import { compareBasketNearby, type BranchStop } from "../../core/services/pricing";
import type { Branch, PriceQuote } from "../../core/types";
import { useGeo } from "../../state/geo";
import { useAsync, useProviders } from "../../state/hooks";
import { useApp, type BasketItem } from "../../state/store";
import { ChainAvatar, Segmented } from "./primitives";

/**
 * "Where is the whole basket cheapest near me — including the drive?"
 * Prices the basket at the nearest branch of each chain (branch-level prices,
 * which really do differ within a chain) and adds a round-trip travel cost.
 */
export function NearbyBasket({ basket }: { basket: BasketItem[] }) {
  const geo = useGeo();
  const { branches: branchProvider, prices } = useProviders();
  const followed = useApp((s) => s.followedChains);
  const radiusKm = useApp((s) => s.radiusKm);
  const prefs = useApp((s) => s.prefs);
  const costPerKm = useApp((s) => s.travelCostPerKm);
  const setTravelCost = useApp((s) => s.setTravelCost);
  const located = geo.status === "granted";

  // Nearest branch of each chain within the radius.
  const stopsQ = useAsync<{ stops: BranchStop[]; branches: Branch[] }>(async () => {
    if (!located) return { stops: [], branches: [] };
    const list = await branchProvider.getBranches({ near: geo.point, radiusKm, chainIds: followed, limit: 150 });
    // Per chain: the nearest branch with a precise location. A town-level
    // (approximate) pin sits at the town centre and would look deceptively
    // close, so it's only used when the chain has no precisely-located branch.
    const byChain = new Map<string, Branch>();
    for (const b of list) {
      const cur = byChain.get(b.chainId);
      if (!cur || (cur.approximateLocation && !b.approximateLocation)) byChain.set(b.chainId, b);
    }
    const nearest = [...byChain.values()].sort((a, b) => distanceKm(geo.point, a) - distanceKm(geo.point, b)).slice(0, 12);
    return {
      branches: nearest,
      stops: nearest.map((b) => ({ id: b.id, chainId: b.chainId, name: b.name, distanceKm: distanceKm(geo.point, b), approximate: b.approximateLocation })),
    };
  }, [branchProvider, located, geo.point.lat, geo.point.lng, radiusKm, followed.join(",")]);

  const stopIds = (stopsQ.data?.stops ?? []).map((s) => s.id).join(",");
  const productIds = basket.map((b) => b.product.id).join(",");
  const quotesQ = useAsync(async () => {
    if (!stopIds) return new Map<string, PriceQuote[]>();
    const entries = await Promise.all(basket.map(async (b) => [b.product.id, await prices.getQuotes(b.product, { branchIds: stopIds.split(",") }).catch(() => [])] as const));
    return new Map<string, PriceQuote[]>(entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices, stopIds, productIds]);

  const results = useMemo(
    () => (quotesQ.data && stopsQ.data ? compareBasketNearby(basket, quotesQ.data, stopsQ.data.stops, { prefs, costPerKm }) : []),
    [quotesQ.data, stopsQ.data, basket, prefs, costPerKm],
  );
  const best = results.find((r) => r.complete);

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">הכי משתלם לידך</h2>
      </div>

      {!located ? (
        <div className="card pad" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="tile-icon blue">
            <LocateFixed size={20} />
          </span>
          <div className="row-main">
            <b>{geo.status === "denied" ? "הגישה למיקום נחסמה" : "איפה הסל הכי זול כולל הנסיעה?"}</b>
            <div className="small muted">
              {geo.status === "denied" ? "אפשר לאשר מיקום בהגדרות הדפדפן." : "נחשב את הסל בסניף הקרוב של כל רשת — לפי המחירים של הסניף עצמו."}
            </div>
          </div>
          {geo.status !== "denied" && (
            <button className="btn sm primary" onClick={geo.locate} disabled={geo.status === "asking"}>
              {geo.status === "asking" ? <span className="spinner" /> : "אישור מיקום"}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="card pad" style={{ marginBottom: 10 }}>
            <div className="small muted" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <Car size={15} /> עלות נסיעה (הלוך-חזור, לק״מ)
            </div>
            <Segmented
              label="עלות נסיעה לקילומטר"
              value={String(costPerKm)}
              onChange={(v) => setTravelCost(Number(v))}
              options={[
                { value: "0", label: "לא לשקלל" },
                { value: "0.5", label: "0.5 ₪" },
                { value: "1", label: "1 ₪" },
                { value: "2", label: "2 ₪" },
              ]}
            />
          </div>

          {stopsQ.loading || quotesQ.loading ? (
            <div className="skeleton" style={{ height: 160, borderRadius: 22 }} />
          ) : !results.length ? (
            <div className="card pad muted small">
              <MapPin size={15} style={{ verticalAlign: "-2px" }} /> אין לנו מחירים של סניפים ספציפיים ברדיוס {radiusKm} ק״מ. מחירים לפי סניף זמינים עם שרת המחירים; אפשר גם להגדיל את הרדיוס בהגדרות.
            </div>
          ) : (
            <div className="list stagger">
              {results.slice(0, 6).map((r) => {
                const isBest = best?.branch.id === r.branch.id;
                const branch = stopsQ.data?.branches.find((b) => b.id === r.branch.id);
                return (
                  <div key={r.branch.id} className={`row ${isBest ? "price-row cheapest" : ""}`} style={{ alignItems: "flex-start", paddingBlock: 14 }}>
                    <ChainAvatar chain={r.chain} />
                    <div className="row-main">
                      <div className="row-title" style={{ whiteSpace: "normal" }}>{r.branch.name}</div>
                      <div className="meta-line">
                        <span className="num">{r.branch.approximate ? `~${formatDistance(r.branch.distanceKm)} (מיקום משוער)` : formatDistance(r.branch.distanceKm)}</span>
                        {r.complete ? (
                          <span className="dot">
                            סל <span className="num">{formatILS(r.basketTotal)}</span>
                            {r.travelCost > 0 && (
                              <>
                                {" "}+ נסיעה <span className="num">{formatILS(r.travelCost)}</span>
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="dot" style={{ color: "var(--warn)" }}>
                            חסרים {r.missing.length}: {r.missing.map((m) => m.name).join(", ")}
                          </span>
                        )}
                      </div>
                      {isBest && <div className="small crown" style={{ fontWeight: 700, marginTop: 4 }}>הכי משתלם כולל נסיעה</div>}
                    </div>
                    <div className="price-end" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <div className="price-big num" style={{ color: r.complete ? undefined : "var(--text-3)" }}>{formatILS(r.complete ? r.effectiveTotal : r.basketTotal)}</div>
                      {branch && (
                        <a className="btn sm tinted" href={navigationLinks(branch, branch.name).waze} target="_blank" rel="noreferrer" aria-label={`ניווט אל ${branch.name}`}>
                          <Navigation size={14} /> ניווט
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
