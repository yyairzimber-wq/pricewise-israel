import { Navigation, Route } from "lucide-react";
import { getChain } from "../../core/data/chains";
import { formatILS } from "../../core/services/format";
import { formatDistance, navigationLinks } from "../../core/services/geo";
import { EXTRA_STOP_COST, type TripPlan } from "../../core/services/trip";
import type { Branch } from "../../core/types";
import { ChainAvatar } from "./primitives";

/**
 * "Split the shopping": which stores to visit and what to buy at each, when
 * that beats a single store even after driving and time are counted.
 */
export function TripPlanCard({ best, single, branches, costPerKm }: { best: TripPlan; single: TripPlan | null; branches: Branch[]; costPerKm: number }) {
  const saving = single ? single.effectiveTotal - best.effectiveTotal : 0;
  const worthSplitting = best.stops.length > 1 && single != null && saving >= 2;

  if (!worthSplitting) {
    if (!single) return null;
    return (
      <div className="card pad small muted" style={{ marginBottom: 10 }}>
        <Route size={15} style={{ verticalAlign: "-2px" }} /> קנייה בחנות אחת היא הכי משתלמת לסל הזה — פיצול בין חנויות לא היה חוסך מספיק אחרי הנסיעה.
      </div>
    );
  }

  return (
    <div className="card pad" style={{ marginBottom: 12 }}>
      <div className="savings-kicker" style={{ color: "var(--accent-strong)" }}>
        <Route size={15} /> תכנית קנייה חכמה · {best.stops.length} חנויות
      </div>
      <div style={{ fontWeight: 800, fontSize: 20, margin: "4px 0" }}>
        חוסכים <span className="num">{formatILS(saving)}</span> מול חנות אחת
      </div>
      <div className="small muted" style={{ marginBottom: 10 }}>
        סה״כ <span className="num">{formatILS(best.effectiveTotal)}</span> כולל נסיעה · לעומת <span className="num">{formatILS(single!.effectiveTotal)}</span> בחנות הכי משתלמת
      </div>

      {best.stops.map(({ stop, items, subtotal }, i) => {
        const branch = branches.find((b) => b.id === stop.id);
        return (
          <div key={stop.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: i ? "1px solid var(--line)" : undefined }}>
            <ChainAvatar chain={getChain(stop.chainId)} />
            <div className="row-main">
              <div className="row-title" style={{ whiteSpace: "normal" }}>
                {i + 1}. {stop.name}
              </div>
              <div className="small muted">
                {formatDistance(stop.distanceKm)} ממך · קונים {items.length} {items.length === 1 ? "מוצר" : "מוצרים"}
              </div>
              <ul className="small" style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>
                {items.map((it) => (
                  <li key={it.product.id}>
                    {it.product.name}
                    {it.quantity > 1 && <span className="faint num"> ×{it.quantity}</span>} — <span className="num">{formatILS(it.lineTotal)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div className="price-big num">{formatILS(subtotal)}</div>
              {branch && (
                <a className="btn sm tinted" href={navigationLinks(branch, branch.name).waze} target="_blank" rel="noreferrer" aria-label={`ניווט אל ${branch.name}`}>
                  <Navigation size={14} /> ניווט
                </a>
              )}
            </div>
          </div>
        );
      })}

      <p className="small faint" style={{ margin: "8px 0 0", lineHeight: 1.6 }}>
        מוצרים <span className="num">{formatILS(best.itemsTotal)}</span> + נסיעה (~<span className="num">{best.travelKm}</span> ק״מ
        {costPerKm > 0 ? <>, <span className="num">{formatILS(best.travelCost)}</span></> : ", לא משוקלל"}) + {formatILS(best.stopCost)} על זמן ({formatILS(EXTRA_STOP_COST)} לכל עצירה נוספת). המרחקים בקו אווירי.
      </p>
    </div>
  );
}
