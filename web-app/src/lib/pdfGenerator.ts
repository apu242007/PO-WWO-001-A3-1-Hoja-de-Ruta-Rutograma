// PDF generator — jsPDF + autotable + QR. Built-in font is not reliably UTF-8,
// so all PDF text is ASCII-transliterated via safe() (skill §5 fallback). The
// SharePoint item + email keep full accents (UTF-8 end to end).

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import {
  DESCRIPCION_CARGA_OTRO,
  CLIENTE_OTRO,
  UNIDAD_OTRO,
  ALTURA_LIMITE_CARGA,
  type HojaRutaDraft,
  type MediaState,
} from "../types";
import { blobToDataUrl } from "./imageUtils";
import { displayDate, displayDateTime, formatDecimal } from "./format";

const BASE = import.meta.env.BASE_URL ?? "/";
const NAVY = "#0b3d5c";
const GOLD = "#f5a623";

export interface PdfInput {
  draft: HojaRutaDraft;
  media: MediaState;
  fotosPorTramo: Record<string, File[]>;
  folio: string;
}

/** ASCII transliteration so jsPDF's built-in font never garbles accents. */
function safe(s: string | number | undefined | null): string {
  if (s == null) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[ñ]/g, "n") // ñ
    .replace(/[Ñ]/g, "N") // Ñ
    .replace(/[¿¡]/g, "") // ¿ ¡
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-");
}

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}tacker-logo.png`);
    const blob = await res.blob();
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

function imgSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
}

function addImageSafe(doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number) {
  try {
    doc.addImage(dataUrl, "JPEG", x, y, w, h);
  } catch {
    try {
      doc.addImage(dataUrl, "PNG", x, y, w, h);
    } catch {
      /* skip */
    }
  }
}

export async function buildHojaRutaPdf(input: PdfInput): Promise<Blob> {
  const { draft, media, fotosPorTramo, folio } = input;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  const logo = await loadLogo();
  let qr: string | null = null;
  try {
    qr = await QRCode.toDataURL(folio, { margin: 1, width: 240 });
  } catch {
    qr = null;
  }

  // ---- header ----
  doc.setFillColor(NAVY);
  doc.rect(0, 0, pageW, 30, "F");
  if (logo) addImageSafe(doc, logo, margin, 5, 20, 20);
  doc.setTextColor("#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("HOJA DE RUTA / RUTOGRAMA", margin + 24, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("PO-WWO-001-A3-1 DTM  -  TACKER SRL", margin + 24, 19);
  doc.setFontSize(10);
  doc.text(`Folio: ${folio}`, margin + 24, 25);
  if (qr) addImageSafe(doc, qr, pageW - margin - 20, 5, 20, 20);
  y = 36;

  doc.setTextColor("#111111");

  // ---- helpers ----
  function ensure(space: number) {
    if (y + space > pageH - 12) {
      doc.addPage();
      y = margin;
    }
  }

  function sectionTitle(t: string) {
    ensure(12);
    doc.setFillColor(NAVY);
    doc.rect(margin, y, pageW - margin * 2, 7, "F");
    doc.setTextColor("#ffffff");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(safe(t), margin + 2, y + 5);
    doc.setTextColor("#111111");
    y += 9;
  }

  function kvTable(rows: [string, string][]) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 1.6 },
      columnStyles: {
        0: { cellWidth: 58, fontStyle: "bold", fillColor: [241, 245, 248] },
        1: { cellWidth: pageW - margin * 2 - 58 },
      },
      body: rows.map(([k, v]) => [safe(k), safe(v || "—")]),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  function paragraph(label: string, text: string) {
    ensure(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(safe(label), margin, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(safe(text || "—"), pageW - margin * 2);
    ensure(lines.length * 4 + 2);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 2;
  }

  async function photoGrid(dataUrls: string[]) {
    if (!dataUrls.length) return;
    const gap = 4;
    const cols = 3;
    const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
    const cellH = cellW * 0.72;
    let col = 0;
    ensure(cellH + 2);
    let rowY = y;
    for (const url of dataUrls) {
      const { w, h } = await imgSize(url);
      const ratio = Math.min(cellW / w, cellH / h);
      const dw = w * ratio;
      const dh = h * ratio;
      const x = margin + col * (cellW + gap);
      addImageSafe(doc, url, x + (cellW - dw) / 2, rowY + (cellH - dh) / 2, dw, dh);
      doc.setDrawColor("#cccccc");
      doc.rect(x, rowY, cellW, cellH);
      col++;
      if (col >= cols) {
        col = 0;
        rowY += cellH + gap;
        y = rowY;
        ensure(cellH + 2);
        rowY = y;
      }
    }
    if (col > 0) {
      y = rowY + cellH + gap;
    }
  }

  // ---- 1. Datos principales ----
  sectionTitle("1 - DATOS PRINCIPALES");
  kvTable([
    ["Equipo / Sitio", draft.equipoSitio ?? ""],
    ["Realizada", displayDateTime(draft.realizada)],
    ["Preparada por", draft.preparadaPor ?? ""],
    ["DNI", draft.dni != null ? String(draft.dni) : ""],
    [
      "Unidad utilizada",
      draft.unidadRecorrido === UNIDAD_OTRO
        ? draft.unidadOtro || "OTRO"
        : draft.unidadRecorrido ?? "",
    ],
    ["Ubicacion", draft.ubicacion ?? ""],
  ]);

  // ---- 2. Cliente ----
  sectionTitle("2 - CLIENTE");
  const cliente = draft.cliente === CLIENTE_OTRO ? draft.clienteOtro || "OTRO" : draft.cliente ?? "";
  kvTable([["Cliente / Operadora", cliente]]);

  // ---- 3. Encabezado del rutograma ----
  sectionTitle("3 - ENCABEZADO DEL RUTOGRAMA");
  kvTable([
    ["Origen", draft.origen ?? ""],
    ["Destino", draft.destino ?? ""],
    ["Distancia total (km)", draft.distanciaTotalKm ?? ""],
    ["Inicio programado", displayDateTime(draft.fechaHoraInicioProgramada)],
    ["Inspector / Responsable", draft.inspectorResponsable ?? ""],
    ["Paso por Bateria Nro", draft.pasoBateria1 ?? ""],
  ]);

  // ---- 4. Segundo paso + altura ----
  sectionTitle("4 - SEGUNDO PASO POR BATERIA Y ALTURA");
  kvTable([
    ["Paso por Bateria Nro (2)", draft.pasoBateria2 ?? ""],
    [
      "Altura maxima de la carga (mts)",
      draft.alturaMaximaCarga != null ? formatDecimal(draft.alturaMaximaCarga) : "",
    ],
  ]);
  if (draft.alturaMaximaCarga != null && draft.alturaMaximaCarga > ALTURA_LIMITE_CARGA) {
    ensure(8);
    doc.setFillColor("#fef3c7");
    doc.rect(margin, y, pageW - margin * 2, 6, "F");
    doc.setTextColor("#b45309");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(
      safe(`! Carga > ${ALTURA_LIMITE_CARGA} m: aplicar procedimiento de carga alta / permisos.`),
      margin + 2,
      y + 4
    );
    doc.setTextColor("#111111");
    y += 8;
  }

  // ---- Tranqueras ----
  sectionTitle("INFORMACION DEL RECORRIDO - TRANQUERAS");
  {
    const body: string[][] = [];
    body.push([
      "1",
      draft.distancia1erTranqueraKm != null ? formatDecimal(draft.distancia1erTranqueraKm) : "—",
      draft.tieneGuardaganado1 ?? "—",
      draft.estadoGuardaganado1 ?? "—",
    ]);
    draft.tranqueras.forEach((t, i) =>
      body.push([
        String(i + 2),
        t.distanciaKm != null ? formatDecimal(t.distanciaKm) : "—",
        t.tieneGuardaganado ?? "—",
        t.estadoGuardaganado ?? "—",
      ])
    );
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: "striped",
      headStyles: { fillColor: [11, 61, 92] },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 1.6 },
      head: [["#", "Distancia (km)", "Guardaganado", "Estado"]],
      body: body.map((r) => r.map(safe)),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ---- Tramos ----
  sectionTitle("DETALLE DE LOS TRAMOS");
  for (const t of draft.tramos) {
    ensure(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(
      safe(
        `Tramo ${t.numero ?? "?"}  -  km ${t.kmInicial ?? "?"} a ${t.kmFinal ?? "?"}` +
          (t.tipoVia ? `  (${t.tipoVia})` : "")
      ),
      margin,
      y
    );
    y += 4;
    const pc = [...t.puntosCriticos];
    if (t.puntosCriticosOtro?.trim()) pc.push(`Otro: ${t.puntosCriticosOtro.trim()}`);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    if (pc.length) {
      for (const p of pc) {
        const lines = doc.splitTextToSize(safe(`- ${p}`), pageW - margin * 2 - 2);
        ensure(lines.length * 3.6 + 1);
        doc.text(lines, margin + 2, y);
        y += lines.length * 3.6;
      }
    } else {
      ensure(4);
      doc.text(safe("- Sin puntos criticos detectados"), margin + 2, y);
      y += 4;
    }
    if (t.recomendaciones?.trim()) {
      paragraph("Recomendaciones:", t.recomendaciones);
    } else {
      y += 1;
    }
    // fotos del tramo
    const fotos = fotosPorTramo[t.id] ?? [];
    if (fotos.length) {
      const urls: string[] = [];
      for (const f of fotos) {
        try {
          urls.push(await blobToDataUrl(f));
        } catch {
          /* skip */
        }
      }
      await photoGrid(urls);
    }
    y += 2;
  }

  // ---- Interferencias ----
  const interfActivas = draft.interferencias.filter(
    (i) => i.descripcion || i.distanciaKm != null || i.alturaMaxima != null
  );
  if (interfActivas.length) {
    sectionTitle("INTERFERENCIAS AEREAS");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: "striped",
      headStyles: { fillColor: [11, 61, 92] },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 1.6 },
      head: [["#", "Descripcion", "Distancia", "Altura max. (m)"]],
      body: interfActivas.map((it, i) =>
        [
          String(i + 1),
          it.descripcion ?? "—",
          it.distanciaKm != null ? formatDecimal(it.distanciaKm) : "—",
          it.alturaMaxima != null ? formatDecimal(it.alturaMaxima) : "—",
        ].map(safe)
      ),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ---- Yacimientos / rutas ----
  sectionTitle("OTROS YACIMIENTOS Y RUTAS");
  kvTable([
    ["Circula por otro yacimiento", draft.circulaOtroYacimiento ?? ""],
    ["Yacimiento(s)", draft.yacimientoCircula ?? ""],
    ["Circula por rutas estatales / ciudad", draft.circulaRutasEstatales ?? ""],
    ["Ruta(s)", draft.rutasCircula ?? ""],
  ]);

  // ---- Plan ----
  sectionTitle("PLAN DE DESMONTAJE, TRANSPORTE Y MONTAJE");
  kvTable([
    ["Fecha de inicio (estimada)", displayDate(draft.planFechaInicio)],
    ["Hora de inicio (estimada)", draft.planHoraInicio ?? ""],
    ["Fecha/hora de finalizacion (estimada)", displayDateTime(draft.fechaHoraFinalizacion)],
    ["Recursos / flota asignada", draft.recursosFlota ?? ""],
  ]);

  // ---- Cargas ----
  const cargasActivas = draft.cargas.filter((c) => c.descripcion || c.largo != null);
  if (cargasActivas.length) {
    sectionTitle("REGISTRO DE CARGAS DEL EQUIPO (ESTIMADO)");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: "striped",
      headStyles: { fillColor: [11, 61, 92] },
      styles: { font: "helvetica", fontSize: 9, cellPadding: 1.6 },
      head: [["Item", "Descripcion", "Largo (m)", "Ancho (m)", "Alto (m)"]],
      body: cargasActivas.map((c, i) =>
        [
          c.item != null ? String(c.item) : String(i + 1),
          c.descripcion === DESCRIPCION_CARGA_OTRO ? c.descripcionOtro || "OTRO" : c.descripcion ?? "—",
          c.largo != null ? formatDecimal(c.largo) : "—",
          c.ancho != null ? formatDecimal(c.ancho) : "—",
          c.alto != null ? formatDecimal(c.alto) : "—",
        ].map(safe)
      ),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ---- Media adjunta ----
  const mediaEntries: { label: string; file: File | null }[] = [
    { label: "Foto MAPA RECORRIDO", file: media.mapaRecorrido },
    { label: "Diagrama tecnico / dimensiones", file: media.diagramaTecnico },
    { label: "Evidencia cargas > 4,40 m", file: media.cargaAlta },
    { label: "Registro de cargas (estimado)", file: media.registroCargas },
  ];
  const withFiles = mediaEntries.filter((m) => m.file);
  if (withFiles.length) {
    sectionTitle("DOCUMENTACION ADJUNTA");
    for (const m of withFiles) {
      ensure(8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(safe(m.label), margin, y);
      y += 4;
      const type = (m.file!.type ?? "").toLowerCase();
      if (type.startsWith("image/") && type !== "image/svg+xml") {
        try {
          const url = await blobToDataUrl(m.file!);
          await photoGrid([url]);
        } catch {
          /* skip */
        }
      } else {
        doc.setFont("helvetica", "normal");
        doc.text(safe(`(archivo adjunto: ${m.file!.name})`), margin + 2, y);
        y += 5;
      }
    }
  }

  // ---- Declaracion y firma ----
  sectionTitle("DECLARACION Y FIRMA");
  ensure(40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const decl = doc.splitTextToSize(
    safe(
      "Declaro bajo mi responsabilidad que los datos relevados en la presente hoja de ruta son veraces y " +
        "completos, asumiendo la responsabilidad civil y laboral correspondiente para con la empresa TACKER SRL."
    ),
    pageW - margin * 2
  );
  doc.text(decl, margin, y);
  y += decl.length * 4 + 2;
  doc.text(safe(`Aceptada: ${draft.declaracion ? "SI" : "NO"}`), margin, y);
  y += 6;

  if (draft.firmaResponsable && draft.firmaResponsable.length > 200) {
    ensure(34);
    addImageSafe(doc, draft.firmaResponsable, margin, y, 60, 28);
    doc.setDrawColor("#888888");
    doc.line(margin, y + 28, margin + 60, y + 28);
    doc.setFontSize(8);
    doc.text(safe("Firma del responsable"), margin, y + 32);
    doc.text(safe(`Fecha: ${displayDate(draft.firmaFecha)}`), margin + 70, y + 32);
    y += 36;
  } else {
    doc.text(safe(`Fecha: ${displayDate(draft.firmaFecha)}`), margin, y);
    y += 6;
  }

  // ---- footer page numbers ----
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor("#888888");
    doc.text(
      safe(`PO-WWO-001-A3-1  -  Folio ${folio}`),
      margin,
      pageH - 6
    );
    doc.text(`${i} / ${pages}`, pageW - margin, pageH - 6, { align: "right" });
  }
  // brand stripe footer on last page handled implicitly
  void GOLD;

  return doc.output("blob");
}
