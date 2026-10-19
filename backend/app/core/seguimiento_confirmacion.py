"""Recordatorio automático al cliente si no confirma (Bloque 3, T11: U16-seguimiento, C6, C14, C15, C16, C21, C22, R7,
R8, R13, R20, R23, RP1, RP7, RP16, RP17, RP19, RP20, RP22 y RP28).

Cada envío (o reenvío) de una SC o una COT al cliente llama a iniciar() en el commit único del envío (C21, RP16): queda
programado un recordatorio para dentro de seguimiento_dias (2 por defecto) en horario hábil (lunes a sábado, de 8 a 18
en hora de Colombia, R8). La revisión automática (tareas_automaticas.TAREAS, T10) corre correr_seguimientos cada ~10
min: si el documento sigue en Pendiente por confirmación, le manda al cliente un recordatorio con un enlace NUEVO por el
mismo medio (WhatsApp con la plantilla 'recordatorio' y el correo de respaldo; solo el correo si fue por Email; solo el
correo de respaldo si fue por Otro). Después del último (seguimiento_max, 1 por defecto) y otros N días sin respuesta,
el caso vuelve al asesor (AGOTADO, renglón «Llámalo o escríbele»).

Una fila por documento en seguimientos_confirmacion (models/confirmation.SeguimientoConfirmacion, fa6_031), que iniciar
reusa. NO va en customer_requests ni sales_quotations: su updated_at (onupdate) reiniciaría la alerta de atraso.

PARADAS «AL PASAR». La revisión solo actúa si el documento sigue en PENDIENTE_CONFIRMACION; si no, deja la fila
DETENIDO con motivo_por_estado y sin renglón (el evento que lo sacó ya está en la Actividad): el cliente confirmó,
pidió cambios (la SC vuelve a Asignada y la COT a Borrador, T6), se canceló, se rechazó, se editó o se re-cotizó. Así no
se tocan confirmar_via_token, cancelar_solicitud, update_* ni el «pedir cambios» público. Además (paradas que no cambian
el estado): ENLACE_ANULADO si el último enlace del documento se anuló y no le queda ninguno vivo, sin sacarlo de
Pendiente (cambió el cliente de la COT o de su SC, T5: la Actividad le pide al asesor reenviarla, así que el
recordatorio no le crea uno nuevo a nadie) y COTIZACION_VENCIDA si la COT pasó su valida_hasta (C14; el recordatorio
nunca la renueva). Las paradas se miran al reclamar y OTRA VEZ, con bloqueo, justo antes de cada envío (r1): si
entretanto el cliente confirmó o pidió cambios, el asesor lo reenvió o lo detuvo, o cambió el cliente (la misma regla
_identidad_del_cliente de T5), ese recordatorio no sale ni crea enlace. Enviar la COT de una SC
pendiente (U11) detiene el de la SC (detener_por_cotizacion): el cliente recibe uno solo. Un contacto con el cliente
anotado en el Chatter (R23: erp_ventas._agregar_nota, reinicia_atraso) corre el recordatorio (posponer_por_contacto).

NUNCA DOS VECES EL MISMO RECORDATORIO (contrato de TAREAS de T10). El reclamo es un UPDATE condicional sobre la fila
(recordatorios_enviados = el visto) con las filas tomadas FOR UPDATE SKIP LOCKED, y se confirma ANTES de enviar: si el
proceso cae a mitad, ese recordatorio se pierde, pero nunca se duplica. Dos corridas seguidas (varios workers, «Revisar
ahora») no lo repiten: la segunda ya no lo ve vencido. Un fallo no se reintenta: la fila queda DETENIDO y el asesor
reenvía. CHATWOOT_SIN_RESPUESTA («puede que haya salido», T8) tampoco se reintenta, y su enlace no se anula.

ORDEN DEL ENVÍO (_enviar_recordatorio). Bloqueos siempre documento → fila del seguimiento → enlaces, el orden de los
envíos, el Chatter y el «pedir cambios» (así ningún camino forma un ciclo con otro):
(1) _preparar_envio: con el documento y la fila bloqueados, repite las paradas; si sigue en pie, crea el enlace nuevo en
    esa transacción y la confirma (suelta los bloqueos antes de la red; el enlace sirve en cuanto le llega al cliente).
(2) El envío (enviar o _enviar_por_defecto, que confirma la fila EnvioAlCliente del WhatsApp en cuanto sale, nota del
    controlador tras T8) y un commit.
(3) Con el documento y la fila bloqueados otra vez: si salió y el documento sigue en Pendiente, se anulan los enlaces
    anteriores (excepto_hash) y cuenta como contacto (R7: doc.updated_at); si no salió, se anula el enlace nuevo (nadie
    lo recibió) y el anterior sigue sirviendo. Si el documento dejó de esperar al cliente durante el envío, el enlace
    nuevo se anula y no cuenta como contacto. Si el asesor reenvió o detuvo en medio, la fila ya es de otro ciclo y no
    se toca (solo queda el renglón).

Lo que devuelve correr_seguimientos lo ve cualquier rol en /tareas/estado: solo conteos ({'revisados', 'enviados',
'fallidos', 'agotados', 'detenidos'}) o {'omitido': 'apagado' | 'fuera_de_horario' | 'sin_medios'}.

Sin FastAPI y sin importar erp_ventas al cargarse (import cíclico): los renglones se escriben con ActivityLog
(_registrar). _enviar_por_defecto importa envio_whatsapp y el correo DENTRO de la función (R20: import perezoso, para
el monkeypatch de las pruebas y sin ciclos). RP22: las acciones nuevas son solo 'action'; sus etiquetas, colores e
íconos los pone el frontend (ACCIONES_BLOQUE3, T13).
"""
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session, selectinload

from app.core import admin_config
from app.core.confirmation_tokens import (RESULTADO_REVOCADO, create_confirmation_token, enlace_publico, hash_token,
                                          revocar_token, revoke_pending_tokens)
from app.core.fechas import a_colombia, ahora_utc, fecha_hora_co, fecha_larga, hoy_colombia, iso_z, \
    vence_al_final_del_dia
from app.core.telefonos import e164_whatsapp, telefono_del_documento
from app.core.textos_actividad import autor_de_actividad
from app.models.confirmation import SeguimientoConfirmacion
from app.models.erp_documents import ActivityLog, CustomerRequest, SalesQuotation

logger = logging.getLogger(__name__)

USUARIO_SISTEMA = "Sistema (seguimiento automático)"
MAX_RETRASO = timedelta(days=3)  # un recordatorio vencido hace más que esto (servidor apagado) ya no se envía
REINICIA_ATRASO = True  # R7: el recordatorio que salió cuenta como contacto (doc.updated_at = ahora)
LIMITE_POR_VUELTA = 50  # filas por revisión (statement_timeout de 15 s)

PENDIENTE = "PENDIENTE_CONFIRMACION"
ACTIVO, AGOTADO, DETENIDO, APAGADO = "ACTIVO", "AGOTADO", "DETENIDO", "APAGADO"
_MODELOS = {"SC": CustomerRequest, "COT": SalesQuotation}

# Acciones de la Actividad (RP22: solo la action).
RECORDATORIO_ENVIADO = "RECORDATORIO_ENVIADO"
RECORDATORIO_FALLIDO = "RECORDATORIO_FALLIDO"
SEGUIMIENTO_AGOTADO = "SEGUIMIENTO_AGOTADO"
SEGUIMIENTO_DETENIDO = "SEGUIMIENTO_DETENIDO"

# motivo_fin (VARCHAR(30)).
MOTIVO_SIN_MEDIO = "SIN_MEDIO_CLIENTE"
MOTIVO_FALLO_ENVIO = "FALLO_ENVIO"
MOTIVO_SIN_RESPUESTA = "CHATWOOT_SIN_RESPUESTA"  # T8: «puede que haya salido»; no se reintenta
MOTIVO_PLAZO_PASADO = "PLAZO_PASADO"
MOTIVO_COTIZACION_ENVIADA = "COTIZACION_ENVIADA"
MOTIVO_COTIZACION_VENCIDA = "COTIZACION_VENCIDA"
MOTIVO_ENLACE_ANULADO = "ENLACE_ANULADO"
MOTIVO_MANUAL = "MANUAL"

# ─── Configuración (admin_config, R13; los asesores la leen en solo lectura: _CONFIG_LECTURA_GENERAL) ─────────────

CLAVE_ACTIVO = "seguimiento_auto_activo"
CLAVE_DIAS = "seguimiento_dias"
CLAVE_MAX = "seguimiento_max"
CLAVE_SOLO_HORARIO = "seguimiento_solo_horario"
CLAVE_HORA_INICIO = "seguimiento_hora_inicio"
CLAVE_HORA_FIN = "seguimiento_hora_fin"
# Clave -> valor por defecto (R8: uno solo, a los 2 días, lunes a sábado de 8 a 18).
CLAVES_CONFIG = {
    CLAVE_ACTIVO: "true",
    CLAVE_DIAS: 2,
    CLAVE_MAX: 1,
    CLAVE_SOLO_HORARIO: "true",
    CLAVE_HORA_INICIO: 8,
    CLAVE_HORA_FIN: 18,
}
_LIMITES = {CLAVE_DIAS: (1, 15), CLAVE_MAX: (1, 5), CLAVE_HORA_INICIO: (0, 23), CLAVE_HORA_FIN: (1, 24)}
_BOOLEANOS = (CLAVE_ACTIVO, CLAVE_SOLO_HORARIO)
_MENSAJES = {
    CLAVE_ACTIVO: "El recordatorio automático debe estar encendido o apagado (true o false).",
    CLAVE_SOLO_HORARIO: "«Solo en horario laboral» debe estar encendido o apagado (true o false).",
    CLAVE_DIAS: "Los días antes del recordatorio deben estar entre 1 y 15.",
    CLAVE_MAX: "Los recordatorios deben ser entre 1 y 5.",
    CLAVE_HORA_INICIO: "La hora inicial debe estar entre 0 y 23.",
    CLAVE_HORA_FIN: "La hora final debe estar entre 1 y 24.",
}
MENSAJE_HORARIO = "La hora final debe ser mayor que la inicial."
SIN_PROGRAMAR = "No tiene recordatorios automáticos programados."

# ─── Textos ────────────────────────────────────────────────────────────────────────────────────────────────────────

TEXTO_SIN_MEDIO = "El cliente no tiene teléfono ni correo."
TEXTO_PLAZO_PASADO = ("No se envió el recordatorio automático: venció hace más de 3 días sin poder enviarse. "
                      "Escríbele al cliente si todavía aplica.")
_POR = {"WhatsApp": "por WhatsApp", "correo": "por correo"}
# Las causas van en la descripción del renglón, que ven todos los roles: sin teléfonos ni correos (el detalle con el
# contacto va en extra_data, que _log_dict oculta a los roles que no son ADMIN ni ASESOR).
_CAUSAS_WHATSAPP = {
    "NO_CONFIGURADO": "el WhatsApp automático no está configurado",
    "ENVIO_AUTOMATICO_APAGADO": "el WhatsApp automático está apagado",
    "CHATWOOT_NO_CONFIGURADO": "la conexión con Chatwoot no está configurada",
    "BANDEJA_NO_CONFIGURADA": "falta la bandeja de WhatsApp de Chatwoot en Configuración",
    "TELEFONO_INVALIDO": "el teléfono del cliente no es un WhatsApp válido",
    "FUERA_DE_VENTANA_SIN_PLANTILLA": "falta la plantilla de recordatorio aprobada por Meta",
    "FALLO_CHATWOOT": "Chatwoot rechazó el WhatsApp",
    "CHATWOOT_SIN_RESPUESTA": "Chatwoot no confirmó el WhatsApp (puede que haya salido)",
}
_CAUSAS_CORREO = {
    "SIN_CORREO_CLIENTE": "el cliente no tiene correo registrado",
    "CORREO_NO_CONFIGURADO": "el envío de correos no está configurado",
    "FALLO_ENVIO": "falló el servidor de correo",
    "MENSAJE_SIN_ARMAR": "no se pudo armar el mensaje: revisa la dirección pública del ERP (FRONTEND_URL)",
}
WHATSAPP_NO_CONFIGURADO = {"enviado": False, "motivo": "NO_CONFIGURADO",
                           "mensaje": "El WhatsApp automático no está configurado."}
CANAL_OTRO = "CANAL_OTRO"


# ─── Configuración ─────────────────────────────────────────────────────────────────────────────────────────────────

def _booleano(valor):
    """True/False de un bool o de 'true'/'false' (sin importar mayúsculas ni espacios); None si es otra cosa."""
    if isinstance(valor, bool):
        return valor
    if isinstance(valor, str) and valor.strip().lower() in ("true", "false"):
        return valor.strip().lower() == "true"
    return None


def _entero(valor):
    """El int de un entero (no bool) o de un texto de dígitos ASCII (los espacios de los bordes no cuentan); si no,
    None ('2.5', '-1', '', True)."""
    if isinstance(valor, bool):
        return None
    if isinstance(valor, int):
        return valor
    if isinstance(valor, str) and valor.strip().isascii() and valor.strip().isdigit():
        return int(valor.strip())
    return None


def validar_valor(clave: str, valor) -> str:
    """El texto a guardar de una clave seguimiento_* de PATCH /ventas/config, o ValueError con el mensaje en español del
    422 (R13). Pura (RP21: T13 la compara con validarConfigSeguimiento del frontend). Los interruptores aceptan un bool
    o 'true'/'false' y se guardan 'true'/'false'; los números, un entero o un texto de dígitos dentro de sus límites. La
    regla que cruza dos claves (hora final mayor que la inicial) es validar_horario."""
    if clave in _BOOLEANOS:
        b = _booleano(valor)
        if b is None:
            raise ValueError(_MENSAJES[clave])
        return "true" if b else "false"
    if clave in _LIMITES:
        n = _entero(valor)
        minimo, maximo = _LIMITES[clave]
        if n is None or not minimo <= n <= maximo:
            raise ValueError(_MENSAJES[clave])
        return str(n)
    raise ValueError(f"Clave de seguimiento desconocida: {clave}.")


def validar_horario(hora_inicio: int, hora_fin: int) -> None:
    """ValueError(MENSAJE_HORARIO) si la hora final no es mayor que la inicial. Pura."""
    if hora_fin <= hora_inicio:
        raise ValueError(MENSAJE_HORARIO)


def validar_cambios_de_config(db: Session, cambios: dict) -> None:
    """update_config, después de validar_valor clave por clave: si el cambio toca alguna de las dos horas, la final debe
    quedar mayor que la inicial, combinando el body con lo guardado (o el valor por defecto). ValueError -> 422."""
    if CLAVE_HORA_INICIO not in cambios and CLAVE_HORA_FIN not in cambios:
        return
    cfg = leer_config(db)
    inicio = int(cambios[CLAVE_HORA_INICIO]) if CLAVE_HORA_INICIO in cambios else cfg["hora_inicio"]
    fin = int(cambios[CLAVE_HORA_FIN]) if CLAVE_HORA_FIN in cambios else cfg["hora_fin"]
    validar_horario(inicio, fin)


def leer_config(db: Session) -> dict:
    """{activo, dias, max, solo_horario, hora_inicio, hora_fin} de admin_config con UN SELECT (admin_config.leer_config,
    RP17). Un interruptor que no es 'true'/'false' usa su defecto; un número que no es entero, su defecto, y uno fuera
    de rango, el límite (R13, admin_config.entero_acotado). Si lo guardado deja la hora final antes que la inicial, las
    dos vuelven a 8 y 18."""
    guardado = admin_config.leer_config(db, CLAVES_CONFIG)

    def interruptor(clave):
        b = _booleano(guardado.get(clave))
        return _booleano(CLAVES_CONFIG[clave]) if b is None else b

    def numero(clave):
        return admin_config.entero_acotado(guardado.get(clave), CLAVES_CONFIG[clave], *_LIMITES[clave])

    cfg = {"activo": interruptor(CLAVE_ACTIVO), "dias": numero(CLAVE_DIAS), "max": numero(CLAVE_MAX),
           "solo_horario": interruptor(CLAVE_SOLO_HORARIO), "hora_inicio": numero(CLAVE_HORA_INICIO),
           "hora_fin": numero(CLAVE_HORA_FIN)}
    if cfg["hora_fin"] <= cfg["hora_inicio"]:
        cfg["hora_inicio"], cfg["hora_fin"] = CLAVES_CONFIG[CLAVE_HORA_INICIO], CLAVES_CONFIG[CLAVE_HORA_FIN]
    return cfg


# ─── Horario (hora de Colombia, RP1: core/fechas) ──────────────────────────────────────────────────────────────────

def siguiente_momento(desde_utc: datetime, cfg: dict) -> datetime:
    """Cuándo sale el próximo recordatorio (UTC sin zona): desde + cfg['dias'] días. Con solo_horario, en hora de
    Colombia: un domingo o desde hora_fin pasa al día siguiente a hora_inicio:00; antes de hora_inicio, ese mismo día a
    hora_inicio:00; hasta que no sea domingo. Los festivos no se excluyen (hueco 8h)."""
    base = desde_utc + timedelta(days=cfg["dias"])
    if not cfg["solo_horario"]:
        return base
    co = a_colombia(base)
    for _ in range(14):
        if co.weekday() == 6 or co.hour >= cfg["hora_fin"]:
            co = (co + timedelta(days=1)).replace(hour=cfg["hora_inicio"], minute=0, second=0, microsecond=0)
        elif co.hour < cfg["hora_inicio"]:
            co = co.replace(hour=cfg["hora_inicio"], minute=0, second=0, microsecond=0)
        else:
            break
    return co.astimezone(timezone.utc).replace(tzinfo=None)


def dentro_de_horario(ahora_utc_: datetime, cfg: dict) -> bool:
    """True de lunes a sábado entre hora_inicio y hora_fin (sin incluirla), en hora de Colombia."""
    co = a_colombia(ahora_utc_)
    return co.weekday() != 6 and cfg["hora_inicio"] <= co.hour < cfg["hora_fin"]


# ─── Medios ────────────────────────────────────────────────────────────────────────────────────────────────────────

def medio_posible(canal, doc) -> bool:
    """Hay forma de llegarle al cliente: por WhatsApp si el canal es WhatsApp y el teléfono del documento (o de su
    ficha, C27/RP20) es un e164 válido (RP19), o por correo (el de respaldo siempre cuenta) si tiene correo."""
    whatsapp = canal == "WhatsApp" and e164_whatsapp(telefono_del_documento(doc)) is not None
    return whatsapp or bool((getattr(doc, "customer_email", None) or "").strip())


def medios_configurados(db: Session) -> dict:
    """{'whatsapp': el envío automático está listo (envio_whatsapp.whatsapp_configurado), 'correo': hay SMTP}.
    Imports dentro de la función (R20): las pruebas los reemplazan con monkeypatch."""
    from app.core import email as correo
    from app.core import envio_whatsapp
    return {"whatsapp": bool(envio_whatsapp.whatsapp_configurado(db)), "correo": bool(correo.smtp_configurado())}


# ─── Filas y renglones ─────────────────────────────────────────────────────────────────────────────────────────────

def _fila_de(db: Session, tipo: str, doc_id: int, bloquear: bool = False):
    q = db.query(SeguimientoConfirmacion).filter(SeguimientoConfirmacion.document_type == tipo,
                                                 SeguimientoConfirmacion.document_id == doc_id)
    if bloquear:
        q = q.with_for_update()
    return q.populate_existing().one_or_none()


def _fila_por_id(db: Session, fila_id: int):
    return (db.query(SeguimientoConfirmacion).filter(SeguimientoConfirmacion.id == fila_id)
            .with_for_update().populate_existing().one_or_none())


def _terminar(fila, estado: str, motivo, ahora: datetime, resultado: dict | None = None) -> None:
    fila.estado = estado
    fila.motivo_fin = motivo
    fila.proximo_at = None
    fila.terminado_at = ahora
    if resultado is not None:
        fila.ultimo_resultado = resultado  # siempre un dict nuevo: el JSON se detecta por reasignación


def _registrar(db: Session, tipo: str, doc_id: int, numero, action: str, texto: str, extra: dict | None = None,
               user_name: str = USUARIO_SISTEMA) -> None:
    """Un renglón en la Actividad del documento, sin commit (lo confirma quien llama). Sin erp_ventas._log (ciclo)."""
    db.add(ActivityLog(entity_type=tipo, entity_id=doc_id, entity_numero=numero, action=action, description=texto,
                       user_name=autor_de_actividad(user_name) or USUARIO_SISTEMA, extra_data=extra))


def motivo_por_estado(doc) -> str:
    """Por qué se detiene el recordatorio de un documento que ya no está en Pendiente por confirmación."""
    if doc is None:
        return "DOCUMENTO_NO_EXISTE"
    estado = doc.estado
    if estado in ("CONFIRMADA", "CONVERTIDA", "COTIZADA"):
        return "CONFIRMADO"
    if estado == "CANCELADA":
        return "CANCELADO"
    if estado in ("RECHAZADA", "VENCIDA"):
        return "RECHAZADO"
    if estado in ("BORRADOR", "ASIGNADA", "ENVIADA"):
        return "VOLVIO_AL_ASESOR"  # pidió cambios, se editó o se re-cotizó
    return "SALIO_DE_PENDIENTE"


def resumen(db: Session, tipo: str, doc, cfg: dict | None = None, fila=None) -> dict | None:
    """El estado del recordatorio para la pantalla (detalle, respuesta del envío y de la parada manual), o None si el
    documento no está en Pendiente por confirmación o no tiene fila. {estado ('APAGADO' si está ACTIVO y apagado en
    Configuración), canal, recordatorios_enviados, max, proximo_at, ultimo_recordatorio_at (ISO con 'Z'), motivo_fin,
    ultimo_resultado: {canal, motivo, mensaje} | None (sin teléfonos ni correos)}."""
    if doc is None or getattr(doc, "estado", None) != PENDIENTE:
        return None
    fila = fila if fila is not None else _fila_de(db, tipo, doc.id)
    if fila is None:
        return None
    cfg = cfg if cfg is not None else leer_config(db)
    ultimo = fila.ultimo_resultado if isinstance(fila.ultimo_resultado, dict) else None
    return {
        "estado": APAGADO if fila.estado == ACTIVO and not cfg["activo"] else fila.estado,
        "canal": fila.canal,
        "recordatorios_enviados": fila.recordatorios_enviados,
        "max": cfg["max"],
        "proximo_at": iso_z(fila.proximo_at),
        "ultimo_recordatorio_at": iso_z(fila.ultimo_recordatorio_at),
        "motivo_fin": fila.motivo_fin,
        "ultimo_resultado": {k: ultimo.get(k) for k in ("canal", "motivo", "mensaje")} if ultimo else None,
    }


def texto_para_el_envio(seguimiento: dict | None):
    """El renglón 'Recordatorio automático' del envío (C16, _detalle_envio): la fecha en hora de Colombia, 'apagado en
    Configuración' o 'no habrá: el cliente no tiene teléfono ni correo'. None si no aplica."""
    if not seguimiento:
        return None
    if seguimiento["estado"] == ACTIVO:
        return fecha_hora_co(seguimiento["proximo_at"])
    if seguimiento["estado"] == APAGADO:
        return "apagado en Configuración"
    if seguimiento["estado"] == DETENIDO and seguimiento["motivo_fin"] == MOTIVO_SIN_MEDIO:
        return "no habrá: el cliente no tiene teléfono ni correo"
    return None


def estados_para_alertas(db: Session, tipo: str, docs) -> dict:
    """{doc_id: 'AGOTADO' | 'DETENIDO'} de los documentos de `docs` que siguen en Pendiente por confirmación, con UNA
    consulta IN (sin N+1). Lo usa get_alertas (seguimiento_estado; el chip «Sin respuesta al recordatorio»)."""
    ids = [d.id for d in docs if getattr(d, "estado", None) == PENDIENTE]
    if not ids:
        return {}
    filas = (db.query(SeguimientoConfirmacion.document_id, SeguimientoConfirmacion.estado)
             .filter(SeguimientoConfirmacion.document_type == tipo, SeguimientoConfirmacion.document_id.in_(ids),
                     SeguimientoConfirmacion.estado.in_((AGOTADO, DETENIDO)))
             .all())
    return {doc_id: estado for doc_id, estado in filas}


# ─── Lo que llaman los endpoints (sin commit: lo hace quien llama) ─────────────────────────────────────────────────

def iniciar(db: Session, tipo: str, doc, canal, user_name, ahora: datetime | None = None) -> dict:
    """Programa el recordatorio al enviar o reenviar `doc` ('SC' | 'COT'), con `doc` ya en Pendiente por confirmación:
    upsert de la fila (bloqueada) en ACTIVO, con el contador en 0, el canal del envío y proximo_at =
    siguiente_momento(ahora). Si no hay forma de llegarle al cliente (medio_posible), DETENIDO 'SIN_MEDIO_CLIENTE'. Se
    programa aunque el seguimiento esté apagado en Configuración (la tarjeta lo dice). Sin commit: va en el commit único
    del envío (C21, RP16). Devuelve resumen()."""
    ahora = ahora or ahora_utc()
    cfg = leer_config(db)
    fila = _fila_de(db, tipo, doc.id, bloquear=True)
    if fila is None:
        fila = SeguimientoConfirmacion(document_type=tipo, document_id=doc.id)
        db.add(fila)
    fila.document_numero = doc.numero
    fila.canal = canal
    fila.estado = ACTIVO
    fila.iniciado_at = ahora
    fila.iniciado_por = autor_de_actividad(user_name)
    fila.ultimo_contacto_at = ahora
    fila.proximo_at = siguiente_momento(ahora, cfg)
    fila.recordatorios_enviados = 0
    fila.ultimo_recordatorio_at = None
    fila.ultimo_resultado = None
    fila.motivo_fin = None
    fila.terminado_at = None
    if not medio_posible(canal, doc):
        _terminar(fila, DETENIDO, MOTIVO_SIN_MEDIO, ahora,
                  {"canal": canal, "motivo": MOTIVO_SIN_MEDIO, "mensaje": TEXTO_SIN_MEDIO})
    db.flush()
    return resumen(db, tipo, doc, cfg=cfg, fila=fila)


def detener_por_cotizacion(db: Session, sc_id: int, cot_numero, ahora: datetime | None = None,
                           user_name=None) -> bool:
    """U11: al enviar la COT de una SC que sigue en Pendiente por confirmación, el recordatorio de la SC se detiene
    (COTIZACION_ENVIADA) con un renglón en la SC: al confirmar la COT se confirma la SC, y así el cliente no recibe dos
    recordatorios. True si la detuvo. Sin commit (antes del commit del envío de la COT, C21). r1 (P3): el renglón va a
    nombre de quien envió la COT (`user_name`, de la sesión: RP15); USUARIO_SISTEMA solo si no llega."""
    ahora = ahora or ahora_utc()
    fila = _fila_de(db, "SC", sc_id, bloquear=True)
    if fila is None or fila.estado != ACTIVO:
        return False
    sc = db.get(CustomerRequest, sc_id)
    if sc is None or sc.estado != PENDIENTE:
        return False
    _terminar(fila, DETENIDO, MOTIVO_COTIZACION_ENVIADA, ahora)
    _registrar(db, "SC", sc.id, sc.numero, SEGUIMIENTO_DETENIDO,
               f"Recordatorios de la solicitud detenidos: ahora se le recuerda la cotización {cot_numero}",
               user_name=autor_de_actividad(user_name) or USUARIO_SISTEMA)
    return True


def posponer_por_contacto(db: Session, tipo: str, doc_id: int, ahora: datetime | None = None) -> bool:
    """R23: un contacto con el cliente anotado en el Chatter (llamada, WhatsApp, correo o nota externa) corre el
    recordatorio: ultimo_contacto_at = ahora y proximo_at = siguiente_momento(ahora). El contador no cambia y no hay
    renglón propio (la nota del Chatter ya queda). Solo si la fila está ACTIVO. True si lo corrió. Sin commit."""
    ahora = ahora or ahora_utc()
    fila = _fila_de(db, tipo, doc_id, bloquear=True)
    if fila is None or fila.estado != ACTIVO:
        return False
    fila.ultimo_contacto_at = ahora
    fila.proximo_at = siguiente_momento(ahora, leer_config(db))
    return True


def detener_manual(db: Session, tipo: str, doc, user_name, ahora: datetime | None = None) -> None:
    """«No enviar recordatorios»: exige la fila ACTIVO y el documento en Pendiente por confirmación; si no,
    ValueError(SIN_PROGRAMAR) (409). La deja DETENIDO 'MANUAL' con el renglón «{user} detuvo los recordatorios
    automáticos.» a nombre de la sesión (RP15). Sin commit."""
    ahora = ahora or ahora_utc()
    fila = _fila_de(db, tipo, doc.id, bloquear=True)
    if fila is None or fila.estado != ACTIVO or doc.estado != PENDIENTE:
        raise ValueError(SIN_PROGRAMAR)
    _terminar(fila, DETENIDO, MOTIVO_MANUAL, ahora)
    autor = autor_de_actividad(user_name) or USUARIO_SISTEMA
    _registrar(db, tipo, doc.id, doc.numero, SEGUIMIENTO_DETENIDO, f"{autor} detuvo los recordatorios automáticos.",
               user_name=autor)


# ─── La revisión automática ────────────────────────────────────────────────────────────────────────────────────────

@dataclass
class _Reclamo:
    """Un recordatorio reclamado: lo que se necesita para enviarlo y para reconocer su ciclo después del commit.
    identidad: a quién le llegaba el enlace al reclamar (_identidad); si cambia antes de enviar, no sale (r1, P4)."""
    fila_id: int
    tipo: str
    doc: object
    doc_id: int
    numero: str
    n: int
    canal: str | None
    iniciado_at: datetime
    identidad: tuple


# Resultado de _enviar_recordatorio (la clave del conteo de correr_seguimientos).
ENVIADO, FALLIDO, NO_SALIO = "enviados", "fallidos", "detenidos"


def _cargar_documentos(db: Session, filas) -> dict:
    """{(tipo, id): documento} con una consulta por tipo (y la ficha del cliente, para el teléfono, RP20)."""
    docs = {}
    for tipo, modelo in _MODELOS.items():
        ids = [f.document_id for f in filas if f.document_type == tipo]
        if ids:
            for doc in db.query(modelo).filter(modelo.id.in_(ids)).options(selectinload(modelo.customer)).all():
                docs[(tipo, doc.id)] = doc
    return docs


_SQL_ENLACES = text("""
    SELECT (SELECT resultado FROM document_confirmation_tokens
            WHERE document_type = :tipo AND document_id = :id
            ORDER BY created_at DESC, id DESC LIMIT 1) AS ultimo,
           EXISTS (SELECT 1 FROM document_confirmation_tokens
                   WHERE document_type = :tipo AND document_id = :id AND used_at IS NULL AND expires_at > :ahora)
               AS hay_vivo
""")


def _enlace_anulado(db: Session, tipo: str, doc_id: int) -> bool:
    """El enlace más reciente del documento fue ANULADO (resultado REVOCADO) y no le queda NINGÚN enlace vivo, sin que el
    documento saliera de Pendiente: lo hace el cambio de cliente de una COT o de su SC (T5), que los revoca todos. Uno
    vencido sin usar no cuenta (el de la SC vence a los 2 días: para eso es el recordatorio). r1 (C2 = I2): si queda un
    enlace vivo (p. ej. el de un reenvío del asesor, con un recordatorio fallido REVOCADO más nuevo), el cliente todavía
    puede confirmar y el ciclo sigue. Por el índice (document_type, document_id)."""
    fila = db.execute(_SQL_ENLACES, {"tipo": tipo, "id": doc_id, "ahora": ahora_utc()}).first()
    return fila is not None and fila.ultimo == RESULTADO_REVOCADO and not fila.hay_vivo


def _identidad(doc) -> tuple:
    """A quién le llega el enlace del documento: erp_ventas._identidad_del_cliente (ficha, correo, teléfono y nombre),
    la ÚNICA regla de cambio de cliente (T5). Import dentro de la función: este módulo no importa erp_ventas al
    cargarse."""
    from app.api.v1.erp_ventas import _identidad_del_cliente
    return _identidad_del_cliente(doc)


def _parada_del_documento(db: Session, tipo: str, doc, hoy: date):
    """La parada «al pasar» que ya aplica por el documento, o None: (motivo, texto del renglón o None).
    - No existe o no está en Pendiente por confirmación: motivo_por_estado, sin renglón (el evento ya está en la
      Actividad). Con la marca de cambios pedidos (que en Pendiente no debería quedar): VOLVIO_AL_ASESOR.
    - Su último enlace se anuló y no le queda ninguno vivo (cambio de cliente, T5): ENLACE_ANULADO, sin renglón.
    - La COT pasó su valida_hasta (C14): COTIZACION_VENCIDA, con el renglón «La cotización venció el …»."""
    if doc is None or doc.estado != PENDIENTE:
        return motivo_por_estado(doc), None
    if getattr(doc, "cambios_cliente_at", None) is not None:
        return "VOLVIO_AL_ASESOR", None
    if _enlace_anulado(db, tipo, doc.id):
        return MOTIVO_ENLACE_ANULADO, None
    if tipo == "COT" and isinstance(doc.valida_hasta, date) and doc.valida_hasta < hoy:
        return MOTIVO_COTIZACION_VENCIDA, (f"La cotización venció el {fecha_larga(doc.valida_hasta)} sin respuesta: "
                                           f"re-cotízala o reenvíala.")
    return None


def _cerrar_por_parada(db: Session, fila, tipo: str, doc, motivo: str, texto, ahora: datetime) -> None:
    """Deja la fila DETENIDO con el motivo de la parada y, si la parada lo trae, su renglón (SEGUIMIENTO_DETENIDO)."""
    resultado = {"canal": fila.canal, "motivo": motivo, "mensaje": texto} if texto else None
    _terminar(fila, DETENIDO, motivo, ahora, resultado)
    if texto:
        _registrar(db, tipo, doc.id, doc.numero, SEGUIMIENTO_DETENIDO, texto)


def _texto_agotado(n: int) -> str:
    cuantos = "1 recordatorio automático" if n == 1 else f"{n} recordatorios automáticos"
    return f"El cliente no respondió {cuantos}. Llámalo o escríbele: el sistema ya no le enviará más."


_SQL_RECLAMAR = text("""
    UPDATE seguimientos_confirmacion
    SET recordatorios_enviados = recordatorios_enviados + 1, ultimo_recordatorio_at = :ahora,
        proximo_at = :siguiente, updated_at = :real
    WHERE id = :id AND estado = 'ACTIVO' AND recordatorios_enviados = :visto
""")


def _reclamar(db: Session, fila_id: int, visto: int, ahora: datetime | None = None,
              siguiente: datetime | None = None) -> bool:
    """Toma el recordatorio número visto + 1 de la fila con un UPDATE condicional: rowcount 1 gana; 0 significa que otra
    copia ya lo tomó (o que la fila cambió). Deja proximo_at en `siguiente` (por defecto, siguiente_momento(ahora)): la
    vuelta siguiente ya no lo ve vencido. Sin commit."""
    ahora = ahora or ahora_utc()
    if siguiente is None:
        siguiente = siguiente_momento(ahora, leer_config(db))
    resultado = db.execute(_SQL_RECLAMAR, {"id": fila_id, "visto": visto, "ahora": ahora, "siguiente": siguiente,
                                           "real": ahora_utc()})
    return resultado.rowcount == 1


def _revisar_vencidos(db: Session, ahora: datetime, cfg: dict, conteo: dict) -> list:
    """Los ACTIVO vencidos (por el índice (estado, proximo_at), LIMIT 50, FOR UPDATE SKIP LOCKED): detiene o agota los
    que ya no deben salir y reclama los demás. Sin commit (lo hace correr_seguimientos antes de enviar)."""
    filas = (db.query(SeguimientoConfirmacion)
             .filter(SeguimientoConfirmacion.estado == ACTIVO, SeguimientoConfirmacion.proximo_at <= ahora)
             .order_by(SeguimientoConfirmacion.proximo_at, SeguimientoConfirmacion.id)
             .limit(LIMITE_POR_VUELTA).with_for_update(skip_locked=True).populate_existing().all())
    docs = _cargar_documentos(db, filas)
    hoy = hoy_colombia(ahora)
    siguiente = siguiente_momento(ahora, cfg)
    reclamados = []
    for fila in filas:
        conteo["revisados"] += 1
        tipo = fila.document_type
        doc = docs.get((tipo, fila.document_id))
        parada = _parada_del_documento(db, tipo, doc, hoy)
        if parada is not None:
            _cerrar_por_parada(db, fila, tipo, doc, *parada, ahora)
            conteo["detenidos"] += 1
        elif fila.recordatorios_enviados >= cfg["max"]:
            # Antes que el plazo pasado: aquí no sale nada al cliente, solo se le avisa al asesor. No toca updated_at:
            # la alerta roja hace su trabajo.
            _terminar(fila, AGOTADO, None, ahora)
            _registrar(db, tipo, doc.id, doc.numero, SEGUIMIENTO_AGOTADO, _texto_agotado(fila.recordatorios_enviados))
            conteo["agotados"] += 1
        elif ahora - fila.proximo_at > MAX_RETRASO:
            _terminar(fila, DETENIDO, MOTIVO_PLAZO_PASADO, ahora,
                      {"canal": fila.canal, "motivo": MOTIVO_PLAZO_PASADO,
                       "mensaje": "Venció hace más de 3 días sin poder enviarse."})
            _registrar(db, tipo, doc.id, doc.numero, RECORDATORIO_FALLIDO, TEXTO_PLAZO_PASADO)
            conteo["detenidos"] += 1
        elif _reclamar(db, fila.id, fila.recordatorios_enviados, ahora, siguiente):
            reclamados.append(_Reclamo(fila_id=fila.id, tipo=tipo, doc=doc, doc_id=doc.id, numero=doc.numero,
                                       n=fila.recordatorios_enviados + 1, canal=fila.canal,
                                       iniciado_at=fila.iniciado_at, identidad=_identidad(doc)))
    return reclamados


def correr_seguimientos(db: Session, ahora: datetime | None = None, enviar=None) -> dict:
    """La tarea de la revisión automática (tareas_automaticas.TAREAS, al final). `ahora` en UTC sin zona; `enviar`
    reemplaza a _enviar_por_defecto en las pruebas.

    (a) Apagado en Configuración -> {'omitido': 'apagado'}; solo en horario y fuera de él -> 'fuera_de_horario'; sin
        WhatsApp automático ni SMTP -> 'sin_medios' (Configuración lo avisa). En los tres no se toca ninguna fila.
    (b) Reclama en una transacción (_revisar_vencidos) y la CONFIRMA antes de enviar: nunca dos veces el mismo.
    (c) Envía uno por uno; justo antes de cada uno vuelve a mirar el documento con bloqueo (r1): lo que ya no debe
        salir cuenta en 'detenidos'. Un error en uno queda en el log y en su Actividad, y no frena a los demás.
    Devuelve solo conteos (lo ve cualquier rol en /tareas/estado)."""
    ahora = ahora or ahora_utc()
    cfg = leer_config(db)
    if not cfg["activo"]:
        return {"omitido": "apagado"}
    if cfg["solo_horario"] and not dentro_de_horario(ahora, cfg):
        return {"omitido": "fuera_de_horario"}
    medios = medios_configurados(db)
    if not (medios["whatsapp"] or medios["correo"]):
        return {"omitido": "sin_medios"}
    enviar = enviar or _enviar_por_defecto
    conteo = {"revisados": 0, "enviados": 0, "fallidos": 0, "agotados": 0, "detenidos": 0}
    reclamados = _revisar_vencidos(db, ahora, cfg, conteo)
    db.commit()  # se guarda primero y se envía después: si el proceso cae a mitad, se pierde uno pero no se duplica
    for reclamo in reclamados:
        try:
            resultado = _enviar_recordatorio(db, reclamo, cfg, enviar, ahora)
        except Exception:
            db.rollback()
            logger.exception("No se pudo completar el recordatorio automático de %s %s", reclamo.tipo, reclamo.numero)
            _anotar_error_del_sistema(db, reclamo, ahora)
            resultado = FALLIDO
        conteo[resultado] += 1
    return conteo


# ─── El envío de un recordatorio ───────────────────────────────────────────────────────────────────────────────────

def _salio(resultado) -> bool:
    return isinstance(resultado, dict) and resultado.get("enviado") is True


def _mismo_ciclo(fila, reclamo: _Reclamo) -> bool:
    """La fila sigue en el ciclo que se reclamó: nadie la reenvió (iniciar), la detuvo ni la corrió a otro número."""
    return (fila is not None and fila.estado == ACTIVO and fila.recordatorios_enviados == reclamo.n
            and fila.iniciado_at == reclamo.iniciado_at)


def _causas(wa, co) -> list:
    """Por qué no salió, en palabras y sin datos de contacto (va en la descripción del renglón)."""
    causas = []
    if isinstance(wa, dict) and not wa.get("enviado") and wa.get("motivo") not in (None, CANAL_OTRO):
        causas.append(_CAUSAS_WHATSAPP.get(wa["motivo"], "el WhatsApp no salió"))
    if isinstance(co, dict) and not co.get("enviado"):
        causas.append(_CAUSAS_CORREO.get(co.get("motivo"), "el correo no salió"))
    return causas


def _motivo_del_fallo(wa, co) -> str:
    """SIN_MEDIO_CLIENTE si el cliente no tiene correo ni un WhatsApp útil (o el canal no era WhatsApp); si no,
    FALLO_ENVIO (el sistema no pudo enviar)."""
    sin_correo = not isinstance(co, dict) or co.get("motivo") == "SIN_CORREO_CLIENTE"
    sin_whatsapp = not isinstance(wa, dict) or wa.get("motivo") in (CANAL_OTRO, "TELEFONO_INVALIDO")
    return MOTIVO_SIN_MEDIO if sin_correo and sin_whatsapp else MOTIVO_FALLO_ENVIO


def _cambios(canal, wa, co, proximo_paso=None) -> list:
    """Los renglones del recordatorio, con las etiquetas del envío (C16) y sin clave 'campo': Canal de envío, WhatsApp,
    Mensaje (sin el enlace), Correo de respaldo (o Correo) y Próximo paso. Cada uno solo si aplica."""
    cambios = []
    if canal:
        cambios.append({"etiqueta": "Canal de envío", "despues": canal})
    if isinstance(wa, dict) and wa.get("motivo") != CANAL_OTRO:
        cambios.append({"etiqueta": "WhatsApp", "despues": wa.get("mensaje") or ""})
        if wa.get("texto"):
            cambios.append({"etiqueta": "Mensaje", "despues": wa["texto"]})
    if isinstance(co, dict):
        cambios.append({"etiqueta": "Correo" if canal == "Email" else "Correo de respaldo",
                        "despues": co.get("mensaje") or ""})
    if proximo_paso:
        cambios.append({"etiqueta": "Próximo paso", "despues": proximo_paso})
    return cambios


def _extra(reclamo: _Reclamo, cfg: dict, wa, co, cambios: list) -> dict:
    """extra_data del renglón, con la forma de _extra_data_de_envio (canal, correo, whatsapp) para que _log_dict le quite
    el correo y el teléfono a los roles que no los ven (S3), más 'seguimiento': {numero, max, canal}."""
    extra = {"seguimiento": {"numero": reclamo.n, "max": cfg["max"], "canal": reclamo.canal},
             "canal": reclamo.canal,
             "correo": {k: co.get(k) for k in ("enviado", "destino", "motivo")} if isinstance(co, dict) else None,
             "cambios": cambios}
    if isinstance(wa, dict) and wa.get("motivo") != CANAL_OTRO:
        extra["whatsapp"] = {k: wa.get(k) for k in ("enviado", "estado", "modo", "destino", "motivo", "envio_id")}
    return extra


def _texto_error_del_sistema(n: int) -> str:
    return (f"No se pudo completar el recordatorio automático {n} por un error del sistema. Revisa si le llegó al "
            f"cliente antes de escribirle.")


def _anotar_error_del_sistema(db: Session, reclamo: _Reclamo, ahora: datetime) -> None:
    """Tras un error inesperado (ya revertido): la fila de ese ciclo queda DETENIDO 'FALLO_ENVIO' (no se reintenta: pudo
    haber salido) y el asesor lo ve en la Actividad. Si tampoco se puede anotar, queda solo en el log."""
    try:
        fila = _fila_por_id(db, reclamo.fila_id)
        if _mismo_ciclo(fila, reclamo):
            _terminar(fila, DETENIDO, MOTIVO_FALLO_ENVIO, ahora,
                      {"canal": reclamo.canal, "motivo": MOTIVO_FALLO_ENVIO, "mensaje": "Error del sistema."})
        _registrar(db, reclamo.tipo, reclamo.doc_id, reclamo.numero, RECORDATORIO_FALLIDO,
                   _texto_error_del_sistema(reclamo.n))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("No se pudo anotar el error del recordatorio de %s %s", reclamo.tipo, reclamo.numero)


TEXTO_QUIZAS_SALIO = "No se confirmó: Chatwoot no confirmó el WhatsApp y puede que haya salido."


def _bloquear(db: Session, reclamo: _Reclamo) -> tuple:
    """(documento, fila del seguimiento) releídos con bloqueo y EN ESE ORDEN, el de los envíos, el Chatter y el «pedir
    cambios» del cliente: documento → fila → enlaces. Así un reenvío del asesor en el mismo instante no forma un ciclo
    con la revisión (PostgreSQL abortaría uno de los dos)."""
    modelo = _MODELOS[reclamo.tipo]
    doc = (db.query(modelo).filter(modelo.id == reclamo.doc_id)
           .with_for_update().populate_existing().one_or_none())
    return doc, _fila_por_id(db, reclamo.fila_id)


def _preparar_envio(db: Session, reclamo: _Reclamo, ahora: datetime):
    """r1 (I4 = P4): justo antes de crear el enlace, vuelve a mirar CON BLOQUEO el documento y la fila (la revisión los
    leyó al reclamar, quizá varios envíos antes) y repite las paradas: que siga en Pendiente, sin cambios pedidos, con
    un enlace que el cliente todavía pueda usar, la COT vigente, la misma identidad del cliente (_identidad) y el mismo
    ciclo de la fila (nadie lo reenvió ni lo detuvo a mano).
    - Otro ciclo: la fila es del asesor (reenvío o parada manual) y no se toca.
    - Una parada: la fila se cierra con su motivo (ENLACE_ANULADO si cambió el cliente).
    En los dos casos no se crea enlace ni sale nada, y devuelve None. Si sigue en pie, crea el enlace en ESTA misma
    transacción (commit=False) y confirma, para soltar los bloqueos antes de hablar con Chatwoot y con el SMTP (y para
    que el enlace sirva en cuanto le llega al cliente). Devuelve su token crudo. C14: el enlace de una COT vence con su
    validez (que el recordatorio nunca cambia); el de la SC, a los 2 días."""
    doc, fila = _bloquear(db, reclamo)
    if not _mismo_ciclo(fila, reclamo):
        db.commit()
        return None
    parada = _parada_del_documento(db, reclamo.tipo, doc, hoy_colombia(ahora))
    if parada is None and _identidad(doc) != reclamo.identidad:
        parada = (MOTIVO_ENLACE_ANULADO, None)  # cambió el cliente: el enlace sería para otra persona
    if parada is not None:
        _cerrar_por_parada(db, fila, reclamo.tipo, doc, *parada, ahora)
        db.commit()
        return None
    valida_hasta = doc.valida_hasta if reclamo.tipo == "COT" else None
    expira = vence_al_final_del_dia(valida_hasta) if isinstance(valida_hasta, date) else None
    raw = create_confirmation_token(db, reclamo.tipo, reclamo.doc_id, expires_at=expira, commit=False)
    db.commit()
    return raw


def _enviar_recordatorio(db: Session, reclamo: _Reclamo, cfg: dict, enviar, ahora: datetime) -> str:
    """Envía el recordatorio reclamado con un enlace nuevo y lo anota (orden en el docstring del módulo). Devuelve la
    clave del conteo: ENVIADO si salió por algún medio, FALLIDO si no (o si no se sabe) y NO_SALIO si al volver a
    mirar el documento ya no debía salir (_preparar_envio). Un error del envío mismo (enviar lanzó) no se reintenta: la
    fila queda DETENIDO y el enlace nuevo sigue vivo (pudo haber llegado), salvo que el documento ya no esté en
    Pendiente."""
    tipo, n = reclamo.tipo, reclamo.n
    raw = _preparar_envio(db, reclamo, ahora)
    if raw is None:
        return NO_SALIO
    link = enlace_publico(raw, tipo)
    try:
        res = enviar(db, tipo=tipo, doc=reclamo.doc, canal=reclamo.canal, link=link, numero=n, total=cfg["max"])
    except Exception:
        db.rollback()
        logger.exception("Falló el envío del recordatorio automático de %s %s", tipo, reclamo.numero)
        res = None
    db.commit()  # la fila EnvioAlCliente de un WhatsApp que ya salió queda firme antes de lo que sigue

    doc, fila = _bloquear(db, reclamo)
    mismo_ciclo = _mismo_ciclo(fila, reclamo)
    # Si mientras salía el documento dejó de esperar al cliente (confirmó, pidió cambios, se canceló), su enlace nuevo no
    # queda vivo y no cuenta como contacto.
    pendiente = doc is not None and doc.estado == PENDIENTE
    if res is None:
        if not pendiente:
            revocar_token(db, raw)
        if mismo_ciclo:
            _terminar(fila, DETENIDO, MOTIVO_FALLO_ENVIO, ahora,
                      {"canal": reclamo.canal, "motivo": MOTIVO_FALLO_ENVIO, "mensaje": "Error del sistema."})
        _registrar(db, tipo, reclamo.doc_id, reclamo.numero, RECORDATORIO_FALLIDO, _texto_error_del_sistema(n))
        db.commit()
        return FALLIDO

    wa, co = res.get("whatsapp"), res.get("correo")
    salio = _salio(wa) or _salio(co)
    if salio:
        por = _POR["WhatsApp"] if _salio(wa) else _POR["correo"]
        descripcion = f"Recordatorio automático {n} de {cfg['max']} enviado {por} con un enlace nuevo"
        resultado = {"canal": "WhatsApp" if _salio(wa) else "correo", "motivo": None, "mensaje": f"{descripcion}."}
        proximo_paso = None
        if not pendiente:
            revocar_token(db, raw)
            if mismo_ciclo:
                _terminar(fila, DETENIDO, motivo_por_estado(doc), ahora, resultado)
        elif mismo_ciclo:
            # El enlace anterior deja de servir solo ahora, cuando el nuevo salió bien.
            revoke_pending_tokens(db, tipo, reclamo.doc_id, commit=False, excepto_hash=hash_token(raw))
            fila.ultimo_contacto_at = ahora
            fila.ultimo_resultado = resultado
            if fila.proximo_at is not None:
                cuando = fecha_hora_co(fila.proximo_at)
                proximo_paso = (f"Otro recordatorio el {cuando}" if n < cfg["max"]
                                else f"Si no responde, se te avisará el {cuando}")
        if REINICIA_ATRASO and pendiente:
            doc.updated_at = ahora  # R7 / C22: cuenta como contacto, igual que la nota externa del Bloque 2
        _registrar(db, tipo, reclamo.doc_id, reclamo.numero, RECORDATORIO_ENVIADO, descripcion,
                   _extra(reclamo, cfg, wa, co, _cambios(reclamo.canal, wa, co, proximo_paso)))
    else:
        quizas_salio = isinstance(wa, dict) and wa.get("motivo") == MOTIVO_SIN_RESPUESTA
        causas = _causas(wa, co)
        if quizas_salio:
            # T8: «puede que haya salido». No se anula el enlace (pudo llegarle) ni se reintenta; r1 (C1): ni la fila ni
            # el renglón dicen «No se pudo enviar».
            motivo = MOTIVO_SIN_RESPUESTA
            mensaje_fila = TEXTO_QUIZAS_SALIO
            otras = [c for c in causas if c != _CAUSAS_WHATSAPP[MOTIVO_SIN_RESPUESTA]]
            descripcion = (f"No se confirmó el recordatorio automático {n}: Chatwoot no confirmó el WhatsApp y puede "
                           f"que haya salido{'; además, ' + ' y '.join(otras) if otras else ''}. Revisa la "
                           f"conversación en Chatwoot antes de escribirle al cliente.")
        else:
            motivo = _motivo_del_fallo(wa, co)
            mensaje_fila = f"No se pudo enviar: {' y '.join(causas) or 'no salió por ningún medio'}."
            descripcion = (f"No se pudo enviar el recordatorio automático {n}: "
                           f"{' y '.join(causas) or 'no salió por ningún medio'}. Escríbele al cliente o reenvíale "
                           f"el enlace.")
        if not quizas_salio or not pendiente:
            revocar_token(db, raw)  # nadie lo recibió (o el documento ya no espera al cliente); el anterior sigue
        if mismo_ciclo:
            _terminar(fila, DETENIDO, motivo, ahora, {"canal": reclamo.canal, "motivo": motivo, "mensaje": mensaje_fila})
        _registrar(db, tipo, reclamo.doc_id, reclamo.numero, RECORDATORIO_FALLIDO, descripcion,
                   _extra(reclamo, cfg, wa, co, _cambios(reclamo.canal, wa, co)))
    db.commit()
    return ENVIADO if salio else FALLIDO


def _enviar_por_defecto(db: Session, *, tipo: str, doc, canal, link: str, numero: int, total: int) -> dict:
    """El envío real del recordatorio (C15, C17, RP28): {'whatsapp': {enviado, motivo, mensaje, estado, modo, destino,
    envio_id, texto} | None, 'correo': {enviado, destino, motivo, mensaje}}.

    - El correo se arma PRIMERO (correo_documento con proposito SEGUIMIENTO y, en la COT, su validez), antes de mandar
      nada: si no se puede armar (un FRONTEND_URL sin http(s)), no sale nada (MENSAJE_SIN_ARMAR).
    - WhatsApp: envio_whatsapp.enviar_documento(proposito='SEGUIMIENTO'), con la plantilla 'recordatorio' fuera de la
      ventana de 24 h, más el correo de respaldo. Si el WhatsApp automático no está listo, no se llama:
      WHATSAPP_NO_CONFIGURADO. Email: solo el correo. Otro o sin canal: solo el correo de respaldo (CANAL_OTRO).
    - El correo sale por erp_ventas._enviar_correo_confirmacion (H27+H39, con sus mensajes exactos), sin adjuntos.
    - r1 (I3, nota del controlador tras T8): justo DESPUÉS de enviar_documento y ANTES del correo se confirma (commit) la
      fila EnvioAlCliente que dejó en flush: un paso posterior que lance (el correo, o lo que se agregue después) no
      puede borrar el registro de un WhatsApp que ya salió. Los datos del correo se leen antes, para no releer el
      documento después de ese commit.
    Imports dentro de la función (R20): monkeypatch en las pruebas y sin ciclo con erp_ventas."""
    from app.api.v1.erp_ventas import _MENSAJE_CORREO_SIN_ARMAR, _enviar_correo_confirmacion
    from app.core import envio_whatsapp
    from app.core.correo_documento import correo_documento
    from app.core.empresa import perfil_publico
    vence = doc.valida_hasta if tipo == "COT" else None
    destino = doc.customer_email
    perfil = perfil_publico(db)
    try:
        asunto, html = correo_documento(perfil, tipo, doc.numero, doc.customer_name, link, proposito="SEGUIMIENTO",
                                        vence=vence)
    except ValueError as e:
        logger.error("No se pudo armar el recordatorio de %s %s: %s", tipo, doc.numero, e)
        return {"whatsapp": None, "correo": {"enviado": False, "destino": None, "motivo": "MENSAJE_SIN_ARMAR",
                                             "mensaje": _MENSAJE_CORREO_SIN_ARMAR}}
    wa = None
    if canal == "WhatsApp":
        if envio_whatsapp.whatsapp_configurado(db):
            r = envio_whatsapp.enviar_documento(
                db, doc_tipo=tipo, doc_id=doc.id, doc_numero=doc.numero, cliente_nombre=doc.customer_name,
                cliente_email=doc.customer_email, telefono=telefono_del_documento(doc), enlace=link, vence=vence,
                user_name=USUARIO_SISTEMA, proposito="SEGUIMIENTO")
            db.commit()  # r1 (I3): la fila EnvioAlCliente queda firme antes de lo que sigue
            wa = {"enviado": r["enviado"], "motivo": r["motivo"], "mensaje": r["texto_resultado"],
                  "estado": r["estado"], "modo": r["modo"], "destino": r["destino"], "envio_id": r["envio_id"],
                  "texto": r["mensaje"]}
        else:
            wa = dict(WHATSAPP_NO_CONFIGURADO)
    elif canal != "Email":
        wa = {"enviado": False, "motivo": CANAL_OTRO, "mensaje": None}
    correo = _enviar_correo_confirmacion(destino, asunto, html, remitente_nombre=perfil.get("nombre_comercial") or None)
    return {"whatsapp": wa, "correo": correo}
