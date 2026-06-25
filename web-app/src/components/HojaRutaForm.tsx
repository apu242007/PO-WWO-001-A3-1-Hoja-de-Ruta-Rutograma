import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ALTURA_LIMITE_CARGA,
  CLIENTES,
  CLIENTE_OTRO,
  DESCRIPCION_CARGA,
  DESCRIPCION_CARGA_OTRO,
  ESTADO_GUARDAGANADO,
  EMPTY_MEDIA,
  PUNTOS_CRITICOS,
  REGISTRO_CARGAS_REF,
  INTERFERENCIAS_AEREAS_REF,
  SI_NO,
  TIPO_VIA,
  FLOTA,
  FLOTA_CATEGORIAS,
  UNIDAD_OTRO,
  unidadLabel,
  emptyDraft,
  newBateria,
  newCarga,
  newInterferencia,
  newNombre,
  newTramo,
  newTranquera,
  type Bateria,
  type Carga,
  type HojaRutaDraft,
  type Interferencia,
  type MediaSlot,
  type MediaState,
  type NombreItem,
  type Tramo,
  type Tranquera,
} from "../types";
import SignaturePad from "./SignaturePad";
import { clearDraft, loadDraft, saveDraft } from "../lib/draftStorage";
import { loadPreparadorProfile, savePreparadorProfile } from "../lib/preparadorProfile";
import { compressImage } from "../lib/imageUtils";
import { parseDecimal, parseInt0, formatDecimal, formatInt, formatDominio, isValidDominio } from "../lib/format";
import { BASES, findBase, getGps, kmEntre, hasCoord, parseCoord, fmtCoord, type Coord } from "../lib/geo";
import { buildRouteMapImage, type MapPoint, type MapView } from "../lib/routeMap";
import { fetchRoadRoute, matchTraceToRoads, type LatLon } from "../lib/routing";
import { useGpsTracker, postTrackPing, isTrackBackendConfigured } from "../lib/tracking";
import { genFolio, isDemoMode, uploadHojaRuta } from "../services/uploadHojaRuta";
import type { EditablePoint, PointRef } from "./MapaEditor";

// Lazy-loaded: jsPDF + html2canvas + qrcode (~400 KB) only when a PDF is built.
const loadPdf = () => import("../lib/pdfGenerator").then((m) => m.buildHojaRutaPdf);

// Lazy-loaded: Leaflet (~42 KB gzip) + su CSS sólo cuando el mapa monta.
const MapaEditor = lazy(() => import("./MapaEditor"));

interface SuccessInfo {
  folio: string;
  detalle: number;
  adjuntos: number;
  demo: boolean;
}

export default function HojaRutaForm() {
  const [draft, setDraft] = useState<HojaRutaDraft>(() => loadDraft());
  const [media, setMedia] = useState<MediaState>(() => ({ ...EMPTY_MEDIA }));
  const [fotosPorTramo, setFotosPorTramo] = useState<Record<string, File[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);
  const inFlight = useRef(false);

  // persist draft on every change
  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  // prefill preparador identity on mount
  useEffect(() => {
    const p = loadPreparadorProfile();
    if (p) {
      setDraft((d) => ({
        ...d,
        preparadaPor: d.preparadaPor ?? p.preparadaPor,
        dni: d.dni ?? p.dni,
        unidadRecorrido: d.unidadRecorrido ?? (p.unidadRecorrido as HojaRutaDraft["unidadRecorrido"]),
        inspectorResponsable: d.inspectorResponsable ?? p.inspectorResponsable,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- media object-url previews (with cleanup) ----
  const mediaPreviews = useMemo(() => {
    const o: Partial<Record<MediaSlot, string>> = {};
    (Object.keys(media) as MediaSlot[]).forEach((k) => {
      const f = media[k];
      if (f && f.type.startsWith("image/")) o[k] = URL.createObjectURL(f);
    });
    return o;
  }, [media]);
  useEffect(() => {
    return () => {
      Object.values(mediaPreviews).forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, [mediaPreviews]);

  const tramoPreviews = useMemo(() => {
    const o: Record<string, string[]> = {};
    for (const [id, files] of Object.entries(fotosPorTramo)) {
      o[id] = files.map((f) => URL.createObjectURL(f));
    }
    return o;
  }, [fotosPorTramo]);
  useEffect(() => {
    return () => {
      Object.values(tramoPreviews).forEach((arr) => arr.forEach((u) => URL.revokeObjectURL(u)));
    };
  }, [tramoPreviews]);

  // ---- generic setters ----
  function set<K extends keyof HojaRutaDraft>(key: K, value: HojaRutaDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  // ---- auto-km desde coordenadas (línea recta, editable) ----
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const tranqSig = draft.tranqueras.map((t) => `${t.lat ?? ""},${t.lon ?? ""}`).join("|");
  useEffect(() => {
    setDraft((d) => {
      let changed = false;
      const o: Coord = { lat: d.origenLat, lon: d.origenLon };
      const t1: Coord = { lat: d.tranq1Lat, lon: d.tranq1Lon };
      const dest: Coord = { lat: d.destinoLat, lon: d.destinoLon };
      const next: HojaRutaDraft = { ...d };

      // distancia a la 1ª tranquera = origen → tranq1
      const d1 = kmEntre(o, t1);
      if (d1 != null && next.distancia1erTranqueraKm !== round1(d1)) {
        next.distancia1erTranqueraKm = round1(d1);
        changed = true;
      }

      // cada tranquera: distancia desde el punto anterior de la cadena
      let prev: Coord = hasCoord(t1) ? t1 : o;
      let tranqsChanged = false;
      const newTranqs = d.tranqueras.map((t) => {
        const cur: Coord = { lat: t.lat, lon: t.lon };
        const km = kmEntre(prev, cur);
        let nt = t;
        if (km != null && t.distanciaKm !== round1(km)) {
          nt = { ...t, distanciaKm: round1(km) };
          tranqsChanged = true;
        }
        if (hasCoord(cur)) prev = cur;
        return nt;
      });
      if (tranqsChanged) {
        next.tranqueras = newTranqs;
        changed = true;
      }

      // distancia total = suma de la cadena origen → tranqueras → destino
      // (solo puntos con coords; los vacíos se saltan para no romper el segmento)
      const chain = [o, t1, ...d.tranqueras.map((t) => ({ lat: t.lat, lon: t.lon })), dest].filter(
        hasCoord
      );
      let total = 0;
      const any = chain.length >= 2;
      for (let i = 0; i < chain.length - 1; i++) {
        total += kmEntre(chain[i], chain[i + 1]) ?? 0;
      }
      if (any) {
        const s = formatDecimal(round1(total));
        if (next.distanciaTotalKm !== s) {
          next.distanciaTotalKm = s;
          changed = true;
        }
      }
      return changed ? next : d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draft.origenLat,
    draft.origenLon,
    draft.destinoLat,
    draft.destinoLon,
    draft.tranq1Lat,
    draft.tranq1Lon,
    tranqSig,
  ]);

  // ---- GPS a una coordenada ----
  const [gpsBusy, setGpsBusy] = useState<string | null>(null);
  async function gpsTo(slot: string, apply: (c: { lat: number; lon: number }) => void) {
    setGpsBusy(slot);
    setError(null);
    try {
      const c = await getGps();
      apply(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo obtener GPS");
    } finally {
      setGpsBusy(null);
    }
  }

  // ---- mapa de ruta (editor Leaflet) ----
  const [mapaView, setMapaView] = useState<MapView | null>(null);

  // Puntos editables — orden de cadena: origen → 1ª tranquera → tranqueras →
  // destino, luego baterías sueltas. Fuente única: draft. Lo leen el editor
  // (interactivo) y el renderer (PNG del PDF/adjunto).
  const editablePoints = useMemo<EditablePoint[]>(() => {
    const pts: EditablePoint[] = [];
    if (hasCoord({ lat: draft.origenLat, lon: draft.origenLon }))
      pts.push({ ref: { kind: "origen" }, lat: draft.origenLat!, lon: draft.origenLon!, kind: "origen", name: draft.origen || "Origen" });
    if (hasCoord({ lat: draft.tranq1Lat, lon: draft.tranq1Lon }))
      pts.push({ ref: { kind: "tranq1" }, lat: draft.tranq1Lat!, lon: draft.tranq1Lon!, kind: "gate", name: "1ª tranquera" });
    draft.tranqueras.forEach((t) => {
      if (hasCoord({ lat: t.lat, lon: t.lon }))
        pts.push({ ref: { kind: "tranquera", id: t.id }, lat: t.lat!, lon: t.lon!, kind: "gate", name: "Tranquera" });
    });
    if (hasCoord({ lat: draft.destinoLat, lon: draft.destinoLon }))
      pts.push({ ref: { kind: "destino" }, lat: draft.destinoLat!, lon: draft.destinoLon!, kind: "destino", name: draft.destino || "Destino" });
    draft.baterias.forEach((b) => {
      if (hasCoord({ lat: b.lat, lon: b.lon }))
        pts.push({ ref: { kind: "bateria", id: b.id }, lat: b.lat!, lon: b.lon!, kind: "bateria", name: "Batería" });
    });
    return pts;
  }, [
    draft.origenLat, draft.origenLon, draft.destinoLat, draft.destinoLon,
    draft.tranq1Lat, draft.tranq1Lon, draft.origen, draft.destino,
    draft.baterias, draft.tranqueras,
  ]);

  // MapPoint[] para el renderer del PNG (deriva de editablePoints, mismo orden)
  const routePoints = useMemo<MapPoint[]>(
    () => editablePoints.map((p) => ({ lat: p.lat, lon: p.lon, kind: p.kind, label: p.name })),
    [editablePoints]
  );

  const puedeMapa = routePoints.length >= 2;

  // ---- ruteo vial: la ruta sigue calles (OSRM); fallback línea recta ----
  const [routeGeometry, setRouteGeometry] = useState<LatLon[] | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  // cadena de la ruta (origen → tranqueras → destino), sin baterías
  const chainForRoute = useMemo(
    () => editablePoints.filter((p) => p.kind !== "bateria").map((p) => ({ lat: p.lat, lon: p.lon })),
    [editablePoints]
  );
  const chainSig = chainForRoute.map((c) => `${c.lat.toFixed(5)},${c.lon.toFixed(5)}`).join("|");
  useEffect(() => {
    if (chainForRoute.length < 2) {
      setRouteGeometry(null);
      setRouteLoading(false);
      return;
    }
    let active = true;
    setRouteLoading(true);
    const t = setTimeout(async () => {
      const r = await fetchRoadRoute(chainForRoute);
      if (!active) return;
      setRouteGeometry(r ? r.geometry : null);
      setRouteLoading(false);
    }, 600);
    return () => {
      active = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainSig]);

  // ---- tracking GPS en vivo + map-matching (snap a calles) ----
  const [tracedGeometry, setTracedGeometry] = useState<LatLon[] | null>(null);
  const [snapping, setSnapping] = useState(false);
  const tracker = useGpsTracker((p) => {
    void postTrackPing(p, draft.unidadRecorrido ?? "", draft.folio ?? "");
  });
  const tracePoints = useMemo<LatLon[]>(
    () => tracker.points.map((p) => [p.lat, p.lon] as LatLon),
    [tracker.points]
  );

  async function detenerYSnappear() {
    tracker.stop();
    if (tracker.points.length < 2) return;
    setSnapping(true);
    try {
      const r = await matchTraceToRoads(tracker.points.map((p) => ({ lat: p.lat, lon: p.lon })));
      setTracedGeometry(r ? r.geometry : null);
      if (!r) setError("No se pudo ajustar la traza a calles. Revisá la conexión e intentá de nuevo.");
    } finally {
      setSnapping(false);
    }
  }
  function limpiarTraza() {
    tracker.clear();
    setTracedGeometry(null);
  }

  // Geometría efectiva del mapa: la traza GPS snappeada tiene prioridad sobre la
  // ruta planificada por waypoints.
  const effectiveGeometry = tracedGeometry ?? routeGeometry;

  const routeBadge = tracedGeometry
    ? "🛰️ traza GPS (calles)"
    : tracker.tracking
      ? "🛰️ grabando traza…"
      : snapping
        ? "ajustando traza a calles…"
        : chainForRoute.length < 2
          ? null
          : routeLoading
            ? "calculando ruta…"
            : routeGeometry
              ? "🛣️ ruta por calles"
              : "📏 línea recta (sin ruteo)";

  // Genera el PNG del mapa con el encuadre actual del editor. null si no hay puntos.
  async function renderMapaPng(): Promise<string | null> {
    if (routePoints.length < 1 && !effectiveGeometry) return null;
    try {
      return await buildRouteMapImage(routePoints, mapaView ?? undefined, effectiveGeometry);
    } catch {
      return null;
    }
  }

  // ---- handlers del editor (bidireccional con el draft) ----
  function moveMapPoint(ref: PointRef, c: { lat: number; lon: number }) {
    setDraft((d) => {
      switch (ref.kind) {
        case "origen":
          return { ...d, origenLat: c.lat, origenLon: c.lon };
        case "destino":
          return { ...d, destinoLat: c.lat, destinoLon: c.lon };
        case "tranq1":
          return { ...d, tranq1Lat: c.lat, tranq1Lon: c.lon };
        case "tranquera":
          return { ...d, tranqueras: d.tranqueras.map((t) => (t.id === ref.id ? { ...t, lat: c.lat, lon: c.lon } : t)) };
        case "bateria":
          return { ...d, baterias: d.baterias.map((b) => (b.id === ref.id ? { ...b, lat: c.lat, lon: c.lon } : b)) };
        default:
          return d;
      }
    });
  }
  function setMapOrigen(c: { lat: number; lon: number }) {
    setDraft((d) => ({ ...d, origenLat: c.lat, origenLon: c.lon }));
  }
  function setMapDestino(c: { lat: number; lon: number }) {
    setDraft((d) => ({ ...d, destinoLat: c.lat, destinoLon: c.lon }));
  }
  function addMapTranquera(c: { lat: number; lon: number }) {
    setDraft((d) => ({ ...d, tranqueras: [...d.tranqueras, { ...newTranquera(), lat: c.lat, lon: c.lon }] }));
  }
  function addMapBateria(c: { lat: number; lon: number }) {
    setDraft((d) => ({ ...d, baterias: [...d.baterias, { ...newBateria(), lat: c.lat, lon: c.lon }] }));
  }
  function deleteMapPoint(ref: PointRef) {
    setDraft((d) => {
      switch (ref.kind) {
        case "tranq1":
          return { ...d, tranq1Lat: undefined, tranq1Lon: undefined };
        case "tranquera":
          return { ...d, tranqueras: d.tranqueras.filter((t) => t.id !== ref.id) };
        case "bateria":
          return {
            ...d,
            baterias:
              d.baterias.length > 1
                ? d.baterias.filter((b) => b.id !== ref.id)
                : d.baterias.map((b) => (b.id === ref.id ? { id: b.id } : b)),
          };
        default:
          return d; // origen/destino: roles fijos, no se borran
      }
    });
  }

  // ---- repeat-row helpers ----
  function patchBateria(id: string, patch: Partial<Bateria>) {
    setDraft((d) => ({ ...d, baterias: d.baterias.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));
  }
  function patchYacimiento(id: string, patch: Partial<NombreItem>) {
    setDraft((d) => ({
      ...d,
      yacimientos: d.yacimientos.map((y) => (y.id === id ? { ...y, ...patch } : y)),
    }));
  }
  function patchRuta(id: string, patch: Partial<NombreItem>) {
    setDraft((d) => ({ ...d, rutas: d.rutas.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  }
  function patchTranquera(id: string, patch: Partial<Tranquera>) {
    setDraft((d) => ({
      ...d,
      tranqueras: d.tranqueras.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }
  function patchTramo(id: string, patch: Partial<Tramo>) {
    setDraft((d) => ({ ...d, tramos: d.tramos.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }
  function patchInterferencia(id: string, patch: Partial<Interferencia>) {
    setDraft((d) => ({
      ...d,
      interferencias: d.interferencias.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }
  function patchCarga(id: string, patch: Partial<Carga>) {
    setDraft((d) => ({ ...d, cargas: d.cargas.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  }

  function toggleTramoPunto(id: string, punto: string) {
    setDraft((d) => ({
      ...d,
      tramos: d.tramos.map((t) => {
        if (t.id !== id) return t;
        const has = t.puntosCriticos.includes(punto);
        return {
          ...t,
          puntosCriticos: has
            ? t.puntosCriticos.filter((p) => p !== punto)
            : [...t.puntosCriticos, punto],
        };
      }),
    }));
  }

  // ---- media handlers ----
  async function setMediaFile(slot: MediaSlot, file: File | null) {
    if (!file) {
      setMedia((m) => ({ ...m, [slot]: null }));
      return;
    }
    const compressed = await compressImage(file);
    const out = compressed instanceof File ? compressed : new File([compressed], file.name, { type: compressed.type || file.type });
    setMedia((m) => ({ ...m, [slot]: out }));
  }

  async function addTramoFotos(tramoId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const compressed: File[] = [];
    for (const f of Array.from(files)) {
      const c = await compressImage(f);
      compressed.push(c instanceof File ? c : new File([c], f.name, { type: c.type || f.type }));
    }
    setFotosPorTramo((m) => ({ ...m, [tramoId]: [...(m[tramoId] ?? []), ...compressed] }));
  }
  function removeTramoFoto(tramoId: string, idx: number) {
    setFotosPorTramo((m) => ({ ...m, [tramoId]: (m[tramoId] ?? []).filter((_, i) => i !== idx) }));
  }

  // ---- pendientes (validación visible) ----
  const pendientes = useMemo(() => {
    const p: string[] = [];
    if (!draft.equipoSitio?.trim()) p.push("Equipo / Sitio");
    if (!draft.realizada) p.push("Fecha/hora 'Realizada'");
    if (!draft.preparadaPor?.trim()) p.push("Preparada por");
    if (draft.dni == null) p.push("DNI");
    if (!draft.unidadRecorrido) p.push("Unidad utilizada");
    if (draft.unidadRecorrido === UNIDAD_OTRO && !isValidDominio(draft.unidadOtro ?? ""))
      p.push("Dominio de la unidad (Otro) — formato válido");
    if (!draft.ubicacion?.trim()) p.push("Ubicación");
    if (!draft.cliente) p.push("Cliente");
    if (draft.cliente === CLIENTE_OTRO && !draft.clienteOtro?.trim())
      p.push("Indicar cliente (OTRO)");
    if (!draft.origen?.trim()) p.push("Origen");
    if (!draft.destino?.trim()) p.push("Destino");
    if (!draft.fechaHoraInicioProgramada) p.push("Inicio programado");
    if (!draft.inspectorResponsable?.trim()) p.push("Inspector / Responsable");
    const t1 = draft.tramos[0];
    if (!t1 || t1.kmInicial == null || t1.kmFinal == null || !t1.tipoVia)
      p.push("Tramo 1 (km inicial/final + tipo de vía)");
    if (!media.mapaRecorrido) p.push("Foto MAPA RECORRIDO");
    if (!media.registroCargas) p.push("Registro de cargas (imagen)");
    if (!draft.declaracion) p.push("Aceptar la declaración");
    if (!draft.firmaResponsable) p.push("Firma del responsable");
    if (!draft.firmaFecha) p.push("Fecha de firma");
    return p;
  }, [draft, media]);

  const puedeEnviar = pendientes.length === 0 && !submitting;

  // ---- submit ----
  async function handleSubmit() {
    if (inFlight.current) return;
    if (pendientes.length > 0) {
      setError("Faltan datos obligatorios (ver lista).");
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const folio = draft.folio?.trim() || genFolio();
      if (!draft.folio) set("folio", folio);
      const mapaPng = await renderMapaPng();
      const buildHojaRutaPdf = await loadPdf();
      const pdfBlob = await buildHojaRutaPdf({ draft: { ...draft, folio }, media, fotosPorTramo, folio, mapaRutaUrl: mapaPng });
      const res = await uploadHojaRuta({ draft: { ...draft, folio }, media, fotosPorTramo, pdfBlob, mapaRutaUrl: mapaPng });
      if (!res.ok) {
        setError(res.error ?? "Error al enviar. Reintentá.");
        return;
      }
      // persist preparador identity, then clear draft
      savePreparadorProfile({
        preparadaPor: draft.preparadaPor,
        dni: draft.dni,
        unidadRecorrido: draft.unidadRecorrido,
        inspectorResponsable: draft.inspectorResponsable,
      });
      const adjuntos =
        1 +
        (draft.firmaResponsable ? 1 : 0) +
        Object.values(media).filter(Boolean).length +
        Object.values(fotosPorTramo).reduce((a, arr) => a + arr.length, 0);
      const detalle =
        1 +
        draft.tranqueras.length +
        draft.tramos.length +
        draft.interferencias.filter((i) => i.descripcion || i.distanciaKm != null).length +
        draft.cargas.filter((c) => c.descripcion || c.largo != null).length;
      clearDraft();
      setSuccess({ folio: res.folio, detalle, adjuntos, demo: !!res.demo });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSubmitting(false);
      inFlight.current = false;
    }
  }

  async function descargarPdf() {
    setPreviewing(true);
    try {
      const folio = draft.folio?.trim() || genFolio();
      const mapaPng = await renderMapaPng();
      const buildHojaRutaPdf = await loadPdf();
      const blob = await buildHojaRutaPdf({ draft: { ...draft, folio }, media, fotosPorTramo, folio, mapaRutaUrl: mapaPng });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `HojaRuta_${folio}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar el PDF.");
    } finally {
      setPreviewing(false);
    }
  }

  function resetForm() {
    clearDraft();
    setDraft(emptyDraft());
    setMedia({ ...EMPTY_MEDIA });
    setFotosPorTramo({});
    setMapaView(null);
    setRouteGeometry(null);
    tracker.stop();
    tracker.clear();
    setTracedGeometry(null);
    setSuccess(null);
    setError(null);
  }

  // ====================== SUCCESS SCREEN ======================
  if (success) {
    return (
      <div className="success-screen">
        <div className="success-card">
          <div className="success-check">✓</div>
          <h2>{success.demo ? "Hoja de Ruta generada (modo demo)" : "¡Hoja de Ruta enviada con éxito!"}</h2>
          <p>
            Folio: <strong>{success.folio}</strong>
          </p>
          <p className="success-meta">
            {success.detalle} ítems de detalle · {success.adjuntos} adjuntos
          </p>
          {success.demo ? (
            <p className="demo-note">
              No se realizó el envío (no hay endpoint configurado). Se completó la validación y se
              generó el PDF.
            </p>
          ) : (
            <p className="success-meta">
              La hoja de ruta quedó registrada y se notificó al sector correspondiente.
            </p>
          )}
          <button className="btn-primary" onClick={resetForm}>
            Cargar otra hoja de ruta
          </button>
        </div>
      </div>
    );
  }

  // ====================== FORM ======================
  const altaAlerta =
    draft.alturaMaximaCarga != null && draft.alturaMaximaCarga > ALTURA_LIMITE_CARGA;

  return (
    <div className="form-wrap">
      <header className="app-header">
        <img src={`${import.meta.env.BASE_URL}tacker-logo.png`} alt="TACKER" className="app-logo" />
        <div>
          <h1>Hoja de Ruta / Rutograma</h1>
          <p className="app-sub">PO-WWO-001-A3-1 DTM · TACKER SRL</p>
        </div>
      </header>

      {isDemoMode && (
        <div className="banner-demo">
          ⚠️ Modo demo — no hay endpoint configurado. El formulario valida y genera PDF, pero no
          envía.
        </div>
      )}

      {/* 1 — DATOS PRINCIPALES */}
      <section className="card">
        <h2>1 · Datos principales</h2>
        <div className="grid2">
          <label>
            Equipo / Sitio *
            <input value={draft.equipoSitio ?? ""} onChange={(e) => set("equipoSitio", e.target.value)} />
          </label>
          <label>
            Realizada (fecha y hora) *
            <input
              type="datetime-local"
              value={draft.realizada ?? ""}
              onChange={(e) => set("realizada", e.target.value)}
            />
          </label>
          <label>
            Preparada por *
            <input value={draft.preparadaPor ?? ""} onChange={(e) => set("preparadaPor", e.target.value)} />
          </label>
          <label>
            DNI *
            <input
              inputMode="numeric"
              value={formatInt(draft.dni)}
              onChange={(e) => set("dni", parseInt0(e.target.value))}
              placeholder="ej: 29.224.981"
            />
          </label>
          <label className="span-full">
            Unidad utilizada para recorrido *
            <select
              value={draft.unidadRecorrido ?? ""}
              onChange={(e) => set("unidadRecorrido", e.target.value || undefined)}
            >
              <option value="">— Seleccionar —</option>
              {FLOTA_CATEGORIAS.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {FLOTA.filter((u) => u.categoria === cat).map((u) => {
                    const lbl = unidadLabel(u);
                    return (
                      <option key={u.interno + u.dominio} value={lbl}>
                        {lbl}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
              <option value={UNIDAD_OTRO}>Otro (ingresar dominio)…</option>
            </select>
          </label>
          {draft.unidadRecorrido === UNIDAD_OTRO && (
            <label className={draft.unidadOtro && !isValidDominio(draft.unidadOtro) ? "label-error" : ""}>
              Dominio de la unidad *
              <input
                value={draft.unidadOtro ?? ""}
                onChange={(e) => set("unidadOtro", formatDominio(e.target.value))}
                placeholder="ABC-123 ó AB-123-WE"
                maxLength={9}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
              {draft.unidadOtro && !isValidDominio(draft.unidadOtro) && (
                <span className="field-error">Formato inválido. 6 caracteres → ABC-123 · 7 → AB-123-WE.</span>
              )}
            </label>
          )}
          <label>
            Ubicación *
            <input value={draft.ubicacion ?? ""} onChange={(e) => set("ubicacion", e.target.value)} />
          </label>
        </div>
      </section>

      {/* 2 — CLIENTE */}
      <section className="card">
        <h2>2 · Cliente</h2>
        <div className="grid2">
          <label>
            Cliente / Operadora *
            <select
              value={draft.cliente ?? ""}
              onChange={(e) => set("cliente", (e.target.value || undefined) as HojaRutaDraft["cliente"])}
            >
              <option value="">— Seleccionar —</option>
              {CLIENTES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={CLIENTE_OTRO}>Otro…</option>
            </select>
          </label>
          {draft.cliente === CLIENTE_OTRO && (
            <label>
              Indique operadora / cliente *
              <input value={draft.clienteOtro ?? ""} onChange={(e) => set("clienteOtro", e.target.value)} />
            </label>
          )}
        </div>
      </section>

      {/* 3 — ENCABEZADO DEL RUTOGRAMA */}
      <section className="card">
        <h2>3 · Encabezado del rutograma</h2>
        <p className="hint">
          Elegí una base (Cipolletti, Comodoro…) o escribí el lugar. Si cargás coordenadas (o tocás
          📍), el km se calcula solo.
        </p>
        <div className="grid2">
          <div className="punto-field">
            <label>
              Origen *
              <input
                list="bases-list"
                value={draft.origen ?? ""}
                autoComplete="off"
                placeholder="Base o lugar…"
                onChange={(e) => {
                  const v = e.target.value;
                  const b = findBase(v);
                  setDraft((d) => ({ ...d, origen: v, ...(b ? { origenLat: b.lat, origenLon: b.lon } : {}) }));
                }}
              />
            </label>
            <CoordRow
              value={{ lat: draft.origenLat, lon: draft.origenLon }}
              onChange={(c) => setDraft((d) => ({ ...d, origenLat: c.lat, origenLon: c.lon }))}
              onGps={() => gpsTo("origen", (c) => setDraft((d) => ({ ...d, origenLat: c.lat, origenLon: c.lon })))}
              busy={gpsBusy === "origen"}
            />
          </div>
          <div className="punto-field">
            <label>
              Destino *
              <input
                list="bases-list"
                value={draft.destino ?? ""}
                autoComplete="off"
                placeholder="Base o lugar…"
                onChange={(e) => {
                  const v = e.target.value;
                  const b = findBase(v);
                  setDraft((d) => ({ ...d, destino: v, ...(b ? { destinoLat: b.lat, destinoLon: b.lon } : {}) }));
                }}
              />
            </label>
            <CoordRow
              value={{ lat: draft.destinoLat, lon: draft.destinoLon }}
              onChange={(c) => setDraft((d) => ({ ...d, destinoLat: c.lat, destinoLon: c.lon }))}
              onGps={() => gpsTo("destino", (c) => setDraft((d) => ({ ...d, destinoLat: c.lat, destinoLon: c.lon })))}
              busy={gpsBusy === "destino"}
            />
          </div>
          <label>
            Distancia total (km){" "}
            {hasCoord({ lat: draft.origenLat, lon: draft.origenLon }) &&
              hasCoord({ lat: draft.destinoLat, lon: draft.destinoLon }) && (
                <span className="auto-tag">auto</span>
              )}
            <input
              value={draft.distanciaTotalKm ?? ""}
              onChange={(e) => set("distanciaTotalKm", e.target.value)}
              placeholder="auto desde coords o manual"
            />
          </label>
          <label>
            Fecha y hora de inicio programada *
            <input
              type="datetime-local"
              value={draft.fechaHoraInicioProgramada ?? ""}
              onChange={(e) => set("fechaHoraInicioProgramada", e.target.value)}
            />
          </label>
          <label className="span-full">
            Inspector / Responsable *
            <input
              value={draft.inspectorResponsable ?? ""}
              onChange={(e) => set("inspectorResponsable", e.target.value)}
            />
          </label>
        </div>
        <datalist id="bases-list">
          {BASES.map((b) => (
            <option key={b.nombre} value={b.nombre} />
          ))}
        </datalist>
      </section>

      {/* 4 — PASOS POR BATERÍA + ALTURA */}
      <section className="card">
        <h2>4 · Pasos por batería y altura</h2>
        <p className="hint">Agregá los pasos por batería que correspondan (N/A si no aplica).</p>
        {draft.baterias.map((b, i) => (
          <div className="repeat-row" key={b.id}>
            <div className="repeat-head">
              <span>Batería {i + 1}</span>
              {draft.baterias.length > 1 && (
                <button
                  type="button"
                  className="btn-del"
                  onClick={() => setDraft((d) => ({ ...d, baterias: d.baterias.filter((x) => x.id !== b.id) }))}
                >
                  Quitar
                </button>
              )}
            </div>
            <div className="punto-field">
              <label>
                Paso por Batería Nº (N/A si no corresponde)
                <input
                  value={b.numero ?? ""}
                  onChange={(e) => patchBateria(b.id, { numero: e.target.value })}
                  placeholder="ej: 12 ó N/A"
                />
              </label>
              <CoordRow
                value={{ lat: b.lat, lon: b.lon }}
                onChange={(c) => patchBateria(b.id, { lat: c.lat, lon: c.lon })}
                onGps={() => gpsTo(`bat-${b.id}`, (c) => patchBateria(b.id, { lat: c.lat, lon: c.lon }))}
                busy={gpsBusy === `bat-${b.id}`}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn-add"
          onClick={() => setDraft((d) => ({ ...d, baterias: [...d.baterias, newBateria()] }))}
        >
          + Agregar batería
        </button>
        <label className="span-full" style={{ marginTop: 12 }}>
          Altura máxima de la carga (mts)
          <input
            inputMode="decimal"
            value={draft.alturaMaximaCarga != null ? String(draft.alturaMaximaCarga).replace(".", ",") : ""}
            onChange={(e) => set("alturaMaximaCarga", parseDecimal(e.target.value))}
            placeholder="ej: 4,40"
          />
        </label>
        {altaAlerta && (
          <div className="alert-warn">
            ⚠️ Carga superior a {ALTURA_LIMITE_CARGA.toString().replace(".", ",")} m: aplicar el
            procedimiento de carga alta (permisos, escolta, relevamiento de interferencias). Adjuntá
            la evidencia abajo.
          </div>
        )}
        <MediaPicker
          slot="cargaAlta"
          label="Evidencia / instructivo cargas > 4,40 m (opcional)"
          file={media.cargaAlta}
          preview={mediaPreviews.cargaAlta}
          onSet={setMediaFile}
        />
      </section>

      {/* 5/6 — TRANQUERA 1 + diagrama */}
      <section className="card">
        <h2>5 · Información del recorrido — 1ª tranquera</h2>
        <div className="punto-field" style={{ marginBottom: 12 }}>
          <span className="media-label">Coordenadas 1ª tranquera (opcional → km auto desde origen)</span>
          <CoordRow
            value={{ lat: draft.tranq1Lat, lon: draft.tranq1Lon }}
            onChange={(c) => setDraft((d) => ({ ...d, tranq1Lat: c.lat, tranq1Lon: c.lon }))}
            onGps={() => gpsTo("tranq1", (c) => setDraft((d) => ({ ...d, tranq1Lat: c.lat, tranq1Lon: c.lon })))}
            busy={gpsBusy === "tranq1"}
          />
        </div>
        <div className="grid3">
          <label>
            Distancia a la 1ª tranquera (kms){" "}
            {hasCoord({ lat: draft.origenLat, lon: draft.origenLon }) &&
              hasCoord({ lat: draft.tranq1Lat, lon: draft.tranq1Lon }) && (
                <span className="auto-tag">auto</span>
              )}
            <input
              inputMode="decimal"
              value={draft.distancia1erTranqueraKm != null ? String(draft.distancia1erTranqueraKm).replace(".", ",") : ""}
              onChange={(e) => set("distancia1erTranqueraKm", parseDecimal(e.target.value))}
            />
          </label>
          <label>
            ¿Tiene guardaganado?
            <select
              value={draft.tieneGuardaganado1 ?? ""}
              onChange={(e) => set("tieneGuardaganado1", (e.target.value || undefined) as HojaRutaDraft["tieneGuardaganado1"])}
            >
              <option value="">—</option>
              {SI_NO.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estado general guardaganado
            <select
              value={draft.estadoGuardaganado1 ?? ""}
              onChange={(e) => set("estadoGuardaganado1", (e.target.value || undefined) as HojaRutaDraft["estadoGuardaganado1"])}
            >
              <option value="">—</option>
              {ESTADO_GUARDAGANADO.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        </div>
        <MediaPicker
          slot="diagramaTecnico"
          label="Diagrama técnico / dimensiones del vehículo (opcional)"
          file={media.diagramaTecnico}
          preview={mediaPreviews.diagramaTecnico}
          onSet={setMediaFile}
        />
      </section>

      {/* 7 — MÁS TRANQUERAS */}
      <section className="card">
        <h2>6 · Más tranqueras</h2>
        {draft.tranqueras.map((t, i) => (
          <div className="repeat-row" key={t.id}>
            <div className="repeat-head">
              <span>Tranquera {i + 2}</span>
              <button
                type="button"
                className="btn-del"
                onClick={() =>
                  setDraft((d) => ({ ...d, tranqueras: d.tranqueras.filter((x) => x.id !== t.id) }))
                }
              >
                Quitar
              </button>
            </div>
            <div className="punto-field" style={{ marginBottom: 10 }}>
              <span className="media-label">Coordenadas (opcional → km auto desde la anterior)</span>
              <CoordRow
                value={{ lat: t.lat, lon: t.lon }}
                onChange={(c) => patchTranquera(t.id, { lat: c.lat, lon: c.lon })}
                onGps={() => gpsTo(`tq-${t.id}`, (c) => patchTranquera(t.id, { lat: c.lat, lon: c.lon }))}
                busy={gpsBusy === `tq-${t.id}`}
              />
            </div>
            <div className="grid3">
              <label>
                Distancia a la próxima tranquera (kms){" "}
                {hasCoord({ lat: t.lat, lon: t.lon }) && <span className="auto-tag">auto</span>}
                <input
                  inputMode="decimal"
                  value={t.distanciaKm != null ? String(t.distanciaKm).replace(".", ",") : ""}
                  onChange={(e) => patchTranquera(t.id, { distanciaKm: parseDecimal(e.target.value) })}
                />
              </label>
              <label>
                ¿Tiene guardaganado?
                <select
                  value={t.tieneGuardaganado ?? ""}
                  onChange={(e) => patchTranquera(t.id, { tieneGuardaganado: (e.target.value || undefined) as Tranquera["tieneGuardaganado"] })}
                >
                  <option value="">—</option>
                  {SI_NO.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Estado general
                <select
                  value={t.estadoGuardaganado ?? ""}
                  onChange={(e) => patchTranquera(t.id, { estadoGuardaganado: (e.target.value || undefined) as Tranquera["estadoGuardaganado"] })}
                >
                  <option value="">—</option>
                  {ESTADO_GUARDAGANADO.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}
        <button type="button" className="btn-add" onClick={() => setDraft((d) => ({ ...d, tranqueras: [...d.tranqueras, newTranquera()] }))}>
          + Agregar tranquera
        </button>
        <MediaPicker
          slot="mapaRecorrido"
          label="Foto MAPA RECORRIDO *"
          file={media.mapaRecorrido}
          preview={mediaPreviews.mapaRecorrido}
          onSet={setMediaFile}
        />
      </section>

      {/* MAPA DE RUTA (editor interactivo) */}
      <section className="card">
        <h2>Mapa de ruta (editable)</h2>
        <p className="hint">
          Tocá <strong>＋ Origen</strong> / <strong>＋ Destino</strong> y marcá el punto en el mapa
          (o reubicalos arrastrando). Con <strong>＋ Tranquera</strong> / <strong>＋ Batería</strong>{" "}
          agregás más puntos; el popup de cada marcador permite quitarlo. El encuadre actual se adjunta
          al envío y al PDF (OpenStreetMap; esquema si no hay conexión).
        </p>
        {!puedeMapa && (
          <p className="hint">
            Cargá coordenadas de <strong>origen</strong> y <strong>destino</strong> (sección 3, con 📍
            o tipeando lat/lon) para trazar la ruta.
          </p>
        )}
        <Suspense fallback={<div className="mapa-loading">Cargando mapa…</div>}>
          <MapaEditor
            points={editablePoints}
            routeGeometry={effectiveGeometry}
            trace={tracedGeometry ? null : tracePoints.length >= 2 ? tracePoints : null}
            routeBadge={routeBadge}
            onMovePoint={moveMapPoint}
            onSetOrigen={setMapOrigen}
            onSetDestino={setMapDestino}
            onAddTranquera={addMapTranquera}
            onAddBateria={addMapBateria}
            onDeletePoint={deleteMapPoint}
            onViewChange={setMapaView}
          />
        </Suspense>

        {/* Tracking GPS en vivo → map-matching (snap a calles) */}
        <div className="tracking-panel">
          <div className="tracking-head">
            <span>📡 Tracking GPS en vivo</span>
            <span className="tracking-status">
              {tracker.tracking
                ? `grabando · ${tracker.points.length} pts`
                : snapping
                  ? "ajustando a calles…"
                  : tracedGeometry
                    ? `traza ajustada (${tracker.points.length} pts)`
                    : tracker.points.length
                      ? `${tracker.points.length} pts sin ajustar`
                      : "detenido"}
            </span>
          </div>
          <div className="actions" style={{ marginTop: 8 }}>
            {!tracker.tracking ? (
              <button type="button" className="btn-primary" onClick={() => tracker.start(10000)}>
                ▶ Iniciar tracking
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={detenerYSnappear}>
                ■ Detener y ajustar a calles
              </button>
            )}
            {!tracker.tracking && tracker.points.length > 0 && (
              <button type="button" className="btn-ghost" onClick={limpiarTraza}>
                Limpiar traza
              </button>
            )}
          </div>
          {tracker.error && <div className="error-box" style={{ marginTop: 8 }}>⚠️ {tracker.error}</div>}
          <p className="hint" style={{ marginTop: 8 }}>
            Captura la posición cada 10 s y la ajusta a calles reales (OSRM). La traza ajustada se usa
            como ruta del rutograma (se adjunta al PDF/envío).{" "}
            {isTrackBackendConfigured
              ? "Cada punto se envía a /track."
              : "Persistencia /track no configurada — los puntos no se envían al servidor."}
          </p>
        </div>
      </section>

      {/* TRAMOS */}
      <section className="card">
        <h2>7 · Detalle de los tramos</h2>
        {draft.tramos.map((t, i) => (
          <div className="repeat-row" key={t.id}>
            <div className="repeat-head">
              <span>Tramo {t.numero ?? i + 1}</span>
              {draft.tramos.length > 1 && (
                <button
                  type="button"
                  className="btn-del"
                  onClick={() => {
                    setDraft((d) => ({ ...d, tramos: d.tramos.filter((x) => x.id !== t.id) }));
                    setFotosPorTramo((m) => {
                      const c = { ...m };
                      delete c[t.id];
                      return c;
                    });
                  }}
                >
                  Quitar
                </button>
              )}
            </div>
            <div className="grid4">
              <label>
                Nº de tramo
                <input
                  inputMode="numeric"
                  value={t.numero != null ? String(t.numero) : ""}
                  onChange={(e) => patchTramo(t.id, { numero: parseInt0(e.target.value) })}
                />
              </label>
              <label>
                Km inicial *
                <input
                  inputMode="decimal"
                  value={t.kmInicial != null ? String(t.kmInicial).replace(".", ",") : ""}
                  onChange={(e) => patchTramo(t.id, { kmInicial: parseDecimal(e.target.value) })}
                />
              </label>
              <label>
                Km final *
                <input
                  inputMode="decimal"
                  value={t.kmFinal != null ? String(t.kmFinal).replace(".", ",") : ""}
                  onChange={(e) => patchTramo(t.id, { kmFinal: parseDecimal(e.target.value) })}
                />
              </label>
              <label>
                Tipo de vía *
                <select
                  value={t.tipoVia ?? ""}
                  onChange={(e) => patchTramo(t.id, { tipoVia: (e.target.value || undefined) as Tramo["tipoVia"] })}
                >
                  <option value="">—</option>
                  {TIPO_VIA.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="checks">
              <legend>Puntos críticos detectados en el tramo</legend>
              {PUNTOS_CRITICOS.map((p) => (
                <label key={p} className="check-line">
                  <input
                    type="checkbox"
                    checked={t.puntosCriticos.includes(p)}
                    onChange={() => toggleTramoPunto(t.id, p)}
                  />
                  <span>{p}</span>
                </label>
              ))}
              <label className="check-line">
                <span className="check-otro-label">Otro:</span>
                <input
                  className="check-otro-input"
                  value={t.puntosCriticosOtro ?? ""}
                  onChange={(e) => patchTramo(t.id, { puntosCriticosOtro: e.target.value })}
                  placeholder="otro punto crítico…"
                />
              </label>
            </fieldset>

            <label>
              Recomendaciones
              <textarea
                rows={2}
                value={t.recomendaciones ?? ""}
                onChange={(e) => patchTramo(t.id, { recomendaciones: e.target.value })}
              />
            </label>

            <div className="fotos-block">
              <div className="fotos-head">
                <span>Fotos del tramo</span>
                <label className="btn-add-foto">
                  + Agregar fotos
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    hidden
                    onChange={(e) => {
                      void addTramoFotos(t.id, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <div className="thumbs">
                {(tramoPreviews[t.id] ?? []).map((u, idx) => (
                  <div className="thumb" key={u}>
                    <img src={u} alt={`tramo ${idx + 1}`} />
                    <button type="button" onClick={() => removeTramoFoto(t.id, idx)}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn-add"
          onClick={() =>
            setDraft((d) => ({ ...d, tramos: [...d.tramos, newTramo(d.tramos.length + 1)] }))
          }
        >
          + Agregar tramo
        </button>
      </section>

      {/* INTERFERENCIAS */}
      <section className="card">
        <h2>8 · Interferencias aéreas</h2>
        <details className="ref-block">
          <summary>Distancias mínimas de seguridad a líneas energizadas (kV)</summary>
          <table className="ref-table">
            <thead>
              <tr>
                <th>Nivel de tensión</th>
                <th>Distancia mínima</th>
              </tr>
            </thead>
            <tbody>
              {INTERFERENCIAS_AEREAS_REF.map((r) => (
                <tr key={r.kv}>
                  <td>{r.kv}</td>
                  <td>{r.distancia}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        {draft.interferencias.map((it, i) => (
          <div className="repeat-row" key={it.id}>
            <div className="repeat-head">
              <span>Interferencia {i + 1}</span>
              {draft.interferencias.length > 1 && (
                <button
                  type="button"
                  className="btn-del"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      interferencias: d.interferencias.filter((x) => x.id !== it.id),
                    }))
                  }
                >
                  Quitar
                </button>
              )}
            </div>
            <div className="grid3">
              <label>
                Descripción (ej. "línea media tensión 10 m")
                <input
                  value={it.descripcion ?? ""}
                  onChange={(e) => patchInterferencia(it.id, { descripcion: e.target.value })}
                />
              </label>
              <label>
                Distancia a la línea de tensión
                <input
                  inputMode="decimal"
                  value={it.distanciaKm != null ? String(it.distanciaKm).replace(".", ",") : ""}
                  onChange={(e) => patchInterferencia(it.id, { distanciaKm: parseDecimal(e.target.value) })}
                />
              </label>
              <label>
                Altura máxima detectada (m)
                <input
                  inputMode="decimal"
                  value={it.alturaMaxima != null ? String(it.alturaMaxima).replace(".", ",") : ""}
                  onChange={(e) => patchInterferencia(it.id, { alturaMaxima: parseDecimal(e.target.value) })}
                />
              </label>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn-add"
          onClick={() => setDraft((d) => ({ ...d, interferencias: [...d.interferencias, newInterferencia()] }))}
        >
          + Agregar interferencia
        </button>
      </section>

      {/* YACIMIENTOS / RUTAS */}
      <section className="card">
        <h2>9 · Otros yacimientos y rutas</h2>

        <div className="lista-block">
          <div className="fotos-head">
            <span>Yacimientos por los que circula</span>
            <button
              type="button"
              className="btn-add-foto"
              onClick={() => setDraft((d) => ({ ...d, yacimientos: [...d.yacimientos, newNombre()] }))}
            >
              + Agregar yacimiento
            </button>
          </div>
          {draft.yacimientos.length === 0 && <p className="hint">Ninguno (no circula por otro yacimiento).</p>}
          {draft.yacimientos.map((y, i) => (
            <div className="inline-row" key={y.id}>
              <input
                value={y.nombre ?? ""}
                placeholder={`Yacimiento ${i + 1}`}
                onChange={(e) => patchYacimiento(y.id, { nombre: e.target.value })}
              />
              <button
                type="button"
                className="btn-del"
                onClick={() => setDraft((d) => ({ ...d, yacimientos: d.yacimientos.filter((x) => x.id !== y.id) }))}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>

        <div className="lista-block" style={{ marginTop: 14 }}>
          <div className="fotos-head">
            <span>Rutas estatales / ciudad por las que circula</span>
            <button
              type="button"
              className="btn-add-foto"
              onClick={() => setDraft((d) => ({ ...d, rutas: [...d.rutas, newNombre()] }))}
            >
              + Agregar ruta
            </button>
          </div>
          {draft.rutas.length === 0 && <p className="hint">Ninguna (no circula por rutas estatales/ciudad).</p>}
          {draft.rutas.map((r, i) => (
            <div className="inline-row" key={r.id}>
              <input
                value={r.nombre ?? ""}
                placeholder={`Ruta ${i + 1} (ej: RP5)`}
                onChange={(e) => patchRuta(r.id, { nombre: e.target.value })}
              />
              <button
                type="button"
                className="btn-del"
                onClick={() => setDraft((d) => ({ ...d, rutas: d.rutas.filter((x) => x.id !== r.id) }))}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* PLAN */}
      <section className="card">
        <h2>10 · Plan de desmontaje, transporte y montaje</h2>
        <div className="grid2">
          <label>
            Fecha de inicio (estimada)
            <input type="date" value={draft.planFechaInicio ?? ""} onChange={(e) => set("planFechaInicio", e.target.value)} />
          </label>
          <label>
            Hora de inicio (estimada)
            <input type="time" value={draft.planHoraInicio ?? ""} onChange={(e) => set("planHoraInicio", e.target.value)} />
          </label>
        </div>
      </section>

      {/* FINALIZACIÓN + REGISTRO CARGAS */}
      <section className="card">
        <h2>11 · Finalización y registro de cargas</h2>
        <div className="grid2">
          <label>
            Fecha y hora de finalización (estimada)
            <input
              type="datetime-local"
              value={draft.fechaHoraFinalizacion ?? ""}
              onChange={(e) => set("fechaHoraFinalizacion", e.target.value)}
            />
          </label>
          <label>
            Recursos / flota asignada
            <input value={draft.recursosFlota ?? ""} onChange={(e) => set("recursosFlota", e.target.value)} />
          </label>
        </div>
        <details className="ref-block">
          <summary>Tabla de referencia — dimensiones típicas de cargas (m)</summary>
          <table className="ref-table">
            <thead>
              <tr>
                <th>Ítem</th>
                <th>Largo</th>
                <th>Ancho</th>
                <th>Alto</th>
              </tr>
            </thead>
            <tbody>
              {REGISTRO_CARGAS_REF.map((r) => (
                <tr key={r.item}>
                  <td>{r.item}</td>
                  <td>{formatDecimal(r.largo)}</td>
                  <td>{formatDecimal(r.ancho)}</td>
                  <td>{formatDecimal(r.alto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
        <MediaPicker
          slot="registroCargas"
          label="Registro de cargas del equipo (estimado) — imagen *"
          file={media.registroCargas}
          preview={mediaPreviews.registroCargas}
          onSet={setMediaFile}
        />
      </section>

      {/* CARGAS ESPECÍFICAS */}
      <section className="card">
        <h2>12 · Ingreso de cargas específicas</h2>
        {draft.cargas.map((c, i) => (
          <div className="repeat-row" key={c.id}>
            <div className="repeat-head">
              <span>Carga {c.item ?? i + 1}</span>
              {draft.cargas.length > 1 && (
                <button
                  type="button"
                  className="btn-del"
                  onClick={() => setDraft((d) => ({ ...d, cargas: d.cargas.filter((x) => x.id !== c.id) }))}
                >
                  Quitar
                </button>
              )}
            </div>
            <div className="grid5">
              <label>
                Ítem
                <input
                  inputMode="numeric"
                  value={c.item != null ? String(c.item) : ""}
                  onChange={(e) => patchCarga(c.id, { item: parseInt0(e.target.value) })}
                />
              </label>
              <label className="span2">
                Descripción
                <select
                  value={c.descripcion ?? ""}
                  onChange={(e) => patchCarga(c.id, { descripcion: (e.target.value || undefined) as Carga["descripcion"] })}
                >
                  <option value="">—</option>
                  {DESCRIPCION_CARGA.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  <option value={DESCRIPCION_CARGA_OTRO}>Otro…</option>
                </select>
              </label>
              <label>
                Largo (m)
                <input
                  inputMode="decimal"
                  value={c.largo != null ? String(c.largo).replace(".", ",") : ""}
                  onChange={(e) => patchCarga(c.id, { largo: parseDecimal(e.target.value) })}
                />
              </label>
              <label>
                Ancho (m)
                <input
                  inputMode="decimal"
                  value={c.ancho != null ? String(c.ancho).replace(".", ",") : ""}
                  onChange={(e) => patchCarga(c.id, { ancho: parseDecimal(e.target.value) })}
                />
              </label>
              <label>
                Alto (m)
                <input
                  inputMode="decimal"
                  value={c.alto != null ? String(c.alto).replace(".", ",") : ""}
                  onChange={(e) => patchCarga(c.id, { alto: parseDecimal(e.target.value) })}
                />
              </label>
            </div>
            {c.descripcion === DESCRIPCION_CARGA_OTRO && (
              <label>
                Indique la carga (OTRO)
                <input
                  value={c.descripcionOtro ?? ""}
                  onChange={(e) => patchCarga(c.id, { descripcionOtro: e.target.value })}
                />
              </label>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn-add"
          onClick={() => setDraft((d) => ({ ...d, cargas: [...d.cargas, newCarga(d.cargas.length + 1)] }))}
        >
          + Agregar carga
        </button>
      </section>

      {/* VERIFICACIONES (informativo) */}
      <section className="card">
        <h2>13 · Verificaciones obligatorias previas al viaje</h2>
        <ul className="info-list">
          <li>Control de trabajo y orden de servicio aprobados antes de la salida.</li>
          <li>Sujeción y trincado de la carga verificados (eslingas, cadenas, tensores).</li>
          <li>Cumplimiento de legislación de pesos y dimensiones (gálibo, permisos especiales).</li>
          <li>Gerenciamiento de viaje activo; evitar horarios nocturnos y condiciones climáticas adversas.</li>
          <li>Coordinación de escoltas e interferencias aéreas/terrestres del recorrido.</li>
        </ul>
      </section>

      {/* DECLARACIÓN Y FIRMA */}
      <section className="card">
        <h2>14 · Declaración y firma</h2>
        <label className="check-line declaracion">
          <input
            type="checkbox"
            checked={!!draft.declaracion}
            onChange={(e) => set("declaracion", e.target.checked)}
          />
          <span>
            Declaro bajo mi responsabilidad que los datos relevados son veraces y completos, asumiendo
            la responsabilidad civil y laboral correspondiente para con la empresa TACKER SRL.
          </span>
        </label>
        <div className="firma-section">
          <div className="firma-title">Firma del responsable *</div>
          <SignaturePad
            value={draft.firmaResponsable}
            onChange={(d) => setDraft((prev) => ({ ...prev, firmaResponsable: d }))}
          />
        </div>
        <label className="firma-fecha">
          Fecha *
          <input type="date" value={draft.firmaFecha ?? ""} onChange={(e) => set("firmaFecha", e.target.value)} />
        </label>
      </section>

      {/* PENDIENTES + ACCIONES */}
      {pendientes.length > 0 && (
        <div className="pendientes">
          <strong>Faltan datos para poder enviar:</strong>
          <ul>
            {pendientes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {error && <div className="error-box">⚠️ {error}</div>}

      <div className="actions">
        <button type="button" className="btn-ghost" onClick={descargarPdf} disabled={previewing}>
          {previewing ? "Generando PDF…" : "Vista previa PDF"}
        </button>
        <button type="button" className="btn-primary" onClick={handleSubmit} disabled={!puedeEnviar}>
          {submitting ? "Enviando…" : isDemoMode ? "Generar (demo)" : "Enviar hoja de ruta"}
        </button>
      </div>
      <p className="autosave-note">Tu progreso se guarda automáticamente en este dispositivo.</p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// CoordRow — lat/lon manual inputs + GPS button
// ----------------------------------------------------------------------------
function CoordRow({
  value,
  onChange,
  onGps,
  busy,
}: {
  value: Coord;
  onChange: (c: Coord) => void;
  onGps: () => void;
  busy: boolean;
}) {
  // Texto local: deja tipear libre (incl. "-", "-38.") sin que fmtCoord
  // reformatee a 6 decimales en cada tecla. El número parseado fluye en vivo
  // hacia arriba; cuando el campo no está enfocado, se re-sincroniza con el
  // prop (GPS / autollenado de base).
  const [latText, setLatText] = useState(() => fmtCoord(value.lat));
  const [lonText, setLonText] = useState(() => fmtCoord(value.lon));
  const latFocus = useRef(false);
  const lonFocus = useRef(false);

  useEffect(() => {
    if (!latFocus.current) setLatText(fmtCoord(value.lat));
  }, [value.lat]);
  useEffect(() => {
    if (!lonFocus.current) setLonText(fmtCoord(value.lon));
  }, [value.lon]);

  return (
    <div className="coord-row">
      <input
        className="coord-in"
        inputMode="decimal"
        value={latText}
        placeholder="Lat -38.957851"
        onFocus={() => (latFocus.current = true)}
        onBlur={() => {
          latFocus.current = false;
          setLatText(fmtCoord(value.lat));
        }}
        onChange={(e) => {
          setLatText(e.target.value);
          onChange({ lat: parseCoord(e.target.value), lon: value.lon });
        }}
      />
      <input
        className="coord-in"
        inputMode="decimal"
        value={lonText}
        placeholder="Lon -67.974515"
        onFocus={() => (lonFocus.current = true)}
        onBlur={() => {
          lonFocus.current = false;
          setLonText(fmtCoord(value.lon));
        }}
        onChange={(e) => {
          setLonText(e.target.value);
          onChange({ lat: value.lat, lon: parseCoord(e.target.value) });
        }}
      />
      <button type="button" className="btn-gps" onClick={onGps} disabled={busy} title="Usar mi ubicación">
        {busy ? "📍…" : "📍 GPS"}
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// MediaPicker — single file slot with preview + remove (mobile camera capable)
// ----------------------------------------------------------------------------
function MediaPicker({
  slot,
  label,
  file,
  preview,
  onSet,
}: {
  slot: MediaSlot;
  label: string;
  file: File | null;
  preview?: string;
  onSet: (slot: MediaSlot, file: File | null) => void | Promise<void>;
}) {
  return (
    <div className="media-picker">
      <span className="media-label">{label}</span>
      {file ? (
        <div className="media-filled">
          {preview ? (
            <img src={preview} alt={label} className="media-preview" />
          ) : (
            <span className="media-fname">{file.name}</span>
          )}
          <button type="button" className="btn-del" onClick={() => onSet(slot, null)}>
            Quitar
          </button>
        </div>
      ) : (
        <label className="media-empty">
          <span>Tocá para subir / tomar foto</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              void onSet(slot, e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
