"""B4.1 T2 (A1-b): el script de datos del Bloque 4.1 (backend/scripts/datos_bloque4_1.py), subcomando catalogo_ids.

--listar corre en una transacción de solo lectura y no hace commits: lista las URL de la tienda que cambian (los SKU del ERP
sin espejo en ecommerce_products, de /store/producto/n a /store/producto/-n) y las historias de Marketing (social_posts)
cuyo producto_id es el id de uno de esos SKU, con su clase (sku, tienda o dudosa), y el comando exacto de --aplicar.
--aplicar pasa de n a -n SOLO el producto_id de las historias aprobadas (sku o dudosa), con respaldo JSON previo (aquí en
tmp_path); con otra base, un id de la tienda, uno ya negativo o sin --ids no escribe nada. Sin la tabla social_posts lo
dice y no escribe. El aviso de producción es el de datos_bloque3.

Las historias se crean con marketing._ensure_marketing_tables y un INSERT en social_posts, dentro de la transacción que el
runner revierte. erp_test es compartida: cada prueba mira SUS filas.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_datos_bloque4_1
"""
import contextlib
import io
import json
import uuid
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import text

MENSAJE_FALTA_IDS = "Falta --ids: aplica solo los ids que el usuario aprobó en el --listar."
MENSAJE_SIN_SOCIAL_POSTS = "La tabla social_posts no existe en esta base: no hay historias que corregir."
AVISO_PRODUCCION = ("AVISO: estás conectado a la base de PRODUCCIÓN (erpdb). La salida trae datos reales: guárdala solo "
                    "en la carpeta datos y no la pegues en el chat.")
DOCUMENTOS_PROTEGIDOS = ("SC-20260731", "COT-20260449", "PVEN-20262799", "SC-20260746", "PXP-20260010")


# ─── ayudas ───────────────────────────────────────────────────────────────────────────────────────────────────

def _db41():
    from scripts import datos_bloque4_1
    return datos_bloque4_1


def _base(db):
    return db.execute(text("SELECT current_database()")).scalar()


def _escrituras(sentencias):
    return [s for s in sentencias if s.strip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]


def _historia(db, producto_id, producto_nombre):
    hid = db.execute(text("INSERT INTO social_posts (tipo, producto_id, producto_nombre) VALUES ('HISTORIA', :p, :n) "
                          "RETURNING id"), {"p": producto_id, "n": producto_nombre}).scalar()
    db.commit()
    return hid


def _producto_id(db, historia):
    return db.execute(text("SELECT producto_id FROM social_posts WHERE id = :i"), {"i": historia}).scalar()


def _historias(db, brand, category):
    """Un SKU sin espejo (id n) y dos historias con producto_id = n: la primera con el nombre del producto (clase sku) y la
    segunda con el nombre de la fila n de ecommerce_products (clase tienda). La fila n existe (si no, se inserta con ese
    id explícito; erp_test es compartida y puede tenerla)."""
    from app.api.v1 import marketing
    from app.models.catalog import Product, ProductSKU
    marketing._ensure_marketing_tables(db)
    s = uuid.uuid4().hex[:8]
    p = Product(brand_id=brand.id, category_id=category.id, name=f"Zz-{s}-Historia", type="Fisico",
                base_currency="USD", uom="Ud")
    db.add(p)
    db.commit()
    k = ProductSKU(product_id=p.id, sku=f"HIS-{s}", cost_price=1, sale_price=10)
    db.add(k)
    db.commit()
    n = k.id
    if db.execute(text("SELECT 1 FROM ecommerce_products WHERE id = :i"), {"i": n}).first() is None:
        db.execute(text("INSERT INTO ecommerce_products (id, nombre, sku, publicado_web) VALUES (:i, :n, :s, TRUE)"),
                   {"i": n, "n": f"Zz-{s}-Tienda", "s": f"TIE-{s}"})
        db.commit()
    nombre_tienda = db.execute(text("SELECT nombre FROM ecommerce_products WHERE id = :i"), {"i": n}).scalar()
    return SimpleNamespace(n=n, sku=k.sku, primera=_historia(db, n, p.name), segunda=_historia(db, n, nombre_tienda))


def _error_de(fn, **kwargs):
    """El texto del ErrorDatos que lanza fn(**kwargs); AssertionError si no lo lanza."""
    try:
        fn(**kwargs)
    except _db41().ErrorDatos as exc:
        return str(exc)
    raise AssertionError(("no lanzó ErrorDatos", kwargs))


# ─── catalogo_ids ─────────────────────────────────────────────────────────────────────────────────────────────

def test_catalogo_ids_listar_en_solo_lectura(db, brand, category, contador_sql):
    db41 = _db41()
    h = _historias(db, brand, category)
    base = _base(db)
    contador_sql.reset()
    l = db41.listar_catalogo_ids(db)
    assert contador_sql.sentencias[0].strip().upper() == "SET TRANSACTION READ ONLY"   # lo primero que corre
    assert _escrituras(contador_sql.sentencias) == [] and contador_sql.commits == 0
    assert db.execute(text("SHOW transaction_read_only")).scalar() == "off"           # termina en rollback
    urls = {f["id"]: f for f in l.seccion("urls").filas}
    assert (urls[h.n]["sku"], urls[h.n]["url_hoy"], urls[h.n]["url_nueva"]) == (
        h.sku, f"/store/producto/{h.n}", f"/store/producto/-{h.n}")
    historias = l.seccion("historias").filas
    clases = {f["id"]: f["clase"] for f in historias}
    assert (clases[h.primera], clases[h.segunda]) == ("sku", "tienda"), clases
    # el comando exacto, con los ids aprobables de ESTE listado (erp_test es compartida: puede traer otras historias)
    dudosa = _historia(db, h.n, "Nombre que no es de ningun lado")
    l = db41.listar_catalogo_ids(db)
    historias = l.seccion("historias").filas
    assert {f["id"]: f["clase"] for f in historias}[dudosa] == "dudosa"
    aprobables = [f["id"] for f in historias if f["clase"] == "sku"]          # B4.1 final (T2 M2): SOLO las sku
    assert h.primera in aprobables and h.segunda not in aprobables and dudosa not in aprobables
    assert [x for x in l.notas if str(dudosa) in x and "NO van en el comando" in x], l.notas
    comando = f"catalogo_ids --aplicar --base {base} --ids {','.join(map(str, aprobables))}"
    assert [x for x in l.notas if x.endswith(comando)], (comando, l.notas)
    # main --listar tampoco escribe e imprime la base
    salida = io.StringIO()
    contador_sql.reset()
    with contextlib.redirect_stdout(salida):
        assert db41.main(["catalogo_ids", "--listar"]) == 0
    texto = salida.getvalue()
    assert _escrituras(contador_sql.sentencias) == [] and contador_sql.commits == 0
    assert f"SELECT current_database() -> {base}" in texto and "***:***@" in texto
    assert any(l_.strip().endswith(comando) for l_ in texto.splitlines()) and "LISTAR: no se escribió nada" in texto
    assert _producto_id(db, h.primera) == h.n


def test_catalogo_ids_aplicar_cambia_solo_los_ids_aprobados(db, brand, category, tmp_path, contador_sql):
    db41 = _db41()
    h = _historias(db, brand, category)
    contador_sql.reset()
    res = db41.aplicar_catalogo_ids(db, _base(db), ids=[h.primera], carpeta_respaldo=tmp_path)
    assert (res.cambiados, res.detalle) == (1, [f"historia {h.primera}: producto_id {h.n} → {-h.n}"])
    assert (_producto_id(db, h.primera), _producto_id(db, h.segunda)) == (-h.n, h.n)
    respaldo = json.loads(Path(res.respaldo).read_text(encoding="utf-8"))
    assert Path(res.respaldo).parent == tmp_path
    assert respaldo["filas"] == [{"id": h.primera, "producto_id": h.n}]
    assert respaldo["como_deshacer"] == ("Por cada fila: UPDATE social_posts SET producto_id = <producto_id> "
                                         "WHERE id = <id>;")
    assert contador_sql.commits == 1                                                    # un solo commit
    assert [s for s in contador_sql.sentencias if "FOR UPDATE" in s.upper()], "no releyó con FOR UPDATE"   # H31
    escrituras = _escrituras(contador_sql.sentencias)
    assert len(escrituras) == 1 and escrituras[0].strip().startswith("UPDATE social_posts SET producto_id"), escrituras


def test_catalogo_ids_con_otra_base_un_id_fuera_de_la_lista_o_sin_ids_no_escribe(db, brand, category, tmp_path,
                                                                                 contador_sql):
    db41 = _db41()
    h = _historias(db, brand, category)
    ya = _historia(db, -h.n, "ya corregida")
    base = _base(db)
    casos = [
        (dict(base="otra_base_que_no_es", ids=[h.primera]),
         f"--base 'otra_base_que_no_es' no coincide con la base a la que está conectado el script ({base!r}): no se "
         f"escribió nada."),
        (dict(base=base, ids=[h.primera, h.segunda]),
         f"catalogo_ids: no se escribió nada. id {h.segunda}: es de la tienda (su nombre es el de la fila {h.n} de "
         f"ecommerce_products): no se toca"),
        (dict(base=base, ids=[ya]),
         f"catalogo_ids: no se escribió nada. id {ya}: su producto_id ya es negativo ({-h.n}): ya se corrigió"),
        (dict(base=base, ids=[2_000_000_000]),
         "catalogo_ids: no se escribió nada. id 2000000000: no está en el listado (su producto_id no es el id de una "
         "fila SKU)"),
        (dict(base=base, ids=[]), MENSAJE_FALTA_IDS),
        (dict(base=base, ids=None), MENSAJE_FALTA_IDS),
    ]
    for kwargs, esperado in casos:
        contador_sql.reset()
        assert _error_de(db41.aplicar_catalogo_ids, db=db, carpeta_respaldo=tmp_path, **kwargs) == esperado, kwargs
        assert _escrituras(contador_sql.sentencias) == [] and contador_sql.commits == 0, kwargs
        assert list(tmp_path.iterdir()) == [], kwargs                                   # ni respaldo
    assert (_producto_id(db, h.primera), _producto_id(db, h.segunda), _producto_id(db, ya)) == (h.n, h.n, -h.n)
    # en la línea de comandos, --aplicar sin --ids ni siquiera llega a la base
    error = io.StringIO()
    with contextlib.redirect_stderr(error):
        try:
            db41.armar_parser().parse_args(["catalogo_ids", "--aplicar", "--base", base])
        except SystemExit:
            pass
        else:
            raise AssertionError("--aplicar sin --ids no salió")
    assert MENSAJE_FALTA_IDS in error.getvalue()


def test_catalogo_ids_sin_la_tabla_social_posts(db, monkeypatch, tmp_path, contador_sql):
    db41 = _db41()
    monkeypatch.setattr(db41, "_hay_social_posts", lambda db_: False)
    contador_sql.reset()
    l = db41.listar_catalogo_ids(db)
    assert MENSAJE_SIN_SOCIAL_POSTS in l.notas and l.seccion("historias").filas == []
    assert MENSAJE_SIN_SOCIAL_POSTS in db41.texto_listado(l)
    assert not [s for s in contador_sql.sentencias if "social_posts" in s]
    contador_sql.reset()
    res = db41.aplicar_catalogo_ids(db, _base(db), ids=[1], carpeta_respaldo=tmp_path)
    assert (res.cambiados, res.detalle, res.respaldo) == (0, [MENSAJE_SIN_SOCIAL_POSTS], None)
    assert _escrituras(contador_sql.sentencias) == [] and contador_sql.commits == 0
    assert list(tmp_path.iterdir()) == []


def test_main_avisa_si_esta_conectado_a_produccion(db, monkeypatch):
    """El AVISO_PRODUCCION de datos_bloque3, arriba de todo, en stdout y en stderr. El Uso dice de dónde sale la base
    (DATABASE_URL), que ALEMBIC_ENV no aplica y cómo deshacer; H31: nombra los documentos protegidos, PXP-20260010
    incluido, y main los imprime."""
    db41 = _db41()
    from scripts import datos_bloque3
    assert (db41.BASE_PRODUCCION, db41.AVISO_PRODUCCION) == ("erpdb", AVISO_PRODUCCION)
    assert db41.AVISO_PRODUCCION is datos_bloque3.AVISO_PRODUCCION and db41.MENSAJE_FALTA_IDS is datos_bloque3.MENSAJE_FALTA_IDS
    assert db41.MENSAJE_SIN_SOCIAL_POSTS == MENSAJE_SIN_SOCIAL_POSTS
    assert tuple(db41.DOCUMENTOS_PROTEGIDOS) == DOCUMENTOS_PROTEGIDOS
    for frase in ("DATABASE_URL", "ALEMBIC_ENV", "UPDATE social_posts SET producto_id = <producto_id> WHERE id = <id>;",
                  *DOCUMENTOS_PROTEGIDOS):
        assert frase in db41.__doc__, frase
    raiz = Path(__file__).resolve().parent.parent.parent                    # la raíz del checkout (backend/..)
    assert db41.CARPETA_DATOS == raiz / ".superpowers" / "sdd" / "2026-11-19-ventas-b4-1-revision-usuario" / "datos"
    monkeypatch.setattr(db41, "base_actual", lambda db_: "erpdb")
    salida, error = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(error):
        codigo = db41.main(["catalogo_ids", "--listar"])
    assert codigo == 0
    texto = salida.getvalue()
    assert AVISO_PRODUCCION in texto and AVISO_PRODUCCION in error.getvalue()
    assert texto.index(AVISO_PRODUCCION) < texto.index("catalogo_ids: ")          # antes de cualquier listado
    assert "Documentos reales protegidos (el script no los lee ni los escribe): " + ", ".join(DOCUMENTOS_PROTEGIDOS) in texto


# ─── updated_at_nulos (A6) ────────────────────────────────────────────────────────────────────────────────────

def _nulos(l):
    return {f["tabla"]: f["nulos"] for f in l.seccion("tablas").filas}


def test_updated_at_nulos_cuenta_en_solo_lectura(db, contador_sql):
    from app.models.erp_documents import CustomerRequest
    db41 = _db41()
    base = _base(db)
    antes = _nulos(db41.listar_updated_at_nulos(db))
    assert set(antes) == {"customer_requests", "sales_quotations", "sale_orders"}
    s = uuid.uuid4().hex[:8]
    sc = CustomerRequest(numero=f"SC-NUL{s}", customer_name="Cliente Nulos", estado="ASIGNADA")
    db.add(sc)
    db.commit()
    db.execute(text("UPDATE customer_requests SET updated_at = NULL WHERE id = :i"), {"i": sc.id})
    db.commit()
    contador_sql.reset()
    l = db41.listar_updated_at_nulos(db)
    assert contador_sql.sentencias[0].strip().upper() == "SET TRANSACTION READ ONLY"
    assert _escrituras(contador_sql.sentencias) == [] and contador_sql.commits == 0
    assert all(s_.strip().upper().startswith(("SELECT", "SET TRANSACTION", "ROLLBACK")) for s_ in contador_sql.sentencias), \
        contador_sql.sentencias
    assert db.execute(text("SHOW transaction_read_only")).scalar() == "off"           # termina en rollback
    despues = _nulos(l)
    assert despues["customer_requests"] == antes["customer_requests"] + 1
    assert (despues["sales_quotations"], despues["sale_orders"]) == (antes["sales_quotations"], antes["sale_orders"])
    n = sum(despues.values())
    assert any(x == f"Hay {n} filas con updated_at vacío: la pastilla de atrasados puede subir al promover (coalesce de "
                    f"M6, ver V1)." for x in l.notas), l.notas
    # con todo en 0, la nota es la de «ninguna»
    assert db41.nota_updated_at_nulos({"customer_requests": 0, "sales_quotations": 0, "sale_orders": 0}) == \
        "Ninguna fila con updated_at vacío: la pastilla de atrasados no sube por el coalesce de M6."
    # main --listar imprime la base y no escribe
    salida = io.StringIO()
    contador_sql.reset()
    with contextlib.redirect_stdout(salida):
        assert db41.main(["updated_at_nulos", "--listar"]) == 0
    texto = salida.getvalue()
    assert _escrituras(contador_sql.sentencias) == [] and contador_sql.commits == 0
    assert f"SELECT current_database() -> {base}" in texto
    assert "LISTAR: no se escribió nada (transacción de solo lectura)." in texto
    # --aplicar no existe en este subcomando
    error = io.StringIO()
    with contextlib.redirect_stderr(error):
        try:
            db41.armar_parser().parse_args(["updated_at_nulos", "--aplicar", "--base", base, "--ids", "1"])
        except SystemExit:
            pass
        else:
            raise AssertionError("updated_at_nulos --aplicar no salió")
    assert error.getvalue()


# ─── vencimientos_sc (B4.1 final, I1) ─────────────────────────────────────────────────────────────────────────

def _sc_con_vencimiento(db, valor, numero=None):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero=numero or f"SC-VEN{uuid.uuid4().hex[:8]}", customer_name="Cliente Vencimiento",
                         estado="ASIGNADA")
    db.add(sc)
    db.commit()
    db.execute(text("UPDATE customer_requests SET fecha_vencimiento = CAST(:v AS timestamp) WHERE id = :i"),
               {"v": valor, "i": sc.id})
    db.commit()
    return sc


def _vencimiento(db, sc):
    return str(db.execute(text("SELECT fecha_vencimiento FROM customer_requests WHERE id = :i"), {"i": sc.id}).scalar())


def test_vencimientos_sc_listar_en_solo_lectura(db, contador_sql):
    db41 = _db41()
    base = _base(db)
    noche = _sc_con_vencimiento(db, "2026-11-25 03:30:00")
    mediodia = _sc_con_vencimiento(db, "2026-11-24 17:00:00")
    limpia = _sc_con_vencimiento(db, "2026-11-24 00:00:00")
    protegida = _sc_con_vencimiento(db, "2026-11-25 03:30:00")
    contador_sql.reset()
    l = db41.listar_vencimientos_sc(db)
    assert contador_sql.sentencias[0].strip().upper() == "SET TRANSACTION READ ONLY"
    assert _escrituras(contador_sql.sentencias) == [] and contador_sql.commits == 0
    assert db.execute(text("SHOW transaction_read_only")).scalar() == "off"
    filas = {f["id"]: f for f in l.seccion("vencimientos").filas}
    assert (filas[noche.id]["dia_hoy"], filas[noche.id]["dia_nuevo"], filas[noche.id]["cambia"]) == (
        "2026-11-25", "2026-11-24", "sí"), filas[noche.id]
    assert (filas[mediodia.id]["dia_hoy"], filas[mediodia.id]["dia_nuevo"], filas[mediodia.id]["cambia"]) == (
        "2026-11-24", "2026-11-24", "no")
    assert limpia.id not in filas                                          # a las 00:00 no se lista
    # una protegida se marca y no entra al comando
    original = db41.SC_PROTEGIDAS
    db41.SC_PROTEGIDAS = original + (protegida.numero,)
    try:
        l = db41.listar_vencimientos_sc(db)
    finally:
        db41.SC_PROTEGIDAS = original
    filas = {f["id"]: f for f in l.seccion("vencimientos").filas}
    assert filas[protegida.id]["protegida"].startswith("protegida")
    comando = [x for x in l.notas if "vencimientos_sc --aplicar" in x][0]
    ids = [int(i) for i in comando.split("--ids ")[1].split(" ")[0].split(",")]
    assert noche.id in ids and mediodia.id in ids and protegida.id not in ids and limpia.id not in ids
    assert any("CAMBIAN de día" in x for x in l.notas)
    salida = io.StringIO()
    contador_sql.reset()
    with contextlib.redirect_stdout(salida):
        assert db41.main(["vencimientos_sc", "--listar"]) == 0
    texto = salida.getvalue()
    assert _escrituras(contador_sql.sentencias) == [] and contador_sql.commits == 0
    assert f"SELECT current_database() -> {base}" in texto
    assert "LISTAR: no se escribió nada (transacción de solo lectura)." in texto
    assert _vencimiento(db, noche) == "2026-11-25 03:30:00"
    error = io.StringIO()
    with contextlib.redirect_stderr(error):
        try:
            db41.armar_parser().parse_args(["vencimientos_sc", "--aplicar", "--base", base])
        except SystemExit:
            pass
        else:
            raise AssertionError("vencimientos_sc --aplicar sin --ids no salió")
    assert MENSAJE_FALTA_IDS in error.getvalue()


def test_vencimientos_sc_aplicar_normaliza_con_respaldo(db, tmp_path):
    db41 = _db41()
    base = _base(db)
    noche = _sc_con_vencimiento(db, "2026-11-25 03:30:00")
    mediodia = _sc_con_vencimiento(db, "2026-11-24 17:00:00")
    limpia = _sc_con_vencimiento(db, "2026-11-24 00:00:00")
    protegida = _sc_con_vencimiento(db, "2026-11-25 03:30:00")
    original = db41.SC_PROTEGIDAS
    db41.SC_PROTEGIDAS = original + (protegida.numero,)
    try:
        # una protegida en --ids aborta sin escribir ni respaldar
        mensaje = _error_de(db41.aplicar_vencimientos_sc, db=db, base=base, ids=[noche.id, protegida.id],
                            carpeta_respaldo=tmp_path)
        assert protegida.numero in mensaje and "no se toca" in mensaje
        assert list(tmp_path.iterdir()) == [] and _vencimiento(db, noche) == "2026-11-25 03:30:00"
        assert _vencimiento(db, protegida) == "2026-11-25 03:30:00"
        # la que ya está a las 00:00 no está en el listado
        assert "no está en el listado" in _error_de(db41.aplicar_vencimientos_sc, db=db, base=base, ids=[limpia.id],
                                                   carpeta_respaldo=tmp_path)
        assert "no coincide" in _error_de(db41.aplicar_vencimientos_sc, db=db, base="otra", ids=[noche.id],
                                          carpeta_respaldo=tmp_path)
        assert _error_de(db41.aplicar_vencimientos_sc, db=db, base=base, ids=[], carpeta_respaldo=tmp_path) == \
            MENSAJE_FALTA_IDS
        res = db41.aplicar_vencimientos_sc(db, base, [noche.id, mediodia.id], carpeta_respaldo=tmp_path)
    finally:
        db41.SC_PROTEGIDAS = original
    assert res.cambiados == 2
    assert _vencimiento(db, noche) == "2026-11-24 00:00:00"
    assert _vencimiento(db, mediodia) == "2026-11-24 00:00:00"
    assert _vencimiento(db, limpia) == "2026-11-24 00:00:00"
    assert _vencimiento(db, protegida) == "2026-11-25 03:30:00"
    respaldo = json.loads(Path(res.respaldo).read_text(encoding="utf-8"))
    anteriores = {f["id"]: f["valor_anterior"] for f in respaldo["filas"]}
    assert anteriores == {noche.id: "2026-11-25 03:30:00", mediodia.id: "2026-11-24 17:00:00"}
    assert "UPDATE customer_requests SET fecha_vencimiento" in respaldo["como_deshacer"]
    # idempotente: ya están a las 00:00
    assert "no está en el listado" in _error_de(db41.aplicar_vencimientos_sc, db=db, base=base, ids=[noche.id],
                                               carpeta_respaldo=tmp_path)
