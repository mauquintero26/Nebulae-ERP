# Ventas · Bloque 3 · Documentos para el cliente, envío, seguimiento e IVA — Especificación

Fecha: 2026-10-04 · Rama: `ventas-bloque3-documentos-envio-iva` · Base: punta de `ventas-bloque2-pantallas-sc-cot` (apilada sobre `ventas-bloque1-dinero-flujo`) · Plan: `docs/superpowers/plans/2026-10-04-ventas-bloque3-documentos-envio-iva.md`

## Objetivo

Que lo que ve el cliente sea un documento claro y con la marca de la empresa, y que le llegue y se le haga seguimiento sin trabajo manual: datos de la empresa guardados de verdad; solicitud, cotización y pedido en formato factura (con impresión y PDF adjunto al correo); páginas del enlace que dicen en palabras qué pasó y permiten «Pedir cambios»; validez de la cotización y reenvío del enlace; confirmación del pedido con lo pagado y lo que falta; WhatsApp automático desde el número de la empresa por Chatwoot con su estado de entrega; un recordatorio automático a los 2 días; e IVA por producto en la cotización, el pedido y la orden de pago, en pesos enteros.

## Origen

- Página del plan del Bloque 3 (`plan-bloque3.json`, armada por `build-plan3.js` desde `diseno-bloque3.json` con los ajustes del crítico): 17 arreglos y 13 preguntas.
- Respuestas del usuario en `respuestas-plan3/plan/*.json` (2026-10-04): los 17 en «Bien»; comentario general: "nada mas".
- Diseño por ítem y cruce crítico (28 choques, 9 huecos, orden, pruebas que se rompen, configuración del usuario) en `diseno-bloque3.json`.
- Diseños de los Bloques 1 y 2 y los planes de los Bloques 1 y 2 (`docs/superpowers/plans/2026-10-03-ventas-bloque1-dinero-flujo.md` y `docs/superpowers/plans/2026-10-04-ventas-bloque2-pantallas-sc-cot.md`), solo para no contradecirlos y nombrar sus interfaces (numeración en R17).

### Resumen de decisiones del controlador (`decisiones-bloque3.md`, vinculante)

> # Bloque 3 — decisiones del usuario (página del plan, 2026-10-04)
> - 17 arreglos, todos "Bien". Comentario general: "nada mas".
> - Una sola respuesta distinta a la recomendación: PDF pdf_servidor = "Sí, adjuntar el PDF de la cotización y el pedido en el correo de respaldo" (no por WhatsApp). → El ítem PDF se implementa (B3-T5 lo condicionaba a esta respuesta), solo adjunto en el correo de respaldo de COT y PVEN.
> - datos_pago: Sí, en COT y PVEN (solo con el enlace). notas_cliente: «Nota para el cliente» aparte + nota de la COT; Notas de la SC internas.
> - no_la_necesita: vuelve al asesor marcada «Ya no la necesita»; el asesor decide. validez_cotizacion: hasta la fecha de validez (5 días por defecto, configurable); recordatorio no amplía, Reenviar renueva.
> - envio_pedido: cuando el asesor pulsa «Enviar al cliente». estado_si_whatsapp_falla: Sí, pasa a Pendiente y el asesor lo manda a mano.
> - seguimiento_cuantos: uno a los 2 días, luego aviso al asesor. seguimiento_horario: lun–sáb 8 a. m.–6 p. m.
> - IVA: precio de la calculadora antes de IVA; anticipo sobre el total con IVA; tarifa por defecto 19%; el asesor puede cambiarla en la línea con aviso y Actividad.
> - Fijadas por el crítico (sin pregunta): enlace del pedido 30 días; WhatsApp siempre desde el número de la empresa; se anotan entregado/leído/no entregado; recordatorio enviado = contacto (reinicia atraso).

## Alcance (ítems que entran)

| Ítem | Título | Grupo | Esfuerzo | Estado | Comentario | Tareas |
|---|---|---|---|---|---|---|
| MARCA | Datos de tu empresa para los documentos | Tu empresa y el formato de los documentos | M | bien | — | T2, T12, T14, T21 |
| PLANTILLA | Documento tipo factura para solicitud, cotización y pedido | Tu empresa y el formato de los documentos | L | bien | — | T2, T12, T14, T15 |
| PDF | PDF hecho por el sistema (solo si lo eliges) | Tu empresa y el formato de los documentos | M | bien | — | T9 |
| U17-H28 | La solicitud que ve el cliente, como una factura | Lo que ve el cliente: solicitud | L | bien | — | T1, T5, T12, T15, T16, T18 |
| H28-cambios | «Pedir cambios» desde el enlace del cliente | Lo que ve el cliente: solicitud | M | bien | — | T6, T12, T15, T17, T18 |
| U22-H38 | Cotización del cliente en formato factura | Lo que ve el cliente: cotización y pedido | L | bien | — | T1, T5, T12, T15, T17, T21 |
| U22-cambios | Pedir cambios desde la cotización | Lo que ve el cliente: cotización y pedido | M | bien | — | T6, T12, T15, T17 |
| U22-validez | Validez de la cotización y reenvío del enlace | Lo que ve el cliente: cotización y pedido | M | bien | — | T1, T5, T7, T15, T16, T17 |
| U22-anticipo | Si cambia el anticipo, el cliente vuelve a confirmar | Lo que ve el cliente: cotización y pedido | M | bien | — | T1, T7, T17, T18, T21 |
| U23 | Enviar el pedido al cliente como confirmación | Lo que ve el cliente: cotización y pedido | L | bien | — | T1, T5, T7, T8, T9, T12, T15, T16, T19, T21 |
| U16-envio | WhatsApp automático desde el número de la empresa | Envío automático por WhatsApp | L | bien | — | T1, T8, T13, T16, T17, T18, T19, T21 |
| U16-entrega | Saber si el WhatsApp le llegó al cliente | Envío automático por WhatsApp | M | bien | — | T8, T13, T16, T17, T18, T19 |
| U16-reenvio-cot | Reenviar el enlace de una cotización | Envío automático por WhatsApp | S | bien | — | T7, T17 |
| TAREAS | Revisión automática cada 10 minutos | Seguimiento a los 2 días | M | bien | — | T10, T13, T16 |
| U16-seguimiento | Recordatorio automático si el cliente no confirma | Seguimiento a los 2 días | L | bien | — | T1, T11, T13, T16, T17, T18, T21 |
| IVA | IVA por producto en cotización, pedido y orden de pago | IVA por producto | L | bien | — | T4, T5, T13, T17, T19, T21 |
| IVA-PRODUCTO | Tarifa de IVA en cada producto | IVA por producto | M | bien | — | T3, T13, T14, T16, T21 |

Ítem descartado (no entra): **MARCA** del grupo «pagina-publica-sc» (duplicado; ver C1 y R9).

## Decisiones del usuario por ítem

### MARCA — Datos de tu empresa para los documentos

- Marcado por el usuario: **bien** (sin comentario)
- Sin preguntas.

### PLANTILLA — Documento tipo factura para solicitud, cotización y pedido

- Marcado por el usuario: **bien** (sin comentario)
- ¿Mostramos en la cotización y en el pedido los datos para pagar (cuenta bancaria, Nequi…) que cargues en Configuración? Solo los vería quien tenga el enlace del documento. → **Sí, en la cotización y en el pedido (solo los ve quien tenga el enlace): el anticipo se paga antes de crear el pedido** (= recomendada)

### PDF — PDF hecho por el sistema (solo si lo eliges)

- Marcado por el usuario: **bien** (sin comentario)
- ¿Quieres que el sistema genere el PDF y se lo adjunte al cliente, o basta con el enlace y el botón «Descargar o imprimir»? → **Sí, adjuntar el PDF de la cotización y el pedido en el correo de respaldo (más trabajo y cada envío tarda un poco más)** ⚠ distinta de la recomendada («No por ahora: basta con el enlace y el botón para guardarlo como PDF (sin costo extra)»)

### U17-H28 — La solicitud que ve el cliente, como una factura

- Marcado por el usuario: **bien** (sin comentario)
- ¿Qué notas ve el cliente en su solicitud, su cotización y su pedido? → **Una «Nota para el cliente» aparte en la solicitud, más la nota de la cotización (en tus pantallas dirá «El cliente verá esta nota»); las Notas de la solicitud siguen siendo internas** (= recomendada)
- (Pregunta del diseño no mostrada) ¿Qué nota ve el cliente en la página de su solicitud? → reemplazada por la pregunta fusionada «notas_cliente» (en U17-H28); ver R3. Recomendación original del diseño, que NO se aplica: «Una «Nota para el cliente» aparte en la solicitud; las Notas de siempre siguen siendo solo internas». Decisión vigente (respuesta del usuario a la pregunta fusionada): «Una «Nota para el cliente» aparte en la solicitud, más la nota de la cotización (en tus pantallas dirá «El cliente verá esta nota»); las Notas de la solicitud siguen siendo internas».

### H28-cambios — «Pedir cambios» desde el enlace del cliente

- Marcado por el usuario: **bien** (sin comentario)
- Si el cliente responde desde su enlace que ya no necesita la solicitud, ¿qué pasa? → **Vuelve a su asesor marcada «Ya no la necesita» y el asesor decide si la cancela** (= recomendada)

### U22-H38 — Cotización del cliente en formato factura

- Marcado por el usuario: **bien** (sin comentario)
- (Pregunta del diseño no mostrada) ¿Qué notas ve el cliente en su cotización y en la confirmación del pedido? → reemplazada por la pregunta fusionada «notas_cliente» (en U17-H28), que corrige su recomendación (C19); ver R3. Recomendación original del diseño, que NO se aplica: «La nota de la cotización y también la de la solicitud (en tus pantallas se marca «El cliente verá esta nota»)». Decisión vigente (respuesta del usuario a la pregunta fusionada): «Una «Nota para el cliente» aparte en la solicitud, más la nota de la cotización (en tus pantallas dirá «El cliente verá esta nota»); las Notas de la solicitud siguen siendo internas».

### U22-cambios — Pedir cambios desde la cotización

- Marcado por el usuario: **bien** (sin comentario)
- Sin preguntas.

### U22-validez — Validez de la cotización y reenvío del enlace

- Marcado por el usuario: **bien** (sin comentario)
- ¿Hasta cuándo puede el cliente confirmar una cotización? → **Hasta su fecha de validez: 5 días por defecto (lo cambias en Configuración), y el enlace sirve hasta ese día. El recordatorio no amplía la validez; «Reenviar» sí la renueva** (= recomendada)

### U22-anticipo — Si cambia el anticipo, el cliente vuelve a confirmar

- Marcado por el usuario: **bien** (sin comentario)
- Sin preguntas.

### U23 — Enviar el pedido al cliente como confirmación

- Marcado por el usuario: **bien** (sin comentario)
- ¿Cuándo le llega al cliente la confirmación de su pedido? → **Cuando el asesor pulsa «Enviar al cliente» en el pedido** (= recomendada)
- (Pregunta del diseño no mostrada) ¿Hasta cuándo puede el cliente abrir el enlace de su pedido? → quitada por el crítico: se aplica la recomendada (R6): «30 días desde que se envía (puedes reenviarle uno nuevo cuando quieras)».

### U16-envio — WhatsApp automático desde el número de la empresa

- Marcado por el usuario: **bien** (sin comentario)
- Si el WhatsApp automático no logra salir, ¿la solicitud o cotización pasa igual a «Pendiente por confirmación»? → **Sí: el enlace ya sirve, el asesor lo manda a mano con el botón y queda anotado que el automático no salió** (= recomendada)
- (Pregunta del diseño no mostrada) Con el envío automático encendido, ¿el asesor puede elegir mandarlo él desde su propio WhatsApp? → quitada por el crítico: se aplica la recomendada (R5): «No: siempre sale desde el WhatsApp de la empresa, así todo queda en Chatwoot y en la Actividad».

### U16-entrega — Saber si el WhatsApp le llegó al cliente

- Marcado por el usuario: **bien** (sin comentario)
- (Pregunta del diseño no mostrada) ¿Quieres que la Actividad anote también cuando el cliente recibió o leyó el WhatsApp? → quitada por el crítico: se aplica la recomendada (R4): «Sí: anotar cuando le llegó, cuando lo leyó y cuando no le llegó».

### U16-reenvio-cot — Reenviar el enlace de una cotización

- Marcado por el usuario: **bien** (sin comentario)
- Sin preguntas.

### TAREAS — Revisión automática cada 10 minutos

- Marcado por el usuario: **bien** (sin comentario)
- Sin preguntas.

### U16-seguimiento — Recordatorio automático si el cliente no confirma

- Marcado por el usuario: **bien** (sin comentario)
- Si el cliente no confirma, ¿cuántos recordatorios automáticos le enviamos antes de pasarle el caso al asesor? (Después se puede cambiar en Configuración.) → **Uno solo, a los 2 días. Si 2 días después sigue sin responder, se le avisa al asesor** (= recomendada)
- ¿A qué hora pueden salir los recordatorios al cliente? → **Solo de lunes a sábado, entre 8 a. m. y 6 p. m. Si los 2 días se cumplen fuera de ese horario, sale a la siguiente hora hábil** (= recomendada)
- (Pregunta del diseño no mostrada) Cuando sale un recordatorio automático, ¿cuenta como contacto con el cliente para la alerta roja de «atrasada»? → quitada por el crítico: se aplica la recomendada (R7): «Sí, cuenta igual que una llamada o un WhatsApp. La solicitud se pone en rojo solo si el cliente sigue sin responder después del último recordatorio».

### IVA — IVA por producto en cotización, pedido y orden de pago

- Marcado por el usuario: **bien** (sin comentario)
- El precio que calcula la calculadora (costo + margen), ¿es antes de IVA o ya incluye el IVA? → **Antes de IVA: el IVA se suma encima y el cliente paga precio + IVA (tu margen queda completo)** (= recomendada)
- ¿Sobre qué valor se calcula el anticipo? → **Sobre el total con IVA, que es lo que paga el cliente (con Contado se cobra todo, IVA incluido)** (= recomendada)

### IVA-PRODUCTO — Tarifa de IVA en cada producto

- Marcado por el usuario: **bien** (sin comentario)
- Si un producto no tiene tarifa de IVA, o el asesor escribe un producto a mano en la cotización, ¿qué IVA se usa? → **19% (la tarifa general). El asesor la cambia en esa línea si es 5%, exento o excluido** (= recomendada)
- En una cotización, ¿el asesor puede cambiar el IVA de un producto del catálogo que ya tiene su tarifa? → **Sí, en esa línea. Sale un aviso amarillo («el producto tiene IVA 5%») y el cambio queda en la Actividad** (= recomendada)

## Reglas de implementación (rulings)

- **R1 — Las decisiones del usuario ganan sobre el diseño (como R14 del Bloque 1).** Los 17 arreglos de la página del plan quedaron en «Bien», sin comentarios; comentario general: "nada mas". De las 13 preguntas, 12 se respondieron con la opción recomendada y 1 con otra (PDF, R2). En cada ítem se copian la pregunta y la respuesta. Si un diseño asumía otra cosa, gana la respuesta y su regla.
- **R2 — PDF adjunto al correo (pdf_servidor = «Sí, adjuntar el PDF de la cotización y el pedido en el correo de respaldo…»; distinta de la recomendada «No por ahora…»).** Se implementa la opción 1 del ítem PDF y nada de la opción 2 (el «SOLO si la respuesta a pdf_servidor es 1 o 2» del diseño se cumple; su «Opción 0 (recomendada): no se implementa nada» queda anulado). Backend (T9, tarea propia para que su PARADA no frene el WhatsApp de T8): backend/requirements.txt agrega reportlab con versión fijada; nuevo core/pdf_documento.py con pdf_documento(documento, perfil, logo) → bytes, que dibuja el dict de documento_cliente (documento_cot / documento_pven, C2) sin recalcular ningún número; email.send_email gana adjuntos=[(nombre, bytes, mime)] (sin adjuntos el mensaje queda idéntico al de hoy); enviar_cotizacion_para_confirmacion y enviar_pedido_al_cliente adjuntan COT-….pdf / PVEN-….pdf en el correo que salga (el principal si el canal es Email, el de respaldo si es WhatsApp u Otro). La SC no lleva PDF (no tiene precios) y los recordatorios automáticos tampoco. reportlab se importa dentro de la función: si falta o pdf_documento falla, logger.exception, el correo sale sin adjunto con el texto «(sin PDF adjunto)» y la respuesta del envío no cambia. Nada por WhatsApp. Instalar reportlab en el venv compartido es una descarga desde PyPI: T0 le pide el OK al usuario y T9 se DETIENE si no lo hay (sin el OK solo se implementa y prueba la ruta «sin PDF»).
- **R3 — Notas que ve el cliente (pregunta fusionada notas_cliente, en U17-H28: «Una "Nota para el cliente" aparte en la solicitud, más la nota de la cotización…; las Notas de la solicitud siguen siendo internas» = recomendada).** Reemplaza las preguntas quitadas nota_cliente_sc (U17+H28) y notas_cliente (U22+H38); C19 es vinculante. Columna nueva customer_requests.nota_cliente TEXT NULL (fa6_029, T5), en allowed de update_solicitud, con etiqueta «Nota para el cliente» en cambios_documento CAMPOS['SC'] y expuesta en _sc_dict; editarla NO anula el enlace. Las Notas de la SC (sc.notas) NUNCA llegan al cliente. documento_sc muestra la «Nota para el cliente»; documento_cot muestra [«Nota para el cliente» de su SC, «Notas» de la COT]; documento_pven muestra lo mismo y «Notas del pedido» solo si difiere de la de la COT (regla de H35). En las pantallas internas: texto pequeño «El cliente verá esta nota» bajo la nota de la COT (cotizacion/[id] y textarea del CalculadorModal, T17) y bajo el campo «Nota para el cliente» de la SC (T18). La prueba 5 de U22+H38 se ajusta: sc.notas 'Entrega en obra' NO aparece y sc.nota_cliente sí.
- **R4 — Estados de entrega del WhatsApp en la Actividad (pregunta actividad_entrega_whatsapp de U16-entrega, quitada por el crítico: se aplica la recomendada).** Se anotan en la Actividad del documento ENTREGADO, LEIDO y FALLIDO, una vez cada uno (renglón MENSAJE_CLIENTE, sin clave 'campo'). Ninguno reinicia el conteo de atraso (C22): verificar_envio no toca doc.updated_at.
- **R5 — WhatsApp siempre desde la empresa (pregunta asesor_elige_whatsapp_propio de U16-envio, quitada: se aplica la recomendada «No»).** No se agrega «WhatsApp desde mi teléfono» al ChannelModal, ni whatsapp_manual en el body, ni el motivo ENVIO_MANUAL_ELEGIDO. Si el automático no sale, el asesor usa el botón «Abrir WhatsApp con el mensaje»; con el automático apagado se abre wa.me como hoy.
- **R6 — Vida del enlace del pedido (pregunta enlace_pedido_dura de U23, quitada: se aplica la recomendada).** DIAS_ENLACE_PEDIDO = 30: el enlace del PVEN vence al final del día (hora de Colombia) 30 días después del envío, se revoca al reenviar y al cancelar el pedido (hueco 2). La variante de 3650 días no se implementa.
- **R7 — El recordatorio enviado cuenta como contacto (pregunta seguimiento_y_atraso de U16-seguimiento, quitada: se aplica la recomendada «Sí»).** REINICIA_ATRASO = True: un recordatorio que salió pone doc.updated_at = ahora, igual que la nota externa del Bloque 2. No lo reinician un recordatorio fallido, el aviso de agotado, la verificación de entrega del WhatsApp ni el aviso al asesor (C22).
- **R8 — Demás respuestas (todas = recomendada) y su efecto en el código.** datos_pago → textos_documento(db, 'COT'|'PVEN') trae instrucciones_pago, solo en respuestas con token (nunca en /publico/empresa). no_la_necesita → tipo NO_LA_NECESITA solo en la SC: vuelve a Asignada (Borrador si no tiene asesor) marcada «Ya no la necesita» y el asesor decide (botón «Cancelar solicitud» con el motivo prellenado). validez_cotizacion → dias_validez_cotizacion = 5 (1 a 60) en la Configuración del Hub; el enlace de la COT vence al final de valida_hasta; «Reenviar» renueva la validez y el recordatorio no. envio_pedido → solo con el botón «Enviar al cliente» del pedido: el punto 6 de U23 (envío automático al convertir) NO se implementa y su prueba 13 (test_crear_pedido_envia_la_confirmacion_y_un_fallo_no_rompe_el_pedido) no se escribe. estado_si_whatsapp_falla → el documento pasa igual a «Pendiente por confirmación» y el enlace sirve; el asesor lo manda a mano. seguimiento_cuantos → seguimiento_max = 1 por defecto. seguimiento_horario → seguimiento_solo_horario = 'true', de 8 a 18, lunes a sábado. iva_precio_calculadora → precio antes de IVA, IVA encima. iva_base_anticipo → anticipo sobre el total con IVA. iva_tarifa_defecto → '19'. iva_cambiar_en_linea → sí, con aviso ámbar «El producto tiene IVA X%» y el renglón «<producto> — IVA» en la Actividad. Las secciones «SI EL USUARIO ELIGE OTRA OPCIÓN» de IVA ((a) a (d)) y las ramas «opción 1/2», «si el usuario elige…» o «según la pregunta» de los demás diseños NO se implementan; la única excepción es la opción 1 del PDF, que sí se implementa (R2).
- **R9 — Ítems que entran.** Los 17 arreglos de plan-bloque3.json, todos «Bien»; no hubo «Cambiar». El MARCA duplicado del grupo pagina-publica-sc se descartó (C1): de él solo sobreviven sitio_web sin esquema → se guarda con https:// (javascript: y data: siguen en 422), la ayuda del campo WhatsApp «el número conectado a Chatwoot» y la vista previa del encabezado en «Diseño de documentos». U16-reenvio-cot se aprobó, pero C13 lo fusiona en U22-validez: se implementa una sola vez (T7 y T17). U22-anticipo va obligatoriamente con U22+H38 (C18) y los dos se aprobaron: la página del cliente muestra el monto del anticipo.
- **R10 — Nombres de archivos y funciones reconciliados (C1 a C7).** Backend: core/documento_cliente.py (no se crea documento_publico.py ni core/marca.py), core/empresa.py, core/correo_documento.py, core/fechas.py, core/telefonos.py, core/chatwoot.py, core/envio_whatsapp.py, core/pdf_documento.py, core/tareas_automaticas.py, core/seguimiento_confirmacion.py, api/v1/empresa.py, api/v1/envio_cliente.py. Frontend: lib/marca-empresa.js, lib/documento-comercial.js, lib/confirmacion-publica.js, lib/fechas-colombia.js (no se crean lib/marca.js, lib/documento-cliente.js ni lib/publico.ts); components/documento/{DocumentoComercial.tsx, EncabezadoMarca.tsx, ContactoEmpresa.tsx, index.ts} (no se crean EncabezadoDocumento ni components/publico/DocumentoFactura.tsx); un solo app/confirmar/layout.tsx (no confirmar/[token]/layout.tsx). La vista de la COT es app/confirmar/[token]/vista-cotizacion.tsx: U22+H38 y C3 la llaman cotizacion-cliente.tsx, es el mismo archivo. Fechas del frontend: fechaLarga(valor) ('8 de octubre de 2026'; un 'AAAA-MM-DD' no se corre de día y un ISO se pasa a hora de Colombia), fechaSolo('AAAA-MM-DD') (el formatoFechaSolo de PLANTILLA), fechaHoraCO(iso) con el formato de U16-seguimiento ('lunes 5 de octubre, 9:00 a. m.') y hace(iso); la prueba (e) de U17 afirma 'sábado 3 de octubre' y '3:15'. Pruebas: las de PLANTILLA van en test_documento_cliente.py (contrato, 1 a 5) y test_correo_documento.py (correo, 6 a 8); los casos de test_documento_cliente.mjs de U22/U23 van en test_documento_comercial.mjs; validarComentarioCambios se reemplaza por puedeEnviarCambios (10 a 1000) en test_confirmacion_publica.mjs; las de U23 se separan en test_pedido_enlace_cliente.py (vista pública, T5) y test_enviar_pedido_al_cliente.py (envío, T7); la prueba 19 de IVA (vista pública con desglose) pasa a T5 sobre documento_cot.
- **R11 — Migraciones (C24 y R13 del Bloque 1).** Cadena fija, con el id de revisión corto como en el repo (archivo `backend/alembic/versions/<id>_<nombre>.py` con `revision = "<id>"`): fa6_026 (fa6_026_enlaces_resultado.py, T1) → fa6_027 (fa6_027_tarifa_iva_producto.py, T3) → fa6_028 (fa6_028_iva_cotizacion.py, T4) → fa6_029 (fa6_029_cambios_cliente_y_validez.py, T5) → fa6_030 (fa6_030_envios_al_cliente.py, T8) → fa6_031 (fa6_031_seguimientos_confirmacion.py, T11). Base esperada: fa6_025 (archivo fa6_025_cotizacion_sin_confirmacion.py, U11 del Bloque 2, B2 Task 3). El nombre fa6_026_pagina_cliente_sc que usa el diseño de U17+H28 no se crea: su columna resultado va en fa6_026 y las de customer_requests en fa6_029. Antes de cada una: `cd C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-bloque3-documentos-envio-iva\backend; $env:ALEMBIC_ENV='testing'; & C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe -m alembic heads`. Si la cabeza real no es la esperada, se encadena a la cabeza real conservando el orden y los nombres, y se anota en el ledger. Solo aditivas (columnas nulas o con server_default, tablas nuevas, índices, un CHECK sobre una columna nueva); nunca downgrade ni DROP. Se aplican a erp_test con `alembic upgrade head` y la misma variable ALEMBIC_ENV=testing. Producción: solo al promover, con el procedimiento de producción de alembic/env.py y el OK del usuario.
- **R12 — Validación de reglas de negocio a mano (C8).** En este backend el handler global convierte todo RequestValidationError en 400 con texto técnico en inglés y sin 'detail'. Por eso las reglas de negocio de los endpoints nuevos o cambiados (pedir-cambios, tarifa_iva del catálogo, empresa, logo, configuración del WhatsApp, seguimiento, /ventas/config) se validan dentro de la función y responden HTTPException(422, 'mensaje en español'). No se usan field_validator, model_validator ni Field(min_length=…) para reglas de negocio; los modelos Pydantic solo declaran tipos. Las páginas públicas mantienen el 400 con detail dict de C10.
- **R13 — Configuración validada y repartida (C23).** Un solo _validar_config(body) al inicio de update_config, todo o nada, con 422. T2 crea el armazón (diccionario de validadores por clave y lista de prefijos reservados) y reserva empresa_ y documentos_; T3 agrega iva_tarifa_defecto (normalizar_tarifa_iva); T7 agrega dias_validez_cotizacion (entero de 1 a 60); T8 reserva envio_whatsapp_ (va por su propio endpoint); T10 reserva tareas_; T11 valida las 6 claves seguimiento_*. get_config quita las claves reservadas para TODOS los roles (hoy el admin recibe todo, incluido el logo). _CONFIG_LECTURA_GENERAL (N8 del Bloque 1) suma iva_tarifa_defecto (T3), dias_validez_cotizacion (T7) y seguimiento_* (T11). Al leer, _config_entero acota igual (un valor fuera de rango usa el límite).
- **R14 — La revisión automática solo corre en producción (hueco 0).** database.py hace load_dotenv() al importar, así que NEBULAE_TAREAS_AUTOMATICAS=1 puesta por error en backend/.env encendería el bucle contra erp_test con uvicorn --reload (la guarda de pytest no lo cubre). Por eso tareas_habilitadas(env) exige NEBULAE_TAREAS_AUTOMATICAS == '1' Y NEBULAE_ENV == 'production', y debe_iniciar(env, modulos) exige además que 'pytest' no esté cargado. «Revisar ahora» responde 409 'La revisión automática está apagada en este servidor.' si tareas_habilitadas() es False. Las pruebas que esperan el 202 ponen las dos variables con monkeypatch.setenv. La prueba manual del diseño (encender el bucle en una consola local) se reemplaza por las pruebas con el runner y la verificación de T20.
- **R15 — Cambios parciales en los .tsx (regla .agents/rules/no-full-tsx-rewrite.md).** El permiso de reescritura que dio el usuario en el Bloque 4 (ítem PERMISOS) NO cubre este bloque. Todo cambio a un .tsx existente se hace por secciones, con bloques mínimos y sin reemplazar más del 30% de sus líneas; ventas/page.tsx (Hub v5) está además en la lista de máxima protección. Dos archivos pueden pasar el 30% por diseños aprobados: app/confirmar/[token]/page.tsx (110 líneas; queda como despachador, U17+H28 y U22+H38) y app/dashboard/admin/configuracion/page.tsx (154 líneas; sus pestañas pasan a FormEmpresa y FormDocumentos, MARCA y PLANTILLA). T0 le pide al usuario, una sola vez, el OK para esos dos; si al llegar a T14 o T15 no hay OK, la tarea se DETIENE antes de pasar el 30% (alternativa sin OK: agregar el despacho o los formularios nuevos con ediciones mínimas y dejar el resto). Los archivos nuevos no tienen esa restricción. Cada cambio se hace con Edit por bloques (nunca Write sobre un .tsx existente ni un script que lo reescriba). El plan aprobado por el usuario en la página del plan del Bloque 3 (2026-10-04) es la explicación previa que la regla pide cuando una tarea toca más de 2 secciones no contiguas de la misma página; si una tarea necesita algo que no está en su alcance, se DETIENE y pregunta. Las reglas .agents/rules/analisis-tab-standard.md y design-system-reference.md se respetan (las pantallas internas usan los tokens de frontend/src/lib/design-system.ts; modo claro; sin dark:) y no se editan en este bloque. El documento del cliente (components/documento y las páginas públicas) usa los colores de la marca de la empresa, no los tokens internos.
- **R16 — Orden de tareas, numeración y un dueño por archivo (C25, C28).** Numeración del cruce → plan: B3-T0 → T1, B3-T1 → T2, B3-T2 → T3 (IVA-PRODUCTO) y T4 (IVA), B3-T3 → T5 (páginas públicas) y T6 (pedir cambios), B3-T4 → T7, B3-T5 → T8 (WhatsApp y entrega) y T9 (PDF), B3-T6 → T10 (revisión automática) y T11 (recordatorio), B3-T7 → T12 (documento) y T13 (IVA, envío y recordatorios), B3-T8 → T14, B3-T9 → T15, B3-T10d → T16, B3-T10a → T17, B3-T10b → T18, B3-T10c → T19, B3-T12 → T20, B3-T11 → T21; T0 es la preparación del worktree. Cambios frente al cruce: (1) cinco tareas del cruce se parten en dos, en el mismo orden, para que ninguna pase de ~7 archivos de producción ni junte dos ítems grandes; el PDF va aparte para que su PARADA (reportlab) no frene el WhatsApp; (2) T16 (ventana del enlace, seguimiento.tsx y Configuración del Hub) va ANTES de T17 a T19, porque crea TarjetaSeguimiento y las props del EnlaceConfirmacionModal que esas pantallas pasan; (3) T17 va antes de T18 y T19, porque es dueña de cotizacion-client.tsx, donde vive el ChannelModal que la SC y el PVEN usan con la prop envioWhatsApp (el cruce los ponía en paralelo); (4) la tarea de datos (T21) va al final, después de la revisión de seguridad (T20): los datos solo se tocan con código revisado. Todas las tareas corren una a la vez y en este orden: comparten el worktree y el índice de git (T12 y T13 no dependen del backend, pero no se corren en paralelo con otra tarea). Dueños: confirmation_tokens.py solo T1; confirmacion_publica.py T1 (solo la revocación al confirmar) → T5 → T6 (solo el endpoint de pedir cambios); erp_ventas.py en serie T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11; main.py T2 → T8 → T10; email.py T2 → T9; documento_cliente.py T2 → T5; core/iva.py T3 → T4; erp_ventas_fase4.py T4 → T5; textos_actividad.py T6 → T7 → T8 → T11; package.json T12 → T13 (cada una agrega solo sus .mjs); flujo.tsx y ventas/page.tsx solo T16; cotizacion-client.tsx, cotizacion/[id]/page.tsx y cotiza/page.tsx solo T17; solicitud/[id]/page.tsx, solicitud-client.tsx y AlertasBadge.tsx solo T18; venta/[id]/page.tsx solo T19.
- **R17 — Dependencias de los Bloques 1 y 2 y su numeración.** El bloque se apila sobre ventas-bloque2-pantallas-sc-cot (que ya trae ventas-bloque1-dinero-flujo). Usa helpers, endpoints, archivos y pruebas que crean tareas de esos bloques y que hoy no existen en el worktree del Bloque 1 (cada uno marcado en Files con su origen). Numeración: «B1-Tn» es la Task n del plan del Bloque 1 (docs/superpowers/plans/2026-10-03-ventas-bloque1-dinero-flujo.md; coincide con su cruce). «B2 Task n» es la Task n del plan del Bloque 2 (docs/superpowers/plans/2026-10-04-ventas-bloque2-pantallas-sc-cot.md), que es la que se usa en las secciones propias de este plan (Files, Interfaces, Depende de, Reglas). En el texto copiado de los diseños y del cruce del Bloque 3 (choques, huecos, ítems), «B2-Tn» es la numeración del CRUCE del Bloque 2, corrida en su plan así: B2-T0 → B2 Task 1, B2-T1 → B2 Task 2, B2-T2 → B2 Task 3, B2-T3 → B2 Task 4, B2-T4 → B2 Task 5, B2-T5 → B2 Task 6, B2-T6 → B2 Task 7, B2-T7 → B2 Task 8, B2-T8 → B2 Task 9, B2-T9 → B2 Task 10, B2-T10 → B2 Task 12 (datos) y B2-T11 → B2 Task 11 (revisión). En ese mismo texto copiado, «T1…T14» sin prefijo (por ejemplo «T10 del Bloque 1», «T6 H29», «un anticipo viejo mal guardado (T14)») son tareas del Bloque 1 (B1-Tn), nunca tareas de este plan, y «B3-Tn» es la numeración del cruce de este bloque (R16 da su tarea en este plan); en las secciones propias de este plan, «Tn» sin prefijo sí es la Task n de este plan. T0 verifica que existan las piezas: si falta una pieza de código (función, endpoint, archivo de la app, componente), T0 se DETIENE y se reporta, porque nada que sea de otro bloque se crea aquí; si falta solo un módulo de prueba de las listas de regresión, se anota en el ledger y se quita de la regresión de este bloque. Si un nombre cambió al implementarse en su bloque, se usa el nombre real y se anota en el ledger.
- **R18 — Credenciales y servicios externos.** Ninguna credencial en el código, en las pruebas, en el chat ni en los prompts de los implementadores. La conexión con Chatwoot (CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID, CHATWOOT_API_TOKEN), el correo (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM) y FRONTEND_URL se leen del entorno en cada llamada; la bandeja y los nombres de las plantillas de Meta, de admin_config. Las pruebas usan dobles: FakeChatwoot sobre app.core.chatwoot._peticion, send_email y smtp_configurado falsos, smtplib.SMTP falso, y monkeypatch.setenv con valores ficticios ('https://chatwoot.invalid', 'token-de-prueba'). Sin configuración, todo sigue funcionando y la pantalla dice qué falta («no configurado», wa.me manual, correo omitido con su motivo). En T0 a T19 nunca se llama a Chatwoot, SMTP ni Meta reales; el primer envío real es de T20 y solo con la configuración que cargue el usuario. Los implementadores no crean cuentas ni manejan contraseñas.
- **R19 — Enlaces (C11, C12, C14, huecos 1 y 2).** TIPOS_CONFIRMACION = ('SC','COT') y TIPOS_CONSULTA = ('PVEN',). T1 es la única dueña de confirmation_tokens.py; las demás tareas solo consumen su API. En T1 también: confirmar una SC o una COT revoca, en el mismo commit que pone CONFIRMADA, sus otros enlaces pendientes (en cada rama de confirmar_via_token, revoke_pending_tokens(db, tipo, id, commit=False, excepto_hash=hash_token(token))); enlace_publico(raw, tipo) arma /confirmar/{raw} o /pedido/{raw} con FRONTEND_URL y registra logger.error si NEBULAE_ENV=production y FRONTEND_URL falta o apunta a localhost; preflight.py advierte lo mismo al arrancar (sin abortar). Vida del enlace: SC 2 días (TOKEN_TTL_DAYS), COT hasta el final de valida_hasta, PVEN 30 días (R6). Cancelar el pedido revoca su enlace (T5).
- **R20 — Un solo envío y un solo orden de capas (C15, C16, C17, C21, C27).** La única función de envío por WhatsApp es envio_whatsapp.enviar_documento(..., proposito='CONFIRMACION'|'CONSULTA'|'SEGUIMIENTO'), con whatsapp_configurado(db); no se crea enviar_recordatorio_confirmacion. Dos plantillas de Meta (Utilidad, español): 'documento' (envio_whatsapp_plantilla) y 'recordatorio' (envio_whatsapp_plantilla_recordatorio). El único constructor de correos al cliente es correo_documento(perfil, tipo, numero, cliente, link, resumen=None, proposito='CONFIRMACION', vence=None); _enviar_correo_confirmacion gana remitente_nombre; el aviso al asesor usa _avisar_asesor_por_correo. Una sola _detalle_envio(canal, correo_res, wa_res=None, vence=None, seguimiento=None) con los renglones en este orden y solo si aplican: Canal de envío, WhatsApp, Mensaje, Correo de respaldo (o Correo), Enlace vigente hasta, Recordatorio automático; vence solo se pasa en la COT (valida_hasta) y en el PVEN. Capas dentro de enviar_solicitud_para_confirmacion y enviar_cotizacion_para_confirmacion: H27 (canal y correo) → PLANTILLA (correo_documento, T2) → H28 (limpiar cambios_cliente_* y with_for_update, T6) → U22-validez (valida_hasta y reenvío, T7) → U16-seguimiento (iniciar y detener_por_cotizacion antes del commit, T11) → U16-envio (WhatsApp después del commit, T8). El PDF (T9) no es una capa aparte: se arma dentro de la del correo, justo antes de _enviar_correo_confirmacion, solo en la COT y en el PVEN. El orden de las capas dentro de la función no es el de las tareas: T11 se implementa después de T8 pero su capa va antes del commit, y la de T8 después. Todo reenvío llama a iniciar(); el PVEN no tiene seguimiento. El teléfono sale siempre de telefono_del_documento(db, doc). seguimiento_confirmacion importa envio_whatsapp y el correo dentro de _enviar_por_defecto (import perezoso, para monkeypatch y sin ciclos con erp_ventas).
- **R21 — Capturas sin crear datos ni manejar contraseñas.** Toda tarea que cambia una pantalla deja capturas con Playwright antes y después (375, 1024 y 1440 px según la tarea). Las toma el CONTROLADOR, no el implementador (el implementador deja escrita la lista de pantallas y estados). Frontend del worktree en el puerto 5300, SIEMPRE con la variable que lo saca de producción: `cd C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-bloque3-documentos-envio-iva\frontend; $env:NEXT_PUBLIC_API_URL='http://localhost:8020/api/v1'; npx next dev -p 5300` (sin NEXT_PUBLIC_API_URL el frontend apunta a PRODUCCIÓN, api.nebulaekids.com). Dos modos: (a) páginas públicas (/confirmar, /pedido) y estados difíciles de reproducir (enlace vencido, reemplazado, WhatsApp fallido, recordatorio agotado): page.route intercepta /api/v1/** y responde con datos DEMO armados con las formas de las pruebas del backend; (b) pantallas internas: backend del worktree en el puerto 8020 contra erp_test (`cd C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-bloque3-documentos-envio-iva\backend; $env:CORS_ALLOWED_ORIGINS='http://localhost:5300'; & C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe -m uvicorn main:app --port 8020`), sesión del controlador con QA_EMAIL/QA_PASS leídos de su propio entorno y nunca impresos (patrón de recorrido.js del scratchpad), navegando solo documentos DEMO que ya existen; todo lo que escribiría (guardar, enviar, revisar ahora) se captura interceptando esa petición con page.route. No se crean ni cambian documentos en erp_test, no se usan los documentos reales del usuario ni los puertos 8000, 5000 y 5100, y al terminar se apagan los dos servidores. Carpetas: scratchpad del controlador, capturas/bloque3/antes, capturas/bloque3/despues y capturas/bloque3/T<n>. Las capturas van a la página de revisión visual de T20 (Artifact con notas por clic), donde el usuario las ve y anota.
- **R22 — Los choques del cruce son vinculantes.** Cada choque de «Choques resueltos» trae su resolución y las tareas que la aplican; esa resolución gana sobre el texto de los diseños individuales. Lo mismo para la resolución de cada hueco y de cada prueba que se rompe.
- **R23 — La nota externa del Bloque 2 se llama 'EXTERNA' y el gancho va en erp_ventas._agregar_nota.** El diseño de U16-seguimiento la nombra 'NOTA_EXTERNA' (punto c de sus cambios, su prueba 9 y su «Depende de»), pero el Bloque 2 la implementó como el tipo 'EXTERNA' («Nota externa») de TIPOS_CHATTER, y reinicia_atraso(tipo) es verdadero para LLAMADA, WHATSAPP, CORREO y EXTERNA (R1 del plan del Bloque 2, B2 Task 4). Según ese plan, TIPOS_CHATTER, validar_nota y reinicia_atraso viven en app/core/chatter.py, pero _agregar_nota(db, entidad, doc, body, user) vive en app/api/v1/erp_ventas.py (B2 Task 4), como dice el punto 4c del diseño de U16-seguimiento; el «core/chatter._agregar_nota» del orden del cruce es un error. En T11, erp_ventas._agregar_nota llama posponer_por_contacto (SC y COT) cuando reinicia_atraso(tipo) es verdadero, antes de su commit único y sin repetir la lista de tipos; chatter.py no se toca. La prueba 9 manda {action:'CHATTER', tipo:'EXTERNA', description:'Hablé con el cliente'}; se agrega el caso tipo 'NOTA' (nota interna), que no pospone el recordatorio. Si al llegar a T11 el nombre o el módulo real es otro, se usa el real y se anota en el ledger (R17).
- **R24 — Nombres de los campos del documento del cliente (completa C2).** U17+H28, U22+H38 y U23 diseñaron cada uno su dict; con C2 hay una sola forma y sus pruebas se escriben con estos nombres. Comunes: 'fecha' → fecha_emision (ISO con 'Z'); 'asesor' → atendido_por (solo el nombre del asesor); 'cliente.direccion' → cliente.direccion_entrega; 'entrega' → fecha_entrega_estimada ('AAAA-MM-DD'; el texto «Entrega estimada: … (aproximada…)» lo arma el frontend); forma_pago.pct → pago.anticipo_pct; 'empresa' no va dentro del documento: viaja en la respuesta (C26). pago gana una clave que C2 no listó y que U22+H38 necesita: manual (bool; el anticipo lo puso el asesor a mano, origen ORIGEN_MANUAL; nunca la nota), así que CLAVES_PAGO = {modalidad, anticipo_pct, anticipo, saldo, saldo_a_favor, anticipo_por_pagar, pagado, pagos, instrucciones, manual}. SC (documento_sc): lineas con n, descripcion y cantidad (precio_unitario, total_linea, iva_etiqueta, iva_pct y anticipo en None); totales None; pago = {modalidad, anticipo_pct (de forma_de_pago), manual False y lo demás None}; notas = [«Nota para el cliente»] (R3). total_unidades no es clave del contrato: la prueba 1 de U17 suma documento.lineas[].cantidad. Los textos de forma de pago de U17 para la SC (100, 60, 0 y no reconocida) los da textoFormaPago(pago) del frontend cuando pago.anticipo es None. COT (documento_cot): forma_pago de U22 {modalidad, pct, anticipo, saldo, manual, saldo_a_favor, anticipo_por_pagar} → pago con esos valores (pagado y pagos None); la prueba 1 de U22 compara lineas[0] en sus claves {cantidad, descripcion, precio_unitario, total_linea}. PVEN (documento_pven): resumen de U23 {total, pagado, saldo, anticipo_requerido, anticipo_pendiente} → totales.total, pago.pagado, pago.saldo, pago.anticipo y pago.anticipo_por_pagar; pagos → pago.pagos [{concepto, monto, metodo, fecha}]; forma_pago {modalidad, pct} → pago.modalidad y pago.anticipo_pct; cot_numero viaja junto al documento en la respuesta de /pedido-cliente/ver ({status, empresa, data: documento, cot_numero}). Las pruebas 2 y 10 de U23 afirman esos nombres. En el frontend, textoFormaPago(pago), resumenPagosCliente(pago, totales) y ResumenPagosCliente (componente local de app/pedido/[token]/page.tsx) leen esos campos.

## Choques resueltos (vinculantes)

- C1 · MARCA diseñada dos veces (marca-y-plantilla y pagina-publica-sc) con piezas incompatibles: core/empresa.py vs core/marca.py, claves empresa_nombre_comercial vs empresa_nombre, PUT vs PATCH, 422 vs 400 en update_config, logo público en empresa.py vs confirmacion_publica.py, lib/marca-empresa.js vs lib/marca.js, EncabezadoMarca vs EncabezadoDocumento. VINCULANTE: queda solo la MARCA de marca-y-plantilla (core/empresa.py, api/v1/empresa.py con router /api/v1/empresa y router_publico /api/v1/publico, PUT, historial EMPRESA, 422). De pagina-publica-sc solo se conserva: sitio_web sin esquema recibe https:// (javascript: y data: siguen en 422), la ayuda «el número conectado a Chatwoot» en WhatsApp y la vista previa del encabezado (va en Diseño de documentos). Se descartan core/marca.py, lib/marca.js, info-empresa.tsx, EncabezadoDocumento.tsx, el GET del logo en confirmacion_publica.py y el PATCH. Consumidores: leer_marca → perfil_publico(db); datos_empresa_publicos (U22/U23) → perfil_publico(db) + textos_documento(db, tipo), y términos y datos para pagar viajan SOLO en respuestas con token; U16-envio usa empresa_para_mensajes(db).
  **Aplica:** T2 (backend), T12 (lib/marca-empresa.js), T14 (formulario).
- C2 · Contrato del documento del cliente definido tres veces con formas distintas: PLANTILLA (core/documento_publico.armar_documento), pagina-publica-sc (core/documento_cliente.resumen_publico_sc, productos {n, descripcion, cantidad}) y pagina-publica-cot-pven (OTRO core/documento_cliente.py con el mismo nombre: cotizacion_para_cliente / pedido_para_cliente, impuestos [{tarifa_pct, base, valor}]), más IVA, que cambia _productos_publicos y crea desglose_documento con iva_por_tarifa [{tarifa, etiqueta, base_cop, iva_cop}]. VINCULANTE: un solo módulo backend/app/core/documento_cliente.py (no se crea documento_publico.py) con armar_documento y CLAVES_DOCUMENTO de PLANTILLA como único contrato, y tres constructores documento_sc, documento_cot y documento_pven. Forma única: lineas [{n, descripcion, cantidad, precio_unitario, total_linea, iva_etiqueta, iva_pct, anticipo}] (None donde no aplica); totales {subtotal, descuento_pct, descuento, impuestos [{etiqueta, base, valor}], ajuste_redondeo, total} o None; pago {modalidad, anticipo_pct, anticipo, saldo, saldo_a_favor, anticipo_por_pagar, pagado, pagos, instrucciones} o None; notas [{titulo, texto}]; valida_hasta; terminos; mensaje_pie. impuestos se mapea desde iva.desglose_documento y nunca se recalcula; ajuste_redondeo solo en documentos sin IVA discriminado. data de /confirmar/ver conserva arriba numero, estado, total_cop y productos (los afirman test_confirmacion_cotizacion y test_confirmacion_solicitud). Una sola prueba de claves exactas para SC, COT y PVEN.
  **Aplica:** T2 (armar_documento y CLAVES_DOCUMENTO), T4 (desglose_documento), T5 (documento_sc, documento_cot, documento_pven), T9 (el PDF dibuja ese mismo documento), T12 (normalizarDocumento y filasTotales), T15 (vistas); R24 nombra los campos.
- C3 · Componente visual triplicado: DocumentoComercial (PLANTILLA), EncabezadoDocumento + VistaSolicitud (pagina-publica-sc) y components/publico/DocumentoFactura (cot-pven). VINCULANTE: DocumentoComercial (variante 'degradado' para SC, 'acento' para COT y PVEN) es el único que pinta el documento; gana las props metaDerecha (Válida hasta, Según COT) y extraTotales (ResumenPagosCliente de U23). vista-solicitud.tsx, cotizacion-cliente.tsx y pedido/[token]/page.tsx solo arman acciones, sello y textos de «¿Qué pasa si confirmo?» y «¿Qué sigue?». ContactoEmpresa se conserva en components/documento. Anticipo por línea: solo en la COT, en letra pequeña; la SC no tiene montos y el PVEN muestra sus pagos.
  **Aplica:** T5 (anticipo por línea solo en la COT), T12 (DocumentoComercial con metaDerecha y extraTotales), T15 (vistas).
- C4 · Total de línea: PLANTILLA arma total_linea = monto_linea(p) de U19, pero el ítem IVA cambia monto_linea para preferir total_con_iva_cop. Con IVA, cada línea saldría con IVA y el Subtotal sin IVA: el documento no sumaría (el mismo error de H38). VINCULANTE: en el documento del cliente total_linea = redondear_peso(total_cop), sin IVA y antes del descuento global; monto_linea con IVA solo sirve para repartir el anticipo por línea (U19).
  **Aplica:** T2 (linea_publica), T4 (monto_linea con IVA solo para repartir el anticipo), T5 (constructores).
- C5 · Helpers del frontend duplicados: lib/confirmacion-publica.js (pedirPublico) vs lib/publico.ts (postPublico); lib/documento-comercial.js vs lib/documento-cliente.js; cinco funciones de fecha (fechaHoraColombia, formatoFechaDocumento, fechaLarga, fechaHoraCO, hace); validarComentarioCambios (mínimo 5) vs puedeEnviarCambios (mínimo 10). VINCULANTE: lib/confirmacion-publica.js (pedirPublico, vistaDeRespuesta, TEXTOS_ENLACE, claveIdempotencia, puedeEnviarCambios con 10 a 1000 caracteres para SC y COT); lib/documento-comercial.js (normalizarDocumento, filasTotales, textoFormaPago, colorTextoSobre, enlaceSeguro, contactosEmpresa, resumenPagosCliente, textoEnlaceVigente); lib/fechas-colombia.js nuevo (fechaLarga, fechaSolo, fechaHoraCO, hace) que todos importan. No se crean lib/publico.ts, lib/documento-cliente.js ni lib/marca.js. pedirPublico lee también la clave 'message', porque el 400 de validación de main.py no trae 'detail'.
  **Aplica:** T12, T13 (importa fechas-colombia.js), T15.
- C6 · Fechas de Colombia en el backend hechas cuatro veces: fecha_colombia con −5 h fijo (U17), _now_bogota (U22-validez la cita en erp_ventas.py, pero solo existe en erp_ventas_fase4.py), TZ_CO (U16-seguimiento) y vence_al_final_del_dia. VINCULANTE: nuevo backend/app/core/fechas.py (UTC−5 fijo; ahora_utc, hoy_colombia, a_colombia, vence_al_final_del_dia, fecha_larga, fecha_hora_co), creado en B3-T0 y usado por todos. erp_ventas_fase4._now_bogota no se toca.
  **Aplica:** T1 (core/fechas.py); todas lo consumen, en especial T5, T7 y T11.
- C7 · Layouts: PLANTILLA y U22+H38 crean app/confirmar/layout.tsx; U17 crea app/confirmar/[token]/layout.tsx; PLANTILLA y U17 cambian lang en app/layout.tsx, que también toca H1 del Bloque 1. VINCULANTE: un solo app/confirmar/layout.tsx (title 'Documento', robots noindex/nofollow, referrer 'no-referrer'; la pestaña la fija la página con document.title) y app/pedido/layout.tsx igual con title 'Tu pedido'. lang='es' lo hace una sola tarea (B3-T7) sobre la versión de H1. Tipado LayoutProps<'/confirmar'> de Next 16.
  **Aplica:** T12 (lang="es"), T15 (app/confirmar/layout.tsx y app/pedido/layout.tsx).
- C8 · Validación: U22-cambios (Field min_length), H28-cambios (model_validator) e IVA-PRODUCTO (field_validator en ProductBase/ProductUpdate) suponen que Pydantic responde 422. En este backend main.validation_exception_handler convierte TODO RequestValidationError en 400 {status, message} con texto técnico en inglés y sin 'detail'. VINCULANTE: las reglas de negocio de endpoints nuevos se validan a mano con HTTPException(422, mensaje en español), como N1 del Bloque 1. PedirCambiosBody solo declara tipos (token, tipo, comentario). En catálogo, tarifa_iva es Optional[str] sin validador y create_product/update_product llaman normalizar_tarifa_iva dentro de try → 422.
  **Aplica:** T2, T3, T4, T6, T7, T8, T10 y T11 (R12).
- C9 · «Pedir cambios» diseñado dos veces sobre el mismo POST /confirmar/pedir-cambios con flujos incompatibles. H28-cambios: consultar sin efectos y luego reclamar; responde 400 a un token COT sin gastarlo; tipos CAMBIOS y NO_LA_NECESITA; mínimo 10; acción CAMBIOS_CLIENTE; columnas en customer_requests; aviso con pastilla y correo. U22-cambios: consume primero; mínimo 5; acción CAMBIOS_PEDIDOS derivada de logs; sin aviso al asesor; otro user_name; 400 genérico. VINCULANTE, un solo endpoint: (1) valida el cuerpo a mano → 422 sin tocar el token; (2) consultar_token(tipos SC/COT); si no está vigente → 400 _detalle_enlace sin gastar nada; (3) reclamar_token atómico; (4) rama por tipo con el documento bloqueado. Rama SC = H28-cambios. Rama COT: BORRADOR, gate2_confirmed_at None, sin tocar la SC (U15) ni el lead. En las dos ramas: revoke_pending_tokens(commit=False), marcar_resultado 'CAMBIOS', acción 'CAMBIOS_CLIENTE', user_name 'Cliente (por el enlace)', columnas cambios_cliente_at/_tipo/_comentario en customer_requests Y sales_quotations, un solo commit, luego aviso al asesor (de la SC; en la COT, el asesor de su SC) con renglón AVISO_ASESOR. NO_LA_NECESITA solo existe en la SC. Mínimo 10 y máximo 1000 en las dos. get_cotizacion expone cambios_cliente desde columnas; reenviar las limpia; alertas_resumen.cambios_cliente cuenta SC y COT (el asesor ve solo las suyas).
  **Aplica:** T6 (endpoint único), T12 (puedeEnviarCambios), T15 (panel), T17 y T18 (tarjetas).
- C10 · Error genérico de la Ronda 7: U17 distingue el estado del enlace para la SC (confirmada, vencido, reemplazado, no_disponible, cambios_enviados, actualizada). U22+H38, U22-cambios (su prueba 4 afirma el texto 'El enlace no es válido o ya expiró.'), U22-validez y U23 conservan el genérico. VINCULANTE: _detalle_enlace se aplica igual a SC y COT. En la COT, 'confirmada' muestra solo número y fecha, sin líneas ni precios. Todo lo que no es 'pendiente' sigue en 400 con detail dict. El enlace del PVEN (de consulta) conserva el genérico, con 'empresa' para el contacto. Las pruebas afirman detail['estado_enlace'], nunca el texto.
  **Aplica:** T5 (estado del enlace en SC y COT), T6 (pedir cambios con enlace no vigente), T7 (enlace de COT vencido), T15 (AvisoEnlace).
- C11 · Tipos de token: U23 guarda tokens 'PVEN' reutilizables en la misma tabla. U22 filtra el tipo solo en peek_token y verify_and_consume_token, y U17 los reemplaza por consultar_token/reclamar_token sin filtro. Verificado: hoy /confirmar/confirmar consume el token ANTES de mirar su tipo, así que quemaría el enlace del pedido. VINCULANTE: TIPOS_CONFIRMACION=('SC','COT') y TIPOS_CONSULTA=('PVEN',); consultar_token, reclamar_token, peek_token y verify_and_consume_token filtran con document_type = ANY(:tipos) parametrizado, por defecto TIPOS_CONFIRMACION. No se crea leer_token_vigente: U23 usa consultar_token(tipos=TIPOS_CONSULTA).
  **Aplica:** T1; T5 usa TIPOS_CONSULTA en /pedido-cliente/ver; T20 lo revisa.
- C12 · Firmas de token cambiadas por cinco diseños: commit (H29), resultado REVOCADO (U17), excepto_raw y revocar_token (U16-seguimiento), expires_at (U22-validez) y ultimo_enlace_vigente (U23). VINCULANTE, B3-T0 es dueño único de confirmation_tokens.py: create_confirmation_token(db, tipo, id, expires_at=None), que sigue haciendo commit; revoke_pending_tokens(db, tipo, id, commit=True, excepto_hash=None), que pone used_at y resultado 'REVOCADO'; revocar_token; consultar_token; reclamar_token; marcar_resultado (sin commit); ultimo_enlace_vigente; hay_enlace_mas_reciente_vigente; enlace_publico(raw, tipo), que arma /confirmar/ o /pedido/. Además, confirmar una SC o COT revoca en el mismo commit sus demás enlaces pendientes; hoy quedan vivos hasta vencer.
  **Aplica:** T1 (y T5, T6 y T11 usan commit=False, marcar_resultado y excepto_hash).
- C13 · El reenvío de una COT pendiente está diseñado dos veces (U22-validez y U16-reenvio-cot). VINCULANTE: un solo cambio en enviar_cotizacion_para_confirmacion, dentro de U22-validez: acepta PENDIENTE_CONFIRMACION; el reenvío no cambia el estado ni llama a la sincronización ni a mover_lead; el reenvío manual renueva valida_hasta y el recordatorio automático no; texto 'Enlace de confirmación reenviado al cliente' + canal; 400 con etiqueta_estado; se actualiza el docstring de la Ronda 2; llama a seguimiento.iniciar(). U16-reenvio-cot deja de ser un ítem aparte.
  **Aplica:** T7 (backend), T17 (botón «Reenviar»).
- C14 · Vida del enlace: SC 2 días, COT hasta valida_hasta (5 días por defecto), PVEN 30 días. Pero U16-envio escribe fijo «El enlace vence en 2 días» en la COT, U16-seguimiento crea el enlace del recordatorio de la COT con el TTL por defecto y U17 dice que sigue venciendo a los 2 días. VINCULANTE: WhatsApp, correo y modal usan la fecha real ('vence') que devuelve el envío. El recordatorio de una COT crea su enlace con expires_at = vence_al_final_del_dia(valida_hasta). Si la validez ya pasó, no se envía: DETENIDO 'COTIZACION_VENCIDA', con el renglón «La cotización venció el … sin respuesta: re-cotízala o reenvíala». El recordatorio nunca cambia valida_hasta.
  **Aplica:** T7 (vence en COT y PVEN), T8 (textos con la fecha real), T11 (recordatorio de la COT), T16 (ventana del enlace).
- C15 · Plantillas de WhatsApp: el TEXTO_PLANTILLA de U16-envio dice «revisar y confirmar tu {{3}}» y su texto del PVEN dice «revisarlo y confirmarlo», pero U23 hace el pedido de solo consulta. U16-seguimiento exige una plantilla de recordatorio y las funciones enviar_recordatorio_confirmacion y whatsapp_configurado, que U16-envio no define. VINCULANTE: dos plantillas de Meta, categoría Utilidad, en español. 'documento', neutra para SC, COT y PVEN: «Hola {{1}}, te escribimos de {{2}}. Te enviamos el documento {{3}}. Puedes revisarlo en este enlace: {{4}} Si tienes alguna pregunta, responde este mensaje.», con {{3}} = 'Solicitud SC-…', 'Cotización COT-…' o 'Pedido de venta PVEN-…'. 'recordatorio', con las 4 variables de U16-seguimiento. Claves envio_whatsapp_plantilla y envio_whatsapp_plantilla_recordatorio. La única función de envío es envio_whatsapp.enviar_documento(..., proposito CONFIRMACION, CONSULTA o SEGUIMIENTO), que expone whatsapp_configurado(db). Texto libre del PVEN: «Puedes ver tu pedido, lo que has pagado y lo que te falta en este enlace».
  **Aplica:** T8 (plantillas y enviar_documento), T11 (proposito SEGUIMIENTO), T13 y T16 (textos y Configuración).
- C16 · Renglones del envío en la Actividad: H27 (su prueba 1 afirma ['Canal de envío','Correo de respaldo']), U16-envio ('WhatsApp', 'Mensaje'), U23 ('Enlace vigente hasta') y U16-seguimiento ('Recordatorio automático') cambian _detalle_envio cada uno por su lado. VINCULANTE: una sola _detalle_envio(canal, correo_res, wa_res=None, vence=None, seguimiento=None) con este orden: Canal de envío, WhatsApp, Mensaje, Correo de respaldo (o Correo), Enlace vigente hasta, Recordatorio automático. Cada renglón sale solo si aplica y ninguno lleva clave 'campo'.
  **Aplica:** T7 (firma completa y «Enlace vigente hasta»), T8 (WhatsApp y Mensaje), T11 (Recordatorio automático y cierre de la prueba 1 de H27), T13 (avisos).
- C17 · Correos: H27 tiene asunto fijo con 'Nebulae'; PLANTILLA lo cambia por correo_documento; U22-validez agrega la validez; U23 arma su propio asunto; U16-seguimiento usa otro; H28-cambios reusa _enviar_correo_confirmacion para avisar al ASESOR, con mensajes pensados para el cliente. VINCULANTE: correo_documento(perfil, tipo, numero, cliente, link, resumen, proposito, vence) es el único constructor de correos al cliente; _enviar_correo_confirmacion gana remitente_nombre; el aviso al asesor usa su propio helper _avisar_asesor_por_correo, con textos para el asesor.
  **Aplica:** T2 (correo_documento y remitente_nombre), T6 (_avisar_asesor_por_correo), T7, T8, T9 y T11 (lo usan).
- C18 · Congelamiento en update_cotizacion: H36 (Bloque 1) sacó anticipo_cop porque el cliente no lo veía; U22+H38 se lo muestra; U22-anticipo lo vuelve a congelar con el requerido vivo; IVA agrega tax_cop y la tarifa de cada línea y recalcula en _aplicar_iva; H40 (Bloque 2) hace el 409. VINCULANTE: U22-anticipo va obligatoriamente con U22+H38; si el usuario lo rechaza, la página del cliente muestra solo el %, sin monto. Orden único: guardas del Bloque 1 → loop → anticipo manual (R3) → _aplicar_iva → recálculo del anticipo sobre el total con IVA (H36) → comparación (PRICE_FREEZE_FIELDS + tax_cop + iva_tarifa + requerido) → 409 de H40 con una lista única ('IVA', 'Anticipo'…). Una sola tarea, B3-T4, después de B3-T2.
  **Aplica:** T4 (_aplicar_iva, tax_cop e iva_tarifa en el congelamiento), T5 (el documento de la COT muestra el monto del anticipo), T7 (anticipo y lista única del 409).
- C19 · Notas visibles: pagina-publica-sc pregunta nota_cliente_sc y recomienda una nota aparte, porque las Notas de la SC son internas. cot-pven pregunta notas_cliente y recomienda MOSTRAR la nota de la SC. Eso contradice H35 del Bloque 1 y los datos: las 6 notas de erp_test están en tercera persona («el cliente necesita factura electrónica»). VINCULANTE: una sola pregunta, con esta recomendación: columna nueva customer_requests.nota_cliente («Nota para el cliente») visible en SC, COT y PVEN; las Notas de la SC siguen internas; la nota de la COT es visible, con el aviso «El cliente verá esta nota»; la del PVEN solo si difiere (H35).
  **Aplica:** T5 (columna y documentos), T17 y T18 (avisos «El cliente verá esta nota» y campo).
- C20 · COT temprana (U11) frente a «Pedir cambios» en la SC: H28 deja vivo el enlace de una COT temprana ya enviada, y con U15 aprobar esa COT confirma la SC. El cliente podría pedir cambios en la SC y luego aprobar la COT vieja. VINCULANTE: si la SC tiene una COT activa en PENDIENTE_CONFIRMACION, pedir cambios en la SC revoca sus enlaces, la pasa a BORRADOR con gate2 None y deja un renglón «El cliente pidió cambios en la solicitud: ajusta y reenvía la cotización», todo en el mismo commit. Si la COT está en BORRADOR, solo se agrega el renglón.
  **Aplica:** T6.
- C21 · Capas dentro de enviar_solicitud_para_confirmacion y enviar_cotizacion_para_confirmacion, tocadas por H27, PLANTILLA, H28-cambios, U22-validez, U16-envio y U16-seguimiento. VINCULANTE, este orden: H27 (canal y correo) → PLANTILLA (correo_documento) → H28 (limpiar cambios_cliente_* y with_for_update) → U22-validez (valida_hasta, reenvío) → U16-seguimiento (iniciar y detener_por_cotizacion, antes del commit) → U16-envio (WhatsApp, después del commit). Todo reenvío llama a iniciar(). El PVEN no tiene seguimiento.
  **Aplica:** T2, T6, T7, T8 y T11, cada una su capa (R20).
- C22 · Alertas de atraso: el recordatorio enviado pone updated_at (U16-seguimiento); la nota externa también (Bloque 2, decisión CAMBIAR del usuario); H28 escribe en la SC (onupdate=_now); U16-entrega agrega renglones MENSAJE_CLIENTE. VINCULANTE: reinician el conteo el recordatorio enviado con éxito, llamada, WhatsApp, correo, nota externa y los cambios de estado. No lo reinician las confirmaciones de entrega de WhatsApp, los recordatorios fallidos ni el aviso al asesor. 'cambios_cliente' es una cuenta aparte que no suma a 'atrasados'. Se respeta el hueco del Bloque 2: una SC con COT activa no cuenta como atrasada.
  **Aplica:** T6 (cambios_cliente aparte), T8 (MENSAJE_CLIENTE), T11 (recordatorio), T18 (pastilla aparte en AlertasBadge).
- C23 · Configuración sin validar y repartida: update_config acepta cualquier clave; MARCA, TAREAS, U16-seguimiento, IVA y U22-validez agregan cada uno su guarda; N8 recibe claves en _CONFIG_LECTURA_GENERAL de tres diseños; el ConfigPanel del Hub lo tocan seis ítems. VINCULANTE: un solo _validar_config(body) por tabla al inicio de update_config, todo o nada, con 422: prefijos reservados empresa_/documentos_, tareas_*, envio_whatsapp_* (que van por su propio endpoint), seguimiento_*, iva_tarifa_defecto, dias_validez_cotizacion (de 1 a 60). get_config quita las claves reservadas para TODOS los roles: hoy el admin las recibe todas, incluido el logo. _CONFIG_LECTURA_GENERAL agrega iva_tarifa_defecto, dias_validez_cotizacion y seguimiento_*. El ConfigPanel lo toca una sola tarea; el toggle decorativo notif_whatsapp se oculta, porque no hace nada y se confundiría con el envío automático.
  **Aplica:** T2, T3, T7, T8, T10, T11 (backend, R13) y T16 (ConfigPanel; ocultar notif_whatsapp).
- C24 · Migraciones: seis diseños usan fa6_026 o fa6_0NN en paralelo. VINCULANTE, cadena fija sobre fa6_025 (U11), verificando con alembic heads: fa6_026_enlaces_resultado (tokens.resultado) → fa6_027_tarifa_iva_producto → fa6_028_iva_cotizacion (sales_quotations.tax_cop) → fa6_029_cambios_cliente_y_validez (customer_requests: cambios_cliente_* y nota_cliente; sales_quotations: cambios_cliente_* y valida_hasta) → fa6_030_envios_al_cliente → fa6_031_seguimientos_confirmacion. Todas aditivas (R13).
  **Aplica:** T1, T3, T4, T5, T8, T11 (R11).
- C25 · Dueños múltiples: confirmacion_publica.py y app/confirmar/** los tocan U17, U22+H38, U22-cambios, U23 y PLANTILLA; main.py lo tocan MARCA, U16-envio y TAREAS. VINCULANTE: una tarea backend (B3-T3) y una frontend (B3-T9) hacen todas las ramas públicas. main.py va en tres tareas secuenciales: B3-T1 (routers de empresa), B3-T5 (router envio_cliente) y B3-T6 (startup y shutdown de tareas).
  **Aplica:** T5, T6 y T15 (ramas públicas); main.py en T2, T8 y T10.
- C26 · Marca en la página pública: PLANTILLA pide /publico/empresa en paralelo con /confirmar/ver, mientras U17 mete 'empresa' en /confirmar/ver. VINCULANTE: /confirmar/ver, /confirmar/confirmar, /confirmar/pedir-cambios y /pedido-cliente/ver devuelven 'empresa' (perfil_publico) en el 200 y en el detail del 400, y la página hace una sola llamada. /publico/empresa queda para la vista previa de Configuración.
  **Aplica:** T5 (empresa en cada respuesta pública), T6 (pedir cambios), T15 (una sola llamada), T14 (vista previa con /publico/empresa).
- C27 · Teléfono de WhatsApp: U16-envio valida en _canal_de_envio solo doc.customer_phone, pero _enviar_whatsapp cae a Customer.phone. Una SC sin teléfono propio daría 400 aunque el envío funcionaría. VINCULANTE: un helper único, telefono_del_documento(db, doc), para _canal_de_envio, _enviar_whatsapp y medio_posible del seguimiento. _sc_dict, _cot_dict y _ven_dict exponen telefono_whatsapp para el customerHasPhone del frontend.
  **Aplica:** T1 (telefono_del_documento), T8 (uso y telefono_whatsapp en los dicts), T11 (medio_posible), T17 a T19 (customerHasPhone).
- C28 · EnlaceConfirmacionModal (flujo.tsx) recibe props de H27, H30, U22-validez (vence), U23 (tipo consulta), U16-envio (whatsapp, telefono), U16-entrega (verificación a los 6 s) y U16-seguimiento. VINCULANTE: tiene un solo dueño en el Bloque 3 (B3-T10d), con recuadros en este orden: WhatsApp, correo, vencimiento, recordatorio.
  **Aplica:** T16.

## Huecos y su resolución

- **Hueco 0.** Verificación de las 5 afirmaciones más riesgosas (Mirror b7841a5 y worktree del Bloque 1 5ac66db). (1) Chatwoot. CONFIRMADO: no hay envío proactivo. chat.py solo tiene _send_to_chatwoot (escribe en una conversación que ya existe), el webhook /chat/webhook/chatwoot (sin autenticación) y /sync-chatwoot. trae una URL de Chatwoot por defecto, y backend/.env no tiene CHATWOOT_*, SMTP_* ni FRONTEND_URL. NO VERIFICABLE desde el código: can_reply, template_params con processed_params plano, contacts/search, contact_inboxes y status/external_error, que dependen de la versión de Chatwoot. Además hay un segundo canal: whatsapp_webhook.py (Meta Cloud API en modo sombra, WHATSAPP_SHADOW_MODE en .env.production). Si el webhook de Meta del número apunta al ERP y no a Chatwoot, can_reply sale siempre falso. Resolución: «Probar conexión» lee también GET {base}/api (versión), la bandeja (channel_type y message_templates con su estado), y antes de encender se hace un envío controlado a un número propio. (2) IVA. CONFIRMADO: Product no tiene impuesto; products.tax_rate solo existe por migrate_erp_v2.py (no está en el modelo ni en alembic); ProductBase descarta el tax_rate que manda el formulario; SaleOrder.tax_cop y SaleOrderLineErp.tax_pct existen; convertir_cotizacion_a_venta pone tax_pct=0; so.productos copia cot.productos. DESMENTIDO: «Pydantic da 422» (C8). (3) Arranque. CONFIRMADO: el Dockerfile corre 1 worker; launch_production.py usa WORKERS=2; main.py solo tiene @app.on_event startup_preflight; conftest usa with TestClient (dispara el startup) y el runner usa TestClient sin with e importa pytest; pool 10+20 y statement_timeout de 15 s. AGREGADO: database.py hace load_dotenv() al importar, así que la variable de TAREAS puesta en backend/.env encendería el bucle en desarrollo contra erp_test (la guarda de pytest no cubre uvicorn --reload). (4) Rutas públicas y tokens. CONFIRMADO: el router público va sin autenticación; no hay middleware ni proxy de Next (rutas fuera de /dashboard son públicas); la tabla de tokens no tiene CHECK de tipo ni columna resultado; create y revoke hacen commit propio (el parámetro commit de H29 todavía no está en el worktree); no se filtra por tipo (C11); confirmar no revoca los otros enlaces; la página usa apiFetch (manda el token del personal y redirige a /login en un 401) y lang='en'. (5) admin_config. CONFIRMADO: value es VARCHAR sin límite; get_config es solo para ADMIN y devuelve todas las claves; update_config no valida nada. DESMENTIDO además: _now_bogota no está en erp_ventas.py; U17 justifica el −5 fijo por tzdata, pero erp_ventas_fase4 ya usa ZoneInfo('America/Bogota') al importar; U22-anticipo dice que test_anticipo_modalidad pasa completa, pero se rompe una prueba; U16-envio dice que de H27 cambian las pruebas 1 y 3, y la 7 también usa WhatsApp.
  **Resolución:** T8: «Probar conexión» lee también GET {base}/api (versión) y la bandeja (channel_type y message_templates con su estado). T20: primer envío controlado a un número propio, solo con la configuración del usuario. T10 con R14: la revisión automática exige NEBULAE_ENV=production. Los desmentidos ya están resueltos por C6 (fechas), C8/R12 (422 a mano) y las pruebas que se rompen [1] y [2].
- **Hueco 1.** FRONTEND_URL: los enlaces usan os.environ.get('FRONTEND_URL', 'http://localhost:5100') y .env.production no la define. Si falta en el servidor real, los WhatsApp y correos automáticos llevarían enlaces a localhost. Resolución (B3-T0): con NEBULAE_ENV=production, enlace_publico registra un error y el preflight avisa si FRONTEND_URL falta o apunta a localhost.
  **Resolución:** T1 (R19): enlace_publico registra el error en producción y preflight.py advierte al arrancar. «Para el usuario»: poner FRONTEND_URL en el servidor de producción.
- **Hueco 2.** El enlace del PVEN no se revoca al cancelar el pedido: U23 solo revisa CANCELADO en cada vista, y get_pedido seguiría diciendo 'vigente'. Resolución (B3-T3): revoke_pending_tokens(db, 'PVEN', id, commit=False) en update_pedido CANCELADO (N2/H46) y en cancel_sale_order (fase4).
  **Resolución:** T5: revoke_pending_tokens(db, 'PVEN', id, commit=False) en update_pedido al pasar a CANCELADO y en cancel_sale_order (erp_ventas_fase4), con prueba en test_pedido_enlace_cliente.py.
- **Hueco 3.** Documento del PVEN con líneas canceladas o re-cotizado: so.productos (JSON) y SaleOrderLineErp divergen, porque cancelar una línea cambia los totales pero no el JSON, y la propagación de la re-cotización cambia el JSON pero no las líneas (hueco a de IVA). Resolución para U23: las líneas salen del JSON y los totales siempre de la cabecera del pedido. Si hay cantidades canceladas, va la nota «Se cancelaron productos; los totales ya lo reflejan» y la fila 'Ajuste por redondeo' si no cuadra. Sincronizar las líneas al re-cotizar queda como tarea aparte.
  **Resolución:** T5: documento_pven toma las líneas del JSON y los totales de la cabecera; con cantidades canceladas agrega la nota «Se cancelaron productos; los totales ya lo reflejan» y la fila «Ajuste por redondeo» si no cuadra. Sincronizar SaleOrderLineErp al re-cotizar queda fuera de alcance (hueco 8a).
- **Hueco 4.** La aprobación de las plantillas de Meta tarda. Mientras tanto, el WhatsApp automático solo llega a quien escribió en las últimas 24 h, y el recordatorio de los 2 días casi siempre cae fuera de esa ventana: saldrá solo por correo, y sin SMTP no saldrá. Configuración debe decir cuál de las dos falta. Va en notaras.
  **Resolución:** T16: ConfigEnvioWhatsApp dice cuál falta (conexión del servidor, bandeja, plantilla de envío, plantilla de recordatorio) y la sección «Seguimiento de confirmación» muestra el aviso «sin medios» nombrando el medio que falta. También en «Para el usuario».
- **Hueco 5.** TAREAS sin U16-seguimiento no hace nada visible: se aprueban e implementan juntos. Si el usuario rechaza el seguimiento, TAREAS no se hace.
  **Resolución:** TAREAS y U16-seguimiento se aprobaron los dos («Bien»): se implementan en tareas seguidas, T10 (revisión automática; su registro arranca vacío) y T11 (recordatorio, que registra su tarea), más T13 (librerías) y T16 (Configuración).
- **Hueco 6.** Decisiones del usuario cubiertas. pagina_cliente: PLANTILLA + U17 + U22 (logo y nombre, total por línea, forma de pago con anticipo, notas según la pregunta fusionada). pedir_cambios: SC y COT (C9); el PVEN es de consulta y muestra el contacto en lugar del botón. IVA por producto: IVA-PRODUCTO + IVA. correo_respaldo: se mantiene en el envío, el reenvío, el PVEN y el recordatorio. WhatsApp por Chatwoot: U16-envio, con los avisos del punto 1. seguimiento a 2 días: U16-seguimiento + TAREAS, con C14 para la COT. «Pendiente por confirmación» al enviar: estado_si_whatsapp_falla r=0 lo respeta.
  **Resolución:** Informativo: pagina_cliente → T2, T5, T12, T15; pedir_cambios → T6, T12, T15, T17, T18; IVA por producto → T3, T4, T13, T14, T17, T19; correo de respaldo → T2, T7, T8, T9, T11; WhatsApp por Chatwoot → T8, T16; seguimiento a 2 días → T10, T11, T16; «Pendiente por confirmación» al enviar → R8.
- **Hueco 7.** Revisión de seguridad dedicada (B3-T12): POST público que escribe (pedir-cambios); datos sin login (/publico/empresa, el logo, /pedido-cliente/ver reutilizable 30 días); Ronda 7 relajada para SC y COT; tipos de token; no-referrer y noindex; html.escape y asunto sin saltos de línea; el enlace con token se guarda en Chatwoot y Meta (en el ERP no); el token de Chatwoot solo en variables del servidor, nunca en logs; logo sin SVG, con nosniff y CSP; el comentario del cliente es dato y no instrucción (también para la IA del Bloque 5); no hay límite de intentos (aceptable con tokens de 256 bits; un límite en el proxy queda como tarea aparte).
  **Resolución:** T20: revisión de seguridad dedicada que usa esta lista como checklist, junto con las notas de seguridad de los diseños.
- **Hueco 8.** Fuera de alcance, como tareas aparte: (a) sincronizar SaleOrderLineErp al propagar la re-cotización; (b) /finance/dashboard ignora los descuentos; (c) store/contacto muestra contactos fijos y podría leer /publico/empresa; (d) integraciones muestra WhatsApp 'healthy' sin consultar nada; (e) el webhook de Chatwoot sin autenticación (RF-07) no debe reactivarse para estados de entrega; (f) unificar la URL por defecto de chat.py con core/chatwoot.py; (g) la columna huérfana products.tax_rate; (h) los festivos en el horario de los recordatorios.
  **Resolución:** Fuera de alcance (sección «Fuera de alcance»); se anotan en el ledger como tareas aparte.

## Pruebas existentes que se rompen y cómo se ajustan

- **[0]** test_confirmacion_cotizacion.py::test_enviar_confirmacion_requiere_borrador_o_enviada (l.50-60): con el reenvío (C13), PENDIENTE_CONFIRMACION responde 200. En B3-T4 se quita del bucle y se agrega test_reenviar_cotizacion_pendiente_revoca_el_enlace_anterior.
  **Cómo se ajusta:** T7: se quita PENDIENTE_CONFIRMACION del bucle que espera 400 y se agrega test_reenviar_cotizacion_pendiente_revoca_el_enlace_anterior en test_reenvio_cotizacion.py. Se ajusta una sola vez (C13).
- **[1]** test_anticipo_modalidad.py::test_anticipo_manual_no_invalida_la_confirmacion (l.393-401): con U22-anticipo, ajustar a mano el anticipo de una COT CONFIRMADA responde 409 ANULA_CONFIRMACION. U22-anticipo no la menciona. En B3-T4: afirmar 409 sin cambios y agregar el caso con anular_confirmacion y motivo → BORRADOR.
  **Cómo se ajusta:** T7: la prueba pasa a afirmar 409 ANULA_CONFIRMACION sin cambios, y se agrega el caso con anular_confirmacion=True y motivo_recotizacion → BORRADOR.
- **[2]** test_envio_confirmacion_canal_y_correo.py (Bloque 1 T8, H27): las pruebas 1, 3 y 7 mandan canal WhatsApp sin teléfono, así que el 400 nuevo de U16-envio las tumba (el diseño solo nombra la 1 y la 3). La 1 cambia su lista de etiquetas a la de C16. Ajuste en B3-T5 y cierre en B3-T6.
  **Cómo se ajusta:** T8: las pruebas 1, 3 y 7 reciben customer_phone='3001234567'; la 1 afirma ['Canal de envío','WhatsApp','Mensaje','Correo de respaldo'] (automático apagado: renglón de envío manual). T11 la cierra agregando 'Recordatorio automático' al final (C16).
- **[3]** test_recotizar_confirmada.py (B2-T3, H40): si afirma la lista exacta de 'cambios', ahora también aparecen 'Anticipo' (U22-anticipo) e 'IVA'.
  **Cómo se ajusta:** T4 agrega 'IVA' y T7 agrega 'Anticipo' a la lista exacta de cambios, si test_recotizar_confirmada.py la afirma completa.
- **[4]** Pruebas nuevas de los diseños que fallan por otro diseño: U22-cambios prueba 4 (texto genérico, C10); U22-cambios pruebas 2 y 3 e IVA-PRODUCTO prueba 3 (422 vía Pydantic, C8); H28-cambios prueba 7 (el token de COT ahora sí se procesa, C9); U16-seguimiento prueba 1 (etiquetas, C16); U22-validez prueba 8 y U16-reenvio-cot (la misma prueba ajustada dos veces, C13); pruebas del MARCA de pagina-publica-sc (se descartan, C1).
  **Cómo se ajusta:** Cada prueba nueva se escribe ya ajustada por su choque: la 4 de U22-cambios afirma detail['estado_enlace'] y no el texto (C10, T6); la 5 de U22-validez afirma detail['estado_enlace'] == 'vencido' y no el texto genérico (C10, T7); la 2 y la 3 de U22-cambios y la 3 de IVA-PRODUCTO esperan el 422 escrito a mano con su mensaje en español (C8, R12); la 7 de H28-cambios se reemplaza (con C9 el token de COT sí se procesa en su rama): un token PVEN da 400 sin gastarse; la 1 de U16-seguimiento usa las etiquetas de C16; la 8 de U22-validez y la de U16-reenvio-cot ajustan la misma prueba una sola vez (T7); las de U17+H28, U22+H38 y U23 usan los nombres del contrato (R24); las pruebas del MARCA de pagina-publica-sc no se escriben (C1).
- **[5]** Regresión obligatoria con el runner (en principio no se rompen): test_confirmacion_solicitud y test_confirmacion_cotizacion (no afirman el texto del detail; verificado), test_erp_ventas_config_sql_safety, test_chat_chatwoot_token, test_fase4_hardening (pedido canónico 90000/17100/107100), test_fase4_final_hardening, test_products_quick_create, test_anticipo_por_linea, test_anticipo_verificado, test_pesos_enteros y test_cotizar_sin_confirmacion. En el frontend: test_aviso_correo.mjs (tercer parámetro opcional) y la prueba guardián test_sin_dialogos_nativos.mjs sobre los archivos nuevos.
  **Cómo se ajusta:** Regresión obligatoria con el runner en las tareas que tocan cada área (Global Constraints y «Regresión» de cada tarea); en frontend, test_aviso_correo.mjs (el tercer parámetro es opcional) y la prueba guardián test_sin_dialogos_nativos.mjs, que debe cubrir los archivos nuevos.

## Para el usuario (fuera del código; sin credenciales en el chat)

- Configuración General › Información de la empresa: nombre comercial, razón social, NIT, dirección, ciudad, teléfono, WhatsApp (el número conectado a Chatwoot), correo, página web y el logo (PNG, JPG o WebP de máximo 300 KB).
- Diseño de documentos: términos de la cotización y del pedido, datos para pagar (banco, tipo y número de cuenta, titular, Nequi) si decides mostrarlos, mensaje de pie y, si quieres, los colores.
- La tarifa de IVA de cada producto del catálogo (19%, 5%, Exento o Excluido), revisada con tu contador, y la tarifa por defecto en la Configuración del Hub de Ventas.
- En la Configuración del Hub: los días de validez de la cotización (5 por defecto) y los recordatorios (días, cuántos y horario).
- Correo del sistema, en las variables del servidor de producción (EasyPanel): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD (contraseña de aplicación) y SMTP_FROM. Mejor un correo del dominio de la empresa, para no caer en spam.
- Confirmar que FRONTEND_URL está puesta en el servidor de producción con la dirección real del sistema; si falta, los enlaces al cliente apuntan a localhost.
- Conexión con Chatwoot en el servidor (EasyPanel): CHATWOOT_BASE_URL, CHATWOOT_ACCOUNT_ID y CHATWOOT_API_TOKEN, el token de un usuario con acceso a la bandeja de WhatsApp. Nunca se escriben en pantalla ni en el chat.
- En la Configuración del Hub: el número de la bandeja de WhatsApp en Chatwoot, el botón «Probar conexión» y el interruptor de envío automático.
- En Meta (WhatsApp Manager): crear y lograr que aprueben dos plantillas de categoría Utilidad en español, una para enviar el documento y otra para el recordatorio, copiando el texto que da la pantalla, y escribir sus nombres en Configuración. Tener un método de pago activo, porque Meta cobra las plantillas enviadas fuera de las 24 horas.
- Confirmar con quien administra Chatwoot y Meta que los mensajes del número llegan a Chatwoot (no solo al webhook de prueba del ERP) y qué versión de Chatwoot usan.
- Hacer una primera prueba con un WhatsApp propio antes de encenderlo para los clientes.
- Quien administra el servidor: poner NEBULAE_TAREAS_AUTOMATICAS=1 solo en el servidor de producción real, en uno solo y nunca en el de pruebas.
- Corregir los teléfonos de clientes que no sirven para WhatsApp; se mostrará la lista de producción.
- Dar el OK para las consultas de solo lectura en producción (claves de empresa, productos con «Impuesto %», cotizaciones con centavos) y para cualquier corrección que salga de ahí.
- Dar el OK (una vez, cuando T0 lo pregunte) para instalar reportlab desde PyPI en el entorno de Python compartido del backend; lo necesita el PDF adjunto (R2, T9). Sin el OK, el correo sale sin PDF.
- Dar el OK (una vez, en T0) para que la página pública del enlace (app/confirmar/[token]/page.tsx) y la página de Configuración General (admin/configuracion/page.tsx) cambien más del 30% de sus líneas, como piden los diseños aprobados (R15).
- Mirar la página de revisión visual de T20 y anotar lo que no te guste.
- Decidir cómo se corren las consultas de solo lectura en producción de T21 (las credenciales de producción no pasan por los implementadores) y dar el OK, por ambiente, a la única corrección propuesta: copiar la casilla vieja «Impuesto %» (19 o 5) a la tarifa de IVA nueva de cada producto.
- Además de NEBULAE_TAREAS_AUTOMATICAS=1, el servidor de producción debe tener NEBULAE_ENV=production (ya lo exige el preflight); sin las dos, la revisión automática no arranca (R14).
- Dar permiso para integrar las ramas apiladas a main cuando terminen los bloques.

Mientras falte algo de esta lista, el sistema funciona y dice qué falta: sin Chatwoot o sin plantilla, el asesor manda el WhatsApp con el botón; sin SMTP, el correo se omite y la Actividad lo anota; sin la revisión automática, Configuración avisa que los recordatorios no salen.

## Fuera de alcance

- Sincronizar las líneas SaleOrderLineErp al propagar una re-cotización al pedido (hueco 8a).
- /finance/dashboard ignora los descuentos (hueco 8b).
- store/contacto podría leer /publico/empresa en vez de contactos fijos (hueco 8c).
- integraciones muestra WhatsApp «healthy» sin consultar nada (hueco 8d).
- Webhook /chat/webhook/chatwoot sin autenticación (RF-07): no se reactiva para estados de entrega; la entrega se consulta por API (hueco 8e).
- Unificar la URL por defecto de chat.py con core/chatwoot.py (hueco 8f).
- La columna huérfana products.tax_rate: no se borra (hueco 8g, R11).
- Festivos de Colombia en el horario de los recordatorios (hueco 8h).
- PDF por WhatsApp y la plantilla de Meta con documento (opción 2 de pdf_servidor).
- Envío automático de la confirmación del pedido al crearlo (opción 1 de envio_pedido).
- Las variantes de IVA no elegidas ((a) a (d) del ítem IVA) y la factura electrónica DIAN.
- Límite de intentos en las rutas públicas (un límite en el proxy de EasyPanel queda como tarea aparte).
- Que un mensaje entrante del cliente por WhatsApp corra el recordatorio, y marcar «el cliente abrió el enlace».
- Programar recordatorios para lo que hoy ya espera confirmación (relleno): no se hace; basta con reenviar.
- El chip «Sin respuesta al recordatorio» en tablas y Hub: lo pinta el Bloque 4 con seguimiento_estado.
- El menú «Administrador» visible para todos los roles en el Sidebar, y restringir update_product a ADMIN/FINANZAS.
- Unificar el IVA del e-commerce (product_web_listings.impuesto_pct) con products.tarifa_iva.

## Orden de implementación

| Tarea | Cruce | Título | Ítems | Depende de |
|---|---|---|---|---|
| T0 | — (preparación) | Preparar el worktree del bloque | — | Bloque 2 terminado en la rama ventas-bloque2-pantallas-sc-cot (su revisión final aprobada). |
| T1 | B3-T0 | Base de enlaces por tipo, fechas de Colombia y teléfonos (backend) | U17-H28, U22-H38, U22-validez, U22-anticipo, U23, U16-envio, U16-seguimiento | T0. Bloque 1 completo (B1-T6: revoke con commit) y B2 Task 2/B2 Task 3. |
| T2 | B3-T1 | Datos de la empresa, contrato del documento y correos con la marca (backend) | MARCA, PLANTILLA | T1. B1-T7 (N8) y B1-T8 (H27+H39). |
| T3 | B3-T2 (primera parte: IVA-PRODUCTO) | Tarifa de IVA en el producto: catálogo, búsqueda, alta rápida y tarifa por defecto (backend) | IVA-PRODUCTO | T2. B2 Task 5 (crm.py: quick_create_product con código único). |
| T4 | B3-T2 (segunda parte: IVA) | IVA en la cotización, el pedido y la orden de pago (backend) | IVA | T3. B2 Task 4 (U19, H40) y B2 Task 5 (cambios_documento.py). |
| T5 | B3-T3 (primera parte: páginas públicas) | Páginas públicas: estado del enlace, documento del cliente y enlace de consulta del pedido (backend) | U17-H28, U22-H38, U22-validez, U23, IVA | T1, T2 y T4. B2 Task 2 (U15) y B2 Task 3 (rama SC de U11 en confirmar_via_token). |
| T6 | B3-T3 (segunda parte: pedir cambios) | «Pedir cambios» desde el enlace del cliente para la solicitud y la cotización (backend) | H28-cambios, U22-cambios | T5. B1-T4 (_documentos_activos_de_solicitud) y B1-T8 (_enviar_correo_confirmacion). B2 Task 2 (U15) y B2 Task 3 (U11). |
| T7 | B3-T4 | Validez y reenvío de la cotización, anticipo congelado y envío del pedido al cliente (backend) | U22-validez, U16-reenvio-cot, U22-anticipo, U23 | T6, T5 y T4. B2 Task 4 (H40). |
| T8 | B3-T5 (U16-envio y U16-entrega) | WhatsApp automático por Chatwoot y estado de entrega (backend) | U16-envio, U16-entrega, U23 | T7 y T2. |
| T9 | B3-T5 (PDF) | PDF de la cotización y del pedido adjunto al correo (backend) | PDF, U23 | T7, T5 y T2; va después de T8 (orden de los dueños de erp_ventas.py). |
| T10 | B3-T6 (TAREAS) | Revisión automática cada 10 minutos (backend) | TAREAS | T8 (orden de los dueños de main.py y erp_ventas.py) y T2. |
| T11 | B3-T6 (U16-seguimiento) | Recordatorio automático al cliente a los 2 días (backend) | U16-seguimiento | T10, T8 y T7. B2 Task 4 (chatter y _agregar_nota). |
| T12 | B3-T7 (primera parte: documento) | Frontend base del documento del cliente: librerías, componentes y pruebas | MARCA, PLANTILLA, U17-H28, H28-cambios, U22-H38, U22-cambios, U23 | T0. B2 Task 1 y B2 Task 6; B1-T9 (lib/whatsapp.js). No usa nada del backend del bloque: trabaja con las formas de datos de C2 y R24 (las pruebas usan objetos de ejemplo). Corre en su turno del plan (después de T11), sola: todas las tareas comparten el worktree y el índice de git (R16). |
| T13 | B3-T7 (segunda parte: IVA, envío y recordatorios) | Frontend base de IVA, WhatsApp, recordatorios y revisión automática: librerías y pruebas | U16-envio, U16-entrega, TAREAS, U16-seguimiento, IVA-PRODUCTO, IVA | T12 (fechas-colombia.js). Las formas de datos de T3, T4, T8, T10 y T11 salen de sus diseños (las pruebas usan objetos de ejemplo). |
| T14 | B3-T8 | Configuración General (empresa y diseño de documentos) y tarifa de IVA en el catálogo (frontend) | MARCA, PLANTILLA, IVA-PRODUCTO | T2, T3, T12 y T13. |
| T15 | B3-T9 | Páginas públicas del cliente para solicitud, cotización y pedido (frontend) | PLANTILLA, U17-H28, H28-cambios, U22-H38, U22-cambios, U22-validez, U23 | T5, T6, T7 y T12. |
| T16 | B3-T10d | Ventana del enlace, recordatorios y Configuración del Hub (frontend) | U16-envio, U16-entrega, U16-seguimiento, TAREAS, U22-validez, U23, U17-H28, IVA-PRODUCTO | T3, T7, T8, T10, T11, T12 y T13. Va antes de T17, T18 y T19 (R16). |
| T17 | B3-T10a | Cotización: calculadora con IVA, cambios del cliente, validez y reenvío (frontend) | IVA, U22-H38, U22-cambios, U22-validez, U16-reenvio-cot, U22-anticipo, U16-envio, U16-entrega, U16-seguimiento, H28-cambios | T3 a T13 y T16. |
| T18 | B3-T10b | Solicitud: cambios del cliente, nota para el cliente, envío y recordatorios (frontend) | H28-cambios, U17-H28, U22-anticipo, U16-envio, U16-entrega, U16-seguimiento | T5 a T13, T16 y T17 (ChannelModal con envioWhatsApp vive en cotizacion-client.tsx). |
| T19 | B3-T10c | Pedido de venta: enviar la confirmación al cliente y ver el IVA (frontend) | U23, IVA, U16-envio, U16-entrega | T4, T7, T8, T12, T13, T16 y T17 (ChannelModal con envioWhatsApp). |
| T20 | B3-T12 | Revisión de seguridad y verificación final | — | T1 a T19. |
| T21 | B3-T11 | Datos existentes (solo lectura y OK del usuario) | MARCA, IVA-PRODUCTO, IVA, U22-H38, U22-anticipo, U23, U16-envio, U16-seguimiento | T3, T11 y T20; B1-T14 y B2 Task 12 ya aplicados en la base que se revise. |

## Diseño por ítem

### MARCA — Datos de tu empresa para los documentos

**Grupo:** Tu empresa y el formato de los documentos · **Esfuerzo:** M · **Tareas del plan:** T2, T12, T14, T21

**Para el usuario:** Un solo lugar, guardado de verdad, para los datos y el logo de tu empresa. De ahí los toman todas las páginas y los correos que recibe el cliente.

**Lo que vio y aprobó el usuario:** En Configuración General, la pestaña «Información de la empresa» por fin guarda lo que escribes: nombre de la empresa, razón social, NIT, dirección, ciudad, teléfono, WhatsApp, correo, página web y logo. El cliente ve esos datos en la solicitud, la cotización, el pedido y los correos, donde hoy aparece «Nebulae». Se quitan los datos de ejemplo que traía la pantalla («Nebulae Corp S.A.S», «Av Siempre Viva 123»). Solo un administrador puede cambiarlos; los asesores los ven sin poder editarlos. Cada cambio queda anotado con quién lo hizo y qué cambió, así nadie puede modificar en silencio, por ejemplo, los datos para pagar. Tendrás que cargar tú: el logo (PNG o JPG de máximo 300 KB, mejor con fondo transparente), el nombre comercial, la razón social, el NIT, la dirección, los teléfonos, el correo y la página web.

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- Sin preguntas.

**Cambios (diseño):**

```text
BACKEND
1) NUEVO backend/app/core/empresa.py (sin FastAPI). Lo usan api/v1/empresa.py, erp_ventas.py, core/documento_publico.py y core/correo_documento.py.
   - CAMPOS es un dict ordenado: campo_api → (clave en admin_config, etiqueta, max_len, validador, por_defecto).
     · Identidad: nombre_comercial ('empresa_nombre_comercial', 'Nombre comercial', 120), razon_social (160), nit (30, _validar_nit ^[0-9][0-9.\- ]{4,29}$), direccion (200), ciudad (80), telefono y whatsapp (40, _validar_telefono: entre 7 y 15 dígitos; se admiten + ( ) - y espacios), correo (150, _validar_correo), sitio_web (200, _validar_url: urlparse con scheme en {http, https}, netloc no vacío y sin espacios).
     · Documentos: color_principal ('documentos_color_principal', '#7C3AED'), color_secundario ('#E11D48'), color_acento ('#C2410C'). Validador _validar_hex ^#[0-9A-Fa-f]{6}$; se guardan en mayúsculas. Además terminos_cotizacion (2000), terminos_pedido (2000), instrucciones_pago (1000) y mensaje_pie (200).
   - CAMPOS_PUBLICOS = identidad + colores. No incluye términos ni instrucciones_pago.
   - Constantes: CLAVE_LOGO='empresa_logo' (data URL), CLAVE_LOGO_VERSION='empresa_logo_version', PREFIJOS_RESERVADOS=('empresa_','documentos_'), LOGO_MAX_BYTES=300*1024. TIPOS_LOGO = firmas: PNG \x89PNG\r\n\x1a\n, JPEG \xff\xd8\xff, WebP 'RIFF' en [0:4] y 'WEBP' en [8:12].
   - _leer_claves(db, claves): un solo SELECT key, value FROM admin_config WHERE key = ANY(:claves), con text() parametrizado como _get_alert_days.
   - leer_perfil(db): {campo: valor, o su por_defecto, o ''} + logo_version + configurada (= bool(nombre_comercial)). Nunca incluye el data URL del logo.
   - perfil_publico(db): solo CAMPOS_PUBLICOS, con los colores agrupados en {principal, secundario, acento}, más logo_url (f'/publico/empresa/logo?v={version}' o None) y configurada.
   - textos_documento(db, tipo):
     · SC: {terminos: None, instrucciones_pago: None, mensaje_pie}.
     · COT: terminos_cotizacion + instrucciones_pago (según la pregunta datos_pago de PLANTILLA).
     · PVEN: terminos_pedido + instrucciones_pago.
     · Un texto vacío se devuelve como None.
   - empresa_para_mensajes(db) → {nombre, telefono, whatsapp, correo}, para los textos de WhatsApp de U16-envio.
   - validar_cambios(body) → {campo: valor} normalizado con strip. Un '' vale como 'borrar'. Valida TODO antes de escribir y lanza ValueError con el mensaje exacto. Un campo desconocido o 'logo' también dan ValueError.
   - guardar_cambios(db, cambios, user_name) → [{etiqueta, antes, despues}]:
     · Compara contra leer_perfil y escribe solo lo que cambió: upsert con el mismo SQL ON CONFLICT de update_config; '' hace DELETE de la clave, para volver al valor por defecto.
     · Agrega un ActivityLog(entity_type='EMPRESA', entity_id=0, entity_numero='EMPRESA', action='UPDATED', description='Datos de la empresa actualizados: <etiquetas>', user_name, extra_data={'cambios': [...]}), con los textos recortados a 200 caracteres.
     · Un solo db.commit(). Si no hubo cambios, no escribe nada.
   - validar_logo(data_url) → (mime, bytes):
     · Exige el formato 'data:<mime>;base64,<b64>' y que el mime esté en TIPOS_LOGO (SVG y cualquier otro → ValueError).
     · Decodifica con base64.b64decode(validate=True), exige len ≤ LOGO_MAX_BYTES y que la firma de los bytes coincida con el mime.
   - guardar_logo(db, data_url, user_name) y quitar_logo(db, user_name):
     · Upsert o DELETE de las dos claves; version = sha256(bytes)[:12].
     · ActivityLog 'Logo actualizado' / 'Logo quitado'. extra_data guarda solo la versión, nunca el contenido.
   - leer_logo(db) → (mime, bytes, version) | None.
   - limpiar_linea(texto): quita \r y \n (para el asunto de los correos).
2) NUEVO backend/app/api/v1/empresa.py:
   - router (/api/v1/empresa):
     · GET '' con require_roles(*ALL_ERP_ROLES) → leer_perfil | {'puede_editar': normalize_role(user.role)=='ADMIN'}.
     · PUT '' (ROLE_ADMIN), body dict → validar_cambios; un ValueError se convierte en HTTPException(422, str(e)). Luego guardar_cambios(db, c, user.email). Responde leer_perfil + cambios.
     · PUT '/logo' (ROLE_ADMIN), body {'logo': data_url} → validar_logo/guardar_logo.
     · DELETE '/logo' (ROLE_ADMIN) → quitar_logo.
     · GET '/historial' (ROLE_ADMIN) → los últimos 30 ActivityLog EMPRESA, con created_at+'Z'.
   - router_publico (/api/v1/publico, SIN autenticación, comentado como en confirmacion_publica):
     · GET '/empresa' → JSONResponse({status, data: perfil_publico}) con Cache-Control 'public, max-age=60'.
     · GET '/empresa/logo?v=' → 404 'La empresa no tiene logo.' si no hay. Si hay, Response(bytes, media_type=mime) con:
       - Cache-Control 'public, max-age=31536000, immutable' si v == version; si no, 'public, max-age=60'.
       - ETag con la versión.
       - X-Content-Type-Options 'nosniff'.
       - Content-Security-Policy "default-src 'none'".
3) backend/main.py: importar empresa y montar los dos routers con prefijos '/api/v1/empresa' y '/api/v1/publico', este último con el comentario «Sin autenticacion -- publico por diseno».
4) backend/app/api/v1/erp_ventas.py, encima de N8 del Bloque 1:
   - get_config: después de la lista blanca de N8, se quitan las claves que empiecen por PREFIJOS_RESERVADOS. El logo pesa ~400 KB y el Hub pide /ventas/config varias veces (H16).
   - update_config: ANTES del loop, si alguna clave empieza por PREFIJOS_RESERVADOS → HTTPException(422, 'Los datos de la empresa y de los documentos se cambian en Configuración General.') sin escribir nada. Así no hay forma de saltarse la validación.
FRONTEND
5) NUEVO frontend/src/lib/marca-empresa.js (JS puro):
   - COLORES_POR_DEFECTO y MARCA_VACIA.
   - normalizarMarca(raw): acepta {status, data} o el dict directo, rellena lo que falte y cambia un color inválido por el de defecto.
   - cargarMarcaEmpresa(apiUrl, fetchImpl=fetch): fetch a `${apiUrl}/publico/empresa` SIN Authorization y SIN credentials. Ante cualquier error devuelve MARCA_VACIA; nunca lanza.
   - urlLogo(marca, apiUrl).
   - validarCampoEmpresa(campo, valor): espejo de los validadores del backend, con los mismos textos.
   - cambiosDelFormulario(original, actual): solo los campos cambiados, comparados con trim.
   - validarArchivoLogo({type, size}).
6) frontend/src/app/dashboard/admin/configuracion/page.tsx:
   - Pestañas renombradas: 'Información de la empresa' y 'Diseño de documentos'.
   - La pestaña 'empresa' renderiza <FormEmpresa/> (NUEVO configuracion/empresa-form.tsx). Se borran los defaultValue de ejemplo.
   - FormEmpresa:
     · Carga GET /empresa con apiFetch.
     · Campos con label y placeholder: Nombre comercial (obligatorio para que salga en los documentos), Razón social, NIT, Dirección, Ciudad, Teléfono, WhatsApp, Correo y Página web.
     · Error en línea al salir de cada campo (validarCampoEmpresa). 'Guardar' se habilita solo si hay cambios.
     · PUT /empresa con cambiosDelFormulario. Si sale bien, avisar('Datos de la empresa guardados', {tono:'ok'}) con useAvisos de H49. Si el servidor da error, el mensaje se ve en el formulario sin perder lo escrito.
   - Logo:
     · El recuadro 'Subir Logo' pasa a ser un <label> con <input type=file accept='image/png,image/jpeg,image/webp'> oculto (sr-only).
     · validarArchivoLogo; FileReader.readAsDataURL → PUT /empresa/logo; vista previa con urlLogo.
     · 'Quitar logo' pide confirmar() de H49.
   - Sin permiso (puede_editar false): campos disabled y el texto 'Solo un administrador puede cambiar estos datos.'
   - 'Historial de cambios' (GET /empresa/historial): fecha en hora de Colombia, quién y antes → después.
7) frontend/package.json: agregar node tests/test_marca_empresa.mjs al script test (stagear solo lo propio).
```

**Pruebas (diseño):**

```text
BACKEND: NUEVO backend/tests/test_empresa_marca.py. Correrlo SOLO con el runner de ROLLBACK, porque admin_config no se trunca:
cd <worktree del Bloque 3>\backend && C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe tests/rollback_runner.py test_empresa_marca
1) test_admin_guarda_y_lee_los_datos: PUT {nombre_comercial:'DEMO Ferretería', nit:'900.123.456-7', correo:'ventas@example.com', sitio_web:'https://example.com', color_acento:'#ea580c'} → 200. GET /empresa trae los valores y color_acento '#EA580C'.
2) test_publico_solo_expone_la_lista_blanca: después de lo anterior, más instrucciones_pago='Cuenta 123' y un upsert directo de alerta_sc_dias='5'. GET /api/v1/publico/empresa SIN Authorization → 200. set(data.keys()) == las claves públicas exactas; 'instrucciones_pago', 'terminos_cotizacion' y 'alerta_sc_dias' no aparecen; Cache-Control contiene max-age.
3) test_asesor_lee_pero_no_cambia (vendedor_token): GET 200 con puede_editar False; PUT, PUT /logo y DELETE /logo → 403.
4) test_validaciones_no_guardan_nada: sitio_web 'javascript:alert(1)', color 'red;', correo 'x' y campo 'smtp_password', cada uno en su PUT y cada uno junto con un nombre_comercial válido → 422 con el mensaje exacto. GET muestra el valor anterior.
5) test_logo_png_se_sirve_con_cache_y_nosniff: PNG 1x1 en base64 → 200 y logo_url con ?v=. GET /publico/empresa/logo?v=<v> devuelve image/png, los mismos bytes, X-Content-Type-Options nosniff y Cache-Control con immutable.
6) test_logo_rechaza_svg_firma_falsa_y_tamano: data:image/svg+xml → 422; data:image/png con base64 de b'<html>' → 422 'no es una imagen válida'; 301 KB → 422 con 'máximo es 300 KB'.
7) test_quitar_logo: DELETE → logo_url None y GET /publico/empresa/logo → 404.
8) test_config_de_ventas_no_muestra_ni_acepta_claves_de_empresa: después de PUT /empresa, GET /ventas/config (admin) no tiene ninguna clave empresa_* ni documentos_*. PATCH /ventas/config {'empresa_nombre_comercial':'x'} → 422 y el valor no cambia. test_erp_ventas_config_sql_safety.py sigue verde.
9) test_historial_registra_quien_y_que: PUT instrucciones_pago → GET /empresa/historial tiene un renglón con etiqueta 'Datos para pagar', antes '' y despues 'Cuenta 123', y user_name con el correo del admin. Un PUT sin cambios no agrega renglón.
FRONTEND: NUEVO frontend/tests/test_marca_empresa.mjs (node:assert/strict):
- normalizarMarca({}) devuelve los colores por defecto y logo null.
- cargarMarcaEmpresa con un fetch falso: verifica que no manda Authorization; si el fetch falla devuelve MARCA_VACIA y no lanza.
- validarCampoEmpresa da los mismos textos que el backend.
- cambiosDelFormulario.
- validarArchivoLogo: image/svg+xml → mensaje; 400 KB → mensaje.
- urlLogo.
Después npx tsc --noEmit. Manual: como admin, cargar los datos y el logo; como asesor, verlos sin poder editar.
```

**Comportamiento esperado:**

```text
- ADMIN guarda. Los demás roles del ERP leen GET /empresa con puede_editar=false. PUT/DELETE desde otro rol → 403.
- Mensajes 422 exactos:
  · 'Campo desconocido: {campo}.'
  · '{Etiqueta}: máximo {n} caracteres.'
  · 'NIT no válido: usa solo números, puntos y guion (por ejemplo 900.123.456-7).'
  · 'Teléfono no válido: escribe entre 7 y 15 dígitos.' (para WhatsApp: 'WhatsApp no válido: …')
  · 'Correo de la empresa no válido.'
  · 'La página web debe empezar por http:// o https://.'
  · 'Color no válido: usa el formato #RRGGBB.'
  · Logo: 'El logo debe ser una imagen PNG, JPG o WebP.' / 'El logo pesa {kb} KB; el máximo es 300 KB.' / 'El archivo no es una imagen válida.'
- Si un PUT trae un solo campo inválido, no guarda nada.
- Un campo vacío borra la clave: los colores vuelven a los de las referencias (#7C3AED → #E11D48 para la SC; #C2410C de acento para COT/PVEN).
- GET /publico/empresa: siempre 200 y sin token. Trae solo identidad, contacto, colores, logo_url y configurada; nunca términos, datos para pagar ni otras claves de admin_config. Mientras nada esté configurado, todo llega vacío con configurada=false.
- Logo: PNG, JPG o WebP de hasta 300 KB; SVG rechazado (puede llevar scripts). Se sirve con nosniff y CSP, y la URL lleva ?v=versión para que un cambio se vea al instante.
- /ventas/config deja de mostrar y de aceptar claves empresa_* y documentos_*.
- Cada guardado con cambios deja en la Actividad un renglón EMPRESA con quién lo hizo y antes → después.
```

**Datos existentes:**

```text
Consulta de solo lectura en erp_test (sesión readonly, 2026-10-03):
- admin_config tiene 2 claves, las dos basura de test_erp_ventas_config_sql_safety: «clave_test_o'brien» y «x'); DROP TABLE admin_config; --». Ninguna usa los prefijos empresa_ ni documentos_.
- web_builder_config solo tiene erp_lista_compras y erp_tracking_stages.
- La pestaña «Info de la Empresa» era una maqueta sin llamadas al API: no hay datos guardados que migrar.
- Producción no se consultó. Antes de desplegar, correr de solo lectura: SELECT key FROM admin_config WHERE key LIKE 'empresa\_%' OR key LIKE 'documentos\_%', para descartar choques.
- Borrar las 2 claves basura es opcional y solo con OK; no afecta este diseño.
```

**Riesgos:**

```text
- El logo se guarda como texto base64 en admin_config (~400 KB máximo). Se eligió así porque los contenedores de EasyPanel pierden los archivos del disco al redeplegar. Se excluye de /ventas/config para no inflar el Hub. Si después se suben muchos archivos, conviene un almacén de archivos.
- /publico/empresa es público a propósito. Solo sirve la lista blanca: los datos para pagar y los términos viajan únicamente dentro del documento con token (PLANTILLA).
- Seguridad: se rechaza SVG, sitio_web se limita a http(s) (evita javascript: en un href) y los colores se validan con regex (evita inyección en style).
- update_config gana un 422 para las claves reservadas. Hoy ningún código escribe empresa_* por ahí.
- El menú lateral muestra «Administrador» a todos los roles: la protección real es el 403 del backend.
- Choca con N8 en get_config y update_config: se aplica encima de su lista blanca.
- Sin migración.
```

**Depende de:**

```text
- Bloque 1:
  · N8 (get_config y update_config: el filtro de prefijos va encima de _CONFIG_LECTURA_GENERAL).
  · T0 (rollback_runner con vendedor_token).
  · H5 (lib/whatsapp.js, que usa PLANTILLA).
- Bloque 2: H49+H34 (useAvisos y confirmar en la página de Configuración; nada de alert()).
- Es la base de PLANTILLA, PDF, U17+H28, U22+H38, U23 y U16-envio.
```

**Archivos que nombra el diseño:** `backend/app/core/empresa.py`, `backend/app/api/v1/empresa.py`, `backend/main.py`, `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_empresa_marca.py`, `frontend/src/lib/marca-empresa.js`, `frontend/tests/test_marca_empresa.mjs`, `frontend/src/app/dashboard/admin/configuracion/page.tsx`, `frontend/src/app/dashboard/admin/configuracion/empresa-form.tsx`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R10).


### PLANTILLA — Documento tipo factura para solicitud, cotización y pedido

**Grupo:** Tu empresa y el formato de los documentos · **Esfuerzo:** L · **Tareas del plan:** T2, T12, T14, T15

**Para el usuario:** Una sola plantilla de factura, con tu marca, para todo lo que ve el cliente. Se ve bien en el celular y se puede guardar como PDF desde el navegador. Los correos también llevan tu marca.

**Lo que vio y aprobó el usuario:** Lo que ve el cliente se arma como una factura. La solicitud lleva el encabezado degradado de morado a rojo de tu primera referencia; la cotización y el pedido, la hoja blanca con acento naranja de la segunda.

Orden del documento:
- Arriba, tu logo y el nombre de tu empresa.
- El número, la fecha y el cliente.
- La tabla de productos, con cantidad, descripción, precio y total de cada línea.
- Los totales y la forma de pago con el anticipo.
- Las notas y los términos.
- Abajo, tus datos de contacto.

En el celular la tabla se convierte en tarjetas fáciles de leer y el botón para confirmar queda siempre a la mano. El cliente tiene un botón «Descargar o imprimir» para guardar el documento como PDF, con los colores y sin botones.

En Configuración, la pestaña «Diseño de documentos» te deja cambiar los colores y escribir los términos y condiciones, el mensaje de pie y los datos para pagar; ahí mismo ves cómo queda antes de guardar. Los correos al cliente llevan el nombre y los colores de tu empresa y ya no dicen «Nebulae».

Tendrás que cargar tú los términos de la cotización y del pedido y los datos para pagar (banco, tipo y número de cuenta, titular, Nequi).

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- ¿Mostramos en la cotización y en el pedido los datos para pagar (cuenta bancaria, Nequi…) que cargues en Configuración? Solo los vería quien tenga el enlace del documento. → **Sí, en la cotización y en el pedido (solo los ve quien tenga el enlace): el anticipo se paga antes de crear el pedido** (= recomendada)

**Cambios (diseño):**

```text
BACKEND
1) NUEVO backend/app/core/documento_publico.py. Es el contrato ÚNICO de lo que ve el cliente. U17+H28, U22+H38 y U23 lo llaman desde confirmacion_publica.py en vez de armar cada uno su dict.
   - TITULOS = {SC: 'Solicitud', COT: 'Cotización', PVEN: 'Pedido de venta'}.
   - linea_publica(p, con_precio) → {descripcion, cantidad, precio_unitario (float(redondear_peso) o None), total_linea (float(monto_linea(p)) de U19, o None), iva_pct: None, anticipo: None}. Nunca copia costos, margen, proveedor ni sku.
   - fecha_iso_utc(dt) = isoformat()+'Z' (las fechas guardadas son UTC sin zona). fecha_solo(dt) = date().isoformat(), usada para fecha_entrega_estimada: así no se corre un día.
   - armar_documento(db, tipo, *, numero, fecha_emision, cliente_nombre, lineas, con_precios, direccion_entrega=None, fecha_entrega_estimada=None, totales=None, pago=None, notas=None, atendido_por=None, estado=None) devuelve exactamente estas claves:
     · tipo, titulo, numero, estado, fecha_emision, fecha_entrega_estimada
     · cliente{nombre, direccion_entrega}, atendido_por, con_precios, lineas[]
     · totales{subtotal, descuento_pct, descuento, impuestos[{etiqueta, base, valor}], total} | None
     · pago{modalidad, anticipo_pct, anticipo, pagado, saldo, instrucciones} | None
     · notas, terminos, mensaje_pie
   - terminos, instrucciones y mensaje_pie salen de empresa.textos_documento(db, tipo) y viajan SOLO en la respuesta con token. Montos en pesos enteros.
   - CLAVES_DOCUMENTO (frozenset) para la prueba de contrato. Los totales, el anticipo y el IVA los calcula el grupo dueño de cada página o de IVA; aquí solo se arma el dict.
2) NUEVO backend/app/core/correo_documento.py: correo_documento(perfil_publico, tipo, numero, cliente_nombre, link, resumen=None) → (asunto, html).
   - Asunto: limpiar_linea(f'{titulo} {numero} de {nombre_comercial}'); si no hay nombre, f'Tu {titulo.lower()} {numero}'.
   - HTML de tablas, 600 px, estilos en línea:
     · Franja con el nombre de la empresa: color principal en la SC, acento en COT y PVEN. Texto blanco u oscuro según color_texto_sobre.
     · 'Hola {cliente}', más un texto según el tipo.
     · Botón 'Ver {titulo}' y el link escrito debajo.
     · Pie con teléfono, WhatsApp, correo, dirección y NIT.
   - TODO valor pasa por html.escape(quote=True).
   - Sin <img> del logo: los correos bloquean imágenes y el backend no conoce su URL pública. Se podría agregar con PUBLIC_API_URL.
   - color_texto_sobre(*hex): la misma regla WCAG que el frontend.
3) backend/app/core/email.py: send_email(to, subject, html_body, remitente_nombre=None). Con nombre, el From pasa a ser email.utils.formataddr((remitente_nombre, smtp_from)). Sin nombre, igual que hoy.
4) backend/app/api/v1/erp_ventas.py, en enviar_solicitud_para_confirmacion y enviar_cotizacion_para_confirmacion, después de H27+H39:
   - El asunto y el html de _enviar_correo_confirmacion salen de correo_documento(perfil_publico(db), 'SC'|'COT', numero, customer_name, link).
   - Se pasa remitente_nombre=perfil['nombre_comercial'] or None.
   - Desaparece ' - Nebulae' del asunto.
FRONTEND
5) NUEVO frontend/src/lib/documento-comercial.js (puro):
   - TIPOS_DOCUMENTO: SC → variante 'degradado'; COT y PVEN → 'acento'.
   - normalizarDocumento(raw): completa total_linea si falta, con redondearPeso(precio×cantidad) de pesos.js. Una línea sin descripción queda como 'Producto'.
   - filasTotales(doc), en este orden:
     · Subtotal.
     · 'Descuento (x%)' en negativo, solo si es mayor que 0.
     · Una fila por impuesto.
     · 'Total' destacado.
     · Con pago: 'Anticipo (60%)', 'Pagado' (solo si es mayor que 0) y 'Saldo'.
     · Si con_precios es false, la lista queda vacía.
   - formatoFechaDocumento(isoZ): 'd de mes de aaaa' en America/Bogota. formatoFechaSolo('AAAA-MM-DD') sin zona horaria.
   - colorTextoSobre(...hex): '#FFFFFF' u '#111827', el de mayor contraste mínimo frente a todos los colores dados.
   - enlaceSeguro(url): solo http(s).
   - contactosEmpresa(marca): tel:, waUrl de lib/whatsapp.js (H5), mailto: y web.
   - DOCUMENTO_EJEMPLO_SC y DOCUMENTO_EJEMPLO_COT con datos DEMO.
6) NUEVO frontend/src/components/documento/DocumentoComercial.tsx ('use client'), más EncabezadoMarca e index.ts.
   - Props: documento, marca, apiUrl, variante?, acciones?: ReactNode, sello?: {texto, tono}, aviso?, mostrarDescargar=true, fijarTitulo=false.
   - <article> de hasta 820 px. Los colores entran como variables CSS en style.
   - Variante 'degradado' (ref-sc-factura):
     · Franja con degradado principal→secundario.
     · Izquierda: logo, o monograma con las iniciales, y el nombre.
     · Título grande 'SOLICITUD' y número.
     · Derecha: fecha, 'Para:' con el cliente y la entrega estimada.
     · La tarjeta de la tabla se monta sobre la franja con esquinas redondeadas y filas grises alternas.
   - Variante 'acento' (ref-cot-pven):
     · Hoja blanca con una barra vertical oscura a la izquierda y esquinas en el color de acento.
     · Logo arriba a la izquierda; título en color de acento ('COTIZACIÓN' / 'PEDIDO DE VENTA') y fecha a la derecha.
     · 'Para:' con el cliente y el N.º del documento.
     · Tabla CANT. | DESCRIPCIÓN | PRECIO | TOTAL con líneas finas.
     · Abajo a la izquierda, 'Forma de pago' (modalidad, %, instrucciones con saltos de línea) y 'Términos y condiciones'.
     · Abajo a la derecha, filasTotales y el TOTAL en un bloque del color de acento.
   - En las dos variantes:
     · Anticipo por línea en letra pequeña bajo el precio (U19).
     · Chip 'IVA x%' si viene iva_pct.
     · 'Notas' en un recuadro neutro, sin amarillo (U14), con whitespace-pre-line.
     · Pie con contactosEmpresa (íconos lucide), razón social, NIT, mensaje_pie y 'Atendido por' si viene.
   - Celular (<640 px):
     · Tarjetas por línea: nombre completo, '2 × $342.462' y el total.
     · Acciones fijas abajo (sticky).
     · Nunca se usa truncate: los nombres largos hacen break-words.
   - Impresión:
     · Botón 'Descargar o imprimir' → window.print(), oculto al imprimir (print:hidden). acciones y aviso también print:hidden; el sello sí se imprime.
     · <style> con @page { margin: 12mm } sin tamaño fijo (Carta o A4), print-color-adjust: exact, tr { break-inside: avoid } y thead repetido.
     · Al imprimir siempre sale la tabla.
   - fijarTitulo → document.title = `${titulo} ${numero} · ${nombre}`.
   - Enlaces externos con rel='noopener noreferrer'. Sin dark:. Se usa <img> simple (no next/image).
7) NUEVO frontend/src/app/confirmar/layout.tsx: metadata {title: 'Documento', robots: {index: false, follow: false}, referrer: 'no-referrer'}. El token de la URL ya no se filtra por el Referer al tocar WhatsApp o la página web de la empresa.
8) frontend/src/app/layout.tsx: <html lang='es'> (hoy 'en').
9) configuracion/page.tsx, pestaña 'diseno' (hoy 'en construcción') → NUEVO configuracion/documentos-form.tsx:
   - Colores con input color, hex y 'Volver al color de la referencia'.
   - Términos de la cotización, Términos del pedido, Datos para pagar (según la pregunta) y Mensaje de pie.
   - Guardado igual que en FormEmpresa.
   - Vista previa en vivo con <DocumentoComercial documento={DOCUMENTO_EJEMPLO_SC|COT} marca={valores sin guardar} mostrarDescargar={false}/> y un selector Solicitud/Cotización.
10) frontend/package.json: agregar test_documento_comercial.mjs y test_documento_plantilla_fuente.mjs.
Uso por los otros grupos (no se rediseña aquí):
- confirmar/[token]/page.tsx carga en paralelo /confirmar/ver y cargarMarcaEmpresa, y pinta <DocumentoComercial … acciones={Confirmar / Pedir cambios} sello fijarTitulo/>.
- En error o 'ya confirmada' usa solo <EncabezadoMarca/>, más el contacto.
```

**Pruebas (diseño):**

```text
BACKEND: NUEVO backend/tests/test_documento_publico.py, con el runner de ROLLBACK (mismo comando: rollback_runner.py test_documento_publico).
1) test_contrato_claves_exactas: armar_documento(db, 'COT', …) tiene exactamente las claves de CLAVES_DOCUMENTO, y lo mismo en sus subdicts.
2) test_linea_publica_no_expone_costos: producto con cost_usd, margen_pct, proveedor y sku → solo quedan las 6 claves, y total_linea == monto_linea(p).
3) test_sc_sin_precios: precio_unitario y total_linea en None, y totales None.
4) test_fechas: fecha_emision termina en 'Z' y la entrega queda '2026-10-21'.
5) test_textos_por_tipo: la SC no trae terminos ni instrucciones; la COT trae los suyos (configurados dentro de la transacción).
6) test_correo_documento_escapa_y_limpia: con nombre 'A&B <script>\nX' el html contiene 'A&amp;B &lt;script&gt;' y no '<script>'; el asunto no tiene '\n'; sin nombre el asunto es 'Tu cotización COT-1'.
7) test_envio_cot_usa_la_marca: monkeypatch de app.core.email.send_email (falso que guarda los argumentos) y smtp_configurado→True; NUNCA SMTP real. PUT /empresa nombre 'DEMO Ferretería'; POST enviar-confirmacion → asunto 'Cotización COT-… de DEMO Ferretería', sin 'Nebulae', y remitente_nombre correcto.
8) test_send_email_remitente_con_nombre: monkeypatch.setenv con SMTP_USER/PASSWORD falsos y smtplib.SMTP falso que captura el mensaje → From con formataddr.
Regresión: test_envio_confirmacion_canal_y_correo.py (H27), test_confirmacion_solicitud.py y test_confirmacion_cotizacion.py.
FRONTEND: NUEVO tests/test_documento_comercial.mjs:
- normalizarDocumento.
- filasTotales: descuento 0 oculto, impuestos, anticipo/pagado/saldo.
- formatoFechaDocumento('2026-10-03T03:00:00Z') === '2 de octubre de 2026' y formatoFechaSolo('2026-10-21') === '21 de octubre de 2026'.
- colorTextoSobre: '#C2410C' → '#FFFFFF'; '#FDE68A' → '#111827'; ('#7C3AED', '#E11D48') → '#FFFFFF'.
- enlaceSeguro('javascript:alert(1)') === null.
- contactosEmpresa con whatsapp '3001234567' → 'https://wa.me/573001234567'.
NUEVO tests/test_documento_plantilla_fuente.mjs (lee las fuentes con fs):
- DocumentoComercial.tsx tiene 'print:hidden', '@page' y 'print-color-adjust'; no tiene /\bdark:/ ni 'truncate'; todo target="_blank" lleva 'noopener noreferrer'.
- confirmar/layout.tsx tiene "referrer: 'no-referrer'" e 'index: false'.
- app/layout.tsx tiene lang="es".
Después npx tsc --noEmit.
Visual: capturas con Playwright a 375, 1024 y 1440 px de la vista previa y de /confirmar con datos DEMO, más page.pdf() para la impresión; página de revisión para el usuario.
```

**Comportamiento esperado:**

```text
- Una sola pieza para SC, COT y PVEN. Los números vienen del servidor: el componente no recalcula totales; solo completa total_linea si falta.
- SC sin precios: sin columnas de precio y sin totales. La forma de pago muestra la modalidad y el %, sin montos.
- Sin marca configurada no aparece 'Nebulae' ni ningún dato de ejemplo: el encabezado muestra solo el tipo de documento y el número.
- Pantallas:
  · 375 px: tarjetas, sin desplazamiento horizontal.
  · 1024 y 1440 px: tabla.
  · Impresión o PDF: hoja limpia con colores y sello, sin botones; cabe en Carta y en A4.
- Fechas: la emisión en hora de Colombia ('2 de octubre de 2026'); la entrega estimada sin corrimiento de día.
- Colores configurables: el texto sobre ellos pasa solo a blanco u oscuro para que siempre se lea.
- Correo:
  · Asunto 'Cotización COT-20260486 de <Empresa>'; si no hay nombre, 'Tu cotización COT-…'.
  · Remitente 'Empresa <correo>'.
  · Cuerpo con los colores y el contacto de la empresa.
- Términos y datos para pagar se leen en vivo desde Configuración.
- 'Descargar o imprimir': en navegadores dentro de WhatsApp el diálogo puede no abrir. Por eso, al lado, una ayuda: 'Si no se abre, usa ⋮ › Abrir en el navegador'.
```

**Datos existentes:**

```text
No aplica: no cambia documentos guardados. Un documento ya enviado cuyo enlace siga vigente se verá con el formato nuevo y con los términos y datos para pagar actuales.
```

**Riesgos:**

```text
- El contrato lo usan tres grupos: cambiar una clave rompe a los tres. La prueba de claves exactas lo vigila.
- Términos y datos para pagar se leen en vivo, no se guarda una copia al enviar: si cambian, un enlace vigente ya enviado muestra lo nuevo.
- Firefox imprime los fondos solo si el usuario activa 'imprimir fondos'. Chrome, Edge y Safari respetan print-color-adjust.
- Los navegadores dentro de WhatsApp pueden no abrir el diálogo de imprimir (ver la pregunta del PDF).
- lang='es' es global: Chrome deja de ofrecer traducir; no cambia ninguna lógica.
- El correo sale sin logo, solo con nombre y colores.
- Archivos compartidos con otros cambios:
  · email.py y erp_ventas.py (envíos): también los tocan H27+H39 y U16-envio. Orden: H27 → PLANTILLA → U16-envio.
  · app/layout.tsx: también lo toca H1.
  · package.json tiene un hunk sin commitear de otra sesión: stagear solo lo propio.
```

**Depende de:**

```text
- MARCA (core/empresa.py, lib/marca-empresa.js).
- Bloque 1:
  · H42 (pesos.js, ventas_dinero.redondear_peso y pesos).
  · H27+H39 (_enviar_correo_confirmacion: aquí solo cambian el asunto, el html y el remitente).
  · H5 (lib/whatsapp.js waUrl).
  · H1 (layout.tsx y la prueba sin dark:).
- Bloque 2:
  · U19+U21 (monto_linea y repartir_anticipo_por_linea llenan lineas[].anticipo).
  · U14 (notas sin amarillo).
  · H49 (useAvisos en Configuración).
- Bloque 3:
  · U17+H28, U22+H38 y U23 adoptan armar_documento y DocumentoComercial en confirmacion_publica.py y confirmar/[token]/page.tsx.
  · IVA llena lineas[].iva_pct y totales.impuestos.
  · U16-envio usa correo_documento y empresa_para_mensajes.
```

**Archivos que nombra el diseño:** `backend/app/core/documento_publico.py`, `backend/app/core/correo_documento.py`, `backend/app/core/email.py`, `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_documento_publico.py`, `frontend/src/lib/documento-comercial.js`, `frontend/src/components/documento/DocumentoComercial.tsx`, `frontend/src/components/documento/index.ts`, `frontend/src/app/confirmar/layout.tsx`, `frontend/src/app/layout.tsx`, `frontend/src/app/dashboard/admin/configuracion/page.tsx`, `frontend/src/app/dashboard/admin/configuracion/documentos-form.tsx`, `frontend/tests/test_documento_comercial.mjs`, `frontend/tests/test_documento_plantilla_fuente.mjs`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R10).


### PDF — PDF hecho por el sistema (solo si lo eliges)

**Grupo:** Tu empresa y el formato de los documentos · **Esfuerzo:** M · **Tareas del plan:** T9

**Para el usuario:** Decide si el sistema genera y adjunta el PDF él solo, o si basta con el enlace y el botón de descargar.

**Lo que vio y aprobó el usuario:** Si eliges «No por ahora», no cambia nada: el cliente abre el enlace y guarda el documento como PDF con «Descargar o imprimir», sin costo extra.

Si eliges el correo, el sistema le adjunta al cliente la cotización y el pedido en PDF, y él conserva el archivo aunque el enlace ya se haya usado o vencido. A cambio, cada envío tarda un poco más y hay que mantener dos diseños iguales: la página y el PDF.

Para mandarlo también por WhatsApp hace falta, además, una plantilla con documento aprobada por Meta en tu cuenta de WhatsApp Business. Esa plantilla la tendrías que cargar tú.

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- ¿Quieres que el sistema genere el PDF y se lo adjunte al cliente, o basta con el enlace y el botón «Descargar o imprimir»? → **Sí, adjuntar el PDF de la cotización y el pedido en el correo de respaldo (más trabajo y cada envío tarda un poco más)** ⚠ distinta de la recomendada («No por ahora: basta con el enlace y el botón para guardarlo como PDF (sin costo extra)»)

**Cambios (diseño):**

```text
SOLO si la respuesta a pdf_servidor es 1 o 2.
BACKEND
1) backend/requirements.txt: agregar reportlab. Es Python puro: funciona en Windows y en la imagen python:3.11-slim sin paquetes del sistema. Se descartan:
   - WeasyPrint: necesita Pango y Cairo, ~+80 MB en Docker y GTK en Windows.
   - Chromium/Playwright en el servidor: ~300 MB y mucha memoria.
2) NUEVO backend/app/core/pdf_documento.py: pdf_documento(documento (el dict de armar_documento), perfil, logo (mime, bytes) | None) → bytes.
   - reportlab.platypus: SimpleDocTemplate tamaño LETTER, márgenes de 12 mm.
   - Encabezado con los colores de la marca y el logo (ImageReader).
   - Tabla CANT / DESCRIPCIÓN / PRECIO / TOTAL, con Paragraph para que los nombres largos hagan salto de línea.
   - Totales con pesos(), forma de pago, notas, términos y pie de contacto.
   - Los números se copian del contrato, sin recalcular. Helvetica (cubre tildes y ñ).
3) backend/app/core/email.py: send_email(…, adjuntos: list[(nombre, bytes, mime)] | None = None).
   - Con adjuntos: MIMEMultipart('mixed') con la parte 'alternative' adentro, más MIMEApplication con Content-Disposition attachment.
   - Sin adjuntos: idéntico a hoy.
4) backend/app/api/v1/erp_ventas.py, en enviar_cotizacion_para_confirmacion y en el envío del pedido de U23:
   - Antes de _enviar_correo_confirmacion: try: pdf = pdf_documento(armar_documento(...), perfil_publico(db), leer_logo(db)) except: logger.exception y pdf = None.
   - Se adjunta f'{numero}.pdf'. Si falla, el correo sale sin PDF y el mensaje del correo agrega '(sin PDF adjunto)'.
   - La SC no lleva PDF: no tiene precios.
5) Solo con la opción 2, coordinado con U16-envio:
   - Dentro de la ventana de 24 h, el PDF sube como adjunto del mensaje de Chatwoot (multipart attachments[]).
   - Fuera de la ventana hace falta una plantilla de Meta con encabezado de documento, aprobada en la cuenta del usuario. La configuración va en Configuración, nunca en el código.
FRONTEND: ninguno.
```

**Pruebas (diseño):**

```text
NUEVO backend/tests/test_pdf_documento.py, con el runner de ROLLBACK:
- Los bytes empiezan por b'%PDF-'. Con pageCompression=0 el PDF contiene el número y '$2.786.923'.
- Un logo corrupto no rompe la generación.
- send_email con adjuntos: monkeypatch.setenv de SMTP falsos y smtplib.SMTP falso que captura el mensaje → hay una parte application/pdf con el nombre COT-….pdf. Nunca SMTP real.
- enviar-confirmacion de la COT con send_email falso → recibe un adjunto PDF.
- Con pdf_documento forzado a fallar por monkeypatch → 200 y el correo sale sin adjunto.
- Regresión: test_envio_confirmacion_canal_y_correo.py.
```

**Comportamiento esperado:**

```text
- Opción 1: el correo de la COT y del PVEN lleva COT-….pdf o PVEN-….pdf, con los mismos números que la página.
- Si el PDF falla, el envío no falla: el correo sale con el enlace y el aviso dice '(sin PDF adjunto)'.
- La respuesta del envío no cambia.
- Opción 2: además, el PDF va por WhatsApp según las reglas de U16-envio.
- Opción 0 (recomendada): no se implementa nada; queda el botón 'Descargar o imprimir' de PLANTILLA.
```

**Datos existentes:**

```text
No aplica: el PDF se genera al enviar y no toca documentos guardados.
```

**Riesgos:**

```text
- Dos diseños que mantener: cada cambio de formato se hace en la página y en el PDF.
- Cada envío tarda entre 100 y 300 ms más y usa más memoria.
- Un correo más pesado es más propenso a los filtros de spam.
- El PDF es una foto del momento del envío: si se re-cotiza, hay que mandar otro.
- WhatsApp fuera de la ventana de 24 h depende de una plantilla aprobada por Meta.
```

**Depende de:**

```text
- PLANTILLA: armar_documento es la única fuente de números.
- MARCA: leer_logo y perfil_publico.
- Bloque 1 H27+H39: send_email y _enviar_correo_confirmacion.
- U23: el envío del pedido.
- U16-envio: solo con la opción 2.
```

**Archivos que nombra el diseño:** `backend/requirements.txt`, `backend/app/core/pdf_documento.py`, `backend/app/core/email.py`, `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_pdf_documento.py` (la lista que manda es la de **Files** de la tarea y R10).


### U17-H28 — La solicitud que ve el cliente, como una factura

**Grupo:** Lo que ve el cliente: solicitud · **Esfuerzo:** L · **Tareas del plan:** T1, T5, T12, T15, T16, T18

**Para el usuario:** Hoy la página que abre el cliente es una lista simple con un botón, sin tu marca, sin explicar qué significa confirmar y sin decir qué sigue. Si el cliente reabre el enlace, le sale 'no es válido o ya expiró' aunque sí confirmó. Con este cambio ve un documento tipo factura con tu marca, sabe qué está confirmando, sabe qué pasa después y, si reabre el enlace, ve que ya confirmó. El enlace sigue siendo de un solo uso y sigue venciendo a los 2 días.

**Lo que vio y aprobó el usuario:** Cuando el cliente abre el enlace de la solicitud ve una hoja tipo factura, como la imagen que elegiste. Arriba hay una franja de color morado a rojo con tu logo, el nombre de tu empresa, el número de la solicitud, la fecha y su nombre. Debajo está la tabla de productos con número, descripción y cantidad. No lleva precios: los precios llegan en la cotización, y la página lo dice. También ve la forma de pago con el anticipo que se le va a pedir, la entrega estimada, hasta cuándo puede confirmar y cómo contactarte (su asesor, tu WhatsApp, teléfono y correo). Antes de los botones se le explica en palabras simples qué significa confirmar: que los productos y las cantidades están bien para que le prepares la cotización, y que confirmar no es una compra ni un pago. Tiene dos botones, 'Confirmar solicitud' y 'Pedir cambios'. Al confirmar le sale el mismo '¡Gracias! Tu confirmación fue registrada.' que ya aprobaste, y además qué sigue: su asesor prepara la cotización con precios, se la envían por el mismo medio para que la apruebe y después se hace el pedido. Si vuelve a abrir el enlace, ya no dice 'no es válido o ya expiró': dice 'Esta solicitud ya fue confirmada', con la fecha y el resumen. Si el enlace venció, fue reemplazado por uno más nuevo o ya no está disponible, se lo dice con esas palabras y le muestra cómo contactarte. La pestaña del navegador muestra el nombre de tu empresa y no 'Nebulae ERP', y hay un botón para imprimir o guardar en PDF. Se ve bien en el celular.

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- ¿Qué notas ve el cliente en su solicitud, su cotización y su pedido? → **Una «Nota para el cliente» aparte en la solicitud, más la nota de la cotización (en tus pantallas dirá «El cliente verá esta nota»); las Notas de la solicitud siguen siendo internas** (= recomendada)
- (Pregunta del diseño no mostrada) ¿Qué nota ve el cliente en la página de su solicitud? → reemplazada por la pregunta fusionada «notas_cliente» (en U17-H28); ver R3. Recomendación original del diseño, que NO se aplica: «Una «Nota para el cliente» aparte en la solicitud; las Notas de siempre siguen siendo solo internas». Decisión vigente (respuesta del usuario a la pregunta fusionada): «Una «Nota para el cliente» aparte en la solicitud, más la nota de la cotización (en tus pantallas dirá «El cliente verá esta nota»); las Notas de la solicitud siguen siendo internas».

**Cambios (diseño):**

```text
BACKEND
1) Migración aditiva, una sola para este grupo y encadenada a la cabeza que deje el Bloque 2 (fa6_025 de U11; verificar con `alembic heads`), por ejemplo fa6_026_pagina_cliente_sc:
   - document_confirmation_tokens.resultado VARCHAR(20) NULL.
   - En el mismo archivo van las columnas de H28-cambios y, si se elige la opción 0 de la pregunta, customer_requests.nota_cliente TEXT NULL.
   - Modelo DocumentConfirmationToken.resultado.
2) backend/app/core/confirmation_tokens.py:
   - Constantes RESULTADO_CONFIRMADO='CONFIRMADO', RESULTADO_CAMBIOS='CAMBIOS' y RESULTADO_REVOCADO='REVOCADO'.
   - consultar_token(db, token) -> dict | None, sin efectos: {id, document_type, document_id, created_at, expires_at, used_at, resultado, vigente, vencido}. vigente = used_at None y expires_at > ahora; vencido = used_at None y expires_at ≤ ahora.
   - reclamar_token(db, token) -> dict | None: el mismo UPDATE atómico de verify_and_consume_token, con RETURNING id, document_type, document_id y el mismo commit. verify_and_consume_token queda como envoltura que devuelve la tupla de siempre.
   - marcar_resultado(db, token_id, resultado): UPDATE … SET resultado = :r WHERE id = :id, SIN commit, porque va en el commit del documento.
   - revoke_pending_tokens(db, tipo, id, commit=True) (firma de H29) pone también resultado='REVOCADO'.
   - hay_enlace_mas_reciente_vigente(db, tipo, id, despues_de) -> bool.
   - peek_token no cambia.
3) Nuevo backend/app/core/documento_cliente.py (funciones puras y lecturas, sin FastAPI):
   - fecha_colombia(dt) -> 'dd/mm/aaaa' y fecha_hora_colombia(dt) -> 'dd/mm/aaaa a las h:mm p. m.'. Usan un desfase fijo de −5 h: Colombia no cambia de hora y así no se depende de tzdata en Windows.
   - etiqueta_modalidad(m): 'Contado' | '60/40' | 'Crédito 30 días' | el texto original. Es el espejo de etiquetaModalidad de H10.
   - forma_de_pago(m) -> {etiqueta, anticipo_pct:int, texto}, con ventas_dinero.pct_anticipo_de_modalidad y R2 (None → 60). Textos:
     · 100: 'Pagas el 100% del valor de la cotización antes de que hagamos tu pedido.'
     · 60: 'Pagas un anticipo del 60% del valor de la cotización antes de que hagamos tu pedido; el 40% restante, después.'
     · 0: 'Sin anticipo: pagas según el crédito acordado con tu asesor.'
     · Modalidad no reconocida: 'Anticipo del 60% del valor de la cotización antes del pedido; tu asesor te confirma la forma de pago.'
   - productos_publicos_sc(productos) -> [{n, descripcion, cantidad}]: SIN precio, SIN sku_id y sin líneas vacías.
   - resumen_publico_sc(sc) -> {tipo:'SC', numero, fecha (fecha_solicitud iso+'Z'), cliente:{nombre, direccion}, asesor (advisor_name), productos, total_unidades, forma_pago, entrega, nota_cliente}.
     · entrega = {fecha iso+'Z', texto 'Entrega estimada: dd/mm/aaaa (aproximada; la fecha final llega en la cotización)'} o None.
     · nota_cliente según la pregunta.
     · NUNCA las notas internas, el teléfono, el correo, advisor_user_id, created_by ni la razón de cancelación.
   - siguiente_paso_sc(sc, forma_pago) -> 3 textos:
     · '{Asesor o Tu asesor} prepara tu cotización con los precios.'
     · 'Te la enviamos por el mismo medio para que la revises y la apruebes.'
     · 'Cuando la apruebes, hacemos tu pedido' + (' con el anticipo del X%' si X > 0) + '.'
   - estado_enlace_sc(db, info, sc) -> (estado_enlace, extra). Reglas en este orden:
     a) Sin fila → 'invalido' «Este enlace no es válido. Ábrelo completo desde el mensaje que te enviamos o pide uno nuevo.»
     b) La SC no existe o está CANCELADA → 'no_disponible' «Este enlace ya no está disponible. Si tienes dudas, escríbenos.» Sin documento y sin decir que se canceló.
     c) Fila vigente y SC en PENDIENTE_CONFIRMACION → 'pendiente' (la única que responde 200).
     d) SC en CONFIRMADA o en un estado heredado de U15 (ESTADOS_SC_HEREDADOS) → 'confirmada' «Esta solicitud ya fue confirmada.».
        · confirmada_el = used_at si resultado es CONFIRMADO; si no, el último renglón SC con new_estado 'CONFIRMADA'.
        · documento = el resumen, solo si la confirmación tiene 30 días o menos (DIAS_RESUMEN_CONFIRMADO = 30); después va sin productos.
        · siguiente_paso.
        · Cubre la SC que quedó confirmada porque el cliente aprobó la cotización (U15/U11, pedido en la nota 7 del Bloque 2) y los enlaces viejos sin resultado.
     e) Fila vencida sin usar → 'vencido' «Este enlace venció el dd/mm/aaaa. Escríbenos y te enviamos uno nuevo.», con documento = {numero} y nada más.
     f) hay_enlace_mas_reciente_vigente → 'reemplazado' «Te enviamos un enlace más reciente para esta solicitud. Ábrelo desde el último mensaje que recibiste.», sin documento.
     g) resultado CAMBIOS → 'cambios_enviados' (lo arma H28-cambios).
     h) resultado CONFIRMADO con la SC de vuelta en Nueva, Asignada o Pendiente (cambiaron los productos) → 'actualizada' «Tu asesor actualizó esta solicitud después de tu confirmación. Te enviaremos un enlace nuevo para que la revises.», sin documento.
     i) Todo lo demás (revocado o sin resultado) → 'no_disponible'.
4) backend/app/api/v1/confirmacion_publica.py:
   - _sc_confirmacion_dict(sc) conserva numero, customer_name, estado y fecha_entrega_estimada. productos pasa a productos_publicos_sc (sin unit_price_cop) y se agregan los campos de resumen_publico_sc.
   - _detalle_enlace(db, info) -> {mensaje, estado_enlace, empresa: leer_marca(db), documento | None, confirmada_el | None, siguiente_paso | None}.
   - Todo lo que no sea 'pendiente' responde HTTPException(400, detail=ese dict). Es el mismo 400 de hoy, así que todas las pruebas de seguridad que afirman 400 siguen valiendo.
   - ver_confirmacion: consultar_token en vez de peek_token.
     · SC: 'pendiente' → 200 {status, estado_enlace:'pendiente', vence_at (iso+'Z'), empresa, data}; lo demás → 400 _detalle_enlace.
     · COT: el 200 de hoy más estado_enlace, vence_at y empresa (es aditivo). Los demás casos → 400 con estado_enlace 'invalido' | 'vencido' | 'reemplazado' | 'no_disponible' y empresa, SIN documento. El resumen de una COT (con precios) lo decide U22+H38.
   - confirmar_via_token, rama SC:
     · info = reclamar_token. Si es None → 400 _detalle_enlace(consultar_token(...)). Así un doble clic, o confirmar en otra pestaña, muestra 'ya fue confirmada' y no un error.
     · SC que ya no está PENDIENTE → 400 _detalle_enlace.
     · marcar_resultado(db, info['id'], 'CONFIRMADO') va en el MISMO commit que pone CONFIRMADA y gate1 (y donde U11 agrega su renglón).
     · Respuesta 200: {status, message (igual que hoy), estado_enlace:'confirmada', mensaje:'¡Gracias! Tu confirmación fue registrada.', confirmada_el: fecha_hora_colombia(ahora), siguiente_paso, empresa, data: resumen}.
   - confirmar_via_token, rama COT: solo marcar_resultado 'CONFIRMADO' en su commit. Lo demás es de U22.
5) No cambia lo de Gate 1: el token sigue en el body y es de un solo uso, y la marca gate1 solo la escribe confirmar_via_token.
6) Si la pregunta se responde con la opción 0:
   - 'nota_cliente' va en allowed de update_solicitud.
   - cambios_documento CAMPOS['SC'] lleva la etiqueta 'Nota para el cliente'.
   - _sc_dict la expone.
   - Editarla NO anula el enlace, porque el cliente confirma productos y no la nota.
   Con la opción 1, resumen_publico_sc usa sc.notas. Con la opción 2, no hay nota.
FRONTEND
7) Nuevo frontend/src/lib/confirmacion-publica.js (JS puro):
   - pedirPublico(apiUrl, ruta, cuerpo, encabezados) → {ok, status, cuerpo}. Es fetch POST SIN Authorization y SIN redirigir a /login. apiFetch, en cambio, manda el token del personal cuando un asesor abre el enlace y borra la sesión en un 401.
   - vistaDeRespuesta(r) → {estado_enlace, mensaje, empresa, documento, vence_at, confirmada_el, siguiente_paso, puedeActuar}.
     · Un detail de texto (backend viejo) → 'invalido' con ese texto.
     · Error de red → 'sin_conexion' «No pudimos cargar tu solicitud. Revisa tu conexión y vuelve a intentarlo.», con botón 'Reintentar'.
   - TEXTOS_ENLACE: título, ícono y tono por estado.
   - fechaHoraColombia(iso) con Intl, timeZone 'America/Bogota'.
   - claveIdempotencia(prefijo) con crypto.randomUUID(). Hoy la clave repite los primeros 16 caracteres del token en un encabezado.
8) Nuevo frontend/src/app/confirmar/[token]/layout.tsx (componente de servidor): export const metadata = {title: 'Confirmación', robots: {index: false, follow: false}, referrer: 'no-referrer'}. Así la pestaña ya no dice 'Nebulae ERP', y la URL con el token no viaja a WhatsApp, a la web de la empresa ni al pedir el logo.
9) frontend/src/app/confirmar/[token]/page.tsx queda solo como armazón:
   - Carga /confirmar/ver con pedirPublico y pone document.title = '{empresa.nombre} · Solicitud {numero}' (o '{empresa.nombre} · Confirmación').
   - Elige qué mostrar: documento.tipo 'SC' → VistaSolicitud; 'COT' → la vista de hoy movida tal cual a vista-cotizacion.tsx (U22+H38 la rediseña); estados sin acción → AvisoEnlace.
   - confirmar() pinta la respuesta. Si el POST da 400, muestra el estado que manda el servidor.
10) Nuevo frontend/src/app/confirmar/[token]/vista-solicitud.tsx, VistaSolicitud({vista, soloLectura, onConfirmar, confirmando, onPedirCambios}):
   - Fondo gris claro y una hoja blanca centrada (max-w-3xl, rounded-2xl, sombra).
   - EncabezadoDocumento (MARCA): título 'SOLICITUD', '# SC-…', Fecha, 'Para: {cliente} · {dirección}'. En el espacio extra: 'Esperando tu confirmación' y 'Puedes confirmar hasta el {vence}'.
   - Tabla en tarjeta blanca montada sobre la franja (-mt-8), como la referencia:
     · Columnas 'No.' | 'Descripción del producto' | 'Cantidad', con filas alternas en gris claro.
     · En el celular, la cantidad va a la derecha del nombre.
     · Debajo: 'Los precios llegan en la cotización.'.
   - Pastilla con el mismo degradado: 'Total de unidades: {n}' (en la referencia es el 'Total').
   - Dos columnas, una sola en el celular:
     · Izquierda: '¿Qué pasa si confirmo?' «Nos confirmas que estos productos y cantidades son los que necesitas. Con eso {asesor} prepara tu cotización con los precios y te la enviamos para que la apruebes. Confirmar no es una compra ni un pago.», y 'Contacto' (ContactoEmpresa).
     · Derecha: 'Forma de pago' (etiqueta y texto del anticipo), 'Entrega estimada' y 'Nota' si aplica (white-space pre-line).
   - Pie de acciones (fijo abajo en el celular, normal en escritorio, print:hidden):
     · Botón principal 'Confirmar solicitud', con el degradado y al menos 44 px de alto.
     · Botón secundario 'Pedir cambios', con borde.
     · Debajo: «¿Algo no está bien? Toca Pedir cambios y cuéntanos qué cambiar.».
   - Tras confirmar:
     · Recuadro verde arriba de la hoja con «¡Gracias! Tu confirmación fue registrada.» (el texto que el usuario marcó bien en el paso 22) y «Confirmaste la solicitud SC-… el {fecha}.».
     · '¿Qué sigue?' con los 3 pasos del servidor.
     · La hoja queda abajo, sin botones.
   - Enlace 'Imprimir o guardar en PDF' (window.print).
11) Nuevo frontend/src/app/confirmar/[token]/aviso-enlace.tsx, AvisoEnlace({vista}):
   - Ícono, título y mensaje según el estado.
   - 'confirmada': VistaSolicitud en soloLectura con el resumen (si llegó) y '¿Qué sigue?'.
   - Demás estados: el mensaje y ContactoEmpresa.
   - Siempre lleva el encabezado de la empresa; sin documento, solo el logo y el nombre.
12) Nuevo frontend/src/components/documento/ContactoEmpresa.tsx, ContactoEmpresa({empresa, asesor, numero}):
   - 'Tu asesor: {asesor}'.
   - Botones WhatsApp (waUrl con 'Hola, te escribo por la solicitud {numero}.'), Llamar, Correo y Página web, armados con lineasContacto de lib/marca.js. Todos con target _blank y rel 'noopener noreferrer'.
13) frontend/src/app/layout.tsx: <html lang="es">. Hoy dice 'en' y Chrome le ofrece al cliente traducir la página 'del inglés'. Es una línea; el archivo también lo toca H1.
14) frontend/src/app/dashboard/ventas/flujo.tsx, EnlaceConfirmacionModal: el aviso pasa a «Solo el cliente debería confirmar o pedir cambios: si abres el enlace y lo haces tú, queda registrado como si fuera el cliente.».
15) frontend/package.json 'test': '&& node tests/test_confirmacion_publica.mjs', en el mismo hunk del Bloque 3.
```

**Pruebas (diseño):**

```text
BACKEND. Archivo nuevo backend/tests/test_pagina_cliente_sc.py, sin parametrize. Se corre con `cd backend && venv\Scripts\python.exe tests/rollback_runner.py test_pagina_cliente_sc`.
Helpers: auth; _sc(db, numero, user_admin, **campos), que crea una SC ASIGNADA con asesor y productos; y _enviar(app_client, sc), que toma el token de link_confirmacion como test_confirmar_solicitud_consume_gate1_confirmed_at_al_crear_cotizacion. En TODAS: monkeypatch de 'app.core.email.send_email' con un falso (enviar-confirmacion manda correo si hay customer_email). Los datos de la empresa se cargan con PATCH /api/v1/empresa.
1) test_ver_pendiente_trae_empresa_forma_de_pago_y_productos_sin_precio:
   - SC '60/40 (60% anticipo - 40% pendiente)' con [{'product_name':'Rodillo','qty':6,'unit_price_cop':5000,'sku_id':9}] → 200.
   - estado_enlace 'pendiente'; vence_at termina en 'Z'; empresa.nombre.
   - data.productos == [{'n':1,'descripcion':'Rodillo','cantidad':6}]; data.forma_pago.anticipo_pct == 60; data.total_unidades == 6.
2) test_ver_no_expone_datos_internos: la SC tiene notas 'cliente difícil', customer_email y customer_phone. El JSON serializado no contiene esas cadenas ni las claves notas, customer_email, customer_phone, advisor_user_id ni created_by.
3) test_reabrir_un_enlace_ya_confirmado_dice_ya_fue_confirmada: enviar → confirmar → /ver → 400 con detail.estado_enlace 'confirmada', detail.mensaje 'Esta solicitud ya fue confirmada.', detail.documento.numero y productos no vacíos. El token queda con resultado 'CONFIRMADO'.
4) test_confirmar_responde_que_sigue: 200, estado_enlace 'confirmada', len(siguiente_paso) == 3 y 'cotización' en siguiente_paso[0].
5) test_doble_clic_en_confirmar_muestra_ya_confirmada: el segundo POST da 400 (como afirma test_enviar_y_confirmar_via_link) con detail.estado_enlace 'confirmada'.
6) test_resumen_se_oculta_a_los_30_dias: used_at = ahora − 31 días → 'confirmada' y el documento sin 'productos'.
7) test_enlace_reemplazado: dos envíos; el token del primero → 'reemplazado', sin documento; resultado 'REVOCADO'.
8) test_enlace_de_sc_cancelada_dice_no_disponible: enviar → POST /cancelar → 'no_disponible', sin documento, y el mensaje no contiene 'cancel'.
9) test_enlace_vencido: expires_at en el pasado → 'vencido' y documento == {'numero': …}.
10) test_token_inventado_es_invalido: 'x'*43 → 400 'invalido' y sin documento.
11) test_confirmada_y_luego_productos_cambiados_dice_actualizada: confirmar → PATCH productos (invalida_por_productos → ASIGNADA) → el token viejo da 'actualizada'.
12) test_sc_confirmada_por_la_cotizacion_dice_ya_fue_confirmada: SC PENDIENTE con token. Se simula la sincronización de U15 (revoke_pending_tokens y estado CONFIRMADA por ORM) → 'confirmada'.
13) test_cot_pendiente_sigue_respondiendo_igual: token de COT pendiente → 200 con data.total_cop y estado_enlace 'pendiente'.
14) Según la pregunta: test_nota_para_el_cliente_sale_y_las_notas_no (opción 0) o la afirmación que corresponda.
REGRESIÓN obligatoria con el runner: test_confirmacion_solicitud y test_confirmacion_cotizacion completos (todas sus aserciones de 400 siguen valiendo), test_cancelar_solicitud_con_documentos y test_cotizar_sin_confirmacion (U11). Nunca pytest completo.
FRONTEND
- frontend/tests/test_confirmacion_publica.mjs:
  (a) un 200 pendiente → puedeActuar true.
  (b) un 400 con detail {estado_enlace:'confirmada', mensaje, documento} → título 'Esta solicitud ya fue confirmada' y puedeActuar false.
  (c) un detail de texto → 'invalido' con ese texto.
  (d) 'vencido' → el texto contiene 'venció'.
  (e) fechaHoraColombia('2026-10-03T20:15:00Z') contiene '03/10/2026' y '3:15'.
  (f) claveIdempotencia no contiene el token.
- npm test y npx tsc --noEmit.
- Capturas con Playwright de /confirmar/{token} a 375 y 1440 px en estos estados: pendiente, recién confirmada, reabierta confirmada, vencida y reemplazada. Van a la página de revisión visual para que el usuario las vea y anote.
```

**Comportamiento esperado:**

```text
- Enlace vigente de una SC en Pendiente por confirmación: 200 con la hoja completa, sin ningún precio y sin datos internos (notas internas, teléfono, correo, ids).
- Confirmar: la SC pasa a Confirmada como hoy (gate1 y el renglón de Actividad no cambian). El enlace queda marcado CONFIRMADO. La página muestra el agradecimiento, la fecha y hora (hora de Colombia) y '¿Qué sigue?'.
- Reabrir un enlace, mensaje por caso (todos con el mismo código 400 de hoy):
  · Ya confirmada, incluso si se confirmó al aprobar la cotización: 'Esta solicitud ya fue confirmada.', con la fecha y, durante 30 días, el resumen de productos.
  · Vencido: 'Este enlace venció el …'.
  · Llegó uno más nuevo: 'Te enviamos un enlace más reciente…'.
  · El asesor cambió los productos después de la confirmación: 'Tu asesor actualizó esta solicitud…'.
  · Cancelada o anulada: 'Este enlace ya no está disponible…' (no dice que se canceló).
  · Inventado o mal copiado: 'Este enlace no es válido…'.
- Doble clic en Confirmar o confirmar en dos pestañas: la segunda vez la página muestra 'ya fue confirmada' en vez de un error.
- La pestaña del navegador muestra '{Empresa} · Solicitud SC-…'. Los buscadores no indexan la página y la URL con el token no se envía a otros sitios.
- En el celular la hoja va en una columna y los botones quedan fijos abajo. Al imprimir, los botones no salen.
- La cotización sigue con su página de hoy hasta U22+H38. Solo gana estado_enlace, vence_at y empresa en la respuesta.
```

**Datos existentes:**

```text
No se corrige nada y no hace falta script. Consulta de solo lectura en erp_test (transacción READ ONLY, 2026-10-03):
- 138 enlaces (98 de SC y 40 de COT): 109 ya usados o anulados y 29 vigentes. Los usados quedan con resultado vacío.
  · Si el cliente reabre uno de una SC confirmada, verá 'ya fue confirmada', porque la regla d) mira el estado de la SC.
  · Los de SC no confirmadas verán 'ya no está disponible'.
- Las 6 SC tienen Notas y son internas: por ejemplo 'el cliente necesita factura electrónica', escrita en tercera persona. Por eso la pregunta.
- No se consultó producción.
SQL de referencia: SELECT document_type, count(*) FILTER (WHERE used_at IS NULL AND expires_at > now()) AS vigentes, count(used_at) AS usados FROM document_confirmation_tokens GROUP BY 1; SELECT count(*) FILTER (WHERE coalesce(trim(notas),'')<>'') FROM customer_requests;
```

**Riesgos:**

```text
- Cambia una regla de seguridad de la Ronda 7: 'nunca se distingue el motivo' del error. Ahora quien tiene un enlace real ve si está confirmado, vencido, reemplazado o no disponible. Límites del riesgo:
  · Un enlace inventado solo ve 'no es válido'. Los tokens son de 256 bits y solo se guarda su hash.
  · Datos del documento solo para 'pendiente', 'confirmada' (30 días, sin precios) y el número en 'vencido'. Nunca se dice que se canceló.
  · Conviene incluirlo en la revisión de seguridad del final del Bloque 3.
- Se mantiene el 400 para todo lo que no se puede confirmar, para no romper las ~15 aserciones de seguridad existentes. Un 400 que trae un resumen es raro en HTTP, pero es explícito y está probado.
- apiFetch mostraría '[object Object]' con un detail en dict. Solo la página pública llama a estos endpoints y usa pedirPublico. B2-T0 (textoDeDetalle) ya reconoce dict.mensaje.
- El resumen 'confirmada' muestra los productos actuales de la SC. Si el asesor los cambió sin anular (porque ya había cotización), puede diferir de lo confirmado. Se acepta.
- La página de la ruta /confirmar es compartida con la cotización (U22+H38): la ruta necesita un solo dueño. Aquí se propone el armazón y se deja vista-cotizacion.tsx sin cambios para ellos.
- El nuevo archivo layout.tsx de /confirmar y el lang='es' del layout raíz: el raíz también lo toca H1 (Bloque 1). Stagear solo lo propio.
- C18 del Bloque 2 justificaba comparar el precio en cambian_productos porque la vista pública de la SC mostraba unit_price_cop. Ya no lo muestra; se deja igual (no hace daño).
```

**Depende de:**

```text
- MARCA (este grupo): EncabezadoDocumento, ContactoEmpresa, leer_marca.
- Bloque 2:
  · U15 (ESTADOS_SC_HEREDADOS, etiquetas de la SC y la sincronización que confirma la SC al aprobar la COT; regla d).
  · U11 (rama SC de confirmar_via_token: el renglón 'se mantiene la cotización' va en el mismo commit que marcar_resultado).
  · U18+H31+H33 (cancelar y restaurar revocan con revoke_pending_tokens).
  · H30 (dueño de EnlaceConfirmacionModal en flujo.tsx).
  · H10 (etiquetaModalidad, que es el espejo de etiqueta_modalidad).
  · B2-T7 (solicitud/[id]: el campo 'Nota para el cliente' si se elige la opción 0).
  · H26/H21 (cambios_documento.py CAMPOS['SC']).
- Bloque 1:
  · H29 (revoke_pending_tokens y _log con commit).
  · H36/R2 (pct_anticipo_de_modalidad).
  · H5 (waUrl).
  · H1 (layout raíz).
  · H27+H39 (enviar-confirmacion; correo).
  · R13 (migración aditiva) y R7 (runner).
- Bloque 3: U22+H38 (vista y rama COT de la misma ruta y del mismo endpoint); U16-envio y U16-seguimiento (reenvío y el texto de 'vencido').
```

**Archivos que nombra el diseño:** `backend/alembic/versions/fa6_026_pagina_cliente_sc.py`, `backend/app/models/confirmation.py`, `backend/app/models/erp_documents.py`, `backend/app/core/confirmation_tokens.py`, `backend/app/core/documento_cliente.py`, `backend/app/api/v1/confirmacion_publica.py`, `backend/app/api/v1/erp_ventas.py`, `backend/app/core/cambios_documento.py`, `backend/tests/test_pagina_cliente_sc.py`, `frontend/src/lib/confirmacion-publica.js`, `frontend/tests/test_confirmacion_publica.mjs`, `frontend/src/app/confirmar/[token]/layout.tsx`, `frontend/src/app/confirmar/[token]/page.tsx`, `frontend/src/app/confirmar/[token]/vista-solicitud.tsx`, `frontend/src/app/confirmar/[token]/vista-cotizacion.tsx`, `frontend/src/app/confirmar/[token]/aviso-enlace.tsx`, `frontend/src/components/documento/ContactoEmpresa.tsx`, `frontend/src/app/layout.tsx`, `frontend/src/app/dashboard/ventas/flujo.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R10).


### H28-cambios — «Pedir cambios» desde el enlace del cliente

**Grupo:** Lo que ve el cliente: solicitud · **Esfuerzo:** M · **Tareas del plan:** T6, T12, T15, T17, T18

**Para el usuario:** Hoy, si al cliente algo no le cuadra, solo puede confirmar o no hacer nada, y el asesor no se entera. Con este cambio el cliente pide los cambios desde el mismo enlace. La solicitud vuelve a su asesor con el comentario del cliente, y el asesor lo ve sin tener que estar revisando.

**Lo que vio y aprobó el usuario:** El cliente puede tocar 'Pedir cambios' en su enlace, escribir qué quiere cambiar (por ejemplo 'son 8 rodillos, no 6') y enviarlo. La solicitud vuelve a Asignada, en manos de su asesor, y el comentario del cliente queda en la Actividad con fecha y hora. El asesor se entera de tres formas:
- una pastilla amarilla arriba a la derecha de la pantalla, con cuántas solicitudes tienen cambios del cliente;
- la marca 'Cambios pedidos' en la lista de solicitudes;
- un recuadro en la solicitud con el comentario del cliente y los botones 'Editar productos' y 'Reenviar al cliente'.
Si el envío de correos está configurado, al asesor también le llega un correo; si no, la Actividad anota que no se pudo avisar por correo. El enlace que usó el cliente deja de servir. Cuando le reenvías la solicitud, le llega uno nuevo y la marca desaparece. Si el cliente ya había confirmado, ya no puede pedir cambios por el enlace: tendrá que escribirte por los botones de contacto.

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- Si el cliente responde desde su enlace que ya no necesita la solicitud, ¿qué pasa? → **Vuelve a su asesor marcada «Ya no la necesita» y el asesor decide si la cancela** (= recomendada)

**Cambios (diseño):**

```text
BACKEND
1) Misma migración del grupo (fa6_026_pagina_cliente_sc), en customer_requests:
   - cambios_cliente_at TIMESTAMP NULL;
   - cambios_cliente_tipo VARCHAR(20) NULL ('CAMBIOS' | 'NO_LA_NECESITA');
   - cambios_cliente_comentario TEXT NULL.
   Se agregan al modelo CustomerRequest.
2) backend/app/api/v1/confirmacion_publica.py: class PedirCambiosBody(BaseModel) con token: str; tipo: Literal['CAMBIOS','NO_LA_NECESITA'] = 'CAMBIOS'; comentario: str = ''.
   - Un model_validator hace strip y exige como máximo 1000 caracteres.
   - Con tipo CAMBIOS exige al menos 10 caracteres. Si no: 'Cuéntanos qué quieres cambiar (al menos 10 caracteres).'
   - El 422 sale ANTES de tocar el token, así que el enlace no se gasta.
   (La opción 'Ya no la necesito' depende de la pregunta; con la opción 2, tipo se queda fijo en CAMBIOS.)
3) Endpoint nuevo POST /confirmar/pedir-cambios, con Idempotency-Key obligatorio, igual que confirmar:
   a) info = consultar_token, sin efectos. Sin fila, o si el tipo no es 'SC' → 400 _detalle_enlace SIN gastar el enlace. Pedir cambios en la cotización es la rama que diseñe U22+H38.
   b) reclamado = reclamar_token: es atómico y hace su propio commit, igual que confirmar. Si da None → 400 _detalle_enlace(consultar_token(...)). Si el cliente ya confirmó en otra pestaña, la página muestra 'ya fue confirmada'.
   c) SC con populate_existing().with_for_update(). Si no existe o su estado no es PENDIENTE_CONFIRMACION → 400 _detalle_enlace. El enlace ya quedó gastado, igual que en confirmar.
   d) Cambios en la SC:
      · old = sc.estado;
      · sc.estado = 'ASIGNADA' si tiene advisor_user_id, si no 'BORRADOR';
      · sc.gate1_confirmed_at = None;
      · cambios_cliente_at = ahora, con su tipo y su comentario (o None);
      · sc.updated_at = ahora.
   e) revoke_pending_tokens(db, 'SC', sc.id, commit=False) y marcar_resultado(db, reclamado['id'], 'CAMBIOS').
   f) _log(db, 'SC', …, 'CAMBIOS_CLIENTE', descripción, old_estado=old, new_estado=sc.estado, user_name='Cliente (por el enlace)', commit=False).
      · extra_data = {tipo, comentario, cambios: [{'etiqueta':'Comentario del cliente','despues': comentario o '—'}, {'etiqueta':'Estado de la solicitud','despues': etiqueta_estado('SC', sc.estado)}]}, sin clave 'campo' (el formato de C1/H27).
      · Descripción con CAMBIOS: «El cliente pidió cambios desde el enlace: «{comentario}». La solicitud vuelve a {Asignada} para que la ajustes y se la reenvíes.»
      · Descripción con NO_LA_NECESITA: «El cliente dice que ya no necesita esta solicitud{: «comentario»}. Vuelve a {Asignada}: decide si la cancelas o la ajustas.»
   g) Si la SC tiene una COT activa (U11, cotización hecha antes de la confirmación; _documentos_activos_de_solicitud de N4): _log COT 'SC_CAMBIOS_CLIENTE' «El cliente pidió cambios en la solicitud {SC}: «…». Revisa esta cotización antes de enviarla.» con commit=False. No se toca su estado ni su enlace.
   h) Un solo db.commit().
   i) Después del commit, en try/except con logger, _avisar_asesor_cambios(db, sc):
      · Busca el User del advisor_user_id.
      · Correo con _enviar_correo_confirmacion de H27, que devuelve {enviado, motivo, mensaje}: destino el correo del asesor; asunto '{cliente} pidió cambios en la solicitud {SC}' (o '… dice que ya no necesita la solicitud {SC}'); HTML con el comentario escapado con html.escape y el enlace {FRONTEND_URL}/dashboard/ventas/solicitud/{id}.
      · Después, _log SC 'AVISO_ASESOR' «Aviso por correo a {correo}: enviado.» o «No se pudo avisar por correo al asesor: {mensaje de H27}.».
      · Si algo falla aquí, el cliente igual recibe 200.
   j) Respuesta 200: {status, estado_enlace:'cambios_enviados', mensaje:'¡Listo! Recibimos tus cambios.' (o 'Recibimos tu respuesta.'), detalle:'{asesor o Tu asesor} ajustará tu solicitud y te enviará un enlace nuevo.', comentario, empresa, data: resumen}.
4) Regla g) de estado_enlace_sc (U17+H28): un token con resultado CAMBIOS → 'cambios_enviados' «Ya nos enviaste tus cambios el {fecha}. {Asesor} ajustará la solicitud y te enviará un enlace nuevo.». Lleva el comentario mientras cambios_cliente_at siga puesto.
5) backend/app/api/v1/erp_ventas.py:
   - enviar_solicitud_para_confirmacion: al enviar o reenviar, cambios_cliente_at, tipo y comentario quedan en None en el mismo commit (el asesor ya respondió). Además, la SC se lee con .with_for_update(), para que un 'Pedir cambios' simultáneo no quede borrado sin verse.
   - _sc_dict: 'cambios_cliente': {'at': iso+'Z', 'tipo', 'comentario'} o None.
   - alertas_resumen: clave nueva 'cambios_cliente', que NO suma a 'atrasados'. Cuenta las SC con cambios_cliente_at no nulo y estado ASIGNADA o BORRADOR. Si normalize_role(user.role) == 'ASESOR', solo cuenta las suyas (advisor_user_id == user.id).
FRONTEND
6) Nuevo frontend/src/app/confirmar/[token]/panel-cambios.tsx, PanelPedirCambios({asesor, onEnviar, enviando, error, onVolver}). Reemplaza los botones al tocar 'Pedir cambios':
   - Opciones 'Quiero cambiar algo' y 'Ya no la necesito' (según la pregunta).
   - Cuadro de texto '¿Qué quieres cambiar?' con el ejemplo 'Por ejemplo: son 8 rodillos, no 6, y agrega 2 brochas de 3 pulgadas.' y un contador x/1000.
   - 'Enviar cambios', deshabilitado hasta tener 10 caracteres (puedeEnviarCambios de lib/confirmacion-publica.js), y 'Volver'.
   - Texto: «Tu asesor recibirá tu mensaje y te enviará la solicitud corregida con un enlace nuevo. Este enlace dejará de funcionar.».
   - El 422 sale en la misma pantalla sin borrar lo escrito.
   - Tras el 200: AvisoEnlace 'cambios_enviados' con ícono de mensaje, «¡Listo! Recibimos tus cambios.», el comentario citado y ContactoEmpresa.
   - En page.tsx: pedirCambios(tipo, comentario) → pedirPublico('/confirmar/pedir-cambios', {token, tipo, comentario}, {'Idempotency-Key': claveIdempotencia('cambios')}).
7) Nuevo frontend/src/lib/cambios-cliente.js (JS puro):
   - avisoCambiosCliente(sc) → null | {tono:'ambar'|'rosa', titulo, texto, fecha}. Solo si hay sc.cambios_cliente y el estado es ASIGNADA o BORRADOR. Títulos: 'El cliente pidió cambios' / 'El cliente dice que ya no la necesita'.
   - etiquetaChipCambios(sc) → 'Cambios pedidos' | 'Ya no la necesita' | null.
8) frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx (dueña B2-T7). Dentro de renderSiguientePaso, que U12 movió a Actividad, y antes del paso de Asignada:
   - Tarjeta ámbar (o rosa) con el título y la fecha (leída con 'Z').
   - El comentario entre comillas, en un bloque gris que respeta los saltos de línea.
   - Botones 'Editar productos' (abre el editor de productos de H25/U13) y 'Reenviar al cliente' (el envío de siempre con el ChannelModal de H27). Con 'Ya no la necesita', además 'Cancelar solicitud', que abre la ventana de cancelar con el motivo prellenado 'El cliente ya no la necesita: …'.
   - ACTIVITY_STYLE / ACTIVITY_TYPE_LABELS / ACTIVITY_TYPE_ORDER: CAMBIOS_CLIENTE ('Cambios pedidos por el cliente', MessageSquareWarning ámbar) y AVISO_ASESOR ('Aviso al asesor', Bell gris).
9) frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx (dueña B2-T6): junto a EstadoBadge, en la tabla y en la tarjeta, una pastilla ámbar 'Cambios pedidos' o rosa 'Ya no la necesita' (etiquetaChipCambios).
10) frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx (dueña B2-T8): ACTIVITY_STYLE SC_CAMBIOS_CLIENTE ('Cambios pedidos en la solicitud', ámbar).
11) frontend/src/components/AlertasBadge.tsx: guarda también res.data.cambios_cliente. Si es mayor que 0, muestra una segunda pastilla ámbar junto a la de atrasados: '{n} con cambios del cliente' → router.push('/dashboard/ventas/solicitud'). Se muestra aunque no haya atrasados; hoy el componente devuelve null si count es 0.
12) frontend/package.json 'test': '&& node tests/test_cambios_cliente.mjs', en el mismo hunk del Bloque 3.
```

**Pruebas (diseño):**

```text
BACKEND. Archivo nuevo backend/tests/test_pedir_cambios_sc.py, sin parametrize. Se corre con `cd backend && venv\Scripts\python.exe tests/rollback_runner.py test_pedir_cambios_sc`. En TODAS: monkeypatch de 'app.core.email.send_email' y de 'app.core.email.smtp_configurado' (H27) con falsos que registran las llamadas. Nunca correo real.
1) test_pedir_cambios_devuelve_la_sc_al_asesor_con_el_comentario: enviar → token de link_confirmacion → POST /confirmar/pedir-cambios {token, comentario:'Son 8 rodillos, no 6'} con Idempotency-Key → 200 con estado_enlace 'cambios_enviados'.
   - SC ASIGNADA, gate1 None, cambios_cliente_comentario guardado.
   - Token con resultado 'CAMBIOS'.
   - Renglón CAMBIOS_CLIENTE con old PENDIENTE_CONFIRMACION / new ASIGNADA, el comentario en la descripción y etiquetas ['Comentario del cliente','Estado de la solicitud'].
2) test_el_enlace_usado_para_pedir_cambios_ya_no_confirma: POST /confirmar/confirmar con el mismo token → 400 y la SC sigue ASIGNADA. /ver → detail.estado_enlace 'cambios_enviados'.
3) test_si_ya_confirmo_no_puede_pedir_cambios: confirmar → pedir-cambios → 400 con detail.estado_enlace 'confirmada'. La SC sigue CONFIRMADA y gate1 no es None.
4) test_comentario_corto_es_422_y_no_gasta_el_enlace: comentario 'no' → 422, used_at sigue None y /ver sigue en 200.
5) test_ya_no_la_necesita_acepta_comentario_vacio: tipo 'NO_LA_NECESITA', comentario '' → 200 y cambios_cliente_tipo 'NO_LA_NECESITA' (solo con las opciones 0 o 1 de la pregunta).
6) test_sc_cancelada_no_cambia: token creado después de cancelar (técnica de test_link_no_confirma_sc_cancelada) → 400 y la SC sigue CANCELADA.
7) test_token_de_cotizacion_no_se_gasta: token de COT → 400 y su used_at sigue None.
8) test_avisa_al_asesor_por_correo_con_el_comentario_escapado: smtp_configurado → True; comentario '<b>8 rodillos</b> por favor'.
   - El falso se llamó 1 vez con to = correo del asesor y el asunto contiene el número de la SC.
   - El HTML contiene '&lt;b&gt;'.
   - Renglón AVISO_ASESOR 'enviado'.
9) test_sin_correo_configurado_queda_anotado_y_el_cliente_recibe_200: delenv SMTP_USER/SMTP_PASSWORD → 200 y AVISO_ASESOR contiene 'No se pudo avisar'.
10) test_reenviar_borra_la_marca_de_cambios: tras pedir cambios, POST enviar-confirmacion → columnas en None y _sc_dict cambios_cliente None.
11) test_alertas_cuentan_los_cambios_del_asesor: SC del admin con cambios.
   - Admin: cambios_cliente ≥ 1.
   - vendedor_token: 0.
   - SC de user_vendedor con cambios: el vendedor ve 1.
12) test_cotizacion_temprana_recibe_el_renglon (U11): SC PENDIENTE con COT BORRADOR marcada sin_confirmacion_sc_at → pedir cambios → COT con renglón SC_CAMBIOS_CLIENTE y estado sin cambio.
13) test_reabrir_tras_pedir_cambios_y_reenviar_dice_reemplazado.
REGRESIÓN con el runner: test_confirmacion_solicitud, test_pagina_cliente_sc, test_envio_confirmacion_canal_y_correo (H27) y test_cotizar_sin_confirmacion.
FRONTEND
- frontend/tests/test_cambios_cliente.mjs:
  · avisoCambiosCliente con estado ASIGNADA y tipo CAMBIOS → tono 'ambar' y título 'El cliente pidió cambios'.
  · Con estado PENDIENTE_CONFIRMACION → null.
  · Con tipo NO_LA_NECESITA → 'rosa'.
  · Sin sc.cambios_cliente → null.
- En test_confirmacion_publica.mjs: puedeEnviarCambios('corto','CAMBIOS') false; con 10 caracteres true; con 1001 false; ('','NO_LA_NECESITA') true.
- npm test y npx tsc --noEmit.
- Playwright:
  · El panel en 375 px: el botón queda visible con el teclado del celular abierto.
  · La tarjeta en la SC.
  · La pastilla ámbar.
  · Las capturas van a la página de revisión visual.
```

**Comportamiento esperado:**

```text
- 'Pedir cambios' solo funciona con el enlace vigente de una SC en Pendiente por confirmación. El enlace sirve para UNA cosa: confirmar o pedir cambios. Lo que llegue primero gana; el UPDATE del token es atómico.
- Un comentario de menos de 10 caracteres (con 'Quiero cambiar algo') responde 422 y el enlace sigue sirviendo.
- Al enviar:
  · La SC pasa a Asignada (Nueva si no tiene asesor) y sin confirmación del cliente. Cualquier otro enlace pendiente se anula.
  · La Actividad muestra 'Cambios pedidos por el cliente' con el comentario y el cambio de estado.
  · Si hay una cotización temprana (U11), su Actividad también lo anota; ella no cambia.
- Aviso al asesor:
  · Pastilla ámbar global (cada asesor ve las suyas; el administrador ve todas).
  · Marca en la lista de solicitudes.
  · Tarjeta con el comentario en la solicitud.
  · Correo si SMTP está configurado. Si no lo está, la Actividad lo anota y el cliente igual recibe su confirmación.
- Reabrir el enlace después de pedir cambios: 'Ya nos enviaste tus cambios…'. Cuando el asesor reenvía: 'Te enviamos un enlace más reciente…'.
- Reenviar la solicitud borra la marca de cambios. La Actividad conserva el comentario.
- Si el cliente ya confirmó, 'Pedir cambios' responde con la vista 'Esta solicitud ya fue confirmada' y no cambia nada.
- El token de una cotización no se gasta en este endpoint: responde 400 sin tocarlo.
- El comentario se muestra siempre como texto (React escapa) y en el correo va escapado.
```

**Datos existentes:**

```text
No aplica: las columnas nuevas nacen nulas y ninguna SC vieja queda marcada. No se corrige nada.
```

**Riesgos:**

```text
- Es un endpoint público que escribe. La protección es la misma de confirmar:
  · Exige un enlace real y vigente de una SC pendiente.
  · Valida antes de gastar el enlace.
  · Lo reclama en forma atómica y tiene un tope de 1000 caracteres.
  · El comentario se escapa en el correo.
  · No crea confirmación ni marca gate1: solo devuelve la SC al asesor, así que no abre camino a crear una cotización sin el cliente.
- Si hay una cotización temprana (U11) que ya se envió al cliente, su enlace sigue vivo. El cliente podría pedir cambios en la SC y luego aprobar la COT vieja. Se deja así a propósito (tocar Gate 2 aquí es más riesgoso), y la COT queda con un renglón que avisa. Lo debe revisar el crítico junto con U22.
- El correo al asesor depende de SMTP, que hoy no está configurado. Por eso el aviso real es la pastilla y la marca dentro del sistema.
- SMTP es síncrono (hasta 10 s) y va después del commit, fuera del bloqueo.
- enviar_solicitud_para_confirmacion la tocan H27 (Bloque 1) y U16-envio (Bloque 3). Necesita un solo dueño. Limpiar la marca y el with_for_update son dos líneas que hay que conservar.
- La pastilla de AlertasBadge consulta cada 5 minutos: el aviso no es instantáneo.
- U16-seguimiento (2 días) debe mirar solo las SC en Pendiente por confirmación, para no perseguir al cliente que ya pidió cambios.
```

**Depende de:**

```text
- U17+H28 (este grupo): consultar_token, reclamar_token, marcar_resultado, _detalle_enlace, estado_enlace_sc, pedirPublico y AvisoEnlace.
- MARCA: ContactoEmpresa.
- Bloque 1:
  · H27+H39 (_enviar_correo_confirmacion y smtp_configurado; ChannelModal de reenvío; enviar_solicitud_para_confirmacion).
  · H29 (_log y revoke con commit=False).
  · N4 (_documentos_activos_de_solicitud).
  · R7 (runner con vendedor_token/user_vendedor y monkeypatch).
- Bloque 2:
  · U15 (estados y etiquetas de la SC; esta es una transición nueva Pendiente → Asignada y no cambia sus pasos).
  · U11 (COT temprana).
  · U12 (renderSiguientePaso en Actividad).
  · H25/U13 (editor de productos).
  · U18+H31+H33 (ventana de cancelar con motivo).
  · B2-T2 (hueco 'alertas de una SC con COT temprana' en alertas_resumen).
  · B2-T6, B2-T7 y B2-T8 como dueñas de solicitud-client, solicitud/[id] y cotizacion/[id].
- Bloque 3: U16-envio y U16-seguimiento (misma función de envío y regla de seguimiento); U22+H38 (rama COT de pedir cambios).
```

**Archivos que nombra el diseño:** `backend/alembic/versions/fa6_026_pagina_cliente_sc.py`, `backend/app/models/erp_documents.py`, `backend/app/api/v1/confirmacion_publica.py`, `backend/app/core/documento_cliente.py`, `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_pedir_cambios_sc.py`, `frontend/src/app/confirmar/[token]/panel-cambios.tsx`, `frontend/src/app/confirmar/[token]/page.tsx`, `frontend/src/app/confirmar/[token]/aviso-enlace.tsx`, `frontend/src/lib/confirmacion-publica.js`, `frontend/src/lib/cambios-cliente.js`, `frontend/tests/test_cambios_cliente.mjs`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/components/AlertasBadge.tsx`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R10).


### U22-H38 — Cotización del cliente en formato factura

**Grupo:** Lo que ve el cliente: cotización y pedido · **Esfuerzo:** L · **Tareas del plan:** T1, T5, T12, T15, T17, T21

**Para el usuario:** El cliente ve su cotización como una factura clara: cantidad, descripción, precio unitario y total de cada producto, subtotal, IVA, total, forma de pago con anticipo, notas y términos, y todo suma bien.

**Lo que vio y aprobó el usuario:** Cuando el cliente abre el enlace de la cotización ve una hoja tipo factura, blanca con detalles naranja. Arriba están el logo y el nombre de tu empresa, la palabra COTIZACIÓN, el número, la fecha y el nombre del cliente. Luego viene una tabla con Cantidad, Descripción, Precio unitario y Total de cada producto, así que ya no se confunde el precio de una unidad con el total. Abajo aparecen Subtotal, Descuento (si hay), IVA y TOTAL, y las cuentas siempre suman. Al lado ve la forma de pago (por ejemplo «Anticipo del 60% ($1.104.369) para confirmar el pedido. Saldo: $736.246»), las notas y los términos. Puede imprimirla o guardarla en PDF, y en el celular la tabla se acomoda en tarjetas. Debajo están los botones «Confirmar cotización» y «Pedir cambios», con una frase que explica qué significa confirmar y qué sigue. Para que salgan tu logo, NIT, contacto, cuenta para pagos y términos, tendrás que cargarlos en la configuración de datos de la empresa.

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- (Pregunta del diseño no mostrada) ¿Qué notas ve el cliente en su cotización y en la confirmación del pedido? → reemplazada por la pregunta fusionada «notas_cliente» (en U17-H28), que corrige su recomendación (C19); ver R3. Recomendación original del diseño, que NO se aplica: «La nota de la cotización y también la de la solicitud (en tus pantallas se marca «El cliente verá esta nota»)». Decisión vigente (respuesta del usuario a la pregunta fusionada): «Una «Nota para el cliente» aparte en la solicitud, más la nota de la cotización (en tus pantallas dirá «El cliente verá esta nota»); las Notas de la solicitud siguen siendo internas».

**Cambios (diseño):**

```text
BACKEND
1) Nuevo backend/app/core/documento_cliente.py. No usa FastAPI, importa de ventas_dinero y lee con la sesión que recibe.
   - lineas_cliente(productos) -> list[dict], con LISTA BLANCA {cantidad, descripcion, precio_unitario, total_linea}.
     · cantidad = qty.
     · descripcion = product_name sin espacios sobrantes.
     · precio_unitario = redondear_peso(unit_price_cop).
     · total_linea = redondear_peso(total_cop) si la línea lo trae; si no, redondear_peso(unit_price_cop × qty).
     · Omite las líneas sin nombre.
     · Nunca copia cost_usd, flete_usd, margen_pct, sku_id, es_libre ni otro campo. Si IVA agrega iva_pct a la línea, ese ítem lo suma a la lista blanca.
   - totales_cliente(lineas, descuento_pct, total_guardado, impuestos=None) -> {subtotal, descuento_pct, descuento, impuestos, ajuste_redondeo, total}.
     · subtotal = Σ total_linea.
     · descuento = redondear_peso(subtotal × pct / 100) (fórmula H42).
     · impuestos = lo que entregue IVA, una lista [{tarifa_pct, base, valor}]; [] mientras IVA no exista.
     · total = redondear_peso(total_guardado).
     · ajuste_redondeo = total − (subtotal − descuento + impuestos, si IVA dice que se suman).
     · Con datos nuevos el ajuste es 0. Si no lo es, se escribe logger.warning con el número del documento y la hoja muestra la fila 'Ajuste por redondeo'.
   - forma_pago_cotizacion(cot, db, sc) -> {modalidad, pct, anticipo, saldo, manual, saldo_a_favor, anticipo_por_pagar}.
     · Usa anticipo_cotizacion(cot, db, sc=sc) del Bloque 1: pct a 2 decimales, anticipo = requerido, saldo = total − requerido, manual = origen == ORIGEN_MANUAL.
     · Usa saldos_a_favor_de_cotizacion (R6): anticipo_por_pagar = max(0, requerido − min(saldo_a_favor, total)).
     · NUNCA expone anticipo_manual_nota.
   - notas_cliente(sc, cot, so=None) -> [{titulo, texto}], según la decisión notas_cliente.
     · Opción 0: 'Nota de la solicitud' + 'Notas' de la COT. En el pedido, 'Notas del pedido' solo si difiere de la de la COT (regla de H35).
     · Opción 1: sin la nota de la SC.
     · Las notas vacías o con solo espacios se omiten (_texto_o_none de H35).
   - cotizacion_para_cliente(cot, db, token=None) -> dict. Carga la SC UNA sola vez (choque C9 del Bloque 2) y arma:
     · tipo 'COT', numero, estado.
     · fecha = día de Colombia del envío (token.created_at); sin token, fecha_cotizacion.
     · cliente {nombre, direccion: direccion_entrega o customer_address}.
     · asesor = solo sc.advisor_name.
     · fecha_entrega_estimada.
     · valida_hasta (U22-validez; None si no existe).
     · lineas, totales, forma_pago, notas.
     · empresa = datos_empresa_publicos(db) de MARCA ({} mientras no exista).
     · Por compatibilidad con las pruebas y la rama SC: total_cop (= totales.total) y productos (= el _productos_publicos actual).
2) backend/app/core/confirmation_tokens.py:
   - TIPOS_CONFIRMACION = ('SC','COT').
   - Nueva leer_token_vigente(db, token, tipos=TIPOS_CONFIRMACION) -> DocumentConfirmationToken|None. Exige el mismo hash, used_at nulo, expires_at > ahora y document_type en tipos.
   - peek_token(db, token, tipos=TIPOS_CONFIRMACION) la envuelve y sigue devolviendo (document_type, document_id).
   - verify_and_consume_token(db, token, tipos=TIPOS_CONFIRMACION) agrega `AND document_type = ANY(:tipos)` al UPDATE … RETURNING, como parámetro y nunca interpolado. Así un token de otro tipo (el de consulta del pedido, U23) no se puede gastar en /confirmar/confirmar.
3) backend/app/api/v1/confirmacion_publica.py:
   - ver_confirmacion usa leer_token_vigente.
   - La rama COT sigue exigiendo PENDIENTE_CONFIRMACION, con el mismo error genérico, y devuelve cotizacion_para_cliente(doc, db, tok).
   - Se elimina _cot_confirmacion_dict.
   - La rama SC es de U17+H28. Si U17+H28 no le agrega 'tipo':'SC', se agrega aquí para que el frontend despache.
   - confirmar_via_token: la respuesta de la COT agrega 'siguiente_paso': {anticipo_por_pagar, instrucciones_pago de MARCA}, leído después del commit.

FRONTEND
4) Nuevo frontend/src/lib/documento-cliente.js: lógica pura, probada con node. Usa formatoPesos/formatoPct de lib/pesos.js y etiquetaModalidad de lib/etiquetas-solicitud.js (H10).
   - textoFormaPago(fp):
     · Contado o 100%: 'Contado: pagas el 100% ($X) antes de que procesemos el pedido.'
     · Entre 0 y 100: 'Anticipo del 60% ($X) para confirmar el pedido. Saldo: $Y.'
     · 0%: '{etiquetaModalidad}: sin anticipo. Total a pagar: $X.'
     · Manual: 'Anticipo acordado: 50% ($X). Saldo: $Y.'
     · Con saldo_a_favor agrega: 'Ya tienes $Z a favor de un pedido anterior: te falta pagar $W de anticipo.'
   - filasTotales(totales) -> [{etiqueta, valor, fuerte}]:
     · Subtotal.
     · 'Descuento (10%)' solo si es > 0.
     · Una fila por impuesto ('IVA 19%').
     · 'Ajuste por redondeo' solo si es ≠ 0.
     · TOTAL.
   - fechaLarga(iso) -> '8 de octubre de 2026', en día de Colombia y sin desfase UTC.
5) Nuevo frontend/src/components/publico/DocumentoFactura.tsx: solo presentación, sin fetch, en formato ref-cot-pven.
   - Hoja blanca max-w-3xl con franja izquierda oscura y esquinas en el color --acento (empresa.color_acento o naranja #EA6A1E). Son decorativas y llevan aria-hidden.
   - Encabezado: logo, nombre y NIT de la empresa a la izquierda. A la derecha, el TÍTULO grande (COTIZACIÓN o PEDIDO DE VENTA) y la fecha.
   - Bloque 'Para:' con cliente y dirección, y además 'N.º', 'Válida hasta' y 'Entrega estimada'.
   - Tabla semántica CANT. | DESCRIPCIÓN | PRECIO UNIT. | TOTAL desde 640 px.
   - En celular, tarjetas ('4 × $117.000' con el total a la derecha), margen lateral de 16 px y sin scroll horizontal.
   - Pie en dos columnas:
     · Izquierda: 'Forma de pago', 'Notas', 'Términos y condiciones' (empresa.terminos_cotizacion / terminos_pedido) y contacto.
     · Derecha: filasTotales con la banda TOTAL en color de acento.
   - Props: {titulo, empresa, numero, fecha, cliente, metaDerecha, lineas, totales, formaPago, notas, terminos, extraDerecha?, children}.
   - Botón 'Imprimir o guardar PDF' (window.print). Los botones llevan print:hidden.
   - Siempre en modo claro (H1).
6) Nuevo frontend/src/app/confirmar/[token]/cotizacion-cliente.tsx: CotizacionCliente({data, token}).
   - Usa DocumentoFactura con titulo 'COTIZACIÓN'.
   - Debajo va la explicación: 'Al confirmar aceptas los productos, precios y forma de pago de esta cotización. El siguiente paso es pagar el anticipo de $X; cuando lo verifiquemos, crearemos tu pedido.' Sin anticipo: 'Cuando la confirmes, crearemos tu pedido.'
   - Botón 'Confirmar cotización': el mismo POST /confirmar/confirmar con Idempotency-Key de hoy.
   - Botón 'Pedir cambios' (lo diseña U22-cambios).
   - Pantalla de gracias: 'Confirmaste la cotización COT-…' y qué sigue (anticipo por pagar e instrucciones de pago de la empresa).
7) frontend/src/app/confirmar/[token]/page.tsx (su dueño es U17+H28) queda como despachador.
   - Carga /confirmar/ver con postPublico. Si U17 no lo creó, va en el nuevo frontend/src/lib/publico.ts: fetch sin Authorization, nunca redirige a /login y devuelve {ok, data, mensaje} con textoDeDetalle de lib/avisos.js (H49).
   - Según data.tipo pinta la vista de la SC (U17) o CotizacionCliente.
   - Se borra el render actual de la COT, el que pone el unitario al lado de '× 4'.
8) Nuevo frontend/src/app/confirmar/layout.tsx (o el de U17): export const metadata = {title:'Tu cotización', robots:{index:false, follow:false}, referrer:'no-referrer'}. Así el enlace con token no se filtra por Referer al cargar el logo y los buscadores no lo indexan.
9) Si notas_cliente es la opción 0, se agrega un texto pequeño 'El cliente verá esta nota en su cotización':
   - en cotizacion/[id]/page.tsx, bajo los recuadros 'Nota de la solicitud' y 'Nota de la cotización' (H35/U14);
   - en el textarea de notas de CalculadorModal (cotizacion-client.tsx).
10) frontend/package.json: + node tests/test_documento_cliente.mjs en el script test (dentro del cambio consolidado).
```

**Pruebas (diseño):**

```text
BACKEND. Se corre con el runner de ROLLBACK: cd C:/Users/jmqui/Nebulae_ERP_Work/Mirror/.worktrees/<rama>/backend y C:/Users/jmqui/Nebulae_ERP_Work/Mirror/backend/venv/Scripts/python.exe tests/rollback_runner.py test_documento_cliente_cotizacion. Sin parametrize. Los helpers de MARCA e IVA se simulan con monkeypatch y nunca se llama a servicios externos.
1) test_ver_cot_trae_total_por_linea_y_cuadra
   - Prepara una SC '60/40 (60% anticipo - 40% pendiente)' y una COT PENDIENTE_CONFIRMACION con productos [{'product_name':'Pintura','qty':4,'unit_price_cop':117000,'total_cop':468000,'cost_usd':25,'margen_pct':30,'flete_usd':2,'sku_id':1}, {'product_name':'Cinta','qty':10,'unit_price_cop':13200,'total_cop':132000}], con subtotal y total 600000. El token se crea con create_confirmation_token.
   - Afirma 200 y lineas[0] == {'cantidad':4,'descripcion':'Pintura','precio_unitario':117000,'total_linea':468000}.
   - Afirma Σ total_linea == subtotal == total == 600000.
   - Afirma forma_pago con pct 60, anticipo 360000 y saldo 240000.
   - Afirma que 'cost_usd', 'margen', 'flete' y 'sku_id' no aparecen en resp.text.
2) test_descuento_se_resta_y_suma_exacto: subtotal 1000000, descuento_pct 10 y total 900000 → descuento 100000 y ajuste_redondeo 0.
3) test_total_viejo_con_centavos_muestra_ajuste: línea 6 × 206769.231 con total_cop 1240615.385 y total 1840615.38 → total 1840615, y subtotal − descuento + ajuste == total.
4) test_anticipo_manual_no_expone_la_nota: anticipo_pct_manual 50 con nota 'cliente VIP negociado' → pct 50 y manual True; 'VIP' no está en resp.text.
5) test_notas_de_la_sc_y_la_cot: sc.notas 'Entrega en obra' y cot.notas 'Precios válidos 5 días' → salen las dos con sus títulos (con la opción 1, solo la de la COT).
6) test_cot_sin_sc_usa_el_porcentaje_conservado: COT sin SC, total 1000 y anticipo 600 → pct 60 y modalidad None.
7) test_saldo_a_favor_de_pedido_cancelado: PVEN CANCELADO de la COT con un pago ANTICIPO CONFIRMADO de 300000 → saldo_a_favor 300000 y anticipo_por_pagar = requerido − 300000.
8) test_ver_con_token_de_otro_tipo_es_400_y_no_lo_consume: un DocumentConfirmationToken 'PVEN' da 400 en /confirmar/ver y en /confirmar/confirmar, y su used_at sigue en None.
9) Regresión sin cambios: test_confirmacion_cotizacion.py (test_ver_confirmacion_cot_funciona_mientras_esta_pendiente sigue viendo numero, estado y total_cop) y test_confirmacion_solicitud.py.

FRONTEND
- Nuevo tests/test_documento_cliente.mjs con node:assert/strict:
  · textoFormaPago para 60/40, Contado, 'Credito 30 dias' (debe decir 'Crédito 30 días'), manual y saldo a favor.
  · filasTotales: sin descuento no hay fila de descuento; con IVA aparece 'IVA 19%'; con ajuste aparece 'Ajuste por redondeo'.
  · fechaLarga('2026-10-08') === '8 de octubre de 2026'.
- npx tsc --noEmit sin errores.
- Capturas con Playwright (recorrido.js) a 1440 px y a 375 px de una COT de prueba, para la página de revisión visual del usuario.
```

**Comportamiento esperado:**

```text
- POST /api/v1/confirmar/ver con un token de COT pendiente devuelve, además de numero, estado, total_cop y productos de siempre, estos campos:
  · tipo 'COT', fecha, cliente {nombre, direccion}, asesor, fecha_entrega_estimada y valida_hasta.
  · lineas [{cantidad, descripcion, precio_unitario, total_linea}].
  · totales {subtotal, descuento_pct, descuento, impuestos[], ajuste_redondeo, total}.
  · forma_pago {modalidad, pct, anticipo, saldo, manual, saldo_a_favor, anticipo_por_pagar}.
  · notas [{titulo, texto}] y empresa {...}.
- Lista blanca estricta. Nunca salen costos, flete, margen, sku_id, es_libre, la nota del anticipo manual, correo, teléfono, cotizador, creador ni ids internos.
- Cuadre:
  · total de la línea = el guardado, o unitario × cantidad;
  · subtotal = suma de las líneas;
  · descuento = round(subtotal × %);
  · total = subtotal − descuento (+ IVA, según el ítem IVA);
  · el TOTAL mostrado es siempre el total guardado. Si no cuadra (datos viejos con centavos), aparece la fila 'Ajuste por redondeo'.
- El anticipo mostrado es exactamente el que exigirá crear el pedido: anticipo_cotizacion del Bloque 1 (manual R3, modalidad R2, conservado o por defecto), descontando el saldo a favor de un pedido cancelado (R6).
- Ejemplo (H38): «Pintura vinilo · 4 · $117.000 · $468.000». Hoy la página muestra $117.000 al lado de '× 4'.
- En celular la tabla se ve en tarjetas. Al imprimir no salen los botones.
- Errores: el mismo mensaje genérico de hoy, con la pantalla que diseña U17+H28.
- Confirmar funciona como hoy (token de un solo uso, Gate 2), con la explicación previa y la pantalla de qué sigue.
```

**Datos existentes:**

```text
No se escribe nada. Con estas consultas de solo lectura se ve qué cotizaciones pendientes mostrarían 'Ajuste por redondeo' (montos con centavos que la T14/R1 del Bloque 1 no haya redondeado):

SELECT numero, subtotal_cop, total_cop FROM sales_quotations WHERE estado='PENDIENTE_CONFIRMACION' AND (total_cop<>round(total_cop) OR subtotal_cop<>round(subtotal_cop));

SELECT c.numero FROM sales_quotations c, json_array_elements(c.productos) l WHERE c.estado='PENDIENTE_CONFIRMACION' AND (l->>'unit_price_cop')::numeric <> round((l->>'unit_price_cop')::numeric);

Si aparecen, se corrigen con la T14 del Bloque 1 (R1), solo con el OK del usuario.
```

**Riesgos:**

```text
- Choque directo con U17+H28 en confirmar/[token]/page.tsx, el layout, el helper público y la pantalla de error. Debe haber un solo dueño (U17), y CotizacionCliente va en su propio archivo.
- Con notas_cliente = opción 0, una nota interna de la solicitud llega al cliente. H35 del Bloque 1 decía que nunca llegaba; por eso se agrega el aviso 'El cliente verá esta nota'.
- Sin U22-anticipo, el anticipo que vio el cliente puede cambiar después sin que vuelva a confirmar (es el riesgo anotado en H36 del Bloque 1).
- Sin MARCA configurada, el encabezado sale sin logo ni NIT. No se escribe ninguna marca a mano.
- Mientras no exista el ítem IVA, la hoja no muestra fila de IVA.
- /confirmar/ver hace más consultas (SC, saldos a favor, configuración de la empresa). Son pocas y por PK.
- La impresión depende del navegador (márgenes, encabezados y pies del navegador).
```

**Depende de:**

```text
- MARCA: datos_empresa_publicos y logo.
- IVA: desglose por producto y si el IVA se suma o va incluido.
- U17+H28: es dueño de confirmar/[token]/page.tsx, del layout, del helper público y de la pantalla de error. La rama SC es suya.
- Bloque 1: H42 (redondear_peso, pesos.js), H36+H43/R2/R3/R6 (anticipo_cotizacion, saldos_a_favor_de_cotizacion) y H35 (notas).
- Bloque 2: C9 (cargar la SC una sola vez), H10 (etiquetaModalidad), U14 (estilo de los recuadros de notas), H49 (textoDeDetalle).
```

**Archivos que nombra el diseño:** `backend/app/core/documento_cliente.py`, `backend/app/core/confirmation_tokens.py`, `backend/app/api/v1/confirmacion_publica.py`, `backend/tests/test_documento_cliente_cotizacion.py`, `frontend/src/lib/documento-cliente.js`, `frontend/src/lib/publico.ts`, `frontend/src/components/publico/DocumentoFactura.tsx`, `frontend/src/app/confirmar/[token]/page.tsx`, `frontend/src/app/confirmar/[token]/cotizacion-cliente.tsx`, `frontend/src/app/confirmar/layout.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/tests/test_documento_cliente.mjs`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R10).


### U22-cambios — Pedir cambios desde la cotización

**Grupo:** Lo que ve el cliente: cotización y pedido · **Esfuerzo:** M · **Tareas del plan:** T6, T12, T15, T17

**Para el usuario:** El cliente puede pedir cambios desde el enlace de la cotización, y la cotización vuelve a tu trabajo con lo que pidió.

**Lo que vio y aprobó el usuario:** Debajo de la cotización, además de «Confirmar», el cliente tiene el botón «Pedir cambios». Al pulsarlo escribe qué quiere cambiar (por ejemplo «quiero 6 galones en vez de 4») y lo envía. La cotización vuelve a Borrador, es decir, a tu trabajo. En ella aparece un recuadro amarillo «El cliente pidió cambios» con lo que escribió, la fecha y los botones «Re-cotizar» y «Enviar al cliente». En la Actividad queda el pedido del cliente con sus palabras. El enlace que tenía deja de servir: cuando ajustes la cotización, se la envías de nuevo con un enlace nuevo. Al cliente le aparece «Recibimos tu solicitud de cambios; tu asesor te enviará una cotización actualizada».

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- Sin preguntas.

**Cambios (diseño):**

```text
BACKEND
1) backend/app/api/v1/confirmacion_publica.py: class PedirCambiosBody(BaseModel), con model_config = ConfigDict(str_strip_whitespace=True), token: str y comentario: str = Field(..., min_length=5, max_length=1000). Pydantic responde 422 antes de entrar a la función, así que un comentario corto no gasta el enlace.
2) Nuevo POST /confirmar/pedir-cambios: pedir_cambios_via_token(body: PedirCambiosBody, idempotency_key: str = Header(..., alias='Idempotency-Key'), db).
   - resolved = verify_and_consume_token(db, body.token, tipos=('SC','COT')). Es atómico y de un solo uso. Si es None → 400 GENERIC_ERROR.
   - Rama COT:
     · Lee la cot con .populate_existing().with_for_update().
     · Si no existe o su estado != 'PENDIENTE_CONFIRMACION' → 400 GENERIC_ERROR, sin distinguir el motivo.
     · Pone cot.estado='BORRADOR', cot.gate2_confirmed_at=None y cot.updated_at=utcnow.
     · _log(db,'COT',cot.id,cot.numero,'CAMBIOS_PEDIDOS', f'El cliente pidió cambios: «{comentario}»', old_estado='PENDIENTE_CONFIRMACION', new_estado='BORRADOR', user_name='Cliente (enlace)', extra_data={'comentario':comentario,'cambios':[{'etiqueta':'Lo que pide el cliente','despues':comentario}]}, commit=False).
     · Un solo db.commit(). Después, revoke_pending_tokens(db,'COT',cot.id).
     · No llama a _sincronizar_estado_solicitud_desde_cotizacion (con U15 la SC ya no refleja a la COT) ni mueve el lead.
     · Respuesta: {'status':'success','message':'Recibimos tu solicitud de cambios.','asesor': advisor_name de la SC o None}.
   - Rama SC: la diseña U17+H28 en este mismo endpoint y con el mismo body.
3) backend/app/api/v1/erp_ventas.py get_cotizacion: usa los logs que ya carga (en orden ascendente), sin consulta extra.
   - d['cambios_pedidos'] = {'texto', 'fecha': created_at+'Z'} del último renglón 'CAMBIOS_PEDIDOS'.
   - Solo si cot.estado=='BORRADOR' y después de ese renglón no hay un ESTADO_CHANGED con new_estado 'PENDIENTE_CONFIRMACION'. Si no, None.
4) backend/app/core/textos_actividad.py (H7): etiqueta de la acción 'CAMBIOS_PEDIDOS' = 'Cambios pedidos por el cliente', si el módulo tiene mapa de acciones.

FRONTEND
5) frontend/src/lib/documento-cliente.js: validarComentarioCambios(texto) -> {ok, mensaje}, con 'Escribe al menos 5 caracteres' y 'Máximo 1000 caracteres'.
6) frontend/src/app/confirmar/[token]/cotizacion-cliente.tsx:
   - Botón secundario 'Pedir cambios' que abre en la misma hoja el panel '¿Qué quieres cambiar?': textarea con contador 0/1000 y botones 'Enviar solicitud de cambios' y 'Volver'.
   - Envía POST /confirmar/pedir-cambios con postPublico e Idempotency-Key `cambios-${token.slice(0,16)}`.
   - Los botones se deshabilitan mientras envía. Un error se muestra dentro del panel sin borrar lo escrito.
   - Si sale bien: 'Recibimos tu solicitud de cambios. {asesor o Tu asesor} te enviará una cotización actualizada.', con el contacto de la empresa (MARCA).
7) frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx:
   - En renderSiguientePaso, rama BORRADOR/ENVIADA con precios: si cotizacion.cambios_pedidos existe, NextStepCard tone='amber' con título 'El cliente pidió cambios', el texto entre comillas, la fecha y las acciones 'Re-cotizar' (setShowCalc(true)) y 'Enviar al cliente' (handleEnviarCotizacion).
   - ACTIVITY_STYLE['CAMBIOS_PEDIDOS'] = {icon: MessageSquareWarning, color:'text-amber-600 bg-amber-50'}.
8) frontend/tests/test_documento_cliente.mjs: casos de validarComentarioCambios.
```

**Pruebas (diseño):**

```text
BACKEND: nuevo backend/tests/test_pedir_cambios_cotizacion.py, solo con el runner de ROLLBACK y sin parametrize. Todas las pruebas usan monkeypatch de app.core.email.send_email/smtp_configurado (y del envío de WhatsApp de U16, si existe), aunque no se espere ningún envío.
1) test_pedir_cambios_devuelve_la_cot_a_borrador
   - Prepara una COT PENDIENTE_CONFIRMACION con token y hace POST /api/v1/confirmar/pedir-cambios {'token', 'comentario':'Quiero 6 galones en vez de 4'} con Idempotency-Key.
   - Afirma 200, estado BORRADOR, gate2_confirmed_at None y used_at del token puesto.
   - Afirma un renglón 'CAMBIOS_PEDIDOS' con old PENDIENTE_CONFIRMACION, new BORRADOR, user_name 'Cliente (enlace)' y el comentario en description y en extra_data.
   - Afirma que GET /ventas/cotizaciones/{id} (admin_token) trae cambios_pedidos['texto'] == comentario.
2) test_comentario_corto_es_422_y_no_gasta_el_enlace: 'ok' → 422; /confirmar/ver sigue en 200 y el estado sigue PENDIENTE_CONFIRMACION.
3) test_comentario_de_1001_caracteres_es_422.
4) test_enlace_usado_es_400_generico: el segundo POST da 400 con 'El enlace no es válido o ya expiró.', y /confirmar/confirmar con ese token también da 400.
5) test_cot_que_ya_no_esta_pendiente_es_400: COT BORRADOR con un token vivo creado a mano → 400 y el estado no cambia.
6) test_la_sc_no_cambia: la SC CONFIRMADA vinculada sigue CONFIRMADA.
7) test_al_reenviar_desaparece_cambios_pedidos: después de pedir cambios, POST /ventas/cotizaciones/{id}/enviar-confirmacion → GET trae cambios_pedidos None.
8) test_el_comentario_con_html_se_guarda_como_texto: '<b>6</b> galones' queda igual en extra_data['comentario'].

FRONTEND
- test_documento_cliente.mjs prueba validarComentarioCambios con '', 'ok', 5 letras y 1001 caracteres.
- npx tsc --noEmit.
- Prueba manual con datos de prueba: pedir cambios desde el enlace y ver la tarjeta ámbar en la COT.
```

**Comportamiento esperado:**

```text
- Solo una COT en PENDIENTE_CONFIRMACION con su enlace vigente puede pedir cambios. El enlace se gasta, igual que con Confirmar: después ya no sirve para confirmar.
- La COT vuelve a BORRADOR con la marca de Gate 2 limpia. El precio deja de estar congelado (el congelamiento solo aplica a PENDIENTE_CONFIRMACION y CONFIRMADA): el asesor re-cotiza sin la ventana de H40 y la vuelve a enviar con un enlace nuevo.
- La SC no cambia de estado (U15) y el lead del CRM tampoco.
- El comentario es obligatorio, de 5 a 1000 caracteres. Se guarda tal cual, como texto, y React lo muestra escapado.
- El error es el mismo genérico para enlace usado, vencido o revocado, y para una COT que ya no está pendiente.
- La tarjeta ámbar desaparece en cuanto la COT se envía de nuevo.
```

**Datos existentes:**

```text
No aplica: no hay pedidos de cambios anteriores.
```

**Riesgos:**

```text
- El texto libre del cliente entra a la Actividad. Se muestra escapado. En el Bloque 5 (IA real), que leerá la Actividad, debe tratarse como dato y no como instrucciones.
- No hay aviso activo al asesor (correo o WhatsApp interno). Lo ve en la COT, en la Actividad y en el Hub, si el Bloque 4 lo marca.
- Doble clic: el segundo POST da el error genérico. El botón se deshabilita mientras envía.
- El seguimiento automático a los 2 días (U16-seguimiento) no debe escribirle a una COT que ya está en Borrador. Se cumple si filtra por PENDIENTE_CONFIRMACION.
```

**Depende de:**

```text
- U22+H38: cotizacion-cliente.tsx, documento-cliente.js, publico.ts y tipos en verify_and_consume_token.
- U17+H28: comparten el endpoint /confirmar/pedir-cambios; la rama SC es suya.
- U15: la SC no refleja a la COT.
- H40 y U11: tarjetas de renderSiguientePaso en cotizacion/[id].
- H7: textos_actividad.
- U16-seguimiento.
```

**Archivos que nombra el diseño:** `backend/app/api/v1/confirmacion_publica.py`, `backend/app/api/v1/erp_ventas.py`, `backend/app/core/textos_actividad.py`, `backend/tests/test_pedir_cambios_cotizacion.py`, `frontend/src/lib/documento-cliente.js`, `frontend/tests/test_documento_cliente.mjs`, `frontend/src/app/confirmar/[token]/cotizacion-cliente.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx` (la lista que manda es la de **Files** de la tarea y R10).


### U22-validez — Validez de la cotización y reenvío del enlace

**Grupo:** Lo que ve el cliente: cotización y pedido · **Esfuerzo:** M · **Tareas del plan:** T1, T5, T7, T15, T16, T17

**Para el usuario:** La cotización muestra hasta cuándo es válida, el enlace dura lo mismo y puedes reenviarla sin volverla a Borrador.

**Lo que vio y aprobó el usuario:** La cotización del cliente dice «Válida hasta el 8 de octubre de 2026». Por defecto son 5 días desde que se la envías, y lo cambias en Configuración del Hub, en «Días de validez de una cotización». El enlace sirve hasta ese día (hoy dura solo 2 días). Después, el cliente ve que el enlace venció y cómo contactarlos. En la cotización verás hasta cuándo puede confirmar y un botón «Reenviar al cliente». Ese botón le manda un enlace nuevo con la validez renovada sin pasar la cotización a Borrador, y el enlace anterior deja de servir. La ventana del enlace también dice hasta cuándo sirve.

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- ¿Hasta cuándo puede el cliente confirmar una cotización? → **Hasta su fecha de validez: 5 días por defecto (lo cambias en Configuración), y el enlace sirve hasta ese día. El recordatorio no amplía la validez; «Reenviar» sí la renueva** (= recomendada)

**Cambios (diseño):**

```text
BACKEND
1) Migración aditiva backend/alembic/versions/fa6_0NN_cotizacion_valida_hasta.py:
   - Agrega sales_quotations.valida_hasta DATE NULL, y en el modelo SalesQuotation.valida_hasta = Column(Date, nullable=True).
   - La revisión se encadena a la cabeza vigente (alembic heads, después de las del Bloque 1 y del Bloque 2). El downgrade solo quita la columna.
2) backend/app/core/confirmation_tokens.py:
   - create_confirmation_token(db, document_type, document_id, expires_at=None). Si no se pasa expires_at, queda utcnow + TOKEN_TTL_DAYS como hoy, así que la SC no cambia.
   - Nueva vence_al_final_del_dia(fecha) -> datetime UTC sin zona = datetime.combine(fecha + 1 día, 00:00) + 5 h (Colombia es UTC−5 y no tiene horario de verano).
3) backend/app/api/v1/erp_ventas.py:
   - Helper _config_entero(db, key, defecto, minimo, maximo). Generaliza _get_alert_days: un valor no numérico usa el defecto y uno fuera de rango usa el límite.
   - DIAS_VALIDEZ_COT_DEFECTO = 5.
4) enviar_cotizacion_para_confirmacion:
   - Acepta también el estado 'PENDIENTE_CONFIRMACION' para reenviar. Las guardas de PVEN, H46, N4 y el canal de H27 siguen igual.
   - dias = _config_entero(db,'dias_validez_cotizacion',5,1,60).
   - cot.valida_hasta = hoy en Colombia (_now_bogota().date()) + dias.
   - raw_token = create_confirmation_token(db,'COT',cot.id, expires_at=vence_al_final_del_dia(cot.valida_hasta)).
   - En un reenvío, la revocación previa es la que ya existe. La Actividad dice 'Enlace de confirmación reenviado al cliente{canal}', con old_estado == new_estado, y el lead no se vuelve a mover.
   - El correo (H27) agrega 'Esta cotización es válida hasta el {fecha larga}.'.
   - La respuesta agrega 'vence': valida_hasta.isoformat().
5) _cot_dict: + 'valida_hasta'.
6) documento_cliente.cotizacion_para_cliente (U22+H38) expone valida_hasta.

FRONTEND
7) frontend/src/app/dashboard/ventas/page.tsx, ConfigPanel: nueva sección 'Documentos para el cliente' con 'Días de validez de una cotización' (de 1 a 60, por defecto 5). Se guarda con el mismo onSave (PATCH /ventas/config {dias_validez_cotizacion}).
8) frontend/src/app/dashboard/ventas/flujo.tsx, EnlaceConfirmacionModal: prop opcional vence?: string|null.
   - Con fecha: 'Es de un solo uso y sirve hasta el {fechaLarga(vence)}'.
   - Sin fecha (SC): el texto de hoy.
9) frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx:
   - confirmarEnvio guarda d.vence y lo pasa al modal.
   - En renderSiguientePaso, rama PENDIENTE_CONFIRMACION: 'El cliente puede confirmar hasta el {fecha}.' (o 'El enlace venció el {fecha}.' si ya pasó) y el botón 'Reenviar al cliente', que abre el ChannelModal.
   - Se quita el texto 'pasa la cotización a Borrador desde Cambiar Estado'.
10) DocumentoFactura (U22+H38) muestra 'Válida hasta el …' en el encabezado de la COT.
```

**Pruebas (diseño):**

```text
BACKEND: nuevo backend/tests/test_validez_cotizacion.py, con el runner de ROLLBACK. En todas, monkeypatch de app.core.email.send_email y smtp_configurado.
1) test_enviar_pone_valida_hasta_y_el_enlace_dura_hasta_ese_dia: COT BORRADOR con productos y total. Afirma valida_hasta == hoy en Colombia + 5, token.expires_at == vence_al_final_del_dia(valida_hasta) y json['vence'].
2) test_dias_de_validez_desde_configuracion: con un INSERT admin_config('dias_validez_cotizacion','10') dentro de la transacción, la validez es +10.
3) test_config_invalida_usa_limites: 'abc' → 5, '0' → 1 y '500' → 60.
4) test_ver_trae_valida_hasta.
5) test_enlace_vencido_es_400: con expires_at en el pasado, /confirmar/ver da 400 genérico.
6) test_reenviar_cot_pendiente: el segundo POST da 200. El token viejo da 400 y el nuevo 200, el estado sigue PENDIENTE_CONFIRMACION y hay un renglón 'Enlace de confirmación reenviado al cliente'.
7) test_vence_al_final_del_dia (prueba pura): date(2026,10,8) → datetime(2026,10,9,5,0).
8) Se ajusta test_confirmacion_cotizacion.py::test_enviar_confirmacion_requiere_borrador_o_enviada: se quita PENDIENTE_CONFIRMACION de los estados que esperan 400. test_confirmacion_solicitud.py queda sin cambios.

FRONTEND
- npx tsc --noEmit.
- fechaLarga ya la prueba test_documento_cliente.mjs.
- Revisión manual del modal y de la tarjeta.
```

**Comportamiento esperado:**

```text
- Al enviar o reenviar una COT, valida_hasta = hoy + N días. N se fija en Configuración, va de 1 a 60 y es 5 por defecto. El enlace sirve hasta las 23:59 de ese día, hora de Colombia.
- Reenviar una COT pendiente no la pasa a Borrador ni toca precios. Revoca el enlace anterior, emite uno nuevo y renueva la validez.
- Pasada la fecha, /confirmar/ver da el error genérico y la pantalla de U17+H28 ofrece contactar a la empresa. La COT no cambia de estado sola; pasarla a Vencida queda para U16-seguimiento, si se quiere.
- La SC no cambia: su enlace sigue durando 2 días.
- Con la opción 1 de la pregunta, solo se hace el reenvío de una COT pendiente (puntos 4 sin valida_hasta, 9 y 8 sin fecha). Los enlaces siguen durando 2 días y no se muestra validez.
```

**Datos existentes:**

```text
No se rellena nada. Las COT ya enviadas quedan con valida_hasta vacío: no muestran 'Válida hasta' y sus tokens conservan la fecha con que se crearon.
```

**Datos del usuario:**

```text
Las cotizaciones que ya enviaste no muestran fecha de validez, y sus enlaces siguen durando 2 días.
```

**Riesgos:**

```text
- Cambia la vida del enlace de la COT, de 2 días a hasta la fecha de validez. Hay que acoplarlo con U16-seguimiento (el recordatorio a los 2 días usa el mismo enlace, que sigue vivo).
- Reenviar una COT pendiente puede chocar con U16-envio si ya diseñó su propio reenvío. Debe quedar uno solo.
- ConfigPanel vive en page.tsx del Hub, que tiene muchos dueños (Bloque 4). Si MARCA crea una pantalla de configuración de la empresa, el campo puede ir allí.
- La fecha de validez se calcula en hora de Colombia. Si se calculara en UTC, de noche saldría un día más.
```

**Depende de:**

```text
- U22+H38: DocumentoFactura y cotizacion_para_cliente.
- H27+H39: enviar_cotizacion_para_confirmacion y las props correo/canal del EnlaceConfirmacionModal.
- H30: el mismo modal.
- U16-envio y U16-seguimiento: reenvío y vencimiento.
- N8: configuración.
- Bloque 1 R13: migraciones solo aditivas.
```

**Archivos que nombra el diseño:** `backend/alembic/versions/fa6_0NN_cotizacion_valida_hasta.py`, `backend/app/models/erp_documents.py`, `backend/app/core/confirmation_tokens.py`, `backend/app/api/v1/erp_ventas.py`, `backend/app/core/documento_cliente.py`, `backend/tests/test_validez_cotizacion.py`, `backend/tests/test_confirmacion_cotizacion.py`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/app/dashboard/ventas/flujo.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/components/publico/DocumentoFactura.tsx` (la lista que manda es la de **Files** de la tarea y R10).


### U22-anticipo — Si cambia el anticipo, el cliente vuelve a confirmar

**Grupo:** Lo que ve el cliente: cotización y pedido · **Esfuerzo:** M · **Tareas del plan:** T1, T7, T17, T18, T21

**Para el usuario:** Si cambias el anticipo de una cotización que el cliente ya vio, el sistema te avisa y le pide una confirmación nueva.

**Lo que vio y aprobó el usuario:** Va junto con «Cotización del cliente en formato factura». Como ahora el cliente ve el anticipo en su cotización, el sistema te avisa antes de guardar si cambias el anticipo después de enviársela. Pasa tanto si lo ajustas a mano como si cambias la modalidad de pago de la solicitud. El aviso dice que el cliente ya vio (o confirmó) otro anticipo y que, si sigues, su confirmación se anula y hay que enviarle la cotización de nuevo. Te pide escribir la razón, como al re-cotizar. Si aceptas, la cotización vuelve a Borrador y el enlace viejo deja de servir. Así el cliente nunca confirma un anticipo distinto al que va a pagar.

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- Sin preguntas.

**Cambios (diseño):**

```text
BACKEND
1) backend/app/api/v1/erp_ventas.py, update_cotizacion (encima de T3/T4 del Bloque 1 y de H40 del Bloque 2):
   - Antes del loop: a_previo = anticipo_cotizacion(cot, db). Reemplaza la llamada a pct_anticipo_cotizacion, y pct_previo = a_previo.pct.
   - Después del bloque de recálculo: requerido_nuevo = el requerido recién calculado, o a_previo.requerido si no hubo recálculo.
   - cambia_anticipo = requerido_nuevo != a_previo.requerido.
   - hubo_cambio_de_precio = any(... PRICE_FREEZE_FIELDS ...) or cambia_anticipo.
   - Se reescribe el comentario 'H36+H43: el anticipo NO congela el precio…' con la regla nueva: el cliente ve el anticipo (U22+H38).
   - Cuando cambia_anticipo, la lista de cambios del 409 ANULA_CONFIRMACION de H40 agrega {'etiqueta':'Anticipo','antes':pesos(a_previo.requerido),'despues':pesos(requerido_nuevo)}.
   - Se compara el requerido vivo y no la columna anticipo_cop. Así un anticipo viejo mal guardado (T14) no dispara la anulación al re-cotizar sin cambios.
2) update_solicitud, bloque de H36 que recalcula las COT abiertas cuando cambia modalidad_pago. Va dentro de la transacción única de H29, en la fase de validación, antes de escribir:
   - Para cada COT abierta sin PVEN vigente calcula el requerido antes y después.
   - Si alguna está en PENDIENTE_CONFIRMACION o CONFIRMADA, su requerido cambia y no viene body['anular_confirmacion'] is True → 409 {'codigo':'ANULA_CONFIRMACION', 'mensaje': f'Cambiar la modalidad de pago cambia el anticipo de {numero} ({antes} → {despues}), que el cliente ya vio o confirmó. Si sigues, esa confirmación se anula y tendrás que enviarle la cotización de nuevo.', 'cambios':[...], 'documentos':[numeros]}. Tiene la misma forma que H40 y también exige motivo_recotizacion de 5 o más caracteres (decisión del usuario en H40).
   - Con anular_confirmacion:
     · cot.estado='BORRADOR' y gate2_confirmed_at=None.
     · revoke_pending_tokens(db,'COT',cot.id, commit=False).
     · _log(db,'COT',…,'ESTADO_CHANGED', f'Estado cambiado a Borrador: el anticipo cambió por la modalidad de pago de {sc.numero} ({antes} → {despues}). Motivo: {motivo}. La confirmación del cliente ya no es válida.', old_estado, 'BORRADOR', commit=False).
     · La SC no se toca (U15).
3) backend/app/core/confirmation_tokens.py: revoke_pending_tokens(db, document_type, document_id, commit=True). Con commit=False solo ejecuta el UPDATE, para respetar la transacción única de H29.

FRONTEND
4) frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx, saveEdit: si el error trae status 409 y detail.codigo==='ANULA_CONFIRMACION' (errorDeRespuesta de lib/avisos.js, choque C3 del Bloque 2):
   - abre la misma ventana de H40 ('Se anulará la confirmación del cliente', con el mensaje del servidor, la lista de cambios y la razón obligatoria);
   - si el usuario acepta, repite el PATCH con anular_confirmacion:true y motivo_recotizacion.
5) frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx: el control 'Ajustar anticipo' (R3, T10 del Bloque 1) maneja el 409 con esa misma ventana de H40 en lugar de mostrar el error.
```

**Pruebas (diseño):**

```text
BACKEND: nuevo backend/tests/test_anticipo_congelado.py, con el runner de ROLLBACK y monkeypatch de correo.
1) test_ajustar_anticipo_de_cot_pendiente_pide_anular
   - Prepara una SC 60/40 y una COT PENDIENTE_CONFIRMACION con total 1000000 y token. Hace PATCH {'anticipo_pct_manual':50, 'anticipo_manual_nota':'negociado con gerencia'}.
   - Afirma 409, codigo ANULA_CONFIRMACION y el cambio 'Anticipo' de '$600.000' a '$500.000'.
   - Después de db.refresh afirma que no cambió nada: manual None, estado PENDIENTE y token vivo.
2) test_ajustar_anticipo_con_anular_confirmacion: con anular_confirmacion True y motivo → 200, estado BORRADOR, gate2 None, token con used_at y anticipo_cop 500000.
3) test_cambio_que_no_toca_el_anticipo_no_anula: PATCH {'notas':'x'} → 200 y la COT sigue PENDIENTE_CONFIRMACION.
4) test_recotizar_sin_cambiar_el_requerido_no_anula: anticipo_cop guardado 0 y requerido vivo 600000; PATCH {'total_cop':1000000,'recotizacion':True} → no hay 409 por anticipo.
5) test_cambiar_modalidad_de_sc_con_cot_pendiente_pide_anular: PATCH /solicitudes/{id} {'modalidad_pago':'Contado'} → 409 con el número de la COT. La SC sigue en 60/40 y la COT queda intacta.
6) test_cambiar_modalidad_con_anular_confirmacion: con anular_confirmacion y motivo → 200, COT BORRADOR, anticipo_cop 1000000, token revocado, renglón ESTADO_CHANGED con 'el anticipo cambió por la modalidad de pago' y un solo commit (contador del runner, R7/H29).
7) test_cot_borrador_no_pide_anular: cambiar la modalidad con la COT en BORRADOR da 200 sin 409.
8) Regresión: test_anticipo_modalidad.py (H36, incluida test_recalcular_el_anticipo_no_invalida_la_confirmacion) y test_recotizar_confirmada.py (H40), completos.

FRONTEND
- npx tsc --noEmit.
- Prueba manual: cambiar la modalidad en una SC con COT pendiente y ajustar el anticipo de una COT pendiente; las dos abren la ventana de anular.
```

**Comportamiento esperado:**

```text
- Una COT en PENDIENTE_CONFIRMACION, o CONFIRMADA sin pedido vigente, también queda congelada en su anticipo. Cualquier cambio del anticipo requerido pide confirmación con razón: ajuste manual (R3), quitar el manual, cambiar la modalidad de la SC o cambiar el total.
- Si se acepta, la COT vuelve a Borrador, se revoca el enlace y se limpia la marca de Gate 2.
- Si el requerido no cambia de verdad, no hay aviso (por ejemplo, guardar la misma modalidad o re-cotizar con el mismo total).
- Las COT en Borrador, Rechazada o con pedido se comportan como hoy: se recalcula sin aviso.
- En update_solicitud, el 409 llega antes de escribir. Con la anulación aceptada, todo queda en un solo commit (H29).
```

**Datos existentes:**

```text
No se escribe nada. Esta consulta de solo lectura lista las COT pendientes o confirmadas sin pedido vigente:

SELECT c.numero, c.estado, c.total_cop, c.anticipo_cop, s.modalidad_pago FROM sales_quotations c LEFT JOIN customer_requests s ON s.id=c.sc_id WHERE c.estado IN ('PENDIENTE_CONFIRMACION','CONFIRMADA') AND NOT EXISTS (SELECT 1 FROM sale_orders v WHERE v.cot_id=c.id AND v.estado<>'CANCELADO');

En Python se compara su anticipo guardado con anticipo_cotizacion. El cliente verá el anticipo de hoy. La T14 del Bloque 1 ya recalcula los desactualizados, con OK.
```

**Riesgos:**

```text
- Cambia una regla escrita en el Bloque 1 (H36): el anticipo vuelve a congelar la confirmación. Las pruebas de H36 siguen pasando porque comparan el requerido vivo, pero el comentario y el riesgo de H36 quedan reemplazados.
- update_solicitud tiene seis dueños en el Bloque 1 y U15/U18 en el Bloque 2. Este cambio va dentro del bloque de H36, respetando la transacción única de H29 (por eso revoke_pending_tokens recibe commit=False).
- Si H40 cambia el nombre de los campos (anular_confirmacion, motivo_recotizacion), aquí se usa el mismo.
```

**Depende de:**

```text
- U22+H38: es lo que hace visible el anticipo.
- Bloque 1: H36+H43/R2/R3 (anticipo_cotizacion; bloque de modalidad en update_solicitud), H29 (una sola transacción) y T10 (control 'Ajustar anticipo').
- Bloque 2: H40 (409 ANULA_CONFIRMACION y su ventana), H49 (errorDeRespuesta) y U15 (la SC no se toca).
```

**Archivos que nombra el diseño:** `backend/app/api/v1/erp_ventas.py`, `backend/app/core/confirmation_tokens.py`, `backend/tests/test_anticipo_congelado.py`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx` (la lista que manda es la de **Files** de la tarea y R10).


### U23 — Enviar el pedido al cliente como confirmación

**Grupo:** Lo que ve el cliente: cotización y pedido · **Esfuerzo:** L · **Tareas del plan:** T1, T5, T7, T8, T9, T12, T15, T16, T19, T21

**Para el usuario:** Puedes enviarle al cliente la confirmación de su pedido, en formato factura, con lo que ya pagó y lo que le falta, desde un enlace de solo lectura.

**Lo que vio y aprobó el usuario:** En el pedido de venta aparece el botón «Enviar al cliente». Eliges WhatsApp, correo u otro, y el cliente recibe un enlace a la confirmación de su pedido. Tiene el mismo formato de factura de la cotización:
- productos con cantidad, precio y total;
- subtotal, IVA y total;
- la forma de pago;
- lo que ya pagó (por ejemplo «Anticipo $600.000 · Transferencia · 3 oct 2026»);
- en grande, lo que le falta pagar.
Si pagó menos anticipo del que tocaba, lo ve en amarillo. Solo puede mirar: no hay botones para cambiar nada, pero puede imprimirla, guardarla en PDF y escribirles por WhatsApp. Puede abrir el enlace las veces que quiera mientras esté vigente. Si lo reenvías, el anterior deja de servir, y si cancelas el pedido, deja de abrir. En el pedido verás cuándo se envió y hasta cuándo sirve el enlace, y cada envío queda en la Actividad. Para que salga por WhatsApp sin que tú lo abras, hace falta el envío automático por Chatwoot, con la plantilla aprobada por Meta. Mientras tanto se abre WhatsApp con el mensaje listo, como en la cotización.

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- ¿Cuándo le llega al cliente la confirmación de su pedido? → **Cuando el asesor pulsa «Enviar al cliente» en el pedido** (= recomendada)
- (Pregunta del diseño no mostrada) ¿Hasta cuándo puede el cliente abrir el enlace de su pedido? → quitada por el crítico: se aplica la recomendada (R6): «30 días desde que se envía (puedes reenviarle uno nuevo cuando quieras)».

**Cambios (diseño):**

```text
BACKEND
1) backend/app/core/confirmation_tokens.py (se apoya en U22+H38 y U22-validez):
   - TIPOS_CONSULTA = ('PVEN',).
   - Nueva ultimo_enlace_vigente(db, document_type, document_id) -> DocumentConfirmationToken|None: el más nuevo con used_at IS NULL y expires_at > ahora.
2) backend/app/api/v1/erp_ventas.py: nuevo POST /pedidos/{ven_id}/enviar-al-cliente, enviar_pedido_al_cliente(ven_id, body: dict = Body(default_factory=dict), user = require_roles(*ROLE_ADMIN, *ROLE_ASESOR), db).
   - Respuestas de error:
     · 404 si el pedido no existe.
     · 409 'El pedido está cancelado: no se puede enviar al cliente.' si está CANCELADO.
     · 400 'El pedido no tiene productos ni total; no hay nada que enviar.' si no tiene productos o el total es ≤ 0.
   - canal = _canal_de_envio(body, so.customer_email) (H27: 422 si el canal no es válido; 400 si es Email y no hay correo). Se valida ANTES de tocar tokens.
   - revoke_pending_tokens(db,'PVEN',so.id) y luego raw = create_confirmation_token(db,'PVEN',so.id, expires_at=vence_al_final_del_dia(hoy en Colombia + DIAS_ENLACE_PEDIDO)), con DIAS_ENLACE_PEDIDO = 30. Si la decisión enlace_pedido_dura es la opción 1, son 3650 días.
   - link = f'{FRONTEND_URL}/pedido/{raw}', con el mismo FRONTEND_URL de la SC y la COT.
   - correo_res = _enviar_correo_confirmacion(so.customer_email, f'Confirmación de tu pedido {so.numero}', html) (H27). El html lleva saludo, total, pagado y saldo con pesos(), y el enlace. El asunto lleva el nombre de la empresa de MARCA si existe.
   - WhatsApp: si canal=='WhatsApp' y U16-envio dejó el helper de envío por Chatwoot, se llama con 'Hola {nombre}, esta es la confirmación de tu pedido {numero}: {link}' dentro de try/except. El resultado va en 'whatsapp': {enviado, motivo} y un fallo no deshace el envío. Sin ese helper, el frontend abre wa.me como en la COT.
   - _log(db,'VEN',so.id,so.numero,'ENVIADO_AL_CLIENTE', f'Confirmación del pedido enviada al cliente{(" " + CANALES_ENVIO[canal]) if canal else ""}', user_name=body.get('user_name') or user.email, extra_data={'canal', 'correo':{enviado,destino,motivo}, 'vence', 'cambios': _detalle_envio(canal, correo_res) + [{'etiqueta':'Enlace vigente hasta','despues':'dd/mm/aaaa'}]}). Si ya había un envío, el texto dice 'reenviada'.
   - Respuesta: {'status':'success','link','canal','correo','vence','whatsapp'}. El estado del pedido no cambia.
3) get_pedido: d['enlace_cliente'] = {'enviado_at':iso+'Z', 'vence_at':iso+'Z', 'vigente':True} con ultimo_enlace_vigente. Si no hay uno vigente: {'vigente':False, 'enviado_at': fecha del último renglón ENVIADO_AL_CLIENTE o None}. Nunca devuelve el token.
4) backend/app/core/documento_cliente.py: pedido_para_cliente(so, db). Carga la SC (so.sc_id) y la COT (so.cot_id) una sola vez y arma:
   - tipo 'PVEN', numero, fecha (created_at en día de Colombia).
   - cliente {nombre, direccion: direccion_entrega o customer_address}, cot_numero, fecha_entrega_estimada.
   - lineas = lineas_cliente(so.productos).
   - totales = totales_cliente(lineas, so.descuento_pct, so.total_cop, impuestos de IVA).
   - forma_pago {modalidad: sc.modalidad_pago, pct: anticipo_pct_snapshot}.
   - resumen {total, pagado = total − saldo redondeado, saldo, anticipo_requerido, anticipo_pendiente}, calculado con anticipo_del_pedido(so): la misma cuenta que get_pedido.
   - pagos = pagos_para_cliente(...): SaleOrderPayment CONFIRMADO de tipo TIPOS_PAGO_INGRESO o DEVOLUCION, ordenados por fecha, cada uno {concepto, monto, metodo, fecha}. Conceptos:
     · ANTICIPO → 'Anticipo'; ABONO → 'Abono'; PAGO_SALDO → 'Pago del saldo'; PAGO_TOTAL → 'Pago total'.
     · método TRASLADO → 'Saldo a favor de tu pedido anterior', sin método.
     · método CONVERSION_COTIZACION → 'Anticipo registrado', sin método.
     · DEVOLUCION → 'Devolución', en negativo.
     · Nunca referencia_bancaria, usuario, notes ni ids.
   - notas = notas_cliente(sc, cot, so).
   - empresa = datos_empresa_publicos(db).
5) backend/app/api/v1/confirmacion_publica.py:
   - Nuevo POST /pedido-cliente/ver, ver_pedido_cliente(body: TokenBody, db).
   - tok = leer_token_vigente(db, body.token, tipos=('PVEN',)) y luego el SaleOrder por id.
   - Si no hay token, no hay pedido o so.estado=='CANCELADO' → 400 GENERIC_ERROR, sin distinguir.
   - Devuelve {'status':'success','data': pedido_para_cliente(so, db)}. NO consume el token.
   - /confirmar/ver, /confirmar/confirmar y /confirmar/pedir-cambios usan tipos=('SC','COT').
6) Solo si envio_pedido es la opción 1 (automático):
   - En confirmar_cotizacion (erp_ventas.py), después de que convertir_cotizacion_a_venta devuelve el pedido y se mueve el lead, se llama la misma lógica interna (_enviar_pedido_al_cliente(db, so, canal=cot.canal_envio, user)).
   - Va en try/except con logger.error y nunca deshace el pedido. El resultado va en 'envio_cliente'.

FRONTEND
7) frontend/src/app/dashboard/ventas/venta/[id]/page.tsx (PedidoVentaDetalleContent):
   - Botón 'Enviar al cliente' (icono Send) en la cabecera, antes de 'Crear PXP', si el estado no es CANCELADO. Dice 'Reenviar al cliente' si pedido.enlace_cliente?.vigente.
   - Abre ChannelModal (de cotizacion-client.tsx) con documentLabel='confirmación del pedido', customerHasPhone y customerEmail (H27).
   - Nueva función enviarAlCliente(): POST /ventas/pedidos/{id}/enviar-al-cliente {user_name: currentUser, canal}.
     · Si el canal es WhatsApp y la respuesta no trae whatsapp.enviado: window.open de wa.me con 57 + teléfono (H5) y el mensaje.
     · Recarga el pedido y abre EnlaceConfirmacionModal con tipo='consulta', vence, correo y canal.
     · Los errores se muestran dentro de la ventana (H49).
   - Bajo el título del Resumen Financiero: 'Enviado al cliente el 03/10/2026 · el enlace sirve hasta el 02/11/2026', o 'El enlace del cliente venció: reenvíaselo'.
   - ACTIVITY_STYLE['ENVIADO_AL_CLIENTE'] = '#4f46e5'.
8) frontend/src/app/dashboard/ventas/flujo.tsx, EnlaceConfirmacionModal: prop tipo?: 'confirmacion'|'consulta', 'confirmacion' por defecto. Con 'consulta':
   - título 'Enlace del pedido listo';
   - subtítulo 'El cliente ve su pedido, lo que ha pagado y lo que le falta';
   - texto 'Puede abrirlo las veces que quiera hasta el {fecha}. Si lo reenvías, el enlace anterior deja de servir; si cancelas el pedido, deja de abrir.';
   - sin la nota 'Solo el cliente debería confirmar'.
   Convive con correo/canal (H27), vence (U22-validez) y copiar (H30).
9) Nuevo frontend/src/app/pedido/[token]/page.tsx, PedidoClientePage:
   - Llama postPublico('/pedido-cliente/ver', {token}) y muestra un spinner mientras carga.
   - Si hay error, muestra la pantalla genérica de enlace no válido (la de U17+H28) con el contacto de la empresa.
   - Con datos, muestra DocumentoFactura con titulo 'PEDIDO DE VENTA', 'Según cotización COT-…' y la entrega estimada.
   - En extraDerecha va ResumenPagosCliente:
     · 'Pagado $X' y 'Saldo pendiente $Y', en grande;
     · la lista de pagos (concepto · medio · fecha · monto);
     · si anticipo_pendiente > 0, el aviso ámbar 'Anticipo pendiente: $Z'.
   - Botones: 'Imprimir o guardar PDF' y 'Escríbenos por WhatsApp' (si la empresa tiene WhatsApp). No hay botones de confirmar ni de cambios.
10) Nuevo frontend/src/app/pedido/layout.tsx: metadata {title:'Tu pedido', robots:{index:false, follow:false}, referrer:'no-referrer'}.
11) frontend/src/lib/documento-cliente.js:
   - resumenPagosCliente(resumen). Reusa lib/resumen-pago.js de U24 si sus entradas coinciden (total, saldo, anticipo_requerido, anticipo_pendiente).
   - textoEnlaceVigente(enlace).
12) frontend/tests/test_documento_cliente.mjs: casos de pagos (traslado y pago parcial) y de textoEnlaceVigente.
```

**Pruebas (diseño):**

```text
BACKEND: nuevo backend/tests/test_pedido_enlace_cliente.py, con el runner de ROLLBACK (trae vendedor_token y monkeypatch, R7) y sin parametrize. En TODAS se hace monkeypatch de app.core.email.smtp_configurado/send_email con un fake que registra las llamadas, y del envío de WhatsApp de U16 si existe. Nunca se llama a servicios reales.
1) test_asesor_envia_el_pedido_y_recibe_el_enlace
   - Prepara un PVEN PENDIENTE_COMPRA con customer_email, productos con costos, total 1000000, saldo 400000 y snapshot 60, más un pago ANTICIPO CONFIRMADO de 600000 (Transferencia bancaria, ref 'BANCOL-123', usuario 'verificador@x').
   - Hace POST enviar-al-cliente {'canal':'WhatsApp','user_name':'asesor@test'} con vendedor_token.
   - Afirma 200, '/pedido/' en json['link'] y que el fake de correo se llamó 1 vez con to == customer_email.
   - Afirma un token 'PVEN' con used_at None y expires_at = fin del día de hoy + 30.
   - Afirma un renglón VEN 'ENVIADO_AL_CLIENTE' con 'por WhatsApp' y que el estado del pedido no cambió.
2) test_ver_pedido_muestra_lo_pagado_y_el_saldo_sin_datos_internos
   - Hace POST /api/v1/pedido-cliente/ver y afirma 200.
   - resumen == {total 1000000, pagado 600000, saldo 400000, anticipo_requerido 600000, anticipo_pendiente 0}.
   - pagos == [{'concepto':'Anticipo','monto':600000,'metodo':'Transferencia bancaria','fecha':…}].
   - En resp.text NO aparecen 'BANCOL-123', 'verificador@x', customer_email, customer_phone, 'cost_usd', 'margen' ni 'total_cost_cop'.
3) test_ver_no_gasta_el_enlace: dos vistas, las dos con 200.
4) test_reenviar_anula_el_enlace_anterior: el token viejo da 400 y el nuevo 200; el renglón dice 'reenviada'.
5) test_pedido_cancelado: con estado CANCELADO, ver con el token vivo da 400 genérico y enviar da 409.
6) test_token_de_pedido_no_confirma_ni_se_gasta: /confirmar/confirmar y /confirmar/pedir-cambios con el token PVEN dan 400, y después /pedido-cliente/ver sigue en 200 (used_at None).
7) test_token_de_cot_no_abre_el_pedido: un token COT da 400 en /pedido-cliente/ver y sigue sirviendo en /confirmar/ver.
8) test_email_sin_correo_es_400_y_no_crea_enlace.
9) test_canal_invalido_es_422.
10) test_anticipo_parcial_se_ve_pendiente (R4): pago de 500000 con requerido de 600000 → anticipo_pendiente 100000.
11) test_pago_trasladado_se_ve_como_saldo_a_favor (R6): un pago con método TRASLADO sale con concepto 'Saldo a favor de tu pedido anterior' y metodo None.
12) test_get_pedido_expone_estado_del_enlace_sin_token: enlace_cliente.vigente True, con enviado_at y vence_at terminados en 'Z'; el token crudo no está en el JSON.
13) Solo con la opción 1 de envio_pedido: test_crear_pedido_envia_la_confirmacion_y_un_fallo_no_rompe_el_pedido. Con un monkeypatch del envío que lanza una excepción, POST /cotizaciones/{id}/confirmar con verificación de anticipo da 200 y el PVEN existe.

FRONTEND
- test_documento_cliente.mjs: conceptos de pago, resumen con anticipo pendiente y textoEnlaceVigente.
- npx tsc --noEmit.
- Capturas con Playwright de /pedido/{token} a 1440 px y a 375 px, para la página de revisión del usuario.
```

**Comportamiento esperado:**

```text
- POST /api/v1/ventas/pedidos/{id}/enviar-al-cliente lo pueden usar Administración o el asesor. Crea un enlace de consulta y lo manda por el canal elegido, con correo de respaldo (H27). No cambia el estado del pedido.
- SEGURIDAD DEL ENLACE:
  (a) Token aleatorio de 256 bits (secrets.token_urlsafe(32)). En la base solo queda su hash SHA-256, en document_confirmation_tokens con tipo 'PVEN'. Nunca va a logs. La API lo recibe en el body y nunca en su URL (Round 7). La página /pedido/{token} sí lo lleva en la URL, igual que /reset-password.
  (b) Es de consulta: verlo no lo gasta. Vence según la decisión (30 días), se revoca al reenviar y deja de abrir si el pedido se cancela. El estado del pedido se revisa en cada vista, aunque el token no se haya revocado.
  (c) Separado por tipo: /confirmar/* solo acepta SC y COT, y /pedido-cliente/ver solo PVEN. Un token de pedido no confirma nada ni se gasta por error.
  (d) Lista blanca de datos: número, fecha, nombre del cliente, dirección de entrega, cotización de origen, entrega estimada, líneas, totales, forma de pago, pagos (concepto, medio, fecha y monto), resumen y notas según la decisión. Nunca teléfono, correo, costos, márgenes, utilidad, referencia bancaria, quién verificó, PXP, PEC ni motivos de cancelación.
  (e) El error genérico es el mismo para token inexistente, vencido, revocado o pedido cancelado.
  (f) La página no se indexa, no envía Referer y no carga recursos de terceros, salvo el logo.
  (g) Se descartó un enlace firmado (HMAC/JWT): no se puede revocar uno por uno ni saber cuándo se envió.
- Números:
  · pagado = total − saldo, la misma cuenta que get_pedido y anticipo_del_pedido.
  · Si pagó menos de lo requerido, aparece 'Anticipo pendiente' (R4).
  · Los pagos TRASLADO salen como 'Saldo a favor de tu pedido anterior' (R6).
- Es en vivo: muestra los pagos y el saldo de hoy.
- En el pedido interno:
  · el botón 'Enviar al cliente' o 'Reenviar al cliente';
  · el modal del enlace en modo consulta;
  · la línea 'Enviado el … · sirve hasta el …';
  · la Actividad registra cada envío con canal, correo y vencimiento.
```

**Datos existentes:**

```text
No se escribe nada. Los pedidos con el pago automático 'CONVERSION_COTIZACION' (anterior a N1) mostrarían ese pago como 'Anticipo registrado' mientras la T14 del Bloque 1 no los resuelva. Consulta de solo lectura (la de N1):

SELECT v.numero, v.estado, p.monto FROM sale_order_payments p JOIN sale_orders v ON v.id=p.sale_order_id WHERE p.metodo_pago='CONVERSION_COTIZACION' AND p.estado='CONFIRMADO';

Los pedidos cancelados no se pueden enviar.
```

**Datos del usuario:**

```text
Algunos pedidos viejos tienen un anticipo que el sistema registró solo, sin verificar. Al cliente se le mostrará como «Anticipo registrado» hasta que se corrija en la limpieza del Bloque 1.
```

**Riesgos:**

```text
- Si el cliente reenvía el enlace, quien lo reciba ve su pedido (nombre, dirección, productos y montos). Lo limitan los datos mínimos, el vencimiento, la revocación, noindex y no-referrer. La app no tiene límite de intentos, pero adivinar 256 bits no es viable; un límite en el proxy de EasyPanel queda fuera de alcance.
- La página es en vivo. Si se re-cotiza y se propaga al pedido, el cliente ve los montos nuevos sin aviso; el cambio queda en la Actividad.
- Los pagos 'CONVERSION_COTIZACION' sin resolver (T14) se ven como 'Anticipo registrado'.
- En pedidos viejos con centavos y pagos (R1 no los redondea), el unitario × cantidad puede diferir en $1 del total de la línea. Los totales sí suman, con 'Ajuste por redondeo'.
- El envío automático por WhatsApp depende de U16-envio y, fuera de la ventana de 24 h, de una plantilla aprobada por Meta.
- Con la opción 'sin vencimiento', los enlaces quedan vivos por meses.
- venta/[id]/page.tsx tiene muchos dueños (Bloque 1 T10, U24, H37, H49 y U6): hace falta un solo dueño del archivo.
```

**Depende de:**

```text
- U22+H38: DocumentoFactura, documento_cliente.py, documento-cliente.js, publico.ts y tipos de token.
- U22-validez: expires_at en create_confirmation_token y vence_al_final_del_dia.
- H27+H39: _canal_de_envio, _enviar_correo_confirmacion, _detalle_envio, ChannelModal con customerEmail y props correo/canal del modal.
- H30: el mismo modal.
- U16-envio: WhatsApp automático por Chatwoot.
- MARCA e IVA.
- U17+H28: pantalla de enlace no válido.
- Bloque 1: N1/R4/R6 (pagos, anticipo_del_pedido, TRASLADO), H42, H45 (cancelación) y H5 (+57).
- Bloque 2: U24 (resumen-pago.js y Resumen Financiero), H37 (cabecera del PVEN), H49 (errores en ventana) y U6+H22 (panel derecho).
```

**Archivos que nombra el diseño:** `backend/app/core/confirmation_tokens.py`, `backend/app/core/documento_cliente.py`, `backend/app/api/v1/confirmacion_publica.py`, `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_pedido_enlace_cliente.py`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/flujo.tsx`, `frontend/src/app/pedido/[token]/page.tsx`, `frontend/src/app/pedido/layout.tsx`, `frontend/src/lib/documento-cliente.js`, `frontend/tests/test_documento_cliente.mjs` (la lista que manda es la de **Files** de la tarea y R10).


### U16-envio — WhatsApp automático desde el número de la empresa

**Grupo:** Envío automático por WhatsApp · **Esfuerzo:** L · **Tareas del plan:** T1, T8, T13, T16, T17, T18, T19, T21

**Para el usuario:** Al enviar una SC, COT o PVEN por WhatsApp, el sistema manda el mensaje con el enlace por medio de Chatwoot desde el número de WhatsApp Business de la empresa. Si el cliente escribió en las últimas 24 horas, va un mensaje normal. Si no, se usa la plantilla aprobada por Meta. Si no se puede, el asesor ve el motivo y un botón para mandarlo a mano. Todo queda en la Actividad: canal, número, mensaje (sin el código secreto del enlace) y resultado. El token de Chatwoot vive solo en el servidor.

**Lo que vio y aprobó el usuario:** Cuando eliges WhatsApp al enviar una solicitud, una cotización o un pedido, el mensaje con el enlace le llega solo al cliente desde el WhatsApp de la empresa. Ya no se abre tu WhatsApp para copiar y pegar. En la ventana del enlace ves en verde a qué número salió. Si no pudo salir, por ejemplo porque el cliente no te ha escrito en las últimas 24 horas y todavía no hay una plantilla aprobada, la ventana te dice por qué y trae el botón «Abrir WhatsApp con el mensaje» para que lo mandes tú. En la Actividad quedan el canal, el número, el mensaje enviado y si salió. El correo de respaldo sigue igual. Mientras el envío automático esté apagado, todo funciona como hoy. Para encenderlo tendrás que cargar tres cosas: 1) en EasyPanel, los datos de conexión de Chatwoot: la dirección, el número de cuenta y el token de un usuario de Chatwoot que tenga acceso a la bandeja de WhatsApp. 2) En la Configuración del Hub de Ventas, el número de esa bandeja en Chatwoot y el interruptor «Enviar automáticamente por WhatsApp». 3) En Meta, una plantilla creada con el texto que te muestra esa misma pantalla. Cuando Meta la apruebe, escribes su nombre ahí. Sin la plantilla, el mensaje automático solo les llega a los clientes que te escribieron en las últimas 24 horas. A los demás se lo mandas tú con el botón.

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- Si el WhatsApp automático no logra salir, ¿la solicitud o cotización pasa igual a «Pendiente por confirmación»? → **Sí: el enlace ya sirve, el asesor lo manda a mano con el botón y queda anotado que el automático no salió** (= recomendada)
- (Pregunta del diseño no mostrada) Con el envío automático encendido, ¿el asesor puede elegir mandarlo él desde su propio WhatsApp? → quitada por el crítico: se aplica la recomendada (R5): «No: siempre sale desde el WhatsApp de la empresa, así todo queda en Chatwoot y en la Actividad».

**Cambios (diseño):**

```text
BACKEND
1) NUEVO backend/app/core/telefonos.py (puro):
   - numero_whatsapp(telefono) -> str|None. Misma regla que frontend/src/lib/whatsapp.js (H5): deja solo dígitos, quita un '00' inicial, a 10 dígitos les antepone '57' y si queda vacío devuelve None.
   - e164_whatsapp(telefono) -> str|None: '+' + numero_whatsapp cuando tiene entre 11 y 15 dígitos. Si no, None: un número de 9 dígitos no es válido.
   - telefono_legible(e164) -> '+57 300 123 4567' (otros indicativos quedan tal cual).
2) NUEVO backend/app/core/chatwoot.py. Cliente HTTP mínimo con urllib, igual que chat.py, sin dependencias nuevas.
   - Excepciones: ChatwootNoConfigurado, ChatwootError(status, detalle) y ChatwootSinRespuesta(ChatwootError).
   - config_chatwoot() lee os.environ EN CADA LLAMADA (así las pruebas pueden usar monkeypatch).
     - CHATWOOT_BASE_URL no tiene valor por defecto en este módulo; el host real deja de estar en el código.
     - CHATWOOT_API_TOKEN.
     - CHATWOOT_ACCOUNT_ID es entero, con 1 por defecto como en chat.py.
     - Si falta la URL o el token, lanza ChatwootNoConfigurado. Exige https://, salvo para localhost.
   - _peticion(metodo, ruta, cuerpo=None, params=None, timeout=6) -> dict es el ÚNICO punto que toca la red; las pruebas lo reemplazan.
     - Manda el header api_access_token.
     - HTTPError → ChatwootError(status, cuerpo recortado a 300 caracteres y sin el token).
     - Timeout → ChatwootSinRespuesta. Otro URLError → ChatwootError(None, 'no se pudo conectar con Chatwoot').
     - Nunca registra en el log el token ni el texto del mensaje.
   - Funciones, con rutas relativas a /api/v1/accounts/{cuenta}:
     - buscar_contacto(e164): GET contacts/search?q=<últimos 10 dígitos>. Devuelve el primer contacto cuyo phone_number tenga los mismos dígitos, o None.
     - crear_contacto(inbox_id, nombre, e164, email): POST contacts → (contact_id, source_id).
       - Si el 422 es por teléfono repetido, vuelve a buscar.
       - Si es por correo repetido, reintenta una vez sin el correo.
     - source_id_en_bandeja(contacto, inbox_id, e164): toma el contact_inbox de esa bandeja. Si no lo hay, POST contacts/{id}/contact_inboxes {inbox_id, source_id: dígitos}.
     - conversacion_reciente(contact_id, inbox_id): GET contacts/{id}/conversations → la de mayor last_activity_at en esa bandeja, o None.
     - enviar_mensaje(conv_id, contenido, template_params=None): POST conversations/{id}/messages {content, message_type:'outgoing', private:false, template_params?}.
     - crear_conversacion(inbox_id, contact_id, source_id, contenido, template_params): POST conversations {source_id, inbox_id, contact_id, status:'open', message:{content, template_params}} → (conv_id, message_id|None).
     - mensajes(conv_id): GET conversations/{id}/messages.
     - bandeja(inbox_id): GET inboxes/{id}.
   - chat.py NO se toca: _send_to_chatwoot y sus constantes siguen igual, y test_chat_chatwoot_token.py sigue verde.
3) NUEVO backend/app/core/envio_whatsapp.py (sin FastAPI):
   - Claves en admin_config:
     - envio_whatsapp_automatico: 'true'/'false', 'false' por defecto.
     - envio_whatsapp_inbox_id.
     - envio_whatsapp_plantilla.
     - envio_whatsapp_idioma: 'es' por defecto.
   - leer_config(db). estado_config(db) -> {automatico, listo, plantilla_configurada, motivo_texto}, sin token ni URL.
   - Constantes:
     - NOMBRE_DOCUMENTO = {'SC':'solicitud','COT':'cotización','PVEN':'pedido'}.
     - CATEGORIA_PLANTILLA = 'UTILITY'.
     - TEXTO_PLANTILLA = 'Hola {{1}}, te escribimos de {{2}}. Puedes revisar y confirmar tu {{3}} en este enlace: {{4}} Si tienes alguna pregunta, responde este mensaje.' Empieza y termina en texto y no tiene variables pegadas, como exige Meta.
     - MOTIVOS, con los textos exactos que están en 'comportamiento'.
   - texto_libre(doc_tipo, nombre, empresa, numero, enlace, total_cop=None). El total va con ventas_dinero.pesos (H42).
   - parametros_plantilla(...) -> {'1': nombre o 'cliente', '2': empresa, '3': '<nombre del documento> <número>', '4': enlace}. Sin saltos de línea y con los espacios colapsados.
   - ocultar_enlace(texto, enlace) cambia el enlace por '[enlace de confirmación]'.
   - enviar_documento(db, *, doc_tipo, doc_id, doc_numero, cliente_nombre, cliente_email, telefono, enlace, total_cop=None, user_name, proposito='CONFIRMACION') -> dict. Pasos en orden:
     (a) lee la config; si el automático está apagado → ENVIO_AUTOMATICO_APAGADO, sin llamar a Chatwoot;
     (b) config_chatwoot(), o CHATWOOT_NO_CONFIGURADO;
     (c) sin inbox → BANDEJA_NO_CONFIGURADA;
     (d) e164_whatsapp, o TELEFONO_INVALIDO;
     (e) busca o crea el contacto y busca su conversación reciente en la bandeja;
     (f) si la conversación existe y can_reply es True → modo TEXTO con enviar_mensaje;
     (g) si no, y hay plantilla → modo PLANTILLA, con enviar_mensaje en la conversación existente o con crear_conversacion. Lleva template_params {name, category:'UTILITY', language, processed_params} y content = TEXTO_PLANTILLA ya rellenado;
     (h) si no hay plantilla → FUERA_DE_VENTANA_SIN_PLANTILLA y no se envía nada. Si can_reply no viene en la respuesta, se trata como False.
   - Tiempo:
     - Plazo total de 12 s (time.monotonic). Cada llamada usa timeout=min(6, tiempo restante).
     - Si el plazo se agota antes del POST final → CHATWOOT_SIN_RESPUESTA.
     - ChatwootError → FALLO_CHATWOOT con su detalle. ChatwootSinRespuesta en el POST final → CHATWOOT_SIN_RESPUESTA ('puede que haya salido').
   - Siempre agrega una fila EnvioAlCliente (db.add + flush, sin commit) con el resultado, los ids de Chatwoot y mensaje = ocultar_enlace(texto). NUNCA guarda el enlace con su token.
   - Devuelve {enviado, estado ('ENVIADO'|'NO_ENVIADO'), modo, destino, destino_legible, motivo, texto_resultado, mensaje (sin el enlace), detalle, envio_id, texto_manual}. texto_manual lleva el enlace y solo viaja en la respuesta HTTP.
4) NUEVO backend/app/models/envios.py: EnvioAlCliente, __tablename__='envios_al_cliente'. Se registra en app/models/__init__.py. Columnas:
   - id;
   - document_type String(10), document_id Integer, document_numero String(50);
   - proposito String(20), por defecto 'CONFIRMACION';
   - canal String(20), destino String(200);
   - modo String(20) NULL, plantilla String(100) NULL;
   - mensaje Text, estado String(20), motivo String(40) NULL, detalle Text NULL;
   - chatwoot_conversation_id String(50) NULL, chatwoot_message_id String(50) NULL;
   - user_name String(150) NULL;
   - created_at y updated_at (UTC ingenuo, que se serializa con 'Z').
5) NUEVA migración aditiva backend/alembic/versions/fa6_0NN_envios_al_cliente.py: create_table y el índice (document_type, document_id).
   - down_revision es la cabeza real; verificarla con 'alembic heads'. El Bloque 2 llega a fa6_025 y otros grupos del Bloque 3 también agregan migraciones, así que el número lo fija el cruce.
6) backend/app/api/v1/erp_ventas.py, sobre los helpers de H27+H39:
   - _canal_de_envio(body, customer_email, customer_phone=None): si canal=='WhatsApp' y numero_whatsapp(customer_phone) es None → 400 'El cliente no tiene un teléfono de WhatsApp válido: elige Email u Otro, o corrige su teléfono antes de enviar.' Ocurre antes de revocar o crear tokens, como el 400 de Email.
   - Helper nuevo _enviar_whatsapp(db, doc_tipo, doc, enlace, user_name) -> dict.
     - Teléfono: doc.customer_phone, o Customer.phone si el documento no lo tiene.
     - Empresa: el nombre de la empresa de MARCA, con 'Nebulae' de respaldo.
     - total_cop solo para COT y PVEN.
     - Llama a envio_whatsapp.enviar_documento.
   - _detalle_envio(canal, correo_res, wa_res=None): después de 'Canal de envío' agrega {'etiqueta':'WhatsApp','despues': wa_res['texto_resultado']} y, si hay mensaje, {'etiqueta':'Mensaje','despues': wa_res['mensaje']}. Luego va el renglón de correo de H27. Sin clave 'campo'.
   - enviar_solicitud_para_confirmacion y enviar_cotizacion_para_confirmacion:
     - Pasan customer_phone a _canal_de_envio.
     - Después del commit del cambio de estado, si canal=='WhatsApp', primero wa_res = _enviar_whatsapp(...) y después el correo de H27.
     - El _log recibe extra_data['whatsapp'] = {enviado, estado, modo, destino, motivo, envio_id} y los renglones de _detalle_envio. Su commit guarda también la fila EnvioAlCliente.
     - La respuesta agrega 'whatsapp': wa_res.
   - El endpoint de envío del PVEN que crea U23 usa estos mismos tres helpers.
7) NUEVO backend/app/api/v1/envio_cliente.py: router propio montado en main.py con prefix '/api/v1/ventas', igual que erp_ventas_fase4.
   - GET /envio-cliente/whatsapp/estado (ADMIN, ASESOR) → estado_config.
   - GET /envio-cliente/whatsapp/config (ADMIN) → {automatico, inbox_id, plantilla, idioma, servidor_configurado: bool, texto_plantilla, categoria:'UTILITY', ejemplo_parametros}. Nunca devuelve el token ni la URL.
   - PUT /envio-cliente/whatsapp/config (ADMIN). Valida y responde 422 en español:
     - inbox_id: entero > 0.
     - plantilla: ^[a-z0-9_]{1,512}$, con el mensaje 'El nombre de la plantilla solo puede tener minúsculas, números y guion bajo, igual que en Meta.'
     - idioma: ^[a-z]{2}(_[A-Z]{2})?$.
     - Para encender el automático hace falta inbox_id: 'Para encender el envío automático falta el número de la bandeja de WhatsApp.'
     - Guarda en admin_config con el mismo upsert parametrizado de update_config.
   - POST /envio-cliente/whatsapp/probar (ADMIN): chatwoot.bandeja(inbox_id) → {ok, bandeja, es_whatsapp, plantilla: 'APROBADA'|'NO_ENCONTRADA'|'NO_VERIFICABLE'}. La plantilla se revisa en message_templates de la bandeja, si viene. No envía mensajes.
8) main.py: importar envio_cliente y agregar su include_router.
9) backend/tests/rollback_runner.py: agregar 'envios_al_cliente' a TABLAS, para detectar fugas.

FRONTEND
10) NUEVO frontend/src/lib/envio-whatsapp.js (puro): avisoWhatsApp(wa, canal) -> null | {tono:'ok'|'info'|'alerta', texto, botonManual}.
11) frontend/src/lib/aviso-correo.js (H27): avisoCorreo(correo, canal, whatsappEnviado=false). Si el correo no salió pero el WhatsApp sí, tono 'info' con '… El WhatsApp sí salió.' Sin el tercer parámetro no cambia nada.
12) flujo.tsx, EnlaceConfirmacionModal: props opcionales whatsapp y telefono.
   - Recuadro de WhatsApp antes del de correo: verde, azul o ámbar según avisoWhatsApp.
   - Si whatsapp.enviado, el párrafo inicial dice 'El sistema ya le envió este enlace al cliente por WhatsApp. Puedes copiarlo si también quieres mandarlo por otro medio.'
   - Si botonManual: enlace 'Abrir WhatsApp con el mensaje' con waUrl(telefono, whatsapp.texto_manual) (H5).
13) cotizacion-client.tsx, ChannelModal: prop opcional envioWhatsApp {automatico, listo}.
   - Debajo de la opción WhatsApp: si listo, 'Sale automáticamente desde el WhatsApp de la empresa.'; si está automático pero no listo, 'El envío automático no está listo: se abrirá WhatsApp para que lo mandes tú.'
   - 'WhatsApp (sin telefono)' pasa a 'WhatsApp (sin teléfono válido)'. Los que llaman al modal calculan customerHasPhone con !!numeroWhatsApp(phone).
14) solicitud/[id]/page.tsx (handleEnviarParaConfirmacion, enviarParaConfirmacion) y cotizacion/[id]/page.tsx (confirmarEnvio):
   - Al abrir el ChannelModal: GET /ventas/envio-cliente/whatsapp/estado (si falla, null).
   - Después del POST, wa = d?.whatsapp. Solo se abre wa.me si el canal es WhatsApp y wa no vino o trae ENVIO_AUTOMATICO_APAGADO. Se abre con waUrl(phone, wa?.texto_manual || texto local).
   - setConfirmWhatsapp(wa ?? null) antes de setSelectedChannel(null). Al modal se le pasan whatsapp y telefono, y avisoCorreo recibe whatsappEnviado.
15) page.tsx (Hub): hubEnlace (H27) guarda también whatsapp y telefono, y usa el mismo modal.
16) NUEVO frontend/src/app/dashboard/ventas/config-envio-whatsapp.tsx, ConfigEnvioWhatsApp: sección dentro de ConfigPanel del Hub.
   - Solo para administrador. Con N8 en soloLectura se ve una sola línea: 'Envío automático por WhatsApp: encendido/apagado'.
   - Campos: interruptor, número de la bandeja, nombre de la plantilla e idioma.
   - Línea del servidor: 'Conexión con Chatwoot configurada en el servidor', o en ámbar 'Falta configurar la conexión con Chatwoot en el servidor (EasyPanel)'.
   - Recuadro 'Texto para crear la plantilla en Meta' con TEXTO_PLANTILLA, categoría Utilidad, idioma Español y Copiar (copiar.js de H30).
   - Botones propios 'Probar conexión' y 'Guardar', con los errores en línea (useAvisos de B2-T0).
17) frontend/package.json: node tests/test_envio_whatsapp.mjs, en el cambio que consolida los scripts del Bloque 3.
```

**Pruebas (diseño):**

```text
Backend: NUEVO backend/tests/test_envio_whatsapp_chatwoot.py, con el runner de ROLLBACK. Aplicar antes la migración a erp_test.

Preparación común:
- FakeChatwoot registra (metodo, ruta, cuerpo) y responde por ruta. Se instala con monkeypatch.setattr('app.core.chatwoot._peticion', fake).
- monkeypatch.setenv: CHATWOOT_BASE_URL='https://chatwoot.invalid', CHATWOOT_API_TOKEN='token-de-prueba', CHATWOOT_ACCOUNT_ID='1'.
- monkeypatch de app.core.email.send_email y smtp_configurado (H27).
- admin_config se escribe dentro de la transacción revertida.

Casos:
1) test_telefonos_paridad_con_frontend:
   - '3001234567', '+57 300 123 4567', '0057 300 123 4567' y '573001234567' → '+573001234567'.
   - '', None, 'abc' y '300123456' → None.
   - telefono_legible → '+57 300 123 4567'.
2) test_sc_por_whatsapp_dentro_de_ventana_manda_texto_libre:
   - Preparación: search → contacto 7; conversations → [{id:55, inbox_id:3, can_reply:True}]; messages → {id:901}. Configuración: automático 'true', inbox '3'. SC con teléfono.
   - Afirma:
     - whatsapp.enviado y modo 'TEXTO'.
     - POST a conversations/55/messages con el enlace y SIN template_params.
     - EnvioAlCliente con estado 'ENVIADO', conversación '55' y mensaje '901'.
     - El token (último tramo del link) no aparece ni en envio.mensaje, ni en el json de extra_data, ni en la descripción.
     - Etiquetas: ['Canal de envío','WhatsApp','Mensaje','Correo de respaldo'].
3) test_fuera_de_ventana_usa_la_plantilla:
   - Preparación: can_reply False; plantilla 'confirmar_documento', idioma 'es'.
   - Afirma: template_params == {name, category:'UTILITY', language:'es', processed_params:{'1','2','3':'solicitud SC-…','4':link}} y modo 'PLANTILLA'.
4) test_fuera_de_ventana_sin_plantilla_no_envia_y_deja_el_enlace:
   - Afirma:
     - No hubo POST de mensajes.
     - Motivo FUERA_DE_VENTANA_SIN_PLANTILLA.
     - link_confirmacion presente y texto_manual con el link.
     - SC en PENDIENTE_CONFIRMACION.
5) test_cliente_nuevo_crea_contacto_y_conversacion_con_plantilla:
   - Preparación: search → [].
   - Afirma: el orden de las llamadas es search → POST contacts → POST conversations (message.template_params).
6) test_chatwoot_no_configurado_no_llama_a_la_red:
   - Preparación: delenv del token.
   - Afirma: CHATWOOT_NO_CONFIGURADO y el fake sin llamadas.
7) test_envio_automatico_apagado: ENVIO_AUTOMATICO_APAGADO y el fake sin llamadas.
8) test_error_de_chatwoot_no_filtra_el_token:
   - Preparación: el fake lanza ChatwootError(401, 'Unauthorized token-de-prueba').
   - Afirma: FALLO_CHATWOOT y el detalle sin 'token-de-prueba'.
9) test_timeout_en_el_post_final_avisa_que_puede_haber_salido: CHATWOOT_SIN_RESPUESTA.
10) test_whatsapp_sin_telefono_es_400_sin_tocar_nada: estado ASIGNADA y sin DocumentConfirmationToken.
11) test_cot_por_whatsapp_incluye_el_total_en_pesos: el contenido trae '$1.000' y cot.canal_envio=='WhatsApp'.
12) test_config_whatsapp:
   - PUT con vendedor_token → 403.
   - Plantilla 'Confirmar Documento' → 422.
   - Automático sin inbox → 422.
   - Caso válido → 200.
   - GET /estado con el vendedor → 200, sin 'token' ni 'url' en el json.
13) test_probar_conexion: bandeja con channel_type 'Channel::Whatsapp' y message_templates [{name:'confirmar_documento', status:'approved'}] → ok y 'APROBADA'.

Pruebas existentes que cambian:
- test_envio_confirmacion_canal_y_correo.py (H27), pruebas 1 y 3 (canal WhatsApp): agregar customer_phone='3001234567'; sin él dan 400.
- La prueba 1 espera además ['Canal de envío','WhatsApp','Mensaje','Correo de respaldo']: el automático está apagado por defecto y se agrega el renglón de envío manual.

Frontend:
- NUEVO frontend/tests/test_envio_whatsapp.mjs:
  - avisoWhatsApp(null,'WhatsApp') → null.
  - Enviado TEXTO → 'ok', con el número y sin botón.
  - PLANTILLA → el texto dice 'plantilla'.
  - FUERA_DE_VENTANA… → 'alerta', con '24 horas' y botón.
  - APAGADO → 'info' con botón.
  - SIN_RESPUESTA → 'alerta', con 'puede que'.
  - Canal 'Email' → null.
  - avisoCorreo(fallido,'WhatsApp',true) → 'info', con 'sí salió'.
- test_aviso_correo.mjs de H27 sigue verde.
- npm test y npx tsc --noEmit.
- Manual, solo cuando el usuario cargue la configuración: un envío a un número de la empresa, con 'Probar conexión' antes.
```

**Comportamiento esperado:**

```text
- Canal WhatsApp con el envío automático encendido y listo:
  - Si el cliente escribió en las últimas 24 h (can_reply=true en Chatwoot), va un mensaje normal:
    - SC: 'Hola {nombre}, te escribimos de {empresa}. Puedes revisar y confirmar tu solicitud {numero} en este enlace: {enlace} El enlace vence en 2 días. Si tienes alguna pregunta, responde este mensaje.'
    - COT: 'Hola {nombre}, te escribimos de {empresa}. Tu cotización {numero} por {total} está lista. Puedes revisarla y confirmarla en este enlace: {enlace} El enlace vence en 2 días. Si tienes alguna pregunta, responde este mensaje.'
    - PVEN (U23): 'Hola {nombre}, te escribimos de {empresa}. Tu pedido {numero} por {total} quedó registrado. Puedes revisarlo y confirmarlo en este enlace: {enlace} Si tienes alguna pregunta, responde este mensaje.'
  - Si no hay conversación o está fuera de las 24 h, y hay plantilla: se manda la plantilla con {{1}} nombre, {{2}} empresa, {{3}} 'solicitud SC-…' / 'cotización COT-…' / 'pedido PVEN-…' y {{4}} enlace; categoría UTILITY e idioma configurado.
  - Sin plantilla no se envía nada.
- Renglón 'WhatsApp' de la Actividad (texto_resultado):
  - TEXTO: 'Enviado automáticamente al +57 300 123 4567 desde el WhatsApp de la empresa.'
  - PLANTILLA: 'Enviado automáticamente al +57 300 123 4567 con la plantilla aprobada «{plantilla}» (el cliente no había escrito en las últimas 24 horas).'
  - ENVIO_AUTOMATICO_APAGADO: 'Envío manual: se abrió WhatsApp en el computador del asesor (el envío automático está apagado).'
  - CHATWOOT_NO_CONFIGURADO: 'No se envió: la conexión con Chatwoot no está configurada en el servidor.'
  - BANDEJA_NO_CONFIGURADA: 'No se envió: falta el número de la bandeja de WhatsApp de Chatwoot en Configuración.'
  - TELEFONO_INVALIDO: 'No se envió: el teléfono del cliente no es un número de WhatsApp válido.'
  - FUERA_DE_VENTANA_SIN_PLANTILLA: 'No se envió: el cliente no ha escrito en las últimas 24 horas y no hay una plantilla aprobada por Meta en Configuración.'
  - FALLO_CHATWOOT: 'No se envió: Chatwoot rechazó el mensaje ({detalle}).'
  - CHATWOOT_SIN_RESPUESTA: 'Chatwoot no respondió a tiempo: puede que el mensaje haya salido. Revisa la conversación en Chatwoot antes de mandarlo otra vez.'
- Modal del enlace:
  - Enviado: verde, con el número.
  - Apagado: azul, y se abre wa.me como hoy.
  - Los demás casos: ámbar, con el motivo + 'Envíaselo tú con el botón «Abrir WhatsApp con el mensaje».' El botón usa el texto con el enlace que devolvió el servidor.
- Estado del documento: pasa a Pendiente por confirmación aunque el WhatsApp no salga, porque el enlace ya sirve (pregunta 1, recomendación). Si el usuario elige la otra opción: el WhatsApp se intenta antes del commit y, si no sale, se revierte (sin token y sin cambio de estado) y responde 409 con el motivo.
- Actividad: el mismo renglón ESTADO_CHANGED de H27 ('Enviada para confirmación del cliente por WhatsApp'), con 'Canal de envío', 'WhatsApp', 'Mensaje' (con '[enlace de confirmación]' en lugar del enlace) y 'Correo de respaldo'.
- Canal Email u Otro: igual que H27.
- Canal WhatsApp sin teléfono válido: 400 antes de tocar nada.
- Pregunta 2: si el usuario elige que el asesor pueda mandarlo él, el ChannelModal agrega 'WhatsApp desde mi teléfono' y el body lleva whatsapp_manual:true. El motivo es ENVIO_MANUAL_ELEGIDO, que se comporta como el apagado.
- Configuración: solo el administrador ve y cambia la sección. El asesor solo recibe {automatico, listo, plantilla_configurada}. El token vive solo en las variables del servidor.
- La vista previa que WhatsApp genera del enlace no lo gasta: /confirmar/ver usa peek_token; solo confirmar consume el token.
```

**Datos existentes:**

```text
No cambia datos viejos. Consulta de solo lectura en erp_test (transacción READ ONLY, 2026-10-03):
- customers: 4.215 en total. 2.705 tienen celular de 10 dígitos (sale bien con +57), 1.509 no tienen teléfono (36 de ellos con cadena vacía) y 1 tiene 9 dígitos (no válido).
- SC, COT y PVEN: 1 documento de prueba con 9 dígitos en cada tabla.
- admin_config: no tiene claves de WhatsApp.
- chat_conversations: vacía.
Producción no se revisó. Antes de encender el envío automático, correr el mismo conteo en modo lectura y mostrarle al usuario los teléfonos inválidos. No se corrige nada sin su OK.
```

**Riesgos:**

```text
- Versión de Chatwoot. El diseño asume:
  - el campo can_reply en la conversación;
  - processed_params plano (solo el cuerpo);
  - las formas de contacts/search y contact_inboxes.
  'Probar conexión' y un primer envío controlado a un número propio lo verifican antes de encenderlo. Si no viene can_reply, se va por la plantilla o se manda a mano; nunca se adivina.
- Los rechazos de Meta (número sin WhatsApp, plantilla mal aprobada) llegan después de la respuesta. Los cubre U16-entrega.
- El envío es síncrono, con un plazo de 12 s, al que se suman los 10 s del SMTP de H27. Un Chatwoot lento retrasa la ventana; el botón queda deshabilitado mientras tanto.
- El enlace con el token viaja a Chatwoot y queda guardado allá: es de un solo uso, dura 2 días y se revoca al reenviar. En el ERP no se guarda.
- El webhook /chat/webhook/chatwoot no tiene autenticación y está pausado (RF-07). Este diseño no lo usa y no hay que activarlo para estados sin antes asegurarlo.
- Las respuestas del cliente llegan a la bandeja de Chatwoot. El Omnicanal del ERP no las verá mientras los webhooks sigan pausados.
- Meta cobra cada plantilla enviada fuera de la ventana (tarifa de utilidad). Dentro de la ventana no cobra.
- chat.py conserva su URL de Chatwoot por defecto. Este módulo no tiene ninguna, así que producción debe definir CHATWOOT_BASE_URL. Unificar los dos queda para otra tarea.
- Doble clic o dos asesores a la vez: salen dos mensajes y el primer enlace queda revocado. El botón se deshabilita mientras envía.
- Un fijo de 10 dígitos recibe el +57 y Meta lo rechaza. Lo informa U16-entrega.
- admin_config no se trunca: las pruebas solo corren con el runner de ROLLBACK.
- Archivos con dueño en el Bloque 2: cotizacion-client.tsx, solicitud/[id], cotizacion/[id] y Hub (B2-T7/T8), y flujo.tsx (B2-T5).
```

**Depende de:**

```text
Del Bloque 1:
- H27+H39: _canal_de_envio, _enviar_correo_confirmacion, _detalle_envio, avisoCorreo, ChannelModal customerEmail, EnlaceConfirmacionModal correo/canal y hubEnlace.
- H5: lib/whatsapp.js con waUrl y numeroWhatsApp.
- H42: ventas_dinero.pesos.
- N8: soloLectura del ConfigPanel.
- H7: etiquetas.
Del Bloque 2:
- U15: 'Pendiente por confirmación'.
- H30 (B2-T5): copiar.js en flujo.tsx.
- H49+H34 (B2-T0): useAvisos.
- C13: nombre_de_usuario.
- B2-T7/B2-T8, dueños de solicitud/[id], cotizacion/[id], cotizacion-client.tsx y Hub.
Del Bloque 3:
- MARCA: nombre de la empresa en el mensaje.
- U23: el envío del PVEN usa los mismos helpers.
- U16-seguimiento: reutiliza enviar_documento con proposito='SEGUIMIENTO'.
```

**Archivos que nombra el diseño:** `backend/app/core/telefonos.py`, `backend/app/core/chatwoot.py`, `backend/app/core/envio_whatsapp.py`, `backend/app/models/envios.py`, `backend/app/models/__init__.py`, `backend/alembic/versions/fa6_0NN_envios_al_cliente.py`, `backend/app/api/v1/erp_ventas.py`, `backend/app/api/v1/envio_cliente.py`, `backend/main.py`, `backend/tests/rollback_runner.py`, `backend/tests/test_envio_whatsapp_chatwoot.py`, `backend/tests/test_envio_confirmacion_canal_y_correo.py`, `frontend/src/lib/envio-whatsapp.js`, `frontend/src/lib/aviso-correo.js`, `frontend/src/app/dashboard/ventas/flujo.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/app/dashboard/ventas/config-envio-whatsapp.tsx`, `frontend/tests/test_envio_whatsapp.mjs`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R10).


### U16-entrega — Saber si el WhatsApp le llegó al cliente

**Grupo:** Envío automático por WhatsApp · **Esfuerzo:** M · **Tareas del plan:** T8, T13, T16, T17, T18, T19

**Para el usuario:** WhatsApp no avisa en el mismo instante si rechaza un mensaje. Por eso, después de enviar, el sistema le pregunta a Chatwoot por el estado: enviado, entregado, leído o no entregado. Si no se entregó, el asesor ve el motivo traducido y la forma de mandarlo por otro medio.

**Lo que vio y aprobó el usuario:** Unos segundos después de enviar, la ventana del enlace te dice si el WhatsApp le llegó al cliente o si ya lo leyó. Si WhatsApp no lo entregó, por ejemplo porque el número no tiene WhatsApp, la ventana se pone amarilla. Te explica el motivo en palabras simples y te muestra el botón para mandarlo tú. Con «Volver a revisar» puedes consultar de nuevo. En la Actividad del documento queda anotado lo que pasó.

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- (Pregunta del diseño no mostrada) ¿Quieres que la Actividad anote también cuando el cliente recibió o leyó el WhatsApp? → quitada por el crítico: se aplica la recomendada (R4): «Sí: anotar cuando le llegó, cuando lo leyó y cuando no le llegó».

**Cambios (diseño):**

```text
BACKEND
1) backend/app/core/envio_whatsapp.py:
   - ESTADOS_CHATWOOT = {'sent':'ENVIADO','delivered':'ENTREGADO','read':'LEIDO','failed':'FALLIDO'}.
   - traducir_error_whatsapp(texto) -> str, según el código al inicio de content_attributes.external_error:
     - 131047 → 'pasaron más de 24 horas desde el último mensaje del cliente y no se usó una plantilla aprobada'.
     - 131026 → 'ese número no tiene WhatsApp o no puede recibir mensajes'.
     - 132000, 132001, 132005, 132007, 132012, 132015 y 132016 → 'la plantilla no coincide con la aprobada por Meta (nombre, idioma o datos) o fue pausada'.
     - 131048 y 131049 → 'Meta limitó los envíos de la empresa para cuidar la calidad; intenta más tarde'.
     - 131042 → 'hay un problema de pago en la cuenta de WhatsApp Business'.
     - 131056 → 'se enviaron demasiados mensajes a este número en poco tiempo'.
     - Cualquier otro → 'WhatsApp rechazó el mensaje ({texto recortado a 120})'.
   - verificar_envio(db, envio, user_name) -> dict:
     - Si el canal no es 'WhatsApp', no hay chatwoot_message_id o el estado ya es final (LEIDO, FALLIDO): devuelve lo guardado sin llamar a Chatwoot.
     - Si no, llama a chatwoot.mensajes(conv_id) con timeout 6, busca el mensaje por id y mapea su status.
     - Si el estado cambió: actualiza estado, detalle y updated_at, registra un renglón de Actividad en el documento (action 'MENSAJE_CLIENTE') y hace un solo commit.
     - La fila se lee con with_for_update, para que dos verificaciones a la vez no dupliquen el renglón.
     - Si Chatwoot falla o el mensaje no aparece: no cambia nada y devuelve verificado:false.
   - Textos de la Actividad (se rigen por la pregunta):
     - ENTREGADO: 'El WhatsApp le llegó al cliente', con el renglón 'Número'.
     - LEIDO: 'El cliente leyó el WhatsApp'.
     - FALLIDO: 'El WhatsApp no le llegó al cliente', con los renglones 'Número', 'Motivo: <traducido>' y 'Qué hacer: usa «Reenviar enlace de confirmación» y mándalo por otro medio.' Sin clave 'campo'.
2) backend/app/api/v1/envio_cliente.py: POST /envio-cliente/{envio_id}/verificar (ADMIN, ASESOR) → {envio_id, estado, texto, boton_manual, verificado}.
   - 404 'Envío no encontrado'.
   - user_name = nombre_de_usuario(user) (C13 del Bloque 2).

FRONTEND
3) frontend/src/lib/envio-whatsapp.js: debeVerificar(wa), que es true si enviado, con envio_id y estado 'ENVIADO'; y textoEntrega(estado, texto).
4) flujo.tsx, EnlaceConfirmacionModal: si debeVerificar(whatsapp), a los 6 s hace una sola llamada automática a POST /ventas/envio-cliente/{envio_id}/verificar.
   - El recuadro pasa a 'Le llegó al cliente.', a 'El cliente ya lo leyó.', o a ámbar 'No le llegó: {motivo}.' con el botón manual.
   - Botón de texto 'Volver a revisar', deshabilitado mientras consulta.
   - El timeout se limpia al cerrar el modal.
5) ACTIVITY_STYLE de solicitud/[id]/page.tsx y cotizacion/[id]/page.tsx: 'MENSAJE_CLIENTE' con ícono MessageCircle y color verde. En venta/[id]/page.tsx el mapa es de colores: '#16a34a'. Otras líneas de tiempo usan su estilo por defecto.
```

**Pruebas (diseño):**

```text
Backend, en backend/tests/test_envio_whatsapp_chatwoot.py, con el runner de ROLLBACK y FakeChatwoot por monkeypatch:
a) test_verificar_marca_fallido_y_explica_el_motivo:
   - Preparación: EnvioAlCliente ENVIADO (conversación '55', mensaje '901') de una SC. El fake de GET conversations/55/messages → [{id:901, status:'failed', content_attributes:{external_error:'131047: Re-engagement message'}}].
   - Afirma: 200, estado 'FALLIDO' y texto con '24 horas'; renglón MENSAJE_CLIENTE con 'Motivo'.
   - Un segundo POST no llama al fake y no agrega otro renglón.
b) test_verificar_entregado: 'delivered' → ENTREGADO, con el renglón 'El WhatsApp le llegó al cliente'.
c) test_verificar_con_chatwoot_caido_no_cambia_nada: el fake lanza ChatwootError → 200 con verificado False, estado ENVIADO y sin renglón.
d) test_verificar_un_envio_por_correo_no_consulta_chatwoot.
e) test_traducir_error_whatsapp:
   - '131026: …' → 'no tiene WhatsApp'.
   - '132001' → 'plantilla'.
   - '' → texto genérico.
f) test_verificar_requiere_sesion: sin token → 401 o 403.
Frontend, en test_envio_whatsapp.mjs:
- debeVerificar: enviado → true; FALLIDO → false; sin envio_id → false.
- textoEntrega('LEIDO') contiene 'leyó'.
- npx tsc --noEmit.
```

**Comportamiento esperado:**

```text
- La verificación ocurre sola una vez en el modal, unos 6 s después de un envío que salió, o cuando el asesor pulsa 'Volver a revisar'. No hay tareas en segundo plano ni webhooks.
- Estados: ENVIADO (Chatwoot lo aceptó), ENTREGADO, LEIDO y FALLIDO. LEIDO y FALLIDO son finales y no se vuelven a consultar.
- FALLIDO: el modal se pone ámbar, con el motivo traducido y el botón 'Abrir WhatsApp con el mensaje'. La Actividad del documento lo registra con el motivo y qué hacer.
- Si Chatwoot no responde: 'No se pudo consultar Chatwoot ahora; vuelve a intentar.' No se registra nada.
- Pregunta: con la opción recomendada se anotan en la Actividad ENTREGADO, LEIDO y FALLIDO, una vez cada uno. Con la otra, solo FALLIDO; ENTREGADO y LEIDO se ven en el modal y quedan en la fila del envío.
- U16-seguimiento puede llamar a verificar_envio antes de mandar un recordatorio.
```

**Datos existentes:**

```text
No aplica: la tabla envios_al_cliente nace vacía con U16-envio.
```

**Riesgos:**

```text
- Chatwoot devuelve solo los mensajes más recientes de la conversación. Si hubo muchos después, el mensaje no se encuentra y queda en ENVIADO, con 'no se pudo verificar'.
- El formato de external_error cambia entre versiones de Chatwoot. Si no empieza por un código, se muestra el texto genérico recortado.
- Sin webhooks, el estado 'leído' solo se conoce cuando alguien verifica. Pasar a webhooks exige primero asegurar /chat/webhook/chatwoot (RF-07).
- Una consulta HTTP por clic. Se limita a una automática por envío.
```

**Depende de:**

```text
- U16-envio: tabla, ids de Chatwoot y modal.
- C13 del Bloque 2: nombre_de_usuario.
- B2-T5: flujo.tsx.
- B2-T7 y B2-T8: dueños de ACTIVITY_STYLE en SC, COT y PVEN.
- U16-reenvio-cot: el 'qué hacer' del renglón FALLIDO.
- U16-seguimiento puede reutilizar verificar_envio.
```

**Archivos que nombra el diseño:** `backend/app/core/envio_whatsapp.py`, `backend/app/api/v1/envio_cliente.py`, `backend/tests/test_envio_whatsapp_chatwoot.py`, `frontend/src/lib/envio-whatsapp.js`, `frontend/src/app/dashboard/ventas/flujo.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `frontend/tests/test_envio_whatsapp.mjs` (la lista que manda es la de **Files** de la tarea y R10).


### U16-reenvio-cot — Reenviar el enlace de una cotización

**Grupo:** Envío automático por WhatsApp · **Esfuerzo:** S · **Tareas del plan:** T7, T17

**Para el usuario:** Hoy una cotización en «Pendiente por confirmación» no se puede volver a enviar: para eso hay que devolverla a Borrador. Con este cambio se reenvía directo. El enlace viejo se anula, sale uno nuevo por el canal elegido y la Actividad lo registra.

**Lo que vio y aprobó el usuario:** Una cotización que espera la confirmación del cliente ahora tiene el botón «Reenviar enlace de confirmación», como ya lo tiene la solicitud. Sirve si el cliente perdió el mensaje, si el enlace venció (dura 2 días) o si el WhatsApp no le llegó. Se crea un enlace nuevo, el anterior deja de servir y queda anotado en la Actividad. Se envía por el canal que elijas, igual que el primer envío.

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- Sin preguntas.

**Cambios (diseño):**

```text
BACKEND
backend/app/api/v1/erp_ventas.py, enviar_cotizacion_para_confirmacion:
- Estados aceptados: BORRADOR, ENVIADA y PENDIENTE_CONFIRMACION (reenvío). El 400 pasa a 'La cotización debe estar en Borrador, Enviada o Pendiente por confirmación para enviarla al cliente (estado actual: {etiqueta}).', con la etiqueta de textos_actividad.etiqueta_estado (H7).
- es_reenvio = old_estado == 'PENDIENTE_CONFIRMACION'. Se mantienen las guardas de productos y total, y la de PVEN vinculado/vigente según el Bloque 1.
- revoke_pending_tokens + create_confirmation_token, igual que hoy.
- Si es_reenvio:
  - el estado no cambia y gate2_confirmed_at queda en None;
  - NO se llaman _sincronizar_estado_solicitud_desde_cotizacion ni mover_lead_de_solicitud, porque ya corrieron en el primer envío;
  - descripción 'Enlace de confirmación reenviado al cliente' + el sufijo de canal de H27, con old_estado y new_estado en PENDIENTE_CONFIRMACION.
- El canal, el WhatsApp (U16-envio) y el correo funcionan igual que en el primer envío.
- Actualizar el docstring: la nota de Round 2 que decía que la COT no acepta reenvío.

FRONTEND
- cotizacion/[id]/page.tsx: con estado PENDIENTE_CONFIRMACION y sin PVEN vigente, el siguiente paso (NextStepCard) muestra el botón 'Reenviar enlace de confirmación'. Abre el mismo ChannelModal y usa confirmarEnvio sin cambios.
- cotizacion-client.tsx, ChannelModal: prop opcional nota?: string, que se muestra bajo las opciones. En el reenvío dice 'Se crea un enlace nuevo y el anterior deja de servir.'
```

**Pruebas (diseño):**

```text
Backend, con el runner de ROLLBACK:
- Ajustar test_confirmacion_cotizacion.py::test_enviar_confirmacion_requiere_borrador_o_enviada: quitar PENDIENTE_CONFIRMACION de la lista. RECHAZADA, CONFIRMADA y VENCIDA siguen en 400.
- NUEVO test_reenviar_cotizacion_pendiente_revoca_el_enlace_anterior:
  - Preparación: COT BORRADOR con productos y total_cop=1000. Primer POST → link1; segundo POST → 200 y link2 distinto de link1. mover_lead_de_solicitud con monkeypatch contador.
  - Afirma:
    - /api/v1/confirmar/ver con el token1 falla igual que un enlace revocado de hoy; con el token2 da 200.
    - La COT sigue en PENDIENTE_CONFIRMACION con gate2_confirmed_at None.
    - Hay 2 renglones ESTADO_CHANGED y el segundo dice 'Enlace de confirmación reenviado al cliente'.
    - mover_lead_de_solicitud se llamó una sola vez.
- NUEVO test_reenviar_cotizacion_con_pven_sigue_en_400.
- Las pruebas con WhatsApp usan FakeChatwoot (U16-envio). send_email siempre con monkeypatch.
Frontend: npx tsc --noEmit. Prueba manual: el botón aparece solo en Pendiente por confirmación.
```

**Comportamiento esperado:**

```text
- POST /cotizaciones/{id}/enviar-confirmacion sobre una COT en PENDIENTE_CONFIRMACION → 200 con un link nuevo. El link anterior deja de servir: /confirmar/ver y /confirmar/confirmar lo tratan como revocado.
- RECHAZADA, CONFIRMADA y VENCIDA siguen dando 400. Con PVEN vigente también da 400, como hoy.
- Actividad: 'Enlace de confirmación reenviado al cliente por WhatsApp' (o por correo, o por otro canal), con los mismos renglones de canal, WhatsApp y correo.
- La SC y el lead del CRM no se tocan en el reenvío.
```

**Datos existentes:**

```text
No aplica.
```

**Riesgos:**

```text
- Revierte una decisión explícita de Gate 2 (Round 2). Entra en la revisión de seguridad final del Bloque 3, aunque usa el mismo esquema de revocar y emitir que la SC.
- Un reenvío por WhatsApp fuera de las 24 h necesita la plantilla. Si no la hay, el asesor lo manda a mano.
- U16-seguimiento necesita lo mismo para el recordatorio de los 2 días, cuando vence el enlace. Si ese grupo también lo diseña, el cruce debe dejar uno solo.
- cotizacion/[id]/page.tsx tiene muchos dueños; en el Bloque 2 es B2-T8.
```

**Depende de:**

```text
- H27+H39: canal en el POST y sufijo de la descripción.
- H7: etiqueta_estado.
- H50/N5 y H46: guardas de estado y de PVEN vigente de la COT.
- U15 y U11 del Bloque 2: sincronización reescrita en B2-T1, que no se llama en el reenvío.
- U16-envio: WhatsApp en el reenvío.
- B2-T8: dueño de cotizacion/[id] y cotizacion-client.tsx.
- U16-seguimiento.
```

**Archivos que nombra el diseño:** `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_confirmacion_cotizacion.py`, `backend/tests/test_reenvio_cotizacion.py`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx` (la lista que manda es la de **Files** de la tarea y R10).


### TAREAS — Revisión automática cada 10 minutos

**Grupo:** Seguimiento a los 2 días · **Esfuerzo:** M · **Tareas del plan:** T10, T13, T16

**Para el usuario:** Hoy el sistema solo trabaja cuando alguien abre una pantalla: nada ocurre solo. Con este cambio el servidor revisa por su cuenta, cada 10 minutos, si hay tareas pendientes. La primera son los recordatorios a los clientes que no han confirmado. Aunque el servidor tenga varias copias trabajando a la vez, cada revisión la hace una sola, así nunca se duplica un mensaje.

**Lo que vio y aprobó el usuario:** En las pantallas de trabajo no cambia nada. En Configuración del Hub de Ventas aparece una línea que dice cuándo revisó el sistema por última vez, por ejemplo «Última revisión automática: hace 4 minutos». Si lleva más de media hora sin revisar, la línea se pone amarilla y avisa que los recordatorios no están saliendo. Un administrador tiene además el botón «Revisar ahora». Esta revisión solo se enciende en el servidor de producción, con una línea en su configuración que deja lista quien instale la actualización. En los equipos de prueba queda apagada, para que nunca le escriba a clientes reales.

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- Sin preguntas.

**Cambios (diseño):**

```text
DECISIÓN DE MECANISMO (lectura de cómo arranca el backend). Hay tres formas de arrancarlo:
- backend/Dockerfile: uvicorn con 1 worker.
- start_production.bat/.sh y launch_production.py: uvicorn --workers 2 (WORKERS=2 por defecto).
- nebulae_service_wrapper.py: lo lanza el Programador de tareas de Windows (nebulae_task.xml, BootTrigger), con .env.production.
main.py solo tiene @app.on_event('startup') startup_preflight y no hay ningún scheduler (APScheduler no está en requirements). El badge de atrasados es «v1 sin scheduler» y se calcula al leer, así que no necesita revisor.
Lo más simple y confiable que sirve en las tres formas es un bucle asyncio dentro del proceso, encendido por variable de entorno, con un candado de Postgres para que solo una copia revise a la vez. Un cron externo obligaría a configurar algo fuera de la app (Programador de Windows o EasyPanel) y a manejar un token. Por eso solo se deja una ruta de administrador «Revisar ahora», que usa la misma función.

BACKEND
1) NUEVO backend/app/core/tareas_automaticas.py (sin FastAPI, con logger propio):
   - CLAVE_LOCK = 7420016: entero fijo y documentado para pg_try_advisory_lock.
   - intervalo_seg(env=os.environ) -> int: lee NEBULAE_TAREAS_INTERVALO_SEG. Por defecto 600; mínimo 60 y máximo 3600; un valor inválido da 600.
   - debe_iniciar(env=os.environ, modulos=sys.modules) -> bool: True solo si env['NEBULAE_TAREAS_AUTOMATICAS'].strip() == '1' Y 'pytest' no está en modulos. tests/conftest.py usa `with TestClient(app)`, que dispara los eventos de startup; esta guarda lo frena aunque alguien ponga la variable en backend/.env.
   - TAREAS: lista fija de (nombre, 'modulo:funcion'), resuelta con importlib al correr para evitar imports cíclicos con erp_ventas. La primera entrada la agrega U16-seguimiento: ('seguimiento_confirmacion', 'app.core.seguimiento_confirmacion:correr_seguimientos'). Firma de cada tarea: fn(db: Session, ahora: datetime) -> dict.
   - _tomar_turno(engine): si engine.dialect.name != 'postgresql' devuelve el marcador 'SIN_LOCK' (SQLite local, un solo proceso). Si es Postgres: conn = engine.connect(); ok = conn.execute(text('SELECT pg_try_advisory_lock(:k)'), {'k': CLAVE_LOCK}).scalar(). Si no ok: conn.close() y devuelve None. El candado es de sesión y vive en una conexión DEDICADA, no en la Session de trabajo, porque esa cambia de conexión entre commits. Si el proceso muere, Postgres lo suelta al cerrarse la conexión.
   - _soltar_turno(turno): SELECT pg_advisory_unlock(:k) y conn.close(), dentro de try/finally.
   - correr_una_vez(ahora=None) -> dict, paso a paso:
     · ahora = ahora or datetime.utcnow().
     · turno = _tomar_turno(dbmod.engine). Si es None, devuelve {'omitido': 'otra_copia_revisando'}.
     · db = dbmod.SessionLocal(). Se pide por atributo del módulo app.db.database para que el runner de ROLLBACK lo parchee.
     · Por cada tarea: try res = fn(db, ahora); except Exception as e: db.rollback(), logger.exception(...) y res = {'error': type(e).__name__}. Un error en una tarea no frena las demás.
     · _marcar_revision(db, ahora, resumen) y db.commit(). En el finally: db.close() y _soltar_turno(turno).
   - _marcar_revision: UPSERT en admin_config de 'tareas_ultima_revision' = ahora.isoformat()+'Z' y 'tareas_ultimo_resumen' = json.dumps(resumen, ensure_ascii=False)[:2000]. Mismo SQL ON CONFLICT que update_config.
   - async bucle():
     · await asyncio.sleep(60).
     · while True: try await anyio.to_thread.run_sync(correr_una_vez); except asyncio.CancelledError: raise; except Exception: logger.exception.
     · Al final de cada vuelta: await asyncio.sleep(intervalo_seg() + random.randint(0, 30)). anyio ya viene con starlette.
2) backend/main.py: un segundo @app.on_event('startup') iniciar_tareas_automaticas(), registrado DESPUÉS de startup_preflight:
   - Si tareas_automaticas.debe_iniciar(): app.state.tareas_bucle = asyncio.create_task(tareas_automaticas.bucle()) y logger.info('Tareas automáticas activas cada N s').
   - Si no: logger.info('Tareas automáticas apagadas en este proceso').
   - @app.on_event('shutdown') detener_tareas_automaticas() cancela app.state.tareas_bucle si existe.
   - Con --workers 2, cada worker arranca su bucle y el candado decide quién revisa.
3) backend/app/api/v1/erp_ventas.py:
   - GET /ventas/tareas/estado (ALL_ERP_ROLES) -> {'activas_en_servidor': debe_iniciar(), 'intervalo_min': intervalo_seg()//60, 'ultima_revision': valor de 'tareas_ultima_revision' o None, 'resumen': json.loads seguro de 'tareas_ultimo_resumen' o None}. No expone nada sensible.
   - POST /ventas/tareas/revisar-ahora (solo ADMIN): si NEBULAE_TAREAS_AUTOMATICAS != '1', responde 409 'La revisión automática está apagada en este servidor.'; así un clic en un equipo de prueba nunca le escribe a un cliente. Si está encendida: background_tasks.add_task(tareas_automaticas.correr_una_vez) y responde 202 {'status':'success','message':'Revisión iniciada'}. El candado evita que choque con el bucle.
   - update_config: si el body trae 'tareas_ultima_revision' o 'tareas_ultimo_resumen', responde 422 'Ese valor lo escribe el sistema.' Esas claves no se agregan a _CONFIG_LECTURA_GENERAL (N8): el estado se lee por /tareas/estado.
4) Configuración del servidor:
   - NEBULAE_TAREAS_AUTOMATICAS=1 (y, si se quiere, NEBULAE_TAREAS_INTERVALO_SEG) va SOLO en el entorno de producción: .env.production para Windows, o las variables de EasyPanel si corre en Docker.
   - NUNCA en backend/.env (desarrollo, contra erp_test).
   - Se documenta en el docstring de tareas_automaticas.py y en el bloque de variables de launch_production.py (solo un comentario).

FRONTEND
5) NUEVO frontend/src/lib/tareas.js (JS puro):
   - hace(iso, ahora=new Date()) devuelve 'hace un momento', 'hace N minutos', 'hace N horas' o 'hace N días'. Una fecha sin zona se toma como UTC, como en R5.
   - revisionAtrasada(estado, ahora): true si activas_en_servidor y además no hay ultima_revision, o pasó más de max(30 min, 3 × intervalo).
6) frontend/src/app/dashboard/ventas/page.tsx, ConfigPanel: al montarse llama apiFetch('/ventas/tareas/estado') y añade un bloque de estado al pie de la sección 'Seguimiento de confirmación' (la crea U16-seguimiento; si este ítem se implementa antes, va al pie de 'Automatizaciones Comerciales'). Casos:
   - Al día: texto gris 'Última revisión automática: hace 4 minutos.'
   - Atrasada: recuadro ámbar 'La revisión automática no corre desde hace 2 horas: los recordatorios no están saliendo. Avísale a quien administra el servidor.'
   - Apagada: recuadro gris 'La revisión automática está apagada en este servidor. Los recordatorios solo salen desde el servidor de producción.'
   - Botón 'Revisar ahora': solo para admin (getUsuarioActual de N8) y solo si activas_en_servidor. Al terminar, avisar('Revisión iniciada') (useAvisos de B2-T0); los errores, con avisarError.
7) frontend/package.json, script test: agregar '&& node tests/test_tareas.mjs'. Consolidar con los scripts de B1 y B2 y stagear solo lo propio.
```

**Pruebas (diseño):**

```text
Backend: nuevo backend/tests/test_tareas_automaticas.py. Se corre SOLO con `python tests/rollback_runner.py test_tareas_automaticas`, sin parametrize y sin servicios externos: las tareas registradas se reemplazan con monkeypatch.
1) test_no_arranca_sin_la_variable:
   - debe_iniciar({}, {}) → False.
   - debe_iniciar({'NEBULAE_TAREAS_AUTOMATICAS':'1'}, {}) → True.
   - Con 'pytest' en modulos → False.
   - Con '0' o 'si' → False.
2) test_intervalo_con_limites: '30' → 60, 'abc' → 600, '99999' → 3600, sin la variable → 600.
3) test_correr_una_vez_registra_la_revision(monkeypatch, db):
   - monkeypatch de tareas_automaticas.TAREAS con dos funciones del módulo de prueba: una devuelve {'ok':1} y la otra lanza RuntimeError.
   - correr_una_vez(ahora=datetime(2026,10,5,14,0)).
   - Afirma: el resumen trae {'ok':1} y {'error':'RuntimeError'}. En admin_config, 'tareas_ultima_revision' == '2026-10-05T14:00:00Z' (la transacción se revierte al final).
4) test_segunda_copia_no_toma_el_turno:
   - Con dbmod.engine.connect() aparte, tomar pg_try_advisory_lock(CLAVE_LOCK).
   - correr_una_vez() → {'omitido':'otra_copia_revisando'} y la tarea falsa no se llamó.
   - En finally: pg_advisory_unlock y cerrar la conexión.
5) test_revisar_ahora(monkeypatch, admin_token, vendedor_token):
   - setenv NEBULAE_TAREAS_AUTOMATICAS='0' → 409 con el mensaje exacto.
   - Con vendedor_token → 403.
   - Con '1' y correr_una_vez reemplazada por un fake → 202, y el fake se llamó una vez (TestClient corre las background tasks).
6) test_estado_lo_leen_todos: GET /ventas/tareas/estado con vendedor_token → 200 con las claves activas_en_servidor, intervalo_min y ultima_revision.
7) test_update_config_rechaza_claves_del_sistema: PATCH {'tareas_ultima_revision':'x'} con admin → 422.

Frontend: frontend/tests/test_tareas.mjs (node:assert/strict).
- hace() con un iso sin 'Z' a 4 min, 3 h y 2 días.
- revisionAtrasada: 5 min → false; 45 min → true; sin revisión → true; apagada → false.
- Luego npm test y npx tsc --noEmit.

Manual (sin escribirle a nadie):
- En una consola local, con NEBULAE_TAREAS_AUTOMATICAS=1 solo para esa sesión y seguimiento_auto_activo='false', arrancar el backend.
- A los ~60 s, Configuración debe mostrar 'hace un momento'.
- Quitar la variable y comprobar el recuadro gris de 'apagada'.
```

**Comportamiento esperado:**

```text
- En producción, con NEBULAE_TAREAS_AUTOMATICAS=1, cada proceso del backend arranca un bucle. La primera vuelta es 60 s después del arranque y luego una cada ~10 min (más 0-30 s al azar). En cada vuelta el proceso intenta tomar el turno: solo una copia revisa y las demás se saltan esa vuelta.
- Si una tarea falla, el error queda en el log y el resto sigue. El bucle nunca tumba el servidor.
- En desarrollo, erp_test, pytest y el runner no arranca nada, y 'Revisar ahora' responde 409.
- Cada revisión deja la hora (UTC con 'Z') y un resumen corto, por ejemplo {'seguimiento_confirmacion': {'enviados': 2, 'agotados': 1}}. Cualquier usuario del ERP ve en Configuración «Última revisión automática: hace N minutos».
- Al apagar el servidor, la tarea se cancela. Lo ya guardado se queda y el candado se libera solo.
- Si el equipo de producción estuvo apagado, en la primera vuelta al volver sale lo que estaba vencido. U16-seguimiento limita esos casos con su plazo máximo de retraso.
```

**Datos existentes:**

```text
No aplica. Las dos claves nuevas de admin_config las escribe el sistema en su primera revisión. No hay consultas ni correcciones.
```

**Riesgos:**

```text
- El bucle vive dentro del proceso: si el equipo de producción está apagado no hay revisiones. Configuración lo hace visible con el aviso ámbar.
- En desarrollo, uvicorn --reload reinicia el bucle en cada cambio. Con la variable apagada no pasa nada.
- El candado ocupa una conexión del pool (pool_size 10, max_overflow 20) mientras dura la revisión. Si el pool está agotado, se espera hasta pool_timeout (30 s); la vuelta se pierde y queda en el log.
- statement_timeout de 15 s: las consultas de las tareas deben ir por índice y con LIMIT. U16-seguimiento usa LIMIT 50.
- @app.on_event está obsoleto en FastAPI, pero main.py ya lo usa. No se migra a lifespan para no tocar el preflight.
- No se sabe con certeza si producción corre con Windows (2 workers) o con Docker/EasyPanel (1 worker). El diseño sirve para ambos, pero hay que poner la variable en el entorno correcto, y en uno solo.
- Si por error la variable queda en un .env de desarrollo apuntando a erp_test, el bucle correría allí. Lo mitigan: la guarda de pytest, seguimiento_auto_activo y que hoy no hay SMTP ni plantillas configuradas. Debe quedar escrito en el docstring.
- ConfigPanel (ventas/page.tsx) lo tocan también N8 (B1), U16-seguimiento y U16-envio: conviene un solo dueño.
```

**Depende de:**

```text
B1 R7 (rollback_runner con monkeypatch y vendedor_token). B1 N8: ConfigPanel en solo lectura para quien no es administrador, getUsuarioActual, update_config sigue siendo solo ADMIN. B2-T0 useAvisos (avisar/avisarError). La usa U16-seguimiento, que registra su tarea. Comparte ConfigPanel con U16-seguimiento y U16-envio.
```

**Archivos que nombra el diseño:** `backend/app/core/tareas_automaticas.py`, `backend/main.py`, `backend/app/api/v1/erp_ventas.py`, `backend/launch_production.py`, `backend/tests/test_tareas_automaticas.py`, `frontend/src/lib/tareas.js`, `frontend/tests/test_tareas.mjs`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R10).


### U16-seguimiento — Recordatorio automático si el cliente no confirma

**Grupo:** Seguimiento a los 2 días · **Esfuerzo:** L · **Tareas del plan:** T1, T11, T13, T16, T17, T18, T21

**Para el usuario:** Cada envío de una solicitud o cotización programa un recordatorio para el cliente, por ejemplo a los 2 días. El recordatorio sale solo si el cliente no ha confirmado ni pedido cambios, y lleva un enlace nuevo, así nunca le llega uno vencido. Si después del último recordatorio sigue sin responder, el caso vuelve al asesor: queda escrito en la Actividad y la solicitud se pone en rojo. Cualquier contacto que anotes con el cliente corre el recordatorio. Los días, la cantidad de recordatorios y el horario se cambian en Configuración.

**Lo que vio y aprobó el usuario:** Cuando le envías una solicitud o una cotización al cliente y queda «Pendiente por confirmación», el sistema hace el seguimiento por ti. Si a los 2 días el cliente no ha confirmado, le manda un recordatorio con un enlace nuevo por el mismo medio que usaste (WhatsApp o correo), más el correo de respaldo.

Qué vas a ver:
- En la solicitud o la cotización, dentro de «Siguiente paso», un recuadro que dice cuándo saldrá el recordatorio (por ejemplo «Si el cliente no confirma, le recordaremos por WhatsApp el lunes 5 de octubre, 9:00 a. m.») y, después, que ya salió.
- La ventana del enlace también te lo dice al enviar.
- Todo queda en la Actividad.
- Si el cliente sigue sin responder después del último recordatorio, la Actividad te dice «Llámalo o escríbele» y la solicitud se pone en rojo de atrasada.

Cuándo se detienen o se corren:
- Se detienen solos si el cliente confirma, si pide cambios, si se cancela o se rechaza, o si cambias los productos o los precios.
- Si la vuelves a enviar, el conteo empieza de nuevo.
- Si anotas en el Chatter una llamada, un WhatsApp, un correo o una nota externa, el recordatorio se corre: cuenta los 2 días desde ese contacto.
- En una solicitud puedes pulsar «No enviar recordatorios».

En Configuración, un administrador puede cambiar los días, cuántos recordatorios se envían y el horario, o apagarlos.

Lo que tendrás que dejar listo tú:
- Para WhatsApp, una plantilla de recordatorio aprobada por Meta, con su nombre escrito en Configuración junto a la de envío.
- Para el correo, el correo del sistema configurado.

Mientras falte eso, Configuración te avisa que los recordatorios no pueden salir.

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- Si el cliente no confirma, ¿cuántos recordatorios automáticos le enviamos antes de pasarle el caso al asesor? (Después se puede cambiar en Configuración.) → **Uno solo, a los 2 días. Si 2 días después sigue sin responder, se le avisa al asesor** (= recomendada)
- ¿A qué hora pueden salir los recordatorios al cliente? → **Solo de lunes a sábado, entre 8 a. m. y 6 p. m. Si los 2 días se cumplen fuera de ese horario, sale a la siguiente hora hábil** (= recomendada)
- (Pregunta del diseño no mostrada) Cuando sale un recordatorio automático, ¿cuenta como contacto con el cliente para la alerta roja de «atrasada»? → quitada por el crítico: se aplica la recomendada (R7): «Sí, cuenta igual que una llamada o un WhatsApp. La solicitud se pone en rojo solo si el cliente sigue sin responder después del último recordatorio».

**Cambios (diseño):**

```text
DISEÑO
- El seguimiento vive en una tabla propia, NO en customer_requests ni en sales_quotations. Esas dos tablas tienen updated_at con onupdate=_now (models/erp_documents.py), así que guardar contadores en el documento reiniciaría la alerta de atraso en cada vuelta.
- Las paradas se detectan «al pasar»: la revisión solo actúa si el documento sigue en PENDIENTE_CONFIRMACION. Así no hay que tocar funciones que ya están muy cargadas por otros trabajos: confirmar_via_token, cancelar_solicitud, update_solicitud, update_cotizacion, _sincronizar_estado_solicitud_desde_cotizacion ni el «pedir cambios» de la página pública.
- El enlace actual vence a los 2 días (confirmation_tokens.TOKEN_TTL_DAYS = 2), así que cada recordatorio emite un enlace NUEVO.

BACKEND
1) Migración aditiva nueva, encadenada a la cabeza vigente: tras B1 es fa6_024; verificar `alembic heads` porque IVA y MARCA pueden agregar las suyas. Crea la tabla seguimientos_confirmacion:
   - id SERIAL PK.
   - document_type VARCHAR(10) NOT NULL ('SC'|'COT').
   - document_id INTEGER NOT NULL.
   - document_numero VARCHAR(30).
   - estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO' ('ACTIVO'|'AGOTADO'|'DETENIDO').
   - canal VARCHAR(20) NULL.
   - iniciado_at TIMESTAMP NOT NULL; iniciado_por VARCHAR(150).
   - ultimo_contacto_at TIMESTAMP NOT NULL.
   - proximo_at TIMESTAMP NULL.
   - recordatorios_enviados INTEGER NOT NULL DEFAULT 0.
   - ultimo_recordatorio_at TIMESTAMP NULL; ultimo_resultado JSON NULL.
   - motivo_fin VARCHAR(30) NULL; terminado_at TIMESTAMP NULL.
   - updated_at TIMESTAMP DEFAULT now().
   - UNIQUE(document_type, document_id): una fila por documento, que se reusa en cada envío. Índice (estado, proximo_at).
   - Modelo SeguimientoConfirmacion en backend/app/models/confirmation.py, junto a DocumentConfirmationToken. Fechas en UTC naive, como el resto.
2) backend/app/core/confirmation_tokens.py:
   - revoke_pending_tokens(db, document_type, document_id, excepto_raw: str | None = None): con excepto_raw, el WHERE agrega `AND token_hash <> :h` (sha256 del token crudo). Los llamadores de hoy no cambian.
   - Nuevo revocar_token(db, raw): UPDATE ... SET used_at=:now WHERE token_hash=:h AND used_at IS NULL.
   - Nuevo enlace_publico(raw) -> f'{FRONTEND_URL}/confirmar/{raw}'. Lo usan también los dos endpoints de envío en lugar de armar el link a mano (si U16-envio ya extrajo uno, se usa ese).
3) NUEVO backend/app/core/seguimiento_confirmacion.py. Usa los modelos directamente (CustomerRequest, SalesQuotation, ActivityLog) y su propio _registrar(db, tipo, doc, action, texto, extra) con ActivityLog y sin commit, para no importar erp_ventas (import cíclico).
   - Constantes:
     · USUARIO_SISTEMA = 'Sistema (seguimiento automático)'.
     · TZ_CO = timezone(timedelta(hours=-5)): Colombia no tiene horario de verano y así no se depende de tzdata en Windows.
     · MAX_RETRASO = timedelta(days=3).
     · REINICIA_ATRASO = True (lo fija la pregunta seguimiento_y_atraso).
   - CLAVES_CONFIG (defecto y límites):
     · seguimiento_auto_activo: 'true'.
     · seguimiento_dias: 2 (1-15).
     · seguimiento_max: 1 (1-5); el defecto lo fija la pregunta seguimiento_cuantos.
     · seguimiento_solo_horario: 'true' (lo fija la pregunta seguimiento_horario).
     · seguimiento_hora_inicio: 8 (0-23).
     · seguimiento_hora_fin: 18 (1-24, mayor que el inicio).
   - leer_config(db) -> dict: un solo SELECT key,value FROM admin_config WHERE key IN (...). Un valor inválido da el defecto.
   - validar_valor(clave, valor) -> str normalizado, o ValueError con un mensaje en español: 'Los días antes del recordatorio deben estar entre 1 y 15.', 'Los recordatorios deben ser entre 1 y 5.' o 'La hora final debe ser mayor que la inicial.'
   - siguiente_momento(desde_utc, cfg) -> UTC. Base = desde + cfg.dias. Si solo_horario, se pasa a hora de Colombia:
     · domingo, o hora >= fin → día siguiente a hora_inicio:00;
     · hora < inicio → ese día a hora_inicio:00;
     · se repite hasta que no sea domingo.
     Festivos: no se excluyen.
   - dentro_de_horario(ahora_utc, cfg) -> bool.
   - medio_posible(canal, doc) -> bool: (canal == 'WhatsApp' y doc.customer_phone) o doc.customer_email (el correo de respaldo siempre cuenta).
   - iniciar(db, tipo, doc, canal, user_name, ahora=None) -> dict. Hace upsert por (tipo, doc.id), sin commit (lo hace el llamador):
     · estado ACTIVO, canal, numero, iniciado_at = ultimo_contacto_at = ahora, iniciado_por = user_name;
     · recordatorios_enviados = 0; ultimo_recordatorio_at, ultimo_resultado, motivo_fin y terminado_at en None;
     · proximo_at = siguiente_momento(ahora, cfg).
     · Si NO medio_posible: estado DETENIDO, motivo_fin 'SIN_MEDIO_CLIENTE', proximo_at None.
     · Se programa aunque el seguimiento esté apagado en Configuración.
     · Devuelve resumen().
   - detener_por_cotizacion(db, sc_id, cot_numero, ahora): aplica si la fila de la SC está ACTIVA y la SC sigue PENDIENTE_CONFIRMACION. La deja DETENIDO con motivo 'COTIZACION_ENVIADA' y registra en la SC 'SEGUIMIENTO_DETENIDO': «Recordatorios de la solicitud detenidos: ahora se le recuerda la cotización {COT}». Caso U11: al confirmar la COT se confirma la SC, y así el cliente no recibe dos recordatorios.
   - posponer_por_contacto(db, tipo, doc_id, ahora): si la fila está ACTIVA → ultimo_contacto_at = ahora y proximo_at = siguiente_momento(ahora, cfg). El contador no cambia y no hay renglón propio (la nota del chatter ya queda).
   - detener_manual(db, tipo, doc, user_name, ahora): exige fila ACTIVA y documento PENDIENTE; si no, ValueError('No tiene recordatorios automáticos programados.'). La deja DETENIDO con motivo 'MANUAL' y registra 'SEGUIMIENTO_DETENIDO' «{user} detuvo los recordatorios automáticos.».
   - motivo_por_estado(doc):
     · no existe → 'DOCUMENTO_NO_EXISTE';
     · CONFIRMADA, CONVERTIDA o COTIZADA (heredado) → 'CONFIRMADO';
     · CANCELADA → 'CANCELADO';
     · RECHAZADA o VENCIDA → 'RECHAZADO';
     · BORRADOR, ASIGNADA o ENVIADA → 'VOLVIO_AL_ASESOR' (pidió cambios, se editó o se re-cotizó);
     · cualquier otro → 'SALIO_DE_PENDIENTE'.
   - resumen(db, tipo, doc, cfg=None) -> dict | None. Devuelve None si el documento no está PENDIENTE_CONFIRMACION o no hay fila. Si no, {estado, canal, recordatorios_enviados, max, proximo_at, ultimo_recordatorio_at, motivo_fin, ultimo_resultado: {canal, motivo, mensaje}}:
     · estado es 'APAGADO' si la fila está ACTIVA y cfg.activo es False; si no, el estado de la fila;
     · las fechas van en ISO con 'Z';
     · ultimo_resultado no lleva teléfonos.
   - correr_seguimientos(db, ahora=None, enviar=None) -> dict. Es la tarea que se registra en TAREAS.
     a) Antes de reclamar:
        · cfg = leer_config(db). Si no está activo → {'omitido':'apagado'}.
        · Si solo_horario y está fuera de horario → {'omitido':'fuera_de_horario'}.
        · medios = medios_configurados() → {'whatsapp': U16-envio.whatsapp_configurado(), 'correo': email.smtp_configurado()}. Si ninguno → {'omitido':'sin_medios'}: no se toca ninguna fila y Configuración lo avisa.
     b) Reclamo, en una transacción: SELECT ... WHERE estado='ACTIVO' AND proximo_at <= ahora ORDER BY proximo_at LIMIT 50 FOR UPDATE SKIP LOCKED. Por cada fila se carga el documento:
        · No está PENDIENTE_CONFIRMACION → DETENIDO, motivo_por_estado, sin renglón (el evento que lo sacó ya está en la Actividad).
        · ahora − proximo_at > MAX_RETRASO (el servidor estuvo apagado o sin medios) → DETENIDO, 'PLAZO_PASADO', y renglón 'RECORDATORIO_FALLIDO': «No se envió el recordatorio automático: venció hace más de 3 días sin poder enviarse. Escríbele al cliente si todavía aplica.».
        · recordatorios_enviados >= cfg.max → AGOTADO, proximo_at None, y renglón 'SEGUIMIENTO_AGOTADO': «El cliente no respondió {n} recordatorio(s) automático(s). Llámalo o escríbele: el sistema ya no le enviará más.». No toca updated_at: la alerta roja hace su trabajo.
        · En otro caso se reclama con un UPDATE condicional `SET recordatorios_enviados = recordatorios_enviados + 1, ultimo_recordatorio_at = :ahora, proximo_at = :siguiente WHERE id = :id AND estado = 'ACTIVO' AND recordatorios_enviados = :visto`. rowcount 1 gana; 0 significa que otra copia ya la tomó.
        · db.commit(). Se guarda primero y se envía después: si el proceso cae a mitad, ese recordatorio se pierde pero nunca se duplica.
     c) Envío uno por uno, cada uno en su try/except: _enviar_recordatorio(db, fila, doc, n, cfg, enviar or _enviar_por_defecto).
     d) Devuelve {'revisados','enviados','fallidos','agotados','detenidos'}.
   - _enviar_recordatorio:
     · raw = create_confirmation_token(db, tipo, doc.id); link = enlace_publico(raw).
     · res = enviar(db, tipo=tipo, doc=doc, canal=fila.canal, link=link, numero=n, total=cfg.max).
     · salio = res.whatsapp.enviado o res.correo.enviado.
     · Si salió:
       - revoke_pending_tokens(db, tipo, doc.id, excepto_raw=raw);
       - si REINICIA_ATRASO, doc.updated_at = ahora (igual que la nota externa de B2);
       - fila.ultimo_contacto_at = ahora; fila.ultimo_resultado = {...};
       - renglón 'RECORDATORIO_ENVIADO': «Recordatorio automático {n} de {max} enviado {por WhatsApp|por correo} con un enlace nuevo»;
       - extra_data = {'seguimiento': {numero, max, canal}, 'cambios': [{'etiqueta':'Canal','despues':...}, {'etiqueta':'Correo de respaldo' (o 'Correo'),'despues': correo.mensaje}, {'etiqueta':'Próximo paso','despues': 'Otro recordatorio el {fecha}' o 'Si no responde, se te avisará el {fecha}'}]}, sin clave 'campo', como _detalle_envio de H27;
       - commit.
     · Si NO salió:
       - revocar_token(db, raw): no queda vivo un enlace que nadie recibió, y el anterior no se pierde;
       - fila DETENIDO, con motivo 'SIN_MEDIO_CLIENTE' (cliente sin teléfono ni correo útil) o 'FALLO_ENVIO';
       - renglón 'RECORDATORIO_FALLIDO': «No se pudo enviar el recordatorio automático {n}: {mensajes de whatsapp y correo}. Escríbele al cliente o reenvíale el enlace.»;
       - no toca updated_at.
   - Contrato con U16-envio, que hace el envío real por Chatwoot: enviar_recordatorio_confirmacion(db, *, tipo, doc, canal, link, numero, total) -> {'whatsapp': {enviado, motivo, mensaje} | None, 'correo': {enviado, destino, motivo, mensaje}}. Reglas que este ítem exige:
     · WhatsApp → plantilla de recordatorio aprobada (fuera de la ventana de 24 h no se puede mandar texto libre) más el correo de respaldo;
     · Email → solo el correo, asunto 'Recordatorio: confirma tu {solicitud|cotización} {numero}';
     · Otro o None → solo el correo de respaldo, con whatsapp = {'enviado': False, 'motivo': 'CANAL_OTRO'};
     · el correo usa _enviar_correo_confirmacion de H27+H39, con sus mensajes exactos.
     Texto (U16-envio lo arma con el nombre de MARCA): «Hola {nombre}, te recordamos que tu {solicitud|cotización} {numero} de {empresa} está esperando tu confirmación. Revísala y confírmala aquí: {enlace}. Si quieres cambiar algo, en esa misma página puedes pedir cambios.» La plantilla tiene 4 variables: nombre, documento, empresa y enlace.
     _enviar_por_defecto importa ese módulo dentro de la función (para poder hacer monkeypatch). Si U16-envio todavía no existe, solo manda el correo y devuelve whatsapp {'enviado': False, 'motivo': 'NO_CONFIGURADO', 'mensaje': 'El WhatsApp automático no está configurado.'}.
4) backend/app/api/v1/erp_ventas.py:
   a) enviar_solicitud_para_confirmacion y enviar_cotizacion_para_confirmacion (versión de H27+H39, U15 y U16-envio; si U16-envio las unifica en un solo helper, va ahí, en un solo lugar):
      · Después de crear el token y antes del commit del estado: seg = seguimiento_confirmacion.iniciar(db, 'SC'|'COT', doc, canal, user_name). Queda en el mismo commit que PENDIENTE_CONFIRMACION.
      · En la COT, si cot.sc_id: detener_por_cotizacion(db, cot.sc_id, cot.numero, ahora).
      · _detalle_envio (H27) suma {'etiqueta':'Recordatorio automático','despues': fecha_co(proximo_at) | 'apagado en Configuración' | 'no habrá: el cliente no tiene teléfono ni correo'}.
      · La respuesta suma 'seguimiento': resumen(...).
   b) get_solicitud y get_cotizacion: d['seguimiento'] = seguimiento_confirmacion.resumen(db, tipo, doc). Es una consulta por clave única. Solo en el detalle: _sc_dict y _cot_dict no cambian (sin N+1 en las listas).
   c) _agregar_nota (B2 U6+H22): si reinicia_atraso(tipo) es True (LLAMADA, WHATSAPP, CORREO o NOTA_EXTERNA, según la decisión del usuario) y la entidad es SC o COT → posponer_por_contacto(...) antes del commit único.
   d) Rutas nuevas, roles ADMIN y ASESOR: POST /solicitudes/{sc_id}/seguimiento/detener y POST /cotizaciones/{cot_id}/seguimiento/detener. Responden 404 si el documento no existe, 409 con el mensaje del ValueError y 200 {'status':'success','data': resumen}. user_name = nombre_de_usuario(user) del chatter de B2.
   e) update_config: para las claves de CLAVES_CONFIG llama validar_valor; si falla, 422 con su mensaje. Además combina el body con lo guardado para exigir hora_fin > hora_inicio.
   f) _CONFIG_LECTURA_GENERAL (N8): agregar las 6 claves seguimiento_* (los asesores las ven en solo lectura).
   g) get_alertas: cada item de sc_sin_atender y cot_sin_atender suma 'seguimiento_estado' (AGOTADO, DETENIDO o None). Sale de UNA consulta IN por tipo, sin N+1. Sirve para el chip «Sin respuesta al recordatorio» del Bloque 4.
5) backend/app/core/textos_actividad.py (H7): si tiene etiquetas de acción, agregar RECORDATORIO_ENVIADO 'Recordatorio automático', RECORDATORIO_FALLIDO 'Recordatorio no enviado', SEGUIMIENTO_AGOTADO 'Sin respuesta al recordatorio' y SEGUIMIENTO_DETENIDO 'Recordatorios detenidos'.
6) tareas_automaticas.TAREAS (ítem TAREAS): ('seguimiento_confirmacion', 'app.core.seguimiento_confirmacion:correr_seguimientos').

FRONTEND
7) NUEVO frontend/src/lib/seguimiento.js (JS puro):
   - fechaHoraCO(iso) → 'lunes 5 de octubre, 9:00 a. m.', con Intl es-CO y timeZone 'America/Bogota'; un iso sin zona se toma como UTC.
   - canalTexto(canal) → 'por WhatsApp' | 'por correo' | 'por correo de respaldo'.
   - textoSeguimiento(s) → {tono, titulo, texto} o null:
     · ACTIVO sin envíos → 'info': «Si el cliente no confirma, le recordaremos {canal} el {fecha} (1 de {max}).»
     · ACTIVO con envíos → 'ok': «Recordatorio {n} de {max} enviado el {fecha}.» y luego «El próximo sale el {fecha}.» o «Si no responde, el {fecha} se te avisará para que lo llames.»
     · AGOTADO → 'alerta': «El cliente no respondió el recordatorio. Llámalo o escríbele.»
     · DETENIDO MANUAL → 'gris': «Detuviste los recordatorios. Si la reenvías, vuelven a empezar.»
     · DETENIDO SIN_MEDIO_CLIENTE, FALLO_ENVIO o PLAZO_PASADO → 'alerta', con el motivo y «Escríbele al cliente o reenvíale el enlace.»
     · DETENIDO COTIZACION_ENVIADA → 'gris': «Los recordatorios siguen en la cotización.»
     · APAGADO → 'gris': «Los recordatorios automáticos están apagados en Configuración.»
   - puedeDetener(s) = s?.estado === 'ACTIVO'.
   - validarConfigSeguimiento(cfg) → mensaje o null, con los mismos límites que el backend.
8) NUEVO frontend/src/app/dashboard/ventas/seguimiento.tsx: TarjetaSeguimiento({tipoDoc, doc, onCambio}).
   - Recuadro con el icono BellRing y textoSeguimiento(doc.seguimiento).
   - Si puedeDetener, botón de texto 'No enviar recordatorios'. Pide confirmar() (useAvisos de B2): «El cliente no recibirá recordatorios automáticos de esta {solicitud|cotización}. Se reactivan si la reenvías.» Luego hace POST .../seguimiento/detener y llama onCambio().
   - Los errores van con avisarError.
9) solicitud/[id]/page.tsx:
   - renderSiguientePaso, rama PENDIENTE_CONFIRMACION: <TarjetaSeguimiento tipoDoc="SC" doc={solicitud} onCambio={() => loadSolicitud({silencioso:true})}/> dentro de la NextStepCard, encima de 'Reenviar enlace de confirmación'.
   - ACTIVITY_STYLE, ACTIVITY_TYPE_LABELS y ACTIVITY_TYPE_ORDER suman los 4 actions: RECORDATORIO_ENVIADO (BellRing, sky), RECORDATORIO_FALLIDO (AlertTriangle, amber), SEGUIMIENTO_AGOTADO (PhoneCall, rose) y SEGUIMIENTO_DETENIDO (BellOff, slate).
10) cotizacion/[id]/page.tsx: renderSiguientePaso, rama PENDIENTE_CONFIRMACION ('Esperando confirmación del cliente'): lo mismo con tipoDoc="COT" y loadCotizacion. ACTIVITY_STYLE con los 4 actions.
11) flujo.tsx, EnlaceConfirmacionModal (con las props correo/canal de H27 y lo que agregue U16-envio): nueva prop opcional seguimiento.
    - ACTIVO → línea gris «Si el cliente no confirma, le recordaremos {canal} el {fecha}.»
    - SIN_MEDIO_CLIENTE → línea ámbar «No habrá recordatorio automático: el cliente no tiene teléfono ni correo.»
    - Los que la pasan: solicitud/[id], cotizacion/[id] y el hubEnlace del Hub (H27), con d.seguimiento.
12) ventas/page.tsx:
    a) ConfigPanel, sección nueva 'Seguimiento de confirmación' (BellRing, sky):
       · Toggle seguimiento_auto_activo «Recordar al cliente si no confirma», con la descripción «Si una solicitud o cotización sigue sin confirmar, se le envía al cliente un recordatorio por el mismo medio, con un enlace nuevo y el correo de respaldo.»
       · Número seguimiento_dias: «Días sin respuesta antes del recordatorio» (1-15).
       · Número seguimiento_max: «Cuántos recordatorios» (1-5).
       · Toggle seguimiento_solo_horario «Solo en horario laboral». En ON muestra dos selects de hora y la ayuda «Lunes a sábado. Si el plazo se cumple fuera de horario, sale a la siguiente hora hábil.»
       · Aviso ámbar si seguimiento_dias > alerta_sc_dias o > alerta_cot_dias: «Con estos días, la solicitud se pondrá roja antes de que salga el recordatorio.»
       · Si /tareas/estado trae resumen.seguimiento_confirmacion.omitido == 'sin_medios': recuadro ámbar «Los recordatorios no pueden salir: falta configurar el WhatsApp automático o el correo del sistema.»
       · Al pie, la línea de estado de TAREAS.
       · Valores iniciales con diasAlerta(cfg, clave, defecto) de N8. save() valida con validarConfigSeguimiento y muestra el error del 422. Quien no es administrador lo ve en solo lectura (N8).
    b) ActivitiesPanel (B2): colores y etiquetas de los 4 actions.
13) frontend/package.json: '&& node tests/test_seguimiento.mjs'.
```

**Pruebas (diseño):**

```text
Backend: nuevo backend/tests/test_seguimiento_confirmacion.py, solo con `python tests/rollback_runner.py test_seguimiento_confirmacion` (sin parametrize; los casos con variantes van en un bucle dentro de la prueba).
- En TODAS: monkeypatch de 'app.core.email.send_email' y 'app.core.email.smtp_configurado' con fakes, y del envío por WhatsApp de U16-envio con un fake. Nunca se llama a Chatwoot, SMTP ni Meta.
- Casi todas llaman a correr_seguimientos(db, ahora=T, enviar=fake) con T fijo, dentro de horario (un martes 10:00 CO = 15:00 UTC).
- Fixtures: SC ASIGNADA con productos y asesor (helper _sc de test_envio_confirmacion_canal_y_correo de H27) y COT con productos y total_cop.

1) test_enviar_sc_programa_el_recordatorio: POST enviar-confirmacion {canal:'WhatsApp'}. Afirma:
   - fila ACTIVO, recordatorios 0, canal 'WhatsApp', proximo_at == siguiente_momento(iniciado_at);
   - json.seguimiento.estado == 'ACTIVO';
   - el renglón ESTADO_CHANGED trae en cambios la etiqueta 'Recordatorio automático'.
2) test_siguiente_momento_respeta_horario (función pura):
   - viernes 17:30 CO + 2 días = domingo → lunes 8:00 CO (13:00 UTC);
   - martes 20:00 + 2 → viernes 8:00;
   - martes 10:00 + 2 → jueves 10:00;
   - solo_horario False → exacto.
3) test_recordatorio_sale_y_cambia_el_enlace:
   - Preparación: SC PENDIENTE con un token viejo vigente y fila ACTIVO con proximo_at < T; el fake devuelve whatsapp enviado True.
   - Afirma: enviados 1; recordatorios 1; renglón 'RECORDATORIO_ENVIADO' con la descripción exacta 'Recordatorio automático 1 de 1 enviado por WhatsApp con un enlace nuevo'; sc.updated_at == T; un solo token vivo, cuyo hash es el del link que recibió el fake; el viejo tiene used_at.
4) test_no_se_envia_dos_veces: dos llamadas con el mismo T → el fake se llamó 1 vez. Además, _reclamar(db, fila.id, visto=0) devuelve True la primera vez y False la segunda.
5) test_se_detiene_si_salio_de_pendiente: en un bucle, SC en CONFIRMADA, CANCELADA y ASIGNADA con fila vencida. Afirma: el fake no se llamó; fila DETENIDO con 'CONFIRMADO', 'CANCELADO' y 'VOLVIO_AL_ASESOR'; ninguna Actividad nueva.
6) test_agotado_avisa_al_asesor: recordatorios 1 = max 1 y proximo_at < T → AGOTADO; renglón 'SEGUIMIENTO_AGOTADO' que contiene 'Llámalo o escríbele'; sc.updated_at sin cambios.
7) test_fallo_no_deja_enlace_vivo_ni_mata_el_viejo: el fake devuelve los dos medios sin enviar (FALLO_ENVIO). Afirma: DETENIDO 'FALLO_ENVIO'; renglón 'RECORDATORIO_FALLIDO'; el token nuevo revocado; el token viejo sigue con used_at None; updated_at sin cambios.
8) test_reenviar_reinicia_el_conteo: fila AGOTADO + POST enviar-confirmacion (reenvío de SC) → ACTIVO, recordatorios 0, motivo_fin None.
9) test_contacto_externo_pospone (necesita B2 U6+H22):
   - fila ACTIVO; POST /solicitudes/{id}/actividad {action:'CHATTER', tipo:'NOTA_EXTERNA', description:'Hablé con el cliente'} → proximo_at == siguiente_momento(≈ ahora) y el contador igual;
   - con tipo 'NOTA' no cambia.
10) test_enviar_cot_detiene_el_de_la_sc: SC PENDIENTE con fila ACTIVO y COT BORRADOR vinculada (U11); POST /cotizaciones/{id}/enviar-confirmacion → fila de la SC DETENIDO 'COTIZACION_ENVIADA' más un renglón en la SC; fila de la COT ACTIVO.
11) test_detener_manual: con vendedor_token → 200, DETENIDO 'MANUAL' y renglón; una segunda vez → 409; id inexistente → 404.
12) test_no_envia_si_apagado_fuera_de_horario_o_sin_medios: en un bucle:
    - admin_config seguimiento_auto_activo 'false' → {'omitido':'apagado'};
    - T en domingo → 'fuera_de_horario';
    - smtp_configurado False y whatsapp_configurado False → 'sin_medios'.
    En los tres casos las filas quedan intactas.
13) test_plazo_pasado: proximo_at = T − 4 días → no envía; DETENIDO 'PLAZO_PASADO' con renglón.
14) test_config_valida_limites:
    - PATCH /ventas/config {'seguimiento_dias':'0'} → 422 con el mensaje exacto;
    - {'seguimiento_hora_inicio':'19','seguimiento_hora_fin':'8'} → 422;
    - {'seguimiento_dias':'3'} → 200;
    - GET /ventas/config con vendedor_token incluye seguimiento_dias.
15) test_detalle_y_alertas:
    - GET /solicitudes/{id} trae data.seguimiento.proximo_at terminado en 'Z';
    - una SC CONFIRMADA trae seguimiento None;
    - get_alertas con una SC atrasada y fila AGOTADO → item.seguimiento_estado 'AGOTADO'.
16) test_sin_medio_del_cliente: SC sin teléfono ni correo, enviada por 'Otro' → fila DETENIDO 'SIN_MEDIO_CLIENTE' y json.seguimiento.motivo_fin == 'SIN_MEDIO_CLIENTE'.

Frontend: frontend/tests/test_seguimiento.mjs.
- fechaHoraCO('2026-10-05T14:00:00') contiene 'lunes 5 de octubre' y '9:00'.
- textoSeguimiento para cada estado y motivo (tono y frase clave).
- puedeDetener.
- validarConfigSeguimiento: 0, 16, inicio ≥ fin.
- Luego npm test y npx tsc --noEmit.

Manual (nada sale, porque hoy no hay SMTP ni plantilla):
- Enviar una SC DEMO y ver la tarjeta y la línea en la ventana del enlace.
- Con SQL de solo prueba en erp_test, poner proximo_at en el pasado.
- Con la variable de TAREAS en 1 en esa consola, pulsar 'Revisar ahora'.
- Configuración debe mostrar 'sin medios' y la fila no debe cambiar.
```

**Comportamiento esperado:**

```text
- Al enviar o reenviar una SC o una COT (desde el detalle o arrastrando la tarjeta en el Hub), queda programado un recordatorio para dentro de N días (2 por defecto). Si el plazo cae fuera del horario, sale a la siguiente hora hábil (lunes a sábado, 8:00-18:00 hora de Colombia, según la respuesta). La Actividad del envío y la ventana del enlace dicen cuándo.
- Si la SC o la COT sigue en Pendiente por confirmación al llegar la hora, en la vuelta siguiente de la revisión (≤ 10 min) sale el recordatorio con un enlace NUEVO:
  · por WhatsApp con plantilla, si el envío fue por WhatsApp, más el correo de respaldo;
  · solo por correo, si fue por correo;
  · solo el correo de respaldo, si fue por «Otro».
  El enlace anterior deja de servir solo cuando el nuevo salió bien.
- Recordatorio enviado: renglón «Recordatorio automático 1 de 1 enviado por WhatsApp con un enlace nuevo». Cuenta como contacto con el cliente, así que la alerta de atraso vuelve a contar desde ahí (según la respuesta).
- Si se usaron todos los recordatorios y pasan N días más sin respuesta: renglón «El cliente no respondió… Llámalo o escríbele». El documento ya está en rojo (alertas_resumen y get_alertas), get_alertas lo marca con seguimiento_estado 'AGOTADO' y no salen más recordatorios.
- Se detiene solo, sin renglón extra, cuando el documento sale de Pendiente: el cliente confirmó (paso-22 sigue igual), pidió cambios, se canceló, se rechazó, se editó o se re-cotizó.
- Si se reenvía, el conteo empieza de cero.
- Enviar la COT de una SC que sigue pendiente (U11) detiene los recordatorios de la SC, con un renglón en su Actividad: así el cliente recibe uno solo.
- Una llamada, un WhatsApp, un correo o una nota externa en el Chatter corren el próximo recordatorio N días desde ese contacto. Una nota interna no hace nada.
- 'No enviar recordatorios' lo detiene a mano y queda en la Actividad.
- Si no hay forma de llegarle al cliente (sin teléfono para WhatsApp y sin correo), el envío ya avisa que no habrá recordatorio.
- Si el envío falla, queda «Recordatorio no enviado» con la causa (por ejemplo «el envío de correos no está configurado») y no se reintenta. El documento sigue su alerta normal.
- Si el sistema no tiene ningún medio configurado, no toca nada y Configuración lo avisa.
- Un recordatorio vencido hace más de 3 días (servidor apagado) no se envía, y la Actividad lo dice.
- Con el seguimiento apagado en Configuración no sale nada, y la tarjeta dice «apagados en Configuración».
- Nunca se le envía dos veces el mismo recordatorio a un cliente, aunque el servidor tenga 2 copias.
```

**Datos existentes:**

```text
No se corrige nada. Consulta de solo lectura para informar cuántos documentos quedan fuera del seguimiento (los que hoy esperan confirmación):
SELECT 'SC' AS tipo, id, numero, updated_at FROM customer_requests WHERE estado='PENDIENTE_CONFIRMACION' AND eliminada_at IS NULL
UNION ALL
SELECT 'COT', id, numero, updated_at FROM sales_quotations WHERE estado='PENDIENTE_CONFIRMACION'
ORDER BY updated_at;
Si el usuario quisiera programarles recordatorio, sería un script aparte (DRY-RUN, solo las enviadas en los últimos 7 días) y solo con su OK. No es la recomendación: la mayoría tiene el enlace vencido y, para un cliente, un recordatorio de algo viejo confunde.
```

**Datos del usuario:**

```text
Las solicitudes y cotizaciones que hoy ya esperan confirmación no reciben recordatorios automáticos. Solo los reciben las que se envíen o se reenvíen después del cambio. Si quieres que una de antes tenga recordatorio, basta con reenviarla. No se cambia ningún dato guardado.
```

**Riesgos:**

```text
- Una vez a lo sumo: si el servidor cae entre el reclamo y el envío, ese recordatorio se pierde sin renglón. Es raro, y es preferible a escribirle dos veces al cliente.
- Los fallos pasajeros (Chatwoot o SMTP caídos) no se reintentan: el seguimiento se detiene con un aviso en la Actividad y el asesor reenvía. Así no hay reintentos en bucle.
- WhatsApp fuera de la ventana de 24 h exige una plantilla aprobada por Meta, y cada conversación de plantilla tiene costo. El límite de 1 a 5 recordatorios lo acota.
- Hoy SMTP no está configurado y no hay plantilla, así que no saldrá nada hasta que el usuario los configure. Lo avisa Configuración ('sin medios').
- Cada recordatorio cambia el enlace: si el cliente abre el mensaje anterior, ve «enlace no válido». Conviene que la página pública (U17+H28) diga «Este enlace fue reemplazado por uno más reciente: revisa el último mensaje».
- Con REINICIA_ATRASO=True, un recordatorio enviado pone doc.updated_at, igual que la nota externa de B2. Si el usuario elige lo contrario, solo cambia la constante.
- Si los días de alerta son menores que los del seguimiento, el documento se pone rojo antes del recordatorio. Configuración lo avisa.
- Solo se excluyen los domingos; los festivos de Colombia no.
- Los mensajes que el cliente manda por WhatsApp (webhook de Chatwoot) no corren el recordatorio: hoy no hay forma de unir esa conversación con la SC. Queda fuera.
- La parada «al pasar» deja filas en ACTIVO hasta la siguiente revisión. La tarjeta y el resumen no se equivocan, porque solo se muestran mientras el documento está Pendiente.
- Choques de archivo:
  · enviar_solicitud_para_confirmacion y enviar_cotizacion_para_confirmacion: H27 (B1), U15 (B2) y U16-envio;
  · _agregar_nota: B2 U6+H22;
  · renderSiguientePaso de la SC: U12 y U15 (B2);
  · renderSiguientePaso de la COT;
  · EnlaceConfirmacionModal: H27 y U16-envio;
  · ConfigPanel: N8, TAREAS y U16-envio;
  · get_alertas: cruce de B2 'alertas con U11'.
  Hay que implementarlo sobre B1 y B2 integrados y DESPUÉS de U16-envio.
- El nombre del cliente y el número del documento viajan a Chatwoot y a Meta, como ya pasa con el envío.
```

**Depende de:**

```text
TAREAS (revisor automático; aquí se registra la tarea).
U16-envio: envío por WhatsApp/Chatwoot con plantilla, whatsapp_configurado(), configuración de las plantillas y el contrato enviar_recordatorio_confirmacion. Además comparte enviar_solicitud_para_confirmacion, enviar_cotizacion_para_confirmacion y EnlaceConfirmacionModal.
MARCA: nombre de la empresa en el texto.
U17+H28 y U22+H38: el «pedir cambios» de la página pública saca el documento de Pendiente; texto del enlace reemplazado.
Bloque 1:
- H27+H39: _canal_de_envio, _enviar_correo_confirmacion, _detalle_envio y smtp_configurado.
- N8: _CONFIG_LECTURA_GENERAL, diasAlerta y ConfigPanel en solo lectura.
- H29: _log con commit=False y loadSolicitud silencioso.
- H7: textos_actividad.
- R7: el runner.
Bloque 2:
- U6+H22: _agregar_nota, reinicia_atraso y el tipo NOTA_EXTERNA del cambio pedido por el usuario.
- U15: etiqueta 'Pendiente por confirmación'.
- U11: COT antes de confirmar la SC.
- U12: siguiente paso dentro de la pestaña Actividad.
- B2-T0 useAvisos y el cruce 'alertas con U11'.
```

**Archivos que nombra el diseño:** `backend/alembic/versions/fa6_0NN_seguimientos_confirmacion.py`, `backend/app/models/confirmation.py`, `backend/app/core/confirmation_tokens.py`, `backend/app/core/seguimiento_confirmacion.py`, `backend/app/core/tareas_automaticas.py`, `backend/app/core/textos_actividad.py`, `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_seguimiento_confirmacion.py`, `frontend/src/lib/seguimiento.js`, `frontend/tests/test_seguimiento.mjs`, `frontend/src/app/dashboard/ventas/seguimiento.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/flujo.tsx`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/package.json` (la lista que manda es la de **Files** de la tarea y R10).


### IVA — IVA por producto en cotización, pedido y orden de pago

**Grupo:** IVA por producto · **Esfuerzo:** L · **Tareas del plan:** T4, T5, T13, T17, T19, T21

**Para el usuario:** Desde ahora, cada línea de la cotización lleva su tarifa de IVA. El servidor calcula, en pesos enteros, el descuento de cada línea, su base, su IVA y su total con IVA. La cotización guarda el IVA total, y el total que paga el cliente ya lo incluye. Con ese total se calculan el anticipo, el pedido y la orden de pago. En la pantalla de la cotización y en la del pedido se ve el IVA de cada producto y un resumen por tarifa (19%, 5%, Exento, Excluido), cada una con su base. Cambiar el IVA de una línea cuenta como cambio de precio: si el cliente ya había confirmado, tiene que confirmar otra vez. Las cotizaciones y pedidos anteriores no se recalculan solos.

**Lo que vio y aprobó el usuario:** En la calculadora cada producto tiene su IVA (19%, 5%, Exento o Excluido), que sale de su ficha y puedes cambiar en la línea. El precio que calculas con el margen es antes de IVA, y el IVA se suma encima. Abajo ves el subtotal, el descuento, el IVA de cada tarifa con su base y el total que paga el cliente, todo en pesos exactos y sin descuadres. El anticipo se calcula sobre el total con IVA, así que «Contado» cobra todo, IVA incluido. En la cotización, cada producto muestra cuánto es su IVA, su total con IVA y su parte del anticipo. El pedido y la orden de pago heredan estos valores, y las páginas que ve el cliente mostrarán el IVA por tarifa. Las cotizaciones y pedidos que ya existen no cambian: dirán «IVA no discriminado» hasta que los vuelvas a cotizar. Esto aplica las respuestas recomendadas; si eliges otra opción, cambia lo que dice este párrafo.

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- El precio que calcula la calculadora (costo + margen), ¿es antes de IVA o ya incluye el IVA? → **Antes de IVA: el IVA se suma encima y el cliente paga precio + IVA (tu margen queda completo)** (= recomendada)
- ¿Sobre qué valor se calcula el anticipo? → **Sobre el total con IVA, que es lo que paga el cliente (con Contado se cobra todo, IVA incluido)** (= recomendada)

**Cambios (diseño):**

```text
REGLA DE CÁLCULO (backend y frontend idénticos, solo con enteros)
Para cada línea i, con unit_i = redondear_peso(unit_price_cop), qty_i > 0 y tarifa_i válida:
1. bruto_i = redondear_peso(unit_i × qty_i). Se guarda como total_cop, igual que hoy: «total sin IVA» y antes del descuento.
2. subtotal = Σ bruto_i, sin cambiar lo que significa subtotal_cop hoy (antes de descuento e IVA).
3. El descuento global se toma con 2 decimales, como puntos básicos enteros: pb = round(descuento_pct × 100). D = redondear_peso(subtotal × pb / 10000).
4. D se reparte entre las líneas por el método del mayor residuo, en proporción a bruto_i, con la función repartir_proporcional (abajo): d_i. Σd_i = D exacto.
5. base_i = bruto_i − d_i, que es la base gravable de la línea.
6. iva_i = redondear_peso(base_i × pct_i / 100), en la línea y con ROUND_HALF_UP. En JS, Math.round(base*pct/100): base×pct es entero y la división queda bien redondeada, así que los empates .5 son exactos.
7. total_con_iva_i = base_i + iva_i.
8. IVA = Σ iva_i y total = subtotal − D + IVA = Σ total_con_iva_i. El IVA total nunca se redondea aparte, así que siempre cuadra.
9. El resumen por tarifa sigue ORDEN_TARIFAS: base = Σ base_i e iva = Σ iva_i de cada tarifa presente.

repartir_proporcional(montos, objetivo) usa solo enteros:
- (q_i, r_i) = divmod(objetivo × m_i, Σm). Se suma 1 a las (objetivo − Σq) líneas con mayor r_i; en empate, a la primera.
- Si objetivo ≤ 0 o Σm ≤ 0, devuelve ceros.
- En JS se hace con BigInt, porque objetivo × m puede pasar de 2^53.

BACKEND
1) Migración nueva backend/alembic/versions/fa6_0NN_iva_cotizacion.py, encadenada después de la de IVA-PRODUCTO: sales_quotations ADD COLUMN tax_cop NUMERIC(14,2) NOT NULL server_default '0'. Lleva el mismo nombre y significado que sale_orders.tax_cop, que ya existe desde fa4_002. sale_order_lines_erp.tax_pct también existe ya.
2) backend/app/models/erp_documents.py SalesQuotation: `tax_cop = Column(Numeric(14, 2), nullable=False, server_default='0', default=0)  # IVA total (en el API: iva_cop)`.
3) backend/app/core/ventas_dinero.py, sobre U19 del Bloque 2:
   - Se extrae `repartir_proporcional(montos, objetivo)` con divmod entero (la regla de arriba).
   - repartir_anticipo_por_linea queda como envoltura y da el mismo resultado.
   - monto_linea(p) prefiere p['total_con_iva_cop'] si no es None. Si no, sigue como hoy (total_cop, o unit × qty).
4) backend/app/core/iva.py (creado en IVA-PRODUCTO) agrega:
   - lineas_con_tarifa(productos) -> 'todas' | 'ninguna' | 'mezcla'.
   - calcular_totales_cotizacion(productos, descuento_pct) -> dict con lineas (copias NUEVAS de cada dict, con iva_tarifa normalizada, iva_pct, unit_price_cop, total_cop=bruto, descuento_cop, base_iva_cop, iva_cop y total_con_iva_cop), subtotal_cop, descuento_cop, iva_cop, total_cop e iva_por_tarifa. Lanza ValueError con mensaje legible, nombrando la línea, si una tarifa no es válida, qty ≤ 0 o el descuento está fuera de 0..100.
   - resumen_iva_por_tarifa(productos) -> [{tarifa, etiqueta, base_cop, iva_cop}], a partir de los campos ya guardados en las líneas.
   - desglose_documento(doc) -> {iva_discriminado, iva_cop, descuento_cop, iva_por_tarifa}:
     - iva_discriminado = hay líneas y todas tienen iva_tarifa.
     - descuento_cop = max(0, redondear_peso(subtotal) + redondear_peso(tax) − redondear_peso(total)).
     - iva_por_tarifa = [] si no está discriminado.
5) backend/app/api/v1/erp_ventas.py:
   - _cot_dict(cot) y _ven_dict(v): agregan 'iva_cop': float(tax_cop or 0) y **desglose_documento(doc). Es puro y no consulta la base.
   - Nuevo `_validar_iva_del_body(body)`, que se llama junto a _validar_precios_productos y antes de tocar nada. Si body['productos'] tiene líneas:
     - Con tarifa en unas líneas y en otras no: 422 «Indica la tarifa de IVA de todas las líneas (falta en '<nombre>').»
     - Si todas la tienen: se ejecuta calcular_totales_cotizacion en seco, y su ValueError se convierte en 422.
   - Nuevo `_aplicar_iva(cot, body)`:
     - Si las líneas de cot.productos (después del loop) tienen todas tarifa y el body trae productos, descuento_pct, subtotal_cop, total_cop o recotizacion, se calcula todo.
     - Asigna cot.productos = r['lineas'] como una LISTA NUEVA, para evitar el bug de dirty-check del JSON de la memoria del proyecto. También asigna cot.subtotal_cop, cot.tax_cop y cot.total_cop con lo calculado.
     - Los subtotal_cop y total_cop del body se ignoran. Si el total del body difiere del calculado, se escribe logger.warning (solo servidor).
     - Sin tarifas (modo anterior) no toca nada: los totales del body se guardan como hoy (H42).
   - update_cotizacion: llamar _aplicar_iva justo después de `for k in allowed` y del bloque del anticipo manual, ANTES de `cambia_total`. Así el anticipo de H36/R3 se recalcula con el total que ya incluye el IVA. Además:
     - PRICE_FREEZE_FIELDS agrega 'tax_cop' y _PRICE_DECIMAL_FIELDS agrega 'tax_cop'.
     - _freeze_producto_proyectado agrega p.get('iva_tarifa') a la tupla, porque el cliente ve el IVA de cada línea. Vincular al catálogo (sku_id) sigue sin romper la confirmación.
   - create_cotizacion: _validar_iva_del_body y, después de crear el objeto SalesQuotation y antes del anticipo con SC, el mismo cálculo. Sin SC, anticipo_cop = min(anticipo del body, total con IVA).
   - update_pedido: 'iva_cop' en el body → v.tax_cop = _monto_en_pesos(body['iva_cop'], 'iva_cop'). Es lo que manda la propagación de la re-cotización.
6) backend/app/core/cambios_documento.py:
   - _PRECIOS agrega 'tax_cop': 'IVA'. _DINERO y _AFECTA_PRECIO agregan 'tax_cop'.
   - _lineas agrega 'iva': _texto(p.get('iva_tarifa')).
   - _cambios_productos: si a['iva'] != n['iva'], agrega _cambio('productos', f'{nombre} — IVA', etiqueta(a), etiqueta(n)).
   - describir (RECOTIZADA): si el tax_cop de después es > 0, agrega f' (IVA incluido: {_miles(tax)})' a 'Cotización calculada: total …' y a 'Re-cotización: total A -> B (…)'. Con tax 0 los textos quedan como hoy.
7) backend/app/api/v1/erp_ventas_fase4.py:
   - convertir_cotizacion_a_venta: SaleOrder(... tax_cop=redondear_peso(cot.tax_cop) ...).
   - En la rama JSON (cot.productos), cada SaleOrderLineErp lleva:
     - unit_price_cop = el unitario SIN IVA.
     - descuento_pct = p['descuento_pct'] si viene y es > 0; si no, cot.descuento_pct. Así el descuento global queda en cada línea.
     - tax_pct = Decimal(str(p['iva_pct'])) si la línea tiene iva_tarifa; si no, 0.
   - En la rama SalesQuotationLine, tax_pct sale de la línea JSON que se empareja en el mismo bucle que ya busca 'modalidad'; si no hay pareja, 0.
   - cancel_sale_order_line, al recalcular los totales: l_base = redondear_peso(vendible × unit); l_disc = redondear_peso(l_base × desc/100); l_sub = l_base − l_disc; l_tx = redondear_peso(l_sub × tax_pct/100). so.tax_cop = Σl_tx y so.total_cop = Σ(l_sub + l_tx), en pesos enteros. so.subtotal_cop = Σl_base si so.cot_id (subtotal antes de descuento, como en la COT); si no, Σl_sub, que es lo que hace hoy el pedido canónico.
8) backend/app/api/v1/confirmacion_publica.py (contrato para U22/U23):
   - _productos_publicos agrega 'total_cop', 'iva_etiqueta' (None si no está discriminado) y 'total_con_iva_cop'. NUNCA cost_usd, flete ni margen.
   - _cot_confirmacion_dict agrega 'subtotal_cop', 'descuento_pct' y **desglose_documento(cot).
   - El documento del PVEN de U23 usa el mismo desglose_documento.

FRONTEND
9) frontend/src/lib/iva.js (de IVA-PRODUCTO) agrega:
   - repartirProporcional(montos, objetivo), con BigInt.
   - calcularTotalesCotizacion(productos, descuentoPct), con el mismo resultado y las mismas claves que el backend (lineas, subtotal_cop, descuento_cop, iva_cop, total_cop, iva_por_tarifa).
   - desgloseDocumento(doc). Usa redondearPeso de pesos.js.
10) cotizacion-client.tsx CalculadorModal, sobre T10 del Bloque 1 y H40 del Bloque 2:
   - Prop nueva tarifaIvaDefecto.
   - Cada fila lleva iva_tarifa, que sale de p.iva_tarifa, de cot.tarifas_producto[i] o de tarifaIvaDefecto, y _tarifaProducto (cot.tarifas_producto[i] o sel.tarifa_iva).
   - onSelect: iva_tarifa = sel.tarifa_iva || tarifaIvaDefecto. onTyping y onFreeText conservan la tarifa.
   - Columna nueva «IVA» con <select> (19% / 5% / Exento / Excluido). Debajo, en text-[10px], el IVA de la línea ('+$235.717').
   - Si sku_id && _tarifaProducto && iva_tarifa !== _tarifaProducto, se ve en ámbar «El producto tiene IVA 5%».
   - La columna «Total COP» pasa a llamarse «Total sin IVA». maxWidth del modal: 4xl.
   - Los totales salen de calcularTotalesCotizacion(computedProd, descuento): Subtotal, Descuento (x%), un renglón por tarifa ('IVA 19% sobre $1.537.753 · $292.173'; 'Exento sobre $X · $0') y TOTAL (con IVA).
   - El anticipo en solo lectura de T10 se calcula sobre ese total.
   - handleSave manda en cada producto iva_tarifa (y los campos de hoy), más subtotal_cop/total_cop de lib/iva.js. El servidor recalcula y gana.
11) cotizacion/[id]/page.tsx:
   - Pasa tarifaIvaDefecto={cotizacion.iva_tarifa_defecto} al CalculadorModal.
   - commitCalcSave usa la RESPUESTA del PATCH (r.data) para propagar al PVEN: productos, subtotal_cop, iva_cop, descuento_pct y total_cop, y nuevoSaldo con r.data.total_cop. Ya no usa los valores calculados en el navegador.
   - handleQuickCreateProduct manda iva_tarifa: item.iva_tarifa al quick-create.
   - Tarjeta de cada producto (bloque derecho), si la línea tiene iva_tarifa: renglón 1 'Cant. 6 × $206.769 sin IVA'; renglón 2 '{etiqueta} · $235.717' (y 'Descuento −$X' si lo hay); en grande, total_con_iva_cop; debajo, el anticipo por línea de U19. Sin tarifa: como hoy y un texto gris 'IVA no discriminado'. Con total 0: nada de IVA.
   - TOTALES: Subtotal (sin IVA); Descuento (x%) con cotizacion.descuento_cop (reemplaza el subtotal − total del punto 9 de H42, que con IVA da mal); un renglón por iva_por_tarifa; TOTAL; luego anticipo y saldo, como en U19/H36.
12) venta/[id]/page.tsx:
   - Tabla Productos: columnas PRODUCTO / CANT. / P. UNIT. SIN IVA / IVA (etiqueta) / TOTAL. TOTAL usa total_con_iva_cop ?? total_cop.
   - Debajo de la tabla, un bloque de totales igual al de la COT (subtotal, descuento, IVA por tarifa, total).
   - En el Resumen Financiero de U24, bajo 'Total del pedido': 'IVA incluido: {fCOP(iva_cop)}' o 'IVA no discriminado'.
13) frontend/src/app/dashboard/cotiza/page.tsx (Cotizador Rápido):
   - Un <select> IVA, que arranca en la clave iva_tarifa_defecto leída de /ventas/config.
   - Se muestra 'IVA' y 'Total con IVA' con calcularTotalesCotizacion.
   - handleCrearCotizacionDirecta manda iva_tarifa en la línea; anticipo_cop = Math.round(totalConIva × 0.6); subtotal_cop y total_cop salen de lib/iva.js.

[Sección «SI EL USUARIO ELIGE OTRA OPCIÓN» omitida: el usuario eligió las opciones recomendadas (R8).]
```

**Pruebas (diseño):**

```text
BACKEND: nuevo backend/tests/test_iva_cotizacion.py. Solo con el runner de ROLLBACK: python tests/rollback_runner.py test_iva_cotizacion. No usa parametrize: los casos van en listas. Los estados PENDIENTE_CONFIRMACION/CONFIRMADA se ponen por ORM, sin /enviar-confirmacion. Si alguna prueba lo llama, se hace monkeypatch de app.core.email.send_email y del envío por Chatwoot/WhatsApp del Bloque 3.
1) test_calcular_sin_descuento (pura): ejemplo del recorrido → iva [235717, 88920, 6600], iva_cop 331237, total 2171851, total_con_iva [1476331, 556920, 138600].
2) test_calcular_con_descuento_10: descuento 184061 → [124061, 46800, 13200]; base [1116553, 421200, 118800]; iva [212145, 80028, 5940]; total 1954666; iva_por_tarifa [('19', 1537753, 292173), ('5', 118800, 5940)].
3) test_iva_medio_peso_hacia_arriba: 1 × 50 al 19% → iva 10, total 60.
4) test_exento_excluido_y_resumen: 4 líneas de 100001 (19, 5, EXENTO, EXCLUIDO) con 7,5% → descuento 30000, bases 92501 cada una, iva [17575, 4625, 0, 0], total 392204, y el resumen en ese orden con las bases.
5) test_invariantes_en_casos_fijos: un bucle con los 4 casos anteriores, más 2 × 342462 al 19% (total 815060) y [3 × 99999 al 19%, 7 × 1 al 5%, 1 × 55555 al 19%] con 33,33% (total 282090). En cada caso: Σbruto = subtotal; Σdescuento = descuento; Σiva = iva_cop = Σresumen; Σtotal_con_iva = total; todo entero ≥ 0.
6) test_repartir_proporcional: [1240614, 468000, 132000] con 184061 → [124061, 46800, 13200]; [100001]*3 con 180002 → [60001, 60001, 60000] (como en U19); [999999999, 1, 7] con 999999999 suma exacto; objetivo 0 → ceros.
7) test_patch_con_tarifas_lo_calcula_el_servidor: COT BORRADOR sin SC. PATCH con productos del ejemplo con iva_tarifa, total_cop 1 (falso) y recotizacion → 200. cot.total_cop == 2171851, tax_cop == 331237, subtotal 1840614. productos[0]['total_con_iva_cop'] == 1476331. Los datos traen iva_cop, descuento_cop 0 e iva_discriminado True.
8) test_patch_sin_tarifas_sigue_como_hoy: el body de test_pesos_enteros (total 2786923.08, líneas sin iva_tarifa) → total 2786923, tax_cop 0, iva_discriminado False, iva_por_tarifa [].
9) test_tarifa_invalida_o_mezclada_es_422_sin_cambios: '16' → 422; una línea con tarifa y otra sin ella → 422 con el nombre. En los dos casos la COT queda igual.
10) test_patch_solo_notas_no_recalcula.
11) test_vincular_al_catalogo_no_rompe_la_confirmacion: COT con IVA en PENDIENTE_CONFIRMACION. PATCH con las mismas líneas y sku_id puesto → sigue PENDIENTE_CONFIRMACION, con los mismos totales.
12) test_cambiar_la_tarifa_anula_la_confirmacion: la misma COT, tarifa 19→5, con anular_confirmacion=True y motivo_recotizacion (H40) → BORRADOR; el total cambia; la Actividad tiene '— IVA' con 'IVA 19%' → 'IVA 5%'.
13) test_anticipo_sobre_total_con_iva: SC 60/40 → anticipo_cop 1303111; GET anticipo_por_linea == [885799, 334152, 83160], y la suma == anticipo_requerido.
14) test_contado_cobra_el_iva: SC Contado → anticipo == 2171851.
15) test_convertir_pasa_el_iva_al_pedido: COT CONFIRMADA con gate2 y SC 'Credito 30 dias', ejemplo con 10% → POST /confirmar → SaleOrder total 1954666, tax_cop 298113, subtotal 1840614. Líneas: tax_pct [19, 19, 5], descuento_pct [10, 10, 10], unit_price_cop [206769, 117000, 13200]. GET /pedidos/{id}: iva_cop 298113 y el mismo iva_por_tarifa.
16) test_pxp_cobra_total_con_iva: POST crear-pxp sobre ese pedido → monto_total 1954666, monto_pendiente 1954666, monto_anticipo 0.
17) test_cancelar_linea_mantiene_pesos_y_descuento: cancelar toda la línea de la Cinta → total 1829926, tax 292173, subtotal 1708614; todo entero; saldo == total.
18) test_update_pedido_acepta_iva_cop: PATCH {iva_cop: 1234.6} → tax_cop 1235, y la Actividad tiene el renglón 'IVA'.
19) test_vista_publica_trae_el_desglose: _cot_confirmacion_dict(cot) trae iva_por_tarifa e iva_etiqueta por línea, y no trae cost_usd, margen_pct ni flete_usd.
20) test_cotizacion_vieja_iva_no_discriminado: _cot_dict de una COT sin tarifas → iva_discriminado False, iva_cop 0, descuento_cop == subtotal − total.
En backend/tests/test_anticipo_por_linea.py (U19): un caso nuevo, test_reparto_usa_total_con_iva, con las líneas del punto 13.
Regresión con el runner: test_pesos_enteros, test_anticipo_modalidad, test_anticipo_verificado, test_anticipo_por_linea, test_confirmacion_cotizacion (congelamiento), test_actividad_cambios_documentos, test_recotizar_confirmada (H40), test_orden_de_pago_pxp, test_fase5_integracion_erp, test_fase4_hardening (el pedido canónico con 19% sigue dando 90000/17100/107100), test_fase4_final_hardening (cancelación de líneas) y test_tarifa_iva_producto.
FRONTEND:
- tests/test_iva.mjs, parte 2: calcularTotalesCotizacion con los casos 1 a 5 y EXACTAMENTE los mismos números (paridad con Python); repartirProporcional con los casos del punto 6, incluido el grande con BigInt; desgloseDocumento de un documento viejo → iva_discriminado false.
- npm test y npx tsc --noEmit.
- Revisión manual a 1440 y 1024 px: en la calculadora, cambiar una tarifa y ver que el total y el anticipo cambian; las tarjetas de la COT con IVA y anticipo por línea; el PVEN con la tabla y los totales; una COT vieja con 'IVA no discriminado'.
```

**Comportamiento esperado:**

```text
- Una línea vale unitario sin IVA × cantidad, y ese es su total sin IVA. El descuento global se reparte entre las líneas sin perder ni sobrar un peso. El IVA se calcula en cada línea sobre su valor con descuento y se redondea al peso (medio peso hacia arriba). Total = subtotal − descuento + IVA, siempre exacto.
- Ejemplo del recorrido, con los precios del Bloque 1: Rodillo 6 × $206.769 = $1.240.614 (IVA 19%), Pintura 4 × $117.000 = $468.000 (19%) y Cinta 10 × $13.200 = $132.000 (5%).
  - Sin descuento: IVA $235.717 + $88.920 + $6.600 = $331.237, total $2.171.851.
  - Anticipo 60/40: $1.303.111. Por línea, sobre el total con IVA: $885.799 + $334.152 + $83.160 = $1.303.111.
- El mismo ejemplo con 10% de descuento:
  - Descuento $184.061, repartido en $124.061 + $46.800 + $13.200.
  - Bases $1.116.553 / $421.200 / $118.800. IVA $212.145 / $80.028 / $5.940.
  - Resumen: IVA 19% sobre $1.537.753 = $292.173; IVA 5% sobre $118.800 = $5.940. Total $1.954.666.
- Exento y Excluido: base visible e IVA $0. Una línea de $50 al 19% lleva IVA $10 (9,5 se redondea hacia arriba).
- El servidor manda: con tarifas en todas las líneas recalcula todo, e ignora los totales que lleguen en el body. Con tarifa solo en algunas responde 422. Con una tarifa no válida o una cantidad ≤ 0 responde 422 sin cambiar nada. Sin tarifas (documentos viejos y llamadores antiguos) se comporta igual que hoy.
- Un PATCH de solo notas no recalcula. Vincular una línea al catálogo deja los mismos totales y no anula la confirmación. Cambiar la tarifa de una línea cambia el precio: congela y anula la confirmación como cualquier re-cotización (con el aviso de H40) y queda en la Actividad como '<producto> — IVA: IVA 19% → IVA 5%'.
- Anticipo: round(total con IVA × % de la modalidad o el manual). Contado (100%) cobra el total con IVA. La verificación de N1 y el traslado de R6 usan ese mismo requerido.
- Pedido: hereda subtotal, IVA (tax_cop) y total. Sus líneas guardan el unitario sin IVA, el % de IVA y el % de descuento global, así que finanzas sigue contando los ingresos sin IVA. Si se cancela una línea, el IVA y el total se recalculan en pesos enteros: puede haber 1 o 2 pesos de diferencia frente al reparto original, solo después de esa cancelación.
- Orden de pago (PXP): no cambia su código. Con H44 toma el total y el saldo del pedido, que ya incluyen el IVA. Ejemplo a crédito: total $1.954.666, pendiente $1.954.666.
- Documentos del cliente (contrato para U22/U23):
  - Cada línea muestra CANT., DESCRIPCIÓN con su etiqueta de IVA, PRECIO sin IVA y TOTAL sin IVA.
  - Debajo: Subtotal; Descuento si lo hay; un renglón por tarifa ('IVA 19% sobre $X: $Y'; 'Exento sobre $Z: $0'); TOTAL A PAGAR; y en forma de pago, 'Anticipo 60%: $X (sobre el total con IVA)'.
  - Un documento viejo dice 'Valores sin IVA discriminado' y no lleva renglones de IVA.
- Cotizaciones y pedidos existentes: no se recalculan. Muestran 'IVA no discriminado' hasta que se vuelvan a cotizar; en ese momento el asesor ve el cambio de total y, si estaban confirmados, se pide confirmar otra vez.
```

**Datos existentes:**

```text
No se modifica ningún dato. Lo nuevo se calcula al re-cotizar, y lo viejo se muestra como 'IVA no discriminado'. Consultas de solo lectura en erp_test (transacción READ ONLY, 2026-10-03):
- 3 COT CONFIRMADA (COT-20260449 del usuario, y COT-20260485/486 DEMO, con centavos), ninguna con IVA en sus líneas.
- 3 PVEN (PVEN-20262799 del usuario PENDIENTE_COMPRA y 2 DEMO CANCELADO) con tax_cop 0.
- 7 líneas sale_order_lines_erp con tax_pct 0.
- 3 PXP PENDIENTE. La cabeza de alembic está en fa6_024.
Para ver qué queda sin IVA en producción (solo lectura):
- SELECT numero, estado, total_cop FROM sales_quotations WHERE estado IN ('BORRADOR','ENVIADA','PENDIENTE_CONFIRMACION','CONFIRMADA') AND productos::text NOT LIKE '%"iva_tarifa"%';
- SELECT numero, estado, total_cop FROM sale_orders WHERE estado <> 'CANCELADO' AND tax_cop = 0;
No se propone corregirlos: sus totales ya fueron aceptados por el cliente. Los documentos reales del usuario (SC-20260731 / COT-20260449 / PVEN-20262799) no se tocan.
```

**Riesgos:**

```text
- Con la opción recomendada (IVA encima), el precio final al cliente sube un 19% (o un 5%) frente a hoy en los productos gravados. Es la decisión de negocio de la primera pregunta.
- Conviven dos modos, según si las líneas traen tarifa o no. Se hizo a propósito, para no romper los documentos viejos ni las ~40 pruebas que mandan totales sin tarifa. Un llamador que omita la tarifa sigue guardando sin IVA: la UI siempre la manda.
- Cotizador web y backend deben calcular igual. El servidor gana siempre, y las pruebas de paridad con los mismos números lo cuidan. La aritmética entera (BigInt y puntos básicos) evita diferencias por punto flotante.
- JSON productos: hay que asignar una lista nueva de dicts nuevos. Mutar en sitio no se guarda (bug de dirty-check ya visto en el proyecto).
- Los KPI de montos de las listas de Ventas (Total activas, Monto) sumarán con IVA en los documentos nuevos. Finanzas y la rentabilidad siguen sin IVA, porque leen el unitario sin IVA de las líneas del pedido.
- Poner el % de descuento global en las líneas del pedido corrige la rentabilidad (antes ignoraba el descuento global) y la cancelación de líneas (antes lo perdía). Los reportes de rentabilidad de pedidos nuevos con descuento cambiarán, y quedarán bien.
- H36 sacó anticipo_cop del congelamiento porque el cliente no lo veía. El Bloque 3 se lo muestra, y U22/U23 deben resolverlo. Este ítem solo agrega el IVA al congelamiento (tax_cop y la tarifa de cada línea).
- Esto es para cotizar y cobrar: no es la factura electrónica DIAN, que se sigue emitiendo en el sistema contable.
- Muchos archivos con varios dueños: update_cotizacion, get_cotizacion, CalculadorModal, cotizacion/[id] y venta/[id]. Hay que implementarlo sobre la versión que dejen el Bloque 1 (T3/T10) y el Bloque 2 (B2-T3/B2-T8).
```

**Depende de:**

```text
IVA-PRODUCTO, que aporta core/iva.py, lib/iva.js, products.tarifa_iva, tarifas_producto/iva_tarifa_defecto en GET y la tarifa en search y quick-create. Debe ir antes.
Bloque 1:
- H42: redondear_peso, pesos.js, computeMarginPrice. Su punto 9 (descuento mostrado = subtotal − total) se reemplaza por descuento_cop.
- H36+H43/R2/R3: anticipo_cotizacion usa cot.total_cop, que ahora incluye IVA.
- N1/R4/R6: el requerido incluye IVA.
- H44+N6: la PXP toma total y saldo del pedido.
- R11: update_pedido redondea; se agrega iva_cop.
- T10: la calculadora con anticipo en solo lectura.
- Choques de get_cotizacion y update_cotizacion (R12).
Bloque 2:
- U19+U21: monto_linea pasa a total_con_iva_cop y repartir_anticipo_por_linea se generaliza a repartir_proporcional.
- U24: Resumen financiero con 'IVA incluido'.
- H40: 409 al re-cotizar, que ahora también cubre cambios de tarifa.
- H37: tarjetas a 1024 px.
- C9/C10: una sola lectura de la SC en get_cotizacion.
- H26/H21, que también tocan cambios_documento.py.
- B2-T3/B2-T8, dueñas de erp_ventas.py y de cotizacion/[id], venta/[id] y cotizacion-client.
Bloque 3: va ANTES de U22/U23 (páginas del cliente de COT y PVEN), que consumen _productos_publicos/desglose_documento y deben resolver el congelamiento del anticipo. El envío automático (U16) y la plantilla de marca muestran el total con IVA.
```

**Archivos que nombra el diseño:** `backend/alembic/versions/fa6_0NN_iva_cotizacion.py`, `backend/app/models/erp_documents.py`, `backend/app/core/iva.py`, `backend/app/core/ventas_dinero.py`, `backend/app/core/cambios_documento.py`, `backend/app/api/v1/erp_ventas.py`, `backend/app/api/v1/erp_ventas_fase4.py`, `backend/app/api/v1/confirmacion_publica.py`, `backend/tests/test_iva_cotizacion.py`, `backend/tests/test_anticipo_por_linea.py`, `frontend/src/lib/iva.js`, `frontend/tests/test_iva.mjs`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `frontend/src/app/dashboard/cotiza/page.tsx` (la lista que manda es la de **Files** de la tarea y R10).


### IVA-PRODUCTO — Tarifa de IVA en cada producto

**Grupo:** IVA por producto · **Esfuerzo:** M · **Tareas del plan:** T3, T13, T14, T16, T21

**Para el usuario:** El IVA pasa a ser un dato del producto. En la ficha del catálogo se elige entre 19%, 5%, Exento y Excluido, o se deja «Sin definir». Un producto sin definir y las líneas escritas a mano usan la tarifa por defecto de Configuración, que solo un administrador puede cambiar y que todos pueden ver. El buscador de productos de la cotización trae la tarifa de cada producto, y «+ Ingresar como producto» guarda el producto nuevo con la tarifa de su línea. La casilla «Impuesto %» que hoy aparece en la ficha no guardaba nada: se reemplaza por esta. Tampoco guardaba nada el campo «Impuesto por defecto (IVA)» de Ajustes, que ahora remite a Configuración del HUB Ventas.

**Lo que vio y aprobó el usuario:** En la ficha de cada producto del catálogo vas a elegir su IVA: 19%, 5%, Exento o Excluido. Si un producto todavía no la tiene, o si en la cotización escribes un producto a mano, se usa la tarifa por defecto que eliges en Configuración del HUB Ventas (empieza en 19%). Cuando conviertes una línea escrita a mano en producto del catálogo, el producto nuevo queda con el IVA que tenía esa línea. En la lista del catálogo hay un botón «Sin tarifa de IVA» para ver qué productos te faltan. Tendrás que revisar tus productos y ponerle a cada uno su tarifa correcta: eso solo lo sabes tú (o tu contador).

**Decisiones del usuario:**
- Marcado por el usuario: **bien** (sin comentario)
- Si un producto no tiene tarifa de IVA, o el asesor escribe un producto a mano en la cotización, ¿qué IVA se usa? → **19% (la tarifa general). El asesor la cambia en esa línea si es 5%, exento o excluido** (= recomendada)
- En una cotización, ¿el asesor puede cambiar el IVA de un producto del catálogo que ya tiene su tarifa? → **Sí, en esa línea. Sale un aviso amarillo («el producto tiene IVA 5%») y el cambio queda en la Actividad** (= recomendada)

**Cambios (diseño):**

```text
BACKEND
1) Migración nueva backend/alembic/versions/fa6_0NN_tarifa_iva_producto.py (revisión encadenada a la cabeza real; verificar con `alembic heads` después de fa6_025 del Bloque 2 y de las migraciones de otros ítems del Bloque 3). Solo aditiva (R13): products ADD COLUMN tarifa_iva VARCHAR(10) NULL + CHECK ck_products_tarifa_iva (tarifa_iva IS NULL OR tarifa_iva IN ('19','5','EXENTO','EXCLUIDO')). Hay que usar un nombre nuevo, porque en erp_test (y quizá en producción) ya existe products.tax_rate NUMERIC(5,2) DEFAULT 0, creada por el script viejo migrate_erp_v2.py. Esa columna no está en el modelo ni en alembic y no se toca.
2) backend/app/models/catalog.py, clase Product: `tarifa_iva = Column(String(10), nullable=True)  # '19' | '5' | 'EXENTO' | 'EXCLUIDO' | None = sin definir`.
3) Nuevo backend/app/core/iva.py, puro salvo las dos funciones que reciben db. Importa redondear_peso de ventas_dinero.
   - TARIFAS_IVA = {'19': Decimal('19'), '5': Decimal('5'), 'EXENTO': Decimal('0'), 'EXCLUIDO': Decimal('0')}; ORDEN_TARIFAS = ('19','5','EXENTO','EXCLUIDO'); ETIQUETAS_TARIFA_IVA = {'19':'IVA 19%','5':'IVA 5%','EXENTO':'Exento','EXCLUIDO':'Excluido'}; TARIFA_IVA_POR_DEFECTO = '19' (o lo que responda el usuario en iva_tarifa_defecto); CLAVE_TARIFA_DEFECTO = 'iva_tarifa_defecto'.
   - normalizar_tarifa_iva(valor) -> Optional[str]: None o '' (o solo espacios) → None. Se recorta, se pasa a mayúsculas y se quitan 'IVA' y '%'. '19', 19, 19.0, '19%' e 'iva 19' → '19'. '5' → '5'. 'EXENTO'/'exento' → 'EXENTO'. 'EXCLUIDO' → 'EXCLUIDO'. Cualquier otro valor, incluidos '0', '16' y bool, lanza ValueError('Tarifa de IVA no válida: usa 19%, 5%, Exento o Excluido.'). El '0' se rechaza a propósito, porque no dice si es exento o excluido.
   - pct_tarifa_iva(codigo) -> Decimal; etiqueta_tarifa_iva(codigo) -> str ('IVA no discriminado' si es None).
   - tarifa_iva_defecto(db) -> str: lee admin_config con el mismo patrón de _get_alert_days (SELECT value FROM admin_config WHERE key=:key, dentro de try). Si la clave falta, no es válida o hay error, devuelve TARIFA_IVA_POR_DEFECTO.
   - tarifas_de_producto(db, sku_ids) -> dict[int, Optional[str]]: UNA consulta ProductSKU.id, Product.tarifa_iva con join, filtrada por ProductSKU.id IN sku_ids. Con la lista vacía devuelve {} sin consultar.
4) backend/app/schemas/catalog.py: ProductBase y ProductUpdate agregan `tarifa_iva: Optional[str] = None` con @field_validator('tarifa_iva', mode='before'), que llama normalizar_tarifa_iva. Pydantic convierte el ValueError en 422 con ese mensaje. ProductResponse lo hereda.
5) backend/app/api/v1/catalog.py: create_product no cambia, porque Product(**data) ya recibe tarifa_iva. En update_product se agrega 'tarifa_iva' a la tupla de campos del loop. Con exclude_unset, un PATCH {tarifa_iva: null} la deja «sin definir» y un PATCH sin la clave no la toca.
6) backend/app/api/v1/crm.py:
   - search_products: cada fila agrega 'tarifa_iva': p.tarifa_iva.
   - quick_create_product, sobre la versión que deje U7+U8+H12+H13 del Bloque 2: lee body.get('iva_tarifa') con normalizar_tarifa_iva (ValueError → 422) y lo guarda en Product(tarifa_iva=...). Si no viene, queda None. La respuesta agrega 'tarifa_iva'.
7) backend/app/api/v1/erp_ventas.py:
   - _CONFIG_LECTURA_GENERAL (N8) agrega 'iva_tarifa_defecto' para que asesores y Cotiza la lean.
   - update_config: antes del loop, si 'iva_tarifa_defecto' está en el body, se normaliza con normalizar_tarifa_iva. Si no es válida responde 422 con ese mensaje y no guarda ninguna clave; si es válida guarda el código normalizado. Las demás claves no cambian.
   - get_cotizacion: agregar d['iva_tarifa_defecto'] = tarifa_iva_defecto(db) y d['tarifas_producto'], una lista paralela a d['productos'] que da tarifas_de_producto(db, ids)[sku_id] para las líneas con sku_id y None para las de texto libre. Va solo en el detalle, no en _cot_dict, para no consultar por cada fila del listado.

FRONTEND
8) Nuevo frontend/src/lib/iva.js, espejo de core/iva.py: TARIFAS_IVA = [{codigo:'19',pct:19,etiqueta:'IVA 19%'},{codigo:'5',pct:5,etiqueta:'IVA 5%'},{codigo:'EXENTO',pct:0,etiqueta:'Exento'},{codigo:'EXCLUIDO',pct:0,etiqueta:'Excluido'}], TARIFA_IVA_POR_DEFECTO='19', normalizarTarifaIva(v) (null si no es válida), pctTarifaIva(c) y etiquetaTarifaIva(c) ('IVA no discriminado' si es null). El ítem IVA agrega aquí el cálculo.
9) frontend/src/app/dashboard/inventario/productos/page.tsx:
   - En openNew/openEdit, tax_rate se reemplaza por tarifa_iva: p.tarifa_iva || ''.
   - El input «Impuesto %» (tarjeta Precios) pasa a ser <select> «Tarifa de IVA» con las opciones «Sin definir (usa la de Configuración)», 19%, 5%, Exento y Excluido.
   - saveProduct manda tarifa_iva: form.tarifa_iva || null y deja de mandar tax_rate.
   - En la lista: un botón «Sin tarifa de IVA» junto a «Requiere revisión», que filtra en el cliente con !p.tarifa_iva, y una etiqueta pequeña con etiquetaTarifaIva o «Sin tarifa» en cada fila.
10) frontend/src/app/dashboard/ventas/page.tsx (Hub), ConfigPanel:
   - Nueva tarjeta «IVA» con un <select> «Tarifa de IVA por defecto» (19%, 5%, Exento, Excluido) en cfg.iva_tarifa_defecto. El valor inicial es alertDias?.iva_tarifa_defecto?.value ?? alertDias?.iva_tarifa_defecto ?? '19'.
   - Texto de ayuda: «Se usa en los productos sin tarifa y en los productos escritos a mano en la cotización.»
   - Respeta el modo solo lectura de N8 para quien no es administrador. El error 422 se muestra con el aviso de B2-T0.
11) frontend/src/app/dashboard/admin/ajustes/page.tsx: el input decorativo «Impuesto por Defecto (IVA)» (defaultValue '19%', no guarda nada) se reemplaza por un texto: «La tarifa de IVA por defecto se configura en HUB Ventas → Configuración.»
```

**Pruebas (diseño):**

```text
BACKEND: nuevo backend/tests/test_tarifa_iva_producto.py. Se corre solo con el runner de ROLLBACK: cd <worktree>/backend y luego C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe tests/rollback_runner.py test_tarifa_iva_producto. No usa parametrize (los casos van en listas dentro de cada prueba) y ninguna llama servicios externos.
1) test_normalizar_tarifa_iva (pura):
   - '19', 19, 19.0, '19%', ' iva 19 ' → '19'; '5' → '5'; 'exento' → 'EXENTO'; 'Excluido' → 'EXCLUIDO'.
   - None y '' → None.
   - '0', '16', 'abc' y True lanzan ValueError.
2) test_crear_producto_con_tarifa: POST /products {name, type:'Fisico', base_currency:'COP', tarifa_iva:'5'} → 201 y data.tarifa_iva == '5'. Con 'exento' → 'EXENTO'.
3) test_tarifa_invalida_es_422_y_no_crea: tarifa_iva '16' → 422, y no existe ningún Product con ese nombre.
4) test_actualizar_y_quitar_la_tarifa: PATCH {tarifa_iva:'19'} → '19'. PATCH {tarifa_iva:null} → None. PATCH {name:'x'} conserva la tarifa.
5) test_busqueda_devuelve_la_tarifa: producto '5' con SKU, GET /crm/products/search?q=<nombre> → la fila trae tarifa_iva == '5'.
6) test_quick_create_guarda_la_tarifa_de_la_linea: POST /crm/products/quick-create {name, sale_price:1000, iva_tarifa:'5'} → Product.tarifa_iva == '5'. Sin iva_tarifa → None. Con iva_tarifa '16' → 422.
7) test_tarifa_por_defecto_sale_de_configuracion: sin la clave, tarifa_iva_defecto(db) == '19'. Con un upsert de iva_tarifa_defecto='5' dentro de la transacción revertida → '5'. Con 'abc' → '19'.
8) test_config_valida_la_tarifa_y_el_asesor_la_lee:
   - PATCH /ventas/config {'iva_tarifa_defecto':'16'} con admin → 422, y la clave no cambia.
   - Con 'Exento' → 200 y se guarda 'EXENTO'.
   - GET /ventas/config con vendedor_token trae iva_tarifa_defecto.
   - PATCH con vendedor → 403.
   - admin_config no se trunca: guardar el valor previo y restaurarlo en finally, como N8.
9) test_get_cotizacion_expone_tarifas: COT BORRADOR con 3 líneas [SKU de un producto '5', SKU de un producto sin tarifa, texto libre] → tarifas_producto == ['5', None, None] e iva_tarifa_defecto == '19'.
Regresión con el mismo runner: test_products_quick_create (U7 del Bloque 2), test_listas_ventas_totales (N8), test_erp_ventas_config_sql_safety y las pruebas de catálogo (test_td03_* que crean productos).
FRONTEND:
- Nuevo frontend/tests/test_iva.mjs (node:assert/strict, estilo test_pesos.mjs), parte 1: normalizarTarifaIva con los mismos casos del punto 1; etiquetaTarifaIva('EXENTO') === 'Exento'; etiquetaTarifaIva(null) === 'IVA no discriminado'; pctTarifaIva('5') === 5.
- Agregar `&& node tests/test_iva.mjs` al script test de package.json en un solo hunk; ver notas sobre la línea compartida.
- Correr npm test y npx tsc --noEmit.
- Revisión manual: ficha de producto con el selector y el filtro «Sin tarifa de IVA»; el panel Configuración del Hub como administrador y como asesor (solo lectura).
```

**Comportamiento esperado:**

```text
- Tarifas válidas: 19%, 5%, Exento (0%) y Excluido (sin IVA). Se guardan como código ('19', '5', 'EXENTO', 'EXCLUIDO'). NULL significa «sin definir».
- Entrada aceptada: '19', 19, '19%', 'IVA 19', 'exento', 'Excluido'. Cualquier otro valor, incluidos '0' y '16', da 422 «Tarifa de IVA no válida: usa 19%, 5%, Exento o Excluido.» y no guarda nada.
- Tarifa por defecto: la clave iva_tarifa_defecto de admin_config. Si falta o no es válida, vale '19'. Todos los roles la leen y solo ADMIN la cambia (403 para los demás, como en N8).
- Una línea de cotización toma su tarifa así: la del producto del catálogo si la tiene; si no (producto sin definir o texto libre), la tarifa por defecto. El cálculo y las líneas están en el ítem IVA.
- El buscador (/crm/products/search) y la creación rápida devuelven tarifa_iva. «+ Ingresar como producto» crea el producto con la tarifa de su línea. Los productos creados desde la Solicitud quedan sin definir, y ya salen marcados «Requiere revisión».
- GET /cotizaciones/{id} agrega iva_tarifa_defecto ('19') y tarifas_producto, por ejemplo ['5', None, None] para [SKU de un producto al 5%, SKU de un producto sin tarifa, texto libre].
- Cambiar la tarifa de un producto no toca cotizaciones ni pedidos ya calculados: cada línea guarda su propia tarifa. La nueva tarifa solo se aplica cuando se vuelve a cotizar.
```

**Datos existentes:**

```text
Esto no cambia datos: la columna nueva arranca en NULL (sin definir), así que todos los productos usan la tarifa por defecto hasta que alguien les ponga la suya. Consultas de solo lectura que hice en erp_test (transacción READ ONLY, 2026-10-03):
- products tiene 2 filas (DEMO). La columna vieja products.tax_rate existe (del script migrate_erp_v2.py) y vale 0.00 en las dos.
- product_web_listings no tiene filas. Su impuesto_pct es del e-commerce y no se toca.
- admin_config no tiene la clave iva_tarifa_defecto.
En producción, antes de desplegar, solo leer:
- SELECT id, name, tax_rate FROM products WHERE tax_rate IS NOT NULL AND tax_rate <> 0; Si sale algo, con el OK del usuario se copia: 19→'19', 5→'5'. Cualquier otro valor se deja sin definir y se le muestra al usuario.
- Después de desplegar: SELECT id, name FROM products WHERE is_active AND tarifa_iva IS NULL; es la lista de productos que el usuario debe clasificar. El filtro «Sin tarifa de IVA» muestra lo mismo.
```

**Datos del usuario:**

```text
Hoy ningún producto tiene IVA guardado en el sistema. En la base de pruebas, la casilla vieja «Impuesto %» de la ficha está en 0 en todos los productos y nunca se guardó de verdad. Si en producción algún producto tiene ahí un valor distinto de 0, te muestro la lista y, solo con tu OK, lo copio como su tarifa de IVA.
```

**Riesgos:**

```text
- update_product sigue abierto a ALL_ERP_ROLES (lo mismo que hoy con los demás campos): cualquier rol del ERP puede cambiar la tarifa de un producto. Si se quiere limitar a ADMIN/FINANZAS, es un cambio aparte.
- El IVA del e-commerce (product_web_listings.impuesto_pct por SKU) y los pedidos web (tax_pct=0 en ecommerce.py y store.py) quedan separados de products.tarifa_iva. Unificarlos es trabajo de otro módulo.
- La columna vieja products.tax_rate queda huérfana. No se borra (R13). Conviene anotarla para una limpieza futura.
- Si el usuario elige «obligar a elegir» en iva_tarifa_defecto, la tarifa por defecto solo se usa como sugerencia visual, y la calculadora no deja guardar líneas sin tarifa (ver el ítem IVA).
- crm.py (quick_create_product) también lo modifica U7+U8+H12+H13 (B2-T4), y ventas/page.tsx (ConfigPanel) lo modifican N8 y B2-T8: hay que aplicar este cambio sobre esas versiones.
```

**Depende de:**

```text
Bloque 1: N8, de donde vienen _CONFIG_LECTURA_GENERAL, get_config para todos los roles y ConfigPanel en solo lectura para no administradores; se agrega una clave a esa lista. También H42 (ventas_dinero.redondear_peso, que importa core/iva.py). Bloque 2: U7+U8+H12+H13, porque quick_create_product con código único y reutilización por nombre (dueña B2-T4 de crm.py) recibe iva_tarifa encima de su versión; B2-T0 (avisos para el 422 de Configuración); B2-T8 (dueña de ventas/page.tsx). Es la base del ítem IVA y va antes.
```

**Archivos que nombra el diseño:** `backend/alembic/versions/fa6_0NN_tarifa_iva_producto.py`, `backend/app/models/catalog.py`, `backend/app/core/iva.py`, `backend/app/schemas/catalog.py`, `backend/app/api/v1/catalog.py`, `backend/app/api/v1/crm.py`, `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_tarifa_iva_producto.py`, `frontend/src/lib/iva.js`, `frontend/tests/test_iva.mjs`, `frontend/package.json`, `frontend/src/app/dashboard/inventario/productos/page.tsx`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/app/dashboard/admin/ajustes/page.tsx` (la lista que manda es la de **Files** de la tarea y R10).


## Anexo: ítem descartado (MARCA del grupo pagina-publica-sc)

Se fusionó con la MARCA de «marca-y-plantilla» (C1). No se implementan core/marca.py, lib/marca.js, info-empresa.tsx, EncabezadoDocumento.tsx, el GET del logo en confirmacion_publica.py ni el PATCH. Solo sobreviven: sitio_web sin esquema → https:// (javascript: y data: siguen en 422), la ayuda «el número conectado a Chatwoot» del campo WhatsApp y la vista previa del encabezado en «Diseño de documentos».
