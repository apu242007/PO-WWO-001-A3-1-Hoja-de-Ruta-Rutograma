// Geo helpers — bases conocidas, distancia haversine (línea recta) y GPS.
// El km automático usa línea recta (offline). Es editable: el usuario puede
// sobreescribir con el km real de ruta.

export interface Coord {
  lat?: number;
  lon?: number;
}

export interface Base {
  nombre: string;
  lat: number;
  lon: number;
}

// Bases TACKER con coordenadas. Agregar más a medida que las pasen.
export const BASES: Base[] = [
  { nombre: "Base Cipolletti", lat: -38.95785071604016, lon: -67.9745152156202 },
  { nombre: "Base Comodoro Rivadavia", lat: -45.89341359983197, lon: -67.54921233933548 },
];

export function findBase(nombre: string | undefined): Base | undefined {
  if (!nombre) return undefined;
  const n = nombre.trim().toLowerCase();
  return BASES.find((b) => b.nombre.toLowerCase() === n);
}

/** Distancia en km (línea recta / great-circle) entre dos coords. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function hasCoord(c: Coord | undefined | null): c is Required<Coord> {
  return !!c && typeof c.lat === "number" && typeof c.lon === "number";
}

/** km entre dos puntos si ambos tienen coords; si no, undefined. */
export function kmEntre(a: Coord | undefined, b: Coord | undefined): number | undefined {
  if (!hasCoord(a) || !hasCoord(b)) return undefined;
  return haversineKm(a.lat, a.lon, b.lat, b.lon);
}

/** parsea texto a coordenada decimal (admite coma o punto). */
export function parseCoord(s: string): number | undefined {
  if (!s) return undefined;
  const clean = s.replace(",", ".").replace(/[^0-9.\-]/g, "");
  if (clean === "" || clean === "-" || clean === ".") return undefined;
  const n = Number(clean);
  return Number.isFinite(n) ? n : undefined;
}

export function fmtCoord(n: number | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(6) : "";
}

export function coordLabel(c: Coord | undefined): string {
  if (!hasCoord(c)) return "";
  return `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`;
}

/** Lee la posición GPS del dispositivo. Rechaza con mensaje es-AR claro. */
export function getGps(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("GPS no soportado en este dispositivo"));
      return;
    }
    if (!window.isSecureContext) {
      reject(new Error("El GPS requiere HTTPS"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => {
        const msg =
          e.code === 1
            ? "Permiso denegado"
            : e.code === 2
              ? "Posición no disponible"
              : e.code === 3
                ? "Tiempo agotado"
                : e.message;
        reject(new Error(`GPS: ${msg}`));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}
