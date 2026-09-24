import { ChevronLeft, Database, Heart, History, Monitor, Moon, Sparkles, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { CHAINS } from "../../core/data/chains";
import { useApp, type ThemeMode } from "../../state/store";
import { useProviders } from "../../state/hooks";
import { ChainAvatar, Segmented, Switch, toast } from "../components/primitives";
import { TopBar } from "../components/TopBar";

function Group({ title, children, footer, id }: { title: string; children: ReactNode; footer?: ReactNode; id?: string }) {
  return (
    <section className="section" id={id}>
      <div className="section-head">
        <h2 className="section-title" style={{ fontSize: 13, textTransform: "uppercase", color: "var(--text-2)", fontWeight: 600, letterSpacing: 0.3 }}>{title}</h2>
      </div>
      <div className="list">{children}</div>
      {footer && <p className="legal" style={{ marginTop: 8 }}>{footer}</p>}
    </section>
  );
}

function ToggleRow({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row no-indent">
      <div className="row-main">
        <div className="row-title" style={{ fontWeight: 500 }}>{label}</div>
        {sub && <div className="row-sub" style={{ whiteSpace: "normal" }}>{sub}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export function SettingsScreen() {
  const s = useApp();
  const { prices, recognizer } = useProviders();
  const { hash } = useLocation();
  const [apiUrl, setApiUrl] = useState(s.data.apiBaseUrl);
  const [aiUrl, setAiUrl] = useState(s.data.aiEndpoint);

  useEffect(() => {
    if (hash === "#data") document.getElementById("data")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash]);

  const saveData = () => {
    s.setData({ apiBaseUrl: apiUrl.trim(), aiEndpoint: aiUrl.trim() });
    toast("הגדרות מקור הנתונים נשמרו");
  };

  return (
    <div className="page">
      <TopBar back={false} title="הגדרות" />
      <h1 className="large-title">הגדרות</h1>

      <Group title="הספרייה שלי">
        <Link to="/favorites" className="row">
          <span className="tile-icon purple" style={{ width: 36, height: 36, borderRadius: 10 }}><Heart size={18} /></span>
          <div className="row-main"><div className="row-title" style={{ fontWeight: 500 }}>מועדפים</div></div>
          <div className="row-end"><span className="num">{s.favorites.length}</span><ChevronLeft size={18} className="chev" /></div>
        </Link>
        <Link to="/history" className="row">
          <span className="tile-icon blue" style={{ width: 36, height: 36, borderRadius: 10 }}><History size={18} /></span>
          <div className="row-main"><div className="row-title" style={{ fontWeight: 500 }}>היסטוריית סריקות</div></div>
          <div className="row-end"><span className="num">{s.history.length}</span><ChevronLeft size={18} className="chev" /></div>
        </Link>
      </Group>

      <Group title="מראה">
        <div className="row no-indent">
          <div style={{ width: "100%" }}>
            <Segmented<ThemeMode>
              label="ערכת צבעים"
              value={s.theme}
              onChange={s.setTheme}
              options={[
                { value: "system", label: <><Monitor size={15} /> מערכת</> },
                { value: "light", label: <><Sun size={15} /> בהיר</> },
                { value: "dark", label: <><Moon size={15} /> כהה</> },
              ]}
            />
          </div>
        </div>
      </Group>

      <Group title="השוואת מחירים" footer="מחיר שעודכן לפני יותר מהזמן שנבחר יוצג כ״לא עדכני״ ולא ישתתף בבחירת הרשת הזולה.">
        <ToggleRow label="כולל מחירי מבצע" sub="מבצעי כמות נכללים רק כשהכמות מתאימה" checked={s.prefs.includePromos} onChange={(v) => s.setPrefs({ includePromos: v })} />
        <ToggleRow label="כולל מחירי מועדון" sub="הפעילו אם אתם חברי מועדון ברשתות" checked={s.prefs.includeClub} onChange={(v) => s.setPrefs({ includeClub: v })} />
        <div className="row no-indent" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div className="row-title" style={{ fontWeight: 500 }}>תוקף מחיר מקסימלי</div>
          <Segmented
            label="תוקף מחיר מקסימלי"
            value={String(s.prefs.maxAgeHours)}
            onChange={(v) => s.setPrefs({ maxAgeHours: Number(v) })}
            options={[
              { value: "24", label: "24 שעות" },
              { value: "72", label: "3 ימים" },
              { value: "168", label: "שבוע" },
            ]}
          />
        </div>
        <div className="row no-indent">
          <div className="row-main">
            <div className="row-title" style={{ fontWeight: 500 }}>הרשת הקבועה שלי</div>
            <div className="row-sub" style={{ whiteSpace: "normal" }}>נשווה אליה: ״מצאנו ב-X ₪ פחות ב…״</div>
          </div>
          <select className="input" style={{ width: "auto", height: 38 }} value={s.homeChainId ?? ""} onChange={(e) => s.setHomeChain(e.target.value || null)} aria-label="הרשת הקבועה שלי">
            <option value="">ללא</option>
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </Group>

      <Group title="רשתות להשוואה" footer="רשתות כבויות לא יופיעו בתוצאות ובהשוואת הסל.">
        {CHAINS.map((c) => (
          <div className="row" key={c.id}>
            <ChainAvatar chain={c} small />
            <div className="row-main">
              <div className="row-title" style={{ fontWeight: 500 }}>{c.name}</div>
              {c.clubName && <div className="row-sub">{c.clubName}</div>}
            </div>
            <Switch checked={s.followedChains.includes(c.id)} onChange={() => s.toggleChain(c.id)} label={c.name} />
          </div>
        ))}
      </Group>

      <Group title="מיקום">
        <div className="row no-indent" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div className="row-title" style={{ fontWeight: 500 }}>רדיוס חיפוש סניפים</div>
          <Segmented
            label="רדיוס"
            value={String(s.radiusKm)}
            onChange={(v) => s.setRadius(Number(v))}
            options={["3", "5", "10", "25"].map((v) => ({ value: v, label: `${v} ק״מ` }))}
          />
        </div>
      </Group>

      <Group
        id="data"
        title="מקור נתונים"
        footer={
          <>
            במצב הדגמה כל המחירים והסניפים הם נתונים לדוגמה בלבד. מחירים אמיתיים דורשים שרת שקולט את קובצי המחירים שהרשתות מפרסמות לפי חוק קידום התחרות בענף המזון (שקיפות מחירים) — ראו docs/API.md.
          </>
        }
      >
        <div className="row no-indent" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Database size={18} />
            <b style={{ flex: 1 }}>מחירים</b>
            <span className={`badge ${prices.isDemo ? "warn" : "green"}`}>{prices.isDemo ? "הדגמה" : s.data.mode === "static" ? "תמונת מצב יומית" : "שרת מחירים"}</span>
          </div>
          <Segmented
            label="מצב נתונים"
            value={s.data.mode}
            onChange={(mode) => s.setData({ mode })}
            options={[
              { value: "demo", label: "הדגמה" },
              { value: "static", label: "תמונת מצב" },
              { value: "api", label: "שרת מחירים" },
            ]}
          />
          {s.data.mode === "api" && (
            <div className="field">
              <label htmlFor="api">כתובת שרת המחירים</label>
              <input id="api" className="input ltr" placeholder="https://api.example.co.il/v1" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
              {!s.data.apiBaseUrl && <span className="tiny faint">כל עוד לא הוגדרה כתובת — נשארים בנתוני הדגמה.</span>}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <Sparkles size={18} />
            <b style={{ flex: 1 }}>זיהוי מוצרים מתמונה (AI)</b>
            <span className={`badge ${recognizer.isDemo ? "warn" : "green"}`}>{recognizer.isDemo ? "לא מחובר" : "מחובר"}</span>
          </div>
          <div className="field">
            <label htmlFor="ai">כתובת שירות הזיהוי</label>
            <input id="ai" className="input ltr" placeholder="/api/recognize" value={aiUrl} onChange={(e) => setAiUrl(e.target.value)} />
          </div>
          <button className="btn sm tinted" onClick={saveData}>שמירה</button>
        </div>
        <ToggleRow label="פרטי מוצרים מ-Open Food Facts" sub="שם, מותג ותמונה לברקודים אמיתיים (ללא מחירים)" checked={s.data.useOpenFoodFacts} onChange={(v) => s.setData({ useOpenFoodFacts: v })} />
      </Group>

      <Group title="כללי">
        <ToggleRow label="רטט בסריקה" checked={s.haptics} onChange={s.setHaptics} />
        <button className="row no-indent" onClick={() => confirm("למחוק את היסטוריית הסריקות?") && (s.clearHistory(), toast("ההיסטוריה נמחקה"))}>
          <div className="row-main" style={{ color: "var(--danger)" }}>מחיקת היסטוריית סריקות</div>
        </button>
        <button className="row no-indent" onClick={() => confirm("לאפס את כל ההגדרות והנתונים במכשיר?") && (s.resetAll(), toast("האפליקציה אופסה"))}>
          <div className="row-main" style={{ color: "var(--danger)" }}>איפוס כל הנתונים</div>
        </button>
      </Group>

      <p className="legal" style={{ textAlign: "center", marginTop: 28 }}>
        PriceWise ישראל · גרסה 0.1.0
        <br />
        אנחנו לא ממציאים מחירים: לכל מחיר מוצגים מקור ומועד עדכון, ומחיר שלא אומת לא יוצג.
      </p>
    </div>
  );
}
