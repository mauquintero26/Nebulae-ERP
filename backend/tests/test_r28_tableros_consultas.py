"""B4 T24 (R28, hueco H18): las consultas SQL de los dos tableros Kanban en modo servidor, el del Hub de Ventas (4
columnas) y el de Pedidos de venta (6 columnas), con las peticiones EXACTAS que arma el frontend al cargar el tablero.

Peticiones del Hub (frontend/src/app/dashboard/ventas/page.tsx, estado inicial {vista: 'todos', orden: 'atencion'} y
tamano 25):
  - cada columna (useTableroKanban, page.tsx:644-656; consultaColumna de lib/kanban.js:434 y queryListado de
    lib/tabla.js:615): GET /ventas/hub/documentos?vista=todos&orden=atencion&limit=25&offset=0&columna=<clave> en las
    tres abiertas; Cancelado sale plegada (cerrada: true, lib/kanban-ventas.js:306-311): orden=reciente&limit=0;
  - la carga, fuera de las columnas: la lista sin filas con los conteos de las pestañas (useListado con EXTRA_TABLERO,
    page.tsx:628-631: vista=todos&orden=atencion&limit=0&offset=0&con_conteos=1), GET /ventas/flujo (page.tsx:660),
    GET /ventas/stats?periodo=30d (page.tsx:666) y GET /ventas/config (page.tsx:676).
Peticiones de Pedidos de venta (frontend/src/app/dashboard/ventas/venta/venta-client.tsx, el mismo estado inicial):
  - cada columna (venta-client.tsx:382-395; consultaColumnaPedido de lib/kanban-ventas.js:1221): GET /ventas/pedidos?
    vista=todos&estados=<los de la columna>&orden=atencion&limit=25&offset=0; Facturado y Cancelado salen plegadas
    (orden=reciente&limit=0);
  - la carga: la lista sin filas con sus conteos (venta-client.tsx:355-358: vista=todos&orden=atencion&limit=0&offset=0&
    con_conteos=1), GET /ventas/flujo (:368) y GET /ventas/stats?periodo=30d (:374).
Una vez por sesión (no por carga del tablero): GET /preferencias (lib/preferencias.js:524 y :740).

Qué se afirma, para cada tablero:
  1) Ninguna columna hace una consulta por fila (N+1): la misma columna, con sus parámetros reales más q=<sufijo>, hace
     las mismas consultas con pocas filas que con una página llena (25). Cada fila tiene su PROPIO cliente (con
     teléfono, y el documento sin customer_phone: telefono_del_documento lee doc.customer) y su propio documento de
     origen: con uno compartido, la carga perezosa sale del mapa de identidad después de la primera y el conteo no ve
     que falte un selectinload (la lección de m18 en test_consultas_fijas_listas.py).
  2) La carga completa (todas las columnas, con las plegadas en limit=0, más las peticiones de la carga) sobre los datos
     reales de erp_test, y otra vez con documentos sembrados, queda bajo un tope medido: cada petición bajo el suyo (el
     de su peor caso, que la prueba 1 alcanza exacto) y la suma bajo la suma de esos topes (TOPES_* abajo).
El tiempo de pintado (el tope de 3 s de R28) se mide con Playwright en la sesión de capturas, no aquí.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_r28_tableros_consultas): cada prueba va en
una transacción que se revierte. Sin parametrize: las variantes van en un bucle.
"""
import uuid

from app.models.customers import Customer
from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation

RUTA_HUB = "/api/v1/ventas/hub/documentos"
RUTA_PEDIDOS = "/api/v1/ventas/pedidos"
RUTA_FLUJO = "/api/v1/ventas/flujo"
RUTA_STATS = "/api/v1/ventas/stats"
RUTA_CONFIG = "/api/v1/ventas/config"
RUTA_PREFERENCIAS = "/api/v1/preferencias"
POR_COLUMNA = 25   # porColumna = estado.tamano (25 por defecto, ESTADO_TABLA_INICIAL de lib/tabla.js:489)
POCAS = 2          # el mínimo de filas de la medición «pocas» (sube a una por cada tipo y estado de la receta)

# Las columnas del Hub (COLUMNAS_HUB de lib/kanban-ventas.js:306), con lo que cae en cada una por expr_columna_hub
# (core/resolucion_ventas.py:319): (tipo, estado) o (tipo, estado, True) para una SC con una COT activa (auxiliar; D16:
# en Pendiente por confirmación o Confirmada, va a Acción Tomada). Cada receta trae todo lo que su columna PUEDE traer y
# enciende todas sus ramas: En Gestión nunca tiene SC (ningún estado de la SC cae ahí) ni nada en Pendiente por
# confirmación; en Acción Tomada solo la SC puede estar en Pendiente por confirmación (la COT en ese estado va a No
# Resuelto); en Cancelado nada lo está. Cancelado es la única cerrada (plegada al cargar).
COLUMNAS_HUB = {
    "No Resuelto": {"cerrada": False, "receta": [
        ("SC", "ASIGNADA"), ("SC", "PENDIENTE_CONFIRMACION"), ("COT", "BORRADOR"), ("COT", "PENDIENTE_CONFIRMACION"),
        ("VEN", "PENDIENTE_COMPRA")]},
    "En Gestión": {"cerrada": False, "receta": [("COT", "ENVIADA"), ("VEN", "EN_PROCESO"), ("VEN", "EN_TRANSITO")]},
    "Acción Tomada": {"cerrada": False, "receta": [
        ("SC", "CONFIRMADA", True), ("SC", "PENDIENTE_CONFIRMACION", True), ("COT", "CONFIRMADA"),
        ("VEN", "LISTO_ENTREGA"), ("VEN", "ENTREGADO"), ("VEN", "FACTURADO")]},
    "Cancelado": {"cerrada": True, "receta": [
        ("SC", "CANCELADA"), ("COT", "RECHAZADA"), ("VEN", "CANCELADO"), ("VEN", "DEVUELTO_TOTAL")]},
}

# Las columnas de Pedidos (COLUMNAS_PEDIDO de lib/kanban-ventas.js:671): la clave y los estados que manda cada una
# (column.estados, en el orden del frontend). Facturado y Cancelado son las cerradas.
COLUMNAS_PEDIDO = {
    "pend_compra": {"cerrada": False, "estados": [
        "PENDIENTE_COMPRA", "PENDIENTE_PAGO", "BORRADOR", "PENDIENTE_ANTICIPO", "CONFIRMADO"]},
    "en_proceso": {"cerrada": False, "estados": ["EN_PROCESO", "EN_TRANSITO", "PAGADO", "PARCIALMENTE_DISPONIBLE"]},
    "listo_entrega": {"cerrada": False, "estados": [
        "LISTO_ENTREGA", "DISPONIBLE", "PENDIENTE_SALDO", "LISTO_PARA_ENTREGA", "PARCIALMENTE_ENTREGADO"]},
    "entregado": {"cerrada": False, "estados": ["ENTREGADO"]},
    "facturado": {"cerrada": True, "estados": ["FACTURADO"]},
    "cancelado": {"cerrada": True, "estados": ["CANCELADO", "DEVUELTO_TOTAL"]},
}


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _consulta_columna(cerrada, plegada):
    """consultaColumna (lib/kanban.js:434) con ordenDe = (c) => (c.cerrada ? 'reciente' : 'atencion'): la plegada pide
    limit=0; la abierta, porColumna."""
    return {"orden": "reciente" if cerrada else "atencion", "limit": 0 if plegada else POR_COLUMNA, "offset": 0}


def _params_hub(clave, plegada):
    """queryListado(estado, {columna, orden, limit, offset}) del Hub: vista=todos&orden=…&limit=…&offset=0&columna=…"""
    c = _consulta_columna(COLUMNAS_HUB[clave]["cerrada"], plegada)
    return {"vista": "todos", "orden": c["orden"], "limit": c["limit"], "offset": 0, "columna": clave}


def _params_pedido(clave, plegada):
    """consultaColumnaPedido: vista=todos&estados=<CSV de la columna>&orden=…&limit=…&offset=0."""
    c = _consulta_columna(COLUMNAS_PEDIDO[clave]["cerrada"], plegada)
    return {"vista": "todos", "estados": ",".join(COLUMNAS_PEDIDO[clave]["estados"]), "orden": c["orden"],
            "limit": c["limit"], "offset": 0}


# La lista sin filas de la carga del tablero (useListado con EXTRA_TABLERO = {limit: 0} y conConteos).
LISTA_SIN_FILAS = {"vista": "todos", "orden": "atencion", "limit": 0, "offset": 0, "con_conteos": 1}

# Los topes por petición, medidos en T24 R28 con TODAS las ramas que cada columna puede encender (el peor caso; no
# dependen del número de filas, solo de qué hay en la página: cada rama se apaga si la página no trae ese tipo):
#  - columna abierta del Hub = la sesión (1) + días de alerta (1) + total y página (2) + cada tipo de la página con su
#    ficha del cliente en selectinload (2 por tipo) + las COT ligeras de las SC (1, con SC) + los pedidos ligeros (1,
#    con SC o COT) + el seguimiento de las SC y de las COT en Pendiente por confirmación (1 por tipo) + los asesores de
#    H4 de los pedidos (2: sus COT y sus SC). No Resuelto 16 (todo); En Gestión 11 (sin SC ni seguimiento); Acción
#    Tomada 15 (sin el seguimiento de la COT); Cancelado 14 abierta (sin seguimiento) y 3 plegada (limit=0: sesión +
#    días + total). La prueba 1 llega exacto a cada uno;
#  - la lista sin filas del Hub: 5 = sesión + días + pestañas + grupos + total;
#  - columna abierta de Pedidos: 9 = sesión (1) + días (1) + resumen de H47 (2) + total y página (2) + ficha del cliente
#    (1) + asesores de H4 (2); plegada: 5 = sesión + días + resumen (2) + total; la lista sin filas: 6 = la plegada +
#    los conteos de las pestañas;
#  - fijas (agregados, sin filas): /ventas/flujo 20, /ventas/stats 13, /ventas/config 2; /preferencias 2 (una vez por
#    sesión, fuera del total).
TOPES_COLUMNA_HUB = {"No Resuelto": 16, "En Gestión": 11, "Acción Tomada": 15, "Cancelado": 14}
TOPES_HUB = {"columna plegada": 3, "lista sin filas (conteos)": 5, "flujo": 20, "stats": 13, "config": 2,
             **{f"columna {clave}": tope for clave, tope in TOPES_COLUMNA_HUB.items()}}
TOPES_PEDIDOS = {"columna abierta": 9, "columna plegada": 5, "lista sin filas (conteos)": 6, "flujo": 20, "stats": 13}
TOPE_PREFERENCIAS = 2
# El tope de la carga completa = la suma de los topes de sus peticiones tal como salen al cargar: en el Hub, las 3
# abiertas + Cancelado plegada + la lista + flujo + stats + config (16 + 11 + 15 + 3 + 5 + 20 + 13 + 2); en Pedidos, 4
# abiertas + Facturado y Cancelado plegadas + la lista + flujo + stats (4 × 9 + 2 × 5 + 6 + 20 + 13).
TOPE_CARGA_HUB = (sum(t for clave, t in TOPES_COLUMNA_HUB.items() if clave != "Cancelado")
                  + TOPES_HUB["columna plegada"] + sum(v for k, v in TOPES_HUB.items() if not k.startswith("columna ")))
TOPE_CARGA_PEDIDOS = (4 * TOPES_PEDIDOS["columna abierta"] + 2 * TOPES_PEDIDOS["columna plegada"]
                      + sum(v for k, v in TOPES_PEDIDOS.items() if not k.startswith("columna ")))
assert (TOPE_CARGA_HUB, TOPE_CARGA_PEDIDOS) == (85, 85)


def _medir(app_client, token, contador_sql, ruta, params=None):
    """(consultas, cuerpo) de UNA petición: 200, solo SELECT y ningún commit."""
    with contador_sql.ventana() as v:
        resp = app_client.get(ruta, params=params, headers=_auth(token))
    assert resp.status_code == 200, (ruta, params, resp.status_code, resp.text[:500])
    assert v.commits == 0, (ruta, params, v.commits)
    assert all(s.lstrip().upper().startswith("SELECT") for s in v.sentencias), (ruta, params, v.sentencias)
    return v.consultas, resp.json()


class _Siembra:
    """Documentos con un sufijo único (en el número y en el cliente, para aislarlos con q). Cada documento tiene su
    propio Customer (con teléfono; el documento sin customer_phone) y, si se pide, su propio documento auxiliar, que NO
    lleva el sufijo (q no lo trae). Un db.add por objeto (R22)."""

    def __init__(self, db):
        self.db = db
        self.sufijo = uuid.uuid4().hex[:8].upper()
        self.n = 0

    def _numero(self, prefijo):
        self.n += 1
        return f"{prefijo}{self.sufijo}{self.n:02d}"

    def _agregar(self, objeto):
        self.db.add(objeto)
        self.db.flush()
        return objeto

    def _cliente(self):
        marca = uuid.uuid4().hex[:10]
        return self._agregar(Customer(first_name="R28", last_name=marca, email=f"r28-{marca}@test.nebulae",
                                      phone="3001234567"))

    def _cot_auxiliar(self, estado, sc=None):
        """Una COT sin el sufijo: la COT activa de una SC (sc_id, sin sc_numero para que q no la encuentre) o el origen
        de un pedido (su cotizador es el asesor de H4)."""
        aux = uuid.uuid4().hex[:8].upper()
        return self._agregar(SalesQuotation(numero=f"AUX-{aux}", customer_name=f"AUX {aux}", estado=estado,
                                            cotizador=f"Asesora {aux}", sc_id=sc.id if sc is not None else None))

    def _sc_auxiliar(self):
        """Una SC sin el sufijo, origen de un pedido: con sc_id y cot_id, _asesores_de_pedidos hace sus 2 consultas."""
        aux = uuid.uuid4().hex[:8].upper()
        return self._agregar(CustomerRequest(numero=f"AUX-{aux}", customer_name=f"AUX {aux}", estado="CONFIRMADA",
                                             advisor_name=f"Asesor {aux}", tipo_solicitud="Cotizacion de Producto"))

    def documento(self, tipo, estado, con_cot_activa=False):
        cliente = self._cliente()
        comunes = {"customer_name": f"R28 {self.sufijo}", "customer_id": cliente.id, "customer_phone": None,
                   "estado": estado}
        if tipo == "SC":
            sc = self._agregar(CustomerRequest(numero=self._numero("SC-"), tipo_solicitud="Cotizacion de Producto",
                                               **comunes))
            if con_cot_activa:
                self._cot_auxiliar("BORRADOR", sc=sc)   # D16: con una COT activa, Acción Tomada
            return sc
        if tipo == "COT":
            return self._agregar(SalesQuotation(numero=self._numero("COT-"), **comunes))
        sc, cot = self._sc_auxiliar(), self._cot_auxiliar("CONFIRMADA")
        return self._agregar(SaleOrder(numero=self._numero("PV-"), sc_id=sc.id, cot_id=cot.id, **comunes))

    def sembrar(self, receta, n):
        """n documentos de la receta, en ciclo (con n >= len(receta) cada tipo y estado aparece al menos una vez)."""
        for i in range(n):
            self.documento(*receta[i % len(receta)])
        self.db.commit()
        return self.sufijo


# ─── 1) Hub: cada columna hace las mismas consultas con pocas filas que con 25 ──────────────────────────────────────

def test_hub_columnas_sin_consultas_por_fila(app_client, db, admin_token, contador_sql):
    """Cada columna del Hub, con sus parámetros reales (Cancelado abierta: orden=reciente&limit=25) más q=<sufijo>, hace
    el mismo número de consultas con pocas filas que con una página llena de 25."""
    medidas = {}
    for clave, columna in COLUMNAS_HUB.items():
        receta = columna["receta"]
        pocas_filas = max(POCAS, len(receta))
        conteos = []
        for n in (pocas_filas, POR_COLUMNA):
            sufijo = _Siembra(db).sembrar(receta, n)
            consultas, cuerpo = _medir(app_client, admin_token, contador_sql, RUTA_HUB,
                                       {**_params_hub(clave, plegada=False), "q": sufijo})
            assert cuerpo["total"] == n and len(cuerpo["data"]) == n, (clave, n, cuerpo["total"], len(cuerpo["data"]))
            assert {(f["tipo"], f["estado"]) for f in cuerpo["data"]} == {(t, e) for t, e, *_ in receta}, (
                clave, cuerpo["data"][:3])
            conteos.append(consultas)
        medidas[clave] = (pocas_filas, conteos[0], conteos[1])
    print(f"[R28] Hub, consultas por columna (filas pocas, consultas con pocas, con 25): {medidas}", flush=True)
    for clave, (_, pocas, muchas) in medidas.items():
        assert pocas == muchas, (f"N+1 en la columna {clave!r} del Hub: {pocas} consultas con pocas filas y {muchas} "
                                 f"con {POR_COLUMNA}")
        # Cada receta enciende todas las ramas que su columna puede tener: el tope exacto.
        assert muchas == TOPES_COLUMNA_HUB[clave], (clave, muchas, TOPES_COLUMNA_HUB[clave])


# ─── 2) Pedidos de venta: cada columna hace las mismas consultas con pocas filas que con 25 ─────────────────────────

def test_pedidos_columnas_sin_consultas_por_fila(app_client, db, admin_token, contador_sql):
    """Cada columna de Pedidos de venta, con sus parámetros reales (las cerradas abiertas: orden=reciente&limit=25) más
    q=<sufijo>, hace el mismo número de consultas con pocas filas que con una página llena de 25."""
    medidas = {}
    for clave, columna in COLUMNAS_PEDIDO.items():
        receta = [("VEN", e) for e in columna["estados"]]
        pocas_filas = max(POCAS, len(receta))
        conteos = []
        for n in (pocas_filas, POR_COLUMNA):
            sufijo = _Siembra(db).sembrar(receta, n)
            consultas, cuerpo = _medir(app_client, admin_token, contador_sql, RUTA_PEDIDOS,
                                       {**_params_pedido(clave, plegada=False), "q": sufijo})
            assert cuerpo["total"] == n and len(cuerpo["data"]) == n, (clave, n, cuerpo["total"], len(cuerpo["data"]))
            assert {f["estado"] for f in cuerpo["data"]} == set(columna["estados"]), (clave, cuerpo["data"][:3])
            assert all(f["advisor_name"] and f["telefono_whatsapp"] for f in cuerpo["data"]), cuerpo["data"][:3]
            conteos.append(consultas)
        medidas[clave] = (pocas_filas, conteos[0], conteos[1])
    print(f"[R28] Pedidos, consultas por columna (filas pocas, consultas con pocas, con 25): {medidas}", flush=True)
    for clave, (_, pocas, muchas) in medidas.items():
        assert pocas == muchas, (f"N+1 en la columna {clave!r} de Pedidos: {pocas} consultas con pocas filas y "
                                 f"{muchas} con {POR_COLUMNA}")
        # Cada pedido sembrado tiene ficha del cliente, COT y SC de origen: todas las ramas, el tope exacto.
        assert muchas == TOPES_PEDIDOS["columna abierta"], (clave, muchas)


# ─── 3) La carga completa de cada tablero, sobre los datos reales de erp_test ───────────────────────────────────────

def _tope_de_columna(topes, clave, plegada):
    """La clave del tope de una columna: la plegada (limit=0), la propia de la columna (Hub) o la abierta (Pedidos)."""
    if plegada:
        return "columna plegada"
    return f"columna {clave}" if f"columna {clave}" in topes else "columna abierta"


def _peticiones_de_carga(ruta_columnas, columnas, params_de, topes, fijas):
    """[(nombre, clave del tope, ruta, params)] de la carga del tablero: cada columna como sale al cargar (las cerradas
    plegadas, limit=0) y después las peticiones que no son de una columna."""
    peticiones = [(f"columna {clave}", _tope_de_columna(topes, clave, c["cerrada"]), ruta_columnas,
                   params_de(clave, plegada=c["cerrada"])) for clave, c in columnas.items()]
    return peticiones + [(nombre, nombre, ruta, params) for nombre, ruta, params in fijas]


def _medir_carga(app_client, token, contador_sql, peticiones, topes, tope_total, etiqueta):
    """{nombre: consultas} de la carga completa, con cada petición bajo su tope y la suma bajo el de la carga."""
    medidas = {nombre: _medir(app_client, token, contador_sql, ruta, params)[0]
               for nombre, _, ruta, params in peticiones}
    total = sum(medidas.values())
    print(f"[R28] {etiqueta}: {medidas} -> total {total} (tope {tope_total})", flush=True)
    for nombre, tipo, _, _ in peticiones:
        assert medidas[nombre] <= topes[tipo], (etiqueta, nombre, medidas[nombre], topes[tipo])
    assert total <= tope_total, (etiqueta, total, tope_total)
    return medidas


def _fijas(medidas):
    """Las consultas de las peticiones que no son de una columna (no dependen de qué hay en la página)."""
    return {n: c for n, c in medidas.items() if not n.startswith("columna ")}


def test_hub_carga_completa_del_tablero(app_client, db, admin_token, contador_sql):
    """La carga del tablero del Hub (las 4 columnas, Cancelado plegada, más la lista sin filas, el flujo, las tarjetas y
    la configuración) sobre erp_test queda bajo TOPE_CARGA_HUB; después de sembrar un documento de cada tipo y estado de
    cada columna, también, y las peticiones que no son de una columna hacen las mismas consultas (tampoco crecen con
    los documentos). /preferencias (una vez por sesión) va aparte."""
    peticiones = _peticiones_de_carga(RUTA_HUB, COLUMNAS_HUB, _params_hub, TOPES_HUB, [
        ("lista sin filas (conteos)", RUTA_HUB, LISTA_SIN_FILAS), ("flujo", RUTA_FLUJO, None),
        ("stats", RUTA_STATS, {"periodo": "30d"}), ("config", RUTA_CONFIG, None)])
    antes = _medir_carga(app_client, admin_token, contador_sql, peticiones, TOPES_HUB, TOPE_CARGA_HUB,
                         "Hub, carga completa sobre erp_test")
    preferencias = _medir(app_client, admin_token, contador_sql, RUTA_PREFERENCIAS)[0]
    print(f"[R28] /preferencias (una vez por sesión): {preferencias} (tope {TOPE_PREFERENCIAS})", flush=True)
    assert preferencias <= TOPE_PREFERENCIAS, preferencias

    sembrados = 0
    for columna in COLUMNAS_HUB.values():
        _Siembra(db).sembrar(columna["receta"], len(columna["receta"]))
        sembrados += len(columna["receta"])
    despues = _medir_carga(app_client, admin_token, contador_sql, peticiones, TOPES_HUB, TOPE_CARGA_HUB,
                           f"Hub, carga completa con {sembrados} documentos más")
    assert _fijas(antes) == _fijas(despues), (antes, despues)


def test_pedidos_carga_completa_del_tablero(app_client, db, admin_token, contador_sql):
    """La carga del tablero de Pedidos de venta (las 6 columnas, Facturado y Cancelado plegadas, más la lista sin filas,
    el flujo y las tarjetas) sobre erp_test queda bajo TOPE_CARGA_PEDIDOS; después de sembrar un pedido de cada estado
    de las columnas, también, y las peticiones que no son de una columna hacen las mismas consultas."""
    peticiones = _peticiones_de_carga(RUTA_PEDIDOS, COLUMNAS_PEDIDO, _params_pedido, TOPES_PEDIDOS, [
        ("lista sin filas (conteos)", RUTA_PEDIDOS, LISTA_SIN_FILAS), ("flujo", RUTA_FLUJO, None),
        ("stats", RUTA_STATS, {"periodo": "30d"})])
    antes = _medir_carga(app_client, admin_token, contador_sql, peticiones, TOPES_PEDIDOS, TOPE_CARGA_PEDIDOS,
                         "Pedidos, carga completa sobre erp_test")

    receta = [("VEN", e) for c in COLUMNAS_PEDIDO.values() for e in c["estados"]]
    _Siembra(db).sembrar(receta, len(receta))
    despues = _medir_carga(app_client, admin_token, contador_sql, peticiones, TOPES_PEDIDOS, TOPE_CARGA_PEDIDOS,
                           f"Pedidos, carga completa con {len(receta)} pedidos más")
    assert _fijas(antes) == _fijas(despues), (antes, despues)
