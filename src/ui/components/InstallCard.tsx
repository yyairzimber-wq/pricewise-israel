import { Download, Share, WifiOff, X } from "lucide-react";
import { useState } from "react";
import { useInstall, useOnline } from "../../pwa";

const KEY = "pw-install-dismissed";
const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** "Add to home screen" — one tap on Android/desktop Chrome, a how-to on iPhone. */
export function InstallCard() {
  const { mode, install } = useInstall();
  const [hidden, setHidden] = useState(read);
  if (mode === "none" || hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="card pad" style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
      <span className="tile-icon green">{mode === "ios" ? <Share size={20} /> : <Download size={20} />}</span>
      <div className="row-main">
        <b>התקינו כאפליקציה</b>
        <div className="small muted">
          {mode === "ios" ? "לחצו על כפתור השיתוף ואז ״הוספה למסך הבית״ — נפתח במסך מלא, גם בסופר בלי קליטה טובה." : "פתיחה ממסך הבית במסך מלא, וגם עובד כשהקליטה חלשה."}
        </div>
      </div>
      {mode === "prompt" && (
        <button className="btn sm primary" onClick={() => void install()}>
          התקנה
        </button>
      )}
      <button className="icon-btn plain" onClick={dismiss} aria-label="לא עכשיו">
        <X size={18} />
      </button>
    </div>
  );
}

/** Shown while offline: the app keeps working from the data saved on the device. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      style={{ position: "sticky", top: 0, zIndex: 30, display: "flex", gap: 8, alignItems: "center", justifyContent: "center", padding: "8px 14px", background: "var(--warn-soft, #fff4d6)", color: "var(--warn, #8a5a00)", fontSize: 14, fontWeight: 600 }}
    >
      <WifiOff size={16} /> אין חיבור — מוצגים מחירים שנשמרו במכשיר (ייתכן שאינם עדכניים)
    </div>
  );
}
