# WEB2A — Gaps del Backend

**Fecha:** 2026-09-09  
**Fase:** WEB-2A  
**Objetivo:** Documentar las dependencias del backend que no pueden implementarse en el frontend sin cambiar el servidor.

---

## Clasificación de Prioridad

| Prioridad | Definición |
|-----------|------------|
| **P0** | Bloquea la compra o puede causar sobreventa |
| **P1** | Necesaria para catálogo completo y funcional |
| **P2** | Mejora posterior — UX o SEO |

---

## GAP-001 — Paginación Server-Side Real

| Campo | Valor |
|-------|-------|
| **Prioridad** | P1 |
| **Problema** | El endpoint `GET /ecommerce/catalogo` solo acepta `limit` (máximo 500). No hay `offset`, `page`, ni cursor de paginación real. |
| **Riesgo** | Para catálogos >500 productos, algunos quedan invisibles. La paginación client-side es solo sobre los primeros `limit` items. El "ordenamiento" client-side no representa el orden global. |
| **Endpoint actual** | `GET /ecommerce/catalogo?limit=500` |
| **Contrato requerido** | `GET /ecommerce/catalogo?offset=0&limit=24&search=...&categoria=...&ordenar=precio_asc` con respuesta `{total, offset, limit, data}` |
| **Campos requeridos** | `offset: int`, `limit: int`, `total: int` en respuesta |
| **Pruebas necesarias** | Verificar que `total` sea consistente con el `offset` solicitado |
| **Fase sugerida** | WEB-2B |
| **Solución temporal WEB-2A** | Paginación client-side sobre los primeros 500 productos (tamaño de página 24). Documentado en comentario del código. |

---

## GAP-002 — Filtros Server-Side Avanzados

| Campo | Valor |
|-------|-------|
| **Prioridad** | P1 |
| **Problema** | El backend solo filtra por `search` (ILIKE nombre/SKU/desc) y `categoria` (ILIKE). Filtros por `marca`, `precio_min/max`, `talla`, `color`, `modalidad`, `disponibilidad` no existen en el servidor. |
| **Riesgo** | Los filtros client-side solo operan sobre los productos ya descargados. Si hay >500 productos y el usuario filtra por talla M, puede no ver todos los productos de talla M que existen. El filtrado no es global — es sobre la muestra recibida. |
| **Endpoint actual** | `GET /ecommerce/catalogo?search=...&categoria=...` |
| **Contrato requerido** | `GET /ecommerce/catalogo?marca=...&precio_min=0&precio_max=100000&talla=M&color=Rosa&modalidad=ENTREGA_INMEDIATA` |
| **Campos requeridos** | `marca (str)`, `precio_min (float)`, `precio_max (float)`, `talla (str)`, `color (str)`, `modalidad (ENTREGA_INMEDIATA|POR_PEDIDO)`, `disponible (bool)` |
| **Pruebas necesarias** | Filtros combinados devuelven resultados coherentes con la base de datos |
| **Fase sugerida** | WEB-2B |
| **Solución temporal WEB-2A** | Filtros aplicados client-side sobre la muestra. Marcado en comentarios del código. |

---

## GAP-003 — Ordenamiento Server-Side

| Campo | Valor |
|-------|-------|
| **Prioridad** | P1 |
| **Problema** | El backend siempre devuelve productos `ORDER BY nombre ASC`. No hay parámetro de ordenamiento. |
| **Riesgo** | El ordenamiento "Precio menor a mayor", "Más recientes", etc. solo ordena los primeros N productos recibidos — no representa el ordenamiento global del catálogo completo. |
| **Endpoint actual** | `GET /ecommerce/catalogo` → siempre `ORDER BY nombre` |
| **Contrato requerido** | Parámetro `ordenar: 'nombre_asc' | 'precio_asc' | 'precio_desc' | 'recientes' | 'relevancia'` |
| **Campos requeridos** | `ordenar (str enum)` en query params |
| **Pruebas necesarias** | Los primeros N resultados con `ordenar=precio_asc` tengan precio ≤ a los siguientes N |
| **Fase sugerida** | WEB-2B |
| **Solución temporal WEB-2A** | Ordenamiento client-side con nota explícita que no es global. |

---

## GAP-004 — Disponibilidad Real en Tiempo Real (Pública)

| Campo | Valor |
|-------|-------|
| **Prioridad** | P0 |
| **Problema** | `stock_disponible` mostrado al cliente puede ser el campo manual de `ecommerce_products`, no el calculado en tiempo real. Solo se recalcula cuando el backend puede vincular el `sku` del producto a un `ProductSKU` en ERP. |
| **Riesgo** | Cliente ve "Disponible" con 10 unidades, pero el stock real NEBULAE puede ser diferente. Riesgo de sobreventa si el campo manual está desactualizado. |
| **Endpoint actual** | `GET /ecommerce/catalogo/{id}` incluye `stock_disponible` (puede ser manual) y `modalidad_disponible` (calculado solo si SKU vinculado) |
| **Contrato requerido** | Endpoint público `GET /ecommerce/catalogo/{id}/disponibilidad` que siempre calcule `_get_real_sellable_stock()` y devuelva `{stock_vendible, modalidad, fuente: 'real' | 'manual'}` |
| **Campos requeridos** | `stock_vendible: float`, `modalidad: enum`, `fuente: 'real'|'manual'`, `timestamp: ISO` |
| **Pruebas necesarias** | Verificar que el campo `fuente=real` usa `InventoryOwnerBalance.owner=NEBULAE` y descuenta reservas activas |
| **Fase sugerida** | WEB-2B (P0 — antes del checkout real) |
| **Solución temporal WEB-2A** | Mostrar "Disponibilidad sujeta a confirmación" para productos ENTREGA_INMEDIATA. No mostrar cifra exacta como garantía. |

---

## GAP-005 — Slugs Estables por Producto

| Campo | Valor |
|-------|-------|
| **Prioridad** | P1 |
| **Problema** | Los productos no tienen un campo `slug` en la tabla `ecommerce_products`. La URL `/store/producto/{id}` usa el ID numérico, que puede cambiar si se migran datos. |
| **Riesgo** | URLs de producto no son canónicas ni persistentes. Links compartidos pueden romperse. SEO débil. |
| **Endpoint actual** | `GET /ecommerce/catalogo/{id}` — ID numérico |
| **Contrato requerido** | Campo `slug: str` en `ecommerce_products`, único, estable. Endpoint `GET /ecommerce/catalogo/slug/{slug}` |
| **Campos requeridos** | `slug: str` (unique, generado de nombre, inmutable salvo admin) |
| **Pruebas necesarias** | Slug persiste ante cambios de nombre. Redirect automático de slug anterior a nuevo. |
| **Fase sugerida** | WEB-2B |
| **Solución temporal WEB-2A** | URLs con ID numérico. `<link rel="canonical">` apunta a URL con ID. |

---

## GAP-006 — SKU/Variante Inequívoca para Checkout

| Campo | Valor |
|-------|-------|
| **Prioridad** | P0 |
| **Problema** | El checkout requiere `sku_id` (ID de `ProductSKU` en ERP) o `sku` (código de SKU). La tabla `ecommerce_products` puede no tener un `ProductSKU` vinculado. El campo `variantes` en la respuesta del catálogo no incluye `sku_id`. |
| **Riesgo** | El checkout falla con "SKU no encontrado" si el producto no está vinculado a un `ProductSKU`. Bloquea la compra. |
| **Endpoint actual** | `GET /ecommerce/catalogo/{id}` incluye `variantes: []` pero sin `sku_id` garantizado |
| **Contrato requerido** | Cada variante debe incluir `sku_id: int` (FK a `product_skus.id`) para que el checkout pueda enviar `items[].sku_id` |
| **Campos requeridos** | `variantes[].sku_id: int`, `sku_id: int` en el producto principal cuando no hay variantes |
| **Pruebas necesarias** | `POST /ecommerce/pedidos` con `sku_id` del catálogo → 201. Con `sku_id` inválido → 404. |
| **Fase sugerida** | WEB-3 (bloquea checkout) |
| **Solución temporal WEB-2A** | Carrito almacena `product_id` y `sku` string. Checkout (WEB-3) deberá resolver `sku_id` antes de llamar al endpoint. |

---

## GAP-007 — Atributos Filtrables por Categoría

| Campo | Valor |
|-------|-------|
| **Prioridad** | P2 |
| **Problema** | No existe un endpoint que devuelva los atributos disponibles para una categoría (ej: "Ropa" tiene Talla, Color; "Calzado" tiene Talla, Material). Los filtros de talla/color son genéricos y aplican a todos. |
| **Riesgo** | Filtros incorrectos presentados al usuario. Experiencia confusa. |
| **Contrato requerido** | `GET /ecommerce/categorias/{id}/atributos` → `[{nombre: "Talla", valores: ["S","M","L","XL"]}]` |
| **Fase sugerida** | WEB-2B |
| **Solución temporal WEB-2A** | Filtros derivados de los atributos de productos cargados (dinámicos, no vacíos). Solo se muestran si hay productos con ese atributo. |

---

## GAP-008 — SEO: Metadata Dinámica de Producto

| Campo | Valor |
|-------|-------|
| **Prioridad** | P1 |
| **Problema** | Las páginas de producto son `'use client'`. Next.js no puede generar `<title>` ni `<meta description>` dinámicos del servidor para estas páginas con los datos del producto. |
| **Riesgo** | Páginas de producto no indexadas correctamente por Google. Falta Open Graph para compartir en redes sociales. |
| **Contrato requerido** | No requiere backend nuevo — requiere refactoring a Server Component wrapper en frontend (WEB-2B). |
| **Fase sugerida** | WEB-2B |
| **Solución temporal WEB-2A** | `document.title` actualizado client-side (no indexable). Campos `seo_titulo`, `seo_descripcion` ya presentes en la respuesta. |

---

## GAP-009 — Sincronización ERP → Catálogo Web

| Campo | Valor |
|-------|-------|
| **Prioridad** | P1 |
| **Problema** | Los productos de `ecommerce_products` se crean/actualizan manualmente desde el panel admin. No hay sincronización automática desde el catálogo ERP (`products`/`product_skus`). |
| **Riesgo** | Precios desactualizados, productos sin publicar, inconsistencias entre ERP y tienda. |
| **Contrato requerido** | Trigger o job que sincronice automáticamente cambios en `product_skus.sale_price` → `ecommerce_products.precio_venta`. |
| **Fase sugerida** | WEB-2B o paralelo con operaciones |

---

## GAP-010 — Promociones Configurables

| Campo | Valor |
|-------|-------|
| **Prioridad** | P2 |
| **Problema** | No hay un concepto de "Promoción" o "Colección" configurable en el backend. "Promociones" como categoría o sección necesita infraestructura. |
| **Contrato requerido** | `GET /ecommerce/colecciones` → `[{slug, nombre, criterio: 'descuento_pct > 0'}]` |
| **Fase sugerida** | WEB-3 |

---

## Resumen de Prioridades

| Gap | Descripción | Prioridad |
|-----|-------------|-----------|
| GAP-004 | Disponibilidad real (sobreventa) | **P0** |
| GAP-006 | SKU/variante para checkout | **P0** |
| GAP-001 | Paginación server-side | **P1** |
| GAP-002 | Filtros server-side | **P1** |
| GAP-003 | Ordenamiento server-side | **P1** |
| GAP-005 | Slugs estables producto | **P1** |
| GAP-008 | SEO metadata server-side | **P1** |
| GAP-009 | Sincronización ERP → web | **P1** |
| GAP-007 | Atributos por categoría | P2 |
| GAP-010 | Promociones configurables | P2 |
