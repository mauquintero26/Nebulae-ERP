"""Paridad del Bloque 3 entre el backend y el frontend (B3 T13, RP21; T20 lo vuelve a correr).

Corre los DOS lados de verdad: importa el modulo del backend y llama a node sobre frontend/src/lib (_node). Asi un lado
que cambie solo se nota aqui, cosa que no logran los mismos numeros escritos en dos suites (test_iva_cotizacion.py y
test_iva.mjs). Sin node o sin el archivo .js la prueba FALLA (no se salta): T20 confia en esta paridad.

Compara, con casos fijos (incluidos los bordes; ningun caso al azar):
- core/iva con lib/iva.js: tarifas, normalizar (lanza <-> null), pct y etiqueta; repartir_proporcional (ventas_dinero)
  con los casos grandes que piden BigInt; calcular_totales_cotizacion (resultado y mensaje de error) y
  desglose_documento.
- Telefonos (decision 9 del controlador): despues de normalizar. El frontend solo ve telefono_whatsapp, el e164 de
  e164_whatsapp(x) o None; motivoTelefono (chatter.js) de ese valor es null si y solo si no es None, y numeroWhatsApp
  (whatsapp.js) da sus mismos digitos.
- empresa.validar_cambios con validarCampoEmpresa (marca-empresa.js).
- Pedir cambios: confirmacion_publica._validar_pedido_de_cambios (_limpiar_comentario, MIN/MAX_COMENTARIO_CAMBIOS y el
  tope sin limpiar) con puedeEnviarCambios y limpiarComentario (confirmacion-publica.js).
- seguimiento_confirmacion.validar_valor y validar_horario con validarConfigSeguimiento (seguimiento.js); y el resumen()
  real del backend en textoSeguimiento (cada estado y cada MOTIVO_* del modulo, nota tras T11).
- documento_cliente.etiqueta_modalidad con etiquetaModalidad (etiquetas-ventas.js, RP5).
- correo_documento.color_texto_sobre con colorTextoSobre y pdf_documento._texto_anticipo_cotizacion con textoFormaPago
  (documento-comercial.js).
- envio_whatsapp.MOTIVOS, TEXTOS_ENVIADO y ESTADOS_FINALES con sus espejos (envio-whatsapp.js), y los codigos de las
  acciones nuevas con ACCIONES_BLOQUE3 (acciones-bloque3.js, RP22).
- La fila de cada impuesto ('IVA 19% sobre $X', T20 M17): la etiqueta y el valor de filasTotales con los de
  pdf_documento._filas_totales.

Sin base de datos: todas las funciones del backend que compara son puras.
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_paridad_bloque3
"""
import inspect
import json
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

_FRONTEND_LIB = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib"
_INVALIDO = "INVALIDO"


def _node(archivo, cuerpo, datos=None):
    """Importa frontend/src/lib/<archivo> con node (m = el modulo, d = `datos`) y devuelve el JSON de `cuerpo`.

    El programa va por stdin (los casos largos no caben en la linea de comandos de Windows) y los datos como JSON
    ASCII (json.dumps escapa todo lo que no es ASCII, tambien un surrogate suelto). Sin node o sin el archivo, FALLA."""
    node = shutil.which("node")
    assert node, "No se encontro node en el PATH: la paridad del Bloque 3 no se puede comprobar (RP21)."
    lib = _FRONTEND_LIB / archivo
    assert lib.exists(), f"Falta frontend/src/lib/{archivo}: la paridad del Bloque 3 no se puede comprobar (RP21)."
    programa = ("const d = %s;\nimport(%s).then((m) => { process.stdout.write(JSON.stringify(%s)); })"
                ".catch((e) => { console.error(e); process.exit(1); });\n"
                % (json.dumps(datos), json.dumps(lib.as_uri()), cuerpo))
    r = subprocess.run([node, "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--input-type=module"],
                       input=programa, capture_output=True, text=True, encoding="utf-8", timeout=60)
    assert r.returncode == 0, f"node fallo con {archivo}:\n{r.stderr}"
    return json.loads(r.stdout)


def _json(valor):
    """El valor como lo ve el frontend (int y float iguales, tuplas como listas)."""
    return json.loads(json.dumps(valor))


def _diferencias(casos, backend, frontend):
    return [ascii((c, b, f)) for c, b, f in zip(casos, backend, frontend) if b != f]


# ─── IVA ───────────────────────────────────────────────────────────────────────────────────────────────────────

_TARIFAS = ["19", 19, 19.0, "19%", " iva 19 ", "IVA 19%", "Iva19", "ıva 19", "5", 5, "5%", "IVA 5", "exento", " Exento ",
            "EXCLUIDO", "excluido", None, "", "   ", "\xa0", "\x1c19\x1c", "\ufeff19", "\u200b19", "0", 0, "-19", -19,
            "16", 16, "abc", True, False, 19.5, "19.0", "IVA", "%", float("nan"), float("inf"), 10 ** 20, ["19"],
            {"t": "19"}, "１９"]


def test_paridad_tarifas_iva():
    from app.core import iva
    espejo = _node("iva.js", """({
      tarifas: m.TARIFAS_IVA, orden: m.ORDEN_TARIFAS, etiquetas: m.ETIQUETAS_TARIFA_IVA,
      sin: m.ETIQUETA_SIN_TARIFA, defecto: m.TARIFA_IVA_POR_DEFECTO, invalida: m.MENSAJE_TARIFA_INVALIDA,
      descuento: m.MENSAJE_DESCUENTO_INVALIDO,
      casos: d.map((v) => [m.normalizarTarifaIva(v), m.pctTarifaIva(v), m.etiquetaTarifaIva(v)]),
    })""", _TARIFAS)
    assert espejo["tarifas"] == [{"codigo": c, "pct": int(iva.TARIFAS_IVA[c]), "etiqueta": iva.ETIQUETAS_TARIFA_IVA[c]}
                                 for c in iva.ORDEN_TARIFAS]
    assert espejo["orden"] == list(iva.ORDEN_TARIFAS)
    assert espejo["etiquetas"] == iva.ETIQUETAS_TARIFA_IVA
    assert (espejo["sin"], espejo["defecto"]) == (iva.ETIQUETA_SIN_TARIFA, iva.TARIFA_IVA_POR_DEFECTO)
    assert (espejo["invalida"], espejo["descuento"]) == (iva.MENSAJE_TARIFA_INVALIDA, iva.MENSAJE_DESCUENTO_INVALIDO)

    def normalizada(v):
        try:
            return iva.normalizar_tarifa_iva(v)
        except ValueError:
            return _INVALIDO

    backend = [[normalizada(v), int(iva.pct_tarifa_iva(v)), iva.etiqueta_tarifa_iva(v)] for v in _TARIFAS]
    # El backend lanza con un valor no valido y el frontend da null (nota del controlador tras T3): los dos «no hay».
    frontend = [[_INVALIDO if n is None and b[0] == _INVALIDO else n, p, e]
                for (n, p, e), b in zip(espejo["casos"], backend)]
    assert backend == frontend, _diferencias(_TARIFAS, backend, frontend)
    assert sum(1 for b in backend if b[0] == _INVALIDO) >= 15 and sum(1 for b in backend if b[0] == "19") == 9


_REPARTOS = [
    ([1240614, 468000, 132000], 184061), ([100001, 100001, 100001], 180002), ([999999999, 1, 7], 999999999),
    ([9007199254740991, 3, 5], 9007199254740990), ([1240614, 468000, 132000], 2171851), ([7, 7, 7], 10),
    ([-5, 10, 2.5], 7), (["2.5", "10", None], "7"), ([100, 100], 300), ([1240614, 468000, 132000], 0),
    ([1, 2, 3], -6), ([0, 0], 500), ([], 500), ([1, 1, 1, 1, 1, 1, 1], 3), ([3, 3, 1], 1.5),
    ([123456789012, 987654321098, 555555555555], 1666666666665),
]


def test_paridad_repartir_proporcional():
    from app.core.ventas_dinero import repartir_proporcional
    espejo = _node("iva.js", "d.map(([montos, objetivo]) => m.repartirProporcional(montos, objetivo))", _REPARTOS)
    backend = [repartir_proporcional(montos, objetivo) for montos, objetivo in _REPARTOS]
    assert backend == espejo, _diferencias(_REPARTOS, backend, espejo)
    assert backend[2] == [999999991, 1, 7] and sum(backend[3]) == 9007199254740990  # los que piden BigInt


def _linea(nombre, qty, precio, tarifa, **extra):
    linea = {"product_name": nombre, "qty": qty, "unit_price_cop": precio, **extra}
    if tarifa is not None:
        linea["iva_tarifa"] = tarifa
    return linea


def _ejemplo(tarifas=("19", "19", "5")):
    return [_linea("Rodillo", 6, 206769, tarifas[0], total_cop=1240614), _linea("Pintura", 4, 117000, tarifas[1]),
            _linea("Cinta", 10, 13200, tarifas[2], sku_id=7)]


_CALCULOS = [
    # Los casos 1 a 5 de test_iva_cotizacion (los mismos numeros del diseño) y sus bordes.
    (_ejemplo(), 0), (_ejemplo(), 10), (_ejemplo(), "10"), (_ejemplo(), " 10.00 "), (_ejemplo(), 100), (_ejemplo(), "-0"),
    ([_linea("Lija", 1, 50, "19")], 0),
    ([_linea("A", 1, 100001, "19"), _linea("B", 1, 100001, "5"), _linea("C", 1, 100001, "EXENTO"),
      _linea("D", 1, 100001, "EXCLUIDO")], 7.5),
    ([_linea("Cuna", 2, 342462, "19")], 0),
    ([_linea("A", 3, 99999, "19"), _linea("B", 7, 1, "5"), _linea("C", 1, 55555, "19")], 33.33),
    ([_linea("Regalo", 1, 0, "19"), _linea("Cuna", 2, 342462, "19")], 10),
    ([_linea(f"P{i}", (i % 3) + 1, 997 + 131 * i, ("19", "5", "EXENTO", "EXCLUIDO")[i % 4]) for i in range(40)], 33.33),
    ([_linea("Tela", 2.5, 12345, "19"), _linea("Botón", 3, 999, "5")], 7.5),
    # La aritmetica decimal exacta, con medio peso hacia arriba.
    ([_linea("Tela", 1.15, 10, "19"), _linea("B", "2.5", "12345.5", "5")], "33.335"),
    # En flotante 1.005 * 100 da 100.49999999999999: la cantidad daria $100 (no $101) y el descuento 100 puntos
    # basicos (no 101).
    ([_linea("Tela", 1.005, 100, "19")], 0), ([_linea("A", 1, 100000, "19")], "1.005"),
    ([_linea("A", 1, 100000, "19")], 1.005),
    # Ronda r1. El IVA va en CADA linea (paso 6), no sobre la base sumada de la tarifa: 2 x ($50 al 19%) da $10 + $10
    # (por tarifa, $19) y 2 x ($10 al 5%) da $1 + $1 (por tarifa, $1).
    ([_linea("A", 1, 50, "19"), _linea("B", 1, 50, "19")], 0), ([_linea("A", 1, 10, "5"), _linea("B", 1, 10, "5")], 0),
    # Ronda r1. Lo que la calculadora manda a medio escribir: un precio en blanco vale $0 en el backend (redondear_peso);
    # una cantidad en blanco es un error (mas abajo), no 1.
    ([_linea("X", 1, "", "19")], 0), ([_linea("X", 1, "  ", "19")], 0),
    ([_linea("X", 3, "0.5", "19"), _linea("Y", "0.01", 50, " iva 19% "), _linea("Z", "1e1", "1E2", 5)], None),
    ([_linea("X", 1, None, "exento"), _linea("Y", " 2 ", " 7 ", "EXCLUIDO")], ""),
    ([_linea("A", 1, 100, "19"), _linea("B", 1, 100, "19"), _linea("C", 1, 100, "19")], "0.005"),
    ([_linea("A", 1, 1, "19"), _linea("B", 1, 1, "5")], 99.995),
    ([], 10), (None, 0),
    # Los errores legibles (mismo mensaje en los dos lados).
    (_ejemplo(("19", "16", "5")), 0), ([_linea("Rodillo", 0, 206769, "19")], 0),
    ([_linea("Rodillo", -2, 206769, "19")], 0), ([{"product_name": "Rodillo", "unit_price_cop": 5, "iva_tarifa": "19"}], 0),
    ([_linea("Rodillo", True, 5, "19")], 0), ([_linea("Rodillo", "dos", 5, "19")], 0), ([_linea("Rodillo", "-0", 5, "19")], 0),
    ([_linea("Rodillo", "", 5, "19")], 0), ([_linea("Rodillo", "  ", 5, "19")], 0),
    ([_linea("Rodillo", 1, -5, "19")], 0), ([_linea("Rodillo", 1, "abc", "19")], 0), ([_linea("Rodillo", 1, True, "19")], 0),
    ([_linea("Rodillo", 1, [5], "19")], 0),
    (_ejemplo(), 101), (_ejemplo(), "100.004"), (_ejemplo(), -1), (_ejemplo(), "diez"), (_ejemplo(), True),
    (_ejemplo(), float("nan")), (_ejemplo(), [10]), (_ejemplo(), "1e3"),
    ([_linea("Rodillo", 1, 5, None)], 0), ([_linea("Rodillo", 1, 5, "  ")], 0), ([_linea("Rodillo", 1, 5, False)], 0),
    ([_linea("Rodillo", 1, 5, "19"), "Texto viejo"], 0), ([_linea("Rodillo", 1, 5, "19"), None], 0),
    ([{"qty": 1, "unit_price_cop": 5}], 0), ([{"name": 7, "qty": 1, "iva_tarifa": "0"}], 0),
    ([{"nombre": " Silla ", "product_name": None, "qty": 0, "iva_tarifa": "5"}], 0),
]


def test_paridad_calcular_totales_cotizacion():
    from app.core.iva import calcular_totales_cotizacion
    espejo = _node("iva.js", """d.map(([productos, descuento]) => {
      try { return m.calcularTotalesCotizacion(productos, descuento); } catch (e) { return { error: e.message }; }
    })""", _CALCULOS)

    def backend(productos, descuento):
        try:
            return _json(calcular_totales_cotizacion(productos, descuento))
        except ValueError as e:
            return {"error": str(e)}

    esperado = [backend(p, d) for p, d in _CALCULOS]
    assert esperado == espejo, _diferencias(_CALCULOS, esperado, espejo)
    # La prueba compara numeros reales, no dos listas de errores.
    assert [r["total_cop"] for r in esperado[:2]] == [2171851, 1954666]
    assert esperado[13]["total_cop"] == 21614 and esperado[13]["lineas"][0]["total_cop"] == 12
    assert esperado[14]["total_cop"] == 120 and esperado[15]["descuento_cop"] == esperado[16]["descuento_cop"] == 1010
    # Ronda r1: IVA por linea y lo que llega a medio escribir.
    assert [l["iva_cop"] for l in esperado[17]["lineas"]] == [10, 10] and esperado[17]["total_cop"] == 120
    assert esperado[18]["iva_cop"] == 2 and esperado[18]["iva_por_tarifa"][0]["iva_cop"] == 2
    assert esperado[19]["total_cop"] == esperado[20]["total_cop"] == 0 and "error" not in esperado[19]
    for qty in ("", "  "):
        indice = _CALCULOS.index(([_linea("Rodillo", qty, 5, "19")], 0))
        assert esperado[indice] == {"error": "La cantidad de 'Rodillo' debe ser mayor que 0."}, ascii(esperado[indice])
    assert sum(1 for r in esperado if "error" in r) == 29


def _desgloses():
    from app.core.iva import calcular_totales_cotizacion
    r = calcular_totales_cotizacion(_ejemplo(), 10)
    lineas = _json(r["lineas"])
    doc = {"productos": lineas, "subtotal_cop": 1840614, "tax_cop": 298113, "total_cop": 1954666}
    con_texto = [{**l, "base_iva_cop": str(l["base_iva_cop"]), "iva_cop": f"{l['iva_cop']}.0"} for l in lineas]
    return [
        doc, {**doc, "subtotal_cop": "1840614.40", "tax_cop": "298113.00", "total_cop": 1954666.0},
        {**doc, "productos": con_texto},
        {"productos": _ejemplo((None, None, None)), "subtotal_cop": "1840614.40", "tax_cop": None, "total_cop": 1656553},
        {**doc, "subtotal_cop": 1708614, "tax_cop": 292173, "total_cop": 1829926},  # el resumen no cuadra con el IVA
        {**doc, "total_cop": 1954667},  # las bases no cuadran por un peso
        {"productos": [], "subtotal_cop": 100, "total_cop": 150}, {"productos": []}, {}, None,
        {"productos": lineas + ["Texto viejo"], "subtotal_cop": 1840614, "tax_cop": 298113, "total_cop": 1954666},
        {"productos": [{**l, "iva_tarifa": "16"} for l in lineas], "subtotal_cop": 1, "tax_cop": 0, "total_cop": 1},
        {"productos": lineas, "subtotal_cop": True, "tax_cop": "-2.5", "total_cop": "abc"},
        {"productos": [{"iva_tarifa": "exento", "base_iva_cop": 100, "iva_cop": 0}], "subtotal_cop": 100, "tax_cop": 0,
         "total_cop": 100},
    ]


def test_paridad_desglose_documento():
    from app.core.iva import desglose_documento
    docs = _desgloses()
    espejo = _node("iva.js", "d.map((doc) => m.desgloseDocumento(doc))", docs)
    backend = [_json(desglose_documento(doc)) for doc in docs]
    assert backend == espejo, _diferencias(docs, backend, espejo)
    assert [b["iva_discriminado"] for b in backend[:4]] == [True, True, True, False]  # el viejo no esta discriminado
    assert backend[-1]["iva_discriminado"] is True and backend[-3]["iva_discriminado"] is False


def test_paridad_impuestos_del_documento():
    """Los impuestos del documento del cliente (documento_cliente._totales_del_documento, que los toma de
    desglose_documento sin recalcular) son los mismos montos que da desgloseDocumento del frontend y los que pinta
    filasTotales (documento-comercial.js). T20 (M17): tambien la fila del PDF (pdf_documento._filas_totales), con la
    misma etiqueta que la pagina ('IVA 19% sobre $X') y el mismo valor."""
    from app.core.documento_cliente import _totales_del_documento
    from app.core.iva import desglose_documento
    from app.core.pdf_documento import _filas_totales, _pesos
    from app.core.iva import calcular_totales_cotizacion
    # T20 r2 (M15): tambien las tarifas no gravadas, 'Exento sobre $X' y 'Excluido sobre $X' (un caso de _CALCULOS y el
    # exento de _desgloses).
    no_gravadas = calcular_totales_cotizacion(
        [_linea("A", 1, 100001, "19"), _linea("B", 1, 100001, "5"), _linea("C", 1, 100001, "EXENTO"),
         _linea("D", 1, 100001, "EXCLUIDO")], 7.5)
    docs = _desgloses()[:5] + [{"productos": _ejemplo((None, None, None)), "subtotal_cop": 1840614, "tax_cop": 349717,
                                "total_cop": 2190331},  # IVA guardado sin tarifas (una sola fila 'IVA')
                               {"productos": _json(no_gravadas["lineas"]), "subtotal_cop": no_gravadas["subtotal_cop"],
                                "tax_cop": no_gravadas["iva_cop"], "total_cop": no_gravadas["total_cop"]},
                               _desgloses()[-1]]
    totales = []
    for d in docs:
        cabecera = SimpleNamespace(numero="COT-1", descuento_pct=10, subtotal_cop=d["subtotal_cop"],
                                   total_cop=d["total_cop"])
        totales.append(_json(_totales_del_documento(cabecera, [], desglose_documento(d))))
    desgloses = _node("iva.js", "d.map((doc) => m.desgloseDocumento(doc))", docs)
    filas = _node("documento-comercial.js",
                  "d.map((totales) => m.filasTotales({ con_precios: true, totales }))", totales)
    for doc, t, des, fs in zip(docs, totales, desgloses, filas):
        if des["iva_discriminado"]:
            assert t["impuestos"] == [{"etiqueta": f["etiqueta"], "base": f["base_cop"], "valor": f["iva_cop"]}
                                      for f in des["iva_por_tarifa"]], ascii((doc, t, des))
        else:
            assert t["impuestos"] == ([{"etiqueta": "IVA", "base": t["total"] - des["iva_cop"], "valor": des["iva_cop"]}]
                                      if des["iva_cop"] > 0 else []), ascii((doc, t, des))
        valor = {f["clave"]: f["valor"] for f in fs}
        assert [valor[f"impuesto-{i}"] for i in range(len(t["impuestos"]))] == [i["valor"] for i in t["impuestos"]]
        assert not any(k.startswith(f"impuesto-{len(t['impuestos'])}") for k in valor), ascii(fs)
        assert (valor["subtotal"], valor["total"]) == (t["subtotal"], t["total"])
        assert valor.get("descuento", 0) == -des["descuento_cop"] == -t["descuento"]
        # T20 (M17): las filas de impuesto del PDF (entre Subtotal/Descuento y Ajuste/TOTAL) = las de la pagina.
        del_pdf = [(etiqueta, monto) for etiqueta, monto, _ in _filas_totales({"totales": t})
                   if etiqueta not in ("Subtotal", "TOTAL", "Ajuste por redondeo") and not etiqueta.startswith("Descuento")]
        de_la_pagina = [(f["etiqueta"], _pesos(f["valor"])) for f in fs if f["clave"].startswith("impuesto-")]
        assert del_pdf == de_la_pagina, ascii((del_pdf, de_la_pagina))
        assert all(" sobre $" in etiqueta for etiqueta, _ in del_pdf), ascii(del_pdf)
    assert [len(t["impuestos"]) for t in totales] == [2, 2, 2, 0, 1, 1, 4, 1]
    etiquetas = [e for t in totales for e, _, _ in _filas_totales({"totales": t})]
    for no_gravada in ("Exento sobre $92.501", "Excluido sobre $92.501", "Exento sobre $100"):
        assert no_gravada in etiquetas, ascii(etiquetas)


# ─── Telefonos (decision 9) ────────────────────────────────────────────────────────────────────────────────────

_TELEFONOS = ["300 123 4567", "+57 300 123 4567", "0057 300 1234567", "3001234567", "(300) 123-4567", "573001234567",
              "57300123456", "5730012345678", "+1 415 555 0123", "+44 20 7946 0958", "+52 55 1234 5678",
              "1234567890123456", "0123456789012", "123", "", "   ", None, "N/A", "-", "300 123 4567 ext 12",
              "+57 (601) 234 5678", "6012345678", "00 1 415 555 0123", "+5730012345"]


def test_paridad_telefonos_despues_de_normalizar():
    from app.core.telefonos import e164_whatsapp
    e164 = [e164_whatsapp(x) for x in _TELEFONOS]
    motivos = _node("chatter.js", "d.map((t) => m.motivoTelefono(t))", e164)
    numeros = _node("whatsapp.js", "d.map((t) => m.numeroWhatsApp(t))", e164)
    for crudo, valor, motivo, numero in zip(_TELEFONOS, e164, motivos, numeros):
        assert (motivo is None) == (valor is not None), ascii((crudo, valor, motivo))
        if valor is not None:
            assert numero == valor[1:], ascii((crudo, valor, numero))
    assert sum(1 for v in e164 if v is not None) >= 8 and sum(1 for v in e164 if v is None) >= 8


# ─── Empresa (T2 / T12) ────────────────────────────────────────────────────────────────────────────────────────

_EMPRESA = [
    ("nombre_comercial", "  Pinturas Nebulae  "), ("nombre_comercial", "Pinturas\nNebulae\t S.A.S"),
    ("nombre_comercial", "a" * 120), ("nombre_comercial", "a" * 121), ("nombre_comercial", None), ("nombre_comercial", 7),
    ("nombre_comercial", "Línea\u2028dos\x85tres"), ("razon_social", "\ufeffNebulae\xa0SAS\u200b"),
    ("nit", "900.123.456-7"), ("nit", "900123"), ("nit", "9001"), ("nit", "NIT 900"), ("nit", "9" * 31),
    ("telefono", "601 234 5678"), ("telefono", "+57 (601) 234-5678"), ("telefono", "123456"), ("telefono", "1" * 16),
    ("telefono", "300 123 4567 ext 1"),
    ("whatsapp", "300 123 4567"), ("whatsapp", "+57 300 123 4567"), ("whatsapp", "+1 415 555 0123"),
    ("whatsapp", "300 123 4567 ext 12"), ("whatsapp", "6012345"), ("whatsapp", ""),
    ("correo", "ventas@nebulae.co"), ("correo", " ventas@nebulae.co "), ("correo", "ventas@nebulae"),
    ("correo", "ven tas@nebulae.co"), ("correo", "a@b@c.co"),
    ("sitio_web", "nebulae.co"), ("sitio_web", "https://nebulae.co/tienda"), ("sitio_web", "javascript:alert(1)"),
    ("sitio_web", "ftp://nebulae.co"), ("sitio_web", "https://[abc"), ("sitio_web", "http://"), ("sitio_web", "localhost:3000"),
    ("sitio_web", "https://nebulae .co"), ("sitio_web", "a" * 195 + ".co"),
    # T20 (C1, C2, M16): una URL con credenciales lleva a otro sitio ('mitienda.com@evil.com' abre evil.com).
    ("sitio_web", "https://mitienda.com@evil.com"), ("sitio_web", "https://user:pw@nebulae.co"),
    ("sitio_web", "https://@evil.com"), ("sitio_web", "mitienda.com@evil.com"), ("sitio_web", "https://nebulae.co/@tienda"),
    ("color_principal", "#7c3aed"), ("color_principal", "#7C3AED"), ("color_principal", "7C3AED"),
    ("color_secundario", "#12345"), ("color_acento", "#GGGGGG"), ("color_acento", ""),
    ("terminos_cotizacion", "Línea 1\r\nLínea 2\n\tSangría\x00\x07 "), ("terminos_pedido", "a" * 2001),
    ("instrucciones_pago", "Banco X\nCuenta 123\u2028"), ("mensaje_pie", "Gracias \U0001F600" * 3),
    ("logo", "x"), ("otro", "x"),
]


def test_paridad_validar_campo_empresa():
    from app.core import empresa
    espejo = _node("marca-empresa.js", "d.map(([campo, valor]) => m.validarCampoEmpresa(campo, valor))", _EMPRESA)

    def backend(campo, valor):
        try:
            return {"valor": empresa.validar_cambios({campo: valor})[campo], "error": None}
        except ValueError as e:
            return {"valor": None, "error": str(e)}

    esperado = [backend(c, v) for c, v in _EMPRESA]
    assert esperado == espejo, _diferencias(_EMPRESA, esperado, espejo)
    # T20 (C1, C2, M16): los dos lados rechazan una URL con '@' antes de la ruta; en la ruta no es una credencial.
    resultado = {v: r for (c, v), r in zip(_EMPRESA, esperado) if c == "sitio_web"}
    for credenciales in ("https://mitienda.com@evil.com", "https://user:pw@nebulae.co", "https://@evil.com",
                         "mitienda.com@evil.com"):
        assert resultado[credenciales] == {"valor": None, "error": empresa.MENSAJE_URL}, credenciales
    assert resultado["https://nebulae.co/@tienda"] == {"valor": "https://nebulae.co/@tienda", "error": None}
    assert sum(1 for r in esperado if r["error"]) >= 20 and sum(1 for r in esperado if not r["error"]) >= 20


# ─── Pedir cambios (T6 / T12) ──────────────────────────────────────────────────────────────────────────────────

_COMENTARIOS = [
    ("", "CAMBIOS"), ("", "NO_LA_NECESITA"), ("a" * 9, "CAMBIOS"), ("a" * 10, "CAMBIOS"), ("a" * 11, "CAMBIOS"),
    ("  " + "a" * 9 + "  ", "CAMBIOS"), ("\u200b" * 10 + "abcde", "CAMBIOS"), ("\u202e" + "a" * 10, "CAMBIOS"),
    ("a" * 1000, "CAMBIOS"), ("a" * 1001, "CAMBIOS"), ("a" * 1001, "NO_LA_NECESITA"),
    ("a" * 999 + "\r\n" + "b", "CAMBIOS"), ("a" * 998 + "\r\n" + "b", "CAMBIOS"), ("a\rb\r\nc" + "d" * 8, "CAMBIOS"),
    ("\U0001F600" * 10, "CAMBIOS"), ("\U0001F600" * 1000, "CAMBIOS"), ("\U0001F600" * 1001, "CAMBIOS"),
    ("\u200b" * 3995 + "abcdefghijk", "CAMBIOS"), ("\u200b" * 3989 + "abcdefghijk", "CAMBIOS"),
    ("\ud800" + "a" * 10, "CAMBIOS"), ("\ud800" + "a" * 9, "CAMBIOS"), ("\x00" + "a" * 10, "CAMBIOS"), ("\t" * 20, "CAMBIOS"),
    ("\x1c" + "a" * 9 + "\x1c", "CAMBIOS"), ("\xa0" + "a" * 9, "CAMBIOS"), ("a\u0301" * 5, "CAMBIOS"),
    ("Cambien\tel color\n\nde la cuna", "CAMBIOS"), ("ya no", "NO_LA_NECESITA"), ("a" * 20, "OTRO"),
    ("a" * 20, "cambios"),
]


def test_paridad_pedir_cambios():
    from fastapi import HTTPException
    from app.api.v1 import confirmacion_publica as cp
    espejo = _node("confirmacion-publica.js", """({
      min: m.MIN_COMENTARIO_CAMBIOS, max: m.MAX_COMENTARIO_CAMBIOS,
      puede: d.map(([texto, tipo]) => m.puedeEnviarCambios(texto, tipo)),
      limpio: d.map(([texto]) => m.limpiarComentario(texto)),
    })""", _COMENTARIOS)
    assert (espejo["min"], espejo["max"]) == (cp.MIN_COMENTARIO_CAMBIOS, cp.MAX_COMENTARIO_CAMBIOS)

    def puede(texto, tipo):
        try:
            cp._validar_pedido_de_cambios(cp.PedirCambiosBody(token="t", tipo=tipo, comentario=texto))
            return True
        except HTTPException:
            return False

    esperado = [puede(t, tipo) for t, tipo in _COMENTARIOS]
    assert esperado == espejo["puede"], _diferencias(_COMENTARIOS, esperado, espejo["puede"])
    limpio = [cp._limpiar_comentario(t) for t, _ in _COMENTARIOS]
    assert limpio == espejo["limpio"], _diferencias(_COMENTARIOS, limpio, espejo["limpio"])
    assert esperado.count(True) >= 10 and esperado.count(False) >= 10


# ─── Recordatorios (T11) ───────────────────────────────────────────────────────────────────────────────────────

_VALORES_CONFIG = {
    "seguimiento_auto_activo": [True, False, "true", "false", " TRUE ", "False", "si", "1", 1, 0, "", None, "verdadero"],
    "seguimiento_solo_horario": [True, "false", "\xa0true\xa0", "yes", 0, None, ["true"]],
    "seguimiento_dias": [1, 2, 15, 0, 16, -1, "2", " 7 ", "\x1c7\x1c", "0", "16", "2.5", 2.5, "", None, True, "abc", "٣",
                         "²", "1_0", "0x5", 10 ** 20, "007"],
    "seguimiento_max": [1, 5, 0, 6, "3", "6", " 1 ", False, None],
    "seguimiento_hora_inicio": [0, 23, 24, -1, "8", "08", "23", "24", None],
    "seguimiento_hora_fin": [1, 24, 0, 25, "18", "0", None],
}
_HORARIOS = [(8, 18), (18, 18), (20, 8), (0, 24), (23, 24), (0, 1), (1, 0), ("8", "18"), (" 9 ", "10"), ("10", " 9 "),
             (24, 24), (12, "x")]


def test_paridad_config_seguimiento():
    from app.core import seguimiento_confirmacion as sc
    casos = [(clave, valor) for clave, valores in _VALORES_CONFIG.items() for valor in valores]
    espejo = _node("seguimiento.js", """({
      limites: m.LIMITES_SEGUIMIENTO, horario: m.MENSAJE_HORARIO,
      uno: d.casos.map(([clave, valor]) => m.validarConfigSeguimiento({ [clave]: valor })),
      dos: d.horarios.map(([a, b]) => m.validarConfigSeguimiento({ seguimiento_hora_inicio: a, seguimiento_hora_fin: b })),
    })""", {"casos": casos, "horarios": _HORARIOS})
    assert espejo["limites"] == {clave: list(limites) for clave, limites in sc._LIMITES.items()}
    assert espejo["horario"] == sc.MENSAJE_HORARIO
    assert set(_VALORES_CONFIG) == set(sc.CLAVES_CONFIG)

    def uno(clave, valor):
        try:
            sc.validar_valor(clave, valor)
            return None
        except ValueError as e:
            return str(e)

    esperado = [uno(c, v) for c, v in casos]
    assert esperado == espejo["uno"], _diferencias(casos, esperado, espejo["uno"])

    def dos(inicio, fin):
        try:
            a = sc.validar_valor(sc.CLAVE_HORA_INICIO, inicio)
            b = sc.validar_valor(sc.CLAVE_HORA_FIN, fin)
            sc.validar_horario(int(a), int(b))
            return None
        except ValueError as e:
            return str(e)

    esperado = [dos(a, b) for a, b in _HORARIOS]
    assert esperado == espejo["dos"], _diferencias(_HORARIOS, esperado, espejo["dos"])
    assert esperado.count(sc.MENSAJE_HORARIO) >= 3 and esperado.count(None) >= 4


# Tono que debe dar textoSeguimiento a cada motivo_fin de DETENIDO que el backend puede dejar con el documento en
# Pendiente (los MOTIVO_* del modulo; ERROR_ANTES_DE_ENVIAR solo va en ultimo_resultado, con la fila en ACTIVO).
_TONO_POR_MOTIVO = {"SIN_MEDIO_CLIENTE": "alerta", "FALLO_ENVIO": "alerta", "CHATWOOT_SIN_RESPUESTA": "alerta",
                    "PLAZO_PASADO": "alerta", "COTIZACION_ENVIADA": "gris", "COTIZACION_VENCIDA": "alerta",
                    "ENLACE_ANULADO": "gris", "MANUAL": "gris"}
# El mensaje de FALLO_ENVIO cuando `enviar` lanzo (seguimiento_confirmacion: _anotar_error_del_sistema y el cierre de
# _enviar_recordatorio). Es un literal del backend, sin constante: la prueba afirma que sigue escrito asi.
_ERROR_DEL_SISTEMA = "Error del sistema."


def test_paridad_texto_seguimiento_con_el_resumen_real():
    """Nota del controlador tras T11: textoSeguimiento consume el resumen() REAL del backend (sin base: con la fila y
    la configuracion a mano) y cubre cada estado, cada MOTIVO_* del modulo y ultimo_resultado ERROR_ANTES_DE_ENVIAR."""
    import datetime
    from app.core import seguimiento_confirmacion as sc
    from app.core.fechas import a_colombia
    from app.models.confirmation import SeguimientoConfirmacion

    motivos = {getattr(sc, n) for n in dir(sc) if n.startswith("MOTIVO_")} - {sc.MOTIVO_ERROR_ANTES_DE_ENVIAR}
    assert motivos == set(_TONO_POR_MOTIVO), f"motivo_fin sin texto en seguimiento.js: {motivos ^ set(_TONO_POR_MOTIVO)}"
    proximo = datetime.datetime(2026, 10, 5, 14, 0)  # lunes 5 de octubre, 9:00 a. m. en Colombia
    enviado = datetime.datetime(2026, 10, 3, 20, 15)
    pendiente = SimpleNamespace(id=1, estado=sc.PENDIENTE)
    mensajes = {sc.MOTIVO_SIN_MEDIO: sc.TEXTO_SIN_MEDIO, sc.MOTIVO_SIN_RESPUESTA: sc.TEXTO_QUIZAS_SALIO,
                sc.MOTIVO_PLAZO_PASADO: "Venció hace más de 3 días sin poder enviarse.",
                sc.MOTIVO_FALLO_ENVIO: "No se pudo enviar: el envío de correos no está configurado.",
                sc.MOTIVO_COTIZACION_VENCIDA: ("La cotización venció el 3 de octubre de 2026 sin respuesta: "
                                               "re-cotízala o reenvíala.")}

    def fila(**campos):
        base = {"estado": sc.ACTIVO, "canal": "WhatsApp", "recordatorios_enviados": 0, "proximo_at": proximo,
                "ultimo_recordatorio_at": None, "motivo_fin": None, "ultimo_resultado": None}
        return SeguimientoConfirmacion(**{**base, **campos})

    casos = [  # (descripcion, fila, cfg, tono esperado)
        ("programado", fila(), {"activo": True, "max": 1}, "info"),
        ("apagado", fila(), {"activo": False, "max": 1}, "gris"),
        ("enviado, el ultimo", fila(recordatorios_enviados=1, ultimo_recordatorio_at=enviado), {"activo": True, "max": 1},
         "ok"),
        ("enviado, sigue otro", fila(recordatorios_enviados=1, ultimo_recordatorio_at=enviado), {"activo": True, "max": 2},
         "ok"),
        ("error antes de enviar", fila(ultimo_resultado={"canal": "WhatsApp", "motivo": sc.MOTIVO_ERROR_ANTES_DE_ENVIAR,
                                                         "mensaje": sc.TEXTO_NO_SALIO_POR_ERROR}),
         {"activo": True, "max": 1}, "alerta"),
        ("agotado", fila(estado=sc.AGOTADO, recordatorios_enviados=1, proximo_at=None), {"activo": True, "max": 1},
         "alerta"),
    ] + [
        (f"detenido {m}", fila(estado=sc.DETENIDO, proximo_at=None, motivo_fin=m,
                               ultimo_resultado={"canal": "WhatsApp", "motivo": m, "mensaje": mensajes[m]}
                               if m in mensajes else None),
         {"activo": True, "max": 1}, _TONO_POR_MOTIVO[m])
        for m in sorted(_TONO_POR_MOTIVO)
    ] + [
        # Ronda r1: FALLO_ENVIO con el mensaje de _anotar_error_del_sistema (enviar lanzo: pudo haber salido). El texto
        # es un literal del backend: si cambia, esta afirmacion cae y seguimiento.js debe seguirlo.
        ("detenido FALLO_ENVIO por error del sistema",
         fila(estado=sc.DETENIDO, proximo_at=None, motivo_fin=sc.MOTIVO_FALLO_ENVIO,
              ultimo_resultado={"canal": "WhatsApp", "motivo": sc.MOTIVO_FALLO_ENVIO, "mensaje": _ERROR_DEL_SISTEMA}),
         {"activo": True, "max": 1}, "alerta"),
        # Ronda r1: un error antes de enviar el segundo, despues de uno que si salio.
        ("error antes de enviar el segundo",
         fila(recordatorios_enviados=1, ultimo_recordatorio_at=enviado,
              ultimo_resultado={"canal": "WhatsApp", "motivo": sc.MOTIVO_ERROR_ANTES_DE_ENVIAR,
                                "mensaje": sc.TEXTO_NO_SALIO_POR_ERROR}),
         {"activo": True, "max": 2}, "alerta"),
    ]
    # El backend escribe 'Error del sistema.' en dos lugares; un cambio en cualquiera de los dos hace caer la prueba.
    for funcion in (sc._anotar_error_del_sistema, sc._enviar_recordatorio):
        assert f'"mensaje": "{_ERROR_DEL_SISTEMA}"' in inspect.getsource(funcion), funcion.__name__
    resumenes = [sc.resumen(None, "SC", pendiente, cfg=cfg, fila=f) for _, f, cfg, _ in casos]
    resumenes.append(sc.resumen(None, "SC", SimpleNamespace(id=1, estado="CONFIRMADA"), cfg={"activo": True, "max": 1},
                                fila=fila()))
    espejo = _node("seguimiento.js", """d.map((s) => ({ t: m.textoSeguimiento(s), detener: m.puedeDetener(s),
      generico: m.textoSeguimiento({ estado: 'DETENIDO', motivo_fin: 'NO_EXISTE' }).texto }))""", _json(resumenes))
    assert espejo[-1] == {"t": None, "detener": False, "generico": espejo[0]["generico"]}  # fuera de Pendiente: nada
    co = a_colombia(proximo)
    hora = f"{co.hour % 12 or 12}:{co.minute:02d} {'a. m.' if co.hour < 12 else 'p. m.'}"
    for (descripcion, _, _, tono), resumen, js in zip(casos, resumenes, espejo):
        t = js["t"]
        assert t is not None and t["tono"] == tono, ascii((descripcion, resumen, t))
        assert t["titulo"] and t["texto"] != js["generico"], ascii((descripcion, t))
        assert js["detener"] is (resumen["estado"] == sc.ACTIVO), ascii((descripcion, resumen["estado"]))
        mensaje = (resumen["ultimo_resultado"] or {}).get("mensaje")
        if mensaje and resumen["motivo_fin"] != sc.MOTIVO_SIN_RESPUESTA:
            assert mensaje.rstrip(".") in t["texto"], ascii((descripcion, mensaje, t["texto"]))
    assert f"{co.day} de octubre, {hora}" in espejo[0]["t"]["texto"] and "por WhatsApp" in espejo[0]["t"]["texto"]
    assert "(1 de 1)" in espejo[0]["t"]["texto"] and "El próximo sale el" in espejo[3]["t"]["texto"]
    sistema, segundo = espejo[len(casos) - 2]["t"], espejo[len(casos) - 1]["t"]
    assert sistema == {"tono": "alerta", "titulo": "Problema con el recordatorio",
                       "texto": "Error del sistema. Revisa si le llegó al cliente antes de escribirle."}, ascii(sistema)
    assert segundo["texto"].startswith("Recordatorio 1 de 2 enviado el ") and "Revisa si" not in segundo["texto"]
    assert f" {sc.TEXTO_NO_SALIO_POR_ERROR} " in segundo["texto"], ascii(segundo)


# ─── Documento del cliente (T5 / T9 / T12) ─────────────────────────────────────────────────────────────────────

_MODALIDADES = ["Contado", "  CONTADO ", "contado", "60/40", "60/40 (60% anticipo - 40% pendiente)", "Pago 60/40",
                "Credito 30 dias", "Credito 60 dias", "Crédito 60 Días", "Credito 30 Dias", "Credito 30d", "cr. 90 dias",
                "cred 45", "CRÉDITO", "credito", "Credito 060 dias", "Otro", "OTRO", None, "", "   ", "Adelanto 50%",
                "Contra entrega", "Credito 2 cuotas", "Pago a credito", "dias de credito", "CREDITO DIAS", "creditos",
                "Cruce de cuentas", "\ufeffCredito 30 dias", "Cre\u00addito 60 dias", "Ｃｒｅｄｉｔｏ 30 dias",
                "  Crédito 60 días ", 123, "Crédito a 30 días con Ñandú"]


def test_paridad_etiqueta_modalidad():
    from app.core.documento_cliente import etiqueta_modalidad
    espejo = _node("etiquetas-ventas.js", "d.map((v) => m.etiquetaModalidad(v))", _MODALIDADES)
    backend = [etiqueta_modalidad(v) for v in _MODALIDADES]
    assert backend == espejo, _diferencias(_MODALIDADES, backend, espejo)
    assert backend[3] == "60/40 (60% de anticipo y 40% al entregar)" and backend[6] == "Crédito 30 días"
    assert backend[_MODALIDADES.index("CRÉDITO")] == "Crédito" and backend[_MODALIDADES.index(None)] == ""


_COLORES = [[], ["#FFFFFF"], ["#000000"], ["#7C3AED", "#E11D48"], ["#7C3AED", "#E11D48", "#C2410C"], ["#C2410C"],
            ["#FACC15"], ["#777777"], ["#767676"], ["#888888"], ["#FFFF00", "#000080"], ["#7c3aed"], ["x"],
            [None, "red"], ["#12345"], ["#1234567"], [" #FFFFFF"], ["#FFFFFF\n"], [123], ["#E11D48", "x", None]]


def test_paridad_color_texto_sobre():
    from app.core.correo_documento import color_texto_sobre
    espejo = _node("documento-comercial.js", "d.map((c) => m.colorTextoSobre(...c))", _COLORES)
    backend = [color_texto_sobre(*c) for c in _COLORES]
    assert backend == espejo, _diferencias(_COLORES, backend, espejo)
    assert set(backend) == {"#FFFFFF", "#111827"}


_PAGOS = [
    ({"modalidad": "60/40", "anticipo_pct": 60, "anticipo": 1303111, "saldo": 868740}, {"total": 2171851}),
    ({"modalidad": "60/40", "anticipo_pct": 60, "anticipo": 1303111, "saldo": 868740, "manual": False}, {"total": 1}),
    ({"modalidad": "Otro", "anticipo_pct": 50, "anticipo": 1085926, "saldo": 1085925, "manual": True}, {"total": 2171851}),
    ({"modalidad": "Contado", "anticipo_pct": 100, "anticipo": 2171851, "saldo": 0}, {"total": 2171851}),
    ({"modalidad": "Contado", "anticipo_pct": 100, "anticipo": 2171851, "saldo": 0, "manual": True}, {"total": 2171851}),
    ({"modalidad": "Credito 30 dias", "anticipo_pct": 0, "anticipo": 0, "saldo": 2171851}, {"total": 2171851}),
    ({"modalidad": "Credito 30 dias", "anticipo_pct": 0, "anticipo": 0, "saldo": 2171851}, {"total": None}),
    ({"anticipo_pct": 12.5, "anticipo": 271481, "saldo": 1900370}, {"total": 2171851}),
    ({"anticipo_pct": 33.333, "anticipo": 723950, "saldo": 1447901}, {"total": 2171851}),
    ({"anticipo_pct": 60, "anticipo": 1303111, "saldo": 868740, "saldo_a_favor": 500000, "anticipo_por_pagar": 803111},
     {"total": 2171851}),
    ({"anticipo_pct": 60, "anticipo": 1303111, "saldo": 868740, "saldo_a_favor": 0, "anticipo_por_pagar": 1303111},
     {"total": 2171851}),
    ({"anticipo_pct": 150, "anticipo": 100, "saldo": 0}, {"total": 100}),
    ({"anticipo_pct": "60", "anticipo": 1303111, "saldo": 868740}, {"total": 2171851}),
    ({"anticipo_pct": True, "anticipo": 1303111, "saldo": 868740}, {"total": 2171851}),
    ({"anticipo_pct": None, "anticipo": 1303111, "saldo": 868740}, {"total": 2171851}),
]


def test_paridad_texto_forma_pago():
    """Nota del controlador tras T9: la precedencia del PDF (manual -> >= 100 -> > 0 -> 0) con textoFormaPago. Solo
    pagos con anticipo: sin anticipo (la SC) el frontend muestra los textos de U17 y el PDF de la COT no aplica."""
    from app.core.pdf_documento import _texto_anticipo_cotizacion
    espejo = _node("documento-comercial.js", "d.map(([pago, totales]) => m.textoFormaPago(pago, totales))", _PAGOS)
    backend = [_texto_anticipo_cotizacion(pago, totales) for pago, totales in _PAGOS]
    assert backend == espejo, _diferencias(_PAGOS, backend, espejo)
    assert backend[0].startswith("Anticipo del 60% ($1.303.111)") and backend[-1] == ""


# ─── WhatsApp y acciones de la Actividad (T8 / RP22) ───────────────────────────────────────────────────────────

def test_paridad_textos_whatsapp():
    from app.core import envio_whatsapp
    fallidas = [envio_whatsapp.TEXTO_NO_SE_PUDO_CONSULTAR, envio_whatsapp.TEXTO_NO_ENCONTRADO]
    espejo = _node("envio-whatsapp.js", """({ motivos: m.TEXTOS_MOTIVO_WHATSAPP, enviado: m.TEXTOS_WHATSAPP_ENVIADO,
      finales: m.ESTADOS_FINALES_ENTREGA, consulta: m.TEXTOS_CONSULTA_FALLIDA,
      entrega: d.map((texto) => ['ENTREGADO', 'LEIDO'].map((estado) => m.textoEntrega(estado, texto))) })""", fallidas)
    assert espejo["motivos"] == envio_whatsapp.MOTIVOS
    assert espejo["enviado"] == envio_whatsapp.TEXTOS_ENVIADO
    assert espejo["finales"] == list(envio_whatsapp.ESTADOS_FINALES)
    # Ronda r1: con un ENTREGADO o LEIDO, si la consulta a Chatwoot falló, el modal también lo dice.
    assert espejo["consulta"] == fallidas
    assert espejo["entrega"] == [[f"Le llegó al cliente. {t}", f"El cliente ya lo leyó. {t}"] for t in fallidas]


def test_paridad_los_textos_del_servidor_nombran_el_boton_real():
    """F3 (M1, M8): el 409 del primer envío («Ya se le envió al cliente; usa «…».») y el «Qué hacer» de un WhatsApp
    FALLIDO nombran el botón con TEXTO_REENVIAR_AL_CLIENTE, el rótulo que de verdad tienen las pantallas. Si el
    frontend cambia el rótulo, esta prueba avisa antes de que el servidor siga nombrando un botón que no existe."""
    from app.api.v1 import erp_ventas
    from app.core import envio_whatsapp
    espejo = _node("envio-whatsapp.js", "({ reenviar: m.TEXTO_REENVIAR_AL_CLIENTE })")
    boton = f"«{espejo['reenviar']}»"
    assert boton == "«Reenviar al cliente»"
    assert boton in erp_ventas._YA_ENVIADO_USA_REENVIAR, erp_ventas._YA_ENVIADO_USA_REENVIAR
    assert erp_ventas._YA_ENVIADO_USA_REENVIAR == f"Ya se le envió al cliente; usa {boton}."
    assert boton in envio_whatsapp._QUE_HACER, envio_whatsapp._QUE_HACER
    assert not hasattr(envio_whatsapp, "_QUE_HACER_POR_DEFECTO")  # un solo texto para los tres documentos


def test_paridad_acciones_bloque3_con_el_backend():
    """RP22: el backend solo escribe la action y ACCIONES_BLOQUE3 trae una entrada por cada una, con el mismo codigo.
    Ronda r1: tambien CLIENTE_CAMBIADO (cambios_documento, T5 r2)."""
    from app.api.v1 import confirmacion_publica, erp_ventas
    from app.core import cambios_documento, envio_whatsapp
    from app.core import seguimiento_confirmacion as sc
    codigos = {sc.RECORDATORIO_ENVIADO, sc.RECORDATORIO_FALLIDO, sc.SEGUIMIENTO_AGOTADO, sc.SEGUIMIENTO_DETENIDO,
               envio_whatsapp.ACCION_MENSAJE_CLIENTE, erp_ventas.ACCION_ENVIADO_AL_CLIENTE,
               cambios_documento.ACCION_CLIENTE_CAMBIADO}
    # Las tres de T6 se escriben con el codigo literal (sin constante): que sigan escritas asi en el backend.
    fuentes = inspect.getsource(confirmacion_publica) + inspect.getsource(erp_ventas)
    literales = {"CAMBIOS_CLIENTE", "SC_CAMBIOS_CLIENTE", "AVISO_ASESOR"}
    assert all(f'"{c}"' in fuentes for c in literales), literales
    espejo = _node("acciones-bloque3.js", "Object.keys(m.ACCIONES_BLOQUE3)")
    assert sorted(espejo) == sorted(codigos | literales)
