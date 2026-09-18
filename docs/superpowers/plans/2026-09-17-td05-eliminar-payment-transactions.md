# TD-05: Eliminar `payment_transactions` (código huérfano) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar la tabla `payment_transactions` y todo su código asociado (modelo ORM, schemas Pydantic, test), porque la investigación de la Fase C confirmó que nunca se conectó a ningún endpoint real y que `sale_order_payments` es la única fuente de verdad de pagos en uso.

**Architecture:** Eliminación pura, sin migración de datos: se agrega una migración Alembic que hace `DROP TABLE payment_transactions` (con `downgrade()` que la recrea idéntica, por si hace falta revertir), se retira el modelo/schemas/import muertos, y se reemplaza el test que manipulaba la tabla directamente por un test de regresión que confirma su ausencia. Ningún endpoint HTTP cambia de comportamiento porque ninguno usa esta tabla hoy.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest (entorno de test ya configurado en `backend/tests/conftest.py`, corre migraciones automáticamente vía la fixture `setup_test_db`).

**Spec:** `docs/audit/2026-09-17-fase-c-investigacion.md`, sección 1 (TD-05) — basado en la investigación de código real que confirmó cero escrituras/lecturas de `payment_transactions` fuera de tests.

## Global Constraints

- Rama de trabajo: `consolidacion-td05-payment-transactions`, creada desde `main` (no desde `security-hotfix-fase-a` ni `cleanup-fase-b-dead-code` — mantener independencia entre fases, tal como pide el roadmap).
- No tocar `sale_order_payments` ni `SaleOrderPayment` — quedan intactos, son la tabla canónica.
- **Gate obligatorio antes de desplegar a producción (fuera del alcance de este plan, acción manual del usuario):** confirmar con una consulta de solo lectura (`SELECT COUNT(*) FROM payment_transactions;`) en staging y en producción que la tabla está vacía, antes de fusionar esta rama a `main` real y desplegar. Si la tabla tiene filas reales, DETENERSE y decidir con el usuario qué hacer con esos datos antes de continuar — no asumir que están vacías solo porque los tests locales lo están.
- Si al momento de fusionar esta rama a `main` ya existe otra migración fusionada con `down_revision = "fa6_004"` (por ejemplo de la Fase C, ítem TD-03), actualizar el `down_revision` de la migración de este plan para que apunte a la nueva cabeza real (confirmar con `alembic heads` antes de fusionar) y volver a correr los tests antes de fusionar.

---

### Task 1: Migración Alembic — eliminar la tabla

**Files:**
- Create: `backend/alembic/versions/fa6_005_drop_payment_transactions.py`
- Test: `backend/tests/test_td05_payment_transactions_removed.py`

**Interfaces:**
- Consumes: nada de tareas anteriores (primera tarea del plan).
- Produces: la tabla `payment_transactions` deja de existir en cualquier base de datos donde se corra `alembic upgrade head`. Las tareas 2-4 dependen de que esta migración ya haya corrido (la fixture `setup_test_db` de `conftest.py` la corre automáticamente antes de cada sesión de tests).

- [ ] **Step 1: Escribir el test que falla primero**

Crear `backend/tests/test_td05_payment_transactions_removed.py`:

```python
"""
test_td05_payment_transactions_removed.py — TD-05: payment_transactions debe
haber sido eliminada (era código huérfano, nunca usado fuera de tests).
"""
from sqlalchemy import text


def test_payment_transactions_table_does_not_exist(db):
    row = db.execute(text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
        "WHERE table_name = 'payment_transactions')"
    )).scalar()
    assert row is False, "payment_transactions debería haber sido eliminada (TD-05)"


def test_payment_transaction_model_not_importable():
    import app.models.fase1b as fase1b_module
    assert not hasattr(fase1b_module, "PaymentTransaction"), (
        "El modelo PaymentTransaction debería haberse eliminado junto con la tabla"
    )
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `pytest tests/test_td05_payment_transactions_removed.py -v`
Expected: `test_payment_transactions_table_does_not_exist` FALLA (la tabla todavía existe), `test_payment_transaction_model_not_importable` FALLA (el modelo todavía existe).

- [ ] **Step 3: Escribir la migración**

Crear `backend/alembic/versions/fa6_005_drop_payment_transactions.py`:

```python
"""
fa6_005 - TD-05: eliminar payment_transactions (codigo huerfano)

La investigacion de la Fase C (2026-09-17) confirmo cero escrituras y cero
lecturas de esta tabla fuera de tests (SQL crudo directo). sale_order_payments
(Fase 4) es la unica fuente de verdad de pagos en uso real.

Elimina: payment_transactions

Revision ID: fa6_005
Revises: fa6_004
Create Date: 2026-09-17
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_005"
down_revision: Union[str, Sequence[str], None] = "fa6_004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS payment_transactions CASCADE"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS payment_transactions (
            id                SERIAL PRIMARY KEY,
            pxp_id            INTEGER NOT NULL REFERENCES payment_pendings(id) ON DELETE CASCADE,
            sale_order_id     INTEGER REFERENCES sale_orders(id) ON DELETE SET NULL,
            transaction_type  VARCHAR(20) NOT NULL,
            monto             NUMERIC(14,2) NOT NULL,
            moneda            VARCHAR(10) NOT NULL DEFAULT 'COP',
            metodo_pago       VARCHAR(50),
            referencia        VARCHAR(150),
            fecha_pago        DATE NOT NULL,
            user_name         VARCHAR(150),
            notas             TEXT,
            created_at        TIMESTAMP,
            is_reversed       BOOLEAN NOT NULL DEFAULT FALSE,
            reversed_by_id    INTEGER REFERENCES payment_transactions(id) ON DELETE SET NULL
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_pt_pxp_id ON payment_transactions(pxp_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_pt_sale_order ON payment_transactions(sale_order_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_pt_type ON payment_transactions(transaction_type)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_pt_fecha ON payment_transactions(fecha_pago)"
    ))
```

- [ ] **Step 4: Confirmar que la tabla ya no existe tras la migración**

Run: `pytest tests/test_td05_payment_transactions_removed.py::test_payment_transactions_table_does_not_exist -v`
Expected: PASS (la fixture `setup_test_db` corre `alembic upgrade head` automáticamente al inicio de la sesión de tests, aplicando `fa6_005`).

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/fa6_005_drop_payment_transactions.py backend/tests/test_td05_payment_transactions_removed.py
git commit -m "feat(td-05): agregar migracion para eliminar payment_transactions"
```

---

### Task 2: Eliminar el modelo ORM y su import

**Files:**
- Modify: `backend/app/models/fase1b.py:294-324` (eliminar la clase `PaymentTransaction` y el comentario de sección que la precede)
- Modify: `backend/app/models/__init__.py:13-24`

**Interfaces:**
- Consumes: nada nuevo (la tabla ya no existe desde Task 1).
- Produces: `app.models.fase1b` deja de exponer `PaymentTransaction`. Ningún otro módulo lo importa (confirmado por grep en la investigación previa), así que no hay consumidores que romper.

- [ ] **Step 1: Confirmar que el test de Task 1 sigue siendo la referencia de "debe fallar"**

Run: `pytest tests/test_td05_payment_transactions_removed.py::test_payment_transaction_model_not_importable -v`
Expected: FALLA todavía (el modelo sigue existiendo).

- [ ] **Step 2: Eliminar la clase del modelo**

En `backend/app/models/fase1b.py`, eliminar por completo estas líneas (incluyendo el comentario de sección, ya que solo aplicaba a esta clase):

```python
# ─────────────────────────────────────────────────────────────────────────────
# GRUPO 5: Transacciones de pago
# ─────────────────────────────────────────────────────────────────────────────

class PaymentTransaction(Base):
    """Transacción individual de pago ligada a un PaymentPending (PXP).

    Permite auditoría granular: cada anticipo, abono, saldo, devolución
    o reversión queda registrado como una fila independiente.
    """
    __tablename__ = "payment_transactions"

    id                = Column(Integer, primary_key=True, index=True)
    pxp_id            = Column(Integer, ForeignKey("payment_pendings.id", ondelete="CASCADE"), nullable=False)
    sale_order_id     = Column(Integer, ForeignKey("sale_orders.id", ondelete="SET NULL"), nullable=True)
    transaction_type  = Column(String(20), nullable=False)
    # ANTICIPO | ABONO | SALDO | DEVOLUCION | REVERSION
    monto             = Column(Numeric(14, 2), nullable=False)
    moneda            = Column(String(10), nullable=False, default="COP")
    metodo_pago       = Column(String(50), nullable=True)
    referencia        = Column(String(150), nullable=True)
    fecha_pago        = Column(Date, nullable=False)
    user_name         = Column(String(150), nullable=True)
    notas             = Column(Text, nullable=True)
    created_at        = Column(DateTime, default=_now)
    is_reversed       = Column(Boolean, nullable=False, default=False)
    reversed_by_id    = Column(Integer, ForeignKey("payment_transactions.id", ondelete="SET NULL"), nullable=True)

    pxp               = relationship("PaymentPending", foreign_keys=[pxp_id])
    sale_order        = relationship("SaleOrder", foreign_keys=[sale_order_id])
    reversed_by       = relationship("PaymentTransaction", remote_side=[id], foreign_keys=[reversed_by_id])
```

- [ ] **Step 3: Quitar el import en `models/__init__.py`**

En `backend/app/models/__init__.py`, dentro del bloque de import de Fase 1B (líneas 13-24), quitar la línea `PaymentTransaction,`:

```python
# Fase 1B — modelos normalizados
from app.models.fase1b import (
    CustomerRequestLine,
    SalesQuotationLine,
    SaleOrderLineErp,
    PurchaseOrderLine,
    ProcurementAllocation,
    GoodsReceiptLine,
    GoodsReceiptLineAllocation,
    InventoryOwnerBalance,
    InventoryReservation,
)
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `pytest tests/test_td05_payment_transactions_removed.py -v`
Expected: PASS (ambos tests).

- [ ] **Step 5: Correr la suite completa para descartar regresiones**

Run: `pytest tests/ -v`
Expected: mismo resultado que antes de esta tarea, sin nuevas fallas (ningún otro módulo importaba `PaymentTransaction`).

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/fase1b.py backend/app/models/__init__.py
git commit -m "feat(td-05): eliminar modelo ORM PaymentTransaction"
```

---

### Task 3: Eliminar los schemas Pydantic muertos

**Files:**
- Modify: `backend/app/api/v1/schemas_fase1b.py:266-322` (eliminar la sección completa "TRANSACCIONES DE PAGO")
- Test: `backend/tests/test_td05_payment_transactions_removed.py` (agregar un test más)

**Interfaces:**
- Consumes: nada de tareas anteriores directamente.
- Produces: `app.api.v1.schemas_fase1b` deja de exponer `TransactionTypeEnum`, `CreatePaymentTransactionBody`, `ReverseTransactionBody`, `PaymentTransactionOut`. Confirmado por grep que `ReverseTransactionBody` no se usa en ningún otro archivo del backend.

- [ ] **Step 1: Escribir el test que falla primero**

Agregar a `backend/tests/test_td05_payment_transactions_removed.py`:

```python
def test_payment_transaction_schemas_not_importable():
    import app.api.v1.schemas_fase1b as schemas_module
    for name in ("CreatePaymentTransactionBody", "PaymentTransactionOut", "ReverseTransactionBody", "TransactionTypeEnum"):
        assert not hasattr(schemas_module, name), f"{name} debería haberse eliminado junto con payment_transactions"
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `pytest tests/test_td05_payment_transactions_removed.py::test_payment_transaction_schemas_not_importable -v`
Expected: FALLA (los schemas todavía existen).

- [ ] **Step 3: Eliminar la sección de schemas**

En `backend/app/api/v1/schemas_fase1b.py`, eliminar por completo las líneas 266-322 (la sección `# TRANSACCIONES DE PAGO` completa, incluyendo `TransactionTypeEnum`, `CreatePaymentTransactionBody`, `ReverseTransactionBody`, `PaymentTransactionOut`).

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `pytest tests/test_td05_payment_transactions_removed.py -v`
Expected: PASS (los tres tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/schemas_fase1b.py backend/tests/test_td05_payment_transactions_removed.py
git commit -m "feat(td-05): eliminar schemas Pydantic de PaymentTransaction"
```

---

### Task 4: Retirar el test antiguo que manipulaba la tabla directamente

**Files:**
- Delete: `backend/tests/test_fase1b_payments.py`

**Interfaces:**
- Consumes: la tabla ya no existe (Task 1), así que este archivo fallaría en cada corrida si se dejara tal cual.
- Produces: ninguna otra tarea depende de este archivo.

- [ ] **Step 1: Confirmar que el archivo fallaría si se dejara**

Run: `pytest tests/test_fase1b_payments.py -v`
Expected: FALLA (los `INSERT INTO payment_transactions` fallan porque la tabla ya no existe desde Task 1) — esto confirma que es seguro y necesario eliminarlo, no solo una limpieza cosmética.

- [ ] **Step 2: Eliminar el archivo**

```bash
git rm backend/tests/test_fase1b_payments.py
```

- [ ] **Step 3: Correr la suite completa**

Run: `pytest tests/ -v`
Expected: todos los tests pasan (o el mismo resultado base que tenía el proyecto antes de este plan, sin fallas nuevas), y `test_fase1b_payments.py` ya no aparece en la colección de tests.

- [ ] **Step 4: Commit**

```bash
git commit -m "test(td-05): eliminar test_fase1b_payments.py (probaba tabla ya eliminada)"
```

---

### Task 5: Limpiar el import muerto de `SaleOrderPayment` en `chat.py`

**Files:**
- Modify: `backend/app/api/v1/chat.py:764`

**Interfaces:**
- Consumes: nada de las tareas anteriores — hallazgo lateral independiente, agrupado aquí por trivialidad y porque salió de la misma investigación.
- Produces: nada que otras tareas consuman.

- [ ] **Step 1: Confirmar que `SaleOrderPayment` no se usa en `chat.py` tras la línea de import**

Run: `grep -n "SaleOrderPayment" backend/app/api/v1/chat.py`
Expected: una sola coincidencia (la línea 764, el import). Si aparece una segunda coincidencia, DETENERSE — significa que sí se usa y este step no aplica.

- [ ] **Step 2: Quitar `SaleOrderPayment` de la línea de import**

En `backend/app/api/v1/chat.py:764`, cambiar:

```python
from app.models.fase4 import SalePackingSession, SaleOrderDelivery, SaleOrderReturn, SaleOrderPayment
```

por:

```python
from app.models.fase4 import SalePackingSession, SaleOrderDelivery, SaleOrderReturn
```

- [ ] **Step 3: Correr la suite completa**

Run: `pytest tests/ -v`
Expected: sin cambios respecto al resultado de la Task 4 (este import no tenía efecto en tiempo de ejecución).

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/chat.py
git commit -m "chore(td-05): eliminar import muerto de SaleOrderPayment en chat.py"
```

---

## Al completar todas las tareas

Seguir **superpowers:finishing-a-development-branch** para verificar tests finales y presentar opciones de fusión — con el recordatorio del Global Constraints de arriba: NO fusionar a la rama `main` real del usuario ni desplegar sin antes confirmar en staging/producción que `payment_transactions` está vacía.
