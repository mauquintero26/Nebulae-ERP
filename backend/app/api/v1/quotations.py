from fastapi import APIRouter
from app.schemas.quotations import QuotationCalculateRequest, QuotationCalculateResponse
from decimal import Decimal

router = APIRouter()

@router.post("/calculate", response_model=dict)
def calculate_quotation_price(request: QuotationCalculateRequest):
    # Step 1: Effective TRM
    trm_efectiva = request.trm_dia + request.ajuste_trm
    
    # Step 2: Origin Cost in USD
    costo_neto_usd = request.costo_usd * (Decimal("1.0") - request.descuento)
    tax_usd = costo_neto_usd * request.tax_rate
    total_origen_usd = costo_neto_usd + tax_usd + request.envio_origen_usd
    
    # Step 3: Convert to COP and Logistics
    costo_base_cop = total_origen_usd * trm_efectiva
    costo_traida_cop = request.peso_libras * request.costo_libra_cop
    costo_total_cop = costo_base_cop + costo_traida_cop
    
    # Step 4: Margin and Sale Price
    # Prevent division by zero if target margin is 100% (1.0)
    if request.target_margin >= Decimal("1.0"):
        precio_sugerido_formula = costo_total_cop # Fallback
    else:
        precio_sugerido_formula = costo_total_cop / (Decimal("1.0") - request.target_margin)
        
    if request.precio_publicado_manual is not None:
        precio_publicado = request.precio_publicado_manual
        if precio_publicado > Decimal("0.0"):
            margen_real = (precio_publicado - costo_total_cop) / precio_publicado
        else:
            margen_real = Decimal("0.0")
    else:
        precio_publicado = precio_sugerido_formula
        margen_real = request.target_margin
        
    # Step 5: Advance Payment (Anticipo)
    valor_anticipo = precio_publicado * request.anticipo_porcentaje
    
    response_data = QuotationCalculateResponse(
        trm_efectiva=round(trm_efectiva, 2),
        costo_neto_usd=round(costo_neto_usd, 2),
        tax_usd=round(tax_usd, 2),
        total_origen_usd=round(total_origen_usd, 2),
        costo_base_cop=round(costo_base_cop, 2),
        costo_traida_cop=round(costo_traida_cop, 2),
        costo_total_cop=round(costo_total_cop, 2),
        precio_sugerido_formula=round(precio_sugerido_formula, 2),
        precio_publicado=round(precio_publicado, 2),
        margen_real=round(margen_real, 4), # 4 decimals for percentages (e.g. 0.4500)
        valor_anticipo=round(valor_anticipo, 2)
    )
    
    return {"status": "success", "data": response_data.model_dump(mode="json")}
