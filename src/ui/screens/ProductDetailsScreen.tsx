import { ExternalLink, PackageSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getChain } from "../../core/data/chains";
import { CATEGORY_LABEL, formatDate, formatDateTime, formatILS, formatSize, unitPrice } from "../../core/services/format";
import { bestPrice, freshness } from "../../core/services/pricing";
import { useAsync, useIsDemo, useProduct, useProviders, useQuotes } from "../../state/hooks";
import { useApp } from "../../state/store";
import { SourceBadge } from "../components/PriceParts";
import { ChainAvatar, DemoBanner, EmptyState, ProductThumb, SkeletonRows } from "../components/primitives";
import { Sparkline } from "../components/Sparkline";
import { TopBar } from "../components/TopBar";

export function ProductDetailsScreen() {
  const { id } = useParams();
  const productQ = useProduct(id);
  const product = productQ.data ?? null;
  const quotesQ = useQuotes(product);
  const { prices } = useProviders();
  const isDemo = useIsDemo();
  const prefs = useApp((s) => s.prefs);
  const followed = useApp((s) => s.followedChains);

  const quotes = useMemo(
    () => (quotesQ.data ?? []).filter((q) => followed.includes(q.chainId)).sort((a, b) => (a.regular ?? Infinity) - (b.regular ?? Infinity)),
    [quotesQ.data, followed],
  );
  const [chainId, setChainId] = useState<string | null>(null);
  const activeChain = chainId ?? quotes[0]?.chainId ?? null;

  const history = useAsync(
    async () => (product && activeChain && prices.getHistory ? prices.getHistory(product, activeChain, 30) : []),
    [prices, product?.id, activeChain],
  );

  if (productQ.loading) {
    return (
      <div className="page">
        <TopBar />
        <SkeletonRows count={6} />
      </div>
    );
  }
  if (!product) {
    return (
      <div className="page">
        <TopBar />
        <EmptyState icon={<PackageSearch size={34} />} title="המוצר לא נמצא" action={<Link className="btn tinted" to="/search">חיפוש מוצר</Link>} />
      </div>
    );
  }

  const cheapestRegular = quotes.find((q) => q.regular != null)?.regular;

  return (
    <div className="page">
      <TopBar title="פרטי מוצר" />
      <div style={{ textAlign: "center", margin: "8px 0 20px" }}>
        <div style={{ display: "inline-block" }}>
          <ProductThumb product={product} size="xl" />
        </div>
        <h1 className="product-name" style={{ marginTop: 14 }}>{product.name}</h1>
        <div className="muted">{[product.brand, formatSize(product.size)].filter(Boolean).join(" · ")}</div>
      </div>

      {isDemo && (
        <div style={{ marginBottom: 12 }}>
          <DemoBanner />
        </div>
      )}

      <div className="card pad">
        <dl className="kv">
          <dt>מותג</dt>
          <dd>{product.brand ?? "—"}</dd>
          <dt>גודל / משקל</dt>
          <dd>{formatSize(product.size) || "—"}</dd>
          <dt>קטגוריה</dt>
          <dd>{CATEGORY_LABEL[product.category]}</dd>
          <dt>ברקוד</dt>
          <dd className="num">{product.barcode ?? "—"}</dd>
          {cheapestRegular != null && unitPrice(cheapestRegular, product.size) && (
            <>
              <dt>מחיר ליחידת מידה</dt>
              <dd>החל מ-{unitPrice(cheapestRegular, product.size)}</dd>
            </>
          )}
          <dt>מקור פרטי המוצר</dt>
          <dd>
            {product.source.url ? (
              <a href={product.source.url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>
                {product.source.label} <ExternalLink size={12} style={{ verticalAlign: "-1px" }} />
              </a>
            ) : (
              product.source.label
            )}
          </dd>
        </dl>
        {product.ingredients && (
          <p className="small muted" style={{ margin: "14px 0 0", lineHeight: 1.6 }}>
            <b>רכיבים:</b> {product.ingredients}
          </p>
        )}
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">פירוט מחירים</h2>
        </div>
        {quotesQ.loading ? (
          <SkeletonRows count={4} />
        ) : quotes.length === 0 ? (
          <div className="card pad muted">אין לנו כרגע מחיר מאומת למוצר הזה.</div>
        ) : (
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>רשת</th>
                  <th>רגיל</th>
                  <th>מבצע</th>
                  <th>מועדון</th>
                  <th>עודכן</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => {
                  const chain = getChain(q.chainId);
                  const fr = freshness(q.updatedAt, prefs.maxAgeHours);
                  const best = bestPrice(q, prefs);
                  return (
                    <tr key={q.chainId} style={{ opacity: fr === "stale" ? 0.55 : 1 }}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                          <ChainAvatar chain={chain} small /> {chain.name}
                        </div>
                      </td>
                      <td className="num" style={{ fontWeight: best?.kind === "regular" ? 800 : 500 }}>{q.regular != null ? formatILS(q.regular) : "—"}</td>
                      <td>
                        {q.promo ? (
                          <span className="badge promo" title={q.promo.validUntil ? `בתוקף עד ${formatDate(q.promo.validUntil)}` : undefined}>
                            {q.promo.label}
                          </span>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                      <td>{q.club ? <span className="badge club num">{formatILS(q.club.unitPrice)}</span> : <span className="faint">—</span>}</td>
                      <td className="small" style={{ whiteSpace: "nowrap" }}>
                        {formatDateTime(q.updatedAt)}
                        {fr === "stale" && <div className="badge warn" style={{ marginTop: 4 }}>לא עדכני</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {quotes[0] && (
          <div className="meta-line" style={{ margin: "10px 4px 0" }}>
            מקור המחירים: <SourceBadge source={quotes[0].source} /> {quotes[0].source.label}
          </div>
        )}
      </section>

      {prices.getHistory && quotes.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">מגמת מחיר — 30 יום</h2>
          </div>
          <div className="chips" style={{ marginBottom: 8 }}>
            {quotes.map((q) => {
              const c = getChain(q.chainId);
              return (
                <button key={c.id} className={`chip ${activeChain === c.id ? "on" : ""}`} onClick={() => setChainId(c.id)}>
                  {c.name}
                </button>
              );
            })}
          </div>
          <div className="card pad">
            {history.loading ? (
              <div className="skeleton" style={{ height: 120 }} />
            ) : history.data && history.data.length > 1 ? (
              <Sparkline points={history.data} />
            ) : history.data?.length === 1 ? (
              <p className="muted small">איסוף ההיסטוריה התחיל ב-{formatDate(history.data[0].date)}. המגמה תוצג אחרי כמה ימים של נתונים.</p>
            ) : (
              <p className="muted small">אין היסטוריית מחירים לרשת זו.</p>
            )}
          </div>
        </section>
      )}

      <p className="legal">
        מחירים עשויים להשתנות בין סניפים של אותה רשת. המחיר הקובע הוא המחיר בקופה. מחיר מבצע מוצג רק כשתנאי המבצע (למשל כמות מינימלית) מתקיימים.
      </p>
    </div>
  );
}
