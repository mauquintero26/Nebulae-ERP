"""B4 T3B r1 (FLUJO-ventas-datos, FLUJO-compras; R8, R9): paridad de las claves de los pasos del diagrama del flujo entre
el servidor y las librerías de presentación del frontend.

- PASOS_FLUJO_VENTAS de frontend/src/lib/flujo-ventas.js contra app.core.resolucion_ventas.PASOS_FLUJO_VENTAS (las claves
  de GET /ventas/flujo).
- PASOS_FLUJO_COMPRAS de frontend/src/lib/flujo-compras.js contra app.core.estados_compras.PASOS_FLUJO_COMPRAS (las de
  /compras/flujo, T12).
Las claves se comparan EN ORDEN: el orden es el de las cajas de la franja.

Con node y el patron de las paridades de T2 (subprocess con --input-type=module; los datos van por stdin). Pruebas puras
(sin DB). Se corre SOLO con el runner de ROLLBACK, un modulo a la vez: python tests/rollback_runner.py test_paridad_flujo
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.core import estados_compras as ec
from app.core import resolucion_ventas as rv

_LIB = Path(__file__).resolve().parents[2] / 'frontend' / 'src' / 'lib'
_FLUJO_VENTAS = _LIB / 'flujo-ventas.js'
_FLUJO_COMPRAS = _LIB / 'flujo-compras.js'

_PREAMBULO = """
const trozos = [];
for await (const t of process.stdin) trozos.push(t);
const entrada = JSON.parse(Buffer.concat(trozos).toString('utf8'));
const ventas = await import(entrada.ventas);
const compras = await import(entrada.compras);
"""


def _node(cuerpo, **datos):
    """Corre `cuerpo` (JS que termina en console.log(JSON.stringify(...))) con flujo-ventas.js y flujo-compras.js ya
    importados y `entrada` = los datos; devuelve lo que imprime, ya leido como JSON."""
    node = shutil.which('node')
    if not node or not _FLUJO_VENTAS.exists() or not _FLUJO_COMPRAS.exists():
        pytest.skip('sin node o sin frontend/src/lib/flujo-*.js: no se puede comprobar la paridad')
    entrada = {'ventas': _FLUJO_VENTAS.as_uri(), 'compras': _FLUJO_COMPRAS.as_uri(), **datos}
    r = subprocess.run([node, '--input-type=module', '-e', _PREAMBULO + cuerpo], input=json.dumps(entrada),
                       capture_output=True, text=True, encoding='utf-8', timeout=60)
    assert r.returncode == 0, f'node fallo:\n{r.stderr}'
    return json.loads(r.stdout)


def _claves_del_frontend():
    return _node("""
console.log(JSON.stringify({
  ventas: ventas.PASOS_FLUJO_VENTAS.map((p) => p.clave),
  compras: compras.PASOS_FLUJO_COMPRAS.map((p) => p.clave),
}));
""")


def test_claves_de_pasos_flujo_ventas_iguales_y_en_orden():
    claves = _claves_del_frontend()
    assert claves['ventas'] == list(rv.PASOS_FLUJO_VENTAS)
    assert claves['ventas'] == ['SC', 'COT', 'PVEN', 'ENTREGADO', 'FACTURADO']


def test_claves_de_pasos_flujo_compras_iguales_y_en_orden():
    claves = _claves_del_frontend()
    assert claves['compras'] == list(ec.PASOS_FLUJO_COMPRAS)
    assert claves['compras'] == ['LISTA', 'PEC', 'TRANSITO', 'RECEPCION', 'RECIBIDO']


def test_cada_paso_de_un_pec_es_una_caja_del_flujo_de_compras():
    """paso_flujo_pec de cada estado del PEC (y de uno desconocido) cae en una clave de PASOS_FLUJO_COMPRAS, o en None
    (cancelado): la franja nunca recibe un paso que no sabe pintar."""
    for estado in list(ec.ESTADOS_PEC) + ['ALGO_NUEVO', None]:
        paso = ec.paso_flujo_pec(estado)
        assert paso is None or paso in ec.PASOS_FLUJO_COMPRAS, estado
