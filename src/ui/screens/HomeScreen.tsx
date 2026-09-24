import { Camera, ChevronLeft, Heart, History, ScanBarcode, Search, ShoppingBasket, TrendingDown } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../../state/store";
import { useFavoritePrices, useIsDemo } from "../../state/hooks";
import { DemoBanner, ProductThumb } from "../components/primitives";
import { BrandMark } from "../layout/AppShell";
import { formatILS, formatSize } from "../../core/services/format";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Jerusalem" }).format(new Date()));
  if (h < 5) return "לילה טוב";
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}

export function HomeScreen() {
  const navigate = useNavigate();
  const isDemo = useIsDemo();
  const history = useApp((s) => s.history);
  const basket = useApp((s) => s.basket);
  const favorites = useApp((s) => s.favorites);
  const { drops } = useFavoritePrices();
  const recent = history.slice(0, 10);

  return (
    <div className="page">
      <div className="home-head">
        <div>
          <div className="home-greet">{greeting()} 👋</div>
          <h1 className="home-title">
            משלמים <em>פחות</em>
            <br />
            על אותו מוצר.
          </h1>
        </div>
        <BrandMark className="brand-mark" />
      </div>

      <button className="search-field" onClick={() => navigate("/search")} aria-label="חיפוש מוצר">
        <Search size={19} />
        <span>חפשו מוצר, מותג או ברקוד</span>
      </button>

      <div className="home-grid" style={{ marginTop: 14 }}>
        <button className="hero" onClick={() => navigate("/capture")}>
          <div className="hero-icon">
            <Camera size={40} strokeWidth={1.8} />
          </div>
          <div className="hero-label">📷 צלם מוצר</div>
          <div className="hero-sub">צלמו את האריזה — ה-AI יזהה את המוצר וישווה מחירים</div>
        </button>

        <div className="action-grid stagger">
          <button className="action-tile" onClick={() => navigate("/scan")}>
            <span className="tile-icon blue">
              <ScanBarcode size={22} />
            </span>
            <span>
              סרוק ברקוד
              <small>הדרך המדויקת ביותר</small>
            </span>
          </button>
          <button className="action-tile" onClick={() => navigate("/search")}>
            <span className="tile-icon orange">
              <Search size={22} />
            </span>
            <span>
              חפש מוצר
              <small>לפי שם או מותג</small>
            </span>
          </button>
          <button className="action-tile" onClick={() => navigate("/basket")}>
            <span className="tile-icon green">
              <ShoppingBasket size={22} />
            </span>
            <span>
              השוואת סל
              <small>{basket.length ? `${basket.length} מוצרים בסל` : "איפה הסל הכי זול"}</small>
            </span>
          </button>
          <button className="action-tile" onClick={() => navigate("/favorites")}>
            <span className="tile-icon purple">
              <Heart size={22} />
            </span>
            <span>
              מועדפים
              <small>{favorites.length ? `${favorites.length} מוצרים` : "מוצרים שאתם קונים"}</small>
            </span>
          </button>
        </div>
      </div>

      {drops.length > 0 && (
        <Link to="/favorites" className="card pad" style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, border: "1px solid var(--accent)" }}>
          <span className="tile-icon green">
            <TrendingDown size={20} />
          </span>
          <span className="row-main">
            <b>{drops.length === 1 ? "מוצר אחד במועדפים ירד במחיר" : `${drops.length} מוצרים במועדפים ירדו במחיר`}</b>
            <div className="small muted">
              {drops
                .slice(0, 2)
                .map(([id, r]) => `${favorites.find((f) => f.id === id)?.name ?? ""} (−${formatILS(r.change!.drop)})`)
                .join(" · ")}
            </div>
          </span>
          <ChevronLeft size={18} className="chev" />
        </Link>
      )}

      {isDemo && (
        <div style={{ marginTop: 16 }}>
          <DemoBanner />
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">סריקות אחרונות</h2>
          {history.length > 0 && (
            <Link to="/history" className="section-link">
              הכל
            </Link>
          )}
        </div>
        {recent.length ? (
          <div className="scroller stagger">
            {recent.map((h) => (
              <Link key={h.id} to={`/product/${encodeURIComponent(h.product.id)}`} className="mini-card">
                <ProductThumb product={h.product} />
                <div className="mini-title">{h.product.name}</div>
                <div className="tiny faint">{[h.product.brand, formatSize(h.product.size)].filter(Boolean).join(" · ")}</div>
              </Link>
            ))}
          </div>
        ) : (
          <Link to="/search" className="card pad" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="tile-icon green">
              <History size={20} />
            </span>
            <span className="row-main">
              <b>עוד לא סרקתם מוצרים</b>
              <div className="small muted">נסו לחפש "קורנפלקס תלמה" כדי לראות איך זה עובד</div>
            </span>
            <ChevronLeft size={18} className="chev" />
          </Link>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">איך זה עובד</h2>
        </div>
        <div className="stat-strip stagger">
          <div className="stat">
            <div className="stat-value">1</div>
            <div className="stat-label">מצלמים או סורקים מוצר על המדף</div>
          </div>
          <div className="stat">
            <div className="stat-value">2</div>
            <div className="stat-label">משווים מחיר רגיל, מבצע ומועדון</div>
          </div>
          <div className="stat">
            <div className="stat-value">3</div>
            <div className="stat-label">רואים מקור ומועד עדכון לכל מחיר</div>
          </div>
        </div>
      </section>
    </div>
  );
}
