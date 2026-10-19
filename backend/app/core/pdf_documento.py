"""El PDF del documento del cliente: la cotización y el pedido adjuntos al correo (Bloque 3, T9: ítem PDF opción 1, R2,
C2 y U23).

pdf_documento(documento, perfil, logo=None) -> bytes dibuja con reportlab el MISMO dict que ve el cliente en su página
(documento_cot / documento_pven de core/documento_cliente.py, contrato C2/R24):
- Los números se copian del documento y solo se les da formato (pesos, formato_pct): nunca se suma, multiplica ni
  recalcula un total, un IVA, un saldo o el total de una línea. Un dato que falta (None) no se dibuja.
- Lista blanca: solo dibuja las claves del contrato y los datos públicos de la empresa (empresa.perfil_publico). El
  documento ya no trae costos, márgenes, notas internas, notas del pedido ni ids, y el PDF no recibe el enlace ni su
  token.
- Tamaño Carta, márgenes de 12 mm, Helvetica (cubre tildes y ñ; un carácter fuera de WinAnsi sale con la fuente de
  sustitución de reportlab, sin romper). Todo texto pasa por escape(): un '<' o un '&' del cliente es texto, nunca
  marcado de reportlab. Las notas y los términos son párrafos sueltos: se reparten en varias páginas.
- Encabezado con el logo, el nombre y el NIT de la empresa y el título en el color de acento (como la página de la COT
  y del PVEN); la banda del TOTAL va en ese color con el texto de color_texto_sobre (la misma regla del correo).
- logo: (mime, bytes[, versión]) de empresa.leer_logo, o None. Un logo que no se puede leer, de dimensiones absurdas
  (más de LOGO_MAX_LADO_PX por lado) o que falla al dibujarse no rompe nada: el PDF sale sin logo (logger.warning).

reportlab se importa DENTRO de las funciones (R2): este módulo carga sin él y, si falta, pdf_documento lanza ImportError;
quien la llama manda el correo sin adjunto. Sin base de datos ni FastAPI.
"""
import io
import logging
import re
from decimal import Decimal, InvalidOperation
from xml.sax.saxutils import escape

from app.core.correo_documento import color_texto_sobre
from app.core.documento_cliente import TITULOS, etiqueta_modalidad
from app.core.empresa import COLORES_POR_DEFECTO, es_color_hex, limpiar_linea
from app.core.fechas import fecha_larga
from app.core.ventas_dinero import formato_pct, pesos

logger = logging.getLogger(__name__)

MIME_PDF = "application/pdf"
MARGEN_MM = 12
LOGO_MAX_ANCHO_MM, LOGO_MAX_ALTO_MM = 45, 18
# Un logo de más píxeles por lado no se dibuja: reportlab lo descomprimiría entero en memoria en cada envío.
LOGO_MAX_LADO_PX = 4000

_TEXTO = "#374151"
_SUAVE = "#6B7280"
_OSCURO = "#111827"
_LINEA = "#E5E7EB"
_FONDO = "#F3F4F6"
_AMBAR_FONDO, _AMBAR_TEXTO = "#FEF3C7", "#92400E"
# Lo que no puede ir en un párrafo: caracteres de control (salvo el salto de línea) y surrogates sueltos (U+D800-DFFF,
# un escape JSON mal formado), que no se pueden codificar.
_NO_IMPRIMIBLE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f\ud800-\udfff]")


# ─── Formato (sin recalcular) ─────────────────────────────────────────────────────────────────────────────────

def _texto(valor) -> str:
    """Texto para un Paragraph: escapado (&, <, >), sin caracteres de control y con los saltos de línea como <br/>.
    None -> ''."""
    if valor is None:
        return ""
    texto = str(valor).replace("\r\n", "\n").replace("\r", "\n").replace("\t", " ")
    return escape(_NO_IMPRIMIBLE.sub("", texto)).replace("\n", "<br/>")


def _linea(valor) -> str:
    """Un texto de una sola línea (nombres, números, datos de contacto), escapado."""
    return escape(_NO_IMPRIMIBLE.sub("", limpiar_linea(valor)))


def _es_numero(valor) -> bool:
    return isinstance(valor, (int, float, Decimal)) and not isinstance(valor, bool)


def _positivo(valor) -> bool:
    return _es_numero(valor) and valor > 0


def _pesos(valor) -> str:
    """'$1.062.523' de un monto del documento (ya en pesos enteros); '' si no viene o no es un monto."""
    if valor is None:
        return ""
    try:
        return pesos(valor)
    except ValueError:
        return ""


def _pct(valor) -> str:
    try:
        return formato_pct(valor) if _es_numero(valor) else ""
    except (ValueError, InvalidOperation):
        return ""


def _cantidad(valor) -> str:
    """La cantidad de la línea como la escribe el documento: '2', '2,5' (coma decimal es-CO)."""
    if not _es_numero(valor):
        return ""
    try:
        d = Decimal(str(valor)).normalize()
    except InvalidOperation:
        return ""
    if not d.is_finite():
        return ""
    if d == d.to_integral_value():
        d = d.quantize(Decimal(1))
    return format(d, "f").replace(".", ",")


def _fecha(valor) -> str:
    """'8 de octubre de 2026' de una fecha del documento ('AAAA-MM-DD' o instante '...Z'); '' si no se puede leer."""
    try:
        return fecha_larga(valor) or ""
    except (TypeError, ValueError):
        return ""


def _color(perfil: dict, nombre: str) -> str:
    """El color de la marca (#RRGGBB) o el de la referencia si no es válido (la misma regla del correo)."""
    colores = perfil.get("colores") if isinstance(perfil.get("colores"), dict) else {}
    valor = colores.get(nombre)
    return valor.upper() if es_color_hex(valor) else COLORES_POR_DEFECTO[nombre]


def _campo(perfil: dict, campo: str) -> str:
    valor = perfil.get(campo)
    return valor.strip() if isinstance(valor, str) else ""


# ─── Contenido (qué se dibuja, en el orden de la página) ──────────────────────────────────────────────────────

def _filas_totales(documento: dict) -> list:
    """[(etiqueta, valor, estilo)] del bloque de totales, con estilo None | 'total' | 'ambar' | 'fuerte':
    Subtotal; 'Descuento (x%)' si es > 0; una fila por impuesto; 'Ajuste por redondeo' si es != 0; TOTAL. Con pago:
    'Anticipo (x%)', 'Saldo a favor' y 'Anticipo por pagar' (si hay saldo a favor), 'Pagado' (si es > 0), 'Anticipo
    pendiente' (el pedido, si es > 0, en ámbar: R4) y 'Saldo' ('Saldo por pagar', destacado, en el pedido)."""
    filas = []
    totales = documento.get("totales")
    if isinstance(totales, dict):
        filas.append(("Subtotal", _pesos(totales.get("subtotal")), None))
        if _positivo(totales.get("descuento")):
            pct = _pct(totales.get("descuento_pct"))
            filas.append((f"Descuento ({pct})" if pct else "Descuento", f"-{_pesos(totales['descuento'])}", None))
        for impuesto in totales.get("impuestos") or []:
            if isinstance(impuesto, dict):
                filas.append((_linea(impuesto.get("etiqueta")) or "IVA", _pesos(impuesto.get("valor")), None))
        ajuste = totales.get("ajuste_redondeo")
        if _es_numero(ajuste) and ajuste != 0:
            filas.append(("Ajuste por redondeo", _pesos(ajuste), None))
        filas.append(("TOTAL", _pesos(totales.get("total")), "total"))
    pago = documento.get("pago")
    if not (isinstance(pago, dict) and documento.get("con_precios")):
        return filas
    es_pedido = documento.get("tipo") == "PVEN"
    if pago.get("anticipo") is not None:
        pct = _pct(pago.get("anticipo_pct"))
        filas.append((f"Anticipo ({pct})" if pct else "Anticipo", _pesos(pago["anticipo"]), None))
    if _positivo(pago.get("saldo_a_favor")):
        filas.append(("Saldo a favor", _pesos(pago["saldo_a_favor"]), None))
        if pago.get("anticipo_por_pagar") is not None:
            filas.append(("Anticipo por pagar", _pesos(pago["anticipo_por_pagar"]), "fuerte"))
    if _positivo(pago.get("pagado")):
        filas.append(("Pagado", _pesos(pago["pagado"]), None))
    if es_pedido and _positivo(pago.get("anticipo_por_pagar")):
        filas.append(("Anticipo pendiente", _pesos(pago["anticipo_por_pagar"]), "ambar"))
    if pago.get("saldo") is not None:
        filas.append(("Saldo por pagar" if es_pedido else "Saldo", _pesos(pago["saldo"]),
                      "fuerte" if es_pedido else None))
    return filas


def _texto_anticipo_cotizacion(pago: dict, totales: dict) -> str:
    """El renglón de la forma de pago de la COT (textoFormaPago de la página): el anticipo que pide la cotización y el
    saldo, con los montos del documento tal cual."""
    pct, anticipo, saldo = pago.get("anticipo_pct"), pago.get("anticipo"), pago.get("saldo")
    if not _es_numero(pct) or anticipo is None:
        return ""
    if pago.get("manual"):
        texto = f"Anticipo acordado: {_pct(pct)} ({_pesos(anticipo)}). Saldo: {_pesos(saldo)}."
    elif pct >= 100:
        texto = f"Pagas el 100% ({_pesos(anticipo)}) antes de que procesemos el pedido."
    elif pct > 0:
        texto = f"Anticipo del {_pct(pct)} ({_pesos(anticipo)}) para confirmar el pedido. Saldo: {_pesos(saldo)}."
    else:
        texto = f"Sin anticipo. Total a pagar: {_pesos(totales.get('total'))}."
    if _positivo(pago.get("saldo_a_favor")):
        texto += (f" Ya tienes {_pesos(pago['saldo_a_favor'])} a favor de un pedido anterior: te falta pagar "
                  f"{_pesos(pago.get('anticipo_por_pagar'))} de anticipo.")
    return texto


def _renglones_pie(perfil: dict) -> list:
    """Contacto de la empresa (como el pie del correo): teléfono, WhatsApp, correo, página web, dirección y razón social
    con NIT, los que haya. Textos ya escapados."""
    renglones = [f"{etiqueta}: {_linea(_campo(perfil, campo))}"
                 for etiqueta, campo in (("Teléfono", "telefono"), ("WhatsApp", "whatsapp"), ("Correo", "correo"),
                                         ("Página web", "sitio_web"))
                 if _campo(perfil, campo)]
    direccion = ", ".join(v for v in (_campo(perfil, "direccion"), _campo(perfil, "ciudad")) if v)
    if direccion:
        renglones.append(_linea(direccion))
    razon_social, nit = _campo(perfil, "razon_social"), _campo(perfil, "nit")
    legal = " · ".join(x for x in (_linea(razon_social), f"NIT {_linea(nit)}" if nit else "") if x)
    if legal:
        renglones.append(legal)
    return renglones


def _logo_utilizable(logo):
    """(bytes, ancho_px, alto_px) del logo si reportlab lo puede leer y no es demasiado grande; si no, None (warning).
    Solo lee la cabecera de la imagen: un archivo truncado puede pasar aquí y fallar al dibujarse (ver pdf_documento)."""
    if not logo:
        return None
    from reportlab.lib.utils import ImageReader
    try:
        contenido = logo[1]
        ancho, alto = ImageReader(io.BytesIO(contenido)).getSize()
    except Exception:
        logger.warning("PDF del documento: el logo de la empresa no se puede leer; sale sin logo", exc_info=True)
        return None
    if not (0 < ancho <= LOGO_MAX_LADO_PX and 0 < alto <= LOGO_MAX_LADO_PX):
        logger.warning("PDF del documento: el logo mide %sx%s px (máximo %s por lado); sale sin logo", ancho, alto,
                       LOGO_MAX_LADO_PX)
        return None
    return contenido, ancho, alto


# ─── Dibujo ─────────────────────────────────────────────────────────────────────────────────────────────────────

def pdf_documento(documento: dict, perfil: dict, logo=None) -> bytes:
    """Los bytes del PDF del documento del cliente (ver el docstring del módulo). ImportError si falta reportlab; un
    documento que reportlab no puede dibujar lanza su error (quien la llama manda el correo sin adjunto)."""
    from reportlab.platypus import BaseDocTemplate  # noqa: F401  (sin reportlab, ImportError antes de nada)
    imagen = _logo_utilizable(logo)
    try:
        return _construir(documento, perfil, imagen)
    except Exception:
        if imagen is None:
            raise
        # El logo pasó la lectura de su cabecera pero falló al dibujarse (p. ej. un PNG truncado): sin logo.
        logger.warning("PDF del documento: el logo de la empresa falló al dibujarse; sale sin logo", exc_info=True)
        return _construir(documento, perfil, None)


def _construir(documento: dict, perfil: dict, imagen) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_RIGHT
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import (BaseDocTemplate, Frame, Image, PageTemplate, Paragraph, Spacer, Table,
                                    TableStyle)

    documento = documento if isinstance(documento, dict) else {}
    perfil = perfil if isinstance(perfil, dict) else {}
    tipo = documento.get("tipo")
    titulo = TITULOS.get(tipo) or limpiar_linea(documento.get("titulo")) or "Documento"
    numero = limpiar_linea(documento.get("numero"))
    nombre_empresa = limpiar_linea(perfil.get("nombre_comercial"))
    acento = _color(perfil, "acento")
    sobre_acento = color_texto_sobre(acento)
    margen = MARGEN_MM * mm
    ancho = LETTER[0] - 2 * margen

    def estilo(nombre, **kw):
        base = {"fontName": "Helvetica", "fontSize": 9, "leading": 12, "textColor": colors.HexColor(_TEXTO)}
        return ParagraphStyle(nombre, **{**base, **kw})

    normal = estilo("normal")
    pequeno = estilo("pequeno", fontSize=7.5, leading=10, textColor=colors.HexColor(_SUAVE))
    negrita = estilo("negrita", fontName="Helvetica-Bold", textColor=colors.HexColor(_OSCURO))
    seccion = estilo("seccion", fontName="Helvetica-Bold", fontSize=10, leading=14, spaceBefore=8, spaceAfter=2,
                     textColor=colors.HexColor(_OSCURO))
    derecha = estilo("derecha", alignment=TA_RIGHT)
    derecha_negrita = estilo("derecha_negrita", alignment=TA_RIGHT, fontName="Helvetica-Bold",
                             textColor=colors.HexColor(_OSCURO))
    derecha_pequeno = estilo("derecha_pequeno", alignment=TA_RIGHT, fontSize=7.5, leading=10,
                             textColor=colors.HexColor(_SUAVE))
    titulo_estilo = estilo("titulo", alignment=TA_RIGHT, fontName="Helvetica-Bold", fontSize=20, leading=24,
                           textColor=colors.HexColor(acento))
    empresa_estilo = estilo("empresa", fontName="Helvetica-Bold", fontSize=12, leading=15,
                            textColor=colors.HexColor(_OSCURO))
    flujo = []

    # Encabezado: logo, empresa y NIT | TÍTULO y fecha; una raya en el color de acento.
    izquierda = []
    if imagen is not None:
        contenido, ancho_px, alto_px = imagen
        escala = min(LOGO_MAX_ANCHO_MM * mm / ancho_px, LOGO_MAX_ALTO_MM * mm / alto_px)
        logo_flowable = Image(io.BytesIO(contenido), width=ancho_px * escala, height=alto_px * escala)
        logo_flowable.hAlign = "LEFT"
        izquierda.append(logo_flowable)
    if nombre_empresa:
        izquierda.append(Paragraph(escape(nombre_empresa), empresa_estilo))
    if _campo(perfil, "nit"):
        izquierda.append(Paragraph(f"NIT {_linea(_campo(perfil, 'nit'))}", pequeno))
    derecha_encabezado = [Paragraph(escape(titulo.upper()), titulo_estilo)]
    fecha = _fecha(documento.get("fecha_emision"))
    if fecha:
        derecha_encabezado.append(Paragraph(escape(fecha), derecha))
    encabezado = Table([[izquierda or "", derecha_encabezado]], colWidths=[ancho * 0.55, ancho * 0.45])
    encabezado.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, 0), 2, colors.HexColor(acento))]))
    flujo += [encabezado, Spacer(1, 4 * mm)]

    # Para: cliente y dirección | N.º, validez, entrega estimada y quién atiende.
    cliente = documento.get("cliente") if isinstance(documento.get("cliente"), dict) else {}
    para = [Paragraph("Para:", pequeno), Paragraph(_linea(cliente.get("nombre")), negrita)]
    if cliente.get("direccion_entrega"):
        para.append(Paragraph(_texto(cliente["direccion_entrega"]), normal))
    meta = [("N.º", escape(numero))]
    for etiqueta, clave in (("Válida hasta", "valida_hasta"), ("Entrega estimada", "fecha_entrega_estimada")):
        if _fecha(documento.get(clave)):
            meta.append((etiqueta, escape(_fecha(documento[clave]))))
    if documento.get("atendido_por"):
        meta.append(("Atendido por", _linea(documento["atendido_por"])))
    datos = [Paragraph(f'<font color="{_SUAVE}">{etiqueta}:</font> {valor}', derecha) for etiqueta, valor in meta]
    bloque_para = Table([[para, datos]], colWidths=[ancho * 0.55, ancho * 0.45])
    bloque_para.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                     ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    flujo += [bloque_para, Spacer(1, 5 * mm)]

    # Líneas: CANT. | DESCRIPCIÓN | PRECIO UNIT. | TOTAL (sin precios, solo las dos primeras).
    con_precios = bool(documento.get("con_precios"))
    lineas = [l for l in (documento.get("lineas") or []) if isinstance(l, dict)]
    if lineas:
        if con_precios:
            filas = [["CANT.", "DESCRIPCIÓN", "PRECIO UNIT.", "TOTAL"]]
            anchos = [16 * mm, ancho - 80 * mm, 32 * mm, 32 * mm]
        else:
            filas = [["CANT.", "DESCRIPCIÓN"]]
            anchos = [16 * mm, ancho - 16 * mm]
        for l in lineas:
            descripcion = [Paragraph(_texto(l.get("descripcion")), normal)]
            if con_precios and l.get("iva_etiqueta"):
                descripcion.append(Paragraph(_linea(l["iva_etiqueta"]), pequeno))
            fila = [Paragraph(_cantidad(l.get("cantidad")), normal), descripcion]
            if con_precios:
                precio = [Paragraph(_pesos(l.get("precio_unitario")), derecha)]
                if l.get("anticipo") is not None:  # U19: la parte del anticipo de la línea (solo la COT)
                    precio.append(Paragraph(f"Anticipo: {_pesos(l['anticipo'])}", derecha_pequeno))
                fila += [precio, Paragraph(_pesos(l.get("total_linea")), derecha)]
            filas.append(fila)
        tabla = Table(filas, colWidths=anchos, repeatRows=1)
        tabla.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8), ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor(_OSCURO)),
            ("ALIGN", (2, 0), (-1, 0), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (0, -1), 0), ("RIGHTPADDING", (-1, 0), (-1, -1), 0),
            ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor(acento)),
            ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor(_LINEA)),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        flujo += [tabla, Spacer(1, 4 * mm)]

    # Totales, a la derecha; el TOTAL en una banda del color de acento.
    filas_totales = _filas_totales(documento)
    if filas_totales:
        celdas, estilos = [], [("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                               ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                               ("ALIGN", (1, 0), (1, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                               ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
                               ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor(_TEXTO))]
        for i, (etiqueta, valor, tono) in enumerate(filas_totales):
            celdas.append([Paragraph(etiqueta, normal), valor])
            if tono == "total":
                celdas[-1][0] = Paragraph(etiqueta, estilo("total", fontName="Helvetica-Bold", fontSize=11,
                                                           leading=14, textColor=colors.HexColor(sobre_acento)))
                estilos += [("BACKGROUND", (0, i), (-1, i), colors.HexColor(acento)),
                            ("TEXTCOLOR", (1, i), (1, i), colors.HexColor(sobre_acento)),
                            ("FONT", (1, i), (1, i), "Helvetica-Bold", 11)]
            elif tono == "ambar":
                estilos += [("BACKGROUND", (0, i), (-1, i), colors.HexColor(_AMBAR_FONDO)),
                            ("TEXTCOLOR", (1, i), (1, i), colors.HexColor(_AMBAR_TEXTO))]
            elif tono == "fuerte":
                celdas[-1][0] = Paragraph(etiqueta, negrita)
                estilos += [("FONT", (1, i), (1, i), "Helvetica-Bold", 10),
                            ("TEXTCOLOR", (1, i), (1, i), colors.HexColor(_OSCURO))]
        bloque_totales = Table(celdas, colWidths=[55 * mm, 35 * mm], hAlign="RIGHT")
        bloque_totales.setStyle(TableStyle(estilos))
        flujo += [bloque_totales, Spacer(1, 3 * mm)]

    # Forma de pago, pagos registrados (el pedido) y datos para pagar.
    pago = documento.get("pago") if isinstance(documento.get("pago"), dict) else None
    if pago is not None:
        renglones = []
        if etiqueta_modalidad(pago.get("modalidad")):
            renglones.append(Paragraph(_linea(etiqueta_modalidad(pago.get("modalidad"))), negrita))
        if tipo == "COT":
            texto = _texto_anticipo_cotizacion(pago, documento.get("totales") or {})
            if texto:
                renglones.append(Paragraph(escape(texto), normal))
        if renglones:
            flujo += [Paragraph("Forma de pago", seccion), *renglones]
        pagos = [p for p in (pago.get("pagos") or []) if isinstance(p, dict)]
        if pagos:
            filas_pagos = [[Paragraph(_linea(p.get("concepto")), normal), Paragraph(_linea(p.get("metodo")), normal),
                            Paragraph(escape(_fecha(p.get("fecha"))), normal),
                            Paragraph(_pesos(p.get("monto")), derecha)] for p in pagos]
            tabla_pagos = Table(filas_pagos, colWidths=[ancho * 0.3, ancho * 0.3, ancho * 0.22, ancho * 0.18])
            tabla_pagos.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                                             ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                             ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor(_LINEA))]))
            flujo += [Paragraph("Pagos registrados", seccion), tabla_pagos]
        if pago.get("instrucciones"):
            flujo += [Paragraph("Datos para pagar", seccion), Paragraph(_texto(pago["instrucciones"]), normal)]

    # Notas (sin amarillo, U14) y términos: párrafos sueltos que se reparten en varias páginas.
    nota_estilo = estilo("nota", backColor=colors.HexColor(_FONDO), borderPadding=4, spaceAfter=6)
    for nota in documento.get("notas") or []:
        if isinstance(nota, dict) and nota.get("texto"):
            flujo += [Paragraph(_linea(nota.get("titulo")) or "Notas", seccion),
                      Paragraph(_texto(nota["texto"]), nota_estilo)]
    if documento.get("terminos"):
        flujo += [Paragraph("Términos y condiciones", seccion), Paragraph(_texto(documento["terminos"]), normal)]

    # Pie: contacto de la empresa y el mensaje de pie.
    pie = _renglones_pie(perfil)
    if pie or documento.get("mensaje_pie"):
        flujo.append(Spacer(1, 6 * mm))
        if documento.get("mensaje_pie"):
            flujo.append(Paragraph(_texto(documento["mensaje_pie"]), negrita))
        flujo += [Paragraph(renglon, pequeno) for renglon in pie]

    referencia = f"{titulo} {numero}".strip()

    def numerar(canvas, hoja):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor(_SUAVE))
        canvas.drawRightString(LETTER[0] - margen, margen / 2, f"{referencia} · Página {hoja.page}")
        canvas.restoreState()

    # Un marco sin relleno: el contenido llena exactamente la hoja menos los 12 mm de cada lado.
    salida = io.BytesIO()
    hoja = BaseDocTemplate(salida, pagesize=LETTER, leftMargin=margen, rightMargin=margen, topMargin=margen,
                           bottomMargin=margen, title=referencia, author=nombre_empresa, subject=referencia,
                           creator=nombre_empresa)
    marco = Frame(margen, margen, ancho, LETTER[1] - 2 * margen, leftPadding=0, rightPadding=0, topPadding=0,
                  bottomPadding=0, id="hoja")
    hoja.addPageTemplates([PageTemplate(id="hoja", frames=[marco], onPage=numerar)])
    hoja.build(flujo)
    return salida.getvalue()
