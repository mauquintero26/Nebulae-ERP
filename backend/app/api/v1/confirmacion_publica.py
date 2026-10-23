# backend/app/api/v1/confirmacion_publica.py
"""
Router publico (sin autenticacion) para que un cliente confirme una
Solicitud (o, desde Task 5, una Cotizacion) haciendo clic en el link de un
solo uso que le llega por correo. Ver app/core/confirmation_tokens.py para
el mecanismo de token (mismo patron que el reset de contraseña).

Bloque 3, T5 (U17+H28, U22+H38, U23; C2, C10, C11, C26, R24, RP26, RP27):
- /confirmar/ver y /confirmar/confirmar (SC y COT) dicen el estado del enlace en palabras
  (documento_cliente.estado_enlace, reglas a-i). Solo 'pendiente' responde 200 en /ver; todo lo demas sigue en 400,
  ahora con detail dict (_detalle_enlace: {mensaje, estado_enlace, empresa, documento, confirmada_el, siguiente_paso,
  comentario}).
- Cada respuesta lleva 'empresa' (perfil_publico, C26), en el 200 y en el detail del 400.
- data conserva numero, estado, total_cop (COT) y productos de siempre y agrega documento (la forma unica de C2).
- POST /pedido-cliente/ver: el enlace de CONSULTA del pedido (TIPOS_CONSULTA, C11), que no se gasta.
- Nunca se devuelve el dict interno de consultar_token (ids, document_id...): se proyecta campo por campo.

Bloque 3, T6 (H28-cambios, U22-cambios; C9, C17, C20, C26, R12, RP21): POST /confirmar/pedir-cambios, un solo endpoint
para la SC y la COT (ver pedir_cambios_via_token).
"""
import logging
import unicodedata

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.confirmation_tokens import (RESULTADO_CAMBIOS, RESULTADO_CONFIRMADO, TIPOS_CONSULTA, consultar_token,
                                          hash_token, marcar_resultado, reclamar_token, revoke_pending_tokens)
from app.core.documento_cliente import (MENSAJE_GRACIAS, TIPO_NO_LA_NECESITA, _asesor_del_documento, documento_cot,
                                        documento_pven, documento_sc, estado_enlace, forma_de_pago,
                                        productos_publicos_sc, siguiente_paso_sc)
from app.core.empresa import perfil_publico
from app.core.fechas import ahora_utc, iso_z
from app.core.textos_actividad import etiqueta_estado
from app.db.database import get_db
from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation

logger = logging.getLogger(__name__)

router = APIRouter()

# El error del enlace de consulta del pedido (U23): el mismo para un token inexistente, vencido, revocado, de otro tipo
# o un pedido cancelado; nunca se distingue el motivo (C10).
GENERIC_ERROR = "El enlace no es válido o ya expiró."

_MODELO_POR_TIPO = {"SC": CustomerRequest, "COT": SalesQuotation}
# Las claves del detail del 400 de las paginas publicas (C10, C26): siempre todas, en None si no aplican.
CLAVES_DETALLE = ("mensaje", "estado_enlace", "empresa", "documento", "confirmada_el", "siguiente_paso", "comentario")


class TokenBody(BaseModel):
    """Mismo shape que ResetPasswordRequest (app/schemas/users.py) -- el token va en
    el body JSON, nunca en la URL. Round 7: un uvicorn con access log encendido (el
    caso real en Dockerfile/start_production.sh/nebulae_service_wrapper.py, ninguno
    filtra uvicorn.access) escribe la URL completa de cada request en el log de
    servicio; con el token como path param, eso incluye el token crudo en texto
    plano en cada GET/POST -- exactamente lo que el Global Constraint del plan
    prohibe ("el token crudo nunca se loguea"). El password-reset que este modulo
    copia siempre evito esto por tomar el token en el body, nunca en la URL."""
    token: str


def _productos_publicos(productos: list) -> list:
    """Solo lo que un cliente externo deberia ver de sus propios productos --
    nunca costos/margenes de proveedor ni otros campos internos."""
    return [
        {
            "product_name": p.get("product_name"),
            "qty": p.get("qty"),
            "unit_price_cop": p.get("unit_price_cop"),
        }
        for p in (productos or [])
    ]


def _sc_confirmacion_dict(db: Session, sc) -> dict:
    """Proyeccion publica minima de una Solicitud -- SOLO lo que un cliente con el
    link deberia poder ver de su propio pedido. Nunca usar _sc_dict() aqui: expone
    created_by, advisor_user_id, razon_cancelacion y otros campos internos que no
    son asunto del cliente. U17: productos sin precio ({n, descripcion, cantidad}) y el documento (documento_sc)."""
    return {
        "numero": sc.numero,
        "customer_name": sc.customer_name,
        "estado": sc.estado,
        "fecha_entrega_estimada": sc.fecha_entrega_estimada.isoformat() if sc.fecha_entrega_estimada else None,
        "productos": productos_publicos_sc(sc.productos),
        "documento": documento_sc(db, sc),
    }


def _cot_confirmacion_dict(db: Session, cot, token_row=None) -> dict:
    """Proyeccion publica minima de una Cotizacion -- ver _sc_confirmacion_dict.
    Nunca usar _cot_dict() aqui: expone costos/margenes de proveedor y otros campos
    internos. U22+H38: el documento (documento_cot) con la fecha del envio del enlace (token_row)."""
    return {
        "numero": cot.numero,
        "customer_name": cot.customer_name,
        "estado": cot.estado,
        "fecha_entrega_estimada": cot.fecha_entrega_estimada.isoformat() if cot.fecha_entrega_estimada else None,
        "total_cop": float(cot.total_cop) if cot.total_cop else 0,
        "productos": _productos_publicos(cot.productos),
        "documento": documento_cot(db, cot, token_row),
    }


def _detalle(db: Session, estado: str, mensaje: str, **extra) -> dict:
    """El detail del 400 de las paginas publicas, el UNICO armado (r1, C1): CLAVES_DETALLE con la empresa (C26) y lo que
    no se pase en None."""
    detalle = dict.fromkeys(CLAVES_DETALLE)
    # r2: campo por campo: una clave que no es del contrato nunca llega a la pagina publica.
    detalle.update({clave: extra[clave] for clave in CLAVES_DETALLE if clave in extra},
                   mensaje=mensaje, estado_enlace=estado, empresa=perfil_publico(db))
    return detalle


def _documento_del_enlace(db: Session, info, bloquear: bool = False):
    """La SC o la COT del enlace (o None si no hay enlace o el documento ya no existe). bloquear=True la lee FOR UPDATE
    (y la relee de la base)."""
    modelo = _MODELO_POR_TIPO.get(info["document_type"]) if info is not None else None
    if modelo is None:
        return None
    consulta = db.query(modelo).filter(modelo.id == info["document_id"])
    if bloquear:
        consulta = consulta.populate_existing().with_for_update()
    return consulta.first()


def _resolver_enlace(db: Session, info) -> tuple:
    """(estado_enlace, detalle, documento) de un enlace de SC o COT. detalle es lo que ve el cliente cuando el enlace no
    esta pendiente (el detail del 400), con la empresa para que sepa a quien escribir (C26)."""
    doc = _documento_del_enlace(db, info)
    estado, extra = estado_enlace(db, info, doc, info["document_type"] if info is not None else None)
    return estado, _detalle(db, estado, **extra), doc


def _detalle_enlace(db: Session, info) -> dict:
    """{mensaje, estado_enlace, empresa, documento|None, confirmada_el|None, siguiente_paso|None, comentario|None} del
    enlace (info = consultar_token(...), o None): el detail del 400 de las paginas publicas (C10). Lo usa tambien
    /confirmar/pedir-cambios (T6) con un enlace que ya no esta vigente."""
    return _resolver_enlace(db, info)[1]


def _detalle_al_confirmar(db: Session, raw: str) -> dict:
    """El detail del 400 de /confirmar/confirmar cuando el enlace no se pudo usar. r1 (P2): primero bloquea el
    documento (FOR UPDATE) y despues relee el enlace. Asi, en un doble clic de verdad concurrente, el segundo POST
    espera a que termine el commit del primero (CONFIRMADA y el resultado) y muestra 'confirmada', no 'no_disponible'
    por haber leido el documento todavia pendiente y el enlace reclamado sin resultado."""
    info = consultar_token(db, raw)
    if info is not None and _documento_del_enlace(db, info, bloquear=True) is not None:
        info = consultar_token(db, raw)
    return _detalle_enlace(db, info)


def _respuesta_confirmada(db: Session, message: str, ahora, numero, armar) -> dict:
    """El 200 de /confirmar/confirmar, armado DESPUES del commit que confirma. armar() devuelve {siguiente_paso, data}.
    r1 (P3): la confirmacion ya quedo guardada, asi que si armar el documento falla (un dato viejo malformado), el
    cliente recibe el 200 minimo (sin data ni siguiente_paso) y el error queda en el registro: nunca un 500."""
    base = {"status": "success", "message": message, "estado_enlace": "confirmada", "mensaje": MENSAJE_GRACIAS,
            "confirmada_el": iso_z(ahora)}
    try:
        return {**base, **armar(), "empresa": perfil_publico(db)}
    except Exception:
        logger.error("La confirmacion de %s quedo guardada, pero no se pudo armar el documento de la respuesta", numero,
                     exc_info=True)
        db.rollback()
    try:
        empresa = perfil_publico(db)
    except Exception:
        logger.error("Tampoco se pudo leer la empresa para la respuesta de %s", numero, exc_info=True)
        db.rollback()
        empresa = None
    return {**base, "empresa": empresa}


def _anotar_confirmado(db: Session, info: dict, numero) -> None:
    """marcar_resultado 'CONFIRMADO' del enlace recien reclamado, en el commit que confirma el documento. Si no lo anota
    (no deberia pasar: el enlace se acaba de reclamar), la confirmacion vale igual, pero queda el error en el registro
    en vez de perder el resultado en silencio."""
    if not marcar_resultado(db, info["id"], RESULTADO_CONFIRMADO):
        logger.error("El enlace %s de %s %s no quedo marcado CONFIRMADO (no estaba reclamado o ya tenia resultado)",
                     info["id"], info["document_type"], numero)


@router.post("/confirmar/ver")
def ver_confirmacion(body: TokenBody, db: Session = Depends(get_db)):
    # consultar_token no cambia nada y solo acepta enlaces SC y COT (C11). Un documento que ya no esta pendiente de
    # confirmacion (cancelado, confirmado, reabierto...) nunca responde 200, aunque su enlace siga sin usar en la tabla:
    # la regla c de estado_enlace exige las dos cosas.
    info = consultar_token(db, body.token)
    estado, detalle, doc = _resolver_enlace(db, info)
    if estado != "pendiente":
        raise HTTPException(400, detail=detalle)
    if info["document_type"] == "SC":
        data = _sc_confirmacion_dict(db, doc)
    else:
        data = _cot_confirmacion_dict(db, doc, info)
    return {"status": "success", "estado_enlace": "pendiente", "vence_at": iso_z(info["expires_at"]),
            "empresa": detalle["empresa"], "data": data}


@router.post("/confirmar/confirmar")
def confirmar_via_token(body: TokenBody, idempotency_key: str = Header(..., alias="Idempotency-Key"), db: Session = Depends(get_db)):
    # reclamar_token es atomico, hace su propio commit y solo acepta SC y COT (C11: un enlace del pedido nunca se gasta
    # aqui). Si no se puede reclamar (doble clic, otra pestana, vencido, reemplazado...), la pagina muestra el estado
    # del enlace en vez de un error.
    info = reclamar_token(db, body.token)
    if info is None:
        raise HTTPException(400, detail=_detalle_al_confirmar(db, body.token))
    document_type, document_id = info["document_type"], info["document_id"]
    if document_type == "SC":
        from app.api.v1.erp_ventas import _log
        # Final whole-branch review (hallazgo #5): .populate_existing().with_for_update()
        # -- mismo endurecimiento que la rama COT de aqui abajo ya tiene desde Round 3,
        # para la misma simetria/consistencia (una lectura sin bloqueo seguida de una
        # escritura incondicional es siempre una garantia mas debil que una bloqueada,
        # sin importar si hoy existe o no un escritor concurrente especifico del lado SC
        # equivalente al congelamiento de precio de COT).
        sc = db.query(CustomerRequest).filter(CustomerRequest.id == document_id).populate_existing().with_for_update().first()
        if not sc or sc.estado != "PENDIENTE_CONFIRMACION":
            # El token ya fue consumido por reclamar_token de cualquier forma (es de un
            # solo uso) -- si la SC fue cancelada o movida de estado despues de enviarse
            # el link, este click no debe revivirla a CONFIRMADA. La pagina muestra el
            # estado del enlace (p. ej. 'confirmada' si se confirmo por su cotizacion).
            raise HTTPException(400, detail=_detalle_al_confirmar(db, body.token))
        old_estado = sc.estado
        ahora = ahora_utc()
        sc.estado = "CONFIRMADA"
        # Round 6: marca de procedencia -- ESTA es la UNICA linea del codebase que escribe
        # gate1_confirmed_at. confirmar_solicitud la exige (ademas de estado=="CONFIRMADA" y
        # de que no haya otra COT activa ni un pedido vigente). N7: ya no se consume al crear
        # la COT; significa "confirmacion vigente del cliente sobre los productos actuales" y
        # se limpia al cambiar los productos, al reiniciar/cancelar/restaurar la SC y cuando
        # una COT deja la SC (update_cotizacion con otro sc_id).
        sc.gate1_confirmed_at = ahora
        sc.updated_at = ahora
        # U11: si ya se cotizo sin esperar esta confirmacion (/cotizar-sin-confirmacion), la SC se queda con esa COT
        # (la activa mas reciente; una RECHAZADA no cuenta) y no se crea otra: con ella activa, confirmar_solicitud
        # responde 400. Se lee con la SC todavia bloqueada y todo va en un solo commit (C8).
        temprana = (db.query(SalesQuotation)
                    .filter(SalesQuotation.sc_id == sc.id, SalesQuotation.estado != "RECHAZADA")
                    .order_by(SalesQuotation.id.desc()).first())
        cliente = "Cliente (confirmación por link)"
        descripcion = "Confirmada por el cliente vía enlace"
        if temprana is not None:
            descripcion += f". Se mantiene la cotización {temprana.numero}, creada antes de la confirmación."
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED", descripcion,
             old_estado=old_estado, new_estado="CONFIRMADA", user_name=cliente, commit=False)
        if temprana is not None:
            _log(db, "COT", temprana.id, temprana.numero, "SC_CONFIRMADA",
                 f"El cliente confirmó la solicitud {sc.numero}: se mantiene esta cotización (no se crea otra).",
                 user_name=cliente, commit=False)
        # B3 T1 (C12/R19): los demás enlaces pendientes de esta SC quedan revocados en el MISMO commit que la confirma.
        revoke_pending_tokens(db, "SC", sc.id, commit=False, excepto_hash=hash_token(body.token))
        # B3 T5: este enlace queda CONFIRMADO en el mismo commit (si no, la pagina no sabria que con el se confirmo).
        numero = sc.numero
        _anotar_confirmado(db, info, numero)
        db.commit()
        # Despues del commit solo se lee: la respuesta no agrega commits.
        return _respuesta_confirmada(db, "Solicitud confirmada. Gracias.", ahora, numero, lambda: {
            "siguiente_paso": siguiente_paso_sc(db, sc, forma_de_pago(sc.modalidad_pago)),
            "data": _sc_confirmacion_dict(db, sc)})
    elif document_type == "COT":
        from app.api.v1.erp_ventas import _log, _sincronizar_estado_solicitud_desde_cotizacion
        # Round 3 (adversarial review, hallazgo #2): .populate_existing().with_for_update()
        # -- sin esto, una re-cotizacion concurrente (update_cotizacion rompiendo el
        # congelamiento de precio justo en este instante, por otra conexion) podria
        # escribir su propio commit entre la lectura de aqui y el commit de mas abajo sin
        # que esta transaccion lo vea, dejando CONFIRMADA + la marca puestas sobre una COT
        # cuyo precio ya cambio por debajo. El lock hace que esta transaccion espere (o
        # vea el estado ya actualizado) en vez de pisarlo a ciegas.
        cot = db.query(SalesQuotation).filter(SalesQuotation.id == document_id).populate_existing().with_for_update().first()
        if not cot or cot.estado != "PENDIENTE_CONFIRMACION":
            # El token ya fue consumido por reclamar_token de cualquier forma (es de un
            # solo uso) -- si la COT fue movida de estado despues de enviarse el link (el
            # PATCH generico es la unica via real, y siempre revoca -- ver
            # update_cotizacion), este click no debe revivirla a CONFIRMADA.
            raise HTTPException(400, detail=_detalle_al_confirmar(db, body.token))
        old_estado = cot.estado
        ahora = ahora_utc()
        cot.estado = "CONFIRMADA"
        # Gate 2 (Task 5, mismo patron que gate1_confirmed_at en la rama SC arriba):
        # marca de procedencia de un solo uso. ESTA es la UNICA linea del codebase que
        # escribe gate2_confirmed_at. convertir_cotizacion_a_venta (erp_ventas_fase4.py)
        # exige EXPLICITAMENTE tanto estado=="CONFIRMADA" como gate2_confirmed_at no nulo
        # (dos checks separados desde Round 3, no uno que asuma al otro -- ver el
        # comentario alli sobre la ventana entre el congelamiento de precio y la limpieza
        # del marcador) y la consume (vuelve a None) en el mismo commit en que crea el
        # Pedido de Venta, para que no quede una prueba reutilizable por un ciclo de venta
        # futuro y no relacionado sobre la misma COT.
        cot.gate2_confirmed_at = ahora
        cot.updated_at = ahora
        # B3 T1 (C12/R19): los demás enlaces pendientes de esta COT quedan revocados en el MISMO commit que la confirma.
        revoke_pending_tokens(db, "COT", cot.id, commit=False, excepto_hash=hash_token(body.token))
        # B3 T5: este enlace queda CONFIRMADO en el mismo commit.
        numero = cot.numero
        _anotar_confirmado(db, info, numero)
        db.commit()
        db.refresh(cot)
        # U15: la SC ya no refleja a su COT; la sincronizacion solo la confirma si estaba
        # sin confirmar (o en un estado heredado), sin poner gate1_confirmed_at (esa marca
        # la pone solo la rama SC de arriba), y anula su enlace pendiente. NO se
        # llama mover_lead_de_solicitud aqui: el movimiento del Lead a "Ganado"/INVOICED
        # ocurre al crear el Pedido de Venta (confirmar_cotizacion en erp_ventas.py,
        # despues de que convertir_cotizacion_a_venta devuelve un sale_order_id real),
        # no en este solo confirmar el precio -- verificado releyendo esa cadena de
        # llamadas antes de escribir esto, tal como pedia el plan.
        # Bundle trivial (final whole-branch review): envuelto en try/except -- sin
        # esto, una falla aqui devolveria 500 al cliente DESPUES de que el token ya se
        # consumio y la COT ya quedo CONFIRMADA (ambos ya committeados arriba); el
        # cliente veria un error pese a que su confirmacion si se registro de verdad.
        try:
            _sincronizar_estado_solicitud_desde_cotizacion(cot, db)
        except Exception as exc:
            db.rollback()
            logger.error(f"Error al sincronizar Solicitud tras confirmar cotizacion {cot.id} via enlace: {exc}", exc_info=True)
        _log(db, "COT", cot.id, cot.numero, "ESTADO_CHANGED", "Confirmada por el cliente vía enlace",
             old_estado=old_estado, new_estado="CONFIRMADA", user_name="Cliente (confirmación por link)")
        # U22+H38: que sigue = el anticipo que falta pagar y los datos para pagar (R8: solo en una respuesta con token),
        # leidos del documento despues del commit (sin commits nuevos).
        def armar():
            data = _cot_confirmacion_dict(db, cot, consultar_token(db, body.token))
            pago = data["documento"]["pago"]
            return {"siguiente_paso": {"anticipo_por_pagar": pago["anticipo_por_pagar"],
                                       "instrucciones_pago": pago["instrucciones"]}, "data": data}
        return _respuesta_confirmada(db, "Cotización confirmada. Gracias.", ahora, numero, armar)
    raise HTTPException(400, detail=_detalle_enlace(db, None))


@router.post("/pedido-cliente/ver")
def ver_pedido_cliente(body: TokenBody, db: Session = Depends(get_db)):
    """U23: el pedido que ve el cliente por su enlace de CONSULTA (tipo 'PVEN', C11). Verlo NO gasta el enlace: sirve
    mientras este vigente (30 dias, R6) y el pedido no este cancelado (se revisa en cada vista, aunque el enlace no se
    hubiera revocado). Responde {status, empresa, data: documento_pven, cot_numero} (R24, RP27). Cualquier otro caso
    (inexistente, vencido, revocado, de otro tipo o pedido CANCELADO) -> el mismo 400 generico, con la empresa para el
    contacto (C10, C26)."""
    info = consultar_token(db, body.token, tipos=TIPOS_CONSULTA)
    so = None
    if info is not None and info["vigente"]:
        so = db.query(SaleOrder).filter(SaleOrder.id == info["document_id"]).first()
    if so is None or so.estado == "CANCELADO":
        raise HTTPException(400, detail=_detalle(db, "invalido", GENERIC_ERROR))
    return {"status": "success", "empresa": perfil_publico(db), "data": documento_pven(db, so),
            "cot_numero": so.cot_numero}


# ─── T6: «Pedir cambios» desde el enlace (H28-cambios, U22-cambios; C9, C17, C20, C26, R12, RP21) ──────────────────

# RP21: los límites del comentario con nombre; la paridad de T13 los compara con puedeEnviarCambios (frontend).
MIN_COMENTARIO_CAMBIOS = 10
MAX_COMENTARIO_CAMBIOS = 1000
TIPO_CAMBIOS = "CAMBIOS"
# TIPO_NO_LA_NECESITA (R8: solo en la SC; vuelve al asesor marcada «Ya no la necesita») viene de core.documento_cliente
# (T15 r2: una sola definición); erp_ventas lo sigue importando de aquí.
TIPOS_PEDIR_CAMBIOS = (TIPO_CAMBIOS, TIPO_NO_LA_NECESITA)
USUARIO_DEL_ENLACE = "Cliente (por el enlace)"
MENSAJE_COMENTARIO_CORTO = f"Cuéntanos qué quieres cambiar (al menos {MIN_COMENTARIO_CAMBIOS} caracteres)."
MENSAJE_COMENTARIO_LARGO = f"Tu mensaje puede tener hasta {MAX_COMENTARIO_CAMBIOS} caracteres."
MENSAJE_TIPO_INVALIDO = "Elige «Pedir cambios» o «Ya no la necesito»."
MENSAJE_SOLO_SOLICITUD = "La opción «Ya no la necesito» solo existe para la solicitud."
# C20: el renglón de la COT temprana que vuelve a Borrador cuando el cliente pide cambios en su SC.
TEXTO_COT_TEMPRANA_A_BORRADOR = "El cliente pidió cambios en la solicitud: ajusta y reenvía la cotización"
# r1 (seguridad 3): un comentario más largo que esto ni se recorre para limpiarlo (endpoint público sin límite de
# tamaño del cuerpo): responde el mismo 422 del máximo.
_TOPE_SIN_LIMPIAR = 4 * MAX_COMENTARIO_CAMBIOS
# r1 (seguridad 4): lo que se quita del comentario: los controles (salvo el salto de línea y el tabulador), los
# surrogates sueltos y los caracteres de formato (Cf: ancho cero, controles bidireccionales como U+202E).
_CATEGORIAS_QUITADAS = ("Cc", "Cs", "Cf")


class PedirCambiosBody(BaseModel):
    """R12/C8: solo declara tipos. Las reglas de negocio (tipo, 10 a 1000 caracteres) se validan a mano dentro del
    endpoint con un 422 en español, ANTES de tocar el enlace."""
    token: str
    tipo: str = TIPO_CAMBIOS
    comentario: str = ""


def _limpiar_comentario(texto: str) -> str:
    """El comentario sin caracteres de control (salvo el salto de línea y el tabulador), sin surrogates sueltos y sin
    caracteres de formato (_CATEGORIAS_QUITADAS), con los saltos de línea normalizados y sin espacios en los bordes.
    - Un NUL o un surrogate harían fallar la escritura en la base DESPUÉS de gastar el enlace (500 con el enlace
      perdido).
    - r1: el texto invisible (diez U+200B) no cuenta para el mínimo, y un control bidireccional (U+202E) no invierte la
      cita en el correo del asesor ni en la Actividad.
    Los límites se cuentan sobre lo que queda (en code points). Regla para la paridad de T13 con puedeEnviarCambios:
    quitar \\p{Cc} (salvo \\n y \\t), los surrogates sueltos y \\p{Cf}, normalizar \\r\\n y \\r a \\n, recortar los
    bordes y contar code points ([...texto].length en JS, no .length)."""
    texto = texto.replace("\r\n", "\n").replace("\r", "\n")
    return "".join(ch for ch in texto
                   if ch in "\n\t" or unicodedata.category(ch) not in _CATEGORIAS_QUITADAS).strip()


def _validar_pedido_de_cambios(body: PedirCambiosBody) -> tuple:
    """(tipo, comentario o None) o HTTPException(422, mensaje en español) (R12). No toca el enlace."""
    if body.tipo not in TIPOS_PEDIR_CAMBIOS:
        raise HTTPException(422, MENSAJE_TIPO_INVALIDO)
    if len(body.comentario) > _TOPE_SIN_LIMPIAR:  # r1: ni se recorre (ver _TOPE_SIN_LIMPIAR)
        raise HTTPException(422, MENSAJE_COMENTARIO_LARGO)
    comentario = _limpiar_comentario(body.comentario)
    if len(comentario) > MAX_COMENTARIO_CAMBIOS:
        raise HTTPException(422, MENSAJE_COMENTARIO_LARGO)
    if body.tipo == TIPO_CAMBIOS and len(comentario) < MIN_COMENTARIO_CAMBIOS:
        raise HTTPException(422, MENSAJE_COMENTARIO_CORTO)
    return body.tipo, comentario or None


def _anotar_cambios(db: Session, reclamado: dict, numero) -> None:
    """marcar_resultado 'CAMBIOS' del enlace recién reclamado, en el commit del cambio. Si no lo anota (no debería: se
    acaba de reclamar), el cambio vale igual, pero queda el error en el registro en vez de perderse en silencio."""
    if not marcar_resultado(db, reclamado["id"], RESULTADO_CAMBIOS):
        logger.error("El enlace %s de %s %s no quedo marcado CAMBIOS (no estaba reclamado o ya tenia resultado)",
                     reclamado["id"], reclamado["document_type"], numero)


def _renglon_comentario(comentario) -> dict:
    """El renglón 'Comentario del cliente' de la Actividad (CAMBIOS_CLIENTE y SC_CAMBIOS_CLIENTE): sin 'campo', el
    formato de C1/H27 (no hay un 'antes' que tachar); '—' si el cliente no escribió nada."""
    return {"etiqueta": "Comentario del cliente", "despues": comentario or "—"}


def _extra_de_cambios(tipo: str, comentario, estado_etiqueta: str, estado: str) -> dict:
    """extra_data del renglón CAMBIOS_CLIENTE: {tipo, comentario, cambios} con los renglones 'etiqueta -> despues'."""
    return {"tipo": tipo, "comentario": comentario,
            "cambios": [_renglon_comentario(comentario), {"etiqueta": estado_etiqueta, "despues": estado}]}


def _cambios_en_cotizacion_temprana(db: Session, sc, cot, tipo: str, comentario, ahora) -> None:
    """C20 (U11): una COT activa de la SC donde el cliente pidió cambios, en el MISMO commit. Si estaba en Pendiente por
    confirmación vuelve a Borrador con gate2 None y sus enlaces revocados (así el cliente no aprueba la COT vieja
    después de pedir cambios en la SC); en otro estado solo recibe el renglón SC_CAMBIOS_CLIENTE: en Borrador, el de
    H28 g («Revisa esta cotización antes de enviarla»); en cualquier otro (Confirmada, Vencida, Enviada...), r1: un
    texto neutro que nombra su estado, sin pedir que se envíe. La marca cambios_cliente_* es de la SC: la COT no la
    lleva (no cuenta dos veces en las alertas).
    Solo se bloquea (FOR UPDATE, después de la SC, el mismo orden que PATCH /solicitudes/{id}/cliente) la COT que va a
    cambiar de estado: una en Borrador solo recibe un renglón, y bloquearla podría cruzarse con update_cotizacion, que
    bloquea la COT antes que su SC al cambiarle la solicitud.
    Con el envío de la COT: el PRIMER envío (Borrador o Enviada) bloquea la COT y después su SC (T6 r1), así que no
    corre en medio de este cambio; y, ya con la SC bloqueada, si la marca de cambios de la SC sigue vigente responde 409
    sin enviar nada (F1, M1): si llega justo después de este cambio (esperaba el bloqueo) o desde una página vieja, la
    COT temprana no sale hasta que el asesor responda (reenviar la SC borra la marca). El REENVÍO de una COT ya
    pendiente (B3 T7, C13) NO bloquea la SC (evita el ciclo COT -> SC frente a este SC -> COT): a los dos los ordena el
    bloqueo de la COT. Si el reenvío llega primero, este
    refresh espera su commit y la revocación de abajo, que corre después del refresh con una foto nueva, también anula
    el enlace que el reenvío acaba de crear; si este llega primero, el reenvío espera y relee la COT en Borrador: con
    reenvio=true (el botón «Reenviar») responde 409 sin tocar nada (T7 r1)."""
    from app.api.v1.erp_ventas import _ENLACE_ANULADO, _log
    if cot.estado == "PENDIENTE_CONFIRMACION":
        db.refresh(cot, with_for_update=True)  # releída bloqueada: el cliente pudo confirmarla en otra pestaña
    if cot.estado == "RECHAZADA":  # la rechazaron entre la consulta y el bloqueo: ya no es activa
        return
    renglones = [_renglon_comentario(comentario)]
    old_estado = new_estado = None
    # T20 (M1): la descripción no cita el comentario (va en extra_data, ver pedir_cambios_via_token).
    if tipo == TIPO_CAMBIOS:
        sobre_la_sc = f"El cliente pidió cambios en la solicitud {sc.numero}"
    else:
        sobre_la_sc = f"El cliente dice que ya no necesita la solicitud {sc.numero}"
    if cot.estado == "PENDIENTE_CONFIRMACION":
        old_estado, new_estado = cot.estado, "BORRADOR"
        cot.estado = new_estado
        cot.gate2_confirmed_at = None
        cot.updated_at = ahora
        vigentes = revoke_pending_tokens(db, "COT", cot.id, commit=False, contar_vigentes=True)
        renglones.append({"etiqueta": "Estado de la cotización", "despues": etiqueta_estado("COT", new_estado)})
        if vigentes:
            renglones.append({"etiqueta": "Enlace de confirmación", "despues": _ENLACE_ANULADO})
        if tipo == TIPO_CAMBIOS:
            descripcion = TEXTO_COT_TEMPRANA_A_BORRADOR
        else:
            descripcion = ("El cliente dice que ya no necesita la solicitud: la cotización vuelve a Borrador; decide "
                           "si la rechazas o la ajustas.")
    elif cot.estado == "BORRADOR":
        descripcion = f"{sobre_la_sc}. Revisa esta cotización antes de enviarla."  # H28 g
    else:
        descripcion = f"{sobre_la_sc}. Revisa esta cotización ({etiqueta_estado('COT', cot.estado)})."
    _log(db, "COT", cot.id, cot.numero, "SC_CAMBIOS_CLIENTE", descripcion, old_estado=old_estado,
         new_estado=new_estado, user_name=USUARIO_DEL_ENLACE,
         extra_data={"tipo": tipo, "comentario": comentario, "sc_numero": sc.numero, "cambios": renglones},
         commit=False)


def _cambios_en_solicitud(db: Session, sc, reclamado: dict, tipo: str, comentario, ahora) -> None:
    """Rama SC (H28-cambios): vuelve a Asignada (Nueva sin asesor, la regla única de Gate 1) sin la confirmación del
    cliente y con la marca cambios_cliente_*; revoca sus otros enlaces, anota CAMBIOS en el usado, deja el renglón
    CAMBIOS_CLIENTE y aplica C20 a sus COT activas. Sin commit: lo hace el endpoint (uno solo)."""
    from app.api.v1.erp_ventas import _documentos_activos_de_solicitud, _estado_tras_reinicio, _log
    old_estado = sc.estado
    sc.estado = _estado_tras_reinicio(sc)
    sc.gate1_confirmed_at = None
    sc.cambios_cliente_at = ahora
    sc.cambios_cliente_tipo = tipo
    sc.cambios_cliente_comentario = comentario
    sc.updated_at = ahora
    revoke_pending_tokens(db, "SC", sc.id, commit=False)  # el enlace usado ya tiene used_at: no se toca
    _anotar_cambios(db, reclamado, sc.numero)
    etiqueta = etiqueta_estado("SC", sc.estado)
    # T20 (M1): la descripción no cita el comentario (va en extra_data, ver pedir_cambios_via_token).
    if tipo == TIPO_CAMBIOS:
        descripcion = (f"El cliente pidió cambios desde el enlace. La solicitud vuelve a {etiqueta} para que la "
                       f"ajustes y se la reenvíes.")
    else:
        descripcion = (f"El cliente dice que ya no necesita esta solicitud. Vuelve a {etiqueta}: decide si la cancelas "
                       f"o la ajustas.")
    _log(db, "SC", sc.id, sc.numero, "CAMBIOS_CLIENTE", descripcion, old_estado=old_estado, new_estado=sc.estado,
         user_name=USUARIO_DEL_ENLACE,
         extra_data=_extra_de_cambios(tipo, comentario, "Estado de la solicitud", etiqueta), commit=False)
    cots_activas, _ = _documentos_activos_de_solicitud(db, sc.id)
    for cot in cots_activas:
        _cambios_en_cotizacion_temprana(db, sc, cot, tipo, comentario, ahora)


def _cambios_en_cotizacion(db: Session, cot, reclamado: dict, comentario, ahora) -> None:
    """Rama COT (U22-cambios con C9): vuelve a Borrador con gate2 None y la marca cambios_cliente_*; revoca sus otros
    enlaces, anota CAMBIOS en el usado y deja el renglón CAMBIOS_CLIENTE. No toca la SC (U15) ni el lead. Sin commit."""
    from app.api.v1.erp_ventas import _log
    old_estado = cot.estado
    cot.estado = "BORRADOR"
    cot.gate2_confirmed_at = None
    cot.cambios_cliente_at = ahora
    cot.cambios_cliente_tipo = TIPO_CAMBIOS
    cot.cambios_cliente_comentario = comentario
    cot.updated_at = ahora
    revoke_pending_tokens(db, "COT", cot.id, commit=False)
    _anotar_cambios(db, reclamado, cot.numero)
    etiqueta = etiqueta_estado("COT", cot.estado)
    # T20 (M1): la descripción no cita el comentario (va en extra_data, ver pedir_cambios_via_token).
    descripcion = (f"El cliente pidió cambios desde el enlace. La cotización vuelve a {etiqueta} para que la ajustes y "
                   f"se la reenvíes.")
    _log(db, "COT", cot.id, cot.numero, "CAMBIOS_CLIENTE", descripcion, old_estado=old_estado, new_estado=cot.estado,
         user_name=USUARIO_DEL_ENLACE,
         extra_data=_extra_de_cambios(TIPO_CAMBIOS, comentario, "Estado de la cotización", etiqueta), commit=False)


def _respuesta_cambios(db: Session, documento: str, doc, info: dict, tipo: str, comentario, asesor: str) -> dict:
    """El 200 de /confirmar/pedir-cambios (H28 j, C26), armado DESPUÉS del commit: {status, estado_enlace
    'cambios_enviados', mensaje, detalle, comentario, empresa, data}. data es el resumen público del documento (la
    misma proyección de /confirmar/ver, nunca _sc_dict/_cot_dict ni el dict de consultar_token). Si armarlo falla (un
    dato viejo malformado), el cambio ya quedó guardado: data None y el error en el registro, nunca un 500."""
    from app.api.v1.erp_ventas import _NOMBRE_DOCUMENTO
    nombre = _NOMBRE_DOCUMENTO[documento]
    if tipo == TIPO_CAMBIOS:
        mensaje = "¡Listo! Recibimos tus cambios."
        detalle = f"{asesor} ajustará tu {nombre} y te enviará un enlace nuevo."
    else:
        mensaje = "Recibimos tu respuesta."
        detalle = f"{asesor} revisará tu respuesta y se pondrá en contacto contigo."
    base = {"status": "success", "estado_enlace": "cambios_enviados", "mensaje": mensaje, "detalle": detalle,
            "comentario": comentario}
    try:
        data = _sc_confirmacion_dict(db, doc) if documento == "SC" else _cot_confirmacion_dict(db, doc, info)
        return {**base, "empresa": perfil_publico(db), "data": data}
    except Exception:
        logger.error("Los cambios del cliente en %s quedaron guardados, pero no se pudo armar la respuesta", documento,
                     exc_info=True)
        db.rollback()
    try:
        empresa = perfil_publico(db)
    except Exception:
        logger.error("Tampoco se pudo leer la empresa para la respuesta de pedir cambios", exc_info=True)
        db.rollback()
        empresa = None
    return {**base, "empresa": empresa, "data": None}


@router.post("/confirmar/pedir-cambios")
def pedir_cambios_via_token(body: PedirCambiosBody, idempotency_key: str = Header(..., alias="Idempotency-Key"),
                            db: Session = Depends(get_db)):
    """C9: un solo endpoint para la SC y la COT, con Idempotency-Key obligatorio como /confirmar/confirmar.
    1) valida el cuerpo a mano (R12): 422 en español SIN tocar el enlace;
    2) consultar_token (sin efectos; solo SC y COT, C11: un enlace del pedido responde 'invalido' y no se gasta): si el
       enlace no está pendiente (vencido, usado, reemplazado, documento que ya no espera al cliente...), 400 con el
       detail de _detalle_enlace (C10, C26) sin gastar nada. NO_LA_NECESITA en una COT es 422, también sin gastarlo;
    3) reclamar_token, atómico y con su propio commit: lo que llegue primero (confirmar o pedir cambios) gana;
    4) rama por tipo con el documento bloqueado (FOR UPDATE) y UN solo commit (_cambios_en_solicitud,
       _cambios_en_cotizacion);
    5) después del commit, el aviso al asesor (erp_ventas._avisar_asesor_por_correo, C17), en try/except: si falla, el
       cliente igual recibe su 200 y el error queda en el registro.
    El comentario del cliente es dato: se guarda como texto, va escapado en el correo y React lo muestra como texto.
    T20 (M1): lo ÚNICO que escribe el cliente son extra_data.comentario (con su renglón «Comentario del cliente» en
    extra_data.cambios) de CAMBIOS_CLIENTE y SC_CAMBIOS_CLIENTE, y cambios_cliente_comentario del documento. Se tratan
    como DATO, nunca como instrucción ni como texto del sistema (también la IA del Bloque 5, que leerá la Actividad):
    por eso ActivityLog.description no lo cita (el cliente podría cerrar las comillas e imitar al sistema)."""
    tipo, comentario = _validar_pedido_de_cambios(body)
    info = consultar_token(db, body.token)
    estado, detalle, _ = _resolver_enlace(db, info)
    if estado == "no_disponible":
        # r1 (seguridad 1): doble clic u otra pestaña. Si el otro POST ya reclamó el enlace pero todavía no guarda su
        # resultado (used_at puesto, resultado None: regla i), esta lectura sin bloqueo diría 'no_disponible'.
        # _detalle_al_confirmar bloquea el documento, espera ese commit y relee el enlace: 'cambios_enviados' o
        # 'confirmada'. Bloquear un documento que ya no está pendiente no cuesta nada.
        raise HTTPException(400, detail=_detalle_al_confirmar(db, body.token))
    if estado != "pendiente":
        raise HTTPException(400, detail=detalle)
    documento = info["document_type"]
    if tipo == TIPO_NO_LA_NECESITA and documento != "SC":
        raise HTTPException(422, MENSAJE_SOLO_SOLICITUD)
    reclamado = reclamar_token(db, body.token)
    if reclamado is None:  # doble clic u otra pestaña: la página muestra en qué quedó el enlace
        raise HTTPException(400, detail=_detalle_al_confirmar(db, body.token))
    doc = _documento_del_enlace(db, reclamado, bloquear=True)
    if doc is None or doc.estado != "PENDIENTE_CONFIRMACION":
        # El enlace ya quedó gastado (como en confirmar): el documento cambió entre la consulta y el bloqueo.
        raise HTTPException(400, detail=_detalle_al_confirmar(db, body.token))
    asesor = _asesor_del_documento(db, doc, documento)  # antes del commit: después el objeto queda expirado
    ahora = ahora_utc()
    if documento == "SC":
        _cambios_en_solicitud(db, doc, reclamado, tipo, comentario, ahora)
    else:
        _cambios_en_cotizacion(db, doc, reclamado, comentario, ahora)
    db.commit()

    try:
        from app.api.v1.erp_ventas import _avisar_asesor_por_correo
        _avisar_asesor_por_correo(db, doc, documento)
    except Exception:
        logger.error("Los cambios del cliente en %s quedaron guardados, pero no se pudo avisar al asesor", documento,
                     exc_info=True)
        db.rollback()
    return _respuesta_cambios(db, documento, doc, info, tipo, comentario, asesor)
