"""Bloque 3, Tarea 1: fechas de Colombia (core/fechas.py, C6 y RP1) y teléfonos de WhatsApp (core/telefonos.py, C27,
RP19 y RP20).

- fechas.py: una sola zona (ZONA_COLOMBIA, America/Bogota, sin horario de verano; TZ_CO es el mismo objeto), ahora_utc,
  hoy_colombia, a_colombia, vence_al_final_del_dia, fecha_larga, fecha_hora_co e iso_z.
- telefonos.py (puro): numero_whatsapp solo normaliza (como numeroWhatsApp de lib/whatsapp.js); e164_whatsapp (11 a 15
  dígitos) es la única regla que decide si un WhatsApp es válido; telefono_legible; telefono_del_documento(doc) lee
  doc.customer_phone y, si está vacío, doc.customer.phone por la relación (sin recibir db).
La paridad real con el frontend (node) la hace T13 en test_paridad_bloque3.py (RP21); aquí solo el backend.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_fechas_y_telefonos
"""
import uuid
from datetime import date, datetime, timedelta, timezone


# ─── core/fechas.py ──────────────────────────────────────────────────────────────────────────────────────────

def test_una_sola_zona_de_colombia():
    """RP1: TZ_CO es un alias de ZONA_COLOMBIA (no hay OFFSET_CO ni una segunda zona timezone(-5))."""
    from app.core import fechas
    assert fechas.ZONA_COLOMBIA.key == "America/Bogota"
    assert fechas.TZ_CO is fechas.ZONA_COLOMBIA
    assert not hasattr(fechas, "OFFSET_CO")


def test_vence_al_final_del_dia():
    """U22-validez prueba 7: el enlace sirve todo el día de Colombia; termina a las 00:00 del día siguiente en Colombia,
    que son las 05:00 UTC (se guarda en UTC sin zona, como created_at)."""
    from app.core.fechas import vence_al_final_del_dia
    assert vence_al_final_del_dia(date(2026, 10, 8)) == datetime(2026, 10, 9, 5, 0)
    assert vence_al_final_del_dia(date(2026, 12, 31)) == datetime(2027, 1, 1, 5, 0)
    assert vence_al_final_del_dia(date(2026, 10, 8)).tzinfo is None
    # r1: un instante (datetime) no es una fecha: su día UTC puede no ser el de Colombia (22:00 del 8 = 03:00 UTC del 9).
    try:
        vence_al_final_del_dia(datetime(2026, 10, 9, 3, 0))
    except TypeError as e:
        assert str(e) == "vence_al_final_del_dia espera una fecha (date), no un instante"
    else:
        raise AssertionError("vence_al_final_del_dia aceptó un datetime")
    # r2: lo que no es una fecha (None, un texto) también da un TypeError que dice qué llegó.
    assert _lanza_type_error(vence_al_final_del_dia, None) == "vence_al_final_del_dia espera una fecha (date), no NoneType"
    assert _lanza_type_error(vence_al_final_del_dia, "2026-10-08") == "vence_al_final_del_dia espera una fecha (date), no str"


def _lanza_type_error(fn, valor):
    try:
        fn(valor)
    except TypeError as e:
        return str(e)
    raise AssertionError(f"{fn.__name__}({valor!r}) no lanzó TypeError")


def test_hoy_colombia_y_a_colombia():
    """A las 03:00 UTC del 4 de octubre todavía es el 3 en Colombia (22:00)."""
    from app.core.fechas import a_colombia, ahora_utc, hoy_colombia, ZONA_COLOMBIA
    assert hoy_colombia(datetime(2026, 10, 4, 3, 0)) == date(2026, 10, 3)
    assert hoy_colombia(datetime(2026, 10, 4, 5, 0)) == date(2026, 10, 4)
    # Sin argumento usa la hora actual.
    assert hoy_colombia() == datetime.now(timezone.utc).astimezone(ZONA_COLOMBIA).date()
    co = a_colombia(datetime(2026, 10, 4, 3, 0))
    assert (co.year, co.month, co.day, co.hour, co.minute) == (2026, 10, 3, 22, 0)
    assert co.utcoffset() == timedelta(hours=-5)
    # Un datetime con zona se convierte igual.
    assert a_colombia(datetime(2026, 10, 4, 3, 0, tzinfo=timezone.utc)) == co
    # ahora_utc: UTC sin zona, como las columnas (utcnow).
    ahora = ahora_utc()
    assert ahora.tzinfo is None
    assert abs(ahora - datetime.now(timezone.utc).replace(tzinfo=None)) < timedelta(seconds=5)


def test_fecha_larga():
    """'8 de octubre de 2026'. Una fecha sin hora (date o 'AAAA-MM-DD') no se corre de día; una con hora (UTC sin zona
    o ISO) se pasa al día de Colombia."""
    from app.core.fechas import fecha_larga
    casos = [
        (date(2026, 10, 8), "8 de octubre de 2026"),
        ("2026-10-08", "8 de octubre de 2026"),
        (date(2026, 1, 1), "1 de enero de 2026"),
        (date(2026, 12, 31), "31 de diciembre de 2026"),
        (datetime(2026, 10, 9, 3, 0), "8 de octubre de 2026"),        # 22:00 del 8 en Colombia
        (datetime(2026, 10, 9, 5, 0), "9 de octubre de 2026"),
        ("2026-10-09T03:00:00", "8 de octubre de 2026"),
        ("2026-10-09T03:00:00Z", "8 de octubre de 2026"),
        (datetime(2026, 10, 9, 3, 0, tzinfo=timezone.utc), "8 de octubre de 2026"),
    ]
    for valor, esperado in casos:
        assert fecha_larga(valor) == esperado, (valor, fecha_larga(valor))
    assert fecha_larga(None) is None
    assert fecha_larga("") is None
    # r1: un texto en blanco también es «vacío»; con espacios alrededor se lee igual.
    assert fecha_larga("   ") is None
    assert fecha_larga(" 2026-10-08 ") == "8 de octubre de 2026"


def test_fecha_hora_co():
    """'03/10/2026 a las 3:15 p. m.' (la de U17: dd/mm/aaaa, hora sin cero y a. m./p. m.)."""
    from app.core.fechas import fecha_hora_co
    casos = [
        (datetime(2026, 10, 3, 20, 15), "03/10/2026 a las 3:15 p. m."),
        (datetime(2026, 10, 4, 3, 15), "03/10/2026 a las 10:15 p. m."),
        (datetime(2026, 10, 3, 14, 5), "03/10/2026 a las 9:05 a. m."),
        (datetime(2026, 10, 3, 5, 0), "03/10/2026 a las 12:00 a. m."),    # medianoche en Colombia
        (datetime(2026, 10, 3, 17, 0), "03/10/2026 a las 12:00 p. m."),   # mediodía en Colombia
        ("2026-10-03T20:15:00", "03/10/2026 a las 3:15 p. m."),
        ("2026-10-03T20:15:00Z", "03/10/2026 a las 3:15 p. m."),
    ]
    for valor, esperado in casos:
        assert fecha_hora_co(valor) == esperado, (valor, fecha_hora_co(valor))
    assert fecha_hora_co(None) is None
    # r1: texto en blanco → None; una fecha sin hora (date o 'AAAA-MM-DD') no tiene hora que mostrar → TypeError en
    # español (antes daba un AttributeError difícil de leer).
    assert fecha_hora_co("   ") is None
    for valor in (date(2026, 10, 3), "2026-10-03"):
        mensaje = _lanza_type_error(fecha_hora_co, valor)
        assert "fecha_hora_co" in mensaje and "instante" in mensaje, mensaje


def test_iso_z():
    """UTC sin zona + 'Z' para el navegador (la regla de _iso_utc de erp_ventas); None queda None."""
    from app.core.fechas import iso_z
    assert iso_z(datetime(2026, 10, 3, 20, 15)) == "2026-10-03T20:15:00Z"
    assert iso_z(datetime(2026, 10, 3, 15, 15, tzinfo=timezone(timedelta(hours=-5)))) == "2026-10-03T20:15:00Z"
    assert iso_z(None) is None
    # r1: igual que _iso_utc, un texto se devuelve tal cual; una fecha sin hora → TypeError en español.
    assert iso_z("2026-10-03T20:15:00Z") == "2026-10-03T20:15:00Z"
    mensaje = _lanza_type_error(iso_z, date(2026, 10, 3))
    assert "iso_z" in mensaje and "instante" in mensaje, mensaje


# ─── core/telefonos.py ───────────────────────────────────────────────────────────────────────────────────────

def test_telefonos_de_whatsapp():
    """Prueba 1 de U16-envio (solo el backend; la paridad con node es de T13, RP21). e164_whatsapp es la única regla de
    validez (11 a 15 dígitos): '300123456' no es un WhatsApp válido aunque numero_whatsapp lo normalice."""
    from app.core.telefonos import e164_whatsapp, numero_whatsapp, telefono_legible
    for t in ("3001234567", "+57 300 123 4567", "0057 300 123 4567", "573001234567", "(300) 123-4567"):
        assert e164_whatsapp(t) == "+573001234567", t
        assert numero_whatsapp(t) == "573001234567", t
    for t in ("", None, "abc", "300123456", "+", "1234567890123456"):
        assert e164_whatsapp(t) is None, t
    # r1, bordes: 7 dígitos (fijo local) no; 15 exactos sí (el máximo E.164); ningún indicativo empieza en 0; con
    # indicativo 57 deben ser exactamente 12 dígitos (57 + 10), así que un '(0)' de más no pasa.
    for t in ("1234567", "03001234567", "+57 (0) 300 123 4567", "57300123456", "5730012345678"):
        assert e164_whatsapp(t) is None, t
    assert e164_whatsapp("123456789012345") == "+123456789012345"
    assert e164_whatsapp("+57 300 123 4567") == "+573001234567"
    # Ruling r1: una extensión pegada a un celular colombiano ('300 123 4567 ext 12', 12 dígitos que no empiezan en 57)
    # SIGUE pasando como número internacional (+30… es Grecia): con solo los dígitos no se distingue de un número
    # extranjero real, y rechazar textos con letras rompería datos viejos como «Cel. 300 123 4567».
    assert e164_whatsapp("300 123 4567 ext 12") == "+300123456712"
    assert e164_whatsapp("Cel. 300 123 4567") == "+573001234567"
    # numero_whatsapp solo normaliza, igual que numeroWhatsApp del frontend: no rechaza 9 dígitos.
    assert numero_whatsapp("300123456") == "300123456"
    assert numero_whatsapp("") is None and numero_whatsapp(None) is None and numero_whatsapp("abc") is None
    assert numero_whatsapp(3001234567) == "573001234567"
    # Otro indicativo de país: se respeta (nunca '57' + algo que ya trae indicativo).
    assert e164_whatsapp("+1 415 555 0123") == "+14155550123"
    assert telefono_legible("+573001234567") == "+57 300 123 4567"
    assert telefono_legible("+14155550123") == "+14155550123"
    assert telefono_legible(None) is None


def test_telefonos_es_puro():
    """RP21: core/telefonos.py no importa la base ni FastAPI."""
    import inspect
    from app.core import telefonos
    fuente = inspect.getsource(telefonos)
    for prohibido in ("sqlalchemy", "app.db", "fastapi", "Session"):
        assert prohibido not in fuente, prohibido


def test_telefono_del_documento_usa_el_del_cliente_si_el_documento_no_tiene(db):
    """C27/RP20: un solo helper para el teléfono del documento. Lee doc.customer_phone y, si está vacío, el teléfono del
    cliente por la relación `customer`; devuelve el teléfono crudo (quien lo necesite en e164 aplica e164_whatsapp)."""
    from app.core.telefonos import e164_whatsapp, telefono_del_documento
    from app.models.customers import Customer
    from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder
    cliente = Customer(first_name="Cliente", last_name="B3T1", phone="300 123 4567",
                       email=f"b3t1-{uuid.uuid4().hex[:8]}@test.nebulae")
    db.add(cliente); db.commit()
    sufijo = uuid.uuid4().hex[:6].upper()
    sc = CustomerRequest(numero=f"SC-B3T1{sufijo}", customer_name="Cliente B3T1", customer_id=cliente.id,
                         customer_phone=None, estado="ASIGNADA", productos=[])
    db.add(sc); db.commit(); db.refresh(sc)
    assert telefono_del_documento(sc) == "300 123 4567"
    assert e164_whatsapp(telefono_del_documento(sc)) == "+573001234567"

    sc.customer_phone = "   "
    db.commit(); db.refresh(sc)
    assert telefono_del_documento(sc) == "300 123 4567"

    # r1: un teléfono sin dígitos (datos viejos como 'N/A' o '-') cuenta como vacío y cae al del cliente.
    for sin_digitos in ("N/A", "-", "(sin teléfono)"):
        sc.customer_phone = sin_digitos
        db.commit(); db.refresh(sc)
        assert telefono_del_documento(sc) == "300 123 4567", sin_digitos

    sc.customer_phone = "311 222 3344"
    db.commit(); db.refresh(sc)
    assert telefono_del_documento(sc) == "311 222 3344"
    # Ruling r1: uno con dígitos se queda aunque sea corto (lo escribió el asesor; RP20 dice «si está vacío»).
    sc.customer_phone = "1234567"
    db.commit(); db.refresh(sc)
    assert telefono_del_documento(sc) == "1234567"

    # Lo mismo para la cotización y el pedido (los tres tienen customer_phone y la relación customer).
    cot = SalesQuotation(numero=f"COT-B3T1{sufijo}", sc_id=sc.id, customer_name="Cliente B3T1",
                         customer_id=cliente.id, estado="BORRADOR", productos=[])
    ven = SaleOrder(numero=f"PVEN-B3T1{sufijo}", sc_id=sc.id, customer_name="Cliente B3T1",
                    customer_id=cliente.id, customer_phone="", estado="PENDIENTE_COMPRA")
    db.add_all([cot, ven]); db.commit(); db.refresh(cot); db.refresh(ven)
    assert telefono_del_documento(cot) == "300 123 4567"
    assert telefono_del_documento(ven) == "300 123 4567"

    # Sin teléfono propio y sin cliente: None.
    sin = CustomerRequest(numero=f"SC-B3T1X{sufijo}", customer_name="Sin teléfono", estado="ASIGNADA", productos=[])
    db.add(sin); db.commit(); db.refresh(sin)
    assert telefono_del_documento(sin) is None
    # Ni el documento ni el cliente con dígitos: None (no se devuelve 'N/A' como si fuera un teléfono).
    sin_tel = Customer(first_name="Cliente", last_name="B3T1", phone="N/A",
                       email=f"b3t1-{uuid.uuid4().hex[:8]}@test.nebulae")
    db.add(sin_tel); db.commit()
    sin.customer_id = sin_tel.id
    sin.customer_phone = "-"
    db.commit(); db.refresh(sin)
    assert telefono_del_documento(sin) is None


def test_iso_utc_de_erp_ventas_es_iso_z():
    """F1 (M43, D:57(c)): una sola regla de «UTC sin zona más 'Z'»: erp_ventas._iso_utc ES fechas.iso_z (el nombre se
    queda por sus llamadores). La salida no cambia."""
    from app.api.v1 import erp_ventas
    from app.core.fechas import iso_z
    assert erp_ventas._iso_utc is iso_z
    assert erp_ventas._iso_utc(datetime(2026, 10, 22, 15, 0)) == "2026-10-22T15:00:00Z"
    assert erp_ventas._iso_utc(None) is None and erp_ventas._iso_utc("2026-10-22T15:00:00Z") == "2026-10-22T15:00:00Z"
