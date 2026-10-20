"""Datos de la empresa para los documentos y correos del cliente (Bloque 3, T2: MARCA, C1, R12, RP4, RP15, RP17, RP19).

Un solo lugar, guardado en admin_config, para la identidad de la empresa (nombre, NIT, contacto...), los colores y
textos de los documentos (terminos, datos para pagar, pie) y el logo. De aqui los toman las paginas publicas
(perfil_publico), el documento del cliente (textos_documento), los correos (correo_documento) y los WhatsApp
(empresa_para_mensajes). Sin FastAPI: lo usan api/v1/empresa.py, erp_ventas.py, core/documento_cliente.py y
core/correo_documento.py.

- Claves: 'empresa_*' (identidad y logo) y 'documentos_*' (colores y textos). PREFIJOS_RESERVADOS: /ventas/config no
  las muestra ni las acepta (C23); solo se cambian por PUT /empresa, que las valida.
- validar_cambios(body) es PURA (T13 la compara con validarCampoEmpresa del frontend, RP21): valida TODO antes de
  escribir y lanza ValueError con el mensaje exacto en espanol. '' (o None) borra el campo: vuelve a su valor por defecto.
- guardar_cambios / guardar_logo / quitar_logo escriben con admin_config.guardar_config (RP17), dejan un renglon EMPRESA
  en la Actividad (quien y antes -> despues; del logo solo la version, nunca el contenido) y hacen UN commit.
- El logo es un data URL (PNG, JPG o WebP de hasta 300 KB; SVG no, porque puede llevar scripts) guardado como texto:
  los contenedores de EasyPanel pierden el disco al redeplegar. leer_perfil y perfil_publico nunca lo leen (pesa hasta
  ~400 KB); solo leer_logo, para servirlo en /publico/empresa/logo.
"""
import base64
import binascii
import hashlib
import math
import re
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.core.admin_config import claves_existentes, guardar_config, leer_config
from app.core import clientes
from app.core.telefonos import e164_whatsapp
from app.models.erp_documents import ActivityLog

PREFIJOS_RESERVADOS = ("empresa_", "documentos_")
CLAVE_LOGO = "empresa_logo"
CLAVE_LOGO_VERSION = "empresa_logo_version"
LOGO_MAX_BYTES = 300 * 1024
# Firmas (primeros bytes) de los formatos aceptados: el mime del data URL debe coincidir con el contenido real.
TIPOS_LOGO = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/webp": (b"RIFF", b"WEBP"),  # 'RIFF' en [0:4] y 'WEBP' en [8:12]
}
# Colores de las referencias aprobadas: degradado morado -> rojo de la SC y acento naranja de la COT y el PVEN.
COLORES_POR_DEFECTO = {"principal": "#7C3AED", "secundario": "#E11D48", "acento": "#C2410C"}

# Renglones de la Actividad: entity_type/entity_numero 'EMPRESA', entity_id 0 (no es un documento).
ENTIDAD_EMPRESA = "EMPRESA"
_RECORTE_ACTIVIDAD = 200
_USER_NAME_MAX = 150  # activity_logs.user_name es String(150)

# ─── Mensajes (T12 los copia en validarCampoEmpresa; RP21) ──────────────────────────────────────────────────────
MENSAJE_CAMPO_DESCONOCIDO = "Campo desconocido: {campo}."
MENSAJE_MAXIMO = "{etiqueta}: máximo {n} caracteres."
MENSAJE_NO_ES_TEXTO = "{etiqueta}: debe ser un texto."
MENSAJE_NIT = "NIT no válido: usa solo números, puntos y guion (por ejemplo 900.123.456-7)."
# r2: se arma al lanzar, con clientes.TELEFONO_MIN_DIGITOS y TELEFONO_MAX_DIGITOS (hoy: «entre 7 y 15 dígitos»).
MENSAJE_TELEFONO = "Teléfono no válido: escribe entre {minimo} y {maximo} dígitos."
MENSAJE_WHATSAPP = ("WhatsApp no válido: escribe el celular de 10 dígitos o el número completo con su indicativo "
                    "(por ejemplo +57 300 123 4567).")
MENSAJE_CORREO = "Correo de la empresa no válido."
MENSAJE_URL = "La página web debe empezar por http:// o https://."
MENSAJE_COLOR = "Color no válido: usa el formato #RRGGBB."
MENSAJE_LOGO_TIPO = "El logo debe ser una imagen PNG, JPG o WebP."
MENSAJE_LOGO_PESO = "El logo pesa {kb} KB; el máximo es 300 KB."
MENSAJE_LOGO_INVALIDO = "El archivo no es una imagen válida."

# ─── Validadores: reciben el texto ya sin espacios de los bordes y no vacio; devuelven el valor a guardar ─────────
_NIT = re.compile(r"[0-9][0-9.\- ]{4,29}")
_TELEFONO = re.compile(r"[0-9+() \-]+")
# El minimo de digitos es el de clientes (TELEFONO_MIN_DIGITOS, leido al llamar); el maximo es el de E.164.
TELEFONO_MAX_DIGITOS = 15
_NO_DIGITO = re.compile(r"[^0-9]")  # como telefonos._NO_DIGITO: solo 0-9 cuentan como digitos
# El patron de color de todo el backend (el correo lo usa con es_color_hex).
_HEX = re.compile(r"#[0-9A-Fa-f]{6}")
# Un esquema al inicio ('javascript:', 'data:', 'ftp:'...). 'example.com:8080' no lo es: despues de ':' viene un puerto.
_ESQUEMA = re.compile(r"[A-Za-z][A-Za-z0-9+.\-]*:(?!\d)")


def es_color_hex(valor) -> bool:
    """True si `valor` es un texto '#RRGGBB' (la unica regla de color: la usan los documentos y los correos)."""
    return isinstance(valor, str) and _HEX.fullmatch(valor) is not None


def _validar_nit(valor: str) -> str:
    if not _NIT.fullmatch(valor):
        raise ValueError(MENSAJE_NIT)
    return valor


def _validar_telefono(valor: str) -> str:
    minimo = clientes.TELEFONO_MIN_DIGITOS
    digitos = len(_NO_DIGITO.sub("", valor))
    if not _TELEFONO.fullmatch(valor) or not minimo <= digitos <= TELEFONO_MAX_DIGITOS:
        raise ValueError(MENSAJE_TELEFONO.format(minimo=minimo, maximo=TELEFONO_MAX_DIGITOS))
    return valor


def _validar_whatsapp(valor: str) -> str:
    """RP19: una sola regla de WhatsApp en el backend, telefonos.e164_whatsapp (11 a 15 digitos despues de normalizar;
    un celular colombiano de 10 digitos recibe el 57). Primero se exigen los mismos caracteres que en el telefono fijo
    (digitos, + ( ) - y espacios), porque e164_whatsapp descarta todo lo demas y '300 123 4567 ext 12' saldria como
    +300123456712 (r1, L2).
    Se guarda como lo escribio el administrador."""
    if not _TELEFONO.fullmatch(valor) or e164_whatsapp(valor) is None:
        raise ValueError(MENSAJE_WHATSAPP)
    return valor


def _validar_correo(valor: str) -> str:
    """RP4: la misma regla de correo de todo el servidor (clientes.correo_valido, B2.1-D5)."""
    if not clientes.correo_valido(valor):
        raise ValueError(MENSAJE_CORREO)
    return valor


def _validar_url(valor: str) -> str:
    """Solo http(s) con dominio y sin espacios (evita javascript: en un href). C1: sin esquema ('example.com') se
    completa con https://; cualquier otro esquema (javascript:, data:, ftp:...) es un error.
    B3 T20 (C1, C2, M16): sin '@' en el netloc. 'https://mitienda.com@evil.com' (o 'https://@evil.com', donde username
    es '' y no None) lleva a evil.com: el pie del correo y del PDF la imprimen como texto y Gmail o el visor de PDF la
    vuelven enlace. _valor_guardado revalida al leer, así que un valor viejo así se lee como ''. Espejo: validarUrl de
    marca-empresa.js (RP21)."""
    if not valor.lower().startswith(("http://", "https://")):
        if _ESQUEMA.match(valor):
            raise ValueError(MENSAJE_URL)
        valor = "https://" + valor
    if any(ch.isspace() for ch in valor):
        raise ValueError(MENSAJE_URL)
    try:
        partes = urlparse(valor)
    except ValueError:  # r2: 'https://[abc' o 'example.com]' (IPv6 mal escrita): el mismo mensaje, en espanol
        raise ValueError(MENSAJE_URL) from None
    if partes.scheme.lower() not in ("http", "https") or not partes.netloc:
        raise ValueError(MENSAJE_URL)
    if "@" in partes.netloc:
        raise ValueError(MENSAJE_URL)
    return valor


def _validar_hex(valor: str) -> str:
    """#RRGGBB (evita inyeccion en un style); se guarda en mayusculas."""
    if not es_color_hex(valor):
        raise ValueError(MENSAJE_COLOR)
    return valor.upper()


# campo del API -> (clave en admin_config, etiqueta, max_len, validador, por_defecto). Dict ordenado: el orden del
# formulario y del historial.
CAMPOS = {
    # Identidad y contacto
    "nombre_comercial": ("empresa_nombre_comercial", "Nombre comercial", 120, None, ""),
    "razon_social": ("empresa_razon_social", "Razón social", 160, None, ""),
    "nit": ("empresa_nit", "NIT", 30, _validar_nit, ""),
    "direccion": ("empresa_direccion", "Dirección", 200, None, ""),
    "ciudad": ("empresa_ciudad", "Ciudad", 80, None, ""),
    "telefono": ("empresa_telefono", "Teléfono", 40, _validar_telefono, ""),
    "whatsapp": ("empresa_whatsapp", "WhatsApp", 40, _validar_whatsapp, ""),
    "correo": ("empresa_correo", "Correo", 150, _validar_correo, ""),
    "sitio_web": ("empresa_sitio_web", "Página web", 200, _validar_url, ""),
    # Diseño de los documentos
    "color_principal": ("documentos_color_principal", "Color principal", 7, _validar_hex,
                        COLORES_POR_DEFECTO["principal"]),
    "color_secundario": ("documentos_color_secundario", "Color secundario", 7, _validar_hex,
                         COLORES_POR_DEFECTO["secundario"]),
    "color_acento": ("documentos_color_acento", "Color de acento", 7, _validar_hex, COLORES_POR_DEFECTO["acento"]),
    "terminos_cotizacion": ("documentos_terminos_cotizacion", "Términos de la cotización", 2000, None, ""),
    "terminos_pedido": ("documentos_terminos_pedido", "Términos del pedido", 2000, None, ""),
    "instrucciones_pago": ("documentos_instrucciones_pago", "Datos para pagar", 1000, None, ""),
    "mensaje_pie": ("documentos_mensaje_pie", "Mensaje de pie", 200, None, ""),
}
CAMPOS_IDENTIDAD = ("nombre_comercial", "razon_social", "nit", "direccion", "ciudad", "telefono", "whatsapp", "correo",
                    "sitio_web")
CAMPOS_COLORES = {"color_principal": "principal", "color_secundario": "secundario", "color_acento": "acento"}
# Los unicos campos de varias lineas (conservan \n y \t). Los demas son de una sola linea: pasan por limpiar_linea, porque
# van a asuntos, encabezados y parametros de plantillas de WhatsApp (Meta rechaza saltos y tabuladores; r1, Q2/S4).
CAMPOS_TEXTO_LARGO = ("terminos_cotizacion", "terminos_pedido", "instrucciones_pago", "mensaje_pie")
# Lo que ve cualquiera sin sesion (/publico/empresa): identidad y colores. Nunca terminos ni datos para pagar (R8).
CAMPOS_PUBLICOS = CAMPOS_IDENTIDAD + tuple(CAMPOS_COLORES)
# Textos de cada documento: la SC no lleva terminos ni datos para pagar (solo los ve quien tiene el enlace de la COT o
# del PVEN; pregunta datos_pago de PLANTILLA = Si).
_TERMINOS_POR_TIPO = {"SC": None, "COT": "terminos_cotizacion", "PVEN": "terminos_pedido"}

_CLAVES_PERFIL = [definicion[0] for definicion in CAMPOS.values()] + [CLAVE_LOGO_VERSION]
_SALTOS_Y_CONTROL = re.compile(r"[\x00-\x1f\x7f\x85\u2028\u2029]+")
_CONTROL_EN_TEXTO = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_DATA_URL = re.compile(r"data:([A-Za-z0-9.+/\-]+);base64,(.*)", re.DOTALL)


def limpiar_linea(texto) -> str:
    """Una sola linea: los saltos (\\r, \\n...) y demas caracteres de control pasan a un espacio y se quitan los espacios
    de los bordes. Para el asunto y los encabezados de los correos (un salto de linea inyectaria otro encabezado).
    None -> ''."""
    if texto is None:
        return ""
    return _SALTOS_Y_CONTROL.sub(" ", str(texto)).strip()


def _url_logo(version):
    """Ruta del logo relativa al API (/api/v1): la version en ?v= hace que un logo nuevo se vea al instante."""
    return f"/publico/empresa/logo?v={version}" if version else None


def _valor_guardado(campo: str, guardado) -> str:
    """El valor de `campo` como lo ve el resto del sistema: el guardado, o su valor por defecto. Defensa al leer, por si
    hay un dato viejo escrito a mano en la base: un color que no es #RRGGBB vuelve al de la referencia (nunca llega a
    un style) y una pagina web que no es http(s) se lee como '' (nunca llega a un href; r1, S2)."""
    _, _, _, validador, defecto = CAMPOS[campo]
    if not guardado:
        return defecto
    if validador is _validar_hex and not es_color_hex(guardado):
        return defecto
    if validador is _validar_url:
        try:
            return _validar_url(guardado)
        except ValueError:
            return ""
    return guardado


def leer_perfil(db: Session) -> dict:
    """{campo: valor (o su valor por defecto, o '')} de todos los CAMPOS, mas logo_version, logo_url y configurada
    (= hay nombre comercial). Un solo SELECT; nunca lee ni devuelve el data URL del logo."""
    guardado = leer_config(db, _CLAVES_PERFIL)
    perfil = {campo: _valor_guardado(campo, guardado.get(definicion[0])) for campo, definicion in CAMPOS.items()}
    version = guardado.get(CLAVE_LOGO_VERSION) or None
    perfil["logo_version"] = version
    perfil["logo_url"] = _url_logo(version)
    perfil["configurada"] = bool(perfil["nombre_comercial"])
    return perfil


def perfil_publico(db: Session) -> dict:
    """Lo que puede ver cualquiera (paginas del cliente, correos, /publico/empresa): {nombre_comercial, razon_social,
    nit, direccion, ciudad, telefono, whatsapp, correo, sitio_web, colores: {principal, secundario, acento}, logo_url,
    configurada}. Lista blanca: nunca terminos, datos para pagar ni otra clave de admin_config."""
    perfil = leer_perfil(db)
    publico = {campo: perfil[campo] for campo in CAMPOS_IDENTIDAD}
    publico["colores"] = {nombre: perfil[campo] for campo, nombre in CAMPOS_COLORES.items()}
    publico["logo_url"] = perfil["logo_url"]
    publico["configurada"] = perfil["configurada"]
    return publico


# ─── Lectura de un perfil ya armado: UNA sola fuente para el correo y el PDF del cliente (B3 T9 r1, Q9) ──────────

# El contacto de la empresa en el pie, en este orden (correo_documento y pdf_documento).
_ETIQUETAS_CONTACTO = (("Teléfono", "telefono"), ("WhatsApp", "whatsapp"), ("Correo", "correo"),
                       ("Página web", "sitio_web"))


def color_de_marca(perfil, nombre: str) -> str:
    """El color `nombre` ('principal', 'secundario' o 'acento') de un perfil de perfil_publico en '#RRGGBB' mayusculas;
    el de la referencia (COLORES_POR_DEFECTO) si falta o no es #RRGGBB (nunca llega otra cosa a un style)."""
    colores = perfil.get("colores") if isinstance(perfil, dict) else None
    valor = colores.get(nombre) if isinstance(colores, dict) else None
    return valor.upper() if es_color_hex(valor) else COLORES_POR_DEFECTO[nombre]


def campo_de_perfil(perfil, campo: str) -> str:
    """El texto de `campo` de un perfil, sin espacios en los bordes; '' si falta o no es texto."""
    valor = perfil.get(campo) if isinstance(perfil, dict) else None
    return valor.strip() if isinstance(valor, str) else ""


def contacto_empresa(perfil) -> list:
    """Los renglones de contacto de la empresa para el pie del correo y del PDF, SIN escapar (cada uno escapa con su
    regla: html.escape el correo, xml escape el PDF), solo los que haya y en este orden: 'Teléfono: …', 'WhatsApp: …',
    'Correo: …', 'Página web: …', 'direccion, ciudad' y 'razon social · NIT …'."""
    renglones = [f"{etiqueta}: {campo_de_perfil(perfil, campo)}" for etiqueta, campo in _ETIQUETAS_CONTACTO
                 if campo_de_perfil(perfil, campo)]
    direccion = ", ".join(v for v in (campo_de_perfil(perfil, "direccion"), campo_de_perfil(perfil, "ciudad")) if v)
    if direccion:
        renglones.append(direccion)
    razon_social, nit = campo_de_perfil(perfil, "razon_social"), campo_de_perfil(perfil, "nit")
    legal = " · ".join(x for x in (razon_social, f"NIT {nit}" if nit else "") if x)
    if legal:
        renglones.append(legal)
    return renglones


def textos_documento(db: Session, tipo: str) -> dict:
    """{terminos, instrucciones_pago, mensaje_pie} del documento `tipo`; un texto vacio es None.
    SC: sin terminos ni datos para pagar. COT: terminos_cotizacion. PVEN: terminos_pedido. COT y PVEN traen los datos
    para pagar (R8). Solo para respuestas con token (nunca en /publico/empresa). ValueError si el tipo no existe."""
    if tipo not in _TERMINOS_POR_TIPO:
        raise ValueError(f"Tipo de documento desconocido: {tipo!r}")
    campo_terminos = _TERMINOS_POR_TIPO[tipo]
    campos = ["mensaje_pie"] + ([campo_terminos, "instrucciones_pago"] if campo_terminos else [])
    guardado = leer_config(db, [CAMPOS[c][0] for c in campos])
    textos = {c: (guardado.get(CAMPOS[c][0]) or "").strip() or None for c in campos}
    return {"terminos": textos.get(campo_terminos),
            "instrucciones_pago": textos.get("instrucciones_pago"),
            "mensaje_pie": textos["mensaje_pie"]}


def empresa_para_mensajes(db: Session) -> dict:
    """{nombre, telefono, whatsapp, correo} para los textos de WhatsApp y recordatorios (U16); None si no esta."""
    campos = {"nombre": "nombre_comercial", "telefono": "telefono", "whatsapp": "whatsapp", "correo": "correo"}
    guardado = leer_config(db, [CAMPOS[c][0] for c in campos.values()])
    return {nombre: (guardado.get(CAMPOS[campo][0]) or "").strip() or None for nombre, campo in campos.items()}


def _normalizar_texto(valor) -> str:
    """Sin espacios en los bordes, con fin de linea \\n y sin caracteres de control (salvo \\n y \\t): un NUL tumbaria
    el INSERT con un 500."""
    valor = valor.replace("\r\n", "\n").replace("\r", "\n")
    return _CONTROL_EN_TEXTO.sub("", valor).strip()


def validar_cambios(body: dict) -> dict:
    """{campo: valor normalizado} de `body`, validado TODO antes de escribir nada. '' o None borran el campo (vuelve a su
    valor por defecto). Un campo desconocido (tambien 'logo', que va por PUT /empresa/logo) o un valor invalido lanzan
    ValueError con el mensaje exacto. Pura: sin base de datos.

    Orden (T12 lo copia en validarCampoEmpresa, RP21): 1) que sea texto; 2) normalizar: los de una sola linea con
    limpiar_linea (cada tramo de \\n, \\t, \\r u otro caracter de control pasa a UN espacio y se quitan los espacios de
    los bordes; los demas espacios no se tocan) y los de CAMPOS_TEXTO_LARGO con _normalizar_texto (\\r\\n -> \\n,
    conservan \\n y \\t, se quitan los demas caracteres de control y los espacios de los bordes); 3) la regla del campo;
    4) el maximo sobre el valor que se guardaria."""
    cambios = {}
    for campo, valor in body.items():
        if campo not in CAMPOS:
            raise ValueError(MENSAJE_CAMPO_DESCONOCIDO.format(campo=campo))
        _, etiqueta, max_len, validador, _ = CAMPOS[campo]
        if valor is None:
            valor = ""
        if not isinstance(valor, str):
            raise ValueError(MENSAJE_NO_ES_TEXTO.format(etiqueta=etiqueta))
        valor = _normalizar_texto(valor) if campo in CAMPOS_TEXTO_LARGO else limpiar_linea(valor)
        # Primero la regla del campo (su mensaje es el mas util: 'Color no valido...' y no 'maximo 7 caracteres') y
        # despues el maximo sobre el valor que se guardaria (sitio_web gana 'https://').
        if valor and validador is not None:
            valor = validador(valor)
        if len(valor) > max_len:
            raise ValueError(MENSAJE_MAXIMO.format(etiqueta=etiqueta, n=max_len))
        cambios[campo] = valor
    return cambios


def _recortar(texto: str) -> str:
    return texto[:_RECORTE_ACTIVIDAD]


def _registrar(db: Session, descripcion: str, user_name, extra_data: dict) -> None:
    """Renglon EMPRESA de la Actividad (quien y que cambio). Lo confirma el commit de quien llama."""
    autor = user_name if isinstance(user_name, str) and user_name.strip() else "Sistema"
    db.add(ActivityLog(entity_type=ENTIDAD_EMPRESA, entity_id=0, entity_numero=ENTIDAD_EMPRESA, action="UPDATED",
                       description=descripcion, user_name=autor[:_USER_NAME_MAX], extra_data=extra_data))


def guardar_cambios(db: Session, cambios: dict, user_name) -> list:
    """Guarda lo que cambio de `cambios` (la salida de validar_cambios) y devuelve [{etiqueta, antes, despues}].

    Compara el valor efectivo (con su valor por defecto) contra leer_perfil y escribe solo lo distinto: upsert, o DELETE
    si viene '' (vuelve al valor por defecto). Un renglon EMPRESA en la Actividad con los textos recortados a 200
    caracteres y UN commit. Sin cambios no escribe nada (ni commit)."""
    actual = leer_perfil(db)
    escribir, hechos = {}, []
    for campo, valor in cambios.items():
        if campo not in CAMPOS:
            raise ValueError(MENSAJE_CAMPO_DESCONOCIDO.format(campo=campo))
        clave, etiqueta, _, _, defecto = CAMPOS[campo]
        nuevo = valor or defecto
        if nuevo == actual[campo]:
            continue
        escribir[clave] = valor or None
        hechos.append({"etiqueta": etiqueta, "antes": _recortar(actual[campo]), "despues": _recortar(nuevo)})
    if not hechos:
        return []
    guardar_config(db, escribir)
    _registrar(db, "Datos de la empresa actualizados: " + ", ".join(h["etiqueta"] for h in hechos), user_name,
               {"cambios": hechos})
    db.commit()
    return hechos


def _mensaje_peso(n_bytes: int) -> str:
    return MENSAJE_LOGO_PESO.format(kb=math.ceil(n_bytes / 1024))


def _firma_coincide(mime: str, contenido: bytes) -> bool:
    firmas = TIPOS_LOGO[mime]
    if mime == "image/webp":
        return contenido[0:4] == firmas[0] and contenido[8:12] == firmas[1]
    return contenido.startswith(firmas[0])


def validar_logo(data_url) -> tuple:
    """(mime, bytes) de un data URL 'data:<mime>;base64,<b64>' de PNG, JPG o WebP de hasta LOGO_MAX_BYTES cuyos primeros
    bytes coinciden con el mime. SVG o cualquier otro tipo -> ValueError, igual que un tamano mayor o un contenido que
    no es la imagen que dice ser."""
    if not isinstance(data_url, str):
        raise ValueError(MENSAJE_LOGO_TIPO)
    partes = _DATA_URL.fullmatch(data_url.strip())
    if partes is None or partes.group(1).lower() not in TIPOS_LOGO:
        raise ValueError(MENSAJE_LOGO_TIPO)
    mime, b64 = partes.group(1).lower(), partes.group(2)
    # Antes de decodificar: un archivo enorme se rechaza sin cargarlo entero en memoria otra vez.
    aproximado = len(b64) * 3 // 4 - b64[-2:].count("=")
    if aproximado > LOGO_MAX_BYTES:
        raise ValueError(_mensaje_peso(aproximado))
    try:
        contenido = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError(MENSAJE_LOGO_INVALIDO) from None
    if len(contenido) > LOGO_MAX_BYTES:
        raise ValueError(_mensaje_peso(len(contenido)))
    if not _firma_coincide(mime, contenido):
        raise ValueError(MENSAJE_LOGO_INVALIDO)
    return mime, contenido


def _version_de(contenido: bytes) -> str:
    return hashlib.sha256(contenido).hexdigest()[:12]


def guardar_logo(db: Session, data_url, user_name) -> str:
    """Valida y guarda el logo (data URL normalizado + version = sha256[:12]) y devuelve la version. Renglon EMPRESA
    'Logo actualizado' con solo la version (nunca el contenido) y un commit. El mismo logo otra vez no escribe nada."""
    mime, contenido = validar_logo(data_url)
    version = _version_de(contenido)
    if leer_config(db, [CLAVE_LOGO_VERSION]).get(CLAVE_LOGO_VERSION) == version:
        return version
    guardar_config(db, {CLAVE_LOGO: f"data:{mime};base64,{base64.b64encode(contenido).decode('ascii')}",
                        CLAVE_LOGO_VERSION: version})
    _registrar(db, "Logo actualizado", user_name, {"version": version})
    db.commit()
    return version


def quitar_logo(db: Session, user_name) -> bool:
    """Borra el logo y su version con su renglon 'Logo quitado' y UN commit, y devuelve True. Sin logo no escribe ni
    confirma nada y devuelve False.

    «Hay logo» si existe CUALQUIERA de las dos claves (r2): un CLAVE_LOGO sin version, escrito a mano, lo sigue sirviendo
    leer_logo, asi que tambien se tiene que poder quitar. Se pregunta con claves_existentes: no carga el data URL."""
    existentes = claves_existentes(db, [CLAVE_LOGO, CLAVE_LOGO_VERSION])
    if not existentes:
        return False
    version = None
    if CLAVE_LOGO_VERSION in existentes:
        version = leer_config(db, [CLAVE_LOGO_VERSION]).get(CLAVE_LOGO_VERSION)
    guardar_config(db, {CLAVE_LOGO: None, CLAVE_LOGO_VERSION: None})
    _registrar(db, "Logo quitado", user_name, {"version": version})
    db.commit()
    return True


def leer_logo(db: Session):
    """(mime, bytes, version) del logo guardado, o None si no hay (o si lo guardado no se puede leer)."""
    guardado = leer_config(db, [CLAVE_LOGO, CLAVE_LOGO_VERSION])
    partes = _DATA_URL.fullmatch(guardado.get(CLAVE_LOGO) or "")
    if partes is None or partes.group(1).lower() not in TIPOS_LOGO:
        return None
    try:
        contenido = base64.b64decode(partes.group(2), validate=True)
    except (binascii.Error, ValueError):
        return None
    return partes.group(1).lower(), contenido, guardado.get(CLAVE_LOGO_VERSION) or _version_de(contenido)
