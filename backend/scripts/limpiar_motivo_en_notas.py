"""
limpiar_motivo_en_notas.py -- U18+H31+H33 (Bloque 2, R3, choque C1 f): hasta T2B, cancelar una solicitud (SC) pegaba
'[CANCELADA] Razón: {motivo}' al final de sus Notas, y esas notas viajan a la cotizacion y al pedido. Desde T2B el
motivo vive solo en razon_cancelacion y en la Actividad. Este script quita esa marca de las notas VIEJAS que la tienen.

Uso (desde backend/, con el python del venv):
    python scripts/limpiar_motivo_en_notas.py                            REPORTE (por defecto): solo cuenta y muestra
                                                                         ejemplos
    python scripts/limpiar_motivo_en_notas.py --aplicar --base erp_test  escribe, con respaldo de cada fila antes de
                                                                         cambiarla

El reporte es lo unico que corre solo (en una transaccion de SOLO LECTURA). --aplicar es una ESCRITURA en la base
destino (la que imprime al empezar, con la contrasena enmascarada, y su SELECT current_database()) y necesita la
autorizacion explicita del usuario en cada entorno (T12; produccion con un OK aparte). Como correcciones_bloque1.py
(B9), --aplicar exige --base <nombre> igual a current_database(): sin --base es un error de argumentos y si no coincide
aborta (codigo 2) sin escribir nada. Orden de T12 (R26): antes de ajustar_estados_solicitud.py; reporte -> OK ->
aplicar -> reporte en 0.

Reglas (C1 f):
  - Se mira cada LINEA de las notas que empieza por '[CANCELADA] Razón: X'. Se quita solo si X (sin espacios de los
    bordes) es un motivo de ESA solicitud: su razon_cancelacion o el motivo de alguno de sus renglones CANCELLED de la
    Actividad (extra_data['motivo'] si lo trae; si no, la descripcion sin el prefijo 'Cancelada: ', como la dejaba
    cancelar_solicitud). Asi no se pierde un motivo aunque la SC se haya cancelado, restaurado y vuelto a cancelar.
  - Una marca cuyo X no coincide con ningun motivo de la SC se conserva (se cuenta como 'marca conservada'). Tambien
    una marca de un motivo con saltos de linea (ocupa varias lineas: no se toca, por prudencia).
  - Las notas quedan sin esas lineas y sin espacios en los bordes; si no queda nada, NULL.
  - Excluye SIEMPRE los documentos reales (DOCUMENTOS_REALES) y todo lo vinculado a ellos (calcular_excluidos de
    correcciones_bloque1: SC <-> COT <-> PVEN) y las solicitudes de Soporte Tecnico.
  - En el reporte no escribe nada (ni crea la tabla de respaldo).
  - Con --aplicar respalda cada fila en customer_requests_respaldo_notas (CREATE TABLE IF NOT EXISTS; INSERT ... ON
    CONFLICT (id) DO NOTHING: la tabla conserva el ORIGINAL de la primera corrida) y hace todo en UNA transaccion:
    commit al final, rollback ante cualquier error.
  - El UPDATE exige que las notas sigan como se leyeron (WHERE notas = original): si alguien las edito en medio, no se
    pisan ni se respaldan. updated_at no se toca (no esconde alertas). No deja renglones en la Actividad: el rastro es
    la tabla de respaldo.
  - Es idempotente: una segunda corrida encuentra 0 candidatas.

Para DESHACER (devuelve las notas originales de lo que cambio este script):
    UPDATE customer_requests c SET notas = r.notas_original
    FROM customer_requests_respaldo_notas r
    WHERE c.id = r.id AND c.notas IS NOT DISTINCT FROM r.notas_nueva;
La tabla de respaldo queda en la base hasta que el usuario decida borrarla (DROP TABLE customer_requests_respaldo_notas).
"""
import argparse
import os
import re
import sys

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from sqlalchemy import text

import app.models  # noqa: F401  (registra todos los modelos antes de la primera consulta ORM)
from app.core.textos_actividad import etiqueta_estado

# Documentos reales del usuario (R32): NUNCA se tocan, ni lo vinculado a ellos. Se lee en cada llamada (las pruebas
# lo cambian con monkeypatch): nunca como valor por defecto de un parametro.
DOCUMENTOS_REALES = ("SC-20260731", "COT-20260449", "PVEN-20262799", "SC-20260746")

TABLA_RESPALDO = "customer_requests_respaldo_notas"
SOPORTE_TECNICO = "Soporte Tecnico"  # asi esta guardado (sin tilde)
MARCA = "[CANCELADA] Razón: "          # lo que pegaba cancelar_solicitud antes de T2B, al principio de una linea
PREFIJO_CANCELLED = "Cancelada: "     # descripcion del renglon CANCELLED
# Se valida con fullmatch y sin '$': '$' tambien acepta un salto de linea al final (un nombre como 'abc' + LF).
_NOMBRE_DE_TABLA = re.compile(r"[a-z_][a-z0-9_]*")
MAX_EJEMPLOS = 50


def _validar_tabla(nombre):
    if not isinstance(nombre, str) or not _NOMBRE_DE_TABLA.fullmatch(nombre):
        raise ValueError(f"Nombre de tabla de respaldo no válido: {nombre!r}")


def _excluidas_sc(db) -> set:
    """Ids de SC que son documentos reales o estan vinculadas a uno (cierre transitivo de correcciones_bloque1)."""
    from scripts.correcciones_bloque1 import calcular_excluidos
    return set(calcular_excluidos(db, DOCUMENTOS_REALES).sc)


def _motivo_de_cancelled(descripcion, extra_data):
    """El motivo de un renglon CANCELLED: extra_data['motivo'] (desde T2B) o la descripcion sin 'Cancelada: '."""
    if isinstance(extra_data, dict) and isinstance(extra_data.get("motivo"), str) and extra_data["motivo"].strip():
        return extra_data["motivo"].strip()
    if isinstance(descripcion, str) and descripcion.startswith(PREFIJO_CANCELLED):
        return descripcion[len(PREFIJO_CANCELLED):].strip() or None
    return None


def notas_sin_motivo(notas, motivos):
    """(notas_nuevas, quitadas, conservadas). quitadas/conservadas son los X de cada linea '[CANCELADA] Razón: X'.
    Sin nada que quitar devuelve las notas tal cual. Las nuevas van sin espacios en los bordes (None si quedan vacias)."""
    quedan, quitadas, conservadas = [], [], []
    for linea in notas.split("\n"):
        if linea.startswith(MARCA):
            motivo = linea[len(MARCA):].strip()
            if motivo and motivo in motivos:
                quitadas.append(motivo)
                continue
            conservadas.append(motivo)
        quedan.append(linea)
    if not quitadas:
        return notas, quitadas, conservadas
    return "\n".join(quedan).strip() or None, quitadas, conservadas


def limpiar(db, aplicar=False, ids=None, tabla_respaldo=TABLA_RESPALDO) -> dict:
    """Calcula (y con aplicar=True escribe) la limpieza del motivo en las notas (reglas en el docstring del modulo).

    ids: si se pasa, solo esas SC (las pruebas filtran siempre por sus propios ids).
    Devuelve {'candidatas', 'limpiadas', 'excluidas', 'marcas_conservadas', 'ejemplos': [{id, numero, estado,
    quitadas, conservadas, antes, despues}]}. 'excluidas' cuenta las que serian candidatas pero son documentos reales
    o estan vinculadas a uno; 'marcas_conservadas', las marcas que se quedan porque no coinciden con un motivo de su SC
    (en candidatas y en no candidatas). Sin aplicar no escribe nada (ni crea la tabla de respaldo). Con aplicar es UNA
    transaccion: commit al final y rollback ante cualquier error.
    """
    _validar_tabla(tabla_respaldo)
    consulta = ("SELECT id, numero, estado, notas, razon_cancelacion FROM customer_requests "
                "WHERE notas LIKE :patron AND tipo_solicitud IS DISTINCT FROM :soporte")
    parametros = {"patron": f"%{MARCA.strip()}%", "soporte": SOPORTE_TECNICO}
    if ids is not None:
        consulta += " AND id = ANY(:ids)"
        parametros["ids"] = [int(i) for i in ids]
    consulta += " ORDER BY id"
    try:
        filas = db.execute(text(consulta), parametros).mappings().all()
        motivos = {f["id"]: set() for f in filas}
        for f in filas:
            if f["razon_cancelacion"] and f["razon_cancelacion"].strip():
                motivos[f["id"]].add(f["razon_cancelacion"].strip())
        if filas:
            for entity_id, descripcion, extra_data in db.execute(
                    text("SELECT entity_id, description, extra_data FROM activity_logs "
                         "WHERE entity_type = 'SC' AND action = 'CANCELLED' AND entity_id = ANY(:ids)"),
                    {"ids": list(motivos)}).all():
                motivo = _motivo_de_cancelled(descripcion, extra_data)
                if motivo:
                    motivos[entity_id].add(motivo)
        excluidas_sc = _excluidas_sc(db) if filas else set()
        candidatas, excluidas, marcas_conservadas = [], 0, 0
        for f in filas:
            nuevas, quitadas, conservadas = notas_sin_motivo(f["notas"], motivos[f["id"]])
            if f["id"] in excluidas_sc:
                excluidas += 1 if quitadas else 0
                continue
            marcas_conservadas += len(conservadas)
            if not quitadas:
                continue
            candidatas.append({"id": f["id"], "numero": f["numero"], "estado": f["estado"], "quitadas": quitadas,
                               "conservadas": conservadas, "antes": f["notas"], "despues": nuevas})
        resultado = {
            "candidatas": len(candidatas),
            "limpiadas": 0,
            "excluidas": excluidas,
            "marcas_conservadas": marcas_conservadas,
            "ejemplos": candidatas[:MAX_EJEMPLOS],
        }
        if not aplicar:
            db.rollback()
            return resultado
        db.execute(text(
            f"CREATE TABLE IF NOT EXISTS {tabla_respaldo} ("
            "id INTEGER PRIMARY KEY, "
            "notas_original TEXT NOT NULL, "
            "notas_nueva TEXT NULL, "
            "corregido_at TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'))"))
        limpiadas = 0
        for c in candidatas:
            cambio = db.execute(
                text("UPDATE customer_requests SET notas = :nueva WHERE id = :id AND notas = :original"),
                {"nueva": c["despues"], "id": c["id"], "original": c["antes"]})
            if cambio.rowcount != 1:
                continue  # alguien las edito despues de leerlas: no se pisan y no queda respaldo de algo que no cambio
            db.execute(
                text(f"INSERT INTO {tabla_respaldo} (id, notas_original, notas_nueva) "
                     "VALUES (:id, :original, :nueva) ON CONFLICT (id) DO NOTHING"),
                {"id": c["id"], "original": c["antes"], "nueva": c["despues"]})
            limpiadas += 1
        db.commit()
        resultado["limpiadas"] = limpiadas
        return resultado
    except Exception:
        db.rollback()
        raise


def _solo_lectura(db):
    """El reporte corre en una transaccion de SOLO LECTURA (la siguiente sentencia abre la transaccion)."""
    db.execute(text("SET TRANSACTION READ ONLY"))


def _recortar(valor, largo=160) -> str:
    """Las notas para el reporte, en una linea y recortadas (repr: se ven los saltos de linea)."""
    if valor is None:
        return "NULL"
    texto = repr(valor)
    return texto if len(texto) <= largo else texto[:largo] + "…'"


def main(argv=None) -> int:
    """0 si termino; 2 si --base no coincide con current_database() (no escribe nada). Sin --base, --aplicar es un
    error de argumentos (argparse sale con 2)."""
    parser = argparse.ArgumentParser(
        description="Quita de las notas de las solicitudes el '[CANCELADA] Razón: …' que pegaba la cancelación (U18).")
    parser.add_argument("--aplicar", action="store_true",
                        help="Escribe los cambios (con respaldo). Sin esta opcion solo reporta.")
    parser.add_argument("--base", help="con --aplicar: nombre de la base; debe ser igual a current_database()")
    args = parser.parse_args(argv)
    if args.aplicar and not args.base:
        parser.error("--aplicar exige --base <nombre de la base>, igual a current_database()")

    from app.db.database import SessionLocal, SQLALCHEMY_DATABASE_URL
    from app.core.preflight import _mask_url

    modo = "APLICAR (escribe, con respaldo)" if args.aplicar else "REPORTE (solo lectura, no escribe)"
    print(f"Conectando a -> {_mask_url(SQLALCHEMY_DATABASE_URL)}  [{modo}]")
    db = SessionLocal()
    try:
        if not args.aplicar:
            _solo_lectura(db)
        base = db.execute(text("SELECT current_database()")).scalar()
        print(f"SELECT current_database() -> {base}")
        if args.aplicar and args.base != base:
            db.rollback()
            print(f"ABORTADO: --base {args.base!r} no coincide con la base a la que está conectado el script "
                  f"({base!r}): no se escribió nada.", file=sys.stderr)
            return 2
        res = limpiar(db, aplicar=args.aplicar)
    finally:
        db.close()

    print(f"Candidatas: {res['candidatas']}  (excluidas por documentos reales o vinculadas a ellos: "
          f"{res['excluidas']})")
    print(f"Marcas que se conservan (no coinciden con ningún motivo de su solicitud): {res['marcas_conservadas']}")
    print(f"Ejemplos (hasta {MAX_EJEMPLOS}):")
    for e in res["ejemplos"]:
        print(f"  {e['numero']} (#{e['id']}, {etiqueta_estado('SC', e['estado'])}): quita {len(e['quitadas'])} "
              f"marca(s) {e['quitadas']!r}" + (f"; conserva {e['conservadas']!r}" if e["conservadas"] else ""))
        print(f"      antes:   {_recortar(e['antes'])}")
        print(f"      después: {_recortar(e['despues'])}")
    if args.aplicar:
        print(f"Limpiadas: {res['limpiadas']} (respaldo en {TABLA_RESPALDO})")
    else:
        print("\nREPORTE: no se escribió nada. Para aplicar (con el OK del usuario):\n"
              "  python scripts/limpiar_motivo_en_notas.py --aplicar --base <nombre de la base>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
