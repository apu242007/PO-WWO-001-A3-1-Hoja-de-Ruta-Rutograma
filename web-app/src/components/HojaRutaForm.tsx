import { useEffect, useMemo, useRef, useState } from "react";
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
  UNIDADES_RECORRIDO,
  emptyDraft,
  newCarga,
  newInterferencia,
  newTramo,
  newTranquera,
  type Carga,
  type HojaRutaDraft,
  type Interferencia,
  type MediaSlot,
  type MediaState,
  type Tramo,
  type Tranquera,
} from "../types";
import SignaturePad from "./SignaturePad";
import { clearDraft, loadDraft, saveDraft } from "../lib/draftStorage";
import { loadPreparadorProfile, savePreparadorProfile } from "../lib/preparadorProfile";
import { compressImage } from "../lib/imageUtils";
import { parseDecimal, parseInt0, formatDecimal, formatInt } from "../lib/format";
import { genFolio, isDemoMode, uploadHojaRuta } from "../services/uploadHojaRuta";

// Lazy-loaded: jsPDF + html2canvas + qrcode (~400 KB) only when a PDF is built.
const loadPdf = () => import("../lib/pdfGenerator").then((m) => m.buildHojaRutaPdf);

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

  // ---- repeat-row helpers ----
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
    if (draft.circulaOtroYacimiento === "Sí" && !draft.yacimientoCircula?.trim())
      p.push("Indicar yacimiento");
    if (draft.circulaRutasEstatales === "Sí" && !draft.rutasCircula?.trim())
      p.push("Indicar ruta(s)");
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
      const buildHojaRutaPdf = await loadPdf();
      const pdfBlob = await buildHojaRutaPdf({ draft: { ...draft, folio }, media, fotosPorTramo, folio });
      const res = await uploadHojaRuta({ draft: { ...draft, folio }, media, fotosPorTramo, pdfBlob });
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
      const buildHojaRutaPdf = await loadPdf();
      const blob = await buildHojaRutaPdf({ draft: { ...draft, folio }, media, fotosPorTramo, folio });
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
          <label>
            Unidad utilizada para recorrido *
            <select
              value={draft.unidadRecorrido ?? ""}
              onChange={(e) => set("unidadRecorrido", (e.target.value || undefined) as HojaRutaDraft["unidadRecorrido"])}
            >
              <option value="">— Seleccionar —</option>
              {UNIDADES_RECORRIDO.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
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
        <div className="grid2">
          <label>
            Origen *
            <input value={draft.origen ?? ""} onChange={(e) => set("origen", e.target.value)} />
          </label>
          <label>
            Destino *
            <input value={draft.destino ?? ""} onChange={(e) => set("destino", e.target.value)} />
          </label>
          <label>
            Distancia total (km)
            <input
              value={draft.distanciaTotalKm ?? ""}
              onChange={(e) => set("distanciaTotalKm", e.target.value)}
              placeholder="ej: 120 km"
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
          <label>
            Inspector / Responsable *
            <input
              value={draft.inspectorResponsable ?? ""}
              onChange={(e) => set("inspectorResponsable", e.target.value)}
            />
          </label>
          <label>
            Paso por Batería Nº (N/A si no corresponde)
            <input value={draft.pasoBateria1 ?? ""} onChange={(e) => set("pasoBateria1", e.target.value)} />
          </label>
        </div>
      </section>

      {/* 4 — SEGUNDO PASO + ALTURA */}
      <section className="card">
        <h2>4 · Segundo paso por batería y altura</h2>
        <div className="grid2">
          <label>
            Paso por Batería Nº (N/A si no corresponde)
            <input value={draft.pasoBateria2 ?? ""} onChange={(e) => set("pasoBateria2", e.target.value)} />
          </label>
          <label>
            Altura máxima de la carga (mts)
            <input
              inputMode="decimal"
              value={draft.alturaMaximaCarga != null ? String(draft.alturaMaximaCarga).replace(".", ",") : ""}
              onChange={(e) => set("alturaMaximaCarga", parseDecimal(e.target.value))}
              placeholder="ej: 4,40"
            />
          </label>
        </div>
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
        <div className="grid3">
          <label>
            Distancia a la 1ª tranquera (kms)
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
            <div className="grid3">
              <label>
                Distancia a la próxima tranquera (kms)
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
        <div className="grid2">
          <label>
            ¿Circula por otro yacimiento?
            <select
              value={draft.circulaOtroYacimiento ?? ""}
              onChange={(e) => set("circulaOtroYacimiento", (e.target.value || undefined) as HojaRutaDraft["circulaOtroYacimiento"])}
            >
              <option value="">—</option>
              {SI_NO.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          {draft.circulaOtroYacimiento === "Sí" && (
            <label>
              Indique por qué yacimiento circula *
              <input value={draft.yacimientoCircula ?? ""} onChange={(e) => set("yacimientoCircula", e.target.value)} />
            </label>
          )}
          <label>
            ¿Circula por rutas estatales o ciudad?
            <select
              value={draft.circulaRutasEstatales ?? ""}
              onChange={(e) => set("circulaRutasEstatales", (e.target.value || undefined) as HojaRutaDraft["circulaRutasEstatales"])}
            >
              <option value="">—</option>
              {SI_NO.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          {draft.circulaRutasEstatales === "Sí" && (
            <label>
              Indique la/s ruta/s por la que circula *
              <input value={draft.rutasCircula ?? ""} onChange={(e) => set("rutasCircula", e.target.value)} />
            </label>
          )}
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
