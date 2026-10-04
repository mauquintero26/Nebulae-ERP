"""
corregir_textos_actividad.py -- Corrige los textos VIEJOS de la Actividad de Ventas (H7+H41): 'Cotizacion' ->
'Cotización', 'Lineas' -> 'Líneas' y los codigos de estado ('Estado cambiado a ASIGNADA (asesor asignado)') por su
nombre legible ('Asignada'), igual que los generan ahora los endpoints. Los renglones nuevos ya salen bien: esto
repara los que quedaron guardados antes.

Uso (desde backend/, con el python del venv):
    python scripts/corregir_textos_actividad.py             DRY-RUN (por defecto): solo cuenta y muestra ejemplos
    python scripts/corregir_textos_actividad.py --aplicar   escribe, con respaldo de cada fila antes de cambiarla

El dry-run es lo unico que corre solo. --aplicar es una ESCRITURA en la base destino (la que imprime al empezar,
con la contrasena enmascarada) y necesita autorizacion explicita del usuario en cada entorno.

Alcance / reglas de seguridad:
  - Candidatas: activity_logs con entity_type en (SC, COT, VEN, PXP), una accion del SISTEMA (CREATED,
    ESTADO_CHANGED, CONVERTIDA_A_VENTA, RESTORED) y descripcion no nula. NOTE_ADDED, CHATTER, CANCELLED y cualquier
    otra accion son texto que escribio una persona: nunca se tocan.
  - Solo se reescribe lo que calza con un patron ANCLADO de texto generado por el sistema
    (app.core.textos_actividad.corregir_descripcion_historica). Un texto que no calza queda intacto.
  - Con --aplicar, cada fila se respalda en la tabla activity_logs_respaldo_textos (id, description_original,
    description_nueva, corregido_at) en la MISMA transaccion que la cambia. Todo o nada: ante cualquier error, rollback.
  - El UPDATE exige que la descripcion siga igual que cuando se leyo (WHERE description = original): si alguien la
    edito en medio, no se pisa.
  - Es idempotente: una segunda corrida encuentra 0 candidatas (el texto corregido ya no calza con ningun patron) y
    el respaldo conserva el ORIGINAL de la primera.
  - Las columnas old_estado / new_estado no se tocan: siguen guardando el CODIGO.

Para DESHACER (restaura el texto original de todo lo que corrigio este script):
    UPDATE activity_logs a SET description = r.description_original
    FROM activity_logs_respaldo_textos r
    WHERE a.id = r.id AND a.description = r.description_nueva;
La tabla de respaldo queda en la base hasta que el usuario decida borrarla (DROP TABLE activity_logs_respaldo_textos).
"""
import os
import re
import sys
import argparse

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from sqlalchemy import text

from app.core.textos_actividad import (
    ACCIONES_DEL_SISTEMA, ENTIDADES_CORREGIBLES, corregir_descripcion_historica,
)

TABLA_RESPALDO = "activity_logs_respaldo_textos"
_NOMBRE_DE_TABLA = re.compile(r"^[a-z_][a-z0-9_]*$")
MAX_EJEMPLOS = 50


def _tipo_de_correccion(entidad, accion, original) -> str:
    """Nombre corto del tipo de correccion, para el conteo del reporte."""
    if "Cotizacion" in original and "Lineas" in original:
        return "Cotización convertida (Líneas)"
    if "Cotizacion" in original:
        return "Cotización (creada / título de estado)"
    if original.startswith("Estado cambiado a "):
        return "Estado cambiado a CÓDIGO"
    if original.startswith("Pago "):
        return "Pago cambiado a CÓDIGO"
    if original.startswith("Solicitud restaurada a "):
        return "Solicitud restaurada a CÓDIGO"
    return "Otra"


def corregir(db, aplicar=False, ids=None, tabla_respaldo=TABLA_RESPALDO) -> dict:
    """Calcula (y con aplicar=True escribe) la correccion de los textos viejos de la Actividad.

    ids: si se pasa, solo esas filas de activity_logs (las pruebas filtran siempre por sus propios ids).
    Devuelve {'candidatas': n, 'corregidas': n, 'ejemplos': [(id, antes, despues), ...], 'por_tipo': {...}}.
    Sin aplicar no escribe nada (ni crea la tabla de respaldo). Con aplicar es UNA transaccion: commit al final y
    rollback ante cualquier error.
    """
    if not isinstance(tabla_respaldo, str) or not _NOMBRE_DE_TABLA.match(tabla_respaldo):
        raise ValueError(f"Nombre de tabla de respaldo no válido: {tabla_respaldo!r}")
    consulta = ("SELECT id, entity_type, action, description FROM activity_logs "
                "WHERE entity_type = ANY(:entidades) AND action = ANY(:acciones) AND description IS NOT NULL")
    parametros = {"entidades": sorted(ENTIDADES_CORREGIBLES), "acciones": sorted(ACCIONES_DEL_SISTEMA)}
    if ids is not None:
        consulta += " AND id = ANY(:ids)"
        parametros["ids"] = [int(i) for i in ids]
    consulta += " ORDER BY id"
    try:
        candidatas = []  # (id, original, nueva, tipo)
        for fila_id, entidad, accion, descripcion in db.execute(text(consulta), parametros).all():
            nueva = corregir_descripcion_historica(entidad, accion, descripcion)
            if nueva is not None:
                candidatas.append((fila_id, descripcion, nueva, _tipo_de_correccion(entidad, accion, descripcion)))
        por_tipo = {}
        for _, _, _, tipo in candidatas:
            por_tipo[tipo] = por_tipo.get(tipo, 0) + 1
        resultado = {
            "candidatas": len(candidatas),
            "corregidas": 0,
            "ejemplos": [(i, antes, despues) for i, antes, despues, _ in candidatas[:MAX_EJEMPLOS]],
            "por_tipo": por_tipo,
        }
        if not aplicar:
            db.rollback()
            return resultado
        db.execute(text(
            f"CREATE TABLE IF NOT EXISTS {tabla_respaldo} ("
            "id INTEGER PRIMARY KEY, "
            "description_original TEXT NOT NULL, "
            "description_nueva TEXT NOT NULL, "
            "corregido_at TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'))"))
        corregidas = 0
        for fila_id, original, nueva, _ in candidatas:
            cambio = db.execute(
                text("UPDATE activity_logs SET description = :nueva WHERE id = :id AND description = :original"),
                {"nueva": nueva, "id": fila_id, "original": original})
            if cambio.rowcount != 1:
                continue  # alguien la edito despues de leerla: no se pisa y no queda respaldo de algo que no cambio
            db.execute(
                text(f"INSERT INTO {tabla_respaldo} (id, description_original, description_nueva) "
                     "VALUES (:id, :original, :nueva) ON CONFLICT (id) DO NOTHING"),
                {"id": fila_id, "original": original, "nueva": nueva})
            corregidas += 1
        db.commit()
        resultado["corregidas"] = corregidas
        return resultado
    except Exception:
        db.rollback()
        raise


def main():
    parser = argparse.ArgumentParser(
        description="Corrige los textos viejos de la Actividad de Ventas (tildes y estados legibles).")
    parser.add_argument("--aplicar", action="store_true",
                        help="Escribe los cambios (con respaldo). Sin esta opcion solo reporta (dry-run).")
    args = parser.parse_args()

    from app.db.database import SessionLocal, SQLALCHEMY_DATABASE_URL
    from app.core.preflight import _mask_url

    modo = "APLICAR (escribe, con respaldo)" if args.aplicar else "DRY-RUN (solo reporta, no escribe)"
    print(f"Conectando a -> {_mask_url(SQLALCHEMY_DATABASE_URL)}  [{modo}]")
    db = SessionLocal()
    try:
        res = corregir(db, aplicar=args.aplicar)
    finally:
        db.close()

    print(f"Candidatas encontradas: {res['candidatas']}")
    for tipo, n in sorted(res["por_tipo"].items()):
        print(f"  {n:>6}  {tipo}")
    print(f"Ejemplos (hasta {MAX_EJEMPLOS}), 'antes -> después':")
    for fila_id, antes, despues in res["ejemplos"]:
        print(f"  #{fila_id}: {antes!r} -> {despues!r}")
    if args.aplicar:
        print(f"Corregidas: {res['corregidas']} (respaldo en {TABLA_RESPALDO})")
    else:
        print("DRY-RUN: no se escribió nada. Para aplicar: python scripts/corregir_textos_actividad.py --aplicar")


if __name__ == "__main__":
    main()
