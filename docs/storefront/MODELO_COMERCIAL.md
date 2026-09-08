# Modelo Comercial y Flujos — WEB-0

**Fecha:** 2026-09-08

---

## 1. Tipos de Venta

### A. Entrega Inmediata
Producto en stock, listo para despachar hoy.

**Flujo completo:**
```
[Cliente] Selecciona producto + variante
   ↓
[Tienda] Consulta stock vendible: balance_NEBULAE - reservas_activas
   ↓ Si stock insuficiente → mostrar "Agotado" / error 409
[Cliente] Agrega al carrito (sin reservar)
   ↓
[Tienda] En checkout: revalidación de stock antes de confirmar
   ↓ Si ya no hay stock → error al checkout
[Backend] POST /ecommerce/pedidos → estado: PENDIENTE_PAGO
   ↓ NO se reserva hasta confirmar pago
[Pasarela] Pago completado → webhook firmado
   ↓
[Backend] Webhook → estado: PENDIENTE_DESPACHO + crear InventoryReservation
   ↓ Reserva NO reduce stock físico
[Bodega] Embalar + despachar
   ↓
[Backend] PATCH pedido estado DESPACHADO → SÍ reduce InventoryOwnerBalance (stock físico)
   ↓
[Transporte] Entrega
   ↓
[Backend] PATCH pedido estado ENTREGADO
```

**Validaciones críticas:**
- `InventoryOwnerBalance.owner == "NEBULAE"` (no MAU)
- `InventoryReservation.status == "ACTIVE"` restadas del disponible
- `InventoryQuarantine` excluido del disponible
- Bodega debe ser `location_type == "Central"` y estar en `ecommerce_fulfillment` config
- Prevención sobreventa: stock se verifica en el momento del checkout (no al agregar al carrito)

---

### B. Producto por Pedido
Producto que requiere compra previa. No hay stock disponible inmediato.

**Flujo completo:**
```
[Cliente] Ve "Por Pedido" en el producto
   ↓ Distintivo visual + tiempo estimado
[Cliente] Agrega al carrito con modalidad=POR_PEDIDO
   ↓
[Backend] POST /ecommerce/pedidos → línea PENDIENTE_COMPRA
   ↓
[Admin] Confirma necesidad de compra → crea orden de compra en ERP
   ↓
[Proveedor] Despacha mercancía → tracking
   ↓
[Backend] Recepción total o parcial en bodega
   ↓
[Backend] Asignación automática: unidades recibidas → clientas con PENDIENTE_COMPRA
   ↓
[Backend] Notificación a cliente: "Tu pedido llegó, paga el saldo"
   ↓
[Cliente] Paga saldo (anticipo ya cobrado en checkout)
   ↓
[Bodega] Embalar + despachar → ENTREGADO
```

**Anticipo configurado:**
- Porcentaje configurable desde `web_builder_config`
- Si `anticipo_pct = 50%`, el cliente paga 50% al checkout
- El saldo se cobra al llegar la mercancía
- Si el cliente no paga el saldo en X días → cancelar + liberar producto

---

## 2. Inventario Patrimonial

### Separación NEBULAE / MAU

| Concepto | NEBULAE | MAU |
|----------|---------|-----|
| Propietario | Empresa | Persona natural (Mau) |
| Ecommerce | ✅ Autorizado | ❌ Bloqueado |
| Visibilidad web | Solo NEBULAE | Nunca expuesto |
| Campo en BD | `InventoryOwnerBalance.owner = "NEBULAE"` | `owner = "MAU"` |
| Validación backend | Anti-manipulación en checkout | `403 Forbidden` si se intenta |

**El frontend jamás puede:**
- Publicar inventario MAU
- Cambiar propietario desde el checkout
- Ver balances MAU

---

## 3. Variantes y SKUs

### Estructura actual del backend

| Modelo | Tabla | Propósito |
|--------|-------|-----------|
| `Product` | `products` | Producto maestro ERP |
| `ProductSKU` | `product_skus` | SKU específico (talla+color+presentación) |
| `InventoryLevel` | `inventory_levels` | Stock por SKU y bodega |
| `InventoryOwnerBalance` | — | Stock real por propietario |
| `ecommerce_products` | Tabla ecommerce | Producto publicado en web |

### Problema actual
El catálogo web (`ecommerce_products`) es **independiente** del catálogo ERP. Un producto puede existir en ecommerce sin tener un `ProductSKU` en el ERP. Cuando el checkout se conecte (WEB-3), necesita un `sku_id` o `sku` de `product_skus`.

**Solución propuesta (WEB-3):**
1. Vincular `ecommerce_products` a `product_skus` mediante campo `sku_id` (FK)
2. O: el frontend pasa el SKU como string y el backend lo busca en `product_skus`
3. El campo `stock_disponible` en ecommerce debe sincronizarse (o eliminarse y calcularse en tiempo real)

---

## 4. Precios

### Regla fundamental
**El precio siempre lo valida el servidor.** El cliente puede ver el precio pero no puede manipularlo.

```
Backend: db_price = ProductSKU.sale_price
Cliente envía: client_price = 50000
Si abs(client_price - db_price) > 0.01 → 422 "Manipulación de precios"
```

### Descuentos
- Solo descuentos autorizados (campo `descuento_pct` en `ecommerce_products`)
- Descuentos arbitrarios desde el cliente son rechazados (422)
- Cupones de descuento: NO implementados todavía (WEB-4/WEB-6)

### Formato de moneda
- Todos los precios en COP (pesos colombianos)
- Función: `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' })`
- Sin decimales para precios mayores a 1000

---

## 5. Reservas e Inventario

| Operación | Efecto en Inventario |
|-----------|---------------------|
| Agregar al carrito | ❌ Sin efecto |
| Crear pedido (checkout) | ❌ Sin efecto |
| Pago confirmado (webhook) | ✅ Crea `InventoryReservation` (reduce disponible, NO físico) |
| Despachar | ✅ Reduce `InventoryOwnerBalance` (stock físico) |
| Cancelar pedido antes despacho | ✅ Libera `InventoryReservation` |
| Reserva expirada sin pago | ✅ Libera reserva automáticamente |
| Devolución | ✅ Incrementa `InventoryOwnerBalance` (WEB-6) |

---

## 6. Estados de Pedido Web

```
PENDIENTE_PAGO     ← Estado inicial (checkout completado, sin pago)
       ↓ (webhook de pago)
PENDIENTE_DESPACHO ← Pago confirmado, listo para empacar
       ↓
EN_TRANSITO        ← Enviado con guía
       ↓
ENTREGADO          ← Confirmado
       ↓ (si devuelve)
CANCELADO          ← Con motivo
```

**Estados de pago (WEB-4):**
```
PENDING → APPROVED → completed flow
                  → FAILED → retry
       → EXPIRED  → liberar reserva
       → REFUNDED → reversa
```

---

## 7. Reglas de Negocio que el Frontend DEBE Respetar

1. **No publicar precios sin validar** — Siempre mostrar el precio del catálogo web
2. **No agregar al carrito sin stock** — Deshabilitar botón si `stock_disponible == 0`
3. **No hacer checkout con carrito vacío** — Validar antes de navegar
4. **No revalidar stock solo al agregar** — Revalidar TAMBIÉN en el momento del checkout
5. **No mostrar "Disponible" si stock_disponible está en cero**
6. **No mezclar NEBULAE/MAU** — Nunca exponer campo owner al cliente
7. **No procesar pagos reales sin HTTPS**
8. **No guardar datos de tarjeta** — Todo a través de pasarela hosted
9. **Mostrar claramente la modalidad** — "Entrega inmediata" vs "Por pedido"
10. **Comunicar tiempo estimado** para productos por pedido

---

## 8. Preguntas Pendientes para el Usuario

Las siguientes definiciones comerciales son necesarias para WEB-1 en adelante:

| # | Pregunta |
|---|---------|
| 1 | ¿Cuál es el porcentaje de anticipo para productos por pedido? ¿Es fijo o configurable por categoría? |
| 2 | ¿Cuántos días tiene el cliente para pagar el saldo al llegar la mercancía? |
| 3 | ¿Qué pasa si el cliente no paga el saldo? ¿Se cancela automáticamente? |
| 4 | ¿Hay envío gratis desde cierto monto? ¿Cuál es la política de envío? |
| 5 | ¿Qué pasarela de pago se usará? ¿Wompi? ¿PayU? ¿Epayco? |
| 6 | ¿El checkout permite pagos en efectivo (PSE, OXXO)? |
| 7 | ¿Los productos por pedido tienen un tiempo estimado específico por categoría? |
| 8 | ¿Cuál es la política de devoluciones? ¿X días? |
| 9 | ¿Se manejan tallas propias de la marca o tallas estándar? |
| 10 | ¿El stock del catálogo web se actualiza automáticamente desde el ERP o manualmente? |
