"""
datos_bloque3.py -- Revisa los DATOS QUE YA EXISTEN y que el Bloque 3 de Ventas necesita mirar antes de desplegar
(tarea 21). Todo es de SOLO LECTURA, salvo una copia (tax_rate --aplicar) que solo se corre con el OK explicito del
usuario, por ambiente (erp_test y produccion por separado).

Uso (desde backend/, con el python del venv):
    python scripts/datos_bloque3.py todo --listar                 corre todos los listados
    python scripts/datos_bloque3.py telefonos --listar            un solo listado
    python scripts/datos_bloque3.py tax_rate --aplicar --base erp_test --ids 3,4 [--respaldo <carpeta>]

La base sale de DATABASE_URL (app/db/database.py): la variable del entorno de la consola gana sobre backend/.env.
ALEMBIC_ENV no aplica a este script. Antes de seguir, mira la linea «SELECT current_database() -> ...» que imprime al
empezar; si es la base de produccion (BASE_PRODUCCION, erpdb) imprime un AVISO arriba de todo, en stdout y en stderr.
tax_rate --aplicar exige --ids: solo los ids que el usuario aprobo en el --listar (el --listar imprime el comando
exacto con los ids copiables).

Subcomandos (cada uno con --listar; solo tax_rate tiene --aplicar):
    empresa                     claves empresa_* y documentos_* que ya existen en admin_config (choques)
    tax_rate                    products.tax_rate distinto de 0 (con OK: 19 -> '19', 5 -> '5') y productos activos
                                sin tarifa de IVA
    iva_documentos              COT y pedidos vigentes sin IVA discriminado (no se corrigen)
    centavos_cot                COT pendientes de confirmacion con centavos (los corrige B1-T14 h42)
    anticipos_cot               COT pendientes o confirmadas sin pedido vigente con el anticipo desactualizado
                                (B1-T14 h36); aparte, las de «modalidad que dejo de ser credito» (B2.1 D7, RP6)
    pagos_sin_verificar         pagos CONVERSION_COTIZACION confirmados (B1-T14 n1)
    telefonos                   clientes y documentos vigentes con un telefono que no sirve para WhatsApp
    pendientes_sin_seguimiento  SC y COT pendientes de confirmacion sin recordatorio programado
    notas_cot                   notas de COT activas y de los pedidos (las ve el cliente); aparte, las del Cotizador
                                Rapido

Seguridad:
  - Al iniciar imprime la URL enmascarada y SELECT current_database(). Nunca lee ni imprime credenciales.
  - --listar corre en una transaccion de SOLO LECTURA (SET TRANSACTION READ ONLY) y termina con rollback.
  - tax_rate --aplicar exige --base <nombre> igual a current_database(); si no coincide, aborta sin escribir. Comprueba
    con information_schema que existan products.tax_rate (la columna vieja de migrate_erp_v2.py) y products.tarifa_iva
    (fa6_027). Antes de escribir guarda un respaldo JSON con el id, la tarifa_iva de hoy y el tax_rate de cada producto
    que va a cambiar, en --respaldo (por defecto la carpeta `datos` del ledger del Bloque 3, que git ignora). Un solo
    commit; si algo falla, rollback completo y el respaldo pasa a '...-NO-APLICADO.json'.
    Para deshacerlo: por cada fila del JSON, UPDATE products SET tarifa_iva = NULL WHERE id = <id>;
  - Excluye SIEMPRE los documentos reales del usuario (NUMEROS_REALES) y todo lo encadenado a ellos (la regla de
    correcciones_bloque1.calcular_excluidos: la SC, la COT y el PVEN de la cadena, sus PXP y sus pagos) y, en
    telefonos, los clientes de esos documentos. Los productos no son parte de la cadena: tax_rate no lee ni cambia
    ningun documento.
  - Sirve en una base donde el Bloque 3 todavia no se desplego (produccion antes de desplegar): sin products.tarifa_iva,
    sin sales_quotations.tax_cop ni la tabla seguimientos_confirmacion, los listados no las nombran y lo dicen.
  - La salida puede traer nombres de productos y de clientes (telefonos): se guarda en la carpeta `datos` del ledger y
    no se pega completa en el chat. Fuera de notas_cot no imprime telefonos, correos ni valores de admin_config.
    notas_cot imprime las notas TAL CUAL las escribieron (hasta 160 caracteres, con los correos y las series de 7 o
    mas digitos ocultos) y pueden traer datos personales (nombres, direcciones): esa seccion se trata como los nombres
    de telefonos, solo en la carpeta `datos` y nunca entera en el chat.
"""
import argparse
import datetime
import json
import os
import re
import sys
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from pathlib import Path
from types import SimpleNamespace
from typing import Optional

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from sqlalchemy import text

import app.models  # noqa: F401  (registra todos los modelos antes de la primera consulta)
from app.core.empresa import CAMPOS as CAMPOS_EMPRESA, CLAVE_LOGO, CLAVE_LOGO_VERSION, PREFIJOS_RESERVADOS
from app.core.iva import desglose_documento, lineas_con_tarifa, normalizar_tarifa_iva
from app.core.seguimiento_confirmacion import ACTIVO, AGOTADO, DETENIDO
from app.core.telefonos import e164_whatsapp, numero_whatsapp, telefono_del_documento
from app.core.textos_actividad import etiqueta_estado
from app.core.ventas_dinero import (
    MODALIDADES_CREDITO, METODO_PAGO_SIN_VERIFICAR, ORIGEN_MODALIDAD, _sin_tildes, anticipo_cotizacion,
    anticipo_requerido, formato_pct,
)
from scripts.correcciones_bloque1 import (
    NUMEROS_REALES, base_actual, calcular_excluidos, iniciar_solo_lectura, monto_exacto,
)

SUBCOMANDOS = ("empresa", "tax_rate", "iva_documentos", "centavos_cot", "anticipos_cot", "pagos_sin_verificar",
               "telefonos", "pendientes_sin_seguimiento", "notas_cot")
SUBCOMANDOS_CON_APLICAR = ("tax_rate",)

# La carpeta `datos` del ledger del Bloque 3 (.superpowers/ esta en .gitignore): ahi van la salida de los listados y
# los respaldos de tax_rate --aplicar.
CARPETA_DATOS = (Path(_BACKEND_DIR).parent / ".superpowers" / "sdd" / "2026-10-04-ventas-bloque3-documentos-envio-iva"
                 / "datos")

MENSAJE_SIN_TAX_RATE = "La columna products.tax_rate no existe en esta base: no hay nada que copiar."
MENSAJE_SIN_TARIFA_IVA = ("Falta la columna products.tarifa_iva (la crea fa6_027 al desplegar el Bloque 3): no hay "
                          "dónde copiar.")
TARIFAS_QUE_SE_COPIAN = ("19", "5")   # 19 -> '19' y 5 -> '5'; cualquier otro valor se deja sin definir
# F1 (M25): --aplicar copia SOLO los ids que el usuario aprobo en el --listar, nunca «lo copiable de ese momento».
MENSAJE_FALTA_IDS = "Falta --ids: aplica solo los ids que el usuario aprobó en el --listar."
# F1 (M26): la base de produccion, la misma de alembic/env.py (_PRODUCTION_DATABASE_NAME). Ese archivo no se puede
# importar: corre alembic al cargarse.
BASE_PRODUCCION = "erpdb"
AVISO_PRODUCCION = (f"AVISO: estás conectado a la base de PRODUCCIÓN ({BASE_PRODUCCION}). La salida trae datos reales: "
                    f"guárdala solo en la carpeta datos y no la pegues en el chat.")

ESTADOS_COT_ACTIVOS = ("BORRADOR", "ENVIADA", "PENDIENTE_CONFIRMACION", "CONFIRMADA")
ESTADOS_COT_ANTICIPO = ("PENDIENTE_CONFIRMACION", "CONFIRMADA")
ESTADOS_SC_CERRADOS = ("CANCELADA", "RECHAZADA")
PENDIENTE = "PENDIENTE_CONFIRMACION"
PREFIJO_CALCULADORA = "Cotizado desde Calculadora Rápida"   # las notas que ponia el Cotizador Rapido hasta T17
LARGO_NOTAS = 160
MAX_FILAS_EN_TEXTO = 300   # por seccion al imprimir (los datos completos siguen en Seccion.filas)

_NO_DIGITO = re.compile(r"[^0-9]")
_ESPACIOS = re.compile(r"\s+")
# F1 (M28): lo que se oculta en las notas que imprime notas_cot: un correo (cualquier palabra con '@') y una serie de 7
# o mas digitos, aunque lleve espacios, puntos, guiones o parentesis (un telefono, una cedula, una cuenta).
_CORREO_EN_NOTAS = re.compile(r"\S+@\S+")
_SERIE_DE_DIGITOS = re.compile(r"\+?\d(?:[ .()\-]*\d){6,}")
CORREO_OCULTO = "[correo oculto]"
NUMERO_OCULTO = "[número oculto]"

# Lo que cada listado necesita del esquema de antes del Bloque 3. Si falta algo, el listado dice "No aplica" y sigue.
# Las columnas y tablas que crea el Bloque 3 (products.tarifa_iva, sales_quotations.tax_cop, seguimientos_confirmacion)
# no van aqui: cada listado las revisa aparte y funciona sin ellas.
REQUISITOS = {
    "empresa": {"admin_config": ["key", "value", "updated_at"]},
    "tax_rate": {"products": ["id", "name", "is_active"]},
    "iva_documentos": {"sales_quotations": ["id", "numero", "estado", "productos", "subtotal_cop", "total_cop"],
                       "sale_orders": ["id", "numero", "estado", "productos", "subtotal_cop", "tax_cop", "total_cop"]},
    "centavos_cot": {"sales_quotations": ["id", "numero", "estado", "productos", "subtotal_cop", "total_cop"]},
    "anticipos_cot": {"sales_quotations": ["id", "numero", "estado", "sc_id", "total_cop", "anticipo_cop",
                                           "anticipo_pct_manual"],
                      "customer_requests": ["id", "modalidad_pago"],
                      "sale_orders": ["id", "cot_id", "estado"]},
    "pagos_sin_verificar": {"sale_order_payments": ["id", "sale_order_id", "metodo_pago", "estado", "monto",
                                                    "created_at"],
                            "sale_orders": ["id", "numero", "estado"]},
    "telefonos": {"customers": ["id", "first_name", "last_name", "phone"],
                  "customer_requests": ["id", "numero", "estado", "customer_id", "customer_phone", "eliminada_at"],
                  "sales_quotations": ["id", "numero", "estado", "customer_id", "customer_phone"],
                  "sale_orders": ["id", "numero", "estado", "customer_id", "customer_phone"]},
    "pendientes_sin_seguimiento": {"customer_requests": ["id", "numero", "estado", "eliminada_at", "updated_at"],
                                   "sales_quotations": ["id", "numero", "estado", "updated_at"]},
    "notas_cot": {"sales_quotations": ["id", "numero", "estado", "notas", "fecha_cotizacion", "created_at"],
                  "sale_orders": ["id", "numero", "estado", "cot_id", "created_at"]},
}

INFO = {
    "empresa": dict(
        titulo="Datos de la empresa: claves empresa_* y documentos_* que ya existen en admin_config",
        que_es="El Bloque 3 guarda los datos de la empresa y el formato de los documentos en admin_config con los "
               "prefijos empresa_ y documentos_ (Configuración General > Información de la empresa). Una clave que "
               "ya exista con esos prefijos antes de desplegar es un choque posible: /ventas/config deja de mostrarla "
               "y, si es una de las que usa el Bloque 3, sale en los documentos y correos del cliente.",
        que_haria="Nada: solo lista (no tiene --aplicar). No imprime los valores: solo la clave, si el Bloque 3 la "
                  "usa y el largo del valor."),
    "tax_rate": dict(
        titulo="Tarifa de IVA de los productos: la columna vieja products.tax_rate",
        que_es="products.tax_rate (del script migrate_erp_v2.py) es la casilla vieja «Impuesto %», que nunca se "
               "guardó desde la ficha. El Bloque 3 usa products.tarifa_iva ('19', '5', 'EXENTO', 'EXCLUIDO' o sin "
               "definir). Además lista los productos activos sin tarifa de IVA, que el usuario debe clasificar (lo "
               "mismo que el filtro «Sin tarifa de IVA» del catálogo).",
        que_haria="Solo con el OK del usuario y en cada base por separado (--aplicar --base <base> --ids <ids "
                  "aprobados>): copia 19 → '19' y 5 → '5' en la tarifa_iva de los productos que todavía no tienen "
                  "tarifa, con respaldo JSON antes de escribir. Cualquier otro valor se deja sin definir y se lista; un "
                  "producto que ya tiene tarifa no se toca (conserva la suya)."),
    "iva_documentos": dict(
        titulo="Cotizaciones y pedidos vigentes sin IVA discriminado",
        que_es="COT en Borrador, Enviada, Pendiente de confirmación o Confirmada y pedidos no cancelados cuyo IVA no "
               "está discriminado (la misma regla del documento del cliente, iva.desglose_documento): el cliente los "
               "verá con «IVA no discriminado» hasta que se vuelvan a cotizar.",
        que_haria="Nada: solo informe. No se corrigen: sus totales ya los aceptó el cliente."),
    "centavos_cot": dict(
        titulo="Cotizaciones pendientes de confirmación con centavos",
        que_es="COT en Pendiente de confirmación con centavos en el subtotal, el total o el precio unitario de una "
               "línea: el documento del cliente mostraría «Ajuste por redondeo».",
        que_haria="Nada: solo informe. La corrección es la del Bloque 1 (correcciones_bloque1.py h42), solo con el OK "
                  "del usuario."),
    "anticipos_cot": dict(
        titulo="Anticipo desactualizado en cotizaciones pendientes o confirmadas sin pedido vigente",
        que_es="COT en Pendiente de confirmación o Confirmada, sin pedido vigente, cuyo anticipo guardado no es el "
               "que exige hoy anticipo_cotizacion (el cliente verá el de hoy). Aparte, las que cambian SOLO porque "
               "B2.1 (D7) sacó su modalidad de la lista de crédito («modalidad que dejó de ser crédito»): con la "
               "regla vieja (empieza por «cr» o dice «credito») tenían 0% de anticipo.",
        que_haria="Nada: solo informe. Las COT con SC las recalcula el Bloque 1 (correcciones_bloque1.py h36), solo "
                  "con el OK del usuario. h36 solo recalcula las COT con SC; las COT sin SC (Origen del % «conservado») "
                  "no las toca: se corrigen aparte, con el OK del usuario. D7 pide repetir este listado antes de "
                  "producción."),
    "pagos_sin_verificar": dict(
        titulo="Pagos de anticipo automáticos sin verificar (CONVERSION_COTIZACION)",
        que_es="Pagos CONVERSION_COTIZACION confirmados que creó la conversión antes de N1, sin que nadie los "
               "verificara. En la confirmación del pedido el cliente los verá como «Anticipo registrado».",
        que_haria="Nada: solo informe. Los resuelve el Bloque 1 (correcciones_bloque1.py n1), con una decisión del "
                  "usuario por pedido."),
    "telefonos": dict(
        titulo="Teléfonos que no sirven para WhatsApp",
        que_es="Clientes y documentos vigentes (SC no cancelada ni rechazada y fuera de la papelera, COT activa, "
               "pedido no cancelado) cuyo teléfono no sirve para el envío automático: e164_whatsapp da None (la "
               "única regla de validez, RP19). El de un documento es el suyo o, si está vacío, el de su cliente "
               "(telefono_del_documento).",
        que_haria="Nada: solo informe, para que el usuario los corrija. No imprime ningún número: solo cuántos "
                  "dígitos tiene."),
    "pendientes_sin_seguimiento": dict(
        titulo="Solicitudes y cotizaciones pendientes de confirmación sin recordatorio",
        que_es="SC (fuera de la papelera) y COT en Pendiente de confirmación sin un recordatorio programado (sin "
               "fila ACTIVO en seguimientos_confirmacion). Las que se enviaron antes del cambio no tienen "
               "recordatorio automático.",
        que_haria="Nada: no se programa nada. Si el usuario quiere recordatorio para una, basta con reenviarla."),
    "notas_cot": dict(
        titulo="Notas de cotizaciones y pedidos activos (las ve el cliente)",
        que_es="Desde el Bloque 3 (R3/C19) las notas de la COT salen en el documento del cliente, en /confirmar, en "
               "el PDF y en el correo. Lista las COT en Borrador, Enviada, Pendiente de confirmación o Confirmada "
               f"con notas y los pedidos no cancelados cuya COT tiene notas (recortadas a {LARGO_NOTAS} caracteres). "
               "Aparte, las del Cotizador Rápido («Cotizado desde Calculadora Rápida. Margen: X% | TRM: Y»): con el "
               "precio y el margen el cliente puede deducir el costo. Las notas salen tal cual las escribieron (con "
               "los correos y las series de 7 o más dígitos ocultos) y pueden traer datos personales: esta sección se "
               "guarda solo en la carpeta datos y nunca se pega entera en el chat.",
        que_haria="Nada: este subcomando no tiene --aplicar. Limpiar las notas se hace después y aparte, solo con la "
                  "lista aprobada por el usuario y por ambiente."),
}


class ErrorDatos(Exception):
    """tax_rate --aplicar se aborta SIN escribir nada (base equivocada, un id fuera de la lista)."""


def _ahora_utc() -> datetime.datetime:
    """Ahora en UTC, naive (el estandar de la app)."""
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


# ─── estructuras ──────────────────────────────────────────────────────────────────────────────────────────────

@dataclass
class Seccion:
    clave: str
    titulo: str
    columnas: list                              # [(clave_en_la_fila, encabezado), ...]
    filas: list = field(default_factory=list)
    nota: str = ""
    informativa: bool = False                   # se muestra pero no cuenta en el conteo del subcomando


@dataclass
class Listado:
    subcomando: str
    titulo: str = ""
    que_es: str = ""
    que_haria: str = ""
    secciones: list = field(default_factory=list)
    excluidos: list = field(default_factory=list)    # lo que coincidia y es (o esta encadenado a) un documento real
    notas: list = field(default_factory=list)
    datos: dict = field(default_factory=dict)        # conteos que no son filas (telefonos)
    no_aplica: Optional[str] = None
    error: Optional[str] = None

    def seccion(self, clave):
        for s in self.secciones:
            if s.clave == clave:
                return s
        raise KeyError(clave)

    @property
    def conteo(self):
        return sum(len(s.filas) for s in self.secciones if not s.informativa)


@dataclass
class ResultadoAplicar:
    cambiados: int = 0
    detalle: list = field(default_factory=list)
    respaldo: Optional[str] = None

    @property
    def escribio(self):
        return self.cambiados > 0


def _nuevo(subcomando, **extra) -> Listado:
    return Listado(subcomando=subcomando, **INFO[subcomando], **extra)


# ─── formato ──────────────────────────────────────────────────────────────────────────────────────────────────

def _celda(v) -> str:
    if v is None:
        return "-"
    if isinstance(v, bool):
        return "Sí" if v else "No"
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d %H:%M")
    if isinstance(v, datetime.date):
        return v.isoformat()
    return _ESPACIOS.sub(" ", str(v)).strip()


def _tabla(columnas, filas) -> list:
    celdas = [[_celda(f.get(k)) for k, _ in columnas] for f in filas]
    anchos = [max(len(h), *(len(r[i]) for r in celdas)) if celdas else len(h) for i, (_, h) in enumerate(columnas)]
    linea = lambda vals: "  " + " | ".join(v.ljust(anchos[i]) for i, v in enumerate(vals)).rstrip()
    return [linea([h for _, h in columnas]), "  " + "-+-".join("-" * a for a in anchos)] + [linea(r) for r in celdas]


def texto_listado(l: Listado) -> str:
    """El listado como texto legible: titulo, que es, que haria --aplicar, tablas, conteo, excluidos y notas."""
    out = ["=" * 78, f"{l.subcomando}: {l.titulo}", "=" * 78,
           f"Qué es: {l.que_es}", f"Qué haría --aplicar: {l.que_haria}"]
    if l.no_aplica:
        return "\n".join(out + ["", f"No aplica: {l.no_aplica}", ""])
    if l.error:
        return "\n".join(out + ["", f"ERROR al listar (el resto sigue): {l.error}", ""])
    for s in l.secciones:
        out += ["", f"{s.titulo}  [{len(s.filas)}]" + ("  (informativa: no cuenta en el conteo)" if s.informativa
                                                        else "")]
        if s.nota:
            out.append(f"  ({s.nota})")
        if not s.filas:
            out.append("  (ninguna)")
            continue
        out += _tabla(s.columnas, s.filas[:MAX_FILAS_EN_TEXTO])
        if len(s.filas) > MAX_FILAS_EN_TEXTO:
            out.append(f"  ... y {len(s.filas) - MAX_FILAS_EN_TEXTO} más (se muestran {MAX_FILAS_EN_TEXTO})")
    partes = ", ".join(f"{s.clave}: {len(s.filas)}" for s in l.secciones if not s.informativa)
    out += ["", f"Conteo: {l.conteo}" + (f" ({partes})" if len(l.secciones) > 1 else "")]
    if l.excluidos:
        out += ["", f"Excluidos (documentos reales y lo encadenado a ellos): {len(l.excluidos)}"]
        out += [f"  - {x}" for x in l.excluidos]
    else:
        out += ["", "Excluidos (documentos reales): ninguno de ellos ni de lo encadenado cae en este listado."]
    out += [f"Nota: {n}" for n in l.notas]
    out.append("")
    return "\n".join(out)


def texto_resumen(listados) -> str:
    out = ["=" * 78, "RESUMEN DE LOS LISTADOS", "=" * 78]
    for l in listados:
        if l.no_aplica:
            estado = f"No aplica: {l.no_aplica}"
        elif l.error:
            estado = f"ERROR: {l.error}"
        else:
            # F1 (M30): sin la seccion informativa, como Listado.conteo y texto_listado: las partes suman el total.
            partes = ", ".join(f"{s.clave}: {len(s.filas)}" for s in l.secciones if not s.informativa)
            estado = f"{l.conteo} fila(s) ({partes}); excluidos reales que coincidían: {len(l.excluidos)}"
        out.append(f"  {l.subcomando}\n      {estado}")
    return "\n".join(out) + "\n"


def _est(entidad, codigo) -> str:
    return etiqueta_estado(entidad, codigo) or "-"


def _numero_legible(valor) -> str:
    """Decimal('19.00') -> '19'; Decimal('19.50') -> '19,5'."""
    d = Decimal(str(valor)).normalize()
    return format(d, "f").replace(".", ",")


def _ocultar_correo(m) -> str:
    """El correo de la nota pasa a CORREO_OCULTO; la puntuacion pegada a sus bordes se queda."""
    texto = m.group(0)
    sin_inicio = texto.lstrip("(«\"'[¿¡")
    nucleo = sin_inicio.rstrip(".,;:!?)»\"']")
    return texto[:len(texto) - len(sin_inicio)] + CORREO_OCULTO + sin_inicio[len(nucleo):]


def _notas_recortadas(notas) -> str:
    """Las notas en una sola linea (los saltos y tabuladores pasan a un espacio), con los correos y las series de 7 o
    mas digitos ocultos (F1, M28: CORREO_OCULTO y NUMERO_OCULTO, ANTES de recortar: nunca queda medio numero) y de
    LARGO_NOTAS caracteres como maximo: si son mas largas, las primeras LARGO_NOTAS - 1 y '…'."""
    limpias = _ESPACIOS.sub(" ", notas or "").strip()
    limpias = _SERIE_DE_DIGITOS.sub(NUMERO_OCULTO, _CORREO_EN_NOTAS.sub(_ocultar_correo, limpias))
    return limpias if len(limpias) <= LARGO_NOTAS else limpias[:LARGO_NOTAS - 1] + "…"


def _es_del_cotizador_rapido(notas) -> bool:
    return _sin_tildes(notas or "").startswith(_sin_tildes(PREFIJO_CALCULADORA))


# ─── base de datos ────────────────────────────────────────────────────────────────────────────────────────────

def _filas(db, sql, **params) -> list:
    return [dict(r) for r in db.execute(text(sql), params).mappings().all()]


def _columnas(db, tabla) -> set:
    """Las columnas de `tabla` en el esquema actual (vacio si la tabla no existe), segun information_schema."""
    return {r[0] for r in db.execute(
        text("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() "
             "AND table_name = :t"), {"t": tabla})}


def _faltantes(db, subcomando) -> Optional[str]:
    faltas = []
    for tabla, columnas in REQUISITOS[subcomando].items():
        existentes = _columnas(db, tabla)
        if not existentes:
            faltas.append(f"falta la tabla {tabla}")
            continue
        faltas += [f"falta la columna {tabla}.{c}" for c in columnas if c not in existentes]
    return "; ".join(faltas) if faltas else None


def _clientes_excluidos(db, excl) -> dict:
    """{customer_id: numero del documento real} de los clientes de los documentos excluidos."""
    clientes = {}
    for tabla, ids in (("customer_requests", excl.sc), ("sales_quotations", excl.cot), ("sale_orders", excl.pven)):
        if ids:
            for cid, numero in db.execute(text(f"SELECT customer_id, numero FROM {tabla} WHERE id = ANY(:i) "
                                               f"AND customer_id IS NOT NULL ORDER BY id"), {"i": sorted(ids)}):
                clientes.setdefault(cid, numero)
    return clientes


# ═══ empresa ══════════════════════════════════════════════════════════════════════════════════════════════════

def listar_empresa(db, excl) -> Listado:
    l = _nuevo("empresa")
    condiciones = " OR ".join(f"left(key, {len(p)}) = :p{i}" for i, p in enumerate(PREFIJOS_RESERVADOS))
    filas = _filas(db, f"SELECT key AS clave, length(value) AS largo, updated_at FROM admin_config "
                       f"WHERE {condiciones} ORDER BY key",
                   **{f"p{i}": p for i, p in enumerate(PREFIJOS_RESERVADOS)})
    usadas = {c[0] for c in CAMPOS_EMPRESA.values()} | {CLAVE_LOGO, CLAVE_LOGO_VERSION}
    for f in filas:
        f["largo"] = f["largo"] or 0
        f["usa_bloque3"] = "Sí" if f["clave"] in usadas else "No: choque (el Bloque 3 no la usa y la oculta de " \
                                                             "/ventas/config)"
    l.secciones.append(Seccion(
        "claves", "Claves empresa_* y documentos_* en admin_config",
        [("clave", "Clave"), ("usa_bloque3", "¿La usa el Bloque 3?"), ("largo", "Largo del valor"),
         ("updated_at", "Actualizada (UTC)")], filas))
    l.notas.append("No se imprimen los valores (pueden traer el logo o los datos para pagar). Una clave que el Bloque 3 "
                   "usa y ya existe sale tal cual en Configuración > Información de la empresa y en los documentos del "
                   "cliente.")
    return l


# ═══ tax_rate ═════════════════════════════════════════════════════════════════════════════════════════════════

def _sel_tax_rate(db, con_tarifa_iva, bloquear=False):
    """(copiables, ya_tienen, otros) de los productos con tax_rate distinto de 0. Sin la columna tarifa_iva (antes de
    desplegar) ningun producto tiene tarifa todavia."""
    columna = ", tarifa_iva" if con_tarifa_iva else ""   # sin la columna, la consulta ni la nombra
    bloqueo = " FOR UPDATE" if bloquear else ""
    filas = _filas(db, f"SELECT id, name AS nombre, tax_rate{columna} FROM products "
                       f"WHERE tax_rate IS NOT NULL AND tax_rate <> 0 ORDER BY id{bloqueo}")
    copiables, ya_tienen, otros = [], [], []
    for f in filas:
        f.setdefault("tarifa_iva", None)
        try:
            tarifa = normalizar_tarifa_iva(f["tax_rate"])
        except ValueError:
            tarifa = None
        f["tax_rate_original"] = f["tax_rate"]
        f["tax_rate"] = _numero_legible(f["tax_rate"])
        if tarifa not in TARIFAS_QUE_SE_COPIAN:
            # F1 (M29): el que ya tiene tarifa no «se deja sin definir»: conserva la suya (el UPDATE nunca la toca).
            f["queda"] = (f"conserva '{f['tarifa_iva']}'" if f["tarifa_iva"] is not None
                          else "sin definir (no es 19 ni 5)")
            otros.append(f)
        elif f["tarifa_iva"] is not None:
            ya_tienen.append(f)
        else:
            f["tarifa_nueva"] = tarifa
            copiables.append(f)
    return copiables, ya_tienen, otros


def listar_tax_rate(db, excl) -> Listado:
    l = _nuevo("tax_rate")
    columnas = _columnas(db, "products")
    con_tarifa_iva = "tarifa_iva" in columnas
    copiables, ya_tienen, otros = ([], [], [])
    if "tax_rate" in columnas:
        copiables, ya_tienen, otros = _sel_tax_rate(db, con_tarifa_iva)
    else:
        l.notas.append(MENSAJE_SIN_TAX_RATE)
    l.secciones.append(Seccion(
        "copiables", "Productos con tax_rate 19 o 5 y sin tarifa de IVA: --aplicar copiaría la tarifa",
        [("id", "Id"), ("nombre", "Producto"), ("tax_rate", "tax_rate"), ("tarifa_nueva", "tarifa_iva (queda)")],
        copiables))
    l.secciones.append(Seccion(
        "otros", "Productos con otro tax_rate: se dejan sin definir",
        [("id", "Id"), ("nombre", "Producto"), ("tax_rate", "tax_rate"), ("queda", "tarifa_iva (queda)")], otros))
    l.secciones.append(Seccion(
        "ya_tienen", "Productos con tax_rate distinto de 0 que ya tienen tarifa de IVA: no se tocan",
        [("id", "Id"), ("nombre", "Producto"), ("tax_rate", "tax_rate"), ("tarifa_iva", "tarifa_iva (hoy)")],
        ya_tienen))
    sin_tarifa = Seccion("sin_tarifa", "Productos activos sin tarifa de IVA (el usuario los clasifica)",
                         [("id", "Id"), ("nombre", "Producto")])
    if con_tarifa_iva:
        sin_tarifa.filas = _filas(db, "SELECT id, name AS nombre FROM products WHERE is_active AND tarifa_iva IS NULL "
                                      "ORDER BY id")
        sin_tarifa.nota = "es lo mismo que muestra el filtro «Sin tarifa de IVA» del catálogo"
    else:
        sin_tarifa.nota = ("no aplica todavía: falta la columna products.tarifa_iva, que crea fa6_027 al desplegar el "
                           "Bloque 3; después de desplegar, volver a correr este listado")
    l.secciones.append(sin_tarifa)
    l.notas.append("Los productos no son parte de la cadena de un documento: este subcomando no lee ni cambia ninguna "
                   "SC, COT ni pedido (las líneas ya guardadas conservan su tarifa).")
    # F1 (M25): el comando exacto, con los ids copiables de ESTE listado: --aplicar no copia nada que no se haya aprobado.
    if copiables:
        ids = ",".join(str(f["id"]) for f in copiables)
        l.notas.append(f"Para copiar SOLO estos (con el OK del usuario): python scripts/datos_bloque3.py tax_rate "
                       f"--aplicar --base {base_actual(db)} --ids {ids}")
    else:
        l.notas.append("No hay productos copiables: tax_rate --aplicar no tendría nada que copiar.")
    return l


def _copiar_tarifa(db, producto_id, tarifa) -> int:
    """Pone la tarifa SOLO si el producto sigue sin tarifa. Devuelve las filas cambiadas (0 o 1)."""
    return db.execute(text("UPDATE products SET tarifa_iva = :t WHERE id = :i AND tarifa_iva IS NULL"),
                      {"t": tarifa, "i": producto_id}).rowcount


def _escribir_respaldo_tax_rate(carpeta, base, filas, ahora) -> str:
    """El respaldo minimo, ANTES de escribir: id, tarifa_iva (la de hoy) y tax_rate de cada producto que se copia."""
    contenido = {"subcomando": "tax_rate", "base": base, "generado_utc": ahora.isoformat(),
                 "como_deshacer": "Por cada fila: UPDATE products SET tarifa_iva = NULL WHERE id = <id>;",
                 "columnas": ["id", "tarifa_iva", "tax_rate"],
                 "filas": [{"id": f["id"], "tarifa_iva": f["tarifa_iva"], "tax_rate": str(f["tax_rate_original"])}
                           for f in filas]}
    carpeta = Path(carpeta)
    carpeta.mkdir(parents=True, exist_ok=True)
    marca = ahora.strftime("%Y%m%d-%H%M%S")
    ruta, n = carpeta / f"tax_rate-{base}-{marca}.json", 1
    while ruta.exists():
        n += 1
        ruta = carpeta / f"tax_rate-{base}-{marca}-{n}.json"
    ruta.write_text(json.dumps(contenido, ensure_ascii=False, indent=1), encoding="utf-8")
    return str(ruta)


def _marcar_no_aplicado(ruta) -> Optional[str]:
    """Nada llego a escribirse: el respaldo pasa a '...-NO-APLICADO.json' (no se borra). Si el renombrado falla lo avisa
    por stderr y deja el nombre original."""
    destino = ruta[:-len(".json")] + "-NO-APLICADO.json"
    try:
        os.replace(ruta, destino)
        return destino
    except OSError as exc:
        print(f"AVISO: no se pudo renombrar el respaldo {ruta} ({exc}). Queda con su nombre original: NO lo tomes por "
              f"el respaldo de algo aplicado.", file=sys.stderr)
        return None


def aplicar_tax_rate(db, base, carpeta_respaldo=CARPETA_DATOS, ids=None) -> ResultadoAplicar:
    """Copia products.tax_rate a tarifa_iva (19 -> '19', 5 -> '5') en los productos sin tarifa de `ids`, SOLO con el OK
    del usuario. Aborta (ErrorDatos) SIN escribir si `base` no es current_database(), si no vienen `ids` (F1, M25:
    MENSAJE_FALTA_IDS; sin ids no se copia «lo copiable de ese momento»), si un id de `ids` no esta entre los que se
    copiarian o si no se puede escribir el respaldo. Termina sin escribir, y lo dice, si falta products.tarifa_iva o
    products.tax_rate. Respaldo JSON antes de escribir, un solo commit y, ante cualquier error, rollback y el respaldo
    pasa a '...-NO-APLICADO.json'."""
    res = ResultadoAplicar()
    actual = base_actual(db)
    if base != actual:
        db.rollback()
        raise ErrorDatos(f"--base {base!r} no coincide con la base a la que está conectado el script ({actual!r}): no "
                         f"se escribió nada.")
    if not ids:
        db.rollback()
        raise ErrorDatos(MENSAJE_FALTA_IDS)
    columnas = _columnas(db, "products")
    if "tarifa_iva" not in columnas:
        db.rollback()
        res.detalle.append(MENSAJE_SIN_TARIFA_IVA)
        return res
    if "tax_rate" not in columnas:
        db.rollback()
        res.detalle.append(MENSAJE_SIN_TAX_RATE)
        return res
    copiables, ya_tienen, otros = _sel_tax_rate(db, con_tarifa_iva=True, bloquear=True)
    if ids is not None:
        faltan = []
        for i in ids:
            if any(f["id"] == i for f in copiables):
                continue
            otro = next((f for f in otros if f["id"] == i), None)
            if otro is not None:
                queda = (f"conserva '{otro['tarifa_iva']}'" if otro["tarifa_iva"] is not None
                         else "se deja sin definir")
                faltan.append(f"id {i}: su tax_rate no es 19 ni 5 ({queda})")
            elif any(f["id"] == i for f in ya_tienen):
                faltan.append(f"id {i}: ya tiene tarifa de IVA (no se toca)")
            else:
                faltan.append(f"id {i}: no está en el listado (sin tax_rate distinto de 0)")
        if faltan:
            db.rollback()
            raise ErrorDatos("tax_rate: no se escribió nada. " + "; ".join(faltan))
    elegidos = [f for f in copiables if f["id"] in set(ids)]
    if not elegidos:
        db.rollback()
        res.detalle.append("No hay productos con tax_rate 19 o 5 sin tarifa de IVA: no se escribió nada.")
        return res
    try:
        ruta = _escribir_respaldo_tax_rate(carpeta_respaldo, base, elegidos, _ahora_utc())
    except OSError as exc:
        # F1 (M31 b): sin respaldo no se escribe nada (y se sueltan los bloqueos del SELECT ... FOR UPDATE).
        db.rollback()
        raise ErrorDatos(f"No se pudo escribir el respaldo en {carpeta_respaldo} ({type(exc).__name__}): no se escribió "
                         f"nada.") from exc
    try:
        for f in elegidos:
            if _copiar_tarifa(db, f["id"], f["tarifa_nueva"]):
                res.cambiados += 1
                res.detalle.append(f"producto {f['id']}: tax_rate {f['tax_rate']} → tarifa_iva '{f['tarifa_nueva']}'")
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


# ═══ iva_documentos ═══════════════════════════════════════════════════════════════════════════════════════════

def _motivo_sin_iva(productos) -> str:
    modo = lineas_con_tarifa(productos)
    if modo == "ninguna":
        return "sus líneas no traen tarifa de IVA" if productos else "no tiene líneas"
    if modo == "mezcla":
        return "solo algunas líneas traen tarifa de IVA"
    return "el IVA por tarifa de las líneas no cuadra con la cabecera"


def _sin_iva(filas, entidad, excluidos_ids, l) -> list:
    salen = []
    for f in filas:
        if desglose_documento(f)["iva_discriminado"]:
            continue
        fila = {"id": f["id"], "numero": f["numero"], "estado": _est(entidad, f["estado"]),
                "total": monto_exacto(f["total_cop"]), "iva": monto_exacto(f["tax_cop"] or 0),
                "motivo": _motivo_sin_iva(f["productos"])}
        if f["id"] in excluidos_ids:
            l.excluidos.append(f"{f['numero']} (sin IVA discriminado)")
        else:
            salen.append(fila)
    return salen


def listar_iva_documentos(db, excl) -> Listado:
    l = _nuevo("iva_documentos")
    tax_cot = "q.tax_cop" if "tax_cop" in _columnas(db, "sales_quotations") else "0 AS tax_cop"
    cots = _filas(db, f"SELECT q.id, q.numero, q.estado, q.productos, q.subtotal_cop, {tax_cot}, q.total_cop "
                      f"FROM sales_quotations q WHERE q.estado = ANY(:e) ORDER BY q.id", e=list(ESTADOS_COT_ACTIVOS))
    vens = _filas(db, "SELECT v.id, v.numero, v.estado, v.productos, v.subtotal_cop, v.tax_cop, v.total_cop "
                      "FROM sale_orders v WHERE v.estado <> 'CANCELADO' ORDER BY v.id")
    columnas = [("numero", "Documento"), ("estado", "Estado"), ("total", "Total"), ("iva", "IVA guardado"),
                ("motivo", "Por qué")]
    l.secciones.append(Seccion("cotizaciones", "Cotizaciones activas sin IVA discriminado", columnas,
                               _sin_iva(cots, "COT", excl.cot, l)))
    l.secciones.append(Seccion("pedidos", "Pedidos no cancelados sin IVA discriminado", columnas,
                               _sin_iva(vens, "VEN", excl.pven, l)))
    l.notas.append("No se corrigen: sus totales ya los aceptó el cliente. Al volver a cotizar, la COT queda con el IVA "
                   "por línea.")
    return l


# ═══ centavos_cot ═════════════════════════════════════════════════════════════════════════════════════════════

def _con_centavos(valor) -> bool:
    """El monto tiene centavos. Lo que no es un monto (None, texto no numerico, NaN) no cuenta."""
    if valor is None or isinstance(valor, bool):
        return False
    try:
        d = Decimal(str(valor))
    except (InvalidOperation, ValueError):
        return False
    return d.is_finite() and d != d.to_integral_value()


def listar_centavos_cot(db, excl) -> Listado:
    l = _nuevo("centavos_cot")
    cabecera, lineas = [], []
    for f in _filas(db, "SELECT id, numero, estado, productos, subtotal_cop, total_cop FROM sales_quotations "
                        "WHERE estado = :e ORDER BY id", e=PENDIENTE):
        en_cabecera = _con_centavos(f["subtotal_cop"]) or _con_centavos(f["total_cop"])
        precios = [p.get("unit_price_cop") for p in (f["productos"] if isinstance(f["productos"], list) else [])
                   if isinstance(p, dict)]
        con_centavos = [p for p in precios if _con_centavos(p)]
        if not en_cabecera and not con_centavos:
            continue
        if f["id"] in excl.cot:
            l.excluidos.append(f"{f['numero']} (con centavos)")
            continue
        if en_cabecera:
            cabecera.append({"id": f["id"], "numero": f["numero"], "subtotal": monto_exacto(f["subtotal_cop"]),
                             "total": monto_exacto(f["total_cop"])})
        if con_centavos:
            lineas.append({"id": f["id"], "numero": f["numero"], "lineas_con_centavos": len(con_centavos),
                           "ejemplo": monto_exacto(con_centavos[0])})
    l.secciones.append(Seccion("cabecera", "Con centavos en el subtotal o el total",
                               [("numero", "Cotización"), ("subtotal", "Subtotal"), ("total", "Total")], cabecera))
    l.secciones.append(Seccion("lineas", "Con centavos en el precio unitario de alguna línea",
                               [("numero", "Cotización"), ("lineas_con_centavos", "Líneas con centavos"),
                                ("ejemplo", "Ejemplo de precio")], lineas))
    l.notas.append("Una COT puede salir en las dos secciones. Se corrigen con correcciones_bloque1.py h42 (B1-T14), "
                   "solo con el OK del usuario.")
    return l


# ═══ anticipos_cot ════════════════════════════════════════════════════════════════════════════════════════════

def _credito_antes_de_d7(modalidad) -> bool:
    """La regla de credito de antes de B2.1 D7 (34bc946): sin tildes ni mayusculas, todo lo que empezara por 'cr' o
    dijera 'credito' iba al 0% de anticipo."""
    texto = _sin_tildes(modalidad) if modalidad is not None else ""
    return bool(texto) and (texto.startswith("cr") or "credito" in texto)


def listar_anticipos_cot(db, excl) -> Listado:
    l = _nuevo("anticipos_cot")
    filas = _filas(db, """
        SELECT q.id, q.numero, q.estado, q.sc_id, q.total_cop, q.anticipo_cop, q.anticipo_pct_manual,
               cr.id AS sc_encontrada, cr.modalidad_pago
        FROM sales_quotations q LEFT JOIN customer_requests cr ON cr.id = q.sc_id
        WHERE q.estado = ANY(:e)
          AND NOT EXISTS (SELECT 1 FROM sale_orders v WHERE v.cot_id = q.id AND v.estado <> 'CANCELADO')
        ORDER BY q.id""", e=list(ESTADOS_COT_ANTICIPO))
    d7, otras, revisadas = [], [], 0
    for f in filas:
        # anticipo_cotizacion con la SC ya leida (sin volver a cargar el modelo, que en una base sin el Bloque 3 no
        # tiene sus columnas nuevas): si la SC no existe, la COT se trata como sin SC, igual que la regla.
        sc = SimpleNamespace(modalidad_pago=f["modalidad_pago"]) if f["sc_encontrada"] is not None else None
        cot = SimpleNamespace(sc_id=f["sc_id"] if sc is not None else None, total_cop=f["total_cop"],
                              anticipo_cop=f["anticipo_cop"], anticipo_pct_manual=f["anticipo_pct_manual"])
        a = anticipo_cotizacion(cot, db, sc=sc)
        guardado = Decimal(str(f["anticipo_cop"] or 0))
        if f["id"] not in excl.cot:
            revisadas += 1
        if guardado == a.requerido:
            continue
        salio_de_credito = (a.origen == ORIGEN_MODALIDAD and _credito_antes_de_d7(a.modalidad)
                            and _sin_tildes(a.modalidad) not in MODALIDADES_CREDITO)
        solo_por_d7 = salio_de_credito and guardado == anticipo_requerido(f["total_cop"], Decimal("0"))
        if f["id"] in excl.cot:
            l.excluidos.append(f"{f['numero']} (anticipo {monto_exacto(guardado)} → {monto_exacto(a.requerido)})")
            continue
        fila = {"id": f["id"], "numero": f["numero"], "estado": _est("COT", f["estado"]),
                "modalidad": a.modalidad or "-", "total": monto_exacto(f["total_cop"]),
                "anticipo_guardado": monto_exacto(guardado), "anticipo_hoy": monto_exacto(a.requerido),
                "pct": formato_pct(a.pct), "origen": a.origen}
        (d7 if solo_por_d7 else otras).append(fila)
    columnas = [("numero", "Cotización"), ("estado", "Estado"), ("modalidad", "Modalidad de la SC"), ("total", "Total"),
                ("anticipo_guardado", "Anticipo guardado"), ("pct", "% de hoy"), ("origen", "Origen del %"),
                ("anticipo_hoy", "Anticipo de hoy")]
    l.secciones.append(Seccion("dejo_de_ser_credito", "Modalidad que dejó de ser crédito (B2.1 D7)", columnas, d7,
                               nota="con la regla vieja su anticipo era 0% y el guardado es ese; hoy la modalidad "
                                    "no está en MODALIDADES_CREDITO y cae en el anticipo de su modalidad o en el 60%"))
    l.secciones.append(Seccion("desactualizadas", "Anticipo desactualizado por otra razón", columnas, otras))
    l.notas.append(f"{revisadas} COT pendientes o confirmadas sin pedido vigente revisadas; "
                   f"{revisadas - len(d7) - len(otras)} ya tienen el anticipo de hoy. Al convertir en pedido el "
                   f"anticipo se recalcula siempre.")
    return l


# ═══ pagos_sin_verificar ══════════════════════════════════════════════════════════════════════════════════════

def listar_pagos_sin_verificar(db, excl) -> Listado:
    l = _nuevo("pagos_sin_verificar")
    salen = []
    for f in _filas(db, """
            SELECT v.id, v.numero, v.estado, p.id AS pago_id, p.monto, p.created_at
            FROM sale_order_payments p JOIN sale_orders v ON v.id = p.sale_order_id
            WHERE p.metodo_pago = :m AND p.estado = 'CONFIRMADO' ORDER BY v.id, p.id""",
                    m=METODO_PAGO_SIN_VERIFICAR):
        if f["id"] in excl.pven or f["pago_id"] in excl.pagos:
            l.excluidos.append(f"{f['numero']} (pago #{f['pago_id']} de {monto_exacto(f['monto'])})")
            continue
        salen.append({"id": f["id"], "numero": f["numero"], "estado": _est("VEN", f["estado"]),
                      "pago_id": f["pago_id"], "monto": monto_exacto(f["monto"]), "registrado": f["created_at"]})
    l.secciones.append(Seccion(
        "pagos", "Pedidos con un pago CONVERSION_COTIZACION confirmado",
        [("numero", "Pedido"), ("estado", "Estado"), ("pago_id", "Pago #"), ("monto", "Monto"),
         ("registrado", "Registrado (UTC)")], salen))
    return l


# ═══ telefonos ════════════════════════════════════════════════════════════════════════════════════════════════

def _digitos(telefono) -> int:
    return len(_NO_DIGITO.sub("", "" if telefono is None else str(telefono)))


def listar_telefonos(db, excl) -> Listado:
    l = _nuevo("telefonos")
    excluidos_clientes = _clientes_excluidos(db, excl)
    invalidos, validos, sin_telefono = [], 0, 0
    for c in _filas(db, "SELECT id, first_name, last_name, phone FROM customers ORDER BY id"):
        if c["id"] in excluidos_clientes:
            if e164_whatsapp(c["phone"]) is None:
                l.excluidos.append(f"cliente #{c['id']} (de {excluidos_clientes[c['id']]})")
            continue
        if e164_whatsapp(c["phone"]) is not None:
            validos += 1
        elif numero_whatsapp(c["phone"]) is None:
            sin_telefono += 1
        else:
            nombre = " ".join(x for x in (c["first_name"], c["last_name"]) if x and str(x).strip()) or "-"
            invalidos.append({"id": c["id"], "nombre": nombre, "digitos": _digitos(c["phone"])})
    l.datos.update(clientes_validos=validos, clientes_sin_telefono=sin_telefono, clientes_invalidos=len(invalidos))
    l.secciones.append(Seccion("clientes", "Clientes con un teléfono que no sirve para WhatsApp",
                               [("id", "Id"), ("nombre", "Cliente"), ("digitos", "Dígitos")], invalidos))

    documentos = (
        ("SC", "customer_requests", excl.sc,
         "d.eliminada_at IS NULL AND d.estado <> ALL(:cerrados)", {"cerrados": list(ESTADOS_SC_CERRADOS)}),
        ("COT", "sales_quotations", excl.cot, "d.estado = ANY(:activos)", {"activos": list(ESTADOS_COT_ACTIVOS)}),
        ("PVEN", "sale_orders", excl.pven, "d.estado <> 'CANCELADO'", {}),
    )
    malos, sin = [], []
    for tipo, tabla, excluidos_ids, condicion, params in documentos:
        for f in _filas(db, f"SELECT d.id, d.numero, d.estado, d.customer_phone, d.customer_id, c.phone AS cliente_phone "
                            f"FROM {tabla} d LEFT JOIN customers c ON c.id = d.customer_id "
                            f"WHERE {condicion} ORDER BY d.id", **params):
            cliente = SimpleNamespace(phone=f["cliente_phone"]) if f["customer_id"] is not None else None
            crudo = telefono_del_documento(SimpleNamespace(customer_phone=f["customer_phone"], customer=cliente))
            if e164_whatsapp(crudo) is not None:
                continue
            if f["id"] in excluidos_ids:
                l.excluidos.append(f"{f['numero']} (sin un WhatsApp válido)")
                continue
            fila = {"id": f["id"], "numero": f["numero"], "tipo": tipo,
                    "estado": _est("VEN" if tipo == "PVEN" else tipo, f["estado"])}
            if crudo is None:
                sin.append(fila)
            else:
                fila["digitos"] = _digitos(crudo)
                fila["origen"] = ("del documento" if numero_whatsapp(f["customer_phone"]) is not None
                                  else "del cliente")
                malos.append(fila)
    l.secciones.append(Seccion("documentos_invalidos", "Documentos vigentes con un teléfono que no sirve para WhatsApp",
                               [("numero", "Documento"), ("tipo", "Tipo"), ("estado", "Estado"),
                                ("digitos", "Dígitos"), ("origen", "Teléfono")], malos))
    l.secciones.append(Seccion("documentos_sin_telefono",
                               "Documentos vigentes sin teléfono (ni en el documento ni en su cliente)",
                               [("numero", "Documento"), ("tipo", "Tipo"), ("estado", "Estado")], sin))
    l.notas.append(f"Clientes con WhatsApp válido: {validos}. Clientes sin teléfono (sin dígitos; no se listan): "
                   f"{sin_telefono}. Clientes con un teléfono que no sirve: {len(invalidos)}.")
    l.notas.append("Un número de 10 dígitos se toma como celular de Colombia (+57). Con indicativo, de 11 a 15 dígitos "
                   "(con 57, exactamente 12).")
    return l


# ═══ pendientes_sin_seguimiento ═══════════════════════════════════════════════════════════════════════════════

def _recordatorio_legible(estado, motivo) -> str:
    if estado is None:
        return "Ninguno"
    nombre = {AGOTADO: "Agotado (ya salieron todos)", DETENIDO: "Detenido"}.get(estado, estado.capitalize())
    return f"{nombre}: {motivo.replace('_', ' ').lower()}" if motivo else nombre


def listar_pendientes_sin_seguimiento(db, excl) -> Listado:
    l = _nuevo("pendientes_sin_seguimiento")
    con_tabla = bool(_columnas(db, "seguimientos_confirmacion"))
    if not con_tabla:
        l.notas.append("La tabla seguimientos_confirmacion aún no existe en esta base (la crea fa6_031 al desplegar "
                       "el Bloque 3): ninguna tiene recordatorio.")
    for tipo, tabla, filtro, excluidos_ids, titulo in (
            ("SC", "customer_requests", " AND d.eliminada_at IS NULL", excl.sc,
             "Solicitudes pendientes por confirmación sin recordatorio"),
            ("COT", "sales_quotations", "", excl.cot, "Cotizaciones esperando confirmación sin recordatorio")):
        if con_tabla:
            sql = (f"SELECT d.id, d.numero, d.updated_at, s.estado AS seguimiento, s.motivo_fin FROM {tabla} d "
                   f"LEFT JOIN seguimientos_confirmacion s ON s.document_type = :tipo AND s.document_id = d.id "
                   f"WHERE d.estado = :pendiente{filtro} AND (s.id IS NULL OR s.estado <> :activo) "
                   f"ORDER BY d.updated_at, d.id")
        else:
            sql = (f"SELECT d.id, d.numero, d.updated_at, NULL AS seguimiento, NULL AS motivo_fin FROM {tabla} d "
                   f"WHERE d.estado = :pendiente{filtro} ORDER BY d.updated_at, d.id")
        params = {"pendiente": PENDIENTE, **({"tipo": tipo, "activo": ACTIVO} if con_tabla else {})}
        salen = []
        for f in _filas(db, sql, **params):
            if f["id"] in excluidos_ids:
                l.excluidos.append(f"{f['numero']} (pendiente sin recordatorio)")
                continue
            salen.append({"id": f["id"], "numero": f["numero"], "desde": f["updated_at"],
                          "recordatorio": _recordatorio_legible(f["seguimiento"], f["motivo_fin"])})
        l.secciones.append(Seccion(tipo.lower(), titulo,
                                   [("numero", "Documento"), ("desde", "Última actualización (UTC)"),
                                    ("recordatorio", "Recordatorio")], salen))
    l.notas.append("No se programa nada: basta con reenviar la que se quiera seguir. La mayoría de las viejas tiene el "
                   "enlace vencido.")
    return l


# ═══ notas_cot ════════════════════════════════════════════════════════════════════════════════════════════════

def listar_notas_cot(db, excl) -> Listado:
    l = _nuevo("notas_cot")
    cot_calc, cot_otras, otros_estados = [], [], []
    for f in _filas(db, "SELECT id, numero, estado, COALESCE(fecha_cotizacion, created_at) AS fecha, notas "
                        "FROM sales_quotations WHERE notas IS NOT NULL ORDER BY id"):
        if not f["notas"].strip():
            continue
        calculadora = _es_del_cotizador_rapido(f["notas"])
        activa = f["estado"] in ESTADOS_COT_ACTIVOS
        if not activa and not calculadora:
            continue
        if f["id"] in excl.cot:
            l.excluidos.append(f"{f['numero']} (COT con notas)")
            continue
        fila = {"id": f["id"], "numero": f["numero"], "estado": _est("COT", f["estado"]), "fecha": f["fecha"],
                "notas": _notas_recortadas(f["notas"])}
        if not activa:
            otros_estados.append(fila)
        else:
            (cot_calc if calculadora else cot_otras).append(fila)
    pven_calc, pven_otras = [], []
    for f in _filas(db, "SELECT v.id, v.numero, v.estado, v.created_at AS fecha, v.cot_id, q.numero AS cot_numero, "
                        "q.notas FROM sale_orders v JOIN sales_quotations q ON q.id = v.cot_id "
                        "WHERE v.estado <> 'CANCELADO' AND q.notas IS NOT NULL ORDER BY v.id"):
        if not f["notas"].strip():
            continue
        if f["id"] in excl.pven or f["cot_id"] in excl.cot:
            l.excluidos.append(f"{f['numero']} (pedido de {f['cot_numero']}, con notas)")
            continue
        fila = {"id": f["id"], "numero": f["numero"], "estado": _est("VEN", f["estado"]), "fecha": f["fecha"],
                "cot_origen": f["cot_numero"], "notas": _notas_recortadas(f["notas"])}
        (pven_calc if _es_del_cotizador_rapido(f["notas"]) else pven_otras).append(fila)
    col_cot = [("numero", "Cotización"), ("estado", "Estado"), ("fecha", "Fecha (UTC)"),
               ("notas", f"Notas (hasta {LARGO_NOTAS} caracteres)")]
    col_pven = [("numero", "Pedido"), ("estado", "Estado"), ("fecha", "Fecha (UTC)"), ("cot_origen", "COT de origen"),
                ("notas", f"Notas de la COT (hasta {LARGO_NOTAS} caracteres)")]
    l.secciones += [
        Seccion("cot_calculadora", "COT activas con las notas del Cotizador Rápido (margen y TRM)", col_cot, cot_calc),
        Seccion("cot_notas", "COT activas con otras notas", col_cot, cot_otras),
        Seccion("pven_calculadora", "Pedidos no cancelados cuya COT tiene las notas del Cotizador Rápido", col_pven,
                pven_calc),
        Seccion("pven_notas", "Pedidos no cancelados cuya COT tiene otras notas", col_pven, pven_otras),
        Seccion("calculadora_otros_estados", "COT del Cotizador Rápido en otros estados (rechazadas, vencidas...)",
                col_cot, otros_estados, informativa=True,
                nota="no son activas: se listan para que el usuario vea todas las del Cotizador Rápido"),
    ]
    l.notas.append("Las activas son las COT en Borrador, Enviada, Pendiente de confirmación o Confirmada. Una COT con "
                   "pedido sale en su sección y su pedido en la de pedidos.")
    return l


# ─── despacho ─────────────────────────────────────────────────────────────────────────────────────────────────

LISTADORES = {"empresa": listar_empresa, "tax_rate": listar_tax_rate, "iva_documentos": listar_iva_documentos,
              "centavos_cot": listar_centavos_cot, "anticipos_cot": listar_anticipos_cot,
              "pagos_sin_verificar": listar_pagos_sin_verificar, "telefonos": listar_telefonos,
              "pendientes_sin_seguimiento": listar_pendientes_sin_seguimiento, "notas_cot": listar_notas_cot}


def listar(db, subcomando, excluidos=NUMEROS_REALES, excl=None) -> Listado:
    """El listado de un subcomando. Corre SIEMPRE dentro de SET TRANSACTION READ ONLY y termina con rollback (F1, M27:
    sin la salida solo_lectura=False: --listar no puede escribir ni por error). `excl` son los excluidos ya calculados
    (listar_todo los calcula una vez)."""
    if subcomando not in LISTADORES:
        raise ErrorDatos(f"Subcomando desconocido: {subcomando!r}")
    iniciar_solo_lectura(db)
    try:
        motivo = _faltantes(db, subcomando)
        if motivo:
            return _nuevo(subcomando, no_aplica=motivo)
        excl = excl if excl is not None else calcular_excluidos(db, excluidos)
        return LISTADORES[subcomando](db, excl)
    finally:
        db.rollback()


def listar_todo(db, excluidos=NUMEROS_REALES, subcomandos=SUBCOMANDOS, excl=None) -> list:
    """Los listados, en el orden de SUBCOMANDOS, cada uno en su transaccion de solo lectura. Uno que falla no tumba a
    los demas: queda con su error."""
    if excl is None:
        iniciar_solo_lectura(db)
        try:
            excl = calcular_excluidos(db, excluidos)
        finally:
            db.rollback()
    listados = []
    for sub in subcomandos:
        try:
            listados.append(listar(db, sub, excluidos, excl=excl))
        except Exception as exc:  # noqa: BLE001 -- se reporta por subcomando y se sigue
            db.rollback()
            listados.append(_nuevo(sub, error=f"{type(exc).__name__}: {exc}"))
    return listados


# ─── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────

def _lista_de_enteros(valor):
    try:
        return [int(x) for x in valor.split(",") if x.strip()]
    except ValueError:
        raise argparse.ArgumentTypeError("--ids lleva enteros separados por coma (p. ej. 12,13)") from None


class _Parser(argparse.ArgumentParser):
    def parse_args(self, args=None, namespace=None):
        ns = super().parse_args(args, namespace)
        if getattr(ns, "aplicar", False) and not ns.base:
            self.error("--aplicar exige --base <nombre de la base>, igual a current_database()")
        if getattr(ns, "aplicar", False) and not ns.ids:
            self.error(MENSAJE_FALTA_IDS)   # F1 (M25)
        return ns


def armar_parser() -> argparse.ArgumentParser:
    parser = _Parser(description="Revisa los datos existentes que necesita el Bloque 3 de Ventas (tarea 21).")
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
    todo = sub.add_parser("todo", help="corre todos los listados")
    todo.add_argument("--listar", action="store_true", required=True, help="solo lectura")
    todo.set_defaults(aplicar=False, base=None, ids=None, respaldo=str(CARPETA_DATOS))
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
            # F1 (M26): arriba de todo y visible, en stdout y en stderr: la salida trae datos reales.
            print("!" * 78)
            print(AVISO_PRODUCCION)
            print("!" * 78)
            print(AVISO_PRODUCCION, file=sys.stderr)
        print(f"Fecha (UTC): {datetime.datetime.now(datetime.timezone.utc):%Y-%m-%d %H:%M:%S}")
        if args.listar:
            db.rollback()
            subcomandos = SUBCOMANDOS if args.subcomando == "todo" else (args.subcomando,)
            iniciar_solo_lectura(db)
            try:
                excl = calcular_excluidos(db)
            finally:
                db.rollback()
            print("Documentos reales protegidos (y lo encadenado a ellos): " + (", ".join(excl.etiquetas) or "ninguno"))
            print()
            listados = listar_todo(db, subcomandos=subcomandos, excl=excl)
            for l in listados:
                print(texto_listado(l))
            if len(listados) > 1:
                print(texto_resumen(listados))
            print("LISTAR: no se escribió nada (transacción de solo lectura).")
            return 1 if any(l.error for l in listados) else 0
        try:
            res = aplicar_tax_rate(db, base=args.base, carpeta_respaldo=args.respaldo, ids=args.ids)
        except ErrorDatos as exc:
            print(f"ABORTADO: {exc}", file=sys.stderr)
            return 2
        print(f"tax_rate: {res.cambiados} producto(s) cambiado(s).")
        for linea in res.detalle:
            print(f"  - {linea}")
        if res.respaldo:
            print(f"Respaldo JSON: {res.respaldo}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
