"""fa2_003 - Endurecimiento profundo de rutas, secuencias, idempotencia y prorrateo (Fase 2)

Revision ID: fa2_003
Revises: fa2_002
Create Date: 2026-09-04 10:45:00.000000

Cambios:
1. Secuencias PostgreSQL para generacion concurrente de numeros:
   - shipment_number_seq
   - consolidation_number_seq
2. Normalizacion de ubicaciones y agencias:
   - FK logistics_location_id en shipments
   - FK logistics_location_id en consolidations
   - Seed de ubicaciones estandar si no existen (MIA_AGENCY_1, MIA_AGENCY_2, BOG_HUB, BAQ_MAIN, AMAZON_DIRECT)
   - Backfill compatible de logistics_location_id
3. Rutas explicitas en shipments:
   - route_type (VIA_MIAMI, DIRECT_TO_BARRANQUILLA) con check constraint
   - volume_cbm con check constraint >= 0
4. Idempotencia y control de concurrencia:
   - Indice funcional unico en shipments (lower(trim(carrier)), upper(trim(tracking_number)))
   - Indice unico parcial en shipment_events (shipment_id, idempotency_key) WHERE idempotency_key IS NOT NULL
5. Prorrateo completo y auditable:
   - Columnas allocation_method y allocation_base en consolidation_shipments
   - Columna last_allocation_method en consolidations
   - Check constraint en status de consolidations
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fa2_003'
down_revision = 'fa2_002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Secuencias concurrent-safe
    op.execute("CREATE SEQUENCE IF NOT EXISTS shipment_number_seq START WITH 1 INCREMENT BY 1;")
    op.execute("CREATE SEQUENCE IF NOT EXISTS consolidation_number_seq START WITH 1 INCREMENT BY 1;")
    op.execute("""
        DO $$
        DECLARE
            max_shp BIGINT := 0;
            max_con BIGINT := 0;
        BEGIN
            -- Determinar el mayor consecutivo de shipments considerando id y número formateado
            SELECT COALESCE(
                GREATEST(
                    (SELECT COALESCE(MAX(id), 0) FROM shipments),
                    (SELECT COALESCE(MAX(
                        CASE 
                            WHEN shipment_number ~ '^[A-Za-z0-9]+-[0-9]{4}([0-9]+)$' THEN 
                                (regexp_replace(shipment_number, '^[A-Za-z0-9]+-[0-9]{4}', ''))::bigint
                            WHEN shipment_number ~ '^[A-Za-z0-9]+-([0-9]+)$' THEN 
                                (regexp_replace(shipment_number, '^[A-Za-z0-9]+-', ''))::bigint
                            ELSE 0
                        END
                    ), 0) FROM shipments)
                ), 0
            ) INTO max_shp;

            IF max_shp > 0 THEN
                PERFORM setval('shipment_number_seq', max_shp, true);
            ELSE
                PERFORM setval('shipment_number_seq', 1, false);
            END IF;

            -- Determinar el mayor consecutivo de consolidations
            SELECT COALESCE(
                GREATEST(
                    (SELECT COALESCE(MAX(id), 0) FROM consolidations),
                    (SELECT COALESCE(MAX(
                        CASE 
                            WHEN consolidation_number ~ '^[A-Za-z0-9]+-[0-9]{4}([0-9]+)$' THEN 
                                (regexp_replace(consolidation_number, '^[A-Za-z0-9]+-[0-9]{4}', ''))::bigint
                            WHEN consolidation_number ~ '^[A-Za-z0-9]+-([0-9]+)$' THEN 
                                (regexp_replace(consolidation_number, '^[A-Za-z0-9]+-', ''))::bigint
                            ELSE 0
                        END
                    ), 0) FROM consolidations)
                ), 0
            ) INTO max_con;

            IF max_con > 0 THEN
                PERFORM setval('consolidation_number_seq', max_con, true);
            ELSE
                PERFORM setval('consolidation_number_seq', 1, false);
            END IF;
        END $$;
    """)

    # 2. Columnas en shipments
    op.add_column('shipments', sa.Column('route_type', sa.String(length=50), nullable=False, server_default='VIA_MIAMI'))
    op.add_column('shipments', sa.Column('volume_cbm', sa.Numeric(precision=10, scale=4), nullable=True))
    op.add_column('shipments', sa.Column('logistics_location_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_shipments_logistics_location',
        'shipments', 'logistics_locations',
        ['logistics_location_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_index('ix_shipments_logistics_location_id', 'shipments', ['logistics_location_id'])

    op.create_check_constraint(
        'chk_shipment_route_type',
        'shipments',
        "route_type IN ('VIA_MIAMI', 'DIRECT_TO_BARRANQUILLA')"
    )
    op.create_check_constraint(
        'chk_shipment_volume_cbm',
        'shipments',
        'volume_cbm IS NULL OR volume_cbm >= 0'
    )

    # 3. Indice funcional unico en (lower(trim(carrier)), upper(trim(tracking_number)))
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_shipment_carrier_tracking
        ON shipments (lower(trim(carrier)), upper(trim(tracking_number)));
    """)

    # 4. Columnas en consolidations
    op.add_column('consolidations', sa.Column('logistics_location_id', sa.Integer(), nullable=True))
    op.add_column('consolidations', sa.Column('last_allocation_method', sa.String(length=50), nullable=True))
    op.create_foreign_key(
        'fk_consolidations_logistics_location',
        'consolidations', 'logistics_locations',
        ['logistics_location_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_index('ix_consolidations_logistics_location_id', 'consolidations', ['logistics_location_id'])
    op.create_check_constraint(
        'chk_consolidation_status',
        'consolidations',
        "status IN ('ABIERTA', 'CONSOLIDADA', 'EN_VUELO', 'EN_DIAN', 'LIBERADA', 'RECIBIDA_DESTINO', 'CERRADA')"
    )

    # 5. Columnas en consolidation_shipments
    op.add_column('consolidation_shipments', sa.Column('allocation_method', sa.String(length=50), nullable=True))
    op.add_column('consolidation_shipments', sa.Column('allocation_base', sa.Numeric(precision=14, scale=4), nullable=True))

    # 6. Indice unico parcial para idempotency_key en shipment_events
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_shipment_event_idempotency
        ON shipment_events (shipment_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL;
    """)

    # 7. Seed de ubicaciones estandar
    op.execute("""
        INSERT INTO logistics_locations (code, name, location_type, city, country, address, is_active, created_at)
        VALUES
            ('MIA_AGENCY_1', 'Miami Agency 1', 'AGENCY_MIAMI', 'Miami', 'USA', '8200 NW 27th St, Doral, FL 33122', true, NOW()),
            ('MIA_AGENCY_2', 'Miami Agency 2', 'AGENCY_MIAMI', 'Miami', 'USA', '1900 NW 97th Ave, Doral, FL 33172', true, NOW()),
            ('BOG_HUB', 'Bogota Domestic Hub', 'DOMESTIC_HUB', 'Bogota', 'Colombia', 'Calle 26 # 100-20, Bogota', true, NOW()),
            ('BAQ_MAIN', 'Barranquilla Central', 'BODEGA_LOCAL', 'Barranquilla', 'Colombia', 'Via 40 # 85-120, Barranquilla', true, NOW()),
            ('AMAZON_DIRECT', 'Amazon Direct Delivery', 'DIRECT_ROUTE', 'Barranquilla', 'Colombia', 'Despacho Directo Internacional', true, NOW())
        ON CONFLICT (code) DO UPDATE SET is_active = true;
    """)

    # 8. Backfill compatible de logistics_location_id
    op.execute("""
        UPDATE shipments s
        SET logistics_location_id = loc.id
        FROM logistics_locations loc
        WHERE s.logistics_location_id IS NULL AND loc.code = 'MIA_AGENCY_1';
    """)
    op.execute("""
        UPDATE consolidations c
        SET logistics_location_id = loc.id
        FROM logistics_locations loc
        WHERE c.logistics_location_id IS NULL AND loc.code = 'MIA_AGENCY_1';
    """)


def downgrade() -> None:
    # Revertir en orden inverso
    op.execute("DROP INDEX IF EXISTS uq_shipment_event_idempotency;")

    op.drop_column('consolidation_shipments', 'allocation_base')
    op.drop_column('consolidation_shipments', 'allocation_method')

    op.drop_constraint('chk_consolidation_status', 'consolidations', type_='check')
    op.drop_index('ix_consolidations_logistics_location_id', table_name='consolidations')
    op.drop_constraint('fk_consolidations_logistics_location', 'consolidations', type_='foreignkey')
    op.drop_column('consolidations', 'last_allocation_method')
    op.drop_column('consolidations', 'logistics_location_id')

    op.execute("DROP INDEX IF EXISTS uq_shipment_carrier_tracking;")
    op.drop_constraint('chk_shipment_volume_cbm', 'shipments', type_='check')
    op.drop_constraint('chk_shipment_route_type', 'shipments', type_='check')

    op.drop_index('ix_shipments_logistics_location_id', table_name='shipments')
    op.drop_constraint('fk_shipments_logistics_location', 'shipments', type_='foreignkey')
    op.drop_column('shipments', 'logistics_location_id')
    op.drop_column('shipments', 'volume_cbm')
    op.drop_column('shipments', 'route_type')

    op.execute("DROP SEQUENCE IF EXISTS shipment_number_seq;")
    op.execute("DROP SEQUENCE IF EXISTS consolidation_number_seq;")
