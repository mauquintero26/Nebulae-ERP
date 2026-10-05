"""H26 (Bloque 2, T4): la Actividad de la solicitud (SC) muestra los productos sin precio.

- cambios_documento.comparar('SC', ...) registra 'Producto agregado: X ×N', 'Producto eliminado: X ×N' y 'X — cantidad',
  sin ' a $…' ni '— precio unitario' / '— total' (una SC no tiene precios: llegan en 0). COT y VEN no cambian.
- cambian_productos sigue comparando el precio (C18: lo usa la invalidacion de Gate 1).
- limpiar_precios_sc(cambios): funcion pura que quita esos precios de un renglon viejo (None si no hay nada que quitar).
- scripts/corregir_actividad_sc_sin_precio.py: corrige los renglones viejos de SC, modo reporte por defecto (READ ONLY),
  --aplicar --base (B9), respaldo, idempotente, sin tocar los documentos reales ni Soporte Tecnico (R32).

Los simbolos nuevos de T4 se importan DENTRO de cada prueba (el runner importa el modulo fuera de un try).
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_actividad_sc_sin_precio
"""
import contextlib
import io
import json
import re

import pytest

from app.core import cambios_documento as cd

TABLA_TEST = "activity_logs_respaldo_sc_precio_test"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _linea(nombre, qty, precio, **extra):
    return {"product_name": nombre, "qty": qty, "unit_price_cop": precio, **extra}


def _sin_pesos(cambios):
    return all("$" not in str(c.get("antes") or "") and "$" not in str(c.get("despues") or "") for c in cambios)


# ─── Comparacion (sin DB) ────────────────────────────────────────────────────────────

def test_sc_producto_agregado_sin_precio():
    cambios = cd.comparar("SC", {"productos": []}, {"productos": [_linea("Nivel laser", 1, 0)]})
    assert cambios == [{"campo": "productos", "etiqueta": "Producto agregado", "antes": None,
                        "despues": "Nivel laser ×1"}]


def test_sc_eliminado_y_cantidad_sin_precio():
    antes = {"productos": [_linea("Nivel laser", 1, 0), _linea("Taladro", 2, 0)]}
    despues = {"productos": [_linea("Taladro", 3, 0)]}
    cambios = cd.comparar("SC", antes, despues)
    assert [c["etiqueta"] for c in cambios] == ["Taladro — cantidad", "Producto eliminado"]
    assert cambios[0]["antes"] == "2" and cambios[0]["despues"] == "3"
    assert cambios[1]["antes"] == "Nivel laser ×1"
    assert _sin_pesos(cambios)


def test_sc_cambio_solo_de_precio_no_registra_nada():
    antes = {"productos": [_linea("Nivel laser", 1, 0)]}
    despues = {"productos": [_linea("Nivel laser", 1, 5000)]}
    assert cd.comparar("SC", antes, despues) == []
    # C18: la invalidacion de Gate 1 sigue viendo el precio (la vista publica de la SC lo muestra).
    assert cd.cambian_productos(antes["productos"], despues["productos"]) is True
    # Tampoco un cambio de solo el total de la linea.
    assert cd.comparar("SC", {"productos": [_linea("Taladro", 1, 0, total_cop=0)]},
                       {"productos": [_linea("Taladro", 1, 0, total_cop=900)]}) == []
    # Vincular la linea al catalogo si se sigue registrando (no es un precio).
    vinculo = cd.comparar("SC", {"productos": [_linea("Taladro", 1, 0)]},
                          {"productos": [_linea("Taladro", 1, 0, sku_id=7)]})
    assert [c["campo"] for c in vinculo] == ["productos_sku"]


def test_cot_y_ven_siguen_mostrando_precio():
    for entidad in ("COT", "VEN"):
        agregado = cd.comparar(entidad, {"productos": []}, {"productos": [_linea("Coche", 1, 70000)]})
        assert agregado == [{"campo": "productos", "etiqueta": "Producto agregado", "antes": None,
                             "despues": "Coche ×1 a $70.000"}], entidad
        precio = cd.comparar(entidad, {"productos": [_linea("Coche", 1, 70000)]},
                             {"productos": [_linea("Coche", 1, 80000)]})
        assert [c["etiqueta"] for c in precio] == ["Coche — precio unitario"], entidad
        eliminado = cd.comparar(entidad, {"productos": [_linea("Coche", 1, 70000)]}, {"productos": []})
        assert eliminado[0]["antes"] == "Coche ×1 a $70.000", entidad


def test_limpiar_precios_sc():
    from app.core.cambios_documento import limpiar_precios_sc
    viejo = [{"campo": "productos", "etiqueta": "Producto agregado", "antes": None,
              "despues": "Nivel laser DEMO ×1 a $0"}]
    nuevo = limpiar_precios_sc(viejo)
    assert nuevo == [{"campo": "productos", "etiqueta": "Producto agregado", "antes": None,
                      "despues": "Nivel laser DEMO ×1"}]
    assert viejo[0]["despues"] == "Nivel laser DEMO ×1 a $0"  # trabaja sobre una copia
    assert limpiar_precios_sc(nuevo) is None  # aplicarla de nuevo no cambia nada

    notas = [{"campo": "notas", "etiqueta": "Notas", "antes": "Pagar a $5", "despues": "Pagar a $0"}]
    assert limpiar_precios_sc(notas) is None

    mezcla = [
        {"campo": "productos", "etiqueta": "Taladro — cantidad", "antes": "1", "despues": "3"},
        {"campo": "productos", "etiqueta": "Taladro — precio unitario", "antes": "$0", "despues": "$5.000"},
        {"campo": "productos", "etiqueta": "Cuna — total", "antes": "$0", "despues": "$1.000"},
        {"campo": "productos", "etiqueta": "Producto eliminado", "antes": "Coche ×2 a $1.234.567", "despues": None},
        {"campo": "productos", "etiqueta": "Producto agregado", "antes": None, "despues": "Ajuste ×1 a -$5.000"},
        {"campo": "productos_sku", "etiqueta": "Taladro", "antes": "Texto libre", "despues": "SKU 7"},
        {"campo": "notas", "etiqueta": "Notas", "antes": None, "despues": "Precio a $0"},
    ]
    assert limpiar_precios_sc(mezcla) == [
        {"campo": "productos", "etiqueta": "Taladro — cantidad", "antes": "1", "despues": "3"},
        {"campo": "productos", "etiqueta": "Producto eliminado", "antes": "Coche ×2", "despues": None},
        {"campo": "productos", "etiqueta": "Producto agregado", "antes": None, "despues": "Ajuste ×1"},
        {"campo": "productos_sku", "etiqueta": "Taladro", "antes": "Texto libre", "despues": "SKU 7"},
        {"campo": "notas", "etiqueta": "Notas", "antes": None, "despues": "Precio a $0"},
    ]
    assert limpiar_precios_sc(None) is None and limpiar_precios_sc([]) is None


def test_patch_productos_de_la_sc_registra_la_actividad_sin_precio(app_client, db, admin_token):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-T4H26P", customer_name="Cliente Prueba", estado="BORRADOR", productos=[])
    db.add(sc); db.commit(); db.refresh(sc)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "productos": [_linea("Nivel laser DEMO", 1, 0)], "updated_by": "t"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    resp = app_client.get(f"/api/v1/ventas/solicitudes/{sc.id}", headers=auth(admin_token))
    (renglon,) = [a for a in resp.json()["data"]["actividades"] if a["action"] == "UPDATED"]
    assert renglon["extra_data"]["cambios"][0]["despues"] == "Nivel laser DEMO ×1"


# ─── scripts/corregir_actividad_sc_sin_precio.py ─────────────────────────────────────

def _sc(db, numero, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "ASIGNADA")
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, sc=None):
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", estado="BORRADOR",
                         sc_id=sc.id if sc else None, sc_numero=sc.numero if sc else None)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _cambio_viejo(nombre="Nivel laser DEMO", precio="$0"):
    return [{"campo": "productos", "etiqueta": "Producto agregado", "antes": None, "despues": f"{nombre} ×1 a {precio}"}]


def _log(db, entidad, doc, cambios, **extra):
    from app.models.erp_documents import ActivityLog
    log = ActivityLog(entity_type=entidad, entity_id=doc.id, entity_numero=doc.numero, action="UPDATED",
                      description="Solicitud actualizada: Productos", user_name="t",
                      extra_data={"cambios": cambios, **extra})
    db.add(log); db.commit(); db.refresh(log)
    return log


def _extra(db, log_id):
    from sqlalchemy import text
    db.expire_all()
    return db.execute(text("SELECT extra_data FROM activity_logs WHERE id = :i"), {"i": log_id}).scalar()


def _borrar_tabla(db, tabla):
    from sqlalchemy import text
    db.rollback()
    db.execute(text(f"DROP TABLE IF EXISTS {tabla}"))
    db.commit()


def _existe_tabla(db, tabla):
    from sqlalchemy import text
    return db.execute(text("SELECT to_regclass(:t)"), {"t": tabla}).scalar() is not None


def test_script_corrige_respalda_y_es_idempotente(db, user_admin):
    from sqlalchemy import text
    from scripts.corregir_actividad_sc_sin_precio import corregir
    sc = _sc(db, "SC-T4H26A")
    cot = _cot(db, "COT-T4H26A")
    log_sc = _log(db, "SC", sc, _cambio_viejo(), motivo_extra="se conserva")
    log_cot = _log(db, "COT", cot, _cambio_viejo("Coche", "$70.000"))
    original_sc, original_cot = _extra(db, log_sc.id), _extra(db, log_cot.id)
    ids = [log_sc.id, log_cot.id]
    try:
        res = corregir(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_TEST)
        assert res["candidatas"] == 1 and res["corregidas"] == 1
        nuevo = _extra(db, log_sc.id)
        assert nuevo == {"cambios": [{"campo": "productos", "etiqueta": "Producto agregado", "antes": None,
                                      "despues": "Nivel laser DEMO ×1"}], "motivo_extra": "se conserva"}
        assert _extra(db, log_cot.id) == original_cot  # la COT conserva su precio
        respaldo = db.execute(text(f"SELECT id, extra_data_original, extra_data_nueva FROM {TABLA_TEST}")).all()
        assert [(r[0], r[1], r[2]) for r in respaldo] == [(log_sc.id, original_sc, nuevo)]

        res2 = corregir(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_TEST)
        assert res2["candidatas"] == 0 and res2["corregidas"] == 0
        assert db.execute(text(f"SELECT count(*) FROM {TABLA_TEST}")).scalar() == 1
    finally:
        _borrar_tabla(db, TABLA_TEST)


def test_script_en_modo_reporte_no_escribe(db, user_admin):
    from scripts.corregir_actividad_sc_sin_precio import corregir
    sc = _sc(db, "SC-T4H26B")
    log = _log(db, "SC", sc, _cambio_viejo())
    original = _extra(db, log.id)
    res = corregir(db, aplicar=False, ids=[log.id], tabla_respaldo=TABLA_TEST)
    assert res["candidatas"] == 1 and res["corregidas"] == 0
    (ejemplo,) = res["ejemplos"]
    assert ejemplo["id"] == log.id and ejemplo["numero"] == "SC-T4H26B"
    assert ejemplo["antes"] == original["cambios"]
    assert ejemplo["despues"][0]["despues"] == "Nivel laser DEMO ×1"
    assert ejemplo["descripcion"] == "Solicitud actualizada: Productos" and ejemplo["sin_detalle"] is False
    assert _extra(db, log.id) == original
    assert not _existe_tabla(db, TABLA_TEST)  # el reporte ni siquiera crea la tabla de respaldo


def test_script_marca_los_renglones_que_quedan_sin_detalle(db, user_admin):
    """Ronda 1 (6): si a la candidata no le queda ninguna entrada, o su descripcion sigue nombrando 'Productos' sin
    entradas de productos, sale con sin_detalle=True. La seleccion no cambia (siguen siendo candidatas)."""
    from scripts.corregir_actividad_sc_sin_precio import corregir
    sc = _sc(db, "SC-T4H26S")
    precio = {"campo": "productos", "etiqueta": "Nivel — precio unitario", "antes": "$0", "despues": "$5.000"}
    notas = {"campo": "notas", "etiqueta": "Notas", "antes": None, "despues": "Urgente"}
    vacio = _log(db, "SC", sc, [precio])
    solo_notas = _log(db, "SC", sc, [precio, notas])
    con_vinculo = _log(db, "SC", sc, [precio, {"campo": "productos_sku", "etiqueta": "Nivel", "antes": "Texto libre",
                                               "despues": "SKU 7"}])
    normal = _log(db, "SC", sc, _cambio_viejo())
    res = corregir(db, aplicar=False, ids=[vacio.id, solo_notas.id, con_vinculo.id, normal.id])
    assert res["candidatas"] == 4
    marcas = {e["id"]: (e["despues"], e["sin_detalle"]) for e in res["ejemplos"]}
    assert marcas[vacio.id] == ([], True)
    assert marcas[solo_notas.id] == ([notas], True)
    assert marcas[con_vinculo.id][1] is False and marcas[normal.id][1] is False


def test_script_solo_toca_productos_de_renglones_de_sc(db, user_admin):
    """Nunca toca notas, chatter ni motivos: un CHATTER o un renglon sin 'cambios' en lista no es candidato, y en un
    renglon de SC solo cambian las entradas de productos."""
    from app.models.erp_documents import ActivityLog
    from scripts.corregir_actividad_sc_sin_precio import corregir
    sc = _sc(db, "SC-T4H26C")
    chatter = ActivityLog(entity_type="SC", entity_id=sc.id, entity_numero=sc.numero, action="CHATTER",
                          description="Le cotizo el Nivel ×1 a $0", user_name="t", extra_data={"tipo": "NOTA"})
    sin_lista = ActivityLog(entity_type="SC", entity_id=sc.id, entity_numero=sc.numero, action="UPDATED",
                            description="x", user_name="t", extra_data={"cambios": "Producto ×1 a $0"})
    db.add_all([chatter, sin_lista]); db.commit()
    notas = _log(db, "SC", sc, [{"campo": "notas", "etiqueta": "Notas", "antes": None, "despues": "Nivel ×1 a $0"}])
    res = corregir(db, aplicar=False, ids=[chatter.id, sin_lista.id, notas.id], tabla_respaldo=TABLA_TEST)
    assert res["candidatas"] == 0 and res["ejemplos"] == []


def test_script_excluye_documentos_reales_y_soporte(db, user_admin, monkeypatch):
    """R32: DOCUMENTOS_REALES trae exactamente los cuatro numeros reales; lo que se le agregue (y lo vinculado: aqui
    una SC por el numero de su COT) no sale en las candidatas. Las de Soporte Tecnico tampoco; una sin tipo (NULL) si."""
    from sqlalchemy import text
    from scripts import corregir_actividad_sc_sin_precio as modulo
    assert modulo.DOCUMENTOS_REALES == ("SC-20260731", "COT-20260449", "PVEN-20262799", "SC-20260746")
    por_numero = _sc(db, "SC-T4H26X1")
    por_cot = _sc(db, "SC-T4H26X2")
    cot = _cot(db, "COT-T4H26X2", por_cot)
    soporte = _sc(db, "SC-T4H26X3", tipo_solicitud="Soporte Tecnico")
    sin_tipo = _sc(db, "SC-T4H26X4")
    db.execute(text("UPDATE customer_requests SET tipo_solicitud = NULL WHERE id = :i"), {"i": sin_tipo.id})
    db.commit()
    logs = {sc.numero: _log(db, "SC", sc, _cambio_viejo()).id for sc in (por_numero, por_cot, soporte, sin_tipo)}
    ids = list(logs.values())
    res = modulo.corregir(db, aplicar=False, ids=ids)
    assert {e["numero"] for e in res["ejemplos"]} == {"SC-T4H26X1", "SC-T4H26X2", "SC-T4H26X4"}
    assert res["candidatas"] == 3 and res["excluidas"] == 0
    assert modulo.corregir(db, aplicar=False, ids=[logs["SC-T4H26X3"]])["candidatas"] == 0  # Soporte Tecnico
    monkeypatch.setattr(modulo, "DOCUMENTOS_REALES", modulo.DOCUMENTOS_REALES + (por_numero.numero, cot.numero))
    try:
        res = modulo.corregir(db, aplicar=False, ids=ids)
        assert {e["numero"] for e in res["ejemplos"]} == {"SC-T4H26X4"}
        assert res["candidatas"] == 1 and res["excluidas"] == 2
        assert modulo.corregir(db, aplicar=False, ids=[logs["SC-T4H26X1"]])["candidatas"] == 0
        res = modulo.corregir(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_TEST)
        assert res["corregidas"] == 1
        assert _extra(db, logs["SC-T4H26X1"])["cambios"][0]["despues"].endswith(" a $0")
        assert _extra(db, logs["SC-T4H26X4"])["cambios"][0]["despues"] == "Nivel laser DEMO ×1"
    finally:
        _borrar_tabla(db, TABLA_TEST)


def _deshacer_como_el_docstring(db, modulo):
    """Ejecuta tal cual el SQL de deshacer del docstring, solo con la tabla de prueba."""
    from sqlalchemy import text
    deshacer = re.search(r"UPDATE activity_logs a SET extra_data = r\.extra_data_original.*?;", modulo.__doc__, re.S)
    assert deshacer, "el docstring debe traer el SQL de deshacer"
    sql = deshacer.group(0).replace(f"FROM {modulo.TABLA_RESPALDO} r", f"FROM {TABLA_TEST} r")
    assert TABLA_TEST in sql
    db.execute(text(sql))
    db.commit()


def test_script_sql_de_deshacer_del_docstring(db, user_admin):
    """El SQL de deshacer del docstring (ejecutado tal cual, solo con la tabla de prueba) devuelve el original."""
    from scripts import corregir_actividad_sc_sin_precio as modulo
    sc = _sc(db, "SC-T4H26D")
    log = _log(db, "SC", sc, _cambio_viejo())
    original = _extra(db, log.id)
    try:
        assert modulo.corregir(db, aplicar=True, ids=[log.id], tabla_respaldo=TABLA_TEST)["corregidas"] == 1
        assert _extra(db, log.id) != original
        _deshacer_como_el_docstring(db, modulo)
        assert _extra(db, log.id) == original
    finally:
        _borrar_tabla(db, TABLA_TEST)


def test_script_dos_corridas_conservan_el_primer_original_y_la_ultima_nueva(db, user_admin):
    """Ronda 1 (7), rama ON CONFLICT DO UPDATE: corregir, deshacer, el renglon cambia otra vez (otra llave de
    extra_data) y se corrige de nuevo. El respaldo queda con (original de la 1.a corrida, nueva actual) y un segundo
    deshacer devuelve el original de la 1.a corrida (con DO NOTHING la nueva seria la vieja y no deshacia nada)."""
    from sqlalchemy import text
    from scripts import corregir_actividad_sc_sin_precio as modulo
    sc = _sc(db, "SC-T4H26U")
    log = _log(db, "SC", sc, _cambio_viejo())
    original = _extra(db, log.id)
    try:
        assert modulo.corregir(db, aplicar=True, ids=[log.id], tabla_respaldo=TABLA_TEST)["corregidas"] == 1
        nueva_1 = _extra(db, log.id)
        _deshacer_como_el_docstring(db, modulo)
        assert _extra(db, log.id) == original
        db.execute(text("UPDATE activity_logs SET extra_data = CAST(:e AS jsonb) WHERE id = :i"),
                   {"e": json.dumps({**original, "otra": 1}, ensure_ascii=False), "i": log.id})
        db.commit()
        assert modulo.corregir(db, aplicar=True, ids=[log.id], tabla_respaldo=TABLA_TEST)["corregidas"] == 1
        nueva_2 = _extra(db, log.id)
        assert nueva_2 == {**nueva_1, "otra": 1} != nueva_1
        fila = db.execute(text(f"SELECT extra_data_original, extra_data_nueva FROM {TABLA_TEST} WHERE id = :i"),
                          {"i": log.id}).one()
        assert tuple(fila) == (original, nueva_2)
        _deshacer_como_el_docstring(db, modulo)
        assert _extra(db, log.id) == original
    finally:
        _borrar_tabla(db, TABLA_TEST)


def test_script_revierte_todo_si_falla_a_mitad(db, user_admin):
    """Una transaccion: la tabla de respaldo de prueba rechaza la SEGUNDA fila."""
    from sqlalchemy import text
    from scripts.corregir_actividad_sc_sin_precio import corregir
    sc = _sc(db, "SC-T4H26F")
    primera = _log(db, "SC", sc, _cambio_viejo("Primero"))
    segunda = _log(db, "SC", sc, _cambio_viejo("Segundo"))
    originales = [_extra(db, primera.id), _extra(db, segunda.id)]
    db.execute(text(f"CREATE TABLE {TABLA_TEST} (id INTEGER PRIMARY KEY, extra_data_original JSONB NOT NULL, "
                    f"extra_data_nueva JSONB NOT NULL, corregido_at TIMESTAMP DEFAULT now(), "
                    f"CHECK (id <> {int(segunda.id)}))"))
    db.commit()
    try:
        with pytest.raises(Exception):
            corregir(db, aplicar=True, ids=[primera.id, segunda.id], tabla_respaldo=TABLA_TEST)
        assert [_extra(db, primera.id), _extra(db, segunda.id)] == originales
        assert db.execute(text(f"SELECT count(*) FROM {TABLA_TEST}")).scalar() == 0
    finally:
        _borrar_tabla(db, TABLA_TEST)


def test_script_rechaza_un_nombre_de_tabla_de_respaldo_peligroso(db):
    from scripts.corregir_actividad_sc_sin_precio import corregir
    for nombre in ("x; DROP TABLE users", "Tabla-Con-Guion", "1abc", "", "a b", "abc\n", "abc\r\n", None):
        with pytest.raises(ValueError):
            corregir(db, aplicar=False, ids=[1], tabla_respaldo=nombre)


def test_el_reporte_de_corregir_no_escribe_nada(db, user_admin, contador_sql):
    """El modo reporte tal como lo corre main(): READ ONLY primero y despues solo lecturas, sin ningun commit."""
    from scripts.corregir_actividad_sc_sin_precio import _solo_lectura, corregir
    sc = _sc(db, "SC-T4H26Z")
    log = _log(db, "SC", sc, _cambio_viejo())
    contador_sql.reset()
    _solo_lectura(db)
    res = corregir(db, aplicar=False, ids=[log.id])
    assert res["candidatas"] == 1
    sentencias = [s.lstrip().upper() for s in contador_sql.sentencias]
    assert sentencias[0].startswith("SET TRANSACTION READ ONLY"), sentencias[0]
    escrituras = [s for s in sentencias if s.startswith(("INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER"))]
    assert escrituras == []
    assert contador_sql.commits == 0


def _resultado_vacio(**cambios):
    resultado = {"candidatas": 0, "corregidas": 0, "excluidas": 0, "ejemplos": []}
    resultado.update(cambios)
    return resultado


def _correr_main(monkeypatch, argv, resultado=None):
    """main() con corregir reemplazada por una funcion que anota la llamada y si la transaccion es de solo lectura."""
    from sqlalchemy import text
    from scripts import corregir_actividad_sc_sin_precio as modulo
    llamadas = []

    def _corregir(db, aplicar=False, **kwargs):
        llamadas.append((aplicar, db.execute(text("SHOW transaction_read_only")).scalar()))
        return resultado or _resultado_vacio()

    monkeypatch.setattr(modulo, "corregir", _corregir)
    salida, errores = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(errores):
        try:
            codigo = modulo.main(argv)
        except SystemExit as exc:  # argparse
            codigo = exc.code
    return codigo, llamadas, salida.getvalue(), errores.getvalue()


def test_cli_reporta_por_defecto_y_aplicar_exige_la_base(db, monkeypatch):
    """B9: el reporte corre en una transaccion READ ONLY; --aplicar sin --base no corre; con otra base devuelve 2 sin
    escribir; con la base correcta aplica."""
    from sqlalchemy import text
    codigo, llamadas, salida, _ = _correr_main(monkeypatch, [])
    assert codigo == 0 and llamadas == [(False, "on")]
    assert "REPORTE" in salida and "--aplicar --base <nombre de la base>" in salida
    codigo, llamadas, _, errores = _correr_main(monkeypatch, ["--aplicar"])
    assert codigo == 2 and llamadas == [] and "exige --base" in errores
    actual = db.execute(text("SELECT current_database()")).scalar()
    codigo, llamadas, salida, errores = _correr_main(monkeypatch, ["--aplicar", "--base", actual + "_otra"])
    assert codigo == 2 and llamadas == []
    assert f"SELECT current_database() -> {actual}" in salida
    assert "ABORTADO" in errores and "no se escribió nada" in errores
    codigo, llamadas, salida, _ = _correr_main(monkeypatch, ["--aplicar", "--base", actual])
    assert codigo == 0 and llamadas == [(True, "off")] and "Corregidas: 0" in salida


def test_el_reporte_lista_todas_las_candidatas_sin_tope(monkeypatch):
    """Sin tope silencioso: cada candidata con su numero y cada entrada 'antes -> despues' (o la que se quita)."""
    ejemplos = [{"id": i, "numero": f"SC-T4H26R{i:02d}", "created_at": None,
                 "descripcion": "Solicitud actualizada: Productos",
                 "antes": [{"campo": "productos", "etiqueta": "Producto agregado", "antes": None,
                            "despues": f"Producto {i} ×1 a $0"},
                           {"campo": "productos", "etiqueta": f"Producto {i} — precio unitario", "antes": "$0",
                            "despues": "$9"}],
                 "despues": [{"campo": "productos", "etiqueta": "Producto agregado", "antes": None,
                              "despues": f"Producto {i} ×1"}],
                 "sin_detalle": False} for i in range(60)]
    ejemplos[7]["sin_detalle"] = True  # Ronda 1 (6): se marca, no se quita
    codigo, _, salida, _ = _correr_main(monkeypatch, [], _resultado_vacio(candidatas=60, excluidas=3,
                                                                          ejemplos=ejemplos))
    assert codigo == 0
    assert "Candidatas: 60" in salida and "excluidas por documentos reales o vinculadas a ellos: 3" in salida
    for i in range(60):
        assert f"SC-T4H26R{i:02d}" in salida, i
        assert f"{json.dumps(f'Producto {i} ×1 a $0', ensure_ascii=False)} -> " \
               f"{json.dumps(f'Producto {i} ×1', ensure_ascii=False)}" in salida, i
        assert f"se quita «Producto {i} — precio unitario»" in salida, i
    assert salida.count("quedará sin detalle de productos: revisar") == 1
    bloque_7 = salida.split("SC-T4H26R07")[1].split("SC-T4H26R08")[0]
    assert "ATENCIÓN: quedará sin detalle de productos: revisar" in bloque_7
    assert "Candidatas que quedarán sin detalle de productos (revisar; no se borran): 1" in salida
