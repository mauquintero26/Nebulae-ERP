"""B4 T24 (R28, hueco H18): las consultas SQL de los tableros Kanban de Ventas en modo servidor, con las peticiones
EXACTAS que arma el frontend al cargar el tablero: el Hub de Ventas (4 columnas), Pedidos de venta (6) y, desde la r1
(m6), Solicitudes (5) y Cotizaciones (5).

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
Peticiones de Solicitudes (frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx, estado inicial
{vista: 'activas', orden: 'atencion'}):
  - cada columna (solicitud-client.tsx:1107-1120; consultaColumnaSC de lib/kanban-ventas.js:937 con
    VISTA_TABLERO_SC = 'todas_sin_soporte', :924; COLUMNAS_SC :809-818): GET /ventas/solicitudes?
    vista=todas_sin_soporte&estados=<los de la columna>&orden=atencion&limit=25&offset=0; Cancelada sale plegada
    (orden=reciente&limit=0);
  - la carga: la lista sin filas con conteos y resumen (solicitud-client.tsx:548 y :1080-1084: vista=activas&
    orden=atencion&limit=0&offset=0&con_conteos=1&con_resumen=1) y GET /ventas/flujo (:1100).
Peticiones de Cotizaciones (frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx, estado inicial
{vista: 'activas', orden: 'atencion'}):
  - cada columna (cotizacion-client.tsx:1110-1123; consultaColumnaCOT de lib/kanban-ventas.js:1024 con
    VISTA_TABLERO_COT = 'todas', :1011; COLUMNAS_COT :735-741): GET /ventas/cotizaciones?vista=todas&estados=<los de la
    columna>&orden=atencion&limit=25&offset=0; Rechazada sale plegada (orden=reciente&limit=0);
  - la carga: la lista sin filas con conteos y resumen (cotizacion-client.tsx:874 y :1091-1094: vista=activas&
    orden=atencion&limit=0&offset=0&con_conteos=1&con_resumen=1) y GET /ventas/flujo (:1104).
Fuera del tablero (marco de la app; no se cuentan aquí): GET /auth/me (components/AuthGuard.tsx:36), GET
/ventas/alertas/resumen (components/AlertasBadge.tsx:41, en el Sidebar) y GET /preferencias, una vez por sesión
(lib/preferencias.js:524 y :740), que sí se mide. En una carga en frío /auth/me y /preferencias van antes que las
columnas (el tablero espera a `listo`).

Qué se afirma, para cada tablero:
  1) Ninguna columna hace una consulta por fila (N+1): la misma columna, con sus parámetros reales más q=<sufijo>, hace
     las mismas consultas con pocas filas que con una página llena (25), y exactamente su tope. Cada fila tiene su
     PROPIO cliente (con teléfono, y el documento sin customer_phone: telefono_del_documento lee doc.customer) y cada
     pedido sus propios documentos de origen: con uno compartido, la carga perezosa sale del mapa de identidad después
     de la primera y el conteo no ve que falte un selectinload (la lección de m18 en test_consultas_fijas_listas.py).
     Se afirma también que la siembra obliga a leer la ficha del cliente: telefono_whatsapp en todas las filas y
     advisor_name en las de pedidos (r1, m1 y m11).
  2) La carga completa (todas las columnas, con las cerradas plegadas como salen, más las peticiones de la carga) sobre
     erp_test, otra vez con documentos sembrados y otra con TODAS las columnas abiertas (las plegadas son una
     preferencia del usuario, r1 m3): cada petición queda bajo su tope (TABLEROS más abajo), y las que no son de una
     columna hacen las mismas consultas antes y después de sembrar. El total de la carga se imprime con su tope
     derivado (la suma de los topes por petición); el control va por petición (r1, m2 y m10).
El tiempo de pintado (el tope de 3 s de R28) se mide con Playwright en la sesión de capturas, no aquí.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_r28_tableros_consultas): cada prueba va en
una transacción que se revierte. Sin parametrize: las variantes van en un bucle.
"""
import uuid

from app.models.customers import Customer
from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation

RUTA_HUB = "/api/v1/ventas/hub/documentos"
RUTA_PEDIDOS = "/api/v1/ventas/pedidos"
RUTA_SOLICITUDES = "/api/v1/ventas/solicitudes"
RUTA_COTIZACIONES = "/api/v1/ventas/cotizaciones"
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

# Las columnas de las listas, con los estados que manda cada una (column.estados, en el orden del frontend) y cuáles
# son cerradas (plegadas al cargar):
#  - Pedidos: COLUMNAS_PEDIDO de lib/kanban-ventas.js:671;
#  - Solicitudes: COLUMNAS_SC de lib/kanban-ventas.js:809 (Confirmada lleva los heredados de SC_CONFIRMADAS);
#  - Cotizaciones: COLUMNAS_COT de lib/kanban-ventas.js:735.
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
COLUMNAS_SC = {
    "nueva": {"cerrada": False, "estados": ["BORRADOR"]},
    "asignada": {"cerrada": False, "estados": ["ASIGNADA"]},
    "pendiente": {"cerrada": False, "estados": ["PENDIENTE_CONFIRMACION"]},
    "confirmada": {"cerrada": False, "estados": [
        "CONFIRMADA", "COTIZADA", "EN_ESPERA_CONFIRMACION", "RECHAZADA", "VENCIDA"]},
    "cancelada": {"cerrada": True, "estados": ["CANCELADA"]},
}
COLUMNAS_COT = {
    "borrador": {"cerrada": False, "estados": ["BORRADOR"]},
    "esperando": {"cerrada": False, "estados": ["PENDIENTE_CONFIRMACION", "ENVIADA"]},
    "confirmada": {"cerrada": False, "estados": ["CONFIRMADA"]},
    "vencida": {"cerrada": False, "estados": ["VENCIDA"]},
    "rechazada": {"cerrada": True, "estados": ["RECHAZADA"]},
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


def _params_por_estados(columnas, vista):
    """consultaColumnaPedido, consultaColumnaSC y consultaColumnaCOT: vista=<la del tablero>&estados=<CSV de la
    columna>&orden=…&limit=…&offset=0."""
    def params(clave, plegada):
        c = _consulta_columna(columnas[clave]["cerrada"], plegada)
        return {"vista": vista, "estados": ",".join(columnas[clave]["estados"]), "orden": c["orden"],
                "limit": c["limit"], "offset": 0}
    return params


_params_pedido = _params_por_estados(COLUMNAS_PEDIDO, "todos")                # VISTA_TABLERO_PEDIDO
_params_sc = _params_por_estados(COLUMNAS_SC, "todas_sin_soporte")            # VISTA_TABLERO_SC
_params_cot = _params_por_estados(COLUMNAS_COT, "todas")                      # VISTA_TABLERO_COT

# La lista sin filas de la carga del tablero (useListado con EXTRA_TABLERO = {limit: 0}): con los conteos en el Hub y en
# Pedidos (vista todos); con conteos y resumen en Solicitudes y Cotizaciones (vista activas).
LISTA_SIN_FILAS = {"vista": "todos", "orden": "atencion", "limit": 0, "offset": 0, "con_conteos": 1}
LISTA_SIN_FILAS_CON_RESUMEN = {"vista": "activas", "orden": "atencion", "limit": 0, "offset": 0, "con_conteos": 1,
                               "con_resumen": 1}

# Los topes por petición, medidos en T24 R28 con TODAS las ramas que cada columna puede encender (el peor caso; no
# dependen del número de filas, solo de qué hay en la página: cada rama se apaga si la página no trae ese tipo). La
# prueba 1 de cada tablero llega exacto al tope de cada columna abierta.
#  - Columna abierta del Hub = la sesión (1) + días de alerta (1) + total y página (2) + cada tipo de la página con su
#    ficha del cliente en selectinload (2 por tipo) + las COT ligeras de las SC (1, con SC) + los pedidos ligeros (1,
#    con SC o COT) + el seguimiento de las SC y de las COT en Pendiente por confirmación (1 por tipo) + los asesores de
#    H4 de los pedidos (2: sus COT y sus SC). No Resuelto 16 (todo); En Gestión 11 (sin SC ni seguimiento); Acción
#    Tomada 15 (sin el seguimiento de la COT); Cancelado 14 (sin seguimiento).
#  - Columna abierta de Pedidos: 9 = sesión (1) + días (1) + resumen de H47 (2) + total y página (2) + ficha del cliente
#    (1) + asesores de H4 (2).
#  - Columna abierta de Solicitudes: 7 = sesión (1) + días (1) + total y página (2) + ficha del cliente (1) + COT
#    ligeras (1) + pedidos ligeros (1); Pendiente por confirmación 8 (+ seguimiento).
#  - Columna abierta de Cotizaciones: 6 = sesión (1) + días (1) + total y página (2) + ficha del cliente (1) + pedidos
#    ligeros (1); Esperando al cliente 7 (+ seguimiento).
#  - Columna plegada (limit=0): sesión + días + total = 3; en Pedidos 5 (+ el resumen de H47, 2).
#  - Lista sin filas: Hub 5 (sesión + días + pestañas + grupos + total); Pedidos 6 (sesión + días + conteos + resumen
#    (2) + total); Solicitudes y Cotizaciones 5 (sesión + días + conteos + resumen en UNA consulta + total).
#  - Fijas (agregados, sin filas): /ventas/flujo 20, /ventas/stats 13, /ventas/config 2 y /preferencias 2 (una vez por
#    sesión, fuera de la carga).
# MANTENIMIENTO (r1, m10): estos topes no tienen holgura a propósito. Una consulta nueva en una ruta del tablero,
# también en las compartidas (/ventas/flujo, /ventas/stats, /ventas/config o /preferencias), hace fallar esta prueba:
# hay que volver a medir (el runner imprime cada número) y subir el tope que corresponda, con su desglose aquí.
TOPE_PREFERENCIAS = 2
TABLEROS = {
    "Hub": {
        "ruta": RUTA_HUB, "columnas": COLUMNAS_HUB, "params": _params_hub,
        "topes_columna": {"No Resuelto": 16, "En Gestión": 11, "Acción Tomada": 15, "Cancelado": 14},
        "tope_plegada": 3,
        "fijas": [("lista sin filas (conteos)", RUTA_HUB, LISTA_SIN_FILAS, 5), ("flujo", RUTA_FLUJO, None, 20),
                  ("stats", RUTA_STATS, {"periodo": "30d"}, 13), ("config", RUTA_CONFIG, None, 2)],
    },
    "Pedidos": {
        "ruta": RUTA_PEDIDOS, "columnas": COLUMNAS_PEDIDO, "params": _params_pedido,
        "topes_columna": {clave: 9 for clave in COLUMNAS_PEDIDO},
        "tope_plegada": 5,
        "fijas": [("lista sin filas (conteos)", RUTA_PEDIDOS, LISTA_SIN_FILAS, 6), ("flujo", RUTA_FLUJO, None, 20),
                  ("stats", RUTA_STATS, {"periodo": "30d"}, 13)],
    },
    "Solicitudes": {
        "ruta": RUTA_SOLICITUDES, "columnas": COLUMNAS_SC, "params": _params_sc,
        "topes_columna": {"nueva": 7, "asignada": 7, "pendiente": 8, "confirmada": 7, "cancelada": 7},
        "tope_plegada": 3,
        "fijas": [("lista sin filas (conteos y resumen)", RUTA_SOLICITUDES, LISTA_SIN_FILAS_CON_RESUMEN, 5),
                  ("flujo", RUTA_FLUJO, None, 20)],
    },
    "Cotizaciones": {
        "ruta": RUTA_COTIZACIONES, "columnas": COLUMNAS_COT, "params": _params_cot,
        "topes_columna": {"borrador": 6, "esperando": 7, "confirmada": 6, "vencida": 6, "rechazada": 6},
        "tope_plegada": 3,
        "fijas": [("lista sin filas (conteos y resumen)", RUTA_COTIZACIONES, LISTA_SIN_FILAS_CON_RESUMEN, 5),
                  ("flujo", RUTA_FLUJO, None, 20)],
    },
}


def _tope_de_la_carga(tablero, abiertas):
    """El tope DERIVADO de la carga: la suma de los topes de sus peticiones (con las cerradas plegadas, como salen, o
    con todas abiertas). No es un control aparte: el control va por petición."""
    columnas = sum(tablero["tope_plegada"] if (c["cerrada"] and not abiertas) else tablero["topes_columna"][clave]
                   for clave, c in tablero["columnas"].items())
    return columnas + sum(tope for *_, tope in tablero["fijas"])


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


_TIPO_DE_RUTA = {RUTA_PEDIDOS: "VEN", RUTA_SOLICITUDES: "SC", RUTA_COTIZACIONES: "COT"}


def _receta(tablero, columna):
    """Lo que se siembra para una columna: la receta del Hub o un documento por cada estado de la columna."""
    if "receta" in columna:
        return columna["receta"]
    return [(_TIPO_DE_RUTA[tablero["ruta"]], e) for e in columna["estados"]]


# ─── 1) Cada columna hace las mismas consultas con pocas filas que con 25 ───────────────────────────────────────────

def _columnas_sin_consultas_por_fila(app_client, db, token, contador_sql, nombre):
    """Cada columna del tablero, con sus parámetros reales (las cerradas abiertas: orden=reciente&limit=25) más
    q=<sufijo>, hace el mismo número de consultas con pocas filas que con una página llena de 25, y exactamente su
    tope (cada receta enciende todas las ramas que su columna puede tener)."""
    tablero = TABLEROS[nombre]
    medidas = {}
    for clave, columna in tablero["columnas"].items():
        receta = _receta(tablero, columna)
        pocas_filas = max(POCAS, len(receta))
        conteos = []
        for n in (pocas_filas, POR_COLUMNA):
            sufijo = _Siembra(db).sembrar(receta, n)
            consultas, cuerpo = _medir(app_client, token, contador_sql, tablero["ruta"],
                                       {**tablero["params"](clave, plegada=False), "q": sufijo})
            filas = cuerpo["data"]
            assert cuerpo["total"] == n and len(filas) == n, (nombre, clave, n, cuerpo["total"], len(filas))
            assert {(f["tipo"], f["estado"]) for f in filas} == {(t, e) for t, e, *_ in receta}, (
                nombre, clave, filas[:3])
            # r1 (m1, m11): la siembra obliga a leer la ficha del cliente en cada fila (el documento no tiene
            # customer_phone) y, en los pedidos, sus documentos de origen (el asesor de H4). Si una siembra futura
            # rompe esto, la prueba lo dice en vez de quedar ciega al N+1.
            assert all(f["telefono_whatsapp"] for f in filas), (nombre, clave, filas[:3])
            assert all(f["advisor_name"] for f in filas if f["tipo"] == "VEN"), (nombre, clave, filas[:3])
            conteos.append(consultas)
        medidas[clave] = (pocas_filas, conteos[0], conteos[1])
    print(f"[R28] {nombre}, consultas por columna (filas pocas, consultas con pocas, con 25): {medidas}", flush=True)
    for clave, (_, pocas, muchas) in medidas.items():
        assert pocas == muchas, (f"N+1 en la columna {clave!r} de {nombre}: {pocas} consultas con pocas filas y "
                                 f"{muchas} con {POR_COLUMNA}")
        assert muchas == tablero["topes_columna"][clave], (nombre, clave, muchas, tablero["topes_columna"][clave])


def test_hub_columnas_sin_consultas_por_fila(app_client, db, admin_token, contador_sql):
    _columnas_sin_consultas_por_fila(app_client, db, admin_token, contador_sql, "Hub")


def test_pedidos_columnas_sin_consultas_por_fila(app_client, db, admin_token, contador_sql):
    _columnas_sin_consultas_por_fila(app_client, db, admin_token, contador_sql, "Pedidos")


def test_solicitudes_columnas_sin_consultas_por_fila(app_client, db, admin_token, contador_sql):
    _columnas_sin_consultas_por_fila(app_client, db, admin_token, contador_sql, "Solicitudes")


def test_cotizaciones_columnas_sin_consultas_por_fila(app_client, db, admin_token, contador_sql):
    _columnas_sin_consultas_por_fila(app_client, db, admin_token, contador_sql, "Cotizaciones")


# ─── 2) La carga completa de cada tablero ────────────────────────────────────────────────────────────────────────────

def _peticiones_de_carga(tablero, abiertas):
    """[(nombre, tope, ruta, params)] de la carga: cada columna (las cerradas plegadas, limit=0, salvo con `abiertas`)
    y después las peticiones que no son de una columna."""
    peticiones = []
    for clave, c in tablero["columnas"].items():
        plegada = c["cerrada"] and not abiertas
        tope = tablero["tope_plegada"] if plegada else tablero["topes_columna"][clave]
        peticiones.append((f"columna {clave}", tope, tablero["ruta"], tablero["params"](clave, plegada=plegada)))
    return peticiones + [(nombre, tope, ruta, params) for nombre, ruta, params, tope in tablero["fijas"]]


def _medir_carga(app_client, token, contador_sql, tablero, abiertas, etiqueta):
    """{nombre: consultas} de la carga completa, con cada petición bajo su tope; imprime el total y su tope derivado."""
    peticiones = _peticiones_de_carga(tablero, abiertas)
    medidas = {nombre: _medir(app_client, token, contador_sql, ruta, params)[0]
               for nombre, _, ruta, params in peticiones}
    print(f"[R28] {etiqueta}: {medidas} -> total {sum(medidas.values())} "
          f"(tope derivado {_tope_de_la_carga(tablero, abiertas)})", flush=True)
    for nombre, tope, _, _ in peticiones:
        assert medidas[nombre] <= tope, (etiqueta, nombre, medidas[nombre], tope)
    return medidas


def _fijas(medidas):
    """Las consultas de las peticiones que no son de una columna (no dependen de qué hay en la página)."""
    return {n: c for n, c in medidas.items() if not n.startswith("columna ")}


def _carga_completa(app_client, db, token, contador_sql, nombre):
    """La carga del tablero sobre erp_test (las cerradas plegadas, como salen); después de sembrar lo de cada columna,
    la misma carga y la carga con TODAS las columnas abiertas (r1, m3). Cada petición bajo su tope, y las que no son de
    una columna con las mismas consultas antes y después de sembrar."""
    tablero = TABLEROS[nombre]
    antes = _medir_carga(app_client, token, contador_sql, tablero, False, f"{nombre}, carga completa sobre erp_test")
    sembrados = 0
    for columna in tablero["columnas"].values():
        receta = _receta(tablero, columna)
        _Siembra(db).sembrar(receta, len(receta))
        sembrados += len(receta)
    despues = _medir_carga(app_client, token, contador_sql, tablero, False,
                           f"{nombre}, carga completa con {sembrados} documentos más")
    abiertas = _medir_carga(app_client, token, contador_sql, tablero, True,
                            f"{nombre}, carga con TODAS las columnas abiertas, con {sembrados} documentos más")
    assert _fijas(antes) == _fijas(despues) == _fijas(abiertas), (antes, despues, abiertas)


def test_hub_carga_completa_del_tablero(app_client, db, admin_token, contador_sql):
    _carga_completa(app_client, db, admin_token, contador_sql, "Hub")
    preferencias = _medir(app_client, admin_token, contador_sql, RUTA_PREFERENCIAS)[0]
    print(f"[R28] /preferencias (una vez por sesión): {preferencias} (tope {TOPE_PREFERENCIAS})", flush=True)
    assert preferencias <= TOPE_PREFERENCIAS, preferencias


def test_pedidos_carga_completa_del_tablero(app_client, db, admin_token, contador_sql):
    _carga_completa(app_client, db, admin_token, contador_sql, "Pedidos")


def test_solicitudes_carga_completa_del_tablero(app_client, db, admin_token, contador_sql):
    _carga_completa(app_client, db, admin_token, contador_sql, "Solicitudes")


def test_cotizaciones_carga_completa_del_tablero(app_client, db, admin_token, contador_sql):
    _carga_completa(app_client, db, admin_token, contador_sql, "Cotizaciones")
