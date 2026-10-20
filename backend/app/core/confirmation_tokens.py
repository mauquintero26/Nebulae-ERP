# backend/app/core/confirmation_tokens.py
"""
Tokens de confirmacion publica de documentos (SC, COT) por link de un solo
uso. Duplica deliberadamente el patron de reset de contraseña
(backend/app/api/v1/auth.py: forgot_password/reset_password) en vez de
refactorizar ese modulo ya probado y comiteado: mismo secrets.token_urlsafe(32)
+ hashlib.sha256 para el token, misma idea de solo persistir el hash.

El token crudo (`raw_token`) SOLO vive en memoria durante el request y en el
link enviado por correo -- nunca se persiste ni se loguea.

Bloque 3, T1 (C11, C12, R19, RP2, RP16): este modulo es la UNICA fuente de las firmas de enlaces; las demas tareas
solo consumen su API.
- Tipos: TIPOS_CONFIRMACION = ('SC','COT') (enlaces que confirman o piden cambios) y TIPOS_CONSULTA = ('PVEN',)
  (enlace de solo lectura del pedido, en la misma tabla). consultar_token, reclamar_token, peek_token y
  verify_and_consume_token filtran con `document_type = ANY(:tipos)` (parametro, nunca interpolado) y por defecto solo
  aceptan TIPOS_CONFIRMACION: un enlace del pedido nunca se gasta en /confirmar/confirmar.
- Columna resultado (fa6_026): RESULTADO_CONFIRMADO | RESULTADO_CAMBIOS | RESULTADO_REVOCADO. Revocar (en bloque o un
  solo enlace) pone used_at y 'REVOCADO'; marcar_resultado lo pone quien uso el enlace, sin commit.
- Vida del enlace (R19/C14): SC TOKEN_TTL_DAYS (2 dias, el valor por defecto); COT hasta el final de valida_hasta y PVEN
  30 dias, con expires_at = fechas.vence_al_final_del_dia(...) que pasa quien lo crea.
- enlace_publico(raw, tipo) arma /confirmar/{raw} o /pedido/{raw} con FRONTEND_URL.
"""
import secrets, hashlib, logging, os, re
from datetime import datetime, timedelta
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.fechas import ahora_utc
from app.core.preflight import FRONTEND_URL_POR_DEFECTO, aviso_frontend_url
from app.models.confirmation import DocumentConfirmationToken

logger = logging.getLogger(__name__)

TOKEN_TTL_DAYS = 2  # mismo umbral que la alerta de 2 dias ya configurable

TIPOS_CONFIRMACION = ("SC", "COT")
TIPOS_CONSULTA = ("PVEN",)

RESULTADO_CONFIRMADO = "CONFIRMADO"
RESULTADO_CAMBIOS = "CAMBIOS"
RESULTADO_REVOCADO = "REVOCADO"
RESULTADOS = (RESULTADO_CONFIRMADO, RESULTADO_CAMBIOS, RESULTADO_REVOCADO)

# La pagina publica de cada tipo: SC y COT se confirman en /confirmar/{raw}; el pedido se consulta en /pedido/{raw}.
RUTA_PUBLICA = {"SC": "confirmar", "COT": "confirmar", "PVEN": "pedido"}
# Un token crudo como los de secrets.token_urlsafe(32) (43 caracteres de [A-Za-z0-9_-]): enlace_publico no arma una URL
# con otra cosa ('/', '?', '#' o '..' cambiarian la ruta).
_TOKEN_CRUDO = re.compile(r"[A-Za-z0-9_-]{20,}")


def hash_token(raw: str) -> str:
    """El sha256 que se guarda en token_hash (el token crudo nunca se guarda). B3 T20 (M0): con 'surrogatepass', un
    token con un surrogate suelto (json.loads y pydantic lo dejan pasar) da un hash que no es de ningún enlace, y el
    endpoint responde su 400 de siempre en vez de un 500 por UnicodeEncodeError. Un token real (ASCII) da el mismo
    hash."""
    return hashlib.sha256(raw.encode("utf-8", "surrogatepass")).hexdigest()


def _como_tupla(tipos) -> tuple:
    """Un solo tipo escrito como texto ('PVEN') es ('PVEN',), no ['P','V','E','N'] (que no encontraria nada en silencio)."""
    return (tipos,) if isinstance(tipos, str) else tuple(tipos)


def create_confirmation_token(db: Session, document_type: str, document_id: int,
                              expires_at: datetime | None = None, commit: bool = True) -> str:
    """Crea un enlace nuevo y devuelve el token crudo. expires_at (UTC sin zona) por defecto es ahora + TOKEN_TTL_DAYS
    (la SC no cambia); la COT y el PVEN pasan el suyo (U22-validez, U23).

    commit=False (RP16) solo hace flush: el token queda en la transaccion de quien llama, que lo confirma junto con la
    revocacion de los anteriores, el estado del documento y su renglon de Actividad (un solo commit mientras dura el
    bloqueo del documento)."""
    raw_token = secrets.token_urlsafe(32)
    ahora = ahora_utc()
    row = DocumentConfirmationToken(
        document_type=document_type, document_id=document_id, token_hash=hash_token(raw_token),
        created_at=ahora, expires_at=expires_at if expires_at is not None else ahora + timedelta(days=TOKEN_TTL_DAYS),
    )
    db.add(row)
    if commit:
        db.commit()
    else:
        db.flush()
    return raw_token


def consultar_token(db: Session, token: str, tipos=TIPOS_CONFIRMACION) -> dict | None:
    """Lee el enlace SIN efectos (un SELECT, sin commit) para decidir que mostrarle al cliente: {id, document_type,
    document_id, created_at, expires_at, used_at, resultado, vigente, vencido}, o None si no existe o no es de `tipos`.
    vigente = sin usar y expires_at > ahora; vencido = sin usar y expires_at <= ahora (usado o revocado: ninguno).
    `tipos` acepta una tupla o un solo tipo como texto ('PVEN').

    Uso interno: nunca devolver este dict al cliente (trae el id del enlace, document_id y otros datos internos);
    proyectar campo por campo, como _sc_confirmacion_dict de confirmacion_publica.py."""
    fila = db.execute(
        text("""
            SELECT id, document_type, document_id, created_at, expires_at, used_at, resultado
            FROM document_confirmation_tokens
            WHERE token_hash = :token_hash AND document_type = ANY(:tipos)
        """),
        {"token_hash": hash_token(token), "tipos": list(_como_tupla(tipos))},
    ).mappings().first()
    if fila is None:
        return None
    info = dict(fila)
    sin_usar = info["used_at"] is None
    a_tiempo = info["expires_at"] > ahora_utc()
    info["vigente"] = sin_usar and a_tiempo
    info["vencido"] = sin_usar and not a_tiempo
    return info


def reclamar_token(db: Session, token: str, tipos=TIPOS_CONFIRMACION) -> dict | None:
    """Reclama el token de forma atomica: un UPDATE condicional (no un SELECT seguido
    de un UPDATE separado) para que dos POST concurrentes con el mismo token nunca
    puedan pasar ambos la validacion -- el segundo UPDATE, al re-evaluar su propio
    WHERE despues de que el primero ya committeo used_at, simplemente no afecta
    ninguna fila. Mismo patron de UPDATE parametrizado que revoke_pending_tokens
    (db.execute(text(...), {...}), nunca interpolacion de string).

    Solo reclama enlaces de `tipos` (C11; una tupla o un solo tipo como texto). Devuelve {id, document_type,
    document_id} o None; hace su propio commit, como siempre (el enlace queda gastado aunque lo que sigue falle)."""
    now = ahora_utc()
    row = db.execute(
        text("""
            UPDATE document_confirmation_tokens
            SET used_at = :now
            WHERE token_hash = :token_hash AND used_at IS NULL AND expires_at > :now
              AND document_type = ANY(:tipos)
            RETURNING id, document_type, document_id
        """),
        {"token_hash": hash_token(token), "now": now, "tipos": list(_como_tupla(tipos))},
    ).first()
    db.commit()
    if not row:
        return None
    return {"id": row[0], "document_type": row[1], "document_id": row[2]}


def verify_and_consume_token(db: Session, token: str, tipos=TIPOS_CONFIRMACION) -> tuple[str, int] | None:
    """Envoltura de reclamar_token que devuelve la tupla de siempre: (document_type, document_id) o None."""
    info = reclamar_token(db, token, tipos=tipos)
    if info is None:
        return None
    return (info["document_type"], info["document_id"])


def peek_token(db: Session, token: str, tipos=TIPOS_CONFIRMACION) -> tuple[str, int] | None:
    """Como verify_and_consume_token pero NO marca usado -- para el GET de solo lectura."""
    info = consultar_token(db, token, tipos=tipos)
    if info is None or not info["vigente"]:
        return None
    return (info["document_type"], info["document_id"])


def marcar_resultado(db: Session, token_id: int, resultado: str) -> bool:
    """Anota que hizo el cliente con el enlace (RESULTADO_CONFIRMADO o RESULTADO_CAMBIOS). SIN commit: va en el commit
    que cambia el documento, para que el enlace y el documento se confirmen o se deshagan juntos.

    Solo escribe sobre un enlace ya usado (reclamado) y todavia sin resultado: nunca convierte un 'REVOCADO' (ni otro
    resultado) en otra cosa, ni marca un enlace que nadie uso. True si lo anoto; False si no (id equivocado, enlace sin
    usar o con resultado)."""
    if resultado not in RESULTADOS:
        raise ValueError(f"Resultado de enlace desconocido: {resultado!r}")
    filas = db.execute(
        text("""
            UPDATE document_confirmation_tokens SET resultado = :resultado
            WHERE id = :id AND used_at IS NOT NULL AND resultado IS NULL
        """),
        {"resultado": resultado, "id": token_id},
    )
    return filas.rowcount == 1


def revoke_pending_tokens(db: Session, document_type: str, document_id: int, commit: bool = True,
                          contar_vigentes: bool = False, excepto_hash: str | None = None):
    """Invalida cualquier token sin usar de este documento -- se llama en cada punto
    donde una SC sale del ciclo vigente de Gate 1: cancelar_solicitud, cualquier
    transicion real de estado via update_solicitud (no solo el reset a BORRADOR),
    restaurar_solicitud, y siempre antes de emitir un token nuevo en
    enviar_solicitud_para_confirmacion (ver erp_ventas.py) -- para que un link ya
    enviado por correo nunca pueda confirmar un documento que ya cambio de curso por
    otra via, cualquiera que sea. Reutiliza used_at como marca de invalidacion:
    un token revocado es, para todo efecto practico, identico a uno ya usado. Desde
    el Bloque 3 (fa6_026) tambien queda con resultado 'REVOCADO', para que la pagina
    del cliente distinga un enlace anulado de uno que el cliente uso.

    commit=False deja el UPDATE en la transaccion del llamador, que lo confirma junto con el resto de su cambio
    (update_solicitud, H29: la revocacion y el cambio de estado se confirman o se deshacen juntos).

    excepto_hash (B3, C12) deja vivo ESE enlace (hash_token(raw)): el que se acaba de usar para confirmar, o el que se
    acaba de crear para un recordatorio.

    contar_vigentes=True (H21, ronda 2 de T5) devuelve cuantos de los tokens que ESTE UPDATE revoco el cliente todavia
    podia usar (sin vencer), leidos con RETURNING: es lo que de verdad se anulo, sin una consulta aparte que otra
    transaccion pueda adelantar (y sin contar el de excepto_hash, que no se revoca). Por defecto devuelve None, como
    siempre. Revision final (B5): es la unica manera de contarlos; cancelar y restaurar la SC tambien la usan (el conteo
    previo, contar_tokens_vigentes, ya no existe)."""
    now = ahora_utc()
    parametros = {"document_type": document_type, "document_id": document_id, "now": now,
                  "revocado": RESULTADO_REVOCADO}
    sql = """
            UPDATE document_confirmation_tokens
            SET used_at = :now, resultado = :revocado
            WHERE document_type = :document_type AND document_id = :document_id AND used_at IS NULL
        """
    if excepto_hash is not None:
        sql += " AND token_hash <> :excepto_hash"
        parametros["excepto_hash"] = excepto_hash
    if contar_vigentes:
        sql += " RETURNING expires_at"
    resultado = db.execute(text(sql), parametros)
    vigentes = None
    if contar_vigentes:
        vigentes = sum(1 for (expira,) in resultado.fetchall() if expira is not None and expira > now)
    if commit:
        db.commit()
    return vigentes


def revocar_token(db: Session, raw: str) -> bool:
    """Anula UN enlace por su token crudo (p.ej. el del recordatorio que no se pudo enviar: no queda vivo un enlace que
    nadie recibio). SIN commit. True si lo anulo; False si no existe o ya estaba usado o revocado."""
    resultado = db.execute(
        text("""
            UPDATE document_confirmation_tokens
            SET used_at = :now, resultado = :revocado
            WHERE token_hash = :token_hash AND used_at IS NULL
        """),
        {"token_hash": hash_token(raw), "now": ahora_utc(), "revocado": RESULTADO_REVOCADO},
    )
    return resultado.rowcount == 1


def ultimo_enlace_vigente(db: Session, document_type: str, document_id: int) -> DocumentConfirmationToken | None:
    """El enlace mas nuevo de este documento que el cliente todavia puede abrir (sin usar y sin vencer), o None. Se
    relee de la base (populate_existing): una revocacion por SQL no deja una copia vieja en la sesion."""
    return (db.query(DocumentConfirmationToken)
            .filter(DocumentConfirmationToken.document_type == document_type,
                    DocumentConfirmationToken.document_id == document_id,
                    DocumentConfirmationToken.used_at.is_(None),
                    DocumentConfirmationToken.expires_at > ahora_utc())
            .order_by(DocumentConfirmationToken.created_at.desc(), DocumentConfirmationToken.id.desc())
            .populate_existing()
            .first())


def hay_enlace_mas_reciente_vigente(db: Session, document_type: str, document_id: int, despues_de: datetime) -> bool:
    """True si este documento tiene un enlace creado despues de `despues_de` (el created_at del enlace que se abrio)
    que todavia esta vigente: el cliente abrio uno reemplazado por otro mas nuevo."""
    fila = db.execute(
        text("""
            SELECT 1 FROM document_confirmation_tokens
            WHERE document_type = :document_type AND document_id = :document_id AND created_at > :despues_de
              AND used_at IS NULL AND expires_at > :now
            LIMIT 1
        """),
        {"document_type": document_type, "document_id": document_id, "despues_de": despues_de, "now": ahora_utc()},
    ).first()
    return fila is not None


def frontend_url() -> str:
    """La direccion publica del frontend (FRONTEND_URL, leida en cada llamada) sin '/' final; por defecto la local."""
    valor = (os.environ.get("FRONTEND_URL") or "").strip().rstrip("/")
    return valor or FRONTEND_URL_POR_DEFECTO


def enlace_publico(raw: str, tipo: str) -> str:
    """El enlace que recibe el cliente: {FRONTEND_URL}/confirmar/{raw} (SC, COT) o {FRONTEND_URL}/pedido/{raw} (PVEN).

    Hueco 1: con NEBULAE_ENV=production y FRONTEND_URL ausente o en localhost registra un error (el enlace saldria a una
    direccion que el cliente no puede abrir). El token crudo nunca va al registro.

    `raw` debe ser un token como los de create_confirmation_token (20 o mas caracteres de [A-Za-z0-9_-]); con otra cosa
    ('/', '?', '#', '..') se armaria otra ruta, asi que da ValueError (sin repetir el valor en el mensaje)."""
    ruta = RUTA_PUBLICA.get(tipo)
    if ruta is None:
        raise ValueError(f"Tipo de enlace desconocido: {tipo!r}")
    if not isinstance(raw, str) or not _TOKEN_CRUDO.fullmatch(raw):
        raise ValueError("El token del enlace no es válido: debe ser el que devuelve create_confirmation_token.")
    aviso = aviso_frontend_url(os.environ.get("NEBULAE_ENV", ""), os.environ.get("FRONTEND_URL"))
    if aviso:
        logger.error("Enlace %s al cliente con una direccion que no sirve: %s", tipo, aviso)
    return f"{frontend_url()}/{ruta}/{raw}"
