import { Heart, Plus, ShoppingBasket, TrendingDown } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDate, formatILS } from "../../core/services/format";
import { useApp } from "../../state/store";
import { haptic, useFavoritePrices } from "../../state/hooks";
import { EmptyState, ProductRow, toast } from "../components/primitives";
import { TopBar } from "../components/TopBar";

export function FavoritesScreen() {
  const favorites = useApp((s) => s.favorites);
  const watch = useApp((s) => s.priceWatch);
  const addToBasket = useApp((s) => s.addToBasket);
  const { byId, drops } = useFavoritePrices();

  const addAll = () => {
    favorites.forEach((p) => {
      if (!useApp.getState().basket.some((b) => b.product.id === p.id)) addToBasket(p);
    });
    haptic();
    toast("כל המועדפים נוספו לסל");
  };

  // Products that got cheaper first.
  const sorted = [...favorites].sort((a, b) => (byId.get(b.id)?.change?.drop ?? 0) - (byId.get(a.id)?.change?.drop ?? 0));

  return (
    <div className="page">
      <TopBar title="מועדפים" />
      <h1 className="large-title">מועדפים</h1>
      <p className="subtitle">המוצרים שאתם קונים בקביעות — נעדכן כשהמחיר שלהם יורד</p>

      {drops.length > 0 && (
        <div className="savings" style={{ marginBottom: 14 }}>
          <div className="savings-kicker">
            <TrendingDown size={15} /> ירידות מחיר
          </div>
          <div className="savings-main">
            {drops.length === 1 ? "מוצר אחד במועדפים ירד במחיר מאז ששמרתם אותו" : `${drops.length} מוצרים במועדפים ירדו במחיר מאז ששמרתם אותם`}
          </div>
        </div>
      )}

      {favorites.length === 0 ? (
        <EmptyState icon={<Heart size={34} />} title="אין עדיין מועדפים" text="לחצו על הלב בעמוד מוצר — נשמור את המחיר הכי זול באותו רגע ונודיע לכם כשהוא יורד." action={<Link to="/search" className="btn tinted">חיפוש מוצר</Link>} />
      ) : (
        <>
          <div className="list stagger">
            {sorted.map((p) => {
              const info = byId.get(p.id);
              const change = info?.change;
              const base = watch[p.id];
              return (
                <ProductRow
                  key={p.id}
                  product={p}
                  to={`/product/${encodeURIComponent(p.id)}`}
                  end={
                    <>
                      <span style={{ textAlign: "end" }}>
                        {info?.cheapest?.best ? (
                          <span className="num" style={{ fontWeight: 700, color: "var(--text)", display: "block" }}>
                            {formatILS(info.cheapest.best.price)}
                          </span>
                        ) : (
                          <span className="tiny faint" style={{ display: "block" }}>אין מחיר מאומת</span>
                        )}
                        {change && change.drop >= 0.1 ? (
                          <span className="badge green" title={base ? `לעומת ${formatILS(base.price)} ב-${formatDate(base.at)}` : undefined}>
                            ירד ב-<span className="num">{formatILS(change.drop)}</span>
                          </span>
                        ) : change && change.drop <= -0.1 ? (
                          <span className="badge warn">
                            עלה ב-<span className="num">{formatILS(-change.drop)}</span>
                          </span>
                        ) : null}
                      </span>
                      <button
                        className="icon-btn plain"
                        style={{ color: "var(--accent-strong)" }}
                        onClick={(e) => {
                          e.preventDefault();
                          addToBasket(p);
                          haptic();
                          toast("נוסף לסל");
                        }}
                        aria-label={`הוספת ${p.name} לסל`}
                      >
                        <Plus size={20} />
                      </button>
                    </>
                  }
                />
              );
            })}
          </div>
          <button className="btn tinted block" style={{ marginTop: 16 }} onClick={addAll}>
            <ShoppingBasket size={18} /> הוספת כל המועדפים לסל
          </button>
          <p className="legal">ההשוואה היא למחיר הזול ביותר ברשתות שבחרתם ביום ששמרתם את המוצר. ההתראות מוצגות כשאתם פותחים את האפליקציה.</p>
        </>
      )}
    </div>
  );
}
