"""B4 T20 (TABLA-otros, TABLA-api y KANBAN-resto con R5, R21; RP8, RP9, RP56, RP58, RP101): las listas de CRM
(GET /crm/leads), E-Commerce (GET /ecommerce/pedidos y /ecommerce/catalogo) y Finanzas (GET /finance/expenses) con
orden por columna, paginacion real (limit, offset y total), `q` (y `search` como alias) y los conteos de Gastos.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_listas_varias_paginadas): cada prueba va en
una transaccion que se revierte. Todo lleva un sufijo unico (uuid) y se busca por el: la base compartida no estorba.
Cada orden afirma el orden EXACTO de las filas, con su desempate (id de la fila, descendente).
"""
import uuid
from datetime import datetime, timedelta

from sqlalchemy import text

from app.api.v1.crm import PipelineStage
from app.core.textos_actividad import ETIQUETAS_ESTADO
from app.models.catalog import Brand, Category, Product, ProductSKU
from app.models.customers import Customer
from app.models.erp_documents import SaleOrder
from app.models.expenses import OperationalExpense
from app.models.fase1b import InventoryOwnerBalance, InventoryReservation
from app.models.sales import SalesOrder
from tests.usuarios_de_prueba import finanzas_token  # noqa: F401 (fixture por nombre)

CONTROL = "La búsqueda no puede llevar caracteres de control."
MAX_ESTADOS = "Puedes filtrar por 20 estados como máximo."


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _obtener(app_client, ruta, token=None, **params):
    return app_client.get(ruta, params=params, headers=_auth(token) if token else {})


def _ok(app_client, ruta, token=None, **params):
    resp = _obtener(app_client, ruta, token, **params)
    assert resp.status_code == 200, (ruta, params, resp.status_code, resp.text)
    return resp.json()


def _error(app_client, ruta, token, codigo=422, **params):
    resp = _obtener(app_client, ruta, token, **params)
    assert resp.status_code == codigo, (ruta, params, resp.status_code, resp.text)
    return resp.json()["detail"] if codigo == 422 else resp.json()


# ═══ 1) CRM: GET /crm/leads ═══════════════════════════════════════════════════════════════════════════════════════════

LEADS = "/api/v1/crm/leads"
CLAVES_LEAD_DE_HOY = ["id", "client", "customer_id", "contact", "email", "phone", "city", "document", "value", "source",
                      "tag", "description", "status", "status_label", "solicitud_tipo", "pipeline_stage_id",
                      "stage_name", "days", "created_at", "updated_at", "lead_product_name", "lead_product_sku_id",
                      "lead_qty", "advisor_name"]


class _Leads:
    """Cinco leads de tres clientes (todos con el apellido Z<sufijo>), con valores, productos, asesores, etapas y fechas
    distintos. L5 es el caso de los NULL: sin producto, sin asesor, sin etapa, sin valor y sin updated_at."""

    def __init__(self, db):
        self.sufijo = uuid.uuid4().hex[:8]
        ahora = datetime.utcnow()
        clientes = {}
        for nombre in ("Ana", "Beto", "Carla"):
            c = Customer(first_name=nombre, last_name=f"Z{self.sufijo}", email=f"{nombre.lower()}-{self.sufijo}@t.nebulae")
            db.add(c)
            clientes[nombre] = c
        a = PipelineStage(name=f"Etapa A {self.sufijo}", color="bg-teal-500", bg_color="bg-teal-50", position=9001,
                          maps_to_status="DRAFT")
        b = PipelineStage(name=f"Etapa B {self.sufijo}", color="bg-pink-500", bg_color="bg-pink-50", position=9002,
                          maps_to_status="DRAFT")
        db.add_all([a, b])
        db.commit()

        def lead(cliente, status, valor, producto, asesor, stage, creado_hace, actualizado_hace):
            o = SalesOrder(customer_id=clientes[cliente].id, status=status, sale_type="ON_DEMAND", lead_value=valor,
                           lead_product_name=producto, advisor_name=asesor, pipeline_stage_id=stage.id if stage else None,
                           created_at=ahora - creado_hace,
                           updated_at=None if actualizado_hace is None else ahora - actualizado_hace)
            db.add(o)
            db.commit()
            if actualizado_hace is None or valor is None:   # el ORM omite un None y deja el default: el NULL va aparte
                db.execute(text("UPDATE sales_orders SET updated_at = CASE WHEN :u THEN NULL ELSE updated_at END, "
                                "lead_value = CASE WHEN :v THEN NULL ELSE lead_value END WHERE id = :i"),
                           {"u": actualizado_hace is None, "v": valor is None, "i": o.id})
                db.commit()
            return o.id

        d = lambda dias: timedelta(days=dias, hours=1)
        self.L1 = lead("Ana", "DRAFT", 300, "Zeta", "Luis", b, d(3), d(10))
        self.L2 = lead("Beto", "DRAFT", 100, "Alfa", None, a, d(4), d(2))
        self.L3 = lead("Carla", "QUOTATION", 200, "Mu", "Ana", None, d(1), d(5))
        self.L4 = lead("Ana", "DRAFT", 200, None, "Luis", b, d(2), d(7))
        self.L5 = lead("Beto", "DRAFT", None, None, None, None, timedelta(hours=12), None)


def _ids(cuerpo):
    return [x["id"] for x in cuerpo["data"]]


def test_leads_orden_exacto_con_su_desempate(app_client, db, admin_token):
    t = _Leads(db)
    L1, L2, L3, L4, L5 = t.L1, t.L2, t.L3, t.L4, t.L5
    esperado = {
        None: [L5, L3, L4, L1, L2],                       # sin orden: created_at desc, como hoy
        "reciente": [L5, L3, L4, L1, L2],
        "sin_movimiento": [L1, L4, L3, L2, L5],           # coalesce(updated_at, created_at) asc
        "cliente": [L4, L1, L5, L2, L3],                  # Ana Z, Ana Z, Beto Z, Beto Z, Carla Z; empates: id desc
        "-cliente": [L3, L5, L2, L4, L1],
        "producto": [L2, L3, L1, L5, L4],                 # Alfa, Mu, Zeta; los sin producto al final (id desc)
        "-producto": [L1, L3, L2, L5, L4],
        "etapa": [L5, L2, L4, L1, L3],                    # Borrador (por status), Etapa A, Etapa B x2, Pendiente...
        "-etapa": [L3, L4, L1, L2, L5],
        "valor": [L5, L2, L4, L3, L1],                    # sin valor = 0; 200 y 200: id desc
        "-valor": [L1, L4, L3, L2, L5],
        "asesor": [L5, L2, L3, L4, L1],                   # sin asesor = ''; Ana; Luis y Luis: id desc
        "-asesor": [L4, L1, L3, L5, L2],                  # Luis y Luis: id desc, luego Ana y los sin asesor
        "dias": [L5, L2, L3, L4, L1],                     # menos dias sin movimiento primero; sin updated_at = 0
        "-dias": [L1, L4, L3, L2, L5],
    }
    for orden, ids in esperado.items():
        params = {"search": t.sufijo, **({"orden": orden} if orden else {})}
        cuerpo = _ok(app_client, LEADS, admin_token, **params)
        assert _ids(cuerpo) == ids, (orden, _ids(cuerpo), ids)
        assert cuerpo["total"] == 5, orden


def test_leads_paginacion(app_client, db, admin_token):
    t = _Leads(db)
    completo = _ids(_ok(app_client, LEADS, admin_token, search=t.sufijo, orden="valor"))
    assert completo == [t.L5, t.L2, t.L4, t.L3, t.L1]
    pag = _ok(app_client, LEADS, admin_token, search=t.sufijo, orden="valor", limit=2, offset=1)
    assert _ids(pag) == [t.L2, t.L4] and pag["total"] == 5
    vistos = []
    for offset in range(5):
        vistos += _ids(_ok(app_client, LEADS, admin_token, search=t.sufijo, orden="valor", limit=1, offset=offset))
    assert vistos == completo                              # dos paginas de tamano 1 no repiten ni pierden ninguna
    assert _ids(_ok(app_client, LEADS, admin_token, search=t.sufijo, orden="valor", offset=5)) == []
    solo_total = _ok(app_client, LEADS, admin_token, search=t.sufijo, limit=0)
    assert solo_total["data"] == [] and solo_total["total"] == 5   # RP101: limit=0 solo el total
    # sin limit sigue valiendo 500 (el Kanban no manda limit)
    assert len(_ids(_ok(app_client, LEADS, admin_token, search=t.sufijo))) == 5


def test_leads_q_y_search_dan_el_mismo_total(app_client, db, admin_token):
    t = _Leads(db)
    por_search = _ok(app_client, LEADS, admin_token, search=t.sufijo)
    por_q = _ok(app_client, LEADS, admin_token, q=t.sufijo)
    assert por_q["total"] == por_search["total"] == 5 and _ids(por_q) == _ids(por_search)
    assert _ok(app_client, LEADS, admin_token, q=f"  {t.sufijo}  ")["total"] == 5     # se recorta
    assert _ok(app_client, LEADS, admin_token, q="   ", search=t.sufijo)["total"] == 5  # un q en blanco no tapa search
    assert _ok(app_client, LEADS, admin_token, q="Zeta", search=t.sufijo)["total"] >= 1  # gana q (producto del lead)
    assert _ok(app_client, LEADS, admin_token, q=f"Zeta {t.sufijo}x")["total"] == 0


def test_leads_claves_de_hoy_y_sc_id_aditivo(app_client, db, admin_token):
    t = _Leads(db)
    cuerpo = _ok(app_client, LEADS, admin_token, search=t.sufijo)
    assert list(cuerpo) == ["status", "data", "total"]
    for lead in cuerpo["data"]:
        assert list(lead) == CLAVES_LEAD_DE_HOY + ["sc_id"], list(lead)
    por_id = {x["id"]: x for x in cuerpo["data"]}
    # los NULL: sin producto, sin asesor, sin etapa y sin valor
    assert por_id[t.L5]["value"] == 0.0 and por_id[t.L5]["advisor_name"] == "" and por_id[t.L5]["lead_product_name"] == ""
    assert por_id[t.L5]["pipeline_stage_id"] is None and por_id[t.L5]["stage_name"] == "Borrador"
    assert por_id[t.L5]["days"] == 0 and por_id[t.L5]["updated_at"] is None
    assert por_id[t.L3]["stage_name"] == "Pendiente por cotizar" and por_id[t.L3]["days"] == 5


def test_leads_errores_422_por_igualdad(app_client, db, admin_token):
    t = _Leads(db)
    casos = [
        ({"orden": "bogus"}, "No se puede ordenar por «bogus»."),
        ({"orden": "-reciente"}, "No se puede ordenar por «-reciente»."),
        ({"orden": "-sin_movimiento"}, "No se puede ordenar por «-sin_movimiento»."),
        ({"orden": "valor;DROP TABLE x"}, "No se puede ordenar por «valor;DROP TABLE x»."),
        ({"q": "ca\x00sa"}, CONTROL),
        ({"search": "ca\x07sa"}, CONTROL),
        ({"advisor_name": "lu\x00is"}, CONTROL),
    ]
    for params, texto in casos:
        assert _error(app_client, LEADS, admin_token, **params) == texto, params
    # los limites numericos de Query dan el 400 legible del manejador global, nunca un 500
    for params in ({"limit": 1001}, {"limit": -1}, {"offset": -1}, {"offset": 1_000_001}, {"limit": "x"},
                   {"stage_id": "x"}, {"customer_id": "x"}):
        assert _obtener(app_client, LEADS, admin_token, **params).status_code == 400, params
    # un id que no existe, o enorme, no es un error
    assert _ok(app_client, LEADS, admin_token, stage_id=2_000_000_000, search=t.sufijo)["total"] == 0
    assert _ok(app_client, LEADS, admin_token, customer_id=2_000_000_000, search=t.sufijo)["total"] == 0
    assert _ok(app_client, LEADS, admin_token, limit=1000, search=t.sufijo)["total"] == 5
    assert _obtener(app_client, LEADS).status_code == 401


# ═══ 2) E-Commerce: GET /ecommerce/pedidos ═══════════════════════════════════════════════════════════════════════════

PEDIDOS = "/api/v1/ecommerce/pedidos"
CLAVES_PEDIDO_WEB = ["id", "numero", "pven_numero", "customer_name", "customer_email", "customer_phone", "total_cop",
                     "estado", "canal_venta", "productos", "created_at"]


class _Pedidos:
    def __init__(self, db):
        self.s = s = uuid.uuid4().hex[:8].upper()
        ahora = datetime.utcnow()

        def web(n, pweb, cliente, total, productos, estado, hace, canal="WEB"):
            o = SaleOrder(numero=f"PV-T{s}{n}", pweb_numero=pweb, canal_venta=canal, customer_name=cliente,
                          customer_email=f"w{n}-{s}@t.nebulae", total_cop=total, productos=productos, estado=estado,
                          created_at=ahora - timedelta(days=hace))
            db.add(o)
            db.commit()
            return o.id

        item = {"product_name": "Cuna", "qty": 1}
        self.W1 = web(1, f"PWEB-{s}A", f"Zoe {s}", 300, [item], "PENDIENTE_PAGO", 1)
        self.W2 = web(2, f"PWEB-{s}B", f"Ana {s}", 100, [item, item, item], "PAGADO", 3)
        self.W3 = web(3, None, None, 50, None, "ENTREGADO", 2)
        self.CRM = web(4, None, f"Otro {s}", 999, [item], "PAGADO", 0, canal="CRM")   # no es de la tienda


def test_pedidos_web_orden_exacto(app_client, db, admin_token):
    t = _Pedidos(db)
    W1, W2, W3 = t.W1, t.W2, t.W3
    flujo = tuple(ETIQUETAS_ESTADO["VEN"])
    por_estado = sorted([(flujo.index(e), i) for i, e in ((W1, "PENDIENTE_PAGO"), (W2, "PAGADO"), (W3, "ENTREGADO"))])
    esperado = {
        None: [W1, W3, W2],                       # created_at desc, como hoy
        "fecha": [W2, W3, W1], "-fecha": [W1, W3, W2],
        "numero": [W3, W1, W2],                   # coalesce(pweb_numero, numero): PV-... antes que PWEB-...
        "-numero": [W2, W1, W3],
        "cliente": [W2, W3, W1],                  # Ana, «Cliente Web» (sin nombre), Zoe
        "-cliente": [W1, W3, W2],
        "total": [W3, W2, W1], "-total": [W1, W2, W3],
        "items": [W3, W1, W2],                    # 0 (sin productos), 1, 3
        "-items": [W2, W1, W3],
        "estado": [i for _, i in por_estado], "-estado": [i for _, i in reversed(por_estado)],
    }
    for orden, ids in esperado.items():
        params = {"search": t.s, **({"orden": orden} if orden else {})}
        cuerpo = _ok(app_client, PEDIDOS, admin_token, **params)
        assert _ids(cuerpo) == ids, (orden, _ids(cuerpo), ids)
        assert cuerpo["total"] == 3, orden
    # limit y offset: dos paginas de tamano 1 no repiten ninguna fila
    vistos = []
    for offset in range(3):
        vistos += _ids(_ok(app_client, PEDIDOS, admin_token, search=t.s, orden="total", limit=1, offset=offset))
    assert vistos == [W3, W2, W1]


def test_pedidos_web_estados_csv_y_limit_cero(app_client, db, admin_token):
    t = _Pedidos(db)
    # KANBAN-resto: estados=PENDIENTE_PAGO,PAGADO con dos pedidos WEB -> trae los dos (el CRM, que tambien esta PAGADO, no)
    dos = _ok(app_client, PEDIDOS, admin_token, search=t.s, estados="PENDIENTE_PAGO,PAGADO")
    assert sorted(_ids(dos)) == sorted([t.W1, t.W2]) and dos["total"] == 2
    assert _ids(_ok(app_client, PEDIDOS, admin_token, search=t.s, estados=" PAGADO , PAGADO ,")) == [t.W2]
    assert _ids(_ok(app_client, PEDIDOS, admin_token, search=t.s, estados="")) == [t.W1, t.W3, t.W2]
    # 'estado' sigue igual que hoy: un valor, por igualdad
    assert _ids(_ok(app_client, PEDIDOS, admin_token, search=t.s, estado="PAGADO")) == [t.W2]
    assert _ids(_ok(app_client, PEDIDOS, admin_token, search=t.s, estado="PAGADO,ENTREGADO")) == []
    # y no se valida que exista (la pantalla de hoy lo manda con nombres que no son del pedido): lista vacia, no 422
    assert _ok(app_client, PEDIDOS, admin_token, search=t.s, estado="PENDIENTE_DESPACHO")["total"] == 0
    assert _ids(_ok(app_client, PEDIDOS, admin_token, search=t.s, estado="  ")) == [t.W1, t.W3, t.W2]
    # limit=0 devuelve solo el total
    cero = _ok(app_client, PEDIDOS, admin_token, search=t.s, estados="PENDIENTE_PAGO,PAGADO", limit=0)
    assert cero["data"] == [] and cero["total"] == 2
    # los demas roles que ya leian
    assert _ok(app_client, PEDIDOS, admin_token, search=t.s)["total"] == 3


def test_pedidos_web_q_search_claves_y_errores(app_client, db, admin_token, vendedor_token):
    t = _Pedidos(db)
    por_search = _ok(app_client, PEDIDOS, admin_token, search=t.s)
    por_q = _ok(app_client, PEDIDOS, admin_token, q=t.s)
    assert por_q["total"] == por_search["total"] == 3 and _ids(por_q) == _ids(por_search)
    assert _ok(app_client, PEDIDOS, vendedor_token, q=t.s)["total"] == 3
    assert list(por_search) == ["status", "total", "data"]
    for fila in por_search["data"]:
        assert list(fila) == CLAVES_PEDIDO_WEB, list(fila)
    sin_nombre = next(f for f in por_search["data"] if f["id"] == t.W3)
    assert sin_nombre["customer_name"] == "Cliente Web" and sin_nombre["productos"] == []
    assert sin_nombre["numero"] == f"PV-T{t.s}3"            # sin PWEB, el numero del pedido

    casos = [
        ({"orden": "x"}, "No se puede ordenar por «x»."),
        ({"orden": "-ZZ"}, "No se puede ordenar por «-ZZ»."),
        ({"estados": ",".join(f"E{i}" for i in range(21))}, MAX_ESTADOS),
        ({"estados": "PAGADO,NOEXISTE"}, "El estado «NOEXISTE» no existe en los pedidos de la tienda."),
        ({"estados": "PA\x00GADO"}, CONTROL),
        ({"estado": "PA\x00GADO"}, CONTROL),
        ({"q": "a\x00b"}, CONTROL),
        ({"search": "a\x1bb"}, CONTROL),
    ]
    for params, texto in casos:
        assert _error(app_client, PEDIDOS, admin_token, **params) == texto, params
    # con exactamente 20 estados conocidos no hay error
    veinte = list(ETIQUETAS_ESTADO["VEN"])[:18]
    assert _ok(app_client, PEDIDOS, admin_token, search=t.s, estados=",".join(veinte))["total"] == 3
    for params in ({"limit": 201}, {"limit": -1}, {"offset": -1}, {"offset": 1_000_001}, {"offset": "x"}):
        assert _obtener(app_client, PEDIDOS, admin_token, **params).status_code == 400, params
    assert _obtener(app_client, PEDIDOS).status_code == 401


# ═══ 3) E-Commerce: GET /ecommerce/catalogo (publico) ═══════════════════════════════════════════════════════════════

CATALOGO = "/api/v1/ecommerce/catalogo"
CLAVES_CATALOGO_CANONICO = ["id", "nombre", "descripcion", "sku", "precio_venta", "precio_comparacion", "descuento_pct",
                            "impuesto_pct", "categoria", "sub_categoria", "marca", "tipo_producto", "imagenes",
                            "atributos", "variantes", "stock_disponible", "modalidad_disponible", "alerta_stock_minimo",
                            "publicado_web", "rastrear_inventario", "seo_titulo", "created_at", "updated_at",
                            "is_low_stock"]


class _Catalogo:
    """P1 (Nevera, stock 7: 10 - 3 reservadas; el saldo de MAU no cuenta) y P2 (Auto, stock 0) son canonicos. M1 es el
    espejo de P1 en ecommerce_products (con stock_disponible 99 que NO debe mandar). H1 y H2 son huerfanos."""

    def __init__(self, db, warehouse):
        self.s = s = uuid.uuid4().hex[:8]
        marca = Brand(name=f"Marca-{s}")
        cat_a, cat_c = Category(name=f"Cat-A-{s}"), Category(name=f"Cat-C-{s}")
        db.add_all([marca, cat_a, cat_c])
        db.commit()

        def producto(nombre, categoria, sku, precio):
            p = Product(brand_id=marca.id, category_id=categoria.id, name=nombre, type="Fisico", base_currency="USD",
                        uom="Ud")
            db.add(p)
            db.commit()
            k = ProductSKU(product_id=p.id, sku=sku, cost_price=1, sale_price=precio)
            db.add(k)
            db.commit()
            return k

        self.nevera = f"Zz-{s}-Nevera"
        self.p1 = producto(self.nevera, cat_a, f"TST-{s}-1", 50)
        self.p2 = producto(f"Zz-{s}-Auto", cat_c, f"TST-{s}-2", 20)
        db.add_all([
            InventoryOwnerBalance(sku_id=self.p1.id, warehouse_id=warehouse.id, owner="NEBULAE", quantity=10),
            InventoryOwnerBalance(sku_id=self.p1.id, warehouse_id=warehouse.id, owner="MAU", quantity=100),
            InventoryReservation(sku_id=self.p1.id, warehouse_id=warehouse.id, owner="NEBULAE", quantity_reserved=3,
                                 status="ACTIVE"),
            InventoryReservation(sku_id=self.p1.id, warehouse_id=warehouse.id, owner="NEBULAE", quantity_reserved=50,
                                 status="RELEASED"),
        ])
        db.commit()

        def ep(nombre, sku, categoria, precio, stock, publicado=True):
            return db.execute(text(
                "INSERT INTO ecommerce_products (nombre, sku, categoria, precio_venta, stock_disponible, publicado_web) "
                "VALUES (:n, :s, :c, :p, :st, :pub) RETURNING id"),
                {"n": nombre, "s": sku, "c": categoria, "p": precio, "st": stock, "pub": publicado}).scalar()

        self.m1 = ep(self.nevera, self.p1.sku, cat_a.name, 50, 99)
        self.h1 = ep(f"Zz-{s}-Huerfano1", f"ORF-{s}-1", f"Cat-B-{s}", 30, 5)
        self.h2 = ep(f"Zz-{s}-Huerfano2", f"ORF-{s}-2", None, 40, 1, publicado=False)
        db.commit()
        self.nombres = {"auto": f"Zz-{s}-Auto", "h1": f"Zz-{s}-Huerfano1", "h2": f"Zz-{s}-Huerfano2",
                        "nevera": self.nevera}


def _nombres(cuerpo):
    return [x["nombre"] for x in cuerpo["data"]]


def _ramas(monkeypatch):
    """Las dos ramas de list_catalogo: la heredada (CATALOGO_LECTURA=legacy, la de hoy) y la canonica."""
    for rama in ("legacy", "canonico"):
        monkeypatch.setenv("CATALOGO_LECTURA", rama)
        yield rama


def test_catalogo_orden_exacto_en_las_dos_ramas(app_client, db, warehouse, monkeypatch):
    t = _Catalogo(db, warehouse)
    n = t.nombres
    esperado = {
        "nombre": [n["auto"], n["h1"], n["h2"], n["nevera"]],
        "-nombre": [n["nevera"], n["h2"], n["h1"], n["auto"]],
        "precio": [n["auto"], n["h1"], n["h2"], n["nevera"]],              # 20, 30, 40, 50
        "-precio": [n["nevera"], n["h2"], n["h1"], n["auto"]],
        "stock": [n["auto"], n["h2"], n["h1"], n["nevera"]],               # 0, 1, 5, 7 (el 99 del espejo NO manda)
        "-stock": [n["nevera"], n["h1"], n["h2"], n["auto"]],
        "sku": [n["h1"], n["h2"], n["nevera"], n["auto"]],                 # ORF-1, ORF-2, TST-1, TST-2
        "-sku": [n["auto"], n["nevera"], n["h2"], n["h1"]],
        "categoria": [n["nevera"], n["h1"], n["auto"], n["h2"]],           # Cat-A, Cat-B, Cat-C, sin categoria al final
    }
    for rama in _ramas(monkeypatch):
        for orden, nombres in esperado.items():
            cuerpo = _ok(app_client, CATALOGO, search=t.s, orden=orden)
            assert _nombres(cuerpo) == nombres, (rama, orden, _nombres(cuerpo))
            assert cuerpo["total"] == 4, (rama, orden)
        # la cifra que se ordena es la que se muestra
        por_nombre = {x["nombre"]: x for x in _ok(app_client, CATALOGO, search=t.s)["data"]}
        assert por_nombre[n["nevera"]]["stock_disponible"] == 7.0, rama
        assert por_nombre[n["auto"]]["stock_disponible"] == 0.0 and por_nombre[n["h1"]]["stock_disponible"] == 5.0, rama


def test_catalogo_paginacion_total_y_claves(app_client, db, warehouse, monkeypatch):
    t = _Catalogo(db, warehouse)
    for rama in _ramas(monkeypatch):
        completo = _nombres(_ok(app_client, CATALOGO, search=t.s, orden="precio"))
        assert len(completo) == 4 and len(set(completo)) == 4, rama      # total = canonicos + huerfanos, sin espejo doble
        vistos = []
        for offset in range(4):
            pag = _ok(app_client, CATALOGO, search=t.s, orden="precio", limit=1, offset=offset)
            assert pag["total"] == 4 and len(pag["data"]) == 1, (rama, offset)
            vistos += _nombres(pag)
        assert vistos == completo, rama                                    # dos paginas de tamano 1 no repiten ninguna
        pag2 = _ok(app_client, CATALOGO, search=t.s, orden="precio", limit=2, offset=1)
        assert _nombres(pag2) == completo[1:3] and pag2["total"] == 4, rama
        assert _ok(app_client, CATALOGO, search=t.s, orden="precio", offset=4)["data"] == [], rama
        cero = _ok(app_client, CATALOGO, search=t.s, limit=0)
        assert cero["data"] == [] and cero["total"] == 4, rama
        # q y search dan el mismo total
        assert _ok(app_client, CATALOGO, q=t.s)["total"] == _ok(app_client, CATALOGO, search=t.s)["total"] == 4, rama
        # H16: las claves de cada fila no cambian, ni su orden, ni la de la respuesta
        cuerpo = _ok(app_client, CATALOGO, search=t.s)
        assert list(cuerpo) == ["status", "total", "data"], rama
        for fila in cuerpo["data"]:
            assert list(fila) == CLAVES_CATALOGO_CANONICO, (rama, list(fila))
        por_nombre = {x["nombre"]: x for x in cuerpo["data"]}
        assert por_nombre[t.nombres["nevera"]]["precio_venta"] == 50.0 and por_nombre[t.nombres["nevera"]]["sku"] == t.p1.sku
        if rama == "canonico":
            assert por_nombre[t.nombres["h1"]]["id"] == -t.h1                  # el huerfano canonico lleva el id negativo


def test_catalogo_orden_de_hoy_sin_parametros_nuevos(app_client, db, warehouse, monkeypatch):
    """Sin `orden`, el orden de hoy: en la rama heredada primero los de ecommerce_products por nombre y luego los SKU
    canonicos que no estan alli; en la canonica primero los SKU por nombre y luego los huerfanos por nombre."""
    t = _Catalogo(db, warehouse)
    n = t.nombres
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    assert _nombres(_ok(app_client, CATALOGO, search=t.s)) == [n["h1"], n["h2"], n["nevera"], n["auto"]]
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    assert _nombres(_ok(app_client, CATALOGO, search=t.s)) == [n["auto"], n["nevera"], n["h1"], n["h2"]]


def test_catalogo_filtros_de_hoy_y_errores(app_client, db, warehouse, monkeypatch):
    t = _Catalogo(db, warehouse)
    n = t.nombres
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    assert _nombres(_ok(app_client, CATALOGO, search=t.s, categoria=f"Cat-B-{t.s}")) == [n["h1"]]
    assert _nombres(_ok(app_client, CATALOGO, search=t.s, categoria=f"Cat-A-{t.s}")) == [n["nevera"]]
    assert _nombres(_ok(app_client, CATALOGO, search=t.s, publicado="false")) == [n["h2"]]
    assert sorted(_nombres(_ok(app_client, CATALOGO, search=t.s, publicado="true"))) == sorted(
        [n["auto"], n["nevera"], n["h1"]])
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    # rama heredada: los SKU canonicos que no estan en ecommerce_products solo se filtran por la busqueda (como hoy)
    assert _nombres(_ok(app_client, CATALOGO, search=t.s, categoria=f"Cat-B-{t.s}")) == [n["h1"], n["auto"]]
    assert _nombres(_ok(app_client, CATALOGO, search=t.s, publicado="false")) == [n["h2"], n["auto"]]
    for rama in _ramas(monkeypatch):
        casos = [
            ({"orden": "x"}, "No se puede ordenar por «x»."),
            ({"orden": "-ZZ"}, "No se puede ordenar por «-ZZ»."),
            ({"q": "a\x00b"}, CONTROL),
            ({"search": "a\x00b"}, CONTROL),
            ({"categoria": "a\x00b"}, CONTROL),
        ]
        for params, texto in casos:
            assert _error(app_client, CATALOGO, None, **params) == texto, (rama, params)
        for params in ({"limit": 501}, {"limit": -1}, {"offset": -1}, {"offset": 1_000_001}, {"limit": "x"}):
            assert _obtener(app_client, CATALOGO, None, **params).status_code == 400, (rama, params)
        assert _ok(app_client, CATALOGO, limit=500, search=t.s)["total"] == 4, rama


# ═══ 4) Finanzas: GET /finance/expenses ═════════════════════════════════════════════════════════════════════════════

GASTOS = "/api/v1/finance/expenses"
CLAVES_GASTO_DE_HOY = ["category", "description", "amount", "incurred_date", "is_recurring", "id"]


class _Gastos:
    """E1 recurrente de Arriendo; E2 de Servicios; E3 de Arriendo; E4 sin fecha ni descripcion."""

    def __init__(self, db):
        self.s = s = uuid.uuid4().hex[:8]
        self.arriendo, self.servicios = f"Arriendo-{s}", f"Servicios-{s}"

        def gasto(categoria, descripcion, monto, fecha, recurrente):
            g = OperationalExpense(category=categoria, description=descripcion, amount=monto, incurred_date=fecha,
                                   is_recurring=recurrente)
            db.add(g)
            db.commit()
            if fecha is None:    # el ORM omite un None y deja el default (utcnow): el NULL se escribe aparte
                db.execute(text("UPDATE operational_expenses SET incurred_date = NULL WHERE id = :i"), {"i": g.id})
                db.commit()
            return g.id

        self.E1 = gasto(self.arriendo, f"Alquiler {s}", 100, datetime(2001, 1, 3, 17), True)
        self.E2 = gasto(self.servicios, f"Luz {s}", 50, datetime(2001, 1, 5, 17), False)
        self.E3 = gasto(self.arriendo, f"Bodega {s}", 70, datetime(2001, 1, 4, 17), False)
        self.E4 = gasto(self.servicios, None, 10, None, False)


def test_gastos_orden_exacto_y_por_defecto(app_client, db, admin_token):
    t = _Gastos(db)
    E1, E2, E3, E4 = t.E1, t.E2, t.E3, t.E4
    esperado = {
        None: [E2, E3, E1, E4],                    # fecha desc por defecto; sin fecha al final
        "-fecha": [E2, E3, E1, E4],
        "fecha": [E1, E3, E2, E4],
        "monto": [E4, E2, E3, E1], "-monto": [E1, E3, E2, E4],
        "categoria": [E3, E1, E4, E2],             # Arriendo (E3, E1 por id desc) y Servicios (E4, E2)
        "-categoria": [E4, E2, E3, E1],
        "concepto": [E1, E3, E2, E4],              # description: Alquiler, Bodega, Luz; sin descripcion al final
        "-concepto": [E2, E3, E1, E4],
        "tipo": [E4, E3, E2, E1],                  # is_recurring: false (id desc) y luego true
        "-tipo": [E1, E4, E3, E2],
    }
    for orden, ids in esperado.items():
        cuerpo = _ok(app_client, GASTOS, admin_token, q=t.s, **({"orden": orden} if orden else {}))
        assert _ids(cuerpo) == ids, (orden, _ids(cuerpo), ids)
        assert cuerpo["total"] == 4, orden


def test_gastos_paginacion_filtros_y_sin_limit(app_client, db, admin_token, finanzas_token):
    t = _Gastos(db)
    E1, E2, E3, E4 = t.E1, t.E2, t.E3, t.E4
    pag = _ok(app_client, GASTOS, admin_token, q=t.s, limit=2, offset=1)
    assert _ids(pag) == [E3, E1] and pag["total"] == 4
    vistos = []
    for offset in range(4):
        vistos += _ids(_ok(app_client, GASTOS, admin_token, q=t.s, limit=1, offset=offset))
    assert vistos == [E2, E3, E1, E4]
    cero = _ok(app_client, GASTOS, admin_token, q=t.s, limit=0)
    assert cero["data"] == [] and cero["total"] == 4
    # sin limit devuelve todo (RP101), no 50 ni 200
    todo = _ok(app_client, GASTOS, finanzas_token)
    assert len(todo["data"]) == todo["total"] >= 4
    assert len(_ok(app_client, GASTOS, admin_token, q=t.s)["data"]) == 4
    # q busca en la categoria y en la descripcion (RP58), sin importar mayusculas
    assert _ids(_ok(app_client, GASTOS, admin_token, q=f"alquiler {t.s}")) == [E1]
    assert _ids(_ok(app_client, GASTOS, admin_token, q=t.servicios.upper())) == [E2, E4]
    assert _ids(_ok(app_client, GASTOS, admin_token, q=f"  Luz {t.s} ")) == [E2]
    # categoria por igualdad; tipo recurrente | variable
    assert _ids(_ok(app_client, GASTOS, admin_token, q=t.s, categoria=t.arriendo)) == [E3, E1]
    assert _ids(_ok(app_client, GASTOS, admin_token, q=t.s, categoria=t.arriendo.lower())) == []
    assert _ids(_ok(app_client, GASTOS, admin_token, q=t.s, tipo="recurrente")) == [E1]
    assert _ids(_ok(app_client, GASTOS, admin_token, q=t.s, tipo="variable")) == [E2, E3, E4]
    assert _ids(_ok(app_client, GASTOS, admin_token, q=t.s, tipo=" variable ", categoria=t.arriendo)) == [E3]
    # con_conteos: {categoria: n} con q y tipo, SIN categoria ni limit ni offset
    cuerpo = _ok(app_client, GASTOS, admin_token, q=t.s, con_conteos="true", categoria=t.arriendo, limit=1, offset=1)
    assert cuerpo["conteos"] == {t.arriendo: 2, t.servicios: 2} and cuerpo["total"] == 2
    assert _ok(app_client, GASTOS, admin_token, q=t.s, con_conteos="true", tipo="recurrente")["conteos"] == {
        t.arriendo: 1}
    assert "conteos" not in _ok(app_client, GASTOS, admin_token, q=t.s)


def test_gastos_claves_errores_y_permisos(app_client, db, admin_token, vendedor_token, finanzas_token):
    t = _Gastos(db)
    cuerpo = _ok(app_client, GASTOS, admin_token, q=t.s)
    assert list(cuerpo) == ["status", "data", "total"]                  # `total` es la unica clave nueva (aditiva)
    for fila in cuerpo["data"]:
        assert list(fila) == CLAVES_GASTO_DE_HOY, list(fila)
    sin_fecha = next(f for f in cuerpo["data"] if f["id"] == t.E4)
    assert sin_fecha["incurred_date"] is None and sin_fecha["description"] is None
    casos = [
        ({"tipo": "otro"}, "El tipo debe ser recurrente o variable."),
        ({"tipo": "RECURRENTE"}, "El tipo debe ser recurrente o variable."),
        ({"tipo": "re\x00currente"}, CONTROL),
        ({"orden": "x"}, "No se puede ordenar por «x»."),
        ({"orden": "-ZZ"}, "No se puede ordenar por «-ZZ»."),
        ({"q": "a\x00b"}, CONTROL),
        ({"categoria": "a\x00b"}, CONTROL),
    ]
    for params, texto in casos:
        assert _error(app_client, GASTOS, admin_token, **params) == texto, params
    for params in ({"limit": 201}, {"limit": -1}, {"offset": -1}, {"offset": 1_000_001}, {"limit": "x"}):
        assert _obtener(app_client, GASTOS, admin_token, **params).status_code == 400, params
    assert _obtener(app_client, GASTOS, vendedor_token).status_code == 403
    assert _obtener(app_client, GASTOS).status_code == 401
    assert _ids(_ok(app_client, GASTOS, finanzas_token, q=t.s))[0] == t.E2
