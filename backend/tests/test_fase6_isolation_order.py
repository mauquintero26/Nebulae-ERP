"""
test_fase6_isolation_order.py -- Prueba de Aislamiento Bidireccional de Fase 6 y Recepciones

Verifica que no existe contaminacion cruzada, transacciones residuales,
politicas de gobernanza desalineadas ni bloqueos entre la suite de Fase 6
y las pruebas de recepciones (test_receipt_partial y test_receipt_concurrency).

Ejecuta:
1. Orden Directo:  Fase 6 -> receipt_partial -> receipt_concurrency
2. Orden Inverso:  receipt_concurrency -> receipt_partial -> Fase 6

Ambas ejecuciones deben terminar con exit code 0 (cero failed, cero errors).
"""
import os
import sys
import subprocess
import pytest


def _run_pytest_subprocess(test_files: list[str]) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    cmd = [sys.executable, "-m", "pytest"] + test_files + ["-q", "--tb=short"]
    return subprocess.run(
        cmd,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        capture_output=True,
        text=True,
        env=env,
        timeout=450
    )


def test_isolation_fase6_then_receipts():
    """Ejecuta en orden: test_fase6_legacy_consolidation -> test_receipt_partial -> test_receipt_concurrency."""
    files = [
        "tests/test_fase6_legacy_consolidation.py",
        "tests/test_receipt_partial.py",
        "tests/test_receipt_concurrency.py"
    ]
    proc = _run_pytest_subprocess(files)
    assert proc.returncode == 0, (
        f"Fallo en orden Fase 6 -> Recepciones.\n"
        f"STDOUT:\n{proc.stdout}\n"
        f"STDERR:\n{proc.stderr}"
    )
    summary = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else ""
    assert "passed" in summary, f"Se esperaba 'passed' en summary line: {summary}"
    assert "failed" not in summary, f"No deben existir fallos: {summary}"
    assert "error" not in summary, f"No deben existir errores: {summary}"


def test_isolation_receipts_then_fase6():
    """Ejecuta en orden inverso: test_receipt_concurrency -> test_receipt_partial -> test_fase6_legacy_consolidation."""
    files = [
        "tests/test_receipt_concurrency.py",
        "tests/test_receipt_partial.py",
        "tests/test_fase6_legacy_consolidation.py"
    ]
    proc = _run_pytest_subprocess(files)
    assert proc.returncode == 0, (
        f"Fallo en orden Recepciones -> Fase 6.\n"
        f"STDOUT:\n{proc.stdout}\n"
        f"STDERR:\n{proc.stderr}"
    )
    summary = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else ""
    assert "passed" in summary, f"Se esperaba 'passed' en summary line: {summary}"
    assert "failed" not in summary, f"No deben existir fallos: {summary}"
    assert "error" not in summary, f"No deben existir errores: {summary}"
