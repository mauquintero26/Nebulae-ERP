# Contexto y Endpoints para Desarrollador Backend

¡Hola Developer! 
El frontend de **Nebulae ERP-CRM** está 100% maquetado (Next.js) e hidratado con Mocks estáticos de alta fidelidad. Tu misión es reemplazar esos mocks por conexiones reales a la API (FastAPI) que construirás, respetando la arquitectura de Base de Datos que ya establecimos.

**CRÍTICO:** Todas las respuestas de la API DEBEN seguir el estándar JSend (`{"status": "success", "data": {...}}`).

## 1. Módulos y Estructuras a Reemplazar

### A. Módulo de Ventas (`/dashboard/ventas`)
El frontend espera datos agregados para los KPIs y un listado de ventas.
**Endpoints clave:**
* `GET /api/v1/sales`: Lista los Pedidos de Venta (`SalesOrder`).
```json
{
  "status": "success",
  "data": {
    "sales": [{
      "id": "VEN-2026-001",
      "customer_id": 45,
      "created_at": "2026-08-30",
      "total_value": 15400,
      "sale_type": "ON_DEMAND", // Enum: IMMEDIATE | ON_DEMAND
      "status": "TO_INVOICE", // Enum: TO_INVOICE | INVOICED
      "quotation_id": 89
    }]
  }
}
```
* `POST /api/v1/sales/{id}/invoice`: Convierte el monto en una Factura y actualiza estado.

### B. Módulo de Compras (`/dashboard/compras`)
**Endpoints clave:**
* `GET /api/v1/purchases`: Lista los Pedidos de Compra (`PurchaseOrders`).
* `PUT /api/v1/purchases/{id}/receive`: Desencadenado por el botón "Procesar Entrada". Crea una `InventoryOperation` de tipo RECEIPT, actualiza los `InventoryLevels` y cambia el estado del `SalesOrder` asociado.

### C. Módulo de Inventario
* Debes exponer Endpoints para `Products`, `Warehouses`, `InventoryOperations` y `InventoryMovements` (Kardex).
* `POST /api/v1/inventory/sync-ecommerce`: Sincronización para el canal B2C de la Fase 5.

### D. Módulo de Marketing y Omnicanal (Webhooks)
* `GET /api/v1/marketing/flows`: Retorna el JSON (Canvas Nodes & Edges) del flujo automatizado.
* `POST /api/v1/webhooks/whatsapp`: Endpoint público para recibir los eventos en vivo de Meta y guardarlos en el CRM.
* WebSockets (`ws://.../chat`): Para notificar al Frontend de nuevos mensajes de leads en tiempo real.

### E. Integración IA (MCP Terminal)
* Terminal MCP: En `/dashboard/integraciones/mcp`, el frontend lee un log. Crea un WebSocket `ws://.../mcp-logs` para emitir el pensamiento de los agentes IA en vivo.

### F. Gobernanza (Administrador)
* Middleware RBAC: Tu backend debe asegurar que el token JWT contenga el Rol. Solo perfiles autorizados acceden a sus módulos (`ROLE_PERMISSIONS`). Si no, HTTP 403.

## 2. Puntos Críticos de Integración
1. **Paginación y Filtros:** Todos los `GET` masivos deben soportar paginación (`?offset=0&limit=20`) y búsqueda (`?q=...`).
2. **Manejo de Errores (400/500):** Nunca devolver Stack Traces en producción. Devolver formatos estandarizados `{"status": "error", "message": "..."}`.
3. **Migración a Producción:** Configurar la conexión SQLAlchemy para que utilice PostgreSQL (mediante variables de entorno).
