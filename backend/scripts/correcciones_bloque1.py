"""
correcciones_bloque1.py -- Corrige los DATOS VIEJOS que dejaron los errores del Bloque 1 de Ventas (tarea 14).
El codigo ya esta arreglado (T1-T13): esto repara lo que quedo guardado antes, paso por paso y SOLO con el OK
explicito del usuario, por entorno (erp_test y produccion por separado).

Uso (desde backend/, con el python del venv):
    python scripts/correcciones_bloque1.py todo --listar            corre todos los listados, en el orden obligatorio
    python scripts/correcciones_bloque1.py n1 --listar              un solo paso, solo lectura
    python scripts/correcciones_bloque1.py h45 --aplicar --base erp_test [--ids 3,4] [--numeros PXP-1,PXP-2]
    python scripts/correcciones_bloque1.py n1 --aplicar --base erp_test --decisiones decisiones_n1.json

Pasos, en el orden OBLIGATORIO (R1; un paso puede depender de que el anterior ya se haya aplicado):
    n1   pagos de anticipo CONVERSION_COTIZACION que nadie verifico       (decision por pedido: a | b)
    h44  PXP con los montos invertidos
    h45  PXP pendientes de pedidos ya cancelados
    h46  COT confirmadas cuyos pedidos estan todos cancelados -> las reabre
    h36  anticipo de las COT abiertas segun la modalidad de la solicitud
    n4   solicitudes canceladas: (a) con documentos activos, (b) en la papelera sin cancelar, (c) sin papelera
    n2   pedidos con estado raro (solo listado; no escribe)
    n5   solicitudes y cotizaciones con estados ajenos                    (decision por documento: --numeros)
    n10  logs MERCANCIA_DISPONIBLE guardados como 'PVEN' con el id de la linea
    h7   textos viejos de la Actividad (reutiliza corregir_textos_actividad.corregir)
    u9   leads del CRM con la descripcion sin el numero de la solicitud
    h42  montos con centavos en documentos sin pagos (el diseno NO lo recomienda; R1 del usuario)

Seguridad:
  - Al iniciar imprime la URL enmascarada y SELECT current_database(). Nunca lee ni imprime credenciales.
  - --listar corre en una transaccion de SOLO LECTURA (SET TRANSACTION READ ONLY) y termina con rollback.
  - --aplicar exige --base <nombre> igual a current_database(): si no coincide, aborta sin escribir.
  - --aplicar acepta --ids o --numeros para limitarse a lo aprobado. n1 y n5 piden una decision por fila y no
    aplican nada sin ella; n2 no escribe nunca; h42 solo escribe lo que esta en --numeros.
  - Antes de escribir guarda un respaldo JSON con las filas tal como estaban:
    backend/scripts/respaldos/<paso>-<base>-<fecha>.json (carpeta ignorada por git: trae datos).
  - Un solo commit al final del paso; si algo falla, rollback del paso completo. Excepciones que el codigo
    reutilizado hace commit por su cuenta: h46 (un commit por cotizacion, dentro de
    _reabrir_cotizacion_por_pven_cancelado) y h7 (un solo commit, dentro de corregir()).
  - Excluye SIEMPRE los documentos reales del usuario (NUMEROS_REALES) y todo lo encadenado a ellos: la SC, la COT
    y el PVEN de la cadena, sus PXP y pagos, y los ActivityLog cuya entidad sea alguno de ellos.
"""
import argparse
import datetime
import json
import os
import re
import sys
import textwrap
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Optional

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from sqlalchemy import text

import app.models  # noqa: F401  (registra todos los modelos antes de la primera consulta ORM)
from app.core.textos_actividad import (
    ACCIONES_DEL_SISTEMA, ENTIDADES_CORREGIBLES, corregir_descripcion_historica, etiqueta_estado,
)
from app.core.ventas_dinero import (
    METODO_PAGO_SIN_VERIFICAR, anticipo_cotizacion, anular_pxps_de_pedido, metodo_pago_anticipo, pesos,
    redondear_peso,
)

# Documentos reales del usuario: NUNCA se tocan (ni lo que esta encadenado a ellos).
NUMEROS_REALES = ("SC-20260731", "COT-20260449", "PVEN-20262799", "SC-20260746")

PASOS = ("n1", "h44", "h45", "h46", "h36", "n4", "n2", "n5", "n10", "h7", "u9", "h42")
PASOS_QUE_ESCRIBEN = tuple(p for p in PASOS if p != "n2")

AUTOR = "Corrección de datos (Bloque 1)"
CARPETA_RESPALDOS = Path(_BACKEND_DIR) / "scripts" / "respaldos"
MAX_FILAS_EN_TEXTO = 150      # por seccion al imprimir (los datos completos siguen en Seccion.filas)

ESTADOS_SC = ("BORRADOR", "ASIGNADA", "PENDIENTE_CONFIRMACION", "COTIZADA", "EN_ESPERA_CONFIRMACION", "CONFIRMADA",
              "RECHAZADA", "VENCIDA", "CANCELADA", "N/A_SOPORTE")
ESTADOS_COT = ("BORRADOR", "ENVIADA", "PENDIENTE_CONFIRMACION", "CONFIRMADA", "RECHAZADA", "VENCIDA")
ESTADOS_COT_ABIERTAS = ("BORRADOR", "ENVIADA", "PENDIENTE_CONFIRMACION", "CONFIRMADA")

# Lo que cada paso necesita del esquema. Si falta una tabla o columna, el paso dice "No aplica" y sigue.
REQUISITOS = {
    "n1": {"sale_order_payments": ["id", "sale_order_id", "metodo_pago", "estado", "monto", "usuario", "created_at",
                                   "referencia_bancaria", "notes"],
           "sale_orders": ["id", "numero", "estado", "total_cop", "anticipo_cop", "saldo_cop"]},
    "h44": {"payment_pendings": ["id", "numero", "ven_id", "estado", "monto_total", "monto_anticipo",
                                  "monto_pendiente"],
            "sale_orders": ["id", "numero", "estado", "total_cop", "anticipo_cop", "saldo_cop"]},
    "h45": {"payment_pendings": ["id", "numero", "ven_id", "estado", "monto_pendiente", "notas", "updated_at"],
            "sale_orders": ["id", "numero", "estado", "pxp_id", "pxp_numero"]},
    "h46": {"sales_quotations": ["id", "numero", "estado", "total_cop", "gate2_confirmed_at"],
            "sale_orders": ["id", "numero", "estado", "cot_id"]},
    "h36": {"sales_quotations": ["id", "numero", "estado", "total_cop", "anticipo_cop", "sc_id",
                                  "anticipo_pct_manual"],
            "customer_requests": ["id", "numero", "modalidad_pago"],
            "sale_orders": ["id", "cot_id", "estado"]},
    "n4": {"customer_requests": ["id", "numero", "estado", "eliminada_at", "razon_cancelacion", "tipo_solicitud"],
           "sales_quotations": ["id", "numero", "sc_id", "estado"],
           "sale_orders": ["id", "numero", "sc_id", "estado"]},
    "n2": {"sale_orders": ["id", "numero", "estado", "cancelled_at", "cancellation_reason", "total_cop"],
           "inventory_operations": ["source_document_type", "source_document_id"]},
    "n5": {"customer_requests": ["id", "numero", "estado", "advisor_user_id"],
           "sales_quotations": ["id", "numero", "sc_id", "estado"],
           "sale_orders": ["id", "numero", "sc_id", "cot_id", "estado"]},
    "n10": {"activity_logs": ["id", "entity_type", "entity_id", "entity_numero", "action", "created_at"],
            "sale_order_lines_erp": ["id", "so_id"],
            "sale_orders": ["id", "numero"]},
    "h7": {"activity_logs": ["id", "entity_type", "entity_id", "action", "description"]},
    "u9": {"sales_orders": ["id", "status", "lead_source", "lead_description", "canonical_customer_request_id",
                             "canonical_sale_order_id", "created_at"],
           "customer_requests": ["id", "numero"]},
    "h42": {"sale_orders": ["id", "numero", "estado", "total_cop", "subtotal_cop", "anticipo_cop", "saldo_cop"],
            "sales_quotations": ["id", "numero", "estado", "total_cop", "subtotal_cop", "anticipo_cop"],
            "sale_order_payments": ["sale_order_id"]},
}

INFO = {
    "n1": dict(
        titulo="Anticipos registrados sin verificar (pago CONVERSION_COTIZACION)",
        que_es="Pedidos de venta creados antes del arreglo N1 con un pago de anticipo automático "
               "(método CONVERSION_COTIZACION) que nadie verificó: descuenta el saldo, aparece como 'Anticipo "
               "Cobrado' y quita la alerta de cobro.",
        que_haria="Solo para los pedidos que el usuario decida en --decisiones <archivo.json>: (a) deja el pago y le "
                  "completa el método y la referencia reales; (b) anula el pago (estado ANULADO), recalcula "
                  "anticipo y saldo con el libro de pagos y deja un renglón en la Actividad del pedido. Sin "
                  "decisiones no escribe.",
        decision="Por cada pedido: (a) el cliente SÍ pagó (indicar método y referencia reales) o (b) no pagó / no "
                 "se sabe."),
    "h44": dict(
        titulo="Órdenes de pago (PXP) con los montos invertidos",
        que_es="PXP creadas con el botón viejo: 'ya pagado' y 'pendiente' salieron al revés (el anticipo de la PXP "
               "es el saldo del pedido y su pendiente es lo que ya se había pagado).",
        que_haria="Por cada PXP aprobada (--ids/--numeros): recalcula monto_total, monto_anticipo (lo ya pagado) y "
                  "monto_pendiente (el saldo) desde el pedido, en pesos enteros, y deja un renglón 'Montos "
                  "corregidos (estaban invertidos)' en la Actividad de la PXP.",
        decision="Aprobar la lista (o indicar qué PXP sí). Si N1 (b) cambia el saldo de algún pedido, volver a "
                 "correr este listado después de aplicar N1."),
    "h45": dict(
        titulo="Órdenes de pago pendientes de pedidos ya cancelados",
        que_es="PXP en estado PENDIENTE cuyo pedido está CANCELADO: siguen contando como pendientes.",
        que_haria="Cancela esas PXP (estado CANCELADA, con nota) con la misma regla de cancelar un pedido "
                  "(anular_pxps_de_pedido): un renglón en la Actividad de la PXP y otro en la del pedido, y limpia "
                  "el vínculo del pedido. Las PXP pagadas no se tocan.",
        decision="Aprobar la lista completa (la decisión ya la dio el usuario: sí cancelarlas) o excluir alguna."),
    "h46": dict(
        titulo="Cotizaciones confirmadas cuyos pedidos están todos cancelados",
        que_es="COT en estado CONFIRMADA con al menos un pedido, todos CANCELADO: no se pueden reajustar ni crear "
               "otro pedido hasta reabrirlas.",
        que_haria="Por cada COT aprobada llama a _reabrir_cotizacion_por_pven_cancelado (la misma regla de cancelar "
                  "el pedido): la COT vuelve a Borrador, se limpia la confirmación (gate 2) y el enlace pendiente, "
                  "la solicitud pasa a Cotizada y el lead a Cotización; deja el renglón en la Actividad de la COT. "
                  "Es idempotente.",
        decision="Aprobar la lista o indicar cuáles reabrir."),
    "h36": dict(
        titulo="Anticipo desactualizado en cotizaciones abiertas",
        que_es="COT abiertas (Borrador, Enviada, Pendiente de confirmación o Confirmada) con solicitud y sin "
               "pedido vigente cuyo anticipo guardado no coincide con la modalidad de pago (60/40 = 60%, Contado = "
               "100%, Crédito = 0%, otra = 60%; o el % manual de R3).",
        que_haria="Recalcula anticipo_cop con anticipo_cotizacion (el mismo cálculo de la pantalla y de la "
                  "conversión) y deja un renglón 'Anticipo recalculado' en la Actividad de la COT. No toca el "
                  "estado ni invalida la confirmación del cliente.",
        decision="Aprobar la lista o indicar cuáles."),
    "n4": dict(
        titulo="Solicitudes canceladas: documentos activos, papelera y estados sin pasar por /cancelar",
        que_es="(a) SC CANCELADA que aún tiene COT o pedidos activos; (b) SC en la papelera (eliminada_at) que no "
               "está cancelada, que la sincronización revivió; (c) SC canceladas con la pastilla vieja: sin "
               "eliminada_at ni motivo (Soporte Técnico no cuenta).",
        que_haria="Solo el grupo (c): pone eliminada_at = ahora (UTC, para que no queden purgables de inmediato) y, "
                  "si falta, razon_cancelacion = 'Cancelada con el cambio de estado manual (sin motivo "
                  "registrado)'. (a) y (b) NO se escriben: se deciden caso por caso.",
        decision="(a) por solicitud: restaurarla, o rechazar la COT / cancelar el pedido. (b) por solicitud: qué "
                 "estado le corresponde. (c) aprobar la lista."),
    "n2": dict(
        titulo="Pedidos con estado raro (solo informativo)",
        que_es="(a) Pedidos que ya descontaron inventario pero no están Entregado/Facturado; (b) pedidos "
               "cancelados y luego reabiertos; (c) cancelaciones viejas sin motivo.",
        que_haria="Nada: este paso no escribe. Los tres casos se deciden uno por uno y cualquier cambio de estado "
                  "se hace aparte, con el OK explícito del usuario.",
        decision="(a) por pedido: marcarlo Entregado desde Entregas (sin doble descuento) u otro estado. (b) por "
                 "pedido: volver a cancelarlo o dejarlo. (c) solo informativo."),
    "n5": dict(
        titulo="Solicitudes y cotizaciones con un estado que no les corresponde",
        que_es="(a) SC con un estado ajeno (p. ej. de pedido); (b) COT con un estado ajeno; (c) COT que no están "
               "Confirmada pero tienen un pedido vigente.",
        que_haria="Con --numeros aplica SOLO a esos documentos la corrección sugerida: (a) el estado derivado de "
                  "su COT con _MAPA_ESTADO_COTIZACION_A_SOLICITUD, o ASIGNADA/BORRADOR si no tiene COT; (b) y (c) "
                  "COT en CONFIRMADA si tiene un pedido vigente o BORRADOR si no. Deja un renglón de estado en la "
                  "Actividad. No toca la SC ni el lead de una COT corregida.",
        decision="Por documento: aceptar la corrección sugerida (poner su número en --numeros) o dejarlo."),
    "n10": dict(
        titulo="Logs 'mercancía disponible' guardados con el id de la línea",
        que_es="Renglones de Actividad MERCANCIA_DISPONIBLE con entity_type 'PVEN' y entity_id = id de la LÍNEA del "
               "pedido (no del pedido): la lectura de 'PVEN' podría pegarlos a otro pedido.",
        que_haria="Los pasa a entity_type 'VEN' con el id y el número del pedido de la línea. Los que no "
                  "corresponden a ninguna línea no se tocan.",
        decision="Aprobar (la decisión ya la dio el usuario, en el mismo despliegue que el arreglo de lectura)."),
    "h7": dict(
        titulo="Textos viejos de la Actividad (tildes y estados legibles)",
        que_es="Actividades guardadas antes de H7+H41 con 'Cotizacion', 'Lineas' o códigos de estado "
               "('Estado cambiado a ASIGNADA').",
        que_haria="Corre corregir_textos_actividad.corregir (la misma regla de T12, con su tabla de respaldo "
                  "activity_logs_respaldo_textos) y además guarda el respaldo JSON de las filas candidatas. Nunca "
                  "toca notas, chatter ni motivos escritos por personas.",
        decision="Aprobar; el listado muestra el conteo por tipo y ejemplos."),
    "u9": dict(
        titulo="Leads del CRM sin el número de la solicitud",
        que_es="Leads creados por una solicitud cuya descripción quedó 'SC creada:  - …' (sin el número).",
        que_haria="Completa la descripción con el número de la solicitud ('SC creada: SC-… - …'), con respaldo "
                  "previo. No imprime el texto del lead.",
        decision="Aprobar (la decisión ya la dio el usuario: sí, con respaldo)."),
    "h42": dict(
        titulo="Montos con centavos en pedidos y cotizaciones",
        que_es="Pedidos y cotizaciones con total_cop o saldo_cop con decimales (p. ej. $2.786.923,08). Se marca "
               "cuáles tienen pagos registrados.",
        que_haria="SOLO para los documentos SIN pagos y que estén en --numeros: redondea al peso (ROUND_HALF_UP) "
                  "total, subtotal, anticipo y saldo (en la COT, total, subtotal y anticipo) y deja un renglón en "
                  "la Actividad. No toca las líneas ni el JSON de productos. Los documentos con pagos no se "
                  "tocan nunca.",
        decision="Por documento sin pagos: redondear (lista en --numeros) o dejarlo. El diseño no lo "
                 "recomienda; el usuario pidió hacerlo en documentos sin pagos (R1)."),
}


class ErrorCorreccion(Exception):
    """El paso se aborta SIN escribir nada (base equivocada, decisiones invalidas, argumentos incompletos)."""


# ─── estructuras ──────────────────────────────────────────────────────────────────────────────────────────────

@dataclass
class Seccion:
    clave: str
    titulo: str
    columnas: list                      # [(clave_en_la_fila, encabezado), ...]
    filas: list = field(default_factory=list)   # dicts COMPLETOS (el texto trunca; los datos no)
    nota: str = ""
    compacta: bool = False                      # se imprime como una lista de numeros, no como tabla

    @property
    def total(self):
        return len(self.filas)


@dataclass
class Listado:
    paso: str
    titulo: str = ""
    que_es: str = ""
    que_haria: str = ""
    decision: str = ""
    secciones: list = field(default_factory=list)
    excluidos: list = field(default_factory=list)    # textos de lo que coincidia con el paso y es documento real
    notas: list = field(default_factory=list)
    datos: dict = field(default_factory=dict)
    no_aplica: Optional[str] = None
    error: Optional[str] = None

    def seccion(self, clave):
        for s in self.secciones:
            if s.clave == clave:
                return s
        raise KeyError(clave)

    @property
    def conteo(self):
        """Filas que cambiaria el paso. h7 trae el total real en datos['candidatas'] (sus secciones son un resumen)."""
        if "candidatas" in self.datos:
            return self.datos["candidatas"]
        return sum(s.total for s in self.secciones)


@dataclass
class ResultadoAplicar:
    paso: str
    cambiados: int = 0
    detalle: list = field(default_factory=list)
    respaldo: Optional[str] = None

    @property
    def escribio(self):
        return self.cambiados > 0


@dataclass
class Excluidos:
    sc: set = field(default_factory=set)
    cot: set = field(default_factory=set)
    pven: set = field(default_factory=set)
    pxp: set = field(default_factory=set)
    pagos: set = field(default_factory=set)
    etiquetas: list = field(default_factory=list)


@dataclass
class Contexto:
    db: object
    base: str
    carpeta: Path
    excl: Excluidos
    numeros_reales: tuple
    ids: Optional[list] = None
    numeros: Optional[list] = None
    decisiones: Optional[dict] = None
    tabla_respaldo: Optional[str] = None
    ahora: datetime.datetime = field(default_factory=datetime.datetime.utcnow)


# ─── formato ──────────────────────────────────────────────────────────────────────────────────────────────────

def monto_exacto(valor) -> str:
    """'$2.786.923,08' o '$1.724.400' (con los centavos solo si los hay). Formato es-CO."""
    if valor is None:
        return "-"
    d = Decimal(str(valor))
    s = f"{abs(d):,.2f}".replace(",", "§").replace(".", ",").replace("§", ".")
    if s.endswith(",00"):
        s = s[:-3]
    return ("-" if d < 0 else "") + "$" + s


def _celda(v) -> str:
    if v is None:
        return "-"
    if isinstance(v, bool):
        return "Sí" if v else "No"
    if isinstance(v, Decimal):
        return monto_exacto(v)
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d %H:%M")
    if isinstance(v, datetime.date):
        return v.isoformat()
    s = str(v).replace("\n", " ")
    return s if len(s) <= 70 else s[:67] + "..."


def _tabla(columnas, filas) -> list:
    celdas = [[_celda(f.get(k)) for k, _ in columnas] for f in filas]
    anchos = [max(len(h), *(len(r[i]) for r in celdas)) if celdas else len(h) for i, (_, h) in enumerate(columnas)]
    linea = lambda vals: "  " + " | ".join(v.ljust(anchos[i]) for i, v in enumerate(vals)).rstrip()
    return [linea([h for _, h in columnas]), "  " + "-+-".join("-" * a for a in anchos)] + [linea(r) for r in celdas]


def texto_listado(l: Listado, indice=None, total=None) -> str:
    """El listado de un paso como texto legible: titulo, que es, que haria --aplicar, tablas, conteo, excluidos."""
    cab = f"Paso {indice} de {total} · " if indice else ""
    out = ["=" * 78, f"{cab}{l.paso}: {l.titulo}", "=" * 78,
           f"Qué es: {l.que_es}", f"Qué haría --aplicar: {l.que_haria}"]
    if l.no_aplica:
        out += ["", f"No aplica: {l.no_aplica}", ""]
        return "\n".join(out)
    if l.error:
        out += ["", f"ERROR al listar este paso (el resto sigue): {l.error}", ""]
        return "\n".join(out)
    for s in l.secciones:
        out += ["", f"{s.titulo}  [{s.total}]"]
        if s.nota:
            out.append(f"  ({s.nota})")
        if not s.filas:
            out.append("  (ninguna)")
            continue
        if s.compacta:
            out += textwrap.wrap(", ".join(str(f["numero"]) for f in s.filas), width=100,
                                 initial_indent="  ", subsequent_indent="  ")
            continue
        out += _tabla(s.columnas, s.filas[:MAX_FILAS_EN_TEXTO])
        if s.total > MAX_FILAS_EN_TEXTO:
            out.append(f"  ... y {s.total - MAX_FILAS_EN_TEXTO} más (se muestran {MAX_FILAS_EN_TEXTO} de {s.total})")
    if len(l.secciones) > 1 and "candidatas" not in l.datos:
        partes = ", ".join(f"{s.clave}: {s.total}" for s in l.secciones)
        out += ["", f"Conteo: {l.conteo} ({partes})"]
    else:
        out += ["", f"Conteo: {l.conteo}"]
    if l.excluidos:
        out += ["", f"Excluidos (documentos reales): {len(l.excluidos)}"] + [f"  - {x}" for x in l.excluidos]
    else:
        out += ["", "Excluidos (documentos reales): ninguno de los documentos reales ni de sus encadenados cae "
                    "en este paso."]
    if l.notas:
        out += [""] + [f"Nota: {n}" for n in l.notas]
    if l.decision:
        out += ["", f"Decisión del usuario: {l.decision}"]
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
            detalle = "" if "candidatas" in l.datos else " (" + ", ".join(f"{s.clave}: {s.total}" for s in l.secciones) + ")"
            estado = f"{l.conteo} fila(s){detalle}; excluidos reales que coincidían: {len(l.excluidos)}"
        out.append(f"  {l.paso:<4} {l.titulo}\n       {estado}")
    return "\n".join(out) + "\n"


# ─── base de datos: solo lectura, esquema, filas ──────────────────────────────────────────────────────────────

def iniciar_solo_lectura(db) -> None:
    """Primera sentencia de la transaccion de un listado: la base rechaza cualquier escritura que haya despues."""
    db.execute(text("SET TRANSACTION READ ONLY"))


def base_actual(db) -> str:
    return db.execute(text("SELECT current_database()")).scalar()


def _filas(db, sql, **params) -> list:
    return [dict(r) for r in db.execute(text(sql), params).mappings().all()]


def _ids(db, sql, valores) -> set:
    if not valores:
        return set()
    return {r[0] for r in db.execute(text(sql), {"i": sorted(valores)}) if r[0] is not None}


def _faltantes(db, paso) -> Optional[str]:
    """Motivo de 'No aplica' si a la base le falta una tabla o columna que el paso necesita; None si esta completo."""
    requisitos = REQUISITOS[paso]
    filas = db.execute(
        text("SELECT table_name, column_name FROM information_schema.columns "
             "WHERE table_schema = current_schema() AND table_name = ANY(:t)"),
        {"t": sorted(requisitos)}).all()
    existentes = {}
    for tabla, columna in filas:
        existentes.setdefault(tabla, set()).add(columna)
    faltas = []
    for tabla, columnas in requisitos.items():
        if tabla not in existentes:
            faltas.append(f"falta la tabla {tabla}")
            continue
        faltas += [f"falta la columna {tabla}.{c}" for c in columnas if c not in existentes[tabla]]
    return "; ".join(faltas) if faltas else None


# ─── documentos reales y su cadena ────────────────────────────────────────────────────────────────────────────

def calcular_excluidos(db, numeros=NUMEROS_REALES) -> Excluidos:
    """Los documentos reales y TODO lo encadenado a ellos, hasta que la cadena deja de crecer:
    de una SC sus COT y PVEN; de una COT su SC y sus PVEN; de un PVEN su SC, su COT, sus PXP y sus pagos."""
    numeros = list(numeros)
    ex = Excluidos()
    ex.sc = _ids(db, "SELECT id FROM customer_requests WHERE numero = ANY(:i)", set(numeros))
    ex.cot = _ids(db, "SELECT id FROM sales_quotations WHERE numero = ANY(:i)", set(numeros))
    ex.pven = _ids(db, "SELECT id FROM sale_orders WHERE numero = ANY(:i)", set(numeros))
    while True:
        antes = (len(ex.sc), len(ex.cot), len(ex.pven), len(ex.pxp), len(ex.pagos))
        ex.cot |= _ids(db, "SELECT id FROM sales_quotations WHERE sc_id = ANY(:i)", ex.sc)
        ex.pven |= _ids(db, "SELECT id FROM sale_orders WHERE sc_id = ANY(:i)", ex.sc)
        ex.sc |= _ids(db, "SELECT sc_id FROM sales_quotations WHERE id = ANY(:i)", ex.cot)
        ex.pven |= _ids(db, "SELECT id FROM sale_orders WHERE cot_id = ANY(:i)", ex.cot)
        ex.sc |= _ids(db, "SELECT sc_id FROM sale_orders WHERE id = ANY(:i)", ex.pven)
        ex.cot |= _ids(db, "SELECT cot_id FROM sale_orders WHERE id = ANY(:i)", ex.pven)
        ex.pxp |= _ids(db, "SELECT id FROM payment_pendings WHERE ven_id = ANY(:i)", ex.pven)
        ex.pxp |= _ids(db, "SELECT pxp_id FROM sale_orders WHERE id = ANY(:i)", ex.pven)
        ex.pagos |= _ids(db, "SELECT id FROM sale_order_payments WHERE sale_order_id = ANY(:i)", ex.pven)
        if antes == (len(ex.sc), len(ex.cot), len(ex.pven), len(ex.pxp), len(ex.pagos)):
            break
    etiquetas = []
    for tabla, conjunto, nombre in (("customer_requests", ex.sc, "solicitud"), ("sales_quotations", ex.cot, "cotización"),
                                    ("sale_orders", ex.pven, "pedido"), ("payment_pendings", ex.pxp, "orden de pago")):
        if conjunto:
            for (numero,) in db.execute(text(f"SELECT numero FROM {tabla} WHERE id = ANY(:i) ORDER BY id"),
                                        {"i": sorted(conjunto)}):
                etiquetas.append(f"{numero} ({nombre})")
    if ex.pagos:
        for pago_id, numero in db.execute(
                text("SELECT p.id, v.numero FROM sale_order_payments p JOIN sale_orders v ON v.id = p.sale_order_id "
                     "WHERE p.id = ANY(:i) ORDER BY p.id"), {"i": sorted(ex.pagos)}):
            etiquetas.append(f"pago #{pago_id} de {numero}")
    ex.etiquetas = etiquetas
    return ex


def _pasa(fila, ctx) -> bool:
    """La fila pasa el filtro --ids / --numeros (None = sin filtro). 'id' y 'numero' son los de su fila principal."""
    if ctx.ids is not None and fila.get("id") not in set(ctx.ids):
        return False
    if ctx.numeros is not None and fila.get("numero") not in set(ctx.numeros):
        return False
    return True


def _est(entidad, codigo) -> str:
    return etiqueta_estado(entidad, codigo) or "-"


# ─── respaldo JSON ────────────────────────────────────────────────────────────────────────────────────────────

_TABLAS_RESPALDABLES = {"sale_order_payments", "sale_orders", "payment_pendings", "sales_quotations",
                        "customer_requests", "activity_logs", "sales_orders"}


def escribir_respaldo(db, carpeta, paso, base, tablas, ahora=None) -> str:
    """Guarda las filas COMPLETAS tal como estan ahora (antes de escribir) en <paso>-<base>-<fecha>.json.
    tablas: {nombre_de_tabla: [ids]}. Devuelve la ruta."""
    ahora = ahora or datetime.datetime.utcnow()
    contenido = {"paso": paso, "base": base, "generado_utc": ahora.isoformat(), "tablas": {}}
    for tabla, ids in tablas.items():
        if tabla not in _TABLAS_RESPALDABLES:
            raise ErrorCorreccion(f"Tabla no permitida en el respaldo: {tabla}")
        filas = db.execute(text(f"SELECT * FROM {tabla} WHERE id = ANY(:i) ORDER BY id"), {"i": sorted(set(ids))})
        contenido["tablas"][tabla] = [dict(f) for f in filas.mappings().all()]
    carpeta = Path(carpeta)
    carpeta.mkdir(parents=True, exist_ok=True)
    marca = ahora.strftime("%Y%m%d-%H%M%S")
    ruta, n = carpeta / f"{paso}-{base}-{marca}.json", 1
    while ruta.exists():
        n += 1
        ruta = carpeta / f"{paso}-{base}-{marca}-{n}.json"
    ruta.write_text(json.dumps(contenido, default=str, ensure_ascii=False, indent=1), encoding="utf-8")
    return str(ruta)


def _anexar(nota, texto) -> str:
    return f"{nota}\n{texto}" if nota else texto


# ─── helpers de listado ───────────────────────────────────────────────────────────────────────────────────────

def _nuevo(paso, **extra) -> Listado:
    return Listado(paso=paso, **INFO[paso], **extra)


def _marcar_excluidos(l: Listado, excluidas, describir) -> None:
    for f in excluidas:
        l.excluidos.append(describir(f))


# ═══ n1 ═══════════════════════════════════════════════════════════════════════════════════════════════════════

_SQL_N1 = """
SELECT v.id, v.numero, v.estado, v.total_cop, v.anticipo_cop, v.saldo_cop,
       p.id AS pago_id, p.monto, p.usuario, p.created_at
FROM sale_order_payments p JOIN sale_orders v ON v.id = p.sale_order_id
WHERE p.metodo_pago = :metodo AND p.estado = 'CONFIRMADO'
ORDER BY v.id, p.id"""


def _sel_n1(db, excl):
    filas = _filas(db, _SQL_N1, metodo=METODO_PAGO_SIN_VERIFICAR)
    incluidas = [f for f in filas if f["id"] not in excl.pven and f["pago_id"] not in excl.pagos]
    excluidas = [f for f in filas if f["id"] in excl.pven or f["pago_id"] in excl.pagos]
    for f in incluidas:
        f["estado_txt"] = _est("VEN", f["estado"])
    return incluidas, excluidas


def listar_n1(db, excl, **_) -> Listado:
    l = _nuevo("n1")
    incluidas, excluidas = _sel_n1(db, excl)
    l.secciones.append(Seccion(
        "pagos", "Pagos CONVERSION_COTIZACION en estado CONFIRMADO",
        [("numero", "Pedido"), ("estado_txt", "Estado"), ("total_cop", "Total"), ("monto", "Pago sin verificar"),
         ("anticipo_cop", "Anticipo registrado"), ("saldo_cop", "Saldo"), ("usuario", "Registró"),
         ("created_at", "Creado (UTC)")], incluidas))
    _marcar_excluidos(l, excluidas, lambda f: f"{f['numero']} (pago #{f['pago_id']} sin verificar)")
    l.notas.append("Decisiones: archivo JSON con una entrada por pedido, "
                   '{"PVEN-…": {"opcion": "a", "metodo_pago": "Transferencia bancaria", "referencia": "…"}} '
                   'o {"PVEN-…": {"opcion": "b"}}.')
    return l


def _aplicar_n1(ctx) -> ResultadoAplicar:
    from app.models.erp_documents import ActivityLog, SaleOrder
    from app.models.fase4 import SaleOrderPayment
    from app.api.v1.erp_ventas_fase4 import _cabecera_desde_el_libro_de_pagos
    db, res = ctx.db, ResultadoAplicar("n1")
    if not ctx.decisiones:
        res.detalle.append("n1 pide --decisiones <archivo.json> con una entrada por pedido (opcion a o b): no se "
                           "escribió nada.")
        return res
    incluidas, excluidas = _sel_n1(db, ctx.excl)
    numeros_incl = {f["numero"] for f in incluidas}
    numeros_excl = {f["numero"] for f in excluidas}
    por_pven = {}
    for f in incluidas:
        if _pasa(f, ctx):
            por_pven.setdefault(f["numero"], []).append(f)
    plan, errores = {}, []
    for numero, d in ctx.decisiones.items():
        if numero in numeros_excl:
            errores.append(f"{numero}: es un documento real (o está encadenado a uno): no se toca")
            continue
        if numero not in numeros_incl:
            errores.append(f"{numero}: no está en el listado de pagos sin verificar")
            continue
        if numero not in por_pven:
            continue  # fuera del filtro --ids/--numeros: se omite sin error
        if not isinstance(d, dict) or str(d.get("opcion", "")).strip().lower() not in ("a", "b"):
            errores.append(f"{numero}: 'opcion' debe ser 'a' o 'b'")
            continue
        opcion = str(d["opcion"]).strip().lower()
        if opcion == "a":
            metodo = metodo_pago_anticipo(d.get("metodo_pago"))
            referencia = str(d.get("referencia") or "").strip()
            if metodo is None:
                errores.append(f"{numero}: método de pago no válido ({d.get('metodo_pago')!r}); usa uno de "
                               f"Transferencia bancaria, Consignación, Efectivo, Tarjeta, Nequi, Daviplata, PSE, Otro")
                continue
            if len(referencia) < 3:
                errores.append(f"{numero}: la referencia debe tener al menos 3 caracteres")
                continue
            plan[numero] = ("a", metodo, referencia)
        else:
            plan[numero] = ("b", None, None)
    if errores:
        raise ErrorCorreccion("Decisiones no válidas, no se escribió nada: " + "; ".join(errores))
    if not plan:
        res.detalle.append("Ninguna decisión corresponde a un pedido del listado: no se escribió nada.")
        return res
    sin_decision = sorted(set(por_pven) - set(plan))
    pago_ids = [f["pago_id"] for n in plan for f in por_pven[n]]
    ven_ids = [por_pven[n][0]["id"] for n in plan]
    res.respaldo = escribir_respaldo(db, ctx.carpeta, "n1", ctx.base,
                                     {"sale_order_payments": pago_ids, "sale_orders": ven_ids}, ctx.ahora)
    for numero, (opcion, metodo, referencia) in plan.items():
        filas = por_pven[numero]
        so = db.query(SaleOrder).filter(SaleOrder.id == filas[0]["id"]).with_for_update().first()
        pagos = (db.query(SaleOrderPayment).filter(SaleOrderPayment.id.in_([f["pago_id"] for f in filas]))
                 .order_by(SaleOrderPayment.id.asc()).all())
        monto = sum((p.monto for p in pagos), Decimal("0"))
        for p in pagos:
            if opcion == "a":
                p.metodo_pago, p.referencia_bancaria = metodo, referencia
                p.notes = _anexar(p.notes, "Método y referencia completados por la corrección de datos del Bloque 1 "
                                           "(el pago automático de la conversión no los traía).")
            else:
                p.estado = "ANULADO"
                p.notes = _anexar(p.notes, "Anulado por la corrección de datos del Bloque 1: el pago automático de "
                                           "la conversión no lo verificó nadie.")
        db.flush()
        if opcion == "a":
            db.add(ActivityLog(
                entity_type="VEN", entity_id=so.id, entity_numero=so.numero, action="ANTICIPO_VERIFICADO",
                description=f"Anticipo de {pesos(monto)} confirmado con la corrección de datos: {metodo}, ref. "
                            f"{referencia}",
                user_name=AUTOR, extra_data={"metodo_pago": metodo, "referencia": referencia, "monto": str(monto)}))
        else:
            _cabecera_desde_el_libro_de_pagos(so, db)
            so.updated_at = ctx.ahora
            db.add(ActivityLog(
                entity_type="VEN", entity_id=so.id, entity_numero=so.numero, action="ANTICIPO_ANULADO",
                description=f"Pago automático de {pesos(monto)} anulado: nadie verificó que el cliente pagara. "
                            f"Pagado verificado: {pesos(so.total_cop - so.saldo_cop)}; saldo: {pesos(so.saldo_cop)}",
                user_name=AUTOR, extra_data={"monto_anulado": str(monto)}))
        res.cambiados += 1
        res.detalle.append(f"{numero}: opción {opcion} aplicada ({pesos(monto)})")
    if sin_decision:
        res.detalle.append("Sin decisión (no se tocan): " + ", ".join(sin_decision))
    return res


# ═══ h44 ══════════════════════════════════════════════════════════════════════════════════════════════════════

_SQL_H44 = """
SELECT p.id, p.numero, v.id AS ven_id, v.numero AS pven, v.estado AS estado_pven, p.estado AS estado_pxp,
       p.monto_total, p.monto_anticipo, p.monto_pendiente, v.total_cop, v.anticipo_cop, v.saldo_cop
FROM payment_pendings p JOIN sale_orders v ON v.id = p.ven_id
WHERE p.monto_anticipo = v.saldo_cop AND p.monto_pendiente = (v.total_cop - v.saldo_cop)
  AND p.monto_anticipo <> p.monto_pendiente
ORDER BY p.id"""


def _montos_correctos_pxp(f):
    total = redondear_peso(f["total_cop"])
    pendiente = redondear_peso(f["saldo_cop"])
    return total, total - pendiente, pendiente


def _sel_h44(db, excl):
    filas = _filas(db, _SQL_H44)
    incluidas = [f for f in filas if f["id"] not in excl.pxp and f["ven_id"] not in excl.pven]
    excluidas = [f for f in filas if f["id"] in excl.pxp or f["ven_id"] in excl.pven]
    for f in incluidas:
        _, f["anticipo_ok"], f["pendiente_ok"] = _montos_correctos_pxp(f)
        f["estado_txt"] = _est("PXP", f["estado_pxp"])
    return incluidas, excluidas


def listar_h44(db, excl, **_) -> Listado:
    l = _nuevo("h44")
    incluidas, excluidas = _sel_h44(db, excl)
    l.secciones.append(Seccion(
        "invertidas", "PXP con anticipo = saldo del pedido y pendiente = lo ya pagado",
        [("numero", "PXP"), ("pven", "Pedido"), ("estado_txt", "Estado PXP"), ("monto_total", "Total"),
         ("monto_anticipo", "Anticipo (hoy)"), ("monto_pendiente", "Pendiente (hoy)"),
         ("anticipo_ok", "Anticipo (queda)"), ("pendiente_ok", "Pendiente (queda)")], incluidas))
    _marcar_excluidos(l, excluidas, lambda f: f"{f['numero']} (pedido {f['pven']})")
    l.notas.append("Los montos que quedan salen del pedido de HOY (total, total - saldo, saldo): si N1 (b) cambia "
                   "el saldo de un pedido, vuelve a correr este listado después de aplicar N1.")
    l.notas.append("Los renglones viejos de Actividad con '$1,724,400' y sin autor no se corrigen aquí (no se sabe "
                   "quién los creó); el texto de los montos lo cubre el paso h7 solo en lo que ya sabe corregir.")
    return l


def _aplicar_h44(ctx) -> ResultadoAplicar:
    from app.models.erp_documents import ActivityLog, PaymentPending, SaleOrder
    db, res = ctx.db, ResultadoAplicar("h44")
    incluidas, _ = _sel_h44(db, ctx.excl)
    elegidas = [f for f in incluidas if _pasa(f, ctx)]
    if not elegidas:
        res.detalle.append("Ninguna PXP invertida coincide con --ids/--numeros: no se escribió nada.")
        return res
    res.respaldo = escribir_respaldo(db, ctx.carpeta, "h44", ctx.base,
                                     {"payment_pendings": [f["id"] for f in elegidas]}, ctx.ahora)
    for f in elegidas:
        p = db.query(PaymentPending).filter(PaymentPending.id == f["id"]).with_for_update().first()
        so = db.query(SaleOrder).filter(SaleOrder.id == f["ven_id"]).first()
        p.monto_total, p.monto_anticipo, p.monto_pendiente = _montos_correctos_pxp(
            {"total_cop": so.total_cop, "saldo_cop": so.saldo_cop})
        p.updated_at = ctx.ahora
        db.add(ActivityLog(entity_type="PXP", entity_id=p.id, entity_numero=p.numero, action="UPDATED",
                           description="Montos corregidos (estaban invertidos)", user_name=AUTOR))
        res.cambiados += 1
        res.detalle.append(f"{p.numero}: anticipo {pesos(p.monto_anticipo)}, pendiente {pesos(p.monto_pendiente)}")
    return res


# ═══ h45 ══════════════════════════════════════════════════════════════════════════════════════════════════════

_SQL_H45 = """
SELECT p.id, p.numero, v.id AS ven_id, v.numero AS pven, v.estado AS estado_pven, p.monto_pendiente
FROM payment_pendings p JOIN sale_orders v ON v.id = p.ven_id
WHERE v.estado = 'CANCELADO' AND p.estado = 'PENDIENTE'
ORDER BY p.id"""


def _sel_h45(db, excl):
    filas = _filas(db, _SQL_H45)
    incluidas = [f for f in filas if f["id"] not in excl.pxp and f["ven_id"] not in excl.pven]
    excluidas = [f for f in filas if f["id"] in excl.pxp or f["ven_id"] in excl.pven]
    for f in incluidas:
        f["estado_txt"] = _est("VEN", f["estado_pven"])
    return incluidas, excluidas


def listar_h45(db, excl, **_) -> Listado:
    l = _nuevo("h45")
    incluidas, excluidas = _sel_h45(db, excl)
    l.secciones.append(Seccion(
        "pendientes", "PXP PENDIENTE de pedidos CANCELADO",
        [("numero", "PXP"), ("pven", "Pedido"), ("estado_txt", "Estado pedido"), ("monto_pendiente", "Pendiente")],
        incluidas))
    _marcar_excluidos(l, excluidas, lambda f: f"{f['numero']} (pedido {f['pven']})")
    return l


def _aplicar_h45(ctx) -> ResultadoAplicar:
    from app.models.erp_documents import PaymentPending, SaleOrder
    db, res = ctx.db, ResultadoAplicar("h45")
    incluidas, _ = _sel_h45(db, ctx.excl)
    elegidas = [f for f in incluidas if _pasa(f, ctx)]
    if not elegidas:
        res.detalle.append("Ninguna PXP pendiente coincide con --ids/--numeros: no se escribió nada.")
        return res
    por_ven = {}
    for f in elegidas:
        por_ven.setdefault(f["ven_id"], []).append(f)
    # anular_pxps_de_pedido cancela TODAS las PXP pendientes del pedido: si hay otra que el usuario no aprobó, ese
    # pedido se salta (no se cancela a medias).
    for ven_id, filas in list(por_ven.items()):
        pendientes = {r[0] for r in db.execute(
            text("SELECT id FROM payment_pendings WHERE ven_id = :v AND estado = 'PENDIENTE'"), {"v": ven_id})}
        if pendientes - {f["id"] for f in filas}:
            res.detalle.append(f"{filas[0]['pven']}: tiene otra PXP pendiente que no está en --ids/--numeros; se "
                               f"salta (se cancelan todas las pendientes del pedido o ninguna)")
            del por_ven[ven_id]
    if not por_ven:
        return res
    ven_ids = list(por_ven)
    pxp_ids = [f["id"] for filas in por_ven.values() for f in filas]
    res.respaldo = escribir_respaldo(db, ctx.carpeta, "h45", ctx.base,
                                     {"payment_pendings": pxp_ids, "sale_orders": ven_ids}, ctx.ahora)
    for ven_id in ven_ids:
        so = db.query(SaleOrder).filter(SaleOrder.id == ven_id).first()
        canceladas = anular_pxps_de_pedido(db, so, AUTOR, "el pedido ya estaba cancelado")
        res.cambiados += len(canceladas)
        res.detalle += [f"{p.numero}: cancelada (pedido {so.numero})" for p in canceladas]
    return res


# ═══ h46 ══════════════════════════════════════════════════════════════════════════════════════════════════════

_SQL_H46 = """
SELECT q.id, q.numero, q.estado, q.total_cop, q.gate2_confirmed_at,
       (SELECT string_agg(s.numero, ', ' ORDER BY s.id) FROM sale_orders s WHERE s.cot_id = q.id) AS pedidos
FROM sales_quotations q
WHERE q.estado = 'CONFIRMADA'
  AND EXISTS (SELECT 1 FROM sale_orders s WHERE s.cot_id = q.id)
  AND NOT EXISTS (SELECT 1 FROM sale_orders s WHERE s.cot_id = q.id AND s.estado <> 'CANCELADO')
ORDER BY q.id"""


def _sel_h46(db, excl):
    filas = _filas(db, _SQL_H46)
    incluidas = [f for f in filas if f["id"] not in excl.cot]
    excluidas = [f for f in filas if f["id"] in excl.cot]
    for f in incluidas:
        f["estado_txt"] = _est("COT", f["estado"])
    return incluidas, excluidas


def listar_h46(db, excl, **_) -> Listado:
    l = _nuevo("h46")
    incluidas, excluidas = _sel_h46(db, excl)
    l.secciones.append(Seccion(
        "cotizaciones", "COT CONFIRMADA con todos sus pedidos CANCELADO",
        [("numero", "Cotización"), ("estado_txt", "Estado"), ("total_cop", "Total"), ("pedidos", "Pedidos (cancelados)"),
         ("gate2_confirmed_at", "Confirmación (gate 2)")], incluidas))
    _marcar_excluidos(l, excluidas, lambda f: f"{f['numero']} (pedidos {f['pedidos']})")
    l.notas.append("Reabrir revoca el enlace de confirmación pendiente (no se puede restaurar desde el respaldo).")
    return l


def _aplicar_h46(ctx) -> ResultadoAplicar:
    from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation
    from app.api.v1.erp_ventas import _reabrir_cotizacion_por_pven_cancelado
    db, res = ctx.db, ResultadoAplicar("h46")
    incluidas, _ = _sel_h46(db, ctx.excl)
    elegidas = [f for f in incluidas if _pasa(f, ctx)]
    if not elegidas:
        res.detalle.append("Ninguna cotización coincide con --ids/--numeros: no se escribió nada.")
        return res
    cot_ids = [f["id"] for f in elegidas]
    sc_ids = [r[0] for r in db.execute(text("SELECT sc_id FROM sales_quotations WHERE id = ANY(:i) AND sc_id IS NOT NULL"),
                                       {"i": cot_ids})]
    res.respaldo = escribir_respaldo(db, ctx.carpeta, "h46", ctx.base,
                                     {"sales_quotations": cot_ids, "customer_requests": sc_ids}, ctx.ahora)
    for f in elegidas:
        so = (db.query(SaleOrder).filter(SaleOrder.cot_id == f["id"]).order_by(SaleOrder.id.desc()).first())
        # El helper hace su propio commit y traga sus errores: se verifica el resultado, no la excepcion.
        _reabrir_cotizacion_por_pven_cancelado(db, so, AUTOR)
        cot = db.query(SalesQuotation).filter(SalesQuotation.id == f["id"]).populate_existing().first()
        if cot.estado == "BORRADOR":
            res.cambiados += 1
            res.detalle.append(f"{cot.numero}: reabierta (pedido cancelado {so.numero})")
        else:
            res.detalle.append(f"{cot.numero}: NO se pudo reabrir (sigue {cot.estado}); revisar el log del servidor")
    return res


# ═══ h36 ══════════════════════════════════════════════════════════════════════════════════════════════════════

def _sel_h36(db, excl):
    """(desactualizadas, excluidas, revisadas): COT abiertas con SC y sin pedido vigente."""
    from app.models.erp_documents import CustomerRequest, SaleOrder, SalesQuotation
    vivos = db.query(SaleOrder.id).filter(SaleOrder.cot_id == SalesQuotation.id, SaleOrder.estado != "CANCELADO").exists()
    cots = (db.query(SalesQuotation)
            .join(CustomerRequest, CustomerRequest.id == SalesQuotation.sc_id)
            .filter(SalesQuotation.estado.in_(ESTADOS_COT_ABIERTAS), ~vivos)
            .order_by(SalesQuotation.id.asc()).all())
    desactualizadas, excluidas, revisadas = [], [], 0
    for cot in cots:
        a = anticipo_cotizacion(cot, db)
        actual = Decimal(str(cot.anticipo_cop or 0))
        fila = {"id": cot.id, "numero": cot.numero, "estado_txt": _est("COT", cot.estado), "modalidad": a.modalidad,
                "total_cop": cot.total_cop, "anticipo_cop": actual, "anticipo_nuevo": a.requerido,
                "pct": f"{a.pct.quantize(Decimal('0.01'))}%", "origen": a.origen}
        if cot.id in excl.cot:
            if actual != a.requerido:
                excluidas.append(fila)
            continue
        revisadas += 1
        if actual != a.requerido:
            desactualizadas.append(fila)
    return desactualizadas, excluidas, revisadas


def listar_h36(db, excl, **_) -> Listado:
    l = _nuevo("h36")
    desactualizadas, excluidas, revisadas = _sel_h36(db, excl)
    l.secciones.append(Seccion(
        "desactualizadas", "COT abiertas con el anticipo desactualizado",
        [("numero", "Cotización"), ("estado_txt", "Estado"), ("modalidad", "Modalidad de la SC"), ("total_cop", "Total"),
         ("anticipo_cop", "Anticipo (hoy)"), ("pct", "%"), ("origen", "Origen del %"),
         ("anticipo_nuevo", "Anticipo (queda)")], desactualizadas))
    _marcar_excluidos(l, excluidas, lambda f: f"{f['numero']} (anticipo {monto_exacto(f['anticipo_cop'])} → "
                                              f"{monto_exacto(f['anticipo_nuevo'])})")
    l.notas.append(f"{revisadas} COT abiertas revisadas; {revisadas - len(desactualizadas)} ya tienen el anticipo "
                   f"correcto. Al convertir en pedido el anticipo se recalcula siempre, así que esto solo corrige "
                   f"lo que muestra la pantalla de la COT.")
    return l


def _aplicar_h36(ctx) -> ResultadoAplicar:
    from app.models.erp_documents import ActivityLog, SalesQuotation
    db, res = ctx.db, ResultadoAplicar("h36")
    desactualizadas, _, _ = _sel_h36(db, ctx.excl)
    elegidas = [f for f in desactualizadas if _pasa(f, ctx)]
    if not elegidas:
        res.detalle.append("Ninguna cotización desactualizada coincide con --ids/--numeros: no se escribió nada.")
        return res
    res.respaldo = escribir_respaldo(db, ctx.carpeta, "h36", ctx.base,
                                     {"sales_quotations": [f["id"] for f in elegidas]}, ctx.ahora)
    for f in elegidas:
        cot = db.query(SalesQuotation).filter(SalesQuotation.id == f["id"]).with_for_update().first()
        nuevo = anticipo_cotizacion(cot, db).requerido
        viejo = cot.anticipo_cop
        if Decimal(str(viejo or 0)) == nuevo:
            continue
        cot.anticipo_cop = nuevo
        cot.updated_at = ctx.ahora
        db.add(ActivityLog(
            entity_type="COT", entity_id=cot.id, entity_numero=cot.numero, action="UPDATED",
            description=f"Anticipo recalculado por la corrección de datos ({f['modalidad'] or 'sin solicitud'}): "
                        f"{pesos(viejo)} → {pesos(nuevo)}",
            user_name=AUTOR))
        res.cambiados += 1
        res.detalle.append(f"{cot.numero}: {pesos(viejo)} → {pesos(nuevo)}")
    return res


# ═══ n4 ═══════════════════════════════════════════════════════════════════════════════════════════════════════

_SQL_N4_A = """
SELECT cr.id, cr.numero, cr.estado, cr.eliminada_at FROM customer_requests cr
WHERE cr.estado = 'CANCELADA'
  AND (EXISTS (SELECT 1 FROM sales_quotations q WHERE q.sc_id = cr.id AND q.estado <> 'RECHAZADA')
       OR EXISTS (SELECT 1 FROM sale_orders s WHERE s.sc_id = cr.id AND s.estado <> 'CANCELADO'))
ORDER BY cr.id"""
_SQL_N4_B = """
SELECT id, numero, estado, eliminada_at FROM customer_requests
WHERE eliminada_at IS NOT NULL AND estado <> 'CANCELADA' ORDER BY id"""
_SQL_N4_C = """
SELECT id, numero, estado, (razon_cancelacion IS NOT NULL) AS tiene_motivo FROM customer_requests
WHERE estado = 'CANCELADA' AND eliminada_at IS NULL AND tipo_solicitud IS DISTINCT FROM 'Soporte Tecnico'
ORDER BY id"""
RAZON_SIN_MOTIVO = "Cancelada con el cambio de estado manual (sin motivo registrado)"


def _sel_n4(db, excl):
    a, b, c = _filas(db, _SQL_N4_A), _filas(db, _SQL_N4_B), _filas(db, _SQL_N4_C)
    docs = {}
    if a:
        ids = [f["id"] for f in a]
        for sc_id, numero, estado in db.execute(
                text("SELECT sc_id, numero, estado FROM sales_quotations WHERE sc_id = ANY(:i) AND estado <> 'RECHAZADA' "
                     "ORDER BY id"), {"i": ids}):
            docs.setdefault(sc_id, []).append(f"{numero} ({_est('COT', estado)})")
        for sc_id, numero, estado in db.execute(
                text("SELECT sc_id, numero, estado FROM sale_orders WHERE sc_id = ANY(:i) AND estado <> 'CANCELADO' "
                     "ORDER BY id"), {"i": ids}):
            docs.setdefault(sc_id, []).append(f"{numero} ({_est('VEN', estado)})")
    for f in a:
        f["documentos"] = ", ".join(docs.get(f["id"], []))
        f["estado_txt"] = _est("SC", f["estado"])
    for f in b + c:
        f["estado_txt"] = _est("SC", f["estado"])
    for f in c:
        f["motivo"] = "con motivo" if f["tiene_motivo"] else "sin motivo"
    part = lambda filas: ([f for f in filas if f["id"] not in excl.sc], [f for f in filas if f["id"] in excl.sc])
    return part(a), part(b), part(c)


def listar_n4(db, excl, **_) -> Listado:
    l = _nuevo("n4")
    (a, ax), (b, bx), (c, cx) = _sel_n4(db, excl)
    l.secciones.append(Seccion(
        "a", "(a) SC canceladas que tienen documentos activos — se decide caso por caso",
        [("numero", "Solicitud"), ("estado_txt", "Estado"), ("eliminada_at", "En papelera desde (UTC)"),
         ("documentos", "Documentos activos")], a))
    l.secciones.append(Seccion(
        "b", "(b) SC en la papelera que no están canceladas (la sincronización las revivió) — se decide caso por caso",
        [("numero", "Solicitud"), ("estado_txt", "Estado"), ("eliminada_at", "En papelera desde (UTC)")], b))
    l.secciones.append(Seccion(
        "c", "(c) SC canceladas con la pastilla vieja, sin papelera — lo único que escribe --aplicar",
        [("numero", "Solicitud"), ("estado_txt", "Estado"), ("motivo", "Motivo registrado")], c))
    _marcar_excluidos(l, ax + bx + cx, lambda f: f"{f['numero']} (solicitud)")
    l.notas.append("(c) usa 'tipo_solicitud IS DISTINCT FROM Soporte Tecnico' (el UPDATE del diseño usa <>, que "
                   "dejaría fuera las SC con tipo vacío; Soporte Técnico sigue excluido).")
    return l


def _aplicar_n4(ctx) -> ResultadoAplicar:
    db, res = ctx.db, ResultadoAplicar("n4")
    _, _, (c, _x) = _sel_n4(db, ctx.excl)
    elegidas = [f for f in c if _pasa(f, ctx)]
    res.detalle.append("(a) y (b) solo se listan: se deciden una por una y --aplicar no las toca.")
    if not elegidas:
        res.detalle.append("Ninguna SC del grupo (c) coincide con --ids/--numeros: no se escribió nada.")
        return res
    ids = [f["id"] for f in elegidas]
    res.respaldo = escribir_respaldo(db, ctx.carpeta, "n4", ctx.base, {"customer_requests": ids}, ctx.ahora)
    r = db.execute(
        text("UPDATE customer_requests SET eliminada_at = :ahora, "
             "razon_cancelacion = COALESCE(razon_cancelacion, :razon) "
             "WHERE id = ANY(:ids) AND estado = 'CANCELADA' AND eliminada_at IS NULL "
             "AND tipo_solicitud IS DISTINCT FROM 'Soporte Tecnico'"),
        {"ahora": ctx.ahora, "razon": RAZON_SIN_MOTIVO, "ids": ids})
    res.cambiados = r.rowcount
    res.detalle.append(f"(c): {r.rowcount} solicitud(es) a la papelera: " + ", ".join(f["numero"] for f in elegidas))
    return res


# ═══ n2 ═══════════════════════════════════════════════════════════════════════════════════════════════════════

_SQL_N2_A = """
SELECT so.id, so.numero, so.estado, so.total_cop, count(io.id) AS operaciones
FROM sale_orders so JOIN inventory_operations io ON io.source_document_type = 'PVEN' AND io.source_document_id = so.id
WHERE so.estado NOT IN ('ENTREGADO', 'FACTURADO')
GROUP BY so.id, so.numero, so.estado, so.total_cop ORDER BY so.id"""
_SQL_N2_B = """
SELECT id, numero, estado, cancelled_at, cancellation_reason FROM sale_orders
WHERE estado <> 'CANCELADO' AND (cancelled_at IS NOT NULL OR cancellation_reason IS NOT NULL) ORDER BY id"""
_SQL_N2_C = """
SELECT id, numero FROM sale_orders WHERE estado = 'CANCELADO' AND COALESCE(btrim(cancellation_reason), '') = ''
ORDER BY id"""


def listar_n2(db, excl, **_) -> Listado:
    l = _nuevo("n2")
    parte = lambda filas: ([f for f in filas if f["id"] not in excl.pven], [f for f in filas if f["id"] in excl.pven])
    a, ax = parte(_filas(db, _SQL_N2_A))
    b, bx = parte(_filas(db, _SQL_N2_B))
    c, cx = parte(_filas(db, _SQL_N2_C))
    for f in a + b:
        f["estado_txt"] = _est("VEN", f["estado"])
    l.secciones.append(Seccion(
        "a", "(a) Pedidos que ya descontaron inventario pero no están Entregado/Facturado — se decide uno por uno",
        [("numero", "Pedido"), ("estado_txt", "Estado"), ("total_cop", "Total"), ("operaciones", "Operaciones de inventario")], a))
    l.secciones.append(Seccion(
        "b", "(b) Pedidos cancelados y luego reabiertos — se decide uno por uno",
        [("numero", "Pedido"), ("estado_txt", "Estado"), ("cancelled_at", "Cancelado (UTC)"),
         ("cancellation_reason", "Motivo guardado")], b))
    l.secciones.append(Seccion(
        "c", "(c) Cancelaciones viejas sin motivo (solo informativo)", [("numero", "Pedido")], c,
        nota="solo informativo: no hay nada que decidir", compacta=True))
    _marcar_excluidos(l, ax + bx + cx, lambda f: f"{f['numero']} (pedido)")
    l.notas.append("Este paso no escribe: ningún cambio de estado se hace sin el OK explícito del usuario, por "
                   "separado en erp_test y en producción. Con el arreglo, (a) se puede volver a marcar Entregado "
                   "desde Entregas sin doble descuento.")
    return l


def _aplicar_n2(ctx) -> ResultadoAplicar:
    return ResultadoAplicar("n2", detalle=["Este paso no escribe: los tres casos se deciden uno por uno y cualquier "
                                           "cambio de estado se hace aparte, con el OK explícito del usuario."])


# ═══ n5 ═══════════════════════════════════════════════════════════════════════════════════════════════════════

def _mapa_estado_cot_a_sc():
    from app.api.v1.erp_ventas import _MAPA_ESTADO_COTIZACION_A_SOLICITUD
    return _MAPA_ESTADO_COTIZACION_A_SOLICITUD


def _estado_sugerido_cot(db, cot_id, estado) -> str:
    """Un estado valido se queda; uno ajeno pasa a CONFIRMADA si la COT tiene un pedido vigente, o a BORRADOR si no."""
    if estado in ESTADOS_COT:
        return estado
    vivo = db.execute(text("SELECT 1 FROM sale_orders WHERE cot_id = :c AND estado <> 'CANCELADO' LIMIT 1"),
                      {"c": cot_id}).first()
    return "CONFIRMADA" if vivo else "BORRADOR"


def _sel_n5(db, excl):
    mapa = _mapa_estado_cot_a_sc()
    a_filas = _filas(db, "SELECT id, numero, estado, advisor_user_id FROM customer_requests "
                         "WHERE estado <> ALL(:ok) ORDER BY id", ok=list(ESTADOS_SC))
    for f in a_filas:
        cot = _filas(db, "SELECT id, numero, estado FROM sales_quotations WHERE sc_id = :s AND estado <> 'RECHAZADA' "
                         "ORDER BY id DESC LIMIT 1", s=f["id"])
        if cot:
            efectivo = _estado_sugerido_cot(db, cot[0]["id"], cot[0]["estado"])
            f["sugerido"] = mapa.get(efectivo)
            f["motivo"] = f"su COT {cot[0]['numero']} está {efectivo}"
        else:
            f["sugerido"] = "ASIGNADA" if f["advisor_user_id"] else "BORRADOR"
            f["motivo"] = "sin COT activa" + (" (tiene asesor)" if f["advisor_user_id"] else " (sin asesor)")
        f["tipo"] = "SC"
    b_filas = _filas(db, "SELECT id, numero, estado FROM sales_quotations WHERE estado <> ALL(:ok) ORDER BY id",
                     ok=list(ESTADOS_COT))
    c_filas = _filas(db, """
        SELECT q.id, q.numero, q.estado,
               string_agg(so.numero || ' (' || so.estado || ')', ', ' ORDER BY so.id) AS pedidos
        FROM sales_quotations q JOIN sale_orders so ON so.cot_id = q.id
        WHERE q.estado <> 'CONFIRMADA' AND so.estado <> 'CANCELADO'
        GROUP BY q.id, q.numero, q.estado ORDER BY q.id""")
    for f in b_filas + c_filas:
        f["tipo"] = "COT"
        vivo = db.execute(text("SELECT 1 FROM sale_orders WHERE cot_id = :c AND estado <> 'CANCELADO' LIMIT 1"),
                          {"c": f["id"]}).first()
        f["sugerido"] = "CONFIRMADA" if vivo else "BORRADOR"
        f["motivo"] = "tiene un pedido vigente" if vivo else "sin pedido vigente"
    for f in a_filas + b_filas + c_filas:
        f["sugerido_txt"] = f"{f['sugerido']}" if f["sugerido"] else "(sin sugerencia)"
    parte = lambda filas, conj: ([f for f in filas if f["id"] not in conj], [f for f in filas if f["id"] in conj])
    return parte(a_filas, excl.sc), parte(b_filas, excl.cot), parte(c_filas, excl.cot)


def listar_n5(db, excl, **_) -> Listado:
    l = _nuevo("n5")
    (a, ax), (b, bx), (c, cx) = _sel_n5(db, excl)
    cols_sc = [("numero", "Solicitud"), ("estado", "Estado actual (código)"), ("sugerido_txt", "Estado sugerido"),
               ("motivo", "Por qué")]
    cols_cot = [("numero", "Cotización"), ("estado", "Estado actual (código)"), ("sugerido_txt", "Estado sugerido"),
                ("motivo", "Por qué")]
    l.secciones.append(Seccion("a", "(a) Solicitudes con un estado ajeno", cols_sc, a))
    l.secciones.append(Seccion("b", "(b) Cotizaciones con un estado ajeno", cols_cot, b))
    l.secciones.append(Seccion(
        "c", "(c) Cotizaciones que no están Confirmada pero tienen un pedido vigente",
        cols_cot + [("pedidos", "Pedidos")], c))
    _marcar_excluidos(l, ax + bx + cx, lambda f: f"{f['numero']} ({'solicitud' if f['tipo'] == 'SC' else 'cotización'})")
    l.notas.append("--aplicar --numeros SC-…,COT-… aplica la corrección sugerida SOLO a esos documentos. Una COT "
                   "corregida no mueve su solicitud ni su lead: revisa si su SC también aparece en (a).")
    return l


def _aplicar_n5(ctx) -> ResultadoAplicar:
    from app.models.erp_documents import ActivityLog, CustomerRequest, SalesQuotation
    db, res = ctx.db, ResultadoAplicar("n5")
    if not ctx.numeros:
        res.detalle.append("n5 se decide documento por documento: indica --numeros SC-…,COT-… Sin eso no se "
                           "escribió nada.")
        return res
    (a, _ax), (b, _bx), (c, _cx) = _sel_n5(db, ctx.excl)
    vistos, elegidas = set(), []
    for f in a + b + c:
        clave = (f["tipo"], f["id"])
        if clave in vistos or not _pasa(f, ctx):
            continue
        vistos.add(clave)
        elegidas.append(f)
    for numero in sorted(set(ctx.numeros) - {f["numero"] for f in elegidas}):
        res.detalle.append(f"{numero}: no está en los grupos (a), (b) o (c) (o es un documento real): no se toca")
    ejecutables = []
    for f in elegidas:
        if f["sugerido"] is None:
            res.detalle.append(f"{f['numero']}: sin corrección sugerida ({f['motivo']}): se decide a mano")
        else:
            ejecutables.append(f)
    if not ejecutables:
        res.detalle.append("Nada que escribir.")
        return res
    res.respaldo = escribir_respaldo(
        db, ctx.carpeta, "n5", ctx.base,
        {"customer_requests": [f["id"] for f in ejecutables if f["tipo"] == "SC"],
         "sales_quotations": [f["id"] for f in ejecutables if f["tipo"] == "COT"]}, ctx.ahora)
    for f in ejecutables:
        modelo = CustomerRequest if f["tipo"] == "SC" else SalesQuotation
        doc = db.query(modelo).filter(modelo.id == f["id"]).with_for_update().first()
        viejo, nuevo = doc.estado, f["sugerido"]
        doc.estado, doc.updated_at = nuevo, ctx.ahora
        db.add(ActivityLog(
            entity_type=f["tipo"], entity_id=doc.id, entity_numero=doc.numero, action="ESTADO_CHANGED",
            description=f"Estado corregido por la corrección de datos: de {etiqueta_estado(f['tipo'], viejo)} a "
                        f"{etiqueta_estado(f['tipo'], nuevo)} ({f['motivo']})",
            old_estado=viejo, new_estado=nuevo, user_name=AUTOR))
        res.cambiados += 1
        res.detalle.append(f"{doc.numero}: {viejo} → {nuevo}")
    return res


# ═══ n10 ══════════════════════════════════════════════════════════════════════════════════════════════════════

_SQL_N10 = """
SELECT al.id, al.entity_id AS linea_id, al.created_at, l.so_id, so.numero AS pven
FROM activity_logs al
LEFT JOIN sale_order_lines_erp l ON l.id = al.entity_id
LEFT JOIN sale_orders so ON so.id = l.so_id
WHERE al.entity_type = 'PVEN' AND al.action = 'MERCANCIA_DISPONIBLE'
ORDER BY al.id"""


def _sel_n10(db, excl):
    filas = _filas(db, _SQL_N10)
    huerfanas = [f for f in filas if f["so_id"] is None]
    con_linea = [f for f in filas if f["so_id"] is not None]
    # excluido si el pedido de la linea es real, o si el id guardado (de la linea) coincide con un pedido real
    es_real = lambda f: f["so_id"] in excl.pven or f["linea_id"] in excl.pven
    incluidas = [f for f in con_linea if not es_real(f)]
    excluidas = [f for f in filas if es_real(f)]
    for f in incluidas:
        f["numero"] = f["pven"]
    return incluidas, excluidas, huerfanas, len(filas)


def listar_n10(db, excl, **_) -> Listado:
    l = _nuevo("n10")
    incluidas, excluidas, huerfanas, total = _sel_n10(db, excl)
    l.secciones.append(Seccion(
        "logs", "Logs que pasarían de 'PVEN' (id de la línea) a 'VEN' (id del pedido)",
        [("id", "Log"), ("linea_id", "Id de la línea"), ("so_id", "Id del pedido"), ("pven", "Pedido"),
         ("created_at", "Creado (UTC)")], incluidas))
    _marcar_excluidos(l, excluidas, lambda f: f"log #{f['id']} (línea {f['linea_id']}, pedido {f.get('pven') or '?'})")
    l.notas.append(f"Conteo previo: {total} logs MERCANCIA_DISPONIBLE con entity_type 'PVEN'; {len(incluidas)} se "
                   f"corregirían; {len(huerfanas)} sin línea de pedido (no se tocan"
                   + (": ids " + ", ".join(str(f["id"]) for f in huerfanas[:30]) + (" …" if len(huerfanas) > 30 else "")
                      if huerfanas else "")
                   + f"); {len(excluidas)} excluidos por documento real.")
    return l


def _aplicar_n10(ctx) -> ResultadoAplicar:
    db, res = ctx.db, ResultadoAplicar("n10")
    incluidas, _x, _h, _t = _sel_n10(db, ctx.excl)
    elegidas = [f for f in incluidas if _pasa(f, ctx)]
    if not elegidas:
        res.detalle.append("Ningún log coincide con --ids/--numeros: no se escribió nada.")
        return res
    ids = [f["id"] for f in elegidas]
    res.respaldo = escribir_respaldo(db, ctx.carpeta, "n10", ctx.base, {"activity_logs": ids}, ctx.ahora)
    r = db.execute(
        text("UPDATE activity_logs al SET entity_type = 'VEN', entity_id = l.so_id, entity_numero = so.numero "
             "FROM sale_order_lines_erp l JOIN sale_orders so ON so.id = l.so_id "
             "WHERE al.entity_type = 'PVEN' AND al.action = 'MERCANCIA_DISPONIBLE' AND l.id = al.entity_id "
             "AND al.id = ANY(:ids)"), {"ids": ids})
    res.cambiados = r.rowcount
    res.detalle.append(f"{r.rowcount} log(s) de mercancía disponible corregidos (de {len(ids)} elegidos)")
    return res


# ═══ h7 ═══════════════════════════════════════════════════════════════════════════════════════════════════════

def _excluir_logs_sql() -> str:
    return ("((entity_type = 'SC' AND entity_id = ANY(:sc)) OR (entity_type = 'COT' AND entity_id = ANY(:cot)) "
            "OR (entity_type IN ('VEN', 'PVEN') AND entity_id = ANY(:pven)) "
            "OR (entity_type = 'PXP' AND entity_id = ANY(:pxp)))")


def _candidatas_h7(db, excl, ids=None):
    """(ids_a_corregir, excluidas): activity_logs de texto del sistema cuya descripcion corregir() cambiaria, sin
    los de entidades reales. Usa la regla de textos_actividad: no la duplica."""
    sql = (f"SELECT id, entity_type, action, description, {_excluir_logs_sql()} AS excluida FROM activity_logs "
           "WHERE entity_type = ANY(:ent) AND action = ANY(:acc) AND description IS NOT NULL")
    params = {"ent": sorted(ENTIDADES_CORREGIBLES), "acc": sorted(ACCIONES_DEL_SISTEMA), "sc": sorted(excl.sc),
              "cot": sorted(excl.cot), "pven": sorted(excl.pven), "pxp": sorted(excl.pxp)}
    if ids is not None:
        sql += " AND id = ANY(:ids)"
        params["ids"] = [int(i) for i in ids]
    candidatas, excluidas = [], 0
    for fila in db.execute(text(sql + " ORDER BY id"), params).mappings():
        if corregir_descripcion_historica(fila["entity_type"], fila["action"], fila["description"]) is None:
            continue
        if fila["excluida"]:
            excluidas += 1
        else:
            candidatas.append(fila["id"])
    return candidatas, excluidas


def _corregir_textos():
    from scripts import corregir_textos_actividad
    return corregir_textos_actividad


def listar_h7(db, excl, ids=None, **_) -> Listado:
    l = _nuevo("h7")
    candidatas, excluidas = _candidatas_h7(db, excl, ids)
    # corregir(aplicar=False) termina con rollback: va al final, despues de todas las consultas del paso.
    res = _corregir_textos().corregir(db, aplicar=False, ids=candidatas)
    l.datos = {"candidatas": res["candidatas"], "excluidas": excluidas, "por_tipo": res["por_tipo"]}
    l.secciones.append(Seccion(
        "tipos", "Candidatas por tipo de corrección", [("tipo", "Tipo"), ("n", "Filas")],
        [{"tipo": t, "n": n} for t, n in sorted(res["por_tipo"].items())]))
    l.secciones.append(Seccion(
        "ejemplos", f"Ejemplos 'antes → después' (hasta {len(res['ejemplos'])})",
        [("id", "Log"), ("antes", "Antes"), ("despues", "Después")],
        [{"id": i, "antes": a, "despues": d} for i, a, d in res["ejemplos"]]))
    if excluidas:
        l.excluidos.append(f"{excluidas} renglón(es) de Actividad de documentos reales que habría corregido")
    l.notas.append("No corrige filas 'PVEN' ni montos con coma ya guardados ('$1,250,000').")
    l.notas.append(f"Conteo de candidatas (total real): {res['candidatas']}. El respaldo en tabla "
                   f"({_corregir_textos().TABLA_RESPALDO}) y el JSON se hacen con --aplicar.")
    return l


def _aplicar_h7(ctx) -> ResultadoAplicar:
    db, res = ctx.db, ResultadoAplicar("h7")
    if ctx.numeros is not None:
        raise ErrorCorreccion("h7 solo acepta --ids (ids de activity_logs), no --numeros")
    candidatas, _ = _candidatas_h7(db, ctx.excl, ctx.ids)
    if not candidatas:
        res.detalle.append("Ninguna actividad por corregir: no se escribió nada.")
        return res
    res.respaldo = escribir_respaldo(db, ctx.carpeta, "h7", ctx.base, {"activity_logs": candidatas}, ctx.ahora)
    modulo = _corregir_textos()
    r = modulo.corregir(db, aplicar=True, ids=candidatas, tabla_respaldo=ctx.tabla_respaldo or modulo.TABLA_RESPALDO)
    res.cambiados = r["corregidas"]
    res.detalle.append(f"{r['corregidas']} actividad(es) corregidas (respaldo en tabla "
                       f"{ctx.tabla_respaldo or modulo.TABLA_RESPALDO} y en JSON)")
    return res


# ═══ u9 ═══════════════════════════════════════════════════════════════════════════════════════════════════════

_PATRON_U9 = "SC creada:  -%"
_SQL_U9 = """
SELECT so.id, cr.numero, so.status, so.created_at, so.canonical_customer_request_id AS sc_id,
       so.canonical_sale_order_id AS pven_id, length(so.lead_description) AS largo
FROM sales_orders so JOIN customer_requests cr ON cr.id = so.canonical_customer_request_id
WHERE so.lead_source = 'SC' AND so.lead_description LIKE :patron
ORDER BY so.id"""


def _sel_u9(db, excl):
    filas = _filas(db, _SQL_U9, patron=_PATRON_U9)
    es_real = lambda f: f["sc_id"] in excl.sc or (f["pven_id"] is not None and f["pven_id"] in excl.pven)
    return [f for f in filas if not es_real(f)], [f for f in filas if es_real(f)]


def listar_u9(db, excl, **_) -> Listado:
    l = _nuevo("u9")
    incluidas, excluidas = _sel_u9(db, excl)
    l.secciones.append(Seccion(
        "leads", "Leads con la descripción 'SC creada:  - …' (sin número)",
        [("id", "Lead"), ("numero", "Solicitud"), ("status", "Etapa"), ("largo", "Largo del texto"),
         ("created_at", "Creado (UTC)")], incluidas))
    _marcar_excluidos(l, excluidas, lambda f: f"lead #{f['id']} (solicitud {f['numero']})")
    l.notas.append("El texto del lead no se imprime: lleva las notas libres del asesor.")
    return l


def _aplicar_u9(ctx) -> ResultadoAplicar:
    db, res = ctx.db, ResultadoAplicar("u9")
    incluidas, _ = _sel_u9(db, ctx.excl)
    elegidas = [f for f in incluidas if _pasa(f, ctx)]
    if not elegidas:
        res.detalle.append("Ningún lead coincide con --ids/--numeros: no se escribió nada.")
        return res
    ids = [f["id"] for f in elegidas]
    res.respaldo = escribir_respaldo(db, ctx.carpeta, "u9", ctx.base, {"sales_orders": ids}, ctx.ahora)
    r = db.execute(
        text("UPDATE sales_orders so SET lead_description = 'SC creada: ' || cr.numero || "
             "substr(so.lead_description, length('SC creada: ') + 1) "
             "FROM customer_requests cr WHERE so.canonical_customer_request_id = cr.id AND so.lead_source = 'SC' "
             "AND so.lead_description LIKE :patron AND so.id = ANY(:ids)"), {"patron": _PATRON_U9, "ids": ids})
    res.cambiados = r.rowcount
    res.detalle.append(f"{r.rowcount} lead(s) con el número de la solicitud")
    return res


# ═══ h42 ══════════════════════════════════════════════════════════════════════════════════════════════════════

_SQL_H42_VEN = """
SELECT v.id, v.numero, v.estado, v.total_cop, v.saldo_cop,
       EXISTS (SELECT 1 FROM sale_order_payments p WHERE p.sale_order_id = v.id) AS tiene_pagos
FROM sale_orders v WHERE v.total_cop <> round(v.total_cop) OR v.saldo_cop <> round(v.saldo_cop) ORDER BY v.id"""
_SQL_H42_COT = """
SELECT q.id, q.numero, q.estado, q.total_cop, q.anticipo_cop,
       EXISTS (SELECT 1 FROM sale_orders v JOIN sale_order_payments p ON p.sale_order_id = v.id
               WHERE v.cot_id = q.id) AS tiene_pagos
FROM sales_quotations q WHERE q.total_cop <> round(q.total_cop) ORDER BY q.id"""


def _sel_h42(db, excl):
    ven, cot = _filas(db, _SQL_H42_VEN), _filas(db, _SQL_H42_COT)
    for f in ven:
        f["estado_txt"], f["pagos"] = _est("VEN", f["estado"]), "Sí" if f["tiene_pagos"] else "No"
    for f in cot:
        f["estado_txt"], f["pagos"] = _est("COT", f["estado"]), "Sí" if f["tiene_pagos"] else "No"
    return (([f for f in ven if f["id"] not in excl.pven], [f for f in ven if f["id"] in excl.pven]),
            ([f for f in cot if f["id"] not in excl.cot], [f for f in cot if f["id"] in excl.cot]))


def listar_h42(db, excl, **_) -> Listado:
    l = _nuevo("h42")
    (ven, vx), (cot, cx) = _sel_h42(db, excl)
    l.secciones.append(Seccion(
        "pedidos", "Pedidos de venta con decimales en total o saldo",
        [("numero", "Pedido"), ("estado_txt", "Estado"), ("total_cop", "Total"), ("saldo_cop", "Saldo"),
         ("pagos", "¿Tiene pagos?")], ven))
    l.secciones.append(Seccion(
        "cotizaciones", "Cotizaciones con decimales en el total",
        [("numero", "Cotización"), ("estado_txt", "Estado"), ("total_cop", "Total"), ("anticipo_cop", "Anticipo"),
         ("pagos", "¿Pedido con pagos?")], cot, nota="las cotizaciones no tienen saldo_cop"))
    _marcar_excluidos(l, vx + cx, lambda f: f"{f['numero']} (total {monto_exacto(f['total_cop'])})")
    l.notas.append("El diseño NO lo recomienda: reescribir montos de documentos ya confirmados cambia lo que el "
                   "cliente aceptó. El usuario pidió hacerlo solo en documentos SIN pagos (R1); el formateador "
                   "nuevo ya oculta los decimales en pantalla.")
    l.notas.append("--aplicar redondea únicamente los documentos sin pagos y que estén en --numeros; no toca las "
                   "líneas ni el JSON de productos. Una cotización Pendiente de confirmación o Confirmada "
                   "cambiaría el total que el cliente vio.")
    return l


def _aplicar_h42(ctx) -> ResultadoAplicar:
    from app.models.erp_documents import ActivityLog, SaleOrder, SalesQuotation
    db, res = ctx.db, ResultadoAplicar("h42")
    if not ctx.numeros:
        res.detalle.append("h42 solo redondea los documentos que indiques en --numeros. Sin eso no se escribió nada.")
        return res
    (ven, _vx), (cot, _cx) = _sel_h42(db, ctx.excl)
    pedidas = set(ctx.numeros)
    for numero in sorted(pedidas - {f["numero"] for f in ven + cot}):
        res.detalle.append(f"{numero}: no tiene decimales en total/saldo (o es un documento real): no se toca")
    elegidas = [f for f in ven if f["numero"] in pedidas] + [f for f in cot if f["numero"] in pedidas]
    for f in [f for f in elegidas if f["tiene_pagos"]]:
        res.detalle.append(f"{f['numero']}: tiene pagos registrados: NO se toca")
    ven_ok = [f for f in ven if f["numero"] in pedidas and not f["tiene_pagos"]]
    cot_ok = [f for f in cot if f["numero"] in pedidas and not f["tiene_pagos"]]
    if not ven_ok and not cot_ok:
        res.detalle.append("Nada que redondear.")
        return res
    res.respaldo = escribir_respaldo(db, ctx.carpeta, "h42", ctx.base,
                                     {"sale_orders": [f["id"] for f in ven_ok],
                                      "sales_quotations": [f["id"] for f in cot_ok]}, ctx.ahora)
    for modelo, filas, columnas, entidad in (
            (SaleOrder, ven_ok, ("total_cop", "subtotal_cop", "anticipo_cop", "saldo_cop"), "VEN"),
            (SalesQuotation, cot_ok, ("total_cop", "subtotal_cop", "anticipo_cop"), "COT")):
        for f in filas:
            doc = db.query(modelo).filter(modelo.id == f["id"]).with_for_update().first()
            antes = doc.total_cop
            for c in columnas:
                setattr(doc, c, redondear_peso(getattr(doc, c)))
            doc.updated_at = ctx.ahora
            db.add(ActivityLog(
                entity_type=entidad, entity_id=doc.id, entity_numero=doc.numero, action="UPDATED",
                description=f"Montos redondeados al peso por la corrección de datos: total {monto_exacto(antes)} → "
                            f"{pesos(doc.total_cop)}", user_name=AUTOR))
            res.cambiados += 1
            res.detalle.append(f"{doc.numero}: total {monto_exacto(antes)} → {pesos(doc.total_cop)}")
    return res


# ─── despacho ─────────────────────────────────────────────────────────────────────────────────────────────────

LISTADORES = {"n1": listar_n1, "h44": listar_h44, "h45": listar_h45, "h46": listar_h46, "h36": listar_h36,
              "n4": listar_n4, "n2": listar_n2, "n5": listar_n5, "n10": listar_n10, "h7": listar_h7,
              "u9": listar_u9, "h42": listar_h42}
APLICADORES = {"n1": _aplicar_n1, "h44": _aplicar_h44, "h45": _aplicar_h45, "h46": _aplicar_h46, "h36": _aplicar_h36,
               "n4": _aplicar_n4, "n2": _aplicar_n2, "n5": _aplicar_n5, "n10": _aplicar_n10, "h7": _aplicar_h7,
               "u9": _aplicar_u9, "h42": _aplicar_h42}


def listar_paso(db, paso, excluidos=NUMEROS_REALES, solo_lectura=True, excl=None, **opciones) -> Listado:
    """El listado de un paso. Con solo_lectura (lo normal) corre dentro de SET TRANSACTION READ ONLY y termina con
    rollback; solo las pruebas (que ya van dentro de una transaccion revertida) lo apagan. `excl` son los
    excluidos ya calculados (listar_todo los calcula una vez)."""
    if paso not in LISTADORES:
        raise ErrorCorreccion(f"Paso desconocido: {paso!r}")
    if solo_lectura:
        iniciar_solo_lectura(db)
    try:
        motivo = _faltantes(db, paso)
        if motivo:
            return _nuevo(paso, no_aplica=motivo)
        return LISTADORES[paso](db, excl if excl is not None else calcular_excluidos(db, excluidos), **opciones)
    finally:
        if solo_lectura:
            db.rollback()


def listar_todo(db, excluidos=NUMEROS_REALES, solo_lectura=True, pasos=PASOS, **opciones) -> list:
    """Los listados de los pasos, en el orden obligatorio. Un paso que falla no tumba a los demas: queda con su
    error en el listado."""
    if solo_lectura:
        iniciar_solo_lectura(db)
    try:
        excl = calcular_excluidos(db, excluidos)
    finally:
        if solo_lectura:
            db.rollback()
    listados = []
    for paso in pasos:
        try:
            listados.append(listar_paso(db, paso, excluidos, solo_lectura, excl=excl, **opciones))
        except Exception as exc:  # noqa: BLE001 -- se reporta por paso y se sigue
            if solo_lectura:
                db.rollback()
            listados.append(_nuevo(paso, error=f"{type(exc).__name__}: {exc}"))
    return listados


def aplicar_paso(db, paso, base, carpeta_respaldos=CARPETA_RESPALDOS, excluidos=NUMEROS_REALES, ids=None,
                 numeros=None, decisiones=None, tabla_respaldo=None) -> ResultadoAplicar:
    """Escribe un paso. Aborta SIN escribir si `base` no es current_database(). Un solo commit al final; ante
    cualquier error, rollback del paso completo."""
    if paso not in APLICADORES:
        raise ErrorCorreccion(f"Paso desconocido: {paso!r}")
    actual = base_actual(db)
    if base != actual:
        db.rollback()
        raise ErrorCorreccion(f"--base {base!r} no coincide con la base a la que está conectado el script "
                              f"({actual!r}): no se escribió nada.")
    motivo = _faltantes(db, paso)
    if motivo:
        db.rollback()
        return ResultadoAplicar(paso, detalle=[f"No aplica: {motivo}"])
    try:
        ctx = Contexto(db=db, base=base, carpeta=Path(carpeta_respaldos), excl=calcular_excluidos(db, excluidos),
                       numeros_reales=tuple(excluidos), ids=ids, numeros=numeros, decisiones=decisiones,
                       tabla_respaldo=tabla_respaldo)
        resultado = APLICADORES[paso](ctx)
        db.commit()
        return resultado
    except Exception:
        db.rollback()
        raise


# ─── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────

def _lista_de_enteros(valor):
    try:
        return [int(x) for x in valor.split(",") if x.strip()]
    except ValueError:
        raise argparse.ArgumentTypeError("--ids lleva enteros separados por coma (p. ej. 12,13)") from None


def _lista_de_textos(valor):
    return [x.strip() for x in valor.split(",") if x.strip()]


class _Parser(argparse.ArgumentParser):
    def parse_args(self, args=None, namespace=None):
        ns = super().parse_args(args, namespace)
        if ns.aplicar and not ns.base:
            self.error("--aplicar exige --base <nombre de la base>, igual a current_database()")
        return ns


def armar_parser() -> argparse.ArgumentParser:
    parser = _Parser(description="Corrige los datos viejos del Bloque 1 de Ventas, paso por paso (tarea 14).")
    sub = parser.add_subparsers(dest="paso", required=True, metavar="paso")
    for paso in PASOS:
        p = sub.add_parser(paso, help=INFO[paso]["titulo"])
        modo = p.add_mutually_exclusive_group(required=True)
        modo.add_argument("--listar", action="store_true", help="solo lectura: imprime lo que cambiaría")
        modo.add_argument("--aplicar", action="store_true", help="escribe (con respaldo JSON previo)")
        p.add_argument("--base", help="con --aplicar: nombre de la base; debe ser igual a current_database()")
        p.add_argument("--ids", type=_lista_de_enteros, help="limita a estos ids (separados por coma)")
        p.add_argument("--numeros", type=_lista_de_textos, help="limita a estos números de documento")
        p.add_argument("--decisiones", help="n1: archivo JSON con la decisión por pedido")
        p.add_argument("--respaldos", default=str(CARPETA_RESPALDOS), help="carpeta de los respaldos JSON")
    todo = sub.add_parser("todo", help="corre todos los listados, en el orden obligatorio")
    todo.add_argument("--listar", action="store_true", required=True, help="solo lectura")
    todo.set_defaults(aplicar=False, base=None, ids=None, numeros=None, decisiones=None, respaldos=str(CARPETA_RESPALDOS))
    return parser


def _cargar_decisiones(ruta):
    if not ruta:
        return None
    with open(ruta, encoding="utf-8") as f:
        datos = json.load(f)
    if not isinstance(datos, dict):
        raise ErrorCorreccion("El archivo de decisiones debe ser un objeto JSON {\"PVEN-…\": {...}}")
    return datos


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
        print(f"Fecha (UTC): {datetime.datetime.utcnow():%Y-%m-%d %H:%M:%S}")
        if args.listar:
            db.rollback()
            iniciar_solo_lectura(db)
            excl = calcular_excluidos(db)
            db.rollback()
            print("Documentos reales protegidos (y lo encadenado a ellos): " + (", ".join(excl.etiquetas) or "ninguno"))
            print()
            pasos = PASOS if args.paso == "todo" else (args.paso,)
            listados = listar_todo(db, pasos=pasos)
            for l in listados:
                print(texto_listado(l, indice=PASOS.index(l.paso) + 1, total=len(PASOS)))
            if len(listados) > 1:
                print(texto_resumen(listados))
            print("LISTAR: no se escribió nada (transacción de solo lectura).")
            return 1 if any(l.error for l in listados) else 0
        try:
            res = aplicar_paso(db, args.paso, base=args.base, carpeta_respaldos=args.respaldos, ids=args.ids,
                               numeros=args.numeros, decisiones=_cargar_decisiones(args.decisiones))
        except ErrorCorreccion as exc:
            print(f"ABORTADO: {exc}", file=sys.stderr)
            return 2
        print(f"Paso {args.paso}: {res.cambiados} fila(s) cambiadas.")
        for linea in res.detalle:
            print(f"  - {linea}")
        if res.respaldo:
            print(f"Respaldo JSON: {res.respaldo}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
