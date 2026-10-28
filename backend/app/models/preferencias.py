"""Preferencias de pantalla de cada usuario (Bloque 4, T1B: TABLA-base puntos 7 y 8, R4 y C2). Migracion fa6_033.

Una fila por usuario y clave (UNIQUE user_id + clave). recordar_pantallas = «En tu usuario: igual en cualquier computador
o celular»: lo que el navegador guarda con lib/preferencias.js (T3A) vive aqui, bajo la sesion del usuario.

- clave: '<ambito>:<id>' con los cinco ambitos de R4 (tabla:, vista:, kanban:, flujo: y analisis:); la regla esta en
  app/api/v1/preferencias.py (CLAVE_VALIDA), que es la unica que escribe la tabla.
- valor: cualquier JSON de hasta 8 KB (8192 bytes en UTF-8, medido como dice RP24).
- updated_at: UTC sin zona (como utcnow); el GET devuelve primero las mas recientes (maximo 500).
- user_id: FK users ON DELETE CASCADE: borrar un usuario borra sus preferencias.
"""
from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint, text

from app.db.database import Base

CLAVE_MAX = 120
UNICO_USUARIO_CLAVE = "uq_preferencias_usuario_user_clave"


class PreferenciaUsuario(Base):
    __tablename__ = "preferencias_usuario"
    __table_args__ = (UniqueConstraint("user_id", "clave", name=UNICO_USUARIO_CLAVE),)

    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    clave      = Column(String(CLAVE_MAX), nullable=False)
    valor      = Column(JSON, nullable=False)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow,
                        server_default=text("(now() AT TIME ZONE 'utc')"))
