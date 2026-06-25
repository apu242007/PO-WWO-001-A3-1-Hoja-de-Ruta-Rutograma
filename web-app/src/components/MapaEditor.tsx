// MapaEditor — editor interactivo de la ruta sobre tiles OpenStreetMap (Leaflet).
// Responsabilidad única: editar las coordenadas del draft y reportar el encuadre.
// NO genera el PNG (de eso se encarga lib/routeMap.ts). Marcadores divIcon (sin
// imágenes) para evitar el 404 de iconos default de Leaflet bajo el base path de
// GitHub Pages. Lazy-loaded desde HojaRutaForm.

import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLon } from "../lib/routing";

export type PointRef =
  | { kind: "origen" }
  | { kind: "destino" }
  | { kind: "tranq1" }
  | { kind: "tranquera"; id: string }
  | { kind: "bateria"; id: string };

export type PointKind = "origen" | "destino" | "gate" | "bateria";

export interface EditablePoint {
  ref: PointRef;
  lat: number;
  lon: number;
  kind: PointKind;
  /** Nombre legible para el popup (Origen/Destino/Tranquera/Batería). */
  name?: string;
}

export interface MapaEditorProps {
  points: EditablePoint[];
  /** Geometría vial (sigue calles). Si falta → ruta línea recta entre puntos. */
  routeGeometry?: LatLon[] | null;
  /** Traza GPS cruda en vivo (puntos capturados) — se dibuja punteada. */
  trace?: LatLon[] | null;
  /** Texto de estado de la ruta para la barra (ej. "ruta por calles"). */
  routeBadge?: string | null;
  onMovePoint: (ref: PointRef, c: { lat: number; lon: number }) => void;
  /** Fija (o reubica) origen tocando el mapa. */
  onSetOrigen: (c: { lat: number; lon: number }) => void;
  /** Fija (o reubica) destino tocando el mapa. */
  onSetDestino: (c: { lat: number; lon: number }) => void;
  onAddTranquera: (c: { lat: number; lon: number }) => void;
  onAddBateria: (c: { lat: number; lon: number }) => void;
  /** No-op para origen/destino (roles fijos). */
  onDeletePoint: (ref: PointRef) => void;
  onViewChange?: (v: { lat: number; lon: number; zoom: number }) => void;
}

type Modo = "mover" | "set-origen" | "set-destino" | "add-tranquera" | "add-bateria";

const COLORS: Record<PointKind, string> = {
  origen: "#1a7f3c",
  destino: "#c0271f",
  gate: "#0e4d73",
  bateria: "#7c3aed",
};

const CIPOLLETTI = { lat: -38.95785, lon: -67.97452 };

function pinIcon(color: string, text: string): L.DivIcon {
  return L.divIcon({
    className: "mapa-pin",
    html:
      `<div style="background:${color};width:26px;height:26px;border-radius:50% 50% 50% 0;` +
      `transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);` +
      `display:flex;align-items:center;justify-content:center">` +
      `<span style="transform:rotate(45deg);color:#fff;font:bold 11px Arial;line-height:1">${text}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
  });
}

function canDelete(ref: PointRef): boolean {
  return ref.kind !== "origen" && ref.kind !== "destino";
}

function refKey(ref: PointRef): string {
  return ref.kind === "tranquera" || ref.kind === "bateria" ? `${ref.kind}:${ref.id}` : ref.kind;
}

export default function MapaEditor({
  points,
  routeGeometry,
  trace,
  routeBadge,
  onMovePoint,
  onSetOrigen,
  onSetDestino,
  onAddTranquera,
  onAddBateria,
  onDeletePoint,
  onViewChange,
}: MapaEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [modo, setModo] = useState<Modo>("mover");

  // Props/estado más recientes para los handlers registrados una sola vez.
  const modoRef = useRef<Modo>(modo);
  modoRef.current = modo;
  const handlersRef = useRef({ onSetOrigen, onSetDestino, onAddTranquera, onAddBateria, onViewChange });
  handlersRef.current = { onSetOrigen, onSetDestino, onAddTranquera, onAddBateria, onViewChange };
  const didFitRef = useRef(false);

  // ---- init mapa (una vez) ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const first = points[0];
    const map = L.map(el, { zoomControl: true }).setView(
      [first?.lat ?? CIPOLLETTI.lat, first?.lon ?? CIPOLLETTI.lon],
      first ? 12 : 11
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Leaflet necesita recalcular el tamaño cuando el contenedor recién se revela
    // (Suspense / layout). Un tick después del montaje.
    const sizeTimer = setTimeout(() => map.invalidateSize(), 0);

    // click en el mapa → fija/agrega punto según el modo activo
    map.on("click", (e: L.LeafletMouseEvent) => {
      const c = { lat: e.latlng.lat, lon: e.latlng.lng };
      switch (modoRef.current) {
        case "set-origen":
          handlersRef.current.onSetOrigen(c);
          setModo("mover");
          break;
        case "set-destino":
          handlersRef.current.onSetDestino(c);
          setModo("mover");
          break;
        case "add-tranquera":
          handlersRef.current.onAddTranquera(c);
          setModo("mover");
          break;
        case "add-bateria":
          handlersRef.current.onAddBateria(c);
          setModo("mover");
          break;
        default:
          break;
      }
    });

    // reporta encuadre (debounced) para que el PNG exportado matchee la vista
    let viewTimer: ReturnType<typeof setTimeout> | undefined;
    const reportView = () => {
      if (!handlersRef.current.onViewChange) return;
      if (viewTimer) clearTimeout(viewTimer);
      viewTimer = setTimeout(() => {
        const c = map.getCenter();
        handlersRef.current.onViewChange?.({ lat: c.lat, lon: c.lng, zoom: map.getZoom() });
      }, 300);
    };
    map.on("moveend", reportView);
    map.on("zoomend", reportView);

    return () => {
      clearTimeout(sizeTimer);
      if (viewTimer) clearTimeout(viewTimer);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- cursor según modo ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getContainer().style.cursor = modo === "mover" ? "" : "crosshair";
  }, [modo]);

  // ---- reconcilia marcadores + ruta cuando cambian los puntos o la geometría ----
  const pointsSig = points.map((p) => `${refKey(p.ref)}@${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join("|");
  const geomSig = routeGeometry
    ? `${routeGeometry.length}:${routeGeometry[0]?.join(",")}:${routeGeometry[routeGeometry.length - 1]?.join(",")}`
    : "";
  const traceSig = trace ? `${trace.length}:${trace[trace.length - 1]?.join(",")}` : "";
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    // Ruta: geometría vial (sigue calles) si viene; si no, línea recta entre
    // los puntos de la cadena (origen → tranqueras → destino, sin baterías).
    const chain = points.filter((p) => p.kind !== "bateria");
    const routeLatLngs: [number, number][] =
      routeGeometry && routeGeometry.length >= 2
        ? routeGeometry.map((g) => [g[0], g[1]])
        : chain.map((p) => [p.lat, p.lon]);
    if (routeLatLngs.length >= 2) {
      L.polyline(routeLatLngs, { color: "#ffffff", weight: 8, opacity: 0.9 }).addTo(layer);
      L.polyline(routeLatLngs, { color: "#0b3d5c", weight: 4 }).addTo(layer);
    }

    // Traza GPS cruda en vivo (punteada naranja) — la grabación antes de snappear
    if (trace && trace.length >= 2) {
      L.polyline(
        trace.map((t) => [t[0], t[1]] as [number, number]),
        { color: "#f5a623", weight: 3, opacity: 0.85, dashArray: "4 6" }
      ).addTo(layer);
    }

    // Marcadores
    let gateN = 0;
    let batN = 0;
    for (const p of points) {
      let text: string;
      if (p.kind === "origen") text = "O";
      else if (p.kind === "destino") text = "D";
      else if (p.kind === "bateria") text = `B${(batN += 1)}`;
      else text = String((gateN += 1));

      const marker = L.marker([p.lat, p.lon], {
        icon: pinIcon(COLORS[p.kind], text),
        draggable: true,
        autoPan: true,
      }).addTo(layer);

      marker.on("dragend", () => {
        const ll = marker.getLatLng();
        onMovePoint(p.ref, { lat: ll.lat, lon: ll.lng });
      });

      // popup: nombre + Quitar (salvo origen/destino)
      const div = document.createElement("div");
      div.style.minWidth = "120px";
      const title = document.createElement("div");
      title.style.cssText = "font:600 12px Arial;margin-bottom:6px;color:#0b1f2a";
      title.textContent = `${p.name ?? ""}${
        p.kind === "gate" ? ` ${text}` : p.kind === "bateria" ? ` ${text}` : ""
      }`.trim();
      div.appendChild(title);
      if (canDelete(p.ref)) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Quitar";
        btn.style.cssText =
          "background:#c0271f;color:#fff;border:none;border-radius:6px;padding:5px 10px;font:600 12px Arial;cursor:pointer";
        btn.onclick = () => {
          onDeletePoint(p.ref);
          map.closePopup();
        };
        div.appendChild(btn);
      }
      marker.bindPopup(div);
    }

    // Encuadre inicial automático (una sola vez, si hay puntos)
    if (!didFitRef.current && points.length >= 1) {
      didFitRef.current = true;
      if (points.length >= 2) {
        const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } else {
        map.setView([points[0].lat, points[0].lon], 13);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsSig, geomSig, traceSig]);

  return (
    <div className="mapa-editor">
      <div className="mapa-toolbar">
        <button
          type="button"
          className={`mapa-mode ${modo === "mover" ? "is-active" : ""}`}
          onClick={() => setModo("mover")}
        >
          ✋ Mover
        </button>
        <button
          type="button"
          className={`mapa-mode mode-origen ${modo === "set-origen" ? "is-active" : ""}`}
          onClick={() => setModo((m) => (m === "set-origen" ? "mover" : "set-origen"))}
        >
          ＋ Origen
        </button>
        <button
          type="button"
          className={`mapa-mode mode-destino ${modo === "set-destino" ? "is-active" : ""}`}
          onClick={() => setModo((m) => (m === "set-destino" ? "mover" : "set-destino"))}
        >
          ＋ Destino
        </button>
        <button
          type="button"
          className={`mapa-mode ${modo === "add-tranquera" ? "is-active" : ""}`}
          onClick={() => setModo((m) => (m === "add-tranquera" ? "mover" : "add-tranquera"))}
        >
          ＋ Tranquera
        </button>
        <button
          type="button"
          className={`mapa-mode ${modo === "add-bateria" ? "is-active" : ""}`}
          onClick={() => setModo((m) => (m === "add-bateria" ? "mover" : "add-bateria"))}
        >
          ＋ Batería
        </button>
        {modo !== "mover" && (
          <span className="mapa-mode-hint">Tocá el mapa para ubicar el punto</span>
        )}
        {modo === "mover" && routeBadge && <span className="mapa-route-badge">{routeBadge}</span>}
      </div>
      <div ref={containerRef} className="mapa-canvas" />
    </div>
  );
}
