import { Camera, ImagePlus, RotateCcw, ScanBarcode, Search, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { warmUpOcr } from "../../core/providers/recognition/ocr";
import { RecognitionNotConfigured } from "../../core/providers/recognition/recognizers";
import { recognizeProduct } from "../../core/services/recognition";
import type { RecognitionCandidate, RecognitionResult } from "../../core/types";
import { haptic, useProviders } from "../../state/hooks";
import { useApp } from "../../state/store";
import { DemoBanner, ProductThumb, Sheet } from "../components/primitives";

type Phase = "starting" | "live" | "no-camera" | "processing" | "choose" | "error";

const STEPS = ["מחפשים ברקוד בתמונה…", "קוראים את הכיתוב על האריזה…", "מתאימים למאגר המוצרים…"];

export function CaptureScreen() {
  const navigate = useNavigate();
  const providers = useProviders();
  const addHistory = useApp((s) => s.addHistory);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [still, setStill] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [aiMissing, setAiMissing] = useState(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startStream = useCallback(async () => {
    setPhase("starting");
    if (!navigator.mediaDevices?.getUserMedia) return setPhase("no-camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setPhase("live");
    } catch {
      setPhase("no-camera");
    }
  }, []);

  useEffect(() => {
    void startStream();
    return stopStream;
  }, [startStream]);

  // On-device reading needs a one-time engine download: start it while the user frames the shot.
  useEffect(() => {
    if (providers.recognizer.id === "ocr" || providers.recognizer.id === "ai-or-ocr") warmUpOcr();
  }, [providers.recognizer]);

  useEffect(() => {
    if (phase !== "processing") return;
    setStep(0);
    const id = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2500);
    return () => window.clearInterval(id);
  }, [phase]);

  const analyze = async (blob: Blob) => {
    setStill(URL.createObjectURL(blob));
    stopStream();
    setPhase("processing");
    try {
      const r = await recognizeProduct(blob, { recognizer: providers.recognizer, catalog: providers.catalog });
      setResult(r);
      const top = r.candidates[0];
      if (r.confident && top?.product) {
        haptic(30);
        open(top);
      } else {
        setPhase("choose");
      }
    } catch (e) {
      setAiMissing(e instanceof RecognitionNotConfigured);
      setPhase("error");
    }
  };

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setFlash(true);
    haptic(15);
    window.setTimeout(() => setFlash(false), 350);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob((b) => b && void analyze(b), "image/jpeg", 0.92);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void analyze(f);
  };

  const open = (c: RecognitionCandidate) => {
    if (c.product) {
      providers.catalog.remember(c.product);
      addHistory(c.product, "photo");
      navigate(`/product/${encodeURIComponent(c.product.id)}`, { replace: true });
    } else {
      navigate(`/search?q=${encodeURIComponent([c.brand, c.name].filter(Boolean).join(" "))}`, { replace: true });
    }
  };

  const retake = () => {
    setResult(null);
    setStill(null);
    void startStream();
  };

  const close = () => {
    stopStream();
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  return (
    <div className="camera" dir="rtl">
      <video ref={videoRef} playsInline muted autoPlay aria-label="תצוגת מצלמה" style={{ visibility: still ? "hidden" : "visible" }} />
      {still && <img className="still" src={still} alt="התמונה שצולמה" />}
      {flash && <div className="flash" />}

      <div className="camera-top">
        <button className="glass-btn" onClick={close} aria-label="סגירה">
          <X size={22} />
        </button>
        <div className="camera-title">צילום מוצר</div>
        <button className="glass-btn" onClick={() => { stopStream(); navigate("/scan", { replace: true }); }} aria-label="מעבר לסריקת ברקוד">
          <ScanBarcode size={20} />
        </button>
      </div>

      {phase === "no-camera" ? (
        <div className="camera-msg">
          <Camera size={44} />
          <h3>המצלמה אינה זמינה</h3>
          <p>אפשר לבחור תמונה של המוצר מהגלריה, או לאשר גישה למצלמה ולנסות שוב.</p>
          <div className="btn-row">
            <button className="btn primary" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={18} /> בחירת תמונה
            </button>
            <button className="btn" onClick={() => void startStream()}>
              נסו שוב
            </button>
          </div>
        </div>
      ) : (
        <div className="camera-stage">
          {!still && (
            <div className="viewfinder square">
              <i /><i /><i /><i />
              <div className="camera-hint">{phase === "starting" ? "מפעילים מצלמה…" : "מרכזו את חזית האריזה במסגרת"}</div>
            </div>
          )}
        </div>
      )}

      {phase === "processing" && (
        <div className="processing" role="status" aria-live="polite">
          <div className="processing-card">
            <div className="ring" />
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              <Sparkles size={18} style={{ verticalAlign: "-3px" }} /> מזהים את המוצר
            </div>
            <div style={{ opacity: 0.8, marginTop: 4 }}>{STEPS[step]}</div>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="processing">
          <div className="camera-msg">
            <h3>{aiMissing ? "זיהוי AI עוד לא מופעל" : "הזיהוי נכשל"}</h3>
            <p>
              {aiMissing
                ? "שרת המחירים פועל, אבל זיהוי מוצרים מתמונה דורש מפתח AI שעוד לא הוגדר. בינתיים אפשר לסרוק את הברקוד או לחפש לפי שם."
                : "לא הצלחנו לנתח את התמונה. נסו לצלם שוב באור טוב, או לסרוק את הברקוד."}
            </p>
            <div className="btn-row">
              <button className="btn primary" onClick={retake}>
                <RotateCcw size={18} /> צילום חוזר
              </button>
              <button className="btn" onClick={() => navigate("/scan", { replace: true })}>
                סריקת ברקוד
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="camera-bottom">
        <button className="glass-btn" onClick={() => fileRef.current?.click()} aria-label="בחירה מהגלריה">
          <ImagePlus size={20} />
        </button>
        <button className="shutter" onClick={shoot} disabled={phase !== "live"} aria-label="צילום" />
        <span style={{ width: 44 }} />
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />

      <Sheet open={phase === "choose"} onClose={retake} label="בחירת מוצר">
        <h2>איזה מוצר צילמתם?</h2>
        <p className="lead">
          {result?.method === "text"
            ? "זיהינו לפי הכיתוב על האריזה. בחרו את המוצר הנכון מהרשימה."
            : "הזיהוי לא ודאי מספיק כדי לבחור לבד — בחרו את המוצר הנכון מהרשימה."}
        </p>
        {result?.source.kind === "demo" && (
          <div style={{ marginBottom: 12 }}>
            <DemoBanner>
              <b>זיהוי AI לא מחובר.</b> ההצעות כאן הן מוצרי הדגמה ולא תוצאה של ניתוח התמונה. להפעלה — הגדירו כתובת זיהוי בהגדרות.
            </DemoBanner>
          </div>
        )}
        {result && result.candidates.length > 0 ? (
          <div className="list stagger">
            {result.candidates.map((c, i) => (
              <button className="row" key={i} onClick={() => open(c)}>
                {c.product ? <ProductThumb product={c.product} /> : <div className="thumb">❔</div>}
                <div className="row-main">
                  <div className="row-title">{c.product?.name ?? c.name}</div>
                  <div className="row-sub">{[c.product?.brand ?? c.brand, c.sizeText].filter(Boolean).join(" · ") || "לא נמצא במאגר — נחפש לפי שם"}</div>
                </div>
                <div className="confidence" aria-label={`ודאות ${Math.round(c.confidence * 100)}%`}>
                  <b className="num">{Math.round(c.confidence * 100)}%</b>
                  <div className="bar-track">
                    <div className={`bar-fill ${c.confidence < 0.5 ? "high" : c.confidence < 0.8 ? "mid" : ""}`} style={{ width: `${c.confidence * 100}%` }} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">
            {result?.method === "text"
              ? "לא הצלחנו לקרוא כיתוב שמתאים למוצר במאגר. צלמו את חזית האריזה מקרוב ובאור טוב — או את הברקוד, שהוא הדרך המדויקת ביותר."
              : "לא זוהה מוצר בתמונה."}
          </p>
        )}
        <div className="btn-row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={retake}>
            <RotateCcw size={18} /> צילום חוזר
          </button>
          <button className="btn tinted" onClick={() => navigate("/search", { replace: true })}>
            <Search size={18} /> חיפוש ידני
          </button>
        </div>
      </Sheet>
    </div>
  );
}
