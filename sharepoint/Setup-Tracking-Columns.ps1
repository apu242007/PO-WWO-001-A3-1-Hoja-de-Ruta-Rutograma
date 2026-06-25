<#
============================================================================
 PO-WWO-001-A3-1 DTM - HOJA DE RUTA / RUTOGRAMA
 Tracking GPS en vivo - columnas de la lista "Tracking" (pings crudos).
 Idempotent SharePoint column setup (device code auth, UTF-8 byte body).
 Skill: spa-sharepoint-power-automate §10.
----------------------------------------------------------------------------
 PRE-REQS (en la UI de SharePoint primero - REST list creation esta bloqueada):
   1. Crear lista "Tracking" (site -> + New -> List -> Blank, o ?npsAction=createList)
 Esta lista guarda un item por ping GPS:
   Title=folio, Lat, Lng, Timestamp, Acc, VehicleId
 PRIVACIDAD: son posiciones de personas/vehiculos. Definir retencion y acceso
 (ver power-automate/Flow-Track.md). No exponer la lista a anonimos.
============================================================================
#>

[CmdletBinding()]
param(
  [string]$SiteUrl     = "https://tackersrl505.sharepoint.com/sites/TODOTACKER480",
  [string]$TrackList   = "Tracking"
)

$ErrorActionPreference = "Stop"
$ClientId = "9bc3ab49-b65d-410a-85ad-de819febfddc"   # SharePoint Online Management Shell (pre-consented)
$uri      = [System.Uri]$SiteUrl
$Hostname = $uri.Host
$Resource = "https://$Hostname"
$ApiSP    = "$SiteUrl/_api"

# ---------------------------------------------------------------------------
# Device code auth (resource-based v1 flow - no admin consent needed)
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
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)   # UTF-8 byte body
    $headers["Content-Type"] = "application/json;odata=verbose;charset=utf-8"
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers -Body $bytes
  }
  return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers
}

function Resolve-ListTitle {
  param([string]$Hint)
  try { Invoke-SP GET "$ApiSP/web/lists/getbytitle('$Hint')?`$select=Title" | Out-Null; return $Hint } catch {}
  $all = Invoke-SP GET "$ApiSP/web/lists?`$select=Title&`$filter=Hidden eq false"
  $match = $all.d.results | Where-Object { $_.Title -replace '[\s\-_]', '' -ieq ($Hint -replace '[\s\-_]', '') }
  if ($match) { return $match.Title }
  throw "No encuentro la lista '$Hint'. Creala en la UI primero."
}

function Field-Exists {
  param([string]$ListTitle, [string]$Internal)
  try {
    Invoke-SP GET "$ApiSP/web/lists/getbytitle('$ListTitle')/fields/getbyinternalnameortitle('$Internal')" | Out-Null
    return $true
  } catch { return $false }
}

# Generic field (Text=2, Note=3, Number=9)
function Ensure-Field {
  param([string]$ListTitle, [string]$Internal, [string]$Display, [int]$Kind)
  if (Field-Exists $ListTitle $Internal) { Write-Host "  = $Internal" -ForegroundColor DarkGray; return }
  $body = @{ '__metadata' = @{ type = "SP.Field" }; Title = $Internal; FieldTypeKind = $Kind }
  Invoke-SP POST "$ApiSP/web/lists/getbytitle('$ListTitle')/fields" $body | Out-Null
  Write-Host "  + $Internal ($Display)" -ForegroundColor Green
}

function Ensure-DateTime {
  param([string]$ListTitle, [string]$Internal)
  if (Field-Exists $ListTitle $Internal) { Write-Host "  = $Internal" -ForegroundColor DarkGray; return }
  $body = @{
    '__metadata'  = @{ type = "SP.FieldDateTime" }
    FieldTypeKind = 4
    Title         = $Internal
    DisplayFormat = 1   # DateTime
  }
  Invoke-SP POST "$ApiSP/web/lists/getbytitle('$ListTitle')/fields" $body | Out-Null
  Write-Host "  + $Internal (DateTime)" -ForegroundColor Green
}

# ===========================================================================
#  Tracking - un item por ping GPS
# ===========================================================================
$T = Resolve-ListTitle $TrackList
Write-Host "Lista Tracking: '$T'" -ForegroundColor Cyan

Ensure-Field    $T "Lat"       "Latitud"          9   # Number (decimal)
Ensure-Field    $T "Lng"       "Longitud"         9   # Number (decimal)
Ensure-DateTime $T "Timestamp"                        # DateTime (UTC)
Ensure-Field    $T "Acc"       "Precision (m)"    9   # Number
Ensure-Field    $T "VehicleId" "Unidad / Vehiculo" 2  # Text
Ensure-Field    $T "Folio"     "Folio hoja de ruta" 2 # Text

Write-Host ""
Write-Host "Listo. Columnas de Tracking aseguradas." -ForegroundColor Green
Write-Host "Title del item = folio del rutograma. Siguiente: armar el flow (power-automate/Flow-Track.md)." -ForegroundColor Yellow
