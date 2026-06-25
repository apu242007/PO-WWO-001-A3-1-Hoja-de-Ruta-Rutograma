# Mapa de ruta editable (Leaflet) — Diseño

**Proyecto:** PO-WWO-001-A3-1 DTM · Hoja de Ruta / Rutograma
**Fecha:** 2026-06-25
**Estado:** Aprobado (pendiente plan de implementación)

## Objetivo

Reemplazar el mapa de ruta actual (imagen PNG estática, no editable) por un
**mapa interactivo** donde el usuario puede arrastrar marcadores, agregar y
borrar puntos, y encuadrar (pan/zoom) sobre tiles reales de OpenStreetMap. El
mapa sigue exportándose a PNG para el PDF y el adjunto de SharePoint.

## Decisiones (cerradas con el usuario)

1. **Interacción:** mapa interactivo con Leaflet + tiles OSM. Marcadores
   arrastrables para origen, destino, 1ª tranquera, tranqueras adicionales y
   baterías.
2. **Agregar puntos:** barra de modos sobre el mapa — `Mover` (default, solo
   arrastrar), `+ Tranquera`, `+ Batería`. En modo `+`, el siguiente click/toque
   en el mapa agrega ese punto en esa coordenada.
3. **Borrar:** popup en el marcador con botón "Quitar". Origen y destino no se
   borran (roles fijos), solo se mueven.
4. **Ruta:** línea recta (great-circle) sobre la cadena
   `origen → 1ª tranquera → tranqueras → destino`. Las baterías son marcadores
   sueltos, fuera de la polilínea (igual que la lógica actual).
5. **Routeo vial (OSRM):** descartado (YAGNI).

## Arquitectura: editor vs renderer (separados)

- **Leaflet = editor (UX).** Mapa DOM vivo. Su única responsabilidad es editar
  las coordenadas del `draft` y el encuadre (center+zoom). No genera el PNG.
- **Canvas `buildRouteMapImage` = renderer (output).** El stitcher de tiles OSM
  ya existente produce el PNG estático que va al PDF (jsPDF) y al adjunto de
  SharePoint. Leaflet no puede entrar directo a jsPDF, por eso el renderer se
  mantiene y se reutiliza.

```
draft coords ──▶ MapaEditor (Leaflet: markers + polyline)
     ▲                   │ drag / +punto / borrar
     └──── setDraft ◀─────┘   (bidireccional: editar coords en el form mueve el marker)
draft coords + vista(center,zoom) ──▶ buildRouteMapImage() ──▶ PNG ──▶ PDF + adjunto
```

## Componentes

### 1. `src/components/MapaEditor.tsx` (nuevo)

Componente React que envuelve un mapa Leaflet. **Lazy-loaded** (igual que
`pdfGenerator`) para no inflar el bundle inicial; Leaflet (~42 KB gzip) y su CSS
se cargan solo cuando el componente monta.

**Props (interfaz con el form):**

```ts
type PointRef =
  | { kind: "origen" }
  | { kind: "destino" }
  | { kind: "tranq1" }
  | { kind: "tranquera"; id: string }
  | { kind: "bateria"; id: string };

interface MapaEditorProps {
  points: EditablePoint[];          // derivados del draft (lat/lon/label/kind/ref)
  onMovePoint: (ref: PointRef, c: { lat: number; lon: number }) => void;
  onAddTranquera: (c: { lat: number; lon: number }) => void;
  onAddBateria: (c: { lat: number; lon: number }) => void;
  onDeletePoint: (ref: PointRef) => void;   // no-op para origen/destino
  onViewChange?: (v: { lat: number; lon: number; zoom: number }) => void;
}
```

**Responsabilidades:**

- Inicializa `L.map` con `L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 })`.
- Marcadores con **`L.divIcon`** (HTML+CSS, círculo de color con etiqueta) — sin
  archivos de imagen, evita el 404 de los iconos default de Leaflet bajo el base
  path de GitHub Pages.
  - Colores: origen `#1a7f3c` (O), destino `#c0271f` (D), tranquera `#0e4d73`
    (número), batería `#7c3aed` (B#). Reusa la paleta del renderer.
- `marker.options.draggable = true`; en `dragend` → `onMovePoint(ref, latlng)`.
- Popup por marcador con botón **Quitar** → `onDeletePoint(ref)`. Origen/destino
  sin botón Quitar.
- **Barra de modos** (botones React sobre el contenedor del mapa): estado local
  `modo: "mover" | "add-tranquera" | "add-bateria"`. En modos `add-*`, el handler
  `map.on("click")` llama `onAddTranquera/Bateria(latlng)` y vuelve a `mover`.
- **Polilínea** de ruta: `L.polyline` recomputada de la cadena (sin baterías);
  casing blanco + línea navy (mismo estilo visual que el renderer).
- **Sincronización externa:** un `useEffect` keyed por la firma de `points`
  (`lat,lon` concatenados) reconcilia posiciones/altas/bajas de markers cuando las
  coords cambian desde el form, GPS o autollenado de base (bidireccional).
- **Reporte de vista:** `map.on("moveend zoomend")` → `onViewChange` (debounced
  ~300 ms) para que el PNG exportado matchee el encuadre del usuario.
- **Cleanup:** `map.remove()` en el unmount del `useEffect`.
- **Sin coords aún:** centra en Base Cipolletti (`-38.9578, -67.9745`), zoom ~11,
  sin markers; el usuario agrega por GPS/toque.

### 2. `src/lib/routeMap.ts` (extender)

Firma:

```ts
export async function buildRouteMapImage(
  points: MapPoint[],
  view?: { lat: number; lon: number; zoom: number }
): Promise<string | null>
```

- Si `view` viene: usa ese `center` y `zoom` (omite `fitZoom`). El stitch de
  tiles OSM ya centra sobre `center`/`zoom`; markers y ruta proyectan con la misma
  `projX/projY`, así que quedan alineados.
- Si no viene: comportamiento actual (auto-fit). Retro-compatible.

### 3. `src/components/HojaRutaForm.tsx` (modificar)

- Reemplazar la sección actual (`<img src={mapaRutaUrl}>` + botón "Generar mapa")
  por `<Suspense><MapaEditor .../></Suspense>` lazy.
- Mantener el estado `mapaRutaUrl` y la nueva `mapaView: {lat,lon,zoom} | null`.
- Derivar `points` (EditablePoint[]) del draft (extraer el mapeo del `routePoints`
  memo actual, agregando el `ref` de cada punto).
- Handlers que el editor invoca → `setDraft` (mover/agregar/borrar) reutilizando
  los patchers existentes (`patchTranquera`, `patchBateria`, etc.) y los setters
  de origen/destino/tranq1.
- El PNG (`mapaRutaUrl`) se genera al **enviar** y para la **vista previa PDF**
  llamando `buildRouteMapImage(routePoints, mapaView ?? undefined)`. Se puede
  mantener además la auto-generación con debounce para preview en pantalla.

## Flujo de datos

1. El usuario edita coords (form o arrastrando en el mapa) → `draft` actualizado.
2. `MapaEditor` refleja los markers desde `draft`; el form refleja coords desde
   `draft`. Fuente de verdad única: `draft`.
3. Al enviar/preview: `buildRouteMapImage(points, view)` → PNG → adjunto + PDF.

## Manejo de errores / offline

- Leaflet va bundleado (sin red para la lib). Tiles offline → Leaflet muestra
  gris, pero el editor sigue funcionando por coordenadas.
- El export usa el renderer canvas, que ya cae a **esquema sin conexión** si los
  tiles fallan (CORS/red).
- Sin DOM (SSR): no aplica (SPA cliente).

## Dependencias nuevas

- `leaflet` (runtime)
- `@types/leaflet` (dev)
- Import de `leaflet/dist/leaflet.css` dentro de `MapaEditor` (Vite lo bundlea).

## Política de uso OSM

Volumen bajo (herramienta interna): aceptable según la tile usage policy de OSM.
Atribución "© OpenStreetMap contributors" visible en el control de Leaflet y en
el footer del PNG renderizado. Sin API key.

## Testing

- `npm run build` (tsc --noEmit + vite build) sin errores.
- Manual: arrastrar markers, agregar tranquera/batería por modo, borrar por popup,
  verificar que el form refleja las coords y viceversa, confirmar que el PNG
  exportado matchee el encuadre y se embeba en el PDF.

## YAGNI (explícitamente fuera de alcance)

- Ruteo vial OSRM / por calles.
- Geocoder / buscador de direcciones.
- Persistir múltiples vistas o capas.
```
