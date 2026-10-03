"""H7+H41: etiquetas de estado legibles (backend/app/core/textos_actividad.py).

Es la fuente UNICA de los nombres de estado en la Actividad y en los mensajes de error de Ventas (choque
"Tablas de etiquetas de estado duplicadas" de la especificacion). Estas pruebas son puras (sin DB). Los cambios
de texto en los endpoints, la correccion de las actividades viejas y sus pruebas de API son de la Tarea 12 y se
agregan a este mismo archivo.
"""
from app.core.textos_actividad import ETIQUETAS_ESTADO, etiqueta_estado


def test_etiqueta_estado_es_legible_y_tiene_respaldo():
    assert etiqueta_estado('COT', 'PENDIENTE_CONFIRMACION') == 'Esperando confirmación del cliente'
    assert etiqueta_estado('SC', 'N/A_SOPORTE') == 'Soporte'
    assert etiqueta_estado('VEN', 'PENDIENTE_ALGO') == 'Pendiente algo'
    assert etiqueta_estado('PXP', 'PAGADO') == 'Pagado'
    assert etiqueta_estado('COT', None) == ''
    assert etiqueta_estado('SC', None) == ''
    assert etiqueta_estado('VEN', None) == ''


def test_etiqueta_estado_vacio_o_en_blanco_da_cadena_vacia():
    assert etiqueta_estado('COT', '') == ''
    assert etiqueta_estado('VEN', '   ') == ''


def test_etiquetas_de_sc():
    assert ETIQUETAS_ESTADO['SC'] == {
        'BORRADOR': 'Borrador',
        'ASIGNADA': 'Asignada',
        'PENDIENTE_CONFIRMACION': 'Pendiente de confirmación',
        'COTIZADA': 'Cotizada',
        'EN_ESPERA_CONFIRMACION': 'En espera de confirmación',
        'CONFIRMADA': 'Confirmada',
        'RECHAZADA': 'Rechazada',
        'VENCIDA': 'Vencida',
        'CANCELADA': 'Cancelada',
        'N/A_SOPORTE': 'Soporte',
    }


def test_etiquetas_de_cot():
    assert ETIQUETAS_ESTADO['COT'] == {
        'BORRADOR': 'Borrador',
        'ENVIADA': 'Enviada al cliente',
        'PENDIENTE_CONFIRMACION': 'Esperando confirmación del cliente',
        'CONFIRMADA': 'Confirmada',
        'RECHAZADA': 'Rechazada',
        'VENCIDA': 'Vencida',
    }


def test_etiquetas_de_ven_cubren_los_18_estados_del_pedido_con_las_del_frontend():
    # Fuente unica con el frontend (N10, frontend/src/lib/estados-pedido.js): ningun estado del pedido depende
    # del respaldo humanizado (que no pone tildes: sin EN_TRANSITO en el mapa saldria 'En transito').
    assert ETIQUETAS_ESTADO['VEN'] == {
        # Ventas / Compras
        'PENDIENTE_COMPRA': 'Pendiente de compra',
        'EN_PROCESO': 'En proceso',
        'EN_TRANSITO': 'En tránsito',
        'LISTO_ENTREGA': 'Listo para entrega',
        'ENTREGADO': 'Entregado',
        'FACTURADO': 'Facturado',
        'CANCELADO': 'Cancelado',
        # tienda / webhooks
        'PENDIENTE_PAGO': 'Pendiente de pago',
        'PAGADO': 'Pagado',
        # fase4
        'BORRADOR': 'Borrador',
        'PENDIENTE_ANTICIPO': 'Pendiente de anticipo',
        'CONFIRMADO': 'Confirmado',
        'PARCIALMENTE_DISPONIBLE': 'Parcialmente disponible',
        'DISPONIBLE': 'Disponible',
        'PENDIENTE_SALDO': 'Pendiente de saldo',
        'LISTO_PARA_ENTREGA': 'Listo para entrega',
        'PARCIALMENTE_ENTREGADO': 'Entregado parcialmente',
        'DEVUELTO_TOTAL': 'Devuelto',
    }
    assert len(ETIQUETAS_ESTADO['VEN']) == 18
    assert etiqueta_estado('VEN', 'EN_TRANSITO') == 'En tránsito'
    assert etiqueta_estado('VEN', 'PARCIALMENTE_ENTREGADO') == 'Entregado parcialmente'
    assert etiqueta_estado('VEN', 'DEVUELTO_TOTAL') == 'Devuelto'
    assert etiqueta_estado('VEN', 'PENDIENTE_ANTICIPO') == 'Pendiente de anticipo'
    assert etiqueta_estado('VEN', 'PENDIENTE_SALDO') == 'Pendiente de saldo'


def test_ninguna_etiqueta_es_el_codigo_ni_lleva_guion_bajo():
    for entidad, mapa in ETIQUETAS_ESTADO.items():
        for codigo, etiqueta in mapa.items():
            assert etiqueta != codigo, f'{entidad}.{codigo}: la etiqueta es el codigo crudo'
            assert '_' not in etiqueta, f'{entidad}.{codigo}: {etiqueta!r} lleva guion bajo'
            assert etiqueta == etiqueta.strip() and etiqueta[0].isupper(), f'{entidad}.{codigo}: {etiqueta!r}'


def test_etiqueta_estado_resuelve_cada_codigo_del_mapa():
    for entidad, mapa in ETIQUETAS_ESTADO.items():
        for codigo, etiqueta in mapa.items():
            assert etiqueta_estado(entidad, codigo) == etiqueta


def test_etiqueta_estado_respaldo_para_estados_fuera_del_mapa():
    # Un estado nuevo que aun no esta en el mapa sale legible, nunca el codigo crudo.
    assert etiqueta_estado('VEN', 'PENDIENTE_ALGO') == 'Pendiente algo'
    assert etiqueta_estado('SC', 'EN_REVISION_TECNICA') == 'En revision tecnica'
    # Entidades que el mapa no cubre (PEC, PXP...) usan solo el respaldo.
    assert etiqueta_estado('PEC', 'BORRADOR') == 'Borrador'
    assert etiqueta_estado('PXP', 'PENDIENTE') == 'Pendiente'


def test_etiqueta_estado_acepta_pven_como_alias_de_ven():
    # fase4 registra la Actividad del pedido con entity_type 'PVEN'; el resto de Ventas usa 'VEN'.
    assert etiqueta_estado('PVEN', 'EN_TRANSITO') == 'En tránsito'
    assert etiqueta_estado('PVEN', 'LISTO_ENTREGA') == 'Listo para entrega'


def test_etiqueta_estado_ignora_espacios_alrededor_del_codigo():
    assert etiqueta_estado('SC', ' ASIGNADA ') == 'Asignada'
    assert etiqueta_estado('VEN', 'PENDIENTE_ALGO ') == 'Pendiente algo'
