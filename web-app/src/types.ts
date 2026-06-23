// ============================================================================
// PO-WWO-001-A3-1 DTM · HOJA DE RUTA / RUTOGRAMA — data model
// ============================================================================
// One header ("cabecera") + repeat sections (tranqueras, tramos, interferencias,
// cargas) flattened into a child "detalle" list on submit. Media files live in
// component state (Files are not serializable, not persisted in the draft).
// ============================================================================

export const FOLIO_PREFIX = "HR"; // HR-YYYYMMDD-NNNN

// ---------------------------------------------------------------------------
// Choice constants (must stay in sync with SharePoint Choice columns)
// ---------------------------------------------------------------------------

export const UNIDADES_RECORRIDO = ["#318", "#122", "#321"] as const;

export const CLIENTES = [
  "YPF S.A.",
  "GEOPARK",
  "SHELL",
  "TOTAL ENERGIES",
  "VISTA",
  "FLUXUS",
  "QUINTANA ENERGY",
  "PHOENIX",
  "PAE",
  "PLUSPETROL",
] as const;
export const CLIENTE_OTRO = "Other:" as const;

export const SI_NO = ["Sí", "No"] as const;

export const ESTADO_GUARDAGANADO = ["Buena", "Razonable", "Deficiente", "N/A"] as const;

// Field label mentions (ripio, asfalto, interno); options shown were Ripio/Asfalto.
// Keep all three so "interno" tramos are selectable.
export const TIPO_VIA = ["Ripio", "Asfalto", "Interno"] as const;

export const PUNTOS_CRITICOS = [
  "Camino de ripio con polvo en suspensión (visibilidad reducida)",
  "Zonas inundables o embarradas en cañadones",
  "Cinta asfáltica con accesos/entradas a rutas secundarias",
  "Animales sueltos a la vera del camino (presencia de ganado o fauna silvestre)",
  "Tránsito permanente en ambos sentidos (camiones de yacimientos, camiones pesados)",
  "Cruce de vehículos en intersecciones (RP5, accesos a RP7, etc.)",
  "Rotondas y diques compensadores (maniobras restringidas)",
  "Giros pronunciados o dársenas de giro en tramos de acceso",
  "Pendientes de acceso a locaciones (Por ej: ingreso a La Calera Norte)",
  "Líneas de media tensión (~10 m de altura)",
] as const;

export const DESCRIPCION_CARGA = [
  "Pileta 1",
  "Pileta 2",
  "Pileta 3",
  "Skid TK Agua/ Gas Oil",
  "Bomba",
  "Usina",
  "Acumulador",
  "Carrier",
  "Trailer Personal",
  "Trailer Jefe Equipo",
] as const;
export const DESCRIPCION_CARGA_OTRO = "Other:" as const;

// Reference table shown in the "REGISTRO DE CARGAS" informative block (block 12).
// Largo/Ancho/Alto in metres. Editable — these are typical equipment dimensions.
export interface CargaReferencia {
  item: string;
  largo: number;
  ancho: number;
  alto: number;
}
export const REGISTRO_CARGAS_REF: CargaReferencia[] = [
  { item: "Pileta 1", largo: 12.0, ancho: 2.5, alto: 3.6 },
  { item: "Pileta 2", largo: 12.0, ancho: 2.5, alto: 3.6 },
  { item: "Pileta 3", largo: 12.0, ancho: 2.5, alto: 3.6 },
  { item: "Skid TK Agua / Gas Oil", largo: 6.0, ancho: 2.5, alto: 2.8 },
  { item: "Bomba", largo: 6.0, ancho: 2.5, alto: 3.0 },
  { item: "Usina", largo: 6.0, ancho: 2.5, alto: 3.0 },
  { item: "Acumulador", largo: 6.0, ancho: 2.5, alto: 3.2 },
  { item: "Carrier", largo: 13.5, ancho: 2.5, alto: 4.0 },
  { item: "Trailer Personal", largo: 12.0, ancho: 2.6, alto: 3.8 },
  { item: "Trailer Jefe de Equipo", largo: 8.0, ancho: 2.6, alto: 3.8 },
  { item: "Trailer Vestuario", largo: 12.0, ancho: 2.6, alto: 3.8 },
  { item: "Trailer Comedor", largo: 12.0, ancho: 2.6, alto: 3.8 },
  { item: "Trailer Oficina", largo: 8.0, ancho: 2.6, alto: 3.8 },
  { item: "Tanque de Combustible", largo: 6.0, ancho: 2.5, alto: 2.8 },
  { item: "Cabina de Maniobras", largo: 6.0, ancho: 2.5, alto: 3.0 },
  { item: "Subestructura", largo: 12.0, ancho: 3.0, alto: 4.0 },
  { item: "Mástil", largo: 30.0, ancho: 2.5, alto: 3.5 },
  { item: "Generador", largo: 6.0, ancho: 2.5, alto: 3.0 },
  { item: "Caja de Herramientas", largo: 3.0, ancho: 1.5, alto: 1.8 },
];

// Distancias mínimas de seguridad a líneas energizadas (informativo, block 9).
export interface InterferenciaNivel {
  kv: string;
  distancia: string;
}
export const INTERFERENCIAS_AEREAS_REF: InterferenciaNivel[] = [
  { kv: "Hasta 1 kV", distancia: "1,00 m" },
  { kv: "> 1 kV hasta 33 kV", distancia: "2,00 m" },
  { kv: "> 33 kV hasta 66 kV", distancia: "3,00 m" },
  { kv: "> 66 kV hasta 132 kV", distancia: "4,00 m" },
  { kv: "> 132 kV hasta 220 kV", distancia: "5,00 m" },
  { kv: "> 220 kV hasta 330 kV", distancia: "6,00 m" },
  { kv: "> 330 kV hasta 500 kV", distancia: "7,00 m" },
];

export const ALTURA_LIMITE_CARGA = 4.4; // mts — gatilla instructivo de carga alta

// ---------------------------------------------------------------------------
// Repeat-section row types
// ---------------------------------------------------------------------------

export interface Tranquera {
  id: string;
  /** Distancia a la próxima tranquera (kms) */
  distanciaKm?: number;
  tieneGuardaganado?: (typeof SI_NO)[number];
  estadoGuardaganado?: (typeof ESTADO_GUARDAGANADO)[number];
}

export interface Tramo {
  id: string;
  numero?: number;
  kmInicial?: number;
  kmFinal?: number;
  tipoVia?: (typeof TIPO_VIA)[number];
  /** Puntos críticos detectados (multiple choice) */
  puntosCriticos: string[];
  puntosCriticosOtro?: string;
  recomendaciones?: string;
  // fotos del tramo viven en estado del form: Record<tramoId, File[]>
}

export interface Interferencia {
  id: string;
  descripcion?: string;
  distanciaKm?: number;
  alturaMaxima?: number;
}

export interface Carga {
  id: string;
  item?: number;
  descripcion?: (typeof DESCRIPCION_CARGA)[number] | typeof DESCRIPCION_CARGA_OTRO;
  descripcionOtro?: string;
  largo?: number;
  ancho?: number;
  alto?: number;
}

// ---------------------------------------------------------------------------
// Main draft (serializable — persisted to localStorage)
// ---------------------------------------------------------------------------

export interface HojaRutaDraft {
  folio?: string;

  // 1/16 — Datos principales
  equipoSitio?: string;
  realizada?: string; // datetime-local
  preparadaPor?: string;
  dni?: number;
  unidadRecorrido?: (typeof UNIDADES_RECORRIDO)[number];
  ubicacion?: string;

  // 2/16 — Cliente
  cliente?: (typeof CLIENTES)[number] | typeof CLIENTE_OTRO;
  clienteOtro?: string;

  // 3/16 — Encabezado del rutograma
  origen?: string;
  destino?: string;
  distanciaTotalKm?: string; // Text answer (admite "aprox")
  fechaHoraInicioProgramada?: string; // datetime-local
  inspectorResponsable?: string;
  pasoBateria1?: string; // "N/A" si no corresponde

  // 4/16 — Segundo paso por batería y altura
  pasoBateria2?: string;
  alturaMaximaCarga?: number; // mts

  // 5/16 + 6/16 — Información del recorrido (primera tranquera)
  distancia1erTranqueraKm?: number;
  tieneGuardaganado1?: (typeof SI_NO)[number];
  estadoGuardaganado1?: (typeof ESTADO_GUARDAGANADO)[number];

  // 7/16 — Más tranqueras (repeat)
  tranqueras: Tranquera[];

  // 7–9/16 — Detalle de los tramos (repeat); el tramo 1 es tramos[0]
  tramos: Tramo[];

  // 9–10/16 — Interferencias aéreas (repeat); la 1ª es interferencias[0]
  interferencias: Interferencia[];

  // 10/16 — Otros yacimientos / rutas
  circulaOtroYacimiento?: (typeof SI_NO)[number];
  yacimientoCircula?: string;
  circulaRutasEstatales?: (typeof SI_NO)[number];
  rutasCircula?: string;

  // 11/16 — Plan de desmontaje, transporte y montaje
  planFechaInicio?: string; // date
  planHoraInicio?: string; // time

  // 12/16 — Finalización y registro de cargas
  fechaHoraFinalizacion?: string; // datetime-local
  recursosFlota?: string;

  // 13–14/16 — Ingreso de cargas específicas (repeat); la 1ª es cargas[0]
  cargas: Carga[];

  // 16/16 — Declaración y firma
  declaracion?: boolean;
  firmaResponsable?: string; // dataURL PNG
  firmaFecha?: string; // date
}

export function emptyDraft(): HojaRutaDraft {
  return {
    tranqueras: [],
    tramos: [newTramo(1)],
    interferencias: [newInterferencia()],
    cargas: [newCarga(1)],
  };
}

// ---------------------------------------------------------------------------
// Row factories
// ---------------------------------------------------------------------------

let _idCounter = 0;
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  _idCounter += 1;
  return `id-${Date.now().toString(36)}-${_idCounter}`;
}

export function newTranquera(): Tranquera {
  return { id: newId() };
}
export function newTramo(numero?: number): Tramo {
  return { id: newId(), numero, puntosCriticos: [] };
}
export function newInterferencia(): Interferencia {
  return { id: newId() };
}
export function newCarga(item?: number): Carga {
  return { id: newId(), item };
}

// ---------------------------------------------------------------------------
// Media slots (single-file) held in form state (not persisted)
// ---------------------------------------------------------------------------

export type MediaSlot =
  | "diagramaTecnico" // 5/6 — diagrama dimensional del vehículo (opcional)
  | "cargaAlta" // 4 — instructivo / evidencia cargas > 4,40 m (opcional)
  | "mapaRecorrido" // 7 — foto MAPA RECORRIDO
  | "registroCargas"; // 12 — registro de cargas (estimado)

export const MEDIA_SLOTS: { key: MediaSlot; label: string; opcional: boolean }[] = [
  { key: "cargaAlta", label: "Evidencia cargas > 4,40 m (instructivo)", opcional: true },
  { key: "diagramaTecnico", label: "Diagrama técnico / dimensiones del vehículo", opcional: true },
  { key: "mapaRecorrido", label: "Foto MAPA RECORRIDO", opcional: false },
  { key: "registroCargas", label: "Registro de cargas del equipo (estimado)", opcional: false },
];

export type MediaState = Record<MediaSlot, File | null>;
export const EMPTY_MEDIA: MediaState = {
  diagramaTecnico: null,
  cargaAlta: null,
  mapaRecorrido: null,
  registroCargas: null,
};

// ---------------------------------------------------------------------------
// Payload contract (SPA → Power Automate flow)
// ---------------------------------------------------------------------------

export interface DetalleRow {
  categoria: string; // Seccion: TRANQUERA | TRAMO | INTERFERENCIA | CARGA
  item: string; // etiqueta legible
  comentarios: string; // detalle estructurado en texto
  orden: number;
}

export interface AttachmentPayload {
  name: string;
  contentBase64: string;
}

export interface HojaRutaPayload {
  folio: string;
  // cabecera scalars
  equipoSitio: string;
  realizada: string | null;
  preparadaPor: string;
  dni: number | null;
  unidadRecorrido: string | null;
  ubicacion: string;
  cliente: string | null;
  clienteOtro: string;
  origen: string;
  destino: string;
  distanciaTotalKm: string;
  fechaHoraInicioProgramada: string | null;
  inspectorResponsable: string;
  pasoBateria1: string;
  pasoBateria2: string;
  alturaMaximaCarga: number | null;
  distancia1erTranqueraKm: number | null;
  tieneGuardaganado1: string | null;
  estadoGuardaganado1: string | null;
  circulaOtroYacimiento: string | null;
  yacimientoCircula: string;
  circulaRutasEstatales: string | null;
  rutasCircula: string;
  planFechaInicio: string | null;
  planHoraInicio: string;
  fechaHoraFinalizacion: string | null;
  recursosFlota: string;
  declaracion: boolean;
  firmaFecha: string | null;
  // resumen
  cantTranqueras: number;
  cantTramos: number;
  cantInterferencias: number;
  cantCargas: number;
  // estructurado
  detalle: DetalleRow[];
  attachments: AttachmentPayload[];
}
