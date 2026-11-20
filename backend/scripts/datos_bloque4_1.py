"""
datos_bloque4_1.py -- Revisa los DATOS QUE YA EXISTEN y que el Bloque 4.1 de Ventas necesita mirar antes de promover A1-b
(el esquema de ids del catálogo de la tienda, tarea 2). Todo es de SOLO LECTURA, salvo una corrección
(catalogo_ids --aplicar) que solo se corre con el OK explícito del usuario, por ambiente (erp_test y producción por
separado).

Qué cambia A1-b: GET /ecommerce/catalogo sirve las filas de ecommerce_products con su id (> 0) y los SKU del ERP con
-product_skus.id (< 0), en las dos ramas. En la rama heredada (la de producción) solo cambia el id de las filas que vienen de
un SKU del ERP sin espejo en ecommerce_products: su URL de la tienda pasa de /store/producto/n a /store/producto/-n. Los ids
del catálogo no se guardan en ninguna tabla, salvo social_posts.producto_id: Marketing › Historias lo toma de esa lista. Una
historia de una fila SKU guardó n, que tras A1-b es la fila n de ecommerce_products (otro producto) o nada.

Uso (desde backend/, con el python del venv):
    python scripts/datos_bloque4_1.py catalogo_ids --listar
    python scripts/datos_bloque4_1.py updated_at_nulos --listar      (A6: solo lectura, no tiene --aplicar)
    python scripts/datos_bloque4_1.py catalogo_ids --aplicar --base erp_test --ids 3,4 [--respaldo <carpeta>]

La base sale de DATABASE_URL (app/db/database.py): la variable del entorno de la consola gana sobre backend/.env.
ALEMBIC_ENV no aplica a este script. Antes de seguir, mira la línea «SELECT current_database() -> ...» que imprime al
empezar; si es la base de producción (BASE_PRODUCCION, erpdb) imprime un AVISO arriba de todo, en stdout y en stderr.

Subcomandos:
    catalogo_ids   --listar: las URL de la tienda que cambian (los SKU del ERP sin espejo en ecommerce_products) y las
                   historias (social_posts) cuyo producto_id es el id de uno de esos SKU, con su clase:
                     sku     el nombre guardado es el del producto del SKU (y no el de la fila de ecommerce_products con ese
                             id): la historia se hizo con la fila SKU y su producto_id debe pasar a -n;
                     tienda  el nombre guardado es el de la fila de ecommerce_products con ese id: no se toca;
                     dudosa  ninguno de los dos (el producto cambió de nombre, por ejemplo): la decide el usuario.
                   --aplicar: el producto_id de las historias aprobadas pasa de n a -n.

Seguridad:
  - Al iniciar imprime la URL enmascarada y SELECT current_database(). Nunca lee ni imprime credenciales.
  - --listar corre en una transacción de SOLO LECTURA (SET TRANSACTION READ ONLY) y termina con rollback.
  - --aplicar exige --base <nombre> igual a current_database() (si no coincide, aborta sin escribir) y --ids: solo los ids
    de historia que el usuario aprobó en el --listar (el --listar imprime el comando exacto con los ids copiables). Solo
    acepta historias candidatas de clase sku o dudosa con el producto_id todavía positivo; un id de clase tienda, uno que ya
    es negativo o uno que no está en el listado aborta sin escribir. Relee las historias con FOR UPDATE. Antes de escribir
    guarda un respaldo JSON con el id y el producto_id de cada historia que cambia, en --respaldo (por defecto la carpeta
    `datos` del ledger del Bloque 4.1, que git ignora). Un solo commit; si algo falla, rollback completo y el respaldo pasa
    a '...-NO-APLICADO.json'.
    Para deshacerlo: por cada fila del JSON, UPDATE social_posts SET producto_id = <producto_id> WHERE id = <id>;
  - Solo escribe social_posts.producto_id: no lee ni escribe ningún documento. Los documentos reales del usuario
    (DOCUMENTOS_PROTEGIDOS: SC-20260731, COT-20260449, PVEN-20262799, SC-20260746 y PXP-20260010) quedan fuera por
    construcción.
  - Sirve en una base sin la tabla social_posts (la crea Marketing la primera vez que se usa): el listado lo dice y
    --aplicar termina sin escribir.
  - La salida trae nombres de productos: se guarda en la carpeta `datos` del ledger y no se pega completa en el chat.
"""
import argparse
import datetime
import json
import os
import sys
from pathlib import Path

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from sqlalchemy import text

import app.models  # noqa: F401  (registra todos los modelos antes de la primera consulta)
from app.core.fechas import ahora_utc
from scripts.correcciones_bloque1 import NUMEROS_REALES, base_actual, iniciar_solo_lectura
from scripts.datos_bloque3 import (
    AVISO_PRODUCCION, BASE_PRODUCCION, MENSAJE_FALTA_IDS, ErrorDatos, Listado, ResultadoAplicar, Seccion, _Parser,
    _lista_de_enteros, _marcar_no_aplicado, texto_listado,
)

SUBCOMANDOS = ("catalogo_ids", "updated_at_nulos")
SUBCOMANDOS_CON_APLICAR = ("catalogo_ids",)

# La carpeta `datos` del ledger del Bloque 4.1 (.superpowers/ está en .gitignore): ahí van la salida de los listados y los
# respaldos de catalogo_ids --aplicar.
CARPETA_DATOS = (Path(_BACKEND_DIR).parent / ".superpowers" / "sdd" / "2026-11-19-ventas-b4-1-revision-usuario"
                 / "datos")

# Los documentos reales del usuario (los de correcciones_bloque1 más la orden de pago del ledger, H31). El script no los
# lee ni los escribe: solo toca social_posts.producto_id.
DOCUMENTOS_PROTEGIDOS = tuple(NUMEROS_REALES) + ("PXP-20260010",)

MENSAJE_SIN_SOCIAL_POSTS = "La tabla social_posts no existe en esta base: no hay historias que corregir."
CLASES_QUE_SE_APLICAN = ("sku", "dudosa")

INFO = {
    "catalogo_ids": dict(
        titulo="Ids del catálogo de la tienda (A1-b): las URL que cambian y las historias que apuntan a una fila SKU",
        que_es="Con A1-b, una fila de la tienda que viene de un SKU del ERP sin espejo en ecommerce_products lleva el id "
               "-n (n = product_skus.id) en vez de n: su URL pasa de /store/producto/n a /store/producto/-n (lo que "
               "esté guardado o indexado con la de hoy deja de abrir ese producto). Marketing › Historias guarda en "
               "social_posts.producto_id el id que vio en esa lista: si eligió una fila SKU, guardó n.",
        que_haria="Solo con el OK del usuario y en cada base por separado (--aplicar --base <base> --ids <ids "
                  "aprobados>): pasa a -n el producto_id de las historias aprobadas (de clase sku o dudosa), con respaldo "
                  "JSON antes de escribir. Las de clase tienda no se tocan."),
    "updated_at_nulos": dict(
        titulo="Filas con updated_at vacío en customer_requests, sales_quotations y sale_orders (A6)",
        que_es="El Bloque 4.1 (M6) calcula la pastilla de atrasados con COALESCE(updated_at, created_at). Las filas con "
               "updated_at NULL entran a esa cuenta con su fecha de creación: si hay, la pastilla puede subir al promover.",
        que_haria="Nada: este subcomando es solo de lectura (no tiene --aplicar)."),
}


def _nuevo(subcomando, **extra) -> Listado:
    return Listado(subcomando=subcomando, **INFO[subcomando], **extra)


def _filas(db, sql, **params) -> list:
    return [dict(r) for r in db.execute(text(sql), params).mappings().all()]


def _hay_social_posts(db) -> bool:
    """La tabla social_posts existe en el esquema actual (information_schema): Marketing la crea al usarse."""
    return db.execute(text("SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() "
                           "AND table_name = 'social_posts'")).first() is not None


# ═══ catalogo_ids ═════════════════════════════════════════════════════════════════════════════════════════════════

# Un SKU del ERP sin espejo: ninguna fila de ecommerce_products tiene su código (la regla de la lista heredada).
_SIN_ESPEJO = "NOT EXISTS (SELECT 1 FROM ecommerce_products e2 WHERE e2.sku = ps.sku)"


def _skus_sin_espejo(db) -> list:
    """Las filas SKU de la tienda heredada (los SKU del ERP sin espejo), con su URL de hoy y la de A1-b."""
    filas = _filas(db, f"SELECT ps.id, ps.sku, COALESCE(pr.name, ps.sku) AS nombre FROM product_skus ps "
                       f"LEFT JOIN products pr ON pr.id = ps.product_id WHERE {_SIN_ESPEJO} ORDER BY ps.id")
    for f in filas:
        f["url_hoy"] = f"/store/producto/{f['id']}"
        f["url_nueva"] = f"/store/producto/-{f['id']}"
    return filas


def _clase(f) -> str:
    """sku, tienda o dudosa: de dónde salió el nombre que guardó la historia (ver el Uso)."""
    guardado = f["producto_nombre"]
    if guardado is not None and guardado == f["nombre_sku"] and guardado != f["nombre_tienda"]:
        return "sku"
    if guardado is not None and guardado == f["nombre_tienda"]:
        return "tienda"
    return "dudosa"


def _candidatas(db, bloquear=False) -> list:
    """Las historias con producto_id > 0 que es el id de un SKU del ERP sin espejo, con su clase, por id. Con `bloquear`,
    las historias se releen con FOR UPDATE (al aplicar)."""
    bloqueo = " FOR UPDATE OF sp" if bloquear else ""
    filas = _filas(db, f"SELECT sp.id, sp.producto_id, sp.producto_nombre, ps.sku, "
                       f"COALESCE(pr.name, ps.sku) AS nombre_sku, ep.nombre AS nombre_tienda "
                       f"FROM social_posts sp JOIN product_skus ps ON ps.id = sp.producto_id "
                       f"LEFT JOIN products pr ON pr.id = ps.product_id "
                       f"LEFT JOIN ecommerce_products ep ON ep.id = sp.producto_id "
                       f"WHERE sp.producto_id > 0 AND {_SIN_ESPEJO} ORDER BY sp.id{bloqueo}")
    for f in filas:
        f["clase"] = _clase(f)
    return filas


def listar_catalogo_ids(db) -> Listado:
    """El listado de catalogo_ids. Corre SIEMPRE dentro de SET TRANSACTION READ ONLY y termina con rollback."""
    iniciar_solo_lectura(db)
    try:
        l = _nuevo("catalogo_ids")
        l.secciones.append(Seccion(
            "urls", "Filas SKU de la tienda (SKU del ERP sin espejo): su URL cambia",
            [("id", "Id del SKU"), ("sku", "SKU"), ("nombre", "Producto"), ("url_hoy", "URL de hoy"),
             ("url_nueva", "URL con A1-b")], _skus_sin_espejo(db)))
        historias = Seccion(
            "historias", "Historias cuyo producto_id es el id de una fila SKU",
            [("id", "Historia"), ("producto_id", "producto_id"), ("producto_nombre", "Nombre guardado"),
             ("nombre_sku", "Producto del SKU"), ("nombre_tienda", "Fila de la tienda con ese id"), ("clase", "Clase")])
        l.secciones.append(historias)
        if not _hay_social_posts(db):
            historias.nota = MENSAJE_SIN_SOCIAL_POSTS
            l.notas.append(MENSAJE_SIN_SOCIAL_POSTS)
            return l
        historias.filas = _candidatas(db)
        historias.nota = ("sku: el nombre guardado es el del producto del SKU; tienda: es el de la fila de "
                          "ecommerce_products con ese id (no se toca); dudosa: ninguno de los dos (la decide el usuario)")
        aprobables = [f["id"] for f in historias.filas if f["clase"] in CLASES_QUE_SE_APLICAN]
        if aprobables:
            l.notas.append(f"Para corregir SOLO estas (con el OK del usuario): python scripts/datos_bloque4_1.py "
                           f"catalogo_ids --aplicar --base {base_actual(db)} --ids {','.join(map(str, aprobables))}")
        else:
            l.notas.append("No hay historias de clase sku o dudosa: catalogo_ids --aplicar no tendría nada que corregir.")
        return l
    finally:
        db.rollback()


def _escribir_respaldo(carpeta, base, filas, ahora) -> str:
    """El respaldo mínimo, ANTES de escribir: el id y el producto_id de hoy de cada historia que cambia."""
    contenido = {"subcomando": "catalogo_ids", "base": base, "generado_utc": ahora.isoformat(),
                 "como_deshacer": "Por cada fila: UPDATE social_posts SET producto_id = <producto_id> WHERE id = <id>;",
                 "columnas": ["id", "producto_id"],
                 "filas": [{"id": f["id"], "producto_id": f["producto_id"]} for f in filas]}
    carpeta = Path(carpeta)
    carpeta.mkdir(parents=True, exist_ok=True)
    marca = ahora.strftime("%Y%m%d-%H%M%S")
    ruta, n = carpeta / f"catalogo_ids-{base}-{marca}.json", 1
    while ruta.exists():
        n += 1
        ruta = carpeta / f"catalogo_ids-{base}-{marca}-{n}.json"
    ruta.write_text(json.dumps(contenido, ensure_ascii=False, indent=1), encoding="utf-8")
    return str(ruta)


def _motivos_de_rechazo(db, ids, candidatas) -> list:
    """Por cada id de `ids` que --aplicar no acepta, el motivo (vacío si los acepta todos)."""
    faltan = []
    for i in ids:
        f = candidatas.get(i)
        if f is not None:
            if f["clase"] not in CLASES_QUE_SE_APLICAN:
                faltan.append(f"id {i}: es de la tienda (su nombre es el de la fila {f['producto_id']} de "
                              f"ecommerce_products): no se toca")
            continue
        actual = db.execute(text("SELECT producto_id FROM social_posts WHERE id = :i"), {"i": i}).scalar()
        if actual is not None and actual < 0:
            faltan.append(f"id {i}: su producto_id ya es negativo ({actual}): ya se corrigió")
        else:
            faltan.append(f"id {i}: no está en el listado (su producto_id no es el id de una fila SKU)")
    return faltan


def aplicar_catalogo_ids(db, base, ids, carpeta_respaldo=CARPETA_DATOS) -> ResultadoAplicar:
    """Pasa de n a -n el producto_id de las historias de `ids`, SOLO con el OK del usuario. Aborta (ErrorDatos) SIN escribir
    si `base` no es current_database(), si no vienen `ids` (MENSAJE_FALTA_IDS), si un id no es una candidata de clase sku o
    dudosa con el producto_id todavía positivo o si no se puede escribir el respaldo. Sin la tabla social_posts termina sin
    escribir y lo dice. Relee las historias con FOR UPDATE, guarda el respaldo JSON antes de escribir, hace un solo commit y,
    ante cualquier error, rollback y el respaldo pasa a '...-NO-APLICADO.json'."""
    res = ResultadoAplicar()
    actual = base_actual(db)
    if base != actual:
        db.rollback()
        raise ErrorDatos(f"--base {base!r} no coincide con la base a la que está conectado el script ({actual!r}): no "
                         f"se escribió nada.")
    if not ids:
        db.rollback()
        raise ErrorDatos(MENSAJE_FALTA_IDS)
    if not _hay_social_posts(db):
        db.rollback()
        res.detalle.append(MENSAJE_SIN_SOCIAL_POSTS)
        return res
    candidatas = {f["id"]: f for f in _candidatas(db, bloquear=True)}
    faltan = _motivos_de_rechazo(db, ids, candidatas)
    if faltan:
        db.rollback()
        raise ErrorDatos("catalogo_ids: no se escribió nada. " + "; ".join(faltan))
    elegidas = [candidatas[i] for i in dict.fromkeys(ids)]
    try:
        ruta = _escribir_respaldo(carpeta_respaldo, base, elegidas, ahora_utc())
    except OSError as exc:
        db.rollback()   # sin respaldo no se escribe nada (y se sueltan los bloqueos del FOR UPDATE)
        raise ErrorDatos(f"No se pudo escribir el respaldo en {carpeta_respaldo} ({type(exc).__name__}): no se escribió "
                         f"nada.") from exc
    try:
        for f in elegidas:
            cambio = db.execute(text("UPDATE social_posts SET producto_id = :nuevo WHERE id = :i AND producto_id = :n"),
                                {"nuevo": -f["producto_id"], "i": f["id"], "n": f["producto_id"]}).rowcount
            if cambio:
                res.cambiados += 1
                res.detalle.append(f"historia {f['id']}: producto_id {f['producto_id']} → {-f['producto_id']}")
        db.commit()
    except Exception:
        db.rollback()
        _marcar_no_aplicado(ruta)
        raise
    if res.cambiados == 0:
        nueva = _marcar_no_aplicado(ruta)
        res.detalle.append("No cambió nada: el respaldo quedó como "
                           + (os.path.basename(nueva) if nueva else "(sin renombrar)"))
        return res
    res.respaldo = ruta
    return res


# ═══ updated_at_nulos ═════════════════════════════════════════════════════════════════════════════════════════════

TABLAS_UPDATED_AT = ("customer_requests", "sales_quotations", "sale_orders")


def nota_updated_at_nulos(cuentas) -> str:
    total = sum(cuentas.values())
    if total == 0:
        return "Ninguna fila con updated_at vacío: la pastilla de atrasados no sube por el coalesce de M6."
    return (f"Hay {total} filas con updated_at vacío: la pastilla de atrasados puede subir al promover (coalesce de M6, "
            f"ver V1).")


def listar_updated_at_nulos(db) -> Listado:
    """Cuenta las filas con updated_at IS NULL en SC, COT y PVEN. SIEMPRE dentro de SET TRANSACTION READ ONLY, con rollback."""
    iniciar_solo_lectura(db)
    try:
        filas = [{"tabla": t, "nulos": db.execute(text(f"SELECT COUNT(*) FROM {t} WHERE updated_at IS NULL")).scalar()}
                 for t in TABLAS_UPDATED_AT]
        l = _nuevo("updated_at_nulos")
        l.secciones.append(Seccion("tablas", "Filas con updated_at vacío", [("tabla", "Tabla"), ("nulos", "Filas")], filas))
        l.notas.append(nota_updated_at_nulos({f["tabla"]: f["nulos"] for f in filas}))
        return l
    finally:
        db.rollback()


LISTADORES = {"catalogo_ids": listar_catalogo_ids, "updated_at_nulos": listar_updated_at_nulos}


# ─── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────

def armar_parser() -> argparse.ArgumentParser:
    parser = _Parser(description="Revisa los datos existentes que necesita el Bloque 4.1 de Ventas (A1-b).")
    sub = parser.add_subparsers(dest="subcomando", required=True, metavar="subcomando")
    for nombre in SUBCOMANDOS:
        p = sub.add_parser(nombre, help=INFO[nombre]["titulo"])
        if nombre in SUBCOMANDOS_CON_APLICAR:
            modo = p.add_mutually_exclusive_group(required=True)
            modo.add_argument("--listar", action="store_true", help="solo lectura: imprime lo que encontró")
            modo.add_argument("--aplicar", action="store_true",
                              help="escribe, SOLO con el OK del usuario (con respaldo JSON previo)")
            p.add_argument("--base", help="con --aplicar: nombre de la base; debe ser igual a current_database()")
            p.add_argument("--ids", type=_lista_de_enteros,
                           help="con --aplicar, obligatorio: los ids que el usuario aprobó en el --listar (por coma)")
            p.add_argument("--respaldo", default=str(CARPETA_DATOS), help="carpeta del respaldo JSON")
        else:
            p.add_argument("--listar", action="store_true", required=True, help="solo lectura")
            p.set_defaults(aplicar=False, base=None, ids=None, respaldo=str(CARPETA_DATOS))
    return parser


def main(argv=None) -> int:
    args = armar_parser().parse_args(argv)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    from app.db.database import SessionLocal, SQLALCHEMY_DATABASE_URL
    from app.core.preflight import _mask_url

    modo = "APLICAR (escribe, con respaldo)" if args.aplicar else "LISTAR (solo lectura)"
    print(f"Conectando a -> {_mask_url(SQLALCHEMY_DATABASE_URL)}  [{modo}]")
    db = SessionLocal()
    try:
        if args.listar:
            iniciar_solo_lectura(db)
        base = base_actual(db)
        print(f"SELECT current_database() -> {base}")
        if base == BASE_PRODUCCION:
            # Arriba de todo y visible, en stdout y en stderr: la salida trae datos reales.
            print("!" * 78)
            print(AVISO_PRODUCCION)
            print("!" * 78)
            print(AVISO_PRODUCCION, file=sys.stderr)
        print(f"Fecha (UTC): {datetime.datetime.now(datetime.timezone.utc):%Y-%m-%d %H:%M:%S}")
        print("Documentos reales protegidos (el script no los lee ni los escribe): " + ", ".join(DOCUMENTOS_PROTEGIDOS))
        if args.listar:
            db.rollback()
            print()
            print(texto_listado(LISTADORES[args.subcomando](db)))
            print("LISTAR: no se escribió nada (transacción de solo lectura).")
            return 0
        try:
            res = aplicar_catalogo_ids(db, base=args.base, ids=args.ids, carpeta_respaldo=args.respaldo)
        except ErrorDatos as exc:
            print(f"ABORTADO: {exc}", file=sys.stderr)
            return 2
        print(f"catalogo_ids: {res.cambiados} historia(s) cambiada(s).")
        for linea in res.detalle:
            print(f"  - {linea}")
        if res.respaldo:
            print(f"Respaldo JSON: {res.respaldo}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
