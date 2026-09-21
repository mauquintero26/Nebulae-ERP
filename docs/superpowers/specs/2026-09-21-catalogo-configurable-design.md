# Catálogo Configurable — Categorías, Variantes y Migración — Design

## Contexto

El descubrimiento del 2026-09-21 (`docs/audit/2026-09-21-flujo-comercial-completo-discovery.md`) confirmó que Nebulae tiene dos catálogos de producto en paralelo:

- **Legacy** (`ecommerce_products`, tabla con SQL crudo): es el que la tienda real usa hoy. Categoría/subcategoría son texto libre sin relación real a ninguna tabla. Las "variantes" son un bloque JSON sin estructura fija.
- **Canónico** (`Product` / `ProductSKU` / `Attribute` / `AttributeValue` / `ProductWebListing`, en `backend/app/models/catalog.py`): tiene el modelo correcto para categorías reales y variantes reales (talla, color, etc.), construido en TD-03, pero sin interfaz de usuario para administrar categorías ni para crear productos con variantes. El flag `CATALOGO_LECTURA` decide de cuál catálogo se lee; hoy está apagado (`legacy`) en todos los entornos.

Este documento diseña lo necesario para que el catálogo canónico sea real y usable — categorías administrables, un asistente para crear productos con variantes, y una migración de los productos legacy existentes — **sin** decidir todavía cuándo se activa `CATALOGO_LECTURA` en producción real. Esa activación es una decisión posterior, separada, tomada con calma después de validar todo en el entorno local.

## Decisiones ya confirmadas con el usuario

1. Este trabajo NO enciende `CATALOGO_LECTURA` en ningún entorno compartido/producción. Se valida en local primero.
2. Categoría y subcategoría son el mismo concepto con una relación "padre" (jerarquía de un solo modelo, no dos tablas separadas).
3. La creación de producto con variantes usa un asistente de varios pasos: datos base → elegir atributos → escribir valores → tabla de combinaciones autogenerada para precio/stock.
4. Los productos legacy actuales SÍ se migran al catálogo canónico: automático para todo lo que migra sin ambigüedad (nombre, precio, stock, marca, imágenes, categoría), y marcados como "Requiere revisión" los que tenían variantes en el JSON libre, para completarlos a mano con el asistente nuevo.

## Arquitectura

Se construye sobre el modelo canónico ya existente (`backend/app/models/catalog.py`), sin tocar el mecanismo de doble-escritura de TD-03 (`_upsert_espejo_ecommerce_products`, `_es_id_canonico`, etc. en `backend/app/api/v1/ecommerce.py`) ni el flag `CATALOGO_LECTURA`. Tres piezas nuevas, independientes entre sí en cuanto a implementación pero que comparten el mismo modelo de datos:

1. Jerarquía y administración de categorías.
2. Asistente de creación de producto con variantes.
3. Script de migración de productos legacy.

```
Panel Admin (frontend)
  ├─ Pantalla "Categorías"  ──────────►  API categorías (nueva: PUT/DELETE + jerarquía)
  ├─ Asistente "Nuevo Producto" ──────►  API creación masiva de SKUs (nueva)
  └─ Filtro "Requiere revisión" ──────►  (lee flag puesto por la migración)

Script de migración (una sola vez, manual)
  ecommerce_products (legacy)  ──────►  Product + ProductSKU + ProductWebListing + Category (canónico)
```

## Componente 1 — Jerarquía de categorías

**Modelo de datos:** agregar a `Category` (`backend/app/models/catalog.py`) una columna `parent_id` (entero, opcional, referencia a `categories.id`). Una categoría con `parent_id = NULL` es de primer nivel; una con `parent_id` apuntando a otra es su subcategoría. No hay límite artificial de profundidad, aunque el uso esperado es de 2 niveles.

**Reglas de negocio:**
- Una categoría no puede ser su propio ancestro (rechazar si al asignar `parent_id` se formaría un ciclo).
- No se puede borrar una categoría que tenga subcategorías o productos asociados (rechazar con un mensaje claro indicando cuántos productos/subcategorías la usan).
- El nombre de categoría se compara sin distinguir mayúsculas/minúsculas para evitar duplicados accidentales ("Ropa" y "ropa" son la misma).

**API (`backend/app/api/v1/catalog.py`):** hoy solo existen crear y listar categorías. Agregar:
- Editar una categoría (nombre y/o padre), aplicando las reglas de negocio de arriba.
- Borrar una categoría, aplicando la regla de bloqueo de arriba.
- El listado debe traer suficiente información para construir el árbol en el frontend (id, nombre, parent_id).

**Frontend:** nueva pantalla de administración de categorías (ubicación sugerida: junto a la gestión de productos en Inventario). Vista de árbol expandible, con acciones para crear categoría de primer nivel, crear subcategoría dentro de una existente, editar nombre, y borrar (deshabilitado visualmente si tiene contenido dentro, con el mensaje de por qué).

## Componente 2 — Asistente de creación de producto con variantes

**Flujo (4 pasos):**
1. Datos base: nombre, marca, categoría (selector jerárquico del Componente 1), descripción, imágenes.
2. Atributos: elegir atributos existentes (Talla, Color, ...) o crear uno nuevo; para cada atributo, escribir sus valores (ej. Talla: S, M, L).
3. Combinaciones: el sistema genera automáticamente todas las combinaciones posibles (producto cartesiano) como filas de una tabla; el usuario completa precio y stock por fila. Debe incluir una acción de "aplicar a todas" para precio/stock cuando la mayoría de combinaciones comparten el mismo valor.
4. Revisión y guardado: resumen de lo que se va a crear antes de confirmar.

**Backend:** el endpoint actual de creación de SKU (`catalog.py:103-129`) crea un SKU a la vez. Se necesita un endpoint nuevo que reciba el producto base más la lista completa de combinaciones y cree todo en una sola transacción (el producto, los valores de atributo que no existan todavía, y cada SKU con sus vínculos de atributo). Si algo falla a mitad de camino, no debe quedar nada a medias — todo o nada.

**Frontend:** la pantalla `dashboard/inventario/productos` ya crea y lista productos canónicos (ya llama a `POST /products` y `GET /products`), pero hoy con un formulario simple sin variantes y con categoría de solo lectura. El asistente de 4 pasos **reemplaza el formulario de creación actual de esa misma pantalla** — no es una pantalla nueva y separada.

**Validaciones:** no permitir combinaciones de atributo-valor duplicadas dentro del mismo producto; exigir precio y stock (o marcar explícitamente "por pedido" si aplica, reutilizando la lógica ya existente de `ENTREGA_INMEDIATA`/`POR_PEDIDO` que confirmó el descubrimiento).

## Componente 3 — Migración de catálogo legacy

Script de una sola ejecución (no es una migración de Alembic — Alembic es para estructura, esto es transformación de datos de negocio), pensado para poder re-ejecutarse sin duplicar nada (idempotente).

**Cambios de modelo necesarios primero:**
- `Product.legacy_ecommerce_product_id` (entero, opcional, único): guarda de qué fila legacy vino este producto, para que re-correr el script no cree duplicados.
- `Product.necesita_revision` (booleano, default falso): marca los productos cuyas variantes no se migraron automáticamente.

**Por cada fila de `ecommerce_products`:**
1. Resolver (buscar o crear) la `Category` para el texto de `categoria`; si tiene `sub_categoria`, resolver/crear esa como hija de la anterior.
2. Crear el `Product` (nombre, descripción, marca, categoría resuelta), con `legacy_ecommerce_product_id` apuntando a la fila de origen.
3. Crear un `ProductSKU` base con el precio, stock y código de SKU ya existentes, y su `ProductWebListing` correspondiente (para que el mecanismo de espejo de TD-03 lo reconozca igual que a cualquier producto canónico).
4. Si el campo `variantes` de la fila legacy tiene contenido no trivial, marcar `necesita_revision = true` en el producto creado.
5. Si ya existe un `Product` con ese `legacy_ecommerce_product_id` (re-ejecución), saltar la fila sin duplicar.

**Frontend:** en la misma pantalla `dashboard/inventario/productos` (Componente 2), filtro/insignia visible "Requiere revisión" para encontrar fácilmente los productos migrados que faltan completar con variantes reales; cada uno abre el asistente prellenado con sus datos base.

## Cómo se prueba sin riesgo

`CATALOGO_LECTURA` ya es una variable de entorno independiente por instalación. Todo este trabajo se valida con el flag encendido en el entorno local (donde ya se está probando la app), viendo el flujo completo de verdad — crear categoría, crear producto con variantes, verlo aparecer en la tienda de prueba, venderlo — sin que esto afecte en absoluto a producción real, que permanece con el flag apagado hasta una decisión explícita posterior.

## Pruebas automatizadas requeridas

- **Categorías:** crear, editar, rechazo de ciclos, rechazo de borrado con contenido dentro, coincidencia sin distinguir mayúsculas.
- **Asistente/creación masiva de SKUs:** creación de N combinaciones en una transacción, rechazo de combinaciones duplicadas, rollback completo si una combinación falla a mitad de camino.
- **Migración:** producto simple sin variantes migra completo; producto con JSON de variantes no trivial queda marcado `necesita_revision`; categoría/subcategoría con distinto uso de mayúsculas no crea duplicados; re-ejecutar el script sobre datos ya migrados no crea filas duplicadas.

## Fuera de alcance (explícito)

- Activar `CATALOGO_LECTURA=canonico` en producción o en cualquier entorno compartido — decisión futura separada.
- Reconstruir automáticamente atributos/valores reales a partir del JSON libre de variantes legacy — se marca para revisión manual en vez de adivinar.
- Cualquier cambio al mecanismo de doble-escritura o al esquema de signos de ID que ya construyó TD-03.
