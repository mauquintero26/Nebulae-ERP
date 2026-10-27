# Ventas · Bloque 4 · Tabla estándar, Kanban, indicadores, pestañas Análisis y diagrama del flujo — Especificación

> **Enmienda del controlador (2026-10-27, T0):** la cabeza real de alembic es fa6_032 (fa6_032_nombre_para_mostrar, B3-T20b), así que la migración del bloque se llama fa6_033_preferencias_usuario y se encadena a fa6_032 (R20 lo permite). El bloque parte de main c2c9f9f (B1, B2, B2.1, B3 y B3.1 integrados), no de la rama ventas-bloque3-documentos-envio-iva. core/fechas.py no tiene OFFSET_CO (B3 dejó ZONA_COLOMBIA): T1A lo agrega (Colombia no tiene horario de verano, UTC−5 fijo).

Fecha: 2026-10-04 · Rama: `ventas-bloque4-tablas-kanban-kpis-analisis` · Base: punta de `ventas-bloque3-documentos-envio-iva` (apilada sobre los Bloques 1 y 2) · Plan: `docs/superpowers/plans/2026-10-04-ventas-bloque4-tablas-kanban-kpis-analisis.md`

## Objetivo

Que todas las pantallas de la app se lean y se usen igual, con datos reales: una tabla estándar (columnas que se estiran, se mueven y se recuerdan; 25 o 50 filas paginadas en el servidor; orden por columna; filtros que sí filtran; nunca ceros mientras carga), un Kanban en todas las tablas (que respeta las reglas de cada documento y, donde no hay estados, sirve para ver), una sola tarjeta de indicadores con los mismos nombres y cifras en todos lados, una pestaña Análisis por Hub con el diseño de referencia y datos agregados en el servidor, y el diagrama del flujo (cajas con conteos y atrasos) en Ventas y Compras, en la barra de cada documento y en el Dashboard General. Todo con una sola regla de atraso, un solo juego de estados de compras, existencias calculadas en un solo lugar y una sola forma de recordar cómo deja el usuario cada pantalla.

## Origen

- Página del plan del Bloque 4 (`plan-bloque4.json`, armada por `build-plan4.js` desde `diseno-bloque4.json` con los ajustes del crítico: preguntas quitadas, fusionadas, reescritas y nuevas, y el ítem PERMISOS): 32 arreglos y 30 preguntas.
- Respuestas del usuario en `respuestas-plan4/plan/*.json` (2026-10-04): los 32 en «Bien»; comentario general: "nada mas".
- Diseño por ítem y cruce crítico (21 choques, 19 huecos, orden de 9 tareas, 9 pruebas que se rompen y 22 ajustes de preguntas) en `diseno-bloque4.json`, más el inventario de 53 pantallas.
- Diseños de los Bloques 1 a 3, el plan del Bloque 1 y los generadores de los planes 2 y 3, solo para no contradecirlos y nombrar sus interfaces.

### Resumen de decisiones del controlador (`decisiones-bloque4.md`, vinculante)

> # Bloque 4 — decisiones del usuario (página del plan, 2026-10-04)
> - 32 arreglos, todos "Bien" (incluye PERMISOS: autoriza reescribir >30% de las pantallas grandes listadas y editar .agents/rules/analisis-tab-standard.md y design-system-reference.md, con pruebas, revisión y capturas). Comentario general: "nada mas".
> - Todas las respuestas = recomendación, salvo: ia_en_analisis = "Dejarlos visibles con el aviso «En construcción»" (no quitarlos). → Los asistentes de IA de las pestañas Análisis (y el Copilot del Hub de Ventas / Pedidos de compra) quedan visibles con aviso «En construcción» y sin respuestas falsas hasta el Bloque 5.
> - Respuestas completas en capturas/respuestas-plan4/plan/*.json (recordar_pantallas: en el usuario; atención primero en listas; orden_clic_columna: toda la tabla + botón «Atención primero»; cot confirmada sin pedido = pendiente; hub_tarjetas: dinero y avance; clic_en_hub: filtra en el Hub; periodo_comparacion: 30 vs 30; cifra_ventas: pedidos creados sin cancelados/devueltos; montos completos; analisis_en_listas: uno por Hub; inventario real; pantallas_sin_datos: quitarlas del menú; Kanban: cerradas plegadas, tablas sin estado = tablero solo para ver; PEC motivo obligatorio; cancelar en tránsito sin recepciones; tránsito arrastrar completa; lead con solicitud movible; despacho también Bodega; mínimo por referencia (5); valor por costo; cumplimiento recibidos/emitidos; gastos en COP; flujo en la franja de arriba con conteos y atrasados; compras atraso por fecha estimada).

## Alcance (ítems que entran)

| Ítem | Título | Grupo | Esfuerzo | Estado | Comentario | Tareas |
|---|---|---|---|---|---|---|
| TABLA-base | Tabla estándar: columnas que se estiran, se mueven y se recuerdan | Tablas | L | Bien | — | T1B, T3A, T4A, T4C, T4D |
| TABLA-api | Listas que cuentan todo y traen 25 o 50 a la vez | Tablas | M | Bien | — | T1A, T3A, T4C, T6B, T12, T20 |
| TABLA-hub-ventas | Hub de Ventas: primero lo atrasado y la tabla completa a 1024 px | Tablas | L | Bien | — | T1C, T2, T6A, T7 |
| TABLA-listas-ventas | Solicitudes, Cotizaciones y Pedidos con la tabla estándar | Tablas | L | Bien | — | T1C, T2, T6B, T8, T9, T10 |
| TABLA-compras | Compras con la tabla estándar y lo vencido primero | Tablas | L | Bien | — | T1C, T2, T12, T13, T14, T15, T16A, T16B |
| TABLA-inventario | Inventario con existencias reales en la tabla estándar | Tablas | L | Bien | — | T1C, T6B, T13, T17, T18, T19 |
| TABLA-otros | CRM, E-Commerce, Marketing y Gastos con la tabla estándar | Tablas | M | Bien | — | T20, T21, T22, T23A, T23B |
| KANBAN-base | Vista Kanban común para las tablas | Kanban | L | Bien | — | T1A, T3A, T4A, T4B |
| KANBAN-hub-ventas | Kanban del Hub de Ventas: primero lo urgente | Kanban | M | Bien | — | T3C, T6A, T7 |
| KANBAN-ventas-listas | Kanban en Solicitudes, Cotizaciones y Pedidos | Kanban | L | Bien | — | T2, T3C, T6B, T8, T9, T10 |
| KANBAN-compras | Kanban de pedidos de compra con reglas | Kanban | L | Bien | — | T1C, T2, T12, T14, T15, T24 |
| KANBAN-logistica | Kanban de tránsito, recepciones, entregas y bodega | Kanban | L | Bien | — | T2, T3C, T6B, T12, T16A, T16B, T19 |
| KANBAN-crm | CRM con el tablero común y sin leads perdidos de vista | Kanban | M | Bien | — | T3C, T20, T21, T24 |
| KANBAN-resto | Kanban en pedidos web, y dónde no aplica | Kanban | S | Bien | — | T13, T17, T18, T19, T20, T22, T23A |
| KPI-base | Una sola tarjeta de indicadores para toda la app | Indicadores (tarjetas KPI) | M | Bien | — | T1A, T3A, T4A, T4D, T5D |
| KPI-ventas | Indicadores de Ventas: mismos nombres y cifras completas | Indicadores (tarjetas KPI) | L | Bien | — | T1C, T2, T3C, T6C, T7, T8, T9, T10 |
| KPI-compras | Indicadores de Compras con un solo criterio | Indicadores (tarjetas KPI) | L | Bien | — | T1C, T2, T12, T14, T15, T16A, T16B, T19 |
| KPI-inventario | Indicadores de Inventario con existencias reales | Indicadores (tarjetas KPI) | L | Bien | — | T1C, T13, T17, T18, T19 |
| KPI-otros | Indicadores del Dashboard, CRM, Agenda, Marketing y Tienda | Indicadores (tarjetas KPI) | M | Bien | — | T3A, T3C, T20, T22, T23A, T23B |
| ANALISIS-api | Base del servidor para los análisis | Pestañas Análisis | M | Bien | — | T1A |
| ANALISIS-base | Pestaña Análisis estándar (piezas compartidas) | Pestañas Análisis | L | Bien | — | T3A, T5B, T5C, T5D |
| ANALISIS-ventas | Análisis de Ventas: Hub, Solicitudes, Cotizaciones y Pedidos | Pestañas Análisis | L | Bien | — | T6C, T7, T8, T9, T10 |
| ANALISIS-compras | Análisis de Compras | Pestañas Análisis | M | Bien | — | T1C, T12, T14, T15, T16B |
| ANALISIS-inventario | Análisis de Inventario con datos reales | Pestañas Análisis | M | Bien | — | T13, T17 |
| ANALISIS-finanzas | Resumen de Finanzas con datos reales | Pestañas Análisis | M | Bien | — | T20, T22 |
| ANALISIS-crm | Análisis del CRM | Pestañas Análisis | M | Bien | — | T20, T21 |
| FLUJO-base | Diagrama de flujo compartido: cajas, flechas y una franja estándar | Diagrama del flujo | M | Bien | — | T3B, T5A |
| FLUJO-ventas-datos | Números reales del flujo de Ventas y una sola regla de atraso | Diagrama del flujo | M | Bien | — | T1C, T2, T3B, T6A |
| FLUJO-ventas-pantallas | La franja del flujo en el Hub de Ventas y en las listas de Solicitudes, Cotizaciones y Pedidos | Diagrama del flujo | L | Bien | — | T7, T8, T9, T10, T22 |
| FLUJO-documentos | La barra del flujo en cada solicitud, cotización y pedido | Diagrama del flujo | M | Bien | — | T3B, T5A, T7, T10, T11 |
| FLUJO-compras | El mismo diagrama en Compras: lista, pedido de compra, tránsito y recepción | Diagrama del flujo | L | Bien | — | T1B, T1C, T2, T3B, T12, T14, T15, T16A, T16B |
| PERMISOS | Permiso para reescribir pantallas grandes | Permisos para este bloque | S | Bien | — | T0, T5D, T7, T8, T10, T14, T15, T17, T22 |

No hubo ítems descartados ni marcados «Cambiar». PERMISOS no tiene diseño técnico: es el permiso de la regla no-full-tsx-rewrite (R17).

## Decisiones del usuario por ítem

### TABLA-base — Tabla estándar: columnas que se estiran, se mueven y se recuerdan

- Marcado por el usuario: **Bien** (sin comentario)
- ¿Dónde recuerda el sistema cómo dejas cada pantalla (anchos y orden de columnas, 25 o 50 filas, Lista o Kanban, columnas plegadas, flujo oculto, período de Análisis)? → **En tu usuario: igual en cualquier computador o celular** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) ¿Dónde se guarda cómo dejas cada tabla (anchos, orden de columnas, columnas visibles y 25 o 50 filas)? → reemplazada por «recordar_pantallas» (en TABLA-base), respondida: «En tu usuario: igual en cualquier computador o celular» (R4).

### TABLA-api — Listas que cuentan todo y traen 25 o 50 a la vez

- Marcado por el usuario: **Bien** (sin comentario)
- Sin preguntas.

### TABLA-hub-ventas — Hub de Ventas: primero lo atrasado y la tabla completa a 1024 px

- Marcado por el usuario: **Bien** (sin comentario)
- Si haces clic en una columna para ordenar (por ejemplo Monto), ¿qué pasa con los atrasados? → **Toda la tabla se ordena por esa columna; un botón «Atención primero» vuelve al orden del semáforo** (= recomendada)
- Una cotización que el cliente ya confirmó pero que todavía no se convierte en pedido, ¿cómo sale en el semáforo del Hub? (La pastilla roja de atrasados de arriba ya la cuenta como pendiente cuando pasan los días de alerta.) → **Como pendiente, y como atrasada si pasan los días de alerta** (= recomendada)
- (Pregunta del diseño quitada por el crítico) Dentro de los atrasados y los pendientes del Hub, ¿cuál va primero? → se aplica la recomendada: «El que lleva más días sin movimiento» (R3).

### TABLA-listas-ventas — Solicitudes, Cotizaciones y Pedidos con la tabla estándar

- Marcado por el usuario: **Bien** (sin comentario)
- Además del Hub de Ventas, ¿las listas que tienen semáforo (Solicitudes, Cotizaciones, Pedidos de venta, Hub de Compras y Pedidos de compra) ponen primero lo atrasado y lo que vence antes? → **Sí; con un clic en una columna ordenas como quieras** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) ¿Las listas de Solicitudes, Cotizaciones y Pedidos también ponen primero lo atrasado, como el Hub? → reemplazada por «atencion_primero_listas» (en TABLA-listas-ventas), respondida: «Sí; con un clic en una columna ordenas como quieras» (R8).

### TABLA-compras — Compras con la tabla estándar y lo vencido primero

- Marcado por el usuario: **Bien** (sin comentario)
- (Pregunta del diseño fusionada por el crítico) ¿El Hub de Compras y la lista de Pedidos de Compra ponen primero lo vencido, como ya lo hace Mercancía en tránsito? → reemplazada por «atencion_primero_listas» (en TABLA-listas-ventas), respondida: «Sí; con un clic en una columna ordenas como quieras» (R8).

### TABLA-inventario — Inventario con existencias reales en la tabla estándar

- Marcado por el usuario: **Bien** (sin comentario)
- El Hub de Inventario, Stock y Abastecimiento hoy muestran cifras inventadas o todo en cero. ¿Qué hacemos en este bloque? → **Conectarlas a las existencias reales de cada bodega y ponerles la tabla estándar** (= recomendada)
- Almacenes, Ubicaciones, Rutas, Compartido, Bodegas, Operaciones y Calendario de Inventario, Visitantes, Scrapper, Integraciones, Historial/Proyecciones/Registro de Compras, Proyecciones de Ventas y Exportar día/rango están vacías, con datos de ejemplo o llaman a funciones que no existen. ¿Qué hacemos? → **Quitarlas del menú hasta conectarlas** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) Almacenes, Ubicaciones, Rutas, Compartido, Bodegas, Operaciones y el Calendario de Inventario son pantallas vacías o con datos de muestra. ¿Qué hacemos con ellas? → reemplazada por «pantallas_sin_datos» (en TABLA-inventario), respondida: «Quitarlas del menú hasta conectarlas» (R14).

### TABLA-otros — CRM, E-Commerce, Marketing y Gastos con la tabla estándar

- Marcado por el usuario: **Bien** (sin comentario)
- Sin preguntas.

### KANBAN-base — Vista Kanban común para las tablas

- Marcado por el usuario: **Bien** (sin comentario)
- En el Kanban, ¿cómo se muestran las columnas de documentos cerrados (Cancelado, Facturado, Rechazada…)? → **Plegadas: se ve el nombre y cuántas hay, y con un clic se abren** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) Al entrar a una pantalla con tabla, ¿qué vista se abre? → reemplazada por «recordar_pantallas» (en TABLA-base), respondida: «En tu usuario: igual en cualquier computador o celular» (R3, R4); cada pantalla abre en la última vista usada; la primera vez en Lista, salvo el CRM (Kanban).

### KANBAN-hub-ventas — Kanban del Hub de Ventas: primero lo urgente

- Marcado por el usuario: **Bien** (sin comentario)
- Sin preguntas.

### KANBAN-ventas-listas — Kanban en Solicitudes, Cotizaciones y Pedidos

- Marcado por el usuario: **Bien** (sin comentario)
- Sin preguntas.

### KANBAN-compras — Kanban de pedidos de compra con reglas

- Marcado por el usuario: **Bien** (sin comentario)
- Al cancelar un pedido de compra (PEC), ¿se pide el motivo? → **Sí, obligatorio (mínimo 5 letras), igual que en ventas; queda en la Actividad** (= recomendada)
- ¿Se puede cancelar un pedido de compra que ya está en tránsito pero todavía no tiene recepción en bodega? → **Sí, mientras no tenga recepciones en bodega (como hoy)** (= recomendada)

### KANBAN-logistica — Kanban de tránsito, recepciones, entregas y bodega

- Marcado por el usuario: **Bien** (sin comentario)
- En Mercancía en tránsito, ¿arrastrar un pedido a la etapa siguiente la marca como completada? → **Sí, solo hacia la etapa siguiente; queda en la Actividad igual que con el botón «Completar»** (= recomendada)
- ¿Quién puede marcar un pedido como Despachado en Entregas? (Hoy el sistema rechaza al rol Bodega, que es quien usa Entregas.) → **También Bodega, eligiendo la bodega de salida** (= recomendada)

### KANBAN-crm — CRM con el tablero común y sin leads perdidos de vista

- Marcado por el usuario: **Bien** (sin comentario)
- Un lead que viene de una solicitud se mueve solo cuando la solicitud avanza. ¿Se puede mover también a mano en el tablero del CRM? → **Sí, libre como hoy; cuando la solicitud cambie, el sistema lo vuelve a mover** (= recomendada)

### KANBAN-resto — Kanban en pedidos web, y dónde no aplica

- Marcado por el usuario: **Bien** (sin comentario)
- Pediste Kanban en todas las tablas. En las que no tienen estados (Kardex, Stock, Abastecimiento, Productos, Ajustes y Gastos), ¿qué muestra? → **Un tablero solo para ver, agrupado por su dato natural (nivel de stock, categoría, tipo de ajuste, entrada/salida)** (= recomendada)

### KPI-base — Una sola tarjeta de indicadores para toda la app

- Marcado por el usuario: **Bien** (sin comentario)
- Cuando un monto es largo (por ejemplo $123.456.789), ¿cómo se ve en la tarjeta? → **Completo; la letra se achica para que quepa** (= recomendada)
- El % de subida o bajada de las tarjetas, ¿contra qué se compara? (En Análisis puedes cambiar el período.) → **Últimos 30 días contra los 30 anteriores** (= recomendada)
- ¿Qué cuenta como «vendido» en las tarjetas, el Dashboard General y Análisis? → **Los pedidos creados en el período, sin cancelados ni devueltos, con su % contra el período anterior** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) El % de subida o bajada que muestran las tarjetas, ¿contra qué período se compara? → reemplazada por «periodo_comparacion» (en KPI-base), respondida: «Últimos 30 días contra los 30 anteriores» (R7).
- (Pregunta del diseño fusionada por el crítico) La tarjeta de dinero de los Hubs de Ventas y Compras y del Dashboard General, ¿qué cifra muestra? → reemplazada por «cifra_ventas» (en KPI-base), respondida: «Los pedidos creados en el período, sin cancelados ni devueltos, con su % contra el período anterior» (R3, R6, R7); en el Hub de Ventas manda hub_tarjetas; en Compras, «Comprado (30 días)» con su % en gris.

### KPI-ventas — Indicadores de Ventas: mismos nombres y cifras completas

- Marcado por el usuario: **Bien** (sin comentario)
- En el Hub de Ventas, el diagrama del flujo ya cuenta los documentos de cada paso. ¿Qué muestran las 4 tarjetas de arriba? → **Dinero y avance: Vendido en el período (con %), Saldo por cobrar, Ticket promedio y % de cotizaciones que terminan en pedido** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) En el Hub de Ventas, al tocar una tarjeta (por ejemplo «Solicitudes activas»), ¿qué pasa? → reemplazada por «clic_en_hub» (en FLUJO-ventas-pantallas), respondida: «La tabla y el Kanban del Hub muestran solo esos documentos, con un chip para quitar el filtro» (R6); además hub_tarjetas (KPI-ventas) cambia las tarjetas del Hub a dinero y avance, que no son pulsables.

### KPI-compras — Indicadores de Compras con un solo criterio

- Marcado por el usuario: **Bien** (sin comentario)
- La tarjeta «Cumplimiento» de Compras, ¿qué mide? («Recibido» = recepción confirmada en bodega, no el fin del seguimiento.) → **Pedidos de compra recibidos sobre los emitidos** (= recomendada)

### KPI-inventario — Indicadores de Inventario con existencias reales

- Marcado por el usuario: **Bien** (sin comentario)
- ¿Cuándo una referencia cuenta como «Bajo el mínimo»? (Vale para la tarjeta, la pestaña Stock crítico, Abastecimiento y Análisis: una sola regla.) → **Cuando lo disponible llega al mínimo de esa referencia (5 si no se ha definido)** (= recomendada)

### KPI-otros — Indicadores del Dashboard, CRM, Agenda, Marketing y Tienda

- Marcado por el usuario: **Bien** (sin comentario)
- (Pregunta del diseño fusionada por el crítico) Las pantallas que hoy muestran números de ejemplo (Visitantes, Scrapper, Integraciones, Finanzas › Resumen y Operaciones de Inventario), ¿también cambian de tarjeta? → reemplazada por «pantallas_sin_datos» (en TABLA-inventario), respondida: «Quitarlas del menú hasta conectarlas» (R14).

### ANALISIS-api — Base del servidor para los análisis

- Marcado por el usuario: **Bien** (sin comentario)
- (Pregunta del diseño fusionada por el crítico) ¿Contra qué se compara el % de subida o bajada de cada indicador? → reemplazada por «periodo_comparacion» (en KPI-base), respondida: «Últimos 30 días contra los 30 anteriores» (R7).

### ANALISIS-base — Pestaña Análisis estándar (piezas compartidas)

- Marcado por el usuario: **Bien** (sin comentario)
- Los asistentes de IA que hoy aparecen en las pestañas Análisis (y el Copilot del Hub de Ventas y de Pedidos de compra) no consultan nada real: responden un texto fijo. ¿Qué hacemos con ellos? → **Dejarlos visibles con el aviso «En construcción»** ⚠ distinta de la recomendada («Quitarlos hasta que llegue la IA real (Bloque 5)»)
- E-commerce, Marketing y el Dashboard general no tienen pestaña Análisis. ¿Se la agregamos con este mismo diseño? → **Todavía no; primero dejar bien las que ya existen** (= recomendada)

### ANALISIS-ventas — Análisis de Ventas: Hub, Solicitudes, Cotizaciones y Pedidos

- Marcado por el usuario: **Bien** (sin comentario)
- ¿Dónde está la pestaña Análisis? → **Una por Hub (Ventas, Compras, Inventario, CRM y Finanzas). En Ventas trae el selector Todo / Solicitudes / Cotizaciones / Pedidos, y las listas llevan un botón 'Ver análisis' que abre el del Hub ya enfocado** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) Las listas de Solicitudes, Cotizaciones y Pedidos también tienen pestaña Análisis. ¿Cómo las dejamos? → reemplazada por «analisis_en_listas» (en ANALISIS-ventas), respondida: «Una por Hub (Ventas, Compras, Inventario, CRM y Finanzas). En Ventas trae el selector Todo / Solicitudes / Cotizaciones / Pedidos, y las listas llevan un botón 'Ver análisis' que abre el del Hub ya enfocado» (R13).
- (Pregunta del diseño fusionada por el crítico) ¿Cuándo cuenta una venta en el Análisis de Ventas? → reemplazada por «cifra_ventas» (en KPI-base), respondida: «Los pedidos creados en el período, sin cancelados ni devueltos, con su % contra el período anterior» (R7).

### ANALISIS-compras — Análisis de Compras

- Marcado por el usuario: **Bien** (sin comentario)
- (Pregunta del diseño fusionada por el crítico) Además del Hub, Compras tiene pestaña Análisis en Pedidos de compra, Lista de compras y Traslados (estas dos solo con una IA simulada). ¿Cómo las dejamos? → reemplazada por «analisis_en_listas» (en ANALISIS-ventas), respondida: «Una por Hub (Ventas, Compras, Inventario, CRM y Finanzas). En Ventas trae el selector Todo / Solicitudes / Cotizaciones / Pedidos, y las listas llevan un botón 'Ver análisis' que abre el del Hub ya enfocado» (R13).

### ANALISIS-inventario — Análisis de Inventario con datos reales

- Marcado por el usuario: **Bien** (sin comentario)
- ¿Con qué precio calculamos el valor del inventario? (Vale para la tarjeta «Valor del inventario», la columna Valorización y Análisis.) → **Con el costo de compra de cada referencia** (= recomendada)

### ANALISIS-finanzas — Resumen de Finanzas con datos reales

- Marcado por el usuario: **Bien** (sin comentario)
- La pantalla de Gastos dice «Monto (USD)», pero el resto del sistema trabaja en pesos. ¿En qué moneda anotan los gastos? → **En pesos colombianos (se corrige la etiqueta)** (= recomendada)

### ANALISIS-crm — Análisis del CRM

- Marcado por el usuario: **Bien** (sin comentario)
- Sin preguntas.

### FLUJO-base — Diagrama de flujo compartido: cajas, flechas y una franja estándar

- Marcado por el usuario: **Bien** (sin comentario)
- ¿Dónde quieres ver el diagrama del flujo en el Hub y en las listas (Solicitudes, Cotizaciones, Pedidos)? → **En la franja de arriba, junto al semáforo de atrasados: una sola franja, igual en todas las pantallas** (= recomendada)
- Pediste el flujo como un 'diagrama de tiempo'. ¿Qué debe mostrar cada caja además del nombre del paso? → **Cuántos documentos hay en ese paso y, en rojo, cuántos van con atraso** (= recomendada)

### FLUJO-ventas-datos — Números reales del flujo de Ventas y una sola regla de atraso

- Marcado por el usuario: **Bien** (sin comentario)
- Sin preguntas.

### FLUJO-ventas-pantallas — La franja del flujo en el Hub de Ventas y en las listas de Solicitudes, Cotizaciones y Pedidos

- Marcado por el usuario: **Bien** (sin comentario)
- En el Hub, al tocar un paso del diagrama, un botón del semáforo o una tarjeta, ¿qué pasa? → **La tabla y el Kanban del Hub muestran solo esos documentos, con un chip para quitar el filtro** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) En el Hub de Ventas, al tocar un paso del diagrama (por ejemplo, Cotización), ¿qué prefieres? → reemplazada por «clic_en_hub» (en FLUJO-ventas-pantallas), respondida: «La tabla y el Kanban del Hub muestran solo esos documentos, con un chip para quitar el filtro» (R6).

### FLUJO-documentos — La barra del flujo en cada solicitud, cotización y pedido

- Marcado por el usuario: **Bien** (sin comentario)
- Sin preguntas.

### FLUJO-compras — El mismo diagrama en Compras: lista, pedido de compra, tránsito y recepción

- Marcado por el usuario: **Bien** (sin comentario)
- En Compras, ¿cuándo se considera atrasado un pedido de compra? → **Cuando ya pasó la fecha de entrega estimada. Se quita el botón 'Ajustar tiempos' de Compras, que hoy no guarda nada** (= recomendada)

### PERMISOS — Permiso para reescribir pantallas grandes

- Marcado por el usuario: **Bien** (sin comentario)
- ¿Autorizas reescribir más del 30% de esas pantallas (ventas/page.tsx, venta-client.tsx, solicitud-client.tsx, compras/page.tsx, compras/pedidos/page.tsx, inventario/page.tsx y finanzas/resumen/page.tsx) cuando haga falta? → **Sí, con pruebas, revisión y capturas del antes y el después** (= recomendada)
- ¿Autorizas actualizar las guías de diseño del proyecto (.agents/rules/analisis-tab-standard.md y design-system-reference.md) con el estándar nuevo? → **Sí, para que lo nuevo quede como regla** (= recomendada)

## Reglas de implementación (rulings)

- **R1 — Las decisiones del usuario ganan sobre el diseño (como R14 del Bloque 1).** Los 32 arreglos de la página del plan (31 del diseño más PERMISOS) quedaron en «Bien», sin comentarios por ítem; comentario general: "nada mas". De las 30 preguntas, 29 se respondieron con la opción recomendada y 1 con otra (ia_en_analisis, R2). En cada ítem se copian la pregunta y la respuesta. Si un diseño asumía otra cosa, gana la respuesta y su regla. RAMAS CONDICIONADAS: los diseños traen ramas «Si el usuario elige…», «Con 'No' en la pregunta…», «SOLO si…» u «Opción 0/1/2»; se implementa SOLO la rama que corresponde a la respuesta real y las demás se descartan. Ojo: a veces la rama condicionada ES la elegida (KANBAN-resto punto 5 «Si el usuario elige la opción 2», ANALISIS-ventas punto 7 «Si el usuario elige 'solo en el Hub'», TABLA-base «Con la opción 'En tu usuario'», TABLA-listas-ventas punto 4 «Si … es 'Sí'», la prueba 4 de KANBAN-compras), y la respuesta ia_en_analisis cambia lo que los diseños de Análisis dan por hecho (R2). La resolución de cada rama está en el recuadro «Ramas condicionadas del diseño» de cada ítem, dentro de cada tarea que lo trae, y es vinculante.
- **R2 — Los asistentes de IA quedan visibles con el aviso «En construcción» (ia_en_analisis = «Dejarlos visibles con el aviso «En construcción»»; distinta de la recomendada «Quitarlos hasta que llegue la IA real (Bloque 5)»).** T5C crea components/analisis/AsistenteEnConstruccion.tsx y PanelAnalisis lo pinta al final de toda pestaña Análisis (prop asistente?: {titulo, ejemplos: string[]}; por defecto visible): tarjeta con el título del asistente, la pastilla ámbar «En construcción», el texto «El asistente con IA llega en el Bloque 5: responderá con los datos reales de esta pantalla.», las preguntas de ejemplo como chips deshabilitados y la caja de texto deshabilitada. No llama a ningún endpoint, no usa setTimeout ni responde nada (ni texto fijo ni simulado). Dónde queda: Hub de Ventas («Copilot de Ventas», el que hoy vive dentro de su Análisis), Hub de Compras (también recoge el Copilot de Pedidos de compra, cuya pestaña Análisis desaparece por R13), Hub de Inventario, CRM y Finanzas › Resumen (reemplaza las alertas fijas del «CFO Virtual»). Se BORRAN las llamadas a POST /ventas/ai-chat (no existe) de ventas/page.tsx (T7) y compras/pedidos/page.tsx (T15) y los chats simulados con setTimeout de solicitud-client.tsx (T8), compras/page.tsx (T14), inventario/page.tsx (T17), lista-compras y traslados (T16). C20: TABLA no toca handleAskAI; lo quita ANALISIS-ventas. La guía analisis-tab-standard.md (T5D) cambia su sección 6 a «Asistente IA: tarjeta «En construcción», sin respuestas simuladas, hasta el Bloque 5». test_graficos_centralizados.mjs (T3A) falla si un archivo de src/app contiene '/ventas/ai-chat' fuera de su lista blanca temporal (ventas/page.tsx hasta T7 y compras/pedidos/page.tsx hasta T15; app_mocks_backup siempre). El aviso «En construcción» de IA vive SOLO en AsistenteEnConstruccion.tsx: ninguna pantalla escribe el suyo (el Bloque 5, su R16, lo cambia en un solo lugar y se detiene si encuentra otro); T24 lo verifica con Grep. Fuera de alcance: el Copilot del Dashboard General (/chat/copilot/query) y GlobalAIChat, que no son pestañas Análisis.
- **R3 — Preguntas que el crítico quitó o fusionó.** orden_dentro_atrasados (TABLA-hub-ventas): se aplica la recomendada «El que lleva más días sin movimiento». kanban_vista_inicial (KANBAN-base): queda dentro de recordar_pantallas: cada pantalla abre en la última vista usada; la primera vez en Lista, salvo el CRM, que abre en Kanban. guardar_vista_tabla (TABLA-base) → recordar_pantallas («En tu usuario: igual en cualquier computador o celular», R4). listas_atencion_primero (TABLA-listas-ventas) y compras_atencion_primero (TABLA-compras) → atencion_primero_listas («Sí; con un clic en una columna ordenas como quieras», R8). clic_kpi_hub (KPI-ventas) y hub_clic_paso (FLUJO-ventas-pantallas) → clic_en_hub («La tabla y el Kanban del Hub muestran solo esos documentos, con un chip para quitar el filtro», R6). periodo_variacion (KPI-base) y comparar_con (ANALISIS-api) → periodo_comparacion («Últimos 30 días contra los 30 anteriores», R7). dinero_hubs (KPI-base) y venta_cuenta (ANALISIS-ventas) → cifra_ventas («Los pedidos creados en el período, sin cancelados ni devueltos, con su % contra el período anterior», R7) y hub_tarjetas (R6); en Compras la tarjeta de dinero del Hub toma la recomendada de dinero_hubs: «Comprado (30 días)» con su % en gris. ventas_listas (ANALISIS-ventas) y compras_subpantallas (ANALISIS-compras) → analisis_en_listas (R13). pantallas_vacias (TABLA-inventario) y pantallas_ejemplo (KPI-otros) → pantallas_sin_datos («Quitarlas del menú hasta conectarlas», R14).
- **R4 — Una sola forma de recordar cada pantalla (C2; recordar_pantallas = «En tu usuario: igual en cualquier computador o celular»).** BACKEND (T1B): migración aditiva fa6_033_preferencias_usuario con la tabla preferencias_usuario (id, user_id FK users ON DELETE CASCADE, clave VARCHAR(120), valor JSON, updated_at; UNIQUE(user_id, clave)), modelo PreferenciaUsuario en backend/app/models/preferencias.py y router backend/app/api/v1/preferencias.py con prefix '/api/v1/preferencias' (cualquier usuario autenticado y solo sus filas): GET '' con prefijo opcional → {status, data: {clave: valor}} (sin prefijo trae todas, máximo 500); PUT '/{clave}' con {valor} → upsert; 422 en español si la clave no cumple ^(tabla|vista|kanban|flujo|analisis):[a-z0-9._-]{1,80}$ o si el valor serializado pasa de 8 KB; 401 sin token. FRONTEND: lib/preferencias.js (T3A) es lo ÚNICO que toca almacenamiento para preferencias: clave interna 'pref:{usuarioId}:{clave}', usuarioId = Number(localStorage 'user_id') inyectado (no importa ventas/flujo.tsx), un solo GET por sesión (precargar('')), escrituras agrupadas (800 ms) con PUT, y si el PUT falla el valor queda local y se reintenta; sin servidor funciona con localStorage, y en memoria si localStorage lanza. T4A crea components/ui/usePreferencia.ts (preferenciasApp() única y usePreferencia(clave, porDefecto) → [valor, guardar, listo]). Ámbitos: tabla:<id> (anchos, orden y columnas ocultas, y el tamaño 25/50, que es UNA sola preferencia por pantalla compartida por la tabla y el tablero), vista:<pantalla> ('lista'|'kanban'), kanban:<pantalla> (columnas plegadas), flujo:<id> (franja compacta) y analisis:<modulo> (período, top y foco). kanban.js, flujo.js y analisis.js NO leen ni escriben almacenamiento (sus leerPreferencia/guardarPreferencia/leerPreferencias del diseño no se crean y esos casos de prueba pasan a test_preferencias.mjs). sessionStorage 'tabla-sesion:{id}' queda solo para el estado de la sesión: pestaña, página, búsqueda, orden, semáforo y paso. Vista inicial: la última usada; la primera vez Lista, salvo el CRM (Kanban). El período de las tarjetas KPI no se guarda (PERIODO_KPI).
- **R5 — Un estado por pantalla y un solo juego de parámetros de lista (C3, C8, C9).** FRONTEND: useEstadoTabla(id, inicial) guarda {vista (la pestaña), modo ('lista'|'kanban'), semaforo, paso, estados[], q, orden, pagina, tamano}; las tarjetas pulsables, las cajas del flujo, los botones del semáforo, las pestañas y los filtros despachan acciones a ese reductor (reducirEstadoTabla de lib/tabla.js); cualquier cambio que no sea de página vuelve a la página 1 y limpia la selección; la tabla y el tablero leen el mismo estado y lo mandan al servidor. BACKEND: un solo módulo backend/app/core/listados.py (no se crea core/filtros_lista.py): 'estados' en CSV (máximo 20) es el parámetro nuevo y 'estado' se conserva por compatibilidad (selectores, Dashboard, Asistente) pasando por la misma filtrar_por_estados; 'orden' = campo o -campo de la lista blanca de cada endpoint, más 'atencion', 'sin_movimiento' y 'reciente' (otro valor → 422 «No se puede ordenar por «x».»); limit conserva el valor por defecto de cada endpoint con Query(…, ge=0, le=200) y limit=0 devuelve solo el total; 'vista' por endpoint; con_conteos se calcula con la búsqueda y los filtros extra pero SIN vista, estados, semáforo, paso ni columna. Desaparecen los parámetros 'kpi' (KPI-ventas, KPI-compras) y 'sin_soporte' (KANBAN-ventas-listas). Vistas nuevas para que toda tarjeta pulsable sea una vista: SC 'esperan_cotizacion' y 'todas_sin_soporte' (tablero de Solicitudes), pedidos 'en_curso'; en PEC 'vencidos' es semaforo=vencidos. El 'resumen' de /ventas/pedidos conserva la definición de H47 del Bloque 1 (sobre TODO el filtro, incluidos los estados): sirve para la suma de cada columna del tablero; CANCELADO y DEVUELTO_TOTAL no suman (ESTADOS_VEN_SIN_DINERO). Sin los parámetros nuevos la respuesta de cada lista es idéntica a la de hoy.
- **R6 — El Hub de Ventas se calcula en el servidor (C4, C6, C7; hub_tarjetas = «Dinero y avance: Vendido en el período (con %), Saldo por cobrar, Ticket promedio y % de cotizaciones que terminan en pedido»; clic_en_hub = «La tabla y el Kanban del Hub muestran solo esos documentos, con un chip para quitar el filtro»; orden_clic_columna = «Toda la tabla se ordena por esa columna; un botón «Atención primero» vuelve al orden del semáforo»).** GET /ventas/hub/documentos (backend/app/api/v1/ventas_hub.py, ALL_ERP_ROLES) acepta vista (todos, no_resueltos, sc, cot, ven, acciones_tomadas), semaforo (atrasados | no_resueltos), paso (SC | COT | PVEN | ENTREGADO | FACTURADO, con cond_paso), estados ('SC:ASIGNADA,VEN:EN_PROCESO'), columna (No Resuelto | En Gestión | Acción Tomada | Cancelado, con expr_columna_hub; la usa el tablero), q, orden (atencion por defecto; tipo, numero, cliente, asesor, creado, estado o monto, con '-'), limit (25, ge=0, le=200), offset y con_conteos. Responde {status, total, data, conteos?}: conteos.pestanas = {todos, no_resueltos, sc, cot, ven, acciones_tomadas} con q, estados y paso pero sin vista, semáforo ni columna; conteos.grupos = {ATRASADO, NO_RESUELTO, ACCION_TOMADA, CERRADO} con todos los filtros (para los separadores). NO trae 'semaforo' ni 'resumen': el semáforo y los conteos por paso salen de GET /ventas/flujo y las tarjetas de GET /ventas/stats. Cada fila trae _sc_dict/_cot_dict/_ven_dict, resolucion, dias_sin_mov, dias_creado, seguimiento_estado y cambios_cliente (C14), y en las SC las listas ligeras cotizaciones y pedidos_venta. Las SC de Soporte Técnico no entran al Hub (R8). Tablero: modo servidor, una consulta por columna con columna=<clave> y el mismo estado (vista, semáforo, paso, q, estados), orden 'atencion' en las abiertas y '-creado' en Cancelado; columnas de T9 del Bloque 1 (No resuelto, En gestión, Acción tomada, Cancelado) con DEVUELTO_TOTAL → Cancelado; dentro de cada columna primero lo atrasado. Tabla: orden del semáforo con separadores «Atrasados · n», «Sin resolver · n», «Acción tomada · n» (sin cerrados) y «Cerrados · n»; la pestaña 'acciones_tomadas' conserva su composición actual (acción tomada + cerrados). Un clic en un título ordena TODA la tabla por esa columna (sin separadores) y aparece el chip «Orden: <columna> ↑/↓ · Atención primero», que vuelve al orden del semáforo; el orden no se guarda. Tarjetas del Hub (4, no pulsables porque no tienen una vista equivalente): Vendido (30 días) con %, Saldo por cobrar (foto, sin %), Ticket promedio (30 días) con % y Cotizaciones que terminan en pedido (30 días) con %; definiciones en R7; si /ventas/stats falla muestran '—' (no se crean resumenVentasLocal ni PREDICADOS_KPI_HUB). Tocar un paso del diagrama o un botón del semáforo pone ese filtro (paso o semaforo) en el estado único: la tabla y el tablero del Hub muestran solo esos documentos, se activa la pestaña del tipo (tabHubDePaso) y aparece un chip («Paso: Cotización ×», «Con atraso ×») que lo quita; tocarlo otra vez también lo quita. /dashboard/ventas?paso=<clave> y ?tab=analisis&foco=<foco> se leen con window.location en un useEffect (sin useSearchParams). contextoFlujo solo existe dentro de cadenaVentas (detalle de un documento).
- **R7 — Dinero, período y formato (cifra_ventas = «Los pedidos creados en el período, sin cancelados ni devueltos, con su % contra el período anterior»; periodo_comparacion = «Últimos 30 días contra los 30 anteriores»; montos_grandes = «Completo; la letra se achica para que quepa»; C12).** Definiciones únicas, iguales en /ventas/stats, en el Dashboard General y en el Análisis de Ventas: Vendido = Σ total_cop de los PVEN creados en el período cuyo estado no está en ESTADOS_VEN_SIN_DINERO (CANCELADO, DEVUELTO_TOTAL); Pedidos = cuántos son; Ticket promedio = Vendido / Pedidos (None si no hay); Cotizaciones que terminan en pedido = % de las COT creadas en el período que tienen al menos un PVEN con estado distinto de CANCELADO (None si no hay COT), con 1 decimal; Saldo por cobrar = Σ max(0, saldo_cop) de los PVEN que no están en ESTADOS_VEN_SIN_DINERO (foto de hoy, sin %; es la definición de pven_saldo_por_cobrar del punto 3 de KPI-ventas: un pedido entregado o facturado que todavía debe sigue por cobrar, así que el «pedidos no cerrados» del foco pven de ANALISIS-ventas queda anulado y el Análisis usa esta misma regla); en la lista de Pedidos la tarjeta lee el resumen de H47 (R12), y T10 comprueba en sus capturas que con la pestaña «Todos» coincide con la del Hub (si no, lo anota para T24); Monto vendido (sin período, listas) = la regla de H47. /ventas/stats agrega el bloque 'flujo' con {actual, anterior} para vendido_cop, pedidos_nuevos, ticket_promedio_cop, cot_conversion_pct, solicitudes_nuevas y cotizaciones_nuevas. Compras: «Comprado (período)» = Σ total_cop de los PEC cuya fecha (COALESCE(fecha_compra, created_at)) cae en el período y que no están en BORRADOR ni CANCELADO, con su % en gris; la misma regla en /compras/stats (bloque flujo) y en /compras/analisis. PERÍODO: un solo resolver_periodo en backend/app/core/periodos.py, sobre core/fechas.py del Bloque 3 (sin un −5 h propio), con la semántica de ANALISIS-api: días calendario de Colombia ('30d' = hoy y los 29 días anteriores contra los 30 días justo antes; 'mes' = del día 1 a hoy contra el mismo tramo del mes pasado, recortado a su fin; '7d', '90d', '12m' y 'personalizado' como ANALISIS-api, con sus seis textos de error). Las tarjetas usan PERIODO_KPI = '30d'; el Dashboard General ofrece Semana ('7d'), 30 días ('30d') y Mes ('mes'); Análisis ofrece todos. core/analisis.py conserva el contrato y los helpers de SQL y cubetas; expr_local usa el desfase de core/fechas.py. FORMATO único en lib/kpis.js (lib/analisis.js lo importa): montos completos con formatoPesos ('$4.927.538'; la letra se achica con tamanoValor; no se implementa formatoCompacto en las tarjetas; pesosCorto solo en los ejes de los gráficos), porcentaje '45,2 %' (coma decimal y espacio antes de %; formatoPct de lib/pesos.js del Bloque 2, '12,5%', NO cambia: sigue en los porcentajes de anticipo de los documentos y en el Resumen Financiero, que lo prueban test_pesos.mjs y formato_pct del backend), variación '+12,5 %', '−8 %', 'Nuevo' o 'Sin cambio' con flecha y color; mejor del servidor ('sube' | 'baja' | 'neutro') ↔ mejorSiSube (true | false | null) con mejorDesde(). El texto de la variación lo calcula variacionPct(actual, anterior) de lib/kpis.js; el servidor manda también variacion_pct con la misma regla (None si anterior es 0 y actual no, que se lee «Nuevo»).
- **R8 — Una sola regla de atraso, de resolución y de pasos en Ventas (C5; cot_confirmada_sin_pedido = «Como pendiente, y como atrasada si pasan los días de alerta»; atencion_primero_listas = «Sí; con un clic en una columna ordenas como quieras»).** BACKEND: un solo módulo backend/app/core/resolucion_ventas.py (no se crean core/flujo_ventas.py ni api/v1/flujo.py). Recibe COPIADAS en T1C y MOVIDAS en T6A, sin cambiar su lógica, las cinco consultas de alertas_resumen tal como las dejen B2 y B3 (ASIGNADA incluida; SC y COT confirmadas por el cliente y sin acción; SC con una COT activa fuera; atrasado = más de días×24 h sin movimiento, frontera estricta como el '<' de hoy). Ahí viven clasificar, expresiones, columna_hub y expr_columna_hub, cond_paso, contar_atrasados, contar_no_resueltos, resumen_flujo_ventas, leer_dias_alerta y los filtros f_* de KPI-ventas; los usan alertas_resumen, /ventas/flujo, /ventas/hub/documentos, /ventas/stats y las tres listas. Las SC de Soporte Técnico (tipo_solicitud 'Soporte Tecnico' o estado 'N/A_SOPORTE') quedan fuera del semáforo comercial, del flujo, de las tarjetas y del Hub, igual que en get_alertas; se ven en Solicitudes › Soporte. La pastilla roja global (AlertasBadge) puede bajar: se le avisa al usuario. Una COT confirmada por el cliente y sin pedido vigente es «Sin resolver» y pasa a atrasada con los días de alerta. FRONTEND: solo lib/hub-ventas.js tiene esNoResuelto, esAtrasado, clasificar y columnaHub (espejo con prueba de paridad Python↔node en T2); lib/flujo-ventas.js es solo presentación (pasos, textos, rutas y cadenaVentas); no se crean ESTADOS_NO_RESOLUCION, contextoFlujo, pasoFlujoVentas, esNoResueltoVentas ni esAtrasadoVentas fuera de hub-ventas.js, ni lib/kpis-ventas.js con predicados. El Hub y las listas reciben por fila 'resolucion' y 'dias_sin_mov' del servidor y no recalculan el atraso. ORDEN 'atencion' en el Hub y en Solicitudes, Cotizaciones y Pedidos de venta: atrasados, sin resolver, acción tomada y cerrados; dentro de atrasados y sin resolver primero el que más días lleva sin movimiento, dentro de acción tomada y cerrados el más reciente; desempate por tipo e id. En el Hub de Compras y Pedidos de compra 'atencion' = vencidos primero (el más atrasado arriba), luego la entrega más cercana y luego created_at desc. Se descarta el «paso 3 opcional» de TABLA-hub-ventas: alertas_resumen ya queda unificada por construcción.
- **R9 — Estados, etapas y reglas de los pedidos de compra (C10, C15c; pec_motivo_cancelacion = «Sí, obligatorio (mínimo 5 letras), igual que en ventas; queda en la Actividad»; pec_cancelar_en_transito = «Sí, mientras no tenga recepciones en bodega (como hoy)»; cumplimiento_compras = «Pedidos de compra recibidos sobre los emitidos»; compras_atraso = «Cuando ya pasó la fecha de entrega estimada. Se quita el botón 'Ajustar tiempos' de Compras, que hoy no guarda nada»).** Un solo par: backend/app/core/estados_compras.py + frontend/src/lib/estados-compras.js (no se crean estados_pec.py, estados-pec.js, grupos_estado.py, grupos-estado.js ni un ETAPA_DE_ESTADO_PEC aparte). Etiquetas en textos_actividad.ETIQUETAS_ESTADO['PEC']: BORRADOR 'Borrador', EMITIDO 'Emitido', ENVIADO 'Enviado al proveedor', EN_TRANSITO 'En tránsito', PENDIENTE_ENTREGA 'Pendiente de entrega', RECIBIDO 'Llegó a bodega', PARCIALMENTE_RECIBIDA 'Recibido en parte', RECIBIDA 'Recibido', COMPLETADO 'Completado', CANCELADO 'Cancelado'; y ['ENINV']: BORRADOR 'Por contar', COMPLETADA 'Recibida', COMPLETADA_LOGISTICA 'Solo registro logístico', CANCELADA 'Cancelada'. Etapas: borrador {BORRADOR}; emitido {EMITIDO, ENVIADO}; en_transito {EN_TRANSITO, PENDIENTE_ENTREGA}; en_bodega {RECIBIDO, PARCIALMENTE_RECIBIDA}; recibido {RECIBIDA, COMPLETADO}; cancelado {CANCELADO}; un estado desconocido cuenta como emitido. Derivados: activos = emitido + en_transito + en_bodega; vigentes = todo menos cancelado; vencido = emitido o en_transito con fecha_entrega_estimada anterior a hoy en Colombia, sin días de tolerancia (un PEC en bodega o recibido nunca es vencido); se quita 'Ajustar tiempos' de Compras. Pestañas de las listas: Todos (vigentes), Activos, En tránsito, Recibidos (etapa recibido) y Cancelados. Tablero (Hub y Pedidos de compra): Borrador · Emitido · En tránsito · En bodega · Recibido (plegada) · Cancelado (plegada). Flujo de Compras: Lista de compras → Pedido de compra (borrador + emitido) → En tránsito → Recepción en bodega (etapa en_bodega, con el aviso «N recepciones por confirmar» de las GoodsReceipt en BORRADOR) → Recibido. Cumplimiento = recibido / (activos + recibido) × 100, con 1 decimal (recibido = recepción confirmada en bodega). update_pec: a mano solo EMITIDO desde BORRADOR y CANCELADO desde borrador, emitido o en tránsito, con motivo de 5 caracteres o más que queda en la Actividad, y nunca con recepciones (409); EN_TRANSITO y los estados de recepción → 422 diciendo dónde se hacen; desde cancelado, en bodega o recibido → 422. Las mismas reglas en los 8 puntos del frontend (2 tableros, 2 paneles de detalle, 2 menús de fila y 2 cancelaciones masivas). En el mismo módulo: grupos de recepción (por_confirmar BORRADOR; confirmadas COMPLETADA y COMPLETADA_LOGISTICA; canceladas CANCELADA), de operación de inventario (en_proceso DRAFT y READY; completadas DONE; canceladas CANCELLED) y de ítem de la lista de compras (PENDIENTE 'Pendiente', EN_PEDIDO 'En pedido', RECIBIDO 'Recibido'; DESCARTADO no se muestra).
- **R10 — Existencias calculadas en un solo lugar (C11; inventario_datos_reales = «Conectarlas a las existencias reales de cada bodega y ponerles la tabla estándar»; minimo_stock = «Cuando lo disponible llega al mínimo de esa referencia (5 si no se ha definido)»; valor_inventario = «Con el costo de compra de cada referencia»).** backend/app/core/existencias.py: físico = InventoryLevel.quantity; reservado = reservas ACTIVE no vencidas; cuarentena = ACTIVO; disponible por bodega = max(0, físico − reservado); tránsito = Σ(cantidad pedida − recibida) de las líneas de PEC en etapa activos (R9), contado UNA vez por SKU; mínimo por referencia = COALESCE(product_web_listings.alerta_stock_minimo, 5); estado de stock: 'agotado' (disponible 0), 'bajo_minimo' (0 < disponible ≤ mínimo) o 'abastecido' (disponible > mínimo); valorización = físico × cost_price ('—' y aviso si no tiene costo). Los totales excluyen las referencias cuya publicación tiene rastrear_inventario = false. La usan /inventory/stock-tabla, /inventory/stats, /inventory/analisis y _calculate_sku_availability (que delega en disponibilidad_sku y conserva sus claves de respuesta). /inventory/stock-tabla NO tiene el parámetro 'umbral' del diseño: el modal «Umbral» del Hub de Inventario, que no guardaba, se quita y la ayuda dice que el mínimo se define en la alerta de stock mínimo de la publicación (E-Commerce). /stock-summary no se reescribe (lo usan el Dashboard y otros); su tránsito mejora a través de _calculate_sku_availability. test_existencias.py amarra existencias con _calculate_sku_availability.
- **R11 — Kanban en todas las tablas (kanban_columnas_cerradas = «Plegadas: se ve el nombre y cuántas hay, y con un clic se abren»; kanban_tablas_sin_estado = «Un tablero solo para ver, agrupado por su dato natural (nivel de stock, categoría, tipo de ajuste, entrada/salida)»; transito_arrastrar_completa = «Sí, solo hacia la etapa siguiente; queda en la Actividad igual que con el botón «Completar»»; crm_lead_con_solicitud = «Sí, libre como hoy; cuando la solicitud cambie, el sistema lo vuelve a mover»; C1, C4, C15, H9).** Un solo ConmutadorVista en components/ui ('Lista' / 'Kanban', íconos lucide List y Kanban), que solo aparece si la pantalla entrega un tablero; su valor es useEstadoTabla.modo y se guarda en vista:<pantalla>. 'Ajustar tabla' (SlidersHorizontal) es el único control de columnas. Un solo MenuFila (components/ui; se abre con clic, en un portal) para filas y tarjetas. Las columnas cerradas salen plegadas (nombre y cuántas; un clic las abre y se recuerda en kanban:<pantalla>). MODO: si la tabla de la pantalla pagina en el servidor, su tablero va en modo servidor con el mismo estado (una consulta por columna con limit = tamaño de la tabla, y limit=0 para las plegadas). Modo cliente solo donde el endpoint devuelve todo: leads del CRM (hasta 500), Lista de compras, Traslados y Tránsito (hasta 200, con el aviso «Se muestran los 200 más recientes» si total > 200). El Hub de Compras y Entregas pasan a modo servidor. TABLAS SIN ESTADOS (tablero solo para ver, sin regla, con soloLectura «Este tablero es para ver: …»): Kardex (Entradas = IN, ADJUST_IN, TRANSFER_IN · Salidas = OUT, ADJUST_OUT, TRANSFER_OUT; get_kardex acepta direction en CSV), Stock y Abastecimiento (Agotado · Bajo el mínimo · Bien abastecido, con estado_stock), Productos (una columna por categoría, máximo 12; si hay más, el aviso «N categorías más: usa la lista»), Ajustes (Entradas · Salidas, con direccion) y Gastos (una columna por categoría tomada de conteos, máximo 12, con el mismo aviso). SIN TABLERO: Hub de Inventario (conserva su vista Lista/Almacenes), Campañas de Marketing (lista maestra; el estado de sus leads lo pone el CRM; H9), Empleados, tablas de detalle dentro de un documento (modo 'simple'), vistas previas de exportación y pantallas simuladas. C15(a): en los tableros del Hub y de Cotizaciones, sacar una COT de «Esperando al cliente» o de «Confirmada» queda bloqueado con «Ábrela para re-cotizar; te pedirá la razón.» (el 409 ANULA_CONFIRMACION del Bloque 2 pide la razón); RECHAZADA → Borrador sí se permite (N7 responde 409 si hay otra activa); reemplaza la acción 'confirmar' de reglaSoltarCotizacion. C15(b): 'enviar' desde un tablero llama a la MISMA acción de envío que deja B3-T10d en ventas/flujo.tsx (canal, WhatsApp automático, correo y ventana del enlace); si esa acción no está exportada, el tablero bloquea con «Ábrela para enviar.» y no arma otro ChannelModal. Tránsito: solo hacia la etapa siguiente del mismo pedido, equivale a «Completar» (PATCH /tracking) y queda en la Actividad. CRM: mover un lead entre etapas es libre también si tiene solicitud (la variante 'No' no se implementa). Ningún tablero usa confirm(), alert() ni prompt(): confirmar y avisar de useAvisos (test_sin_dialogos_nativos.mjs).
- **R12 — Tarjetas de indicadores (KPI-base, C13; montos_grandes = «Completo; la letra se achica para que quepa»).** Una pieza en components/ui/TarjetaKpi.tsx: TarjetaKpi, FranjaKpis y useEstadoKpi, más components/ui/Contador.tsx; vocabulario único estadoKpi ('cargando', 'actualizando', 'error', 'listo'); Contador pinta una barra gris mientras carga y '—' si hubo error, y lo usan pestañas, pastillas, BarraTabla, BannerFlujo y las columnas del tablero (no se crean textoContador del Kanban ni el '…'). StatCard queda como adaptador @deprecated de TarjetaKpi con su firma actual (icon, label, value, hint, color, tone, onClick, variant; 'cargando' se traduce a estado) para que compilen las pantallas que no se migran. CATALOGO_KPI de lib/kpis.js es la única fuente de nombres; se agrega 'cot_conversion' · 'Cotizaciones que terminan en pedido' · porcentaje · TrendingUp · emerald. Una tarjeta solo es botón si equivale a una vista existente (queda con anillo; otro clic lo quita). En las listas, las tarjetas pulsables son vistas (pestañas) con las definiciones del Bloque 1 (H32, COT-LISTA, H47) y sus números salen de con_resumen o con_conteos del servidor (todos los documentos). Los atrasados no van en las tarjetas: los muestra la franja del flujo.
- **R13 — Análisis: una pestaña por Hub (analisis_en_listas = «Una por Hub (Ventas, Compras, Inventario, CRM y Finanzas). En Ventas trae el selector Todo / Solicitudes / Cotizaciones / Pedidos, y las listas llevan un botón 'Ver análisis' que abre el del Hub ya enfocado»; nuevos_hubs = «Todavía no; primero dejar bien las que ya existen»; C21).** Hay pestaña «Análisis» en el Hub de Ventas, el Hub de Compras, el Hub de Inventario, el CRM y Finanzas › Resumen. En Ventas, PanelAnalisis trae el selector «Todo / Solicitudes / Cotizaciones / Pedidos» (prop focos = FOCOS_VENTAS de lib/analisis.js → foco hub | sc | cot | pven; se recuerda en analisis:ventas). Las listas de Solicitudes, Cotizaciones y Pedidos de venta pierden su pestaña Análisis y llevan un botón «Ver análisis» que abre /dashboard/ventas?tab=analisis&foco=sc|cot|pven. Pedidos de compra, Lista de compras y Traslados pierden la suya y llevan «Ver análisis» → /dashboard/compras?tab=analisis. No se agregan análisis a E-commerce, Marketing, Logística ni al Dashboard General. chart.js y react-chartjs-2 solo se importan en components/analisis (test_graficos_centralizados.mjs, T3A; lista blanca: ventas/proyecciones, compras/proyecciones y app_mocks_backup siempre; los dos Análisis muertos ventas/components/AnalisisVentas.tsx y compras/components/AnalisisCompras.tsx hasta T5C, que los borra; y finanzas/resumen hasta T22). GET /ventas/analytics se retira en T6C. Datos de GET /ventas/analisis, /compras/analisis, /inventory/analisis, /crm/analisis y /finance/analisis con el contrato único de core/analisis.py y como máximo 14 consultas por llamada (contador_sql).
- **R14 — Pantallas sin datos fuera del menú (pantallas_sin_datos = «Quitarlas del menú hasta conectarlas»; C18, H17).** T17 quita del menú (components/Sidebar.tsx, inventario/inv-nav.ts, compras/comp-nav.ts, ventas/ven-nav.ts, marketing/mkt-nav.ts y SUB_MODULES de inventario/page.tsx): Almacenes, Ubicaciones, Rutas, Compartido, Bodegas, Operaciones y Calendario de Inventario; Visitantes; Scrapper; Integraciones (con APIs y MCP); Historial, Proyecciones y Registro de Compras; Proyecciones de Ventas; y Exportar día y Exportar rango. Sus archivos NO se borran ni se editan (ni tablero, ni tarjeta nueva, ni marca «Datos de ejemplo»: el punto 7 de KPI-otros y el punto 4 de KANBAN-resto no se hacen) y siguen respondiendo si alguien entra por URL; ResizableHeader.tsx no se borra. Finanzas › Resumen no está en la lista: se conecta a datos reales en T22. Ninguna tarea nueva agrega enlaces hacia esas pantallas.
- **R15 — Entregas y despacho de Bodega (despacho_bodega = «También Bodega, eligiendo la bodega de salida»; C19, H10).** Las pestañas de Entregas son las columnas del tablero (lib/entregas.js): Esperando mercancía · Listo pero falta saldo · Listo para despachar · Despachados, servidas con estados + saldo de /ventas/pedidos; el tablero va en modo servidor; CANCELADO y DEVUELTO_TOTAL no aparecen en ninguna. update_pedido (T6B) acepta el rol BODEGA SOLO para pasar a ENTREGADO desde un estado que lo permita según las transiciones del Bloque 1, con warehouse_id obligatorio (422 «Elige la bodega de salida.»); si BODEGA manda otro estado u otros campos → 403 «Bodega solo puede marcar el pedido como despachado.»; la Actividad registra quién despachó y desde qué bodega. ADMIN y ASESOR siguen igual. En Entregas, el despacho abre el Drawer que ya existe con el selector de bodega y confirma con useAvisos (no window.confirm).
- **R16 — Finanzas (moneda_gastos = «En pesos colombianos (se corrige la etiqueta)»).** Gastos muestra «Monto (COP)» y formatoPesos (sin guardar moneda por gasto). GET /finance/analisis es solo para ADMIN y FINANZAS (un asesor ve «No tienes permiso para ver este análisis.»). finanzas/resumen/page.tsx se rehace con PanelAnalisis (permiso de R17) conservando SubNav y PageHeader; sus cifras de ejemplo en USD y la cascada fija desaparecen.
- **R17 — Permisos de reescritura y guías (PERMISOS: reescribir_pantallas = «Sí, con pruebas, revisión y capturas del antes y el después»; editar_guias = «Sí, para que lo nuevo quede como regla»; C17; regla .agents/rules/no-full-tsx-rewrite.md).** El usuario autorizó reescribir más del 30% de ventas/page.tsx (T7), ventas/solicitud/solicitud-client.tsx (T8), ventas/venta/venta-client.tsx (T10), compras/page.tsx (T14), compras/pedidos/page.tsx (T15), inventario/page.tsx (T17) y finanzas/resumen/page.tsx (T22), y editar .agents/rules/analisis-tab-standard.md y design-system-reference.md (T5D, las dos en un solo commit). Cada una de esas reescrituras va con pruebas (tsc, npm test y las del backend que consume), revisión independiente de la tarea y capturas antes y después (R23). Aun con permiso, se cambia por bloques nombrados (el plan de bloques va en el reporte de la tarea antes de editar) y no se borra comportamiento de los Bloques 1 a 3 que el diseño no pide quitar. Fuera de esa lista (por ejemplo cotizacion-client.tsx, venta/[id]/page.tsx, crm/page.tsx —máxima protección— y las demás pantallas de Compras, Inventario, CRM, Finanzas, Dashboard, Agenda, Marketing y E-Commerce) cada archivo cambia como máximo el 30% de sus líneas. T0 le pide al usuario, una sola vez, un OK adicional para las pantallas de tabla que probablemente pasen del 30% (lista en T0) y sigue sin esperar; si al llegar a la tarea no hay OK y el cambio pasaría del 30%, la tarea se DETIENE antes y, con la indicación del usuario, aplica la alternativa mínima (solo el bloque de la tabla y su barra). .agents/rules/no-full-tsx-rewrite.md no se edita.
- **R18 — Un dueño por archivo, orden y numeración (C16, cruce.orden).** Del cruce al plan: B4-T0 → T1 (servidor: 1A listas, períodos y Análisis; 1B preferencias y runner; 1C reglas de Ventas, Compras y existencias) + T2 (espejos JS y paridad); B4-T1 → T3 (librerías puras: 3A tabla, preferencias, Kanban, indicadores y Análisis; 3B flujo; 3C tableros, entregas, CRM y ficha del cliente) + T4 (componentes: 4A piezas de components/ui; 4B tablero Kanban; 4C estado y datos de la tabla; 4D tabla estándar y token TABLE) + T5 (5A components/flujo; 5B gráficos de Análisis; 5C PanelAnalisis y asistente; 5D guías); B4-T2 → T6 (6A Hub y flujo; 6B listas y despacho de Bodega; 6C indicadores y Análisis); B4-T3 a–e → T7 a T11; B4-T4 → T12 (Compras) + T13 (Inventario y catálogo); B4-T5 a–c → T14, T15 y T16 (16A tránsito y recepciones; 16B lista de compras y traslados); B4-T6 a–c → T17 a T19; B4-T7 → T20 (servidor) + T21, T22 y T23 (pantallas; 23A E-Commerce, 23B Seguimientos, Agenda, Marketing y Asistente); B4-T8 → T24; T0 es la preparación. TAREAS PARTIDAS (para que cada implementador tenga unos 6 archivos de producción o un solo tipo de trabajo, como el Bloque 2): las partes se implementan en orden alfabético (1A → 1B → 1C), cada una con su revisión y su commit; una referencia «Tn» sin letra significa todas sus partes. Dueños: package.json solo T2 y las tres partes de T3 (en serie, un cambio cada una; todas las .mjs nuevas nacen ahí); components/ui/index.ts solo T4A y T4B (en serie) y lib/design-system.ts solo T4D; las dos guías de .agents/rules solo T5D (C17: las dos en un solo commit con el OK ya dado; design-system.ts va en T4D porque TablaEstandar importa su token TABLE, y las dos piezas son de B4-T1 y del mismo permiso); textos_actividad.py solo T1C; tests/rollback_runner.py solo T1B; main.py T1B → T6A; erp_ventas.py T6A → T6B → T6C; ventas_hub.py y core/seguimiento_confirmacion.py solo T6A; tests/usuarios_de_prueba.py solo T6B (otra tarea que necesite un usuario de otro rol crea una fixture local en su módulo de pruebas con el patrón de compras_token); erp_compras.py solo T12; erp_inventario.py, inventory.py, schemas/inventory.py y catalog.py solo T13; crm.py, ecommerce.py y finance.py solo T20. Pantallas: ventas/page.tsx T7; solicitud-client.tsx T8; cotizacion-client.tsx T9; venta-client.tsx y venta/[id]/page.tsx T10; solicitud/[id]/page.tsx, estado-solicitud.tsx y cotizacion/[id]/page.tsx T11; compras/page.tsx T14; compras/pedidos/page.tsx y pedidos/[id]/page.tsx T15; compras/transito, recepciones, recepciones/[id] y compras/columnas-recepcion.tsx T16A; lista-compras, traslados y compras/columnas-traslado.tsx T16B; inventario/page.tsx, Sidebar.tsx y los *-nav.ts T17; inventario/stock, abastecimiento, kardex y productos T18; inventario/recepciones, entregas, traslados y ajustes T19; crm/page.tsx T21; finanzas/resumen, finanzas/gastos y dashboard/page.tsx T22; ecommerce T23A; crm/calendario, agenda, marketing (page y campanas) y asistente_omnicanal T23B. Dentro de cada página, un solo implementador en este orden: carga del servidor → tabla → Kanban → tarjetas → franja del flujo → panel o cadena → Análisis. LIBRERÍAS DESPUÉS DE T3: las tareas de pantalla van UNA A LA VEZ (nunca dos en paralelo) y, si necesitan lógica pura nueva, la agregan a la librería de T2 o T3 que corresponda con su caso en el .mjs que ya existe (en serie; nunca crean .mjs ni tocan package.json). PARALELO permitido (no comparten archivos): T6 con T3 a T5 y con T12 y T13; T12 y T13 entre sí y con T7 a T11; T20 con las tareas de pantalla. Las partes de una tarea partida nunca van en paralelo entre sí. Nunca se agregan al commit hunks sin commitear de otras sesiones (en el Mirror: package.json, test_mercancia_transito.py, solicitud/[id] y venta/[id]).
- **R19 — Dependencias de los Bloques 1, 2 y 3 y su numeración.** El bloque se apila sobre ventas-bloque3-documentos-envio-iva (que trae los Bloques 1 y 2). «Bloque 1: Tn» es la tarea n del plan del Bloque 1. «B2-Tn» y «B3-Tn» son la numeración del CRUCE de esos bloques: en el plan del Bloque 2, B2-T0 → T1 (1A avisos + 1B barrido de diálogos nativos), B2-T1 → T2 (2A + 2B), B2-T2 → T3, B2-T3 → T4, B2-T4 → T5, B2-T5 → T6 (6A librerías de la solicitud + 6B chatter y piezas compartidas), B2-T6 → T7, B2-T7 → T8 (8A + 8B), B2-T8 → T9 (9A COT y PVEN + 9B Hub), B2-T9 → T10, B2-T11 → T11 y B2-T10 → T12 (su R8); en el del Bloque 3, B3-T0 → T1, B3-T1 → T2, B3-T2 → T3 y T4, B3-T3 → T5 y T6, B3-T4 → T7, B3-T5 → T8 y T9, B3-T6 → T10 y T11, B3-T7 → T12 y T13, B3-T8 → T14, B3-T9 → T15, B3-T10d → T16, B3-T10a → T17, B3-T10b → T18, B3-T10c → T19, B3-T12 → T20 y B3-T11 → T21 (su R16). Las piezas que este plan usa de esos bloques van en Files con su origen (por ejemplo «@B1 (T9)»). T0 verifica que existan; si falta alguna, T0 se DETIENE y se reporta: nada de otro bloque se crea aquí. Si un nombre cambió al implementarse, se usa el nombre real y se anota en el reporte. Las líneas que citan los diseños son de b7841a5: se ubica cada cambio por el nombre de la función o del bloque.
- **R20 — Migraciones (R13 del Bloque 1).** Una sola migración en el bloque: fa6_033_preferencias_usuario (T1B), aditiva y encadenada a la cabeza real (se espera fa6_032_nombre_para_mostrar (revision fa6_032) del Bloque 3; verificar con `cd C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-bloque4-tablas-kanban-kpis-analisis\backend; $env:ALEMBIC_ENV='testing'; & C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe -m alembic heads`; si la cabeza es otra, se encadena a la real y se anota). Se aplica a erp_test con `alembic upgrade head` y ALEMBIC_ENV=testing. Nunca downgrade ni DROP. Ningún otro ítem migra: el motivo de cancelación de un PEC vive en la Actividad y los alert_days de las etapas del CRM quedan fuera de alcance.
- **R21 — Las reglas de negocio de los endpoints se validan a mano (R12 del Bloque 3).** El manejador global convierte todo RequestValidationError en un 400 técnico en inglés. Por eso periodo, desde/hasta, top, foco, orden, estados, vista, semaforo, paso, columna, perdidos, saldo, direction y estado_stock se declaran como str o int simples (sin pattern ni min_length para reglas de negocio) y se validan dentro de la función con HTTPException(422, 'mensaje en español'). Los límites numéricos de paginación (ge/le de limit y offset) pueden quedarse en Query.
- **R22 — Pruebas.** Backend solo con el runner de ROLLBACK (cd C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-bloque4-tablas-kanban-kpis-analisis\backend; & C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe tests/rollback_runner.py <modulo>); sin parametrize, autouse, request ni tmp_path (las variantes van en un bucle); erp_test es compartida, así que las pruebas afirman diferencias antes/después, usan sufijo uuid y un db.add por objeto, y las de Análisis usan ventanas viejas (2001-01-01..10). Las pruebas de paridad corren node con subprocess como test_estados_pedido.py del Bloque 1; el runner cuenta pytest.skip como falla, así que node debe estar en el PATH (lo está). contador_sql cuenta consultas (≤ 14 por análisis; GET /compras/flujo con 0 commits). Frontend: node tests/*.mjs con node:assert/strict y npx tsc --noEmit sin errores nuevos frente a la línea base de T0; npm run lint solo sobre los archivos que toca la tarea.
- **R23 — Capturas sin crear datos ni manejar contraseñas.** Toda tarea que cambia una pantalla deja capturas con Playwright antes y después (375, 1024 y 1440 px según la tarea). Las toma el controlador, no el implementador, con el frontend del worktree en un puerto libre (`npx next dev -p 5400` desde C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-bloque4-tablas-kanban-kpis-analisis\frontend), interceptando el API con page.route y respuestas DEMO con las formas de las pruebas del backend; no se crean documentos en erp_test fuera de la transacción revertida y no se usan los puertos 8000, 5000 ni 5100. Al terminar se apaga el servidor. Las capturas van a la página de revisión visual de T24 (Artifact con notas por clic guardadas en su base), donde el usuario las ve y anota.
- **R24 — Credenciales y servicios externos.** Este bloque no usa servicios externos ni credenciales nuevas: no hay llaves, tokens, SMTP ni WhatsApp que configurar. El endpoint de preferencias usa la sesión del usuario. Ninguna credencial va en el código, en las pruebas, en el chat ni en los prompts de los implementadores; los implementadores no crean cuentas ni manejan contraseñas (los usuarios de prueba se crean dentro de la transacción revertida con tests/usuarios_de_prueba.py).
- **R25 — Sin corrección de datos.** Ningún ítem del bloque modifica datos existentes (la tabla preferencias_usuario nace vacía), así que no hay tarea de datos con escritura. T24 corre, solo en erp_test y en modo lectura, las dos consultas informativas de los diseños (PEC en RECIBIDO sin recepción física; leads sin etapa) y se las muestra al usuario; en producción solo si él lo pide y como él decida.
- **R26 — Próxima acción de COT y PVEN y columnas que se ven a 1024 px (huecos H6 y H7).** T2 define en hub-ventas.js, con sus casos en test_hub_ventas.mjs: accionSiguienteCOT(cot) → BORRADOR, VENCIDA o ENVIADA: {texto: 'Completar precios'} si total_cop ≤ 0 o {texto: 'Enviar al cliente'} si no (las dos abren la COT); PENDIENTE_CONFIRMACION: {texto: 'Esperando al cliente', href: null}; CONFIRMADA sin pedido vigente: {texto: 'Crear pedido'} (abre la COT); CONFIRMADA con pedido vigente: {texto: 'Ver pedido'} (abre el PVEN); RECHAZADA: null ('—'). accionSiguientePVEN(p) → PENDIENTE_COMPRA o PENDIENTE_PAGO: {texto: 'Gestionar compra', href: '/dashboard/compras'}; EN_PROCESO o EN_TRANSITO: {texto: 'Ver pedido'}; paso 2 de estados-pedido (listo para entrega): {texto: 'Cobrar saldo'} (abre el pedido) si saldo_cop > 0, o {texto: 'Despachar', href: '/dashboard/inventario/entregas'} si no; ENTREGADO o PARCIALMENTE_ENTREGADO: {texto: 'Facturar'} (abre el pedido); cerrados: null. Solo navegan: ninguna cambia estado. Columnas ocultas por defecto (se pueden mostrar con «Ajustar tabla»): Solicitudes → Tipo, Fecha y Asesor; Cotizaciones y Pedidos de venta → Anticipo y Entrega est.; Hub de Compras y Pedidos de compra → Comprador, F. compra y Límite alerta. Cada tarea de lista mide con Playwright a 1024 px con el menú abierto que las columnas clave quepan sin correr la tabla (document.documentElement.scrollWidth ≤ clientWidth y la tarjeta sin scroll lateral); si no caben, baja primero el ancho por defecto de la columna flexible (Cliente o Proveedor) hasta 120 px y lo anota en su reporte.
- **R27 — Nombres de archivos y pruebas reconciliados (C1, C5, C8, C10, C16).** No se crean: core/filtros_lista.py (→ core/listados.py), core/flujo_ventas.py y api/v1/flujo.py (→ core/resolucion_ventas.py; /ventas/flujo en ventas_hub.py y /compras/flujo en erp_compras.py con core/flujo_compras.py), core/estados_pec.py y core/grupos_estado.py (→ core/estados_compras.py), lib/estados-pec.js y lib/grupos-estado.js (→ lib/estados-compras.js), components/tabla/ConmutadorVista.tsx (→ components/ui/ConmutadorVista.tsx), components/tabla/MenuFila.tsx (→ components/ui/MenuFila.tsx). lib/kpis-ventas.js solo trae resumenFichaCliente. Pruebas: test_filtros_lista.py → casos en test_listados.py; test_estados_pec.py → test_estados_compras.py (tablas puras, T1C) y test_paridad_estados_compras.py (T2); test_listas_kanban_ventas.py → test_listas_ventas_paginadas.py (T6B) y, para E-Commerce, test_listas_varias_paginadas.py (T20); test_estados_pec.mjs y test_grupos_estado.mjs → test_estados_compras.mjs (T2); test_recepciones_kanban → test_listas_compras_paginadas.py (T12); la prueba 6 de TABLA-hub-ventas, la 6 de KPI-ventas y las 7 y 8 de FLUJO-ventas-datos → test_paridad_reglas_ventas.py (T2); las pruebas puras de resolucion_ventas y de las constantes de estados_pedido → test_reglas_ventas.py (T1C); operaciones de inventario y kardex → test_operaciones_inventario.py (T13); despacho de Bodega → test_despacho_bodega.py (T6B); preferencias → test_preferencias_usuario.py (T1B); listas, períodos y contrato de Análisis → test_listados.py, test_periodos.py y test_analisis_base.py (T1A).
- **R28 — Rendimiento del tablero en modo servidor (hueco H18).** T24 mide el Kanban del Hub (4 columnas) y el de Pedidos de venta (6 columnas) con contador_sql (consultas por carga) y con Playwright (tiempo hasta pintar todas las columnas a 1024 px con red normal). Tope: 3 s. Si se pasa, T24 agrega como arreglo un endpoint de conteos agrupados (una consulta para todos los totales) con su prueba.
- **R29 — Los choques del cruce son vinculantes.** Cada choque de «Choques resueltos» trae su resolución y las tareas que la aplican; esa resolución gana sobre el texto de los diseños individuales. Lo mismo para la resolución de cada hueco y de cada prueba que se rompe.

## Choques resueltos (vinculantes)

- C1 · Botón de vista duplicado. TABLA-base crea components/tabla/ConmutadorVista.tsx ('Lista/Tablero', guardado con preferencias.js) y KANBAN-base crea components/ui/ConmutadorVista.tsx ('Lista/Kanban', useVistaGuardada en localStorage 'nebulae.vista.*'). Además hay dos menús '⋯': MenuFila de TABLA y el menú de la tarjeta del Kanban. RESOLUCIÓN VINCULANTE: un solo ConmutadorVista en components/ui, creado en B4-T1, con los textos 'Lista' y 'Kanban' (la palabra del usuario) y el ícono lucide Kanban, que existe en lucide-react 1.31. Solo se pinta si la pantalla entrega un tablero (R8/H17); su valor es useEstadoTabla.modo y se guarda con lib/preferencias.js. Sale del diseño components/tabla/ConmutadorVista.tsx. 'Ajustar tabla' (ícono SlidersHorizontal) es el único control de columnas. El '⋯' de las tarjetas reutiliza MenuFila: uno solo, se abre por clic y va en un portal.
  **Aplica:** T4A (ConmutadorVista y MenuFila únicos en components/ui), T3A (kanban.js sin preferencias propias), T4B (tarjeta del tablero con MenuFila); todas las pantallas con tablero lo usan (R11).
- C2 · Persistencia con cinco mecanismos: preferencias.js 'pref:{usuario}:tabla:*' (TABLA), 'nebulae.vista.*' y 'nebulae.kanban.plegadas.*' (KANBAN), 'nebulae.flujo.<id>.compacto' (FLUJO), 'nebulae:analisis:<modulo>' (ANALISIS) y sessionStorage 'tabla-sesion:*'. RESOLUCIÓN: solo lib/preferencias.js, con los ámbitos tabla:, vista:, kanban:, flujo: y analisis: bajo el mismo usuario. La respuesta de 'recordar_pantallas' vale para todo. sessionStorage queda solo para el estado de la sesión: pestaña, página, búsqueda y orden. El tamaño 25/50 es UNA preferencia por pantalla, compartida por la tabla y el tablero (porColumna). preferencias.js recibe usuarioId inyectado: lo lee de localStorage 'user_id' y no importa ventas/flujo.tsx desde components, porque ese archivo es de B3-T10d.
  **Aplica:** T1B (preferencias_usuario y router), T3A (lib/preferencias.js), T4A (usePreferencia y useVistaGuardada), T4B (columnas plegadas), T4C (useEstadoTabla y usePreferenciasTabla), T5A y T5C (BannerFlujo y PanelAnalisis guardan con usePreferencia) (R4).
- C3 · Estado de filtros repartido. El chip 'Filtro: …' de KPI-ventas/compras, pasoFlujo de FLUJO, quickFilter del semáforo, FiltroEstados de TABLA, las pestañas y el tablero tienen cada uno su propio estado y predicados en el navegador sobre arreglos que TABLA elimina. RESOLUCIÓN: un solo useEstadoTabla por pantalla, {pestaña(vista), modo, semaforo, paso, estados[], q, orden, pagina, tamano}. Tarjetas, cajas del flujo, botones del semáforo, pestañas y filtro despachan acciones a ese reductor. Tabla y tablero leen el mismo estado y lo mandan al servidor como vista/semaforo/paso/estados/q. Cualquier cambio vuelve a la página 1 y limpia la selección. Se ELIMINA el parámetro 'kpi' de KPI-ventas/KPI-compras: cada tarjeta que se puede pulsar equivale a una vista existente, y se agregan las vistas que falten ('en_curso' en pedidos, 'esperan_cotizacion' en SC; 'vencidos' es semaforo=vencidos en PEC).
  **Aplica:** T3A (reducirEstadoTabla y queryListado), T4C (useEstadoTabla), T6B (vistas nuevas, sin el parámetro kpi), T7 a T10 y T14 a T19 (pantallas) (R5).
- C4 · El Hub de Ventas ya no tiene arreglos en memoria. TABLA-hub-ventas quita los tres limit=200 y allData. Pero KANBAN-hub-ventas (modo cliente sobre filteredData e isDocAtrasado), FLUJO-ventas-pantallas (contextoFlujo/pasoFlujoVentas sobre cotizaciones y pedidos) y KPI-ventas (resumenVentasLocal y PREDICADOS_KPI_HUB) dependen de ellos. RESOLUCIÓN: el Hub queda 100% en el servidor:
  - La tabla y el Kanban usan /ventas/hub/documentos. El Kanban pasa a modo servidor, con una consulta por columna y el parámetro nuevo 'columna', que el servidor calcula con columna_hub, espejo exacto del getKanbanCol que deje T9.
  - Las tarjetas usan /ventas/stats, sin respaldo local; si falla, '—'.
  - La franja usa /ventas/flujo, y el filtro por paso es el parámetro 'paso' (cond_paso).
  - contextoFlujo solo existe en cadenaVentas (detalle de documento).
  REGLA GENERAL para todo el bloque: si la tabla de una pantalla pagina en el servidor, su tablero va en modo servidor con el mismo estado. El modo cliente solo se permite donde el endpoint devuelve todo: leads del CRM (≤500), lista de compras, traslados y Tránsito, que agrupa por la etapa de tracking_stages (un JSON); Tránsito pide la vista completa hasta 200 y avisa si total > 200. KANBAN-compras (Hub de Compras en modo cliente) y KANBAN-logistica (Entregas con limit=200) cambian a modo servidor.
  **Aplica:** T6A (/ventas/hub/documentos con columna y paso, /ventas/flujo), T6C (/ventas/stats), T4B (modo servidor de useTableroKanban), T7 (Hub sin arreglos en memoria); regla general de modo en todas las pantallas con tablero: T7 a T10, T14 a T16, T18, T19, T21, T22 y T23A (R6, R11).
- C5 · Regla de 'atrasado / no resuelto' escrita cuatro veces. TABLA crea core/resolucion_ventas.py con '>=' y dias_sin_mov. FLUJO crea core/flujo_ventas.py moviendo alertas_resumen, que usa '<' estricto e incluye ASIGNADA (erp_ventas.py:1758-1813, verificado). KPI-ventas define sus filtros _f_*. El Hub de hoy usa '>=' sin ASIGNADA y con EN_GESTION (page.tsx:26-35 y 292-295, verificado). RESOLUCIÓN:
  - Backend: un solo módulo, core/resolucion_ventas.py. Recibe, MOVIDAS sin cambiar, las consultas de alertas_resumen tal como las dejen B2-T2 y B3-T3: ASIGNADA incluida, SC/COT confirmadas sin acción, SC con COT activa fuera. Frontera estricta: más de días×24 h.
  - Ahí mismo van clasificar, columna_hub, cond_paso y los filtros sc_activa/cot_activa/pven_en_curso/pven_con_dinero.
  - Las SC de Soporte Técnico quedan FUERA del semáforo comercial, igual que en get_alertas (l.1828). Hay que avisar que la pastilla roja global puede bajar.
  - Frontend: solo hub-ventas.js (B1 T9) tiene esNoResuelto/esAtrasado. flujo-ventas.js queda como presentación (pasos, textos, rutas) y no se crea kpis-ventas.js con predicados: se usa listas-ventas.js (B1).
  - Una sola prueba de paridad Python↔JS.
  - Se descarta el 'paso 3 opcional' de TABLA-hub-ventas (cambiar alertas_resumen), porque ya queda unificado por construcción.
  **Aplica:** T1C (core/resolucion_ventas.py), T2 (hub-ventas.js y paridad), T6A (alertas_resumen usa el módulo) (R8).
- C6 · En el Hub, las tarjetas y las cajas del flujo cuentan lo mismo con reglas distintas:
  - sc_activas (KPI) excluye CONFIRMADA y Soporte; el paso SC (FLUJO) incluye la CONFIRMADA sin COT;
  - cot_activas suma las COT con 'pedido caído'; el paso COT excluye las que tienen pedido vigente.
  El usuario vería 'Solicitudes activas 5' junto a 'Solicitud 6 abiertas'. RESOLUCIÓN: en el Hub, los conteos por paso viven solo en el diagrama. Las tarjetas muestran dinero y avance (pregunta 'hub_tarjetas'). En las listas, las tarjetas son las vistas (pestañas) con las definiciones del Bloque 1 (H32, COT-LISTA, H47). La caja 'Estás aquí' usa cond_paso, y su detalle por estado explica la diferencia.
  **Aplica:** T6C (/ventas/stats con el bloque flujo de dinero y conversión), T7 (tarjetas de dinero y avance) (R6, R7).
- C7 · Columnas del Kanban del Hub contra los grupos de la tabla. T9 (Bloque 1) fija No resuelto, En gestión, Acción tomada y Cancelado. TABLA separa la tabla en Atrasados, Pendientes, Acción tomada y Cerrados, con otra composición de 'Acción tomada' (el Kanban incluye ENTREGADO y FACTURADO). Además, la pestaña 'Acciones tomadas' de hoy incluye a los cancelados (page.tsx:37-45). RESOLUCIÓN:
  - Se conservan las columnas de T9 (decisión del Bloque 1), más DEVUELTO_TOTAL → Cancelado.
  - La tabla ordena por el semáforo, con los separadores 'Atrasados', 'Sin resolver', 'Acción tomada' (sin cerrados) y 'Cerrados'.
  - La vista 'acciones_tomadas' conserva su composición actual (acción tomada + cerrados), para que el número de la pestaña no cambie en silencio.
  - Dentro de cada columna del Kanban va primero lo atrasado (U1).
  **Aplica:** T1C (columna_hub), T2 (columnaHub), T6A (parámetro columna y conteos.grupos), T7 (tablero y separadores) (R6).
- C8 · Parámetros de las listas inventados tres veces:
  - TABLA-api (core/listados.py): estados en CSV, orden 'campo/-campo', vista, con_conteos y con_resumen;
  - KANBAN-base (core/filtros_lista.py): 'estado' multivalor, orden 'reciente|sin_movimiento' y limit ge=0;
  - KANBAN-ventas-listas: sin_soporte; KPI: kpi.
  RESOLUCIÓN: un solo módulo, core/listados.py.
  - 'estados' (CSV) es el parámetro nuevo; 'estado' simple se conserva por compatibilidad con selectores, Dashboard y Asistente.
  - 'orden' acepta campo/-campo más 'atencion', 'sin_movimiento' y 'reciente'.
  - limit = Query(…, ge=0, le=200); limit=0 devuelve solo el total.
  - 'vista' agrega 'todas_sin_soporte' para el tablero de SC; desaparecen sin_soporte y kpi.
  - con_conteos se calcula sin vista ni estados.
  **Aplica:** T1A (core/listados.py), T6A y T6B, T12, T13 y T20 (cada lista lo aplica) (R5).
- C9 · Significado de 'resumen' en /ventas/pedidos. TABLA-listas-ventas lo calcula sin vista ni estados. KANBAN-ventas-listas lo usa por columna (con estados) para mostrar el monto de cada columna. El Bloque 1 (H47) lo definió 'sobre TODO el filtro'. RESOLUCIÓN: se queda la definición del Bloque 1, que incluye estados y sirve para la suma por columna. Las tarjetas salen de /ventas/stats y los números de las pestañas de 'conteos'.
  **Aplica:** T6B (resumen de /ventas/pedidos con la definición de H47), T10 (suma por columna) (R5).
- C10 · Estados del pedido de compra (PEC) definidos cinco veces y contradictorios:
  - TABLA: estados_pec.py/estados-pec.js;
  - KANBAN: estados_pec.py/estados-compras.js;
  - KPI: grupos_estado.py/grupos-estado.js;
  - FLUJO: ETAPA_DE_ESTADO_PEC;
  - ANALISIS y KANBAN: dos ETIQUETAS_ESTADO['PEC'] distintas en textos_actividad.
  El código desmiente a la mayoría: RECIBIDO lo pone el fin del seguimiento sin recepción (erp_compras.py:966-976), y RECIBIDA/PARCIALMENTE_RECIBIDA los pone 'confirmar recepción' (l.2632). RESOLUCIÓN: un solo par, core/estados_compras.py + lib/estados-compras.js, creado en B4-T0, con etiquetas en textos_actividad.ETIQUETAS_ESTADO['PEC'] y ['ENINV'].
  Etapas:
  - borrador = {BORRADOR};
  - emitido = {EMITIDO, ENVIADO};
  - en_transito = {EN_TRANSITO, PENDIENTE_ENTREGA};
  - en_bodega = {RECIBIDO 'Llegó a bodega', PARCIALMENTE_RECIBIDA 'Recibido en parte'};
  - recibido = {RECIBIDA 'Recibido', COMPLETADO};
  - cancelado.
  Derivados:
  - activos = emitido + en_transito + en_bodega;
  - vencido = (emitido + en_transito) con fecha_entrega_estimada pasada; hoy _is_overdue ignora el estado (l.288-292).
  La pestaña 'Recibidos' = recibido. Kanban, flujo, tarjetas, Análisis y el tránsito de Inventario usan estas etapas. En el mismo módulo van los estados de recepción, de ítem de lista y de operación, y las transiciones de KANBAN-compras.
  **Aplica:** T1C (core/estados_compras.py y etiquetas PEC/ENINV), T2 (lib/estados-compras.js), T12 (update_pec, listas, stats, flujo y análisis), T13 (tránsito de inventario), T14 a T16 (pantallas) (R9).
- C11 · Existencias calculadas tres veces:
  - TABLA-inventario /stock-tabla: umbral fijo 5 y tránsito de _calculate_sku_availability, que filtra estados que el PEC no usa (CONFIRMADA, ENVIADA…; erp_inventario.py:430-437);
  - KPI-inventario /inventory/stats: mínimo por referencia y tránsito corregido;
  - ANALISIS-inventario: su propio valor.
  RESOLUCIÓN: core/existencias.py única, con físico, reservado, disponible, tránsito (activos de C10, contado una vez por SKU), mínimo (pregunta 'minimo_stock') y valorización (pregunta 'valor_inventario'). La usan stock-tabla, stats, Análisis y _calculate_sku_availability. Una prueba de paridad.
  **Aplica:** T1C (core/existencias.py), T13 (stock-tabla, stats, análisis y _calculate_sku_availability), T17 a T19 (pantallas) (R10).
- C12 · Períodos, variación y zona horaria duplicados:
  - core/periodos.py (KPI-base, sobre core/fechas.py del Bloque 3) contra core/analisis.resolver_periodo (ANALISIS-api, con −5 h fijo y otra regla para 'mes');
  - lib/kpis.js (textoVariacion '12,5%') contra lib/analisis.js (infoVariacion '+12,5 %').
  RESOLUCIÓN: un solo resolver_periodo en core/periodos.py, sobre core/fechas.py de B3-T0 (nada de un −5 h propio); lo usan /stats y /analisis. core/analisis.py conserva solo el contrato. En el frontend, lib/kpis.js es dueño del formato y la variación, y analisis.js lo importa. FilaKpis de Análisis es TarjetaKpi con 'variacion'.
  **Aplica:** T1A (core/periodos.py y core/analisis.py), T3A (lib/kpis.js dueña del formato; lib/analisis.js lo importa), T5B y T5C (ChipVariacion y FilaKpis = TarjetaKpi con variación), T6C, T12, T13 y T20 (stats y análisis) (R7).
- C13 · H6 resuelto cuatro veces: StatCard con prop 'cargando' (TABLA), estado de FranjaKpis más Contador (KPI), '—' de textoConteo (FLUJO) y '…' de textoContador (KANBAN). RESOLUCIÓN: un solo vocabulario, estadoKpi ('cargando', 'actualizando', 'error', 'listo'), y un solo Contador en components/ui (barra gris mientras carga, '—' si hay error). StatCard es un adaptador de TarjetaKpi que traduce 'cargando' a estado. BarraTabla, BannerFlujo y las columnas del Kanban usan Contador.
  **Aplica:** T3A (estadoKpi), T3B (textoConteo), T4A (Contador, TarjetaKpi, StatCard adaptador), T4B y T4D (columnas del tablero y BarraTabla con Contador), T5A (BannerFlujo con Contador), pantallas (R12).
- C14 · Chips 'Sin respuesta al recordatorio' (Bloque 3). KANBAN-hub-ventas y KANBAN-ventas-listas los sacan del navegador con GET /ventas/alertas, que solo atiende a ADMIN/ASESOR/COMPRAS (l.1820) y solo trae documentos con updated_at ≤ corte; además, B3 reinicia updated_at al enviar el recordatorio, así que se pierden chips. TABLA los hidrata por fila. RESOLUCIÓN: seguimiento_estado y cambios_cliente (B3-T3) vienen por fila en /hub/documentos y en las tres listas, con una consulta IN por tipo, usando estado_seguimiento_por_ids sacado a core. Ninguna pantalla consulta /ventas/alertas para pintar chips. Se agrega el chip 'Pidió cambios' (ver huecos).
  **Aplica:** T6A (estado_seguimiento_por_ids; seguimiento_estado y cambios_cliente por fila en /hub/documentos), T6B (lo mismo en las tres listas), T3C (tarjetaHub lee la fila), T7 a T9 (chips) (R6).
- C15 · Transiciones contra los Bloques 1-3.
  (a) Los dos Kanban de ventas no coinciden: KANBAN-hub-ventas bloquea 'COT CONFIRMADA → No resuelto', pero KANBAN-ventas-listas deja pasar PENDIENTE_CONFIRMACION/CONFIRMADA a Borrador o Vencida con un simple 'confirmar'. B2-H40 exige la razón (409 ANULA_CONFIRMACION) y el usuario eligió 'escribir la razón'. RESOLUCIÓN: en los dos tableros, sacar una COT de 'Esperando al cliente' o de 'Confirmada' queda bloqueado con 'Ábrela para re-cotizar; te pedirá la razón'. RECHAZADA → BORRADOR sí se permite (N7 responde 409 si hay otra activa).
  (b) 'Enviar' desde el tablero: los dos Kanban arman su propio ChannelModal + POST /enviar-confirmacion + EnlaceConfirmacionModal. B3 (U16-envio, U22-validez y reenvío) cambia ese flujo: WhatsApp automático, correo, qué pasa si falla, renovación. RESOLUCIÓN: el tablero llama a la MISMA acción de envío que deja B3-T10 en flujo.tsx; si no está exportada, el tablero bloquea con 'Ábrela para enviar'.
  (c) PEC: KANBAN-compras agrega reglas en el servidor (update_pec) y TABLA, KPI y FLUJO no las conocen. Con C10 se aplica a todo; el resultado debe verse en los 8 puntos del frontend que KANBAN-compras listó (verificado con grep: compras/page.tsx:66, 75, 421, 500, 538 y compras/pedidos/page.tsx:550, 1365, 1435, 1498, 1502).
  **Aplica:** T3C (reglas de kanban-ventas.js), T7 a T10 (acciones del tablero; envío con la acción de envío que ya existe), T12 (update_pec), T14 y T15 (los 8 puntos de Compras) (R9, R11).
- C16 · Dueños de archivo. Seis grupos tocan ventas/page.tsx (TABLA, KANBAN, KPI, FLUJO-ventas-pantallas, FLUJO-documentos y ANALISIS). Hay de 3 a 5 grupos en solicitud-client.tsx, cotizacion-client.tsx, venta-client.tsx, compras/page.tsx, compras/pedidos/page.tsx, compras/transito, inventario/page.tsx, inventario/entregas, crm/page.tsx y dashboard/page.tsx. En el backend: erp_ventas.py, erp_compras.py, erp_inventario.py, main.py y textos_actividad.py. Compartidos: package.json, components/ui/index.ts y design-system.ts. RESOLUCIÓN:
  - Una tarea por archivo (ver 'orden'). Dentro de cada página, un solo implementador aplica en este orden: carga del servidor → tabla → Kanban → tarjetas → franja del flujo → panel o cadena → Análisis.
  - package.json solo lo tocan B4-T0 y B4-T1, en serie (todas las .mjs nuevas nacen ahí).
  - components/ui/index.ts y design-system.ts: solo B4-T1. textos_actividad.py: solo B4-T0.
  - main.py: B4-T0 (preferencias) y B4-T2 (ventas_hub), en serie.
  - No se crea api/v1/flujo.py compartido: /ventas/flujo va en ventas_hub.py y /compras/flujo en erp_compras.py.
  - Nunca se agregan al commit los hunks sin commitear de otras sesiones (Mirror: package.json, test_mercancia_transito.py, solicitud/[id] y venta/[id]).
  **Aplica:** Todas las tareas (R18).
- C17 · Regla no-full-tsx-rewrite y reglas de .agents.
  - ANALISIS da por hecho que 'la aprobación del ítem cuenta como autorización' para compras/page.tsx (~33%), inventario/page.tsx (~36%) y finanzas/resumen (100%). La regla exige autorización EXPLÍCITA. Sumando grupos, también pasan del 30%: ventas/page.tsx, venta-client.tsx (~40% según TABLA), solicitud-client.tsx y compras/pedidos/page.tsx.
  - Tres grupos cambian reglas del agente: analisis-tab-standard.md (ANALISIS), design-system-reference.md (KPI-base y FLUJO) y lib/design-system.ts (TABLA el token TABLE, KPI borra KPI_CARD).
  RESOLUCIÓN: se pide una autorización explícita aparte, por archivo, en la página de aprobación; no es una pregunta de negocio. Los cambios a .agents/rules y design-system.ts van en UN solo cambio de B4-T1, con el OK del usuario.
  **Aplica:** T0 (permiso registrado y OK adicional), T4D (design-system.ts), T5D (las dos guías en un solo commit), T7, T8, T10, T14, T15, T17 y T22 (reescrituras con permiso) (R17, R18).
- C18 · Pantallas vacías o de ejemplo con tres destinos distintos:
  - TABLA-inventario las quita del menú y borra ResizableHeader.tsx;
  - KANBAN-resto edita almacenes, ubicaciones, rutas y compartido (quita la cuadrícula);
  - KPI-otros les pone la marca 'Datos de ejemplo', incluidas inventario/operaciones y finanzas/resumen;
  - ANALISIS-finanzas conecta finanzas/resumen a datos reales.
  RESOLUCIÓN:
  - Una sola pregunta, 'pantallas_sin_datos'.
  - finanzas/resumen sale de esa lista (ANALISIS-finanzas la conecta).
  - KANBAN-resto solo edita las pantallas que se queden en el menú.
  - ResizableHeader.tsx NO se borra mientras marketing/visitantes lo importe (verificado: lo importan almacenes, compartido, rutas, ubicaciones y marketing/visitantes).
  **Aplica:** T17 (menú), T22 (finanzas/resumen conectada); las pantallas quitadas no se editan (R14).
- C19 · Entregas con tres diseños:
  - TABLA-inventario: tabla paginada en el servidor con pestañas Pendientes de saldo / Liberados / Despachados y el parámetro saldo;
  - KANBAN-logistica: modo cliente con limit=200 y columnas Esperando mercancía / Listo, falta saldo / Listo para despachar / Despachado;
  - KPI-inventario: tarjetas propias.
  RESOLUCIÓN: las pestañas son las columnas del tablero (Esperando mercancía, Listo pero falta saldo, Listo para despachar, Despachados), definidas en lib/entregas.js y servidas con estados + saldo. El tablero va en modo servidor. Los cancelados y devueltos no aparecen en ninguna. El despacho de bodega depende de la pregunta 'despacho_bodega'.
  **Aplica:** T3C (lib/entregas.js), T6B (estados, saldo y BODEGA en /ventas/pedidos), T19 (Entregas) (R15).
- C20 · Copilot del Hub. TABLA-hub-ventas reescribe handleAskAI para que use 'resumen'. ANALISIS-ventas lo borra, porque llama a POST /ventas/ai-chat, que no existe en el backend (verificado). RESOLUCIÓN: decide 'ia_en_analisis'. TABLA no toca handleAskAI.
  **Aplica:** T5C (AsistenteEnConstruccion), T7 (Copilot del Hub), T14 y T15 (Compras) (R2).
- C21 · Pestaña 'Análisis' en las listas: ANALISIS-ventas recomienda un análisis por lista y ANALISIS-compras uno solo en el Hub. Son recomendaciones opuestas para el mismo caso, y la decisión del usuario habla de 'las pestañas Análisis de TODOS los hubs'. RESOLUCIÓN: una sola pregunta, 'analisis_en_listas', con una sola recomendación para todos los módulos.
  **Aplica:** T5C (PanelAnalisis con focos), T7 (Hub de Ventas), T8 a T10 (botón «Ver análisis»), T14 (Hub de Compras), T15 y T16B (botón «Ver análisis») (R13).

## Huecos y su resolución

- **Hueco H0.** DESMENTIDO (verificado) · El inventario dice que lib/api.ts apiFetch 'devuelve el Response crudo'. Es falso: devuelve el JSON ya parseado y le pasa options.signal a fetch (api.ts:24-70). Los ~15 envoltorios locales que pierden 'total' existen, pero el motivo es otro. useListado y useAnalisis sí pueden cancelar con AbortController. Ojo: el error 403/422 solo trae .status/.detail después de B2-T0 (C3). Sin B2-T0, el '403' de useAnalisis no se distingue.
  **Resolución:** Informativo: useListado (T4C) y useAnalisis (T5C) usan apiFetch con AbortController; al migrar cada pantalla, los envoltorios locales que pierden total se reemplazan por normalizarRespuesta (T3A). T0 verifica que apiFetch ya trae .status y .detail (B2-T0).
- **Hueco H1.** DESMENTIDO (verificado) · TABLA-base dice 'pointer events, el mismo patrón que ResizableHeader'. ResizableHeader usa mousedown/mousemove de document, no funciona en pantallas táctiles y guarda el ancho solo en el estado. El modelo de puntero es el Kanban del CRM, no ResizableHeader.
  **Resolución:** T4B (tarjetas) y T4D (columnas): el arrastre usa pointer events con setPointerCapture, portado del Kanban del CRM (crm/page.tsx), no ResizableHeader; en pantallas táctiles queda la alternativa de flechas de «Ajustar tabla» y el menú «Mover a…».
- **Hueco H2.** DESMENTIDO (verificado) · Los grupos de PEC de TABLA-compras, KPI-compras, FLUJO-compras y ANALISIS-compras cuentan RECIBIDO como 'recibido'. Pero RECIBIDO solo marca el fin del seguimiento (erp_compras.py:966-976) y la recepción física pone RECIBIDA/PARCIALMENTE_RECIBIDA (l.2632). FLUJO pone PARCIALMENTE_RECIBIDA en 'En tránsito', cuando ya está en bodega. KPI-compras pone ENVIADO en tránsito, aunque ningún código lo asigna (solo aparece en una consulta de finance.py:218). Lo corrige C10.
  **Resolución:** Resuelto por C10 y R9 (T1C, T2): RECIBIDO = «Llegó a bodega» (etapa en_bodega); RECIBIDA y PARCIALMENTE_RECIBIDA son de la recepción (recibido y en_bodega); ENVIADO solo existe en datos viejos (etapa emitido).
- **Hueco H3.** DESMENTIDO (verificado) · KANBAN-hub-ventas y KANBAN-ventas-listas arman el chip de seguimiento con GET /ventas/alertas. Ese endpoint excluye a BODEGA y FINANZAS y solo lista documentos con updated_at ≤ corte, así que se pierden chips. KANBAN-base cita 'fCOP de lib/pesos.js', que no existe: el export es formatoPesos (pesos.js:22). KANBAN-crm dice que 'el aviso nunca se ve' porque falta <Toaster/>, pero B2-T0 ya lo monta en AvisosProvider.
  **Resolución:** C14 (T6A y T6B): seguimiento_estado y cambios_cliente llegan por fila; ninguna pantalla usa /ventas/alertas para chips. La tarjeta del tablero usa formatoPesos (no fCOP) (T4B). Los avisos usan useAvisos de B2-T0.
- **Hueco H4.** VERIFICADO (afirmaciones de riesgo que se confirman):
  - list_solicitudes, list_cotizaciones, list_pedidos y list_pec: Query(50, le=200) y devuelven total (erp_ventas.py:314/795/1300; erp_compras.py:601).
  - get_leads: limit=500 sin tope, solo ADMIN/ASESOR (crm.py:1185-1188); /crm/pipeline-stages: ALL_ERP_ROLES (l.1108).
  - /inventory/operations: limit=100 sin máximo.
  - /products ignora limit y búsqueda (catalog.py:193-203).
  - /finance/expenses devuelve todo.
  - GET /compras/stats no existe: lo llaman compras/page.tsx:345, compras/pedidos/page.tsx:1325 y abastecimiento:32, y el 404 se traga.
  - /ventas/stats excluye a BODEGA.
  - inventory_operations no tiene created_at.
  - pipeline_stages no tiene alert_days.
  - update_pec acepta cualquier 'estado', y también 'tracking_stages' (l.855-866).
  - update_pedido: solo ADMIN/ASESOR (l.1467).
  - No hay pruebas de backend sobre /ventas/analytics; su único consumidor es el Hub.
  **Resolución:** Informativo; cada afirmación tiene su tarea: listas con offset y total (T6B, T12, T13, T20), get_leads con tope 1000 (T20), /inventory/operations con le=200 (T13), /products con q y limit (T13), /finance/expenses paginado (T20), GET /compras/stats nuevo (T12), /ventas/stats para todos los roles (T6C), «fecha» calculada en operaciones (T13), update_pec con transiciones (T12), update_pedido con BODEGA para despachar (T6B, R15), /ventas/analytics se retira con su único consumidor (T6C, T7). alert_days de las etapas queda fuera de alcance.
- **Hueco H5.** Hueco · El Bloque 3 espera que el Bloque 4 marque en el Hub y en las tablas los documentos con 'cambios_cliente' (el cliente pidió cambios, B3-T3/U22-cambios). Ningún diseño del Bloque 4 pone el chip 'Pidió cambios' en la columna Resolución, en las tarjetas del Kanban ni en las listas de SC y COT. Solo FLUJO lo cuenta en la franja. Agregarlo en B4-T2 (hidratación) y en B4-T3.
  **Resolución:** T6A y T6B hidratan cambios_cliente por fila (Hub y listas). T7 (columna Resolución y tarjeta del tablero del Hub), T8 y T9 (tabla y tarjeta de Solicitudes y Cotizaciones): chip ámbar «Pidió cambios» (tipo CAMBIOS) o «Ya no la necesita» (tipo NO_LA_NECESITA).
- **Hueco H6.** Hueco · 'Próxima acción' para COT y PVEN en la tabla del Hub. H3 del Bloque 1 solo arregla la SC, y su riesgo anotado sigue abierto: la COT dice 'Aprobar Venta →' para cualquier cotización abierta y 'Al día' para una CONFIRMADA sin pedido. TABLA-hub-ventas pone la columna Acción como clave y fija a 1024 px sin definir qué dice para COT y PVEN. Definir accionSiguienteCOT/PVEN en hub-ventas.js (B4-T0) o mostrar '—'.
  **Resolución:** R26: accionSiguienteCOT y accionSiguientePVEN en hub-ventas.js (T2) con sus casos; T7 los usa en la columna Acción del Hub.
- **Hueco H7.** Hueco · H8 en las listas. Con los anchos por defecto de TABLA-listas-ventas, las columnas suman ~988 px en SC, ~924 en COT y ~932 en PVEN, frente a ~716 px útiles a 1024 con el menú abierto. Las tres listas siguen necesitando scroll lateral. Fijar qué columnas salen ocultas por defecto (Tipo y Fecha en SC; Anticipo y Entrega en COT y PVEN) para que las columnas clave quepan sin correr la tabla, igual que en el Hub. Lo mismo para el Hub de Compras y Pedidos de compra.
  **Resolución:** R26: columnas ocultas por defecto y medición a 1024 px en T7 a T10, T14 y T15.
- **Hueco H8.** Hueco · La decisión del usuario 'columnas ajustables y reordenables en TODAS las tablas' tiene excepciones que no se le han mostrado:
  - productos editables de la SC (B2-T7) y la tabla de CalculadorModal: son formularios;
  - vistas previas de exportar-día y exportar-rango;
  - scrapper y marketing/visitantes: datos simulados;
  - compras/historial: su endpoint no existe.
  Hay que mostrarlas en la página de aprobación como excepciones explícitas.
  **Resolución:** Las excepciones (productos editables de la SC, tabla del CalculadorModal, vistas previas de exportación, Scrapper, Visitantes y compras/historial) van en «Fuera de alcance» y se muestran como lista en la página de revisión visual de T24 para que el usuario las vea y anote.
- **Hueco H9.** Hueco · 'Kanban en TODAS las tablas':
  - KANBAN-resto recomienda no mostrar el botón en tablas sin estados, lo que contradice la decisión literal del usuario (ver la pregunta corregida);
  - marketing/campanas tiene estados (BORRADOR, PLANIFICADA, ACTIVA, PAUSADA, FINALIZADA) y ningún diseño le da tablero; hoy es una lista maestra, no una tabla.
  Decidir y anotarlo.
  **Resolución:** R11: tableros solo para ver en Kardex, Stock, Abastecimiento, Productos, Ajustes y Gastos (respuesta del usuario); sin tablero: Campañas de Marketing (lista maestra), Empleados, tablas de detalle, vistas previas y pantallas simuladas.
- **Hueco H10.** Hueco · Entregas. PATCH /ventas/pedidos solo acepta ADMIN y ASESOR (verificado). El tablero y la tabla de Entregas, cuya acción principal es 'Despachar', fallan con 403 para el rol BODEGA, que es su usuario natural. Ningún ítem lo resuelve (pregunta nueva 'despacho_bodega').
  **Resolución:** despacho_bodega (R15): T6B (update_pedido acepta BODEGA solo para despachar, con bodega) y T19 (Entregas).
- **Hueco H11.** Hueco · U5 'sin límite del bloque': TABLA lo interpreta como scroll interno dentro de la tarjeta (max-height calc(100vh−180px)) más 'Pantalla completa'. El usuario se quejó de que las tablas están 'limitadas por los bordes del bloque'. Hay que validarlo con capturas antes de cerrar el ítem, por ejemplo con la opción de que la tarjeta ocupe todo el ancho del contenido sin márgenes laterales.
  **Resolución:** T7 y T24: capturas a 1024 y 1440 px del Hub con la tabla en su tarjeta (scroll interno y «Pantalla completa») y el tablero a todo el ancho del contenido; si el usuario anota en la página de revisión que la tabla sigue «limitada por los bordes», T24 aplica como arreglo la alternativa (tarjeta a todo el ancho del contenido sin márgenes laterales).
- **Hueco H12.** Hueco · Encabezados. B2 (H9 y H10) dejó al Bloque 4 la estandarización del PageHeader y los botones del Hub (U10/U3), con ContenidoEnlace reutilizable. FLUJO solo cambia los subtítulos e interpreta U10 como la franja oscura (paso-12, y=19%, verificado). Nadie unifica los botones del encabezado en las listas ni en los Hubs de Compras e Inventario. Decidir si entra o se deja anotado.
  **Resolución:** Fuera de alcance (anotado): no se unifican los botones del encabezado de las listas ni de los Hubs; el diagrama solo cambia los subtítulos (T7 a T10, T14, T15). El usuario no lo vio en la página del plan.
- **Hueco H13.** Hueco · Enlaces rotos y estados crudos que ningún diseño cubre:
  - 'Ver todos' de las listas 'Recientes' del Dashboard General (/dashboard/ventas/pedidos, 404); FLUJO solo arregla el del embudo;
  - 'Ver SC →' y 'Ver Pedido →' de la Agenda (404);
  - STATUS_BADGES de asistente_omnicanal, con estados que no existen (EN_BODEGA, DISPONIBLE_ENTREGA): debe usar estados-pedido.js;
  - compras/pedidos/[id]: inputs con defaultValue que no guardan y botones sin onClick.
  Son arreglos cortos; asignarlos a B4-T7/B4-T5 o anotarlos.
  **Resolución:** Dashboard «Ver todos» → T22; Agenda «Ver SC →» y «Ver Pedido →» → T23B (a /dashboard/ventas/solicitud y /dashboard/ventas/venta); STATUS_BADGES de asistente_omnicanal con infoEstadoPedido de estados-pedido.js → T23B; compras/pedidos/[id]: los inputs con defaultValue que no guardan pasan a texto de solo lectura y se quitan los botones sin acción → T15.
- **Hueco H14.** Hueco · Inconsistencias de reglas que quedan fuera:
  - update_tracking no valida el orden de las etapas: el tablero de Tránsito lo respeta, pero el TrackingPanel no;
  - PATCH /compras/lista-compras acepta cualquier estado y 'Marcar recibido' sigue en la tabla, aunque el tablero sea de solo lectura.
  O se cierran en el servidor en B4-T4, o se dejan anotados como pendientes. No se debe dejar una regla solo en el tablero.
  **Resolución:** Fuera del bloque (anotado): el diseño aprobado de KANBAN-logistica decidió no poner la guarda de orden en update_tracking (rompería el TrackingPanel y test_mercancia_transito l.76, que completa una etapa sin la anterior); el tablero de Tránsito es la única vía nueva y respeta el orden. PATCH /compras/lista-compras con cualquier estado y «Marcar recibido» desde PENDIENTE siguen como hoy (el tablero de la lista es solo para ver). Cerrar las dos reglas en el servidor queda como tarea aparte.
- **Hueco H15.** Hueco · catalog.py y TD-03. TABLA-inventario cambia list_products (q, limit, precio, costo y publicado tomados de los SKU), pero catalog.py también es de B3-T2 (IVA) y está bajo el corte de TD-03 Parte 3 (doble escritura; existe test_td03_parte3_doble_escritura_catalogo.py). El cambio debe leer de la fuente que diga la bandera de TD-03 y pasar esa prueba.
  **Resolución:** T13: list_products lee precio, costo y publicado de la fuente que diga la bandera de TD-03 y conserva el filtro de IVA y revisión de B3-T8; regresión con test_td03_parte3_doble_escritura_catalogo, test_td03_parte2_cutover_lectura y test_tarifa_iva_producto.
- **Hueco H16.** Hueco · ecommerce list_catalogo no tiene require_roles: es público (ecommerce.py:1013, verificado). TABLA-otros le agrega offset, total y orden. Aclarar que no se exponen costo ni datos internos, y anotar el hallazgo de seguridad para revisarlo aparte.
  **Resolución:** T20: list_catalogo (pública) solo gana offset, total y orden, sin columnas nuevas; una prueba afirma que las claves de cada fila no cambian. El hallazgo (sin require_roles) se anota para revisión aparte y entra en el checklist de seguridad de T24.
- **Hueco H17.** Hueco · Las pantallas compras/historial, compras/proyecciones, compras/registro y ventas/proyecciones (endpoints inexistentes: /history/*, /api/forecast, /api/compras/*) y exportar-día/rango (carga sin construir) no tienen decisión. TABLA y ANALISIS las dejan 'fuera'. Se incluyen en la pregunta fusionada 'pantallas_sin_datos'.
  **Resolución:** R14 (pantallas_sin_datos): esas pantallas salen del menú en T17.
- **Hueco H18.** Hueco · Tiempos de carga del Kanban en modo servidor. Hub: 4 columnas × (consulta UNION + conteo). Pedidos: 6 columnas. No hay medición prevista. Agregar a B4-T8 una medición con el contador de consultas del runner y un tope (por ejemplo ≤ 3 s a 1024 px con red normal); si se pasa, crear un endpoint de conteos agrupados.
  **Resolución:** R28: medición en T24 con contador_sql y Playwright; si pasa de 3 s, endpoint de conteos agrupados como arreglo.

## Pruebas existentes que se rompen y cómo se ajustan

- **[P0]** backend/tests/test_pendiente_compra_lista_pec.py l.95-97 y l.124-132: hacen PATCH {estado:'CANCELADO', updated_by} sin 'motivo'. Con KANBAN-compras (motivo obligatorio de ≥5 caracteres, si se aprueba 'pec_motivo_cancelacion') dan 422. Se ajusta en B4-T4 mandando 'motivo'. Si 'pec_cancelar_en_transito' = No, también hay que revisar el estado del PEC que crea esa prueba.
  **Cómo se ajusta:** T12: test_pendiente_compra_lista_pec.py (l.95-97 y l.124-132) manda un motivo de más de 5 caracteres en el PATCH CANCELADO. Con pec_cancelar_en_transito = Sí no cambia nada más.
- **[P1]** frontend/tests/test_hub_ventas.mjs (Bloque 1, H3): la aserción esAccionTomada({tipo:'COT', estado:'CONFIRMADA'}) === true se rompe con la opción recomendada de 'cot_confirmada_sin_pedido' (la COT confirmada por el cliente y sin pedido pasa a 'sin resolver'). Los casos de atraso cambian con la frontera estricta (> días) y con Soporte fuera del semáforo. Se ajusta en B4-T0. Si KANBAN-hub-ventas mueve getKanbanCol/columnaHub a kanban-ventas.js, hay que volver a exportarlo desde hub-ventas.js para que no se rompan sus imports.
  **Cómo se ajusta:** T2: test_hub_ventas.mjs pasa a afirmar que una COT CONFIRMADA sin pedido vigente no es acción tomada, la frontera estricta (más de días×24 h) y las SC de Soporte fuera; columnaHub vive en hub-ventas.js (no se mueve a kanban-ventas.js, que lo importa).
- **[P2]** backend/tests/test_alertas_resumen.py (3 pruebas): deben seguir pasando al mover las consultas a core/resolucion_ventas.py. Se romperían si se adoptara la regla del Hub ('>=' y sin ASIGNADA) o el 'paso 3 opcional' de TABLA-hub-ventas (descartado en C5). Es regresión obligatoria en B4-T2.
  **Cómo se ajusta:** T1C (copia) y T6A (movimiento): test_alertas_resumen es regresión obligatoria y sus 3 pruebas siguen pasando sin cambiar la regla. Única diferencia permitida: las SC de Soporte quedan fuera (R8); si alguna de sus pruebas usa una SC de Soporte, se ajusta y se anota.
- **[P3]** backend/tests/test_listas_ventas_totales.py (Bloque 1, H47): se rompe si 'resumen' deja de calcularse sobre todo el filtro, como propone TABLA-listas-ventas. C9 conserva la definición del Bloque 1. Es regresión en B4-T2.
  **Cómo se ajusta:** T6B: test_listas_ventas_totales es regresión; el resumen conserva la definición de H47 (C9). Si alguna aserción contaba DEVUELTO_TOTAL como dinero, se ajusta a la decisión de H47 (el devuelto no suma) y se anota.
- **[P4]** NUEVA frontend/tests/test_graficos_centralizados.mjs (ANALISIS-base): falla desde que se crea, porque finanzas/resumen/page.tsx importa react-chartjs-2 (verificado) hasta que ANALISIS-finanzas la rehaga. Va en la lista blanca en B4-T1 y sale de ella en B4-T7.
  **Cómo se ajusta:** T3A crea test_graficos_centralizados.mjs con finanzas/resumen y los dos Análisis muertos (ventas/components/AnalisisVentas.tsx y compras/components/AnalisisCompras.tsx, que hoy también importan chart.js) en la lista blanca, así que pasa desde el inicio; T5C saca los dos muertos al borrarlos y T22 saca finanzas/resumen al rehacer la pantalla.
- **[P5]** Compilación (npx tsc --noEmit): borrar frontend/src/components/ResizableHeader.tsx, como propone TABLA-inventario, rompe marketing/visitantes/page.tsx, que lo importa. No se borra hasta migrar visitantes. Además, el adaptador de StatCard debe conservar la firma actual (icon, label, value, hint, color, tone, onClick, variant): si no, fallan las 18 páginas que lo usan.
  **Cómo se ajusta:** T4A: el adaptador de StatCard conserva su firma (icon, label, value, hint, color, tone, onClick, variant). ResizableHeader.tsx no se borra (R14).
- **[P6]** frontend/tests/test_sin_dialogos_nativos.mjs (B2, revisa src/app/dashboard/ventas/**): cualquier confirm(), alert() o prompt() que metan el Kanban del Hub o los tableros de las listas en ventas lo hace fallar. Hay que usar confirmar y avisar de useAvisos.
  **Cómo se ajusta:** Todas las tareas de pantallas de Ventas: test_sin_dialogos_nativos.mjs sigue en verde (confirmar y avisar de useAvisos); T24 lo corre al final.
- **[P7]** Regresión con riesgo, para correr con el runner en B4-T4:
  - test_fase3_hardening.py (crea un PEC en estado 'CONFIRMADA', que deja de contar como tránsito con C10/C11);
  - test_fase3_propiedad_nebulae_mau.py y test_fase3_reservas_disponibilidad.py (/disponibilidad y /stock-summary cambian el tránsito);
  - test_inventory_operations_stock.py ('fecha' nueva en la respuesta);
  - test_mercancia_transito.py y test_pec_tracking_update.py.
  En el Mirror, test_mercancia_transito.py tiene cambios sin commitear de otra sesión: no se agregan al commit ni se corrigen aquí.
  **Cómo se ajusta:** T12 y T13: regresión con el runner de test_fase3_hardening (su PEC CONFIRMADA deja de contar como tránsito), test_fase3_propiedad_nebulae_mau, test_fase3_reservas_disponibilidad, test_inventory_operations_stock («fecha» nueva), test_mercancia_transito (versión commiteada) y test_pec_tracking_update. Si una aserción afirmaba el tránsito viejo, se ajusta a R10 y se anota. Los cambios sin commitear de otra sesión en el Mirror no se tocan.
- **[P8]** No se rompe, aunque KANBAN-compras y ANALISIS-compras digan lo contrario: test_textos_actividad.py compara ETIQUETAS_ESTADO['SC'], ['COT'] y ['VEN'] clave por clave (B1, l.27-78) y no el conjunto de claves de arriba. Agregar 'PEC' y 'ENINV' no la rompe. test_estados_pedido.py tampoco: su paridad lee exports concretos, y agregar ESTADOS_PEDIDO_SIN_DINERO o grupo_pedido no la afecta (verificado).
  **Cómo se ajusta:** Informativo: test_textos_actividad.py y test_estados_pedido.py no se rompen al agregar PEC, ENINV, ESTADOS_PEDIDO_SIN_DINERO y grupo_pedido; T2 amplía test_estados_pedido.py con la paridad nueva.

## Para el usuario (fuera del código; sin credenciales)

- No hay nada que configurar, pagar ni entregar para este bloque: no usa servicios externos ni credenciales (R24).
- Responder una sola vez, cuando T0 lo pregunte, si autoriza que las pantallas de tabla fuera de la lista del permiso (lista en T0) cambien más del 30% de sus líneas cuando haga falta (R17). Sin ese OK, cada una se cambia por partes o se detiene a preguntar.
- Saber y anunciar al equipo que varias cifras cambian a propósito: la pastilla roja de atrasados y el Hub dejan fuera las solicitudes de Soporte Técnico; «Solicitudes activas» no cuenta Soporte; las tarjetas del Hub pasan a dinero y avance; el Dashboard General baja al quitar cancelados y existencias inventadas; Inventario muestra existencias reales; Entregas deja de mostrar los facturados como pendientes; los pedidos de compra recibidos cuentan como recibidos.
- Si quiere un mínimo de stock distinto de 5 en alguna referencia, ponerlo en la alerta de stock mínimo de su publicación (E-Commerce); y cargar el costo de compra de las referencias que no lo tienen, para que la valorización del inventario sea completa.
- Mirar la página de revisión visual de T24 (capturas antes y después a 375, 1024 y 1440 px, y la lista de tablas que quedan sin estándar) y anotar lo que no le guste.
- Decidir si se corren en producción las dos consultas informativas de T24 (solo lectura) y cómo.
- Dar permiso para integrar las ramas apiladas a main cuando terminen los bloques.

## Fuera de alcance

- Unificar los botones del encabezado de las listas y de los Hubs de Compras e Inventario (hueco H12).
- Guarda de orden en update_tracking y estados libres en PATCH /compras/lista-compras (hueco H14).
- Columnas alert_days, alert_message e is_closed en pipeline_stages (la alerta por etapa vuelve a 7 al recargar): necesita migración, tarea aparte.
- solicitud/[id]/page.tsx manda {stage_id} a PATCH /crm/leads/{id}/stage y el backend lee pipeline_stage_id (el lead no se mueve solo): tarea aparte recomendada.
- Selectores que precargan 200 o 100 documentos (NuevoPecModal con PVEN, «Recepcionar PEC», listas «Recientes» del Dashboard con 50, Kanban del CRM con 500): siguen con tope; un buscador con servidor es tarea aparte.
- Conectar o borrar las pantallas quitadas del menú (R14) y borrar ResizableHeader.tsx.
- Tablas que quedan sin el estándar: productos editables de la SC (formulario de B2-T7), tabla del CalculadorModal (formulario), vistas previas de Exportar día y rango, Scrapper, Visitantes, compras/historial, Empleados (lista maestro-detalle), agenda, calendarios, omnicanal y carritos (tarjetas).
- La IA real de los análisis (/ventas/ai-chat no existe) y el Copilot del Dashboard General y GlobalAIChat: Bloque 5.
- Pestaña Análisis nueva en E-commerce, Marketing, Logística o el Dashboard General (nuevos_hubs = Todavía no) y las proyecciones (/api/forecast no existe).
- Tablero para Campañas de Marketing y Empleados.
- Consultas N+1 de /finance/dashboard, la escritura en cada GET de /compras/lista-compras/stats y la consulta por referencia de /stock-summary.
- Catálogo público de E-Commerce sin require_roles (hallazgo de H16; entra en el checklist de T24 solo como revisión).
- Mojibake de E-Commerce fuera de las tablas que se tocan.
- «Registrar cobro de saldo» de Entregas (choca con R9 del Bloque 1 y TD-05).
- La logística de erp_logistica (Shipment) y su pipeline paralelo, sin pantalla.
- Recepciones y Traslados de Inventario duplicados con los de Compras: se mantienen las dos pantallas con columnas compartidas.
- Historial Comercial de la Agenda (lee claves equivocadas; el Bloque 2 lo dejó aparte).
- StockReplenishmentRule (sin uso en el código) no se conecta: el mínimo por referencia es la alerta de stock mínimo de la publicación (R10).
- Paginación por cursor e índices nuevos (solo si el volumen lo pide, con una migración aditiva aparte).
- Editar .agents/rules/no-full-tsx-rewrite.md.

## Orden de implementación

| Tarea | Cruce | Título | Ítems | Depende de |
|---|---|---|---|---|
| T0 | — (preparación) | Preparar el worktree del bloque | PERMISOS | Bloque 3 terminado en la rama ventas-bloque3-documentos-envio-iva (su revisión final aprobada; su tarea de datos puede seguir esperando el OK del usuario porque no cambia código). |
| T1A | B4-T0 (servidor, parte 1 de 3) | Parámetros de listas, períodos y contrato de Análisis en el servidor | TABLA-api, KANBAN-base, KPI-base, ANALISIS-api | T0. |
| T1B | B4-T0 (servidor, parte 2 de 3) | Preferencias del usuario en el servidor y tablas del runner | TABLA-base, FLUJO-compras | T0. Va después de T1A (orden del plan; no usa sus módulos). |
| T1C | B4-T0 (servidor, parte 3 de 3) | Reglas de Ventas, estados de Compras y existencias en el servidor | TABLA-hub-ventas, FLUJO-ventas-datos, KPI-ventas, TABLA-listas-ventas, KANBAN-compras, TABLA-compras, KPI-compras, FLUJO-compras, KPI-inventario, TABLA-inventario, ANALISIS-compras | T0. Va después de T1B (orden del plan). |
| T2 | B4-T0 (espejos JS) | Espejos en JS de las reglas y pruebas de paridad | TABLA-hub-ventas, FLUJO-ventas-datos, KPI-ventas, TABLA-listas-ventas, KANBAN-ventas-listas, KANBAN-compras, KANBAN-logistica, KPI-compras, FLUJO-compras, TABLA-compras | T1. |
| T3A | B4-T1 (librerías, parte 1 de 3) | Librerías de tabla, preferencias, Kanban, indicadores y Análisis | TABLA-base, TABLA-api, KANBAN-base, KPI-base, ANALISIS-base, KPI-otros | T2. |
| T3B | B4-T1 (librerías, parte 2 de 3) | Librerías del diagrama del flujo (base, Ventas y Compras) | FLUJO-base, FLUJO-ventas-datos, FLUJO-documentos, FLUJO-compras | T2 y T3A. |
| T3C | B4-T1 (librerías, parte 3 de 3) | Librerías de los tableros de Ventas, tránsito, entregas, CRM y ficha del cliente | KANBAN-hub-ventas, KANBAN-ventas-listas, KANBAN-logistica, KANBAN-crm, KPI-otros, KPI-ventas | T2, T3A y T3B. |
| T4A | B4-T1 (componentes, parte 1 de 4) | Piezas de components/ui: tarjetas de indicadores, contador, conmutador de vista, menú de fila, modal de motivo y preferencias | KPI-base, KANBAN-base, TABLA-base | T3. |
| T4B | B4-T1 (componentes, parte 2 de 4) | Tablero Kanban común | KANBAN-base | T3 y T4A. |
| T4C | B4-T1 (componentes, parte 3 de 4) | Estado y datos de la tabla estándar | TABLA-base, TABLA-api | T3 y T4A. |
| T4D | B4-T1 (componentes, parte 4 de 4) | Tabla estándar y token TABLE | TABLA-base, KPI-base | T3, T4A, T4B y T4C. |
| T5A | B4-T1 (flujo y Análisis, parte 1 de 4) | Franja del flujo y barra de documentos | FLUJO-base, FLUJO-documentos | T3 y T4. |
| T5B | B4-T1 (flujo y Análisis, parte 2 de 4) | Gráficos y piezas de la pestaña Análisis | ANALISIS-base | T3 y T4. |
| T5C | B4-T1 (flujo y Análisis, parte 3 de 4) | Pestaña Análisis estándar con el asistente «En construcción» | ANALISIS-base | T3, T4, T5B. |
| T5D | B4-T1 (flujo y Análisis, parte 4 de 4) | Guías de diseño del proyecto con el estándar nuevo | ANALISIS-base, KPI-base, PERMISOS | T4 y T5A a T5C (la guía describe las piezas que ya existen). |
| T6A | B4-T2 (parte 1 de 3) | Backend del Hub de Ventas y del flujo: /ventas/hub/documentos, /ventas/flujo y alertas_resumen sobre la regla única | TABLA-hub-ventas, FLUJO-ventas-datos, KANBAN-hub-ventas | T1 (y T2 para la paridad). Puede ir en paralelo con T3 a T5, T12 y T13. |
| T6B | B4-T2 (parte 2 de 3) | Backend de las listas de Ventas paginadas en el servidor y despacho de Bodega | TABLA-api, TABLA-listas-ventas, KANBAN-ventas-listas, KANBAN-logistica, TABLA-inventario | T1 y T6A. |
| T6C | B4-T2 (parte 3 de 3) | Backend de indicadores y Análisis de Ventas | KPI-ventas, ANALISIS-ventas | T1 y T6B. |
| T7 | B4-T3a | Hub de Ventas: tabla, Kanban, tarjetas, franja del flujo, panel rápido y Análisis | TABLA-hub-ventas, KANBAN-hub-ventas, KPI-ventas, FLUJO-ventas-pantallas, FLUJO-documentos, ANALISIS-ventas, PERMISOS | T2 a T6. Bloque 1 T9; B2 (Hub y avisos); B3-T10d (hubEnlace, ConfigPanel y TarjetaSeguimiento en ventas/page.tsx). |
| T8 | B4-T3b | Lista de Solicitudes | TABLA-listas-ventas, KANBAN-ventas-listas, KPI-ventas, FLUJO-ventas-pantallas, ANALISIS-ventas, PERMISOS | T2 a T6. Bloque 1 T11; B2-T6; B3-T10b. |
| T9 | B4-T3c | Lista de Cotizaciones | TABLA-listas-ventas, KANBAN-ventas-listas, KPI-ventas, FLUJO-ventas-pantallas, ANALISIS-ventas | T2 a T6. Bloque 1 T8 y T10; B2-T8; B3-T10a. |
| T10 | B4-T3d | Pedidos de venta: lista y detalle | TABLA-listas-ventas, KANBAN-ventas-listas, KPI-ventas, FLUJO-ventas-pantallas, FLUJO-documentos, ANALISIS-ventas, PERMISOS | T2 a T6. Bloque 1 T10; B2-T8 (U24); B3-T10c. |
| T11 | B4-T3e | Detalles de Solicitud y Cotización: cadena de documentos y pasos | FLUJO-documentos | T3 y T5. B2-T7 (estado-solicitud.tsx), B2-T8, B3-T10a y B3-T10b. |
| T12 | B4-T4 (Compras) | Backend de Compras: listas, reglas del pedido de compra, indicadores, flujo y Análisis | TABLA-compras, TABLA-api, KANBAN-compras, KANBAN-logistica, KPI-compras, FLUJO-compras, ANALISIS-compras | T1 y T2. Puede ir en paralelo con T6 a T11. |
| T13 | B4-T4 (Inventario) | Backend de Inventario y catálogo: existencias reales, indicadores, Análisis, operaciones y productos | TABLA-compras, TABLA-inventario, KPI-inventario, ANALISIS-inventario, KANBAN-resto | T1. Puede ir en paralelo con T6 a T12. |
| T14 | B4-T5a | Hub de Compras: tabla, Kanban, tarjetas, franja del flujo y Análisis | TABLA-compras, KANBAN-compras, KPI-compras, FLUJO-compras, ANALISIS-compras, PERMISOS | T2 a T5 y T12. |
| T15 | B4-T5b | Pedidos de compra: lista y detalle | TABLA-compras, KANBAN-compras, KPI-compras, FLUJO-compras, ANALISIS-compras, PERMISOS | T2 a T5 y T12. |
| T16A | B4-T5c (parte 1 de 2) | Tránsito y Recepciones de Compras | TABLA-compras, KANBAN-logistica, KPI-compras, FLUJO-compras | T2 a T5 y T12, T13. |
| T16B | B4-T5c (parte 2 de 2) | Lista de compras y Traslados de Compras | TABLA-compras, KANBAN-logistica, KPI-compras, FLUJO-compras, ANALISIS-compras | T2 a T5, T12, T13 y T16A. |
| T17 | B4-T6a | Hub de Inventario y menú sin pantallas vacías | TABLA-inventario, KPI-inventario, ANALISIS-inventario, KANBAN-resto, PERMISOS | T3 a T5 y T13. |
| T18 | B4-T6b | Stock, Abastecimiento, Kardex y Productos | TABLA-inventario, KPI-inventario, KANBAN-resto | T3 a T5 y T13. B3-T8 (inventario/productos). |
| T19 | B4-T6c | Recepciones, Entregas, Traslados y Ajustes de Inventario | TABLA-inventario, KANBAN-logistica, KPI-inventario, KPI-compras, KANBAN-resto | T3 a T6, T12, T13 y T16. |
| T20 | B4-T7 (servidor) | Backend de CRM, E-Commerce y Finanzas | TABLA-otros, TABLA-api, KANBAN-crm, KANBAN-resto, KPI-otros, ANALISIS-finanzas, ANALISIS-crm | T1 y T6C (core/analisis_ventas.py). Puede ir en paralelo con T7 a T19. |
| T21 | B4-T7 (CRM) | CRM: lista estándar, tablero común y Análisis | TABLA-otros, KANBAN-crm, ANALISIS-crm | T3 a T5 y T20. |
| T22 | B4-T7 (Finanzas y Dashboard) | Resumen de Finanzas, Gastos y Dashboard General | ANALISIS-finanzas, TABLA-otros, KANBAN-resto, KPI-otros, FLUJO-ventas-pantallas, PERMISOS | T3 a T6, T12, T13 y T20. |
| T23A | B4-T7 (resto, parte 1 de 2) | E-Commerce: pedidos web con estados reales, tabla estándar y Kanban, catálogo y tarjetas de la tienda | KPI-otros, TABLA-otros, KANBAN-resto | T3 a T5, T6 y T20. |
| T23B | B4-T7 (resto, parte 2 de 2) | Seguimientos del CRM, Agenda, Marketing, Campañas y Asistente omnicanal | KPI-otros, TABLA-otros | T3 a T5, T6, T20 y T23A. |
| T24 | B4-T8 | Revisión independiente y verificación final | KANBAN-compras, KANBAN-crm | T1 a T23. |

### Orden propuesto por el cruce (B4-Tn) y cómo se reparte en el plan (R18)

- **B4-T0 · Reglas compartidas: backend y sus espejos en JS, con pruebas de paridad**
  - core/listados.py: fusión de TABLA-api y KANBAN-base (C8): estados CSV, vista, orden campo/-campo/atencion/sin_movimiento/reciente, limit ge=0 le=200, con_conteos, paginar y respuesta; con test_listados.py
  - core/periodos.py sobre core/fechas.py de B3 (C12), resolver_periodo único; core/analisis.py solo con el contrato; con test_periodos.py y test_analisis_base.py
  - core/resolucion_ventas.py (C5): mueve las consultas de alertas_resumen sin cambiarlas, más clasificar, columna_hub, cond_paso, filtros sc_activa/cot_activa/pven_en_curso/pven_con_dinero, Soporte fuera y estado_seguimiento_por_ids; estados_pedido.py: ESTADOS_VEN_SIN_DINERO y grupo_pedido
  - core/estados_compras.py (C10): PEC, recepción, ítem de lista y operación; etapas, grupos y transiciones de KANBAN-compras; textos_actividad.ETIQUETAS_ESTADO['PEC'] y ['ENINV']
  - core/existencias.py (C11)
  - Espejos JS puros con sus .mjs: hub-ventas.js (esAtrasado estricto, accionSiguienteCOT/PVEN, columna_hub), listas-ventas.js, estados-pedido.js (ESTADOS_PEDIDO_SIN_DINERO), estados-cotizacion.js, estados-compras.js; una prueba de paridad por módulo (Python↔node)
  - Solo si 'recordar_pantallas' = 'En tu usuario': migración aditiva preferencias_usuario, modelo y router /preferencias, registrado en main.py
  - rollback_runner.py: TABLAS += goods_receipts (+ preferencias_usuario)
  - package.json: un hunk con las .mjs de esta tarea
  - _Depende de:_ Bloque 1 completo (T0 runner, T2 textos_actividad, T9 hub-ventas.js, T7 listas-ventas.js); B2-T1, B2-T2 y B2-T3 (estados-solicitud, alertas_resumen con SC+COT activa, chatter); B3-T0 (core/fechas.py), B3-T3 (cambios_cliente, alertas_resumen) y B3-T6 (seguimiento_estado, última dueña de erp_ventas.py y main.py)
  - _Motivo:_ Todas las pantallas del bloque dependen de una sola definición de atraso, paso, grupo de PEC, existencias, período y parámetros de lista. Si cada grupo crea la suya, como pasa hoy en los diseños, los números del Hub, del flujo, de las tarjetas y del Kanban se contradicen. Es lógica pura con pruebas, sin pantallas. Es la única tarea que toca textos_actividad.py y la primera que toca package.json. Esfuerzo L.
- **B4-T1 · Frontend base: librerías puras y componentes compartidos**
  - lib/tabla.js, lib/preferencias.js (única, C2), lib/kanban.js, lib/kpis.js (dueña del formato y la variación, C12), lib/analisis.js, lib/flujo.js, lib/flujo-ventas.js y lib/flujo-compras.js (solo presentación), lib/kanban-ventas.js, lib/transito.js, lib/entregas.js, lib/crm-etapas.js; todas con sus .mjs
  - components/ui: ConmutadorVista único 'Lista/Kanban' (C1), Contador (C13), TarjetaKpi/FranjaKpis, StatCard como adaptador (conserva icon/label/value/hint/color/tone/onClick/variant para que compilen 18 páginas), TableroKanban/useTableroKanban/TarjetaKanban, ModalMotivo, MenuFila; index.ts
  - components/tabla/* sin ConmutadorVista propio; useEstadoTabla con el estado único de C3; useListado
  - components/flujo/* (PasosFlujo, BannerFlujo, CadenaDocumentos, useResumenFlujo)
  - components/analisis/* + test_graficos_centralizados.mjs, con finanzas/resumen en la lista blanca hasta B4-T7; borrar AnalisisVentas.tsx y AnalisisCompras.tsx (nadie los importa, verificado)
  - design-system.ts (token TABLE; quitar KPI_CARD/KPI_COLOR_MAP) y las 3 reglas .agents en un solo cambio, con el OK del usuario (C17)
  - package.json: segundo y último hunk del bloque
  - _Depende de:_ B4-T0; B2-T0 (Avisos, Modal capa 'encima', apiFetch con .status/.detail); B2-T5 y B3-T7 (librerías y pesos/formatoPct)
  - _Motivo:_ Es la única dueña de components/ui/index.ts, design-system.ts y las reglas .agents. Crea TODAS las .mjs nuevas, así ninguna tarea posterior toca package.json. Sin estas piezas no hay tabla, tablero, tarjeta ni franja comunes. Esfuerzo L.
- **B4-T2 · Backend de Ventas**
  - erp_ventas.py: list_solicitudes, list_cotizaciones y list_pedidos con vista/estados/orden/con_conteos; 'resumen' con la definición del Bloque 1 (C9); hidratación por fila de seguimiento_estado y cambios_cliente (C14)
  - NUEVO ventas_hub.py: /ventas/hub/documentos (vista, semaforo, paso, estados, columna, q, orden, limit/offset, conteos, semáforo) y /ventas/flujo; registro en main.py
  - /ventas/stats: kpis, flujo y periodo; roles ALL_ERP_ROLES; se conservan las claves actuales
  - /ventas/analisis (focos hub/sc/cot/pven) y se borra /ventas/analytics
  - alertas_resumen usa resolucion_ventas (misma cifra; Soporte fuera); _cot_dict con confirmacion_cliente
  - Pruebas con el runner de ROLLBACK: test_hub_ventas_listado, test_listas_ventas_paginadas (incluye Kanban), test_kpis_ventas, test_flujo_ventas, test_analisis_ventas; regresión de test_alertas_resumen y test_listas_ventas_totales (B1)
  - _Depende de:_ B4-T0
  - _Motivo:_ Única dueña de erp_ventas.py y ventas_hub.py en el bloque. Las pantallas de Ventas necesitan el servidor antes de quitar los arreglos de 200. Puede ir en paralelo con B4-T1 y B4-T4. Esfuerzo L.
- **B4-T3 · Pantallas de Ventas: 5 dueños en paralelo, uno por archivo**
  - a) ventas/page.tsx (Hub), en orden: carga del servidor (C4) → TablaEstandar con 'Atención primero' y separadores (C7) → Kanban T9 en modo servidor → tarjetas (hub_tarjetas) → BannerFlujo (semáforo y pasos sobre el estado único, C3) → panel rápido con CadenaDocumentos → Análisis (PanelAnalisisPerezoso foco hub). Página protegida: plan por bloques y autorización explícita
  - b) solicitud-client.tsx: tabla, Papelera como tabla, Kanban SC (C15), franja con 'Estás aquí', tarjetas = vistas, Análisis según 'analisis_en_listas'
  - c) cotizacion-client.tsx: lo mismo, sin tabla en Análisis y sin MoreVertical muerto
  - d) venta-client.tsx + venta/[id]/page.tsx: tabla, Kanban de pedidos (N9/R8), tarjetas, franja, tabla de productos en modo simple, recuadros U24 con TarjetaKpi
  - e) solicitud/[id]/page.tsx + estado-solicitud.tsx + cotizacion/[id]/page.tsx: CadenaDocumentos y steppers con PasosFlujo (FLUJO-documentos)
  - _Depende de:_ B4-T1; B4-T2; Bloque 1 T9, T10 y T11; B2-T6, B2-T7 y B2-T8; B3-T10 (a: cotizacion; b: solicitud y AlertasBadge; c: venta/[id]; d: flujo.tsx y ConfigPanel del Hub)
  - _Motivo:_ Cada archivo tiene un solo implementador, que aplica los cinco grupos en orden (C16). Así ninguna pantalla se reescribe dos veces y los arreglos que necesitan otros no desaparecen a medias. Esfuerzo L.
- **B4-T4 · Backend de Compras e Inventario**
  - erp_compras.py: list_pec (vistas de C10, estados, orden con atencion = vencidos primero, conteos, resumen), GET /compras/stats, update_pec con transiciones y motivo (KANBAN-compras), /compras/flujo, /compras/analisis, list_recepciones (búsqueda, vista, orden, estados), lista-compras con offset/total/orden (sincronizar solo con offset=0)
  - inventory.py + schemas/inventory.py: operaciones con 'fecha' = MIN(movimiento.created_at), dirección, estados, búsqueda y orden, limit le=200
  - erp_inventario.py: /inventory/stock-tabla, /inventory/stats y /inventory/analisis sobre core/existencias; arreglo del tránsito en _calculate_sku_availability
  - catalog.py list_products: q, limit/offset/total opcionales y precio/costo/publicado desde los SKU, respetando TD-03 y B3-T2
  - Pruebas con el runner: test_listas_compras_paginadas, test_compras_stats, test_pec_transiciones, test_estados_compras (paridad), test_stock_tabla, test_inventario_stats, test_analisis_compras, test_analisis_inventario; AJUSTAR test_pendiente_compra_lista_pec.py l.95-97 y 124-132 (motivo); regresión: test_mercancia_transito (versión commiteada), test_pec_tracking_update, test_fecha_entrega_actividad_log_pec, test_fase3_*, test_inventory_operations_stock, test_td03_parte3_doble_escritura_catalogo
  - _Depende de:_ B4-T0; B3-T2 (catalog.py/IVA)
  - _Motivo:_ Única dueña de erp_compras.py, erp_inventario.py, inventory.py y catalog.py en el bloque. Es independiente de Ventas, así que corre en paralelo con B4-T2 y B4-T3. Esfuerzo L.
- **B4-T5 · Pantallas de Compras: 3 dueños en paralelo**
  - a) compras/page.tsx (protegido, @ts-nocheck): tabla en el servidor sin la columna Total duplicada, Kanban de 6 columnas en modo servidor, tarjetas desde /compras/stats, BannerFlujo (decide 'compras_atraso'), Análisis en el Hub; PEC_ESTADOS desde estados-compras.js; cancelaciones con ModalMotivo
  - b) compras/pedidos/page.tsx + pedidos/[id]: tabla, Kanban, tarjetas, franja, los 8 puntos de cambio de estado con las reglas nuevas, TrackingPanel y stepper con pasosDeTracking; pestaña Análisis según 'analisis_en_listas'
  - c) transito, recepciones y recepciones/[id], lista-compras, traslados, columnas-recepcion.tsx y columnas-traslado.tsx compartidas, tableros de solo lectura y franja
  - _Depende de:_ B4-T1; B4-T4
  - _Motivo:_ Un dueño por archivo. Los tres grupos no comparten archivos. Esfuerzo L.
- **B4-T6 · Pantallas de Inventario**
  - a) inventario/page.tsx (Hub): tabla real desde stock-tabla, tarjetas desde stats, Análisis real; menú (Sidebar, INV_NAV, SUB_MODULES) según 'pantallas_sin_datos'
  - b) stock, abastecimiento, kardex (un solo fetch) y productos (después de B3-T8, conserva sus filtros de IVA y revisión)
  - c) recepciones (columnas compartidas con Compras), entregas (C19, decide 'despacho_bodega'), traslados, ajustes; almacenes, ubicaciones, rutas y compartido solo si siguen en el menú; ResizableHeader.tsx no se borra mientras marketing/visitantes lo use
  - _Depende de:_ B4-T1; B4-T4; B4-T2 (estados y saldo en /ventas/pedidos para Entregas); B4-T5c (columnas compartidas); B3-T8 (inventario/productos)
  - _Motivo:_ Las cifras de Inventario hoy son inventadas o salen en cero. Solo tiene sentido estandarizarlas sobre core/existencias. Un dueño por archivo. Esfuerzo L.
- **B4-T7 · CRM, E-Commerce, Marketing, Finanzas, Agenda y Dashboard**
  - Backend: crm.py (orden y limit en leads, perdidos, sc_id, /crm/analisis), ecommerce.py (pedidos con estados y orden, catálogo con offset/total, stats en hora de Colombia), finance.py (gastos paginados, /finance/analisis)
  - crm/page.tsx (protegido): Lista con TablaEstandar, Kanban común con etapas de /pipeline-stages, Análisis
  - crm/calendario, agenda (ficha 360 con las claves reales), marketing (landing, campañas, visitantes según la pregunta), ecommerce (pedidos con estados-pedido.js, Kanban, 'Cuadrícula' en el catálogo), asistente_omnicanal (nombres de KPI y estados)
  - finanzas/resumen reconectado y gastos en COP; quitar finanzas de la lista blanca de test_graficos_centralizados
  - dashboard/page.tsx: tarjetas desde /ventas, /compras e /inventory/stats, embudo con /ventas/flujo, enlaces 'Ver todos' corregidos
  - Pruebas con el runner: test_listas_varias_paginadas, test_crm_kanban, test_analisis_crm, test_analisis_finanzas, test_ecommerce_stats_variacion; regresión de test_crm_lead_movimiento_automatico
  - _Depende de:_ B4-T1; B4-T2 (/ventas/stats, analisis_ventas); B4-T4 (/compras/stats, /inventory/stats)
  - _Motivo:_ Son pantallas y backends que no toca ninguna otra tarea del bloque. El Dashboard y Finanzas reutilizan los agregados de las tareas anteriores. Esfuerzo L.
- **B4-T8 · Revisión independiente y verificación final**
  - Revisión dedicada: reglas nuevas de update_pec, roles ampliados de /ventas/stats, endpoint de preferencias (solo las filas propias), /hub/documentos (SQL UNION con orden permitido) y el catálogo público
  - Regresión con el runner de ROLLBACK de todos los módulos tocados; nunca pytest completo
  - npm test, npx tsc --noEmit y npm run lint, filtrados a los archivos tocados
  - Medición del Kanban en modo servidor (número de consultas y tiempo)
  - Capturas con Playwright a 375, 1024 y 1440 px en la página de revisión visual: Hub con las 7 columnas clave sin scroll a 1024, estirar/mover/recargar, Kanban con columnas bloqueadas, esqueletos sin ceros, franja del flujo, Análisis tipo ref-analisis
  - _Depende de:_ B4-T0 a B4-T7
  - _Motivo:_ Regla del proyecto: no se da por hecho el trabajo de un subagente sin revisión independiente, y el usuario debe VER las pantallas y anotarlas. Esfuerzo M.

### Ajustes de preguntas del crítico (aplicados en la página del plan)

- QUITAR 'orden_dentro_atrasados' (TABLA-hub-ventas): no es una decisión de negocio y la recomendación es obvia. Queda fijo así: dentro de Atrasados y Sin resolver va primero el que lleva más días sin movimiento.
- QUITAR 'kanban_vista_inicial' (KANBAN-base): queda incluida en 'recordar_pantallas'. Cada pantalla abre en la última vista usada; la primera vez abre en Lista, salvo el CRM, que abre en Kanban. La opción 'Siempre el Kanban' no sirve en pantallas sin tablero.
- FUSIONAR 'guardar_vista_tabla' con la persistencia de Kanban, flujo y Análisis → 'recordar_pantallas': «¿Dónde recuerda el sistema cómo dejas cada pantalla (anchos y orden de columnas, 25 o 50 filas, Lista o Kanban, columnas plegadas, flujo oculto, período de Análisis)?». Opciones: «En tu usuario: igual en cualquier computador o celular» (recomendada) / «Solo en este navegador».
- FUSIONAR 'listas_atencion_primero' (TABLA-listas-ventas) y 'compras_atencion_primero' (TABLA-compras) → 'atencion_primero_listas': «Además del Hub de Ventas, ¿las listas que tienen semáforo (Solicitudes, Cotizaciones, Pedidos de venta, Hub de Compras y Pedidos de compra) ponen primero lo atrasado y lo que vence antes?». Opciones: «Sí; con un clic en una columna ordenas como quieras» (recomendada) / «No, primero lo más reciente, como hoy».
- MANTENER 'orden_clic_columna' tal cual (preferencia; recomendada la opción 0).
- CORREGIR el texto de 'cot_confirmada_sin_pedido': aclarar que la pastilla roja de arriba ya cuenta así la cotización confirmada por el cliente sin pedido, pasados los días de alerta. Elegir «Como acción tomada» obligaría a cambiar también esa pastilla. Recomendada: «Como pendiente, y atrasada si pasan los días de alerta».
- NUEVA 'hub_tarjetas' (resuelve el choque C6): «En el Hub de Ventas, el diagrama del flujo ya cuenta los documentos de cada paso. ¿Qué muestran las 4 tarjetas de arriba?». Opciones: «Dinero y avance: Vendido en el período (con %), Saldo por cobrar, Ticket promedio y % de cotizaciones que terminan en pedido» (recomendada) / «Los conteos de hoy (Solicitudes activas, Cotizaciones activas, Pedidos en curso) y Vendido, aunque repitan el diagrama con otras reglas».
- FUSIONAR 'clic_kpi_hub' (KPI-ventas) y 'hub_clic_paso' (FLUJO) → 'clic_en_hub': «En el Hub, al tocar un paso del diagrama, un botón del semáforo o una tarjeta, ¿qué pasa?». Opciones: «La tabla y el Kanban del Hub muestran solo esos documentos, con un chip para quitar el filtro» (recomendada) / «Te lleva a la lista de ese documento».
- FUSIONAR 'periodo_variacion' (KPI-base) y 'comparar_con' (ANALISIS-api) → 'periodo_comparacion': «El % de subida o bajada de las tarjetas, ¿contra qué se compara? (En Análisis puedes cambiar el período)». Opciones: «Últimos 30 días contra los 30 anteriores» (recomendada) / «Mes en curso contra el mismo tramo del mes pasado» / «El mismo período del año pasado».
- FUSIONAR 'dinero_hubs' (KPI-base) y 'venta_cuenta' (ANALISIS-ventas) → 'cifra_ventas': «¿Qué cuenta como 'vendido' en las tarjetas, el Dashboard General y Análisis?». Opciones: «Los pedidos creados en el período, sin cancelados ni devueltos, con su % contra el período anterior» (recomendada) / «Los pedidos entregados al cliente en el período, con %» / «Todo lo vendido desde el inicio, sin %».
- MANTENER 'montos_grandes' (preferencia; recomendada la opción 0).
- FUSIONAR 'ventas_listas' (que recomendaba un análisis por lista) y 'compras_subpantallas' (que recomendaba uno solo en el Hub): las recomendaciones eran opuestas para el mismo caso → 'analisis_en_listas': «¿Dónde está la pestaña Análisis?». Opciones: «Una por Hub (Ventas, Compras, Inventario, CRM y Finanzas). En Ventas trae el selector Todo / Solicitudes / Cotizaciones / Pedidos, y las listas llevan un botón 'Ver análisis' que abre el del Hub ya enfocado» (recomendada; coincide con 'las pestañas Análisis de todos los hubs') / «Cada lista con su propio análisis (más trabajo; en Lista de compras y Traslados hoy solo hay una IA simulada)».
- MANTENER 'ia_en_analisis', aclarando que también aplica al Copilot del Hub de Ventas y de Pedidos de compra, que llaman a /ventas/ai-chat, un endpoint que no existe. Recomendada: «Quitarlos hasta la IA real».
- MANTENER 'nuevos_hubs' (recomendada la opción 0).
- MANTENER 'inventario_datos_reales' (recomendada: conectar a existencias reales). FUSIONAR 'minimo_stock' (KPI-inventario) con el umbral fijo de TABLA-inventario: hoy son dos reglas de 'crítico' → una sola pregunta, 'minimo_stock', con las mismas opciones y la recomendada «el mínimo de cada referencia (5 si no se ha definido)». Vale para la tarjeta, la pestaña 'Stock crítico', Abastecimiento y Análisis.
- MANTENER 'valor_inventario', aclarando que aplica a la tarjeta 'Valor del inventario', a la columna Valorización y a Análisis, no solo a Análisis (recomendada: costo).
- FUSIONAR 'pantallas_vacias' (TABLA-inventario) y 'pantallas_ejemplo' (KPI-otros), y sumar las pantallas sin decisión → 'pantallas_sin_datos': «Almacenes, Ubicaciones, Rutas, Compartido, Bodegas, Operaciones y Calendario de Inventario, Visitantes, Scrapper, Integraciones, Historial/Proyecciones/Registro de Compras, Proyecciones de Ventas y Exportar día/rango están vacías, con datos de ejemplo o llaman a funciones que no existen. ¿Qué hacemos?». Opciones: «Quitarlas del menú hasta conectarlas» (recomendada) / «Dejarlas con la marca 'Datos de ejemplo'» / «Dejarlas como están». Finanzas › Resumen sale de la lista, porque ANALISIS-finanzas la conecta.
- CORREGIR 'kanban_tablas_sin_estado': su recomendación («No aparece») contradice la decisión explícita del usuario («el botón de columnas = Kanban en TODAS las tablas»). Reformular: «Pediste Kanban en todas las tablas. En las que no tienen estados (Kardex, Stock, Abastecimiento, Productos, Ajustes y Gastos), ¿qué muestra?». Opciones: «Un tablero solo para ver, agrupado por su dato natural (nivel de stock, categoría, tipo de ajuste, entrada/salida)» (recomendada, respeta la decisión) / «Sin botón Kanban: solo lista».
- MANTENER sin cambios: 'kanban_columnas_cerradas', 'pec_motivo_cancelacion', 'pec_cancelar_en_transito', 'compras_atraso', 'transito_arrastrar_completa', 'crm_lead_con_solicitud', 'moneda_gastos', 'flujo_posicion' y 'flujo_contenido_caja' (todas de negocio o preferencia, con la recomendación 0).
- CORREGIR el texto de 'cumplimiento_compras': con C10, 'recibido' es la recepción confirmada en bodega (Recibido o Completado), no el fin del seguimiento ('Llegó a bodega'). El texto debe decirlo; la recomendada sigue siendo la opción 0.
- NUEVA 'despacho_bodega': «¿Quién puede marcar un pedido como Despachado en Entregas?». Opciones: «También Bodega, eligiendo la bodega de salida» (recomendada) / «Solo asesor y administrador, como hoy». Hoy PATCH /ventas/pedidos rechaza al rol Bodega, que es quien usa Entregas.
- APARTE, sin presentarlo como pregunta de negocio: la regla no-full-tsx-rewrite exige autorización explícita para reemplazar más del 30% en ventas/page.tsx, venta-client.tsx, solicitud-client.tsx, compras/page.tsx, compras/pedidos/page.tsx, inventario/page.tsx y finanzas/resumen/page.tsx (100%). Además hay que pedir el OK para editar .agents/rules/analisis-tab-standard.md y design-system-reference.md. Se pide por archivo en la página de aprobación; no se deduce de marcar «Bien» en un ítem.

## Diseño por ítem

### TABLA-base — Tabla estándar: columnas que se estiran, se mueven y se recuerdan

**Grupo:** Tablas · **Esfuerzo:** L · **Tareas del plan:** T1B, T3A, T4A, T4C, T4D

**Para el usuario:** Una sola tabla para todo el sistema: columnas que se estiran, se angostan y se cambian de lugar arrastrando; elegir qué columnas ver; 25 o 50 filas por página; ordenar con un clic en el título; filas grises mientras carga en lugar de ceros; menú «⋯» que se abre con clic; pantalla completa; y tu forma de ver cada tabla queda guardada.

**Lo que vio y aprobó el usuario:** Todas las tablas del sistema se usan igual. Para hacer una columna más ancha o más angosta, arrastras su borde derecho; con doble clic en el borde se ajusta sola al texto. Para cambiarla de lugar, mantienes presionado su título y la arrastras: una línea azul muestra dónde va a quedar. Con el botón «Ajustar tabla» eliges qué columnas ver y puedes volver a como venía. Con «Pantalla completa» la tabla ocupa toda la pantalla. Cada tabla muestra 25 filas (o 50 si lo eliges), con botones para pasar de página, y dice por ejemplo «Mostrando 26–50 de 134». Un clic en el título de una columna ordena por ella. Si la tabla no cabe, la corres de lado y el número del documento y sus acciones se quedan quietos a los lados. Mientras carga ves renglones grises que se mueven, nunca ceros. Si cambias de pestaña, buscas o filtras, vuelves a la página 1; al regresar de un documento, vuelves a la página donde estabas. El sistema recuerda cómo dejaste cada tabla.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- ¿Dónde recuerda el sistema cómo dejas cada pantalla (anchos y orden de columnas, 25 o 50 filas, Lista o Kanban, columnas plegadas, flujo oculto, período de Análisis)? → **En tu usuario: igual en cualquier computador o celular** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) ¿Dónde se guarda cómo dejas cada tabla (anchos, orden de columnas, columnas visibles y 25 o 50 filas)? → reemplazada por «recordar_pantallas» (en TABLA-base), respondida: «En tu usuario: igual en cualquier computador o celular» (R4).

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** Punto 2 «Con la opción 'En tu usuario'» y BACKEND «solo con la opción 'En tu usuario'» (puntos 7 y 8) → SÍ: recordar_pantallas = «En tu usuario: igual en cualquier computador o celular» (R4). «Con la otra opción solo usa localStorage» → NO. Su punto 4 (StatCard con la prop cargando) lo reemplaza C13: StatCard es adaptador de TarjetaKpi (R12). Su ConmutadorVista «Lista/Tablero» del punto 3 → NO: es el de components/ui, «Lista/Kanban» (C1).

**Cambios (diseño):**

```text
FRONTEND (nuevo y compartido)
1) NUEVO frontend/src/lib/tabla.js (JS puro, como busqueda.js; se prueba con node):
- reconciliarColumnas(definicion, guardado) → {orden, anchos, ocultas}: descarta ids guardados que ya no existen, mete las columnas nuevas en su lugar por defecto, nunca oculta una columna 'clave', limita cada ancho a [anchoMin, anchoMax] y, si guardado.version ≠ VERSION_PREFS, vuelve a lo por defecto.
- moverColumna(orden, id, indiceDestino, fijas): mueve sin cruzar el límite de las columnas fijas (las fijas a la izquierda siguen al principio y las de la derecha al final).
- indiceDestino(bordes, x): lugar de caída según el punto medio de cada encabezado.
- limitarAncho(px, min, max); offsetsFijas(ordenVisible, anchos, fijas) → {id: px} para position:sticky a la izquierda y a la derecha.
- alternarOrden(actual, campo): ascendente → descendente → sin orden (vuelve al orden por defecto de la tabla).
- Modo cliente: filtrarFilas (con normalizarBusqueda de busqueda.js, sin tildes), ordenarFilas (estable, nulos al final, localeCompare('es', {sensitivity:'base', numeric:true})) y paginar.
- rangoPaginas(pagina, totalPaginas, ventana=5), paginaValida(pagina, total, tamano) y textoRango(pagina, tamano, total) → 'Mostrando 26–50 de 134' o 'Sin resultados'.
- reducirEstadoTabla(estado, accion) sobre {vista, busqueda, estados[], orden, pagina, tamano}. Cualquier cambio de vista, búsqueda, estados, orden o tamaño deja pagina=1. Es el arreglo central de N9 y del mismo defecto en compras/pedidos, lista-compras y traslados.
- queryListado(estado, extra) → 'vista=…&q=…&estados=A,B&orden=-monto&limit=25&offset=50' (omite los vacíos) y normalizarRespuesta(d), que acepta {data,total}, un arreglo plano o {data:{items,total_skus}}.
- TAMANOS_PAGINA=[25,50] y VERSION_PREFS=1.
2) NUEVO frontend/src/lib/preferencias.js (puro, con almacén, servidor y temporizador inyectables): crearPreferencias({usuarioId, almacen, servidor, retardoMs=800}) → {leer(clave), escribir(clave, valor), precargar(prefijo)}.
- La clave interna es 'pref:{usuarioId}:{clave}', con usuarioId de getUsuarioActual() (flujo.tsx).
- Si localStorage lanza (modo privado), guarda en memoria.
- Rechaza valores de más de 8 KB.
- Agrupa las escrituras: una sola por ráfaga.
- Con la opción 'En tu usuario' (pregunta 'guardar_vista_tabla'): precargar('tabla:') hace un solo GET por sesión y escribir hace PUT; si el PUT falla, el valor queda local y se reintenta en el siguiente cambio. Con la otra opción solo usa localStorage.
3) NUEVO frontend/src/components/tabla/ (index.ts):
- TablaEstandar.tsx. Props:
  · id: clave de preferencias, por ejemplo 'ventas.hub'.
  · columnas: ColumnaTabla[] = {id, titulo, celda(fila), ancho, anchoMin=64, anchoMax=640, alinear, ordenable (true o el nombre del campo de orden del servidor), valorOrden(fila) para el modo cliente, clave (no se puede ocultar), fija:'izquierda'|'derecha', flexible (toma el espacio que sobra, medido con ResizeObserver, sin bajar de su mínimo), ocultaPorDefecto, titleCelda(fila)}.
  · filas; modo: 'servidor', 'cliente' o 'simple' (sin paginación, orden ni selección; para tablas de detalle).
  · total, estado y onEstado (de useEstadoTabla), cargando, recargando, error y onReintentar, claveFila, onFila, claseFila.
  · seleccion, onSeleccion y seleccionable(fila).
  · grupoFila(fila) y tituloGrupo(grupo, n): filas separadoras.
  · vacio y pie.
  Dibujo: <table> con table-layout:fixed, <colgroup> y ancho = suma de anchos (mínimo 100%). El contenedor es overflow-auto con max-height calc(100vh − 180px), el thead es sticky y las columnas fijas son sticky con fondo opaco. Las celdas se truncan con title. Los números usan tabular-nums y nunca se parten (adiós 'PVEN-\n20262813').
  Encabezado (pointer events, el mismo patrón que ResizableHeader y el Kanban del CRM):
  · Clic en el título: ordena (aria-sort y flecha).
  · Presionar y arrastrar más de 5 px: reordena, con un encabezado fantasma y una línea azul de destino.
  · Asa de 8 px en el borde derecho: estira o angosta. Durante el arrastre el ancho va al <col> por ref, sin volver a pintar las filas, y se guarda al soltar.
  · Doble clic en el asa: ajusta al contenido (máximo 480 px).
  Estados:
  · Sin datos y cargando: 8 renglones esqueleto y pie 'Cargando…'.
  · Recargando: filas atenuadas y una barra fina arriba.
  · Error: la fila 'No se pudo cargar la lista: <detalle>' con el botón 'Reintentar'.
  · Vacío: lo que traiga la prop vacio.
  Selección: la casilla del encabezado marca solo la página visible, y la selección se limpia al cambiar de página, pestaña, búsqueda o filtro.
- BarraTabla.tsx:
  · Pestañas [{id, etiqueta, conteo:number|null, alerta}]. Un conteo null pinta una pastilla gris animada, nunca 0. Sin emojis.
  · Búsqueda con retardo de 300 ms (Enter busca de inmediato; la X limpia).
  · FiltroEstados.tsx: popover con casillas y etiquetas legibles, opciones por pestaña, contador en el botón y 'Limpiar'.
  · Filtros extra (slot).
  · Botón 'Ajustar tabla' (icono SlidersHorizontal). No es el botón de columnas: ese botón es el Kanban.
  · ConmutadorVista y 'Pantalla completa' (Maximize2: la tarjeta pasa a fixed inset-4 z-40 con su barra y su paginación; Esc sale).
  · Texto 'N resultados'.
- ConmutadorVista.tsx: 'Lista' / 'Tablero', con texto e icono. Solo aparece si la página pasa vistaTablero (el Kanban del grupo U4) y comparte useEstadoTabla, así que cambiar de vista no pierde la pestaña, la búsqueda ni el filtro. Arregla H17.
- MenuAjustes.tsx: casillas para mostrar u ocultar columnas (las clave, bloqueadas), flechas subir/bajar (alternativa sin arrastre), 'Ajustar al ancho de la pantalla' (reparte para que quepa sin correr) y 'Restablecer columnas'.
- Paginacion.tsx: 'Mostrando 26–50 de 134', select 25/50 y « ‹ 1 2 3 4 5 › ».
- MenuFila.tsx: el botón ⋯ abre por clic (no por hover) en un portal con posición fija; abre hacia arriba si no cabe y se cierra con Esc, clic afuera o scroll. Items {etiqueta, icono, onClick, peligro, oculto}.
- Esqueleto.tsx.
- useEstadoTabla(id, inicial): usa reducirEstadoTabla y guarda en sessionStorage 'tabla-sesion:{id}' para volver a la misma pestaña, página, búsqueda y orden al regresar del detalle.
- usePreferenciasTabla(id, columnas): preferencias.js + reconciliarColumnas.
4) frontend/src/components/ui/StatCard.tsx: prop opcional cargando → bloque gris animado en lugar del valor y sin hint (H6). Si el grupo KPI (U3) cambia la tarjeta estándar, debe conservar esta prop.
5) frontend/src/lib/design-system.ts: el token TABLE pasa a tener las clases de TablaEstandar, que lo importa. La regla design-system-reference.md pide importar de ahí.
6) frontend/package.json: '&& node tests/test_tabla.mjs && node tests/test_preferencias.mjs', en un solo cambio del script test coordinado con los demás grupos del bloque.
BACKEND (solo con la opción 'En tu usuario')
7) Migración aditiva fa6_0NN_preferencias_usuario, encadenada a la cabeza que deje el Bloque 3 (verificar con alembic heads). Tabla preferencias_usuario: id, user_id FK users ON DELETE CASCADE, clave VARCHAR(120), valor JSON y updated_at, con UNIQUE(user_id, clave). Modelo en backend/app/models/preferencias.py.
8) NUEVO backend/app/api/v1/preferencias.py, registrado en main.py con prefix '/api/v1/preferencias'. Cualquier usuario autenticado y solo sus propias filas:
- GET ?prefijo=tabla: → {status, data:{clave: valor}}.
- PUT /{clave} con body {valor} → upsert.
- 422 si la clave no cumple ^tabla:[a-z0-9._-]{1,80}$ o si el valor pasa de 8 KB.
```

**Pruebas (diseño):**

```text
NUEVO frontend/tests/test_tabla.mjs (node:assert/strict, al estilo de test_busqueda.mjs):
- reconciliarColumnas:
  · un id guardado que ya no existe se descarta;
  · una columna nueva entra después de su vecina por defecto;
  · una columna clave en 'ocultas' vuelve a verse;
  · un ancho de 9999 queda en anchoMax;
  · otra versión vuelve a lo por defecto.
- moverColumna con ['sel','num','cli','est','acc'] (sel y num fijas a la izquierda, acc a la derecha):
  · 'est' al índice 0 queda después de 'num';
  · mover 'acc' no cambia nada;
  · 'cli' después de 'est' da ['sel','num','est','cli','acc'].
- indiceDestino con bordes 0-100, 100-250 y 250-400: x=40 da 0, x=180 da 2 y x=900 da 3.
- offsetsFijas: a la izquierda acumula los anchos y a la derecha cuenta desde el final.
- alternarOrden: null → asc → desc → null.
- ordenarFilas:
  · es estable;
  · los nulos van al final en las dos direcciones;
  · 'Álvarez' cae entre 'Alba' y 'Bravo';
  · 'COT-10' va después de 'COT-9'.
- filtrarFilas: 'colchon' encuentra 'Colchón'.
- rangoPaginas(7,20) da [5..9] y rangoPaginas(1,3) da [1,2,3]. paginaValida corrige una página fuera de rango.
- textoRango(3,25,134) da 'Mostrando 51–75 de 134' y textoRango(1,25,0) da 'Sin resultados'.
- reducirEstadoTabla:
  · página 4 + cambio de búsqueda → página 1;
  · cambio de tamaño → página 1;
  · cambio de página conserva lo demás.
- queryListado da la cadena exacta y omite los vacíos. normalizarRespuesta acepta las 3 formas.
NUEVO frontend/tests/test_preferencias.mjs, con almacén y servidor falsos:
- dos escrituras en 300 ms → una sola, con el último valor, a los 800 ms;
- los usuarios 7 y 8 no se pisan;
- un localStorage que lanza pasa a memoria;
- un valor de más de 8 KB se rechaza sin romper;
- con servidor: precargar llena el caché y un PUT fallido deja el valor local y se reintenta.
Backend (solo con 'En tu usuario'): NUEVO backend/tests/test_preferencias_usuario.py, corrido con backend/tests/rollback_runner.py (nunca pytest completo):
- PUT y luego GET por prefijo;
- con vendedor_token no se ven las preferencias de otro usuario;
- clave inválida → 422;
- valor de más de 8 KB → 422;
- sin token → 401.
Frontend: npx tsc --noEmit, npm test y npm run lint.
Manual, con capturas de Playwright para la página de revisión visual: estirar, mover, recargar y ver que se recordó; 1024 px; pantalla completa; esqueleto de carga.
```

**Comportamiento esperado:**

```text
- Estirar o angostar: arrastrar el borde derecho del título. Mínimo 64 px (o el de la columna) y máximo 640. Doble clic en el borde ajusta al texto más largo visible (máximo 480). El texto que no cabe termina en '…' y se lee completo al pasar el mouse.
- Mover: presionar el título y arrastrar más de 5 px. Aparece una copia del título y una línea azul donde va a caer; al soltar, la columna cambia de lugar. Las columnas fijas (casilla, número y acciones) no salen de su lado. Sin mouse: 'Ajustar tabla' → flechas.
- 'Ajustar tabla': mostrar u ocultar columnas (las clave no se pueden ocultar), 'Ajustar al ancho de la pantalla' y 'Restablecer columnas'.
- Ancho: si las columnas suman más que la tarjeta, la tabla se corre de lado dentro de su tarjeta y las fijas se quedan quietas. Si sobra espacio, la columna flexible lo toma. El encabezado queda quieto al bajar.
- Pantalla completa: la tabla, con su barra y su paginación, ocupa la ventana. Esc vuelve.
- Orden: clic en el título pasa por ascendente, descendente y el orden por defecto, con una flecha visible. El orden no se guarda: cada tabla abre con su orden por defecto.
- Paginación de 25 o 50 (se recuerda). Si un filtro deja menos páginas, salta a la última que exista.
- Página 1 al cambiar de pestaña, búsqueda, filtro, orden o tamaño. Al volver de un documento, la tabla recupera la pestaña, la página, la búsqueda y el orden de esa sesión.
- Carga:
  · La primera vez: renglones grises animados, pestañas con pastilla gris y tarjetas con bloque gris.
  · Al pasar de página: filas atenuadas y una barra delgada.
  · Si falla: mensaje y 'Reintentar'. Nunca '0' ni 'Todas al día' mientras carga.
- Selección: la casilla del encabezado marca la página; la selección se limpia al cambiar de página o de filtro.
- Se recuerdan por usuario y por tabla: los anchos, el orden, las columnas ocultas, las filas por página y la vista (lista o tablero). Una columna nueva de una versión futura entra en su lugar sin borrar lo demás.
- El menú ⋯ se abre con clic y nunca queda cortado por el borde de la tabla.
```

**Datos existentes:**

```text
No aplica: no toca documentos. Con 'En tu usuario' se crea una tabla nueva y vacía (migración aditiva, sin DROP), y cada tabla aparece con su forma por defecto hasta que la ajustes.
```

**Datos del usuario:**

```text
No cambia ningún documento. Solo se guarda cómo dejaste cada tabla: anchos, orden y columnas visibles, filas por página y si la ves como lista o como tablero.
```

**Riesgos:**

```text
- Sin librería de tablas: es código propio (unas 700 líneas entre componentes y lógica). La alternativa @tanstack/react-table ahorra código, pero suma una dependencia y su lógica no entra en los node tests del repo. Se elige código propio porque ResizableHeader y el Kanban del CRM ya usan pointer events.
- table-layout:fixed recorta textos. Se compensa con title, doble clic en el borde y 'Ajustar al ancho'.
- position:sticky dentro de un contenedor con overflow obliga a que la tabla tenga su propia barra vertical, hasta el alto de la pantalla.
- Clic para ordenar y arrastrar para mover se separan por el umbral de 5 px. En pantallas táctiles queda la alternativa de las flechas de 'Ajustar tabla'.
- localStorage puede estar bloqueado o borrarse: la tabla funciona igual con su forma por defecto.
- La prop cargando de StatCard es aditiva; el grupo U3 debe conservarla.
- design-system.ts hoy es código muerto que contradice a StatCard; aquí solo se toca TABLE.
- package.json lo tocan varios grupos: un solo cambio del script test.
```

**Depende de:**

```text
Bloques 1, 2 y 3 aplicados (usa busqueda.js, getUsuarioActual de flujo.tsx y Avisos del Bloque 2 para los errores). Ningún otro ítem de este bloque; todos los demás TABLA-* dependen de este.
```

**Archivos que nombra el diseño:** `frontend/src/lib/tabla.js`, `frontend/src/lib/preferencias.js`, `frontend/src/components/tabla/index.ts`, `frontend/src/components/tabla/TablaEstandar.tsx`, `frontend/src/components/tabla/BarraTabla.tsx`, `frontend/src/components/tabla/FiltroEstados.tsx`, `frontend/src/components/tabla/ConmutadorVista.tsx`, `frontend/src/components/tabla/MenuAjustes.tsx`, `frontend/src/components/tabla/Paginacion.tsx`, `frontend/src/components/tabla/MenuFila.tsx`, `frontend/src/components/tabla/Esqueleto.tsx`, `frontend/src/components/tabla/useEstadoTabla.ts`, `frontend/src/components/tabla/usePreferenciasTabla.ts`, `frontend/src/components/ui/StatCard.tsx`, `frontend/src/lib/design-system.ts`, `frontend/tests/test_tabla.mjs`, `frontend/tests/test_preferencias.mjs`, `frontend/package.json`, `backend/app/models/preferencias.py`, `backend/app/api/v1/preferencias.py`, `backend/alembic/versions/fa6_0NN_preferencias_usuario.py`, `backend/main.py`, `backend/tests/test_preferencias_usuario.py` (la lista que manda es la de **Files** de la tarea y R27).


### TABLA-api — Listas que cuentan todo y traen 25 o 50 a la vez

**Grupo:** Tablas · **Esfuerzo:** M · **Tareas del plan:** T1A, T3A, T4C, T6B, T12, T20

**Para el usuario:** Las listas piden al servidor solo la página que ves, con su total real y los conteos de cada pestaña. Desaparece el tope silencioso de 200 documentos.

**Lo que vio y aprobó el usuario:** Las listas dejan de quedarse calladas con los 200 documentos más recientes. Ahora piden solo la página que estás viendo y saben cuántos hay en total. Los números de las pestañas y de las tarjetas de arriba cuentan todos los documentos, no solo los que se cargaron. Buscar, filtrar por estado y ordenar se hace sobre todos los documentos, también los viejos. Si algo falla al cargar, la tabla lo dice y trae un botón «Reintentar», en vez de mostrar «0».

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- Sin preguntas.

**Cambios (diseño):**

```text
BACKEND
1) NUEVO backend/app/core/listados.py:
- leer_orden(orden, permitidas: dict[str, columna], por_defecto) → lista para order_by. 'monto' es ascendente y '-monto' descendente; siempre con nulls_last() y con desempate por id desc, para que la paginación sea estable. Un campo que no está en la lista → HTTPException 422 'No se puede ordenar por «x».'. El texto recibido nunca llega al SQL.
- orden_por_lista(col, lista) → CASE que ordena un estado por su posición en el flujo, no por orden alfabético.
- leer_lista('A, B,,A') → ['A','B'].
- contar_por_vista(q, vistas: dict[str, condición|None]) → {vista: n} en UNA consulta, con count(*) FILTER (WHERE …), es decir func.count().filter(cond). None cuenta todo.
- paginar(q, limit, offset) → (total, items).
- respuesta(total, data, conteos=None, resumen=None) → {status, total, data}, y conteos y resumen solo si se pidieron.
2) Convención para cada lista que se migre (la aplican TABLA-hub-ventas, -listas-ventas, -compras, -inventario y -otros):
- Parámetros opcionales nuevos: vista, estados (separados por comas), orden, con_conteos y con_resumen. Sin ellos, la respuesta es idéntica a la de hoy, así que lo que no se migra en la misma tarea no cambia (selectores, Dashboard general, Asistente).
- limit conserva su tope de 200 por página. El problema no era el tope: las pantallas pedían 200 una sola vez e ignoraban total.
- conteos y resumen se calculan con la búsqueda y los filtros extra, pero SIN la vista ni el filtro de estado. Así cada pestaña dice cuántos tiene con esa búsqueda. Es el mismo criterio de 'resumen' de H47 del Bloque 1.
FRONTEND
3) NUEVO frontend/src/components/tabla/useListado.ts: useListado({ruta, estado, extra, conConteos, conResumen}) → {filas, total, conteos, resumen, cargandoInicial, recargando, error, recargar}.
- Arma la URL con queryListado.
- Cancela la petición anterior con AbortController (apiFetch ya pasa options.signal a fetch) y descarta respuestas viejas con un contador.
- Conserva las filas anteriores mientras recarga.
- conteos y resumen valen null hasta la primera respuesta (H6).
- El error se muestra dentro de la tabla.
- Usa normalizarRespuesta en vez de los cerca de 15 wrappers locales de apiFetch que hoy descartan total.
4) useListadoCliente(filas, estado, accesores): para endpoints chicos que devuelven todo (papelera de SC, leads de una campaña, tablas de detalle), con filtrarFilas, ordenarFilas y paginar de lib/tabla.js.
```

**Pruebas (diseño):**

```text
NUEVO backend/tests/test_listados.py, corrido con backend/tests/rollback_runner.py (nunca pytest completo):
1) leer_orden sobre SalesQuotation:
- 'total_cop' da ascendente y '-total_cop' descendente, con los nulos al final y el desempate por id;
- 'drop table' da 422 con el texto en español.
2) contar_por_vista con 3 vistas, una de ellas None, da los conteos correctos en una sola consulta (lo comprueba el contador de consultas del runner R7).
3) paginar con limit 2 y offset 2 sobre 5 filas creadas → total 5 y las filas 3 y 4.
Frontend: los casos de queryListado y normalizarRespuesta están en test_tabla.mjs. Además npx tsc --noEmit y npm test.
```

**Comportamiento esperado:**

```text
- La tabla pide /ruta?vista=…&q=…&estados=…&orden=…&limit=25&offset=25&con_conteos=1, recibe el total real y pinta 'Mostrando 26–50 de 134'.
- La búsqueda se manda 300 ms después de la última tecla. Una respuesta vieja que llegue tarde se ignora.
- Pasar de página no borra la tabla: atenúa las filas y muestra una barra delgada.
- Ordenar por un campo no permitido da 422 con el mensaje en español; la tabla lo muestra y vuelve a su orden por defecto.
- Los parámetros nuevos son opcionales: nada cambia para quien no los manda.
```

**Datos existentes:**

```text
No aplica: solo cambia cómo se leen las listas.
```

**Riesgos:**

```text
- FILTER (WHERE) es de PostgreSQL (la base de producción y erp_test son Postgres).
- Con offset y datos que cambian, un documento nuevo puede hacer que una fila se repita o se salte al pasar de página. Es aceptable para estas listas; paginar por cursor no vale la pena hoy.
- Lo que no es tabla sigue con su wrapper y su tope. Por ejemplo, los selectores que precargan 200 PVEN o PEC y el Dashboard general con 50. Queda anotado en 'notas'.
- conteos y resumen suman 1 o 2 consultas por petición. Con el volumen actual es despreciable.
```

**Depende de:**

```text
TABLA-base (queryListado, reducirEstadoTabla y normalizarRespuesta de lib/tabla.js). Runner de ROLLBACK del Bloque 1 (R7).
```

**Archivos que nombra el diseño:** `backend/app/core/listados.py`, `backend/tests/test_listados.py`, `frontend/src/components/tabla/useListado.ts`, `frontend/src/lib/tabla.js`, `frontend/tests/test_tabla.mjs` (la lista que manda es la de **Files** de la tarea y R27).


### TABLA-hub-ventas — Hub de Ventas: primero lo atrasado y la tabla completa a 1024 px

**Grupo:** Tablas · **Esfuerzo:** L · **Tareas del plan:** T1C, T2, T6A, T7

**Para el usuario:** La tabla del Hub ordena por urgencia: primero lo atrasado y sin resolver, con separadores por grupo. Las columnas clave se ven completas a 1024 px. El filtro de estado funciona con nombres claros, y los contadores son reales y no muestran 0 mientras cargan.

**Lo que vio y aprobó el usuario:** En la tabla del Hub, lo primero que ves es lo que necesita atención. Arriba van los documentos atrasados, luego los pendientes, luego los que ya tienen una acción tomada y al final los cerrados (cancelados, entregados, facturados). Una línea delgada separa cada grupo con su cantidad, por ejemplo «Atrasados · 3». La columna Resolución pasa a ser la primera. En un portátil de 1024 px se ven sin correr la tabla: Resolución, Número (con su tipo SC, COT o PVEN encima), Cliente, Estado, Monto y la Próxima acción con su menú «⋯». Asesor, Antigüedad y Chatter quedan a la derecha y los puedes traer arrastrándolos. El menú «⋯» se abre con clic y ya no se esconde. El filtro «Estado» muestra nombres claros, agrupados en Solicitud, Cotización y Pedido, y sí filtra. Los números de las pestañas, del semáforo y de las tarjetas aparecen cuando terminan de cargar, nunca como 0, y cuentan todos los documentos, no solo los 200 más recientes. «Seleccionar todo» marca solo la página que estás viendo.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- Si haces clic en una columna para ordenar (por ejemplo Monto), ¿qué pasa con los atrasados? → **Toda la tabla se ordena por esa columna; un botón «Atención primero» vuelve al orden del semáforo** (= recomendada)
- Una cotización que el cliente ya confirmó pero que todavía no se convierte en pedido, ¿cómo sale en el semáforo del Hub? (La pastilla roja de atrasados de arriba ya la cuenta como pendiente cuando pasan los días de alerta.) → **Como pendiente, y como atrasada si pasan los días de alerta** (= recomendada)
- (Pregunta del diseño quitada por el crítico) Dentro de los atrasados y los pendientes del Hub, ¿cuál va primero? → se aplica la recomendada: «El que lleva más días sin movimiento» (R3).

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** Punto 3 «Solo con la opción recomendada de 'cot_confirmada_sin_pedido'» → la respuesta fue esa («Como pendiente, y como atrasada si pasan los días de alerta») y C5 lo resuelve por construcción: alertas_resumen pasa a contar_atrasados (T6A) sin cambiar su regla (frontera estricta y ASIGNADA incluida); no se adopta el «>=» del Hub. Su punto 9 cambia por hub_tarjetas (R6), y la línea «handleAskAI usa resumen en vez de las longitudes de los arreglos» → NO (C20: handleAskAI lo quita ANALISIS-ventas, R2).

**Cambios (diseño):**

```text
BACKEND
1) NUEVO backend/app/core/resolucion_ventas.py: una sola definición del semáforo comercial. Es espejo de frontend/src/lib/hub-ventas.js tal como lo dejen los Bloques 1 a 3:
- H3: ASIGNADA y una SC CONFIRMADA sin COT vigente son 'No resuelto'.
- esCotizacionActiva.
- Cruce del Bloque 2: una SC con una COT activa no cuenta como atrasada; la alerta la lleva la COT.
- confirmacion_vigente.
Contenido:
- ESTADOS_NO_RESOLUCION, ESTADOS_ACCION_TOMADA y ESTADOS_CERRADOS por tipo: SC CANCELADA; COT RECHAZADA; VEN ENTREGADO, FACTURADO, CANCELADO y DEVUELTO_TOTAL, tomados de estados_pedido.py.
- clasificar(tipo, estado, dias_sin_mov, limite, sc_con_cot_activa, cot_con_pedido_vigente) → 'ATRASADO', 'NO_RESUELTO', 'ACCION_TOMADA' o 'CERRADO'. Es Python puro, para la prueba de paridad.
- expresiones(tipo, modelo, limites, ahora) → columnas SQL:
  · rango: 0 atrasado, 1 no resuelto, 2 acción tomada, 3 cerrado;
  · dias_sin_mov = días desde coalesce(updated_at, created_at);
  · dias_creado, para la Antigüedad (R5).
- Los límites salen de _get_alert_days (alerta_sc_dias, alerta_cot_dias, alerta_ven_dias). Atrasado = no resuelto con dias_sin_mov ≥ límite, la misma regla de isDocAtrasado.
- Con la opción recomendada de 'cot_confirmada_sin_pedido', una COT CONFIRMADA sin pedido vigente es 'No resuelto'.
2) NUEVO backend/app/api/v1/ventas_hub.py: router aparte para no sumar conflictos en erp_ventas.py. main.py lo incluye con prefix '/api/v1/ventas'. Endpoint GET /ventas/hub/documentos para ALL_ERP_ROLES.
Parámetros:
- vista: todos, no_resueltos, sc, cot, ven o acciones_tomadas (las pestañas).
- semaforo: atrasados, no_resueltos o acciones_tomadas (los botones del aviso).
- estados: pares 'SC:ASIGNADA,VEN:EN_PROCESO' (tipo:estado, porque CANCELADA y CANCELADO se repiten entre tipos).
- q.
- orden: atencion (por defecto), tipo, numero, cliente, asesor, creado, estado o monto; '-' adelante para descendente.
- limit Query(25, ge=1, le=200), offset y con_resumen.
Consulta: UNION ALL de tres SELECT con las mismas columnas:
- tipo, id, numero, cliente, telefono y estado;
- asesor: en SC, advisor_name; en COT, cotizador; en VEN, coalesce(COT.cotizador, SC.advisor_name) por LEFT JOIN, la misma regla de _asesores_de_pedidos de H4;
- monto: total_cop en COT y VEN, null en SC;
- created_at, updated_at y tipo_solicitud;
- las expresiones de resolucion_ventas (sc_con_cot_activa y cot_con_pedido_vigente con EXISTS).
La búsqueda q, en cada SELECT, mira numero, cliente, asesor, sc_numero o cot_numero y productos_ilike (app/core/busqueda.py).
Orden 'atencion':
- rango ascendente;
- dentro de Atrasados y de No resueltos, dias_sin_mov descendente (según la pregunta 'orden_dentro_atrasados');
- dentro de Acción tomada y de Cerrados, created_at descendente;
- desempate por tipo e id.
'estado' ordena por la posición en el flujo (orden_por_lista).
Respuesta {status, total, data, conteos, semaforo, resumen?}:
- conteos: todos, no_resueltos, sc, cot, ven y acciones_tomadas, con q y estados pero sin la vista ni el semáforo;
- semaforo: atrasados, no_resueltos y acciones_tomadas, sobre todo el Hub y sin q (es el aviso de arriba);
- resumen, si se pide: sc_activas, cot_vigentes, ven_en_curso, ventas_facturadas_cop y ventas_facturadas_n, con las reglas de las 4 tarjetas de hoy (l.469-613) y lo que haya cambiado el Bloque 1.
Hidratación de la página (máximo 50 filas):
- 3 consultas IN que devuelven _sc_dict, _cot_dict y _ven_dict (con el advisor_name de H4). Así el panel rápido y la Próxima acción funcionan igual que hoy.
- Cada fila suma resolucion, dias_sin_mov y dias_creado.
- seguimiento_estado: la misma consulta IN que el Bloque 3 agrega a get_alertas. Si quedó escrita dentro de get_alertas, se saca a app/core/seguimiento_confirmacion.py como estado_seguimiento_por_ids(db, tipo, ids).
- En las filas SC, las listas ligeras 'cotizaciones' y 'pedidos_venta' (id, numero, estado) para accionSiguienteSC. Con esto se cierra el riesgo de H3 del Bloque 1: una SC cuya COT quedaba fuera de las 200 cargadas.
3) Solo con la opción recomendada de 'cot_confirmada_sin_pedido': alertas_resumen (erp_ventas.py) cuenta 'atrasados' con resolucion_ventas. Así la pastilla flotante de atrasados (AlertasBadge) y la pastilla 'Atrasados' del Hub dan el mismo número; hoy usan reglas distintas (alertas_resumen incluye ASIGNADA y usa '<'; el Hub usa '>=' y otra lista). Hay que respetar lo que B2-T2 y el Bloque 3 dejen en esa función.
FRONTEND frontend/src/app/dashboard/ventas/page.tsx (página protegida: cambios por bloques, sin reescribirla)
4) Carga:
- loadData deja de pedir /solicitudes, /cotizaciones y /pedidos con limit=200 para la tabla. En su lugar: useEstadoTabla('ventas.hub', {vista:'todos', orden:'atencion'}) y useListado({ruta:'/ventas/hub/documentos', conConteos:true, conResumen:true, extra:{semaforo: quickFilter}}).
- Se borran allData, filteredData, noResueltosList, atrasadosList, accionesTomadasList, scAtrasadas, cotAtrasadas, venAtrasadas e isDocAtrasado.
- /ventas/config se sigue leyendo para el ConfigPanel.
- handleAskAI usa resumen en vez de las longitudes de los arreglos.
5) BarraTabla:
- Pestañas: Todos, No resueltos, Solicitudes, Cotizaciones, Pedidos, Acciones tomadas y Análisis, sin emojis. Los números salen de conteos (null mientras carga, H6).
- 'Estado Específico' (un select de códigos crudos) pasa a FiltroEstados, agrupado en Solicitud, Cotización y Pedido. Etiquetas de estados-solicitud.js (Bloque 2), de las cotizaciones (H7 del Bloque 1) y de estados-pedido.js. Manda estados=tipo:estado.
6) La tabla (l.865-1024) pasa a TablaEstandar id 'ventas.hub', modo servidor, claveFila tipo|id (hoy la key es el índice).
Columnas por defecto, en este orden. Los anchos están pensados para 1024 px con el menú abierto: unos 716 px útiles, con el contenedor del Hub en px-4 por debajo de 1280 px (hoy px-8).
- Casilla: 32, fija a la izquierda.
- Resolución: 104, clave, fija a la izquierda. El chip de hoy (Atrasado +N d, Pendiente o Acción tomada) y, debajo, el chip 'Sin respuesta al recordatorio' cuando seguimiento_estado = AGOTADO (lo pide el Bloque 3).
- Número: 108, clave. Encima, el tipo SC/COT/PVEN en un chip chico.
- Cliente: 136, clave, flexible. Con el teléfono debajo.
- Estado: 112, clave, con etiqueta legible.
- Monto: 96, clave, alineado a la derecha.
- Acción: 128, clave, fija a la derecha. El botón de Próxima acción de H3 y el MenuFila ⋯.
Después, visibles pero fuera de la primera vista: Asesor (120), Antigüedad (96, textoAntiguedad de dias_creado, R5) y Chatter (56). La columna Tipo existe, pero oculta por defecto.
7) U1: con el orden 'atencion', grupoFila = resolucion. Donde empieza cada grupo dentro de la página va una fila separadora delgada: 'Atrasados · 3', 'Pendientes · 5', 'Acción tomada · 40' o 'Cerrados · 12', con los números de semaforo y conteos. Las filas atrasadas conservan el borde rosa. Si se ordena por otra columna aparece el chip 'Orden: Monto ↓ · Atención primero' para volver (pregunta 'orden_clic_columna').
8) Menú de fila: el div con invisible group-hover/m:visible (l.984-1007) pasa a MenuFila (clic y portal). Su contenido es el de N3 del Bloque 1. 'Seleccionar todo' marca solo la página visible. La barra masiva de N3 y N5 no cambia.
9) Aviso del semáforo y tarjetas: aquí solo cambia de dónde salen los números (semaforo y resumen; null mientras carga, con esqueleto). El dibujo del aviso es del grupo U10 y el de las tarjetas, del grupo U3.
10) Vista Tablero: el ConmutadorVista aparece cuando el grupo Kanban (U4) entregue vistaTablero, y usa el mismo useEstadoTabla.
```

**Pruebas (diseño):**

```text
Backend: NUEVO backend/tests/test_hub_ventas_listado.py, corrido con backend/tests/rollback_runner.py (sufijo uuid, un db.add por objeto).
1) test_atencion_primero. Datos:
- SC ASIGNADA con updated_at de hace 5 días (alerta_sc_dias = 2);
- COT BORRADOR de hoy;
- SC CONFIRMADA con una COT vigente;
- PVEN ENTREGADO;
- PVEN EN_PROCESO con updated_at de hace 10 días.
GET /api/v1/ventas/hub/documentos?q=<sufijo>&orden=atencion debe dar [PVEN de 10 días, SC de 5 días, COT, SC confirmada, PVEN entregado], con la resolucion correcta en cada fila.
2) test_paginacion_y_total: con limit=2 y offset=2 da total 5 y las filas 3 y 4.
3) test_conteos_y_semaforo:
- conteos sc=2, cot=1, ven=2 y no_resueltos=3;
- con vista=cot los conteos no cambian;
- semaforo.atrasados ≥ 2.
4) test_filtros:
- vista=no_resueltos con semaforo=atrasados → las 2 atrasadas;
- estados=VEN:ENTREGADO → 1;
- q = producto de una línea de la COT → la COT.
5) test_hidratacion:
- la fila SC trae cotizaciones=[{id, numero, estado}];
- la fila PVEN trae el advisor_name de su COT (H4);
- orden=hackeo → 422.
6) test_paridad_con_hub_ventas_js: una matriz de unos 24 casos (tipo × estado × días × sc_con_cot × cot_con_pedido). clasificar() de Python debe coincidir con esNoResuelto, esAccionTomada y diasDesde de frontend/src/lib/hub-ventas.js corridos con node, con el patrón de test_estados_pedido.py del Bloque 1 (skip si no hay node).
7) Si se hace el paso 3: alertas_resumen.atrasados == semaforo.atrasados sobre los mismos datos.
Frontend:
- test_hub_ventas.mjs suma tituloGrupo('ATRASADO', 3) → 'Atrasados · 3';
- npx tsc --noEmit y npm test.
Manual, con capturas de Playwright para la página de revisión visual:
- Hub a 1024×768 con el menú abierto: las 7 columnas clave sin scroll;
- Hub a 1440;
- tabla corrida de lado, con las columnas fijas quietas;
- esqueletos mientras carga;
- estirar y mover una columna, recargar y ver que se recordó.
```

**Comportamiento esperado:**

```text
- Orden por defecto, 'Atención primero':
  · Atrasados, el que lleva más días sin movimiento primero.
  · Pendientes (no resueltos), también por días sin movimiento.
  · Acción tomada, el más reciente primero.
  · Cerrados, el más reciente primero.
  La paginación respeta ese orden: la página 1 siempre empieza por lo más urgente.
- Resolución: la misma regla que hub-ventas.js. Atrasado = no resuelto con días sin movimiento iguales o mayores que los días de alerta de su tipo (Configuración). La Antigüedad cuenta desde la creación (R5).
- Pastillas del aviso: todo el Hub. Números de las pestañas: con la búsqueda y el filtro de estado aplicados. Tarjetas: todos los documentos.
- A 1024 px con el menú abierto se ven las 7 columnas clave sin correr la tabla. Al correrla, Resolución y la casilla quedan quietas a la izquierda y Acción a la derecha.
- Mientras carga: esqueleto en la tabla, las pestañas, el aviso y las tarjetas. Nunca 'Todas al día' con 0.
- 'Seleccionar todo' marca la página. Cambiar de página o de filtro limpia la selección.
- Con más de 200 documentos de un tipo aparecen todos. Hoy los más viejos se perdían sin aviso.
- Al pasar a Tablero se conservan la pestaña, la búsqueda y el filtro.
```

**Datos existentes:**

```text
No aplica: solo cambia cómo se leen y ordenan los documentos. Los números del semáforo pueden cambiar respecto a hoy, porque ahora cuentan todo con una sola regla.
```

**Riesgos:**

```text
- Hay dos definiciones del semáforo: la de JS (Kanban y panel rápido) y la de Python (tabla). La prueba de paridad detecta cualquier diferencia, y un cambio de reglas toca los dos archivos.
- Con la opción recomendada de 'cot_confirmada_sin_pedido' cambia un caso de test_hub_ventas.mjs del Bloque 1 ({tipo:'COT', estado:'CONFIRMADA'} es hoy 'acción tomada') y suben los 'No resueltos'.
- page.tsx es una página protegida (regla no-full-tsx-rewrite). Se cambia en bloques: carga (l.253-334), pestañas y búsqueda (l.615-689), tabla (l.865-1024) y menú. Son más de 2 secciones, así que el plan debe quedar a la vista en la página de aprobación.
- Otros grupos de este bloque tocan el mismo archivo: U2/U10 (aviso y diagrama), U3 (tarjetas), U4 (Kanban) y Análisis. Hace falta un solo dueño por archivo, en este orden: tabla, Kanban, tarjetas, aviso y análisis.
- El UNION con EXISTS y productos_ilike pesa más que las 3 listas de hoy. Con cientos de documentos es inmediato; si crece, conviene un índice en (estado, updated_at) en las 3 tablas.
- El Kanban del Hub (U4) ya no tiene un arreglo completo en memoria. Debe pedir sus columnas a este endpoint (por vista o semáforo, con su propio límite); queda en su diseño.
```

**Depende de:**

```text
TABLA-base y TABLA-api. Bloque 1: T9 (hub-ventas.js con esNoResuelto, esAccionTomada, accionSiguienteSC y textoAntiguedad; el menú y el modal de N3), H4 y H7. Bloque 2: el cruce 'SC con COT activa' y estados-solicitud.js. Bloque 3: seguimiento_estado. El grupo Kanban (U4) para mostrar el conmutador.
```

**Archivos que nombra el diseño:** `backend/app/core/resolucion_ventas.py`, `backend/app/api/v1/ventas_hub.py`, `backend/main.py`, `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_hub_ventas_listado.py`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/lib/hub-ventas.js`, `frontend/tests/test_hub_ventas.mjs` (la lista que manda es la de **Files** de la tarea y R27).


### TABLA-listas-ventas — Solicitudes, Cotizaciones y Pedidos con la tabla estándar

**Grupo:** Tablas · **Esfuerzo:** L · **Tareas del plan:** T1C, T2, T6B, T8, T9, T10

**Para el usuario:** Las tres listas de Ventas usan la tabla estándar. El filtro de estado ya funciona, las pestañas y tarjetas cuentan todo, la página vuelve a 1 al filtrar, el conmutador de vista funciona y la pestaña Análisis no arrastra la tabla.

**Lo que vio y aprobó el usuario:** Las listas de Solicitudes, Cotizaciones y Pedidos de Venta usan la misma tabla que el Hub: estiras y mueves columnas, eliges 25 o 50 filas y el sistema lo recuerda. «Filtrar Estado» ahora abre una lista de estados con nombres claros y sí filtra (hoy solo recargaba). El botón de las dos columnas abre el tablero (Kanban) cuando esté listo; mientras tanto, no aparece un botón que no hace nada. Al cambiar de pestaña, buscar o filtrar, vuelves a la página 1. Las pestañas y las tarjetas cuentan todos los documentos. En la pestaña Análisis ya no aparece la tabla debajo. La Papelera de solicitudes se ve como tabla. En el pedido de venta, la tabla de productos también se puede estirar y reordenar.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- Además del Hub de Ventas, ¿las listas que tienen semáforo (Solicitudes, Cotizaciones, Pedidos de venta, Hub de Compras y Pedidos de compra) ponen primero lo atrasado y lo que vence antes? → **Sí; con un clic en una columna ordenas como quieras** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) ¿Las listas de Solicitudes, Cotizaciones y Pedidos también ponen primero lo atrasado, como el Hub? → reemplazada por «atencion_primero_listas» (en TABLA-listas-ventas), respondida: «Sí; con un clic en una columna ordenas como quieras» (R8).

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** Punto 4 «Si la respuesta a 'listas_atencion_primero' es 'Sí'» → SÍ (la pregunta se fusionó en atencion_primero_listas = «Sí; con un clic en una columna ordenas como quieras», R8). «Si es 'No'» → NO.

**Cambios (diseño):**

```text
BACKEND erp_ventas.py (con app/core/listados.py)
1) list_solicitudes:
- vista: activas, confirmadas, canceladas, soporte o todas. Activas = no es soporte y no está Confirmada ni Cancelada, con los estados de estados-solicitud.js del Bloque 2 (U15).
- estados.
- orden: atencion, numero, tipo, cliente, asesor, creado, vencimiento o estado.
- con_conteos: activas, confirmadas, canceladas y soporte.
- con_resumen: activas, confirmadas, canceladas, total, con_cot, esperan_cot, sin_atender y vencidas. Usa las definiciones de H32 (generoCotizacion, cotizacionesVigentes) con EXISTS sobre sales_quotations; sin_atender usa los días de alerta de N8.
- Se conserva la lista ligera 'cotizaciones' de H32.
2) list_cotizaciones:
- vista: activas, confirmadas, rechazadas o todas, con el 'pedido caído' de COT-LISTA por EXISTS sobre sale_orders. Activas incluye una COT CONFIRMADA cuyos pedidos están todos cancelados; confirmadas la excluye.
- estados.
- orden: atencion, numero, cliente, cotizador, total, anticipo, entrega, estado o creado.
- La búsqueda suma EXISTS(SaleOrder.numero ilike q). Hoy el JSON.stringify del navegador encontraba la COT por el número de su pedido.
- con_conteos.
- con_resumen: activas, confirmadas, con_pedido, por_convertir, rechazadas, total, monto_confirmado, sin_calc, vencen_pronto y sin_atender.
- Se conserva 'pedidos_venta' ligero de COT-LISTA.
3) list_pedidos:
- vista = la pestaña de la lista: todos, pend_compra, en_proceso, listo_entrega, entregado, facturado o cancelado. La define grupo_pedido(estado), NUEVO en backend/app/core/estados_pedido.py, espejo de grupoPedido de estados-pedido.js: DEVUELTO_TOTAL va a Cancelado y un estado desconocido solo sale en Todos.
- estados: el filtro de N10 pasa al servidor.
- saldo: pendiente o pagado (lo usa Entregas).
- orden: atencion, numero, cliente, total, anticipo, saldo, entrega, estado o creado.
- con_conteos por pestaña. Cierra el riesgo de H47: las pestañas contaban sobre 200.
- El 'resumen' de H47 se mantiene y se calcula sin la vista ni el filtro de estado.
4) Si la respuesta a 'listas_atencion_primero' es 'Sí', orden 'atencion' en las tres listas = el rango de resolucion_ventas (TABLA-hub-ventas), igual que el Hub. Si es 'No', el orden por defecto sigue siendo created_at desc.
FRONTEND
5) solicitud/solicitud-client.tsx (lista, l.1218-1402):
- BarraTabla con las pestañas y sus conteos del servidor (la Papelera, sin conteo).
- FiltroEstados con las etiquetas de estados-solicitud.js y solo los estados de la pestaña. Arregla H15: hoy el botón 'Filtrar Estado' de l.1252 tiene onClick={load}.
- ConmutadorVista (H17: los botones de l.1234-1239 no tienen onClick).
- La tabla de l.1295-1375 pasa a TablaEstandar 'ventas.solicitudes'. Columnas:
  · casilla 32, fija a la izquierda;
  · SC/Trazabilidad 132, clave, fija a la izquierda, con 'COT vinculada' o 'COT rechazada' de H32;
  · Tipo 120;
  · Cliente 160, flexible;
  · Asesor 120;
  · Fecha 96;
  · Vencimiento 104 (en Canceladas: Motivo);
  · Estado 120, clave;
  · Acciones 104, fija a la derecha: Ver, Cancelar y MenuFila.
- Se borra la paginación de l.1378-1402: la trae el componente.
- La Papelera (hoy tarjetas) pasa a TablaEstandar 'ventas.solicitudes.papelera' en modo cliente: SC, Cliente, Motivo, Cancelada el, Se borra el, y Acciones Restaurar/Eliminar.
- Las tarjetas y el aviso 'sin atender / vencidas' leen resumen (null → esqueleto).
- 'Seleccionar todo' marca solo la página.
6) cotizacion/cotizacion-client.tsx (CotizacionClient, l.475-757):
- La tabla de l.641-723 pasa a 'ventas.cotizaciones'. Columnas:
  · COT/SC 132, clave, fija a la izquierda, con 'Pedido …' o 'Pedido … cancelado' de COT-LISTA;
  · Cliente 160, flexible;
  · Cotizador 120;
  · Total 104, con el chip 'Sin precio';
  · Anticipo 96;
  · Entrega est. 104;
  · Estado 120, clave;
  · Acciones 88, fija a la derecha: 'Ver' siempre visible (hoy solo aparece con hover) y MenuFila con 'Abrir solicitud' y 'Ver pedido'. El MoreVertical sin onClick desaparece.
- Se borra la paginación de l.725-751.
- H15 (l.631) y H17 (l.611-620).
- En la pestaña Análisis no se pinta la tabla. Hoy su filtro devuelve true y muestra todas las cotizaciones.
7) venta/venta-client.tsx:
- La tabla de l.274-384 pasa a 'ventas.pedidos'. Columnas:
  · casilla 32;
  · Pedido/Origen 132, clave, fija a la izquierda;
  · Cliente 160, flexible;
  · Total 112;
  · Anticipo 104;
  · Saldo 104 ('—' si está cancelado, H47);
  · Entrega est. 104;
  · Estado 128, clave;
  · Acciones 56, fija a la derecha, con el MenuFila de H44 y R8.
- Las pestañas usan los conteos del servidor y filterEstado va al servidor.
- N9: la vuelta a la página 1 la hace useEstadoTabla.
- El conmutador se conecta al tablero del grupo U4 (R8 lo dejó para este bloque).
- En Análisis no se pinta la tabla vacía.
8) venta/[id]/page.tsx: la tabla de productos (l.556-578, con el IVA que agrega el Bloque 3 U23) pasa a TablaEstandar en modo 'simple', id 'ventas.pedido.productos': se estira, se mueve y se recuerda, sin paginación ni orden.
9) Quedan fuera:
- la tabla editable de productos de la SC (productos-solicitud.tsx, dueña B2-T7): es un formulario;
- la tabla de CalculadorModal: también es un formulario;
- los productos de la COT: son tarjetas.
```

**Pruebas (diseño):**

```text
Backend: NUEVO backend/tests/test_listas_ventas_paginadas.py, corrido con backend/tests/rollback_runner.py.
1) SC. Datos: 3 activas, 1 confirmada sin COT, 1 confirmada con COT, 1 cancelada y 1 de soporte (con sufijo).
- vista=activas&q=sufijo → total 3 (sin la de soporte);
- con_conteos = {activas:3, confirmadas:2, canceladas:1, soporte:1};
- resumen.esperan_cot=1 y con_cot=1;
- limit=2&offset=2 → 1 fila.
2) COT:
- una CONFIRMADA con su PVEN CANCELADO sale en vista=activas y no en confirmadas;
- buscar por el número del PVEN la encuentra;
- resumen.monto_confirmado solo suma las confirmadas sin pedido caído.
3) PVEN, con un pedido por cada uno de los 18 estados:
- vista=cancelado trae CANCELADO y DEVUELTO_TOTAL;
- estados=EN_PROCESO,LISTO_ENTREGA filtra;
- saldo=pendiente excluye los de saldo 0;
- hay conteos por pestaña;
- el resumen es el de H47 sin importar la vista.
4) Paridad:
- grupo_pedido(e) == grupoPedido(e) de estados-pedido.js para los 18 estados más uno desconocido (node; extiende test_estados_pedido.py);
- el resumen de SC y de COT == lo que calculan generoCotizacion, cotizacionesVigentes, pedidoVigente y soloPedidosCancelados de listas-ventas.js sobre las mismas filas (node).
5) Un orden no permitido → 422.
Frontend: npx tsc --noEmit y npm test.
Manual, con capturas:
- las 3 listas a 1024 y a 1440;
- el filtro de estado aplicado;
- desde la página 2, una pestaña nueva vuelve a la 1;
- volver del detalle conserva la página.
```

**Comportamiento esperado:**

```text
- Las pestañas, las tarjetas y el aviso cuentan todos los documentos, no los 200 más recientes.
- 'Filtrar Estado' abre casillas con nombres claros (Nueva, Asignada, Pendiente por confirmación…), solo las de la pestaña. El botón muestra cuántos hay marcados, el filtro se aplica en el servidor y 'Limpiar' lo quita.
- Cambiar de pestaña, buscar, filtrar u ordenar lleva a la página 1. Volver del detalle deja la misma pestaña, página y búsqueda.
- La búsqueda encuentra por número, cliente, asesor o cotizador, número de SC o de pedido, y producto.
- El conmutador Lista/Tablero solo aparece donde hay tablero: nunca un botón muerto.
- En Análisis no aparece la tabla debajo.
- 'Seleccionar todo' marca la página.
```

**Datos existentes:**

```text
No aplica: solo cambia cómo se leen las listas. Las definiciones de los contadores son las de los Bloques 1 y 2; solo pasan a calcularse sobre todos los documentos.
```

**Riesgos:**

```text
- venta-client.tsx tiene 391 líneas y la tabla, la barra y la paginación son cerca del 40%. La regla no-full-tsx-rewrite exige autorización explícita del usuario para pasar del 30%. Hay que pedirla en la página de aprobación; no es una decisión de negocio.
- Los cálculos de H32 y COT-LISTA pasan del navegador al servidor. listas-ventas.js sigue dando las marcas de cada fila, y la prueba de paridad amarra que los dos lados digan lo mismo.
- solicitud-client.tsx y cotizacion-client.tsx también los tocan los grupos KPI, pipeline y Kanban de este bloque: un solo dueño por archivo.
- El Bloque 2 cambia los estados de la SC (U15). Las vistas se escriben contra estados-solicitud.js ya fusionado, no contra los 10 estados de hoy.
```

**Depende de:**

```text
TABLA-base, TABLA-api y TABLA-hub-ventas (resolucion_ventas.py, para 'Atención primero'). Bloque 1: H32, COT-LISTA, H47, N8, N10, H44 y R8. Bloque 2: U15 (estados-solicitud.js). Bloque 3: U23 (tabla de productos con IVA). El grupo Kanban (U4) para el conmutador.
```

**Archivos que nombra el diseño:** `backend/app/api/v1/erp_ventas.py`, `backend/app/core/estados_pedido.py`, `backend/tests/test_listas_ventas_paginadas.py`, `backend/tests/test_estados_pedido.py`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/venta/venta-client.tsx`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### TABLA-compras — Compras con la tabla estándar y lo vencido primero

**Grupo:** Tablas · **Esfuerzo:** L · **Tareas del plan:** T1C, T2, T12, T13, T14, T15, T16A, T16B

**Para el usuario:** Las seis tablas de Compras usan la tabla estándar con paginación real. Lo vencido va primero, los estados recibidos se reconocen, la búsqueda es exacta, se quita la columna repetida y las fechas de traslados y ajustes son reales.

**Lo que vio y aprobó el usuario:** El Hub de Compras, Pedidos de Compra, Mercancía en tránsito, Recepciones, Lista de Compras y Traslados usan la tabla estándar: columnas que se estiran y se mueven, 25 o 50 filas, orden por columna y una búsqueda que encuentra todo. En el Hub de Compras y en Pedidos de Compra, lo vencido va primero, como ya pasa en Tránsito. Desaparece la columna «Total», que repetía el Monto. Los pedidos de compra recibidos en bodega, completos o en parte, ya salen con su nombre y en su pestaña, no como «Borrador». La fecha de los traslados y los ajustes deja de salir siempre en «-». El menú de cada fila se abre con clic. Los números de arriba aparecen cuando terminan de cargar, nunca como 0.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- (Pregunta del diseño fusionada por el crítico) ¿El Hub de Compras y la lista de Pedidos de Compra ponen primero lo vencido, como ya lo hace Mercancía en tránsito? → reemplazada por «atencion_primero_listas» (en TABLA-listas-ventas), respondida: «Sí; con un clic en una columna ordenas como quieras» (R8).

**Cambios (diseño):**

```text
BACKEND
1) NUEVO backend/app/core/estados_pec.py y su espejo NUEVO frontend/src/lib/estados-pec.js, con el patrón de estados_pedido.py del Bloque 1 y prueba de paridad.
- ETIQUETAS_PEC para los 10 estados, con colores: Borrador, Emitido, Enviado al proveedor, En tránsito, Pendiente de entrega, Recibido, Recibida en bodega, Recibida en parte, Completado y Cancelado.
- GRUPOS_PEC:
  · activos = BORRADOR, EMITIDO, ENVIADO, EN_TRANSITO, PENDIENTE_ENTREGA y PARCIALMENTE_RECIBIDA (falta recibir el resto);
  · en_transito = ENVIADO, EN_TRANSITO y PENDIENTE_ENTREGA;
  · recibidos = RECIBIDO, RECIBIDA y COMPLETADO;
  · cancelados = CANCELADO;
  · transito_logistica = todos menos BORRADOR, CANCELADO y los recibidos (lo que hoy filtra Tránsito en el navegador).
- Vencido = fecha_entrega_estimada anterior a hoy y estado activo.
- Si el grupo de reglas o de Kanban de Compras crea este mismo archivo con transiciones, esto se agrega ahí: un solo archivo.
2) list_pec (erp_compras.py:596):
- vista:
  · todos;
  · vigentes (sin cancelados);
  · activos;
  · pedidos (BORRADOR y EMITIDO);
  · en_transito;
  · recepciones (PENDIENTE_ENTREGA, PARCIALMENTE_RECIBIDA, RECIBIDO y RECIBIDA);
  · recibidos;
  · cancelados;
  · no_resueltos (= activos);
  · acciones_tomadas (recibidos + cancelados);
  · transito_logistica.
- semaforo=vencidos y estados.
- La búsqueda suma created_by: el Comprador, que el Hub buscaba en el navegador.
- orden:
  · atencion: los vencidos primero, el más atrasado arriba; luego la fecha de entrega más cercana; luego created_at desc;
  · también numero, proveedor, comprador, monto, compra, entrega, limite o estado (por su posición en el flujo).
- con_conteos para cada vista, más vencidos.
- con_resumen: capital_cop (sin cancelados), activos, en_transito, vencidos, recibidos y cumplimiento_pct = recibidos / total sin cancelados.
3) list_recepciones (l.1215):
- search: numero, pec_numero, supplier_name y warehouse_name.
- vista: pendientes (BORRADOR), completadas (COMPLETADA y COMPLETADA_LOGISTICA), canceladas o todas. Hoy la pantalla busca 'PENDIENTE', que no existe, y muestra COMPLETADA_LOGISTICA y CANCELADA como pendientes.
- orden: numero, pec, proveedor, bodega, fecha, estado o retraso.
- con_conteos.
4) list_lista_compras (l.2901):
- offset y orden: fecha, producto, proveedor, estado o pven.
- La respuesta suma total y conteos por estado, sobre lo filtrado sin el estado.
- Los datos viven en un JSON: se ordena y se corta en Python.
- limit sigue en 200 por defecto para no romper a otros; la pantalla pide 25 o 50.
5) list_inventory_operations (inventory.py:135; la usan Compras > Traslados e Inventario > Traslados y Ajustes):
- search: el número TRL o AJU como texto del id, notas, source_document_numero y tracking_number.
- status (lista).
- direccion: entrada o salida, con EXISTS de un movimiento ADJUST_IN o ADJUST_OUT (las pestañas de Ajustes).
- orden: id, fecha, status, origen o destino.
- con_conteos por status.
- limit Query(100, le=200).
- Cada fila suma 'fecha' = MIN(InventoryMovement.created_at) de la operación, con 'Z'. La tabla inventory_operations no tiene created_at: por eso la columna Fecha sale siempre '-'. InventoryOperationResponse suma fecha: Optional[str].
FRONTEND
6) compras/page.tsx (Hub; página protegida: cambios por bloques en la carga, la tabla y los contadores):
- PecRow y el <table> pasan a TablaEstandar 'compras.hub' en modo servidor sobre /compras/pedidos. Columnas:
  · casilla 32, fija a la izquierda;
  · PEC/PVEN 132, clave, fija a la izquierda, con el chip Vencido;
  · Proveedor 160, flexible;
  · Comprador 120;
  · Monto 112;
  · F. compra 96;
  · Entrega est. 104;
  · Límite alerta 104;
  · Estado 128, clave, con la etiqueta de estados-pec.js;
  · Acciones 72, fija a la derecha: el ojo y MenuFila con 'Cancelar PEC' (confirmación con Avisos del Bloque 2).
- Se quita la columna Total, que repetía Monto.
- Las pestañas, los botones del aviso ('Filtrar atrasados' = semaforo=vencidos) y 'Filtrar Estado' van al servidor.
- Las tarjetas y las pastillas leen resumen y conteos (null → esqueleto).
- Se quita la llamada a GET /compras/stats, que no existe (da 404).
- 'Agrupar mes' pasa a separadores por mes (grupoFila) cuando el orden es por fecha de compra.
- El panel de consolidación de PVEN queda igual.
7) compras/pedidos/page.tsx: lo mismo, con id 'compras.pedidos'.
- Pestañas: Todos (= vigentes), Activos, En tránsito, Recibidos y Cancelados.
- La búsqueda deja de ser JSON.stringify.
- La paginación la trae el componente y vuelve a la página 1.
- El menú de fila (posición fija calculada) pasa a MenuFila con las mismas opciones.
- La key de cada fila es el id.
8) compras/transito/page.tsx: 'compras.transito' sobre vista=transito_logistica con orden atencion.
- 'Solo vencidos' = semaforo=vencidos.
- 25 o 50 filas, en vez de 15 fijas.
- Columnas: Pedido de compra (clave, fija a la izquierda), Cliente/PVEN, Tipo, Etapa actual, Progreso, Entrega est., Monto y Acción (fija a la derecha: Iniciar o Completar etapa).
9) compras/recepciones/page.tsx: 'compras.recepciones'.
- Toda la fila abre el Drawer.
- Botón 'Abrir conteo' hacia /compras/recepciones/[id].
- confirming pasa a confirmandoId: hoy todos los botones muestran carga a la vez.
- Pestañas con las vistas reales.
- Columna 'Retraso' (el dias_retraso que ya entrega _gr_dict), oculta por defecto.
10) compras/lista-compras/page.tsx: 'compras.lista'.
- Solo se pueden seleccionar los ítems PENDIENTE.
- Proveedor y fechas van como filtros extra de BarraTabla y vuelven a la página 1.
- La búsqueda usa el retardo de 300 ms: hoy recarga en cada tecla.
11) compras/traslados/page.tsx e inventario/traslados comparten columnas en NUEVO frontend/src/app/dashboard/compras/columnas-traslado.tsx.
- 'Ver Detalle' y '⋮' no tienen onClick: pasan a MenuFila 'Ver detalle', que abre el Drawer.
- Fecha real.
- Las recepciones comparten columnas con Inventario en NUEVO compras/columnas-recepcion.tsx.
12) Tablas de detalle en modo simple:
- compras/pedidos/[id]/page.tsx: 'compras.pec.productos' y 'compras.pec.actividades';
- compras/recepciones/[id]/page.tsx: 'compras.recepcion.conteo' (los campos de conteo siguen editables).
13) Quedan fuera compras/historial, compras/proyecciones y compras/registro: llaman endpoints que no existen, y primero hay que decidir si se retiran.
```

**Pruebas (diseño):**

```text
Backend: NUEVO backend/tests/test_listas_compras_paginadas.py, corrido con backend/tests/rollback_runner.py (sufijo uuid).
1) list_pec. Datos: un PEC EMITIDO vencido hace 5 días, uno EN_TRANSITO vencido hace 1 día, uno EMITIDO que vence en 3 días, uno RECIBIDA, uno PARCIALMENTE_RECIBIDA y uno CANCELADO.
- orden=atencion&q=sufijo da [5 días, 1 día, en 3 días, …];
- vista=recibidos incluye RECIBIDA;
- vista=activos incluye PARCIALMENTE_RECIBIDA;
- vista=vigentes excluye CANCELADO;
- semaforo=vencidos da 2;
- resumen.cumplimiento_pct es correcto;
- limit y offset funcionan.
2) vista=transito_logistica excluye BORRADOR, CANCELADO y los recibidos; con limit=1 y offset, total cuenta los 3.
3) list_recepciones: la búsqueda por proveedor funciona; vista=pendientes trae solo BORRADOR; los conteos son correctos.
4) list_lista_compras: offset, total y orden sobre ítems de prueba. El JSON se restaura en finally, porque vive en admin_config y no se trunca.
5) list_inventory_operations:
- 'fecha' = created_at del primer movimiento, con 'Z';
- direccion=entrada filtra;
- la búsqueda por source_document_numero funciona;
- status=DONE filtra.
6) Paridad de etiquetas y grupos entre estados_pec.py y estados-pec.js, con node.
Frontend:
- NUEVO frontend/tests/test_estados_pec.mjs: grupos, etiquetas y un estado desconocido humanizado;
- npx tsc --noEmit y npm test.
Manual, con capturas: Hub de Compras y Tránsito a 1024 px, con los vencidos arriba.
```

**Comportamiento esperado:**

```text
- 'Atención primero' en el Hub y en Pedidos (según la pregunta): los vencidos arriba, el más atrasado primero, y luego los que vencen antes. Tránsito sigue igual, pero ahora en el servidor.
- Los PEC RECIBIDA y PARCIALMENTE_RECIBIDA salen con su nombre y en su pestaña (Recibidos o Activos), y cuentan en Cumplimiento.
- Tarjetas, aviso y pestañas cuentan todos los PEC, no los 200 más recientes.
- La búsqueda encuentra por número, proveedor, PVEN, comprador y producto, sin falsos positivos por fechas o ids.
- Tránsito tiene 25 o 50 filas con los vencidos primero, y ya no se pierden PEC en tránsito viejos.
- Recepciones: 'pendiente' es de verdad un borrador, y cada botón Confirmar carga por su cuenta.
- Traslados y Ajustes muestran la fecha del movimiento.
- El menú de fila se abre con clic. La selección es de la página.
```

**Datos existentes:**

```text
No aplica: solo cambia cómo se leen y se muestran las listas.
```

**Riesgos:**

```text
- compras/page.tsx (// @ts-nocheck, 1288 líneas, protegida) y compras/pedidos/page.tsx (1845 líneas) tienen dos PecDetailPanel distintos. Aquí no se tocan: solo la tabla, la carga y los contadores.
- El Kanban de Compras cambia estados sin reglas (PATCH libre). Sigue igual: es del grupo Kanban o de reglas.
- lista-compras corre _sincronizar_pvens_pendientes_a_lista en cada GET, y con paginación habrá un GET por página. Hay que medirlo; si molesta, sincronizar solo con offset=0.
- Las etiquetas nuevas de los PEC (por ejemplo 'Recibida en parte') son una propuesta. Si el usuario prefiere otros nombres, se cambian en un solo archivo.
- Compras > Traslados e Inventario > Traslados siguen siendo dos pantallas para lo mismo; aquí solo comparten columnas.
```

**Depende de:**

```text
TABLA-base y TABLA-api. Si el grupo de reglas o de Kanban de Compras crea estados-pec.js, ese archivo se comparte. Avisos del Bloque 2 para las confirmaciones.
```

**Archivos que nombra el diseño:** `backend/app/core/estados_pec.py`, `backend/app/api/v1/erp_compras.py`, `backend/app/api/v1/inventory.py`, `backend/app/schemas/inventory.py`, `backend/tests/test_listas_compras_paginadas.py`, `frontend/src/lib/estados-pec.js`, `frontend/tests/test_estados_pec.mjs`, `frontend/src/app/dashboard/compras/page.tsx`, `frontend/src/app/dashboard/compras/pedidos/page.tsx`, `frontend/src/app/dashboard/compras/pedidos/[id]/page.tsx`, `frontend/src/app/dashboard/compras/transito/page.tsx`, `frontend/src/app/dashboard/compras/recepciones/page.tsx`, `frontend/src/app/dashboard/compras/recepciones/[id]/page.tsx`, `frontend/src/app/dashboard/compras/lista-compras/page.tsx`, `frontend/src/app/dashboard/compras/traslados/page.tsx`, `frontend/src/app/dashboard/compras/columnas-traslado.tsx`, `frontend/src/app/dashboard/compras/columnas-recepcion.tsx`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R27).


### TABLA-inventario — Inventario con existencias reales en la tabla estándar

**Grupo:** Tablas · **Esfuerzo:** L · **Tareas del plan:** T1C, T6B, T13, T17, T18, T19

**Para el usuario:** Las tablas de Inventario pasan a la tabla estándar y las de existencias muestran datos reales, ordenables y filtrables. Se arreglan el buscador de Productos, la doble carga del Kardex y los pedidos cancelados que aparecían en Entregas.

**Lo que vio y aprobó el usuario:** El Hub de Inventario, Stock y Abastecimiento muestran las existencias reales de cada producto (físico, reservado, disponible, en tránsito y precio), tomadas de lo que hay en bodega, en lugar de las cifras inventadas o en cero de hoy. Puedes ordenar por cualquier columna, por ejemplo por lo disponible, y la pestaña «Stock crítico» muestra de verdad lo que está por debajo del mínimo. Productos, Kardex, Recepciones, Entregas, Traslados y Ajustes usan la misma tabla estándar. En Productos, el buscador por fin filtra. En Entregas ya no aparecen pedidos cancelados para despachar.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- El Hub de Inventario, Stock y Abastecimiento hoy muestran cifras inventadas o todo en cero. ¿Qué hacemos en este bloque? → **Conectarlas a las existencias reales de cada bodega y ponerles la tabla estándar** (= recomendada)
- Almacenes, Ubicaciones, Rutas, Compartido, Bodegas, Operaciones y Calendario de Inventario, Visitantes, Scrapper, Integraciones, Historial/Proyecciones/Registro de Compras, Proyecciones de Ventas y Exportar día/rango están vacías, con datos de ejemplo o llaman a funciones que no existen. ¿Qué hacemos? → **Quitarlas del menú hasta conectarlas** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) Almacenes, Ubicaciones, Rutas, Compartido, Bodegas, Operaciones y el Calendario de Inventario son pantallas vacías o con datos de muestra. ¿Qué hacemos con ellas? → reemplazada por «pantallas_sin_datos» (en TABLA-inventario), respondida: «Quitarlas del menú hasta conectarlas» (R14).

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** Riesgo «Si se elige 'Dejarlas como están'» → NO: pantallas_sin_datos = «Quitarlas del menú hasta conectarlas» (R14). Su punto 12 se hace con esa respuesta (fuera del menú, sin editar ni borrar archivos; ResizableHeader.tsx no se borra). El parámetro «umbral» de su punto 1 → NO (R10: mínimo por referencia).

**Cambios (diseño):**

```text
BACKEND
1) NUEVO GET /inventory/stock-tabla en erp_inventario.py, para ALL_ERP_ROLES. /stock-summary no se toca, porque lo usan el Dashboard general y otros.
- Una fila por SKU (por=sku, por defecto) o por SKU y bodega (por=bodega).
- Columnas: sku_id, sku, producto, categoria (nombre), bodega (con por=bodega), fisico, reservado, disponible, cuarentena, en_transito, precio (ProductSKU.sale_price), costo (cost_price) y valorizacion = físico × costo ('—' si el SKU no tiene costo).
- Se calculan en SQL con las mismas fuentes y filtros que _calculate_sku_availability:
  · físico = InventoryLevel.quantity;
  · reservado = reservas ACTIVE no vencidas;
  · cuarentena = ACTIVO;
  · tránsito = la misma consulta de líneas de PEC pendientes.
- Se usa una subconsulta por (sku, bodega) que luego se agrega. Disponible por bodega = max(0, físico − reservado), y la fila por SKU suma las bodegas.
- El tránsito no tiene bodega: se cuenta una sola vez por SKU (stock-summary hoy lo repite en cada bodega).
- Parámetros:
  · q (sku o nombre), warehouse_id y categoria_id;
  · estado_stock: agotado (disponible = 0), critico (0 < disponible ≤ umbral) u ok;
  · umbral (por defecto 5, el del Hub);
  · incluir_sin_stock (true por defecto);
  · orden: producto, sku, categoria, fisico, reservado, disponible, transito, precio o valorizacion;
  · limit y offset;
  · con_conteos: todos, criticos, agotados, ok y con_fisico;
  · con_resumen: valorizacion_cop, skus, criticos y disponibilidad_pct.
2) catalog.py list_products:
- q: nombre, descripción o un SKU que coincida.
- limit opcional (sin limit devuelve todo, como hoy, para no romper los selectores), offset y orden (nombre, creado o tipo); con limit devuelve total.
- Cada producto suma precio_venta (el menor sale_price de sus SKU), costo y publicado (algún SKU publicado). Hoy la lista lee campos que no existen, y por eso Precio y Costo salen '-' y E-Commerce 'No publicado'.
3) Entregas usa los parámetros estados y saldo de /ventas/pedidos que agrega TABLA-listas-ventas.
FRONTEND
4) inventario/page.tsx (Hub):
- La tabla deja de usar mappedProducts, que son cifras inventadas: físico = 12 + (idx % 7)·3, precio 45000 y bodegas que se alternan.
- Usa TablaEstandar 'inventario.hub' sobre /inventory/stock-tabla?por=bodega. Columnas:
  · casilla 32;
  · SKU 112, clave, fija a la izquierda;
  · Producto 180, clave, flexible;
  · Categoría 120;
  · Bodega 120;
  · Físico 80;
  · Reservado 88;
  · Disponible 88, clave;
  · Estado 104, clave: Agotado, Crítico u Óptimo;
  · Precio 104;
  · Valorización 120;
  · Acciones 56, fija a la derecha.
- Las pestañas Recepciones, Entregas y Traslados no filtraban productos y mostraban siempre 14/8/5: pasan a ser enlaces a sus pantallas. Quedan Todos, Stock crítico, Existencias físicas y Análisis.
- Los filtros de bodega y categoría van al servidor.
- Las 4 tarjetas leen resumen.
- El umbral del modal sigue sin guardarse: solo cambia el parámetro umbral mientras estás en la pantalla.
5) inventario/stock/page.tsx: 'inventario.stock' sobre /inventory/stock-tabla (por=sku), con sus columnas de hoy, ahora con datos (hoy todo sale en 0 y 'Agotado').
6) inventario/abastecimiento/page.tsx: 'inventario.abastecimiento' sobre el mismo endpoint, con las pestañas Urgente (agotado), Bajo mínimo (crítico) y En orden (ok). La tarjeta 'PEC Activos' lee /compras/pedidos?con_conteos=1. Hoy llama a /compras/stats, que no existe, y muestra '?'.
7) inventario/productos/page.tsx: 'inventario.productos' en modo servidor; el buscador por fin filtra. Los filtros 'Requiere revisión' y 'Sin tarifa de IVA' (de B3-T8) se conservan como filtros de BarraTabla.
8) inventario/kardex/page.tsx: 'inventario.kardex' en modo servidor (ya pagina con limit, offset y total).
- 25 o 50 filas, y se puede estirar y mover.
- Un solo fetch al cambiar un filtro: reducirEstadoTabla cambia el filtro y la página a la vez, y así se arregla la doble carga.
- Solo la fecha es ordenable: el endpoint no ordena por otra cosa.
9) inventario/recepciones/page.tsx: usa las columnas compartidas con Compras (compras/columnas-recepcion.tsx) y las vistas reales. Hoy usa 'CONFIRMADA', que no existe.
10) inventario/entregas/page.tsx: 'inventario.entregas' sobre /ventas/pedidos.
- Pestañas: Todos (sin cancelados), Pendientes de saldo (saldo=pendiente), Liberados (saldo=pagado, sin cerrados) y Despachados (ENTREGADO y FACTURADO).
- El estado lleva la etiqueta de estados-pedido.js.
- Un pedido CANCELADO ya no aparece para despachar.
11) inventario/traslados y inventario/ajustes: columnas compartidas, Fecha real y 'Ver detalle' con acción. En Ajustes, las pestañas Entradas y Salidas usan el parámetro direccion del servidor.
12) Pantallas vacías o de muestra, según la pregunta 'pantallas_vacias':
- almacenes, ubicaciones, rutas y compartido usan ResizableHeader con tablas vacías;
- bodegas usa BODEGAS_MOCK;
- operaciones usa PO_MOCK;
- el calendario de inventario es un mock.
Con la opción recomendada, se quitan del Sidebar, de INV_NAV y de SUB_MODULES, y sus archivos y ResizableHeader.tsx se borran en una tarea aparte.
```

**Pruebas (diseño):**

```text
Backend: NUEVO backend/tests/test_stock_tabla.py, corrido con backend/tests/rollback_runner.py.
1) Paridad. Datos: 2 SKU en 2 bodegas, con niveles, una reserva ACTIVE, una reserva vencida, una cuarentena y una línea de PEC pendiente.
- Cada fila de stock-tabla con por=bodega == _calculate_sku_availability(db, sku, bodega), campo por campo.
- Con por=sku, la fila suma las bodegas y cuenta el tránsito una sola vez.
2) orden=-disponible; estado_stock=critico con umbral=5; incluir_sin_stock=false; limit, offset y total.
3) list_products: con q filtra; con limit devuelve total; sin limit devuelve todo (compatibilidad).
4) list_pedidos con saldo=pendiente y saldo=pagado, si no quedó cubierto en TABLA-listas-ventas.
Frontend: npx tsc --noEmit y npm test.
Manual, con capturas:
- Hub de Inventario con datos reales, comparando 2 SKU contra el Kardex;
- Stock crítico;
- búsqueda en Productos;
- Kardex cambiando un filtro, con un solo pedido en la pestaña de red.
```

**Comportamiento esperado:**

```text
- Existencias reales. Disponible = físico − reservado en cada bodega, nunca negativo.
- Stock crítico = disponible entre 1 y el umbral (5 por defecto). Agotado = 0.
- Se puede ordenar por cualquier columna numérica, y los filtros de bodega, categoría y estado se aplican en el servidor.
- Las tarjetas del Hub muestran valorización, referencias, críticos y disponibilidad sobre todo el inventario. Mientras carga, esqueleto.
- Productos: el buscador filtra de verdad, y Precio, Costo y Publicado muestran el dato del SKU.
- Kardex: 25 o 50 filas y un solo pedido al servidor por cada cambio de filtro.
- Entregas: los pedidos cancelados no aparecen en Todos ni en Liberados.
- Traslados y Ajustes: fecha real y 'Ver detalle' funciona.
```

**Datos existentes:**

```text
No aplica: solo lectura. Las cifras del Hub de Inventario cambian porque hoy son inventadas.
```

**Riesgos:**

```text
- Es lo más grande del grupo: la tabla del Hub hoy es de mentira y se conecta a datos reales. Si se elige 'Dejarlas como están', este ítem queda solo con Productos, Kardex, Recepciones, Entregas, Traslados y Ajustes.
- La consulta SQL debe dar lo mismo que _calculate_sku_availability. La prueba de paridad lo amarra; si alguien cambia una, tiene que cambiar la otra.
- La valorización usa el costo, que es lo contable. El Hub hoy multiplicaba por un precio inventado.
- inventario/productos lo toca B3-T8 (IVA): este ítem va después y conserva su filtro.
- inventario/page.tsx tiene su propio menú (SUB_MODULES) y su propio encabezado. Aquí no se tocan: es otro hallazgo.
```

**Depende de:**

```text
TABLA-base y TABLA-api. TABLA-listas-ventas (parámetros estados y saldo de /ventas/pedidos, para Entregas). TABLA-compras (columnas compartidas de recepciones y traslados; el parámetro direccion de /inventory/operations). B3-T8 en inventario/productos.
```

**Archivos que nombra el diseño:** `backend/app/api/v1/erp_inventario.py`, `backend/app/api/v1/catalog.py`, `backend/tests/test_stock_tabla.py`, `frontend/src/app/dashboard/inventario/page.tsx`, `frontend/src/app/dashboard/inventario/stock/page.tsx`, `frontend/src/app/dashboard/inventario/abastecimiento/page.tsx`, `frontend/src/app/dashboard/inventario/productos/page.tsx`, `frontend/src/app/dashboard/inventario/kardex/page.tsx`, `frontend/src/app/dashboard/inventario/recepciones/page.tsx`, `frontend/src/app/dashboard/inventario/entregas/page.tsx`, `frontend/src/app/dashboard/inventario/traslados/page.tsx`, `frontend/src/app/dashboard/inventario/ajustes/page.tsx`, `frontend/src/components/Sidebar.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### TABLA-otros — CRM, E-Commerce, Marketing y Gastos con la tabla estándar

**Grupo:** Tablas · **Esfuerzo:** M · **Tareas del plan:** T20, T21, T22, T23A, T23B

**Para el usuario:** Las tablas que quedan fuera de Ventas, Compras e Inventario adoptan la tabla estándar, con paginación real donde la lista puede crecer.

**Lo que vio y aprobó el usuario:** La vista Lista del CRM, los pedidos web y el catálogo de E-Commerce, los leads de cada campaña de Marketing y los gastos de Finanzas usan la tabla estándar: columnas que se estiran y se mueven, 25 o 50 filas por página, orden por columna y una búsqueda que encuentra todo. En E-Commerce, el filtro de estado usa los estados reales del pedido, así que ahora sí encuentra pedidos.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- Sin preguntas.

**Cambios (diseño):**

```text
BACKEND
1) crm.py get_leads (l.1185): orden (cliente, producto, etapa, valor, asesor o dias) y limit Query(500, ge=1, le=1000). El Kanban sigue pidiendo sin limit y recibe 500, como hoy. total ya existe.
2) ecommerce.py:
- list_web_orders (l.491): orden (numero, cliente, total, items, estado o fecha) y estados (lista).
- list_catalogo (l.1012): offset y total en las dos ramas (_list_catalogo_canonico y la SQL heredada) y orden (nombre, sku, categoria, stock o precio).
3) finance.py list_expenses (l.33): q (categoría y concepto), tipo y categoria; limit opcional (sin limit devuelve todo, como hoy), offset y total; orden (fecha, categoria, concepto, tipo o monto), fecha desc por defecto. Hoy se ordena en el navegador.
FRONTEND
4) crm/page.tsx (página protegida: un solo bloque). La vista Lista (l.979-1034) pasa a TablaEstandar 'crm.leads' en modo servidor sobre /crm/leads, con el stage_id del select de etapa y q. Columnas:
- Cliente/Tipo 180, clave, fija a la izquierda, flexible;
- Producto 160;
- Etapa 120, clave, con el color de la etapa;
- Valor 112;
- Asesor 120;
- Días 72, en rojo si pasa el alert_days de su etapa;
- Acciones 56, fija a la derecha: MenuFila con Abrir y Borrar.
El clic en la fila abre el mismo Drawer. El Kanban y el Análisis no cambian.
5) ecommerce/page.tsx:
- Pedidos web pasan a 'ecommerce.pedidos' en modo servidor. El filtro de estado usa estados-pedido.js: los PWEB_ESTADOS de la pantalla no existen en los pedidos reales, y por eso el filtro casi nunca encontraba nada. La pastilla muestra la etiqueta.
- El catálogo pasa a 'ecommerce.catalogo' en modo servidor. Su vista 'kanban' es una cuadrícula de tarjetas: se renombra 'Tarjetas' para no confundirla con el tablero.
- Las búsquedas usan el retardo de BarraTabla (hoy recargan en cada tecla).
6) marketing/campanas/page.tsx: la pestaña Leads pasa a TablaEstandar 'marketing.leads' en modo cliente (los leads de una campaña llegan completos).
7) finanzas/gastos/page.tsx: 'finanzas.gastos' en modo servidor.
8) Quedan fuera, porque todavía no hay nada que estandarizar:
- ventas/exportar-dia y exportar-rango: vistas previas de una carga que no está construida;
- scrapper e integraciones: datos fijos;
- marketing/visitantes: MOCK_VISITANTES;
- admin/empleados: lista maestro-detalle;
- agenda, calendarios, omnicanal y carritos: tarjetas, no tablas.
```

**Pruebas (diseño):**

```text
Backend: NUEVO backend/tests/test_listas_varias_paginadas.py, corrido con backend/tests/rollback_runner.py.
- get_leads con orden=-valor, limit y offset;
- list_web_orders con estados y orden;
- list_catalogo con offset y total en la rama que esté activa;
- list_expenses con q, limit, offset y total; sin limit devuelve todo.
Frontend: npx tsc --noEmit y npm test.
Manual, con capturas: CRM Lista, E-Commerce (pedidos y catálogo) y Gastos.
```

**Comportamiento esperado:**

```text
- CRM Lista: 25 o 50 leads por página, con orden por cualquier columna y la búsqueda y el filtro de etapa en el servidor. El Kanban del CRM sigue igual.
- E-Commerce: el filtro de estado encuentra los pedidos reales y muestra nombres claros; el catálogo se pagina.
- Marketing: la tabla de leads de la campaña se estira, se mueve y se pagina.
- Gastos: paginados, ordenados por fecha (el más reciente primero) y con búsqueda.
```

**Datos existentes:**

```text
No aplica: solo cambia cómo se leen las listas.
```

**Riesgos:**

```text
- crm/page.tsx es una página protegida: solo se reemplaza el bloque de la vista Lista.
- Un ASESOR sin etapas en caché recibe 403 de /pipeline-stages/config y el CRM no carga. Es un hallazgo aparte; no se arregla aquí.
- E-commerce tiene textos con mojibake ('Ã'). Solo se corrigen los de las tablas que se tocan.
- Gastos dice 'Monto (USD)' en un ERP que trabaja en pesos. No se cambia aquí: es una decisión de Finanzas.
```

**Depende de:**

```text
TABLA-base y TABLA-api. estados-pedido.js del Bloque 1, para E-Commerce.
```

**Archivos que nombra el diseño:** `backend/app/api/v1/crm.py`, `backend/app/api/v1/ecommerce.py`, `backend/app/api/v1/finance.py`, `backend/tests/test_listas_varias_paginadas.py`, `frontend/src/app/dashboard/crm/page.tsx`, `frontend/src/app/dashboard/ecommerce/page.tsx`, `frontend/src/app/dashboard/marketing/campanas/page.tsx`, `frontend/src/app/dashboard/finanzas/gastos/page.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### KANBAN-base — Vista Kanban común para las tablas

**Grupo:** Kanban · **Esfuerzo:** L · **Tareas del plan:** T1A, T3A, T4A, T4B

**Para el usuario:** Una sola manera de ver y mover documentos por estado en todo el sistema. Respeta las reglas de cada documento y, cuando algo no se puede, te dice por qué.

**Lo que vio y aprobó el usuario:** En cada tabla que tiene estados verás arriba a la derecha dos botones: Lista y Kanban (el de columnas). En Kanban, cada estado es una columna con tarjetas, y arrastras una tarjeta a otra columna para cambiarla de estado. Mientras la arrastras, las columnas donde sí se puede soltar se marcan; las demás se apagan y dicen por qué no. Si el sistema no acepta el cambio, la tarjeta vuelve a su lugar y aparece el mensaje con la razón. Cada tarjeta tiene además un menú «Mover a…» por si prefieres no arrastrar, y también sirve en el celular. Cada columna muestra 25 o 50 tarjetas, igual que la tabla, y un botón «Ver más». Las columnas de lo cerrado (Cancelado, Facturado, Rechazada…) salen plegadas, solo con su número. Mientras carga verás tarjetas grises, nunca ceros. Cada pantalla recuerda si la dejaste en Lista o en Kanban.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- En el Kanban, ¿cómo se muestran las columnas de documentos cerrados (Cancelado, Facturado, Rechazada…)? → **Plegadas: se ve el nombre y cuántas hay, y con un clic se abren** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) Al entrar a una pantalla con tabla, ¿qué vista se abre? → reemplazada por «recordar_pantallas» (en TABLA-base), respondida: «En tu usuario: igual en cualquier computador o celular» (R3, R4); cada pantalla abre en la última vista usada; la primera vez en Lista, salvo el CRM (Kanban).

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** «guardar … en localStorage 'nebulae.vista.*' / 'nebulae.kanban.plegadas.*'» y leerPreferencia/guardarPreferencia → NO: todo pasa por lib/preferencias.js y usePreferencia (R4, C2). core/filtros_lista.py (punto 7) → NO: va en core/listados.py (C8, R27).

**Cambios (diseño):**

```text
FRONTEND
1) NUEVO frontend/src/lib/kanban.js (JS puro, sin React ni DOM; se prueba con node):
- Forma de una columna: {clave, titulo, tono, estados?: string[], cerrada?: boolean, ayuda?: string}. definirColumnas(lista) congela la lista y lanza Error si hay claves repetidas.
- agruparEnColumnas(items, columnas, columnaDe) → {[clave]: item[]}. Lo que columnaDe no ubica va a '__sin_columna'; las pruebas de cada módulo exigen que quede vacío.
- ordenarTarjetas(items, {esAtrasado, fechaMovimiento, cerrada}) → copia ordenada y estable.
  · Columna abierta: primero las atrasadas, después las que llevan más tiempo sin movimiento.
  · Columna cerrada: la más reciente primero.
- estadoTableroInicial(columnas) → {[clave]: {items: [], total: null, cargando: true, error: null}}.
- aplicarPagina(tablero, clave, {items, total}, {agregar, idDe}) → tablero nuevo. Con agregar=true suma sin repetir id.
- moverTarjeta(tablero, id, origen, destino, cambios) → {tablero, deshacer}. Saca la tarjeta del origen (total−1) y la pone de primera en el destino (total+1) con los cambios, por ejemplo el estado nuevo. deshacer() devuelve exactamente el tablero anterior.
- Resultado de una regla de soltar, uno de cuatro:
  · {tipo: 'ninguno'}
  · {tipo: 'bloqueado', motivo, enlace?: {texto, href}}
  · {tipo: 'cambio', estado, cuerpo?}
  · {tipo: 'accion', accion, datos?}
- resolverSoltar(item, origen, destino, regla):
  · origen === destino → ninguno.
  · Sin regla → bloqueado con 'Este tablero es solo para ver.'
  · Si la regla devuelve otra forma → lanza Error (es un error de programación).
- mapaDestinos(item, origen, columnas, regla) → {[clave]: {permitido, motivo}}. Sirve para pintar las columnas y el menú «Mover a…».
- columnaBajoPunto(rects, x, y) → clave | null. Es el getStageAtPoint del CRM, con los rectángulos como datos.
- velocidadAutodesplazamiento(x, {left, right}, margen = 64, max = 18) → px por cuadro: negativo hacia la izquierda, 0 en el centro.
- leerPreferencia(storage, clave, porDefecto) y guardarPreferencia(storage, clave, valor):
  · Guardan JSON, todo dentro de try/catch.
  · Si el storage es null o lanza error → porDefecto, sin fallar.
  · Claves: 'nebulae.vista.<pantalla>' ('lista' | 'kanban') y 'nebulae.kanban.plegadas.<pantalla>' (string[]).
- textoContador(n, total, cargando): '…' mientras carga; 'n', o 'n de total' si el servidor tiene más.
2) NUEVO frontend/src/components/ui/ConmutadorVista.tsx:
- ConmutadorVista({vista, onCambiar, kanbanDisponible = true, color = 'indigo'}):
  · Dos botones con los íconos lucide List y Kanban.
  · title y aria-label: 'Vista de lista' y 'Vista Kanban'; aria-pressed.
  · Si kanbanDisponible es false no pinta nada, así no quedan botones muertos (H17 y R8).
- useVistaGuardada(pantalla, porDefecto = 'lista') → [vista, setVista, listo]. Lee la preferencia en useEffect, después del montaje (sin desajuste de hidratación), y la guarda cada vez que cambia.
3) NUEVO frontend/src/components/ui/Kanban.tsx (exporta useTableroKanban, TableroKanban y TarjetaKanban):
a) useTableroKanban(opciones) → {columnas, datos, cargandoInicial, verMas(clave), recargar(claves?), plegar(clave), plegadas}.
- Opciones comunes:
  · pantalla, columnas, idDe.
  · activo: no carga nada mientras la vista es Lista.
  · porColumna: el mismo tamaño de página de la tabla, 25 o 50.
- modo 'servidor': cargar(columna, {offset, limit, orden}) → Promise<{items, total, resumen?}>.
  · Una consulta por columna.
  · Columna abierta con orden 'sin_movimiento'; cerrada con 'reciente'; plegada con limit=0 (solo trae el total).
  · dependencias (búsqueda y filtros) recargan todo tras 300 ms de espera.
  · Cada consulta lleva un número de turno, y una respuesta vieja se descarta.
- modo 'cliente': items, columnaDe, esAtrasado y fechaMovimiento.
  · Agrupa y ordena en el navegador.
  · 'Ver más' sube el corte de porColumna en porColumna.
b) Props de TableroKanban:
- tablero, idDe.
- regla?(item, origen, destino).
- onCambio?(item, resultado) → Promise<documento actualizado | void>. Lanza Error con el texto del servidor.
- onAccion?(item, resultado, origen, destino): la pantalla abre su ventana y, al terminar, llama tablero.recargar([origen, destino]).
- onAbrir(item).
- tarjetaDe?(item) → props de TarjetaKanban.
- renderTarjeta?(item), para una tarjeta propia, como LeadCard del CRM.
- accionesTarjeta?(item) → [{texto, onClick, peligro?}].
- resumenColumna?(clave, datos), pieColumna?(clave).
- soloLectura?: string (el motivo), color?: AccentColor, vacio?: string.
c) Arrastre con pointer events, portado del CRM (crm/page.tsx l.472-580). Sirve con mouse, lápiz y dedo.
- Umbral de 6 px: menos que eso es un clic y llama onAbrir.
- Clon flotante con pointer-events none y z-[80].
- Al empezar se calcula mapaDestinos:
  · Columna permitida: borde punteado del tono y el texto 'Soltar aquí'.
  · Columna bloqueada: opacidad 50 %, un candado y el motivo en la cabecera.
- Autodesplazamiento cerca de los bordes: horizontal en el tablero y vertical en la columna.
- Escape o pointercancel cancelan el arrastre.
d) Al soltar:
- ninguno → no pasa nada.
- bloqueado → la tarjeta vuelve y se llama avisar(motivo, {tono: 'error', accion: enlace}) de useAvisos (Bloque 2).
- cambio:
  · moverTarjeta (optimista) y luego await onCambio.
  · Si responde, la tarjeta toma los datos del servidor y se recargan en segundo plano el origen y el destino.
  · Si falla, deshacer() y avisarError(err) con el mensaje del servidor.
- accion → la tarjeta no se mueve y se llama onAccion.
- Una tarjeta que espera al servidor muestra un spinner y no se puede volver a arrastrar.
- Una región aria-live anuncia 'PVEN-… movido a Listo para entrega', o el error.
e) Menú '⋯' de cada tarjeta, para usar sin arrastrar (teclado y celular):
- 'Abrir'.
- 'Mover a…' con todas las columnas; las bloqueadas salen deshabilitadas y con su motivo escrito.
- Las accionesTarjeta.
- Usa el mismo resolverSoltar que el arrastre.
f) Columnas:
- Ancho w-72 (288 px).
- Cabecera fija con punto de color, título, contador (textoContador) y resumenColumna.
- Cuerpo con scroll vertical propio.
- Las cerradas salen plegadas por defecto: una barra de 48 px con el título en vertical y el número. Un clic la abre, y eso queda guardado por pantalla.
- El tablero ocupa todo el ancho del contenido, sin una tarjeta que lo encierre (U5), y se desplaza en horizontal DENTRO de su contenedor.
- Alto = el alto libre de la ventana, mínimo 420 px.
- En celular (<640 px), cada columna mide 85vw, con scroll-snap.
g) Estados de carga:
- Cargando (H6): 3 tarjetas grises por columna y contadores '…'.
- Error de una columna: caja rose en esa columna con 'Reintentar'.
- Columna vacía: el texto vacio, por defecto 'Sin documentos aquí'.
h) TarjetaKanban({numero, tipo?, titulo, subtitulo?, monto?, estado?: {label, clases}, chips?: [{texto, tono}] (máx. 3), tiempo?, atrasada?, accionPrincipal?: {texto, href | onClick}}):
- p-3 y text-xs.
- Número en negrita con la insignia de tipo (SC, COT, PVEN o PEC).
- Título truncado, con el texto completo en title.
- Pie con el monto (fCOP de lib/pesos.js, en pesos enteros) y la insignia de estado.
- Borde rose si está atrasada.
4) NUEVO frontend/src/components/ui/ModalMotivo.tsx:
- Modal con capa 'encima' y color red: título, lista de efectos y textarea 'Motivo (mínimo 5 caracteres)'.
- El botón de peligro solo se activa con 5 o más caracteres, sin contar espacios al borde.
- onConfirmar(motivo) es async. Si falla, el error del servidor queda en una caja rose dentro de la ventana y no se borra lo escrito (regla del Bloque 2).
- Lo usan los tableros para cancelar o rechazar.
5) components/ui/index.ts: exportar ConmutadorVista, useVistaGuardada, useTableroKanban, TableroKanban, TarjetaKanban y ModalMotivo.
6) Reglas de montaje que siguen todos los ítems por módulo:
- El conmutador reemplaza los dos íconos que hoy están a la derecha de las pestañas.
- En Kanban se ocultan las pestañas que solo filtran por estado, porque cada estado ya es una columna. Se quedan las que cambian el contenido (Análisis, Papelera, Soporte); al elegirlas se ve su vista propia y el conmutador se esconde.
- La búsqueda y los filtros que no son de estado aplican al tablero.
- Si hay filtro de estado, el tablero muestra solo la columna de ese estado con el aviso 'Filtrado por: X · Quitar'.
- Las casillas y la barra de acciones masivas son de la vista Lista. Al pasar a Kanban se limpia la selección.
BACKEND
7) NUEVO backend/app/core/filtros_lista.py (sin FastAPI ni DB):
- estados_de_parametro(valor) → list[str]: separa por coma y quita espacios, vacíos y repetidos. Máximo 20; con más → ValueError.
- filtrar_por_estados(q, columna, valor):
  · ninguno → q sin cambios;
  · uno → columna == e (la misma consulta de hoy);
  · varios → columna.in_(lista).
- ORDENES = ('reciente', 'sin_movimiento'). aplicar_orden(q, creado, actualizado, orden):
  · 'reciente' (por defecto) = creado desc.
  · 'sin_movimiento' = coalesce(actualizado, creado) asc, y luego creado asc.
  · Otro valor → ValueError. El endpoint lo convierte en 422 'Orden no válido: usa reciente o sin_movimiento.'
- Cambios que hace cada ítem por módulo en sus listas:
  · cambia `if estado: q = q.filter(M.estado == estado)` por filtrar_por_estados;
  · agrega `orden: str = 'reciente'`;
  · declara limit como Query(50, ge=0, le=200), para que limit=0 devuelva solo el total.
```

**Pruebas (diseño):**

```text
FRONTEND (node, sin vitest). NUEVO frontend/tests/test_kanban.mjs, con assert de node:assert/strict:
1) definirColumnas lanza con claves repetidas, y la lista queda congelada.
2) agruparEnColumnas: un ítem por columna; si columnaDe devuelve null → '__sin_columna'.
3) ordenarTarjetas:
- En una columna abierta, [A (no atrasada, 1 día quieta), B (atrasada, 3 días), C (atrasada, 5 días)] → [C, B, A].
- En una cerrada, la más reciente va primero.
- Los empates conservan el orden.
4) aplicarPagina con agregar no repite ids y guarda el total.
5) moverTarjeta: el origen pasa de 3 a 2 y el destino de 1 a 2; la tarjeta queda primera, con el estado nuevo; deshacer() devuelve un objeto deepEqual al anterior.
6) resolverSoltar:
- misma columna → ninguno;
- sin regla → bloqueado con 'Este tablero es solo para ver.';
- regla que devuelve {tipo: 'raro'} → lanza.
7) mapaDestinos, con una regla de prueba, da permitido y motivo por columna.
8) columnaBajoPunto: un punto en el borde cuenta; fuera de todo → null.
9) velocidadAutodesplazamiento: 0 en el centro; negativa a 10 px del borde izquierdo; nunca pasa de max.
10) leerPreferencia y guardarPreferencia devuelven porDefecto sin lanzar en tres casos: storage falso que lanza en getItem/setItem, storage null y JSON dañado.
11) textoContador(0, null, true) === '…' y textoContador(25, 80, false) === '25 de 80'.
Agregar `&& node tests/test_kanban.mjs` al script test de frontend/package.json, en el cambio consolidado con los demás grupos. Además, `npx tsc --noEmit` sin errores nuevos.
BACKEND. NUEVO backend/tests/test_filtros_lista.py (puro). Se corre con el runner de ROLLBACK, nunca con pytest completo:
cd <worktree del Bloque 4>/backend && C:/Users/jmqui/Nebulae_ERP_Work/Mirror/backend/venv/Scripts/python.exe tests/rollback_runner.py test_filtros_lista
1) estados_de_parametro(' A, B,,A ') == ['A', 'B']; None y '' → []; 21 valores → ValueError.
2) filtrar_por_estados sobre select(SaleOrder): un valor compila a '= :estado_1' y dos valores a 'IN'.
3) aplicar_orden con 'sin_movimiento' compila con coalesce(updated_at, created_at) ASC; con 'x' → ValueError.
REVISIÓN MANUAL, con capturas de Playwright a 1440, 1024 y 390 px en la página de revisión:
- arrastrar con el mouse;
- usar 'Mover a…' con el teclado;
- plegar y desplegar una columna, recargar y ver que se recuerda;
- cortar la red y ver que la tarjeta vuelve con el mensaje.
```

**Comportamiento esperado:**

```text
- El botón Kanban aparece solo en las pantallas que tienen tablero (ver KANBAN-resto), y donde aparece siempre funciona.
- Vista inicial: la última que usaste en esa pantalla (ver la pregunta). La primera vez es Lista, salvo el CRM, que sigue abriendo en Kanban como hoy.
- Arrastrar nunca manda un cambio que la pantalla ya sabe que el servidor va a rechazar: la regla de cada documento lo dice antes de soltar. Aun así, el servidor es la autoridad: si responde error, la tarjeta vuelve y se ve su mensaje.
- Los cambios que piden algo más (motivo, canal, bodega o confirmación) no se hacen al soltar. Se abre la ventana de esa acción, y la tarjeta se mueve solo cuando termina bien.
- Cambiar de vista no pierde la búsqueda ni los filtros.
- El orden dentro de una columna lo pone el sistema; no se reordena a mano:
  · columnas abiertas: primero lo atrasado y lo que más tiempo lleva quieto (coherente con U1);
  · columnas cerradas: lo más reciente primero.
- Ningún contador muestra 0 mientras carga (H6 en el tablero).
- A 1024 px el tablero se desplaza dentro de su caja: la página no se corre ni esconde columnas (H8 en el tablero).
```

**Datos existentes:**

```text
No toca datos ni hace migraciones. Los parámetros nuevos de las listas (estado con varios valores, orden y limit=0) son opcionales: sin ellos, la consulta es la misma de hoy.
```

**Riesgos:**

```text
- La pieza de arrastre es nueva para casi todas las pantallas. Se toma la del CRM, que ya funciona con pointer events, pero hay que probarla en Safari y en pantallas táctiles.
- El modo servidor hace una consulta por columna (5 o 6 por carga, cada una con su conteo). Con los volúmenes de hoy no pesa; si crece, se agrega un endpoint de conteos agrupados.
- La preferencia de vista se lee después del montaje, así que puede haber un parpadeo. Se pinta el esqueleto hasta que 'listo' sea true.
- Choque de nombres con TABLA-base: este botón se llama 'Kanban'. Si TABLA-base agrega un botón para elegir u ordenar las columnas de la tabla, debe llamarse distinto (por ejemplo 'Columnas de la tabla') y usar otro ícono. El tamaño 25/50 debe ser una sola preferencia, compartida entre la tabla y el tablero.
- Si TABLA-base pone orden o paginación en el servidor, debe usar el mismo parámetro `orden` (con estos valores más los suyos) y el mismo filtrar_por_estados, no otros nombres.
- .agents/rules/no-full-tsx-rewrite.md: cada pantalla reemplaza solo su bloque de Kanban y sus botones, menos del 30 % del archivo.
```

**Depende de:**

```text
- Bloque 2, B2-T0 (H49+H34):
  · AvisosProvider y useAvisos (avisar, avisarError, confirmar);
  · apiFetch con mensaje legible y con .status/.detail (C3);
  · Modal con capa='encima'.
- Bloque 1: T0 (rollback_runner.py) y T1 (lib/pesos.js, para el monto de la tarjeta).
- Coordinar con TABLA-base: tamaño de página 25/50 compartido, barra de herramientas y parámetro `orden`.
- Es la base de KANBAN-hub-ventas, KANBAN-ventas-listas, KANBAN-compras, KANBAN-logistica, KANBAN-crm y KANBAN-resto.
```

**Archivos que nombra el diseño:** `frontend/src/lib/kanban.js`, `frontend/src/components/ui/Kanban.tsx`, `frontend/src/components/ui/ConmutadorVista.tsx`, `frontend/src/components/ui/ModalMotivo.tsx`, `frontend/src/components/ui/index.ts`, `frontend/tests/test_kanban.mjs`, `frontend/package.json`, `backend/app/core/filtros_lista.py`, `backend/tests/test_filtros_lista.py` (la lista que manda es la de **Files** de la tarea y R27).


### KANBAN-hub-ventas — Kanban del Hub de Ventas: primero lo urgente

**Grupo:** Kanban · **Esfuerzo:** M · **Tareas del plan:** T3C, T6A, T7

**Para el usuario:** El tablero del Hub muestra primero lo urgente y solo deja mover lo que de verdad se puede mover.

**Lo que vio y aprobó el usuario:** El tablero del Hub de Ventas usa la misma vista Kanban que el resto del sistema. En cada columna sale primero lo atrasado, con borde rojo y los días que lleva, y después lo que más tiempo lleva sin moverse. Arrastrar hace lo que ya aprobaste en el Bloque 1: soltar en «Cancelado» abre la ventana del motivo, y soltar una solicitud o una cotización en «En gestión» la envía al cliente y te pregunta el canal. Lo que no se puede, ya ni se intenta. Por ejemplo, una solicitud o una cotización no se pueden soltar en «Acción tomada», porque eso lo confirma el cliente. Y una cotización confirmada ya no se reenvía sin querer al soltarla en «No resuelto». El tablero te avisa antes de soltar. Las tarjetas de solicitud traen su botón «Próxima acción», y las que no respondieron el recordatorio muestran «Sin respuesta al recordatorio». Cada columna muestra 25 tarjetas y un botón «Ver más».

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- Sin preguntas.

**Cambios (diseño):**

```text
FRONTEND
1) NUEVO frontend/src/lib/kanban-ventas.js (JS puro). Importa de estados-pedido.js, de hub-ventas.js (Bloque 1, T9) y de estados-solicitud.js (Bloque 2, U15).
- COLUMNAS_HUB = definirColumnas([...]):
  · {clave: 'No Resuelto', titulo: 'No resuelto', tono: 'rose'}
  · {clave: 'En Gestión', titulo: 'En gestión', tono: 'amber'}
  · {clave: 'Acción Tomada', titulo: 'Acción tomada', tono: 'emerald'}
  · {clave: 'Cancelado', titulo: 'Cancelado', tono: 'slate', cerrada: true}
  Las claves no cambian, para no tocar los textos de T9.
- columnaHub(row, {scConCot}): se MUEVE aquí el getKanbanCol de page.tsx tal como lo deje T9, con su primera línea de H3 (una SC CONFIRMADA sin COT vigente → 'No Resuelto'). Único arreglo: un VEN con paso −1 en estados-pedido (CANCELADO y DEVUELTO_TOTAL) va a 'Cancelado'; hoy DEVUELTO_TOTAL cae en 'No Resuelto'.
- reglaSoltarHub(row, origen, destino, {scConCot}) → Resultado. La matriz completa, por tipo y columna, está en «comportamiento». Reusa motivoNoCancelable (N3), tieneProductos (H3), transicionesPedido (N2) y motivoTransicionPedido (de KANBAN-ventas-listas; si este ítem va primero, se crea aquí).
- mapaSeguimiento(alertas) → Map de 'SC|id' y 'COT|id' a seguimiento_estado ('AGOTADO' o 'DETENIDO'), que trae el Bloque 3 (U16).
- tarjetaHub(row, {atrasado, dias, seguimiento, accion}) → props de TarjetaKanban:
  · numero y tipo;
  · titulo = cliente; subtitulo = asesor (H4); monto;
  · estado = etiqueta del tipo, de estados-solicitud, estados-cotizacion o estados-pedido;
  · tiempo = la antigüedad de R5 ('hoy', 'hace N días');
  · chips: 'Atrasado N días' (rose), 'Sin respuesta al recordatorio' (amber, solo con AGOTADO) y 'Soporte' (purple);
  · accionPrincipal = accionSiguienteSC (H3), solo para SC.
2) frontend/src/app/dashboard/ventas/page.tsx (Hub, máxima protección). Solo se tocan el bloque del Kanban, sus imports y loadData:
- Se quitan getKanbanCol, handleDragStart, handleDrop y el bloque '/* ── KANBAN VIEW ── */' (hoy l.383-462 y l.1025-1078; con T9 se corren).
- Las ramas que T9 deja en handleDrop pasan a funciones con nombre, que el tablero llama por onAccion:
  · enviarDesdeTablero(row): el flujo de T9/H27. confirmar → ChannelModal con canal → POST /{solicitudes|cotizaciones}/{id}/enviar-confirmacion → EnlaceConfirmacionModal con el aviso del correo.
  · abrirCancelacion([idStr]): el de N3, que ya existe.
  · reiniciarDesdeTablero(row): confirmar con el texto de 'Reiniciar solicitud' de U15 → PATCH {estado: 'BORRADOR'}. El 409 de R10 sale como aviso.
- Se monta el tablero:
  · `const tablero = useTableroKanban({pantalla: 'ventas.hub', modo: 'cliente', columnas: COLUMNAS_HUB, items: filteredData, columnaDe: r => columnaHub(r, {scConCot}), esAtrasado: isDocAtrasado, fechaMovimiento: r => r.updated_at || r.created_at, porColumna: 25, activo: viewMode === 'kanban'})`
  · `<TableroKanban tablero={tablero} idDe={r => `${r.tipo}|${r.id}`} regla={(r, o, d) => reglaSoltarHub(r, o, d, {scConCot})} onCambio={cambiarDesdeTablero} onAccion={accionDesdeTablero} onAbrir={openDocDetail} tarjetaDe={...tarjetaHub} accionesTarjeta={r => [{texto: 'Actividad y chatter', onClick: () => setActRow(r)}]} />`
- cambiarDesdeTablero(row, {estado}): PATCH /ventas/{solicitudes|cotizaciones|pedidos}/{id} con {estado, updated_by: email del usuario}. Devuelve el documento y luego corre loadData() en segundo plano.
- viewMode pasa a useVistaGuardada('ventas.hub'), y los botones List/LayoutGrid (l.641-648) pasan a ConmutadorVista.
- loadData agrega GET /ventas/alertas, en paralelo y con .catch → {}, para mapaSeguimiento. Si TABLA-ventas ya lo carga para las filas, se comparte el mismo mapa.
3) El punto con animate-ping de la cabecera de 'No resuelto' se conserva cuando hay atrasados.
```

**Pruebas (diseño):**

```text
FRONTEND. NUEVO frontend/tests/test_kanban_ventas.mjs (también lo usa KANBAN-ventas-listas):
1) columnaHub:
- los casos de T9 (copiar sus aserciones de getKanbanCol);
- {tipo: 'VEN', estado: 'DEVUELTO_TOTAL'} → 'Cancelado';
- {tipo: 'SC', id: 1, estado: 'CONFIRMADA'} → 'No Resuelto' con scConCot vacío, y 'Acción Tomada' con Set([1]).
2) reglaSoltarHub: una aserción por renglón de la matriz (unas 25). Compara el tipo y, en los bloqueados, el texto exacto. En particular:
- COT CONFIRMADA → 'No Resuelto' es bloqueado (ya no envía);
- SC → 'Acción Tomada' es bloqueado;
- VEN ENTREGADO → 'En Gestión' es bloqueado con 'solo puede pasar a Facturado';
- VEN EN_PROCESO → 'Acción Tomada' es cambio a LISTO_ENTREGA.
3) mapaSeguimiento: con [{id: 3, seguimiento_estado: 'AGOTADO'}] en sc_sin_atender → get('SC|3') === 'AGOTADO'; sin esa clave → vacío.
4) tarjetaHub: los chips van en orden (Atrasado, Sin respuesta, Soporte), con un máximo de 3.
Agregar al script test. Además, `npx tsc --noEmit`.
BACKEND: no cambia.
MANUAL, con capturas de Playwright a 1440 y 1024 px:
- soltar una COT confirmada en 'No resuelto': la columna se ve apagada con el motivo y no se manda nada;
- soltar una SC asignada en 'En gestión': pide el canal y muestra el enlace;
- soltar un pedido en 'Cancelado': abre el modal con motivo;
- cortar la red al mover un pedido: la tarjeta vuelve con el mensaje.
```

**Comportamiento esperado:**

```text
Columnas (como las deja T9): No resuelto · En gestión · Acción tomada · Cancelado. Cancelado sale plegada, según la pregunta de KANBAN-base. Las pestañas, los filtros rápidos del semáforo y la búsqueda del Hub siguen iguales, y el tablero muestra lo filtrado.
Orden en cada columna: primero los atrasados (isDocAtrasado), luego los que más días llevan sin movimiento. En Cancelado, lo más reciente. Se ven 25 por columna, con 'Ver 25 más'.
MATRIZ DE SOLTAR (reglaSoltarHub). En todos los casos, soltar en la misma columna no hace nada.
SOLICITUD (SC)
- → Cancelado:
  · si motivoNoCancelable(row) → bloqueado con ese texto;
  · si no → acción 'cancelar' (el modal de N3 con motivo, que usa POST /cancelar).
- → En gestión:
  · ASIGNADA con productos → acción 'enviar' (canal y enlace, H27);
  · PENDIENTE_CONFIRMACION → bloqueado 'Ya está pendiente de confirmación del cliente.';
  · BORRADOR → bloqueado 'Primero asígnale un asesor.';
  · ASIGNADA sin productos → bloqueado 'Agrégale productos antes de enviarla.', con enlace 'Abrir solicitud';
  · CONFIRMADA → bloqueado 'El cliente ya la confirmó.';
  · CANCELADA → bloqueado 'Una solicitud cancelada se restaura desde la Papelera.'
- → No resuelto:
  · PENDIENTE_CONFIRMACION, o CONFIRMADA sin COT vigente → acción 'reiniciar', con la confirmación de U15. Si tiene documentos activos, el servidor responde 409 (R10).
  · con COT vigente (scConCot) → bloqueado 'Tiene una cotización activa: no se puede reiniciar.';
  · CANCELADA → bloqueado (Papelera).
- → Acción tomada: siempre bloqueado, 'La solicitud queda Confirmada solo cuando el cliente confirma con su enlace.' Hoy ese movimiento da 400 (nota 7 del Bloque 2).
COTIZACIÓN (COT)
- → Cancelado:
  · motivoNoCancelable → bloqueado;
  · si no → acción 'cancelar' (N3: queda Rechazada, con el motivo en su Actividad). Si tiene un pedido vigente, el servidor responde 409 y el modal muestra el mensaje.
- → En gestión:
  · BORRADOR, VENCIDA o ENVIADA (antigua) → acción 'enviar' (canal; H27 y H50);
  · PENDIENTE_CONFIRMACION → bloqueado 'Ya está pendiente…';
  · CONFIRMADA → bloqueado 'El cliente ya la confirmó.';
  · RECHAZADA → bloqueado 'Primero retómala: suéltala en No resuelto.'
- → No resuelto:
  · RECHAZADA → cambio a BORRADOR (retomar). Si la SC ya tiene otra cotización activa, el servidor responde 409 (N7).
  · CONFIRMADA → bloqueado 'Ya la confirmó el cliente: para cambiar precios ábrela y re-cotiza.'
  · Arreglo: hoy este movimiento ENVIABA la cotización al cliente (el mapa de 'No Resuelto' la ponía en PENDIENTE_CONFIRMACION).
- → Acción tomada: bloqueado 'Solo el cliente confirma la cotización con su enlace.'
PEDIDO (VEN)
- Cada columna lleva a un estado: No resuelto = PENDIENTE_COMPRA, En gestión = EN_PROCESO y Acción tomada = LISTO_ENTREGA.
- Si transicionesPedido(estado) incluye ese estado → cambio con PATCH {estado}.
- Si no → bloqueado con motivoTransicionPedido, por ejemplo 'Un pedido entregado solo puede pasar a Facturado.' o 'El pedido está cancelado y no se puede reabrir.'
- → Cancelado: acción 'cancelar' (modal de N3, motivo obligatorio), o bloqueado por motivoNoCancelable.
- Entregado y Facturado no se ponen desde el tablero (N2): se despacha en Entregas y se factura desde el panel rápido.
Clic en una tarjeta: abre el panel rápido (openDocDetail). El menú de la tarjeta trae 'Mover a…' y 'Actividad y chatter'.
```

**Datos existentes:**

```text
No toca datos.
```

**Riesgos:**

```text
- ventas/page.tsx tiene muchos dueños: 14 ítems de T9, el Bloque 2 y los demás grupos del Bloque 4 (tabla, KPI, pipeline y Análisis). Necesita un solo dueño en el Bloque 4. Este ítem solo toca el bloque del Kanban, sus imports y una consulta en loadData.
- T9 todavía no está implementado, así que la matriz se escribió con su diseño (N3, N2, N5, H3, H27 y H50). Al implementar, cada rama que T9 deje en handleDrop debe quedar como un renglón de reglaSoltarHub, con su prueba. Si T9 decide otra cosa, gana T9. La excepción es el arreglo de COT → 'No Resuelto' (hoy envía sin querer al cliente), que debe revisar el crítico.
- El Hub trae como máximo 200 documentos por tipo, y el tablero cuenta solo lo cargado. Avisarlo es tarea de TABLA-ventas.
- El chip 'Sin respuesta al recordatorio' depende del Bloque 3 (seguimiento_estado). Sin él, simplemente no aparece.
```

**Depende de:**

```text
- KANBAN-base.
- Bloque 1, T9 completo:
  · hub-ventas.js con motivoNoCancelable, tieneProductos, accionSiguienteSC y esNoResuelto;
  · el modal de N3 y el panel de N2;
  · el envío con canal de H27 en el tablero;
  · la antigüedad de R5 y el asesor de H4.
- Bloque 2: U15 (estados-solicitud.js, con las etiquetas y el texto de 'Reiniciar') y H49 (useAvisos en el Hub).
- Bloque 3, U16-seguimiento (seguimiento_estado en get_alertas). Es opcional.
- KANBAN-ventas-listas aporta motivoTransicionPedido y estados-cotizacion.js; si este ítem va primero, se crean aquí.
- Es el mismo archivo que tocan TABLA-ventas, KPI y pipeline del Bloque 4: un solo dueño y en orden.
```

**Archivos que nombra el diseño:** `frontend/src/lib/kanban-ventas.js`, `frontend/tests/test_kanban_ventas.mjs`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R27).


### KANBAN-ventas-listas — Kanban en Solicitudes, Cotizaciones y Pedidos

**Grupo:** Kanban · **Esfuerzo:** L · **Tareas del plan:** T2, T3C, T6B, T8, T9, T10

**Para el usuario:** Ves cada lista de ventas por estado y la mueves con las mismas reglas que en el resto del sistema.

**Lo que vio y aprobó el usuario:** Las listas de Solicitudes, Cotizaciones y Pedidos de Venta ganan la vista Kanban, y el botón de columnas que hoy no hace nada ahora funciona.
En Pedidos, las columnas son Pendiente de compra, En proceso, Listo para entrega, Entregado, Facturado y Cancelado. Un pedido se arrastra libremente entre los tres primeros pasos. Para cancelarlo se pide el motivo. A Facturado solo pasa uno ya entregado, y te pide confirmar. A Entregado no se arrastra: el tablero te lleva a Entregas, donde se elige la bodega.
En Cotizaciones, soltar en «Esperando al cliente» la envía y te pregunta el canal. Soltar en «Rechazada» pide el motivo. «Confirmada» solo la pone el cliente.
En Solicitudes, las columnas son Nueva, Asignada, Pendiente por confirmación, Confirmada y Cancelada. Como avanzan solas, el tablero solo deja enviarla al cliente, reiniciarla o cancelarla con motivo.
Las tarjetas muestran número, cliente, valor, estado y si están atrasadas. El Kanban trae todos los documentos, no solo los 200 más recientes.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- Sin preguntas.

**Cambios (diseño):**

```text
BACKEND: backend/app/api/v1/erp_ventas.py, sobre el código del Bloque 1.
1) list_solicitudes, list_cotizaciones y list_pedidos:
- usan `filtrar_por_estados(q, Modelo.estado, estado)` en vez de `== estado`;
- agregan el parámetro `orden: str = 'reciente'`, con aplicar_orden(q, Modelo.created_at, Modelo.updated_at, orden) en vez del order_by fijo (ValueError → 422);
- declaran `limit: int = Query(50, ge=0, le=200)`.
El resumen de H47 y los pedidos_venta de COT-LISTA se siguen calculando igual, sobre el filtro.
2) list_solicitudes agrega `sin_soporte: bool = False`. Deja fuera las SC con tipo_solicitud 'Soporte Tecnico' (las de tipo nulo sí entran). Lo usa el tablero de Solicitudes, porque los tickets de soporte tienen su propio flujo y su propia pestaña.
FRONTEND
3) NUEVO frontend/src/lib/estados-cotizacion.js, con el mismo patrón que estados-pedido.js:
- ESTADOS_COTIZACION {codigo: {label, clases}}, con las etiquetas de textos_actividad.ETIQUETAS_ESTADO['COT']: Borrador, Enviada al cliente, Esperando confirmación del cliente, Confirmada, Rechazada y Vencida.
- ESTADOS_COT_MANUALES = ['BORRADOR', 'RECHAZADA', 'VENCIDA'], espejo de erp_ventas.py.
- infoEstadoCotizacion(e).
- En cotizacion-client.tsx, ESTADOS (l.19-26) toma de aquí el label y las clases, y conserva su export, porque cotizacion/[id] lo importa.
4) kanban-ventas.js (lo crea KANBAN-hub-ventas) agrega:
- motivoTransicionPedido(desde, hacia) → texto o null, con los textos de N2 sin el número:
  · desde CANCELADO: 'El pedido está cancelado y no se puede reabrir.'
  · desde FACTURADO: 'El pedido ya está facturado; su estado no se puede cambiar.'
  · desde ENTREGADO hacia cualquier estado que no sea Facturado: 'Un pedido entregado solo puede pasar a Facturado.'
  · hacia FACTURADO desde otro estado: 'Solo un pedido entregado se puede marcar como Facturado.'
- COLUMNAS_PEDIDO: una columna por cada grupo de grupoPedido, en el orden de PASOS_PEDIDO, más Cancelado.
  · titulo = la etiqueta en ESTADOS_PEDIDO del estado clave: Pendiente de compra, En proceso, Listo para entrega, Entregado, Facturado y Cancelado.
  · estados = todos los códigos de ESTADOS_PEDIDO cuyo grupoPedido es esa columna. Así PENDIENTE_PAGO va con Pendiente de compra, EN_TRANSITO con En proceso y DEVUELTO_TOTAL con Cancelado.
  · Facturado y Cancelado son cerradas.
  · Estado destino de cada columna: PENDIENTE_COMPRA, EN_PROCESO, LISTO_ENTREGA, null (Entregado), FACTURADO y CANCELADO.
- reglaSoltarPedido(pedido, origen, destino):
  · → Entregado: bloqueado 'Se despacha desde Entregas: ahí eliges la bodega y se descuenta el inventario.', con enlace {texto: 'Ir a Entregas', href: '/dashboard/inventario/entregas'}.
  · → Cancelado: acción 'cancelar', si transicionesPedido lo permite.
  · → Facturado: acción 'facturar', solo si el estado es ENTREGADO.
  · → una de las tres primeras columnas: cambio al estado destino, si transicionesPedido(estado) lo incluye.
  · En cualquier otro caso: bloqueado con motivoTransicionPedido.
- COLUMNAS_COT: Borrador (BORRADOR), Esperando al cliente (PENDIENTE_CONFIRMACION y ENVIADA), Confirmada (CONFIRMADA), Vencida (VENCIDA) y Rechazada (RECHAZADA, cerrada).
- reglaSoltarCotizacion(cot, origen, destino):
  · con pedidoVigente(cot) (listas-ventas.js) → bloqueado 'Tiene el pedido PVEN-… activo: para cambiarla, cancela primero el pedido.'
  · → Confirmada: bloqueado 'Solo el cliente confirma la cotización con su enlace.'
  · → Esperando al cliente: acción 'enviar' desde BORRADOR, VENCIDA o ENVIADA. Desde RECHAZADA: bloqueado 'Primero pásala a Borrador para retomarla.' Desde CONFIRMADA: bloqueado 'El cliente ya la confirmó.'
  · → Borrador: cambio desde ENVIADA, VENCIDA o RECHAZADA.
  · → Vencida: cambio desde BORRADOR o ENVIADA.
  · → Borrador o Vencida desde PENDIENTE_CONFIRMACION o CONFIRMADA: acción 'confirmar', con los efectos 'Se anula el enlace o la confirmación que tiene el cliente' y 'Tendrás que enviársela otra vez'.
  · → Rechazada: acción 'rechazar'.
- COLUMNAS_SC, con PASOS_SC de estados-solicitud.js: Nueva (BORRADOR), Asignada (ASIGNADA), Pendiente por confirmación (PENDIENTE_CONFIRMACION), Confirmada (CONFIRMADA y los heredados COTIZADA, EN_ESPERA_CONFIRMACION, RECHAZADA y VENCIDA) y Cancelada (CANCELADA, cerrada).
- reglaSoltarSC(sc, origen, destino):
  · → Confirmada: bloqueado 'Solo el cliente confirma la solicitud con su enlace.'
  · → Pendiente: acción 'enviar' desde ASIGNADA con productos (tieneProductos). Desde Nueva: bloqueado 'Primero asígnale un asesor.', con enlace 'Abrir solicitud'. Sin productos: bloqueado 'Agrégale productos antes de enviarla.' Desde Confirmada: bloqueado.
  · → Nueva o Asignada desde PENDIENTE_CONFIRMACION o CONFIRMADA: acción 'reiniciar', pero solo en la columna donde va a quedar (Asignada si tiene asesor, Nueva si no). En la otra columna: bloqueado 'Al reiniciarla queda en Asignada porque tiene asesor.'
  · → Nueva desde Asignada: bloqueado 'Para dejarla en Nueva quítale el asesor desde la solicitud.'
  · → Asignada desde Nueva: bloqueado 'Asígnale un asesor desde la solicitud.'
  · → Cancelada: acción 'cancelar'.
  · Desde Cancelada hacia cualquier columna: bloqueado 'Una solicitud cancelada se restaura desde la Papelera.'
5) venta/venta-client.tsx (N9):
- viewMode pasa a useVistaGuardada('ventas.pedidos'), y el conmutador que R8 ocultó vuelve como ConmutadorVista.
- En Kanban se ocultan las pestañas de estado (queda Análisis), la paginación y la barra masiva.
- useTableroKanban en modo servidor:
  · cargar = apiFetch(`/ventas/pedidos?estado=${col.estados.join(',')}&search=${enc(search)}&limit=${limit}&offset=${offset}&orden=${orden}`) → {items: d.data, total: d.total, resumen: d.resumen};
  · dependencias [search];
  · porColumna = pageSize.
- resumenColumna: fCOP(resumen.monto_cop) debajo del título, salvo en Cancelado.
- onCambio: PATCH /ventas/pedidos/{id} con {estado, updated_by}.
- onAccion:
  · 'cancelar' → ModalMotivo con título 'Cancelar PVEN-…' y los efectos 'El pedido queda Cancelado y no se puede reabrir' y, si tiene PXP pendiente, 'Su orden de pago se anula' (H45) → PATCH {estado: 'CANCELADO', cancellation_reason, updated_by}.
  · 'facturar' → confirmar con el texto de N2 ('Después de esto el estado del pedido ya no se puede cambiar.') → PATCH {estado: 'FACTURADO'}.
- accionesTarjeta: 'Marcar En tránsito' y 'Marcar En proceso', para cambiar de estado sin salir de la columna En proceso (solo si transicionesPedido lo permite).
- tarjetaDe:
  · numero; titulo = cliente; subtitulo 'SC-… · COT-…'; monto = total;
  · chip 'Saldo $X' si hay saldo y no está cancelado;
  · estado con infoEstadoPedido;
  · tiempo desde created_at (R5).
- La vuelta a la página 1 al cambiar de pestaña, filtro o búsqueda ya la hace R8 (T10). Si TABLA-base trae un hook de paginación, se usa el suyo.
6) cotizacion/cotizacion-client.tsx (H17):
- Los dos botones sin onClick (l.611-620) pasan a ConmutadorVista, con useVistaGuardada('ventas.cotizaciones').
- Tablero en modo servidor con /ventas/cotizaciones, con el mismo patrón.
- Chips:
  · 'Pedido PVEN-…' (emerald) si tiene pedido vigente, o 'Pedido … cancelado' (rose), según COT-LISTA;
  · 'Sin precio' si el total es 0;
  · 'Sin respuesta al recordatorio' (Bloque 3), desde GET /ventas/alertas.
- onAccion:
  · 'enviar' → ChannelModal (exportado en este mismo archivo, con el canal de H27) → POST /ventas/cotizaciones/{id}/enviar-confirmacion {canal} → EnlaceConfirmacionModal (flujo.tsx) con el aviso del correo.
  · 'rechazar' → ModalMotivo → PATCH {estado: 'RECHAZADA'} y POST /ventas/cotizaciones/{id}/actividad con {action: 'NOTE_ADDED', description: 'Motivo del rechazo: …'}, igual que N3.
  · 'confirmar' → confirmar con los efectos y luego el PATCH.
7) solicitud/solicitud-client.tsx (H17):
- Los dos botones sin onClick (l.1232-1241) pasan a ConmutadorVista, con useVistaGuardada('ventas.solicitudes'). Se esconde en las pestañas Soporte, Papelera y Análisis.
- Tablero en modo servidor con /ventas/solicitudes?…&sin_soporte=true.
- onAccion:
  · 'enviar' → el mismo ChannelModal + POST /ventas/solicitudes/{id}/enviar-confirmacion {canal} + el modal del enlace.
  · 'cancelar' → el modal de motivo de esta lista que deja T11 (cancelWithReason, con POST /cancelar), con cancelTarget = [id].
  · 'reiniciar' → confirmar con el texto de 'Reiniciar solicitud' de U15 → PATCH {estado: 'BORRADOR'}. El 409 de R10 sale como aviso.
- tarjetaDe:
  · numero, cliente, asesor y tipo de solicitud;
  · chips 'Atrasada' (diasAlerta de N8) y 'Sin respuesta al recordatorio';
  · accionPrincipal = accionSiguienteSC (H3).
```

**Pruebas (diseño):**

```text
BACKEND. NUEVO backend/tests/test_listas_kanban_ventas.py, con el runner de ROLLBACK. Sigue el estilo de test_listas_ventas_totales.py del Bloque 1: sufijo uuid, auth(token), un db.add por objeto y numero de 20 caracteres o menos.
1) test_pedidos_filtran_por_varios_estados: 3 PVEN del mismo cliente (EN_PROCESO, LISTO_ENTREGA y CANCELADO).
- GET /ventas/pedidos?search=<cliente>&estado=EN_PROCESO,LISTO_ENTREGA → total 2 y ningún CANCELADO.
- Con estado=EN_PROCESO → total 1 (compatibilidad con hoy).
2) test_limit_cero_devuelve_solo_el_total: limit=0 → data == [] y total == 3. El resumen de H47 sigue sumando sobre el filtro.
3) test_orden_sin_movimiento, con dos COT, una con updated_at viejo y otra con updated_at nuevo:
- orden=sin_movimiento → la vieja primero;
- orden=reciente → primero la creada más tarde;
- orden=x → 422 con 'Orden no válido'.
4) test_solicitudes_sin_soporte, con una SC 'Soporte Tecnico' y otra normal: sin_soporte=true trae solo la normal; sin el parámetro trae las dos.
5) test_cotizaciones_varios_estados_traen_pedidos_venta: con estado=CONFIRMADA,BORRADOR, cada fila trae pedidos_venta (COT-LISTA).
Correr: cd <worktree>/backend && C:/Users/jmqui/Nebulae_ERP_Work/Mirror/backend/venv/Scripts/python.exe tests/rollback_runner.py test_listas_kanban_ventas
NUEVO backend/tests/test_estados_cotizacion_paridad.py, con node y el mismo patrón que test_estados_pedido.py:
- compara las etiquetas de estados-cotizacion.js con ETIQUETAS_ESTADO['COT'];
- compara ESTADOS_COT_MANUALES con la constante de erp_ventas.py.
FRONTEND, en test_kanban_ventas.mjs:
- Cada uno de los 18 códigos de ESTADOS_PEDIDO está en exactamente una columna de COLUMNAS_PEDIDO. PENDIENTE_PAGO está en Pendiente de compra, EN_TRANSITO en En proceso y DEVUELTO_TOTAL en Cancelado.
- reglaSoltarPedido:
  · EN_PROCESO → Listo para entrega = cambio a LISTO_ENTREGA;
  · ENTREGADO → Pendiente de compra = bloqueado 'Un pedido entregado solo puede pasar a Facturado.';
  · ENTREGADO → Facturado = acción facturar;
  · EN_PROCESO → Facturado = bloqueado;
  · CANCELADO → cualquiera = bloqueado 'no se puede reabrir';
  · EN_PROCESO → Entregado = bloqueado con enlace a Entregas;
  · LISTO_ENTREGA → Cancelado = acción cancelar.
- motivoTransicionPedido devuelve null cada vez que transicionesPedido permite el cambio (se recorre toda la tabla).
- reglaSoltarCotizacion:
  · con pedido vigente, todo bloqueado;
  · BORRADOR → Esperando = enviar;
  · RECHAZADA → Esperando = bloqueado;
  · RECHAZADA → Borrador = cambio;
  · PENDIENTE_CONFIRMACION → Borrador = confirmar, con 2 efectos;
  · cualquiera → Confirmada = bloqueado;
  · BORRADOR → Rechazada = rechazar.
- Cada código de ESTADOS_SC está en una sola columna de COLUMNAS_SC, salvo 'N/A_SOPORTE', que queda fuera del tablero.
- reglaSoltarSC:
  · ASIGNADA con productos → Pendiente = enviar;
  · BORRADOR → Pendiente = bloqueado 'asesor';
  · PENDIENTE_CONFIRMACION con asesor → Asignada = reiniciar, y → Nueva = bloqueado 'queda en Asignada';
  · CANCELADA → Nueva = bloqueado 'Papelera';
  · cualquiera → Confirmada = bloqueado.
NUEVO frontend/tests/test_estados_cotizacion.mjs: etiquetas, e infoEstadoCotizacion con un código desconocido sale humanizado.
Agregar los dos .mjs al script test. Además, `npx tsc --noEmit`.
MANUAL, con Playwright a 1440, 1024 y 390 px. En cada lista:
- cambiar a Kanban y recargar: se recuerda;
- buscar un cliente: las columnas se filtran;
- mover un pedido de En proceso a Listo;
- intentar sacar uno Entregado: la columna se apaga con el motivo;
- cancelar uno con motivo;
- enviar una cotización por WhatsApp desde el tablero.
```

**Comportamiento esperado:**

```text
- Las tres listas tienen las vistas Lista y Kanban, y cada una recuerda la última que usaste.
- El tablero pide al servidor cada columna (25 o 50 tarjetas, como la tabla) con lo que escribiste en la búsqueda. Así ve todos los documentos, no solo los 200 últimos, y el número de cada columna es el total real.
- Pedidos:
  · Columnas: Pendiente de compra, En proceso, Listo para entrega, Entregado, Facturado (plegada) y Cancelado (plegada).
  · Entre las tres primeras se arrastra libremente.
  · Un pedido entregado o cancelado no vuelve atrás; el tablero lo avisa antes de soltar.
  · Facturado: solo desde Entregado y con confirmación.
  · Entregado: se hace en Entregas.
  · Cancelado: pide motivo de mínimo 5 caracteres y avisa si se anula la orden de pago.
- Cotizaciones:
  · Columnas: Borrador, Esperando al cliente, Confirmada, Vencida y Rechazada (plegada).
  · Con un pedido activo no se mueve; el servidor respondería 409.
  · Enviar pide el canal y muestra el enlace.
  · Rechazar pide motivo y lo deja en la Actividad.
  · Sacar una cotización de 'Esperando' o de 'Confirmada' pide confirmar, porque anula el enlace o la confirmación del cliente.
- Solicitudes:
  · Columnas: Nueva, Asignada, Pendiente por confirmación, Confirmada y Cancelada (plegada).
  · No hay cambios de estado sueltos (U15): solo enviar, reiniciar (con su explicación) y cancelar con motivo.
  · Asignar el asesor o agregar productos se hace en la solicitud, y la tarjeta trae el enlace.
- Los tickets de Soporte no van al tablero: se ven en lista, en su pestaña.
- Si el servidor rechaza algo (409 o 422), la tarjeta vuelve y aparece su mensaje.
```

**Datos existentes:**

```text
No toca datos. Las SC que tienen estados heredados (COTIZADA, EN_ESPERA_CONFIRMACION, RECHAZADA o VENCIDA) se ven en la columna 'Confirmada' con su etiqueta. El script de U15 (Bloque 2) las ajusta.
```

**Riesgos:**

```text
- venta-client, cotizacion-client y solicitud-client tienen muchos dueños: Bloque 1 (T10 y T11), Bloque 2, y TABLA-ventas y KPI del Bloque 4. Hace falta un dueño por archivo y un orden. Este ítem toca la barra de pestañas, el conmutador y un bloque nuevo para el tablero.
- Si TABLA-ventas pasa la tabla a paginación en el servidor, comparte filtrar_por_estados y orden. Si no, la tabla sigue con sus 200 y el tablero va al servidor: con más de 200 documentos, los números de las pestañas y los de las columnas pueden no coincidir. El contador de la columna es el real.
- estados-cotizacion.js es una tercera fuente de etiquetas en el frontend, junto a estados-pedido.js y estados-solicitud.js. Si otro grupo del Bloque 4 crea la misma tabla, debe quedar una sola.
- Depende de que el ChannelModal reciba el canal (H27, Bloque 1 T8) y del modal de motivo de la lista de SC (T11). Si alguno falta, el tablero deja esa acción bloqueada con 'Hazlo desde el documento', en vez de inventar otro flujo.
- Las solicitudes en la Papelera (canceladas, con eliminada_at) cuentan en Cancelada, igual que en la pestaña Canceladas.
```

**Depende de:**

```text
- KANBAN-base (componentes y filtros_lista.py).
- KANBAN-hub-ventas, que crea kanban-ventas.js; si este ítem va primero, lo crea aquí.
- Bloque 1:
  · T7: resumen de H47 y pedidos_venta de COT-LISTA;
  · T8: ChannelModal con canal (H27);
  · T10: R8 en venta-client, H44 y H45;
  · T11: modal de motivo de SC y ESTADOS_SC_MANUALES;
  · T2: ETIQUETAS_ESTADO['COT'].
- Bloque 2: U15 (estados-solicitud.js, con PASOS_SC y el texto de Reiniciar) y H49 (useAvisos).
- Bloque 3, U16-seguimiento, para el chip. Es opcional.
- TABLA-ventas: comparte los mismos archivos y la misma barra de herramientas.
```

**Archivos que nombra el diseño:** `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_listas_kanban_ventas.py`, `backend/tests/test_estados_cotizacion_paridad.py`, `frontend/src/lib/kanban-ventas.js`, `frontend/src/lib/estados-cotizacion.js`, `frontend/tests/test_kanban_ventas.mjs`, `frontend/tests/test_estados_cotizacion.mjs`, `frontend/src/app/dashboard/ventas/venta/venta-client.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R27).


### KANBAN-compras — Kanban de pedidos de compra con reglas

**Grupo:** Kanban · **Esfuerzo:** L · **Tareas del plan:** T1C, T2, T12, T14, T15, T24

**Para el usuario:** Un pedido de compra solo cambia de estado por el camino correcto, desde cualquier pantalla.

**Lo que vio y aprobó el usuario:** Los pedidos de compra (PEC) se ven igual en el Hub de Compras y en Pedidos de Compra, con estas columnas: Borrador, Emitido, En tránsito, En bodega, Recibido y Cancelado.
Hoy se puede arrastrar un pedido a «Recibido» sin que la mercancía haya llegado; eso se acaba. A mano solo se puede emitir un borrador o cancelar un pedido, y para cancelar se pide el motivo. «En tránsito» lo marca el seguimiento del envío y «Recibido» lo marca la recepción en bodega. Si sueltas un pedido en esas columnas, el tablero te dice dónde se hace y te da el enlace.
La columna «En bodega» junta los pedidos que ya llegaron pero a los que les falta confirmar la recepción o recibir el resto.
Estas reglas también valen para el botón «Estado» del pedido, el menú de cada fila y la cancelación de varios a la vez. El sistema las hace cumplir aunque alguien intente saltárselas. Los estados salen con tildes y con nombres claros.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- Al cancelar un pedido de compra (PEC), ¿se pide el motivo? → **Sí, obligatorio (mínimo 5 letras), igual que en ventas; queda en la Actividad** (= recomendada)
- ¿Se puede cancelar un pedido de compra que ya está en tránsito pero todavía no tiene recepción en bodega? → **Sí, mientras no tenga recepciones en bodega (como hoy)** (= recomendada)

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** «Con 'No' en la pregunta pec_cancelar_en_transito» y «CANCELADO desde tránsito (si la respuesta fue 'No')» → NO: pec_cancelar_en_transito = «Sí, mientras no tenga recepciones en bodega (como hoy)». Su prueba 4 «test_cancelar_exige_motivo (si la respuesta es 'Sí')» → SÍ: pec_motivo_cancelacion = «Sí, obligatorio (mínimo 5 letras), igual que en ventas; queda en la Actividad». estados_pec.py → core/estados_compras.py (R27).

**Cambios (diseño):**

```text
BACKEND
1) backend/app/core/textos_actividad.py: nuevo ETIQUETAS_ESTADO['PEC']:
- BORRADOR 'Borrador', EMITIDO 'Emitido', ENVIADO 'Enviado al proveedor', EN_TRANSITO 'En tránsito' y PENDIENTE_ENTREGA 'Pendiente de entrega'.
- RECIBIDO 'Llegó a bodega', PARCIALMENTE_RECIBIDA 'Recibido parcialmente', RECIBIDA 'Recibido', COMPLETADO 'Completado' y CANCELADO 'Cancelado'.
2) NUEVO backend/app/core/estados_pec.py, con el mismo patrón que estados_pedido.py (datos inmutables, sin FastAPI ni DB):
- ESTADOS_PEC_MANUALES = ('EMITIDO', 'CANCELADO').
- TRANSICIONES_PEC_PATCH (MappingProxyType):
  · BORRADOR → {EMITIDO, CANCELADO};
  · EMITIDO, ENVIADO, EN_TRANSITO y PENDIENTE_ENTREGA → {CANCELADO}. Con 'No' en la pregunta pec_cancelar_en_transito, EN_TRANSITO y PENDIENTE_ENTREGA → frozenset();
  · RECIBIDO, PARCIALMENTE_RECIBIDA, RECIBIDA, COMPLETADO y CANCELADO → frozenset().
- ESTADOS_POR_FLUJO, para armar el mensaje: EN_TRANSITO y PENDIENTE_ENTREGA → 'seguimiento'; RECIBIDO, PARCIALMENTE_RECIBIDA, RECIBIDA y COMPLETADO → 'recepcion'.
- destinos_pec_permitidos(estado): un estado desconocido se trata como EMITIDO, es decir {CANCELADO}.
3) backend/app/api/v1/erp_compras.py, update_pec: llama `_validar_transicion_pec(db, p, body)` antes del loop de campos, así que si falla no se guarda nada. Solo actúa si body['estado'] existe y es distinto del actual.
- Destino que pone el flujo → 422:
  · «'En tránsito' lo marca el seguimiento del envío (Mercancía en tránsito).»
  · «'Recibido' lo marca la recepción en bodega (Recepciones).»
- Otro destino que no es manual → 422 ««X» no es un estado válido para un pedido de compra.».
- Destino no permitido desde el estado actual → 422:
  · desde CANCELADO: «El pedido de compra {numero} está cancelado y no se puede reabrir.»
  · desde los estados de recepción: «El pedido de compra {numero} ya llegó a bodega: su estado lo lleva la recepción.»
  · EMITIDO desde algo distinto de BORRADOR: «Solo un pedido en Borrador se puede marcar como Emitido.»
  · CANCELADO desde tránsito (si la respuesta fue 'No'): «Un pedido en tránsito no se cancela: espera la recepción o habla con el proveedor.»
- CANCELADO cuando el PEC tiene recepciones (goods_receipts) → 409 «{numero} tiene N recepción(es) en bodega: no se puede cancelar.».
- Motivo de CANCELADO: motivo = str(body.get('motivo') or '').strip(). Con 'Sí' en pec_motivo_cancelacion y menos de 5 caracteres → 422 «Indica el motivo de la cancelación (mínimo 5 caracteres).».
- El _log ESTADO_CHANGED pasa a f'Estado cambiado a {etiqueta_estado("PEC", p.estado)}', más f'. Motivo: {motivo}' si lo hay. user_name = body.updated_by o el email del usuario.
- 'motivo' no es una columna: queda en la Actividad, sin migración.
4) list_pec: filtrar_por_estados, orden y limit con ge=0 (KANBAN-base).
FRONTEND
5) NUEVO frontend/src/lib/estados-compras.js (JS puro), espejo de lo anterior:
- ESTADOS_PEC {codigo: {label, clases}} con las etiquetas de arriba y las clases que hoy usa compras/pedidos. infoEstadoPec(e), con un respaldo humanizado en gris.
- TRANSICIONES_PEC_PATCH, ESTADOS_PEC_MANUALES y transicionesPec(e), como espejo del backend.
- COLUMNAS_PEC:
  · Borrador (BORRADOR);
  · Emitido (EMITIDO y ENVIADO);
  · En tránsito (EN_TRANSITO y PENDIENTE_ENTREGA);
  · En bodega (RECIBIDO y PARCIALMENTE_RECIBIDA);
  · Recibido (RECIBIDA y COMPLETADO; cerrada);
  · Cancelado (CANCELADO; cerrada).
  Con columnaPec(e).
- reglaSoltarPec(pec, origen, destino):
  · → Emitido: cambio a EMITIDO, solo desde BORRADOR.
  · → Cancelado: acción 'cancelar', si transicionesPec lo permite.
  · → En tránsito: bloqueado 'El tránsito se marca al iniciar el seguimiento del envío.', con enlace 'Ir a Mercancía en tránsito' (/dashboard/compras/transito).
  · → En bodega o Recibido: bloqueado 'Lo marca la recepción en bodega.', con enlace 'Ir a Recepciones'.
  · → Borrador: bloqueado 'Un pedido emitido no vuelve a Borrador.'
  · Desde Cancelado: bloqueado 'Está cancelado y no se puede reabrir.'
6) compras/pedidos/page.tsx:
- Se quitan getKanbanCol, handleDragStart, handleDrop y el bloque KANBAN (hoy l.1421-1440 y l.1798-1833).
- Tablero en modo servidor con /compras/pedidos?estado=…&search&limit&offset&orden (el endpoint ya devuelve total). Conmutador con useVistaGuardada('compras.pedidos').
- onCambio: PATCH {estado: 'EMITIDO', updated_by}.
- onAccion 'cancelar' → ModalMotivo → PATCH {estado: 'CANCELADO', motivo, updated_by}. Los efectos repiten lo que ya hace _desvincular_pec_cancelado: 'Los pedidos de venta vinculados vuelven a Pendiente de compra' y 'Los productos vuelven a la Lista de compras'.
- tarjetaDe:
  · numero; titulo = proveedor; subtitulo = PVEN vinculado; monto;
  · chips 'Vencido' (is_overdue) y 'Falta por recibir' (PARCIALMENTE_RECIBIDA);
  · tiempo 'Entrega dd mmm'.
- accionPrincipal en la columna 'En bodega': 'Recepcionar' → /dashboard/compras/recepciones, o el flujo de crear recepción desde el PEC si el panel lo tiene.
- Las mismas reglas se aplican en el resto de la pantalla; si no, esas acciones darían 422:
  · el botón 'Estado' del panel de detalle (changeEstado, l.550) ofrece solo transicionesPec(estado), y cancelar abre ModalMotivo;
  · 'Marcar Emitido' del menú de fila (l.1498) aparece solo en BORRADOR;
  · 'Cancelar PEC' (l.1502) y la cancelación masiva (l.1365) abren ModalMotivo. La masiva usa un motivo para todos, los procesa en serie y reporta los que fallan con su mensaje, sin .catch(() => {}).
7) compras/page.tsx (Hub de Compras, máxima protección):
- El mismo tablero, en modo cliente sobre filteredData, con 6 columnas en vez de 4 y las mismas reglas y acciones.
- Se quitan getKanbanCol y handleDrop (l.488-502) y el bloque Kanban (l.1214-1250). Los botones List/LayoutGrid pasan a ConmutadorVista('compras.hub').
- Igual que en Pedidos:
  · PecDetailPanel.changeEstado (l.66) ofrece solo transicionesPec;
  · cancelar (l.75), la cancelación masiva (l.421) y el menú de fila (l.538) abren ModalMotivo.
- PEC_ESTADOS locales (l.30-39) se reemplazan por ESTADOS_PEC. Con eso, RECIBIDA y PARCIALMENTE_RECIBIDA dejan de pintarse como 'Borrador'.
```

**Pruebas (diseño):**

```text
BACKEND, con el runner de ROLLBACK.
NUEVO backend/tests/test_pec_transiciones.py, con el estilo de test_pendiente_compra_lista_pec.py (el PEC se crea por la API o por ORM con db.add):
1) test_borrador_se_emite: PATCH {estado: 'EMITIDO'} → 200, y la Actividad dice 'Estado cambiado a Emitido'.
2) test_en_transito_y_recibido_no_se_ponen_a_mano: desde EMITIDO, PATCH EN_TRANSITO → 422 con 'seguimiento' y PATCH RECIBIDO → 422 con 'recepción'. Tras db.refresh sigue EMITIDO.
3) test_emitido_no_vuelve_a_borrador: → 422.
4) test_cancelar_exige_motivo (si la respuesta es 'Sí'):
- sin motivo → 422; con 'abc' → 422;
- con 'El proveedor no tiene stock' → 200. La Actividad incluye el motivo y el PVEN vinculado vuelve a PENDIENTE_COMPRA (lo que ya hace _desvincular_pec_cancelado).
5) test_no_se_cancela_con_recepciones: un PEC con un GoodsReceipt → 409 con 'recepción'.
6) test_cancelado_no_se_reabre: PATCH EMITIDO sobre un CANCELADO → 422 con 'no se puede reabrir'.
7) test_mismo_estado_y_otros_campos_siguen_libres: PATCH {estado: actual, notas: 'x'} → 200, y un PATCH solo de fecha_entrega_estimada sigue registrando FECHA_ENTREGA_MODIFICADA.
8) test_el_seguimiento_sigue_poniendo_transito_y_recibido: PATCH /tracking con una etapa EN_PROCESO deja EN_TRANSITO, y completar la última etapa deja RECIBIDO. Ese camino no pasa por la validación nueva.
9) test_lista_pec_varios_estados: GET /compras/pedidos?estado=RECIBIDO,PARCIALMENTE_RECIBIDA trae los dos.
NUEVO backend/tests/test_estados_pec.py:
- tablas puras: los cerrados no tienen salida, CANCELADO solo desde los permitidos, EMITIDO solo desde BORRADOR;
- paridad con estados-compras.js por node, como test_estados_pedido.py.
AJUSTAR backend/tests/test_pendiente_compra_lista_pec.py, l.97 y l.132: el PATCH {estado: 'CANCELADO'} debe mandar un 'motivo' de más de 5 caracteres.
Correr cada módulo: cd <worktree>/backend && C:/Users/jmqui/Nebulae_ERP_Work/Mirror/backend/venv/Scripts/python.exe tests/rollback_runner.py test_pec_transiciones. Igual con test_estados_pec y test_pendiente_compra_lista_pec; y, como regresión, con test_mercancia_transito, test_pec_tracking_update y test_fecha_entrega_actividad_log_pec.
FRONTEND. NUEVO frontend/tests/test_estados_compras.mjs:
- cada estado de ESTADOS_PEC está en una sola columna;
- RECIBIDA y PARCIALMENTE_RECIBIDA ya no caen en Borrador;
- reglaSoltarPec: BORRADOR → Emitido = cambio; EMITIDO → En tránsito = bloqueado con enlace; RECIBIDO → Cancelado = bloqueado; EN_TRANSITO → Cancelado según la tabla; CANCELADO → Emitido = bloqueado.
Agregar al script test. Además, `npx tsc --noEmit`.
MANUAL:
- arrastrar un borrador a Emitido;
- intentar soltar en Recibido: la columna se apaga y muestra el enlace;
- cancelar desde el menú de fila y desde la barra masiva, con motivo.
```

**Comportamiento esperado:**

```text
- Columnas de los dos tableros: Borrador · Emitido · En tránsito · En bodega · Recibido (plegada) · Cancelado (plegada).
- 'En bodega' son los pedidos que ya llegaron pero a los que les falta confirmar la recepción o recibir lo que falta. Es la columna de trabajo de bodega.
- A mano solo se puede:
  · pasar de Borrador a Emitido;
  · cancelar, con motivo según la pregunta, mientras el pedido no tenga recepciones (y, según la otra pregunta, mientras no esté en tránsito).
- En tránsito y Recibido no se ponen a mano en ninguna pantalla: los pone el seguimiento (update_tracking) y la recepción (confirmar recepción). Si alguien lo intenta por la API, recibe un 422 con un mensaje que dice dónde se hace.
- Un pedido cancelado no se reabre, y uno con recepciones no se cancela (409).
- Las mismas reglas valen en el tablero, el botón Estado, el menú de fila y la cancelación masiva. Ningún error se traga: siempre se ve el mensaje del servidor.
- La Actividad del PEC dice 'Estado cambiado a Emitido' o 'Estado cambiado a Cancelado. Motivo: …', con el nombre de quien lo hizo.
```

**Datos existentes:**

```text
Sin migración ni cambio de datos. Los PEC que hoy están en RECIBIDO sin recepción física (por ejemplo, porque alguien los arrastró a 'Recibido') aparecen en 'En bodega', que es justo donde deben recepcionarse. Consulta informativa, de solo lectura: SELECT p.numero, p.estado FROM purchase_orders_full p WHERE p.estado='RECIBIDO' AND NOT EXISTS (SELECT 1 FROM goods_receipts g WHERE g.pec_id=p.id);
```

**Riesgos:**

```text
- Cambia el comportamiento de pantallas de Compras que hoy cambian el estado libremente. Hay que tocar todos los puntos listados, o darán 422: 2 tableros, 2 paneles de detalle, 2 menús de fila y 2 cancelaciones masivas. Revisado con grep: no hay otros PATCH de estado de PEC en el frontend. purchases.py y legacy_consolidation escriben RECIBIDA directamente, sin pasar por el PATCH.
- compras/page.tsx tiene // @ts-nocheck y está en máxima protección: solo se reemplazan los bloques nombrados.
- Hay dos paneles de detalle de PEC (Hub y Pedidos) y tres tablas de etiquetas (Hub, Pedidos y pedidos/[id]). Este ítem deja una sola fuente, estados-compras.js, que usan los dos tableros y los dos paneles. pedidos/[id], una página casi huérfana, puede quedar para otro grupo.
- Hoy ningún código pone ENVIADO ni PENDIENTE_ENTREGA; esos estados solo existen en datos viejos.
- El motivo vive en la Actividad, no en una columna. Si luego se quiere un reporte de motivos de cancelación de compras, hará falta una columna (migración aditiva).
```

**Depende de:**

```text
- KANBAN-base (tablero, ModalMotivo y filtros_lista.py).
- Bloque 1: T2 (textos_actividad.etiqueta_estado) y T0 (runner).
- Bloque 2, H49 (useAvisos), para quitar los confirm() nativos de esas acciones.
- Coordinar con el grupo del Bloque 4 que unifique las etiquetas y las tablas de Compras: estados-compras.js debe ser la única fuente.
```

**Archivos que nombra el diseño:** `backend/app/core/textos_actividad.py`, `backend/app/core/estados_pec.py`, `backend/app/api/v1/erp_compras.py`, `backend/tests/test_pec_transiciones.py`, `backend/tests/test_estados_pec.py`, `backend/tests/test_pendiente_compra_lista_pec.py`, `frontend/src/lib/estados-compras.js`, `frontend/tests/test_estados_compras.mjs`, `frontend/src/app/dashboard/compras/pedidos/page.tsx`, `frontend/src/app/dashboard/compras/page.tsx`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R27).


### KANBAN-logistica — Kanban de tránsito, recepciones, entregas y bodega

**Grupo:** Kanban · **Esfuerzo:** L · **Tareas del plan:** T2, T3C, T6B, T12, T16A, T16B, T19

**Para el usuario:** Bodega y logística ven su trabajo por etapas y solo pueden avanzar en el orden correcto.

**Lo que vio y aprobó el usuario:** Mercancía en tránsito se puede ver como un tablero con las etapas del envío: Pendiente despacho, Proveedor → Casillero, Casillero → Bodega, Proveedor → Bodega y Recibido. Arrastrar un pedido a la etapa siguiente la marca como completada, igual que el botón. No se pueden saltar etapas ni devolverse, y un envío directo no pasa por el casillero.
Entregas se ve en cuatro columnas: Esperando mercancía, Listo pero falta saldo, Listo para despachar y Despachado. Soltar en «Despachado» abre la ventana para elegir la bodega. Si falta cobrar, el tablero te dice cuánto. Los pedidos cancelados ya no aparecen en Entregas.
Recepciones, Lista de compras y Traslados tienen un tablero solo para ver, porque su estado lo pone el proceso: contar la mercancía, crear el pedido o mover el inventario. Cada tarjeta te lleva al lugar donde se hace.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- En Mercancía en tránsito, ¿arrastrar un pedido a la etapa siguiente la marca como completada? → **Sí, solo hacia la etapa siguiente; queda en la Actividad igual que con el botón «Completar»** (= recomendada)
- ¿Quién puede marcar un pedido como Despachado en Entregas? (Hoy el sistema rechaza al rol Bodega, que es quien usa Entregas.) → **También Bodega, eligiendo la bodega de salida** (= recomendada)

**Cambios (diseño):**

```text
FRONTEND
1) NUEVO frontend/src/lib/transito.js (JS puro):
- columnasDeEtapas(config) → columnas, a partir de GET /compras/tracking-config ({casillero: [...], directo: [...]}):
  · une las etapas activas por 'key', conservando el orden de cada tipo de envío;
  · con la configuración por defecto quedan PENDIENTE_DESPACHO, PROVEEDOR_CASILLERO, CASILLERO_BODEGA, PROVEEDOR_BODEGA y RECIBIDO;
  · titulo = el label de la primera configuración que tiene la etapa, con tildes (por ejemplo 'Proveedor → Casillero').
- etapaActual(pec) = la primera de pec.tracking_stages con status distinto de COMPLETADO (hoy es currentStageOf, dentro de la pantalla). columnaTransito(pec) = el 'stage' de esa etapa.
- reglaSoltarTransito(pec, origen, destino):
  · destino = la etapa siguiente de ese mismo pedido → {tipo: 'cambio', estado: 'COMPLETADO', cuerpo: {stage: actual}}, que completa la etapa actual;
  · destino que no está en su tipo de envío → bloqueado 'Este pedido va por envío {directo|casillero}: no pasa por «X».';
  · destino más adelante → bloqueado 'Las etapas se completan en orden: primero «X».';
  · destino anterior → bloqueado 'Una etapa completada no se deshace desde aquí.';
  · origen RECIBIDO (la etapa final) → bloqueado 'Ya llegó: confírmalo en Recepciones.', con enlace.
2) compras/transito/page.tsx:
- ConmutadorVista con useVistaGuardada('compras.transito'), y GET /compras/tracking-config al cargar.
- Tablero en modo cliente sobre la misma lista filtrada de hoy: excluye BORRADOR, CANCELADO y los recibidos, y aplican 'Solo vencidos' y la búsqueda.
- onCambio = PATCH /compras/pedidos/{id}/tracking {stage, status: 'COMPLETADO', user_name}, el mismo de updateTracking.
- accionPrincipal de la tarjeta = 'Iniciar' o 'Completar' de la etapa actual, como el botón de la tabla.
- Chips 'Vencido' y 'Directo' o 'Casillero'. Tiempo: 'Entrega en N días' o 'Vencido hace N días'.
- updateTracking deja de tragarse los errores: usa avisarError.
3) NUEVO frontend/src/lib/entregas.js (JS puro):
- columnaEntrega(p):
  · CANCELADO o DEVUELTO_TOTAL → null (no se muestran);
  · ENTREGADO, FACTURADO o PARCIALMENTE_ENTREGADO → 'despachado';
  · paso 2 en estados-pedido (LISTO_ENTREGA, DISPONIBLE, PENDIENTE_SALDO o LISTO_PARA_ENTREGA) → 'listo' si saldo_cop ≤ 0, o 'falta_saldo' si es mayor que 0;
  · el resto → 'esperando'.
- COLUMNAS_ENTREGA: Esperando mercancía · Listo, falta saldo · Listo para despachar · Despachado (cerrada).
- reglaSoltarEntrega(p, origen, destino):
  · → Despachado: acción 'despachar', solo desde 'listo'. Desde 'falta_saldo': bloqueado `Falta cobrar el saldo de ${fCOP(saldo)} antes de despachar.` Desde 'esperando': bloqueado 'La mercancía todavía no está lista para entrega.'
  · → 'listo' o 'falta_saldo' desde 'esperando': cambio a LISTO_ENTREGA, si transicionesPedido lo permite. La tarjeta queda en la columna que le toca según su saldo.
  · Salir de Despachado: bloqueado con motivoTransicionPedido.
4) inventario/entregas/page.tsx:
- ConmutadorVista('inventario.entregas'). Tablero en modo cliente sobre los pedidos cargados, con la búsqueda.
- onAccion 'despachar' → abre el Drawer que ya existe (productos y selector de bodega). Su botón hace PATCH {estado: 'ENTREGADO', warehouse_id}, con confirmar de useAvisos en vez de window.confirm.
- onCambio con LISTO_ENTREGA → PATCH /ventas/pedidos/{id}.
- Para cargar menos, la consulta pasa a /ventas/pedidos?estado=<operativos, LISTO…, ENTREGADO, FACTURADO>&limit=200, con filtrar_por_estados (KANBAN-ventas-listas).
- Tarjeta: PVEN, cliente, ítems, total, chip 'Saldo $X' o 'Pagado' y botón de WhatsApp (lib/whatsapp.js, Bloque 1 H5).
5) Tableros solo para ver: sin regla, con soloLectura y su motivo. El clic abre lo mismo que hoy abre la fila.
- compras/recepciones/page.tsx, e inventario/recepciones/page.tsx si no se retira por duplicada:
  · estados-compras.js agrega ESTADOS_RECEPCION (BORRADOR 'Por contar', COMPLETADA 'Recibida', COMPLETADA_LOGISTICA 'Solo registro logístico', CANCELADA 'Cancelada') y COLUMNAS_RECEPCION;
  · modo servidor con /compras/recepciones (list_recepciones con filtrar_por_estados y orden);
  · motivo de solo lectura: 'Las recepciones se confirman contando la mercancía.';
  · accionPrincipal en 'Por contar': 'Contar y confirmar' → /dashboard/compras/recepciones/{id};
  · chip 'Retraso N días', con dias_retraso (_gr_dict ya lo trae).
- compras/lista-compras/page.tsx:
  · ESTADOS_ITEM_LISTA (PENDIENTE 'Pendiente', EN_PEDIDO 'En pedido', RECIBIDO 'Recibido'; DESCARTADO no se muestra) y COLUMNAS_LISTA;
  · modo cliente, con lo que ya carga (el endpoint no pagina);
  · motivo: 'Pasa a En pedido al crear el pedido de compra y a Recibido con la recepción.';
  · el clic abre el PVEN o el PEC vinculado.
- compras/traslados/page.tsx, e inventario/traslados/page.tsx si no se retira:
  · ESTADOS_TRASLADO (DRAFT 'Borrador', READY 'Listo', DONE 'Hecho', CANCELLED 'Cancelado') y COLUMNAS_TRASLADO;
  · modo cliente;
  · motivo: 'Los traslados no cambian de estado desde aquí.';
  · el clic abre el Drawer que ya existe.
BACKEND
6) erp_compras.py, list_recepciones: filtrar_por_estados, orden y limit con ge=0. No hay más cambios de backend: tránsito sigue usando PATCH /tracking como hoy, y entregas, PATCH /ventas/pedidos.
```

**Pruebas (diseño):**

```text
FRONTEND (node)
NUEVO frontend/tests/test_transito.mjs:
- columnasDeEtapas con la configuración por defecto → claves en este orden: PENDIENTE_DESPACHO, PROVEEDOR_CASILLERO, CASILLERO_BODEGA, PROVEEDOR_BODEGA, RECIBIDO. Las etapas inactivas quedan fuera.
- etapaActual con todas las etapas completadas → null.
- reglaSoltarTransito:
  · un envío por casillero en PROVEEDOR_CASILLERO → CASILLERO_BODEGA = cambio;
  · el mismo → RECIBIDO = bloqueado 'en orden';
  · un envío directo → CASILLERO_BODEGA = bloqueado 'no pasa por';
  · → PENDIENTE_DESPACHO = bloqueado 'no se deshace'.
NUEVO frontend/tests/test_entregas.mjs:
- columnaEntrega: CANCELADO → null; LISTO_ENTREGA con saldo 0 → listo; con saldo 1000 → falta_saldo; EN_TRANSITO → esperando; FACTURADO → despachado.
- reglaSoltarEntrega:
  · listo → Despachado = despachar;
  · falta_saldo → Despachado = bloqueado, con el monto en pesos;
  · esperando → Listo = cambio a LISTO_ENTREGA.
test_estados_compras.mjs agrega: cada estado de recepción, de ítem de lista y de traslado está en una sola columna.
Agregar al script test. Además, `npx tsc --noEmit`.
BACKEND: en test_pec_transiciones.py, o en un archivo nuevo test_recepciones_kanban.py:
- GET /compras/recepciones?estado=BORRADOR,COMPLETADA_LOGISTICA trae las dos;
- limit=0 devuelve solo el total.
Regresión: test_mercancia_transito y test_pec_tracking_update, con el runner de ROLLBACK.
MANUAL:
- arrastrar un PEC por casillero a la etapa siguiente y revisar la Actividad;
- intentar saltar una etapa;
- despachar desde Entregas eligiendo la bodega;
- intentar despachar un pedido con saldo pendiente.
```

**Comportamiento esperado:**

```text
- Tránsito:
  · una columna por etapa, y cada pedido está en la etapa que le falta completar;
  · solo se arrastra a la etapa siguiente, y eso equivale a 'Completar' (en la Actividad queda 'Etapa X -> COMPLETADO');
  · iniciar una etapa se hace con el botón de la tarjeta;
  · al completar la última etapa de transporte, la tarjeta pasa a 'Recibido', donde espera la recepción. Completar 'Recibido' se sigue haciendo con el botón de hoy.
- Entregas:
  · columnas: Esperando mercancía · Listo, falta saldo · Listo para despachar · Despachado;
  · despachar solo desde 'Listo para despachar', y pide la bodega;
  · los pedidos cancelados no aparecen.
- Recepciones, Lista de compras y Traslados: el tablero es para ver y abrir. Si intentas arrastrar, te dice por qué no se puede y dónde se hace.
- En todos los tableros aplican la búsqueda y los filtros de la pantalla, y los contadores muestran '…' mientras carga.
```

**Datos existentes:**

```text
No toca datos.
```

**Riesgos:**

```text
- PATCH /ventas/pedidos solo lo permite a ADMIN y ASESOR. Por eso un usuario de BODEGA hoy no puede despachar desde Entregas (403), y tampoco podrá desde el tablero. Se muestra el mensaje del servidor; arreglar el permiso (por ejemplo, con un endpoint de despacho para bodega) es otro ítem.
- update_tracking no valida el orden de las etapas. El tablero sí lo respeta, pero el panel de seguimiento de compras/pedidos sigue dejando completar cualquier etapa. No se agrega una guarda en el servidor, para no romper ese panel.
- Las etapas son configurables: si alguien renombra o agrega etapas, las columnas cambian solas. Un PEC viejo con una etapa que ya no está en la configuración se sigue viendo; su columna se agrega al final.
- Recepciones y Traslados tienen pantallas duplicadas en Inventario. Si otro grupo retira una, este ítem se aplica solo a la que quede.
- 'Registrar cobro de saldo' (un PATCH de saldo_cop a 0 sin registrar el pago) no se toca: choca con R9 y TD-05.
```

**Depende de:**

```text
- KANBAN-base y KANBAN-compras (estados-compras.js).
- KANBAN-ventas-listas: filtrar_por_estados en /ventas/pedidos, y kanban-ventas.js para motivoTransicionPedido.
- Bloque 1: estados-pedido.js (transicionesPedido y pasos), H5 (lib/whatsapp.js) y N2 (reglas del PATCH del pedido).
- Bloque 2, H49 (useAvisos), para reemplazar window.confirm en el despacho.
```

**Archivos que nombra el diseño:** `frontend/src/lib/transito.js`, `frontend/src/lib/entregas.js`, `frontend/src/lib/estados-compras.js`, `frontend/tests/test_transito.mjs`, `frontend/tests/test_entregas.mjs`, `frontend/tests/test_estados_compras.mjs`, `frontend/src/app/dashboard/compras/transito/page.tsx`, `frontend/src/app/dashboard/inventario/entregas/page.tsx`, `frontend/src/app/dashboard/compras/recepciones/page.tsx`, `frontend/src/app/dashboard/inventario/recepciones/page.tsx`, `frontend/src/app/dashboard/compras/lista-compras/page.tsx`, `frontend/src/app/dashboard/compras/traslados/page.tsx`, `frontend/src/app/dashboard/inventario/traslados/page.tsx`, `backend/app/api/v1/erp_compras.py`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R27).


### KANBAN-crm — CRM con el tablero común y sin leads perdidos de vista

**Grupo:** Kanban · **Esfuerzo:** M · **Tareas del plan:** T3C, T20, T21, T24

**Para el usuario:** Todos ven completo el embudo de leads, y se mueve igual que los demás tableros.

**Lo que vio y aprobó el usuario:** El CRM sigue abriendo en Kanban, ahora con el mismo tablero del resto del sistema. Cada etapa lleva su color, la suma del valor de sus leads y el botón «Agregar lead» al pie, y lo atrasado sale primero. Además se corrigen tres cosas. Un asesor ya puede ver el tablero aunque no sea administrador. Los leads que pasan a «Perdido» siguen en esa columna (plegada) en vez de desaparecer al recargar. Y los leads sin etapa ya no quedan invisibles. Si un movimiento falla, la tarjeta vuelve a su lugar y ves el mensaje; hoy ese aviso no se muestra. Los leads que vienen de una solicitud muestran la marca «Con solicitud».

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- Un lead que viene de una solicitud se mueve solo cuando la solicitud avanza. ¿Se puede mover también a mano en el tablero del CRM? → **Sí, libre como hoy; cuando la solicitud cambie, el sistema lo vuelve a mover** (= recomendada)

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** «si la respuesta a la pregunta es 'No' y el lead tiene sc_id → bloqueado» → NO: crm_lead_con_solicitud = «Sí, libre como hoy; cuando la solicitud cambie, el sistema lo vuelve a mover» (R11). De «reglaSoltarLead, en las dos variantes de la respuesta» solo se implementa y se prueba la libre.

**Cambios (diseño):**

```text
BACKEND: backend/app/api/v1/crm.py
1) get_leads (l.1184): nuevo parámetro `perdidos: str = 'excluir'`. Valores:
- 'excluir': el comportamiento de hoy (status != CANCELLED). Es el valor por defecto.
- 'incluir'.
- 'solo': status == CANCELLED.
- Cualquier otro valor → 422.
Los demás que llaman /crm/leads (asistente_omnicanal y crm/calendario) no cambian.
2) _lead_to_dict agrega 'sc_id': order.canonical_customer_request_id.
FRONTEND: crm/page.tsx (máxima protección; solo se tocan los bloques nombrados)
3) Carga (l.258-290):
- Las etapas salen de /crm/pipeline-stages, que responde a todos los roles, y no de /pipeline-stages/config, que es solo para ADMIN. Se conserva la caché 'crm_stages_v1' como respaldo. /config queda solo para el panel de configuración del administrador.
- Los leads activos se cargan como hoy.
- En paralelo, /crm/leads?perdidos=solo&limit=50 llena la columna Perdido; su total es el contador.
4) NUEVO frontend/src/lib/crm-etapas.js (JS puro):
- COLOR_HEX y BG_HEX se mudan aquí.
- columnasDesdeEtapas(stages) → columnas {clave: String(id), titulo: name, colorHex, cerrada}. cerrada es true si is_closed, o si maps_to_status es CANCELLED o INVOICED.
- columnaDeLead(lead, stages): su pipeline_stage_id, si existe en stages; si no, la etapa cuyo maps_to_status es igual a lead.status; si tampoco, la primera. Hoy esos leads no aparecen en ninguna columna.
- esLeadAtrasado(lead, stage) = lead.days ≥ (stage.alert_days ?? 7).
- reglaSoltarLead(lead, origen, destino):
  · libre entre etapas;
  · si la respuesta a la pregunta es 'No' y el lead tiene sc_id → bloqueado 'Este lead sigue a su solicitud: se mueve solo cuando cambia la solicitud.'
5) Se reemplaza el arrastre propio de la pantalla:
- se quitan onCardPointerDown/Move/Up/Cancel y getStageAtPoint (l.472-580), el clon flotante (l.838-870) y el bloque KANBAN VIEW (l.~876-976);
- en su lugar va useTableroKanban (modo cliente, porColumna 25) + TableroKanban, con:
  · renderTarjeta = LeadCard, sin sus manejadores de puntero;
  · resumenColumna = formatCOP de la suma de value;
  · pieColumna = el botón 'Agregar lead' de hoy;
  · regla = reglaSoltarLead;
  · onCambio = PATCH /crm/leads/{id}/stage {pipeline_stage_id}.
6) El selector de 3 vistas (Kanban, Lista, Análisis) se conserva, con los mismos íconos del ConmutadorVista. Guarda la vista con useVistaGuardada('crm.leads', 'kanban').
7) LeadCard muestra el chip 'Con solicitud' si tiene sc_id, y 'Atrasado' si esLeadAtrasado.
```

**Pruebas (diseño):**

```text
BACKEND. NUEVO backend/tests/test_crm_kanban.py, con el runner de ROLLBACK:
1) test_asesor_lee_las_etapas: GET /crm/pipeline-stages con vendedor_token → 200 y una lista no vacía.
2) test_leads_perdidos: crear un lead activo y uno CANCELLED del mismo cliente.
- Sin parámetro → solo el activo.
- perdidos=solo → solo el CANCELLED.
- perdidos=incluir → los dos.
- perdidos=x → 422.
3) test_lead_trae_sc_id: un lead con canonical_customer_request_id → el dict trae sc_id.
FRONTEND. NUEVO frontend/tests/test_crm_etapas.mjs:
- columnasDesdeEtapas marca como cerradas CANCELLED e INVOICED;
- columnaDeLead: con pipeline_stage_id → esa etapa; sin etapa y con status QUOTATION → la etapa con maps_to_status QUOTATION; sin nada → la primera;
- esLeadAtrasado con alert_days ausente usa 7;
- reglaSoltarLead, en las dos variantes de la respuesta.
Agregar al script test. Además, `npx tsc --noEmit`.
MANUAL:
- entrar como asesor sin caché (borrar 'crm_stages_v1') y ver que el tablero carga;
- mover un lead a Perdido, recargar y verlo en esa columna;
- cortar la red al mover y ver el mensaje.
```

**Comportamiento esperado:**

```text
- Las columnas son las etapas configuradas, en su orden y con su color. Ganado y Perdido, o las que estén marcadas como cerradas, salen plegadas.
- Mover un lead entre etapas es libre, porque las etapas las define el administrador; la excepción es lo que diga la pregunta para los leads con solicitud. El servidor copia el status de la etapa, como hoy.
- Si el movimiento falla, la tarjeta vuelve con el mensaje. Hoy react-hot-toast no tiene un <Toaster/> montado y el aviso nunca se ve.
- Un ASESOR ve el tablero aunque no tenga las etapas en caché. Hoy recibe 403 de /config y el CRM no carga, ni siquiera los leads.
- La columna Perdido muestra los 50 más recientes y el total real.
- Las acciones 'Ganar' y 'Perder' del detalle no cambian.
```

**Datos existentes:**

```text
No toca datos. Consulta informativa, de solo lectura, para ver cuántos leads no aparecen hoy por no tener etapa: SELECT COUNT(*) FROM sales_orders WHERE pipeline_stage_id IS NULL AND status <> 'CANCELLED';
```

**Riesgos:**

```text
- crm/page.tsx tiene // @ts-nocheck y está en máxima protección. Se reemplazan unas 250 líneas de 1517, menos del 30 %.
- Hallazgo FUERA de alcance: la tabla pipeline_stages no tiene las columnas alert_days, alert_message ni is_closed. PUT /pipeline-stages/{id}/config hace setattr sobre un atributo que no se guarda, así que los días de alerta por etapa vuelven a 7 después de cada recarga. El tablero usa 7 cuando no hay valor. Arreglarlo requiere una migración aditiva, en una tarea aparte.
- Hallazgo FUERA de alcance: solicitud/[id]/page.tsx l.239 manda {stage_id} a PATCH /crm/leads/{id}/stage, pero el backend lee pipeline_stage_id. Responde 404 y el .catch se lo traga, así que ese movimiento automático del lead nunca ocurre.
- La columna Perdido hace una consulta más, limitada a 50 leads.
```

**Depende de:**

```text
- KANBAN-base.
- Bloque 2, H49 (useAvisos montado en el layout), para que los errores se vean.
- Bloque 1, T0 (runner con vendedor_token).
```

**Archivos que nombra el diseño:** `backend/app/api/v1/crm.py`, `backend/tests/test_crm_kanban.py`, `frontend/src/lib/crm-etapas.js`, `frontend/tests/test_crm_etapas.mjs`, `frontend/src/app/dashboard/crm/page.tsx`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R27).


### KANBAN-resto — Kanban en pedidos web, y dónde no aplica

**Grupo:** Kanban · **Esfuerzo:** S · **Tareas del plan:** T13, T17, T18, T19, T20, T22, T23A

**Para el usuario:** El Kanban está donde sirve, y no quedan botones que no hacen nada.

**Lo que vio y aprobó el usuario:** Los pedidos de la tienda en línea (E-Commerce) ganan la vista Kanban, con las mismas columnas y reglas de los pedidos de venta. Sus estados salen con el nombre real; hoy el filtro casi nunca encuentra nada porque usa nombres que no existen. El botón «kanban» del catálogo pasa a llamarse «Cuadrícula», porque eso es lo que muestra. En las tablas que no tienen estados (Kardex, Stock, Abastecimiento, Productos, Ajustes, Gastos, Empleados y las vistas previas de exportación) el botón Kanban no aparece, porque no habría nada que mover; ver la pregunta. Además se quitan los botones de cuadrícula «en construcción» de Almacenes, Ubicaciones, Rutas y Compartido.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- Pediste Kanban en todas las tablas. En las que no tienen estados (Kardex, Stock, Abastecimiento, Productos, Ajustes y Gastos), ¿qué muestra? → **Un tablero solo para ver, agrupado por su dato natural (nivel de stock, categoría, tipo de ajuste, entrada/salida)** (= recomendada)

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** Punto 5 «Si el usuario elige la opción 2 de la pregunta» → SÍ: es la opción elegida (la página la puso primero: kanban_tablas_sin_estado = «Un tablero solo para ver, agrupado por su dato natural (nivel de stock, categoría, tipo de ajuste, entrada/salida)»), con los grupos de R11: Kardex por dirección (Entradas · Salidas), Stock y Abastecimiento por estado de stock sobre /inventory/stock-tabla (no /stock-summary), Productos por categoría, Ajustes por dirección y Gastos por categoría; Empleados NO lleva tablero (R11). La primera parte del punto 5 («donde no se monta ConmutadorVista») queda anulada para esas seis tablas y sigue valiendo para las demás de su lista. Su punto 4 (almacenes, ubicaciones, rutas y compartido) NO se hace (R14).

**Cambios (diseño):**

```text
BACKEND
1) backend/app/api/v1/ecommerce.py, list_web_orders (l.492): filtrar_por_estados, orden y limit con ge=0 (KANBAN-base).
FRONTEND
2) ecommerce/page.tsx, pestaña Panel (tabla 'Pedidos Web (PWEB)'):
- El PWEB_ESTADOS local se reemplaza por infoEstadoPedido de estados-pedido.js, en la pastilla y en el filtro. Las opciones del filtro son los códigos de ESTADOS_PEDIDO, agrupados como en COLUMNAS_PEDIDO.
- ConmutadorVista con useVistaGuardada('ecommerce.pedidos').
- Tablero en modo servidor con /ecommerce/pedidos?estado=…&search&limit&offset&orden, usando COLUMNAS_PEDIDO y reglaSoltarPedido de kanban-ventas.js. Reglas y acciones iguales a las de la lista de pedidos de venta:
  · PATCH /ventas/pedidos/{id};
  · cancelar con ModalMotivo;
  · facturar con confirmar;
  · Entregado lleva a Entregas.
- soloLectura con el motivo 'Tu rol solo puede ver los pedidos' cuando getUsuarioActual().role no es admin, asesor ni vendedor. El PATCH es solo para ADMIN y ASESOR; FINANZAS y BODEGA ven la lista.
3) ecommerce/page.tsx, pestaña Catálogo: el botón 'kanban' (l.470-473) pasa a llamarse 'Cuadrícula', con el ícono LayoutGrid y title 'Vista en cuadrícula'. No es un Kanban por estado.
4) inventario/{almacenes, ubicaciones, rutas, compartido}/page.tsx: se quita el botón de cuadrícula que muestra 'en construcción' (R8: sin botones muertos). La tabla queda igual.
5) Pantallas sin estado, donde no se monta ConmutadorVista ni se agrega nada:
- inventario/kardex, inventario/stock, inventario/abastecimiento e inventario/productos;
- el Hub de inventario (su conmutador Lista/Almacenes se queda, porque es otra vista);
- inventario/ajustes, finanzas/gastos y admin/empleados;
- marketing/campanas: es una lista maestra con una sub-tabla de leads, y el estado del lead lo pone el CRM;
- marketing/visitantes: datos simulados;
- ventas/exportar-dia y exportar-rango: son vistas previas;
- compras/historial: su endpoint no existe;
- scrapper: simulado;
- las tablas de líneas dentro de un documento: productos de SC, COT y PVEN, y el conteo de recepción.
Si el usuario elige la opción 2 de la pregunta, cada una recibe un tablero de solo lectura, agrupado así:
- kardex → dirección (entrada o salida);
- stock y abastecimiento → estado de stock, cuando sus datos se conecten a /inventory/stock-summary;
- productos → categoría;
- ajustes → tipo;
- gastos → categoría;
- empleados → rol, sin arrastre, porque cambiar un rol arrastrando es riesgoso.
```

**Pruebas (diseño):**

```text
BACKEND, con el runner de ROLLBACK, en test_listas_kanban_ventas.py:
- GET /ecommerce/pedidos?estado=PENDIENTE_PAGO,PAGADO, con dos SaleOrder de canal WEB → trae los dos;
- limit=0 devuelve solo el total.
FRONTEND:
- test_kanban_ventas.mjs ya cubre COLUMNAS_PEDIDO con PENDIENTE_PAGO y PAGADO.
- `npx tsc --noEmit`.
- Con grep, comprobar que no quede PWEB_ESTADOS ni botones sin onClick en las pantallas tocadas.
MANUAL:
- abrir E-Commerce > Panel en Kanban;
- entrar con un usuario de bodega: ve el tablero pero no puede mover.
```

**Comportamiento esperado:**

```text
- Pedidos web:
  · mismas columnas que los pedidos de venta (Pendiente de compra, En proceso, Listo para entrega, Entregado, Facturado y Cancelado) y mismas reglas de N2;
  · 'Pendiente de pago' cae en Pendiente de compra y 'Pagado' en En proceso, según el paso de estados-pedido;
  · la insignia de la tarjeta dice el estado real.
- Catálogo: hace lo mismo que hoy, con el nombre nuevo.
- Tablas sin estado: solo tienen vista de lista, y el botón Kanban no aparece.
```

**Datos existentes:**

```text
No toca datos.
```

**Riesgos:**

```text
- ecommerce/page.tsx tiene mojibake (unas 14 'Ã'). Arreglarlo es tarea de otro grupo, pero hay que editar con cuidado para no guardar el archivo con otra codificación.
- Un pedido web en un estado que no está en estados-pedido.js sale humanizado y en gris (el respaldo). Si su paso es 0, cae en Pendiente de compra.
- Si el usuario elige la opción 2, el esfuerzo sube a M, y conviene esperar a que Stock y Abastecimiento tengan datos reales.
```

**Depende de:**

```text
- KANBAN-base y KANBAN-ventas-listas (COLUMNAS_PEDIDO y reglaSoltarPedido).
- Bloque 1: estados-pedido.js.
```

**Archivos que nombra el diseño:** `backend/app/api/v1/ecommerce.py`, `frontend/src/app/dashboard/ecommerce/page.tsx`, `frontend/src/app/dashboard/inventario/almacenes/page.tsx`, `frontend/src/app/dashboard/inventario/ubicaciones/page.tsx`, `frontend/src/app/dashboard/inventario/rutas/page.tsx`, `frontend/src/app/dashboard/inventario/compartido/page.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### KPI-base — Una sola tarjeta de indicadores para toda la app

**Grupo:** Indicadores (tarjetas KPI) · **Esfuerzo:** M · **Tareas del plan:** T1A, T3A, T4A, T4D, T5D

**Para el usuario:** Hoy conviven unos seis estilos de tarjeta: StatCard con el número en text-4xl, la versión con fondo de color, las tarjetas hechas a mano en los Hubs, la del Hub de Inventario con el ícono a la derecha, las de Análisis y las del Dashboard General. Por eso unas son enormes y otras pequeñas, y los montos se salen, como en Pedidos de Venta (paso-42). Este ítem crea una pieza única, TarjetaKpi, con su franja, FranjaKpis, que se ajusta sola al ancho disponible. Trae también un catálogo con el nombre de cada indicador, para que lo mismo se llame igual en todas las pantallas, y el cálculo de la variación contra el período anterior. Las demás tarjetas del sistema pasan a usarla en los ítems KPI-ventas, KPI-compras, KPI-inventario y KPI-otros.

**Lo que vio y aprobó el usuario:** Las tarjetas con números de arriba de cada pantalla (los indicadores) se ven iguales en toda la aplicación y ocupan casi la mitad de alto que hoy. Tienen el ícono a la izquierda, el nombre arriba, el número grande y una línea corta debajo. Si la cifra es de un período, por ejemplo lo vendido en los últimos 30 días, aparece una flecha verde o roja con el % que subió o bajó frente al período anterior, como en el ejemplo de Análisis que elegiste. Mientras la pantalla carga ya no salen 0 ni «Todas al día»: se ve una barra gris que se mueve. Si los datos no llegaron, la tarjeta muestra «—» y avisa. Los montos van completos y sin centavos, y no se salen de la tarjeta: si no caben, la letra se achica. Al pasar el mouse ves la cifra completa. Las tarjetas que se pueden tocar filtran la tabla de abajo y quedan resaltadas. Los números de las pestañas tampoco muestran 0 mientras carga.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- Cuando un monto es largo (por ejemplo $123.456.789), ¿cómo se ve en la tarjeta? → **Completo; la letra se achica para que quepa** (= recomendada)
- El % de subida o bajada de las tarjetas, ¿contra qué se compara? (En Análisis puedes cambiar el período.) → **Últimos 30 días contra los 30 anteriores** (= recomendada)
- ¿Qué cuenta como «vendido» en las tarjetas, el Dashboard General y Análisis? → **Los pedidos creados en el período, sin cancelados ni devueltos, con su % contra el período anterior** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) El % de subida o bajada que muestran las tarjetas, ¿contra qué período se compara? → reemplazada por «periodo_comparacion» (en KPI-base), respondida: «Últimos 30 días contra los 30 anteriores» (R7).
- (Pregunta del diseño fusionada por el crítico) La tarjeta de dinero de los Hubs de Ventas y Compras y del Dashboard General, ¿qué cifra muestra? → reemplazada por «cifra_ventas» (en KPI-base), respondida: «Los pedidos creados en el período, sin cancelados ni devueltos, con su % contra el período anterior» (R3, R6, R7); en el Hub de Ventas manda hub_tarjetas; en Compras, «Comprado (30 días)» con su % en gris.

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** «Si el usuario elige montos abreviados: formatoCompacto» → NO: montos_grandes = «Completo; la letra se achica para que quepa» (R7). Los períodos de su punto 6 siguen la semántica de ANALISIS-api con periodo_comparacion = «Últimos 30 días contra los 30 anteriores» (R7).

**Cambios (diseño):**

```text
FRONTEND
1) NUEVO frontend/src/lib/kpis.js (JS puro, sin React, se prueba con node):
   - PERIODO_KPI = '30d' (respuesta del usuario: '30d' | '7d' | 'mes').
   - TEXTO_PERIODO = { '30d': {etiqueta:'30 días', comparado:'vs 30 días antes'}, '7d': {etiqueta:'7 días', comparado:'vs 7 días antes'}, 'mes': {etiqueta:'este mes', comparado:'vs mes pasado'} }.
   - estadoKpi({loading, yaCargo, error}): 'cargando' si loading y todavía no hubo una carga; 'actualizando' si loading y ya hubo una; 'error' si hubo error y no está cargando; si no, 'listo'.
   - variacionPct(actual, anterior). Devuelve null si alguno no es un número finito; {tipo:'igual'} si los dos son 0; {tipo:'nuevo'} si anterior es 0 y actual > 0; en otro caso {tipo:'pct', pct}, con pct = (actual−anterior)/|anterior|×100 redondeado a 1 decimal.
   - textoVariacion(v): '12,5%', '−8%', 'Nuevo' o 'Sin cambio'. Lleva coma decimal y quita el ',0'.
   - tonoVariacion(v, mejorSiSube): 'bien', 'mal' o 'neutro'. Con mejorSiSube=null siempre da 'neutro'.
   - formatoValorKpi(valor, formato):
     · 'pesos': formatoPesos de lib/pesos.js (Bloque 1). Ejemplo: 4927538.46 → '$4.927.538'.
     · 'numero': miles con punto ('1.452').
     · 'porcentaje': 1 decimal con coma, sin ',0' ('65%', '12,5%').
     · 'texto': el valor tal cual.
     · null, undefined, '' o NaN: '—'.
     · Si el usuario elige montos abreviados: formatoCompacto ('$4,9 M', '$850 mil'), solo cuando el texto pasa de 11 caracteres.
   - tamanoValor(texto): 'text-2xl' hasta 9 caracteres, 'text-xl' de 10 a 12 y 'text-lg' desde 13.
   - clasesFranja(n): tabla de clases LITERALES de Tailwind v4 para container queries, según el número de tarjetas:
     · 2: 'grid-cols-1 @sm:grid-cols-2'
     · 3: 'grid-cols-1 @2xl:grid-cols-3'
     · 4: 'grid-cols-1 @sm:grid-cols-2 @4xl:grid-cols-4'
     · 5: 'grid-cols-1 @sm:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5'
     · 6: '… @3xl:grid-cols-3 @6xl:grid-cols-6'
   - textoContador(valor, estado): '' si está cargando (el componente pinta la barra), '—' si hubo error, String(n) en otro caso.
   - acentoDesdeClase('bg-blue-500') → 'blue'. Si el color no es de la paleta o es '#hex', devuelve 'indigo'.
   - CATALOGO_KPI: id → {etiqueta, formato, icono (nombre de lucide), color, mejorSiSube}, con etiquetaKpi(id, periodo), que reemplaza '{periodo}'. Es la ÚNICA fuente de nombres. Contenido (id · etiqueta · formato · ícono · color):
     · VENTAS:
       - sc_activas · Solicitudes activas · numero · FileText · indigo
       - sc_confirmadas · Solicitudes confirmadas · numero · CheckCircle2 · emerald
       - sc_canceladas · Solicitudes canceladas · numero · XCircle · rose
       - sc_total · Total de solicitudes · numero · Activity · slate
       - cot_activas · Cotizaciones activas · numero · FileText · amber
       - cot_confirmadas · Cotizaciones confirmadas · numero · CheckCircle2 · emerald
       - cot_monto_confirmado · Monto confirmado · pesos · DollarSign · slate
       - cot_total · Total de cotizaciones · numero · Activity · slate
       - pven_total · Total de pedidos · numero · FileText · indigo
       - pven_en_curso · Pedidos en curso · numero · ShoppingBag · emerald
       - pven_pendiente_compra · Pendientes de compra · numero · Package · orange
       - pven_monto_vendido · Monto vendido · pesos · DollarSign · emerald
       - vendido_periodo · Vendido ({periodo}) · pesos · TrendingUp · purple
       - pven_monto_entregado · Entregado y facturado · pesos · BarChart3 · purple
       - pven_saldo_por_cobrar · Saldo por cobrar · pesos · Wallet · rose · mejorSiSube=false
       - ticket_promedio · Ticket promedio · pesos · Receipt · blue
       - clientes_total · Clientes · numero · Users · indigo
       - cli_total_comprado · Total comprado · pesos · ShoppingCart · indigo
       - cli_total_pagado · Total pagado · pesos · CheckCircle2 · emerald
     · COMPRAS:
       - pec_activos · Pedidos de compra activos · numero · Receipt · purple
       - pec_en_transito · En tránsito · numero · Truck · blue
       - pec_vencidos · Con entrega vencida · numero · AlertTriangle · rose · mejorSiSube=false
       - pec_cumplimiento · Cumplimiento · porcentaje · CheckCircle2 · emerald
       - pec_monto · Monto en compras · pesos · DollarSign · purple
       - pec_monto_por_recibir · Monto por recibir · pesos · DollarSign · blue
       - comprado_periodo · Comprado ({periodo}) · pesos · TrendingUp · purple · mejorSiSube=null
       - pec_avance · Avance promedio · texto · Clock · amber
       - rec_por_confirmar · Recepciones por confirmar · numero · Clock · amber
       - rec_confirmadas · Recepciones confirmadas · numero · CheckCircle2 · emerald
       - rec_total · Total de recepciones · numero · Activity · slate
       - lista_pendientes · Ítems por comprar · numero · Clock · amber
       - lista_en_pedido · Ítems en pedido · numero · ShoppingCart · blue
       - lista_recibidos · Ítems recibidos · numero · CheckCircle2 · emerald
       - lista_total · Total de ítems · numero · Package · slate
       - tras_en_proceso · Traslados en proceso · numero · ArrowLeftRight · blue
       - tras_completados · Traslados completados · numero · CheckCircle2 · emerald
       - tras_total · Total de traslados · numero · Activity · slate
       - bodegas · Bodegas · numero · Warehouse · amber
     · INVENTARIO:
       - inv_valorizacion · Valor del inventario · pesos · DollarSign · purple
       - inv_skus · Referencias (SKU) · numero · Package · indigo
       - inv_fisico · Unidades en bodega · numero · Box · blue
       - inv_reservado · Unidades comprometidas · numero · Clock · amber
       - inv_disponible · Disponibles para vender · numero · CheckCircle2 · emerald
       - inv_en_transito · Unidades en tránsito · numero · Truck · blue
       - inv_bajo_minimo · Bajo el mínimo · numero · AlertTriangle · amber · mejorSiSube=false
       - inv_agotados · Agotados · numero · AlertCircle · rose · mejorSiSube=false
       - inv_abastecidos · Bien abastecidos · numero · CheckCircle2 · emerald
       - inv_disponibilidad · Disponibilidad · porcentaje · PieChart · emerald
       - aju_total · Total de ajustes · numero · SlidersHorizontal · amber
       - aju_entradas · Ajustes de entrada · numero · TrendingUp · emerald
       - aju_salidas · Ajustes de salida · numero · TrendingDown · rose
       - aju_neto · Diferencia neta · numero · Activity · slate
       - ent_saldo · Saldo antes de despachar · pesos · Wallet · rose
       - ent_despachados · Pedidos despachados · numero · CheckCircle2 · emerald
     · OTROS:
       - leads_total · Leads · numero · Users · indigo
       - camp_activas · Campañas activas · numero · Target · blue
       - leads_capturados · Leads capturados · numero · Users · emerald
       - leads_convertidos · Leads convertidos · numero · CheckCircle2 · emerald
       - ventas_atribuidas · Ventas atribuidas · pesos · DollarSign · purple
       - roi · Retorno (ROI) · porcentaje · TrendingUp · amber
       - flujos_activos · Flujos activos · numero · Sparkles · purple
       - web_ventas_hoy · Ventas web de hoy · pesos · TrendingUp · purple
       - web_ventas_mes · Ventas web del mes · pesos · BarChart3 · indigo
       - carritos_abandonados · Carritos abandonados · numero · AlertCircle · rose · mejorSiSube=false
       - productos_publicados · Productos publicados · numero · Package · emerald
     Cada ítem de despliegue puede agregar ids aquí, y en ningún otro lugar.
   - ICONOS_KPI: arreglo con los nombres de íconos permitidos.
2) NUEVO frontend/src/components/ui/TarjetaKpi.tsx ('use client'), exportado en components/ui/index.ts:
   - type ColorKpi = AccentColor | 'slate'; type EstadoKpi = 'cargando' | 'actualizando' | 'error' | 'listo'.
   - TarjetaKpi(props). Props:
     · kpi?: string (id del catálogo; trae etiqueta, icono, color y formato).
     · etiqueta?, icono?: LucideIcon | string, color?: ColorKpi, formato?: 'numero'|'pesos'|'porcentaje'|'texto' (sobrescriben el catálogo).
     · valor: number | string | React.ReactNode | null.
     · ayuda?: React.ReactNode.
     · variacion?: {actual:number, anterior:number, mejorSiSube?: boolean|null} | null.
     · textoPeriodo?: string (por defecto TEXTO_PERIODO[PERIODO_KPI].comparado).
     · tono?: 'normal'|'alerta'|'bien'.
     · estado?: EstadoKpi (por defecto, el de la franja).
     · activo?: boolean; onClick?: () => void; titulo?: string.
   - Diseño, basado en ref-analisis:
     · Contenedor 'flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-xs min-h-[88px]' con borde slate-200.
     · tono 'alerta': 'border-rose-200 bg-rose-50/40'.
     · activo: anillo del color (mapa literal, por ejemplo 'ring-2 ring-indigo-300 border-indigo-300').
     · Ícono: 'w-10 h-10 rounded-xl shrink-0 flex items-center justify-center' con ACCENTS[color].statIconBg ('bg-slate-100 text-slate-600' para slate), lucide de tamaño 20.
     · Columna de texto 'min-w-0 flex-1':
       - etiqueta: 'text-xs font-semibold text-slate-500 truncate', con su texto en title. Va en minúsculas normales, como en la referencia, sin mayúsculas sostenidas.
       - valor: `${tamanoValor(texto)} font-black text-slate-900 leading-tight tabular-nums truncate mt-0.5`, con title igual al valor completo.
       - línea inferior (UNA sola):
         a) Con variacion: chip 'inline-flex items-center gap-0.5 text-xs font-bold' en verde, rojo o slate según tonoVariacion, con ArrowUpRight, ArrowDownRight o Minus de 12 + textoVariacion, seguido de textoPeriodo en 'text-xs text-slate-400'. Además, texto sr-only: 'Sube 12,5% frente a los 30 días anteriores'. La ayuda pasa al title.
         b) Sin variacion: ayuda en 'text-xs font-semibold truncate', slate-500 o rose-600/emerald-600 según el tono.
     · Con onClick se renderiza <button type='button' aria-pressed={activo}> con 'text-left w-full hover:border-slate-300 focus-visible:ring-2'; sin onClick, <div>.
     · estado 'cargando': el valor se reemplaza por <span aria-hidden className='block h-7 w-24 rounded-md bg-slate-200 animate-pulse'/> y la ayuda por una barra 'h-3 w-32'; no se pinta ningún texto de ayuda ('Todas al día').
     · estado 'actualizando': valores con opacity-60.
     · estado 'error' y valor null: '—' y la ayuda 'No se pudo cargar' en rose.
   - FranjaKpis({children, estado='listo', nota?, ejemplo?, titulo='Indicadores'}):
     · <section aria-label={titulo} aria-busy={estado==='cargando'} className='@container'> con el grid `grid gap-3 ${clasesFranja(n)}`, donde n = React.Children.count.
     · Pasa estado y ejemplo a las tarjetas por un React context.
     · ejemplo: pastilla ámbar 'Datos de ejemplo' arriba a la derecha.
     · nota: línea 'mt-2 flex items-start gap-1.5 text-xs text-slate-500' con el ícono Info.
   - useEstadoKpi(loading, error?): hook con useRef(yaCargo) que devuelve estadoKpi(...).
   - Contador({valor, estado}): para los números de las pestañas y de las pastillas. Mientras carga muestra <span className='inline-block h-2 w-4 rounded-full bg-current opacity-30 animate-pulse' aria-hidden/> con sr-only 'Cargando'; si hubo error, '—'.
3) frontend/src/components/ui/StatCard.tsx pasa a ser un adaptador @deprecated que delega en TarjetaKpi:
   - label → etiqueta, value → valor (si es un ReactNode, se usa formato 'texto'), hint → ayuda, tone success/danger → tono bien/alerta, color → color.
   - variant='gradient' se ignora: ya no hay tarjetas con fondo de color.
   Así, cualquier pantalla que todavía no se haya migrado toma el tamaño nuevo de inmediato.
4) frontend/src/lib/design-system.ts: borrar KPI_CARD y KPI_COLOR_MAP (código muerto: ningún archivo los importa; verificarlo con grep antes de borrar).
   .agents/rules/design-system-reference.md:
   - l.13: quitar KPI_CARD del import de ejemplo.
   - Sección 'KPI Card (4 en grid)' (l.74-84): reemplazarla por un ejemplo de <FranjaKpis><TarjetaKpi kpi='…' valor={…}/></FranjaKpis>.
5) frontend/package.json, script 'test': agregar '&& node tests/test_kpis.mjs' (solo este hunk).
BACKEND
6) NUEVO backend/app/core/periodos.py (sin FastAPI ni DB). Lo reutilizan los endpoints de estadísticas de este grupo y los de Análisis:
   - PERIODOS_KPI = ('7d', '30d', 'mes').
   - ventanas(periodo, ahora=None) → {desde, hasta, desde_anterior, hasta_anterior}, como datetime UTC naive, igual que created_at.
     · '30d' y '7d': ventanas móviles.
     · 'mes': desde el inicio del mes en hora de Colombia, con a_colombia/ahora_utc de backend/app/core/fechas.py (Bloque 3, B3-T0), hasta ahora. La ventana anterior es el mismo tramo del mes pasado y se recorta al inicio del mes actual si el mes pasado fue más corto.
     · Un período desconocido lanza ValueError.
   - bloque_periodo(periodo, ahora=None) → {'clave', 'actual':{desde,hasta}, 'anterior':{desde,hasta}}, en ISO con 'Z'.
   - contar_en(q, col_fecha, v, cual) y sumar_en(q, col_fecha, col_monto, v, cual) devuelven {actual, anterior}. Hacen una sola consulta con func.sum(case(...)) por ventana.
```

**Pruebas (diseño):**

```text
FRONTEND, nuevo frontend/tests/test_kpis.mjs (node, sumado al script 'test'):
- estadoKpi: las 4 combinaciones (loading sin carga previa → 'cargando'; loading con carga previa → 'actualizando'; error → 'error'; resto → 'listo').
- variacionPct:
  · (110,100) → pct 10; (90,100) → −10; (1,3) → −66,7.
  · (5,0) → nuevo; (0,0) → igual.
  · ('x',1) → null.
- textoVariacion: '12,5%', '10%' y 'Nuevo'.
- tonoVariacion: sube con mejorSiSube=false → 'mal'; con null → 'neutro'.
- formatoValorKpi: 4927538.46 en pesos → '$4.927.538'; null → '—'; 65.04 en porcentaje → '65%'; 1452 → '1.452'.
- tamanoValor: 9, 10 y 13 caracteres.
- clasesFranja(4) contiene '@4xl:grid-cols-4'.
- textoContador.
- acentoDesdeClase: 'bg-blue-500' → 'blue'; '#123456' → 'indigo'.
- CATALOGO_KPI:
  · ids únicos y etiquetas únicas;
  · cada icono está en ICONOS_KPI;
  · ninguna etiqueta contiene 'Transito', 'Analisis', 'Minimo', 'Categoria', 'Campanas', 'Items' ni 'Ultim';
  · ningún formato desconocido.
Luego `npx tsc --noEmit` y `npm test` en frontend.
BACKEND, nuevo backend/tests/test_periodos.py (puro, sin DB). Correrlo con el runner de ROLLBACK, nunca pytest completo:
  cd C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend
  venv\Scripts\python.exe tests/rollback_runner.py test_periodos
- '30d' con ahora fijo: desde = ahora−30 d y desde_anterior = ahora−60 d.
- 'mes' con ahora = 2026-10-01T03:00 (en Colombia es el 30-sep a las 22:00): desde = 2026-09-01T05:00, desde_anterior = 2026-08-01T05:00, hasta_anterior = 2026-08-31T03:00.
- 'mes' con ahora = 2026-03-31T20:00: hasta_anterior se recorta a 2026-03-01T05:00.
- 'xx' → ValueError.
MANUAL: Pedidos de Venta a 1440 px y a 1024 px. '$4.927.538' no se sale. Al recargar se ven las barras grises, no 0.
```

**Comportamiento esperado:**

```text
- Tamaños: tarjeta de 88 px de alto como mínimo, frente a unos 170 px hoy. Ícono de 40 px, nombre en text-xs y valor en text-2xl (en text-xl o text-lg si es largo).
- Ancho: la franja decide las columnas por el ancho de su propio contenedor, no por el de la pantalla.
  · A 1440 px con el menú abierto (contenido de unos 1130 px): 4 tarjetas en una fila.
  · A 1024 px (contenido de unos 720 px): 2 filas de 2, para que los montos quepan completos.
  · En un teléfono: 1 columna.
- Montos: '$4.927.538', sin centavos ni '$ ' con espacio. La cifra completa siempre está en el title.
- Variación: solo aparece en indicadores de período (dinero vendido o comprado, ventas web). Una cifra de foto (activas, en curso, saldo) no lleva % porque no hay historia guardada con qué compararla; lleva ayuda.
  · Verde si mejora y rojo si empeora: en 'Saldo por cobrar' o 'Con entrega vencida', subir es rojo.
  · Las cifras neutras (Comprado) van en gris.
  · 'Nuevo' si el período anterior fue 0, 'Sin cambio' si los dos son 0.
- Carga (H6):
  · Primera carga: barras grises animadas en tarjetas, pestañas y pastillas.
  · Al pulsar 'Actualizar': se ven los números anteriores atenuados, sin parpadear a 0.
  · Si falla: '—' y 'No se pudo cargar'.
- Clic: solo las tarjetas que tienen un filtro equivalente son botones. Al pulsar, la tabla de abajo muestra esos documentos y la tarjeta queda con un anillo; al pulsar otra vez se quita.
- Sin persistencia: el período es la constante PERIODO_KPI (decisión del usuario) y no se guarda nada en localStorage.
- Accesibilidad: aria-busy en la franja, aria-pressed en las tarjetas que son botón y texto sr-only para las flechas.
```

**Datos existentes:**

```text
No aplica: todo se calcula al vuelo. No hay migraciones ni se escribe en admin_config.
```

**Riesgos:**

```text
- El adaptador de StatCard cambia de golpe el aspecto de unas 18 pantallas. Es lo buscado, pero las tarjetas 'gradient' que llevan un párrafo como valor ('Protocolo 60/40', 'Regla de Separación') se verán raras hasta que su ítem de despliegue las convierta en nota.
- Las container queries dependen de Tailwind v4 (4.3.3 instalado; U24 del Bloque 2 ya las usa). Las clases deben ser cadenas literales.
- core/periodos.py importa core/fechas.py del Bloque 3. Si B3-T0 no está fusionado, hay que crearlo antes.
- .agents/rules/analisis-tab-standard.md exige tarjetas con gradiente en Análisis. Esa regla la actualiza el grupo de Análisis, que debe usar TarjetaKpi con variacion.
- Si se agrega un indicador fuera de CATALOGO_KPI, se vuelven a separar los nombres. La prueba solo cubre el catálogo; en la revisión hay que exigir kpi='…'.
```

**Depende de:**

```text
Bloque 1 (frontend/src/lib/pesos.js: formatoPesos) y Bloque 3 B3-T0 (backend/app/core/fechas.py). No depende de otros ítems del Bloque 4: es la base de KPI-ventas, KPI-compras, KPI-inventario y KPI-otros, y la usa el grupo de Análisis.
```

**Archivos que nombra el diseño:** `frontend/src/lib/kpis.js`, `frontend/src/components/ui/TarjetaKpi.tsx`, `frontend/src/components/ui/StatCard.tsx`, `frontend/src/components/ui/index.ts`, `frontend/src/lib/design-system.ts`, `frontend/tests/test_kpis.mjs`, `frontend/package.json`, `.agents/rules/design-system-reference.md`, `backend/app/core/periodos.py`, `backend/tests/test_periodos.py` (la lista que manda es la de **Files** de la tarea y R27).


### KPI-ventas — Indicadores de Ventas: mismos nombres y cifras completas

**Grupo:** Indicadores (tarjetas KPI) · **Esfuerzo:** L · **Tareas del plan:** T1C, T2, T3C, T6C, T7, T8, T9, T10

**Para el usuario:** Hoy el Hub calcula sus cuatro tarjetas en el navegador con los 200 documentos más recientes de cada tipo, y con reglas distintas a las de las listas. Por ejemplo, 'Cotizaciones vigentes' en el Hub frente a 'Activas' en la lista, o 'Ventas facturadas' frente a 'Total monto'. Así, el mismo concepto da números diferentes según la pantalla. Este ítem calcula los indicadores en el servidor sobre todos los documentos, con una sola regla por concepto: la que decidió el Bloque 1 (H32, COT-LISTA, H47 y N10). Además los pinta con la tarjeta estándar.

**Lo que vio y aprobó el usuario:** El Hub de Ventas y las listas de Solicitudes, Cotizaciones y Pedidos usan la tarjeta nueva, con los mismos nombres: «Solicitudes activas», «Cotizaciones activas», «Pedidos en curso», «Monto vendido» y «Saldo por cobrar». Un indicador da el mismo número en el Hub y en su lista, y cuenta todos los documentos, no solo los 200 más recientes. La cuarta tarjeta del Hub muestra lo vendido en los últimos 30 días, con su % contra los 30 anteriores. En Cotizaciones desaparece la mezcla de tres estilos. En Pedidos los montos ya no se salen de la tarjeta. Al tocar una tarjeta del Hub, la tabla muestra solo esos documentos y aparece la etiqueta «Filtro: Solicitudes activas», que se quita con la X. En el pedido de venta, los tres recuadros de dinero (anticipo, pagado y saldo) usan la misma tarjeta, igual de grandes. Los atrasados ya no se repiten en las tarjetas: los muestra el semáforo.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- En el Hub de Ventas, el diagrama del flujo ya cuenta los documentos de cada paso. ¿Qué muestran las 4 tarjetas de arriba? → **Dinero y avance: Vendido en el período (con %), Saldo por cobrar, Ticket promedio y % de cotizaciones que terminan en pedido** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) En el Hub de Ventas, al tocar una tarjeta (por ejemplo «Solicitudes activas»), ¿qué pasa? → reemplazada por «clic_en_hub» (en FLUJO-ventas-pantallas), respondida: «La tabla y el Kanban del Hub muestran solo esos documentos, con un chip para quitar el filtro» (R6); además hub_tarjetas (KPI-ventas) cambia las tarjetas del Hub a dinero y avance, que no son pulsables.

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** Punto 4 «SOLO si el grupo de tablas pasa las listas a paginación de servidor» (parámetro kpi) → NO (C3, R5). Las «Opción 0/1/2» de su punto 6 las reemplaza hub_tarjetas = «Dinero y avance: Vendido en el período (con %), Saldo por cobrar, Ticket promedio y % de cotizaciones que terminan en pedido» (R6: cuatro tarjetas de dinero y avance, no pulsables, sin resumenVentasLocal ni PREDICADOS_KPI_HUB).

**Cambios (diseño):**

```text
BACKEND
1) backend/app/core/estados_pedido.py, nuevas constantes:
   - ESTADOS_VEN_CERRADOS = ('ENTREGADO','FACTURADO','CANCELADO','DEVUELTO_TOTAL'), espejo de ESTADOS_PEDIDO_CERRADOS.
   - ESTADOS_VEN_SIN_DINERO = ('CANCELADO','DEVUELTO_TOTAL'). Viene de la decisión de H47: un pedido devuelto tampoco suma.
   El resumen de list_pedidos (H47) pasa a usar ESTADOS_VEN_SIN_DINERO, para que la lista y el Hub den la misma cifra. En el frontend, estados-pedido.js agrega ESTADOS_PEDIDO_SIN_DINERO.
2) backend/app/api/v1/erp_ventas.py, filtros de módulo reutilizables (expresiones SQLAlchemy, una por concepto):
   - _f_sc_activa: estado fuera de ('CONFIRMADA','CANCELADA') y tipo_solicitud distinto de 'Soporte Tecnico' (o nulo). Es la misma regla de totalActivas en solicitud-client.tsx:1028.
   - _f_sc_espera_cot: estado CONFIRMADA y sin una COT con sc_id que no esté RECHAZADA (H32).
   - _f_cot_pedido_caido: estado CONFIRMADA, con algún SaleOrder de esa cot_id y todos ellos CANCELADO.
   - _f_cot_activa: estado fuera de ('CONFIRMADA','RECHAZADA'), o bien _f_cot_pedido_caido (COT-LISTA).
   - _f_cot_confirmada: CONFIRMADA y no _f_cot_pedido_caido.
   - _f_cot_con_pedido: _f_cot_confirmada y con un pedido que no esté CANCELADO.
   - _f_pven_en_curso: estado fuera de ESTADOS_VEN_CERRADOS.
   - _f_pven_con_dinero: estado fuera de ESTADOS_VEN_SIN_DINERO.
3) ventas_stats (l.1596):
   - require_roles(*ALL_ERP_ROLES), los mismos roles que las listas.
   - Nuevo parámetro periodo: str = Query('30d', pattern='^(7d|30d|mes)$').
   - Se CONSERVAN todas las claves actuales.
   - Se agregan:
     · 'ven_por_estado'.
     · 'kpis': sc_activas, sc_esperan_cotizacion, sc_confirmadas (estado CONFIRMADA, como la pestaña), sc_canceladas, sc_total, cot_activas, cot_sin_precio (activas con total_cop nulo o ≤ 0), cot_confirmadas, cot_con_pedido, cot_por_convertir, cot_monto_confirmado, cot_rechazadas, cot_total, pven_total, pven_en_curso, pven_saldo_en_curso, pven_pendiente_compra, pven_cancelados, pven_con_dinero, pven_monto_vendido, pven_monto_entregado (ENTREGADO + FACTURADO), pven_saldo_por_cobrar (Σ max(0, saldo_cop) con _f_pven_con_dinero) y pven_anticipo.
     · 'periodo' = bloque_periodo(periodo).
     · 'flujo': vendido_cop, pedidos_nuevos, solicitudes_nuevas y cotizaciones_nuevas, cada uno como {actual, anterior}, con sumar_en y contar_en de core/periodos.py sobre created_at. vendido_cop y pedidos_nuevos usan _f_pven_con_dinero.
   - Los montos van por redondear_peso.
   - Unas 8 consultas con group_by y sum(case(...)), sin tope de 200.
4) SOLO si el grupo de tablas pasa las listas a paginación de servidor:
   - list_solicitudes, list_cotizaciones y list_pedidos aceptan kpi ∈ {activas, esperan_cotizacion, confirmadas, en_curso, pendiente_compra}, con los mismos _f_*. Uno desconocido → 422.
   - Así, el número de la tarjeta es el total de la tabla filtrada.
FRONTEND
5) NUEVO frontend/src/lib/kpis-ventas.js (puro):
   - Predicados:
     · esScActiva(sc).
     · esperaCotizacion(sc), con cotizacionesVigentes de lib/listas-ventas.js (Bloque 1).
     · esCotActiva(cot), con soloPedidosCancelados.
     · esCotConfirmada(cot).
     · esPvenEnCurso(p), con ESTADOS_PEDIDO_CERRADOS.
     · tieneDinero(p), con ESTADOS_PEDIDO_SIN_DINERO.
   - resumenVentasLocal(sc, cot, pven): devuelve las MISMAS claves que data.kpis. Es el respaldo si /ventas/stats falla.
   - PREDICADOS_KPI_HUB: {sc_activas, cot_activas, pven_en_curso}, que reciben la fila del Hub con su tipo.
   - resumenFichaCliente(perfil360): lo usa KPI-otros.
6) Hub frontend/src/app/dashboard/ventas/page.tsx (cambios quirúrgicos):
   a) loadData (l.256-261): agregar apiFetch(`/ventas/stats?periodo=${PERIODO_KPI}`).catch(()=>null) al Promise.all y guardar setStats(st?.data ?? null). Guardar también errorCarga cuando las tres listas fallan.
      const estado = useEstadoKpi(loading, errorCarga); const k = stats?.kpis ?? resumenVentasLocal(solicitudes, cotizaciones, pedidos).
   b) Borrar kpiCards, totalFacturadoCOP y colorMap (l.464-513). El render (l.593-613) pasa a ser <FranjaKpis estado={estado}> con 4 tarjetas:
      1. kpi='sc_activas' valor={k.sc_activas}. Ayuda: si k.sc_esperan_cotizacion > 0, `${n} esperan cotización` con tono 'alerta'; si no, 'Ninguna espera cotización'.
      2. kpi='cot_activas'. Ayuda: `${k.cot_sin_precio} sin precio`, o 'Todas con precio'.
      3. kpi='pven_en_curso'. Ayuda: `${k.pven_pendiente_compra} pendientes de compra`.
      4. Según dinero_hubs:
         - Opción 0: kpi='vendido_periodo', valor=stats.flujo.vendido_cop.actual, variacion={actual, anterior} y en la ayuda (title) `${pedidos_nuevos.actual} pedidos nuevos`.
         - Opción 1: kpi='pven_monto_vendido', sin variación.
         - Opción 2: kpi='pven_monto_entregado'.
      Si stats es null, en el title: 'Calculado con los documentos cargados'.
      Se conserva 'ocultar en Análisis' (l.594).
   c) Clic, según clic_kpi_hub:
      - Opción 0: estado filtroKpi ('sc_activas' | 'cot_activas' | 'pven_en_curso' | null). Al pulsar: setActiveTab('SC' | 'Cotizaciones' | 'Pedidos de Venta'), setQuickFilter('todos') y alternar filtroKpi. filteredData (l.307-334) aplica PREDICADOS_KPI_HUB[filtroKpi] después de la base de la pestaña. En la fila de búsqueda (l.653-689), un chip 'Filtro: {etiqueta} ×'. Cambiar de pestaña (l.627) lo limpia.
      - Opción 1: router.push a /dashboard/ventas/solicitud?tab=Activas, /cotizacion?tab=Activas o /venta?tab=Todos. Cada lista lee ?tab= al montar.
   d) Contadores de pestaña (l.630-634): <Contador valor={tab.count} estado={estado}/>. Las pastillas y botones del semáforo (l.536-557) también usan Contador, salvo que el grupo del semáforo (U1/U10) ya haya reemplazado el banner; en ese caso su componente usa Contador.
7) solicitud-client.tsx (l.1208-1214): FranjaKpis con:
   - sc_activas. Conserva la ayuda de H32/N8: sinAtender > 0 ? `${sinAtender} sin atender` (alerta) : 'Todas atendidas'.
   - sc_confirmadas. Ayuda de H32: esperanCot.
   - sc_canceladas. Ayuda: 'Fuera del flujo'.
   - sc_total. Ayuda de H32.
   Valores: stats.kpis si llegó (todas las SC). Si no, los de H32 calculados localmente (agregar el fetch de stats en load, l.854-865).
   Clics: setActiveTab('Activas' | 'Confirmadas' | 'Canceladas') y setCurrentPage(1).
   Contadores de pestaña con Contador.
   La fila de Análisis (l.1405-1425) NO se toca: es del grupo de Análisis.
8) cotizacion-client.tsx (l.570-594): 4 TarjetaKpi y se quitan el div a medida y la variante gradient:
   - cot_activas. Ayuda de COT-LISTA, sin precio.
   - cot_confirmadas. Ayuda de COT-LISTA: conPedido y porConvertir.
   - cot_monto_confirmado, en color slate. Ayuda `${conPedido} con pedido de venta vigente`. Clic → Confirmadas.
   - cot_total. Ayuda `${rechazadas} rechazadas`. Clic → Rechazadas.
   Valores: stats.kpis, o los locales de COT-LISTA.
   Cada clic hace setCurrentPage(1). Contadores de pestaña con Contador.
9) venta-client.tsx (l.145-152):
   - La banda 'px-8 py-5 bg-white border-b' pasa a 'px-8 pt-5'.
   - FranjaKpis con:
     · pven_total (ayuda de H47, con activos y cancelados). Clic → Todos.
     · pven_monto_vendido (ayuda de H47: 'Sin pedidos cancelados').
     · pven_pendiente_compra. Clic → 'Pend. Compra'.
     · pven_saldo_por_cobrar.
   - Valores: el resumen de servidor de H47, sin cambio de fuente.
   - Se renombran las etiquetas a las del catálogo.
   - setCurrentPage(1) en cada clic. Contadores de pestaña con Contador.
10) venta/[id]/page.tsx, Resumen Financiero de U24 (Bloque 2):
   - Los tres recuadros pasan a FranjaKpis con 3 TarjetaKpi en formato pesos.
   - Se conservan exactamente los textos, colores y casos de U24: 'Anticipo requerido · {pct}' en índigo; 'Pagado (verificado)' en esmeralda; tercer recuadro con saldo en rose, completo en esmeralda o a favor en ámbar.
   - Valores de resumenPagoPedido.
   - No cambian el total de arriba, la barra, el aviso ámbar ni la lista de pagos.
11) frontend/package.json: agregar '&& node tests/test_kpis_ventas.mjs'.
```

**Pruebas (diseño):**

```text
BACKEND, nuevo backend/tests/test_kpis_ventas.py. Correr SOLO con el runner de ROLLBACK:
  cd C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend
  venv\Scripts\python.exe tests/rollback_runner.py test_kpis_ventas
Como erp_test es compartida, se afirman DIFERENCIAS entre un GET /ventas/stats antes y otro después. Se usa sufijo uuid y un db.add por objeto.
1) test_stats_solicitudes_activas_sin_soporte: SC BORRADOR 'Cotizacion de Producto', SC ASIGNADA 'Soporte Tecnico', SC CONFIRMADA sin COT y SC CANCELADA. Se espera: sc_activas +1, sc_esperan_cotizacion +1, sc_confirmadas +1, sc_canceladas +1 y sc_total +4.
2) test_stats_cotizacion_con_pedido_cancelado_cuenta_como_activa:
   - COT-A CONFIRMADA con un PVEN CANCELADO.
   - COT-B CONFIRMADA de 2.000.000 con un PVEN PENDIENTE_COMPRA.
   Se espera: cot_activas +1, cot_confirmadas +1, cot_con_pedido +1 y cot_monto_confirmado +2.000.000.
3) test_stats_pedidos_en_curso_y_dinero: cuatro pedidos.
   - PENDIENTE_COMPRA: total 1.000.000, saldo 400.000.
   - ENTREGADO: 500.000.
   - CANCELADO: 2.000.000.
   - DEVUELTO_TOTAL: 300.000.
   Se espera: pven_en_curso +1, pven_monto_vendido +1.500.000, pven_saldo_por_cobrar +400.000, pven_monto_entregado +500.000 y pven_total +4.
4) test_stats_flujo_compara_con_el_periodo_anterior: pedidos de 700.000 (hace 5 días), 300.000 (hace 40 días) y 900.000 CANCELADO (hace 3 días).
   - Con periodo=30d: flujo.vendido_cop.actual +700.000 y anterior +300.000.
   - Con periodo=7d: actual +700.000 y anterior +0.
5) test_stats_periodo_invalido_422; test_stats_asesor_lee_200 (vendedor_token); y las claves viejas sc_total, ven_monto_total, sc_por_estado y cot_por_estado siguen presentes.
6) test_paridad_con_kpis_ventas_js: GET de las tres listas con search=sufijo. Con subprocess node, como en test_estados_pedido.py, se evalúa resumenVentasLocal de frontend/src/lib/kpis-ventas.js sobre esas filas y se compara con las diferencias del stats. Se salta si no hay node.
- Ampliar backend/tests/test_estados_pedido.py con la paridad de ESTADOS_VEN_CERRADOS y ESTADOS_VEN_SIN_DINERO.
FRONTEND, nuevo frontend/tests/test_kpis_ventas.mjs:
- esScActiva excluye Soporte Tecnico.
- esCotActiva con pedidos_venta: [CANCELADO] → true; con pedidos_venta null → no se rompe.
- esPvenEnCurso('DEVUELTO_TOTAL') === false.
- resumenVentasLocal con [], undefined y filas null.
- PREDICADOS_KPI_HUB filtra por tipo.
Ampliar frontend/tests/test_estados_pedido.mjs con ESTADOS_PEDIDO_SIN_DINERO. Luego `npx tsc --noEmit` y `npm test`.
MANUAL a 1440 y 1024 px:
- El Hub muestra 4 tarjetas, en 2 filas a 1024.
- Clic en 'Solicitudes activas': aparece el chip y la tabla muestra solo SC activas.
- Pedidos de Venta: '$4.927.538' cabe.
- Cotizaciones: las 4 tarjetas son iguales.
- Al recargar se ven barras grises, no 0.
```

**Comportamiento esperado:**

```text
Definiciones únicas: el mismo nombre da el mismo número en el Hub, en la lista y en el Dashboard General.
- Solicitudes activas: SC que no están Confirmadas ni Canceladas, sin las de Soporte técnico. Antes el Hub sí las contaba.
- Cotizaciones activas: COT que no están Confirmadas ni Rechazadas, más las Confirmadas cuyo pedido se canceló. Antes el Hub decía 'Cotizaciones vigentes' sin esta regla.
- Pedidos en curso: pedidos que no están Entregados, Facturados, Cancelados ni Devueltos.
- Monto vendido: total de los pedidos sin Cancelados ni Devueltos (H47).
- Vendido (30 días): lo mismo, pero solo con los pedidos creados en los últimos 30 días. La flecha compara con los 30 días anteriores y es verde si sube.
- Saldo por cobrar: saldo de los pedidos sin Cancelados ni Devueltos.
Comportamiento de las tarjetas:
- Cuentan todos los documentos. Si la tabla todavía carga solo 200, la tarjeta puede ser mayor que la pestaña, y la ayuda de H32/H47 lo aclara ('se ven los 200 más recientes').
- Clic en el Hub (opción recomendada): la tabla del Hub muestra solo esos documentos, con el chip 'Filtro: …'. Se quita con la X, al pulsar la misma tarjeta o al cambiar de pestaña.
- En las listas, el clic abre la pestaña equivalente y vuelve a la página 1.
- Atrasados y sin gestión: ya no van dentro de las tarjetas; los muestra el semáforo.
- Mientras carga, las tarjetas y las pestañas muestran barras grises, no 0 ni 'Todas al día'. Si /ventas/stats falla, se ven las cifras calculadas con lo cargado; si fallan las listas, '—'.
- Ejemplo de la captura paso-42: 'Monto vendido $300.000' (sin los dos pedidos cancelados) y 'Saldo por cobrar $300.000'. Ninguna cifra se sale a 1024 px, porque la franja queda en 2 filas.
```

**Datos existentes:**

```text
No aplica: las cifras se calculan al vuelo desde sale_orders, sales_quotations y customer_requests. No se migra ni se corrige nada.
```

**Riesgos:**

```text
- ventas/page.tsx tiene 'máxima protección' (.agents/rules/no-full-tsx-rewrite.md) y en el Bloque 4 lo tocan también tablas, Kanban, semáforo/pipeline y Análisis. Este ítem solo cambia 5 zonas pequeñas: Promise.all, kpiCards/colorMap, render de la franja, contadores y filteredData con el chip. Conviene acordar el orden de fusión.
- Las cifras del Hub cambian a propósito:
  · 'Solicitudes activas' deja de contar Soporte.
  · 'Cotizaciones activas' suma las que tienen el pedido cancelado.
  · La cuarta tarjeta cambia de concepto según la respuesta.
  Hay que explicarlo al publicar.
- Tarjetas con todos los documentos frente a tablas con 200: pueden no coincidir mientras el grupo de tablas no pagine en el servidor. Cuando lo haga, debe usar el parámetro kpi.
- Si el grupo del semáforo no muestra los atrasados de forma visible, quitarlos de las tarjetas se sentirá como una pérdida.
- venta/[id]/page.tsx y solicitud/[id] tienen hunks sin commitear de otras sesiones (safe-return-to): hay que stagear solo el hunk propio.
- Se amplían los roles de /ventas/stats a todos los roles del ERP. Exponen los mismos datos que ya entregan las listas.
```

**Depende de:**

```text
KPI-base. Bloque 1: H32, N8, COT-LISTA y H47 (lib/listas-ventas.js y el resumen de list_pedidos), N10 (estados-pedido.js), T9 (scConCot del Hub) y R8 (setCurrentPage). Bloque 2: U24 (lib/resumen-pago.js). Si se elige paginar en el servidor, coordinar el parámetro kpi con el grupo de tablas.
```

**Archivos que nombra el diseño:** `backend/app/core/estados_pedido.py`, `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_kpis_ventas.py`, `backend/tests/test_estados_pedido.py`, `frontend/src/lib/kpis-ventas.js`, `frontend/src/lib/estados-pedido.js`, `frontend/tests/test_kpis_ventas.mjs`, `frontend/tests/test_estados_pedido.mjs`, `frontend/package.json`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/venta/venta-client.tsx`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### KPI-compras — Indicadores de Compras con un solo criterio

**Grupo:** Indicadores (tarjetas KPI) · **Esfuerzo:** L · **Tareas del plan:** T1C, T2, T12, T14, T15, T16A, T16B, T19

**Para el usuario:** Hoy hay tres versiones de los estados del PEC: el Hub, la lista de pedidos y el detalle. Cada pantalla cuenta 'activos', 'en tránsito' o 'recibidos' a su manera. Por ejemplo, la pestaña Recibidos no incluye RECIBIDA, y el Hub cuenta como activos a los borradores. Además, el Hub, la lista y Abastecimiento llaman a GET /compras/stats, que no existe. Este ítem crea ese endpoint con un único criterio de grupos de estado y pone la tarjeta estándar en todas las pantallas de Compras.

**Lo que vio y aprobó el usuario:** En el Hub de Compras, Pedidos de compra, Mercancía en tránsito, Recepciones, Lista de compras y Traslados, las tarjetas usan el diseño nuevo. Lo que es igual se llama igual y da el mismo número: «Pedidos de compra activos», «En tránsito», «Con entrega vencida», «Monto en compras», «Monto por recibir» y «Recepciones por confirmar». Las cifras cuentan todos los pedidos de compra, no solo los 200 últimos. En Abastecimiento, «PEC Activos» deja de mostrar «?». Un pedido recibido por confirmación (Recibida) ya cuenta como recibido y no como borrador. La tarjeta «Regla de Separación», que era un párrafo, pasa a ser una nota corta debajo. Al tocar una tarjeta se abre la pestaña con esos mismos documentos, y el número coincide.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- La tarjeta «Cumplimiento» de Compras, ¿qué mide? («Recibido» = recepción confirmada en bodega, no el fin del seguimiento.) → **Pedidos de compra recibidos sobre los emitidos** (= recomendada)

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** «Si la respuesta es 'a tiempo'» → NO: cumplimiento_compras = «Pedidos de compra recibidos sobre los emitidos» (R9). Su punto 3 «SOLO si…» (parámetro kpi) → NO (C3). Su punto 4 (grupos-estado.js y resumenPecLocal) → NO: las etapas viven en estados-compras.js y las tarjetas leen /compras/stats (R9, R27). El «periodo con Query pattern» de su punto 2 → se valida a mano (R21).

**Cambios (diseño):**

```text
BACKEND
1) NUEVO backend/app/core/grupos_estado.py (sin FastAPI ni DB; tuplas en MappingProxyType):
   - GRUPOS_PEC:
     · borrador: BORRADOR.
     · activos: EMITIDO, ENVIADO, EN_TRANSITO, PENDIENTE_ENTREGA, PARCIALMENTE_RECIBIDA. Es la misma lista que hoy muestra Mercancía en tránsito.
     · en_transito: ENVIADO, EN_TRANSITO, PENDIENTE_ENTREGA.
     · recibidos: RECIBIDO, RECIBIDA, COMPLETADO.
     · cancelados: CANCELADO.
   - GRUPOS_RECEPCION: por_confirmar = BORRADOR; confirmadas = COMPLETADA y COMPLETADA_LOGISTICA; canceladas = CANCELADA.
   - GRUPOS_OPERACION: en_proceso = DRAFT y READY; completadas = DONE; canceladas = CANCELLED.
   - GRUPOS_LISTA_COMPRAS: pendientes = PENDIENTE; en_pedido = EN_PEDIDO; recibidos = RECIBIDO.
   - Funciones grupo_pec(e) y grupo_recepcion(e).
   Si otro ítem del Bloque 4 (Kanban o tablas) crea core/estados_pec.py con etiquetas y transiciones, GRUPOS_PEC va en ESE archivo: un solo dueño.
2) erp_compras.py: NUEVO GET /compras/stats (require_roles(*ALL_ERP_ROLES), periodo con Query pattern 7d|30d|mes). Es el endpoint que ya llaman compras/page.tsx:345, compras/pedidos/page.tsx:1325 e inventario/abastecimiento/page.tsx:32, y que hoy da error tragado.
   Devuelve en data:
   - total y por_estado.
   - borradores, activos, en_transito, recibidos, cancelados y vigentes (todos menos cancelados).
   - vencidos: activos con fecha_entrega_estimada < utcnow. Un pedido recibido ya no cuenta, aunque hoy is_overdue lo marque.
   - monto_cop: Σ total_cop de los vigentes.
   - monto_por_recibir_cop: Σ total_cop de los activos.
   - cumplimiento_pct = recibidos / (activos + recibidos) × 100, con 1 decimal, o None si el denominador es 0. Si la respuesta es 'a tiempo', se calcula con los recibidos cuya fecha de recepción confirmada (goods_receipts) es ≤ fecha_entrega_estimada.
   - pec_activos (= activos) y pec_total (= vigentes), para que abastecimiento siga leyéndolos.
   - recepciones: {por_confirmar, confirmadas, canceladas, total} sobre goods_receipts con GRUPOS_RECEPCION.
   - periodo (bloque_periodo).
   - flujo: comprado_cop y pec_nuevos como {actual, anterior}, por created_at y sin cancelados.
   La ruta '/stats' no choca con '/pedidos/{pec_id}'.
3) SOLO si el grupo de tablas pasa la lista de PEC a paginación de servidor: list_pec acepta kpi ∈ {activos, en_transito, vencidos, recibidos}, con los mismos grupos.
FRONTEND
4) NUEVO frontend/src/lib/grupos-estado.js: espejo de grupos_estado.py, con grupoPec(e), grupoRecepcion(e), grupoOperacion(e) y resumenPecLocal(pedidos, ahora) como respaldo con las mismas claves que /compras/stats.
5) compras/page.tsx (Hub; l.340-353, 462-476 y 633-653):
   - setStats ya existe y ahora trae datos.
   - Borrar kpiCards y colorMap (a ese colorMap le faltan indigo y amber y cae en purple).
   - FranjaKpis con:
     · pec_activos: ayuda vencidos > 0 ? `${vencidos} con entrega vencida` (tono alerta) : 'Todos en fecha'.
     · pec_en_transito: clic → pestaña 'En Tránsito'.
     · pec_cumplimiento: ayuda `${recibidos} recibidos de ${activos + recibidos}`.
     · Según dinero_hubs: comprado_periodo con variacion neutra, o pec_monto.
   - Clic en pec_activos: el mismo chip 'Filtro: …' del Hub de Ventas, con grupoPec.
   - Contadores de pestaña con Contador.
6) compras/pedidos/page.tsx (l.1325, 1376-1393 y 1565-1584):
   - FranjaKpis con:
     · pec_activos: clic → pestaña Activos.
     · pec_en_transito: clic → En Tránsito.
     · pec_vencidos: tono alerta si > 0; clic → chip de vencidos.
     · pec_monto: ayuda `${vigentes} pedidos vigentes`; clic → Todos.
   - Las pestañas Activos, En Tránsito y Recibidos se calculan con grupoPec, para que coincidan con las tarjetas. Hoy Activos no tiene PARCIALMENTE_RECIBIDA y Recibidos no tiene RECIBIDA.
   - setCurrentPage(1) en cada clic. Contadores con Contador.
   - Las tarjetas de Análisis (l.1666-1672) son del grupo de Análisis.
7) compras/transito/page.tsx (l.148-155): agregar /compras/stats al load. FranjaKpis con:
   - pec_activos: ayuda 'En seguimiento de entrega'.
   - pec_vencidos: clic → setOnlyOverdue(true).
   - pec_avance: texto `${promedioEtapas}/${promedioTotalEtapas}` calculado en el navegador, porque necesita tracking_stages.
   - pec_monto_por_recibir: sin gradient.
8) compras/recepciones/page.tsx (l.127-128, 190-196 y 260): FranjaKpis con:
   - rec_por_confirmar: clic → Pendientes.
   - rec_confirmadas: clic → Completadas.
   - pec_en_transito.
   - nota='La recepción física suma stock; la recepción logística solo registra el evento.' Reemplaza la tarjeta 'Regla de Separación'.
   Las pestañas y isPending usan grupoRecepcion. Hoy se pregunta por 'PENDIENTE', estado que no existe, y COMPLETADA_LOGISTICA y CANCELADA salen como pendientes con el botón Confirmar.
9) compras/lista-compras/page.tsx (l.271-274): lista_pendientes, lista_en_pedido, lista_recibidos y lista_total, desde /compras/lista-compras/stats, que ya existe. Clic → pestaña Pendiente, En Pedido, Recibido o Todos, con setCurrentPage(1). Contador en las pestañas.
10) compras/traslados/page.tsx (l.161-162 y 206-209) e inventario/traslados/page.tsx (l.47-48 y 74-77), con el mismo cambio en las dos:
    - FranjaKpis con tras_en_proceso, tras_completados, bodegas y tras_total.
    - en_proceso y completados se calculan con grupoOperacion.
    - El total sale de 'total' de la respuesta: el wrapper local hoy lo descarta, así que se lee del cuerpo crudo. Si total > cargados, la ayuda dice 'se ven los N más recientes'.
    - Los clics hacen setCurrentPage(1); hoy los StatCard no lo hacen.
    - Sin gradient.
11) frontend/package.json: agregar '&& node tests/test_grupos_estado.mjs'.
```

**Pruebas (diseño):**

```text
BACKEND, nuevo backend/tests/test_compras_stats.py. SOLO con el runner de ROLLBACK:
  cd C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend
  venv\Scripts\python.exe tests/rollback_runner.py test_compras_stats
Se afirman diferencias antes/después.
1) test_stats_grupos_pec: un PurchaseOrderFull por estado (BORRADOR, EMITIDO, EN_TRANSITO, PARCIALMENTE_RECIBIDA, RECIBIDA, RECIBIDO, CANCELADO). Se espera: borradores +1, activos +3, en_transito +1, recibidos +2, cancelados +1 y vigentes +6.
2) test_vencidos_solo_cuenta_activos: un EMITIDO con fecha −3 días suma 1; un RECIBIDO con fecha −3 días suma 0.
3) test_cumplimiento_y_montos: monto_por_recibir_cop y monto_cop crecen lo esperado. Con solo pedidos nuevos, cumplimiento_pct coincide con la fórmula aplicada a los totales devueltos.
4) test_flujo_comprado: pedidos a −5 y −40 días, y uno CANCELADO a −2 días. Con periodo=30d: actual +X y anterior +Y.
5) test_recepciones_por_grupo: goods_receipts BORRADOR, COMPLETADA_LOGISTICA y CANCELADA → por_confirmar +1, confirmadas +1 y canceladas +1.
6) test_stats_roles: vendedor_token y bodega devuelven 200; pec_activos y pec_total siguen presentes.
7) test_paridad_grupos_estado_js: con node, comparar GRUPOS_* de frontend/src/lib/grupos-estado.js con los de grupos_estado.py. Se salta si no hay node.
FRONTEND, nuevo frontend/tests/test_grupos_estado.mjs:
- grupoPec('RECIBIDA') === 'recibidos'; grupoPec('PARCIALMENTE_RECIBIDA') === 'activos'; un estado desconocido da null.
- grupoRecepcion('COMPLETADA_LOGISTICA') === 'confirmadas'.
- resumenPecLocal con vencidos y con fechas nulas.
Luego `npx tsc --noEmit` y `npm test`.
MANUAL:
- Hub de Compras y Pedidos de compra a 1024 px.
- Clic en 'En tránsito': la pestaña muestra el mismo número.
- Abastecimiento muestra un número en 'Pedidos de compra activos'.
```

**Comportamiento esperado:**

```text
- Pedidos de compra activos: los emitidos al proveedor y no recibidos del todo (Emitido, Enviado, En tránsito, Pendiente de entrega, Parcialmente recibido). Los borradores se cuentan aparte.
- En tránsito: Enviado, En tránsito y Pendiente de entrega.
- Con entrega vencida: activos con fecha estimada pasada. Un pedido ya recibido no cuenta.
- Recibidos: Recibido, Recibida y Completado.
- Cumplimiento: recibidos sobre emitidos (activos + recibidos).
- Monto en compras: todo lo no cancelado. Monto por recibir: solo los activos.
- Comprado (30 días): pedidos de compra creados en la ventana, con el % contra la anterior en gris (ni bueno ni malo).
- Recepciones por confirmar: solo Borrador. Las logísticas y las canceladas ya no aparecen como pendientes ni muestran el botón Confirmar.
- Las tarjetas cuentan todos los PEC. Mercancía en tránsito y la lista pueden mostrar menos filas mientras carguen 200.
- Al tocar una tarjeta: pestaña equivalente, página 1 y el mismo número.
- Carga y errores: igual que KPI-base. Abastecimiento ya no muestra '?'.
```

**Datos existentes:**

```text
No aplica: se calcula al vuelo. No se cambian estados de PEC ni de recepciones.
```

**Riesgos:**

```text
- compras/page.tsx tiene // @ts-nocheck y 'máxima protección': los cambios deben ser quirúrgicos (kpiCards/colorMap, render y contadores).
- Cambiar las pestañas de compras/pedidos a grupoPec cambia lo que muestran: RECIBIDA aparece en Recibidos y PARCIALMENTE_RECIBIDA en Activos. Es correcto, pero visible. Si el grupo de tablas también toca esas pestañas, se acuerda que usen grupos-estado.js.
- El Kanban de Compras también agrupa estados: debe usar el mismo GRUPOS_PEC, en un solo archivo.
- En Recepciones, el botón 'Confirmar' deja de aparecer en recepciones logísticas o canceladas. Es correcto según el backend, pero alguien podría echarlo de menos.
- Las tarjetas cuentan todos los PEC y las tablas cargan 200: pueden diferir con mucho volumen.
```

**Depende de:**

```text
KPI-base (TarjetaKpi, FranjaKpis, Contador y core/periodos.py). Coordinar GRUPOS_PEC con el ítem del Bloque 4 que defina estados y transiciones del PEC (Kanban o tablas), si lo hay.
```

**Archivos que nombra el diseño:** `backend/app/core/grupos_estado.py`, `backend/app/api/v1/erp_compras.py`, `backend/tests/test_compras_stats.py`, `frontend/src/lib/grupos-estado.js`, `frontend/tests/test_grupos_estado.mjs`, `frontend/package.json`, `frontend/src/app/dashboard/compras/page.tsx`, `frontend/src/app/dashboard/compras/pedidos/page.tsx`, `frontend/src/app/dashboard/compras/transito/page.tsx`, `frontend/src/app/dashboard/compras/recepciones/page.tsx`, `frontend/src/app/dashboard/compras/lista-compras/page.tsx`, `frontend/src/app/dashboard/compras/traslados/page.tsx`, `frontend/src/app/dashboard/inventario/traslados/page.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### KPI-inventario — Indicadores de Inventario con existencias reales

**Grupo:** Indicadores (tarjetas KPI) · **Esfuerzo:** L · **Tareas del plan:** T1C, T13, T17, T18, T19

**Para el usuario:** Hoy las tarjetas de Inventario no son confiables:
- El Hub calcula sobre productos inventados: físico 12+…, precio 45.000.
- Stock lee campos que /products no trae, así que todo sale en 0.
- Abastecimiento marca 'Sin stock' a todos los productos.
- El tránsito de stock-summary busca estados de PEC que ya no se usan.
Este ítem agrega un endpoint de totales reales y pone esas cifras en la tarjeta estándar.

**Lo que vio y aprobó el usuario:** El Hub de Inventario, Stock, Abastecimiento, Recepciones, Entregas y Ajustes usan la tarjeta nueva. Las cifras de existencias salen del sistema, no son inventadas ni salen siempre en 0: unidades en bodega, comprometidas, disponibles para vender, en tránsito, valor del inventario, productos bajo el mínimo y agotados. «Unidades en tránsito» da lo mismo en Inventario, Compras y el Dashboard General. Recepciones de Inventario da los mismos números que Recepciones de Compras. Entregas ya no tiene la tarjeta «Protocolo 60/40», que era un párrafo. Usa los mismos «Pedidos en curso» del Hub de Ventas y el saldo real de cada pedido según su forma de pago, ya no un 40% fijo. Mientras la tabla de una pantalla siga con datos de ejemplo, debajo de las tarjetas se lee «La tabla de abajo todavía usa datos de ejemplo».

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- ¿Cuándo una referencia cuenta como «Bajo el mínimo»? (Vale para la tarjeta, la pestaña Stock crítico, Abastecimiento y Análisis: una sola regla.) → **Cuando lo disponible llega al mínimo de esa referencia (5 si no se ha definido)** (= recomendada)

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** «Si la respuesta es 'un solo mínimo'» (admin_config, PATCH /inventory/config y el modal «Umbral») → NO: minimo_stock = «Cuando lo disponible llega al mínimo de esa referencia (5 si no se ha definido)» (R10); el modal «Umbral» se quita.

**Cambios (diseño):**

```text
BACKEND
1) backend/app/api/v1/erp_inventario.py: NUEVO GET /inventory/stats (require_roles(*ALL_ERP_ROLES)).
   Consultas agregadas, sin N+1:
   a) Físico por (sku, bodega) = SUM(inventory_levels.quantity).
   b) Reservado por (sku, bodega) = SUM(quantity_reserved) de inventory_reservations con status 'ACTIVE' y (expires_at IS NULL o expires_at > ahora).
   c) Disponible por par = max(0, físico − reservado). Es la misma regla que _calculate_sku_availability.
   d) Por SKU: físico, disponible y tránsito. El tránsito es Σ(quantity_ordered − quantity_received) de purchase_order_lines cuyo PEC está en GRUPOS_PEC['activos'] (core/grupos_estado.py, de KPI-compras), contado UNA vez por SKU.
   e) Mínimo por SKU = COALESCE(product_web_listings.alerta_stock_minimo, 5). Si la respuesta es 'un solo mínimo': admin_config 'inventario_stock_minimo' (por defecto 5), guardado por un PATCH /inventory/config solo para ADMIN desde el modal 'Umbral' del Hub, que hoy no guarda.
   Se excluyen los SKU con rastrear_inventario = false.
   Respuesta en data:
   - skus_total, unidades_fisicas, unidades_reservadas, unidades_disponibles y unidades_en_transito.
   - valor_inventario_cop = Σ físico × cost_price, con redondear_peso.
   - skus_sin_costo.
   - skus_agotados: disponible 0.
   - skus_bajo_minimo: 0 < disponible ≤ mínimo.
   - skus_abastecidos: disponible > mínimo.
   - disponibilidad_pct = disponibles / físicas × 100, con 1 decimal, o None.
   - bodegas = COUNT(warehouses).
2) _calculate_sku_availability (erp_inventario.py l.430-437): el tránsito pasa de p.estado IN ('CONFIRMADA','ENVIADA','PARCIALMENTE_ENVIADA','PARCIALMENTE_RECIBIDA') a GRUPOS_PEC['activos']. Los PEC reales usan EMITIDO, EN_TRANSITO…, así que hoy casi siempre da 0. Con el cambio, /disponibilidad y /stock-summary dicen lo mismo que /inventory/stats.
3) /ventas/stats (KPI-ventas) ya trae pven_en_curso, pven_saldo_en_curso y ven_por_estado para Entregas: no hace falta otro endpoint.
FRONTEND
4) inventario/page.tsx (Hub; l.185-203 y 369-389):
   - Agregar /inventory/stats al load.
   - Borrar kpiCards y colorMap.
   - FranjaKpis con:
     · inv_valorizacion: ayuda `${skus_sin_costo} referencias sin costo` si > 0.
     · inv_skus: ayuda `${unidades_fisicas} unidades en bodega`.
     · inv_bajo_minimo: ayuda `${skus_agotados} agotados`; tono alerta si hay agotados o bajo mínimo; clic → pestaña 'Stock Crítico'.
     · inv_disponibilidad: ayuda `${unidades_reservadas} comprometidas`.
   - nota='La tabla de abajo todavía usa datos de ejemplo' mientras la tabla siga con mappedProducts. Se quita cuando el grupo de tablas la conecte.
5) inventario/stock/page.tsx (l.139-142): inv_fisico, inv_reservado, inv_disponible e inv_en_transito desde /inventory/stats (hoy todo da 0). Lleva la misma nota mientras la tabla siga leyendo /products.
6) inventario/abastecimiento/page.tsx (l.32, 51-53 y 95-98):
   - inv_agotados: clic → 'Urgente (0 stock)'.
   - inv_bajo_minimo: clic → 'Bajo Minimo'.
   - inv_abastecidos: clic → 'En Orden'.
   - pec_activos desde /compras/stats, ahora real. Sin gradient.
   - La nota se muestra mientras getStatus lea current_stock y low_stock_alert, campos que no existen.
7) inventario/recepciones/page.tsx (l.73-76):
   - rec_por_confirmar y rec_confirmadas desde el bloque 'recepciones' de /compras/stats: los mismos números que Compras/Recepciones.
   - bodegas y rec_total.
   - Las pestañas 'Por Confirmar' y 'Completadas' usan grupoRecepcion. Hoy preguntan por 'CONFIRMADA', estado que no existe.
   - Contador en las pestañas.
8) inventario/entregas/page.tsx (l.133-139 y 186-190):
   - Agregar /ventas/stats al load. FranjaKpis con:
     · pven_en_curso ('Pedidos en curso', el mismo nombre y número que el Hub de Ventas): ayuda 'Por despachar'.
     · ent_saldo = kpis.pven_saldo_en_curso: ayuda 'Según la forma de pago de cada pedido'.
     · ent_despachados = ven_por_estado.ENTREGADO + FACTURADO. Hoy cuenta 'COMPLETADO', que no existe, y deja FACTURADO como pendiente.
   - nota='Si la mercancía llegó y falta el saldo, contacta al cliente antes de generar la guía.' Reemplaza 'Protocolo 60/40'.
   - Las pestañas de la tabla no se tocan.
9) inventario/ajustes/page.tsx (l.92-93 y 114-119):
   - aju_total: el total de la respuesta, con la ayuda 'se ven los N más recientes' si aplica.
   - aju_entradas: clic → Entradas.
   - aju_salidas: clic → Salidas.
   - aju_neto: con signo, sin gradient.
   (Los dos Traslados van en KPI-compras.)
```

**Pruebas (diseño):**

```text
BACKEND, nuevo backend/tests/test_inventario_stats.py. SOLO con el runner de ROLLBACK:
  cd C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend
  venv\Scripts\python.exe tests/rollback_runner.py test_inventario_stats
Se afirman diferencias antes/después y se crean los SKU con sufijo uuid.
1) test_stats_fisico_reservado_disponible:
   - SKU-A: 10 unidades en la bodega 1, una reserva ACTIVE de 4 y una reserva vencida de 3.
   - SKU-A tiene costo 1.000.
   Se espera: unidades_fisicas +10, unidades_reservadas +4, unidades_disponibles +6 y valor_inventario_cop +10.000.
2) test_stats_minimo_por_referencia: SKU-A con 6 disponibles (mínimo 5), SKU-B con 3 y SKU-C con 0. Se espera: skus_abastecidos +1, skus_bajo_minimo +1 y skus_agotados +1.
3) test_stats_transito_con_grupos_pec: un PEC EN_TRANSITO con una línea de 6 pedidas y 2 recibidas, más un PEC CANCELADO con otra línea. Se espera: unidades_en_transito +4.
4) test_disponibilidad_usa_los_mismos_estados: GET /inventory/disponibilidad/{sku} del SKU anterior → stock_en_transito == 4. Hoy da 0.
5) test_stats_sin_costo_y_roles: skus_sin_costo crece con un SKU sin cost_price; vendedor_token devuelve 200.
FRONTEND: no hay lógica pura nueva. Los ids inv_* y ent_* quedan cubiertos por test_kpis.mjs, de KPI-base. Luego `npx tsc --noEmit` y `npm test`.
MANUAL:
- Stock ya no está todo en 0.
- Entregas sin la tarjeta de párrafo, y su 'Pedidos en curso' igual al del Hub de Ventas.
- Recepciones da el mismo número en las dos pantallas.
```

**Comportamiento esperado:**

```text
- Unidades en bodega: lo que hay físicamente.
- Comprometidas: reservas activas que no vencieron.
- Disponibles para vender: físico menos comprometido, nunca negativo.
- Unidades en tránsito: lo pedido al proveedor y no recibido, en pedidos de compra activos. Es la misma regla que 'Pedidos de compra activos'.
- Valor del inventario: físico × costo. Las referencias sin costo se avisan en la ayuda.
- Bajo el mínimo / Agotados / Bien abastecidos: se calculan por referencia, con su mínimo. Si no tiene, el mínimo es 5.
- Entregas:
  · 'Pedidos en curso' da el mismo número que el Hub de Ventas.
  · El saldo es el real de cada pedido (Bloque 1: anticipo según la modalidad), no un 40% supuesto.
  · Despachados son Entregado + Facturado.
- Recepciones da el mismo número en Compras y en Inventario.
- Mientras una tabla siga con datos de ejemplo o con el origen equivocado, la franja lo dice en su nota, para que nadie compare la tarjeta con la tabla sin saberlo.
- Carga y errores: igual que KPI-base.
```

**Datos existentes:**

```text
No aplica: se calcula al vuelo. No se tocan existencias, reservas ni PEC. Con la opción 'un solo mínimo' solo se agrega la clave inventario_stock_minimo cuando un administrador la guarda.
```

**Riesgos:**

```text
- Las tablas del Hub, de Stock y de Abastecimiento siguen con datos inventados o con el origen equivocado hasta que el grupo de tablas las conecte (a /inventory/stock-summary con los mismos grupos y mínimos). Por eso va la nota. Sin ella, la tarjeta y la tabla se contradirían.
- Cambiar el tránsito en _calculate_sku_availability cambia /disponibilidad y /stock-summary, que hoy casi siempre dan 0. Es una mejora, pero visible.
- stock-summary repite el tránsito por bodega. Si una tabla lo suma por fila, cuenta doble. Hay que avisarlo al grupo de tablas.
- Con muchas referencias, /inventory/stats hace pocas consultas agregadas, pero las une en Python. Es aceptable para miles de SKU.
- Las cifras de Entregas cambian: los FACTURADO salen de la cola y el saldo deja de ser el 40%.
```

**Depende de:**

```text
KPI-base. KPI-compras (core/grupos_estado.py, lib/grupos-estado.js y el bloque de recepciones de /compras/stats). KPI-ventas (/ventas/stats con pven_en_curso, pven_saldo_en_curso y ven_por_estado). Bloque 1 (anticipo por modalidad: saldo_cop real).
```

**Archivos que nombra el diseño:** `backend/app/api/v1/erp_inventario.py`, `backend/tests/test_inventario_stats.py`, `frontend/src/app/dashboard/inventario/page.tsx`, `frontend/src/app/dashboard/inventario/stock/page.tsx`, `frontend/src/app/dashboard/inventario/abastecimiento/page.tsx`, `frontend/src/app/dashboard/inventario/recepciones/page.tsx`, `frontend/src/app/dashboard/inventario/entregas/page.tsx`, `frontend/src/app/dashboard/inventario/ajustes/page.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### KPI-otros — Indicadores del Dashboard, CRM, Agenda, Marketing y Tienda

**Grupo:** Indicadores (tarjetas KPI) · **Esfuerzo:** M · **Tareas del plan:** T3A, T3C, T20, T22, T23A, T23B

**Para el usuario:** Fuera de Ventas, Compras e Inventario quedan pantallas con tarjetas propias:
- El Dashboard General calcula sobre los 50 pedidos más recientes, con estados que no existen y existencias inventadas.
- La Agenda lee claves que el backend no manda (financials, quotations, sales_orders, customer_requests), así que todo sale en 0 y 'Al día con pagos'.
- En Seguimientos del CRM, el punto de color no se pinta (s.color es una clase, no un color).
- Marketing tiene la grilla fija de 4 y textos sin tilde.
Este ítem las pasa a la tarjeta estándar y a las cifras de los endpoints de los Hubs.

**Lo que vio y aprobó el usuario:** El Dashboard General muestra los mismos números que los Hubs: lo vendido, el ticket promedio, el saldo por cobrar y los clientes, más la fila de inventario con unidades en bodega, comprometidas, disponibles y en tránsito. Ya no suma pedidos cancelados ni inventa existencias, y los botones Semana y Mes cambian el período con el que se compara. En la ficha del cliente de la Agenda, «Saldo por cobrar», «Total pagado», el número de pedidos y las cotizaciones activas dejan de salir siempre en 0. Seguimientos del CRM, Marketing, Campañas y la Tienda en línea usan la tarjeta nueva, con nombres con tilde. La Tienda compara las ventas de hoy con las de ayer y las del mes con el mismo tramo del mes pasado, en hora de Colombia. Las pantallas que muestran números de ejemplo llevan la marca «Datos de ejemplo».

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- (Pregunta del diseño fusionada por el crítico) Las pantallas que hoy muestran números de ejemplo (Visitantes, Scrapper, Integraciones, Finanzas › Resumen y Operaciones de Inventario), ¿también cambian de tarjeta? → reemplazada por «pantallas_sin_datos» (en TABLA-inventario), respondida: «Quitarlas del menú hasta conectarlas» (R14).

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** Punto 7 «Opción 0/1/2» (pantallas con datos de ejemplo) → ninguna: esas pantallas salen del menú y no se editan (R14); finanzas/resumen se conecta a datos reales en T22.

**Cambios (diseño):**

```text
1) dashboard/page.tsx (Torre de Control):
   - En el load, las tarjetas pasan a leer /ventas/stats?periodo=…, /compras/stats y /inventory/stats. Se conserva /crm/customers para contar clientes, y las listas 'Recientes' (slice 3) siguen con sus llamadas.
   - Se borra el respaldo inventado de existencias (l.93-99).
   - 'Flujo Canónico del Inventario' (l.332-416) pasa a FranjaKpis con:
     · inv_fisico, inv_reservado e inv_disponible.
     · inv_en_transito, con ayuda `${pec_activos} pedidos de compra activos`.
     Se quitan las pastillas 'Paso N' y los textos de relleno.
   - '4 KPIs Vitales' (l.418-464) pasa a FranjaKpis con:
     · Según dinero_hubs: vendido_periodo con variacion (stats.flujo), o pven_monto_vendido.
     · ticket_promedio = pven_monto_vendido / pven_con_dinero.
     · pven_saldo_por_cobrar: deja de calcularse como total − anticipo.
     · clientes_total.
   - El selector Hoy/Semana/Mes (timeRange, que hoy no hace nada) pasa a 'Semana' = '7d', '30 días' = '30d' y 'Mes' = 'mes', y se envía como periodo a /ventas/stats y /compras/stats. Por defecto, PERIODO_KPI. Se quita 'Hoy'.
   - El 'Embudo Operativo' (con estados que no existen) NO se toca aquí: es del grupo del pipeline/semáforo.
2) crm/calendario/page.tsx (l.126-140): FranjaKpis con:
   - Las 3 primeras etapas: TarjetaKpi con etiqueta = s.name, icono 'Circle', color = acentoDesdeClase(s.color), valor = conteo. Esto arregla el color, que hoy se pasa como CSS inválido. Clic → setActiveStage, con activo cuando está elegida.
   - kpi='leads_total' con valor leads.length y ayuda `${urgentes} sin actividad hace más de 7 días`. Clic → 'all'. Sin gradient.
3) agenda/page.tsx, ficha del cliente (l.1242-1244 y 1325-1357):
   - Se usa resumenFichaCliente(customer360), de lib/kpis-ventas.js, con las claves reales: resumen_financiero.saldo_pendiente_cop, total_comprado_cop y total_pagado_cop, y pedidos, cotizaciones y solicitudes.
   - FranjaKpis con:
     · pven_saldo_por_cobrar ('Saldo por cobrar'): tono alerta si > 0; tono bien y 'Al día con pagos' si es 0.
     · cli_total_comprado: ayuda `${pedidos} pedidos`.
     · cli_total_pagado.
     · cot_activas: estado fuera de CONFIRMADA y RECHAZADA; ayuda `${scActivas} solicitudes activas`.
   - Si resumen_financiero es null (BODEGA o COMPRAS): '—' con la ayuda 'Sin permiso para ver montos'.
   - Ficha del proveedor (l.836-853): FranjaKpis con formato 'texto' para 'Condiciones de pago', 'Moneda', 'Tiempo de entrega' (`${n} días`) y 'Pedidos de compra' (número).
4) marketing/page.tsx (l.49-62): FranjaKpis con estado = useEstadoKpi(loading). Desaparece el '...'.
   - camp_activas: ayuda `${campanas_total} campañas en total`.
   - leads_capturados: ayuda `${leads_convertidos} convertidos (${tasa}%)`.
   - ventas_atribuidas: ayuda `Retorno: ${roi}%`.
   - flujos_activos: sin gradient.
   Se quita grid-cols-4 fijo.
   marketing/campanas/page.tsx (l.292-295): leads_capturados, leads_convertidos, ventas_atribuidas y roi (porcentaje con signo; tono bien si es positivo y alerta si es negativo).
5) ecommerce/page.tsx (l.449-460) y backend/app/api/v1/ecommerce.py get_ecommerce_stats (l.454):
   - El backend usa hoy_colombia() / ventanas('mes') de core/periodos.py, en lugar de date.today() del servidor.
   - Agrega revenue_ayer, web_orders_ayer, revenue_mes_anterior y web_orders_mes_anterior, este último del mismo tramo del mes pasado.
   - Tarjetas:
     · web_ventas_hoy: variacion contra ayer, textoPeriodo 'vs ayer'.
     · web_ventas_mes: variacion, textoPeriodo 'vs mes pasado'.
     · carritos_abandonados: tono alerta si > 0; ayuda `${valor} sin cerrar`.
     · productos_publicados.
   - estado = useEstadoKpi(statsLoading).
6) asistente_omnicanal/page.tsx (l.496-519): solo nombres y formato.
   - 'Revenue Total (Ventas)' → 'Total comprado'; 'Total Pedidos' → 'Pedidos'; 'Activos' → 'En curso'; 'Ticket Promedio' → 'Ticket promedio'.
   - formatoPesos en lugar de formatCOP(...).split(',').
   - La tarjeta oscura del cliente se conserva: no es una franja de indicadores.
7) Pantallas con datos de ejemplo, según pantallas_ejemplo:
   - Pantallas: marketing/visitantes (l.43-60), scrapper (l.50-85), integraciones (l.37-56), finanzas/resumen (la cascada de l.52-100; sus gráficos son del grupo de Análisis) e inventario/operaciones (l.47).
   - Opción 0: FranjaKpis ejemplo, con cifras en formato colombiano (finanzas: '$45,200' → formatoPesos) y sin grid-cols-4 fijo.
   - Opción 1: igual, sin la marca.
   - Opción 2: no se tocan.
Fuera de este ítem: cotiza (es el resultado de un cálculo, no una franja), los detalles de SC y COT (no tienen indicadores) y la vista Análisis del CRM (grupo de Análisis).
```

**Pruebas (diseño):**

```text
BACKEND, nuevo backend/tests/test_ecommerce_stats_variacion.py. SOLO con el runner de ROLLBACK:
  cd C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend
  venv\Scripts\python.exe tests/rollback_runner.py test_ecommerce_stats_variacion
- Pedidos WEB creados hoy y ayer en hora de Colombia, y uno CANCELADO hoy.
- Se afirman las diferencias en revenue_today y revenue_ayer; el cancelado no suma.
- revenue_mes_anterior crece con un pedido del mismo tramo del mes pasado.
FRONTEND: en frontend/tests/test_kpis_ventas.mjs, casos de resumenFichaCliente:
- con la forma real de profile-360 (resumen_financiero, pedidos, cotizaciones, solicitudes);
- con resumen_financiero null → sinPermiso true;
- con el objeto vacío → ceros.
En test_kpis.mjs (KPI-base): casos de acentoDesdeClase.
Luego `npx tsc --noEmit` y `npm test`.
MANUAL:
- Dashboard General: la cifra de 'Saldo por cobrar' es igual a la de Pedidos de Venta, y Semana/Mes cambia el % de la tarjeta de dinero.
- Agenda: el cliente de prueba muestra su saldo.
- Seguimientos: se ven los puntos de color.
```

**Comportamiento esperado:**

```text
- El Dashboard General y los Hubs muestran exactamente las mismas cifras para el mismo nombre, porque leen el mismo endpoint.
- 'Monto vendido' ya no incluye cancelados y el saldo es el saldo real. Puede bajar respecto a hoy, y es lo correcto.
- Las existencias del Dashboard ya no se inventan: si no hay datos, salen 0 reales.
- El selector Semana / 30 días / Mes cambia el período de la flecha de las tarjetas de dinero del Dashboard.
- Agenda: los valores reales del cliente aparecen por primera vez. Bodega y Compras ven '—' en el dinero.
- Tienda: 'hoy' y 'mes' se cuentan en hora de Colombia. Las ventas de las 7 p. m. ya no pasan al día siguiente.
- Seguimientos: el punto de color de cada etapa se ve, y la tarjeta elegida queda resaltada.
```

**Datos existentes:**

```text
No aplica: se calcula al vuelo.
```

**Riesgos:**

```text
- Las cifras del Dashboard General cambian a la vista de todos (bajan al quitar cancelados y existencias inventadas). Conviene anunciarlo.
- dashboard/page.tsx depende de los tres endpoints nuevos: si alguno falla, solo su franja muestra '—'; las demás siguen.
- El 'hoy' de la Tienda en hora de Colombia cambia las cifras de la noche respecto a las de ayer.
- Las pantallas de ejemplo con la marca pueden parecer 'rotas' a quien no sabía que eran de muestra. Es la razón de la pregunta.
- La agenda tiene más claves equivocadas (Historial Comercial lee customer_requests). El Bloque 2 lo dejó para otra tarea y este ítem no lo toca.
```

**Depende de:**

```text
KPI-base. KPI-ventas (/ventas/stats y resumenFichaCliente). KPI-compras (/compras/stats). KPI-inventario (/inventory/stats). Bloque 3 B3-T0 (core/fechas.py, para la Tienda).
```

**Archivos que nombra el diseño:** `frontend/src/app/dashboard/page.tsx`, `frontend/src/app/dashboard/crm/calendario/page.tsx`, `frontend/src/app/dashboard/agenda/page.tsx`, `frontend/src/app/dashboard/marketing/page.tsx`, `frontend/src/app/dashboard/marketing/campanas/page.tsx`, `frontend/src/app/dashboard/marketing/visitantes/page.tsx`, `frontend/src/app/dashboard/ecommerce/page.tsx`, `frontend/src/app/dashboard/asistente_omnicanal/page.tsx`, `frontend/src/app/dashboard/scrapper/page.tsx`, `frontend/src/app/dashboard/integraciones/page.tsx`, `frontend/src/app/dashboard/finanzas/resumen/page.tsx`, `frontend/src/app/dashboard/inventario/operaciones/page.tsx`, `frontend/src/lib/kpis-ventas.js`, `frontend/tests/test_kpis_ventas.mjs`, `backend/app/api/v1/ecommerce.py`, `backend/tests/test_ecommerce_stats_variacion.py` (la lista que manda es la de **Files** de la tarea y R27).


### ANALISIS-api — Base del servidor para los análisis

**Grupo:** Pestañas Análisis · **Esfuerzo:** M · **Tareas del plan:** T1A

**Para el usuario:** Todas las pestañas Análisis calculan de la misma forma y con todos los documentos, sin cargar miles de filas en tu navegador. Un pedido creado a las 11 de la noche cuenta en ese día y no en el siguiente.

**Lo que vio y aprobó el usuario:** Esta pieza no se ve sola: es la base que usan todas las pestañas Análisis. Con ella, las cifras salen de todos los documentos y no solo de los primeros 200. Los días se cuentan en hora de Colombia y cada indicador trae su comparación con el período anterior.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- (Pregunta del diseño fusionada por el crítico) ¿Contra qué se compara el % de subida o bajada de cada indicador? → reemplazada por «periodo_comparacion» (en KPI-base), respondida: «Últimos 30 días contra los 30 anteriores» (R7).

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** «hoy = (ahora_utc − 5 h).date()» y cualquier desfase propio → NO: resolver_periodo vive en core/periodos.py sobre core/fechas.py del Bloque 3 (R7, C12). La pregunta comparar_con se fusionó en periodo_comparacion = «Últimos 30 días contra los 30 anteriores».

**Cambios (diseño):**

```text
NUEVO backend/app/core/analisis.py. No usa FastAPI: son funciones puras más dos expresiones SQL. Lo usan los cinco endpoints de módulo (ventas, compras, inventario, finanzas y CRM).

1) Constantes:
- PERIODOS = ('7d','30d','90d','mes','12m','personalizado') y PERIODO_POR_DEFECTO = '30d'.
- TOPS = (5,10,25) y MAX_DIAS = 731.
- DESFASE_COLOMBIA = timedelta(hours=5). Es la misma regla fija de −5 h que usa documento_cliente.fecha_colombia del Bloque 3: Colombia no cambia de hora y así no se depende de tzdata en Windows.

2) @dataclass(frozen=True) Periodo con estos campos:
- clave y etiqueta.
- desde y hasta: fechas de Colombia, las dos incluidas.
- anterior_desde y anterior_hasta.
- granularidad: 'dia', 'semana' o 'mes'.
- inicio_utc y fin_utc (el fin queda excluido), anterior_inicio_utc y anterior_fin_utc.
- comparado: el texto de la comparación, por ejemplo 'vs 5 ago – 3 sept'.

3) resolver_periodo(clave, desde, hasta, ahora_utc) -> Periodo. hoy = (ahora_utc − 5 h).date().
- 7d, 30d y 90d: desde = hoy − (n−1) días y hasta = hoy.
- mes: del día 1 del mes actual a hoy.
- 12m: del día 1 del mes de hace 11 meses a hoy.
- personalizado: fechas en formato 'AAAA-MM-DD'.
- Período anterior: el tramo del mismo largo justo antes. En 'mes' empieza el día 1 del mes anterior, con el mismo número de días y recortado al fin de ese mes. En '12m' son los 12 meses anteriores.
- Granularidad: hasta 31 días, 'dia'; hasta 92, 'semana' (desde el lunes); más de 92, 'mes'.
- inicio_utc = desde a las 00:00 + 5 h; fin_utc = (hasta + 1 día) a las 00:00 + 5 h.
- Errores: lanza ValueError con el texto exacto y la ruta responde 422 con ese detail. Los textos son: 'Período no válido.', 'Elige la fecha inicial y la final.', 'Las fechas deben tener el formato AAAA-MM-DD.', 'La fecha inicial debe ser anterior o igual a la final.', 'La fecha final no puede ser posterior a hoy.' y 'El período no puede ser mayor a 2 años.'

4) validar_top(top): si el valor no está en TOPS, ValueError('El ranking solo puede mostrar 5, 10 o 25.').

5) Expresiones SQL:
- expr_local(col): para un DateTime sin zona (UTC ingenuo: Ventas, Compras, Finanzas y CRM) da col − interval '5 hours'. Para un DateTime(timezone=True), como inventory_movements.created_at, da timezone('UTC', col) − interval '5 hours'. Decide según col.type.timezone.
- expr_cubeta(col, granularidad) = cast(date_trunc('day'|'week'|'month', expr_local(col)), Date). Para columnas Date (sale_order_payments.fecha) aplica date_trunc sin desfase.
- en_rango(col, ini, fin): col >= ini AND col < fin, sobre la columna cruda para que se puedan usar índices.

6) Cubetas:
- claves_cubetas(periodo, anterior=False) -> list[date].
- rellenar(filas: dict[date, número], periodo, anterior=False) -> list[float]: las cubetas vacías quedan en 0. La serie anterior se alinea por posición con la actual.

7) variacion_pct(actual, anterior) -> float|None:
- None si anterior es None, o si anterior es 0 y actual no.
- 0.0 si los dos son 0.
- En los demás casos, round((actual − anterior) / abs(anterior) × 100, 1).

8) kpi(clave, etiqueta, valor, anterior=None, formato='entero', mejor='sube', es_foto=False, ayuda=None) -> dict.

9) segmentos(filas=[(clave, etiqueta, valor, color=None)], maximo=6): quita los ceros, ordena de mayor a menor, deja 6 y suma el resto en {clave:'_otros', etiqueta:'Otros'}. pct = round(valor / total × 100, 1).

10) iso_utc(dt) -> 'AAAA-MM-DDTHH:MM:SSZ', siempre con Z. Un valor sin zona se toma como UTC.

11) dinero(v) -> int, con redondear_peso de core/ventas_dinero.py (Bloque 1).

12) respuesta(periodo, *, kpis, linea, donas, barras, movimientos, ranking, filtros, avisos=()) arma el CONTRATO ÚNICO y comprueba que las claves sean exactamente las de CLAVES_ANALISIS:
data = {
  periodo: {clave, etiqueta, desde, hasta, anterior_desde, anterior_hasta, granularidad, comparado},
  kpis: [{clave, etiqueta, valor, anterior, variacion_pct, formato ('pesos'|'entero'|'porcentaje'|'dias'|'unidades'), mejor ('sube'|'baja'|'neutro'), es_foto, ayuda}],
  linea: {titulo, formato, fechas: ['AAAA-MM-DD'...], series: [{clave, etiqueta, valores, es_anterior}], total, total_anterior, variacion_pct},
  donas: [{clave, titulo, formato, total, segmentos: [{clave, etiqueta, valor, pct, color}]}],
  barras: {titulo, formato, eje ('fechas'|'categorias'), etiquetas, series: [{clave, etiqueta, valores, tono ('positivo'|'negativo'|'neutro')}], apiladas},
  movimientos: {titulo, filas: [{tipo, numero, titulo, detalle, fecha (ISO con Z), monto, formato, signo ('+'|'-'|null), estado_etiqueta, doc_tipo, doc_id}]},
  ranking: {titulo, columna, formato, filas: [{posicion, nombre, detalle, valor, cantidad, pct}]},
  filtros: {foco, top, producto, bodega},
  avisos: [texto],
  generado_en: ISO con Z
}
Las fechas de cubeta van como 'AAAA-MM-DD' de Colombia, sin hora ni zona. Los montos van en pesos enteros.

NUEVO backend/tests/test_analisis_base.py.

No se tocan rutas, modelos ni migraciones.
```

**Pruebas (diseño):**

```text
Backend: solo con el runner de ROLLBACK, nunca con pytest completo. Desde C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend: C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe tests/rollback_runner.py test_analisis_base. Sin parametrize: una prueba por caso.
1) test_periodo_30d: con ahora = 2026-10-03 15:00 UTC → desde 2026-09-04, hasta 2026-10-03, anterior 2026-08-05..2026-09-03, granularidad 'dia', inicio_utc 2026-09-04 05:00 y fin_utc 2026-10-04 05:00.
2) test_hoy_en_hora_de_colombia: ahora = 2026-10-03 03:00 UTC → hasta 2026-10-02.
3) test_periodo_mes y test_mes_anterior_mas_corto: con 2026-10-03, el período es 2026-10-01..03 y el anterior 2026-09-01..03. Con 2026-03-31, el anterior es 2026-02-01..2026-02-28.
4) test_periodo_12m: granularidad 'mes' y desde 2025-11-01.
5) test_granularidad: 31 días → dia; 32 y 92 días → semana; 93 días → mes.
6) test_errores_de_periodo: los seis textos exactos, con clave 'xx', sin fechas, '03/10/2026', desde mayor que hasta, hasta en mañana y 800 días.
7) test_validar_top: 5, 10 y 25 pasan; 7 da el texto de error.
8) test_variacion: (120,100) → 20.0; (80,100) → −20.0; (5,0) → None; (0,0) → 0.0; (50,−100) → 150.0; anterior None → None.
9) test_rellenar: por día, por semana (claves en lunes) y por mes (claves en día 1); las cubetas vacías dan 0 y la serie anterior tiene el mismo largo.
10) test_segmentos_con_otros: 8 segmentos → 6 más 'Otros' con la suma del resto; los ceros se quitan; [] → [].
11) test_respuesta_claves_exactas: set(data) == CLAVES_ANALISIS, y lo mismo para kpi, serie, segmento, fila de movimiento y fila de ranking.
12) test_expr_local_en_la_base: con db, un SELECT de expr_local sobre el literal 2026-10-03 03:00 sin zona da 2026-10-02 22:00, y sobre un literal timestamptz da lo mismo.
13) test_iso_utc: un datetime sin zona sale terminado en 'Z'.
```

**Comportamiento esperado:**

```text
- Las reglas son las mismas para todos los módulos:
  · El día va de 00:00 a 23:59 en hora de Colombia.
  · Las semanas empiezan el lunes.
  · El período anterior tiene el mismo largo que el elegido.
- Un período inválido responde 422 con un texto en español. Ya no se cambia en silencio por 30 días, como hace hoy /ventas/analytics.
- Qué muestra el % de variación:
  · Si subió o bajó frente al período anterior.
  · 'Nuevo' cuando antes era 0 y ahora no.
  · 'Sin cambio' cuando los dos son 0.
  · Los indicadores de foto (por ejemplo, el saldo por cobrar de hoy) no llevan %.
- Cada endpoint de módulo hace un número fijo de consultas agregadas (GROUP BY, SUM, COUNT y LIMIT). No manda filas al navegador ni las recorre en Python. La meta es 14 consultas o menos por llamada, sin importar cuántos documentos haya.
- La dona muestra hasta 6 segmentos; el resto se suma en 'Otros' para que se pueda leer.
```

**Datos existentes:**

```text
No cambia datos: solo lee.
```

**Riesgos:**

```text
- date_trunc('week') empieza el lunes, así que la primera semana puede empezar antes del 'desde'. La etiqueta dice 'Sem. 1 sept', pero solo suma lo que cae desde el 'desde'.
- DESFASE_COLOMBIA repite la regla de documento_cliente.py (Bloque 3). Conviene unificarlas más adelante en un solo módulo; aquí no se toca documento_cliente.py para no chocar con el Bloque 3.
- Hoy solo inventory_movements.created_at es timestamptz. expr_local revisa el tipo de cada columna, así que sigue funcionando si otra columna se migra.
- No se agregan índices: hoy hay cientos de documentos. Si una tabla pasa de unas 50.000 filas y EXPLAIN muestra recorridos completos, se agrega una migración aditiva con índices en created_at (R13).
- Como no se aceptan fechas futuras, las pruebas usan ventanas viejas (año 2001), donde erp_test no tiene datos.
```

**Depende de:**

```text
Bloque 1: T0 (backend/tests/rollback_runner.py con la fixture contador_sql) y T1 (core/ventas_dinero.redondear_peso).
```

**Archivos que nombra el diseño:** `backend/app/core/analisis.py`, `backend/tests/test_analisis_base.py` (la lista que manda es la de **Files** de la tarea y R27).


### ANALISIS-base — Pestaña Análisis estándar (piezas compartidas)

**Grupo:** Pestañas Análisis · **Esfuerzo:** L · **Tareas del plan:** T3A, T5B, T5C, T5D

**Para el usuario:** Los números se leen de la misma forma en todo el sistema: aprendes una pantalla y ya sabes leer las demás. Cada cifra dice contra qué se compara.

**Lo que vio y aprobó el usuario:** Todas las pestañas Análisis se ven igual, como tu referencia:
- Arriba eliges el período: 7 días, 30 días, 90 días, este mes, 12 meses o las fechas que quieras.
- Luego vienen 4 indicadores, cada uno con su % de subida o bajada frente al período anterior.
- Después, un gráfico de línea en el tiempo, una dona por categoría y los movimientos recientes.
- Abajo, el ranking (Top 5, 10 o 25) y un gráfico de barras.
Mientras carga ves recuadros grises, nunca ceros, y si no hay datos te lo dice. Cada pantalla recuerda el último período que elegiste. Ya no salen cifras inventadas.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- Los asistentes de IA que hoy aparecen en las pestañas Análisis (y el Copilot del Hub de Ventas y de Pedidos de compra) no consultan nada real: responden un texto fijo. ¿Qué hacemos con ellos? → **Dejarlos visibles con el aviso «En construcción»** ⚠ distinta de la recomendada («Quitarlos hasta que llegue la IA real (Bloque 5)»)
- E-commerce, Marketing y el Dashboard general no tienen pestaña Análisis. ¿Se la agregamos con este mismo diseño? → **Todavía no; primero dejar bien las que ya existen** (= recomendada)

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** ia_en_analisis = «Dejarlos visibles con el aviso «En construcción»» (DISTINTA de la recomendada que asumió el diseño): «sin IA simulada» se cumple con AsistenteEnConstruccion (R2): visible al final de la pestaña, sin respuestas, sin endpoints y sin setTimeout. La guía (punto 4) ya no «exige una tarjeta de IA» que responda: pide la tarjeta «En construcción» hasta el Bloque 5.

**Cambios (diseño):**

```text
1) NUEVO frontend/src/lib/analisis.js. Es JS puro, sin React, y se prueba con node.
- PERIODOS: [{clave:'7d', etiqueta:'7 días'}, {'30d','30 días'}, {'90d','90 días'}, {'mes','Este mes'}, {'12m','12 meses'}, {'personalizado','Personalizado'}]. PERIODO_POR_DEFECTO = {clave:'30d'}. TOPS = [5,10,25].
- validarPeriodo(p) -> p | null. Exige fechas 'AAAA-MM-DD', desde ≤ hasta, sin fechas futuras y como máximo 731 días. Usa los mismos textos que el servidor.
- leerPreferencias(storage, modulo) -> {periodo, top} y guardarPreferencias(storage, modulo, valor). La clave es 'nebulae:analisis:<modulo>'. Lectura y escritura van en try/catch: si el JSON está dañado o el storage lanza un error, se usan los valores por defecto.
- consultaAnalisis(periodo, top, extra) -> 'periodo=30d&top=5&foco=hub'. desde y hasta solo se agregan en personalizado, y los extra vacíos se omiten.
- infoVariacion(pct, mejor, esFoto) -> {texto, tono:'bueno'|'malo'|'neutro', flecha:'sube'|'baja'|null, lector}. Los textos posibles son '+12,5 %', '−3 %', 'Nuevo', 'Sin cambio', 'Hoy' (foto) y '—'. El tono depende de 'mejor': si es 'baja', bajar es bueno.
- formatearValor(v, formato):
  · pesos: con formatoPesos de lib/pesos.js (Bloque 1).
  · entero: '1.234'.
  · porcentaje: '45,2 %'.
  · dias: '3,5 días'.
  · unidades: '1.234 u.'
  · null: '—'. Nunca inventa un número.
- pesosCorto(v), para los ejes: '$4,9 M', '$12 M', '$450 mil', '$900', '-$2,5 M'.
- etiquetaFecha: ('2026-09-04','dia') → '4 sept'; ('2026-09-01','semana') → 'Sem. 1 sept'; ('2026-09-01','mes') → 'sept 2026'. Los meses salen de una tabla propia y no de Intl, para que el resultado no cambie con la versión de ICU. La fecha se lee por partes, sin zona horaria.
- Colores:
  · PALETA, en orden fijo: #4f46e5, #0d9488, #f59e0b, #0ea5e9, #8b5cf6, #e11d48, #65a30d, #64748b.
  · GRIS_OTROS #cbd5e1, para 'Otros' y los segmentos 'Sin …'.
  · COLOR_ANTERIOR #94a3b8, POSITIVO #059669 y NEGATIVO #e11d48.
  · colorSegmento(i, seg) usa seg.color si viene.
- hexDeClaseTailwind('bg-blue-500') → '#3b82f6'. Cubre las 12 clases de COLOR_HEX del CRM más bg-red-500; una clase desconocida da '#94a3b8'.
- enlaceDocumento(tipo, id):
  · SC → /dashboard/ventas/solicitud/{id}
  · COT → /dashboard/ventas/cotizacion/{id}
  · PVEN → /dashboard/ventas/venta/{id}
  · PEC → /dashboard/compras/pedidos?id={id}
  · ENINV → /dashboard/compras/recepciones/{id}
  · GASTO → /dashboard/finanzas/gastos
  · KARDEX → /dashboard/inventario/kardex
  · Cualquier otro tipo → null.
- normalizarAnalisis(resp): toma resp.data y completa las claves que falten con null o []. Nunca rellena cifras.
- resumenAccesible(linea) → por ejemplo 'Ventas en el tiempo: total $4.927.538, subió 12,5 % frente al período anterior'.

2) NUEVO frontend/src/components/analisis/ (todos 'use client'):
- registro.ts: ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend), una sola vez. Valores por defecto: la fuente de la app, animación de 400 ms (0 si el usuario pide menos movimiento con prefers-reduced-motion) y tooltips con formatearValor.
- PanelAnalisis.tsx. Props:
  · modulo: string, la clave para recordar el período y el Top: 'ventas', 'ventas-sc', 'ventas-cot', 'ventas-pven', 'compras', 'inventario', 'finanzas' o 'crm'.
  · endpoint: string, por ejemplo '/ventas/analisis'.
  · params?: Record<string,string>, por ejemplo {foco:'hub'}.
  · acento?: AccentColor (de components/ui/colors.ts).
  · busquedaProducto?: boolean. Muestra el input 'Producto', espera 400 ms y manda producto=.
  · controlesExtra?: ReactNode, por ejemplo el select de bodega; su valor llega por params.
  · etiquetar?: (bloque:'dona'|'ranking'|'barras', clave, etiqueta) => string.
  · alAbrirMovimiento?: (fila) => void. Si no viene, usa enlaceDocumento con <Link>.
  · pie?: ReactNode.
  Estado: periodo y top (con leerPreferencias y guardarPreferencias), producto, modoDona, datos, cargando y error.
- useAnalisis.ts:
  · Pide los datos con apiFetch (lib/api.ts) y un AbortController.
  · Si cambias el período, cancela la petición anterior.
  · Mientras recarga, deja los datos anteriores atenuados en vez de borrarlos.
  · Separa el 403 ('No tienes permiso para ver este análisis.') de los demás errores.
- SelectorPeriodo.tsx: píldoras con PERIODOS, que se vuelven un <select> en anchos chicos. 'Personalizado' muestra dos <input type=date> con un botón 'Aplicar' y el error en línea. Debajo aparece 'Comparado con 5 ago – 3 sept', que es periodo.comparado del servidor.
- FilaKpis.tsx: de 3 a 5 tarjetas con la TARJETA ESTÁNDAR de KPI del grupo kpis (U3). En el pie va ChipVariacion, la ayuda va en un ícono (i) con title y, mientras carga, la tarjeta se muestra como esqueleto.
- ChipVariacion.tsx: flecha, texto y color según infoVariacion, más un texto para lector de pantalla.
- GraficoLinea.tsx (<Line>):
  · La serie actual lleva un área en degradado del color del módulo; la anterior va gris punteada y sin área.
  · Los puntos están ocultos y aparecen de 4 px al pasar el mouse.
  · Eje Y con pesosCorto o enteros; eje X con etiquetaFecha, máximo 8 marcas.
  · Encabezado con el total en grande y ChipVariacion.
  · Alto fijo de 256 px, con maintainAspectRatio:false.
- GraficoDona.tsx (<Doughnut>, cutout 72%): el total va en el centro, en HTML encima y sin plugin. La leyenda es HTML con color, etiqueta, valor y %. Si data.donas trae 2 modos, muestra píldoras para cambiar.
- GraficoBarras.tsx (<Bar>): con eje 'fechas' son barras verticales y con 'categorias', horizontales. El tono 'negativo' dibuja la barra hacia abajo, como el flujo de caja de la referencia. Puede apilarlas.
- ListaMovimientos.tsx: hasta 8 filas, cada una con ícono por tipo, título, detalle, fecha relativa ('hace 2 h', 'ayer', '3 sept'), monto con signo y color, y la etiqueta del estado.
- RankingTop.tsx: píldoras Top 5/10/25. Cada fila tiene la posición (las 3 primeras con medalla), el nombre, el detalle, una barra proporcional y el valor.
- EsqueletoAnalisis.tsx: la misma grilla con bloques grises.
- PanelAnalisisPerezoso.tsx: dynamic(() => import('./PanelAnalisis'), {ssr:false, loading: EsqueletoAnalisis}). Las pantallas importan ESTE componente, así chart.js solo se descarga cuando abres la pestaña Análisis.
- index.ts.
- Cada gráfico es un <canvas role='img'> con aria-label = resumenAccesible, más una <table className='sr-only'> con los datos.

3) Grilla: usa container queries de Tailwind v4 y la raíz del panel es @container.
- Fila 1, KPIs: 1 columna; 2 desde @xl; 4 desde @5xl.
- Fila 2: la línea ocupa todo el ancho hasta @5xl y desde ahí 6 de 12 columnas, con la dona (3/12) y los movimientos (3/12) al lado. Entre @2xl y @5xl, la dona y los movimientos van lado a lado debajo de la línea.
- Fila 3: el ranking (5/12) y las barras (7/12) van lado a lado desde @5xl.
- Arriba van el selector de período, los controles extra, 'Actualizado hace 1 min' y el botón Actualizar. Debajo, los avisos del servidor en ámbar.

4) Se reescribe .agents/rules/analisis-tab-standard.md, que hoy prohíbe chart.js y exige una tarjeta de IA. Pasa a pedir:
- PanelAnalisis en toda pestaña Análisis.
- Gráficos solo desde components/analisis.
- Datos de GET /<módulo>/analisis, agregados en el servidor.
- Sin cifras de respaldo inventadas y sin IA simulada.
- Fechas en hora de Colombia y etiquetas con tildes.

5) Se borran dos componentes muertos que nadie importa (verificado con búsqueda): frontend/src/app/dashboard/ventas/components/AnalisisVentas.tsx y compras/components/AnalisisCompras.tsx. Las copias en app_mocks_backup no se tocan.

6) frontend/package.json: agregar node tests/test_analisis.mjs y node tests/test_graficos_centralizados.mjs al script 'test', en el cambio consolidado del bloque.
```

**Pruebas (diseño):**

```text
Frontend con node (no hay vitest).

NUEVO frontend/tests/test_analisis.mjs:
1) leerPreferencias con storage vacío, con JSON dañado y con un getItem que lanza error → {periodo:{clave:'30d'}, top:5}. Con un personalizado válido, lo devuelve. guardarPreferencias con un setItem que lanza error no lanza nada.
2) validarPeriodo: un personalizado sin fechas, con desde mayor que hasta, con fecha futura o de 800 días → null; '7d' sale igual.
3) consultaAnalisis({clave:'personalizado', desde:'2026-09-01', hasta:'2026-09-30'}, 10, {foco:'sc', producto:''}) === 'periodo=personalizado&desde=2026-09-01&hasta=2026-09-30&top=10&foco=sc'.
4) infoVariacion:
  · (12.5,'sube') → {texto:'+12,5 %', tono:'bueno', flecha:'sube'}.
  · (−3,'baja') → tono 'bueno'; (8,'baja') → tono 'malo'.
  · 0 → 'Sin cambio'; null → '—' con tono neutro; esFoto → 'Hoy'.
5) formatearValor(4927538.46,'pesos') === '$4.927.538'; (45.24,'porcentaje') === '45,2 %'; (null,'pesos') === '—'.
6) pesosCorto: 4927538 → '$4,9 M'; 12000000 → '$12 M'; 450000 → '$450 mil'; 900 → '$900'; −2500000 → '-$2,5 M'.
7) etiquetaFecha en los tres modos, incluido un 31 de diciembre (no se corre de día).
8) colorSegmento recorre la PALETA en orden y da GRIS_OTROS a '_otros'. hexDeClaseTailwind con una clase conocida y una desconocida.
9) enlaceDocumento para los 7 tipos, y un tipo desconocido → null.
10) normalizarAnalisis(null), y un kpi sin valor → valor null, no 0.

NUEVO frontend/tests/test_graficos_centralizados.mjs: recorre src/ y falla si se importa 'react-chartjs-2' o 'chart.js' fuera de components/analisis/. Tiene una lista blanca (ventas/proyecciones, compras/proyecciones y app_mocks_backup) que se puede ir vaciando.

Además: npx tsc --noEmit (comparado contra la salida anterior) y npm run lint sobre los archivos nuevos.

Visual: se revisa con la primera pantalla que lo use (ANALISIS-ventas). Capturas con Playwright a 375, 1024 y 1440 px en tres estados: cargando (con la red lenta), vacío y con datos. Van a la página de revisión del usuario.
```

**Comportamiento esperado:**

```text
- Al abrir Análisis aparece primero el esqueleto (nunca ceros, H6) y luego los datos del período guardado, o de los últimos 30 días la primera vez.
- Al cambiar el período, los datos anteriores quedan atenuados hasta que llegan los nuevos. Si cambias varias veces seguidas, solo cuenta el último.
- En Personalizado no se pueden aplicar fechas inválidas, y el aviso usa el mismo texto que el servidor.
- Si un bloque no tiene datos en el período, dice 'Sin datos en este período'. La dona y las barras no se dibujan vacías.
- Si falla la carga, aparece el aviso 'No pudimos cargar el análisis. Revisa tu conexión y vuelve a intentarlo.' con el botón 'Reintentar'. Si no tienes permiso, dice 'No tienes permiso para ver este análisis.'
- Los tooltips muestran pesos colombianos y fechas en español.
- Por ancho de pantalla:
  · 375 px: una sola columna, sin desplazamiento horizontal.
  · 1024 px con el menú abierto: KPIs en 2×2, línea a todo el ancho y la dona y los movimientos lado a lado.
  · 1440 px: el diseño de la referencia.
- El período y el Top se recuerdan por pantalla en ese navegador. Si el navegador no deja guardar, funciona igual con 30 días.
- Colores: el del módulo para la serie principal y gris punteado para el período anterior. El verde y el rojo se usan solo para subir y bajar, siempre con flecha y texto, no solo con color.
```

**Datos existentes:**

```text
No cambia datos. Solo guarda en el navegador el último período y el Top que elegiste en cada pantalla.
```

**Riesgos:**

```text
- La regla .agents/rules/analisis-tab-standard.md (always_on) prohíbe chart.js. Hay que reescribirla en el mismo cambio; si no, los agentes seguirán el estándar viejo.
- Depende de la tarjeta estándar de KPI del grupo kpis (U3). Si todavía no existe, FilaKpis usa una versión mínima con las mismas medidas y después se cambia por la estándar (un solo archivo).
- chart.js pesa unos 70 KB comprimido. Por eso se carga solo al abrir la pestaña (dynamic con ssr:false). react-chartjs-2 5.3 ya funciona con React 19 en finanzas/resumen.
- Container queries: Tailwind v4 las trae sin plugin. Si H37 del Bloque 2 todavía no las usó, esta sería la primera vez en el proyecto.
- design-system.ts (código muerto) tiene otros tamaños de KPI. Aquí no se usa, para no darle más peso.
```

**Depende de:**

```text
ANALISIS-api (contrato fijo); grupo kpis del Bloque 4 (tarjeta estándar de KPI, U3); Bloque 1 lib/pesos.js.
```

**Archivos que nombra el diseño:** `frontend/src/lib/analisis.js`, `frontend/tests/test_analisis.mjs`, `frontend/tests/test_graficos_centralizados.mjs`, `frontend/src/components/analisis/registro.ts`, `frontend/src/components/analisis/PanelAnalisis.tsx`, `frontend/src/components/analisis/PanelAnalisisPerezoso.tsx`, `frontend/src/components/analisis/useAnalisis.ts`, `frontend/src/components/analisis/SelectorPeriodo.tsx`, `frontend/src/components/analisis/FilaKpis.tsx`, `frontend/src/components/analisis/ChipVariacion.tsx`, `frontend/src/components/analisis/GraficoLinea.tsx`, `frontend/src/components/analisis/GraficoDona.tsx`, `frontend/src/components/analisis/GraficoBarras.tsx`, `frontend/src/components/analisis/ListaMovimientos.tsx`, `frontend/src/components/analisis/RankingTop.tsx`, `frontend/src/components/analisis/EsqueletoAnalisis.tsx`, `frontend/src/components/analisis/index.ts`, `frontend/package.json`, `.agents/rules/analisis-tab-standard.md`, `frontend/src/app/dashboard/ventas/components/AnalisisVentas.tsx (borrar)`, `frontend/src/app/dashboard/compras/components/AnalisisCompras.tsx (borrar)` (la lista que manda es la de **Files** de la tarea y R27).


### ANALISIS-ventas — Análisis de Ventas: Hub, Solicitudes, Cotizaciones y Pedidos

**Grupo:** Pestañas Análisis · **Esfuerzo:** L · **Tareas del plan:** T6C, T7, T8, T9, T10

**Para el usuario:** Sabes cuánto vendiste, a quién y qué categorías se mueven, comparado con el período anterior. Sin cifras inventadas y con el mismo diseño en las cuatro pantallas de Ventas.

**Lo que vio y aprobó el usuario:** En el Hub de Ventas, la pestaña Análisis muestra:
- 4 indicadores, cada uno con su % frente al período anterior: Ventas, Pedidos, Ticket promedio y % de cotizaciones que terminaron en pedido.
- La curva de ventas por día, con el período anterior en gris punteado.
- Una dona por categoría de producto, o por estado.
- Los últimos pedidos y pagos.
- Tus mejores clientes.
- Barras de lo cotizado contra lo vendido.
Además:
- El filtro por producto ahora sí funciona.
- Ya no salen cifras inventadas (ticket de $450.000, 65 %, 48 %).
- Solicitudes, Cotizaciones y Pedidos tienen su propio análisis con el mismo diseño.
- En Cotizaciones, la pestaña Análisis ya no muestra la tabla.
- En Pedidos ya no aparece una tabla vacía debajo.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- ¿Dónde está la pestaña Análisis? → **Una por Hub (Ventas, Compras, Inventario, CRM y Finanzas). En Ventas trae el selector Todo / Solicitudes / Cotizaciones / Pedidos, y las listas llevan un botón 'Ver análisis' que abre el del Hub ya enfocado** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) Las listas de Solicitudes, Cotizaciones y Pedidos también tienen pestaña Análisis. ¿Cómo las dejamos? → reemplazada por «analisis_en_listas» (en ANALISIS-ventas), respondida: «Una por Hub (Ventas, Compras, Inventario, CRM y Finanzas). En Ventas trae el selector Todo / Solicitudes / Cotizaciones / Pedidos, y las listas llevan un botón 'Ver análisis' que abre el del Hub ya enfocado» (R13).
- (Pregunta del diseño fusionada por el crítico) ¿Cuándo cuenta una venta en el Análisis de Ventas? → reemplazada por «cifra_ventas» (en KPI-base), respondida: «Los pedidos creados en el período, sin cancelados ni devueltos, con su % contra el período anterior» (R7).

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** Punto 7 «Si el usuario elige 'solo en el Hub'» → SÍ (ventas_listas se fusionó en analisis_en_listas = «Una por Hub (Ventas, Compras, Inventario, CRM y Finanzas). En Ventas trae el selector Todo / Solicitudes / Cotizaciones / Pedidos, y las listas llevan un botón 'Ver análisis' que abre el del Hub ya enfocado», R13), con el selector Todo / Solicitudes / Cotizaciones / Pedidos y ?tab=analisis&foco=sc|cot|pven. De los puntos 4 a 6 solo se hace lo que QUITA (la pestaña, los estados del chat simulado y la tabla debajo); no se monta un panel por lista. Asistente: donde el diseño dice «se quitan aiQuestion, aiResponse, aiLoading y handleAskAI» o «el chat simulado con setTimeout», se quitan, y el Copilot queda como AsistenteEnConstruccion de PanelAnalisis (R2).

**Cambios (diseño):**

```text
BACKEND

1) NUEVO backend/app/core/analisis_ventas.py con analisis_ventas(db, periodo, foco, top, producto) -> dict, que usa core/analisis.respuesta. Expone ventas_por_cubeta(...) y pagos_recibidos_q(db, desde, hasta) para que Finanzas use la misma definición.

Reglas comunes:
- Dinero de pedidos: la misma regla del resumen de H47 (Bloque 1): los CANCELADO no suman. Si H47 terminó excluyendo también DEVUELTO_TOTAL, se importa su constante; no se copia.
- Pagos recibidos: SaleOrderPayment con estado 'CONFIRMADO', tipo en TIPOS_PAGO_INGRESO y metodo_pago distinto de METODO_PAGO_TRASLADO, METODO_PAGO_SALDO_A_FAVOR y METODO_PAGO_SIN_VERIFICAR (constantes de core/ventas_dinero.py). Así el saldo trasladado no cuenta como dinero nuevo (R6). Se filtran por 'fecha', que es de tipo Date.
- Etiquetas de estado: textos_actividad.etiqueta_estado('SC'|'COT'|'VEN', codigo) (R12).
- Clientes: se agrupan por COALESCE(customer_id, customer_name).
- producto (opcional, de 2 a 60 caracteres): se filtra con core/busqueda.productos_ilike.

foco='hub' (Hub de Ventas):
- KPIs:
  · 'Ventas' (pesos): Σ total_cop de los PVEN creados en el período.
  · 'Pedidos' (entero).
  · 'Ticket promedio' (pesos): None si no hay pedidos.
  · '% de cotizaciones con pedido' (porcentaje): de las COT creadas en el período, cuántas tienen un PVEN no cancelado.
- Línea 'Ventas en el tiempo': serie actual y serie del período anterior.
- Donas:
  · 'Ventas por categoría': Σ cantidad × precio unitario × (1 − descuento) de sale_order_lines_erp, unida a product_skus → products → categories. Las líneas sin SKU van a 'Sin categoría'.
  · 'Pedidos por estado': incluye los cancelados.
- Barras 'Cotizado vs. vendido', por fecha.
- Movimientos 'Últimos pedidos y pagos': los PVEN creados y los pagos recibidos ('Anticipo recibido', 'Abono' o 'Pago de saldo'); los 8 más recientes del período, con doc_tipo 'PVEN'.
- Ranking 'Mejores clientes': monto, cantidad de pedidos y % del total.

foco='sc' (lista de Solicitudes):
- KPIs:
  · 'Solicitudes nuevas'.
  · '% con cotización': SC creadas en el período con al menos una COT no RECHAZADA (la misma regla de esCotizacionActiva).
  · 'Canceladas' (mejor: baja).
  · 'Días hasta cotizar': promedio entre la creación de la SC y su primera COT (mejor: baja).
- Línea 'Solicitudes nuevas'.
- Donas:
  · 'Por estado': con las etiquetas de U15 del Bloque 2.
  · 'Por tipo': el frontend pone las etiquetas con etiquetaTipoSC de H10.
- Barras 'Solicitudes por asesor': horizontales y apiladas (con cotización / sin cotización), 8 asesores y el resto en 'Otros'.
- Movimientos 'Últimas solicitudes'.
- Ranking 'Clientes con más solicitudes'.

foco='cot' (lista de Cotizaciones):
- KPIs:
  · 'Cotizado'.
  · 'Cotizaciones'.
  · '% aprobadas': CONFIRMADA o con un PVEN no cancelado.
  · 'Rechazadas o vencidas' (mejor: baja).
- Línea 'Valor cotizado'.
- Donas:
  · 'Por estado'.
  · 'Por modalidad de pago': la de su SC; si no tiene SC, 'Sin solicitud'.
- Barras 'Cotizado vs. aprobado'.
- Movimientos 'Últimas cotizaciones'.
- Ranking 'Clientes con más valor cotizado'.

foco='pven' (lista de Pedidos):
- KPIs:
  · 'Vendido'.
  · 'Pedidos'.
  · 'Recaudado'.
  · 'Saldo por cobrar': foto de hoy, Σ saldo_cop de los pedidos no cerrados (mejor: baja).
- Línea 'Ventas en el tiempo'.
- Donas:
  · 'Por estado'.
  · 'Por canal': CRM → 'Asesor', WEB → 'Tienda web', PRESENCIAL → 'Presencial'.
- Barras 'Vendido vs. recaudado'.
- Movimientos 'Últimos pagos y pedidos'.
- Ranking 'Mejores clientes'.

Aviso para todos los focos: si la dona de categorías tiene 'Sin categoría', aparece 'N pedidos tienen productos sin categoría'.

2) backend/app/api/v1/erp_ventas.py: NUEVA ruta GET /analisis con periodo, desde, hasta, foco ('hub'|'sc'|'cot'|'pven'), top=5 y producto. Usa los mismos roles que hoy tiene /analytics (ALL_ERP_ROLES); un ValueError responde 422. Se BORRA ventas_analytics (l.1628-1721 en b7841a5): el Hub era su único consumidor y se cambia en este mismo ítem. /stats no se toca.

FRONTEND
Cada pantalla importa PanelAnalisisPerezoso. Los números de línea son de b7841a5 y se mueven con los Bloques 1 a 3: hay que buscar el bloque activeTab==='Analisis'.

3) ventas/page.tsx (Hub):
- Se reemplaza el bloque de Análisis (l.701-863) por <PanelAnalisisPerezoso modulo='ventas' endpoint='/ventas/analisis' params={{foco:'hub'}} busquedaProducto acento='indigo'/>.
- Se quitan analytics, analyticsRange, analyticsTopN, analyticsProduct, aiQuestion, aiResponse y aiLoading (l.240-246), el efecto de la l.273, loadAnalytics (l.275-281) y handleAskAI (l.357-369; llama a /ventas/ai-chat, que no existe, según la pregunta de IA).
- La pestaña pasa a llamarse 'Análisis', sin emoji.

4) ventas/solicitud/solicitud-client.tsx:
- Se reemplaza el bloque Analisis (l.1405-1872) por el panel con foco 'sc', modulo 'ventas-sc' y un etiquetar que aplica etiquetaTipoSC (lib/etiquetas-solicitud.js, H10 del Bloque 2) a la dona 'Por tipo'.
- Se quitan topClientsLimit, donutMode, aiQuery, aiLoading y aiChatHistory (l.710-715) y sus funciones: el chat simulado con setTimeout.

5) ventas/cotizacion/cotizacion-client.tsx: el filtro (l.526) devuelve [] en 'Analisis', se ocultan la tabla y la paginación, y se muestra el panel con foco 'cot' y modulo 'ventas-cot'.

6) ventas/venta/venta-client.tsx: se reemplaza l.221-271 por el panel con foco 'pven' y modulo 'ventas-pven'. La tabla (desde l.273) se envuelve en activeTab!=='Analisis'.

7) Si el usuario elige 'solo en el Hub' (pregunta ventas_listas), los pasos 4 a 6 cambian: la pestaña Análisis de esas listas se quita y en su lugar queda un botón 'Ver análisis' que abre /dashboard/ventas?tab=analisis. El Hub lo lee con window.location dentro de un useEffect; no usa useSearchParams porque exigiría Suspense.
```

**Pruebas (diseño):**

```text
Backend: NUEVO backend/tests/test_analisis_ventas.py, con el runner de ROLLBACK: tests/rollback_runner.py test_analisis_ventas.
Todas las pruebas usan periodo=personalizado&desde=2001-01-01&hasta=2001-01-10 (el anterior es 2000-12-22..2000-12-31). Crean los documentos por ORM con un created_at fijo y clientes con sufijo uuid.
1) test_kpis_hub_y_variacion: PVEN A de 1.000.000 (2001-01-02 15:00 UTC), B de 500.000 (01-05), C CANCELADO de 9.000.000 (01-06) y D de 750.000 (2000-12-25) → Ventas 1.500.000 vs 750.000 (+100.0), Pedidos 2 vs 1 y Ticket 750.000 vs 750.000 (0.0).
2) test_borde_de_dia_colombia: un PVEN del 2001-01-11 a las 04:30 UTC cuenta; uno del 2001-01-01 a las 04:30 UTC no.
3) test_linea_rellena_y_alineada: 10 fechas; '2001-01-02' vale 1.000.000 y el resto 0; la serie anterior tiene 10 valores.
4) test_dona_por_categoria: un PVEN con una línea con SKU (fixture sku) y otra sin SKU → la categoría, 'Sin categoría' y el aviso.
5) test_conversion_cotizaciones: 4 COT; una con PVEN vigente y otra solo con un PVEN cancelado → 25.0.
6) test_ranking_top: con top=2 salen 2 filas en orden; top=7 → 422 con el texto.
7) test_foco_sc: con 3 SC (una con COT RECHAZADA y otra con COT BORRADOR), '% con cotización' = 33.3. Una COT creada 2 días después de su SC da 'Días hasta cotizar' = 2.0.
8) test_foco_cot: una CONFIRMADA, una con PVEN, una RECHAZADA y una VENCIDA → '% aprobadas' 50.0 y 'Rechazadas o vencidas' 2.
9) test_foco_pven_recaudado: ANTICIPO CONFIRMADO de 300.000, un pago TRASLADO de 200.000 y uno ANULADO → 300.000.
10) test_producto_filtra: con producto='Cuna' solo cuenta el PVEN que tiene 'Cuna Montessori'.
11) test_consultas_constantes (contador_sql.ventana()): con 3 y con 25 PVEN se hacen las mismas consultas, 14 o menos, en cada foco.
12) test_errores_422: periodo='xx', personalizado sin fechas y foco='otro'.
13) test_permisos: con vendedor_token, 200; sin token, 401.
14) test_analytics_retirado: GET /ventas/analytics → 404.
15) test_claves_exactas: el data de cada foco cumple CLAVES_ANALISIS.

Frontend: npm test, npx tsc --noEmit y npm run lint.

Manual con Playwright a 375, 1024 y 1440 px en el Hub, Solicitudes, Cotizaciones y Pedidos:
- Carga con la red lenta: nunca aparecen ceros.
- Períodos 7 días, Este mes y un personalizado inválido.
- Producto 'cuna'.
- Clic en un movimiento.
- Cotizaciones no muestra la tabla y Pedidos no muestra 'Sin pedidos de venta'.
```

**Comportamiento esperado:**

```text
- Hub: al abrir Análisis ves los 4 indicadores con su %, la curva, la dona (Por categoría | Por estado), los últimos pedidos y pagos, los mejores clientes (Top 5/10/25) y las barras de cotizado contra vendido.
- Si escribes 'cuna' en Producto, todo se recalcula solo con los pedidos y cotizaciones que la incluyen.
- Un clic en un movimiento abre el pedido.
- Las cifras cuentan todos los documentos, no solo los 200 que carga la tabla.
- Un pedido cancelado no suma dinero ni pedidos, pero sí aparece en la dona 'Por estado'.
- 'Recaudado' cuenta el dinero que entró, no el saldo trasladado desde un pedido cancelado.
- Solicitudes: la dona usa los nombres nuevos (Nueva, Asignada, Pendiente por confirmación, Confirmada y Cancelada) y los tipos con tildes.
- Cotizaciones: la pestaña Análisis ya no muestra la tabla.
- Pedidos: debajo del análisis ya no aparece 'Sin pedidos de venta'.
```

**Datos existentes:**

```text
No cambia datos. En erp_test las cifras incluirán documentos de prueba viejos; en producción salen los reales.
```

**Riesgos:**

```text
- Archivos con muchos dueños:
  · ventas/page.tsx: Bloque 1 T9, Bloque 2 (H9, U6 y H49), Bloque 3 (TAREAS) y los grupos de tablas, kpis, pipeline y kanban del Bloque 4.
  · Las tres listas: Bloque 1 (T10 y T11) y Bloque 2.
  Un solo dueño por archivo y este ítem al final. El Análisis es un bloque contiguo, más los estados que se borran.
- Al reemplazar el Análisis de Solicitudes se pierden la dona con 'Asignada' de U15 y la etiqueta de tipos de H10 del Bloque 2. Si el Bloque 2 todavía no está hecho, esas dos ediciones se pueden saltar.
- Regla no-full-tsx-rewrite: el cambio es el 13 % de las líneas del Hub, el 24 % de Solicitudes y menos del 10 % de Cotizaciones y Pedidos, todo bajo el 30 %. Aun así son páginas de 'máxima protección' y se editan por bloques.
- 'Ventas por categoría' suma el valor de las líneas sin IVA ni descuento global, así que su total puede no coincidir con 'Ventas'; la tarjeta lo dice. Con el IVA del Bloque 3 habrá que decidir si suma con IVA.
- Cualquier rol del ERP ve las cifras de Ventas, igual que hoy con /analytics. Restringirlo es un cambio de una línea.
- Al borrar /ventas/analytics fallaría cualquier uso externo; no se encontró ninguno.
```

**Depende de:**

```text
ANALISIS-api y ANALISIS-base. Bloque 1: T1 (pesos), T2 (textos_actividad), T3 (ventas_dinero), H47, T9 (Hub), T10 (venta-client) y T11 (solicitud-client). Bloque 2: U15 (etiquetas de la SC) y H10 (lib/etiquetas-solicitud.js). Además, los demás grupos del Bloque 4 que tocan estos mismos archivos.
```

**Archivos que nombra el diseño:** `backend/app/core/analisis_ventas.py`, `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_analisis_ventas.py`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/venta/venta-client.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### ANALISIS-compras — Análisis de Compras

**Grupo:** Pestañas Análisis · **Esfuerzo:** M · **Tareas del plan:** T1C, T12, T14, T15, T16B

**Para el usuario:** Ves qué proveedores cumplen y cuánto se demoran, con datos reales y comparados con el período anterior.

**Lo que vio y aprobó el usuario:** La pestaña Análisis del Hub de Compras muestra:
- 4 indicadores, cada uno con su % frente al período anterior: lo comprado, la cantidad de pedidos de compra, el % de entregas a tiempo y los días promedio de entrega.
- La curva de compras.
- Una dona por proveedor, o por estado.
- Las últimas compras y recepciones.
- Los proveedores principales, con su % de entregas a tiempo.
- Barras de recepciones a tiempo contra recepciones tarde.
También desaparecen el analista de IA simulado y la gráfica que mostraba las fechas más viejas al revés. Según lo que respondas, en Pedidos de compra, Lista de compras y Traslados la pestaña Análisis se cambia por un botón «Ver análisis» que te lleva al Hub.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- (Pregunta del diseño fusionada por el crítico) Además del Hub, Compras tiene pestaña Análisis en Pedidos de compra, Lista de compras y Traslados (estas dos solo con una IA simulada). ¿Cómo las dejamos? → reemplazada por «analisis_en_listas» (en ANALISIS-ventas), respondida: «Una por Hub (Ventas, Compras, Inventario, CRM y Finanzas). En Ventas trae el selector Todo / Solicitudes / Cotizaciones / Pedidos, y las listas llevan un botón 'Ver análisis' que abre el del Hub ya enfocado» (R13).

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** Punto 5 «Con la opción recomendada de compras_subpantallas» → SÍ (se fusionó en analisis_en_listas, R13: un solo Análisis en el Hub y «Ver análisis» en Pedidos de compra, Lista de compras y Traslados); «Con la otra opción» → NO. Asistente: lo que el diseño quita (aiChatHistory, aiQuery, aiLoading, handleAiQuestion, handleAskAI) se quita, y el asistente del Hub de Compras queda como AsistenteEnConstruccion (R2). Las etiquetas de PEC de su punto 3 son las de R9.

**Cambios (diseño):**

```text
BACKEND

1) NUEVO backend/app/core/analisis_compras.py con analisis_compras(db, periodo, top) -> dict.
- Fecha del pedido de compra: COALESCE(fecha_compra, created_at).
- Dinero: no suman los PEC en estado BORRADOR ni CANCELADO.
- KPIs:
  · 'Comprado' (pesos).
  · 'Pedidos de compra' (entero).
  · '% entregas a tiempo': cuenta las recepciones COMPLETADA o COMPLETADA_LOGISTICA con fecha_recepcion en el período y cuyo PEC tiene fecha_entrega_estimada. Es a tiempo si la fecha de recepción es menor o igual a la prometida + 1 día, la misma tolerancia de _gr_dict en erp_compras.py.
  · 'Días promedio de entrega': fecha_recepcion − fecha del PEC, con 1 decimal (mejor: baja).
- Línea 'Compras en el tiempo', con el período actual y el anterior.
- Donas:
  · 'Por proveedor': supplier_name; vacío → 'Sin proveedor'.
  · 'Por estado': todos los estados, incluidos RECIBIDA y PARCIALMENTE_RECIBIDA.
- Barras 'Recepciones a tiempo y con retraso', por fecha y apiladas: a tiempo, con retraso y sin fecha prometida.
- Movimientos 'Últimas compras y recepciones': PEC (doc_tipo 'PEC') y recepciones confirmadas (doc_tipo 'ENINV'), con 'llegó N días tarde' si corresponde.
- Ranking 'Proveedores principales', con el detalle 'N pedidos · 80 % a tiempo'.
- Aviso: 'N recepciones no cuentan para «a tiempo» porque su pedido de compra no tiene fecha de entrega estimada.'

2) backend/app/api/v1/erp_compras.py: NUEVA ruta GET /analisis con periodo, desde, hasta y top. Usa los roles de list_pec (ALL_ERP_ROLES); un ValueError responde 422.

3) backend/app/core/textos_actividad.py: se agregan ETIQUETAS_ESTADO['PEC'] (Borrador, Emitido, Enviado, En tránsito, Pendiente de entrega, Recibido, Recibida, Parcialmente recibida, Completado, Cancelado) y ['ENINV'] (Borrador, Completada, Completada (logística), Cancelada). Si otro grupo del Bloque 4 ya creó la fuente única de estados de Compras, se usa esa en su lugar. Se ajusta la prueba de diccionario exacto de test_textos_actividad.py.

FRONTEND

4) compras/page.tsx (Hub):
- Se reemplaza el bloque de Análisis (l.730-1151, unas 420 líneas) por <PanelAnalisisPerezoso modulo='compras' endpoint='/compras/analisis' acento='purple'/>.
- Se quitan donutMode, topSuppliersLimit, aiChatHistory, aiQuery y aiLoading (l.330-336) y handleAiQuestion (desde la l.357).
- La pestaña pasa a llamarse 'Análisis', sin emoji.
- Si la URL trae ?tab=analisis, el Hub abre esa pestaña (useEffect con window.location).

5) Con la opción recomendada de compras_subpantallas:
- compras/pedidos/page.tsx: se quitan la pestaña 'Analisis' (l.1401) y su bloque (l.1651-1723), los estados analyticsRange, chartType, aiQuestion, aiResponse y aiLoading (l.1312-1316) y handleAskAI (l.1352, que llamaba a /ventas/ai-chat, inexistente). En el encabezado queda un botón 'Ver análisis' → /dashboard/compras?tab=analisis.
- compras/lista-compras/page.tsx y compras/traslados/page.tsx: se quita la pestaña Análisis, que hoy es una IA simulada (l.82-85 y 236+, y l.68-71 y 175+), y queda el mismo botón.
Con la otra opción, cada pantalla lleva el panel con su propio foco (pec, lista o traslados). Eso exige tres consultas nuevas y suma un esfuerzo M.

compras/historial queda fuera: llama a endpoints que no existen.
```

**Pruebas (diseño):**

```text
Backend: NUEVO backend/tests/test_analisis_compras.py, con el runner de ROLLBACK y la ventana 2001-01-01..10.
1) test_comprado_sin_borrador_ni_cancelado: un PEC EMITIDO de 2.000.000, uno BORRADOR de 9.000.000 y uno CANCELADO de 5.000.000 → Comprado 2.000.000 y Pedidos 1; la dona por estado tiene los 3.
2) test_a_tiempo_con_tolerancia: con fecha prometida el 01-05, una recepción el 01-06 (a tiempo) y otra el 01-08 (tarde) → 50.0, y en las barras una de cada una.
3) test_sin_fecha_prometida: la recepción no entra en el %, pero sí en el aviso y en la barra 'sin fecha prometida'.
4) test_dias_promedio: PEC del 01-01 con recepciones el 01-04 y el 01-06 → 4.0.
5) test_ranking_proveedores: con top=2, el orden y el detalle con el % a tiempo.
6) test_consultas_constantes: con 3 y con 25 PEC se hacen las mismas consultas, 14 o menos.
7) test_permisos: compras_token (tests/usuarios_de_prueba.py) y vendedor_token reciben 200.
8) test_claves_exactas.
9) test_textos_actividad actualizado: etiqueta_estado('PEC','EN_TRANSITO') == 'En tránsito'.

Frontend: npm test, npx tsc --noEmit y npm run lint.

Manual con Playwright a 375, 1024 y 1440 px: el Análisis del Hub de Compras y el botón 'Ver análisis' desde Pedidos de compra.
```

**Comportamiento esperado:**

```text
- Un pedido de compra en Borrador o Cancelado no suma dinero, pero sí aparece en la dona por estado.
- Una recepción que llega un día después de la fecha prometida cuenta como a tiempo, igual que en la Mesa de Recepciones.
- Si ningún pedido del período tiene fecha prometida, '% entregas a tiempo' muestra '—' y aparece el aviso.
- Un clic en una compra abre /dashboard/compras/pedidos?id=; un clic en una recepción abre su conteo.
- Las cifras usan todos los pedidos de compra, no solo los 200 más recientes.
```

**Datos existentes:**

```text
No cambia datos.
```

**Riesgos:**

```text
- compras/page.tsx tiene 'máxima protección' y el reemplazo es cerca del 33 % de sus líneas, por encima del 30 % de la regla. La aprobación de este ítem cuenta como la autorización explícita. Es un solo bloque contiguo.
- Mismo archivo que los grupos de tablas, kanban, kpis y pipeline: un solo dueño, y Análisis al final.
- Las fechas se comparan con .date(), sin pasarlas a hora de Colombia, igual que _gr_dict, para que el Hub y la Mesa de Recepciones no se contradigan. Si se corrige _gr_dict, hay que corregir esto también; se deja un comentario que lo dice.
- Si un PEC tiene varias recepciones parciales, cada una cuenta por separado.
```

**Depende de:**

```text
ANALISIS-api y ANALISIS-base; Bloque 1 T2 (textos_actividad.etiqueta_estado); los grupos de tablas, kanban y kpis del Bloque 4 en compras/page.tsx y compras/pedidos/page.tsx.
```

**Archivos que nombra el diseño:** `backend/app/core/analisis_compras.py`, `backend/app/api/v1/erp_compras.py`, `backend/app/core/textos_actividad.py`, `backend/tests/test_analisis_compras.py`, `backend/tests/test_textos_actividad.py`, `frontend/src/app/dashboard/compras/page.tsx`, `frontend/src/app/dashboard/compras/pedidos/page.tsx`, `frontend/src/app/dashboard/compras/lista-compras/page.tsx`, `frontend/src/app/dashboard/compras/traslados/page.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### ANALISIS-inventario — Análisis de Inventario con datos reales

**Grupo:** Pestañas Análisis · **Esfuerzo:** M · **Tareas del plan:** T13, T17

**Para el usuario:** Sabes cuánto vale tu inventario, cómo ha cambiado y qué productos se mueven, a partir de los movimientos reales del kardex.

**Lo que vio y aprobó el usuario:** La pestaña Análisis del Hub de Inventario deja de mostrar números inventados. Ahora muestra:
- 4 indicadores: el valor del inventario, las unidades que entraron y salieron en el período y las referencias agotadas.
- La curva del valor del inventario, día a día.
- Una dona del valor por categoría, o por bodega.
- Los últimos movimientos del kardex.
- Los productos que más salen.
- Barras de entradas contra salidas.
Puedes ver todo el análisis de una sola bodega. La tabla del Hub la arregla otro ítem.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- ¿Con qué precio calculamos el valor del inventario? (Vale para la tarjeta «Valor del inventario», la columna Valorización y Análisis.) → **Con el costo de compra de cada referencia** (= recomendada)

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** Asistente: se quitan aiChatHistory, aiQuery, aiLoading y handleAiQuestion, y el asistente queda como AsistenteEnConstruccion de PanelAnalisis (R2). valor_inventario = «Con el costo de compra de cada referencia» (R10).

**Cambios (diseño):**

```text
BACKEND

1) NUEVO backend/app/core/analisis_inventario.py con analisis_inventario(db, periodo, top, bodega=None) -> dict.
- Movimientos, según direction:
  · Entradas: IN y ADJUST_IN.
  · Salidas: OUT y ADJUST_OUT.
  · TRANSFER_IN y TRANSFER_OUT no cuentan en el total, porque solo cambian de bodega, pero sí cuentan cuando se filtra una bodega.
  · QUARANTINE y los movimientos sin dirección se ignoran, con el aviso 'N movimientos sin dirección no se cuentan'.
- Costo: ProductSKU.cost_price, o sale_price si en la pregunta se elige precio de venta. Una referencia sin costo vale 0 y genera el aviso 'N referencias sin costo registrado'.
- Valor actual: Σ InventoryLevel.quantity × costo. Son dos consultas agrupadas: una por categoría y otra por bodega.
- Valor al cierre de cada cubeta: se reconstruye hacia atrás desde el valor actual, restando el neto valorizado de los movimientos posteriores. Usa una consulta por cubeta desde anterior_inicio_utc y una suma de todo lo posterior a fin_utc. Todo va al costo de hoy.
- KPIs:
  · 'Valor del inventario' (pesos): al cierre del período contra el cierre del anterior.
  · 'Entradas' (unidades).
  · 'Salidas' (unidades; mejor: neutro).
  · 'Referencias agotadas': foto de hoy. Cuenta las referencias que tuvieron salidas en los últimos 90 días y hoy tienen 0 unidades (mejor: baja).
- Línea 'Valor del inventario'.
- Donas: 'Valor por categoría' y 'Valor por bodega'.
- Barras 'Entradas y salidas' en unidades, con las salidas hacia abajo.
- Movimientos 'Últimos movimientos':
  · Título: 'Entrada', 'Salida', 'Ajuste de entrada', 'Ajuste de salida' o 'Traslado'.
  · Detalle: 'SKU · producto · bodega'.
  · Monto: la cantidad, con formato 'unidades'.
  · Número: el documento de origen; doc_tipo 'KARDEX'.
- Ranking 'Productos que más salen' (unidades), con el valor en el detalle.
- bodega (opcional): el warehouse_id; filtra niveles y movimientos.

2) backend/app/api/v1/erp_inventario.py: NUEVA ruta GET /analisis con periodo, desde, hasta, top y bodega, y los roles de stock-summary (ALL_ERP_ROLES). No usa _calculate_sku_availability, que hace una consulta por referencia y bodega: aquí todo es agregado.

FRONTEND

3) inventario/page.tsx:
- Se reemplaza el bloque de Análisis (l.489-901, unas 410 líneas) por <PanelAnalisisPerezoso modulo='inventario' endpoint='/inventory/analisis' params={{bodega}} controlesExtra={select con las bodegas reales de /inventory/warehouses} acento='teal'/>.
- Se quitan donutMode, topItemsLimit, aiChatHistory, aiQuery y aiLoading (l.65-78) y handleAiQuestion (desde la l.206).
- La pestaña pasa a llamarse 'Análisis'.
- El select de bodega del panel es propio: no usa las 3 bodegas de relleno del Hub.
```

**Pruebas (diseño):**

```text
Backend: NUEVO backend/tests/test_analisis_inventario.py, con el runner de ROLLBACK. Cada prueba crea su propia bodega y su SKU (fixture sku) y pide bodega=<id>, para que no la afecte el stock de erp_test.
1) test_valor_y_reconstruccion: costo 1.000 y nivel actual 10. Movimientos: IN 4 (01-03), OUT 2 (01-05) e IN 8 (2001-02-01, fuera de la ventana). Con la ventana 2001-01-01..10, los valores diarios son [0, 0, 4000, 4000, 2000 … 2000]; 'Valor' es 2.000 contra 0 (variación None, 'Nuevo'); Entradas 4 y Salidas 2.
2) test_traslados: con bodega filtrada, un TRANSFER_IN suma como entrada; sin bodega, no cuenta.
3) test_movimiento_sin_direccion: no suma y aparece el aviso.
4) test_borde_colombia_timestamptz: un movimiento del 2001-01-11 a las 04:30 UTC cuenta el 10 de enero.
5) test_agotadas: un SKU con una salida en los últimos 90 días y nivel 0 → 1.
6) test_dona_por_categoria_y_bodega.
7) test_ranking_productos_que_salen.
8) test_consultas_constantes: con 3 y con 30 movimientos se hacen las mismas consultas, 14 o menos.
9) test_claves_exactas.

Frontend: npm test, npx tsc --noEmit y npm run lint.

Manual con Playwright a 375, 1024 y 1440 px, con bodega y sin bodega, comparando el valor de una referencia con /inventory/stock-summary.
```

**Comportamiento esperado:**

```text
- El valor y la curva salen de las existencias y los movimientos reales, no de la fórmula inventada que usa hoy el Hub.
- Si eliges una bodega, todo el análisis es de esa bodega, incluidos los traslados que entran a ella o salen de ella.
- 'Referencias agotadas' es una foto de hoy y no lleva %.
- Los movimientos se muestran en hora de Colombia.
```

**Datos existentes:**

```text
No cambia datos.
```

**Riesgos:**

```text
- El valor histórico usa el costo de hoy: si el costo cambió, la curva no es contable. La ayuda del indicador lo dice; no existe un costo guardado por movimiento.
- El reemplazo es cerca del 36 % de las líneas de inventario/page.tsx, por encima del 30 % de la regla. La aprobación de este ítem cuenta como autorización; es un bloque contiguo.
- Mientras el grupo de tablas no arregle la tabla del Hub, la tabla y el Análisis no coincidirán.
- direction admite valores nulos y valores viejos: se cuentan en el aviso.
- La cuarentena no entra en el valor, igual que en stock-summary.
```

**Depende de:**

```text
ANALISIS-api y ANALISIS-base; grupo de tablas del Bloque 4 en inventario/page.tsx.
```

**Archivos que nombra el diseño:** `backend/app/core/analisis_inventario.py`, `backend/app/api/v1/erp_inventario.py`, `backend/tests/test_analisis_inventario.py`, `frontend/src/app/dashboard/inventario/page.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### ANALISIS-finanzas — Resumen de Finanzas con datos reales

**Grupo:** Pestañas Análisis · **Esfuerzo:** M · **Tareas del plan:** T20, T22

**Para el usuario:** En una sola pantalla ves si el negocio gana o pierde en el período, cuánto dinero entró y salió de verdad y quién te debe.

**Lo que vio y aprobó el usuario:** El Resumen de Finanzas deja las cifras de ejemplo en dólares y pasa al mismo diseño, con datos reales:
- 4 indicadores, cada uno con su % frente al período anterior: Ventas, Dinero recibido, Gastos y Utilidad estimada.
- La curva de ventas contra gastos.
- Una dona de gastos por categoría, o del dinero recibido por medio de pago.
- Los últimos pagos y gastos.
- Los clientes con más saldo por cobrar.
- Barras del flujo de caja, con las entradas arriba y las salidas abajo, como en tu referencia.
Se quitan las alertas del «CFO Virtual», que eran un texto fijo.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- La pantalla de Gastos dice «Monto (USD)», pero el resto del sistema trabaja en pesos. ¿En qué moneda anotan los gastos? → **En pesos colombianos (se corrige la etiqueta)** (= recomendada)

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** Punto 4 «con la opción recomendada de moneda_gastos» → SÍ (moneda_gastos = «En pesos colombianos (se corrige la etiqueta)»: «Monto (COP)» y formatoPesos, R16); «La otra opción» → NO. Las alertas fijas del «CFO Virtual» pasan a AsistenteEnConstruccion (R2).

**Cambios (diseño):**

```text
BACKEND

1) NUEVO backend/app/core/analisis_finanzas.py con analisis_finanzas(db, periodo, top) -> dict. Reutiliza ventas_por_cubeta y pagos_recibidos_q de core/analisis_ventas.py.
- KPIs:
  · 'Ventas'.
  · 'Dinero recibido'.
  · 'Gastos': Σ OperationalExpense.amount con incurred_date en el período, en hora de Colombia (mejor: baja).
  · 'Utilidad estimada': Σ (total_cop − total_cost_cop) de los pedidos del período, menos los gastos.
- Línea 'Ventas y gastos', con dos series.
- Donas: 'Gastos por categoría' y 'Dinero recibido por medio de pago'.
- Barras 'Flujo de caja': entradas = dinero recibido; salidas = gastos + devoluciones CONFIRMADO, como valores negativos.
- Movimientos 'Movimientos recientes': pagos (+) y gastos y devoluciones (−).
- Ranking 'Clientes con más saldo por cobrar': foto de hoy, Σ saldo_cop de los pedidos no cerrados.
- Aviso: 'N pedidos del período no tienen costo registrado: la utilidad sale más alta.'

2) backend/app/api/v1/finance.py: NUEVA ruta GET /analisis, solo para ADMIN y FINANZAS.

FRONTEND

3) finanzas/resumen/page.tsx: se rehace la página (173 líneas, todas de ejemplo). Se conservan SubNav y PageHeader, y el contenido pasa a ser <PanelAnalisisPerezoso modulo='finanzas' endpoint='/finance/analisis' acento='blue'/>. Se quitan la cascada de valores fijos, los gráficos de ejemplo y el panel 'CFO Virtual'.

4) finanzas/gastos/page.tsx, con la opción recomendada de moneda_gastos: fCOP con es-CO/COP y 'Monto (COP)' (l.13, l.110 y l.170). La otra opción necesita guardar la moneda de cada gasto, así que sería un ítem aparte.
```

**Pruebas (diseño):**

```text
Backend: NUEVO backend/tests/test_analisis_finanzas.py, con el runner de ROLLBACK y la ventana 2001-01-01..10.
1) test_dinero_recibido: ANTICIPO CONFIRMADO de 300.000, un TRASLADO de 200.000, un CONVERSION_COTIZACION de 100.000 y uno ANULADO de 50.000 → 300.000.
2) test_gastos_y_utilidad: un PVEN de 1.000.000 con costo 600.000 y un gasto de 150.000 → Utilidad 250.000. Un PVEN con costo 0 genera el aviso.
3) test_flujo_de_caja: entradas positivas y salidas negativas.
4) test_gasto_borde_colombia: un gasto del 2001-01-11 a las 04:30 UTC cuenta el día 10.
5) test_dona_gastos_por_categoria.
6) test_cartera_foto: el ranking excluye los pedidos cerrados.
7) test_permisos: con vendedor_token, 403; con admin, 200.
8) test_consultas_constantes y test_claves_exactas.

Frontend: npm test, npx tsc --noEmit, npm run lint y capturas con Playwright a 375, 1024 y 1440 px.
```

**Comportamiento esperado:**

```text
- 'Dinero recibido' cuenta los pagos confirmados. No cuenta el saldo trasladado de un pedido cancelado ni los pagos sin verificar.
- Las devoluciones aparecen como salidas en el flujo de caja.
- 'Ventas' y 'Dinero recibido' coinciden con los de Ventas para el mismo período.
- Un asesor que abra la pantalla ve 'No tienes permiso para ver este análisis.'
```

**Datos existentes:**

```text
No cambia datos.
```

**Riesgos:**

```text
- TD-05 (payment_transactions) va a cambiar el libro de pagos. Toda lectura de pagos pasa por pagos_recibidos_q, así que el ajuste se hace en un solo lugar.
- Rehacer finanzas/resumen supera el 30 % de la regla. La aprobación de este ítem cuenta como autorización.
- Los pedidos viejos pueden tener total_cost_cop en 0; por eso existe el aviso.
- OperationalExpense no guarda la moneda (ver la pregunta).
```

**Depende de:**

```text
ANALISIS-api, ANALISIS-base y ANALISIS-ventas (reutiliza sus consultas); Bloque 1 T3 (constantes de pagos).
```

**Archivos que nombra el diseño:** `backend/app/core/analisis_finanzas.py`, `backend/app/api/v1/finance.py`, `backend/tests/test_analisis_finanzas.py`, `frontend/src/app/dashboard/finanzas/resumen/page.tsx`, `frontend/src/app/dashboard/finanzas/gastos/page.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### ANALISIS-crm — Análisis del CRM

**Grupo:** Pestañas Análisis · **Esfuerzo:** M · **Tareas del plan:** T20, T21

**Para el usuario:** Ves cuántos leads entran, cuántos cierras y en qué etapa se quedan, comparado con el período anterior.

**Lo que vio y aprobó el usuario:** La vista Análisis del CRM muestra:
- 4 indicadores, cada uno con su % frente al período anterior: leads nuevos, valor en el pipeline (hoy), leads ganados y % de cierre.
- La curva de leads nuevos contra ganados.
- Una dona de los leads abiertos por etapa (con el color de cada etapa), o por origen.
- La lista «Requieren atención» con los leads atrasados.
- Los asesores con más ventas ganadas.
- Barras del valor por etapa.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- Sin preguntas.

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** Asistente: la pestaña Análisis del CRM lleva AsistenteEnConstruccion al final de PanelAnalisis (R2), sin respuestas simuladas.

**Cambios (diseño):**

```text
BACKEND

1) backend/app/api/v1/crm.py: NUEVA ruta GET /analisis para ADMIN y ASESOR. La lógica va en _analisis_crm(db, periodo, top), en el mismo archivo, porque PipelineStage está definido ahí (l.1094).
- Los leads son sales_orders. Abiertos: status distinto de INVOICED y CANCELLED.
- KPIs:
  · 'Leads nuevos'.
  · 'Valor en el pipeline': foto de hoy.
  · 'Leads ganados': INVOICED con updated_at en el período.
  · '% de cierre': ganados / (ganados + perdidos).
- Línea 'Leads nuevos y ganados'.
- Donas: 'Leads abiertos por etapa', con el color de cada etapa, y 'Por origen'.
- Barras 'Valor por etapa'.
- Movimientos 'Requieren atención': leads abiertos con días sin movimiento iguales o mayores a los alert_days de su etapa (7 si no tiene); los 8 más atrasados, con doc_tipo 'LEAD'.
- Ranking 'Asesores con más ventas ganadas'.
- La respuesta trae los nombres y colores de las etapas, así no depende de /pipeline-stages/config, que solo puede leer ADMIN.

FRONTEND

2) crm/page.tsx: se reemplaza la vista 'analisis' (l.1037-1111) por <PanelAnalisisPerezoso modulo='crm' endpoint='/crm/analisis' acento='purple' alAbrirMovimiento={abre el lead con openDetail; si no está cargado, avisa 'Ábrelo desde el Kanban'}/>.
```

**Pruebas (diseño):**

```text
Backend: NUEVO backend/tests/test_analisis_crm.py, con el runner de ROLLBACK y la ventana 2001-01-01..10.
1) test_leads_nuevos_y_variacion.
2) test_ganados_y_cierre: 2 INVOICED y 1 CANCELLED → 2 ganados y 66.7 %.
3) test_pipeline_foto.
4) test_atrasados_por_alert_days.
5) test_dona_por_etapa_con_color.
6) test_permisos: con vendedor_token, 200; con compras_token, 403.
7) test_consultas_constantes y test_claves_exactas.

Frontend: npx tsc --noEmit, npm run lint y capturas con Playwright como ADMIN y como asesor.
```

**Comportamiento esperado:**

```text
- Un asesor ve el análisis completo, aunque no pueda leer la configuración de etapas.
- 'Requieren atención' sigue la alerta de cada etapa, y un clic abre el lead.
- Los leads perdidos no cuentan como abiertos, pero sí entran en el % de cierre.
```

**Datos existentes:**

```text
No cambia datos.
```

**Riesgos:**

```text
- 'Ganado en el período' se basa en updated_at, así que es una aproximación: no hay historial de etapas.
- Los leads viven en la tabla vieja sales_orders. Si esa tabla cambia, solo hay que ajustar _analisis_crm.
- crm/page.tsx también lo toca el grupo kanban: un solo dueño. El reemplazo es cerca del 5 % de sus líneas.
```

**Depende de:**

```text
ANALISIS-api y ANALISIS-base; grupo kanban del Bloque 4 en crm/page.tsx.
```

**Archivos que nombra el diseño:** `backend/app/api/v1/crm.py`, `backend/tests/test_analisis_crm.py`, `frontend/src/app/dashboard/crm/page.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### FLUJO-base — Diagrama de flujo compartido: cajas, flechas y una franja estándar

**Grupo:** Diagrama del flujo · **Esfuerzo:** M · **Tareas del plan:** T3B, T5A

**Para el usuario:** Una sola forma de ver el flujo en todo el sistema: cajas con flechas, números reales y el paso actual resaltado.

**Lo que vio y aprobó el usuario:** El flujo deja de ser una línea de texto con flechas. Verás cajas unidas por flechas, una por paso, con cuántos documentos hay en cada paso y, en rojo, cuántos van con atraso. Se resalta el paso en el que estás o el que elegiste. Mientras los números cargan se ve una raya (—), nunca un 0 falso ni 'Todas al día'. Con el botón 'Ocultar flujo' la franja queda en una sola línea, y el sistema recuerda en tu equipo cómo la dejaste. '¿Cómo funciona?' explica en una frase qué pasa en cada paso. En pantallas angostas las cajas se achican y, si no caben, se desplazan dentro de la franja sin mover toda la página. Es una sola pieza para Ventas, Compras y los documentos, así que se ve igual en todas partes.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- ¿Dónde quieres ver el diagrama del flujo en el Hub y en las listas (Solicitudes, Cotizaciones, Pedidos)? → **En la franja de arriba, junto al semáforo de atrasados: una sola franja, igual en todas las pantallas** (= recomendada)
- Pediste el flujo como un 'diagrama de tiempo'. ¿Qué debe mostrar cada caja además del nombre del paso? → **Cuántos documentos hay en ese paso y, en rojo, cuántos van con atraso** (= recomendada)

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** «partes='semaforo' o partes='diagrama' pinta solo esa fila. Sirve para la opción 2 de la pregunta de posición» → NO se usa: flujo_posicion = «En la franja de arriba, junto al semáforo de atrasados: una sola franja, igual en todas las pantallas» (partes = 'todo'). Su congelar propio → NO: flujo.js re-exporta el de estados-pedido.js (T2 lo exporta). Sin almacenamiento propio (R4).

**Cambios (diseño):**

```text
FRONTEND (este ítem no toca el backend)
1) Nuevo frontend/src/lib/flujo.js, en JS plano (sin React ni DOM) y probado con node, igual que estados-pedido.js:
   - congelar(valor), exportado. Es la misma función que tiene estados-pedido.js, que no cambia.
   - Tipos JSDoc:
     · EstadoPaso = 'hecho' | 'actual' | 'pendiente' | 'cancelado' | 'neutro'.
     · PasoVista = {clave, label, sufijo?, sublabel?, total?, atrasados?, masAntiguoDias?, detalle?: [{label, n}], avisos?: [{texto, tono: 'ambar'|'rojo'}], estado, esEste?, seleccionado?, href?, ayuda?, tono?, icono?}.
   - pasosConProgreso(definicion, indiceActual, {canceladoEn} = {}) → PasoVista[], para las barras de los documentos:
     · i < indiceActual queda 'hecho', i === indiceActual 'actual' y el resto 'pendiente'.
     · Con canceladoEn, los pasos anteriores quedan 'hecho', ese paso 'cancelado' y los siguientes 'pendiente'.
     · Si el índice está fuera de rango, todos quedan 'pendiente'.
   - pasosConConteos(definicion, conteos, {actual, seleccionado, cargando}) → PasoVista[], para la franja:
     · total, atrasados, masAntiguoDias, detalle y avisos salen de conteos[clave]; quedan en null si está cargando o si falta la clave.
     · El paso que coincide con actual lleva esEste y estado 'actual'.
     · El que coincide con seleccionado lleva seleccionado.
     · Los demás quedan 'neutro'.
   - textoConteo(n) → '—' si n es null, undefined o NaN; si no, n.toLocaleString('es-CO').
   - textoAtraso(n) → '' si es 0 o null; si no, '1 con atraso' o 'N con atraso'.
   - alternarSeleccion(actual, clave) → null si la clave ya estaba elegida; si no, la clave.
   - resumenSemaforo({atrasados, cargando, error}) → {tono, texto}:
     · 'gris' y 'Cargando…' mientras carga o si hubo error;
     · 'rojo' y 'N con atraso' si hay atrasados;
     · 'verde' y 'Todo al día' si no hay.
   - leerPreferencia(clave, porDefecto, almacen) y guardarPreferencia(clave, valor, almacen):
     · el almacén por defecto es globalThis.localStorage;
     · todo va dentro de try/catch y solo se aceptan booleanos;
     · si algo falla, devuelve porDefecto.
     · claveCompacto(id) → 'nebulae.flujo.<id>.compacto'.
2) Nuevo components/flujo/tipos.ts con los mismos tipos en TypeScript (PasoVista, EstadoPaso, TonoPaso, ClaveIcono).
3) Nuevo components/flujo/PasosFlujo.tsx ('use client').
   Props: {pasos; variante?: 'banner'|'barra'|'mini' (por defecto 'barra'); orientacion?: 'horizontal'|'vertical'; etiqueta: string (aria-label); onSeleccionar?: (clave) => void; compacto?: boolean; mostrarAntiguedad?: boolean}.
   - Estructura: <nav aria-label> con un <ol class='@container/flujo'> y un <li> por paso. Entre pasos va una flecha SVG (línea y punta) con aria-hidden; en vertical apunta hacia abajo.
   - Cada paso se pinta así:
     · <Link> si trae href;
     · <button type='button' aria-pressed> si hay onSeleccionar y el paso no es esEste;
     · <div> en los demás casos.
     · esEste lleva aria-current: 'page' en la franja y 'step' en la barra.
   - Variante 'banner' (caja rounded-xl, borde, fondo blanco, min-w-[7rem]):
     · Ícono, según ClaveIcono → lucide: solicitud FileText, cotizacion Calculator, pedido ShoppingBag, entrega Truck, factura Receipt, lista ListChecks, compra ShoppingCart, transito Plane, recepcion PackageCheck, recibido Warehouse.
     · Label en text-xs bold; número en text-xl black tabular-nums, más el sufijo.
     · Si atrasados > 0: chip rosa con textoAtraso y borde izquierdo rose-400.
     · Línea de detalle ('Nueva 1 · Asignada 2'): solo en el paso esEste.
     · Avisos como chips ámbar o rojos.
     · 'El más antiguo: N días': solo si mostrarAntiguedad.
     · seleccionado: ring-2 ring-indigo-500 y fondo indigo-50.
     · esEste: borde indigo-300, fondo indigo-50/60 y chip 'Estás aquí'.
     · Mientras total sea null, el número muestra '—' con animate-pulse.
   - Variante 'barra' (para las barras de los documentos y las etapas de envío):
     · Círculo de 28 px según el estado: hecho, emerald con ✓; actual, indigo relleno con anillo; pendiente, blanco con su número; cancelado, rose con X.
     · Debajo, el label en text-[11px] bold y el sublabel en text-[10px], recortado y con title.
     · Conectores flex-1 h-0.5, en emerald entre pasos hechos.
   - Variante 'mini' (para celdas de tabla): puntos de 10 px y conectores de 8 px, con un title por punto ('Etapa 2 de 4: Aduana, en curso').
   - Comportamiento según el ancho (container queries de Tailwind v4):
     · por debajo de @2xl (42rem), la franja pasa a pastillas (ícono, label y número en una línea, sin sufijo ni detalle) y la fila hace scroll horizontal por dentro (overflow-x-auto snap-x); la página nunca se desborda;
     · por debajo de @md, la barra oculta los sublabels, que quedan en el title.
   - Las clases de color por tono (TONO_PASO) se escriben literales, para que Tailwind las encuentre.
4) Nuevo components/flujo/BannerFlujo.tsx.
   Props: {titulo; regla?; semaforo?: {atrasados, noResueltos?, filtro: 'todos'|'atrasados'|'no_resueltos', onFiltrar}; pasos; cargando?; error?; onReintentar?; onSeleccionarPaso?; avisos?: [{texto, tono: 'ambar'|'rojo'|'gris', onClick?}]; accionAjustar?: {label, onClick} | null; idPreferencia; partes?: 'todo'|'semaforo'|'diagrama'; mostrarAntiguedad?}.
   - Es un <section aria-label={titulo}> con fondo blanco, border-b y px-6 py-3: el mismo lugar y el mismo fondo que tiene hoy el semáforo del Hub.
   - Fila 1:
     · A la izquierda: ícono de estado según resumenSemaforo (gris, rose o emerald, sin emojis), el título, la regla en text-xs slate-500 y los avisos como chips.
     · A la derecha: un control segmentado con aria-pressed que refleja semaforo.filtro, con 'Con atraso (n)', 'No resueltos (n)' (solo si llega noResueltos) y 'Ver todo'.
     · Después: accionAjustar (si no es null), '¿Cómo funciona?' y 'Ocultar flujo' / 'Ver flujo'.
   - Fila 2: <PasosFlujo variante='banner'>.
     · En modo compacto se cambia por los mismos pasos en pastillas, en una sola línea.
     · El modo compacto se lee en un useEffect después de montar (así no hay diferencias de hidratación) y se guarda con guardarPreferencia(claveCompacto(idPreferencia)).
   - '¿Cómo funciona?' muestra la 'ayuda' debajo de cada caja; esto no se guarda.
   - Error: una línea rose 'No se pudieron cargar los números del flujo.' con el botón 'Reintentar'. Las cajas siguen mostrando '—'.
   - partes='semaforo' o partes='diagrama' pinta solo esa fila. Sirve para la opción 2 de la pregunta de posición.
5) Nuevo components/flujo/useResumenFlujo.ts: useResumenFlujo(ruta, recarga) → {datos, cargando, error, recargar}.
   - Usa apiFetch de '@/lib/api' y lee res.data.
   - Descarta las respuestas viejas con un contador en useRef.
   - En la primera carga, datos es null y las cajas muestran '—'.
   - Al recargar conserva los datos anteriores y solo marca cargando, para que los números no parpadeen.
6) Nuevo components/flujo/index.ts. No se toca components/ui/index.ts, que tienen B2-T0 y el grupo de KPIs.
7) frontend/package.json, script 'test': '&& node tests/test_flujo.mjs', en el hunk único con los demás tests del Bloque 4.
```

**Pruebas (diseño):**

```text
Frontend: nuevo frontend/tests/test_flujo.mjs, con node:assert/strict y el mismo estilo de test_estados_pedido.mjs. Casos:
- pasosConProgreso con 5 pasos e índice 2 → hecho, hecho, actual, pendiente, pendiente. Con {canceladoEn: 1} → hecho, cancelado, pendiente… Con índice 7 → todos pendiente.
- pasosConConteos con {SC: {total: 4, atrasados: 1}} y actual 'SC':
  · SC queda esEste, estado actual y total 4;
  · una clave sin conteo queda con total null;
  · con cargando, todos quedan en null;
  · seleccionado marca solo esa clave.
- textoConteo: null y NaN dan '—', 0 da '0' y 1234 da '1.234'.
- textoAtraso: 0 da '' y 1 da '1 con atraso'.
- alternarSeleccion('COT', 'COT') → null; alternarSeleccion(null, 'COT') → 'COT'.
- resumenSemaforo: cargando → gris; error → gris; 0 atrasados → verde; 2 atrasados → rojo.
- Preferencias:
  · con un almacén falso que lanza en getItem y en setItem, devuelve el valor por defecto sin lanzar;
  · con un almacén en memoria, guarda y lee true;
  · con un valor 'abc' guardado, devuelve el valor por defecto.
- Las tablas exportadas están congeladas: asignarles algo lanza TypeError.
Después: npm test y npx tsc --noEmit, sin errores nuevos en components/flujo/*.
La parte visual se comprueba al adoptarla en FLUJO-ventas-pantallas: Playwright a 1024 y 1440 px y página de revisión visual.
```

**Comportamiento esperado:**

```text
- Primera carga: los números muestran '—' y el ícono queda gris con 'Cargando…'. Nunca sale un 0 ni 'Todo al día' antes de tener datos.
- Al recargar se ven los números anteriores hasta que llegan los nuevos.
- Clic en una caja seleccionable: se resalta y avisa a la página; otro clic la libera. Las cajas con href navegan. La caja 'Estás aquí' no es un botón.
- Teclado: Tab recorre cajas y botones, Enter o Espacio los activa y el foco siempre se ve.
- Lector de pantalla:
  · la lista se anuncia con su nombre;
  · el paso actual se marca con aria-current;
  · los botones del semáforo y los pasos seleccionables, con aria-pressed;
  · las flechas se ignoran.
- 'Ocultar flujo' se recuerda por persona y por equipo. En una ventana privada o sin almacenamiento, la franja abre completa.
- A 1024 px con el menú abierto (unos 720 px útiles) caben las 5 cajas. Si hay menos espacio, pasan a pastillas con scroll dentro de la franja.
- Sin emojis. Textos en español y con tildes.
```

**Datos existentes:**

```text
No toca datos del sistema. Solo se guarda en el navegador de cada persona si dejó la franja abierta u oculta (clave nebulae.flujo.<id>.compacto). Si el navegador no deja guardar, la franja abre completa.
```

**Riesgos:**

```text
- Hidratación: si se leyera localStorage en el primer render, el HTML cambiaría. Por eso se lee en un useEffect. Efecto visible: la franja puede abrir completa y achicarse un instante después.
- Íconos: hay que confirmar que lucide-react ^1.31 exporta Calculator, PackageCheck, Warehouse, Plane, Receipt y ListChecks. Si falta alguno, se usa uno equivalente (Package, Box).
- .agents/rules/design-system-reference.md pide usar lib/design-system.ts, que nadie importa, y pone de ejemplo el subtítulo 'Pipeline: A → B → C'. Esta pieza contradice esa regla. Conviene actualizarla para que apunte a components/flujo; es un cambio de documentación que necesita el OK del usuario.
- El grupo de KPIs del Bloque 4 puede crear su propia tarjeta. La franja no depende de ella; si después se unifican los colores, solo cambia TONO_PASO.
- La franja mide unos 130 px y, sumada al encabezado y a los KPIs, empuja la tabla hacia abajo. Para eso está 'Ocultar flujo'.
```

**Depende de:**

```text
No depende de datos. Va antes de FLUJO-ventas-datos (que usa congelar y los tipos), de FLUJO-ventas-pantallas, de FLUJO-documentos y de FLUJO-compras. Supone aplicado el Bloque 2: B2-T0 deja consolidado package.json, y B2-H37 ya trae las container queries de Tailwind v4, aunque esta pieza no las necesita para funcionar.
```

**Archivos que nombra el diseño:** `frontend/src/lib/flujo.js`, `frontend/tests/test_flujo.mjs`, `frontend/src/components/flujo/tipos.ts`, `frontend/src/components/flujo/PasosFlujo.tsx`, `frontend/src/components/flujo/BannerFlujo.tsx`, `frontend/src/components/flujo/useResumenFlujo.ts`, `frontend/src/components/flujo/index.ts`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R27).


### FLUJO-ventas-datos — Números reales del flujo de Ventas y una sola regla de atraso

**Grupo:** Diagrama del flujo · **Esfuerzo:** M · **Tareas del plan:** T1C, T2, T3B, T6A

**Para el usuario:** Los números del flujo son los reales y coinciden con la alerta roja de atrasados.

**Lo que vio y aprobó el usuario:** Los números del diagrama de Ventas los cuenta el servidor sobre todos tus documentos, no solo sobre los 200 más recientes que trae hoy la pantalla. Cada documento cuenta en un solo paso: una solicitud que ya tiene cotización activa se cuenta en Cotización, y una cotización con pedido vigente se cuenta en Pedido. Para decir 'con atraso' se usa exactamente la misma regla que la alerta roja de arriba a la derecha, así que los dos números coinciden. La regla muestra los días de solicitud, de cotización y de pedido; hoy solo muestra los de la solicitud. No cambia ningún dato guardado.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- Sin preguntas.

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** core/flujo_ventas.py y api/v1/flujo.py → NO: todo va en core/resolucion_ventas.py y /ventas/flujo en ventas_hub.py (C5, C16, R27).

**Cambios (diseño):**

```text
BACKEND
1) Nuevo backend/app/core/flujo_ventas.py: las reglas del flujo como datos y consultas de solo lectura.
   - PASOS_FLUJO_VENTAS = ('SC', 'COT', 'PVEN', 'ENTREGADO', 'FACTURADO').
   - ESTADOS_NO_RESOLUCION: se MUEVE aquí la lista no_resolucion de alertas_resumen (erp_ventas.py:1761-1764, tal como quede después de B2-T2) y alertas_resumen la importa. Así queda una sola fuente en el backend.
   - ESTADOS_VEN_CERRADOS = ('ENTREGADO', 'FACTURADO', 'CANCELADO', 'DEVUELTO_TOTAL'): espejo de ESTADOS_PEDIDO_CERRADOS en estados-pedido.js.
   - Condiciones SQLAlchemy reutilizables. Sirven para este resumen y para el filtro en servidor que pueda crear TABLA-ventas:
     · cot_activa_de_sc = exists(SalesQuotation.sc_id == CustomerRequest.id, estado != 'RECHAZADA').
     · pven_vigente_de_sc = exists(SaleOrder.sc_id == CustomerRequest.id, estado != 'CANCELADO').
     · pven_vigente_de_cot = exists(SaleOrder.cot_id == SalesQuotation.id, estado != 'CANCELADO').
     · cond_paso(paso) → (modelo, condición):
       - SC: estado NOT IN ('CANCELADA', 'N/A_SOPORTE'), sin cot_activa_de_sc y sin pven_vigente_de_sc;
       - COT: estado != 'RECHAZADA' y sin pven_vigente_de_cot. VENCIDA cuenta como abierta, como decidió el Bloque 1;
       - PVEN: estado NOT IN ESTADOS_VEN_CERRADOS;
       - ENTREGADO: estado == 'ENTREGADO';
       - FACTURADO: estado == 'FACTURADO'.
   - contar_atrasados(db, dias, ahora) → {'sc', 'sc_confirmadas_sin_accion', 'cot', 'cot_confirmadas_sin_accion', 'ven'}.
     · Son las cinco consultas de alertas_resumen, MOVIDAS sin cambiar su lógica (incluida la exclusión de B2-T2: una SC con COT activa no cuenta).
     · dias = {'SC', 'COT', 'VEN'}.
   - contar_no_resueltos(db): las mismas condiciones de estado (ESTADOS_NO_RESOLUCION y la exclusión de B2-T2), sin la condición de fecha, por tipo.
   - resumen_flujo_ventas(db, dias, ahora=None) → {'pasos': {clave: {'total', 'atrasados', 'mas_antiguo_dias', 'por_estado'}}, 'semaforo': {'atrasados', 'no_resueltos'}, 'dias_alerta', 'generado_at'}:
     · total y por_estado: COUNT y GROUP BY estado con cond_paso.
     · atrasados: SC = sc + sc_confirmadas_sin_accion; COT = cot + cot_confirmadas_sin_accion; PVEN = ven. ENTREGADO y FACTURADO dan None, porque no tienen regla de atraso.
     · mas_antiguo_dias = floor((ahora − MIN(updated_at)) / 1 día) dentro del paso; None si el paso está vacío, y siempre None en FACTURADO.
     · semaforo.atrasados es la suma de los atrasados; semaforo.no_resueltos, la suma de contar_no_resueltos.
     · Si el Bloque 3 está aplicado se agregan dos claves opcionales:
       - cambios_cliente (SC y COT), con el mismo filtro que alertas_resumen.cambios_cliente de B3-T3;
       - sin_respuesta (SC y COT con seguimiento AGOTADO, de B3-T6).
     · generado_at va en ISO con 'Z', porque las fechas naive están en UTC.
2) Nuevo backend/app/api/v1/flujo.py:
   - router = APIRouter(); GET /ventas/flujo con require_roles(*ALL_ERP_ROLES), igual que alertas_resumen: devuelve solo conteos.
   - dias se lee con erp_ventas._get_alert_days ('alerta_sc_dias', 'alerta_cot_dias', 'alerta_ven_dias').
   - Responde {'status': 'success', 'data': resumen}. No escribe nada.
   backend/main.py: 'from app.api.v1 import flujo' y app.include_router(flujo.router, prefix='/api/v1', tags=['Flujo']).
   - Rutas finales: /api/v1/ventas/flujo y, con FLUJO-compras, /api/v1/compras/flujo.
   - No choca con rutas existentes: erp_ventas y erp_ventas_fase4 no tienen '/{id}' en la raíz.
3) backend/app/api/v1/erp_ventas.py:
   - alertas_resumen: el cuerpo queda dias = …; c = contar_atrasados(db, dias, ahora); atrasados = la suma de las cinco claves. Lo que B2 o B3 hayan agregado a la respuesta sigue igual, y la respuesta no cambia.
   - _cot_dict: se agrega 'confirmacion_cliente': cot.gate2_confirmed_at is not None. Es solo el booleano, como confirmacion_vigente de la SC en U15 del Bloque 2. Lo necesita la regla de atraso del navegador.
FRONTEND
4) Nuevo frontend/src/lib/flujo-ventas.js, en JS plano. Importa congelar de ./flujo.js y pasoPedido, esCotizacionActiva y esPedidoVigente de ./estados-pedido.js.
   - PASOS_FLUJO_VENTAS (congelado). Cada paso trae sufijo, tono, icono, ruta y ayuda:
     · SC 'Solicitud': sufijo 'abiertas', tono indigo, icono solicitud, ruta /dashboard/ventas/solicitud, ayuda 'Lo que pide el cliente. Avanza cuando el cliente confirma los productos y se crea la cotización.'
     · COT 'Cotización': sufijo 'abiertas', tono amber, icono cotizacion, ruta /dashboard/ventas/cotizacion, ayuda 'Precios, IVA y anticipo. Avanza cuando el cliente confirma y se verifica el anticipo: ahí nace el pedido.'
     · PVEN 'Pedido de venta': sufijo 'en curso', tono emerald, icono pedido, ruta /dashboard/ventas/venta, ayuda 'Compra, alistamiento y despacho. Avanza cuando el pedido sale de bodega.'
     · ENTREGADO 'Entregado': sufijo 'por facturar', tono teal, icono entrega, ruta /dashboard/ventas/venta?tab=Entregado, ayuda 'El cliente ya lo recibió. Falta marcarlo como facturado.'
     · FACTURADO 'Facturado': sufijo 'facturados', tono purple, icono factura, ruta /dashboard/ventas/venta?tab=Facturado, ayuda 'Pedido cerrado.'
   - ESTADOS_NO_RESOLUCION, una sola lista en el navegador:
     · si el Bloque 1 o el 2 ya la sacó a hub-ventas.js, se reexporta desde ahí;
     · si sigue en ventas/page.tsx:26-35, se mueve aquí;
     · en los dos casos incluye ASIGNADA, que hoy falta en el Hub y sí está en el servidor.
   - contextoFlujo(cotizaciones, pedidos) → {scConCotActiva, scConCot, scConPvenVigente, cotConPvenVigente, cotConPven}, todos Set. Ignora los nulos.
   - pasoFlujoVentas(doc, ctx) → 'SC', 'COT', 'PVEN', 'ENTREGADO', 'FACTURADO' o null para una fila del Hub (tipo SC, COT o VEN). Es espejo exacto de cond_paso. En un VEN:
     · pasoPedido de 0 a 2, o un estado desconocido → 'PVEN';
     · ENTREGADO → 'ENTREGADO';
     · FACTURADO → 'FACTURADO';
     · CANCELADO y DEVUELTO_TOTAL → null.
   - esNoResueltoVentas(doc, ctx) y esAtrasadoVentas(doc, {ctx, dias, ahora}): espejo de contar_no_resueltos y contar_atrasados, fila por fila.
     · Incluyen la 'confirmada sin acción': una SC CONFIRMADA con confirmacion_vigente y sin ninguna COT, y una COT CONFIRMADA con confirmacion_cliente y sin ningún PVEN.
     · La edad es ahora − updated_at, leído como UTC con el helper de fechas de H2 del Bloque 1, y tiene que ser estrictamente mayor que dias × 24 h.
     · El Hub (isDocAtrasado, isDocNoResolucion) y las listas pasan a usar estas dos funciones. U1 (TABLA-ventas) también debería usarlas para ordenar primero lo atrasado.
   - textoRegla(dias):
     · si los tres valores son iguales: 'Con atraso: más de 2 días sin movimiento';
     · si no: 'Con atraso: más de N días sin movimiento (Solicitud 2 · Cotización 3 · Pedido 2)'.
   - conteosDesdeResumen(datos) → {clave: {total, atrasados, masAntiguoDias, porEstado, avisos}}. Tolera nulos. Arma avisos con cambios_cliente ('N con cambios pedidos', ámbar) y sin_respuesta ('N sin respuesta al recordatorio', rojo) cuando vienen.
   - tabHubDePaso(clave) → 'SC', 'Cotizaciones' o 'Pedidos de Venta'.
5) frontend/package.json: '&& node tests/test_flujo_ventas.mjs'.
```

**Pruebas (diseño):**

```text
Backend: nuevo backend/tests/test_flujo_ventas.py. Se corre SOLO con el runner, desde C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend (o el worktree): venv\Scripts\python.exe tests/rollback_runner.py test_flujo_ventas.
Como erp_test ya tiene datos, cada prueba compara 'después − antes' de GET /api/v1/ventas/flujo dentro de la misma transacción. Va una prueba por caso, porque el runner no soporta parametrize.
1) test_cada_documento_cae_en_un_solo_paso. Con un sufijo único:
   - SC BORRADOR sin COT → +1 en SC;
   - SC con COT BORRADOR → +1 en COT y +0 en SC;
   - SC con COT RECHAZADA → +1 en SC;
   - COT CONFIRMADA con PVEN EN_PROCESO → +1 en PVEN y +0 en COT;
   - COT CONFIRMADA con PVEN CANCELADO → +1 en COT;
   - PVEN ENTREGADO → +1 en ENTREGADO;
   - PVEN FACTURADO → +1 en FACTURADO;
   - PVEN DEVUELTO_TOTAL, SC N/A_SOPORTE y SC CANCELADA no suman.
2) test_atrasados_usan_la_regla_de_la_alerta:
   - SC BORRADOR, COT PENDIENTE_CONFIRMACION y PVEN PENDIENTE_COMPRA con updated_at de hace 5 días, más un PVEN LISTO_ENTREGA también de hace 5 días;
   - resultado: atrasados +1 en SC, +1 en COT y +1 en PVEN;
   - semaforo.atrasados sube 3, igual que atrasados en GET /ventas/alertas/resumen.
3) test_alerta_y_flujo_suman_lo_mismo: en la misma transacción, alertas_resumen.atrasados == semaforo.atrasados, sobre los datos que haya.
4) test_por_estado_y_mas_antiguo: SC ASIGNADA con updated_at de hace 3 días → por_estado.ASIGNADA +1, y el paso SC tiene mas_antiguo_dias ≥ 3.
5) test_dias_de_alerta_en_la_respuesta: con admin_config alerta_cot_dias = '4' dentro de la transacción → data.dias_alerta.COT == 4.
6) test_el_asesor_puede_leer_el_flujo: con vendedor_token → 200; sin token → 401.
7) test_paridad_constantes_con_el_frontend: node --input-type=module importa flujo-ventas.js y estados-pedido.js e imprime JSON. Comprueba:
   - que las claves de PASOS_FLUJO_VENTAS sean las mismas;
   - que ESTADOS_NO_RESOLUCION tenga los mismos elementos;
   - que ESTADOS_PEDIDO_CERRADOS sea igual a ESTADOS_VEN_CERRADOS.
8) test_paridad_paso_por_documento_con_el_frontend:
   - con los documentos de la prueba 1, pide /ventas/solicitudes, /cotizaciones y /pedidos con search=sufijo;
   - los pasa a node (contextoFlujo y pasoFlujoVentas) y compara el conteo por paso con los deltas del servidor;
   - hace lo mismo con esAtrasadoVentas contra los atrasados de la prueba 2.
9) test_alertas_resumen_no_cambia: con los datos de la prueba 2, la respuesta de alertas_resumen trae las mismas claves que antes del cambio.
Regresión con el runner: test_listas_ventas_totales, test_estados_pedido y los módulos que llamen a alertas/resumen (buscarlos con grep en backend/tests).
Frontend: nuevo frontend/tests/test_flujo_ventas.mjs.
- pasoFlujoVentas:
  · SC Nueva sin COT → 'SC'; SC con COT activa → null; SC con COT RECHAZADA → 'SC'; SC CANCELADA y SC de soporte → null;
  · COT VENCIDA sin PVEN → 'COT'; COT con PVEN CANCELADO → 'COT'; COT con PVEN vigente → null;
  · VEN EN_TRANSITO y PARCIALMENTE_ENTREGADO → 'PVEN'; ENTREGADO → 'ENTREGADO'; FACTURADO → 'FACTURADO'; CANCELADO y DEVUELTO_TOTAL → null; un estado desconocido → 'PVEN'.
- esAtrasadoVentas:
  · SC BORRADOR con updated_at de hace 3 días y dias.SC = 2 → true, y da lo mismo con 'Z' que sin 'Z';
  · SC con COT activa → false;
  · LISTO_ENTREGA → false;
  · COT CONFIRMADA con confirmacion_cliente, sin PVEN y de hace 3 días → true.
- textoRegla: con días iguales, con días distintos, y con null (usa 2).
- conteosDesdeResumen(null) → todas las claves con total null; con cambios_cliente → aviso ámbar.
- PASOS_FLUJO_VENTAS está congelado y trae 5 claves en orden.
Después: npm test y npx tsc --noEmit.
```

**Comportamiento esperado:**

```text
- GET /api/v1/ventas/flujo devuelve, por paso: total, atrasados, mas_antiguo_dias y por_estado. También devuelve el semáforo (atrasados y no resueltos), los días de alerta de SC, COT y VEN, y la hora en UTC con 'Z'.
- Cada documento cuenta en un solo paso:
  · una solicitud cancelada o de soporte no cuenta;
  · una solicitud con cotización activa cuenta solo como cotización;
  · una cotización rechazada no cuenta;
  · una cotización con pedido vigente cuenta solo como pedido;
  · un pedido entregado va en Entregado, uno facturado en Facturado, y los cancelados o devueltos no cuentan.
- 'Con atraso' es la regla de la alerta global. La suma del flujo es igual al número de la pastilla roja (AlertasBadge).
- La lista ESTADOS_NO_RESOLUCION es una sola en el servidor y una sola en el navegador. Una prueba comprueba que coincidan.
- Lo pueden leer todos los roles del ERP. Sin sesión responde 401.
- No escribe nada.
```

**Datos existentes:**

```text
No modifica datos. Solo hace lecturas (COUNT y GROUP BY).
```

**Riesgos:**

```text
- alertas_resumen ya lo cambian B2-T2 (SC con COT activa) y B3-T3 (cambios_cliente). El movimiento se hace sobre esa versión y copia la lógica tal cual. Las pruebas 3 y 9 lo vigilan, y el número de AlertasBadge no debe cambiar.
- Habrá una diferencia esperada: el servidor cuenta todo y el Hub hoy trae 200 documentos por tipo.
  · Hasta que TABLA-ventas pagine en el servidor, la tabla filtrada por un paso puede mostrar menos filas que la caja.
  · Si la COT de una SC no está entre las 200 cargadas, contextoFlujo clasifica mal esa SC. Pasa solo con datos viejos.
- Las condiciones con EXISTS consultan sales_quotations.sc_id y sale_orders.cot_id/sc_id. Aunque no tengan índice, con pocos miles de filas siguen siendo rápidas. No se crea migración.
- confirmacion_cliente expone solo un booleano (ni la fecha ni el token), igual que confirmacion_vigente en el Bloque 2.
- Si el Bloque 3 no está aplicado, cambios_cliente y sin_respuesta no vienen y no se pintan.
```

**Depende de:**

```text
FLUJO-base (lib/flujo.js). Bloque 1: R7/T0 (runner con vendedor_token y contador_sql), N10 (estados-pedido.js) y H2 (fechas en UTC). Bloque 2: B2-T2 (alertas_resumen sin SC con COT activa) y B2-U15 (confirmacion_vigente). Bloque 3, opcional: B3-T3 y B3-T6 (cambios_cliente, seguimiento). Va antes de FLUJO-ventas-pantallas y FLUJO-documentos. U1 (TABLA-ventas) debería usar esAtrasadoVentas y cond_paso.
```

**Archivos que nombra el diseño:** `backend/app/core/flujo_ventas.py`, `backend/app/api/v1/flujo.py`, `backend/main.py`, `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_flujo_ventas.py`, `frontend/src/lib/flujo-ventas.js`, `frontend/src/lib/hub-ventas.js`, `frontend/tests/test_flujo_ventas.mjs`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R27).


### FLUJO-ventas-pantallas — La franja del flujo en el Hub de Ventas y en las listas de Solicitudes, Cotizaciones y Pedidos

**Grupo:** Diagrama del flujo · **Esfuerzo:** L · **Tareas del plan:** T7, T8, T9, T10, T22

**Para el usuario:** Ves de un vistazo cuántos documentos hay en cada paso del ciclo de venta y cuáles van tarde, y con un clic filtras la tabla.

**Lo que vio y aprobó el usuario:** En el Hub de Ventas, la franja de arriba junta el semáforo y el flujo: Solicitud → Cotización → Pedido de venta → Entregado → Facturado. Cada paso dice cuántos documentos tiene y cuántos van con atraso. Al tocar un paso, la tabla (y el Kanban) muestra solo esos documentos, por ejemplo las cotizaciones abiertas; al tocarlo otra vez vuelves a verlo todo. También lo puedes combinar con 'Con atraso'. La regla de atraso muestra los días de solicitud, de cotización y de pedido. Se quitan los emojis y los botones repetidos: quedan 'Con atraso', 'No resueltos' y 'Ver todo', y 'Ajustar tiempos' para los administradores. En Solicitudes, Cotizaciones y Pedidos de venta aparece la misma franja con su paso marcado como 'Estás aquí' y el detalle de sus estados (por ejemplo 'Nueva 1 · Asignada 2 · Pendiente por confirmación 1'). Esa franja reemplaza la franja oscura de Solicitudes y los avisos rojo y amarillo de arriba. En Cotizaciones siguen a la vista 'N sin precio' y 'N vencen en 7 días'. Al tocar otro paso vas a esa lista; en Pedidos de venta, 'Entregado' y 'Facturado' abren su pestaña. Bajo el título queda una frase corta, sin flechas ni códigos como PVEN-YYYY####. En el Dashboard General, el embudo de ventas, que hoy sale casi vacío, muestra estos mismos números.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- En el Hub, al tocar un paso del diagrama, un botón del semáforo o una tarjeta, ¿qué pasa? → **La tabla y el Kanban del Hub muestran solo esos documentos, con un chip para quitar el filtro** (= recomendada)
- (Pregunta del diseño fusionada por el crítico) En el Hub de Ventas, al tocar un paso del diagrama (por ejemplo, Cotización), ¿qué prefieres? → reemplazada por «clic_en_hub» (en FLUJO-ventas-pantallas), respondida: «La tabla y el Kanban del Hub muestran solo esos documentos, con un chip para quitar el filtro» (R6).

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** Riesgos «Si el usuario elige la opción 2 de la posición» y «Si elige que tocar un paso lleve a la lista» → NO: flujo_posicion = una sola franja y clic_en_hub = «La tabla y el Kanban del Hub muestran solo esos documentos, con un chip para quitar el filtro» (R6). Lo que usa contextoFlujo, pasoFlujoVentas, esAtrasadoVentas o esNoResueltoVentas en el navegador → NO (C4, C5): el paso y el atraso vienen del servidor.

**Cambios (diseño):**

```text
Solo FRONTEND. Los cambios van por bloques, sin reescribir páginas (regla no-full-tsx-rewrite).
A) frontend/src/app/dashboard/ventas/page.tsx (Hub), 7 bloques:
 1. Imports: BannerFlujo y useResumenFlujo de components/flujo; PASOS_FLUJO_VENTAS, contextoFlujo, pasoFlujoVentas, esAtrasadoVentas, esNoResueltoVentas, textoRegla, conteosDesdeResumen y tabHubDePaso de lib/flujo-ventas.js; pasosConConteos y alternarSeleccion de lib/flujo.js; esAdministrador de ./flujo.
 2. Estado nuevo:
    - pasoFlujo (string | null).
    - recargaFlujo, un número que loadData incrementa cada vez que corre. Como soltar en el Kanban y las acciones masivas ya llaman a loadData, el flujo también se recarga ahí.
    - flujo = useResumenFlujo('/ventas/flujo', recargaFlujo).
    - ctxFlujo = useMemo(() => contextoFlujo(cotizaciones, pedidos)).
    - isDocNoResolucion e isDocAtrasado pasan a usar esNoResueltoVentas y esAtrasadoVentas.
 3. El semáforo (hoy en l.524-567) se reemplaza por <BannerFlujo titulo='Flujo comercial'> con estos props:
    - regla={textoRegla(flujo.datos?.dias_alerta)};
    - semaforo = {atrasados: datos.semaforo.atrasados ?? null, noResueltos: datos.semaforo.no_resueltos ?? null, filtro: quickFilter, onFiltrar: setQuickFilter};
    - pasos = pasosConConteos(PASOS_FLUJO_VENTAS, conteosDesdeResumen(flujo.datos), {seleccionado: pasoFlujo, cargando: !flujo.datos});
    - onSeleccionarPaso = elegirPaso;
    - accionAjustar = esAdministrador() ? {label: 'Ajustar tiempos', onClick: () => setShowConfig(true)} : null;
    - cargando, error y onReintentar = flujo.recargar;
    - idPreferencia='ventas'.
    Se quitan las pastillas con emoji y los botones repetidos. 'Acciones tomadas' sigue como pestaña.
 4. elegirPaso(clave):
    - nuevo = alternarSeleccion(pasoFlujo, clave); setPasoFlujo(nuevo);
    - si hay nuevo, setActiveTab(tabHubDePaso(nuevo));
    - limpia la selección (setSelectedIds) y vuelve a la página 1 si TABLA-ventas agregó paginación.
    - Si el usuario cambia a mano a la pestaña de otro tipo, pasoFlujo vuelve a null.
 5. filteredData: después de tomar la base de la pestaña, si hay pasoFlujo se aplica base.filter(d => pasoFlujoVentas(d, ctxFlujo) === pasoFlujo). Se combina con 'Con atraso'. En la fila de búsqueda aparece el chip 'Paso: {label} ×', que limpia pasoFlujo.
 6. Enlace profundo: un useEffect inicial lee ?paso= con window.location.search y lo aplica si es una clave válida. No se usa useSearchParams para que esta página no necesite Suspense.
 7. Subtítulo del PageHeader: 'Solicitudes, cotizaciones y pedidos de tus clientes en un solo lugar.' (sin flechas).
B) ventas/solicitud/solicitud-client.tsx (lista de SC):
 1. Se quitan el pipeline oscuro (l.1099-1206) con su estado showPipelineGuide, y el aviso rojo 'ATENCION REQUERIDA' (l.1057-1070).
 2. Debajo del SubNav va <BannerFlujo titulo='Flujo comercial'> con pasosConConteos(..., {actual: 'SC'}):
    - la caja Solicitud dice 'Estás aquí' y trae el detalle por estado con infoEstadoSolicitud, del Bloque 2 (por ejemplo 'Nueva 1 · Asignada 2 · Pendiente por confirmación 1 · Confirmada 1');
    - las demás cajas son enlaces: Cotización → /dashboard/ventas/cotizacion, Pedido → /dashboard/ventas/venta, Entregado y Facturado → venta?tab=…;
    - semaforo = {atrasados del paso SC, filtro: filtroSemaforo, onFiltrar}, sin 'No resueltos', porque ya lo cubre la pestaña Activas;
    - si vencidas > 0, aviso ámbar 'N vencidas'.
 3. Estado nuevo filtroSemaforo ('todos' | 'atrasados'):
    - con 'atrasados', filtered deja solo las filas con esAtrasadoVentas({...sc, tipo: 'SC'}, …);
    - sinAtender se calcula con esa misma función;
    - al cambiar el filtro, setCurrentPage(1).
 4. Subtítulo: 'Lo que te piden los clientes, antes de cotizar.'
C) ventas/cotizacion/cotizacion-client.tsx (lista de COT):
 1. Se quita el aviso ámbar (l.536-549) y lo que decía pasa a la franja:
    - semaforo.atrasados del paso COT, con el filtro 'Con atraso' basado en esAtrasadoVentas;
    - avisos 'N sin precio' y 'N vencen en 7 días'. El segundo se cuenta con valida_hasta si el Bloque 3 lo agregó; si no, como hoy.
 2. <BannerFlujo> con actual 'COT' y el detalle por estado con las etiquetas de ESTADOS de este mismo archivo.
 3. Subtítulo: 'Precios y anticipo para el cliente; al confirmar se crea el pedido.'
D) ventas/venta/venta-client.tsx (lista de PVEN):
 1. <BannerFlujo> debajo del SubNav, con actual 'PVEN'.
    - El detalle por estado se agrupa con grupoPedido ('Pend. Compra 0 · En Proceso 1 · Listo Entrega 0').
    - Entregado y Facturado están en esta misma página: onSeleccionarPaso hace setActiveTab('Entregado' o 'Facturado') y setCurrentPage(1).
    - Solicitud y Cotización son enlaces.
 2. Al montar se lee ?tab= (searchParams ya existe, l.84) y se aplica si coincide con una pestaña.
 3. semaforo: atrasados del paso PVEN, con el filtro 'Con atraso' (esAtrasadoVentas).
 4. Subtítulo: el que dejó H47 del Bloque 1, 'Pedidos confirmados por tus clientes'. Desaparece 'PVEN-YYYY#### • Pipeline: …'.
E) frontend/src/app/dashboard/page.tsx (Dashboard General), solo el bloque 'Embudo Operativo de Ventas' (l.469-506):
   - Pasa a <PasosFlujo variante='banner' orientacion='vertical'>, con pasos de useResumenFlujo('/ventas/flujo', 0) y enlaces a /dashboard/ventas?paso=<clave>.
   - Arregla el embudo vacío, que contaba estados que no existen, y el enlace roto 'Ver todos' (de /dashboard/ventas/pedidos pasa a /dashboard/ventas).
   - El resto del Dashboard General es de otros grupos.
Este ítem no tiene backend.
```

**Pruebas (diseño):**

```text
- npm test (test_flujo, test_flujo_ventas, test_hub_ventas) y npx tsc --noEmit, sin errores nuevos en los 5 archivos.
- Playwright a 1024 y 1440 px, con capturas de antes y después en la página de revisión visual, como pide el usuario:
  · Hub con red lenta (route con 2 s de retraso en /ventas/flujo): las cajas muestran '—' y no aparece 'Todo al día'.
  · Hub: clic en Cotización → todas las filas son COT abiertas; con 'Con atraso' encima → solo las COT atrasadas; con la × → vuelve todo.
  · /dashboard/ventas?paso=PVEN abre filtrado.
  · Listas de SC, COT y PVEN: cada una dice 'Estás aquí' en su paso; desde SC, el clic en Cotización navega; en PVEN, el clic en Entregado activa esa pestaña.
  · 'Ocultar flujo' y recargar: sigue oculto. En una ventana privada abre completo.
  · En las cuatro pantallas a 1024 px, document.documentElement.scrollWidth <= clientWidth (no hay scroll horizontal de página).
  · Teclado: con Tab hasta 'Cotización' y Enter, la tabla se filtra.
- Revisión manual con los datos de erp_test: la suma de 'Con atraso' de la franja coincide con la pastilla roja global (AlertasBadge).
```

**Comportamiento esperado:**

```text
- Hub: arriba hay una sola franja con:
  · el estado (gris mientras carga, rojo si hay atrasos, verde si todo está al día);
  · la regla, 'Con atraso: más de N días sin movimiento (…)';
  · los botones 'Con atraso (n)', 'No resueltos (n)' y 'Ver todo', más 'Ajustar tiempos' para administradores;
  · debajo, las cajas Solicitud → Cotización → Pedido de venta → Entregado → Facturado, con números reales.
- Al tocar 'Cotización', la tabla y el Kanban muestran solo las cotizaciones abiertas y se activa la pestaña Cotizaciones. Al tocarla otra vez, o con la × del chip, se quita el filtro. Se combina con 'Con atraso'.
- /dashboard/ventas?paso=PVEN abre el Hub ya filtrado.
- Listas: la misma franja, con su paso como 'Estás aquí' y el detalle por estado. Los otros pasos llevan a su lista. 'Con atraso' filtra la tabla y vuelve a la página 1.
- Desaparecen la franja oscura, los avisos rojo y ámbar sueltos, los emojis y los códigos en los subtítulos (PVEN-YYYY####, SC, COT).
- Dashboard General: el embudo muestra los mismos números que la franja del Hub, y cada paso abre el Hub filtrado.
```

**Datos existentes:**

```text
No toca datos.
```

**Riesgos:**

```text
- Estos archivos tienen muchos dueños:
  · page.tsx del Hub: T9 del Bloque 1, B2-T8, B3-T10d y, en el Bloque 4, TABLA, KPIs, KANBAN y ANÁLISIS;
  · solicitud-client.tsx: B2-T6 y B3-T10b;
  · cotizacion-client.tsx: B2-T8 y B3-T10a;
  · venta-client.tsx: T10 del Bloque 1.
  El plan del Bloque 4 necesita un dueño por archivo. Este ítem conviene que entre primero, porque solo reemplaza bloques de cabecera.
- Mientras el Hub cargue 200 documentos por tipo, una caja puede contar más filas de las que muestra la tabla. Se resuelve con la paginación en servidor de TABLA-ventas, que debería recibir paso y atrasados como parámetros y usar core/flujo_ventas.cond_paso.
- Se quita la guía '¿Cómo funciona el flujo?' de la lista de SC; sus textos estaban desactualizados ('Borrador', 'Confirmar + Crear Cotización'). La reemplaza '¿Cómo funciona?' de la franja, con textos nuevos.
- Sale de la franja el botón 'Acciones tomadas'; sigue como pestaña.
- Si el usuario elige la opción 2 de la posición, la franja se usa dos veces: partes='semaforo' arriba y partes='diagrama' en lugar del subtítulo.
- Si elige que tocar un paso lleve a la lista, elegirPaso hace router.push(paso.ruta) y no hay chip de filtro.
```

**Depende de:**

```text
FLUJO-base y FLUJO-ventas-datos. Bloque 1: T9 (Hub), T10 (venta-client) y T11 (solicitud-client). Bloque 2: B2-T5 (estados-solicitud.js, esAdministrador en flujo.tsx), B2-T6 y B2-T8. Bloque 3: B3-T10 (ConfigPanel del Hub, valida_hasta). En el Bloque 4 debe entrar en cada archivo antes que TABLA-ventas, KPIs y KANBAN, o acordar con ellos un dueño por archivo.
```

**Archivos que nombra el diseño:** `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/venta/venta-client.tsx`, `frontend/src/app/dashboard/page.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### FLUJO-documentos — La barra del flujo en cada solicitud, cotización y pedido

**Grupo:** Diagrama del flujo · **Esfuerzo:** M · **Tareas del plan:** T3B, T5A, T7, T10, T11

**Para el usuario:** Desde cualquier documento ves cómo va todo con ese cliente, y con un clic pasas a la cotización o al pedido.

**Lo que vio y aprobó el usuario:** Arriba de cada solicitud, cotización y pedido de venta verás la misma barra: Solicitud → Cotización → Pedido de venta. Cada paso muestra el número del documento (por ejemplo COT-20260485) y su estado en palabras, y puedes tocarlo para abrirlo. 'Volver' te regresa a donde estabas. El documento que estás viendo se marca 'Estás aquí', lo que ya pasó lleva ✓ y lo que falta se ve en gris. Si algo se canceló o se rechazó, aparece en rojo con esa palabra. En el pedido de venta aparece además el pedido de compra, cuando ya existe. El panel rápido que se abre desde el Hub trae la misma barra en pequeño. Los pasos propios de cada documento siguen en el mismo lugar: los 4 de la solicitud, 'Borrador → Cotizado al cliente → Confirmado' en la cotización y los 5 del pedido. Ahora se dibujan con la misma pieza, así que todos se ven iguales.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- Sin preguntas.

**Cambios (diseño):**

```text
FRONTEND (no hace falta backend)
1) lib/flujo-ventas.js agrega dos piezas, en JS puro y probadas con node:
   - cadenaVentas(doc, tipo, {etiquetas, rutaActual}) → PasoVista[] para la barra del documento.
     tipo es 'SC', 'COT' o 'PVEN'. etiquetas = {sc, cot, pven}, tres funciones que dan el texto de cada estado: la pantalla pasa infoEstadoSolicitud, las etiquetas de ESTADOS de cotizacion-client e infoEstadoPedido. Así no se copia ninguna tabla de etiquetas.
     · En la SC: la SC es el documento. La COT es la más reciente que cumpla esCotizacionActiva o, si no hay, la última. El PVEN es el más reciente vigente (esPedidoVigente) de doc.pedidos_venta o, si no hay, el último.
     · En la COT: SC = {id: doc.sc_id, numero: doc.sc_numero}; si no tiene, la primera caja queda neutra con 'Cotización directa'. El PVEN sale de doc.pedidos_venta.
     · En el PVEN: SC = {sc_id, sc_numero} y COT = {cot_id, cot_numero}. Si trae pec_numero se agrega una cuarta caja, 'Compra', con href /dashboard/compras/pedidos?id={pec_id}.
     Cada caja lleva:
     · label: 'Solicitud', 'Cotización', 'Pedido de venta' o 'Compra';
     · sublabel '{numero} · {etiqueta del estado}', o solo el número si el estado no viene (por ejemplo, la SC dentro del PVEN);
     · href al detalle, con ?return_to=encodeURIComponent(rutaActual), el mismo parámetro que ya leen los detalles con returnToSeguro/sanitizeReturnTo; la caja del documento propio va sin href y con esEste.
     Estado de cada caja:
     · la caja más avanzada que exista y no esté cancelada → 'actual';
     · las anteriores → 'hecho';
     · las que no existen → 'pendiente', con 'Sin cotización todavía' o 'Sin pedido todavía';
     · un documento CANCELADA, RECHAZADA o CANCELADO sin reemplazo vigente → 'cancelado', con su etiqueta;
     · si sí hay reemplazo, se muestra el vigente con ' (+1 rechazada)'.
   - PASOS_COTIZACION y pasoCotizacion(estado):
     · pasos: BORRADOR 'Borrador (valorizando)', ENVIADA 'Cotizado al cliente', CONFIRMADA 'Confirmado (venta)'. Son los textos de hoy, ahora con tildes;
     · pasoCotizacion(estado) → {indice, canceladoEn?}: BORRADOR 0; ENVIADA y PENDIENTE_CONFIRMACION 1; CONFIRMADA 2; RECHAZADA canceladoEn 1 con 'Rechazada'; VENCIDA 1 con aviso ámbar 'Vencida'.
2) Nuevo components/flujo/CadenaDocumentos.tsx: ({doc, tipo, compacta?}).
   - Arma las etiquetas y rutaActual (usePathname), llama a cadenaVentas y pinta <PasosFlujo variante='barra' etiqueta='Flujo de este documento'>.
   - compacta: círculos de 22 px y solo el número de cada documento. Es para el panel rápido.
   - Se exporta desde components/flujo/index.ts.
3) ventas/solicitud/[id]/page.tsx: 'Progreso del Flujo' (hoy l.573-592) se cambia por <CadenaDocumentos doc={solicitud} tipo='SC'/> en el mismo lugar. Se quita pipelineStep si queda sin uso. Soporte Técnico sigue sin barra.
   ventas/solicitud/[id]/estado-solicitud.tsx (U15 del Bloque 2): solo la fila de los 4 pasos pasa a <PasosFlujo variante='barra' pasos={pasosConProgreso(PASOS_SC, pasoSolicitud(estado))} etiqueta='Estado de la solicitud'/>. No cambian el título, la ayuda del paso ni 'Reiniciar solicitud'.
4) ventas/cotizacion/[id]/page.tsx:
   - <CadenaDocumentos tipo='COT'/> va entre el encabezado y el panel dividido, en el mismo lugar que en la SC.
   - El 'Status Tracker' hecho a mano (hoy l.519-545) pasa a <PasosFlujo variante='barra'> con pasosConProgreso(PASOS_COTIZACION, …).
   - Se quita stepIndex.
5) ventas/venta/[id]/page.tsx:
   - <CadenaDocumentos tipo='PVEN'/> va en el mismo lugar.
   - El 'Status Tracker', que el Bloque 1 ya alimenta con PASOS_PEDIDO y pasoPedido, solo cambia su dibujo a <PasosFlujo variante='barra'/>.
   - Se conservan la línea 'Estado actual: {label}' y los avisos de cancelado y devuelto del Bloque 1.
6) ventas/page.tsx, panel rápido:
   - El bloque 'Progreso del Flujo' (hoy l.1121-1147) pasa a <CadenaDocumentos doc={quickDetailDoc} tipo={quickDetailDoc.tipo === 'VEN' ? 'PVEN' : quickDetailDoc.tipo} compacta/>.
   - GET /ventas/{tipo}/{id} ya devuelve cotizaciones, pedidos_venta, sc_numero, cot_numero y pec_numero, así que no hay cambios de backend.
7) Compras usa el mismo PasosFlujo para sus etapas de envío (ver FLUJO-compras).
```

**Pruebas (diseño):**

```text
Frontend: test_flujo_ventas.mjs suma estos casos:
- cadenaVentas de una SC sin cotización → ['actual' (esEste), 'pendiente', 'pendiente'], con el sublabel 'Sin cotización todavía'.
- SC con una COT RECHAZADA y otra COT BORRADOR → la caja muestra la BORRADOR con ' (+1 rechazada)'.
- SC con una sola COT, RECHAZADA → la caja queda 'cancelado' con 'Rechazada'.
- COT sin sc_id → la primera caja queda neutra con 'Cotización directa'.
- COT con PVEN CANCELADO → Pedido queda 'cancelado' y Cotización 'actual'.
- PVEN con pec_numero → 4 cajas, y la de Compra apunta a compras; sin pec_numero → 3 cajas.
- La caja del propio documento no tiene href; las demás sí, y llevan return_to.
- pasoCotizacion: BORRADOR 0, PENDIENTE_CONFIRMACION 1, CONFIRMADA 2, RECHAZADA con canceladoEn 1, VENCIDA 1 con aviso.
Después: npm test y npx tsc --noEmit.
Playwright a 1024 y 1440 px:
- detalle de una SC sin COT, con COT y con PVEN;
- detalle de una COT sin SC y de una rechazada;
- detalle de un PVEN con PEC, sin PEC y cancelado;
- panel rápido del Hub;
- en cada pantalla, clic en cada enlace de la barra y luego 'Volver'.
```

**Comportamiento esperado:**

```text
- Solicitud con una cotización pendiente:
  · Solicitud aparece con ✓;
  · Cotización queda resaltada como 'COT-20260485 · Pendiente por confirmación';
  · Pedido se ve en gris con 'Sin pedido todavía'.
  Al tocar la cotización se abre, y 'Volver' regresa a la solicitud.
- Cotización rechazada y sin reemplazo: la caja Cotización queda en rojo con 'Rechazada'.
- Pedido cancelado y cotización que se puede volver a usar (H46 del Bloque 1): Pedido en rojo con 'Cancelado' y Cotización como paso actual.
- Pedido con compra: aparece una cuarta caja, 'Compra · PEC-…', que abre el pedido de compra.
- El documento abierto siempre dice 'Estás aquí'.
- Los pasos propios (4 en la SC, 3 en la COT y 5 en el PVEN) usan los mismos círculos, colores y ✓ que la barra de arriba.
- A 1024 px con el panel de Actividad abierto la barra cabe; si no, los sublabels pasan al tooltip.
```

**Datos existentes:**

```text
No toca datos.
```

**Riesgos:**

```text
- Archivos con varios dueños: solicitud/[id]/page.tsx y estado-solicitud.tsx (B2-T7, B3-T10b), cotizacion/[id] (T10 del Bloque 1, B2-T8, B3-T10a), venta/[id] (T10 del Bloque 1, B2-T8, B3-T10c) y page.tsx del Hub (ver FLUJO-ventas-pantallas). Este ítem solo cambia los bloques de las barras de pasos.
- En la SC quedan dos barras con propósitos distintos: arriba, el flujo entre documentos; en su tarjeta, los 4 estados de la solicitud. Así lo planteó U15 del Bloque 2 ('el avance de la cotización y del pedido se ve en la barra de progreso'). Las dos usan la misma pieza.
- Se conservan los textos de la COT ('Cotizado al cliente'). Si el usuario los quiere iguales a los de la SC ('Pendiente por confirmación'), es un cambio de una línea.
- H37 del Bloque 2 usa container queries en COT y PVEN. La barra va fuera del panel dividido para no competir por ese ancho.
- En el PVEN no se conoce el estado de la SC ni el de la COT (get_pedido solo trae sus números), así que esas cajas muestran solo el número. Basta, porque esos pasos ya se cumplieron.
```

**Depende de:**

```text
FLUJO-base y FLUJO-ventas-datos (lib/flujo-ventas.js). Bloque 1: T10 (PASOS_PEDIDO en venta/[id]). Bloque 2: B2-T5 (estados-solicitud.js con PASOS_SC y pasoSolicitud), B2-T7 (estado-solicitud.tsx) y B2-T8 (detalles de COT y PVEN, panel del Hub). Puede ir en paralelo con FLUJO-ventas-pantallas, salvo en ventas/page.tsx, que necesita un solo dueño.
```

**Archivos que nombra el diseño:** `frontend/src/lib/flujo-ventas.js`, `frontend/tests/test_flujo_ventas.mjs`, `frontend/src/components/flujo/CadenaDocumentos.tsx`, `frontend/src/components/flujo/index.ts`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/estado-solicitud.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/page.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### FLUJO-compras — El mismo diagrama en Compras: lista, pedido de compra, tránsito y recepción

**Grupo:** Diagrama del flujo · **Esfuerzo:** L · **Tareas del plan:** T1B, T1C, T2, T3B, T12, T14, T15, T16A, T16B

**Para el usuario:** Compras se lee igual que Ventas: ves dónde está cada compra y cuáles van tarde.

**Lo que vio y aprobó el usuario:** En Compras, la franja de arriba muestra el mismo tipo de diagrama: Lista de compras → Pedido de compra → En tránsito → Recepción en bodega → Recibido. Cada paso dice cuántos hay y cuántos van con atraso. 'Con atraso' significa que ya pasó la fecha de entrega estimada, y la franja lo dice así (hoy dice '+5d', aunque esos días no se usan). Un pedido que ya se recibió deja de aparecer como vencido. En el Hub de Compras, tocar un paso filtra la tabla. En Pedidos de compra, Mercancía en tránsito, Recepciones y Lista de compras aparece la misma franja con su paso resaltado, en lugar de los avisos de colores sueltos (el naranja de vencidos, el rojo de retraso y el ámbar de mesa activa). En el seguimiento de un pedido de compra, la barra muestra las etapas reales de ese envío (3 si es directo, 4 si va por casillero), no una barra fija de 4 pasos. Las etapas dicen 'Pendiente', 'En curso' o 'Completada' en vez de códigos. En Mercancía en tránsito, la columna Progreso muestra un punto por etapa. El Hub de Inventario no cambia por ahora, porque sus números todavía son de ejemplo.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- En Compras, ¿cuándo se considera atrasado un pedido de compra? → **Cuando ya pasó la fecha de entrega estimada. Se quita el botón 'Ajustar tiempos' de Compras, que hoy no guarda nada** (= recomendada)

**Ramas condicionadas del diseño (R1, vinculante; gana sobre el texto de abajo):** «Si el usuario elige la opción 2» (tolerancia_dias desde admin_config 'alerta_pec_dias' y volver a mostrar «Ajustar Tiempos») → NO: compras_atraso = «Cuando ya pasó la fecha de entrega estimada. Se quita el botón 'Ajustar tiempos' de Compras, que hoy no guarda nada» (R9). api/v1/flujo.py → NO: /compras/flujo va en erp_compras.py (C16).

**Cambios (diseño):**

```text
BACKEND
1) Nuevo backend/app/core/flujo_compras.py:
   - PASOS_FLUJO_COMPRAS = ('LISTA', 'PEC', 'TRANSITO', 'RECEPCION', 'RECIBIDO').
   - ETAPA_DE_ESTADO_PEC:
     · PEC: BORRADOR, EMITIDO y ENVIADO;
     · TRANSITO: EN_TRANSITO, PENDIENTE_ENTREGA y PARCIALMENTE_RECIBIDA;
     · RECIBIDO: RECIBIDO, RECIBIDA y COMPLETADO;
     · CANCELADO → None.
     etapa_de_pec(estado) manda un estado desconocido a 'PEC'.
     Si otro grupo del Bloque 4 crea core/estados_pec.py (con el patrón de estados_pedido.py), este mapa se mueve allá y aquí solo se importa.
   - resumen_flujo_compras(db, ahora=None, tolerancia_dias=0) devuelve la misma forma que el de Ventas:
     · LISTA: ítems con estado 'PENDIENTE', leídos de _load_lista_compras(db). Se lee el JSON SIN llamar a _sincronizar_pvens_pendientes_a_lista, porque esa función escribe. por_estado = {'PENDIENTE': n}; atrasados None.
     · PEC y TRANSITO: PurchaseOrderFull agrupado por estado con ETAPA_DE_ESTADO_PEC.
       - atrasados: fecha_entrega_estimada + tolerancia < ahora. Es la regla de _is_overdue, pero solo en estos dos pasos, así que un PEC recibido ya no cuenta como vencido.
       - mas_antiguo_dias: desde MIN(fecha_compra o created_at).
     · RECEPCION: GoodsReceipt en estado 'BORRADOR' (por confirmar); mas_antiguo_dias desde MIN(fecha_recepcion).
     · RECIBIDO: PEC en la etapa RECIBIDO, igual que la pestaña 'Recibidos'.
     · semaforo.atrasados = PEC + TRANSITO; semaforo.no_resueltos = PEC + TRANSITO + RECEPCION; criterio_atraso = 'fecha_entrega', con tolerancia_dias.
2) backend/app/api/v1/flujo.py: GET /compras/flujo con require_roles(*ALL_ERP_ROLES), igual que list_pec. No escribe nada.
   - tolerancia_dias es 0. Si el usuario elige la opción 2, se lee de admin_config 'alerta_pec_dias'.
   - Si FLUJO-ventas-datos no se ha aplicado todavía, este ítem crea flujo.py y su línea en main.py.
3) backend/tests/rollback_runner.py: agregar 'goods_receipts' a TABLAS, para que el chequeo de max(id) cubra las recepciones que crean las pruebas.
FRONTEND
4) Nuevo frontend/src/lib/flujo-compras.js:
   - PASOS_FLUJO_COMPRAS, con ayuda e íconos (lista, compra, transito, recepcion, recibido):
     · Lista de compras · 'por comprar' · /dashboard/compras/lista-compras;
     · Pedido de compra · 'sin despachar' · /dashboard/compras/pedidos;
     · En tránsito · 'en camino' · /dashboard/compras/transito;
     · Recepción en bodega · 'por confirmar' · /dashboard/compras/recepciones;
     · Recibido · 'recibidos' · /dashboard/compras/pedidos?tab=Recibidos.
   - etapaFlujoPec: espejo de etapa_de_pec.
   - ETIQUETA_ETAPA_TRACKING = {PENDIENTE: 'Pendiente', EN_PROCESO: 'En curso', COMPLETADO: 'Completada'} y etiquetaEtapaTracking.
   - pasosDeTracking(stages) → PasoVista[], en el orden del arreglo:
     · COMPLETADO → 'hecho', EN_PROCESO → 'actual' y PENDIENTE → 'pendiente';
     · sublabel: la fecha de la etapa, o 'llega {eta}';
     · aviso rojo con stage.alert.mensaje.
   - esPecAtrasado(p, ahora, tolerancia) y textoReglaCompras(tolerancia).
5) compras/page.tsx (Hub). Es de 'máxima protección', así que solo se cambian bloques:
   - El semáforo (l.567-610) pasa a <BannerFlujo titulo='Flujo de compras' regla='Con atraso: ya pasó la fecha de entrega estimada' idPreferencia='compras'>:
     · semaforo con los números del servidor y filtro: quickFilter;
     · pasos = pasosConConteos(PASOS_FLUJO_COMPRAS, …, {seleccionado});
     · clic en Pedido de compra, En tránsito o Recibido: filtra la tabla del Hub con etapaFlujoPec y activa la pestaña que corresponde;
     · Lista de compras y Recepción son enlaces a sus pantallas.
   - Se quitan 'Ajustar Tiempos' y su estado: abría una ventana que no guardaba nada y su número no se usaba. Solo vuelve si el usuario elige la opción 2.
   - retrasados se calcula con esPecAtrasado. Hoy cuenta como vencidos los PEC RECIBIDA y PARCIALMENTE_RECIBIDA.
   - Subtítulo: 'Compras a proveedores, envíos en camino y recepción en bodega.'
   - PecDetailPanel, lista 'Tracking' (l.201-220): una fila de <PasosFlujo variante='barra' pasos={pasosDeTracking(detail.tracking_stages)}/>; las tarjetas muestran etiquetaEtapaTracking en vez de PENDIENTE, EN_PROCESO o COMPLETADO.
6) compras/pedidos/page.tsx:
   - <BannerFlujo> debajo del SubNav, con actual 'PEC' (esEste).
     · En tránsito y Recibido están en esta página: hacen setActiveTab('En Transito' o 'Recibidos').
     · Lista y Recepción son enlaces.
   - El aviso naranja de vencidos pasa al botón 'Con atraso (n)' de la franja, que filtra con esPecAtrasado y vuelve a la página 1.
   - Se lee ?tab= al montar.
   - Subtítulo: 'Pedidos a proveedores y su seguimiento.' (sin BORRADOR → EMITIDO → …).
   - TrackingPanel: la barra visual (l.381-403) pasa a PasosFlujo 'barra', y las tarjetas usan etiquetaEtapaTracking.
7) compras/pedidos/[id]/page.tsx:
   - Se quitan STAGE_NODES y el relleno fijo (l.18-23 y 305-340).
   - La barra pasa a <PasosFlujo variante='barra' pasos={pasosDeTracking(pec.tracking_stages)}/>: 3 etapas si el envío es directo y 4 si va por casillero, por nombre y no por posición.
   - completedCount se calcula sobre stages.
8) compras/transito/page.tsx:
   - El aviso rojo 'ALERTA DE RETRASO…' pasa a la franja, con actual 'TRANSITO'.
   - El botón 'Con atraso' usa el mismo estado que 'Solo vencidos'.
   - Columna Progreso: <PasosFlujo variante='mini' pasos={pasosDeTracking(p.tracking_stages)}/> más 'n de m'.
   - 'Etapa actual' usa etiquetaEtapaTracking.
9) compras/recepciones/page.tsx: el aviso ámbar 'Mesa de Recepción activa' pasa a la franja, con actual 'RECEPCION'.
10) compras/lista-compras/page.tsx: franja con actual 'LISTA'.
11) package.json: '&& node tests/test_flujo_compras.mjs'.
Quedan FUERA:
- el Hub de Inventario, porque sus cifras son inventadas y no se pinta un flujo con números falsos;
- inventario/recepciones e inventario/traslados, que duplican pantallas de Compras;
- la logística de erp_logistica (Shipment.status_fise), que no tiene pantalla.
```

**Pruebas (diseño):**

```text
Backend: nuevo backend/tests/test_flujo_compras.py, con el runner (python tests/rollback_runner.py test_flujo_compras) y comparando antes y después:
1) test_cada_pec_cae_en_su_paso: PEC BORRADOR y EMITIDO suman en PEC; EN_TRANSITO y PARCIALMENTE_RECIBIDA en TRANSITO; RECIBIDA y COMPLETADO en RECIBIDO; CANCELADO no suma.
2) test_atrasados_solo_en_pasos_abiertos: un PEC EN_TRANSITO con fecha_entrega_estimada de ayer suma 1 atrasado; un PEC RECIBIDA con la misma fecha suma 0.
3) test_recepciones_por_confirmar: GoodsReceipt BORRADOR suma 1 en RECEPCION; COMPLETADA suma 0.
4) test_lista_de_compras_sin_escribir: se agrega un ítem PENDIENTE al JSON con _save_lista_compras dentro de la transacción y LISTA sube 1. Con contador_sql, GET /compras/flujo hace 0 commits.
5) test_paridad_etapas_con_el_frontend: node importa flujo-compras.js, y etapaFlujoPec da lo mismo que etapa_de_pec para todos los estados de ETAPA_DE_ESTADO_PEC y para uno desconocido.
6) test_el_rol_compras_y_el_asesor_pueden_leer: vendedor_token da 200; sin token, 401.
Frontend: nuevo frontend/tests/test_flujo_compras.mjs.
- pasosDeTracking:
  · con 3 etapas (directo) y con 4 (casillero), con EN_PROCESO en la segunda → ['hecho', 'actual', 'pendiente', …];
  · un arreglo vacío da [];
  · si los nombres no siguen un orden, se respeta el orden del arreglo;
  · el aviso sale de alert.mensaje.
- etiquetaEtapaTracking('EN_PROCESO') === 'En curso', y un valor desconocido sale humanizado.
- esPecAtrasado: RECIBIDA con la fecha vencida → false; EN_TRANSITO vencido → true; sin fecha → false.
Después: npm test y npx tsc --noEmit.
Playwright a 1024 y 1440 px, comprobando que no haya scroll horizontal de página:
- Hub de Compras;
- Pedidos de compra, con su panel de Tracking;
- detalle de un PEC directo y de uno por casillero;
- Tránsito, Recepciones y Lista de compras.
```

**Comportamiento esperado:**

```text
- Hub de Compras: franja 'Flujo de compras' con Lista de compras → Pedido de compra → En tránsito → Recepción en bodega → Recibido. Usa los números del servidor y la regla 'Con atraso: ya pasó la fecha de entrega estimada'.
- Un PEC recibido, también RECIBIDA o PARCIALMENTE_RECIBIDA, ya no aparece como atrasado.
- Tocar Pedido de compra, En tránsito o Recibido filtra la tabla del Hub. Lista y Recepción abren su pantalla.
- Pedidos de compra, Tránsito, Recepciones y Lista de compras: la misma franja con su paso como 'Estás aquí'. Los avisos de colores sueltos desaparecen.
- Seguimiento de un PEC: los círculos son las etapas reales de ese envío, con la etapa en curso resaltada y los textos 'Pendiente', 'En curso' y 'Completada'.
- Tránsito: cada fila muestra un punto por etapa.
```

**Datos existentes:**

```text
No modifica datos. GET /compras/flujo solo lee y no sincroniza la Lista de compras.
```

**Riesgos:**

```text
- compras/page.tsx es de 'máxima protección' (.agents/rules/no-full-tsx-rewrite.md): se cambian 4 bloques y se avisa antes de editar.
- El frontend tiene tres mapas distintos de estados del PEC (hub, pedidos y pedidos/[id]). Este ítem no los unifica; eso le tocaría a un estados-pec del grupo de tablas o de Kanban. Su franja y su regla de atraso salen de un solo mapa, con prueba de paridad.
- Lista de compras se lee sin sincronizar. Si un PVEN nuevo todavía no pasó a la lista (pasa al abrir Lista de compras), esa caja puede quedar un paso atrás hasta entonces.
- TABLA-compras y KANBAN-compras del Bloque 4 tocan los mismos archivos. Hace falta un dueño por archivo.
- Quitar 'Ajustar tiempos' de Compras cambia lo que el usuario ve. Por eso es una pregunta.
```

**Depende de:**

```text
FLUJO-base (PasosFlujo, BannerFlujo, useResumenFlujo, flujo.js) y el router backend/app/api/v1/flujo.py, que crea FLUJO-ventas-datos; si Compras va antes, este ítem crea el router y la línea de main.py. Del Bloque 1 solo necesita el runner (T0). Los Bloques 2 y 3 no tocan estas pantallas. Coordinar con TABLA-compras y KANBAN-compras del Bloque 4, y con el grupo que cree estados-pec.
```

**Archivos que nombra el diseño:** `backend/app/core/flujo_compras.py`, `backend/app/api/v1/flujo.py`, `backend/main.py`, `backend/tests/test_flujo_compras.py`, `backend/tests/rollback_runner.py`, `frontend/src/lib/flujo-compras.js`, `frontend/tests/test_flujo_compras.mjs`, `frontend/package.json`, `frontend/src/app/dashboard/compras/page.tsx`, `frontend/src/app/dashboard/compras/pedidos/page.tsx`, `frontend/src/app/dashboard/compras/pedidos/[id]/page.tsx`, `frontend/src/app/dashboard/compras/transito/page.tsx`, `frontend/src/app/dashboard/compras/recepciones/page.tsx`, `frontend/src/app/dashboard/compras/lista-compras/page.tsx` (la lista que manda es la de **Files** de la tarea y R27).


### PERMISOS — Permiso para reescribir pantallas grandes

**Grupo:** Permisos para este bloque · **Esfuerzo:** S · **Tareas del plan:** T0, T5D, T7, T8, T10, T14, T15, T17, T22

**Lo que vio y aprobó el usuario:** El proyecto tiene una regla que pide tu autorización antes de reescribir más del 30% de una pantalla grande. Para poner la tabla, el Kanban, las tarjetas y el flujo estándar hay que reescribir buena parte del Hub de Ventas, las listas de Solicitudes y Pedidos, el Hub y los Pedidos de Compras, el Hub de Inventario y el Resumen de Finanzas, y actualizar las dos guías de diseño del proyecto (la de la pestaña Análisis y la del sistema de diseño). Cada reescritura pasa por pruebas y revisión, y se te muestra con capturas del antes y el después.

**Decisiones del usuario:**
- Marcado por el usuario: **Bien** (sin comentario)
- ¿Autorizas reescribir más del 30% de esas pantallas (ventas/page.tsx, venta-client.tsx, solicitud-client.tsx, compras/page.tsx, compras/pedidos/page.tsx, inventario/page.tsx y finanzas/resumen/page.tsx) cuando haga falta? → **Sí, con pruebas, revisión y capturas del antes y el después** (= recomendada)
- ¿Autorizas actualizar las guías de diseño del proyecto (.agents/rules/analisis-tab-standard.md y design-system-reference.md) con el estándar nuevo? → **Sí, para que lo nuevo quede como regla** (= recomendada)

Este ítem no tiene diseño técnico: lo agregó la página del plan para pedir el permiso de la regla .agents/rules/no-full-tsx-rewrite.md. Cómo se aplica: R17.


## Anexo A: notas de los diseñadores por grupo

### Notas del grupo «tabla»

```text
1) Orden de trabajo:
- TABLA-base, luego TABLA-api, luego TABLA-hub-ventas, luego TABLA-listas-ventas.
- Después, en paralelo: TABLA-compras, TABLA-inventario y TABLA-otros. TABLA-inventario/Entregas necesita los parámetros estados y saldo de /ventas/pedidos, que agrega TABLA-listas-ventas.

2) Un solo dueño por archivo con los demás grupos del Bloque 4:
- ventas/page.tsx, solicitud-client.tsx, cotizacion-client.tsx, venta-client.tsx, compras/page.tsx, compras/pedidos/page.tsx, inventario/page.tsx y crm/page.tsx también los tocan KPI (U3), pipeline y aviso (U2/U10), Kanban (U4) y Análisis.
- Recomendación: por cada archivo, una sola tarea aplica todo, en este orden: tabla, Kanban, tarjetas, aviso y análisis.
- package.json: un solo cambio del script test para todo el bloque.

3) Contratos que este grupo entrega a otros:
- ConmutadorVista y useEstadoTabla para el Kanban (U4). El botón Lista/Tablero solo aparece si la página entrega vistaTablero; así se cumple R8 sin botones muertos.
- StatCard con la prop cargando (valor null = cargando) para las tarjetas (U3).
- 'semaforo' y 'resumen' de /ventas/hub/documentos para el aviso (U10) y las tarjetas del Hub.
- MenuFila, para cualquier menú de tarjeta.
- resolucion_ventas.py, para que el Kanban del Hub clasifique igual que la tabla. Ese Kanban ya no tiene todo en memoria y debe pedir sus columnas al endpoint.

4) Verificado en el código (Mirror b7841a5 y worktree del Bloque 1 00f8b33):
- H15: solicitud-client.tsx l.1252 y cotizacion-client.tsx l.631 tienen onClick={load}.
- H17: solicitud-client.tsx l.1234-1239 no tiene onClick.
- El Hub no pagina, usa key={idx} y abre el menú por hover (l.984-1007).
- Los list_* de ventas y compras ya aceptan offset y devuelven total, pero ninguna pantalla los usa.
- inventory_operations no tiene created_at.
- products ignora search y limit.
- stock-summary repite el tránsito en cada bodega.
- GET /compras/stats no existe.
- alertas_resumen usa otra regla de 'atrasado' que el Hub: incluye ASIGNADA y la COT confirmada sin pedido, y usa '<' donde el Hub usa '>='. Eso motiva la pregunta 'cot_confirmada_sin_pedido' y el paso opcional 3 del Hub.

5) Reglas del repo:
- no-full-tsx-rewrite: las páginas protegidas (ventas/page.tsx, compras/page.tsx, crm/page.tsx) se cambian por bloques, y su plan debe verse en la página de aprobación. En venta-client.tsx, el bloque de tabla, barra y paginación es cerca del 40% del archivo y necesita autorización explícita del usuario (no es una pregunta de negocio; pedirla aparte).
- design-system-reference.md: TablaEstandar importa el token TABLE de design-system.ts, que se actualiza.
- analisis-tab-standard.md (prohíbe chart.js) no aplica a este grupo.

6) Patrón de dos lados: el semáforo, los grupos de pedido y los grupos de PEC viven en Python y en JS. Se sigue el patrón 'módulo puro + espejo + prueba de paridad con node' del Bloque 1 (test_estados_pedido.py). Los contadores de H32, COT-LISTA y H47 no se rediseñan: solo pasan al servidor con paridad, porque al paginar el navegador ya no tiene todos los documentos.

7) Fuera de este grupo, como sugerencias de tareas aparte:
- Los selectores que precargan 200 o 100 (NuevoPecModal con PVEN, 'Recepcionar PEC', el Dashboard general con 50, el Kanban del CRM con 500) siguen con tope; conviene un buscador con servidor.
- Las pantallas que llaman endpoints inexistentes (compras/historial, proyecciones, registro, ventas/proyecciones).
- Exportar día y rango (carga sin construir).
- El 403 del CRM para asesores.
- Gastos en USD.
- Mojibake en E-commerce.
- lista-compras sincroniza en cada GET.

8) Pruebas backend siempre con backend/tests/rollback_runner.py (R7 del Bloque 1), nunca pytest completo. Pruebas frontend con node tests/*.mjs y npx tsc --noEmit. Para la revisión del usuario: capturas de Playwright a 1024 y 1440 px en la página de revisión visual con notas.
```

### Notas del grupo «kanban»

```text
Para el crítico (grupo kanban, Bloque 4):
1) Solo lectura. No modifiqué, creé ni borré nada en el repo, y no corrí pruebas, servidores ni migraciones. Para leer los JSON de los Bloques 2 y 3 con tildes, escribí UN archivo temporal de extracción en mi scratchpad de sesión (scratchpad/b4-kanban-b23.txt). No está en el repo y se puede borrar.

2) Orden sugerido:
- Primero KANBAN-base.
- Después KANBAN-hub-ventas y KANBAN-ventas-listas. Comparten kanban-ventas.js: lo crea el primero que entre.
- Después KANBAN-compras, y luego KANBAN-logistica, que usa estados-compras.js y filtrar_por_estados en /ventas/pedidos.
- KANBAN-crm y KANBAN-resto pueden ir en cualquier momento después de la base (resto necesita COLUMNAS_PEDIDO).

3) Choques con otros grupos del Bloque 4:
- Mismos archivos que TABLA, KPI y pipeline: ventas/page.tsx, venta-client, cotizacion-client, solicitud-client, compras/page.tsx y compras/pedidos/page.tsx. Necesitan un dueño por archivo; el Kanban solo reemplaza su bloque y los dos botones.
- Nombre del botón: lo llamé «Kanban», con el ícono lucide Kanban. Si TABLA-base agrega un selector de columnas de la tabla, debe usar otro nombre e ícono.
- El tamaño 25/50 debe ser una sola preferencia compartida entre tabla y tablero.
- filtrar_por_estados y el parámetro `orden` (backend/app/core/filtros_lista.py) deben servir también si TABLA-base pasa las listas a paginación en el servidor. Que no se invente otro nombre.
- U1: dentro de cada columna ordeno primero lo atrasado y lo que más tiempo lleva quieto, para que sea coherente con «lo no resuelto primero».

4) Cosas que cambian algo que el Bloque 1 no diseñó (revisarlas):
- Hub, COT soltada en «No Resuelto»: hoy manda PENDIENTE_CONFIRMACION, es decir, envía al cliente. Lo cambio por «retomar» (RECHAZADA → BORRADOR) y bloqueado en los demás casos.
- Hub: DEVUELTO_TOTAL cae hoy en «No Resuelto»; pasa a «Cancelado».
- SC soltada en «Acción Tomada»: hoy da 400 (nota 7 del Bloque 2); ahora queda bloqueado antes de soltar.
- Todo lo demás del Hub (soltar en Cancelado abre el modal de N3; En gestión envía con canal, H27; reglas de N2 para VEN) se respeta tal cual. Si T9 lo implementa distinto, gana T9.

5) Fuentes de etiquetas nuevas:
- estados-cotizacion.js (COT), con prueba de paridad contra ETIQUETAS_ESTADO['COT'].
- estados-compras.js (PEC, recepción, ítem de lista y traslado), más ETIQUETAS_ESTADO['PEC'] y core/estados_pec.py en el backend, con paridad.
- Si otro grupo del Bloque 4 también define etiquetas de PEC o de COT, tiene que quedar UNA sola fuente.

6) Reglas nuevas en el servidor (solo en KANBAN-compras). update_pec deja de aceptar estados libres:
- a mano solo se puede pasar a EMITIDO desde BORRADOR, o a CANCELADO (con motivo y sin recepciones);
- EN_TRANSITO y RECIBIDO solo los ponen el seguimiento y la recepción.
Por eso cambian 8 puntos del frontend de Compras (los dos tableros, los dos paneles, los dos menús de fila y las dos cancelaciones masivas) y 1 prueba existente (test_pendiente_compra_lista_pec.py, l.97 y l.132). Revisé con grep que no hay otros PATCH de estado de PEC.

7) Hallazgos FUERA de alcance, para tareas aparte (los verifiqué leyendo el código):
- (a) pipeline_stages no tiene las columnas alert_days, alert_message ni is_closed. PUT /crm/pipeline-stages/{id}/config hace setattr sobre un atributo que no se guarda, así que la alerta por etapa vuelve a 7 en cada recarga.
- (b) solicitud/[id]/page.tsx l.239 manda {stage_id} a PATCH /crm/leads/{id}/stage, pero el backend lee pipeline_stage_id. Da 404, el .catch se lo traga y el lead nunca se mueve.
- (c) PATCH /ventas/pedidos solo admite ADMIN y ASESOR: un usuario BODEGA no puede despachar desde Entregas.
- (d) update_tracking no valida el orden de las etapas, y el TrackingPanel deja completar cualquier etapa.
- (e) PATCH /compras/lista-compras/{id} acepta cualquier estado, y el frontend permite «Marcar recibido» desde PENDIENTE, saltándose el PEC.
- (f) react-hot-toast sin <Toaster/> montado (ya anotado en el Bloque 2): los errores del CRM no se ven. El tablero común usa useAvisos.
Lo que sí corrijo dentro del Kanban del CRM:
- el ASESOR recibe 403 en /pipeline-stages/config y el CRM no carga;
- los leads que pasan a Perdido desaparecen al recargar;
- los leads sin etapa no salen en ninguna columna.

8) Kanban de solo lectura (Recepciones, Lista de compras y Traslados): su estado lo pone el proceso. El tablero muestra por qué no se arrastra y lleva al lugar donde se hace.
Donde no aplica (tablas sin estado), propongo no mostrar el botón; es la pregunta kanban_tablas_sin_estado.

9) Preguntas: 2 de KANBAN-base (columnas cerradas y vista inicial), 2 de compras (motivo y cancelar en tránsito), 1 de tránsito (arrastrar completa la etapa), 1 de CRM (lead con solicitud) y 1 de resto (tablas sin estado).
No pregunté nada que ya decidió el Bloque 1: motivo al cancelar o rechazar en el Hub, preguntar el canal al arrastrar, Facturado solo desde Entregado con confirmación y despacho por Entregas.
```

### Notas del grupo «kpis»

```text
SOLO LECTURA: no modifiqué ni creé ningún archivo, ni corrí pruebas o servidores. Leí el checkout Mirror (b7841a5), el worktree del Bloque 1 (00f8b33, todavía sin T7, T9, T10 ni T11), los diseños de los Bloques 2 y 3, las tres revisiones y las capturas paso-01, 42 y 43, y ref-analisis.

ORDEN SUGERIDO
1. KPI-base. No choca con ninguna página.
2. KPI-ventas.
3. KPI-compras.
4. KPI-inventario.
5. KPI-otros.
Cada ítem agrega su propio hunk al script 'test' de package.json.

COORDINACIÓN CON OTROS GRUPOS DEL BLOQUE 4
- Análisis:
  · Las filas de indicadores dentro de las pestañas Análisis no son de este grupo: Hub de Ventas ~l.720, SC l.1405-1425, PVEN l.221-232, compras/pedidos l.1666-1672, Hub de Compras, Hub de Inventario y CRM l.1037-1111.
  · Deben usar FranjaKpis y TarjetaKpi con `variacion`, y backend/app/core/periodos.ventanas() para el período anterior.
  · Ese grupo también actualiza .agents/rules/analisis-tab-standard.md, que hoy exige tarjetas con gradiente y SVG.
  · Gracias al adaptador de StatCard, esas filas ya toman el tamaño nuevo mientras tanto.
- Semáforo y pipeline (U1, U2, U10):
  · Los atrasados salen de las tarjetas y los muestra el semáforo.
  · Su banner debe usar <Contador> para cubrir H6 en las pastillas.
  · El 'Embudo' del Dashboard General, con estados que no existen, es de ese grupo.
- Tablas (U5, U26):
  · Si pasan las listas a paginación de servidor, deben usar el parámetro `kpi` definido en KPI-ventas y KPI-compras. Así el número de la tarjeta coincide con el total filtrado.
  · Usan <Contador> en las pestañas.
  · Deben dejar espacio en la barra de herramientas para el chip 'Filtro: …'.
  · Las tablas de Inventario (Hub, Stock y Abastecimiento) siguen con datos inventados o con el origen equivocado. Mientras tanto, la franja muestra una nota.
- Kanban: debe agrupar los PEC con lib/grupos-estado.js / core/grupos_estado.py, que vive en un solo archivo.

ARCHIVOS CON VARIOS DUEÑOS
- Los más compartidos: ventas/page.tsx, compras/page.tsx y compras/pedidos/page.tsx, todos con 'máxima protección'. Aquí se tocan solo zonas pequeñas y nombradas.
- venta/[id] y solicitud/[id] tienen hunks sin commitear de otras sesiones.

DECISIONES DEL BLOQUE 1 QUE SE RESPETAN
- La semántica de H32, N8, COT-LISTA y H47 se conserva.
- Lo único que cambia es:
  · los nombres, unificados con el catálogo;
  · la fuente de SC y COT, que pasa al servidor (/ventas/stats) y deja las funciones del Bloque 1 como respaldo;
  · la constante ESTADOS_VEN_SIN_DINERO, que aplica la decisión de H47 «el devuelto tampoco suma» también al resumen de list_pedidos.

HALLAZGOS NUEVOS AL VERIFICAR (no estaban en el inventario)
- agenda/page.tsx:1242-1354 lee customer360.financials, quotations, sales_orders y customer_requests. El backend (crm.py:813-858) manda resumen_financiero, cotizaciones, pedidos y solicitudes. Por eso el saldo, lo pagado, los pedidos y las cotizaciones de la ficha del cliente siempre salen en 0 o en 'Al día con pagos'. Lo arregla KPI-otros.
- erp_inventario.py:430-437: el tránsito filtra PEC por 'CONFIRMADA', 'ENVIADA', 'PARCIALMENTE_ENVIADA' y 'PARCIALMENTE_RECIBIDA', estados que los PEC reales casi no usan, así que da ~0. Además, stock-summary repite ese valor en cada bodega. Lo arregla KPI-inventario.
- compras/page.tsx: su colorMap no tiene indigo ni amber, y cae en purple.
- inventario/entregas cuenta 'COMPLETADO', que no existe, y deja FACTURADO en la cola.
- ecommerce.py:457 usa date.today() del servidor, no la hora de Colombia.
- Corrección al inventario recibido: lib/api.ts apiFetch ya devuelve el JSON parseado, no el Response crudo.

SUPUESTOS
- core/fechas.py del Bloque 3 (B3-T0) ya existe cuando se aplique el Bloque 4.
- Tailwind 4.3.3 trae container queries (U24 del Bloque 2 ya las usa).

PREGUNTAS
- Hay 7 preguntas de negocio en total. Las tres de KPI-base (período, montos largos y tarjeta de dinero de los Hubs) afectan a todos los ítems de despliegue.
- Si el usuario elige 'Abreviados', formatoCompacto se activa en lib/kpis.js.
- Si elige 'Como hoy' para el dinero, el Hub usa pven_monto_entregado.

DATOS
- Ningún ítem migra ni corrige datos.
- Las pruebas de backend afirman diferencias antes y después del cambio, porque erp_test es compartida, y se corren solo con backend/tests/rollback_runner.py.
```

### Notas del grupo «analisis»

```text
INVENTARIO DE ANÁLISIS (verificado en b7841a5)

Existen:
- Hub de Ventas: barras hechas con divs. Si la API falla muestra cifras inventadas (450000, 65 %, 48 %). El filtro de producto no está conectado y el Copilot llama a /ventas/ai-chat, que no existe.
- Solicitudes: gráficos SVG hechos a mano e IA simulada con setTimeout.
- Cotizaciones: la pestaña está vacía y muestra la tabla.
- Pedidos: tiles y barras con divs; debajo aparece una tabla vacía.
- CRM: tiles y barras.
- Hub de Compras: SVG con la línea invertida e IA simulada.
- Pedidos de compra: controles que no hacen nada e IA que llama a /ventas/ai-chat.
- Lista de compras y Traslados: solo IA simulada.
- Historial de compras: página huérfana.
- Hub de Inventario: SVG sobre datos inventados.
- Finanzas/Resumen: chart.js con datos de ejemplo en USD.

Faltan (ver la pregunta nuevos_hubs): E-commerce, Marketing, Logística y el Dashboard general.

Fuera de alcance: las dos pantallas de proyecciones (usan /api/forecast, que no existe) y las métricas de marketing/campañas.

CONFLICTOS
- .agents/rules/analisis-tab-standard.md prohíbe chart.js y exige una tarjeta de IA. Se reescribe en ANALISIS-base, porque la decisión del usuario fue usar ref-analisis con chart.js.
- .agents/rules/no-full-tsx-rewrite.md: compras/page.tsx (~33 %), inventario/page.tsx (~36 %) y finanzas/resumen (100 %) superan el 30 %. El plan debe citar la aprobación de cada ítem como la autorización explícita.

ORDEN
1. ANALISIS-api.
2. ANALISIS-base, después de la tarjeta de KPI de U3.
3. ANALISIS-ventas.
4. ANALISIS-finanzas.
5. Compras, Inventario y CRM, en paralelo.
En cada pantalla, el Análisis va después de los grupos de tablas, kanban, kpis y pipeline: un solo dueño por archivo.

CRUCES CON LOS BLOQUES 1 A 3
- Etiquetas de textos_actividad (R12).
- Regla de dinero de H47.
- Constantes de pagos de ventas_dinero: el traslado no es dinero nuevo (R6).
- rollback_runner con contador_sql (R7).
- Hora de Colombia con −5 h fijas, como documento_cliente del Bloque 3.
- Reemplazar el Análisis de Solicitudes anula la dona de U15 y la etiqueta de H10 del Bloque 2.

DATOS
Todo es solo lectura. En erp_test, las cifras incluyen documentos de prueba viejos.

FUERA DE ALCANCE (para tareas aparte)
- /ventas/ai-chat no existe.
- crm/calendario usa una clase Tailwind como color CSS; hexDeClaseTailwind lo resolvería.
- /finance/dashboard hace consultas N+1.
- lista-compras/stats escribe en cada GET.
- stock-summary hace una consulta por referencia y bodega.
```

### Notas del grupo «pipeline»

```text
Para el crítico (grupo pipeline: U2 + U10).
1) Cómo leí U10. La nota del paso 12 está en x 20,9 %, y 19 % de la captura, justo sobre la franja oscura 'Interactive Pipeline' de la lista de SC. No está sobre los botones del encabezado. Por eso U10 = esa franja con el estilo del semáforo del Hub. H9 del Bloque 2 suponía que U10 era el encabezado y sus botones (ContenidoEnlace). Si se quiere unificar también el encabezado, le toca al grupo de KPIs/encabezados; este grupo solo cambia el subtítulo.
2) Una pieza, tres usos, para que no haya dos componentes haciendo lo mismo. Todas usan PasosFlujo (components/flujo):
   - la franja de Hub y listas (variante banner);
   - las barras de los documentos (variante barra): la cadena SC → COT → PVEN, que reemplaza el 'Progreso del Flujo' de la SC y del panel rápido del Hub; los 4 pasos de U15 (solo cambia su dibujo dentro de estado-solicitud.tsx; título, ayuda y Reiniciar siguen como los diseñó el Bloque 2); el stepper de la COT; el del PVEN con PASOS_PEDIDO del Bloque 1; y las etapas de envío de Compras;
   - los puntos de la tabla de Tránsito (variante mini).
   Desaparecen 6 steppers hechos a mano.
3) Una sola regla de atraso:
   - backend: core/flujo_ventas.contar_atrasados, que mueve sin cambios las cinco consultas de alertas_resumen (en su versión tras B2-T2 y B3-T3);
   - navegador: lib/flujo-ventas.esAtrasadoVentas, con prueba de paridad por node.
   U1 (TABLA-ventas, ordenar primero lo atrasado) debe usar esAtrasadoVentas. Si pasa el Hub a paginación en servidor, debe recibir paso y atrasados y usar cond_paso, para que la caja y la tabla den el mismo número. ESTADOS_NO_RESOLUCION hoy no coincide: el Hub no tiene ASIGNADA y el servidor sí; aquí queda unificado.
4) H6 está resuelto solo en la franja ('—' mientras carga; nunca 0 ni 'Todas al día'). Los contadores de las pestañas y los KPIs son de TABLA y KPIs, que pueden reutilizar textoConteo.
5) Archivos con muchos dueños: page.tsx del Hub, los tres clientes de lista, los tres detalles y compras/page.tsx ('máxima protección'). Propongo que el plan del Bloque 4 tenga un dueño por archivo y este orden:
   - FLUJO-base;
   - FLUJO-ventas-datos;
   - en cada archivo, primero los bloques de cabecera de este grupo (son reemplazos de bloques, menos del 30 %) y después tablas, Kanban y KPIs.
   Los componentes van en components/flujo y no en components/ui, para no tocar ui/index.ts, que tienen B2-T0 y el grupo de KPIs.
6) Hay un conflicto con .agents/rules/design-system-reference.md: pide usar lib/design-system.ts, que nadie importa, y pone de ejemplo el subtítulo 'Pipeline: A → B → C'. Conviene actualizar esa regla con el OK del usuario.
7) Preguntas:
   - posición de la franja (una sola franja arriba o el diagrama bajo el título; BannerFlujo admite las dos con 'partes');
   - qué muestra cada caja: 'diagrama de tiempo' podría significar ver además los días del más antiguo; el backend siempre devuelve mas_antiguo_dias y la pantalla lo muestra o no;
   - qué pasa al tocar un paso en el Hub;
   - la regla de atraso en Compras.
   Todas son de preferencia o de negocio, con la opción recomendada.
8) Fuera de alcance a propósito:
   - Hub de Inventario: sus números son inventados.
   - inventario/recepciones y traslados: duplican pantallas de Compras.
   - El pipeline de Shipment de erp_logistica: hay dos pipelines de tránsito paralelos y ninguno tiene pantalla de logística.
   - Otras partes del Dashboard General: solo se cambia su 'Embudo Operativo', que hoy cuenta estados que no existen y enlaza a una ruta 404.
9) Backend:
   - solo lecturas, sin migraciones; los endpoints nuevos viven en un router aparte, backend/app/api/v1/flujo.py, para no engordar erp_ventas.py ni erp_compras.py;
   - el único cambio en archivos existentes: alertas_resumen pasa a usar el helper (mismo resultado) y _cot_dict expone el booleano confirmacion_cliente;
   - /compras/flujo no llama a _sincronizar_pvens_pendientes_a_lista porque esa función escribe.
10) No modifiqué ni creé archivos, ni corrí pruebas, servidores o consultas. Leí Mirror en b7841a5 (sin los cambios sin commitear), el worktree del Bloque 1 (00f8b33), los diseños de los Bloques 2 y 3 y las capturas de los pasos 01, 12, 42 y 43.
```

## Anexo B: pantallas revisadas por el diseño

| Ruta | Módulo |
|---|---|
| /dashboard/ventas | Ventas · Hub (SC + COT + PVEN unificados) |
| /dashboard/ventas/solicitud | Ventas · Lista de Solicitudes de Cliente (SC) |
| /dashboard/ventas/cotizacion | Ventas · Lista de Cotizaciones (COT) |
| /dashboard/ventas/venta | Ventas · Lista de Pedidos de Venta (PVEN) |
| /dashboard/ventas/solicitud/[id] | Ventas · Detalle de SC |
| /dashboard/ventas/cotizacion/[id] | Ventas · Detalle de COT |
| /dashboard/ventas/venta/[id] | Ventas · Detalle de PVEN |
| /dashboard/ventas/exportar-dia y /dashboard/ventas/exportar-rango | Ventas · Importar ventas de chat / exportar a Odoo |
| /dashboard/ventas/proyecciones | Ventas · Proyecciones |
| /dashboard/ventas/sincronizacion, /dashboard/ventas/validacion-odoo, /dashboard/ventas/solicitud/nueva | Ventas · Utilidades |
| /dashboard/cotiza | Cotizador Rápido |
| /dashboard/crm | CRM · Pipeline de leads (Kanban, Lista, Análisis) |
| /dashboard/crm/calendario | CRM · Seguimientos |
| /dashboard/agenda | Agenda de Clientes y Proveedores (ficha 360) |
| /dashboard/calendario | Calendario de eventos (CRM) |
| /dashboard/marketing | Marketing · Landing del hub |
| /dashboard/marketing/campanas | Marketing · Campañas |
| /dashboard/marketing/flujos y /dashboard/marketing/historias | Marketing · Flujos por keyword / Publicaciones |
| /dashboard/marketing/visitantes | Marketing · Visitantes & Leads |
| /dashboard/asistente_omnicanal | Asistente Omnicanal (iframe de Chatwoot + contexto ERP) |
| /dashboard/asistente y /chat | Asistente IA (marcador de 'en construcción') / Web chat público para clientes |
| /dashboard | Dashboard General · 'Torre de Control' |
| /dashboard/ecommerce | E-Commerce Center |
| /dashboard/sitio-web, /dashboard/website, /dashboard/historias, /dashboard/integraciones (+apis, mcp), /dashboard/scrapper, /dashboard/perfil | Herramientas varias |
| /dashboard/compras | Compras · Hub |
| /dashboard/compras/pedidos | Compras · Pedidos de Compra (PEC) |
| /dashboard/compras/pedidos/[id] | Compras · Detalle de PEC (página casi huérfana) |
| /dashboard/compras/transito | Compras / Logística · Mercancía en Tránsito |
| /dashboard/compras/recepciones | Compras · Mesa de Recepciones (ENINV) |
| /dashboard/compras/recepciones/[id] | Compras · Detalle/conteo de recepción |
| /dashboard/compras/lista-compras | Compras · Lista de Compras |
| /dashboard/compras/traslados | Compras · Traslados Internos |
| /dashboard/compras/historial · /dashboard/compras/proyecciones · /dashboard/compras/registro | Compras · Reportes heredados |
| /dashboard/inventario | Inventario · Hub |
| /dashboard/inventario/productos | Inventario · Catálogo de Productos |
| /dashboard/inventario/stock | Inventario · Stock |
| /dashboard/inventario/kardex | Inventario · Kardex |
| /dashboard/inventario/recepciones | Inventario · Recepciones (duplicado de Compras) |
| /dashboard/inventario/entregas | Inventario / Logística · Entregas (despacho de PVEN) |
| /dashboard/inventario/traslados | Inventario · Traslados (duplicado) |
| /dashboard/inventario/ajustes | Inventario · Ajustes |
| /dashboard/inventario/abastecimiento | Inventario · Abastecimiento |
| /dashboard/inventario/bodegas · /almacenes · /ubicaciones · /rutas · /compartido | Inventario · Bodegas y logística física (placeholders) |
| /dashboard/inventario/categorias · /calendario · /operaciones | Inventario · Otras |
| (no existe pantalla) — Logística: backend /api/v1/logistica/* | Logística |
| /dashboard/finanzas/resumen | Finanzas · Dashboard P&L |
| /dashboard/finanzas/gastos | Finanzas · Control de Gastos |
| /dashboard/admin/empleados | Admin · Empleados, Roles y Permisos |
| /dashboard/admin/configuracion | Admin · Configuración General |
| /dashboard/admin/ajustes | Admin · Ajustes por Módulo |
| /dashboard/ecommerce | E-Commerce · E-Commerce Center |
| /dashboard/sitio-web · /dashboard/website | E-Commerce · Tienda / Constructor web |
| /dashboard | Reportes · Dashboard General |
