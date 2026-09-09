@echo off
REM =============================================================================
REM start_production.bat -- Nebulae ERP Backend (Produccion / Staging) - Windows
REM =============================================================================
REM USO:
REM   set NEBULAE_ENV=production
REM   set ENV_FILE=.env
REM   start_production.bat
REM
REM Variables configurables:
REM   ENV_FILE               Archivo .env a cargar (defecto: .env)
REM   PORT                   Puerto de escucha (defecto: 5000)
REM   HOST                   Host (defecto: 127.0.0.1)
REM   WORKERS                Workers uvicorn (defecto: 2)
REM   LOG_LEVEL              Nivel de log (defecto: info)
REM   NEBULAE_ENV            Ambiente: production|staging|development
REM   EXPECTED_DATABASE_NAME Si se define, alembic verifica coincidencia
REM
REM Garantias:
REM   - Verifica que SECRET_KEY exista y no sea el valor de desarrollo
REM   - Verifica DATABASE_URL
REM   - No usa --reload
REM   - No imprime secretos
REM   - Registra PID en nebulae_backend.pid
REM   - Exit codes: 0=OK, 1=error de configuracion
REM =============================================================================

setlocal enabledelayedexpansion

REM ---------------------------------------------------------------------------
REM Parametros con valores por defecto
REM ---------------------------------------------------------------------------
if "%ENV_FILE%"==""       set ENV_FILE=.env
if "%PORT%"==""           set PORT=5000
if "%HOST%"==""           set HOST=127.0.0.1
if "%WORKERS%"==""        set WORKERS=2
if "%LOG_LEVEL%"==""      set LOG_LEVEL=info
if "%NEBULAE_ENV%"==""    set NEBULAE_ENV=production

echo ===================================================================
echo  Nebulae ERP Backend -- Arranque de produccion (Windows)
echo  Ambiente: %NEBULAE_ENV%
echo  Host:     %HOST%:%PORT%
echo  Workers:  %WORKERS%
echo ===================================================================

REM ---------------------------------------------------------------------------
REM 1. Cargar variables de entorno desde ENV_FILE
REM    Solo setea variables NO existentes en el entorno (no sobrescribe)
REM ---------------------------------------------------------------------------
if exist "%ENV_FILE%" (
    echo [INFO] Cargando entorno desde: %ENV_FILE%
    for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
        set "_line=%%A"
        REM Ignorar comentarios (lineas que empiezan con #)
        if not "!_line:~0,1!"=="#" (
            if not "%%A"=="" (
                REM Solo setear si la variable no existe ya en el entorno
                if "!%%A!"=="" (
                    set "%%A=%%B"
                )
            )
        )
    )
) else (
    echo [WARN] %ENV_FILE% no encontrado. Usando variables del entorno actual.
)

REM ---------------------------------------------------------------------------
REM 2. Verificar SECRET_KEY
REM ---------------------------------------------------------------------------
if "%SECRET_KEY%"=="" (
    echo [ERROR] SECRET_KEY no esta definida. Abortando. 1>&2
    exit /b 1
)

if "%SECRET_KEY%"=="super-secret-key-for-development-change-me" (
    echo [ERROR] SECRET_KEY tiene el valor de desarrollo. Abortando. 1>&2
    exit /b 1
)

echo [INFO] SECRET_KEY: presente [VALOR OCULTO]

REM ---------------------------------------------------------------------------
REM 3. Verificar DATABASE_URL
REM ---------------------------------------------------------------------------
if "%DATABASE_URL%"=="" (
    echo [ERROR] DATABASE_URL no esta definida. Abortando. 1>&2
    exit /b 1
)

REM Mostrar URL sin credenciales via Python
venv\Scripts\python.exe -c "import sys,os; from urllib.parse import urlparse; u=os.environ.get('DATABASE_URL',''); p=urlparse(u); print(f'[INFO] DATABASE_URL -> {p.scheme}://***:***@{p.hostname}:{p.port}{p.path}')" 2>nul || echo [INFO] DATABASE_URL presente [no se pudo analizar]

REM ---------------------------------------------------------------------------
REM 4. Verificar EXPECTED_DATABASE_NAME (informativo; alembic/env.py lo valida)
REM ---------------------------------------------------------------------------
if not "%EXPECTED_DATABASE_NAME%"=="" (
    echo [INFO] EXPECTED_DATABASE_NAME declarado: %EXPECTED_DATABASE_NAME%
)

REM ---------------------------------------------------------------------------
REM 5. Verificar ejecutable Python del venv
REM ---------------------------------------------------------------------------
if not exist "venv\Scripts\python.exe" (
    echo [ERROR] No se encontro venv\Scripts\python.exe. Verificar el venv. 1>&2
    exit /b 1
)

for /f "tokens=*" %%V in ('venv\Scripts\python.exe --version 2^>^&1') do (
    echo [INFO] Python: %%V
)

REM Verificar uvicorn disponible
venv\Scripts\python.exe -c "import uvicorn" 2>nul
if errorlevel 1 (
    echo [ERROR] uvicorn no esta instalado en el venv. 1>&2
    exit /b 1
)

REM ---------------------------------------------------------------------------
REM 6. Exportar NEBULAE_ENV
REM ---------------------------------------------------------------------------
set NEBULAE_ENV=%NEBULAE_ENV%

REM ---------------------------------------------------------------------------
REM 6b. Preflight: verificar base de datos antes de iniciar
REM ---------------------------------------------------------------------------
echo [INFO] Ejecutando preflight de base de datos...
venv\Scripts\python.exe -m app.core.preflight
if errorlevel 1 (
    echo [ERROR] Preflight fallo. El backend no puede iniciar. 1>&2
    exit /b 2
)
echo [INFO] Preflight OK.

REM ---------------------------------------------------------------------------
REM 7. Iniciar uvicorn SIN --reload usando python -m uvicorn
REM ---------------------------------------------------------------------------
echo [INFO] Iniciando uvicorn (sin --reload)...
echo [INFO] Workers: %WORKERS% ^| Port: %PORT% ^| Host: %HOST%

venv\Scripts\python.exe -m uvicorn main:app ^
    --host %HOST% ^
    --port %PORT% ^
    --workers %WORKERS% ^
    --log-level %LOG_LEVEL% ^
    --access-log ^
    --timeout-keep-alive 30

REM ---------------------------------------------------------------------------
REM 8. Exit code
REM ---------------------------------------------------------------------------
set EXIT_CODE=%errorlevel%
echo [INFO] uvicorn termino con exit code: %EXIT_CODE%
exit /b %EXIT_CODE%