"""B4 T2 (R9, C10; KANBAN-compras, KANBAN-logistica, KPI-compras, FLUJO-compras, TABLA-compras; RP40, RP53, RP67): paridad
entre app/core/estados_compras.py (T1C) y su espejo frontend/src/lib/estados-compras.js, con node y el patron de
test_estados_pedido.py. Reemplaza la paridad de test_estados_pec.py del diseño (R27); las tablas puras de Python estan en
test_estados_compras.py (T1C).

Las etiquetas salen de textos_actividad.ETIQUETAS_ESTADO['PEC'] y ['ENINV'] (fuente unica); las claves de ESTADOS_STOCK,
de core/existencias.py. Pruebas puras (sin DB). Se corre con el runner de ROLLBACK, un modulo a la vez:
python tests/rollback_runner.py test_paridad_estados_compras
"""
import json
import shutil
import subprocess
from datetime import date, datetime
from pathlib import Path

import pytest

from app.core import estados_compras as ec
from app.core.textos_actividad import ETIQUETAS_ESTADO, etiqueta_estado

_FRONTEND_LIB = Path(__file__).resolve().parents[2] / 'frontend' / 'src' / 'lib' / 'estados-compras.js'

# Estados que no son del PEC (los heredados del modulo de logistica) y basura: cuentan como emitido.
_DESCONOCIDOS = ['CONFIRMADA', 'ENVIADA', 'PARCIALMENTE_ENVIADA', 'ALGO_NUEVO', '', 'borrador']
_ESTADOS = list(ec.ESTADOS_PEC) + _DESCONOCIDOS
# T2 r1: codigos para la etiqueta, con espacios en los bordes (los dos lados los recortan antes de buscar)
_ETIQUETAS_RARAS = ['PENDIENTE_ALGO', ' BORRADOR', ' PENDIENTE_CONFIRMACION', 'EN_TRANSITO ', 'ALGO_NUEVO', '', 'x']

# esPecVencido(p, hoy) contra es_vencido(estado, fecha, hoy): fechas como las manda el API (ISO sin zona, a medianoche
# o con hora, o fecha de calendario) y None.
_HOY = '2026-10-28'
_FECHAS = [None, '2026-10-27T23:59:59', '2026-10-28T00:00:00', '2026-10-28T18:30:00', '2026-10-29T00:00:00',
           '2026-10-01', '2026-10-28', '2020-01-01T05:00:00.123456']

_SCRIPT_NODE = """
const m = await import(%s);
const entrada = %s;
const raros = entrada.estados;
console.log(JSON.stringify({
  etapas: m.ETAPAS_PEC,
  estados: Object.keys(m.ESTADOS_PEC),
  labels: Object.fromEntries(Object.entries(m.ESTADOS_PEC).map(([k, v]) => [k, v.label])),
  desconocido: m.infoEstadoPec('PENDIENTE_ALGO').label,
  etiquetas_raras: entrada.etiquetas.map(e => m.infoEstadoPec(e).label),
  etapa_de: Object.fromEntries(raros.map(e => [e, m.etapaPec(e)])),
  etapa_nulo: m.etapaPec(null),
  grupos: m.GRUPOS_PEC,
  transiciones: m.TRANSICIONES_PEC_PATCH,
  transiciones_de: Object.fromEntries(raros.map(e => [e, m.transicionesPec(e)])),
  transiciones_nulo: m.transicionesPec(null),
  manuales: m.ESTADOS_PEC_MANUALES,
  paso_de: Object.fromEntries(raros.map(e => [e, m.pasoFlujoPec(e)])),
  paso_nulo: m.pasoFlujoPec(null),
  vencido: raros.map(e => entrada.fechas.map(f => m.esPecVencido({estado: e, fecha_entrega_estimada: f}, entrada.hoy))),
  columnas_pec: m.COLUMNAS_PEC.map(c => [c.clave, c.estados, c.cerrada]),
  columna_de: Object.fromEntries(raros.map(e => [e, m.columnaPec(e)])),
  grupos_recepcion: m.GRUPOS_RECEPCION,
  grupo_recepcion_de: Object.fromEntries(entrada.recepciones.map(e => [e, m.grupoRecepcion(e)])),
  labels_recepcion: Object.fromEntries(Object.entries(m.ESTADOS_RECEPCION).map(([k, v]) => [k, v.label])),
  columnas_recepcion: m.COLUMNAS_RECEPCION.map(c => [c.clave, c.estados]),
  grupos_operacion: m.GRUPOS_OPERACION,
  grupo_operacion_de: Object.fromEntries(entrada.operaciones.map(e => [e, m.grupoOperacion(e)])),
  labels_lista: Object.fromEntries(Object.entries(m.ESTADOS_ITEM_LISTA).map(([k, v]) => [k, v.label])),
  estados_stock: Object.keys(m.ESTADOS_STOCK),
  columnas_stock: m.COLUMNAS_STOCK.map(c => [c.clave, c.estados]),
}));
"""


def _espejo_frontend():
    node = shutil.which('node')
    if not node or not _FRONTEND_LIB.exists():
        pytest.skip('sin node o sin frontend/src/lib/estados-compras.js: no se puede comprobar la paridad')
    entrada = {
        'estados': _ESTADOS, 'fechas': _FECHAS, 'hoy': _HOY, 'etiquetas': _ETIQUETAS_RARAS,
        'recepciones': ['BORRADOR', 'COMPLETADA', 'COMPLETADA_LOGISTICA', 'CANCELADA', 'PENDIENTE', 'CONFIRMADA', ''],
        'operaciones': ['DRAFT', 'READY', 'DONE', 'CANCELLED', 'done', 'PENDIENTE', ''],
    }
    script = _SCRIPT_NODE % (json.dumps(_FRONTEND_LIB.as_uri()), json.dumps(entrada))
    r = subprocess.run([node, '--input-type=module', '-e', script], capture_output=True, text=True,
                       encoding='utf-8', timeout=60)
    assert r.returncode == 0, f'node fallo:\n{r.stderr}'
    return entrada, json.loads(r.stdout)


def test_etapas_y_etapa_pec_son_las_mismas():
    _, espejo = _espejo_frontend()
    assert espejo['etapas'] == {k: list(v) for k, v in ec.ETAPAS_PEC.items()}
    assert list(espejo['etapas']) == list(ec.ETAPAS_PEC), 'mismo orden de etapas'
    assert espejo['estados'] == list(ec.ESTADOS_PEC), 'ESTADOS_PEC: los 10 estados, en el mismo orden'
    for estado in _ESTADOS:
        assert espejo['etapa_de'][estado] == ec.etapa_pec(estado), estado
    assert espejo['etapa_nulo'] == ec.etapa_pec(None) == ec.ETAPA_POR_DEFECTO == 'emitido'


def test_las_etiquetas_de_estados_pec_son_las_de_etiquetas_estado_pec():
    _, espejo = _espejo_frontend()
    assert espejo['labels'] == ETIQUETAS_ESTADO['PEC']
    assert list(espejo['labels']) == list(ETIQUETAS_ESTADO['PEC'])
    assert espejo['labels']['PARCIALMENTE_RECIBIDA'] == 'Recibido en parte'   # RP67
    assert espejo['desconocido'] == etiqueta_estado('PEC', 'PENDIENTE_ALGO')
    # T2 r1: el codigo se recorta antes de buscarlo, igual que etiqueta_estado (' BORRADOR' -> 'Borrador')
    assert espejo['etiquetas_raras'] == [etiqueta_estado('PEC', e) for e in _ETIQUETAS_RARAS]
    assert espejo['etiquetas_raras'][1:4] == ['Borrador', 'Pendiente confirmacion', 'En tránsito']


def test_grupos_pec_son_los_mismos():
    _, espejo = _espejo_frontend()
    assert espejo['grupos'] == {k: list(v) for k, v in ec.GRUPOS_PEC.items()}


def test_transiciones_y_estados_manuales_son_los_mismos():
    _, espejo = _espejo_frontend()
    assert {k: sorted(v) for k, v in espejo['transiciones'].items()} == \
        {k: sorted(v) for k, v in ec.TRANSICIONES_PEC_PATCH.items()}
    for estado in _ESTADOS:
        assert sorted(espejo['transiciones_de'][estado]) == sorted(ec.destinos_pec_permitidos(estado)), estado
    assert sorted(espejo['transiciones_nulo']) == sorted(ec.destinos_pec_permitidos(None)) == ['CANCELADO']
    assert espejo['manuales'] == list(ec.ESTADOS_PEC_MANUALES)


def test_paso_flujo_pec_es_el_mismo():
    _, espejo = _espejo_frontend()
    for estado in _ESTADOS:
        assert espejo['paso_de'][estado] == ec.paso_flujo_pec(estado), estado
    assert espejo['paso_nulo'] == ec.paso_flujo_pec(None)
    pasos = {espejo['paso_de'][e] for e in ec.ESTADOS_PEC}
    assert pasos == {'PEC', 'TRANSITO', 'RECEPCION', 'RECIBIDO', None}
    assert pasos - {None} <= set(ec.PASOS_FLUJO_COMPRAS)


def test_es_pec_vencido_es_es_vencido_con_el_borde_de_rp40():
    entrada, espejo = _espejo_frontend()
    hoy = date.fromisoformat(_HOY)
    for i, estado in enumerate(_ESTADOS):
        for j, fecha in enumerate(_FECHAS):
            # T2 r1: con hora, Python recibe el DateTime que da el ORM en produccion (la rama .date()); sin hora, el texto
            dato = datetime.fromisoformat(fecha) if fecha is not None and 'T' in fecha else fecha
            assert espejo['vencido'][i][j] == ec.es_vencido(estado, dato, hoy), (estado, fecha)
    # el borde: guardada hoy a las 00:00 no esta vencida hoy (en los dos lados)
    j = _FECHAS.index('2026-10-28T00:00:00')
    assert not ec.es_vencido('EN_TRANSITO', datetime(2026, 10, 28, 0, 0), hoy)
    assert espejo['vencido'][_ESTADOS.index('EN_TRANSITO')][j] is False
    # y la matriz no es trivial: hay vencidos y no vencidos
    planos = [v for fila in espejo['vencido'] for v in fila]
    assert True in planos and False in planos


def test_columnas_pec_son_las_etapas():
    _, espejo = _espejo_frontend()
    assert [c[0] for c in espejo['columnas_pec']] == list(ec.ETAPAS_PEC)
    for clave, estados, _cerrada in espejo['columnas_pec']:
        assert estados == list(ec.ETAPAS_PEC[clave]), clave
    assert [c[0] for c in espejo['columnas_pec'] if c[2]] == ['recibido', 'cancelado']
    for estado in _ESTADOS:
        assert espejo['columna_de'][estado] == ec.etapa_pec(estado), estado


def test_recepciones_grupos_etiquetas_y_columnas():
    entrada, espejo = _espejo_frontend()
    assert espejo['grupos_recepcion'] == {k: list(v) for k, v in ec.GRUPOS_RECEPCION.items()}
    for estado in entrada['recepciones']:
        assert espejo['grupo_recepcion_de'][estado] == ec.grupo_recepcion(estado), estado
    assert espejo['labels_recepcion'] == ETIQUETAS_ESTADO['ENINV']
    assert espejo['columnas_recepcion'] == [[k, list(v)] for k, v in ec.GRUPOS_RECEPCION.items()]


def test_operaciones_e_items_de_la_lista():
    entrada, espejo = _espejo_frontend()
    assert espejo['grupos_operacion'] == {k: list(v) for k, v in ec.GRUPOS_OPERACION.items()}
    for estado in entrada['operaciones']:
        assert espejo['grupo_operacion_de'][estado] == ec.grupo_operacion(estado), estado
    assert espejo['labels_lista'] == dict(ec.ESTADOS_ITEM_LISTA)
    assert 'DESCARTADO' not in espejo['labels_lista']


def test_estados_stock_tienen_las_claves_de_existencias():
    from app.core.existencias import ESTADOS_STOCK
    _, espejo = _espejo_frontend()
    assert espejo['estados_stock'] == list(ESTADOS_STOCK)
    assert espejo['columnas_stock'] == [[e, [e]] for e in ESTADOS_STOCK]
