import { Camera, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { removePhoto, savePhoto, useLocalPhoto } from "../../core/services/localPhotos";
import { toast } from "./primitives";

/** "Add a photo" for a product that has none — saved on this device only. */
export function AddPhotoButton({ barcode, hasPublicPhoto }: { barcode?: string; hasPublicPhoto: boolean }) {
  const own = useLocalPhoto(barcode);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!barcode || hasPublicPhoto) return null;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      await savePhoto(barcode, f);
      toast("התמונה נשמרה במכשיר שלכם");
    } catch {
      toast("לא הצלחנו לשמור את התמונה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="badge" onClick={() => (own ? void removePhoto(barcode) : input.current?.click())} disabled={busy} style={{ cursor: "pointer", border: 0 }}>
        {own ? (
          <>
            <Trash2 size={12} /> הסרת התמונה
          </>
        ) : (
          <>
            <Camera size={12} /> הוספת תמונה
          </>
        )}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e)} />
    </>
  );
}
