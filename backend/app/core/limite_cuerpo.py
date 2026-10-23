"""Tope de tamaño del cuerpo de las peticiones (Bloque 3, T20: M19, M3 y M9; punto 6 de lo parqueado; revisión final
F1, M55: por niveles).

FastAPI lee el cuerpo entero a memoria y hace json.loads ANTES de resolver las dependencias (el login, el token, el
Idempotency-Key, el tope del comentario): cualquiera en internet, sin sesión, podía mandar cuerpos de cientos de MB a
cualquier ruta con cuerpo y llenar la memoria de los workers. Los webhooks, además, leen el cuerpo con request.body()
ANTES de mirar la firma (el HMAC necesita el cuerpo entero).

LimiteDeCuerpo es un middleware ASGI puro (no BaseHTTPMiddleware) con un tope por niveles (NIVELES, ruling del
controlador en la revisión final; el primer prefijo que coincide gana):
- LIMITE_BYTES (64 KB): PREFIJOS, las páginas públicas sin login (/api/v1/confirmar/, /api/v1/pedido-cliente/,
  /api/v1/publico/) y /api/v1/auth/ (login, forgot y reset-password, username y nombre para mostrar);
- LIMITE_WEBHOOKS (1 MB): PREFIJOS_WEBHOOKS, las rutas de webhooks.py (/api/v1/webhooks/) y de whatsapp_webhook.py
  (/api/v1/whatsapp/), y los webhooks de chat.py (/api/v1/chat/webhook/: WhatsApp, Instagram y Chatwoot);
- LIMITE_GENERAL (25 MB): todo lo demás. Hoy ningún endpoint recibe archivos (no hay UploadFile ni multipart); lo más
  grande que llega es el logo de la empresa (PUT /api/v1/empresa: 300 KB en base64, unos 400 KB de JSON).
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

PREFIJOS = ("/api/v1/confirmar/", "/api/v1/pedido-cliente/", "/api/v1/publico/", "/api/v1/auth/")
LIMITE_BYTES = 65536
PREFIJOS_WEBHOOKS = ("/api/v1/webhooks/", "/api/v1/whatsapp/", "/api/v1/chat/webhook/")
LIMITE_WEBHOOKS = 1024 * 1024
LIMITE_GENERAL = 25 * 1024 * 1024
NIVELES = ((PREFIJOS, LIMITE_BYTES), (PREFIJOS_WEBHOOKS, LIMITE_WEBHOOKS))
MENSAJE_413 = "La petición es demasiado grande."


def limite_de_la_ruta(ruta: str, niveles=NIVELES, limite_general: int = LIMITE_GENERAL) -> int:
    """El tope en bytes del cuerpo de `ruta` (la del router, sin root_path): el del primer nivel cuyo prefijo coincide,
    o limite_general."""
    for prefijos, limite in niveles:
        if ruta.startswith(tuple(prefijos)):
            return limite
    return limite_general


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


def _ruta_del_router(scope) -> str:
    """T20 r2 (M1): la ruta que compara el router: scope['path'] sin el root_path (con uvicorn y un root_path, path ya
    lo trae), como starlette._utils.get_route_path. Sin esto, publicar el backend detrás de un prefijo saltaba el
    tope."""
    ruta = str(scope.get("path") or "")
    raiz = str(scope.get("root_path") or "")
    if raiz and ruta.startswith(raiz) and (len(ruta) == len(raiz) or ruta[len(raiz)] == "/"):
        return ruta[len(raiz):]
    return ruta


async def _responder_413(scope, receive, send) -> None:
    await JSONResponse({"detail": MENSAJE_413}, status_code=413)(scope, receive, send)


class LimiteDeCuerpo:
    """Middleware ASGI: 413 si el cuerpo pasa del tope de su ruta (limite_de_la_ruta; ver el docstring del módulo)."""

    def __init__(self, app, niveles=NIVELES, limite_general: int = LIMITE_GENERAL):
        self.app = app
        self.niveles = tuple((tuple(prefijos), limite) for prefijos, limite in niveles)
        self.limite_general = limite_general

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        limite = limite_de_la_ruta(_ruta_del_router(scope), self.niveles, self.limite_general)
        declarado = _content_length(scope)
        if declarado is not None and declarado > limite:
            await _responder_413(scope, receive, send)
            return
        leidos = 0
        empezo = False

        async def receive_con_tope():
            nonlocal leidos
            mensaje = await receive()
            if mensaje.get("type") == "http.request":
                leidos += len(mensaje.get("body") or b"")
                if leidos > limite:
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
