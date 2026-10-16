"""Bloque 3, Tarea 2 (RP17): helper único de admin_config (backend/app/core/admin_config.py).

- leer_config(db, claves) -> {clave: valor} de las claves que existen, con UN solo SELECT parametrizado.
- config_entero(db, clave, defecto, minimo, maximo): un valor que no es entero usa el defecto; uno fuera de rango, el
  límite (R13; es el _config_entero de U22-validez que T7 consume de aquí).
- guardar_config(db, cambios): el upsert ON CONFLICT parametrizado de update_config; None borra la clave. No hace commit:
  lo confirma quien llama (junto con su renglón de Actividad).

Correr SOLO con el runner de ROLLBACK (admin_config no se trunca):  python tests/rollback_runner.py test_admin_config
"""
from sqlalchemy import text

CLAVE_A = "b3t2_prueba_a"
CLAVE_B = "b3t2_prueba_b"
CLAVE_RARA = "b3t2_prueba_o'brien"


def _poner(db, clave, valor):
    db.execute(text("INSERT INTO admin_config (key, value, updated_at) VALUES (:k, :v, NOW()) "
                    "ON CONFLICT (key) DO UPDATE SET value = :v, updated_at = NOW()"), {"k": clave, "v": valor})
    db.commit()


def _valor(db, clave):
    fila = db.execute(text("SELECT value FROM admin_config WHERE key = :k"), {"k": clave}).fetchone()
    return None if fila is None else fila[0]


def test_leer_config_trae_solo_las_claves_que_existen_en_una_consulta(db, contador_sql):
    from app.core.admin_config import leer_config
    db.execute(text("DELETE FROM admin_config WHERE key IN (:a, :b)"), {"a": CLAVE_A, "b": CLAVE_B})
    _poner(db, CLAVE_A, "uno")
    contador_sql.reset()
    assert leer_config(db, [CLAVE_A, CLAVE_B]) == {CLAVE_A: "uno"}
    assert contador_sql.consultas == 1
    assert contador_sql.commits == 0
    assert leer_config(db, []) == {}
    assert leer_config(db, (CLAVE_A,)) == {CLAVE_A: "uno"}  # cualquier iterable de claves


def test_entero_acotado_es_puro_y_acota_como_r13():
    from app.core.admin_config import entero_acotado
    casos = [
        (None, 5), ("", 5), ("abc", 5), ("5.5", 5), ("  ", 5),
        ("0", 1), ("-3", 1), ("1", 1), ("7", 7), (" 7 ", 7), ("60", 60), ("500", 60), (12, 12),
        (True, 5),  # un bool no es un número de días
    ]
    for valor, esperado in casos:
        assert entero_acotado(valor, 5, 1, 60) == esperado, (valor, esperado)


def test_config_entero_lee_y_acota(db):
    """Prueba 3 de U22-validez (T7 la cumple con este helper): 'abc' -> 5, '0' -> 1, '500' -> 60, ausente -> 5."""
    from app.core.admin_config import config_entero
    db.execute(text("DELETE FROM admin_config WHERE key = :k"), {"k": CLAVE_A})
    db.commit()
    assert config_entero(db, CLAVE_A, 5, 1, 60) == 5
    for guardado, esperado in (("abc", 5), ("0", 1), ("500", 60), ("12", 12)):
        _poner(db, CLAVE_A, guardado)
        assert config_entero(db, CLAVE_A, 5, 1, 60) == esperado, guardado


def test_guardar_config_hace_upsert_borra_con_none_y_no_confirma(db, contador_sql):
    from app.core.admin_config import guardar_config, leer_config
    db.execute(text("DELETE FROM admin_config WHERE key IN (:a, :b, :c)"), {"a": CLAVE_A, "b": CLAVE_B, "c": CLAVE_RARA})
    _poner(db, CLAVE_B, "viejo")
    contador_sql.reset()
    guardar_config(db, {CLAVE_A: "nuevo", CLAVE_B: None, CLAVE_RARA: "valor con ' comilla"})
    assert contador_sql.commits == 0  # lo confirma quien llama
    assert _valor(db, CLAVE_A) == "nuevo"
    assert _valor(db, CLAVE_B) is None  # None borra la clave (vuelve a su valor por defecto)
    assert _valor(db, CLAVE_RARA) == "valor con ' comilla"  # parametrizado: la comilla no rompe nada
    guardar_config(db, {CLAVE_A: 15})  # un valor que no es texto se guarda como texto, igual que update_config
    assert leer_config(db, [CLAVE_A]) == {CLAVE_A: "15"}
    guardar_config(db, {})  # sin cambios no hace nada


def test_claves_existentes_no_lee_los_valores(db, contador_sql):
    """r2: claves_existentes dice qué claves hay sin traer sus valores (el logo pesa hasta ~400 KB): un SELECT de key."""
    from app.core.admin_config import claves_existentes
    db.execute(text("DELETE FROM admin_config WHERE key IN (:a, :b)"), {"a": CLAVE_A, "b": CLAVE_B})
    _poner(db, CLAVE_A, "x" * 1000)
    contador_sql.reset()
    assert claves_existentes(db, [CLAVE_A, CLAVE_B]) == {CLAVE_A}
    assert contador_sql.consultas == 1 and contador_sql.commits == 0
    assert "value" not in contador_sql.sentencias[0]
    assert claves_existentes(db, []) == set()
