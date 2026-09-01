"""
Run to create all new ERP tables in the remote PostgreSQL DB.
Usage: python migrate_erp_v2.py
"""
import psycopg2

DB_URL = "postgresql://nebulae:[REDACTED_PASSWORD]@[REDACTED_HOST]:[REDACTED_PORT]/erpdb"

SQL = """
-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    reference VARCHAR(100),
    contact_name VARCHAR(150),
    phone VARCHAR(50),
    email VARCHAR(150),
    address VARCHAR(300),
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'Colombia',
    payment_terms VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Customer Requests (SC)
CREATE TABLE IF NOT EXISTS customer_requests (
    id SERIAL PRIMARY KEY,
    numero VARCHAR(20) UNIQUE NOT NULL,
    customer_id INTEGER REFERENCES customers(id),
    customer_name VARCHAR(200),
    customer_phone VARCHAR(50),
    customer_email VARCHAR(150),
    customer_address VARCHAR(300),
    advisor_name VARCHAR(150),
    modalidad_pago VARCHAR(100) DEFAULT 'Contado',
    estado VARCHAR(50) NOT NULL DEFAULT 'BORRADOR',
    fecha_solicitud TIMESTAMP DEFAULT NOW(),
    fecha_vencimiento TIMESTAMP,
    notas TEXT,
    productos JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(150)
);

-- Sales Quotations (COT)
CREATE TABLE IF NOT EXISTS sales_quotations (
    id SERIAL PRIMARY KEY,
    numero VARCHAR(20) UNIQUE NOT NULL,
    sc_id INTEGER REFERENCES customer_requests(id),
    sc_numero VARCHAR(20),
    customer_id INTEGER REFERENCES customers(id),
    customer_name VARCHAR(200),
    customer_phone VARCHAR(50),
    customer_email VARCHAR(150),
    customer_address VARCHAR(300),
    cotizador VARCHAR(150),
    direccion_entrega VARCHAR(300),
    trm_rate NUMERIC(10,2),
    subtotal_cop NUMERIC(14,2) DEFAULT 0,
    descuento_pct NUMERIC(5,2) DEFAULT 0,
    total_cop NUMERIC(14,2) DEFAULT 0,
    anticipo_cop NUMERIC(14,2) DEFAULT 0,
    estado VARCHAR(50) NOT NULL DEFAULT 'BORRADOR',
    fecha_cotizacion TIMESTAMP DEFAULT NOW(),
    fecha_entrega_estimada TIMESTAMP,
    notas TEXT,
    productos JSONB DEFAULT '[]',
    pec_id INTEGER,
    pec_numero VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(150)
);

-- Sale Orders (VEN)
CREATE TABLE IF NOT EXISTS sale_orders (
    id SERIAL PRIMARY KEY,
    numero VARCHAR(20) UNIQUE NOT NULL,
    sc_id INTEGER REFERENCES customer_requests(id),
    sc_numero VARCHAR(20),
    cot_id INTEGER REFERENCES sales_quotations(id),
    cot_numero VARCHAR(20),
    customer_id INTEGER REFERENCES customers(id),
    customer_name VARCHAR(200),
    customer_phone VARCHAR(50),
    customer_email VARCHAR(150),
    customer_address VARCHAR(300),
    direccion_entrega VARCHAR(300),
    fecha_cotizacion TIMESTAMP,
    fecha_entrega_estimada TIMESTAMP,
    trm_rate NUMERIC(10,2),
    subtotal_cop NUMERIC(14,2) DEFAULT 0,
    descuento_pct NUMERIC(5,2) DEFAULT 0,
    total_cop NUMERIC(14,2) DEFAULT 0,
    anticipo_cop NUMERIC(14,2) DEFAULT 0,
    saldo_cop NUMERIC(14,2) DEFAULT 0,
    estado VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE_COMPRA',
    notas TEXT,
    productos JSONB DEFAULT '[]',
    pec_id INTEGER,
    pec_numero VARCHAR(20),
    pxp_id INTEGER,
    pxp_numero VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(150)
);

-- Payment Pendings (PXP)
CREATE TABLE IF NOT EXISTS payment_pendings (
    id SERIAL PRIMARY KEY,
    numero VARCHAR(20) UNIQUE NOT NULL,
    ven_id INTEGER NOT NULL REFERENCES sale_orders(id),
    ven_numero VARCHAR(20),
    customer_id INTEGER REFERENCES customers(id),
    customer_name VARCHAR(200),
    monto_total NUMERIC(14,2) DEFAULT 0,
    monto_anticipo NUMERIC(14,2) DEFAULT 0,
    monto_pendiente NUMERIC(14,2) DEFAULT 0,
    estado VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE',
    fecha_creacion TIMESTAMP DEFAULT NOW(),
    fecha_pago TIMESTAMP,
    notas TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Purchase Orders Full (PEC)
CREATE TABLE IF NOT EXISTS purchase_orders_full (
    id SERIAL PRIMARY KEY,
    numero VARCHAR(20) UNIQUE NOT NULL,
    supplier_id INTEGER REFERENCES suppliers(id),
    supplier_name VARCHAR(200),
    supplier_ref VARCHAR(100),
    ven_id INTEGER,
    ven_numero VARCHAR(20),
    modalidad_pago VARCHAR(100) DEFAULT 'Contado',
    metodo_pago VARCHAR(100),
    warehouse_id INTEGER REFERENCES warehouses(id),
    carrier VARCHAR(150),
    tracking_number VARCHAR(200),
    tracking_stages JSONB DEFAULT '[]',
    estado VARCHAR(50) NOT NULL DEFAULT 'BORRADOR',
    fecha_compra TIMESTAMP DEFAULT NOW(),
    fecha_entrega_estimada TIMESTAMP,
    fecha_alerta TIMESTAMP,
    subtotal_cop NUMERIC(14,2) DEFAULT 0,
    total_cop NUMERIC(14,2) DEFAULT 0,
    notas TEXT,
    productos JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(150)
);

-- Goods Receipts (ENINV)
CREATE TABLE IF NOT EXISTS goods_receipts (
    id SERIAL PRIMARY KEY,
    numero VARCHAR(20) UNIQUE NOT NULL,
    pec_id INTEGER REFERENCES purchase_orders_full(id),
    pec_numero VARCHAR(20),
    supplier_id INTEGER REFERENCES suppliers(id),
    supplier_name VARCHAR(200),
    warehouse_id INTEGER REFERENCES warehouses(id),
    warehouse_name VARCHAR(200),
    carrier VARCHAR(150),
    tracking_number VARCHAR(200),
    operacion_tipo VARCHAR(50) DEFAULT 'RECEPCION',
    estado VARCHAR(50) NOT NULL DEFAULT 'BORRADOR',
    fecha_recepcion TIMESTAMP DEFAULT NOW(),
    notas TEXT,
    productos JSONB DEFAULT '[]',
    stock_actualizado BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by VARCHAR(150)
);

-- Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL,
    entity_id INTEGER NOT NULL,
    entity_numero VARCHAR(30),
    action VARCHAR(100) NOT NULL,
    description TEXT,
    old_estado VARCHAR(50),
    new_estado VARCHAR(50),
    user_name VARCHAR(150),
    created_at TIMESTAMP DEFAULT NOW(),
    extra_data JSONB
);

-- Sequences for numbering
CREATE SEQUENCE IF NOT EXISTS seq_sc    START 1;
CREATE SEQUENCE IF NOT EXISTS seq_cot   START 1;
CREATE SEQUENCE IF NOT EXISTS seq_ven   START 1;
CREATE SEQUENCE IF NOT EXISTS seq_pec   START 1;
CREATE SEQUENCE IF NOT EXISTS seq_eninv START 1;
CREATE SEQUENCE IF NOT EXISTS seq_pxp   START 1;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cr_customer  ON customer_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_cr_estado    ON customer_requests(estado);
CREATE INDEX IF NOT EXISTS idx_sq_sc        ON sales_quotations(sc_id);
CREATE INDEX IF NOT EXISTS idx_sq_estado    ON sales_quotations(estado);
CREATE INDEX IF NOT EXISTS idx_so_cot       ON sale_orders(cot_id);
CREATE INDEX IF NOT EXISTS idx_so_estado    ON sale_orders(estado);
CREATE INDEX IF NOT EXISTS idx_pof_supplier ON purchase_orders_full(supplier_id);
CREATE INDEX IF NOT EXISTS idx_pof_estado   ON purchase_orders_full(estado);
CREATE INDEX IF NOT EXISTS idx_gr_pec       ON goods_receipts(pec_id);
CREATE INDEX IF NOT EXISTS idx_al_entity    ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_al_created   ON activity_logs(created_at DESC);

-- Add track_inventory and more fields to products if not exists
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS auto_replenish BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reference VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode_product VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_name VARCHAR(200);
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ecommerce_category VARCHAR(200);
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_alert INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(8,3);
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);

-- Warehouses: add address, type details
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS address VARCHAR(300);
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS manager VARCHAR(150);
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
"""

print("Connecting to DB...")
conn = psycopg2.connect(DB_URL, connect_timeout=30)
conn.autocommit = True
cur = conn.cursor()

# Execute each statement separately (split on double newline + --)
statements = [s.strip() for s in SQL.split(";") if s.strip()]
ok = 0
for stmt in statements:
    if not stmt.strip():
        continue
    try:
        cur.execute(stmt)
        ok += 1
    except Exception as e:
        if "already exists" in str(e).lower():
            ok += 1
        else:
            print(f"  WARN: {str(e)[:100]} | stmt: {stmt[:80]}")

print(f"Migration done. {ok}/{len(statements)} statements OK.")
cur.close()
conn.close()
