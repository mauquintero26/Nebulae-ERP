"""B4 T2 (R8, C5, C7; RP2, RP3, D19, D20): la paridad Python <-> JS de la regla unica de Ventas. Una sola prueba de paridad
(C5) entre app/core/resolucion_ventas.py (T1C) y frontend/src/lib/hub-ventas.js, mas los filtros f_* de los indicadores
contra frontend/src/lib/listas-ventas.js (RP3). Reune la prueba 6 de TABLA-hub-ventas, la 6 de KPI-ventas (reformulada:
no hay resumenVentasLocal, C4) y las 7 y 8 de FLUJO-ventas-datos (R27).

Con node y el patron de test_estados_pedido.py (subprocess con --input-type=module; los datos van por stdin). Se corre
SOLO con el runner de ROLLBACK, un modulo a la vez (python tests/rollback_runner.py test_paridad_reglas_ventas): las filas
reales se crean con un sufijo unico dentro de la transaccion que se revierte y se leen por la API con search=<sufijo>
(en T2 las listas leen `search`; `q` llega en T6B).
"""
import json
import shutil
import subprocess
import uuid
from datetime import timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import select, text

from app.core import resolucion_ventas as rv
from app.core.fechas import ahora_utc, iso_z
from app.core.textos_actividad import ETIQUETAS_ESTADO
from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation

_LIB = Path(__file__).resolve().parents[2] / 'frontend' / 'src' / 'lib'
_HUB = _LIB / 'hub-ventas.js'
_LISTAS = _LIB / 'listas-ventas.js'

DIAS = {'SC': 2, 'COT': 3, 'VEN': 4}
_RANGO_A_TEXTO = {valor: clave for clave, valor in rv.RANGO.items()}

_PREAMBULO = """
const trozos = [];
for await (const t of process.stdin) trozos.push(t);
const entrada = JSON.parse(Buffer.concat(trozos).toString('utf8'));
const hub = await import(entrada.hub);
const listas = await import(entrada.listas);
const intentar = (f) => { try { return {valor: f()}; } catch (e) { return {error: String(e && e.message || e)}; } };
"""


def _node(cuerpo, **datos):
    """Corre `cuerpo` (JS que termina en console.log(JSON.stringify(...))) con hub-ventas.js y listas-ventas.js ya
    importados y `entrada` = los datos; devuelve lo que imprime, ya leido como JSON."""
    node = shutil.which('node')
    if not node or not _HUB.exists() or not _LISTAS.exists():
        pytest.skip('sin node o sin frontend/src/lib/hub-ventas.js: no se puede comprobar la paridad')
    entrada = {'hub': _HUB.as_uri(), 'listas': _LISTAS.as_uri(), **datos}
    r = subprocess.run([node, '--input-type=module', '-e', _PREAMBULO + cuerpo], input=json.dumps(entrada),
                       capture_output=True, text=True, encoding='utf-8', timeout=60)
    assert r.returncode == 0, f'node fallo:\n{r.stderr}'
    return json.loads(r.stdout)


def _ms(dt):
    """Milisegundos epoch de un instante UTC sin zona (como Date.now())."""
    return int(dt.replace(tzinfo=timezone.utc).timestamp() * 1000)


# ─── Constantes ──────────────────────────────────────────────────────────────────────────────────────────────────────

def test_estados_no_resolucion_y_cerrados_son_los_mismos():
    js = _node("console.log(JSON.stringify({no_res: hub.ESTADOS_NO_RESOLUCION, cerrados: hub.ESTADOS_CERRADOS,"
               " grupos: hub.ETIQUETA_GRUPO}));")
    # RP2: los 8 de alertas_resumen, sin EN_GESTION (el orden del frontend es el del Bloque 1: se comparan como conjunto)
    assert sorted(js['no_res']) == sorted(rv.ESTADOS_NO_RESOLUCION)
    assert len(js['no_res']) == len(set(js['no_res'])) == 8
    assert 'EN_GESTION' not in js['no_res']
    assert js['cerrados'] == {k: list(v) for k, v in rv.ESTADOS_CERRADOS.items()}
    # los grupos de los separadores son los rangos del servidor
    assert set(js['grupos']) == set(rv.RANGO)


# ─── clasificar (la prueba 6 de TABLA-hub-ventas y la 7 de FLUJO-ventas-datos) ──────────────────────────────────────

def _casos_clasificar(ahora):
    """La matriz tipo × estado × dias × banderas: (fila del API para JS, ctx de JS, kwargs de Python, horas)."""
    m = 1 / 60
    sc, cot, ven = DIAS['SC'] * 24, DIAS['COT'] * 24, DIAS['VEN'] * 24
    base = [
        # (tipo, estado, horas, banderas)
        ('SC', 'BORRADOR', 0, {}),
        ('SC', 'BORRADOR', sc, {}),                          # frontera estricta: exactamente dias×24 h no
        ('SC', 'BORRADOR', sc + m, {}),                      # un minuto mas, si
        ('SC', 'ASIGNADA', 100, {}),
        ('SC', 'PENDIENTE_CONFIRMACION', 100, {'sc_con_cot_activa': True}),
        ('SC', 'CONFIRMADA', 100, {'confirmacion_vigente': True}),
        ('SC', 'CONFIRMADA', 100, {}),
        ('SC', 'CONFIRMADA', 10, {'confirmacion_vigente': True}),
        ('SC', 'CONFIRMADA', 100, {'confirmacion_vigente': True, 'sc_con_cot_activa': True}),
        ('SC', 'CANCELADA', 100, {'sc_con_cot_activa': True}),
        ('SC', 'BORRADOR', 100, {'es_soporte': True}),
        ('SC', 'N/A_SOPORTE', 100, {}),
        ('SC', 'COTIZADA', 100, {}),
        ('COT', 'BORRADOR', 100, {'es_soporte': True}),       # Soporte solo cuenta en una SC (T1C r1)
        ('COT', 'N/A_SOPORTE', 100, {}),
        ('COT', 'BORRADOR', cot, {}),
        ('COT', 'BORRADOR', cot + m, {}),
        ('COT', 'ENVIADA', 100, {}),
        ('COT', 'PENDIENTE_CONFIRMACION', 1, {}),
        ('COT', 'CONFIRMADA', 100, {'confirmacion_vigente': True}),
        ('COT', 'CONFIRMADA', 100, {}),
        ('COT', 'CONFIRMADA', 100, {'confirmacion_vigente': True, 'cot_con_pedido_vigente': True}),
        ('COT', 'RECHAZADA', 100, {}),
        ('COT', 'VENCIDA', 1000, {'confirmacion_vigente': True}),
        ('COT', 'EN_GESTION', 1000, {}),
        ('VEN', 'PENDIENTE_COMPRA', ven, {}),
        ('VEN', 'PENDIENTE_COMPRA', ven + m, {}),
        ('VEN', 'EN_PROCESO', 200, {'es_soporte': True, 'sc_con_cot_activa': True}),
        ('VEN', 'LISTO_ENTREGA', 200, {}),
        ('VEN', 'PENDIENTE_ANTICIPO', 200, {}),
        ('VEN', 'DEVUELTO_TOTAL', 200, {}),
        ('PVEN', 'EN_TRANSITO', 200, {}),
        ('SC', 'ASIGNADA', None, {}),                        # sin fechas no supera nada
    ]
    casos = []
    for i, (tipo, estado, horas, banderas) in enumerate(base):
        fila = {'tipo': tipo, 'id': i + 1, 'estado': estado, 'created_at': None, 'updated_at': None}
        if horas is not None:
            movimiento = ahora - timedelta(hours=horas)
            # la mitad con 'Z' (como _iso_utc) y la otra sin zona: las dos se leen como UTC
            fila['updated_at'] = iso_z(movimiento) if i % 2 else movimiento.isoformat()
            fila['created_at'] = (ahora - timedelta(hours=9999)).isoformat()
        if banderas.get('confirmacion_vigente'):
            fila['confirmacion_vigente'] = True
        if banderas.get('es_soporte'):
            fila['tipo_solicitud'] = rv.TIPO_SOPORTE
        ctx = {'scConCotActiva': bool(banderas.get('sc_con_cot_activa')),
               'cotConPedidoVigente': bool(banderas.get('cot_con_pedido_vigente'))}
        casos.append((fila, ctx, banderas, horas))
    # updated_at vacio: el tiempo sale de created_at (coalesce / `updated_at || created_at`)
    fila = {'tipo': 'SC', 'id': 999, 'estado': 'BORRADOR', 'updated_at': None,
            'created_at': (ahora - timedelta(hours=sc + 1)).isoformat()}
    casos.append((fila, {'scConCotActiva': False, 'cotConPedidoVigente': False}, {}, sc + 1))
    return casos


def test_clasificar_de_python_es_clasificar_de_hub_ventas_js():
    ahora = ahora_utc().replace(microsecond=0)
    casos = _casos_clasificar(ahora)
    js = _node("""
      const r = entrada.casos.map(([fila, ctx]) => hub.clasificar(fila, {dias: entrada.dias, ahora: entrada.ahora, ...ctx}));
      const n = entrada.casos.map(([fila, ctx]) => hub.clasificar(fila, {dias: entrada.dias.SC, ahora: entrada.ahora, ...ctx}));
      const a = entrada.casos.map(([fila, ctx]) => hub.esAtrasado(fila, {dias: entrada.dias, ahora: entrada.ahora, ...ctx}));
      console.log(JSON.stringify({r, n, a}));
    """, casos=[[f, c] for f, c, _, _ in casos], dias=DIAS, ahora=_ms(ahora))
    vistos = set()
    for i, (fila, _ctx, banderas, horas) in enumerate(casos):
        py = rv.clasificar(fila['tipo'], fila['estado'], horas, DIAS, **banderas)
        assert js['r'][i] == py, (fila, banderas, py, js['r'][i])
        assert js['a'][i] == (py == 'ATRASADO'), fila
        # con los dias como un numero (los de SC para todos los tipos)
        assert js['n'][i] == rv.clasificar(fila['tipo'], fila['estado'], horas, DIAS['SC'], **banderas), fila
        vistos.add(py)
    assert vistos == {'ATRASADO', 'NO_RESUELTO', 'ACCION_TOMADA', 'CERRADO', None}, 'la matriz cubre los 5 resultados'
    assert len(casos) >= 24


def test_clasificar_en_todo_el_producto_tipo_estado_banderas_y_horas():
    """T2 r1: la paridad completa. El TEXTO exacto de clasificar de Python y de hub-ventas.js en todo el producto: los
    estados de ETIQUETAS_ESTADO SC, COT y VEN mas EN_GESTION, N/A_SOPORTE y ALGO_NUEVO; los tipos SC, COT, VEN y PVEN;
    las cuatro banderas en verdadero y falso; y las horas None, dias×24 y dias×24 + 1 min. Una sola llamada a node."""
    import itertools
    ahora = ahora_utc().replace(microsecond=0)
    estados = sorted(set(ETIQUETAS_ESTADO['SC']) | set(ETIQUETAS_ESTADO['COT']) | set(ETIQUETAS_ESTADO['VEN'])
                     | {'EN_GESTION', rv.ESTADO_SOPORTE, 'ALGO_NUEVO'})
    banderas = ('sc_con_cot_activa', 'cot_con_pedido_vigente', 'confirmacion_vigente', 'es_soporte')
    casos, esperado = [], []
    for tipo, estado, valores in itertools.product(('SC', 'COT', 'VEN', 'PVEN'), estados,
                                                   itertools.product((False, True), repeat=len(banderas))):
        flags = dict(zip(banderas, valores))
        limite = DIAS['VEN' if tipo == 'PVEN' else tipo] * 24
        for horas in (None, limite, limite + 1 / 60):
            fila = {'tipo': tipo, 'id': 1, 'estado': estado, 'confirmacion_vigente': flags['confirmacion_vigente'],
                    'tipo_solicitud': rv.TIPO_SOPORTE if flags['es_soporte'] else 'Cotizacion de Producto',
                    'updated_at': None, 'created_at': None}
            if horas is not None:
                fila['updated_at'] = iso_z(ahora - timedelta(hours=horas))
            casos.append([fila, {'scConCotActiva': flags['sc_con_cot_activa'],
                                 'cotConPedidoVigente': flags['cot_con_pedido_vigente']}])
            esperado.append(rv.clasificar(tipo, estado, rv.horas_desde_movimiento(
                ahora - timedelta(hours=horas) if horas is not None else None, None, ahora), DIAS, **flags))
    js = _node("""
      console.log(JSON.stringify(entrada.casos.map(([fila, ctx]) => hub.clasificar(fila, {dias: entrada.dias, ahora: entrada.ahora, ...ctx}))));
    """, casos=casos, dias=DIAS, ahora=_ms(ahora))
    assert len(js) == len(esperado) == 4 * len(estados) * 16 * 3
    distintos = [(c[0]['tipo'], c[0]['estado'], c[1], c[0]['confirmacion_vigente'], c[0]['tipo_solicitud'],
                  c[0]['updated_at'], e, j) for c, e, j in zip(casos, esperado, js) if e != j]
    assert not distintos, f'{len(distintos)} casos distintos; los primeros: {distintos[:5]}'
    assert set(esperado) == {'ATRASADO', 'NO_RESUELTO', 'ACCION_TOMADA', 'CERRADO', None}


def test_horas_del_api_leidas_como_utc_dan_lo_mismo_que_horas_desde_movimiento():
    """La fila trae updated_at / created_at del API; Python calcula las horas con horas_desde_movimiento. Alrededor de la
    frontera (dias×24 h ± 1 s), en los dos formatos de fecha."""
    ahora = ahora_utc().replace(microsecond=0)
    filas, horas = [], []
    for delta in (-1, 0, 1):
        for con_z in (False, True):
            t = ahora - timedelta(hours=DIAS['COT'] * 24, seconds=delta)
            filas.append({'tipo': 'COT', 'id': 1, 'estado': 'BORRADOR',
                          'updated_at': iso_z(t) if con_z else t.isoformat(), 'created_at': None})
            horas.append(rv.horas_desde_movimiento(t, None, ahora))
    js = _node("console.log(JSON.stringify(entrada.filas.map(f => hub.clasificar(f, {dias: entrada.dias, ahora: entrada.ahora}))));",
               filas=filas, dias=DIAS, ahora=_ms(ahora))
    esperado = [rv.clasificar('COT', 'BORRADOR', h, DIAS) for h in horas]
    assert js == esperado
    assert esperado == ['NO_RESUELTO'] * 4 + ['ATRASADO'] * 2


def test_un_tipo_desconocido_es_un_error_en_los_dos_lados():
    js = _node("""
      console.log(JSON.stringify(['XYZ', null, 'sc'].map(t => [
        intentar(() => hub.clasificar({tipo: t, estado: 'BORRADOR'}, {dias: 2, ahora: 0})),
        intentar(() => hub.columnaHub({tipo: t, estado: 'BORRADOR'}, {})),
      ])));
    """)
    for tipo, (clasificar_js, columna_js) in zip(['XYZ', None, 'sc'], js):
        with pytest.raises(ValueError):
            rv.clasificar(tipo, 'BORRADOR', 1, 2)
        with pytest.raises(ValueError):
            rv.columna_hub(tipo, 'BORRADOR')
        assert 'Tipo de documento no válido' in clasificar_js.get('error', ''), (tipo, clasificar_js)
        assert 'Tipo de documento no válido' in columna_js.get('error', ''), (tipo, columna_js)


def test_es_no_resuelto_y_es_accion_tomada_con_tercer_argumento_son_los_rangos_del_servidor():
    """RP81 + D19: con el tercer argumento, esNoResuelto = rango ATRASADO o NO_RESUELTO y esAccionTomada = ACCION_TOMADA o
    CERRADO (la vista acciones_tomadas, C7), con la misma regla que clasificar."""
    estados = sorted(set(ETIQUETAS_ESTADO['SC']) | set(ETIQUETAS_ESTADO['COT']) | set(ETIQUETAS_ESTADO['VEN'])
                     | {'EN_GESTION', 'ALGO_NUEVO'})
    combinaciones = [(tipo, estado, con, sop) for tipo in ('SC', 'COT', 'VEN') for estado in estados
                     for con in (False, True) for sop in (False, True)]
    js = _node("""
      const out = entrada.combinaciones.map(([tipo, estado, con, sop]) => {
        const fila = {tipo, id: 1, estado, confirmacion_vigente: true, ...(sop ? {tipo_solicitud: 'Soporte Tecnico'} : {})};
        const s = new Set(con ? [1] : []);
        return [hub.esNoResuelto(fila, s, {cotConPedidoVigente: con}), hub.esAccionTomada(fila, s, {cotConPedidoVigente: con})];
      });
      console.log(JSON.stringify(out));
    """, combinaciones=combinaciones)
    for (tipo, estado, con, sop), (no_res, accion) in zip(combinaciones, js):
        r = rv.clasificar(tipo, estado, 1, DIAS, sc_con_cot_activa=con and tipo == 'SC', cot_con_pedido_vigente=con,
                          confirmacion_vigente=True, es_soporte=sop)
        assert no_res == (r in ('ATRASADO', 'NO_RESUELTO')), (tipo, estado, con, sop, r)
        assert accion == (r in ('ACCION_TOMADA', 'CERRADO')), (tipo, estado, con, sop, r)


# ─── columna_hub (C7, D20) ───────────────────────────────────────────────────────────────────────────────────────────

def test_columna_hub_de_python_es_columna_hub_de_js():
    estados = sorted(set(ETIQUETAS_ESTADO['SC']) | set(ETIQUETAS_ESTADO['COT']) | set(ETIQUETAS_ESTADO['VEN'])
                     | {'EN_GESTION', 'ALGO_NUEVO', ''})
    combinaciones = [(tipo, estado, con) for tipo in ('SC', 'COT', 'VEN', 'PVEN') for estado in estados
                     for con in (False, True)]
    js = _node("""
      console.log(JSON.stringify(entrada.combinaciones.map(([tipo, estado, con]) =>
        hub.columnaHub({tipo, id: 7, estado}, {scConCot: new Set(con ? [7] : [])}))));
    """, combinaciones=combinaciones)
    for (tipo, estado, con), columna in zip(combinaciones, js):
        # scConCot es el conjunto de ids de SC con documentos activos: en una COT o un pedido no cuenta
        assert columna == rv.columna_hub(tipo, estado, con and tipo == 'SC'), (tipo, estado, con)
        assert columna in rv.COLUMNAS_HUB
    assert rv.columna_hub('VEN', 'DEVUELTO_TOTAL') == 'Cancelado'


# ─── Filas reales: los filtros f_* (RP3) y la regla sobre lo que manda el API ───────────────────────────────────────

class _Fabrica:
    """Documentos de prueba con un sufijo unico en customer_name (para search=) y created_at = updated_at = ahora − hace."""

    def __init__(self, db, ahora):
        self.db, self.ahora = db, ahora
        self.sufijo = 'T2P' + uuid.uuid4().hex[:8].upper()
        self.n = 0

    def _guardar(self, objeto):
        self.db.add(objeto)
        self.db.commit()
        return objeto

    def _numero(self, prefijo):
        self.n += 1
        return f'{prefijo}{self.sufijo}{self.n:02d}'

    def _fecha(self, hace):
        return self.ahora - (hace if hace is not None else timedelta(hours=1))

    def sc(self, estado, hace=None, **campos):
        t = self._fecha(hace)
        sin_tipo = 'tipo_solicitud' in campos and campos['tipo_solicitud'] is None
        campos.setdefault('tipo_solicitud', 'Cotizacion de Producto')
        if sin_tipo:
            campos.pop('tipo_solicitud')
        sc = self._guardar(CustomerRequest(numero=self._numero('SC-'), customer_name=f'Cliente {self.sufijo}',
                                           estado=estado, created_at=t, updated_at=t, **campos))
        if sin_tipo:   # una SC vieja sin tipo: con SQL directo para no tocar updated_at (onupdate)
            self.db.execute(text('UPDATE customer_requests SET tipo_solicitud = NULL WHERE id = :id'), {'id': sc.id})
            self.db.commit()
            self.db.refresh(sc)
            assert sc.tipo_solicitud is None and sc.updated_at == t
        return sc

    def cot(self, estado, hace=None, sc=None, **campos):
        t = self._fecha(hace)
        return self._guardar(SalesQuotation(numero=self._numero('COT-'), customer_name=f'Cliente {self.sufijo}',
                                            sc_id=sc.id if sc is not None else None, estado=estado,
                                            created_at=t, updated_at=t, **campos))

    def pven(self, estado, hace=None, sc=None, cot=None):
        t = self._fecha(hace)
        sc_id = sc.id if sc is not None else (cot.sc_id if cot is not None else None)
        return self._guardar(SaleOrder(numero=self._numero('PV-'), customer_name=f'Cliente {self.sufijo}', sc_id=sc_id,
                                       cot_id=cot.id if cot is not None else None, estado=estado,
                                       created_at=t, updated_at=t))


def _escenario(db, ahora):
    f = _Fabrica(db, ahora)
    viejo = {k: timedelta(days=v + 3) for k, v in DIAS.items()}
    # Solicitudes
    f.sc('BORRADOR', viejo['SC'])                                       # activa, atrasada
    f.sc('ASIGNADA')                                                     # activa, reciente
    f.sc('ASIGNADA', tipo_solicitud=None)                               # activa (tipo NULL no es Soporte)
    f.sc('CONFIRMADA', viejo['SC'], gate1_confirmed_at=ahora - viejo['SC'])   # espera COT, atrasada
    rech = f.sc('CONFIRMADA')
    f.cot('RECHAZADA', sc=rech)                                         # una rechazada no cuenta: espera COT
    venc = f.sc('CONFIRMADA')
    f.cot('VENCIDA', sc=venc)                                           # VENCIDA esta en juego (N4): no espera
    con_pven = f.sc('CONFIRMADA')
    f.pven('EN_PROCESO', sc=con_pven)                                   # D16: resuelta; esperaCotizacion solo mira COT
    temprana = f.sc('PENDIENTE_CONFIRMACION', viejo['SC'])
    f.cot('BORRADOR', sc=temprana)                                      # R20: la alerta la lleva su COT
    f.sc('CANCELADA')
    f.sc('BORRADOR', viejo['SC'], tipo_solicitud='Soporte Tecnico')     # fuera del semaforo (R8)
    f.sc('N/A_SOPORTE')
    f.sc('CONFIRMADA', tipo_solicitud='Soporte Tecnico')                # espera COT en los dos lados (espejo literal)
    # Cotizaciones
    f.cot('BORRADOR', viejo['COT'])
    f.cot('ENVIADA')
    f.cot('RECHAZADA')
    f.cot('VENCIDA', viejo['COT'])
    f.cot('CONFIRMADA', viejo['COT'], gate2_confirmed_at=ahora - viejo['COT'])   # confirmada, atrasada
    f.cot('CONFIRMADA', viejo['COT'])                                   # hay que reabrirla: activa
    conf_pven = f.cot('CONFIRMADA', gate2_confirmed_at=ahora)
    f.pven('EN_PROCESO', cot=conf_pven)                                 # con pedido vigente
    caido = f.cot('CONFIRMADA')
    f.pven('CANCELADO', cot=caido)                                      # pedido caido, sin gate2: activa
    caido_gate2 = f.cot('CONFIRMADA', gate2_confirmed_at=ahora)
    f.pven('CANCELADO', cot=caido_gate2)                                # pedido caido, con gate2: confirmada
    mixto = f.cot('CONFIRMADA')
    f.pven('CANCELADO', cot=mixto)
    f.pven('PENDIENTE_COMPRA', cot=mixto)                               # un cancelado y uno vigente: con pedido
    return f.sufijo


def _lista(app_client, token, ruta, sufijo):
    r = app_client.get(f'/api/v1/ventas/{ruta}', params={'search': sufijo, 'limit': 200},
                       headers={'Authorization': f'Bearer {token}'})
    assert r.status_code == 200, r.text
    filas = r.json()['data']
    assert filas and all(sufijo in (fila.get('customer_name') or '') for fila in filas)
    return filas


def _cumplen(db, modelo, condicion, ids):
    return sorted(db.scalars(select(modelo.id).where(modelo.id.in_(ids), condicion)))


def test_filtros_del_servidor_son_los_de_listas_ventas_sobre_filas_reales(app_client, db, admin_token):
    """RP3 (la prueba 6 de KPI-ventas, reformulada): cada f_* del servidor con su espejo de listas-ventas.js sobre las
    filas que devuelven GET /ventas/solicitudes y /ventas/cotizaciones con search=<sufijo>."""
    sufijo = _escenario(db, ahora_utc())
    scs = _lista(app_client, admin_token, 'solicitudes', sufijo)
    cots = _lista(app_client, admin_token, 'cotizaciones', sufijo)
    ids_sc, ids_cot = [s['id'] for s in scs], [c['id'] for c in cots]
    assert len(ids_sc) == 12 and len(ids_cot) == 13, (len(ids_sc), len(ids_cot))
    servidor = {
        'sc_activa': _cumplen(db, CustomerRequest, rv.f_sc_activa(), ids_sc),
        'sc_espera_cot': _cumplen(db, CustomerRequest, rv.f_sc_espera_cot(), ids_sc),
        'cot_confirmada': _cumplen(db, SalesQuotation, rv.f_cot_confirmada(), ids_cot),
        'cot_activa': _cumplen(db, SalesQuotation, rv.f_cot_activa(), ids_cot),
        'cot_con_pedido': _cumplen(db, SalesQuotation, rv.f_cot_con_pedido(), ids_cot),
        'cot_pedido_caido': _cumplen(db, SalesQuotation, rv.f_cot_pedido_caido(), ids_cot),
    }
    js = _node("""
      const ids = (filas) => filas.map(f => f.id).sort((a, b) => a - b);
      const {scs, cots} = entrada;
      console.log(JSON.stringify({
        sc_activa: ids(scs.filter(listas.esSolicitudActiva)),
        sc_espera_cot: ids(scs.filter(listas.esperaCotizacion)),
        cot_confirmada: ids(cots.filter(c => listas.pestanaCotizacion(c) === 'Confirmadas')),
        cot_activa: ids(cots.filter(c => listas.pestanaCotizacion(c) === 'Activas')),
        cot_con_pedido: ids(cots.filter(c => c.estado === 'CONFIRMADA' && listas.pedidoVigente(c) !== null)),
        cot_pedido_caido: ids(cots.filter(c => c.estado === 'CONFIRMADA' && listas.soloPedidosCancelados(c))),
      }));
    """, scs=scs, cots=cots)
    assert js == servidor
    # la prueba muerde: cada filtro deja pasar algunas filas y no todas
    for clave, ids in servidor.items():
        total = ids_sc if clave.startswith('sc_') else ids_cot
        assert 0 < len(ids) < len(total), (clave, ids)
    assert len(servidor['sc_activa']) == 4 and len(servidor['sc_espera_cot']) == 4
    assert len(servidor['cot_con_pedido']) == 2 and len(servidor['cot_pedido_caido']) == 2


def test_clasificar_de_js_sobre_filas_del_api_es_el_rango_de_expresiones(app_client, db, admin_token):
    """La fila tal como la manda el API (fechas con 'Z', confirmacion_vigente de _sc_dict y _cot_dict, tipo_solicitud)
    clasificada en el navegador da el mismo rango que el CASE de expresiones en SQL. Las banderas de documentos
    (sc_con_cot_activa de D16 y cot_con_pedido_vigente) las da el servidor, como hara /ventas/hub/documentos (T6A)."""
    ahora = ahora_utc().replace(microsecond=0)
    sufijo = _escenario(db, ahora)
    filas = []
    for ruta, tipo, modelo in (('solicitudes', 'SC', CustomerRequest), ('cotizaciones', 'COT', SalesQuotation)):
        delta = _lista(app_client, admin_token, ruta, sufijo)
        ex = rv.expresiones(tipo, modelo, DIAS, ahora)
        servidor = {fila_id: (rango, bool(con_docs), bool(con_pedido)) for fila_id, rango, con_docs, con_pedido in db.execute(
            select(modelo.id, ex['rango'], ex['sc_con_cot_activa'], ex['cot_con_pedido_vigente'])
            .where(modelo.id.in_([d['id'] for d in delta])))}
        for d in delta:
            rango, con_docs, con_pedido = servidor[d['id']]
            filas.append(({**d, 'tipo': tipo}, {'scConCotActiva': con_docs, 'cotConPedidoVigente': con_pedido},
                          _RANGO_A_TEXTO.get(rango)))
    js = _node("""
      console.log(JSON.stringify(entrada.filas.map(([fila, ctx]) => hub.clasificar(fila, {dias: entrada.dias, ahora: entrada.ahora, ...ctx}))));
    """, filas=[[f, c] for f, c, _ in filas], dias=DIAS, ahora=_ms(ahora))
    assert js == [esperado for _, _, esperado in filas], [(f['numero'], f['estado'], e, j)
                                                          for (f, _, e), j in zip(filas, js) if e != j]
    assert {e for _, _, e in filas} == {'ATRASADO', 'NO_RESUELTO', 'ACCION_TOMADA', 'CERRADO', None}
