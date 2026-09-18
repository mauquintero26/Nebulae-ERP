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
