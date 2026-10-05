"""
ajustar_estados_solicitud.py -- U15 (Bloque 2): la solicitud (SC) cuenta solo su propia historia. Ajusta los DATOS
VIEJOS que quedaron de cuando la SC reflejaba el estado de su cotizacion, y los leads del CRM que quedaron 'Perdido'
aunque su solicitud ya no esta cancelada (U18+H33, consulta (b)). El codigo ya no genera ninguno de los dos casos.

Uso (desde backend/, con el python del venv):
    python scripts/ajustar_estados_solicitud.py                                  REPORTE (por defecto): solo cuenta y
                                                                                 muestra ejemplos de las dos partes
    python scripts/ajustar_estados_solicitud.py --aplicar --base erp_test        aplica ajustar (estados), con respaldo
    python scripts/ajustar_estados_solicitud.py --aplicar-leads --base erp_test  aplica ajustar_leads (leads), con
                                                                                 respaldo

El reporte es lo unico que corre solo (en una transaccion de SOLO LECTURA). --aplicar y --aplicar-leads son ESCRITURAS
en la base destino (la que imprime al empezar, con la contrasena enmascarada, y su SELECT current_database()) y cada una
necesita su propia autorizacion explicita del usuario en cada entorno (T12; produccion con un OK aparte): por eso no
se aceptan juntas (una corrida, una parte, un commit). Como correcciones_bloque1.py (B9), las dos exigen --base
<nombre> igual a current_database(): sin --base es un error de argumentos y si no coincide aborta (codigo 2) sin
escribir nada. Orden de T12 (R26): despues de limpiar_motivo_en_notas.py y antes de corregir_actividad_sc_sin_precio.py;
reporte -> OK -> aplicar -> reporte en 0.

Reglas de ajustar (estados de la SC), las mismas de la sincronizacion de U15 (R29) y de C6:
  - SC en un estado heredado (COTIZADA, EN_ESPERA_CONFIRMACION, RECHAZADA, VENCIDA):
      con documentos activos (una COT no rechazada o un pedido vigente, el filtro de _documentos_activos_de_solicitud)
          -> CONFIRMADA (el avance se ve en la cotizacion y en el pedido);
      sin documentos activos y con la confirmacion del cliente (gate1_confirmed_at) -> CONFIRMADA;
      sin documentos activos ni confirmacion -> ASIGNADA con asesor o BORRADOR (Nueva) sin el.
  - SC CONFIRMADA sin gate1_confirmed_at y sin documentos activos -> ASIGNADA o BORRADOR.
  El script NUNCA cambia gate1_confirmed_at: solo pasa a ASIGNADA/BORRADOR SC que ya la tienen en NULL (con la marca
  van a CONFIRMADA). Al pasar a ASIGNADA/BORRADOR se anulan los enlaces de confirmacion pendientes de la SC.
  Cada SC ajustada deja un renglon ESTADO_CHANGED en su Actividad, user_name 'Sistema (ajuste de estados)'. updated_at
  NO se toca (para no esconder alertas). Los estados ajenos (de otro documento, p. ej. 'ENTREGADO') no son de este
  script: los decide documento por documento el paso n5 de correcciones_bloque1.py.

Reglas de ajustar_leads (R26, ruling T2A-4): leads (tabla sales_orders) con status 'CANCELLED' cuya solicitud
(canonical_customer_request_id) no esta CANCELADA hoy PERO lo estuvo alguna vez (un renglon de su Actividad con
new_estado 'CANCELADA'; un lead que alguien paso a 'Perdido' a mano en el CRM, sin cancelar la SC, no se revive)
-> QUOTATION si la SC tiene una COT activa, DRAFT si no; la etapa del tablero es la de ese maps_to_status (la de menor
posicion; NULL si el tablero no la tiene). Se elige cada lead por su id (no 'el primer lead de la SC') y nunca se crean
etapas. No usa mover_lead_de_solicitud (hace commits propios). El reporte muestra, por candidato, la fecha de la
ultima cancelacion y de la ultima restauracion de la SC.

Las dos partes:
  - excluyen SIEMPRE los documentos reales (DOCUMENTOS_REALES) y todo lo vinculado a ellos (calcular_excluidos de
    correcciones_bloque1: SC <-> COT <-> PVEN) y las solicitudes de Soporte Tecnico;
  - en el reporte no escriben nada (ni crean la tabla de respaldo);
  - al aplicar respaldan cada fila en su tabla (CREATE TABLE IF NOT EXISTS; INSERT ... ON CONFLICT (id) DO NOTHING: la
    tabla conserva el ORIGINAL de la primera corrida) y hacen todo en UNA transaccion: commit al final, rollback ante
    cualquier error;
  - el UPDATE exige que la fila siga como se leyo (WHERE estado/status = original): si alguien la cambio en medio, no
    se pisa ni se respalda;
  - son idempotentes: una segunda corrida encuentra 0 candidatas.

Para DESHACER ajustar (restaura el estado de lo que cambio este script; la marca de Gate 1 no se toca: el script
nunca la cambio, y reponerla borraria una confirmacion real que el cliente diera despues del ajuste):
    UPDATE customer_requests c SET estado = r.estado_original
    FROM customer_requests_respaldo_estados r
    WHERE c.id = r.id AND c.estado = r.estado_nuevo;
  La columna gate1_original del respaldo es solo informativa (la marca que tenia la SC al ajustarla).
  (opcional) los renglones de Actividad que dejo:
    DELETE FROM activity_logs WHERE entity_type = 'SC' AND user_name = 'Sistema (ajuste de estados)'
      AND entity_id IN (SELECT id FROM customer_requests_respaldo_estados);
  Los enlaces de confirmacion anulados no se reponen (no hace falta: 'Enviar al cliente' genera uno nuevo).
Para DESHACER ajustar_leads:
    UPDATE sales_orders s SET status = r.status_original, pipeline_stage_id = r.pipeline_stage_id_original
    FROM sales_orders_respaldo_leads r
    WHERE s.id = r.id AND s.status = r.status_nuevo;
Las tablas de respaldo quedan en la base hasta que el usuario decida borrarlas
(DROP TABLE customer_requests_respaldo_estados; DROP TABLE sales_orders_respaldo_leads).
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
from app.core.textos_actividad import ESTADOS_SC_HEREDADOS, etiqueta_estado

# Documentos reales del usuario (R32): NUNCA se tocan, ni lo vinculado a ellos. Se lee en cada llamada (las pruebas
# lo cambian con monkeypatch): nunca como valor por defecto de un parametro.
DOCUMENTOS_REALES = ("SC-20260731", "COT-20260449", "PVEN-20262799", "SC-20260746")

TABLA_RESPALDO_ESTADOS = "customer_requests_respaldo_estados"
TABLA_RESPALDO_LEADS = "sales_orders_respaldo_leads"
AUTOR = "Sistema (ajuste de estados)"
SOPORTE_TECNICO = "Soporte Tecnico"  # asi esta guardado (sin tilde)
# Se valida con fullmatch y sin '$': '$' tambien acepta un salto de linea al final (un nombre como 'abc' + LF).
_NOMBRE_DE_TABLA = re.compile(r"[a-z_][a-z0-9_]*")
MAX_EJEMPLOS = 50

# Reglas de ajustar (clave del conteo por regla -> como se lee en el reporte)
REGLAS = {
    "heredada_con_documentos": "heredada con documentos activos -> Confirmada",
    "heredada_con_confirmacion": "heredada sin documentos, con la confirmación del cliente -> Confirmada",
    "heredada_sin_confirmacion": "heredada sin documentos ni confirmación -> Asignada / Nueva",
    "confirmada_sin_confirmacion": "Confirmada sin confirmación del cliente ni documentos -> Asignada / Nueva",
}


def _validar_tabla(nombre):
    if not isinstance(nombre, str) or not _NOMBRE_DE_TABLA.fullmatch(nombre):
        raise ValueError(f"Nombre de tabla de respaldo no válido: {nombre!r}")


def _excluidas_sc(db) -> set:
    """Ids de SC que son documentos reales o estan vinculadas a uno (cierre transitivo de correcciones_bloque1)."""
    from scripts.correcciones_bloque1 import calcular_excluidos
    return set(calcular_excluidos(db, DOCUMENTOS_REALES).sc)


def _plan_de_estado(db, fila):
    """(nuevo, regla, texto de la Actividad) de una SC candidata, o None si se queda como esta."""
    from app.api.v1.erp_ventas import _describir_documentos, _documentos_activos_de_solicitud
    from app.models.erp_documents import SalesQuotation
    cots, pvens = _documentos_activos_de_solicitud(db, fila["id"])
    confirmada = etiqueta_estado("SC", "CONFIRMADA")
    if fila["estado"] in ESTADOS_SC_HEREDADOS and (cots or pvens):
        return ("CONFIRMADA", "heredada_con_documentos",
                f"Estado ajustado a {confirmada}: la solicitud ya no cambia con su cotización; el avance se ve en "
                f"{_describir_documentos(cots, pvens, con_articulo=True)}")
    if cots or pvens:
        return None  # CONFIRMADA sin la marca pero con documentos activos: se queda (la confirmo su cotizacion)
    if fila["estado"] in ESTADOS_SC_HEREDADOS and fila["gate1_confirmed_at"] is not None:
        return ("CONFIRMADA", "heredada_con_confirmacion",
                f"Estado ajustado a {confirmada}: la solicitud ya no cambia con su cotización; la confirmación del "
                f"cliente sigue vigente y ya puedes crearle una nueva cotización")
    nuevo = "ASIGNADA" if fila["advisor_user_id"] else "BORRADOR"
    regla = "heredada_sin_confirmacion" if fila["estado"] in ESTADOS_SC_HEREDADOS else "confirmada_sin_confirmacion"
    tuvo_cotizacion = db.query(SalesQuotation.id).filter(SalesQuotation.sc_id == fila["id"]).first() is not None
    if tuvo_cotizacion:  # todas rechazadas
        texto = (f"Estado ajustado a {etiqueta_estado('SC', nuevo)}: su cotización fue rechazada; para cotizar de "
                 f"nuevo, reenvíasela al cliente para que la confirme")
    else:
        texto = (f"Estado ajustado a {etiqueta_estado('SC', nuevo)}: no tiene cotizaciones activas; para cotizarla, "
                 f"envíasela al cliente para que la confirme")
    return nuevo, regla, texto


def ajustar(db, aplicar=False, ids=None, tabla_respaldo=TABLA_RESPALDO_ESTADOS) -> dict:
    """Calcula (y con aplicar=True escribe) el ajuste de los estados de las SC (reglas en el docstring del modulo).

    ids: si se pasa, solo esas SC (las pruebas filtran siempre por sus propios ids).
    Devuelve {'candidatas', 'ajustadas', 'excluidas', 'ejemplos': [{id, numero, estado, nuevo, regla, motivo}],
    'por_regla': {regla: n}}. 'excluidas' cuenta las que lo serian pero son documentos reales o estan vinculadas a uno.
    Sin aplicar no escribe nada (ni crea la tabla de respaldo). Con aplicar es UNA transaccion: commit al final y
    rollback ante cualquier error.
    """
    _validar_tabla(tabla_respaldo)
    consulta = ("SELECT id, numero, estado, advisor_user_id, gate1_confirmed_at FROM customer_requests "
                "WHERE (estado = ANY(:heredados) OR (estado = 'CONFIRMADA' AND gate1_confirmed_at IS NULL)) "
                "AND tipo_solicitud IS DISTINCT FROM :soporte")
    parametros = {"heredados": list(ESTADOS_SC_HEREDADOS), "soporte": SOPORTE_TECNICO}
    if ids is not None:
        consulta += " AND id = ANY(:ids)"
        parametros["ids"] = [int(i) for i in ids]
    consulta += " ORDER BY id"
    try:
        excluidas_sc = _excluidas_sc(db)
        candidatas, excluidas = [], 0
        for fila in db.execute(text(consulta), parametros).mappings().all():
            plan = _plan_de_estado(db, fila)
            if plan is None:
                continue
            if fila["id"] in excluidas_sc:
                excluidas += 1
                continue
            nuevo, regla, motivo = plan
            candidatas.append({"id": fila["id"], "numero": fila["numero"], "estado": fila["estado"],
                               "gate1_original": fila["gate1_confirmed_at"], "nuevo": nuevo, "regla": regla,
                               "motivo": motivo})
        por_regla = {}
        for c in candidatas:
            por_regla[c["regla"]] = por_regla.get(c["regla"], 0) + 1
        resultado = {
            "candidatas": len(candidatas),
            "ajustadas": 0,
            "excluidas": excluidas,
            "ejemplos": [{k: c[k] for k in ("id", "numero", "estado", "nuevo", "regla", "motivo")}
                         for c in candidatas[:MAX_EJEMPLOS]],
            "por_regla": por_regla,
        }
        if not aplicar:
            db.rollback()
            return resultado
        from app.core.confirmation_tokens import revoke_pending_tokens
        from app.models.erp_documents import ActivityLog
        db.execute(text(
            f"CREATE TABLE IF NOT EXISTS {tabla_respaldo} ("
            "id INTEGER PRIMARY KEY, "
            "estado_original VARCHAR(50) NOT NULL, "
            "estado_nuevo VARCHAR(50) NOT NULL, "
            "gate1_original TIMESTAMP NULL, "  # solo informativa: el script nunca cambia gate1_confirmed_at
            "ajustado_at TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'))"))
        ajustadas = 0
        for c in candidatas:
            # Solo se reinicia (ASIGNADA/BORRADOR) una SC con gate1_confirmed_at NULL (_plan_de_estado): la marca no
            # se toca. Sin tocar updated_at (no esconde alertas).
            reinicia = c["nuevo"] in ("ASIGNADA", "BORRADOR")
            cambio = db.execute(
                text("UPDATE customer_requests SET estado = :nuevo WHERE id = :id AND estado = :original"),
                {"nuevo": c["nuevo"], "id": c["id"], "original": c["estado"]})
            if cambio.rowcount != 1:
                continue  # alguien la cambio despues de leerla: no se pisa y no queda respaldo de algo que no cambio
            db.execute(
                text(f"INSERT INTO {tabla_respaldo} (id, estado_original, estado_nuevo, gate1_original) "
                     "VALUES (:id, :original, :nuevo, :gate1) ON CONFLICT (id) DO NOTHING"),
                {"id": c["id"], "original": c["estado"], "nuevo": c["nuevo"], "gate1": c["gate1_original"]})
            if reinicia:
                revoke_pending_tokens(db, "SC", c["id"], commit=False)
            db.add(ActivityLog(entity_type="SC", entity_id=c["id"], entity_numero=c["numero"],
                               action="ESTADO_CHANGED", description=c["motivo"], old_estado=c["estado"],
                               new_estado=c["nuevo"], user_name=AUTOR, extra_data={"regla": c["regla"]}))
            ajustadas += 1
        db.commit()
        resultado["ajustadas"] = ajustadas
        return resultado
    except Exception:
        db.rollback()
        raise


def _etapa_de(db, status):
    """(id, nombre) de la etapa del tablero con ese maps_to_status (la de menor posicion), o (None, None)."""
    fila = db.execute(text("SELECT id, name FROM pipeline_stages WHERE maps_to_status = :s ORDER BY position, id "
                           "LIMIT 1"), {"s": status}).first()
    return (fila[0], fila[1]) if fila else (None, None)


def ajustar_leads(db, aplicar=False, ids=None, tabla_respaldo=TABLA_RESPALDO_LEADS) -> dict:
    """Calcula (y con aplicar=True escribe) el ajuste de los leads 'Perdido' de solicitudes que ya no estan canceladas.

    Solo leads de una SC que estuvo cancelada alguna vez (renglon de su Actividad con new_estado 'CANCELADA'): un lead
    que alguien paso a 'Perdido' a mano en el CRM, sin cancelar la SC, no se revive.
    ids: ids de SOLICITUD (customer_requests), no de lead. Devuelve {'candidatos', 'movidos', 'excluidos',
    'ejemplos': [{lead_id, sc_id, sc_numero, sc_estado, status, nuevo, etapa_id, etapa, ultima_cancelacion,
    ultima_restauracion}]}. Sin aplicar no escribe nada (ni crea la tabla de respaldo ni etapas). Con aplicar es UNA
    transaccion: commit al final y rollback ante cualquier error.
    """
    _validar_tabla(tabla_respaldo)
    consulta = ("SELECT so.id AS lead_id, so.status, so.pipeline_stage_id, cr.id AS sc_id, cr.numero AS sc_numero, "
                "cr.estado AS sc_estado, "
                "EXISTS (SELECT 1 FROM sales_quotations q WHERE q.sc_id = cr.id AND q.estado <> 'RECHAZADA') "
                "AS cot_activa, "
                "(SELECT max(a.created_at) FROM activity_logs a WHERE a.entity_type = 'SC' AND a.entity_id = cr.id "
                " AND (a.action = 'CANCELLED' OR a.new_estado = 'CANCELADA')) AS ultima_cancelacion, "
                "(SELECT max(a.created_at) FROM activity_logs a WHERE a.entity_type = 'SC' AND a.entity_id = cr.id "
                " AND a.action = 'RESTORED') AS ultima_restauracion "
                "FROM sales_orders so JOIN customer_requests cr ON cr.id = so.canonical_customer_request_id "
                "WHERE so.status = 'CANCELLED' AND cr.estado <> 'CANCELADA' "
                "AND cr.tipo_solicitud IS DISTINCT FROM :soporte "
                "AND EXISTS (SELECT 1 FROM activity_logs a WHERE a.entity_type = 'SC' AND a.entity_id = cr.id "
                "            AND a.new_estado = 'CANCELADA')")
    parametros = {"soporte": SOPORTE_TECNICO}
    if ids is not None:
        consulta += " AND cr.id = ANY(:ids)"
        parametros["ids"] = [int(i) for i in ids]
    consulta += " ORDER BY so.id"
    try:
        excluidas_sc = _excluidas_sc(db)
        etapas = {s: _etapa_de(db, s) for s in ("QUOTATION", "DRAFT")}
        candidatos, excluidos = [], 0
        for fila in db.execute(text(consulta), parametros).mappings().all():
            if fila["sc_id"] in excluidas_sc:
                excluidos += 1
                continue
            nuevo = "QUOTATION" if fila["cot_activa"] else "DRAFT"
            etapa_id, etapa = etapas[nuevo]
            candidatos.append({"lead_id": fila["lead_id"], "sc_id": fila["sc_id"], "sc_numero": fila["sc_numero"],
                               "sc_estado": fila["sc_estado"], "status": fila["status"],
                               "pipeline_stage_id": fila["pipeline_stage_id"], "nuevo": nuevo, "etapa_id": etapa_id,
                               "etapa": etapa, "ultima_cancelacion": fila["ultima_cancelacion"],
                               "ultima_restauracion": fila["ultima_restauracion"]})
        resultado = {
            "candidatos": len(candidatos),
            "movidos": 0,
            "excluidos": excluidos,
            "ejemplos": [{k: c[k] for k in ("lead_id", "sc_id", "sc_numero", "sc_estado", "status", "nuevo",
                                            "etapa_id", "etapa", "ultima_cancelacion", "ultima_restauracion")}
                         for c in candidatos[:MAX_EJEMPLOS]],
        }
        if not aplicar:
            db.rollback()
            return resultado
        db.execute(text(
            f"CREATE TABLE IF NOT EXISTS {tabla_respaldo} ("
            "id INTEGER PRIMARY KEY, "
            "status_original VARCHAR NOT NULL, "
            "pipeline_stage_id_original INTEGER NULL, "
            "status_nuevo VARCHAR NOT NULL, "
            "ajustado_at TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'))"))
        movidos = 0
        for c in candidatos:
            cambio = db.execute(
                text("UPDATE sales_orders SET status = :nuevo, pipeline_stage_id = :etapa "
                     "WHERE id = :id AND status = :original"),
                {"nuevo": c["nuevo"], "etapa": c["etapa_id"], "id": c["lead_id"], "original": c["status"]})
            if cambio.rowcount != 1:
                continue
            db.execute(
                text(f"INSERT INTO {tabla_respaldo} (id, status_original, pipeline_stage_id_original, status_nuevo) "
                     "VALUES (:id, :original, :etapa_original, :nuevo) ON CONFLICT (id) DO NOTHING"),
                {"id": c["lead_id"], "original": c["status"], "etapa_original": c["pipeline_stage_id"],
                 "nuevo": c["nuevo"]})
            movidos += 1
        db.commit()
        resultado["movidos"] = movidos
        return resultado
    except Exception:
        db.rollback()
        raise


def _fecha_utc(valor) -> str:
    """Fecha de la Actividad (UTC sin zona) para el reporte, o 'nunca'."""
    return valor.strftime("%Y-%m-%d %H:%M UTC") if valor else "nunca"


def _solo_lectura(db):
    """El reporte corre en una transaccion de SOLO LECTURA (la siguiente sentencia abre la transaccion)."""
    db.execute(text("SET TRANSACTION READ ONLY"))


def main(argv=None) -> int:
    """0 si termino; 2 si --base no coincide con current_database() (no escribe nada). Sin --base, --aplicar o
    --aplicar-leads son un error de argumentos, y tambien pasarlas juntas (argparse sale con 2)."""
    parser = argparse.ArgumentParser(
        description="Ajusta los estados heredados de las solicitudes y los leads perdidos de solicitudes vivas (U15).")
    # Cada parte se aplica con su propio OK y en su propia corrida (un commit por corrida): no van juntas.
    aplicar = parser.add_mutually_exclusive_group()
    aplicar.add_argument("--aplicar", action="store_true",
                         help="Escribe el ajuste de estados de las solicitudes (con respaldo).")
    aplicar.add_argument("--aplicar-leads", action="store_true",
                         help="Escribe el ajuste de los leads del CRM (con respaldo).")
    parser.add_argument("--base", help="con --aplicar/--aplicar-leads: nombre de la base; debe ser igual a "
                                       "current_database()")
    args = parser.parse_args(argv)
    escribe = args.aplicar or args.aplicar_leads
    if escribe and not args.base:
        parser.error("--aplicar y --aplicar-leads exigen --base <nombre de la base>, igual a current_database()")

    from app.db.database import SessionLocal, SQLALCHEMY_DATABASE_URL
    from app.core.preflight import _mask_url

    if escribe:
        modo = f"APLICAR {'estados' if args.aplicar else 'leads'} (escribe, con respaldo)"
    else:
        modo = "REPORTE (solo lectura, no escribe)"
    print(f"Conectando a -> {_mask_url(SQLALCHEMY_DATABASE_URL)}  [{modo}]")
    db = SessionLocal()
    res_estados = res_leads = None
    try:
        if not escribe:
            _solo_lectura(db)
        base = db.execute(text("SELECT current_database()")).scalar()
        print(f"SELECT current_database() -> {base}")
        if escribe and args.base != base:
            db.rollback()
            print(f"ABORTADO: --base {args.base!r} no coincide con la base a la que está conectado el script "
                  f"({base!r}): no se escribió nada.", file=sys.stderr)
            return 2
        if args.aplicar or not escribe:
            res_estados = ajustar(db, aplicar=args.aplicar)
        if args.aplicar_leads or not escribe:
            if not escribe:
                _solo_lectura(db)  # ajustar cerro su transaccion: la siguiente tambien es de solo lectura
            res_leads = ajustar_leads(db, aplicar=args.aplicar_leads)
    finally:
        db.close()

    if res_estados is not None:
        print("\n== Estados de las solicitudes (ajustar) ==")
        print(f"Candidatas: {res_estados['candidatas']}  (excluidas por documentos reales o vinculadas a ellos: "
              f"{res_estados['excluidas']})")
        for regla, n in sorted(res_estados["por_regla"].items()):
            print(f"  {n:>6}  {REGLAS.get(regla, regla)}")
        print(f"Ejemplos (hasta {MAX_EJEMPLOS}):")
        for e in res_estados["ejemplos"]:
            print(f"  {e['numero']} (#{e['id']}): {etiqueta_estado('SC', e['estado'])} ({e['estado']}) -> "
                  f"{etiqueta_estado('SC', e['nuevo'])} ({e['nuevo']}). {e['motivo']}")
        if args.aplicar:
            print(f"Ajustadas: {res_estados['ajustadas']} (respaldo en {TABLA_RESPALDO_ESTADOS})")
    if res_leads is not None:
        print("\n== Leads del CRM perdidos de solicitudes que no están canceladas (ajustar_leads) ==")
        print(f"Candidatos: {res_leads['candidatos']}  (excluidos por documentos reales o vinculados a ellos: "
              f"{res_leads['excluidos']})")
        print(f"Ejemplos (hasta {MAX_EJEMPLOS}):")
        for e in res_leads["ejemplos"]:
            etapa = f"etapa '{e['etapa']}'" if e["etapa"] else "sin etapa con ese estado en el tablero"
            print(f"  lead #{e['lead_id']} de {e['sc_numero']} ({etiqueta_estado('SC', e['sc_estado'])}): "
                  f"{e['status']} -> {e['nuevo']}, {etapa}. SC cancelada por última vez: "
                  f"{_fecha_utc(e['ultima_cancelacion'])}; restaurada por última vez: "
                  f"{_fecha_utc(e['ultima_restauracion'])}")
        if args.aplicar_leads:
            print(f"Movidos: {res_leads['movidos']} (respaldo en {TABLA_RESPALDO_LEADS})")
    if not escribe:
        print("\nREPORTE: no se escribió nada. Para aplicar (cada parte con su propio OK del usuario):\n"
              "  python scripts/ajustar_estados_solicitud.py --aplicar --base <nombre de la base>\n"
              "  python scripts/ajustar_estados_solicitud.py --aplicar-leads --base <nombre de la base>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
