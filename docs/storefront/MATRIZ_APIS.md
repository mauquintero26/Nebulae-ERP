# Matriz de APIs Backend — WEB-0

**Fecha:** 2026-09-08  
**Fuente:** `backend/app/api/v1/ecommerce.py`, `main.py`, código fuente completo  
**Base URL:** `https://api.nebulaekids.com/api/v1` (producción) / `http://localhost:8000/api/v1` (local)

**Leyenda Estado:**
- ✅ DISPONIBLE
- ⚠️ DISPONIBLE CON AJUSTES
- 🔶 PARCIAL
- 🔴 FALTANTE
- 🔵 LEGACY
- 📋 DUPLICADA
- 🚫 BLOQUEADA
- ➖ NO REQUERIDA

---

## Módulo: E-commerce (`/api/v1/ecommerce/`)

### Productos del Catálogo Web

| Dominio | Función | Método | Endpoint | Auth | Request | Response | Estado |
|---------|---------|--------|----------|------|---------|----------|--------|
| Catálogo | Listar productos publicados | GET | `/ecommerce/catalogo` | Ninguna | `?publicado=true&limit=N&search=Q&categoria=C` | Array productos | ✅ |
| Catálogo | Obtener producto por ID | GET | `/ecommerce/catalogo/{id}` | Ninguna | — | Producto | ✅ |
| Catálogo | Crear producto ecommerce | POST | `/ecommerce/catalogo` | JWT admin/asesor | ProductoBody | Producto | ✅ |
| Catálogo | Actualizar producto | PATCH | `/ecommerce/catalogo/{id}` | JWT admin/asesor | ProductoBody | Producto | ✅ |
| Catálogo | Eliminar producto | DELETE | `/ecommerce/catalogo/{id}` | JWT admin/asesor | — | OK | ✅ |
| Catálogo | Toggle publicado | PATCH | `/ecommerce/catalogo/{id}/toggle-published` | JWT admin/asesor | — | OK | ✅ |

**Notas críticas de catálogo:**
- El catálogo web (`ecommerce_products`) es una tabla SEPARADA del catálogo interno ERP (`products`/`product_skus`). Esto permite publicar solo ciertos productos sin exponer el inventario completo.
- El campo `stock_disponible` en `ecommerce_products` es un campo manual — NO se sincroniza automáticamente con el inventario real del ERP. **RIESGO DE SOBREVENTA.**
- En el checkout real sí se valida stock contra `InventoryOwnerBalance` y `InventoryReservation`, pero el campo visible al cliente en el catálogo puede ser incorrecto.

### Categorías

| Dominio | Función | Método | Endpoint | Auth | Estado |
|---------|---------|--------|----------|------|--------|
| Categorías | Listar categorías web | GET | `/ecommerce/categorias` | Ninguna | ✅ |
| Categorías | Crear categoría | POST | `/ecommerce/categorias` | JWT admin | ✅ |
| Categorías | Actualizar categoría | PATCH | `/ecommerce/categorias/{id}` | JWT admin | ✅ |
| Categorías | Eliminar categoría | DELETE | `/ecommerce/categorias/{id}` | JWT admin | ✅ |

**Notas:** Las categorías tienen `sub_categorias` (array JSON). El mega-menú del header las lee directamente.

### Pedidos Web (PWEB)

| Dominio | Función | Método | Endpoint | Auth | Request | Estado |
|---------|---------|--------|----------|------|---------|--------|
| Pedidos | Listar pedidos web | GET | `/ecommerce/pedidos` | JWT admin/asesor/finanzas/bodega | `?estado=X&search=Q&limit=50` | ✅ |
| Pedidos | Crear pedido (checkout) | POST | `/ecommerce/pedidos` | Ninguna (público) | Ver abajo | ⚠️ |
| Pedidos | Obtener pedido | GET | `/ecommerce/pedidos/{id}` | JWT | — | ✅ |
| Pedidos | Actualizar estado pedido | PATCH | `/ecommerce/pedidos/{id}/estado` | JWT admin/asesor | `{estado: "DESPACHADO"}` | ✅ |

**Body requerido para POST `/ecommerce/pedidos` (checkout):**
```json
{
  "idempotency_key": "uuid-v4-requerido",
  "customer_name": "María García",
  "customer_email": "maria@ejemplo.com",
  "customer_phone": "3001234567",
  "customer_address": "Calle 123 #45-67",
  "direccion_entrega": "Calle 123 #45-67, Medellín",
  "items": [
    {
      "sku_id": 123,
      "sku": "NEB-001-M-ROSA",
      "quantity": 2,
      "modalidad": "ENTREGA_INMEDIATA"
    }
  ]
}
```

**⚠️ CRÍTICO — El frontend actual de checkout NO cumple este contrato:**
- No envía `idempotency_key` → Backend retorna 422
- No envía `sku_id` ni `sku` → Backend retorna 404 "SKU no encontrado"
- Envía `productos` con nombres en vez de SKUs
- Requiere refactor completo en WEB-3

**Validaciones del backend:**
- `idempotency_key` obligatorio
- Precio recalculado en servidor — precio del cliente ignorado
- Descuentos arbitrarios rechazados (403)
- Stock validado contra inventario real
- Propietario MAU bloqueado
- Bodega validada — solo Central autorizada

### Estadísticas Ecommerce

| Dominio | Función | Método | Endpoint | Auth | Estado |
|---------|---------|--------|----------|------|--------|
| Stats | Dashboard stats | GET | `/ecommerce/stats` | JWT admin/asesor | ✅ |
| Stats | Pedidos hoy/mes, ingresos, carritos abandonados, conversión | GET | `/ecommerce/stats` | JWT | ✅ |

### Web Builder / Config del Sitio

| Dominio | Función | Método | Endpoint | Auth | Estado |
|---------|---------|--------|----------|------|--------|
| Config | Obtener config (hero, contacto, colores) | GET | `/ecommerce/web-builder/config` | Ninguna | ✅ |
| Config | Guardar config | PUT | `/ecommerce/web-builder/config` | JWT admin | ✅ |
| Config | Publicar sitio | POST | `/ecommerce/web-builder/publish` | JWT admin | ✅ |
| Config | Obtener secciones | GET | `/ecommerce/web-builder/sections` | JWT admin | ✅ |

### Carritos Abandonados

| Dominio | Función | Método | Endpoint | Auth | Estado |
|---------|---------|--------|----------|------|--------|
| Carritos | Crear/actualizar carrito | POST | `/ecommerce/carts` | Ninguna | ✅ |
| Carritos | Listar carritos abandonados | GET | `/ecommerce/carts/abandoned` | JWT admin | ✅ |
| Carritos | Enviar recuperación | POST | `/ecommerce/carts/{id}/recover` | JWT admin | ✅ |

### Repositorio de Medios

| Dominio | Función | Método | Endpoint | Auth | Estado |
|---------|---------|--------|----------|------|--------|
| Media | Listar imágenes | GET | `/ecommerce/media` | JWT admin | ✅ |
| Media | Registrar imagen | POST | `/ecommerce/media` | JWT admin | ✅ |

---

## Módulo: Inventario (relevante para ecommerce)

| Dominio | Función | Método | Endpoint | Auth | Estado |
|---------|---------|--------|----------|------|--------|
| Inventario | Stock vendible real | INTERNO | Calculado en `/ecommerce/pedidos` POST | — | ✅ |
| Inventario | Bodegas autorizadas | GET | `/api/v1/inventory/warehouses` | JWT | ✅ |
| Inventario | Reservas activas | INTERNO | `InventoryReservation` model | — | ✅ |

---

## Módulo: Store B2C (`/api/v1/store/`)

| Dominio | Función | Método | Endpoint | Auth | Estado |
|---------|---------|--------|----------|------|--------|
| Store | Endpoints legacy B2C | VARIOS | `/store/...` | Ninguna/JWT | 🔵 LEGACY |

**Nota:** Existe un router `/api/v1/store/` separado del `/api/v1/ecommerce/`. La tienda actual usa `/ecommerce/`. El router `/store/` es un módulo anterior que debería auditarse en WEB-1 para detectar si tiene funcionalidad única.

---

## APIs Faltantes para el Ecommerce

| Dominio | Función | Estado | Fase |
|---------|---------|--------|------|
| Pagos | Iniciar pago Wompi/PSE | 🔴 FALTANTE | WEB-4 |
| Pagos | Webhook confirmación pago | 🔴 FALTANTE | WEB-4 |
| Pagos | Estado de transacción | 🔴 FALTANTE | WEB-4 |
| Pagos | Reembolso/reversa | 🔴 FALTANTE | WEB-4 |
| Clientes | Registro cliente B2C | 🔴 FALTANTE | WEB-3 |
| Clientes | Login cliente B2C | 🔴 FALTANTE | WEB-3 |
| Clientes | Mis pedidos (cliente) | 🔴 FALTANTE | WEB-3 |
| Clientes | Mis direcciones | 🔴 FALTANTE | WEB-3 |
| Seguimiento | Estado de pedido (público por PWEB#) | 🔴 FALTANTE | WEB-4 |
| SEO | Sitemap dinámico | 🔴 FALTANTE | WEB-2 |
| Blog | CRUD de artículos | 🔴 FALTANTE | WEB-5 |
| Contacto | Envío de formulario | 🔴 FALTANTE | WEB-2 |
| Búsqueda | Full-text search productos | ⚠️ PARCIAL — Solo por nombre en query | WEB-2 |
| Reseñas | Reviews de productos | 🔴 FALTANTE | WEB-6 |
| Wishlist | Lista de deseos | 🔴 FALTANTE | WEB-6 |

---

## APIs Disponibles con Ajustes Requeridos

| Endpoint | Ajuste Necesario |
|----------|-----------------|
| `POST /ecommerce/pedidos` | Frontend debe enviar `idempotency_key` y SKUs reales |
| `GET /ecommerce/catalogo` | Normalizar casing URL (`Catálogo` vs `catalogo`) |
| `GET /ecommerce/catalogo/{id}` | Aclarar si el ID es de `ecommerce_products` o de `products` ERP |

---

## Módulos ERP Disponibles para Integración Futura

| Módulo | Router | Estado |
|--------|--------|--------|
| Auth/JWT | `/api/v1/auth` | ✅ DISPONIBLE |
| CRM clientes | `/api/v1/crm` | ✅ DISPONIBLE |
| Inventario | `/api/v1/inventory` + `/api/v1/erp_inventario` | ✅ DISPONIBLE |
| Ventas ERP | `/api/v1/ventas` | ✅ DISPONIBLE |
| Compras ERP | `/api/v1/compras` | ✅ DISPONIBLE |
| Logística | `/api/v1/logistica` | ✅ DISPONIBLE |
| Finanzas | `/api/v1/finance` | ✅ DISPONIBLE |
| Marketing | `/api/v1/marketing` | ✅ DISPONIBLE |
| WhatsApp | `/api/v1/whatsapp` | ✅ DISPONIBLE (modo sombra) |
| Chat Omnicanal | `/api/v1/chat` | ✅ DISPONIBLE |
| WebSockets | `/ws` | ✅ DISPONIBLE |
