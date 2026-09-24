import { Clock, Database, ShieldCheck } from "lucide-react";
import { formatDateTime, relativeTime } from "../../core/services/format";
import type { Freshness, PriceKind } from "../../core/services/pricing";
import type { DataSource, PriceQuote } from "../../core/types";

export function KindBadge({ kind, label }: { kind: PriceKind; label?: string }) {
  if (kind === "promo") return <span className="badge promo">מבצע{label ? ` · ${label}` : ""}</span>;
  if (kind === "club") return <span className="badge club">מחיר מועדון</span>;
  return <span className="badge">מחיר רגיל</span>;
}

export function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  if (freshness === "stale") return <span className="badge warn">לא עדכני</span>;
  return null;
}

export function SourceBadge({ source }: { source: DataSource }) {
  if (source.kind === "demo") return <span className="badge warn">הדגמה</span>;
  return (
    <span className="badge blue">
      <ShieldCheck size={12} /> מקור מאומת
    </span>
  );
}

/** "עודכן לפני 3 שעות · מקור: …" — shown under every single price. */
export function QuoteMeta({ quote }: { quote: PriceQuote }) {
  return (
    <div className="meta-line">
      <span title={formatDateTime(quote.updatedAt)}>
        <Clock style={{ verticalAlign: "-2px" }} /> עודכן {relativeTime(quote.updatedAt)}
      </span>
      <span className="dot">
        <Database style={{ verticalAlign: "-2px" }} /> {quote.source.url ? <a href={quote.source.url} target="_blank" rel="noreferrer">{quote.source.label}</a> : quote.source.label}
      </span>
    </div>
  );
}
