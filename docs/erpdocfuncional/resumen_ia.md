# Nebulae ERP HUB — Resumen de Arquitectura y Alineación Funcional para IA

## 1. Visión General del Sistema
Nebulae ERP HUB es una plataforma integral diseñada para gestionar la importación, comercialización y entrega de productos para bebés y maternidad. El sistema conecta de manera reactiva la captación omnicanal de clientes, la cotización formal basada en TRM y márgenes de utilidad, la compra internacional agrupada, el seguimiento logístico por casillero (Miami → Barranquilla), la recepción física con separación de destinos y el despacho con retención de saldo.

---

## 2. Mapa Integral de Rutas y Pantallas

| Zona | Ruta Web | Componente Principal | Endpoints Backend Consumidos |
|---|---|---|---|
| **Clientes** | `/dashboard/agenda` | `agenda/page.tsx` | `GET /customers`, `GET /crm/customers/{id}/profile-360` |
| **CRM** | `/dashboard/crm` | `crm/page.tsx` | `GET /crm/leads`, `GET /crm/pipeline-stages/config`, `POST /crm/leads/move` |
| **Omnicanal** | `/dashboard/asistente_omnicanal` | `asistente_omnicanal/page.tsx` | `POST /chat/message`, `GET /chat/sessions` |
| **Cotizador** | `/dashboard/cotiza` | `cotiza/page.tsx` | `GET /customers`, `POST /quotations/generate` |
| **Ventas (SC)** | `/dashboard/ventas/solicitud` | `solicitud/page.tsx` | `GET /ventas/solicitudes`, `POST /ventas/solicitudes` |
| **Ventas (COT)** | `/dashboard/ventas/cotizacion` | `cotizacion/cotizacion-client.tsx` | `GET /ventas/cotizaciones`, `POST /ventas/pedidos` |
| **Ventas (PVEN)** | `/dashboard/ventas/venta` | `venta/venta-client.tsx` | `GET /ventas/pedidos`, `POST /compras/pedidos`, `POST /compras/lista-compras` |
| **Compras (Lista)** | `/dashboard/compras/lista-compras` | `lista-compras/page.tsx` | `GET /compras/lista-compras`, `POST /compras/pedidos` |
| **Compras (PEC)** | `/dashboard/compras/pedidos` | `pedidos/page.tsx` | `GET /compras/pedidos`, `POST /compras/pedidos`, `GET /compras/proveedores/search` |
| **Logística Tránsito**| `/dashboard/compras/transito` | `transito/page.tsx` | `GET /compras/transito`, `PATCH /compras/pedidos/{id}/tracking` |
| **Mesa Recepciones** | `/dashboard/compras/recepciones` | `recepciones/page.tsx` | `GET /compras/recepciones`, `POST /compras/pedidos/{id}/recepcionar`, `POST /compras/recepciones/{id}/confirmar` |
| **Inventario Stock** | `/dashboard/inventario/stock` | `stock/page.tsx` | `GET /products`, `GET /inventory/stock-summary` |
| **Entregas / Despacho**| `/dashboard/inventario/entregas` | `entregas/page.tsx` | `GET /ventas/pedidos`, `PATCH /ventas/pedidos/{id}` |
| **Marketing Campañas**| `/dashboard/marketing/campanas` | `campanas/page.tsx` | `GET /marketing/campanas`, `POST /marketing/campanas`, `POST /marketing/leads/crm-sync` |
| **Marketing Flujos** | `/dashboard/marketing/flujos` | `flujos/page.tsx` | `GET /marketing/flujos`, `POST /marketing/flujos`, `PATCH /marketing/flujos/{id}` |
| **Empleados & Roles** | `/dashboard/admin/empleados` | `empleados/page.tsx` | `GET /auth/users`, `PATCH /auth/users/{id}/role`, `POST /auth/register` |
| **Mi Perfil** | `/dashboard/perfil` | `perfil/page.tsx` | `GET /auth/me`, `POST /auth/change-password` |

---

## 3. Reglas de Negocio Clave

### 3.1 Trazabilidad por Destino (Líneas de Compra)
Cada producto adquirido bajo una orden de compra `PEC` posee una clasificación explícita:
- **`CLIENTE`:** Vinculado a un pedido `PVEN`. Al recibirse en bodega pasa a cola de despacho y cobro de saldo.
- **`NEBULAE` (Stock):** Pasa al stock físico disponible para venta inmediata en catálogo y web.
- **`MAU` (Socio):** Pasa a inventario bajo custodia o liquidación del socio.

### 3.2 Protocolo Comercial 60 / 40
- Toda cotización o pedido de cliente exige un **Anticipo del 60%** para activar la orden de compra o separar la mercancía.
- El **Saldo restante (40%)** se retiene hasta que la mercancía arriba a la bodega nacional. La cola de despacho (`/dashboard/inventario/entregas`) alerta o bloquea la salida si existe saldo pendiente.

### 3.3 Vista Dual de Inventario
- **Físico en Bodega:** Total de unidades tangibles en estantería.
- **Comprometido:** Unidades reservadas para preventas con anticipo recibido.
- **Disponible para Venta:** `Físico - Comprometido`. La única cifra que los asesores pueden comprometer para entrega inmediata.
- **En Tránsito:** Unidades en camino desde proveedores internacionales.

### 3.4 Mesa de Recepción e Idempotencia
- Las confirmaciones de entrada física (`ENINV`) envían un `idempotency_key` generado vía `crypto.randomUUID()` en el cliente para garantizar que reconexiones o doble click no dupliquen existencias en la base de datos.
