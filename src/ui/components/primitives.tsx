import { AlertTriangle, ChevronLeft } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CATEGORY_TINT, formatSize } from "../../core/services/format";
import type { Chain, Product } from "../../core/types";
import { create } from "zustand";

export function ProductThumb({ product, size }: { product: Pick<Product, "imageUrl" | "emoji" | "category" | "name">; size?: "lg" | "xl" }) {
  const [broken, setBroken] = useState(false);
  const tint = CATEGORY_TINT[product.category] ?? "#e5e7eb";
  return (
    <div className={`thumb ${size ?? ""}`} style={{ background: product.imageUrl && !broken ? "#fff" : `color-mix(in srgb, ${tint} 70%, var(--surface-2))` }} aria-hidden>
      {product.imageUrl && !broken ? <img src={product.imageUrl} alt="" loading="lazy" onError={() => setBroken(true)} /> : <span>{product.emoji ?? "🛒"}</span>}
    </div>
  );
}

export function ChainAvatar({ chain, small }: { chain: Chain; small?: boolean }) {
  const light = chain.color === "#ffcc00";
  return (
    <div className={`chain-avatar ${small ? "sm" : ""}`} style={{ background: chain.color, color: light ? "#222" : "#fff" }} aria-hidden>
      {chain.initials}
    </div>
  );
}

export function ProductRow({ product, to, end, onClick }: { product: Product; to?: string; end?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <ProductThumb product={product} />
      <div className="row-main">
        <div className="row-title">{product.name}</div>
        <div className="row-sub">{[product.brand, formatSize(product.size)].filter(Boolean).join(" · ")}</div>
      </div>
      <div className="row-end">
        {end}
        <ChevronLeft size={18} className="chev" />
      </div>
    </>
  );
  if (to) return <Link to={to} className="row" onClick={onClick}>{body}</Link>;
  return <button className="row" onClick={onClick}>{body}</button>;
}

export function DemoBanner({ children }: { children?: ReactNode }) {
  return (
    <div className="demo-banner" role="note">
      <AlertTriangle size={17} />
      <div>
        {children ?? (
          <>
            <b>מצב הדגמה.</b> המחירים באפליקציה הם נתוני הדגמה בלבד ואינם מחירים אמיתיים. <Link to="/settings#data">חיבור מקור מחירים</Link>
          </>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="list" aria-busy="true" aria-label="טוען">
      {Array.from({ length: count }, (_, i) => (
        <div className="row" key={i}>
          <div className="skeleton" style={{ width: 40, height: 40, borderRadius: 12 }} />
          <div className="row-main">
            <div className="skeleton" style={{ height: 14, width: "55%" }} />
            <div className="skeleton" style={{ height: 11, width: "35%", marginTop: 8 }} />
          </div>
          <div className="skeleton" style={{ height: 20, width: 64 }} />
        </div>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {children}
      </div>
    </div>
  );
}

// ---- Toast ----
const useToastStore = create<{ msg: ReactNode | null; key: number }>(() => ({ msg: null, key: 0 }));
let timer: number | undefined;

export function toast(msg: ReactNode) {
  window.clearTimeout(timer);
  useToastStore.setState((s) => ({ msg, key: s.key + 1 }));
  timer = window.setTimeout(() => useToastStore.setState({ msg: null }), 2600);
}

export function ToastHost() {
  const { msg, key } = useToastStore();
  if (!msg) return null;
  return (
    <div className="toast" key={key} role="status" aria-live="polite">
      {msg}
    </div>
  );
}
