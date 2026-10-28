"""Preferencias de pantalla del usuario (Bloque 4, T1B: TABLA-base puntos 7 y 8, R4, R21 y RP24).

router (montado en /api/v1/preferencias): cualquier usuario autenticado (get_current_user) y SOLO sus propias filas.
- GET ''         ?prefijo= opcional (literal: '_' y '%' no son comodines). Sin prefijo, o vacio, trae todas.
                 -> {status, data: {clave: valor}}, maximo MAXIMO_PREFERENCIAS (las mas recientes primero).
- PUT '/{clave}' body {"valor": <cualquier JSON>} -> upsert de la fila (user_id, clave) -> {status, data: {clave: valor}}.
Errores (validados a mano, R21: un RequestValidationError saldria como un 400 tecnico en ingles):
- 422 si la clave no cumple CLAVE_VALIDA (los cinco ambitos de R4), si el cuerpo no trae 'valor', si el valor tiene mas
  de MAXIMO_NIVELES niveles anidados (r1), si no es JSON (NaN, Infinity o un surrogate suelto) o si serializado pasa de
  LIMITE_BYTES (RP24: json.dumps compacto, en bytes UTF-8).
- 401 sin token o con un token que no sirve (get_current_user).
El navegador (lib/preferencias.js, T3A) usa la misma expresion de la clave y la misma medida del tamano (RP24).
"""
import json
import re
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.dialects.postgresql import insert as insert_pg
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.database import get_db
from app.models.preferencias import UNICO_USUARIO_CLAVE, PreferenciaUsuario
from app.models.users import User

router = APIRouter()

# RP24: exactamente la expresion de R4 (el navegador usa la misma). Se aplica con fullmatch: con match, '$' dejaria pasar
# un salto de linea al final.
CLAVE_VALIDA = re.compile(r"^(tabla|vista|kanban|flujo|analisis):[a-z0-9._-]{1,80}$")
LIMITE_BYTES = 8192
MAXIMO_PREFERENCIAS = 500
MAXIMO_NIVELES = 32  # r1: listas u objetos uno dentro de otro

MENSAJE_CLAVE = ("La clave de la preferencia no es válida: debe empezar por tabla:, vista:, kanban:, flujo: o analisis: "
                 "y seguir con 1 a 80 letras minúsculas sin tildes, números, punto, guion o guion bajo.")
MENSAJE_SIN_VALOR = 'Falta el valor de la preferencia: envía {"valor": …}.'
MENSAJE_VALOR_NO_JSON = "El valor de la preferencia no es un JSON válido."
MENSAJE_TAMANO = "El valor de la preferencia pasa de 8 KB (8192 bytes)."
MENSAJE_PROFUNDIDAD = "El valor tiene demasiados niveles anidados (máximo 32)."


def tamano_en_bytes(valor: Any) -> int:
    """RP24: lo que mide el servidor. El navegador mide new TextEncoder().encode(JSON.stringify(valor)).length."""
    return len(json.dumps(valor, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))


def _validar_clave(clave: str) -> None:
    if not CLAVE_VALIDA.fullmatch(clave):
        raise HTTPException(422, MENSAJE_CLAVE)


def pasa_de_niveles(valor: Any, maximo: int = MAXIMO_NIVELES) -> bool:
    """True si el valor tiene mas de `maximo` listas u objetos uno dentro de otro (un escalar tiene 0; [1] y {"a": 1},
    1). Recorrido iterativo con una pila, sin recursion: miles de niveles no dan RecursionError (r1, punto 3a)."""
    pila = [(valor, 1)] if isinstance(valor, (dict, list)) else []
    while pila:
        actual, nivel = pila.pop()
        if nivel > maximo:
            return True
        for hijo in (actual.values() if isinstance(actual, dict) else actual):
            if isinstance(hijo, (dict, list)):
                pila.append((hijo, nivel + 1))
    return False


def _leer_valor(body: Any) -> Any:
    if not isinstance(body, dict) or "valor" not in body:
        raise HTTPException(422, MENSAJE_SIN_VALOR)
    valor = body["valor"]
    # r1 (3a): antes que nada que serialice el valor. Con unos 1000 niveles se guardaba y la respuesta (y despues cada GET
    # sin prefijo de ese usuario) daba 500 por RecursionError.
    if pasa_de_niveles(valor):
        raise HTTPException(422, MENSAJE_PROFUNDIDAD)
    try:
        json.dumps(valor, allow_nan=False)  # json.loads acepta NaN e Infinity; la columna JSON de Postgres no (500)
    except ValueError:
        raise HTTPException(422, MENSAJE_VALOR_NO_JSON)
    try:
        tamano = tamano_en_bytes(valor)
    except UnicodeEncodeError:  # r1 (3b): un surrogate suelto ("\ud800") se lee como texto, pero no pasa a UTF-8
        raise HTTPException(422, MENSAJE_VALOR_NO_JSON)
    if tamano > LIMITE_BYTES:
        raise HTTPException(422, MENSAJE_TAMANO)
    return valor


@router.get("")
def ver_preferencias(prefijo: str = "", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(PreferenciaUsuario.clave, PreferenciaUsuario.valor).filter(PreferenciaUsuario.user_id == user.id)
    if prefijo:
        q = q.filter(PreferenciaUsuario.clave.startswith(prefijo, autoescape=True))
    filas = (q.order_by(PreferenciaUsuario.updated_at.desc(), PreferenciaUsuario.id.desc())
             .limit(MAXIMO_PREFERENCIAS).all())
    return {"status": "success", "data": {clave: valor for clave, valor in filas}}


@router.put("/{clave}")
def guardar_preferencia(clave: str, body: Any = Body(None), user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    _validar_clave(clave)
    valor = _leer_valor(body)
    # Upsert en una sola sentencia (INSERT ... ON CONFLICT DO UPDATE): dos PUT a la vez de la misma clave no chocan con
    # el UNIQUE (user_id, clave) y siempre queda una sola fila.
    sentencia = insert_pg(PreferenciaUsuario).values(user_id=user.id, clave=clave, valor=valor,
                                                     updated_at=datetime.utcnow())
    sentencia = sentencia.on_conflict_do_update(
        constraint=UNICO_USUARIO_CLAVE,
        set_={"valor": sentencia.excluded.valor, "updated_at": sentencia.excluded.updated_at},
    )
    db.execute(sentencia)
    db.commit()
    return {"status": "success", "data": {clave: valor}}
