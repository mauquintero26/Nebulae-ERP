"""
app/models/admin_calendar_crm.py
---------------------------------
Modelos SQLAlchemy para tablas funcionales que existian en staging pero no
tenian representacion en Alembic ni en el ORM:

  - AdminConfig:    configuracion clave/valor del sistema administrativo
  - CalendarEvent:  eventos de calendario con sincronizacion Google/Microsoft
  - CrmConfig:      configuracion de pipeline y alertas de CRM

Estos modelos fueron anadidos en GO/NO-GO V2.1 para corregir
la diferencia 80/77 tablas entre staging y erp_test.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, func
from app.db.database import Base


class AdminConfig(Base):
    """
    Configuracion clave/valor del panel administrativo.
    Sin PK serial - la clave actua como identificador unico.
    """
    __tablename__ = "admin_config"

    key = Column(String, primary_key=True, nullable=False)
    value = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )


class CalendarEvent(Base):
    """
    Eventos de calendario con sincronizacion opcional a Google Calendar
    y Microsoft Outlook.
    """
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    start_datetime = Column(DateTime, nullable=True)
    end_datetime = Column(DateTime, nullable=True)
    event_type = Column(String, nullable=True)
    location = Column(String, nullable=True)
    customer_id = Column(Integer, nullable=True)
    customer_name = Column(String, nullable=True)
    created_by = Column(String, nullable=True)
    google_event_id = Column(String, nullable=True)
    microsoft_event_id = Column(String, nullable=True)
    sync_source = Column(String, nullable=True)
    color = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=True)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=True)


class CrmConfig(Base):
    """
    Configuracion de pipeline y alertas de CRM.
    Permite personalizar nombres de etapas y umbrales de alerta.
    """
    __tablename__ = "crm_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pipeline_name = Column(String, nullable=True)
    stage_id = Column(Integer, nullable=True)
    alert_days = Column(Integer, nullable=True)
    alert_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=True)