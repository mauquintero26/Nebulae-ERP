"""Tope de tamaño del cuerpo para las rutas públicas sin login (Bloque 3, T20: M19, M3 y M9; punto 6 de lo parqueado).

FastAPI lee el cuerpo entero a memoria y hace json.loads ANTES de resolver las dependencias (el token, el
Idempotency-Key, el tope del comentario). En /api/v1/confirmar/, /api/v1/pedido-cliente/ y /api/v1/publico/ cualquiera
en internet, sin sesión ni enlace, podía mandar cuerpos de cientos de MB y llenar la memoria de los workers.

LimiteDeCuerpo es un middleware ASGI puro (no BaseHTTPMiddleware) que se aplica SOLO a esos prefijos (PREFIJOS), con un
tope de LIMITE_BYTES (64 KB). Las demás rutas no se tocan: un tope global podría romper cargas e importaciones fuera del
bloque (el logo de la empresa, por ejemplo).
- Con Content-Length mayor que el tope: 413 {"detail": MENSAJE_413} sin leer el cuerpo.
- Sin Content-Length (chunked) o con uno que no se puede leer: envuelve receive(), cuenta los bytes y, al pasarse, corta
  con el mismo 413 (_CuerpoDemasiadoGrande es una HTTPException: FastAPI la vuelve a lanzar desde la lectura del cuerpo
  y su manejador responde el 413; si llegara hasta aquí, se responde aquí mismo, siempre que la respuesta no haya
  empezado).
Va registrado en main.py POR DENTRO de CORSMiddleware (se agrega antes), así el 413 sale con los encabezados CORS y el
navegador no lo convierte en «Failed to fetch» (ver test_cors_headers_on_error y el comentario de main.py).
El tope del proxy (Traefik de EasyPanel) es aparte y lo decide el usuario.
"""
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse

PREFIJOS = ("/api/v1/confirmar/", "/api/v1/pedido-cliente/", "/api/v1/publico/")
LIMITE_BYTES = 65536
MENSAJE_413 = "La petición es demasiado grande."


class _CuerpoDemasiadoGrande(HTTPException):
    """El cuerpo pasó el tope mientras se leía (sin Content-Length o con uno que no decía la verdad)."""

    def __init__(self):
        super().__init__(status_code=413, detail=MENSAJE_413)


def _content_length(scope) -> int | None:
    """El Content-Length declarado, o None si no viene o no es un entero >= 0 (entonces se cuentan los bytes)."""
    for nombre, valor in scope.get("headers") or []:
        if nombre.lower() == b"content-length":
            try:
                largo = int(valor.decode("latin-1").strip())
            except ValueError:
                return None
            return largo if largo >= 0 else None
    return None


async def _responder_413(scope, receive, send) -> None:
    await JSONResponse({"detail": MENSAJE_413}, status_code=413)(scope, receive, send)


class LimiteDeCuerpo:
    """Middleware ASGI: 413 si el cuerpo de una ruta de PREFIJOS pasa de `limite` bytes (ver el docstring del módulo)."""

    def __init__(self, app, limite: int = LIMITE_BYTES, prefijos: tuple = PREFIJOS):
        self.app = app
        self.limite = limite
        self.prefijos = tuple(prefijos)

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or not str(scope.get("path") or "").startswith(self.prefijos):
            await self.app(scope, receive, send)
            return
        declarado = _content_length(scope)
        if declarado is not None and declarado > self.limite:
            await _responder_413(scope, receive, send)
            return
        leidos = 0
        empezo = False

        async def receive_con_tope():
            nonlocal leidos
            mensaje = await receive()
            if mensaje.get("type") == "http.request":
                leidos += len(mensaje.get("body") or b"")
                if leidos > self.limite:
                    raise _CuerpoDemasiadoGrande()
            return mensaje

        async def send_vigilado(mensaje):
            nonlocal empezo
            if mensaje.get("type") == "http.response.start":
                empezo = True
            await send(mensaje)

        try:
            await self.app(scope, receive_con_tope, send_vigilado)
        except _CuerpoDemasiadoGrande:
            if empezo:
                raise
            await _responder_413(scope, receive, send)
