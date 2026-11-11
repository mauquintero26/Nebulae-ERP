"""B4 T24 (B47): ExpenseResponse.incurred_date admite None (la columna admite NULL).

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_gasto_sin_fecha).
"""


def test_la_respuesta_de_un_gasto_admite_la_fecha_nula():
    """B4 T24 (B47): incurred_date admite NULL en la columna; ExpenseResponse ya no exige la fecha (un gasto sin fecha
    rompía la respuesta con un 500)."""
    from decimal import Decimal
    from types import SimpleNamespace
    from app.schemas.finance import ExpenseResponse
    gasto = SimpleNamespace(id=1, category="Arriendo", description=None, amount=Decimal("5"), incurred_date=None,
                            is_recurring=False)
    assert ExpenseResponse.model_validate(gasto).model_dump() == {
        "category": "Arriendo", "description": None, "amount": Decimal("5"), "incurred_date": None, "is_recurring": False,
        "id": 1}
