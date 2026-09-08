@echo off
REM start_production.bat -- Windows equivalent para produccion sin --reload
REM Bloque 8: HEAD 486ef36
SET HOST=127.0.0.1
SET PORT=5000
SET WORKERS=2

REM Cargar .env (usa dotenv de Python -- database.py lo carga automaticamente)
REM Solo iniciar uvicorn sin --reload:
venv\Scripts\uvicorn.exe main:app --host %HOST% --port %PORT% --workers %WORKERS% --log-level info --access-log --timeout-keep-alive 30
