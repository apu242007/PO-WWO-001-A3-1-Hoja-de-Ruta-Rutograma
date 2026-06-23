# PO-WWO-001-A3-1 DTM · Hoja de Ruta / Rutograma

SPA pública (sin login) para relevar la **hoja de ruta / rutograma** de un traslado y
enviarla a SharePoint vía Power Automate, con PDF + email de notificación.

🌐 **Live (modo demo hasta cargar el flow):** https://apu242007.github.io/PO-WWO-001-A3-1-Hoja-de-Ruta-Rutograma/
📦 **Repo:** https://github.com/apu242007/PO-WWO-001-A3-1-Hoja-de-Ruta-Rutograma

Stack: **React 18 + Vite + TypeScript** → **Power Automate HTTP trigger** → **SharePoint Lists**
+ **Outlook V2**. Deploy en **GitHub Pages**. Sigue la skill `spa-sharepoint-power-automate`.

```
[Visitante] --POST JSON--> [Power Automate] --> Create item (cabecera)
                                            --> Create item × N (detalle)
                                            --> Add attachment × N (PDF, firma, fotos)
                                            --> Send email V2
```

## Estructura

```
web-app/                 React + Vite SPA
  src/
    types.ts             modelo de datos (16 secciones, 4 repeat sections)
    components/HojaRutaForm.tsx   formulario completo
    components/SignaturePad.tsx   firma (pointer events)
    lib/pdfGenerator.ts  PDF jsPDF + autotable + QR
    lib/format.ts        parse/format es-AR
    lib/imageUtils.ts    compresión de imágenes
    lib/draftStorage.ts  autosave localStorage (versionado)
    lib/preparadorProfile.ts  identidad persistente del preparador
    services/uploadHojaRuta.ts  payload + POST + modo demo
sharepoint/Setup-AllColumns-HojaRuta.ps1   columnas idempotentes (UTF-8)
power-automate/Flow-HojaRuta.md            diseño del flow (fuente de verdad)
.github/workflows/deploy-pages.yml         deploy a GitHub Pages
```

## Secciones del formulario (16/16 del relevamiento)

1. Datos principales · 2. Cliente · 3. Encabezado del rutograma · 4. Segundo paso
+ altura (alerta carga > 4,40 m) · 5–6. 1ª tranquera + diagrama · 7. Más tranqueras +
tramos (repeat) · 8. Puntos críticos por tramo (multiple choice) · 9. Más tramos +
interferencias aéreas (repeat) · 10. Otros yacimientos / rutas · 11. Plan ·
12. Finalización + registro de cargas · 13–14. Cargas específicas (repeat) ·
15. Verificaciones obligatorias · 16. Declaración + firma.

Repeat sections: **tranqueras**, **tramos** (con fotos + puntos críticos), **interferencias**, **cargas**.

## Build order (nuevo entorno)

1. **Crear las 2 listas en SharePoint (UI)** — REST de creación está bloqueado:
   `HojaRutaRutograma` (cabecera) y `HojaRutaItems` (detalle).
2. **Correr** `sharepoint/Setup-AllColumns-HojaRuta.ps1` (device code; ingresás el código una vez).
3. **Crear el lookup** `HojaRuta` en `HojaRutaItems` (UI → Búsqueda → `HojaRutaRutograma` → `Título`).
4. **Armar el flow** siguiendo `power-automate/Flow-HojaRuta.md`. Copiar la URL del trigger.
5. **Secrets de GitHub**: `VITE_POWER_AUTOMATE_URL` (obligatorio) y `VITE_TACKER_KEY` (opcional).
6. **Push a `main`** → el workflow despliega a Pages.
7. **Probar end-to-end en un celular real**: enviar, verificar item + adjuntos + detalle + email.

## Desarrollo local

```bash
cd web-app
npm install
npm run dev      # modo demo si no hay VITE_POWER_AUTOMATE_URL: valida + genera PDF, no envía
npm run build    # tsc --noEmit + vite build
```

## Supuestos elegidos (cambiá si hace falta)

| Cosa | Valor por defecto |
|---|---|
| Prefijo de folio | `HR-YYYYMMDD-NNNN` |
| Repo / `VITE_BASE` | `/PO-WWO-001-A3-1-Hoja-de-Ruta-Rutograma/` |
| Sitio SP | `tackersrl505.sharepoint.com/sites/TODOTACKER480` |
| Lista cabecera / detalle | `HojaRutaRutograma` / `HojaRutaItems` |
| Email de notificación | `jcastro@tackertools.com` (sólo en el flow) |

> Si cambiás el nombre del repo, actualizá `VITE_BASE` en `.github/workflows/deploy-pages.yml`.

## Seguridad

Endpoint **público sin login** (skill §1). Las variables `VITE_*` viajan en el bundle: la
URL del trigger y `x-tacker-key` **no son secretos** — son un “speed bump” antibot. El secreto
real (conexiones SP/Outlook) vive sólo dentro del flow. La pantalla de éxito NO expone el email
interno de notificación.

## PDF y acentos

El PDF usa la fuente built-in de jsPDF, que no es UTF-8 confiable, así que el texto del PDF se
**transcribe a ASCII** (`Inspección`→`Inspeccion`). El item de SharePoint y el email conservan
los acentos (UTF-8 de punta a punta). Para acentos perfectos en el PDF, embeber una TTF
(`addFileToVFS` + `addFont`) — ver skill §5.

## Limitaciones que NO se automatizan

Crear listas SP por REST · login Microsoft (device code) · crear el flow · crear lookup por REST.
Todas requieren la UI / un humano (ver skill §10 y tabla en `CLAUDE.md`).
