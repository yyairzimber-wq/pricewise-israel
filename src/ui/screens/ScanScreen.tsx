import type { IScannerControls } from "@zxing/browser";
import { Camera, Flashlight, Keyboard, ScanBarcode, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { startCameraScan } from "../../core/services/barcode";
import { haptic, useProviders } from "../../state/hooks";
import { useApp } from "../../state/store";
import { Sheet, ToastHost } from "../components/primitives";

type Phase = "starting" | "scanning" | "denied" | "unsupported" | "looking-up" | "not-found";

export function ScanScreen() {
  const navigate = useNavigate();
  const { catalog } = useProviders();
  const addHistory = useApp((s) => s.addHistory);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [code, setCode] = useState("");
  const [torch, setTorch] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [hit, setHit] = useState(false);

  const stop = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  };

  const lookup = useCallback(
    async (barcode: string) => {
      setCode(barcode);
      setPhase("looking-up");
      const product = await catalog.getByBarcode(barcode).catch(() => null);
      if (product) {
        addHistory(product, "barcode");
        navigate(`/product/${encodeURIComponent(product.id)}`, { replace: true });
      } else {
        setPhase("not-found");
      }
    },
    [catalog, addHistory, navigate],
  );

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }
    setPhase("starting");
    try {
      controlsRef.current = await startCameraScan(videoRef.current!, (text) => {
        const now = Date.now();
        if (lastRef.current && lastRef.current.code === text && now - lastRef.current.at < 2500) return;
        lastRef.current = { code: text, at: now };
        if (!/^\d{6,14}$/.test(text)) return; // ignore non-retail codes (QR, etc.)
        setHit(true);
        haptic(30);
        stop();
        void lookup(text);
      });
      setPhase("scanning");
      const track = (videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
      setTorchAvailable(!!caps?.torch);
    } catch (e) {
      const name = (e as DOMException)?.name;
      setPhase(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported");
    }
  }, [lookup]);

  useEffect(() => {
    void start();
    return stop;
  }, [start]);

  const toggleTorch = async () => {
    const track = (videoRef.current?.srcObject as MediaStream | null)?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] });
      setTorch(!torch);
    } catch {
      setTorchAvailable(false);
    }
  };

  const rescan = () => {
    setHit(false);
    lastRef.current = null;
    void start();
  };

  const close = () => {
    stop();
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const v = manual.replace(/\D/g, "");
    if (v.length < 6) return;
    setManualOpen(false);
    stop();
    void lookup(v);
  };

  return (
    <div className="camera" dir="rtl">
      <video ref={videoRef} playsInline muted autoPlay aria-label="תצוגת מצלמה" />

      <div className="camera-top">
        <button className="glass-btn" onClick={close} aria-label="סגירה">
          <X size={22} />
        </button>
        <div className="camera-title">סריקת ברקוד</div>
        {torchAvailable ? (
          <button className={`glass-btn ${torch ? "on" : ""}`} onClick={toggleTorch} aria-label="פנס" aria-pressed={torch}>
            <Flashlight size={20} />
          </button>
        ) : (
          <span style={{ width: 44 }} />
        )}
      </div>

      {phase === "denied" || phase === "unsupported" ? (
        <div className="camera-msg">
          <ScanBarcode size={44} />
          <h3>{phase === "denied" ? "אין גישה למצלמה" : "המצלמה אינה זמינה"}</h3>
          <p>{phase === "denied" ? "אפשרו גישה למצלמה בהגדרות הדפדפן או המכשיר, או הקלידו את מספר הברקוד." : "אפשר להקליד את מספר הברקוד שמופיע מתחת לפסים."}</p>
          <div className="btn-row">
            <button className="btn primary" onClick={() => setManualOpen(true)}>
              <Keyboard size={18} /> הקלדת ברקוד
            </button>
            {phase === "denied" && (
              <button className="btn" onClick={rescan}>
                נסו שוב
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="camera-stage">
          <div className={`viewfinder ${hit ? "hit" : ""}`}>
            <i /><i /><i /><i />
            {phase === "scanning" && <div className="laser" />}
            <div className="camera-hint">
              {phase === "starting" && "מפעילים מצלמה…"}
              {phase === "scanning" && "כוונו את הברקוד למסגרת"}
              {phase === "looking-up" && `מחפשים את ${code}…`}
            </div>
          </div>
        </div>
      )}

      <div className="camera-bottom">
        <button className="glass-btn" onClick={() => setManualOpen(true)} aria-label="הקלדת ברקוד ידנית">
          <Keyboard size={20} />
        </button>
        <button className="btn" style={{ background: "rgba(255,255,255,.16)", color: "#fff", backdropFilter: "blur(14px)" }} onClick={() => { stop(); navigate("/capture", { replace: true }); }}>
          <Camera size={18} /> אין ברקוד? צלמו את האריזה
        </button>
      </div>

      <Sheet open={manualOpen} onClose={() => setManualOpen(false)} label="הקלדת ברקוד">
        <h2>הקלדת ברקוד</h2>
        <p className="lead">המספר שמופיע מתחת לפסים — בדרך כלל 13 ספרות.</p>
        <form onSubmit={submitManual} style={{ display: "grid", gap: 12 }}>
          <input className="input ltr num" style={{ display: "block", fontSize: 20, letterSpacing: 2 }} inputMode="numeric" autoFocus placeholder="7290000000000" value={manual} onChange={(e) => setManual(e.target.value)} aria-label="מספר ברקוד" />
          <button className="btn primary block" disabled={manual.replace(/\D/g, "").length < 6}>
            חיפוש
          </button>
        </form>
      </Sheet>

      <Sheet open={phase === "not-found"} onClose={rescan} label="הברקוד לא נמצא">
        <h2>לא מצאנו את המוצר</h2>
        <p className="lead">
          הברקוד <span className="num">{code}</span> לא נמצא במאגרי המוצרים שלנו. אפשר לנסות לזהות אותו מתמונה או לחפש בשם.
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <button className="btn primary block" onClick={() => navigate("/capture", { replace: true })}>
            <Camera size={18} /> זיהוי מתמונה עם AI
          </button>
          <button className="btn tinted block" onClick={() => navigate("/search", { replace: true })}>
            <Search size={18} /> חיפוש לפי שם
          </button>
          <button className="btn block" onClick={rescan}>
            סריקה חוזרת
          </button>
        </div>
      </Sheet>
      <ToastHost />
    </div>
  );
}
