# TD-03 Parte 3: Doble-escritura y reconciliación de id en el catálogo web

**Rama:** `consolidacion-td03-parte3-doble-escritura-catalogo`
**Base:** `consolidacion-td03-parte2-catalogo-cutover` @ `1eaf25e`
**Fecha:** 2026-09-20

## 1. Contexto

TD-03 Partes 1 y 2 ya están completas, revisadas y cerradas (mantenidas sin fusionar por decisión del usuario, cada una en su propia rama):

- **Parte 1** construyó `ProductWebListing` como esquema canónico paralelo a `ecommerce_products`, con un script de backfill que copia filas existentes por coincidencia de `sku`.
- **Parte 2** construyó la lectura canónica detrás del flag `CATALOGO_LECTURA` (`"legacy"` por defecto, `"canonico"` para activarla) en los 3 endpoints GET de catálogo (`/catalogo`, `/catalogo/{id}`, `/categorias`), incluyendo un esquema de id negativo para huérfanos (`ecommerce_products` sin `ProductSKU.sku` correspondiente).

El review final de Parte 2 encontró un hallazgo **Critical (C-1)**, documentado explícitamente como bloqueador de activación: el panel de administración (`frontend/src/app/dashboard/ecommerce/page.tsx`) recibe de las rutas GET (ya conscientes del flag) el `id` que sea — positivo (`ProductSKU.id`) o negativo (`-ecommerce_products.id`) — y se lo reenvía tal cual a `PATCH`/`DELETE /ecommerce/catalogo/{id}`, que **no tienen ningún cambio de Parte 2** y siguen interpretando `id` únicamente como `ecommerce_products.id`. Con la lectura canónica activa, esto corrompe o falla silenciosamente las ediciones/borrados de cualquier producto emparejado (id positivo).

**Tensión de alcance resuelta con el usuario:** el plan original de Parte 3 (documentado en la investigación de Fase C) asumía un período de observación en producción real antes de retirar `ecommerce_products`. La regla permanente del proyecto es que nada se promueve a producción hasta terminar el prompt maestro de 14 fases completo. Se resuelve escribiendo y probando exhaustivamente la doble-escritura **ahora**, detrás del mismo flag, sin activarlo en ningún entorno real — el `DROP TABLE ecommerce_products` y el retiro de `_ensure_ecommerce_tables()` quedan explícitamente diferidos a una futura "Parte 4", a planear cuando la observación en producción real sea posible.

## 2. El problema concreto que resuelve esta parte

Hoy, `PATCH`/`DELETE /ecommerce/catalogo/{id}` ejecutan directamente `UPDATE`/`DELETE ... WHERE id=:id` sobre `ecommerce_products`, sin ninguna noción del flag ni de espacios de id distintos. Bajo lectura canónica activa, un `id` positivo que el panel admin reenvía desde un GET significa `ProductSKU.id` — una fila que casi nunca coincide por casualidad con una fila real de `ecommerce_products.id`. El resultado es edición/borrado de la fila equivocada, un 404 inesperado, o un no-op silencioso.

Esto debe reconciliarse **antes** de que activar el flag en cualquier entorno sea seguro — es el prerrequisito que Parte 2 dejó documentado.

## 3. Alcance

**Dentro de alcance:**
- `POST /ecommerce/catalogo` (`create_catalogo_product`, `ecommerce.py:1016`)
- `PATCH /ecommerce/catalogo/{id}` (`update_catalogo_product`, `ecommerce.py:1029`)
- `DELETE /ecommerce/catalogo/{id}` (`delete_catalogo_product`, `ecommerce.py:1051`)
- `GET /ecommerce/stats` (`get_ecommerce_stats`, `ecommerce.py:316`) — cuarto consumidor de `ecommerce_products`, descubierto durante la exploración de esta parte, no contemplado por Parte 2.

**Fuera de alcance (explícitamente diferido):**
- El `DROP TABLE ecommerce_products` y el retiro de `_ensure_ecommerce_tables()` — "Parte 4", futura, sin fecha.
- Cualquier cambio a campos propios de `Product`/`ProductSKU`/`Category`/`Brand` (identidad real del producto, inventario) a través de estos endpoints.
- Cambios de frontend — ninguno es necesario (ver sección 5.2).
- Activar `CATALOGO_LECTURA=canonico` en cualquier entorno real — sigue bloqueado por la regla permanente de no-promoción del proyecto.

## 4. Esquema

**Sin migración de Alembic.** Esta parte reutiliza exclusivamente columnas ya existentes: las 15 columnas originales de `ProductWebListing` (Parte 1) más las 5 añadidas en Parte 2 (`impuesto_pct`, `sub_categoria`, `variantes`, `alerta_stock_minimo`, `created_by`), y la tabla `ecommerce_products` tal cual existe hoy.

## 5. Diseño de escritura unificada

### 5.1 Condición de branching (aplica a UPDATE y DELETE)

```python
def _es_id_canonico(product_id: int) -> bool:
    return _lectura_canonica() and product_id > 0
```

Esta condición até el signo al estado del flag deliberadamente: `ecommerce_products.id` es `SERIAL` (siempre positivo), así que con el flag apagado todo id entrante es un id legacy positivo. Ramificar solo por signo, sin mirar el flag, rompería el modo legacy en cualquier instalación donde el flag esté apagado. Cuando `_es_id_canonico()` es falso, el id efectivo sobre `ecommerce_products` es `abs(product_id)` — con el flag apagado esto es un no-op (`abs()` de un id ya positivo), preservando el código legacy byte-por-byte; con el flag encendido e id negativo, recupera el `ecommerce_products.id` original del huérfano.

### 5.2 CREATE — sin cambios de código

`create_catalogo_product` hoy solo ejecuta `INSERT INTO ecommerce_products (...)`; nunca ha tocado `Product`/`ProductSKU`. Un producto creado por este endpoint es, y seguirá siendo, un huérfano bajo lectura canónica (id negativo) — y el fallback de huérfanos ya construido en Parte 2 (`_serialize_catalogo_item_huerfano`, `_list_catalogo_canonico`) ya lo muestra correctamente sin ningún cambio. Sembrar un `Product`/`ProductSKU`/`ProductWebListing` nuevo desde este endpoint sería alcance no requerido por la seguridad del cutover: la propiedad que la doble-escritura necesita garantizar — que alternar el flag no pierda ni oculte datos — ya se cumple para CREATE tal como está.

**Confirma también por qué no se requieren cambios de frontend:** el panel admin ya solo reenvía el `id` que las rutas de lectura (conscientes del flag) le devuelven; con CREATE sin tocar, y UPDATE/DELETE reconciliando el id de forma transparente, el panel sigue funcionando exactamente igual sin ningún cambio de código de UI.

### 5.3 UPDATE

**Ruta legacy** (`not _es_id_canonico(product_id)`): código actual sin modificar, ejecutado con `abs(product_id)`.

**Ruta canónica** (`_es_id_canonico(product_id)`), nueva función `_update_catalogo_producto_canonico(db, sku_id, body)`:

1. Busca `ProductSKU` por `id == sku_id`; 404 si no existe.
2. Restringe los campos aceptados del `body` al subconjunto propio de `ProductWebListing`: `precio_comparacion, descuento_pct, impuesto_pct, sub_categoria, alerta_stock_minimo, publicado_web, rastrear_inventario, seo_titulo, imagenes, variantes, descripcion_larga, seo_descripcion, seo_keywords, codigo_aduana, peso_kg, notas_internas, created_by`. Cualquier otra clave del body (`nombre`, `marca`, `categoria`, `precio_venta`, `stock_disponible`, `sku`, `tipo_producto`) se **ignora silenciosamente** — consistente con el comportamiento ya existente de `update_catalogo_product`, que hoy también ignora silenciosamente cualquier clave fuera de su lista `allowed`.
3. Si `ProductSKU.web_listing` no existe todavía: crea uno nuevo, sembrado con los valores por defecto documentados en el spec de Parte 2 (`descuento_pct=0, impuesto_pct=0, publicado_web=True, rastrear_inventario=True, alerta_stock_minimo=5, sub_categoria="", imagenes=[], variantes=[]`, `precio_comparacion` = `sku.sale_price`, `seo_titulo` = nombre del producto), y luego aplica los campos presentes en el body sobre esos defaults.
4. Si ya existe: aplica solo los campos presentes en el body sobre la fila existente.
5. Sincroniza un espejo en `ecommerce_products` mediante una función única `_upsert_espejo_ecommerce_products(db, canon_sku)`: busca por `sku = ProductSKU.sku`. La fila (exista ya o se inserte nueva) se escribe **completa**, recalculando las 28 columnas desde el estado combinado actual de `Product` + `ProductSKU` + `ProductWebListing` (no solo los campos presentes en el body del PATCH) — `nombre`/`descripcion`/`categoria`/`marca` desde `Product`, `sku`/`precio_venta` desde `ProductSKU`, el resto desde `ProductWebListing` (con los mismos defaults de la sección 5.3.3 si el listing no existía). Esto evita que una fila espejo recién creada quede con columnas en `NULL`/default que no reflejan el producto real — la fila espejo debe poder sostenerse por sí sola como registro legacy completo si el flag se apaga después. `ecommerce_products.sku` no tiene restricción `UNIQUE` en su definición (`_ensure_ecommerce_tables`, línea 279), así que la búsqueda-antes-de-escribir es a nivel de aplicación, no un `ON CONFLICT` de base de datos.

**Limitación conocida y aceptada — corregida tras el review final de rama, alcance real verificado contra el código del formulario, no solo estimado:** `frontend/src/app/dashboard/ecommerce/page.tsx:97` envía el formulario **completo** en cada PATCH (`JSON.stringify(form)`), no un subconjunto curado. El `form` (línea 52-78) incluye 25 campos; el allowlist canónico solo acepta 16 de ellos. Para un producto emparejado (id positivo) bajo el flag activo, los siguientes **9 campos se ignoran silenciosamente, sin error visible**: `nombre`, `descripcion`, `sku`, `tipo_producto`, `precio_venta` (el precio de venta real, no el de comparación), `categoria`, `marca`, `stock_disponible`, `atributos`. En términos del panel: toda la pestaña "Información General", el precio de venta en "Ventas/Precios", el campo de stock en "Inventario", y la pestaña "Atributos" quedan inertes — el usuario ve "Producto actualizado" pero esos campos específicos no cambian. Los 16 campos que sí aplican (`descripcion_larga`, `precio_comparacion`, `descuento_pct`, `impuesto_pct`, `sub_categoria`, `alerta_stock_minimo`, `publicado_web`, `rastrear_inventario`, `codigo_aduana`, `peso_kg`, `notas_internas`, `seo_titulo`, `seo_descripcion`, `seo_keywords`, `imagenes`, `variantes`) sí se guardan correctamente. El diseño en sí (el allowlist) es correcto — son genuinamente las únicas columnas de `ProductWebListing` — pero la superficie real de "esto no hace nada" es mucho mayor de lo que la primera versión de este spec transmitía. Aceptable igual para una herramienta administrativa interna durante el período detrás de flag (el flag permanece apagado hasta una futura Parte 4), pero cualquier decisión futura de activación debe conocer este alcance real, no la versión subestimada.

### 5.4 DELETE

**Ruta legacy** (`not _es_id_canonico(product_id)`): código actual sin modificar, ejecutado con `abs(product_id)`.

**Ruta canónica** (`_es_id_canonico(product_id)`), nueva función `_delete_catalogo_producto_canonico(db, sku_id)`:

1. Busca `ProductSKU` por `id == sku_id`; 404 si no existe.
2. Borra únicamente su `ProductWebListing` (si existe) — nunca el `ProductSKU` ni el `Product`. Esta es una garantía estructural, no solo de convención: ninguna función de escritura de estos endpoints, bajo ningún signo de id, ejecuta `DELETE`/`db.delete()` sobre `products` ni `product_skus`.
3. Si existe una fila espejo en `ecommerce_products` (`sku = ProductSKU.sku`), la borra también. Si no existe, no-op (no es un error).

**Prueba de seguridad obligatoria:** un test de regresión dedicado crea un producto canónico completo, lo borra vía `DELETE /catalogo/{id positivo}`, y afirma explícitamente que `ProductSKU` y `Product` **siguen existiendo** en la base de datos después de la llamada. Esta prueba existe específicamente para que cualquier cambio futuro que introduzca un borrado en cascada hacia el producto real falle de inmediato.

### 5.5 `/ecommerce/stats`

`get_ecommerce_stats` cuenta hoy `productos_publicados` con `SELECT COUNT(*) FROM ecommerce_products WHERE publicado_web=TRUE` (línea 335), sin ninguna noción del flag — ya desalineado con la semántica de "publicado" que Parte 2 estableció (un `ProductSKU` sin `ProductWebListing` cuenta como publicado por defecto).

Nueva función `_count_publicados_canonico(db) -> int`, que reutiliza la misma lógica de "publicado" que `_list_catalogo_canonico` ya usa (unión de emparejados vía `(ProductWebListing.publicado_web == True) | (ProductWebListing.id.is_(None))` más huérfanos publicados vía el mismo `NOT EXISTS`), como conteo en vez de serialización completa. `get_ecommerce_stats` gana el mismo guard de 2 líneas que los otros 4 endpoints: `if _lectura_canonica(): prod_pub = _count_publicados_canonico(db)` antes del cálculo legacy existente.

## 6. Flag

Se reutiliza `_lectura_canonica()` (ya definida en Parte 2, lee `CATALOGO_LECTURA` en cada request vía `os.environ.get(...)`, nunca cacheada a nivel de import) — no se introduce un flag nuevo. La doble-escritura solo tiene sentido activa junto con la lectura canónica: son la misma superficie de cutover.

## 7. Estrategia de pruebas

Archivo nuevo: `backend/tests/test_td03_parte3_doble_escritura_catalogo.py`. Casos:

1. `test_update_canonico_con_listing_existente_sincroniza_ambos_lados` — flag on, id>0, `ProductWebListing` ya existe → se actualiza, y la fila espejo en `ecommerce_products` también.
2. `test_update_canonico_sin_listing_previo_crea_listing_y_espejo` — flag on, id>0, sin `ProductWebListing` previo → se crea con defaults+patch, y se crea una fila espejo nueva en `ecommerce_products`.
3. `test_update_canonico_ignora_campos_fuera_de_alcance` — flag on, id>0, body incluye `nombre`/`marca` → la respuesta es exitosa, mas `Product.name`/`Product.brand` quedan sin cambios.
4. `test_update_huerfano_con_flag_on_usa_ruta_legacy` — flag on, id<0 → comportamiento legacy exacto (prueba de regresión de que el branching no rompe la ruta de huérfanos).
5. `test_update_con_flag_off_ignora_signo_y_usa_ruta_legacy` — flag off, id positivo (como siempre lo envía el panel admin en modo legacy) → comportamiento legacy exacto, confirmando que `_es_id_canonico()` protege el modo legacy.
6. `test_delete_canonico_borra_listing_y_espejo_pero_no_el_producto_real` — flag on, id>0 → `ProductWebListing` y espejo desaparecen; `ProductSKU`/`Product` **siguen existiendo**. La prueba de seguridad crítica de la sección 5.4.
7. `test_delete_canonico_sin_espejo_no_falla` — flag on, id>0, sin fila espejo previa → la operación tiene éxito igual.
8. `test_delete_huerfano_con_flag_on_usa_ruta_legacy` — flag on, id<0 → comportamiento legacy exacto.
9. `test_stats_flag_off_cuenta_solo_ecommerce_products` — comportamiento actual sin cambios.
10. `test_stats_flag_on_cuenta_emparejados_y_huerfanos_publicados` — fixture controlado (ej. 2 emparejados publicados, 1 emparejado no publicado, 1 huérfano publicado) → `productos_publicados == 3`.

Agregadas tras el review final de rama (findings I-2, I-4 parcial, M-1):

11. `test_update_canonico_luego_flag_off_muestra_valores_editados_via_legacy` — la prueba de round-trip que valida la garantía central de esta parte: PATCH bajo flag canónico, apagar el flag, GET legacy → los valores editados se ven a través de la ruta vieja.
12. `test_update_canonico_404_si_sku_id_no_existe` — id positivo bajo flag canónico sin `ProductSKU` correspondiente → 404.
13. `test_delete_canonico_404_si_sku_id_no_existe` — mismo caso para DELETE.
14. `test_update_canonico_sin_campos_relevantes_devuelve_400` — body con solo campos fuera de alcance → 400, igual que la ruta legacy, sin crear ningún `ProductWebListing` a medias.

Todas las pruebas existentes de Parte 1/2 deben seguir pasando sin modificación (ninguna toca las funciones que esta parte modifica).

## 8. Rama y baseline

Worktree creado en `.worktrees/consolidacion-td03-parte3-doble-escritura-catalogo`, rama `consolidacion-td03-parte3-doble-escritura-catalogo`, basada en `consolidacion-td03-parte2-catalogo-cutover @ 1eaf25e` (no en `main` de Mirror, por la misma razón que Parte 2 partió de Parte 1: depende del código canónico de lectura aún no fusionado). `backend/.env` copiado desde el worktree de Parte 2 (brecha conocida: `git worktree add` no copia archivos ignorados por git).

Verificación de entorno: `pytest tests/ --collect-only` recolecta las 567 pruebas sin errores en este commit exacto. Nota aparte, sin acción requerida: `pytest --collect-only` ejecutado sin acotar a `tests/` (es decir, desde la raíz de `backend/`) falla con 3 errores de colección por archivos `test_results_v4.txt`/`v5.txt`/`v6.txt` — archivos de texto ya versionados en el repositorio desde antes de Parte 2, con contenido no-UTF8, que el descubrimiento automático de pytest interpreta como módulos de prueba cuando no se acota la ruta. El comando real de la suite completa siempre acota a `tests/` y no se ve afectado; se documenta aquí solo para que quede registrado, no como hallazgo de esta parte.

## 9. Riesgos y mitigaciones

- **Riesgo:** olvidar atar el branching de signo al flag rompería el modo legacy en cualquier instalación con el flag apagado. **Mitigación:** la condición compuesta `_es_id_canonico()` en un solo lugar, más los casos de prueba 4 y 5 que verifican explícitamente ambas combinaciones cruzadas (flag-on/id-negativo y flag-off/id-positivo).
- **Riesgo:** condiciones de carrera en el upsert del espejo bajo ediciones concurrentes (dos PATCH simultáneos al mismo SKU podrían ambos tomar la rama INSERT y crear filas espejo duplicadas). **Mitigación:** ninguna en este código — el endpoint legacy tampoco protege contra esto hoy, y el volumen de uso de este panel administrativo interno no lo justifica en esta fase. El cierre real requiere una restricción `UNIQUE` sobre `ecommerce_products.sku`, que necesita una migración de Alembic — explícitamente fuera de alcance de esta parte (ver Sección 4). Queda como precondición de la futura Parte 4, junto con el `DROP TABLE` del sunset.
- **Riesgo/limitación aceptada:** el guardado de campos fuera de alcance sobre un producto emparejado no produce error visible al usuario del panel — alcance real (9 campos, incluyendo precio de venta y stock) corregido y documentado en la Sección 5.3 tras el review final de rama. **Mitigación:** documentado explícitamente; no se oculta como comportamiento accidental.
- **Riesgo (hallazgo I-4 del review final de rama, no mitigado en esta parte):** ids positivos quedan obsoletos si el flag se activa y luego se desactiva y reactiva, o si una pestaña del navegador queda abierta desde antes de una activación futura — un id que hoy no existe como `ProductSKU.id` podría existir mañana (o viceversa), y un `PATCH`/`DELETE` con un id obsoleto editaría/borraría silenciosamente el listing de un producto real distinto al que el usuario cree estar editando. Esto reabre, en el momento de activación, la misma clase de problema que C-1 describía para la lectura. **Mitigación:** ninguna en esta parte — el flag permanece apagado, así que el riesgo no es alcanzable hoy. **Precondición dura para la futura Parte 4 (activación en producción):** forzar recarga/invalidación de caché del panel admin en el momento exacto del flip del flag, para que ninguna pestaña abierta conserve ids de antes del cambio.
- **Residual explícito:** esta parte deja la doble-escritura correcta y completamente probada, pero **no habilita** la activación en ningún entorno real — eso permanece bloqueado por la regla permanente de no-promoción del proyecto hasta completar el prompt maestro de 14 fases. La "Parte 4" (observación en producción real + `DROP TABLE`) queda sin fecha, a planear cuando esa observación sea posible.

## 10. Criterios de éxito

- Los 3 endpoints de escritura y `/stats` ramifican correctamente por `_es_id_canonico()` / `_lectura_canonica()`.
- El comportamiento legacy (flag apagado) queda preservado byte-por-byte — verificado con pruebas de regresión explícitas, no solo por inspección.
- Las 14 pruebas nuevas de la sección 7 pasan, incluyendo la prueba de seguridad de no-borrado-del-producto-real y la prueba de round-trip flag-canónico→flag-legacy.
- La suite completa mantiene el piso de ruido histórico ya establecido (22 failed, 1 skipped, 7 errors) más las pruebas nuevas de esta parte, todas en verde.
- Cero migraciones de esquema nuevas. Cero cambios de frontend.
