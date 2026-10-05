"""
corregir_actividad_sc_sin_precio.py -- H26 (Bloque 2, T4): la Actividad de una solicitud (SC) muestra los productos SIN
precio, porque una SC no tiene precios (sus lineas llegan con unit_price_cop 0). Hasta T4 los renglones de edicion de
la SC decian 'Producto agregado: Nivel laser DEMO ×1 a $0' y registraban cambios de '— precio unitario' / '— total'. El
codigo ya no los genera (cambios_documento._SIN_PRECIO); este script corrige los renglones VIEJOS.

Uso (desde backend/, con el python del venv):
    python scripts/corregir_actividad_sc_sin_precio.py                            REPORTE (por defecto): lista TODAS
                                                                                  las candidatas, sin escribir
    python scripts/corregir_actividad_sc_sin_precio.py --aplicar --base erp_test  escribe, con respaldo de cada fila
                                                                                  antes de cambiarla

El reporte es lo unico que corre solo (en una transaccion de SOLO LECTURA). --aplicar es una ESCRITURA en la base
destino (la que imprime al empezar, con la contrasena enmascarada, y su SELECT current_database()) y necesita la
autorizacion explicita del usuario en cada entorno (T12; produccion con un OK aparte). Como correcciones_bloque1.py
(B9), --aplicar exige --base <nombre> igual a current_database(): sin --base es un error de argumentos y si no coincide
aborta (codigo 2) sin escribir nada. Orden de T12 (R26): despues de ajustar_estados_solicitud.py; reporte -> OK ->
aplicar -> reporte en 0.

Reglas:
  - Candidatas: activity_logs con entity_type 'SC' y extra_data->'cambios' en forma de lista, donde
    cambios_documento.limpiar_precios_sc encuentra algo que quitar. Solo se tocan entradas de PRODUCTOS generadas por el
    sistema: el ' a $X' final de 'Producto agregado' / 'Producto eliminado' y las entradas '{producto} — precio
    unitario' / '{producto} — total'. Las demas claves de extra_data, las demas entradas (cantidad, vinculo al catalogo,
    notas, cliente...), la descripcion, las notas del chatter y los motivos nunca se tocan.
  - Excluye SIEMPRE los documentos reales (DOCUMENTOS_REALES) y todo lo vinculado a ellos (calcular_excluidos de
    correcciones_bloque1: SC <-> COT <-> PVEN; tambien por entity_numero) y las solicitudes de Soporte Tecnico.
  - En el reporte no escribe nada (ni crea la tabla de respaldo).
  - Con --aplicar respalda cada fila en activity_logs_respaldo_sc_precio (CREATE TABLE IF NOT EXISTS; INSERT ... ON
    CONFLICT (id) DO UPDATE de extra_data_nueva y corregido_at: la tabla conserva el extra_data_original de la PRIMERA
    corrida y el extra_data_nueva de la ULTIMA, asi el SQL de deshacer sirve aunque se corra varias veces) y hace todo en
    UNA transaccion: commit al final, rollback ante cualquier error.
  - El UPDATE exige que extra_data siga como se leyo (WHERE extra_data = original): si cambio en medio, no se pisa ni se
    respalda. No deja renglones en la Actividad: el rastro es la tabla de respaldo.
  - Es idempotente: una segunda corrida encuentra 0 candidatas.
  - Renglones que quedan sin detalle: si a una candidata no le queda ninguna entrada (p. ej. solo registraba un cambio de
    precio) o su descripcion sigue nombrando 'Productos' sin ninguna entrada de productos, el reporte la marca «quedará
    sin detalle de productos: revisar» (sin_detalle=True). La seleccion no cambia y ningun renglon se borra: el usuario
    decide en T12.

Para DESHACER (devuelve el extra_data original de lo que cambio este script):
    UPDATE activity_logs a SET extra_data = r.extra_data_original
    FROM activity_logs_respaldo_sc_precio r
    WHERE a.id = r.id AND a.extra_data = r.extra_data_nueva;
La tabla de respaldo queda en la base hasta que el usuario decida borrarla (DROP TABLE activity_logs_respaldo_sc_precio).
"""
import argparse
import json
import os
import re
import sys

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from sqlalchemy import text

import app.models  # noqa: F401  (registra todos los modelos antes de la primera consulta ORM)
from app.core.cambios_documento import limpiar_precios_sc

# Documentos reales del usuario (R32): NUNCA se tocan, ni lo vinculado a ellos. Se lee en cada llamada (las pruebas
# lo cambian con monkeypatch): nunca como valor por defecto de un parametro.
DOCUMENTOS_REALES = ("SC-20260731", "COT-20260449", "PVEN-20262799", "SC-20260746")

TABLA_RESPALDO = "activity_logs_respaldo_sc_precio"
SOPORTE_TECNICO = "Soporte Tecnico"  # asi esta guardado (sin tilde)
# Se valida con fullmatch y sin '$': '$' tambien acepta un salto de linea al final (un nombre como 'abc' + LF).
_NOMBRE_DE_TABLA = re.compile(r"[a-z_][a-z0-9_]*")


def _validar_tabla(nombre):
    if not isinstance(nombre, str) or not _NOMBRE_DE_TABLA.fullmatch(nombre):
        raise ValueError(f"Nombre de tabla de respaldo no válido: {nombre!r}")


def _excluidas_sc(db) -> set:
    """Ids de SC que son documentos reales o estan vinculadas a uno (cierre transitivo de correcciones_bloque1)."""
    from scripts.correcciones_bloque1 import calcular_excluidos
    return set(calcular_excluidos(db, DOCUMENTOS_REALES).sc)


def _json(valor) -> str:
    return json.dumps(valor, ensure_ascii=False)


def _queda_sin_detalle(descripcion, nuevos) -> bool:
    """True si el renglon corregido no tendra detalle: 'cambios' vacio, o una descripcion que sigue nombrando
    'Productos' sin ninguna entrada de productos (campo 'productos' o 'productos_sku')."""
    if not nuevos:
        return True
    con_productos = any(isinstance(c, dict) and c.get("campo") in ("productos", "productos_sku") for c in nuevos)
    return "Productos" in (descripcion or "") and not con_productos


def corregir(db, aplicar=False, ids=None, tabla_respaldo=TABLA_RESPALDO) -> dict:
    """Calcula (y con aplicar=True escribe) la correccion de los renglones viejos de SC (reglas en el docstring).

    ids: si se pasa, solo esas filas de activity_logs (las pruebas filtran siempre por sus propios ids).
    Devuelve {'candidatas', 'corregidas', 'excluidas', 'ejemplos'}:
      - 'ejemplos': TODAS las candidatas (sin tope), [{id, numero, created_at, descripcion, antes, despues,
        sin_detalle}] con la lista 'cambios' de antes y la de despues; sin_detalle (_queda_sin_detalle) solo informa;
      - 'excluidas': las que serian candidatas pero son documentos reales o estan vinculadas a uno.
    Sin aplicar no escribe nada (ni crea la tabla de respaldo). Con aplicar es UNA transaccion: commit al final y
    rollback ante cualquier error.
    """
    _validar_tabla(tabla_respaldo)
    consulta = ("SELECT a.id, a.entity_id, a.entity_numero, a.created_at, a.description, a.extra_data "
                "FROM activity_logs a "
                "LEFT JOIN customer_requests cr ON cr.id = a.entity_id "
                "WHERE a.entity_type = 'SC' AND jsonb_typeof(a.extra_data -> 'cambios') = 'array' "
                "AND cr.tipo_solicitud IS DISTINCT FROM :soporte")
    parametros = {"soporte": SOPORTE_TECNICO}
    if ids is not None:
        consulta += " AND a.id = ANY(:ids)"
        parametros["ids"] = [int(i) for i in ids]
    consulta += " ORDER BY a.id"
    try:
        filas = db.execute(text(consulta), parametros).mappings().all()
        planes = [(f, limpiar_precios_sc(f["extra_data"]["cambios"])) for f in filas]
        planes = [(f, nuevos) for f, nuevos in planes if nuevos is not None]
        excluidas_sc = _excluidas_sc(db) if planes else set()
        reales = set(DOCUMENTOS_REALES)
        candidatas, excluidas = [], 0
        for f, nuevos in planes:
            if f["entity_id"] in excluidas_sc or f["entity_numero"] in reales:
                excluidas += 1
                continue
            candidatas.append({"id": f["id"], "numero": f["entity_numero"], "created_at": f["created_at"],
                               "descripcion": f["description"], "antes": f["extra_data"]["cambios"],
                               "despues": nuevos, "sin_detalle": _queda_sin_detalle(f["description"], nuevos),
                               "original": f["extra_data"], "nueva": {**f["extra_data"], "cambios": nuevos}})
        resultado = {
            "candidatas": len(candidatas),
            "corregidas": 0,
            "excluidas": excluidas,
            "ejemplos": [{k: c[k] for k in ("id", "numero", "created_at", "descripcion", "antes", "despues",
                                            "sin_detalle")} for c in candidatas],
        }
        if not aplicar:
            db.rollback()
            return resultado
        db.execute(text(
            f"CREATE TABLE IF NOT EXISTS {tabla_respaldo} ("
            "id INTEGER PRIMARY KEY, "
            "extra_data_original JSONB NOT NULL, "
            "extra_data_nueva JSONB NOT NULL, "
            "corregido_at TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'))"))
        corregidas = 0
        for c in candidatas:
            original, nueva = _json(c["original"]), _json(c["nueva"])
            cambio = db.execute(
                text("UPDATE activity_logs SET extra_data = CAST(:nueva AS jsonb) "
                     "WHERE id = :id AND extra_data = CAST(:original AS jsonb)"),
                {"nueva": nueva, "id": c["id"], "original": original})
            if cambio.rowcount != 1:
                continue  # cambio despues de leerlo: no se pisa y no queda respaldo de algo que no cambio
            # extra_data_original es el de la PRIMERA corrida; extra_data_nueva, el de la ultima (el SQL de deshacer
            # compara con el).
            db.execute(
                text(f"INSERT INTO {tabla_respaldo} (id, extra_data_original, extra_data_nueva) "
                     "VALUES (:id, CAST(:original AS jsonb), CAST(:nueva AS jsonb)) ON CONFLICT (id) DO UPDATE SET "
                     "extra_data_nueva = EXCLUDED.extra_data_nueva, corregido_at = EXCLUDED.corregido_at"),
                {"id": c["id"], "original": original, "nueva": nueva})
            corregidas += 1
        db.commit()
        resultado["corregidas"] = corregidas
        return resultado
    except Exception:
        db.rollback()
        raise


def _solo_lectura(db):
    """El reporte corre en una transaccion de SOLO LECTURA (la siguiente sentencia abre la transaccion)."""
    db.execute(text("SET TRANSACTION READ ONLY"))


def _diferencias(cambios) -> list:
    """Lineas del reporte con lo que cambia en un renglon, entrada por entrada (con la misma limpiar_precios_sc):
    'etiqueta: "antes" -> "despues"' o 'se quita «etiqueta» (antes -> despues)'."""
    lineas = []
    for c in cambios:
        limpia = limpiar_precios_sc([c])
        if limpia is None:
            continue
        if not limpia:
            lineas.append(f"se quita «{c['etiqueta']}» ({c.get('antes')} -> {c.get('despues')})")
            continue
        for lado in ("antes", "despues"):
            if limpia[0].get(lado) != c.get(lado):
                lineas.append(f"{c['etiqueta']}: {_json(c.get(lado))} -> {_json(limpia[0].get(lado))}")
    return lineas


def _fecha_utc(valor) -> str:
    return valor.strftime("%Y-%m-%d %H:%M UTC") if valor else "sin fecha"


def main(argv=None) -> int:
    """0 si termino; 2 si --base no coincide con current_database() (no escribe nada). Sin --base, --aplicar es un
    error de argumentos (argparse sale con 2)."""
    parser = argparse.ArgumentParser(
        description="Quita los precios de los productos en la Actividad vieja de las solicitudes (H26).")
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
        res = corregir(db, aplicar=args.aplicar)
    finally:
        db.close()

    print(f"Candidatas: {res['candidatas']}  (excluidas por documentos reales o vinculadas a ellos: "
          f"{res['excluidas']})")
    print(f"Todas las candidatas ({res['candidatas']}), 'antes -> después':")
    for e in res["ejemplos"]:
        print(f"  {e['numero']} (renglón #{e['id']}, {_fecha_utc(e['created_at'])}):")
        for linea in _diferencias(e["antes"]):
            print(f"      {linea}")
        if e.get("sin_detalle"):
            print(f"      ATENCIÓN: quedará sin detalle de productos: revisar (descripción: {e.get('descripcion')!r})")
    sin_detalle = sum(1 for e in res["ejemplos"] if e.get("sin_detalle"))
    if sin_detalle:
        print(f"Candidatas que quedarán sin detalle de productos (revisar; no se borran): {sin_detalle}")
    if args.aplicar:
        print(f"Corregidas: {res['corregidas']} (respaldo en {TABLA_RESPALDO})")
    else:
        print("\nREPORTE: no se escribió nada. Para aplicar (con el OK del usuario):\n"
              "  python scripts/corregir_actividad_sc_sin_precio.py --aplicar --base <nombre de la base>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
