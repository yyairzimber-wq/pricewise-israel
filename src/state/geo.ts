import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LOCATION } from "../core/data/demo/branches";
import type { GeoPoint } from "../core/types";

export type GeoStatus = "idle" | "asking" | "granted" | "denied" | "unavailable";
export interface GeoState {
  status: GeoStatus;
  point: GeoPoint;
  label: string;
  locate(): void;
}

/**
 * Device location, asked for only on a user gesture — except when permission
 * was already granted earlier, in which case we locate right away. Until then
 * the point is a fallback (central Tel Aviv) and `status` says so.
 */
export function useGeo(): GeoState {
  const [state, setState] = useState<Omit<GeoState, "locate">>({ status: "idle", point: DEFAULT_LOCATION, label: DEFAULT_LOCATION.label });

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) return setState((s) => ({ ...s, status: "unavailable" }));
    setState((s) => ({ ...s, status: "asking" }));
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ status: "granted", point: { lat: pos.coords.latitude, lng: pos.coords.longitude }, label: "המיקום שלך" }),
      (err) => setState((s) => ({ ...s, status: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" })),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);

  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => p.state === "granted" && locate())
      .catch(() => undefined);
  }, [locate]);

  return { ...state, locate };
}
