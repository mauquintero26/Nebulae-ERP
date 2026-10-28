"""B4 T2 (KANBAN-ventas-listas, punto 3; RP4): paridad de los estados de la Cotizacion entre el backend
(textos_actividad.ETIQUETAS_ESTADO['COT'] y erp_ventas.ESTADOS_COT_MANUALES) y su espejo del frontend
(frontend/src/lib/estados-cotizacion.js), con node y el patron de test_estados_pedido.py.

Pruebas puras (sin DB). Se corre con el runner de ROLLBACK, un modulo a la vez:
python tests/rollback_runner.py test_estados_cotizacion_paridad
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.core.textos_actividad import ETIQUETAS_ESTADO, etiqueta_estado

_FRONTEND_LIB = Path(__file__).resolve().parents[2] / 'frontend' / 'src' / 'lib' / 'estados-cotizacion.js'

_DESCONOCIDOS = ['PENDIENTE_ALGO', 'ALGO_NUEVO', 'x']

_SCRIPT_NODE = """
import(%s).then(m => {
  const raros = %s;
  console.log(JSON.stringify({
    labels: Object.fromEntries(Object.entries(m.ESTADOS_COTIZACION).map(([k, v]) => [k, v.label])),
    claves_info: Object.fromEntries(Object.entries(m.ESTADOS_COTIZACION).map(([k, v]) => [k, Object.keys(v).sort()])),
    manuales: m.ESTADOS_COT_MANUALES,
    desconocidos: raros.map(e => m.infoEstadoCotizacion(e).label),
    vacio: m.infoEstadoCotizacion('').label,
  }));
});
"""


def _espejo_frontend():
    node = shutil.which('node')
    if not node or not _FRONTEND_LIB.exists():
        pytest.skip('sin node o sin frontend/src/lib/estados-cotizacion.js: no se puede comprobar la paridad')
    script = _SCRIPT_NODE % (json.dumps(_FRONTEND_LIB.as_uri()), json.dumps(_DESCONOCIDOS))
    r = subprocess.run([node, '--input-type=module', '-e', script], capture_output=True, text=True,
                       encoding='utf-8', timeout=60)
    assert r.returncode == 0, f'node fallo:\n{r.stderr}'
    return json.loads(r.stdout)


def test_las_etiquetas_de_estados_cotizacion_son_las_de_etiquetas_estado_cot():
    espejo = _espejo_frontend()
    # los 6 estados, en el mismo orden, con la misma etiqueta (fuente unica: textos_actividad.py)
    assert list(espejo['labels']) == list(ETIQUETAS_ESTADO['COT'])
    assert espejo['labels'] == ETIQUETAS_ESTADO['COT']
    assert len(espejo['labels']) == 6
    # la forma que pide el spec (RP4): {label, clases}
    assert all(claves == ['clases', 'label'] for claves in espejo['claves_info'].values()), espejo['claves_info']


def test_un_estado_desconocido_se_humaniza_igual_en_los_dos_lados():
    espejo = _espejo_frontend()
    assert espejo['desconocidos'] == [etiqueta_estado('COT', e) for e in _DESCONOCIDOS]
    assert espejo['vacio'] == etiqueta_estado('COT', '') == ''


def test_estados_cot_manuales_es_la_constante_de_erp_ventas():
    from app.api.v1.erp_ventas import ESTADOS_COT_MANUALES
    espejo = _espejo_frontend()
    assert espejo['manuales'] == list(ESTADOS_COT_MANUALES) == ['BORRADOR', 'RECHAZADA', 'VENCIDA']
    assert set(espejo['manuales']) <= set(ETIQUETAS_ESTADO['COT'])
