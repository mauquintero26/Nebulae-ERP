"""Fechas de negocio de Nebulae: la zona horaria de Colombia, en un solo lugar.

Revision final del Bloque 2 (B6): habia una copia de ZoneInfo("America/Bogota") en cada modulo que mostraba una fecha en
hora de Colombia (erp_ventas.py, app/core/cambios_documento.py, erp_ventas_fase4.py y erp_logistica.py). Todos la toman
de aqui. Modulo puro, sin FastAPI ni DB: lo importa cualquiera sin ciclos.
"""
from zoneinfo import ZoneInfo

# America/Bogota: UTC-5 siempre (sin horario de verano). Las fechas del backend se guardan en UTC sin zona (utcnow);
# esta zona es la de las fechas que ve el usuario (el dia de la purga de la Papelera, el dia de una fecha de negocio en la
# Actividad, los cortes de despacho y los dias habiles de transito).
ZONA_COLOMBIA = ZoneInfo("America/Bogota")
