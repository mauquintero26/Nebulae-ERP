"""Lectura y escritura de admin_config en un solo lugar (Bloque 3, T2, RP17).

Antes cada modulo tenia su SELECT (_get_alert_days) o su upsert (update_config). Aqui viven los tres helpers que usan
core/empresa.py, update_config y las tareas siguientes del bloque (T3 iva_tarifa_defecto, T7 dias_validez_cotizacion,
T8 envio_whatsapp_*, T10 tareas_*, T11 seguimiento_*):

- leer_config(db, claves) -> {clave: valor}: UN SELECT parametrizado (key = ANY(:claves)); las claves que no existen no
  aparecen (quien llama pone su valor por defecto).
- claves_existentes(db, claves) -> set: cuales existen, SIN traer sus valores (el logo de la empresa pesa ~400 KB).
- config_entero(db, clave, defecto, minimo, maximo) -> int: R13. Un valor que no es entero usa el defecto; uno fuera de
  rango, el limite. entero_acotado es la misma regla sin base de datos.
- guardar_config(db, cambios): el upsert ON CONFLICT de update_config, parametrizado; un valor None BORRA la clave (vuelve
  a su valor por defecto). No hace commit: lo confirma quien llama, junto con su renglon de Actividad.

Sin FastAPI. Nada de aqui valida reglas de negocio: eso lo hace quien llama (empresa.validar_cambios, _validar_config).
"""
from sqlalchemy import text
from sqlalchemy.orm import Session

_UPSERT = text("INSERT INTO admin_config (key, value, updated_at) VALUES (:k, :v, NOW()) "
               "ON CONFLICT (key) DO UPDATE SET value = :v, updated_at = NOW()")
_BORRAR = text("DELETE FROM admin_config WHERE key = :k")


def leer_config(db: Session, claves) -> dict:
    """{clave: valor} de las `claves` que existen en admin_config, con un solo SELECT. Sin claves, {} sin consultar."""
    claves = list(claves)
    if not claves:
        return {}
    filas = db.execute(text("SELECT key, value FROM admin_config WHERE key = ANY(:claves)"),
                       {"claves": claves}).fetchall()
    return {clave: valor for clave, valor in filas}


def claves_existentes(db: Session, claves) -> set:
    """Las `claves` que existen en admin_config, con un solo SELECT de key (no lee los valores). Sin claves, set()."""
    claves = list(claves)
    if not claves:
        return set()
    filas = db.execute(text("SELECT key FROM admin_config WHERE key = ANY(:claves)"), {"claves": claves}).fetchall()
    return {fila[0] for fila in filas}


def entero_acotado(valor, defecto: int, minimo: int, maximo: int) -> int:
    """El entero de `valor` (texto como se guarda en admin_config, o int) acotado a [minimo, maximo]. None, un texto que
    no es un entero ('abc', '5.5', '') o un bool -> defecto. Un valor fuera de rango usa el limite (R13)."""
    if isinstance(valor, bool):
        return defecto
    if isinstance(valor, int):
        n = valor
    else:
        try:
            n = int(str(valor).strip())
        except (TypeError, ValueError):
            return defecto
    return max(minimo, min(maximo, n))


def config_entero(db: Session, clave: str, defecto: int, minimo: int, maximo: int) -> int:
    """El valor entero de `clave` en admin_config, acotado como entero_acotado (ausente -> defecto)."""
    return entero_acotado(leer_config(db, [clave]).get(clave), defecto, minimo, maximo)


def guardar_config(db: Session, cambios: dict) -> None:
    """Escribe {clave: valor} en admin_config: upsert de str(valor), o DELETE si el valor es None. Sin commit."""
    for clave, valor in cambios.items():
        if valor is None:
            db.execute(_BORRAR, {"k": clave})
        else:
            db.execute(_UPSERT, {"k": clave, "v": str(valor)})
