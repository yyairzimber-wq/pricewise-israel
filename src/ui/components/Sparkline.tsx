import type { PricePoint } from "../../core/types";
import { formatILS } from "../../core/services/format";

export function Sparkline({ points }: { points: PricePoint[] }) {
  if (points.length < 2) return null;
  const W = 600;
  const H = 120;
  const pad = 8;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  // Time runs right-to-left in RTL.
  const x = (i: number) => W - pad - (i / (points.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / range) * (H - pad * 2);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${H} L${x(0)},${H} Z`;
  const last = points[points.length - 1];

  return (
    <figure style={{ margin: 0 }}>
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`מגמת מחיר: מינימום ${formatILS(min)}, מקסימום ${formatILS(max)}`}>
        <defs>
          <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.25" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="area" d={area} />
        <path className="line" d={line} vectorEffect="non-scaling-stroke" />
        <circle cx={x(points.length - 1)} cy={y(last.price)} r="4.5" fill="var(--accent)" />
      </svg>
      <figcaption className="meta-line" style={{ justifyContent: "space-between" }}>
        <span>נמוך: <span className="num">{formatILS(min)}</span></span>
        <span>גבוה: <span className="num">{formatILS(max)}</span></span>
      </figcaption>
    </figure>
  );
}
