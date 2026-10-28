"""B4 T1C (R9, C10; RP40, RP67, RP78, D18): estados, etapas y reglas de los pedidos de compra (app/core/estados_compras.py)
y sus etiquetas (textos_actividad.ETIQUETAS_ESTADO['PEC'] y ['ENINV']).

Casi todo son tablas puras; las condiciones SQL se comprueban sobre PEC creados dentro de la transaccion del runner de
ROLLBACK (python tests/rollback_runner.py test_estados_compras). La paridad con lib/estados-compras.js es de T2
(test_paridad_estados_compras.py). Sin parametrize: las matrices van en un bucle.
"""
import uuid
from datetime import date, datetime, time, timedelta

from sqlalchemy import select

from app.models.erp_documents import PurchaseOrderFull

ESTADOS_R9 = ("BORRADOR", "EMITIDO", "ENVIADO", "EN_TRANSITO", "PENDIENTE_ENTREGA", "RECIBIDO", "PARCIALMENTE_RECIBIDA",
              "RECIBIDA", "COMPLETADO", "CANCELADO")
ETAPA_R9 = {"BORRADOR": "borrador", "EMITIDO": "emitido", "ENVIADO": "emitido", "EN_TRANSITO": "en_transito",
            "PENDIENTE_ENTREGA": "en_transito", "RECIBIDO": "en_bodega", "PARCIALMENTE_RECIBIDA": "en_bodega",
            "RECIBIDA": "recibido", "COMPLETADO": "recibido", "CANCELADO": "cancelado"}


def _estados(*etapas):
    return {e for e, etapa in ETAPA_R9.items() if etapa in etapas}


# ─── Etapas (R9) ─────────────────────────────────────────────────────────────────────────────────────────────────────

def test_cada_estado_del_pec_en_una_sola_etapa():
    from app.core.estados_compras import ESTADOS_PEC, ETAPAS_PEC, etapa_pec
    assert ESTADOS_PEC == ESTADOS_R9
    assert list(ETAPAS_PEC) == ["borrador", "emitido", "en_transito", "en_bodega", "recibido", "cancelado"]
    vistos = [e for estados in ETAPAS_PEC.values() for e in estados]
    assert sorted(vistos) == sorted(ESTADOS_R9)              # cada estado en una sola etapa
    for estado, etapa in ETAPA_R9.items():
        assert etapa_pec(estado) == etapa, estado
        assert estado in ETAPAS_PEC[etapa]
    for raro in ("CONFIRMADA", "ENVIADA", "XYZ", "", None):   # un estado desconocido cuenta como emitido
        assert etapa_pec(raro) == "emitido", raro


def test_grupos_activos_vigentes_y_vencibles():
    from app.core.estados_compras import GRUPOS_PEC
    assert set(GRUPOS_PEC) == {"activos", "vigentes", "vencibles"}
    assert set(GRUPOS_PEC["activos"]) == _estados("emitido", "en_transito", "en_bodega")
    assert set(GRUPOS_PEC["vigentes"]) == set(ESTADOS_R9) - {"CANCELADO"}
    assert set(GRUPOS_PEC["vencibles"]) == _estados("emitido", "en_transito")


def test_vistas_de_las_listas():
    from app.core.estados_compras import VISTAS_PEC
    esperado = {
        "todos": set(ESTADOS_R9) - {"CANCELADO"},     # R9: «Todos (vigentes)»; entre las pestañas de lista, cancelados solo en «cancelados»
        "vigentes": set(ESTADOS_R9) - {"CANCELADO"},
        "activos": _estados("emitido", "en_transito", "en_bodega"),
        "borradores": {"BORRADOR"},
        "pedidos": _estados("borrador", "emitido"),
        "en_transito": _estados("en_transito"),
        "en_bodega": _estados("en_bodega"),
        "recibidos": {"RECIBIDA", "COMPLETADO"},
        "cancelados": {"CANCELADO"},
        "no_resueltos": _estados("emitido", "en_transito", "en_bodega"),
        "acciones_tomadas": {"RECIBIDA", "COMPLETADO", "CANCELADO"},
        "transito_logistica": _estados("emitido", "en_transito", "en_bodega"),
    }
    assert set(VISTAS_PEC) == set(esperado)
    for vista, estados in esperado.items():
        assert set(VISTAS_PEC[vista]) == estados, vista
    assert VISTAS_PEC["todos"] == VISTAS_PEC["vigentes"]


def test_la_vista_todos_trae_los_vigentes_y_el_desconocido():
    """r1: «todos» son los vigentes (R9), con la regla del estado desconocido (cuenta como emitido)."""
    from app.core.estados_compras import VISTAS_PEC, en_estados_pec
    assert en_estados_pec("CANCELADO", VISTAS_PEC["todos"]) is False
    assert en_estados_pec("CANCELADO", VISTAS_PEC["cancelados"]) is True
    for estado in ("CONFIRMADA", "BORRADOR", "RECIBIDA", "EN_TRANSITO"):
        assert en_estados_pec(estado, VISTAS_PEC["todos"]) is True, estado


def test_en_estados_pec_cuenta_el_desconocido_como_emitido():
    from app.core.estados_compras import GRUPOS_PEC, VISTAS_PEC, en_estados_pec
    assert en_estados_pec("CONFIRMADA", GRUPOS_PEC["activos"]) is True
    assert en_estados_pec("CONFIRMADA", GRUPOS_PEC["vencibles"]) is True
    assert en_estados_pec("CONFIRMADA", VISTAS_PEC["todos"]) is True
    assert en_estados_pec("CONFIRMADA", VISTAS_PEC["recibidos"]) is False
    assert en_estados_pec("RECIBIDA", VISTAS_PEC["recibidos"]) is True
    assert en_estados_pec("RECIBIDO", GRUPOS_PEC["vencibles"]) is False


# ─── Vencido (R9, RP40) ──────────────────────────────────────────────────────────────────────────────────────────────

def test_es_vencido_solo_emitido_y_en_transito_con_la_fecha_pasada():
    from app.core.estados_compras import es_vencido
    hoy = date(2026, 10, 28)
    ayer = datetime(2026, 10, 27, 15, 30)
    for estado, etapa in ETAPA_R9.items():
        assert es_vencido(estado, ayer, hoy) is (etapa in ("emitido", "en_transito")), estado
    assert es_vencido("CONFIRMADA", ayer, hoy) is True                       # desconocido = emitido
    # RP40: el dia es el que se guarda (.date()), sin pasarlo a Colombia; hoy a las 00:00 no esta vencido hoy.
    assert es_vencido("EMITIDO", datetime.combine(hoy, time(0, 0)), hoy) is False
    assert es_vencido("EMITIDO", datetime.combine(hoy, time(23, 59)), hoy) is False
    assert es_vencido("EMITIDO", datetime(2026, 10, 27, 23, 59, 59), hoy) is True
    assert es_vencido("EN_TRANSITO", date(2026, 10, 27), hoy) is True
    assert es_vencido("EN_TRANSITO", "2026-10-27T23:00:00", hoy) is True     # el ISO del API: sus 10 primeros
    assert es_vencido("EN_TRANSITO", "2026-10-28T00:00:00Z", hoy) is False
    assert es_vencido("EMITIDO", None, hoy) is False                          # sin fecha no vence
    assert es_vencido("EMITIDO", "", hoy) is False
    assert es_vencido("EMITIDO", datetime(2026, 11, 2), hoy) is False


def _pec(db, numero, estado, fecha):
    p = PurchaseOrderFull(numero=numero, supplier_name="T1C", estado=estado, fecha_entrega_estimada=fecha)
    db.add(p)
    db.commit()
    return p


def test_las_condiciones_sql_son_las_de_python(db):
    """cond_estados_pec (con el desconocido como emitido) y cond_vencido (cast(... as date) < :hoy, RP40) dan lo mismo
    que en_estados_pec y es_vencido sobre PEC reales."""
    from app.core.estados_compras import (GRUPOS_PEC, VISTAS_PEC, cond_estados_pec, cond_vencido, en_estados_pec,
                                          es_vencido)
    from app.core.fechas import hoy_colombia
    hoy = hoy_colombia()
    sufijo = uuid.uuid4().hex[:6].upper()
    fechas = [datetime.combine(hoy - timedelta(days=1), time(23, 59)), datetime.combine(hoy, time(0, 0)),
              datetime.combine(hoy + timedelta(days=3), time(12, 0)), None]
    pecs = []
    for i, estado in enumerate(ESTADOS_R9 + ("CONFIRMADA",)):
        for j, fecha in enumerate(fechas):
            pecs.append(_pec(db, f"PEC-T1C{sufijo}{i:02d}{j}", estado, fecha))
    ids = [p.id for p in pecs]
    conjuntos = {**{f"grupo:{k}": v for k, v in GRUPOS_PEC.items()}, **{f"vista:{k}": v for k, v in VISTAS_PEC.items()}}
    for nombre, estados in conjuntos.items():
        en_sql = set(db.scalars(select(PurchaseOrderFull.id).where(PurchaseOrderFull.id.in_(ids),
                                                                   cond_estados_pec(PurchaseOrderFull.estado,
                                                                                    estados))))
        assert en_sql == {p.id for p in pecs if en_estados_pec(p.estado, estados)}, nombre
    vencidos = set(db.scalars(select(PurchaseOrderFull.id).where(
        PurchaseOrderFull.id.in_(ids),
        cond_vencido(PurchaseOrderFull.estado, PurchaseOrderFull.fecha_entrega_estimada, hoy))))
    esperado = {p.id for p in pecs if es_vencido(p.estado, p.fecha_entrega_estimada, hoy)}
    assert vencidos == esperado
    assert len(esperado) == 5   # EMITIDO, ENVIADO, EN_TRANSITO, PENDIENTE_ENTREGA y CONFIRMADA con la fecha de ayer


# ─── Transiciones a mano (KANBAN-compras 2) ──────────────────────────────────────────────────────────────────────────

def test_transiciones_pec_patch():
    from app.core.estados_compras import (ESTADOS_PEC_MANUALES, ESTADOS_POR_FLUJO, TRANSICIONES_PEC_PATCH,
                                          destinos_pec_permitidos)
    assert ESTADOS_PEC_MANUALES == ("EMITIDO", "CANCELADO")
    assert set(TRANSICIONES_PEC_PATCH) == set(ESTADOS_R9)
    assert TRANSICIONES_PEC_PATCH["BORRADOR"] == {"EMITIDO", "CANCELADO"}
    for estado in ("EMITIDO", "ENVIADO", "EN_TRANSITO", "PENDIENTE_ENTREGA"):
        assert TRANSICIONES_PEC_PATCH[estado] == {"CANCELADO"}, estado
    # Los cerrados (en bodega, recibido y cancelado) no tienen salida.
    for estado in ("RECIBIDO", "PARCIALMENTE_RECIBIDA", "RECIBIDA", "COMPLETADO", "CANCELADO"):
        assert TRANSICIONES_PEC_PATCH[estado] == frozenset(), estado
    # EMITIDO solo desde BORRADOR; CANCELADO desde borrador, emitido y en transito.
    assert sorted(e for e, d in TRANSICIONES_PEC_PATCH.items() if "EMITIDO" in d) == ["BORRADOR"]
    assert {e for e, d in TRANSICIONES_PEC_PATCH.items() if "CANCELADO" in d} == _estados("borrador", "emitido",
                                                                                          "en_transito")
    assert frozenset().union(*TRANSICIONES_PEC_PATCH.values()) == set(ESTADOS_PEC_MANUALES)
    # Un estado desconocido se trata como EMITIDO.
    for raro in ("CONFIRMADA", "XYZ", None):
        assert destinos_pec_permitidos(raro) == {"CANCELADO"}, raro
    assert destinos_pec_permitidos("BORRADOR") == {"EMITIDO", "CANCELADO"}
    assert destinos_pec_permitidos("RECIBIDA") == frozenset()
    assert dict(ESTADOS_POR_FLUJO) == {"EN_TRANSITO": "seguimiento", "PENDIENTE_ENTREGA": "seguimiento",
                                       "RECIBIDO": "recepcion", "PARCIALMENTE_RECIBIDA": "recepcion",
                                       "RECIBIDA": "recepcion", "COMPLETADO": "recepcion"}


def test_las_tablas_son_inmutables():
    from app.core import estados_compras as ec
    for mapa in (ec.ETAPAS_PEC, ec.GRUPOS_PEC, ec.VISTAS_PEC, ec.TRANSICIONES_PEC_PATCH, ec.ESTADOS_POR_FLUJO,
                 ec.GRUPOS_RECEPCION, ec.GRUPOS_OPERACION, ec.ESTADOS_ITEM_LISTA):
        try:
            mapa["X"] = ("Y",)
        except TypeError:
            pass
        else:
            raise AssertionError(f"{mapa!r} se pudo modificar")


# ─── Flujo de Compras (FLUJO-compras, R9) ────────────────────────────────────────────────────────────────────────────

def test_paso_flujo_pec_de_cada_etapa():
    from app.core.estados_compras import PASOS_FLUJO_COMPRAS, paso_flujo_pec
    assert PASOS_FLUJO_COMPRAS == ("LISTA", "PEC", "TRANSITO", "RECEPCION", "RECIBIDO")
    paso_de_etapa = {"borrador": "PEC", "emitido": "PEC", "en_transito": "TRANSITO", "en_bodega": "RECEPCION",
                     "recibido": "RECIBIDO", "cancelado": None}
    for estado, etapa in ETAPA_R9.items():
        assert paso_flujo_pec(estado) == paso_de_etapa[etapa], estado
    assert paso_flujo_pec("CONFIRMADA") == "PEC"   # desconocido = emitido


# ─── Recepciones, operaciones de inventario e items de la lista (R9, KPI-compras 1) ──────────────────────────────────

def test_grupos_de_recepcion_operacion_y_lista():
    from app.core.estados_compras import (ESTADOS_ITEM_LISTA, GRUPOS_OPERACION, GRUPOS_RECEPCION, grupo_operacion,
                                          grupo_recepcion)
    assert {k: set(v) for k, v in GRUPOS_RECEPCION.items()} == {
        "por_confirmar": {"BORRADOR"}, "confirmadas": {"COMPLETADA", "COMPLETADA_LOGISTICA"},
        "canceladas": {"CANCELADA"}}
    for estado, grupo in (("BORRADOR", "por_confirmar"), ("COMPLETADA", "confirmadas"),
                          ("COMPLETADA_LOGISTICA", "confirmadas"), ("CANCELADA", "canceladas"), ("XYZ", None),
                          (None, None)):
        assert grupo_recepcion(estado) == grupo, estado
    assert {k: set(v) for k, v in GRUPOS_OPERACION.items()} == {
        "en_proceso": {"DRAFT", "READY"}, "completadas": {"DONE"}, "canceladas": {"CANCELLED"}}
    for estado, grupo in (("DRAFT", "en_proceso"), ("READY", "en_proceso"), ("DONE", "completadas"),
                          ("CANCELLED", "canceladas"), ("XYZ", None)):
        assert grupo_operacion(estado) == grupo, estado
    assert dict(ESTADOS_ITEM_LISTA) == {"PENDIENTE": "Pendiente", "EN_PEDIDO": "En pedido", "RECIBIDO": "Recibido"}
    assert "DESCARTADO" not in ESTADOS_ITEM_LISTA   # no se muestra


# ─── Etiquetas (R9, RP67; prueba 9 de ANALISIS-compras) ──────────────────────────────────────────────────────────────

def test_etiquetas_pec_y_eninv_de_r9():
    from app.core.estados_compras import ESTADOS_PEC, GRUPOS_RECEPCION
    from app.core.textos_actividad import ETIQUETAS_ESTADO, etiqueta_estado
    assert ETIQUETAS_ESTADO["PEC"] == {
        "BORRADOR": "Borrador", "EMITIDO": "Emitido", "ENVIADO": "Enviado al proveedor", "EN_TRANSITO": "En tránsito",
        "PENDIENTE_ENTREGA": "Pendiente de entrega", "RECIBIDO": "Llegó a bodega",
        "PARCIALMENTE_RECIBIDA": "Recibido en parte", "RECIBIDA": "Recibido", "COMPLETADO": "Completado",
        "CANCELADO": "Cancelado"}
    assert ETIQUETAS_ESTADO["ENINV"] == {"BORRADOR": "Por contar", "COMPLETADA": "Recibida",
                                         "COMPLETADA_LOGISTICA": "Solo registro logístico", "CANCELADA": "Cancelada"}
    assert set(ETIQUETAS_ESTADO["PEC"]) == set(ESTADOS_PEC)
    assert set(ETIQUETAS_ESTADO["ENINV"]) == {e for v in GRUPOS_RECEPCION.values() for e in v}
    assert etiqueta_estado("PEC", "EN_TRANSITO") == "En tránsito"
    assert etiqueta_estado("PEC", "RECIBIDO") == "Llegó a bodega"
    assert etiqueta_estado("PEC", "PARCIALMENTE_RECIBIDA") == "Recibido en parte"   # RP67
    assert etiqueta_estado("ENINV", "BORRADOR") == "Por contar"
    assert etiqueta_estado("PEC", "BORRADOR") == "Borrador"


def test_docstring_de_etiqueta_estado_ya_no_dice_que_pec_no_tiene_mapa():
    """D18: PEC ya tiene mapa; el ejemplo de entidad sin mapa es PXP."""
    from app.core.textos_actividad import etiqueta_estado
    doc = etiqueta_estado.__doc__
    assert "PXP o PEC" not in doc and "sin mapa como PXP" in doc
