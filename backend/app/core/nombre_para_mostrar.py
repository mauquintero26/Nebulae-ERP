"""El «Nombre para mostrar» de un usuario (Bloque 3, T20b: decisión del usuario en la revisión visual).

Es como verá el cliente a su asesor en los documentos (users.nombre_para_mostrar, fa6_032). Lo llena la Administración
con PATCH /auth/users/{id}/nombre-para-mostrar (solo ADMIN) y lo lee documento_cliente.asesor_publico, el único
resolvedor del asesor público.

validar_nombre_para_mostrar es la regla, pura: no toca la base. Quien la llama le pasa cómo saber si un texto es el
correo o el usuario de entrada de algún User (es_de_un_usuario, la consulta de abajo). La misma regla se usa al
guardar (el endpoint) y al leer (nombre_para_mostrar_vigente): un nombre guardado que después coincide con el usuario de
entrada de alguien, o que llegó a la base sin pasar por aquí, nunca sale a una página pública, un correo ni un PDF
(C0 de T20: auth.py acepta el correo o el username para entrar al ERP).
"""
import unicodedata

LARGO_MINIMO = 2
LARGO_MAXIMO = 80
MENSAJE_NOMBRE_PARA_MOSTRAR = ("Escribe el nombre como lo verá el cliente (por ejemplo, «Laura Gómez»), sin correos ni "
                               "nombres de usuario.")
MENSAJE_LARGO_NOMBRE_PARA_MOSTRAR = "El nombre para mostrar debe tener entre 2 y 80 caracteres."
# F1 (M37): los rellenos de Hangul que Unicode clasifica como letras (Lo) pero no se ven: «ㅤㅤ» dejaria «Atendido por: »
# en blanco en la página, el correo y el PDF.
_RELLENOS_INVISIBLES = frozenset("\u115f\u1160\u3164\uffa0")


def clave_publica(texto: str) -> str:
    """F1 (M35, M36): la clave de un nombre para compararlo con los correos y usuarios de entrada de los User y con los
    nombres para mostrar: NFKC (el ancho completo y las ligaduras pasan a su forma simple), los espacios juntos en uno y
    casefold (sin mayúsculas). La UNICA regla: la usan validar_nombre_para_mostrar, documento_cliente.
    nombre_asesor_publico (el respaldo sobre advisor_name) y PATCH /auth/username."""
    return " ".join(unicodedata.normalize("NFKC", texto).split()).casefold()


def _quitar_bordes(texto: str) -> str:
    """F1 (M37): sin los espacios (Zs), los caracteres de formato (Cf: U+200B, U+FEFF, U+200E...), el tabulador ni el
    salto de línea de los BORDES, que trae un nombre pegado de otro programa. En el medio siguen siendo inválidos."""
    def de_borde(c):
        return c in "\t\n" or unicodedata.category(c) in ("Zs", "Cf")
    inicio, fin = 0, len(texto)
    while inicio < fin and de_borde(texto[inicio]):
        inicio += 1
    while fin > inicio and de_borde(texto[fin - 1]):
        fin -= 1
    return texto[inicio:fin]


def _visibles(texto: str) -> int:
    """F1 (M37): cuántos caracteres se ven de verdad: letras y números (L* y N*), sin los rellenos invisibles."""
    return sum(1 for c in texto if unicodedata.category(c)[0] in "LN" and c not in _RELLENOS_INVISIBLES)


class NombreParaMostrarInvalido(ValueError):
    """El nombre no cumple la regla; `mensaje` es el texto del 400 para la pantalla."""

    def __init__(self, mensaje: str):
        super().__init__(mensaje)
        self.mensaje = mensaje


def _tiene_caracteres_de_control(texto: str) -> bool:
    """Cualquier carácter de las categorías C de Unicode: control (Cc, también el tab y el salto de línea), formato
    (Cf: los invisibles y los que cambian la dirección del texto), surrogates sueltos (Cs: PostgreSQL no los guarda),
    uso privado (Co) y sin asignar (Cn)."""
    return any(unicodedata.category(c).startswith("C") for c in texto)


def validar_nombre_para_mostrar(valor, es_de_un_usuario) -> str | None:
    """El nombre listo para guardar, o None si viene vacío (borra el nombre). En este orden:
    - None -> None;
    - que no sea texto -> NombreParaMostrarInvalido(MENSAJE_NOMBRE_PARA_MOSTRAR);
    - F1 (M37): quita de los bordes los caracteres de formato (Cf), el tabulador y el salto de línea (_quitar_bordes);
    - que traiga caracteres de control (también un tabulador o un salto de línea en el medio) -> el
      MENSAJE_NOMBRE_PARA_MOSTRAR;
    - quita los espacios de los bordes y junta los de adentro en uno (también el espacio duro); si no queda nada, None;
    - F1 (M37): lo pasa a NFC ANTES de medir y de guardar (un nombre pegado en NFD, desde macOS, queda igual que en NFC);
    - menos de LARGO_MINIMO o más de LARGO_MAXIMO caracteres -> MENSAJE_LARGO_NOMBRE_PARA_MOSTRAR;
    - F1 (M37): menos de LARGO_MINIMO caracteres visibles (_visibles: letras o números, sin los rellenos invisibles de
      Hangul) -> MENSAJE_NOMBRE_PARA_MOSTRAR;
    - con '@' (también el de ancho completo) o si es_de_un_usuario(clave) -> el MENSAJE_NOMBRE_PARA_MOSTRAR. clave es
      clave_publica(nombre) (NFKC y casefold): el correo o el usuario de entrada de cualquier User, sin mayúsculas,
      nunca sirven como nombre para mostrar."""
    if valor is None:
        return None
    if not isinstance(valor, str):
        raise NombreParaMostrarInvalido(MENSAJE_NOMBRE_PARA_MOSTRAR)
    valor = _quitar_bordes(valor)
    if _tiene_caracteres_de_control(valor):
        raise NombreParaMostrarInvalido(MENSAJE_NOMBRE_PARA_MOSTRAR)
    texto = " ".join(valor.split())
    if not texto:
        return None
    texto = unicodedata.normalize("NFC", texto)
    if not LARGO_MINIMO <= len(texto) <= LARGO_MAXIMO:
        raise NombreParaMostrarInvalido(MENSAJE_LARGO_NOMBRE_PARA_MOSTRAR)
    if _visibles(texto) < LARGO_MINIMO:
        raise NombreParaMostrarInvalido(MENSAJE_NOMBRE_PARA_MOSTRAR)
    clave = clave_publica(texto)
    if "@" in clave or es_de_un_usuario(clave):
        raise NombreParaMostrarInvalido(MENSAJE_NOMBRE_PARA_MOSTRAR)
    return texto


def es_de_un_usuario(db, clave: str) -> bool:
    """`clave` (ya sin mayúsculas: casefold) es el correo o el usuario de entrada de algún User, comparados sin
    mayúsculas ni espacios en los bordes. Los usernames son ASCII (auth.USERNAME_PATTERN) y un correo siempre lleva
    '@', así que lower() en SQL y casefold() dan lo mismo. La usan validar_nombre_para_mostrar (por el endpoint y por
    nombre_para_mostrar_vigente) y documento_cliente.nombre_asesor_publico."""
    from sqlalchemy import func, or_
    from app.models.users import User
    return db.query(User.id).filter(or_(func.lower(func.trim(User.email)) == clave,
                                        func.lower(func.trim(User.username)) == clave)).first() is not None


def nombre_para_mostrar_vigente(db, guardado) -> str | None:
    """El nombre para mostrar guardado si HOY cumple la regla (normalizado), o None."""
    try:
        return validar_nombre_para_mostrar(guardado, lambda clave: es_de_un_usuario(db, clave))
    except NombreParaMostrarInvalido:
        return None
