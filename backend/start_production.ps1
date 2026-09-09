#Requires -Version 5.1
<#
.SYNOPSIS
    start_production.ps1 -- Nebulae ERP Backend (Produccion/Staging) - Windows
.DESCRIPTION
    Lanzador productivo de Uvicorn con health check fail-closed.
    Garantias:
      - Carga variables de entorno desde ENV_FILE (python-dotenv o linea a linea)
      - Ejecuta preflight de DB antes de levantar Uvicorn
      - Lanza Uvicorn y captura su PID
      - Verifica /health con timeout y reintentos
      - Si health falla: termina proceso, limpia PID, exit != 0
      - No imprime secretos ni DATABASE_URL en logs
.PARAMETER EnvFile
    Archivo .env a cargar (defecto: .env)
.PARAMETER Port
    Puerto de escucha (defecto: 5000)
.PARAMETER Host
    Host de escucha (defecto: 127.0.0.1)
.PARAMETER Workers
    Numero de workers Uvicorn (defecto: 2)
.PARAMETER LogLevel
    Nivel de log (defecto: info)
.PARAMETER HealthTimeout
    Segundos max esperando health check (defecto: 30)
#>
param(
    [string]$EnvFile      = $(if ($null -eq $env:ENV_FILE   -or $env:ENV_FILE   -eq '') { ".env"      } else { $env:ENV_FILE }),
    [int]   $Port         = $(if ($null -eq $env:PORT       -or $env:PORT       -eq '') { 5000        } else { [int]$env:PORT }),
    [string]$HostBind     = $(if ($null -eq $env:HOST       -or $env:HOST       -eq '') { "127.0.0.1" } else { $env:HOST }),
    [int]   $Workers      = $(if ($null -eq $env:WORKERS    -or $env:WORKERS    -eq '') { 2           } else { [int]$env:WORKERS }),
    [string]$LogLevel     = $(if ($null -eq $env:LOG_LEVEL  -or $env:LOG_LEVEL  -eq '') { "info"      } else { $env:LOG_LEVEL }),
    [int]   $HealthTimeout = 30
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$DEV_SECRET  = "super-secret-key-for-development-change-me"
$PID_FILE    = "nebulae_backend.pid"
$PYTHON      = "venv\Scripts\python.exe"

Write-Host "==================================================================="
Write-Host " Nebulae ERP Backend -- Arranque (Windows PowerShell)"
Write-Host " Ambiente: $(if ($null -eq $env:NEBULAE_ENV -or $env:NEBULAE_ENV -eq '') { 'production' } else { $env:NEBULAE_ENV })"
Write-Host " Host:     ${HostBind}:${Port}"
Write-Host " Workers:  ${Workers}"
Write-Host "==================================================================="

# ---------------------------------------------------------------------------
# 1. Cargar ENV_FILE via python-dotenv (maneja espacios, =, comillas)
# ---------------------------------------------------------------------------
if (Test-Path $EnvFile) {
    Write-Host "[INFO] Cargando entorno desde: $EnvFile"
    # Usamos python-dotenv para parsear correctamente el .env
    $loadResult = & $PYTHON -c @"
import sys
try:
    from dotenv import dotenv_values
    vals = dotenv_values('$EnvFile')
    for k, v in vals.items():
        # Solo imprimir KEY=VALUE sin exponer secretos (values enmascarados)
        safe = '***' if any(s in k.upper() for s in ('SECRET','PASSWORD','TOKEN','KEY','URL')) else v
        print(f'SET {k}={safe}', file=sys.stderr)
        # Escribir a stdout para que el script los capture
        print(f'{k}={v}')
except ImportError:
    # Fallback: parseo linea a linea
    with open('$EnvFile') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, _, v = line.partition('=')
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            print(f'{k}={v}')
"@
    if ($LASTEXITCODE -eq 0 -and $loadResult) {
        foreach ($line in $loadResult -split "`n") {
            $line = $line.Trim()
            if ($line -and $line -match "^([^=]+)=(.*)$") {
                $k = $Matches[1].Trim(); $v = $Matches[2].Trim()
                if (-not [System.Environment]::GetEnvironmentVariable($k)) {
                    [System.Environment]::SetEnvironmentVariable($k, $v, "Process")
                }
            }
        }
    }
} else {
    Write-Warning "[WARN] $EnvFile no encontrado. Usando variables del entorno actual."
}

# ---------------------------------------------------------------------------
# 2. Verificar SECRET_KEY
# ---------------------------------------------------------------------------
if (-not $env:SECRET_KEY) {
    Write-Error "[ERROR] SECRET_KEY no esta definida. Abortando."
    exit 1
}
if ($env:SECRET_KEY -eq $DEV_SECRET) {
    Write-Error "[ERROR] SECRET_KEY tiene el valor de desarrollo. Abortando."
    exit 1
}
Write-Host "[INFO] SECRET_KEY: presente [VALOR OCULTO]"

# ---------------------------------------------------------------------------
# 3. Verificar DATABASE_URL (no imprimir, solo confirmar presencia)
# ---------------------------------------------------------------------------
if (-not $env:DATABASE_URL) {
    Write-Error "[ERROR] DATABASE_URL no esta definida. Abortando."
    exit 1
}
# Mostrar URL enmascarada via Python (lee desde os.environ, no interpola)
$masked = & $PYTHON -c @"
import os
from urllib.parse import urlparse
u = os.environ.get('DATABASE_URL', '')
if u:
    try:
        p = urlparse(u)
        print(f'{p.scheme}://***:***@{p.hostname}:{p.port}{p.path}')
    except Exception:
        print('<URL no analizable>')
"@
Write-Host "[INFO] DATABASE_URL -> $masked"

# ---------------------------------------------------------------------------
# 4. Verificar Python del venv
# ---------------------------------------------------------------------------
if (-not (Test-Path $PYTHON)) {
    Write-Error "[ERROR] No se encontro $PYTHON. Verificar que el venv este creado."
    exit 1
}
$pyVer = & $PYTHON --version 2>&1
Write-Host "[INFO] Python: $pyVer"

# ---------------------------------------------------------------------------
# 5. Preflight de base de datos
# ---------------------------------------------------------------------------
Write-Host "[INFO] Ejecutando preflight de base de datos..."
& $PYTHON -m app.core.preflight
if ($LASTEXITCODE -ne 0) {
    Write-Error "[ERROR] Preflight fallo. El backend no puede iniciar."
    exit 2
}
Write-Host "[INFO] Preflight OK."

# ---------------------------------------------------------------------------
# 6. Iniciar Uvicorn como proceso en segundo plano
# ---------------------------------------------------------------------------
Write-Host "[INFO] Iniciando Uvicorn (sin --reload)..."
$uvicornArgs = @(
    "-m", "uvicorn", "main:app",
    "--host", $HostBind,
    "--port", $Port,
    "--workers", $Workers,
    "--log-level", $LogLevel,
    "--access-log",
    "--timeout-keep-alive", "30"
)

$procInfo = New-Object System.Diagnostics.ProcessStartInfo
$procInfo.FileName = (Resolve-Path $PYTHON).Path
$procInfo.Arguments = $uvicornArgs -join " "
$procInfo.UseShellExecute = $false
$procInfo.RedirectStandardOutput = $false
$procInfo.RedirectStandardError = $false
$procInfo.WorkingDirectory = (Get-Location).Path

$proc = [System.Diagnostics.Process]::Start($procInfo)
$uvicornPID = $proc.Id

$uvicornPID | Out-File -FilePath $PID_FILE -Encoding ascii -NoNewline
Write-Host "[INFO] PID: $uvicornPID registrado en $PID_FILE"

# ---------------------------------------------------------------------------
# 7. Health check con timeout — FAIL-CLOSED
# ---------------------------------------------------------------------------
Write-Host "[INFO] Esperando health check en http://${HostBind}:${Port}/health ..."
$healthy = $false
$healthUrl = "http://${HostBind}:${Port}/health"

for ($i = 1; $i -le $HealthTimeout; $i++) {
    Start-Sleep -Seconds 1
    try {
        $resp = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 3 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $body = $resp.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($body.status -eq "ok") {
                Write-Host "[INFO] Health check OK (${i}s) - status: ok"
                $healthy = $true
                break
            }
        }
    } catch {
        # todavia levantando
    }
}

if (-not $healthy) {
    Write-Error "[ERROR] Health check no respondio en ${HealthTimeout}s. Terminando Uvicorn..."
    try {
        Stop-Process -Id $uvicornPID -Force -ErrorAction SilentlyContinue
        # Esperar hasta 10s
        $proc.WaitForExit(10000) | Out-Null
        if (-not $proc.HasExited) {
            try {
                $p2 = [System.Diagnostics.Process]::GetProcessById($uvicornPID)
                $p2.Kill()
            } catch { }
        }
    } catch { }
    Remove-Item -Path $PID_FILE -ErrorAction SilentlyContinue
    Write-Error "[ERROR] Backend terminado por health check fallido. Exit code: 2."
    exit 2
}

# ---------------------------------------------------------------------------
# 8. Esperar al proceso (foreground)
# ---------------------------------------------------------------------------
Write-Host "[INFO] Backend activo. Esperando fin del proceso (Ctrl+C para detener)..."
$proc.WaitForExit()
$exitCode = $proc.ExitCode
Write-Host "[INFO] Uvicorn termino con exit code: $exitCode"
Remove-Item -Path $PID_FILE -ErrorAction SilentlyContinue
exit $exitCode