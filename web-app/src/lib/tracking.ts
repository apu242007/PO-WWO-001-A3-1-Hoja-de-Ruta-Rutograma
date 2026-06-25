// Tracking GPS en vivo: captura puntos cada N segundos con watchPosition y los
// acumula. El snapping a calles (map-matching) vive en lib/routing.ts. La
// persistencia POST /track es opcional: si VITE_TRACK_URL está vacía, no envía
// (modo demo) — el backend (lista SP Tracking + flow) se crea aparte (manual).

import { useCallback, useEffect, useRef, useState } from "react";

export interface GpsPing {
  lat: number;
  lon: number;
  ts: number; // epoch ms
  acc?: number; // precisión en metros
}

const TRACK_URL = (import.meta.env.VITE_TRACK_URL ?? "").trim();
const TACKER_KEY = (import.meta.env.VITE_TACKER_KEY ?? "").trim();
export const isTrackBackendConfigured = TRACK_URL !== "";

/** Envía un ping a POST /track. No-op si VITE_TRACK_URL no está configurada.
 * El backend (flow) persiste {lat,lng,timestamp,vehicle_id,folio}. */
export async function postTrackPing(ping: GpsPing, vehicleId: string, folio: string): Promise<void> {
  if (!TRACK_URL) return; // demo / sin backend
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (TACKER_KEY) headers["x-tacker-key"] = TACKER_KEY;
    await fetch(TRACK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        lat: ping.lat,
        lng: ping.lon,
        timestamp: new Date(ping.ts).toISOString(),
        acc: ping.acc ?? null,
        vehicle_id: vehicleId,
        folio,
      }),
    });
  } catch {
    /* tracking best-effort: un ping perdido no rompe la captura */
  }
}

export interface GpsTracker {
  tracking: boolean;
  points: GpsPing[];
  error: string | null;
  start: (everyMs?: number) => void;
  stop: () => void;
  clear: () => void;
}

/** Hook de captura GPS continua. `onPing` se llama por cada punto aceptado
 * (para persistir vía postTrackPing). Throttle a `everyMs` entre puntos. */
export function useGpsTracker(onPing?: (p: GpsPing) => void): GpsTracker {
  const [tracking, setTracking] = useState(false);
  const [points, setPoints] = useState<GpsPing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const lastTs = useRef(0);
  const everyRef = useRef(10000);
  const onPingRef = useRef(onPing);
  onPingRef.current = onPing;

  const stop = useCallback(() => {
    if (watchId.current != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
    setTracking(false);
  }, []);

  const start = useCallback((everyMs = 10000) => {
    if (!("geolocation" in navigator)) {
      setError("GPS no soportado en este dispositivo");
      return;
    }
    if (!window.isSecureContext) {
      setError("El tracking GPS requiere HTTPS");
      return;
    }
    setError(null);
    everyRef.current = everyMs;
    lastTs.current = 0;
    setTracking(true);
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const now = p.timestamp || Date.now();
        if (now - lastTs.current < everyRef.current) return; // throttle a N seg
        lastTs.current = now;
        const ping: GpsPing = {
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          ts: now,
          acc: p.coords.accuracy,
        };
        setPoints((prev) => [...prev, ping]);
        onPingRef.current?.(ping);
      },
      (e) => {
        if (e.code === 1) {
          // permiso denegado: no se recupera sin acción del usuario → detener el
          // watch (si no, queda "grabando" sin capturar nada).
          if (watchId.current != null && "geolocation" in navigator) {
            navigator.geolocation.clearWatch(watchId.current);
          }
          watchId.current = null;
          setTracking(false);
          setError(
            "GPS: permiso denegado. Habilitá la ubicación en el navegador (ícono junto a la URL → Ubicación → Permitir) y, en Windows, Configuración → Privacidad → Ubicación activada. Después tocá Iniciar de nuevo."
          );
          return;
        }
        const msg = e.code === 2 ? "Posición no disponible" : "Tiempo agotado";
        setError(`GPS: ${msg}`);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  }, []);

  const clear = useCallback(() => setPoints([]), []);

  // limpieza al desmontar
  useEffect(() => {
    return () => {
      if (watchId.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, []);

  return { tracking, points, error, start, stop, clear };
}
