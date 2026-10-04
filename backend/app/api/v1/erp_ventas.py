"""
ERP Ventas API
Endpoints for: Solicitudes de Cliente (SC), Cotizaciones (COT),
Pedidos de Venta (VEN), Ordenes Pendientes por Pagar (PXP)
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import text, func, select
from sqlalchemy.exc import DBAPIError
from typing import Optional, List
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import pydantic
from app.db.database import get_db
from app.models.erp_documents import (
    CustomerRequest, SalesQuotation, SaleOrder,
    PaymentPending, ActivityLog
)
from app.models.fase4 import SaleOrderPayment
from app.models.customers import Customer
from app.models.inventory import InventoryLevel, InventoryOperation, InventoryMovement
from app.models.fase1b import InventoryOwnerBalance
from app.api.dependencies import (
    require_roles, get_current_user,
    ROLE_ADMIN, ROLE_ASESOR, ROLE_COMPRAS, ROLE_FINANZAS, ALL_ERP_ROLES
)
from app.models.users import User
from app.core.busqueda import productos_ilike
from app.core import cambios_documento
from app.core.ventas_dinero import (
    redondear_peso, pesos, formato_pct, anticipo_cotizacion, pct_anticipo_cotizacion, anticipo_requerido,
    anticipo_del_pedido, saldos_a_favor_de_cotizacion, PCT_ANTICIPO_POR_DEFECTO, ORIGEN_CONSERVADO,
    anular_pxps_de_pedido,
)
from app.core.textos_actividad import etiqueta_estado, ETIQUETAS_ESTADO
from app.core.estados_pedido import ESTADOS_VEN_DESTINOS, destinos_ven_permitidos
from app.api.v1.schemas_compras import CancelarSolicitudBody
from app.api.v1.crm import mover_lead_de_solicitud, reabrir_lead_de_solicitud
import datetime
import hashlib
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

API = "http://localhost:5000/api/v1"

# ─── Delivery Date Constants ──────────────────────────────────────────────────
DIAS_ENTREGA_DEFAULT = {"NORMAL": 18, "INMEDIATA": 3}

# ─── Helpers ─────────────────────────────────────────────────────────────────

def _int_or_none(v):
    """Los endpoints de este modulo reciben `body: dict` sin validacion de
    Pydantic. Los <select> opcionales del frontend (asesor, asignado_a) usan
    '' como valor 'nada seleccionado', lo que rompe el INSERT/UPDATE en
    columnas Integer (psycopg2 DataError) si se pasa tal cual."""
    if v in (None, ""):
        return None
    return int(v)

def _next_seq(db: Session, seq_name: str) -> int:
    r = db.execute(text(f"SELECT nextval(\'{seq_name}\')")).scalar()
    return r

def _validar_precios_productos(productos: list) -> None:
    """La Calculadora de Cotizacion permite guardar filas sin costo/precio
    (quedan en $0). Bloqueamos el guardado -- igual que create_pec en
    erp_compras.py -- para que nunca quede una cotizacion 'creada' con un
    producto a precio cero."""
    if not productos:
        return
    for prod in productos:
        precio = (prod.get("unit_price_cop") or prod.get("total_cop") or prod.get("precio_cop")
                  or prod.get("precio_unitario") or prod.get("cost_usd") or 0)
        try:
            precio = float(precio)
        except (TypeError, ValueError):
            precio = 0
        if precio <= 0:
            nombre_prod = prod.get("product_name") or prod.get("nombre") or prod.get("producto") or "producto"
            raise HTTPException(
                422,
                f"El producto '{nombre_prod}' no tiene precio definido. Ingresa un costo/precio antes de guardar la cotizacion.",
            )

def _monto_en_pesos(valor, campo: str) -> Decimal:
    """H42: un monto que llega del cliente se guarda en pesos enteros (redondear_peso). Si no es un monto
    (texto no numerico, NaN...) responde 422 con el nombre del campo en vez de dejar que llegue a la base."""
    try:
        return redondear_peso(valor)
    except ValueError:
        raise HTTPException(422, f"El campo {campo} debe ser un monto numérico.")

def _redondear_montos_del_body(body: dict, campos) -> None:
    """Redondea al peso, en el propio body, los montos de `campos` que vengan con valor (los ausentes o
    None no se tocan: un PATCH que no manda montos no cambia los guardados)."""
    for k in campos:
        if body.get(k) is not None:
            body[k] = _monto_en_pesos(body[k], k)

def _tiene_productos_para_cotizar(productos) -> bool:
    """Al menos una linea con nombre (del catalogo o texto libre). Una Solicitud sin productos no
    tiene nada que el cliente pueda confirmar ni que cotizar: la Cotizacion saldria vacia."""
    if not isinstance(productos, list):
        return False
    return any(
        isinstance(p, dict) and str(p.get("product_name") or p.get("nombre") or p.get("name") or "").strip()
        for p in productos
    )

def _gen_numero(db: Session, prefix: str, seq: str) -> str:
    year = datetime.datetime.utcnow().year
    n = _next_seq(db, seq)
    return f"{prefix}{year}{n:04d}"

def _log(db: Session, entity_type: str, entity_id: int, entity_numero: str,
         action: str, description: str = None, old_estado: str = None,
         new_estado: str = None, user_name: str = None, extra_data: dict = None,
         commit: bool = True):
    """Agrega un renglon de Actividad. commit=False lo deja en la sesion para que lo confirme el commit del
    llamador (una sola transaccion: choque H36/H29 en update_solicitud)."""
    log = ActivityLog(
        entity_type=entity_type,
        entity_id=entity_id,
        entity_numero=entity_numero,
        action=action,
        description=description,
        old_estado=old_estado,
        new_estado=new_estado,
        user_name=user_name,
        extra_data=extra_data,
    )
    db.add(log)
    if commit:
        db.commit()

def _registrar_cambios(db: Session, entidad: str, doc, antes: dict, body: dict, user: User,
                       recotizacion: bool = False, commit: bool = True):
    """Deja en la Actividad un renglon con lo que cambio este PATCH (campo: antes -> despues).

    `antes` es la foto (cambios_documento.tomar_foto) tomada ANTES de aplicar el body; aqui se
    toma la de despues, ya recargada de la DB, para que ambas tengan los mismos tipos. Un PATCH
    que no cambia nada no registra nada (el formulario de edicion reenvia todos sus campos).
    `motivo` en el body reemplaza el titulo automatico (p.ej. 'por re-cotizacion de COT-...').
    Es un registro auxiliar: si falla, el cambio ya quedo guardado y no se debe devolver un error.
    commit=False (update_solicitud, H29): el renglon queda en la sesion y lo confirma el commit unico del llamador;
    si falla el armado en Python no se hace rollback, porque desharia el cambio que ese commit aun no confirmo.
    Un error de la BASE (DBAPIError) con commit=False SI se propaga: deja la transaccion abortada y el commit final
    seria un ROLLBACK silencioso (PostgreSQL), o sea un 200 sin nada guardado. Con commit=True se conserva lo de siempre."""
    try:
        despues = cambios_documento.tomar_foto(doc, entidad)
        ids_usuarios = {i for i in (antes.get("asignado_a_user_id"), despues.get("asignado_a_user_id")) if i}
        usuarios = {}
        if ids_usuarios:
            usuarios = {u.id: u.email for u in db.query(User).filter(User.id.in_(ids_usuarios)).all()}
        cambios = cambios_documento.comparar(entidad, antes, despues, usuarios)
        registro = cambios_documento.describir(entidad, cambios, antes, despues, recotizacion)
        if registro is None:
            return
        accion, descripcion = registro
        motivo = body.get("motivo")
        if isinstance(motivo, str) and motivo.strip():
            descripcion = motivo.strip()[:300]
        _log(db, entidad, doc.id, doc.numero, accion, descripcion,
             user_name=body.get("updated_by") or getattr(user, "email", None),
             extra_data={"cambios": cambios}, commit=commit)
    except Exception as exc:
        if commit:
            db.rollback()
        elif isinstance(exc, DBAPIError):
            raise
        logger.warning("No se pudo registrar en la Actividad los cambios de %s %s", entidad,
                       getattr(doc, "numero", "?"), exc_info=True)

def _lista_compras_items_de(db: Session, pven_id: int) -> list:
    """Items de la Lista de Compras (JSON en web_builder_config) que pertenecen
    a este Pedido de Venta -- usado para saber si ya se eligio esa via de
    compra, sin duplicar el modelo de datos de erp_compras.py.

    web_builder_config NO se trunca entre corridas de pytest/reset de datos,
    a diferencia de sale_orders -- si un PVEN es eliminado y el id numerico
    se reutiliza, un item huerfano con ese mismo pven_id podia "adjuntarse"
    a un PVEN completamente distinto. Se valida contra el numero real del
    pedido y se auto-limpian los items huerfanos que ya no correspondan."""
    from app.api.v1.erp_compras import _load_lista_compras, _save_lista_compras
    items = _load_lista_compras(db)
    candidatos = [it for it in items if it.get("pven_id") == pven_id]
    if not candidatos:
        return []

    ven = db.query(SaleOrder).filter(SaleOrder.id == pven_id).first()
    vigentes = [it for it in candidatos if ven and it.get("pven_numero") == ven.numero]
    if len(vigentes) != len(candidatos):
        # Hay items huerfanos (numero no coincide o el PVEN ya no existe) -- se purgan.
        ids_vigentes = {it.get("id") for it in vigentes}
        items_limpios = [it for it in items if it.get("pven_id") != pven_id or it.get("id") in ids_vigentes]
        _save_lista_compras(db, items_limpios)
    # Un item DESCARTADO (eliminado por el usuario) ya no cuenta como
    # "decision tomada" -- el bloque para elegir de nuevo entre Crear Pedido
    # de Compra / Agregar a Lista de Compras debe volver a aparecer.
    return [it for it in vigentes if it.get("estado") != "DESCARTADO"]

def _pven_vigente_de_cotizacion(db: Session, cot_id: int):
    """El Pedido de Venta vigente (estado != CANCELADO) de la cotizacion, el mas nuevo, o None (helper de N4)."""
    return (db.query(SaleOrder)
            .filter(SaleOrder.cot_id == cot_id, SaleOrder.estado != "CANCELADO")
            .order_by(SaleOrder.id.desc()).first())

def _documentos_activos_de_solicitud(db: Session, sc_id: int):
    """(cots_activas, pvens_activos) de una SC, por id ascendente (N4, N7, R10).

    COT activa: estado != RECHAZADA (una VENCIDA cuenta: hay que rechazarla). PVEN activo: estado != CANCELADO,
    vinculado por sc_id o por el cot_id de cualquier COT de la SC (el mismo filtro que get_solicitud: un PVEN cuya COT
    se desvinculo, o que se rechazo, conserva el cot_id)."""
    cots = db.query(SalesQuotation).filter(SalesQuotation.sc_id == sc_id).order_by(SalesQuotation.id.asc()).all()
    filtro = SaleOrder.sc_id == sc_id
    if cots:
        filtro = filtro | SaleOrder.cot_id.in_([c.id for c in cots])
    pvens = db.query(SaleOrder).filter(filtro, SaleOrder.estado != "CANCELADO").order_by(SaleOrder.id.asc()).all()
    return [c for c in cots if c.estado != "RECHAZADA"], pvens

def _describir_documentos(cots, pvens) -> str:
    """'pedido de venta PVEN-…, cotización COT-…' (en plural si hay varios del mismo tipo)."""
    partes = []
    if pvens:
        partes.append(("pedido de venta " if len(pvens) == 1 else "pedidos de venta ")
                      + ", ".join(p.numero for p in pvens))
    if cots:
        partes.append(("cotización " if len(cots) == 1 else "cotizaciones ") + ", ".join(c.numero for c in cots))
    return ", ".join(partes)

def _mensaje_documentos_activos(sc: CustomerRequest, cots, pvens, accion: str = "cancelar") -> str:
    """409 de N4 (accion 'cancelar') y de R10 (accion 'devolver a Borrador'): que documentos lo impiden y en que
    orden resolverlos (primero el pedido: al cancelarlo su cotizacion vuelve a Borrador y despues se rechaza)."""
    pasos = []
    if pvens:
        pasos.append("cancela el pedido de venta" if len(pvens) == 1 else "cancela los pedidos de venta")
    if cots:
        pasos.append("rechaza la cotización" if len(cots) == 1 else "rechaza las cotizaciones")
    return (f"No se puede {accion} la solicitud {sc.numero}: tiene documentos activos "
            f"({_describir_documentos(cots, pvens)}). Primero {' y '.join(pasos)}; "
            f"después podrás {accion} la solicitud.")

def _mensaje_solicitud_cancelada(sc: CustomerRequest, para: str = "retomar o enviar esta cotización") -> str:
    """409 de N4: una SC cancelada no puede tener cotizaciones vivas."""
    return f"La solicitud {sc.numero} está cancelada: restáurala desde la Papelera antes de {para}."

def _cliente_de_la_solicitud(sc: CustomerRequest) -> tuple:
    """Quien confirma la SC por el enlace de Gate 1: su id, correo y telefono, normalizados (un formulario que reenvia
    lo mismo, con otro tipo, mayusculas o espacios, no es un cambio de cliente)."""
    def _texto(v):
        return str(v).strip() if v not in (None, "") else ""
    return _texto(sc.customer_id), _texto(sc.customer_email).lower(), _texto(sc.customer_phone)

def _nombre_de_estado(entidad: str, estado) -> str:
    """Etiqueta de un estado que llega en un PATCH, que puede ser de otro documento (el cambio masivo del Hub manda
    estados de pedido a SC y COT): primero el mapa de la entidad, despues los demas; si no esta, el respaldo."""
    codigo = str(estado).strip() if estado is not None else ""
    for otra in (entidad, "VEN", "COT", "SC"):
        etiqueta = ETIQUETAS_ESTADO.get(otra, {}).get(codigo)
        if etiqueta:
            return etiqueta
    return etiqueta_estado(entidad, codigo)

# N4/N5: lo unico que se pone a mano por PATCH en una SC (cancelar es POST /cancelar, que pide el motivo y revisa
# los documentos; los demas estados los pone el flujo).
ESTADOS_SC_MANUALES = ("BORRADOR",)
# H50/N5 (choque H50 gana): lo unico que se pone a mano por PATCH en una COT. ENVIADA no: 'Enviar al Cliente' es el
# que genera el enlace de confirmacion.
ESTADOS_COT_MANUALES = ("BORRADOR", "RECHAZADA", "VENCIDA")

# H36+H43: cotizaciones "abiertas" cuyo anticipo sigue a la modalidad de su SC.
_ESTADOS_COT_ANTICIPO_ABIERTO = ("BORRADOR", "ENVIADA", "PENDIENTE_CONFIRMACION", "CONFIRMADA")

def _recalcular_anticipo_por_modalidad(db: Session, sc: CustomerRequest, user_name: Optional[str]) -> None:
    """H36+H43: cambio la modalidad de pago de la SC -> recalcula el anticipo de sus COT abiertas sin pedido
    vigente (el % manual, si lo hay, se respeta: R3) y deja un renglon UPDATED en la Actividad de cada COT que
    cambia. Sin commit: lo confirma el commit de update_solicitud (choque H36/H29, una sola transaccion)."""
    cots = (db.query(SalesQuotation)
            .filter(SalesQuotation.sc_id == sc.id, SalesQuotation.estado.in_(_ESTADOS_COT_ANTICIPO_ABIERTO))
            .order_by(SalesQuotation.id.asc()).all())
    for cot in cots:
        if _pven_vigente_de_cotizacion(db, cot.id) is not None:
            continue
        pct, _, _, nuevo = anticipo_cotizacion(cot, db, sc=sc)
        viejo = Decimal(str(cot.anticipo_cop or 0))
        if nuevo == viejo:
            continue
        cot.anticipo_cop = nuevo
        cot.updated_at = datetime.datetime.utcnow()
        _log(db, "COT", cot.id, cot.numero, "UPDATED",
             f"Anticipo recalculado por cambio de modalidad de pago de {sc.numero} "
             f"({sc.modalidad_pago or 'sin modalidad'}): {pesos(viejo)} → {pesos(nuevo)}",
             user_name=user_name,
             extra_data={"anticipo_antes": str(viejo), "anticipo_despues": str(nuevo),
                         "modalidad_pago": sc.modalidad_pago, "anticipo_pct": str(pct)},
             commit=False)

def _leer_ajuste_anticipo_manual(db: Session, cot: SalesQuotation, body: dict):
    """R3: valida el anticipo manual del PATCH de la COT ANTES de tocar nada.

    None si el body no trae 'anticipo_pct_manual' o si trae lo mismo que ya esta guardado (un formulario que
    reenvia el valor no bloquea el resto del PATCH). Si cambia: (pct, nota) a guardar, o (None, None) para volver
    a la modalidad. 422 si el % no esta entre 0 y 100 o la nota tiene menos de 5 caracteres (un % distinto exige
    su propia nota; con el mismo % la nota puede omitirse). 409, solo cuando de verdad cambia, si la COT esta
    rechazada/cancelada o ya se convirtio (pedido vigente)."""
    if "anticipo_pct_manual" not in body:
        return None
    valor = body.get("anticipo_pct_manual")
    if valor is None:
        if cot.anticipo_pct_manual is None:
            return None
        ajuste = (None, None)
    else:
        try:
            if isinstance(valor, bool):
                raise ValueError
            pct = Decimal(str(valor).strip())
            if not pct.is_finite() or pct < 0 or pct > 100:
                raise ValueError
        except (InvalidOperation, ValueError):
            raise HTTPException(422, "El anticipo manual debe ser un porcentaje entre 0% y 100%.")
        pct = pct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        nota = body.get("anticipo_manual_nota")
        nota = nota.strip() if isinstance(nota, str) else ""
        # El mismo % sin nota (ausente, null o vacia) o con la misma nota no cambia nada.
        if pct == cot.anticipo_pct_manual and (not nota or nota == cot.anticipo_manual_nota):
            return None
        if len(nota) < 5:
            raise HTTPException(422, "Escribe una nota de al menos 5 caracteres que explique el anticipo manual.")
        ajuste = (pct, nota)
    if cot.estado in ("RECHAZADA", "CANCELADA"):
        raise HTTPException(409, f"El anticipo ya no se puede ajustar: la cotización está "
                                 f"{etiqueta_estado('COT', cot.estado).lower()}.")
    vigente = _pven_vigente_de_cotizacion(db, cot.id)
    if vigente is not None:
        raise HTTPException(409, f"El anticipo ya no se puede ajustar: la cotización ya tiene el pedido "
                                 f"{vigente.numero} vigente.")
    return ajuste

def _pago_dict(p: SaleOrderPayment) -> dict:
    return {
        "id": p.id,
        "tipo": p.tipo,
        "monto": float(p.monto) if p.monto is not None else 0,
        "metodo_pago": p.metodo_pago,
        "referencia_bancaria": p.referencia_bancaria,
        "usuario": p.usuario,
        "fecha": p.fecha.isoformat() if p.fecha else None,
        "estado": p.estado,
        "notes": p.notes,
        # UTC sin zona en la base: con "Z" para que el navegador no lo lea como hora local.
        "created_at": (p.created_at.isoformat() + "Z") if p.created_at else None,
    }

def _sc_dict(sc: CustomerRequest) -> dict:
    return {
        "id": sc.id,
        "numero": sc.numero,
        "customer_id": sc.customer_id,
        "customer_name": sc.customer_name,
        "customer_phone": sc.customer_phone,
        "customer_email": sc.customer_email,
        "customer_address": sc.customer_address,
        "advisor_name": sc.advisor_name,
        "advisor_user_id": sc.advisor_user_id,
        "tipo_solicitud": sc.tipo_solicitud or "Cotizacion de Producto",
        "modalidad_pago": sc.modalidad_pago,
        "estado": sc.estado,
        "fecha_solicitud": sc.fecha_solicitud.isoformat() if sc.fecha_solicitud else None,
        "fecha_vencimiento": sc.fecha_vencimiento.isoformat() if sc.fecha_vencimiento else None,
        "fecha_entrega_estimada": sc.fecha_entrega_estimada.isoformat() if sc.fecha_entrega_estimada else None,
        "modalidad_entrega": sc.modalidad_entrega,
        "notas": sc.notas,
        "productos": sc.productos or [],
        "created_at": sc.created_at.isoformat() if sc.created_at else None,
        "updated_at": sc.updated_at.isoformat() if sc.updated_at else None,
        "created_by": sc.created_by,
        "razon_cancelacion": getattr(sc, "razon_cancelacion", None),
        "eliminada_at": sc.eliminada_at.isoformat() if getattr(sc, "eliminada_at", None) else None,
        "tipo_problema": sc.tipo_problema,
        "descripcion_problema": sc.descripcion_problema,
        "urgencia": sc.urgencia,
        "evidencia_descripcion": sc.evidencia_descripcion,
        "asignado_a_user_id": sc.asignado_a_user_id,
        "estado_soporte": sc.estado_soporte,
    }

def _cot_dict(cot: SalesQuotation) -> dict:
    return {
        "id": cot.id,
        "numero": cot.numero,
        "sc_id": cot.sc_id,
        "sc_numero": cot.sc_numero,
        "customer_id": cot.customer_id,
        "customer_name": cot.customer_name,
        "customer_phone": cot.customer_phone,
        "customer_email": cot.customer_email,
        "customer_address": cot.customer_address,
        "cotizador": cot.cotizador,
        "direccion_entrega": cot.direccion_entrega,
        "trm_rate": float(cot.trm_rate) if cot.trm_rate else None,
        "subtotal_cop": float(cot.subtotal_cop) if cot.subtotal_cop else 0,
        "descuento_pct": float(cot.descuento_pct) if cot.descuento_pct else 0,
        "total_cop": float(cot.total_cop) if cot.total_cop else 0,
        "anticipo_cop": float(cot.anticipo_cop) if cot.anticipo_cop else 0,
        # R3: anticipo puesto a mano (None = sigue la modalidad de la SC) y su nota.
        "anticipo_pct_manual": float(cot.anticipo_pct_manual) if cot.anticipo_pct_manual is not None else None,
        "anticipo_manual_nota": cot.anticipo_manual_nota,
        "estado": cot.estado,
        "canal_envio": cot.canal_envio,
        "fecha_cotizacion": cot.fecha_cotizacion.isoformat() if cot.fecha_cotizacion else None,
        "fecha_entrega_estimada": cot.fecha_entrega_estimada.isoformat() if cot.fecha_entrega_estimada else None,
        "notas": cot.notas,
        "productos": cot.productos or [],
        "pec_id": cot.pec_id,
        "pec_numero": cot.pec_numero,
        "created_at": cot.created_at.isoformat() if cot.created_at else None,
        "updated_at": cot.updated_at.isoformat() if cot.updated_at else None,
        "created_by": cot.created_by,
    }

def _ven_dict(v: SaleOrder) -> dict:
    return {
        "id": v.id,
        "numero": v.numero,
        "sc_id": v.sc_id,
        "sc_numero": v.sc_numero,
        "cot_id": v.cot_id,
        "cot_numero": v.cot_numero,
        "customer_id": v.customer_id,
        "customer_name": v.customer_name,
        "customer_phone": v.customer_phone,
        "customer_email": v.customer_email,
        "customer_address": v.customer_address,
        "direccion_entrega": v.direccion_entrega,
        "fecha_cotizacion": v.fecha_cotizacion.isoformat() if v.fecha_cotizacion else None,
        "fecha_entrega_estimada": v.fecha_entrega_estimada.isoformat() if v.fecha_entrega_estimada else None,
        "trm_rate": float(v.trm_rate) if v.trm_rate else None,
        "subtotal_cop": float(v.subtotal_cop) if v.subtotal_cop else 0,
        "descuento_pct": float(v.descuento_pct) if v.descuento_pct else 0,
        "total_cop": float(v.total_cop) if v.total_cop else 0,
        "anticipo_cop": float(v.anticipo_cop) if v.anticipo_cop else 0,
        "saldo_cop": float(v.saldo_cop) if v.saldo_cop else 0,
        "anticipo_pct": float(v.anticipo_pct_snapshot) if v.anticipo_pct_snapshot is not None else None,
        "estado": v.estado,
        "notas": v.notas,
        "productos": v.productos or [],
        "pec_id": v.pec_id,
        "pec_numero": v.pec_numero,
        "pxp_id": v.pxp_id,
        "pxp_numero": v.pxp_numero,
        "canal_venta": v.canal_venta or "CRM",
        "pweb_numero": v.pweb_numero,
        "canal_metadata": v.canal_metadata,
        "cancellation_reason": v.cancellation_reason,
        "cancellation_authorized_by": v.cancellation_authorized_by,
        "cancelled_at": v.cancelled_at.isoformat() if v.cancelled_at else None,
        "created_at": v.created_at.isoformat() if v.created_at else None,
        "updated_at": v.updated_at.isoformat() if v.updated_at else None,
        "created_by": v.created_by,
    }

def _pxp_dict(p: PaymentPending) -> dict:
    return {
        "id": p.id,
        "numero": p.numero,
        "ven_id": p.ven_id,
        "ven_numero": p.ven_numero,
        "customer_id": p.customer_id,
        "customer_name": p.customer_name,
        "monto_total": float(p.monto_total) if p.monto_total else 0,
        "monto_anticipo": float(p.monto_anticipo) if p.monto_anticipo else 0,
        "monto_pendiente": float(p.monto_pendiente) if p.monto_pendiente else 0,
        "estado": p.estado,
        "fecha_creacion": p.fecha_creacion.isoformat() if p.fecha_creacion else None,
        "fecha_pago": p.fecha_pago.isoformat() if p.fecha_pago else None,
        "notas": p.notas,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }

def _log_dict(l: ActivityLog) -> dict:
    return {
        "id": l.id,
        "entity_type": l.entity_type,
        "entity_id": l.entity_id,
        "entity_numero": l.entity_numero,
        "action": l.action,
        "description": l.description,
        "old_estado": l.old_estado,
        "new_estado": l.new_estado,
        "user_name": l.user_name,
        # created_at es UTC sin zona (utcnow): sin la "Z" el navegador lo lee como hora local y la
        # linea de tiempo de Actividad muestra la hora con 5 h de adelanto en Colombia.
        "created_at": (l.created_at.isoformat() + "Z") if l.created_at else None,
        "extra_data": l.extra_data,
    }

# ─── SOLICITUDES (SC) ────────────────────────────────────────────────────────

@router.get("/solicitudes")
def list_solicitudes(
    estado: Optional[str] = None,
    customer_id: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db)
):
    q = db.query(CustomerRequest)
    if estado:
        q = q.filter(CustomerRequest.estado == estado)
    if customer_id:
        q = q.filter(CustomerRequest.customer_id == customer_id)
    if search:
        like = f"%{search}%"
        q = q.filter(
            CustomerRequest.numero.ilike(like) |
            CustomerRequest.customer_name.ilike(like) |
            CustomerRequest.advisor_name.ilike(like) |
            productos_ilike(CustomerRequest.productos, like)
        )
    total = q.count()
    items = q.order_by(CustomerRequest.created_at.desc()).offset(offset).limit(limit).all()
    return {"status": "success", "total": total, "data": [_sc_dict(s) for s in items]}


@router.post("/solicitudes", status_code=201)
def create_solicitud(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    numero = _gen_numero(db, "SC-", "seq_sc")
    # Auto vencimiento: 5 dias por defecto
    venc = datetime.datetime.utcnow() + datetime.timedelta(days=body.get("dias_vencimiento", 5))

    # If customer_id provided, fetch customer data
    cust_name = body.get("customer_name", "")
    cust_phone = body.get("customer_phone", "")
    cust_email = body.get("customer_email", "")
    cust_addr  = body.get("customer_address", "")
    if body.get("customer_id"):
        c = db.query(Customer).filter(Customer.id == body["customer_id"]).first()
        if c:
            cust_name  = cust_name or f"{c.first_name} {c.last_name}".strip()
            cust_phone = cust_phone or c.phone or ""
            cust_email = cust_email or c.email or ""
            cust_addr  = cust_addr or c.address or ""

    es_soporte = body.get("tipo_solicitud") == "Soporte Tecnico"
    # Derive modalidad_entrega from tipo_solicitud
    modalidad_entrega = "INMEDIATA" if body.get("tipo_solicitud") == "Pedido Inmediato" else "NORMAL"
    # Gate 1: si ya se elige asesor al crear la SC, arranca directamente en ASIGNADA
    # en vez de BORRADOR -- mismo criterio de "hay un advisor_user_id real" que
    # promueve_asignada usa en update_solicitud. Sin esto, una SC creada con asesor
    # quedaba en BORRADOR igual y dependia de una edicion posterior (que hasta este
    # fix ni siquiera existia en la UI) solo para que el flujo de confirmacion
    # pudiera empezar.
    estado_inicial = "N/A_SOPORTE" if es_soporte else ("ASIGNADA" if body.get("advisor_user_id") else "BORRADOR")

    sc = CustomerRequest(
        numero=numero,
        customer_id=body.get("customer_id"),
        customer_name=cust_name,
        customer_phone=cust_phone,
        customer_email=cust_email,
        customer_address=cust_addr,
        advisor_name=body.get("advisor_name"),
        advisor_user_id=_int_or_none(body.get("advisor_user_id")),
        tipo_solicitud=body.get("tipo_solicitud", "Cotizacion de Producto"),
        modalidad_pago=body.get("modalidad_pago", "Contado"),
        estado=estado_inicial,
        tipo_problema=body.get("tipo_problema"),
        descripcion_problema=body.get("descripcion_problema"),
        urgencia=body.get("urgencia"),
        evidencia_descripcion=body.get("evidencia_descripcion"),
        asignado_a_user_id=_int_or_none(body.get("asignado_a_user_id")),
        estado_soporte="ABIERTO" if es_soporte else None,
        fecha_vencimiento=venc,
        modalidad_entrega=modalidad_entrega,
        notas=body.get("notas"),
        productos=body.get("productos", []),
        created_by=body.get("created_by"),
    )
    db.add(sc)
    db.commit()
    db.refresh(sc)
    _log(db, "SC", sc.id, sc.numero, "CREATED",
         f"Solicitud {sc.numero} creada",
         new_estado=estado_inicial, user_name=body.get("created_by"))
    return {"status": "success", "data": _sc_dict(sc)}


@router.get("/solicitudes/papelera")
def get_papelera(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Lista SCs canceladas con días restantes antes de eliminación permanente."""
    try:
        # Auto-purge SCs older than 30 days in papelera
        db.execute(text("""
            DELETE FROM customer_requests
            WHERE estado='CANCELADA' AND eliminada_at IS NOT NULL
            AND eliminada_at < NOW() - INTERVAL '30 days'
        """))
        db.commit()
        rows = db.execute(text("""
            SELECT id, numero, customer_name, advisor_name, tipo_solicitud,
                   razon_cancelacion, eliminada_at, created_at, updated_at,
                   EXTRACT(DAY FROM NOW() - eliminada_at) as dias_en_papelera
            FROM customer_requests
            WHERE estado='CANCELADA'
            ORDER BY COALESCE(eliminada_at, updated_at) DESC
            LIMIT 200
        """)).mappings().all()
        data = []
        for r in rows:
            d = dict(r)
            dias = float(d.get("dias_en_papelera") or 0)
            d["dias_en_papelera"] = int(dias)
            d["dias_restantes"] = max(0, 30 - int(dias)) if d.get("eliminada_at") else 30
            d["eliminada_at"] = str(d["eliminada_at"]) if d.get("eliminada_at") else None
            d["created_at"] = str(d["created_at"]) if d.get("created_at") else None
            data.append(d)
        return {"status": "success", "data": data}
    except Exception as e:
        return {"status": "success", "data": []}


@router.get("/solicitudes/{sc_id}")
def get_solicitud(sc_id: int, user: User = Depends(require_roles(*ALL_ERP_ROLES)),
        db: Session = Depends(get_db)):
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "Solicitud no encontrada")
    # Los renglones de un mismo PATCH se insertan en el mismo flush y pueden compartir created_at: el id conserva el
    # orden causal ('editado' antes de 'cambio de estado').
    logs = db.query(ActivityLog).filter(
        ActivityLog.entity_type == "SC",
        ActivityLog.entity_id == sc_id
    ).order_by(ActivityLog.created_at.asc(), ActivityLog.id.asc()).all()
    d = _sc_dict(sc)
    d["actividades"] = [_log_dict(l) for l in logs]
    # linked quotations
    cots = db.query(SalesQuotation).filter(SalesQuotation.sc_id == sc_id).all()
    d["cotizaciones"] = [_cot_dict(c) for c in cots]
    # Pedidos de Venta de esta Solicitud, para poder navegar SC -> COT -> PVEN desde el
    # detalle de la SC: por sc_id propio o por cualquiera de sus cotizaciones (un PVEN
    # creado desde una COT que despues se desvinculo de la SC conserva el cot_id).
    ven_filter = SaleOrder.sc_id == sc_id
    if cots:
        ven_filter = ven_filter | SaleOrder.cot_id.in_([c.id for c in cots])
    vens = db.query(SaleOrder).filter(ven_filter).order_by(SaleOrder.id.asc()).all()
    d["pedidos_venta"] = [_ven_dict(v) for v in vens]
    return {"status": "success", "data": d}


@router.patch("/solicitudes/{sc_id}")
def update_solicitud(sc_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "Solicitud no encontrada")
    # Gate 1 (requisito de seguridad, no solo UX -- ver Global Constraint del plan):
    # CONFIRMADA solo se alcanza cuando el cliente confirma via el enlace publico de
    # un solo uso (confirmacion_publica.py). Sin este check, este PATCH generico
    # seguia permitiendo que cualquier ROLE_ADMIN/ROLE_ASESOR forzara CONFIRMADA
    # directamente con {"estado": "CONFIRMADA"} -- el mismo atajo de un click que
    # esta tarea existe para cerrar, solo que por una ruta distinta a la pastilla de
    # ESTADOS_SC_MANUALES del frontend (que si se corrigio en Step 12). Los demas
    # valores de estado se revisan abajo (N4: solo BORRADOR a mano).
    if body.get("estado") == "CONFIRMADA":
        raise HTTPException(400, "CONFIRMADA solo se alcanza cuando el cliente confirma via el enlace enviado (no se puede forzar manualmente).")
    # Final whole-branch review (hallazgo #3): mismo tipo de bypass que ya se cerro para
    # Cotizacion (Gate 2) -- ASIGNADA y PENDIENTE_CONFIRMACION tampoco deben alcanzarse
    # por este PATCH generico. ASIGNADA solo se alcanza por la auto-promocion real
    # (promueve_asignada, mas abajo, que SI sigue escribiendo sc.estado directamente en
    # memoria -- este check solo bloquea cuando el BODY lo pide explicitamente) y
    # PENDIENTE_CONFIRMACION solo por enviar_solicitud_para_confirmacion (el endpoint
    # dedicado, unico lugar que crea el token). El drop del Kanban del Hub en la columna
    # "En Gestion" mandaba exactamente {"estado": "PENDIENTE_CONFIRMACION"} por esta via
    # generica, sin advisor necesariamente involucrado y sin ningun token -- dejaba la SC
    # mal etiquetada. Confirmado seguro: el formulario de edicion de la SC nunca manda
    # "estado" en su PATCH, asi que esto no rompe el flujo real de edicion.
    if body.get("estado") in ("ASIGNADA", "PENDIENTE_CONFIRMACION"):
        raise HTTPException(400, "Este estado solo se alcanza automáticamente (asignar un asesor) o por el flujo de confirmación del cliente (no se puede forzar manualmente con este PATCH).")
    # N4: cancelar es POST /cancelar (motivo, eliminada_at, lead perdido y revision de documentos activos), nunca
    # este PATCH. Fuera de eso, a mano solo se vuelve a 'Borrador' (esto tambien cierra los estados de pedido que el
    # cambio masivo del Hub mandaba a una SC). Reenviar el estado que ya tiene no es un cambio.
    nuevo_estado = body.get("estado")
    # Una SC cancelada (en la Papelera) solo vuelve por /restaurar, que limpia eliminada_at, revisa sus documentos y
    # devuelve el lead: la pastilla 'Borrador' o soltarla en el Hub no la reviven a medias.
    if sc.estado == "CANCELADA" and nuevo_estado and nuevo_estado != "CANCELADA":
        raise HTTPException(409, f"La solicitud {sc.numero} está cancelada: para volver a trabajar en ella, "
                                 f"restáurala desde la Papelera (botón «Restaurar»).")
    if nuevo_estado == "CANCELADA" and sc.estado != "CANCELADA":
        raise HTTPException(400, "Para cancelar una solicitud usa el botón «Cancelar Solicitud»: pide el motivo y "
                                 "revisa que no tenga cotizaciones ni pedidos activos.")
    if nuevo_estado and nuevo_estado != sc.estado and nuevo_estado not in ESTADOS_SC_MANUALES:
        raise HTTPException(400, f"El estado «{_nombre_de_estado('SC', nuevo_estado)}» no se puede asignar a mano "
                                 f"a una solicitud; solo «Borrador».")
    # R10: volver a Borrador reinicia el ciclo de Gate 1 (revoca el enlace y limpia la confirmacion): no con una
    # cotizacion o un pedido vivos colgando de la SC.
    if nuevo_estado == "BORRADOR" and sc.estado != "BORRADOR":
        cots_activas, pvens_activos = _documentos_activos_de_solicitud(db, sc.id)
        if cots_activas or pvens_activos:
            raise HTTPException(409, _mensaje_documentos_activos(sc, cots_activas, pvens_activos,
                                                                 "devolver a Borrador"))
    old_estado = sc.estado
    fecha_vieja = sc.fecha_entrega_estimada if "fecha_entrega_estimada" in body else None
    antes_log = cambios_documento.tomar_foto(sc, "SC")
    cliente_antes = _cliente_de_la_solicitud(sc)
    allowed = ["customer_id","customer_name","customer_phone","customer_email",
               "customer_address","advisor_name","advisor_user_id","tipo_solicitud","modalidad_pago","estado",
               "fecha_vencimiento","fecha_entrega_estimada","notas","productos",
               "tipo_problema","descripcion_problema","urgencia","evidencia_descripcion",
               "asignado_a_user_id","estado_soporte"]
    for k in allowed:
        if k in body:
            v = body[k]
            if k in ("advisor_user_id", "asignado_a_user_id"):
                v = _int_or_none(v)
            setattr(sc, k, v)
    # Gate 1 -- invariante (Round 6, generaliza la version de la implementacion original
    # de este Task): una SC nunca debe quedar en BORRADOR con un asesor ya asignado. La
    # version original solo evaluaba esto en la primera asignacion (not sc.advisor_user_id
    # antes del loop), lo que dejaba un callejon sin salida: una SC que volviera a BORRADOR
    # (pastilla manual, restaurar_solicitud, etc.) sin perder su advisor_user_id no tenia
    # forma de volver a ASIGNADA salvo desasignar y reasignar. Se evalua sobre el estado
    # RESULTANTE de este PATCH (despues del loop de arriba) para cubrir ambos casos con
    # una sola condicion: primera asignacion (sc.estado ya era BORRADOR y no cambia aqui,
    # advisor_user_id pasa de None a un id real) y reset-con-asesor-todavia-puesto (el
    # body pide "estado": "BORRADOR" explicitamente pero advisor_user_id sigue siendo no
    # nulo) -- en ambos casos se promueve a ASIGNADA de inmediato.
    promueve_asignada = sc.estado == "BORRADOR" and sc.advisor_user_id is not None
    if promueve_asignada:
        sc.estado = "ASIGNADA"
    # Gate 1 -- caso inverso (Round 6): si este PATCH deja a la SC sin asesor
    # (advisor_user_id resultante nulo) mientras estaba ASIGNADA o PENDIENTE_CONFIRMACION,
    # no debe quedar en ese estado sin asesor ofreciendo acciones que ya no aplican
    # ("Enviar para Confirmacion" sin nadie a quien atribuirselo) -- se degrada a
    # BORRADOR, mismos efectos de reinicio que la pastilla manual. Mutuamente excluyente
    # con promueve_asignada por construccion: una exige advisor_user_id resultante no
    # nulo, la otra exige que sea nulo.
    desasigna_a_borrador = (
        sc.advisor_user_id is None and old_estado in ("ASIGNADA", "PENDIENTE_CONFIRMACION")
    )
    if desasigna_a_borrador:
        sc.estado = "BORRADOR"
    # Gate 1: ESTE cliente confirma ESTOS productos. Si cambian los productos o el cliente con el
    # enlace pendiente o ya confirmado (y sin Cotizacion activa: una RECHAZADA no cuenta, N7), esa
    # confirmacion ya no aplica: vuelve a ASIGNADA para reenviarla -- `transiciona` (abajo) revoca
    # el token y limpia gate1_confirmed_at. Mismo criterio que el congelamiento de precio de Gate 2
    # en update_cotizacion. Vincular una linea al catalogo no cuenta (cambian_productos).
    cambian_los_productos = "productos" in body and cambios_documento.cambian_productos(
        antes_log.get("productos"), sc.productos)
    cambia_el_cliente = _cliente_de_la_solicitud(sc) != cliente_antes
    invalida_confirmacion = (
        (cambian_los_productos or cambia_el_cliente)
        and sc.estado == old_estado
        and old_estado in ("PENDIENTE_CONFIRMACION", "CONFIRMADA")
        and db.query(SalesQuotation.id).filter(SalesQuotation.sc_id == sc.id,
                                               SalesQuotation.estado != "RECHAZADA").first() is None
    )
    if invalida_confirmacion:
        sc.estado = "ASIGNADA" if sc.advisor_user_id else "BORRADOR"
    # Con una COT activa el estado no cambia, pero si cambio el cliente la confirmacion (y el enlace) eran del cliente
    # anterior: se anulan igual (abajo se revoca el enlace y queda en la Actividad).
    anula_por_cliente = (cambia_el_cliente and not invalida_confirmacion
                         and (sc.gate1_confirmed_at is not None or old_estado == "PENDIENTE_CONFIRMACION"))
    # N7: gate1_confirmed_at es la confirmacion VIGENTE del cliente sobre los productos actuales. Si cambian (o cambia
    # el cliente), deja de valer aunque la SC tenga una COT activa: si esa COT se rechaza, la SC no puede crear otra
    # con productos o un cliente que no confirmaron (tendra que reenviarsela).
    if (cambian_los_productos or cambia_el_cliente) and sc.gate1_confirmed_at is not None:
        sc.gate1_confirmed_at = None
    # H36+H43: si cambio la modalidad de pago, el anticipo de sus COT abiertas sin pedido vigente se recalcula
    # aqui, ANTES del commit de abajo y con _log(commit=False): sin commits intermedios (choque H36/H29).
    if "modalidad_pago" in body and antes_log.get("modalidad_pago") != sc.modalidad_pago:
        _recalcular_anticipo_por_modalidad(db, sc, body.get("updated_by") or getattr(user, "email", None))
    # Round 8 (fix de concurrencia encontrado en re-review): captura la transicion
    # de ESTE request AHORA, antes de cualquier commit/refresh. db.refresh(sc) mas
    # abajo re-lee la fila desde la DB -- si otro request (p.ej. el cliente
    # confirmando por el link publico, concurrentemente) ya comiteo su propio
    # cambio de estado para esta misma SC, sc.estado despues del refresh reflejaria
    # ESE otro commit, no el de este request. Comparar sc.estado contra old_estado
    # DESPUES del refresh (como se hacia antes) detectaba una "transicion" que este
    # request nunca causo, y revocaba/limpiaba una confirmacion de cliente legitima
    # y recien hecha. Capturando el booleano aqui, antes de que nada mas pueda
    # pisar sc.estado en memoria, la decision de revocar queda atada unicamente a
    # lo que este request de verdad cambio.
    transiciona = sc.estado != old_estado
    sc.updated_at = datetime.datetime.utcnow()
    # H29: guardar la SC es UNA sola transaccion con UN commit (al final). Aqui solo se hace flush: el UPDATE
    # sale a la base (y bloquea la fila hasta el commit) sin devolver la conexion al pool, y el refresh trae los
    # valores tipados (las fechas del body llegan como texto) para la foto 'despues' y el calculo de dias.
    # Todo lo de abajo (Actividad, revocacion del enlace) usa commit=False y se confirma junto con la SC.
    db.flush()
    db.refresh(sc)
    # Primero lo editado y despues el cambio de estado que provoca (p.ej. asignar asesor ->
    # ASIGNADA), para que la linea de tiempo se lea en el orden causal.
    _registrar_cambios(db, "SC", sc, antes_log, body, user, commit=False)
    if body.get("estado") and body["estado"] != old_estado:
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED",
             f"Estado cambiado a {sc.estado}",
             old_estado=old_estado, new_estado=sc.estado,
             user_name=body.get("updated_by"), commit=False)
    if promueve_asignada and not (body.get("estado") and body["estado"] != old_estado):
        # El check de arriba solo loguea cuando el REQUEST manda "estado" explicitamente.
        # promueve_asignada puede cambiar sc.estado sin que el body lo pida (solo manda
        # advisor_user_id), asi que sin este bloque la transicion a ASIGNADA quedaria
        # invisible en el Chatter/Actividad. El guard evita un doble log en el caso raro
        # de que el mismo PATCH mande advisor_user_id Y un estado explicito distinto.
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED", "Estado cambiado a ASIGNADA (asesor asignado)",
             old_estado=old_estado, new_estado=sc.estado, user_name=body.get("updated_by"), commit=False)
    if desasigna_a_borrador and not (body.get("estado") and body["estado"] != old_estado):
        # Mismo motivo que el bloque anterior: esta transicion ocurre sin que el body
        # mande "estado" (solo limpia advisor_user_id), asi que necesita su propio log.
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED", "Estado cambiado a BORRADOR (asesor retirado)",
             old_estado=old_estado, new_estado=sc.estado, user_name=body.get("updated_by"), commit=False)
    if invalida_confirmacion:
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED",
             (f"Estado cambiado a {sc.estado}: se modificaron los productos, así que la confirmación del cliente "
              f"ya no es válida y hay que reenviarle la solicitud") if cambian_los_productos else
             (f"Estado cambiado a {sc.estado}: cambió el cliente de la solicitud, así que la confirmación del "
              f"cliente anterior ya no es válida y hay que enviarle la solicitud al cliente nuevo"),
             old_estado=old_estado, new_estado=sc.estado,
             user_name=body.get("updated_by") or getattr(user, "email", None), commit=False)
    if anula_por_cliente:
        _log(db, "SC", sc.id, sc.numero, "UPDATED",
             "Cambió el cliente de la solicitud: la confirmación del cliente anterior ya no vale y su enlace quedó "
             "anulado. Para crear otra cotización, envíale la solicitud al cliente nuevo para que la confirme.",
             user_name=body.get("updated_by") or getattr(user, "email", None), commit=False)
    if fecha_vieja is not None and sc.fecha_entrega_estimada and sc.fecha_entrega_estimada.date() != fecha_vieja.date():
        # Final whole-branch review (hallazgo #2): .date() en ambos lados antes de
        # restar -- las fechas se calculan como utcnow() + timedelta(...) (Task 1), asi
        # que el valor guardado SIEMPRE trae una hora real (no medianoche), pero cada UI
        # de edicion (incluida la de esta misma SC) manda un string de solo fecha
        # ('YYYY-MM-DD', hora implicita medianoche) al guardar. Restar los timestamps
        # crudos reportaba una diferencia de dias incorrecta (off-by-one en el limite del
        # dia) en practicamente cualquier edicion real -- a veces hasta reportando "un
        # cambio" cuando la fecha de calendario en realidad no se habia movido.
        diff_dias = (sc.fecha_entrega_estimada.date() - fecha_vieja.date()).days
        signo = "+" if diff_dias >= 0 else ""
        _log(db, "SC", sc.id, sc.numero, "FECHA_ENTREGA_MODIFICADA",
             f"Fecha de entrega modificada: {fecha_vieja.strftime('%d/%m/%Y')} -> "
             f"{sc.fecha_entrega_estimada.strftime('%d/%m/%Y')} ({signo}{diff_dias} día{'s' if abs(diff_dias)!=1 else ''})",
             user_name=body.get("updated_by"), commit=False)
    if transiciona or anula_por_cliente:
        # Gate 1 (Round 7, ampliado; Round 8, usa el booleano capturado arriba en vez
        # de comparar sc.estado otra vez aqui): CUALQUIER transicion real de estado
        # causada por ESTE PATCH reinicia el flujo -- no solo el reset a BORRADOR o
        # desasignar. Un security review probo que la pastilla generica "Cambiar
        # Estado -> Cancelada" (que no pasa por cancelar_solicitud) dejaba vivo el
        # token y la marca de un ciclo anterior; lo mismo aplica a cualquier otro
        # estado que este PATCH pueda escribir. Revocar+limpiar en cualquier
        # transicion real es mas simple y estrictamente mas seguro que enumerar cada
        # estado destino especificamente (y es un no-op barato cuando no habia nada
        # que revocar, p.ej. en la primera promocion BORRADOR->ASIGNADA via
        # promueve_asignada). Igual cuando cambio el cliente sin cambio de estado
        # (anula_por_cliente): el enlace y la marca eran del cliente anterior.
        from app.core.confirmation_tokens import revoke_pending_tokens
        revoke_pending_tokens(db, "SC", sc.id, commit=False)
        sc.gate1_confirmed_at = None
    # El dict se arma ANTES del commit: tras el commit el objeto queda expirado y leerlo costaria otro viaje a la base.
    resp = _sc_dict(sc)
    db.commit()
    return {"status": "success", "data": resp}


@router.post("/solicitudes/{sc_id}/enviar-confirmacion")
def enviar_solicitud_para_confirmacion(sc_id: int, body: dict,
        user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    """Gate 1: genera un link de confirmacion de un solo uso y lo envia al cliente.

    Valido cuando la SC ya tiene asesor asignado y esta ASIGNADA (ver
    update_solicitud/promueve_asignada), o cuando ya esta PENDIENTE_CONFIRMACION --
    este segundo caso es un reenvio (Round 6: cierra el callejon sin salida de un
    link vencido, TTL de 2 dias, sin ninguna forma de pedir uno nuevo). La SC
    queda/permanece en PENDIENTE_CONFIRMACION hasta que el cliente confirme via el
    link (ver confirmacion_publica.py)."""
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "Solicitud no encontrada")
    if sc.estado not in ("ASIGNADA", "PENDIENTE_CONFIRMACION"):
        raise HTTPException(400, f"La solicitud debe estar Asignada antes de enviar para confirmación (estado actual: {sc.estado})")
    # Round 6: red de seguridad barata -- hoy ASIGNADA y PENDIENTE_CONFIRMACION ya
    # implican un asesor por construccion (ver update_solicitud/promueve_asignada y
    # create_solicitud), pero se valida explicitamente en vez de asumirlo, porque este
    # mismo endpoint es ahora tambien la base del reenvio mas abajo.
    if not sc.advisor_user_id:
        raise HTTPException(400, "La solicitud no tiene un asesor asignado.")
    if not _tiene_productos_para_cotizar(sc.productos):
        raise HTTPException(400, "Agrega al menos un producto a la solicitud antes de enviarla al cliente: "
                                 "sin productos no hay nada que confirmar ni que cotizar.")

    from app.core.confirmation_tokens import create_confirmation_token, revoke_pending_tokens
    from app.core.email import send_email
    import os

    old_estado = sc.estado
    es_reenvio = old_estado == "PENDIENTE_CONFIRMACION"
    # Round 7: revocar-y-emitir SIEMPRE (no solo cuando es_reenvio) -- un security
    # review encontro que un envio "fresco" desde ASIGNADA puede en realidad seguir
    # a un ciclo anterior sin terminar (cancelar via la pastilla generica de estado,
    # restaurar, reenviar) cuyo token previo nunca se revoco por esa ruta. Revocar
    # incondicionalmente aqui es mas simple Y estrictamente mas seguro que tratar de
    # enumerar cada combinacion de donde pudo quedar un token vivo.
    revoke_pending_tokens(db, "SC", sc.id)

    raw_token = create_confirmation_token(db, "SC", sc.id)
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5100").rstrip("/")
    link = f"{frontend_url}/confirmar/{raw_token}"

    sc.estado = "PENDIENTE_CONFIRMACION"
    sc.updated_at = datetime.datetime.utcnow()
    db.commit()
    _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED",
         "Enlace de confirmación reenviado al cliente" if es_reenvio else "Enviada para confirmación del cliente",
         old_estado=old_estado, new_estado="PENDIENTE_CONFIRMACION", user_name=body.get("user_name"))

    if sc.customer_email:
        send_email(sc.customer_email, f"Confirma tu solicitud {sc.numero} - Nebulae",
                    f'<p>Por favor confirma tu solicitud haciendo clic aquí: <a href="{link}">{link}</a></p>')

    return {"status": "success", "data": _sc_dict(sc), "link_confirmacion": link}


@router.post("/solicitudes/{sc_id}/confirmar")
def confirmar_solicitud(sc_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Confirm SC -> creates COT automatically"""
    # Final whole-branch review (hallazgo #5): .with_for_update() -- sin esto, dos
    # requests concurrentes podian pasar ambos el chequeo del marcador (lectura sin
    # bloqueo) y crear dos Cotizaciones distintas desde UNA sola confirmacion del
    # cliente. Mismo patron que convertir_cotizacion_a_venta (Gate 2) ya usa desde el
    # principio -- Gate 1 nunca tuvo este endurecimiento.
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).with_for_update().first()
    if not sc:
        raise HTTPException(404, "Solicitud no encontrada")
    if sc.estado != "CONFIRMADA":
        raise HTTPException(400, f"No se puede confirmar en estado {sc.estado}")
    # Gate 1, segunda capa (Round 4; N7): _sincronizar_estado_solicitud_desde_cotizacion tambien
    # escribe SC.estado = "CONFIRMADA" cuando su Cotizacion vinculada se confirma, y rechazar la
    # unica COT activa deja la SC en CONFIRMADA para crearle otra (N7). Por eso no se crea otra COT
    # mientras haya una activa (una RECHAZADA no cuenta; una VENCIDA si) o un pedido vigente.
    # Junto con el with_for_update de arriba, esto es lo que impide el duplicado ahora que la marca
    # ya no se consume.
    cots_activas, pvens_activos = _documentos_activos_de_solicitud(db, sc.id)
    if cots_activas:
        raise HTTPException(400, f"Esta solicitud ya tiene la cotización {cots_activas[-1].numero} activa; no se "
                                 f"puede crear otra. Si el cliente no la aceptó, márcala como Rechazada y vuelve a "
                                 f"intentarlo.")
    if pvens_activos:
        raise HTTPException(400, f"Esta solicitud ya tiene el pedido de venta {pvens_activos[-1].numero} activo; no "
                                 f"se puede crear otra cotización.")
    # Gate 1, capa real (Round 6): marca de procedencia en vez de inferir legitimidad de
    # otros campos mutables. gate1_confirmed_at SOLO la escribe confirmar_via_token
    # (confirmacion_publica.py) -- nunca ningun PATCH ni la sincronizacion COT->SC. N7: ya no
    # se consume al crear la COT; significa "confirmacion vigente del cliente sobre los
    # productos actuales de la SC" y se invalida cuando cambian los productos, cuando un PATCH
    # reinicia la SC, al cancelar, al restaurar y cuando una COT deja la SC (update_cotizacion
    # con otro sc_id): asi el ataque de "desvincular la COT" de la Ronda 6 sigue cerrado.
    if sc.gate1_confirmed_at is None:
        raise HTTPException(400, "Esta solicitud no tiene una confirmación de cliente válida y sin usar; no se puede crear la Cotización.")
    # Una SC confirmada antes de que se exigieran productos para enviarla podria no tener
    # ninguno: la Cotizacion saldria vacia. Se agregan en la SC (lo que pide reconfirmar).
    if not _tiene_productos_para_cotizar(sc.productos):
        raise HTTPException(400, "La solicitud no tiene productos para cotizar. Agrégalos en la solicitud "
                                 "y vuelve a enviársela al cliente para que la confirme.")

    # Al crear el borrador de cotizacion, la solicitud pasa a COTIZADA (no CONFIRMADA:
    # eso solo ocurre cuando el cliente realmente confirma la cotizacion).
    old_estado = sc.estado
    sc.estado = "COTIZADA"
    sc.updated_at = datetime.datetime.utcnow()
    # N7: si la COT nueva reemplaza a una rechazada, su Actividad lo dice (la ultima rechazada).
    rechazada = (db.query(SalesQuotation.numero)
                 .filter(SalesQuotation.sc_id == sc.id, SalesQuotation.estado == "RECHAZADA")
                 .order_by(SalesQuotation.id.desc()).first())

    # Calculate delivery date based on modalidad_entrega
    dias = DIAS_ENTREGA_DEFAULT.get(sc.modalidad_entrega, DIAS_ENTREGA_DEFAULT["NORMAL"])
    entrega_est = datetime.datetime.utcnow() + datetime.timedelta(days=dias)
    sc.fecha_entrega_estimada = entrega_est

    # Final whole-branch review (hallazgo #5): el avance a COTIZADA se consolida en el
    # MISMO commit que crea la COT (no son dos commits separados) -- antes, una falla
    # entre ambos podia dejar la SC COTIZADA pero SIN ninguna Cotizacion creada -- un
    # estado sin salida, porque el chequeo de estado=="CONFIRMADA" no permite reintentar
    # desde ahi. Mismo patron que convertir_cotizacion_a_venta (Gate 2).
    cot_numero = _gen_numero(db, "COT-", "seq_cot")
    cot = SalesQuotation(
        numero=cot_numero,
        sc_id=sc.id,
        sc_numero=sc.numero,
        customer_id=sc.customer_id,
        customer_name=sc.customer_name,
        customer_phone=sc.customer_phone,
        customer_email=sc.customer_email,
        customer_address=sc.customer_address,
        cotizador=body.get("cotizador", sc.advisor_name),
        estado="BORRADOR",
        productos=sc.productos or [],
        fecha_entrega_estimada=entrega_est,
        created_by=body.get("user_name"),
    )
    db.add(cot)
    db.commit()
    db.refresh(cot)
    # Los dos _log de abajo van DESPUES del unico commit que de verdad importa (arriba)
    # -- cada _log hace su propio commit interno, solo para la fila de ActivityLog, asi
    # que su orden relativo entre si no afecta la atomicidad de lo que ya se escribio.
    _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED",
         "Solicitud cotizada - Cotizacion creada",
         old_estado=old_estado, new_estado="COTIZADA",
         user_name=body.get("user_name"))
    _log(db, "COT", cot.id, cot.numero, "CREATED",
         (f"Cotización {cot.numero} creada desde {sc.numero} (reemplaza a la cotización rechazada {rechazada.numero})"
          if rechazada else f"Cotizacion {cot.numero} creada desde {sc.numero}"),
         new_estado="BORRADOR", user_name=body.get("user_name"))

    return {"status": "success", "data": {"sc": _sc_dict(sc), "cotizacion": _cot_dict(cot)}}


@router.post("/solicitudes/{sc_id}/actividad")
def add_sc_activity(sc_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "Solicitud no encontrada")
    _log(db, "SC", sc.id, sc.numero,
         body.get("action", "NOTE_ADDED"),
         body.get("description"),
         user_name=body.get("user_name"))
    return {"status": "success"}


# ─── COTIZACIONES (COT) ──────────────────────────────────────────────────────

@router.get("/cotizaciones")
def list_cotizaciones(
    estado: Optional[str] = None,
    sc_id: Optional[int] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db)
):
    q = db.query(SalesQuotation)
    if estado:
        q = q.filter(SalesQuotation.estado == estado)
    if sc_id:
        q = q.filter(SalesQuotation.sc_id == sc_id)
    if search:
        like = f"%{search}%"
        q = q.filter(
            SalesQuotation.numero.ilike(like) |
            SalesQuotation.customer_name.ilike(like) |
            SalesQuotation.cotizador.ilike(like) |
            SalesQuotation.sc_numero.ilike(like) |
            productos_ilike(SalesQuotation.productos, like)
        )
    total = q.count()
    items = q.order_by(SalesQuotation.created_at.desc()).offset(offset).limit(limit).all()
    return {"status": "success", "total": total, "data": [_cot_dict(c) for c in items]}


@router.post("/cotizaciones", status_code=201)
def create_cotizacion(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    _validar_precios_productos(body.get("productos") or [])
    # H42: la cabecera se guarda en pesos enteros (antes de gastar un numero de la secuencia).
    subtotal_cop = _monto_en_pesos(body.get("subtotal_cop"), "subtotal_cop")
    total_cop = _monto_en_pesos(body.get("total_cop"), "total_cop")
    anticipo_cop = _monto_en_pesos(body.get("anticipo_cop"), "anticipo_cop")
    entrega_est = None
    if body.get("dias_entrega"):
        entrega_est = datetime.datetime.utcnow() + datetime.timedelta(days=body["dias_entrega"])

    sc_id = body.get("sc_id")
    sc = None
    sc_numero = body.get("sc_numero")
    customer_id = body.get("customer_id")
    customer_name = body.get("customer_name")
    customer_phone = body.get("customer_phone")
    customer_email = body.get("customer_email")
    customer_address = body.get("customer_address")
    if sc_id:
        # La Solicitud de Cliente es la fuente autoritativa de estos datos.
        # No confiar en lo que mande el body para ellos: si el llamador (ej.
        # Cotizador Rapido en /dashboard/cotiza) manda sc_id pero omite
        # sc_numero/customer_name, antes quedaban vacios para siempre y el
        # chip "Origen" terminaba mostrando el id crudo (SC-8) en vez del
        # numero real (SC-20260317). Ver confirmar_solicitud() arriba, que
        # ya hacia esto bien por tener el objeto SC en memoria.
        sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
        if sc:
            sc_numero = sc.numero
            customer_id = sc.customer_id
            customer_name = sc.customer_name
            customer_phone = sc.customer_phone
            customer_email = sc.customer_email
            customer_address = sc.customer_address
        # Si no existe (caso raro), se mantiene el comportamiento anterior:
        # usar lo que vino en el body tal cual.
        if sc is not None and sc.estado == "CANCELADA":
            # N4: una SC cancelada no tiene cotizaciones vivas (antes de gastar un numero de la secuencia).
            raise HTTPException(409, _mensaje_solicitud_cancelada(sc, "crearle una cotización"))

    numero = _gen_numero(db, "COT-", "seq_cot")
    cot = SalesQuotation(
        numero=numero,
        sc_id=sc_id,
        sc_numero=sc_numero,
        customer_id=customer_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        customer_email=customer_email,
        customer_address=customer_address,
        cotizador=body.get("cotizador"),
        direccion_entrega=body.get("direccion_entrega"),
        trm_rate=body.get("trm_rate"),
        subtotal_cop=subtotal_cop,
        descuento_pct=body.get("descuento_pct", 0),
        total_cop=total_cop,
        # Sin SC (Cotizador Rapido) se respeta el anticipo que manda, en pesos enteros.
        anticipo_cop=anticipo_cop,
        estado="BORRADOR",
        fecha_entrega_estimada=entrega_est,
        notas=body.get("notas"),
        productos=body.get("productos", []),
        created_by=body.get("created_by"),
    )
    if sc is not None:
        # H36+H43: con SC, el anticipo sale de su modalidad de pago (o 60%), nunca del body.
        cot.anticipo_cop = anticipo_cotizacion(cot, db, sc=sc).requerido
    db.add(cot)
    db.commit()
    db.refresh(cot)
    if cot.sc_id:
        mover_lead_de_solicitud(cot.sc_id, "QUOTATION", db)
    _log(db, "COT", cot.id, cot.numero, "CREATED",
         f"Cotizacion {cot.numero} creada",
         new_estado="BORRADOR", user_name=body.get("created_by"))
    return {"status": "success", "data": _cot_dict(cot)}


@router.get("/cotizaciones/{cot_id}")
def get_cotizacion(cot_id: int, user: User = Depends(require_roles(*ALL_ERP_ROLES)),
        db: Session = Depends(get_db)):
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).first()
    if not cot:
        raise HTTPException(404, "Cotizacion no encontrada")
    logs = db.query(ActivityLog).filter(
        ActivityLog.entity_type == "COT",
        ActivityLog.entity_id == cot_id
    ).order_by(ActivityLog.created_at.asc()).all()
    d = _cot_dict(cot)
    d["actividades"] = [_log_dict(l) for l in logs]
    # linked VEN (H46: en orden de creacion, para que el frontend tome el ultimo vigente o cancelado)
    vens = db.query(SaleOrder).filter(SaleOrder.cot_id == cot_id).order_by(SaleOrder.id.asc()).all()
    d["pedidos_venta"] = [_ven_dict(v) for v in vens]
    # Anticipo (H36+H43, N1, R3, R6): lo mismo que exigira convertir_cotizacion_a_venta. Solo en el detalle (no en
    # _cot_dict) para no hacer una consulta por fila en el listado.
    pct, modalidad, _, requerido = anticipo_cotizacion(cot, db)
    total = redondear_peso(cot.total_cop)
    saldos = saldos_a_favor_de_cotizacion(db, cot.id)
    saldo_a_favor = sum((s["monto"] for s in saldos), Decimal("0"))
    # Para mostrar, a 2 decimales (el requerido usa el % exacto).
    d["anticipo_pct"] = float(pct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    d["sc_modalidad_pago"] = modalidad
    d["anticipo_requerido"] = float(requerido)
    d["saldo_a_favor"] = float(saldo_a_favor)
    d["saldo_a_favor_detalle"] = [{"pven_id": s["pedido"].id, "pven_numero": s["pedido"].numero,
                                   "monto": float(s["monto"])} for s in saldos]
    d["anticipo_por_verificar"] = float(max(Decimal("0"), requerido - min(saldo_a_favor, total)))
    return {"status": "success", "data": d}


# RECHAZADA no esta: rechazar una COT deja la SC activa (N7, ver _sincronizar_estado_solicitud_desde_cotizacion).
_MAPA_ESTADO_COTIZACION_A_SOLICITUD = {
    "BORRADOR": "COTIZADA",
    "ENVIADA": "EN_ESPERA_CONFIRMACION",
    "PENDIENTE_CONFIRMACION": "EN_ESPERA_CONFIRMACION",
    "CONFIRMADA": "CONFIRMADA",
    "VENCIDA": "VENCIDA",
}


def _sincronizar_estado_solicitud_desde_cotizacion(cot: "SalesQuotation", db: Session,
                                                   user_name: Optional[str] = None) -> None:
    """Mantiene CustomerRequest.estado como reflejo fiel del estado real de su Cotizacion.

    N4: una SC CANCELADA nunca se revive. N7: rechazar una COT no rechaza la SC: si la SC no tiene otra COT activa ni
    un pedido vigente, vuelve a CONFIRMADA cuando la confirmacion del cliente sigue vigente (gate1_confirmed_at: se le
    puede crear otra COT) o a ASIGNADA / BORRADOR (sin asesor) para reenviarsela; con otra COT activa o un pedido
    vigente no se toca."""
    if not cot.sc_id:
        return
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == cot.sc_id).first()
    if not sc or sc.estado == "CANCELADA":
        return
    if cot.estado == "RECHAZADA":
        cots_activas, pvens_activos = _documentos_activos_de_solicitud(db, sc.id)
        if any(c.id != cot.id for c in cots_activas) or pvens_activos:
            return
        old_estado = sc.estado
        if sc.gate1_confirmed_at is not None:
            sc.estado = "CONFIRMADA"
            texto = (f"La cotización {cot.numero} fue rechazada. La solicitud sigue activa: ya puedes crearle una "
                     f"nueva cotización.")
        else:
            sc.estado = "ASIGNADA" if sc.advisor_user_id else "BORRADOR"
            texto = (f"La cotización {cot.numero} fue rechazada. La solicitud sigue activa; para crearle otra "
                     f"cotización, reenvíasela al cliente para que la confirme.")
        sc.updated_at = datetime.datetime.utcnow()
        db.commit()
        if sc.estado != old_estado:
            _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED", texto, old_estado, sc.estado, user_name)
        else:  # p.ej. ya estaba CONFIRMADA (por la COT confirmada): el aviso queda, sin un "Confirmada -> Confirmada"
            _log(db, "SC", sc.id, sc.numero, "UPDATED", texto, user_name=user_name)
        return
    nuevo_estado = _MAPA_ESTADO_COTIZACION_A_SOLICITUD.get(cot.estado)
    if nuevo_estado and sc.estado != nuevo_estado:
        sc.estado = nuevo_estado
        sc.updated_at = datetime.datetime.utcnow()
        db.commit()


def _reabrir_cotizacion_por_pven_cancelado(db: Session, so: SaleOrder, user_name: Optional[str]) -> None:
    """H46+U25: al cancelar un Pedido de Venta (PATCH de la pantalla o POST /pedidos/{id}/cancelar), su COT vuelve de
    CONFIRMADA a BORRADOR para ajustarla, reenviarsela al cliente y crear otro pedido -- salvo que la COT tenga otro
    pedido vigente. Revoca el enlace pendiente y limpia gate2 (la confirmacion era para el pedido cancelado); la SC
    pasa a COTIZADA y el lead a QUOTATION. Se llama DESPUES del commit de la cancelacion y nunca la hace fallar: un
    error aqui se registra y se revierte solo lo suyo."""
    if not so.cot_id:
        return
    try:
        cot = (db.query(SalesQuotation).filter(SalesQuotation.id == so.cot_id)
               .populate_existing().with_for_update().first())
        if not cot or cot.estado != "CONFIRMADA" or _pven_vigente_de_cotizacion(db, cot.id) is not None:
            return
        from app.core.confirmation_tokens import revoke_pending_tokens
        cot.estado = "BORRADOR"
        cot.gate2_confirmed_at = None
        cot.updated_at = datetime.datetime.utcnow()
        revoke_pending_tokens(db, "COT", cot.id)  # commit: estado, marca y tokens juntos
        _sincronizar_estado_solicitud_desde_cotizacion(cot, db, user_name)
        mover_lead_de_solicitud(cot.sc_id, "QUOTATION", db)
        _log(db, "COT", cot.id, cot.numero, "ESTADO_CHANGED",
             f"El pedido {so.numero} se canceló: la cotización vuelve a Borrador para ajustarla, reenviarla al "
             f"cliente y crear otro pedido.",
             "CONFIRMADA", "BORRADOR", user_name,
             extra_data={"pven_cancelado_id": so.id, "pven_cancelado_numero": so.numero})
    except Exception as exc:
        db.rollback()
        logger.error(f"No se pudo reabrir la cotizacion del pedido cancelado {so.numero}: {exc}", exc_info=True)


def _validar_cambio_de_estado_cotizacion(db: Session, cot: SalesQuotation, nuevo) -> None:
    """Bloque UNICO de guardas del cambio de estado por PATCH (choque N5/H46/N4/N7/H50, R12), ANTES de tocar nada.
    Solo se evalua si el body trae un estado distinto del actual (reenviar el mismo estado nunca falla). En orden:
    (1) 400 CONFIRMADA / PENDIENTE_CONFIRMACION; (2) H50: 400 ENVIADA o un estado que no es manual; (3) 409 con un
    pedido vigente; (4) N4: 409 si la SC esta cancelada (salvo para rechazarla); (5) N7: 409 al retomar una RECHAZADA
    cuando la SC ya tiene otra COT activa."""
    if not nuevo or nuevo == cot.estado:
        return
    # (1) Gate 2 (Task 5, mismo criterio que update_solicitud para Gate 1): CONFIRMADA y PENDIENTE_CONFIRMACION solo
    # se alcanzan por rutas dedicadas (el enlace publico y enviar_cotizacion_para_confirmacion), nunca por este PATCH
    # generico. Round 2 (adversarial review): el drag-and-drop del Kanban del Hub mandaba PENDIENTE_CONFIRMACION por
    # aqui (incluso para una BORRADOR sin precios o para revivir una RECHAZADA) y emitia un email de confirmacion como
    # efecto secundario de un PATCH generico.
    if nuevo in ("CONFIRMADA", "PENDIENTE_CONFIRMACION"):
        raise HTTPException(400, "Este estado solo se alcanza por el flujo de confirmación del cliente (no se puede forzar manualmente con este PATCH).")
    # (2) H50: ENVIADA no se pone a mano (sacaba la COT de PENDIENTE_CONFIRMACION y revocaba sin querer el enlace que
    # el cliente ya tenia). Tambien cierra los estados de pedido que el cambio masivo del Hub mandaba a una COT.
    if nuevo == "ENVIADA":
        raise HTTPException(400, "'Enviada al cliente' no se puede poner a mano: usa 'Enviar al Cliente' en la "
                                 "cotización, que genera el enlace de confirmación.")
    if nuevo not in ESTADOS_COT_MANUALES:
        raise HTTPException(400, f"El estado «{_nombre_de_estado('COT', nuevo)}» no se puede asignar a mano a una "
                                 f"cotización.")
    # (3) N5/H46: con un pedido vigente la COT no cambia de estado (rechazarla borraria gate2 y arrastraria la SC con
    # un pedido vivo). Cancelar el pedido la devuelve sola a Borrador.
    pven = _pven_vigente_de_cotizacion(db, cot.id)
    if pven is not None:
        raise HTTPException(409, f"La cotización tiene el pedido {pven.numero} activo. Para cambiar su estado, "
                                 f"primero cancela ese pedido.")
    if not cot.sc_id:
        return
    retoma = cot.estado == "RECHAZADA"
    consulta = db.query(CustomerRequest).filter(CustomerRequest.id == cot.sc_id)
    # Retomar una RECHAZADA bloquea la SC, igual que confirmar_solicitud: los dos no pueden dejar dos COT activas.
    sc = (consulta.with_for_update() if retoma else consulta).first()
    if sc is None:
        return
    # (4) N4: una SC cancelada no tiene COT vivas (rechazarla si se puede: es lo que se pide para cancelar la SC).
    if sc.estado == "CANCELADA" and nuevo != "RECHAZADA":
        raise HTTPException(409, _mensaje_solicitud_cancelada(sc))
    # (5) N7: rechazar deja la SC lista para otra COT; retomar la rechazada no puede dejar dos activas.
    if retoma:
        otra = (db.query(SalesQuotation)
                .filter(SalesQuotation.sc_id == sc.id, SalesQuotation.id != cot.id,
                        SalesQuotation.estado != "RECHAZADA")
                .order_by(SalesQuotation.id.desc()).first())
        if otra is not None:
            raise HTTPException(409, f"La solicitud {sc.numero} ya tiene la cotización {otra.numero} activa; no se "
                                     f"puede retomar esta. Trabaja sobre {otra.numero} o recházala primero.")


# La COT solo cambia de solicitud fuera del ciclo de Gate 2 (sin enlace pendiente ni confirmacion del cliente).
_ESTADOS_COT_CAMBIO_DE_SOLICITUD = ("BORRADOR", "RECHAZADA")


def _leer_cambio_de_solicitud(db: Session, cot: SalesQuotation, body: dict):
    """N7, arreglo de seguridad (choque con la Ronda 6 de Gate 1): la COT ya no cambia de solicitud libremente.

    Como gate1_confirmed_at ya no se consume al crear la COT, desvincular una COT confirmada (PATCH {sc_id: null})
    dejaria la SC CONFIRMADA, con la marca y sin COT activa: POST /solicitudes/{id}/confirmar crearia otra COT sin
    que el cliente reconfirme. Por eso, si el body cambia sc_id: 422 si no es un id o la SC no existe; 409 si la COT
    no esta en Borrador o Rechazada (fuera del ciclo de Gate 2), si tiene un pedido vigente, si la SC nueva esta
    cancelada o ya tiene una COT activa o un pedido vigente. Las dos SC se bloquean en orden de id (dos traslados
    cruzados no se bloquean mutuamente). Si se acepta, devuelve (sc_anterior, sc_nueva) para limpiar la marca de la
    anterior y re-sincronizar las dos; None si sc_id no cambia (deja body['sc_id'] normalizado a int o None)."""
    if "sc_id" not in body:
        return None
    try:
        nuevo_id = _int_or_none(body.get("sc_id"))
    except (TypeError, ValueError):
        raise HTTPException(422, "El campo sc_id debe ser el número de una solicitud.")
    body["sc_id"] = nuevo_id
    if nuevo_id == cot.sc_id:
        return None
    if cot.estado not in _ESTADOS_COT_CAMBIO_DE_SOLICITUD:
        raise HTTPException(409, f"Solo se puede cambiar la solicitud de una cotización en Borrador o Rechazada "
                                 f"(estado actual: {_nombre_de_estado('COT', cot.estado)}).")
    pven = _pven_vigente_de_cotizacion(db, cot.id)
    if pven is not None:
        raise HTTPException(409, f"La cotización tiene el pedido {pven.numero} activo: no se puede cambiar su "
                                 f"solicitud.")
    ids = sorted(i for i in (cot.sc_id, nuevo_id) if i is not None)
    bloqueadas = {s.id: s for s in db.query(CustomerRequest).filter(CustomerRequest.id.in_(ids))
                  .order_by(CustomerRequest.id.asc()).with_for_update().all()}
    sc_nueva = None
    if nuevo_id is not None:
        sc_nueva = bloqueadas.get(nuevo_id)
        if sc_nueva is None:
            raise HTTPException(422, "La solicitud indicada no existe.")
        if sc_nueva.estado == "CANCELADA":
            raise HTTPException(409, _mensaje_solicitud_cancelada(sc_nueva, "vincularle una cotización"))
        cots_activas, pvens_activos = _documentos_activos_de_solicitud(db, sc_nueva.id)
        if cots_activas:
            raise HTTPException(409, f"La solicitud {sc_nueva.numero} ya tiene la cotización "
                                     f"{cots_activas[-1].numero} activa; no se le puede vincular otra.")
        if pvens_activos:
            raise HTTPException(409, f"La solicitud {sc_nueva.numero} ya tiene el pedido de venta "
                                     f"{pvens_activos[-1].numero} activo; no se le puede vincular otra cotización.")
    return bloqueadas.get(cot.sc_id) if cot.sc_id else None, sc_nueva


def _soltar_cotizacion_de_la_solicitud(db: Session, sc: CustomerRequest, cot: SalesQuotation) -> Optional[str]:
    """La COT deja la SC (cambio de sc_id, N7): su confirmacion de Gate 1 ya no vale (se limpia en el mismo commit
    que el cambio) y, con las reglas de un rechazo, si la SC no se queda con otra COT activa ni un pedido vigente y ya
    no tiene la marca, vuelve a ASIGNADA (BORRADOR sin asesor) para reenviarsela al cliente. Una SC CANCELADA no se
    toca. Devuelve el estado anterior si cambio de estado (None si no). Sin commit: lo hace update_cotizacion."""
    sc.gate1_confirmed_at = None
    if sc.estado == "CANCELADA":
        return None
    cots_activas, pvens_activos = _documentos_activos_de_solicitud(db, sc.id)
    if any(c.id != cot.id for c in cots_activas) or pvens_activos:
        return None
    nuevo = "ASIGNADA" if sc.advisor_user_id else "BORRADOR"
    if sc.estado == nuevo:
        return None
    anterior, sc.estado = sc.estado, nuevo
    sc.updated_at = datetime.datetime.utcnow()
    return anterior


@router.patch("/cotizaciones/{cot_id}")
def update_cotizacion(cot_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    # Bloqueada: las guardas de abajo (pedido vigente, SC cancelada, otra COT activa) se validan sobre la fila que se
    # va a escribir, sin que una conversion o una confirmacion concurrente la cambie en medio.
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).with_for_update().first()
    if not cot:
        raise HTTPException(404, "Cotizacion no encontrada")
    # Primero el cambio de solicitud: bloquea las dos SC en orden de id antes de que la guarda 5 bloquee la actual.
    cambio_de_solicitud = _leer_cambio_de_solicitud(db, cot, body)
    _validar_cambio_de_estado_cotizacion(db, cot, body.get("estado"))
    if "productos" in body:
        _validar_precios_productos(body.get("productos") or [])
    # R3: anticipo manual con nota obligatoria. Se valida aqui, antes de tocar nada (409/422).
    ajuste_manual = _leer_ajuste_anticipo_manual(db, cot, body)
    old_estado = cot.estado
    fecha_vieja = cot.fecha_entrega_estimada if "fecha_entrega_estimada" in body else None
    antes_log = cambios_documento.tomar_foto(cot, "COT")
    # Round 2 (hallazgo #5, "congelar" el precio confirmado): captura ANTES del loop
    # de abajo los valores de todo lo que afecta el precio/entrega que el cliente vio y
    # confirmo (o esta por confirmar). Si esta COT esta en el ciclo vigente de Gate 2
    # (PENDIENTE_CONFIRMACION, o CONFIRMADA sin un Pedido de Venta todavia -- una vez
    # que existe un PVEN, re-cotizar es la operacion legitima de actualizar un trato YA
    # CERRADO, no una confirmacion que se vuelve obsoleta) y este PATCH de verdad
    # CAMBIA alguno de esos valores (no solo "la llave vino en el body" -- un reenvio
    # del mismo valor no debe disparar esto), la confirmacion del cliente (dada o
    # pendiente) ya no aplica al precio nuevo: se reinicia el ciclo a BORRADOR, lo que
    # a su vez dispara sale_de_gate2 mas abajo (mismo mecanismo de revocar+limpiar que
    # ya usa cualquier otra salida del ciclo, sin duplicar esa logica aqui).
    # H36+H43: el anticipo NO congela el precio. El cliente nunca lo ve (confirmacion_publica solo expone total y
    # productos), asi que recalcularlo no regresa a BORRADOR una COT pendiente de confirmacion o confirmada.
    PRICE_FREEZE_FIELDS = ["productos", "total_cop", "subtotal_cop", "descuento_pct",
                           "trm_rate", "fecha_entrega_estimada", "sc_id"]
    old_price_values = {k: getattr(cot, k) for k in PRICE_FREEZE_FIELDS}
    # H36+H43: % de anticipo con los valores de ANTES del PATCH: el de una COT sin SC sale del anticipo/total
    # anteriores (y es el "antes" del renglon del anticipo manual).
    pct_previo, _ = pct_anticipo_cotizacion(cot, db)
    manual_previo = cot.anticipo_pct_manual
    # 'anticipo_cop' ya no es editable: lo calcula siempre el servidor (el del body se ignora).
    allowed = ["sc_id","customer_id","customer_name","customer_phone","customer_email",
               "customer_address","cotizador","direccion_entrega","trm_rate","subtotal_cop",
               "descuento_pct","total_cop","estado","canal_envio","fecha_entrega_estimada",
               "notas","productos","pec_id","pec_numero"]
    # H42: la cabecera de la COT queda en pesos enteros aunque el cliente mande decimales.
    _redondear_montos_del_body(body, ("subtotal_cop", "total_cop"))
    for k in allowed:
        if k in body:
            setattr(cot, k, body[k])
    marca_anulada = False
    estado_previo_sc_anterior = None
    if cambio_de_solicitud is not None:
        # N7 (seguridad): la confirmacion del cliente de la SC anterior ya no vale para crear otra COT; se limpia en
        # este mismo commit y la SC se re-sincroniza como en un rechazo.
        sc_anterior, sc_nueva = cambio_de_solicitud
        cot.sc_numero = sc_nueva.numero if sc_nueva is not None else None
        if sc_anterior is not None:
            marca_anulada = sc_anterior.gate1_confirmed_at is not None
            estado_previo_sc_anterior = _soltar_cotizacion_de_la_solicitud(db, sc_anterior, cot)
    cambia_manual = False
    if ajuste_manual is not None:
        pct_manual, nota_manual = ajuste_manual
        cambia_manual = (pct_manual != cot.anticipo_pct_manual) or (nota_manual != cot.anticipo_manual_nota)
        cot.anticipo_pct_manual, cot.anticipo_manual_nota = pct_manual, nota_manual

    _PRICE_DECIMAL_FIELDS = ("total_cop", "subtotal_cop", "descuento_pct", "trm_rate")

    def _quantize_cop(v):
        if v is None:
            return None
        try:
            return Decimal(str(v)).quantize(Decimal("0.01"))
        except Exception:
            return v

    def _freeze_producto_proyectado(p):
        """Round 4 (adversarial review): proyecta cada linea a SOLO lo que el cliente
        realmente vio y confirmo -- mismos 2 primeros campos (product_name, qty) que ya
        usa _productos_publicos en confirmacion_publica.py para la proyeccion publica de
        /confirmar/ver (mismo criterio: nunca costos/margenes de proveedor ni otros
        campos internos), mas unit_price_cop/total_cop cuantizados (esos dos
        _productos_publicos no los necesita cuantizar porque solo sirven para mostrarse,
        no para comparar). Critico: NUNCA sku_id/es_libre -- vincular una linea de texto
        libre a un SKU real del catalogo ("+ Ingresar como producto", quick-create) solo
        cambia esos dos campos de bookkeeping interno, nada que el cliente haya visto, y
        antes de este fix comparar el JSON crudo completo hacia que esa accion, por si
        sola, rompiera el congelamiento -- justo el tipo de edicion que un asesor hace
        normalmente poco antes de crear el Pedido de Venta, cuando la COT ya esta
        CONFIRMADA con mas frecuencia."""
        if not isinstance(p, dict):
            return p
        return (p.get("product_name"), p.get("qty"), _quantize_cop(p.get("unit_price_cop")), _quantize_cop(p.get("total_cop")))

    def _freeze_cmp(field, v):
        """Normaliza para comparar. Problemas distintos de tipo/precision/bookkeeping,
        cada uno capaz de disparar el congelamiento en una edicion normal que el cliente
        ni siquiera percibiria como "un cambio de precio", si no se normalizan:

        1. fecha_entrega_estimada: el valor VIEJO (ya en el ORM) es un datetime real,
        pero el NUEVO (si vino en el body) es un string crudo recien parseado del JSON --
        sin normalizar, un datetime nunca es == a un string aunque representen el mismo
        dia. Se compara solo a nivel de DIA (no el timestamp completo) porque el selector
        de fecha del frontend tampoco captura hora.

        2. total_cop/subtotal_cop/descuento_pct/trm_rate: URGENTE (Round 3)
        -- el valor VIEJO es un Decimal ya REDONDEADO por la propia columna Numeric(x,2)
        de Postgres al escribirse (p.ej. Decimal('60000.00')), pero el NUEVO es el float
        crudo que manda el body, SIN redondear -- y computeMarginPrice (frontend,
        pricing.js) no redondea su salida, asi que casi cualquier guardado real de la
        Calculadora produce un valor como 60000.00000000001 por ruido de punto flotante.
        Decimal('60000.00') != 60000.00000000001 en Python (son distintos de verdad, no
        es un bug de comparacion) -- sin cuantizar ambos lados a 2 decimales antes de
        comparar, el congelamiento se disparaba en ESENCIALMENTE CADA guardado real desde
        la Calculadora (incluso uno que solo tocara 'notas'), lo que habria hecho Gate 2
        inutilizable en operacion normal. Se cuantiza a 2 decimales (misma precision que
        las columnas Numeric reales) antes de comparar.

        3. productos: Round 4 -- comparar la lista de dicts CRUDA (sku_id, es_libre y
        demas campos internos incluidos) hacia que vincular una linea de texto libre a un
        SKU real del catalogo (que no cambia nada visible para el cliente) rompiera el
        congelamiento igual que si el precio hubiera cambiado de verdad. Se proyecta cada
        linea con _freeze_producto_proyectado antes de comparar."""
        if v is None:
            return None
        if field == "fecha_entrega_estimada":
            if isinstance(v, str):
                return v[:10]
            if isinstance(v, datetime.datetime):
                return v.date().isoformat()
            return v
        if field == "productos":
            if not isinstance(v, list):
                return v
            return [_freeze_producto_proyectado(p) for p in v]
        if field in _PRICE_DECIMAL_FIELDS:
            return _quantize_cop(v)
        return v

    # H36+H43 / R3: el servidor recalcula el anticipo al re-cotizar (aunque el total no cambie: corrige los
    # anticipos viejos en $0), cuando cambia el total o cuando se pone o quita el % manual.
    cambia_total = _quantize_cop(cot.total_cop) != _quantize_cop(old_price_values["total_cop"])
    recalcula_por_precio = bool(body.get("recotizacion")) or cambia_total
    pct_nuevo = pct_previo
    if recalcula_por_precio or cambia_manual:
        # Con el estado de DESPUES del loop: SC, % manual y total nuevos.
        pct_nuevo, _, origen, requerido = anticipo_cotizacion(cot, db)
        if origen == ORIGEN_CONSERVADO:
            # Sin SC ni % manual, el anticipo sigue al "% que ya tenia" (H36: un % heredado se conserva tal cual).
            # Con el mismo total, anticipo_cotizacion ya deja el anticipo guardado (min con el total).
            if manual_previo is not None:
                # Se quito el manual: el % "que ya tenia" seria el manual. R2: modalidad vacia -> 60%.
                pct_nuevo = PCT_ANTICIPO_POR_DEFECTO
                requerido = anticipo_requerido(cot.total_cop, pct_nuevo)
            elif cambia_total:
                # Otro total: el mismo % de antes del PATCH (anticipo/total viejos, sin cuantizar).
                pct_nuevo = pct_previo
                requerido = anticipo_requerido(cot.total_cop, pct_previo)
        cot.anticipo_cop = requerido
        if cambia_manual and not recalcula_por_precio:
            # El ajuste manual deja su propio renglon (abajo): que la edicion no repita el cambio del anticipo
            # como si fuera una re-cotizacion.
            antes_log["anticipo_cop"] = cot.anticipo_cop

    # H46: un pedido CANCELADO no cuenta -- la COT reabierta (o un dato viejo que quedo CONFIRMADA con todos sus
    # pedidos cancelados) vuelve a estar en el ciclo vigente de Gate 2 y su precio se congela.
    ya_tiene_pven = _pven_vigente_de_cotizacion(db, cot.id) is not None
    precio_congelado = old_estado == "PENDIENTE_CONFIRMACION" or (old_estado == "CONFIRMADA" and not ya_tiene_pven)
    hubo_cambio_de_precio = any(
        _freeze_cmp(k, getattr(cot, k)) != _freeze_cmp(k, old_price_values[k])
        for k in PRICE_FREEZE_FIELDS
    )
    rompe_congelamiento = precio_congelado and hubo_cambio_de_precio
    if rompe_congelamiento:
        cot.estado = "BORRADOR"
    # Gate 2 -- capturar AHORA, antes de cualquier commit/refresh, si ESTE PATCH saca a
    # la COT del ciclo vigente de Gate 2 (PENDIENTE_CONFIRMACION o CONFIRMADA) hacia
    # cualquier otro estado. No hay un cancelar_cotizacion/restaurar_cotizacion
    # dedicado como en SC -- este PATCH generico es la UNICA salida real del ciclo, asi
    # que es el unico lugar que necesita revocar el token pendiente y limpiar la marca
    # (ver el bloque al final de esta funcion). Capturado aqui, comparando old_estado
    # contra el estado YA ASIGNADO en memoria por el loop de arriba (y por el
    # rompe_congelamiento de arriba), para no repetir el bug de concurrencia de Task 4
    # (Round 7->8): comparar esto DESPUES de db.refresh(cot) podria confundir el commit
    # de ESTE request con el de un click de confirmacion del cliente llegando al mismo
    # tiempo por otra conexion.
    sale_de_gate2 = old_estado in ("PENDIENTE_CONFIRMACION", "CONFIRMADA") and cot.estado != old_estado
    cot.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(cot)
    # "Re-Cotizar" (la Calculadora) manda recotizacion=true: queda registrado aunque los
    # precios no hayan cambiado. Va antes del cambio de estado que pueda provocar
    # (rompe_congelamiento) para que la linea de tiempo se lea en orden causal.
    _registrar_cambios(db, "COT", cot, antes_log, body, user, recotizacion=bool(body.get("recotizacion")))
    if cambia_manual:
        extra_manual = {"pct_antes": str(pct_previo), "pct_despues": str(pct_nuevo),
                        "anticipo_despues": str(cot.anticipo_cop), "nota": cot.anticipo_manual_nota}
        if cot.anticipo_pct_manual is not None:
            _log(db, "COT", cot.id, cot.numero, "ANTICIPO_MANUAL",
                 f"Anticipo ajustado a mano: {formato_pct(cot.anticipo_pct_manual)} (antes {formato_pct(pct_previo)}). "
                 f"Nota: {cot.anticipo_manual_nota}",
                 user_name=body.get("updated_by") or getattr(user, "email", None), extra_data=extra_manual)
        else:
            _log(db, "COT", cot.id, cot.numero, "ANTICIPO_MODALIDAD",
                 f"Anticipo vuelve a la modalidad ({formato_pct(pct_nuevo)})",
                 user_name=body.get("updated_by") or getattr(user, "email", None), extra_data=extra_manual)
    if cambio_de_solicitud is not None:
        sc_anterior, sc_nueva = cambio_de_solicitud
        autor = body.get("updated_by") or getattr(user, "email", None)
        datos_cot = {"cot_id": cot.id, "cot_numero": cot.numero}
        if sc_anterior is not None and estado_previo_sc_anterior is not None:
            _log(db, "SC", sc_anterior.id, sc_anterior.numero, "ESTADO_CHANGED",
                 f"La cotización {cot.numero} se desvinculó de esta solicitud. La solicitud sigue activa; para crearle "
                 f"otra cotización, reenvíasela al cliente para que la confirme.",
                 estado_previo_sc_anterior, sc_anterior.estado, autor, extra_data=datos_cot)
            # Como cualquier reinicio de la SC: un enlace de Gate 1 pendiente ya no aplica.
            from app.core.confirmation_tokens import revoke_pending_tokens
            revoke_pending_tokens(db, "SC", sc_anterior.id)
        elif sc_anterior is not None:
            _log(db, "SC", sc_anterior.id, sc_anterior.numero, "UPDATED",
                 f"La cotización {cot.numero} se desvinculó de esta solicitud"
                 + (": la confirmación del cliente ya no vale para crear otra cotización; para hacer una nueva, "
                    "reenvíasela al cliente." if marca_anulada else "."),
                 user_name=autor, extra_data=datos_cot)
        if sc_nueva is not None:
            _log(db, "SC", sc_nueva.id, sc_nueva.numero, "UPDATED",
                 f"La cotización {cot.numero} se vinculó a esta solicitud.", user_name=autor, extra_data=datos_cot)
            if cot.estado != "RECHAZADA":
                # Una COT activa lleva a la SC nueva a su estado (BORRADOR -> COTIZADA). Una RECHAZADA no es activa:
                # aplicarle la regla del rechazo reiniciaria el flujo de la SC nueva por algo que no le paso a ella.
                try:
                    _sincronizar_estado_solicitud_desde_cotizacion(cot, db, autor)
                except Exception as exc:
                    db.rollback()
                    logger.error(f"Error al sincronizar la solicitud {sc_nueva.numero} al vincularle la cotizacion "
                                 f"{cot.id}: {exc}", exc_info=True)
    if body.get("estado") and body["estado"] != old_estado:
        try:
            # N7: rechazar ya no lleva el lead a perdido (eso pasa al cancelar la SC, N4). H50: ENVIADA ya no llega
            # por aqui; el lead pasa a QUOTATION en enviar_cotizacion_para_confirmacion.
            _sincronizar_estado_solicitud_desde_cotizacion(cot, db, body.get("updated_by"))
        except Exception as exc:
            db.rollback()
            logger.error(f"Error al sincronizar Solicitud/Lead tras actualizar cotizacion {cot.id}: {exc}", exc_info=True)
        _log(db, "COT", cot.id, cot.numero, "ESTADO_CHANGED",
             f"Estado cambiado a {cot.estado}",
             old_estado=old_estado, new_estado=cot.estado,
             user_name=body.get("updated_by"))
    elif rompe_congelamiento:
        # El check de arriba solo loguea cuando el REQUEST manda "estado" explicitamente
        # Y distinto del original. rompe_congelamiento cambia cot.estado sin que el body
        # lo pida (el caso tipico: solo manda productos/total_cop desde la Calculadora),
        # asi que sin este bloque la transicion a BORRADOR quedaria invisible en el
        # Chatter/Actividad -- mismo motivo que ya tienen los bloques equivalentes de
        # promueve_asignada/desasigna_a_borrador en update_solicitud.
        try:
            _sincronizar_estado_solicitud_desde_cotizacion(cot, db, body.get("updated_by"))
        except Exception as exc:
            db.rollback()
            logger.error(f"Error al sincronizar Solicitud tras romper congelamiento de precio en cotizacion {cot.id}: {exc}", exc_info=True)
        _log(db, "COT", cot.id, cot.numero, "ESTADO_CHANGED",
             "Estado cambiado a BORRADOR (la cotización fue editada tras la confirmación del cliente; esa confirmación ya no es válida)",
             old_estado=old_estado, new_estado="BORRADOR", user_name=body.get("updated_by"))
    if fecha_vieja is not None and cot.fecha_entrega_estimada and cot.fecha_entrega_estimada.date() != fecha_vieja.date():
        # Final whole-branch review (hallazgo #2) -- ver el comentario equivalente en
        # update_solicitud para la explicacion completa (mismo patron, mismo bug, en
        # las 4 entidades que registran este mismo tipo de cambio: SC/COT/VEN/PEC).
        diff_dias = (cot.fecha_entrega_estimada.date() - fecha_vieja.date()).days
        signo = "+" if diff_dias >= 0 else ""
        _log(db, "COT", cot.id, cot.numero, "FECHA_ENTREGA_MODIFICADA",
             f"Fecha de entrega modificada: {fecha_vieja.strftime('%d/%m/%Y')} -> "
             f"{cot.fecha_entrega_estimada.strftime('%d/%m/%Y')} ({signo}{diff_dias} día{'s' if abs(diff_dias)!=1 else ''})",
             user_name=body.get("updated_by"))
    if sale_de_gate2:
        # Ver el comentario junto a sale_de_gate2 arriba -- revoca cualquier token
        # pendiente y limpia la marca de procedencia, para que ninguno de los dos
        # quede vivo y reutilizable fuera de este ciclo.
        from app.core.confirmation_tokens import revoke_pending_tokens
        revoke_pending_tokens(db, "COT", cot.id)
        cot.gate2_confirmed_at = None
        db.commit()
    return {"status": "success", "data": _cot_dict(cot)}


@router.post("/cotizaciones/{cot_id}/enviar-confirmacion")
def enviar_cotizacion_para_confirmacion(cot_id: int, body: dict = Body(default_factory=dict),
        user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    """Gate 2: genera un link de confirmacion de un solo uso y lo envia al cliente.

    Round 2 (adversarial review): antes, update_cotizacion (el PATCH generico) creaba
    este mismo token con solo mandar {"estado": "PENDIENTE_CONFIRMACION"} -- exactamente
    lo que el drag-and-drop del Kanban del Hub manda al soltar una tarjeta en "No
    Resuelto" (ver dashboard/ventas/page.tsx), alcanzable incluso para una COT BORRADOR
    sin precios calculados o para revivir una RECHAZADA con un solo drag. Mismo patron
    que enviar_solicitud_para_confirmacion (Gate 1) ya usa desde el principio: un
    endpoint dedicado es la UNICA via real para que un PATCH generico nunca pueda
    disparar un envio de correo como efecto secundario.

    A diferencia de enviar_solicitud_para_confirmacion, este endpoint NO acepta
    reenvio-mientras-PENDIENTE_CONFIRMACION (solo BORRADOR/ENVIADA) -- decision
    explicita de este Round, no una omision: una COT no tiene el mismo callejon sin
    salida de "link vencido sin forma de pedir uno nuevo" que motivo esa excepcion
    para SC, porque update_cotizacion siempre puede reiniciar el ciclo a BORRADOR
    primero (vía cualquier edicion de precio, o la pastilla generica) y desde ahi
    volver a pedir un envio nuevo.
    """
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).first()
    if not cot:
        raise HTTPException(404, "Cotizacion no encontrada")
    if cot.estado not in ("BORRADOR", "ENVIADA"):
        raise HTTPException(400, f"La cotización debe estar en Borrador o Enviada antes de enviar para confirmación (estado actual: {cot.estado}).")
    # N4: una SC cancelada no tiene cotizaciones vivas.
    if cot.sc_id:
        sc = db.query(CustomerRequest).filter(CustomerRequest.id == cot.sc_id).first()
        if sc is not None and sc.estado == "CANCELADA":
            raise HTTPException(409, _mensaje_solicitud_cancelada(sc))
    # Una cotizacion sin productos ni precio calculado no tiene nada que el cliente
    # pueda confirmar -- cierra la variante "tarjeta BORRADOR vacia" del hallazgo #1.
    if not cot.productos or not cot.total_cop:
        raise HTTPException(400, "La cotización no tiene productos ni precio calculado; cotiza primero antes de enviar para confirmación.")
    # H46: un pedido CANCELADO no cuenta (la COT reabierta se reenvia para crear otro pedido).
    pven = _pven_vigente_de_cotizacion(db, cot.id)
    if pven is not None:
        raise HTTPException(400, f"Esta cotización ya tiene el pedido de venta {pven.numero} activo; no tiene sentido "
                                 f"volver a pedir confirmación.")

    from app.core.confirmation_tokens import create_confirmation_token, revoke_pending_tokens
    from app.core.email import send_email
    import os

    old_estado = cot.estado
    # Mismo criterio que enviar_solicitud_para_confirmacion: revocar incondicionalmente
    # antes de emitir, por si quedo un token vivo de un ciclo anterior sin terminar.
    revoke_pending_tokens(db, "COT", cot.id)

    raw_token = create_confirmation_token(db, "COT", cot.id)
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5100").rstrip("/")
    link = f"{frontend_url}/confirmar/{raw_token}"

    cot.estado = "PENDIENTE_CONFIRMACION"
    # Round 3 (adversarial review, hallazgo #2): limpia cualquier marca que pudiera haber
    # quedado de un ciclo anterior (defensa en profundidad -- por construccion, llegar
    # aqui ya implica que no deberia haber una vigente, dado que solo estados BORRADOR/
    # ENVIADA pasan el check de arriba, y el marcador solo es no-nulo mientras
    # estado=="CONFIRMADA"), para que un reenvio nunca arrastre una marca vieja hacia el
    # ciclo nuevo.
    cot.gate2_confirmed_at = None
    cot.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(cot)
    try:
        _sincronizar_estado_solicitud_desde_cotizacion(cot, db)
        # Restaura el movimiento de Lead a "QUOTATION" que el flujo viejo (PATCH directo
        # a ENVIADA) disparaba al enviar una cotizacion -- el endpoint dedicado de este
        # Round es ahora el unico lugar real donde "se envia la cotizacion", asi que el
        # efecto tiene que vivir aqui.
        mover_lead_de_solicitud(cot.sc_id, "QUOTATION", db)
    except Exception as exc:
        db.rollback()
        logger.error(f"Error al sincronizar Solicitud/Lead tras enviar cotizacion {cot.id} para confirmacion: {exc}", exc_info=True)
    _log(db, "COT", cot.id, cot.numero, "ESTADO_CHANGED",
         "Enviada para confirmación del cliente",
         old_estado=old_estado, new_estado="PENDIENTE_CONFIRMACION", user_name=body.get("user_name"))

    if cot.customer_email:
        send_email(cot.customer_email, f"Confirma tu cotización {cot.numero} - Nebulae",
                    f'<p>Revisa y confirma tu cotización aquí: <a href="{link}">{link}</a></p>')

    return {"status": "success", "data": _cot_dict(cot), "link_confirmacion": link}


@router.post("/cotizaciones/{cot_id}/confirmar")
def confirmar_cotizacion(cot_id: int, body: dict = Body(default_factory=dict), user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Confirm COT -> creates canonical VEN automatically with idempotent replay"""
    from app.api.v1.erp_ventas_fase4 import convertir_cotizacion_a_venta
    from app.api.v1.schemas_fase5 import ConvertirCotizacionVentaRequest

    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).first()
    if not cot:
        raise HTTPException(404, "Cotizacion no encontrada")
    # Gate 2 (Task 5): replay idempotente PRIMERO -- si esta COT ya tiene un Pedido de
    # Venta vinculado, convertir_cotizacion_a_venta (mas abajo) ya sabe devolver ese
    # replay sin exigir nada mas. Exigir el marcador tambien aqui ANTES de chequear el
    # replay romperia esa reconfirmacion idempotente: se consume (vuelve a None) en la
    # conversion real y nunca se repone, asi que una segunda llamada legitima a este
    # mismo wrapper (p.ej. un doble click, o un reintento del frontend) encontraria
    # gate2_confirmed_at en None aunque la primera conversion haya sido perfectamente
    # valida. Mismo orden que usa convertir_cotizacion_a_venta internamente: primero
    # el replay, despues el gate real.
    # H46: solo un pedido vigente es un replay; uno CANCELADO no (la COT se convierte otra vez).
    ya_convertida = _pven_vigente_de_cotizacion(db, cot.id) is not None
    if not ya_convertida:
        # Mensaje legible para el caso comun (nunca confirmada por el cliente). La
        # marca de procedencia (gate2_confirmed_at) es el gate real -- ver
        # convertir_cotizacion_a_venta, que la vuelve a exigir por ser SU PROPIA ruta
        # registrada por separado (POST /cotizaciones/{id}/convertir-a-venta); gatear
        # solo este wrapper dejaria esa ruta completamente abierta.
        if cot.estado != "CONFIRMADA":
            raise HTTPException(400, f"La cotización debe estar Confirmada por el cliente antes de crear el Pedido de Venta (estado actual: {cot.estado}).")
        if cot.gate2_confirmed_at is None:
            raise HTTPException(400, "Esta cotización no tiene una confirmación de cliente válida y sin usar; no se puede crear el Pedido de Venta.")

    # N1: la verificacion del anticipo viaja tal cual a convertir_cotizacion_a_venta, que decide si hace falta.
    # Un body mal formado aqui seria un 500 (sin headers CORS: el navegador lo veria como "Failed to fetch").
    try:
        req = ConvertirCotizacionVentaRequest(
            idempotency_key=body.get("idempotency_key"),
            user_name=body.get("user_name"),
            direccion_entrega=body.get("direccion_entrega"),
            notas=body.get("notas"),
            verificacion_anticipo=body.get("verificacion_anticipo"),
        )
    except pydantic.ValidationError as exc:
        errores = exc.errors()
        if any(e.get("loc") and e["loc"][0] == "verificacion_anticipo" for e in errores):
            raise HTTPException(422, "La verificación del anticipo está incompleta: indica monto, método de pago y referencia.")
        campos = ", ".join(sorted({str(e["loc"][0]) for e in errores if e.get("loc")}))
        raise HTTPException(422, f"Datos no válidos para crear el pedido: {campos}.")
    res = convertir_cotizacion_a_venta(cot_id, req, user, db)
    # Return format compatible with legacy expectations (cot ya se consulto arriba;
    # solo se refresca para reflejar lo que convertir_cotizacion_a_venta commiteo).
    db.refresh(cot)
    ven = db.query(SaleOrder).filter(SaleOrder.id == res["sale_order_id"]).first()
    if res.get("sale_order_id"):
        try:
            mover_lead_de_solicitud(cot.sc_id if cot else None, "INVOICED", db)
            if cot:
                _sincronizar_estado_solicitud_desde_cotizacion(cot, db)
        except Exception as exc:
            db.rollback()
            logger.error(f"Error al sincronizar Solicitud/Lead tras confirmar cotizacion {cot_id}: {exc}", exc_info=True)
    return {
        "status": "success",
        "data": {
            "cotizacion": _cot_dict(cot) if cot else {},
            "pedido_venta": _ven_dict(ven) if ven else {},
            "idempotent_replay": res.get("idempotent_replay", False),
            "sale_order_id": res.get("sale_order_id")
        }
    }


@router.post("/cotizaciones/{cot_id}/actividad")
def add_cot_activity(cot_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).first()
    if not cot:
        raise HTTPException(404, "Cotizacion no encontrada")
    _log(db, "COT", cot.id, cot.numero,
         body.get("action", "NOTE_ADDED"),
         body.get("description"),
         user_name=body.get("user_name"))
    return {"status": "success"}


@router.post("/pedidos/{ven_id}/actividad")
def add_ven_activity(ven_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    v = db.query(SaleOrder).filter(SaleOrder.id == ven_id).first()
    if not v:
        raise HTTPException(404, "Pedido no encontrado")
    _log(db, "VEN", v.id, v.numero,
         body.get("action", "NOTE_ADDED"),
         body.get("description"),
         user_name=body.get("user_name"))
    return {"status": "success"}



@router.get("/pedidos")
def list_pedidos(
    estado: Optional[str] = None,
    cot_id: Optional[int] = None,
    canal_venta: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db)
):
    q = db.query(SaleOrder)
    if estado:
        q = q.filter(SaleOrder.estado == estado)
    if cot_id:
        q = q.filter(SaleOrder.cot_id == cot_id)
    if canal_venta:
        q = q.filter(SaleOrder.canal_venta == canal_venta)
    if search:
        like = f"%{search}%"
        q = q.filter(
            SaleOrder.numero.ilike(like) |
            SaleOrder.customer_name.ilike(like) |
            SaleOrder.sc_numero.ilike(like) |
            SaleOrder.cot_numero.ilike(like) |
            SaleOrder.pweb_numero.ilike(like) |
            productos_ilike(SaleOrder.productos, like)
        )
    total = q.count()
    items = q.order_by(SaleOrder.created_at.desc()).offset(offset).limit(limit).all()
    return {"status": "success", "total": total, "data": [_ven_dict(v) for v in items]}


@router.post("/pedidos", status_code=201)
def create_pedido(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    from sqlalchemy.exc import IntegrityError, SQLAlchemyError
    from fastapi import status as http_status
    # H42: montos en pesos enteros; el saldo se calcula con los ya redondeados para que cuadre sin centavos.
    subtotal_cop = _monto_en_pesos(body.get("subtotal_cop"), "subtotal_cop")
    total_cop = _monto_en_pesos(body.get("total_cop"), "total_cop")
    anticipo_cop = _monto_en_pesos(body.get("anticipo_cop"), "anticipo_cop")
    try:
        numero = _gen_numero(db, "PVEN-", "seq_ven")
    except Exception as exc:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"No se pudo generar el numero de pedido: {type(exc).__name__}",
        )
    saldo = total_cop - anticipo_cop
    ven = SaleOrder(
        numero=numero,
        sc_id=body.get("sc_id"),
        sc_numero=body.get("sc_numero"),
        cot_id=body.get("cot_id"),
        cot_numero=body.get("cot_numero"),
        customer_id=body.get("customer_id"),
        customer_name=body.get("customer_name"),
        customer_phone=body.get("customer_phone"),
        customer_email=body.get("customer_email"),
        customer_address=body.get("customer_address"),
        direccion_entrega=body.get("direccion_entrega"),
        trm_rate=body.get("trm_rate"),
        subtotal_cop=subtotal_cop,
        descuento_pct=body.get("descuento_pct", 0),
        total_cop=total_cop,
        anticipo_cop=anticipo_cop,
        saldo_cop=saldo,
        estado="PENDIENTE_COMPRA",
        notas=body.get("notas"),
        productos=body.get("productos", []),
        created_by=body.get("created_by"),
    )
    try:
        db.add(ven)
        db.commit()
        db.refresh(ven)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error de integridad al crear el pedido: {str(exc.orig) if hasattr(exc, 'orig') else str(exc)}",
        )
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error de base de datos al crear el pedido: {type(exc).__name__}",
        )
    _log(db, "VEN", ven.id, ven.numero, "CREATED",
         f"Pedido de Venta {ven.numero} creado",
         new_estado="PENDIENTE_COMPRA", user_name=body.get("created_by"))
    return {"status": "success", "data": _ven_dict(ven)}


@router.get("/pedidos/{ven_id}")
def get_pedido(ven_id: int, user: User = Depends(require_roles(*ALL_ERP_ROLES)),
        db: Session = Depends(get_db)):
    v = db.query(SaleOrder).filter(SaleOrder.id == ven_id).first()
    if not v:
        raise HTTPException(404, "Pedido de venta no encontrado")
    logs = db.query(ActivityLog).filter(
        ActivityLog.entity_type == "VEN",
        ActivityLog.entity_id == ven_id
    ).order_by(ActivityLog.created_at.asc()).all()
    d = _ven_dict(v)
    d["actividades"] = [_log_dict(l) for l in logs]
    pxps = db.query(PaymentPending).filter(PaymentPending.ven_id == ven_id).order_by(PaymentPending.id.asc()).all()
    d["pxps"] = [_pxp_dict(p) for p in pxps]
    d["lista_compras_items"] = _lista_compras_items_de(db, ven_id)
    # N1 / R4 / R6: el libro de pagos del pedido (verificados, trasladados...) y cuanto anticipo falta, con la
    # misma cuenta que recalculate_sale_order_state (anticipo_del_pedido).
    pagos = (db.query(SaleOrderPayment).filter(SaleOrderPayment.sale_order_id == ven_id)
             .order_by(SaleOrderPayment.created_at.asc(), SaleOrderPayment.id.asc()).all())
    d["pagos"] = [_pago_dict(p) for p in pagos]
    requerido, pendiente = anticipo_del_pedido(v)
    d["anticipo_requerido"] = float(requerido)
    d["anticipo_pendiente"] = float(pendiente)
    return {"status": "success", "data": d}


def _descontar_inventario_despacho(db: Session, v: SaleOrder, warehouse_id, user_label: Optional[str] = None) -> None:
    """Al despachar un PVEN (estado -> ENTREGADO), descuenta stock fisico real
    de las lineas de v.productos que tengan sku_id vinculado a catalogo (lineas
    de texto libre / es_libre no mueven inventario, no hay nada que descontar).
    Se ejecuta antes del commit del caller: si falta stock de cualquier linea,
    la excepcion aborta la transaccion completa (ni el despacho ni el descuento
    parcial quedan guardados).

    Las unidades que las entregas de fase4 ya entregaron (quantity_delivered de las lineas del pedido, que ya
    descontaron su inventario) no se descuentan otra vez: un pedido Entregado parcialmente que se marca Entregado
    solo descuenta lo que faltaba, y nada si ya se entrego todo (entonces tampoco pide bodega)."""
    from app.models.fase1b import SaleOrderLineErp
    ya_entregado = {}
    for sku_entregado, cantidad in (db.query(SaleOrderLineErp.sku_id, func.sum(SaleOrderLineErp.quantity_delivered))
                                    .filter(SaleOrderLineErp.so_id == v.id, SaleOrderLineErp.sku_id.isnot(None))
                                    .group_by(SaleOrderLineErp.sku_id).all()):
        ya_entregado[int(sku_entregado)] = Decimal(str(cantidad or 0))
    lineas = []  # (sku_id, cantidad que falta descontar)
    for p in (v.productos or []):
        if not (isinstance(p, dict) and p.get("sku_id")):
            continue
        sku_id = int(p["sku_id"])
        qty = Decimal(str(p.get("qty") or p.get("quantity") or 1))
        entregado = min(qty, ya_entregado.get(sku_id, Decimal("0")))
        ya_entregado[sku_id] = ya_entregado.get(sku_id, Decimal("0")) - entregado
        if qty - entregado > 0:
            lineas.append((sku_id, qty - entregado))
    if not lineas:
        return
    if not warehouse_id:
        raise HTTPException(422, "Debes indicar la bodega de despacho para descontar el inventario de este pedido")
    warehouse_id = int(warehouse_id)
    now = datetime.datetime.utcnow()
    owner = "NEBULAE"

    inv_op = InventoryOperation(
        source_warehouse_id=warehouse_id,
        operation_type="DELIVERY",
        status="DONE",
        source_document_type="PVEN",
        source_document_id=v.id,
        source_document_numero=v.numero,
    )
    db.add(inv_op)
    db.flush()

    for sku_id, qty in lineas:
        level = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == warehouse_id)
            .with_for_update()
        ).scalar_one_or_none()
        current = Decimal(str(level.quantity)) if level and level.quantity is not None else Decimal("0.00")
        if current < qty:
            raise HTTPException(
                409,
                f"Stock insuficiente para despachar el SKU {sku_id} (disponible: {current}, requerido: {qty})",
            )
        level.quantity = current - qty

        ob = db.execute(
            select(InventoryOwnerBalance)
            .where(
                InventoryOwnerBalance.sku_id == sku_id,
                InventoryOwnerBalance.warehouse_id == warehouse_id,
                InventoryOwnerBalance.owner == owner,
            )
            .with_for_update()
        ).scalar_one_or_none()
        if ob:
            ob.quantity = Decimal(str(ob.quantity)) - qty
            ob.updated_at = now

        mv_key = hashlib.sha256(f"{inv_op.id}:{sku_id}:OUT:{owner}:{warehouse_id}".encode()).hexdigest()
        db.add(InventoryMovement(
            operation_id=inv_op.id, sku_id=sku_id, quantity=qty, direction="OUT",
            owner=owner, warehouse_id=warehouse_id, idempotency_key=mv_key,
            created_at=now, created_by=user_label,
        ))


def _validar_transicion_pedido(v: SaleOrder, nuevo) -> None:
    """N2: el estado de un Pedido de Venta por PATCH sigue estados_pedido (el backend es la autoridad). Reenviar el
    mismo estado no hace nada; un estado que no se puede poner por PATCH, o una transicion no permitida -> 422."""
    if not nuevo or nuevo == v.estado:
        return
    if not isinstance(nuevo, str) or nuevo not in ESTADOS_VEN_DESTINOS:
        raise HTTPException(422, f"«{_nombre_de_estado('VEN', nuevo)}» no es un estado válido para un Pedido de "
                                 f"Venta.")
    permitidos = destinos_ven_permitidos(v.estado)  # un estado heredado desconocido se trata como operativo
    if nuevo in permitidos:
        return
    if v.estado == "CANCELADO":
        raise HTTPException(422, f"El pedido {v.numero} está cancelado y no se puede reabrir. Si el cliente sigue "
                                 f"interesado, ajusta la cotización y crea un pedido nuevo.")
    if v.estado == "FACTURADO":
        raise HTTPException(422, f"El pedido {v.numero} ya está facturado; su estado no se puede cambiar.")
    if not permitidos:
        raise HTTPException(422, f"El pedido {v.numero} está {_nombre_de_estado('VEN', v.estado).lower()}; su "
                                 f"estado no se puede cambiar.")
    if nuevo == "FACTURADO":
        raise HTTPException(422, "Solo un pedido entregado se puede marcar como Facturado.")
    destinos = " o ".join(sorted(_nombre_de_estado("VEN", e) for e in permitidos))
    raise HTTPException(422, f"Un pedido {_nombre_de_estado('VEN', v.estado).lower()} solo puede pasar a {destinos}.")


@router.patch("/pedidos/{ven_id}")
def update_pedido(ven_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    # Bloqueado: la transicion (N2) se valida sobre la fila que se va a escribir (una recepcion, un pago o una
    # cancelacion de fase4 concurrentes esperan).
    v = db.query(SaleOrder).filter(SaleOrder.id == ven_id).with_for_update().first()
    if not v:
        raise HTTPException(404, "Pedido de venta no encontrado")
    old_estado = v.estado
    fecha_vieja = v.fecha_entrega_estimada if "fecha_entrega_estimada" in body else None
    antes_log = cambios_documento.tomar_foto(v, "VEN")
    _validar_transicion_pedido(v, body.get("estado"))
    cancela = body.get("estado") == "CANCELADO" and old_estado != "CANCELADO"
    if cancela:
        # N2/H46 (R12: 422 en todas las rutas): cancelar exige el motivo.
        razon = str(body.get("cancellation_reason") or "").strip()
        if len(razon) < 5:
            raise HTTPException(422, "Indica el motivo de la cancelación (mínimo 5 caracteres).")
        body["cancellation_reason"] = razon
        if not body.get("cancelled_at"):
            body["cancelled_at"] = datetime.datetime.utcnow()
        if not body.get("cancellation_authorized_by"):
            body["cancellation_authorized_by"] = getattr(user, "email", None)
    allowed = ["estado","notas","productos","pec_id","pec_numero","pxp_id","pxp_numero",
               "fecha_entrega_estimada","direccion_entrega","customer_id","customer_name",
               "customer_phone","customer_email","customer_address","trm_rate",
               "subtotal_cop","descuento_pct","total_cop","anticipo_cop","saldo_cop",
               "cancellation_reason","cancellation_authorized_by","cancelled_at"]
    # R11 (H42): la re-cotizacion propaga total, subtotal y saldo (y el anticipo) con decimales al PVEN:
    # el servidor los deja en pesos enteros.
    _redondear_montos_del_body(body, ("subtotal_cop", "total_cop", "saldo_cop", "anticipo_cop"))
    for k in allowed:
        if k in body:
            setattr(v, k, body[k])
    autor = body.get("updated_by") or getattr(user, "email", None)
    ya_despachado = False
    if body.get("estado") == "ENTREGADO" and old_estado != "ENTREGADO":
        # N2: si este pedido ya desconto su inventario (un despacho anterior y despues lo 'revivieron'), marcarlo
        # Entregado otra vez no descuenta de nuevo (antes: 500 por uq_inv_op_source_doc, o 422 pidiendo la bodega).
        ya_despachado = db.query(InventoryOperation.id).filter(
            InventoryOperation.source_document_type == "PVEN",
            InventoryOperation.source_document_id == v.id).first() is not None
        if not ya_despachado:
            _descontar_inventario_despacho(db, v, body.get("warehouse_id"), getattr(user, "email", None))
    if cancela:
        # H45 (R12): la orden de pago pendiente se cancela en el mismo commit que el pedido y el pedido deja de
        # apuntar a ella. Va ANTES del commit; la cotizacion se reabre despues (tiene su propio commit/rollback).
        anular_pxps_de_pedido(db, v, autor, body.get("cancellation_reason"))
    v.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(v)
    _registrar_cambios(db, "VEN", v, antes_log, body, user)
    if body.get("estado") and body["estado"] != old_estado:
        _log(db, "VEN", v.id, v.numero, "ESTADO_CHANGED",
             ("Estado cambiado a ENTREGADO (el inventario ya se había descontado en un despacho anterior; no se "
              "descuenta otra vez)") if ya_despachado else f"Estado cambiado a {v.estado}",
             old_estado=old_estado, new_estado=v.estado, user_name=autor)
    if cancela:
        # H46+U25: la cotizacion del pedido vuelve a Borrador para reusarla (no hace fallar la cancelacion).
        _reabrir_cotizacion_por_pven_cancelado(db, v, autor)
    if fecha_vieja is not None and v.fecha_entrega_estimada and v.fecha_entrega_estimada.date() != fecha_vieja.date():
        # Final whole-branch review (hallazgo #2) -- ver el comentario equivalente en
        # update_solicitud para la explicacion completa.
        diff_dias = (v.fecha_entrega_estimada.date() - fecha_vieja.date()).days
        signo = "+" if diff_dias >= 0 else ""
        _log(db, "VEN", v.id, v.numero, "FECHA_ENTREGA_MODIFICADA",
             f"Fecha de entrega modificada: {fecha_vieja.strftime('%d/%m/%Y')} -> "
             f"{v.fecha_entrega_estimada.strftime('%d/%m/%Y')} ({signo}{diff_dias} día{'s' if abs(diff_dias)!=1 else ''})",
             user_name=body.get("updated_by"))
    return {"status": "success", "data": _ven_dict(v)}


@router.post("/pedidos/{ven_id}/crear-pxp")
def crear_pxp(ven_id: int, body: dict = Body(default_factory=dict),
        user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_FINANZAS, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """H44+N6: la orden de pago sale de los montos del propio pedido (el body no manda: solo se lee `notas`).

    pendiente = saldo del pedido; ya pagado = total - saldo; todo en pesos enteros. No se crea en un pedido
    cancelado, sin saldo pendiente o con otra PXP que no este cancelada. El pedido se bloquea (FOR UPDATE): dos
    clics simultaneos no crean dos PXP. La PXP, el vinculo del pedido y la Actividad van en un solo commit."""
    v = db.query(SaleOrder).filter(SaleOrder.id == ven_id).with_for_update().first()
    if not v:
        raise HTTPException(404, "Pedido de venta no encontrado")
    if v.estado == "CANCELADO":
        raise HTTPException(409, "No se puede crear una orden de pago para un pedido cancelado.")
    activa = (db.query(PaymentPending)
              .filter(PaymentPending.ven_id == v.id, PaymentPending.estado != "CANCELADA")
              .order_by(PaymentPending.id.asc()).first())
    if activa:
        raise HTTPException(409, f"El pedido ya tiene la orden de pago {activa.numero}.")

    total = redondear_peso(v.total_cop)
    pendiente = redondear_peso(v.saldo_cop)
    if pendiente <= 0:
        raise HTTPException(409, "El pedido no tiene saldo pendiente; no hace falta una orden de pago.")
    if pendiente > total:
        raise HTTPException(409, "Los montos del pedido no cuadran: el saldo es mayor que el total.")
    pagado = total - pendiente
    autor = getattr(user, "email", None)

    pxp = PaymentPending(
        numero=_gen_numero(db, "PXP-", "seq_pxp"),
        ven_id=v.id,
        ven_numero=v.numero,
        customer_id=v.customer_id,
        customer_name=v.customer_name,
        monto_total=total,
        monto_anticipo=pagado,
        monto_pendiente=pendiente,
        estado="PENDIENTE",
        notas=body.get("notas"),
    )
    db.add(pxp)
    db.flush()
    v.pxp_id = pxp.id
    v.pxp_numero = pxp.numero
    v.updated_at = datetime.datetime.utcnow()
    _log(db, "VEN", v.id, v.numero, "PXP_CREATED",
         f"Orden de pago {pxp.numero} creada. Pendiente: {pesos(pendiente)}",
         user_name=autor, commit=False)
    _log(db, "PXP", pxp.id, pxp.numero, "CREATED",
         f"Orden de pago creada para el pedido {v.numero}",
         new_estado="PENDIENTE", user_name=autor, commit=False)
    db.commit()
    db.refresh(pxp)
    return {"status": "success", "data": _pxp_dict(pxp)}


# ─── PXP ─────────────────────────────────────────────────────────────────────

@router.get("/pxp")
def list_pxp(
    estado: Optional[str] = None,
    limit: int = Query(50, le=200),
    offset: int = 0,
    
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db)
):
    q = db.query(PaymentPending)
    if estado:
        q = q.filter(PaymentPending.estado == estado)
    total = q.count()
    items = q.order_by(PaymentPending.created_at.desc()).offset(offset).limit(limit).all()
    return {"status": "success", "total": total, "data": [_pxp_dict(p) for p in items]}


@router.patch("/pxp/{pxp_id}")
def update_pxp(pxp_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_FINANZAS)),
        db: Session = Depends(get_db)):
    p = db.query(PaymentPending).filter(PaymentPending.id == pxp_id).first()
    if not p:
        raise HTTPException(404, "PXP no encontrada")
    old_estado = p.estado
    for k in ["estado","notas","fecha_pago","monto_anticipo","monto_pendiente"]:
        if k in body:
            setattr(p, k, body[k])
    p.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(p)
    if body.get("estado") and body["estado"] != old_estado:
        _log(db, "PXP", p.id, p.numero, "ESTADO_CHANGED",
             f"Pago {p.numero} cambiado a {p.estado}",
             old_estado=old_estado, new_estado=p.estado,
             user_name=body.get("updated_by"))
    return {"status": "success", "data": _pxp_dict(p)}


# ─── DASHBOARD STATS ─────────────────────────────────────────────────────────

@router.get("/stats")
def ventas_stats(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_COMPRAS, *ROLE_FINANZAS)),
        db: Session = Depends(get_db)):
    sc_total = db.query(func.count(CustomerRequest.id)).scalar()
    cot_total = db.query(func.count(SalesQuotation.id)).scalar()
    ven_total = db.query(func.count(SaleOrder.id)).scalar()
    pxp_pendiente = db.query(func.count(PaymentPending.id)).filter(
        PaymentPending.estado == "PENDIENTE").scalar()
    ven_monto = db.query(func.sum(SaleOrder.total_cop)).filter(
        SaleOrder.estado != "CANCELADO").scalar() or 0

    sc_por_estado = db.execute(text(
        "SELECT estado, COUNT(*) as cnt FROM customer_requests GROUP BY estado"
    )).fetchall()
    cot_por_estado = db.execute(text(
        "SELECT estado, COUNT(*) as cnt FROM sales_quotations GROUP BY estado"
    )).fetchall()

    return {
        "status": "success",
        "data": {
            "sc_total": sc_total,
            "cot_total": cot_total,
            "ven_total": ven_total,
            "pxp_pendiente": pxp_pendiente,
            "ven_monto_total": float(ven_monto),
            "sc_por_estado": {r[0]: r[1] for r in sc_por_estado},
            "cot_por_estado": {r[0]: r[1] for r in cot_por_estado},
        }
    }


# ─── ANALYTICS ───────────────────────────────────────────────────────────────

@router.get("/analytics")
def ventas_analytics(
    range: Optional[str] = "30d",
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    product: Optional[str] = None,
    top_n: int = Query(10, le=50),
    
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db)
):
    now = datetime.datetime.utcnow()
    # Determine date range
    if date_from and date_to:
        d_from = datetime.datetime.fromisoformat(date_from)
        d_to   = datetime.datetime.fromisoformat(date_to) + datetime.timedelta(days=1)
    else:
        days_map = {"7d": 7, "30d": 30, "90d": 90, "180d": 180, "1y": 365}
        days = days_map.get(range, 30)
        d_from = now - datetime.timedelta(days=days)
        d_to   = now + datetime.timedelta(days=1)

    # Base VEN query in range (not cancelled)
    ven_q = db.query(SaleOrder).filter(
        SaleOrder.created_at >= d_from,
        SaleOrder.created_at <= d_to,
        SaleOrder.estado != "CANCELADO"
    )
    if product:
        ven_q = ven_q.filter(SaleOrder.productos.cast(text("text")).ilike(f"%{product}%"))

    vens = ven_q.all()

    # Revenue by day
    revenue_by_day: dict = {}
    for v in vens:
        day = v.created_at.strftime("%Y-%m-%d") if v.created_at else "unknown"
        revenue_by_day[day] = revenue_by_day.get(day, 0) + float(v.total_cop or 0)

    # Top clients by revenue
    client_rev: dict = {}
    for v in vens:
        name = v.customer_name or "Sin nombre"
        client_rev[name] = client_rev.get(name, 0) + float(v.total_cop or 0)
    top_clients = sorted(client_rev.items(), key=lambda x: x[1], reverse=True)[:top_n]

    # Clients above thresholds
    clients_500k  = [(k, v) for k, v in client_rev.items() if v >= 500000]
    clients_1m    = [(k, v) for k, v in client_rev.items() if v >= 1000000]

    # Total revenue and count
    total_revenue = sum(float(v.total_cop or 0) for v in vens)
    total_count   = len(vens)
    avg_ticket    = total_revenue / total_count if total_count > 0 else 0

    # SC and COT in range
    sc_range = db.query(func.count(CustomerRequest.id)).filter(
        CustomerRequest.created_at >= d_from, CustomerRequest.created_at <= d_to
    ).scalar()
    cot_range = db.query(func.count(SalesQuotation.id)).filter(
        SalesQuotation.created_at >= d_from, SalesQuotation.created_at <= d_to
    ).scalar()

    # Conversion rates
    conv_sc_cot = round(cot_range / sc_range * 100, 1) if sc_range > 0 else 0
    conv_cot_ven = round(total_count / cot_range * 100, 1) if cot_range > 0 else 0

    # Status breakdown for VEN
    ven_por_estado: dict = {}
    for v in vens:
        ven_por_estado[v.estado] = ven_por_estado.get(v.estado, 0) + 1

    return {
        "status": "success",
        "data": {
            "range": range,
            "date_from": d_from.isoformat(),
            "date_to": d_to.isoformat(),
            "total_revenue": total_revenue,
            "total_count": total_count,
            "avg_ticket": avg_ticket,
            "sc_count": sc_range,
            "cot_count": cot_range,
            "conv_sc_cot_pct": conv_sc_cot,
            "conv_cot_ven_pct": conv_cot_ven,
            "revenue_by_day": [{"date": k, "total": v} for k, v in sorted(revenue_by_day.items())],
            "top_clients": [{"name": k, "total": v} for k, v in top_clients],
            "clients_above_500k": len(clients_500k),
            "clients_above_1m": len(clients_1m),
            "ven_por_estado": ven_por_estado,
        }
    }


# ─── ALERTAS (SC/COT sin cambio en N dias) ───────────────────────────────────

def _get_alert_days(db: Session, key: str = "alerta_sc_dias") -> int:
    try:
        r = db.execute(text("SELECT value FROM admin_config WHERE key = :key"), {"key": key}).fetchone()
        return int(r[0]) if r else 2
    except Exception:
        return 2


def _get_alert_hours_soporte(db: Session, urgencia: str) -> int:
    key_map = {"Alta": "alerta_soporte_alta_horas", "Media": "alerta_soporte_media_horas", "Baja": "alerta_soporte_baja_horas"}
    default_map = {"Alta": 4, "Media": 24, "Baja": 48}
    key = key_map.get(urgencia, "alerta_soporte_baja_horas")
    try:
        r = db.execute(text("SELECT value FROM admin_config WHERE key = :key"), {"key": key}).fetchone()
        return int(r[0]) if r else default_map.get(urgencia, 48)
    except Exception:
        return default_map.get(urgencia, 48)


@router.get("/alertas/resumen")
def alertas_resumen(user: User = Depends(require_roles(*ALL_ERP_ROLES)), db: Session = Depends(get_db)):
    """Endpoint that returns a count of late documents (SC, COT, VEN) for global alert badge.

    Uses configurable thresholds:
    - alerta_sc_dias: days threshold for CustomerRequest (SC)
    - alerta_cot_dias: days threshold for SalesQuotation (COT)
    - alerta_ven_dias: days threshold for SaleOrder (VEN)

    Each defaults to 2 days if not configured in admin_config.
    """
    sc_dias = _get_alert_days(db, "alerta_sc_dias")
    cot_dias = _get_alert_days(db, "alerta_cot_dias")
    ven_dias = _get_alert_days(db, "alerta_ven_dias")

    ahora = datetime.datetime.utcnow()
    no_resolucion = [
        "BORRADOR", "PENDIENTE_CONFIRMACION", "ASIGNADA", "ENVIADA",
        "PENDIENTE_COMPRA", "PENDIENTE_PAGO", "EN_PROCESO", "EN_TRANSITO"
    ]

    sc_atrasadas = db.query(CustomerRequest).filter(
        CustomerRequest.estado.in_(no_resolucion),
        CustomerRequest.updated_at < ahora - datetime.timedelta(days=sc_dias),
    ).count()

    cot_atrasadas = db.query(SalesQuotation).filter(
        SalesQuotation.estado.in_(no_resolucion),
        SalesQuotation.updated_at < ahora - datetime.timedelta(days=cot_dias),
    ).count()

    ven_atrasados = db.query(SaleOrder).filter(
        SaleOrder.estado.in_(no_resolucion),
        SaleOrder.updated_at < ahora - datetime.timedelta(days=ven_dias),
    ).count()

    # Final whole-branch review (hallazgo #4): no_resolucion trata CONFIRMADA como
    # "resuelto" para SC y COT -- pero una SC CONFIRMADA con gate1_confirmed_at todavia
    # puesto (el cliente dijo que si, el asesor todavia no le da clic a "Crear
    # Cotizacion") y una COT CONFIRMADA con gate2_confirmed_at todavia puesto y SIN
    # Pedido de Venta vinculado todavia (el cliente dijo que si, el asesor todavia no
    # convierte a PVEN) son exactamente los documentos que mas urgentemente necesitan
    # atencion -- el cliente ya actuo, falta que el negocio actue. El badge no los veia
    # en absoluto. Mismo criterio de umbral (dias sin actividad) que las demas cuentas
    # de esta funcion, no un conteo inmediato/incondicional -- si no, el badge se
    # dispararia el instante mismo en que el cliente confirma, lo que seria ruido, no
    # una alerta de "lleva tiempo sin atenderse".
    sc_confirmadas_sin_accion = db.query(CustomerRequest).filter(
        CustomerRequest.estado == "CONFIRMADA",
        CustomerRequest.gate1_confirmed_at.isnot(None),
        CustomerRequest.updated_at < ahora - datetime.timedelta(days=sc_dias),
        # Re-review del fix final: sin este exists(), una SC que ya tiene una Cotizacion
        # vinculada (p.ej. reenviada y re-confirmada por error, marca que nunca se puede
        # consumir porque canConfirmarSC ya es False) quedaba contada para siempre --
        # misma guarda que ya usa cot_confirmadas_sin_accion para su propio PVEN. N7: una
        # COT RECHAZADA no cuenta (la SC sigue activa y lista para otra cotizacion).
        ~db.query(SalesQuotation).filter(SalesQuotation.sc_id == CustomerRequest.id,
                                         SalesQuotation.estado != "RECHAZADA").exists(),
    ).count()

    cot_confirmadas_sin_accion = db.query(SalesQuotation).filter(
        SalesQuotation.estado == "CONFIRMADA",
        SalesQuotation.gate2_confirmed_at.isnot(None),
        SalesQuotation.updated_at < ahora - datetime.timedelta(days=cot_dias),
        # H46: un pedido CANCELADO no cuenta como "el asesor ya actuo".
        ~db.query(SaleOrder).filter(SaleOrder.cot_id == SalesQuotation.id, SaleOrder.estado != "CANCELADO").exists(),
    ).count()

    return {
        "status": "success",
        "data": {
            "atrasados": sc_atrasadas + cot_atrasadas + ven_atrasados
                         + sc_confirmadas_sin_accion + cot_confirmadas_sin_accion
        }
    }


@router.get("/alertas")
def get_alertas(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    dias = _get_alert_days(db)
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=dias)

    # SC activos sin cambio de estado en N dias (excluye Soporte Tecnico, que tiene su propio umbral)
    sc_alertas = db.query(CustomerRequest).filter(
        CustomerRequest.updated_at <= cutoff,
        CustomerRequest.estado.notin_(["CONFIRMADA", "CANCELADA"]),
        CustomerRequest.tipo_solicitud != "Soporte Tecnico",
    ).all()

    # COT activas sin cambio de estado en N dias
    cot_alertas = db.query(SalesQuotation).filter(
        SalesQuotation.updated_at <= cutoff,
        SalesQuotation.estado.notin_(["CONFIRMADA", "RECHAZADA"])
    ).all()

    # Soporte Tecnico: umbral propio por urgencia, solo tickets abiertos/en proceso
    soporte_abiertos = db.query(CustomerRequest).filter(
        CustomerRequest.tipo_solicitud == "Soporte Tecnico",
        CustomerRequest.estado_soporte.in_(["ABIERTO", "EN_PROCESO"]),
    ).all()
    soporte_alertas = []
    for sc in soporte_abiertos:
        horas = _get_alert_hours_soporte(db, sc.urgencia)
        if sc.updated_at <= datetime.datetime.utcnow() - datetime.timedelta(hours=horas):
            soporte_alertas.append(sc)

    return {
        "status": "success",
        "data": {
            "alerta_dias": dias,
            "sc_sin_atender": [_sc_dict(sc) for sc in sc_alertas],
            "cot_sin_atender": [_cot_dict(c) for c in cot_alertas],
            "sc_count": len(sc_alertas),
            "cot_count": len(cot_alertas),
            "soporte_sin_atender": [_sc_dict(sc) for sc in soporte_alertas],
            "soporte_count": len(soporte_alertas),
        }
    }


# ─── ADMIN CONFIG ─────────────────────────────────────────────────────────────

@router.get("/config")
def get_config(user: User = Depends(require_roles(*ROLE_ADMIN)),
        db: Session = Depends(get_db)):
    try:
        rows = db.execute(text("SELECT key, value, description FROM admin_config")).fetchall()
        return {"status": "success", "data": {r[0]: {"value": r[1], "description": r[2]} for r in rows}}
    except Exception:
        return {"status": "success", "data": {}}


@router.patch("/config")
def update_config(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN)),
        db: Session = Depends(get_db)):
    for k, v in body.items():
        db.execute(
            text(
                "INSERT INTO admin_config (key, value, updated_at) VALUES (:k, :v, NOW()) "
                "ON CONFLICT (key) DO UPDATE SET value = :v, updated_at = NOW()"
            ),
            {"k": k, "v": str(v)},
        )
    db.commit()
    return {"status": "success"}


# ─── IA ANÁLISIS DE SOLICITUD ────────────────────────────────────────────────

@router.post("/solicitudes/{sc_id}/ia-analisis")
def ia_analisis_solicitud(sc_id: int, body: dict = {}, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Genera análisis IA contextual de una SC: trazabilidad o condiciones de devolución."""
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "SC no encontrada")

    tipo = sc.tipo_solicitud or "Cotizacion de Producto"
    productos = sc.productos or []
    actividades = db.execute(text("""
        SELECT action, description, user_name, created_at, old_estado, new_estado
        FROM activity_logs WHERE entity_type='SC' AND entity_id=:id ORDER BY created_at ASC
    """), {"id": sc_id}).mappings().all()

    # Build context
    estados_historia = [dict(a) for a in actividades if a["action"] in ("ESTADO_CHANGED","CREATED","CONFIRMED","CANCELLED")]
    notas_historia = [dict(a) for a in actividades if a["action"] in ("NOTE_ADDED","CHATTER","UPDATED")]

    dias_desde_creacion = (datetime.datetime.utcnow() - sc.created_at).days if sc.created_at else 0

    if tipo in ("Seguimiento", "Programar Entrega"):
        # Trazabilidad
        ultimo_estado = estados_historia[-1] if estados_historia else None
        prox_accion = "Confirmar despacho" if sc.estado == "CONFIRMADA" else "Seguimiento con asesor"
        resumen = f"""📦 ANÁLISIS DE TRAZABILIDAD — {sc.numero}

Estado actual: {sc.estado}
Días desde creación: {dias_desde_creacion} días
Asesor responsable: {sc.advisor_name or 'No asignado'}
Cliente: {sc.customer_name or 'N/D'}

📋 Historia de Estados:
{chr(10).join([f"  → {e.get('old_estado','?')} → {e.get('new_estado','?')} ({str(e.get('created_at',''))[:10]})" for e in estados_historia]) or '  Sin cambios de estado registrados'}

🛒 Productos en la solicitud:
{chr(10).join([f"  • {p.get('nombre',p.get('name','Producto'))} x{p.get('cantidad',p.get('qty',1))}" for p in productos[:5]]) or '  Sin productos registrados'}

🔎 Próxima acción sugerida: {prox_accion}

💬 Notas recientes:
{chr(10).join([f"  [{str(n.get('created_at',''))[:10]}] {n.get('user_name','?')}: {n.get('description','')[:80]}" for n in notas_historia[-3:]]) or '  Sin notas'}"""

    elif tipo == "Devolucion de Producto":
        # Condiciones de devolución
        en_plazo = dias_desde_creacion <= 30
        estado_ok = sc.estado not in ("CANCELADA",)
        puede_devolver = en_plazo and estado_ok
        resumen = f"""🔄 ANÁLISIS DE DEVOLUCIÓN — {sc.numero}

Estado de la solicitud: {sc.estado}
Días desde creación: {dias_desde_creacion} días
{'✅ DENTRO del plazo de 30 días' if en_plazo else '❌ FUERA del plazo de 30 días (policy: máx 30 días)'}

📋 Condiciones de Devolución Nebulae:
  • Plazo máximo: 30 días desde la fecha de solicitud
  • Productos deben estar en condición original
  • Requiere número de SC original
  • Aplica para defectos de fábrica o error en pedido

🛒 Productos solicitados para devolución:
{chr(10).join([f"  • {p.get('nombre',p.get('name','Producto'))} x{p.get('cantidad',p.get('qty',1))}" for p in productos[:5]]) or '  Sin productos registrados'}

{'✅ DEVOLUCIÓN APROBADA: El cliente cumple las condiciones para proceder.' if puede_devolver else '⚠️ DEVOLUCIÓN NO APLICABLE: ' + ('Solicitud fuera del plazo de 30 días.' if not en_plazo else 'Solicitud cancelada.') }

🔎 Próxima acción: {'Coordinar recolección del producto con logística' if puede_devolver else 'Comunicar al cliente las condiciones de devolución y opciones alternativas'}"""

    else:
        # General
        resumen = f"""📊 ANÁLISIS DE SOLICITUD — {sc.numero}

Tipo: {tipo}
Estado: {sc.estado}
Cliente: {sc.customer_name or 'N/D'}
Asesor: {sc.advisor_name or 'No asignado'}
Días activo: {dias_desde_creacion} días
Modalidad: {sc.modalidad_pago or 'No especificada'}

📋 Historial de actividad: {len(list(actividades))} eventos registrados
🛒 Productos: {len(productos)} item(s)

Notas: {sc.notas or 'Sin notas adicionales'}"""

    return {"status": "success", "data": {
        "sc_id": sc_id,
        "numero": sc.numero,
        "tipo": tipo,
        "analisis": resumen,
        "estado_actual": sc.estado,
        "dias_desde_creacion": dias_desde_creacion,
        "puede_devolver": tipo == "Devolucion de Producto" and dias_desde_creacion <= 30,
    }}


# ─── CANCELAR SC CON RAZÓN ────────────────────────────────────────────────────

@router.post("/solicitudes/{sc_id}/cancelar")
def cancelar_solicitud(sc_id: int, body: CancelarSolicitudBody,
        user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Cancela una SC con razon obligatoria (min 5 chars) y marca eliminada_at para papelera 30 dias.
    
    Frontend sends 'razon' field; CancelarSolicitudBody maps it to 'motivo' via alias.
    """
    razon = body.motivo  # validated by Pydantic (min 5 chars, max 500)
    # N4: bloqueada, para no correr en paralelo con confirmar_solicitud (que crea la COT bajo el mismo lock).
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).with_for_update().first()
    if not sc:
        raise HTTPException(404, "SC no encontrada")
    if sc.tipo_solicitud == "Soporte Tecnico":
        # Soporte Tecnico no usa el flujo de cancelacion ligado a Cotizacion:
        # este endpoint marca eliminada_at (purga en 30 dias via papelera), lo
        # que perderia un ticket de soporte real. Su ciclo de vida se maneja
        # exclusivamente con estado_soporte (PATCH /solicitudes/{id}).
        raise HTTPException(400, "Soporte Tecnico no usa este flujo de cancelacion; cambia su estado_soporte en su lugar")
    # N4: no se cancela (ni se manda a la papelera) con una cotizacion o un pedido de venta activos.
    cots_activas, pvens_activos = _documentos_activos_de_solicitud(db, sc.id)
    if cots_activas or pvens_activos:
        raise HTTPException(409, _mensaje_documentos_activos(sc, cots_activas, pvens_activos))
    user_name = getattr(body, "user_name", None) or getattr(user, "username", None) or getattr(user, "email", "")
    ahora = datetime.datetime.utcnow()
    if sc.estado == "CANCELADA":
        # 'Enviar a la papelera' una SC que se cancelo con la pastilla vieja (sin motivo ni eliminada_at): no se
        # cancela otra vez (ni otro '[CANCELADA] Razón' en las notas, ni otro CANCELLED); solo se completa lo que falta.
        if sc.eliminada_at is None:
            sc.eliminada_at = ahora
        if not sc.razon_cancelacion:
            sc.razon_cancelacion = razon
        sc.updated_at = ahora
        db.commit()
        _log(db, "SC", sc_id, sc.numero, "SENT_TO_TRASH", "Solicitud enviada a la papelera", user_name=user_name)
    else:
        old_estado = sc.estado
        sc.estado = "CANCELADA"
        sc.razon_cancelacion = razon
        sc.eliminada_at = ahora
        sc.notas = f"{sc.notas or ''}\n[CANCELADA] Razón: {razon}".strip()
        sc.gate1_confirmed_at = None  # Round 6: cancelar invalida cualquier confirmacion previa sin consumir
        sc.updated_at = ahora
        db.commit()
        db.refresh(sc)
        _log(db, "SC", sc_id, sc.numero, "CANCELLED", f"Cancelada: {razon}", old_estado, "CANCELADA", user_name)
        # Gate 1: un link de confirmacion ya enviado no debe poder revivir una SC que
        # el asesor acaba de cancelar -- revoca cualquier token pendiente de esta SC.
        from app.core.confirmation_tokens import revoke_pending_tokens
        revoke_pending_tokens(db, "SC", sc_id)
    # N4: el cliente pasa a perdido en el CRM al cancelar la SC (ya no al rechazar una COT, N7).
    try:
        mover_lead_de_solicitud(sc.id, "CANCELLED", db)
    except Exception as exc:
        db.rollback()
        logger.error(f"Error al mover el lead de la solicitud cancelada {sc.numero}: {exc}", exc_info=True)
    return {"status": "success", "data": {"id": sc_id, "estado": "CANCELADA", "razon": sc.razon_cancelacion}}


# ─── PAPELERA (SCs canceladas, purga 30 días) ────────────────────────────────

# get_papelera moved above /solicitudes/{sc_id} to fix route shadowing


@router.delete("/solicitudes/{sc_id}/permanente")
def eliminar_permanente(sc_id: int, user: User = Depends(require_roles(*ROLE_ADMIN)),
        db: Session = Depends(get_db)):
    """Elimina permanentemente una SC de la papelera."""
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc or sc.estado != "CANCELADA":
        raise HTTPException(400, "Solo se pueden eliminar permanentemente SCs canceladas")
    db.delete(sc)
    db.commit()
    return {"status": "success", "data": {"deleted": sc_id}}


@router.post("/solicitudes/{sc_id}/restaurar")
def restaurar_solicitud(sc_id: int, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Restaura una SC de la papelera (estado CANCELADA) a BORRADOR -- o a ASIGNADA si
    todavia tiene un asesor puesto (ver Gate 1 mas abajo). Su lead sale de 'perdido'."""
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).with_for_update().first()
    if not sc:
        raise HTTPException(404, "SC no encontrada")
    # Solo una SC cancelada se restaura: en otro estado esto la reiniciaria (Gate 1) con lo que tenga vivo.
    if sc.estado != "CANCELADA":
        raise HTTPException(409, f"La solicitud {sc.numero} no está cancelada: no hay nada que restaurar.")
    # R10: restaurar reinicia el ciclo de Gate 1 igual que volver a Borrador; no con documentos activos colgando
    # (datos viejos: SC cancelada con la pastilla vieja sin revisar sus documentos).
    cots_activas, pvens_activos = _documentos_activos_de_solicitud(db, sc.id)
    if cots_activas or pvens_activos:
        raise HTTPException(409, _mensaje_documentos_activos(sc, cots_activas, pvens_activos, "restaurar"))
    old_estado = sc.estado
    sc.estado = "BORRADOR"
    try:
        db.execute(text("UPDATE customer_requests SET eliminada_at=NULL, estado='BORRADOR', updated_at=NOW() WHERE id=:id"), {"id": sc_id})
        db.commit()
    except Exception:
        db.rollback()
        sc.estado = "BORRADOR"
        db.commit()
    db.refresh(sc)
    # Gate 1 (Round 6): mismo invariante que update_solicitud/promueve_asignada -- una
    # SC nunca debe quedar en BORRADOR con un asesor ya asignado. Este endpoint no pasa
    # por update_solicitud (hace su propio UPDATE crudo arriba), asi que sin este check
    # una SC cancelada que todavia tuviera advisor_user_id (cancelar_solicitud no lo
    # limpia) aterrizaria en un BORRADOR-con-asesor del que nada la volveria a
    # promover -- exactamente el callejon sin salida que este Round cierra en todas
    # las rutas que pueden producirlo, no solo en el PATCH generico.
    estado_final = "BORRADOR"
    if sc.advisor_user_id is not None:
        sc.estado = "ASIGNADA"
        estado_final = "ASIGNADA"
    # Gate 1 (Round 7): mismo revoke+clear que cancelar_solicitud y update_solicitud ya
    # tienen -- defensa en profundidad para que una SC restaurada desde la papelera
    # nunca pueda cargar un token o una marca de confirmacion de un ciclo anterior
    # (cancelar_solicitud ya los limpia al cancelar, pero esto no depende de esa ruta
    # especifica para seguir siendo correcto).
    from app.core.confirmation_tokens import revoke_pending_tokens
    revoke_pending_tokens(db, "SC", sc_id)
    sc.gate1_confirmed_at = None
    db.commit()
    _log(db, "SC", sc_id, sc.numero, "RESTORED", f"Solicitud restaurada a {estado_final}", old_estado, estado_final, getattr(user, 'email', ''))
    # N4: cancelar la SC deja el lead perdido; restaurarla lo devuelve a la etapa con la que nace un lead nuevo.
    try:
        reabrir_lead_de_solicitud(sc.id, db)
    except Exception as exc:
        db.rollback()
        logger.error(f"Error al reabrir el lead de la solicitud restaurada {sc.numero}: {exc}", exc_info=True)
    return {"status": "success", "data": {"id": sc_id, "estado": estado_final}}


# ─── FORMATO CONFIRMACIÓN ────────────────────────────────────────────────────

@router.get("/solicitudes/{sc_id}/formato-confirmacion")
def get_formato_confirmacion(sc_id: int, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Retorna datos estructurados para el formato de confirmación al cliente."""
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "SC no encontrada")
    productos = sc.productos or []
    total = sum(float(p.get("precio_total", p.get("total", 0))) for p in productos)
    return {"status": "success", "data": {
        "numero": sc.numero,
        "cliente": sc.customer_name,
        "email": sc.customer_email,
        "telefono": sc.customer_phone,
        "asesor": sc.advisor_name,
        "tipo": sc.tipo_solicitud,
        "modalidad_pago": sc.modalidad_pago,
        "estado": sc.estado,
        "fecha": sc.fecha_solicitud.isoformat() if sc.fecha_solicitud else sc.created_at.isoformat() if sc.created_at else None,
        "fecha_vencimiento": sc.fecha_vencimiento.isoformat() if sc.fecha_vencimiento else None,
        "productos": productos,
        "total_cop": total,
        "notas": sc.notas,
        # Bundle trivial (final whole-branch review): este endpoint es anterior al
        # flujo real de Gate 1 (confirmacion_publica.py) y no mintea ningun token real
        # -- el campo "link_confirmacion" que tenia antes (f"/confirmar/{sc.numero}")
        # resuelve hoy a una pagina publica real que solo dice "enlace invalido",
        # porque nunca se creo un token que coincida con ese valor. Se quita en vez de
        # mintear uno nuevo aqui (este endpoint no es el lugar real donde se genera un
        # link -- eso es enviar_solicitud_para_confirmacion).
    }}
