"""Hub de Ventas y flujo de Ventas calculados en el servidor (Bloque 4, T6A: TABLA-hub-ventas puntos 2 y 3,
FLUJO-ventas-datos punto 2 y el servidor de KANBAN-hub-ventas; R5, R6, R8, R21; C4, C5, C7, C8, C14).

router, montado en /api/v1/ventas con tags ["Ventas Hub"] (main.py). Todos los roles del ERP (ALL_ERP_ROLES); solo lee:
ninguna ruta hace commit.

GET /hub/documentos — la tabla y el tablero del Hub sobre TODAS las SC, COT y pedidos de venta, en UNA consulta UNION
ALL paginada en el servidor (el Hub ya no guarda arreglos en memoria, C4). Las SC de Soporte Tecnico no entran (R8).
  Parametros (R5 y R6; los de negocio se validan a mano y responden 422 en español, R21):
  - vista: todos (por defecto), no_resueltos, sc, cot, ven o acciones_tomadas (las pestañas). no_resueltos = atrasado o
    sin resolver; acciones_tomadas = accion tomada o cerrado (su composicion de siempre, C7).
  - semaforo: atrasados o no_resueltos (los botones del aviso, con las cuentas de GET /flujo); todos = sin filtro, como
    vista=todos (r1, M1: el frontend lo manda al quitar el filtro o con «Ver todo»).
  - paso: SC, COT, PVEN, ENTREGADO o FACTURADO (el diagrama; cond_paso: cada documento cae en un solo paso).
  - estados: pares TIPO:ESTADO en CSV ('SC:ASIGNADA,VEN:EN_PROCESO'; PVEN es alias de VEN), 20 como maximo; cada
    estado debe ser uno de los de su tipo (r1, M10: ETIQUETAS_ESTADO para SC y COT; los 18 de estados_pedido para VEN).
  - columna: No Resuelto, En Gestión, Acción Tomada o Cancelado (el tablero, expr_columna_hub; C7).
  - q: busca en el numero, el cliente, el asesor, los numeros de origen y los productos (solo q, sin alias search; RP8).
    q o un estado con un caracter de control (NUL incluido) -> 422 (r1, M13: core/listados).
  - orden: atencion (por defecto), sin_movimiento, reciente, o tipo, numero, cliente, asesor, creado, estado o monto, con
    '-' para descendente (leer_orden; otro valor, '-atencion', '-reciente' o '-sin_movimiento' -> 422).
  - limit (25; 0 a 200; 0 = solo el total), offset (0 a MAX_OFFSET de core/listados; fuera de rango, el 400 legible
    del manejador global, r1 M14) y con_conteos.
  Responde {status, total, data[, conteos]} (core/listados.respuesta). Con con_conteos:
  - conteos.pestanas = {todos, no_resueltos, sc, cot, ven, acciones_tomadas}, con q, estados y paso pero SIN vista,
    semaforo ni columna (R6);
  - conteos.grupos = {ATRASADO, NO_RESUELTO, ACCION_TOMADA, CERRADO}, con TODOS los filtros (los separadores).
  No trae 'semaforo' ni 'resumen': salen de GET /flujo y de GET /ventas/stats.
  Cada fila es _sc_dict / _cot_dict / _ven_dict (con el advisor_name de H4 en los pedidos) mas tipo ('SC', 'COT' o
  'VEN'), resolucion ('ATRASADO', 'NO_RESUELTO', 'ACCION_TOMADA' o 'CERRADO'), dias_sin_mov, dias_creado,
  seguimiento_estado ('AGOTADO', 'DETENIDO' o None) y cambios_cliente (None en los pedidos) (C14). Las SC traen las
  listas ligeras cotizaciones y pedidos_venta ({id, numero, estado}; los pedidos por sc_id y por el cot_id de sus COT);
  las COT, pedidos_venta (D37). La hidratacion son consultas IN con selectinload(customer), sin una por fila (RP20).

GET /flujo — resumen_flujo_ventas de core/resolucion_ventas.py con los dias de leer_dias_alerta: por paso total,
  atrasados, mas_antiguo_dias y por_estado; el semaforo (atrasados = la pastilla roja de alertas_resumen, C5); los dias de
  alerta; cambios_cliente (de un asesor, solo los suyos, RP12) y sin_respuesta; generado_at en UTC con 'Z'.

La regla de atraso, resolucion, pasos y columnas es SOLO la de core/resolucion_ventas.py (R8): aqui no se recalcula.
"""
from types import MappingProxyType
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Numeric, case, cast, false, func, literal, null, or_, select, union_all
from sqlalchemy.orm import Session, aliased, selectinload

from app.api.dependencies import ALL_ERP_ROLES, normalize_role, require_roles
from app.api.v1.erp_ventas import _asesores_de_pedidos, _cot_dict, _sc_dict, _ven_dict
from app.core import resolucion_ventas as rv
from app.core.busqueda import productos_ilike
from app.core.estados_pedido import VISTA_DE_GRUPO, estados_de_vista
from app.core.fechas import ahora_utc
from app.core.listados import (MAX_OFFSET, contar_por_vista, expresiones_tiempo, leer_lista, leer_orden,
                               orden_por_lista, paginar, respuesta, texto_busqueda)
from app.core.seguimiento_confirmacion import estados_para_alertas
from app.core.textos_actividad import ETIQUETAS_ESTADO
from app.db.database import get_db
from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation
from app.models.users import User

router = APIRouter()

VISTAS_HUB = ("todos", "no_resueltos", "sc", "cot", "ven", "acciones_tomadas")
SEMAFOROS_HUB = ("atrasados", "no_resueltos")
SIN_FILTRO = "todos"   # r1 (M1): semaforo=todos es «sin filtro», como vista=todos
LIMIT_HUB = 25

_TIPOS = (("SC", CustomerRequest), ("COT", SalesQuotation), ("VEN", SaleOrder))
_INDICE_DE_TIPO = MappingProxyType({tipo: i for i, (tipo, _) in enumerate(_TIPOS)})   # SC, COT, VEN: el flujo
_ALIAS_TIPO = MappingProxyType({"PVEN": "VEN"})
_TIPO_DE_VISTA = MappingProxyType({"sc": "SC", "cot": "COT", "ven": "VEN"})

_SIN_RESOLVER = (rv.RANGO["ATRASADO"], rv.RANGO["NO_RESUELTO"])
_RESUELTOS = (rv.RANGO["ACCION_TOMADA"], rv.RANGO["CERRADO"])
_NOMBRE_DE_RANGO = MappingProxyType({n: clave for clave, n in rv.RANGO.items()})

# 'orden=estado' ordena por la posicion en el flujo: primero los de la SC, luego los de la COT y al final los del pedido;
# dentro de cada tipo, en el orden de ETIQUETAS_ESTADO (SC y COT) o de las pestañas de la lista de pedidos (VEN).
_FLUJO_DE_ESTADOS = MappingProxyType({
    "SC": tuple(ETIQUETAS_ESTADO["SC"]),
    "COT": tuple(ETIQUETAS_ESTADO["COT"]),
    "VEN": tuple(e for vista in VISTA_DE_GRUPO.values() for e in estados_de_vista(vista)),
})
_SALTO_DE_TIPO = 100   # orden_estado = 100 × indice del tipo + la posicion del estado en el flujo de su tipo
# r1 (M10): los estados que existen en cada tipo, para validar `estados`: son los mismos del flujo de arriba (los de
# ETIQUETAS_ESTADO en SC y COT; los 18 de estados_pedido en VEN, los heredados de la tienda y de fase4 incluidos).
_ESTADOS_DEL_TIPO = _FLUJO_DE_ESTADOS

# r1 (M7): los caracteres que str.strip() quita (los de str.isspace(); ninguno pasa de U+3000), para que el asesor del
# UNION se limpie igual que _texto_o_none de erp_ventas, que es el que se muestra en la fila.
_ESPACIOS = "".join(chr(c) for c in range(0x3001) if chr(c).isspace())


# ─── Validacion de los parametros (R21: a mano, con 422 en español) ──────────────────────────────────────────────────

def _limpio(valor) -> str | None:
    """El parametro sin espacios en los bordes, o None si no vino o quedo vacio."""
    if valor is None:
        return None
    return valor.strip() or None


def _opcion(valor, opciones, mensaje: str):
    valor = _limpio(valor)
    if valor is not None and valor not in opciones:
        raise HTTPException(status_code=422, detail=mensaje.format(valor))
    return valor


def _estados_por_tipo(estados) -> dict | None:
    """{'SC': [...], 'COT': [...], 'VEN': [...]} de los pares TIPO:ESTADO de `estados` (leer_lista), o None si no hay
    ninguno. 422 con: mas de 20 o un caracter de control (leer_lista), un par sin ':' o con un tipo que no es SC, COT,
    VEN o PVEN, o un estado que no existe en su tipo (_ESTADOS_DEL_TIPO, r1 M10)."""
    try:
        pares = leer_lista(estados)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if not pares:
        return None
    por_tipo = {tipo: [] for tipo, _ in _TIPOS}
    for par in pares:
        tipo, separador, estado = par.partition(":")
        tipo, estado = _ALIAS_TIPO.get(tipo.strip(), tipo.strip()), estado.strip()
        if not separador or tipo not in por_tipo or not estado:
            raise HTTPException(status_code=422, detail=(
                f"El estado «{par}» no es válido: usa TIPO:ESTADO, con TIPO SC, COT o VEN (por ejemplo SC:ASIGNADA)."))
        if estado not in _ESTADOS_DEL_TIPO[tipo]:
            raise HTTPException(status_code=422, detail=f"El estado «{estado}» no existe en {tipo}.")
        if estado not in por_tipo[tipo]:
            por_tipo[tipo].append(estado)
    return por_tipo


# ─── La consulta: un SELECT por tipo, unidos con UNION ALL ───────────────────────────────────────────────────────────

def _texto(columna):
    """El texto sin espacios en los bordes, o NULL si queda vacio: la regla de _texto_o_none de erp_ventas, con los
    mismos caracteres de str.strip() (_ESPACIOS: espacios, tabuladores, saltos de linea y los de Unicode; r1 M7)."""
    return func.nullif(func.btrim(columna, literal(_ESPACIOS)), "")


def _rama(tipo, modelo, dias, ahora, like, estados_del_tipo, cond_del_paso):
    """El SELECT de un tipo con las columnas comunes del UNION y sus filtros propios: sin Soporte (SC), la busqueda, los
    estados de ese tipo y el paso. Un tipo que los estados o el paso dejan fuera lleva WHERE false (el UNION conserva
    siempre sus tres ramas)."""
    exprs = rv.expresiones(tipo, modelo, dias, ahora)
    cot = sc = None
    if tipo == "SC":
        asesor, monto = _texto(modelo.advisor_name), cast(null(), Numeric(14, 2))
        textos = [modelo.numero, modelo.customer_name, modelo.advisor_name]
    elif tipo == "COT":
        asesor, monto = _texto(modelo.cotizador), modelo.total_cop
        textos = [modelo.numero, modelo.customer_name, modelo.cotizador, modelo.sc_numero]
    else:
        # H4 (_asesores_de_pedidos): el asesor del pedido es el cotizador de su COT o, si falta, el asesor de su SC.
        cot = aliased(SalesQuotation, name="cot_del_pedido")
        sc = aliased(CustomerRequest, name="sc_del_pedido")
        asesor, monto = func.coalesce(_texto(cot.cotizador), _texto(sc.advisor_name)), modelo.total_cop
        textos = [modelo.numero, modelo.customer_name, modelo.sc_numero, modelo.cot_numero, modelo.pweb_numero, asesor]
    indice = _INDICE_DE_TIPO[tipo]
    consulta = select(
        literal(tipo).label("tipo"),
        literal(indice).label("orden_tipo"),
        modelo.id.label("id"),
        modelo.numero.label("numero"),
        modelo.customer_name.label("cliente"),
        asesor.label("asesor"),
        monto.label("monto"),
        modelo.estado.label("estado"),
        (orden_por_lista(modelo.estado, _FLUJO_DE_ESTADOS[tipo]) + _SALTO_DE_TIPO * indice).label("orden_estado"),
        modelo.created_at.label("created_at"),
        modelo.updated_at.label("updated_at"),
        func.coalesce(modelo.updated_at, modelo.created_at).label("movimiento"),
        exprs["rango"],
        exprs["dias_sin_mov"],
        exprs["dias_creado"],
        rv.expr_columna_hub(tipo, modelo).label("columna"),
    ).select_from(modelo)
    if cot is not None:
        consulta = consulta.outerjoin(cot, cot.id == modelo.cot_id).outerjoin(sc, sc.id == modelo.sc_id)
    condiciones = []
    if tipo == "SC":
        condiciones.append(rv.sin_soporte(modelo))   # R8: Soporte se ve en Solicitudes › Soporte
    if like is not None:
        condiciones.append(or_(*[columna.ilike(like) for columna in textos], productos_ilike(modelo.productos, like)))
    if estados_del_tipo is not None:
        condiciones.append(modelo.estado.in_(estados_del_tipo) if estados_del_tipo else false())
    if cond_del_paso is not None:
        condiciones.append(cond_del_paso)
    return consulta.where(*condiciones)


def _documentos(dias, ahora, like, estados, paso):
    """La subconsulta del Hub (UNION ALL de las tres ramas) con lo que tambien cuentan las pestañas: q, estados y
    paso."""
    paso_modelo, paso_cond = rv.cond_paso(paso) if paso is not None else (None, None)
    ramas = []
    for tipo, modelo in _TIPOS:
        cond_del_paso = None
        if paso_modelo is not None:
            cond_del_paso = paso_cond if paso_modelo is modelo else false()
        ramas.append(_rama(tipo, modelo, dias, ahora, like, None if estados is None else estados[tipo],
                           cond_del_paso))
    return union_all(*ramas).subquery("documentos_hub")


def _ordenes(u) -> dict:
    """Las ordenes permitidas de leer_orden (D34). 'atencion' (R8): atrasados, sin resolver, accion tomada y cerrados;
    en los dos primeros, el que lleva mas tiempo sin movimiento arriba; en los dos ultimos, el mas reciente; desempate
    por tipo e id. El id no es unico entre los tres tipos: (id, tipo) si, y quien llama agrega el tipo al final."""
    atencion = [
        u.c.rango.asc().nulls_last(),
        case((u.c.rango.in_(_SIN_RESOLVER), u.c.movimiento)).asc().nulls_last(),
        case((u.c.rango.in_(_RESUELTOS), u.c.created_at)).desc().nulls_last(),
        u.c.orden_tipo.asc(),
        u.c.id.desc(),
    ]
    return {
        "atencion": atencion,
        "sin_movimiento": expresiones_tiempo(u.c.created_at, u.c.updated_at, "sin_movimiento", id_lista=u.c.id),
        "reciente": expresiones_tiempo(u.c.created_at, u.c.updated_at, "reciente", id_lista=u.c.id),
        "tipo": u.c.orden_tipo,
        "numero": u.c.numero,
        "cliente": u.c.cliente,
        "asesor": u.c.asesor,
        "creado": u.c.created_at,
        "estado": u.c.orden_estado,
        "monto": u.c.monto,
    }


# ─── Hidratacion de la pagina (RP20: consultas IN, sin una por fila) ─────────────────────────────────────────────────

def _ligera(id_, numero, estado) -> dict:
    return {"id": id_, "numero": numero, "estado": estado}


def _hidratar(db: Session, filas) -> list:
    """Las filas de la pagina con su _sc_dict / _cot_dict / _ven_dict y lo que R6 agrega, en el orden de la pagina."""
    ids = {tipo: [f.id for f in filas if f.tipo == tipo] for tipo, _ in _TIPOS}
    docs = {}
    for tipo, modelo in _TIPOS:
        docs[tipo] = ({d.id: d for d in db.query(modelo).options(selectinload(modelo.customer))
                       .filter(modelo.id.in_(ids[tipo]))} if ids[tipo] else {})

    # Las cotizaciones de cada SC (H32) y los pedidos de cada SC (por sc_id o por el cot_id de sus COT, como
    # get_solicitud) y de cada COT (D37), en version ligera: una consulta para las COT y otra para los pedidos.
    cotizaciones_de_sc, sc_de_cot = {}, {}
    if ids["SC"]:
        for c_id, c_num, c_est, c_sc in (db.query(SalesQuotation.id, SalesQuotation.numero, SalesQuotation.estado,
                                                  SalesQuotation.sc_id)
                                         .filter(SalesQuotation.sc_id.in_(ids["SC"])).order_by(SalesQuotation.id.asc())):
            cotizaciones_de_sc.setdefault(c_sc, []).append(_ligera(c_id, c_num, c_est))
            sc_de_cot[c_id] = c_sc
    vinculos = []
    if ids["SC"]:
        vinculos.append(SaleOrder.sc_id.in_(ids["SC"]))
    cot_ids = set(sc_de_cot) | set(ids["COT"])
    if cot_ids:
        vinculos.append(SaleOrder.cot_id.in_(cot_ids))
    pedidos_de_sc, pedidos_de_cot = {}, {}
    if vinculos:
        scs_de_la_pagina = set(ids["SC"])
        for v_id, v_num, v_est, v_sc, v_cot in (db.query(SaleOrder.id, SaleOrder.numero, SaleOrder.estado,
                                                         SaleOrder.sc_id, SaleOrder.cot_id)
                                                .filter(or_(*vinculos)).order_by(SaleOrder.id.asc())):
            duenas = {v_sc} & scs_de_la_pagina
            if v_cot in sc_de_cot:
                duenas.add(sc_de_cot[v_cot])
            for sc_id in duenas:
                pedidos_de_sc.setdefault(sc_id, []).append(_ligera(v_id, v_num, v_est))
            if v_cot is not None:
                pedidos_de_cot.setdefault(v_cot, []).append(_ligera(v_id, v_num, v_est))

    # C14: el chip «Sin respuesta al recordatorio» (una consulta IN por tipo) y el asesor de H4 de cada pedido.
    seguimiento = {"SC": estados_para_alertas(db, "SC", docs["SC"].values()),
                   "COT": estados_para_alertas(db, "COT", docs["COT"].values()),
                   "VEN": {}}
    asesores = _asesores_de_pedidos(db, list(docs["VEN"].values()))

    data = []
    for f in filas:
        doc = docs[f.tipo].get(f.id)
        if doc is None:   # se borro entre la pagina y su hidratacion
            continue
        if f.tipo == "SC":
            fila = {**_sc_dict(doc), "cotizaciones": cotizaciones_de_sc.get(f.id, []),
                    "pedidos_venta": pedidos_de_sc.get(f.id, [])}
        elif f.tipo == "COT":
            fila = {**_cot_dict(doc), "pedidos_venta": pedidos_de_cot.get(f.id, [])}
        else:
            fila = {**_ven_dict(doc), "advisor_name": asesores.get(f.id), "cambios_cliente": None}
        fila.update(tipo=f.tipo, resolucion=_NOMBRE_DE_RANGO.get(f.rango), dias_sin_mov=f.dias_sin_mov,
                    dias_creado=f.dias_creado, seguimiento_estado=seguimiento[f.tipo].get(f.id))
        data.append(fila)
    return data


# ─── Rutas ───────────────────────────────────────────────────────────────────────────────────────────────────────────

@router.get("/hub/documentos")
def hub_documentos(
    vista: Optional[str] = None,
    semaforo: Optional[str] = None,
    paso: Optional[str] = None,
    estados: Optional[str] = None,
    columna: Optional[str] = None,
    q: Optional[str] = None,
    orden: Optional[str] = None,
    limit: int = Query(LIMIT_HUB, ge=0, le=200),
    offset: int = Query(0, ge=0, le=MAX_OFFSET),
    con_conteos: bool = False,
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db),
):
    """La tabla y el tablero del Hub de Ventas (R6): ver el docstring del modulo."""
    vista = _opcion(vista, VISTAS_HUB, "La vista «{}» no existe en el Hub de Ventas.") or "todos"
    semaforo = _opcion(semaforo, SEMAFOROS_HUB + (SIN_FILTRO,),
                       "El filtro del semáforo «{}» no existe: usa atrasados o no_resueltos.")
    if semaforo == SIN_FILTRO:
        semaforo = None
    paso = _opcion(paso, rv.PASOS_FLUJO_VENTAS, "El paso «{}» no existe en el flujo de Ventas.")
    columna = _opcion(columna, rv.COLUMNAS_HUB, "La columna «{}» no existe en el tablero del Hub.")
    por_tipo = _estados_por_tipo(estados)
    try:
        texto = texto_busqueda(q, None)
    except ValueError as e:   # r1 (M13): un caracter de control no llega al SQL
        raise HTTPException(status_code=422, detail=str(e))

    u = _documentos(rv.leer_dias_alerta(db), ahora_utc(), f"%{texto}%" if texto else None, por_tipo, paso)
    orden_sql = leer_orden(orden, _ordenes(u), "atencion", id_lista=u.c.id) + [u.c.orden_tipo.asc()]

    filtros = []
    if vista in _TIPO_DE_VISTA:
        filtros.append(u.c.tipo == _TIPO_DE_VISTA[vista])
    elif vista == "no_resueltos":
        filtros.append(u.c.rango.in_(_SIN_RESOLVER))
    elif vista == "acciones_tomadas":
        filtros.append(u.c.rango.in_(_RESUELTOS))
    if semaforo == "atrasados":
        filtros.append(u.c.rango == rv.RANGO["ATRASADO"])
    elif semaforo == "no_resueltos":
        filtros.append(u.c.rango.in_(_SIN_RESOLVER))
    if columna is not None:
        filtros.append(u.c.columna == columna)

    base = db.query(u)
    filtrado = base.filter(*filtros)
    conteos = None
    if con_conteos:
        conteos = {
            "pestanas": contar_por_vista(base, {
                "todos": None,
                "no_resueltos": u.c.rango.in_(_SIN_RESOLVER),
                "sc": u.c.tipo == "SC",
                "cot": u.c.tipo == "COT",
                "ven": u.c.tipo == "VEN",
                "acciones_tomadas": u.c.rango.in_(_RESUELTOS),
            }),
            "grupos": contar_por_vista(filtrado, {grupo: u.c.rango == n for grupo, n in rv.RANGO.items()}),
        }
    total, filas = paginar(filtrado.order_by(*orden_sql), limit, offset)
    return respuesta(total, _hidratar(db, filas), conteos=conteos)


@router.get("/flujo")
def flujo_ventas(user: User = Depends(require_roles(*ALL_ERP_ROLES)), db: Session = Depends(get_db)):
    """Los numeros del diagrama del flujo de Ventas sobre todos los documentos (FLUJO-ventas-datos; R8, C5, RP12): ver
    resumen_flujo_ventas. Con el rol ASESOR, cambios_cliente cuenta solo los suyos (como alertas_resumen). No escribe."""
    asesor_id = user.id if normalize_role(user.role) == "ASESOR" else None
    resumen = rv.resumen_flujo_ventas(db, rv.leer_dias_alerta(db), ahora_utc(), asesor_id=asesor_id)
    return {"status": "success", "data": resumen}
