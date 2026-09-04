"""
test_fase1b_payments.py — Tests de transacciones de pago

Escenarios:
1. Anticipo, abono y saldo registrados como transacciones individuales
2. Devolución marcada como DEVOLUCION
3. Reversión de transacción existente
4. Auditía: registro de usuario y fecha
5. Validación Pydantic: monto negativo rechazado
6. Validación Pydantic: moneda inválida rechazada
"""
import uuid
import pytest
from decimal import Decimal
from datetime import date, datetime
from sqlalchemy import text


class TestPaymentTransactions:
    """Transacciones de pago granulares."""

    def _create_pxp_and_so(self, db, user_id=None):
        """Crea un PXP y un SaleOrder mínimos para tests de pagos."""
        so = db.execute(text(
            "INSERT INTO sale_orders (numero,sc_numero,cot_numero,estado,total_cop,anticipo_cop,saldo_cop,productos) "
            "VALUES (:n,'','','PENDIENTE_COMPRA',500000,0,500000,'[]') RETURNING id"
        ), {"n": f"VEN-PAY-{uuid.uuid4().hex[:8].upper()}"}).fetchone()

        pxp = db.execute(text(
            "INSERT INTO payment_pendings (numero,ven_id,ven_numero,monto_total,monto_anticipo,"
            "monto_pendiente,estado,fecha_creacion,created_at,updated_at) "
            "VALUES (:n,:so_id,'VEN-TEST',500000,0,500000,'PENDIENTE',NOW(),NOW(),NOW()) RETURNING id"
        ), {"n": f"PXP-{uuid.uuid4().hex[:8].upper()}", "so_id": so[0]}).fetchone()
        db.commit()
        return pxp[0], so[0]

    def test_anticipo_registro(self, db):
        pxp_id, so_id = self._create_pxp_and_so(db)
        db.execute(text(
            "INSERT INTO payment_transactions "
            "(pxp_id,sale_order_id,transaction_type,monto,moneda,metodo_pago,referencia,"
            " fecha_pago,user_name,notas,created_at,is_reversed) "
            "VALUES (:pxp,:so,'ANTICIPO',100000,'COP','Transferencia','REF-001',"
            " CURRENT_DATE,'TestUser','Anticipo inicial',NOW(),FALSE)"
        ), {"pxp": pxp_id, "so": so_id})
        db.commit()

        row = db.execute(text(
            "SELECT transaction_type, monto, moneda, is_reversed "
            "FROM payment_transactions WHERE pxp_id = :pxp AND transaction_type='ANTICIPO'"
        ), {"pxp": pxp_id}).fetchone()
        assert row is not None, "Transacción ANTICIPO debe existir"
        assert row[0] == "ANTICIPO"
        assert row[1] == 100000
        assert row[2] == "COP"
        assert row[3] == False

    def test_abono_y_saldo(self, db):
        pxp_id, so_id = self._create_pxp_and_so(db)
        for t_type, amount in [("ABONO", 200000), ("SALDO", 300000)]:
            db.execute(text(
                "INSERT INTO payment_transactions "
                "(pxp_id,sale_order_id,transaction_type,monto,moneda,"
                " fecha_pago,user_name,created_at,is_reversed) "
                "VALUES (:pxp,:so,:tt,:amt,'COP',CURRENT_DATE,'TestUser',NOW(),FALSE)"
            ), {"pxp": pxp_id, "so": so_id, "tt": t_type, "amt": amount})
        db.commit()

        total = db.execute(text(
            "SELECT SUM(monto) FROM payment_transactions WHERE pxp_id=:pxp"
        ), {"pxp": pxp_id}).scalar()
        assert total == 500000, f"Total de transacciones debe ser 500000, es {total}"

    def test_devolucion(self, db):
        pxp_id, so_id = self._create_pxp_and_so(db)
        original_id = db.execute(text(
            "INSERT INTO payment_transactions "
            "(pxp_id,sale_order_id,transaction_type,monto,moneda,"
            " fecha_pago,user_name,created_at,is_reversed) "
            "VALUES (:pxp,:so,'ANTICIPO',100000,'COP',CURRENT_DATE,'User1',NOW(),FALSE) RETURNING id"
        ), {"pxp": pxp_id, "so": so_id}).fetchone()[0]
        db.commit()

        # Registrar devolución
        dev_id = db.execute(text(
            "INSERT INTO payment_transactions "
            "(pxp_id,sale_order_id,transaction_type,monto,moneda,"
            " fecha_pago,user_name,created_at,is_reversed) "
            "VALUES (:pxp,:so,'DEVOLUCION',100000,'COP',CURRENT_DATE,'User1',NOW(),FALSE) RETURNING id"
        ), {"pxp": pxp_id, "so": so_id}).fetchone()[0]

        # Marcar la original como revertida
        db.execute(text(
            "UPDATE payment_transactions SET is_reversed=TRUE, reversed_by_id=:dev_id WHERE id=:orig_id"
        ), {"dev_id": dev_id, "orig_id": original_id})
        db.commit()

        orig = db.execute(text(
            "SELECT is_reversed, reversed_by_id FROM payment_transactions WHERE id=:id"
        ), {"id": original_id}).fetchone()
        assert orig[0] == True, "La transacción original debe estar marcada como revertida"
        assert orig[1] == dev_id, "reversed_by_id debe apuntar a la devolución"

    def test_audit_fields_recorded(self, db):
        pxp_id, so_id = self._create_pxp_and_so(db)
        test_user = "AuditorTest"
        test_ref = f"REF-{uuid.uuid4().hex[:8].upper()}"

        db.execute(text(
            "INSERT INTO payment_transactions "
            "(pxp_id,sale_order_id,transaction_type,monto,moneda,referencia,"
            " fecha_pago,user_name,created_at,is_reversed) "
            "VALUES (:pxp,:so,'ABONO',50000,'COP',:ref,CURRENT_DATE,:user,NOW(),FALSE)"
        ), {"pxp": pxp_id, "so": so_id, "ref": test_ref, "user": test_user})
        db.commit()

        row = db.execute(text(
            "SELECT user_name, referencia, created_at FROM payment_transactions "
            "WHERE pxp_id=:pxp AND transaction_type='ABONO'"
        ), {"pxp": pxp_id}).fetchone()
        assert row[0] == test_user, "user_name debe estar registrado"
        assert row[1] == test_ref, "referencia debe estar registrada"
        assert row[2] is not None, "created_at debe estar registrado"


class TestPaymentSchemaValidation:
    """Validación Pydantic de transacciones de pago."""

    def test_negative_monto_rejected(self):
        import pytest
        from pydantic import ValidationError
        from app.api.v1.schemas_fase1b import CreatePaymentTransactionBody

        with pytest.raises(ValidationError) as exc_info:
            CreatePaymentTransactionBody(
                pxp_id=1,
                transaction_type="ANTICIPO",
                monto=Decimal("-100"),
                fecha_pago=date.today(),
            )
        assert "greater than 0" in str(exc_info.value) or "gt" in str(exc_info.value).lower()

    def test_invalid_currency_rejected(self):
        import pytest
        from pydantic import ValidationError
        from app.api.v1.schemas_fase1b import CreatePaymentTransactionBody

        with pytest.raises(ValidationError) as exc_info:
            CreatePaymentTransactionBody(
                pxp_id=1,
                transaction_type="ANTICIPO",
                monto=Decimal("100"),
                moneda="EUR",
                fecha_pago=date.today(),
            )
        assert "COP" in str(exc_info.value) or "USD" in str(exc_info.value)

    def test_valid_transaction_passes(self):
        from app.api.v1.schemas_fase1b import CreatePaymentTransactionBody
        tx = CreatePaymentTransactionBody(
            pxp_id=1,
            transaction_type="ANTICIPO",
            monto=Decimal("500000"),
            moneda="COP",
            metodo_pago="Transferencia",
            referencia="REF-001",
            fecha_pago=date.today(),
            user_name="TestUser",
        )
        assert tx.monto == Decimal("500000")
        assert tx.moneda == "COP"
        assert tx.transaction_type == "ANTICIPO"
