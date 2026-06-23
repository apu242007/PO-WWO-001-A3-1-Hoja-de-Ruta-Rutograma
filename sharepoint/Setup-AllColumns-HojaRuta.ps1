<#
============================================================================
 PO-WWO-001-A3-1 DTM - HOJA DE RUTA / RUTOGRAMA
 Idempotent SharePoint column setup (device code auth, UTF-8 byte body).
 Skill: spa-sharepoint-power-automate §10.
----------------------------------------------------------------------------
 PRE-REQS (do these in the SharePoint UI first — REST list creation is blocked):
   1. Create list "HojaRutaRutograma"  (cabecera)
   2. Create list "HojaRutaItems"      (detalle hijo)
   Use site -> + New -> List -> Blank, or the ?npsAction=createList URL.
 AFTER running this script:
   3. Create the LOOKUP column "HojaRuta" on HojaRutaItems (child) via UI
      (Lookup -> parent list HojaRutaRutograma -> column Title).
============================================================================
#>

[CmdletBinding()]
param(
  [string]$SiteUrl     = "https://tackersrl505.sharepoint.com/sites/TODOTACKER480",
  [string]$HeaderList  = "HojaRutaRutograma",
  [string]$ItemsList   = "HojaRutaItems"
)

$ErrorActionPreference = "Stop"
$ClientId = "9bc3ab49-b65d-410a-85ad-de819febfddc"   # SharePoint Online Management Shell (pre-consented)
$uri      = [System.Uri]$SiteUrl
$Hostname = $uri.Host
$Resource = "https://$Hostname"
$ApiSP    = "$SiteUrl/_api"

# ---------------------------------------------------------------------------
# Device code auth (resource-based v1 flow — no admin consent needed)
# ---------------------------------------------------------------------------
function Get-AccessToken {
  $dcBody = "client_id=$ClientId&resource=$Resource"
  $dc = Invoke-RestMethod -Method POST -Uri "https://login.microsoftonline.com/common/oauth2/devicecode" -Body $dcBody
  Write-Host ""
  Write-Host "==================================================================" -ForegroundColor Cyan
  Write-Host " ABRI:   $($dc.verification_url)" -ForegroundColor Yellow
  Write-Host " CODIGO: $($dc.user_code)"        -ForegroundColor Green
  Write-Host "==================================================================" -ForegroundColor Cyan
  Write-Host ""
  $deadline = (Get-Date).AddSeconds([int]$dc.expires_in)
  do {
    Start-Sleep -Seconds 5
    try {
      $tok = Invoke-RestMethod -Method POST -Uri "https://login.microsoftonline.com/common/oauth2/token" `
        -Body "grant_type=urn:ietf:params:oauth:grant-type:device_code&client_id=$ClientId&code=$($dc.device_code)"
      return $tok.access_token
    } catch {
      $msg = $_.ErrorDetails.Message
      if ($msg -notmatch "authorization_pending" -and $msg -notmatch "slow_down") { throw }
    }
  } while ((Get-Date) -lt $deadline)
  throw "Tiempo agotado esperando el device code."
}

$token = Get-AccessToken
$H = @{ Authorization = "Bearer $token"; Accept = "application/json;odata=verbose" }

function Invoke-SP {
  param([string]$Method, [string]$Url, [object]$Body)
  $headers = @{}; foreach ($k in $H.Keys) { $headers[$k] = $H[$k] }
  if ($Body) {
    $json  = ($Body | ConvertTo-Json -Depth 10)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)   # UTF-8 byte body (accents!)
    $headers["Content-Type"] = "application/json;odata=verbose;charset=utf-8"
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers -Body $bytes
  }
  return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers
}

# ---------------------------------------------------------------------------
# Resolve real list Title (URL slug may differ from display Title)
# ---------------------------------------------------------------------------
function Resolve-ListTitle {
  param([string]$Hint)
  try { Invoke-SP GET "$ApiSP/web/lists/getbytitle('$Hint')?`$select=Title" | Out-Null; return $Hint } catch {}
  $all = Invoke-SP GET "$ApiSP/web/lists?`$select=Title&`$filter=Hidden eq false"
  $match = $all.d.results | Where-Object { $_.Title -replace '[\s\-_]', '' -ieq ($Hint -replace '[\s\-_]', '') }
  if ($match) { return $match.Title }
  throw "No encuentro la lista '$Hint'. Creala en la UI primero."
}

$HeaderTitle = Resolve-ListTitle $HeaderList
$ItemsTitle  = Resolve-ListTitle $ItemsList
Write-Host "Cabecera: '$HeaderTitle'   Items: '$ItemsTitle'" -ForegroundColor Cyan

function Field-Exists {
  param([string]$ListTitle, [string]$Internal)
  try {
    Invoke-SP GET "$ApiSP/web/lists/getbytitle('$ListTitle')/fields/getbyinternalnameortitle('$Internal')" | Out-Null
    return $true
  } catch { return $false }
}

# Generic field (Text=2, Note=3, DateTime=4, Number=9, Boolean=8)
function Ensure-Field {
  param([string]$ListTitle, [string]$Internal, [string]$Display, [int]$Kind)
  if (Field-Exists $ListTitle $Internal) { Write-Host "  = $Internal" -ForegroundColor DarkGray; return }
  $body = @{ '__metadata' = @{ type = "SP.Field" }; Title = $Internal; FieldTypeKind = $Kind }
  Invoke-SP POST "$ApiSP/web/lists/getbytitle('$ListTitle')/fields" $body | Out-Null
  # display name (may carry accents) set via MERGE
  if ($Display -and $Display -ne $Internal) {
    Invoke-SP-Merge $ListTitle $Internal @{ '__metadata' = @{ type = "SP.Field" }; Title = $Display }
  }
  Write-Host "  + $Internal ($Display)" -ForegroundColor Green
}

function Invoke-SP-Merge {
  param([string]$ListTitle, [string]$Internal, [object]$Body)
  $headers = @{}; foreach ($k in $H.Keys) { $headers[$k] = $H[$k] }
  $headers["Content-Type"]  = "application/json;odata=verbose;charset=utf-8"
  $headers["X-HTTP-Method"] = "MERGE"
  $headers["IF-MATCH"]      = "*"
  $json  = ($Body | ConvertTo-Json -Depth 10)
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $url = "$ApiSP/web/lists/getbytitle('$ListTitle')/fields/getbyinternalnameortitle('$Internal')"
  Invoke-RestMethod -Method POST -Uri $url -Headers $headers -Body $bytes | Out-Null
}

function Ensure-DateTime {
  param([string]$ListTitle, [string]$Internal, [string]$Display, [bool]$WithTime = $true)
  if (Field-Exists $ListTitle $Internal) { Write-Host "  = $Internal" -ForegroundColor DarkGray; return }
  $body = @{
    '__metadata'    = @{ type = "SP.FieldDateTime" }
    FieldTypeKind   = 4
    Title           = $Internal
    DisplayFormat   = ($(if ($WithTime) { 1 } else { 0 }))   # 0=DateOnly 1=DateTime
  }
  Invoke-SP POST "$ApiSP/web/lists/getbytitle('$ListTitle')/fields" $body | Out-Null
  if ($Display -and $Display -ne $Internal) {
    Invoke-SP-Merge $ListTitle $Internal @{ '__metadata' = @{ type = "SP.FieldDateTime" }; Title = $Display }
  }
  Write-Host "  + $Internal (DateTime)" -ForegroundColor Green
}

function Ensure-Choice {
  param([string]$ListTitle, [string]$Internal, [string]$Display, [string[]]$Choices)
  if (Field-Exists $ListTitle $Internal) {
    Write-Host "  = $Internal (verificar choices)" -ForegroundColor DarkGray; return
  }
  $body = @{
    '__metadata'  = @{ type = "SP.FieldChoice" }
    FieldTypeKind = 6
    Title         = $Internal
    Choices       = @{ results = $Choices }
    EditFormat    = 0
    FillInChoice  = $false
  }
  Invoke-SP POST "$ApiSP/web/lists/getbytitle('$ListTitle')/fields" $body | Out-Null
  if ($Display -and $Display -ne $Internal) {
    Invoke-SP-Merge $ListTitle $Internal @{ '__metadata' = @{ type = "SP.FieldChoice" }; Title = $Display }
  }
  Write-Host "  + $Internal (Choice)" -ForegroundColor Green
}

# ===========================================================================
#  CABECERA — HojaRutaRutograma
#  (Title = folio, ya existe)
# ===========================================================================
Write-Host "`n--- Cabecera ---" -ForegroundColor Cyan

# Text (FieldTypeKind 2)
$textCols = @(
  @("EquipoSitio","Equipo / Sitio"),
  @("PreparadaPor","Preparada por"),
  @("Ubicacion","Ubicacion"),
  @("Cliente","Cliente"),
  @("ClienteOtro","Cliente (otro)"),
  @("Origen","Origen"),
  @("Destino","Destino"),
  @("DistanciaTotalKm","Distancia total (km)"),
  @("InspectorResponsable","Inspector / Responsable"),
  @("PasoBateria1","Paso por Bateria 1"),
  @("PasoBateria2","Paso por Bateria 2"),
  @("YacimientoCircula","Yacimiento por el que circula"),
  @("RutasCircula","Rutas por las que circula"),
  @("RecursosFlota","Recursos / flota asignada"),
  @("PlanHoraInicio","Plan - hora de inicio")
)
foreach ($c in $textCols) { Ensure-Field $HeaderTitle $c[0] $c[1] 2 }

# Number (9)
$numCols = @(
  @("DNI","DNI"),
  @("AlturaMaximaCarga","Altura maxima de la carga (mts)"),
  @("Distancia1erTranquera","Distancia a la 1er tranquera (km)"),
  @("CantTranqueras","Cantidad de tranqueras"),
  @("CantTramos","Cantidad de tramos"),
  @("CantInterferencias","Cantidad de interferencias"),
  @("CantCargas","Cantidad de cargas")
)
foreach ($c in $numCols) { Ensure-Field $HeaderTitle $c[0] $c[1] 9 }

# DateTime (4)
Ensure-DateTime $HeaderTitle "Realizada"               "Realizada"                              $true
Ensure-DateTime $HeaderTitle "InicioProgramado"        "Fecha/hora inicio programada"           $true
Ensure-DateTime $HeaderTitle "PlanFechaInicio"         "Plan - fecha de inicio (estimada)"      $false
Ensure-DateTime $HeaderTitle "FechaFinalizacion"       "Fecha/hora finalizacion (estimada)"     $true
Ensure-DateTime $HeaderTitle "FirmaFecha"              "Fecha de firma"                         $false

# Choice (6)
Ensure-Choice $HeaderTitle "UnidadRecorrido"      "Unidad utilizada para recorrido" @("#318","#122","#321")
Ensure-Choice $HeaderTitle "TieneGuardaganado1"   "Tiene guardaganado (1ra)"        @("Si","No")
Ensure-Choice $HeaderTitle "EstadoGuardaganado1"  "Estado guardaganado (1ra)"       @("Buena","Razonable","Deficiente","N/A")
Ensure-Choice $HeaderTitle "CirculaOtroYac"       "Circula por otro yacimiento"     @("Si","No")
Ensure-Choice $HeaderTitle "CirculaRutas"         "Circula por rutas estatales/ciudad" @("Si","No")

# Boolean (8)
Ensure-Field $HeaderTitle "Declaracion" "Declaracion aceptada" 8

# ===========================================================================
#  ITEMS — HojaRutaItems
#  (Title = etiqueta del item)  +  lookup HojaRuta creado a mano en la UI
# ===========================================================================
Write-Host "`n--- Items (detalle) ---" -ForegroundColor Cyan
Ensure-Field $ItemsTitle "CategoriaItem" "Seccion"      2   # internal distinto de 'Categoria' (conflicto hidden)
Ensure-Field $ItemsTitle "Comentarios"   "Comentarios"  3   # Note / multiline
Ensure-Field $ItemsTitle "Orden"         "Orden"        9

Write-Host "`nLISTO. Falta SOLO el lookup 'HojaRuta' en '$ItemsTitle' (crear desde la UI):" -ForegroundColor Yellow
Write-Host "  $ItemsTitle -> + Agregar columna -> Busqueda -> lista '$HeaderTitle' -> columna 'Titulo'" -ForegroundColor Yellow
