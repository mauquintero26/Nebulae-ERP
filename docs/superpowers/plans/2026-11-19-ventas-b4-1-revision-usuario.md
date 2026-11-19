# Ventas B4.1: arreglos de la revisión del Bloque 4 (plan de implementación)

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para
> implementar este plan tarea por tarea. Los pasos llevan casillas (`- [ ]`).

**Objetivo:** aplicar las 29 respuestas de la tabla «Respuestas que piden trabajo» de la revisión del Bloque 4 (el esquema de ids
del catálogo, los arreglos de servidor, dos migraciones aditivas y los ajustes de pantalla de Ventas, Compras, Inventario,
E-Commerce, la Agenda y lo transversal) y dejar escrita, sin ejecutarla, la lista de producción.

**Arquitectura:** primero el servidor (FastAPI), en cinco tareas en serie, una por grupo de archivos (migraciones, E-Commerce,
Ventas, Inventario, Compras), con el runner de rollback; después las pantallas (Next.js 16), una tarea por área, con la lógica
nueva en las libs puras de `frontend/src/lib` y sus casos `.mjs`; al final, la verificación de toda la rama y la lista de
producción. Nada se promueve.

**Stack:** FastAPI + SQLAlchemy + PostgreSQL (erp_test) · Alembic 1.19 · Next.js 16 + Tailwind 4 · pruebas `node:assert/strict`.

**Spec:** `C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.superpowers\respaldo-scratchpad-ventas\capturas\respuestas-b4\decisiones-b4.md`
(vinculante: la tabla «Respuestas que piden trabajo»; de la tabla «no piden código» solo A6, que va a la lista de producción).
El contexto de cada clave (archivo:línea, qué pasa hoy y por qué) está en la carpeta SDD del B4,
`C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-bloque4-tablas-kanban-kpis-analisis\.superpowers\sdd\2026-10-04-ventas-bloque4-tablas-kanban-kpis-analisis\`:
`t24-paquete-usuario.md` (busca la clave), `task-24-backend-report.md` § «A1-b: propuesta», `t24-paquete-backend.md` (B32, B33),
`t24-paquete-controlador.md` (B45) y `progress.md` (los rulings).

## Global Constraints

- **Worktree:** `C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-b4-1-revision-usuario`, rama `ventas-b4-1-revision-usuario`,
  desde main `6caf56b` (el Bloque 4 completo). Las rutas de este plan son relativas a esa carpeta. No se toca el checkout `Mirror`
  ni otros worktrees.
- **Pruebas de backend:** SOLO con el runner de ROLLBACK y un módulo a la vez: `cd C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-b4-1-revision-usuario\backend; ALEMBIC_ENV=testing PYTHONIOENCODING=utf-8 C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe tests/rollback_runner.py <modulo>`.
  La salida tiene que decir «Chatwoot real bloqueado 0 veces» y «Base intacta». NUNCA pytest completo ni parametrize.
  En este plan, `runner <modulo>` es ese comando.
- **Un solo runner a la vez** sobre erp_test: T1 → T2 → T3 → T4 → T5 van en serie, y ninguna otra tarea corre el runner mientras
  una de ellas lo usa (regla del ledger del B4: «nunca dos runners»).
- **Pruebas de frontend:** las pruebas del frontend son .mjs con node:assert/strict, agregadas al script "test" de
  frontend/package.json, más `npx tsc --noEmit` (la línea base es de 5 errores ya existentes) y eslint por archivo.
  - Comandos, desde `frontend`: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/<archivo>.mjs`; `npm test` (exit 0);
    `npx tsc --noEmit` (5 errores, los mismos de la línea base); `npx eslint <archivos tocados>` (ningún error nuevo frente al
    mismo archivo en `6caf56b`).
  - Los casos nuevos van en los `.mjs` que YA están en el script "test". El único `.mjs` nuevo es `tests/test_menu_lateral.mjs`
    (T10), y T10 es la única tarea que toca `frontend/package.json`.
- **ROJO primero:** la lógica va en una lib pura con su caso. El mutante se escribe con su texto literal y su AssertionError.
  Cada mutante se aplica a mano con Edit, se corre, se anota la AssertionError que da y se deshace con Edit.
- **PROHIBIDO `git stash`.** Nunca SMTP, Chatwoot, Meta ni producción reales. Nada de credenciales en el código ni en el chat.
  No se lee ni se imprime ningún .env.
- **Cambios parciales en los .tsx** (regla .agents/rules/no-full-tsx-rewrite.md): por secciones, sin reemplazar más del 30 % de
  las líneas de un archivo en una operación. El B4 tenía permiso para pasar del 30 % en las pantallas de tablas; se trata como
  vigente SOLO para los archivos que el B4 ya reescribió (medido con `git diff --numstat c2c9f9f 6caf56b`):
  `solicitud-client.tsx`, `cotizacion-client.tsx`, `venta-client.tsx`, `compras/page.tsx`, `compras/pedidos/page.tsx`,
  `compras/transito/page.tsx`, `compras/recepciones/[id]/page.tsx`, `inventario/page.tsx`, `inventario/kardex/page.tsx`,
  `ecommerce/page.tsx`, `components/flujo/PasosFlujo.tsx` y `components/flujo/BannerFlujo.tsx`. Para todos los demás
  (`venta/[id]/page.tsx`, `solicitud/[id]/page.tsx`, `cotizacion/[id]/page.tsx`, `agenda/page.tsx`, `components/Sidebar.tsx`)
  rige el 30 % sin excepción. Ninguna tarea de este plan necesita la excepción: es solo un techo.
- **Migraciones solo aditivas:** **fa6_034** (el índice de sale_orders(sc_id), A5) y **fa6_035** (moneda y tiempo de entrega del
  proveedor, P33), con down_revision encadenado desde fa6_033 (la cabeza actual). Se aplican a erp_test como parte del plan.
  Nunca en producción. Alembic, desde `backend` en PowerShell: `$env:ALEMBIC_ENV='testing'; & C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe -m alembic <heads|current|upgrade head>`.
- **El Bloque 4.1 NO toca:** GlobalAIChat.tsx, IAPanelSC ni nada de IA o TRM (eso es del Bloque 5, que corre después). P5 queda
  fuera. (P14 mueve el panel derecho del detalle de la SC, que contiene la pestaña IA: se cambia el contenedor, nunca IAPanelSC.)
- **Producción:** el B4.1 no promueve nada. A6, el cambio de ids de A1-b (n → -n) en los datos de producción, el índice y las
  migraciones van a una **lista de producción** (la última tarea), que se ejecuta solo con el OK del usuario al promover. Para
  A1-b, el plan incluye un script de listado de solo lectura y uno de aplicación con `--aplicar` y `--ids`, probado en erp_test
  dentro de la transacción revertida.
- **Capturas:** no las toma ningún implementador. Las toma el controlador al final, en una sola sesión, para una página de
  revisión. La lista de pantallas y anchos está en el último paso de T10.
- **P1:** el cambio correcto de `backend/tests/test_mercancia_transito.py` está descrito en decisiones-b4.md; en este worktree
  se hace ese mismo cambio, como commit propio (T5). No se toca el checkout de Mirror.
- **Datos:** nada se escribe en erp_test fuera de la transacción revertida del runner (salvo `alembic upgrade head` de T1). No se
  tocan SC-20260731, COT-20260449, PVEN-20262799 ni SC-20260746 (los documentos reales de erp_test).
- **Estilo:** textos en español con tildes; avisos con `useAvisos` (nunca alert, confirm ni prompt); estados siempre con su
  etiqueta; las piezas comunes del B4 (TablaEstandar, BannerFlujo, TarjetaKpi, MenuFila, ModalMotivo), sin copias locales.
- **Commits:** en español, `tipo(área): B4.1 Tn (claves) …`, uno por clave o por grupo coherente, cada uno terminado con la línea
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sin push, sin merge, sin amend, sin `--no-verify`. Los
  implementadores no lanzan subagentes.
- **Línea base del runner:** `test_mercancia_transito` 12/1 (pasa a 13/0 con P1 en T5); `test_fase5_security_legacy_surface` 21/1
  (`test_b2_05_webhooks_concurrencia_exactamente_un_pago`, inestable); los de concurrencia conocidos (test_fase4_hardening,
  test_fase4_final_hardening, test_fase4_ventas_lineas_estados) no se corren.

## Decisiones que el código obligó a tomar (para la revisión)

1. **A1-b, datos de producción.** Los ids del catálogo se calculan al serializar: no se guardan. La única tabla que guarda un id del
   catálogo es `social_posts.producto_id` (Marketing › Historias lo toma de `GET /ecommerce/catalogo?limit=200&publicado=true`,
   `frontend/src/app/dashboard/marketing/historias/page.tsx:52` y `:135-138`). Los pedidos web usan `sku_id` y la tienda no guarda
   el carrito. Por eso el «cambio de datos» de A1-b es: el listado de las URL que cambian y, con `--aplicar --ids`, el
   `producto_id` de las historias que apuntaban a una fila SKU.
2. **A1-b, esquema.** El de la propuesta, igual en las dos ramas. El detalle deja de responder por `Product.id` (el respaldo de
   `ecommerce.py:1480-1501` era justo lo que abría otro producto).
3. **A1-f.** Hace falta un campo que diga si la fila se puede editar (el ruling de A1-f prohíbe adivinarlo, y el signo dice el
   origen pero no la rama). Se agrega UNA llave al final de cada fila de la lista, `editable_en_tienda`. Así cambia H16 en esa
   sola llave.
4. **A1-b.** PATCH y DELETE con un id que no existe responden 404 «Producto no encontrado» sin escribir. Hoy responden 200 sin hacer
   nada.
5. **P4.** «La pestaña» se cuenta como los conteos de las pestañas (R5): con la búsqueda, sin estados ni semáforo. Desde una
   pestaña que no se atrasa, el botón muestra el número de Activas, que es adonde lleva. En Kanban muestra el del tablero.
6. **P8.** Solo el vencimiento: la respuesta no nombra fecha_solicitud. Una SC vieja guardó un instante en UTC; de ella se lee su
   día, los 10 primeros caracteres.
7. **P17.** Solo /products, como lo respondió el usuario. La otra mitad de B32 (una sola regla de «sin costo» para el aviso del
   Análisis y para skus_sin_costo) no se hace: queda como duda.
8. **P19.** «Agrupar por mes» es un botón que ordena por '-compra' sin mostrar la columna. El separador suma el monto de la página.
   Los meses no se pliegan.
9. **P20.** Se guarda en `goods_receipt_lines.notes`, una columna que ya existe: no hace falta migración. En una recepción heredada
   sin GRL, el campo queda deshabilitado y dice por qué.
10. **P21.** Acción se queda en 112 px (T24 f3: el anillo de «Completar»), así que se recortan las demás:
    120 + 100 + 104 + 88 + 92 + 88 + 112 = 704.
11. **P24.** Físico y Reservado se ven por defecto desde 1280 px de ventana (la caja mide 1280 − 320 = 960 ≥ 832), así que salen a
    1440. A 1024 siguen ocultas (R26).
12. **P33.** Dos columnas nulas: `suppliers.currency` (COP, USD o EUR) y `suppliers.lead_time_days` (de 0 a 365). Nadie recibe un
    valor inventado.
13. **P3 y P14.** El menú y el panel de Actividad se pliegan por debajo de 768 px (md).
14. **C4.** En la franja, los avisos de cada caja pasan a varias líneas, sin elipsis.
15. **B45.** Las Firmas de GET /ecommerce/catalogo van en los docstrings de `list_catalogo` y `get_catalogo_product`, que están
    versionados. La remisión desde task-20-report-r2.md (fuera de git) la escribe el controlador.

## Review Focus

1. **Una URL vieja de una fila SKU** (`/store/producto/n`, con n = product_skus.id): ya no abre otro producto por Product.id.
   Abre la fila n de ecommerce_products si existe y, si no, da 404. → T2, `test_la_url_vieja_de_una_fila_sku_ya_no_abre_otro_producto`.
2. **Una SC creada entre las 19:00 y las 23:59 de Colombia:** vence el día de Colombia + 5, no el día UTC + 5.
   → T3, `test_vencimiento_de_una_sc_creada_de_noche_es_el_dia_de_colombia`.
3. **«Con atraso (N)» con una búsqueda escrita:** N es lo que muestra la tabla al pulsarlo, con la misma q.
   → T3, `test_atrasados_por_vista_respeta_la_busqueda_como_la_tabla`.
4. **Observaciones físicas no válidas:** con 501 caracteres, un carácter de control o un valor que no es texto, dan 422 legible
   y no escriben ni la cantidad del mismo PATCH. Con solo espacios quedan vacías.
   → T5, `test_observaciones_de_la_linea_se_validan_sin_escribir`.
5. **Un proveedor con «usd »:** se guarda «USD». Un tiempo de entrega «7» vale 7. Con 7.5, -1, 366, «abc» o true da 422, sin
   escribir. → T5, `test_moneda_y_tiempo_de_entrega_se_validan`.

## Mapa de tareas

| Tarea | Área | Claves | Modelo | Depende de |
|---|---|---|---|---|
| T1 | Backend: migraciones y modelos | A5, P33 (datos) | sonnet | — |
| T2 | Backend: E-Commerce | A1-b, P27, B45 | opus | T1 (turno del runner) |
| T3 | Backend: Ventas | P4, P6, P8 | sonnet | T2 (turno del runner) |
| T4 | Backend: Inventario | P15, P16/B33, P17/B32, P25, P26 | sonnet | T3 (turno del runner) |
| T5 | Backend: Compras | P1, P20, P33 | sonnet | T1 (columnas), T4 (turno del runner) |
| T6 | Pantallas: Ventas | P4, P7, P8, P10, P11, P12 | sonnet | T3 |
| T7 | Pantallas: Compras | P18, P19, P20, P21 | sonnet | T5 (puede ir en paralelo con T6) |
| T8 | Pantallas: Inventario | P15, P16, P22, P23, P24, P25, P26 | sonnet | T4, T7 (estados-compras.js y su .mjs) |
| T9 | Pantallas: E-Commerce y Agenda | A1-b (A1-f), P31, P33, P34 | sonnet | T2, T5, T6 (datos-cliente.js), T8 (test_tabla.mjs) |
| T10 | Pantallas: transversal | P3, P14, C4 (+ la lista de capturas) | opus | T6, T9 |
| T11 | Verificación y lista de producción | A6 (+ A5, A1-b, fa6_034/035 en la lista) | sonnet | todas |

## Cobertura (cada clave de «piden trabajo» → su tarea)

| Clave | Tarea(s) |
|---|---|
| A5 | T1 (fa6_034), T11 (lista de producción) |
| A1-b (+ B45) | T2 (servidor, script, Firmas), T9 (A1-f en la pantalla), T11 (lista de producción) |
| P1 | T5 |
| P3 | T10 |
| P4 | T3 (servidor), T6 (pantallas) |
| P6 | T3 |
| P7 | T6 |
| P8 | T3 (creación y «vencidas»), T6 (lectura y edición) |
| P10 | T6 |
| P11 | T6 |
| P12 | T6 |
| P14 | T10 |
| P15 | T4 (kpi), T8 (línea del panel) |
| P16 (B33) | T4 (servidor), T8 (tablero del Kardex) |
| P17 (B32) | T4 |
| P18 | T7 |
| P19 | T7 |
| P20 | T5 (servidor), T7 (pantalla) |
| P21 | T7 |
| P22 | T8 |
| P23 | T8 |
| P24 | T8 |
| P25 | T4 (servidor), T8 (texto del selector) |
| P26 | T4 (servidor), T8 (pantalla) |
| P27 | T2 |
| P31 | T9 |
| P33 | T1 (fa6_035), T5 (servidor), T9 (Agenda) |
| P34 | T9 |
| C4 | T10 |
| A6 (de «no piden código») | T11 |

---

### Task 1: Migraciones fa6_034 y fa6_035 y sus modelos (A5, P33)

**Modelo:** sonnet. **Depende de:** nada.

**Files:**
- Create: `backend/alembic/versions/fa6_034_indice_pedidos_por_solicitud.py`
- Create: `backend/alembic/versions/fa6_035_moneda_y_entrega_proveedor.py`
- Create: `backend/tests/test_b41_migraciones.py`
- Modify: `backend/app/models/erp_documents.py:174` (`SaleOrder.sc_id`) y `:15-30` (`Supplier`)

**Interfaces:**
- Produces: el índice `ix_sale_orders_sc_id` sobre `sale_orders(sc_id)`; las columnas `suppliers.currency VARCHAR(3) NULL` y
  `suppliers.lead_time_days INTEGER NULL`; los atributos `Supplier.currency: Optional[str]` y
  `Supplier.lead_time_days: Optional[int]`. La cabeza de alembic pasa a `fa6_035`.

- [ ] **Paso 1: la cabeza.** `alembic heads` y `alembic current` (con ALEMBIC_ENV=testing) → `fa6_033 (head)` en los dos. Si no, DETENERSE y avisar.
- [ ] **Paso 2: ROJO.** `backend/tests/test_b41_migraciones.py`:

```python
"""B4.1 T1 (A5 y P33): las dos migraciones aditivas del bloque, ya aplicadas a erp_test.
Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_b41_migraciones)."""
import uuid
from sqlalchemy import text
from app.models.erp_documents import Supplier


def test_la_cabeza_es_fa6_035(db):
    assert db.execute(text("SELECT version_num FROM alembic_version")).scalar() == "fa6_035"


def test_sale_orders_tiene_indice_por_sc_id(db):
    filas = db.execute(text("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'sale_orders'")).fetchall()
    assert any(n == "ix_sale_orders_sc_id" and d.endswith("(sc_id)") for n, d in filas), filas


def test_suppliers_tiene_moneda_y_tiempo_de_entrega_nulos(db):
    cols = {r[0]: tuple(r[1:]) for r in db.execute(text(
        "SELECT column_name, data_type, is_nullable, character_maximum_length FROM information_schema.columns "
        "WHERE table_name = 'suppliers' AND column_name IN ('currency', 'lead_time_days')"))}
    assert cols == {"currency": ("character varying", "YES", 3), "lead_time_days": ("integer", "YES", None)}, cols


def test_el_modelo_lee_y_escribe_las_columnas_nuevas(db):
    s = Supplier(name=f"Prov-B41-{uuid.uuid4().hex[:6]}", currency="USD", lead_time_days=21)
    db.add(s); db.commit(); db.refresh(s)
    assert (s.currency, s.lead_time_days) == ("USD", 21)
    nuevo = Supplier(name=f"Prov-B41-{uuid.uuid4().hex[:6]}")
    db.add(nuevo); db.commit(); db.refresh(nuevo)
    assert (nuevo.currency, nuevo.lead_time_days) == (None, None)   # sin valor por defecto: nadie recibe uno inventado
```

- [ ] **Paso 3: correr el ROJO.** `runner test_b41_migraciones` → los 4 en FAIL (cabeza `fa6_033`, sin el índice, sin las columnas,
  y `TypeError: 'currency' is an invalid keyword argument for Supplier`). Ese es el ROJO: la base sin migrar.
- [ ] **Paso 4: fa6_034.** `revision = "fa6_034"`, `down_revision = "fa6_033"`; `upgrade`:
  `op.create_index("ix_sale_orders_sc_id", "sale_orders", ["sc_id"])`; `downgrade`: `op.drop_index("ix_sale_orders_sc_id", table_name="sale_orders")`.
  El docstring dice el porqué, con la medición de A5: sc_con_documentos_activos y pven_vigente_de_sc recorrían sale_orders con
  Seq Scan; la página tardaba 272 ms y 360 ms con columna=No Resuelto, con unas 4.500 filas.
- [ ] **Paso 5: fa6_035.** `revision = "fa6_035"`, `down_revision = "fa6_034"`; `upgrade`: `op.add_column("suppliers", sa.Column("currency", sa.String(3), nullable=True))`
  y `op.add_column("suppliers", sa.Column("lead_time_days", sa.Integer(), nullable=True))`, sin server_default. `downgrade`:
  se niega con `RuntimeError` si alguna fila tiene alguno de los dos valores (el patrón de fa6_033), y si no, borra las dos.
- [ ] **Paso 6: los modelos.** `SaleOrder.sc_id = Column(Integer, ForeignKey("customer_requests.id"), nullable=True, index=True)`
  (la convención de SQLAlchemy lo nombra `ix_sale_orders_sc_id`, el mismo de la migración). `Supplier.currency = Column(String(3), nullable=True)`
  y `Supplier.lead_time_days = Column(Integer, nullable=True)`, después de `payment_terms`.
- [ ] **Paso 7: aplicar a erp_test.** `alembic upgrade head` y después `alembic current` → `fa6_035 (head)`.
- [ ] **Paso 8: VERDE.** `runner test_b41_migraciones` → 4/0. Regresión: `runner test_hub_ventas_listado`, `runner test_listas_ventas_paginadas`
  y `runner test_rollback_runner_fixtures`, los tres en verde.
- [ ] **Paso 9: commits.** `feat(ventas): B4.1 T1 (A5) índice de sale_orders(sc_id) (fa6_034)` y
  `feat(compras): B4.1 T1 (P33) moneda y tiempo de entrega del proveedor (fa6_035)`.

---

### Task 2: E-Commerce en el servidor: esquema de ids (A1-b), tienda heredada (P27), Firmas (B45) y el script de A1-b

**Modelo:** opus. **Depende de:** T1 (solo por el turno del runner).

**Files:**
- Modify: `backend/app/api/v1/ecommerce.py`:
  - `_es_id_canonico` (:92-93); `_serialize_catalogo_item_canonico` (:217-252); `_serialize_catalogo_item_huerfano` (:263-292);
  - `_union_catalogo_heredado` (:393-412); `_get_catalogo_product_canonico` (:502-519);
  - `_serialize_catalogo_item_heredado` (:1285-1323); `_serialize_catalogo_item_sku_heredado` (:1326-1356);
  - `_skus_heredados_de_base` (:1373-1381); `_catalogo_heredado_de_hoy` (:1400-1425);
  - `list_catalogo` (:1428-1457); `get_catalogo_product` (:1469-1508); `update_catalogo_product` (:1530-1556);
    `delete_catalogo_product` (:1558-1565).
- Create: `backend/tests/test_b41_catalogo_ids.py`, `backend/scripts/datos_bloque4_1.py`, `backend/tests/test_datos_bloque4_1.py`
- Modify (pruebas que fijan el esquema viejo; cada cambio con su comentario «B4.1 (A1-b): …»):
  - `backend/tests/test_listas_varias_paginadas.py:331-335` y `:447-448`;
  - `backend/tests/test_catalogo_publico_anonimo.py` (las llamadas con `t.p1.id` o `-t.h1`, y `:211-228`);
  - `backend/tests/test_paridad_catalogo_heredado.py` (`_base_heredado`, `_base_con_ruling`);
  - `backend/tests/test_td03_parte2_cutover_lectura.py` y `backend/tests/test_td03_parte3_doble_escritura_catalogo.py`
    (en la canónica, `sku.id` → `-sku.id` y `-ecom_id` → `ecom_id`);
  - `backend/tests/test_fase5_security_legacy_surface.py:224` (el detalle por `-sku.id`).

**Interfaces:**
- Produces:
  - **Ids**, en las dos ramas: una fila de `ecommerce_products` lleva su id (> 0); un SKU del ERP lleva `-product_skus.id` (< 0).
  - **`editable_en_tienda: bool`**: la última llave de cada fila de la lista; vale `False` solo en las filas SKU de la rama heredada.
  - **`TEXTO_FILA_DEL_ERP = "Ese producto no se puede editar desde el catálogo de la tienda."`**
  - **`_destino_de_escritura(product_id: int) -> tuple[str, int]`** (PATCH y DELETE):
    - en la canónica, con id < 0 → `("sku", -id)`;
    - con id > 0 → `("tienda", id)`;
    - en la heredada, con id < 0 → 404 `TEXTO_FILA_DEL_ERP`;
    - con 0 → 404 «Producto no encontrado».
  - **Detalle:**
    - id > 0 → la fila de ecommerce_products; en la canónica, si su sku es de un ProductSKU, el detalle canónico de ese SKU,
      con `id = -sku.id`;
    - id < 0 → el SKU `-id`; en la heredada, con la forma de `_serialize_catalogo_item_sku_heredado`, y 404 si ese SKU tiene
      algún espejo en ecommerce_products, porque esa fila no existe en la lista;
    - sin respaldo por `Product.id`.
  - **Script:** `scripts/datos_bloque4_1.py catalogo_ids --listar` y `catalogo_ids --aplicar --base <bd> --ids <ids> [--respaldo <carpeta>]`;
    `listar_catalogo_ids(db) -> Listado`, `aplicar_catalogo_ids(db, base, ids, carpeta_respaldo=CARPETA_DATOS) -> ResultadoAplicar`,
    `main(argv=None) -> int`. `CARPETA_DATOS = <raíz>/.superpowers/sdd/2026-11-19-ventas-b4-1-revision-usuario/datos` (git la ignora).
- Consumes: de `scripts/datos_bloque3.py`, `AVISO_PRODUCCION`, `BASE_PRODUCCION`, `ErrorDatos`, `Listado`, `Seccion`,
  `ResultadoAplicar`, `texto_listado` y `_marcar_no_aplicado`; de `scripts/correcciones_bloque1.py`, `base_actual` e
  `iniciar_solo_lectura` (se importan, no se copian).

- [ ] **Paso 1: ROJO de A1-b.** `backend/tests/test_b41_catalogo_ids.py`, con `_Catalogo`, `_ok`, `_ramas`, `_nombres` y `CATALOGO`
  importados de `tests.test_listas_varias_paginadas`, y `_escribe(v)` = las sentencias INSERT, UPDATE o DELETE de la ventana
  (como en test_catalogo_publico_anonimo.py: `_ensure_ecommerce_tables` hace un commit en cada petición, así que se miran las
  sentencias, no los commits):

```python
TEXTO_FILA_DEL_ERP = "Ese producto no se puede editar desde el catálogo de la tienda."

def test_ids_de_las_filas_en_las_dos_ramas(app_client, db, warehouse, monkeypatch, admin_token):
    t = _Catalogo(db, warehouse)
    llamadas = [({}, admin_token), ({"offset": 0}, admin_token), ({"publicado": "true", "limit": 50}, None),
                ({"orden": "nombre"}, None)]
    for rama in _ramas(monkeypatch):
        for params, token in llamadas:
            filas = {x["sku"]: x for x in _ok(app_client, CATALOGO, token, search=t.s, **params)["data"]}
            ids = [x["id"] for x in filas.values()]
            assert len(ids) == len(set(ids)), (rama, params, ids)                       # A1-f: claves de fila únicas
            assert filas[t.p2.sku]["id"] == -t.p2.id, (rama, params)                    # el auto: SKU sin espejo
            assert filas[f"ORF-{t.s}-1"]["id"] == t.h1, (rama, params)                   # el huérfano: su id
            assert filas[f"ORF-{t.s}-1"]["editable_en_tienda"] is True, (rama, params)
            if rama == "legacy":
                assert filas[t.p1.sku]["id"] == t.m1, (rama, params)                   # la nevera: su espejo
                assert filas[t.p2.sku]["editable_en_tienda"] is False, (rama, params)
            else:
                assert filas[t.p1.sku]["id"] == -t.p1.id, (rama, params)
                assert filas[t.p2.sku]["editable_en_tienda"] is True, (rama, params)

def test_ida_y_vuelta_de_la_lista_al_detalle(app_client, db, warehouse, monkeypatch, admin_token):
    t = _Catalogo(db, warehouse)
    for rama in _ramas(monkeypatch):
        for token in (None, admin_token):
            for fila in _ok(app_client, CATALOGO, token, search=t.s, publicado="true", limit=50)["data"]:
                resp = app_client.get(f"{CATALOGO}/{fila['id']}", headers=_auth(token))
                assert resp.status_code == 200, (rama, token is not None, fila["id"], resp.text)
                d = resp.json()["data"]
                assert (d["sku"], d["nombre"]) == (fila["sku"], fila["nombre"]), (rama, fila["id"])
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    d = app_client.get(f"{CATALOGO}/{t.m1}").json()["data"]                         # la URL de hoy de un espejo
    assert (d["sku"], d["id"]) == (t.p1.sku, -t.p1.id)                               # abre el SKU tras el corte

def test_patch_y_delete_de_una_fila_sku_no_tocan_la_fila_ajena(app_client, db, warehouse, monkeypatch, admin_token, contador_sql):
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    t = _Catalogo(db, warehouse)
    antes = _fila_ajena_con_el_id(db, t.p2.id, t.s)     # A1: la fila n de ecommerce_products y el SKU n
    for metodo, extra in (("patch", {"json": {"publicado_web": False}}), ("delete", {})):
        with contador_sql.ventana() as v:
            resp = getattr(app_client, metodo)(f"{CATALOGO}/{-t.p2.id}", headers=_auth(admin_token), **extra)
        assert (resp.status_code, resp.json()) == (404, {"detail": TEXTO_FILA_DEL_ERP}), (metodo, resp.text)
        assert _escribe(v) == [], metodo
        assert _fila(db, t.p2.id) == antes, metodo

def test_patch_y_delete_de_una_fila_propia_siguen_funcionando(app_client, db, warehouse, monkeypatch, admin_token):
    t = _Catalogo(db, warehouse)
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    assert _patch(app_client, admin_token, t.h1, {"nombre": f"Zz-{t.s}-Editado"}).status_code == 200
    assert _nombre_ep(db, t.h1) == f"Zz-{t.s}-Editado"
    assert app_client.delete(f"{CATALOGO}/{t.h2}", headers=_auth(admin_token)).status_code == 200
    assert _nombre_ep(db, t.h2) is None
    monkeypatch.setenv("CATALOGO_LECTURA", "canonico")
    assert _patch(app_client, admin_token, -t.p2.id, {"publicado_web": False}).status_code == 200
    db.expire_all()
    assert db.query(ProductWebListing).filter_by(sku_id=t.p2.id).one().publicado_web is False
    assert _patch(app_client, admin_token, t.h1, {"nombre": f"Zz-{t.s}-Otra"}).status_code == 200   # huérfano canónico, +id

def test_un_id_que_no_existe_da_404_sin_escribir(app_client, db, monkeypatch, admin_token, contador_sql):
    for rama, ids in (("legacy", (0, 2_000_000_000)), ("canonico", (0, 2_000_000_000, -2_000_000_000))):
        monkeypatch.setenv("CATALOGO_LECTURA", rama)
        for ident in ids:
            for metodo, extra in (("patch", {"json": {"nombre": "x"}}), ("delete", {})):
                with contador_sql.ventana() as v:
                    resp = getattr(app_client, metodo)(f"{CATALOGO}/{ident}", headers=_auth(admin_token), **extra)
                assert (resp.status_code, resp.json()) == (404, {"detail": "Producto no encontrado"}), (rama, ident, metodo)
                assert _escribe(v) == [], (rama, ident, metodo)

def test_la_url_vieja_de_una_fila_sku_ya_no_abre_otro_producto(app_client, db, warehouse, monkeypatch):
    """Review Focus 1."""
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    t = _Catalogo(db, warehouse)
    libres = [i for i in (t.p2.id, t.p2.product_id)                     # erp_test es compartida: el id puede estar ocupado
              if db.execute(text("SELECT 1 FROM ecommerce_products WHERE id = :i"), {"i": i}).first() is None]
    assert libres, "ningún id libre: la prueba no mira la URL vieja"
    for ident in libres:
        assert app_client.get(f"{CATALOGO}/{ident}").status_code == 404, ident     # antes: el Product con ese id o 404
    assert app_client.get(f"{CATALOGO}/{-t.p2.id}").json()["data"]["sku"] == t.p2.sku
```

  Ayudantes del módulo:
  - `_fila_ajena_con_el_id(db, ident, s)`: si no hay fila de ecommerce_products con ese id, inserta una con `id = ident`
    (INSERT con el id explícito, dentro de la transacción revertida); devuelve `_fila(db, ident)`.
  - `_fila(db, ident)` = `(id, nombre, publicado_web, updated_at)` de esa fila.
  - `_nombre_ep(db, ident)`: el nombre o None.
  - `_patch(app_client, token, ident, cuerpo)` y `_auth(token)` (`{}` sin token: la llamada anónima).
  - `ProductWebListing` de `app.models.catalog` y `text` de sqlalchemy.

- [ ] **Paso 2: ROJO de P27.** En el mismo módulo:

```python
def test_con_sesion_un_sku_con_espejo_no_sale_como_fila_del_erp(app_client, db, warehouse, monkeypatch, admin_token):
    """P27 (1): con sesión, la rama heredada sin offset también descarta el SKU con CUALQUIER espejo (como el anónimo y como
    la rama paginada): la nevera solo sale como su espejo m1, nunca como la fila del ERP."""
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    t = _Catalogo(db, warehouse)
    db.execute(text("UPDATE ecommerce_products SET publicado_web = FALSE WHERE id = :i"), {"i": t.m1}); db.commit()
    for params, cuantas in (({}, 1), ({"publicado": "true", "limit": 50}, 0), ({"offset": 0}, 1)):
        filas = [x for x in _ok(app_client, CATALOGO, admin_token, search=t.s, **params)["data"] if x["sku"] == t.p1.sku]
        assert [x["id"] for x in filas] == [t.m1] * cuantas, (params, filas)

def test_un_sku_sin_espejo_respeta_la_categoria_y_la_publicacion(app_client, db, warehouse, monkeypatch, admin_token):
    """P27 (2): el auto (p2, Cat-C, sin espejo) ya no sale en todas las categorías ni con publicado=false."""
    monkeypatch.setenv("CATALOGO_LECTURA", "legacy")
    t = _Catalogo(db, warehouse)
    for token in (None, admin_token):
        for extra in ({}, {"offset": 0}, {"publicado": "true", "limit": 50}):
            de_a = _nombres(_ok(app_client, CATALOGO, token, search=t.s, categoria=f"Cat-A-{t.s}", **extra))
            de_c = _nombres(_ok(app_client, CATALOGO, token, search=t.s, categoria=f"Cat-C-{t.s}", **extra))
            assert t.nombres["auto"] not in de_a and t.nombres["auto"] in de_c, (token is not None, extra, de_a, de_c)
    for extra in ({}, {"offset": 0}):
        assert _nombres(_ok(app_client, CATALOGO, admin_token, search=t.s, publicado="false", **extra)) == [t.nombres["h2"]], extra
```

- [ ] **Paso 3: correr el ROJO.** `runner test_b41_catalogo_ids` → 8 FAIL. Antes de implementar, anota la línea de cada FAIL:
  - el id del auto es `t.p2.id` y no `-t.p2.id`;
  - falta `editable_en_tienda` (KeyError);
  - el PATCH de `-n` en la heredada responde 200 y toca la fila ajena;
  - el 404 de un id que no existe es 200;
  - la URL vieja abre el Product;
  - P27 (1): `[p1.id]`;
  - P27 (2): el auto sale en Cat-A.
- [ ] **Paso 4: implementar A1-b** en `ecommerce.py`, con las Interfaces de arriba:
  - **Serializadores:** `_serialize_catalogo_item_canonico` → `"id": -canon_sku.id`; `_serialize_catalogo_item_huerfano` → `"id": r[0]`;
    `_serialize_catalogo_item_sku_heredado` → `"id": -canon_sku.id`; `editable_en_tienda` al final de los cuatro.
  - **`_es_id_canonico`** pasa a `_destino_de_escritura`.
  - **PATCH y DELETE:**
    - canónica con id < 0 → `_update_catalogo_producto_canonico(db, -id, body)` o `_delete_catalogo_producto_canonico(db, -id)`;
    - id > 0 → primero `SELECT id FROM ecommerce_products WHERE id = :id FOR UPDATE`: si no está, 404 «Producto no encontrado»
      ANTES de cualquier UPDATE o DELETE (la prueba mira que la ventana no traiga sentencias de escritura); si está, el UPDATE o
      DELETE por id de hoy, sin `abs()`.
  - **`_get_catalogo_product_canonico`:** id < 0 → SKU; id > 0 → la fila, o el SKU de su espejo.
  - **`get_catalogo_product`** en la heredada: id > 0 → la fila (como hoy, sin el respaldo por Product.id); id < 0 →
    `_serialize_catalogo_item_sku_heredado` del SKU `-id`, con 404 si no existe o si tiene algún espejo; después,
    `_detalle_segun_sesion` en las dos (para el anónimo, `publicado_web` es True en una fila SKU heredada).
- [ ] **Paso 5: implementar P27:**
  - `_catalogo_heredado_de_hoy` usa siempre `_skus_con_espejo_que_pasa(db, skus, {}, [])` (cualquier espejo, con sesión o sin
    ella); el error del anónimo sigue siendo `ERROR_CATALOGO_PUBLICO`.
  - `_skus_heredados_de_base(db, search, categoria, publicado, limit)`:
    - con `publicado is False` → `[]`;
    - con categoría → `.outerjoin(Category, Category.id == Product.category_id).filter(Category.name.ilike(f"%{categoria}%"))`,
      antes del `.limit(limit)`;
    - sin ORDER BY (el orden de BASE).
  - `_union_catalogo_heredado`: en `extra`, `ca.name ILIKE :c` con categoría y `FALSE` con `publicado is False`.
- [ ] **Paso 6: las pruebas que fijaban el esquema viejo.** Cada cambio lleva el comentario «B4.1 (A1-b): …»; ninguna se borra.
  - `CLAVES_CATALOGO_CANONICO` + `"editable_en_tienda"` al final; `:447-448`: el huérfano canónico ahora lleva `t.h1`.
  - test_catalogo_publico_anonimo: las llamadas de la canónica pasan a `-t.p1.id` (SKU) y `t.h1` (huérfano).
    `test_el_respaldo_del_detalle_no_sirve_un_despublicado_sin_sesion` pasa a probar el detalle `-t.p1.id` y `-t.p2.id`:
    sin sesión y con espejo, 404; sin espejo, 200; con sesión, la regla de arriba.
  - test_td03_parte2 y test_td03_parte3: en la canónica, `sku.id` pasa a `-sku.id` y `-ecom_id` pasa a `ecom_id`; en la
    heredada no cambia nada.
  - test_fase5_security_legacy_surface:224: `/catalogo/{-sku.id}`.
  - test_paridad_catalogo_heredado:
    - `_base_heredado` suma, marcado «B4.1 (P27, A1-b)»: la misma consulta de SKU del Paso 5 (categoría con outerjoin antes del
      LIMIT, nada con `publicado is False`), el id `-canon_sku.id` en las filas SKU y `editable_en_tienda` (True en las de
      ecommerce_products, False en las SKU);
    - `_base_con_ruling` quita, con sesión y sin ella, los SKU con cualquier espejo (`_tiene_espejo`);
    - el docstring del módulo lo dice.
- [ ] **Paso 7: VERDE de A1-b y P27.** `runner test_b41_catalogo_ids` → 8/0.
- [ ] **Paso 8: mutantes** (uno por regla; cada uno se deshace después):
  - (a) en `_destino_de_escritura`, quitar la rama de la heredada con id < 0 (dejar `return ("tienda", abs(product_id))`) →
    `test_patch_y_delete_de_una_fila_sku_no_tocan_la_fila_ajena` da `AssertionError: ('patch', ...)` con el 200;
  - (b) en `_skus_heredados_de_base`, quitar el filtro de categoría → `test_un_sku_sin_espejo_respeta_la_categoria_y_la_publicacion`
    da `AssertionError: (False, {}, [...auto...], ...)`;
  - (c) devolver `_skus_con_espejo_que_pasa(db, skus, params, espejo)` cuando hay sesión →
    `test_con_sesion_un_sku_con_espejo_no_sale_como_fila_del_erp` da `AssertionError: ({'publicado': 'true', 'limit': 50}, [...])`.
- [ ] **Paso 9: ROJO del script.** `backend/tests/test_datos_bloque4_1.py` (el patrón de test_datos_bloque3.py). Las historias se
  crean con `marketing._ensure_marketing_tables(db)` y un INSERT en social_posts dentro de la transacción:
  - `test_catalogo_ids_listar_en_solo_lectura`: con un SKU sin espejo y dos historias, una con `producto_id = sku.id` y
    `producto_nombre` = el del producto, y otra con el id de una fila de ecommerce_products y su nombre, se espera:
    - `--listar` no hace commits (`contador_sql`);
    - la sección `urls` trae la fila del SKU, con `/store/producto/{n}` → `/store/producto/-{n}`;
    - la sección `historias` clasifica la primera `sku` y la segunda `tienda`;
    - una nota trae el comando exacto `catalogo_ids --aplicar --base <bd> --ids <id de la primera>`.
  - `test_catalogo_ids_aplicar_cambia_solo_los_ids_aprobados`: `aplicar_catalogo_ids(db, base, ids=[primera])` deja la primera en
    `-n` y la segunda igual; el respaldo JSON (en `tmp_path`) trae `[{"id": primera, "producto_id": n}]`.
  - `test_catalogo_ids_con_otra_base_un_id_fuera_de_la_lista_o_sin_ids_no_escribe`: con otra base, con un id que no es candidata
    o que ya es negativo, o sin `--ids` → `ErrorDatos` con su texto, sin sentencias de escritura ni respaldo aplicado.
  - `test_catalogo_ids_sin_la_tabla_social_posts`: con la tabla «inexistente» (monkeypatch de la comprobación de
    information_schema), el listado dice «La tabla social_posts no existe en esta base: no hay historias que corregir.» y
    `--aplicar` no escribe.
  - `test_main_avisa_si_esta_conectado_a_produccion`: el AVISO_PRODUCCION de datos_bloque3, arriba, en stdout y en stderr.
- [ ] **Paso 10: el script.** `backend/scripts/datos_bloque4_1.py`:
  - **Docstring:** uso, seguridad y cómo deshacer, como datos_bloque3.py; cómo deshacer = por cada fila del JSON,
    `UPDATE social_posts SET producto_id = <producto_id> WHERE id = <id>`.
  - **`--listar`:** corre en `iniciar_solo_lectura` y termina con rollback; imprime la URL enmascarada y `SELECT current_database()`.
  - **Candidatas:** historias con `producto_id > 0` que es el id de un SKU sin espejo. La clase es:
    - `sku` si `producto_nombre` es el nombre de ese producto y no el de la fila de ecommerce_products con ese id;
    - `tienda` si es el de la fila;
    - `dudosa` en otro caso.
  - **`--aplicar`:** exige `--base` igual a `current_database()` y `--ids`; solo acepta candidatas `sku` o `dudosa` todavía
    positivas; escribe el respaldo antes; hace un solo commit; si algo falla, rollback y `_marcar_no_aplicado`.
  - **Textos:** `MENSAJE_FALTA_IDS = "Falta --ids: aplica solo los ids que el usuario aprobó en el --listar."` y
    `MENSAJE_SIN_SOCIAL_POSTS = "La tabla social_posts no existe en esta base: no hay historias que corregir."`.
- [ ] **Paso 11: VERDE del script.** `runner test_datos_bloque4_1` → 5/0. Mutante: aceptar en `--aplicar` un id de clase `tienda` →
  `test_catalogo_ids_con_otra_base_un_id_fuera_de_la_lista_o_sin_ids_no_escribe` da `AssertionError` (el `ErrorDatos` no se lanza).
- [ ] **Paso 12: B45, las Firmas.**
  - En el docstring de `list_catalogo`, una sección «Firmas (B4.1, B45: el único lugar)»:
    - los parámetros: q/search, categoria, publicado, orden, limit 0-500 (100) y offset;
    - los ids (> 0 la fila de ecommerce_products, < 0 `-product_skus.id`) y `editable_en_tienda`;
    - la rama canónica: paginada y con total exacto;
    - la heredada sin offset ni orden: doble fuente con su LIMIT cada una, en el mismo orden de BASE (sin ORDER BY en los SKU;
      no está definido), con el LIMIT antes del descarte y con total no exacto;
    - la heredada con offset u orden: total exacto;
    - las reglas de P27 y lo del anónimo (solo publicados; `ERROR_CATALOGO_PUBLICO`).
  - En el docstring de `get_catalogo_product`, las reglas del detalle de las Interfaces.
  - Sin prueba: es documentación.
- [ ] **Paso 13: regresión** (un módulo a la vez):
  - test_listas_varias_paginadas, test_catalogo_publico_anonimo, test_td03_parte2_cutover_lectura,
    test_td03_parte3_doble_escritura_catalogo y test_fase5_integracion_erp;
  - test_fase5_security_legacy_surface: 21/1, la falla de la línea base;
  - test_ecommerce_errores_visibles, test_products_quick_create, test_td03_backfill_product_web_listings y
    test_catalog_auth;
  - al final `runner test_paridad_catalogo_heredado` (tarda unos 10 min): 3/0.
- [ ] **Paso 14: commits.**
  - `fix(ecommerce): B4.1 T2 (A1-b) un esquema de ids para las dos ramas del catálogo, sin abs()`;
  - `fix(ecommerce): B4.1 T2 (P27) la tienda heredada sin el SKU con espejo y con la categoría de los SKU sin espejo`;
  - `feat(ecommerce): B4.1 T2 (A1-b) listado y aplicación de los ids de las historias (datos_bloque4_1)`;
  - `docs(ecommerce): B4.1 T2 (B45) las Firmas de GET /ecommerce/catalogo en un solo lugar`.
  - La remisión desde task-20-report-r2.md la escribe el controlador.

---

### Task 3: Ventas en el servidor: atrasados por pestaña (P4), búsqueda por teléfono (P6) y vencimiento como día (P8)

**Modelo:** sonnet. **Depende de:** T2 (solo por el turno del runner).

**Files:**
- Modify: `backend/app/api/v1/erp_ventas.py`:
  - `list_solicitudes` (:1989-2050), con los conteos en `:2042-2045`;
  - `list_cotizaciones` (:3202-3268), con la búsqueda en `:3233-3243` y los conteos en `:3259-3262`;
  - `_resumen_solicitudes` (:1961-1983), con «vencidas» en `:1982`;
  - `create_solicitud` (:2054), con el vencimiento en `:2058`;
  - una función nueva, `_atrasados_por_vista`, junto a `_lista_con_rango` (:1848).
- Modify: `backend/tests/test_listas_ventas_paginadas.py` (casos nuevos y `test_sc_resumen_sobre_todas_sin_busqueda_ni_soporte`, :205-240)
- Modify: `backend/tests/test_solicitud_asesor_vencimiento.py:11-19`

**Interfaces:**
- Produces:
  - Con `con_conteos=1`, una clave aditiva en la respuesta:
    - `atrasados_por_vista` de `/ventas/solicitudes` = `{activas, confirmadas, esperan_cotizacion, todas_sin_soporte}`;
    - el de `/ventas/cotizaciones` = `{activas, confirmadas, todas}`;
    - cada valor es cuántas filas de esa pestaña tienen rango ATRASADO, con la búsqueda y los extras y sin vista, estados ni
      semáforo (la base de los conteos, R5); sin `con_conteos`, la respuesta de hoy.
  - La búsqueda de Cotizaciones también encuentra `SalesQuotation.customer_phone`.
  - `fecha_vencimiento` de una SC nueva = las 00:00 del día de Colombia + `dias_vencimiento` (5). «vencidas» del resumen =
    activas con `cast(fecha_vencimiento, Date) < hoy_colombia(ahora)`.
  - `_atrasados_por_vista(db, modelo, tipo: str, base, condiciones: dict, dias, ahora) -> dict`: el rango de
    `rv.expresiones(tipo, modelo, dias, ahora)["rango"]` se calcula UNA vez por fila, con la subconsulta y el `OFFSET 0` de
    `_lista_con_rango`, unida por id; después, `contar_por_vista` sobre las filas con `rango == rv.RANGO["ATRASADO"]`.

- [ ] **Paso 1: ROJO** en test_listas_ventas_paginadas.py:

```python
def test_atrasados_por_vista_de_solicitudes_y_cotizaciones(app_client, db, admin_token, monkeypatch):
    ahora = _reloj(monkeypatch)
    _dias_de_alerta(db, sc=2, cot=2)
    f = _Fabrica(db, ahora)
    f.sc("BORRADOR", _dias(5))                                              # activa y atrasada
    f.sc("BORRADOR", _dias(1))                                              # activa, a tiempo
    f.sc("CONFIRMADA", _dias(5), gate1_confirmed_at=ahora - _dias(5))       # confirmada, espera COT, atrasada
    f.sc("CANCELADA", _dias(9))
    f.cot("BORRADOR", _dias(5))                                             # activa y atrasada
    f.cot("CONFIRMADA", _dias(5), gate2_confirmed_at=ahora - _dias(5))      # confirmada sin pedido, atrasada
    f.cot("RECHAZADA", _dias(9))
    sc = _lista(app_client, admin_token, "SC", q=f.sufijo, con_conteos=1)
    cot = _lista(app_client, admin_token, "COT", q=f.sufijo, con_conteos=1)
    assert sc["atrasados_por_vista"] == {"activas": 1, "confirmadas": 1, "esperan_cotizacion": 1, "todas_sin_soporte": 2}
    assert cot["atrasados_por_vista"] == {"activas": 1, "confirmadas": 1, "todas": 2}
    for tipo, cuerpo in (("SC", sc), ("COT", cot)):                        # = lo que muestra «Con atraso» en esa pestaña
        for vista, n in cuerpo["atrasados_por_vista"].items():
            assert _lista(app_client, admin_token, tipo, q=f.sufijo, vista=vista, semaforo="atrasados")["total"] == n, (tipo, vista)
    assert "atrasados_por_vista" not in _lista(app_client, admin_token, "COT", q=f.sufijo)

def test_atrasados_por_vista_respeta_la_busqueda_como_la_tabla(app_client, db, admin_token, monkeypatch):
    """Review Focus 3."""
    ahora = _reloj(monkeypatch)
    _dias_de_alerta(db, sc=2, cot=2)
    uno, otro = _Fabrica(db, ahora), _Fabrica(db, ahora)
    uno.sc("BORRADOR", _dias(5)); otro.sc("BORRADOR", _dias(5)); otro.sc("ASIGNADA", _dias(5))
    con_q = _lista(app_client, admin_token, "SC", q=uno.sufijo, con_conteos=1)["atrasados_por_vista"]
    assert con_q["activas"] == 1 == _lista(app_client, admin_token, "SC", q=uno.sufijo, vista="activas", semaforo="atrasados")["total"]
    nada = _lista(app_client, admin_token, "SC", q=f"nada-{uno.sufijo}", con_conteos=1)["atrasados_por_vista"]
    assert set(nada.values()) == {0}, nada

def test_cot_se_busca_por_el_telefono_del_cliente(app_client, db, admin_token):
    f = _Fabrica(db, _ahora())
    telefono = "3" + str(uuid.uuid4().int)[:9]
    cot = f.cot("BORRADOR", customer_phone=telefono)
    assert _ids(app_client, admin_token, "COT", q=telefono) == [cot.id], telefono
    assert cot.id in _ids(app_client, admin_token, "COT", q=telefono[3:10]), telefono[3:10]
    assert _lista(app_client, admin_token, "COT", q=telefono, con_conteos=1)["conteos"]["activas"] == 1
```

  - `test_sc_resumen_sobre_todas_sin_busqueda_ni_soporte` (:219-220) cambia, con la nota «B4.1 (P8): el vencimiento es un día de
    negocio»:
    - «activa y vencida» pasa a `fecha_vencimiento=_dia(hoy_colombia(ahora) - _dias(1))`;
    - «vence hoy: no está vencida» pasa a `fecha_vencimiento=_dia(hoy_colombia(ahora))`;
    - el ayudante es `_dia(d) = datetime.combine(d, time())`.
  - En test_solicitud_asesor_vencimiento.py (importa `hoy_colombia` de `app.core.fechas`):

```python
    def test_vencimiento_por_defecto_es_5_dias(self, app_client, admin_token):
        r = app_client.post("/api/v1/ventas/solicitudes", json={"customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
                            "tipo_solicitud": "Cotizacion de Producto"}, headers=_headers(admin_token))
        assert r.status_code == 201
        # B4.1 (P8): un día de negocio, las 00:00 del día de Colombia + 5 (antes, utcnow + 5 días: un instante).
        assert r.json()["data"]["fecha_vencimiento"] == f"{hoy_colombia() + datetime.timedelta(days=5)}T00:00:00"

    def test_vencimiento_de_una_sc_creada_de_noche_es_el_dia_de_colombia(self, app_client, admin_token, monkeypatch):
        """Review Focus 2: el 19 de noviembre a las 22:30 en Colombia (20 a las 03:30 UTC) vence el 24, no el 25."""
        from app.api.v1 import erp_ventas
        monkeypatch.setattr(erp_ventas, "ahora_utc", lambda: datetime.datetime(2026, 11, 20, 3, 30))
        r = app_client.post("/api/v1/ventas/solicitudes", json={"customer_name": f"Cliente-{uuid.uuid4().hex[:6]}"},
                            headers=_headers(admin_token))
        assert r.json()["data"]["fecha_vencimiento"] == "2026-11-24T00:00:00", r.text
```

- [ ] **Paso 2: correr el ROJO.** `runner test_listas_ventas_paginadas` → `KeyError: 'atrasados_por_vista'` (2), `AssertionError: 3…` (el
  teléfono) y el resumen con `'vencidas': 2`. `runner test_solicitud_asesor_vencimiento` → los dos de vencimiento en FAIL.
- [ ] **Paso 3: implementar.**
  - `_atrasados_por_vista` con la firma de las Interfaces. En `list_solicitudes`, con `con_conteos`, se llama sobre `base` con
    `{v: _condicion_vista_solicitudes(v) for v in ("activas", "confirmadas", "esperan_cotizacion", "todas_sin_soporte")}`; en
    `list_cotizaciones`, con `("activas", "confirmadas", "todas")`. El resultado va a
    `respuesta_de_lista(..., atrasados_por_vista=...)` solo con `con_conteos`.
  - P6: `SalesQuotation.customer_phone.ilike(like) |` en la búsqueda.
  - P8:
    - `create_solicitud` → `venc = datetime.datetime.combine(hoy_colombia(ahora_utc()) + datetime.timedelta(days=body.get("dias_vencimiento", 5)), datetime.time())`,
      con `ahora_utc` el de este módulo, para que la prueba lo fije;
    - «vencidas» → `and_(rv.f_sc_activa(sc), cast(sc.fecha_vencimiento, Date) < hoy_colombia(ahora))`;
    - el docstring de `_resumen_solicitudes` lo dice.
- [ ] **Paso 4: VERDE.** Los dos módulos en verde. Mutantes:
  - (a) quitar la línea del teléfono → `AssertionError: 3…` (el número);
  - (b) en «vencidas», volver a `sc.fecha_vencimiento < ahora` → `AssertionError` del dict, con `'vencidas': 2`;
  - (c) en `_atrasados_por_vista`, contar sin el filtro de rango → `AssertionError` del dict de SC.
- [ ] **Paso 5: regresión.** test_listas_ventas_totales, test_hub_ventas_listado, test_flujo_ventas, test_fechas_ventas_utc,
  test_estados_solicitud, test_alertas_resumen, test_sincronizacion_estado_solicitud_cotizacion y test_actividad_cambios_documentos.
  `test_atencion_y_atrasados_calculan_el_rango_una_vez` tiene que seguir en verde: la consulta nueva calcula el CASE una vez.
- [ ] **Paso 6: commits.** `feat(ventas): B4.1 T3 (P4) atrasados por pestaña en las listas de SC y COT`,
  `fix(ventas): B4.1 T3 (P6) la búsqueda de Cotizaciones encuentra el teléfono del cliente` y
  `fix(ventas): B4.1 T3 (P8) el vencimiento de la SC es un día de negocio de Colombia`.

---

### Task 4: Inventario en el servidor: SCRAP y RETURN_IN (P16/B33), tonos (P15), costo y precio > 0 (P17/B32), subcategorías (P25) y orden del Kardex (P26)

**Modelo:** sonnet. **Depende de:** T3 (solo por el turno del runner).

**Files:**
- Create: `backend/app/core/movimientos_inventario.py`
- Modify: `backend/app/core/analisis_inventario.py:56-67` (las direcciones), `:316-327` (los kpi) y las ayudas de Entradas y Salidas.
- Modify: `backend/app/api/v1/erp_inventario.py:275-297` (`_direcciones_del_kardex`) y `:299-360` (`get_kardex`).
- Modify: `backend/app/api/v1/inventory.py:16` y `:152` (DIRECCIONES_OPERACION).
- Modify: `backend/app/api/v1/catalog.py:260-268` (`_producto_dict`).
- Modify: `backend/app/core/existencias.py:104` y `:157-158` (`consulta_existencias`, el filtro de categoría).
- Test: `backend/tests/test_analisis_inventario.py` (`:199-217` y `:412-413`, y casos nuevos);
  `backend/tests/test_operaciones_inventario.py` (`:232-250` el set de parámetros, y casos nuevos);
  `backend/tests/test_stock_tabla.py` (`:446-468` y casos nuevos).

**Interfaces:**
- Produces:
  - `movimientos_inventario.ENTRADAS_KARDEX = ("IN", "ADJUST_IN", "TRANSFER_IN", "RETURN_IN")`;
  - `movimientos_inventario.SALIDAS_KARDEX = ("OUT", "ADJUST_OUT", "TRANSFER_OUT", "SCRAP")`;
  - `movimientos_inventario.DIRECCIONES_KARDEX = ENTRADAS_KARDEX + SALIDAS_KARDEX + ("QUARANTINE",)`.
  - El Análisis usa `ENTRADAS = ("IN", "ADJUST_IN", "RETURN_IN")` y `SALIDAS = ("OUT", "ADJUST_OUT", "SCRAP")`, más los traslados
    con una bodega, como hoy. analisis_inventario, erp_inventario e inventory importan las direcciones del módulo nuevo; no hay
    copias.
  - Los kpi «Valor del inventario» y «Entradas» llevan `mejor="neutro"`.
  - En `/products`, `precio_venta` es el menor `sale_price > 0` y `costo` el menor `cost_price > 0`; si no hay ninguno, None.
  - `existencias.categoria_y_subcategorias(categoria_id: int)`: un `Select` de los ids de la categoría y todas sus descendientes.
    Es un CTE recursivo con UNION, no UNION ALL: un ciclo en parent_id no cuelga la consulta. `consulta_existencias` filtra con
    `Product.category_id.in_(...)`.
  - `GET /inventory/kardex?orden=fecha|-fecha`: por defecto `-fecha`, como hoy. Otro valor da el 422 de `leer_orden`,
    «No se puede ordenar por «x».».

- [ ] **Paso 1: ROJO.**
  - test_analisis_inventario.py:

```python
def test_las_direcciones_viven_en_movimientos_inventario():
    from app.core import analisis_inventario as ai, movimientos_inventario as mi
    assert mi.ENTRADAS_KARDEX == ("IN", "ADJUST_IN", "TRANSFER_IN", "RETURN_IN")
    assert mi.SALIDAS_KARDEX == ("OUT", "ADJUST_OUT", "TRANSFER_OUT", "SCRAP")
    assert set(mi.DIRECCIONES_KARDEX) == {"IN", "OUT", "ADJUST_IN", "ADJUST_OUT", "TRANSFER_IN", "TRANSFER_OUT",
                                          "QUARANTINE", "SCRAP", "RETURN_IN"}
    assert ai.ENTRADAS_KARDEX is mi.ENTRADAS_KARDEX and ai.DIRECCIONES_KARDEX is mi.DIRECCIONES_KARDEX
    assert "ENTRADAS_KARDEX = (" not in Path(ai.__file__).read_text(encoding="utf-8")   # B33: una sola definición

def test_scrap_es_salida_y_return_in_es_entrada(app_client, db, admin_token, product):
    f = _Fabrica(db, product)
    a = f.sku(costo=1_000, nivel=3)
    f.mov(a, "RETURN_IN", 2, _utc(2001, 1, 2, 12))
    f.mov(a, "SCRAP", 1, _utc(2001, 1, 3, 12))
    k = _kpis(_analisis(app_client, admin_token, bodega=f.w.id))
    assert (k["entradas"]["valor"], k["salidas"]["valor"]) == (2, 1)
    assert "devoluciones de clientes" in k["entradas"]["ayuda"] and "pérdidas" in k["salidas"]["ayuda"]
```

    - `test_movimiento_sin_direccion` (:199-217), con la nota «B4.1 (P16): SCRAP es una salida»: el aviso pasa a
      `"2 movimientos sin dirección no se cuentan"` y las salidas a 1; la línea de valores se recalcula con −1 × 1.000 desde el
      día 5.
    - `test_claves_exactas` (:412-413) pasa a `("pesos", "neutro", False), ("unidades", "neutro", False)` para P15.
  - test_operaciones_inventario.py:
    - `test_kardex_orden_por_fecha_en_los_dos_sentidos`: con tres movimientos t1 < t2 < t3 del mismo SKU, `orden=fecha` los da
      ascendentes; `orden=-fecha` y sin orden, descendentes; `orden=cantidad` da 422 «No se puede ordenar por «cantidad».»;
      con `limit=1` y `offset` 0, 1 y 2, ninguno se repite.
    - `test_direccion_salida_incluye_la_perdida_y_entrada_la_devolucion`: una operación cuyo primer movimiento es SCRAP sale con
      `direccion=salida` en `/inventory/operations`, y una con RETURN_IN sale con `direccion=entrada`.
    - En `test_permisos_y_parametros_declarados`, el set del Kardex suma `"orden"`.
  - test_stock_tabla.py:
    - `test_list_products_precio_costo_y_publicado_segun_td03`: P2 pasa de `(7, 0, False)` a `(7, None, False)`, con la nota
      «B4.1 (P17): un 0 es sin costo».
    - `test_list_products_un_cero_es_sin_precio_y_sin_costo`: un producto con SKU (costo 0, precio 0) y (8, 30) da (30, 8);
      uno solo con (0, 0) da (None, None).
    - `test_el_filtro_de_categoria_incluye_las_subcategorias`: padre ← hija ← nieta, con una referencia en la nieta. Con
      `categoria_id` del padre o de la hija, la referencia sale en stock-tabla y en `resumen_existencias(..., categoria_id=)`;
      con una categoría hermana, no. Con dos categorías que se apuntan entre sí (un ciclo), la consulta responde.
- [ ] **Paso 2: correr el ROJO.** `runner test_analisis_inventario`, `runner test_operaciones_inventario` y `runner test_stock_tabla`
  → los nuevos y los ajustados en FAIL (ModuleNotFoundError del módulo nuevo; salidas 0; `'sube'`; el 422 por `orden`; `0` en
  costo; la nieta fuera del filtro).
- [ ] **Paso 3: implementar** con las Interfaces.
  - Ayudas nuevas:
    - Entradas: «Unidades que entraron en el período: entradas, ajustes de entrada y devoluciones de clientes (con una bodega,
      también los traslados que llegan a ella).»;
    - Salidas: «Unidades que salieron en el período: salidas, ajustes de salida y pérdidas (con una bodega, también los
      traslados que salen de ella).».
  - get_kardex:
    - `orden: Optional[str] = Query(None, description="fecha (del más antiguo) o -fecha (del más reciente, por defecto)")`;
    - el ORDER BY de `leer_orden(orden, {"fecha": InventoryMovement.created_at}, "-fecha", id_lista=InventoryMovement.id)`;
    - el docstring dice que ahora se ordena.
  - El docstring de DIRECCIONES_KARDEX dice qué escribe cada módulo: la cuarentena, erp_compras; la pérdida y la devolución,
    erp_ventas_fase4.
- [ ] **Paso 4: VERDE** de los tres módulos. Mutantes:
  - (a) sacar "SCRAP" de `SALIDAS_KARDEX` → `test_las_direcciones_viven_en_movimientos_inventario` da `AssertionError` de la tupla;
  - (b) `UNION ALL` en el CTE → la consulta del ciclo no termina: la prueba fija `SET LOCAL statement_timeout = '5s'` antes de
    llamar, así que el mutante da el error de PostgreSQL (un 500) y la aserción del 200 falla;
  - (c) volver a `if s.cost_price is not None` → `AssertionError: (7, 0, False)`.
- [ ] **Paso 5: regresión.** test_existencias, test_inventario_stats, test_parametros_exactos_inventario,
  test_inventory_operations_stock, test_busqueda_productos, test_products_quick_create, test_analisis_base y test_consultas_fijas_listas.
- [ ] **Paso 6: commits.**
  - `refactor(inventario): B4.1 T4 (B33) las direcciones del Kardex en core/movimientos_inventario`;
  - `fix(inventario): B4.1 T4 (P16) SCRAP es salida y RETURN_IN es entrada`;
  - `fix(inventario): B4.1 T4 (P15) valor del inventario y entradas neutros`;
  - `fix(inventario): B4.1 T4 (P17) costo y precio de /products mayores que 0`;
  - `feat(inventario): B4.1 T4 (P25) el filtro de categoría de stock incluye las subcategorías`;
  - `feat(inventario): B4.1 T4 (P26) el Kardex se ordena por fecha en los dos sentidos`.

---

### Task 5: Compras en el servidor: observaciones del conteo (P20), moneda y tiempo de entrega del proveedor (P33) y la prueba vieja de tránsito (P1)

**Modelo:** sonnet. **Depende de:** T1 (las columnas de fa6_035) y T4 (solo por el turno del runner).

**Files:**
- Modify: `backend/app/api/v1/erp_compras.py`:
  - `_supplier_dict` (:103-120); `create_supplier` (:408-431); `update_supplier` (:449-462);
  - `_snapshot_productos` (:2053-2072); `update_grl` (:2480-2540).
- Modify: `backend/tests/test_mercancia_transito.py:140-142` (P1; el archivo tiene finales de línea CRLF: se conservan)
- Modify: `backend/tests/test_recepcion_conteo_por_linea.py` (casos nuevos)
- Create: `backend/tests/test_b41_proveedores.py`

**Interfaces:**
- Produces:
  - **Proveedor:** `_supplier_dict` suma `"currency"` y `"lead_time_days"`. POST y PATCH `/compras/proveedores` aceptan
    `currency` y `lead_time_days`:
    - `currency`: texto, con los bordes recortados y en mayúsculas, que debe ser uno de `MONEDAS_PROVEEDOR = ("COP", "USD", "EUR")`;
      '' o None quedan en None; si no, 422 `f"La moneda «{valor}» no es válida: usa COP, USD o EUR."`;
    - `lead_time_days`: un entero sin pérdida (`_entero_sin_perdida`; un bool no vale) entre 0 y 365, o None; si no, 422
      «El tiempo de entrega debe ser un número entero de días entre 0 y 365.».
    - Las dos validaciones van antes de escribir nada.
  - **Línea de la recepción:** `PATCH /compras/recepciones/{id}/lineas/{grl_id}` acepta `notes`:
    - se valida con `_validar_texto_corto(valor, MAX_OBSERVACIONES_LINEA, …)`, con `MAX_OBSERVACIONES_LINEA = 500` y los textos
      «Las observaciones de la línea deben ser un texto.», «Las observaciones de la línea no pueden llevar caracteres de control.»
      y «Las observaciones de la línea pueden tener hasta 500 caracteres.»;
    - se valida antes de leer la recepción con bloqueo, así que un 422 no escribe nada, tampoco la cantidad del mismo PATCH;
    - se guarda recortado, y '' queda en None; si `notes` no viene, no cambia;
    - la respuesta suma `"notes"`, y cada línea de `_snapshot_productos` suma `"observaciones": grl.notes`.

- [ ] **Paso 1: P1, el commit propio.** En `test_etapa_sin_eta_ni_status_completado_expone_alerta_de_confirmacion_atrasada`,
  reemplazar las líneas 140-142 por estas, idénticas al cambio revisado de Mirror main:

```python
        # fecha_compra por defecto es "ahora" -> alert_confirm_days=2 para PENDIENTE_DESPACHO.
        # _stage_alert expone el timer desde el inicio (nivel "ok"), no solo cuando
        # ya esta vencido -- todavia no deberia estar en nivel "atrasado".
        alert0 = pec["tracking_stages"][0]["alert"]
        assert alert0 is not None
        assert alert0["nivel"] == "ok"
        assert 0 <= alert0["dias_restantes"] <= 2
```

  `runner test_mercancia_transito` → 13/0. Commit: `test(compras): B4.1 T5 (P1) la prueba de la alerta de confirmación sigue a _stage_alert`.
- [ ] **Paso 2: ROJO de P33.** `backend/tests/test_b41_proveedores.py`:

```python
RUTA = "/api/v1/compras/proveedores"
TEXTO_MONEDA = "La moneda «{}» no es válida: usa COP, USD o EUR."
TEXTO_TIEMPO = "El tiempo de entrega debe ser un número entero de días entre 0 y 365."

def test_el_proveedor_guarda_moneda_y_tiempo_de_entrega(app_client, admin_token):
    nombre = f"Prov-B41-{uuid.uuid4().hex[:6]}"
    r = app_client.post(RUTA, json={"name": nombre, "currency": "usd ", "lead_time_days": "21"}, headers=_auth(admin_token))
    assert r.status_code == 201, r.text
    d = r.json()["data"]
    assert (d["currency"], d["lead_time_days"]) == ("USD", 21)
    assert {k: app_client.get(f"{RUTA}/{d['id']}", headers=_auth(admin_token)).json()["data"][k]
            for k in ("currency", "lead_time_days")} == {"currency": "USD", "lead_time_days": 21}
    p = app_client.patch(f"{RUTA}/{d['id']}", json={"currency": "", "lead_time_days": None}, headers=_auth(admin_token)).json()["data"]
    assert (p["currency"], p["lead_time_days"]) == (None, None)
    fila = next(x for x in app_client.get(RUTA, params={"search": nombre}, headers=_auth(admin_token)).json()["data"] if x["id"] == d["id"])
    assert {"currency", "lead_time_days"} <= set(fila)       # list_suppliers (erp_compras.py:372) filtra con `search`

def test_moneda_y_tiempo_de_entrega_se_validan(app_client, db, admin_token):
    """Review Focus 5."""
    s = app_client.post(RUTA, json={"name": f"Prov-B41-{uuid.uuid4().hex[:6]}", "currency": "COP", "lead_time_days": 7},
                        headers=_auth(admin_token)).json()["data"]
    for moneda in ("ARS", "COPX", 5):
        r = app_client.patch(f"{RUTA}/{s['id']}", json={"currency": moneda, "name": "Otro"}, headers=_auth(admin_token))
        assert (r.status_code, r.json()["detail"]) == (422, TEXTO_MONEDA.format(moneda)), moneda
    for tiempo in ("abc", 7.5, -1, 366, True):
        r = app_client.patch(f"{RUTA}/{s['id']}", json={"lead_time_days": tiempo, "name": "Otro"}, headers=_auth(admin_token))
        assert (r.status_code, r.json()["detail"]) == (422, TEXTO_TIEMPO), tiempo
    d = app_client.get(f"{RUTA}/{s['id']}", headers=_auth(admin_token)).json()["data"]
    assert (d["name"], d["currency"], d["lead_time_days"]) == (s["name"], "COP", 7)       # nada se escribió
```

- [ ] **Paso 3: ROJO de P20.** En test_recepcion_conteo_por_linea.py:

```python
def test_las_observaciones_de_la_linea_se_guardan_y_vuelven_en_el_detalle(app_client, db, admin_token, bodega_token, pec_10u, sku):
    rec = _recepcion(app_client, admin_token, pec_10u, sku)
    uno = rec["productos"][0]
    linea = f"{RECEPCIONES}/{rec['id']}/lineas/{uno['grl_id']}"
    r = app_client.patch(linea, headers=_auth(bodega_token), json={"quantity_received": 7, "notes": "  Caja rota  "})
    assert (r.status_code, r.json()["data"]["notes"]) == (200, "Caja rota"), r.text
    assert _detalle(app_client, bodega_token, rec["id"])["productos"][0]["observaciones"] == "Caja rota"
    app_client.patch(linea, headers=_auth(bodega_token), json={"quantity_received": 8})            # sin notes: no cambia
    assert _detalle(app_client, bodega_token, rec["id"])["productos"][0]["observaciones"] == "Caja rota"
    app_client.patch(linea, headers=_auth(bodega_token), json={"notes": "   "})
    assert _detalle(app_client, bodega_token, rec["id"])["productos"][0]["observaciones"] is None

def test_observaciones_de_la_linea_se_validan_sin_escribir(app_client, db, admin_token, bodega_token, pec_10u, sku, contador_sql):
    """Review Focus 4."""
    rec = _recepcion(app_client, admin_token, pec_10u, sku)
    linea = f"{RECEPCIONES}/{rec['id']}/lineas/{rec['productos'][0]['grl_id']}"
    for valor, texto in (("x" * 501, "Las observaciones de la línea pueden tener hasta 500 caracteres."),
                         ("a\x07b", "Las observaciones de la línea no pueden llevar caracteres de control."),
                         (5, "Las observaciones de la línea deben ser un texto.")):
        with contador_sql.ventana() as v:
            r = app_client.patch(linea, headers=_auth(bodega_token), json={"quantity_received": 9, "notes": valor})
        assert (r.status_code, r.json()["detail"]) == (422, texto), repr(valor)
        escrituras = [s for s in v.sentencias if s.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]
        assert escrituras == [], (repr(valor), escrituras)
    assert _detalle(app_client, bodega_token, rec["id"])["productos"][0]["qty_recibida"] is None
```

- [ ] **Paso 4: correr el ROJO.** `runner test_b41_proveedores` → KeyError `'currency'` y los 422 que no salen.
  `runner test_recepcion_conteo_por_linea` → KeyError `'notes'` y `'observaciones'`.
- [ ] **Paso 5: implementar** con las Interfaces; un ayudante por campo:
  - `_moneda_proveedor(valor) -> Optional[str]`;
  - `_tiempo_entrega_proveedor(valor) -> Optional[int]`;
  - `_observaciones_de_linea(body) -> tuple[bool, Optional[str]]`, que devuelve (vino o no, el valor limpio).
- [ ] **Paso 6: VERDE.** Los dos módulos en verde. Mutantes:
  - (a) no pasar `currency` a mayúsculas → `AssertionError: ('usd', 21)`;
  - (b) validar `notes` después de escribir la cantidad → `AssertionError` de `escrituras == []`, con el UPDATE de
    goods_receipt_lines en la lista.
- [ ] **Paso 7: regresión.** test_pec_transiciones, test_receipt_partial, test_receipt_idempotency,
  test_fase3_recepciones_parciales, test_fase4_asignacion_compras_recepcion, test_listas_compras_paginadas,
  test_pendiente_compra_lista_pec, test_pec_tracking_update y test_mercancia_transito (13/0).
- [ ] **Paso 8: commits.** `feat(compras): B4.1 T5 (P33) moneda y tiempo de entrega del proveedor en el servidor` y
  `feat(compras): B4.1 T5 (P20) las observaciones físicas del conteo se guardan por línea`.

---

### Task 6: Pantallas de Ventas (P4, P7, P8, P10, P11, P12)

**Modelo:** sonnet. **Depende de:** T3 (`atrasados_por_vista` y el vencimiento como día).

**Files:**
- Modify: `frontend/src/lib/listas-ventas.js` (función nueva, `atrasadosDeLaPestana`)
- Modify: `frontend/src/lib/kanban-ventas.js:783` (`reglaSoltarCotizacion`)
- Modify: `frontend/src/lib/flujo.js:113-124` (`pasosConProgreso`)
- Modify: `frontend/src/lib/flujo-ventas.js:687-701` (`pasoCotizacion`) y una función nueva, `pasosDeCotizacion`
- Modify: `frontend/src/lib/fechas-colombia.js` (función nueva, `diaEditadoParaGuardar`)
- Modify: `frontend/src/lib/datos-cliente.js:242` (`formularioDeEdicion`) y `:329` (`hayCambiosEnEdicion`)
- Modify: `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx:619-627` (CeldaVencimiento), `:716` (titleCelda) y
  `:1517-1518` y `:1563` (el semáforo)
- Modify: `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx:1261-1262` y `:1300`
- Modify: `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx:240-246`
- Modify: `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx:391` y `:1273`
- Modify: `frontend/src/app/dashboard/ventas/venta/venta-client.tsx:160-171`, `:234-252` y `:530-534`
- Modify: `frontend/src/app/dashboard/ventas/acciones-tablero-pedidos.ts:17` y `:41-56`
- Modify: `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx:425-427` (el comentario) y `:541-575` (Cliente + Origen + Entrega)
- Test: `frontend/tests/test_listas_ventas.mjs`, `test_kanban_ventas.mjs`, `test_flujo.mjs`, `test_flujo_ventas.mjs`,
  `test_fechas_colombia.mjs` y `test_datos_cliente.mjs`

**Interfaces:**
- Consumes: de T3, `atrasados_por_vista` en las respuestas con `con_conteos=1`, y el vencimiento como `'AAAA-MM-DDT00:00:00'`.
- Produces:
  - **`atrasadosDeLaPestana(porVista, { vista, enKanban, vistaTablero, vistaInicial, vistasSinAtraso }) -> number | null`:**
    - si `porVista` no es un objeto → null;
    - en Kanban → `porVista[vistaTablero]`;
    - con una vista vacía o de `vistasSinAtraso` → `porVista[vistaInicial]`;
    - si no → `porVista[vista]`;
    - un valor no finito → null.
  - **`pasosConProgreso(definicion, indiceActual, { canceladoEn = null, terminado = false } = {})`:** con `terminado` y sin
    `canceladoEn`, todos 'hecho'; `canceladoEn` gana.
  - **`pasoCotizacion('CONFIRMADA') -> { indice: 2, terminado: true }`.**
  - **`pasosDeCotizacion(estado) -> PasoVista[]`** = `anotarPasosCotizacion(pasosConProgreso(PASOS_COTIZACION, p.indice, { canceladoEn: p.canceladoEn, terminado: p.terminado }), p)`.
  - **`diaEditadoParaGuardar(dia, guardada) -> string | null`:** el 'AAAA-MM-DD' recortado si es un día válido y distinto de
    `diaDeNegocio(guardada)`; si no, null.
  - **`useAccionesTableroPedidos(...)`** también devuelve `pedirCancelacion(p: P): void`: abre la misma ModalMotivo con
    `columnas: []`; el tipo `Columnas` pasa a `ReadonlyArray<string>`.

- [ ] **Paso 1: ROJO.**

```js
// test_listas_ventas.mjs
console.log('--- B4.1 T6 (P4): atrasadosDeLaPestana — «Con atraso (N)» cuenta la pestaña abierta ---');
{
  const porVista = { activas: 3, confirmadas: 2, esperan_cotizacion: 1, todas_sin_soporte: 5 };
  const sc = { vistaTablero: 'todas_sin_soporte', vistaInicial: 'activas', vistasSinAtraso: ['soporte', 'papelera', 'canceladas'] };
  assert.equal(listas.atrasadosDeLaPestana(porVista, { ...sc, vista: 'confirmadas', enKanban: false }), 2);
  assert.equal(listas.atrasadosDeLaPestana(porVista, { ...sc, vista: 'activas', enKanban: false }), 3);
  assert.equal(listas.atrasadosDeLaPestana(porVista, { ...sc, vista: 'canceladas', enKanban: false }), 3, 'desde Canceladas abre Activas');
  assert.equal(listas.atrasadosDeLaPestana(porVista, { ...sc, vista: 'confirmadas', enKanban: true }), 5, 'en Kanban, el tablero');
  assert.equal(listas.atrasadosDeLaPestana(porVista, { ...sc, vista: undefined, enKanban: false }), 3);
  assert.equal(listas.atrasadosDeLaPestana(null, { ...sc, vista: 'activas', enKanban: false }), null, 'mientras carga');
  assert.equal(listas.atrasadosDeLaPestana({ activas: 'x' }, { ...sc, vista: 'activas', enKanban: false }), null);
  const leer = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const ruta of ['app/dashboard/ventas/solicitud/solicitud-client.tsx', 'app/dashboard/ventas/cotizacion/cotizacion-client.tsx']) {
    const f = leer(ruta);
    assert.match(f, /atrasadosDeLaPestana\(listado\.crudo\?\.atrasados_por_vista/, `${ruta}: el número sale de la lista`);
    assert.ok(!/pasosFlujo\.find\(\(p\) => p\.esEste\)\?\.atrasados/.test(f), `${ruta}: ya no el del paso entero`);
  }
}
console.log('--- B4.1 T6 (P8): el vencimiento de la SC se lee como día y se compara con el día de Colombia ---');
{
  const sc = readFileSync(new URL('../src/app/dashboard/ventas/solicitud/solicitud-client.tsx', import.meta.url), 'utf8');
  assert.match(sc, /const vencida = fechaNegocioVencida\(sc\.fecha_vencimiento\);/);
  assert.match(sc, /fechaCorta\(diaDeNegocio\(sc\.fecha_vencimiento\)\) \|\| '-'/);
  assert.ok(!/fechaVencida\(sc\.fecha_vencimiento\)/.test(sc), 'ya no como instante');
  const ahora = Date.parse('2026-11-25T04:00:00Z');                        // 24 de nov., 23:00 en Colombia
  assert.equal(listas.fechaNegocioVencida('2026-11-24T00:00:00', ahora), false, 'vence hoy: todavía no');
  assert.equal(listas.fechaNegocioVencida('2026-11-23T00:00:00', ahora), true);
  assert.equal(listas.diaDeNegocio('2026-11-24T03:00:00'), '2026-11-24', 'una SC vieja (instante): su día UTC, los 10 primeros');
}
```

  - **test_kanban_ventas.mjs, TEST 13** (P7; nota «B4.1 (P7)»):
    - el bucle de C15(a) pasa a `for (const estado of ['ENVIADA', 'PENDIENTE_CONFIRMACION', 'CONFIRMADA'])`, con
      `bloqueado(RE_COTIZAR, enlace)` en borrador y vencida;
    - se borran `soltar('ENVIADA', 'borrador')` → cambio y `soltar('ENVIADA', 'vencida')` → cambio.
  - **test_kanban_ventas.mjs, bloque nuevo `B4.1 T6 (P10)`:**
    - el menú de la fila de venta-client.tsx trae `onClick: () => acciones?.cancelar(p)`;
    - el archivo no trae `?accion=cancelar`;
    - acciones-tablero-pedidos.ts devuelve `pedirCancelacion`;
    - `accionesTableroPedidos({...falsos}).cancelar(p, 'Cliente desistió de la compra', [])` llama a `recargarTablero([])`
      una vez y a `recargarTrasCambio()` una vez, con el PATCH `{estado: 'CANCELADO', cancellation_reason: …}`.
  - **test_flujo.mjs, TEST 2 (P12):**
    - `estados(pasosConProgreso(CINCO, 4, { terminado: true }))` → cinco 'hecho';
    - `estados(pasosConProgreso(CINCO, 2, { terminado: true, canceladoEn: 1 }))` → `['hecho', 'cancelado', 'pendiente', 'pendiente', 'pendiente']`;
    - el índice fuera de rango sin `terminado` sigue todo 'pendiente'.
  - **test_flujo_ventas.mjs, TEST 19** (nota «B4.1 (P12): una COT confirmada terminó su camino»):
    - `pasoCotizacion('CONFIRMADA')` → `{ indice: 2, terminado: true }`;
    - `estados(fv.pasosDeCotizacion('CONFIRMADA'))` → `['hecho', 'hecho', 'hecho']`;
    - `fv.pasosDeCotizacion('RECHAZADA')`, `('VENCIDA')` y `('BORRADOR')` = lo que hoy da `anotarPasosCotizacion(...)`;
    - guarda: `cotizacion/[id]/page.tsx` trae `const pasosCot = pasosDeCotizacion(estadoActual);`.
  - **test_flujo_ventas.mjs, bloque nuevo `B4.1 T6 (P11)`:** `venta/[id]/page.tsx` sin `>Origen</label>`, con
    `grid grid-cols-1 @2xl:grid-cols-2 gap-6` y con `<CadenaDocumentos`.
  - **test_fechas_colombia.mjs:**
    - `diaEditadoParaGuardar('2026-11-30', '2026-11-24T00:00:00')` → `'2026-11-30'`;
    - con el mismo día → null; con `''`, `'2026-02-30'` o 5 → null;
    - `diaEditadoParaGuardar(' 2026-11-30 ', null)` → `'2026-11-30'`.
  - **test_datos_cliente.mjs:**
    - `formularioDeEdicion({ ...base, fecha_vencimiento: '2026-11-24T03:00:00' }).fecha_vencimiento === '2026-11-24'`
      (antes, '2026-11-23');
    - `hayCambiosEnEdicion` con ese mismo día → false.
- [ ] **Paso 2: correr el ROJO.** Cada .mjs tocado da su AssertionError o TypeError: `atrasadosDeLaPestana is not a function`, el
  cambio de ENVIADA, `pasosDeCotizacion is not a function`, la guarda de Origen y `diaEditadoParaGuardar is not a function`.
- [ ] **Paso 3: implementar** con las Interfaces.
  - **Solicitudes y Cotizaciones:** `semaforo={{ atrasados: atrasadosDeLaPestana(listado.crudo?.atrasados_por_vista ?? null, {...}) … }}`.
    - SC: `vistaTablero 'todas_sin_soporte'`, `vistaInicial INICIAL_SC.vista`, `vistasSinAtraso VISTAS_SIN_ATRASO`,
      `enKanban modoEfectivo === 'kanban'`;
    - COT: `'todas'`, `INICIAL_COT.vista`, `VISTAS_SIN_ATRASO` y `enKanban`.
    - Las cajas de la franja siguen con /ventas/flujo.
  - **P7:** `if (estado === 'ENVIADA' || estado === 'PENDIENTE_CONFIRMACION' || estado === 'CONFIRMADA') return bloqueado(TEXTO.RE_COTIZAR, enlace);`.
  - **P8, la lista:**
    - CeldaVencimiento usa `fechaNegocioVencida` y muestra `fechaCorta(diaDeNegocio(...)) || '-'`;
    - su titleCelda: `fechaLarga(diaDeNegocio(sc.fecha_vencimiento)) || 'Sin vencimiento'`.
  - **P8, el detalle:**
    - `:1273` → `fechaLarga(diaDeNegocio(solicitud?.fecha_vencimiento)) || '-'`;
    - `:391` → `diaEditadoParaGuardar(editForm.fecha_vencimiento, base.fecha_vencimiento)`, que manda 'AAAA-MM-DD';
    - datos-cliente.js usa `diaDeNegocio` y `diaEditadoParaGuardar`.
    - `diaLocalDeFecha` y `fechaEditadaParaGuardar` de hub-ventas.js quedan como están, con sus casos.
  - **P10:**
    - `AccionesLista` suma `cancelar: (p: FilaPedido) => void`;
    - `accionesFila` pasa `cancelar: pedirCancelacion`;
    - el ítem «Cancelar pedido» llama a `acciones?.cancelar(p)`;
    - la ModalMotivo de `cancelando` (:719-730) sirve a los dos.
  - **P11:** se quita el bloque Origen y la rejilla pasa a `grid grid-cols-1 @2xl:grid-cols-2 gap-6`; el comentario de :425-427
    deja de nombrarlo.
  - **P12:** la página usa `pasosDeCotizacion(estadoActual)`.
- [ ] **Paso 4: VERDE.** Los seis .mjs en verde; `npm test` exit 0; `tsc` 5; eslint de los archivos tocados sin errores nuevos.
  Mutantes:
  - (a) en `atrasadosDeLaPestana`, quitar la rama de `vistasSinAtraso` → `AssertionError [ERR_ASSERTION]: desde Canceladas abre Activas`;
  - (b) devolver `ENVIADA → cambio('BORRADOR')` → `AssertionError [ERR_ASSERTION]: ENVIADA → borrador`;
  - (c) `terminado` ignorado en `pasosConProgreso` → `AssertionError` de `['hecho', 'hecho', 'actual']`.
- [ ] **Paso 5: commits**, uno por clave:
  - `feat(ventas): B4.1 T6 (P4) «Con atraso» cuenta la pestaña abierta`;
  - `fix(ventas): B4.1 T6 (P7) una COT enviada no vuelve a Borrador ni pasa a Vencida arrastrándola`;
  - `fix(ventas): B4.1 T6 (P8) el vencimiento de la SC es un día de Colombia`;
  - `fix(ventas): B4.1 T6 (P10) Cancelar pedido desde la fila con la ventana del tablero`;
  - `fix(ventas): B4.1 T6 (P11) sin el bloque Origen en el detalle del pedido`;
  - `fix(ventas): B4.1 T6 (P12) una COT confirmada muestra los tres pasos con ✓`.

---

### Task 7: Pantallas de Compras (P18, P19, P20, P21)

**Modelo:** sonnet. **Depende de:** T5 (`notes` y `observaciones`). Puede ir en paralelo con T6.

**Files:**
- Modify: `frontend/src/lib/estados-compras.js`: `ordenPorFechaDeCompra`, `grupoMesPec` y `tituloMesPec` (:633-680), con dos
  funciones nuevas junto a ellas, y `peticionesConteo` (:1222-1236)
- Modify: `frontend/src/app/dashboard/compras/page.tsx:553-562` (pestanasDelHub), `:758-761` y `:945-955` (la barra)
- Modify: `frontend/src/app/dashboard/compras/pedidos/page.tsx:1778-1781` y `:1955-1965`
- Modify: `frontend/src/app/dashboard/compras/transito/page.tsx:180-206` (COLUMNAS_TABLA_TRANSITO y su comentario)
- Modify: `frontend/src/app/dashboard/compras/recepciones/[id]/page.tsx:30-33`, `:62-74`, `:150-156` y `:210-216`
- Test: `frontend/tests/test_estados_compras.mjs`

**Interfaces:**
- Consumes: de T5, `observaciones` en cada línea de `productos` del detalle, y `notes` en el PATCH por línea.
- Produces:
  - `alternarAgruparMes(orden: unknown) -> 'atencion' | '-compra'`: si `ordenPorFechaDeCompra(orden)` → 'atencion'; si no → '-compra'.
  - `textoSeparadorMesPec(grupo: string, filas: unknown[]) -> string` = `` `${tituloMesPec(grupo)} · ${n} en esta página · ${formatoPesos(total)}` ``,
    con n y total (Σ `total_cop`) de las filas cuyo `grupoMesPec(f) === grupo`.
  - `peticionesConteo(servidor, locales)`: una línea con la misma cantidad pero otras observaciones también va, y lleva
    `notes`. Las observaciones se comparan con `textoLimpio`, y '' vale lo mismo que null. Sin cambio de observaciones, el cuerpo
    es el de hoy, sin `notes`.

- [ ] **Paso 1: ROJO** en test_estados_compras.mjs, bloque `B4.1 T7`:

```js
console.log('--- B4.1 T7 (P18, P19, P20, P21): Compras ---');
{
  const leer = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // P18
  const hub = leer('app/dashboard/compras/page.tsx');
  assert.ok(hub.includes("{ id: 'en_bodega', etiqueta: 'En bodega', conteo: conteos?.en_bodega ?? null },"), 'P18');
  // P19
  assert.equal(ec.alternarAgruparMes('atencion'), '-compra');
  assert.equal(ec.alternarAgruparMes(null), '-compra');
  assert.equal(ec.alternarAgruparMes('-compra'), 'atencion');
  assert.equal(ec.alternarAgruparMes('compra'), 'atencion');
  const filas = [{ fecha_compra: '2026-11-03T15:00:00', total_cop: 1_000_000 }, { fecha_compra: '2026-11-20T12:00:00', total_cop: 250_000 },
                 { fecha_compra: '2026-10-31T12:00:00', total_cop: 9 }, { fecha_compra: null, total_cop: 5 }];
  assert.equal(ec.textoSeparadorMesPec('2026-11', filas), `Noviembre de 2026 · 2 en esta página · ${formatoPesos(1_250_000)}`);
  assert.equal(ec.textoSeparadorMesPec('sin_fecha', filas), `Sin fecha de compra · 1 en esta página · ${formatoPesos(5)}`);
  for (const ruta of ['app/dashboard/compras/page.tsx', 'app/dashboard/compras/pedidos/page.tsx']) {
    const f = leer(ruta);
    assert.match(f, /aria-pressed=\{porMes\}/, `${ruta}: el botón «Agrupar por mes»`);
    assert.match(f, /despachar\(\{ tipo: 'orden', valor: alternarAgruparMes\(estado\.orden\) \}\)/, ruta);
    assert.match(f, /textoSeparadorMesPec\(grupo, listado\.filas\)/, ruta);
  }
  // P20
  const servidor = [{ grl_id: 1, qty_recibida: 3, qty_rechazada: 0, qty_cuarentena: 0, observaciones: 'Caja rota' }];
  const cuerpo = (n) => ({ quantity_received: n, quantity_rejected: 0, quantity_quarantine: 0 });
  assert.deepEqual(ec.peticionesConteo(servidor, [{ grl_id: 1, nombre: 'A', qty_recibida: 3, observaciones: ' Caja rota ' }]),
    { error: null, peticiones: [] }, 'las mismas observaciones: nada');
  assert.deepEqual(ec.peticionesConteo(servidor, [{ grl_id: 1, nombre: 'A', qty_recibida: 3, observaciones: 'Faltan 2' }]),
    { error: null, peticiones: [{ grl_id: 1, cuerpo: { ...cuerpo(3), notes: 'Faltan 2' } }] });
  assert.deepEqual(ec.peticionesConteo(servidor, [{ grl_id: 1, nombre: 'A', qty_recibida: 3, observaciones: '' }]),
    { error: null, peticiones: [{ grl_id: 1, cuerpo: { ...cuerpo(3), notes: null } }] }, 'borrarlas también va');
  const rec = leer('app/dashboard/compras/recepciones/[id]/page.tsx');
  assert.match(rec, /value=\{l\.observaciones \?\? ''\}/, 'P20: el campo es controlado');
  assert.match(rec, /maxLength=\{500\}/);
  assert.ok(!/no se envía al confirmar/.test(rec), 'P20: el comentario viejo');
  // P21
  const tr = leer('app/dashboard/compras/transito/page.tsx');
  assert.ok(!/id: 'cliente'[^\n]*ocultaPorDefecto: true/.test(tr), 'P21: Cliente / PVEN visible');
  assert.equal(anchoVisible(tr, 'const COLUMNAS_TABLA_TRANSITO'), 704, 'P21: 120 + 100 + 104 + 88 + 92 + 88 + 112');
}
```

  `formatoPesos` se importa de `../src/lib/pesos.js`; `anchoVisible` es el ayudante del mismo archivo (:1151). Se ajustan, con
  la nota «B4.1 (P21)», las guardas de hoy que fijaban `id: 'cliente'…ocultaPorDefecto: true` (:1224) y los anchos viejos.
  La guarda de Acción en 112 (:3327) queda igual.
- [ ] **Paso 2: correr el ROJO** → `alternarAgruparMes is not a function`, la guarda de P18 y las de P20/P21.
- [ ] **Paso 3: implementar.**
  - **P18:** `etiqueta: 'En bodega'`.
  - **P19:** en las dos pantallas, en la ranura `filtros` de BarraTabla (en Lista):
    - un botón «Agrupar por mes», con el ícono `CalendarDays` de lucide, `aria-pressed={porMes}`, el estilo del chip de orden
      y `onClick={() => despachar({ tipo: 'orden', valor: alternarAgruparMes(estado.orden) })}`;
    - el chip «Orden: … · Atención primero» sigue al lado cuando hay orden;
    - `tituloDeMes` pasa a `useCallback((grupo: string) => textoSeparadorMesPec(grupo, listado.filas), [listado.filas])`.
  - **P20:**
    - `LineaConteo` suma `observaciones?: string | null`; la carga (:150-156) lee `p.observaciones ?? null`;
    - `ControlConteo` suma `actualizarObservaciones(idx, texto)`;
    - CeldaObservaciones queda controlada, con `maxLength={500}` y su `onChange`;
    - en una recepción heredada (`esConteoHeredado(items)`), el campo sale deshabilitado con
      `title="Esta recepción heredada no guarda observaciones por línea."`;
    - el docstring dice que se guarda con el PATCH por línea.
  - **P21:** los anchos de la Decisión 10; se quita `ocultaPorDefecto` de Cliente / PVEN; Tipo sigue oculta; el comentario de
    R26 da la suma nueva.
- [ ] **Paso 4: VERDE.** test_estados_compras.mjs en verde; `npm test`; `tsc` 5; eslint. Mutantes:
  - (a) en `peticionesConteo`, no comparar las observaciones → `AssertionError` de `peticiones: []` contra la petición con
    `notes: 'Faltan 2'`;
  - (b) `alternarAgruparMes` que devuelve siempre '-compra' → `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: '-compra' !== 'atencion'`.
- [ ] **Paso 5: commits**, uno por clave: `fix(compras): B4.1 T7 (P18) «En bodega» en la pestaña del Hub`,
  `feat(compras): B4.1 T7 (P19) Agrupar por mes sin mostrar la columna`,
  `feat(compras): B4.1 T7 (P20) las observaciones físicas se guardan` y `fix(compras): B4.1 T7 (P21) Cliente / PVEN visible en Tránsito`.

---

### Task 8: Pantallas de Inventario (P15, P16, P22, P23, P24, P25, P26)

**Modelo:** sonnet. **Depende de:** T4 (direcciones, `orden` del Kardex, subcategorías) y T7 (estados-compras.js y su .mjs).

**Files:**
- Create: `frontend/src/components/ui/useAnchoVentana.ts`
- Modify: `frontend/src/lib/tabla.js` (función nueva, `mostrarPorDefecto`)
- Modify: `frontend/src/lib/estados-compras.js`:
  - `marcarCategoriasPadre` (:861-865);
  - `avisoTope200` (:1691-1695), con una variante aditiva al lado;
  - `TEXTO_SOLO_VER_KARDEX` (:1793), que queda igual: ahora es exacto;
  - `COLUMNAS_KARDEX` y su JSDoc (:1966-1974).
- Modify: `frontend/src/app/dashboard/inventario/page.tsx`:
  - `COLUMNAS_HUB` y su comentario (:105-145); el aviso (:179);
  - la selección (:298, :375-381 y :601-603); la definición elegida (:363 y :575-586); `mejorLinea` (:618).
- Modify: `frontend/src/app/dashboard/inventario/kardex/page.tsx:59-62`, `:105-115` y `:186`
- Test: `frontend/tests/test_estados_compras.mjs` y `frontend/tests/test_tabla.mjs` (el bloque del Hub, :2515-2550)

**Interfaces:**
- Consumes: de T4, `movimientos_inventario.ENTRADAS_KARDEX` y `SALIDAS_KARDEX`, `GET /inventory/kardex?orden=` y el filtro de
  categoría con sus subcategorías.
- Produces:
  - `mostrarPorDefecto(definicion, ids: string[]) -> definicion`: una copia en la que esas columnas pierden `ocultaPorDefecto`;
    las demás son los mismos objetos; no muta la entrada.
  - `useAnchoVentana(): number | null`: `useSyncExternalStore` sobre `resize`, con `window.innerWidth` y null en el servidor.
    T10 lo usa.
  - `avisoTopeAlmacenes(total) -> string | null` → `` `Se muestran las primeras ${TOPE_TABLERO_COMPRAS} de ${formatoEntero(n)} existencias; los totales por bodega son parciales. Busca o filtra para ver el resto.` ``;
    null con un total ≤ 200 o que no es un número.
  - `COLUMNAS_KARDEX`: Entradas = `['IN', 'ADJUST_IN', 'TRANSFER_IN', 'RETURN_IN']`; Salidas = `['OUT', 'ADJUST_OUT', 'TRANSFER_OUT', 'SCRAP']`.
    GRUPOS_AJUSTE los sigue.
  - `marcarCategoriasPadre`: el sufijo pasa a « (incluye subcategorías)».

- [ ] **Paso 1: ROJO.**

```js
// test_estados_compras.mjs
console.log('--- B4.1 T8 (P16, P22, P25, P26): Inventario ---');
{
  assert.deepEqual(ec.COLUMNAS_KARDEX.map((c) => c.estados),
    [['IN', 'ADJUST_IN', 'TRANSFER_IN', 'RETURN_IN'], ['OUT', 'ADJUST_OUT', 'TRANSFER_OUT', 'SCRAP']]);
  const py = readFileSync(new URL('../../backend/app/core/movimientos_inventario.py', import.meta.url), 'utf8');
  const tupla = (nombre) => [...py.match(new RegExp(`${nombre} = \\(([^)]*)\\)`))[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(ec.COLUMNAS_KARDEX[0].estados, tupla('ENTRADAS_KARDEX'), 'el tablero = el servidor (entradas)');
  assert.deepEqual(ec.COLUMNAS_KARDEX[1].estados, tupla('SALIDAS_KARDEX'), 'y salidas');
  assert.equal(ec.avisoTopeAlmacenes(1234),
    'Se muestran las primeras 200 de 1.234 existencias; los totales por bodega son parciales. Busca o filtra para ver el resto.');
  for (const nada of [200, 12, null, 'x']) assert.equal(ec.avisoTopeAlmacenes(nada), null, String(nada));
  assert.deepEqual(ec.marcarCategoriasPadre([{ id: 1, name: 'Juguetes' }, { id: 2, name: 'Peluches', parent_id: 1 }]).map((c) => c.name),
    ['Juguetes (incluye subcategorías)', 'Peluches']);
  const leer = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const k = leer('app/dashboard/inventario/kardex/page.tsx');
  assert.match(k, /const INICIAL_KARDEX = \{ orden: '-fecha' \};/);
  assert.match(k, /\{ id: 'fecha', titulo: 'Fecha', ancho: 92, clave: true, fija: 'izquierda', ordenable: 'fecha'/);
  assert.ok(!/orden: null \}\), \[filtros\]\)/.test(k), 'la lista manda el orden del estado');
  assert.match(leer('app/dashboard/inventario/page.tsx'), /avisoTopeAlmacenes\(listado\.total\)/);
}
```

  - Se ajustan las aserciones de hoy:
    - TEST de COLUMNAS_KARDEX (:2089-2092);
    - las de `extraLista` con `orden: null` en el TEST de Kardex (~:2610-2640);
    - la de `marcarCategoriasPadre` y la del texto «Orden: Del más reciente al más antiguo».
  - **test_tabla.mjs, el bloque del Hub (:2515-2550),** con la nota «B4.1 (P23, P24)»:
    - sin la casilla, `visibles.reduce(...) === 664` (antes 40 + 664 = 704);
    - `TABLA.mostrarPorDefecto(cols, ['fisico', 'reservado'])` deja esas dos visibles, devuelve los mismos objetos para las
      demás y no muta `cols`;
    - la definición amplia suma 832 ≤ 960 (la caja a 1280 con el menú abierto: 1280 − 320);
    - la página trae `const COLUMNAS_HUB_AMPLIO = mostrarPorDefecto(COLUMNAS_HUB, ['fisico', 'reservado']);`,
      `ANCHO_HUB_AMPLIO = 1280`, `mejorLinea="neutro"` (P15), sin `onSeleccion=` ni `seleccion=` en su TablaEstandar (P23) y
      `usePreferenciasTabla(ID_HUB, columnasHub)`.
- [ ] **Paso 2: correr el ROJO** → AssertionError de COLUMNAS_KARDEX, `avisoTopeAlmacenes is not a function` y
  `mostrarPorDefecto is not a function`.
- [ ] **Paso 3: implementar.**
  - **P16:** las dos columnas; el JSDoc de COLUMNAS_KARDEX dice que la cuarentena y lo sin dirección solo salen en la lista.
  - **P22:** Almacenes usa `avisoTopeAlmacenes(listado.total)`.
  - **P23:** se quitan `seleccion`, `alSeleccionar`, `pieSeleccion` y sus props; `cambiarFiltros` deja de limpiar la selección.
  - **P24:**
    - `const anchoVentana = useAnchoVentana();`;
    - `const columnasHub = (anchoVentana ?? 0) >= ANCHO_HUB_AMPLIO ? COLUMNAS_HUB_AMPLIO : COLUMNAS_HUB;`;
    - `columnasHub` en `usePreferenciasTabla`, en `ajustes` y en TablaEstandar;
    - el comentario de R26: «a 1024 la caja deja 704: 112 + 140 + 120 + 88 + 124 + 80 = 664; desde 1280, + Físico y Reservado (832)».
  - **P15:** `mejorLinea="neutro"`.
  - **P26:** `INICIAL_KARDEX = { orden: '-fecha' }`; Fecha `ordenable: 'fecha'`; `extraLista` sin `orden: null`; se quita
    `TEXTO_ORDEN_KARDEX` de la barra; los comentarios de :61 y :105-110 dicen que ahora se ordena.
  - **P25:** el sufijo nuevo; el comentario de inventario/page.tsx:384 lo dice.
- [ ] **Paso 4: VERDE.** Los dos .mjs; `npm test`; `tsc` 5; eslint de los archivos tocados. Mutantes:
  - (a) Salidas sin 'SCRAP' → `AssertionError [ERR_ASSERTION]: y salidas`;
  - (b) `mostrarPorDefecto` que muta la entrada → la aserción de «no muta `cols`».
- [ ] **Paso 5: commits**, uno por clave o par: `fix(inventario): B4.1 T8 (P16) el tablero del Kardex cuenta la pérdida y la devolución`,
  `fix(inventario): B4.1 T8 (P22) el texto del tope de Almacenes`, `fix(inventario): B4.1 T8 (P23, P24) sin la casilla y Físico y Reservado desde 1280`,
  `fix(inventario): B4.1 T8 (P15) la línea del valor es neutra`, `feat(inventario): B4.1 T8 (P26) el Kardex se ordena por fecha` y
  `fix(inventario): B4.1 T8 (P25) el selector dice que incluye las subcategorías`.

---

### Task 9: Pantallas de E-Commerce y la Agenda (A1-f, P31, P33, P34)

**Modelo:** sonnet. **Depende de:** T2 (`editable_en_tienda`, ids), T5 (`currency`, `lead_time_days`), T6 (datos-cliente.js y
test_datos_cliente.mjs) y T8 (test_tabla.mjs).

**Files:**
- Modify: `frontend/src/lib/roles.js` (junto a `accesoTienda`, :147-160)
- Modify: `frontend/src/app/dashboard/ecommerce/page.tsx`:
  - `ProductoCatalogo` (:373-386); `TITULO_SOLO_ADMIN` (:410);
  - `CeldaTienda` (:519-532); `CeldaAccionesCatalogo` (:534-549); `TarjetaProductoCuadricula` (:578-602);
  - las pestañas (:932).
- Modify: `frontend/src/lib/datos-cliente.js`: `proveedorDeServidor` (:412-433), `CLAVES_PROVEEDOR_SERVIDOR` (:435-439) y
  `proveedorAServidor` (:441-456), más una función nueva, `historialComercialCliente`
- Modify: `frontend/src/lib/kpis.js:1352-1366` (`tarjetasFichaProveedor`)
- Modify: `frontend/src/app/dashboard/agenda/page.tsx`:
  - `:130-138` y `:420-447` (los formularios del proveedor);
  - `:792-801` y `:1084-1093` (la moneda; el tiempo de entrega va a su lado);
  - `:903-913` (las tarjetas); `:1540-1589` (Historial Comercial).
- Test: `frontend/tests/test_roles.mjs`, `test_tabla.mjs` (:3196 y el bloque del catálogo, ~:2990-3010),
  `test_datos_cliente.mjs` (:513-545) y `test_kpis.mjs` (:1388-1393)

**Interfaces:**
- Consumes:
  - de T2, `editable_en_tienda` y los ids con signo;
  - de T5, `currency` y `lead_time_days` en el proveedor;
  - de profile-360 (crm.py), `solicitudes` [{id, numero, estado, created_at}] y `pedidos`
    [{id, numero, estado, total_cop, anticipo_cop, created_at}].
- Produces:
  - **`edicionFilaCatalogo(p, puedeEditar: boolean) -> { editable: boolean, motivo: string | null }`:**
    - sin permiso → `{ false, TITULO_SOLO_ADMIN_CATALOGO }`;
    - con `p?.editable_en_tienda === false` → `{ false, TEXTO_FILA_DEL_ERP_TIENDA }`;
    - si no → `{ true, null }`.
    - Los textos: `TITULO_SOLO_ADMIN_CATALOGO = 'Solo la Administración edita el catálogo'` (se mueve de la página) y
      `TEXTO_FILA_DEL_ERP_TIENDA = 'Viene del catálogo del ERP: no se edita desde la tienda.'`.
  - **Proveedor:** `CLAVES_PROVEEDOR_SERVIDOR` suma `['moneda_default', 'currency']` y `['tiempo_entrega_dias', 'lead_time_days']`.
    - `proveedorAServidor` manda '' como null, y el tiempo como número.
    - `proveedorDeServidor` copia `currency` → `moneda_default` y `lead_time_days` → `tiempo_entrega_dias` SOLO si el servidor
      manda esa clave; si no, no la inventa, como fija hoy test_datos_cliente.mjs:533-534.
  - **`tarjetasFichaProveedor`** suma `prov_moneda: { valor: currency || null }` y
    `prov_tiempo_entrega: { valor: n === null ? null : n === 1 ? '1 día' : `${n} días` }`.
  - **`historialComercialCliente(perfil360, { returnTo }) -> { solicitudes: FilaHistorial[], pedidos: FilaHistorial[] }`:**
    - desenvuelve `data` como `resumenFichaCliente`;
    - `FilaHistorial = { id, numero, estado, etiqueta, fecha, href, total_cop?, anticipo_cop? }`;
    - `etiqueta` es la de `infoEstadoSolicitud` o `infoEstadoPedido`;
    - `href` = `enlaceDocumento('SC' | 'PVEN', id, { returnTo })` (lib/analisis.js).

- [ ] **Paso 1: ROJO.**

```js
// test_roles.mjs
console.log('--- B4.1 T9 (A1-f): edicionFilaCatalogo — una fila SKU de la rama heredada no se edita desde la tienda ---');
{
  const { edicionFilaCatalogo, TITULO_SOLO_ADMIN_CATALOGO, TEXTO_FILA_DEL_ERP_TIENDA } = await import('../src/lib/roles.js');
  assert.deepEqual(edicionFilaCatalogo({ id: 4, editable_en_tienda: true }, true), { editable: true, motivo: null });
  assert.deepEqual(edicionFilaCatalogo({ id: -9, editable_en_tienda: false }, true), { editable: false, motivo: TEXTO_FILA_DEL_ERP_TIENDA });
  assert.deepEqual(edicionFilaCatalogo({ id: 4, editable_en_tienda: true }, false), { editable: false, motivo: TITULO_SOLO_ADMIN_CATALOGO });
  assert.deepEqual(edicionFilaCatalogo({ id: 4 }, true), { editable: true, motivo: null }, 'sin la llave (servidor viejo): como hoy');
}
// test_datos_cliente.mjs
console.log('--- B4.1 T9 (P33, P34): el proveedor con moneda y tiempo; el Historial Comercial con las claves reales del 360 ---');
{
  const dc = await import('../src/lib/datos-cliente.js');
  const p = dc.proveedorDeServidor({ id: 3, name: 'X', currency: 'USD', lead_time_days: 21 });
  assert.equal(p.moneda_default, 'USD'); assert.equal(p.tiempo_entrega_dias, 21);
  assert.deepEqual(dc.proveedorAServidor({ nombre: 'X', moneda_default: '', tiempo_entrega_dias: '' }), { name: 'X', currency: null, lead_time_days: null });
  assert.deepEqual(dc.proveedorAServidor({ moneda_default: 'EUR', tiempo_entrega_dias: '14' }), { currency: 'EUR', lead_time_days: 14 });
  const perfil = { data: { solicitudes: [{ id: 7, numero: 'SC-7', estado: 'BORRADOR', created_at: '2026-11-01T10:00:00Z' }],
                           pedidos: [{ id: 9, numero: 'PVEN-9', estado: 'EN_PROCESO', total_cop: 100, anticipo_cop: 50 }] } };
  const h = dc.historialComercialCliente(perfil, { returnTo: '/dashboard/agenda?customer_id=4' });
  assert.equal(h.solicitudes[0].href, '/dashboard/ventas/solicitud/7?return_to=%2Fdashboard%2Fagenda%3Fcustomer_id%3D4');
  assert.equal(h.pedidos[0].href, '/dashboard/ventas/venta/9?return_to=%2Fdashboard%2Fagenda%3Fcustomer_id%3D4');
  assert.equal(h.solicitudes[0].etiqueta, 'Nueva');   // la etiqueta de infoEstadoSolicitud('BORRADOR')
  assert.deepEqual(dc.historialComercialCliente(null, {}), { solicitudes: [], pedidos: [] });
  const agenda = readFileSync(new URL('../src/app/dashboard/agenda/page.tsx', import.meta.url), 'utf8');
  assert.ok(!/customer360\?\.customer_requests|customer360\?\.sales_orders/.test(agenda), 'P34: ya no las claves que el 360 no manda');
  assert.match(agenda, /historialComercialCliente\(customer360/);
  assert.match(agenda, /<TarjetaKpi kpi="prov_moneda"/); assert.match(agenda, /<TarjetaKpi kpi="prov_tiempo_entrega"/);
}
```

  - Comprobado en 6caf56b: `infoEstadoSolicitud('BORRADOR').label` es «Nueva» e `infoEstadoPedido('EN_PROCESO').label` es
    «En proceso»; la aserción de pedidos usa `h.pedidos[0].etiqueta === 'En proceso'`.
  - test_kpis.mjs (:1388-1393): `tarjetasFichaProveedor({ payment_terms: '30 días', currency: 'USD', lead_time_days: 1 }, 7)` →
    con `prov_moneda: { valor: 'USD' }` y `prov_tiempo_entrega: { valor: '1 día' }`; sin esas claves, `{ valor: null }`.
  - test_tabla.mjs:
    - :3196 pasa a `\{\['Panel', 'Catálogo', \.\.\.\(acceso\.pagosConfig \? \['Pagos'\] : \[\]\)\]\.map\(t => \(` (P31), y la
      página no trae `'Clientes Web'`;
    - el bloque del catálogo exige `edicionFilaCatalogo(p,` en CeldaTienda, en CeldaAccionesCatalogo y en
      TarjetaProductoCuadricula, y `import { …TITULO_SOLO_ADMIN_CATALOGO… } from '@/lib/roles'`.
- [ ] **Paso 2: correr el ROJO** → `edicionFilaCatalogo is not a function`, `historialComercialCliente is not a function`, las
  tarjetas y la guarda de las pestañas.
- [ ] **Paso 3: implementar.**
  - **A1-f:**
    - CeldaTienda: si `!editable` y `p.editable_en_tienda === false`, `<span title={motivo}>Del ERP</span>` (`text-[11px]`,
      gris) en lugar del interruptor; si no, el interruptor con `disabled={!editable}` y `title={motivo}`.
    - CeldaAccionesCatalogo: con `!editable`, el «—» con su `title`.
    - La tarjeta de la cuadrícula: la misma regla. Conserva la prop `puedeEditar`, que fija test_kanban_ventas.mjs:1826.
    - `ProductoCatalogo` suma `editable_en_tienda?: boolean`.
  - **P31:** se quita 'Clientes Web' del arreglo; el endpoint `/ecommerce/clientes` no se toca.
  - **P33:**
    - en los dos formularios, un campo «Tiempo de entrega (días)» (`type="number" min={0} max={365}`) junto a «Moneda Principal»;
    - la moneda suma `<option value="">Sin definir</option>`;
    - los valores por defecto pasan a `moneda_default: 'COP'` y `tiempo_entrega_dias: ''` en «Nuevo», y a
      `sup.moneda_default ?? ''` y `sup.tiempo_entrega_dias ?? ''` en «Editar», sin el `|| 'COP'` ni el `|| 7`;
    - cuatro tarjetas en la FranjaKpis del proveedor; el comentario de :903-905 deja de decir que no existen.
  - **P34:**
    - el Historial Comercial pinta `historialComercialCliente(customer360, { returnTo: \`/dashboard/agenda?customer_id=${id}\` })`,
      con el id del cliente abierto, el mismo que recibió `fetchProfile`;
    - cada fila: número, insignia con `etiqueta` (el color de `STATUS_COLOR_MAP[estado]`), fecha con `hace(fecha)` y
      «Ver SC →» o «Ver Pedido →» con su `href`;
    - los pedidos dicen «Total: … · Anticipo: …» como hoy.
- [ ] **Paso 4: VERDE.** Los cuatro .mjs; `npm test`; `tsc` 5; eslint (E-Commerce, contra su línea base de 6caf56b). Mutantes:
  - (a) `edicionFilaCatalogo` que ignora `editable_en_tienda` → `AssertionError` del segundo caso;
  - (b) `proveedorDeServidor` que pone `moneda_default: null` sin la clave → test_datos_cliente.mjs:533
    `el servidor no manda la moneda: no se inventa`.
- [ ] **Paso 5: commits:** `fix(ecommerce): B4.1 T9 (A1-f) una fila del ERP no ofrece publicar ni eliminar desde la tienda`,
  `fix(ecommerce): B4.1 T9 (P31) sin la pestaña vacía Clientes Web`, `feat(agenda): B4.1 T9 (P33) moneda y tiempo de entrega del proveedor` y
  `fix(agenda): B4.1 T9 (P34) el Historial Comercial con las claves reales y sus enlaces`.

---

### Task 10: Lo transversal: menú lateral en pantallas angostas (P3), detalles de SC y COT a 375 (P14) y avisos de la franja (C4)

**Modelo:** opus. **Depende de:** T6 (solicitud/[id], cotizacion/[id], lib/flujo.js y test_flujo.mjs) y T9 (es la última tarea de
pantallas: la lista de capturas cubre todas).

**Files:**
- Create: `frontend/src/lib/menu-lateral.js`, `frontend/tests/test_menu_lateral.mjs`
- Modify: `frontend/package.json` (el script "test" suma `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/test_menu_lateral.mjs`)
- Modify: `frontend/src/components/Sidebar.tsx`: el estado (:15-26), el aside (:125), AlertasBadge (:141) y los `{!isCollapsed && …}`
  (:132, :147, :164, :181, :183, :197, :233, :242 y :251)
- Modify: `frontend/src/lib/detalle-layout.js` (función nueva junto a `anchoInicialPanel`, :96)
- Modify: `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx:1132-1136` y `:1377-1387`
- Modify: `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx:876-879` y `:1215-1224`
- Modify: `frontend/src/lib/flujo.js` (función nueva) y `frontend/src/components/flujo/PasosFlujo.tsx:194-200`, `:225-238` y `:421`
- Test: `frontend/tests/test_menu_lateral.mjs`, `test_detalle_layout.mjs`, `test_flujo.mjs` (:683-690) y
  `test_ajustes_visuales_b2.mjs:121`

**Interfaces:**
- Consumes: de T8, `useAnchoVentana()`.
- Produces:
  - **`ANCHO_MENU_ANGOSTO = 768`.**
  - **`menuLateralEfectivo({ anchoVentana, plegadoElegido, abiertoEnAngosta }) -> { plegado: boolean, superpuesto: boolean }`:**
    - con `anchoVentana` null (el servidor o el primer render) → `{ plegado: plegadoElegido, superpuesto: false }`;
    - con menos de 768 → `{ plegado: !abiertoEnAngosta, superpuesto: abiertoEnAngosta }`;
    - si no → `{ plegado: plegadoElegido, superpuesto: false }`.
  - **`alternarMenu({ anchoVentana, plegadoElegido, abiertoEnAngosta }) -> { plegadoElegido, abiertoEnAngosta }`:** en angosto
    cambia `abiertoEnAngosta`; si no, cambia `plegadoElegido`.
  - **`clasesDivisionDetalle(actividadAbierta: boolean) -> { contenedor, izquierda, asa, panel, botonActividad }`:**
    - `contenedor = 'flex-1 flex flex-col overflow-y-auto md:flex-row md:overflow-hidden'`;
    - `izquierda = 'shrink-0 md:flex-1 md:shrink md:overflow-y-auto'`;
    - `asa = 'hidden md:block'`;
    - `panel` = `` `${actividadAbierta ? 'flex max-md:min-h-[70vh]' : 'hidden'} w-full flex-col md:flex md:w-[var(--ancho-panel)] md:shrink-0` ``;
    - `botonActividad = 'md:hidden'`.
  - **`claseChipAviso({ pequeno = false, ajustar = false } = {}) -> string`:**
    - sin `ajustar`, la base de hoy, `inline-block min-w-0 max-w-full truncate whitespace-nowrap rounded-full border align-middle font-semibold`;
    - con `ajustar`, `inline-block min-w-0 max-w-full whitespace-normal break-words rounded-lg border text-left align-middle font-semibold`;
    - más el tamaño: `px-1.5 py-px text-[10px]` con `pequeno`, `px-2 py-0.5 text-[11px]` sin él.

- [ ] **Paso 1: ROJO.**

```js
// tests/test_menu_lateral.mjs (nuevo; va en el script "test")
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANCHO_MENU_ANGOSTO, menuLateralEfectivo, alternarMenu } from '../src/lib/menu-lateral.js';

console.log('--- B4.1 T10 (P3): el menú lateral se pliega o se superpone en pantallas angostas ---');
{
  assert.equal(ANCHO_MENU_ANGOSTO, 768);
  assert.deepEqual(menuLateralEfectivo({ anchoVentana: 375, plegadoElegido: false, abiertoEnAngosta: false }), { plegado: true, superpuesto: false });
  assert.deepEqual(menuLateralEfectivo({ anchoVentana: 375, plegadoElegido: false, abiertoEnAngosta: true }), { plegado: false, superpuesto: true });
  assert.deepEqual(menuLateralEfectivo({ anchoVentana: 1024, plegadoElegido: true, abiertoEnAngosta: true }), { plegado: true, superpuesto: false });
  assert.deepEqual(menuLateralEfectivo({ anchoVentana: null, plegadoElegido: false, abiertoEnAngosta: false }), { plegado: false, superpuesto: false });
  assert.deepEqual(alternarMenu({ anchoVentana: 375, plegadoElegido: false, abiertoEnAngosta: false }), { plegadoElegido: false, abiertoEnAngosta: true });
  assert.deepEqual(alternarMenu({ anchoVentana: 1440, plegadoElegido: false, abiertoEnAngosta: false }), { plegadoElegido: true, abiertoEnAngosta: false });
  const s = readFileSync(new URL('../src/components/Sidebar.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(s, /menuLateralEfectivo\(\{ anchoVentana, plegadoElegido: isCollapsed, abiertoEnAngosta \}\)/);
  assert.ok(!/\{!isCollapsed &&/.test(s), 'los textos siguen al plegado efectivo');
  assert.match(s, /<AlertasBadge colapsado=\{plegado\} \/>/);
  assert.match(s, /max-md:w-20/, 'antes de hidratar, a 375 el menú ya mide 80 px');
  assert.match(s, /aria-label="Cerrar el menú"/, 'el fondo que cierra la capa');
  assert.match(s, /e\.key === 'Escape'/, 'Esc cierra la capa');
}
```

  - **test_detalle_layout.mjs, `B4.1 T10 (P14)`:**
    - `clasesDivisionDetalle(false).panel` incluye `hidden` y `md:flex`; con `true`, `flex` y `max-md:min-h-[70vh]`;
    - las cinco claves exactas;
    - los dos detalles traen `clasesDivisionDetalle(actividadAbierta)`, `['--ancho-panel' as string]: \`${rightWidth}px\``,
      `aria-expanded={actividadAbierta}` y ya no `style={{ width: rightWidth }}` ni `style={{width: rightWidth}}`.
  - **test_flujo.mjs (C4):**
    - `F.claseChipAviso({ ajustar: true })` no trae `truncate` ni `whitespace-nowrap` y trae `whitespace-normal`;
    - `F.claseChipAviso()` = la base de hoy + `px-2 py-0.5 text-[11px]`;
    - la guarda :689 pasa a `<AvisosDelPaso avisos={paso.avisos} estadoConteos={estadoConteos} ajustar clases="hidden w-0 min-w-full @2xl/flujo:flex" />`
      (nota «B4.1 (C4): los avisos de la caja salen enteros»);
    - :683, la constante CHIP del chip-botón, queda igual.
  - **test_ajustes_visuales_b2.mjs:121** pasa a `/<AlertasBadge colapsado=\{plegado\} \/>/`.
- [ ] **Paso 2: correr el ROJO** → `Cannot find module '../src/lib/menu-lateral.js'`, `clasesDivisionDetalle is not a function`,
  `claseChipAviso is not a function` y las guardas.
- [ ] **Paso 3: implementar** (cambios parciales, por secciones).
  - **Sidebar:**
    - `const anchoVentana = useAnchoVentana();`, `const [abiertoEnAngosta, setAbiertoEnAngosta] = useState(false);` y
      `const { plegado, superpuesto } = menuLateralEfectivo(...)`;
    - los dos botones de plegar usan `alternarMenu`;
    - `{!isCollapsed && …}` pasa a `{!plegado && …}`;
    - el aside, superpuesto: `fixed inset-y-0 left-0 z-50 w-64 shadow-xl`, más un hueco `<div aria-hidden="true" className="w-20 shrink-0" />`,
      para que la página no salte, y un fondo `<button type="button" aria-label="Cerrar el menú" className="fixed inset-0 z-40 bg-slate-900/30" onClick={…}>`;
    - el aside, sin superponer: `${plegado ? 'w-20' : 'w-64'} max-md:w-20`;
    - Esc (keydown mientras está superpuesto) y un cambio de `pathname` cierran la capa.
  - **Detalles de SC y COT:**
    - `const [actividadAbierta, setActividadAbierta] = useState(false); const division = clasesDivisionDetalle(actividadAbierta);`;
    - el contenedor, la columna izquierda (con sus clases propias detrás), el asa y el panel toman sus clases;
    - el panel lleva `style={{ ['--ancho-panel' as string]: \`${rightWidth}px\` }}` y `id="panel-actividad"`;
    - antes del panel va un botón `className={\`${division.botonActividad} …\`}` con `aria-expanded` y
      `aria-controls="panel-actividad"`, que dice «Ver actividad» u «Ocultar actividad»;
    - lo de adentro del panel no cambia (IAPanelSC incluido).
  - **C4:**
    - `ChipAvisoInterno({ texto, tono, pequeno, ajustar })` usa `claseChipAviso`;
    - `AvisosDelPaso` recibe `ajustar` y lo pasa;
    - la llamada de la franja (:421) lo manda;
    - la barra (:503) no.
- [ ] **Paso 4: VERDE.** Los .mjs; `npm test` (con test_menu_lateral.mjs en el script); `tsc` 5; eslint de los archivos tocados.
  Mutantes:
  - (a) `menuLateralEfectivo` sin la rama angosta → `AssertionError` del primer caso (`{ plegado: false, superpuesto: false }`);
  - (b) `panel` sin `hidden` cuando está plegado → la aserción de P14;
  - (c) `claseChipAviso({ ajustar: true })` con `truncate` → la aserción de C4.
- [ ] **Paso 5: commits:** `fix(ui): B4.1 T10 (P3) el menú lateral se pliega y se superpone por debajo de 768 px`,
  `fix(ventas): B4.1 T10 (P14) los detalles de SC y COT a 375 con la Actividad plegable` y
  `fix(ui): B4.1 T10 (C4) los avisos de la franja salen enteros`.
- [ ] **Paso 6: la lista de capturas (para el controlador; ningún implementador las toma).** Se copia en el reporte de T10:

| Pantalla (ruta) | Qué cambió (claves) | Anchos |
|---|---|---|
| `/dashboard/ventas/solicitud` (Lista y Kanban; búsqueda escrita) | P4 (Con atraso N), P8 (Vencimiento) | 1024, 1440 |
| `/dashboard/ventas/cotizacion` (Lista y Kanban; búsqueda por teléfono; arrastrar una ENVIADA) | P4, P6, P7 | 1024, 1440 |
| `/dashboard/ventas/cotizacion/{id}` de una CONFIRMADA | P12, P14 | 375, 1024, 1440 |
| `/dashboard/ventas/solicitud/{id}` | P8 (vencimiento), P14 (Actividad plegada y abierta) | 375, 1024, 1440 |
| `/dashboard/ventas/venta` (⋯ › Cancelar pedido) | P10 | 1024, 1440 |
| `/dashboard/ventas/venta/{id}` | P11 | 1024, 1440 |
| `/dashboard/compras` (pestaña En bodega; Agrupar por mes) | P18, P19 | 1024, 1440 |
| `/dashboard/compras/pedidos` (Agrupar por mes) | P19 | 1024, 1440 |
| `/dashboard/compras/transito` | P21 | 1024, 1440 |
| `/dashboard/compras/recepciones/{id}` en BORRADOR, tras guardar y recargar | P20 | 1024, 1440 |
| `/dashboard/inventario` (Lista; Almacenes con más de 200; selector de categoría) | P22, P23, P24, P25 | 1024, 1440 |
| `/dashboard/inventario` pestaña Análisis | P15, P16 | 1024, 1440 |
| `/dashboard/inventario/kardex` (Lista ordenada por fecha y Kanban) | P16, P26 | 1024, 1440 |
| `/dashboard/ecommerce` (pestañas; catálogo en Tabla y Cuadrícula con una fila del ERP) | A1-f, P31 | 1024, 1440 |
| `/store/catalogo` y `/store/producto/-{n}` (sin sesión) | A1-b (URL con id negativo), P27 | 375, 1440 |
| `/dashboard/agenda` cliente › Historial Comercial | P34 | 1024, 1440 |
| `/dashboard/agenda` proveedor (ficha y formulario) | P33 | 1024, 1440 |
| Cualquier pantalla con el menú (p. ej. `/dashboard/inventario` › Análisis): menú cerrado y abierto | P3 | 375, 1024 |
| `/dashboard/ventas`, `/dashboard/ventas/cotizacion` y `/dashboard/compras` con el menú abierto: franja del flujo | C4 | 1024, 1280, 1366 |

---

### Task 11: Verificación de la rama y lista de producción (A6, A5, A1-b, fa6_034 y fa6_035)

**Modelo:** sonnet. **Depende de:** T1 a T10.

**Files:**
- Modify: `backend/scripts/datos_bloque4_1.py` (el subcomando `updated_at_nulos`, solo `--listar`)
- Modify: `backend/tests/test_datos_bloque4_1.py`
- Create: `docs/superpowers/produccion/2026-11-19-ventas-b4-1-lista-produccion.md`

**Interfaces:**
- Consumes: `scripts/datos_bloque4_1.py` de T2.
- Produces:
  - **`listar_updated_at_nulos(db) -> Listado`:** cuenta las filas con `updated_at IS NULL` en `customer_requests`,
    `sales_quotations` y `sale_orders`, en una transacción de solo lectura.
  - **La nota del listado:**
    - con todo en 0: «Ninguna fila con updated_at vacío: la pastilla de atrasados no sube por el coalesce de M6.»;
    - si no: «Hay N filas con updated_at vacío: la pastilla de atrasados puede subir al promover (coalesce de M6, ver V1).».

- [ ] **Paso 1: ROJO.** `test_updated_at_nulos_cuenta_en_solo_lectura`:
  - toma la cuenta de antes;
  - crea una SC y le pone `updated_at = NULL` por SQL, dentro de la transacción revertida;
  - espera que `listar_updated_at_nulos(db)` dé la de antes + 1 en customer_requests y que no haya sentencias de escritura ni
    commits en la ventana;
  - espera que `main(["updated_at_nulos", "--listar"])` imprima `SELECT current_database() -> ` y
    «LISTAR: no se escribió nada (transacción de solo lectura).»;
  - espera que `["updated_at_nulos", "--aplicar", …]` dé un error de argparse.
- [ ] **Paso 2:** `runner test_datos_bloque4_1` → FAIL del nuevo; implementar; → 6/0. Mutante: el listado sin `iniciar_solo_lectura`
  → `AssertionError` de la ventana: una sentencia que no es SELECT o un commit.
- [ ] **Paso 3: la lista de producción.**
  `docs/superpowers/produccion/2026-11-19-ventas-b4-1-lista-produccion.md` tiene estas secciones, en este orden. Se hace solo
  al promover y cada paso con el OK del usuario:
  1. **Qué incluye.** El B4.1 se promueve junto con el B4 (su rama sale de 6caf56b). Este documento solo agrega lo del B4.1 a la
     lista del B4 (FINAL-C1, V1, B49-f…), que sigue vigente.
  2. **Respaldo** de erpdb antes de todo. Lo hace el usuario o el controlador con su OK; nunca se escribe una credencial.
  3. **A6:** `python scripts/datos_bloque4_1.py updated_at_nulos --listar` contra producción, de solo lectura. El resultado se le
     dice al usuario antes de seguir.
  4. **Migraciones:** `alembic upgrade head` con el procedimiento de producción de `alembic/env.py`. fa6_034 crea el índice
     (A5): sale_orders tiene miles de filas y CREATE INDEX la bloquea para escribir unos instantes, así que se hace fuera del
     horario de pedidos. fa6_035 agrega dos columnas nulas al instante.
  5. **Despliegue:** primero el backend y después el frontend. El frontend del B4.1 lee `atrasados_por_vista`,
     `editable_en_tienda`, `currency`/`lead_time_days` y `observaciones`; con un backend viejo, P4 queda gris («—») y el resto
     sale como hoy.
  6. **A1-b:**
     - `datos_bloque4_1.py catalogo_ids --listar`: las URL de la tienda que cambian de `/store/producto/n` a
       `/store/producto/-n` y las historias de Marketing que apuntaban a una fila SKU;
     - con el OK de los ids, `catalogo_ids --aplicar --base erpdb --ids <ids> --respaldo <carpeta datos>`;
     - cómo deshacerlo: el `UPDATE` por fila del JSON de respaldo;
     - el aviso para el usuario: lo que haya compartido o indexado con la URL vieja de una fila SKU ahora da 404 u otra fila.
       Esa URL ya abría otro producto o 404.
  7. **Comprobación** después de promover:
     - `GET /api/v1/ecommerce/catalogo?publicado=true&limit=5` sin sesión trae los ids de las filas SKU en negativo;
     - `/store/producto/-n` abre;
     - un PATCH a `-n` desde E-Commerce responde el 404 de TEXTO_FILA_DEL_ERP.
  8. **Lo que NO se hace en producción:** pruebas, el runner ni el script con `--aplicar` sin `--ids`.
- [ ] **Paso 4: regresión final del backend**, un módulo a la vez:
  - los 55 módulos de la tabla «Módulos corridos» de task-24-backend-report.md;
  - más test_b41_migraciones, test_b41_catalogo_ids, test_datos_bloque4_1, test_b41_proveedores, test_solicitud_asesor_vencimiento
    y test_fechas_ventas_utc;
  - se esperan solo las fallas de la línea base: test_fase5_security_legacy_surface 21/1, y test_mercancia_transito ya en 13/0;
  - todas con «Base intacta» y «Chatwoot real bloqueado 0 veces»;
  - las salidas van a `.superpowers/sdd/2026-11-19-ventas-b4-1-revision-usuario/salidas/`.
- [ ] **Paso 5: frontend final.**
  - `npm test` exit 0;
  - `npx tsc --noEmit` = 5;
  - eslint de todos los archivos de `git diff --name-only 6caf56b..HEAD -- frontend/src`, sin errores nuevos;
  - `npm run build` con `NEXT_PUBLIC_API_URL=http://localhost:8020/api/v1`, sin errores. No hace falta ningún servidor.
- [ ] **Paso 6: commit.** `docs(ventas): B4.1 T11 (A6) conteo de updated_at vacío y lista de producción del Bloque 4.1`.
  El controlador revisa toda la rama (`6caf56b..HEAD`) y toma las capturas de T10.
