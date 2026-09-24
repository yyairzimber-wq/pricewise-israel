import { Minus, Plus, Search, ShoppingBasket, Sparkles, Trash2, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatILS, formatSize } from "../../core/services/format";
import { compareBasket } from "../../core/services/pricing";
import type { PriceQuote } from "../../core/types";
import { useAsync, useIsDemo, useProviders } from "../../state/hooks";
import { useApp } from "../../state/store";
import { ChainAvatar, DemoBanner, EmptyState, ProductThumb, SkeletonRows } from "../components/primitives";
import { TopBar } from "../components/TopBar";
import { NearbyBasket } from "../components/NearbyBasket";

export function BasketScreen() {
  const basket = useApp((s) => s.basket);
  const setQuantity = useApp((s) => s.setQuantity);
  const clearBasket = useApp((s) => s.clearBasket);
  const prefs = useApp((s) => s.prefs);
  const followed = useApp((s) => s.followedChains);
  const { prices } = useProviders();
  const isDemo = useIsDemo();
  const [expanded, setExpanded] = useState<string | null>(null);

  const ids = basket.map((b) => b.product.id).join(",");
  const quotesQ = useAsync(async () => {
    const entries = await Promise.all(basket.map(async (b) => [b.product.id, await prices.getQuotes(b.product)] as [string, PriceQuote[]]));
    return new Map(entries);
  }, [prices, ids]);

  const result = useMemo(
    () => (quotesQ.data ? compareBasket(basket, quotesQ.data, { prefs, chainIds: followed }) : null),
    [quotesQ.data, basket, prefs, followed],
  );

  if (!basket.length) {
    return (
      <div className="page">
        <TopBar back={false} title="השוואת סל" />
        <h1 className="large-title">השוואת סל</h1>
        <EmptyState
          icon={<ShoppingBasket size={34} />}
          title="הסל שלכם ריק"
          text="הוסיפו מוצרים — חלב, לחם, קורנפלקס — ונחשב איפה כל הסל יוצא הכי זול."
          action={
            <Link to="/search" className="btn primary">
              <Search size={18} /> הוספת מוצרים
            </Link>
          }
        />
      </div>
    );
  }

  const worst = result?.mostExpensive?.total;

  return (
    <div className="page">
      <TopBar
        back={false}
        title="השוואת סל"
        actions={
          <button className="icon-btn plain" onClick={() => confirm("לרוקן את הסל?") && clearBasket()} aria-label="ריקון הסל">
            <Trash2 size={20} />
          </button>
        }
      />
      <h1 className="large-title">השוואת סל</h1>
      <p className="subtitle">
        {result?.itemCount ?? basket.length} פריטים · {basket.length} מוצרים שונים
      </p>

      {isDemo && (
        <div style={{ marginBottom: 14 }}>
          <DemoBanner />
        </div>
      )}

      {quotesQ.loading && !result ? (
        <div className="skeleton" style={{ height: 120, borderRadius: 22 }} />
      ) : result?.cheapest ? (
        <div className="savings">
          <div className="savings-kicker">
            <Trophy size={15} /> הסל הזול ביותר{isDemo ? " · נתוני הדגמה" : ""}
          </div>
          <div className="savings-main">
            {result.cheapest.chain.name} — <span className="num">{formatILS(result.cheapest.total)}</span>
          </div>
          <div className="savings-foot">
            {result.saving > 0 && (
              <span className="savings-pill">
                חיסכון של עד <span className="num">{formatILS(result.saving)}</span> לעומת {result.mostExpensive!.chain.name}
              </span>
            )}
            <span className="savings-pill">{result.chains.filter((c) => c.complete).length} רשתות עם כל המוצרים</span>
          </div>
        </div>
      ) : (
        <div className="savings neutral">
          <div className="savings-main" style={{ fontSize: 18 }}>אין רשת עם מחיר מאומת לכל המוצרים בסל</div>
          <p className="small muted" style={{ margin: "6px 0 0" }}>למטה מוצגים סכומים חלקיים — שימו לב אילו מוצרים חסרים בכל רשת.</p>
        </div>
      )}

      {result?.split && result.cheapest && result.split.total < result.cheapest.total - 0.5 && (
        <div className="card pad" style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
          <span className="tile-icon purple">
            <Sparkles size={20} />
          </span>
          <div className="row-main">
            <b>
              קנייה מפוצלת: <span className="num">{formatILS(result.split.total)}</span>
            </b>
            <div className="small muted">
              אם קונים כל מוצר ברשת הזולה ביותר עבורו ({result.split.chainCount} רשתות) — חיסכון נוסף של <span className="num">{formatILS(result.cheapest.total - result.split.total)}</span>
            </div>
          </div>
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">מחיר הסל בכל רשת</h2>
        </div>
        {quotesQ.loading && !result ? (
          <SkeletonRows count={4} />
        ) : (
          <div className="list stagger">
            {result?.chains.map((c, i) => {
              const diff = result.cheapest && c.complete ? c.total - result.cheapest.total : null;
              const open = expanded === c.chain.id;
              return (
                <div key={c.chain.id}>
                  <button className={`row ${i === 0 && c.complete ? "rank-first" : ""}`} onClick={() => setExpanded(open ? null : c.chain.id)} aria-expanded={open}>
                    <span className="rank-num num">{i + 1}</span>
                    <ChainAvatar chain={c.chain} />
                    <div className="row-main">
                      <div className="row-title">{c.chain.name}</div>
                      <div className="row-sub">
                        {c.complete ? `כל ${basket.length} המוצרים` : `חסרים ${c.missing.length}: ${c.missing.map((m) => m.name).join(", ")}`}
                      </div>
                      {c.complete && worst && (
                        <div className="bar-track">
                          <div className={`bar-fill ${i === 0 ? "" : diff! / worst > 0.08 ? "high" : "mid"}`} style={{ width: `${(c.total / worst) * 100}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="price-end">
                      <div className="price-big num" style={{ color: c.complete ? undefined : "var(--text-3)" }}>{formatILS(c.total)}</div>
                      {!c.complete ? <div className="badge warn">סכום חלקי</div> : diff ? <div className="price-diff">יקר ב-<span className="num">{formatILS(diff)}</span></div> : <div className="small crown" style={{ fontWeight: 700 }}>הכי זול</div>}
                    </div>
                  </button>
                  {open && (
                    <div style={{ padding: "0 14px 12px 14px", animation: "fade .25s both" }}>
                      <table className="table">
                        <tbody>
                          {c.lines.map((l) => (
                            <tr key={l.product.id}>
                              <td>
                                {l.product.name} {l.quantity > 1 && <span className="faint num">×{l.quantity}</span>}
                                {l.kind !== "regular" && <span className={`badge ${l.kind}`} style={{ marginInlineStart: 6 }}>{l.kind === "promo" ? "מבצע" : "מועדון"}</span>}
                              </td>
                              <td className="num" style={{ textAlign: "end" }}>{formatILS(l.lineTotal)}</td>
                            </tr>
                          ))}
                          {c.missing.map((m) => (
                            <tr key={m.id}>
                              <td className="faint">{m.name}</td>
                              <td className="small faint" style={{ textAlign: "end" }}>אין מחיר מאומת</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <NearbyBasket basket={basket} />

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">המוצרים בסל</h2>
          <Link to="/search" className="section-link">
            + הוספה
          </Link>
        </div>
        <div className="list">
          {basket.map((b) => (
            <div className="row" key={b.product.id}>
              <Link to={`/product/${encodeURIComponent(b.product.id)}`}>
                <ProductThumb product={b.product} />
              </Link>
              <div className="row-main">
                <div className="row-title">{b.product.name}</div>
                <div className="row-sub">{[b.product.brand, formatSize(b.product.size)].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="stepper">
                <button onClick={() => setQuantity(b.product.id, b.quantity + 1)} aria-label={`הוספת ${b.product.name}`}>
                  <Plus size={16} />
                </button>
                <span className="num">{b.quantity}</span>
                <button onClick={() => setQuantity(b.product.id, b.quantity - 1)} aria-label={`הפחתת ${b.product.name}`}>
                  {b.quantity === 1 ? <Trash2 size={15} /> : <Minus size={16} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="legal">
        סכומי הסל מחושבים רק ממחירים עדכניים (עד {prefs.maxAgeHours} שעות). מבצעי כמות נכללים רק כשהכמות בסל עומדת בתנאי המבצע.
        {prefs.includeClub ? " מחירי מועדון כלולים." : " מחירי מועדון אינם כלולים — ניתן להפעיל בהגדרות."}
      </p>
    </div>
  );
}
