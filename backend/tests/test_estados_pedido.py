"""N2 (solo las tablas): reglas de transicion del Pedido de Venta por PATCH como DATOS importables
(backend/app/core/estados_pedido.py). La validacion en update_pedido es de la Tarea 4, que importa estas tablas.
Pruebas puras (sin DB), mas una prueba de paridad con el espejo del frontend (frontend/src/lib/estados-pedido.js):
las etiquetas y las reglas existen en dos lenguajes y esta prueba avisa si se desalinean.
"""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app.core.estados_pedido import (
    ESTADOS_VEN_DESTINOS,
    ESTADOS_VEN_MANUALES,
    ESTADOS_VEN_OPERATIVOS,
    TRANSICIONES_VEN_PATCH,
    destinos_ven_permitidos,
)
from app.core.textos_actividad import ETIQUETAS_ESTADO, etiqueta_estado

_OPERATIVOS = {'PENDIENTE_COMPRA', 'PENDIENTE_PAGO', 'EN_PROCESO', 'EN_TRANSITO', 'LISTO_ENTREGA'}


def test_los_estados_operativos_son_los_cinco_del_diseno():
    assert set(ESTADOS_VEN_OPERATIVOS) == _OPERATIVOS
    assert len(ESTADOS_VEN_OPERATIVOS) == 5


def test_desde_un_estado_operativo_se_va_a_cualquier_operativo_entregado_o_cancelado():
    esperado = _OPERATIVOS | {'ENTREGADO', 'CANCELADO'}
    for e in _OPERATIVOS:
        assert TRANSICIONES_VEN_PATCH[e] == esperado, e
    # Reenviar el mismo estado se permite (update_pedido ni lo valida): cada operativo se incluye a si mismo.
    for e in _OPERATIVOS:
        assert e in TRANSICIONES_VEN_PATCH[e]


def test_entregado_solo_pasa_a_facturado_y_facturado_cancelado_no_cambian():
    assert TRANSICIONES_VEN_PATCH['ENTREGADO'] == {'FACTURADO'}
    assert TRANSICIONES_VEN_PATCH['FACTURADO'] == set()
    assert TRANSICIONES_VEN_PATCH['CANCELADO'] == set()


def test_facturado_solo_se_alcanza_desde_entregado():
    origenes = sorted(e for e, destinos in TRANSICIONES_VEN_PATCH.items() if 'FACTURADO' in destinos)
    assert origenes == ['ENTREGADO']


def test_los_estados_de_fase4_no_se_pueden_cancelar_ni_reabrir_por_patch():
    # Choque N2 vs H46+U25: el mapa trae DEVUELTO_TOTAL y PARCIALMENTE_ENTREGADO para que no caigan en el
    # "estado desconocido = operativo" (que permitiria cancelarlos o reabrirlos).
    assert TRANSICIONES_VEN_PATCH['DEVUELTO_TOTAL'] == set()
    assert TRANSICIONES_VEN_PATCH['PARCIALMENTE_ENTREGADO'] == {'ENTREGADO'}


def test_los_estados_cerrados_no_tienen_salida_salvo_entregado_a_facturado():
    sin_salida = sorted(e for e, destinos in TRANSICIONES_VEN_PATCH.items() if not destinos)
    assert sin_salida == ['CANCELADO', 'DEVUELTO_TOTAL', 'FACTURADO']


def test_destinos_ven_permitidos_lee_la_tabla():
    assert destinos_ven_permitidos('ENTREGADO') == {'FACTURADO'}
    assert destinos_ven_permitidos('DEVUELTO_TOTAL') == set()
    assert destinos_ven_permitidos('PARCIALMENTE_ENTREGADO') == {'ENTREGADO'}
    assert destinos_ven_permitidos('EN_PROCESO') == _OPERATIVOS | {'ENTREGADO', 'CANCELADO'}


def test_un_estado_heredado_desconocido_se_trata_como_operativo():
    # PAGADO (ecommerce/webhooks) y COMPLETADO no estan en la tabla: se tratan como operativos.
    esperado = _OPERATIVOS | {'ENTREGADO', 'CANCELADO'}
    assert destinos_ven_permitidos('PAGADO') == esperado
    assert destinos_ven_permitidos('COMPLETADO') == esperado
    assert destinos_ven_permitidos(None) == esperado


def test_los_estados_manuales_son_los_cuatro_del_panel_con_en_transito():
    assert ESTADOS_VEN_MANUALES == ('PENDIENTE_COMPRA', 'EN_PROCESO', 'EN_TRANSITO', 'LISTO_ENTREGA')
    assert set(ESTADOS_VEN_MANUALES) <= _OPERATIVOS
    assert 'PENDIENTE_PAGO' not in ESTADOS_VEN_MANUALES  # lo pone la tienda, no se elige a mano


def test_las_tablas_son_inmutables():
    with pytest.raises((AttributeError, TypeError)):
        TRANSICIONES_VEN_PATCH['ENTREGADO'].add('CANCELADO')
    with pytest.raises((AttributeError, TypeError)):
        ESTADOS_VEN_OPERATIVOS.append('PAGADO')
    with pytest.raises((AttributeError, TypeError)):
        ESTADOS_VEN_MANUALES.append('PAGADO')
    with pytest.raises(TypeError):
        TRANSICIONES_VEN_PATCH['NUEVO'] = frozenset()
    with pytest.raises(TypeError):
        del TRANSICIONES_VEN_PATCH['CANCELADO']


def test_los_destinos_de_un_patch_son_los_ocho_estados_que_se_pueden_poner():
    # ESTADOS_VEN_DESTINOS es lo que update_pedido (T4) usa para "estado inexistente" / "no se puede poner a
    # mano": NO sale del mapa de etiquetas, que trae los 18 estados (tambien los que solo pone fase4).
    assert ESTADOS_VEN_DESTINOS == _OPERATIVOS | {'ENTREGADO', 'FACTURADO', 'CANCELADO'}
    assert ESTADOS_VEN_DESTINOS == frozenset().union(*TRANSICIONES_VEN_PATCH.values())
    assert len(ESTADOS_VEN_DESTINOS) == 8
    for e in ('DEVUELTO_TOTAL', 'PARCIALMENTE_ENTREGADO', 'PAGADO', 'CONFIRMADO', 'PENDIENTE_SALDO', 'BORRADOR'):
        assert e not in ESTADOS_VEN_DESTINOS, f'{e} no se puede poner por PATCH'
    with pytest.raises((AttributeError, TypeError)):
        ESTADOS_VEN_DESTINOS.add('PAGADO')


def test_todo_estado_de_las_tablas_tiene_etiqueta_en_ven():
    # origenes, destinos y listas estan en el mapa de etiquetas: nunca salen por el respaldo humanizado
    estados = set(TRANSICIONES_VEN_PATCH) | set(ESTADOS_VEN_DESTINOS) | set(ESTADOS_VEN_OPERATIVOS) | set(ESTADOS_VEN_MANUALES)
    assert estados <= set(ETIQUETAS_ESTADO['VEN'])
    # los origenes de la tabla son los destinos mas los dos de fase4, que solo pueden ser origen
    assert set(TRANSICIONES_VEN_PATCH) == set(ESTADOS_VEN_DESTINOS) | {'DEVUELTO_TOTAL', 'PARCIALMENTE_ENTREGADO'}


# --- paridad con el espejo del frontend (frontend/src/lib/estados-pedido.js) ---------------------------

_FRONTEND_LIB = Path(__file__).resolve().parents[2] / 'frontend' / 'src' / 'lib' / 'estados-pedido.js'

_SCRIPT_NODE = """
import(%s).then(m => {
  console.log(JSON.stringify({
    labels: Object.fromEntries(Object.entries(m.ESTADOS_PEDIDO).map(([k, v]) => [k, v.label])),
    transiciones: m.TRANSICIONES_PEDIDO_PATCH,
    operativos: m.ESTADOS_PEDIDO_OPERATIVOS,
    manuales: m.ESTADOS_PEDIDO_MANUALES,
    desconocido: m.infoEstadoPedido('PENDIENTE_ALGO').label,
    heredado: m.transicionesPedido('PAGADO'),
  }));
});
"""


def _espejo_frontend():
    node = shutil.which('node')
    if not node or not _FRONTEND_LIB.exists():
        pytest.skip('sin node o sin frontend/src/lib/estados-pedido.js: no se puede comprobar la paridad')
    script = _SCRIPT_NODE % json.dumps(_FRONTEND_LIB.as_uri())
    r = subprocess.run([node, '--input-type=module', '-e', script], capture_output=True, text=True,
                       encoding='utf-8', timeout=60)
    assert r.returncode == 0, f'node fallo:\n{r.stderr}'
    return json.loads(r.stdout)


def test_el_frontend_espeja_las_etiquetas_de_ven():
    espejo = _espejo_frontend()
    # Cada estado que el frontend etiqueta sale IGUAL del backend y por el mapa: si el backend usara el respaldo
    # humanizado ('Pendiente anticipo' en vez de 'Pendiente de anticipo') esta prueba falla.
    assert len(espejo['labels']) == 18
    for codigo, etiqueta_front in espejo['labels'].items():
        assert codigo in ETIQUETAS_ESTADO['VEN'], f'{codigo}: el frontend lo etiqueta y el backend no lo tiene en el mapa'
        assert etiqueta_estado('VEN', codigo) == etiqueta_front, \
            f'{codigo}: backend {etiqueta_estado("VEN", codigo)!r}, frontend {etiqueta_front!r}'
    # y el backend no etiqueta estados que el frontend desconoce
    assert set(ETIQUETAS_ESTADO['VEN']) == set(espejo['labels'])
    # el respaldo humanizado de una clave desconocida es el mismo en los dos lados
    assert espejo['desconocido'] == etiqueta_estado('VEN', 'PENDIENTE_ALGO')


def test_el_frontend_espeja_las_transiciones_y_las_listas_del_pedido():
    espejo = _espejo_frontend()
    assert {k: sorted(v) for k, v in espejo['transiciones'].items()} == \
        {k: sorted(v) for k, v in TRANSICIONES_VEN_PATCH.items()}
    assert espejo['operativos'] == list(ESTADOS_VEN_OPERATIVOS)
    assert espejo['manuales'] == list(ESTADOS_VEN_MANUALES)
    assert sorted(espejo['heredado']) == sorted(destinos_ven_permitidos('PAGADO'))
