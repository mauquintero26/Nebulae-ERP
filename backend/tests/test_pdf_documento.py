"""Bloque 3, Tarea 9 — ítem PDF, opción 1 (R2, C2, U23): el PDF de la cotización y del pedido, adjunto al correo.

- core/pdf_documento.pdf_documento(documento, perfil, logo) -> bytes dibuja con reportlab el MISMO dict del documento
  del cliente (documento_cot / documento_pven, C2) sin recalcular ningún número; reportlab se importa dentro.
- email.send_email(..., adjuntos=[(nombre, bytes, mime)]): con adjuntos, multipart/mixed con la parte 'alternative'
  adentro y una parte por adjunto; sin adjuntos, el mensaje de siempre.
- El correo de la COT (enviar-confirmacion) y el del PVEN (enviar-al-cliente) llevan COT-….pdf / PVEN-….pdf, sea el
  principal (Email) o el de respaldo (WhatsApp u Otro). La SC no lleva PDF. Si el PDF falla o falta reportlab, el
  correo sale sin adjunto, su mensaje dice «(sin PDF adjunto)» y la respuesta del envío es la de siempre.
- RP16: el PDF se arma después del único commit del envío (sin alargar la transacción con filas bloqueadas) y nunca
  agrega commits; el PDF no lleva datos internos ni el enlace del cliente.

Nunca correo real: send_email falso (acepta **kwargs, RP12) o smtplib.SMTP falso con variables ficticias (R18).
Los símbolos nuevos de T9 se importan DENTRO de cada prueba (el runner importa el módulo fuera de un try).
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_pdf_documento
"""
import datetime
import email
import io
import logging
from email.header import decode_header, make_header
import re
import struct
import sys
import uuid
import zlib

PDF = "application/pdf"
CORREO = "ana@cliente.com"
TELEFONO = "3001112233"
SIN_PDF = "(sin PDF adjunto)"
ASESORA = "Laura Gómez"
MOD_60_40 = "60/40 (60% anticipo - 40% pendiente)"
PROVEEDOR = "PROVEEDOR-SECRETO-T9"
NOTA_INTERNA_SC = "NOTA-INTERNA-SC-T9"
NOTA_DEL_PEDIDO = "NOTA-DEL-PEDIDO-T9"
TALADRO = {"product_name": "Taladro percutor", "qty": 1, "unit_price_cop": 2341952, "iva_tarifa": "19",
           "cost_usd": 4321.98, "margen_pct": 37, "proveedor": PROVEEDOR}
# B3 T11 (U16-seguimiento): la respuesta del envío de la COT suma 'seguimiento' (el PVEN no tiene seguimiento).
CLAVES_RESPUESTA_COT = {"status", "data", "link_confirmacion", "canal", "correo", "vence", "whatsapp", "seguimiento"}
CLAVES_RESPUESTA_PVEN = {"status", "link", "canal", "correo", "vence", "whatsapp"}


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


# ─── Ayudas ──────────────────────────────────────────────────────────────────────────────────────────────────

def _sin_comprimir(monkeypatch):
    """pageCompression=0: el texto de las páginas queda legible en los bytes del PDF (solo en la prueba)."""
    from reportlab import rl_config
    monkeypatch.setattr(rl_config, "pageCompression", 0)


_LITERAL_TJ = re.compile(rb"\(((?:\\.|[^\\)])*)\)\s*Tj", re.DOTALL)
_ESCAPES_PDF = {b"n": b"\n", b"r": b"\r", b"t": b"\t", b"b": b"\b", b"f": b"\f"}


def _textos_pdf(pdf: bytes) -> str:
    """El texto de un PDF sin comprimir: las cadenas (…) Tj, sin sus escapes (\\( \\) \\\\ y octales WinAnsi), unidas
    con un espacio y con los espacios de más colapsados."""
    partes = []
    for m in _LITERAL_TJ.finditer(pdf):
        crudo, salida, i = m.group(1), bytearray(), 0
        while i < len(crudo):
            if crudo[i:i + 1] != b"\\":
                salida += crudo[i:i + 1]
                i += 1
                continue
            j = i + 1
            octal = b""
            while j < len(crudo) and len(octal) < 3 and crudo[j:j + 1] in (b"0", b"1", b"2", b"3", b"4", b"5", b"6",
                                                                          b"7"):
                octal += crudo[j:j + 1]
                j += 1
            if octal:
                salida.append(int(octal, 8))
                i = j
            else:
                salida += _ESCAPES_PDF.get(crudo[i + 1:i + 2], crudo[i + 1:i + 2])
                i += 2
        partes.append(salida.decode("cp1252", errors="replace"))
    return " ".join(" ".join(partes).split())


def _png(ancho: int, alto: int) -> bytes:
    """Un PNG RGB válido de ancho x alto (naranja), armado a mano: sin depender de PIL en la prueba."""
    def trozo(tipo, datos):
        return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)
    filas = b"".join(b"\x00" + b"\xc2\x41\x0c" * ancho for _ in range(alto))
    return (b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0))
            + trozo(b"IDAT", zlib.compress(filas)) + trozo(b"IEND", b""))


def _png_cabecera(ancho: int, alto: int) -> bytes:
    """Un PNG cuya cabecera (IHDR) dice ancho x alto pero con datos mínimos: la forma de una bomba de descompresión."""
    def trozo(tipo, datos):
        return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0))
            + trozo(b"IDAT", zlib.compress(b"\x00" * 16)) + trozo(b"IEND", b""))


def _imagen_pil(formato: str, ancho: int, alto: int, ruido: bool = False) -> bytes:
    """Una imagen de prueba en `formato` (PNG, JPEG, WEBP, GIF, BMP) con Pillow, que trae reportlab. Con ruido, no se
    comprime: un logo «tipo foto» que pesa."""
    import os as _os
    from PIL import Image
    if ruido:
        imagen = Image.frombytes("RGB", (ancho, alto), _os.urandom(ancho * alto * 3))
    else:
        imagen = Image.new("RGB", (ancho, alto), (194, 65, 12))
    salida = io.BytesIO()
    imagen.save(salida, formato, **({"quality": 90} if formato in ("JPEG", "WEBP") else {}))
    return salida.getvalue()


def _imagenes_pdf(pdf: bytes) -> list:
    """[(ancho, alto, filtro)] de cada imagen incrustada (/Subtype /Image) del PDF; filtro es el /Filter en bytes
    (con b'/FlateDecode' es sin pérdida, con b'/DCTDecode' es JPEG) o b'' si no tiene."""
    imagenes = []
    for diccionario in re.findall(rb"<<([^<>]*?/Subtype /Image[^<>]*?)>>", pdf):
        filtro = re.search(rb"/Filter\s*(\[[^\]]*\]|/\w+)", diccionario)
        imagenes.append((int(re.search(rb"/Width (\d+)", diccionario).group(1)),
                         int(re.search(rb"/Height (\d+)", diccionario).group(1)),
                         filtro.group(1) if filtro else b""))
    return imagenes


def _paginas(texto: str) -> list:
    """El texto de cada hoja, partido por el pie «… · Página N» (se dibuja al empezar cada hoja)."""
    return [t for t in re.split(r"· Página \d+", texto)[1:]]


def _correo_falso(monkeypatch, configurado=True, resultado=True, al_enviar=None):
    """send_email y smtp_configurado falsos (RP12: el falso acepta **kwargs). Devuelve la lista de llamadas."""
    import app.core.email as correo
    llamadas = []

    def enviar(to, subject, html_body, **kwargs):
        llamadas.append({"to": to, "subject": subject, "html_body": html_body, **kwargs})
        if al_enviar is not None:
            al_enviar()
        return resultado

    monkeypatch.setattr(correo, "send_email", enviar)
    monkeypatch.setattr(correo, "smtp_configurado", lambda: configurado)
    return llamadas


def _sin_reportlab(monkeypatch):
    """Como si reportlab no estuviera instalado: cada módulo reportlab* en sys.modules pasa a None (import -> error)."""
    nombres = {n for n in sys.modules if n == "reportlab" or n.startswith("reportlab.")} | {"reportlab"}
    for nombre in nombres:
        monkeypatch.setitem(sys.modules, nombre, None)


def _silenciar(monkeypatch, *loggers):
    for nombre in loggers:
        monkeypatch.setattr(logging.getLogger(nombre), "disabled", True)


def _cot(db, **campos):
    """SC 60/40 (asesora, nota interna) -> COT en Borrador con el Taladro con IVA 19%: $2.341.952 + $444.971 =
    $2.786.923 (calcular_totales_cotizacion, la regla del IVA). La línea trae costo, margen y proveedor (internos)."""
    from app.core.iva import calcular_totales_cotizacion
    from app.models.erp_documents import CustomerRequest, SalesQuotation
    t = calcular_totales_cotizacion([dict(TALADRO)], 0)
    assert (t["subtotal_cop"], t["iva_cop"], t["total_cop"]) == (2341952, 444971, 2786923)
    s = _sufijo()
    datos = {"customer_name": "Ana Pérez", "customer_email": CORREO, "customer_phone": TELEFONO}
    sc = CustomerRequest(numero=f"SC-T9P{s}", estado="CONFIRMADA", modalidad_pago=MOD_60_40, advisor_name=ASESORA,
                         notas=NOTA_INTERNA_SC, productos=[{"product_name": "Taladro percutor", "qty": 1}], **datos)
    db.add(sc); db.commit(); db.refresh(sc)
    campos.setdefault("estado", "BORRADOR")
    cot = SalesQuotation(numero=f"COT-T9P{s}", sc_id=sc.id, sc_numero=sc.numero, productos=t["lineas"],
                         subtotal_cop=t["subtotal_cop"], tax_cop=t["iva_cop"], total_cop=t["total_cop"],
                         descuento_pct=0, **{**datos, **campos})
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _pedido(db, pagado=600000, **campos):
    """SC 60/40 -> COT CONFIRMADA -> PVEN PENDIENTE_COMPRA de $1.000.000 con anticipo pagado de `pagado` (saldo =
    total - pagado) y una nota interna del pedido (como test_enviar_pedido_al_cliente de T7)."""
    from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation
    from app.models.fase4 import SaleOrderPayment
    productos = [{"product_name": "Sofá", "qty": 2, "unit_price_cop": 400000, "total_cop": 800000,
                  "cost_usd": 4321.98, "proveedor": PROVEEDOR},
                 {"product_name": "Mesa", "qty": 1, "unit_price_cop": 200000, "total_cop": 200000}]
    s = _sufijo()
    datos = {"customer_name": "Ana Pérez", "customer_email": CORREO, "customer_phone": TELEFONO}
    sc = CustomerRequest(numero=f"SC-T9V{s}", estado="CONFIRMADA", modalidad_pago=MOD_60_40, advisor_name=ASESORA,
                         notas=NOTA_INTERNA_SC, productos=[{"product_name": "Sofá", "qty": 2}], **datos)
    db.add(sc); db.commit(); db.refresh(sc)
    cot = SalesQuotation(numero=f"COT-T9V{s}", sc_id=sc.id, sc_numero=sc.numero, estado="CONFIRMADA",
                         productos=[dict(p) for p in productos], subtotal_cop=1000000, total_cop=1000000,
                         anticipo_cop=600000, **datos)
    db.add(cot); db.commit(); db.refresh(cot)
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    so = SaleOrder(numero=f"PVEN-T9V{s}", sc_id=sc.id, sc_numero=sc.numero, cot_id=cot.id, cot_numero=cot.numero,
                   productos=[dict(p) for p in productos], subtotal_cop=1000000, total_cop=1000000,
                   saldo_cop=1000000 - pagado, anticipo_cop=pagado, anticipo_pct_snapshot=60, notas=NOTA_DEL_PEDIDO,
                   **{**datos, **campos})
    db.add(so); db.commit(); db.refresh(so)
    if pagado:
        db.add(SaleOrderPayment(sale_order_id=so.id, tipo="ANTICIPO", monto=pagado, estado="CONFIRMADO",
                                metodo_pago="Transferencia bancaria", referencia_bancaria="BANCOL-T9-REF",
                                fecha=datetime.date(2026, 10, 3)))
        db.commit()
    return so


def _enviar_cot(app_client, token, cot, body=None):
    return app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json=body or {"canal": "Email"},
                           headers=auth(token))


def _enviar_pven(app_client, token, so, body=None):
    return app_client.post(f"/api/v1/ventas/pedidos/{so.id}/enviar-al-cliente", json=body or {"canal": "Email"},
                           headers=auth(token))


def _raw(link: str) -> str:
    return link.rsplit("/", 1)[-1]


def _renglon(db, tipo, doc_id, accion):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    return (db.query(ActivityLog)
            .filter(ActivityLog.entity_type == tipo, ActivityLog.entity_id == doc_id, ActivityLog.action == accion)
            .order_by(ActivityLog.id.desc()).first())


def _fila_correo(renglon):
    return next(c for c in renglon.extra_data["cambios"] if c["etiqueta"] in ("Correo", "Correo de respaldo"))


def _unico_adjunto(llamada, numero):
    adjuntos = llamada.get("adjuntos")
    assert isinstance(adjuntos, list) and len(adjuntos) == 1, adjuntos
    nombre, contenido, mime = adjuntos[0]
    assert (nombre, mime) == (f"{numero}.pdf", PDF)
    assert isinstance(contenido, bytes) and contenido.startswith(b"%PDF-")
    return contenido


# ─── 1-4: el PDF (pdf_documento) ─────────────────────────────────────────────────────────────────────────────

def test_pdf_de_la_cotizacion_trae_el_numero_y_el_total(db, monkeypatch):
    """Los bytes empiezan por %PDF- y, sin comprimir, contienen el número y '$2.786.923' (diseño, prueba 1). Las filas
    salen del documento: el IVA por tarifa, el anticipo de la COT y su validez; sin ajuste por redondeo."""
    from app.core.documento_cliente import documento_cot
    from app.core.empresa import perfil_publico
    from app.core.pdf_documento import pdf_documento
    _sin_comprimir(monkeypatch)
    cot = _cot(db, valida_hasta=datetime.date(2026, 10, 23))
    documento = documento_cot(db, cot)

    pdf = pdf_documento(documento, perfil_publico(db), None)

    assert pdf.startswith(b"%PDF-")
    assert cot.numero.encode() in pdf and b"$2.786.923" in pdf
    texto = _textos_pdf(pdf)
    for esperado in ("COTIZACIÓN", "Ana Pérez", "Taladro percutor", "$2.341.952", "IVA 19%", "$444.971",
                     "TOTAL $2.786.923", "Anticipo (60%)", "23 de octubre de 2026", ASESORA):
        assert esperado in texto, (esperado, texto)
    assert "Ajuste por redondeo" not in texto and "Descuento" not in texto


def test_el_pdf_copia_los_numeros_del_documento_sin_recalcular(db, monkeypatch):
    """C2: el PDF dibuja los números del documento tal cual, aunque no cuadren entre sí (nunca suma ni multiplica), y
    los textos del cliente son texto: un '<b>' o un '&' no se interpretan como marcado de reportlab."""
    from app.core.documento_cliente import armar_documento, linea_publica
    from app.core.empresa import perfil_publico
    from app.core.pdf_documento import pdf_documento
    _sin_comprimir(monkeypatch)
    linea = linea_publica({"product_name": "Tornillo <b>x</b> & tuerca", "qty": 3, "unit_price_cop": 10,
                           "total_cop": 555}, True, iva={"etiqueta": "IVA 5%", "pct": 5})
    documento = armar_documento(
        db, "COT", numero="COT-T9-SIN-CUENTAS", fecha_emision=datetime.datetime(2026, 10, 3, 15, 0),
        cliente_nombre="<b>Ana & Co</b>", lineas=[linea], con_precios=True, direccion_entrega="Calle 1 # 2-3",
        totales={"subtotal": 100, "descuento_pct": 5, "descuento": 7,
                 "impuestos": [{"etiqueta": "IVA 5%", "base": 93, "valor": 19}], "ajuste_redondeo": 3,
                 "total": 999999},
        pago={"modalidad": "Contado", "anticipo_pct": 100, "anticipo": 999999, "saldo": 0, "manual": False},
        notas=[{"titulo": "Notas", "texto": "Línea uno\n<script>alert(1)</script>"}])

    texto = _textos_pdf(pdf_documento(documento, perfil_publico(db), None))

    for esperado in ("$10", "$555", "Subtotal $100", "Descuento (5%) -$7", "IVA 5% $19", "Ajuste por redondeo $3",
                     "TOTAL $999.999", "Línea uno", "3 de octubre de 2026"):
        assert esperado in texto, (esperado, texto)
    # reportlab dibuja cada '<' y '>' escapado como un trozo aparte (el extractor los separa con un espacio): el texto
    # está, literal, y no se interpretó como marcado (no hay negrita ni etiqueta perdida).
    sin_espacios = texto.replace(" ", "")
    for literal in ("Tornillo<b>x</b>&tuerca", "<b>Ana&Co</b>", "<script>alert(1)</script>"):
        assert literal in sin_espacios, (literal, texto)
    for calculado in ("$30", "$115", "$119", "$93 "):
        assert calculado not in texto, calculado


def _inyeccion(campo: str) -> str:
    """Marcado que SÍ tendría efecto en reportlab si no se escapara (enlace javascript:, imagen local, fuente), con el
    nombre del campo adentro para saber de dónde viene cada texto."""
    return f"<a href='javascript:x'>{campo}</a><img src='file:///etc/passwd'/><font color='red'>r</font>&amp;"


def test_ningun_campo_de_texto_se_interpreta_como_marcado(monkeypatch):
    """r1 (S2): cada campo de texto del documento y del perfil sale literal. Ninguno crea un enlace (/URI, /Link), una
    acción JavaScript ni una imagen. El documento está armado a mano con todas las claves del contrato C2."""
    from app.core.pdf_documento import pdf_documento
    _sin_comprimir(monkeypatch)
    i = _inyeccion
    documento = {
        "tipo": "PVEN", "titulo": "Pedido de venta", "numero": i("numero"), "estado": "PENDIENTE_COMPRA",
        "fecha_emision": "2026-10-03T15:00:00Z", "fecha_entrega_estimada": "2026-10-21",
        "cliente": {"nombre": i("cliente.nombre"), "direccion_entrega": i("cliente.direccion_entrega")},
        "atendido_por": i("atendido_por"), "con_precios": True,
        "lineas": [{"n": 1, "descripcion": i("linea.descripcion"), "cantidad": 2, "precio_unitario": 10.0,
                    "total_linea": 20.0, "iva_etiqueta": i("linea.iva_etiqueta"), "iva_pct": 19.0, "anticipo": None}],
        "totales": {"subtotal": 20.0, "descuento_pct": None, "descuento": 0.0,
                    "impuestos": [{"etiqueta": i("impuesto.etiqueta"), "base": 20.0, "valor": 4.0}],
                    "ajuste_redondeo": None, "total": 24.0},
        "pago": {"modalidad": i("pago.modalidad"), "anticipo_pct": 60.0, "anticipo": 14.0, "saldo": 10.0,
                 "saldo_a_favor": None, "anticipo_por_pagar": 0.0, "pagado": 14.0,
                 "pagos": [{"concepto": i("pago.concepto"), "monto": 14.0, "metodo": i("pago.metodo"),
                            "fecha": "2026-10-03"}],
                 "instrucciones": i("pago.instrucciones"), "manual": False},
        "notas": [{"titulo": i("nota.titulo"), "texto": i("nota.texto")}],
        "valida_hasta": None, "terminos": i("terminos"), "mensaje_pie": i("mensaje_pie")}
    perfil = {campo: i(f"perfil.{campo}") for campo in ("nombre_comercial", "razon_social", "nit", "direccion",
                                                        "ciudad", "telefono", "whatsapp", "correo", "sitio_web")}
    perfil["colores"] = {"principal": "#7C3AED", "secundario": "#E11D48", "acento": "#C2410C"}

    pdf = pdf_documento(documento, perfil, None)

    for prohibido in (b"/URI", b"/Link", b"/JavaScript", b"/Subtype /Image", b"/Annots"):
        assert prohibido not in pdf, prohibido
    sin_espacios = _textos_pdf(pdf).replace(" ", "")
    campos = ["numero", "cliente.nombre", "cliente.direccion_entrega", "atendido_por", "linea.descripcion",
              "linea.iva_etiqueta", "impuesto.etiqueta", "pago.modalidad", "pago.concepto", "pago.metodo",
              "pago.instrucciones", "nota.titulo", "nota.texto", "terminos", "mensaje_pie"]
    campos += [f"perfil.{c}" for c in perfil if c != "colores"]
    for campo in campos:
        assert i(campo).replace(" ", "") in sin_espacios, campo


def test_un_logo_corrupto_no_rompe_el_pdf(db, monkeypatch):
    """Un logo que no se puede leer (bytes basura, PNG truncado, dimensiones absurdas) no rompe nada: el PDF sale sin
    logo. Un logo válido sí se dibuja (una imagen /XObject en el PDF)."""
    from app.core.documento_cliente import documento_cot
    from app.core.empresa import perfil_publico
    from app.core.pdf_documento import pdf_documento
    _silenciar(monkeypatch, "app.core.pdf_documento")
    cot = _cot(db)
    documento, perfil = documento_cot(db, cot), perfil_publico(db)
    valido = _png(40, 20)
    casos = {"basura": ("image/png", b"\x89PNG\r\n\x1a\n" + b"no es una imagen" * 8, "v1"),
             "truncado": ("image/png", valido[:60], "v2"),
             "gigante": ("image/png", _png(5000, 1), "v3"),
             "jpeg falso": ("image/jpeg", b"\xff\xd8\xff" + b"\x00" * 40, "v4"),
             # r1 (S2): una cabecera que dice 50000x50000 con datos mínimos (bomba de descompresión).
             "bomba": ("image/png", _png_cabecera(50000, 50000), "v6"),
             # r1 (S1): un formato que el producto no admite (GIF, BMP) no se abre aunque Pillow lo sepa leer.
             "gif": ("image/png", _imagen_pil("GIF", 40, 20), "v7"),
             "bmp": ("image/png", _imagen_pil("BMP", 40, 20), "v8"),
             "sin logo": None}
    for caso, logo in casos.items():
        pdf = pdf_documento(documento, perfil, logo)
        assert pdf.startswith(b"%PDF-"), caso
        assert b"/Subtype /Image" not in pdf, caso

    con_logo = pdf_documento(documento, perfil, ("image/png", valido, "v5"))
    assert con_logo.startswith(b"%PDF-") and b"/Subtype /Image" in con_logo
    # Un logo de leer_logo sin versión (dos elementos) también sirve; JPEG y WebP también.
    assert b"/Subtype /Image" in pdf_documento(documento, perfil, ("image/png", valido))
    for formato, mime in (("JPEG", "image/jpeg"), ("WEBP", "image/webp")):
        assert b"/Subtype /Image" in pdf_documento(documento, perfil, (mime, _imagen_pil(formato, 40, 20), "v9")), \
            formato


def test_un_logo_grande_se_reduce_antes_de_incrustarlo(db, monkeypatch):
    """r1 (S4): un logo grande y válido (aquí un WebP con ruido de 2000x2000) se reduce a LOGO_LADO_PDF_PX en su lado
    mayor, con la misma proporción, antes de incrustarlo: el PDF pesa menos que el logo original."""
    from app.core.documento_cliente import documento_cot
    from app.core.empresa import perfil_publico
    from app.core.pdf_documento import LOGO_LADO_PDF_PX, pdf_documento
    cot = _cot(db)
    documento, perfil = documento_cot(db, cot), perfil_publico(db)
    for formato, mime, ancho, alto in (("WEBP", "image/webp", 2000, 2000), ("PNG", "image/png", 1800, 600)):
        logo = _imagen_pil(formato, ancho, alto, ruido=True)
        pdf = pdf_documento(documento, perfil, (mime, logo, "v1"))
        assert b"/Subtype /Image" in pdf, formato
        assert len(pdf) < len(logo), (formato, len(pdf), len(logo))
        imagenes = _imagenes_pdf(pdf)  # la imagen y, si tiene transparencia, su máscara
        assert imagenes, formato  # r2: un PDF sin imágenes no pasa la prueba en vacío
        for ancho_pdf, alto_pdf, _ in imagenes:
            assert max(ancho_pdf, alto_pdf) == LOGO_LADO_PDF_PX, (formato, ancho_pdf, alto_pdf)
            assert abs(ancho_pdf / alto_pdf - ancho / alto) < 0.02, (formato, ancho_pdf, alto_pdf)


def test_un_logo_png_sigue_sin_perdida_y_uno_jpeg_o_webp_pasa_a_jpeg(db, monkeypatch):
    """r2 (re-revisión 1): la salida del logo reducido depende del origen. Un PNG sigue PNG sin pérdida (en el PDF,
    FlateDecode y no DCTDecode): un logo plano no se llena de artefactos de JPEG. Un JPEG o un WebP sin alfa pasan a JPEG
    (DCTDecode). Un PNG con transparencia lleva su máscara, también sin pérdida."""
    from PIL import Image as PilImage
    from app.core.documento_cliente import documento_cot
    from app.core.empresa import perfil_publico
    from app.core.pdf_documento import pdf_documento
    cot = _cot(db)
    documento, perfil = documento_cot(db, cot), perfil_publico(db)

    [(ancho, alto, filtro)] = _imagenes_pdf(pdf_documento(documento, perfil,
                                                          ("image/png", _imagen_pil("PNG", 1200, 400), "v1")))
    assert (ancho, alto) == (600, 200) and b"/FlateDecode" in filtro and b"/DCTDecode" not in filtro, filtro

    for formato, mime in (("JPEG", "image/jpeg"), ("WEBP", "image/webp")):
        [(ancho, alto, filtro)] = _imagenes_pdf(pdf_documento(documento, perfil,
                                                              (mime, _imagen_pil(formato, 1200, 400), "v2")))
        assert (ancho, alto) == (600, 200) and b"/DCTDecode" in filtro, (formato, filtro)

    salida = io.BytesIO()
    PilImage.new("RGBA", (1200, 400), (194, 65, 12, 128)).save(salida, "PNG")
    imagenes = _imagenes_pdf(pdf_documento(documento, perfil, ("image/png", salida.getvalue(), "v3")))
    assert len(imagenes) == 2 and all((a, h) == (600, 200) for a, h, _ in imagenes), imagenes  # imagen y máscara
    assert all(b"/DCTDecode" not in f for _, _, f in imagenes), imagenes


def test_si_el_dibujo_con_el_logo_falla_el_pdf_sale_sin_logo(app_client, db, admin_token, monkeypatch):
    """r2 (ruling sobre la duda 2): si reportlab falla dibujando el documento CON el logo, lo vuelve a dibujar sin logo:
    el correo lleva un PDF sin imagen, no sale «(sin PDF adjunto)». Directo y por el envío de la COT con el logo guardado
    en la empresa."""
    import base64
    import reportlab.platypus
    from app.core.documento_cliente import documento_cot
    from app.core.empresa import guardar_logo, perfil_publico
    from app.core.pdf_documento import pdf_documento
    _silenciar(monkeypatch, "app.core.pdf_documento")
    real = reportlab.platypus.Image

    class ImagenQueFalla(real):
        def draw(self):
            raise RuntimeError("reportlab no pudo dibujar la imagen")

    monkeypatch.setattr(reportlab.platypus, "Image", ImagenQueFalla)
    logo = _png(40, 20)
    cot = _cot(db)
    pdf = pdf_documento(documento_cot(db, cot), perfil_publico(db), ("image/png", logo, "v1"))
    assert pdf.startswith(b"%PDF-") and b"/Subtype /Image" not in pdf

    llamadas = _correo_falso(monkeypatch)
    guardar_logo(db, "data:image/png;base64," + base64.b64encode(logo).decode("ascii"), "admin@test")
    otra = _cot(db)
    resp = _enviar_cot(app_client, admin_token, otra)
    assert resp.status_code == 200, resp.text
    assert resp.json()["correo"]["mensaje"] == f"Correo enviado a {CORREO}."  # sin «(sin PDF adjunto)»
    assert b"/Subtype /Image" not in _unico_adjunto(llamadas[-1], otra.numero)


def test_requirements_fija_reportlab_y_pillow_con_lo_instalado():
    """r2 (ruling sobre la duda 1): pdf_documento importa reportlab y Pillow directamente, así que las dos van fijadas en
    backend/requirements.txt, con la versión que tiene el venv."""
    from importlib.metadata import version
    from pathlib import Path
    lineas = [l.strip() for l in (Path(__file__).resolve().parent.parent / "requirements.txt")
              .read_text(encoding="utf-8").splitlines()]
    for paquete in ("reportlab", "pillow"):
        assert f"{paquete}=={version(paquete)}" in lineas, (paquete, version(paquete), lineas)
    assert "reportlab==4.4.10" in lineas and "pillow==13.0.0" in lineas


def test_un_documento_largo_ocupa_varias_paginas_sin_romper(db, monkeypatch):
    """Notas y términos largos (con saltos de línea) se reparten en varias páginas: nunca un error de maquetación."""
    from app.core.documento_cliente import armar_documento, linea_publica
    from app.core.empresa import perfil_publico
    from app.core.pdf_documento import pdf_documento
    _sin_comprimir(monkeypatch)
    lineas = [linea_publica({"product_name": f"Producto {i} " + "con un nombre bastante largo " * 6, "qty": i,
                             "unit_price_cop": 1000 * i, "total_cop": 1000 * i * i}, True) for i in range(1, 41)]
    documento = armar_documento(
        db, "PVEN", numero="PVEN-T9-LARGO", fecha_emision=datetime.datetime(2026, 10, 3, 15, 0),
        cliente_nombre="Ana Pérez", lineas=lineas, con_precios=True, totales={"subtotal": 1, "total": 1},
        notas=[{"titulo": "Notas", "texto": "\n".join(f"Renglón {i} de la nota" for i in range(400))}])

    pdf = pdf_documento(documento, perfil_publico(db), None)

    assert pdf.startswith(b"%PDF-")
    paginas = len(re.findall(rb"/Type /Page(?!s)", pdf))
    assert paginas >= 3, paginas
    texto = _textos_pdf(pdf)
    assert "Producto 40" in texto and "Renglón 399 de la nota" in texto and "PEDIDO DE VENTA" in texto
    # r1 (Q4): el pie numera cada hoja y la cabecera de la tabla se repite en cada hoja que tiene líneas.
    hojas = _paginas(texto)
    assert len(hojas) == paginas and f"· Página {paginas}" in texto
    con_lineas = [h for h in hojas if re.search(r"Producto \d+ con un nombre", h)]
    assert len(con_lineas) >= 2 and all("CANT. DESCRIPCIÓN PRECIO UNIT. TOTAL" in h for h in con_lineas), con_lineas


def test_una_celda_altisima_se_parte_entre_hojas_sin_romper(db, monkeypatch):
    """r1 (S3, Q2): una descripción o una dirección de entrega de 400 renglones (más alta que una hoja) no tumba el PDF
    con LayoutError: la fila se parte entre hojas (splitInRow) y el texto sale completo. Un emoji o un carácter CJK
    tampoco rompen nada (Helvetica los cambia por su glifo de reemplazo)."""
    from app.core.documento_cliente import armar_documento, linea_publica
    from app.core.empresa import perfil_publico
    from app.core.pdf_documento import pdf_documento
    _sin_comprimir(monkeypatch)
    altisimo = "\n".join(f"Renglón {i} del texto" for i in range(400))
    for caso in ("descripcion", "direccion"):
        lineas = [linea_publica({"product_name": "Taladro 🔨 中文", "qty": 1, "unit_price_cop": 10, "total_cop": 10},
                                True),
                  linea_publica({"product_name": altisimo if caso == "descripcion" else "Mesa", "qty": 1,
                                 "unit_price_cop": 20, "total_cop": 20}, True)]
        documento = armar_documento(
            db, "COT", numero=f"COT-T9-ALTA-{caso}", fecha_emision=datetime.datetime(2026, 10, 3, 15, 0),
            cliente_nombre="Ana Pérez", lineas=lineas, con_precios=True,
            direccion_entrega=altisimo if caso == "direccion" else "Calle 1", totales={"subtotal": 30, "total": 30})

        pdf = pdf_documento(documento, perfil_publico(db), None)

        assert pdf.startswith(b"%PDF-"), caso
        texto = _textos_pdf(pdf)
        assert len(_paginas(texto)) >= 3, caso
        assert "Taladro" in texto and "Renglón 0 del texto" in texto and "Renglón 399 del texto" in texto, caso
        assert "TOTAL $30" in texto, caso


def test_el_bloque_de_totales_no_se_parte_entre_hojas(db, monkeypatch):
    """r1 (Q3): con cualquier cantidad de líneas, el bloque de totales (Subtotal … TOTAL … Saldo) queda entero en una
    sola hoja: nunca el TOTAL o el saldo solos en la siguiente."""
    from app.core.documento_cliente import armar_documento, linea_publica
    from app.core.empresa import perfil_publico
    from app.core.pdf_documento import pdf_documento
    _sin_comprimir(monkeypatch)
    perfil = perfil_publico(db)
    for n in range(10, 40):
        lineas = [linea_publica({"product_name": f"Producto {i}", "qty": 1, "unit_price_cop": 1000, "total_cop": 1000},
                                True) for i in range(n)]
        documento = armar_documento(
            db, "COT", numero=f"COT-T9-TOT-{n}", fecha_emision=datetime.datetime(2026, 10, 3, 15, 0),
            cliente_nombre="Ana Pérez", lineas=lineas, con_precios=True,
            totales={"subtotal": 1000 * n, "descuento_pct": 10, "descuento": 100 * n,
                     "impuestos": [{"etiqueta": "IVA 19%", "base": 900 * n, "valor": 171 * n}], "total": 1071 * n},
            pago={"modalidad": "60/40", "anticipo_pct": 60, "anticipo": 600 * n, "saldo": 471 * n, "manual": False})

        hojas = _paginas(_textos_pdf(pdf_documento(documento, perfil, None)))

        [hoja] = [h for h in hojas if "Subtotal" in h]
        assert f"TOTAL ${1071 * n:,}".replace(",", ".") in hoja and "Saldo $" in hoja, (n, hoja[-300:])


def test_sin_reportlab_pdf_documento_lanza_import_error(db, monkeypatch):
    """reportlab se importa DENTRO de la función (R2): el módulo carga sin él y la falta se ve al generar."""
    import importlib.util
    import app.core
    import app.core.pdf_documento as original
    from app.core.documento_cliente import documento_cot
    from app.core.empresa import perfil_publico
    cot = _cot(db)
    documento, perfil = documento_cot(db, cot), perfil_publico(db)
    _sin_reportlab(monkeypatch)
    # r1 (Q7): una copia del módulo cargada desde su archivo con OTRO nombre, sin reportlab. No toca
    # sys.modules['app.core.pdf_documento'] ni el atributo app.core.pdf_documento: las pruebas siguientes y el endpoint
    # siguen viendo el mismo módulo.
    spec = importlib.util.spec_from_file_location("pdf_documento_sin_reportlab", original.__file__)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    try:
        modulo.pdf_documento(documento, perfil, None)
    except ImportError:
        pass
    else:
        raise AssertionError("sin reportlab, pdf_documento debe lanzar ImportError")
    assert sys.modules["app.core.pdf_documento"] is original and app.core.pdf_documento is original
    assert "pdf_documento_sin_reportlab" not in sys.modules


# ─── 5: send_email con adjuntos ──────────────────────────────────────────────────────────────────────────────

def test_send_email_con_adjuntos_lleva_la_parte_pdf(monkeypatch):
    """Con adjuntos: multipart/mixed con la parte alternative (el html) y una parte application/pdf con su nombre
    (attachment). Sin adjuntos, el mensaje de siempre (multipart/alternative con solo el html). Nunca SMTP real."""
    import smtplib
    from app.core import email as correo
    capturas = []

    class SMTPFalso:
        def __init__(self, host, port, timeout=None):
            capturas.append({"host": host})

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def starttls(self):
            pass

        def login(self, usuario, clave):
            pass

        def sendmail(self, remitente, destinos, mensaje):
            capturas[-1].update({"destinos": destinos, "mensaje": mensaje})

    monkeypatch.setattr(smtplib, "SMTP", SMTPFalso)
    monkeypatch.setenv("SMTP_HOST", "smtp.invalid")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USER", "usuario-de-prueba")
    monkeypatch.setenv("SMTP_PASSWORD", "clave-de-prueba")
    monkeypatch.setenv("SMTP_FROM", "ventas@example.com")
    contenido = b"%PDF-1.4\n% prueba T9\n"

    assert correo.send_email("cliente@example.com", "Tu cotización", "<p>Hola</p>", remitente_nombre="DEMO",
                             adjuntos=[("COT-T9X.pdf", contenido, PDF)])
    msg = email.message_from_string(capturas[-1]["mensaje"])
    assert msg.get_content_type() == "multipart/mixed"
    assert str(make_header(decode_header(msg["Subject"]))) == "Tu cotización"
    alternativa, adjunto = msg.get_payload()
    assert alternativa.get_content_type() == "multipart/alternative"
    assert [p.get_content_type() for p in alternativa.get_payload()] == ["text/html"]
    assert "<p>Hola</p>" in alternativa.get_payload()[0].get_payload(decode=True).decode()
    assert adjunto.get_content_type() == PDF
    assert adjunto.get_content_disposition() == "attachment" and adjunto.get_filename() == "COT-T9X.pdf"
    assert adjunto.get_payload(decode=True) == contenido
    assert capturas[-1]["destinos"] == ["cliente@example.com"]

    # Sin adjuntos (None, lista vacía o sin el argumento): r1 (Q5) el mensaje es IDÉNTICO, byte a byte, al que armaba
    # send_email antes de T9 (mismo código de entonces, con el mismo boundary): encabezados, orden, Subject y partes.
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.utils import formataddr
    for kwargs in ({"adjuntos": None}, {"adjuntos": []}, {}, {"remitente_nombre": "DEMO Ferretería"}):
        assert correo.send_email("cliente@example.com", "Tu cotización", "<p>Hola</p>", **kwargs)
        enviado = capturas[-1]["mensaje"]
        msg = email.message_from_string(enviado)
        antes = MIMEMultipart("alternative", boundary=msg.get_boundary())  # send_email antes de T9 (860ea1e)
        antes["Subject"] = "Tu cotización"
        antes["From"] = (formataddr(("DEMO Ferretería", "ventas@example.com")) if kwargs.get("remitente_nombre")
                         else "ventas@example.com")
        antes["To"] = "cliente@example.com"
        antes.attach(MIMEText("<p>Hola</p>", "html"))
        assert enviado == antes.as_string(), kwargs
        assert [k for k, _ in msg.items()] == ["Content-Type", "MIME-Version", "Subject", "From", "To"], kwargs

    # Un nombre de archivo con salto de línea no inyecta encabezados ni rutas.
    assert correo.send_email("cliente@example.com", "Asunto", "<p>Hola</p>",
                             adjuntos=[("../COT\r\nBcc: x@y.z.pdf", contenido, PDF)])
    msg = email.message_from_string(capturas[-1]["mensaje"])
    assert msg["Bcc"] is None
    nombre = msg.get_payload()[1].get_filename()
    assert "\r" not in nombre and "\n" not in nombre and "/" not in nombre and nombre.endswith(".pdf")

    # Un adjunto mal formado no lanza (send_email nunca lanza): se loguea y devuelve False, sin abrir SMTP.
    monkeypatch.setattr(logging.getLogger("app.core.email"), "disabled", True)
    antes = len(capturas)
    assert correo.send_email("cliente@example.com", "Asunto", "<p>Hola</p>",
                             adjuntos=[("COT.pdf", "no son bytes", PDF)]) is False
    assert len(capturas) == antes


# ─── 6-9: el correo de la COT y del PVEN llevan el PDF ─────────────────────────────────────────────────────────

def test_enviar_la_cotizacion_adjunta_el_pdf_en_el_correo_principal_y_en_el_de_respaldo(app_client, db, admin_token,
                                                                                       monkeypatch):
    """Email (principal) y Otro (respaldo): el correo lleva COT-….pdf con los números del documento; el reenvío también.
    La respuesta del envío es la de siempre (mismas claves y el mismo mensaje del correo)."""
    llamadas = _correo_falso(monkeypatch)
    _sin_comprimir(monkeypatch)
    for canal in ("Email", "Otro"):
        cot = _cot(db)
        resp = _enviar_cot(app_client, admin_token, cot, {"canal": canal})
        assert resp.status_code == 200, resp.text
        j = resp.json()
        assert set(j) == CLAVES_RESPUESTA_COT
        assert j["correo"] == {"enviado": True, "destino": CORREO, "motivo": None,
                               "mensaje": f"Correo enviado a {CORREO}."}
        assert llamadas[-1]["to"] == CORREO
        pdf = _unico_adjunto(llamadas[-1], cot.numero)
        assert cot.numero.encode() in pdf and b"$2.786.923" in pdf
        assert SIN_PDF not in _fila_correo(_renglon(db, "COT", cot.id, "ESTADO_CHANGED"))["despues"]

    # Reenvío de la COT pendiente (reenvio=true): sale otro PDF en el correo nuevo.
    resp = _enviar_cot(app_client, admin_token, cot, {"canal": "Email", "reenvio": True})
    assert resp.status_code == 200, resp.text
    assert _unico_adjunto(llamadas[-1], cot.numero).startswith(b"%PDF-")


def test_el_pdf_no_lleva_datos_internos_ni_el_enlace(app_client, db, admin_token, monkeypatch):
    """Lista blanca: ni costos, margen ni proveedor de las líneas, ni las notas internas de la SC o del pedido, ni el
    correo o el teléfono del cliente, ni el enlace o su token, ni la referencia bancaria del pago."""
    llamadas = _correo_falso(monkeypatch)
    _sin_comprimir(monkeypatch)
    cot = _cot(db)
    resp = _enviar_cot(app_client, admin_token, cot)
    assert resp.status_code == 200, resp.text
    so = _pedido(db)
    resp_pven = _enviar_pven(app_client, admin_token, so)
    assert resp_pven.status_code == 200, resp_pven.text

    casos = ((_unico_adjunto(llamadas[-2], cot.numero), resp.json()["link_confirmacion"]),
             (_unico_adjunto(llamadas[-1], so.numero), resp_pven.json()["link"]))
    for pdf, link in casos:
        texto = _textos_pdf(pdf)
        for interno in (PROVEEDOR, NOTA_INTERNA_SC, NOTA_DEL_PEDIDO, "4321", "4.321", "margen", "cost", CORREO,
                        TELEFONO, "BANCOL-T9-REF", "confirmar/", "pedido/"):
            assert interno not in texto, interno
        assert _raw(link).encode() not in pdf and link.encode() not in pdf


def test_enviar_el_pedido_al_cliente_adjunta_el_pdf(app_client, db, admin_token, monkeypatch):
    """El correo de consulta del pedido lleva PVEN-….pdf: lo pagado, el pago registrado y lo que falta, de la misma
    cuenta que la página (resumen_anticipo_del_pedido). La respuesta es la de siempre."""
    llamadas = _correo_falso(monkeypatch)
    _sin_comprimir(monkeypatch)
    so = _pedido(db, pagado=600000)

    resp = _enviar_pven(app_client, admin_token, so)

    assert resp.status_code == 200, resp.text
    j = resp.json()
    assert set(j) == CLAVES_RESPUESTA_PVEN
    assert j["correo"]["mensaje"] == f"Correo enviado a {CORREO}."
    texto = _textos_pdf(_unico_adjunto(llamadas[-1], so.numero))
    for esperado in ("PEDIDO DE VENTA", so.numero, "Sofá", "$400.000", "$800.000", "Mesa", "TOTAL $1.000.000",
                     "Anticipo (60%) $600.000", "Pagado $600.000", "Saldo por pagar $400.000", "Anticipo",
                     "Transferencia bancaria", "3 de octubre de 2026"):
        assert esperado in texto, (esperado, texto)
    assert "Anticipo pendiente" not in texto


def test_el_pdf_del_pedido_con_lineas_canceladas_no_las_disfraza_de_ajuste(app_client, db, admin_token, monkeypatch):
    """Nota del controlador después de T4: en un pedido sin tarifas la línea cancelada sigue en el JSON; el PDF muestra
    los totales de la cabecera, la nota que nombra lo cancelado y NUNCA una fila 'Ajuste por redondeo'."""
    from app.core.documento_cliente import documento_pven
    from app.core.empresa import perfil_publico
    from app.core.pdf_documento import pdf_documento
    from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation
    from app.models.fase1b import SaleOrderLineErp
    _sin_comprimir(monkeypatch)
    s = _sufijo()
    sc = CustomerRequest(numero=f"SC-T9L{s}", customer_name="Ana Pérez", modalidad_pago="Credito 30 dias",
                         estado="CONFIRMADA")
    db.add(sc); db.commit(); db.refresh(sc)
    cot = SalesQuotation(numero=f"COT-T9L{s}", sc_id=sc.id, sc_numero=sc.numero, customer_name="Ana Pérez",
                         estado="CONFIRMADA", gate2_confirmed_at=datetime.datetime.utcnow(), anticipo_cop=0,
                         productos=[{"product_name": "Silla", "qty": 2, "unit_price_cop": 1000, "total_cop": 2000},
                                    {"product_name": "Lámpara", "qty": 1, "unit_price_cop": 3000, "total_cop": 3000}],
                         subtotal_cop=5000, total_cop=5000, descuento_pct=0)
    db.add(cot); db.commit(); db.refresh(cot)
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    so = db.query(SaleOrder).filter(SaleOrder.cot_id == cot.id).one()
    linea = (db.query(SaleOrderLineErp)
             .filter(SaleOrderLineErp.so_id == so.id, SaleOrderLineErp.description == "Lámpara").one())
    resp = app_client.post(f"/api/v1/ventas/pedidos/{so.id}/lineas/{linea.id}/cancelar",
                           json={"motivo": "El cliente ya no la necesita"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(so)
    documento = documento_pven(db, so)
    assert documento["totales"]["total"] == 2000 and documento["totales"]["ajuste_redondeo"] == 0

    texto = _textos_pdf(pdf_documento(documento, perfil_publico(db), None))

    assert "TOTAL $2.000" in texto and "Lámpara" in texto
    assert "Se cancelaron productos; los totales ya lo reflejan." in texto and "1 unidad de Lámpara" in texto
    assert "Ajuste por redondeo" not in texto


# ─── 10-12: si el PDF falla, el correo sale igual ──────────────────────────────────────────────────────────────

def test_si_el_pdf_falla_el_correo_sale_sin_adjunto_y_lo_dice(app_client, db, admin_token, monkeypatch):
    """pdf_documento forzado a fallar: 200 con la respuesta de siempre, el correo sale sin adjunto y su mensaje (el de
    la respuesta y el de la Actividad) dice «(sin PDF adjunto)». COT y PVEN."""
    import app.core.pdf_documento as modulo
    llamadas = _correo_falso(monkeypatch)
    _silenciar(monkeypatch, "app.api.v1.erp_ventas")

    def falla(*a, **k):
        raise RuntimeError("reportlab se cayó")

    monkeypatch.setattr(modulo, "pdf_documento", falla)
    esperado = f"Correo enviado a {CORREO} {SIN_PDF}."

    cot = _cot(db)
    resp = _enviar_cot(app_client, admin_token, cot)
    assert resp.status_code == 200, resp.text
    assert set(resp.json()) == CLAVES_RESPUESTA_COT
    assert resp.json()["correo"] == {"enviado": True, "destino": CORREO, "motivo": None, "mensaje": esperado}
    assert llamadas[-1]["to"] == CORREO and not llamadas[-1].get("adjuntos")
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"
    assert _fila_correo(_renglon(db, "COT", cot.id, "ESTADO_CHANGED"))["despues"] == esperado

    so = _pedido(db)
    resp = _enviar_pven(app_client, admin_token, so)
    assert resp.status_code == 200, resp.text
    assert set(resp.json()) == CLAVES_RESPUESTA_PVEN
    assert resp.json()["correo"]["mensaje"] == esperado
    assert llamadas[-1]["to"] == CORREO and not llamadas[-1].get("adjuntos")
    assert _fila_correo(_renglon(db, "VEN", so.id, "ENVIADO_AL_CLIENTE"))["despues"] == esperado


def test_sin_reportlab_el_correo_sale_sin_adjunto(app_client, db, admin_token, monkeypatch):
    """Sin reportlab instalado (PARADA del brief): el envío responde 200 y el correo sale sin adjunto, con el aviso."""
    llamadas = _correo_falso(monkeypatch)
    _silenciar(monkeypatch, "app.api.v1.erp_ventas")
    _sin_reportlab(monkeypatch)
    cot = _cot(db)

    resp = _enviar_cot(app_client, admin_token, cot)

    assert resp.status_code == 200, resp.text
    assert resp.json()["correo"]["mensaje"] == f"Correo enviado a {CORREO} {SIN_PDF}."
    assert not llamadas[-1].get("adjuntos")


def test_un_error_de_la_base_al_leer_el_documento_no_tumba_el_envio(app_client, db, admin_token, monkeypatch):
    """Las lecturas del PDF van después del commit del envío: si una falla en la base (transacción abortada), se
    revierte solo esa lectura y el envío sigue: el renglón de la Actividad y el enlace quedan guardados."""
    from sqlalchemy import text
    import app.core.documento_cliente as documento_cliente
    llamadas = _correo_falso(monkeypatch)
    _silenciar(monkeypatch, "app.api.v1.erp_ventas")

    def lectura_que_falla(db_, *a, **k):
        db_.execute(text("SELECT 1/0"))  # división por cero: PostgreSQL aborta la transacción

    monkeypatch.setattr(documento_cliente, "documento_cot", lectura_que_falla)
    cot = _cot(db)

    resp = _enviar_cot(app_client, admin_token, cot)

    assert resp.status_code == 200, resp.text
    assert resp.json()["correo"]["mensaje"] == f"Correo enviado a {CORREO} {SIN_PDF}."
    assert not llamadas[-1].get("adjuntos")
    renglon = _renglon(db, "COT", cot.id, "ESTADO_CHANGED")
    assert renglon is not None and renglon.new_estado == "PENDIENTE_CONFIRMACION"


# ─── 13-15: la SC no lleva PDF; sin correo no se genera; RP16 ──────────────────────────────────────────────────

def _espia_pdf(monkeypatch, al_llamar=None):
    """Envuelve pdf_documento para contar las llamadas (y medir algo en cada una), sin cambiar lo que hace."""
    import app.core.pdf_documento as modulo
    real, llamadas = modulo.pdf_documento, []

    def espia(*a, **k):
        llamadas.append(al_llamar() if al_llamar is not None else True)
        return real(*a, **k)

    monkeypatch.setattr(modulo, "pdf_documento", espia)
    return llamadas


def test_la_solicitud_no_lleva_pdf(app_client, db, admin_token, user_admin, monkeypatch):
    """R2: la SC no tiene precios y su correo no lleva PDF (ni el aviso)."""
    from app.models.erp_documents import CustomerRequest
    llamadas = _correo_falso(monkeypatch)
    generados = _espia_pdf(monkeypatch)
    sc = CustomerRequest(numero=f"SC-T9S{_sufijo()}", estado="ASIGNADA", customer_name="Ana Pérez",
                         customer_email=CORREO, advisor_user_id=user_admin.id, advisor_name=ASESORA,
                         productos=[{"product_name": "Taladro percutor", "qty": 1}])
    db.add(sc); db.commit(); db.refresh(sc)

    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"canal": "Email"},
                           headers=auth(admin_token))

    assert resp.status_code == 200, resp.text
    assert resp.json()["correo"]["mensaje"] == f"Correo enviado a {CORREO}."
    assert llamadas[-1]["to"] == CORREO and not llamadas[-1].get("adjuntos")
    assert generados == []


def test_sin_correo_que_mandar_no_se_genera_el_pdf(app_client, db, admin_token, monkeypatch):
    """Si el correo no va a salir (SMTP sin configurar o cliente sin correo), el PDF no se genera ni se avisa nada."""
    _correo_falso(monkeypatch, configurado=False)
    generados = _espia_pdf(monkeypatch)
    cot = _cot(db)
    resp = _enviar_cot(app_client, admin_token, cot)
    assert resp.status_code == 200, resp.text
    assert resp.json()["correo"]["motivo"] == "CORREO_NO_CONFIGURADO" and SIN_PDF not in resp.json()["correo"]["mensaje"]

    _correo_falso(monkeypatch, configurado=True)
    so = _pedido(db, customer_email=None)
    resp = _enviar_pven(app_client, admin_token, so, {"canal": "Otro"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["correo"]["motivo"] == "SIN_CORREO_CLIENTE"
    assert generados == []


def test_rp16_el_pdf_se_genera_despues_del_unico_commit_y_no_agrega_commits(app_client, db, admin_token, monkeypatch,
                                                                            contador_sql):
    """RP16: el PDF se dibuja después del único commit del envío (no alarga la transacción con la COT, la SC o el
    pedido bloqueados), el correo sale con 1 commit hecho y el total de commits es el de antes de T9 (3: el del envío,
    el savepoint del lead o del resultado y el del renglón). Ninguna lectura del PDF bloquea filas."""
    from sqlalchemy import event
    from sqlalchemy.orm import Session
    commits_al_generar, al_enviar, sentencias_al_confirmar = [], [], []
    llamadas = _correo_falso(monkeypatch, al_enviar=lambda: al_enviar.append(
        (contador_sql.commits, len(contador_sql.sentencias))))
    _espia_pdf(monkeypatch, al_llamar=lambda: commits_al_generar.append(contador_sql.commits))
    cot = _cot(db)
    so = _pedido(db)

    def al_confirmar(session):
        sentencias_al_confirmar.append(len(contador_sql.sentencias))

    event.listen(Session, "after_commit", al_confirmar)
    try:
        for enviar, doc in ((_enviar_cot, cot), (_enviar_pven, so)):
            commits_al_generar.clear()
            al_enviar.clear()
            sentencias_al_confirmar.clear()
            contador_sql.reset()
            resp = enviar(app_client, admin_token, doc)
            assert resp.status_code == 200, resp.text
            assert commits_al_generar == [1], commits_al_generar
            [(commits, hasta_el_correo)] = al_enviar
            assert commits == 1, commits
            assert contador_sql.commits == 3, contador_sql.commits
            assert _unico_adjunto(llamadas[-1], doc.numero)
            # Entre el commit del envío y el correo solo hay lecturas del PDF: ninguna con FOR UPDATE.
            despues_del_commit = contador_sql.sentencias[sentencias_al_confirmar[0]:hasta_el_correo]
            assert despues_del_commit and not [s for s in despues_del_commit if "FOR UPDATE" in s.upper()], \
                despues_del_commit
            assert all(s.lstrip().upper().startswith("SELECT") for s in despues_del_commit), despues_del_commit
    finally:
        event.remove(Session, "after_commit", al_confirmar)


# ─── Ronda r1 ────────────────────────────────────────────────────────────────────────────────────────────────

def test_si_el_modulo_del_pdf_no_se_puede_importar_el_envio_sigue(app_client, db, admin_token, monkeypatch):
    """r1 (C2, Q6): un fallo al importar el módulo del PDF (después del commit único) cae en la rama «sin PDF»: 200, el
    correo sale sin adjunto con el aviso y el renglón de la Actividad queda guardado. Nunca un 500 con el envío a medias.
    COT y PVEN."""
    import app.core
    import app.core.pdf_documento  # noqa: F401  (el atributo existe y se quita abajo)
    llamadas = _correo_falso(monkeypatch)
    _silenciar(monkeypatch, "app.api.v1.erp_ventas")
    monkeypatch.delattr(app.core, "pdf_documento")
    monkeypatch.setitem(sys.modules, "app.core.pdf_documento", None)  # import -> ModuleNotFoundError
    esperado = f"Correo enviado a {CORREO} {SIN_PDF}."

    cot = _cot(db)
    resp = _enviar_cot(app_client, admin_token, cot)
    assert resp.status_code == 200, resp.text
    assert resp.json()["correo"]["mensaje"] == esperado and not llamadas[-1].get("adjuntos")
    assert _fila_correo(_renglon(db, "COT", cot.id, "ESTADO_CHANGED"))["despues"] == esperado

    so = _pedido(db)
    resp = _enviar_pven(app_client, admin_token, so)
    assert resp.status_code == 200, resp.text
    assert resp.json()["correo"]["mensaje"] == esperado and not llamadas[-1].get("adjuntos")
    assert _fila_correo(_renglon(db, "VEN", so.id, "ENVIADO_AL_CLIENTE"))["despues"] == esperado


TELEFONO_WA = "3001234567"  # el del contacto del Chatwoot falso (+57 300 123 4567)


class _ChatwootFalso:
    """Reemplaza app.core.chatwoot._peticion, como FakeChatwoot de T8: responde por (método, ruta) y anota las llamadas.
    Nunca sale a la red."""

    def __init__(self, respuestas):
        self.respuestas = respuestas
        self.llamadas = []

    def __call__(self, metodo, ruta, cuerpo=None, params=None, timeout=6):
        self.llamadas.append((metodo, ruta))
        if (metodo, ruta) not in self.respuestas:
            raise AssertionError(f"llamada inesperada a Chatwoot: {metodo} {ruta}")
        return dict(self.respuestas[(metodo, ruta)])


def _whatsapp_falso(monkeypatch, db):
    """Chatwoot ficticio (R18: valores de relleno con monkeypatch.setenv) con el contacto 7 y su conversación 55
    abierta en la bandeja 3, y el envío automático encendido (admin_config, dentro de la transacción revertida)."""
    from app.core.admin_config import guardar_config
    monkeypatch.setenv("CHATWOOT_BASE_URL", "https://chatwoot.invalid")
    monkeypatch.setenv("CHATWOOT_API_TOKEN", "token-de-prueba")
    monkeypatch.setenv("CHATWOOT_ACCOUNT_ID", "1")
    contacto = {"id": 7, "name": "Ana Pérez", "phone_number": "+573001234567",
                "contact_inboxes": [{"source_id": "573001234567", "inbox": {"id": 3}}]}
    falso = _ChatwootFalso({
        ("GET", "contacts/search"): {"payload": [contacto]},
        ("GET", "contacts/7/conversations"): {"payload": [{"id": 55, "inbox_id": 3, "can_reply": True,
                                                           "last_activity_at": 1700000000}]},
        ("POST", "conversations/55/messages"): {"id": 901}})
    monkeypatch.setattr("app.core.chatwoot._peticion", falso)
    guardar_config(db, {"envio_whatsapp_automatico": "true", "envio_whatsapp_inbox_id": "3"})
    db.commit()
    return falso


def _envios(db, tipo, doc_id):
    from app.models.envios import EnvioAlCliente
    db.expire_all()
    return (db.query(EnvioAlCliente)
            .filter(EnvioAlCliente.document_type == tipo, EnvioAlCliente.document_id == doc_id)
            .order_by(EnvioAlCliente.id).all())


def _envios_por_whatsapp(app_client, db, admin_token, monkeypatch):
    """Envía por WhatsApp una COT y un PVEN (con el Chatwoot falso) y devuelve [(doc, tipo, entidad, acción, resp)]."""
    _whatsapp_falso(monkeypatch, db)
    cot = _cot(db, customer_phone=TELEFONO_WA)
    so = _pedido(db, customer_phone=TELEFONO_WA)
    hechos = []
    for enviar, doc, tipo, entidad, accion in ((_enviar_cot, cot, "COT", "COT", "ESTADO_CHANGED"),
                                               (_enviar_pven, so, "PVEN", "VEN", "ENVIADO_AL_CLIENTE")):
        hechos.append((doc, tipo, entidad, accion, enviar(app_client, admin_token, doc, {"canal": "WhatsApp"})))
    return hechos


def test_con_whatsapp_el_correo_de_respaldo_lleva_el_pdf(app_client, db, admin_token, monkeypatch):
    """r1 (C1, Q8), R2: con canal WhatsApp el PDF va en el correo de RESPALDO, y el WhatsApp sale igual: su fila
    EnvioAlCliente y el renglón (con su envio_id) quedan guardados. COT y PVEN."""
    llamadas = _correo_falso(monkeypatch)
    for doc, tipo, entidad, accion, resp in _envios_por_whatsapp(app_client, db, admin_token, monkeypatch):
        assert resp.status_code == 200, resp.text
        j = resp.json()
        assert j["whatsapp"]["enviado"] is True and j["correo"]["mensaje"] == f"Correo enviado a {CORREO}.", tipo
        correo = next(l for l in reversed(llamadas) if doc.numero in l["subject"])
        assert correo["to"] == CORREO and _unico_adjunto(correo, doc.numero)
        [envio] = _envios(db, tipo, doc.id)
        renglon = _renglon(db, entidad, doc.id, accion)
        assert renglon.extra_data["whatsapp"]["envio_id"] == envio.id, tipo
        assert _fila_correo(renglon)["etiqueta"] == "Correo de respaldo", tipo


def test_con_whatsapp_un_fallo_de_lectura_del_pdf_no_pierde_el_envio(app_client, db, admin_token, monkeypatch):
    """r1 (C1, Q8): con canal WhatsApp y documento_cot / documento_pven forzados a ejecutar SELECT 1/0 (transacción
    abortada), el WhatsApp sale, el correo de respaldo dice «(sin PDF adjunto)» y quedan guardados la fila
    EnvioAlCliente y el renglón. Es el invariante de la duda 1: el PDF va antes del WhatsApp y su rollback no toca la
    fila del envío."""
    from sqlalchemy import text
    import app.core.documento_cliente as documento_cliente
    llamadas = _correo_falso(monkeypatch)
    _silenciar(monkeypatch, "app.api.v1.erp_ventas")

    def lectura_que_falla(db_, *a, **k):
        db_.execute(text("SELECT 1/0"))

    monkeypatch.setattr(documento_cliente, "documento_cot", lectura_que_falla)
    monkeypatch.setattr(documento_cliente, "documento_pven", lectura_que_falla)
    for doc, tipo, entidad, accion, resp in _envios_por_whatsapp(app_client, db, admin_token, monkeypatch):
        assert resp.status_code == 200, resp.text
        j = resp.json()
        assert j["whatsapp"]["enviado"] is True and j["whatsapp"]["envio_id"] is not None, tipo
        assert j["correo"]["mensaje"] == f"Correo enviado a {CORREO} {SIN_PDF}.", tipo
        correo = next(l for l in reversed(llamadas) if doc.numero in l["subject"])
        assert not correo.get("adjuntos"), tipo
        [envio] = _envios(db, tipo, doc.id)
        assert envio.id == j["whatsapp"]["envio_id"] and envio.estado == "ENVIADO", (tipo, envio.estado)
        renglon = _renglon(db, entidad, doc.id, accion)
        assert renglon is not None and renglon.extra_data["whatsapp"]["envio_id"] == envio.id, tipo
        assert _fila_correo(renglon)["despues"] == f"Correo enviado a {CORREO} {SIN_PDF}.", tipo


def test_el_contacto_y_el_color_de_la_empresa_salen_de_una_sola_fuente(db, monkeypatch):
    """r1 (Q9): el pie del correo y el del PDF salen de empresa.contacto_empresa(perfil), y el color de la marca de
    empresa.color_de_marca: los mismos renglones en el mismo orden, sin copias en correo_documento ni en
    pdf_documento."""
    import html
    import app.core.correo_documento as correo_mod
    import app.core.pdf_documento as pdf_mod
    from app.core.correo_documento import correo_documento
    from app.core.documento_cliente import armar_documento
    from app.core.empresa import COLORES_POR_DEFECTO, color_de_marca, contacto_empresa
    _sin_comprimir(monkeypatch)
    perfil = {"nombre_comercial": "DEMO Ferretería", "razon_social": "Demo & Hijos S.A.S.", "nit": "900.123.456-7",
              "direccion": "Calle 10 # 20-30", "ciudad": "Bogotá", "telefono": " 601 555 1234 ",
              "whatsapp": "300 123 4567", "correo": "ventas@demo.co", "sitio_web": "https://demo.co",
              "colores": {"principal": "#7c3aed", "secundario": "no-es-hex", "acento": "#C2410C"}}
    renglones = contacto_empresa(perfil)

    assert renglones == ["Teléfono: 601 555 1234", "WhatsApp: 300 123 4567", "Correo: ventas@demo.co",
                         "Página web: https://demo.co", "Calle 10 # 20-30, Bogotá",
                         "Demo & Hijos S.A.S. · NIT 900.123.456-7"]
    assert contacto_empresa({"nit": "900"}) == ["NIT 900"] and contacto_empresa({}) == []
    assert contacto_empresa({"ciudad": "Cali", "razon_social": "X"}) == ["Cali", "X"]
    assert color_de_marca(perfil, "principal") == "#7C3AED"
    assert color_de_marca(perfil, "secundario") == COLORES_POR_DEFECTO["secundario"]
    assert color_de_marca({}, "acento") == COLORES_POR_DEFECTO["acento"]

    _, cuerpo = correo_documento(perfil, "COT", "COT-1", "Ana", "https://erp.invalid/confirmar/abc")
    assert "<br>".join(html.escape(r, quote=True) for r in renglones) in cuerpo
    documento = armar_documento(db, "COT", numero="COT-T9-PIE", fecha_emision=datetime.datetime(2026, 10, 3, 15, 0),
                                cliente_nombre="Ana", lineas=[], con_precios=True, totales={"total": 1})
    assert " ".join(renglones) in _textos_pdf(pdf_mod.pdf_documento(documento, perfil, None))
    for modulo, copias in ((pdf_mod, ("_color", "_campo", "_renglones_pie")), (correo_mod, ("_color", "_campo"))):
        assert not [c for c in copias if hasattr(modulo, c)], modulo.__name__
