# Flow `Track` — ingesta de pings GPS (`POST /track`)

Segundo flow, independiente del de la hoja de ruta. Recibe **un ping GPS por
request** desde la SPA (modo tracking en vivo) y crea un item en la lista SP
`Tracking`. Cada hoja de ruta queda asociada por `folio` + `vehicle_id`.

> ⚠️ **Privacidad.** Esto almacena posiciones de personas/vehículos. Antes de
> activarlo: definir **retención** (borrado automático tras N días), **acceso
> restringido** a la lista (no anónimos, solo QHSE/flota), y dejarlo asentado.
> El endpoint es público (lo llama el browser) — protegerlo con `x-tacker-key`
> como mínimo (igual que el flow principal; es un speed bump, no un secreto).

## Contrato (lo que envía la SPA)

`lib/tracking.ts → postTrackPing()` hace `POST` con `Content-Type application/json`:

```json
{
  "lat": -38.95123,
  "lng": -67.97455,
  "timestamp": "2026-06-25T14:03:11.000Z",
  "acc": 8.4,
  "vehicle_id": "P-326 · AI-148-MB · Ford/Nueva Ranger ...",
  "folio": "HR-20260625-1234"
}
```

Header opcional `x-tacker-key`. La SPA solo envía si `VITE_TRACK_URL` está
configurada (si no, modo demo: no se envía nada).

## Lista SP `Tracking`

Columnas (las crea `sharepoint/Setup-Tracking-Columns.ps1`):

| Columna     | Tipo      | Origen JSON   |
|-------------|-----------|---------------|
| Title       | Text      | `folio`       |
| Lat         | Number    | `lat`         |
| Lng         | Number    | `lng`         |
| Timestamp   | DateTime  | `timestamp`   |
| Acc         | Number    | `acc`         |
| VehicleId   | Text      | `vehicle_id`  |
| Folio       | Text      | `folio`       |

## Construcción del flow (make.powerautomate.com)

Seguir el patrón del skill §9. Es más corto que el flow principal: **sin loops,
sin adjuntos, sin email** — solo trigger → (key check) → Create item → Response.

### 1) Trigger — `When a HTTP request is received`
| Campo | Valor |
|---|---|
| Who can trigger | Anyone |
| Method (advanced) | `POST` |
| Request Body JSON Schema | **VACÍO** |

Guardá y copiá la URL del trigger.

### 2) `Check_key` — Condition (anti-bot, recomendado)
`triggerOutputs()?['headers']?['x-tacker-key']` igual a `<TACKER_KEY>`.
Rama **If no** → Response `401` + Terminate (`Failed`). **If yes** → sigue.

### 3) `CreatePing` — SharePoint **Create item**
| Campo | Valor (pestaña `fx Expression`) |
|---|---|
| Site Address | `<SITE_URL>` |
| List Name | `Tracking` |
| Title | `triggerBody()?['folio']` |
| Lat | `if(equals(triggerBody()?['lat'], null), null, float(triggerBody()?['lat']))` |
| Lng | `if(equals(triggerBody()?['lng'], null), null, float(triggerBody()?['lng']))` |
| Timestamp | `coalesce(triggerBody()?['timestamp'], utcNow())` |
| Acc | `if(equals(triggerBody()?['acc'], null), null, float(triggerBody()?['acc']))` |
| VehicleId | `triggerBody()?['vehicle_id']` |
| Folio | `triggerBody()?['folio']` |

Defensive wrappers de tipos: skill §9 (Number con `float()`, DateTime con
`coalesce`).

### 4) `Respuesta` — Response
| Campo | Valor |
|---|---|
| Status Code | `200` |
| Body | `{ "ok": true }` |

> Devolver 200 rápido: la SPA dispara un POST por cada ping (cada ~10 s), best-effort.

### 5) Guardar + exportar
Save → copiar URL → guardarla como secret de build **`VITE_TRACK_URL`**
(y reutilizar `VITE_TACKER_KEY`). Export → Package `.zip` → commitear acá.

## Cableado en la SPA

`VITE_TRACK_URL` es la URL del trigger de este flow. Si está vacía, el tracking
funciona igual en el cliente (captura + snap a calles + adjunta al rutograma)
pero **no** persiste pings en SharePoint. Agregar en el workflow de deploy:

```yaml
env:
  VITE_TRACK_URL: ${{ secrets.VITE_TRACK_URL }}
```

## Retención (sugerido)

Una `Scheduled cloud flow` aparte: cada día, **Get items** de `Tracking` con
`Created lt addDays(utcNow(), -<N>)` → **Delete item** en loop. Documentar N
(p. ej. 90 días) según la política de datos personales acordada.
