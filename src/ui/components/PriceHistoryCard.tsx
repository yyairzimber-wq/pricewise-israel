import { TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { getChain } from "../../core/data/chains";
import { formatDate, formatILS } from "../../core/services/format";
import { analyze, priceOverTime, type HistoryStats } from "../../core/services/history";
import type { PriceHistory } from "../../core/types";
import { useApp } from "../../state/store";

type Range = "30" | "90" | "all";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();

/**
 * Real recorded shelf prices over time (see server/src/history.ts). It only goes
 * back to the day we started recording, and says so — with under a week of data
 * it makes no "lowest/highest" claims.
 */
export function PriceHistoryCard({ history }: { history: PriceHistory }) {
  const followed = useApp((s) => s.followedChains);
  const [chainId, setChainId] = useState<string | undefined>();
  const [range, setRange] = useState<Range>("all");

  const all = useMemo(() => priceOverTime(history, chainId, followed), [history, chainId, followed]);
  const spanDays = all.length ? Math.round((all.at(-1)!.t - all[0].t) / DAY) + 1 : 0;
  const sinceMs = range === "all" || !all.length ? undefined : all.at(-1)!.t - Number(range) * DAY;
  const points = useMemo(() => (sinceMs == null ? all : all.filter((p, i) => p.t >= sinceMs || (all[i + 1] && all[i + 1].t > sinceMs))), [all, sinceMs]);
  const stats = useMemo(() => analyze(points), [points]);

  const chains = history.series.filter((s) => followed.includes(s.chainId));
  const sinceLabel = formatDate(iso(Date.parse(history.since)));

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">היסטוריית מחיר</h2>
        {spanDays > 30 && (
          <div className="chips" style={{ margin: 0 }}>
            {(["30", "90", "all"] as Range[]).map((r) => (
              <button key={r} className={`chip ${range === r ? "on" : ""}`} onClick={() => setRange(r)}>
                {r === "all" ? "הכל" : `${r} יום`}
              </button>
            ))}
          </div>
        )}
      </div>

      {chains.length > 1 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          <button className={`chip ${!chainId ? "on" : ""}`} onClick={() => setChainId(undefined)}>
            הזול ביותר
          </button>
          {chains.map((s) => (
            <button key={s.chainId} className={`chip ${chainId === s.chainId ? "on" : ""}`} onClick={() => setChainId(s.chainId)}>
              {getChain(s.chainId).name}
            </button>
          ))}
        </div>
      )}

      <div className="card pad">
        {stats && <Verdict stats={stats} />}
        {points.length >= 2 && stats && stats.days >= 2 ? <StepChart points={points} /> : null}
        {stats && (
          <dl className="kv" style={{ marginTop: 10 }}>
            <dt>היום</dt>
            <dd className="num">{formatILS(stats.current)}</dd>
            {stats.days >= 2 && stats.max > stats.min && (
              <>
                <dt>הנמוך ביותר</dt>
                <dd>
                  <span className="num">{formatILS(stats.min)}</span> <span className="faint">· {formatDate(iso(stats.minAt))}</span>
                </dd>
                <dt>הגבוה ביותר</dt>
                <dd>
                  <span className="num">{formatILS(stats.max)}</span> <span className="faint">· {formatDate(iso(stats.maxAt))}</span>
                </dd>
              </>
            )}
          </dl>
        )}
        <p className="small muted" style={{ margin: "10px 0 0", lineHeight: 1.6 }}>
          מחיר מדף רגיל, ללא מבצעים. אנחנו עוקבים אחרי המחירים מאז {sinceLabel} — מחירים מלפני כן אינם ידועים לנו ולא מוצגים.
        </p>
      </div>
    </section>
  );
}

function Verdict({ stats }: { stats: HistoryStats }) {
  const days = `${stats.days} ימים`;
  switch (stats.verdict) {
    case "collecting":
      return (
        <p className="small" style={{ margin: "0 0 8px" }}>
          אוספים עכשיו היסטוריה ({days} עד כה). אחרי שבוע נוכל להגיד אם המחיר גבוה או נמוך מהרגיל.
        </p>
      );
    case "stable":
      return <div className="badge" style={{ marginBottom: 8 }}>מחיר יציב ב-{days} האחרונים</div>;
    case "lowest":
      return (
        <div className="badge promo" style={{ marginBottom: 8, display: "inline-flex", gap: 4, alignItems: "center" }}>
          <TrendingDown size={14} /> הנמוך ביותר ב-{days} שאנחנו עוקבים
        </div>
      );
    case "highest":
      return (
        <div className="badge warn" style={{ marginBottom: 8, display: "inline-flex", gap: 4, alignItems: "center" }}>
          <TrendingUp size={14} /> הגבוה ביותר ב-{days} — אולי כדאי לחכות
        </div>
      );
    default:
      return (
        <div className="badge" style={{ marginBottom: 8 }}>
          גבוה ב-<span className="num">{Math.round(stats.aboveMinPct)}%</span> מהמחיר הנמוך ב-{days}
        </div>
      );
  }
}

/** Step line: a price holds until it changes. Oldest on the right (RTL). */
function StepChart({ points }: { points: { t: number; price: number }[] }) {
  const W = 600;
  const H = 130;
  const pad = 10;
  const t0 = points[0].t;
  const t1 = points.at(-1)!.t;
  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const x = (t: number) => W - pad - ((t - t0) / (t1 - t0 || 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / range) * (H - pad * 2 - 6);
  let d = `M${x(points[0].t).toFixed(1)},${y(points[0].price).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) d += ` H${x(points[i].t).toFixed(1)} V${y(points[i].price).toFixed(1)}`;
  const last = points.at(-1)!;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`היסטוריית מחיר: מ-${formatILS(min)} עד ${formatILS(max)}`}>
      <path className="line" d={d} vectorEffect="non-scaling-stroke" fill="none" />
      {points.map((p, i) => (i < points.length - 1 ? <circle key={i} cx={x(p.t)} cy={y(p.price)} r="3.5" fill="var(--accent)" /> : null))}
      <circle cx={x(last.t)} cy={y(last.price)} r="4.5" fill="var(--accent)" />
    </svg>
  );
}
