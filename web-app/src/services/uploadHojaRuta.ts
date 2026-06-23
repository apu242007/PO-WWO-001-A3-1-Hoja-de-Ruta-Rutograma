// SPA → Power Automate. Builds the JSON payload + attachments and POSTs it.
// Demo mode when VITE_POWER_AUTOMATE_URL is empty (skill §2).

import {
  CLIENTE_OTRO,
  DESCRIPCION_CARGA_OTRO,
  UNIDAD_OTRO,
  FOLIO_PREFIX,
  type AttachmentPayload,
  type DetalleRow,
  type HojaRutaDraft,
  type HojaRutaPayload,
  type MediaState,
} from "../types";
import { blobToBase64, compressImage, fileExt } from "../lib/imageUtils";
import { formatDecimal } from "../lib/format";

const POWER_AUTOMATE_URL = (import.meta.env.VITE_POWER_AUTOMATE_URL ?? "").trim();
const TACKER_KEY = (import.meta.env.VITE_TACKER_KEY ?? "").trim();
export const isDemoMode = POWER_AUTOMATE_URL === "";

// total base64 budget — block submit over this (skill §8)
const MAX_PAYLOAD_BYTES = 6 * 1024 * 1024;

export interface UploadInput {
  draft: HojaRutaDraft;
  media: MediaState;
  fotosPorTramo: Record<string, File[]>;
  pdfBlob: Blob;
}

export interface UploadResult {
  ok: boolean;
  demo?: boolean;
  folio: string;
  status?: number;
  error?: string;
}

export function genFolio(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `${FOLIO_PREFIX}-${stamp}-${rnd}`;
}

function clienteFinal(draft: HojaRutaDraft): string | null {
  if (!draft.cliente) return null;
  if (draft.cliente === CLIENTE_OTRO) return draft.clienteOtro?.trim() || "OTRO";
  return draft.cliente;
}

function unidadFinal(draft: HojaRutaDraft): string | null {
  if (!draft.unidadRecorrido) return null;
  if (draft.unidadRecorrido === UNIDAD_OTRO) return draft.unidadOtro?.trim() || "OTRO";
  return draft.unidadRecorrido;
}

function num(n: number | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
function str(s: string | undefined): string {
  return (s ?? "").trim();
}
function choice(s: string | undefined): string | null {
  return s && s.trim() ? s.trim() : null;
}

function join(parts: (string | undefined | null)[]): string {
  return parts.filter((p) => p != null && String(p).trim() !== "").join("  |  ");
}

export function buildDetalle(draft: HojaRutaDraft): DetalleRow[] {
  const rows: DetalleRow[] = [];
  let orden = 0;

  // Tranquera 1 (campos escalares)
  rows.push({
    categoria: "TRANQUERA",
    item: "Tranquera 1",
    comentarios: join([
      draft.distancia1erTranqueraKm != null
        ? `Distancia: ${formatDecimal(draft.distancia1erTranqueraKm)} km`
        : null,
      draft.tieneGuardaganado1 ? `Guardaganado: ${draft.tieneGuardaganado1}` : null,
      draft.estadoGuardaganado1 ? `Estado: ${draft.estadoGuardaganado1}` : null,
    ]),
    orden: orden++,
  });

  draft.tranqueras.forEach((t, i) => {
    rows.push({
      categoria: "TRANQUERA",
      item: `Tranquera ${i + 2}`,
      comentarios: join([
        t.distanciaKm != null ? `Distancia: ${formatDecimal(t.distanciaKm)} km` : null,
        t.tieneGuardaganado ? `Guardaganado: ${t.tieneGuardaganado}` : null,
        t.estadoGuardaganado ? `Estado: ${t.estadoGuardaganado}` : null,
      ]),
      orden: orden++,
    });
  });

  draft.tramos.forEach((t, i) => {
    const pc = [...t.puntosCriticos];
    if (t.puntosCriticosOtro?.trim()) pc.push(`Otro: ${t.puntosCriticosOtro.trim()}`);
    rows.push({
      categoria: "TRAMO",
      item: `Tramo ${t.numero ?? i + 1}: km ${t.kmInicial ?? "?"}–${t.kmFinal ?? "?"}${
        t.tipoVia ? ` (${t.tipoVia})` : ""
      }`,
      comentarios: join([
        pc.length ? `Puntos críticos: ${pc.join("; ")}` : "Sin puntos críticos",
        t.recomendaciones?.trim() ? `Recomendaciones: ${t.recomendaciones.trim()}` : null,
      ]),
      orden: orden++,
    });
  });

  draft.interferencias.forEach((it, i) => {
    if (!it.descripcion && it.distanciaKm == null && it.alturaMaxima == null) return;
    rows.push({
      categoria: "INTERFERENCIA",
      item: `Interferencia ${i + 1}${it.descripcion ? `: ${it.descripcion}` : ""}`,
      comentarios: join([
        it.distanciaKm != null ? `Distancia: ${formatDecimal(it.distanciaKm)}` : null,
        it.alturaMaxima != null ? `Altura máx.: ${formatDecimal(it.alturaMaxima)} m` : null,
      ]),
      orden: orden++,
    });
  });

  draft.cargas.forEach((c, i) => {
    const desc = c.descripcion === DESCRIPCION_CARGA_OTRO ? c.descripcionOtro?.trim() || "OTRO" : c.descripcion;
    if (!desc && c.largo == null && c.ancho == null && c.alto == null) return;
    rows.push({
      categoria: "CARGA",
      item: `Carga ${c.item ?? i + 1}: ${desc ?? "—"}`,
      comentarios: join([
        c.largo != null ? `Largo: ${formatDecimal(c.largo)} m` : null,
        c.ancho != null ? `Ancho: ${formatDecimal(c.ancho)} m` : null,
        c.alto != null ? `Alto: ${formatDecimal(c.alto)} m` : null,
      ]),
      orden: orden++,
    });
  });

  return rows;
}

export function buildScalarPayload(draft: HojaRutaDraft, folio: string): Omit<HojaRutaPayload, "detalle" | "attachments"> {
  return {
    folio,
    equipoSitio: str(draft.equipoSitio),
    realizada: draft.realizada ? new Date(draft.realizada).toISOString() : null,
    preparadaPor: str(draft.preparadaPor),
    dni: num(draft.dni),
    unidadRecorrido: unidadFinal(draft),
    ubicacion: str(draft.ubicacion),
    cliente: clienteFinal(draft),
    clienteOtro: str(draft.clienteOtro),
    origen: str(draft.origen),
    destino: str(draft.destino),
    distanciaTotalKm: str(draft.distanciaTotalKm),
    fechaHoraInicioProgramada: draft.fechaHoraInicioProgramada
      ? new Date(draft.fechaHoraInicioProgramada).toISOString()
      : null,
    inspectorResponsable: str(draft.inspectorResponsable),
    pasoBateria1: str(draft.pasoBateria1),
    pasoBateria2: str(draft.pasoBateria2),
    alturaMaximaCarga: num(draft.alturaMaximaCarga),
    distancia1erTranqueraKm: num(draft.distancia1erTranqueraKm),
    tieneGuardaganado1: choice(draft.tieneGuardaganado1),
    estadoGuardaganado1: choice(draft.estadoGuardaganado1),
    circulaOtroYacimiento: choice(draft.circulaOtroYacimiento),
    yacimientoCircula: str(draft.yacimientoCircula),
    circulaRutasEstatales: choice(draft.circulaRutasEstatales),
    rutasCircula: str(draft.rutasCircula),
    planFechaInicio: draft.planFechaInicio || null,
    planHoraInicio: str(draft.planHoraInicio),
    fechaHoraFinalizacion: draft.fechaHoraFinalizacion
      ? new Date(draft.fechaHoraFinalizacion).toISOString()
      : null,
    recursosFlota: str(draft.recursosFlota),
    declaracion: !!draft.declaracion,
    firmaFecha: draft.firmaFecha || null,
    cantTranqueras: draft.tranqueras.length + 1,
    cantTramos: draft.tramos.length,
    cantInterferencias: draft.interferencias.filter(
      (i) => i.descripcion || i.distanciaKm != null || i.alturaMaxima != null
    ).length,
    cantCargas: draft.cargas.filter((c) => c.descripcion || c.largo != null).length,
  };
}

async function buildAttachments(input: UploadInput, folio: string): Promise<AttachmentPayload[]> {
  const out: AttachmentPayload[] = [];

  // [0] PDF
  out.push({
    name: `HojaRuta_${folio}.pdf`,
    contentBase64: await blobToBase64(input.pdfBlob),
  });

  // [1] firma
  if (input.draft.firmaResponsable && input.draft.firmaResponsable.length > 200) {
    const comma = input.draft.firmaResponsable.indexOf(",");
    out.push({
      name: `firma_${folio}.png`,
      contentBase64:
        comma >= 0 ? input.draft.firmaResponsable.slice(comma + 1) : input.draft.firmaResponsable,
    });
  }

  // media slots
  for (const [slot, file] of Object.entries(input.media)) {
    if (!file) continue;
    const compressed = await compressImage(file);
    out.push({
      name: `${slot}_${folio}.${fileExt(file)}`,
      contentBase64: await blobToBase64(compressed),
    });
  }

  // per-tramo fotos
  for (const tramo of input.draft.tramos) {
    const fotos = input.fotosPorTramo[tramo.id] ?? [];
    for (let i = 0; i < fotos.length; i++) {
      const compressed = await compressImage(fotos[i]);
      out.push({
        name: `tramo${tramo.numero ?? "?"}-foto${i + 1}_${folio}.${fileExt(fotos[i])}`,
        contentBase64: await blobToBase64(compressed),
      });
    }
  }

  return out;
}

export function payloadBytes(attachments: AttachmentPayload[]): number {
  return attachments.reduce((acc, a) => acc + a.contentBase64.length, 0);
}

export async function uploadHojaRuta(input: UploadInput): Promise<UploadResult> {
  const folio = input.draft.folio?.trim() || genFolio();
  const attachments = await buildAttachments(input, folio);

  const bytes = payloadBytes(attachments);
  if (bytes > MAX_PAYLOAD_BYTES) {
    return {
      ok: false,
      folio,
      error: `Adjuntos demasiado grandes (${(bytes / 1024 / 1024).toFixed(1)} MB). Reducí la cantidad/calidad de fotos.`,
    };
  }

  const payload: HojaRutaPayload = {
    ...buildScalarPayload(input.draft, folio),
    detalle: buildDetalle(input.draft),
    attachments,
  };

  if (isDemoMode) {
    console.warn("[demo] VITE_POWER_AUTOMATE_URL no configurada — no se envía POST", payload);
    return { ok: true, demo: true, folio };
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (TACKER_KEY) headers["x-tacker-key"] = TACKER_KEY;
    const res = await fetch(POWER_AUTOMATE_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { ok: false, folio, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, folio, status: res.status };
  } catch (e) {
    return { ok: false, folio, error: e instanceof Error ? e.message : "Error de red" };
  }
}
