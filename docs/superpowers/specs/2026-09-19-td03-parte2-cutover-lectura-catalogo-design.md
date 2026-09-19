# TD-03 Parte 2 — Cutover de Lectura del Catálogo (Design Spec)

**Fecha:** 2026-09-19
**Estado:** Aprobado por el usuario en sesión de brainstorming, pendiente de plan de implementación.
**Rama:** `consolidacion-td03-parte2-catalogo-cutover`, creada desde `consolidacion-td03-parte1-catalogo` (no desde `main` — Parte 2 depende del código de Parte 1, que aún no está fusionado).
**Precede a:** `docs/superpowers/plans/2026-09-19-td03-parte2-cutover-lectura-catalogo.md` (a escribir con `superpowers:writing-plans`).
**Referencias:** `docs/audit/2026-09-17-fase-c-investigacion.md` sección 3; `docs/superpowers/plans/2026-09-17-td03-parte1-catalogo-web-listings.md` (sección "Qué sigue").

## 1. Contexto

TD-03 Parte 1 creó `product_web_listings` (hogar canónico para los campos de marketing/SEO que solo existían en la tabla raw-SQL `ecommerce_products`) y un script de backfill que copia esos datos por coincidencia exacta de SKU. Parte 1 está completo, revisado (review final + fix round + re-review acotado, todo limpio) y cerrado, pero **no fusionado** a `main` del Mirror (el usuario eligió mantener la rama tal cual).

Parte 2 es el "cutover de lectura": hacer que 3 endpoints de solo lectura dejen de depender de `ecommerce_products` y lean del catálogo canónico (`Product`/`ProductSKU`/`Category`/`Brand`) más `product_web_listings`, preservando el contrato JSON de salida para no romper `frontend/src/app/store/**`.

**Fuera de alcance de Parte 2** (es Parte 3, planeada por separado): doble-escritura en `POST/PATCH/DELETE /ecommerce/catalogo`, período de observación en producción, y apagado de `ecommerce_products`. Parte 2 es puramente de lectura y aditiva.

## 2. Problemas concretos que motivan esto

1. **Bug de fraude falso-positivo (ya documentado en la auditoría de Fase C):** `GET /ecommerce/catalogo` muestra `ecommerce_products.precio_venta`, pero `POST /ecommerce/pedidos` (`create_web_order`) valida ese mismo precio contra `ProductSKU.sale_price`. Si divergen, un cliente legítimo ve su checkout rechazado como "manipulación de precios detectada".
2. **Bug de espacio de IDs (encontrado durante el brainstorming de Parte 2, no documentado antes):** `GET /catalogo` devuelve `ecommerce_products.id` para productos que están en esa tabla, pero `ProductSKU.id` para productos "solo canónicos" (rama de relleno que ya existe hoy en `list_catalogo`). `GET /catalogo/{id}` busca primero en `ecommerce_products.id`, y si no encuentra, cae a `Product.id` — no a `ProductSKU.id`. Para un producto "solo canónico", el id que la lista entrega no es el que el detalle espera: el click-through probablemente ya resuelve al producto equivocado o da 404.

## 3. Alcance

Exactamente 3 endpoints en `backend/app/api/v1/ecommerce.py`, todos GET, todos detrás de un feature flag:
- `GET /ecommerce/catalogo` (`list_catalogo`)
- `GET /ecommerce/catalogo/{product_id}` (`get_catalogo_product`)
- `GET /ecommerce/categorias` (`get_categorias_web`)

No se toca: `create_web_order`, `_get_authorized_ecommerce_warehouses`, `_ensure_ecommerce_tables`, ni los endpoints de escritura del catálogo (`POST/PATCH/DELETE /catalogo`). No se toca código de frontend — el contrato JSON de salida debe ser compatible con lo que `frontend/src/app/store/**` ya consume hoy.

## 4. Esquema y backfill

Nueva migración Alembic (revisa desde `fa6_010`) que agrega a `product_web_listings` las 5 columnas identificadas por el review final de Parte 1 (hallazgo I-3) como sin hogar canónico:

| Columna | Tipo | Default |
|---|---|---|
| `impuesto_pct` | `NUMERIC(5,2)` | `0`, NOT NULL |
| `sub_categoria` | `VARCHAR(200)` | NULL |
| `variantes` | `JSON` | `'[]'`, NOT NULL |
| `alerta_stock_minimo` | `INTEGER` | `5`, NOT NULL |
| `created_by` | `VARCHAR(150)` | NULL |

`categoria` y `marca` **no** se agregan — ya tienen hogar canónico vía `Product.category_id`→`Category.name` y `Product.brand_id`→`Brand.name`.

`atributos` tampoco se agrega — no es un campo huérfano; existe una relación real `Attribute`/`AttributeValue` vía la tabla de asociación `sku_id`/`attribute_value_id` ya en `catalog.py`. En la ruta de lectura nueva se deriva de ahí, serializado como lista de `{atributo, valor}`. El storefront no renderiza `atributos` hoy (no aparece en ningún archivo de `frontend/src/app/store/**`), así que esto es solo por completitud de API, no crítico.

**Backfill:** se extiende `backend/scripts/backfill_product_web_listings.py` (el mismo script de Parte 1, no uno nuevo) para copiar también estas 5 columnas nuevas al hacer el match por SKU. Mismo patrón idempotente (`ON CONFLICT (sku_id) DO NOTHING`), mismos huérfanos reportados igual que hoy.

**Lección aplicada de Parte 1 (hallazgo C-1 del review final):** la nueva revisión de migración debe agregarse al mismo allowlist de heads válidos usado en `test_z_fase3_migrations.py` y `test_z_fase4_migrations.py` — se nos olvidó hacerlo con `fa6_010` en Parte 1 y fue el hallazgo Crítico del review final. El plan de implementación debe incluir este paso explícitamente como parte de la tarea de migración, no como una tarea separada que se pueda saltar.

## 5. Ruta de lectura unificada

### 5.1 `GET /catalogo` (lista) y `GET /catalogo/{id}` (detalle)

El `id` devuelto pasa a ser siempre `ProductSKU.id` — unifica el espacio de IDs y de paso corrige el bug de la sección 2.2.

Fuente de cada campo (cuando el producto tiene `ProductSKU` coincidente):
- `nombre`, `descripcion` ← `Product.name`, `Product.description`
- `sku`, `precio_venta` ← `ProductSKU.sku`, `ProductSKU.sale_price` (corrige el bug de fraude falso-positivo de la sección 2.1)
- `categoria`, `marca` ← `Product.category.name`, `Product.brand.name`
- `descripcion_larga`, `precio_comparacion`, `descuento_pct`, `impuesto_pct`, `sub_categoria`, `imagenes`, `variantes`, `alerta_stock_minimo`, `publicado_web`, `rastrear_inventario`, `codigo_aduana`, `peso_kg`, `notas_internas`, `seo_titulo`, `seo_descripcion`, `seo_keywords`, `created_at`, `updated_at`, `created_by` ← `ProductWebListing` si existe; si no (SKU canónico aún no respaldado), los mismos defaults que ya usa hoy la rama "solo canónico" de `list_catalogo` (descuento_pct=0, publicado_web=True, rastrear_inventario=True, etc.)
- `atributos` ← relación `Attribute`/`AttributeValue` (ver sección 4)
- `tipo_producto` ← `Product.type` (acepta la diferencia de convención de valores frente a `ecommerce_products.tipo_producto`; ya es así hoy en la rama "solo canónico", que hardcodea `"Fisico"` — Parte 2 generaliza ese comportamiento existente, no introduce una discrepancia nueva)
- `stock_disponible`, `modalidad_disponible`, `is_low_stock` ← sin cambios, ya se calculan en vivo vía `_get_real_sellable_stock`

**Huérfanos** (fila de `ecommerce_products` cuyo `sku` no coincide con ningún `ProductSKU`, incluyendo `sku` NULL): se incluyen usando el mismo código de lectura de `ecommerce_products` que existe hoy, aplicado solo a ese subconjunto — antes era la fuente principal de todo, ahora es el fallback solo para lo que el catálogo canónico no cubre. `GET /catalogo/{id}` intenta `ProductSKU.id` primero; si no resuelve, cae a `ecommerce_products.id` (igual que hoy, pero como fallback en vez de intento principal).

### 5.2 `GET /categorias`

Combina `Category.name` + `ProductWebListing.sub_categoria` (vía `LEFT JOIN Product`→`ProductSKU`→`ProductWebListing`) con las categorías/subcategorías distintas de las filas huérfanas de `ecommerce_products` — para no perder ninguna categoría que solo exista ahí.

El filtro `publicado_web=TRUE` debe tratar la ausencia de fila en `ProductWebListing` como `TRUE` (`COALESCE(ProductWebListing.publicado_web, TRUE)`), igual que el default declarado en la sección 5.1. Si no se hace así, un SKU canónico sin listing todavía aparecería en `GET /catalogo` pero su categoría no aparecería en `GET /categorias` — inconsistente con la lista principal.

## 6. Feature flag

Variable de entorno `CATALOGO_LECTURA`, leída en cada request (no cacheada al importar), default `"legacy"`:
- `CATALOGO_LECTURA=canonico` → ruta nueva (sección 5) en los 3 endpoints.
- Cualquier otro valor o ausente → código actual, sin ningún cambio de comportamiento.

Mismo estilo que `ALEMBIC_ENV` en `preflight.py` (modo nombrado, no booleano suelto), consistente con la convención ya usada en este código. Por defecto Parte 2 queda completamente inerte — ni siquiera dentro del Mirror cambia el comportamiento salvo que alguien fije la variable explícitamente.

## 7. Estrategia de pruebas

Archivo nuevo: `backend/tests/test_td03_parte2_cutover_lectura.py`.

- **Flag OFF (default):** test de regresión — la respuesta de los 3 endpoints es idéntica a la de hoy para los mismos fixtures. Protege contra romper la ruta legacy sin querer al tocar el mismo archivo.
- **Flag ON:**
  - SKU canónico con `ProductWebListing` completo → todos los campos vienen de la fuente nueva, `id` es `ProductSKU.id`.
  - SKU canónico sin `ProductWebListing` todavía → defaults correctos.
  - Huérfano puro de `ecommerce_products` (sin SKU coincidente) → sigue apareciendo, con su propio `ecommerce_products.id`.
  - `GET /catalogo/{id}`: resuelve correctamente tanto por `ProductSKU.id` (canónico) como por `ecommerce_products.id` (huérfano).
  - **Prueba de mayor prioridad del plan:** `precio_venta` devuelto por `GET /catalogo` (flag ON) coincide exactamente con el valor que `create_web_order` valida — regresión directa del bug de fraude falso-positivo de la sección 2.1.
  - `sub_categoria` viaja correctamente a través de `GET /categorias` cuando viene de `ProductWebListing`.
  - Roundtrip de migración para las columnas nuevas (patrón `test_z_fase*_migrations.py`), incluyendo el allowlist de heads (ver sección 4).

## 8. Rama y baseline

Worktree ya creado: `.worktrees/consolidacion-td03-parte2-catalogo-cutover`, rama `consolidacion-td03-parte2-catalogo-cutover`, ramificada desde `consolidacion-td03-parte1-catalogo` (no desde `main`). HEAD en `fe28cea` — el mismo commit que Parte 1 dejó confirmado limpio dos veces (`22 failed, 528 passed, 1 skipped, 7 errors`) minutos antes de crear este worktree. No se vuelve a correr la suite completa como baseline por ser el mismo árbol exacto ya verificado; la primera corrida completa de esta rama ocurre al cierre de la Tarea de pruebas de Parte 2.

## 9. Riesgos y mitigaciones

- **Riesgo:** el fallback de huérfanos oculta silenciosamente productos que deberían fusionarse al catálogo canónico. **Mitigación:** fuera de alcance resolverlo aquí (es limpieza de datos, no código), pero el backfill de Parte 1 ya reporta huérfanos explícitamente — no es un riesgo nuevo introducido por Parte 2.
- **Riesgo:** cambiar el espacio de `id` podría romper algo que dependa del valor exacto de `ecommerce_products.id` fuera de los 3 endpoints tocados. **Mitigación:** el flag por defecto en `"legacy"` hace este cambio invisible hasta que se active explícitamente; búsqueda en frontend confirma que el único uso de `product.id` es navegación `Link href` y `addToCart`, ambos indiferentes a qué tabla origina el id mientras sea estable y el detalle lo resuelva.
- **Riesgo:** `tipo_producto` cambia de convención de valores (`"Bienes"` → valores de `Product.type`). **Mitigación:** ya es así hoy en la rama "solo canónico" de `list_catalogo`; no es una regresión nueva.

## 10. Criterios de éxito

- Los 3 endpoints producen, con `CATALOGO_LECTURA=canonico`, una respuesta funcionalmente equivalente a la actual (mismos campos, mismo tipo de dato) para productos ya respaldados por Parte 1.
- El bug de fraude falso-positivo deja de ser reproducible con el flag activado (prueba explícita, sección 7).
- Cero productos desaparecen de `GET /catalogo` con el flag activado, comparado con hoy (huérfanos incluidos vía fallback).
- Suite completa limpia con el mismo baseline histórico de la rama (`22 failed, 528 passed, 1 skipped, 7 errors`, ajustado solo por los tests nuevos de este plan) tanto con el flag ON como OFF.
- Con el flag en su default (`legacy`), cero cambios de comportamiento observables.
