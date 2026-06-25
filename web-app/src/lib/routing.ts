// Ruteo vial (la ruta sigue calles) vía OSRM demo público — sin API key.
// Devuelve la geometría [lat,lon][] o null si falla / timeout / offline; el
// caller cae a línea recta. router.project-osrm.org es un servidor demo (no apto
// para alto volumen), suficiente para una herramienta interna de baja frecuencia.

import { haversineKm } from "./geo";

export type LatLon = [number, number]; // [lat, lon]

export interface RoadRoute {
  geometry: LatLon[];
  /** km a lo largo de las calles (de OSRM). */
  km: number;
}

/** Pide a OSRM la ruta vial que pasa por la cadena de puntos (en orden).
 * `chain` en {lat,lon}; OSRM espera lon,lat. */
export async function fetchRoadRoute(
  chain: { lat: number; lon: number }[],
  timeoutMs = 8000
): Promise<RoadRoute | null> {
  if (chain.length < 2) return null;
  const coords = chain.map((c) => `${c.lon},${c.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    const g = route?.geometry?.coordinates;
    if (!Array.isArray(g) || g.length < 2) return null;
    const geometry = g.map((p: [number, number]) => [p[1], p[0]] as LatLon); // lon,lat → lat,lon
    const km =
      typeof route.distance === "number" ? route.distance / 1000 : routeLengthKm(geometry);
    return { geometry, km };
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

/** Distancia total (km) a lo largo de una geometría [lat,lon][]. */
export function routeLengthKm(geom: LatLon[]): number {
  let d = 0;
  for (let i = 0; i < geom.length - 1; i++) {
    d += haversineKm(geom[i][0], geom[i][1], geom[i + 1][0], geom[i + 1][1]);
  }
  return d;
}
