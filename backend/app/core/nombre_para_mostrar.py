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
    - que no sea texto o que traiga caracteres de control -> NombreParaMostrarInvalido(MENSAJE_NOMBRE_PARA_MOSTRAR);
    - quita los espacios de los bordes y junta los de adentro en uno (también el espacio duro); si no queda nada, None;
    - menos de LARGO_MINIMO o más de LARGO_MAXIMO caracteres -> MENSAJE_LARGO_NOMBRE_PARA_MOSTRAR;
    - con '@' (también el de ancho completo: se mira la forma NFKC) o si es_de_un_usuario(clave) -> el
      MENSAJE_NOMBRE_PARA_MOSTRAR. clave es el nombre en NFKC y casefold: el correo o el usuario de entrada de cualquier
      User, sin mayúsculas, nunca sirven como nombre para mostrar."""
    if valor is None:
        return None
    if not isinstance(valor, str) or _tiene_caracteres_de_control(valor):
        raise NombreParaMostrarInvalido(MENSAJE_NOMBRE_PARA_MOSTRAR)
    texto = " ".join(valor.split())
    if not texto:
        return None
    if not LARGO_MINIMO <= len(texto) <= LARGO_MAXIMO:
        raise NombreParaMostrarInvalido(MENSAJE_LARGO_NOMBRE_PARA_MOSTRAR)
    clave = unicodedata.normalize("NFKC", texto).casefold()
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
