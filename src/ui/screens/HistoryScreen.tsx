import { Camera, History, ScanBarcode, Search, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { formatSize } from "../../core/services/format";
import { useApp, type HistoryEntry, type ScanMethod } from "../../state/store";
import { EmptyState, ProductThumb } from "../components/primitives";
import { TopBar } from "../components/TopBar";

const METHOD: Record<ScanMethod, { icon: typeof Camera; label: string }> = {
  photo: { icon: Camera, label: "צילום" },
  barcode: { icon: ScanBarcode, label: "ברקוד" },
  search: { icon: Search, label: "חיפוש" },
};

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "היום";
  if (d.toDateString() === yesterday.toDateString()) return "אתמול";
  return new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long" }).format(d);
}

export function HistoryScreen() {
  const history = useApp((s) => s.history);
  const removeHistory = useApp((s) => s.removeHistory);
  const clearHistory = useApp((s) => s.clearHistory);

  const groups = history.reduce<Map<string, HistoryEntry[]>>((m, h) => {
    const k = dayLabel(h.at);
    m.set(k, [...(m.get(k) ?? []), h]);
    return m;
  }, new Map());

  return (
    <div className="page">
      <TopBar
        title="היסטוריית סריקות"
        actions={
          history.length > 0 && (
            <button className="icon-btn plain" onClick={() => confirm("למחוק את כל ההיסטוריה?") && clearHistory()} aria-label="מחיקת ההיסטוריה">
              <Trash2 size={20} />
            </button>
          )
        }
      />
      <h1 className="large-title">היסטוריית סריקות</h1>
      <p className="subtitle">כל המוצרים שצילמתם, סרקתם או חיפשתם — נשמר רק במכשיר שלכם</p>

      {history.length === 0 ? (
        <EmptyState icon={<History size={34} />} title="אין עדיין היסטוריה" text="מוצרים שתסרקו יופיעו כאן כדי שתוכלו לחזור אליהם." action={<Link to="/scan" className="btn primary">סריקת ברקוד</Link>} />
      ) : (
        [...groups].map(([day, entries]) => (
          <section className="section" key={day} style={{ marginTop: 18 }}>
            <div className="section-head">
              <h2 className="section-title" style={{ fontSize: 16 }}>{day}</h2>
            </div>
            <div className="list stagger">
              {entries.map((h) => {
                const M = METHOD[h.method];
                return (
                  <div className="row" key={h.id}>
                    <Link to={`/product/${encodeURIComponent(h.product.id)}`} style={{ display: "contents" }}>
                      <ProductThumb product={h.product} />
                      <div className="row-main">
                        <div className="row-title">{h.product.name}</div>
                        <div className="row-sub">
                          <M.icon size={12} style={{ verticalAlign: "-1px" }} /> {M.label} · {new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit" }).format(new Date(h.at))}
                          {h.product.size ? ` · ${formatSize(h.product.size)}` : ""}
                        </div>
                      </div>
                    </Link>
                    <button className="icon-btn plain" onClick={() => removeHistory(h.id)} aria-label={`הסרת ${h.product.name}`}>
                      <X size={17} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
