"""B4 T13 (TABLA-compras punto 5 y KANBAN-resto para el Kardex; R5, R11, R21, R27; C8; RP8, RP9, RP29, RP54, RP96, D34,
D46): las operaciones de inventario (GET /api/v1/inventory/operations) y el Kardex con dirección múltiple.

- list_inventory_operations: q (search es su alias): el número TRL-0000 o AJU-0000, el id, las notas,
  source_document_numero y tracking_number; status (CSV de DRAFT, READY, DONE y CANCELLED); direccion = entrada | salida
  (la del PRIMER movimiento de la operación, RP96: ADJUST_OUT es salida); orden (id, fecha, status, origen, destino);
  con_conteos por status (con la búsqueda y los filtros de hoy, sin status ni direccion); limit Query(100, ge=0, le=200)
  y por fila «fecha» = MIN(InventoryMovement.created_at) con Z (fechas.iso_z, RP29).
- get_kardex: direction acepta CSV (leer_lista, con los valores conocidos); con un solo valor responde igual que hoy.
Las demás operaciones (la prueba 5 de TABLA-compras va aquí, R27).

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_operaciones_inventario). Las operaciones
de cada prueba van con una bodega propia (warehouse_id=<id>) y un sufijo único.
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi.encoders import jsonable_encoder

from app.models.inventory import InventoryMovement, InventoryOperation, Warehouse
from tests.usuarios_de_prueba import bodega_token, compras_token  # noqa: F401 (fixtures por nombre, RP79)

RUTA = "/api/v1/inventory/operations"
RUTA_KARDEX = "/api/v1/inventory/kardex"
CONTROL = "La búsqueda no puede llevar caracteres de control."


def _utc(*partes):
    return datetime(*partes, tzinfo=timezone.utc)


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _get(app_client, token, ruta=RUTA, **params):
    resp = app_client.get(ruta, params=params, headers=_auth(token))
    assert resp.status_code == 200, (params, resp.status_code, resp.text)
    return resp.json()


def _error(app_client, token, ruta=RUTA, **params):
    resp = app_client.get(ruta, params=params, headers=_auth(token))
    assert resp.status_code == 422, (params, resp.status_code, resp.text)
    return resp.json()["detail"]


def _ids(cuerpo):
    return [o["id"] for o in cuerpo["data"]]


def _guardar(db, objeto):
    db.add(objeto)
    db.commit()
    return objeto


class _Operaciones:
    """Seis operaciones en la bodega w (de la fixture) y una segunda bodega w2 (su nombre ordena antes que el de w):
    - o1 ADJUSTMENT DONE (destino w): ADJUST_IN a las 10:00 y otro ADJUST_IN a las 09:00 del 3 de enero (id mayor): su
      fecha es la MENOR, las 09:00; entrada. Documento de origen AJU-DOC-<sufijo>.
    - o2 ADJUSTMENT DRAFT (destino w): ADJUST_OUT del 5 de enero; salida.
    - o3 ADJUSTMENT DONE (origen w): primero ADJUST_OUT (2 de enero) y luego ADJUST_IN (6 de enero); salida (el primer
      movimiento) y su fecha es la del 2.
    - o4 TRANSFER READY (de w2 a w): TRANSFER_OUT y TRANSFER_IN del 4 de enero; salida.
    - o5 RECEIPT CANCELLED (destino w): un movimiento sin dirección del 1 de enero; ni entrada ni salida. tracking TRK-.
    - o6 DELIVERY DONE (origen w): sin movimientos (fecha None; ni entrada ni salida). notas «nota <sufijo>»."""

    def __init__(self, db, sku, warehouse):
        self.db = db
        self.s = uuid.uuid4().hex[:8].upper()
        self.w = warehouse
        self.w2 = _guardar(db, Warehouse(name=f"BodegaOp-{self.s}", location_type="Remota"))
        self.sku = sku

        def op(tipo, status, origen=None, destino=None, **campos):
            return _guardar(db, InventoryOperation(operation_type=tipo, status=status,
                                                   source_warehouse_id=origen.id if origen else None,
                                                   dest_warehouse_id=destino.id if destino else None, **campos))

        def mov(o, direccion, cuando, bodega=None, cantidad=1):
            return _guardar(db, InventoryMovement(operation_id=o.id, sku_id=sku.id, quantity=cantidad,
                                                  direction=direccion, warehouse_id=(bodega or warehouse).id,
                                                  created_at=cuando, owner="NEBULAE"))

        self.o1 = op("ADJUSTMENT", "DONE", destino=warehouse, source_document_type="AJUSTE",
                     source_document_numero=f"AJU-DOC-{self.s}")
        mov(self.o1, "ADJUST_IN", _utc(2001, 1, 3, 10))
        mov(self.o1, "ADJUST_IN", _utc(2001, 1, 3, 9))
        self.o2 = op("ADJUSTMENT", "DRAFT", destino=warehouse)
        mov(self.o2, "ADJUST_OUT", _utc(2001, 1, 5, 12))
        self.o3 = op("ADJUSTMENT", "DONE", origen=warehouse)
        mov(self.o3, "ADJUST_OUT", _utc(2001, 1, 2, 12))
        mov(self.o3, "ADJUST_IN", _utc(2001, 1, 6, 13))   # el último es el más tardío de todos: la fecha es la MENOR
        self.o4 = op("TRANSFER", "READY", origen=self.w2, destino=warehouse)
        mov(self.o4, "TRANSFER_OUT", _utc(2001, 1, 4, 12), bodega=self.w2)
        mov(self.o4, "TRANSFER_IN", _utc(2001, 1, 4, 12))
        self.o5 = op("RECEIPT", "CANCELLED", destino=warehouse, tracking_number=f"TRK-{self.s}")
        mov(self.o5, None, _utc(2001, 1, 1, 12))
        self.o6 = op("DELIVERY", "DONE", origen=warehouse, notas=f"nota {self.s}")

    def ids(self, *numeros):
        return [getattr(self, f"o{n}").id for n in numeros]


# ─── Prueba 5 de TABLA-compras: fecha, direccion, búsqueda, status y conteos ────────────────────────────────────────

def test_fecha_del_primer_movimiento_con_z(app_client, db, admin_token, sku, warehouse):
    e = _Operaciones(db, sku, warehouse)
    filas = {o["id"]: o for o in _get(app_client, admin_token, warehouse_id=warehouse.id)["data"]}
    assert filas[e.o1.id]["fecha"] == "2001-01-03T09:00:00Z"     # MIN(created_at), no el del primer id
    assert filas[e.o3.id]["fecha"] == "2001-01-02T12:00:00Z"
    assert filas[e.o4.id]["fecha"] == "2001-01-04T12:00:00Z"
    assert filas[e.o6.id]["fecha"] is None                       # sin movimientos
    # POST /operations también trae su fecha (la de sus movimientos), con Z.
    resp = app_client.post(RUTA, json={"operation_type": "ADJUSTMENT", "dest_warehouse_id": warehouse.id,
                                       "movements": [{"sku_id": sku.id, "quantity": 2, "direction": "IN"}]},
                           headers=_auth(admin_token))
    assert resp.status_code == 201, resp.text
    creada = resp.json()["data"]
    assert creada["fecha"] and creada["fecha"].endswith("Z")
    assert {o["id"]: o for o in _get(app_client, admin_token, warehouse_id=warehouse.id)["data"]}[creada["id"]][
        "fecha"] == creada["fecha"]


def test_direccion_del_primer_movimiento(app_client, db, admin_token, sku, warehouse):
    """RP96: la dirección de una operación es la de su PRIMER movimiento (ADJUST_OUT -> salida), la misma regla de la
    pantalla de Ajustes; un primer movimiento sin dirección o una operación sin movimientos no es ninguna de las dos."""
    e = _Operaciones(db, sku, warehouse)
    assert _ids(_get(app_client, admin_token, warehouse_id=warehouse.id, direccion="entrada")) == e.ids(1)
    assert _ids(_get(app_client, admin_token, warehouse_id=warehouse.id, direccion="salida")) == e.ids(4, 3, 2)
    assert _ids(_get(app_client, admin_token, warehouse_id=warehouse.id, direccion=" salida ",
                     operation_type="ADJUSTMENT")) == e.ids(3, 2)
    # Con limit=0, solo el total: así salen aju_entradas y aju_salidas (T19) con dos consultas.
    for direccion, total in (("entrada", 1), ("salida", 2)):
        cuerpo = _get(app_client, admin_token, warehouse_id=warehouse.id, operation_type="ADJUSTMENT",
                      direccion=direccion, limit=0)
        assert (cuerpo["total"], cuerpo["data"]) == (total, []), direccion
    assert _get(app_client, admin_token, warehouse_id=warehouse.id, direccion="", limit=0)["total"] == 6


def test_busqueda_por_documento_numero_notas_y_guia(app_client, db, admin_token, sku, warehouse):
    e = _Operaciones(db, sku, warehouse)

    def buscar(**params):
        return _ids(_get(app_client, admin_token, warehouse_id=warehouse.id, **params))

    assert buscar(q=f"aju-doc-{e.s.lower()}") == e.ids(1)                      # source_document_numero
    assert buscar(q=f"TRK-{e.s}") == e.ids(5)                                   # tracking_number
    assert buscar(q=f"nota {e.s}") == e.ids(6)                                  # notas
    assert buscar(q=f"TRL-{e.o4.id:04d}") == e.ids(4)                           # el número de la pantalla de Traslados
    assert buscar(q=f"AJU-{e.o2.id:04d}") == e.ids(2)                           # el de Ajustes
    assert e.o3.id in buscar(q=str(e.o3.id))                                    # el id como texto
    assert buscar(q=f"TRL-{e.o2.id:04d}") == []                                 # un ajuste no es TRL
    # RP8: q y search dan el mismo total; gana q; los bordes se recortan.
    for params in ({"q": e.s}, {"search": e.s}, {"q": f"  {e.s} "}, {"q": " ", "search": e.s},
                   {"q": e.s, "search": "nada"}):
        assert _get(app_client, admin_token, limit=0, **params)["total"] == 3, params   # o1, o5 y o6
    assert _get(app_client, admin_token, q=f"nota\t{e.s}", limit=0)["total"] == 1      # un tabulador en medio vale


def test_status_conteos_y_filtros_de_hoy(app_client, db, admin_token, sku, warehouse):
    e = _Operaciones(db, sku, warehouse)

    def lista(**params):
        return _get(app_client, admin_token, warehouse_id=warehouse.id, **params)

    assert _ids(lista(status="DONE")) == e.ids(6, 3, 1)
    assert _ids(lista(status="DONE,CANCELLED")) == e.ids(6, 5, 3, 1)
    assert _ids(lista(status=" ready ".upper())) == e.ids(4)
    assert _ids(lista(operation_type="TRANSFER")) == e.ids(4)                    # los filtros de hoy siguen
    cuerpo = lista(con_conteos="true", limit=0)
    assert cuerpo["conteos"] == {"todos": 6, "DRAFT": 1, "READY": 1, "DONE": 3, "CANCELLED": 1}
    # R5: con la búsqueda y los filtros de hoy, sin status ni direccion.
    con_filtros = lista(con_conteos="true", status="DONE", direccion="entrada", limit=0)
    assert con_filtros["total"] == 1 and con_filtros["conteos"] == cuerpo["conteos"]
    assert lista(con_conteos="true", q=e.s, limit=0)["conteos"] == {"todos": 3, "DRAFT": 0, "READY": 0, "DONE": 2,
                                                                     "CANCELLED": 1}
    assert lista(con_conteos="true", operation_type="ADJUSTMENT", limit=0)["conteos"]["todos"] == 3
    assert "conteos" not in lista()


def test_orden_exacto(app_client, db, admin_token, sku, warehouse):
    e = _Operaciones(db, sku, warehouse)

    def orden(valor):
        return _ids(_get(app_client, admin_token, warehouse_id=warehouse.id, orden=valor))

    assert orden("id") == e.ids(1, 2, 3, 4, 5, 6)
    assert orden("-id") == e.ids(6, 5, 4, 3, 2, 1) == _ids(_get(app_client, admin_token, warehouse_id=warehouse.id))
    assert orden("fecha") == e.ids(5, 3, 1, 4, 2, 6)          # sin fecha al final
    assert orden("-fecha") == e.ids(2, 4, 1, 3, 5, 6)
    assert orden("status") == e.ids(2, 4, 6, 3, 1, 5)         # DRAFT, READY, DONE (id desc), CANCELLED
    assert orden("-status") == e.ids(5, 6, 3, 1, 4, 2)
    assert orden("origen") == e.ids(4, 6, 3, 5, 2, 1)         # w2 («BodegaOp») antes que w («BodegaTest»); sin origen al final
    assert orden("destino") == e.ids(5, 4, 2, 1, 6, 3)
    pagina = _get(app_client, admin_token, warehouse_id=warehouse.id, limit=2, offset=1)
    assert pagina["total"] == 6 and _ids(pagina) == e.ids(5, 4)
    assert _get(app_client, admin_token, warehouse_id=warehouse.id, limit=0) == {"status": "success", "total": 6,
                                                                                 "data": []}


def test_errores_en_espanol(app_client, admin_token):
    from app.core.listados import MAX_OFFSET
    from main import MENSAJE_DATOS_INVALIDOS
    muchos = ",".join(f"E{i}" for i in range(21))
    casos = [
        ({"status": "FOO"}, "El estado «FOO» no existe en las operaciones de inventario."),
        ({"status": "DONE,COMPLETADA"}, "El estado «COMPLETADA» no existe en las operaciones de inventario."),
        ({"status": "x" * 300}, f"El estado «{'x' * 40}» no existe en las operaciones de inventario."),
        ({"status": muchos}, "Puedes filtrar por 20 estados como máximo."),
        ({"status": "DO\x00NE"}, CONTROL),
        ({"direccion": "entradas"}, "La dirección «entradas» no existe: usa entrada o salida."),
        ({"direccion": "IN"}, "La dirección «IN» no existe: usa entrada o salida."),
        ({"direccion": "sa\x00lida"}, CONTROL),
        ({"orden": "monto"}, "No se puede ordenar por «monto»."),
        ({"orden": "-atencion"}, "No se puede ordenar por «-atencion»."),
        ({"orden": "-reciente"}, "No se puede ordenar por «-reciente»."),
        ({"q": "\x00"}, CONTROL),
        ({"search": "tra\x00slado"}, CONTROL),
    ]
    for params, texto in casos:
        assert _error(app_client, admin_token, **params) == texto, params
    for params in ({"limit": 201}, {"limit": -1}, {"offset": -1}, {"offset": MAX_OFFSET + 1}, {"warehouse_id": "abc"},
                   {"con_conteos": "quizas"}):
        resp = app_client.get(RUTA, params=params, headers=_auth(admin_token))
        assert resp.status_code == 400 and resp.json()["message"] == MENSAJE_DATOS_INVALIDOS, (params, resp.text)


def test_permisos_y_parametros_declarados(app_client, vendedor_token, compras_token, bodega_token):
    from app.core.listados import MAX_OFFSET
    from main import app
    for token in (vendedor_token, compras_token, bodega_token):
        _get(app_client, token, limit=0)
    assert app_client.get(RUTA).status_code == 401
    caminos = app.openapi()["paths"]
    parametros = {p["name"]: p for p in caminos[RUTA]["get"]["parameters"]}
    assert set(parametros) == {"operation_type", "warehouse_id", "q", "search", "status", "direccion", "orden",
                               "con_conteos", "limit", "offset"}
    limite = parametros["limit"]["schema"]
    assert (limite["default"], limite["minimum"], limite["maximum"]) == (100, 0, 200)
    assert parametros["offset"]["schema"]["maximum"] == MAX_OFFSET
    kardex = {p["name"] for p in caminos[RUTA_KARDEX]["get"]["parameters"]}
    assert kardex == {"sku_id", "warehouse_id", "owner", "direction", "start_date", "end_date", "limit", "offset"}


# ─── R5: sin los parámetros nuevos, la lista responde como hoy (más «fecha») ────────────────────────────────────────

def _hoy_operaciones(db, operation_type=None, warehouse_id=None, limit=100, offset=0):
    """Copia congelada de list_inventory_operations de 16d11a0 (antes de T13), sin la clave nueva «fecha»."""
    from app.schemas import inventory as schemas
    q = db.query(InventoryOperation)
    if operation_type:
        q = q.filter(InventoryOperation.operation_type == operation_type)
    if warehouse_id:
        q = q.filter((InventoryOperation.source_warehouse_id == warehouse_id) |
                     (InventoryOperation.dest_warehouse_id == warehouse_id))
    total = q.count()
    operations = q.order_by(InventoryOperation.id.desc()).offset(offset).limit(limit).all()
    datos = []
    for o in operations:
        fila = schemas.InventoryOperationResponse.model_validate(o).model_dump()
        fila.pop("fecha", None)
        datos.append(fila)
    return {"status": "success", "total": total, "data": datos}


def test_sin_los_parametros_nuevos_responde_como_hoy(app_client, db, admin_token, sku, warehouse):
    """R5: las mismas claves, el mismo total y las mismas filas en el mismo orden con los mismos valores; cada fila suma
    solo «fecha» (la clave nueva de InventoryOperationResponse, aditiva)."""
    _Operaciones(db, sku, warehouse)
    for params in ({"warehouse_id": warehouse.id}, {"warehouse_id": warehouse.id, "operation_type": "ADJUSTMENT"},
                   {"warehouse_id": warehouse.id, "limit": 2, "offset": 1}, {}, {"limit": 0},
                   {"operation_type": "TRANSFER"}):
        nuevo = _get(app_client, admin_token, **params)
        db.expire_all()
        esperado = jsonable_encoder(_hoy_operaciones(db, **params))
        assert set(nuevo) == set(esperado) == {"status", "total", "data"}, params
        assert nuevo["total"] == esperado["total"] and _ids(nuevo) == _ids(esperado), params
        for fila_nueva, fila_hoy in zip(nuevo["data"], esperado["data"]):
            assert set(fila_nueva) - set(fila_hoy) == {"fecha"}, params
            assert {k: v for k, v in fila_nueva.items() if k != "fecha"} == fila_hoy, params


# ─── Kardex: direction en CSV (R11, RP54) ────────────────────────────────────────────────────────────────────────────

def _hoy_kardex(db, sku_id=None, warehouse_id=None, owner=None, direction=None, limit=50, offset=0):
    """Copia congelada de get_kardex de 16d11a0 (antes de T13): un solo valor de direction, por igualdad."""
    from sqlalchemy import func, select
    from app.api.v1.schemas_fase3 import KardexMovementItem
    from app.models.catalog import Product, ProductSKU
    query = (
        select(InventoryMovement.id, InventoryMovement.operation_id, InventoryOperation.operation_type,
               InventoryOperation.source_document_type, InventoryOperation.source_document_numero,
               InventoryMovement.sku_id, ProductSKU.sku, Product.name.label("product_name"), InventoryMovement.quantity,
               InventoryMovement.direction, InventoryMovement.owner, InventoryMovement.warehouse_id,
               Warehouse.name.label("warehouse_name"), ProductSKU.cost_price.label("unit_cost_cop"),
               InventoryMovement.created_at, InventoryMovement.created_by, InventoryMovement.idempotency_key)
        .join(InventoryOperation, InventoryOperation.id == InventoryMovement.operation_id)
        .outerjoin(ProductSKU, ProductSKU.id == InventoryMovement.sku_id)
        .outerjoin(Product, Product.id == ProductSKU.product_id)
        .outerjoin(Warehouse, Warehouse.id == InventoryMovement.warehouse_id)
    )
    if sku_id is not None:
        query = query.where(InventoryMovement.sku_id == sku_id)
    if warehouse_id is not None:
        query = query.where(InventoryMovement.warehouse_id == warehouse_id)
    if owner:
        query = query.where(InventoryMovement.owner == owner.strip().upper())
    if direction:
        query = query.where(InventoryMovement.direction == direction.strip().upper())
    total = db.execute(select(func.count()).select_from(query.subquery())).scalar() or 0
    query = query.order_by(InventoryMovement.created_at.desc(), InventoryMovement.id.desc()).limit(limit).offset(offset)
    rows = db.execute(query).mappings().all()
    items = [KardexMovementItem(
        id=r["id"], operation_id=r["operation_id"], operation_type=r["operation_type"],
        source_document_type=r["source_document_type"], source_document_numero=r["source_document_numero"],
        sku_id=r["sku_id"], sku=r["sku"], product_name=r["product_name"], quantity=Decimal(str(r["quantity"])),
        direction=r["direction"], owner=r["owner"] or "NEBULAE", warehouse_id=r["warehouse_id"],
        warehouse_name=r["warehouse_name"],
        unit_cost_cop=Decimal(str(r["unit_cost_cop"])) if r["unit_cost_cop"] is not None else None,
        created_at=r["created_at"], created_by=r["created_by"], idempotency_key=r["idempotency_key"]) for r in rows]
    return {"status": "success", "data": {"total": total, "limit": limit, "offset": offset,
                                          "items": [it.model_dump() for it in items]}}


def _kardex_de_prueba(db, sku, warehouse):
    op = _guardar(db, InventoryOperation(operation_type="ADJUSTMENT", status="DONE"))
    for i, direccion in enumerate(("IN", "ADJUST_IN", "OUT", "TRANSFER_IN", "SCRAP", None, "ADJUST_OUT",
                                   "QUARANTINE", "RETURN_IN", "TRANSFER_OUT")):
        _guardar(db, InventoryMovement(operation_id=op.id, sku_id=sku.id, quantity=i + 1, direction=direccion,
                                       warehouse_id=warehouse.id, created_at=_utc(2001, 1, 1 + i, 12),
                                       owner="NEBULAE"))


def test_kardex_direction_en_csv(app_client, db, admin_token, sku, warehouse):
    _kardex_de_prueba(db, sku, warehouse)

    def kardex(**params):
        cuerpo = _get(app_client, admin_token, RUTA_KARDEX, sku_id=sku.id, **params)
        assert set(cuerpo) == {"status", "data"} and set(cuerpo["data"]) == {"total", "limit", "offset", "items"}
        return cuerpo["data"]

    dos = kardex(direction="IN,ADJUST_IN")
    assert dos["total"] == 2 and [m["direction"] for m in dos["items"]] == ["ADJUST_IN", "IN"]
    assert kardex(direction=" in , adjust_in ,IN")["items"] == dos["items"]     # minúsculas y repetidos, como hoy
    entradas = kardex(direction="IN,ADJUST_IN,TRANSFER_IN")
    salidas = kardex(direction="OUT,ADJUST_OUT,TRANSFER_OUT")
    assert {m["direction"] for m in entradas["items"]} == {"IN", "ADJUST_IN", "TRANSFER_IN"}
    assert {m["direction"] for m in salidas["items"]} == {"OUT", "ADJUST_OUT", "TRANSFER_OUT"}
    for valor in ("SCRAP", "RETURN_IN", "QUARANTINE"):                            # los valores que escribe el sistema
        assert kardex(direction=valor)["total"] == 1, valor
    assert kardex()["total"] == 10 and kardex(direction=" , ")["total"] == 10


def _como_la_ruta(cuerpo):
    """El JSON que arma FastAPI para una ruta con response_model=dict (el serializador de pydantic en modo json: los
    Decimal salen como texto y los instantes UTC con Z), para comparar con la copia congelada."""
    from pydantic import TypeAdapter
    return TypeAdapter(dict).dump_python(cuerpo, mode="json")


def test_kardex_con_un_solo_valor_responde_como_hoy(app_client, db, admin_token, sku, warehouse):
    _kardex_de_prueba(db, sku, warehouse)
    for params in ({"sku_id": sku.id}, {"sku_id": sku.id, "direction": "IN"}, {"sku_id": sku.id, "direction": "out"},
                   {"sku_id": sku.id, "direction": "ADJUST_OUT", "limit": 1},
                   {"warehouse_id": warehouse.id, "limit": 3, "offset": 2}, {"direction": "TRANSFER_IN"}):
        nuevo = _get(app_client, admin_token, RUTA_KARDEX, **params)
        db.expire_all()
        esperado = _como_la_ruta(_hoy_kardex(db, **params))
        assert nuevo == esperado, (params, nuevo, esperado)
        assert [m["id"] for m in nuevo["data"]["items"]] == [m["id"] for m in esperado["data"]["items"]], params


def test_kardex_errores(app_client, admin_token):
    muchos = ",".join(["IN", "OUT", "ADJUST_IN", "ADJUST_OUT", "TRANSFER_IN", "TRANSFER_OUT", "QUARANTINE", "SCRAP",
                       "RETURN_IN"] + [f"X{i}" for i in range(12)])
    casos = [
        ({"direction": "FOO"}, "La dirección «FOO» no existe en el Kardex."),
        ({"direction": "IN,entrada"}, "La dirección «entrada» no existe en el Kardex."),
        ({"direction": "x" * 300}, f"La dirección «{'x' * 40}» no existe en el Kardex."),
        ({"direction": muchos}, "Puedes filtrar por 20 estados como máximo."),
        ({"direction": "I\x00N"}, CONTROL),
    ]
    for params, texto in casos:
        assert _error(app_client, admin_token, RUTA_KARDEX, **params) == texto, params
