"""Captura los registros (logging) de un logger dentro de una prueba, sin que salgan por la consola.

El runner de ROLLBACK no tiene la fixture caplog de pytest. registro_capturado(nombre) agrega un handler propio al logger
`nombre`, apaga su propagación mientras dura el bloque (así la salida de la prueba queda limpia) y al salir quita el
handler y devuelve la propagación como estaba. Entrega la lista de LogRecord.

    with registro_capturado("app.core.documento_cliente") as registros:
        ...
    assert registros[0].levelname == "WARNING"
"""
import contextlib
import logging


@contextlib.contextmanager
def registro_capturado(nombre):
    registros = []

    class _Captura(logging.Handler):
        def emit(self, record):
            registros.append(record)

    registro = logging.getLogger(nombre)
    handler, propagaba = _Captura(level=logging.DEBUG), registro.propagate
    registro.addHandler(handler)
    registro.propagate = False
    try:
        yield registros
    finally:
        registro.removeHandler(handler)
        registro.propagate = propagaba
