import { Heart, History, Home, MapPin, ScanBarcode, Search, Settings, ShoppingBasket, Camera } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useApp } from "../../state/store";
import { ToastHost } from "../components/primitives";

export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return <img className={className} src="./icon.svg" alt="" />;
}

export function AppShell() {
  const basketCount = useApp((s) => s.basket.reduce((n, i) => n + i.quantity, 0));
  const favCount = useApp((s) => s.favorites.length);
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const side = [
    { to: "/", icon: Home, label: "בית", end: true },
    { to: "/search", icon: Search, label: "חיפוש מוצר" },
    { to: "/capture", icon: Camera, label: "צילום מוצר" },
    { to: "/scan", icon: ScanBarcode, label: "סריקת ברקוד" },
    { to: "/basket", icon: ShoppingBasket, label: "השוואת סל", count: basketCount },
    { to: "/nearby", icon: MapPin, label: "סניפים קרובים" },
    { to: "/favorites", icon: Heart, label: "מועדפים", count: favCount },
    { to: "/history", icon: History, label: "היסטוריית סריקות" },
  ];

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="ניווט ראשי">
        <div className="brand">
          <BrandMark />
          <div>
            PriceWise
            <small>השוואת מחירי סופר בישראל</small>
          </div>
        </div>
        {side.map(({ to, icon: Icon, label, end, count }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}>
            <Icon size={20} />
            {label}
            {!!count && <span className="count num">{count}</span>}
          </NavLink>
        ))}
        <div className="side-sep" />
        <NavLink to="/settings" className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}>
          <Settings size={20} />
          הגדרות
        </NavLink>
      </aside>

      <main className="main">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="ניווט ראשי">
        <NavLink to="/" end className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
          <Home size={24} />
          בית
        </NavLink>
        <NavLink to="/basket" className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
          <ShoppingBasket size={24} />
          סל
          {basketCount > 0 && <span className="tab-badge num">{basketCount}</span>}
        </NavLink>
        <NavLink to="/scan" className="tab tab-scan" aria-label="סריקת ברקוד">
          <span>
            <ScanBarcode size={26} />
          </span>
        </NavLink>
        <NavLink to="/nearby" className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
          <MapPin size={24} />
          סניפים
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `tab ${isActive || pathname === "/favorites" || pathname === "/history" ? "active" : ""}`}>
          <Settings size={24} />
          עוד
        </NavLink>
      </nav>
      <ToastHost />
    </div>
  );
}
