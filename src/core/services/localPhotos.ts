import { useSyncExternalStore } from "react";

/**
 * The user's own photos of products (taken with the camera), kept on this device
 * only — IndexedDB, nothing is uploaded. They fill in for products that have no
 * public photo. Small on purpose: 240px JPEG ≈ 10–15 KB each.
 */

const DB_NAME = "pricewise-photos";
const STORE = "photos";
const MAX_PHOTOS = 400;

interface Stored {
  barcode: string;
  url: string; // data URL
  at: number;
}

const photos = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;
let loaded: Promise<void> | null = null;

const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "barcode" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });

/** Load saved photos once (lazily — only when something asks for a photo). */
export function loadPhotos(): Promise<void> {
  loaded ??= (async () => {
    try {
      const db = await openDb();
      const rows = await new Promise<Stored[]>((res, rej) => {
        const r = db.transaction(STORE).objectStore(STORE).getAll();
        r.onsuccess = () => res(r.result as Stored[]);
        r.onerror = () => rej(r.error);
      });
      for (const row of rows) photos.set(row.barcode, row.url);
      if (rows.length) emit();
    } catch {
      /* private mode / blocked: photos then live only for this session */
    }
  })();
  return loaded;
}

async function toThumbnail(blob: Blob, side = 240): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  // Centre-crop to a square so every product tile looks alike.
  const s = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(side, s);
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.75);
}

export async function savePhoto(barcode: string, image: Blob): Promise<void> {
  if (!/^\d{8,14}$/.test(barcode)) return;
  const url = await toThumbnail(image);
  photos.set(barcode, url);
  emit();
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.put({ barcode, url, at: Date.now() } satisfies Stored);
    const all = store.getAll();
    all.onsuccess = () => {
      const rows = (all.result as Stored[]).sort((a, b) => a.at - b.at);
      for (const old of rows.slice(0, Math.max(0, rows.length - MAX_PHOTOS))) {
        store.delete(old.barcode);
        photos.delete(old.barcode);
      }
    };
    await done(tx);
  } catch {
    /* kept in memory for this session */
  }
}

export async function removePhoto(barcode: string): Promise<void> {
  photos.delete(barcode);
  emit();
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(barcode);
    await done(tx);
  } catch {
    /* ignore */
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  void loadPhotos();
  return () => void listeners.delete(l);
};

/** The user's own photo of this product, if they took one. */
export function useLocalPhoto(barcode: string | undefined): string | undefined {
  useSyncExternalStore(subscribe, () => version);
  return barcode ? photos.get(barcode) : undefined;
}
