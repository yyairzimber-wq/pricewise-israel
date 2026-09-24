import { Clock, ScanBarcode, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CATEGORY_LABEL } from "../../core/services/format";
import { isBarcode } from "../../core/services/text";
import type { Product } from "../../core/types";
import { useAsync, useProviders } from "../../state/hooks";
import { useApp } from "../../state/store";
import { EmptyState, ProductRow, SkeletonRows } from "../components/primitives";
import { TopBar } from "../components/TopBar";

const SUGGESTIONS = ["קורנפלקס", "חלב", "קולה", "לחם", "גבינה", "שוקולד", "במבה", "קפה"];

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function SearchScreen() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { catalog } = useProviders();
  const [q, setQ] = useState(params.get("q") ?? "");
  const debounced = useDebounced(q.trim(), 220);
  const recent = useApp((s) => s.recentSearches);
  const addRecent = useApp((s) => s.addRecentSearch);
  const clearRecent = useApp((s) => s.clearRecentSearches);
  const addHistory = useApp((s) => s.addHistory);

  useEffect(() => {
    setParams(debounced ? { q: debounced } : {}, { replace: true });
  }, [debounced, setParams]);

  const results = useAsync<Product[]>(async () => {
    if (!debounced) return [];
    if (isBarcode(debounced)) {
      const p = await catalog.getByBarcode(debounced);
      return p ? [p] : [];
    }
    return catalog.search(debounced, 30);
  }, [catalog, debounced]);

  const openProduct = (p: Product) => {
    addRecent(q);
    addHistory(p, "search");
  };

  return (
    <div className="page">
      <TopBar title="חיפוש מוצר" />
      <h1 className="large-title">חיפוש מוצר</h1>
      <p className="subtitle">הקלידו שם מוצר, מותג או מספר ברקוד</p>

      <div className="search-field" style={{ background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
        <Search size={19} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="למשל: קורנפלקס תלמה" aria-label="חיפוש מוצר" enterKeyHint="search" onKeyDown={(e) => e.key === "Enter" && addRecent(q)} />
        {q && (
          <button onClick={() => setQ("")} aria-label="ניקוי">
            <X size={18} />
          </button>
        )}
        <button onClick={() => navigate("/scan")} aria-label="סריקת ברקוד" style={{ color: "var(--accent-strong)" }}>
          <ScanBarcode size={20} />
        </button>
      </div>

      {!debounced ? (
        <>
          <section className="section">
            <div className="section-head">
              <h2 className="section-title">חיפושים פופולריים</h2>
            </div>
            <div className="chips" style={{ flexWrap: "wrap", overflow: "visible" }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => setQ(s)}>
                  {s}
                </button>
              ))}
            </div>
          </section>
          {recent.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">חיפושים אחרונים</h2>
                <button className="section-link" onClick={clearRecent}>
                  ניקוי
                </button>
              </div>
              <div className="list">
                {recent.map((r) => (
                  <button key={r} className="row no-indent" onClick={() => setQ(r)}>
                    <Clock size={18} className="faint" />
                    <div className="row-main">{r}</div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="section" style={{ marginTop: 18 }}>
          {results.loading && !results.data ? (
            <SkeletonRows count={5} />
          ) : results.data?.length ? (
            <>
              <div className="small faint" style={{ margin: "0 4px 8px" }}>
                {results.data.length} תוצאות
              </div>
              <div className="list stagger">
                {results.data.map((p) => (
                  <ProductRow key={p.id} product={p} to={`/product/${encodeURIComponent(p.id)}`} onClick={() => openProduct(p)} end={<span className="badge">{CATEGORY_LABEL[p.category]}</span>} />
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Search size={34} />}
              title="לא מצאנו מוצרים"
              text={isBarcode(debounced) ? "הברקוד לא נמצא במאגרי המוצרים. נסו לחפש לפי שם או לצלם את האריזה." : "נסו מילה אחרת, שם מותג, או סריקת ברקוד."}
              action={
                <button className="btn tinted" onClick={() => navigate("/capture")}>
                  זיהוי מתמונה
                </button>
              }
            />
          )}
        </section>
      )}
    </div>
  );
}
