# Contrato Operacional del Flujo Comercial — Nebulae Hub ERP

Este documento formaliza el contrato técnico y funcional del ciclo comercial completo de **Nebulae ERP**:
`Cliente → Solicitud (SC) → Cotización (COT) → Pedido de Venta (PVEN) → Pendiente por Comprar (PEC/Lista)`

Abarca las dos modalidades operacionales:
- **Flujo A: Entrega Inmediata (Stock Físico NEBULAE)**
- **Flujo B: Por Pedido (Anticipo 60% / Saldo 40%)**

---

## 1. Arquitectura y Principios de Integridad

1. **Autenticación y Sesión JWT:**
   - Todo request a la API administrativa envía cabecera `Authorization: Bearer <token>`.
   - Si el backend responde HTTP 401, el cliente (`apiFetch` en `@/lib/api`) limpia `localStorage.token`, almacena `returnUrl` en `sessionStorage` y redirige de forma unificada a `/login?reason=session-expired`.
   - `AuthGuard` intercepta rutas protegidas para evitar destellos o accesos en blanco.
2. **Desempaquetado Seguro de Respuestas:**
   - La API sigue el estándar JSend `{ status: "success", data: ... }`.
   - `apiFetch` garantiza compatibilidad dual: el objeto devuelto contiene la propiedad no-enumerable `.json()` para llamadas encadenadas, garantizando que el acceso directo a `.data` o a campos del payload sea idempotente y nunca genere `undefined`.
3. **Persistencia y Compatibilidad de Esquema:**
   - La base de datos productiva (`erpdb`) se mantiene inalterada en la versión de migración Alembic `fa6_004`.
   - No se ejecutan migraciones ni modificaciones destructivas.
   - Las necesidades de abastecimiento ("Pendiente por Comprar") se almacenan de forma estructurada en `web_builder_config` bajo la clave `erp_lista_compras`, sincronizándose bidireccionalmente con los registros de `sale_orders` y `purchase_orders_full`.

---

## 2. Matriz de Estados por Entidad

### 2.1 Solicitud de Cliente (SC)
- `BORRADOR`: Solicitud recién creada en edición.
- `PENDIENTE_CONFIRMACION`: Lista para validación con el cliente.
- `CONFIRMADA`: Se generó automáticamente la Cotización (COT).
- `CANCELADA`: Solicitud descartada con motivo justificado (pasa a papelera antes de depuración).

### 2.2 Cotización de Venta (COT)
- `BORRADOR`: Cotización generada, calculando costos (TRM, fletes, margen) o anticipo.
- `ENVIADA`: Enviada formalmente al cliente (PDF/WhatsApp).
- `CONFIRMADA`: Aprobada por el cliente; crea automáticamente el Pedido de Venta (PVEN).
- `RECHAZADA`: No aceptada por el cliente (soft-delete).

### 2.3 Pedido de Venta (PVEN)
- `PENDIENTE_COMPRA`: Modalidad por pedido, requiere emisión de orden de compra o envío a lista de abastecimiento.
- `EN_PROCESO`: Con orden de compra emitida (PEC vinculada) o en alistamiento.
- `LISTO_ENTREGA`: Mercancía asignada en bodega lista para despacho o contraentrega.
- `ENTREGADO`: Mercancía recibida a satisfacción por el cliente final.
- `FACTURADO`: Documento fiscal/contable emitido.
- `CANCELADO`: Anulado con motivo de auditoría.

### 2.4 Lista de Compras (Pendiente por Comprar)
- `PENDIENTE`: Producto cargado desde PVEN pendiente de asociar a un proveedor u orden.
- `EN_PEDIDO`: Asociado a un Pedido de Compra (`PEC-YYYY####`).
- `RECIBIDO`: Mercancía recibida en bodega (enlazada a recepción `ENINV`).

---

## 3. Matriz Completa: Botones, Endpoints, Payloads y Respuestas

| Pantalla / UI | Botón / Acción | Endpoint Backend | Método | Payload Principal | Respuesta Exitosa | Manejo de Error |
|---|---|---|:---:|---|---|---|
| **Solicitud** | Crear Cliente (Modal) | `/api/v1/crm/customers` | `POST` | `{"first_name", "last_name", "phone", "email", "address", "city"}` | `201 {"status":"success", "data": Customer}` | Notificación toast y resaltado de campo requerido |
| **Solicitud** | Autocompletar Cliente | `/api/v1/crm/customers/search?q=...` | `GET` | Query param `q` (texto libre) | `200 {"status":"success", "data": [Customer]}` | Lista vacía sin crash |
| **Solicitud** | Autocompletar Producto | `/api/v1/crm/products/search?q=...` | `GET` | Query param `q` (SKU o nombre) | `200 {"status":"success", "data": [Product]}` | Ofrece modal "Crear producto rápido" o nota |
| **Solicitud** | Guardar Nueva SC | `/api/v1/ventas/solicitudes` | `POST` | `{"customer_id", "customer_name", "productos":[], "modalidad_pago", "notas"}` | `201 {"status":"success", "data": CustomerRequest}` | Validación de cliente obligatorio |
| **Solicitud** | Confirmar SC → COT | `/api/v1/ventas/solicitudes/{id}/confirmar` | `POST` | `{"user_name": str}` | `200 {"status":"success", "data": {"sc":..., "cotizacion":...}}` | Toast con número `COT-YYYY####` creado |
| **Solicitud** | Cancelar SC | `/api/v1/ventas/solicitudes/{id}/cancelar` | `POST` | `{"razon": str}` | `200 {"status":"success"}` | Validación de motivo obligatorio |
| **Cotización** | Guardar Cálculo | `/api/v1/ventas/cotizaciones/{id}` | `PATCH` | `{"productos":[], "trm_rate", "total_cop", "anticipo_cop", "descuento_pct"}` | `200 {"status":"success", "data": SalesQuotation}` | Toast "Cotización calculada y guardada" |
| **Cotización** | Confirmar COT → PVEN | `/api/v1/ventas/cotizaciones/{id}/confirmar` | `POST` | `{"user_name": str, "direccion_entrega": str}` | `200 {"status":"success", "data": {"pedido_venta":..., "sale_order_id": int}}` | Toast con número `PVEN-YYYY####` creado |
| **Pedido Venta** | Enviar a Lista Compras | `/api/v1/compras/lista-compras` | `POST` | `{"pven_id": int, "pven_numero": str, "productos": [{"producto_nombre", "qty"}]}` | `201 {"status":"success", "data": [Items]}` | Toast "Productos agregados a Lista de Compras" |
| **Pedido Venta** | Crear PEC Directo | `/api/v1/compras/pedidos` | `POST` | `{"supplier_id", "ven_id", "ven_numero", "productos":[], "dias_entrega"}` | `201 {"status":"success", "data": PurchaseOrderFull}` | Enlaza `ven.pec_id` y actualiza a `EN_PROCESO` |
| **Lista Compras** | Consultar Pendientes | `/api/v1/compras/lista-compras` | `GET` | Params: `estado`, `search`, `proveedor`, `fecha_desde`, `fecha_hasta` | `200 {"status":"success", "data": [Item]}` | Renderizado reactivo con paginación y filtros |
| **Lista Compras** | KPIs / Estadísticas | `/api/v1/compras/lista-compras/stats` | `GET` | Sin body | `200 {"status":"success", "data": {"pendientes", "en_pedido", "recibidos", "total"}}` | Cards KPI actualizadas automáticamente |
| **Lista Compras** | Crear PEC desde Item | `/api/v1/compras/pedidos` + `PATCH /compras/lista-compras/{id}` | `POST` + `PATCH` | Crea PEC vinculado y actualiza item a `EN_PEDIDO` | `201` + `200` | Toast con `PEC-YYYY####` y vinculación a PVEN |
| **Lista Compras** | Eliminar Item | `/api/v1/compras/lista-compras/{id}` | `DELETE` | Sin body | `200 {"status":"success", "message": "Item eliminado"}` | Confirmación en UI antes de procesar |

---

## 4. Guía de Ejecución de los Flujos Operacionales

### Flujo A: Entrega Inmediata (Stock Físico NEBULAE)
1. **Creación / Selección de Cliente:** Búsqueda en `/crm/customers`.
2. **Generación de Solicitud (SC):** Tipo "Cotización de Producto", Modalidad "Contado".
3. **Pase a Cotización (COT):** Clic en "Confirmar Solicitud".
4. **Cálculo y Anticipo 100%:** Se abre la Calculadora, se pulsa `100% Contado`, anticipo = total, saldo = 0.
5. **Confirmación a Pedido de Venta (PVEN):** Clic en "Confirmar Cotización", se genera `PVEN-YYYY####`.
6. **Despacho y Entrega:** Estado avanza a `LISTO_ENTREGA` y `ENTREGADO`.

### Flujo B: Por Pedido (Compra Internacional / Especial)
1. **Creación / Selección de Cliente:** Validación de datos de contacto y entrega.
2. **Generación de Solicitud (SC):** Modalidad "60/40 (60% anticipo - 40% pendiente)".
3. **Pase a Cotización (COT):** Clic en "Confirmar Solicitud".
4. **Cálculo con TRM y Anticipo 60%:** Se abre la Calculadora, se pulsa botón `60%`, anticipo = 60% del total, saldo = 40%.
5. **Confirmación a Pedido de Venta (PVEN):** Clic en "Confirmar Cotización", estado inicial `PENDIENTE_COMPRA`.
6. **Abastecimiento:** Se pulsa "Enviar a Lista de Compras" (o "Crear PEC").
7. **Gestión en Lista de Compras:** El equipo de compras visualiza la necesidad en `/dashboard/compras/lista-compras`, asigna proveedor y emite `PEC-YYYY####`.
8. **Seguimiento y Cierre:** Con el PEC en tránsito y recibido, se cobra el saldo del 40%, se empaqueta y se entrega.