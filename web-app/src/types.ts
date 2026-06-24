// ============================================================================
// PO-WWO-001-A3-1 DTM · HOJA DE RUTA / RUTOGRAMA — data model
// ============================================================================
// One header ("cabecera") + repeat sections (tranqueras, tramos, interferencias,
// cargas) flattened into a child "detalle" list on submit. Media files live in
// component state (Files are not serializable, not persisted in the draft).
// ============================================================================

import { formatDominio } from "./lib/format";

export const FOLIO_PREFIX = "HR"; // HR-YYYYMMDD-NNNN

// ---------------------------------------------------------------------------
// Choice constants (must stay in sync with SharePoint Choice columns)
// ---------------------------------------------------------------------------

// Flota TACKER — unidad utilizada para el recorrido. El value guardado es
// unidadLabel(u). La opción "Otro:" habilita un dominio libre con autoformato.
export interface FlotaUnidad {
  interno: string;
  dominio: string;
  categoria: string;
  modelo: string;
}

export const FLOTA: FlotaUnidad[] = [
  { interno: "P-171", dominio: "OBL759", categoria: "Semirremolque", modelo: "MIC/SCHS-3 Semirremolque" },
  { interno: "P-270", dominio: "AD693AZ", categoria: "Semirremolque", modelo: "VULCANO/38-AMCV3II Semirremolque" },
  { interno: "P-271", dominio: "AD693AV", categoria: "Semirremolque", modelo: "VULCANO/38-AMCV3II Semirremolque" },
  { interno: "P-272", dominio: "AD693AX", categoria: "Semirremolque", modelo: "VULCANO/38-AMCV3II Semirremolque" },
  { interno: "P-273", dominio: "AD693AW", categoria: "Semirremolque", modelo: "VULCANO/35-AMP3II Semirremolque" },
  { interno: "P-001", dominio: "FKY922", categoria: "Semirremolque", modelo: "MIC/SCHS-3 Semirremolque" },
  { interno: "P-169", dominio: "NWB381", categoria: "Semirremolque", modelo: "MIC/SCHS-3 Semirremolque" },
  { interno: "P-170", dominio: "NWB382", categoria: "Semirremolque", modelo: "MIC/SCHS-3 Semirremolque" },
  { interno: "P-172", dominio: "TDK776", categoria: "Semirremolque", modelo: "MALDONADO/SRVC-130 Semirremolque" },
  { interno: "P-240", dominio: "AD272XM", categoria: "Semirremolque", modelo: "TYCROP/Bombeador Doble" },
  { interno: "P-298", dominio: "AG112OU", categoria: "Semirremolque", modelo: "SALTO/SRCH2E" },
  { interno: "P-299", dominio: "AG112OV", categoria: "Semirremolque", modelo: "SALTO/SRCH1E" },
  { interno: "P-300", dominio: "AG112OY", categoria: "Semirremolque", modelo: "SALTO/SRCH1E" },
  { interno: "P-323", dominio: "AF220KE", categoria: "Semirremolque", modelo: "QM/Semirremolque 2 ejes c/Cementador Doble" },
  { interno: "P-305", dominio: "ZZ001GX", categoria: "Carretón 5 ejes", modelo: "PATRONELLI/Carretón 5 ejes" },
  { interno: "SIN DATO", dominio: "AH505BR", categoria: "Bulk", modelo: "SCHELL/Semirremolque Bulk" },
  { interno: "P-196", dominio: "AB738BC", categoria: "Tolva", modelo: "FURTAN/Tolva Cemento" },
  { interno: "P-263", dominio: "AF160LQ", categoria: "Tolva", modelo: "QM/Tolva tipo Bulk" },
  { interno: "P-102", dominio: "FRP996", categoria: "Grúa", modelo: "PETERBILT/362 c/Grúa" },
  { interno: "P-144", dominio: "LHY235", categoria: "Camión", modelo: "SCANIA/124C" },
  { interno: "P-164", dominio: "NJP976", categoria: "Camión", modelo: "IVECO/450E33T" },
  { interno: "P-193", dominio: "OTU867", categoria: "Camión", modelo: "Ford/CARGO 915E" },
  { interno: "P-195", dominio: "PKH730", categoria: "Camión", modelo: "IVECO/7400S41TZ" },
  { interno: "P-257", dominio: "GHI454", categoria: "Camión", modelo: "SCANIA/P380 8X4" },
  { interno: "P-258", dominio: "AD316UB", categoria: "Camión", modelo: "SCANIA/568-G440 A6X4" },
  { interno: "P-259", dominio: "AD316UC", categoria: "Camión", modelo: "SCANIA/568-G440 A6X4" },
  { interno: "P-260", dominio: "AD316UD", categoria: "Camión", modelo: "SCANIA/568-G440 A6X4" },
  { interno: "P-261", dominio: "AD316UF", categoria: "Camión", modelo: "SCANIA/568-G440 A6X4" },
  { interno: "P-262", dominio: "AD452UM", categoria: "Camión", modelo: "SCANIA/568-G440 A6X4" },
  { interno: "P-085", dominio: "FAF435", categoria: "Camión", modelo: "SCANIA/P124CB" },
  { interno: "P-163", dominio: "NHT653", categoria: "Camión", modelo: "IVECO/450E33T" },
  { interno: "P-165", dominio: "NKB960", categoria: "Camión", modelo: "Ford/CARGO 1722" },
  { interno: "P-281", dominio: "AD155RK", categoria: "Camión", modelo: "KENWORTH/CTU" },
  { interno: "P-050", dominio: "LZA704", categoria: "Todoterreno", modelo: "Audi/Q7 3.0" },
  { interno: "P-061", dominio: "NBC249", categoria: "Todoterreno", modelo: "Jeep/Wrangler Unlimited Rubicon 3.6" },
  { interno: "P-062", dominio: "NFY864", categoria: "Todoterreno", modelo: "Mercedes/GLK300 4MATIC" },
  { interno: "P-060", dominio: "MYW030", categoria: "Pick Up", modelo: "Hyundai/Tucson 2.0 4WD" },
  { interno: "P-326", dominio: "AI148MB", categoria: "Pick Up", modelo: "Ford/Nueva Ranger CD 4X4 XL 2.2L" },
  { interno: "P-327", dominio: "AI148MC", categoria: "Pick Up", modelo: "Ford/Nueva Ranger CD 4X4 XL 2.2L" },
  { interno: "P-328", dominio: "AI148MD", categoria: "Pick Up", modelo: "Ford/Nueva Ranger CD 4X4 XL 2.2L" },
  { interno: "P-325", dominio: "AI148MA", categoria: "Pick Up", modelo: "Ford/Nueva Ranger CD 4X4 XL 2.2L" },
  { interno: "P-324", dominio: "AI133OZ", categoria: "Pick Up", modelo: "Ford/Nueva Ranger CD 4X4 XL 2.2L" },
  { interno: "P-322", dominio: "AG969TX", categoria: "Pick Up", modelo: "Ford/Ranger DC 4X4 XL 2.2L" },
  { interno: "P-321", dominio: "AG969TV", categoria: "Pick Up", modelo: "Ford/Ranger DC 4X4 XL 2.2L" },
  { interno: "P-320", dominio: "AG969TU", categoria: "Pick Up", modelo: "Ford/Ranger DC 4X4 XL 2.2L" },
  { interno: "P-318", dominio: "AG969TS", categoria: "Pick Up", modelo: "Ford/Ranger DC 4X4 XL 2.2L" },
  { interno: "P-319", dominio: "AG969TT", categoria: "Pick Up", modelo: "Ford/Ranger DC 4X4 XL 2.2L" },
  { interno: "P-313", dominio: "AG745ZM", categoria: "Pick Up", modelo: "Ford/Ranger DC 4X4 XL 2.2L" },
  { interno: "P-314", dominio: "AG745ZF", categoria: "Pick Up", modelo: "Ford/Ranger DC 4X4 XL 2.2L" },
  { interno: "P-315", dominio: "AG745ZE", categoria: "Pick Up", modelo: "Ford/Ranger DC 4X4 XL 2.2L" },
  { interno: "P-316", dominio: "AG745XE", categoria: "Pick Up", modelo: "Ford/Ranger DC 4X4 XL 2.2L" },
  { interno: "P-317", dominio: "AG745XF", categoria: "Pick Up", modelo: "Ford/Ranger DC 4X4 XL 2.2L" },
  { interno: "P-292", dominio: "AF826NJ", categoria: "Pick Up", modelo: "Ford/Nueva Ranger CD 4X4 XL 2.2L" },
  { interno: "P-293", dominio: "AF826NK", categoria: "Pick Up", modelo: "Ford/Nueva Ranger CD 4X4 XL 2.2L" },
  { interno: "P-294", dominio: "AF826NL", categoria: "Pick Up", modelo: "Ford/Nueva Ranger CD 4X4 XL 2.2L" },
  { interno: "P-287", dominio: "AF662GF", categoria: "Pick Up", modelo: "VW/Amarok Trend 4x4 2.0L TDI 140CV" },
  { interno: "P-286", dominio: "AF662GE", categoria: "Pick Up", modelo: "VW/Amarok Trend 4x4 2.0L TDI 140CV" },
  { interno: "P-288", dominio: "AF662GG", categoria: "Pick Up", modelo: "VW/Amarok Trend 4x4 2.0L TDI 140CV" },
  { interno: "P-289", dominio: "AF673NB", categoria: "Pick Up", modelo: "VW/Amarok Trend 4x4 2.0L TDI 140CV" },
  { interno: "P-291", dominio: "AF673NC", categoria: "Pick Up", modelo: "VW/Amarok Trend 4x4 2.0L TDI 140CV" },
  { interno: "P-296", dominio: "AG152ZH", categoria: "Pick Up", modelo: "VW/Taos" },
  { interno: "P-290", dominio: "AE924EO", categoria: "Pick Up", modelo: "RAM/1500 Rebel" },
  { interno: "P-295", dominio: "AF959KV", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S DX 2,4 TDI" },
  { interno: "P-297", dominio: "AG153AT", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S DX 2,4 TDI 6MT" },
  { interno: "P-157", dominio: "NGG176", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S DX PACK 2,5 TDI" },
  { interno: "P-166", dominio: "NJP988", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S DX PACK 2,5 TDI" },
  { interno: "P-167", dominio: "NLI391", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/D DX PACK 2,5 TDI" },
  { interno: "P-188", dominio: "OPT344", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/D DX PACK 2,5 TDI" },
  { interno: "P-194", dominio: "PFU160", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/D DX PACK 2,5 TDI" },
  { interno: "P-189", dominio: "OSY076", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S DX PACK 2,5 TDI" },
  { interno: "P-190", dominio: "OSY077", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S DX PACK 2,5 TDI" },
  { interno: "P-191", dominio: "OSY078", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S DX PACK 2,5 TDI" },
  { interno: "P-251", dominio: "AC130CV", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/D DX PACK 2,4 TDI 6MT" },
  { interno: "P-252", dominio: "AC130CW", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/D DX PACK 2,4 TDI 6MT" },
  { interno: "P-253", dominio: "AC130DD", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/D DX PACK 2,4 TDI 6MT" },
  { interno: "P-197", dominio: "AC130CX", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/D DX PACK 2,4 TDI 6MT" },
  { interno: "P-198", dominio: "AC130DB", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S DX 2,4 TDI 6MT" },
  { interno: "P-199", dominio: "AC130DC", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S DX 2,4 TDI 6MT" },
  { interno: "P-255", dominio: "AC486TC", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/D DX PACK 2,4 TDI 6MT" },
  { interno: "P-254", dominio: "AC225CN", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/D DX PACK 2,4 TDI 6MT" },
  { interno: "P-264", dominio: "AD642TL", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S 2,4 TDI 6MT" },
  { interno: "P-265", dominio: "AD642TM", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S 2,4 TDI 6MT" },
  { interno: "P-266", dominio: "AD642TJ", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S 2,4 TDI 6MT" },
  { interno: "P-267", dominio: "AD642TK", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S 2,4 TDI 6MT" },
  { interno: "P-269", dominio: "AD642TI", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S 2,4 TDI 6MT" },
  { interno: "P-268", dominio: "AD652PF", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S 2,4 TDI 6MT" },
  { interno: "P-274", dominio: "AD815GD", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S 2,4 TDI 6MT" },
  { interno: "P-275", dominio: "AD815GE", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S 2,4 TDI 6MT" },
  { interno: "P-276", dominio: "AD815GF", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S 2,4 TDI 6MT" },
  { interno: "P-277", dominio: "AD815GG", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S 2,4 TDI 6MT" },
  { interno: "P-278", dominio: "AD815GH", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S 2,4 TDI 6MT" },
  { interno: "P-279", dominio: "AD815GI", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S 2,4 TDI 6MT" },
  { interno: "P-280", dominio: "AF193IP", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S DX 2,4 TDI 6MT" },
  { interno: "P-283", dominio: "AF423PT", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S 2,4 TDI 6MT" },
  { interno: "P-284", dominio: "AF459RD", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S 2,4 TDI 6MT" },
  { interno: "P-285", dominio: "AF479OA", categoria: "Pick Up", modelo: "Toyota/Hilux 4X2 C/S 2,4 TDI 6MT" },
  { interno: "P-306", dominio: "AG916YX", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S DX 2,4 TDI 6MT" },
  { interno: "P-307", dominio: "AG916YZ", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S DX 2,4 TDI 6MT" },
  { interno: "P-308", dominio: "AG950ZA", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S DX 2,4 TDI 6MT" },
  { interno: "P-309", dominio: "AG950ZB", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S DX 2,4 TDI 6MT" },
  { interno: "P-310", dominio: "AG950ZC", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S DX 2,4 TDI 6MT" },
  { interno: "P-329", dominio: "AI283PM", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/D DX PACK 2,4 TDI 6MT" },
  { interno: "P-330", dominio: "AI283PN", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S DX 2,4 TDI 6MT" },
  { interno: "P-331", dominio: "AI283PO", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/D 2,4 TDI" },
  { interno: "P-332", dominio: "AI283PP", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/D DX PACK 2,4 TDI 6MT" },
  { interno: "P-333", dominio: "AI283PQ", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/D DX PACK 2,4 TDI 6MT" },
  { interno: "P-334", dominio: "AI283PR", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/D DX PACK 2,4 TDI 6MT" },
  { interno: "P-335", dominio: "AI283PS", categoria: "Pick Up", modelo: "Toyota/Hilux 4X4 C/S DX PACK 2,4 TDI 6MT" },
  { interno: "A-124", dominio: "AH972IY", categoria: "Pick Up (Alq. JAM)", modelo: "Toyota/Hilux 4X4 C/D DX PACK 2,4 TDI 6AT" },
  { interno: "A-120", dominio: "AG617HU", categoria: "Pick Up (Alq. JAM)", modelo: "Toyota/Hilux 4X4 C/D 2,4 TDI" },
  { interno: "A-122", dominio: "AG801IN", categoria: "Pick Up (Alq. JAM)", modelo: "Toyota/Hilux 4X4 C/D 2,4 TDI" },
  { interno: "A-123", dominio: "AG914PO", categoria: "Pick Up (Alq. JAM)", modelo: "Toyota/Hilux 4X4 C/D DX PACK 2,4 TDI 6MT" },
  { interno: "A-004", dominio: "AG780JC", categoria: "Pick Up (Alq. JAM)", modelo: "Toyota/Hilux 4X4 C/D 2,4 TDI" },
  { interno: "A-121", dominio: "AG667PN", categoria: "Pick Up (Alq. JAM)", modelo: "Toyota/Hilux 4X4 C/D 2,4 TDI" },
  { interno: "A-099", dominio: "AG046OS", categoria: "Pick Up (Alq. PROFIX)", modelo: "Nissan/Frontier S 4x4 MT CD 2.3D" },
  { interno: "A-003", dominio: "AG046NV", categoria: "Pick Up (Alq. PROFIX)", modelo: "Nissan/Frontier S 4x4 MT CD 2.3D" },
  { interno: "A-106", dominio: "AG046OL", categoria: "Pick Up (Alq. PROFIX)", modelo: "Nissan/Frontier S 4x4 MT CD 2.3D" },
];

/** Etiqueta única para el <option> y para guardar en el campo. */
export function unidadLabel(u: FlotaUnidad): string {
  return `${u.interno} · ${formatDominio(u.dominio)} · ${u.modelo}`;
}

/** Categorías en orden de primera aparición (para <optgroup>). */
export const FLOTA_CATEGORIAS: string[] = FLOTA.reduce<string[]>((acc, u) => {
  if (!acc.includes(u.categoria)) acc.push(u.categoria);
  return acc;
}, []);

export const UNIDAD_OTRO = "Otro:" as const;

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
  /** Distancia a la próxima tranquera (kms) — auto desde coords o manual */
  distanciaKm?: number;
  lat?: number;
  lon?: number;
  tieneGuardaganado?: (typeof SI_NO)[number];
  estadoGuardaganado?: (typeof ESTADO_GUARDAGANADO)[number];
}

export interface Bateria {
  id: string;
  /** Paso por Batería Nº (N/A si no corresponde) */
  numero?: string;
  lat?: number;
  lon?: number;
}

export interface NombreItem {
  id: string;
  nombre?: string;
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
  unidadRecorrido?: string; // unidadLabel(u) de FLOTA, o UNIDAD_OTRO
  unidadOtro?: string; // dominio libre cuando unidadRecorrido === UNIDAD_OTRO
  ubicacion?: string;

  // 2/16 — Cliente
  cliente?: (typeof CLIENTES)[number] | typeof CLIENTE_OTRO;
  clienteOtro?: string;

  // 3/16 — Encabezado del rutograma
  origen?: string;
  origenLat?: number;
  origenLon?: number;
  destino?: string;
  destinoLat?: number;
  destinoLon?: number;
  distanciaTotalKm?: string; // Text answer (auto desde coords, editable)
  fechaHoraInicioProgramada?: string; // datetime-local
  inspectorResponsable?: string;

  // 4/16 — Pasos por batería (repeat) + altura
  baterias: Bateria[];
  alturaMaximaCarga?: number; // mts

  // 5/16 + 6/16 — Información del recorrido (primera tranquera, con coords)
  tranq1Lat?: number;
  tranq1Lon?: number;
  distancia1erTranqueraKm?: number;
  tieneGuardaganado1?: (typeof SI_NO)[number];
  estadoGuardaganado1?: (typeof ESTADO_GUARDAGANADO)[number];

  // 7/16 — Más tranqueras (repeat)
  tranqueras: Tranquera[];

  // 7–9/16 — Detalle de los tramos (repeat); el tramo 1 es tramos[0]
  tramos: Tramo[];

  // 9–10/16 — Interferencias aéreas (repeat); la 1ª es interferencias[0]
  interferencias: Interferencia[];

  // 10/16 — Otros yacimientos / rutas (repeat)
  yacimientos: NombreItem[];
  rutas: NombreItem[];

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
    baterias: [newBateria()],
    tranqueras: [],
    tramos: [newTramo(1)],
    interferencias: [newInterferencia()],
    cargas: [newCarga(1)],
    yacimientos: [],
    rutas: [],
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
export function newBateria(): Bateria {
  return { id: newId() };
}
export function newNombre(): NombreItem {
  return { id: newId() };
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
