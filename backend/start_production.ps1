#Requires -Version 5.1
<#
.SYNOPSIS
    Wrapper minimo para launch_production.py (PowerShell 5.1 compatible).

.DESCRIPTION
    Localiza el interprete Python del venv y delega TODA la logica al lanzador
    Python: carga de .env, validacion, preflight, health check y supervision.

.PARAMETER EnvFile
    Ruta al archivo de entorno. Default: .env (o variable ENV_FILE del proceso).

.PARAMETER Host
    Host de escucha de uvicorn. Default: 127.0.0.1 (o variable HOST del proceso).

.PARAMETER Port
    Puerto de escucha de uvicorn. Default: 5000 (o variable PORT del proceso).

.PARAMETER Workers
    Numero de workers de uvicorn. Default: 2 (o variable WORKERS del proceso).

.PARAMETER LogLevel
    Nivel de log de uvicorn. Default: info (o variable LOG_LEVEL del proceso).

.EXAMPLE
    .\start_production.ps1
    .\start_production.ps1 -EnvFile .env.staging -Port 5002 -Workers 1
#>
param(
    [string]$EnvFile  = $(if ($env:ENV_FILE)  { $env:ENV_FILE }  else { ".env" }),
    [string]$HostAddr = $(if ($env:HOST)       { $env:HOST }       else { "127.0.0.1" }),
    [int]   $Port     = $(if ($env:PORT)       { [int]$env:PORT }  else { 5000 }),
    [int]   $Workers  = $(if ($env:WORKERS)    { [int]$env:WORKERS } else { 2 }),
    [string]$LogLevel = $(if ($env:LOG_LEVEL)  { $env:LOG_LEVEL }  else { "info" })
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python    = Join-Path $ScriptDir "venv\Scripts\python.exe"

if (-not (Test-Path $Python)) {
    Write-Error "[ERROR] Interprete Python no encontrado: $Python"
    Write-Error "[ERROR] Ejecute: python -m venv venv; venv\Scripts\pip install -r requirements.txt"
    exit 1
}

$Launcher = Join-Path $ScriptDir "launch_production.py"

& $Python $Launcher `
    --env-file  $EnvFile  `
    --host      $HostAddr `
    --port      $Port     `
    --workers   $Workers  `
    --log-level $LogLevel

exit $LASTEXITCODE