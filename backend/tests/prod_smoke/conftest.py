# conftest.py — aislado: NO hereda fixtures de sesión del conftest global.
# Este directorio tiene su propio conftest vacío para que pytest NO ejecute
# el conftest de tests/ (que intenta alembic upgrade head en erp_test).
