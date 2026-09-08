# Registro de Decisiones Arquitectónicas — WEB-0

**Fecha:** 2026-09-08

---

## ADR-001: Conservar arquitectura monorrepo Next.js

**Fecha:** 2026-09-08  
**Estado:** ACEPTADO

**Contexto:**  
Se evaluó si separar la tienda como aplicación Next.js independiente (storefront/ separado).

**Decisión:**  
Mantener todo dentro del monorrepo actual (`frontend/`), usando las rutas `/store/` para la tienda pública.

**Justificación:**
- No hay impedimento técnico que justifique la separación
- Compartir código (`lib/api.ts`, `design-system.ts`) es una ventaja real
- La infraestructura de despliegue existente funciona para un monorrepo
- El tráfico proyectado de Nebulae Kids no requiere arquitectura distribuida

**Consecuencias:**
- Build más largo conforme crece el proyecto
- Revisitar en WEB-7 si el tráfico supera 50K visitas/día

---

## ADR-002: Ruta canónica `/store/producto/[id]`

**Fecha:** 2026-09-08  
**Estado:** ACEPTADO

**Contexto:**  
Existen dos rutas para el detalle de producto:
- `/store/product/[id]` — mock puro, 111 líneas
- `/store/producto/[id]` — conectado al backend, 234 líneas, con galería real y atributos dinámicos

**Decisión:**  
`/store/producto/[id]` es la ruta canónica. `/store/product/[id]` se eliminará en WEB-1 con redirect 301.

**Justificación:**
- `/store/producto/[id]` está enlazada desde todas las pantallas
- Consume datos reales del backend
- Es más completa (galería, atributos, breadcrumb, stock real)

---

## ADR-003: Ruta canónica del constructor `/dashboard/sitio-web`

**Fecha:** 2026-09-08  
**Estado:** ACEPTADO

**Contexto:**  
Existen dos constructores:
- `/dashboard/sitio-web` — conectado al backend, guarda config real
- `/dashboard/website` — mock total, UI más rica y moderna

**Decisión:**  
`/dashboard/sitio-web` es la ruta canónica. En WEB-5 se migra la UI visual de `/website` a `/sitio-web`.

**Justificación:**
- `/sitio-web` tiene backend real conectado
- La UI de `/website` es un prototipo sin funcionalidad
- Fusionar la mejor UI con la funcionalidad existente es más eficiente que reescribir

---

## ADR-004: El checkout requiere idempotency_key obligatorio

**Fecha:** 2026-09-08  
**Estado:** ACEPTADO

**Contexto:**  
El backend (ecommerce.py L288-292) requiere `idempotency_key` en el POST de checkout. El frontend actual NO lo envía → 422 garantizado en producción.

**Decisión:**  
El frontend debe generar un UUID v4 en el cliente al iniciar el checkout y mantenerlo durante toda la sesión de compra.

**Implementación WEB-3:**
```typescript
const idempotencyKey = crypto.randomUUID();
sessionStorage.setItem('checkout_idempotency_key', idempotencyKey);
```

---

## ADR-005: Catálogo web separado del catálogo ERP

**Fecha:** 2026-09-08  
**Estado:** OBSERVADO (pendiente decisión en WEB-3)

**Contexto:**  
El backend mantiene dos catálogos separados:
- `ecommerce_products` — tabla propia del ecommerce, con `stock_disponible` manual
- `products` + `product_skus` — catálogo ERP con inventario real

El checkout real usa `product_skus` para validar stock pero el frontend muestra `ecommerce_products.stock_disponible` (puede estar desactualizado).

**Opciones a evaluar en WEB-3:**
1. Sincronización automática `stock_disponible` desde ERP
2. Eliminar campo `stock_disponible` de ecommerce y calcular en tiempo real
3. Vincular `ecommerce_products` a `product_skus` por FK

**Impacto si no se resuelve:**
- Riesgo de sobreventa visual (se muestra disponible pero checkout falla)
- Confusión del cliente

---

## ADR-006: Cliente API centralizado para la tienda

**Fecha:** 2026-09-08  
**Estado:** PROPUESTO (implementar en WEB-2)

**Contexto:**  
La tienda pública usa `fetch()` directos con URL hardcodeada en múltiples archivos:
- `store/page.tsx`
- `store/catalogo/page.tsx`
- `store/producto/[id]/page.tsx`
- `store/checkout/page.tsx`
- `store/contacto/page.tsx`

**Decisión:**  
Crear `lib/store-api.ts` con todas las funciones de la tienda. Migrar todos los fetch directos.

---

## ADR-007: Autenticación B2C separada del ERP

**Fecha:** 2026-09-08  
**Estado:** PROPUESTO (implementar en WEB-3)

**Contexto:**  
Actualmente no hay autenticación para clientes B2C. El ERP usa JWT Bearer en localStorage.

**Decisión:**  
Implementar auth B2C con JWT + refresh token en httpOnly cookie, completamente separado del JWT del ERP.

**Razón:**  
- Los clientes B2C no son usuarios del ERP
- httpOnly cookie es más seguro que localStorage (no vulnerable a XSS)
- El equipo de ERP no debe tener acceso a la sesión del comprador
