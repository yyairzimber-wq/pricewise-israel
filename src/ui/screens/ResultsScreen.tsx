import { BadgeCheck, ChevronLeft, Crown, Heart, Info, MapPin, PackageSearch, Plus, Share2, TrendingDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getChain } from "../../core/data/chains";
import { formatILS, formatPercent, formatSize } from "../../core/services/format";
import { compareProduct, type ComparisonRow } from "../../core/services/pricing";
import { haptic, useIsDemo, useProduct, useQuotes } from "../../state/hooks";
import { useApp } from "../../state/store";
import { FreshnessBadge, KindBadge, QuoteMeta } from "../components/PriceParts";
import { ChainAvatar, DemoBanner, EmptyState, ProductThumb, SkeletonRows, toast } from "../components/primitives";
import { TopBar } from "../components/TopBar";

export function ResultsScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const productQ = useProduct(id);
  const product = productQ.data ?? null;
  const quotesQ = useQuotes(product);
  const isDemo = useIsDemo();

  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const followed = useApp((s) => s.followedChains);
  const homeChainId = useApp((s) => s.homeChainId);
  const favorite = useApp((s) => s.favorites.some((f) => f.id === product?.id));
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const addToBasket = useApp((s) => s.addToBasket);
  const [reference, setReference] = useState<string | null>(homeChainId);

  const comparison = useMemo(
    () => compareProduct(quotesQ.data ?? [], { prefs, chainIds: followed, referenceChainId: reference ?? undefined }),
    [quotesQ.data, prefs, followed, reference],
  );

  if (productQ.loading) {
    return (
      <div className="page">
        <TopBar />
        <div className="product-head">
          <div className="skeleton" style={{ width: 96, height: 96, borderRadius: 24 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 22, width: "70%" }} />
            <div className="skeleton" style={{ height: 14, width: "40%", marginTop: 10 }} />
          </div>
        </div>
        <SkeletonRows count={5} />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="page">
        <TopBar />
        <EmptyState icon={<PackageSearch size={34} />} title="המוצר לא נמצא" text="ייתכן שהקישור ישן או שהמוצר הוסר מהמאגר." action={<Link className="btn tinted" to="/search">חיפוש מוצר</Link>} />
      </div>
    );
  }

  const eligible = comparison.rows.filter((r) => r.eligible);
  const stale = comparison.rows.filter((r) => !r.eligible);
  const maxPrice = comparison.mostExpensive?.best?.price ?? comparison.cheapest?.best?.price ?? 1;
  const quotedChains = comparison.rows.map((r) => r.chain);
  const refIsCheapest = reference && comparison.cheapest?.chain.id === reference;

  const share = async () => {
    const c = comparison.cheapest;
    const text = c
      ? `${product.name} — הכי זול ב${c.chain.name}: ${formatILS(c.best!.price)}${isDemo ? " (נתוני הדגמה)" : ""}`
      : product.name;
    try {
      if (navigator.share) await navigator.share({ title: "PriceWise ישראל", text });
      else {
        await navigator.clipboard.writeText(text);
        toast("הועתק ללוח");
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="page">
      <TopBar
        title={product.name}
        actions={
          <>
            <button className="icon-btn plain" onClick={share} aria-label="שיתוף">
              <Share2 size={20} />
            </button>
            <button
              className={`icon-btn plain ${favorite ? "active" : ""}`}
              aria-pressed={favorite}
              aria-label={favorite ? "הסרה מהמועדפים" : "הוספה למועדפים"}
              onClick={() => {
                const c = comparison.cheapest;
                // Remember today's cheapest price so we can tell when it drops.
                toggleFavorite(product, c?.best ? { price: c.best.price, chainId: c.chain.id, at: new Date().toISOString() } : undefined);
                haptic();
                toast(favorite ? "הוסר מהמועדפים" : "נוסף למועדפים ❤️");
              }}
            >
              <Heart size={21} fill={favorite ? "currentColor" : "none"} />
            </button>
          </>
        }
      />

      <div className="product-head">
        <ProductThumb product={product} size="lg" />
        <div style={{ minWidth: 0 }}>
          <h1 className="product-name">{product.name}</h1>
          <div className="muted" style={{ marginTop: 2 }}>{[product.brand, formatSize(product.size)].filter(Boolean).join(" · ")}</div>
          <div className="product-meta">
            {product.barcode && <span className="badge num">{product.barcode}</span>}
            <Link to={`/product/${encodeURIComponent(product.id)}/details`} className="badge blue">
              <Info size={12} /> פרטי מוצר
            </Link>
          </div>
        </div>
      </div>

      {isDemo && (
        <div style={{ marginBottom: 12 }}>
          <DemoBanner />
        </div>
      )}

      {quotesQ.loading ? (
        <>
          <div className="skeleton" style={{ height: 118, borderRadius: 22, marginBottom: 14 }} />
          <SkeletonRows count={5} />
        </>
      ) : quotesQ.error ? (
        <EmptyState icon={<Info size={34} />} title="לא הצלחנו לטעון מחירים" text="בדקו את החיבור לאינטרנט ונסו שוב." action={<button className="btn tinted" onClick={quotesQ.reload}>נסו שוב</button>} />
      ) : !comparison.cheapest ? (
        <div className="savings neutral">
          <div className="savings-kicker">
            <Info size={15} /> שקיפות מחירים
          </div>
          <div className="savings-main">אין לנו כרגע מחיר מאומת למוצר הזה</div>
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            {comparison.rows.length
              ? "יש לנו רק מחירים ישנים מדי, ולכן איננו מדרגים אותם."
              : "המוצר זוהה, אבל אף רשת במקורות שלנו עדיין לא פרסמה עבורו מחיר. לא נציג מחיר שלא אומת."}
          </p>
        </div>
      ) : (
        <>
          <SavingsHero comparison={comparison} isDemo={isDemo} referenceIsCheapest={!!refIsCheapest} />

          <section className="section" style={{ marginTop: 18 }}>
            <div className="section-head">
              <h2 className="section-title" style={{ fontSize: 16 }}>איפה אתם עכשיו?</h2>
            </div>
            <div className="chips">
              <button className={`chip ${reference == null ? "on" : ""}`} onClick={() => setReference(null)}>
                לא בחנות
              </button>
              {quotedChains.map((c) => (
                <button key={c.id} className={`chip ${reference === c.id ? "on" : ""}`} onClick={() => setReference(c.id)}>
                  <ChainAvatar chain={c} small /> {c.name}
                </button>
              ))}
            </div>
          </section>

          <section className="section" style={{ marginTop: 14 }}>
            <div className="section-head">
              <h2 className="section-title">מחירים לפי רשת</h2>
              <span className="small faint">{eligible.length} רשתות</span>
            </div>
            <div className="chips" style={{ marginBottom: 6 }}>
              <button className={`chip ${prefs.includePromos ? "on" : ""}`} onClick={() => setPrefs({ includePromos: !prefs.includePromos })} aria-pressed={prefs.includePromos}>
                כולל מבצעים
              </button>
              <button className={`chip ${prefs.includeClub ? "on" : ""}`} onClick={() => setPrefs({ includeClub: !prefs.includeClub })} aria-pressed={prefs.includeClub}>
                כולל מחירי מועדון
              </button>
            </div>
            <div className="list stagger">
              {eligible.map((r) => (
                <PriceRow key={r.chain.id} row={r} max={maxPrice} highlight={reference === r.chain.id} />
              ))}
            </div>
          </section>
        </>
      )}

      {stale.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title" style={{ fontSize: 17 }}>מחירים לא עדכניים</h2>
          </div>
          <p className="small muted" style={{ margin: "-4px 4px 10px" }}>
            מחירים שעודכנו לפני יותר מ-{prefs.maxAgeHours} שעות — מוצגים לעיון בלבד ואינם משתתפים בהשוואה.
          </p>
          <div className="list">
            {stale.map((r) => (
              <PriceRow key={r.chain.id} row={r} max={maxPrice} />
            ))}
          </div>
        </section>
      )}

      {!quotesQ.loading && comparison.missingChains.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title" style={{ fontSize: 17 }}>אין לנו כרגע מחיר מאומת</h2>
          </div>
          <div className="card pad">
            <div className="chips" style={{ flexWrap: "wrap", margin: 0, padding: 0 }}>
              {comparison.missingChains.map((c) => (
                <span key={c.id} className="chip" style={{ cursor: "default" }}>
                  <ChainAvatar chain={c} small /> {c.name}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="fab-bar">
        <button
          className="btn primary"
          style={{ flex: 2 }}
          onClick={() => {
            addToBasket(product);
            haptic();
            toast(
              <>
                נוסף לסל · <Link to="/basket" style={{ textDecoration: "underline" }}>להשוואת הסל</Link>
              </>,
            );
          }}
        >
          <Plus size={19} /> הוספה לסל
        </button>
        <button className="btn" style={{ flex: 1, background: "var(--surface)" }} onClick={() => navigate(`/nearby?product=${encodeURIComponent(product.id)}`)}>
          <MapPin size={18} /> סניפים
        </button>
      </div>

      <Link to={`/product/${encodeURIComponent(product.id)}/details`} className="card pad" style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <span className="tile-icon blue">
          <TrendingDown size={20} />
        </span>
        <span className="row-main">
          <b>פירוט מלא ומגמת מחיר</b>
          <div className="small muted">מחיר רגיל, מבצע ומועדון בכל רשת</div>
        </span>
        <ChevronLeft size={18} className="chev" />
      </Link>
    </div>
  );
}

function SavingsHero({ comparison, isDemo, referenceIsCheapest }: { comparison: ReturnType<typeof compareProduct>; isDemo: boolean; referenceIsCheapest: boolean }) {
  const cheapest = comparison.cheapest!;
  const ref = comparison.reference;
  const price = cheapest.best!.price;

  let main: React.ReactNode;
  const pills: React.ReactNode[] = [];

  if (ref) {
    main = (
      <>
        מצאנו את אותו מוצר ב-<span className="num">{formatILS(ref.saving)}</span> פחות ב{cheapest.chain.name}
      </>
    );
    pills.push(<span key="p" className="savings-pill">חיסכון של {formatPercent(ref.savingPct)}</span>);
    pills.push(
      <span key="r" className="savings-pill">
        {ref.row.chain.name}: <span className="num">{formatILS(ref.row.best!.price)}</span> ← {cheapest.chain.name}: <span className="num">{formatILS(price)}</span>
      </span>,
    );
  } else if (referenceIsCheapest) {
    main = <>אתם כבר ברשת הזולה ביותר למוצר הזה 🎉</>;
    pills.push(<span key="p" className="savings-pill num">{formatILS(price)}</span>);
  } else {
    main = (
      <>
        הכי זול ב{cheapest.chain.name} — <span className="num">{formatILS(price)}</span>
      </>
    );
    if (comparison.mostExpensive && comparison.spread > 0) {
      pills.push(
        <span key="s" className="savings-pill">
          חוסכים עד <span className="num">{formatILS(comparison.spread)}</span> ({formatPercent(comparison.spreadPct)})
        </span>,
      );
    }
  }
  if (cheapest.best!.kind !== "regular") pills.push(<span key="k" className="savings-pill">{cheapest.best!.kind === "promo" ? "מחיר מבצע" : "מחיר מועדון"}</span>);

  return (
    <div className="savings" role="status">
      <div className="savings-kicker">
        <BadgeCheck size={15} /> {isDemo ? "השוואה על נתוני הדגמה" : "השוואה על מחירים עדכניים"}
      </div>
      <div className="savings-main">{main}</div>
      {pills.length > 0 && <div className="savings-foot">{pills}</div>}
    </div>
  );
}

function PriceRow({ row, max, highlight }: { row: ComparisonRow; max: number; highlight?: boolean }) {
  const chain = getChain(row.chain.id);
  const best = row.best;
  const showStrike = best && best.kind !== "regular" && row.quote.regular != null && row.quote.regular > best.price;
  const pct = best ? Math.max(8, (best.price / max) * 100) : 0;
  const level = row.isCheapest ? "" : row.diffFromCheapest != null && row.diffFromCheapest / max > 0.12 ? "high" : "mid";

  return (
    <div className={`row price-row ${row.isCheapest ? "cheapest" : ""} ${row.eligible ? "" : "stale"}`} style={highlight ? { boxShadow: "inset -3px 0 0 var(--blue)" } : undefined}>
      <ChainAvatar chain={chain} />
      <div className="row-main">
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span className="row-title" style={{ whiteSpace: "normal" }}>{chain.name}</span>
          {best && best.kind !== "regular" && <KindBadge kind={best.kind} label={best.kind === "promo" ? best.label : undefined} />}
          {row.quote.promo && best?.kind !== "promo" && <span className="badge promo">מבצע: {row.quote.promo.label}</span>}
          {row.quote.club && best?.kind !== "club" && <span className="badge club">מועדון: {formatILS(row.quote.club.unitPrice)}</span>}
          <FreshnessBadge freshness={row.freshness} />
        </div>
        <QuoteMeta quote={row.quote} />
        {row.eligible && (
          <div className="bar-track" aria-hidden>
            <div className={`bar-fill ${level}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="price-end">
        {best ? (
          <>
            <div className="price-big num">{formatILS(best.price)}</div>
            {showStrike && <div className="price-strike num">{formatILS(row.quote.regular!)}</div>}
            {row.isCheapest ? (
              <div className="small crown" style={{ fontWeight: 700 }}>
                <Crown size={13} style={{ verticalAlign: "-2px" }} /> הכי זול
              </div>
            ) : row.diffFromCheapest != null ? (
              <div className="price-diff">יקר ב-<span className="num">{formatILS(row.diffFromCheapest)}</span></div>
            ) : null}
          </>
        ) : (
          <div className="no-price small">אין מחיר מאומת</div>
        )}
      </div>
    </div>
  );
}
