"""fa4_001 - Modelo canonico de ventas, pagos, empaque, entregas y devoluciones (Fase 4)

Revision ID: fa4_001
Revises: fa3_002
Create Date: 2026-09-05 18:00:00.000000

Cambios:
1. sale_orders:
   - Columnas para politica de pagos: anticipo_pct_snapshot, saldo_pct_snapshot, policy_exception_authorized_by, policy_exception_reason
   - Columnas para costo y rentabilidad: total_cost_cop, estimated_profit_cop, real_profit_cop, profit_is_estimated
   - Columnas para cancelacion: cancellation_reason, cancellation_authorized_by, cancelled_at
2. sale_order_lines_erp:
   - customer_id, tax_pct, modalidad, owner, quantity_reserved, quantity_delivered, quantity_cancelled, estado, cost_unit_cop_snapshot, price_unit_cop_snapshot, updated_at
   - Constraints CHECK para modalidad, owner y estado
3. sale_order_payments:
   - Libro transaccional de pagos de ventas (anticipos, abonos, pagos totales, saldos, devoluciones, reversiones, ajustes) con idempotencia y trazabilidad de reversiones.
4. sale_packing_sessions y sale_packing_items:
   - Zona de empaque operativa con agrupacion multiventas por cliente.
5. sale_order_deliveries y sale_order_delivery_lines:
   - Despacho y entregas con modalidades, transportadora, guia, reglas operativas e idempotencia.
6. sale_order_returns y sale_order_return_lines:
   - Devoluciones parciales/totales con resoluciones contables e inventario.
7. Secuencias para numeracion:
   - seq_emp, seq_ent, seq_dev, seq_pago.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "fa4_001"
down_revision: Union[str, Sequence[str], None] = "fa3_002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Secuencias para numeracion automatica
    conn.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS seq_emp START 1"))
    conn.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS seq_ent START 1"))
    conn.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS seq_dev START 1"))
    conn.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS seq_pago START 1"))

    # 2. Alterar sale_orders
    conn.execute(sa.text("""
        ALTER TABLE sale_orders
            ADD COLUMN IF NOT EXISTS anticipo_pct_snapshot NUMERIC(5, 2) NOT NULL DEFAULT 60.00,
            ADD COLUMN IF NOT EXISTS saldo_pct_snapshot NUMERIC(5, 2) NOT NULL DEFAULT 40.00,
            ADD COLUMN IF NOT EXISTS policy_exception_authorized_by VARCHAR(150),
            ADD COLUMN IF NOT EXISTS policy_exception_reason TEXT,
            ADD COLUMN IF NOT EXISTS total_cost_cop NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS estimated_profit_cop NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS real_profit_cop NUMERIC(14, 2),
            ADD COLUMN IF NOT EXISTS profit_is_estimated BOOLEAN NOT NULL DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
            ADD COLUMN IF NOT EXISTS cancellation_authorized_by VARCHAR(150),
            ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_sale_orders_estado ON sale_orders (estado)"))

    # 3. Alterar sale_order_lines_erp
    conn.execute(sa.text("""
        ALTER TABLE sale_order_lines_erp
            ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS tax_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS modalidad VARCHAR(30) NOT NULL DEFAULT 'POR_PEDIDO',
            ADD COLUMN IF NOT EXISTS owner VARCHAR(20) NOT NULL DEFAULT 'NEBULAE',
            ADD COLUMN IF NOT EXISTS quantity_reserved NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS quantity_delivered NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS quantity_cancelled NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS estado VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE',
            ADD COLUMN IF NOT EXISTS cost_unit_cop_snapshot NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS price_unit_cop_snapshot NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    """))

    # Backfill customer_id and price_unit_cop_snapshot on sale_order_lines_erp from parent sale_order
    conn.execute(sa.text("""
        UPDATE sale_order_lines_erp sol
        SET customer_id = so.customer_id,
            price_unit_cop_snapshot = sol.unit_price_cop
        FROM sale_orders so
        WHERE sol.so_id = so.id AND sol.customer_id IS NULL;
    """))

    # Add CHECK constraints on sale_order_lines_erp
    conn.execute(sa.text("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sol_modalidad') THEN
                ALTER TABLE sale_order_lines_erp
                    ADD CONSTRAINT chk_sol_modalidad CHECK (modalidad IN ('ENTREGA_INMEDIATA', 'POR_PEDIDO'));
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sol_owner') THEN
                ALTER TABLE sale_order_lines_erp
                    ADD CONSTRAINT chk_sol_owner CHECK (owner IN ('NEBULAE', 'MAU'));
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sol_estado') THEN
                ALTER TABLE sale_order_lines_erp
                    ADD CONSTRAINT chk_sol_estado CHECK (estado IN (
                        'PENDIENTE', 'PENDIENTE_COMPRA', 'PENDIENTE_RESERVA', 'ASIGNADA_COMPRA',
                        'PARCIALMENTE_DISPONIBLE', 'RESERVADA', 'LISTA_PARA_ENTREGA', 'ENTREGADA',
                        'CANCELADA', 'DEVUELTA_PARCIAL', 'DEVUELTA_TOTAL'
                    ));
            END IF;
        END $$;
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_sol_so_estado ON sale_order_lines_erp (so_id, estado)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_sol_sku_estado ON sale_order_lines_erp (sku_id, estado)"))

    # 4. Crear tabla sale_order_payments
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS sale_order_payments (
            id SERIAL PRIMARY KEY,
            sale_order_id INTEGER NOT NULL REFERENCES sale_orders(id) ON DELETE CASCADE,
            customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
            tipo VARCHAR(30) NOT NULL,
            monto NUMERIC(14, 2) NOT NULL,
            moneda VARCHAR(10) NOT NULL DEFAULT 'COP',
            metodo_pago VARCHAR(50),
            fecha DATE NOT NULL,
            referencia_bancaria VARCHAR(150),
            comprobante VARCHAR(255),
            usuario VARCHAR(150),
            idempotency_key VARCHAR(150) UNIQUE,
            estado VARCHAR(30) NOT NULL DEFAULT 'CONFIRMADO',
            reversed_payment_id INTEGER REFERENCES sale_order_payments(id) ON DELETE SET NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT chk_sop_tipo CHECK (tipo IN ('ANTICIPO', 'ABONO', 'PAGO_TOTAL', 'PAGO_SALDO', 'DEVOLUCION', 'REVERSION', 'AJUSTE_AUTORIZADO')),
            CONSTRAINT chk_sop_estado CHECK (estado IN ('CONFIRMADO', 'REVERTIDO', 'ANULADO')),
            CONSTRAINT chk_sop_monto CHECK (monto > 0)
        );
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_sop_so_estado ON sale_order_payments (sale_order_id, estado)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_sop_customer ON sale_order_payments (customer_id)"))

    # 5. Crear tabla sale_packing_sessions y sale_packing_items
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS sale_packing_sessions (
            id SERIAL PRIMARY KEY,
            numero VARCHAR(30) UNIQUE NOT NULL,
            customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
            status VARCHAR(30) NOT NULL DEFAULT 'EN_PROCESO',
            responsible_user VARCHAR(150),
            observations TEXT,
            incidents TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            completed_at TIMESTAMP,
            CONSTRAINT chk_packing_status CHECK (status IN ('EN_PROCESO', 'LISTO_DESPACHO', 'DESPACHADO', 'CANCELADO'))
        );
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_packing_customer ON sale_packing_sessions (customer_id)"))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS sale_packing_items (
            id SERIAL PRIMARY KEY,
            packing_id INTEGER NOT NULL REFERENCES sale_packing_sessions(id) ON DELETE CASCADE,
            sale_order_id INTEGER NOT NULL REFERENCES sale_orders(id) ON DELETE RESTRICT,
            sale_order_line_id INTEGER NOT NULL REFERENCES sale_order_lines_erp(id) ON DELETE RESTRICT,
            sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,
            quantity NUMERIC(10, 2) NOT NULL,
            verified_quantity NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
            status VARCHAR(30) NOT NULL DEFAULT 'EMPACADO',
            notes TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT chk_pack_item_qty CHECK (quantity > 0),
            CONSTRAINT chk_pack_item_vqty CHECK (verified_quantity >= 0),
            CONSTRAINT chk_pack_item_status CHECK (status IN ('PENDIENTE', 'EMPACADO', 'INCIDENCIA'))
        );
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_pack_items_line ON sale_packing_items (sale_order_line_id)"))

    # 6. Crear tabla sale_order_deliveries y sale_order_delivery_lines
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS sale_order_deliveries (
            id SERIAL PRIMARY KEY,
            numero VARCHAR(30) UNIQUE NOT NULL,
            customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
            delivery_method VARCHAR(50) NOT NULL,
            address_snapshot VARCHAR(300),
            city VARCHAR(100),
            phone VARCHAR(50),
            carrier VARCHAR(100),
            tracking_number VARCHAR(150),
            shipping_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
            shipping_paid_by VARCHAR(20) NOT NULL DEFAULT 'CLIENTE',
            scheduled_date TIMESTAMP,
            dispatch_date TIMESTAMP,
            delivery_date TIMESTAMP,
            evidence_url TEXT,
            observations TEXT,
            status VARCHAR(30) NOT NULL DEFAULT 'BORRADOR',
            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
            packing_id INTEGER REFERENCES sale_packing_sessions(id) ON DELETE SET NULL,
            idempotency_key VARCHAR(150) UNIQUE,
            policy_warning TEXT,
            policy_authorized_by VARCHAR(150),
            created_by VARCHAR(150),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT chk_deliv_method CHECK (delivery_method IN ('RECOGIDA_BARRANQUILLA', 'ENTREGA_LOCAL', 'ENVIO_NACIONAL', 'PORTERIA', 'OTRO')),
            CONSTRAINT chk_deliv_paidby CHECK (shipping_paid_by IN ('CLIENTE', 'EMPRESA')),
            CONSTRAINT chk_deliv_status CHECK (status IN ('BORRADOR', 'PREPARANDO', 'DESPACHADO', 'EN_TRANSITO', 'ENTREGADO', 'INCIDENCIA', 'DEVUELTO', 'CANCELADO'))
        );
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_deliv_customer ON sale_order_deliveries (customer_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_deliv_status ON sale_order_deliveries (status)"))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS sale_order_delivery_lines (
            id SERIAL PRIMARY KEY,
            delivery_id INTEGER NOT NULL REFERENCES sale_order_deliveries(id) ON DELETE CASCADE,
            sale_order_id INTEGER NOT NULL REFERENCES sale_orders(id) ON DELETE RESTRICT,
            sale_order_line_id INTEGER NOT NULL REFERENCES sale_order_lines_erp(id) ON DELETE RESTRICT,
            sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,
            quantity NUMERIC(10, 2) NOT NULL,
            owner VARCHAR(20) NOT NULL DEFAULT 'NEBULAE',
            created_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT chk_deliv_line_qty CHECK (quantity > 0),
            CONSTRAINT chk_deliv_line_owner CHECK (owner IN ('NEBULAE', 'MAU'))
        );
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_deliv_lines_line ON sale_order_delivery_lines (sale_order_line_id)"))

    # 7. Crear tabla sale_order_returns y sale_order_return_lines
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS sale_order_returns (
            id SERIAL PRIMARY KEY,
            numero VARCHAR(30) UNIQUE NOT NULL,
            sale_order_id INTEGER NOT NULL REFERENCES sale_orders(id) ON DELETE RESTRICT,
            delivery_id INTEGER REFERENCES sale_order_deliveries(id) ON DELETE SET NULL,
            customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
            financial_resolution VARCHAR(50) NOT NULL,
            refund_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
            status VARCHAR(30) NOT NULL DEFAULT 'PROCESADA',
            reason TEXT,
            evidence_url TEXT,
            authorized_by VARCHAR(150),
            idempotency_key VARCHAR(150) UNIQUE,
            created_by VARCHAR(150),
            created_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT chk_ret_fin_res CHECK (financial_resolution IN ('DEVOLUCION_DINERO', 'SALDO_A_FAVOR', 'SIN_DEVOLUCION_DINERO')),
            CONSTRAINT chk_ret_status CHECK (status IN ('REGISTRADA', 'PROCESADA', 'CANCELADA'))
        );
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_ret_order ON sale_order_returns (sale_order_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_ret_customer ON sale_order_returns (customer_id)"))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS sale_order_return_lines (
            id SERIAL PRIMARY KEY,
            return_id INTEGER NOT NULL REFERENCES sale_order_returns(id) ON DELETE CASCADE,
            sale_order_line_id INTEGER NOT NULL REFERENCES sale_order_lines_erp(id) ON DELETE RESTRICT,
            sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE RESTRICT,
            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
            quantity NUMERIC(10, 2) NOT NULL,
            inventory_resolution VARCHAR(30) NOT NULL,
            product_condition VARCHAR(50) NOT NULL,
            owner VARCHAR(20) NOT NULL DEFAULT 'NEBULAE',
            quarantine_id INTEGER REFERENCES inventory_quarantine(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT chk_ret_line_qty CHECK (quantity > 0),
            CONSTRAINT chk_ret_line_inv_res CHECK (inventory_resolution IN ('REINTEGRAR_STOCK', 'CUARENTENA', 'DESTRUIDO', 'DEVOLVER_PROVEEDOR')),
            CONSTRAINT chk_ret_line_cond CHECK (product_condition IN ('NUEVO_SELLADO', 'ABIERTO_BUENO', 'DEFECTUOSO', 'DAÑADO')),
            CONSTRAINT chk_ret_line_owner CHECK (owner IN ('NEBULAE', 'MAU'))
        );
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_ret_lines_line ON sale_order_return_lines (sale_order_line_id)"))


def downgrade() -> None:
    conn = op.get_bind()

    # Eliminar tablas en orden inverso respetando FKs
    conn.execute(sa.text("DROP TABLE IF EXISTS sale_order_return_lines CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS sale_order_returns CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS sale_order_delivery_lines CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS sale_order_deliveries CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS sale_packing_items CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS sale_packing_sessions CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS sale_order_payments CASCADE"))

    # Eliminar constraints e indices agregados a sale_order_lines_erp
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_sol_so_estado"))
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_sol_sku_estado"))
    conn.execute(sa.text("ALTER TABLE sale_order_lines_erp DROP CONSTRAINT IF EXISTS chk_sol_modalidad"))
    conn.execute(sa.text("ALTER TABLE sale_order_lines_erp DROP CONSTRAINT IF EXISTS chk_sol_owner"))
    conn.execute(sa.text("ALTER TABLE sale_order_lines_erp DROP CONSTRAINT IF EXISTS chk_sol_estado"))

    # Eliminar columnas agregadas a sale_order_lines_erp
    conn.execute(sa.text("""
        ALTER TABLE sale_order_lines_erp
            DROP COLUMN IF EXISTS customer_id,
            DROP COLUMN IF EXISTS tax_pct,
            DROP COLUMN IF EXISTS modalidad,
            DROP COLUMN IF EXISTS owner,
            DROP COLUMN IF EXISTS quantity_reserved,
            DROP COLUMN IF EXISTS quantity_delivered,
            DROP COLUMN IF EXISTS quantity_cancelled,
            DROP COLUMN IF EXISTS estado,
            DROP COLUMN IF EXISTS cost_unit_cop_snapshot,
            DROP COLUMN IF EXISTS price_unit_cop_snapshot,
            DROP COLUMN IF EXISTS updated_at;
    """))

    # Eliminar indices y columnas agregadas a sale_orders
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_sale_orders_estado"))
    conn.execute(sa.text("""
        ALTER TABLE sale_orders
            DROP COLUMN IF EXISTS anticipo_pct_snapshot,
            DROP COLUMN IF EXISTS saldo_pct_snapshot,
            DROP COLUMN IF EXISTS policy_exception_authorized_by,
            DROP COLUMN IF EXISTS policy_exception_reason,
            DROP COLUMN IF EXISTS total_cost_cop,
            DROP COLUMN IF EXISTS estimated_profit_cop,
            DROP COLUMN IF EXISTS real_profit_cop,
            DROP COLUMN IF EXISTS profit_is_estimated,
            DROP COLUMN IF EXISTS cancellation_reason,
            DROP COLUMN IF EXISTS cancellation_authorized_by,
            DROP COLUMN IF EXISTS cancelled_at;
    """))

    # Eliminar secuencias
    conn.execute(sa.text("DROP SEQUENCE IF EXISTS seq_emp"))
    conn.execute(sa.text("DROP SEQUENCE IF EXISTS seq_ent"))
    conn.execute(sa.text("DROP SEQUENCE IF EXISTS seq_dev"))
    conn.execute(sa.text("DROP SEQUENCE IF EXISTS seq_pago"))
