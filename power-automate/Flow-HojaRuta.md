# Flow — Hoja de Ruta / Rutograma (PO-WWO-001-A3-1)

Power Automate **HTTP trigger** flow. Build it in `make.powerautomate.com`. There is
no public API for flows, so this doc IS the source of truth. After building, **Export →
Package (.zip)** and commit it next to this file.

> Reference: skill `spa-sharepoint-power-automate` §9 (flow build template). Always use the
> **`fx Expression`** tab — never drag chips from the Dynamic Content panel.

## Placeholders

| Token | Value |
|---|---|
| `<SITE_URL>` | `https://tackersrl505.sharepoint.com/sites/TODOTACKER480` |
| `<HEADER_LIST>` | `HojaRutaRutograma` (display Title — confirmá con el script) |
| `<CHILD_LIST>` | `HojaRutaItems` |
| `<FOLIO_PREFIX>` | `HR` |
| `<NOTIFY_EMAIL>` | `jcastro@tackertools.com` |
| `<TACKER_KEY>` | (opcional) valor de `x-tacker-key` — antibot, NO es secreto |

---

## Árbol final

```
When a HTTP request is received
├─ Check_key                ← opcional, 401 si no matchea
├─ Init_varFolio
├─ CreateHeaderItem         ← Create item en HojaRutaRutograma
├─ Respuesta (200)          ← ANTES de los loops (evita timeout 110s)
├─ Loop_detalle            (concurrency 20) → Create item HojaRutaItems
├─ Loop_attachments        (concurrency 1)  → Add attachment
└─ Send_email_V2           (run after = succeeded)
```

---

## 1) Trigger — *When a HTTP request is received*

| Campo | Valor |
|---|---|
| Who can trigger | Anyone |
| Method (advanced) | `POST` |
| Request Body JSON Schema | **VACÍO** (dejar en blanco — el SPA es la fuente de verdad) |

Al guardar aparece la URL → copiala como secret `VITE_POWER_AUTOMATE_URL`.

## 2) Check_key — Condition (opcional)

- Condición (`fx`): `triggerOutputs()?['headers']?['x-tacker-key']` **is equal to** `<TACKER_KEY>`
- Rama **If no**: Response `401` + Terminate (Failed).
- Si decidís no usar key, omití este paso (documentado).

## 3) Init_varFolio — Initialize variable

| Campo | Valor |
|---|---|
| Name | `varFolio` |
| Type | `String` |
| Value (`fx`) | `if(empty(triggerBody()?['folio']), concat('HR-', formatDateTime(utcNow(),'yyyyMMdd-HHmmss')), triggerBody()?['folio'])` |

## 4) CreateHeaderItem — SharePoint · Create item

Site `<SITE_URL>` · List `<HEADER_LIST>`. Renombrá la acción a **CreateHeaderItem**.

Mapeo de campos (pestaña `fx`, con wrapper defensivo por tipo — skill §9):

| Columna SP (internal) | Tipo | Expresión |
|---|---|---|
| Title | Text | `variables('varFolio')` |
| EquipoSitio | Text | `triggerBody()?['equipoSitio']` |
| PreparadaPor | Text | `triggerBody()?['preparadaPor']` |
| Ubicacion | Text | `triggerBody()?['ubicacion']` |
| Cliente | Text | `triggerBody()?['cliente']` |
| ClienteOtro | Text | `triggerBody()?['clienteOtro']` |
| Origen | Text | `triggerBody()?['origen']` |
| Destino | Text | `triggerBody()?['destino']` |
| DistanciaTotalKm | Text | `triggerBody()?['distanciaTotalKm']` |
| InspectorResponsable | Text | `triggerBody()?['inspectorResponsable']` |
| PasoBateria1 | Text | `triggerBody()?['pasoBateria1']` |
| PasoBateria2 | Text | `triggerBody()?['pasoBateria2']` |
| YacimientoCircula | Text | `triggerBody()?['yacimientoCircula']` |
| RutasCircula | Text | `triggerBody()?['rutasCircula']` |
| RecursosFlota | Text | `triggerBody()?['recursosFlota']` |
| PlanHoraInicio | Text | `triggerBody()?['planHoraInicio']` |
| DNI | Number | `if(equals(triggerBody()?['dni'], null), null, int(triggerBody()?['dni']))` |
| AlturaMaximaCarga | Number | `if(equals(triggerBody()?['alturaMaximaCarga'], null), null, float(triggerBody()?['alturaMaximaCarga']))` |
| Distancia1erTranquera | Number | `if(equals(triggerBody()?['distancia1erTranqueraKm'], null), null, float(triggerBody()?['distancia1erTranqueraKm']))` |
| CantTranqueras | Number | `if(equals(triggerBody()?['cantTranqueras'], null), null, int(triggerBody()?['cantTranqueras']))` |
| CantTramos | Number | `if(equals(triggerBody()?['cantTramos'], null), null, int(triggerBody()?['cantTramos']))` |
| CantInterferencias | Number | `if(equals(triggerBody()?['cantInterferencias'], null), null, int(triggerBody()?['cantInterferencias']))` |
| CantCargas | Number | `if(equals(triggerBody()?['cantCargas'], null), null, int(triggerBody()?['cantCargas']))` |
| Realizada | DateTime | `coalesce(triggerBody()?['realizada'], utcNow())` |
| InicioProgramado | DateTime | `if(empty(triggerBody()?['fechaHoraInicioProgramada']), null, triggerBody()?['fechaHoraInicioProgramada'])` |
| PlanFechaInicio | DateTime | `if(empty(triggerBody()?['planFechaInicio']), null, triggerBody()?['planFechaInicio'])` |
| FechaFinalizacion | DateTime | `if(empty(triggerBody()?['fechaHoraFinalizacion']), null, triggerBody()?['fechaHoraFinalizacion'])` |
| FirmaFecha | DateTime | `if(empty(triggerBody()?['firmaFecha']), null, triggerBody()?['firmaFecha'])` |
| UnidadRecorrido (Value) | Choice | `if(empty(triggerBody()?['unidadRecorrido']), null, triggerBody()?['unidadRecorrido'])` |
| TieneGuardaganado1 (Value) | Choice | `if(empty(triggerBody()?['tieneGuardaganado1']), null, replace(triggerBody()?['tieneGuardaganado1'],'í','i'))` |
| EstadoGuardaganado1 (Value) | Choice | `if(empty(triggerBody()?['estadoGuardaganado1']), null, triggerBody()?['estadoGuardaganado1'])` |
| CirculaOtroYac (Value) | Choice | `if(empty(triggerBody()?['circulaOtroYacimiento']), null, replace(triggerBody()?['circulaOtroYacimiento'],'í','i'))` |
| CirculaRutas (Value) | Choice | `if(empty(triggerBody()?['circulaRutasEstatales']), null, replace(triggerBody()?['circulaRutasEstatales'],'í','i'))` |
| Declaracion | Yes/No | `if(equals(triggerBody()?['declaracion'], null), false, bool(triggerBody()?['declaracion']))` |

> **Nota choices "Sí/No":** el SPA manda `"Sí"` (con tilde). Las choices del script se crearon
> como `Si`/`No` (sin tilde, ASCII-safe). El `replace(...,'í','i')` normaliza. Si preferís dejar
> la tilde, agregá `Sí` como choice válida en la columna y borrá el `replace`.

## 5) Respuesta — Response (ANTES de los loops)

| Campo | Valor |
|---|---|
| Status Code | `200` |
| Headers | `Content-Type` : `application/json` |
| Body (`fx`) | `{ "id": @{outputs('CreateHeaderItem')?['body/ID']}, "folio": "@{variables('varFolio')}" }` |

## 6) Loop_detalle — Apply to each + Create item (hijo)

| Campo | Valor |
|---|---|
| Select an output (`fx`) | `triggerBody()?['detalle']` |
| Settings ⚙️ Concurrency | ON, Degree = 20 (filas independientes) |

Dentro — **Create item**, List `<CHILD_LIST>`:

| Columna | Expresión |
|---|---|
| Title (`fx`) | `items('Loop_detalle')?['item']` |
| CategoriaItem (`fx`) | `items('Loop_detalle')?['categoria']` |
| Comentarios (`fx`) | `items('Loop_detalle')?['comentarios']` |
| Orden (`fx`) | `if(equals(items('Loop_detalle')?['orden'], null), null, int(items('Loop_detalle')?['orden']))` |
| **HojaRuta Id** (lookup) | `outputs('CreateHeaderItem')?['body/ID']` |

## 7) Loop_attachments — Apply to each + Add attachment

| Campo | Valor |
|---|---|
| Select an output (`fx`) | `triggerBody()?['attachments']` |
| Settings ⚙️ Concurrency | **ON, Degree = 1** (mismo item — evita Save Conflict) |

Dentro — **Add attachment**:

| Campo | Valor |
|---|---|
| Site Address | `<SITE_URL>` |
| List Name | `<HEADER_LIST>` |
| Id (`fx`) | `outputs('CreateHeaderItem')?['body/ID']` |
| File Name (`fx`) | `items('Loop_attachments')?['name']` |
| File Content (`fx`) | `base64ToBinary(items('Loop_attachments')?['contentBase64'])` |

> ⚠️ El **File Content** debe ser SOLO esa expresión binaria, sin objeto `{contentBytes,name}` y
> **sin** `\r\n` ni espacios al final (Peek code para verificar). Skill §9.

## 8) Send_email_V2 — Outlook (raíz, fuera de loops)

`⋯` → **Configure run after** → dejar solo `is successful` para CreateHeaderItem,
Loop_detalle y Loop_attachments.

| Campo | Valor |
|---|---|
| To | `<NOTIFY_EMAIL>` |
| Subject (`fx`) | `concat('🛣️ Hoja de Ruta ', variables('varFolio'), ' — ', triggerBody()?['origen'], ' a ', triggerBody()?['destino'])` |
| Body | HTML (ver abajo) |
| Advanced → Attachments → + Add | |
| Name (`fx`) | `triggerBody()?['attachments']?[0]?['name']` |
| Content (`fx`) | `base64ToBinary(triggerBody()?['attachments']?[0]?['contentBase64'])` |

### Body HTML (pegar en la pestaña code `</>` del editor de correo)

```
<div style="font-family:Segoe UI,Arial,sans-serif;color:#14222c">
  <div style="background:#0b3d5c;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0">
    <h2 style="margin:0">Hoja de Ruta / Rutograma</h2>
    <div style="opacity:.85;font-size:13px">PO-WWO-001-A3-1 DTM · Folio @{variables('varFolio')}</div>
  </div>
  <div style="border:1px solid #d7e0e6;border-top:none;padding:16px 18px;border-radius:0 0 8px 8px">
    <p><b>Equipo / Sitio:</b> @{triggerBody()?['equipoSitio']}</p>
    <p><b>Cliente:</b> @{triggerBody()?['cliente']}</p>
    <p><b>Origen → Destino:</b> @{triggerBody()?['origen']} → @{triggerBody()?['destino']}
       (@{triggerBody()?['distanciaTotalKm']})</p>
    <p><b>Inicio programado:</b>
       @{convertTimeZone(coalesce(triggerBody()?['fechaHoraInicioProgramada'], utcNow()),'UTC','Argentina Standard Time','dd/MM/yyyy HH:mm')}</p>
    <p><b>Inspector / Responsable:</b> @{triggerBody()?['inspectorResponsable']}</p>
    <p><b>Preparada por:</b> @{triggerBody()?['preparadaPor']} (DNI @{triggerBody()?['dni']})</p>
    <p><b>Unidad recorrido:</b> @{triggerBody()?['unidadRecorrido']}</p>
    <p><b>Altura máx. carga:</b> @{triggerBody()?['alturaMaximaCarga']} m
       @{if(greater(coalesce(float(triggerBody()?['alturaMaximaCarga']),0), 4.4),
            '<b style="color:#b91c1c">⚠️ CARGA ALTA (&gt; 4,40 m)</b>', '')}</p>
    <p><b>Resumen:</b> @{triggerBody()?['cantTranqueras']} tranqueras ·
       @{triggerBody()?['cantTramos']} tramos ·
       @{triggerBody()?['cantInterferencias']} interferencias ·
       @{triggerBody()?['cantCargas']} cargas</p>
    <p style="color:#5b6b76;font-size:12px">PDF completo adjunto.</p>
  </div>
</div>
```

## 9) Guardar + backup

Guardar el flow, copiar la URL del trigger (secret `VITE_POWER_AUTOMATE_URL`),
**Export → Package (.zip)** y commitear el `.zip` en esta carpeta.

---

## Pre-flight (leer en voz alta antes de guardar)

- [ ] Trigger schema **vacío**
- [ ] varFolio con fallback `concat('HR-', formatDateTime(utcNow(),'yyyyMMdd-HHmmss'))`
- [ ] Acción renombrada a `CreateHeaderItem`
- [ ] Todos los campos por `fx` (sin chips naranjas)
- [ ] `Respuesta` 200 ENTRE CreateHeaderItem y los loops
- [ ] Loop_attachments concurrency = 1
- [ ] Lookup del hijo apunta a `body/ID`, NO al Title
- [ ] Choices Sí/No: `replace(...,'í','i')` o agregar `Sí` a la columna
- [ ] Send_email fuera de loops, run-after = solo `is successful`
- [ ] URL del trigger guardada como secret + `.zip` commiteado
```
