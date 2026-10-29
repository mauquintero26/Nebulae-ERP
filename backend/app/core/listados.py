"""Parámetros comunes de las listas del ERP: estados en CSV, búsqueda, orden, conteos por vista y paginación.

Bloque 4, T1A (TABLA-api punto 1 fusionado con el punto 7 de KANBAN-base; C8, R5, R27): es el ÚNICO módulo de
parámetros de lista (no hay core/filtros_lista.py). Cada endpoint de lista (T6, T12, T13 y T20) lo aplica así:
- 'estados' (CSV, máximo MAX_ESTADOS) es el parámetro nuevo; 'estado' (un valor) se conserva por compatibilidad y pasa
  por la misma filtrar_por_estados.
- 'q' es la búsqueda de la tabla estándar y 'search' sigue como alias: texto_busqueda(q, search) (RP8).
- 'orden' = 'campo' o '-campo' de la lista blanca del endpoint, más sus órdenes especiales ('atencion',
  'sin_movimiento' y 'reciente'), con leer_orden. El texto recibido nunca llega al SQL. Las listas que se ordenan en
  Python (la lista de compras, el catálogo de dos fuentes) validan con validar_orden: la misma regla y el mismo 422.
- Toda orden termina en `id_lista desc`, el id de la FILA que se lista (r1): así la paginación es estable aunque se
  ordene por una columna de una tabla unida (el nombre del cliente de un pedido).
- limit = Query(<el de hoy>, ge=0, le=200); limit=0 devuelve solo el total (paginar). offset = Query(0, ge=0,
  le=MAX_OFFSET) (B4 T6A r1, M14): sin techo, un offset enorme llegaba al SQL y PostgreSQL respondia «bigint out of
  range» (un 500); con el, el manejador global responde el 400 legible, que R21 acepta para la paginacion.
- con_conteos se calcula con contar_por_vista, con la búsqueda y los filtros extra pero SIN vista, estados, semáforo,
  paso ni columna.
Sin los parámetros nuevos cada lista responde lo mismo que hoy; el único agregado es el desempate final por el id de la fila, que fija el orden entre empates.

Errores (RP9 y su ajuste): leer_orden y validar_orden lanzan HTTPException(422, 'No se puede ordenar por «x».');
leer_lista (más de MAX_ESTADOS) y orden_tiempo (un valor que no vale) lanzan ValueError, que el endpoint convierte en
422 con str(e). B4 T6A r1 (M13): texto_busqueda y leer_lista lanzan además ValueError(MENSAJE_CONTROL) si el texto
trae un carácter de control (NUL incluido: psycopg2 no adapta un NUL y la petición daba 500); los espacios de control
interiores (tabulador, saltos de línea…) pasan a un espacio, no son un error (revisión de T6A r1). Los parámetros de negocio
se validan a mano (R21): el manejador global convierte los RequestValidationError en un 400 técnico en inglés.

Las funciones que solo arman la consulta (filtrar_por_estados, orden_tiempo) sirven con un Query de la sesión o con un
select(); las que la ejecutan (contar_por_vista, paginar) reciben el Query de la sesión, como las listas de hoy (un
Select o un UNION se envuelve en db.query(<subconsulta>)).
"""
import re
import unicodedata

from fastapi import HTTPException
from sqlalchemy import case, func

MAX_ESTADOS = 20
# B4 T6A r1 (M14): el techo del offset de las listas, para Query(0, ge=0, le=MAX_OFFSET).
MAX_OFFSET = 1_000_000
MENSAJE_CONTROL = "La búsqueda no puede llevar caracteres de control."
# Órdenes que cada endpoint define a su manera y que no tienen sentido al revés: '-atencion', '-sin_movimiento' y
# '-reciente' dan 422. leer_orden no sabe qué significan (RP9): solo las usa para ese chequeo.
ORDENES_ESPECIALES = ("atencion", "sin_movimiento", "reciente")


def _no_se_puede_ordenar(orden) -> str:
    return f"No se puede ordenar por «{orden}»."


# Los caracteres de control que son espacios (str.isspace): tabulador, saltos de línea, \v, \f, los separadores
# \x1c-\x1f y NEL. Un tramo de ellos en medio del texto (pegado de una hoja de cálculo) pasa a un espacio.
_ESPACIOS_DE_CONTROL = re.compile(r"[\t\n\x0b\x0c\r\x1c-\x1f\x85]+")


def _sin_caracteres_de_control(texto: str) -> str:
    """`texto` con cada tramo de espacios de control interiores (tabulador, saltos de línea…) cambiado por un espacio,
    o ValueError(MENSAJE_CONTROL) si trae otro carácter de control (categoría Unicode Cc: NUL, los demás de C0 y C1, y
    DEL). Se aplica al texto ya recortado: los de los bordes se quitan antes, como siempre (T6A r1, M13; revisión de r1:
    un tabulador en medio no es un error)."""
    texto = _ESPACIOS_DE_CONTROL.sub(" ", texto)
    if any(unicodedata.category(ch) == "Cc" for ch in texto):
        raise ValueError(MENSAJE_CONTROL)
    return texto


def leer_lista(valor, maximo: int = MAX_ESTADOS) -> list[str]:
    """'A, B,,A' -> ['A', 'B']: separa por coma, quita los espacios de los bordes, los vacíos y los repetidos (conserva
    el orden en que llegaron). None o '' -> []. También acepta una lista de textos (cada uno puede traer comas; los None
    y los vacíos se descartan).

    Con más de `maximo` valores distintos lanza ValueError('Puedes filtrar por 20 estados como máximo.'), y con un
    carácter de control en un valor, ValueError(MENSAJE_CONTROL) (T6A r1); el endpoint responde 422 con str(e). Los
    espacios de control interiores (tabulador, saltos de línea…) pasan a un espacio."""
    if valor is None:
        return []
    if isinstance(valor, str):
        partes = valor.split(",")
    else:
        partes = [p for v in valor if v is not None for p in str(v).split(",")]
    lista: list[str] = []
    for parte in partes:
        parte = _sin_caracteres_de_control(parte.strip())
        if parte and parte not in lista:
            lista.append(parte)
    if len(lista) > maximo:
        raise ValueError(f"Puedes filtrar por {maximo} estados como máximo.")
    return lista


def texto_busqueda(q, search) -> str | None:
    """La búsqueda de una lista (RP8): gana `q` (la de la tabla estándar) y `search` sigue como alias para los
    selectores, la tienda, el Dashboard, el Asistente y las pruebas. Se quitan los espacios de los bordes; un texto
    vacío (o solo espacios) da None. Un `q` en blanco no tapa un `search` con texto. Si el texto que se usa trae un
    carácter de control, lanza ValueError(MENSAJE_CONTROL) (T6A r1, M13); el endpoint responde 422 con str(e). Los
    espacios de control interiores (tabulador, saltos de línea…) pasan a un espacio: no son un error."""
    for texto in (q, search):
        if texto is not None and texto.strip():
            return _sin_caracteres_de_control(texto.strip())
    return None


def filtrar_por_estados(q, columna, valor):
    """Filtra `q` por los estados de `valor` (CSV o lista, con leer_lista):
    - ninguno -> `q` sin cambios (el mismo objeto);
    - uno -> columna == estado (la misma consulta de hoy con ?estado=);
    - varios -> columna IN (...).
    Con más de MAX_ESTADOS lanza el ValueError de leer_lista."""
    estados = leer_lista(valor)
    if not estados:
        return q
    if len(estados) == 1:
        return q.filter(columna == estados[0])
    return q.filter(columna.in_(estados))


def validar_orden(orden, claves, por_defecto: str) -> tuple[str, bool]:
    """(clave, descendente) de un 'orden' recibido, sin expresiones SQL. `orden` es 'campo' o '-campo'; None o en
    blanco -> `por_defecto`. `claves` son las claves permitidas: una tupla, una lista, un conjunto o el dict de
    leer_orden (un str lanza TypeError: es un error de programación). Una clave que no
    está, '-atencion', '-sin_movimiento' o '-reciente' -> HTTPException(422, 'No se puede ordenar por «x».'), con la
    «x» recortada. La usan leer_orden y las listas que se ordenan en Python (list_lista_compras, el catálogo)."""
    clave = (orden or "").strip() or por_defecto
    descendente = clave.startswith("-")
    campo = clave[1:] if descendente else clave
    if isinstance(claves, str):  # ("fecha") no es una tupla: dejaría pasar cualquier subcadena
        raise TypeError("validar_orden: claves debe ser una tupla, una lista, un conjunto o un dict.")
    if campo not in claves or (descendente and campo in ORDENES_ESPECIALES):
        raise HTTPException(status_code=422, detail=_no_se_puede_ordenar(clave))
    return campo, descendente


def _clausula(expr):
    """La expresión SQL de un atributo del modelo (SaleOrder.id) o la misma expresión."""
    a_clausula = getattr(expr, "__clause_element__", None)
    return a_clausula() if a_clausula is not None else expr


def _con_id_al_final(expresiones, id_lista) -> list:
    """Las expresiones de order_by con `id_lista desc` al final, sin repetirlo si ya es la última."""
    final = id_lista.desc()
    expresiones = list(expresiones)
    if expresiones:
        ultima = _clausula(expresiones[-1])
        if hasattr(ultima, "compare") and ultima.compare(_clausula(final)):
            return expresiones
    return expresiones + [final]


def leer_orden(orden, permitidas: dict, por_defecto: str, *, id_lista) -> list:
    """El orden de una lista, como lista de expresiones para order_by(*...).

    `orden` es 'campo' (ascendente) o '-campo' (descendente); None o en blanco -> `por_defecto` (una clave de
    `permitidas`, con la misma regla; ver validar_orden). Cada clave de `permitidas` apunta a:
    - una columna (o una expresión, como orden_por_lista o una columna de una tabla unida): se ordena con nulls_last();
    - una lista de expresiones de order_by: va tal cual, en el orden que fija la lista. Así pone cada endpoint sus
      órdenes especiales ('atencion': [rango, ...]; 'reciente' y 'sin_movimiento' con expresiones_tiempo). Como la
      dirección la fija la lista, '-clave' da 422.
    `id_lista` (obligatorio, solo por nombre) es la columna id de la entidad que se lista (SaleOrder.id) o de la
    subconsulta o UNION que se pagina. TODA orden termina en `id_lista desc` (si una lista ya lo trae al final, no se
    repite): es el desempate que hace estable la paginación con LIMIT/OFFSET.
    Una clave que no está, '-atencion', '-sin_movimiento', '-reciente' o '-' sobre una lista -> HTTPException(422,
    'No se puede ordenar por «x».') (RP9, ajuste). El texto recibido nunca llega al SQL: solo se usa como clave."""
    campo, descendente = validar_orden(orden, permitidas, por_defecto)
    destino = permitidas[campo]
    if isinstance(destino, (list, tuple)):
        if descendente:
            raise HTTPException(status_code=422, detail=_no_se_puede_ordenar(f"-{campo}"))
        return _con_id_al_final(destino, id_lista)
    principal = destino.desc() if descendente else destino.asc()
    return _con_id_al_final([principal.nulls_last()], id_lista)


def expresiones_tiempo(creado, actualizado, orden, *, id_lista) -> list:
    """Las expresiones de order_by de 'reciente' y 'sin_movimiento' (KANBAN-base), con el desempate final por
    `id_lista desc`:
    - 'reciente' (por defecto, también con None o '') = creado desc, el order_by de las listas de hoy (R5; en PostgreSQL
      los NULL quedan primero, como hoy);
    - 'sin_movimiento' = coalesce(actualizado, creado) asc y luego creado asc, los dos con los nulos al final (el que
      lleva más tiempo quieto arriba).
    Otro valor -> ValueError('No se puede ordenar por «x».'), que el endpoint convierte en 422 con str(e) (RP9).
    Sirven para poner esas dos órdenes en `permitidas` de leer_orden (que no repite el id)."""
    clave = (orden or "").strip() or "reciente"
    if clave == "reciente":
        expresiones = [creado.desc()]
    elif clave == "sin_movimiento":
        expresiones = [func.coalesce(actualizado, creado).asc().nulls_last(), creado.asc().nulls_last()]
    else:
        raise ValueError(_no_se_puede_ordenar(clave))
    return _con_id_al_final(expresiones, id_lista)


def orden_tiempo(q, creado, actualizado, orden, *, id_lista):
    """`q` ordenado por 'reciente' o 'sin_movimiento' (ver expresiones_tiempo). Reemplaza el aplicar_orden de
    KANBAN-base (C8). Otro valor -> ValueError('No se puede ordenar por «x».')."""
    return q.order_by(*expresiones_tiempo(creado, actualizado, orden, id_lista=id_lista))


def orden_por_lista(col, lista):
    """CASE que ordena `col` por su posición en `lista` (un estado por su lugar en el flujo, no alfabéticamente). Lo que
    no está en la lista va al final."""
    return case({valor: i for i, valor in enumerate(lista)}, value=col, else_=len(lista))


def contar_por_vista(q, vistas: dict) -> dict:
    """{vista: n} en UNA consulta, con count(*) FILTER (WHERE condición) por vista; una condición None cuenta todo.

    `q` es el Query de la lista con la búsqueda y los filtros extra, pero SIN vista, estados, semáforo, paso ni columna
    (R5). Su orden y sus opciones de carga (selectinload) no estorban: se quitan para contar. La consulta siempre sale
    de las tablas de `q`, aunque ninguna condición las nombre (sin eso, un count(*) sin FROM daría 1)."""
    if not vistas:
        return {}
    claves = list(vistas)
    columnas = [(func.count() if cond is None else func.count().filter(cond)).label(f"vista_{i}")
                for i, cond in enumerate(vistas.values())]
    base = q.order_by(None).enable_eagerloads(False)
    tablas = base.statement.get_final_froms()
    conteo = base.with_entities(*columnas)
    if not conteo.statement.get_final_froms():
        conteo = conteo.select_from(*tablas)
    fila = conteo.one()
    return {clave: int(fila[i] or 0) for i, clave in enumerate(claves)}


def paginar(q, limit, offset) -> tuple[int, list]:
    """(total, items) de un Query ya filtrado y ordenado: total cuenta todo el filtro y items es solo la página
    (offset, limit). Con limit=0 no se trae ninguna fila: (total, []), para los números de las pestañas y de las
    columnas plegadas del Kanban. limit=None trae todo desde offset."""
    total = q.order_by(None).count()
    if limit == 0:
        return total, []
    pagina = q.offset(offset or 0)
    if limit is not None:
        pagina = pagina.limit(limit)
    return total, pagina.all()


def respuesta(total, data, conteos=None, resumen=None, **extra) -> dict:
    """El cuerpo de una lista: {status, total, data}, más 'conteos' y 'resumen' solo si se pasaron (no None), y las
    claves propias del endpoint (por ejemplo los grupos del Hub) tal cual."""
    cuerpo = {"status": "success", "total": total, "data": data}
    if conteos is not None:
        cuerpo["conteos"] = conteos
    if resumen is not None:
        cuerpo["resumen"] = resumen
    cuerpo.update(extra)
    return cuerpo
