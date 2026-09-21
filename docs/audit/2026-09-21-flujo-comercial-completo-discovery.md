# Descubrimiento: Flujo Comercial Completo (Producto → Solicitud → Cotización → Pedido → Compra → Tránsito → Recepción)

**Fecha:** 2026-09-21
**Origen:** el usuario describió una visión completa de cómo debería funcionar el flujo comercial de punta a punta, probando la app en vivo (preview local) tras el cierre de Fase A + TD-05 + TD-03 Parte 3. Esto es un documento de descubrimiento, no un plan de implementación — su propósito es fijar qué existe, qué existe pero con defectos, y qué no existe, antes de decidir cómo dividir el trabajo.

**Relación con el roadmap existente:** este trabajo NO es "Fase F" del roadmap de auditoría original (`docs/audit/2026-09-17-fase1-discovery-arquitectura.md`, Fases A-E). Es una iniciativa separada, orientada a producto/funcionalidad comercial, que el usuario está definiendo ahora. Toca parcialmente TD-03 (catálogo) pero va mucho más allá de su alcance original.

**Metodología:** 4 investigaciones de código en paralelo (catálogo/variantes; solicitud→cotización→CRM; pedido de venta→compras; mercancía en tránsito→recepciones) sobre `C:\Users\jmqui\Nebulae_ERP_Work\Mirror`.

---

## 1. Catálogo de productos y variantes

**Ya existe:**
- Modelo de variantes real (Producto → SKU → Atributos/Valores como Talla/Color) — pero **solo en el catálogo nuevo** (`backend/app/models/catalog.py`), no en el legacy `ecommerce_products` que la tienda usa hoy.
- Venta sin stock (backorder): ya existe como concepto explícito — `ENTREGA_INMEDIATA` (exige stock) vs `POR_PEDIDO` (acepta stock 0, marca `PENDIENTE_COMPRA`), con sugerencia automática según disponibilidad (`ecommerce.py:184,228,504-534,812-819,915-947`).
- Categorías: existen en base de datos (tabla `categories`).
- TD-03 (unificación de catálogo) ya construyó la doble-escritura completa y está fusionado a `main` — pero el flag `CATALOGO_LECTURA` sigue apagado en todos los entornos, documentado como bloqueado hasta una "Parte 4" sin fecha.

**Existe pero con defectos:**
- Categorías: la API solo permite crear y listar — **no hay editar ni borrar** (`catalog.py:31-46`, sin PUT/DELETE en todo el backend).
- Ninguna pantalla del panel administra categorías. En las pantallas de catálogo e-commerce y constructor de sitio web, "Categoría"/"Sub-categoría" son **texto libre sin conexión real** a la tabla `categories` (`ecommerce/page.tsx:172-177`; `sitio-web/page.tsx:233-234`).
- El catálogo legacy (el que la tienda usa hoy) guarda "variantes" como bloque de texto/JSON libre — sin talla/color como conceptos reales.

**No existe:**
- Pantalla para crear/gestionar categorías y subcategorías de forma configurable.
- Confirmación de que exista una pantalla completa en el panel para crear un producto con múltiples variantes (talla × color) usando el modelo nuevo — la API existe (`catalog.py:103-129`), no se confirmó una UI equivalente completa.

---

## 2. Solicitud de Cliente → Cotización → CRM

**Ya existe y funciona razonablemente bien:**
- 6 tipos de solicitud (no 5): Cotización de Producto, Seguimiento, Programar Entrega, Devolución de Producto, Soporte Técnico, Nuevo Lead.
- Programar Entrega y Devolución de Producto: formularios propios completos.
- Vencimiento configurable (campo "Días Vencimiento" en el formulario) — el default actual es **30 días**, no 5.
- Alerta de solicitud desatendida: **ya existe, configurable, default 2 días** — exactamente lo que pediste (`erp_ventas.py:909-944`), con aviso visual "ATENCIÓN REQUERIDA" en rojo.
- Creación automática de Lead en CRM — pero con una limitación importante (ver abajo).

**Existe pero con defectos confirmados:**
- **Asesor es texto libre**, no un selector — se puede escribir cualquier cosa (`solicitud-client.tsx:587,1782,2094`).
- **Soporte Técnico** es casi un cascarón vacío: solo el nombre en la lista, sin campos ni lógica propia.
- Lead en CRM **solo se crea si el cliente ya existía** en el sistema; si es cliente nuevo escrito a mano, no se crea Lead y no avisa a nadie (`solicitud-client.tsx:786-797`).
- El Lead intenta avanzar de etapa al crear una cotización, pero es lógica **solo de frontend** (no del servidor), sin garantía y sin aviso si falla (`solicitud-client.tsx:738-756`). **Al convertir cotización en Pedido de Venta, el Lead NO se mueve — esa lógica no existe en ninguna parte.**
- **Bug confirmado**: al crear una cotización (aunque sea borrador), la solicitud pasa inmediatamente a estado "CONFIRMADA" y salta a la pestaña de confirmadas, sin que el cliente haya confirmado nada (`erp_ventas.py:344`).
- **Bug confirmado**: los botones "Ver Cotización" / "Ver Pedido de Venta" siempre llevan a la lista general, nunca al registro específico (`solicitud-client.tsx:1810,1853-1854`).
- **Hallazgo importante**: la página de detalle de cotización individual (`cotizacion/[id]/page.tsx`) es una **maqueta con datos inventados fijos**, sin conexión real a la base de datos.
- "Cotizar/Calcular Precios" solo abre una calculadora en pantalla (no autocompleta desde catálogo con la lógica de "producto no existe, ¿agregar?" que describiste).
- "Enviar al Cliente" **solo cambia una etiqueta de estado** — no envía nada real ni pregunta por canal (WhatsApp/otro).

---

## 3. Pedido de Venta → Lista de Compras → Pedido de Compra

**Ya existe:**
- Los dos caminos (compra directa / agregar a lista de compras) existen y aparecen juntos en la ficha del pedido (`venta-client.tsx:696-740`).
- Formulario para consolidar varios pedidos de venta en una sola compra (`compras/pedidos/page.tsx:717-745`).

**Existe pero con defectos confirmados (más grave de lo esperado):**
- **No hay aviso de "ya está en la lista"** — el botón se puede presionar varias veces; el servidor evita duplicar en silencio pero la pantalla no informa nada.
- **Bug de integridad de datos confirmado**: al consolidar varios pedidos de venta en una compra, **solo el primer pedido marcado queda realmente vinculado** (`erp_compras.py:391-398`); los demás quedan como texto separado por comas, no como relación real de datos. Esos otros pedidos siguen mostrando "Pendiente de Compra" con ambos botones activos, **aunque ya fueron comprados** — riesgo real de compra duplicada.
- La "Lista de Compras" se guarda dentro de una tabla genérica de configuración del sitio web (`web_builder_config`), no en su propia tabla — difícil de auditar.
- Ya existe un mecanismo robusto de trazabilidad muchos-a-muchos en el servidor (`erp_compras_asignaciones.py`) que **ninguna pantalla usa hoy** — es decir, la solución ya está construida, solo falta conectarla a la UI de consolidación.

---

## 4. Mercancía en Tránsito → Recepciones

**Ya existe (más completo de lo propuesto):**
- Seguimiento de tránsito con **11 etapas** (no 4), incluyendo aduana y consolidación de carga, más una ruta directa que se salta Miami (`erp_logistica.py:113-149`). No se pueden saltar pasos ni retroceder (ya probado).
- Sistema de alertas automáticas ya funcionando (despacho atrasado, llegada atrasada, +5 días sin consolidar en Miami, +3 días hábiles en aduana).
- Formato único ENINV-AAAA#### / PEC-AAAA#### con vínculo real entre recepción y pedido de compra.
- Recepción parcial: ya registra cantidad esperada/recibida/faltante/sobrante por línea, y transiciona automáticamente a "Parcialmente recibido" o "Recibido".
- Inventario en tránsito como categoría separada del inventario físico (`stock_en_transito`, calculado aparte de `stock_vendible_fisico`).

**Existe pero con defectos:**
- **Los tiempos de alerta están fijos en el código** (3, 5, 4 días) — no configurables desde el panel, como pediste.
- No existe un módulo formal de "reclamación" al proveedor por faltantes — solo un texto sugerido dentro de una alerta.

---

## Recomendaciones sobre alertas configurables (pediste ayuda aquí)

Dado que YA existe la lógica de alertas (tránsito: 3/5/4 días; solicitud desatendida: 2 días; vencimiento de solicitud: 30 días) — el trabajo real no es "inventar" el sistema de alertas, sino **exponer los umbrales ya existentes en una pantalla de configuración** en vez de tenerlos fijos en el código. Sugerencia: una sola pantalla "Configuración de Alertas y Plazos" con todos estos valores juntos (vencimiento de solicitud, desatención de solicitud, y los 4 umbrales de tránsito), en vez de repartirlos por módulo — así se administran en un solo lugar y es más fácil para el equipo ajustar tiempos sin tocar código.

---

## Propuesta de división en sub-proyectos

El pedido original cubre demasiado para una sola spec/plan. Propuesta de secuencia (cada uno con su propio ciclo diseño → spec → plan → implementación):

1. **Catálogo configurable**: activar el catálogo canónico (TD-03 Parte 4, ya prevista) + CRUD real de categorías/subcategorías + confirmar/completar UI de creación de variantes. *Es la base — todo lo demás depende de que el producto exista correctamente.*
2. **Solicitud de Cliente — correcciones y asesor seleccionable**: asesor como dropdown, default de vencimiento a 5 días, arreglar el bug de "confirmada" prematura, completar Soporte Técnico.
3. **Cotización — conectar lo que ya existe**: arreglar navegación a detalle real (quitar la maqueta), implementar autocompletar producto con opción de crear, implementar "Enviar al Cliente" con selección real de canal.
4. **CRM — automatización del pipeline**: mover lógica de avance de Lead al servidor (no solo frontend), crear Lead también para clientes nuevos, agregar el movimiento faltante al convertir cotización → pedido de venta.
5. **Pedido de Venta → Compras — arreglar trazabilidad**: conectar la UI de consolidación al mecanismo muchos-a-muchos que ya existe en el servidor (arregla el bug de compra duplicada), agregar indicador "ya en lista".
6. **Configuración de Alertas y Plazos**: pantalla única para los umbrales que hoy están fijos en código (tránsito + solicitudes).
7. **(Opcional/backlog)** Módulo de reclamaciones a proveedor por faltantes; traslados internos, bodegas compartidas, ajustes de inventario, ubicaciones físicas — mencionados por el usuario como "si aplica a las necesidades de la compañía", no urgentes.

**Recomendación:** empezar por el punto 1 (catálogo), porque los puntos 2-5 asumen que el catálogo nuevo (con variantes reales) ya es la fuente activa.
