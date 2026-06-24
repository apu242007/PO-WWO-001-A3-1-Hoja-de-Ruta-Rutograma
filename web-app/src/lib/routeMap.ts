// Generador de "mapa virtual" de la ruta: marcadores de origen/destino + puntos
// intermedios (tranqueras, baterías) y la polilínea de la ruta. Intenta fondo de
// mapa real OSM (Wikimedia static, sin API key); si falla red/CORS, dibuja un
// esquema con grilla. Devuelve un dataURL PNG (para preview, PDF y adjunto).

import { haversineKm } from "./geo";

export type MapPointKind = "origen" | "gate" | "bateria" | "destino";

export interface MapPoint {
  lat: number;
  lon: number;
  label?: string;
  kind: MapPointKind;
}

const TILE = 256;
const COLORS: Record<MapPointKind, string> = {
  origen: "#1a7f3c",
  destino: "#c0271f",
  gate: "#0e4d73",
  bateria: "#7c3aed",
};

function projX(lon: number, z: number): number {
  return ((lon + 180) / 360) * TILE * Math.pow(2, z);
}
function projY(lat: number, z: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * Math.pow(2, z);
}

function fitZoom(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  w: number,
  h: number
): number {
  for (let z = 16; z >= 2; z--) {
    const dx = projX(maxLon, z) - projX(minLon, z);
    const dy = projY(minLat, z) - projY(maxLat, z);
    if (dx <= w * 0.82 && dy <= h * 0.78) return z;
  }
  return 2;
}

function loadImg(src: string, timeoutMs = 7000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const to = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    img.onload = () => {
      clearTimeout(to);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(to);
      reject(new Error("img error"));
    };
    img.src = src;
  });
}

function schematicBg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#eef4f8");
  grad.addColorStop(1, "#dce7ee");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(11,61,92,0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function marker(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, text: string) {
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  if (text) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 0.5);
  }
}

function tag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  if (!text) return;
  const t = text.length > 26 ? text.slice(0, 25) + "…" : text;
  ctx.font = "bold 11px Arial";
  const w = ctx.measureText(t).width;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillRect(x - w / 2 - 4, y + 13, w + 8, 16);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(t, x, y + 15);
}

/** Genera el mapa de ruta. Devuelve dataURL PNG o null si no hay puntos. */
export async function buildRouteMapImage(points: MapPoint[]): Promise<string | null> {
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (pts.length === 0) return null;
  if (typeof document === "undefined") return null;

  const W = 620;
  const H = 420;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  let minLat = Math.min(...lats);
  let maxLat = Math.max(...lats);
  let minLon = Math.min(...lons);
  let maxLon = Math.max(...lons);
  if (minLat === maxLat) {
    minLat -= 0.02;
    maxLat += 0.02;
  }
  if (minLon === maxLon) {
    minLon -= 0.02;
    maxLon += 0.02;
  }
  const center = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
  const z = Math.max(2, Math.min(15, fitZoom(minLat, maxLat, minLon, maxLon, W, H)));

  // Fondo: mapa real OSM (Wikimedia) o esquema
  let tiled = false;
  try {
    const url = `https://maps.wikimedia.org/img/osm-intl,${z},${center.lat.toFixed(5)},${center.lon.toFixed(5)},${W}x${H}.png`;
    const img = await loadImg(url);
    ctx.drawImage(img, 0, 0, W, H);
    ctx.getImageData(0, 0, 1, 1); // lanza SecurityError si el canvas quedó "tainted"
    tiled = true;
  } catch {
    tiled = false;
  }
  if (!tiled) {
    ctx.clearRect(0, 0, W, H);
    schematicBg(ctx, W, H);
  }

  const cx = projX(center.lon, z);
  const cy = projY(center.lat, z);
  const toPx = (p: MapPoint) => ({
    x: W / 2 + (projX(p.lon, z) - cx),
    y: H / 2 + (projY(p.lat, z) - cy),
  });

  // Polilínea de ruta (excluye baterías; van como marcadores sueltos)
  const routePts = pts.filter((p) => p.kind !== "bateria").map(toPx);
  if (routePts.length >= 2) {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // casing blanco
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    routePts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    // línea navy
    ctx.strokeStyle = "#0b3d5c";
    ctx.lineWidth = 4;
    ctx.beginPath();
    routePts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }

  // Marcadores
  let gateN = 0;
  let batN = 0;
  for (const p of pts) {
    const { x, y } = toPx(p);
    if (p.kind === "origen") {
      marker(ctx, x, y, COLORS.origen, "O");
      tag(ctx, x, y, p.label ?? "Origen", COLORS.origen);
    } else if (p.kind === "destino") {
      marker(ctx, x, y, COLORS.destino, "D");
      tag(ctx, x, y, p.label ?? "Destino", COLORS.destino);
    } else if (p.kind === "bateria") {
      batN += 1;
      marker(ctx, x, y, COLORS.bateria, `B${batN}`);
    } else {
      gateN += 1;
      marker(ctx, x, y, COLORS.gate, String(gateN));
    }
  }

  // Distancia total (línea recta de la cadena de ruta)
  const chain = pts.filter((p) => p.kind !== "bateria");
  let dist = 0;
  for (let i = 0; i < chain.length - 1; i++) {
    dist += haversineKm(chain[i].lat, chain[i].lon, chain[i + 1].lat, chain[i + 1].lon);
  }

  // Pie: título + distancia + atribución
  ctx.fillStyle = "rgba(11,61,92,0.92)";
  ctx.fillRect(0, H - 22, W, 22);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`Ruta · ${dist.toFixed(1)} km (línea recta)`, 8, H - 11);
  ctx.font = "9px Arial";
  ctx.textAlign = "right";
  ctx.fillText(tiled ? "© OpenStreetMap" : "esquema sin conexión", W - 8, H - 11);

  try {
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
