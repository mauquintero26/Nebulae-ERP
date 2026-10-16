"""Fechas de negocio de Nebulae: la zona horaria de Colombia, en un solo lugar.

Revision final del Bloque 2 (B6): habia una copia de ZoneInfo("America/Bogota") en cada modulo que mostraba una fecha en
hora de Colombia (erp_ventas.py, app/core/cambios_documento.py, erp_ventas_fase4.py y erp_logistica.py). Todos la toman
de aqui. Modulo puro, sin FastAPI ni DB: lo importa cualquiera sin ciclos.

Bloque 3, T1 (C6 y RP1): aqui viven tambien las fechas de los documentos y enlaces del cliente (ahora_utc, hoy_colombia,
a_colombia, vence_al_final_del_dia, fecha_larga, fecha_hora_co e iso_z), todas sobre ZONA_COLOMBIA. TZ_CO es un alias de
la misma zona: no hay una segunda zona timezone(-5) (America/Bogota no tiene horario de verano, asi que es lo mismo).
Las fechas del backend se guardan en UTC sin zona (como utcnow): estas funciones las reciben y las devuelven asi.
"""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

# America/Bogota: UTC-5 siempre (sin horario de verano). Las fechas del backend se guardan en UTC sin zona (utcnow);
# esta zona es la de las fechas que ve el usuario (el dia de la purga de la Papelera, el dia de una fecha de negocio en la
# Actividad, los cortes de despacho y los dias habiles de transito).
ZONA_COLOMBIA = ZoneInfo("America/Bogota")
TZ_CO = ZONA_COLOMBIA  # alias (U16-seguimiento lo llamaba asi); es el mismo objeto

MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
         "noviembre", "diciembre")


def ahora_utc() -> datetime:
    """La hora actual en UTC sin zona: el formato de created_at, expires_at y las demas columnas (utcnow)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def a_colombia(dt_utc: datetime) -> datetime:
    """Un datetime en UTC (sin zona = UTC, como se guarda) pasado a hora de Colombia, con zona."""
    if dt_utc.tzinfo is None:
        dt_utc = dt_utc.replace(tzinfo=timezone.utc)
    return dt_utc.astimezone(ZONA_COLOMBIA)


def hoy_colombia(ahora: datetime | None = None) -> date:
    """El dia de hoy en Colombia. `ahora` (UTC sin zona) permite fijar el instante en las pruebas."""
    return a_colombia(ahora if ahora is not None else ahora_utc()).date()


def vence_al_final_del_dia(fecha: date) -> datetime:
    """El instante en que termina `fecha` en Colombia (las 00:00 del dia siguiente alla), en UTC sin zona.

    Es el expires_at de un enlace que sirve "hasta el 8 de octubre": date(2026, 10, 8) -> datetime(2026, 10, 9, 5, 0)."""
    fin = datetime.combine(fecha + timedelta(days=1), time(0, 0), tzinfo=ZONA_COLOMBIA)
    return fin.astimezone(timezone.utc).replace(tzinfo=None)


def _a_fecha_o_instante(valor):
    """date (fecha de calendario, no se corre de dia) | datetime (instante; sin zona = UTC) | None.

    Un texto 'AAAA-MM-DD' es una fecha; un texto ISO con hora (con o sin 'Z') es un instante."""
    if valor is None or valor == "":
        return None
    if isinstance(valor, str):
        texto = valor.strip()
        if len(texto) <= 10:
            return date.fromisoformat(texto)
        return datetime.fromisoformat(texto.replace("Z", "+00:00"))
    return valor


def fecha_larga(valor) -> str | None:
    """'8 de octubre de 2026'. Una fecha sin hora (date o 'AAAA-MM-DD') es ese mismo dia; un instante (datetime en UTC o
    texto ISO con hora) se pasa al dia de Colombia. None o '' -> None."""
    v = _a_fecha_o_instante(valor)
    if v is None:
        return None
    if isinstance(v, datetime):
        v = a_colombia(v).date()
    return f"{v.day} de {MESES[v.month - 1]} de {v.year}"


def fecha_hora_co(dt_utc) -> str | None:
    """'03/10/2026 a las 3:15 p. m.': el instante (UTC sin zona o texto ISO) en hora de Colombia. None -> None."""
    v = _a_fecha_o_instante(dt_utc)
    if v is None:
        return None
    co = a_colombia(v)
    hora = co.hour % 12 or 12
    sufijo = "a. m." if co.hour < 12 else "p. m."
    return f"{co:%d/%m/%Y} a las {hora}:{co.minute:02d} {sufijo}"


def iso_z(dt) -> str | None:
    """isoformat() + 'Z' de un instante en UTC (el navegador lo lee como UTC y no lo corre 5 h). Uno con zona se pasa a
    UTC primero; None -> None. Es la regla de _iso_utc de erp_ventas.py, para los modulos nuevos."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.isoformat() + "Z"
