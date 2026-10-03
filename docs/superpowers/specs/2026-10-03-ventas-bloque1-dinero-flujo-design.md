# Ventas · Bloque 1 · Dinero y flujo — Especificación

Fecha: 2026-10-03 · Rama: `ventas-bloque1-dinero-flujo` · Base: `b7841a5`

## Objetivo

Que el dinero y el flujo Solicitud (SC) → Cotización (COT) → Pedido de Venta (PVEN) → Orden de pago (PXP) sean correctos y coherentes: montos en pesos enteros, anticipo según la modalidad de pago (o manual con nota) y verificado antes de crear el pedido, PXP con montos al derecho, cancelaciones con reglas, estados con nombre claro, contadores reales, y las correcciones de plataforma (sesión de 24 h, tema claro, guardado rápido).

## Origen

- Recorrido QA de Ventas con capturas (página de revisión) y anotaciones del usuario.
- Verificación independiente de 46 hallazgos + N1–N10 (ninguno falso).
- Diseño por ítem y cruce crítico (choques, huecos, orden), en `diseno-bloque1.json`.
- Página del plan: el usuario marcó los 29 arreglos como **Bien** y respondió las 29 preguntas (2026-10-03). Comentario general: "nada que quiera agregar".

## Decisiones generales del usuario (página de revisión)

- Anticipo: sigue el % de la modalidad y se recalcula. Se cobra antes de crear el pedido (alguien lo verifica).
- Cancelar una SC con COT/PVEN activos: impedirlo. Rechazar una COT: la SC sigue activa.
- Pedido cancelado: la COT se puede reusar. "Nuevo Pedido" en la lista de pedidos: quitarlo.
- Precios exactos (pesos enteros, sin redondear a centena o mil). PXP: también el asesor puede crearla.
- Correo de respaldo: sí. Actividades viejas: corregirlas. Sesión: 24 h sin uso. Tema: claro.

## Reglas de implementación (rulings)

- **R1 — Montos viejos con centavos (H42, usuario: "Sí, en documentos que no tengan pagos registrados").** Distinto de la recomendación del diseño. En T1 solo se crea el redondeo para lo nuevo. En T14 se agrega un paso: listar SC/COT/PVEN/PXP con montos no enteros y SIN SaleOrderPayment (en PVEN y en las PXP de ese PVEN) y, tras el OK del usuario, redondear con redondear_peso recalculando los totales desde las líneas redondeadas para que cuadren. Documentos con pagos registrados no se tocan.
- **R2 — Modalidad por defecto (usuario: "Contado (100% antes del pedido)"; "Otro"/vacía: "60%").** Se deja 'Contado' como valor por defecto (modelo, create_solicitud y formulario no cambian). Mapa del porcentaje: Contado→100, 60/40→60, Crédito (cualquier valor que empiece por "Cr", sin importar tildes/mayúsculas)→0, "Otro" o vacío→60. Siempre min(pct, 100).
- **R3 — Anticipo manual con nota obligatoria (H36+H43, usuario: "Sí, con una nota obligatoria").** Distinto de la recomendación del diseño. BACKEND (T3): migración aditiva fa6_024 con dos columnas nulas en sales_quotations: anticipo_pct_manual NUMERIC(5,2) NULL y anticipo_manual_nota TEXT NULL (+ modelo). PATCH /cotizaciones/{id} acepta {anticipo_pct_manual: número|null, anticipo_manual_nota: str}: con número exige 0≤pct≤100 y nota de al menos 5 caracteres (si no, 422 con mensaje claro); null vuelve a la modalidad. Solo mientras la COT no esté CONVERTIDA/RECHAZADA/CANCELADA (si no, 409). Lo pueden hacer quien puede editar la COT (asesor o admin). pct_anticipo_cotizacion usa el manual si no es None; si no, la modalidad (R2). Todo recálculo (re-cotizar, cambio de modalidad en la SC) respeta el manual. Actividad COT: "Anticipo ajustado a mano: 50% (antes 60%). Nota: …" y al quitarlo "Anticipo vuelve a la modalidad (60%)". GET /cotizaciones/{id} expone anticipo_pct_manual, anticipo_manual_nota y anticipo_requerido. FRONTEND (T10): en el detalle de la COT, junto al anticipo, un control "Ajustar anticipo" (porcentaje + nota obligatoria, botón Guardar, opción "Volver a la modalidad"), y una marca visible "Anticipo manual: 50% — <nota>".
- **R4 — Pago parcial del anticipo (N1, usuario: "Sí, y queda debiendo la diferencia").** Distinto de la recomendación del diseño: el diseño de N1 rechaza con 422 un pago menor al requerido; eso se cambia. Reglas: si anticipo_requerido > 0, la verificación es obligatoria y el monto debe ser > 0 y ≤ total (si no, 422). Si monto < requerido, se acepta: se registra el SaleOrderPayment ANTICIPO CONFIRMADO por el monto real, saldo_cop = total − pagado, y la Actividad del PVEN dice "Anticipo parcial verificado: $X de $Y requerido. Queda debiendo $Z de anticipo." El estado inicial del PVEN es el mismo que hoy produce la conversión/recalculate_sale_order_state (no se inventan estados nuevos). El modal (T10) muestra en ámbar "El pago es menor que el anticipo requerido: el pedido quedará debiendo $Z" y exige marcar una casilla de confirmación antes de crear. El detalle del PVEN muestra "Anticipo pendiente: $Z" mientras pagado < requerido.
- **R5 — Columna Antigüedad (H2, usuario: "Que muestre los días desde que se creó").** Distinto de la recomendación del diseño. La columna conserva el título "Antigüedad" y calcula días desde created_at del documento (no desde el último movimiento), interpretando las fechas del API como UTC (agregar "Z" si no traen zona). Textos: "hoy", "hace 1 día", "hace N días"; nunca negativos (mínimo 0).
- **R6 — Pago trasladado (N1, usuario: "Sí, se traslada como saldo a favor").** Si un PVEN con pagos CONFIRMADO se cancela y la misma COT se convierte otra vez, el dinero no se pide ni se cuenta dos veces. BACKEND (T3): al convertir, saldo_a_favor = suma de pagos CONFIRMADO de PVEN CANCELADO de esa COT que no se hayan trasladado ya. Si > 0: en el PVEN nuevo se crea un SaleOrderPayment ANTICIPO CONFIRMADO con metodo 'TRASLADO', referencia = número del PVEN cancelado y monto = min(saldo_a_favor, total); los pagos de origen quedan marcados para no trasladarse de nuevo (usar el campo de estado/notas que ya tenga SaleOrderPayment; si hay estado, 'TRASLADADO'; si no hay forma limpia, columna nula aditiva en la misma migración fa6_024). El requerido a verificar se reduce en lo trasladado; si el traslado cubre el requerido, no se exige verificación nueva. Actividad en ambos PVEN ("Saldo a favor de $X trasladado desde PVEN-… / hacia PVEN-…"). GET /cotizaciones/{id} expone saldo_a_favor. FRONTEND (T10): el modal de verificación muestra "Saldo a favor del pedido cancelado PVEN-…: $X" y descuenta ese valor del monto a verificar. Pruebas: cancelar PVEN con pago verificado → convertir de nuevo → el PVEN nuevo tiene el pago TRASLADO y la suma de pagos CONFIRMADO no trasladados de la COT no se duplica; una tercera conversión no vuelve a trasladar lo ya trasladado.
- **R7 — Runner de pruebas dentro del repo (T0).** El runner de ROLLBACK pasa a vivir en el repo como backend/tests/rollback_runner.py (copia del scratchpad run_tests_rollback.py) con rutas relativas a su propio archivo (sys.path = backend y backend/tests; load_dotenv(backend/.env)), para que corra el código del worktree. Se amplía con: monkeypatch (pytest.MonkeyPatch.context() por prueba), user_vendedor y vendedor_token (usuario VENDEDOR creado dentro de la transacción revertida, como en conftest), sku (misma lógica que conftest), soporte de fixtures generadoras (yield) con su teardown, y un contador de consultas/commits sobre la clase Engine (event.listen(sqlalchemy.engine.Engine, 'before_cursor_execute') y Session 'after_commit') utilizable por H29. Uso: `cd C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-bloque1-dinero-flujo\backend` y `C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe tests/rollback_runner.py <modulo_sin_.py>`. NUNCA correr pytest completo: trunca erp_test.
- **R8 — N9 (lista de Pedidos de Venta, sin diseño).** En T10 se incluye lo mínimo: volver a la página 1 (setCurrentPage(1)) al cambiar pestaña, filtro o búsqueda, y que cada opción del menú de fila de venta-client.tsx haga lo que dice (o se quite si no tiene acción). El conmutador de Kanban queda para el Bloque 4 (Kanban en todas las tablas); si hoy hay un botón Kanban sin acción, se oculta.
- **R9 — update_pxp marca PAGADA sin pago (hueco).** Fuera del Bloque 1: tocar el libro de pagos choca con la consolidación TD-05 (payment_transactions) que vive en otra rama. Se anota como pendiente en el ledger y se le informa al usuario al final. No se implementa aquí.
- **R10 — Volver a Borrador con documentos activos (hueco).** PATCH /solicitudes/{id} {estado:'BORRADOR'} sobre una SC con COT o PVEN activos (_documentos_activos_de_solicitud no vacío) responde 409 con el mismo mensaje de N4 nombrando el documento. Lo hace T4 (backend) con prueba; el frontend (T9 Hub "No resuelto", T11 pastilla Borrador) muestra el mensaje del servidor.
- **R11 — Redondeo en update_pedido (hueco de H42).** update_pedido pasa total_cop, subtotal_cop, saldo_cop y montos de anticipo por redondear_peso en el servidor. Lo hace T1.
- **R12 — Los choques del cruce son vinculantes.** Cada choque de la sección "Choques resueltos" de la especificación trae su resolución; esa resolución gana sobre el texto de los diseños individuales. Resumen: H50 gana sobre N5 (PATCH estado ENVIADA → 400); un solo bloque de guardas en update_cotizacion en el orden (1) 400 actual CONFIRMADA/PENDIENTE_CONFIRMACION, (2) H50, (3) 409 PVEN vigente con un único mensaje, (4) N4 SC cancelada, (5) N7 retomar RECHAZADA con otra activa; motivo de cancelación del PVEN → 422 en todas las rutas; DEVUELTO_TOTAL: set() y PARCIALMENTE_ENTREGADO: {'ENTREGADO'} en el mapa de transiciones; H45 deja so.pxp_id y so.pxp_numero en None al anular; N7 limpia gate1_confirmed_at de la SC anterior cuando cambia cot.sc_id (y update_cotizacion ya no acepta sc_id libremente); recalculate_sale_order_state usa `if so.anticipo_pct_snapshot is not None`; GET /cotizaciones/{id} expone anticipo_requerido; fuente única de etiquetas (backend textos_actividad.ETIQUETAS_ESTADO; frontend estados-pedido.js); H3 usa esCotizacionActiva; los logs 'PVEN' se filtran también por entity_numero.
- **R13 — Migraciones.** Solo aditivas: columnas nulas o con server_default. Revisión nueva encadenada a la cabeza actual (fa6_023 → fa6_024 …; verificar con `alembic heads` antes). Se aplican con `C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe -m alembic upgrade head` desde C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-bloque1-dinero-flujo\backend contra la base del .env (erp_test, base de pruebas compartida). Permitido en este plan porque es aditivo y reversible; nunca downgrade ni DROP.
- **R14 — Decisiones del usuario que cierran las "decisiones pendientes" de cada diseño.** En cada ítem se copia la pregunta y la respuesta del usuario. Si el diseño asumía otra cosa, gana la respuesta del usuario (y su regla R1–R6 si la hay).

## Choques resueltos (vinculantes)

- H50 contra N5, lista blanca de estados de la COT (erp_ventas.py:946-947). N5 acepta BORRADOR/ENVIADA/RECHAZADA/VENCIDA y su prueba 3 espera ENVIADA→200. H50 rechaza ENVIADA con 400. Gana H50 (lo pide la verificación): se corrige la prueba 3 de N5 a ENVIADA→400 y se quita ENVIADA de su lista.
- N5, H46+U25, N4 y N7 meten cuatro guardas nuevas en el mismo punto de update_cotizacion (antes del loop, entre l.950 y l.971), y dos están duplicadas con mensajes distintos. PVEN vigente→409 dice en N5 'La cotización tiene el Pedido de Venta X vigente…' y en H46 'La cotización tiene el pedido X activo…'. Hace falta un solo bloque, que se evalúa solo si nuevo existe y nuevo≠cot.estado: (1) el 400 actual de CONFIRMADA/PENDIENTE_CONFIRMACION; (2) H50: 400 para ENVIADA o estado no manual; (3) 409 con _pven_vigente_de_cotizacion y un único mensaje; (4) N4: 409 si la SC está CANCELADA y nuevo≠RECHAZADA; (5) N7: 409 al retomar una RECHAZADA cuando hay otra COT activa.
- N4 contra N5 en update_solicitud (erp_ventas.py:478-492). N5 sigue aceptando CANCELADA por PATCH. N4 la prohíbe, porque la decisión del usuario es cancelar solo por /cancelar con revisión de documentos. Los mensajes no coinciden: la prueba 1 de N5 busca 'solo se puede volver a Borrador', texto que el mensaje de N4 no tiene. Se aplica la regla de N4 (solo BORRADOR) con un mensaje único y se ajusta la prueba de N5. ESTADOS_SC_MANUALES (solicitud-client.tsx:61-63) tiene que quedar solo con BORRADOR en el mismo cambio. Si no, la pastilla 'Cancelada' (solicitud/[id]/page.tsx:727) y la barra masiva empiezan a dar 400.
- N2 contra H46+U25 en update_pedido (erp_ventas.py:1477-1480). Los dos exigen un motivo de al menos 5 caracteres, pero N2 responde 422 y H46 400, y sus pruebas esperan cada una su código (N2 prueba 3: 422; H46 prueba 3: 400). Además, _TRANSICIONES_VEN_PATCH de N2 trata cualquier estado desconocido como operativo. Así, DEVUELTO_TOTAL y PARCIALMENTE_ENTREGADO (estados de fase4) se podrían cancelar o reabrir por PATCH, al revés de lo que pide H46 ('el bloqueo incluye DEVUELTO_TOTAL'). Se unifica en 422 y se agregan 'DEVUELTO_TOTAL': set() y 'PARCIALMENTE_ENTREGADO': {'ENTREGADO'} al mapa.
- N3 contra N4 (punto 8): los dos rediseñan la cancelación del Hub (page.tsx:346-355, 392-462, 1003-1006 y 1093) con funciones distintas: abrirCancelacion/confirmarCancelacion en N3, handleBulkDelete(ids) en N4. Se queda N3 (modal, hub-ventas.js, orden VEN→COT→SC, omitidos y banner). Del punto 8 de N4 solo se conserva mandar updated_by en el PATCH del VEN. El 'quitar CANCELADO del panel rápido (l.1217)' de N4 ya lo cubre N2.
- N2, N5, N10 y N4 chocan en el panel rápido (page.tsx:1212-1232) y en el cambio masivo (1085-1092). N2 ofrece 4 estados manuales, incluido EN_TRANSITO, más 'Facturado' solo desde ENTREGADO. N5 ofrece esos 4 y Facturado en el masivo. N10 dice 'solo EN_PROCESO y LISTO_ENTREGA' y que Entregado/Facturado van por 'Entregas/Facturación', pero no existe una pantalla de facturación. N4 aplica solo a filas VEN. Hay que fijar una sola lista: ESTADOS_VEN_MANUALES de N2 más Facturado, según la decisión pendiente de N2. N10 solo aporta etiquetas.
- Tablas de etiquetas de estado duplicadas. N2 crea ETIQUETA_ESTADO_VEN en hub-ventas.js y _ETIQUETA_ESTADO_VEN en erp_ventas.py. N10 crea ESTADOS_PEDIDO en estados-pedido.js. H7 crea ETIQUETAS_ESTADO['VEN'] en textos_actividad.py, sin EN_TRANSITO, así que el respaldo muestra 'En transito' sin tilde. H47 agrega PENDIENTE_PAGO 'Pend. Pago' a VEN_ESTADOS (venta-client.tsx:52-59), la tabla que N10 elimina. Las listas manuales tampoco coinciden: N10 ESTADOS_PEDIDO_MANUALES no tiene EN_TRANSITO y N2 ESTADOS_VEN_MANUALES sí. Fuente única: en el backend textos_actividad.ETIQUETAS_ESTADO (N2 la importa para validar) y en el frontend estados-pedido.js (lo importan hub-ventas.js, venta-client y venta/[id]).
- venta-client.tsx tiene cinco diseños encima. H42 cambia fCOP (l.49). H47 y N10 reescriben VEN_ESTADOS (52-59), las pestañas (98-109, 158-160), el filtro (199-211) y el KPI de activos (148) con reglas distintas: H47 calcula total−ENTREGADO−FACTURADO−CANCELADO y N10 usa ESTADOS_PEDIDO_CERRADOS, que incluye DEVUELTO_TOTAL. N1 y H47 cambian el mismo bloque 224-228 ('Anticipo verificado' frente a kpis.anticipo). H44 cambia el menú (337-339). N10 aplica filterEstado, que H47 dejó fuera porque es N9. Un solo dueño del archivo. Si se decide que DEVUELTO_TOTAL no suma, el resumen del servidor de H47 debe excluirlo también.
- H36+H43 contra H29 en update_solicitud. H36 recalcula el anticipo de las COT y registra un _log 'después del commit (560)'. H29 cambia ese commit por flush y pasa todos los _log a commit=False para que haya un solo commit, en l.620. Tal como está diseñado, H36 metería un commit intermedio y rompería la transacción única de H29. Su recálculo debe ir antes del commit final y usar _log(..., commit=False).
- Seis diseños tocan update_solicitud (erp_ventas.py:463-620) en las mismas líneas: N4, N5, N7, H36, H29 y H7. Comparten las validaciones (478-492), invalida_por_productos (538-546), el commit (560-561), los logs (565-603) y la revocación (604-619). Debe hacerlo una sola persona y en este orden: validaciones (N4) → N7 (invalida y gate1) → H36 (modalidad) → H29 (transacción) → H7 (textos).
- H3 contra N4, N7, N10 y H32 en qué es una 'COT vigente'. H3 (scConCot) excluye RECHAZADA y VENCIDA. N4 (decisión 1: Vencida cuenta como activa), N7 (_documentos_activos), N10 (esCotizacionActiva) y H32 (cotizacionesVigentes) solo excluyen RECHAZADA. Con una COT VENCIDA, el Hub mostraría 'Cotizar →' y la marcaría 'No resuelto', pero confirmar_solicitud respondería 400 'ya tiene la cotización activa'. H3 debe usar esCotizacionActiva.
- H27+H39 contra H50: H27 afirma que test_cotizacion_canal_envio.py sigue pasando, pero esa prueba hace PATCH {estado:'ENVIADA', canal_envio} (l.12-15), que con H50 da 400.
- H7+H41 contra N1 en erp_ventas_fase4.py:2816-2834 y 3001. H7 cambia la nota de l.2832, y ese bloque lo borra N1. La prueba 5 de H7 ancla la descripción con '\. Líneas: 1\.$', pero N1 agrega ' Anticipo verificado: $X.' cuando pagado>0. H7 se aplica después de N1, y su prueba 5 usa una COT con anticipo 0 (ACT009).
- Varias consultas a lo mismo en get_cotizacion (886-901) y get_pedido (1385-1400). En get_cotizacion, H35+H48 lee CustomerRequest.notas y H36 lee modalidad_pago de la misma SC. En get_pedido, H35 lee SC y COT, H4 lee cotizador y advisor_name, N1 agrega pagos y N10 cambia el filtro de actividades. Conviene una sola consulta por documento relacionado, en un solo cambio.
- N1 y H36 contra pruebas nuevas de otros diseños. La modalidad por defecto es 'Contado' (erp_documents.py:66, erp_ventas.py:379, solicitud-client.tsx:832 y 1011), es decir, 100% de anticipo. La prueba 2 de H35+H48 (SC 'SC-NOTA002' + COT total 2000 → POST /confirmar) y las pruebas 1, 2 y 4 de H46+U25 (COT con SC y total>0, o con anticipo sin definir) convierten sin verificacion_anticipo y van a recibir 422. Deben mandar verificacion_anticipo o usar una SC 'Credito 30 dias'.
- H2 contra H44+N6: la prueba 3 de H2 hace POST /crear-pxp {} sobre un SaleOrder creado por ORM, con saldo_cop en 0 por defecto. Con H44 responde 409 'no tiene saldo pendiente'. Hay que crear el pedido con saldo_cop>0.
- H45 contra N2/H46: la prueba 2 de H45 (test_cancelar_no_toca_una_pxp_pagada) cancela el pedido por PATCH sin cancellation_reason. Con el motivo obligatorio da 422 o 400.
- H45 contra H44+N6 en el frontend. H44 oculta 'Crear PXP' en la lista con !p.pxp_id (venta-client.tsx:337-339). H45 anula la PXP sin limpiar so.pxp_id ni so.pxp_numero, y el backend de H44 sí permite otra PXP si la anterior está CANCELADA. La lista y el detalle (que mira pedido.pxps) quedan inconsistentes. H45 debe dejar so.pxp_id y so.pxp_numero en None al anular.
- N7 reabre el ataque de la Ronda 6 contra Gate 1 (erp_ventas.py:707-712 y 725). Deja de consumir gate1_confirmed_at, y update_cotizacion sigue aceptando 'sc_id' en allowed (l.967). La secuencia es: COT confirmada → SC CONFIRMADA por sincronización → PATCH COT {sc_id:null} → SC CONFIRMADA, con la marca puesta y sin COT activa → POST /solicitudes/{id}/confirmar crea otra COT sin que el cliente reconfirme. La prueba actual (test_confirmacion_solicitud.py:242) no lo detecta porque arranca con gate1=None. Hay que limpiar la marca de la SC anterior cuando cambia cot.sc_id (o cuando la COT llega a CONFIRMADA) y agregar la prueba con la marca puesta.
- N10 contra las pruebas que afirman la lista exacta de actividades. get_pedido leería los ActivityLog 'PVEN' por entity_id, pero los MERCANCIA_DISPONIBLE viejos guardan el id de la LÍNEA con entity_numero vacío (erp_compras.py:2352-2359). Mientras no se corra el UPDATE de datos, un PVEN nuevo cuyo id coincida con el de una línea vieja muestra un renglón ajeno. Se filtran los 'PVEN' también por entity_numero == v.numero.
- H44 contra N9 (sin diseño) y H47: los tres tocan el menú de fila de venta-client.tsx:333-345. H44 cambia la condición de 'Crear PXP' y N9 pide renombrar o ejecutar esas opciones.
- Archivos de frontend con muchos diseños a la vez:
  - cotizacion/[id]/page.tsx: H42+H36 en TOTALES 648-666; H46 en 151-153, 241, 259, 387-418, 498-506, 691-701 y 890; N1 en 209-235 y 886; H27 en 165-201 y 877-899; N7 en 300-313, 428-434 y 725; H50+N7 en 711-730.
  - venta/[id]/page.tsx: H42, N1, H44, H45, H46, N10, H35 y H7, además de hunks sin commitear de safe-return-to.
  - solicitud/[id]/page.tsx: N4, N7, H27, H29 y N10, también con hunks sin commitear.
  - page.tsx (Hub): 14 ítems.
  Cada archivo necesita un solo dueño.
- package.json:10: ocho diseños agregan un script al mismo 'test' (test_pesos, test_listas_ventas, test_hub_ventas, test_whatsapp, test_estados_pedido, test_aviso_correo, test_session, test_tema_claro), y ya hay un hunk sin commitear de otra sesión (test_safe_return_to). Conviene consolidarlo en un solo cambio.
- N8 contra la decisión 3 de H36 (TRM): si la TRM pasa a admin_config ('trm_cop'), la lista blanca _CONFIG_LECTURA_GENERAL de N8 tiene que incluirla. Si no, el asesor no la puede leer en la calculadora.

## Huecos y su resolución

- **Resolución: R7 (T0).** El runner de ROLLBACK (scratchpad/run_tests_rollback.py:83-93) solo entrega app_client, db, admin_token y user_admin; cualquier otro fixture se busca en el propio módulo. Con lo que hay, fallan con KeyError:
  - vendedor_token/user_vendedor: N1 test_asesor_puede_verificar, H44 test_el_asesor_puede_crear_la_pxp, N8 pruebas 4 y 5.
  - sku: N2 prueba 6.
  - monkeypatch: todas las de H27+H39 y la 3 de H29.
  Además, la prueba 5 de H23 inicia sesión con TEST_PASSWORD, pero en el runner user_admin es admin@nebulae-qa.com, que tiene otra contraseña. Antes de correrlas hay que ampliar el runner (pytest.MonkeyPatch.context(), y user_vendedor, vendedor_token y sku de conftest) o definir esos fixtures en cada módulo.
- **Resolución: R7 (T0) y T6.** Las pruebas 1 y 2 de H29 cuentan los eventos 'checkout' y 'commit' en tests.conftest.test_engine. En el runner de ROLLBACK la API usa dbmod.engine, con una sola conexión y savepoints, así que darían 0 y 0 y fallarían. Además, importar tests.conftest ejecuta ese módulo. Conviene contar con event.listen(sqlalchemy.engine.Engine, 'before_cursor_execute') y con un contador sobre Session.commit, limitados a la ventana del PATCH.
- **Resolución: T3 (R12).** recalculate_sale_order_state (erp_ventas_fase4.py:240) usa `so.anticipo_pct_snapshot or 60.00`. Con H36 y N1, una venta a crédito guarda 0, que es falsy, y vuelve a exigir 60% en cuanto se registre un pago o una recepción. Hay que cambiarlo por `if so.anticipo_pct_snapshot is not None`. H36 afirma que esto ya queda resuelto, pero solo es cierto para Contado.
- **Resolución: T3/T10 (R12).** N1 en el frontend abre el modal de verificación solo si cotizacion.anticipo_cop > 0, y usa ese mismo valor guardado como mínimo. El backend, en cambio, recalcula el requerido según la modalidad. Una COT vieja con anticipo 0 de una SC de Contado o 60/40 recibe un 422 en un alert y no hay manera de abrir el modal. Una COT con anticipo viejo menor que el requerido también falla. GET /cotizaciones/{id} debe exponer 'anticipo_requerido' (H36 ya consulta la SC) y el frontend debe usar ese valor, tanto para decidir si abre el modal como para fijar el mínimo.
- **Resolución: R2: el usuario eligió Contado = 100%.** La modalidad por defecto es 'Contado' (modelo erp_documents.py:66, create_solicitud erp_ventas.py:379 y formulario solicitud-client.tsx:832 y 1011). Con H36 eso significa 100% de anticipo, así que casi todas las COT actuales y futuras van a exigir que se verifique el pago total antes del pedido. Ninguna decisión pendiente lo plantea; hay que confirmarlo con el usuario, o cambiar el valor por defecto de la SC a '60/40 (60% anticipo - 40% pendiente)'.
- **Resolución: T3.** Una COT sin SC con datos viejos donde anticipo_cop > total_cop da un pct mayor a 100 en pct_anticipo_cotizacion de H36. Entonces N1 exige un requerido mayor que el total y el pedido nunca se puede crear ('supera el total'). Hay que limitar el pct con min(pct, 100).
- **Resolución: T3.** N1 necesita imports nuevos en erp_ventas.py: SaleOrderPayment (models/fase4.py:17) para get_pedido.pagos y pydantic.ValidationError para el try de confirmar_cotizacion. Ningún diseño los menciona.
- **Resolución: R8.** N9 (verificado como confirmado) no tiene diseño. H47 quita 'Nuevo Pedido' y N10 aplica filterEstado, pero nadie se encarga del toggle kanban, del setCurrentPage(1) al cambiar pestaña, filtro o búsqueda, ni del menú de fila de venta-client.tsx.
- **Resolución: R9 (fuera del bloque).** update_pxp (erp_ventas.py:1573-1591) marca una PXP como PAGADA sin registrar un SaleOrderPayment ni bajar saldo_cop. H44 calcula pagado = total − saldo, y además bloquea crear otra PXP mientras exista una PAGADA aunque el saldo siga > 0. H45 solo deja el aviso 'PXP_REVISAR'. El ciclo de la PXP sigue desconectado del libro de pagos; conviene dejarlo anotado como pendiente.
- **Resolución: R10 (T4).** N4 y N5 siguen permitiendo PATCH {estado:'BORRADOR'} sobre una SC con COT o PVEN activos, desde la pastilla de solicitud/[id]:727 y al soltarla en 'No Resuelto' del Hub (page.tsx:403). Eso reinicia la SC (transiciona revoca el token y limpia gate1) con la COT viva, lo que contradice el invariante de N7 de que la SC sigue activa. Conviene bloquearlo cuando _documentos_activos_de_solicitud no esté vacío.
- **Resolución: R6 (T3/T10).** Si se cancela un PVEN y la COT se convierte de nuevo (H46+N1), N1 pide una nueva verificación del anticipo. El pago ya verificado queda en el pedido cancelado, y el PATCH de cancelación no calcula el saldo a favor (eso solo lo hace cancel_sale_order, fase4:1255-1271). Hace falta una regla para no registrar dos veces el mismo dinero, por ejemplo que el modal muestre 'saldo a favor del PVEN cancelado X'.
- **Resolución: R11 (T1).** H42 no redondea en el servidor update_pedido (1481-1488): la propagación de la re-cotización (cotizacion/[id]/page.tsx:265-274) manda total_cop, subtotal_cop y saldo_cop sin pasar por redondear_peso.
- **Resolución: T14 (orden fijo).** Los datos existentes deben corregirse en un orden fijo, y ningún diseño lo dice:
  - Primero N1 (anular o completar los pagos CONVERSION_COTIZACION), porque cambia saldo_cop.
  - Después H44: los montos de PXP se recalculan a partir del saldo ya corregido, no solo se intercambian.
  - Luego H45.
  - H46 reabre las COT antes del recálculo de anticipo de H36, que filtra COT abiertas.
  - La corrección de logs de N10 va antes de desplegar su lectura de 'PVEN'.
- **Resolución: T7: solo con el runner de ROLLBACK.** La prueba 1 de la Papelera (N4) y el GET /papelera borran de verdad las SC canceladas hace más de 30 días sin referencias. Esa prueba solo puede correr con el runner de ROLLBACK.
- **Resolución: Restricción global: el frontend no tiene vitest; pruebas con node tests/*.mjs.** Nota sobre la instrucción: el frontend no tiene vitest. 'npm test' corre scripts node (package.json:10) y los diseños ya lo hacen así.

## Pruebas existentes que se rompen (ajustarlas en la tarea que las rompe)

- test_fase5_integracion_erp.py::test_03 (l.315-325), test_04 (l.365-380), test_05 (primer POST, l.427-432) y test_17 (l.808-812). Con N1, una COT con anticipo>0 que se convierte sin verificacion_anticipo recibe 422. Montos a poner: 810000, 270000, 270000 y 300000.
- test_sincronizacion_estado_solicitud_cotizacion.py::test_enviar_cotizacion_deja_solicitud_en_espera_confirmacion (l.58-62). Con H50, PATCH ENVIADA da 400 y la SC no pasa a EN_ESPERA_CONFIRMACION. Hay que usar POST /enviar-confirmacion con precio puesto por DB.
- test_sincronizacion_estado_solicitud_cotizacion.py::test_rechazar_cotizacion_deja_solicitud_rechazada (l.101-105). Con N7, el helper pone gate1_confirmed_at, así que la SC vuelve a CONFIRMADA y no a RECHAZADA. Se renombra y se afirma CONFIRMADA.
- test_crm_lead_movimiento_automatico.py::test_enviar_cotizacion_mueve_lead_a_quotation (l.98-105). Con H50, PATCH ENVIADA da 400 y el lead no se mueve.
- test_crm_lead_movimiento_automatico.py::test_rechazar_cotizacion_mueve_lead_a_cancelled (l.132-139). Con N7, rechazar ya no lleva el lead a CANCELLED.
- test_crm_lead_movimiento_automatico.py::test_las_5_etapas_estandar_se_crean_si_no_existen (l.155-161). Con H50, el PATCH ENVIADA da 400, así que mover_lead y _asegurar_etapas_estandar (crm.py:1242) no corren. Hoy pasa solo porque erp_test ya tiene las etapas; en una base limpia falla.
- test_confirmacion_solicitud.py::test_pill_cancelar_restaurar_reenviar_revoca_token_viejo (l.417-420). Con N4, PATCH CANCELADA da 400. Se usa POST /cancelar.
- test_confirmacion_solicitud.py::test_confirmar_solicitud_consume_gate1_confirmed_at_al_crear_cotizacion (l.449-478). Con N7, la marca ya no se consume (l.478 afirma None).
- test_actividad_cambios_documentos.py::test_cambiar_solo_el_estado_no_agrega_un_renglon_de_edicion (l.181-186). Con H50, PATCH {estado:'ENVIADA'} da 400. Ningún diseño la menciona; se cambia a RECHAZADA o VENCIDA.
- test_cotizacion_canal_envio.py::test_actualizar_cotizacion_guarda_canal_envio (l.8-16). Con H50 da 400 porque manda estado ENVIADA. H27 dice equivocadamente que sigue pasando. Se manda solo canal_envio.
- test_actividad_cambios_documentos.py::test_cancelar_un_pedido_registra_el_estado_y_el_motivo (l.347-357) y test_el_motivo_reemplaza_el_titulo… (l.333-344). Riesgo con N10: si get_pedido lee los logs 'PVEN' solo por entity_id, los MERCANCIA_DISPONIBLE viejos con id de línea pueden colarse en la lista exacta. Se evita filtrando por entity_numero.
- Pruebas nuevas de los propios diseños que fallan por otro diseño:
  - N5 prueba 3 (ENVIADA→200; choca con H50).
  - N2 prueba 3 (422) frente a H46 prueba 3 (400).
  - H35+H48 prueba 2 y H46+U25 pruebas 1, 2 y 4 (convierten sin verificación; chocan con N1+H36).
  - H2 prueba 3 (crear-pxp con saldo 0; choca con H44).
  - H45 prueba 2 (cancela sin motivo; choca con N2/H46).
  - H29 pruebas 1 y 2 (contadores en test_engine; bajo el runner de ROLLBACK dan 0).
  - H23 prueba 5 (TEST_PASSWORD; bajo el runner).
  - Las que usan vendedor_token, sku o monkeypatch (bajo el runner, sin ampliarlo).

## Diseño por ítem

### H47 — Lista de pedidos sin cancelados

**Para el usuario:** En la lista de Pedidos de Venta, el monto total y el saldo por cobrar ya no suman los pedidos cancelados, y cubren todos los pedidos aunque haya más de 200. El subtítulo y los textos quedan en lenguaje normal, con los estados por su nombre, y desaparece el botón 'Nuevo Pedido', que no hacía nada.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Un pedido devuelto por completo, ¿también deja de sumar? → **Sí, tampoco suma**

**Cambios (diseño):**

```text
BACKEND C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\app\api\v1\erp_ventas.py
- l.8: `from sqlalchemy import text, func, select, case`.
- list_pedidos (l.1322-1324): después de `total = q.count()`, y antes de order_by/offset/limit, calcular un resumen sobre TODO el filtro (no solo sobre la página):
```python
vigente = SaleOrder.estado != "CANCELADO"
suma = lambda col: func.coalesce(func.sum(case((vigente, col), else_=0)), 0)
monto, saldo, anticipo = q.with_entities(suma(SaleOrder.total_cop), suma(SaleOrder.saldo_cop), suma(SaleOrder.anticipo_cop)).one()
por_estado = dict(q.with_entities(SaleOrder.estado, func.count(SaleOrder.id)).group_by(SaleOrder.estado).all())
```
La respuesta pasa a ser `{"status","total","resumen": {"monto_cop": float(monto), "saldo_cop": float(saldo), "anticipo_cop": float(anticipo), "por_estado": por_estado}, "data"}`. No se toca cancel_sale_order: el saldo_cop de un pedido cancelado sigue guardado y simplemente no se suma.
FRONTEND
- NUEVO C:\Users\jmqui\Nebulae_ERP_Work\Mirror\frontend\src\lib\listas-ventas.js (JS puro como busqueda.js y pricing.js, compartido con H32, N8 y COT-LISTA): `resumenPedidos(pedidos)` devuelve `{total, monto_cop, saldo_cop, anticipo_cop, por_estado}`. por_estado cuenta todos los pedidos; el dinero salta los que están en 'CANCELADO'. Las líneas null o que no son objeto se ignoran.
- C:\...\frontend\src\app\dashboard\ventas\venta\venta-client.tsx:
  · l.6: quitar `Plus` del import de lucide (solo lo usaba el botón).
  · l.52-59 VEN_ESTADOS: agregar `PENDIENTE_PAGO: {bg:'bg-amber-100',text:'text-amber-700',border:'border-amber-200',label:'Pend. Pago'}`. La conversión COT→PVEN crea ese estado (erp_ventas_fase4.py:2983) y hoy se pinta en crudo.
  · l.63 y l.77-82: nuevo estado `resumenServidor`. En fetchPedidos: `const d=await apiFetch('/ventas/pedidos?limit=200'); setPedidos(...); setResumenServidor(d?.resumen?{...d.resumen,total:d.total??0}:null);`.
  · l.111-117 kpis: `const r=resumenServidor??resumenPedidos(pedidos); const pe=r.por_estado||{};` y devolver `{total:r.total, monto:r.monto_cop, saldo:r.saldo_cop, anticipo:r.anticipo_cop, pCompra:pe.PENDIENTE_COMPRA||0, cancelados:pe.CANCELADO||0, activos:r.total-(pe.ENTREGADO||0)-(pe.FACTURADO||0)-(pe.CANCELADO||0)}` (deps [pedidos,resumenServidor]).
  · l.133 subtitle: 'Pedidos confirmados por tus clientes'.
  · l.139: borrar `<Button color="indigo" icon={Plus}>Nuevo Pedido</Button>`. El div queda solo con 'Actualizar'.
  · l.147-151 tarjetas (textos en 'comportamiento').
  · l.199: `VEN_ESTADOS[filterEstado]?.label ?? filterEstado`. l.206: agregar 'PENDIENTE_PAGO' a la lista. l.209: `{e ? (VEN_ESTADOS[e]?.label ?? e) : 'Todos los estados'}`.
  · l.224-228 Análisis: Monto Total = kpis.monto, Anticipo = kpis.anticipo, Saldo Pendiente = kpis.saldo.
  · l.256 Top 5 clientes: reducir sobre `pedidos.filter(p=>p.estado!=='CANCELADO')`.
  · l.283: encabezado 'Pedido / Origen'.
  · l.301 EmptyState: agregar hint='Los pedidos se crean al convertir una cotización confirmada por el cliente.'
  · l.316: si p.estado==='CANCELADO', pintar '—' en gris en vez del saldo en rojo.
```

**Comportamiento esperado:**

```text
- 'Monto vendido' (antes 'Total Monto') = suma de total_cop de los pedidos que cumplen el filtro y cuyo estado no es CANCELADO. Hint: 'Sin pedidos cancelados'.
- 'Saldo Pendiente' = suma de saldo_cop de los pedidos no cancelados. Hint: 'Por cobrar'.
- 'Total Pedidos' cuenta todos, incluidos los cancelados. Hint: `${activos} activos` + (cancelados>0 ? ` · ${cancelados} cancelados` : '') + (total>pedidos.length ? ` · se ven los ${pedidos.length} más recientes` : '').
- 'Pendiente Compra' = por_estado.PENDIENTE_COMPRA. Hint: 'Falta comprar'.
- Las cifras salen del servidor sobre todos los pedidos, sin el tope de 200. Si la respuesta no trae 'resumen', se calculan en el navegador con la misma regla.
- No existe el botón 'Nuevo Pedido': un pedido solo nace de una cotización confirmada.
- El filtro y las etiquetas muestran nombres legibles ('Pend. Compra', 'Pend. Pago', 'Cancelado'…), nunca PENDIENTE_COMPRA.
```

**Pruebas (diseño):**

```text
Backend, nuevo C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\tests\test_listas_ventas_totales.py (estilo de test_busqueda_productos.py: sufijo uuid, `auth(token)`, solo `db.add` uno por uno para que el fixture limpie; numero ≤ 20 caracteres):
1) test_resumen_de_pedidos_no_suma_los_cancelados: con cliente=f'Cliente Totales {suf}' crear SaleOrder PVEN-TA{suf} PENDIENTE_COMPRA total 1.000.000 / anticipo 600.000 / saldo 400.000; PVEN-TB{suf} ENTREGADO 500.000/500.000/0; PVEN-TC{suf} CANCELADO 2.000.000/0/2.000.000. GET /api/v1/ventas/pedidos?search=cliente&limit=200 (admin). Afirmar body['total']==3 y body['resumen']=={'monto_cop':1500000,'saldo_cop':400000,'anticipo_cop':1100000,'por_estado':{'PENDIENTE_COMPRA':1,'ENTREGADO':1,'CANCELADO':1}}.
2) test_resumen_de_pedidos_cubre_todos_no_solo_la_pagina: mismos datos con limit=1. Afirmar len(data)==1 y resumen.monto_cop==1500000. Con search=f'inexistente-{suf}' afirmar resumen=={'monto_cop':0,'saldo_cop':0,'anticipo_cop':0,'por_estado':{}}.
Frontend: los tests de frontend no son vitest; son scripts node en frontend/tests/*.mjs que corre `npm test`. Nuevo frontend/tests/test_listas_ventas.mjs, que se agrega al script "test" de package.json (`&& node tests/test_listas_ventas.mjs`). TEST resumenPedidos: con [{estado:'PENDIENTE_COMPRA',total_cop:'1000000.00',saldo_cop:400000,anticipo_cop:600000},{estado:'CANCELADO',total_cop:2000000,saldo_cop:2000000},null] afirmar monto 1000000, saldo 400000, por_estado {PENDIENTE_COMPRA:1,CANCELADO:1}; [] y undefined dan ceros. Además `npx tsc --noEmit` y `npm run lint` en frontend. Manual: cancelar un pedido de prueba y comprobar que 'Monto vendido' y 'Saldo Pendiente' bajan, y que 'Total Pedidos' dice '· 1 cancelados'. Correr pytest SOLO con el runner de ROLLBACK, nunca la suite completa sobre erp_test.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No aplica. Se calcula al vuelo. Los pedidos ya cancelados conservan su saldo_cop guardado y solo se dejan de sumar; no hay que migrar nada.
```

**Riesgos:**

```text
- N9 toca las mismas líneas de venta-client.tsx (102-109 filterEstado sin aplicar, 139 botón, 170-181 kanban, 333-345 menú de fila). Conviene implementarlos juntos o coordinar el merge. Este diseño no aplica filterEstado.
- N1 cambia el sentido de anticipo_cop (anticipo requerido frente a cobrado). La etiqueta 'Anticipo Cobrado' de Análisis (l.227) debe seguir lo que defina N1.
- fCOP (l.49) puede mostrar decimales en las sumas. Debe aplicar la regla de peso entero del grupo de precios.
- Los conteos de las pestañas siguen saliendo de los 200 cargados. Con más de 200 pedidos, la pestaña 'Todos' no coincide con la tarjeta, y el hint lo aclara.
- La forma de GET /ventas/pedidos solo gana la clave 'resumen'. El Hub y los demás que leen d.data no cambian. /ecommerce/pedidos es otro endpoint.
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `frontend/src/app/dashboard/ventas/venta/venta-client.tsx`, `frontend/src/lib/listas-ventas.js`, `frontend/tests/test_listas_ventas.mjs`, `frontend/package.json`, `backend/tests/test_listas_ventas_totales.py`


### H32 — Contadores reales en Solicitudes

**Para el usuario:** En la lista de Solicitudes, los contadores dicen cuántas solicitudes generaron cotización de verdad, en vez de suponer que toda solicitud 'Confirmada' ya tiene cotización. La tarjeta de Confirmadas avisa cuántas esperan que se les haga la cotización, y cada fila muestra si tiene una cotización vinculada o rechazada.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- ¿La tasa de conversión se calcula solo con solicitudes de tipo "Cotización de Producto"? (las de soporte o devolución nunca se cotizan) → **Sí, solo esas**

**Cambios (diseño):**

```text
BACKEND erp_ventas.py, list_solicitudes (l.333-335): después de traer `items`, una sola consulta extra:
```python
ids = [s.id for s in items]
cots_por_sc = {}
if ids:
    for c_id, c_num, c_est, c_sc in (db.query(SalesQuotation.id, SalesQuotation.numero, SalesQuotation.estado, SalesQuotation.sc_id)
            .filter(SalesQuotation.sc_id.in_(ids)).order_by(SalesQuotation.id.asc())):
        cots_por_sc.setdefault(c_sc, []).append({"id": c_id, "numero": c_num, "estado": c_est})
return {"status": "success", "total": total, "data": [{**_sc_dict(s), "cotizaciones": cots_por_sc.get(s.id, [])} for s in items]}
```
No se toca _sc_dict. El nombre 'cotizaciones' es el mismo que ya usa el detalle (l.451), pero aquí va en versión ligera (id, numero, estado). Con eso revive el código muerto de solicitud-client.tsx:1330.
FRONTEND
- listas-ventas.js: `generoCotizacion(sc)` (≥1 cotización en cualquier estado) y `cotizacionesVigentes(sc)` (las que no están RECHAZADA).
- solicitud-client.tsx:
  · nuevo estado `totalServidor`. En load (l.861): `const lista=Array.isArray(sc)?sc:(sc?.data??[]); setSolicitudes(lista); setTotalServidor(typeof sc?.total==='number'?sc.total:null);`.
  · l.1029: mantener totalConf (estado CONFIRMADA) y agregar `const conCot=solicitudes.filter(generoCotizacion).length; const esperanCot=solicitudes.filter(s=>s.estado==='CONFIRMADA'&&cotizacionesVigentes(s).length===0).length;`.
  · l.1133: title 'Clic para ver Solicitudes Confirmadas'. l.1142: `{conCot} con COT`.
  · l.1211: label 'Confirmadas'; hint en 'comportamiento'.
  · l.1213: hint en 'comportamiento'.
  · l.1330: si cotizacionesVigentes(sc).length>0, 'COT vinculada' (ámbar, como hoy); si no y generoCotizacion(sc), 'COT rechazada' (text-rose-500).
  · l.1411-1412: Tasa = conCot/solicitudes.length; hint `${conCot} de ${solicitudes.length} generaron cotización`.
  · l.1628: `confCount = matching.filter(generoCotizacion).length`.
  · l.1694-1697: primero `if(s.estado==='CANCELADA') canc++`, luego `else if(generoCotizacion(s)) conf++`, si no `act++`.
  · l.753 y l.783 (asistente IA): conf = solicitudes.filter(generoCotizacion).length; texto '(${conf} solicitudes que generaron cotización)'.
```

**Comportamiento esperado:**

```text
- 'Generó cotización' = la SC tiene al menos una COT con su sc_id, en cualquier estado (una COT rechazada sí se generó). Con esto se calculan la tasa de conversión, '% a COT' por tipo, la columna 'COT' del ranking de clientes y el paso 2 del pipeline.
- 'Espera cotización' = estado CONFIRMADA y ninguna COT que no esté RECHAZADA. Es el caso de Gate 1: el cliente confirmó y falta crear la COT.
- Tarjeta 'Confirmadas': valor = número de SC en CONFIRMADA (igual que la pestaña). Hint = totalConf===0 ? 'Sin confirmadas' : esperanCot>0 ? `${esperanCot} esperan cotización` : 'Todas con cotización'.
- Tarjeta 'Total': valor = solicitudes.length. Hint = `${conCot} generaron cotización` + (totalServidor>solicitudes.length ? ` · se ven las ${solicitudes.length} más recientes de ${totalServidor}` : '').
- Fila: 'COT vinculada' si hay COT en juego; 'COT rechazada' si todas sus COT fueron rechazadas.
- La pestaña 'Confirmadas' y el donut de estados siguen siendo por estado. No cambian.
```

**Pruebas (diseño):**

```text
Backend, en test_listas_ventas_totales.py:
3) test_lista_de_solicitudes_trae_sus_cotizaciones(app_client, db, admin_token): cliente=f'Cliente H32 {suf}'. Crear tres CustomerRequest con un `db.add` cada una (el fixture solo rastrea add, no add_all): SC-HA{suf} CONFIRMADA con gate1_confirmed_at=utcnow y sin COT; SC-HB{suf} COTIZADA con SalesQuotation COT-HB{suf} BORRADOR (sc_id, sc_numero); SC-HC{suf} ASIGNADA con COT-HC{suf} RECHAZADA. GET /api/v1/ventas/solicitudes?search=cliente&limit=200. Con `por_numero={d['numero']:d['cotizaciones'] for d in data}` afirmar: por_numero[SC-HA]==[]; por_numero[SC-HB]==[{'id':cot_b.id,'numero':cot_b.numero,'estado':'BORRADOR'}]; por_numero[SC-HC][0]['estado']=='RECHAZADA'. Además, cada elemento tiene exactamente las claves {'id','numero','estado'}.
Frontend, test_listas_ventas.mjs: generoCotizacion({cotizaciones:[{estado:'RECHAZADA'}]})===true; generoCotizacion({})===false; cotizacionesVigentes({cotizaciones:[{estado:'RECHAZADA'},{estado:'BORRADOR',numero:'COT-1'}]}) devuelve solo COT-1; con cotizaciones:null no se rompe. Luego tsc --noEmit. Manual: con una SC confirmada por enlace y sin COT, la tarjeta dice '1 esperan cotización' y el paso 2 no la cuenta como 'con COT'.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No aplica. Se calcula al vuelo desde sales_quotations.sc_id.
```

**Riesgos:**

```text
- El mismo nombre 'cotizaciones' tiene forma ligera en la lista y completa en el detalle. El panel rápido del Hub (page.tsx:377) mezcla el detalle encima de la fila, así que no choca. El código nuevo no debe esperar total_cop en la lista.
- solicitud-client.tsx también lo editan otros grupos (creación ?new=1 en l.879-882 y l.1003, bloqueo de cancelación en l.723-741 y l.891-901). Son cambios pequeños pero en el mismo archivo: coordinar el merge.
- Con la decisión de que una COT rechazada deja la SC activa, 'espera cotización' ya ignora las rechazadas, así que queda alineado.
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/lib/listas-ventas.js`, `frontend/tests/test_listas_ventas.mjs`, `backend/tests/test_listas_ventas_totales.py`


### N8 — Días de alerta de Configuración para todos

**Para el usuario:** Las listas de Solicitudes y Cotizaciones respetan los días de alerta guardados en Configuración, también para los asesores; hoy siempre usan 2 días. Los asesores pueden ver esos valores, pero solo un administrador puede cambiarlos.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Cambios (diseño):**

```text
BACKEND erp_ventas.py:
- l.19-22: importar también `normalize_role` desde app.api.dependencies.
- Antes de get_config (l.1865), una lista blanca de claves no sensibles:
```python
_CONFIG_LECTURA_GENERAL = {"alerta_sc_dias", "alerta_cot_dias", "alerta_ven_dias",
    "alerta_soporte_alta_horas", "alerta_soporte_media_horas", "alerta_soporte_baja_horas",
    "auto_lead_crm", "auto_chatter_ia", "notif_whatsapp"}
```
- get_config (l.1865-1872): `require_roles(*ALL_ERP_ROLES)`. Armar `data={r[0]:{...} for r in rows}` y, si `normalize_role(user.role) != "ADMIN"`, dejar `data={k:v for k,v in data.items() if k in _CONFIG_LECTURA_GENERAL}`. Se mantiene el except que devuelve {}.
- update_config (l.1875-1876) no cambia: sigue siendo solo ROLE_ADMIN.
FRONTEND
- listas-ventas.js: `diasAlerta(cfg, clave, porDefecto=2)`. Toma `fuente = cfg.data` si es un objeto, si no `cfg`; luego `crudo=fuente?.[clave]` y `n=Number(typeof crudo==='object'&&crudo ? crudo.value : crudo)`. Devuelve n si es finito y mayor que 0; si no, porDefecto. Sirve para la respuesta cruda {status,data}, para el dict interno y para {clave:'3'}, que es lo que guarda el Hub tras onSave.
- solicitud-client.tsx:862: `setAlertDias(diasAlerta(cfg,'alerta_sc_dias'));`.
- cotizacion-client.tsx:493: `setAlertDias(diasAlerta(cfg,'alerta_cot_dias'));`.
- Hub, page.tsx:283-285: usar `diasAlerta(alertDias,'alerta_sc_dias' | 'alerta_cot_dias' | 'alerta_ven_dias')`. El resultado es el mismo; se hace para tener un solo camino de lectura.
- Hub, ConfigPanel (page.tsx:150-218): importar getUsuarioActual de './flujo' (l.18 ya importa de ahí). `const soloLectura = getUsuarioActual().role.trim().toLowerCase() !== 'admin'`. Si soloLectura: inputs (l.200) y botones Toggle (l.171) con `disabled`, y el footer (l.185-191) muestra `<p className="text-xs text-slate-500 text-center">Solo un administrador puede cambiar estos valores.</p>` en lugar del botón. Además, el `catch{}` de save (l.164) debe mostrar el error en vez de tragárselo.
```

**Comportamiento esperado:**

```text
- GET /ventas/config: ADMIN recibe todas las claves, igual que hoy. ASESOR, COMPRAS, BODEGA, FINANZAS y CONSULTA reciben 200 solo con las claves de _CONFIG_LECTURA_GENERAL. Cualquier clave nueva queda solo para ADMIN mientras no se agregue a la lista.
- PATCH /ventas/config: 403 para quien no sea ADMIN, como hoy.
- Listas de SC y COT: el banner 'ATENCION REQUERIDA (Alerta de N dias)', el marcado 'Sin atender' y los conteos usan el valor configurado. Si no hay valor válido (falta, es 0 o no es número), usan 2.
- Panel 'Configuración' del Hub para quien no es administrador: muestra los valores reales sin poder cambiarlos, con el texto 'Solo un administrador puede cambiar estos valores.'
```

**Pruebas (diseño):**

```text
Backend, en test_listas_ventas_totales.py (vendedor_token = rol 'Vendedor' → ASESOR):
4) test_un_asesor_lee_los_dias_de_alerta_pero_no_otras_claves(app_client, db, admin_token, vendedor_token): admin_config NO se trunca y es la base compartida erp_test. Guardar `previo` (SELECT value WHERE key='alerta_sc_dias'). En try: upsert alerta_sc_dias='5' y clave_interna_test_n8='no-para-asesores', commit. GET /api/v1/ventas/config con vendedor → 200, data['alerta_sc_dias']['value']=='5' y 'clave_interna_test_n8' not in data. GET con admin → data['clave_interna_test_n8']['value']=='no-para-asesores'. En finally: DELETE clave_interna_test_n8 y restaurar alerta_sc_dias (DELETE si previo era None, si no upsert previo), commit.
5) test_un_asesor_no_puede_cambiar_la_config: PATCH {'alerta_sc_dias':'9'} con vendedor → 403. Restaurar previo en finally, por si una regresión llegara a escribir.
- test_erp_ventas_config_sql_safety.py (admin) debe seguir verde sin cambios.
Frontend, test_listas_ventas.mjs: diasAlerta({status:'success',data:{alerta_sc_dias:{value:'5'}}},'alerta_sc_dias')===5; diasAlerta({alerta_cot_dias:{value:'4'}},'alerta_cot_dias')===4; diasAlerta({alerta_sc_dias:'3'},'alerta_sc_dias')===3; y {}, null, value 'abc' y value '0' devuelven 2. Luego tsc --noEmit. Manual: con un usuario asesor, configurar 5 días como admin, abrir /dashboard/ventas/solicitud y comprobar que el banner dice 'Alerta de 5 dias'.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No aplica.
```

**Riesgos:**

```text
- Se abre la lectura de un almacén clave/valor genérico. La lista blanca evita que una clave sensible futura quede expuesta. Pasar directamente a ALL_ERP_ROLES sin lista blanca sería más corto, pero menos seguro.
- La prueba escribe en admin_config de erp_test, que no se trunca. Hay que restaurar en finally y correrla con el runner de ROLLBACK.
- Detectar 'admin' en el panel por localStorage es solo cosmético: la seguridad real es el 403 del PATCH.
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/lib/listas-ventas.js`, `frontend/tests/test_listas_ventas.mjs`, `backend/tests/test_listas_ventas_totales.py`


### COT-LISTA — Contadores reales en Cotizaciones

**Para el usuario:** En la lista de Cotizaciones, 'Confirmadas' y 'Monto confirmado' ya no cuentan las cotizaciones cuyo pedido se canceló. Esas pasan a 'Activas', porque hay que ajustarlas y reenviarlas, con una marca roja 'Pedido … cancelado'. La tarjeta dice cuántas confirmadas ya tienen pedido y cuántas faltan por convertir.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- ¿"Monto confirmado" incluye cotizaciones confirmadas que todavía no son pedido (por ejemplo, esperando el anticipo)? → **Sí, mostrando aparte cuántas faltan**

**Cambios (diseño):**

```text
BACKEND erp_ventas.py, list_cotizaciones (l.813-815): una sola consulta extra, igual que en H32:
```python
ids = [c.id for c in items]
pvs_por_cot = {}
if ids:
    for v_id, v_num, v_est, v_cot in (db.query(SaleOrder.id, SaleOrder.numero, SaleOrder.estado, SaleOrder.cot_id)
            .filter(SaleOrder.cot_id.in_(ids)).order_by(SaleOrder.id.asc())):
        pvs_por_cot.setdefault(v_cot, []).append({"id": v_id, "numero": v_num, "estado": v_est})
return {..., "data": [{**_cot_dict(c), "pedidos_venta": pvs_por_cot.get(c.id, [])} for c in items]}
```
Es el mismo nombre que ya usa get_cotizacion (l.900), pero en versión ligera.
FRONTEND
- listas-ventas.js: `pedidoVigente(cot)` (primer pedido que no está CANCELADO, o null) y `soloPedidosCancelados(cot)` (tuvo pedidos y todos están cancelados).
- cotizacion-client.tsx:
  · l.509-514: `const pedidoCaido=(c:any)=>c.estado==='CONFIRMADA'&&soloPedidosCancelados(c);` `activas = cotizaciones.filter(c=>(c.estado!=='CONFIRMADA'&&c.estado!=='RECHAZADA')||pedidoCaido(c));` `confirmadas = cotizaciones.filter(c=>c.estado==='CONFIRMADA'&&!pedidoCaido(c));` `conPedido = confirmadas.filter(c=>pedidoVigente(c));` `porConvertir = confirmadas.length-conPedido.length;` y montoTotal sobre `confirmadas`.
  · l.523-524: las pestañas usan los mismos predicados (Activas incluye pedidoCaido; Confirmadas lo excluye).
  · l.577: hint en 'comportamiento'. l.588: subtexto en 'comportamiento'.
  · l.680-684 (celda COT / SC), debajo de 'SC: …': si pedidoVigente(cot), `<p className="text-[10px] font-bold text-emerald-600 mt-0.5">Pedido {v.numero}</p>`; si soloPedidosCancelados(cot), `<p className="text-[10px] font-bold text-rose-500 mt-0.5">Pedido {último.numero} cancelado</p>`.
- Opcional, una línea en el Hub (page.tsx:1124): el panel rápido marca el paso 'Pedido de Venta' con `(pedidos_venta||[]).length>0`, aunque el pedido esté cancelado. Cambiarlo por `pedidoVigente(quickDetailDoc)`.
```

**Comportamiento esperado:**

```text
- Una COT CONFIRMADA cuyos pedidos están todos CANCELADO cuenta como 'Activa', porque se puede ajustar, reenviar y generar otro pedido. No suma en 'Confirmadas' ni en 'Monto Confirmado', y la fila muestra en rojo 'Pedido PVEN-… cancelado'.
- 'Confirmadas': valor = COT CONFIRMADA sin pedido caído. Hint = confirmadas.length===0 ? 'Sin confirmadas' : porConvertir>0 ? `${conPedido.length} con pedido de venta · ${porConvertir} por convertir` : 'Todas con pedido de venta'.
- 'Monto Confirmado' = suma de total_cop de esas confirmadas. Subtexto: `${conPedido.length} con pedido de venta vigente`.
- Cuando H46 re-cotiza una COT con pedido cancelado, esta vuelve a BORRADOR. Si luego se crea otro pedido, pedidoVigente toma el nuevo y el cancelado deja de influir.
```

**Pruebas (diseño):**

```text
Backend, en test_listas_ventas_totales.py:
6) test_lista_de_cotizaciones_trae_sus_pedidos_con_estado(app_client, db, admin_token): cliente=f'Cliente COTL {suf}'. Crear SalesQuotation COT-LA{suf}, COT-LB{suf} y COT-LC{suf}, todas CONFIRMADA (un db.add cada una). Luego SaleOrder PVEN-LA{suf} (cot_id=LA, CANCELADO), PVEN-LB{suf} (cot_id=LB, CANCELADO) y PVEN-LD{suf} (cot_id=LB, PENDIENTE_COMPRA). GET /api/v1/ventas/cotizaciones?search=cliente&limit=200. Con `por_numero={d['numero']:d['pedidos_venta'] for d in data}` afirmar: por_numero[LA]==[{'id':pv_a.id,'numero':pv_a.numero,'estado':'CANCELADO'}]; [p['estado'] for p in por_numero[LB]]==['CANCELADO','PENDIENTE_COMPRA']; por_numero[LC]==[].
Frontend, test_listas_ventas.mjs: pedidoVigente({pedidos_venta:[{estado:'CANCELADO'},{estado:'PENDIENTE_COMPRA',numero:'PVEN-2'}]}).numero==='PVEN-2'; con solo cancelados devuelve null y soloPedidosCancelados es true; con {} o pedidos_venta:null ambas funciones devuelven null/false. Luego tsc --noEmit. Manual: cancelar el pedido de una COT confirmada y comprobar que sale de 'Confirmadas', baja 'Monto Confirmado' y aparece en 'Activas' con 'Pedido … cancelado'.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No aplica. Se calcula desde sale_orders.cot_id y su estado.
```

**Riesgos:**

```text
- Hasta que se aplique H46, la COT con pedido caído sigue diciendo 'Confirmada' en su insignia aunque esté en 'Activas'. La marca roja lo explica. La acción de ajustar y reenviar está en el detalle (H46).
- La búsqueda de esta lista es JSON.stringify(c) (l.521), así que ahora también encuentra la COT por el número de su pedido. Es un efecto deseable.
- Opcional, fuera de este arreglo: el subtítulo 'COT-YYYY#### — …' (l.557) tiene la misma jerga que se quita en H47.
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/lib/listas-ventas.js`, `frontend/tests/test_listas_ventas.mjs`, `backend/tests/test_listas_ventas_totales.py`


### H42 — Precios en pesos enteros

**Para el usuario:** Todos los precios de cotizaciones, pedidos y órdenes de pago se guardan y se muestran en pesos enteros, sin centavos ni decimales raros ($342.462 en vez de $342.461,538). Los precios siguen siendo exactos: solo se redondean al peso, no a la centena ni al mil. Una línea vale precio unitario × cantidad y la suma cuadra con el total.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- ¿Redondeo también los montos con centavos ya guardados (por ejemplo el pedido de $2.786.923,08)? → **Sí, en documentos que no tengan pagos registrados** ⚠ distinta de la recomendada ("No, solo mostrarlos sin decimales")

**Cambios (diseño):**

```text
Base compartida para todo el grupo. Implementar primero, porque H36+H43, N1, H44+N6 y H45 usan estos helpers.

BACKEND
1) Nuevo archivo backend/app/core/ventas_dinero.py, sin FastAPI:
   - redondear_peso(v) -> Decimal: Decimal(str(v or 0)).quantize(Decimal('1'), rounding=ROUND_HALF_UP).
   - pesos(v) -> str: formato es-CO a peso entero, '$1.724.400' o '-$5.000' (n=redondear_peso(v); f"{abs(n):,.0f}".replace(',', '.')). Reemplaza los f"${x:,.0f}" con formato de EE. UU. en las líneas que toca este grupo.
   - Este archivo también recibe los helpers de anticipo (H36+H43) y de anulación de PXP (H45). Va aparte para que lo usen erp_ventas.py y erp_ventas_fase4.py sin import circular, ya que fase4 no importa erp_ventas.
2) erp_ventas.py update_cotizacion (antes del loop `for k in allowed`, línea 971): `for k in ('subtotal_cop','total_cop'): if body.get(k) is not None: body[k] = redondear_peso(body[k])`. Con esto la cabecera de la COT queda en pesos enteros aunque el cliente mande decimales.
3) erp_ventas.py create_cotizacion (853-874): subtotal_cop y total_cop pasan por redondear_peso.
4) erp_ventas_fase4.py convertir_cotizacion_a_venta (2778-2781): total_cop = redondear_peso(cot.total_cop) y subtotal_cop = redondear_peso(cot.subtotal_cop or total). El saldo se calcula con N1.

FRONTEND
5) frontend/src/lib/pricing.js computeMarginPrice (14-19): `const bruto = margen>0 ? costoTotalCop/(1-margen/100) : costoTotalCop; const q = Number(qty)||1; const unitPriceCop = Math.round(bruto/q); const totalCop = Math.round(unitPriceCop*q);`. También lo usa /dashboard/cotiza/page.tsx, que se beneficia sin cambios.
6) cotizacion-client.tsx CalculadorModal (191-193): subtotal = Σ p.total_cop (enteros); descTotal = Math.round(subtotal*desc/100); total = subtotal - descTotal.
7) Nuevo frontend/src/lib/pesos.js:
   - redondearPeso(v) = Math.round(Number(v)||0)
   - formatoPesos(v) = (n<0?'-':'') + '$' + String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
   La agrupación es manual y no usa toLocaleString, que con algunas versiones de ICU no agrupa números de 4 cifras en 'es'.
8) Usar formatoPesos en lugar del fCOP local en estos archivos:
   - venta/[id]/page.tsx:18 (`const fCOP = formatoPesos`)
   - venta/venta-client.tsx:49
   - cotizacion/cotizacion-client.tsx:45-49 (mantener el export fCOP, que ya importan cotizacion/[id]/page.tsx y otros, delegando: `export const fCOP = (v) => formatoPesos(v)`)
   - ventas/page.tsx:20 (Hub, quick detail con anticipo)
9) cotizacion/[id]/page.tsx:658: el descuento mostrado pasa a fCOP(subtotal_cop - total_cop) en vez de subtotal*pct/100, para que cuadre exacto.
```

**Comportamiento esperado:**

```text
- Precio unitario de la línea = round(costo_total / (1 - margen) / qty). Total de la línea = unitario × qty. Subtotal = suma de las líneas. Descuento = round(subtotal × %desc). Total = subtotal − descuento. Anticipo = round(total × %anticipo) (H36+H43). Saldo = total − pagado verificado (N1). PXP: pendiente = saldo y pagado = total − saldo (H44). Todo en pesos enteros.
- Redondeo: half-up (Math.round en el frontend con positivos y ROUND_HALF_UP en el backend dan el mismo resultado).
- Visualización: '$' + miles con punto, sin decimales. Los negativos (crédito a favor) se ven como '-$X'. El 0 se ve '$0'.
- Ejemplo del recorrido: costo 222.600 y margen 35% dan $342.462 por unidad. Dos unidades dan $684.924, no $684.923,077.
```

**Pruebas (diseño):**

```text
FRONTEND (npm test ejecuta los scripts node de frontend/tests desde package.json:10; añadir el archivo nuevo al script):
- test_pricing.mjs, TEST 5 'precio a peso entero': computeMarginPrice(222600, 35, 1) da unitPriceCop === 342462 y totalCop === 342462, y Number.isInteger(ambos).
- test_pricing.mjs, TEST 6: computeMarginPrice(445200, 35, 2) da unitPriceCop 342462 y totalCop 684924, con totalCop === unitPriceCop*2.
- Los TEST 1-4 existentes deben seguir pasando: 210000, 630000, tope de 95% y margen 0.
- Nuevo tests/test_pesos.mjs:
  - formatoPesos(2786923.08) === '$2.786.923'
  - formatoPesos(342461.538) === '$342.462'
  - formatoPesos(1500) === '$1.500'
  - formatoPesos(0) === '$0'
  - formatoPesos(null) === '$0'
  - formatoPesos(-1500000) === '-$1.500.000'
  - redondearPeso(1672153.8) === 1672154
- `npx tsc --noEmit` en frontend sin errores.

BACKEND (pytest con el runner de ROLLBACK, nunca contra la erp_test compartida sin él):
- Nuevo test_pesos_enteros.py::test_pesos_formato_colombiano: pesos(Decimal('2786923.08')) == '$2.786.923', pesos(1062523) == '$1.062.523' y pesos(-5000) == '-$5.000'.
- ::test_guardar_la_cotizacion_redondea_los_totales_a_peso: prepara una COT BORRADOR con total 1000. Hace PATCH {'total_cop': 2786923.08, 'subtotal_cop': 2786923.08, 'productos': [...], 'updated_by': 't'} con admin_token. Afirma que, después de db.refresh, cot.total_cop == Decimal('2786923').
- Regresión: test_reenviar_precio_con_ruido_de_punto_flotante_no_rompe_el_congelamiento (test_confirmacion_cotizacion.py:469) y test_guardar_la_calculadora_sin_cambios_de_precio_no_registra_nada... (test_actividad_cambios_documentos.py:156) deben seguir pasando: 60000.00000000001 redondea a 60000, igual que antes.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No se migran montos guardados. El formateador nuevo ya oculta los decimales de COT y PVEN viejos (2.786.923,08 se ve $2.786.923). Reescribir total_cop, saldo_cop y el JSON productos de documentos ya confirmados o con pagos cambiaría montos que el cliente aceptó y descuadraría el libro de pagos por centavos, así que no se recomienda. Si el usuario quiere limpiarlos igual, primero listar con una consulta de solo lectura: SELECT numero,total_cop,saldo_cop FROM sale_orders WHERE total_cop<>round(total_cop) OR saldo_cop<>round(saldo_cop); y lo mismo para sales_quotations. Después, con su autorización, aplicar UPDATE ... SET total_cop=round(total_cop) solo en documentos sin pagos registrados.
```

**Riesgos:**

```text
- Una COT vieja con total decimal (ej. 2786923.08) que esté en PENDIENTE_CONFIRMACION y se vuelva a guardar quedará con 2786923. El congelamiento de Gate 2 lo verá como cambio de precio y la regresará a BORRADOR. Es un caso raro y solo de datos viejos.
- Puede haber diferencias de hasta medio peso por línea frente al cálculo exacto. El usuario pidió exactamente esto: exacto al peso.
- Otros formateadores fuera de Ventas (design-system.ts:254, compras, inventario) siguen como están. Cambiarlos sería un refactor ajeno a este arreglo.
```

**Archivos:** `backend/app/core/ventas_dinero.py`, `backend/app/api/v1/erp_ventas.py`, `backend/app/api/v1/erp_ventas_fase4.py`, `frontend/src/lib/pricing.js`, `frontend/src/lib/pesos.js`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/venta-client.tsx`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/tests/test_pricing.mjs`, `frontend/tests/test_pesos.mjs`, `frontend/package.json`, `backend/tests/test_pesos_enteros.py`


### H36+H43 — Anticipo según la modalidad de pago

**Para el usuario:** El anticipo de la cotización sale solo de la modalidad de pago de la solicitud: 60% en 60/40, 100% en Contado y 0% en Crédito. Se recalcula cada vez que se re-cotiza, así que ya no queda un anticipo viejo ni en $0. La cotización muestra el anticipo y el saldo, y el pedido de venta exige el anticipo correcto.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Hoy toda solicitud nueva arranca en "Contado", es decir, 100% de anticipo verificado antes de crear el pedido. ¿Qué modalidad debe venir por defecto? → **Contado (100% antes del pedido)** (no había recomendación)
- Si la modalidad es "Otro" o está vacía, ¿qué anticipo se pide? → **60%**
- ¿El asesor puede cambiar el anticipo a mano en casos especiales (por ejemplo, un 50% negociado)? → **Sí, con una nota obligatoria** ⚠ distinta de la recomendada ("No: para cambiarlo se cambia la modalidad de la solicitud")

**Cambios (diseño):**

```text
BACKEND
1) En backend/app/core/ventas_dinero.py (ver H42):
   - pct_anticipo_de_modalidad(modalidad) -> Decimal|None. Normaliza el texto con unicodedata, sin tildes y en minúsculas. Si contiene '60/40' devuelve 60; si contiene 'credito', 0; si contiene 'contado', 100; si no reconoce el texto, None. Así cubre los textos de solicitud-client.tsx:32-36, agenda ('Credito 30 Dias') y chat.py:1698.
   - PCT_ANTICIPO_POR_DEFECTO = Decimal('60').
   - pct_anticipo_cotizacion(cot, db) -> (pct: Decimal, modalidad: str|None):
     - Si la COT tiene SC: el % de la modalidad de la SC, o 60 si no se reconoce.
     - Si no tiene SC y total>0: el % que ya tenía, anticipo_cop*100/total_cop sin cuantizar. Así una COT del Cotizador Rápido conserva su 60% y las COT de prueba con anticipo 0 conservan el 0.
     - Si no tiene SC y total=0: 60.
   - anticipo_requerido(total, pct) = redondear_peso(total*pct/100).
2) erp_ventas.py update_cotizacion:
   - Quitar 'anticipo_cop' de PRICE_FREEZE_FIELDS (964-965). El cliente nunca ve el anticipo: confirmacion_publica.py:70 solo expone total y productos. Con este cambio, un recálculo del anticipo no regresa a BORRADOR una COT pendiente de confirmación.
   - Quitar 'anticipo_cop' de `allowed` (967-970): el anticipo deja de ser editable a mano.
   - Antes del loop (971): `pct, _ = pct_anticipo_cotizacion(cot, db)`. Se calcula con los valores viejos para que el % de una COT sin SC salga del anticipo/total anteriores.
   - Después de definir _freeze_cmp y antes de `ya_tiene_pven` (1048): `if body.get('recotizacion') or _quantize_cop(cot.total_cop) != _quantize_cop(old_price_values['total_cop']): cot.anticipo_cop = anticipo_requerido(cot.total_cop, pct)`.
3) erp_ventas.py create_cotizacion (842-868): si se encontró la SC, anticipo_cop = anticipo_requerido(total, pct de la modalidad de la SC, o 60). Si no hay SC, se mantiene body.get('anticipo_cop', 0), que es lo que manda /dashboard/cotiza con su 60%.
4) erp_ventas.py get_cotizacion (896-900): agregar d['anticipo_pct'] = float(pct) y d['sc_modalidad_pago'] = modalidad. No se agregan a _cot_dict para no hacer una consulta por fila en el listado.
5) erp_ventas.py update_solicitud, después del commit (560):
   - Si 'modalidad_pago' está en el body y cambió (antes_log['modalidad_pago'] != sc.modalidad_pago), recorrer las COT con sc_id == sc.id y estado en (BORRADOR, ENVIADA, PENDIENTE_CONFIRMACION, CONFIRMADA) que no tengan un SaleOrder con estado != 'CANCELADO'.
   - Recalcular su anticipo_cop = anticipo_requerido(total, nuevo %).
   - Si cambió, registrar con _log un renglón 'COT' 'UPDATED': f"Anticipo recalculado por cambio de modalidad de pago de {sc.numero} ({modalidad}): {pesos(viejo)} → {pesos(nuevo)}".
6) erp_ventas_fase4.py convertir_cotizacion_a_venta: el anticipo requerido se recalcula con pct_anticipo_cotizacion (detalle en N1). Además:
   - new_so.anticipo_pct_snapshot = pct.quantize(0.01) y saldo_pct_snapshot = 100 - pct. Hoy siempre queda el default 60/40 del modelo (erp_documents.py:181-182), aunque la venta sea de contado o a crédito.
   - cot.anticipo_cop = anticipo_requerido, en el mismo commit.

FRONTEND
7) cotizacion-client.tsx CalculadorModal:
   - Eliminar el estado `anticipo` (174), los botones 60%/100%/0% (345-349) y el input (351-352).
   - `const anticipoPct = Number(cot.anticipo_pct ?? 60); const anticipo_cop = Math.round(total*anticipoPct/100); const saldo = total - anticipo_cop;` en cada render.
   - Mostrar en solo lectura: 'Anticipo {anticipoPct}% ({cot.sc_modalidad_pago || "sin solicitud: % actual de la cotización"})' y 'Saldo pendiente'.
   - Nota debajo: 'El anticipo sigue la modalidad de pago de la solicitud {cot.sc_numero}. Para cambiarlo, cambia la modalidad en la solicitud.'
   - handleSave (219-225) deja de mandar anticipo_cop.
8) cotizacion/[id]/page.tsx TOTALES (648-666): después de TOTAL, agregar dos renglones: 'Anticipo requerido ({anticipo_pct}% · {sc_modalidad_pago})' con fCOP(cotizacion.anticipo_cop), y 'Saldo' con fCOP(total_cop - anticipo_cop).
9) Fuera de este grupo: la TRM fija de 4200 (cotizacion-client.tsx:165) que la verificación incluyó en H36. Ver decisiones.
```

**Comportamiento esperado:**

```text
- % de anticipo de una COT con solicitud:
  - 60/40: 60%
  - Contado: 100%
  - Crédito 30 o 60 días: 0%
  - modalidad vacía o no reconocida: 60%
- % de anticipo de una COT sin solicitud: conserva el % que ya tenía, o 60% si aún no tenía total.
- anticipo_cop = round(total × %/100), en pesos enteros. Lo calcula siempre el servidor. Cualquier anticipo_cop que llegue en el body se ignora.
- Se recalcula cuando cambia el total o cuando se guarda desde Re-Cotizar (recotizacion=true), aunque el total no cambie. Así se corrigen los anticipos viejos en $0.
- Si cambia la modalidad de pago de la SC, se recalcula el anticipo de sus COT abiertas sin pedido vigente, y queda el renglón en la Actividad de la COT.
- Un recálculo del anticipo no invalida la confirmación del cliente. Un cambio de total sí la invalida, como hoy.
- El PVEN guarda el % real en anticipo_pct_snapshot. recalculate_sale_order_state (fase4:240) deja de suponer 60% en ventas de contado o a crédito.
- Ejemplo del recorrido: SC 60/40, total anterior 2.874.000 y anticipo 1.724.400. Al re-cotizar a 2.786.923, el anticipo pasa a 1.672.154, no se queda en 1.724.400.
```

**Pruebas (diseño):**

```text
Nuevo backend/tests/test_anticipo_modalidad.py, al estilo de test_solicitud_productos_para_cotizar.py, con helpers _sc y _cot y auth(admin_token):
- test_pct_anticipo_de_modalidad (puro): '60/40 (60% anticipo - 40% pendiente)' da 60, 'Contado' da 100, 'Credito 30 dias' da 0, 'Crédito 60 Días' da 0, None da None y 'Otro' da None.
- test_primer_calculo_de_cot_de_sc_60_40_pone_el_anticipo_al_60: SC con modalidad 60/40 y COT(sc_id, BORRADOR, total 0, anticipo 0). PATCH {'productos':[...], 'subtotal_cop':2874000, 'total_cop':2874000, 'recotizacion':True}. Afirma anticipo_cop == 1724400.
- test_recotizar_recalcula_el_anticipo_e_ignora_el_del_body: la misma COT ya con anticipo 1724400. PATCH total 2786923 con 'anticipo_cop':1724400 en el body. Afirma anticipo_cop == 1672154.
- test_contado_exige_100_y_credito_0: dos SC, 'Contado' y 'Credito 30 dias'. PATCH total 1000000. Afirma anticipos 1000000 y 0.
- test_patch_sin_total_no_toca_el_anticipo: PATCH {'notas':'x'} y PATCH {'anticipo_cop':1}. Afirma que el anticipo no cambia.
- test_recalcular_el_anticipo_no_invalida_la_confirmacion: COT PENDIENTE_CONFIRMACION, SC Contado, total 1000 y anticipo 0. PATCH {'total_cop':1000,'recotizacion':True}. Afirma estado == 'PENDIENTE_CONFIRMACION' y anticipo 1000.
- test_get_cotizacion_expone_pct_y_modalidad: GET devuelve anticipo_pct 60.0 y sc_modalidad_pago con el texto 60/40.
- test_cambiar_la_modalidad_de_la_sc_recalcula_la_cot_abierta: SC 60/40 con COT BORRADOR total 1000000 y anticipo 600000. PATCH a la SC {'modalidad_pago':'Contado'}. Afirma COT anticipo 1000000 y un renglón UPDATED con 'Anticipo recalculado'.
- test_cot_sin_sc_conserva_su_porcentaje: COT total 1000000 y anticipo 600000, sin SC. PATCH total 2000000. Afirma anticipo 1200000.

Regresión: todo test_confirmacion_cotizacion.py (congelamiento) y test_actividad_cambios_documentos.py (ACT001-ACT006). En sus COT sin SC con anticipo 0 el % conservado es 0, así que no aparecen cambios nuevos en la Actividad.

FRONTEND: npx tsc --noEmit. Revisión manual: abrir la calculadora de una COT de SC 60/40 y ver el anticipo en solo lectura y que cambia al editar costo o margen.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
Hay COT abiertas con anticipo desactualizado: en $0 por H36, o al 60% de un total anterior por H43. Al convertir se recalcula siempre (N1), así que esto no llega al pedido. Para que la pantalla de la COT muestre bien el anticipo desde ya, se propone una corrección puntual con autorización del usuario. Primero la consulta de solo lectura:
SELECT c.id, c.numero, c.estado, c.total_cop, c.anticipo_cop, s.modalidad_pago FROM sales_quotations c JOIN customer_requests s ON s.id=c.sc_id WHERE c.estado IN ('BORRADOR','ENVIADA','PENDIENTE_CONFIRMACION','CONFIRMADA') AND NOT EXISTS (SELECT 1 FROM sale_orders v WHERE v.cot_id=c.id AND v.estado<>'CANCELADO');
Con esa lista se recalcula anticipo_cop usando pct_anticipo_de_modalidad, con un script Python de una sola vez que reutilice el helper. Los PVEN que ya heredaron un anticipo viejo se tratan en N1, en sus datos existentes.
```

**Riesgos:**

```text
- Ya no se puede poner un anticipo especial a mano, por ejemplo un 50% negociado. Si se necesita, se cambia la modalidad en la SC.
- Un total sin SC con un % raro heredado se conserva tal cual.
- Quitar anticipo_cop del congelamiento es seguro solo porque el cliente no ve el anticipo. Si en el futuro la página pública lo muestra, hay que volver a incluirlo.
- update_solicitud gana una consulta extra solo cuando cambia la modalidad.
```

**Archivos:** `backend/app/core/ventas_dinero.py`, `backend/app/api/v1/erp_ventas.py`, `backend/app/api/v1/erp_ventas_fase4.py`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `backend/tests/test_anticipo_modalidad.py`


### N1 — Verificar el pago del anticipo antes de crear el pedido

**Para el usuario:** Para crear el Pedido de Venta de una cotización con anticipo, primero hay que registrar la verificación del pago: cuánto pagó el cliente, por qué medio, con qué referencia y en qué fecha. Queda guardado quién lo verificó. El pedido ya no da por pagado un anticipo que nadie revisó. Si la venta es a crédito (anticipo $0), el pedido se crea como hoy, debiendo el total.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- ¿Quién puede verificar el pago del anticipo? → **Quien crea el pedido (asesor o administración)**
- Si el cliente pagó menos que el anticipo, ¿se puede crear el pedido? → **Sí, y queda debiendo la diferencia** ⚠ distinta de la recomendada ("No, debe pagar al menos el anticipo")
- Medios de pago: Transferencia, Consignación, Efectivo, Tarjeta, Nequi, Daviplata, PSE y Otro, con referencia obligatoria (en efectivo, el número de recibo). ¿Sirve así? → **Sí**
- Si un pedido con anticipo ya verificado se cancela y se crea otro desde la misma cotización, ¿ese pago se usa en el nuevo pedido? → **Sí, se traslada como saldo a favor**

**Cambios (diseño):**

```text
BACKEND
1) schemas_fase5.py: nuevo modelo
   `class VerificacionAnticipo(BaseModel): model_config = ConfigDict(str_strip_whitespace=True); monto: Decimal = Field(..., gt=Decimal('0')); metodo_pago: str = Field(..., min_length=2, max_length=50); referencia: str = Field(..., min_length=3, max_length=150); fecha_pago: Optional[datetime.date] = None`
   Y en ConvertirCotizacionVentaRequest (10-15): `verificacion_anticipo: Optional[VerificacionAnticipo] = None`.
2) erp_ventas_fase4.py convertir_cotizacion_a_venta: después de los dos checks de Gate 2 (2763-2772) y ANTES de _gen_numero (2775), reemplazar el bloque 2777-2780 por:
   - total = redondear_peso(cot.total_cop)
   - pct, modalidad = pct_anticipo_cotizacion(cot, db)
   - req = anticipo_requerido(total, pct)
   - ver = request.verificacion_anticipo
   - pagado = Decimal('0')
   - if req > 0 or ver:
     - si falta ver: 422 f"Esta cotización exige un anticipo de {pesos(req)} ({modalidad or f'{pct:.0f}%'}). Verifica el pago del cliente (monto, método y referencia) antes de crear el pedido."
     - pagado = redondear_peso(ver.monto)
     - si pagado < req: 422 f"El pago verificado ({pesos(pagado)}) es menor que el anticipo requerido ({pesos(req)})."
     - si pagado > total: 422 f"El pago verificado ({pesos(pagado)}) supera el total del pedido ({pesos(total)})."
     - si ver.fecha_pago > _now_bogota().date(): 422 'La fecha del pago no puede ser posterior a hoy.'
   - saldo_cop = total - pagado
   - cot.anticipo_cop = req
3) SaleOrder(...) (2784-2812): anticipo_cop=pagado, saldo_cop=saldo_cop, anticipo_pct_snapshot y saldo_pct_snapshot según H36+H43.
4) Reemplazar el bloque 2816-2834:
   `if pagado > 0:` crear SaleOrderPayment con:
   - tipo='ANTICIPO', monto=pagado, moneda='COP'
   - metodo_pago=ver.metodo_pago
   - fecha=ver.fecha_pago or _now_bogota().date()
   - referencia_bancaria=ver.referencia
   - usuario=verificador, donde verificador = getattr(user,'email',None). Es el usuario autenticado, no request.user_name.
   - idempotency_key=f'PAY_CONV_COT_{cot.id}_{new_so.id}', estado='CONFIRMADO'
   - notes=f'Anticipo verificado por {verificador} al crear el pedido desde la cotización {cot.numero}'
   Además, db.add(ActivityLog(entity_type='VEN', entity_id=new_so.id, entity_numero=new_so.numero, action='ANTICIPO_VERIFICADO', description=f'Anticipo de {pesos(pagado)} verificado por {verificador} ({ver.metodo_pago}, ref. {ver.referencia})', user_name=verificador, extra_data={'monto': str(pagado), 'anticipo_requerido': str(req), 'metodo_pago': ver.metodo_pago, 'referencia': ver.referencia, 'fecha_pago': str(fecha), 'verificado_por': verificador})).
   Se elimina por completo el pago automático 'CONVERSION_COTIZACION'.
5) La descripción CONVERTIDA_A_VENTA (3001) agrega: f' Anticipo verificado: {pesos(pagado)}.' cuando pagado > 0.
6) La respuesta (3021-3032) agrega 'anticipo_requerido': float(req).
7) erp_ventas.py confirmar_cotizacion (1236-1241): pasar `verificacion_anticipo=body.get('verificacion_anticipo')` al construir ConvertirCotizacionVentaRequest, dentro de `try: ... except pydantic.ValidationError: raise HTTPException(422, 'La verificación del anticipo está incompleta: indica monto, método de pago y referencia.')`. Sin esto sería un 500, que además pierde los headers CORS (ver memoria fail-fetch).
8) erp_ventas.py:
   - _ven_dict (232-270): agregar 'anticipo_pct': float(v.anticipo_pct_snapshot) if v.anticipo_pct_snapshot is not None else None.
   - get_pedido (1395-1399): agregar d['pagos'] = [{tipo, monto, metodo_pago, referencia_bancaria, usuario, fecha, estado}] de SaleOrderPayment del pedido, ordenados por created_at.

FRONTEND
9) cotizacion-client.tsx: nuevo `export function VerificarAnticipoModal({ cot, verificador, saving, error, onConfirm, onCancel })`.
   - Título 'Verificar el pago del anticipo'.
   - Texto: 'Modalidad {sc_modalidad_pago}: el cliente debe haber pagado al menos {fCOP(anticipo_cop)} ({anticipo_pct}%). Revisa en el banco que el dinero llegó y registra el pago.'
   - Campos:
     - Monto recibido: número entero, por defecto anticipo_cop, mínimo anticipo_cop, máximo total_cop.
     - Método de pago: select con Transferencia bancaria, Consignación, Efectivo, Tarjeta, Nequi, Daviplata, PSE, Otro.
     - Referencia o número de comprobante: obligatorio, mínimo 3 caracteres.
     - Fecha del pago: por defecto hoy, máximo hoy.
     - Checkbox obligatorio 'Confirmo que revisé y el pago está en la cuenta de Nebulae'.
   - Texto 'Verificado por: {verificador}'.
   - Botones 'Volver' y 'Pago verificado — Crear Pedido de Venta', deshabilitado hasta que todo sea válido.
   - Muestra `error` dentro del modal.
10) cotizacion/[id]/page.tsx:
   - handleConfirmarVenta (209-235): si Number(cotizacion.anticipo_cop) > 0, abrir el modal (estado showVerificarAnticipo). Si es 0, se mantiene el flujo actual.
   - Nueva función crearPedido(verificacion?) con POST /confirmar body {user_name: currentUser, ...(verificacion && {verificacion_anticipo: verificacion})}.
   - El error 422 se muestra dentro del modal, no en alert.
   - Renderizar el modal junto a los demás (886).
   - verificador = getUsuarioActual().email (de ../../flujo).
11) venta/[id]/page.tsx Resumen Financiero (527-548):
   - 'Anticipo:' pasa a 'Pagado (verificado): {fCOP(total_cop - saldo_cop)}' y 'Anticipo requerido {anticipo_pct}%'.
   - Debajo, la lista de pedido.pagos: '{tipo} {fCOP(monto)} · {metodo_pago} · ref. {referencia_bancaria} · verificado por {usuario} · {fDate(fecha)}'.
   - Los pagos con metodo_pago === 'CONVERSION_COTIZACION' llevan la etiqueta ámbar 'Registrado automáticamente, sin verificar'.
12) venta-client.tsx:227: el KPI 'Anticipo Cobrado' pasa a 'Anticipo verificado'. Con este fix anticipo_cop ya es dinero confirmado. Los textos 'El cliente ya pagó' (cotizacion-client.tsx:414) y la ALERTA DE COBRO de entregas quedan correctos sin cambios.
```

**Comportamiento esperado:**

```text
- Anticipo requerido = round(total × % modalidad) (H36+H43), recalculado al convertir. No se toma el anticipo guardado viejo.
- Si el requerido es mayor que 0 y no viene la verificación: 422 con el mensaje exacto de arriba. No se crea el PVEN, no se consume gate2_confirmed_at y la COT sigue CONFIRMADA para reintentar.
- Monto verificado: entero, al menos el requerido y como máximo el total. Puede ser mayor que el requerido si el cliente pagó más.
- Quién verifica: el usuario autenticado que crea el pedido (ADMIN o ASESOR, que son los roles de la conversión). Se guarda en SaleOrderPayment.usuario y en la Actividad del pedido. El user_name del body solo se usa en el renglón CREATED, como hoy.
- PVEN: anticipo_cop = monto verificado; saldo_cop = total − verificado; snapshot con el % real. Si el saldo es 0 y todas las líneas quedan reservadas, el estado LISTO_ENTREGA sale de la regla existente (2983).
- Crédito (requerido 0): no se pide verificación, no se crea ningún pago y saldo = total. Si aun así se envía una verificación, se registra como anticipo.
- El replay idempotente no cambia: devuelve el pedido existente sin crear otro pago.
- Ya no existe el pago automático 'CONVERSION_COTIZACION'.
```

**Pruebas (diseño):**

```text
Nuevo backend/tests/test_anticipo_verificado.py. Helper _cot_confirmada(db, numero, total, anticipo, sc=None) crea una COT CONFIRMADA con gate2_confirmed_at=utcnow() y productos=[{'product_name':'Cuna','qty':1,'unit_price_cop':total}].
- test_crear_pedido_sin_verificar_el_anticipo_se_rechaza: total 1000000 y anticipo 600000. POST /cotizaciones/{id}/confirmar {'user_name':'t'}. Afirma 422; 'anticipo de $600.000' en el detail; ningún SaleOrder con cot_id; cot.gate2_confirmed_at is not None.
- test_crear_pedido_con_anticipo_verificado_registra_el_pago_real: POST con verificacion_anticipo {'monto':600000, 'metodo_pago':'Transferencia bancaria', 'referencia':'BANCOL-123', 'fecha_pago':hoy} y user_name 'otro@x'. Afirma 200. Afirma un único SaleOrderPayment con tipo ANTICIPO, estado CONFIRMADO, monto 600000, referencia_bancaria 'BANCOL-123' y usuario == user_admin.email. Afirma so.anticipo_cop 600000, saldo_cop 400000 y anticipo_pct_snapshot 60. Afirma un renglón VEN 'ANTICIPO_VERIFICADO' cuya descripción contiene '$600.000' y user_admin.email. Afirma 0 pagos con metodo_pago 'CONVERSION_COTIZACION'.
- test_pago_menor_al_anticipo_requerido_se_rechaza: monto 500000. Afirma 422 'menor que el anticipo requerido' y que no hay PVEN.
- test_pago_mayor_al_total_se_rechaza: monto 1200000. Afirma 422.
- test_fecha_de_pago_futura_se_rechaza: fecha mañana. Afirma 422.
- test_verificacion_incompleta_responde_422_no_500: verificacion_anticipo {'monto':600000}. Afirma 422 con 'incompleta'.
- test_venta_a_credito_no_exige_anticipo: COT de SC 'Credito 30 dias' (anticipo 0). POST sin verificación. Afirma 200, 0 pagos, saldo == total y anticipo_pct_snapshot == 0.
- test_el_anticipo_requerido_se_recalcula_al_convertir: SC 60/40 y COT total 2786923 con anticipo viejo 1724400. POST con monto 1672154. Afirma 200 (el requerido recalculado es 1672154) y cot.anticipo_cop == 1672154.
- test_replay_no_duplica_el_pago: dos POST /convertir-a-venta con la misma idempotency_key y verificación. Afirma 1 pago.
- test_asesor_puede_verificar: vendedor_token. Afirma 200 y pago.usuario == user_vendedor.email.

Ajustar los tests existentes de test_fase5_integracion_erp.py que convierten COT con anticipo mayor que 0 y fallarían con 422. Agregar 'verificacion_anticipo': {'monto': <anticipo>, 'metodo_pago':'Transferencia bancaria', 'referencia':'TEST-xx'} a:
- test_03 (payload 315-319, monto 810000)
- test_04 (365-369 y 376-380, monto 270000)
- test_05 (solo la primera llamada, 427-431, monto 270000)
- test_17 (809-813, monto 300000)
Los de test_confirmacion_cotizacion.py, test_actividad_cambios_documentos.py:221, test_crm_lead_movimiento_automatico.py:142 y test_sincronizacion_estado_solicitud_cotizacion.py:78 tienen anticipo 0 o total 0 y no cambian.

FRONTEND: npx tsc --noEmit. Revisión manual con datos de prueba (rollback): COT 60/40 confirmada → 'Crear Pedido de Venta' abre el modal, el botón queda deshabilitado sin referencia ni checkbox, y el error 422 se ve dentro del modal.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
Los PVEN creados antes del arreglo tienen un SaleOrderPayment ANTICIPO CONFIRMADO con metodo_pago 'CONVERSION_COTIZACION' que nadie verificó. Ese pago descuenta el saldo, aparece como 'Anticipo Cobrado' y quita la alerta de cobro. Consulta de solo lectura para revisarlos:
SELECT v.numero, v.estado, v.total_cop, p.monto, p.usuario, p.created_at FROM sale_order_payments p JOIN sale_orders v ON v.id=p.sale_order_id WHERE p.metodo_pago='CONVERSION_COTIZACION' AND p.estado='CONFIRMADO';
Por cada uno, el usuario decide entre dos opciones:
(a) El cliente sí pagó. Se deja el pago y se le completan método y referencia reales con un UPDATE puntual.
(b) El cliente no pagó, o no se sabe. Se marca el pago estado='ANULADO' (el CHECK chk_sop_estado lo permite), se recalcula anticipo_cop = suma de ANTICIPO CONFIRMADO y saldo_cop = total − pagado neto, y se registra un renglón en la Actividad del PVEN.
Nada de esto se hace sin autorización. La interfaz los marca 'sin verificar' mientras tanto.
```

**Riesgos:**

```text
- Cambia el contrato de POST /cotizaciones/{id}/confirmar y /convertir-a-venta: cualquier llamador que convierta una COT con anticipo sin mandar la verificación recibe 422. Hoy el único llamador de UI es cotizacion/[id]/page.tsx.
- Los 4 tests de test_fase5_integracion_erp.py se rompen hasta ajustarlos.
- La 'verificación' es una declaración del asesor: no hay conexión con el banco.
- update_pedido (erp_ventas.py:1484) sigue aceptando anticipo_cop y saldo_cop en el PATCH genérico. Lo usa la propagación de re-cotización. Puede pisar el saldo sin pasar por el libro de pagos; no se toca aquí, pero conviene cerrarlo después.
- La ruta de cancelación nueva de otro grupo (cancelar el PVEN y crear otro) debe considerar que el anticipo ya verificado del pedido cancelado queda como saldo a favor del cliente.
```

**Archivos:** `backend/app/api/v1/schemas_fase5.py`, `backend/app/api/v1/erp_ventas_fase4.py`, `backend/app/api/v1/erp_ventas.py`, `backend/app/core/ventas_dinero.py`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/venta-client.tsx`, `backend/tests/test_anticipo_verificado.py`, `backend/tests/test_fase5_integracion_erp.py`


### H44+N6 — Orden de pago (PXP) con los montos correctos

**Para el usuario:** La orden de pago (PXP) sale con los montos correctos: lo ya pagado y lo que falta por pagar ya no salen invertidos. La línea de tiempo muestra quién la creó y el monto en formato colombiano ($1.724.400). El botón 'Crear PXP' lo ven y lo pueden usar Administración, Finanzas y el asesor. No aparece en pedidos cancelados, ni sin saldo pendiente, ni si ya hay una orden de pago vigente.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- ¿Corrijo las órdenes de pago ya creadas con los montos invertidos (después de que veas la lista)? → **Sí**

**Cambios (diseño):**

```text
BACKEND, erp_ventas.py crear_pxp (1512-1551):
1) Firma: `body: dict = Body(default_factory=dict)` y `user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_FINANZAS, *ROLE_ASESOR))`.
2) Cargar el pedido con `.with_for_update()`. Si no existe, 404.
   - Si v.estado == 'CANCELADO': 409 'No se puede crear una orden de pago para un pedido cancelado.'
   - Si existe un PaymentPending con ven_id == v.id y estado != 'CANCELADA': 409 f'El pedido ya tiene la orden de pago {activa.numero}.'
3) Montos desde el propio pedido; se ignora body.monto_anticipo:
   - total = redondear_peso(v.total_cop)
   - pendiente = redondear_peso(v.saldo_cop)
   - si pendiente <= 0: 409 'El pedido no tiene saldo pendiente; no hace falta una orden de pago.'
   - pagado = total - pendiente
   - PaymentPending(monto_total=total, monto_anticipo=pagado, monto_pendiente=pendiente, notas=body.get('notas'))
4) db.add(pxp); db.flush(); v.pxp_id = pxp.id; v.pxp_numero = pxp.numero; un solo db.commit(). Reemplaza el doble commit de 1536-1544.
5) autor = getattr(user,'email',None), el usuario autenticado y no el body.
   - Log VEN 'PXP_CREATED': f'Orden de pago {pxp.numero} creada. Pendiente: {pesos(pendiente)}' con user_name=autor.
   - Log PXP 'CREATED': f'Orden de pago creada para el pedido {v.numero}' con user_name=autor.

FRONTEND
6) flujo.tsx: nuevo `export function puedeCrearOrdenDePago(role?: string|null): boolean { const r=(role||'').toLowerCase().trim(); return ['admin','finanzas','asesor','vendedor'].includes(r); }`. Replica normalize_role de dependencies.py:89-101.
7) venta/[id]/page.tsx:
   - handleCrearPxp (133-146): body JSON.stringify({}). El error se muestra igual con alert, pero ahora con el mensaje legible del 409.
   - Antes del return: `const pxps = pedido?.pxps || []; const pxpVigente = pxps.find((p:any)=>p.estado!=='CANCELADA'); const puedePxp = puedeCrearOrdenDePago(getUsuarioActual().role) && estadoActual!=='CANCELADO' && !pxpVigente && Number(pedido?.saldo_cop)>0;`
   - Líneas 355-357: `{puedePxp && <Button ...>Crear PXP</Button>}`.
   - Chip 358-361: si hay pxpVigente, mostrar 'PXP: {numero} · {estado legible} · pendiente {fCOP(monto_pendiente)}'. Si no hay vigente pero sí una CANCELADA, chip gris 'PXP {numero} cancelada'.
8) venta-client.tsx:337-339: mostrar el ítem 'Crear PXP' del menú solo si puedeCrearOrdenDePago(getUsuarioActual().role) && p.estado!=='CANCELADO' && !p.pxp_id && Number(p.saldo_cop)>0. Sigue llevando al detalle.
9) No se crea pantalla de gestión de PXP (fuera de alcance). update_pxp sigue siendo solo para ADMIN y FINANZAS.
```

**Comportamiento esperado:**

```text
- Roles que pueden crear: ADMIN, FINANZAS y ASESOR, incluidos los roles legacy Admin, Finanzas y Vendedor. Los demás reciben 403 y no ven el botón.
- Condiciones para crear: pedido no CANCELADO, saldo_cop > 0 y ninguna PXP no cancelada para ese pedido. En otro caso, 409 con los mensajes exactos de arriba.
- monto_total = total del pedido; monto_anticipo = lo ya pagado (total − saldo); monto_pendiente = saldo. Todo en pesos enteros, ignorando lo que mande el cliente.
- Autor de los renglones de Actividad: el email del usuario autenticado. Ya no sale 'Sistema'.
- Texto: 'Orden de pago PXP-2026XXXX creada. Pendiente: $1.062.523'.
- Ejemplo del recorrido, con total 2.786.923, pagado 1.724.400 y saldo 1.062.523: la PXP queda con anticipo 1.724.400 y pendiente 1.062.523. Hoy salen al revés.
```

**Pruebas (diseño):**

```text
Nuevo backend/tests/test_orden_de_pago_pxp.py, con helper _pven(db, numero, **campos) que crea un SaleOrder con estado PENDIENTE_COMPRA, total 2786923, anticipo 1724400 y saldo 1062523:
- test_crear_pxp_toma_los_montos_del_pedido_y_no_del_body: POST /ventas/pedidos/{id}/crear-pxp con json {'monto_anticipo':1062523}, que es el payload viejo. Afirma 200 con monto_total 2786923, monto_anticipo 1724400 y monto_pendiente 1062523. Afirma que GET /pedidos/{id} trae un renglón 'PXP_CREATED' con description == f"Orden de pago {numero} creada. Pendiente: $1.062.523" y user_name == user_admin.email.
- test_el_asesor_puede_crear_la_pxp: vendedor_token. Afirma 200.
- test_no_se_crea_pxp_de_un_pedido_cancelado: estado CANCELADO. Afirma 409 y 0 PaymentPending para ven_id.
- test_no_se_crea_una_segunda_pxp_vigente: segundo POST. Afirma 409 con 'ya tiene la orden de pago'.
- test_no_se_crea_pxp_sin_saldo: saldo 0. Afirma 409 con 'no tiene saldo pendiente'.
- test_se_puede_crear_otra_si_la_anterior_esta_cancelada: insertar una PXP CANCELADA. POST. Afirma 200.
- test_body_vacio_es_valido: POST json={}. Afirma 200.

FRONTEND: npx tsc --noEmit. Opcional, una prueba node para puedeCrearOrdenDePago: si se mueve a un .js en lib, agregar tests/test_roles.mjs con 'Vendedor' → true, 'ERP' → false, '' → false. Revisión manual: el botón no aparece en un PVEN cancelado ni con saldo 0, y sí aparece para un asesor.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
Las PXP creadas con el botón actual tienen los montos invertidos. Consulta de solo lectura para identificarlas:
SELECT p.id, p.numero, v.numero AS pven, p.monto_total, p.monto_anticipo, p.monto_pendiente, v.anticipo_cop, v.saldo_cop FROM payment_pendings p JOIN sale_orders v ON v.id=p.ven_id WHERE p.monto_anticipo = v.saldo_cop AND p.monto_pendiente = (v.total_cop - v.saldo_cop) AND p.monto_anticipo <> p.monto_pendiente;
Con autorización del usuario se intercambian: UPDATE payment_pendings SET monto_anticipo=monto_pendiente, monto_pendiente=monto_anticipo, updated_at=now() WHERE id IN (...). Además se agrega un renglón de Actividad 'PXP' 'UPDATED': 'Montos corregidos (estaban invertidos)'.
Los renglones viejos de Actividad con '$1,724,400' y autor vacío se dejan como están: no se puede saber quién los creó. Si se quiere, el texto de los montos se corrige con el arreglo de textos de otro grupo.
```

**Riesgos:**

```text
- Darle permiso al ASESOR es un cambio de seguridad pedido por el usuario. update_pxp (marcar pagada o anular) sigue siendo solo para ADMIN y FINANZAS.
- Las PXP siguen sin pantalla de gestión: se crean, pero nadie las cierra desde la UI.
- Con el lock with_for_update, dos clics simultáneos ya no crean dos PXP.
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `backend/app/core/ventas_dinero.py`, `frontend/src/app/dashboard/ventas/flujo.tsx`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/venta-client.tsx`, `backend/tests/test_orden_de_pago_pxp.py`


### H45 — Cancelar el pedido cancela su orden de pago

**Para el usuario:** Al cancelar un Pedido de Venta, su orden de pago pendiente (PXP) se cancela también y deja de contarse como pendiente. En el pedido se ve que esa orden quedó cancelada. Una orden de pago que ya figure como pagada no se toca, y se deja un aviso para revisar la devolución al cliente.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- ¿Cancelo las órdenes de pago pendientes de pedidos ya cancelados (después de ver la lista)? → **Sí**

**Cambios (diseño):**

```text
BACKEND
1) En backend/app/core/ventas_dinero.py: nuevo `anular_pxps_de_pedido(db, so, autor, motivo=None) -> list[PaymentPending]`. Hace db.add sin commit, para que el llamador lo deje en su mismo commit:
   - Consulta PaymentPending con ven_id == so.id y estado == 'PENDIENTE'.
   - A cada una le pone estado='CANCELADA', updated_at=utcnow() y notas += f'\nCancelada por la cancelación del pedido {so.numero}' (+ f': {motivo}' si hay motivo).
   - Agrega ActivityLog('PXP', p.id, p.numero, 'ESTADO_CHANGED', f'Orden de pago cancelada por la cancelación del pedido {so.numero}', old_estado='PENDIENTE', new_estado='CANCELADA', user_name=autor).
   - Agrega ActivityLog('VEN', so.id, so.numero, 'PXP_CANCELADA', f'Orden de pago {p.numero} cancelada (pendiente: {pesos(p.monto_pendiente)})', user_name=autor).
   - Si hay PXP con otro estado que no sea PENDIENTE ni CANCELADA (por ejemplo PAGADA), no las toca. Agrega un ActivityLog VEN 'PXP_REVISAR': f'La orden de pago {p.numero} está {p.estado}: revisar devolución o saldo a favor del cliente'.
2) erp_ventas.py update_pedido (1468-1509):
   - cancela = body.get('estado') == 'CANCELADO' and old_estado != 'CANCELADO'
   - Después del loop allowed (1488) y antes de db.commit() (1492): if cancela: anular_pxps_de_pedido(db, v, autor=body.get('updated_by') or getattr(user,'email',None), motivo=body.get('cancellation_reason')).
3) erp_ventas_fase4.py cancel_sale_order: antes de db.commit() (1286), anular_pxps_de_pedido(db, so, autor=user_name, motivo=body.motivo), para que las dos rutas de cancelación queden iguales.

FRONTEND, venta/[id]/page.tsx
4) Modal de cancelación (848): si existe pxpVigente (ver H44+N6), agregar el texto 'También se cancelará la orden de pago {pxpVigente.numero} (pendiente {fCOP(pxpVigente.monto_pendiente)}).'
5) Chip PXP (358-361): con el chip definido en H44+N6, tras recargar se ve 'PXP {numero} cancelada'.
```

**Comportamiento esperado:**

```text
- Cancelar el PVEN, sea por PATCH genérico (botón 'Cancelar Pedido') o por POST /pedidos/{id}/cancelar, pasa a CANCELADA todas sus PXP PENDIENTE, en el mismo commit que el pedido.
- Las PXP que no están PENDIENTE (por ejemplo PAGADA) no se modifican, y queda en la Actividad del pedido el aviso de revisar la devolución.
- /ventas/stats.pxp_pendiente (erp_ventas.py:1602) deja de contarlas, sin cambiar la consulta.
- Mensajes en la Actividad:
  - PXP: 'Orden de pago cancelada por la cancelación del pedido PVEN-…'
  - VEN: 'Orden de pago PXP-… cancelada (pendiente: $1.062.523)'
- Autor: quien cancela.
```

**Pruebas (diseño):**

```text
En backend/tests/test_orden_de_pago_pxp.py:
- test_cancelar_el_pedido_cancela_su_pxp_pendiente: crea un PVEN y su PXP con el endpoint crear-pxp. Toma n0 = GET /ventas/stats data.pxp_pendiente. Hace PATCH /pedidos/{id} {'estado':'CANCELADO', 'cancellation_reason':'Cliente desistió', 'updated_by':'asesor@test'}. Afirma PaymentPending.estado == 'CANCELADA' y stats.pxp_pendiente == n0-1. Afirma que las actividades VEN incluyen 'PXP_CANCELADA' con '$1.062.523'. Afirma un ActivityLog PXP ESTADO_CHANGED PENDIENTE→CANCELADA.
- test_cancelar_no_toca_una_pxp_pagada: inserta PaymentPending(estado='PAGADA'). PATCH a CANCELADO. Afirma que sigue PAGADA y que hay un renglón VEN 'PXP_REVISAR'.
- test_cancelar_por_la_ruta_fase4_tambien_cancela_la_pxp: SaleOrder en estado 'CONFIRMADO' (transición permitida por ALLOWED_TRANSITIONS_SALE_ORDER) sin líneas, y PXP PENDIENTE. POST /ventas/pedidos/{id}/cancelar {'motivo':'Cliente desistió'} con admin_token. Afirma 200 y PXP CANCELADA.
- test_editar_un_pedido_sin_cancelarlo_no_toca_la_pxp: PATCH {'notas':'x'}. Afirma que la PXP sigue PENDIENTE.

FRONTEND: npx tsc --noEmit.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
Puede haber PXP PENDIENTE de pedidos que ya están cancelados. Consulta de solo lectura:
SELECT p.numero, v.numero, p.monto_pendiente FROM payment_pendings p JOIN sale_orders v ON v.id=p.ven_id WHERE v.estado='CANCELADO' AND p.estado='PENDIENTE';
Con autorización: UPDATE payment_pendings SET estado='CANCELADA', updated_at=now(), notas=coalesce(notas,'')||' Cancelada: el pedido ya estaba cancelado' WHERE id IN (...). Además, un renglón de Actividad por cada una.
```

**Riesgos:**

```text
- cancel_sale_order de fase4 hoy responde 422 para los estados que crea la conversión (PENDIENTE_COMPRA, EN_PROCESO, LISTO_ENTREGA no están en ALLOWED_TRANSITIONS_SALE_ORDER, fase4:156-168). Este arreglo no lo cambia; el botón de la UI usa el PATCH.
- El PATCH de cancelación sigue sin liberar reservas ni líneas y sin calcular el saldo a favor del anticipo verificado. Eso queda fuera de este grupo y debe tratarlo el grupo de 'cancelar PVEN y crear otro'.
```

**Archivos:** `backend/app/core/ventas_dinero.py`, `backend/app/api/v1/erp_ventas.py`, `backend/app/api/v1/erp_ventas_fase4.py`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `backend/tests/test_orden_de_pago_pxp.py`


### H35+H48 — La nota de la solicitud llega a la cotización y al pedido

**Para el usuario:** En la Cotización y en el Pedido de Venta aparece ahora la nota que se escribió en la Solicitud, en un recuadro aparte titulado 'Nota de la solicitud'. La nota propia de la cotización se sigue viendo por separado, como 'Nota de la cotización'. Funciona también para las cotizaciones y pedidos que ya existen.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Si alguien edita la nota de la solicitud después, ¿qué se ve en la cotización y el pedido? → **La nota actual**

**Cambios (diseño):**

```text
Diseño: la nota de la SC NO se copia dentro de cot.notas ni de pedido.notas. Se lee en vivo desde la SC vinculada (sc_id) en el GET de detalle. Así no se mezcla con la nota de la COT (la Calculadora reescribe cot.notas, ver cotizacion-client.tsx:173/223) y funciona sin backfill para los documentos que ya existen. A propósito NO se tocan confirmar_solicitud (erp_ventas.py:741-755), create_cotizacion (:871) ni convertir_cotizacion_a_venta (erp_ventas_fase4.py:2805).

BACKEND, backend/app/api/v1/erp_ventas.py:
1) Helper nuevo junto a _int_or_none (~l.51): def _texto_o_none(v): return (v or '').strip() or None si v es str; si no, None.
2) get_cotizacion (l.886-901): después de `d = _cot_dict(cot)` (l.896), agregar `d["sc_notas"] = _texto_o_none(db.query(CustomerRequest.notas).filter(CustomerRequest.id == cot.sc_id).scalar()) if cot.sc_id else None`.
3) get_pedido (l.1385-1400): después de `d = _ven_dict(v)` (l.1395), agregar `d["sc_notas"]` (igual, con v.sc_id) y `d["cot_notas"] = _texto_o_none(db.query(SalesQuotation.notas).filter(SalesQuotation.id == v.cot_id).scalar()) if v.cot_id else None`.
No se tocan _cot_dict ni _ven_dict, para no meter N+1 en los listados.

FRONTEND:
4) frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx:593-598: reemplazar el bloque 'Notas' por un contenedor `space-y-3 mb-10`, que se muestra si hay sc_notas o notas, con dos recuadros:
   (a) si cotizacion.sc_notas: estilo ámbar igual al de la SC (bg-amber-50 border-amber-100; título text-amber-700 'Nota de la solicitud'; texto text-amber-900 whitespace-pre-wrap).
   (b) si cotizacion.notas: el recuadro azul actual, con el título cambiado de 'Notas' a 'Nota de la cotización' y whitespace-pre-wrap.
5) frontend/src/app/dashboard/ventas/venta/[id]/page.tsx: junto a `const actividades` (l.325) calcular notaSolicitud=(pedido?.sc_notas||'').trim(), notaCotizacion=(pedido?.cot_notas||'').trim(), notaPedido=(pedido?.notas||'').trim(), mostrarNotaPedido = !!notaPedido && notaPedido !== notaCotizacion. En l.582-601:
   - Cambiar la condición a (notaSolicitud||notaCotizacion||mostrarNotaPedido||pedido?.direccion_entrega) && !isEditMode.
   - Reemplazar el bloque 'Notas' (l.592-599) por una columna `space-y-3` (col-span-2 si no hay dirección) con hasta 3 recuadros, usando las mismas clases de label y caja que hoy: 'Nota de la solicitud', 'Nota de la cotización' y 'Notas del pedido' (este último solo si mostrarNotaPedido).
   - El formulario de edición (l.367, l.518) no cambia: sigue editando pedido.notas.
```

**Comportamiento esperado:**

```text
- GET /ventas/cotizaciones/{id} devuelve además `sc_notas`: la nota actual de la SC vinculada, o null si no hay SC o la nota está vacía o solo tiene espacios.
- GET /ventas/pedidos/{id} devuelve además `sc_notas` y `cot_notas`, con la misma regla.
- Detalle COT: 'Nota de la solicitud' (ámbar) y 'Nota de la cotización' (azul), cada una solo si tiene texto.
- Detalle PVEN: 'Nota de la solicitud', 'Nota de la cotización' y 'Notas del pedido'. 'Notas del pedido' solo aparece si la nota del pedido es distinta de la de la cotización. Como al crear el PVEN se copia la nota de la COT (fase4:2805), sin esta regla se vería repetida. Si la nota del PVEN se editó, o el pedido no viene de una COT (PWEB), sí aparece.
- La nota de la SC nunca se escribe en cot.notas ni en pedido.notas, y no llega al cliente: confirmacion_publica.py no expone notas.
- Si alguien edita después la nota de la SC, la COT y el PVEN muestran la versión nueva, porque la nota se lee en vivo.
- Una segunda COT creada para la misma SC (decisión 'rechazada o eliminada → otra cotización') también muestra la nota de la SC.
```

**Pruebas (diseño):**

```text
Nuevo backend/tests/test_notas_solicitud_en_cotizacion_y_pedido.py, con el estilo de test_solicitud_productos_para_cotizar.py (helper _sc(db, numero, user_admin, **campos), auth(token), LINEA):
1) test_la_cotizacion_creada_desde_la_sc_muestra_la_nota_de_la_solicitud_aparte. Preparación: SC 'SC-NOTA001', estado CONFIRMADA, gate1_confirmed_at=utcnow, productos=[LINEA], notas='Cliente prefiere color gris'. POST /solicitudes/{id}/confirmar. Afirma: 200, el GET /cotizaciones/{cot_id} trae data['sc_notas']=='Cliente prefiere color gris' y data['notas'] is None (no se mezclan).
2) test_el_pedido_muestra_la_nota_de_la_solicitud_y_la_de_la_cotizacion. Preparación: SC 'SC-NOTA002' con notas='Nota SC'; SalesQuotation 'COT-NOTA002' con sc_id, sc_numero, estado CONFIRMADA, gate2_confirmed_at=utcnow, total_cop=2000, subtotal_cop=2000, productos=[{'product_name':'Cuna','qty':2,'unit_price_cop':1000,'total_cop':2000}], notas='Nota COT'. POST /cotizaciones/{id}/confirmar {'user_name':'asesor@test'}. Afirma: GET /pedidos/{sale_order_id} trae sc_notas=='Nota SC', cot_notas=='Nota COT' y notas=='Nota COT'.
3) test_cotizacion_sin_solicitud_no_trae_nota_de_solicitud. Preparación: COT con sc_id=None. Afirma: sc_notas is None. Además, con una SC cuya nota es '   ', sc_notas is None.
4) test_cotizacion_creada_por_post_con_sc_id_tambien_muestra_la_nota. Preparación: POST /cotizaciones {'sc_id': sc.id, 'productos': [linea con precio], 'total_cop': 1000}. Afirma: el GET trae sc_notas == sc.notas y notas is None.
Frontend: `npx tsc --noEmit` en frontend/ sin errores. Prueba manual: abrir una COT nacida de una SC con nota (se ven 2 recuadros con sus títulos) y su PVEN (se ven 'Nota de la solicitud' y 'Nota de la cotización', sin 'Notas del pedido' duplicada). Editar la nota del PVEN y comprobar que aparece 'Notas del pedido'.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No aplica: no se copia nada. Las COT y PVEN existentes que tengan sc_id/cot_id muestran las notas en cuanto se despliega el cambio. Las COT sin sc_id (Cotizador Rápido sin SC) y los PVEN sin cot_id (PWEB) siguen sin nota de solicitud, como corresponde.
```

**Riesgos:**

```text
- Son 1 o 2 consultas escalares más por GET de detalle (por PK). El impacto es despreciable.
- Como la nota se lee en vivo, el PVEN no guarda una copia histórica de la nota de la SC. Si se quiere congelada, haría falta una columna nueva y una migración (ver la decisión pendiente).
- El orden de lectura de la COT cambia: lo primero que se ve es la nota de la SC.
- Otros grupos tocan la COT y el PVEN (cancelar el pedido y re-cotizar). Los bloques nuevos solo leen campos nuevos del GET, así que no deberían chocar. Conviene aplicar este cambio después de los commits pendientes de safe-return-to en venta/[id] y solicitud/[id] (hay hunks sin commitear de otra sesión).
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `backend/tests/test_notas_solicitud_en_cotizacion_y_pedido.py`


### H27+H39 — Canal registrado y correo de respaldo

**Para el usuario:** Al enviar una Solicitud o Cotización eliges WhatsApp, Email u Otro, y ese canal queda anotado en la Actividad, también en la Solicitud. Además siempre se intenta mandar el correo como respaldo, y la ventana del enlace te dice en verde si el correo salió o en ámbar por qué no salió. Si el correo no está configurado o el cliente no tiene correo, lo verás en pantalla. Desde el tablero del Hub ya no se pierde el enlace.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Al arrastrar una tarjeta en el tablero del Hub para enviarla al cliente, ¿te pregunta el canal? → **Sí, preguntar el canal**
- ¿Quieres el canal como dato fijo en la ficha de la solicitud, como en la cotización? → **No, basta con la actividad**

**Cambios (diseño):**

```text
BACKEND
1) backend/app/core/email.py: nueva función `smtp_configurado() -> bool`, que devuelve bool(SMTP_USER.strip() and SMTP_PASSWORD.strip()) leyendo os.environ. send_email (l.22-67) no cambia.
2) backend/app/api/v1/erp_ventas.py, helpers nuevos después de _log (l.107):
   - `CANALES_ENVIO = {"WhatsApp": "por WhatsApp", "Email": "por correo", "Otro": "por otro canal"}`.
   - `_canal_de_envio(body, customer_email) -> Optional[str]`: devuelve None si body.get('canal') viene vacío. Si no está en CANALES_ENVIO, HTTPException(422, 'Canal de envío no válido: usa WhatsApp, Email u Otro.'). Si es 'Email' y el cliente no tiene correo, HTTPException(400, 'El cliente no tiene correo registrado: elige WhatsApp u Otro, o agrega su correo antes de enviar.').
   - `_enviar_correo_confirmacion(destino, asunto, html) -> dict`. Usa `from app.core import email as correo` dentro de la función y llama a correo.smtp_configurado() / correo.send_email() por atributo, para que se pueda hacer monkeypatch. Devuelve {enviado, destino, motivo, mensaje}, con motivo ∈ {None, 'SIN_CORREO_CLIENTE', 'CORREO_NO_CONFIGURADO', 'FALLO_ENVIO'} (mensajes exactos en 'comportamiento').
   - `_detalle_envio(canal, correo_res) -> list`: si hay canal, {'etiqueta':'Canal de envío','despues':canal}; siempre {'etiqueta': 'Correo' si canal=='Email' si no 'Correo de respaldo', 'despues': correo_res['mensaje']}. Sin clave 'campo', para que CambiosDeActividad (flujo.tsx:145-167) no pinte '—' tachado.
3) enviar_solicitud_para_confirmacion (l.623-678):
   - Después del chequeo de productos (l.645-647) y ANTES de revoke_pending_tokens (l.661): `canal = _canal_de_envio(body, sc.customer_email)`.
   - Después del commit de l.669, primero `correo_res = _enviar_correo_confirmacion(sc.customer_email, ...)`, con el mismo asunto y HTML de l.675-676. Esto reemplaza el `if sc.customer_email: send_email(...)` de l.674-676.
   - Luego el _log (l.670-672 se mueve aquí). Descripción: base actual + (f' {CANALES_ENVIO[canal]}' si canal). user_name = body.get('user_name') or getattr(user,'email',None). extra_data = {'canal': canal, 'correo': {k: correo_res[k] for k in ('enviado','destino','motivo')}, 'cambios': _detalle_envio(canal, correo_res)}.
   - La respuesta (l.678) agrega 'canal': canal y 'correo': correo_res.
4) enviar_cotizacion_para_confirmacion (l.1126-1202): lo mismo. `canal = _canal_de_envio(body, cot.customer_email)` después del chequeo de PVEN (l.1157-1158). `if canal: cot.canal_envio = canal` antes del commit de l.1182. El correo pasa a ir antes del _log (reemplaza l.1198-1200). El _log de l.1194-1196 usa la descripción con el canal, extra_data y el fallback de user_name. La respuesta de l.1202 agrega canal y correo.

FRONTEND
5) Nuevo frontend/src/lib/aviso-correo.js: `export function avisoCorreo(correo, canal)` devuelve null o {tono:'ok'|'alerta', texto}. Es lógica pura, igual que pricing.js.
6) frontend/src/app/dashboard/ventas/flujo.tsx, EnlaceConfirmacionModal (l.82-138): props opcionales nuevas `correo?: {enviado:boolean; destino?:string|null; motivo?:string|null; mensaje?:string} | null` y `canal?: string | null`. Antes del <p> de l.110, un recuadro: emerald (bg-emerald-50 border-emerald-200 text-emerald-800) si tono ok, o amber (bg-amber-50 border-amber-200 text-amber-800) si alerta, con aviso.texto.
7) frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx, ChannelModal (l.425-472): prop nueva `customerEmail?: string | null`. El botón Email se deshabilita y se rotula 'Email (sin correo)' si no hay correo, con el mismo patrón que WhatsApp (l.436-448). Debajo de las opciones, un texto: si hay correo, 'Además se enviará un correo de respaldo a {customerEmail} con el enlace.'; si no, 'El cliente no tiene correo registrado: no se enviará correo de respaldo.'
8) frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx: en l.295 el body pasa a `{ user_name: currentUser, canal: selectedChannel }`. Estados nuevos confirmCorreo y confirmCanal: setConfirmCorreo(d?.correo ?? null) y setConfirmCanal(selectedChannel) ANTES del setSelectedChannel(null) de l.308. Pasar correo/canal al EnlaceConfirmacionModal (l.878) y customerEmail={solicitud?.customer_email} al ChannelModal (l.866-874). Texto de WhatsApp (l.300-302): 'Hola, aquí está tu solicitud … Confírmala aquí: …'.
9) frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx: ELIMINAR el PATCH de canal_envio (l.173-176) y su comentario (l.165-172), porque el canal ahora viaja en el POST y queda atómico con el envío, sin un renglón 'Cotización actualizada: Canal de envío' extra. El POST de l.177-180 pasa a `{user_name: currentUser, canal: selectedChannel}`. Mismos estados confirmCorreo/confirmCanal, con props al modal (l.899) y customerEmail al ChannelModal (l.877-884). Texto de WhatsApp (l.188-190) con tildes.
10) frontend/src/app/dashboard/ventas/page.tsx (Hub), l.431-433 y l.452-454: guardar la respuesta (`const d = await apiFetch(...)`). Estado nuevo `hubEnlace: {documento, link, correo, color} | null`. Si d.link_confirmacion existe, setHubEnlace({documento: `la cotización ${item?.numero||id}` o `la solicitud …`, link, correo: d.correo, color: 'blue' para COT o 'indigo' para SC}). Toast ok: 'Enviada para confirmación del cliente'. El catch de error no cambia. Render: `{hubEnlace && <EnlaceConfirmacionModal … correo={hubEnlace.correo} canal={null} onClose={()=>setHubEnlace(null)} />}` junto al Toast (l.518). Importar EnlaceConfirmacionModal desde './flujo' (l.18).
11) frontend/package.json, script test: agregar `&& node tests/test_aviso_correo.mjs`. Ojo: hay un hunk sin commitear de otra sesión en este archivo; stagear solo el propio.
```

**Comportamiento esperado:**

```text
- POST /solicitudes/{id}/enviar-confirmacion y POST /cotizaciones/{id}/enviar-confirmacion aceptan `canal` opcional ∈ {'WhatsApp','Email','Otro'}.
  - Cualquier otro valor: 422 'Canal de envío no válido: usa WhatsApp, Email u Otro.'
  - canal 'Email' con cliente sin correo: 400 'El cliente no tiene correo registrado: elige WhatsApp u Otro, o agrega su correo antes de enviar.' En ambos casos la validación ocurre antes de revocar o crear tokens, así que no cambia nada.
- El correo se intenta SIEMPRE que el cliente tenga correo, sea cual sea el canal (decisión del usuario: respaldo).
- Resultado `correo` en la respuesta, con estos mensajes exactos:
  - enviado: 'Correo enviado a {destino}.'
  - SIN_CORREO_CLIENTE: 'No se envió correo: el cliente no tiene correo registrado.'
  - CORREO_NO_CONFIGURADO: 'No se envió correo: el envío de correos no está configurado en el sistema.'
  - FALLO_ENVIO: 'No se pudo enviar el correo a {destino}: falló el servidor de correo.'
- Actividad (SC y COT): ESTADO_CHANGED con descripción 'Enviada para confirmación del cliente por WhatsApp' / '… por correo' / '… por otro canal'. Sin canal (Hub) queda sin sufijo. En reenvío de SC: 'Enlace de confirmación reenviado al cliente por …'. Debajo aparecen 'Canal de envío: WhatsApp' y 'Correo de respaldo: <mensaje>' (o 'Correo: …' si el canal es Email). extra_data guarda canal y {enviado, destino, motivo}. user_name, si no llega, es el email del usuario autenticado.
- COT: canal_envio se guarda en el mismo commit que PENDIENTE_CONFIRMACION, y ya no se hace el PATCH previo.
- Modal del enlace (avisoCorreo):
  - enviado: tono 'ok', 'Correo enviado a x@y.' Si el canal no es Email, se añade ' (respaldo del envío por WhatsApp/otro canal)'.
  - no enviado: tono 'alerta', mensaje + siguiente paso según canal:
    - Email o sin canal: 'El cliente todavía no recibió el enlace: cópialo y envíaselo por otro medio.'
    - WhatsApp: 'Revisa que el mensaje de WhatsApp haya salido con el enlace.'
    - Otro: 'Copia el enlace y envíaselo al cliente.'
- ChannelModal: Email deshabilitado si el cliente no tiene correo, más el aviso del correo de respaldo.
- Hub: arrastrar una SC o COT a la columna de envío muestra ahora el modal con el enlace y el aviso del correo, en vez de solo un toast.
- Hoy SMTP no está configurado en backend/.env, así que cada envío mostrará el aviso ámbar 'no está configurado'. Ese es el comportamiento pedido.
```

**Pruebas (diseño):**

```text
Nuevo backend/tests/test_envio_confirmacion_canal_y_correo.py, con el estilo de test_solicitud_productos_para_cotizar.py (_sc con advisor_user_id=user_admin.id, estado ASIGNADA, productos=[LINEA]). En TODAS las pruebas hay que hacer monkeypatch de 'app.core.email.send_email' con un fake que registre las llamadas, para no mandar correos reales si algún día SMTP queda configurado.
1) test_enviar_sc_por_whatsapp_registra_el_canal_y_manda_el_correo_de_respaldo. Preparación: SC con customer_email='cliente@test.com'; monkeypatch smtp_configurado→True y send_email→fake que devuelve True. POST {'user_name':'asesor@test','canal':'WhatsApp'}. Afirma: 200; json['canal']=='WhatsApp'; json['correo']=={'enviado':True,'destino':'cliente@test.com','motivo':None,'mensaje':'Correo enviado a cliente@test.com.'}; el fake se llamó 1 vez con to=='cliente@test.com'; la última actividad ESTADO_CHANGED tiene description=='Enviada para confirmación del cliente por WhatsApp', extra_data['canal']=='WhatsApp' y etiquetas de extra_data['cambios']==['Canal de envío','Correo de respaldo'].
2) test_enviar_sc_sin_smtp_avisa_que_el_correo_no_esta_configurado. Preparación: monkeypatch.delenv('SMTP_USER', raising=False) y lo mismo para SMTP_PASSWORD; canal 'Otro'. Afirma: correo.enviado False, motivo 'CORREO_NO_CONFIGURADO'; link_confirmacion presente; estado PENDIENTE_CONFIRMACION.
3) test_enviar_sc_cliente_sin_correo_no_intenta_enviar. Preparación: customer_email=None, canal 'WhatsApp'. Afirma: motivo 'SIN_CORREO_CLIENTE' y el fake no se llamó.
4) test_enviar_sc_por_email_sin_correo_del_cliente_se_rechaza_sin_tocar_nada. Preparación: canal 'Email' sin correo. Afirma: 400; sc.estado sigue ASIGNADA; no existe DocumentConfirmationToken para la SC.
5) test_enviar_sc_con_canal_invalido_es_422. Preparación: canal 'Fax'. Afirma: 422.
6) test_enviar_sc_sin_canal_como_el_hub_sigue_funcionando. Preparación: body {}. Afirma: 200; json['canal'] is None; description=='Enviada para confirmación del cliente'; user_name contiene '@'.
7) test_enviar_cot_guarda_canal_envio_y_un_solo_renglon_de_actividad. Preparación: SalesQuotation BORRADOR con productos, total_cop=1000, customer_email; fake True. POST canal 'WhatsApp'. Afirma: cot.canal_envio=='WhatsApp'; actividades == [('ESTADO_CHANGED','Enviada para confirmación del cliente por WhatsApp')] (sin UPDATED); json['correo']['enviado'] True.
8) test_fallo_de_smtp_se_reporta_como_fallo_envio. Preparación: smtp_configurado→True, send_email→False. Afirma: motivo 'FALLO_ENVIO'.

Revisión: test_cotizacion_canal_envio.py sigue pasando (el PATCH de canal_envio no se toca). test_confirmacion_cotizacion.py y test_confirmacion_solicitud.py no mandan canal y siguen compatibles.

Frontend: nuevo frontend/tests/test_aviso_correo.mjs (estilo test_pricing.mjs, con node:assert/strict):
(a) avisoCorreo(null)===null.
(b) enviado+WhatsApp → tono 'ok', con 'Correo enviado a a@b.co' y 'WhatsApp' en el texto.
(c) CORREO_NO_CONFIGURADO+Email → 'alerta', con 'no está configurado' y 'todavía no recibió'.
(d) SIN_CORREO_CLIENTE+WhatsApp → 'alerta', con 'mensaje de WhatsApp'.
Correr `npm test` y `npx tsc --noEmit`. Prueba manual: enviar una SC por WhatsApp sin SMTP; se ve el aviso ámbar y la Actividad muestra canal y correo. Arrastrar en el Hub; se abre el modal con el enlace.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No aplica. Los envíos anteriores no guardaron el canal ni el resultado del correo, y no hay forma de reconstruirlos. Las COT conservan su canal_envio existente.
```

**Riesgos:**

```text
- El SMTP sigue siendo síncrono dentro del request (timeout de 10 s, email.py:60). Cuando se configure, un servidor lento retrasa la respuesta. No se cambia aquí.
- Una COT en PENDIENTE_CONFIRMACION sigue sin poder reenviarse (erp_ventas.py:1151). Con el modal del Hub el enlace ya no se pierde, pero el reenvío de COT queda fuera de alcance.
- Al quitar el PATCH de canal_envio en la COT, la Actividad deja de mostrar el renglón 'Cotización actualizada: Canal de envío'. Ahora el canal aparece dentro del renglón del envío.
- El correo del cliente queda escrito en extra_data y en la Actividad (uso interno).
- solicitud/[id]/page.tsx, venta/[id]/page.tsx y package.json tienen hunks sin commitear de otra sesión (safe-return-to); stagear solo lo propio.
```

**Archivos:** `backend/app/core/email.py`, `backend/app/api/v1/erp_ventas.py`, `frontend/src/lib/aviso-correo.js`, `frontend/src/app/dashboard/ventas/flujo.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/package.json`, `frontend/tests/test_aviso_correo.mjs`, `backend/tests/test_envio_confirmacion_canal_y_correo.py`


### H7+H41 — Tildes y estados legibles

**Para el usuario:** Los mensajes y la Actividad dejan de mostrar palabras sin tilde ('Cotizacion', 'Lineas') y estados en código ('PENDIENTE_CONFIRMACION'). En su lugar verás 'Cotización', 'Líneas' y nombres como 'Esperando confirmación del cliente'. En la línea de tiempo de la Cotización los cambios de estado salen como etiquetas de color, igual que en la Solicitud. Un script corrige también las actividades viejas ya guardadas, con respaldo para poder deshacerlo.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Tipos y modalidades también salen sin tilde ("Cotizacion de Producto", "Credito 30 dias"). ¿Los corrijo ahora mostrando una etiqueta con tilde? → **Sí, ahora**

**Cambios (diseño):**

```text
BACKEND
1) Nuevo backend/app/core/textos_actividad.py, con lógica pura:
   - ETIQUETAS_ESTADO:
     - SC: BORRADOR 'Borrador', ASIGNADA 'Asignada', PENDIENTE_CONFIRMACION 'Pendiente de confirmación', COTIZADA 'Cotizada', EN_ESPERA_CONFIRMACION 'En espera de confirmación', CONFIRMADA 'Confirmada', RECHAZADA 'Rechazada', VENCIDA 'Vencida', CANCELADA 'Cancelada', 'N/A_SOPORTE' 'Soporte'.
     - COT: BORRADOR 'Borrador', ENVIADA 'Enviada al cliente', PENDIENTE_CONFIRMACION 'Esperando confirmación del cliente', CONFIRMADA 'Confirmada', RECHAZADA 'Rechazada', VENCIDA 'Vencida'.
     - VEN: PENDIENTE_COMPRA 'Pendiente de compra', PENDIENTE_PAGO 'Pendiente de pago', EN_PROCESO 'En proceso', LISTO_ENTREGA 'Listo para entrega', ENTREGADO 'Entregado', FACTURADO 'Facturado', CANCELADO 'Cancelado'.
   - `etiqueta_estado(entidad, estado) -> str`: '' si viene vacío; la etiqueta del mapa; si no está, respaldo: código con '_'→' ', en minúsculas y con la primera letra en mayúscula (PXP 'PAGADO'→'Pagado').
   - `corregir_descripcion_historica(entidad, accion, descripcion) -> str | None`. Solo actúa si entidad ∈ {SC,COT,VEN,PXP} y accion ∈ {CREATED, ESTADO_CHANGED, CONVERTIDA_A_VENTA, RESTORED}; nunca toca NOTE_ADDED, CHATTER ni CANCELLED, que son texto del usuario.
     - Textos fijos: 'Solicitud cotizada - Cotizacion creada', 'Solicitud confirmada - Cotizacion creada' y 'Cotizacion confirmada - Pedido de Venta creado' pasan a llevar 'Cotización' (los dos últimos son históricos, de commits viejos).
     - Regex `^Cotizacion (\S+) creada( desde \S+)?$` → 'Cotización …'.
     - Regex `^Cotizacion (\S+) convertida al pedido (\S+)\. Lineas: (\d+)\.$` → 'Cotización … Líneas: …'.
     - Si ESTADO_CHANGED: `^Estado cambiado a (?P<codigo>[A-Z][A-Z/_]*[A-Z])(?P<resto>(?: \(.*\)|:.*)?)$` → 'Estado cambiado a '+etiqueta_estado(entidad,codigo)+resto.
     - Si PXP: `^Pago (\S+) cambiado a ([A-Z][A-Z_]*[A-Z])$`.
     - Si RESTORED: `^Solicitud restaurada a ([A-Z][A-Z_]*[A-Z])$`.
     - Devuelve None si no aplica o si el resultado es igual. Es idempotente: 'Borrador' ya no calza con el patrón de código en mayúsculas y 'Cotización' no calza con 'Cotizacion '.
2) backend/app/api/v1/erp_ventas.py: `from app.core.textos_actividad import etiqueta_estado`. Cambios línea por línea:
   - l.74: '…guardar la cotización.'
   - l.479: 'El estado Confirmada solo se alcanza cuando el cliente confirma vía el enlace enviado (no se puede forzar manualmente).'
   - l.567: f'Estado cambiado a {etiqueta_estado("SC", sc.estado)}'
   - l.576: 'Estado cambiado a Asignada (asesor asignado)'
   - l.581: 'Estado cambiado a Borrador (asesor retirado)'
   - l.585: etiqueta_estado('SC', sc.estado)
   - l.638: '(estado actual: {etiqueta})'
   - l.694: f'No se puede confirmar en estado {etiqueta}'
   - l.763: 'Solicitud cotizada - Cotización creada'
   - l.767: f'Cotización {cot.numero} creada desde {sc.numero}'
   - l.881: f'Cotización {cot.numero} creada'
   - l.891, 933, 1150, 1214, 1271: 'Cotización no encontrada'
   - l.1087: etiqueta_estado('COT', cot.estado)
   - l.1103: 'Estado cambiado a Borrador (la cotización fue editada…)'
   - l.1152 y l.1232: '(estado actual: {etiqueta COT})'
   - l.1337: 'número de pedido'
   - l.1497: etiqueta_estado('VEN', v.estado)
   - l.1588: f'Pago {p.numero} cambiado a {etiqueta_estado("PXP", p.estado)}'
   - l.1964 (análisis IA): 'Estado: {etiqueta SC}'
   - l.1971: 'ítem(s)'
   - l.2005: 'Soporte Técnico no usa este flujo de cancelación; cambia su estado de soporte en su lugar'
   - l.2079: f'Solicitud restaurada a {etiqueta_estado("SC", estado_final)}'
   NO tocar los valores de dato 'Cotizacion de Producto', 'Soporte Tecnico' ni 'Devolucion de Producto' (l.179, 358, 378, 1829, 1840, 1900, 1935, 1982, 2000), porque se usan como clave. Las columnas old_estado/new_estado siguen guardando el código.
3) backend/app/api/v1/erp_ventas_fase4.py (importar etiqueta_estado):
   - l.2707: f'Cotización {cot_id} no encontrada.'
   - l.2713: f'Cotización en estado {etiqueta COT} no puede ser convertida a pedido de venta.' (conserva el substring que afirma test_fase5_integracion_erp.py:409)
   - l.2724: 'Cotización …' (conserva 'otra clave de idempotencia', que afirma test_fase5_integracion_erp.py:441)
   - l.2735: 'Cotización ya convertida previamente…'
   - l.2766: f'Cotización en estado {etiqueta} no tiene una confirmación…'
   - l.2832: notes 'Anticipo registrado por conversión de la cotización {n}' (coordinar con N1, que reescribe este bloque)
   - l.2908 y l.2969: 'Auto-reserva por conversión de la cotización {n}'
   - l.3001: f'Cotización {cot.numero} convertida al pedido {new_so.numero}. Líneas: {len(created_lines)}.'
   - l.3031: f'Cotización {cot.numero} convertida exitosamente al pedido {new_so.numero}.'
   confirmacion_publica.py: no tiene textos visibles sin tilde (solo el logger de l.189, opcional).
4) Nuevo backend/scripts/corregir_textos_actividad.py, con el patrón de scripts/backfill_cotizacion_sc_numero.py (sys.path, SessionLocal, _mask_url):
   - `corregir(db, aplicar=False, ids=None, tabla_respaldo='activity_logs_respaldo_textos') -> dict`.
   - tabla_respaldo se valida con ^[a-z_][a-z0-9_]*$.
   - Selecciona ActivityLog (id, entity_type, action, description) con entity_type ∈ {SC,COT,VEN,PXP}, acción del sistema y description no nula (y id ∈ ids si se pasa), y calcula corregir_descripcion_historica.
   - Si aplicar: `CREATE TABLE IF NOT EXISTS <tabla> (id INTEGER PRIMARY KEY, description_original TEXT NOT NULL, description_nueva TEXT NOT NULL, corregido_at TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc'))`. Por fila: `INSERT … ON CONFLICT (id) DO NOTHING` y `UPDATE activity_logs SET description=:nueva WHERE id=:id AND description=:original`. Todo en UNA transacción y commit al final; ante cualquier error, rollback.
   - Si no aplica: rollback.
   - Devuelve {candidatas, corregidas, ejemplos}.
   - main(): DRY-RUN por defecto. `--aplicar` escribe. Imprime la BD destino enmascarada, el conteo por tipo de corrección y hasta 50 ejemplos 'antes → después'. El docstring incluye el SQL de restauración: `UPDATE activity_logs a SET description = r.description_original FROM activity_logs_respaldo_textos r WHERE a.id = r.id AND a.description = r.description_nueva;`

FRONTEND
5) frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx:
   - Agregar EstadoBadge al import de '../cotizacion-client' (l.14-17).
   - l.843-845: `<p className="flex items-center gap-1.5 mb-3 flex-wrap"><EstadoBadge estado={a.old_estado} /><ArrowRight size={10} className="text-slate-300" /><EstadoBadge estado={a.new_estado} /></p>`, igual que solicitud/[id]/page.tsx:812-815.
   - l.825: 'Línea temporal'.
   - l.859: 'todavía'.
6) cotizacion-client.tsx:22: 'Esp. confirmación'. solicitud-client.tsx:43: 'Pend. confirmación'; l.45: 'En espera de confirmación'. Solo cambian las etiquetas; las claves no.
7) venta/[id]/page.tsx: l.742 'Línea temporal'; l.763 'todavía'.
```

**Comportamiento esperado:**

```text
- Las actividades nuevas se guardan con tildes ('Cotización COT-… creada desde SC-…', '… Líneas: 2.') y con el estado legible en el título: 'Estado cambiado a Rechazada', 'Estado cambiado a Asignada (asesor asignado)', 'Pago PXP-… cambiado a Pagado', 'Solicitud restaurada a Asignada'.
- old_estado/new_estado siguen siendo códigos. Las líneas de tiempo de SC y COT los pintan como etiquetas de color (EstadoBadge).
- Si aparece un código de estado nuevo que no está en el mapa, se muestra legible por el respaldo ('PENDIENTE_ALGO'→'Pendiente algo'). Nunca sale el código crudo.
- Los mensajes de error de esos endpoints también salen con tilde y con el estado legible.
- Script:
  - Solo modifica textos generados por el sistema (patrones anclados y acciones del sistema). Nunca toca notas, chatter ni razones de cancelación escritas por usuarios.
  - Sin --aplicar, solo reporta.
  - Con --aplicar, respalda cada fila antes de cambiarla.
  - Es idempotente: una segunda corrida encuentra 0 candidatas.
  - El UPDATE exige que el texto siga igual que cuando se leyó.
```

**Pruebas (diseño):**

```text
Nuevo backend/tests/test_textos_actividad.py, con el estilo de test_actividad_cambios_documentos.py: primero las pruebas puras sin DB y luego las de API con _actividades(app_client, admin_token, ruta, id).
1) test_etiqueta_estado_es_legible_y_tiene_respaldo. Afirma: ('COT','PENDIENTE_CONFIRMACION')→'Esperando confirmación del cliente'; ('SC','N/A_SOPORTE')→'Soporte'; ('VEN','PENDIENTE_ALGO')→'Pendiente algo'; ('PXP','PAGADO')→'Pagado'; (…, None)→''.
2) test_corregir_descripcion_historica_solo_textos_del_sistema. Parametrizada con:
   - ('COT','CREATED','Cotizacion COT-1 creada desde SC-1')→'Cotización COT-1 creada desde SC-1'
   - ('COT','CONVERTIDA_A_VENTA','Cotizacion COT-1 convertida al pedido PVEN-1. Lineas: 2.')→'Cotización COT-1 convertida al pedido PVEN-1. Líneas: 2.'
   - ('SC','ESTADO_CHANGED','Estado cambiado a ASIGNADA (asesor asignado)')→'Estado cambiado a Asignada (asesor asignado)'
   - ('COT','ESTADO_CHANGED','Estado cambiado a PENDIENTE_CONFIRMACION')→'Estado cambiado a Esperando confirmación del cliente'
   - ('SC','ESTADO_CHANGED','Solicitud confirmada - Cotizacion creada')→'… Cotización creada'
   - Casos que devuelven None: ('COT','NOTE_ADDED','Cotizacion revisada'), ('SC','CANCELLED','Cancelada: Cotizacion cara'), ('PEC','ESTADO_CHANGED','Estado cambiado a BORRADOR') y ('COT','ESTADO_CHANGED','Estado cambiado a Borrador').
3) test_corregir_descripcion_historica_es_idempotente. Afirma: aplicarla a cada resultado del caso 2 devuelve None.
4) test_crear_la_cotizacion_desde_la_sc_registra_textos_con_tilde. Preparación: SC 'SC-TXT001' CONFIRMADA, gate1_confirmed_at, productos y asesor. POST /solicitudes/{id}/confirmar. Afirma: la actividad ESTADO_CHANGED de la SC == 'Solicitud cotizada - Cotización creada' y la CREATED de la COT == f'Cotización {numero} creada desde SC-TXT001'.
5) test_convertir_la_cotizacion_registra_lineas_con_tilde. Preparación: igual que test_crear_el_pedido_desde_la_cotizacion_deja_su_registro_en_el_pedido. Afirma: CONVERTIDA_A_VENTA calza con r'^Cotización COT-ACT\S+ convertida al pedido PVEN-\S+\. Líneas: 1\.$' y el 'message' de la respuesta empieza por 'Cotización'.
6) test_cambiar_el_estado_de_la_cot_se_describe_con_nombre_legible. Preparación: COT BORRADOR; PATCH {'estado':'RECHAZADA'}. Afirma: description=='Estado cambiado a Rechazada' y (old_estado,new_estado)==('BORRADOR','RECHAZADA').
7) test_asignar_asesor_describe_el_estado_legible. Preparación: SC BORRADOR; PATCH con advisor_user_id. Afirma: ESTADO_CHANGED description=='Estado cambiado a Asignada (asesor asignado)'.
8) test_script_corrige_respalda_y_es_idempotente (db). Preparación: insertar 4 ActivityLog (COT CREATED sin tilde, COT NOTE_ADDED 'Cotizacion revisada con el cliente', SC ESTADO_CHANGED 'Estado cambiado a ASIGNADA (asesor asignado)', COT CONVERTIDA_A_VENTA con 'Lineas'). `from scripts.corregir_textos_actividad import corregir` y corregir(db, aplicar=True, ids=ids, tabla_respaldo='activity_logs_respaldo_textos_test'). Afirma: corregidas==3; NOTE_ADDED intacta; la tabla de respaldo tiene los 3 originales y no tiene la nota; una segunda corrida da corregidas==0. En finally: DROP TABLE IF EXISTS de la tabla de prueba.
9) test_script_en_modo_reporte_no_escribe. Afirma: aplicar=False devuelve candidatas==1 y la fila sigue igual.
Estas pruebas filtran siempre por ids propios: nunca corren el script sobre toda la tabla de la base compartida.
Frontend: `npx tsc --noEmit`. Prueba manual: la línea de tiempo de una COT muestra 'Borrador → Esp. confirmación' como etiquetas; el título de la PVEN dice 'Estado cambiado a En proceso'.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
Sí, por decisión del usuario. Se corrige con backend/scripts/corregir_textos_actividad.py, que respalda en la tabla activity_logs_respaldo_textos (id, description_original, description_nueva). Procedimiento:
1) Respaldo adicional opcional: `pg_dump -t activity_logs` de la base destino.
2) `python scripts/corregir_textos_actividad.py` (dry-run) en erp_test, y mostrar el conteo y los ejemplos al usuario.
3) Con su OK, `--aplicar` en erp_test y verificar en la UI la Actividad de una COT vieja.
4) Al promover a producción, repetir dry-run → OK del usuario → --aplicar. Es una escritura en BD y requiere autorización explícita en cada entorno.
5) Para deshacer, usar el SQL de restauración del docstring. La tabla de respaldo se puede borrar cuando el usuario lo decida.
Cubre: 'Cotizacion' en CREATED, CONVERTIDA_A_VENTA y los ESTADO_CHANGED históricos ('Solicitud confirmada - Cotizacion creada', 'Cotizacion confirmada - Pedido de Venta creado'); 'Lineas'; los títulos 'Estado cambiado a CODIGO…' de SC/COT/VEN; 'Pago … cambiado a CODIGO'; y 'Solicitud restaurada a CODIGO'.
```

**Riesgos:**

```text
- Ningún test ni el frontend compara estos textos, salvo substrings que se conservan ('no puede ser convertida', 'otra clave de idempotencia').
- Si otro grupo agrega estados nuevos de COT (p. ej. CANCELADA), hay que añadirlos a ETIQUETAS_ESTADO y a ESTADOS de cotizacion-client.tsx. Mientras tanto, el respaldo los muestra legibles en el backend, pero EstadoBadge mostraría el código.
- La línea 2832 (nota del pago de anticipo) la reescribe N1; hay que aplicar la tilde en el texto final.
- El endpoint /actividad acepta un action arbitrario. Un usuario podría guardar texto libre con action ESTADO_CHANGED, pero el script solo reescribe tokens de código en MAYÚSCULAS con patrón anclado, así que el riesgo es mínimo.
- La tabla de respaldo queda en la base hasta que se borre.
- Los montos en la Actividad siguen con separador estadounidense ('$1,250,000', l.1546 y fase4). Queda fuera de este arreglo y lo ve el grupo de pesos.
```

**Archivos:** `backend/app/core/textos_actividad.py`, `backend/app/api/v1/erp_ventas.py`, `backend/app/api/v1/erp_ventas_fase4.py`, `backend/scripts/corregir_textos_actividad.py`, `backend/tests/test_textos_actividad.py`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`


### N3 — "Cancelar documento" cancela esa fila

**Para el usuario:** 'Cancelar documento' en el menú de una fila del Hub ahora cancela exactamente esa fila. Antes no hacía nada o cancelaba otras filas que estaban marcadas. Se abre una ventana que muestra qué se va a cancelar y pide el motivo. Al terminar dice cuáles se cancelaron y cuáles no, y por qué.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- ¿El motivo también es obligatorio al rechazar cotizaciones desde el Hub? → **Sí**

**Cambios (diseño):**

```text
FRONTEND frontend/src/app/dashboard/ventas/page.tsx

1. Eliminar handleBulkDelete (346-355). Agregar estado:
   - cancelacion: {ids:string[]} | null
   - motivoCancelacion: string
   - cancelando: boolean
   - resultadoLote: {titulo:string, fallidos:{numero:string,error:string}[]} | null (lo comparte N5)

2. abrirCancelacion(ids: string[]): setCancelacion({ids}), setMotivoCancelacion(''). No toca selectedIds.

3. confirmarCancelacion():
   - Recorre ordenParaCancelar(ids) (primero VEN, luego COT, luego SC), en serie y omitiendo los que tienen motivoNoCancelable(row).
   - row = allData.find(d => `${d.tipo}|${d.id}` === idStr).
   - SC: POST /ventas/solicitudes/${id}/cancelar con {razon: motivo}. Es la ruta real: deja la razón, la papelera y revoca tokens. Ya no se usa el PATCH estado CANCELADA.
   - COT: PATCH /ventas/cotizaciones/${id} con {estado:'RECHAZADA'}. Si responde bien, POST /ventas/cotizaciones/${id}/actividad con {action:'NOTE_ADDED', description:`Motivo del rechazo (Hub): ${motivo}`}, ignorando el error de esta nota.
   - VEN: PATCH /ventas/pedidos/${id} con {estado:'CANCELADO', cancellation_reason: motivo, cancelled_at: new Date().toISOString()}.
   - Cada resultado se guarda como {idStr, numero, ok, error: err.message}. Luego se llama resumenLote(resultados).
   - Si no hay fallidos: toast ok. Si hay: setResultadoLote.
   - setSelectedIds(prev => quitar SOLO los ids exitosos); los fallidos siguen marcados.
   - Cerrar el modal y llamar loadData().

4. Menú de fila (1003-1006): onClick={e=>{e.stopPropagation();abrirCancelacion([idStr]);}}. El texto pasa a 'Cancelar documento'. Se oculta si motivoNoCancelable(row) no es null.

5. Barra masiva (1093): onClick={()=>abrirCancelacion(Array.from(selectedIds))}.

6. handleDrop (392-462): después del chequeo de misma columna (400) agregar `if (col === 'Cancelado') { abrirCancelacion([idStr]); return; }` y quitar la entrada 'Cancelado' del mapa m (406). Así arrastrar al tablero tampoco cancela sin motivo.

7. Modal de '@/components/ui' (color rose, icono Trash2), renderizado al FINAL del div raíz, después del panel rápido (1101-1249), para quedar encima de él.
   - Título: 'Cancelar {numero}' con 1 documento, o 'Cancelar N documentos'.
   - Lista con tipo legible y efecto: SC 'La solicitud se cancela y pasa a la papelera (30 días)'; COT 'La cotización queda Rechazada'; VEN 'El pedido queda Cancelado'.
   - Los omitidos van en gris con su motivoNoCancelable.
   - textarea 'Motivo (mínimo 5 caracteres)'.
   - Footer: botón 'Volver' y Button variant='danger' 'Cancelar documentos', con loading={cancelando} y disabled si motivo.trim().length<5 o no queda nada por procesar.

8. Banner de resultadoLote entre la fila de búsqueda (689) y la tabla (692): caja rose con el título, lista 'NUMERO: mensaje del backend' y botón cerrar.

NUEVO frontend/src/lib/hub-ventas.js (JS puro, como busqueda.js, para probarlo con node):
- ordenParaCancelar(ids): orden estable VEN, COT, SC.
- motivoNoCancelable(row) → string | null:
  - SC CANCELADA: 'ya está cancelada'.
  - SC de Soporte Técnico (tipo_solicitud==='Soporte Tecnico' o estado 'N/A_SOPORTE'): 'es un ticket de soporte: se cierra desde su estado de soporte'.
  - COT RECHAZADA: 'ya está rechazada'.
  - VEN CANCELADO: 'ya está cancelado'.
  - VEN ENTREGADO/FACTURADO: 'ya fue entregado/facturado'.
- resumenLote(resultados, verbo) → {exitosos:n, fallidos:[{numero,error}], mensaje}.

frontend/package.json: agregar `node tests/test_hub_ventas.mjs` al script "test".
```

**Comportamiento esperado:**

```text
- La acción de fila nunca lee ni modifica la selección: siempre actúa sobre esa fila.
- Con nada marcado, el menú abre el modal. Antes no hacía nada.
- El motivo es obligatorio: mínimo 5 caracteres sin espacios al borde. Es la misma regla de /solicitudes/{id}/cancelar (CancelarSolicitudBody min_length=5) y de PVEN (N2).
- Orden de proceso: VEN, luego COT, luego SC. Si se marcan juntos la SC, su COT y su PVEN, se cancelan en el orden que exige la decisión del usuario (no cancelar una SC con cotización o pedido activos).
- Mensajes:
  - Todo bien: toast ok '1 documento cancelado' o 'N documentos cancelados'.
  - Fallos parciales: banner persistente 'No se pudieron cancelar X de N documentos:' y una línea por fallo 'PVEN-2026xxxx: <detail del backend>'.
  - Ningún error se traga; antes había .catch(()=>{}) y un toast 'Documentos cancelados' fijo.
- Las filas que no se pueden cancelar se listan como omitidas y no se envían.
- El rechazo de una COT deja el motivo en su Actividad.
```

**Pruebas (diseño):**

```text
Las pruebas de frontend NO usan vitest. `npm test` corre scripts node .mjs (frontend/tests/*.mjs), así que se sigue ese estilo.

NUEVO frontend/tests/test_hub_ventas.mjs (assert de node:assert/strict, bloques console.log como en test_busqueda.mjs):
- TEST ordenParaCancelar(['SC|1','VEN|3','COT|2','SC|4','VEN|5']) devuelve ['VEN|3','VEN|5','COT|2','SC|1','SC|4'].
- TEST motivoNoCancelable:
  - {tipo:'SC',estado:'CANCELADA'} → texto.
  - {tipo:'SC',estado:'ASIGNADA',tipo_solicitud:'Soporte Tecnico'} → texto de soporte.
  - {tipo:'VEN',estado:'ENTREGADO'} → texto.
  - {tipo:'VEN',estado:'EN_PROCESO'} → null.
  - {tipo:'COT',estado:'BORRADOR'} → null.
- TEST resumenLote:
  - Todo ok → fallidos=[] y mensaje '2 documentos cancelados'.
  - 1 de 3 falla → mensaje 'No se pudieron cancelar 1 de 3 documentos' y fallidos=[{numero:'PVEN-1',error:'Indica el motivo...'}].
  - 1 ok → '1 documento cancelado' (singular).

Verificación de tipos: `npx tsc --noEmit` en frontend/.

Verificación manual (la hace el usuario):
- Marcar la fila A, abrir el menú de la fila B y elegir 'Cancelar documento'. El modal muestra SOLO B. Al confirmar cambia solo B, y A sigue marcada.
- Sin selección: el modal abre.
- Un PVEN entregado no muestra la opción.

Backend: no hace falta un endpoint nuevo. El motivo obligatorio del PVEN lo cubren las pruebas de N2, y /cancelar de SC ya tiene sus pruebas.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No hay que migrar nada.

Informativo: las SC canceladas antes desde el Hub (PATCH estado CANCELADA) no tienen razon_cancelacion ni eliminada_at, así que nunca se purgan de la papelera. Para verlas (solo lectura):

`SELECT numero, updated_at FROM customer_requests WHERE estado='CANCELADA' AND eliminada_at IS NULL AND COALESCE(tipo_solicitud,'')<>'Soporte Tecnico';`

No requiere corrección.
```

**Riesgos:**

```text
- Depende de N2: el backend exige motivo para CANCELADO. Si N3 entra antes, igual funciona porque ya manda el motivo.
- Cuando el grupo de 'no cancelar SC con COT/PVEN activos' agregue su bloqueo en cancelar_solicitud, el Hub lo hereda solo, porque usa /cancelar, y el mensaje aparece en el banner.
- Hasta que entre el arreglo 'si se rechaza la COT la SC sigue activa', rechazar una COT desde el Hub sigue arrastrando la SC a RECHAZADA y el lead a CANCELLED (update_cotizacion 1076-1082). No es un efecto nuevo.
- Modal y panel rápido tienen los dos z-50; el modal debe ir después en el DOM.
```

**Archivos:** `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/lib/hub-ventas.js`, `frontend/tests/test_hub_ventas.mjs`, `frontend/package.json`


### N2 — Cambios de estado del pedido con reglas

**Para el usuario:** El panel rápido del Hub ya no permite devolver con un clic un pedido entregado o cancelado a un estado anterior.
- Para cancelar se pide el motivo.
- Para despachar se va a Entregas.
- 'Facturado' solo aparece cuando el pedido ya está entregado.

Si alguien intenta un cambio no permitido desde otra pantalla, el sistema lo rechaza con un mensaje claro.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Hoy "Facturado" es solo una etiqueta (no hay facturación real). ¿Quién la marca? → **Cualquiera, desde "Entregado" y con confirmación**
- ¿"En tránsito" sigue siendo un estado del pedido? → **Sí, mantenerlo**

**Cambios (diseño):**

```text
BACKEND backend/app/api/v1/erp_ventas.py

1. Junto a los helpers (antes de _sc_dict, ~167), agregar:
```python
_ESTADOS_VEN_OPERATIVOS = ("PENDIENTE_COMPRA", "PENDIENTE_PAGO", "EN_PROCESO", "EN_TRANSITO", "LISTO_ENTREGA")
_ETIQUETA_ESTADO_VEN = {"PENDIENTE_COMPRA": "Pendiente de compra", "PENDIENTE_PAGO": "Pendiente de pago", "EN_PROCESO": "En proceso", "EN_TRANSITO": "En tránsito", "LISTO_ENTREGA": "Listo para entrega", "ENTREGADO": "Entregado", "FACTURADO": "Facturado", "CANCELADO": "Cancelado"}
_TRANSICIONES_VEN_PATCH = {**{e: set(_ESTADOS_VEN_OPERATIVOS) | {"ENTREGADO", "CANCELADO"} for e in _ESTADOS_VEN_OPERATIVOS},
                           "ENTREGADO": {"FACTURADO"}, "FACTURADO": set(), "CANCELADO": set()}
```
más `def _validar_transicion_pedido(v, nuevo)`:
- `if not nuevo or nuevo == v.estado: return`.
- Si nuevo no está en _ETIQUETA_ESTADO_VEN: 422.
- `permitidos = _TRANSICIONES_VEN_PATCH.get(v.estado, set(_ESTADOS_VEN_OPERATIVOS) | {"ENTREGADO","CANCELADO"})`. Un estado heredado desconocido (PAGADO, COMPLETADO) se trata como operativo.
- Si nuevo no está en permitidos: 422 con el mensaje según el origen (ver comportamiento).

2. update_pedido (1468-1509):
   - Reemplazar 1477-1478 por `_validar_transicion_pedido(v, body.get("estado"))`.
   - Luego: si estado=='CANCELADO' y old_estado!='CANCELADO':
     - `razon = str(body.get('cancellation_reason') or '').strip()`.
     - Si len(razon) < 5: 422.
     - `body['cancellation_reason'] = razon`.
     - Si no viene cancelled_at: `body['cancelled_at'] = datetime.datetime.utcnow()`.
   - Se mantiene 1479-1480 (cancellation_authorized_by por defecto).
   - Reemplazar 1489-1490 por:
     - `ya_despachado = False`.
     - Si estado=='ENTREGADO' y old_estado!='ENTREGADO': `ya_despachado = db.query(InventoryOperation.id).filter(InventoryOperation.source_document_type=='PVEN', InventoryOperation.source_document_id==v.id).first() is not None`. Si no ya_despachado, llamar _descontar_inventario_despacho(...) como hoy.
     - InventoryOperation ya está importado en la línea 17.
   - En el _log ESTADO_CHANGED (1496-1499):
     - description = 'Estado cambiado a ENTREGADO (el inventario ya se había descontado en un despacho anterior; no se descuenta otra vez)' si ya_despachado.
     - `user_name=body.get('updated_by') or getattr(user,'email',None)`.

FRONTEND frontend/src/app/dashboard/ventas/page.tsx 1212-1232 (panel 'Cambiar Estado Operativo'). Reemplazar el map de 7 botones por `const op = opcionesEstadoPVEN(quickDetailDoc.estado)`:
- op.mover: botones con ETIQUETA_ESTADO_VEN[est] para PENDIENTE_COMPRA, EN_PROCESO, EN_TRANSITO y LISTO_ENTREGA, menos el actual. Mismo PATCH {estado} que hoy; toast `Estado actualizado a ${etiqueta}`.
- op.despachar: Link 'Despachar en Entregas →' a /dashboard/inventario/entregas.
- op.cancelar: botón 'Cancelar pedido' → abrirCancelacion([`VEN|${id}`]) (modal de N3 con motivo).
- op.facturar (solo ENTREGADO): botón 'Marcar como Facturado' con window.confirm(`¿Marcar ${numero} como Facturado? Este estado ya no se puede cambiar.`).
- FACTURADO/CANCELADO: texto 'Este pedido está {Facturado|Cancelado}; su estado ya no se cambia desde aquí.'

frontend/src/lib/hub-ventas.js agrega:
- ETIQUETA_ESTADO_VEN (copia de la tabla del backend).
- ESTADOS_VEN_MANUALES = ['PENDIENTE_COMPRA','EN_PROCESO','EN_TRANSITO','LISTO_ENTREGA'].
- opcionesEstadoPVEN(estado) → {mover, despachar, cancelar, facturar}.
```

**Comportamiento esperado:**

```text
Transiciones del Pedido de Venta por PATCH /ventas/pedidos/{id} (el backend es la autoridad):
- Desde PENDIENTE_COMPRA, PENDIENTE_PAGO, EN_PROCESO, EN_TRANSITO o LISTO_ENTREGA (o un estado heredado desconocido) se puede ir a:
  - cualquiera de esos cinco;
  - ENTREGADO: descuenta stock; exige bodega si hay líneas de catálogo, igual que hoy;
  - CANCELADO: exige motivo.
- ENTREGADO solo puede pasar a FACTURADO.
- FACTURADO y CANCELADO no cambian más.
- Reenviar el mismo estado se permite (no hace nada).
- Los demás campos (notas, fechas, precios) se siguen pudiendo editar en cualquier estado; no cambia.

Mensajes (todos 422):
- Estado inexistente: '«X» no es un estado válido para un Pedido de Venta.'
- Desde CANCELADO: 'El pedido {numero} está cancelado y no se puede reabrir. Si el cliente sigue interesado, ajusta la cotización y crea un pedido nuevo.' (Así lo decidió el usuario.)
- Desde FACTURADO: 'El pedido {numero} ya está facturado; su estado no se puede cambiar.'
- Desde ENTREGADO a otro estado que no sea Facturado: 'Un pedido entregado solo puede pasar a Facturado.'
- Cancelar sin motivo o con menos de 5 caracteres: 'Indica el motivo de la cancelación (mínimo 5 caracteres).'

Redespacho: si ya existe la InventoryOperation PVEN del pedido, marcar ENTREGADO no vuelve a descontar. Responde 200 en lugar del 500 por uq_inv_op_source_doc, y deja la nota en la Actividad.

Roles: ROLE_ADMIN y ROLE_ASESOR, sin cambios.

En el Hub nunca aparecen botones directos a Entregado ni a Cancelado sin motivo.
```

**Pruebas (diseño):**

```text
NUEVO backend/tests/test_pedido_venta_transiciones.py. Estilo de test_actividad_cambios_documentos.py: auth(token) y `_ven(db, numero, **campos)` con setdefault estado PENDIENTE_COMPRA.

1. test_un_pedido_cancelado_no_se_puede_reabrir_por_patch
   - Preparar: _ven(estado='CANCELADO', cancellation_reason='El cliente desistió').
   - PATCH {estado:'PENDIENTE_COMPRA'} → 422 y 'no se puede reabrir' en detail.
   - db.refresh: sigue CANCELADO.
2. test_un_pedido_entregado_solo_puede_pasar_a_facturado
   - Preparar: _ven(estado='ENTREGADO').
   - PATCH PENDIENTE_COMPRA → 422.
   - PATCH CANCELADO con motivo → 422.
   - PATCH FACTURADO → 200.
   - Después PATCH EN_PROCESO → 422 ('ya está facturado').
3. test_cancelar_un_pedido_exige_motivo
   - PATCH {estado:'CANCELADO'} → 422 'motivo'.
   - Con cancellation_reason 'abc' → 422.
   - Con '  El cliente desistió  ' → 200; data.cancellation_reason=='El cliente desistió'; data.cancelled_at no es None; cancellation_authorized_by == user_admin.email.
4. test_los_estados_operativos_se_mueven_libremente
   - PENDIENTE_COMPRA→EN_PROCESO→LISTO_ENTREGA→PENDIENTE_COMPRA, todos 200.
   - Hay 3 actividades ESTADO_CHANGED con user_name == user_admin.email (no mandar updated_by).
5. test_un_estado_que_no_es_de_pedido_se_rechaza
   - PATCH {estado:'CONFIRMADA'} → 422 'no es un estado válido'.
6. test_volver_a_marcar_entregado_no_descuenta_inventario_dos_veces
   - Preparar: _ven(estado='PENDIENTE_COMPRA', productos=[{'product_name':'X','qty':1,'sku_id': sku.id}]) con el fixture sku. Además, InventoryOperation(operation_type='DELIVERY', status='DONE', source_document_type='PVEN', source_document_id=ven.id, source_document_numero=ven.numero) agregado con db.add para que el fixture lo limpie.
   - PATCH {estado:'ENTREGADO'} sin warehouse_id → 200. Antes daba 422 por la bodega o 500 por el índice único.
   - Sigue habiendo 1 sola InventoryOperation para el PVEN.
   - La actividad dice 'no se descuenta otra vez'.

Pruebas existentes que deben seguir pasando:
- test_actividad_cambios_documentos.py::test_cancelar_un_pedido_registra_el_estado_y_el_motivo (manda motivo de más de 5 caracteres; cancelled_at no está en cambios_documento.CAMPOS, así que el detalle no cambia).
- test_el_motivo_reemplaza_el_titulo...
- test_fecha_entrega_actividad_log_pven.py
- test_pendiente_compra_lista_pec.py

Correr con el runner de ROLLBACK, porque pytest trunca tablas de erp_test.

Frontend, en test_hub_ventas.mjs:
- opcionesEstadoPVEN('EN_PROCESO').mover no incluye 'EN_PROCESO' e incluye 'LISTO_ENTREGA'; cancelar y despachar en true; facturar en false.
- opcionesEstadoPVEN('ENTREGADO') → mover=[], facturar=true, cancelar=false.
- opcionesEstadoPVEN('CANCELADO') → todo vacío o false.

Además `npx tsc --noEmit`.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No hay cambio de esquema. Con las consultas de solo lectura de abajo se arma una lista para el usuario. Cualquier UPDATE de estado se hace solo con su OK explícito, por separado en erp_test y en producción.

Consultas:
- (a) Pedidos que ya descontaron inventario pero quedaron en otro estado (los 'revivieron' desde el Hub):
  `SELECT so.id, so.numero, so.estado FROM sale_orders so JOIN inventory_operations io ON io.source_document_type='PVEN' AND io.source_document_id=so.id WHERE so.estado NOT IN ('ENTREGADO','FACTURADO');`
- (b) Pedidos cancelados y luego reabiertos:
  `SELECT id, numero, estado, cancelled_at, cancellation_reason FROM sale_orders WHERE estado<>'CANCELADO' AND (cancelled_at IS NOT NULL OR cancellation_reason IS NOT NULL);`
- (c) Solo informativo, cancelaciones viejas sin motivo:
  `SELECT numero FROM sale_orders WHERE estado='CANCELADO' AND COALESCE(btrim(cancellation_reason),'')='';`

Con el arreglo, (a) se puede volver a marcar Entregado desde Entregas sin doble descuento.
```

**Riesgos:**

```text
- compras/pedidos/page.tsx:1011-1013 hace PATCH {pec_id, estado:'EN_PROCESO'} sobre los PVEN adicionales de un PEC, con .catch(()=>{}). Si uno estuviera CANCELADO o ENTREGADO, ahora falla (422) y no se vincula, en silencio. Es correcto: un pedido cancelado no debe pasar a En proceso.
- Soltar en el tablero del Hub una tarjeta ENTREGADO en otra columna ahora muestra el error en el toast. Es lo esperado.
- No se toca la máquina de estados canónica de erp_ventas_fase4.py (ALLOWED_TRANSITIONS_SALE_ORDER usa otro vocabulario).
- venta/[id]/page.tsx ya limitaba su selector a PENDIENTE_COMPRA, EN_PROCESO y LISTO_ENTREGA, así que queda consistente.
- El texto 'Estado cambiado a X' de la Actividad sigue mostrando el código; eso lo arregla el ítem de estados legibles.
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/lib/hub-ventas.js`, `backend/tests/test_pedido_venta_transiciones.py`, `frontend/tests/test_hub_ventas.mjs`


### N5 — Acciones masivas solo para pedidos

**Para el usuario:** La barra de acciones masivas del Hub ahora solo cambia el estado de los Pedidos de Venta. Si marcaste solicitudes o cotizaciones, se ignoran y la pantalla lo avisa. Si algún pedido no se puede cambiar, dice cuál y por qué, en lugar de decir siempre 'Estados actualizados'. Una solicitud o una cotización ya no pueden quedar en un estado de pedido como 'Facturado'. Tampoco se puede rechazar una cotización cuyo pedido sigue vigente.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Cambios (diseño):**

```text
FRONTEND frontend/src/app/dashboard/ventas/page.tsx

1. handleBulkChangeEstado (336-344) se reescribe:
   - `const ids = Array.from(selectedIds); const ven = ids.filter(i => i.startsWith('VEN|')); const omitidos = ids.length - ven.length`.
   - Si ven.length==0: toast error y return.
   - Si nuevo==='FACTURADO': window.confirm.
   - Por cada id, PATCH /ventas/pedidos/${id} {estado:nuevo} en serie, guardando {numero, ok, error}. Sin .catch(()=>{}).
   - resumenLote(resultados, 'actualizados'): sin fallos → toast ok; con fallos → setResultadoLote (el mismo banner de N3).
   - Quitar de selectedIds solo los exitosos y llamar loadData().

2. Select de la barra (1085-1092):
   - Controlado con value="", para que se pueda elegir dos veces la misma opción.
   - Placeholder 'Cambiar estado de pedidos (N)…', con N = cantidad de VEN seleccionados; disabled si N==0.
   - Opciones: ESTADOS_VEN_MANUALES (Pendiente de compra, En proceso, En tránsito, Listo para entrega) más 'Facturado', con las etiquetas de ETIQUETA_ESTADO_VEN.
   - Se QUITA 'Entregado': el despacho exige bodega y descuenta inventario, y va por Entregas.

BACKEND backend/app/api/v1/erp_ventas.py

3. update_solicitud, justo después de 491-492:
```python
nuevo = body.get("estado")
if nuevo and nuevo != sc.estado and nuevo not in ("BORRADOR", "CANCELADA"):
    raise HTTPException(400, "Ese estado no se puede poner a mano en una solicitud: solo se puede volver a Borrador o cancelarla. Los demás estados los pone el flujo (asignar asesor, confirmación del cliente, cotización).")
```

4. update_cotizacion, justo después de 946-947 y ANTES de cualquier setattr o sincronización:
```python
nuevo = body.get("estado")
if nuevo and nuevo != cot.estado:
    if nuevo not in ("BORRADOR", "ENVIADA", "RECHAZADA", "VENCIDA"):
        raise HTTPException(400, "Ese estado no se puede poner a mano en una cotización: solo Borrador, Enviada, Rechazada o Vencida.")
    pven = db.query(SaleOrder).filter(SaleOrder.cot_id == cot.id, SaleOrder.estado != "CANCELADO").order_by(SaleOrder.id.desc()).first()
    if pven:
        raise HTTPException(409, f"La cotización tiene el Pedido de Venta {pven.numero} vigente. Cancela primero el pedido para cambiar el estado de la cotización.")
```

frontend/src/lib/hub-ventas.js: reutiliza resumenLote (N3) y ETIQUETA_ESTADO_VEN / ESTADOS_VEN_MANUALES (N2).
```

**Comportamiento esperado:**

```text
- Acción masiva de estado: solo aplica a PVEN. Las SC y COT seleccionadas se omiten.
- Mensajes del Hub:
  - Sin pedidos seleccionados: 'Selecciona al menos un Pedido de Venta: las solicitudes y cotizaciones no cambian de estado desde aquí.'
  - Todo bien: toast ok 'N pedidos actualizados a {Etiqueta}', más ' · se omitieron M solicitudes/cotizaciones' si M>0.
  - Fallos: banner 'No se pudieron actualizar X de N pedidos:' con 'PVEN-…: <detail>'. Ejemplos: 'Un pedido entregado solo puede pasar a Facturado.' o la bodega faltante.
- Backend, lista blanca (reenviar el mismo estado nunca falla):
  - SC por PATCH: solo BORRADOR o CANCELADA. Siguen los 400 existentes para CONFIRMADA, ASIGNADA y PENDIENTE_CONFIRMACION.
  - COT por PATCH: solo BORRADOR, ENVIADA, RECHAZADA o VENCIDA. Siguen los 400 existentes para CONFIRMADA y PENDIENTE_CONFIRMACION.
  - COT con un PVEN no cancelado: no puede cambiar de estado (409). Así ya no pasa que RECHAZADA borre el gate2 ni arrastre la SC a RECHAZADA y el lead a CANCELLED con un pedido vigente.
  - Editar precios o notas de esa COT sin tocar el estado sigue permitido (la re-cotización con PVEN no cambia).
```

**Pruebas (diseño):**

```text
NUEVO backend/tests/test_estados_manuales_ventas.py. Estilo de test_solicitud_productos_para_cotizar.py: auth y _sc(db, numero, **campos) SIN asesor para que no se auto-promueva.

1. test_patch_solicitud_rechaza_un_estado_de_pedido
   - Preparar: SC BORRADOR.
   - PATCH {estado:'FACTURADO'} → 400 con 'solo se puede volver a Borrador'.
   - PATCH {estado:'COTIZADA'} → 400.
   - db.refresh: sigue BORRADOR y no hay actividad ESTADO_CHANGED.
2. test_patch_solicitud_sigue_permitiendo_borrador_y_el_mismo_estado
   - SC BORRADOR: PATCH {estado:'BORRADOR', notas:'x'} → 200.
3. test_patch_cotizacion_rechaza_estados_de_pedido
   - COT BORRADOR.
   - PATCH ENTREGADO → 400; FACTURADO → 400; ENVIADA → 200.
4. test_no_se_puede_rechazar_una_cotizacion_con_pedido_vigente
   - Preparar: SC 'SC-EST004' CONFIRMADA; COT CONFIRMADA con sc_id; SaleOrder(numero='PVEN-EST004', cot_id=cot.id, sc_id=sc.id, estado='PENDIENTE_COMPRA').
   - PATCH COT {estado:'RECHAZADA'} → 409 con 'PVEN-EST004' en detail.
   - db.refresh: COT CONFIRMADA y SC CONFIRMADA.
   - Después: ven.estado='CANCELADO', commit; PATCH RECHAZADA → 200.
5. test_reenviar_el_mismo_estado_de_la_cotizacion_no_falla_aunque_tenga_pedido
   - COT ENVIADA con PVEN vigente: PATCH {estado:'ENVIADA', notas:'x'} → 200.

Pruebas existentes que deben seguir pasando (verificado que solo usan estados permitidos):
- test_confirmacion_cotizacion.py (RECHAZADA sin PVEN)
- test_confirmacion_solicitud.py (BORRADOR y CANCELADA sin COT)
- test_crm_lead_movimiento_automatico.py (ENVIADA y RECHAZADA)
- test_sincronizacion_estado_solicitud_cotizacion.py

Correr con el runner de ROLLBACK.

Frontend, en test_hub_ventas.mjs:
- resumenLote con verbo 'actualizados': 'No se pudieron actualizar 1 de 2 pedidos'.

Además `npx tsc --noEmit`. Manual: marcar 1 SC y 2 PVEN y elegir 'En proceso'. Cambian los 2 PVEN y el toast avisa que se omitió 1.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
Revisión de solo lectura. La corrección se hace solo con OK del usuario, en erp_test y producción por separado.

Consultas:
- (a) SC con estados ajenos:
  `SELECT id, numero, estado FROM customer_requests WHERE estado NOT IN ('BORRADOR','ASIGNADA','PENDIENTE_CONFIRMACION','COTIZADA','EN_ESPERA_CONFIRMACION','CONFIRMADA','RECHAZADA','VENCIDA','CANCELADA','N/A_SOPORTE');`
- (b) COT con estados ajenos:
  `SELECT id, numero, estado FROM sales_quotations WHERE estado NOT IN ('BORRADOR','ENVIADA','PENDIENTE_CONFIRMACION','CONFIRMADA','RECHAZADA','VENCIDA');`
- (c) COT rechazadas con pedido vivo:
  `SELECT q.numero, q.estado, so.numero, so.estado FROM sales_quotations q JOIN sale_orders so ON so.cot_id=q.id WHERE q.estado<>'CONFIRMADA' AND so.estado<>'CANCELADO';`

Corrección sugerida:
- (a): derivar el estado desde su COT con _MAPA_ESTADO_COTIZACION_A_SOLICITUD, o dejar ASIGNADA/BORRADOR si no tiene COT.
- (b) y (c): dejar la COT en CONFIRMADA si tiene un PVEN vigente, o en BORRADOR si no.
```

**Riesgos:**

```text
- Verifiqué que las otras pantallas solo mandan estados permitidos:
  - solicitud-client y solicitud/[id] usan ESTADOS_SC_MANUALES = BORRADOR/CANCELADA.
  - El selector de cotizacion/[id] excluye CONFIRMADA y PENDIENTE_CONFIRMACION.
  - Los drops del tablero del Hub a CONFIRMADA ya devolvían 400.
- El grupo de 'no cancelar SC con COT/PVEN activos' puede restringir aún más CANCELADA en este mismo PATCH. Hay que coordinar para no pisarse en update_solicitud.
- El grupo de 'COT rechazada mantiene la SC activa' edita el mismo update_cotizacion. El chequeo de PVEN vigente debe quedar antes de su sincronización.
```

**Archivos:** `frontend/src/app/dashboard/ventas/page.tsx`, `backend/app/api/v1/erp_ventas.py`, `frontend/src/lib/hub-ventas.js`, `backend/tests/test_estados_manuales_ventas.py`, `frontend/tests/test_hub_ventas.mjs`


### H2 — Tiempo sin "hace -1d"

**Para el usuario:** La columna de tiempo del Hub ya no muestra 'hace -1d' ni 'hace hoy'. Ahora muestra 'hoy', 'hace 1 día' o 'hace N días'. Las fechas y horas de solicitudes, cotizaciones y pedidos dejan de verse corridas 5 horas: un documento creado de noche ya no aparece con fecha de mañana.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- La columna "Antigüedad" en realidad mide los días SIN movimiento del documento. ¿Qué prefieres? → **Que muestre los días desde que se creó** ⚠ distinta de la recomendada ("Llamarla "Último movimiento" y dejar ese cálculo")

**Cambios (diseño):**

```text
BACKEND backend/app/api/v1/erp_ventas.py

1. Nuevo helper junto a _log_dict (~290):
```python
def _iso_utc(dt):
    """created_at/updated_at... se guardan en UTC sin zona (utcnow); con 'Z' el navegador no los lee como hora local."""
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    if dt.tzinfo is not None:
        dt = dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return dt.isoformat() + "Z"
```
2. Usarlo en:
   - _sc_dict: created_at (188), updated_at (189), eliminada_at (192).
   - _cot_dict: created_at (227), updated_at (228).
   - _ven_dict: cancelled_at (266), created_at (267), updated_at (268).
   - _pxp_dict: created_at (287).

   NO se tocan fecha_solicitud, fecha_vencimiento, fecha_cotizacion, fecha_entrega_estimada, fecha_creacion ni fecha_pago (fechas de calendario o de negocio).

FRONTEND

3. frontend/src/lib/hub-ventas.js:
```js
export function diasDesde(iso, ahora = Date.now()) { if (!iso) return 0; const t = new Date(iso).getTime(); if (Number.isNaN(t)) return 0; return Math.max(0, Math.floor((ahora - t) / 86400000)); }
export function textoAntiguedad(d) { return d <= 0 ? 'hoy' : d === 1 ? 'hace 1 día' : `hace ${d} días`; }
```
4. frontend/src/app/dashboard/ventas/page.tsx:
   - Línea 23: `const daysDiff = (iso:any) => diasDesde(iso);`, o reemplazar sus usos en 294, 902 y 1046.
   - Líneas 943 y 1059: `{textoAntiguedad(dDiff)}`, quitando el 'hace ' fijo.
   - Según la decisión pendiente, cambiar el encabezado de 882 'Antigüedad' por 'Último movimiento'.
```

**Comportamiento esperado:**

```text
- Días = piso de (ahora − (updated_at o created_at)) / 24 h. Nunca es negativo.
- Texto: 0 → 'hoy'; 1 → 'hace 1 día'; n → 'hace n días'.
- El badge 'No Resuelto (+Nd)' y la alerta de atraso usan el mismo número, ahora sin el retraso de 5 h. isDocAtrasado (292-295) se corrige solo.
- La API devuelve created_at, updated_at, cancelled_at y eliminada_at de SC, COT, PVEN y PXP con 'Z'. Es el mismo formato que _log_dict ya usa para la Actividad.
- fDate y fTime del Hub, y de las otras pantallas que consumen estos dicts, muestran la hora de Colombia correcta.
```

**Pruebas (diseño):**

```text
NUEVO backend/tests/test_fechas_ventas_utc.py. Reusa el patrón de _es_utc_con_zona_y_reciente de test_actividad_cambios_documentos.py:235-238: endswith('Z') y diferencia menor a 120 s con datetime.now(timezone.utc).

1. test_las_fechas_de_sc_cot_y_pedido_se_entregan_en_utc_con_zona
   - Preparar por ORM: SC, una COT con sc_id y un SaleOrder con cot_id y sc_id.
   - GET /api/v1/ventas/solicitudes/{sc.id}: created_at y updated_at.
   - En esa misma respuesta, d['cotizaciones'][0]['created_at'] y d['pedidos_venta'][0]['updated_at'].
   - GET /cotizaciones/{id} y /pedidos/{id}: created_at y updated_at.
   - Todos deben pasar el helper.
2. test_la_fecha_de_cancelacion_del_pedido_se_entrega_con_zona
   - PATCH /pedidos/{id} {estado:'CANCELADO', cancellation_reason:'El cliente desistió'}.
   - data['cancelled_at'] termina en 'Z'. Depende de N2, que pone cancelled_at por defecto. Si H2 va antes, mandar cancelled_at en el body.
3. test_la_orden_de_pago_se_entrega_con_zona
   - POST /pedidos/{id}/crear-pxp {} con admin_token.
   - data['created_at'] termina en 'Z'.

Frontend, en test_hub_ventas.mjs, con `ahora` fijo:
- diasDesde(iso de 1 h antes con Z) → 0.
- 30 h antes → 1.
- 3 días antes → 3.
- 2 h en el FUTURO (desfase de reloj) → 0.
- null, '' y 'basura' → 0.
- textoAntiguedad(0) → 'hoy'; (1) → 'hace 1 día'; (5) → 'hace 5 días'.
- Para d de -2 a 10, ningún resultado contiene '-' ni 'hace hoy'.

Además `npx tsc --noEmit`.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
no aplica (lo guardado ya está en UTC sin zona; solo cambia cómo se entrega)
```

**Riesgos:**

```text
- Las pantallas que consumen estos dicts (listas y detalles de ventas, compras vía _ven_dict, Entregas) pasan a mostrar la hora local correcta. Las horas que antes salían corridas cambian 5 h, y eso es lo esperado.
- Verifiqué que en frontend/src no hay código que corte o compare estas cadenas (created_at.slice/split/startsWith…).
- Los microsegundos de 6 dígitos con 'Z' ya funcionan en la Actividad (_log_dict).
- Siguen sin 'Z' otros ~60 serializadores fuera de este archivo, y get_papelera (str() de SQL crudo). Quedan fuera de alcance.
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/lib/hub-ventas.js`, `backend/tests/test_fechas_ventas_utc.py`, `frontend/tests/test_hub_ventas.mjs`


### H3 — Próxima acción correcta

**Para el usuario:** En el Hub, el botón 'Próxima acción' de cada solicitud dice lo que de verdad toca:
- 'Asignar asesor'
- 'Agregar productos'
- 'Enviar para confirmación'
- 'Esperando cliente'
- 'Cotizar', solo cuando el cliente ya confirmó
- 'Ver cotización' o 'Ver pedido'

El botón lleva directo a la pantalla correcta. Las solicitudes asignadas y las confirmadas que todavía no tienen cotización cuentan como pendientes en el semáforo.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Cuando diga "Enviar para confirmación", ¿qué hace el botón? → **Abre la solicitud, donde eliges el canal**

**Cambios (diseño):**

```text
frontend/src/lib/hub-ventas.js

- Mover aquí ESTADOS_NO_RESOLUCION (page.tsx:26-35), agregando 'ASIGNADA'.
- Mover aquí ESTADOS_ACCION_TOMADA (38-46), agregando 'COTIZADA' y 'EN_ESPERA_CONFIRMACION'.
- tieneProductos(productos): la misma regla que solicitud/[id]/page.tsx:366, es decir alguna línea con product_name, nombre o name no vacío.
- esNoResuelto(row, scConCot): para tipo SC con estado CONFIRMADA devuelve !scConCot.has(row.id); en otro caso ESTADOS_NO_RESOLUCION.includes(row.estado).
- esAccionTomada(row, scConCot): para tipo SC con estado CONFIRMADA devuelve scConCot.has(row.id); en otro caso ESTADOS_ACCION_TOMADA.includes(row.estado).
- accionSiguienteSC(row, {cotizaciones, pedidos}) → {label, href, tono} | null, que replica renderSiguientePaso (solicitud/[id]/page.tsx:392-526).

frontend/src/app/dashboard/ventas/page.tsx

- Importar los helpers.
- useMemo cotsPorSC: Map de sc_id a las COT de la lista `cotizaciones`.
- useMemo pedsPorSC: Map de sc_id a los PVEN de `pedidos`, por sc_id.
- useMemo scConCot: Set de sc_id de las COT con estado distinto de RECHAZADA y VENCIDA (COT vigente).
- isDocNoResolucion (288-290) → esNoResuelto(item, scConCot), con dependencia [scConCot].
- Líneas 299 y 320: `ESTADOS_ACCION_TOMADA.includes(d.estado)` → esAccionTomada(d, scConCot).
- getKanbanCol (383-389): primera línea `if (item.tipo==='SC' && item.estado==='CONFIRMADA' && !scConCot.has(item.id)) return 'No Resuelto';`.
- Líneas 957-961: reemplazar la rama SC por `const acc = accionSiguienteSC(row, {cotizaciones: cotsPorSC.get(row.id)||[], pedidos: pedsPorSC.get(row.id)||[]})`. Si hay acción, botón con acc.label y color según acc.tono, que hace router.push(acc.href). Si no, '—'.
- El filtro 'Estado Específico' (676) toma las listas movidas, así que muestra los nuevos estados.
```

**Comportamiento esperado:**

```text
accionSiguienteSC evalúa en este orden y se queda con el primer caso que aplique:
1. Soporte (tipo_solicitud 'Soporte Tecnico' o estado 'N/A_SOPORTE') → 'Ver ticket', a /dashboard/ventas/solicitud/{id}.
2. CANCELADA → null.
3. Tiene un PVEN no CANCELADO → 'Ver pedido', a /dashboard/ventas/venta/{venId}.
4. Tiene una COT vigente (no RECHAZADA ni VENCIDA) → 'Ver cotización', a /dashboard/ventas/cotizacion/{id de la COT vigente más reciente}.
5. Sin productos y en estado ASIGNADA, PENDIENTE_CONFIRMACION o CONFIRMADA → 'Agregar productos', a la solicitud.
6. CONFIRMADA → 'Cotizar →', a la solicitud, donde está 'Crear Cotización'.
7. PENDIENTE_CONFIRMACION → 'Esperando cliente', a la solicitud, donde está 'Reenviar enlace'.
8. ASIGNADA → 'Enviar para confirmación', a la solicitud, donde está el modal de canal.
9. BORRADOR → 'Asignar asesor', a la solicitud.
10. Cualquier otro (RECHAZADA, VENCIDA, COTIZADA o EN_ESPERA_CONFIRMACION sin COT en la ventana) → 'Ver solicitud'.

Todas las rutas son directas: ya no pasan por /solicitud?id=, que redirige. El Hub no envía nada por su cuenta; el envío, con su canal y el correo de respaldo, vive en el detalle de la SC.

Semáforo:
- SC ASIGNADA → No resuelto.
- SC CONFIRMADA sin COT vigente → No resuelto, también en la columna del tablero.
- SC COTIZADA o EN_ESPERA_CONFIRMACION → Acción tomada. Su trabajo pendiente se cuenta en su COT y así no se cuenta dos veces. El badge ya decía 'Acción Tomada'; ahora también lo dicen el conteo y la pestaña.

Bloque 2: cuando exista 'cotizar sin confirmación con nota obligatoria', 'Cotizar' será una acción secundaria en el detalle de la SC. El helper podrá devolver un campo `secundaria` sin cambiar la columna.
```

**Pruebas (diseño):**

```text
Frontend, en frontend/tests/test_hub_ventas.mjs (node, sin vitest):
- ASIGNADA con [{product_name:'Cuna'}] → label 'Enviar para confirmación', href '/dashboard/ventas/solicitud/5'.
- ASIGNADA con [] → 'Agregar productos'.
- ASIGNADA con [{product_name:'  '}] → 'Agregar productos'.
- BORRADOR → 'Asignar asesor'.
- PENDIENTE_CONFIRMACION con productos → 'Esperando cliente'.
- CONFIRMADA con productos y sin COT → 'Cotizar →'.
- CONFIRMADA con COT {id:9, estado:'CONFIRMADA'} → 'Ver cotización', href '/dashboard/ventas/cotizacion/9'.
- COTIZADA con COT BORRADOR → 'Ver cotización'.
- Con PVEN {id:4, estado:'EN_PROCESO'} → 'Ver pedido'.
- Con un PVEN CANCELADO y una COT vigente → 'Ver cotización'.
- CANCELADA → null.
- tipo_solicitud 'Soporte Tecnico' → 'Ver ticket'.
- esNoResuelto: {tipo:'SC',estado:'ASIGNADA'} → true; {tipo:'SC',id:1,estado:'CONFIRMADA'} con scConCot vacío → true; con Set([1]) → false.
- esAccionTomada: {tipo:'SC',estado:'COTIZADA'} → true; {tipo:'COT',estado:'CONFIRMADA'} → true.

Además `npx tsc --noEmit`. Manual: una SC ASIGNADA con productos muestra 'Enviar para confirmación' y abre el detalle con ese botón.

Backend: no cambia.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
no aplica
```

**Riesgos:**

```text
- El Hub carga solo las 200 COT y los 200 PVEN más recientes. Una SC cuya COT haya quedado fuera de esa ventana mostraría 'Cotizar' o 'Enviar' en vez de 'Ver cotización'. El botón lleva al detalle de la SC, que muestra el paso correcto, así que el daño es bajo.
- Los conteos del semáforo cambian: habrá más 'No resueltos'.
- La 'Próxima acción' de COT (962-966) tiene el mismo defecto y no está incluida en este arreglo:
  - dice 'Aprobar Venta →' para cualquier COT abierta;
  - dice 'Al día' para una COT CONFIRMADA sin pedido;
  - usa la ruta ?id=.
  Se sugiere una tarea aparte.
- La definición de 'COT vigente' ya contempla la decisión 'si se rechaza la cotización, la SC sigue activa y se puede cotizar otra vez'. Crear la segunda COT depende de que el otro grupo relaje confirmar_solicitud (705-706).
```

**Archivos:** `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/lib/hub-ventas.js`, `frontend/tests/test_hub_ventas.mjs`, `frontend/package.json`


### H4 — Asesor real en la columna Asesor

**Para el usuario:** La columna Asesor del Hub ahora muestra el asesor real de cada pedido: el de su cotización o, si no tiene, el de su solicitud. Si un documento no tiene asesor dice 'Sin asignar', en lugar del engañoso 'Asignado'. También se puede buscar un pedido por el nombre del asesor.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Cambios (diseño):**

```text
BACKEND backend/app/api/v1/erp_ventas.py

1. Helper nuevo junto a _ven_dict (~271):
```python
def _asesores_de_pedidos(db, pedidos) -> dict:
    """El PVEN no guarda asesor: se toma el cotizador de su COT o, si no, el asesor de su SC."""
    cot_ids = {v.cot_id for v in pedidos if v.cot_id}
    sc_ids = {v.sc_id for v in pedidos if v.sc_id}
    cotizador = dict(db.query(SalesQuotation.id, SalesQuotation.cotizador).filter(SalesQuotation.id.in_(cot_ids)).all()) if cot_ids else {}
    asesor_sc = dict(db.query(CustomerRequest.id, CustomerRequest.advisor_name).filter(CustomerRequest.id.in_(sc_ids)).all()) if sc_ids else {}
    return {v.id: (cotizador.get(v.cot_id) or asesor_sc.get(v.sc_id) or None) for v in pedidos}
```
2. list_pedidos (1322-1324): `asesores = _asesores_de_pedidos(db, items)` y armar data con `{**_ven_dict(v), 'advisor_name': asesores.get(v.id)}`.
3. get_pedido (1395): `d['advisor_name'] = _asesores_de_pedidos(db, [v]).get(v.id)`.

FRONTEND frontend/src/app/dashboard/ventas/page.tsx

4. Línea 940: `{row.advisor_name || row.cotizador || row.asesor?.nombre || <span className="italic text-slate-400">Sin asignar</span>}`.
5. Línea 327: la búsqueda incluye `r.cotizador`: `(r.advisor_name || r.cotizador || r.asesor?.nombre || '')`.
```

**Comportamiento esperado:**

```text
- advisor_name de un PVEN = COT.cotizador si tiene cot_id y no está vacío; si no, SC.advisor_name si tiene sc_id; si no, null.
- Se calcula al leer; no se guarda nada nuevo.
- Son 2 consultas por lista (IN en bloque), sin N+1.
- Hub: un documento sin asesor (SC en BORRADOR, PVEN huérfano) muestra 'Sin asignar' en gris itálica.
```

**Pruebas (diseño):**

```text
NUEVO backend/tests/test_pedido_venta_asesor.py (estilo test_actividad_cambios_documentos.py).

1. test_la_lista_de_pedidos_trae_el_asesor_de_su_cotizacion_o_de_su_solicitud
   - Preparar por ORM:
     - SC 'SC-ASE001' con advisor_name='asesora@test'.
     - COT 'COT-ASE001' con sc_id y cotizador='cotizador@test'.
     - VEN1 con cot_id y sc_id.
     - VEN2 solo con sc_id.
     - VEN3 sin vínculos.
   - GET /api/v1/ventas/pedidos?limit=200 (ordenado por created_at desc, así que los nuevos aparecen primero). Mapa por id:
     - VEN1 → 'cotizador@test'
     - VEN2 → 'asesora@test'
     - VEN3 → None
2. test_el_detalle_del_pedido_trae_el_asesor
   - GET /pedidos/{VEN1.id} → data.advisor_name == 'cotizador@test'.

Frontend: `npx tsc --noEmit`. Manual: en el Hub, un PVEN muestra el asesor y una SC en BORRADOR dice 'Sin asignar'.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
no aplica
```

**Riesgos:**

```text
- Bajo. El campo nuevo en la respuesta de /pedidos lo ignoran las demás pantallas (lista de pedidos, Entregas, Compras).
- Caso raro: un PVEN con COT sin cotizador y sin sc_id propio muestra 'Sin asignar' aunque la SC de esa COT tenga asesor. Si se quiere cubrir, se agrega la consulta de COT.sc_id.
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `frontend/src/app/dashboard/ventas/page.tsx`, `backend/tests/test_pedido_venta_asesor.py`


### H5 — WhatsApp con el +57

**Para el usuario:** El botón 'Abrir WhatsApp' del Hub abre el chat del cliente con el indicativo de Colombia (+57). Antes abría un número inválido y el chat no cargaba.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Cambios (diseño):**

```text
NUEVO frontend/src/lib/whatsapp.js (JS puro, como busqueda.js):
```js
export function numeroWhatsApp(telefono) {
  let d = String(telefono ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (!d) return null;
  return d.length === 10 ? '57' + d : d;
}
export function waUrl(telefono, texto) {
  const n = numeroWhatsApp(telefono);
  if (!n) return null;
  return `https://wa.me/${n}` + (texto ? `?text=${encodeURIComponent(texto)}` : '');
}
```
frontend/src/app/dashboard/ventas/page.tsx 995-1001: `{waUrl(row.customer_phone) && (<a href={waUrl(row.customer_phone)!} ...>)}`, en lugar de la URL armada sin 57.

Las otras pantallas ya anteponen 57 y quedan igual en este arreglo:
- venta/[id]:167
- solicitud/[id]:303 y :762
- cotizacion/[id]:191 y :342
- solicitud-client:388, :601 y :640
- inventario/entregas:299 y :359
- agenda:803, :1175 y :1287

Se sugiere una tarea aparte para migrarlas a waUrl.

frontend/package.json: agregar `node tests/test_whatsapp.mjs` al script "test".
```

**Comportamiento esperado:**

```text
- Se queda solo con los dígitos y quita un '00' inicial.
- Si quedan 10 dígitos (número colombiano), antepone 57.
- Si ya trae el 57 (12 dígitos) u otro indicativo, lo deja igual. Así nunca sale '5757…'.
- Si no queda ningún dígito, no se muestra el botón.
```

**Pruebas (diseño):**

```text
NUEVO frontend/tests/test_whatsapp.mjs (node:assert/strict):
- waUrl('3001234567') → 'https://wa.me/573001234567'.
- waUrl('+57 300 123 4567') → 'https://wa.me/573001234567', sin 5757.
- waUrl('(300) 123-4567') → con 57.
- waUrl('573001234567') → igual.
- waUrl('0057 300 123 4567') → 'https://wa.me/573001234567'.
- waUrl('') → null; waUrl(null) → null; waUrl('abc') → null.
- waUrl('3001234567', 'Hola Ana') → 'https://wa.me/573001234567?text=Hola%20Ana'.

Además `npx tsc --noEmit`. Manual: en el Hub, 'Abrir WhatsApp' abre wa.me/57… .
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
no aplica
```

**Riesgos:**

```text
- Un fijo colombiano de 10 dígitos también recibe el 57, y eso es correcto.
- Mientras no se migren las otras pantallas, un teléfono guardado como '+57…' sigue generando '5757…' allá. Esto no ocurre en el Hub.
```

**Archivos:** `frontend/src/lib/whatsapp.js`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/tests/test_whatsapp.mjs`, `frontend/package.json`


### H23 — Sesión de 24 horas sin perder lo escrito

**Para el usuario:** Mientras uses el sistema, la sesión no se cierra. Solo se cierra si pasan 24 horas sin usarlo. Si eso pasa, aparece una ventana encima de la pantalla en la que estabas para que escribas tu contraseña: lo que habías escrito sigue ahí, y lo que intentabas guardar se guarda solo al entrar.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- "Uso" = clics o teclado reales (no lo que la app consulta sola). Sin tope absoluto: si trabajas a diario, no vuelves a escribir la contraseña. ¿Así? → **Sí**

**Cambios (diseño):**

```text
BACKEND
1) backend/app/core/security.py:72-74: se deja ACCESS_TOKEN_EXPIRE_MINUTES para tokens internos y pruebas, y se añade `SESSION_IDLE_TIMEOUT_MINUTES: int = int(os.environ.get("SESSION_IDLE_TIMEOUT_MINUTES", "1440").strip())`. Es una variable nueva a propósito: los valores 30 y 60 ya están en backend/.env, .env.staging y .env.production (no versionados) y en el entorno de EasyPanel. Si se reutilizara la variable vieja, la sesión seguiría en 30 o 60 minutos sin aviso.
2) security.py:90-97 create_access_token: `now = datetime.now(timezone.utc)` y `to_encode.update({"exp": expire, "iat": now})`. El frontend necesita `iat` para saber cuándo renovar.
3) backend/app/api/v1/auth.py:16: importar SESSION_IDLE_TIMEOUT_MINUTES. En :68 (login): `timedelta(minutes=SESSION_IDLE_TIMEOUT_MINUTES)`.
4) auth.py, nuevo endpoint debajo de /me (:75-77):
   @router.post("/refresh")
   def refresh_session(current_user: User = Depends(get_current_user)):
       token = create_access_token({"sub": str(current_user.id), "role": current_user.role}, expires_delta=timedelta(minutes=SESSION_IDLE_TIMEOUT_MINUTES))
       return {"access_token": token, "token_type": "bearer", "expires_in": SESSION_IDLE_TIMEOUT_MINUTES * 60}
5) backend/app/api/dependencies.py:26-28 get_current_user: `if user is None or user.is_active is False: raise credentials_exception`. Con tokens de 24 h, un usuario desactivado no debe seguir dentro ni poder renovar. Se usa `is False` porque la columna acepta NULL en filas viejas.
6) .env.example:17: documentar `SESSION_IDLE_TIMEOUT_MINUTES=1440` (minutos sin uso antes de cerrar la sesión) y anotar que ACCESS_TOKEN_EXPIRE_MINUTES ya no controla el login.

FRONTEND
7) NUEVO frontend/src/lib/session.js (JS puro, para probarlo con node, como pricing.js o safe-return-to.js):
   - `RENOVAR_TRAS_MS = 10*60*1000`.
   - `leerPayload(token)`: decodifica la 2.ª parte base64url (reemplaza -/_ y añade el relleno) con atob y JSON.parse. Devuelve null si el token no es válido.
   - `estadoSesion(payload, ahoraMs, ultimaActividadMs)` devuelve: 'sin-token' si el payload es null o no tiene exp; 'vencida' si exp*1000 <= ahora; 'renovar' si (iat ausente o ahora - iat*1000 >= RENOVAR_TRAS_MS) y ultimaActividad > iat*1000; 'vigente' en otro caso.
8) frontend/src/lib/api.ts:15-50, se reemplaza la redirección dura:
   - `export class SesionVencidaError extends Error { status = 401 }`, con el mensaje 'Tu sesión venció. Inicia sesión nuevamente para continuar.'
   - `registrarReautenticacion(fn: (() => Promise<void>) | null)`.
   - `pedirReautenticacion()`: una sola promesa compartida mientras esté pendiente; si no hay manejador, la rechaza.
   - `hayReautenticacionPendiente()`.
   - `renovarSesion(): Promise<'ok'|'no-autorizado'|'error'>`: hace POST /auth/refresh con fetch directo (no apiFetch, para evitar recursión) y una sola promesa en curso. Si responde 200, guarda localStorage.token.
   - `apiFetch(path, options = {}, _reintento = false)`. Ante un 401:
     (a) Hay manejador registrado y no es reintento: `try { await pedirReautenticacion() } catch { throw new SesionVencidaError() }` y luego `return apiFetch(path, options, true)`. Es un solo reintento, con el token nuevo; el 401 garantiza que el servidor no ejecutó nada.
     (b) No hay manejador (fuera del dashboard, o antes de que AuthGuard autorice): se mantiene el comportamiento actual (borrar token, guardar returnUrl, location.replace una sola vez) y se lanza SesionVencidaError.
     (c) Es un reintento: se lanza SesionVencidaError sin redirigir.
9) NUEVO frontend/src/components/SessionKeeper.tsx ('use client'):
   - Al montar llama `registrarReautenticacion(() => new Promise((res, rej) => { pendientes.push({res, rej}); setAbierto(true) }))`. Al desmontar, `registrarReautenticacion(null)`.
   - La actividad se escucha con 'pointerdown', 'keydown', 'wheel' y 'touchstart' en window ({passive:true, capture:true}). Cada evento actualiza `ultimaActividad` (ref, iniciado en Date.now() al montar). Como máximo cada 30 s escribe localStorage 'last_activity' (se comparte entre pestañas) y llama a `revisar()`.
   - También se llama a `revisar()` en 'visibilitychange' (cuando la pestaña vuelve a estar visible) y con un setInterval de 60 s.
   - `revisar()`: si el modal está abierto, no hace nada. Calcula `estadoSesion(leerPayload(getToken()), Date.now(), max(ref, last_activity))`. Con 'vencida' o 'sin-token' abre el modal (sin hacer ninguna petición). Con 'renovar' llama `renovarSesion()`; si devuelve 'no-autorizado', abre el modal; si devuelve 'error', reintenta en el siguiente ciclo.
   - Escucha el evento 'storage' de la clave 'token': si otra pestaña guarda un token no vencido, cierra el modal y resuelve las peticiones pendientes.
   - Modal propio con `fixed inset-0 z-[100]`, encima de los Modal z-50, sin botón X: usuario de solo lectura (localStorage.user_email), contraseña, y los botones 'Continuar' y 'Salir'.
     'Continuar': `login(email, pass)` de lib/api, guarda localStorage.token y last_activity, resuelve los pendientes (apiFetch reintenta) y cierra.
     'Salir': rechaza los pendientes, borra el token, guarda returnUrl = pathname+search y hace router.replace('/login?reason=session-expired').
10) frontend/src/app/dashboard/layout.tsx:12-21: renderizar <SessionKeeper /> dentro de <AuthGuard>, junto a <AlertasBadge />.
11) frontend/src/components/AuthGuard.tsx:13-59:
   - Antes de llamar /auth/me: si no hay token o estadoSesion(...,0) es 'vencida' o 'sin-token', ir a login solo si todavía no estaba autorizado (useRef autorizado). Si ya lo estaba, el modal de SessionKeeper se encarga.
   - En el catch: con SesionVencidaError, login solo si no estaba autorizado. Con cualquier otro error (red caída o 500) NO se borra el token ni se cierra la sesión: si no estaba autorizado, se muestra la pantalla de reintento; si ya lo estaba, solo se escribe en consola.
   - returnUrl = pathname + window.location.search (hoy se pierde la query).
12) frontend/src/components/AlertasBadge.tsx:13-18: al inicio de load(), `if (hayReautenticacionPendiente() || document.visibilityState === 'hidden') return;`. Así no se acumulan cientos de consultas esperando el modal en una pestaña olvidada.
13) frontend/package.json:10: añadir `&& node tests/test_session.mjs` al script test.
```

**Comportamiento esperado:**

```text
- La sesión dura 24 h desde la última renovación. Se renueva sola, como máximo cada 10 minutos, pero solo si el usuario interactuó (clic, tecla, rueda o toque, en cualquier pestaña) después de emitirse el token. Las consultas automáticas (contador de atrasados cada 5 min, etc.) NO cuentan como uso. Por eso se cierra entre 23 h 50 min y 24 h después del último uso, y nunca mientras se trabaja. No hay tope absoluto.
- La revisión corre cada 60 s, al volver a la pestaña y en la primera interacción. Si el token ya venció, el modal aparece de inmediato, antes de que el usuario intente guardar.
- Si una petición recibe 401 dentro del dashboard, no hay recarga de página. Se abre el modal 'Tu sesión se cerró', con el texto 'Vuelve a escribir tu contraseña para continuar. Lo que tienes en pantalla no se pierde.' Al entrar, la acción pendiente (p. ej. la nota del chatter de venta/[id], hoy :148-161) se reenvía una sola vez y termina normal. Ya no sale el alert 'Error al registrar nota: Tu sesión venció...'.
- Errores del modal: 'Contraseña incorrecta.' con 401 y 'No se pudo conectar con el servidor. Intenta de nuevo.' con otros fallos. 'Salir' lleva a /login?reason=session-expired y después de iniciar sesión se vuelve a la misma URL.
- Si /auth/me falla por red o 500 en la primera carga, se muestra 'No se pudo verificar tu sesión. Revisa la conexión e intenta de nuevo.' con el botón 'Reintentar'. Ya no se cierra la sesión por eso.
- Un usuario desactivado (is_active = false) recibe 401 en todas las rutas y en /auth/refresh.
- Fuera del dashboard (sin SessionKeeper montado), apiFetch conserva la redirección actual a /login.
```

**Pruebas (diseño):**

```text
BACKEND (nuevo backend/tests/test_sesion_renovacion.py, mismo estilo de auth(token) y fixtures de conftest; SECRET_KEY y ALGORITHM se importan de app.api.dependencies y SESSION_IDLE_TIMEOUT_MINUTES de app.api.v1.auth, porque test_jwt_expiration recarga app.core.security):
1) test_refrescar_sesion_devuelve_token_nuevo_de_24_horas(app_client, user_admin, admin_token): POST /api/v1/auth/refresh devuelve 200; access_token != admin_token; payload.sub == str(user_admin.id); exp - ahora está en SESSION_IDLE_TIMEOUT_MINUTES*60 ± 120 s; 'iat' existe y está a menos de 120 s de ahora.
2) test_refrescar_con_token_vencido_da_401: token con expires_delta=timedelta(minutes=-1) recibe 401.
3) test_refrescar_sin_token_da_401: sin header recibe 401.
4) test_usuario_desactivado_no_renueva_ni_usa_su_token(db, user_admin, admin_token): user_admin.is_active=False y commit; POST /auth/refresh da 401 y GET /auth/me da 401.
5) test_login_emite_sesion_de_24_horas(app_client, user_admin): POST /api/v1/auth/login con data={'username': user_admin.email, 'password': TEST_PASSWORD} (de tests.conftest); exp ≈ ahora + SESSION_IDLE_TIMEOUT_MINUTES; incluye iat.
6) En test_jwt_expiration.py: test_session_idle_timeout_por_defecto_es_1440 (con _reload_sec y os.environ.pop('SESSION_IDLE_TIMEOUT_MINUTES') dentro de patch.dict, devuelve 1440; con '90' devuelve 90) y test_create_access_token_incluye_iat. Las pruebas existentes no cambian. test_get_current_user_accepts_fresh_token sigue pasando porque el MagicMock no es `False`.
Ejecutar con el runner de ROLLBACK del scratchpad (run_tests_rollback.py), nunca pytest directo sobre erp_test.
FRONTEND (node, Node 24 quita los tipos de .ts):
7) NUEVO frontend/tests/test_session.mjs: leerPayload decodifica base64url con '-' y '_' y devuelve null con basura. estadoSesion: exp pasado da 'vencida'; iat de hace 5 min con actividad da 'vigente'; iat de hace 11 min sin actividad posterior da 'vigente' (no se renueva sola); iat de hace 11 min con actividad posterior da 'renovar'; sin iat y con actividad da 'renovar'; null da 'sin-token'.
8) REESCRIBIR frontend/tests/test_apifetch_401.mjs para que importe el apiFetch real (`await import('../src/lib/api.ts')` después de simular window, localStorage, sessionStorage y fetch). Hoy reimplementa la función y no prueba el código real. Casos:
   (a) Con manejador registrado: un POST con 401 llama al manejador una vez, location.replace no se llama, y al resolver (el mock guarda un token nuevo) reintenta exactamente 1 vez con 'Bearer <nuevo>' y devuelve el JSON del reintento.
   (b) Dos 401 concurrentes: el manejador se llama 1 vez y ambas peticiones se reintentan.
   (c) Si el manejador rechaza, lanza 'Tu sesión venció...' sin reintentar.
   (d) Sin manejador: se conserva el comportamiento actual (token borrado, returnUrl, una sola redirección, POST sin reintento).
   (e) Un reintento que vuelve a dar 401 no entra en bucle (2 llamadas a fetch en total).
9) `npx tsc --noEmit`, filtrando la salida a api.ts, session.js, SessionKeeper.tsx, AuthGuard.tsx, AlertasBadge.tsx y layout.tsx. next.config tiene ignoreBuildErrors, así que no debe aparecer ningún error nuevo en esos archivos.
10) Manual: con ACCESS de prueba SESSION_IDLE_TIMEOUT_MINUTES=2 en local, escribir en el chatter de un PVEN, esperar 3 min sin tocar nada, pulsar 'Registrar'. Debe aparecer el modal; tras la contraseña, la nota queda guardada y el texto no se perdió. Con la red cortada, recargar /dashboard debe mostrar 'Reintentar', no /login.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No aplica: no hay cambios en la base. Los tokens ya emitidos (de 30 o 60 min, sin iat) siguen válidos hasta que vencen. El frontend los trata como 'sin iat' y los renueva en la primera interacción. Orden de despliegue: primero el backend (/auth/refresh). Si el frontend sale antes, renovarSesion recibe 404 ('error'), no hace nada y se reintenta en el siguiente ciclo.
```

**Riesgos:**

```text
- Un token robado se puede seguir renovando mientras se use, porque no hay tope absoluto (decisión del usuario). El token sigue en localStorage, como ya estaba.
- Antes, un usuario desactivado conservaba el acceso hasta 30-60 min; con el cambio 5 lo pierde de inmediato. Si hay filas con is_active=false que hoy se usan, quedarán fuera: revisarlo antes de desplegar.
- 17 archivos y unas 70 llamadas usan fetch directo (las funciones antiguas de lib/api.ts, agenda, compras/registro, cotiza…), no apiFetch. Con un token vencido muestran un error en vez del modal. Se mitiga porque SessionKeeper detecta el vencimiento en el navegador y abre el modal antes de que el usuario actúe; la pantalla no se recarga, así que no se pierde lo escrito.
- El reintento automático reenvía el mismo body. Es seguro porque un 401 se rechaza antes de ejecutar el handler. No sirve para bodies de tipo stream (no se usan).
- Si en el modal se inicia sesión con otra cuenta, el campo de usuario está bloqueado para evitarlo; 'Salir' es la vía para cambiar de usuario.
- La importación de .ts en los tests de node depende de que Node 24 quite los tipos (api.ts solo usa sintaxis que se puede borrar). Si fallara, mover la lógica del 401 a lib/session.js.
- Fuera de alcance: /store y /chat siguen con la redirección vieja.
```

**Archivos:** `backend/app/core/security.py`, `backend/app/api/v1/auth.py`, `backend/app/api/dependencies.py`, `.env.example`, `frontend/src/lib/session.js`, `frontend/src/lib/api.ts`, `frontend/src/components/SessionKeeper.tsx`, `frontend/src/components/AuthGuard.tsx`, `frontend/src/components/AlertasBadge.tsx`, `frontend/src/app/dashboard/layout.tsx`, `frontend/package.json`, `frontend/tests/test_session.mjs`, `frontend/tests/test_apifetch_401.mjs`, `backend/tests/test_sesion_renovacion.py`, `backend/tests/test_jwt_expiration.py`


### H1 — Siempre en modo claro

**Para el usuario:** Aunque el computador esté en modo oscuro, el sistema se ve siempre en modo claro. El texto de los campos sale oscuro sobre fondo blanco, y los calendarios, listas desplegables y barras de desplazamiento también salen claros.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Cambios (diseño):**

```text
1) frontend/src/app/globals.css:
   - Después de `@import "tailwindcss";` (l.1), añadir `@custom-variant dark (&:where(.dark, .dark *));`. Así las clases dark: de Tailwind v4 dejan de seguir al sistema operativo y solo aplican con una clase .dark que nunca se pone. Hoy no hay ninguna clase dark: en src (verificado); es una salvaguarda.
   - En `:root` (l.3-6), añadir `color-scheme: only light;`. Los controles nativos (date, select, scrollbar) quedan claros y 'only' impide que Chrome/Edge/Safari oscurezcan la página a la fuerza.
   - BORRAR el bloque `@media (prefers-color-scheme: dark) { :root { --background: #0a0a0a; --foreground: #ededed; } }` (l.15-20), resto de create-next-app.
2) frontend/src/app/layout.tsx:1: `import type { Metadata, Viewport } from "next";`. Después de metadata (l.17-20): `export const viewport: Viewport = { colorScheme: "only light" };` ('only light' existe en ColorSchemeEnum de Next 16). Genera <meta name="color-scheme" content="only light">, que actúa antes de que cargue el CSS.
No se toca ningún componente. src/app_mocks_backup/globals.css no se usa.
```

**Comportamiento esperado:**

```text
- body mantiene background #ffffff y color #171717 siempre, sin importar el tema del sistema operativo.
- input, select y textarea sin clase de color heredan #171717 (el preflight de Tailwind pone color: inherit).
- Los selectores de fecha, los desplegables de select y las barras de desplazamiento nativas se dibujan en esquema claro.
- Una clase dark: futura no se activa con el tema del sistema operativo.
```

**Pruebas (diseño):**

```text
1) NUEVO frontend/tests/test_tema_claro.mjs (node, con fs). Lee src/app/globals.css y afirma: no contiene /prefers-color-scheme:\s*dark/; contiene /color-scheme:\s*only light/; contiene '@custom-variant dark'. Además recorre src/ (excluyendo app_mocks_backup) y afirma que ningún .tsx/.ts usa /\bdark:/. Se añade al script test de package.json.
2) `npx tsc --noEmit` sin errores nuevos en app/layout.tsx.
3) Manual en Chrome: DevTools > Rendering > 'Emulate CSS media feature prefers-color-scheme: dark'. Abrir /dashboard/ventas/venta/<id>: el textarea del chatter (:731-733), el select de estado (:487-488) y el textarea de notas (:518-519) deben mostrar color calculado rgb(23, 23, 23). El calendario de un input date debe salir claro. Repetir con Windows en modo oscuro real.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No aplica.
```

**Riesgos:**

```text
Bajo. Ninguna pantalla depende hoy del modo oscuro (no hay clases dark: ni clase .dark). Las secciones con fondo oscuro intencional (botones slate-900, insignias) usan colores explícitos y no cambian.
```

**Archivos:** `frontend/src/app/globals.css`, `frontend/src/app/layout.tsx`, `frontend/tests/test_tema_claro.mjs`, `frontend/package.json`


### H29 — Guardar productos en menos de 1 segundo

**Para el usuario:** Al pulsar 'Guardar productos' en una solicitud, el editor se cierra en menos de un segundo y ya no aparece la pantalla de carga completa. La actividad se actualiza un instante después, sin interrumpir.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Cambios (diseño):**

```text
CAUSA REAL, medida por viajes secuenciales a la base remota 2.24.90.223. No es N+1, ni sincronización con el CRM, ni correo, ni logs: update_solicitud no llama a mover_lead_de_solicitud ni a send_email, y no hay listeners de eventos. El problema es la cantidad de viajes de ida y vuelta, sumada a que el frontend espera una recarga completa:
(a) PATCH de hoy (SC en ASIGNADA), unos 15 viajes: pre_ping, BEGIN, SELECT del usuario, SELECT de la SC, UPDATE, COMMIT (:560); luego db.refresh (:561), que como el commit devolvió la conexión al pool repite pre_ping+BEGIN+SELECT; luego _log (:107) con INSERT+COMMIT; luego _sc_dict (:620), que sobre el objeto expirado tras el commit repite pre_ping+BEGIN+SELECT; y un ROLLBACK al cerrar. Con la SC en PENDIENTE_CONFIRMACION o CONFIRMADA son unos 20-25 (otro _log, revoke_pending_tokens con su propio commit y el commit de :619).
(b) Frontend: productos-solicitud.tsx:59-64 hace `await onGuardado()` = loadSolicitud ([id]/page.tsx:122-142). Eso pone setLoading(true), que cambia toda la página por un spinner (:335-341), y hace GET /solicitudes/{id} (unos 8 viajes: ping, BEGIN, usuario, SC, logs, cots, vens, ROLLBACK). Total de unos 23 viajes de ~80-100 ms, lo que coincide con los ~2,5 s observados.

BACKEND
1) backend/app/api/v1/erp_ventas.py:92-107 `_log`: añadir el parámetro `commit: bool = True`; `db.add(log)` y luego `if commit: db.commit()`.
2) erp_ventas.py:109-138 `_registrar_cambios`: añadir `commit: bool = True`, pasarlo a `_log(..., commit=commit)`. En el except (:135-138), `if commit: db.rollback()`. Con commit=False no se hace rollback: no se ha escrito nada y un rollback desharía el PATCH. Se mantiene el logger.warning.
3) backend/app/core/confirmation_tokens.py:57-76 `revoke_pending_tokens`: añadir `commit: bool = True` y hacer `if commit: db.commit()`.
4) erp_ventas.py, update_solicitud:
   - :560-561: `db.commit(); db.refresh(sc)` pasa a ser `db.flush(); db.refresh(sc)`. Es la misma transacción y no suma ping ni BEGIN. El refresh se conserva porque la foto 'despues' y `.date()` de :589 necesitan valores tipados de la base (el body trae las fechas como string).
   - :564: `_registrar_cambios(db, "SC", sc, antes_log, body, user, commit=False)`.
   - :566, :576, :581, :584 y :600: cada `_log(...)` recibe `commit=False`.
   - :616-619: `revoke_pending_tokens(db, "SC", sc.id, commit=False)` y `sc.gate1_confirmed_at = None` (se quita el `db.commit()` de :619).
   - :620: `resp = _sc_dict(sc); db.commit(); return {"status": "success", "data": resp}`. El dict se arma antes del commit para no releer el objeto expirado.
   - No se agrega with_for_update: `transiciona` ya se captura antes (Round 8) y el UPDATE del flush bloquea la fila hasta el commit.
5) erp_ventas.py:443-446 get_solicitud: `.order_by(ActivityLog.created_at.asc(), ActivityLog.id.asc())`. Los renglones de un mismo PATCH ahora se insertan en el mismo flush y pueden compartir created_at; el id conserva el orden causal ('editado' antes de 'cambio de estado').

FRONTEND
6) frontend/src/app/dashboard/ventas/solicitud/[id]/productos-solicitud.tsx:
   - :26: `onGuardado: (sc?: any) => void;`
   - guardar (:53-69): `const r = await apiFetch(...PATCH...); setEditando(false); onGuardado(r?.data);`, sin await.
7) frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx:
   - loadSolicitud (:122-142) pasa a `useCallback(async (opts?: { silencioso?: boolean }) => {...})`. Con silencioso: no llama setLoading ni setLoadError, no reescribe editForm, y si falla deja lo que hay en pantalla. Solo hace setSolicitud(d).
   - :673: `onGuardado={(scNueva) => { if (scNueva) setSolicitud((prev: any) => ({ ...prev, ...scNueva })); void loadSolicitud({ silencioso: true }); }}`. Se conservan actividades, cotizaciones y pedidos_venta de prev hasta que llega la recarga.
   - Opcional, mismo patrón: saveEdit (:186-187).
```

**Comportamiento esperado:**

```text
- PATCH /ventas/solicitudes/{id} es UNA sola transacción. El cambio de la SC, los renglones de Actividad y la revocación del enlace de confirmación (si cambió el estado) se confirman juntos.
- Si falla solo el armado del renglón de Actividad (error de Python en cambios_documento), la SC se guarda igual sin renglón, como hoy, con un warning en el log. Si falla la base al escribir, no se guarda nada y se devuelve el error. Hoy podía quedar la SC guardada sin actividad y con el enlace viejo vigente, porque la revocación iba en otra transacción (:617-619).
- La respuesta tiene la misma forma (_sc_dict).
- La Actividad se ordena por created_at y luego por id.
- En pantalla, el botón 'Guardar productos' solo espera el PATCH. Los productos y el estado (p. ej. PENDIENTE_CONFIRMACION → ASIGNADA) se pintan con la respuesta. La Actividad, las cotizaciones y los pedidos se refrescan en segundo plano sin spinner de página.
- Viajes esperados del PATCH: unos 8 (pre_ping, BEGIN, usuario, SC, UPDATE, SELECT del refresh, INSERT de actividad agrupado, COMMIT) frente a ~15 hoy, y ~11 frente a ~20-25 cuando hay transición. Con ~80-100 ms por viaje: ~0,65-0,8 s percibidos, frente a ~2-2,5 s.
```

**Pruebas (diseño):**

```text
BACKEND (nuevo backend/tests/test_solicitud_guardado_una_transaccion.py; reutiliza los helpers _sc, LINEA y _token_usado al estilo de test_solicitud_productos_para_cotizar.py, y cuenta eventos con `from sqlalchemy import event` y `from tests.conftest import test_engine`):
1) test_guardar_productos_de_la_sc_usa_una_sola_transaccion: SC 'SC-RAP001' en ASIGNADA con [LINEA]. event.listen(test_engine, 'checkout', ...) y event.listen(test_engine, 'commit', ...) solo durante el PATCH {'productos':[LINEA, {'product_name':'Silla','qty':2}], 'updated_by':'test'}, y event.remove en el finally. Se afirma: 200; data.productos[1].product_name == 'Silla'; checkouts == 1 y commits == 1 (hoy dan 3 y 2, así que la prueba falla antes del arreglo); hay exactamente un ActivityLog SC con action 'UPDATED' y extra_data.cambios incluye etiqueta 'Producto agregado'.
2) test_cambiar_productos_con_enlace_pendiente_revoca_el_enlace_en_la_misma_transaccion: SC 'SC-RAP002' en PENDIENTE_CONFIRMACION con un token de create_confirmation_token(db,'SC',sc.id). PATCH con qty 3. Se afirma: data.estado == 'ASIGNADA'; commits == 1; _token_usado(db, token); gate1_confirmed_at es None. En GET /solicitudes/{id}, las dos últimas acciones de 'actividades' son ['UPDATED','ESTADO_CHANGED'], en ese orden.
3) test_si_falla_armar_la_actividad_los_productos_igual_se_guardan(monkeypatch): monkeypatch.setattr(cambios_documento, 'describir', función que lanza RuntimeError). PATCH devuelve 200; tras db.refresh(sc) hay 2 productos; no hay ActivityLog de la SC.
4) test_actividad_de_la_sc_desempata_por_id: dos ActivityLog con el mismo created_at insertados en orden B y luego A. GET los devuelve como [B, A].
REGRESIÓN: test_solicitud_productos_para_cotizar.py, test_actividad_cambios_documentos.py, test_fecha_entrega_actividad_log.py y test_confirmacion_solicitud.py. Todo con el runner de ROLLBACK del scratchpad (run_tests_rollback.py), nunca pytest directo sobre erp_test.
FRONTEND: `npx tsc --noEmit` sin errores nuevos en productos-solicitud.tsx ni en [id]/page.tsx. Manual en DevTools > Network: guardar productos en una SC ASIGNADA y otra PENDIENTE_CONFIRMACION; el PATCH debe durar menos de 1 s, el editor debe cerrarse al terminar el PATCH, sin spinner de página, y el GET posterior no debe bloquear. Comparar el tiempo de espera (TTFB) del PATCH antes y después.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No aplica. Los renglones de Actividad ya guardados no cambian; el desempate por id solo afecta a empates de hora.
```

**Riesgos:**

```text
- La latencia real a 2.24.90.223 no se midió (la tarea era de solo lectura). Si después del cambio el PATCH sigue por encima de 1 s, el siguiente paso es quitar el db.refresh de la transacción (normalizando las fechas del body a mano; ahorra 1 viaje) o usar un Postgres local en desarrollo. En producción, si el backend y la base están en el mismo servidor, la mejora se nota menos porque el problema es la latencia.
- Cambia el caso de error: si la base falla al insertar la actividad, ahora no se guarda nada. Antes la SC quedaba guardada. Es más correcto (atómico).
- Las demás llamadas a _log, _registrar_cambios y revoke_pending_tokens (COT :1075, VEN :1494, confirmacion_publica, enviar-confirmacion, cancelar, restaurar) no cambian, porque commit=True es el valor por defecto.
- La carrera previa con la confirmación pública (el cliente consume el token justo antes del PATCH) no empeora; la ventana entre el commit de la SC y la revocación desaparece.
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `backend/app/core/confirmation_tokens.py`, `frontend/src/app/dashboard/ventas/solicitud/[id]/productos-solicitud.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `backend/tests/test_solicitud_guardado_una_transaccion.py`


### U9+H14 — Ir a la solicitud al crearla

**Para el usuario:** Al crear una solicitud, el sistema te lleva directo a ella. Si vuelves a la lista, aparece arriba. Si recargas la lista, ya no se abre solo el formulario de 'Nueva solicitud'. Además, la tarjeta que se crea en el CRM muestra el número de la solicitud.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- ¿Corrijo los leads del CRM ya creados cuya descripción quedó sin el número de la solicitud? → **Sí, con respaldo**

**Cambios (diseño):**

```text
1) frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx:879-882, consumir ?new=1:
   useEffect(()=>{ if(searchParams?.get('new')){ setShowCreate(true); window.history.replaceState(null,'','/dashboard/ventas/solicitud'); } },[searchParams]);
   Next 16 integra history.replaceState con useSearchParams. El efecto vuelve a correr con new=null y no hace nada; no hay remontaje, así que showCreate sigue en true. Alternativa equivalente: router.replace('/dashboard/ventas/solicitud',{scroll:false}).
2) solicitud-client.tsx:988-1003, en createSolicitud después del POST:
   - `const nueva = scData?.data;`
   - :996: la descripción del lead pasa a `SC creada: ${nueva?.numero||''} - ${form.notas||''}`. Hoy usa scData?.numero, que no existe, y queda 'SC creada:  - …'.
   - Después del bloque del lead (que se mantiene sin await): `if(nueva?.id){ router.push(`/dashboard/ventas/solicitud/${nueva.id}`); return; }`. El return dentro del try se salta setSaving(false), así que el botón 'Crear' queda bloqueado hasta que cambia la página y no se puede crear dos veces.
   - Fallback solo si la respuesta no trae id: el comportamiento actual (showToast('Solicitud creada'); setShowCreate(false); resetCreateForm(); load();).
3) Sin cambios en nueva/page.tsx (sigue redirigiendo a ?new=1, que ahora se consume) ni en el backend: create_solicitud ya devuelve {data:_sc_dict(sc)} con id y numero (erp_ventas.py:399).
```

**Comportamiento esperado:**

```text
- Hub > 'Nueva Solicitud' (/dashboard/ventas/solicitud/nueva) abre el formulario en la lista, y la URL queda /dashboard/ventas/solicitud sin ?new=1. Al recargar (F5) no se abre el formulario.
- Al crear (desde el Hub o desde el botón 'Nueva Solicitud' de la lista), el navegador va a /dashboard/ventas/solicitud/<id>, que muestra el número SC-AAAANNNN. La flecha ← del detalle o el botón Atrás vuelven a la lista, que se recarga al montarse y muestra la SC arriba (orden created_at desc).
- Cerrar o cancelar el formulario no deja parámetros en la URL.
- El lead del CRM (sales_orders.lead_description) queda como 'SC creada: SC-AAAANNNN - <notas>'.
```

**Pruebas (diseño):**

```text
BACKEND (contrato del que depende la navegación; nuevo backend/tests/test_solicitud_crear_abre_detalle.py):
1) test_crear_solicitud_devuelve_id_y_numero_para_abrir_el_detalle(app_client, admin_token): POST /api/v1/ventas/solicitudes con {'customer_name':'Cliente Prueba','productos':[{'product_name':'Cuna','qty':1}],'created_by':'test'} devuelve 201; data.id es int; data.numero empieza por 'SC-'. GET /solicitudes/{id} devuelve 200 con el mismo numero. GET /solicitudes?limit=200 incluye ese id como primer elemento ('queda en la tabla').
Ejecutar con el runner de ROLLBACK del scratchpad.
FRONTEND: `npx tsc --noEmit` sin errores nuevos en solicitud-client.tsx. Manual:
(a) Hub > Nueva Solicitud: la URL final no tiene ?new y el formulario está abierto; F5 no lo abre.
(b) Crear una SC: aterriza en /dashboard/ventas/solicitud/<id> con su número; el botón 'Crear' no permite doble clic.
(c) ← vuelve a la lista con la SC arriba.
(d) El lead en el CRM muestra 'SC creada: SC-…'.
(e) Crear una SC de tipo 'Soporte Tecnico': también abre su detalle y no crea lead.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
Hay leads del CRM ya creados con la descripción sin número ('SC creada:  - …'). Corrección opcional, con respaldo previo:
UPDATE sales_orders so SET lead_description = 'SC creada: ' || cr.numero || substr(so.lead_description, length('SC creada: ') + 1) FROM customer_requests cr WHERE so.canonical_customer_request_id = cr.id AND so.lead_source = 'SC' AND so.lead_description LIKE 'SC creada:  -%';
lead_description es Text, así que no hay riesgo de truncar.
```

**Riesgos:**

```text
- La creación del lead del CRM sigue en segundo plano. La navegación del lado del cliente (router.push) no cancela ese fetch; si el usuario cierra la pestaña en ese instante el lead puede no crearse, igual que hoy.
- Fuera de alcance de este grupo: asistente_omnicanal/page.tsx:283 también crea SC y no navega (está en el pendiente del Asistente Omnicanal), y agenda/page.tsx:316 usa otro endpoint del CRM.
```

**Archivos:** `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `backend/tests/test_solicitud_crear_abre_detalle.py`


### N4 — No cancelar una solicitud con cotización o pedido activos

**Para el usuario:** Ya no se podrá cancelar una solicitud que tenga una cotización o un pedido de venta activos. El sistema dice cuál es y qué hay que hacer antes: cancelar el pedido y/o rechazar la cotización. Funciona igual desde la solicitud, la lista, el Hub y las acciones masivas, y siempre se pide el motivo.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Una cotización "Vencida", ¿cuenta como activa (hay que rechazarla antes de cancelar la solicitud)? → **Sí**
- ¿El cliente pasa a "perdido" en el CRM al cancelar la solicitud (y no al rechazar una cotización)? → **Sí**

**Cambios (diseño):**

```text
BACKEND (backend/app/api/v1/erp_ventas.py)
1) Helpers nuevos después de _lista_compras_items_de (~l.166):
   - _pven_vigente_de_cotizacion(db, cot_id): primer SaleOrder con cot_id == cot_id y estado != 'CANCELADO', ordenado por id desc.
   - _documentos_activos_de_solicitud(db, sc_id) -> (cots_activas, pvens_activos). Las COT son las de sc_id con estado != 'RECHAZADA'. Los PVEN son los que tienen estado != 'CANCELADO' y, además, sc_id == sc_id o cot_id dentro de las COT de esa SC (el mismo filtro que get_solicitud, l.455-458).
   - _describir_documentos(cots, pvens): devuelve 'pedido de venta PVEN-…, cotización COT-…'.
2) cancelar_solicitud (l.1988-2021):
   - Cargar la SC con .with_for_update(), para que no corra en paralelo con confirmar_solicitud.
   - Antes de modificar nada: si _documentos_activos_de_solicitud devuelve algo, lanzar HTTPException(409, mensaje).
   - Si la SC ya está CANCELADA (caso 'Enviar a la papelera' de las SC que se cancelaron con la pastilla vieja): no volver a anexar '[CANCELADA] Razón' a notas ni registrar otro CANCELLED. Solo completar eliminada_at (NOW) y razon_cancelacion si faltan, y registrar action 'SENT_TO_TRASH' con 'Solicitud enviada a la papelera'.
   - Después del cancel: mover_lead_de_solicitud(sc.id, 'CANCELLED', db) dentro de try/except con logger. El lead se marca perdido aquí y ya no al rechazar una COT (ver N7).
3) update_solicitud, después de los checks de l.478-492:
   - nuevo = body.get('estado'). Si nuevo == 'CANCELADA' y sc.estado != 'CANCELADA' → 400.
   - Si nuevo existe, es distinto de sc.estado y no está en ('BORRADOR',) → 400. Esto también cierra los estados basura que hoy manda el cambio masivo del Hub (EN_PROCESO, ENTREGADO… sobre una SC).
4) _sincronizar_estado_solicitud_desde_cotizacion (l.914-925): tras cargar la SC, `if sc.estado == 'CANCELADA': return`. Una SC cancelada nunca se revive.
5) Guardas para que no haya COT vivas bajo una SC cancelada. Las tres responden 409 cuando la SC vinculada está CANCELADA:
   - update_cotizacion, antes del loop (~l.947), si body['estado'] existe, es != old_estado y es != 'RECHAZADA'.
   - enviar_cotizacion_para_confirmacion, después del check de estado (~l.1152).
   - create_cotizacion (l.842-849), cuando sc existe.
FRONTEND
6) solicitud/solicitud-client.tsx:
   - l.61-63: ESTADOS_SC_MANUALES = solo ['BORRADOR'] (se quita CANCELADA y se actualiza el comentario).
   - RowMenu l.511-514: 'Enviar a la papelera' solo si !sc.eliminada_at.
   - changeEstado l.935-944: quitar la rama CANCELADA.
   - bulkAction('delete') l.950-964: ya no hace PATCH. Abre el modal de motivo con cancelTarget: number[] (se excluye Soporte).
   - cancelWithReason l.891-901: recorre los ids con POST /cancelar. Acumula err.message y muestra el toast 'N solicitudes canceladas', más 'No se pudieron cancelar: SC-…: <mensaje>' para las que fallaron.
7) solicitud/[id]/page.tsx:
   - Nueva variable cotizacionesActivas = cotizaciones.filter(c => c.estado !== 'RECHAZADA'); pedidosVigentes ya existe (l.359).
   - Las pastillas de l.727-729 ya no muestran Cancelada (se toman de ESTADOS_SC_MANUALES); en changeEstado (l.196) se quita el confirm de CANCELADA.
   - Modal 'Cancelar Solicitud' (l.841-848): si cotizacionesActivas o pedidosVigentes no están vacíos, mostrar la lista de pasos con enlaces ?return_to en lugar del textarea, y solo el botón 'Entendido'.
8) dashboard/ventas/page.tsx (Hub):
   - handleBulkDelete(ids: string[]) recibe los ids explícitos. Esto corrige l.1004: hoy hace setSelectedIds(...) y llama handleBulkDelete() con la selección vieja, lo que cancela documentos equivocados o ninguno.
   - Abre un Modal 'Cancelar documentos' con el motivo (mínimo 5 caracteres) y procesa en orden VEN → COT → SC: VEN PATCH {estado:'CANCELADO', cancellation_reason, updated_by}; COT PATCH {estado:'RECHAZADA', updated_by}; SC POST /ventas/solicitudes/{id}/cancelar {razon, user_name}.
   - Se quita `.catch(()=>{})` (l.341 y 352): los fallos se acumulan y el toast los muestra con detalle. Así, si se selecciona la cadena completa, sale bien.
   - handleDrop (l.458): soltar una SC o un VEN en 'Cancelado' abre el mismo modal con [idStr] en vez del PATCH.
   - handleBulkChangeEstado (l.336-344): solo se aplica a filas VEN y reporta las omitidas.
   - Panel rápido VEN (l.1217): se quita 'CANCELADO'.
```

**Comportamiento esperado:**

```text
- Una SC solo se puede cancelar si todas sus COT están RECHAZADA y todos sus PVEN están CANCELADO. Una COT VENCIDA cuenta como activa.
- Mensaje 409: «No se puede cancelar la solicitud {SC}: tiene documentos activos ({pedido de venta PVEN-…, cotización COT-…}). Primero {cancela el pedido de venta}{ y }{rechaza la cotización}; después podrás cancelar la solicitud.»
- PATCH /solicitudes con estado CANCELADA → 400: «Para cancelar una solicitud usa el botón «Cancelar Solicitud»: pide el motivo y revisa que no tenga cotizaciones ni pedidos activos.»
- Otro estado no manual → 400: «El estado «{X}» no se puede asignar a mano a una solicitud; solo «Borrador».»
- COT de una SC cancelada (retomar, enviar o crear) → 409: «La solicitud {SC} está cancelada: restáurala desde la Papelera antes de retomar o enviar esta cotización.»
- Toda cancelación de SC pasa por /cancelar: queda con motivo, eliminada_at y lead CANCELLED.
- Rechazar una COT o eliminar una SC siguen sin pedir permiso especial.
```

**Pruebas (diseño):**

```text
Archivo nuevo backend/tests/test_cancelar_solicitud_con_documentos.py (estilo test_solicitud_productos_para_cotizar.py: helper _sc(db, numero, user_admin, **campos) y auth()).
1) test_cancelar_solicitud_con_cotizacion_activa_se_bloquea:
   - Preparación: SC ASIGNADA + COT BORRADOR con sc_id.
   - POST /cancelar {razon:'Cliente desistio'} → 409. detail contiene 'COT-' y 'rechaza la cotización'.
   - db.refresh: estado ASIGNADA y eliminada_at None.
2) test_cancelar_solicitud_con_pedido_activo_se_bloquea: SC + COT CONFIRMADA + SaleOrder PENDIENTE_COMPRA (sc_id y cot_id) → 409. detail menciona el PVEN y 'cancela el pedido de venta'.
3) test_cancelar_solicitud_con_cotizacion_rechazada_y_pedido_cancelado_funciona: COT RECHAZADA + SaleOrder CANCELADO → 200. estado CANCELADA, eliminada_at no nulo; con lead creado vía /crm/leads, su status queda CANCELLED.
4) test_patch_generico_no_cancela_solicitud: PATCH {estado:'CANCELADA'} → 400, 'Cancelar Solicitud' en detail, estado sin cambio.
5) test_patch_solicitud_rechaza_estados_no_manuales: PATCH {estado:'ENTREGADO'} → 400.
6) test_sincronizacion_no_revive_solicitud_cancelada: SC CANCELADA + COT CONFIRMADA vinculada. Llamar _sincronizar_estado_solicitud_desde_cotizacion(cot, db) → SC sigue CANCELADA.
7) test_no_se_retoma_ni_envia_cotizacion_de_solicitud_cancelada: SC CANCELADA + COT RECHAZADA con precio.
   - PATCH COT {estado:'BORRADOR'} → 409.
   - Poner la COT en BORRADOR por DB y llamar POST /enviar-confirmacion → 409.
8) test_enviar_a_papelera_una_sc_ya_cancelada_completa_eliminada_at: SC CANCELADA sin eliminada_at → POST /cancelar → 200. eliminada_at se completa y las notas no se duplican.
Ajustar test_confirmacion_solicitud.py::test_pill_cancelar_restaurar_reenviar_revoca_token_viejo en el paso (a): el PATCH CANCELADA debe dar 400; luego POST /cancelar → 200 y assert _used_at(t1) is not None. Se mantiene la intención original.
Frontend: `npx tsc --noEmit` y `npm test`. Manual en el Hub: seleccionar SC+COT+PVEN de una misma cadena → 'Cancelar documentos' cancela los 3; seleccionar solo la SC → el toast muestra el bloqueo.
Nota: correr pytest con el runner con ROLLBACK, no el normal sobre erp_test.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
Consultas de solo lectura para revisar con el usuario:
(a) SC canceladas que tienen documentos activos:
   SELECT cr.id, cr.numero FROM customer_requests cr WHERE cr.estado='CANCELADA' AND (EXISTS(SELECT 1 FROM sales_quotations q WHERE q.sc_id=cr.id AND q.estado<>'RECHAZADA') OR EXISTS(SELECT 1 FROM sale_orders s WHERE s.sc_id=cr.id AND s.estado<>'CANCELADO'));
   Se decide caso por caso: restaurar la SC, o rechazar la COT / cancelar el PVEN.
(b) SC que la sincronización revivió:
   SELECT id, numero, estado FROM customer_requests WHERE eliminada_at IS NOT NULL AND estado<>'CANCELADA';
(c) Solo con OK del usuario, para las SC canceladas con la pastilla vieja:
   UPDATE customer_requests SET eliminada_at=NOW(), razon_cancelacion=COALESCE(razon_cancelacion,'Cancelada con el cambio de estado manual (sin motivo registrado)') WHERE estado='CANCELADA' AND eliminada_at IS NULL AND tipo_solicitud<>'Soporte Tecnico';
   Se usa NOW() y no updated_at para no dejarlas purgables de inmediato.
```

**Riesgos:**

```text
- Quien hoy cancela con la pastilla o el cambio masivo empezará a ver errores: es lo que se busca, pero el Hub debe mostrar el motivo del rechazo y no tragárselo.
- El orden VEN→COT→SC del Hub depende de H46: al cancelar el PVEN la COT vuelve a Borrador y luego se rechaza.
- Contar Vencida como activa obliga a un clic más.
- Soporte Técnico sigue excluido (ya lo estaba).
- Hay que cambiar 1 test existente.
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/page.tsx`, `backend/tests/test_cancelar_solicitud_con_documentos.py`, `backend/tests/test_confirmacion_solicitud.py`


### N4 (Papelera) — La Papelera conserva lo que tiene historial

**Para el usuario:** La Papelera de solicitudes deja de aparecer vacía de golpe. Las solicitudes canceladas que tienen cotizaciones o pedidos en su historial se conservan con la etiqueta 'Se conserva (tiene documentos vinculados)'. 'Eliminar permanentemente' explica por qué no se puede, en lugar de fallar.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Esas solicitudes con historial, ¿se conservan siempre? → **Sí, se conservan**

**Cambios (diseño):**

```text
BACKEND (erp_ventas.py)
1) get_papelera (l.402-434):
   - La purga va en su propio try/except: db.rollback() + logger.exception('No se pudo purgar la papelera de solicitudes'). Un fallo ya no tumba el listado.
   - El DELETE solo borra filas sin referencias:
     DELETE FROM customer_requests cr WHERE cr.estado='CANCELADA' AND cr.eliminada_at IS NOT NULL AND cr.eliminada_at < NOW()-INTERVAL '30 days' AND NOT EXISTS(SELECT 1 FROM sales_quotations q WHERE q.sc_id=cr.id) AND NOT EXISTS(SELECT 1 FROM sale_orders s WHERE s.sc_id=cr.id) AND NOT EXISTS(SELECT 1 FROM sales_orders l WHERE l.canonical_customer_request_id=cr.id)
     sales_orders.canonical_customer_request_id también es FK sin cascade (models/sales.py:37), así que hoy cualquier SC con lead rompe la purga. customer_request_lines tiene ON DELETE CASCADE y no estorba.
   - El SELECT agrega la columna tiene_documentos (OR de los mismos EXISTS). dias_restantes = None si tiene_documentos.
   - Si el SELECT falla: logger.exception + HTTPException(500, 'No se pudo cargar la papelera de solicitudes'). Se elimina el `except: return {data: []}`, que esconde el error como 'vacía'.
2) eliminar_permanente (l.2029-2038): antes de db.delete, consultar las mismas tres referencias. Si existen → 409 con mensaje. Además, envolver delete+commit en try/except IntegrityError → rollback + 409, como red de seguridad.
FRONTEND (solicitud-client.tsx l.1270-1287)
- Si sc.dias_restantes == null: mostrar 'Se conserva (tiene documentos vinculados)' en lugar de 'N días'.
- Ocultar 'Eliminar permanentemente' si sc.tiene_documentos.
- loadPapelera (l.884-889): en el catch mostrar showToast('No se pudo cargar la papelera: '+err.message,'err') en lugar de dejar la lista vacía en silencio.
```

**Comportamiento esperado:**

```text
- Purga automática a los 30 días solo de SC canceladas sin cotizaciones, pedidos ni leads vinculados. Las demás se conservan como historial.
- Mensaje 409 de eliminar: «No se puede eliminar definitivamente la solicitud {SC}: tiene documentos vinculados ({cotización COT-…, pedido de venta PVEN-…, lead del CRM}). Se conserva en la Papelera como historial.»
- Un error de base de datos ya no deja la Papelera vacía para todos: queda registrado en el log y la UI avisa.
```

**Pruebas (diseño):**

```text
En backend/tests/test_cancelar_solicitud_con_documentos.py:
1) test_papelera_no_falla_con_solicitud_referenciada:
   - Preparación: SC-A CANCELADA con eliminada_at = hace 40 días y una COT RECHAZADA vinculada; SC-B CANCELADA con eliminada_at = hace 40 días y sin referencias.
   - GET /ventas/solicitudes/papelera → 200.
   - SC-A aparece con tiene_documentos True y dias_restantes None. SC-B ya no existe en la DB.
2) test_eliminar_permanente_solicitud_con_documentos_devuelve_409: SC CANCELADA + COT RECHAZADA → DELETE /permanente → 409, 'Se conserva' en detail, y la SC sigue en la DB.
3) test_eliminar_permanente_solicitud_sin_documentos_funciona: → 200 y la fila se borra.
Frontend: tsc.
Correr con el runner con ROLLBACK.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No aplica migración. Consulta opcional para ver cuántas no se purgaban:
SELECT COUNT(*) FROM customer_requests cr WHERE estado='CANCELADA' AND eliminada_at < NOW()-INTERVAL '30 days';
```

**Riesgos:**

```text
- Las SC con historial nunca se purgarán. Es lo más seguro, porque no se borra nada referenciado, pero la Papelera crecerá.
- La prueba 1 borra de verdad, dentro de la transacción de la prueba, las SC canceladas hace más de 30 días sin referencias: usar el runner con ROLLBACK.
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `backend/tests/test_cancelar_solicitud_con_documentos.py`


### N7 — Rechazar una cotización deja la solicitud activa

**Para el usuario:** Si rechazas o eliminas una cotización, la solicitud sigue activa y aparece el botón 'Crear nueva cotización' con los productos que el cliente ya confirmó. El cliente no queda como perdido en el CRM, y los textos de los avisos ahora dicen la verdad.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Para la nueva cotización, si los productos no cambiaron, ¿el cliente debe volver a confirmar la solicitud? → **No, solo confirma la cotización nueva**

**Cambios (diseño):**

```text
BACKEND (erp_ventas.py)
1) _MAPA_ESTADO_COTIZACION_A_SOLICITUD (l.904-911): quitar 'RECHAZADA'.
2) _sincronizar_estado_solicitud_desde_cotizacion (l.914-925):
   - Firma nueva (cot, db, user_name=None).
   - Después del guard de CANCELADA (N4): si cot.estado == 'RECHAZADA', salir sin tocar la SC cuando haya otra COT activa de la SC (id != cot.id, estado != 'RECHAZADA') o un PVEN vigente.
   - Si no: nuevo = 'CONFIRMADA' si sc.gate1_confirmed_at; si no, 'ASIGNADA' cuando hay advisor_user_id y 'BORRADOR' cuando no.
   - Escribir, commit y _log(db,'SC',…,'ESTADO_CHANGED', texto, old, nuevo, user_name).
   - El resto del mapa sigue igual.
3) update_cotizacion:
   - l.1076-1085: pasar user_name=body.get('updated_by') a la sincronización y quitar `elif cot.estado == 'RECHAZADA': mover_lead_de_solicitud(…,'CANCELLED')`. El lead pasa a CANCELLED al cancelar la SC (N4).
   - Guard nuevo antes del loop: si old_estado == 'RECHAZADA', body.estado existe y es != 'RECHAZADA', y la SC tiene otra COT activa → 409.
4) confirmar_solicitud:
   - l.705-706: sustituir 'cualquier COT vinculada' por _documentos_activos_de_solicitud: si hay COT activa → 400; si hay PVEN vigente → 400.
   - Se mantienen el check de estado CONFIRMADA (l.693) y el de gate1_confirmed_at (l.713).
   - l.725: dejar de consumir la marca (eliminar `sc.gate1_confirmed_at = None`) y reescribir el comentario. La marca pasa a significar 'confirmación vigente del cliente sobre los productos actuales de la SC'. Se invalida cuando cambian los productos, cuando una transición por PATCH reinicia la SC (l.604-619), al cancelar y al restaurar. El duplicado lo impide ahora el check de COT activa, dentro del mismo with_for_update.
   - l.766-768: si la SC tiene COT rechazadas, el log de la COT nueva dice 'Cotización {COT} creada desde {SC} (reemplaza a la cotización rechazada {COT-…})'.
5) update_solicitud l.538-546:
   - En invalida_por_productos, cambiar `…filter(sc_id==sc.id).first() is None` por 'no hay COT con estado != RECHAZADA'.
   - Además, si 'productos' viene en el body, cambian_productos(...) es verdadero y sc.gate1_confirmed_at existe → sc.gate1_confirmed_at = None, aunque haya COT activa. Así una COT futura no puede salir con productos que el cliente no confirmó.
6) alertas_resumen l.1800: el exists() pasa a contar solo COT con estado != 'RECHAZADA'.
7) confirmacion_publica.py l.129-133: actualizar el comentario; la marca ya no se consume al crear la COT.
FRONTEND
8) solicitud/[id]/page.tsx:
   - cotizacionesActivas = cotizaciones.filter(c => c.estado !== 'RECHAZADA').
   - canConfirmarSC (l.378) = estado==='CONFIRMADA' && cotizacionesActivas.length===0 && pedidosVigentes.length===0 && tieneProductos.
   - puedeEditarProductos (l.367) y motivoBloqueo (l.666-668) usan cotizacionesActivas; renderSiguientePaso l.426 también.
   - Tarjeta canConfirmarSC (l.454-464): si hay COT rechazadas, título 'La cotización {COT} fue rechazada', texto 'La solicitud sigue activa: crea una nueva cotización con los productos que el cliente confirmó.' y botón 'Crear nueva cotización'.
   - Tarjeta ASIGNADA (l.477-487) con COT rechazadas: añadir 'La cotización anterior fue rechazada; para hacer otra, reenvía la solicitud al cliente para que la confirme.'
   - Lista de cotizaciones (l.677-694): mostrar ESTADOS_COT[c.estado]?.label (import de '../../cotizacion/cotizacion-client') en lugar de c.estado. Si canConfirmarSC y ya hay COT, poner el botón 'Crear nueva cotización' debajo.
9) cotizacion/[id]/page.tsx:
   - Tarjeta RECHAZADA/VENCIDA (l.428-434): con sc_id, texto 'La solicitud {sc_numero} sigue activa: puedes crearle una nueva cotización desde la solicitud, o retomar esta pasándola a Borrador.' y Link 'Ir a {sc_numero}'.
   - deleteCot (l.300-313): router.push(`/dashboard/ventas/solicitud/${sc_id}`) cuando existe sc_id.
   - confirm de l.725: '¿Marcar como Rechazada? La solicitud {sc_numero} seguirá activa y podrás crearle otra cotización.'
10) cotizacion-client.tsx DeleteConfirm (l.385-387): el texto solo aparece si cot.sc_numero: 'La solicitud {sc_numero} seguirá activa y podrás crearle una nueva cotización.'
```

**Comportamiento esperado:**

```text
- Rechazar o eliminar (=RECHAZADA) la única COT activa de una SC deja la SC en CONFIRMADA si el cliente ya la había confirmado y no cambió nada. En ese caso se ofrece 'Crear nueva cotización'.
- Si la confirmación ya no vale (productos cambiados o datos antiguos), la SC pasa a ASIGNADA (BORRADOR si no tiene asesor) y hay que reenviarla al cliente.
- Log de la SC:
   - Caso CONFIRMADA: «La cotización {COT} fue rechazada. La solicitud sigue activa: ya puedes crearle una nueva cotización.»
   - Caso ASIGNADA/BORRADOR: «La cotización {COT} fue rechazada. La solicitud sigue activa; para crearle otra cotización, reenvíasela al cliente para que la confirme.»
- Crear COT si ya hay una activa → 400: «Esta solicitud ya tiene la cotización {COT} activa; no se puede crear otra. Si el cliente no la aceptó, márcala como Rechazada y vuelve a intentarlo.»
- Crear COT con un PVEN vigente → 400: «Esta solicitud ya tiene el pedido de venta {PVEN} activo; no se puede crear otra cotización.»
- Retomar una COT rechazada cuando hay otra activa → 409: «La solicitud {SC} ya tiene la cotización {COT2} activa; no se puede retomar esta. Trabaja sobre {COT2} o recházala primero.»
- El lead no se mueve al rechazar.
- La nueva COT sigue necesitando Gate 2 (confirmación del cliente por enlace) antes del pedido.
```

**Pruebas (diseño):**

```text
Archivo nuevo backend/tests/test_rechazo_cotizacion_solicitud_activa.py. Helper: SC CONFIRMADA con gate1_confirmed_at=utcnow, productos=[LINEA] y asesor; luego POST /confirmar.
1) test_rechazar_unica_cotizacion_deja_la_solicitud_lista_para_otra:
   - PATCH COT1 {estado:'RECHAZADA'} → SC CONFIRMADA y gate1_confirmed_at no nulo; en sus actividades hay un ESTADO_CHANGED con 'fue rechazada'.
   - POST /confirmar → 200 con COT2 distinta de COT1, en BORRADOR y con los productos de la SC. La SC queda COTIZADA.
2) test_no_se_crea_otra_cotizacion_mientras_haya_una_activa: con COT1 BORRADOR, forzar la SC a CONFIRMADA por DB → POST /confirmar → 400 con 'activa'.
3) test_rechazo_sin_confirmacion_vigente_pide_reenviar: marca en None → rechazar → SC ASIGNADA; POST /confirmar → 400.
4) test_cambiar_productos_tras_el_rechazo_anula_la_confirmacion: tras el rechazo, PATCH productos distintos → SC ASIGNADA y marca None.
5) test_retomar_cotizacion_rechazada_con_otra_activa_se_bloquea: COT1 RECHAZADA + COT2 BORRADOR → PATCH COT1 {estado:'BORRADOR'} → 409; COT1 sigue RECHAZADA.
Ajustes a pruebas existentes:
- test_sincronizacion_estado_solicitud_cotizacion.py::test_rechazar_cotizacion_deja_solicitud_rechazada → renombrar a ..._deja_solicitud_confirmada_para_otra y assert 'CONFIRMADA' (el helper pone la marca).
- test_crm_lead_movimiento_automatico.py::test_rechazar_cotizacion_mueve_lead_a_cancelled → renombrar a ..._no_marca_lead_perdido con assert status != 'CANCELLED'.
- test_confirmacion_solicitud.py::test_confirmar_solicitud_consume_gate1_confirmed_at_al_crear_cotizacion → assert marca no nula tras crear la COT, y un segundo POST /confirmar → 400.
Frontend: tsc. Manual: rechazar una COT → volver a la SC → 'Crear nueva cotización'.
Correr con el runner con ROLLBACK.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No hay migración obligatoria. Las SC que hoy están RECHAZADA por una COT rechazada (su marca ya se consumió) se retoman con la pastilla 'Borrador' (pasa a ASIGNADA) y reenviándolas al cliente.
Consulta informativa:
SELECT cr.id, cr.numero FROM customer_requests cr WHERE cr.estado='RECHAZADA' AND NOT EXISTS(SELECT 1 FROM sales_quotations q WHERE q.sc_id=cr.id AND q.estado<>'RECHAZADA');
Si el usuario lo pide, un script puede pasarlas a ASIGNADA (o BORRADOR) con un log.
```

**Riesgos:**

```text
- Cambia la semántica de seguridad de gate1_confirmed_at: deja de ser 'de un solo uso' y pasa a ser 'confirmación vigente'. Las garantías se mantienen así:
   - Sin confirmación real del cliente no hay COT (el ataque de desvincular la COT de la Ronda 6 sigue bloqueado porque la marca es None).
   - Con productos cambiados hay que reconfirmar.
   - El duplicado lo impide el check de COT activa bajo with_for_update.
   Conviene una revisión de seguridad de esa función.
- POST /cotizaciones con sc_id (Cotizador Rápido) sigue pudiendo crear COT sin Gate 1. Es preexistente y queda fuera de este alcance.
- Hay que ajustar 3 pruebas existentes.
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `backend/app/api/v1/confirmacion_publica.py`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `backend/tests/test_rechazo_cotizacion_solicitud_activa.py`, `backend/tests/test_sincronizacion_estado_solicitud_cotizacion.py`, `backend/tests/test_crm_lead_movimiento_automatico.py`, `backend/tests/test_confirmacion_solicitud.py`


### H46+U25 — Pedido cancelado: la cotización se puede reusar

**Para el usuario:** Al cancelar un pedido de venta, su cotización vuelve sola a Borrador. Se puede ajustar, reenviar al cliente y, cuando la confirme, crear otro pedido. El aviso verde 'Pedido … creado exitosamente' ya no queda fijo: en su lugar la cotización muestra 'Pedido … cancelado' con el motivo, quién lo canceló y la fecha.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Cambios (diseño):**

```text
BACKEND
1) erp_ventas.py: usar _pven_vigente_de_cotizacion (helper de N4, que excluye los CANCELADO) en:
   - update_cotizacion l.1048 (ya_tiene_pven).
   - enviar_cotizacion_para_confirmacion l.1157 (el mensaje nombra el pedido vigente).
   - confirmar_cotizacion l.1224 (ya_convertida).
   - alertas_resumen l.1807 (exists con estado != 'CANCELADO').
   get_cotizacion l.899: añadir .order_by(SaleOrder.id.asc()).
2) erp_ventas_fase4.py convertir_cotizacion_a_venta l.2717: `.filter(SaleOrder.cot_id == cot.id, SaleOrder.estado != 'CANCELADO')`. Un PVEN cancelado ya no se devuelve como replay y se crea uno nuevo.
3) Helper nuevo en erp_ventas.py: _reabrir_cotizacion_por_pven_cancelado(db, so, user_name).
   - Si so.cot_id: cargar la COT con with_for_update.
   - Solo si cot.estado == 'CONFIRMADA' y no queda otro PVEN vigente: estado 'BORRADOR', gate2_confirmed_at None, updated_at, revoke_pending_tokens(db,'COT',cot.id), commit.
   - Luego: _sincronizar_estado_solicitud_desde_cotizacion(cot, db, user_name) (la SC pasa a COTIZADA); mover_lead_de_solicitud(cot.sc_id,'QUOTATION',db); _log(db,'COT',…,'ESTADO_CHANGED', texto, 'CONFIRMADA','BORRADOR', user_name, extra_data={'pven_cancelado_id':so.id,'pven_cancelado_numero':so.numero}).
   - Todo dentro de try/except con rollback + logger.error: nunca hace fallar la cancelación.
4) update_pedido (l.1468-1509), si body.estado == 'CANCELADO' y old_estado != 'CANCELADO':
   - Exigir cancellation_reason (strip) de al menos 5 caracteres → 400.
   - Poner cancelled_at = utcnow si no viene.
   - El bloqueo de l.1477 incluye también 'DEVUELTO_TOTAL'.
   - Después de los _log: llamar _reabrir_cotizacion_por_pven_cancelado(db, v, body.get('updated_by') or user.email).
5) erp_ventas_fase4.py cancel_sale_order: tras db.commit() (l.1286), import local `from app.api.v1.erp_ventas import _reabrir_cotizacion_por_pven_cancelado` y llamarlo con user_name.
6) update_cotizacion, guard antes del loop: si body.estado existe, es != old_estado y hay PVEN vigente → 409.
FRONTEND
7) cotizacion/[id]/page.tsx l.151-153: reemplazar ventaGenerada/pedidoReciente por:
   - pedidosVigentes = pedidosVenta.filter(v=>v.estado!=='CANCELADO')
   - pvenVigente = pedidosVigentes.at(-1) ?? null
   - pvenCancelado = !pvenVigente ? pedidosVenta.filter(v=>v.estado==='CANCELADO').at(-1) ?? null : null
   Usar pvenVigente en l.387, l.393-407 y l.701; también en l.241, l.259 y l.890 en lugar de repetir el filter.
8) Eliminar el banner permanente de l.498-506. Quedan el mensaje de 4 s (pvenCreadoNumero) y la tarjeta 'Pedido de Venta generado'. Actualizar los comentarios de l.56-58 y l.679-684.
9) Aviso nuevo (bloque rose, sobre renderSiguientePaso, l.691) cuando pvenCancelado:
   - 'Pedido {numero} cancelado'
   - 'Motivo: {cancellation_reason}'
   - 'Por {cancellation_authorized_by} · {fDate(cancelled_at)}'
   - Link 'Ver {numero}'
   - 'Ajusta la cotización si hace falta y envíasela de nuevo al cliente; cuando la confirme podrás crear otro pedido.'
10) renderSiguientePaso rama CONFIRMADA (l.408-418): si pvenCancelado (dato antiguo que quedó Confirmada), mostrar NextStepCard rose 'El pedido {numero} se canceló' con el texto 'Para crear otro pedido, reabre la cotización: podrás ajustarla y enviársela de nuevo al cliente.' y Button 'Reabrir cotización' → changeEstado('BORRADOR'). El PATCH ya lo permite: sale_de_gate2 revoca el enlace y limpia la marca.
11) venta/[id]/page.tsx:
   - Modal de cancelar (l.848): si pedido.cot_numero, añadir 'La cotización {cot_numero} volverá a Borrador para que puedas ajustarla, reenviarla al cliente y crear otro pedido.'
   - l.379: ocultar 'Cancelar Pedido' también en DEVUELTO_TOTAL.
```

**Comportamiento esperado:**

```text
- Cancelar un PVEN (por la pantalla, el Hub o POST /pedidos/{id}/cancelar) devuelve su COT de CONFIRMADA a BORRADOR, salvo que la COT tenga otro pedido vigente. Además: se revoca el enlace, se limpia gate2, la SC pasa a COTIZADA y el lead pasa a QUOTATION.
- Log de la COT: «El pedido {PVEN} se canceló: la cotización vuelve a Borrador para ajustarla, reenviarla al cliente y crear otro pedido.»
- Desde ese momento: Re-Cotizar sin congelamiento, 'Enviar al Cliente' (ya no da 'ya tiene un Pedido de Venta') y, tras la confirmación del cliente, 'Crear Pedido de Venta' crea un PVEN nuevo (sin replay).
- Cancelar sin motivo → 400: «Indica el motivo de la cancelación (mínimo 5 caracteres).»
- Cambiar el estado de una COT con pedido vigente → 409: «La cotización tiene el pedido {PVEN} activo. Para cambiar su estado, primero cancela ese pedido.»
- La SC sigue mostrando solo los pedidos vigentes.
```

**Pruebas (diseño):**

```text
Archivo nuevo backend/tests/test_pedido_cancelado_reabre_cotizacion.py.
1) test_cancelar_pven_reabre_la_cotizacion_y_permite_otro_pedido:
   - Preparación por DB: SC + COT CONFIRMADA con gate2_confirmed_at, productos [{product_name:'X', qty:1, unit_price_cop:1000, total_cop:1000}], total_cop 1000 y sc_id.
   - POST /cotizaciones/{id}/confirmar → PVEN1.
   - PATCH /pedidos/{pven1} {estado:'CANCELADO', cancellation_reason:'Cliente cambió el pedido', updated_by:'t'} → 200.
   - Assert: COT BORRADOR, gate2 None, SC COTIZADA; el último ESTADO_CHANGED de la COT contiene el número del PVEN1 y 'vuelve a Borrador'.
   - POST /enviar-confirmacion → 200; usar el token de link_confirmacion en /confirmar/confirmar → COT CONFIRMADA.
   - POST /confirmar → 200 con idempotent_replay False y sale_order_id != pven1.id. Hay 2 SaleOrder con ese cot_id, uno CANCELADO.
2) test_convertir_no_hace_replay_de_pedido_cancelado: COT CONFIRMADA con marca + SaleOrder CANCELADO con ese cot_id → POST /cotizaciones/{id}/convertir-a-venta → idempotent_replay False y pedido nuevo.
3) test_cancelar_pven_sin_motivo_se_rechaza: PATCH {estado:'CANCELADO'} → 400; el estado no cambia.
4) test_cancelacion_canonica_tambien_reabre_la_cotizacion: SaleOrder en estado 'CONFIRMADO' con cot_id (COT CONFIRMADA) → POST /pedidos/{id}/cancelar {motivo:'Prueba cancel'} → COT BORRADOR.
5) test_cotizacion_con_pedido_vigente_no_cambia_de_estado: COT CONFIRMADA + SO PENDIENTE_COMPRA → PATCH {estado:'RECHAZADA'} → 409.
6) test_recotizar_confirmada_con_pedido_cancelado_rompe_congelamiento (dato antiguo): COT CONFIRMADA + SO CANCELADO → PATCH total_cop distinto → COT BORRADOR.
Frontend: tsc. Manual: cancelar un PVEN → abrir la COT → no hay banner verde, sí el aviso rose; se puede enviar y crear otro pedido.
Correr con el runner con ROLLBACK.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
COT que quedaron CONFIRMADA y cuyos pedidos están todos cancelados (por ejemplo COT-20260486 id 235 con PVEN-20262814):
SELECT q.id, q.numero FROM sales_quotations q WHERE q.estado='CONFIRMADA' AND EXISTS(SELECT 1 FROM sale_orders s WHERE s.cot_id=q.id) AND NOT EXISTS(SELECT 1 FROM sale_orders s WHERE s.cot_id=q.id AND s.estado<>'CANCELADO');
Se resuelven desde la UI con el botón 'Reabrir cotización'. Opcional, con OK del usuario: un script que llame a _reabrir_cotizacion_por_pven_cancelado para cada una (es idempotente).
```

**Riesgos:**

```text
- Cancelar por el PATCH genérico (lo que usa la UI) no cancela las líneas ni libera las reservas de inventario. Al crear el nuevo pedido, las líneas de entrega inmediata pueden quedar 'Pendiente de compra' porque el stock sigue reservado al pedido cancelado. El arreglo completo es usar POST /pedidos/{id}/cancelar con la decisión sobre la mercancía (ver N10); se recomienda dentro de Compras (Componente 2).
- La orden de pago (PXP) del pedido cancelado sigue PENDIENTE: es H45, de otro grupo.
- Si el PVEN se canceló porque el cliente desistió, la COT queda en Borrador hasta que el asesor la marque Rechazada.
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `backend/app/api/v1/erp_ventas_fase4.py`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `backend/tests/test_pedido_cancelado_reabre_cotizacion.py`


### H50 — Quitar "Enviada al cliente" del selector de estado

**Para el usuario:** En 'Cambiar estado' de la cotización ya no aparece 'Enviada al cliente'. Para enviarla se usa 'Enviar al Cliente', que es lo que crea el enlace para que el cliente confirme, así que ya no se puede anular sin querer un enlace que el cliente tenía.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Cambios (diseño):**

```text
BACKEND (erp_ventas.py update_cotizacion, justo después del check de l.946):
ESTADOS_COT_MANUALES = ('BORRADOR','RECHAZADA','VENCIDA')
nuevo = body.get('estado')
if nuevo and nuevo != cot.estado:
    if nuevo == 'ENVIADA': raise HTTPException(400, …)
    if nuevo not in ESTADOS_COT_MANUALES: raise HTTPException(400, …)
Esto también cierra los estados basura (EN_PROCESO, ENTREGADO…) que el cambio masivo del Hub manda a las COT. Reenviar el mismo estado actual (por ejemplo una COT antigua ya en ENVIADA) sigue funcionando.
FRONTEND
1) cotizacion/[id]/page.tsx l.730: el filtro pasa a ser una lista blanca igual a la del backend: `.filter(([k]) => ['BORRADOR','RECHAZADA','VENCIDA'].includes(k) && k !== estadoActual)`. Ajustar el comentario de l.711-719.
2) dashboard/ventas/page.tsx l.404: m['En Gestión'].COT = 'PENDIENTE_CONFIRMACION'. Al soltar una COT en 'En Gestión' entra en la rama existente de l.420-436: confirmación explícita y POST /enviar-confirmacion (con el guard 'Ya está pendiente'). Ya no hace PATCH a ENVIADA.
3) ESTADOS (cotizacion-client.tsx l.21) conserva ENVIADA solo para mostrar los datos antiguos. Esas COT siguen teniendo 'Re-enviar al Cliente' (page.tsx l.450-453).
```

**Comportamiento esperado:**

```text
- Estados manuales de una COT: Borrador, Rechazada y Vencida.
- PATCH a ENVIADA → 400: «'Enviada al cliente' no se puede poner a mano: usa 'Enviar al Cliente' en la cotización, que genera el enlace de confirmación.»
- Otro estado no manual → 400: «El estado «{X}» no se puede asignar a mano a una cotización.»
- Un enlace pendiente ya no se puede revocar por error con esta opción.
```

**Pruebas (diseño):**

```text
En backend/tests/test_confirmacion_cotizacion.py (estilo existente, auth()):
1) test_patch_cotizacion_no_acepta_enviada:
   - COT BORRADOR con sc_id → PATCH {estado:'ENVIADA'} → 400.
   - db.refresh: COT sigue BORRADOR, la SC sigue COTIZADA y no hay DocumentConfirmationToken nuevo.
2) test_patch_enviada_no_revoca_enlace_pendiente: COT BORRADOR con precio → /enviar-confirmacion → token t1 = create_confirmation_token. PATCH {estado:'ENVIADA'} → 400; _used_at(t1) is None y /confirmar/ver con t1 → 200.
3) test_patch_cotizacion_rechaza_estados_no_manuales: PATCH {estado:'ENTREGADO'} → 400.
4) test_patch_mismo_estado_enviada_es_inocuo: COT ENVIADA por DB + PATCH {estado:'ENVIADA', notas:'x'} → 200.
Ajustes a pruebas existentes:
- test_sincronizacion_estado_solicitud_cotizacion.py::test_enviar_cotizacion_deja_solicitud_en_espera_confirmacion (l.58-62): usar POST /enviar-confirmacion, poniendo antes productos y total_cop por DB.
- test_crm_lead_movimiento_automatico.py: test_enviar_cotizacion_mueve_lead_a_quotation (l.98-105) pasa a assert del 400 (el caso real ya lo cubre el test de l.107). En test_las_5_etapas (l.159), cambiar el PATCH ENVIADA por /enviar-confirmacion con precio, para que mover_lead cree las etapas.
Frontend: tsc. Manual: el selector solo muestra Borrador, Rechazada y Vencida.
Correr con el runner con ROLLBACK.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
No aplica. Consulta informativa: SELECT id, numero FROM sales_quotations WHERE estado='ENVIADA';
Esas COT se quedan como están y se reenvían con 'Re-enviar al Cliente'.
```

**Riesgos:**

```text
- Hay que ajustar 3 pruebas existentes que usaban el PATCH a ENVIADA.
- La lista blanca puede romper alguna pantalla que mande otro estado a una COT. Revisado con grep: solo el Hub lo hace, y queda cubierto por N4/N10.
```

**Archivos:** `backend/app/api/v1/erp_ventas.py`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/page.tsx`, `backend/tests/test_confirmacion_cotizacion.py`, `backend/tests/test_sincronizacion_estado_solicitud_cotizacion.py`, `backend/tests/test_crm_lead_movimiento_automatico.py`


### N10 — Estados del pedido con nombre claro

**Para el usuario:** El pedido de venta y sus listas muestran siempre un nombre claro del estado, por ejemplo 'Pendiente de saldo' o 'Listo para entrega', en lugar de códigos o pasos vacíos. El aviso 'mercancía disponible' y la cancelación hecha por Compras ahora aparecen en la actividad del pedido.

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- ¿Qué pasos ve el equipo en el pedido? → **Los 5 de hoy (Pend. Compra → En Proceso → Listo Entrega → Entregado → Facturado), con el estado exacto en la etiqueta**

**Cambios (diseño):**

```text
FRONTEND
1) Módulo nuevo frontend/src/lib/estados-pedido.js (JS plano, testeable con node, igual que safe-return-to.js):
   - ESTADOS_PEDIDO = {clave:{label, clases:{bg,text,border}, paso}} con TODOS los estados que el backend puede poner:
     · Ventas/Compras: PENDIENTE_COMPRA (0), EN_PROCESO (1), LISTO_ENTREGA (2), ENTREGADO (3), FACTURADO (4), CANCELADO (-1), EN_TRANSITO (1, lo pone el Hub).
     · ecommerce/store/webhooks: PENDIENTE_PAGO (0), PAGADO (1).
     · fase4 recalculate_sale_order_state y ALLOWED_TRANSITIONS: BORRADOR (0), PENDIENTE_ANTICIPO (0), CONFIRMADO (0), PARCIALMENTE_DISPONIBLE (1), DISPONIBLE (2), PENDIENTE_SALDO (2), LISTO_PARA_ENTREGA (2), PARCIALMENTE_ENTREGADO (2), DEVUELTO_TOTAL (-1).
   - PASOS_PEDIDO: los 5 pasos actuales.
   - Funciones: infoEstadoPedido(e) (si la clave es desconocida, humaniza 'PENDIENTE_X' → 'Pendiente x' con clases grises), pasoPedido(e), grupoPedido(e) (pestaña de la lista), ESTADOS_PEDIDO_MANUALES = ['PENDIENTE_COMPRA','EN_PROCESO','LISTO_ENTREGA'], ESTADOS_PEDIDO_CERRADOS = ['ENTREGADO','FACTURADO','CANCELADO','DEVUELTO_TOTAL'], esPedidoVigente(e) (e !== 'CANCELADO') y esCotizacionActiva(e) (e !== 'RECHAZADA'). Las dos últimas las usan N4, N7 y H46.
2) venta/[id]/page.tsx:
   - Borrar VEN_ESTADOS/STEPS locales (l.21-35) e importar del módulo.
   - l.129-131: estadoCfg = infoEstadoPedido(estadoActual), stepIndex = pasoPedido(estadoActual).
   - l.392: el stepper se oculta solo en CANCELADO o DEVUELTO_TOTAL (banner 'Este pedido fue devuelto totalmente.').
   - Bajo el stepper, si estadoCfg.label es distinto de PASOS[stepIndex].label: 'Estado actual: {label}'.
   - l.478-492: la lista de solo lectura usa ESTADOS_PEDIDO_CERRADOS. En el select, si estadoActual no está en MANUALES, anteponer <option value={estadoActual} disabled>{label} (actual)</option>; handleSaveEdit ya no lo reenvía si no cambió (l.291).
3) venta/venta-client.tsx:
   - VEN_ESTADOS (l.52-59) se toma del módulo; las pestañas (l.98-109, 158-160) filtran por grupoPedido(p.estado); DEVUELTO_TOTAL va a 'Cancelado' con su badge real.
   - Filtro 'Filtrar Estado' (l.206-211): opciones con label, y aplicar filterEstado en `filtered` (hoy no se usa).
   - KPI 'activos' (l.148) con ESTADOS_PEDIDO_CERRADOS; distribución (l.239-251) con todos los estados; fila (l.304) con infoEstadoPedido.
4) dashboard/ventas/page.tsx (Hub):
   - Badge de estado en la tabla (l.947-949) y en el detalle rápido (l.1112-1113): mostrar la etiqueta. VEN → infoEstadoPedido; COT → ESTADOS de cotizacion-client; SC → ESTADOS_SC (exportarlo en solicitud-client.tsx l.40).
   - Botones del panel rápido VEN (l.1217): solo ESTADOS_PEDIDO_MANUALES, con label.
   - Cambio masivo (l.1085-1092): solo EN_PROCESO y LISTO_ENTREGA, con label; ENTREGADO/FACTURADO van por Entregas/Facturación.
5) solicitud/[id]/page.tsx l.700: infoEstadoPedido(v.estado).label en lugar de v.estado.
6) package.json 'test': añadir `&& node tests/test_estados_pedido.mjs`.
BACKEND (mínimo)
7) erp_ventas.py get_pedido (l.1391-1394): ActivityLog.entity_type.in_(('VEN','PVEN')) con entity_id == ven_id. fase4 registra pagos, excepción y cancelación con 'PVEN' + so.id.
8) erp_compras.py l.2352-2359 (MERCANCIA_DISPONIBLE): entity_type='VEN', entity_id=sol.so_id, entity_numero=so.numero (hoy es el id de la LÍNEA con 'PVEN'). Mover el add dentro del `if sol:` para tener so.
9) erp_ventas_fase4.py ALLOWED_TRANSITIONS_SALE_ORDER (l.156-168): añadir 'PENDIENTE_COMPRA','EN_PROCESO','LISTO_ENTREGA','PENDIENTE_PAGO','PAGADO','EN_TRANSITO' → {'CANCELADO'}, para que /pedidos/{id}/cancelar no dé 422 en los pedidos creados por Ventas. Solo cancel_sale_order usa este mapa.
```

**Comportamiento esperado:**

```text
- Ningún estado de pedido se muestra crudo: cada clave tiene etiqueta.
- El stepper conserva los 5 pasos y ubica cada estado en el más cercano; el estado exacto se lee en la etiqueta.
- El editor solo permite poner a mano Pend. Compra, En proceso y Listo entrega; si el pedido está en otro estado, lo muestra como '(actual)' y no lo pisa.
- La actividad del pedido incluye los eventos que fase4 y Compras registran con 'PVEN' y 'MERCANCIA_DISPONIBLE'.
- Etiquetas: Pendiente de compra, En proceso, En tránsito, Listo para entrega (LISTO_ENTREGA y LISTO_PARA_ENTREGA), Entregado, Entregado parcialmente, Facturado, Cancelado, Devuelto, Borrador, Pendiente de anticipo, Pendiente de pago, Pagado, Confirmado, Parcialmente disponible, Disponible, Pendiente de saldo.
```

**Pruebas (diseño):**

```text
Frontend, archivo nuevo frontend/tests/test_estados_pedido.mjs (estilo test_safe_return_to.mjs, node:assert):
- Para cada uno de los 19 estados listados (comentario con archivo:línea del backend que lo pone), infoEstadoPedido(e).label !== e y no contiene '_'.
- infoEstadoPedido('ALGO_NUEVO').label === 'Algo nuevo'.
- pasoPedido: PENDIENTE_SALDO → 2, CONFIRMADO → 0, FACTURADO → 4, CANCELADO → -1.
- grupoPedido('LISTO_PARA_ENTREGA') === 'Listo Entrega'.
- esPedidoVigente('CANCELADO') === false; esCotizacionActiva('RECHAZADA') === false.
Luego `npm test` y `npx tsc --noEmit`.
Backend:
1) test_detalle_pedido_incluye_actividad_registrada_como_pven (archivo nuevo test_pedido_estados_y_actividad.py): SaleOrder + ActivityLog(entity_type='PVEN', entity_id=so.id, action='VENTA_CANCELADA') → GET /ventas/pedidos/{id} → esa acción está en actividades.
2) Ampliar test_fase4_asignacion_compras_recepcion.py::test_asignacion_compras_y_recepcion_reserva_automatica: tras confirmar la recepción, existe un ActivityLog MERCANCIA_DISPONIBLE con entity_type 'VEN' y entity_id == id del SaleOrder de la línea, y GET /ventas/pedidos/{so_id} lo devuelve.
3) test_cancelacion_canonica_acepta_pedido_pendiente_compra: SaleOrder PENDIENTE_COMPRA sin reservas → POST /pedidos/{id}/cancelar {motivo:'Prueba cancel'} → 200 (antes 422).
Correr con el runner con ROLLBACK.
```

**Datos existentes:** (solo T14, con OK del usuario)

```text
Corregir los logs antiguos de mercancía disponible, con OK del usuario y en el mismo despliegue que el cambio 7:
UPDATE activity_logs al SET entity_type='VEN', entity_id=l.so_id, entity_numero=so.numero FROM sale_order_lines_erp l JOIN sale_orders so ON so.id=l.so_id WHERE al.entity_type='PVEN' AND al.action='MERCANCIA_DISPONIBLE' AND l.id=al.entity_id;
Sin esta corrección, la lectura de 'PVEN' podría pegar esos logs a un pedido cuyo id coincida con el de la línea. Antes de actualizar, contar con un SELECT.
```

**Riesgos:**

```text
- Recomendación: NO unificar ahora las dos máquinas de estado. recalculate_sale_order_state la usan la recepción de Compras (erp_compras.py l.2349), Inventario (erp_inventario.py l.1228) y los pagos y entregas de fase4. Compras además fija EN_PROCESO/PENDIENTE_COMPRA (erp_compras.py l.727, 770, 3071). Hay que tocar también alertas_resumen (su lista no_resolucion no incluye los estados de fase4) y las pruebas de fase4/fase5 que verifican esos nombres. Conviene hacerlo en Compras (Componente 2), junto con pasar la cancelación de la UI a /pedidos/{id}/cancelar con la decisión sobre la mercancía (libera reservas y cancela líneas).
- Mientras tanto, solo se muestra bien lo que existe.
- Ampliar ALLOWED_TRANSITIONS solo afecta a la cancelación canónica, que hoy no usa ninguna pantalla.
```

**Archivos:** `frontend/src/lib/estados-pedido.js`, `frontend/tests/test_estados_pedido.mjs`, `frontend/package.json`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/venta-client.tsx`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `backend/app/api/v1/erp_ventas.py`, `backend/app/api/v1/erp_compras.py`, `backend/app/api/v1/erp_ventas_fase4.py`, `backend/tests/test_pedido_estados_y_actividad.py`, `backend/tests/test_fase4_asignacion_compras_recepcion.py`


