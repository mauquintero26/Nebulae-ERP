"""Correos al cliente con la marca de la empresa (Bloque 3, T2: PLANTILLA, C17 y RP28).

correo_documento(perfil, tipo, numero, cliente, link, resumen=None, proposito='CONFIRMACION', vence=None) es el ÚNICO
constructor de correos al cliente (C17); T7, T8, T9 y T11 solo lo llaman. Devuelve (asunto, html).

- perfil: el de empresa.perfil_publico(db) ({nombre_comercial, ..., colores: {principal, secundario, acento}}).
- Propósitos y asuntos (RP28):
  · CONFIRMACION (SC, COT, PVEN): '{Título} {numero} de {empresa}'; sin nombre, 'Tu {título} {numero}'.
  · CONSULTA (solo PVEN, el enlace de consulta de U23): 'Confirmación de tu pedido {numero}' (+ ' de {empresa}').
  · SEGUIMIENTO (SC y COT, el recordatorio de U16-seguimiento): 'Recordatorio: confirma tu {solicitud|cotización}
    {numero}'.
- resumen (opcional): {total, anticipo, pagado, saldo} en pesos -> filas con pesos() (el pedido de U23).
- vence (opcional): la FECHA hasta la que sirve el enlace (date o 'AAAA-MM-DD'; no el expires_at, que es las 00:00 del
  día siguiente): en la COT 'Esta cotización es válida hasta el {fecha larga}.' (U22-validez); en los demás 'Este
  enlace estará disponible hasta el {fecha larga}.'.
HTML de tablas de 600 px con estilos en línea: franja con el nombre de la empresa (color principal en la SC, acento en
la COT y el PVEN; texto blanco u oscuro con color_texto_sobre), saludo, texto según el propósito, botón y enlace
escrito, y el contacto de la empresa al pie. TODO valor pasa por html.escape(quote=True) y un color que no es #RRGGBB
vuelve al de la referencia. Sin <img> del logo: los correos bloquean imágenes y el backend no conoce su URL pública.
"""
import html
import re

from app.core.documento_cliente import TITULOS
from app.core.empresa import COLORES_POR_DEFECTO, limpiar_linea
from app.core.fechas import fecha_larga
from app.core.ventas_dinero import pesos

PROPOSITOS = ("CONFIRMACION", "CONSULTA", "SEGUIMIENTO")
# Qué documento admite cada propósito: el pedido es de consulta (sin recordatorio) y solo él tiene enlace de consulta.
_TIPOS_POR_PROPOSITO = {"CONFIRMACION": ("SC", "COT", "PVEN"), "CONSULTA": ("PVEN",), "SEGUIMIENTO": ("SC", "COT")}
NOMBRES = {"SC": "solicitud", "COT": "cotización", "PVEN": "pedido"}
_FILAS_RESUMEN = (("total", "Total"), ("anticipo", "Anticipo"), ("pagado", "Pagado"), ("saldo", "Saldo"))

TEXTO_CLARO = "#FFFFFF"
TEXTO_OSCURO = "#111827"
_HEX = re.compile(r"#[0-9A-Fa-f]{6}")
_GRIS_TEXTO = "#374151"
_GRIS_SUAVE = "#6B7280"


def _luminancia(hex_color: str) -> float:
    """Luminancia relativa WCAG 2.x de '#RRGGBB'."""
    canales = []
    for i in (1, 3, 5):
        c = int(hex_color[i:i + 2], 16) / 255
        canales.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
    r, g, b = canales
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contraste(a: str, b: str) -> float:
    la, lb = _luminancia(a), _luminancia(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def color_texto_sobre(*colores) -> str:
    """'#FFFFFF' o '#111827': el que tiene el MAYOR contraste mínimo frente a todos los colores dados (un degradado se
    lee bien de punta a punta). Misma regla que colorTextoSobre del frontend; en empate, blanco. Los valores que no son
    #RRGGBB se ignoran; sin ninguno válido, blanco."""
    validos = [c for c in colores if isinstance(c, str) and _HEX.fullmatch(c)]
    if not validos:
        return TEXTO_CLARO
    minimo_claro = min(_contraste(TEXTO_CLARO, c) for c in validos)
    minimo_oscuro = min(_contraste(TEXTO_OSCURO, c) for c in validos)
    return TEXTO_CLARO if minimo_claro >= minimo_oscuro else TEXTO_OSCURO


def _e(valor) -> str:
    return html.escape("" if valor is None else str(valor), quote=True)


def _color(perfil: dict, nombre: str) -> str:
    colores = perfil.get("colores") if isinstance(perfil.get("colores"), dict) else {}
    valor = colores.get(nombre)
    return valor.upper() if isinstance(valor, str) and _HEX.fullmatch(valor) else COLORES_POR_DEFECTO[nombre]


def _asunto(nombre_empresa: str, tipo: str, numero: str, proposito: str) -> str:
    de_empresa = f" de {nombre_empresa}" if nombre_empresa else ""
    if proposito == "SEGUIMIENTO":
        asunto = f"Recordatorio: confirma tu {NOMBRES[tipo]} {numero}"
    elif proposito == "CONSULTA":
        asunto = f"Confirmación de tu {NOMBRES[tipo]} {numero}{de_empresa}"
    elif nombre_empresa:
        asunto = f"{TITULOS[tipo]} {numero}{de_empresa}"
    else:
        asunto = f"Tu {TITULOS[tipo].lower()} {numero}"
    return limpiar_linea(asunto)


def _parrafos(tipo: str, numero: str, proposito: str, nombre_empresa: str) -> list:
    nombre = NOMBRES[tipo]
    if proposito == "SEGUIMIENTO":
        de_empresa = f" de {nombre_empresa}" if nombre_empresa else ""
        return [f"Te recordamos que tu {nombre} {numero}{de_empresa} está esperando tu confirmación.",
                "Revísala y confírmala en el enlace de abajo. Si quieres cambiar algo, en esa misma página puedes pedir "
                "cambios."]
    if proposito == "CONSULTA":
        return [f"Esta es la confirmación de tu pedido {numero}.",
                "Puedes ver tu pedido, lo que has pagado y lo que te falta en este enlace."]
    if tipo == "SC":
        return [f"Te compartimos tu solicitud {numero}. Revisa los productos y confírmala en el enlace de abajo; si "
                f"quieres cambiar algo, en esa misma página puedes pedir cambios."]
    if tipo == "COT":
        return [f"Te enviamos tu cotización {numero}. Revisa los productos y los precios y confírmala en el enlace de "
                f"abajo."]
    return [f"Te enviamos tu pedido {numero}. Puedes revisarlo en el enlace de abajo."]


def _filas_resumen(resumen) -> str:
    if not isinstance(resumen, dict):
        return ""
    filas = []
    for clave, etiqueta in _FILAS_RESUMEN:
        if resumen.get(clave) is None:
            continue
        try:
            valor = pesos(resumen[clave])
        except ValueError:
            continue
        filas.append(f'<tr><td style="padding:6px 0;color:{_GRIS_TEXTO};">{_e(etiqueta)}</td>'
                     f'<td style="padding:6px 0;text-align:right;font-weight:bold;color:{TEXTO_OSCURO};">'
                     f'{_e(valor)}</td></tr>')
    if not filas:
        return ""
    return ('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
            'style="margin:16px 0;border-top:1px solid #E5E7EB;border-bottom:1px solid #E5E7EB;">'
            + "".join(filas) + "</table>")


def _texto_vence(tipo: str, vence) -> str:
    fecha = fecha_larga(vence) if vence is not None else None
    if not fecha:
        return ""
    if tipo == "COT":
        return f"Esta cotización es válida hasta el {fecha}."
    return f"Este enlace estará disponible hasta el {fecha}."


def _campo(perfil: dict, campo: str) -> str:
    valor = perfil.get(campo)
    return valor.strip() if isinstance(valor, str) else ""


def _pie(perfil: dict) -> str:
    """Contacto de la empresa: teléfono, WhatsApp, correo, página web, dirección, razón social y NIT (los que haya)."""
    renglones = [f"{_e(etiqueta)}: {_e(_campo(perfil, campo))}"
                 for etiqueta, campo in (("Teléfono", "telefono"), ("WhatsApp", "whatsapp"), ("Correo", "correo"),
                                         ("Página web", "sitio_web"))
                 if _campo(perfil, campo)]
    direccion = ", ".join(v for v in (_campo(perfil, "direccion"), _campo(perfil, "ciudad")) if v)
    if direccion:
        renglones.append(_e(direccion))
    razon_social, nit = _campo(perfil, "razon_social"), _campo(perfil, "nit")
    legal = " · ".join(x for x in (_e(razon_social), f"NIT {_e(nit)}" if nit else "") if x)
    if legal:
        renglones.append(legal)
    if not renglones:
        return ""
    return (f'<tr><td style="padding:16px 32px 24px;font-size:12px;line-height:18px;color:{_GRIS_SUAVE};'
            f'border-top:1px solid #E5E7EB;">' + "<br>".join(renglones) + "</td></tr>")


def correo_documento(perfil, tipo, numero, cliente, link, resumen=None, proposito="CONFIRMACION", vence=None):
    """(asunto, html) del correo al cliente con la marca de la empresa. Ver el docstring del módulo.
    ValueError si el tipo o el propósito no existen, o si el propósito no aplica a ese documento."""
    if tipo not in TITULOS:
        raise ValueError(f"Tipo de documento desconocido: {tipo!r}")
    if proposito not in PROPOSITOS:
        raise ValueError(f"Propósito de correo desconocido: {proposito!r}")
    if tipo not in _TIPOS_POR_PROPOSITO[proposito]:
        raise ValueError(f"El correo {proposito} no aplica a {tipo}.")
    perfil = perfil if isinstance(perfil, dict) else {}
    nombre_empresa = limpiar_linea(perfil.get("nombre_comercial"))
    numero = limpiar_linea(numero)
    asunto = _asunto(nombre_empresa, tipo, numero, proposito)

    franja = _color(perfil, "principal" if tipo == "SC" else "acento")
    texto_franja = color_texto_sobre(franja)
    titulo = f"{TITULOS[tipo]} {numero}"
    cliente = limpiar_linea(cliente)
    saludo = f"Hola {_e(cliente)}," if cliente else "Hola,"
    parrafos = "".join(f'<p style="margin:0 0 12px;">{_e(p)}</p>'
                       for p in _parrafos(tipo, numero, proposito, nombre_empresa))
    vence_txt = _texto_vence(tipo, vence)
    vence_html = f'<p style="margin:0 0 12px;font-weight:bold;">{_e(vence_txt)}</p>' if vence_txt else ""
    enlace = _e(link)

    cuerpo = f"""<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#F3F4F6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
<tr><td style="background:{franja};color:{texto_franja};padding:20px 32px;font-size:20px;font-weight:bold;">{_e(nombre_empresa or titulo)}</td></tr>
<tr><td style="padding:24px 32px 8px;font-size:15px;line-height:22px;color:{_GRIS_TEXTO};">
<p style="margin:0 0 4px;font-size:13px;color:{_GRIS_SUAVE};">{_e(titulo)}</p>
<p style="margin:0 0 12px;">{saludo}</p>
{parrafos}{_filas_resumen(resumen)}{vence_html}
</td></tr>
<tr><td style="padding:8px 32px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:{franja};border-radius:6px;">
<a href="{enlace}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 24px;color:{texto_franja};font-size:15px;font-weight:bold;text-decoration:none;">Ver {_e(NOMBRES[tipo])}</a>
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;line-height:18px;color:{_GRIS_SUAVE};">Si el botón no funciona, copia este enlace en tu navegador:<br><a href="{enlace}" style="color:{_GRIS_TEXTO};word-break:break-all;">{enlace}</a></p>
</td></tr>
{_pie(perfil)}
</table>
</td></tr>
</table>
</body>
</html>"""
    return asunto, cuerpo
