"""
ERP Ventas API
Endpoints for: Solicitudes de Cliente (SC), Cotizaciones (COT),
Pedidos de Venta (VEN), Ordenes Pendientes por Pagar (PXP)
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import text, func, select, case, and_, or_
from sqlalchemy.exc import DataError, DBAPIError, IntegrityError, OperationalError
from typing import Optional, List
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import pydantic
from app.db.database import get_db
from app.models.erp_documents import (
    CustomerRequest, SalesQuotation, SaleOrder,
    PaymentPending, ActivityLog, PurchaseOrderFull
)
from app.models.fase4 import SaleOrderPayment
from app.models.customers import Customer
from app.models.sales import SalesOrder as LeadCRM  # el lead del CRM (tabla sales_orders), no el Pedido de Venta
from app.models.inventory import InventoryLevel, InventoryOperation, InventoryMovement
from app.models.fase1b import InventoryOwnerBalance, SaleOrderLineErp, ProcurementAllocation, PurchaseOrderLine
from app.api.dependencies import (
    require_roles, get_current_user,
    ROLE_ADMIN, ROLE_ASESOR, ROLE_COMPRAS, ROLE_FINANZAS, ALL_ERP_ROLES, normalize_role
)
from app.models.users import User
from app.core.busqueda import productos_ilike
from app.core import cambios_documento, clientes
from app.core.ventas_dinero import (
    redondear_peso, pesos, formato_pct, anticipo_cotizacion, pct_anticipo_cotizacion, anticipo_requerido,
    anticipo_del_pedido, saldos_a_favor_de_cotizacion, PCT_ANTICIPO_POR_DEFECTO, ORIGEN_CONSERVADO,
    anular_pxps_de_pedido, monto_linea, repartir_anticipo_por_linea,
)
from app.core.textos_actividad import etiqueta_estado, ETIQUETAS_ESTADO, PASOS_SC, nombre_de_usuario
from app.core.chatter import validar_nota, reinicia_atraso, puede_registrar, CONTACTO_SOLO_ASESOR
from app.core.estados_pedido import ESTADOS_VEN_DESTINOS, ESTADOS_VEN_SIN_DINERO, destinos_ven_permitidos
from app.api.v1.schemas_compras import CancelarSolicitudBody, CotizarSinConfirmacionBody
from app.api.v1.crm import mover_lead_de_solicitud, reabrir_lead_de_solicitud
import datetime
import hashlib
import logging
import re
import unicodedata
from app.core.fechas import ZONA_COLOMBIA

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

def _sc_id_del_body(valor) -> Optional[int]:
    """sc_id que llega en el body de POST y PATCH /cotizaciones: None si viene vacio; 422 si no es el numero de una
    solicitud. Un bool o un float no entero tampoco (Infinity, -Infinity o 1e400 llegan como float infinito y int()
    lanzaria OverflowError -> 500; True seria la SC 1)."""
    if isinstance(valor, bool) or (isinstance(valor, float) and not valor.is_integer()):
        raise HTTPException(422, "El campo sc_id debe ser el número de una solicitud.")
    try:
        return _int_or_none(valor)
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(422, "El campo sc_id debe ser el número de una solicitud.")

def _texto_o_none(v):
    """El texto sin espacios de los bordes, o None si no es texto o queda vacio (una nota en blanco no cuenta)."""
    if not isinstance(v, str):
        return None
    return v.strip() or None

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
                f"El producto '{nombre_prod}' no tiene precio definido. Ingresa un costo/precio antes de guardar la cotización.",
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

# activity_logs.user_name es String(150).
_USER_NAME_MAX = 150


def _log(db: Session, entity_type: str, entity_id: int, entity_numero: str,
         action: str, description: str = None, old_estado: str = None,
         new_estado: str = None, user_name: str = None, extra_data: dict = None,
         commit: bool = True, usuario: Optional[User] = None):
    """Agrega un renglon de Actividad y lo devuelve (U6+H22: _agregar_nota responde con el). commit=False lo deja en
    la sesion para que lo confirme el commit del llamador (una sola transaccion: choque H36/H29 en update_solicitud).
    S6 (T11), defensa general del autor: un user_name que no es texto (una lista, un objeto o un numero que llego en
    el body) se cambia por nombre_de_usuario(usuario) ('Sistema' sin usuario) y un texto mas largo que la columna se
    recorta a 150. Asi un updated_by malo ya no tumba la peticion con un 500 a mitad de camino. None sigue siendo
    «sin autor».
    T11 calidad (F4): antes de recortar se quitan los caracteres de control (Cc): con U+0000 psycopg2 lanzaba
    ValueError en el flush y, en los cambios de estado explicitos de la COT y del PVEN, el estado ya confirmado se
    quedaba sin su renglon (500). Si no queda nada, nombre_de_usuario(usuario) ('Sistema' sin usuario). Ronda 1:
    tambien los surrogates sueltos (Cs, p. ej. U+D800 llegado como escape JSON): psycopg2 lanzaba UnicodeEncodeError."""
    if user_name is not None:
        if not isinstance(user_name, str):
            user_name = nombre_de_usuario(usuario)
        sin_control = "".join(ch for ch in user_name if unicodedata.category(ch) not in ("Cc", "Cs"))
        if sin_control != user_name and not sin_control:
            sin_control = nombre_de_usuario(usuario)
        user_name = sin_control[:_USER_NAME_MAX]
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
    return log

# H27+H39: canales por los que el asesor entrega el enlace de confirmacion al cliente -> como se lee en la Actividad.
CANALES_ENVIO = {"WhatsApp": "por WhatsApp", "Email": "por correo", "Otro": "por otro canal"}

def _canal_de_envio(body: dict, customer_email: Optional[str]) -> Optional[str]:
    """Canal elegido para enviar la SC/COT al cliente, o None si el body no trae (el Hub no pregunta el canal en
    todas las rutas). Se valida ANTES de revocar o crear tokens: un canal malo no cambia nada. Elegir 'Email' exige
    que el cliente tenga correo; con WhatsApp u Otro el correo sale ademas como respaldo (_enviar_correo_confirmacion)."""
    canal = body.get("canal")
    if isinstance(canal, str):
        canal = canal if canal.strip() else None
    if canal is None:
        return None
    if not isinstance(canal, str) or canal not in CANALES_ENVIO:
        raise HTTPException(422, "Canal de envío no válido: usa WhatsApp, Email u Otro.")
    if canal == "Email" and not (customer_email or "").strip():
        raise HTTPException(400, "El cliente no tiene correo registrado: elige WhatsApp u Otro, o agrega su correo "
                                 "antes de enviar.")
    return canal

def _enviar_correo_confirmacion(destino: Optional[str], asunto: str, html: str) -> dict:
    """Intenta el correo con el enlace de confirmacion y dice que paso: {enviado, destino, motivo, mensaje}.

    motivo es None si salio; si no, SIN_CORREO_CLIENTE | CORREO_NO_CONFIGURADO | FALLO_ENVIO. Nunca lanza: el enlace ya
    quedo guardado y el asesor puede entregarlo por otro medio, asi que un fallo del correo solo se informa.
    app.core.email se usa por atributo (correo.smtp_configurado / correo.send_email) para poder parchearlo en pruebas."""
    from app.core import email as correo
    destino = (destino or "").strip()
    if not destino:
        return {"enviado": False, "destino": None, "motivo": "SIN_CORREO_CLIENTE",
                "mensaje": "No se envió correo: el cliente no tiene correo registrado."}
    if not correo.smtp_configurado():
        return {"enviado": False, "destino": destino, "motivo": "CORREO_NO_CONFIGURADO",
                "mensaje": "No se envió correo: el envío de correos no está configurado en el sistema."}
    try:
        salio = bool(correo.send_email(destino, asunto, html))
    except Exception:
        logger.exception("No se pudo enviar el correo de confirmación a %s", destino)
        salio = False
    if not salio:
        return {"enviado": False, "destino": destino, "motivo": "FALLO_ENVIO",
                "mensaje": f"No se pudo enviar el correo a {destino}: falló el servidor de correo."}
    return {"enviado": True, "destino": destino, "motivo": None, "mensaje": f"Correo enviado a {destino}."}

def _detalle_envio(canal: Optional[str], correo_res: dict) -> list:
    """Renglones 'etiqueta -> despues' de la Actividad del envio (canal elegido y resultado del correo). Sin clave
    'campo': CambiosDeActividad del frontend la usa para tachar el 'antes', y aqui no hay valor anterior."""
    cambios = []
    if canal:
        cambios.append({"etiqueta": "Canal de envío", "despues": canal})
    cambios.append({"etiqueta": "Correo" if canal == "Email" else "Correo de respaldo",
                    "despues": correo_res["mensaje"]})
    return cambios

def _extra_data_de_envio(canal: Optional[str], correo_res: dict) -> dict:
    """extra_data del renglon ESTADO_CHANGED de un envio al cliente (SC y COT comparten forma)."""
    return {"canal": canal,
            "correo": {k: correo_res[k] for k in ("enviado", "destino", "motivo")},
            "cambios": _detalle_envio(canal, correo_res)}

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
             extra_data={"cambios": cambios}, commit=commit, usuario=user)
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

def _describir_documentos(cots, pvens, con_articulo: bool = False) -> str:
    """'pedido de venta PVEN-…, cotización COT-…' (en plural si hay varios del mismo tipo). con_articulo=True da el texto
    corrido 'el pedido de venta PVEN-… y la cotización COT-…' (lo usa scripts/ajustar_estados_solicitud.py)."""
    partes = []
    if pvens:
        articulo = ("el " if len(pvens) == 1 else "los ") if con_articulo else ""
        partes.append(articulo + ("pedido de venta " if len(pvens) == 1 else "pedidos de venta ")
                      + ", ".join(p.numero for p in pvens))
    if cots:
        articulo = ("la " if len(cots) == 1 else "las ") if con_articulo else ""
        partes.append(articulo + ("cotización " if len(cots) == 1 else "cotizaciones ")
                      + ", ".join(c.numero for c in cots))
    return (" y " if con_articulo else ", ").join(partes)

def _mensaje_documentos_activos(sc: CustomerRequest, cots, pvens, accion: str = "cancelar") -> str:
    """409 de N4 (accion 'cancelar'), de R10 (accion 'reiniciar', U15/C5) y de restaurar: que documentos lo impiden y
    en que orden resolverlos (primero el pedido: al cancelarlo su cotizacion vuelve a Borrador y despues se rechaza)."""
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

def _referencias_de_solicitud(db: Session, sc_id: int) -> list:
    """Lo que hace de una SC historial en la Papelera (N4; U18, C1 b): sus cotizaciones (sales_quotations.sc_id), sus
    pedidos de venta (sale_orders.sc_id) y sus leads del CRM (sales_orders.canonical_customer_request_id), en
    cualquier estado: los mismos tres criterios de _SQL_SC_CON_DOCUMENTOS. Devuelve las partes ya redactadas, en ese
    orden y en plural si hay varios ('cotización COT-…', 'pedidos de venta PVEN-…, PVEN-…', 'lead del CRM'); lista
    vacia = no se conserva."""
    cots = [r.numero for r in db.query(SalesQuotation.numero).filter(SalesQuotation.sc_id == sc_id)
            .order_by(SalesQuotation.id.asc()).all()]
    pvens = [r.numero for r in db.query(SaleOrder.numero).filter(SaleOrder.sc_id == sc_id)
             .order_by(SaleOrder.id.asc()).all()]
    leads = db.query(LeadCRM.id).filter(LeadCRM.canonical_customer_request_id == sc_id).count()
    partes = []
    if cots:
        partes.append(("cotización " if len(cots) == 1 else "cotizaciones ") + ", ".join(cots))
    if pvens:
        partes.append(("pedido de venta " if len(pvens) == 1 else "pedidos de venta ") + ", ".join(pvens))
    if leads:
        partes.append("lead del CRM" if leads == 1 else "leads del CRM")
    return partes

def _mensaje_solicitud_con_historial(sc: CustomerRequest, referencias) -> str:
    """409 de 'Eliminar permanentemente' (N4, Papelera): la SC tiene documentos vinculados y se conserva como historial.
    referencias es la lista de _referencias_de_solicitud; vacia (el FK salto en el borrado) el mensaje no los nombra."""
    vinculados = f" ({', '.join(referencias)})" if referencias else ""
    return (f"No se puede eliminar definitivamente la solicitud {sc.numero}: tiene documentos vinculados{vinculados}. "
            f"Se conserva en la Papelera como historial.")

# Dias que una SC sin historial pasa en la Papelera antes de que la purga del administrador (purgar_papelera) la borre.
DIAS_EN_PAPELERA = 30

def _ahora_utc() -> datetime.datetime:
    """El reloj de la Papelera (B2.1 T1 r1): UTC sin zona, como eliminada_at. Lo usan los dias_restantes del GET y la
    purga del administrador, para que digan lo mismo; nunca NOW() de la base, cuya zona la app no fija. Tambien la marca
    nueva de la COT temprana al retomarla con un motivo nuevo (B2.1, D6)."""
    return datetime.datetime.utcnow()

def _fecha_de_purga(sc: CustomerRequest, referencias):
    """Desde cuando la purga puede borrar la SC (eliminada_at + 30 dias, UTC sin zona), o None si nunca la va a
    borrar: se conserva (tiene referencias) o no tiene eliminada_at (cancelada con la pastilla vieja: la purga exige
    eliminada_at)."""
    if referencias or sc.eliminada_at is None:
        return None
    return sc.eliminada_at + datetime.timedelta(days=DIAS_EN_PAPELERA)

def _texto_papelera(db: Session, sc: CustomerRequest, referencias=None) -> str:
    """Renglon 'Papelera' de la Actividad al cancelar (U18, C1): se conserva como historial (y por que) o la fecha, en
    hora de Colombia, desde la que se puede eliminar (B2.1 D2: la borra un administrador al vaciar la Papelera, no se
    borra sola ese dia). referencias evita repetir la consulta si el llamador ya la hizo."""
    if referencias is None:
        referencias = _referencias_de_solicitud(db, sc.id)
    if referencias:
        return f"Se conserva como historial (tiene {', '.join(referencias)})"
    purga = _fecha_de_purga(sc, referencias)
    if purga is None:
        return "No vence: no tiene fecha de envío a la Papelera"  # = TEXTO_PAPELERA_SIN_FECHA del frontend
    fecha = purga.replace(tzinfo=datetime.timezone.utc).astimezone(ZONA_COLOMBIA).strftime("%d/%m/%Y")
    return f"Se puede eliminar definitivamente desde el {fecha} si no se restaura."

def _cliente_de_la_solicitud(sc: CustomerRequest) -> tuple:
    """Quien confirma la SC por el enlace de Gate 1: su id, correo y telefono, normalizados (un formulario que reenvia
    lo mismo, con otro tipo, mayusculas o espacios, no es un cambio de cliente)."""
    def _texto(v):
        return str(v).strip() if v not in (None, "") else ""
    return _texto(sc.customer_id), _texto(sc.customer_email).lower(), _texto(sc.customer_phone)

def _exigir_estado_valido(body: dict) -> None:
    """S1 (T11): el 'estado' que llega en el PATCH de una SC, una COT o un PVEN tiene que ser un texto con algo. '' (o
    solo espacios), 0, false, null, una lista... -> 422 sin escribir nada. Antes las guardas lo tomaban como «sin
    cambio» (`if not nuevo`) pero el bucle de campos permitidos lo escribia igual: '' revivia una COT rechazada sin pasar
    por la puerta B, sacaba una SC de la Papelera sin /restaurar y reabria un PVEN cancelado. Sin la clave no hay cambio
    de estado. Se llama al principio de los tres PATCH: despues, el bucle solo escribe un estado que ya paso sus guardas."""
    if "estado" in body and not (isinstance(body["estado"], str) and body["estado"].strip()):
        raise HTTPException(422, "Estado no válido.")


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

def _iso_utc(dt):
    """created_at/updated_at/... se guardan en UTC sin zona (utcnow); con 'Z' el navegador las lee como UTC y las
    muestra en hora local (sin ella las lee como hora local y todo sale corrido 5 h en Colombia). NO es para las fechas
    de calendario o de negocio (fecha_solicitud, fecha_vencimiento, fecha_entrega_estimada, fecha_pago...)."""
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    if dt.tzinfo is not None:
        dt = dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return dt.isoformat() + "Z"

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
        "created_at": _iso_utc(p.created_at),
    }

def _confirmacion_vigente_sc(sc: CustomerRequest) -> bool:
    """U15: el cliente confirmo la solicitud por el enlace (Gate 1) y esa confirmacion sigue valiendo para sus
    productos actuales: solo asi confirmar_solicitud crea una cotizacion. Una SC CONFIRMADA por su cotizacion (sin la
    marca) o una heredada que conserva la marca no cuentan. Helper unico: lo reutilizan T3 y T5."""
    return sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is not None


def _sc_tiene_cot_activa(db: Session, sc_id: int) -> bool:
    """Gate 1 (B1-T4, N7): la SC tiene una cotizacion activa (cualquiera menos RECHAZADA). Una consulta: los llamadores
    la evaluan solo cuando hace falta (update_solicitud cuenta sus consultas, test_solicitud_guardado_una_transaccion)."""
    return db.query(SalesQuotation.id).filter(SalesQuotation.sc_id == sc_id,
                                              SalesQuotation.estado != "RECHAZADA").first() is not None


def _gate1_reinicia_estado(db: Session, sc: CustomerRequest, old_estado: str) -> bool:
    """Gate 1 (B1-T4; puerta A de la ronda 1 de T3): si cambian los productos o el cliente de una SC que no cambio de
    estado por otra via en la misma operacion, vuelve a empezar (Asignada o Nueva) cuando esperaba al cliente
    (PENDIENTE_CONFIRMACION, aunque tenga una COT creada sin confirmacion) o estaba CONFIRMADA sin COT activa. Predicado
    unico de update_solicitud y de PATCH /cliente. La consulta de la COT activa solo corre con old_estado CONFIRMADA."""
    return old_estado == "PENDIENTE_CONFIRMACION" or (old_estado == "CONFIRMADA"
                                                      and not _sc_tiene_cot_activa(db, sc.id))


def _estado_tras_reinicio(sc: CustomerRequest) -> str:
    """Estado al que vuelve la SC cuando Gate 1 se reinicia: ASIGNADA con asesor, BORRADOR (Nueva) sin el."""
    return "ASIGNADA" if sc.advisor_user_id else "BORRADOR"


# Gate 1: por que la confirmacion del cliente deja de valer. El estado va en «Estado cambiado a {etiqueta}: {motivo}»
# (renglon ESTADO_CHANGED) y el aviso es el renglon UPDATED cuando el estado no cambia (hay una cotizacion activa).
# update_solicitud usa los del Bloque 1 (las pruebas buscan 'cambió el cliente'); PATCH /solicitudes/{id}/cliente (H21,
# R18), que solo corrige el contacto del mismo cliente, los suyos.
_MOTIVO_PRODUCTOS = ("se modificaron los productos, así que la confirmación del cliente ya no es válida y hay que "
                     "reenviarle la solicitud")
_MOTIVO_CAMBIO_DE_CLIENTE = ("cambió el cliente de la solicitud, así que la confirmación del cliente anterior ya no es "
                             "válida y hay que enviarle la solicitud al cliente nuevo")
_AVISO_CAMBIO_DE_CLIENTE = ("Cambió el cliente de la solicitud: la confirmación del cliente anterior ya no vale y su "
                            "enlace quedó anulado. Para crear otra cotización, envíale la solicitud al cliente nuevo "
                            "para que la confirme.")
_MOTIVO_CAMBIO_DE_CONTACTO = ("cambió el correo o el teléfono del cliente, así que su confirmación ya no es válida y "
                              "hay que enviarle la solicitud de nuevo")
# Ronda 1 de T5 (punto 6): con la COT activa la SC ya estaba CONFIRMADA y no tenia un enlace vivo que anular.
_AVISO_CAMBIO_DE_CONTACTO = ("Cambió el correo o el teléfono del cliente: la confirmación de la solicitud ya no vale. "
                             "La cotización activa sigue igual; si necesitas otra cotización, envíale la solicitud de "
                             "nuevo para que la confirme.")


def _texto_estado_cambiado(etiqueta: str, motivo: str) -> str:
    return f"Estado cambiado a {etiqueta}: {motivo}"


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
        # Gate 1 de la SC (solo el booleano, nunca la fecha). OJO: la 'confirmacion_vigente' de _cot_dict es otra cosa
        # (gate2 de la cotizacion): el detalle de la SC lee esta, nunca la de solicitud.cotizaciones[i].
        "confirmacion_vigente": _confirmacion_vigente_sc(sc),
        "fecha_solicitud": sc.fecha_solicitud.isoformat() if sc.fecha_solicitud else None,
        "fecha_vencimiento": sc.fecha_vencimiento.isoformat() if sc.fecha_vencimiento else None,
        "fecha_entrega_estimada": sc.fecha_entrega_estimada.isoformat() if sc.fecha_entrega_estimada else None,
        "modalidad_entrega": sc.modalidad_entrega,
        "notas": sc.notas,
        "productos": sc.productos or [],
        "created_at": _iso_utc(sc.created_at),
        "updated_at": _iso_utc(sc.updated_at),
        "created_by": sc.created_by,
        "razon_cancelacion": getattr(sc, "razon_cancelacion", None),
        "eliminada_at": _iso_utc(getattr(sc, "eliminada_at", None)),
        "tipo_problema": sc.tipo_problema,
        "descripcion_problema": sc.descripcion_problema,
        "urgencia": sc.urgencia,
        "evidencia_descripcion": sc.evidencia_descripcion,
        "asignado_a_user_id": sc.asignado_a_user_id,
        "estado_soporte": sc.estado_soporte,
    }

def _ciudad_del_cliente(sc: CustomerRequest) -> Optional[str]:
    """H21: la ciudad no es columna de la SC; sale de su ficha (None sin ficha). Solo en el detalle, no en el listado."""
    return sc.customer.city if sc.customer is not None else None

# ─── H21: corregir los datos de contacto del cliente desde la SC ────────────────────────────────────────────────────

# Clave del body de PATCH /solicitudes/{id}/cliente -> (columna en SC/COT/VEN o None, columna en la ficha Customer).
_CONTACTO_CLIENTE = {
    "customer_phone": ("customer_phone", "phone"),
    "customer_email": ("customer_email", "email"),
    "customer_address": ("customer_address", "address"),
    "customer_city": (None, "city"),
}
_ETIQUETAS_CONTACTO = {"customer_phone": "Teléfono", "customer_email": "Correo", "customer_address": "Dirección",
                       "customer_city": "Ciudad"}
# campo de un cambio (SC/COT/VEN, la ciudad de cambio_simple o la ficha) -> clave del body.
_CLAVE_DE_CAMPO_CONTACTO = {**{k: k for k in _CONTACTO_CLIENTE},
                            **{col_cli: k for k, (_, col_cli) in _CONTACTO_CLIENTE.items()}}
# Los limites de largo (correo 150, telefono 50, direccion 255, ciudad 100) viven en app/core/clientes.py: los comparte
# PUT /crm/customers/{id}. El formato del correo (clientes.correo_valido) tambien: lo comparte la tienda web (B2.1 D5).
# S9 (T11): claves del contacto que PATCH /solicitudes/{id} ya no acepta (se corrigen con /cliente). La ciudad no es
# columna de la SC; customer_id y customer_name (cambiar de cliente) siguen por update_solicitud.
_CONTACTO_POR_CORRECCION = ("customer_phone", "customer_email", "customer_address")
_INTERBLOQUEO = "40P01"  # deadlock_detected de PostgreSQL
_TIEMPO_AGOTADO = "57014"  # query_canceled: el statement_timeout de 15 s (app/db/database.py) esperando un bloqueo
# R6: pedidos que ya no se corrigen (cerrados). DEVUELTO_TOTAL ya paso por entregado y no tiene transiciones.
_ESTADOS_VEN_CERRADOS_PARA_CONTACTO = ("CANCELADO", "ENTREGADO", "FACTURADO", "DEVUELTO_TOTAL")
# R18 (ruling de T5): renglon de la Actividad de una COT propagada cuyo enlace pendiente se anulo. La COT no cambia de
# estado y 'Enviar al cliente' solo acepta BORRADOR o ENVIADA: por eso se indica pasarla a Borrador.
_ENLACE_COT_ANULADO = {"etiqueta": "Enlace de confirmación",
                       "despues": "Se anuló el enlace enviado al dato anterior: pasa la cotización a Borrador y "
                                  "envíala de nuevo"}


def _normalizar_contacto(body: dict) -> dict:
    """Solo las claves de _CONTACTO_CLIENTE que trae el body, normalizadas: sin espacios en los bordes, '' -> None
    (borrar el dato), correo en minusculas. 422 con el texto para el usuario si un dato no sirve (las mismas reglas que
    validarContacto del frontend). Otras claves (customer_name, updated_by...) se ignoran."""
    nuevos = {}
    for clave in _CONTACTO_CLIENTE:
        if clave not in body:
            continue
        valor = body[clave]
        if valor is not None and not isinstance(valor, str):
            raise HTTPException(422, f"El dato «{_ETIQUETAS_CONTACTO[clave]}» debe ser un texto.")
        valor = (valor or "").strip() or None
        if valor is not None:
            excede = clientes.texto_de_limite(_CONTACTO_CLIENTE[clave][1], valor)  # primero el largo, despues el formato
            if excede:
                raise HTTPException(422, excede)
            if clave == "customer_email":
                if not clientes.correo_valido(valor):
                    raise HTTPException(422, f"El correo «{valor}» no es válido.")
                valor = valor.lower()
            elif clave == "customer_phone" and sum(ch in "0123456789" for ch in valor) < clientes.TELEFONO_MIN_DIGITOS:
                raise HTTPException(422, f"El teléfono debe tener al menos {clientes.TELEFONO_MIN_DIGITOS} dígitos.")
        nuevos[clave] = valor
    return nuevos


def _unir_es(partes) -> str:
    """'a' | 'a y b' | 'a, b y c'."""
    partes = [p for p in partes if p]
    if len(partes) <= 1:
        return "".join(partes)
    return ", ".join(partes[:-1]) + " y " + partes[-1]


def _titulo_contacto(*listas_de_cambios) -> str:
    """'Teléfono, Correo': los datos de contacto que cambiaron en alguna de las listas, en el orden del formulario."""
    claves = {_CLAVE_DE_CAMPO_CONTACTO.get(c.get("campo")) for cambios in listas_de_cambios for c in cambios}
    return ", ".join(etiqueta for clave, etiqueta in _ETIQUETAS_CONTACTO.items() if clave in claves)


def _docs_abiertos_para_contacto(db: Session, sc: CustomerRequest) -> list:
    """R6 (respuesta del usuario): [(entidad, doc)] abiertos de la SC: las COT que no estan RECHAZADAS y los PVEN
    abiertos (fuera de _ESTADOS_VEN_CERRADOS_PARA_CONTACTO) vinculados por sc_id o por el cot_id de CUALQUIER COT de la
    SC (como get_solicitud: un PVEN cuya COT se rechazo o se desvinculo conserva el cot_id). Por id ascendente, primero
    las COT. La correccion solo llega a los que no son de otro cliente (_es_documento_de_otro_cliente).
    Ronda 2 de T5: las COT y los PVEN se leen con populate_existing().with_for_update(), despues de bloquear la SC y la
    ficha (orden SC -> ficha -> COT -> PVEN). Asi el customer_id, el estado y el contacto que se comparan son los que se
    van a escribir: nadie los cambia entre esta lectura y el commit, y un objeto ya cargado en la sesion se relee. No es
    un patron de bloqueo nuevo (el UPDATE del flush ya tomaba la fila de la COT en el mismo orden; solo se adelanta).
    update_cotizacion bloquea COT -> SC al cambiar de SC o al retomar una RECHAZADA: si chocan, PostgreSQL aborta una
    (40P01) y PATCH /cliente responde 409. Se llama dentro de su try por eso."""
    cots = (db.query(SalesQuotation).filter(SalesQuotation.sc_id == sc.id).order_by(SalesQuotation.id.asc())
            .populate_existing().with_for_update().all())
    filtro = SaleOrder.sc_id == sc.id
    if cots:
        filtro = filtro | SaleOrder.cot_id.in_([c.id for c in cots])
    pvens = (db.query(SaleOrder).filter(filtro, SaleOrder.estado.notin_(_ESTADOS_VEN_CERRADOS_PARA_CONTACTO))
             .order_by(SaleOrder.id.asc()).populate_existing().with_for_update().all())
    return [("COT", c) for c in cots if c.estado != "RECHAZADA"] + [("VEN", v) for v in pvens]


def _es_documento_de_otro_cliente(doc, sc: CustomerRequest) -> bool:
    """Ronda 1 de T5 (punto 1, precisa R6): una COT o un PVEN con otra ficha (customer_id distinto del de la SC) cuelga
    de la SC porque el cliente de la SC o de la COT cambio despues; corregir el contacto de la SC no lo toca. Un
    documento sin ficha (customer_id None) no es de otro cliente."""
    return doc.customer_id is not None and doc.customer_id != sc.customer_id


def _anular_confirmacion_por_cambio_de_cliente(db: Session, sc: CustomerRequest, old_estado: str,
                                               autor: Optional[str], motivo: str = _MOTIVO_CAMBIO_DE_CONTACTO,
                                               aviso: str = _AVISO_CAMBIO_DE_CONTACTO) -> dict:
    """R18 (H21): la regla de Gate 1 de update_solicitud para un cambio de cliente (B1-T4, con la puerta A de la ronda 1
    de T3), para PATCH /solicitudes/{id}/cliente. Se llama cuando cambio el correo o el telefono de la SC
    (_cliente_de_la_solicitud), sin otro cambio de estado en la misma operacion (sc.estado == old_estado) y DESPUES del
    renglon de la correccion:
    - PENDIENTE_CONFIRMACION (con o sin COT: el cliente no ha confirmado nada) o CONFIRMADA sin COT activa: vuelve a
      ASIGNADA (BORRADOR sin asesor) con el renglon ESTADO_CHANGED «Estado cambiado a …: {motivo}».
    - Si no, con la marca gate1 (CONFIRMADA con una COT activa, o una marca heredada): el estado no cambia y queda el
      renglon UPDATED {aviso}.
    - En los dos casos se revoca el enlace de la SC y se limpia gate1. En ASIGNADA o BORRADOR sin marca no hay nada que
      anular (tampoco en una CONFIRMADA sin marca con COT activa: la confirmo el cliente por la COT, T2A).
    Es el mismo predicado que update_solicitud (_gate1_reinicia_estado y _estado_tras_reinicio, mas la condicion de
    anula_por_cliente), que no lo usa: alli la decision va junto con el cambio de productos y del asesor en el mismo
    PATCH. No es _confirmacion_vigente_sc: el Bloque 1 tambien anula una marca gate1 heredada fuera de CONFIRMADA. Sin
    commit (_log y revoke_pending_tokens con commit=False).
    Devuelve {confirmacion_anulada, estado_cambiado, enlace_anulado}; enlace_anulado = la revocacion anulo un enlace de
    la SC que el cliente todavia podia usar (contado por el propio UPDATE con RETURNING; ronda 2 de T5)."""
    estado_cambiado = _gate1_reinicia_estado(db, sc, old_estado)
    if not estado_cambiado and sc.gate1_confirmed_at is None:
        return {"confirmacion_anulada": False, "estado_cambiado": False, "enlace_anulado": False}
    if estado_cambiado:
        sc.estado = _estado_tras_reinicio(sc)
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED", _texto_estado_cambiado(etiqueta_estado("SC", sc.estado), motivo),
             old_estado=old_estado, new_estado=sc.estado, user_name=autor, commit=False)
    else:
        _log(db, "SC", sc.id, sc.numero, "UPDATED", aviso, user_name=autor, commit=False)
    from app.core.confirmation_tokens import revoke_pending_tokens
    vigentes = revoke_pending_tokens(db, "SC", sc.id, commit=False, contar_vigentes=True)
    sc.gate1_confirmed_at = None
    return {"confirmacion_anulada": True, "estado_cambiado": estado_cambiado, "enlace_anulado": vigentes > 0}


def _anular_enlaces_de_cotizaciones_por_cambio_de_cliente(db: Session, sc: CustomerRequest,
                                                          autor: Optional[str]) -> list:
    """T11 calidad (F2, residual de S9): la regla R18 de PATCH /cliente para las COT cuando update_solicitud cambia el
    cliente de la SC (_cliente_de_la_solicitud: aqui, por customer_id o null; el correo y el telefono solo cambian por
    /cliente, S9). Revocar solo el enlace de la SC dejaba vivo el de una COT temprana (Borrador o Pendiente, sin la
    confirmacion de la SC): si el cliente ANTERIOR la confirmaba, la sincronizacion
    confirmaba la SC para el nuevo. En cada COT abierta de la SC que no esta CONFIRMADA (el cliente ya confirmo los
    precios) se revocan los enlaces sin cambiar su estado y, si alguno seguia vivo, su Actividad lo dice con el renglon
    de _ENLACE_COT_ANULADO. Sin commit: va en el commit unico de update_solicitud. Devuelve los numeros anulados."""
    from app.core.confirmation_tokens import revoke_pending_tokens
    cots = (db.query(SalesQuotation)
            .filter(SalesQuotation.sc_id == sc.id, SalesQuotation.estado.notin_(("RECHAZADA", "CONFIRMADA")))
            .order_by(SalesQuotation.id.asc()).all())
    anulados = []
    for cot in cots:
        if revoke_pending_tokens(db, "COT", cot.id, commit=False, contar_vigentes=True):
            _log(db, "COT", cot.id, cot.numero, "UPDATED",
                 f"Cambió el cliente de la solicitud {sc.numero}: se anuló el enlace de confirmación de esta "
                 f"cotización", user_name=autor,
                 extra_data={"cambios": [dict(_ENLACE_COT_ANULADO)],
                             "origen": {"tipo": "SC", "id": sc.id, "numero": sc.numero}},
                 commit=False)
            anulados.append(cot.numero)
    return anulados


def _mensaje_correo_de_otro_cliente(correo: str, otro: Optional[Customer]) -> str:
    """409 de PATCH /solicitudes/{id}/cliente: el correo ya es de otra ficha (con su nombre si se sabe cual)."""
    quien = f" ({clientes.nombre_cliente(otro)})" if otro is not None else ""
    return (f"El correo {correo} ya pertenece a otro cliente{quien}. Revisa si es el mismo cliente antes de "
            f"cambiarlo.")

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
        # Confirmacion del cliente sin usar (gate2_confirmed_at): la pone el enlace en cada confirmacion y la consume
        # la conversion a pedido. CONFIRMADA + True = se puede crear el pedido ya (tambien tras cancelar el anterior);
        # CONFIRMADA + False con solo pedidos cancelados = dato antiguo que hay que reabrir.
        "confirmacion_vigente": cot.gate2_confirmed_at is not None,
        "canal_envio": cot.canal_envio,
        "fecha_cotizacion": cot.fecha_cotizacion.isoformat() if cot.fecha_cotizacion else None,
        "fecha_entrega_estimada": cot.fecha_entrega_estimada.isoformat() if cot.fecha_entrega_estimada else None,
        "notas": cot.notas,
        "productos": cot.productos or [],
        "pec_id": cot.pec_id,
        "pec_numero": cot.pec_numero,
        "created_at": _iso_utc(cot.created_at),
        "updated_at": _iso_utc(cot.updated_at),
        "created_by": cot.created_by,
        # U11: creada sin la confirmacion del cliente sobre la SC (None = camino normal) y el motivo.
        "sin_confirmacion_sc_at": _iso_utc(cot.sin_confirmacion_sc_at),
        "sin_confirmacion_sc_motivo": cot.sin_confirmacion_sc_motivo,
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
        "cancelled_at": _iso_utc(v.cancelled_at),
        "created_at": _iso_utc(v.created_at),
        "updated_at": _iso_utc(v.updated_at),
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
        "created_at": _iso_utc(p.created_at),
    }

def _asesor_de_pedido(cotizador, asesor_de_la_sc):
    """El PVEN no guarda asesor: es el cotizador de su COT o, si esta vacio o no hay COT, el asesor de su SC."""
    return _texto_o_none(cotizador) or _texto_o_none(asesor_de_la_sc)

def _asesores_de_pedidos(db: Session, pedidos) -> dict:
    """{id del pedido: asesor o None} de una lista de pedidos, con 2 consultas en bloque (IN) y sin una por fila."""
    cot_ids = {v.cot_id for v in pedidos if v.cot_id}
    sc_ids = {v.sc_id for v in pedidos if v.sc_id}
    cotizador = (dict(db.query(SalesQuotation.id, SalesQuotation.cotizador).filter(SalesQuotation.id.in_(cot_ids)).all())
                 if cot_ids else {})
    asesor_sc = (dict(db.query(CustomerRequest.id, CustomerRequest.advisor_name)
                      .filter(CustomerRequest.id.in_(sc_ids)).all()) if sc_ids else {})
    return {v.id: _asesor_de_pedido(cotizador.get(v.cot_id), asesor_sc.get(v.sc_id)) for v in pedidos}

# S3 (T11): campos de contacto del cliente que un renglon de la Actividad de SC, COT o PVEN guarda con su antes y su
# despues (la correccion de datos del cliente y las ediciones de los PATCH).
_CAMPOS_DE_CONTACTO = frozenset({"customer_phone", "customer_email", "customer_address", "customer_city"})


# T11 calidad (F5): etiquetas del resultado del correo en los renglones de un envio al cliente (_detalle_envio).
_ETIQUETAS_CORREO_DE_ENVIO = ("Correo", "Correo de respaldo")


def _sin_valores_de_contacto(extra):
    """S3 (T11): extra_data de un renglon con el antes y el despues del contacto vaciados: el campo sigue nombrado y la
    pantalla lo pinta 'Teléfono: cambiado' (sin la llave 'campo', CambiosDeActividad no pone '—' ni tacha). Devuelve una
    copia: el renglon de la sesion no cambia.
    T11 calidad (F5 y ronda 1): un renglon de envio al cliente (_extra_data_de_envio: trae 'correo') pierde
    correo.destino y su cambio 'Correo' / 'Correo de respaldo', SOLO si lleva la direccion ('Correo enviado a …', 'No se
    pudo enviar el correo a …'), pasa a «Correo enviado» o «No se pudo enviar» segun correo.enviado. Sin correo
    registrado o con el correo sin configurar el texto no lleva la direccion y se conserva. La descripcion de esos
    renglones no lleva la direccion."""
    if not isinstance(extra, dict):
        return extra
    correo = extra.get("correo")
    de_envio = isinstance(correo, dict)
    nuevo = dict(extra)
    if de_envio:
        nuevo["correo"] = {k: v for k, v in correo.items() if k != "destino"}
    if isinstance(extra.get("cambios"), list):
        resultado = "Correo enviado" if de_envio and correo.get("enviado") is True else "No se pudo enviar"
        destino = correo.get("destino") if de_envio else None
        cambios = []
        for c in extra["cambios"]:
            if isinstance(c, dict) and c.get("campo") in _CAMPOS_DE_CONTACTO:
                c = {"etiqueta": c.get("etiqueta"), "despues": "cambiado"}
            elif (de_envio and isinstance(c, dict) and "campo" not in c
                  and c.get("etiqueta") in _ETIQUETAS_CORREO_DE_ENVIO and isinstance(c.get("despues"), str)
                  and ("@" in c["despues"] or (isinstance(destino, str) and destino and destino in c["despues"]))):
                c = {**c, "despues": resultado}
            cambios.append(c)
        nuevo["cambios"] = cambios
    return nuevo


def _log_dict(l: ActivityLog, rol: str) -> dict:
    """Un renglon de la Actividad para la respuesta. S3 (T11): `rol` es el del usuario (normalize_role); fuera de
    clientes.ROLES_VEN_CONTACTO_ANTERIOR (ADMIN y ASESOR, lista blanca: el mismo criterio del perfil 360) el antes y el
    despues del telefono, el correo, la direccion y la ciudad salen sin valores."""
    extra = l.extra_data
    if rol not in clientes.ROLES_VEN_CONTACTO_ANTERIOR:
        extra = _sin_valores_de_contacto(extra)
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
        "created_at": _iso_utc(l.created_at),
        "extra_data": extra,
    }

def _agregar_nota(db: Session, entidad: str, doc, body: dict, user: User) -> dict:
    """U6+H22: una nota del Chatter en la Actividad de `doc` (SC, COT o VEN), validada por chatter.validar_nota (422
    con el mensaje si no sirve). El autor es el usuario de la sesion (R9/C13), nunca body.user_name. R1: un contacto con
    el cliente (llamada, WhatsApp, correo, nota externa) reinicia el atraso del documento (updated_at); la nota interna
    no. Una sola transaccion; devuelve el renglon creado (_log_dict: con id y created_at en 'Z').
    S7 (T11): esos contactos con el cliente son solo de ADMIN y ASESOR; COMPRAS solo deja notas internas (403)."""
    try:
        action, texto, extra = validar_nota(body)
    except ValueError as e:
        raise HTTPException(422, str(e))
    rol = normalize_role(user.role)
    if not puede_registrar(extra["tipo"], rol):
        raise HTTPException(403, CONTACTO_SOLO_ASESOR)
    log = _log(db, entidad, doc.id, doc.numero, action, texto, user_name=nombre_de_usuario(user), extra_data=extra,
               commit=False)
    if reinicia_atraso(extra["tipo"]):
        doc.updated_at = datetime.datetime.utcnow()
    db.flush()
    d = _log_dict(log, rol)
    db.commit()
    return {"status": "success", "data": d}

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
    # H32: las cotizaciones de cada solicitud (version ligera: id, numero y estado), con una sola consulta para toda la
    # pagina. Con eso la lista dice cuantas solicitudes generaron cotizacion de verdad (el detalle trae la completa).
    ids = [s.id for s in items]
    cots_por_sc = {}
    if ids:
        for c_id, c_num, c_est, c_sc in (db.query(SalesQuotation.id, SalesQuotation.numero, SalesQuotation.estado,
                                                  SalesQuotation.sc_id)
                                         .filter(SalesQuotation.sc_id.in_(ids)).order_by(SalesQuotation.id.asc())):
            cots_por_sc.setdefault(c_sc, []).append({"id": c_id, "numero": c_num, "estado": c_est})
    return {"status": "success", "total": total,
            "data": [{**_sc_dict(s), "cotizaciones": cots_por_sc.get(s.id, [])} for s in items]}


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


# N4 (Papelera): una SC que tiene (o tuvo) una cotizacion, un pedido de venta o un lead del CRM guardado en
# sales_orders.canonical_customer_request_id es historial: ni se purga a los 30 dias ni se elimina a mano. Las tres
# tablas la referencian con una FK sin cascade (borrarla fallaba). `cr` es el alias de customer_requests.
_SQL_SC_CON_DOCUMENTOS = """(EXISTS(SELECT 1 FROM sales_quotations q WHERE q.sc_id = cr.id)
                OR EXISTS(SELECT 1 FROM sale_orders s WHERE s.sc_id = cr.id)
                OR EXISTS(SELECT 1 FROM sales_orders l WHERE l.canonical_customer_request_id = cr.id))"""


def purgar_papelera_vencida(db: Session, ahora: datetime.datetime, autor: str = "Sistema") -> dict:
    """Borra las SC CANCELADA con eliminada_at anterior a `ahora` - DIAS_EN_PAPELERA dias que nadie referencia y deja
    un renglon PURGED por cada una, con `autor` («Sistema» si no se indica). `ahora` es UTC sin zona, como eliminada_at.
    No hace commit: quien la llame confirma. Si se usa en un ciclo automático, confirma después de cada tarea, o aísla
    la tarea, para que un fallo posterior no deshaga la purga. El borrado y sus renglones van juntos en ese commit (H33:
    la SC ya no existe, ninguna pantalla muestra el renglon). La usan POST /papelera/purgar y, en el Bloque 3, la
    revision automatica, que la llama fn(db, ahora). Devuelve {'purgadas': n, 'numeros': [...]}."""
    corte = ahora - datetime.timedelta(days=DIAS_EN_PAPELERA)
    purgadas = db.execute(text(f"""
        DELETE FROM customer_requests cr
        WHERE cr.estado='CANCELADA' AND cr.eliminada_at IS NOT NULL
        AND cr.eliminada_at < :corte
        AND NOT {_SQL_SC_CON_DOCUMENTOS}
        RETURNING cr.id, cr.numero, cr.customer_name, cr.razon_cancelacion
    """), {"corte": corte}).mappings().all()
    for f in purgadas:
        _log(db, "SC", f["id"], f["numero"], "PURGED",
             f"Solicitud eliminada definitivamente: llevaba más de {DIAS_EN_PAPELERA} días en la Papelera",
             old_estado="CANCELADA", user_name=autor,
             extra_data={"cliente": f["customer_name"], "motivo_cancelacion": f["razon_cancelacion"]}, commit=False)
    numeros = [f["numero"] for f in purgadas]
    return {"purgadas": len(numeros), "numeros": numeros}


@router.post("/papelera/purgar")
def purgar_papelera(user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    """B2.1 D2: 'Vaciar las vencidas' del administrador. Hace la purga que antes hacia el GET de la Papelera (SC
    canceladas hace mas de DIAS_EN_PAPELERA dias y sin documentos) con el autor de la sesion, en un solo commit. Si
    algo falla, rollback y 500: no borra nada a medias."""
    try:
        resultado = purgar_papelera_vencida(db, _ahora_utc(), nombre_de_usuario(user))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("No se pudo purgar la papelera de solicitudes")
        raise HTTPException(500, "No se pudo vaciar la Papelera: no se borró ninguna solicitud.")
    return {"status": "success", "data": resultado}


@router.get("/solicitudes/papelera")
def get_papelera(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Lista SCs canceladas con días restantes antes de eliminación permanente. Solo lista: nunca borra (B2.1 D2; la
    purga es POST /papelera/purgar, del administrador). dias_restantes es None (la fecha de purga no existe) si se
    conservan, porque tienen documentos vinculados, o sin eliminada_at (cancelada con la pastilla vieja: la purga exige
    eliminada_at); 0 si ya vencio y espera a que un administrador vacie la Papelera. Cada fila trae sus notas (T11
    calidad, A3): el motivo de una cancelada vieja vive en ellas ('[CANCELADA] Razón: X', motivoDeCancelacion del
    frontend) aunque la SC no este en la lista cargada. Los dias salen de _ahora_utc(), el mismo reloj de la purga
    (B2.1 T1 r1), no de NOW() de la base."""
    try:
        rows = db.execute(text(f"""
            SELECT cr.id, cr.numero, cr.customer_name, cr.advisor_name, cr.tipo_solicitud,
                   cr.razon_cancelacion, cr.notas, cr.eliminada_at, cr.created_at, cr.updated_at,
                   EXTRACT(DAY FROM CAST(:ahora AS timestamp) - cr.eliminada_at) as dias_en_papelera,
                   {_SQL_SC_CON_DOCUMENTOS} AS tiene_documentos
            FROM customer_requests cr
            WHERE cr.estado='CANCELADA'
            ORDER BY COALESCE(cr.eliminada_at, cr.updated_at) DESC
            LIMIT 200
        """), {"ahora": _ahora_utc()}).mappings().all()
    except Exception:
        db.rollback()
        logger.exception("No se pudo cargar la papelera de solicitudes")
        raise HTTPException(500, "No se pudo cargar la papelera de solicitudes")
    data = []
    for r in rows:
        d = dict(r)
        dias = float(d.get("dias_en_papelera") or 0)
        d["dias_en_papelera"] = int(dias)
        d["tiene_documentos"] = bool(d.get("tiene_documentos"))
        # None = la purga no la va a borrar: se conserva (tiene documentos) o no tiene eliminada_at (cancelada con la
        # pastilla vieja: la purga exige eliminada_at). Mismo criterio que _fecha_de_purga / purga_programada.
        if d["tiene_documentos"] or not d.get("eliminada_at"):
            d["dias_restantes"] = None
        else:
            d["dias_restantes"] = max(0, DIAS_EN_PAPELERA - int(dias))
        d["eliminada_at"] = str(d["eliminada_at"]) if d.get("eliminada_at") else None
        d["created_at"] = str(d["created_at"]) if d.get("created_at") else None
        data.append(d)
    return {"status": "success", "data": data}


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
    d["customer_city"] = _ciudad_del_cliente(sc)  # H21: de la ficha; solo en el detalle (no suma consultas al listado)
    rol = normalize_role(user.role)
    d["actividades"] = [_log_dict(l, rol) for l in logs]
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
    # U18: que pasara con la cancelada en la Papelera. purga_programada es None si se conserva o si no tiene
    # eliminada_at (cancelada con la pastilla vieja: la purga no la toca).
    if sc.estado == "CANCELADA":
        referencias = _referencias_de_solicitud(db, sc.id)
        d["se_conserva_en_papelera"] = bool(referencias)
        d["purga_programada"] = _iso_utc(_fecha_de_purga(sc, referencias))
    return {"status": "success", "data": d}


@router.patch("/solicitudes/{sc_id}")
def update_solicitud(sc_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    _exigir_estado_valido(body)  # S1 (T11): antes de leer nada
    # S9 (T11): el contacto del cliente se corrige SOLO con PATCH /solicitudes/{id}/cliente, que tambien corrige la ficha
    # y la COT y el PVEN abiertos y anula sus enlaces (R18). Por aqui la COT temprana conservaba el contacto anterior y
    # su enlace: si ese contacto la confirmaba, la SC quedaba Confirmada con el nuevo. Ninguna pantalla manda estas
    # claves en este PATCH (el formulario de Editar ya usa /cliente).
    if any(clave in body for clave in _CONTACTO_POR_CORRECCION):
        raise HTTPException(422, f"El teléfono, el correo y la dirección del cliente se corrigen con «Corregir datos del "
                                 f"cliente» (PATCH /ventas/solicitudes/{sc_id}/cliente): así también quedan corregidos "
                                 f"en su ficha y en la cotización y el pedido abiertos.")
    # B10 (revision final): bloqueada, como el PVEN en update_pedido: una cancelacion o confirmacion concurrentes
    # esperan en vez de validar contra un estado viejo.
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).with_for_update().first()
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
        raise HTTPException(400, "El estado Confirmada solo se alcanza cuando el cliente confirma vía el enlace enviado (no se puede forzar manualmente).")
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
    # este PATCH. Fuera de eso, a mano solo se reinicia (BORRADOR: vuelve a Nueva, o a Asignada si tiene asesor; U15/C5).
    # Esto tambien cierra los estados de pedido que el cambio masivo del Hub mandaba a una SC. Reenviar el estado que
    # ya tiene no es un cambio. S1 (T11): None = la clave no vino (un estado vacio o que no es texto ya dio 422).
    nuevo_estado = body.get("estado")
    # Una SC cancelada (en la Papelera) solo vuelve por /restaurar, que limpia eliminada_at, revisa sus documentos y
    # devuelve el lead: reiniciarla o soltarla en el Hub no la reviven a medias.
    if sc.estado == "CANCELADA" and nuevo_estado is not None and nuevo_estado != "CANCELADA":
        raise HTTPException(409, f"La solicitud {sc.numero} está cancelada: para volver a trabajar en ella, "
                                 f"restáurala desde la Papelera (botón «Restaurar»).")
    # T11 calidad (A2): y nada mas de ella cambia (productos, notas, asesor, cliente...), como en PATCH /cliente.
    if sc.estado == "CANCELADA":
        raise HTTPException(409, "La solicitud está cancelada. Restáurala desde la Papelera para editarla.")
    if nuevo_estado == "CANCELADA" and sc.estado != "CANCELADA":
        raise HTTPException(400, "Para cancelar una solicitud usa el botón «Cancelar Solicitud»: pide el motivo y "
                                 "revisa que no tenga cotizaciones ni pedidos activos.")
    if nuevo_estado is not None and nuevo_estado != sc.estado and nuevo_estado not in ESTADOS_SC_MANUALES:
        raise HTTPException(400, f"El estado «{_nombre_de_estado('SC', nuevo_estado)}» no se puede asignar a mano "
                                 f"a una solicitud: solo se puede reiniciar (vuelve a {etiqueta_estado('SC', 'BORRADOR')}"
                                 f", o a {etiqueta_estado('SC', 'ASIGNADA')} si tiene asesor).")
    # R10: reiniciar reinicia el ciclo de Gate 1 (revoca el enlace y limpia la confirmacion): no con una cotizacion o un
    # pedido vivos colgando de la SC.
    if nuevo_estado == "BORRADOR" and sc.estado != "BORRADOR":
        cots_activas, pvens_activos = _documentos_activos_de_solicitud(db, sc.id)
        if cots_activas or pvens_activos:
            raise HTTPException(409, _mensaje_documentos_activos(sc, cots_activas, pvens_activos, "reiniciar"))
    old_estado = sc.estado
    fecha_vieja = sc.fecha_entrega_estimada if "fecha_entrega_estimada" in body else None
    antes_log = cambios_documento.tomar_foto(sc, "SC")
    cliente_antes = _cliente_de_la_solicitud(sc)
    customer_id_antes = sc.customer_id
    # S9 (T11): sin customer_phone, customer_email ni customer_address (van por /cliente; arriba dan 422).
    allowed = ["customer_id","customer_name","advisor_name","advisor_user_id","tipo_solicitud","modalidad_pago",
               "estado","fecha_vencimiento","fecha_entrega_estimada","notas","productos",
               "tipo_problema","descripcion_problema","urgencia","evidencia_descripcion",
               "asignado_a_user_id","estado_soporte"]
    for k in allowed:
        if k in body:
            v = body[k]
            # T11 calidad, ronda 1: customer_id tambien ('05' o ' 5 ' es la misma ficha y no anula ningun enlace).
            if k in ("advisor_user_id", "asignado_a_user_id", "customer_id"):
                v = _int_or_none(v)
            setattr(sc, k, v)
    # B7 (revision final, Minor 8 y residual F2): el contacto ya no viaja en este PATCH (S9), asi que cambiar el cliente
    # por customer_id dejaba en la SC el telefono y el correo del cliente ANTERIOR, y el siguiente «Enviar al cliente» le
    # mandaba a el el enlace de Gate 1. Ahora la SC toma el telefono, el correo y la direccion de la ficha NUEVA en este
    # mismo commit; un dato que la ficha nueva no tiene queda vacio (nunca el del cliente anterior). Una ficha que no
    # existe es 422 sin escribir nada (antes, el FK fallaba con un 500). Quitar el cliente (None) no toca el contacto.
    if sc.customer_id is not None and sc.customer_id != customer_id_antes:
        ficha = db.query(Customer).filter(Customer.id == sc.customer_id).first()
        if ficha is None:
            raise HTTPException(422, "El cliente indicado no existe.")
        sc.customer_phone = ficha.phone or None
        sc.customer_email = ficha.email or None
        sc.customer_address = ficha.address or None
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
    # U11 (ronda 1 de T3, puerta A): con el enlace PENDIENTE la excepcion de la COT activa no aplica: el cliente no ha
    # confirmado nada todavia (esa COT es la creada sin confirmacion, /cotizar-sin-confirmacion). La COT no cambia; la
    # SC vuelve a ASIGNADA y su enlace se revoca, como sin cotizacion.
    cambian_los_productos = "productos" in body and cambios_documento.cambian_productos(
        antes_log.get("productos"), sc.productos)
    cambia_el_cliente = _cliente_de_la_solicitud(sc) != cliente_antes
    invalida_confirmacion = (
        (cambian_los_productos or cambia_el_cliente)
        and sc.estado == old_estado
        and _gate1_reinicia_estado(db, sc, old_estado)
    )
    if invalida_confirmacion:
        sc.estado = _estado_tras_reinicio(sc)
    # CONFIRMADA con una COT activa: el estado no cambia, pero si cambio el cliente la confirmacion (y el enlace) eran del
    # cliente anterior: se anulan igual (abajo se revoca el enlace y queda en la Actividad).
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
             f"Estado cambiado a {etiqueta_estado('SC', sc.estado)}",
             old_estado=old_estado, new_estado=sc.estado,
             user_name=body.get("updated_by"), commit=False, usuario=user)
    if promueve_asignada and not (body.get("estado") and body["estado"] != old_estado):
        # El check de arriba solo loguea cuando el REQUEST manda "estado" explicitamente.
        # promueve_asignada puede cambiar sc.estado sin que el body lo pida (solo manda
        # advisor_user_id), asi que sin este bloque la transicion a ASIGNADA quedaria
        # invisible en el Chatter/Actividad. El guard evita un doble log en el caso raro
        # de que el mismo PATCH mande advisor_user_id Y un estado explicito distinto.
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED",
             f"Estado cambiado a {etiqueta_estado('SC', 'ASIGNADA')} (asesor asignado)",
             old_estado=old_estado, new_estado=sc.estado, user_name=body.get("updated_by"), commit=False,
             usuario=user)
    if desasigna_a_borrador and not (body.get("estado") and body["estado"] != old_estado):
        # Mismo motivo que el bloque anterior: esta transicion ocurre sin que el body
        # mande "estado" (solo limpia advisor_user_id), asi que necesita su propio log.
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED",
             f"Estado cambiado a {etiqueta_estado('SC', 'BORRADOR')} (asesor retirado)",
             old_estado=old_estado, new_estado=sc.estado, user_name=body.get("updated_by"), commit=False,
             usuario=user)
    if invalida_confirmacion:
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED",
             _texto_estado_cambiado(etiqueta_estado('SC', sc.estado),
                                    _MOTIVO_PRODUCTOS if cambian_los_productos else _MOTIVO_CAMBIO_DE_CLIENTE),
             old_estado=old_estado, new_estado=sc.estado,
             user_name=body.get("updated_by") or getattr(user, "email", None), commit=False, usuario=user)
    if anula_por_cliente:
        _log(db, "SC", sc.id, sc.numero, "UPDATED", _AVISO_CAMBIO_DE_CLIENTE,
             user_name=body.get("updated_by") or getattr(user, "email", None), commit=False, usuario=user)
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
    if transiciona or anula_por_cliente or cambia_el_cliente:
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
        # B7 (revision final): con CUALQUIER cambio de cliente, tambien en Asignada o Nueva sin la marca (ahi ni el
        # reinicio ni anula_por_cliente revocaban un enlace que hubiera quedado vivo): era del cliente anterior.
        from app.core.confirmation_tokens import revoke_pending_tokens
        revoke_pending_tokens(db, "SC", sc.id, commit=False)
        sc.gate1_confirmed_at = None
    if cambia_el_cliente:
        # T11 calidad (F2, residual de S9): los enlaces de sus COT tempranas tambien eran del cliente anterior.
        _anular_enlaces_de_cotizaciones_por_cambio_de_cliente(db, sc, nombre_de_usuario(user))
    # El dict se arma ANTES del commit: tras el commit el objeto queda expirado y leerlo costaria otro viaje a la base.
    resp = _sc_dict(sc)
    db.commit()
    return {"status": "success", "data": resp}


@router.patch("/solicitudes/{sc_id}/cliente")
def corregir_datos_cliente_solicitud(sc_id: int, body: dict,
        user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    """H21: corrige el telefono, el correo, la direccion y la ciudad del cliente desde la SC.

    En una sola transaccion (un commit) se corrigen la SC, su ficha de cliente (si esta vinculada; la ciudad solo vive
    alli) y, por R6, la COT y el PVEN abiertos de esa SC (_docs_abiertos_para_contacto) que no son de otro cliente
    (_es_documento_de_otro_cliente: esos no se tocan y se informan), con un renglon en la Actividad de cada uno y en el
    historial del cliente (perfil 360). Un correo de otra ficha -> 409 sin escribir nada (tambien si otro cliente lo
    toma en una carrera: IntegrityError desde el flush). El autor es el usuario de la sesion (R9): se ignoran
    body.updated_by y body.user_name. El nombre no se corrige aqui (se cambia en la ficha).
    R18: si cambia el correo o el telefono de la SC, la misma regla de Gate 1 que update_solicitud para un cambio de
    cliente (_anular_confirmacion_por_cambio_de_cliente). En cada COT propagada cuyo correo o telefono cambio (menos una
    CONFIRMADA, que recibe los datos y conserva su confirmacion) se revocan los enlaces sin cambiar su estado; si alguno
    seguia vivo, queda en enlaces_anulados y en su Actividad. Cambiar solo la direccion o la ciudad no anula nada.
    Respuesta: {status, data (_sc_dict + customer_city), ficha_actualizada, documentos_actualizados [numeros],
    documentos_de_otro_cliente [numeros], confirmacion_anulada, estado_cambiado, enlaces_anulados [numeros de SC/COT],
    sin_cambios}."""
    correo = None
    cliente, docs, docs_de_otro_cliente = None, [], []
    try:
        # T11 calidad (F6, residual de S8): la propia SC tambien se bloquea dentro del try: si PostgreSQL aborta esa
        # espera por el statement_timeout (57014) o por un interbloqueo (40P01), es el 409 de abajo y no un 500. El 404,
        # el 409 de la cancelada y los 422 del contacto son HTTPException y siguen de largo.
        sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).with_for_update().first()
        if not sc:
            raise HTTPException(404, "Solicitud no encontrada")
        if sc.estado == "CANCELADA":
            raise HTTPException(409, f"La solicitud {sc.numero} está cancelada: si hace falta, corrige los datos desde "
                                     f"la ficha del cliente.")
        nuevos = _normalizar_contacto(body)
        if not nuevos:
            raise HTTPException(422, "No llegó ningún dato del cliente para corregir.")
        correo = nuevos.get("customer_email")
        autor = nombre_de_usuario(user)
        old_estado = sc.estado
        foto_sc = cambios_documento.tomar_foto(sc, "SC")
        contacto_sc_antes = _cliente_de_la_solicitud(sc)
        origen = {"tipo": "SC", "id": sc.id, "numero": sc.numero}
        # S8 (T11): la ficha se bloquea dentro del try, como la COT y el PVEN: si PostgreSQL aborta ese bloqueo por un
        # interbloqueo (40P01) o por el statement_timeout (57014), es el 409 de abajo y no un 500. El 422 de la ciudad
        # y el 409 del correo de otra ficha salen de esa lectura; son HTTPException y siguen de largo.
        if sc.customer_id:
            cliente = db.query(Customer).filter(Customer.id == sc.customer_id).with_for_update().first()
        if "customer_city" in nuevos and cliente is None:
            raise HTTPException(422, "Esta solicitud no está vinculada a una ficha de cliente: la ciudad se guarda en "
                                     "la ficha.")
        if cliente is not None and correo:
            otro = clientes.correo_de_otro_cliente(db, correo, cliente.id)
            if otro is not None:
                raise HTTPException(409, _mensaje_correo_de_otro_cliente(correo, otro))
        foto_cli = cambios_documento.tomar_foto(cliente, "CLIENTE") if cliente is not None else None
        ciudad_antes = cliente.city if cliente is not None else None
        # Los documentos se leen bloqueados (SC -> ficha -> COT -> PVEN) y dentro del try: un interbloqueo (40P01) al
        # tomarlos tambien responde 409. La foto 'antes' y la decision de quien es de otro cliente salen de esta lectura.
        for entidad, doc in _docs_abiertos_para_contacto(db, sc):
            if _es_documento_de_otro_cliente(doc, sc):
                docs_de_otro_cliente.append(doc.numero)
            else:
                docs.append((entidad, doc, cambios_documento.tomar_foto(doc, entidad), _cliente_de_la_solicitud(doc)))
        # Desde aqui hasta el commit: el UPDATE de la ficha sale en el flush, donde salta el indice unico del correo.
        for clave, valor in nuevos.items():
            col_doc, col_cli = _CONTACTO_CLIENTE[clave]
            if col_doc:
                setattr(sc, col_doc, valor)
                for _, doc, _, _ in docs:
                    setattr(doc, col_doc, valor)
            if cliente is not None:
                setattr(cliente, col_cli, valor)
        sc.updated_at = datetime.datetime.utcnow()
        db.flush()

        cambios_sc = cambios_documento.comparar("SC", foto_sc, cambios_documento.tomar_foto(sc, "SC"))
        if cliente is not None:
            ciudad = cambios_documento.cambio_simple("customer_city", "Ciudad", ciudad_antes, cliente.city)
            if ciudad is not None:
                cambios_sc.append(ciudad)
        cambios_cli = (cambios_documento.comparar("CLIENTE", foto_cli, cambios_documento.tomar_foto(cliente, "CLIENTE"))
                       if cliente is not None else [])
        docs_cambiados = []
        for entidad, doc, foto, contacto_antes in docs:
            cambios = cambios_documento.comparar(entidad, foto, cambios_documento.tomar_foto(doc, entidad))
            if cambios:
                docs_cambiados.append((entidad, doc, cambios, contacto_antes))
        if not (cambios_sc or cambios_cli or docs_cambiados):
            db.rollback()  # nada que guardar: sin Actividad (el formulario puede reenviar lo mismo)
            data = _sc_dict(sc)
            data["customer_city"] = _ciudad_del_cliente(sc)
            return {"status": "success", "data": data, "ficha_actualizada": False, "documentos_actualizados": [],
                    "documentos_de_otro_cliente": docs_de_otro_cliente, "confirmacion_anulada": False,
                    "estado_cambiado": False, "enlaces_anulados": [], "sin_cambios": True}

        numeros_docs = [doc.numero for _, doc, _, _ in docs_cambiados]
        lugares = (["la ficha del cliente"] if cambios_cli else []) + numeros_docs
        titulo = _titulo_contacto(cambios_sc, cambios_cli, *(c for _, _, c, _ in docs_cambiados))
        if cambios_sc:
            descripcion = f"Datos del cliente corregidos: {titulo}"
            if lugares:
                descripcion += f". También se corrigieron en {_unir_es(lugares)}."
        else:  # la SC ya tenia esos datos: se corrigieron la ficha o los documentos
            descripcion = f"Datos del cliente corregidos en {_unir_es(lugares)}: {titulo}"
        _log(db, "SC", sc.id, sc.numero, "UPDATED", descripcion, user_name=autor,
             extra_data={"cambios": cambios_sc, "ficha_cliente_id": cliente.id if cliente is not None else None,
                         "documentos": numeros_docs}, commit=False)

        gate1 = {"confirmacion_anulada": False, "estado_cambiado": False, "enlace_anulado": False}
        if _cliente_de_la_solicitud(sc) != contacto_sc_antes:
            gate1 = _anular_confirmacion_por_cambio_de_cliente(db, sc, old_estado, autor)
        enlaces_anulados = [sc.numero] if gate1["enlace_anulado"] else []

        if cambios_cli:
            clientes.log_cliente(db, cliente, f"Datos de contacto corregidos desde la solicitud {sc.numero}: "
                                              f"{_titulo_contacto(cambios_cli)}", cambios_cli, origen, autor)
        from app.core.confirmation_tokens import revoke_pending_tokens
        for entidad, doc, cambios, contacto_antes in docs_cambiados:
            titulo_doc = _titulo_contacto(cambios)
            # Se revoca siempre que cambio el correo o el telefono de la COT, salvo CONFIRMADA (R18: el cliente ya
            # confirmo precios), y solo se informa un enlace que el cliente todavia podia usar: los que este mismo UPDATE
            # revoco sin vencer (RETURNING, ronda 2).
            if (entidad == "COT" and doc.estado != "CONFIRMADA"
                    and _cliente_de_la_solicitud(doc) != contacto_antes):
                vigentes = revoke_pending_tokens(db, "COT", doc.id, commit=False, contar_vigentes=True)
                if vigentes:
                    cambios = cambios + [dict(_ENLACE_COT_ANULADO)]
                    enlaces_anulados.append(doc.numero)
            _log(db, entidad, doc.id, doc.numero, "UPDATED",
                 f"Datos del cliente corregidos desde la solicitud {sc.numero}: {titulo_doc}", user_name=autor,
                 extra_data={"cambios": cambios, "origen": origen}, commit=False)

        # Se arma ANTES del commit: despues el objeto queda expirado y leerlo costaria otro viaje a la base.
        data = _sc_dict(sc)
        data["customer_city"] = _ciudad_del_cliente(sc)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if not (correo and clientes.es_correo_repetido(exc)):
            raise
        otro = clientes.correo_de_otro_cliente(db, correo, cliente.id if cliente is not None else None)
        raise HTTPException(409, _mensaje_correo_de_otro_cliente(correo, otro))
    except DataError as exc:
        # Red de seguridad: un dato que paso _normalizar_contacto pero no cabe en una columna (p. ej. si la base de un
        # ambiente tiene columnas mas cortas que las de erp_test). Sin esto seria un 500 sin explicacion. El log no
        # lleva el SQL ni sus parametros: son datos de contacto del cliente.
        db.rollback()
        logger.warning("Dato de contacto que no cabe en la base al corregir la solicitud %s (%s)", sc_id,
                       type(getattr(exc, "orig", exc)).__name__)
        raise HTTPException(422, "Algún dato es demasiado largo para guardarlo: acórtalo e intenta de nuevo.")
    except OperationalError as exc:
        # La SC se bloquea antes que sus documentos y update_cotizacion bloquea la COT antes que la SC: si chocan,
        # PostgreSQL aborta una de las dos (40P01). S8 (T11): lo mismo si un bloqueo espera mas que el statement_timeout
        # (57014). Aqui se revierte todo y se pide repetir en vez de un 500.
        db.rollback()
        pgcode = getattr(getattr(exc, "orig", None), "pgcode", None)
        if pgcode not in (_INTERBLOQUEO, _TIEMPO_AGOTADO):
            raise
        logger.warning("Bloqueo abortado (%s) al corregir los datos del cliente de la solicitud %s", pgcode, sc_id)
        raise HTTPException(409, "Otra operación estaba cambiando esta solicitud o su cotización al mismo tiempo. "
                                 "Intenta de nuevo.")
    return {"status": "success", "data": data, "ficha_actualizada": bool(cambios_cli),
            "documentos_actualizados": numeros_docs, "documentos_de_otro_cliente": docs_de_otro_cliente,
            "confirmacion_anulada": gate1["confirmacion_anulada"], "estado_cambiado": gate1["estado_cambiado"],
            "enlaces_anulados": enlaces_anulados, "sin_cambios": False}


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
        raise HTTPException(400, f"La solicitud debe estar Asignada antes de enviar para confirmación (estado actual: {etiqueta_estado('SC', sc.estado)})")
    # Round 6: red de seguridad barata -- hoy ASIGNADA y PENDIENTE_CONFIRMACION ya
    # implican un asesor por construccion (ver update_solicitud/promueve_asignada y
    # create_solicitud), pero se valida explicitamente en vez de asumirlo, porque este
    # mismo endpoint es ahora tambien la base del reenvio mas abajo.
    if not sc.advisor_user_id:
        raise HTTPException(400, "La solicitud no tiene un asesor asignado.")
    if not _tiene_productos_para_cotizar(sc.productos):
        raise HTTPException(400, "Agrega al menos un producto a la solicitud antes de enviarla al cliente: "
                                 "sin productos no hay nada que confirmar ni que cotizar.")

    # H27: el canal se valida antes de revocar o crear tokens: un canal malo no cambia nada.
    canal = _canal_de_envio(body, sc.customer_email)

    from app.core.confirmation_tokens import create_confirmation_token, revoke_pending_tokens
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
    # Se leen antes del commit: despues el objeto queda expirado y leerlo abriria otra transaccion mientras el correo
    # (SMTP sincrono) sale.
    numero, destino = sc.numero, sc.customer_email
    db.commit()

    # H39: el estado ya esta guardado; ahora se intenta el correo de respaldo (siempre, sea cual sea el canal) y,
    # con su resultado a la mano, se anota el envio en la Actividad.
    correo_res = _enviar_correo_confirmacion(
        destino, f"Confirma tu solicitud {numero} - Nebulae",
        f'<p>Por favor confirma tu solicitud haciendo clic aquí: <a href="{link}">{link}</a></p>')
    descripcion = "Enlace de confirmación reenviado al cliente" if es_reenvio else "Enviada para confirmación del cliente"
    if canal:
        descripcion += f" {CANALES_ENVIO[canal]}"
    _log(db, "SC", sc.id, numero, "ESTADO_CHANGED", descripcion,
         old_estado=old_estado, new_estado="PENDIENTE_CONFIRMACION",
         user_name=body.get("user_name") or getattr(user, "email", None),
         extra_data=_extra_data_de_envio(canal, correo_res))

    return {"status": "success", "data": _sc_dict(sc), "link_confirmacion": link, "canal": canal, "correo": correo_res}


def _exigir_sin_documentos_activos(db: Session, sc: CustomerRequest) -> None:
    """N7: una SC no tiene dos cotizaciones activas (una RECHAZADA no cuenta; una VENCIDA si) ni otra cotizacion con un
    pedido vigente: 400 con el documento que lo impide. Lo usan confirmar_solicitud, create_cotizacion (con sc_id) y
    /cotizar-sin-confirmacion, siempre con la SC ya bloqueada (with_for_update): dos pedidos simultaneos no crean dos COT
    ahora que la marca gate1 ya no se consume."""
    cots_activas, pvens_activos = _documentos_activos_de_solicitud(db, sc.id)
    if cots_activas:
        raise HTTPException(400, f"Esta solicitud ya tiene la cotización {cots_activas[-1].numero} activa; no se "
                                 f"puede crear otra. Si el cliente no la aceptó, márcala como Rechazada y vuelve a "
                                 f"intentarlo.")
    if pvens_activos:
        raise HTTPException(400, f"Esta solicitud ya tiene el pedido de venta {pvens_activos[-1].numero} activo; no "
                                 f"se puede crear otra cotización.")


_SIN_PRODUCTOS_PARA_COTIZAR = ("La solicitud no tiene productos para cotizar. Agrégalos en la solicitud y vuelve a "
                               "enviársela al cliente para que la confirme.")


def _exigir_productos_para_cotizar(sc: CustomerRequest) -> None:
    """400 si la SC no tiene productos: la cotizacion saldria vacia. Lo usan confirmar_solicitud y
    /cotizar-sin-confirmacion (mismo texto)."""
    if not _tiene_productos_para_cotizar(sc.productos):
        raise HTTPException(400, _SIN_PRODUCTOS_PARA_COTIZAR)


def _crear_cotizacion_desde_solicitud(db: Session, sc: CustomerRequest, cotizador: Optional[str],
                                      user_name: Optional[str]) -> SalesQuotation:
    """La COT en Borrador de una SC (R21: lo que hacia confirmar_solicitud): numero de la secuencia, datos del cliente y
    productos de la SC, y la fecha de entrega segun su modalidad, que tambien queda en la SC. Sin commit: hace flush para
    que la COT tenga id (los renglones de la Actividad lo necesitan) y el llamador confirma todo junto. Las guardas
    (Gate 1 o la excepcion con motivo, documentos activos) son del llamador."""
    ahora = datetime.datetime.utcnow()
    dias = DIAS_ENTREGA_DEFAULT.get(sc.modalidad_entrega, DIAS_ENTREGA_DEFAULT["NORMAL"])
    entrega_est = ahora + datetime.timedelta(days=dias)
    sc.fecha_entrega_estimada = entrega_est
    sc.updated_at = ahora
    cot = SalesQuotation(
        numero=_gen_numero(db, "COT-", "seq_cot"),
        sc_id=sc.id,
        sc_numero=sc.numero,
        customer_id=sc.customer_id,
        customer_name=sc.customer_name,
        customer_phone=sc.customer_phone,
        customer_email=sc.customer_email,
        customer_address=sc.customer_address,
        cotizador=cotizador,
        estado="BORRADOR",
        productos=sc.productos or [],
        fecha_entrega_estimada=entrega_est,
        created_by=user_name,
    )
    db.add(cot)
    db.flush()
    return cot


def _ultima_cotizacion_rechazada(db: Session, sc_id: int) -> Optional[str]:
    """N7: el numero de la ultima COT rechazada de la SC (la que reemplaza una COT nueva), o None."""
    fila = (db.query(SalesQuotation.numero)
            .filter(SalesQuotation.sc_id == sc_id, SalesQuotation.estado == "RECHAZADA")
            .order_by(SalesQuotation.id.desc()).first())
    return fila.numero if fila else None


def _log_cotizacion_creada_en_solicitud(db: Session, sc: CustomerRequest, cot: SalesQuotation, rechazada: Optional[str],
                                        autor: Optional[str]) -> None:
    """U15: crear la COT no cambia el estado de la SC; su Actividad lo cuenta con un renglon propio, sin old/new
    (COTIZACION_CREADA), que dice a cual rechazada reemplaza (N7). Lo escriben confirmar_solicitud y, revision final
    (B3), POST /cotizaciones con sc_id. Sin commit: va en el commit unico del llamador, con la COT."""
    reemplaza = f" (reemplaza a la cotización rechazada {rechazada})" if rechazada else ""
    _log(db, "SC", sc.id, sc.numero, "COTIZACION_CREADA",
         f"Cotización {cot.numero} creada desde esta solicitud{reemplaza}", user_name=autor, commit=False)


@router.post("/solicitudes/{sc_id}/confirmar")
def confirmar_solicitud(sc_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Crea la Cotizacion de una SC confirmada por el cliente (Gate 1). U15: la SC se queda en CONFIRMADA (cuenta solo
    su propia historia; el avance se ve en la cotizacion) y su Actividad registra COTIZACION_CREADA."""
    # Final whole-branch review (hallazgo #5): .with_for_update() -- sin esto, dos
    # requests concurrentes podian pasar ambos el chequeo del marcador (lectura sin
    # bloqueo) y crear dos Cotizaciones distintas desde UNA sola confirmacion del
    # cliente. Mismo patron que convertir_cotizacion_a_venta (Gate 2) ya usa desde el
    # principio -- Gate 1 nunca tuvo este endurecimiento.
    _exigir_cotizador_que_quepa(body.get("cotizador"))  # T11 calidad (A1): antes de leer nada y de gastar un numero
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).with_for_update().first()
    if not sc:
        raise HTTPException(404, "Solicitud no encontrada")
    if sc.estado != "CONFIRMADA":
        raise HTTPException(400, f"No se puede confirmar en estado {etiqueta_estado('SC', sc.estado)}")
    # Gate 1, segunda capa (Round 4; N7; U15): la SC se queda CONFIRMADA al crear la COT, la
    # sincronizacion la pone en CONFIRMADA cuando el cliente confirma su Cotizacion, y rechazar la
    # unica COT activa la deja en CONFIRMADA para crearle otra. Por eso no se crea otra COT mientras
    # haya una activa (una RECHAZADA no cuenta; una VENCIDA si) o un pedido vigente. Junto con el
    # with_for_update de arriba, esto es lo que impide el duplicado ahora que la marca ya no se
    # consume. U11: tambien cubre la COT creada antes de la confirmacion (/cotizar-sin-confirmacion).
    _exigir_sin_documentos_activos(db, sc)
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
    _exigir_productos_para_cotizar(sc)

    # U15: la solicitud se queda CONFIRMADA (ya no pasa a COTIZADA): el avance de la cotizacion se ve en la propia
    # cotizacion y en la barra Solicitud -> Cotizacion -> Pedido.
    # N7: si la COT nueva reemplaza a una rechazada, su Actividad lo dice (la ultima rechazada).
    rechazada = _ultima_cotizacion_rechazada(db, sc.id)

    # Final whole-branch review (hallazgo #5): los cambios de la SC (fecha de entrega) se
    # consolidan en el MISMO commit que crea la COT (no son dos commits separados). Mismo
    # patron que convertir_cotizacion_a_venta (Gate 2).
    # B2 (revision final): como /cotizar-sin-confirmacion, la COT y sus dos renglones (COTIZACION_CREADA de la SC y
    # CREATED de la COT) van en ESE unico commit (C8: ya no queda una COT sin su rastro si un renglon falla), y el autor
    # sale de la sesion (nombre_de_usuario), nunca del body: un user_name que no es texto ya no gasta un numero de
    # seq_cot con un 500.
    autor = nombre_de_usuario(user)
    cot = _crear_cotizacion_desde_solicitud(db, sc, body.get("cotizador", sc.advisor_name), autor)
    _log_cotizacion_creada_en_solicitud(db, sc, cot, rechazada, autor)
    _log(db, "COT", cot.id, cot.numero, "CREATED",
         (f"Cotización {cot.numero} creada desde {sc.numero} (reemplaza a la cotización rechazada {rechazada})"
          if rechazada else f"Cotización {cot.numero} creada desde {sc.numero}"),
         new_estado="BORRADOR", user_name=autor, commit=False)
    db.commit()
    db.refresh(cot)

    return {"status": "success", "data": {"sc": _sc_dict(sc), "cotizacion": _cot_dict(cot)}}


# U11: limites del motivo de /cotizar-sin-confirmacion. El frontend espeja los dos (MOTIVO_SIN_CONFIRMACION_MIN y
# MOTIVO_SIN_CONFIRMACION_MAX de frontend/src/lib/estados-solicitud.js; test_estados_solicitud compara los valores).
MOTIVO_SIN_CONFIRMACION_MIN = 10
MOTIVO_SIN_CONFIRMACION_MAX = 500
# S5 (T11): ademas, al menos estas letras o digitos: diez puntos o diez caracteres invisibles no explican nada. T11
# calidad (D1): el frontend lo espeja (motivoLimpio y errorMotivoSinConfirmacion de estados-solicitud.js;
# test_estados_solicitud compara los dos con node).
MOTIVO_SIN_CONFIRMACION_MIN_LETRAS = 5
# S5: rellenos Hangul (U+115F, U+1160, U+3164 y U+FFA0) y, T11 calidad (F3), los jeroglificos egipcios en blanco
# (U+13441 FULL BLANK y U+13442 HALF BLANK). Unicode los clasifica como letras (isalnum), pero no se ven. El frontend
# usa la misma lista (RELLENOS_INVISIBLES de estados-solicitud.js, que la prueba lee de aqui).
_RELLENOS_INVISIBLES = frozenset("\u115f\u1160\u3164\uffa0\U00013441\U00013442")
# Largo de la columna sales_quotations.cotizador (String(150)): mas largo seria un 500 con un numero ya gastado.
COTIZADOR_MAX = 150


def _exigir_cotizador_que_quepa(cotizador) -> None:
    """422 si el cotizador no se puede guardar: un valor que no es None ni texto, un texto con U+0000 o un surrogate
    suelto (psycopg2 no los guarda: 500) -> «El cotizador no es válido.»; o mas largo que su columna. Las tres puertas
    que crean una COT (confirmar_solicitud, /cotizar-sin-confirmacion y POST /cotizaciones) lo llaman ANTES de pedir
    el numero de seq_cot (T11 calidad, A1 y ronda 1), y PATCH /cotizaciones cuando el body trae el cotizador."""
    if cotizador is None:
        return
    if not isinstance(cotizador, str) or any(ch == "\x00" or unicodedata.category(ch) == "Cs" for ch in cotizador):
        raise HTTPException(422, "El cotizador no es válido.")
    if len(cotizador) > COTIZADOR_MAX:
        raise HTTPException(422, f"El cotizador no puede tener más de {COTIZADOR_MAX} caracteres.")

# U11: estados en que una SC sin la confirmacion vigente del cliente se puede cotizar con motivo (CONFIRMADA solo si
# _confirmacion_vigente_sc es falso: confirmada por su cotizacion, sin la marca gate1).
_ESTADOS_SC_COTIZABLES_SIN_CONFIRMACION = ("ASIGNADA", "PENDIENTE_CONFIRMACION", "CONFIRMADA")
# C7/R11 y el ruling T3-3: lo que responden las otras puertas (POST /cotizaciones, PATCH sc_id) a una SC sin confirmar.
_SC_SIN_CONFIRMAR = ("no ha sido confirmada por el cliente: usa «Cotizar» en la solicitud para crear la cotización con "
                     "el motivo.")


def _motivo_limpio(texto: str) -> str:
    """S5 (T11): el motivo de la excepcion a Gate 1 tal como se mide y se guarda. NFKC; sin caracteres de formato (Cf:
    U+200B, U+00AD, U+FEFF...) ni de control (Cc) ni rellenos Hangul; cualquier espacio o salto de linea (Zs, Zl, Zp,
    tabuladores) cuenta como un espacio, los seguidos quedan en uno y se quitan los de los bordes. Un salto de linea no
    pega las palabras vecinas: se vuelve un espacio en vez de desaparecer. B2.1 T2 r1: tampoco surrogates sueltos (Cs,
    U+D800-U+DFFF, de un JSON escrito a mano): psycopg2 no los puede guardar y el POST o el PATCH daban 500."""
    partes = []
    for ch in unicodedata.normalize("NFKC", texto):
        if ch.isspace():
            partes.append(" ")
        elif unicodedata.category(ch) not in ("Cf", "Cc", "Cs", "Zl", "Zp") and ch not in _RELLENOS_INVISIBLES:
            partes.append(ch)
    return re.sub(" {2,}", " ", "".join(partes)).strip()


def _error_del_motivo(motivo: str) -> Optional[str]:
    """El 422 del motivo de /cotizar-sin-confirmacion ya limpio (_motivo_limpio), o None si sirve: menos de
    MOTIVO_SIN_CONFIRMACION_MIN caracteres, mas de MOTIVO_SIN_CONFIRMACION_MAX o, con el largo bien, menos de
    MOTIVO_SIN_CONFIRMACION_MIN_LETRAS letras o digitos (T11 calidad, D1: ese caso dice lo que falta, no el minimo de
    caracteres). El frontend lo espeja con los mismos textos (errorMotivoSinConfirmacion de estados-solicitud.js)."""
    if len(motivo) < MOTIVO_SIN_CONFIRMACION_MIN:
        return f"El motivo debe tener al menos {MOTIVO_SIN_CONFIRMACION_MIN} caracteres."
    if len(motivo) > MOTIVO_SIN_CONFIRMACION_MAX:
        return f"El motivo no puede tener más de {MOTIVO_SIN_CONFIRMACION_MAX} caracteres."
    if sum(ch.isalnum() for ch in motivo) < MOTIVO_SIN_CONFIRMACION_MIN_LETRAS:
        return f"El motivo debe tener al menos {MOTIVO_SIN_CONFIRMACION_MIN_LETRAS} letras o números."
    return None


# T11 calidad (F8): el 400 de una SC de Soporte en /cotizar-sin-confirmacion (y el primer impedimento de la puerta B).
_SOPORTE_NO_SE_COTIZA = "Las solicitudes de Soporte Técnico no se cotizan."


def _es_soporte(sc: CustomerRequest) -> bool:
    return sc.tipo_solicitud == "Soporte Tecnico" or sc.estado == "N/A_SOPORTE"


def _impedimento_para_cotizar_sin_confirmacion(sc: CustomerRequest) -> Optional[str]:
    """Lo que hoy impide cotizar la SC sin la confirmacion del cliente (U11), sin contar la Papelera, la confirmacion
    vigente ni los documentos activos (cada llamador los revisa a su modo): Soporte, sin asesor, un estado que no se
    cotiza asi o sin productos. Devuelve el texto del 400 de /cotizar-sin-confirmacion, o None si se puede. Lo usan ese
    endpoint y, S4 (T11), la excepcion de la puerta B al retomar una COT temprana rechazada."""
    if _es_soporte(sc):
        return _SOPORTE_NO_SE_COTIZA
    if sc.estado == "BORRADOR" or not sc.advisor_user_id:
        return "Asigna un asesor a la solicitud antes de cotizarla."
    if sc.estado not in _ESTADOS_SC_COTIZABLES_SIN_CONFIRMACION:
        return f"No se puede cotizar sin confirmación una solicitud en estado {etiqueta_estado('SC', sc.estado)}."
    if not _tiene_productos_para_cotizar(sc.productos):
        return _SIN_PRODUCTOS_PARA_COTIZAR
    return None


@router.post("/solicitudes/{sc_id}/cotizar-sin-confirmacion")
def cotizar_sin_confirmacion(sc_id: int, body: CotizarSinConfirmacionBody,
        user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    """U11: la UNICA excepcion auditada a Gate 1. Crea la COT (Borrador) de una SC que el cliente todavia no confirma,
    con motivo obligatorio. Queda registrada en la COT (sin_confirmacion_sc_at / _motivo) y en la Actividad de la SC
    (COTIZADA_SIN_CONFIRMACION) y de la COT (CREATED), con el autor de la sesion (R9: nunca del body).

    NO toca sc.estado ni gate1_confirmed_at y no revoca el enlace pendiente de la SC: el cliente puede confirmarla
    despues (confirmar_via_token conserva esta COT) o confirmar la COT (la sincronizacion de U15 confirma la SC). El
    pedido sigue exigiendo Gate 2 y el anticipo. Un solo commit (C8); el lead del CRM va en un savepoint.
    S5 (T11): el motivo se mide y se guarda limpio (_motivo_limpio) y necesita al menos 5 letras o digitos."""
    motivo = _motivo_limpio(body.motivo or "")
    error_del_motivo = _error_del_motivo(motivo)
    if error_del_motivo:
        raise HTTPException(422, error_del_motivo)
    cotizador = _texto_o_none(body.cotizador)
    _exigir_cotizador_que_quepa(cotizador)
    # Bloqueada como en confirmar_solicitud: dos pedidos simultaneos (o este y la confirmacion del cliente) no crean
    # dos COT.
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).with_for_update().first()
    if not sc:
        raise HTTPException(404, "Solicitud no encontrada")
    # Mismo orden de siempre: Soporte, Papelera, confirmacion vigente, y despues asesor, estado y productos.
    impedimento = _impedimento_para_cotizar_sin_confirmacion(sc)
    if _es_soporte(sc):
        raise HTTPException(400, _SOPORTE_NO_SE_COTIZA)
    if sc.estado == "CANCELADA":
        raise HTTPException(409, _mensaje_solicitud_cancelada(sc, "cotizarla"))
    if _confirmacion_vigente_sc(sc):
        raise HTTPException(409, "El cliente ya confirmó esta solicitud: usa «Crear Cotización».")
    if impedimento is not None:
        raise HTTPException(400, impedimento)
    _exigir_sin_documentos_activos(db, sc)

    autor = nombre_de_usuario(user)
    cot = _crear_cotizacion_desde_solicitud(db, sc, cotizador or sc.advisor_name, autor)
    cot.sin_confirmacion_sc_at = datetime.datetime.utcnow()
    cot.sin_confirmacion_sc_motivo = motivo
    estado_sc = etiqueta_estado("SC", sc.estado)
    _log(db, "SC", sc.id, sc.numero, "COTIZADA_SIN_CONFIRMACION",
         f"Se procedió con la cotización {cot.numero} sin confirmación del cliente. Motivo: {motivo}",
         user_name=autor,
         extra_data={"cot_id": cot.id, "cot_numero": cot.numero, "motivo": motivo, "estado_solicitud": sc.estado,
                     "cambios": [{"etiqueta": "Motivo", "despues": motivo},
                                 {"etiqueta": "Estado de la solicitud", "despues": estado_sc}]},
         commit=False)
    _log(db, "COT", cot.id, cot.numero, "CREATED",
         f"Cotización {cot.numero} creada desde {sc.numero} sin confirmación del cliente",
         new_estado="BORRADOR", user_name=autor,
         extra_data={"sin_confirmacion": True, "cambios": [{"etiqueta": "Motivo", "despues": motivo}]},
         commit=False)
    # Como create_cotizacion: el lead pasa a QUOTATION. En un savepoint (patron de cancelar/restaurar): si falla, solo
    # se deshace lo del lead y queda en el log; la COT y sus renglones se guardan igual.
    _lead_en_savepoint(db, f"mover a cotización el lead de la solicitud {sc.numero}",
                       lambda: mover_lead_de_solicitud(sc.id, "QUOTATION", db, commit=False))
    db.commit()
    return {"status": "success", "data": {"sc": _sc_dict(sc), "cotizacion": _cot_dict(cot)}}


@router.post("/solicitudes/{sc_id}/actividad")
def add_sc_activity(sc_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "Solicitud no encontrada")
    return _agregar_nota(db, "SC", sc, body, user)


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
    # COT-LISTA: los pedidos de cada cotizacion (version ligera: id, numero y estado, del mas viejo al mas nuevo), con
    # una sola consulta para toda la pagina. Con eso la lista distingue una COT confirmada con pedido vigente de una
    # cuyo pedido se cancelo (el detalle trae el pedido completo).
    ids = [c.id for c in items]
    pvs_por_cot = {}
    if ids:
        for v_id, v_num, v_est, v_cot in (db.query(SaleOrder.id, SaleOrder.numero, SaleOrder.estado, SaleOrder.cot_id)
                                          .filter(SaleOrder.cot_id.in_(ids)).order_by(SaleOrder.id.asc())):
            pvs_por_cot.setdefault(v_cot, []).append({"id": v_id, "numero": v_num, "estado": v_est})
    return {"status": "success", "total": total,
            "data": [{**_cot_dict(c), "pedidos_venta": pvs_por_cot.get(c.id, [])} for c in items]}


@router.post("/cotizaciones", status_code=201)
def create_cotizacion(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    _validar_precios_productos(body.get("productos") or [])
    _exigir_cotizador_que_quepa(body.get("cotizador"))  # T11 calidad (A1)
    # H42: la cabecera se guarda en pesos enteros (antes de gastar un numero de la secuencia).
    subtotal_cop = _monto_en_pesos(body.get("subtotal_cop"), "subtotal_cop")
    total_cop = _monto_en_pesos(body.get("total_cop"), "total_cop")
    anticipo_cop = _monto_en_pesos(body.get("anticipo_cop"), "anticipo_cop")
    entrega_est = None
    if body.get("dias_entrega"):
        entrega_est = datetime.datetime.utcnow() + datetime.timedelta(days=body["dias_entrega"])

    sc_id = _sc_id_del_body(body.get("sc_id"))
    sc = None
    sc_numero = body.get("sc_numero")
    customer_id = body.get("customer_id")
    customer_name = body.get("customer_name")
    customer_phone = body.get("customer_phone")
    customer_email = body.get("customer_email")
    customer_address = body.get("customer_address")
    if sc_id is not None:
        # La Solicitud de Cliente es la fuente autoritativa de estos datos.
        # No confiar en lo que mande el body para ellos: si el llamador (ej.
        # Cotizador Rapido en /dashboard/cotiza) manda sc_id pero omite
        # sc_numero/customer_name, antes quedaban vacios para siempre y el
        # chip "Origen" terminaba mostrando el id crudo (SC-8) en vez del
        # numero real (SC-20260317). Ver confirmar_solicitud() arriba, que
        # ya hacia esto bien por tener el objeto SC en memoria.
        # C7/R11: bloqueada (dos POST simultaneos no crean dos COT) y todas las guardas ANTES de _gen_numero (un
        # rechazo no gasta un numero de la secuencia).
        sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).with_for_update().first()
        if sc is None:
            # Antes seguia con los datos del body y fallaba en el FK con el numero ya gastado (500).
            raise HTTPException(422, "La solicitud indicada no existe.")
        sc_numero = sc.numero
        customer_id = sc.customer_id
        customer_name = sc.customer_name
        customer_phone = sc.customer_phone
        customer_email = sc.customer_email
        customer_address = sc.customer_address
        if sc.estado == "CANCELADA":
            # N4: una SC cancelada no tiene cotizaciones vivas.
            raise HTTPException(409, _mensaje_solicitud_cancelada(sc, "crearle una cotización"))
        # N7 (nuevo en este endpoint): ni una segunda COT activa ni otra COT con un pedido vigente.
        _exigir_sin_documentos_activos(db, sc)
        # C7: Gate 1. Sin la confirmacion vigente del cliente la unica puerta es /cotizar-sin-confirmacion, con su motivo
        # y su registro (aqui no se acepta motivo_sin_confirmacion: si llega, se ignora).
        if not _confirmacion_vigente_sc(sc):
            raise HTTPException(409, f"Esta solicitud {_SC_SIN_CONFIRMAR}")

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
    if sc is not None:
        # B3 (revision final): la Actividad de la SC cuenta esta COT con el mismo renglon de confirmar_solicitud
        # (COTIZACION_CREADA, autor de la sesion), en el MISMO commit que la crea.
        _log_cotizacion_creada_en_solicitud(db, sc, cot, _ultima_cotizacion_rechazada(db, sc.id), nombre_de_usuario(user))
    db.commit()
    db.refresh(cot)
    if cot.sc_id:
        mover_lead_de_solicitud(cot.sc_id, "QUOTATION", db)
    _log(db, "COT", cot.id, cot.numero, "CREATED",
         f"Cotización {cot.numero} creada",
         new_estado="BORRADOR", user_name=body.get("created_by"))
    return {"status": "success", "data": _cot_dict(cot)}


@router.get("/cotizaciones/{cot_id}")
def get_cotizacion(cot_id: int, user: User = Depends(require_roles(*ALL_ERP_ROLES)),
        db: Session = Depends(get_db)):
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).first()
    if not cot:
        raise HTTPException(404, "Cotización no encontrada")
    # Los renglones de un mismo commit (S6: re-cotizar y anular la confirmacion) pueden compartir created_at: el id
    # conserva el orden causal, como en get_solicitud y get_pedido.
    logs = db.query(ActivityLog).filter(
        ActivityLog.entity_type == "COT",
        ActivityLog.entity_id == cot_id
    ).order_by(ActivityLog.created_at.asc(), ActivityLog.id.asc()).all()
    d = _cot_dict(cot)
    rol = normalize_role(user.role)
    d["actividades"] = [_log_dict(l, rol) for l in logs]
    # linked VEN (H46: en orden de creacion, para que el frontend tome el ultimo vigente o cancelado)
    vens = db.query(SaleOrder).filter(SaleOrder.cot_id == cot_id).order_by(SaleOrder.id.asc()).all()
    d["pedidos_venta"] = [_ven_dict(v) for v in vens]
    # La SC vinculada se lee UNA vez: la necesitan el anticipo (su modalidad de pago) y la nota (H35+H48).
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == cot.sc_id).first() if cot.sc_id else None
    # H35+H48: la nota ACTUAL de la solicitud, aparte de cot.notas (nunca se copia: asi cambia si la SC cambia y
    # funciona sin backfill). Solo en el detalle (no en _cot_dict) para no hacer una consulta por fila en el listado.
    d["sc_notas"] = _texto_o_none(sc.notas) if sc is not None else None
    # U11 (C9): estado de la SC y si el cliente la confirmo (Gate 1 vigente), con esa misma lectura. El aviso de una COT
    # creada sin confirmacion se muestra mientras la SC no este confirmada. None si la COT no tiene SC.
    d["sc_estado"] = sc.estado if sc is not None else None
    d["sc_confirmacion_vigente"] = _confirmacion_vigente_sc(sc) if sc is not None else None
    # Anticipo (H36+H43, N1, R3, R6): lo mismo que exigira convertir_cotizacion_a_venta. Solo en el detalle (no en
    # _cot_dict) para no hacer una consulta por fila en el listado.
    pct, modalidad, _, requerido = anticipo_cotizacion(cot, db, sc=sc)
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
    # U19+U21 (C10): el anticipo de cada producto, lista paralela a d['productos'] (mismo orden). Reparte el mismo numero
    # que muestra TOTALES: con un pedido vigente (el mas nuevo no cancelado, el criterio de _pven_vigente_de_cotizacion
    # sobre `vens`, sin otra consulta) el requerido de ESE pedido; si no, el de la cotizacion. No va dentro de cada
    # producto (el PATCH de la calculadora reenvia productos y quedaria guardado, viejo) ni en _cot_dict (el listado).
    pven = next((v for v in reversed(vens) if v.estado != "CANCELADO"), None)
    objetivo = anticipo_del_pedido(pven)[0] if pven is not None else requerido
    d["anticipo_por_linea"] = [float(a) for a in repartir_anticipo_por_linea(
        [monto_linea(p) for p in (cot.productos or [])], objetivo)]
    return {"status": "success", "data": d}


def _sincronizar_estado_solicitud_desde_cotizacion(cot: "SalesQuotation", db: Session,
                                                   user_name: Optional[str] = None) -> None:
    """U15: la SC cuenta solo su propia historia y ya NO refleja el estado de su cotizacion. Solo dos estados de la COT
    la tocan:

    - CONFIRMADA (el cliente confirmo la cotizacion): una SC sin confirmar (Nueva, Asignada, Pendiente por
      confirmacion) o en un estado heredado pasa a CONFIRMADA SIN tocar gate1_confirmed_at (esa marca solo la pone el
      enlace de la SC, asi que confirmar_solicitud sigue sin poder crear otra COT) y se anula su enlace pendiente. B7
      (revision final): no si la COT es de otro cliente (_es_documento_de_otro_cliente): la SC no cambia.
    - RECHAZADA (N7 adaptada, R21, R29): con otra COT activa o un pedido vigente no se toca. Una SC CONFIRMADA sin la
      marca o en un estado que no es un paso de la SC (heredado, o ajeno como 'ENTREGADO' del Hub viejo) sale de ahi:
      CONFIRMADA si conserva la marca; si no, ASIGNADA (BORRADOR sin asesor), con ESTADO_CHANGED, el texto de N7 y su
      enlace pendiente anulado. En los demas casos el estado no cambia y la Actividad lo anota con
      COTIZACION_RECHAZADA (sin old/new) y un texto segun el estado de la SC.

    Cualquier otro estado de la COT (BORRADOR, ENVIADA, PENDIENTE_CONFIRMACION, VENCIDA) no toca la SC: crear, enviar,
    re-cotizar, reabrir por un pedido cancelado (H46) o vincular una COT en Borrador no cambian la solicitud.
    N4: una SC CANCELADA nunca se revive; una de Soporte tampoco se toca.
    C8: un solo commit, y solo si algo cambio (_log y revoke_pending_tokens con commit=False)."""
    if not cot.sc_id or cot.estado not in ("CONFIRMADA", "RECHAZADA"):
        return
    sc = (db.query(CustomerRequest).filter(CustomerRequest.id == cot.sc_id)
          .populate_existing().with_for_update().first())
    if sc is None or sc.estado in ("CANCELADA", "N/A_SOPORTE"):
        return
    old_estado = sc.estado
    if cot.estado == "CONFIRMADA":
        if sc.estado == "CONFIRMADA":
            return
        # B7 (revision final, residual F2): una COT de otro cliente (la temprana conserva el cliente anterior si la SC
        # cambio de cliente despues) no confirma la SC del cliente nuevo: esa confirmacion es de otra persona.
        if _es_documento_de_otro_cliente(cot, sc):
            return
        from app.core.confirmation_tokens import revoke_pending_tokens
        sc.estado = "CONFIRMADA"
        sc.updated_at = datetime.datetime.utcnow()
        revoke_pending_tokens(db, "SC", sc.id, commit=False)
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED",
             f"La solicitud queda confirmada: el cliente confirmó la cotización {cot.numero}",
             old_estado, "CONFIRMADA", user_name or "Cliente (confirmación por link)", commit=False)
        db.commit()
        return
    cots_activas, pvens_activos = _documentos_activos_de_solicitud(db, sc.id)
    if any(c.id != cot.id for c in cots_activas) or pvens_activos:
        return
    rechazada = f"La cotización {cot.numero} fue rechazada."
    lista_para_otra = f"{rechazada} La solicitud sigue activa: ya puedes crearle una nueva cotización."
    if sc.estado not in PASOS_SC or (sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at is None):
        # R29 (y N7 para CONFIRMADA sin la marca): no se queda en un estado que ya no se asigna (heredado, o ajeno como
        # 'ENTREGADO', que B1 tambien normalizaba: R28) ni "confirmada" sin una confirmacion que valga para crear otra
        # cotizacion. CANCELADA y N/A_SOPORTE ya salieron arriba.
        from app.core.confirmation_tokens import revoke_pending_tokens
        if sc.gate1_confirmed_at is not None:
            sc.estado, texto = "CONFIRMADA", lista_para_otra
        else:
            sc.estado = _estado_tras_reinicio(sc)  # B1 (revision final): la regla unica de Gate 1
            texto = (f"{rechazada} La solicitud sigue activa; para crearle otra cotización, reenvíasela al cliente "
                     f"para que la confirme.")
        revoke_pending_tokens(db, "SC", sc.id, commit=False)  # defensa, como el script de ajuste
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED", texto, old_estado, sc.estado, user_name, commit=False)
    else:
        reenviar = f"{rechazada} La solicitud sigue activa: envíasela al cliente para que la confirme o cotízala de nuevo."
        textos = {
            "BORRADOR": reenviar,  # R21: nunca se le envio al cliente
            "ASIGNADA": reenviar,
            "PENDIENTE_CONFIRMACION": f"{rechazada} La solicitud sigue esperando la confirmación del cliente.",
            "CONFIRMADA": lista_para_otra,  # con la confirmacion del cliente vigente
        }
        _log(db, "SC", sc.id, sc.numero, "COTIZACION_RECHAZADA", textos[sc.estado], user_name=user_name,
             commit=False)
    sc.updated_at = datetime.datetime.utcnow()
    db.commit()


def _reabrir_cotizacion_por_pven_cancelado(db: Session, so: SaleOrder, user_name: Optional[str]) -> None:
    """H46+U25: al cancelar un Pedido de Venta (PATCH de la pantalla o POST /pedidos/{id}/cancelar), su COT vuelve de
    CONFIRMADA a BORRADOR para ajustarla, reenviarsela al cliente y crear otro pedido -- salvo que la COT tenga otro
    pedido vigente. Revoca el enlace pendiente y limpia gate2 (la confirmacion era para el pedido cancelado); la SC no
    cambia de estado (U15: la sincronizacion no la toca por una COT en Borrador) y el lead pasa a QUOTATION. Se llama
    DESPUES del commit de la cancelacion y nunca la hace fallar: un error aqui se registra y se revierte solo lo suyo."""
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


def _validar_cambio_de_estado_cotizacion(db: Session, cot: SalesQuotation, nuevo) -> bool:
    """Bloque UNICO de guardas del cambio de estado por PATCH (choque N5/H46/N4/N7/H50, R12), ANTES de tocar nada.
    Solo se evalua si el body trae un estado distinto del actual (reenviar el mismo estado nunca falla). En orden:
    (1) 400 CONFIRMADA / PENDIENTE_CONFIRMACION; (2) H50: 400 ENVIADA o un estado que no es manual; (3) 409 con un
    pedido vigente; (4) N4: 409 si la SC esta cancelada (salvo para rechazarla); (5) N7: 409 al retomar una RECHAZADA
    cuando la SC ya tiene otra COT activa; (6) U11: 409 al retomarla (a Borrador o a Vencida) si la SC no tiene la
    confirmacion vigente del cliente, salvo que la COT se haya creado sin confirmacion en esa misma SC y (S4, T11) la SC
    se pueda cotizar hoy sin confirmacion (_impedimento_para_cotizar_sin_confirmacion: no es Soporte, tiene asesor, un
    estado que se cotiza asi y productos).
    Devuelve True si el cambio se acepta por esa excepcion (S4: el renglon del cambio lleva el autor de la sesion). Con
    True, update_cotizacion revisa enseguida, antes de tocar nada, si la marca es de un ciclo anterior (B2.1, D6:
    _motivo_nuevo_para_retomar).
    S1 (T11): update_cotizacion ya rechazo con 422 un estado vacio o que no es texto (_exigir_estado_valido); None aqui
    es que el body no trae estado."""
    if nuevo is None or nuevo == cot.estado:
        return False
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
        return False
    retoma = cot.estado == "RECHAZADA"
    consulta = db.query(CustomerRequest).filter(CustomerRequest.id == cot.sc_id)
    # Retomar una RECHAZADA bloquea la SC, igual que confirmar_solicitud: los dos no pueden dejar dos COT activas.
    sc = (consulta.with_for_update() if retoma else consulta).first()
    if sc is None:
        return False
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
        # (6) U11 (ronda 1 de T3, puerta B): retomarla la deja activa en la SC, como crear una COT. Sin la confirmacion
        # vigente del cliente solo se permite si la COT se creo sin confirmacion (con su motivo) en ESTA SC: la marca se
        # limpia cuando la COT cambia de solicitud (update_cotizacion), asi que si la tiene es de esta SC.
        if not _confirmacion_vigente_sc(sc):
            if cot.sin_confirmacion_sc_at is None:
                raise HTTPException(409, f"La solicitud {sc.numero} no tiene la confirmación del cliente vigente: "
                                         f"envíasela para que la confirme, o usa «Cotizar» en la solicitud con el "
                                         f"motivo.")
            # S4 (T11): la marca sola no basta. La SC tiene que poder cotizarse HOY sin confirmacion (como en
            # /cotizar-sin-confirmacion): una SC sin asesor, de Soporte, sin productos o en un estado heredado no.
            impedimento = _impedimento_para_cotizar_sin_confirmacion(sc)
            if impedimento is not None:
                raise HTTPException(409, f"No se puede retomar la cotización {cot.numero}: la solicitud {sc.numero} no "
                                         f"tiene la confirmación del cliente vigente y hoy no se podría cotizar sin "
                                         f"ella. {impedimento}")
            return True
    return False


# B2.1 (D6): el 409 de retomar una COT temprana cuya marca es de un ciclo anterior. El detalle de la COT abre con el la
# ventana del motivo de «Cotizar sin confirmación» y reintenta el PATCH con motivo_sin_confirmacion.
_MOTIVO_NUEVO = {"codigo": "MOTIVO_NUEVO",
                 "mensaje": "La solicitud se canceló y se restauró después de esta cotización: escribe un motivo nuevo "
                            "para retomarla sin la confirmación del cliente."}


def _motivo_nuevo_para_retomar(db: Session, cot: SalesQuotation, valor) -> Optional[str]:
    """B2.1 (D6, decision del usuario): al retomar la COT temprana por la excepcion de la puerta B, su marca
    (sin_confirmacion_sc_at) es de un ciclo anterior si la SC tiene un renglon RESTORED posterior: se cancelo y se
    restauro despues, y el motivo viejo ya no explica el ciclo nuevo. En ese caso exige el motivo nuevo del body
    (`valor`, motivo_sin_confirmacion): sin el (o null), 409 MOTIVO_NUEVO; con las reglas de S5 (_motivo_limpio y
    _error_del_motivo, un valor que no es texto cuenta como vacio), 422 legible. Devuelve el motivo limpio, o None si la
    marca es de este ciclo (entonces el motivo del body sobra y se ignora). Los dos relojes son UTC sin zona (_now del
    modelo y utcnow/_ahora_utc)."""
    restaurada_despues = db.query(ActivityLog.id).filter(
        ActivityLog.entity_type == "SC", ActivityLog.entity_id == cot.sc_id, ActivityLog.action == "RESTORED",
        ActivityLog.created_at > cot.sin_confirmacion_sc_at).first() is not None
    if not restaurada_despues:
        return None
    if valor is None:
        raise HTTPException(409, detail=_MOTIVO_NUEVO)
    motivo = _motivo_limpio(valor if isinstance(valor, str) else "")
    error_del_motivo = _error_del_motivo(motivo)
    if error_del_motivo:
        raise HTTPException(422, error_del_motivo)
    return motivo


# La COT solo cambia de solicitud fuera del ciclo de Gate 2 (sin enlace pendiente ni confirmacion del cliente).
_ESTADOS_COT_CAMBIO_DE_SOLICITUD = ("BORRADOR", "RECHAZADA")


def _leer_cambio_de_solicitud(db: Session, cot: SalesQuotation, body: dict):
    """N7, arreglo de seguridad (choque con la Ronda 6 de Gate 1): la COT ya no cambia de solicitud libremente.

    Como gate1_confirmed_at ya no se consume al crear la COT, desvincular una COT confirmada (PATCH {sc_id: null})
    dejaria la SC CONFIRMADA, con la marca y sin COT activa: POST /solicitudes/{id}/confirmar crearia otra COT sin
    que el cliente reconfirme. Por eso, si el body cambia sc_id: 422 si no es un id o la SC no existe; 409 si la COT
    no esta en Borrador o Rechazada (fuera del ciclo de Gate 2), si tiene un pedido vigente, si la SC nueva esta
    cancelada, ya tiene una COT activa o un pedido vigente, o (U11) no tiene la confirmacion vigente del cliente
    (_confirmacion_vigente_sc: para esa la unica puerta es /cotizar-sin-confirmacion). Las dos SC se bloquean en
    orden de id (dos traslados cruzados no se bloquean mutuamente). Si se acepta, devuelve (sc_anterior, sc_nueva)
    para limpiar la marca de la anterior y re-sincronizar las dos; None si sc_id no cambia (deja body['sc_id']
    normalizado a int o None)."""
    if "sc_id" not in body:
        return None
    nuevo_id = _sc_id_del_body(body.get("sc_id"))
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
        # U11 (ruling T3-3, segunda puerta de C7): vincular una COT a una SC sin la confirmacion vigente del cliente la
        # cotizaria sin motivo ni registro. Tambien una RECHAZADA: retomarla despues la dejaria activa en esa SC.
        if not _confirmacion_vigente_sc(sc_nueva):
            raise HTTPException(409, f"La solicitud {sc_nueva.numero} {_SC_SIN_CONFIRMAR}")
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
    nuevo = _estado_tras_reinicio(sc)  # B1 (revision final): la regla unica de Gate 1
    if sc.estado == nuevo:
        return None
    anterior, sc.estado = sc.estado, nuevo
    sc.updated_at = datetime.datetime.utcnow()
    return anterior


# Gate 2 (Round 2, hallazgo #5): lo que el cliente vio y confirmo (o esta por confirmar) en una COT. Si un PATCH cambia
# alguno en el ciclo vigente de Gate 2, la confirmacion ya no aplica (ver update_cotizacion). El anticipo NO esta
# (H36+H43: el cliente no lo ve).
PRICE_FREEZE_FIELDS = ["productos", "total_cop", "subtotal_cop", "descuento_pct",
                       "trm_rate", "fecha_entrega_estimada", "sc_id"]
# H40: cada campo de PRICE_FREEZE_FIELDS -> como se nombra en el aviso de ANULA_CONFIRMACION y en la Actividad. Mismo
# orden que PRICE_FREEZE_FIELDS (una prueba exige que cubra todos; si falta uno, se muestra el nombre del campo).
_ETIQUETAS_CONGELADAS = {
    "productos": "Productos, cantidades o precios", "total_cop": "Total", "subtotal_cop": "Total",
    "descuento_pct": "Descuento", "trm_rate": "TRM", "fecha_entrega_estimada": "Fecha de entrega",
    "sc_id": "Solicitud de origen",
}
# H40: largo de la razon de anular la confirmacion (motivo_recotizacion). T9A pone el mismo maxLength en el textarea.
MIN_RAZON_RECOTIZACION, MAX_RAZON_RECOTIZACION = 5, 500


def _mensaje_anula_confirmacion(estado: str, cambios: list) -> str:
    """H40: el texto del 409 ANULA_CONFIRMACION segun el estado (CONFIRMADA o PENDIENTE_CONFIRMACION)."""
    lista = ", ".join(cambios)
    if estado == "CONFIRMADA":
        return (f"El cliente ya confirmó esta cotización. Si guardas estos cambios ({lista}), su confirmación se anula: "
                f"la cotización vuelve a Borrador y tendrás que enviársela de nuevo.")
    return (f"Esta cotización está esperando la confirmación del cliente. Si guardas estos cambios ({lista}), el enlace "
            f"que tiene el cliente deja de servir: la cotización vuelve a Borrador y tendrás que enviársela de nuevo.")


def _salir_de_gate2(db: Session, cot: SalesQuotation) -> None:
    """T11 calidad (F8): la COT sale del ciclo de Gate 2: se revocan sus enlaces pendientes y se limpia
    gate2_confirmed_at, para que ninguno de los dos quede vivo y reutilizable fuera de este ciclo. Sin commit: lo
    confirma el llamador (update_cotizacion, junto con lo demas)."""
    from app.core.confirmation_tokens import revoke_pending_tokens
    revoke_pending_tokens(db, "COT", cot.id, commit=False)
    cot.gate2_confirmed_at = None


@router.patch("/cotizaciones/{cot_id}")
def update_cotizacion(cot_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    _exigir_estado_valido(body)  # S1 (T11): antes de leer nada
    if "cotizador" in body:  # T11 calidad, ronda 1 (A1): 151 caracteres o U+0000 daban 500
        _exigir_cotizador_que_quepa(body["cotizador"])
    # Bloqueada: las guardas de abajo (pedido vigente, SC cancelada, otra COT activa) se validan sobre la fila que se
    # va a escribir, sin que una conversion o una confirmacion concurrente la cambie en medio.
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).with_for_update().first()
    if not cot:
        raise HTTPException(404, "Cotización no encontrada")
    # Primero el cambio de solicitud: bloquea las dos SC en orden de id antes de que la guarda 5 bloquee la actual.
    cambio_de_solicitud = _leer_cambio_de_solicitud(db, cot, body)
    retoma_sin_confirmacion = _validar_cambio_de_estado_cotizacion(db, cot, body.get("estado"))
    # B2.1 (D6): la marca de un ciclo anterior pide un motivo nuevo. No si la COT cambia de solicitud en este mismo PATCH:
    # la marca se limpia (puerta C). Si pasa a otra SC, esa ya tiene la confirmacion vigente (_leer_cambio_de_solicitud);
    # si se desvincula (sc_id: null), queda sin SC, y volver a vincularla exige esa confirmacion.
    motivo_nuevo = (_motivo_nuevo_para_retomar(db, cot, body.get("motivo_sin_confirmacion"))
                    if retoma_sin_confirmacion and cambio_de_solicitud is None else None)
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
    # Los campos congelados son PRICE_FREEZE_FIELDS (nivel del modulo).
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
    if motivo_nuevo is not None:
        # B2.1 (D6): la marca y el motivo del ciclo nuevo van en el commit de abajo, con el estado y su renglon. El
        # renglon ya cuenta el cambio del motivo (antes -> despues): que la edicion no lo repita en un UPDATED.
        motivo_anterior = cot.sin_confirmacion_sc_motivo
        cot.sin_confirmacion_sc_at = _ahora_utc()
        cot.sin_confirmacion_sc_motivo = motivo_nuevo
        antes_log["sin_confirmacion_sc_motivo"] = motivo_nuevo
    marca_anulada = False
    estado_previo_sc_anterior = None
    if cambio_de_solicitud is not None:
        # N7 (seguridad): la confirmacion del cliente de la SC anterior ya no vale para crear otra COT; se limpia en
        # este mismo commit y la SC se re-sincroniza como en un rechazo.
        sc_anterior, sc_nueva = cambio_de_solicitud
        cot.sc_numero = sc_nueva.numero if sc_nueva is not None else None
        # U11 (ronda 1 de T3, puerta C): la marca de "sin confirmacion" es de la SC donde se creo; no viaja con la COT
        # (si no, retomarla en otra SC sin confirmar pasaria la guarda (6)). El motivo anterior queda en el renglon
        # UPDATED de la COT (cambios_documento) y la auditoria completa sigue en la SC de origen y en el CREATED.
        cot.sin_confirmacion_sc_at = None
        cot.sin_confirmacion_sc_motivo = None
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
    campos_congelados_cambiados = [k for k in PRICE_FREEZE_FIELDS
                                   if _freeze_cmp(k, getattr(cot, k)) != _freeze_cmp(k, old_price_values[k])]
    hubo_cambio_de_precio = bool(campos_congelados_cambiados)
    rompe_congelamiento = precio_congelado and hubo_cambio_de_precio
    # H40 (R7): anular la confirmacion del cliente (dada o pendiente) ya no pasa sin avisar. Sin anular_confirmacion
    # responde 409 ANULA_CONFIRMACION con lo que cambio; con ella exige la razon (motivo_recotizacion, no 'motivo': esa
    # llave reemplaza el titulo del renglon de re-cotizacion en _registrar_cambios), que queda en la Actividad. Un
    # cambio de estado explicito no pregunta. db.rollback() descarta lo que este PATCH ya aplico en la sesion (nada se
    # ha confirmado: el commit viene despues).
    cambia_estado_explicito = bool(body.get("estado")) and body["estado"] != old_estado
    cambios_congelados, motivo_recotizacion = [], None
    if rompe_congelamiento and not cambia_estado_explicito:
        cambios_congelados = list(dict.fromkeys(_ETIQUETAS_CONGELADAS.get(k, k) for k in campos_congelados_cambiados))
        if body.get("anular_confirmacion") is not True:
            db.rollback()
            raise HTTPException(409, detail={
                "codigo": "ANULA_CONFIRMACION", "estado": old_estado, "cambios": cambios_congelados,
                "mensaje": _mensaje_anula_confirmacion(old_estado, cambios_congelados)})
        motivo = body.get("motivo_recotizacion")
        motivo_recotizacion = motivo.strip() if isinstance(motivo, str) else ""  # no texto = sin razon
        if len(motivo_recotizacion) < MIN_RAZON_RECOTIZACION:
            db.rollback()
            raise HTTPException(422, f"Escribe la razón del cambio (mínimo {MIN_RAZON_RECOTIZACION} caracteres): queda "
                                     f"en la Actividad de la cotización.")
        if len(motivo_recotizacion) > MAX_RAZON_RECOTIZACION:
            db.rollback()
            raise HTTPException(422, f"La razón es muy larga (máximo {MAX_RAZON_RECOTIZACION} caracteres).")
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
    # H40 + S6 (T11): anular la confirmacion del cliente por re-cotizar va en UN commit (patron C8): la COT en Borrador,
    # el renglon de los cambios, el de la razon (con el autor de la sesion, nunca body.updated_by), la revocacion del
    # enlace y gate2 en None. Antes el renglon de la razon salia en otro commit, DESPUES del de la COT, y un updated_by
    # invalido lo tumbaba con un 500 que dejaba la COT en Borrador sin razon, con gate2 puesto y el enlace vivo.
    anula_por_recotizacion = rompe_congelamiento and not cambia_estado_explicito
    recotizacion = bool(body.get("recotizacion"))
    if anula_por_recotizacion:
        # flush + refresh: la foto 'despues' de _registrar_cambios con los valores ya tipados (como update_solicitud).
        db.flush()
        db.refresh(cot)
        # "Re-Cotizar" va antes del cambio de estado que provoca, para que la linea de tiempo se lea en orden causal.
        _registrar_cambios(db, "COT", cot, antes_log, body, user, recotizacion=recotizacion, commit=False)
        # La razon que escribio el asesor; extra_data sin la llave 'campo' (CambiosDeActividad no tacha).
        razon = motivo_recotizacion if motivo_recotizacion.endswith((".", "!", "?")) else f"{motivo_recotizacion}."
        _log(db, "COT", cot.id, cot.numero, "ESTADO_CHANGED",
             "Estado cambiado a Borrador (la cotización fue editada tras la confirmación del cliente; esa confirmación "
             f"ya no es válida). Razón: {razon}",
             old_estado=old_estado, new_estado="BORRADOR", user_name=nombre_de_usuario(user),
             extra_data={"motivo": motivo_recotizacion,
                         "cambios": [{"etiqueta": "Cambió", "despues": ", ".join(cambios_congelados)},
                                     {"etiqueta": "Razón", "despues": motivo_recotizacion}]},
             commit=False)
        _salir_de_gate2(db, cot)
    if motivo_nuevo is not None:
        # B2.1 (D6): el renglon del cambio de estado nombra el motivo nuevo y va en el MISMO commit que la marca, el
        # motivo y el estado (S4: el autor es la sesion). El de abajo (cambia_estado_explicito) ya no se escribe.
        _log(db, "COT", cot.id, cot.numero, "ESTADO_CHANGED",
             f"Estado cambiado a {etiqueta_estado('COT', cot.estado)}. Motivo nuevo: {motivo_nuevo}",
             old_estado=old_estado, new_estado=cot.estado, user_name=nombre_de_usuario(user),
             extra_data={"motivo": motivo_nuevo,
                         "cambios": [{"etiqueta": "Motivo", "antes": motivo_anterior, "despues": motivo_nuevo}]},
             commit=False, usuario=user)
    db.commit()
    db.refresh(cot)
    if not anula_por_recotizacion:
        # "Re-Cotizar" (la Calculadora) manda recotizacion=true: queda registrado aunque los precios no hayan cambiado.
        _registrar_cambios(db, "COT", cot, antes_log, body, user, recotizacion=recotizacion)
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
            # B8 (revision final): sin sincronizar la SC nueva. La COT que cambia de solicitud solo puede quedar en
            # Borrador, Rechazada o Vencida (_leer_cambio_de_solicitud y la guarda de estado) y con ninguna de ellas la
            # sincronizacion hace nada (U15); una RECHAZADA, ademas, no debe reiniciar el flujo de una SC a la que no le
            # paso. Solo queda el renglon del vinculo.
            _log(db, "SC", sc_nueva.id, sc_nueva.numero, "UPDATED",
                 f"La cotización {cot.numero} se vinculó a esta solicitud.", user_name=autor, extra_data=datos_cot)
    if cambia_estado_explicito:
        try:
            # N7: rechazar ya no lleva el lead a perdido (eso pasa al cancelar la SC, N4). H50: ENVIADA ya no llega
            # por aqui; el lead pasa a QUOTATION en enviar_cotizacion_para_confirmacion.
            _sincronizar_estado_solicitud_desde_cotizacion(cot, db, body.get("updated_by"))
        except Exception as exc:
            db.rollback()
            logger.error(f"Error al sincronizar Solicitud/Lead tras actualizar cotizacion {cot.id}: {exc}", exc_info=True)
        # S4 (T11): retomar la COT temprana por la excepcion de la puerta B queda a nombre del usuario de la sesion.
        # B2.1 (D6): con un motivo nuevo el renglon ya salio en el commit de arriba.
        if motivo_nuevo is None:
            _log(db, "COT", cot.id, cot.numero, "ESTADO_CHANGED",
                 f"Estado cambiado a {etiqueta_estado('COT', cot.estado)}",
                 old_estado=old_estado, new_estado=cot.estado,
                 user_name=nombre_de_usuario(user) if retoma_sin_confirmacion else body.get("updated_by"),
                 usuario=user)  # T11 calidad, ronda 1: un autor que queda vacio al limpiarlo es el de la sesion
    elif anula_por_recotizacion:
        # El paso a BORRADOR (rompe_congelamiento sin un estado explicito en el body: el caso tipico es la Calculadora
        # mandando productos/total_cop) ya quedo en la Actividad, con su razon, en el commit de arriba. Aqui solo la
        # sincronizacion de la SC, que no hace nada con una COT en Borrador (U15).
        try:
            _sincronizar_estado_solicitud_desde_cotizacion(cot, db, body.get("updated_by"))
        except Exception as exc:
            db.rollback()
            logger.error(f"Error al sincronizar Solicitud tras romper congelamiento de precio en cotizacion {cot.id}: {exc}", exc_info=True)
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
    if sale_de_gate2 and not anula_por_recotizacion:
        # Ver el comentario junto a sale_de_gate2 arriba -- revoca cualquier token
        # pendiente y limpia la marca de procedencia, para que ninguno de los dos
        # quede vivo y reutilizable fuera de este ciclo. (Al anular por re-cotizar ya se hizo en el commit del estado.)
        _salir_de_gate2(db, cot)
        db.commit()
    # H40: en el nivel superior (no dentro de data): la pantalla avisa que hay que reenviarsela al cliente.
    return {"status": "success", "data": _cot_dict(cot), "confirmacion_anulada": bool(rompe_congelamiento)}


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
        raise HTTPException(404, "Cotización no encontrada")
    if cot.estado not in ("BORRADOR", "ENVIADA"):
        raise HTTPException(400, f"La cotización debe estar en Borrador o Enviada antes de enviar para confirmación (estado actual: {etiqueta_estado('COT', cot.estado)}).")
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

    # H27: el canal se valida despues de las guardas de estado (N4, H46) y antes de revocar o crear tokens.
    canal = _canal_de_envio(body, cot.customer_email)

    from app.core.confirmation_tokens import create_confirmation_token, revoke_pending_tokens
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
    if canal:
        cot.canal_envio = canal  # H27: en el mismo commit que el estado (ya no hay un PATCH previo del frontend)
    cot.updated_at = datetime.datetime.utcnow()
    numero, destino = cot.numero, cot.customer_email  # valores simples: se usan despues del commit sin recargar el objeto
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
    # H39: el correo de respaldo se intenta (y su resultado se conoce) antes de anotar el envio en la Actividad.
    # El refresh y la sincronizacion de arriba pueden dejar abierta una transaccion de solo lectura: se cierra con un
    # commit (inofensivo si no hay nada pendiente) para no retener la conexion de la base durante el SMTP sincrono.
    db.commit()
    correo_res = _enviar_correo_confirmacion(
        destino, f"Confirma tu cotización {numero} - Nebulae",
        f'<p>Revisa y confirma tu cotización aquí: <a href="{link}">{link}</a></p>')
    descripcion = "Enviada para confirmación del cliente"
    if canal:
        descripcion += f" {CANALES_ENVIO[canal]}"
    _log(db, "COT", cot.id, numero, "ESTADO_CHANGED", descripcion,
         old_estado=old_estado, new_estado="PENDIENTE_CONFIRMACION",
         user_name=body.get("user_name") or getattr(user, "email", None),
         extra_data=_extra_data_de_envio(canal, correo_res))

    return {"status": "success", "data": _cot_dict(cot), "link_confirmacion": link, "canal": canal, "correo": correo_res}


@router.post("/cotizaciones/{cot_id}/confirmar")
def confirmar_cotizacion(cot_id: int, body: dict = Body(default_factory=dict), user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Confirm COT -> creates canonical VEN automatically with idempotent replay"""
    from app.api.v1.erp_ventas_fase4 import convertir_cotizacion_a_venta
    from app.api.v1.schemas_fase5 import ConvertirCotizacionVentaRequest

    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).first()
    if not cot:
        raise HTTPException(404, "Cotización no encontrada")
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
            raise HTTPException(400, f"La cotización debe estar Confirmada por el cliente antes de crear el Pedido de Venta (estado actual: {etiqueta_estado('COT', cot.estado)}).")
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
        raise HTTPException(404, "Cotización no encontrada")
    return _agregar_nota(db, "COT", cot, body, user)


@router.post("/pedidos/{ven_id}/actividad")
def add_ven_activity(ven_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_COMPRAS)),
        db: Session = Depends(get_db)):
    v = db.query(SaleOrder).filter(SaleOrder.id == ven_id).first()
    if not v:
        raise HTTPException(404, "Pedido no encontrado")
    return _agregar_nota(db, "VEN", v, body, user)



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
    # H47: el resumen cubre TODO lo que cumple el filtro (no solo la pagina). El dinero no suma los pedidos cancelados
    # ni devueltos por completo (siguen guardando su saldo, simplemente no cuentan); por_estado los cuenta a todos.
    # Las sumas salen en pesos enteros (redondear_peso): un documento viejo con centavos no deja la cifra con decimales.
    vigente = SaleOrder.estado.notin_(ESTADOS_VEN_SIN_DINERO)
    suma = lambda col: func.coalesce(func.sum(case((vigente, col), else_=0)), 0)
    monto, saldo, anticipo = q.with_entities(suma(SaleOrder.total_cop), suma(SaleOrder.saldo_cop),
                                             suma(SaleOrder.anticipo_cop)).one()
    por_estado = dict(q.with_entities(SaleOrder.estado, func.count(SaleOrder.id)).group_by(SaleOrder.estado).all())
    items = q.order_by(SaleOrder.created_at.desc()).offset(offset).limit(limit).all()
    # H4: el asesor real de cada pedido (el de su COT o, si no, el de su SC), con 2 consultas en bloque.
    asesores = _asesores_de_pedidos(db, items)
    return {"status": "success", "total": total,
            "resumen": {"monto_cop": float(redondear_peso(monto)), "saldo_cop": float(redondear_peso(saldo)),
                        "anticipo_cop": float(redondear_peso(anticipo)), "por_estado": por_estado},
            "data": [{**_ven_dict(v), "advisor_name": asesores.get(v.id)} for v in items]}


@router.post("/pedidos", status_code=201)
def create_pedido(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN)),
        db: Session = Depends(get_db)):
    """Pedido suelto (sin COT). B11 (revision final): solo Administracion; desde H47 ninguna pantalla lo llama y los
    pedidos de Ventas nacen de una COT confirmada (convertir_cotizacion_a_venta), con su anticipo verificado (N1)."""
    from sqlalchemy.exc import SQLAlchemyError
    from fastapi import status as http_status
    # H42: montos en pesos enteros; el saldo se calcula con los ya redondeados para que cuadre sin centavos.
    subtotal_cop = _monto_en_pesos(body.get("subtotal_cop"), "subtotal_cop")
    total_cop = _monto_en_pesos(body.get("total_cop"), "total_cop")
    anticipo_cop = _monto_en_pesos(body.get("anticipo_cop"), "anticipo_cop")
    try:
        numero = _gen_numero(db, "PVEN-", "seq_ven")
    except Exception as exc:
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"No se pudo generar el número de pedido: {type(exc).__name__}",
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
    except SQLAlchemyError:
        # B9 (revision final): un mensaje generico en español; el error de la base (str(exc.orig), con el SQL o los
        # datos, o el nombre de la excepcion) va solo al log del servidor. IntegrityError es un SQLAlchemyError.
        db.rollback()
        logger.exception("No se pudo crear el pedido de venta %s", numero)
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="No se pudo crear el pedido: revisa los datos (cliente, solicitud y cotización) e intenta de nuevo.",
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
    # N10: la linea de tiempo del pedido junta lo de Ventas ('VEN') con lo que fase4 registra como 'PVEN' (pagos,
    # excepcion, reservas, cancelacion; siempre con el numero del pedido). R12: los 'PVEN' tambien se filtran por
    # numero, porque los MERCANCIA_DISPONIBLE viejos guardan el id de una LINEA con entity_numero vacio y ese id puede
    # coincidir con el de otro pedido. Los renglones de un mismo flush comparten created_at: el id da el orden causal.
    logs = db.query(ActivityLog).filter(or_(
        and_(ActivityLog.entity_type == "VEN", ActivityLog.entity_id == ven_id),
        and_(ActivityLog.entity_type == "PVEN", ActivityLog.entity_id == ven_id,
             ActivityLog.entity_numero == v.numero),
    )).order_by(ActivityLog.created_at.asc(), ActivityLog.id.asc()).all()
    d = _ven_dict(v)
    rol = normalize_role(user.role)
    d["actividades"] = [_log_dict(l, rol) for l in logs]
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
    # H4 + H35+H48: la SC y la COT del pedido se leen UNA vez cada una (solo las columnas que hacen falta). El asesor
    # sale del cotizador de la COT o, si no, del asesor de la SC; las notas son las ACTUALES de cada documento (nunca
    # copiadas al pedido). Solo en el detalle (no en _ven_dict) para no hacer una consulta por fila en el listado.
    sc = (db.query(CustomerRequest.notas, CustomerRequest.advisor_name).filter(CustomerRequest.id == v.sc_id).first()
          if v.sc_id else None)
    cot = (db.query(SalesQuotation.notas, SalesQuotation.cotizador).filter(SalesQuotation.id == v.cot_id).first()
           if v.cot_id else None)
    d["advisor_name"] = _asesor_de_pedido(cot.cotizador if cot else None, sc.advisor_name if sc else None)
    d["sc_notas"] = _texto_o_none(sc.notas) if sc else None
    d["cot_notas"] = _texto_o_none(cot.notas) if cot else None
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
    mismo estado no hace nada; un estado que no se puede poner por PATCH, o una transicion no permitida -> 422.
    S1 (T11): update_pedido ya rechazo con 422 un estado vacio o que no es texto (_exigir_estado_valido); None aqui es
    que el body no trae estado."""
    if nuevo is None or nuevo == v.estado:
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


def _unidades(cantidad) -> str:
    """'1 unidad', '2 unidades', '2.5 unidades' (sin los ceros de Numeric(10, 2))."""
    q = Decimal(str(cantidad)).normalize()
    return f"{q:f} unidad" if q == 1 else f"{q:f} unidades"


def _liberar_lo_apartado_del_pedido(db: Session, v: SaleOrder, autor: Optional[str]) -> None:
    """A2 (revision final): lo que hace la cancelacion por PATCH /ventas/pedidos/{id} con lo que el pedido tenia
    apartado. Sin commit: va en el mismo commit que la cancelacion.

    - Lineas: lo que falta por entregar queda CANCELADA y sus reservas ACTIVE pasan a RELEASED, con el mismo helper
      que POST /pedidos/{id}/cancelar sin decision sobre la mercancia. Asi el pedido nuevo de la misma COT (H46, R6)
      puede reservar esa mercancia.
    - Lista de Compras: sus items por comprar pasan a DESCARTADO.
    - Compras asignadas (ProcurementAllocation de las lineas que se cancelan): la pantalla del detalle no ofrece la
      decision sobre la mercancia (solo la pide POST /cancelar, que ninguna pantalla llama), asi que en vez de un
      409 sin salida se cancela igual y queda en la Actividad 'COMPRA_REVISAR' con las compras y las unidades. Las
      asignaciones no se tocan: las decide quien revise."""
    from app.api.v1.erp_ventas_fase4 import _cancelar_lineas_del_pedido
    from app.api.v1.erp_compras import descartar_items_lista_de_pedido
    lineas = (db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == v.id)
              .order_by(SaleOrderLineErp.id).with_for_update().all())
    por_cancelar = [l.id for l in lineas if l.quantity - l.quantity_delivered - l.quantity_cancelled > 0]
    compras = []
    if por_cancelar:
        compras = (db.query(PurchaseOrderFull.numero, func.sum(ProcurementAllocation.quantity_allocated))
                   .select_from(ProcurementAllocation)
                   .join(PurchaseOrderLine, PurchaseOrderLine.id == ProcurementAllocation.po_line_id)
                   .outerjoin(PurchaseOrderFull, PurchaseOrderFull.id == PurchaseOrderLine.pec_id)
                   .filter(ProcurementAllocation.sale_order_line_id.in_(por_cancelar),
                           ProcurementAllocation.quantity_allocated > 0)
                   .group_by(PurchaseOrderFull.numero).order_by(PurchaseOrderFull.numero).all())
    _cancelar_lineas_del_pedido(db, lineas, datetime.datetime.utcnow(), autor)
    if compras:
        detalle = "; ".join(f"{numero or 'compra sin número'}: {_unidades(cantidad)}" for numero, cantidad in compras)
        db.add(ActivityLog(
            entity_type="VEN", entity_id=v.id, entity_numero=v.numero, action="COMPRA_REVISAR",
            description=(f"El pedido tenía compras asignadas ({detalle}): revisar en Compras qué hacer con esa "
                         "mercancía (pasarla a stock, reasignarla a otro cliente o devolverla al proveedor)."),
            user_name=autor,
            extra_data={"compras": [{"pec_numero": numero, "cantidad": str(cantidad)} for numero, cantidad in compras]}))
    descartar_items_lista_de_pedido(db, v)


@router.patch("/pedidos/{ven_id}")
def update_pedido(ven_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    _exigir_estado_valido(body)  # S1 (T11): antes de leer nada
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
    # A3 (revision final): con un total nuevo (la re-cotizacion de la COT), el saldo y el anticipo salen del libro
    # de pagos del pedido, no de cuentas del navegador: los del body se ignoran. Un body con solo saldo_cop (el
    # "Registrar cobro" de Entregas) sigue como antes (hueco anterior a la rama, anotado).
    recalcula_desde_el_libro = body.get("total_cop") is not None
    if recalcula_desde_el_libro:
        body.pop("saldo_cop", None)
        body.pop("anticipo_cop", None)
    # R11 (H42): la re-cotizacion propaga total y subtotal con decimales al PVEN: el servidor los deja en pesos
    # enteros.
    _redondear_montos_del_body(body, ("subtotal_cop", "total_cop", "saldo_cop", "anticipo_cop"))
    for k in allowed:
        if k in body:
            setattr(v, k, body[k])
    if recalcula_desde_el_libro:
        from app.api.v1.erp_ventas_fase4 import _cabecera_desde_el_libro_de_pagos
        _cabecera_desde_el_libro_de_pagos(v, db)
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
        # A2 (revision final): con H46 + R6 reconvertir la COT es el flujo normal; lo que este pedido tenia
        # apartado se libera en el mismo commit (reservas, lineas y Lista de Compras).
        _liberar_lo_apartado_del_pedido(db, v, autor)
    v.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(v)
    _registrar_cambios(db, "VEN", v, antes_log, body, user)
    if body.get("estado") and body["estado"] != old_estado:
        _log(db, "VEN", v.id, v.numero, "ESTADO_CHANGED",
             ("Estado cambiado a Entregado (el inventario ya se había descontado en un despacho anterior; no se "
              "descuenta otra vez)") if ya_despachado else f"Estado cambiado a {etiqueta_estado('VEN', v.estado)}",
             old_estado=old_estado, new_estado=v.estado, user_name=autor, usuario=user)
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
    if p.estado == "CANCELADA" and old_estado != "CANCELADA" and p.ven_id:
        # B6 (revision final, R12): el pedido deja de apuntar a la PXP cancelada en el mismo commit (como al cancelar
        # el pedido): la lista y el detalle no se contradicen y se puede crear otra orden de pago.
        so = db.query(SaleOrder).filter(SaleOrder.id == p.ven_id).with_for_update().first()
        if so is not None and (so.pxp_id == p.id or so.pxp_numero == p.numero):
            if so.pxp_id == p.id:
                so.pxp_id = None
            if so.pxp_numero == p.numero:
                so.pxp_numero = None
            so.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(p)
    if body.get("estado") and body["estado"] != old_estado:
        _log(db, "PXP", p.id, p.numero, "ESTADO_CHANGED",
             f"Pago {p.numero} cambiado a {etiqueta_estado('PXP', p.estado)}",
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
    # H47: ni cancelados ni devueltos por completo suman dinero (ven_total si los cuenta).
    ven_monto = db.query(func.sum(SaleOrder.total_cop)).filter(
        SaleOrder.estado.notin_(ESTADOS_VEN_SIN_DINERO)).scalar() or 0

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

    # Base VEN query in range (ni cancelados ni devueltos por completo: su dinero no cuenta, H47)
    ven_q = db.query(SaleOrder).filter(
        SaleOrder.created_at >= d_from,
        SaleOrder.created_at <= d_to,
        SaleOrder.estado.notin_(ESTADOS_VEN_SIN_DINERO)
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


def _sc_sin_documentos_activos():
    """R20 (U11): filtro SQL de las SC SIN documentos activos, el mismo criterio que _documentos_activos_de_solicitud
    pero en la consulta (NOT EXISTS, sin una consulta por fila): ninguna COT con estado != RECHAZADA y ningun pedido de
    venta != CANCELADO vinculado por sc_id o por el cot_id de cualquier COT de la SC. Una SC con documentos activos (p.ej.
    la cotizada sin confirmacion) no cuenta como atrasada: la alerta la lleva su cotizacion o su pedido."""
    cot_activa = (select(SalesQuotation.id)
                  .where(SalesQuotation.sc_id == CustomerRequest.id, SalesQuotation.estado != "RECHAZADA")
                  .exists())
    # correlate explicito: este SELECT va dos niveles adentro y, sin el, SQLAlchemy le pone su propio customer_requests
    # (contaria las COT de TODAS las SC).
    cots_de_la_sc = (select(SalesQuotation.id).where(SalesQuotation.sc_id == CustomerRequest.id)
                     .correlate(CustomerRequest))
    pven_vigente = (select(SaleOrder.id)
                    .where(SaleOrder.estado != "CANCELADO",
                           or_(SaleOrder.sc_id == CustomerRequest.id, SaleOrder.cot_id.in_(cots_de_la_sc)))
                    .exists())
    return and_(~cot_activa, ~pven_vigente)


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
        _sc_sin_documentos_activos(),  # R20: la alerta la lleva su COT o su pedido (no se cuenta dos veces)
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
        _sc_sin_documentos_activos(),  # R20: la alerta la lleva su COT o su pedido
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

# N8: lo unico de admin_config que leen los roles que no son ADMIN (los dias de alerta de las listas, y los
# interruptores del panel de Configuracion). Una clave nueva queda solo para ADMIN mientras no se agregue aqui.
_CONFIG_LECTURA_GENERAL = {"alerta_sc_dias", "alerta_cot_dias", "alerta_ven_dias",
                           "alerta_soporte_alta_horas", "alerta_soporte_media_horas", "alerta_soporte_baja_horas",
                           "auto_lead_crm", "auto_chatter_ia", "notif_whatsapp"}


@router.get("/config")
def get_config(user: User = Depends(require_roles(*ALL_ERP_ROLES)),
        db: Session = Depends(get_db)):
    try:
        rows = db.execute(text("SELECT key, value, description FROM admin_config")).fetchall()
        data = {r[0]: {"value": r[1], "description": r[2]} for r in rows}
        if normalize_role(user.role) != "ADMIN":
            data = {k: v for k, v in data.items() if k in _CONFIG_LECTURA_GENERAL}
        return {"status": "success", "data": data}
    except Exception:
        # Lo leen todos los roles (N8): si la consulta falla (tabla ausente, base caida) que quede rastro en el log.
        logger.exception("No se pudo leer admin_config")
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

Estado actual: {etiqueta_estado('SC', sc.estado)}
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

Estado de la solicitud: {etiqueta_estado('SC', sc.estado)}
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
Estado: {etiqueta_estado('SC', sc.estado)}
Cliente: {sc.customer_name or 'N/D'}
Asesor: {sc.advisor_name or 'No asignado'}
Días activo: {dias_desde_creacion} días
Modalidad: {sc.modalidad_pago or 'No especificada'}

📋 Historial de actividad: {len(list(actividades))} eventos registrados
🛒 Productos: {len(productos)} ítem(s)

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
        # este endpoint marca eliminada_at (pasados 30 dias en la Papelera, la
        # borra un administrador al vaciar las vencidas: B2.1 D2), lo
        # que perderia un ticket de soporte real. Su ciclo de vida se maneja
        # exclusivamente con estado_soporte (PATCH /solicitudes/{id}).
        raise HTTPException(400, "Soporte Técnico no usa este flujo de cancelación; cambia su estado de soporte en su lugar")
    # N4: no se cancela (ni se manda a la papelera) con una cotizacion o un pedido de venta activos.
    cots_activas, pvens_activos = _documentos_activos_de_solicitud(db, sc.id)
    if cots_activas or pvens_activos:
        raise HTTPException(409, _mensaje_documentos_activos(sc, cots_activas, pvens_activos))
    from app.core.confirmation_tokens import revoke_pending_tokens
    user_name = getattr(body, "user_name", None) or getattr(user, "username", None) or getattr(user, "email", "")
    ahora = datetime.datetime.utcnow()
    tenia_lead = db.query(LeadCRM.id).filter(LeadCRM.canonical_customer_request_id == sc.id).first() is not None
    # U18 (H31+H33, C1/C8): todo en UNA transaccion con un solo commit al final. El motivo vive en razon_cancelacion y en
    # la Actividad, ya NO en las notas (R3: las notas viajan a la COT y al PVEN).
    if sc.estado == "CANCELADA":
        # 'Enviar a la papelera' una SC que se cancelo con la pastilla vieja (sin motivo ni eliminada_at): no se
        # cancela otra vez (ni otro CANCELLED); solo se completa lo que falta.
        if sc.eliminada_at is None:
            sc.eliminada_at = ahora
        if not sc.razon_cancelacion:
            sc.razon_cancelacion = razon
        sc.updated_at = ahora
        lead_ok = _marcar_lead_perdido(db, sc)
        referencias = _referencias_de_solicitud(db, sc.id)
        cambios = [_renglon_lead_perdido(lead_ok)] if tenia_lead else []
        cambios.append({"etiqueta": "Papelera", "despues": _texto_papelera(db, sc, referencias)})
        _log(db, "SC", sc_id, sc.numero, "SENT_TO_TRASH", "Solicitud enviada a la papelera", user_name=user_name,
             extra_data={"lead_perdido": tenia_lead and lead_ok, "se_conserva": bool(referencias),
                         "purga_programada": _iso_utc(_fecha_de_purga(sc, referencias)), "cambios": cambios},
             commit=False)
    else:
        # La marca de Gate 1 se mide ANTES de limpiarla.
        old_estado = sc.estado
        tenia_confirmacion = sc.gate1_confirmed_at is not None
        sc.estado = "CANCELADA"
        sc.razon_cancelacion = razon
        sc.eliminada_at = ahora
        sc.gate1_confirmed_at = None  # Round 6: cancelar invalida cualquier confirmacion previa sin consumir
        sc.updated_at = ahora
        # Gate 1: un link de confirmacion ya enviado no debe poder revivir una SC que
        # el asesor acaba de cancelar -- revoca cualquier token pendiente de esta SC. B5 (revision final): los enlaces
        # vivos que anula los cuenta la propia revocacion (RETURNING), no un conteo previo que un enlace creado en medio
        # (enviar_solicitud_para_confirmacion no bloquea la SC) dejaria corto.
        enlaces_vivos = revoke_pending_tokens(db, "SC", sc_id, commit=False, contar_vigentes=True)
        lead_ok = _marcar_lead_perdido(db, sc)
        referencias = _referencias_de_solicitud(db, sc.id)
        cambios = [{"etiqueta": "Motivo", "despues": razon},
                   {"etiqueta": "Estado anterior", "despues": etiqueta_estado("SC", old_estado)}]
        if enlaces_vivos > 0:
            cambios.append({"etiqueta": "Enlace de confirmación",
                            "despues": "Anulado: el cliente ya no puede confirmar con el enlace que recibió"})
        if tenia_confirmacion:
            cambios.append({"etiqueta": "Confirmación del cliente", "despues": "Anulada"})
        if tenia_lead:
            cambios.append(_renglon_lead_perdido(lead_ok))
        cambios.append({"etiqueta": "Papelera", "despues": _texto_papelera(db, sc, referencias)})
        # La descripcion 'Cancelada: {motivo}' no cambia (H7; las filas viejas dicen lo mismo).
        _log(db, "SC", sc_id, sc.numero, "CANCELLED", f"Cancelada: {razon}", old_estado, "CANCELADA", user_name,
             extra_data={"motivo": razon, "estado_anterior": old_estado, "enlace_anulado": enlaces_vivos > 0,
                         "confirmacion_anulada": tenia_confirmacion, "lead_perdido": tenia_lead and lead_ok,
                         "se_conserva": bool(referencias),
                         "purga_programada": _iso_utc(_fecha_de_purga(sc, referencias)), "cambios": cambios},
             commit=False)
    # La respuesta se arma ANTES del commit: despues el objeto queda expirado y leerlo costaria otro viaje a la base.
    resp = {"status": "success", "data": {"id": sc_id, "estado": "CANCELADA", "razon": sc.razon_cancelacion}}
    db.commit()
    return resp


def _lead_en_savepoint(db: Session, que: str, operacion):
    """(resultado, fallo) de mover el lead del CRM (operacion, con commit=False) dentro de un savepoint: cancelar y
    restaurar la SC son UNA transaccion con un solo commit (C8). Si falla, el savepoint deshace solo lo del lead (sin
    db.rollback(), que tiraria tambien lo de la SC), queda en el log y el renglon de la Actividad lo dice. Lo pendiente
    de la SC se envia antes (flush) para que un error suyo no se confunda con uno del lead."""
    db.flush()
    try:
        with db.begin_nested():
            return operacion(), False
    except Exception as exc:
        logger.error(f"Error al {que}: {exc}", exc_info=True)
        return None, True


def _marcar_lead_perdido(db: Session, sc: CustomerRequest) -> bool:
    """N4: el cliente pasa a perdido en el CRM al cancelar la SC (ya no al rechazar una COT, N7). False si fallo."""
    _, fallo = _lead_en_savepoint(db, f"mover el lead de la solicitud cancelada {sc.numero}",
                                  lambda: mover_lead_de_solicitud(sc.id, "CANCELLED", db, commit=False))
    return not fallo


def _renglon_lead_perdido(lead_ok: bool) -> dict:
    return {"etiqueta": "Cliente en el CRM",
            "despues": "Marcado como perdido" if lead_ok else "No se pudo marcar como perdido"}


# ─── PAPELERA (SCs canceladas, purga 30 días) ────────────────────────────────

# get_papelera moved above /solicitudes/{sc_id} to fix route shadowing


@router.delete("/solicitudes/{sc_id}/permanente")
def eliminar_permanente(sc_id: int, user: User = Depends(require_roles(*ROLE_ADMIN)),
        db: Session = Depends(get_db)):
    """Elimina permanentemente una SC de la papelera (N4: no si tiene cotizaciones, pedidos o leads vinculados)."""
    # Bloqueada (FOR UPDATE, como restaurar_solicitud) ANTES de revisar los documentos: un INSERT concurrente que
    # referencie esta SC (una COT, un pedido, un lead) espera a que termine esta transaccion y despues falla en su
    # propio FK, en vez de colarse entre la revision y el borrado. Sin el bloqueo, db.delete(sc) borraria la SC y el ORM
    # (CustomerRequest.quotations no tiene passive_deletes) haria UPDATE sales_quotations SET sc_id = NULL sobre una COT
    # recien vinculada, dejandola huerfana sin avisar.
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).with_for_update().first()
    if not sc or sc.estado != "CANCELADA":
        raise HTTPException(400, "Solo se pueden eliminar permanentemente SCs canceladas")
    referencias = _referencias_de_solicitud(db, sc.id)
    if referencias:
        raise HTTPException(409, _mensaje_solicitud_con_historial(sc, referencias))
    # H33: rastro de auditoria en el MISMO commit del borrado (commit=False): si el borrado falla, no queda un rastro
    # falso. La SC ya no existira: ninguna pantalla lo muestra.
    _log(db, "SC", sc.id, sc.numero, "DELETED", f"Solicitud {sc.numero} eliminada definitivamente de la Papelera",
         old_estado="CANCELADA", user_name=getattr(user, "email", None),
         extra_data={"cliente": sc.customer_name, "motivo_cancelacion": sc.razon_cancelacion}, commit=False)
    try:
        db.delete(sc)
        db.commit()
    except IntegrityError:
        # Red de seguridad para una referencia que la revision de arriba no cubre (otra FK a customer_requests): 409 en
        # vez de 500. Las COT, los pedidos y los leads vinculados no llegan aqui: ya los frenaron la revision y el bloqueo.
        db.rollback()
        raise HTTPException(409, _mensaje_solicitud_con_historial(sc, []))
    return {"status": "success", "data": {"deleted": sc_id}}


@router.post("/solicitudes/{sc_id}/restaurar")
def restaurar_solicitud(sc_id: int, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
        db: Session = Depends(get_db)):
    """Restaura una SC de la papelera (estado CANCELADA) a ASIGNADA si todavia tiene un asesor puesto, o a BORRADOR
    (Nueva) sin el. Su lead sale de 'perdido'. Una sola escritura y un solo commit (H33, C8); la Actividad explica en
    que estado quedo y por que, y la respuesta trae el 'mensaje' para el aviso."""
    from app.core.confirmation_tokens import revoke_pending_tokens
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).with_for_update().first()
    if not sc:
        raise HTTPException(404, "SC no encontrada")
    # Solo una SC cancelada se restaura: en otro estado esto la reiniciaria (Gate 1) con lo que tenga vivo.
    if sc.estado != "CANCELADA":
        raise HTTPException(409, f"La solicitud {sc.numero} no está cancelada: no hay nada que restaurar.")
    # R10: restaurar reinicia el ciclo de Gate 1 igual que volver a Borrador; no con documentos activos colgando
    # (datos viejos: SC cancelada con la pastilla vieja sin revisar sus documentos). R34: gana sobre la primera rama de C6.
    cots_activas, pvens_activos = _documentos_activos_de_solicitud(db, sc.id)
    if cots_activas or pvens_activos:
        raise HTTPException(409, _mensaje_documentos_activos(sc, cots_activas, pvens_activos, "restaurar"))
    old_estado = sc.estado
    # Gate 1 (Round 6): mismo invariante que update_solicitud/promueve_asignada -- una SC nunca queda en BORRADOR con un
    # asesor ya asignado (cancelar_solicitud no lo limpia). El estado final se decide ANTES de escribir: la SC ya no pasa
    # un instante por BORRADOR. B1 (revision final): la regla sale de _estado_tras_reinicio y el motivo, del estado.
    estado_final = _estado_tras_reinicio(sc)
    motivo = (f"tiene asesor asignado ({sc.advisor_name or 'asesor'})" if estado_final == "ASIGNADA"
              else "no tiene asesor asignado")
    etiqueta = etiqueta_estado("SC", estado_final)
    # La marca de Gate 1 se mide antes de limpiarla.
    habia_confirmacion = sc.gate1_confirmed_at is not None
    sc.estado = estado_final
    sc.eliminada_at = None
    sc.gate1_confirmed_at = None
    sc.updated_at = datetime.datetime.utcnow()
    # Gate 1 (Round 7): mismo revoke+clear que cancelar_solicitud y update_solicitud ya tienen -- defensa en
    # profundidad para que una SC restaurada desde la papelera nunca pueda cargar un token o una marca de confirmacion
    # de un ciclo anterior. B5 (revision final): los enlaces vivos que anula los cuenta la propia revocacion (RETURNING),
    # no un conteo previo que un enlace creado en medio dejaria corto.
    enlaces_vivos = revoke_pending_tokens(db, "SC", sc_id, commit=False, contar_vigentes=True)
    # N4: cancelar la SC deja el lead perdido; restaurarla lo devuelve a la etapa con la que nace un lead nuevo (None si
    # no habia lead perdido). Si falla, la restauracion sigue y el renglon lo dice (solo si habia un lead que reabrir).
    tenia_lead_perdido = db.query(LeadCRM.id).filter(LeadCRM.canonical_customer_request_id == sc.id,
                                                     LeadCRM.status == "CANCELLED").first() is not None
    etapa_lead, lead_fallo = _lead_en_savepoint(db, f"reabrir el lead de la solicitud restaurada {sc.numero}",
                                                lambda: reabrir_lead_de_solicitud(sc.id, db, commit=False))
    cambios = [{"etiqueta": f"Queda {etiqueta}", "despues": motivo}]
    if sc.razon_cancelacion:
        cambios.append({"etiqueta": "Motivo de la cancelación", "despues": sc.razon_cancelacion})
    if habia_confirmacion or enlaces_vivos > 0:
        cambios.append({"etiqueta": "Confirmación del cliente", "despues": "Hay que volver a enviársela al cliente"})
    if etapa_lead:
        cambios.append({"etiqueta": "Cliente en el CRM", "despues": f"Vuelve a {etapa_lead}"})
    elif lead_fallo and tenia_lead_perdido:
        cambios.append({"etiqueta": "Cliente en el CRM", "despues": "No se pudo reabrir"})
    _log(db, "SC", sc_id, sc.numero, "RESTORED", f"Solicitud restaurada a {etiqueta}", old_estado, estado_final,
         getattr(user, 'email', ''), extra_data={"cambios": cambios}, commit=False)
    # La respuesta se arma ANTES del commit: despues el objeto queda expirado y leerlo costaria otro viaje a la base.
    resp = {"status": "success", "data": {
        "id": sc_id, "numero": sc.numero, "estado": estado_final, "estado_label": etiqueta,
        "mensaje": f"{sc.numero} restaurada: queda {etiqueta} porque {motivo}."}}
    db.commit()
    return resp


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
