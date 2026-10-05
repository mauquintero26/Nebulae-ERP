# Ventas · Bloque 2 · Pantallas de Solicitud y Cotización, chatter y atrasos — Especificación

Fecha: 2026-10-04 · Rama: `ventas-bloque2-pantallas-sc-cot` · Base: punta de `ventas-bloque1-dinero-flujo` al crear el worktree (T0 anota el hash) · Worktree: `C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-bloque2-pantallas-sc-cot`

## Objetivo

Que las pantallas y el flujo de la Solicitud (SC) y la Cotización (COT) sean claros y completos encima de lo que corrige el Bloque 1: la SC con cuatro estados que cuentan solo su historia (Nueva, Asignada, Pendiente por confirmación, Confirmada, más Cancelada) y la posibilidad auditada de cotizar antes de que el cliente confirme; cancelar y restaurar con todo en la Actividad; detalle de la SC más legible (productos arriba, Actividad con el siguiente paso, Chatter e IA), corrección de los datos del cliente desde la SC; un Chatter único en SC, COT, PVEN y Hub con notas internas y contactos con el cliente (incluida la Nota externa) que reinician el conteo de atraso; formulario de nueva SC que no pierde nada; COT y PVEN bien vistos a 1024 px, con anticipo por producto, aviso antes de anular la confirmación del cliente y resumen de pago claro; y avisos y confirmaciones dentro del sistema en lugar de los diálogos del navegador.

## Origen

- Recorrido QA de Ventas con capturas y anotaciones del usuario (página de revisión).
- Diseño por ítem (6 grupos, 21 arreglos) y cruce crítico (20 choques, 11 huecos, orden), en `diseno-bloque2.json`.
- Página del plan (`plan-bloque2.json`, armada con `build-plan2.js`: el crítico quitó 2 preguntas y ajustó opciones y un texto de datos). El usuario marcó 20 arreglos **Bien** y 1 **Cambiar** (U6+H22) y respondió las 5 preguntas (2026-10-04). Comentario general: "no nada mas".
- Resumen de decisiones del controlador (`decisiones-bloque2.md`):

```text
# Bloque 2 — decisiones del usuario (página del plan, 2026-10-04)
- 21 arreglos: 20 "Bien", 1 "Cambiar" (U6+H22). Comentario general: "no nada mas".
- U11 enviar_cot_sin_confirmar: Sí; el cliente confirma la cotización con sus precios y con eso la solicitud también queda confirmada.
- U11 quien_cotiza_sin_confirmar: Cualquier asesor o administrador (queda registrado con su nombre y el motivo).
- H21 h21_propagar: También en la cotización y el pedido abiertos de esa misma solicitud (COT no rechazadas; PVEN no cancelados, entregados ni facturados).
- U6+H22 atraso_por_contacto: Solo los contactos con el cliente (llamada, WhatsApp, correo) reinician el conteo; las notas internas no.
  CAMBIAR (comentario del usuario): "que se pueda colocar una nota externa y esa nota externa sí reinicie el conteo".
  Ruling: el chatter tiene un tipo "Nota externa" (contacto con el cliente por cualquier medio, con el medio opcional) que reinicia el conteo de atraso, igual que llamada/WhatsApp/correo; la nota interna no lo reinicia.
- H40 razon_recotizar: Escribir la razón del cambio (queda en la Actividad).
- Decididas por el crítico (sin pregunta): la SC se queda en Confirmada (el avance se ve en COT/PVEN); el motivo de cancelación solo en Actividad y aviso, y las notas viejas con '[CANCELADA] Razón' se limpian con respaldo tras OK.
```

## Alcance (ítems que entran, con su estado y comentario del usuario)

### Estados de la solicitud y cotizar antes

- **U15 — Cuatro estados claros para la solicitud** (esfuerzo L) — usuario: **bien** — tareas: T2A, T6A, T7, T8A, T12
- **U11 — Cotizar antes de que el cliente confirme** (esfuerzo M) — usuario: **bien** — tareas: T3, T6A, T8A, T9A
- **U18+H31 — Solicitud cancelada: motivo a la vista y todo en la Actividad** (esfuerzo M) — usuario: **bien** — tareas: T2B, T6A, T7, T8A, T12 — fusionado como U18+H31+H33 (C1, R4)

### Detalle de la solicitud

- **U12 — Panel derecho: Actividad, Chatter e IA** (esfuerzo S) — usuario: **bien** — tareas: T8A
- **U13 — Productos más grandes y arriba** (esfuerzo S) — usuario: **bien** — tareas: T8A
- **U14 — Notas sin fondo amarillo** (esfuerzo S) — usuario: **bien** — tareas: T8A, T9A
- **H21 — Ciudad del cliente y corregir sus datos desde la solicitud** (esfuerzo L) — usuario: **bien** — tareas: T5, T6A, T8B, T10, T12
- **H25+H13 — Editar productos cómodo y cambiar cantidades** (esfuerzo M) — usuario: **bien** — tareas: T6A, T7, T8B, T12

### Chatter (notas internas)

- **U6+H22 — Chatter para notas en Solicitud, Cotización, Pedido y Hub** (esfuerzo M) — usuario: **cambiar** — comentario: "que se pueda colocar una nota externa y esa nota externa si reinicie el conteo" — tareas: T4, T6B, T8B, T9A, T9B, T12

### Nueva solicitud

- **U7+U8+H12+H13 — El producto elegido o creado queda agregado y resaltado** (esfuerzo M) — usuario: **bien** — tareas: T5, T6A, T7
- **H11 — Cliente nuevo con el nombre ya escrito, sin perder la solicitud** (esfuerzo M) — usuario: **bien** — tareas: T6A, T7
- **H9 — «Nueva Solicitud» abre al instante** (esfuerzo S) — usuario: **bien** — tareas: T9B
- **H10 — Formulario y alta de cliente con tildes, y anticipo a la vista** (esfuerzo M) — usuario: **bien** — tareas: T6A, T7, T8A

### Cotización y pedido

- **U19+U21 — Anticipo de cada producto en la cotización** (esfuerzo S) — usuario: **bien** — tareas: T4, T6B, T9A
- **U24 — Anticipo grande y claro en el pedido de venta** (esfuerzo S) — usuario: **bien** — tareas: T6B, T9A
- **H40 — Aviso antes de anular la confirmación del cliente al re-cotizar** (esfuerzo M) — usuario: **bien** — tareas: T1A, T4, T9A
- **H37 — Cotización y pedido bien vistos en pantallas medianas, con un solo botón de volver** (esfuerzo M) — usuario: **bien** — tareas: T6B, T9A, T9B
- **H30 — Copiar el enlace siempre funciona o te dice qué hacer** (esfuerzo S) — usuario: **bien** — tareas: T6B

### Avisos, cancelar y restaurar

- **H49+H34 — Avisos y confirmaciones dentro del sistema** (esfuerzo L) — usuario: **bien** — tareas: T1A, T1B
- **U18+H33 — Cancelar y restaurar, completos en la Actividad** (esfuerzo M) — usuario: **bien** — tareas: T2B, T7, T8A, T12 — fusionado como U18+H31+H33 (C1, R4)
- **H26 — Solicitud sin precios en la Actividad** (esfuerzo S) — usuario: **bien** — tareas: T4, T12

## Decisiones del usuario por ítem

### U15 — Cuatro estados claros para la solicitud

- Marcado por el usuario: **bien**
- Pregunta quitada por el crítico: Cuando el cliente ya confirmó la solicitud, ¿la solicitud se queda en 'Confirmada' o sigue cambiando de estado con la cotización? → decisión: **Se queda en 'Confirmada'; el avance se ve en la cotización y en el pedido** (opción recomendada; regla R2).

### U11 — Cotizar antes de que el cliente confirme

- Marcado por el usuario: **bien**
- Una cotización hecha sin la confirmación del cliente, ¿se puede enviar al cliente antes de que él confirme la solicitud? → **Sí; el cliente confirma la cotización con sus precios y con eso la solicitud también queda confirmada** (igual a la recomendada)
- ¿Quién puede cotizar una solicitud sin la confirmación del cliente? → **Cualquier asesor o administrador (queda registrado con su nombre y el motivo)** (igual a la recomendada)

### U18+H31 — Solicitud cancelada: motivo a la vista y todo en la Actividad

- Marcado por el usuario: **bien**

### U12 — Panel derecho: Actividad, Chatter e IA

- Marcado por el usuario: **bien**

### U13 — Productos más grandes y arriba

- Marcado por el usuario: **bien**

### U14 — Notas sin fondo amarillo

- Marcado por el usuario: **bien**

### H21 — Ciudad del cliente y corregir sus datos desde la solicitud

- Marcado por el usuario: **bien**
- Cuando corrijas el teléfono, el correo o la dirección del cliente desde una solicitud, además de la solicitud y la ficha del cliente, ¿dónde más se corrige? → **También en la cotización y el pedido abiertos de esa misma solicitud (cotizaciones no rechazadas y pedidos no cancelados, entregados ni facturados)** (igual a la recomendada)

### H25+H13 — Editar productos cómodo y cambiar cantidades

- Marcado por el usuario: **bien**

### U6+H22 — Chatter para notas en Solicitud, Cotización, Pedido y Hub

- Marcado por el usuario: **cambiar** — comentario: "que se pueda colocar una nota externa y esa nota externa si reinicie el conteo"
- Cuando alguien anota en el Chatter una llamada, un WhatsApp o un correo con el cliente, ¿eso reinicia los días de la alerta de 'atrasado' del documento? → **Solo los contactos con el cliente (llamada, WhatsApp, correo) reinician el conteo; las notas internas no** (igual a la recomendada)
- "Cambiar": ver la regla R1 (interpretación del comentario).

### U7+U8+H12+H13 — El producto elegido o creado queda agregado y resaltado

- Marcado por el usuario: **bien**

### H11 — Cliente nuevo con el nombre ya escrito, sin perder la solicitud

- Marcado por el usuario: **bien**

### H9 — «Nueva Solicitud» abre al instante

- Marcado por el usuario: **bien**

### H10 — Formulario y alta de cliente con tildes, y anticipo a la vista

- Marcado por el usuario: **bien**

### U19+U21 — Anticipo de cada producto en la cotización

- Marcado por el usuario: **bien**

### U24 — Anticipo grande y claro en el pedido de venta

- Marcado por el usuario: **bien**

### H40 — Aviso antes de anular la confirmación del cliente al re-cotizar

- Marcado por el usuario: **bien**
- Al re-cotizar una cotización que el cliente ya confirmó, ¿qué se pide para seguir? → **Escribir la razón del cambio (queda en la Actividad)** (igual a la recomendada)

### H37 — Cotización y pedido bien vistos en pantallas medianas, con un solo botón de volver

- Marcado por el usuario: **bien**

### H30 — Copiar el enlace siempre funciona o te dice qué hacer

- Marcado por el usuario: **bien**

### H49+H34 — Avisos y confirmaciones dentro del sistema

- Marcado por el usuario: **bien**

### U18+H33 — Cancelar y restaurar, completos en la Actividad

- Marcado por el usuario: **bien**
- Pregunta quitada por el crítico: Hoy el motivo de una cancelación también se escribe dentro de las Notas de la solicitud ('[CANCELADA] Razón: …'), y esas notas pasan después a la cotización y al pedido. ¿Qué hacemos? → decisión: **Guardarlo solo en la Actividad y en el aviso de 'Solicitud cancelada', y limpiar también las notas viejas que ya lo tienen (con respaldo)** (opción recomendada; regla R3).

### H26 — Solicitud sin precios en la Actividad

- Marcado por el usuario: **bien**

## Reglas de implementación (rulings)

- **R1 — Nota externa en el Chatter (U6+H22, marcado "Cambiar"; comentario del usuario: "que se pueda colocar una nota externa y esa nota externa si reinicie el conteo"; respuesta a atraso_por_contacto = la recomendada: "Solo los contactos con el cliente (llamada, WhatsApp, correo) reinician el conteo; las notas internas no").** Se interpreta como un quinto tipo de entrada del Chatter, 'EXTERNA' = «Nota externa»: el registro de un contacto con el cliente por cualquier medio (visita, reunión, llamada desde otro teléfono, mensaje por otra aplicación…), con el medio opcional. BACKEND (T4, `backend/app/core/chatter.py`): `TIPOS_CHATTER` agrega `'EXTERNA': 'Nota externa'`; `MAX_MEDIO = 60`; `validar_nota(body)` acepta `body.medio` (texto recortado; más de 60 caracteres → `ValueError('El medio es muy largo (máximo 60 caracteres).')`) y lo guarda como `extra = {'tipo': 'EXTERNA', 'medio': medio}` solo cuando el tipo es EXTERNA y el medio no queda vacío (con otros tipos se ignora); `reinicia_atraso(tipo)` es verdadero para LLAMADA, WHATSAPP, CORREO y EXTERNA, y falso para NOTA (la nota interna no reinicia). FRONTEND (T6B, `frontend/src/lib/chatter.js` y `frontend/src/app/dashboard/ventas/chatter.tsx`): `TIPOS_CHATTER.EXTERNA` con chip 'Nota externa', título 'Nota externa (contacto con el cliente)', placeholder '¿Qué hablaste con el cliente y por qué medio?' y botón 'Guardar nota externa'; con ese tipo aparece el campo 'Medio (opcional)' (input de texto con sugerencias Visita, Reunión, Mensaje de texto, Otro; máximo 60) y la ayuda 'Registra un contacto con el cliente por cualquier medio: reinicia el conteo de atraso del documento.'; no abre ninguna aplicación; `MAX_MEDIO_CHATTER = 60` y `tituloEntradaChatter(a)` devuelve 'Nota externa · {medio}' cuando hay medio (si no, el título del tipo), y lo usan `EtiquetaChatter` y `ListaChatter`. El aviso 'Solo las ve tu equipo: el cliente no recibe lo que guardes aquí.' se conserva: la nota externa registra un contacto, no se le envía al cliente. Pruebas adicionales: en `test_chatter_notas.py::test_validar_nota_pura`, {'action':'CHATTER','description':'Fui a la obra','tipo':'externa','medio':' Visita '} → ('CHATTER','Fui a la obra',{'tipo':'EXTERNA','medio':'Visita'}); medio de 61 caracteres → ValueError; medio con tipo NOTA se ignora (extra == {'tipo':'NOTA'}). La prueba 9 del diseño se escribe con la opción elegida y suma un caso: tipo 'EXTERNA' reinicia `updated_at`; tipo 'NOTA' no lo cambia. En `test_chatter.mjs`: `tipoChatter({extra_data:{tipo:'EXTERNA'}}) === 'EXTERNA'` y `tituloEntradaChatter({action:'CHATTER', extra_data:{tipo:'EXTERNA', medio:'Visita'}}) === 'Nota externa · Visita'`. PANTALLAS: T8B (SC), T9A (COT y PVEN) y T9B (panel del Hub) solo montan `ChatterDocumento`/`ComposerChatter`, que ya traen la Nota externa con su campo Medio, y pintan sus renglones con `EtiquetaChatter` (título 'Nota externa · {medio}'). Donde el texto del diseño de U6+H22 habla de 'llamada, WhatsApp o correo' como los únicos contactos que reinician el atraso, queda ampliado por esta regla: también la Nota externa.
- **R2 — Pregunta quitada por el crítico: sc_despues_de_confirmar (U15).** Decisión = opción recomendada: "Se queda en 'Confirmada'; el avance se ve en la cotización y en el pedido". Es la base de U15 y U11 (la SC deja de reflejar el estado de su COT). Coincide con `decisiones-bloque2.md`.
- **R3 — Pregunta quitada por el crítico: motivo_en_notas (U18+H33).** Decisión = opción recomendada: "Guardarlo solo en la Actividad y en el aviso de 'Solicitud cancelada', y limpiar también las notas viejas que ya lo tienen (con respaldo)". Implementación: `cancelar_solicitud` deja de anexar '[CANCELADA] Razón: …' a `sc.notas` (T2B) y el script único `backend/scripts/limpiar_motivo_en_notas.py` (choque C1 f) limpia las notas viejas solo en T12 con el OK del usuario. NO se crea `limpiar_notas_cancelacion.py`.
- **R4 — U18 fusionado (choque C1).** Los dos arreglos de la página (U18-H31 y U18-H33, ambos marcados "Bien") son un solo arreglo "U18+H31+H33": backend en T2B, frontend en T6A (`resumenCancelacion`), T7 (lista) y T8A (detalle). En cada punto gana lo que dice C1: descripción del renglón CANCELLED «Cancelada: {motivo}» (no 'Solicitud cancelada. Motivo: …'); `extra_data.cambios` SIN clave 'campo' (no se crea `_detalle` con campo 'detalle' y no se toca `CambiosDeActividad` de `flujo.tsx`); renglones en el orden de C1 (a): 'Motivo', 'Estado anterior', 'Enlace de confirmación' (solo si `contar_tokens_vigentes` > 0, contado antes de revocar), 'Confirmación del cliente: Anulada' (si había gate1), 'Cliente en el CRM: Marcado como perdido' o 'Cliente en el CRM: No se pudo marcar como perdido' (no 'Oportunidad en el CRM'), 'Papelera'; helper único `_referencias_de_solicitud(db, sc_id) -> list[str]` y `_texto_papelera(db, sc)` (fecha = eliminada_at + 30 días llevada a America/Bogota, dd/mm/aaaa); `restaurar_solicitud` de H33 montado sobre lo que ya dejó el Bloque 1 (R34); DELETED y PURGED en el mismo commit del borrado. Un solo archivo de pruebas, `backend/tests/test_cancelacion_solicitud_actividad.py` (NO se crea el `test_cancelar_restaurar_actividad.py` que nombra H33), con la unión de las pruebas 1–6 de H31 y 1–9 de H33 (la 10 de H33 la cubre la 6 de H31, sobre `limpiar_motivo_en_notas`), con estos ajustes: la prueba 1 de H33 afirma la descripción 'Cancelada: El cliente ya no la necesita'; la prueba 2 de H31 busca la etiqueta 'Cliente en el CRM' con 'Marcado como perdido'; la prueba 6 de H33 (restaurar con COT activa) espera el 409 del Bloque 1 con el número de la COT en el mensaje, la SC sigue CANCELADA y no hay renglón RESTORED (R34: gana el Bloque 1 sobre la primera rama de C6), no 'COTIZADA'; la prueba 7 de H33 afirma que el lead queda en la etapa inicial del pipeline (`reabrir_lead_de_solicitud`, R34) y 'Cliente en el CRM' en los cambios; la prueba 3 de H33 además afirma el renglón 'Motivo de la cancelación'. Frontend: tarjeta rose y `resumenCancelacion` de H31; aviso de restaurar de H33 con `useAvisos`; `getRazonCancelacion` deja de inventar un motivo pero sigue leyendo las notas viejas como respaldo hasta la limpieza.
- **R5 — U11, respuestas del usuario (iguales a la recomendación; fijan las ramas del diseño).** enviar_cot_sin_confirmar = "Sí; el cliente confirma la cotización con sus precios y con eso la solicitud también queda confirmada" → opción A: NO se agrega el 409 de la opción B en `enviar_cotizacion_para_confirmacion`; lo cubre la sincronización de U15 (T2A); el aviso ámbar de la COT (T9A) lleva la frase de la opción A; la prueba 6 se escribe en su versión A. quien_cotiza_sin_confirmar = "Cualquier asesor o administrador (queda registrado con su nombre y el motivo)" → `require_roles(*ROLE_ADMIN, *ROLE_ASESOR)`; el botón no se oculta por rol; la prueba 8 con `vendedor_token` espera 200.
- **R6 — H21, respuesta del usuario: propagar a la COT y el PVEN abiertos de esa misma solicitud.** `_docs_abiertos_para_contacto(db, sc)` devuelve las COT con `sc_id == sc.id` y estado != 'RECHAZADA', y los PVEN con (`sc_id == sc.id` o `cot_id` en esas COT) y estado fuera de {'CANCELADO','ENTREGADO','FACTURADO','DEVUELTO_TOTAL'} (DEVUELTO_TOTAL no lo nombró el usuario, pero es un pedido cerrado que ya pasó por entregado: en el Bloque 1 no tiene transiciones). La prueba 9 del diseño se conserva y suma un PVEN DEVUELTO_TOTAL que no cambia. El texto gris bajo el formulario (T8B) dice: «Lo que corrijas aquí también se guarda en la ficha del cliente y en la cotización y el pedido abiertos de esta solicitud, y queda en la Actividad.».
- **R7 — H40, respuesta del usuario: "Escribir la razón del cambio (queda en la Actividad)".** Igual a la recomendación: el diseño se aplica tal cual (409 ANULA_CONFIRMACION sin la bandera, 422 si la razón tiene menos de 5 caracteres, llave `motivo_recotizacion` y no 'motivo', renglón de paso a Borrador terminado en 'Razón: …'). La variante 'solo casilla' no se implementa.
- **R8 — Numeración de tareas y referencias.** El plan agrega T0 (worktree) y deja los datos al final, así que el orden del cruce se corre: B2-T0→T1, B2-T1→T2, B2-T2→T3, B2-T3→T4, B2-T4→T5, B2-T5→T6, B2-T6→T7, B2-T7→T8, B2-T8→T9, B2-T9→T10, B2-T11→T11 (revisión y verificación) y B2-T10→T12 (datos, al final). Los textos del cruce copiados aquí ya vienen renumerados (B2-Tn = Task n de este plan). Cinco tareas del cruce se parten en dos para que cada implementador tenga un alcance acotado (unos 6 archivos de producción o un solo tipo de trabajo): Task 1 = 1A (base de avisos) + 1B (barrido de diálogos nativos); Task 2 = 2A (estados de la SC) + 2B (cancelar y restaurar); Task 6 = 6A (librerías de la solicitud) + 6B (chatter y piezas compartidas); Task 8 = 8A (detalle de la SC: estructura, estados y cotizar sin confirmación) + 8B (editor de productos, datos del cliente y Chatter); Task 9 = 9A (COT y PVEN) + 9B (Hub y «Nueva Solicitud»). Se implementan en ese orden (A antes que B), cada una con su revisión. Una referencia "Tn" sin letra a una tarea partida (aquí, en el cruce o en "B2-Tn") significa las dos partes; el reparto exacto está en el "Alcance en esta tarea" de cada ítem. En el texto de los diseños, "T1…T14" sin prefijo son tareas del Bloque 1 (B1-Tn). Las líneas que citan los diseños son aproximadas: se ubica cada cambio por nombre de función en el código del worktree.
- **R9 — Autoría en los endpoints nuevos (choque C13) y `nombre_de_usuario`.** `nombre_de_usuario(user) -> str` (= `user.username or user.email or 'Sistema'`) se crea en T3 en `backend/app/core/textos_actividad.py` (primer uso: /cotizar-sin-confirmacion) y `backend/app/core/chatter.py` (T4) lo importa y lo reexporta. Los tres endpoints NUEVOS del bloque (POST /ventas/solicitudes/{id}/cotizar-sin-confirmacion, PATCH /ventas/solicitudes/{id}/cliente y POST /ventas/{solicitudes|cotizaciones|pedidos}/{id}/actividad, que ya existe pero U6+H22 rehace —P14—) toman el autor de la sesión e ignoran `body.user_name` y `body.updated_by`; los demás endpoints existentes no cambian su contrato. Ajustes: `CotizarSinConfirmacionBody` = {motivo, cotizador opcional} (sin user_name); la prueba 2 de U11 afirma `user_name == nombre_de_usuario(user_admin)` aunque el body mande otro; la prueba 1 de H21 igual; el frontend manda `{motivo}` a /cotizar-sin-confirmacion (T8A) y el PATCH /cliente sin `updated_by` (T8B).
- **R10 — Error legible de apiFetch (choque C3).** Un solo helper en `frontend/src/lib/avisos.js` (T1A): `errorDeRespuesta(status, body)` devuelve un `Error` con `message = textoDeDetalle(body?.detail ?? body?.message, status)`, `.status = status` y `.detail = body?.detail ?? null`. `textoDeDetalle` reconoce además un objeto con `mensaje` string (devuelve ese texto). `frontend/src/lib/api.ts` lo lanza con import RELATIVO `./avisos.js` (la prueba node de H23, `test_apifetch_401.mjs`, no resuelve '@/'). No se crea `lib/api-error.js` ni `test_api_error.mjs`: sus casos pasan a `test_avisos.mjs` con el formato de H49 (una lista de errores sin `loc` se une con un espacio: [{msg:'a'},{msg:'b'}] → 'a b'; un cuerpo vacío con 500 da el texto que contiene '(500)'). La calculadora (T9A) detecta `err.status === 409 && err.detail?.codigo === 'ANULA_CONFIRMACION'`.
- **R11 — POST /cotizaciones con sc_id (choque C7).** Con sc_id de una SC existente, en este orden y ANTES de `_gen_numero` (no se gasta un número de la secuencia): 409 de SC cancelada (N4, ya existe en `create_cotizacion`) → 400 por COT activa o PVEN vigente con los mismos mensajes de N7 (OJO: en el código del Bloque 1 esa guarda existe solo en `confirmar_solicitud`, NO en `create_cotizacion`: T3 la agrega aquí extrayendo de `confirmar_solicitud` el helper `_exigir_sin_documentos_activos(db, sc)`, que lanza esos dos 400 y que usan `confirmar_solicitud`, `create_cotizacion` y /cotizar-sin-confirmacion; cuando viene sc_id, la SC se lee con `.with_for_update()` para que dos POST simultáneos no creen dos COT) → 409 «Esta solicitud no ha sido confirmada por el cliente: usa «Cotizar» en la solicitud para crear la cotización con el motivo.» si la SC no tiene confirmación vigente (estado != 'CONFIRMADA' o `gate1_confirmed_at` None). No se acepta `motivo_sin_confirmacion` (si llega, se ignora y responde igual 409): la única vía auditada es /cotizar-sin-confirmacion. El cambio 4 del diseño de U11 se reemplaza por esto y su prueba 7 queda: sin motivo → 409; con `motivo_sin_confirmacion` → 409; SC CONFIRMADA con gate1 → 201; con una COT activa previa → 400. Ajustes de pruebas existentes (T3): `test_anticipo_modalidad::test_crear_la_cot_desde_una_sc_toma_el_porcentaje_de_la_modalidad` y la prueba 4 de `test_notas_solicitud_en_cotizacion_y_pedido.py` crean la SC en CONFIRMADA con `gate1_confirmed_at = utcnow()`.
- **R12 — Los choques del cruce son vinculantes.** Cada choque C1–C20 de la sección "Choques resueltos" trae su resolución y gana sobre el texto de los diseños individuales. Cada tarea copia el texto completo de los choques que aplica. Dónde cae cada uno: C1 → T2B/T6A/T7/T8A (R4); C2 → T6A/T7/T8B (librería y componente únicos de líneas); C3 → T1A (R10); C4 → T1B (prueba guardián) y todas las tareas de frontend siguientes (useAvisos; R30); C5 → T2A (etiquetas y mensaje del 400) y T6A (paridad); C6 → T2A (script de estados) y T2B (en restaurar_solicitud gana el 409 del Bloque 1 con documentos activos, R34); C7 → T3 (R11); C8 → T2A/T2B/T3 (un solo commit por operación, `commit=False`); C9 → T3 (una lectura de la SC en get_cotizacion) y T4 (la reutiliza); C10 → T4 (reparto) y T9A (TOTALES); C11 → T6B (componente), T8A (pestañas SC; T8B pone el Chatter en la suya) y T9A (pestañas COT/PVEN); C12 → T6B (`anchoInicialPanel`), T8B y T9A; C13 → T3/T4/T5 (R9); C14 → T2B (la guarda ya la puso el Bloque 1: se conserva y se prueba, R34); C15 → T2A (leer el código real de B1-T4 antes de reescribir la sincronización); C16 → T6A/T7 (H10 es la implementación); C17 → T9A; C18 → T4 (H26) antes que T5 (H21); C19 → T8A (enlaces con `waUrl`, sin abrir el Chatter); C20 → T1A, T1B, T6A y T6B, en ese orden (únicas que tocan la línea "test" de package.json; cada una agrega solo sus módulos en su propio hunk). En el texto copiado del cruce, "B2-T1" es la Task 1 (1A y 1B), "B2-T2" la Task 2 (2A y 2B), "B2-T6" la Task 6 (6A y 6B), "B2-T8" la Task 8 (8A y 8B) y "B2-T9" la Task 9 (9A y 9B) (R8).
- **R13 — Migración fa6_025 (U11).** Archivo `backend/alembic/versions/fa6_025_cotizacion_sin_confirmacion.py` con `revision = "fa6_025"` y `down_revision` = la cabeza real (antes: `$env:ALEMBIC_ENV='testing'; & C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe -m alembic heads` desde `C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-bloque2-pantallas-sc-cot\backend`; el Bloque 1 dejó `fa6_024` en `fa6_024_anticipo_manual_y_pago_trasladado.py`; si hay otra cabeza posterior, se encadena a esa). Solo aditiva: `sales_quotations.sin_confirmacion_sc_at TIMESTAMP NULL` y `sin_confirmacion_sc_motivo TEXT NULL`. Se aplica con `$env:ALEMBIC_ENV='testing'; & C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe -m alembic upgrade head` (usa TEST_DATABASE_URL = erp_test). Nunca downgrade ni DROP. Producción: solo al promover, con el procedimiento de producción de `alembic/env.py` y el OK del usuario.
- **R14 — Ediciones parciales de las páginas .tsx (regla `.agents/rules/no-full-tsx-rewrite.md`).** El permiso de reescritura que el usuario dio en el Bloque 4 (ítem PERMISOS) NO aplica a este bloque. Cada cambio en una página existente se hace con ediciones quirúrgicas por bloque (Edit), nunca con Write sobre el archivo ni con un script que lo reescriba, y nunca reemplazando más del 30% de las líneas de una página en una sola operación. Sacar componentes a archivos nuevos (ProductSearch, NewClientModal) y borrar ChatterTab son recortes acotados (<10% del archivo cada uno). Si un paso exigiera reemplazar más del 30% de una página de una vez, el implementador se DETIENE y el controlador le pregunta al usuario. Páginas de la lista de máxima protección de la regla que toca este bloque: `frontend/src/app/dashboard/ventas/page.tsx` (Hub v5: solo los bloques nombrados en T1B y T9B) y `frontend/src/app/dashboard/ventas/solicitud/page.tsx` (10 líneas: T9B solo cambia el `fallback` del Suspense por H9). Estilos: lo que se toque usa los tokens de `frontend/src/lib/design-system.ts` cuando existan (`.agents/rules/design-system-reference.md`: BTN, DETAIL_PANEL, TABS_BAR, fCOP…); la pestaña Análisis de `solicitud-client.tsx` (T7, H10) conserva la estructura canónica de `.agents/rules/analisis-tab-standard.md` y solo cambia etiquetas. El plan aprobado por el usuario (página del plan 2026-10-04) es la explicación previa que la regla pide cuando una tarea toca más de 2 secciones de la misma página.
- **R15 — Capturas, mediciones, servidores y credenciales.** Nunca tocar el uvicorn del puerto 8000 ni los servidores de 5000/5100. Para ver el código del worktree: backend en el puerto 8020 (`cd C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-bloque2-pantallas-sc-cot\backend; $env:CORS_ALLOWED_ORIGINS='http://localhost:5300'; & C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe -m uvicorn main:app --port 8020`) y frontend en el 5300 (`cd C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-bloque2-pantallas-sc-cot\frontend; $env:NEXT_PUBLIC_API_URL='http://localhost:8020/api/v1'; npx next dev -p 5300`, o `npx next build` + `npx next start -p 5300` para medir tiempos). SIEMPRE con NEXT_PUBLIC_API_URL: sin esa variable el frontend apunta a PRODUCCIÓN (api.nebulaekids.com). Las capturas y mediciones con sesión iniciada las corre el CONTROLADOR con un script Playwright (patrón de `C:\Users\jmqui\AppData\Local\Temp\claude\C--Users-jmqui-OneDrive-Documents-Nebulae-ERP-CRM\9b6ebdd4-1319-4838-bd25-6b5d950ef334\scratchpad\capturas\recorrido.js`, playwright-core con Edge) que lee QA_EMAIL/QA_PASS de su propio entorno y nunca los imprime; los implementadores no manejan contraseñas ni crean cuentas: dejan escrita la lista de pantallas y pasos a capturar. Tamaños: 1024×768 y 1440×1000; carpeta `C:\Users\jmqui\AppData\Local\Temp\claude\C--Users-jmqui-OneDrive-Documents-Nebulae-ERP-CRM\9b6ebdd4-1319-4838-bd25-6b5d950ef334\scratchpad\capturas\bloque2\antes` (T0) y `C:\Users\jmqui\AppData\Local\Temp\claude\C--Users-jmqui-OneDrive-Documents-Nebulae-ERP-CRM\9b6ebdd4-1319-4838-bd25-6b5d950ef334\scratchpad\capturas\bloque2\despues` (T11), más capturas puntuales por tarea en `C:\Users\jmqui\AppData\Local\Temp\claude\C--Users-jmqui-OneDrive-Documents-Nebulae-ERP-CRM\9b6ebdd4-1319-4838-bd25-6b5d950ef334\scratchpad\capturas\bloque2\T<n>`. Se navegan documentos DEMO existentes; si un recorrido necesita crear o cambiar documentos, solo con nombre DEMO en erp_test, se anotan en el ledger y se le informan al usuario al final. Nunca se usan los documentos reales del usuario.
- **R16 — Pruebas que dependen de un archivo de otra tarea.** La prueba 2 de U15 (`test_paridad_etiquetas_solicitud_con_el_frontend`) necesita `frontend/src/lib/estados-solicitud.js`, que crea T6A: se agrega a `backend/tests/test_estados_solicitud.py` (que crea T2A) en T6A y se corre ahí con el runner. Los casos frontend de U11 (`puedeCotizarSinConfirmacion`) y de U18 (`resumenCancelacion`) van en `frontend/tests/test_estados_solicitud.mjs` en T6A. Las pruebas de las librerías de T6A y T6B cubren la lógica que T7–T9 solo conectan a las pantallas.
- **R17 — Hueco 2 (H16: /ventas/solicitudes?limit=200 y /ventas/config pedidos 4 veces).** El CONTROLADOR lo mide en T0 en el build de producción del worktree (R15): cuenta las peticiones a esas dos rutas al abrir /dashboard/ventas/solicitud. Si en producción salen más de una vez cada una, T7 (dueña de `solicitud-client.tsx`) lo arregla con un solo efecto de carga y la configuración cacheada en el módulo, con captura de red antes/después; si sale una vez, se cierra como artefacto de desarrollo (StrictMode) y se anota en el ledger. T11 vuelve a medir.
- **R18 — Hueco 3 (seguridad de H21) y la regla de Gate 1 del Bloque 1 para el cambio de cliente: corregir el correo o el teléfono anula lo que el cliente anterior confirmó o podía confirmar.** Distinto de lo que dice el diseño de H21 ("no cambia el estado, no revoca el enlace pendiente y no anula la confirmación"). Motivo: después del diseño, la revisión de B1-T4 hizo que `update_solicitud` trate un cambio de `customer_id`, `customer_email` o `customer_phone` (normalizados con `_cliente_de_la_solicitud`: espacios fuera, correo en minúsculas) como cambio de cliente que invalida Gate 1; si PATCH /solicitudes/{id}/cliente no aplicara la misma regla, sería un atajo para cambiar a quién le llegó el enlace sin anular su confirmación (y el frontend de H21 corrige el contacto SOLO por /cliente). Un solo criterio de Gate 1. BACKEND (T5): (1) T5 lleva la regla del Bloque 1 a un helper `_anular_confirmacion_por_cambio_de_cliente(db, sc, old_estado, autor) -> dict` (devuelve `{confirmacion_anulada: bool, estado_cambiado: bool, enlace_anulado: bool}`), extraído de `update_solicitud` sin cambiar su comportamiento (las pruebas del Bloque 1 `test_rechazo_cotizacion_solicitud_activa::test_cambiar_el_cliente_con_el_enlace_pendiente_lo_anula` y `::test_cambiar_el_cliente_con_una_cotizacion_activa_anula_la_confirmacion` siguen pasando sin tocarlas); si el Bloque 1 ya dejó un helper equivalente, se reutiliza ese. Todo con `commit=False` (`_log` y `revoke_pending_tokens`). (2) `corregir_datos_cliente_solicitud` lo llama cuando cambia `customer_email` o `customer_phone` (normalizados igual): SC en PENDIENTE_CONFIRMACION o CONFIRMADA sin COT activa → vuelve a ASIGNADA (BORRADOR sin asesor), se revoca su enlace, gate1 None y ESTADO_CHANGED con el texto del Bloque 1; con una COT activa → el estado no cambia, gate1 None, enlace revocado y el renglón UPDATED del Bloque 1; en ASIGNADA o BORRADOR no hay nada que anular. (3) Por cada COT propagada (R6) en PENDIENTE_CONFIRMACION: `revoke_pending_tokens(db, 'COT', cot.id, commit=False)`, su estado no cambia, y en su Actividad se agrega a los cambios {etiqueta:'Enlace de confirmación', despues:'Se anuló el enlace enviado al dato anterior: reenvíalo'}. Una COT CONFIRMADA no se toca (el cliente confirmó precios). (4) Todo en la misma transacción que la corrección (un solo commit). (5) La respuesta agrega `confirmacion_anulada: bool` y `enlaces_anulados: [números de SC/COT con enlace anulado]`. Cambiar solo la dirección o la ciudad no anula nada. PRUEBAS: la prueba 8 del diseño se reescribe como `test_corregir_el_correo_con_el_enlace_pendiente_anula_el_enlace` (SC PENDIENTE_CONFIRMACION sin COT con token vigente → PATCH correo → `_token_usado` True, estado ASIGNADA, gate1 None, `confirmacion_anulada` True); nuevas: 13) `test_corregir_el_telefono_de_una_sc_confirmada_con_cot_activa_anula_gate1_sin_cambiar_estado`; 14) `test_cotizacion_propagada_pendiente_queda_con_el_enlace_anulado` (COT en PENDIENTE_CONFIRMACION con token vigente → token usado, la COT sigue PENDIENTE_CONFIRMACION, su número en `enlaces_anulados`); 15) `test_corregir_solo_la_direccion_no_anula_nada`. FRONTEND (T8B), en lugar del Toast del diseño: si `confirmacion_anulada`, `avisar('Datos corregidos. Como cambió el correo o el teléfono del cliente, su confirmación quedó anulada: envíale la solicitud de nuevo.', {tono: 'info'})`; si no, y `enlaces_anulados` trae elementos, `avisar('Datos corregidos. Se anuló el enlace que se había enviado al dato anterior: usa «Reenviar enlace de confirmación».', {tono: 'info'})`. El texto gris bajo el formulario (R6) suma: «Si cambias el correo o el teléfono, la confirmación del cliente se anula y hay que enviársela de nuevo.».
- **R19 — Hueco 4 (Hub, accionSiguienteSC).** En T9B, `accionSiguienteSC` de `frontend/src/lib/hub-ventas.js` (B1-T9) usa `row.confirmacion_vigente` (llega en `_sc_dict` desde T2A) en el paso 'CONFIRMADA → Cotizar': si no es `true`, la acción es la de una Asignada ('Enviar para confirmación', que abre la solicitud). `frontend/tests/test_hub_ventas.mjs` actualiza el caso 'CONFIRMADA → Cotizar' (con confirmacion_vigente true) y agrega el caso no vigente.
- **R20 — Hueco 5 (alertas con una COT temprana, U11).** Una SC con documentos activos (COT activa o PVEN vigente) no cuenta como atrasada ni como 'No resuelto': la alerta la lleva la COT. BACKEND (T3): en `alertas_resumen` y `get_alertas`, la consulta de SC atrasadas excluye con NOT EXISTS las SC que tienen una COT con estado != 'RECHAZADA' o un PVEN vigente (mismo criterio que `_documentos_activos_de_solicitud`, sin consultar fila por fila); prueba `test_sc_con_cotizacion_temprana_no_cuenta_como_atrasada` en `test_cotizar_sin_confirmacion.py` (SC ASIGNADA con `updated_at` de hace 10 días: cuenta; tras /cotizar-sin-confirmacion: ya no cuenta). FRONTEND (T9B): `esNoResuelto(row, scConCot)` de hub-ventas.js devuelve false para una SC con `scConCot.has(row.id)` en cualquier estado sin confirmar (pasa a 'Acción tomada' con `esAccionTomada`), con su caso en `test_hub_ventas.mjs`.
- **R21 — Hueco 6 (U11, dos huecos menores).** (1) `_crear_cotizacion_desde_solicitud(db, sc, cotizador, user_name)` se extrae en T3 del `confirmar_solicitud` tal como lo dejan el Bloque 1 (texto de N7 '(reemplaza a la cotización rechazada …)') y T2A (renglón COTIZACION_CREADA), no de las líneas 728-756 que cita el diseño. (2) Texto del rechazo cuando la SC no cambia de estado (acción COTIZACION_RECHAZADA): con la SC en ASIGNADA (nunca se le envió al cliente) es «La cotización {COT} fue rechazada. La solicitud sigue activa: envíasela al cliente para que la confirme o cotízala de nuevo.» (reemplaza el texto de U15 solo en ese caso, como pide el hueco); con la SC en PENDIENTE_CONFIRMACION (el enlace ya salió) se conserva el de U15, «La cotización {COT} fue rechazada. La solicitud sigue esperando la confirmación del cliente.»; con la SC en CONFIRMADA, el de U15 («…sigue activa: ya puedes crearle una nueva cotización.»). Lo implementa T2A en la sincronización; T2A lo prueba con una COT creada por ORM (`test_rechazar_con_la_solicitud_sin_confirmar_no_cambia_su_estado`) y T3 con una COT de /cotizar-sin-confirmacion.
- **R22 — Hueco 7 (detalle de la SC, dos cosas sin dueño) → T8A.** (1) El doble botón de volver (flecha más '← Volver') pasa a `<BotonVolver href={destinoVolver(safeReturnTo, '/dashboard/ventas/solicitud')} />` (T6B crea `BotonVolver` y `destinoVolver`). (2) La tarjeta 'Modalidad 60/40' que hoy solo sale con 60/40 sale para toda modalidad: título con `etiquetaModalidad(m)` y 'Anticipo {pct}% / Saldo {100−pct}%' con `pct = pctAnticipoDeModalidad(m) ?? 60` (R2 del Bloque 1), igual que el formulario de H10.
- **R23 — Hueco 8 (tildes del detalle de COT y PVEN) → T9A.** Barrido de los textos VISIBLES sin tilde en `cotizacion/[id]/page.tsx`, `cotizacion-client.tsx` (solo textos visibles de CalculadorModal y de la lista) y `venta/[id]/page.tsx` ('Datos de la Cotización', 'Sin cotización ni solicitud de origen', etc.), sin tocar el panel IA (Bloque 5), los valores guardados ni las claves. La modalidad `sc_modalidad_pago` se muestra con `etiquetaModalidad`. Verificación: grep de 'Cotizacion|cotizacion |Linea|Telefono|Direccion|catalogo|Numero|Informacion|todavia|Accion|Descripcion|Pagina' sobre los textos visibles (no imports, rutas ni claves): 0 coincidencias nuevas.
- **R24 — Hueco 9 (react-hot-toast sin <Toaster/>) → T1A.** `AvisosProvider` monta una vez `<Toaster position="top-center" />` de react-hot-toast (ya es dependencia del frontend). Así se ven los mensajes de CRM, Agenda, Cotizador Rápido, Calendario y Finanzas. Antes de montarlo, verificar con grep que no haya otro `<Toaster` en `src/`.
- **R25 — Hueco 10: fuera del bloque, a tareas aparte.** (a) Agenda > 'Historial Comercial' lee `customer360.customer_requests` y el backend manda 'solicitudes' (siempre vacío); (b) los `created_at` del perfil 360 van sin 'Z' (desfase de 5 h); (c) tercer formulario 'Nueva Solicitud' en `agenda/page.tsx` (`crm.create_customer_solicitud`) que no usa SolicitudTipoYDetalle; (d) copiar enlaces sin manejo de error en asistente_omnicanal y marketing/campanas (pueden reutilizar `copiarTexto`); (e) unas 45 llamadas nativas alert/confirm fuera de Ventas. No se implementan aquí: T11 los deja en el ledger y el controlador se los informa al usuario al final.
- **R26 — Hueco 11 (orden de los datos) → T12, al final del plan.** Los tres scripts corren solo con el OK del usuario, en cada base por separado y DESPUÉS de que la T14 del Bloque 1 se haya aplicado en esa base (N4 completa eliminada_at y razon_cancelacion; el script de H7 corrige textos). Orden: `limpiar_motivo_en_notas.py` → `ajustar_estados_solicitud.py` → `corregir_actividad_sc_sin_precio.py`. Cada uno: reporte (por defecto) → OK → `--aplicar` → reporte otra vez (0 candidatas), con el SQL de restauración en su docstring. Además, la consulta (b) de U18+H33 (leads 'Perdido' cuya SC ya no está cancelada) se resuelve con la función `ajustar_leads(db, aplicar=False, ids=None)` del mismo `ajustar_estados_solicitud.py` (T2A, con prueba en el runner): mueve esos leads a QUOTATION si la SC tiene COT activa o a DRAFT si no, con `mover_lead_de_solicitud`; también solo con OK. Producción: solo con un OK aparte del usuario.
- **R27 — Hueco 1 (afirmaciones verificadas): correcciones que aplica el plan.** (a) La prueba `test_anticipo_modalidad::test_crear_la_cot_desde_una_sc_toma_el_porcentaje_de_la_modalidad` que U11 no listaba se ajusta en T3 (R11). (b) `flujo.tsx` no gana el campo 'detalle' (C1, R4). (c) Las pestañas Actividad | Chatter | IA de COT y PVEN son de T9A (grupo chatter, C11), no de U12. (d) Hoy `Modal` NO usa portal: el portal de `NewClientModal` lo introduce H11 en T7 y por eso su `e.stopPropagation()` en el submit es obligatorio (prueba manual (d) de H11: guardar el cliente no hace POST /ventas/solicitudes).
- **R28 — Precedencia.** Las respuestas del usuario ganan sobre el diseño; los choques del cruce ganan sobre los diseños individuales; lo que el Bloque 1 ya implementó y revisó gana sobre el texto de los diseños y del cruce del Bloque 2 cuando lo contradice (R18, R34), salvo que una respuesta del usuario diga otra cosa; estas reglas R1–R34 resuelven lo que quedaba abierto y ganan sobre el texto del diseño cuando lo contradicen. En cada ítem se copian la pregunta y la respuesta del usuario.
- **R29 — Rechazo de una COT con la SC en un estado heredado (hueco detectado al escribir el plan).** La regla de U15 para RECHAZADA cubre SC en CONFIRMADA, ASIGNADA y PENDIENTE_CONFIRMACION, pero no una SC vieja en COTIZADA, EN_ESPERA_CONFIRMACION o VENCIDA (estados heredados). Para no dejarla atascada en un estado que ya no se asigna, si su única COT activa se rechaza (sin otra COT activa ni PVEN vigente), la sincronización conserva lo que hace hoy el Bloque 1 (B1-T4): CONFIRMADA si tiene `gate1_confirmed_at`; si no, ASIGNADA con asesor o BORRADOR sin él, con ESTADO_CHANGED y el texto de N7 que ya existe. Prueba en T2A: `test_rechazar_con_solicitud_heredada_la_saca_del_estado_heredado`.
- **R30 — 'Reiniciar solicitud' (U15) con `confirmar()` (choque C4).** En el detalle (T8A) y en el menú de fila de la lista (T7) no se abre un Modal propio: `if (!(await confirmar({titulo: 'Reiniciar solicitud', mensaje: 'La solicitud vuelve a {Nueva|Asignada}: se anula el enlace que se le envió al cliente y su confirmación, y habrá que enviársela de nuevo.', textoConfirmar: 'Reiniciar solicitud', peligro: true}))) return;` y luego PATCH {estado:'BORRADOR', updated_by}. El 409 de R10 del Bloque 1 (documentos activos) sale con `avisarError`. La etiqueta del destino ('Nueva' o 'Asignada') sale de `infoEstadoSolicitud`.
- **R31 — Decisiones que los diseños tomaron sin preguntar: quedan aceptadas.** El usuario marcó esos arreglos "Bien" con su texto a la vista: elegir del catálogo agrega el producto de una vez con cantidad 1; las líneas del mismo producto se suman; quick-create reutiliza el producto ACTIVO con el mismo nombre (también desde el CRM y la COT); el alta de cliente pone todo el texto en Nombre (no adivina el apellido) y un número que no es celular ni fijo no se pone en ningún campo; con cliente elegido queda solo la tarjeta índigo; 'Eliminar permanentemente' sigue siendo solo de ADMIN, con confirmación roja sin escribir el número; las notas del Chatter no se editan ni se borran; se puede escribir en el Chatter de documentos cancelados.
- **R32 — Datos existentes y documentos reales.** T1–T11 no modifican datos (solo pruebas dentro de la transacción revertida del runner). Los scripts de datos (T2A, T2B y T4) excluyen explícitamente los documentos reales del usuario — SC-20260731, COT-20260449, PVEN-20262799, SC-20260746 — y todo lo vinculado a ellos (las SC con esos números y las SC a las que pertenecen COT-20260449 y PVEN-20262799, por sc_id o por la COT del pedido), además de las SC de Soporte Técnico. Cada script define la constante `DOCUMENTOS_REALES = ('SC-20260731', 'COT-20260449', 'PVEN-20262799', 'SC-20260746')` y su prueba (a) afirma que trae exactamente esos cuatro números y (b) con `monkeypatch.setattr` sobre esa constante del módulo le agrega el número de un documento de prueba creado dentro de la transacción y verifica que no sale en las candidatas. Las pruebas NUNCA crean un documento con un número real: `numero` es único y los reales pueden existir en erp_test. Corren en modo reporte por defecto, en una transacción, con tabla de respaldo validada (^[a-z_][a-z0-9_]*$), BD enmascarada al imprimir y SQL de restauración en el docstring.
- **R33 — Revisión independiente y seguridad.** Ninguna tarea se da por terminada sin una revisión independiente (cumplimiento del plan + calidad) por un revisor distinto del implementador. U11, U15 y H21 tocan Gate 1: T11 hace además una revisión de seguridad dedicada sobre /cotizar-sin-confirmacion, las guardas nuevas de create_cotizacion (400 de documentos activos y 409, R11), la sincronización reescrita (SC Confirmada sin marca gate1 por la COT y revocación del enlace viejo), la rama SC de confirmar_via_token, PATCH /solicitudes/{id}/cliente (permisos, propagación, 409 de correo, misma regla de Gate 1 que update_solicitud y enlaces de COT anulados, R18), restaurar_solicitud (R34) y la autoría del Chatter (R9). Los hallazgos se corrigen en T11 con su prueba antes de seguir.
- **R34 — Lo que la revisión de B1-T4 ya cambió en la cancelación y la restauración de la SC (posterior al diseño; ledger del Bloque 1).** Antes de escribir T2A y T2B se lee el código final del Bloque 1 en `update_solicitud`, `restaurar_solicitud` y `crm.reabrir_lead_de_solicitud`. Lo que el Bloque 1 dejó gana sobre el texto de los diseños y del cruce del Bloque 2 cuando lo contradice: (1) `update_solicitud` ya responde 409 «La solicitud {numero} está cancelada: para volver a trabajar en ella, restáurala desde la Papelera (botón «Restaurar»).» cuando una SC CANCELADA recibe un estado distinto de CANCELADA: es la guarda de H31/C14. T2B no la duplica ni la reordena. Orden real del Bloque 1 (verificado en el código): primero los 400 de Gate 1 para {estado:'CONFIRMADA'} y para {estado:'ASIGNADA'|'PENDIENTE_CONFIRMACION'}, luego este 409 de cancelada, luego el 400 de CANCELADA por PATCH y el 400 de estado no manual, y al final el 409 de R10. Por eso un PATCH {estado:'BORRADOR'}, {estado:'COTIZADA'} o {estado:'ENTREGADO'} sobre una cancelada da 409 con 'Papelera' (no el 400 de estado no manual), mientras que {estado:'CONFIRMADA'} sigue dando el 400 de Gate 1, y así se queda. La prueba 5 de H31 (con BORRADOR) y su caso con COTIZADA lo cubren; la prueba del Bloque 1 `test_una_solicitud_cancelada_no_revive_por_patch` ya lo afirma con BORRADOR y ENTREGADO. (2) `restaurar_solicitud` ya responde 409 si la SC no está CANCELADA y 409 con `_mensaje_documentos_activos(sc, cots, pvens, 'restaurar')` si tiene COT activas o PVEN vigentes, y reabre el lead con `reabrir_lead_de_solicitud(sc.id, db)` (etapa inicial del pipeline, la de un lead nuevo). Por eso la primera rama de C6 (restaurar con documentos activos → CONFIRMADA y lead QUOTATION) NO se implementa en el endpoint: ese caso solo existe con datos viejos y su salida es rechazar o cancelar primero esos documentos; la regla completa de C6 sigue valiendo para `ajustar_estados_solicitud.py`. T2B conserva esos dos 409 con su texto exacto, «La solicitud {numero} no está cancelada: no hay nada que restaurar.» y el de `_mensaje_documentos_activos(..., 'restaurar')` (no se le suma la etiqueta del estado que proponía H33: la prueba del Bloque 1 `test_restaurar_exige_una_solicitud_cancelada_y_sin_documentos_activos` afirma el texto exacto y la prueba 5 de H33 solo pide el 409 sin cambio de estado), y agrega lo de H33: estado final ASIGNADA con asesor o BORRADOR sin él, una sola escritura (sin pasar por BORRADOR ni por el UPDATE crudo), `contar_tokens_vigentes` antes de revocar, renglón RESTORED «Solicitud restaurada a {etiqueta}» con sus cambios ('Queda {etiqueta}', 'Motivo de la cancelación', 'Confirmación del cliente', 'Cliente en el CRM: Vuelve a {etapa}' si el lead se reabrió —con las etapas estándar, 'Vuelve a Nuevo Lead'—) y la respuesta `{id, numero, estado, estado_label, mensaje}`. Para el commit único (C8) y para saber si el lead se reabrió, T2B cambia `reabrir_lead_de_solicitud(sc_id, db)` a `reabrir_lead_de_solicitud(sc_id, db, commit: bool = True) -> Optional[str]`: con `commit=True` (por defecto) hace lo mismo que hoy; devuelve el nombre de la etapa a la que volvió el lead (`stage.name`, o 'Nuevo Lead' si no hay etapas) o None si no había lead perdido. restaurar_solicitud lo llama con `commit=False` dentro de `with db.begin_nested():` y, si falla, registra 'Cliente en el CRM: No se pudo reabrir' sin perder la restauración. (3) El Bloque 1 también limpia gate1 y anula el enlace cuando cambia el cliente de la SC por PATCH: ver R18. Si al leer el código alguno de estos puntos no está (el Bloque 1 lo cambió antes de cerrar), se aplica el diseño del Bloque 2 con C6 y C14 completos y se anota en el ledger.

## Choques resueltos (vinculantes; numeración B2-Tn ya corrida al plan, R8)

- C1 · U18 está diseñado DOS veces: U18+H31 (grupo estados-sc-y-cotizar) y U18+H33 (grupo dialogos-y-papelera) rediseñan las mismas funciones (cancelar_solicitud, restaurar_solicitud, get_papelera, eliminar_permanente, get_solicitud, getRazonCancelacion, ACTIVITY_STYLE SENT_TO_TRASH). Lo hacen con descripciones distintas, etiquetas distintas ('Oportunidad en el CRM' frente a 'Cliente en el CRM'), un formato de 'cambios' distinto (sin 'campo' frente a campo:'detalle'), helpers distintos (_solicitud_tiene_referencias frente a _referencias_de_solicitud/_texto_papelera), dos scripts (limpiar_motivo_en_notas.py y limpiar_notas_cancelacion.py) y dos archivos de prueba. Además, H33 pregunta lo que H31 ya decidió. RESOLUCIÓN VINCULANTE: un solo ítem 'U18+H31+H33', con el backend en B2-T2 y el frontend en B2-T7 y B2-T8.
  (a) cancelar_solicitud, montado sobre N4:
  - Conserva la descripción «Cancelada: {motivo}». H7 no la toca y las filas viejas dicen lo mismo.
  - extra_data.cambios va SIN clave 'campo', igual que _detalle_envio de H27. flujo.tsx:153 ya pinta así esos renglones, así que se descarta el cambio a CambiosDeActividad de H33.
  - Renglones: 'Motivo'; 'Estado anterior' (con etiqueta_estado); 'Enlace de confirmación' (solo si contar_tokens_vigentes>0, contado antes de revocar; el helper va en confirmation_tokens.py, como propone H33); 'Confirmación del cliente: Anulada' (si había gate1); 'Cliente en el CRM: Marcado como perdido' o 'No se pudo marcar como perdido'; 'Papelera'.
  - Deja de anexar '[CANCELADA] Razón' a las notas.
  (b) Un único helper _referencias_de_solicitud(db, sc_id) -> list[str] con las COT, los PVEN y el lead. Lo usan get_papelera, eliminar_permanente, cancelar_solicitud, get_solicitud (se_conserva_en_papelera / purga_programada) y _texto_papelera. La fecha de purga es eliminada_at + 30 días, en hora de Colombia, con formato dd/mm/aaaa.
  (c) restaurar_solicitud toma la versión de H33: 409 si no está CANCELADA, una sola escritura, el lead vuelve a DRAFT o QUOTATION y la respuesta trae 'mensaje'. El estado final sale del choque C6.
  (d) Los renglones DELETED y PURGED de H33 van en el mismo commit del borrado.
  (e) La guarda de H31 en update_solicitud (ver C14).
  (f) Un solo script, backend/scripts/limpiar_motivo_en_notas.py:
  - Quita cada renglón '[CANCELADA] Razón: X' solo si X coincide con razon_cancelacion o con el motivo de algún renglón CANCELLED de esa SC. Así no se pierde un motivo aunque la SC se haya cancelado, restaurado y vuelto a cancelar.
  - Hace respaldo, corre en modo reporte por defecto y es idempotente.
  - Se elimina limpiar_notas_cancelacion.py.
  (g) Un solo archivo de pruebas: backend/tests/test_cancelacion_solicitud_actividad.py, con la unión de los casos de los dos diseños.
  (h) Frontend:
  - La tarjeta rose y resumenCancelacion salen de H31.
  - El aviso de restaurar sale de H33, vía useAvisos.
  - getRazonCancelacion deja de inventar un motivo, pero sigue leyendo las notas viejas como respaldo hasta que se limpien.
- C2 · H13 está diseñado DOS veces, con piezas incompatibles: H25+H13 (lib/lineas-producto.js y LineasProductoEditables) y U7+U8+H12+H13 (lib/lineas-solicitud.js y LineasProductoChips). Las dos reescriben la lista de productos de SolicitudTipoYDetalle y ProductSearch. Una edita ProductSearch en su sitio y la otra lo mueve a buscador-producto.tsx. Las dos definen cambiarCantidad, con reglas opuestas: H25 acepta '' mientras se escribe y U7 fuerza ≥1 en cada tecla, que reproduce el bug '5'→'15' verificado en productos-solicitud.tsx:95. RESOLUCIÓN VINCULANTE:
  - H13 pertenece a formulario-nueva-sc (B2-T7).
  - Una sola librería, frontend/src/lib/lineas-solicitud.js, con lineaDesdeCatalogo, lineaTextoLibre, agregarLinea (con fusión), resolverTextoEscrito, lineasParaEnviar (que aplica cantidadValida), nombreLinea, quitarLinea, cantidadValida y cambiarCantidad con la regla de H25: acepta '' al escribir y se normaliza al salir del campo y al enviar.
  - Un solo componente, solicitud/lineas-producto.tsx: LineasProducto({lineas, onChange, tono:'morado'|'neutro'}), con −/+ y el input editable. Usa 'morado' en el formulario de creación (U8) y 'neutro' en el editor del detalle (H25).
  - ProductSearch se muda a buscador-producto.tsx (U7) e incluye los arreglos de H25: aviso con flex-wrap, resultados con break-words y placeholder con tilde.
  - Se descartan lib/lineas-producto.js, LineasProductoEditables y LineasProductoChips. Un solo archivo de pruebas: test_lineas_solicitud.mjs.
- C3 · Error de apiFetch: H40 crea lib/api-error.js (errorDeRespuesta con .status/.detail) y H49 crea lib/avisos.js (textoDeDetalle que lanza new Error(texto) sin .status ni .detail). Sin .status/.detail, el 409 ANULA_CONFIRMACION de H40 no se puede detectar, y textoDeDetalle no reconoce un objeto con 'mensaje', así que mostraría el texto genérico. RESOLUCIÓN VINCULANTE:
  - Un solo helper en lib/avisos.js: errorDeRespuesta(status, body). Devuelve un Error con message = textoDeDetalle(...), que también reconoce dict.mensaje, y con .status y .detail.
  - api.ts lo lanza con import relativo './avisos.js', para que la prueba de node de H23 siga resolviendo.
  - No se crea api-error.js. Los casos de test_api_error.mjs pasan a test_avisos.mjs.
  - Entra en B2-T1.
- C4 · Diálogos. H21 usa el Toast de @/components/ui, H40 deja alert() en commitCalcSave, U15 abre un Modal propio para Reiniciar y H11 y H49 tocan los dos NewClientModal. RESOLUCIÓN VINCULANTE: todo lo que entra después de B2-T1 usa useAvisos.
  - avisar/avisarError: H21, H40, H33 y U15.
  - confirmar() con peligro: U15 'Reiniciar solicitud', con su mismo texto. El 409 de R10 sale como aviso de error.
  - Los formularios con campos (U11 motivo, cancelar con motivo, alta de cliente, PEC) muestran el error dentro de su ventana.
  - NewClientModal: B2-T1 cambia el alert por un error en línea en su sitio y B2-T7 (H11) lo mueve a selector-cliente.tsx. Se renderiza con createPortal y Modal capa='encima' (prop de H49), y save() hace stopPropagation.
  - La prueba guardián test_sin_dialogos_nativos.mjs corre en cada tarea siguiente.
- C5 · Etiquetas de la SC. U15 cambia BORRADOR→'Nueva' y PENDIENTE_CONFIRMACION→'Pendiente por confirmación'. Eso choca con varios textos:
  - T2 (dict 'Pendiente de confirmación', probado con dict exacto).
  - T12 frontend ('Pend. confirmación').
  - El 400 de N4/R10 «…solo «Borrador»».
  - El 'queda Borrador' de H33.
  - El fallback 'pásala a Borrador' de renderSiguientePaso.
  - El 'Reiniciar (volver a Nueva)' de H31.
  RESOLUCIÓN VINCULANTE: gana el texto del usuario (paso-13).
  - Fuente única: backend textos_actividad.ETIQUETAS_ESTADO['SC']; espejo en frontend lib/estados-solicitud.js, con prueba de paridad.
  - Todo texto que nombra un estado de la SC sale de etiqueta_estado / infoEstadoSolicitud, nunca escrito a mano.
  - El 400 de update_solicitud pasa a «El estado «X» no se puede asignar a mano a una solicitud: solo se puede reiniciar (vuelve a Nueva, o a Asignada si tiene asesor).».
  - La COT conserva 'Borrador'. Los textos históricos ya guardados ('Estado cambiado a Borrador') no se reescriben.
- C6 · U15 elimina _MAPA_ESTADO_COTIZACION_A_SOLICITUD, pero H33 lo usa en restaurar_solicitud para dar 'el estado de su COT activa'. RESOLUCIÓN VINCULANTE para restaurar:
  - Si _documentos_activos_de_solicitud no está vacío (solo pasa con datos viejos, porque N4 impide cancelar con documentos): 'CONFIRMADA', sin marca gate1, y el lead pasa a QUOTATION.
  - Si no, 'ASIGNADA' con asesor o 'BORRADOR' sin él, y el lead pasa a DRAFT.
  - En todos los casos: eliminada_at None, gate1 None y enlaces revocados.
  Es la misma regla que el script ajustar_estados_solicitud.py de U15.
- C7 · U11 en create_cotizacion: el camino 'POST /cotizaciones con sc_id + motivo_sin_confirmacion' crea una COT sin las validaciones del endpoint dedicado (asesor, Soporte, productos de la SC) y deja dos puertas a la misma excepción de Gate 1. RESOLUCIÓN VINCULANTE:
  - POST /cotizaciones con sc_id de una SC sin confirmación vigente (estado != CONFIRMADA o gate1 None) responde 409: «Esta solicitud no ha sido confirmada por el cliente: usa «Cotizar» en la solicitud para crear la cotización con el motivo.».
  - Se mantienen el 409 de SC cancelada (N4) y el 400 por COT activa o PVEN vigente (N7).
  - No se acepta motivo_sin_confirmacion. La única vía auditada es /cotizar-sin-confirmacion.
  - Las pruebas que hacían POST con sc_id usan una SC CONFIRMADA con gate1.
- C8 · Commits intermedios. La sincronización reescrita de U15, la rama SC nueva de U11 en confirmar_via_token, restaurar_solicitud de H33 y cancelar_solicitud de H31 llaman a revoke_pending_tokens, que hoy hace su propio commit. RESOLUCIÓN VINCULANTE:
  - Todas usan revoke_pending_tokens(..., commit=False) y _log(..., commit=False), los parámetros que agrega H29 en la T6 del Bloque 1, con un solo db.commit() por operación.
  - mover_lead_de_solicitud, que hace commit en crm.py, va después de ese commit, en try/except con logger, y su resultado queda en el renglón ('No se pudo marcar como perdido').
- C9 · get_cotizacion. H35 lee CustomerRequest.notas, H36 vuelve a leer la SC dentro de pct_anticipo_cotizacion, U11 agrega sc_estado y sc_confirmacion_vigente, y U19 agrega anticipo_por_linea. RESOLUCIÓN VINCULANTE (la misma regla del choque de get_cotizacion del Bloque 1):
  - La SC se carga una sola vez y se pasa a pct_anticipo_cotizacion(cot, db, sc=sc).
  - notas, modalidad, estado y gate1 salen de ese objeto.
  - U11 la implementa en B2-T3 y U19 la reutiliza en B2-T4.
- C10 · U19 frente a lo que la T3 del Bloque 1 dejó pendiente para la T10: el GET de una COT ya convertida recalcula anticipo_requerido con la modalidad actual, que puede ser distinta del snapshot del pedido. Si U19 reparte siempre anticipo_requerido, en una COT con pedido las líneas no cuadran con el pedido. RESOLUCIÓN VINCULANTE: anticipo_por_linea reparte exactamente el número que TOTALES muestra tras la T10.
  - Sin PVEN vigente: anticipo_requerido.
  - Con PVEN vigente: el requerido del pedido, anticipo_del_pedido(pven)[0].
  El paso 5 de U19, que cambia la fuente de TOTALES, se aplica solo si la T10 no lo hizo ya.
- C11 · Paneles derechos y pestañas.
  - La barra de pestañas de la SC es de U12 (B2-T8): Actividad (con el siguiente paso y el contacto), Chatter e IA con ícono Sparkles, sin emoji. El chatter solo pone el contenido de su pestaña y la EtiquetaChatter en la línea de tiempo.
  - La barra Actividad | Chatter | IA de COT y PVEN es del grupo chatter (B2-T9), con la misma etiqueta 'IA'. La nota del grupo cot-pven-pantallas que se la atribuye a U12 está equivocada.
  - H37 solo toca anchos, el reacomodo de la columna izquierda y el botón de volver.
  - El botón 'Ver en la Actividad' de la tarjeta de cancelada (H31) ya no cambia de pestaña, porque la tarjeta vive en Actividad: hace scroll al ancla del historial.
- C12 · Ancho inicial del panel derecho: H25 fija 320 px por debajo de 1280 px (solo en la SC) y H37 usa anchoInicialPanel = min(400, max(300, 0,3·ancho)) en COT y PVEN. RESOLUCIÓN VINCULANTE: anchoInicialPanel de lib/detalle-layout.js, aplicado en un useEffect al montar, en las tres páginas: SC, COT y PVEN.
- C13 · Autoría. El chatter deja de usar body.user_name y toma el usuario de la sesión. En cambio, U11, H21 y H33 aceptan body.user_name/updated_by en sus endpoints nuevos. RESOLUCIÓN VINCULANTE:
  - Los endpoints NUEVOS del Bloque 2 (/cotizar-sin-confirmacion, /solicitudes/{id}/cliente y POST /…/actividad) usan nombre_de_usuario(user) = user.username o user.email, el mismo valor que AuthGuard guarda en user_name, y no leen el nombre del body.
  - Los endpoints existentes no cambian su contrato.
- C14 · Hueco del Bloque 1 que destapa H31: tras N4, PATCH {estado:'BORRADOR'} sigue permitido sobre una SC CANCELADA. La pastilla 'Borrador' de ESTADOS_SC_MANUALES aparece en el detalle de una cancelada y la revive sin pasar por restaurar: queda eliminada_at puesto y no se registra RESTORED. RESOLUCIÓN VINCULANTE:
  - update_solicitud, en este orden: 400 de N4 (estado no manual) → 409 de H31 (SC cancelada: «…restáurala desde la Papelera») → 409 de R10 (documentos activos).
  - restaurar_solicitud responde 409 si la SC no está cancelada (H33).
  - ESTADOS_SC_MANUALES sigue exportado (solo BORRADOR) mientras el Hub lo use. Las pastillas se quitan en U15.
- C15 · U15 frente a la decisión de la T4 sobre gate1 (choque de Gate 1 del Bloque 1). La regla de U15 'COT confirmada → SC Confirmada sin tocar gate1' supone que la T4 limpió la marca al cambiar cot.sc_id y dejó de aceptar sc_id libre. RESOLUCIÓN VINCULANTE:
  - B2-T2 lee el código real de la T4 antes de reescribir la sincronización. Si la T4 limpia gate1 cuando la COT llega a CONFIRMADA, la sincronización de U15 conserva ese comportamiento.
  - La regla de 'heredados' de U15 (COT confirmada → SC confirmada) se implementa siempre, sea cual sea la respuesta a enviar_cot_sin_confirmar. Con la opción B, U11 agrega además el 409 en enviar_cotizacion_para_confirmacion, después de las guardas de N4/H46 y antes de la validación del canal de H27.
- C16 · H10 frente a H7+H41. El usuario ya respondió 'tildes_valores: Sí, ahora', pero la T12 no trae ningún cambio concreto para tipos y modalidades. RESOLUCIÓN VINCULANTE:
  - H10 es la implementación (lib/etiquetas-solicitud.js) y la T12 no crea otro helper.
  - Los valores guardados no cambian: los usan el filtro de Soporte, el prefijo 'Cr' de R2 y el lead.
  - pctAnticipoDeModalidad debe dar los mismos casos que backend ventas_dinero.pct_anticipo_de_modalidad. Verificado: 'Otro' y '' → None, y el frontend usa 60.
- C17 · U14 frente a H35+H48. El Bloque 1 pinta 'Nota de la solicitud' de la COT en ámbar, 'igual que la SC'. U14 quita el ámbar de la SC. RESOLUCIÓN VINCULANTE: se aplica también en la COT, con estilo neutro, en B2-T9, que es la dueña de cotizacion/[id]. 'Nota de la cotización' sigue azul y el PVEN no cambia.
- C18 · cambios_documento.py lo tocan H26 (productos de la SC sin precio) y H21 (CAMPOS['CLIENTE'] y cambio_simple). RESOLUCIÓN VINCULANTE:
  - Primero H26 (B2-T4) y después H21 (B2-T5).
  - cambian_productos sigue comparando el precio, porque la vista pública de la SC muestra unit_price_cop (confirmacion_publica._productos_publicos). Por eso un cambio de solo precio en una SC, que no se puede hacer desde la UI, invalida Gate 1 sin dejar renglón de detalle. Se acepta.
- C19 · U12 frente al chatter en el contacto con el cliente. U12 deja WhatsApp, Llamar y Correo como enlaces directos dentro de Actividad, y el chatter tiene los tipos WhatsApp y Correo, que sí quedan registrados. RESOLUCIÓN VINCULANTE: se mantienen los dos. Los enlaces de U12 usan waUrl (H5). Hacer que esos enlaces abran el Chatter con el tipo ya elegido queda fuera del Bloque 2.
- C20 · frontend/package.json: unos diez scripts nuevos en la misma línea 'test', más el hunk sin commitear de otra sesión (test_safe_return_to). RESOLUCIÓN VINCULANTE:
  - B2-T1 agrega test_avisos y test_sin_dialogos_nativos.
  - B2-T6 agrega en un solo hunk todos los de librerías: estados_solicitud, lineas_solicitud, chatter, datos_cliente, etiquetas_solicitud, cliente_desde_busqueda, detalle_layout, copiar y resumen_pago. formatoPct va en test_pesos.
  - Ninguna otra tarea toca esa línea. Cada tarea hace stage solo de su propio hunk.

## Huecos y su resolución

- **Hueco 1 — Resolución: R27 (correcciones aplicadas en T3, T2B, T9A y T7).** Afirmaciones verificadas contra el código (Mirror y worktree del Bloque 1).
  Se confirman:
  - No hay CHECK sobre customer_requests.estado.
  - test_confirmar_cot_via_link_sincroniza_sc parte de una SC 'COTIZADA', así que la regla de heredados de U15 la cubre.
  - El Cotizador Rápido (dashboard/cotiza) no manda sc_id.
  - get_cotizacion del worktree ya calcula 'requerido' y 'anticipo_pct', y get_pedido expone anticipo_requerido y anticipo_pendiente (U19 y U24).
  - update_cotizacion no hace commit antes de calcular rompe_congelamiento, así que el rollback del 409 de H40 es seguro.
  - productos-solicitud.tsx:95 tiene el bug '5'→'15' (H25).
  - ChatterTab pinta la nota antes de guardarla y tiene catch{} vacío; la nota del PVEN se guarda como 'UPDATED'; el Hub separa CHATTER (U6+H22).
  - La Agenda lee event_type/title/date mientras el backend manda type/status_label/created_at, y update_customer revienta con IntegrityError (H21).
  - NewClientModal se monta antes del modal de la SC con el mismo z-50, y 'Agregar Cliente' cierra el modal de la SC (H11).
  - ix_product_skus_sku es único y quick-create recorta a 20 caracteres (U7).
  - Hay 38 + 4 diálogos nativos en Ventas y ningún <Toaster/> montado (H49).
  - Next 16.3.1 trae useLinkStatus y Tailwind v4 trae las container queries.
  Se desmienten o están incompletas:
  - U11 no lista una prueba que rompe (test_anticipo_modalidad::test_crear_la_cot_desde_una_sc_toma_el_porcentaje_de_la_modalidad).
  - H33 cree que flujo.tsx necesita el campo 'detalle': no hace falta, un renglón sin 'campo' ya se pinta bien (flujo.tsx:153).
  - cot-pven-pantallas atribuye a U12 las pestañas de COT y PVEN: son del grupo chatter.
  - H11 explica el stopPropagation diciendo que Modal ya usa un portal: hoy Modal NO usa portal. El portal lo introduce H11, y por eso sí hace falta el stopPropagation.
- **Hueco 2 — Resolución: R17 (medición en T0; arreglo en T7 si se confirma; T11 vuelve a medir).** H16 (/ventas/solicitudes?limit=200 y /ventas/config pedidos 4 veces) no está en ningún bloque. Propuesta: B2-T11 lo mide en el build de producción. Si persiste fuera de StrictMode, se arregla en B2-T7, dueña de solicitud-client.tsx, con un solo efecto de carga y la config cacheada. Si no, se cierra como artefacto de desarrollo.
- **Hueco 3 — Resolución: R18 (T5 backend, T8B aviso): se revoca el enlace y, además, se aplica la regla de Gate 1 del Bloque 1 para el cambio de cliente.** Seguridad en H21: corregir el correo o el teléfono de una SC en PENDIENTE_CONFIRMACION no anula el enlace. Si el enlace se envió a un correo equivocado, un tercero puede confirmar la solicitud durante 2 días. Propuesta vinculante para B2-T5: si cambia customer_email o customer_phone y la SC está en PENDIENTE_CONFIRMACION, o una COT propagada está en PENDIENTE_CONFIRMACION, se revocan sus tokens pendientes en la misma transacción (commit=False). La Actividad lo registra: «Se anuló el enlace enviado al dato anterior: reenvíalo». El estado no cambia y 'Reenviar enlace' genera uno nuevo. La prueba 8 de H21 se invierte: el token queda usado y el estado sigue PENDIENTE_CONFIRMACION.
- **Hueco 4 — Resolución: R19 (T9B).** Hub, H3 del Bloque 1: accionSiguienteSC (hub-ventas.js) replica renderSiguientePaso. Con U15 y U11 cambian canConfirmarSC (exige confirmacion_vigente) y aparecen solicitudes sin confirmar con una COT activa. Propuesta para B2-T9: accionSiguienteSC usa sc.confirmacion_vigente, que llega en _sc_dict, en el paso 'CONFIRMADA → Cotizar'. Si no está vigente, la acción es la de una Asignada. Se agrega el caso a test_hub_ventas.mjs.
- **Hueco 5 — Resolución: R20 (T3 backend, T9B Hub).** Alertas con U11: una SC en Asignada o Pendiente con una COT temprana sigue contando como atrasada en alertas_resumen y get_alertas, y como 'No resuelto' en el Hub, mientras su COT ya tiene sus propias alertas. Se cuenta dos veces. Propuesta para B2-T3 (backend) y B2-T9 (Hub): una SC con una COT activa (_documentos_activos_de_solicitud no vacío) no cuenta como atrasada ni como 'No resuelto'; la alerta la lleva la COT.
- **Hueco 6 — Resolución: R21 (T3 extrae el helper; T2A pone el texto del rechazo).** U11 con dos huecos menores:
  (1) _crear_cotizacion_desde_solicitud se extrae de confirmar_solicitud DESPUÉS del Bloque 1, con el texto de N7 '(reemplaza a la cotización rechazada …)' y el renglón COTIZACION_CREADA de U15. No se extrae de las líneas 728-756 de hoy.
  (2) El texto del rechazo cuando la SC está en Asignada y nunca se envió dice 'sigue esperando la confirmación del cliente'. Usar «La cotización COT-… fue rechazada. La solicitud sigue activa: envíasela al cliente para que la confirme o cotízala de nuevo.».
- **Hueco 7 — Resolución: R22 (T8A).** Detalle de la SC (B2-T8), dos cosas sin dueño:
  (1) El doble botón de volver, la flecha más '← Volver', que H37 detectó pero solo arregla en COT y PVEN: usar BotonVolver con destinoVolver(safeReturnTo, '/dashboard/ventas/solicitud').
  (2) La tarjeta 'Modalidad 60/40' (page.tsx:652-660) solo sale con 60/40. Debe usar pctAnticipoDeModalidad y etiquetaModalidad (H10) y mostrar 'Anticipo X% / Saldo Y%' para toda modalidad, igual que el formulario.
- **Hueco 8 — Resolución: R23 (T9A).** Tildes del detalle de COT y PVEN: H7 solo corrige 'Línea temporal' y 'todavía', y H10 solo el formulario. Quedan sin tilde 'Datos de la Cotizacion' y 'Sin cotizacion ni solicitud de origen' (venta/[id]:458), entre otros. Propuesta: B2-T9 hace el mismo barrido de textos visibles que H10, sin tocar el panel IA (Bloque 5) ni los valores guardados.
- **Hueco 9 — Resolución: R24 (T1A).** react-hot-toast se usa en CRM, Agenda, Cotiza (Cotizador Rápido), Calendario y Finanzas, pero no hay ningún <Toaster/> montado, así que esos mensajes nunca se ven. Hallazgo de H49, verificado. Propuesta: montar <Toaster/> dentro de AvisosProvider en B2-T1. Es una línea y global. Si no, abrir una tarea aparte.
- **Hueco 10 — Resolución: R25: fuera del bloque, se informa al usuario.** Fuera de alcance, para tareas aparte:
  - Agenda > 'Historial Comercial' lee customer360.customer_requests, pero el backend manda 'solicitudes', así que siempre sale vacío.
  - Los created_at del perfil 360 van sin 'Z', con el mismo desfase de 5 h que dice la memoria.
  - Hay un tercer formulario 'Nueva Solicitud' en agenda/page.tsx (crm.create_customer_solicitud) que no usa SolicitudTipoYDetalle.
  - asistente_omnicanal y marketing/campanas copian enlaces sin manejo de error (H30).
- **Hueco 11 — Resolución: R26 (T12, al final; con OK del usuario).** Datos: tres scripts necesitan el OK del usuario en cada base: ajustar_estados_solicitud (U15), limpiar_motivo_en_notas (U18 fusionado) y corregir_actividad_sc_sin_precio (H26). Ningún diseño dice el orden. Propuesta (B2-T12):
  - Correr después de la T14 del Bloque 1 en esa base, porque N4 (c) completa eliminada_at y razon_cancelacion y el script de H7 corrige los textos.
  - Orden: limpiar_motivo_en_notas → ajustar_estados_solicitud → corregir_actividad_sc_sin_precio.
  - Cada uno: reporte → OK → --aplicar, con su SQL de restauración en el docstring.

## Pruebas existentes que se rompen (se ajustan en la tarea que las rompe)

- **P1.** test_sincronizacion_estado_solicitud_cotizacion.py::TestSincronizacionEstados::test_crear_cotizacion_deja_solicitud_en_cotizada_no_confirmada (l.53-56). Espera COTIZADA, pero con U15 la SC queda CONFIRMADA. Ajuste: renombrar a …_deja_solicitud_confirmada y afirmar CONFIRMADA. Tarea: B2-T2.
- **P2.** test_sincronizacion_estado_solicitud_cotizacion.py::…::test_enviar_cotizacion_deja_solicitud_en_espera_confirmacion (l.58-62; el Bloque 1 ya la pasa a /enviar-confirmacion por H50). Espera EN_ESPERA_CONFIRMACION; ahora debe afirmar CONFIRMADA. Tarea: B2-T2.
- **P3.** test_sincronizacion_estado_solicitud_cotizacion.py::…::test_patch_directo_a_confirmada_ya_no_es_posible_ni_sincroniza (l.76). Afirma 'COTIZADA' después de crear la COT; ahora CONFIRMADA. Tarea: B2-T2.
- **P4.** test_confirmacion_solicitud.py::test_confirmar_solicitud_consume_gate1_confirmed_at_al_crear_cotizacion (l.477; la l.478 ya la ajusta N7). Afirma 'COTIZADA'; ahora CONFIRMADA. Tarea: B2-T2.
- **P5.** test_textos_actividad.py::test_etiquetas_de_sc (dict exacto, l.26-40). Cambian 'Borrador' por 'Nueva' y 'Pendiente de confirmación' por 'Pendiente por confirmación'. La prueba 4 que agrega la T12 (ESTADO_CHANGED 'Solicitud cotizada - Cotización creada') pasa a COTIZACION_CREADA 'Cotización … creada desde esta solicitud', sin old/new. Tarea: B2-T2.
- **P6.** test_rechazo_cotizacion_solicitud_activa.py (N7, Bloque 1 T4), prueba 1. Esperaba ESTADO_CHANGED con 'fue rechazada'; ahora el renglón es COTIZACION_RECHAZADA y la SC queda CONFIRMADA (no COTIZADA) tras el segundo POST /confirmar. Tarea: B2-T2.
- **P7.** test_pedido_cancelado_reabre_cotizacion.py (H46, Bloque 1 T4).
  - Prueba 1: afirmaba 'SC COTIZADA'; ahora CONFIRMADA (B2-T2).
  - Prueba 6 (re-cotizar una COT CONFIRMADA cuyo pedido se canceló): con H40 responde 409. Debe mandar anular_confirmacion=True y motivo_recotizacion (B2-T4).
- **P8.** test_confirmacion_cotizacion.py::test_editar_precio_mientras_pendiente_confirmacion_reinicia_a_borrador (l.427) y ::test_editar_precio_mientras_confirmada_sin_pven_reinicia_y_limpia_marcador (l.452). Con H40 responden 409. Deben mandar anular_confirmacion=True y motivo_recotizacion='Prueba de cambio'. El 409 sin esos campos queda cubierto en test_recotizar_confirmada.py. Tarea: B2-T4.
- **P9.** test_actividad_cambios_documentos.py::test_recotizar_una_cot_pendiente_de_confirmacion_registra_primero_la_recotizacion_y_luego_el_estado (l.200). Responde 409 con H40: agregar los dos campos. Además, el renglón de paso a Borrador ahora termina en 'Razón: …', así que hay que revisar si compara la descripción exacta. Tarea: B2-T4.
- **P10.** test_anticipo_modalidad.py::test_cambiar_el_total_de_una_cot_confirmada_si_invalida_la_confirmacion (l.168). Responde 409 con H40: agregar los dos campos. Tarea: B2-T4.
- **P11.** test_anticipo_modalidad.py::test_crear_la_cot_desde_una_sc_toma_el_porcentaje_de_la_modalidad (l.224-232). El diseño de U11 NO la lista. Hace POST /cotizaciones con sc_id de una SC 'COTIZADA' (default del helper _sc) sin gate1, y con U11/C7 deja de dar 201. Ajuste: para ese caso crear la SC en CONFIRMADA con gate1_confirmed_at=utcnow. Tarea: B2-T3.
- **P12.** test_notas_solicitud_en_cotizacion_y_pedido.py (H35+H48, Bloque 1 T7), prueba 4 (POST /cotizaciones con sc_id). Mismo ajuste: SC CONFIRMADA con gate1. Tarea: B2-T3.
- **P13.** Pruebas de N4 y N5 del Bloque 1 que afirmen el texto del 400 de update_solicitud con 'solo «Borrador»'. El mensaje cambia a la redacción de C5 ('solo se puede reiniciar…'). Al implementar, buscar con grep 'Borrador»' en backend/tests y actualizar el fragmento comparado. Tarea: B2-T2.
- **P14.** Pruebas que afirmen el user_name enviado en el body de POST /…/actividad (por ejemplo, la nota 'Motivo del rechazo (Hub)' de N3, si alguna lo hace). Con U6+H22/C13 el autor es el usuario autenticado. Tarea: B2-T4.
- **P15.** frontend/tests/test_hub_ventas.mjs (H3, Bloque 1 T9). Si accionSiguienteSC pasa a mirar confirmacion_vigente (hueco), hay que actualizar el caso 'CONFIRMADA → Cotizar' y agregar el caso no vigente. Tarea: B2-T9.
- **P16.** Regresión obligatoria con el runner de ROLLBACK, aunque en principio no se rompen, porque tocan las mismas funciones:
  - test_confirmacion_cotizacion (test_confirmar_cot_via_link_sincroniza_sc depende de la regla de heredados de U15).
  - test_confirmacion_solicitud (test_pill_cancelar_restaurar… y test_restaurar_solicitud_con_asesor… deben restaurar SC CANCELADA, por la guarda 409 de H33).
  - test_cancelar_solicitud_con_documentos (N4, en especial la prueba 8).
  - test_products_quick_create, test_actividad_cambios_documentos, test_solicitud_guardado_una_transaccion, test_solicitud_productos_para_cotizar, test_crm_lead_movimiento_automatico, test_anticipo_modalidad y test_anticipo_verificado.
  Nunca correr pytest completo.

## Para el usuario (fuera del código; sin credenciales)

- Dar (o no) el OK a los listados de T12 en erp_test, script por script: limpiar el "[CANCELADA] Razón: …" de las notas (hoy 2 SC), ajustar estados heredados de SC (hoy 0 en erp_test) y devolver leads "Perdido" de SC no canceladas, y quitar " a $X" de las actividades de SC (hoy 1). Producción solo con un OK aparte.
- Revisar la página visual con las capturas antes/después de T11 (lista y formulario de solicitudes, detalle de SC, COT, PVEN, Hub, Agenda, Papelera, a 1024 y 1440 px) y anotar lo que no guste.
- Autorizar el merge a main cuando corresponda: esta rama está apilada sobre la del Bloque 1, que se integra primero.
- Al promover a producción, autorizar la migración aditiva fa6_025 (dos columnas nulas en sales_quotations) con el procedimiento de producción de alembic.
- Enterarse (no hay que hacer nada; se le cuenta al cerrar el bloque) de dos ajustes a lo que vio en la página del plan, para seguir lo que el Bloque 1 ya dejó por seguridad: corregir el correo o el teléfono de una solicitud pendiente o confirmada anula la confirmación del cliente y hay que enviársela de nuevo (R18), y restaurar desde la Papelera una solicitud que todavía tiene una cotización o un pedido activos pide primero rechazarlos o cancelarlos (R34). Si prefiere otra cosa, se cambia antes de T5/T2B.
- Nada que configurar ni pagar: este bloque no necesita credenciales (WhatsApp y Correo del Chatter abren la aplicación del propio usuario; el envío automático es del Bloque 3).
- Decidir si se abre una tarea aparte para lo que quedó fuera (R25): Historial Comercial de la Agenda vacío, fechas del perfil 360 sin zona, tercer formulario de solicitud en la Agenda, copiar enlace en Asistente y Marketing, y unos 45 diálogos nativos fuera de Ventas.

## Fuera de alcance

- Lo de R25 (hueco 10): Historial Comercial de la Agenda, created_at del perfil 360 sin "Z", tercer formulario de solicitud en agenda/page.tsx, copiar en asistente_omnicanal y marketing, ~45 diálogos nativos fuera de Ventas.
- Chat real con el cliente por Chatwoot y envío automático por canal (Bloque 3); recordatorios automáticos (Bloque 3).
- Pestaña IA, IAPanelSC y GlobalAIChat, incluida su conexión a producción, y el botón «Responde SI» del Formato de confirmación (Bloque 5).
- Que los botones de contacto de la SC abran el Chatter con el tipo elegido (C19).
- Editar o borrar notas del Chatter (son historial).
- Columnas, anchos y Kanban del Hub; KPIs estandarizados (Bloque 4).
- Anticipo por línea en la calculadora y en el PVEN; nombre truncado dentro de la calculadora (el usuario los marcó bien).
- Ajuste automático de margen o inventario en devoluciones (H10 solo corrige el texto).
- update_pxp que marca PAGADA sin pago (R9 del Bloque 1, sigue fuera).
- Corregir notas viejas de PVEN guardadas como UPDATED (no se distinguen de ediciones del sistema).

## Orden del cruce y tareas del plan

| Cruce | Plan | Tarea | Ítems |
|---|---|---|---|
| B2-T0 | Task 1A + 1B | Avisos y confirmaciones del sistema; errores legibles de apiFetch (base transversal) | H49+H34; H40 (solo errorDeRespuesta con .status/.detail, ver C3); Montar <Toaster/> en AvisosProvider (hueco) |
| B2-T1 | Task 2A + 2B | Backend: estados de la SC, cancelación y restauración | U15 (backend, textos_actividad, script ajustar_estados_solicitud.py); U18+H31+H33 fusionado (backend, script limpiar_motivo_en_notas.py) |
| B2-T2 | Task 3 | Backend: cotizar sin confirmación del cliente | U11 (backend); Hueco: alertas de una SC con COT temprana (backend) |
| B2-T3 | Task 4 | Backend: chatter, anticipo por línea, re-cotizar confirmada, SC sin precios | U6+H22 (core/chatter.py, _agregar_nota, _log devuelve el renglón); U19+U21 (ventas_dinero.repartir_anticipo_por_linea + get_cotizacion); H40 (409 ANULA_CONFIRMACION en update_cotizacion); H26 (cambios_documento + script) |
| B2-T4 | Task 5 | Backend: datos del cliente desde la SC y alta rápida de productos | H21 (backend + revocación del enlace al cambiar correo o teléfono, ver hueco); U7+U8+H12+H13 (backend: quick-create con código único y reutilización por nombre) |
| B2-T5 | Task 6A + 6B | Frontend: librerías y piezas compartidas | lib/estados-solicitud.js (U15, U11, H31) + test; lib/lineas-solicitud.js fusionada (U7, H25, H13; C2) + test; lib/chatter.js + ventas/chatter.tsx (U6+H22); lib/datos-cliente.js (H21); lib/etiquetas-solicitud.js (H10); lib/cliente-desde-busqueda.js (H11); lib/detalle-layout.js + BotonVolver en flujo.tsx (H37; C12); lib/copiar.js + EnlaceConfirmacionModal en flujo.tsx (H30); lib/resumen-pago.js (U24); formatoPct en pesos.js (U19) |
| B2-T6 | Task 7 | Frontend: formulario de nueva SC y lista de solicitudes | H11 (selector-cliente.tsx, también en asistente_omnicanal); U7+U8+H12+H13 (buscador-producto.tsx, lineas-producto.tsx); U15 (lista: ESTADOS_SC desde la librería y reexportado, RowMenu 'Reiniciar' con confirmar(), sin botones de estado en la barra masiva, dona con Asignada); U18+H31+H33 (lista: getRazonCancelacion, restaurarSC con aviso y 'Ver solicitud'); H10 (formulario, TipoBadge, alta de cliente; al final, como barrido); H16 si la medición lo confirma |
| B2-T7 | Task 8A + 8B | Frontend: detalle de la SC | U13; U14 (SC); U12; U15 (EstadoSolicitudPasos, canConfirmarSC con confirmacion_vigente, ACTIVITY_*); U11 (modal 'Cotizar sin esperar confirmación', botones y chip); U18+H31+H33 (tarjeta rose, aviso de productos solo si se puede editar, SENT_TO_TRASH); H25 (editor de productos con LineasProducto neutro, ancho inicial con anchoInicialPanel); H21 (frontend: tarjeta Cliente, edición, saveEdit con cuerpo explícito, avisar); H10 (dos líneas del select y la modalidad); U6+H22 (pestaña Chatter de la SC con ChatterDocumento; al final se borra ChatterTab de solicitud-client); Huecos: BotonVolver y tarjeta de anticipo para toda modalidad |
| B2-T8 | Task 9A + 9B | Frontend: detalle de COT y PVEN, calculadora y Hub | U6+H22 (pestañas Actividad \| Chatter \| IA en COT y PVEN; caja de notas en ActivitiesPanel del Hub); U11 (aviso ámbar en la COT); U14 (Nota de la solicitud en la COT, estilo neutro); U19+U21; U24; H37; H40 (CalculadorModal y commitCalcSave con 409); H9 (enlace del Hub, loading.tsx, CargandoSolicitudes, nueva/page.tsx, ContenidoEnlace); Huecos: tildes de COT/PVEN, accionSiguienteSC con confirmacion_vigente, Hub sin 'No resuelto' para SC con COT activa |
| B2-T9 | Task 10 | Frontend: historial del cliente en la Agenda | H21 (Timeline Unificado: claves type/status_label/created_at, customer_update, CambiosDeActividad) |
| B2-T10 | Task 12 | Datos existentes (solo con OK del usuario, en cada base por separado) | limpiar_motivo_en_notas.py (U18 fusionado); ajustar_estados_solicitud.py (U15); corregir_actividad_sc_sin_precio.py (H26) |
| B2-T11 | Task 11 | Revisión de seguridad y verificación final | Revisión dedicada: /cotizar-sin-confirmacion, el 409 de create_cotizacion, la sincronización reescrita, la rama SC de confirmar_via_token, PATCH /cliente con revocación y la autoría del chatter; Regresión con el runner de ROLLBACK de todos los módulos tocados; npm test y npx tsc --noEmit; Capturas con Playwright a 1024 y 1440 px (antes y después), medición de H9 y H16 en build de producción |

## Diseño por ítem

### U15 — Cuatro estados claros para la solicitud

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Pregunta quitada por el crítico: Cuando el cliente ya confirmó la solicitud, ¿la solicitud se queda en 'Confirmada' o sigue cambiando de estado con la cotización? → decisión: **Se queda en 'Confirmada'; el avance se ve en la cotización y en el pedido** (opción recomendada; regla R2).

**Lo que notará el usuario:** La solicitud muestra solo sus pasos, en orden: Nueva, Asignada, Pendiente por confirmación y Confirmada (o Cancelada). Cada paso avanza solo: cuando le asignas un asesor, cuando se la envías al cliente y cuando el cliente confirma. Debajo de los pasos se explica qué falta para avanzar. Cuando el cliente ya confirmó, la solicitud se queda en Confirmada, y el avance de la cotización y del pedido se ve en la barra de progreso y en la propia cotización. El botón 'Borrador' cambia por 'Reiniciar solicitud', con una explicación de lo que hace antes de aplicarlo.

**Para el usuario:** El estado de la solicitud cuenta solo su propia historia: Nueva (recién creada, sin asesor), Asignada (ya tiene asesor), Pendiente por confirmación (se le envió al cliente por WhatsApp, correo u otro medio, con el enlace para confirmar) y Confirmada (el cliente confirmó). Cancelada sigue aparte. Ningún estado se pone a mano. La solicitud ya no cambia a 'Cotizada' ni a 'En espera de confirmación' cuando cambia su cotización: el avance de la cotización y del pedido se ve en la cotización, en la barra Solicitud → Cotización → Pedido y en la lista de cotizaciones de la solicitud. Así 'Confirmada' significa siempre lo mismo: el cliente confirmó.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
Se apoya en estos ítems y debe ir después de ellos:
- N7: reescribe su _sincronizar_estado_solicitud_desde_cotizacion y su confirmar_solicitud; usa la marca gate1 no consumida, el chequeo de COT activa bajo lock y los textos de rechazo.
- N4: guarda de SC cancelada en la sincronización, _documentos_activos_de_solicitud y ESTADOS_SC_MANUALES = solo BORRADOR.
- R10: 409 al reiniciar con documentos.
- H46: _reabrir_cotizacion_por_pven_cancelado ya no lleva la SC a COTIZADA.
- H7+H41: ETIQUETAS_ESTADO['SC'], el texto de l.581 y la prueba 4 de test_textos_actividad.
- H32: semántica de 'Confirmadas' y 'esperan cotización'.
- N10: el Hub importa ESTADOS_SC desde solicitud-client.
- H3: esCotizacionActiva.
Archivos frontend compartidos: T11 (solicitud/[id]/page.tsx y solicitud-client.tsx) y T9 (Hub). Datos: después de T14.
```

**Cambios (diseño):**

```text
DECISIÓN DE DISEÑO (mapa contra el modelo y el Bloque 1). Los códigos de la base no cambian: no hay CHECK sobre customer_requests.estado y renombrar códigos obligaría a migrar también activity_logs.old_estado/new_estado. (a) Cambian dos etiquetas: BORRADOR pasa a 'Nueva' y PENDIENTE_CONFIRMACION a 'Pendiente por confirmación'. (b) No se agregan estados. (c) Cambian las transiciones: la SC deja de reflejar el estado de su COT (se elimina el espejo COTIZADA / EN_ESPERA_CONFIRMACION / CONFIRMADA-por-COT / VENCIDA, que N7 ya había dejado sin RECHAZADA). COTIZADA, EN_ESPERA_CONFIRMACION, RECHAZADA y VENCIDA quedan como estados heredados: solo se usan para mostrar el historial. Hoy no se cumplen las condiciones del usuario ('Asignada solo con asesor', 'Pendiente solo al enviar', 'Confirmada solo por el cliente'): están garantizadas por create_solicitud, promueve_asignada, desasigna_a_borrador, enviar_solicitud_para_confirmacion, confirmar_via_token y las guardas 400 de update_solicitud.

BACKEND
1) backend/app/core/textos_actividad.py, ETIQUETAS_ESTADO['SC']: 'BORRADOR': 'Nueva' y 'PENDIENTE_CONFIRMACION': 'Pendiente por confirmación' (el usuario pidió esas palabras; reemplazan 'Borrador' y 'Pendiente de confirmación' de T2). Constantes nuevas: PASOS_SC = ('BORRADOR','ASIGNADA','PENDIENTE_CONFIRMACION','CONFIRMADA') y ESTADOS_SC_HEREDADOS = ('COTIZADA','EN_ESPERA_CONFIRMACION','RECHAZADA','VENCIDA'), con un comentario 'ya no se asignan; solo historial'.
2) backend/app/api/v1/erp_ventas.py:
 a) Eliminar _MAPA_ESTADO_COTIZACION_A_SOLICITUD. Reescribir _sincronizar_estado_solicitud_desde_cotizacion(cot, db, user_name=None) (firma de N7) así:
   - Sin sc_id → return. Cargar la SC con .with_for_update(). Si no existe o está en CANCELADA (guarda de N4) o N/A_SOPORTE → return.
   - cot.estado == 'CONFIRMADA' y sc.estado no está en ('CONFIRMADA','CANCELADA','N/A_SOPORTE'): sc.estado = 'CONFIRMADA' SIN tocar gate1_confirmed_at, sc.updated_at, revoke_pending_tokens(db,'SC',sc.id) y _log SC 'ESTADO_CHANGED' «La solicitud queda confirmada: el cliente confirmó la cotización {COT}» (old → CONFIRMADA, user_name o 'Cliente (confirmación por link)'). Cubre los datos heredados (test_confirmar_cot_via_link_sincroniza_sc parte de COTIZADA) y la opción A de U11.
   - cot.estado == 'RECHAZADA' (regla de N7 adaptada): si la SC tiene otra COT activa o un PVEN vigente (_documentos_activos_de_solicitud de N4, excluyendo cot.id) → return. Si sc.estado == 'CONFIRMADA' y gate1_confirmed_at is None → 'ASIGNADA' si advisor_user_id, si no 'BORRADOR', con ESTADO_CHANGED y el texto de N7 «…para crearle otra cotización, reenvíasela al cliente para que la confirme». En cualquier otro caso NO cambia el estado: _log SC con action nueva 'COTIZACION_RECHAZADA' (sin old/new). Texto si la SC está CONFIRMADA: «La cotización {COT} fue rechazada. La solicitud sigue activa: ya puedes crearle una nueva cotización.». Texto si está ASIGNADA o PENDIENTE (caso U11): «La cotización {COT} fue rechazada. La solicitud sigue esperando la confirmación del cliente.».
   - Cualquier otro estado de la COT (BORRADOR, ENVIADA, PENDIENTE_CONFIRMACION, VENCIDA) no toca la SC. Eso cubre enviar_cotizacion_para_confirmacion, rompe_congelamiento y _reabrir_cotizacion_por_pven_cancelado de H46.
   - Usar _log(..., commit=False) y un solo db.commit() al final (revoke_pending_tokens hace su propio commit: llamarlo justo antes del commit final).
 b) confirmar_solicitud: quitar sc.estado = 'COTIZADA' (la SC queda CONFIRMADA; el duplicado lo impide el chequeo de COT activa de N7 bajo with_for_update). El _log de la SC pasa de ESTADO_CHANGED a action nueva 'COTIZACION_CREADA': «Cotización {COT} creada desde esta solicitud», con el sufijo de N7 '(reemplaza a la cotización rechazada …)' cuando aplica, y sin old/new. El CREATED de la COT no cambia. Actualizar el docstring y los comentarios que dicen 'avanza a COTIZADA' (también en models/erp_documents.py:88 y confirmacion_publica.py:131).
 c) update_solicitud: el texto fijo 'Estado cambiado a Borrador (asesor retirado)' (H7, T12) pasa a f'Estado cambiado a {etiqueta_estado("SC","BORRADOR")} (asesor retirado)'. La guarda 'SC cancelada no cambia de estado por PATCH' es de U18+H31.
 d) _sc_dict: agregar 'confirmacion_vigente': sc.gate1_confirmed_at is not None (solo el booleano, nunca la fecha). Así el frontend no ofrece 'Crear Cotización' cuando el backend la va a rechazar.
3) Script nuevo backend/scripts/ajustar_estados_solicitud.py, con el mismo patrón que scripts/corregir_textos_actividad.py de H7: DRY-RUN por defecto, --aplicar, BD destino enmascarada, todo en una transacción, nombre de la tabla de respaldo validado con ^[a-z_][a-z0-9_]*$. Función ajustar(db, aplicar=False, ids=None, tabla_respaldo='customer_requests_respaldo_estados') -> {candidatas, ajustadas, ejemplos}. Reglas (excluye Soporte Técnico):
   - SC en ESTADOS_SC_HEREDADOS → 'CONFIRMADA' si tiene documentos activos (mismo filtro que _documentos_activos_de_solicitud); si no, 'ASIGNADA' con asesor o 'BORRADOR' sin él.
   - SC 'CONFIRMADA' con gate1_confirmed_at NULL y sin documentos activos → 'ASIGNADA' o 'BORRADOR'.
   Por cada fila: CREATE TABLE IF NOT EXISTS de respaldo (id PK, estado_original, estado_nuevo, ajustado_at); INSERT … ON CONFLICT (id) DO NOTHING; UPDATE customer_requests SET estado=:nuevo WHERE id=:id AND estado=:original (sin tocar updated_at, para no esconder alertas). ActivityLog SC 'ESTADO_CHANGED' con user_name 'Sistema (ajuste de estados)' y uno de estos textos: «Estado ajustado a Confirmada: la solicitud ya no cambia con su cotización; el avance se ve en {COT/PVEN}» o «Estado ajustado a Asignada: su cotización fue rechazada; para cotizar de nuevo, reenvíasela al cliente para que la confirme». El docstring trae el SQL de restauración.
FRONTEND
4) Archivo nuevo frontend/src/lib/estados-solicitud.js, en JS plano como estados-pedido.js y testeable con node. Contenido:
   - ESTADOS_SC (Object.freeze): mueve aquí la tabla de solicitud-client.tsx:40-51 con BORRADOR 'Nueva', ASIGNADA 'Asignada', PENDIENTE_CONFIRMACION 'Pendiente por confirmación', CONFIRMADA 'Confirmada', CANCELADA 'Cancelada', 'N/A_SOPORTE' 'Soporte', más los heredados con su etiqueta actual (Cotizada, En espera de confirmación, Rechazada, Vencida) para el historial.
   - PASOS_SC: los 4 pasos {clave, label, ayuda}. Ayudas: Nueva 'Pasa a Asignada cuando se le asigna un asesor.'; Asignada 'Pasa a Pendiente por confirmación cuando se le envía al cliente.'; Pendiente 'Pasa a Confirmada cuando el cliente abre el enlace y confirma.'; Confirmada 'El cliente confirmó: el siguiente paso es la cotización.'.
   - Funciones: infoEstadoSolicitud(e) (con respaldo humanizado y gris), pasoSolicitud(e) (0-3; los heredados → 3; CANCELADA y N/A_SOPORTE → -1), ESTADOS_SC_SIN_CONFIRMAR = ['BORRADOR','ASIGNADA','PENDIENTE_CONFIRMACION'] y puedeReiniciar(sc, {cotizacionesActivas, pedidosVigentes}), que es verdadero solo si el estado está en PENDIENTE_CONFIRMACION o CONFIRMADA y no hay documentos activos.
5) solicitud-client.tsx:
   - Importar ESTADOS_SC del lib y reexportarlo (N10 lo importa desde aquí para el Hub). EstadoBadge usa infoEstadoSolicitud.
   - RowMenu (l.505-509): el 'Estado: {label}' de ESTADOS_SC_MANUALES, que con N4 solo trae BORRADOR, pasa a un botón 'Reiniciar (volver a Nueva)' visible solo si puedeReiniciar. Nunca aparece en CANCELADA.
   - Barra masiva (l.1077): se quitan los botones 'Estado: …'.
   - Donut de estados (l.1538-1541): Nueva / Asignada (trozo nuevo; hoy falta) / Pendiente por confirmación / Confirmada / Cancelada.
   - Conteo 'act' del asistente (l.754): incluir ASIGNADA.
6) solicitud/[id]/page.tsx: reemplazar el bloque 'Cambiar Estado' (l.724-731) por el componente nuevo EstadoSolicitudPasos (archivo nuevo solicitud/[id]/estado-solicitud.tsx).
   - Título 'Estado de la solicitud'. Los 4 pasos en fila: los anteriores con ✓, el actual resaltado y debajo la ayuda del paso actual.
   - Si puedeReiniciar: botón de texto 'Reiniciar solicitud' que abre un Modal (no window.confirm) con el texto «La solicitud vuelve a {Nueva|Asignada}: se anula el enlace que se le envió al cliente y su confirmación, y habrá que enviársela de nuevo.» y luego PATCH {estado:'BORRADOR', updated_by}. El 409 de R10 se muestra dentro del modal.
   - No se muestra en Soporte (sigue su select) ni en CANCELADA (ver U18+H31).
   - Quitar el import de ESTADOS_SC_MANUALES.
   - ACTIVITY_STYLE / ACTIVITY_TYPE_LABELS / ACTIVITY_TYPE_ORDER: COTIZACION_CREADA ('Cotización creada', FileText índigo) y COTIZACION_RECHAZADA ('Cotización rechazada', XCircle rose).
   - canConfirmarSC (versión de N7) exige además solicitud.confirmacion_vigente === true.
   - El fallback de renderSiguientePaso (l.521-525) deja de decir 'pásala a Borrador desde Cambiar Estado'.
7) frontend/package.json 'test': agregar && node tests/test_estados_solicitud.mjs (consolidado con los scripts del Bloque 1; stagear solo lo propio).
```

**Comportamiento esperado:**

```text
- Estados que se asignan a una solicitud: Nueva (BORRADOR), Asignada, Pendiente por confirmación, Confirmada y Cancelada (Soporte Técnico conserva 'Soporte'). Ninguno se pone a mano. PATCH solo acepta BORRADOR, que funciona como 'Reiniciar' (N4/R10).
- Transiciones:
  · Crear sin asesor → Nueva; crear con asesor → Asignada.
  · Asignar asesor → Asignada; quitarlo → Nueva.
  · Enviar o reenviar → Pendiente por confirmación.
  · El cliente confirma por el enlace → Confirmada.
  · El cliente confirma la cotización mientras la solicitud está sin confirmar → Confirmada, con la actividad «La solicitud queda confirmada: el cliente confirmó la cotización COT-…».
  · Cancelar → Cancelada.
  · Reiniciar → Nueva, o Asignada si tiene asesor. Con documentos activos responde 409 (R10).
  · Restaurar → Nueva o Asignada.
- Crear, recalcular, enviar, vencer o reabrir la cotización, o cancelar su pedido, NO cambia el estado de la solicitud. Única excepción: si se rechaza la única cotización activa y la solicitud está Confirmada pero su confirmación ya no vale (productos cambiados o dato viejo), vuelve a Asignada o Nueva para reenviarla.
- Actividad de la solicitud:
  · 'Cotización COT-… creada desde esta solicitud' (Cotización creada).
  · 'La cotización COT-… fue rechazada. La solicitud sigue activa: ya puedes crearle una nueva cotización.' (Cotización rechazada).
  · 'La solicitud queda confirmada: el cliente confirmó la cotización COT-…'.
- Las etiquetas nunca salen en código. Los códigos heredados (Cotizada, En espera de confirmación, Rechazada, Vencida) solo aparecen en el historial.
- Listas: la pestaña 'Activas' muestra Nueva, Asignada y Pendiente por confirmación. 'Confirmadas' incluye también las que ya tienen cotización o pedido; la tarjeta de H32 dice cuántas esperan cotización.
- 'Crear Cotización' solo aparece si la confirmación del cliente sigue vigente (confirmacion_vigente).
```

**Pruebas (diseño):**

```text
Backend: archivo nuevo backend/tests/test_estados_solicitud.py (sin parametrize; estilo de test_solicitud_productos_para_cotizar.py con _sc(db, numero, user_admin, **campos) y auth()). Correr con: cd <worktree>\backend y C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe tests/rollback_runner.py test_estados_solicitud.
1) test_etiquetas_de_la_solicitud_son_las_del_usuario: etiqueta_estado('SC','BORRADOR')=='Nueva'; 'PENDIENTE_CONFIRMACION'=='Pendiente por confirmación'; ASIGNADA, CONFIRMADA y CANCELADA iguales que hoy; PASOS_SC con las 4 claves en orden.
2) test_paridad_etiquetas_solicitud_con_el_frontend: node --input-type=module importa frontend/src/lib/estados-solicitud.js y compara cada etiqueta de ESTADOS_SC con ETIQUETAS_ESTADO['SC'], igual que la paridad de test_estados_pedido.py.
3) test_crear_la_cotizacion_deja_la_solicitud_confirmada: SC CONFIRMADA con gate1, productos y asesor → POST /confirmar → 200. Afirmar: SC CONFIRMADA; gate1 no nulo; el último renglón de la SC es COTIZACION_CREADA con el número de la COT; no hay ESTADO_CHANGED nuevo.
4) test_enviar_y_confirmar_la_cotizacion_no_cambian_la_solicitud: después de 3, poner productos con precio y total_cop por DB → POST /cotizaciones/{id}/enviar-confirmacion → SC CONFIRMADA; canjear el token de link_confirmacion en /confirmar/confirmar → SC CONFIRMADA.
5) test_rechazar_con_confirmacion_vigente_deja_confirmada_y_lo_anota: PATCH COT {estado:'RECHAZADA'} → SC CONFIRMADA y gate1 no nulo; existe un renglón COTIZACION_RECHAZADA con 'fue rechazada'.
6) test_rechazar_sin_confirmacion_vigente_vuelve_a_asignada: SC CONFIRMADA con gate1 None y COT BORRADOR → PATCH RECHAZADA → SC ASIGNADA y ESTADO_CHANGED CONFIRMADA→ASIGNADA.
7) test_cancelar_el_pedido_no_cambia_la_solicitud: SC CONFIRMADA modalidad 'Credito 30 dias' (R2 → 0%, no exige verificación) + COT CONFIRMADA con gate2 y precio → POST /cotizaciones/{id}/confirmar → PATCH pedido {estado:'CANCELADO', cancellation_reason:'Cliente cambió el pedido'} → COT BORRADOR (H46) y SC CONFIRMADA.
8) test_cotizacion_confirmada_promueve_una_solicitud_heredada: SC 'COTIZADA' + COT PENDIENTE_CONFIRMACION → token → /confirmar/confirmar → SC CONFIRMADA.
9) test_script_ajuste_estados_reporta_aplica_y_es_idempotente (solo ids propios). Preparación: SC 'COTIZADA' con COT BORRADOR; SC 'RECHAZADA' con asesor y sin documentos; SC 'EN_ESPERA_CONFIRMACION' con COT PENDIENTE. ajustar(aplicar=False, ids) → candidatas 3 y nada cambia. ajustar(aplicar=True, ids, tabla_respaldo='customer_requests_respaldo_estados_test') → CONFIRMADA / ASIGNADA / CONFIRMADA, 3 filas de respaldo y renglones de 'Sistema (ajuste de estados)'. Una segunda corrida → 0. En finally: DROP TABLE IF EXISTS de la tabla de prueba.
Ajustes a pruebas existentes:
- test_sincronizacion_estado_solicitud_cotizacion.py: las pruebas 1 y 3 esperan CONFIRMADA en vez de COTIZADA; la 2 (ya pasada a /enviar-confirmacion por H50) espera CONFIRMADA; las dos de no-op siguen igual.
- test_confirmacion_solicitud.py l.477 (ya ajustada por N7): CONFIRMADA.
- test_textos_actividad.py: el dict exacto de ETIQUETAS_ESTADO['SC'] y la prueba 4 de H7 (ahora COTIZACION_CREADA 'Cotización … creada desde esta solicitud').
- test_rechazo_cotizacion_solicitud_activa.py (N7) prueba 1: COTIZACION_RECHAZADA en vez de ESTADO_CHANGED, y la SC queda CONFIRMADA (no COTIZADA).
- test_pedido_cancelado_reabre_cotizacion.py (H46) prueba 1: SC CONFIRMADA.
- test_confirmacion_cotizacion.py::test_confirmar_cot_via_link_sincroniza_sc sigue pasando gracias a la regla de heredados.
Frontend: archivo nuevo frontend/tests/test_estados_solicitud.mjs (node:assert/strict). Casos: etiquetas de los 6 estados vivos y de los 4 heredados, sin '_' ni códigos; infoEstadoSolicitud('ALGO_NUEVO').label === 'Algo nuevo'; pasoSolicitud: BORRADOR 0, ASIGNADA 1, PENDIENTE_CONFIRMACION 2, CONFIRMADA 3, COTIZADA 3, CANCELADA -1; puedeReiniciar falso con COT activa y en CANCELADA; tablas congeladas. Luego npm test y npx tsc --noEmit. Manual: SC nueva → asignar → enviar → confirmar por enlace (los pasos avanzan solos) → crear COT (sigue Confirmada) → Reiniciar ya no aparece.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
Consulta de solo lectura en erp_test (2026-10-03), en una transacción READ ONLY: hay 6 solicitudes. CONFIRMADA: 3, todas sin marca de Gate 1 y con cotización o pedido activo; son confirmaciones que llegaron por la cotización y se quedan en CONFIRMADA. PENDIENTE_CONFIRMACION: 1. CANCELADA: 2. Ninguna en COTIZADA, EN_ESPERA_CONFIRMACION, RECHAZADA ni VENCIDA, así que en erp_test el script no cambiaría nada. Producción no se revisó. Procedimiento, igual al del script de H7 y siempre con OK del usuario en cada base:
1) python scripts/ajustar_estados_solicitud.py (reporte): muestra el conteo por regla y ejemplos.
2) Con el OK, --aplicar.
3) Para deshacer, el SQL de restauración del docstring.
Consultas de apoyo:
SELECT estado, COUNT(*) FROM customer_requests GROUP BY estado;
SELECT cr.estado, (EXISTS(SELECT 1 FROM sales_quotations q WHERE q.sc_id=cr.id AND q.estado<>'RECHAZADA') OR EXISTS(SELECT 1 FROM sale_orders s WHERE s.estado<>'CANCELADO' AND (s.sc_id=cr.id OR s.cot_id IN (SELECT id FROM sales_quotations WHERE sc_id=cr.id)))) AS activos, COUNT(*) FROM customer_requests cr WHERE cr.estado IN ('COTIZADA','EN_ESPERA_CONFIRMACION','RECHAZADA','VENCIDA') GROUP BY 1,2;
Orden: después del T14 del Bloque 1 (datos de N4/N7 y script de textos de H7).
```

**Riesgos:**

```text
- Cambia el significado de las listas: 'Confirmadas' crecerá porque incluye las que ya tienen cotización o pedido; H32 separa las que esperan cotización. Pantallas fuera de Ventas (agenda del CRM, que pinta COTIZADA) dejan de verlo en solicitudes nuevas; queda fuera de alcance.
- Hay que ajustar varias pruebas existentes y del Bloque 1 (lista en 'pruebas').
- Seguridad: una SC puede quedar Confirmada sin marca de Gate 1 (confirmada por la cotización). confirmar_solicitud sigue exigiendo la marca, así que no se puede crear una COT nueva sin confirmación, y el ataque de la Ronda 6 sigue cerrado (N7 bloquea cambiar sc_id). Conviene una revisión de seguridad de la sincronización reescrita.
- revoke_pending_tokens hace commit interno: dentro de la sincronización va justo antes del commit final.
- Producción puede tener muchas SC en estados heredados: siempre primero el modo reporte.
- Los títulos viejos que corrigió el script de H7 dirán 'Estado cambiado a Borrador', mientras la etiqueta nueva dice 'Nueva'. Es aceptable: es texto histórico.
- 'Pendiente por confirmación' es más largo que la etiqueta actual; los anchos de tabla son del Bloque 4.
- Si el usuario elige que la solicitud siga cambiando con la cotización, este diseño se reduce a renombrar etiquetas y U11 hay que rehacerlo (ver notas).
```

**Archivos (diseño):** `backend/app/core/textos_actividad.py`, `backend/app/api/v1/erp_ventas.py`, `backend/app/api/v1/confirmacion_publica.py`, `backend/app/models/erp_documents.py`, `backend/scripts/ajustar_estados_solicitud.py`, `backend/tests/test_estados_solicitud.py`, `backend/tests/test_sincronizacion_estado_solicitud_cotizacion.py`, `backend/tests/test_confirmacion_solicitud.py`, `backend/tests/test_textos_actividad.py`, `backend/tests/test_rechazo_cotizacion_solicitud_activa.py`, `backend/tests/test_pedido_cancelado_reabre_cotizacion.py`, `frontend/src/lib/estados-solicitud.js`, `frontend/tests/test_estados_solicitud.mjs`, `frontend/package.json`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/estado-solicitud.tsx`


### U11 — Cotizar antes de que el cliente confirme

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Una cotización hecha sin la confirmación del cliente, ¿se puede enviar al cliente antes de que él confirme la solicitud? → **Sí; el cliente confirma la cotización con sus precios y con eso la solicitud también queda confirmada** (igual a la recomendada)
- ¿Quién puede cotizar una solicitud sin la confirmación del cliente? → **Cualquier asesor o administrador (queda registrado con su nombre y el motivo)** (igual a la recomendada)

**Lo que notará el usuario:** En una solicitud que el cliente todavía no ha confirmado aparece el botón 'Cotizar'. Al usarlo, el sistema avisa 'Esta solicitud no ha sido confirmada por el cliente' y pide escribir el motivo. Ese motivo queda en la Actividad con tu nombre y la hora. La cotización se crea y la solicitud sigue esperando al cliente. Cuando el cliente confirme (la solicitud o la cotización), la solicitud pasa a Confirmada y se queda con esa misma cotización, sin crear otra. Si no se hizo una cotización antes, todo sigue igual que hoy: cuando el cliente confirma, se crea la cotización nueva.

**Para el usuario:** Puedes cotizar una solicitud asignada o ya enviada aunque el cliente no la haya confirmado. El sistema te avisa que no está confirmada y te obliga a escribir el motivo, que queda como nota interna en la Actividad de la solicitud y de la cotización. La cotización muestra un aviso mientras el cliente no confirme. Cuando el cliente confirma, la solicitud queda Confirmada y se conserva esa cotización. Para crear el pedido sigue siendo obligatorio que el cliente confirme la cotización con precios.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
Depende de U15 (este grupo) y de estos ítems del Bloque 1:
- N7: la marca gate1 ya no se consume; COT activa → 400 bajo with_for_update; arreglo de seguridad que limpia gate1 al cambiar cot.sc_id y prohíbe sc_id libre en update_cotizacion; sus mensajes 400.
- N4: _documentos_activos_de_solicitud y las guardas de SC cancelada en create_cotizacion y en enviar_cotizacion_para_confirmacion.
- H35+H48: una sola consulta a la SC en get_cotizacion; su prueba 4 se ajusta.
- H36 / R2: anticipo por modalidad al crear la COT con SC.
- H46/H50: orden de las guardas en enviar_cotizacion_para_confirmacion (con la opción B).
- H27+H39: el canal se valida después de esas guardas.
- N1: verificación del anticipo al convertir.
Código base: R13 (migraciones aditivas) y R7 (runner con vendedor_token). Archivos frontend compartidos con T10 (cotizacion/[id]) y T11 (solicitud/[id]).
```

**Cambios (diseño):**

```text
BACKEND
1) Migración aditiva nueva, encadenada a la cabeza (el Bloque 1 dejó fa6_024; verificar con alembic heads), por ejemplo fa6_025_cotizacion_sin_confirmacion. En sales_quotations: sin_confirmacion_sc_at TIMESTAMP NULL y sin_confirmacion_sc_motivo TEXT NULL. Agregar las dos columnas al modelo SalesQuotation (models/erp_documents.py). _cot_dict expone 'sin_confirmacion_sc_at' (isoformat()+'Z') y 'sin_confirmacion_sc_motivo'.
2) erp_ventas.py, helper nuevo _crear_cotizacion_desde_solicitud(db, sc, cotizador, user_name) -> SalesQuotation, sin commit. Es lo que hoy hace confirmar_solicitud entre l.728 y l.756: fecha de entrega según modalidad_entrega, sc.fecha_entrega_estimada, y una COT BORRADOR con el número de la secuencia, los datos del cliente y los productos de la SC. confirmar_solicitud pasa a usarlo.
3) Endpoint nuevo POST /ventas/solicitudes/{sc_id}/cotizar-sin-confirmacion.
   - Body Pydantic CotizarSinConfirmacionBody, en schemas_compras.py junto a CancelarSolicitudBody: motivo (str, se le quitan espacios, de 10 a 500 caracteres → si no, 422), user_name opcional y cotizador opcional.
   - Roles: ROLE_ADMIN y ROLE_ASESOR, o solo ROLE_ADMIN si así lo decide el usuario.
   - Orden de validación:
     · SC con .with_for_update() → 404 si no existe.
     · Soporte Técnico → 400.
     · CANCELADA → 409 con el mensaje de N4 «La solicitud {SC} está cancelada: restáurala desde la Papelera…».
     · estado CONFIRMADA con gate1_confirmed_at no nulo → 409 «El cliente ya confirmó esta solicitud: usa «Crear Cotización».».
     · estado BORRADOR o sin advisor_user_id → 400 «Asigna un asesor a la solicitud antes de cotizarla.».
     · Estado fuera de ASIGNADA, PENDIENTE_CONFIRMACION o CONFIRMADA sin marca → 400.
     · Sin productos (_tiene_productos_para_cotizar) → 400, mismo texto que confirmar_solicitud.
     · _documentos_activos_de_solicitud no vacío → 400 con los mensajes de N7 (COT activa o PVEN vigente).
   - Si pasa: crea la COT con el helper; cot.sin_confirmacion_sc_at = utcnow; cot.sin_confirmacion_sc_motivo = motivo; sc.updated_at. Uno = body.user_name o user.email.
   - _log SC, action nueva 'COTIZADA_SIN_CONFIRMACION': «Se procedió con la cotización {COT} sin confirmación del cliente. Motivo: {motivo}». extra_data: {cot_id, cot_numero, motivo, estado_solicitud, cambios:[{etiqueta:'Motivo', despues:motivo}, {etiqueta:'Estado de la solicitud', despues:etiqueta_estado('SC', sc.estado)}]}. commit=False.
   - _log COT 'CREATED': «Cotización {COT} creada desde {SC} sin confirmación del cliente», new_estado BORRADOR, extra_data {sin_confirmacion:true, cambios:[Motivo]}. commit=False.
   - Un solo db.commit(). Después, en try/except con logger: mover_lead_de_solicitud(sc.id, 'QUOTATION', db), igual que create_cotizacion.
   - NO toca sc.estado ni gate1_confirmed_at, y no revoca el enlace pendiente de la SC.
   - Respuesta: {status, data:{sc:_sc_dict, cotizacion:_cot_dict}}.
4) create_cotizacion (POST /cotizaciones) con sc_id de una SC existente, después de la guarda de N4 (SC cancelada → 409):
   - COT activa o PVEN vigente → 400 (mensajes de N7).
   - Si la SC no tiene confirmación vigente (estado != 'CONFIRMADA' o gate1 None): exige body.motivo_sin_confirmacion (sin espacios, al menos 10 caracteres). Si falta → 422 «Esta solicitud no ha sido confirmada por el cliente: indica el motivo para cotizarla igual (motivo_sin_confirmacion) o usa «Cotizar» en la solicitud.». Con motivo: marca la COT y registra los mismos dos renglones que (3).
   Así se cierra la puerta que N7 dejó anotada (POST /cotizaciones con sc_id creaba la COT sin Gate 1). Ninguna pantalla manda sc_id: el Cotizador Rápido no lo hace.
5) confirmacion_publica.py, confirmar_via_token, rama SC: después de poner CONFIRMADA y gate1, y con el mismo lock, buscar la COT activa más reciente de la SC (estado != 'RECHAZADA').
   - Si existe, el _log de la SC dice «Confirmada por el cliente vía enlace. Se mantiene la cotización {COT}, creada antes de la confirmación.».
   - Además, _log COT con action nueva 'SC_CONFIRMADA': «El cliente confirmó la solicitud {SC}: se mantiene esta cotización (no se crea otra).».
   - No crea nada. Con la COT activa, confirmar_solicitud responde 400 (N7) y la pantalla no ofrece 'Crear Cotización'.
6) Enviar la COT antes de que el cliente confirme la SC:
   - Opción A (recomendada): la sincronización de U15 ya lo cubre: cuando el cliente confirma la COT, la SC pasa a Confirmada, sin marca gate1, y se revoca su enlace.
   - Opción B: en enviar_cotizacion_para_confirmacion, después de las guardas de N4/H46 y antes del canal de H27: si cot.sc_id y la SC está en BORRADOR, ASIGNADA o PENDIENTE_CONFIRMACION → 409 «La solicitud {SC} todavía no ha sido confirmada por el cliente: puedes preparar la cotización, pero se envía cuando el cliente confirme la solicitud.».
7) get_cotizacion: exponer 'sc_estado' y 'sc_confirmacion_vigente' en la misma consulta a la SC que agregan H35+H48 (sc_notas) y H36 (modalidad). Por el choque del Bloque 1, una sola consulta por documento relacionado.
FRONTEND
8) estados-solicitud.js (creado en U15): MOTIVO_SIN_CONFIRMACION_MIN = 10 y puedeCotizarSinConfirmacion(sc, {cotizacionesActivas, pedidosVigentes, tieneProductos}). Es verdadero si no es Soporte, hay asesor y productos, no hay documentos activos, y el estado es ASIGNADA o PENDIENTE_CONFIRMACION, o CONFIRMADA con confirmacion_vigente false.
9) solicitud/[id]/page.tsx:
   - Estados nuevos: showCotizarSinConf, motivoSinConf, cotizandoSinConf y errorSinConf.
   - cotizarSinConfirmacion(): POST {motivo, user_name: currentUser} y luego router.push a la COT con return_to, igual que confirmarSC.
   - Modal 'Cotizar sin confirmación del cliente' (ícono AlertTriangle, color ámbar):
     · Recuadro ámbar con el texto exacto «Esta solicitud no ha sido confirmada por el cliente.» y debajo: «Puedes crear la cotización igual: quedará registrado en la Actividad con tu nombre y este motivo. Cuando el cliente confirme, la solicitud pasará a Confirmada y se mantendrá esta cotización.».
     · Textarea 'Motivo (nota interna) *' con contador y el mínimo.
     · Botones 'Esperar la confirmación' y 'Crear cotización'; este último deshabilitado hasta el mínimo.
     · El error del servidor se muestra dentro del modal (sin alert).
   - renderSiguientePaso:
     · En ASIGNADA y PENDIENTE_CONFIRMACION con puedeCotizarSinConfirmacion: además del botón principal actual, un Button variant secondary 'Cotizar sin esperar confirmación'.
     · Con COT activa y la SC sin confirmar: la tarjeta 'Continúa en la cotización' agrega «El cliente todavía no confirma esta solicitud; se cotizó sin su confirmación. Motivo: …» y un botón secundario para enviar o reenviar el enlace de la solicitud.
   - Bloque 'Cotizaciones' vacío (l.686-692): botón 'Cotizar'. Llama a confirmarSC si canConfirmarSC; si no, abre el modal cuando puedeCotizarSinConfirmacion.
   - Lista de cotizaciones de la SC: chip ámbar 'Sin confirmación del cliente' si c.sin_confirmacion_sc_at y la SC sigue sin confirmar.
   - ACTIVITY_STYLE / labels / orden: COTIZADA_SIN_CONFIRMACION ('Cotización sin confirmación', AlertTriangle ámbar).
   - Si la respuesta a la pregunta de roles es 'solo administrador': el botón se oculta cuando me.role no es admin.
10) cotizacion/[id]/page.tsx: aviso ámbar sobre renderSiguientePaso, junto al aviso rose de H46.
   - Aparece cuando cotizacion.sin_confirmacion_sc_at existe y sc_estado está en ESTADOS_SC_SIN_CONFIRMAR.
   - Título: 'La solicitud {sc_numero} no ha sido confirmada por el cliente'. Texto: 'Esta cotización se creó sin su confirmación. Motivo: {motivo}'. Con la opción A agrega: 'Si el cliente confirma esta cotización, la solicitud también quedará confirmada.'. Con la opción B, 'Enviar al Cliente' queda deshabilitado con ese texto.
   - Cuando la SC ya está confirmada: línea gris discreta en la cabecera, 'Creada antes de la confirmación del cliente — Motivo: …'.
   - ACTIVITY_STYLE: SC_CONFIRMADA ('Solicitud confirmada', CheckCircle2 esmeralda).
```

**Comportamiento esperado:**

```text
- 'Cotizar' solo aparece en solicitudes con asesor, con productos, sin cotización activa ni pedido vigente, y en Asignada o Pendiente por confirmación (o Confirmada cuya confirmación ya no vale). Nunca en Nueva, Cancelada ni Soporte.
- El aviso dice «Esta solicitud no ha sido confirmada por el cliente.» y el motivo es obligatorio: mínimo 10 caracteres, máximo 500. Menos → 422 «El motivo debe tener al menos 10 caracteres.».
- Al crearla: la cotización queda en Borrador con los productos de la solicitud y marcada 'sin confirmación', con fecha y motivo. La solicitud NO cambia de estado y su enlace pendiente sigue sirviendo.
- Actividad de la SC: «Se procedió con la cotización COT-… sin confirmación del cliente. Motivo: …», con nombre y hora. Actividad de la COT: «Cotización COT-… creada desde SC-… sin confirmación del cliente».
- El cliente confirma la solicitud por su enlace → la SC queda Confirmada, se mantiene la misma cotización y no se crea otra. 'Crear Cotización' responde 400 «ya tiene la cotización … activa».
- Opción A: el cliente confirma la cotización → la COT queda Confirmada y la SC también, y el enlace viejo de la SC queda anulado. Opción B: enviar la cotización responde 409 hasta que el cliente confirme la solicitud.
- Si no se cotizó antes, el flujo de hoy no cambia: el cliente confirma → 'Crear Cotización' crea una cotización nueva.
- El pedido sigue exigiendo la confirmación del cliente sobre la cotización (Gate 2) y la verificación del anticipo (N1).
- Errores:
  · Ya confirmada → 409 «El cliente ya confirmó esta solicitud: usa «Crear Cotización».».
  · Sin asesor → 400 «Asigna un asesor a la solicitud antes de cotizarla.».
  · Cancelada → 409 (mensaje de N4).
  · Con cotización activa → 400 (mensaje de N7).
  · POST /cotizaciones con sc_id sin confirmar y sin motivo → 422.
```

**Pruebas (diseño):**

```text
Backend: archivo nuevo backend/tests/test_cotizar_sin_confirmacion.py (sin parametrize; helpers _sc y auth como en test_solicitud_productos_para_cotizar.py). Correr con tests/rollback_runner.py test_cotizar_sin_confirmacion.
1) test_cotizar_sin_confirmacion_exige_motivo: SC ASIGNADA con asesor y productos → POST {motivo:'corto'} → 422; sin motivo → 422; no se creó ninguna COT con ese sc_id.
2) test_cotizar_sin_confirmacion_crea_la_cotizacion_y_lo_anota: POST {motivo:'Cliente pidió precio urgente por teléfono', user_name:'asesor@test'} → 200. Afirmar: COT BORRADOR con sc_id y los productos de la SC; sin_confirmacion_sc_at no nulo; motivo guardado. La SC sigue ASIGNADA y gate1 None. La actividad de la SC tiene COTIZADA_SIN_CONFIRMACION con el motivo y user_name 'asesor@test'. El CREATED de la COT contiene 'sin confirmación del cliente'. GET /cotizaciones/{id} trae sc_estado 'ASIGNADA'.
3) test_la_confirmacion_del_cliente_mantiene_la_cotizacion: SC ASIGNADA con correo → enviar-confirmacion (token sacado de link_confirmacion) → cotizar-sin-confirmacion → /confirmar/confirmar con ese token → SC CONFIRMADA y gate1 no nulo. Sigue habiendo una sola COT con ese sc_id. POST /solicitudes/{id}/confirmar → 400 con 'activa'. La actividad de la SC contiene 'Se mantiene la cotización' y la COT tiene un renglón SC_CONFIRMADA.
4) test_no_se_cotiza_sin_confirmacion_si_ya_esta_confirmada: SC CONFIRMADA con gate1 → 409.
5) test_no_se_cotiza_sin_asesor_sin_productos_con_cot_activa_ni_cancelada: BORRADOR sin asesor → 400; ASIGNADA sin productos → 400; con COT BORRADOR activa → 400; CANCELADA → 409.
6) test_confirmar_la_cotizacion_confirma_la_solicitud (opción A): SC ASIGNADA → enviar-confirmacion (token t1 sin usar) → cotizar-sin-confirmacion → productos con precio y total_cop por DB → POST /cotizaciones/{id}/enviar-confirmacion {} → canjear el token t2 → COT CONFIRMADA, SC CONFIRMADA con gate1 None, t1 revocado (_token_usado) y actividad de la SC con 'confirmó la cotización'. Con la opción B, esta prueba pasa a ser: enviar-confirmacion de la COT → 409 y la COT sigue en BORRADOR.
7) test_post_cotizaciones_con_sc_sin_confirmar_exige_motivo: POST /cotizaciones {sc_id, productos con precio, total_cop:1000} → 422. Con motivo_sin_confirmacion → 201 y COT marcada. Con una SC CONFIRMADA con gate1 → 201 sin motivo. Con una COT activa previa → 400.
8) test_el_asesor_puede_cotizar_sin_confirmacion, con vendedor_token del runner (R7) → 200. Si el usuario elige 'solo administrador' → 403.
Ajuste: test_notas_solicitud_en_cotizacion_y_pedido.py prueba 4 (H35+H48, POST /cotizaciones con sc_id) manda motivo_sin_confirmacion o usa una SC CONFIRMADA con gate1.
Frontend: en test_estados_solicitud.mjs, casos de puedeCotizarSinConfirmacion: ASIGNADA con asesor y productos → true; BORRADOR → false; con COT activa → false; CONFIRMADA vigente → false; CONFIRMADA no vigente → true; Soporte → false. Luego npm test y npx tsc --noEmit. Manual: SC enviada → 'Cotizar sin esperar confirmación' → modal (no deja crear sin motivo) → COT con aviso ámbar → confirmar por el enlace de la SC → SC Confirmada, misma COT, el aviso desaparece.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No aplica: las columnas nuevas son nulas y no se marca nada hacia atrás. Consulta informativa hecha en erp_test (solo lectura): de 3 COT con sc_id, ninguna tiene una SC sin el renglón 'Confirmada por el cliente vía enlace' (SELECT COUNT(*) FROM sales_quotations q JOIN customer_requests cr ON cr.id=q.sc_id WHERE NOT EXISTS(SELECT 1 FROM activity_logs a WHERE a.entity_type='SC' AND a.entity_id=cr.id AND a.new_estado='CONFIRMADA' AND a.user_name='Cliente (confirmación por link)')). La migración es aditiva (R13) y se aplica con alembic upgrade head desde el worktree.
```

**Riesgos:**

```text
- Es una excepción explícita a Gate 1. Queda auditada (motivo obligatorio, usuario y hora en la Actividad de la SC y de la COT, y columnas en la COT), no pone la marca gate1 y el pedido sigue exigiendo Gate 2 y el anticipo. Conviene una revisión de seguridad del endpoint nuevo, de la guarda en create_cotizacion y de la rama SC de confirmar_via_token.
- Si se abusa, puede volverse la norma. El motivo queda visible y se puede medir después: COT con sin_confirmacion_sc_at no nulo.
- El cliente confirma en el enlace de la SC los productos de la SC, que pueden diferir de los de la COT si se re-cotizó. La COT pasa igual por su propia confirmación con precios.
- Con la opción A, una sola confirmación del cliente (la de la COT) deja la SC Confirmada sin marca. Si después se rechaza esa COT, la SC vuelve a Asignada (regla de U15) y hay que reenviarla.
- La guarda nueva en create_cotizacion rompe la prueba 4 de H35+H48; se ajusta.
- La migración debe encadenarse a la cabeza real (verificar con alembic heads; el Bloque 1 puede agregar más).
- solicitud/[id]/page.tsx y cotizacion/[id]/page.tsx tienen muchos dueños: T10/T11 del Bloque 1 y los grupos detalle-sc y cot-pven-pantallas del Bloque 2.
```

**Archivos (diseño):** `backend/alembic/versions/fa6_025_cotizacion_sin_confirmacion.py`, `backend/app/models/erp_documents.py`, `backend/app/api/v1/erp_ventas.py`, `backend/app/api/v1/schemas_compras.py`, `backend/app/api/v1/confirmacion_publica.py`, `backend/tests/test_cotizar_sin_confirmacion.py`, `backend/tests/test_notas_solicitud_en_cotizacion_y_pedido.py`, `frontend/src/lib/estados-solicitud.js`, `frontend/tests/test_estados_solicitud.mjs`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`


### U18+H31 — Solicitud cancelada: motivo a la vista y todo en la Actividad

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** Una solicitud cancelada ya no muestra el aviso amarillo de 'agrega productos para enviarla'. En su lugar se ve el motivo, quién la canceló y cuándo, y si se va a borrar de la Papelera o se conserva como historial, con un botón para ver la Actividad. En la Actividad, la cancelación queda completa: el motivo, el estado en que estaba, si se anuló el enlace que tenía el cliente o su confirmación, si el cliente quedó como perdido en el CRM y qué pasará en la Papelera. El motivo ya no se pega al final de las notas. Una solicitud cancelada ya no se puede reabrir con un botón de estado: se restaura desde la Papelera, que deja su propio registro.

**Para el usuario:** Al cancelar una solicitud, la Actividad guarda todo lo que pasó: motivo, quién y cuándo, el estado anterior, el enlace de confirmación anulado, la confirmación del cliente anulada, el cliente marcado como perdido en el CRM y la fecha en que se borra de la Papelera (o que se conserva porque tiene documentos). El detalle de la solicitud cancelada muestra ese resumen en lugar de avisos que ya no aplican, y no deja editarla ni reabrirla salvo restaurándola desde la Papelera.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
Depende de estos ítems del Bloque 1:
- N4: reescribe cancelar_solicitud (with_for_update, 409 por documentos activos, rama SENT_TO_TRASH, lead CANCELLED al cancelar) y retira la pastilla Cancelada; este ítem se monta encima.
- N4 (Papelera): las tres referencias que deciden si se conserva o se purga; aquí se extraen a _solicitud_tiene_referencias.
- H7+H41: el texto 'Cancelada: {motivo}' no se toca y etiqueta_estado da el 'Estado anterior'.
- R10/N4 en update_solicitud: la guarda nueva va en el mismo bloque de validaciones, en el orden de update_solicitud (N4 → N7 → H36 → H29 → H7), con _log(commit=False) de H29.
- T11: dueño de solicitud/[id]/page.tsx y solicitud-client.tsx.
- N3: la cancelación en cadena del Hub registra cada documento por su propia ruta.
Datos: después de T14.
```

**Cambios (diseño):**

```text
BACKEND (backend/app/api/v1/erp_ventas.py)
1) Helper _solicitud_tiene_referencias(db, sc_id) -> bool: extrae los tres EXISTS de N4 (Papelera), sales_quotations.sc_id, sale_orders.sc_id y sales_orders.canonical_customer_request_id. Lo usan get_papelera, eliminar_permanente, cancelar_solicitud y get_solicitud.
2) cancelar_solicitud, sobre la versión de N4 (with_for_update, 409 por documentos activos, rama 'ya cancelada' → SENT_TO_TRASH, lead CANCELLED):
   - ANTES de modificar se calculan: old_estado; tenia_confirmacion = gate1_confirmed_at is not None; enlaces_vivos = conteo de DocumentConfirmationToken con document_type 'SC', ese id, used_at NULL y expires_at > now; tenia_lead = existe SalesOrder con canonical_customer_request_id == sc.id; se_conserva = _solicitud_tiene_referencias.
   - Ya NO se anexa '[CANCELADA] Razón: …' a sc.notas (hoy l.2010). El motivo vive en razon_cancelacion y en la Actividad.
   - Secuencia: fijar estado, razon_cancelacion, eliminada_at, gate1 None y updated_at → revoke_pending_tokens(db,'SC',id), que hace el commit de todo → mover_lead_de_solicitud (N4) en try/except, guardando lead_ok → _log 'CANCELLED' con el texto actual «Cancelada: {razon}» (H7 no lo toca) y user_name. extra_data: {motivo, estado_anterior, enlace_anulado, confirmacion_anulada, lead_perdido, se_conserva, purga_programada, cambios}.
   - Renglones de 'cambios' (sin clave 'campo', como _detalle_envio de H27):
     · {etiqueta:'Motivo', despues:razon}
     · {etiqueta:'Estado anterior', despues:etiqueta_estado('SC', old_estado)}
     · Si enlaces_vivos > 0: {etiqueta:'Enlace de confirmación', despues:'Anulado: el cliente ya no puede confirmar con el enlace que recibió'}
     · Si tenia_confirmacion: {etiqueta:'Confirmación del cliente', despues:'Anulada'}
     · Si tenia_lead: {etiqueta:'Oportunidad en el CRM', despues:'Marcada como perdida'}, o 'No se pudo marcar como perdida' si falló
     · {etiqueta:'Papelera', despues: 'Se conserva como historial (tiene documentos vinculados)' o 'Se elimina definitivamente el {dd/mm/aaaa} si no se restaura'}, con eliminada_at + 30 días
   - Rama SENT_TO_TRASH de N4: el mismo renglón 'Papelera' en sus cambios.
3) update_solicitud: guarda nueva antes del loop. Si sc.estado == 'CANCELADA' y el body trae 'estado' distinto de 'CANCELADA' → 409 «La solicitud {SC} está cancelada: para retomarla, restáurala desde la Papelera.». Hoy la pastilla 'Borrador' y el 'Estado: Borrador' del menú de la lista la reviven sin pasar por restaurar_solicitud: quedan eliminada_at puesto y ningún registro RESTORED.
4) get_solicitud: si estado == 'CANCELADA', d['se_conserva_en_papelera'] = _solicitud_tiene_referencias(...). Si no se conserva, d['purga_programada'] = (eliminada_at + 30 días).isoformat() + 'Z'.
5) Script nuevo backend/scripts/limpiar_motivo_en_notas.py, con el patrón del script de H7 (reporte por defecto, --aplicar, BD enmascarada, una transacción). Función limpiar(db, aplicar=False, ids=None, tabla_respaldo='customer_requests_respaldo_notas'):
   - Toma las SC cuyas notas terminan en '[CANCELADA] Razón: {razon_cancelacion}', con o sin salto de línea antes.
   - Deja las notas sin ese sufijo (NULL si quedan vacías), con UPDATE … WHERE id=:id AND notas=:original y respaldo (id, notas_original, notas_nueva).
   - Es idempotente y nunca toca un sufijo que no coincida con razon_cancelacion.
FRONTEND
6) solicitud/[id]/productos-solicitud.tsx (l.161-175): el recuadro ámbar 'Esta solicitud no tiene productos… Agrégalos…' se muestra solo si editable. Si no, texto neutro gris 'Sin productos.' y debajo el motivoBloqueo, como hoy.
7) frontend/src/lib/estados-solicitud.js: helper puro resumenCancelacion(sc, actividades) -> {motivo, por, fecha, seConserva, purga}.
   - motivo = razon_cancelacion o 'No se registró el motivo'.
   - por y fecha salen del último renglón CANCELLED; si no hay, de eliminada_at.
8) solicitud/[id]/page.tsx:
   - renderSiguientePaso, rama CANCELADA (l.404-409): NextStepCard rose 'Solicitud cancelada' con:
     · 'Motivo: …'
     · 'Cancelada por {por} el {fecha hora}'
     · 'Se conserva en la Papelera como historial (tiene documentos vinculados)' o 'Se eliminará definitivamente el {fecha} si no la restauras desde la Papelera'
     · Botón 'Ver en la Actividad', que hace setPanelTab('actividad'); si el grupo detalle-sc aplica U12, va a la pestaña que corresponda.
   - En CANCELADA se ocultan 'Editar' (l.561-568) y el bloque de estado / 'Reiniciar' de U15.
   - ACTIVITY_STYLE / labels / orden: SENT_TO_TRASH ('Papelera', Trash2 rose). El renglón CANCELLED ya pinta sus 'cambios' con CambiosDeActividad.
9) solicitud-client.tsx:
   - getRazonCancelacion (l.681-694) ya no inventa 'Cancelada por cliente / Desistimiento comercial': devuelve '' cuando no hay motivo. Quien lo muestra pone 'Sin motivo registrado', y enviarAPapelera manda 'Enviada a la papelera (sin motivo registrado)'.
   - RowMenu: el 'Reiniciar' de U15 nunca aparece en CANCELADA.
```

**Comportamiento esperado:**

```text
- Detalle de una SC cancelada:
  · Sin aviso ámbar de productos.
  · Tarjeta rose con motivo, quién, cuándo y el destino en la Papelera.
  · Sin 'Editar' ni 'Reiniciar'.
  · Las notas ya no repiten el motivo (en las viejas, solo después de la limpieza con OK).
- Actividad de la cancelación: 'Cancelada: {motivo}', con la persona y la hora, y debajo:
  · Motivo
  · Estado anterior (por ejemplo 'Pendiente por confirmación')
  · 'Enlace de confirmación: Anulado…' (si había uno vivo)
  · 'Confirmación del cliente: Anulada' (si la había)
  · 'Oportunidad en el CRM: Marcada como perdida' (si hay lead)
  · 'Papelera: Se elimina definitivamente el dd/mm/aaaa si no se restaura' o 'Se conserva como historial (tiene documentos vinculados)'
- Enviar a la papelera una SC ya cancelada (N4) registra 'Papelera' igual. Restaurar sigue registrando RESTORED.
- PATCH de estado sobre una SC cancelada → 409 «La solicitud SC-… está cancelada: para retomarla, restáurala desde la Papelera.». El estado y eliminada_at no cambian.
- GET /solicitudes/{id} de una cancelada trae se_conserva_en_papelera, y purga_programada cuando no se conserva.
- La lista ya no inventa un motivo: muestra 'Sin motivo registrado'.
```

**Pruebas (diseño):**

```text
Backend: archivo nuevo backend/tests/test_cancelacion_solicitud_actividad.py (sin parametrize). Correr con tests/rollback_runner.py test_cancelacion_solicitud_actividad.
1) test_cancelar_registra_motivo_estado_enlace_y_papelera: SC ASIGNADA con asesor, productos y correo → enviar-confirmacion (enlace vivo) → POST /cancelar {razon:'El cliente compró en otro lado', user_name:'asesor@test'} → 200. Afirmar: el renglón CANCELLED tiene etiquetas de cambios == ['Motivo','Estado anterior','Enlace de confirmación','Papelera'] y 'Estado anterior' = 'Pendiente por confirmación'; las notas no contienen '[CANCELADA]'; razon_cancelacion guardada.
2) test_cancelar_con_lead_registra_oportunidad_perdida: lead creado vía /crm/leads, como la prueba 3 de N4 → la lista de cambios incluye 'Oportunidad en el CRM' con 'Marcada como perdida' y el lead queda CANCELLED.
3) test_cancelar_sc_confirmada_registra_confirmacion_anulada: SC CONFIRMADA con gate1 y sin documentos → incluye 'Confirmación del cliente: Anulada' y gate1 queda None.
4) test_papelera_dice_si_se_conserva: SC con COT RECHAZADA → cancelar → cambios 'Papelera' contiene 'Se conserva' y GET trae se_conserva_en_papelera True. SC sin documentos → 'Se elimina definitivamente el' y purga_programada no nula.
5) test_patch_de_estado_sobre_sc_cancelada_se_rechaza: SC cancelada por /cancelar → PATCH {estado:'BORRADOR'} → 409 con 'Papelera'; sigue CANCELADA y eliminada_at sin cambio.
6) test_script_limpiar_motivo_en_notas (solo ids propios): SC CANCELADA con notas 'Entrega en obra\n[CANCELADA] Razón: Ya no lo necesita' y razon_cancelacion 'Ya no lo necesita', más otra con razón distinta. Reporte → candidatas 1, nada cambia. --aplicar con tabla_respaldo de prueba → notas 'Entrega en obra' y respaldo de 1 fila; la otra queda intacta; una segunda corrida → 0. En finally: DROP TABLE IF EXISTS.
Revisar que la prueba 8 de N4 (las notas no se duplican al enviar a la papelera) siga pasando.
Frontend: en test_estados_solicitud.mjs, casos de resumenCancelacion: con razón y renglón CANCELLED → motivo, por y fecha; sin razón → 'No se registró el motivo'; sin renglón → usa eliminada_at. Luego npx tsc --noEmit. Manual: cancelar una SC sin productos → sin aviso ámbar, tarjeta con motivo; Actividad con los renglones; el botón de estado ya no la reabre.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
Consulta de solo lectura en erp_test (2026-10-03): SELECT COUNT(*) FROM customer_requests WHERE notas LIKE '%[CANCELADA] Razón:%' → 2, las dos SC DEMO canceladas; ninguna restaurada. Con OK del usuario: python scripts/limpiar_motivo_en_notas.py (reporte) y luego --aplicar, en cada base por separado. Las SC canceladas con la pastilla vieja, sin razon_cancelacion ni eliminada_at, las completa el paso de datos (c) de N4 en el T14 del Bloque 1; este ítem no las toca. No hay migración.
```

**Riesgos:**

```text
- Dejar de pegar el motivo en las notas: getRazonCancelacion ya lee primero razon_cancelacion y la Papelera también, así que nada depende de las notas. Las SC viejas lo conservan hasta la limpieza con OK.
- La guarda de PATCH sobre canceladas cierra un atajo que alguien podía estar usando para reabrir. Ahora se restaura desde la Papelera, que registra RESTORED y limpia eliminada_at.
- La fecha 'se elimina el …' depende de la purga de N4 (Papelera). Se calcula con el mismo helper para no prometer algo que no ocurrirá.
- La cancelación queda en 2-3 commits, como hoy, porque revoke y el movimiento del lead hacen su propio commit. Si falla el lead, el renglón lo dice.
- Comparte productos-solicitud.tsx con U13 (bloque de productos más grande, grupo detalle-sc) y la Papelera con el grupo dialogos-y-papelera (H33, H34).
```

**Archivos (diseño):** `backend/app/api/v1/erp_ventas.py`, `backend/scripts/limpiar_motivo_en_notas.py`, `backend/tests/test_cancelacion_solicitud_actividad.py`, `frontend/src/lib/estados-solicitud.js`, `frontend/tests/test_estados_solicitud.mjs`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/productos-solicitud.tsx`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`


### U12 — Panel derecho: Actividad, Chatter e IA

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** El panel de la derecha de la solicitud pasa de cuatro pestañas a tres: Actividad, Chatter e IA. Al abrir una solicitud, Actividad muestra arriba el siguiente paso con su botón (por ejemplo «Enviar para confirmación») y los botones para contactar al cliente, y debajo todo el historial. Las acciones no desaparecen: solo cambian de lugar.

**Para el usuario:** La pestaña «Acciones» deja de existir como pestaña aparte. Su contenido (el recuadro «Siguiente paso» con su botón y los botones WhatsApp / Llamar / Correo) queda arriba, dentro de «Actividad», que es la pestaña que se abre sola. Debajo sigue el historial con sus filtros. «Chatter» queda igual. «IA» queda en su lugar; la IA de verdad llega en el Bloque 5 y ocupará esa misma pestaña.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
N7, N4, H27, H29 y N10 cambian el mismo archivo y el contenido de renderSiguientePaso; aquí solo se mueve de lugar. H5: el botón de WhatsApp usa su waUrl (frontend/src/lib/whatsapp.js).
```

**Cambios (diseño):**

```text
FRONTEND — frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx (SolicitudDetalleContent):
1) Estado panelTab: tipo 'actividad' | 'chatter' | 'ia' y valor inicial 'actividad' (hoy 'acciones').
2) Barra de pestañas (el map sobre [['acciones','Acciones'],['actividad','Actividad'],['chatter','Chatter'],['ia','🤖 IA']]): queda [['actividad','Actividad'],['chatter','Chatter'],['ia','IA']]. La de IA lleva el ícono Sparkles (lucide-react, size 14) en lugar del emoji. Mismas clases.
3) Contenido de la pestaña 'actividad', en este orden:
   a) Siguiente paso: {renderSiguientePaso()} tal cual. Se quita el título «Acciones Principales» porque NextStepCard ya trae la etiqueta «Siguiente paso». La función NO cambia; solo cambia de lugar (su contenido lo modifican N7/N4 del Bloque 1 y U11/U15 de este bloque).
   b) Contactar cliente: los tres enlaces actuales en una fila compacta (grid grid-cols-3 gap-2; py-2; ícono 16 y texto en línea): «WhatsApp», «Llamar», «Correo». El de WhatsApp usa waUrl(solicitud.customer_phone) de frontend/src/lib/whatsapp.js (Bloque 1, H5) en lugar de armar `https://wa.me/57${...}`; si waUrl devuelve null no se pinta. Si no hay teléfono ni correo: texto gris «Sin teléfono ni correo registrados: agrégalos con «Editar».» (enlaza con H21).
   c) Separador (border-t border-slate-200 pt-5) y el bloque actual «Historial de actividad» (activityFilterOptions + actividadesFiltradas + CambiosDeActividad) sin cambios.
4) Eliminar la rama panelTab === 'acciones'.
5) Actualizar el comentario del contenedor derecho: «Actividad (con el siguiente paso y contacto) / Chatter / IA».
No cambian ChatterTab ni IAPanelSC (solicitud-client.tsx): el chatter lo trabaja su propio grupo (H22/U6) y la IA el Bloque 5.
BACKEND: ninguno.
```

**Comportamiento esperado:**

```text
- Al abrir /dashboard/ventas/solicitud/{id} la pestaña activa es Actividad.
- Actividad muestra arriba la tarjeta del siguiente paso del estado actual (asignar asesor, enviar para confirmación, reenviar enlace, crear cotización, ver COT, ver PVEN, cancelada o ticket de soporte) con los mismos botones y efectos de hoy. Debajo van «Contactar cliente» y el historial con sus filtros.
- Los botones del siguiente paso hacen exactamente lo mismo que hoy: abren el modal de canal, crean la cotización y navegan.
- Chatter e IA se ven igual que hoy.
- Una SC de Soporte Técnico muestra la tarjeta «Ticket de soporte» en Actividad.
- Ya no hay pestaña «Acciones».
```

**Pruebas (diseño):**

```text
- Frontend: `npx tsc --noEmit` sin errores nuevos y `npm test` (node tests/*.mjs) en verde.
- Capturas con recorrido.js (Playwright, Edge headless) a 1440 y 1024 px, una por estado:
  - BORRADOR: tarjeta «Asigna un asesor» arriba de Actividad.
  - ASIGNADA: «Enviar para Confirmación» abre el ChannelModal.
  - PENDIENTE_CONFIRMACION: aparece «Reenviar enlace».
  - CONFIRMADA: «Crear Cotización» lleva a la COT.
  - Con COT: aparece «Ver COT-…».
  - Soporte: aparece la tarjeta del ticket.
- En todas las capturas se verifica: tres pestañas, Actividad abierta por defecto, historial y filtros debajo, el Chatter guarda una nota y la IA genera el resumen de siempre.
- Backend: no hay pruebas porque no cambia.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No aplica: el cambio es solo de pantalla.
```

**Riesgos:**

```text
- solicitud/[id]/page.tsx ya lo cambian N4, N7, H27, H29 y N10 del Bloque 1. En este bloque también lo tocan U11/U15 (siguiente paso y estados, grupo estados-sc-y-cotizar), H22 (chatter) y U13/U14/H21/H25 de este grupo. Hace falta un solo dueño del archivo y aplicar esto encima de lo que deje el Bloque 1.
- Si una SC tiene muchas actividades, el historial empieza más abajo porque arriba va el siguiente paso. Es lo que se pidió; el panel conserva su propio scroll.
- El cambio de lugar del botón principal puede confundir los primeros días. Se mitiga porque Actividad se abre sola y el botón queda arriba.
```

**Archivos (diseño):** `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`


### U13 — Productos más grandes y arriba

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** La lista de productos de la solicitud aparece justo debajo de los datos del cliente y se ve más grande: el nombre completo en letra más legible, la cantidad bien visible y una marca que dice si el producto es del catálogo o se escribió a mano. Mientras editas la solicitud, los productos siguen a la vista.

**Para el usuario:** El bloque «Productos a cotizar» pasa a ser una tarjeta propia, con título, número de productos y el botón «Editar productos» dentro. Cada fila muestra el número de línea, el nombre completo (nunca cortado), una etiqueta «Catálogo» o «Texto libre» y la cantidad en grande. Además sube de lugar: Cliente → Productos → Notas → Asesor, modalidad y fechas → Cotizaciones y pedidos → Cambiar estado.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
H29: cambia onGuardado de ProductosSolicitud y la recarga silenciosa; el bloque se mueve con esas props. N7: puedeEditarProductos y motivoBloqueo pasan a usar cotizacionesActivas.
```

**Cambios (diseño):**

```text
FRONTEND
1) frontend/src/app/dashboard/ventas/solicitud/[id]/productos-solicitud.tsx (ProductosSolicitud):
   - Todo el componente va dentro de una tarjeta: `bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden`. Tiene encabezado propio (px-4 py-3 border-b border-slate-100) con «Productos a cotizar» en text-sm font-black text-slate-800, el contador «(N)» en gris y, a la derecha, el botón «Editar productos» (hoy fuera de la tarjeta, en text-xs). El título externo en text-xs se elimina.
   - Vista de solo lectura (rama lista.length > 0): tabla text-sm (hoy text-xs) con columnas «#» (w-10, gris), «Producto» y «Cantidad» (w-28, alineada a la derecha). Filas en py-3. El nombre va en text-[15px] font-semibold text-slate-800 con break-words, nunca truncate. Debajo del nombre, una pastilla pequeña: «Catálogo» (bg-emerald-50 text-emerald-700) si p.sku_id existe, y «Texto libre» (bg-slate-100 text-slate-500) si no. La cantidad va en text-lg font-black.
   - El aviso de «sin productos» y el editor (rama editando) quedan dentro de la misma tarjeta, para que el bloque no salte de tamaño. El editor lo rediseña H25+H13; el aviso vacío lo toca H31 en otro grupo.
   - El ancla id='productos-solicitud' (usada por abrirEditorProductos) se conserva en la tarjeta.
2) frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx (SolicitudDetalleContent), panel izquierdo:
   - <ProductosSolicitud …/> sale del ternario editMode ? … : … y queda justo debajo de la tarjeta Cliente, con todas las props que deje el Bloque 1 (onGuardado de H29; puedeEditarProductos y motivoBloqueo con cotizacionesActivas de N7). Así sigue visible en modo Editar.
   - Orden nuevo en modo vista: Cliente → Productos → Notas → grilla Asesor/Modalidad/Fechas (+ recuadro 60/40) → Cotizaciones → Pedidos de Venta → Cambiar estado.
   - Orden nuevo en modo Editar: Cliente → Productos → formulario Editar → Cambiar estado.
   - No cambia ninguna lógica ni prop.
BACKEND: ninguno.
```

**Comportamiento esperado:**

```text
- Lo primero que se ve después del cliente son los productos: nombre completo, marca Catálogo/Texto libre y cantidad en grande.
- «Editar productos» aparece solo cuando hoy aparece (sin cotización activa y SC no cancelada) y abre el editor en la misma tarjeta.
- Al pulsar «Editar» (datos de la solicitud), los productos siguen visibles con su propio botón de edición.
- Si la edición está bloqueada, el motivo (por ejemplo «Los productos ya pasaron a la cotización COT-…») se ve debajo de la tarjeta.
- Las SC de Soporte Técnico siguen sin bloque de productos.
```

**Pruebas (diseño):**

```text
- `npx tsc --noEmit`.
- Capturas a 1440 y 1024 px con la SC DEMO (1 producto de catálogo y 2 de texto libre). Se verifica:
  - nombres completos, pastillas correctas y cantidades grandes;
  - con COT activa: no aparece «Editar productos» y sí el motivo del bloqueo;
  - SC sin productos: aparece el aviso dentro de la tarjeta;
  - modo Editar: los productos siguen visibles.
- Backend: sin pruebas; no cambia.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No aplica: el cambio es solo de pantalla.
```

**Riesgos:**

```text
- Mismo archivo que U12, U14, H21 y H25 de este grupo y que N4, N7 y H29 del Bloque 1: un solo dueño.
- productos-solicitud.tsx también lo tocan H25+H13 (este grupo), H31 (otro grupo: aviso vacío solo si se puede editar) y H29 (Bloque 1: guardar sin esperar la recarga). Conviene aplicarlos en orden: H29 → U13 → H25 → H31.
- Notas sube por encima de Asesor y Modalidad, así que cambia el orden al que el usuario está acostumbrado. Es a propósito: primero lo que se cotiza y sus condiciones.
```

**Archivos (diseño):** `frontend/src/app/dashboard/ventas/solicitud/[id]/productos-solicitud.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`


### U14 — Notas sin fondo amarillo

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** La caja de «Notas» de la solicitud deja de ser amarilla y se ve igual que las demás cajas, y ahora respeta los saltos de línea. La misma nota, cuando aparece dentro de la cotización como «Nota de la solicitud», también deja de verse amarilla.

**Para el usuario:** El fondo amarillo hacía que la nota pareciera una advertencia. Ahora tiene el fondo gris claro de las demás tarjetas («Asesor», «Modalidad»), con su título «Notas» en gris y el texto respetando los renglones como se escribió.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
H35+H48: crea en la COT el recuadro «Nota de la solicitud» con el estilo ámbar copiado de la SC; el punto 2 cambia ese recuadro.
```

**Cambios (diseño):**

```text
FRONTEND
1) frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx (SolicitudDetalleContent), bloque `solicitud?.notas && <div className='bg-amber-50 border border-amber-100 …'>`:
   - Contenedor: `bg-slate-50 border border-slate-200 rounded-xl p-4`, igual que las tarjetas de Asesor y Modalidad.
   - Título «Notas»: `text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5` (hoy text-amber-700).
   - Texto: `text-sm text-slate-700 whitespace-pre-wrap break-words` (hoy text-amber-900, que además pierde los saltos de línea).
2) frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx: el recuadro «Nota de la solicitud» que agrega el Bloque 1 (H35+H48) copia «el estilo ámbar igual al de la SC». Se cambia al mismo estilo neutro, para que la misma nota se vea igual en la SC y en la COT. El recuadro azul «Nota de la cotización» y las notas del PVEN no cambian.
BACKEND: ninguno.
```

**Comportamiento esperado:**

```text
- La nota de la SC se ve con el fondo por defecto de las tarjetas y con sus saltos de línea.
- En la COT, «Nota de la solicitud» se ve con el mismo estilo neutro y «Nota de la cotización» sigue en azul.
- No cambia qué notas se muestran ni cuándo.
```

**Pruebas (diseño):**

```text
- `npx tsc --noEmit`.
- Captura de una SC con nota de varias líneas (los renglones se respetan y no hay amarillo).
- Captura de una COT creada desde esa SC, con la «Nota de la solicitud» en estilo neutro.
- Sin pruebas de backend.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No aplica: el cambio es solo de pantalla.
```

**Riesgos:**

```text
- Las tarjetas de cotizaciones vinculadas de la SC (bg-amber-50) también son ámbar. No se tocan, porque el usuario solo señaló Notas.
- El cambio en cotizacion/[id] cae en un archivo que también tocan el grupo cot-pven-pantallas y H35/H46/N1/H27 del Bloque 1. Si el crítico prefiere no extenderlo a la COT, se quita el punto 2 sin afectar el punto 1.
```

**Archivos (diseño):** `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`


### H21 — Ciudad del cliente y corregir sus datos desde la solicitud

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Cuando corrijas el teléfono, el correo o la dirección del cliente desde una solicitud, además de la solicitud y la ficha del cliente, ¿dónde más se corrige? → **También en la cotización y el pedido abiertos de esa misma solicitud (cotizaciones no rechazadas y pedidos no cancelados, entregados ni facturados)** (igual a la recomendada)

**Lo que notará el usuario:** En la tarjeta del cliente de la solicitud ahora aparece la ciudad y un enlace «Ver ficha». Al pulsar «Editar» puedes corregir el teléfono, el correo, la dirección y la ciudad del cliente. Al guardar, el cambio queda en la solicitud y también en la ficha del cliente, para que las próximas solicitudes ya salgan bien. Queda anotado en la Actividad de la solicitud y en el historial del cliente, con el dato anterior y el nuevo. Si escribes un correo que ya tiene otro cliente, el sistema te avisa y no guarda nada. Además, el historial del cliente en la Agenda vuelve a mostrar títulos y fechas.

**Para el usuario:** Hoy un teléfono o correo mal escrito no se puede corregir desde la solicitud, y es justo el dato que se usa para mandarle al cliente el enlace de confirmación. Con este cambio:
- se corrige desde «Editar» en la misma solicitud;
- también se corrige en la ficha del cliente (tu decisión);
- queda registrado en los dos historiales;
- si la solicitud no está vinculada a una ficha, el cambio queda solo en la solicitud.
No cambia el estado de la solicitud ni anula el enlace ya enviado. Si el enlace no le llegó al cliente por el dato equivocado, el sistema te recuerda usar «Reenviar enlace».

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
- H29: el endpoint nuevo usa el _log(..., commit=False) que ya trae la rama y sigue su patrón de una sola transacción; el frontend recarga con loadSolicitud({silencioso}).
- H27+H39: si el canal es Email y el cliente no tiene correo, el sistema pide «agrega su correo». Este ítem da la forma de agregarlo desde la SC.
- H5: waUrl, para teléfonos escritos con +57.
- H7+H41: textos con tilde.
- No toca update_solicitud, que modifican N4, N7, H36, H29 y H7.
```

**Cambios (diseño):**

```text
BACKEND
1) Nuevo backend/app/core/clientes.py (sin FastAPI). Lo importan erp_ventas y crm; crm no puede importar erp_ventas, porque erp_ventas ya importa de crm.
   - numero_cliente(c) → 'CLI-0012'. Es el mismo formato que usa agenda/page.tsx.
   - correo_de_otro_cliente(db, correo, excluir_id) → el Customer cuyo func.lower(email) == correo.lower() y cuyo id != excluir_id, o None.
   - log_cliente(db, cliente, descripcion, cambios, origen, user_name): agrega ActivityLog(entity_type='CLIENTE', entity_id=cliente.id, entity_numero=numero_cliente(cliente), action='UPDATED', description, user_name, extra_data={'cambios': cambios, 'origen': origen}) SIN commit. entity_type es String(20), así que no hace falta migración.
2) backend/app/core/cambios_documento.py:
   - CAMPOS['CLIENTE'] = {'first_name':'Nombre','last_name':'Apellido','document':'Documento','phone':'Teléfono','email':'Correo','address':'Dirección','city':'Ciudad'} y NOMBRE_ACCION['CLIENTE'] = 'Ficha del cliente actualizada'.
   - Función pública nueva cambio_simple(campo, etiqueta, antes, despues): devuelve el dict {campo, etiqueta, antes, despues} si los textos normalizados difieren, o None si no. Se usa para la ciudad, que no es columna de la SC.
3) backend/app/api/v1/erp_ventas.py:
   a) Junto a _sc_dict:
      - _CONTACTO_CLIENTE = {'customer_phone':('customer_phone','phone'), 'customer_email':('customer_email','email'), 'customer_address':('customer_address','address'), 'customer_city':(None,'city')}. Mapea la clave del body a la columna de SC/COT/VEN y a la columna de Customer.
      - _normalizar_contacto(body) → dict con solo las claves de _CONTACTO_CLIENTE presentes en el body. Reglas:
        - strip() a todo; '' → None.
        - Correo en minúsculas que cumpla ^[^@\s]+@[^@\s]+\.[^@\s]+$; si no, 422 «El correo «x» no es válido.».
        - Teléfono con 7 dígitos o más; si no, 422 «El teléfono debe tener al menos 7 dígitos.».
        - Dirección hasta 300 caracteres y ciudad hasta 100; si no, 422.
      - _unir_es(partes) → 'a' | 'a y b' | 'a, b y c'.
      - _docs_abiertos_para_contacto(db, sc) → [(entidad, doc)] según la respuesta del usuario. Con la opción recomendada:
        - las COT con sc_id == sc.id y estado != 'RECHAZADA';
        - los PVEN con (sc_id == sc.id o cot_id en esas COT) y estado fuera de {'CANCELADO','ENTREGADO','FACTURADO','DEVUELTO_TOTAL'}.
        Con «solo SC y ficha» devuelve []. Con «todo lo abierto del cliente» filtra por customer_id (SC no canceladas, más COT y PVEN como arriba).
   b) get_solicitud: después de `d = _sc_dict(sc)`, agregar `d['customer_city'] = sc.customer.city if sc.customer else None`. Solo en el detalle, para no sumar consultas al listado.
   c) Endpoint NUEVO @router.patch('/solicitudes/{sc_id}/cliente'), corregir_datos_cliente_solicitud(sc_id, body: dict, user=Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db):
      1. Cargar sc con .with_for_update(); 404 si no existe. Si sc.estado == 'CANCELADA': 409 «La solicitud {numero} está cancelada: si hace falta, corrige los datos desde la ficha del cliente.».
      2. nuevos = _normalizar_contacto(body). Si viene vacío: 422 «No llegó ningún dato del cliente para corregir.».
      3. Si sc.customer_id, cargar cliente con with_for_update. Si llega 'customer_city' y no hay cliente: 422 «Esta solicitud no está vinculada a una ficha de cliente: la ciudad se guarda en la ficha.».
      4. Si hay cliente y llega un correo no vacío, revisar correo_de_otro_cliente. Si existe: 409 «El correo {x} ya pertenece a otro cliente ({nombre apellido}). Revisa si es el mismo cliente antes de cambiarlo.». No se escribe nada.
      5. Tomar las fotos ANTES: tomar_foto(sc,'SC'), tomar_foto(cliente,'CLIENTE') y una foto por cada doc de _docs_abiertos_para_contacto.
      6. Aplicar cada clave a la SC (si tiene columna), a la ficha (si hay) y a los docs abiertos (si tienen columna). Poner sc.updated_at = utcnow. Hacer db.flush().
      7. Calcular los cambios:
         - cambios_sc = comparar('SC', …) más cambio_simple('customer_city','Ciudad', ciudad_antes, ciudad_despues);
         - cambios_cli = comparar('CLIENTE', …);
         - comparar('COT'|'VEN', …) por cada doc.
      8. Si no hay ningún cambio: db.rollback() y responder 200 con {data, sin_cambios: True}, sin Actividad.
      9. Actividad, toda con _log(..., commit=False) (la firma ya existe en la rama del Bloque 1) y user_name = body.updated_by o user.email:
         - SC 'UPDATED': «Datos del cliente corregidos: {etiquetas}». Si hubo ficha o docs, se agrega «. También se corrigieron en {_unir_es(['la ficha del cliente', *números])}.». extra_data = {'cambios': cambios_sc, 'ficha_cliente_id': id|None, 'documentos': números}.
         - Si hay cambios_cli: log_cliente con «Datos de contacto corregidos desde la solicitud {SC}: {etiquetas}» y origen {'tipo':'SC','id','numero'}.
         - Cada COT/VEN con cambios: 'UPDATED' «Datos del cliente corregidos desde la solicitud {SC}: {etiquetas}» con extra_data {'cambios', 'origen'}.
      10. resp = _sc_dict(sc) + customer_city. Luego db.commit() dentro de try/except IntegrityError; si falla: rollback + 409 con el mismo texto del correo repetido. Respuesta: {'status':'success','data': resp,'ficha_actualizada': bool,'documentos_actualizados': [números],'sin_cambios': False}.
      NO toca estado, tokens de confirmación ni gate1_confirmed_at.
   d) update_solicitud NO se toca: ya lo modifican seis diseños del Bloque 1. Sigue aceptando customer_* como hoy, pero sin efecto en la ficha.
4) backend/app/api/v1/crm.py:
   a) update_customer (PUT /crm/customers/{id}):
      - Si llega un email no vacío: strip + lower y revisar correo_de_otro_cliente. Si existe: 409 «Ya existe otro cliente con ese correo ({nombre}).». Hoy revienta con IntegrityError y responde 500.
      - Tomar fotos CLIENTE antes y después. Si cambió algo: log_cliente «Ficha del cliente actualizada: {etiquetas}» con origen {'tipo':'FICHA'}, en el mismo commit.
   b) get_customer_360_profile:
      - Leer ActivityLog con entity_type 'CLIENTE' y entity_id = customer_id (order_by id desc, limit 100).
      - Agregar cada uno a all_orders_timeline: {'type':'customer_update','id','status':'UPDATED','status_label':'Datos del cliente actualizados','color':'purple','created_at': iso+'Z','description','user_name','cambios': extra_data.cambios or []}.
FRONTEND
5) Nuevo frontend/src/lib/datos-cliente.js (JS puro, como pricing.js):
   - CAMPOS_CONTACTO.
   - cambiosDeContacto(original, form, {tieneFicha}): devuelve solo las claves cuyo valor recortado cambió. El correo se compara en minúsculas. customer_city solo entra si tieneFicha.
   - validarContacto(cambios): devuelve null o el mensaje; mismas reglas que el backend.
6) frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx (SolicitudDetalleContent):
   - loadSolicitud: editForm suma customer_phone, customer_email, customer_address y customer_city (de d.customer_city).
   - Tarjeta Cliente en vista:
     - La ciudad va junto a la dirección: «{dirección} · {ciudad}» con MapPin, o solo la ciudad si no hay dirección.
     - Si hay customer_id, enlace «Ver ficha» a la derecha del título, hacia /dashboard/agenda?customer_id={id}. Ese deep-link ya existe en agenda/page.tsx.
   - Tarjeta Cliente en editMode:
     - El nombre queda fijo, con el texto «El nombre se cambia en la ficha del cliente».
     - Inputs Teléfono (tel), Correo (email), Dirección y Ciudad (Ciudad solo si hay customer_id), con las mismas clases del formulario Editar. Si la SC está CANCELADA, quedan deshabilitados con el motivo.
     - Debajo, texto gris. Con ficha: «Lo que corrijas aquí también se guarda en la ficha del cliente y queda en la Actividad.», más la mención de la COT o el PVEN abiertos según la respuesta. Sin ficha: «Esta solicitud no está vinculada a una ficha de cliente: el cambio solo queda en la solicitud.».
   - Estado nuevo editError: se muestra en rojo junto a Guardar, en lugar de alert().
   - saveEdit:
     1. cambios = cambiosDeContacto(solicitud, editForm, {tieneFicha: !!solicitud.customer_id}). Si validarContacto(cambios) devuelve un error: setEditError y return.
     2. Si hay cambios: PATCH /ventas/solicitudes/{id}/cliente {...cambios, updated_by}. Si falla: setEditError(err.message) y se sigue editando.
     3. PATCH /ventas/solicitudes/{id} con un body EXPLÍCITO (advisor_name, advisor_user_id, tipo_solicitud, modalidad_pago, notas, fecha_vencimiento, updated_by) y ya no {...editForm}, para que los datos del cliente no viajen dos veces ni dejen un segundo renglón. Si el paso 2 salió bien y este falla: «Los datos del cliente se guardaron, pero no el resto: {mensaje}».
     4. setEditMode(false) y loadSolicitud({silencioso:true}) (de H29).
     5. Si la SC está PENDIENTE_CONFIRMACION y cambió el teléfono o el correo: Toast (@/components/ui) «Datos corregidos. Si el enlace no le llegó al cliente por el dato equivocado, usa «Reenviar enlace de confirmación».».
   - Cancelar la edición restablece editForm desde solicitud y limpia editError.
7) frontend/src/app/dashboard/agenda/page.tsx, pestaña «Timeline Unificado»:
   - Hoy lee t.event_type, t.title y t.date, pero el backend manda type, status_label y created_at, así que todas las tarjetas salen sin título ni fecha.
   - Leer t.type ?? t.event_type, t.status_label ?? t.title y t.created_at ?? t.date.
   - TIMELINE_DOT_COLOR suma customer_update: 'bg-purple-500'.
   - Si t.cambios trae elementos, pintar <CambiosDeActividad extra={{cambios: t.cambios}} /> (de '@/app/dashboard/ventas/flujo') y «por {t.user_name}».
8) frontend/package.json: agregar `node tests/test_datos_cliente.mjs` al script test, en el mismo cambio que consolida las líneas del Bloque 1.
```

**Comportamiento esperado:**

```text
Lo que se ve en la solicitud:
- La tarjeta Cliente muestra la ciudad (de la ficha) y «Ver ficha».
- Editar → corregir teléfono, correo, dirección o ciudad → Guardar. En una sola operación del servidor se guardan la SC, la ficha (si la SC está vinculada) y, con la opción recomendada, la COT y el PVEN abiertos de esa SC.
- Actividad de la SC, ejemplo: «Datos del cliente corregidos: Teléfono, Correo. También se corrigieron en la ficha del cliente y COT-20260486.», con antes → después.
- Historial del cliente (Agenda > Timeline Unificado): «Datos de contacto corregidos desde la solicitud SC-…: Teléfono, Correo», con antes → después y el autor.

Errores y casos límite:
- Correo de otro cliente: 409 con el nombre de ese cliente; no se guarda nada (ni la SC ni el resto del formulario).
- Correo o teléfono inválidos: mensaje en pantalla sin llamar al servidor. Si llegan al servidor por otra vía: 422.
- SC sin ficha: se corrige solo la SC y no aparece Ciudad.
- SC cancelada: campos deshabilitados; el servidor responde 409.
- Enviar los mismos datos: 200 sin renglón de Actividad.

Lo que no cambia:
- No cambia el estado de la SC, no revoca el enlace pendiente y no anula la confirmación del cliente, porque el cliente confirma productos, no datos de contacto.
- WhatsApp, Llamar, Correo y el envío para confirmación usan de inmediato el dato corregido.

En la Agenda:
- Editar la ficha desde la Agenda también queda en el historial del cliente.
- Un correo repetido en la ficha da un aviso claro (409) en lugar de un error 500.
```

**Pruebas (diseño):**

```text
BACKEND
Archivo nuevo backend/tests/test_solicitud_corregir_datos_cliente.py, en el estilo de test_solicitud_productos_para_cotizar.py: auth(), _sc(db, numero, user_admin, **campos) y un helper _cliente(db, **campos) que crea un Customer. Se corre con el runner de ROLLBACK: `cd backend && venv\Scripts\python.exe tests/rollback_runner.py test_solicitud_corregir_datos_cliente`. Sin parametrize.
1) test_corregir_telefono_y_correo_actualiza_la_solicitud_y_la_ficha
   - Preparación: Customer con phone 3000000000 y email ana.vieja@test.com; SC vinculada con los mismos datos.
   - PATCH {customer_phone:'3001112233', customer_email:' Ana.Nueva@Test.com ', updated_by:'asesor@test'} → 200.
   - Afirma: la SC y la ficha quedan con 3001112233 y ana.nueva@test.com; ficha_actualizada True.
   - Afirma: el ActivityLog SC 'UPDATED' empieza por 'Datos del cliente corregidos: Teléfono, Correo' y contiene 'ficha del cliente'; las etiquetas de extra_data.cambios son ['Teléfono','Correo'].
   - Afirma: hay un ActivityLog 'CLIENTE' con entity_id = cliente.id cuya descripción contiene el número de la SC.
2) test_la_ciudad_se_guarda_en_la_ficha_y_se_ve_en_el_detalle
   - PATCH {customer_city:'Medellín'} → la ficha queda con city 'Medellín'.
   - GET /solicitudes/{id} → data.customer_city == 'Medellín'.
   - El cambio 'Ciudad' de la SC trae antes 'Cali' y después 'Medellín'.
3) test_solicitud_sin_ficha_solo_corrige_la_solicitud
   - SC sin customer_id: PATCH con teléfono → 200, ficha_actualizada False y ningún log 'CLIENTE'.
   - PATCH con ciudad → 422.
4) test_correo_de_otro_cliente_se_rechaza_sin_tocar_nada
   - Otro Customer con email 'otro@test.com'. PATCH {customer_email:'OTRO@test.com', customer_phone:'3005556677'} → 409 con 'ya pertenece a otro cliente'.
   - Tras db.refresh, la SC y la ficha no cambiaron y no hay logs nuevos.
5) test_correo_y_telefono_invalidos_dan_422: correo 'sin-arroba' → 422; teléfono '12' → 422; body {} → 422.
6) test_solicitud_cancelada_no_se_corrige: SC CANCELADA → 409.
7) test_sin_cambios_no_registra_actividad: enviar el mismo teléfono → 200, sin_cambios True y ningún log nuevo.
8) test_corregir_datos_no_anula_el_enlace_pendiente
   - SC PENDIENTE_CONFIRMACION con un token de create_confirmation_token(db,'SC',sc.id).
   - PATCH con correo → el estado sigue PENDIENTE_CONFIRMACION, _token_usado es False y gate1_confirmed_at no cambia.
9) test_tambien_corrige_la_cotizacion_abierta_y_no_la_rechazada (solo con la opción recomendada)
   - COT1 BORRADOR y COT2 RECHAZADA con sc_id, más un PVEN CANCELADO.
   - Tras el PATCH de teléfono: COT1 cambia y tiene log 'UPDATED' con 'desde la solicitud'; COT2 y el PVEN no cambian.
10) test_el_asesor_puede_corregir: con vendedor_token → 200.
11) test_el_historial_del_cliente_muestra_la_correccion: después del PATCH, GET /crm/customers/{id}/profile-360 → timeline trae un item type 'customer_update' cuya descripción contiene el número de la SC.
12) test_editar_la_ficha_con_correo_repetido_da_409_y_registra_actividad
   - PUT /crm/customers/{id} con el correo de otro cliente → 409.
   - PUT con un teléfono nuevo → log 'CLIENTE' «Ficha del cliente actualizada: Teléfono».
Regresión con el mismo runner: test_solicitud_productos_para_cotizar, test_actividad_cambios_documentos y test_confirmacion_solicitud.

FRONTEND
- Archivo nuevo frontend/tests/test_datos_cliente.mjs (node:assert/strict):
  - sin cambios → {};
  - recorta espacios;
  - el mismo correo con otras mayúsculas no cuenta como cambio;
  - la ciudad se ignora sin ficha;
  - validarContacto con 'sin-arroba' → mensaje; con teléfono '12' → mensaje; borrar un dato ('') es válido.
- `npx tsc --noEmit`.
- Manual: corregir el teléfono de la SC DEMO y ver el cambio en la Actividad de la SC y en Agenda > cliente > Timeline Unificado. Probar el correo de otro cliente y ver el aviso.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No se corrige ningún dato viejo. Hay dos consultas informativas de solo lectura para dimensionar.
(a) SC sin ficha y SC cuyos datos ya difieren de su ficha:
SELECT COUNT(*) FILTER (WHERE cr.customer_id IS NULL) AS sin_ficha, COUNT(*) FILTER (WHERE c.id IS NOT NULL AND (COALESCE(cr.customer_phone,'')<>COALESCE(c.phone,'') OR LOWER(COALESCE(cr.customer_email,''))<>LOWER(COALESCE(c.email,'')) OR COALESCE(cr.customer_address,'')<>COALESCE(c.address,''))) AS distintas_de_su_ficha FROM customer_requests cr LEFT JOIN customers c ON c.id=cr.customer_id WHERE cr.estado<>'CANCELADA';
(b) Correos de clientes repetidos si se ignoran mayúsculas. Estos casos harían que la validación nueva avise:
SELECT LOWER(email), COUNT(*) FROM customers WHERE email IS NOT NULL GROUP BY 1 HAVING COUNT(*)>1;
Las actividades viejas no se tocan. El Timeline de la Agenda empieza a mostrar bien eventos que ya existían; eso no es un cambio de datos.
```

**Riesgos:**

```text
- Cambiar el correo en la ficha afecta todo lo futuro de ese cliente (es la decisión del usuario). Si la SC estaba vinculada a una ficha equivocada, la corrección cae en esa ficha. Se mitiga con el aviso explícito en el formulario y el renglón con antes → después en el historial del cliente, que permite rastrearlo y revertirlo.
- customers.email es único y distingue mayúsculas. La revisión previa (en minúsculas) cubre casi todo y el except IntegrityError cubre la carrera. Los correos nuevos se guardan en minúsculas.
- Quedan dos vías: PATCH /solicitudes sigue aceptando customer_*, porque otras pantallas pueden usarlo, pero esa vía no toca la ficha. Se deja así para no sumar otro cambio a update_solicitud.
- Arreglar el Timeline de la Agenda hace aparecer de golpe eventos que antes salían vacíos. Además, la pestaña «Historial Comercial» de la Agenda lee customer360.customer_requests, que el backend no envía (envía 'solicitudes'): está siempre vacía y queda fuera de alcance (anotado en notas).
- page.tsx es el mismo archivo que tocan U12, U13, U14 y H25 y el Bloque 1: un solo dueño.
- Si se elige propagar a la COT y el PVEN abiertos, una COT ya enviada conserva su enlace vigente (el token no depende del correo).
```

**Archivos (diseño):** `backend/app/core/clientes.py`, `backend/app/core/cambios_documento.py`, `backend/app/api/v1/erp_ventas.py`, `backend/app/api/v1/crm.py`, `backend/tests/test_solicitud_corregir_datos_cliente.py`, `frontend/src/lib/datos-cliente.js`, `frontend/tests/test_datos_cliente.mjs`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/agenda/page.tsx`, `frontend/package.json`


### H25+H13 — Editar productos cómodo y cambiar cantidades

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** Al editar los productos de una solicitud, los nombres se ven completos, el buscador ocupa todo el ancho y el aviso «producto no encontrado» se lee bien aunque la pantalla sea pequeña. Al crear una solicitud nueva, puedes cambiar la cantidad de un producto ya agregado sin quitarlo y volverlo a agregar. Y la cantidad nunca queda en cero ni vacía.

**Para el usuario:** El editor de productos de la solicitud y la lista de productos del formulario de nueva solicitud pasan a usar la misma pieza. Cada producto muestra:
- el nombre completo, en varias líneas si hace falta;
- debajo, la marca Catálogo o Texto libre;
- un campo de cantidad editable;
- el botón para quitarlo.
El buscador va en su propia línea a todo el ancho, con la cantidad y «Agregar» debajo. En pantallas de 1024 px el panel derecho arranca un poco más angosto para dejar espacio.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
H29: guardar() de productos-solicitud.tsx deja de esperar onGuardado y usa la SC que devuelve el PATCH; el editor se rehace encima de ese cambio.
```

**Cambios (diseño):**

```text
FRONTEND
1) Nuevo frontend/src/lib/lineas-producto.js (JS puro, probado con node):
   - nombreLinea(p): product_name, nombre o name, recortado.
   - cantidadValida(v): entero ≥ 1; '', 0, negativo o NaN → 1; '2.7' → 2.
   - cambiarCantidad(lineas, i, v): no muta; acepta '' mientras se escribe.
   - normalizarCantidades(lineas): aplica cantidadValida a todas.
   - quitarLinea(lineas, i).
2) Nuevo frontend/src/app/dashboard/ventas/solicitud/lineas-producto.tsx con LineasProductoEditables({ lineas, onChange }):
   - Cada línea es `grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2`.
   - Columna 1: nombre en text-sm font-bold text-slate-800 break-words (sin truncate) y, debajo, la pastilla «Catálogo» / «Texto libre» (la misma de U13).
   - Columna 2: «Cant.» y un input number w-20 min 1 step 1, con aria-label «Cantidad de {nombre}». El value admite '' mientras se escribe: onChange → cambiarCantidad; onBlur → cantidadValida. Esto corrige que hoy, al borrar el número, salte a 1 y escribir '5' deje '15'.
   - Columna 3: botón papelera con title «Quitar {nombre}».
   - Lista vacía: «Todavía no hay productos en la lista.».
3) frontend/src/app/dashboard/ventas/solicitud/[id]/productos-solicitud.tsx (ProductosSolicitud), rama editando:
   - El map de borrador se reemplaza por <LineasProductoEditables lineas={borrador} onChange={setBorrador} />.
   - La fila de agregar pasa a dos niveles: ProductSearch a todo el ancho (así su desplegable y el aviso «no encontrado» heredan el ancho completo) y debajo `flex items-center gap-2` con «Cantidad», input w-20 y Button «Agregar».
   - lineaEscrita usa cantidadValida(qty). guardar() manda normalizarCantidades([...]) para que nunca viaje qty '' o 0.
   - nombreDe se reemplaza por nombreLinea del lib.
4) frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx:
   - ProductSearch:
     - el aviso de no encontrado pasa a `flex flex-wrap items-center gap-2`, con el texto en `flex-1 min-w-[10rem]`; el botón «+ Crear producto nuevo» baja de línea si no cabe;
     - el placeholder pasa a «Buscar producto en catálogo…»;
     - los resultados del desplegable van con break-words.
     No cambia la lógica de crearNuevo (H12/U7 del grupo formulario-nueva-sc).
   - SolicitudTipoYDetalle (formulario de creación; aquí vive H13):
     - el render de `productos.map(… {p.product_name} x{p.qty} … <X/>)` se reemplaza por <LineasProductoEditables lineas={productos} onChange={setProductos} />;
     - «+ Agregar» guarda qty: cantidadValida(prodQty), porque hoy guarda 0 o NaN si se borra el número;
     - getExtras aplica normalizarCantidades.
5) frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx: un useEffect al montar hace `if (window.innerWidth < 1280) setRightWidth(320)`. No se calcula en useState para no romper la hidratación. El arrastre sigue igual (300–800). A 1024 px el panel izquierdo gana unos 80 px.
6) frontend/package.json: agregar `node tests/test_lineas_producto.mjs` al script test.
BACKEND: ninguno. El contrato de productos (product_name, qty, sku_id) no cambia.
```

**Comportamiento esperado:**

```text
- Editor de la SC a 1024 px:
  - nombres completos, en varias líneas si hace falta, con la marca debajo;
  - el buscador ocupa todo el ancho y el desplegable de resultados también;
  - «Producto no encontrado en el catálogo.» se lee completo y el botón «Crear producto nuevo» baja si no cabe.
- La cantidad es siempre un entero ≥ 1. Se puede borrar y reescribir el número sin que salte; al salir del campo o al guardar se corrige a 1 si quedó vacía.
- Formulario de nueva SC: cada producto agregado tiene su cantidad editable y su botón quitar, y la cantidad elegida es la que se guarda en la SC.
- Lo demás no cambia:
  - «Guardar productos» funciona como antes;
  - lo escrito sin pulsar «Agregar» se guarda (editor del detalle);
  - sigue el aviso de que cambiar productos anula la confirmación;
  - el Asistente Omnicanal usa el mismo formulario y recibe la mejora.
```

**Pruebas (diseño):**

```text
FRONTEND
- Archivo nuevo frontend/tests/test_lineas_producto.mjs (node:assert/strict):
  - cantidadValida: '0' → 1; -3 → 1; '' → 1; 'abc' → 1; '2.7' → 2; 5 → 5;
  - cambiarCantidad no muta el arreglo original y acepta '';
  - normalizarCantidades deja todo ≥ 1;
  - quitarLinea;
  - nombreLinea con product_name, nombre y name.
- `npx tsc --noEmit`.
- Capturas a 1024 y 1440 px:
  - editor con un nombre largo («Pintura vinilo blanco galón tipo 1 DEMO 5 litros»);
  - buscador con un producto inexistente (aviso legible y botón debajo);
  - formulario de nueva SC con dos productos, cambiando la cantidad de uno: la SC creada tiene esa cantidad.
BACKEND
- Sin cambios. Regresión con el runner de ROLLBACK: `tests/rollback_runner.py test_solicitud_productos_para_cotizar` (contrato de productos).
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No se corrige nada. Consulta informativa de solo lectura para saber si hay solicitudes con cantidades inválidas guardadas:
SELECT cr.id, cr.numero FROM customer_requests cr, json_array_elements(cr.productos::json) p WHERE COALESCE(NULLIF(p->>'qty','')::numeric, 0) < 1;
Si aparece alguna, se le muestra al usuario. Corregirla requiere su OK.
```

**Riesgos:**

```text
- solicitud-client.tsx (ProductSearch y SolicitudTipoYDetalle) también lo cambia el grupo formulario-nueva-sc: H12/U7 (crear producto y agregarlo), U8 (productos resaltados con chip morado) y H10 (tildes). Hace falta un solo dueño. U8 debe aplicar su estilo sobre LineasProductoEditables (por ejemplo con una prop de tono), no sobre un render aparte.
- getExtras descarta la línea escrita sin «Agregar» cuando ya hay otras; eso es H12, de otro grupo, y aquí no se toca.
- productos-solicitud.tsx lo tocan también U13 (este grupo), H31 (otro grupo) y H29 (Bloque 1).
- El panel derecho a 320 px en pantallas < 1280 deja menos espacio a la Actividad, pero sigue siendo arrastrable.
```

**Archivos (diseño):** `frontend/src/lib/lineas-producto.js`, `frontend/src/app/dashboard/ventas/solicitud/lineas-producto.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/productos-solicitud.tsx`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/tests/test_lineas_producto.mjs`, `frontend/package.json`


### U6+H22 — Chatter para notas en Solicitud, Cotización, Pedido y Hub

**Decisiones del usuario:**
- Marcado por el usuario: **cambiar** — comentario: "que se pueda colocar una nota externa y esa nota externa si reinicie el conteo"
- Cuando alguien anota en el Chatter una llamada, un WhatsApp o un correo con el cliente, ¿eso reinicia los días de la alerta de 'atrasado' del documento? → **Solo los contactos con el cliente (llamada, WhatsApp, correo) reinician el conteo; las notas internas no** (igual a la recomendada)
- "Cambiar": ver la regla R1 (interpretación del comentario).

**Lo que notará el usuario:** La Solicitud, la Cotización y el Pedido tienen la misma pestaña Chatter. Ahí dejas notas internas o anotas una llamada, un WhatsApp o un correo con el cliente. Lo que guardas aparece enseguida en la Actividad, sin que la página se recargue. El panel de actividad que abres desde el Hub también trae la caja para notas rápidas, y esas notas salen dentro del historial. Si una nota no se puede guardar, el sistema te avisa y no pierdes lo escrito, aunque cambies de pestaña. El botón morado del asistente ya no tapa el botón de guardar.

**Para el usuario:** Hay un solo Chatter, igual en los tres documentos y en el panel del Hub. Sirve para notas internas y para registrar los contactos con el cliente. Deja claro que el cliente no ve estas notas, nunca pierde una nota sin avisar y todo lo que se escribe queda en el historial del documento.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
Sí, de estos ítems del Bloque 1:
- H29: usa _log(..., commit=False) y loadSolicitud({silencioso:true}) en solicitud/[id].
- H5: waUrl de frontend/src/lib/whatsapp.js para el WhatsApp con +57.
- H23: apiFetch con reintento tras el 401, para que una nota escrita con la sesión vencida se guarde sin perder el texto.
- N3: agrega NOTE_ADDED 'Motivo del rechazo (Hub)' por este mismo endpoint, que sigue permitido.
- N10: cambia get_pedido y venta/[id], que es el mismo bloque de la línea de tiempo del PVEN.
- H7+H41: cambia los textos 'Línea temporal' y 'todavía' en las mismas líneas de tiempo de COT y PVEN.
Se implementa después de integrar el Bloque 1.
```

**Cambios (diseño):**

```text
DIAGNÓSTICO (lectura del código actual): hay TRES chatters distintos y ninguno se comparte.
- SC: ChatterTab en solicitud-client.tsx. Pinta la nota antes de guardarla y tiene un catch{} vacío, así que si el POST falla parece guardada y no lo está. Dice "chatear con el cliente", pero solo guarda una nota interna. No recarga, por eso la nota no sale en Actividad hasta que se recarga la página (F5). La caja está abajo, debajo de la burbuja del asistente. Además, al cambiar de pestaña se pierde lo escrito, porque el componente se desmonta.
- COT: enviarChatter en cotizacion/[id]/page.tsx. Muestra alert() y recarga la página entera con spinner.
- PVEN: handleRegistrarNota en venta/[id]/page.tsx guarda la nota con action 'UPDATED', así que sale como "Ediciones". handleEnviarWhatsApp sí usa CHATTER.
- Hub: ActivitiesPanel en ventas/page.tsx no tiene caja para escribir y saca el CHATTER del historial ('Chatter con Cliente' aparte).
- Backend: POST /{solicitudes|cotizaciones|pedidos}/{id}/actividad acepta cualquier action, texto vacío y el user_name que mande el navegador.

BACKEND
1) NUEVO backend/app/core/chatter.py (lógica pura, sin DB):
   - TIPOS_CHATTER = {'NOTA':'Nota interna','LLAMADA':'Llamada con el cliente','WHATSAPP':'WhatsApp al cliente','CORREO':'Correo al cliente'}.
   - ACCIONES_PERMITIDAS = {'CHATTER','NOTE_ADDED'}. NOTE_ADDED sigue sirviendo para la nota 'Motivo del rechazo (Hub)' que agrega N3 del Bloque 1.
   - LEGADO = {'UPDATED':'CHATTER'}: el botón viejo de notas del pedido mandaba UPDATED. Si un navegador todavía tiene la versión vieja en caché, su nota no falla y queda como CHATTER.
   - MAX_TEXTO = 2000.
   - validar_nota(body) -> (action, texto, extra), en este orden:
     · action = str(body.get('action') or 'NOTE_ADDED').strip().upper() (el mismo valor por defecto de hoy) y se aplica LEGADO.
     · Si action no está en ACCIONES_PERMITIDAS: ValueError('Ese tipo de registro no se puede agregar a mano.').
     · texto = str(body.get('description') or '').strip(). Vacío: ValueError('Escribe la nota antes de guardarla.'). Más de 2000 caracteres: ValueError('La nota es muy larga (máximo 2000 caracteres).').
     · tipo = str(body.get('tipo') or 'NOTA').strip().upper(). Si no está en TIPOS_CHATTER: ValueError('Tipo de nota no válido.').
     · extra = {'tipo': tipo}.
   - nombre_de_usuario(user) = user.username or user.email. Es el mismo valor que AuthGuard guarda en localStorage.user_name; body.user_name deja de usarse.
   - reinicia_atraso(tipo) -> bool, según la pregunta 'atraso_por_contacto':
     · opción recomendada (2): tipo in {'LLAMADA','WHATSAPP','CORREO'};
     · opción 0: siempre False (la función y su prueba sobran);
     · opción 1: siempre True.
2) backend/app/api/v1/erp_ventas.py:
   - _log (la versión con commit de Bloque 1 H29) termina en `return log`. Los llamadores de hoy ignoran el valor.
   - NUEVA _agregar_nota(db, entidad, doc, body, user):
     · try: action, texto, extra = validar_nota(body); except ValueError as e: raise HTTPException(422, str(e)). El mensaje va como string, así apiFetch lo muestra legible.
     · log = _log(db, entidad, doc.id, doc.numero, action, texto, user_name=nombre_de_usuario(user), extra_data=extra, commit=False).
     · Si reinicia_atraso(extra['tipo']): doc.updated_at = datetime.datetime.utcnow().
     · db.flush(); d = _log_dict(log); db.commit(); return {'status':'success','data':d}. Es una sola transacción y se devuelve el renglón creado (con id y created_at con 'Z').
   - add_sc_activity, add_cot_activity y add_ven_activity: después del 404 de hoy, `return _agregar_nota(db, 'SC'|'COT'|'VEN', doc, body, user)`. Los roles no cambian (ADMIN, ASESOR, COMPRAS).
   - get_solicitud, get_cotizacion y get_pedido no cambian: _log_dict ya devuelve extra_data.

FRONTEND
3) NUEVO frontend/src/lib/chatter.js (JS puro, se prueba con node):
   - TIPOS_CHATTER. Cada tipo tiene chip, título, placeholder y texto del botón:
     · NOTA: 'Nota interna' / 'Escribe una nota interna o un seguimiento…' / 'Guardar nota'.
     · LLAMADA: 'Llamada' / título 'Llamada con el cliente' / '¿Qué hablaste con el cliente?' / 'Guardar llamada'.
     · WHATSAPP: 'WhatsApp' / 'WhatsApp al cliente' / 'Mensaje para el cliente…' / 'Abrir WhatsApp y guardar'.
     · CORREO: 'Correo' / 'Correo al cliente' / 'Mensaje del correo…' / 'Abrir correo y guardar'.
   - MAX_TEXTO_CHATTER = 2000.
   - esEntradaChatter(a): action CHATTER o NOTE_ADDED.
   - tipoChatter(a): extra_data.tipo si es conocido; si no, 'NOTA'.
   - rutaNotas(tipoDoc, id): SC → /ventas/solicitudes/{id}/actividad, COT → /ventas/cotizaciones/…, VEN → /ventas/pedidos/…; cualquier otro lanza Error.
   - validarTextoChatter(t): los mismos mensajes del backend, o null.
   - entradasChatter(actividades): solo las del chatter, la más reciente primero; desempata por id.
   - agregarActividad(doc, log): copia nueva del doc con el log al final de actividades, sin duplicar por id; si doc es null, devuelve null.
   - claveBorrador(tipoDoc, id) = 'chatter-borrador:{tipoDoc}:{id}'.
   - asuntoDocumento(tipoDoc, numero): 'Solicitud SC-…', 'Cotización COT-…' o 'Pedido PVEN-…'.
   - mailtoUrl(email, asunto, cuerpo): null si no hay email.
4) NUEVO frontend/src/app/dashboard/ventas/chatter.tsx ('use client'):
   - ComposerChatter({tipoDoc, doc, onRegistrado, compacto?}):
     · Encabezado 'Notas internas y seguimiento' y aviso 'Solo las ve tu equipo: el cliente no recibe lo que guardes aquí.' (resuelve el texto engañoso de H22).
     · Chips de tipo. WhatsApp se deshabilita si waUrl(doc.customer_phone) es null (lib/whatsapp.js de Bloque 1 H5), con el título 'El cliente no tiene teléfono registrado'. Correo se deshabilita si no hay customer_email.
     · Con Llamada y teléfono, enlace 'Llamar ahora' (tel:). Con WhatsApp o Correo, ayuda: 'Se abre WhatsApp (o tu correo) con este mensaje para que lo envíes tú; aquí queda el registro.'
     · Textarea de 3 filas, con maxLength 2000, contador desde 1800 caracteres y Ctrl/Cmd+Enter para guardar.
     · Borrador en sessionStorage con claveBorrador: se lee al montar y se escribe en cada cambio, siempre en try/catch. Si el almacenamiento falla, el chatter funciona igual, sin borrador.
     · guardar(), paso a paso:
       (a) validarTextoChatter; si hay error, se muestra en línea.
       (b) Con WHATSAPP, window.open(waUrl(phone, texto), '_blank'); con CORREO, window.open(mailtoUrl(email, asuntoDocumento(...), texto)). Va ANTES del await, porque después el navegador bloquea la ventana.
       (c) r = await apiFetch(rutaNotas(tipoDoc, doc.id), {method:'POST', body: JSON.stringify({action:'CHATTER', tipo, description: texto})}).
       (d) Si sale bien: limpia el texto y el borrador, vuelve a 'Nota interna', muestra 'Guardado' 2 s y llama onRegistrado(r?.data ?? null).
       (e) Si falla: muestra en rojo, en línea, 'No se guardó: {mensaje}. Tu texto sigue aquí; intenta de nuevo.' y conserva el texto. Si WhatsApp o el correo ya se abrieron, el botón pasa a 'Reintentar guardar' y solo repite el POST.
     · Sin alert() y sin catch vacío. El botón queda deshabilitado mientras guarda, para evitar notas dobles.
   - ListaChatter({actividades}):
     · Usa entradasChatter. Cada tarjeta lleva el icono del tipo (StickyNote, Phone, MessageCircle o Mail), el título del tipo, el texto con whitespace-pre-wrap, el autor y la fecha y hora es-CO.
     · Sin notas: 'Todavía no hay notas. Escribe la primera arriba.'
     · pb-24 al final para que la burbuja del asistente no tape la última nota.
   - ChatterDocumento({tipoDoc, doc, onRegistrado}): ComposerChatter (sticky top-0, bg-white, z-10) y debajo ListaChatter. La caja queda ARRIBA en los tres documentos, como hoy en COT y PVEN. Así la burbuja fija de GlobalAIChat (bottom-6 right-6 z-50) no tapa el botón. GlobalAIChat no se toca: es del Bloque 5.
   - EtiquetaChatter({actividad}): chip pequeño con icono y título del tipo, para las líneas de tiempo.
5) solicitud/[id]/page.tsx:
   - `<ChatterTab …/>` se reemplaza por `<ChatterDocumento tipoDoc="SC" doc={solicitud} onRegistrado={(log) => log ? setSolicitud((p:any) => agregarActividad(p, log)) : void loadSolicitud({ silencioso: true })} />`. loadSolicitud silencioso viene de Bloque 1 H29.
   - En la línea de tiempo de Actividad, si esEntradaChatter(a), se pinta <EtiquetaChatter actividad={a}/> encima de la descripción.
   - Se quita ChatterTab del import.
6) solicitud/solicitud-client.tsx: se borra ChatterTab y los imports que queden sin uso. Su único consumidor es solicitud/[id].
7) cotizacion/[id]/page.tsx:
   - cotPanelTab pasa a 'actividad'|'chatter'|'ia', y la barra queda Actividad | Chatter | IA, el mismo orden que U12 pide para la SC.
   - El bloque 'Contactar + Chatter Input Area' sale de la pestaña Actividad. Se borran enviarChatter, chatterInput y chatterSending.
   - Pestaña Chatter: `<ChatterDocumento tipoDoc="COT" doc={cotizacion} onRegistrado={(log) => log ? setCotizacion((p:any) => agregarActividad(p, log)) : loadCotizacion()} />`. Ya no sale el spinner de página en cada nota.
   - Arriba de la línea de tiempo va el enlace 'Escribir nota', que hace setCotPanelTab('chatter').
   - La línea de tiempo pinta EtiquetaChatter en las notas del chatter.
8) venta/[id]/page.tsx:
   - Los mismos cambios que en COT, con panelTab 'actividad'|'chatter'|'ia'.
   - Se borran handleRegistrarNota (guardaba la nota como 'UPDATED'), handleEnviarWhatsApp, nota y sendingNota.
   - ACTIVITY_STYLE suma CHATTER '#0891b2' y NOTE_ADDED '#3b82f6'.
   - La línea de tiempo pinta EtiquetaChatter; onRegistrado hace setPedido(p => agregarActividad(p, log)).
9) ventas/page.tsx (Hub), ActivitiesPanel:
   - ComposerChatter compacto arriba del historial, con tipoDoc=row.tipo y doc=detail (aparece cuando el detalle cargó). onRegistrado hace setDetail(p => agregarActividad(p, log)).
   - 'Historial de acciones tomadas' muestra TODAS las actividades; hoy filtra action !== 'CHATTER'. Las notas del chatter llevan EtiquetaChatter y su color (CHATTER #0891b2, NOTE_ADDED #3b82f6).
   - Se quita la sección aparte 'Chatter con Cliente'.
   - Si el GET falla (hoy hay un catch{} silencioso): 'No se pudo cargar la actividad.' con el botón 'Reintentar'.
   - La lista lleva pb-20.
   - El tooltip de la fila pasa de 'Ver Chatter & Actividad' a 'Notas y actividad'.
10) frontend/package.json: añadir `&& node tests/test_chatter.mjs` al script test.
```

**Comportamiento esperado:**

```text
- Un solo chatter, el mismo componente, en la pestaña Chatter de SC, COT y PVEN y en el panel que se abre desde el Hub (fila, menú 'Ver Historial & Chatter' y tarjeta del Kanban).
- Tipos: 'Nota interna' (por defecto), 'Llamada', 'WhatsApp' y 'Correo'. Todo se guarda como CHATTER con extra_data.tipo. Las notas viejas sin tipo se ven como 'Nota interna'.
- Al guardar, la nota aparece enseguida en la lista del Chatter y en la línea de tiempo de Actividad del mismo documento, con su etiqueta (p. ej. 'Llamada con el cliente'), autor, fecha y hora, y sin spinner de página. En el Hub sale en 'Historial de acciones tomadas'.
- El autor lo pone el servidor con el usuario de la sesión. Se ve igual que hoy (usuario o correo), pero ya no se puede falsear desde el navegador.
- Ninguna nota se pierde sin aviso:
  · si falla, sale un error en línea y el texto se conserva;
  · el borrador sobrevive a cambiar de pestaña o a cerrar y reabrir el panel dentro de la misma pestaña del navegador;
  · con la sesión vencida, el modal de Bloque 1 H23 reintenta y la nota se guarda.
- WhatsApp y Correo abren la aplicación con el mensaje, pero el envío lo hace el usuario; queda registrado 'WhatsApp al cliente' o 'Correo al cliente'. El envío automático por canal es del Bloque 3.
- La caja está arriba y la lista tiene espacio al final: la burbuja del asistente no tapa ni el botón de guardar ni la última nota, a 1440 px y a 1024 px.
- El servidor responde 422 con un mensaje en español si la nota está vacía o solo tiene espacios, si pasa de 2000 caracteres, si el tipo es desconocido o si la acción no es CHATTER ni NOTE_ADDED. UPDATED, que viene del botón viejo, se guarda como CHATTER. Si el documento no existe, responde 404.
- Las notas no se editan ni se borran: son historial.
- Se puede escribir en documentos en cualquier estado, también cancelados (p. ej. 'el cliente volvió a llamar').
- Alerta de 'atrasado', según la respuesta a la pregunta. Con la opción recomendada, una llamada, un WhatsApp o un correo registrados ponen el updated_at del documento en el momento de la nota, y la alerta roja y el '+Nd' de No Resuelto vuelven a contar desde ahí. Una nota interna no cambia nada.
```

**Pruebas (diseño):**

```text
BACKEND: nuevo backend/tests/test_chatter_notas.py. Usa los helpers _sc, _cot y _ven y auth() al estilo de test_actividad_cambios_documentos.py. Cada prueba es una función suelta, sin parametrize. Se corre desde <repo>/backend con C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe tests/rollback_runner.py test_chatter_notas. Nunca pytest completo.
1) test_validar_nota_pura: sin DB.
   - {'action':'CHATTER','description':'  Hola  ','tipo':'llamada'} → ('CHATTER','Hola',{'tipo':'LLAMADA'}).
   - Sin tipo → 'NOTA'.
   - 'UPDATED' → 'CHATTER'.
   - Lanzan ValueError: 'ESTADO_CHANGED', texto '   ', 2001 caracteres y tipo 'FAX'.
2) test_nota_de_la_sc_se_guarda_con_el_usuario_de_la_sesion(app_client, db, admin_token, user_admin).
   - POST /api/v1/ventas/solicitudes/{id}/actividad {action:'CHATTER', tipo:'LLAMADA', description:'Llamé: confirma mañana', user_name:'impostor'} → 200.
   - data.user_name == (user_admin.username or user_admin.email); data.extra_data == {'tipo':'LLAMADA'}; data.created_at termina en 'Z'.
   - GET /solicitudes/{id} incluye data.id en actividades.
3) test_nota_vacia_no_se_guarda.
   - COT: description '   ' → 422 con detail 'Escribe la nota antes de guardarla.'.
   - El conteo de ActivityLog de esa COT no cambia.
4) test_nota_muy_larga_da_422: PVEN, 2001 caracteres.
5) test_accion_del_sistema_no_se_puede_agregar_a_mano.
   - action 'ESTADO_CHANGED' → 422.
   - action 'NOTE_ADDED' sin tipo → 200 con extra_data.tipo 'NOTA' (compatibilidad con N3).
6) test_nota_vieja_del_pedido_como_updated_queda_como_chatter: POST /pedidos/{id}/actividad {action:'UPDATED', description:'Cliente pide factura'} → GET /pedidos/{id} tiene un CHATTER con ese texto y ningún UPDATED nuevo.
7) test_documento_inexistente_da_404: /cotizaciones/999999999/actividad.
8) test_asesor_puede_dejar_notas(vendedor_token, user_vendedor): 200, y user_name es el del vendedor.
9) Solo si la respuesta no es la opción 0: test_contacto_con_el_cliente_reinicia_el_atraso. SC ASIGNADA con updated_at = ahora − 10 días.
   - POST tipo 'LLAMADA' → sc.updated_at a menos de 120 s de ahora.
   - Otra SC igual con tipo 'NOTA' → updated_at sin cambio con la opción 2, o cambiado con la 1.

REGRESIÓN con el mismo runner:
- test_actividad_cambios_documentos;
- test_textos_actividad (Bloque 1);
- test_solicitud_guardado_una_transaccion (Bloque 1 H29, por el `return log` de _log).

FRONTEND:
- Nuevo frontend/tests/test_chatter.mjs (node:assert/strict):
  · esEntradaChatter: CHATTER y NOTE_ADDED sí; UPDATED y null no.
  · tipoChatter: {extra_data:{tipo:'LLAMADA'}} → 'LLAMADA'; sin extra → 'NOTA'; 'FAX' → 'NOTA'.
  · rutaNotas: 'SC', 'COT' y 'VEN' dan las tres rutas; 'XX' lanza un error.
  · validarTextoChatter: '  ' da mensaje; 2001 caracteres da mensaje; 'Hola' da null.
  · agregarActividad: no muta, agrega al final, no duplica el id y con null devuelve null.
  · entradasChatter: filtra y ordena (desempate por id).
  · claveBorrador('SC',7) === 'chatter-borrador:SC:7'.
  · mailtoUrl codifica asunto y cuerpo; sin email da null.
- `npm test` y `npx tsc --noEmit`, revisando que no aparezcan errores nuevos en chatter.tsx, solicitud/[id]/page.tsx, solicitud-client.tsx, cotizacion/[id]/page.tsx, venta/[id]/page.tsx y ventas/page.tsx (next.config ignora los errores de build).

VISUAL: capturas con Playwright, como las de la revisión, a 1440x1000 y 1024x900, de:
- la pestaña Chatter de la SC, la COT y el PVEN;
- el panel del Hub.
En el mismo script, comprobar automáticamente que el getBoundingClientRect del botón de guardar NO se cruza con el de la burbuja del asistente.

MANUAL:
- Escribir una nota, cambiar a la pestaña Actividad y volver: el borrador sigue ahí.
- Guardar: la nota aparece en las dos pestañas sin recargar.
- Con el backend apagado, guardar: sale el error en línea y el texto se conserva.
- WhatsApp abre wa.me/57… con el texto y queda registrado.
- En el Hub, una nota hecha desde el panel aparece en el historial del panel y en la Actividad del documento al abrirlo.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No se modifica ningún dato.

Consulta de solo lectura en erp_test (transacción READ ONLY, 2026-10-03):
- 1 actividad CHATTER (SC);
- 0 NOTE_ADDED;
- 0 notas de pedido guardadas como 'UPDATED' sin detalle de cambios (las 2 'UPDATED' de VEN que hay traen extra_data.cambios, así que son ediciones del sistema).

Las entradas viejas sin extra_data.tipo se muestran como 'Nota interna'.

En producción puede haber notas de pedido guardadas como 'UPDATED' por el botón viejo 'Registrar' de venta/[id]:
- siguen visibles en la Actividad como hoy, pero no aparecen en la lista del Chatter;
- no se propone corregirlas, porque no se distinguen bien de las 'UPDATED' viejas del sistema (p. ej. la propagación de re-cotización anterior a 286868d).

Si el usuario lo pide, antes se hace un conteo de solo lectura en producción y se decide.
```

**Riesgos:**

```text
- Cambia el contrato de POST /actividad. Una acción distinta de CHATTER, NOTE_ADDED o UPDATED ahora responde 422. Solo la usa este frontend (grep en el repo sin otros llamadores, sin pruebas que la usen) y N3 de Bloque 1 (NOTE_ADDED, que sigue permitida). Una integración externa no detectada fallaría.
- body.user_name se ignora. El nombre que se ve es el mismo (username o email), pero las notas de N3 (Hub), que hoy no mandan user_name, pasan de 'Sistema' al usuario real. Es una mejora.
- En COT y PVEN la caja de notas se muda de la pestaña Actividad a una pestaña Chatter. Quien la usaba ahí tiene que aprender el nuevo lugar; se mitiga con el enlace 'Escribir nota' arriba de la línea de tiempo.
- 'WhatsApp al cliente' y 'Correo al cliente' registran que se ABRIÓ la aplicación con ese mensaje, no que se envió. Los textos de ayuda lo dicen. El envío real por Chatwoot es del Bloque 3.
- El borrador vive en sessionStorage: se pierde al cerrar la pestaña del navegador y no pasa entre equipos. En privado o con el almacenamiento bloqueado, el chatter funciona igual, sin borrador.
- Si se elige reiniciar el atraso:
  · tocar updated_at saca el documento de los conteos de alertas_resumen, get_alertas, isDocAtrasado del Hub y las listas de SC y COT; es justo el efecto buscado;
  · un asesor podría anotar una llamada para quitar el rojo, pero queda a la vista en el historial;
  · la Antigüedad no cambia, porque R5 de Bloque 1 la cuenta desde created_at.
- Choques de archivo:
  · solicitud/[id]/page.tsx, cotizacion/[id]/page.tsx, venta/[id]/page.tsx y ventas/page.tsx están muy tocados por el Bloque 1; este ítem se implementa sobre el Bloque 1 ya integrado;
  · la barra de pestañas de la SC es de U12 (otro grupo), y aquí solo se cambia el contenido de la pestaña Chatter y la etiqueta en la línea de tiempo;
  · la barra Actividad | Chatter | IA de COT y PVEN la agrega este ítem, y hay que confirmar que el grupo de pantallas COT/PVEN no la rehace;
  · el Bloque 4 también tocará ventas/page.tsx (tablas y Kanban), pero ActivitiesPanel es un componente aparte.
- Ya no se usará más el wa.me armado a mano en el chatter: se usa waUrl (H5). En otras pantallas siguen las URL viejas, como dice H5.
```

**Archivos (diseño):** `backend/app/core/chatter.py`, `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_chatter_notas.py`, `frontend/src/lib/chatter.js`, `frontend/src/app/dashboard/ventas/chatter.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/tests/test_chatter.mjs`, `frontend/package.json`


### U7+U8+H12+H13 — El producto elegido o creado queda agregado y resaltado

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** Cuando eliges un producto del catálogo o pulsas «Crear producto nuevo», el producto aparece de inmediato en la lista como una tarjeta morada, igual a la del cliente, y sale un aviso verde que confirma que se creó. Ya no hay que adivinar que faltaba «+ Agregar». En cada tarjeta puedes subir o bajar la cantidad con − y +. Si el producto no está en el catálogo, escribes el nombre y pulsas «+ Agregar» o Enter: entra como «Texto libre», y el Enter ya no crea la solicitud por accidente.

**Para el usuario:** Hoy, después de «Crear producto nuevo», el producto se crea, pero la pantalla no lo confirma ni lo agrega a la lista. Además, si el nombre empieza igual que otro producto creado así (por ejemplo «Rodillo antigoteo 9in azul»), el sistema falla sin avisar. Con este cambio, todo producto elegido o creado entra directo a la lista como tarjeta morada con su cantidad editable, el sistema confirma lo que hizo y avisa cuando algo falla. Funciona igual en Solicitudes y en el Asistente Omnicanal, porque usan el mismo formulario.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
Sin choque de funciones. Se aplica sobre la versión fusionada de solicitud-client.tsx, donde el Bloque 1 T11 cambia createSolicitud (U9+H14), las etiquetas ESTADOS_SC (H7+H41) y ESTADOS_SC_MANUALES (N4). productos-solicitud.tsx lo cambia H29 (guardado sin parpadeo); aquí solo se cambia ProductSearch, con firma compatible. Usa el runner de ROLLBACK del repo (R7/T0).
```

**Cambios (diseño):**

```text
BACKEND
1) backend/app/api/v1/crm.py, quick_create_product (POST /crm/products/quick-create):
   - nombre = ' '.join(body.get('name','').split()). Si está vacío: 400 'Escribe el nombre del producto.'
   - Antes de crear, buscar un Product activo con func.lower(func.trim(Product.name)) == nombre.lower(). Si existe, devolver su primer ProductSKU (order_by id), o crearle uno si no tiene, con 'creado': False. Así no se duplican productos desde la SC, la COT (cotizacion/[id]/page.tsx handleQuickCreateProduct) ni el CRM (crm/page.tsx:382).
   - Código de SKU único. Hoy es name[:20].upper().replace(' ','-'), y el índice ÚNICO ix_product_skus_sku hace fallar a dos nombres que comparten los primeros 20 caracteres. Nuevo: base = body.get('sku') o el mismo recorte de hoy. Si el 'sku' vino explícito y ya existe: 409 f'Ya existe un producto con el código {sku}.' Si no vino: codigo = base y, mientras exista un ProductSKU con ese código, f'{base}-{n}' (n = 2, 3…).
   - except IntegrityError (sqlalchemy.exc): rollback y 409 'Otro producto con el mismo código se creó al mismo tiempo. Intenta de nuevo.' El resto de errores: 400 f'No se pudo crear el producto: {e}'.
   - La respuesta agrega 'creado': bool y 'necesita_revision' a los campos actuales (id = sku.id, product_id, product_name, sku, sale_price, display).

FRONTEND
2) NUEVO frontend/src/lib/lineas-solicitud.js (JS puro, probado con node; reutiliza normalizarBusqueda de lib/busqueda.js):
   - lineaDesdeCatalogo(p, {creado}): {product_name: p.product_name||p.name, qty: 1, unit_price_cop: 0, sku_id: p.id ?? null, _nuevo: !!creado}.
   - lineaTextoLibre(texto): {product_name: texto recortado, qty: 1, unit_price_cop: 0, sku_id: null}.
   - agregarLinea(lineas, nueva) -> {lineas, indice, fusionada}. Con el mismo sku_id suma la cantidad. Un texto libre (sin sku) con el mismo nombre normalizado también suma. Nunca muta el arreglo de entrada.
   - cambiarCantidad(lineas, i, valor): entero ≥ 1 (Math.max(1, Math.floor(Number(valor)||1))). quitarLinea(lineas, i).
   - resolverTextoEscrito(texto, resultados): el resultado cuyo nombre normalizado es IGUAL al texto, o null.
   - lineasParaEnviar(lineas, textoPendiente): quita las claves que empiezan por '_' y, si quedó texto escrito sin agregar, lo suma como texto libre. Hoy getExtras lo descarta cuando ya hay líneas; el editor del detalle (productos-solicitud.tsx guardar) sí lo guarda.
3) NUEVO frontend/src/app/dashboard/ventas/solicitud/buscador-producto.tsx: se mueve aquí ProductSearch. solicitud-client.tsx lo reexporta (export { ProductSearch } from './buscador-producto') para que productos-solicitud.tsx siga igual. Cambios:
   - onSelect pasa a (p, info?: {creado: boolean}) => void. Es compatible: productos-solicitud ignora el segundo argumento.
   - crearNuevo: si sale bien, onSelect(p.data, {creado: p.data.creado !== false}). Si falla: estado errorCrear, que se muestra en línea (rosa): 'No se pudo crear el producto: {mensaje}. Puedes agregarlo como texto libre con «+ Agregar».' Ya no hay catch silencioso.
   - Con resultados pero sin coincidencia exacta, una última fila '+ Crear «texto» en el catálogo' (llama a crearNuevo).
   - Prop opcional onAgregarTexto?: (texto, coincidencia|null) => void. Si viene, muestra el botón '+ Agregar' junto al buscador (activo cuando hay texto). onKeyDown Enter: preventDefault() siempre (el input vive dentro del <form> de la SC y el Enter la enviaba por envío implícito) y llama a onAgregarTexto(texto, resolverTextoEscrito(texto, results)).
   - Prop opcional inputRef para devolver el foco tras agregar. useEffect sobre value: si queda vacío, limpiar el temporizador, los resultados y open, para que no reaparezca una lista vieja. Contador de peticiones (patrón custReqId) para descartar respuestas obsoletas.
   - Textos: placeholder 'Buscar producto en el catálogo…' y 'Este producto no está en el catálogo.'
4) NUEVO frontend/src/app/dashboard/ventas/solicitud/lineas-producto-chips.tsx, export LineasProductoChips({lineas, onCambiarCantidad, onQuitar}). Cada línea es una tarjeta con las mismas clases del cliente elegido: 'bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2', nombre 'text-sm font-bold text-indigo-700 break-words min-w-0 flex-1' (sin truncar), y la X 'text-indigo-400 hover:text-indigo-700'. Etiquetas: _nuevo lleva una pastilla verde 'Nuevo en catálogo'; sin sku_id, una pastilla ámbar 'Texto libre' con title 'No está en el catálogo; quien cotice puede vincularlo'. Control de cantidad (H13): botón − (deshabilitado en 1), input number w-14 y botón +. Contenedor flex-wrap para el modal angosto del Asistente (max-w-lg).
5) solicitud-client.tsx, SolicitudTipoYDetalle:
   - Se eliminan prodQty y prodSku (y el bloque 'Cantidad: [n] + Agregar' de l.333-339). Se conservan prodName (texto del buscador) y productos. Nuevo estado aviso {texto} que se borra a los 6 s, con role='status'.
   - <ProductSearch value={prodName} onChange={setProdName} inputRef={ref} onSelect={(p, info) => agregar(lineaDesdeCatalogo(p, info))} onAgregarTexto={(t, c) => agregar(c ? lineaDesdeCatalogo(c) : lineaTextoLibre(t))} />.
   - agregar(linea): setProductos(l => agregarLinea(l, linea).lineas); setProdName(''); devolver el foco; aviso según el caso: creado → 'Se creó «X» en el catálogo y se agregó a la solicitud. Queda marcado para completar marca, categoría y precio después.'; existente devuelto por quick-create → '«X» ya estaba en el catálogo: se agregó.'; fusionada → '«X» ya estaba en la lista: ahora son N.'; texto libre → 'Se agregó «X» como texto libre (no está en el catálogo).'
   - La lista de l.340-347 pasa a <LineasProductoChips … /> con cambiarCantidad y quitarLinea.
   - getExtras: productos = lineasParaEnviar(productos, prodName). reset: limpia productos, prodName y aviso.
   - Ayuda: 'Elige del catálogo, créalo si no existe o agrégalo como texto libre. Sin productos la solicitud no se puede enviar al cliente ni cotizar.'
6) frontend/package.json 'test': agregar && node tests/test_lineas_solicitud.mjs (sobre la línea que deja Bloque 1).
```

**Comportamiento esperado:**

```text
- Elegir un producto del catálogo lo agrega al instante con cantidad 1 como tarjeta morada; el buscador se limpia y conserva el foco para el siguiente. Elegir de nuevo el mismo producto suma 1 a su tarjeta en vez de duplicarla.
- «Crear producto nuevo» (o '+ Crear «texto» en el catálogo' cuando hay resultados parecidos) crea el producto, lo agrega como tarjeta con la pastilla 'Nuevo en catálogo' y muestra un aviso verde. Si ya existía un producto activo con ese nombre, se usa ese y el aviso lo dice. Si la creación falla, el error se ve bajo el buscador y el texto queda escrito para agregarlo como texto libre.
- Dos productos creados rápido cuyos nombres empiezan igual ya no chocan: el segundo recibe el código BASE-2.
- '+ Agregar' o Enter agregan lo escrito: si coincide exacto con un producto del catálogo, se vincula; si no, entra como 'Texto libre'. El Enter nunca envía el formulario.
- La cantidad se cambia en la tarjeta (mínimo 1) y la X quita la línea.
- Lo escrito sin agregar también se guarda al crear la SC, aunque ya haya otras líneas (igual que en el editor del detalle). Lo que llega al backend tiene la misma forma de hoy: {product_name, qty, unit_price_cop: 0, sku_id}, sin claves internas.
- Igual en /dashboard/ventas/solicitud y en el Asistente Omnicanal (mismo SolicitudTipoYDetalle). En el editor del detalle (productos-solicitud.tsx) solo cambian el error visible al crear, la fila 'Crear en catálogo' y el Enter, que no envía nada.
```

**Pruebas (diseño):**

```text
BACKEND, con el runner de ROLLBACK (desde <repo>/backend: C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe tests/rollback_runner.py test_products_quick_create), métodos nuevos en la clase TestProductsQuickCreate, sin parametrize:
1) test_quick_create_dos_nombres_con_el_mismo_inicio_no_chocan: u = uuid[:6]; POST 'Pintura vinilo blanco galon {u}' y 'Pintura vinilo blanco cuarto {u}'. Afirma: ambos 200, product_id distintos, sku distintos, los dos empiezan por 'PINTURA-VINILO-BLANC' y data.creado es True en ambos. Falla antes del arreglo (el 2.º da 400).
2) test_quick_create_con_un_nombre_que_ya_existe_devuelve_ese_producto: POST 'Producto Repetido {u}' y luego '  producto   repetido {u} '. Afirma: el mismo product_id y el mismo id de SKU, el 2.º con creado False, y db.query(Product) con ese nombre en minúsculas cuenta 1.
3) test_quick_create_con_codigo_explicito_repetido_responde_409: dos POST con nombres distintos y el mismo 'sku': 'QC-{u}'. Afirma: el 2.º da 409 y 'Ya existe un producto con el código' está en detail.
4) test_quick_create_sin_nombre_explica_en_espanol: POST {'name':'  '} da 400 con 'Escribe el nombre del producto.'
Regresión: los 3 tests actuales del mismo módulo.
FRONTEND: NUEVO frontend/tests/test_lineas_solicitud.mjs (node:assert/strict, mismo estilo que test_busqueda.mjs):
- agregar un sku nuevo lo pone al final con fusionada false.
- el mismo sku_id suma la cantidad (1+1=2), no cambia el largo y da fusionada true.
- un texto libre 'Brocha 1/2"' frente a 'brocha 1/2"' se fusiona; un texto libre frente a una línea de catálogo con el mismo nombre NO se fusiona.
- cambiarCantidad: '0'→1, -3→1, 2.7→2, 'abc'→1, 5→5, y no muta la entrada.
- quitarLinea.
- lineasParaEnviar quita _nuevo, agrega el pendiente como {qty:1, sku_id:null, unit_price_cop:0}, ignora un pendiente de solo espacios y conserva las líneas existentes junto al pendiente (regresión del bug de getExtras).
- resolverTextoEscrito: un texto exacto sin tildes ni mayúsculas devuelve el resultado; un texto parcial devuelve null.
- lineaDesdeCatalogo acepta p.name o p.product_name.
Después: npm test y npx tsc --noEmit (sin errores nuevos en solicitud-client.tsx, buscador-producto.tsx, lineas-producto-chips.tsx, productos-solicitud.tsx ni asistente_omnicanal/page.tsx).
MANUAL (capturas de recorrido.js, pasos 08-10, antes y después): crear 'Rodillo antigoteo 9in DEMO 2' → tarjeta morada 'Nuevo en catálogo' y aviso verde; Enter con 'Cinta de enmascarar DEMO' → 'Texto libre' y el formulario no se envía; elegir dos veces el mismo producto → cantidad 2; − y +; crear la SC y ver en el detalle las cantidades y el vínculo al catálogo. Repetir en el Asistente Omnicanal.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No se corrigen datos. Consulta de solo lectura en erp_test (2026-10-03): existe el índice ÚNICO ix_product_skus_sku. Hay 2 productos creados rápido (necesita_revision) con los códigos RODILLO-ANTIGOTEO-9I y TALADRO-PERCUTOR-750; hoy un tercero que empiece igual ('Rodillo antigoteo 9in azul') fallaría sin avisar. Los productos y las SC ya creados no cambian.
```

**Riesgos:**

```text
- Elegir del catálogo agrega de una vez: quien necesita más de 1 unidad la ajusta en la tarjeta (antes la escribía antes de agregar).
- Las líneas del mismo producto se suman. La SC no tiene campos por línea que justifiquen dos líneas iguales.
- quick-create reutiliza el producto activo con el mismo nombre también desde el CRM y la COT: esas líneas quedan vinculadas al existente en vez de crear un duplicado. Un producto inactivo con ese nombre no se reutiliza.
- El Enter del buscador deja de enviar el formulario. Es un cambio de comportamiento a propósito (antes podía crear la SC por accidente).
- Mover ProductSearch a su propio archivo exige el reexport para no romper productos-solicitud.tsx, que también cambia H29 del Bloque 1.
- solicitud-client.tsx también lo tocan el Bloque 1 (T11) y H11/H10 de este grupo. Orden sugerido: Bloque 1 → H11 → este ítem → H10.
```

**Archivos (diseño):** `backend/app/api/v1/crm.py`, `backend/tests/test_products_quick_create.py`, `frontend/src/lib/lineas-solicitud.js`, `frontend/tests/test_lineas_solicitud.mjs`, `frontend/src/app/dashboard/ventas/solicitud/buscador-producto.tsx`, `frontend/src/app/dashboard/ventas/solicitud/lineas-producto-chips.tsx`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/package.json`


### H11 — Cliente nuevo con el nombre ya escrito, sin perder la solicitud

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** Al pulsar «Agregar cliente», el formulario del cliente nuevo ya trae el nombre, el teléfono o el correo que escribiste en el buscador. La solicitud que estabas llenando (productos, notas) sigue detrás, intacta. Si cancelas, vuelves a ella tal como estaba. También puedes crear un cliente nuevo aunque el buscador muestre clientes parecidos, y si el correo ya existe, el aviso sale dentro del mismo formulario.

**Para el usuario:** Hoy, «Agregar cliente» abre el alta vacía aunque ya escribiste el nombre. Además cierra el formulario de la solicitud: si ya habías agregado productos, se pierden, y si cancelas el alta, la solicitud desaparece. Con este cambio, el alta se abre encima de la solicitud con lo que escribiste. Es un solo selector de cliente que comparten la página de Solicitudes y el Asistente Omnicanal.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
U9+H14 toca la misma función createSolicitud de solicitud-client.tsx: ellos cambian lo que pasa después del POST (navegar a la SC y el número en el lead) y este ítem cambia la rama sin cliente del inicio. Se aplica sobre la versión fusionada.
```

**Cambios (diseño):**

```text
FRONTEND
1) NUEVO frontend/src/lib/cliente-desde-busqueda.js (JS puro):
   - datosInicialesCliente(texto) -> {first_name, last_name: '', phone, email}. Con '@': email (recortado y en minúsculas). Si solo hay dígitos o + ( ) - y espacios: los dígitos sin un 57 inicial cuando son 12; si quedan 10 dígitos que empiezan por '3' (celular) o '60' (fijo), van a phone. Cualquier otro número (cédula, NIT) no se pone en ningún campo. Si no: first_name = el texto con los espacios colapsados (no se adivina cuál es el apellido).
   - nombreCliente(c): c.name || c.full_name || `${first_name} ${last_name}`.trim().
2) NUEVO frontend/src/app/dashboard/ventas/solicitud/selector-cliente.tsx:
   - Se mueve aquí NewClientModal desde solicitud-client.tsx, que lo reexporta para no romper el import del Asistente. Cambios en el modal:
     - prop textoInicial?: string. El useState inicial sale de datosInicialesCliente(textoInicial).
     - Debajo de Nombre, si vino prellenado: 'Tomado del buscador: puedes separarlo en nombre y apellido.'
     - save: e.preventDefault() y también e.stopPropagation(), porque el modal se renderiza en un portal y en React el submit burbujea al <form> de la SC.
     - El alert() se cambia por un error en línea (rosa) dentro del modal, que sigue abierto, p. ej. 'Ya existe un cliente registrado con ese correo.' del backend.
     - El modal se renderiza con createPortal(…, document.body) para quedar encima del modal de la SC (los dos son z-50) y no anidar un <form> dentro de otro.
   - export SelectorClienteSC({cliente, onCliente}):
     - Estado interno: texto, resultados, búsqueda hecha, contador de peticiones (el mismo patrón custReqId/scCustReqId de hoy) y mostrarAlta.
     - Sin cliente: input 'Buscar por nombre, teléfono o correo…' y una lista de resultados (nombre y teléfono o correo) con una última fila '+ Agregar «texto» como cliente nuevo'. Si no hay resultados: el recuadro ámbar 'No encontramos «texto». ¿Es un cliente nuevo?' con el botón 'Agregar cliente'.
     - Con cliente: SOLO la tarjeta índigo de hoy (nombreCliente, teléfono en pequeño y X para cambiar), igual que hoy en el Asistente; ya no se ve el input repetido encima.
     - Alta: <NewClientModal textoInicial={texto} onSave={c => { onCliente(c.data ?? c); cerrar }} onClose={cerrar} />, sin cerrar el modal de la SC.
3) solicitud-client.tsx (SolicitudClient):
   - Se reemplazan los estados custSearch/custResults/custSearchDone/showNewClient/custTimer/custReqId, onCustSearch y el bloque 'Cliente *' del modal de creación (l.1916-1943) por <SelectorClienteSC cliente={selectedCust} onCliente={c => { setSelectedCust(c); if (c) showToast('Cliente creado y seleccionado') }} />. El toast solo sale cuando viene del alta: onCliente recibe un segundo argumento {nuevo: true}.
   - Se quita el render de NewClientModal de l.1052 y el setShowCreate(false)/setShowCreate(true) alrededor del alta.
   - createSolicitud, rama sin cliente (l.968-974): solo showToast('Elige un cliente o agrega uno nuevo: no se puede crear la solicitud sin cliente.', 'err'). Hoy esa rama abría NewClientModal DETRÁS del modal de la SC (se renderiza antes en el DOM y los dos son z-50), así que no se veía nada.
   - resetCreateForm: setSelectedCust(null). El estado interno del selector se reinicia porque el modal se desmonta al cerrarse.
4) asistente_omnicanal/page.tsx: se reemplaza el bloque 'Cliente Vinculado *' (l.783-840) por <SelectorClienteSC cliente={scCustomer} onCliente={setScCustomer} />. Se quitan scCustQuery/scCustResults/scCustSearchDone/scShowNewClient, onScCustSearch y el NewClientModal de l.891-902. En handleCreateSc (l.266-274), sin cliente: setScError('Elige un cliente o agrega uno nuevo…') en vez de cerrar el modal. El cliente que ya viene resuelto del chat sigue llegando por scCustomer.
5) frontend/package.json 'test': && node tests/test_cliente_desde_busqueda.mjs.
BACKEND: sin cambios. POST /crm/customers ya devuelve 400 con correo repetido y create_solicitud completa teléfono, correo y dirección desde la ficha cuando llega customer_id.
```

**Comportamiento esperado:**

```text
- Escribir 'DEMO Pinturas La Brocha' → 'Agregar cliente' → el alta abre ENCIMA de la solicitud con Nombre = 'DEMO Pinturas La Brocha'. Con '3009990002' o '+57 300 999 0002' se llena Teléfono; con 'demo@example.com', Correo.
- Guardar: el cliente queda elegido en la tarjeta índigo y la solicitud conserva tipo, modalidad, productos ya agregados, asesor y notas.
- Cancelar o cerrar el alta: vuelves a la solicitud abierta, sin perder nada.
- Si el buscador encuentra clientes parecidos pero ninguno es el correcto, la última fila permite crear uno nuevo con el texto escrito.
- Un correo repetido muestra el error dentro del alta; no se crea nada y no hay alert() del navegador.
- 'Crear Solicitud' sin cliente muestra el mensaje y no abre nada oculto.
- Igual en Solicitudes y en el Asistente Omnicanal (mismo componente).
```

**Pruebas (diseño):**

```text
FRONTEND: NUEVO frontend/tests/test_cliente_desde_busqueda.mjs:
- 'DEMO Pinturas La Brocha' → first_name igual, y last_name, phone y email vacíos.
- '  ana   maria ' → 'ana maria'.
- '3009990002', '+57 300 999 0002' y '300-999-0002' → phone '3009990002' con first_name vacío.
- '6041234567' → phone.
- '1020304050' (cédula) → todo vacío.
- 'Demo.Pinturas@Example.com' → email 'demo.pinturas@example.com'.
- '' y null → todo vacío.
- nombreCliente con {name}, {full_name} y {first_name,last_name}.
Después: npm test y npx tsc --noEmit (solicitud-client.tsx, selector-cliente.tsx y asistente_omnicanal/page.tsx sin errores nuevos).
MANUAL (pasos 04-07 de recorrido.js, antes y después):
(a) cliente inexistente → 'Agregar cliente' → Nombre prellenado;
(b) agregar 2 productos ANTES de crear el cliente → siguen ahí después de guardarlo;
(c) cancelar el alta → la SC sigue abierta;
(d) guardar el alta NO crea la SC (comprobar que no hay POST /ventas/solicitudes en Network; es la prueba del stopPropagation);
(e) correo repetido → error dentro del modal;
(f) lo mismo desde el Asistente Omnicanal con y sin cliente resuelto por el chat.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No aplica: no cambia datos ni endpoints.
```

**Riesgos:**

```text
- El alta va en un portal: si se olvida el stopPropagation, guardar el cliente dispararía la creación de la SC. La prueba manual (d) lo cubre.
- Al pulsar 'Crear Solicitud' sin cliente ya no se abre el alta sola (hoy se abría oculta detrás). Ahora sale un mensaje y el recuadro 'Agregar cliente' sigue visible.
- Permitir crear un cliente aunque haya parecidos puede generar duplicados por nombre. El correo repetido sigue bloqueado en el backend.
- Con cliente elegido ya no se ve el input con el nombre encima de la tarjeta (queda solo la tarjeta, como en el Asistente); la pantalla 07 cambia un poco.
- El Bloque 1 (U9+H14) cambia createSolicitud después del POST; aquí solo cambia la rama sin cliente del inicio.
```

**Archivos (diseño):** `frontend/src/lib/cliente-desde-busqueda.js`, `frontend/tests/test_cliente_desde_busqueda.mjs`, `frontend/src/app/dashboard/ventas/solicitud/selector-cliente.tsx`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/asistente_omnicanal/page.tsx`, `frontend/package.json`


### H9 — «Nueva Solicitud» abre al instante

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** Al pulsar «Nueva Solicitud» en el Hub, el botón muestra «Abriendo…» de inmediato y el formulario aparece sin pasar por la pantalla intermedia «Redirigiendo…». Mientras carga ves un indicador, no una pantalla quieta.

**Para el usuario:** Hoy el botón del Hub va primero a una página que solo redirige y luego a la lista, que abre el formulario. Son dos saltos y durante ~3 segundos nada indica que algo está pasando. Con este cambio el botón va directo, da señal de carga al instante y la lista muestra un esqueleto mientras se prepara.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
U9+H14: este ítem depende de que solicitud-client.tsx consuma ?new=1 y limpie la URL (window.history.replaceState), cosa que hace U9. El enlace directo a ?new=1 es compatible con eso. El Hub (ventas/page.tsx) es de T9 del Bloque 1 (N3, N2, N5, H2-H5, etc.); se aplica sobre la versión fusionada y solo cambia el Link del PageHeader.
```

**Cambios (diseño):**

```text
FRONTEND
1) NUEVO frontend/src/components/ui/ContenidoEnlace.tsx ('use client'), exportado en components/ui/index.ts: ContenidoEnlace({icon, children, textoPendiente = 'Abriendo…'}). Usa useLinkStatus() de next/link (disponible en Next 16.3.1): con pending muestra Loader2 animate-spin y textoPendiente; si no, el ícono y children. Se debe renderizar como hijo de <Link>.
2) frontend/src/app/dashboard/ventas/page.tsx (Hub), acciones del PageHeader (l.578-581): <Link href='/dashboard/ventas/solicitud?new=1' aria-label='Nueva solicitud' …><ContenidoEnlace icon={Plus}>Nueva Solicitud</ContenidoEnlace></Link>. Va directo a la lista con ?new=1, sin pasar por /solicitud/nueva.
3) NUEVO frontend/src/app/dashboard/ventas/solicitud/CargandoSolicitudes.tsx: esqueleto liviano sin datos (barra del título, dos filas grises y el spinner 'Cargando…').
4) NUEVO frontend/src/app/dashboard/ventas/solicitud/loading.tsx: export default () => <CargandoSolicitudes />. En el build de producción Next lo precarga y lo muestra apenas empieza la navegación.
5) frontend/src/app/dashboard/ventas/solicitud/page.tsx: el fallback del Suspense pasa a <CargandoSolicitudes />.
6) frontend/src/app/dashboard/ventas/solicitud/nueva/page.tsx: se mantiene por los enlaces viejos (router.replace a ?new=1), pero muestra <CargandoSolicitudes /> en vez de 'Redirigiendo...'.
7) Sin cambios en solicitud-client.tsx: el efecto de ?new=1 lo reescribe el Bloque 1 (U9+H14: abre el formulario y limpia la URL), y este ítem lo usa tal cual. El modal se abre al montar, sin esperar la carga de la lista.
BACKEND: sin cambios.
```

**Comportamiento esperado:**

```text
- Clic en 'Nueva Solicitud' (Hub): en <100 ms el botón cambia a spinner + 'Abriendo…'. Luego se ve el esqueleto de la lista y el formulario abierto, con la URL limpia (lo hace U9 del Bloque 1).
- En el build de producción el formulario debe quedar visible en menos de 1 s desde el clic. En modo desarrollo la primera compilación de la ruta puede tardar, pero el botón ya da señal de inmediato.
- Los enlaces viejos a /dashboard/ventas/solicitud/nueva siguen funcionando, con el esqueleto en vez del texto 'Redirigiendo...'.
- loading.tsx también cubre la apertura del detalle /solicitud/[id] con el mismo esqueleto genérico.
```

**Pruebas (diseño):**

```text
FRONTEND: npx tsc --noEmit sin errores nuevos en ventas/page.tsx, ContenidoEnlace.tsx y en solicitud/loading.tsx, page.tsx y nueva/page.tsx; npm test sigue verde. Sin prueba node: no hay lógica pura.
MEDICIÓN (recorrido.js con playwright-core, contra el build de producción (npm run build && npm start en un puerto aparte; no se toca el servidor de desarrollo del usuario) y contra el de desarrollo):
- tiempo desde el clic en 'Nueva Solicitud' hasta que el texto 'Nueva Solicitud de Cliente' está visible: antes y después; meta < 1 s en producción;
- captura a los 150 ms del clic con el botón en estado 'Abriendo…';
- F5 sobre la lista con el formulario abierto no lo vuelve a abrir (esto lo da U9 del Bloque 1);
- abrir /dashboard/ventas/solicitud/nueva a mano sigue abriendo el formulario.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No aplica.
```

**Riesgos:**

```text
- En desarrollo, la compilación bajo demanda de Next sigue costando segundos la primera vez; la mejora completa se ve en producción. Por eso la señal inmediata está en el botón y no solo en loading.tsx.
- loading.tsx en /solicitud se muestra también al abrir un detalle. El texto es genérico ('Cargando…') para que sirva en ambos casos.
- El Bloque 4 estandarizará los encabezados y botones del Hub (U10/U3); ContenidoEnlace queda disponible para reutilizarse allí.
- El archivo del Hub tiene muchos cambios del Bloque 1 (T9); aquí solo cambia el Link del encabezado.
```

**Archivos (diseño):** `frontend/src/components/ui/ContenidoEnlace.tsx`, `frontend/src/components/ui/index.ts`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/app/dashboard/ventas/solicitud/CargandoSolicitudes.tsx`, `frontend/src/app/dashboard/ventas/solicitud/loading.tsx`, `frontend/src/app/dashboard/ventas/solicitud/page.tsx`, `frontend/src/app/dashboard/ventas/solicitud/nueva/page.tsx`


### H10 — Formulario y alta de cliente con tildes, y anticipo a la vista

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** Todo el formulario de solicitud y el alta de cliente se leen con tildes: «Cotización de producto», «Soporte técnico», «Devolución de producto», «Crédito 30 días», «Días de vencimiento», «Teléfono», «Dirección», «catálogo». Al elegir la modalidad de pago verás de una vez cuánto anticipo se pedirá: Contado, 100% antes del pedido; 60/40, 60%; Crédito, sin anticipo. Lo que ya está guardado no cambia, así que filtros, reportes y cálculos siguen igual.

**Para el usuario:** Los textos del formulario salen sin tilde porque varios son los mismos valores que se guardan. Aquí solo se cambia cómo se muestran; lo guardado queda igual para no romper filtros ni el cálculo del anticipo. En la revisión del Bloque 1 ya respondiste «Sí, ahora» a mostrar tipos y modalidades con tilde, y este ítem lo hace. También se arregla un aviso del formulario de devoluciones que prometía ajustes automáticos que el sistema no hace.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
H7+H41: el usuario respondió 'tildes_valores: Sí, ahora' (mostrar tipos y modalidades con tilde), pero el diseño de H7+H41 (T12) no trae ningún cambio concreto para eso. Este ítem lo implementa; si T12 ya lo hubiera hecho, se reutiliza su helper en vez de crear otro. H7+H41 también cambia las etiquetas de ESTADOS_SC en el mismo archivo (no se repiten aquí). H36+H43 y R2: el panel de anticipo refleja su mapa de % (Contado 100, 60/40 60, Crédito 0, Otro/vacío 60), y los valores guardados no cambian para que su prefijo 'Cr' siga funcionando. R3: la frase 'se puede ajustar a mano con una nota'.
```

**Cambios (diseño):**

```text
FRONTEND
1) NUEVO frontend/src/lib/etiquetas-solicitud.js (JS puro):
   - Se mueven aquí TIPOS_SC y MODALIDADES_PAGO con sus valores EXACTOS de hoy. solicitud-client.tsx los reexporta (export { TIPOS_SC, MODALIDADES_PAGO } from '@/lib/etiquetas-solicitud') para que [id]/page.tsx siga igual.
   - ETIQUETAS_TIPO_SC (Object.freeze): 'Cotizacion de Producto'→'Cotización de producto', 'Seguimiento'→'Seguimiento', 'Programar Entrega'→'Programar entrega', 'Devolucion de Producto'→'Devolución de producto', 'Soporte Tecnico'→'Soporte técnico', 'Nuevo Lead'→'Nuevo lead'.
   - etiquetaTipoSC(v): '' si viene vacío, la etiqueta del mapa, o v tal cual si es desconocido.
   - etiquetaModalidad(v): normaliza sin tildes ni mayúsculas. Lo que empieza por 'cr' o contiene 'credito' → `Crédito ${n} días` si trae número ('Credito 30 dias', 'Credito 30 Dias' de la agenda, 'Credito 30d' de compras), o 'Crédito' si no. '60/40' → '60/40 (60% de anticipo y 40% al entregar)'. 'contado' → 'Contado'. 'otro' → 'Otro'. Cualquier otro valor se devuelve igual.
   - pctAnticipoDeModalidad(v): espejo de backend/app/core/ventas_dinero.py pct_anticipo_de_modalidad (R2): crédito 0, 60/40 60, contado 100 y null si no lo reconoce.
2) solicitud-client.tsx, SolicitudTipoYDetalle (solo textos visibles; value= no cambia):
   - Selects de tipo y modalidad: <option value={t}>{etiquetaTipoSC(t)}</option> y <option value={m}>{etiquetaModalidad(m)}</option>.
   - El panel de anticipo, que hoy solo sale con 60/40 (l.321-326), sale para toda modalidad cuando el tipo es Cotización. pct = pctAnticipoDeModalidad(m) ?? 60 (R2: 'Otro' o vacío → 60). Dos casillas: 'Anticipo antes del pedido {pct}%' y 'Saldo {100-pct}%'. Una frase: Contado → 'El cliente paga todo antes de crear el pedido de venta.'; 60/40 → 'El 40% restante se paga al entregar.'; Crédito → 'Sin anticipo: el cliente paga según el plazo.'; Otro → 'Se pedirá un anticipo del 60%.' Remate: 'En la cotización se puede ajustar a mano con una nota.' (R3).
   - 'Dias Vencimiento' → 'Días de vencimiento'. Placeholder de Seguimiento 'Número, cliente o producto…'.
   - Envío: 'Datos de envío', 'Cédula', 'Teléfono', 'Tipo de envío', 'Dirección', 'Pedido(s) de venta (PVEN)', 'Enviar resumen:'. Mensaje de WhatsApp '…será enviado por…'. Asunto del correo 'Información de envío' y cuerpo con 'Cédula'/'Dirección'.
   - Devolución: 'Datos de devolución', 'Pedido de venta (PVEN)', 'Pedido de compra (PEC)', 'Motivo de la devolución'. Opciones 'Daño menor: ajustar el precio de venta', 'Daño total: ajuste negativo de inventario', 'Producto incorrecto', 'El cliente cambió de decisión' (se conservan 'menor' y 'total', que usan los includes). 'Pruebas (enlaces a imágenes o descripción)' y su placeholder con tilde.
   - El recuadro 'Logica de backend:' cambia a texto honesto: 'Queda anotado en la solicitud: ajustar el margen del pedido {devVen}' / '…ajuste negativo de inventario del pedido de compra {devPec}', más la línea 'El ajuste no se hace solo: hazlo desde el pedido o desde Compras.' Se verificó que ningún código del backend lee la nota DEVOLUCION.
   - Soporte: opciones 'Garantía' y 'Problema con el pedido o el envío'. tipo_problema es texto libre de solo lectura y nada lo compara (grep backend y frontend). Placeholders 'Descripción del problema' y 'Descripción de la evidencia…'.
3) solicitud-client.tsx:
   - Subtítulo del modal de creación: 'El número de la solicitud se asigna al crearla.'
   - TipoBadge: muestra etiquetaTipoSC(tipo) || 'Sin tipo'; el mapa de colores sigue con las claves guardadas.
   - Tarjeta de 'Análisis por tipo' (l.1636): {etiquetaTipoSC(tipo)}.
4) selector-cliente.tsx (NewClientModal, ver H11): etiquetas 'Teléfono', 'Correo' y 'Dirección'; subtítulo 'Completa los datos del cliente nuevo para continuar.' Si H11 no se implementa, los mismos cambios van en NewClientModal de solicitud-client.tsx.
5) ProductSearch: sus textos ('catálogo', 'no está') los trae U7+U8+H12+H13.
6) solicitud/[id]/page.tsx, coordinado con el grupo detalle-sc: opciones del select de edición (l.621) {f.k==='tipo_solicitud' ? etiquetaTipoSC(o) : etiquetaModalidad(o)} y 'Modalidad Pago' de solo lectura (l.648) con etiquetaModalidad.
7) frontend/package.json 'test': && node tests/test_etiquetas_solicitud.mjs.
BACKEND: sin cambios. Los valores guardados y las comparaciones (=== 'Soporte Tecnico', 'Devolucion de Producto' y el prefijo 'Cr' de R2) quedan intactos.
```

**Comportamiento esperado:**

```text
- Los desplegables muestran 'Cotización de producto', 'Soporte técnico', 'Crédito 30 días', etc., pero envían y guardan los mismos valores de hoy ('Cotizacion de Producto', 'Credito 30 dias'). Los filtros por tipo, la pestaña Soporte, la regla de anticipo del Bloque 1 y el lead del CRM no cambian.
- Una SC con un valor viejo o distinto ('Credito 30 Dias' de la agenda) también se muestra con tilde. Un valor desconocido se muestra tal cual.
- Al elegir la modalidad se ve el % de anticipo que pedirá la cotización, el mismo que calcula el backend.
- TipoBadge sale con tilde en la lista y en el detalle.
- Ningún texto visible del formulario ni del alta de cliente queda sin tilde.
```

**Pruebas (diseño):**

```text
FRONTEND: NUEVO frontend/tests/test_etiquetas_solicitud.mjs:
1) Los valores guardados no cambian: assert.deepEqual(TIPOS_SC, ['Cotizacion de Producto','Seguimiento','Programar Entrega','Devolucion de Producto','Soporte Tecnico','Nuevo Lead']) y lo mismo con MODALIDADES_PAGO. Protege los filtros y la R2.
2) etiquetaTipoSC de los 6 tipos; un tipo desconocido se devuelve igual; null da ''.
3) etiquetaModalidad: 'Credito 30 dias'→'Crédito 30 días', 'Credito 30 Dias'→'Crédito 30 días', 'Crédito 60 Días'→'Crédito 60 días', 'Credito 30d'→'Crédito 30 días', '60/40 (60% anticipo - 40% pendiente)'→'60/40 (60% de anticipo y 40% al entregar)', 'Contado'→'Contado', 'Otro'→'Otro'.
4) Paridad con el backend (mismos casos que test_anticipo_modalidad.test_pct_anticipo_de_modalidad): '60/40 (60% anticipo - 40% pendiente)'→60, 'Contado'→100, 'Credito 30 dias'→0, 'Crédito 60 Días'→0, None→null, 'Otro'→null.
Después: npm test y npx tsc --noEmit.
MANUAL: captura del paso 03 antes y después, más los formularios de Programar entrega, Devolución y Soporte. Barrido de 'numero|asignara|Dias|catalogo|esta en|Telefono|Direccion|Cedula|Envio|Devolucion|Garantia|Logica|afectara|ajustara|sera' sobre los textos visibles de SolicitudTipoYDetalle, NewClientModal y el modal de creación: 0 coincidencias fuera de value=/claves.
BACKEND: no aplica (sin cambios). Regresión opcional con el runner de ROLLBACK de test_anticipo_modalidad, para confirmar que los valores guardados siguen dando 100/60/0.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No se tocan. Consulta de solo lectura en erp_test (2026-10-03): las 6 SC tienen tipo 'Cotizacion de Producto' y modalidad '60/40 (60% anticipo - 40% pendiente)' (4) o 'Contado' (2). Siguen funcionando porque solo cambia la etiqueta.
```

**Riesgos:**

```text
- Solo cambian etiquetas. Fuera de este grupo hay pantallas que siguen mostrando el valor crudo hasta que usen el helper: el Hub, el 'sc_modalidad_pago' de la COT del Bloque 1 ('0% · Credito 30 dias'), el panel IA y el 'Formato de confirmación' (l.596-597), la página pública y la Actividad del backend ('Modalidad de pago: Contado → Credito 30 dias', en cambios_documento). Queda anotado para cot-pven-pantallas, detalle-sc y el Bloque 3.
- pctAnticipoDeModalidad es una copia en el frontend de la regla R2 y puede desalinearse si cambia el backend. La prueba 4 usa exactamente los casos del backend.
- Cambian los textos de dos campos libres que se guardan tal cual (motivo de devolución en la nota, tipo_problema). Se verificó que solo se comparan con includes('menor'/'total'), y esos se conservan.
- Las etiquetas de estado de la SC ('Pend. confirmación', etc.) las cambia H7+H41 del Bloque 1 en solicitud-client.tsx:43-45; aquí no se repiten.
- solicitud/[id]/page.tsx también es del grupo detalle-sc (H21) y tiene hunks sin commitear de otra sesión: aplicar solo las dos líneas indicadas.
```

**Archivos (diseño):** `frontend/src/lib/etiquetas-solicitud.js`, `frontend/tests/test_etiquetas_solicitud.mjs`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/ventas/solicitud/selector-cliente.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/package.json`


### U19+U21 — Anticipo de cada producto en la cotización

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** En la cotización, debajo del precio de cada producto, vas a ver cuánto anticipo le toca a ese producto, por ejemplo «Anticipo 60%: $744.368». Si la cotización todavía no tiene precios, o es a crédito, ese renglón dice $0. Si sumas el anticipo de todos los productos, da exactamente el anticipo total que aparece abajo, junto al total.

**Para el usuario:** Cada producto de la cotización muestra su parte del anticipo, en pesos enteros, con el mismo porcentaje que se aplica a toda la cotización: el de la modalidad de pago de la solicitud (60/40 = 60%, Contado = 100%, Crédito = 0%) o el que el asesor ajustó a mano con nota. Si el anticipo es 0, el producto muestra $0. La suma de las líneas da siempre el anticipo total de abajo, sin un peso de más ni de menos. Si hay descuento global, el anticipo de cada producto se calcula sobre su valor con descuento. Nada se guarda aparte: se calcula cada vez que abres la cotización, así que nunca queda un valor viejo.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
H36+H43 (pct_anticipo_cotizacion, anticipo_requerido y los renglones Anticipo requerido/Saldo de TOTALES en cotizacion/[id]; aquí se cambia su fuente a anticipo_requerido), R3 (anticipo manual: el % de las líneas es el manual), H42 (ventas_dinero.redondear_peso y pesos.js/formatoPesos), N1/R6 (get_cotizacion ya calcula requerido; se usa la misma variable). Va después de la T3 y la T10 del Bloque 1.
```

**Cambios (diseño):**

```text
REGLA DE REPARTO (decidida): método del mayor residuo, NO 'el residuo a la última línea'.
- anticipo_total = anticipo_requerido de la COT (Bloque 1: round(total × pct/100), pct de la modalidad R2 o manual R3).
- Peso de cada línea = su total en pesos (total_cop; si falta, unit_price_cop × qty), redondeado al peso y nunca negativo. Se reparte en proporción a ese peso. Como el descuento es global y proporcional, repartir por el valor antes del descuento da la misma proporción que hacerlo después, sin redondear dos veces.
- exacto_i = anticipo_total × peso_i / Σpesos (Decimal). base_i = piso(exacto_i). faltan = anticipo_total − Σbase_i (entero entre 0 y n−1). Se suma $1 a las 'faltan' líneas con mayor parte decimal; en empate gana la que va primero.
- Por qué no 'a la última línea': con varias líneas la última puede absorber varios pesos y, si es un producto barato, se ve raro. Con el mayor residuo cada línea queda a menos de $1 de su parte exacta, la suma cuadra siempre, el resultado es determinista, una línea en $0 recibe $0, y con 100% y sin descuento cada línea da exactamente su total.

BACKEND
1) backend/app/core/ventas_dinero.py (archivo del Bloque 1), dos funciones puras nuevas:
   - monto_linea(producto) -> Decimal: 0 si no es dict; si total_cop no es None, max(0, redondear_peso(total_cop)); si no, max(0, redondear_peso(Decimal(str(unit_price_cop or 0)) × Decimal(str(qty or 0)))). Captura ValueError e InvalidOperation y devuelve 0 (dato viejo no numérico).
   - repartir_anticipo_por_linea(montos, anticipo) -> list[Decimal]: la regla de arriba. Devuelve una lista de ceros (del mismo largo) si anticipo <= 0 o Σmontos <= 0, y [] si no hay líneas.
2) backend/app/api/v1/erp_ventas.py get_cotizacion: justo después de calcular `requerido` (bloque H36/N1/R6 del Bloque 1), agregar d['anticipo_por_linea'] = [float(a) for a in repartir_anticipo_por_linea([monto_linea(p) for p in (cot.productos or [])], requerido)]. Es una lista paralela a d['productos'], en el mismo orden. NO se mete dentro de cada producto: handleQuickCreateProduct (cotizacion/[id]/page.tsx) reenvía cotizacion.productos completo en el PATCH y el valor quedaría guardado en el JSON, viejo. Tampoco va en _cot_dict, para no calcularlo por cada fila del listado.

FRONTEND
3) frontend/src/lib/pesos.js (Bloque 1): export formatoPct(v): número finito → redondeado a 2 decimales; entero sin decimales ('60%'); con decimales y coma ('12,5%', '33,33%'); null/NaN → '0%'.
4) frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx, tarjeta de cada producto (productos.map, bloque derecho 'text-right shrink-0'): debajo del total de la línea, un tercer renglón cuando Array.isArray(cotizacion?.anticipo_por_linea): <p className='text-sm font-bold'> 'Anticipo {formatoPct(cotizacion.anticipo_pct)}: {fCOP(cotizacion.anticipo_por_linea[idx] ?? 0)}', en text-emerald-700 si es > 0 y en text-slate-500 si es 0 (se ve '$0').
5) Mismo archivo, TOTALES (los renglones 'Anticipo requerido (pct% · modalidad)' y 'Saldo' que agrega H36+H43): usar cotizacion.anticipo_requerido en lugar de cotizacion.anticipo_cop, y Saldo = total_cop − anticipo_requerido. Así la suma de las líneas y el renglón de abajo salen del mismo número que N1 exige al crear el pedido. Agregar debajo, en text-[11px] text-slate-400: 'El anticipo de cada producto suma el anticipo total.' El renglón del anticipo va en text-sm font-bold text-emerald-700 y su valor en text-base font-black, para que no quede chico (misma queja que U24).
```

**Comportamiento esperado:**

```text
- Cada línea: anticipo = su parte proporcional del anticipo requerido, en pesos enteros. Σ líneas == anticipo_requerido, siempre.
- COT sin precios (BORRADOR recién creada) o a crédito: todas las líneas muestran $0.
- Con anticipo manual (R3) se usa el % manual; con modalidad, el % de la modalidad. El % que se ve en cada línea es el mismo de TOTALES.
- Se recalcula en cada GET: al re-cotizar, cambiar la modalidad o ajustar el anticipo a mano, la próxima carga ya muestra los valores nuevos.
- Ejemplo del recorrido, con precios del Bloque 1: líneas 1.240.614 + 468.000 + 132.000 = 1.840.614, 60/40 → anticipo 1.104.368 → 744.368 + 280.800 + 79.200 (cuadra sin residuo).
- Ejemplo con residuo: tres líneas de 100.001 al 60% → anticipo 180.002 → 60.001 + 60.001 + 60.000.
- Con descuento: líneas 1.000.000 y 500.000, 10% de descuento, 60% → total 1.350.000, anticipo 810.000 → 540.000 y 270.000.
- Una línea nunca recibe más anticipo que su propio valor (pct ≤ 100).
```

**Pruebas (diseño):**

```text
BACKEND, archivo nuevo backend/tests/test_anticipo_por_linea.py. Solo con el runner de ROLLBACK: python tests/rollback_runner.py test_anticipo_por_linea. Sin parametrize: los casos van en listas dentro de cada prueba.
- test_repartir_sin_residuo: [1240614, 468000, 132000] con 1104368 → [744368, 280800, 79200].
- test_repartir_el_residuo_va_a_los_mayores_restos: [100001]*3 con 180002 → [60001, 60001, 60000].
- test_repartir_con_descuento: [1000000, 500000] con 810000 → [540000, 270000].
- test_repartir_al_100_da_el_valor_de_cada_linea: [342462, 684924] con 1027386 → la misma lista.
- test_repartir_cero_y_vacios: anticipo 0 → ceros; montos todos 0 → ceros; [] → []; una línea en 0 dentro de otras recibe 0.
- test_repartir_invariantes: un bucle con 6 casos fijos (incluye 7 líneas impares y 33,33%): suma == objetivo; cada línea ≤ su monto; |línea − exacto| < 1.
- test_monto_linea: total_cop decimal se redondea; sin total_cop usa unit_price_cop × qty; texto no numérico → 0; no-dict → 0.
- test_get_cotizacion_expone_anticipo_por_linea: SC '60/40 (60% anticipo - 40% pendiente)' + COT BORRADOR con las 3 líneas del ejemplo y total 1840614 (helpers _sc/_cot como test_anticipo_modalidad.py). GET → anticipo_por_linea == [744368.0, 280800.0, 79200.0] y su suma == anticipo_requerido.
- test_get_cotizacion_a_credito_da_ceros: SC 'Credito 30 dias' → todo 0.0.
- test_get_cotizacion_con_anticipo_manual: PATCH anticipo_pct_manual 50 + nota → GET suma == round(total × 0,5).
- test_get_no_escribe_en_el_json_de_productos: tras el GET, db.refresh(cot) y ningún producto tiene la llave 'anticipo_cop' ni 'anticipo_por_linea'.
FRONTEND: en tests/test_pesos.mjs, formatoPct(60) === '60%', formatoPct(12.5) === '12,5%', formatoPct(33.333) === '33,33%', formatoPct(null) === '0%'. Luego node tests/test_pesos.mjs y npx tsc --noEmit. Revisión manual: COT 60/40 calculada, cada tarjeta con su anticipo y suma igual al renglón de TOTALES; COT nueva sin precios con '$0' en todas.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No toca datos: el valor se calcula al mostrar y no se guarda. En COT viejas cuyas líneas no tienen total_cop se usa precio × cantidad (igual que ya hace la tarjeta). Si las líneas viejas no suman exactamente el subtotal (centavos de antes del Bloque 1), el reparto igual cuadra con el anticipo total. Los anticipos viejos guardados mal los corrige la T14 del Bloque 1 (H36), y esta vista no depende de eso porque usa anticipo_requerido.
```

**Riesgos:**

```text
- Si el Bloque 1 dejó TOTALES con anticipo_cop, el paso 5 lo cambia a anticipo_requerido. En COT viejas con anticipo guardado desactualizado, el renglón cambia de número (y queda bien, porque es lo que N1 exigirá).
- Lista paralela por índice: si algún día el GET reordena productos, hay que reordenar las dos listas juntas. Hoy no se reordena.
- Bloque 3 (documento del cliente con anticipo) puede reutilizar repartir_anticipo_por_linea. Si el cliente llega a ver el anticipo, H36 avisa que anticipo_cop tiene que volver al congelamiento de precios.
```

**Archivos (diseño):** `backend/app/core/ventas_dinero.py`, `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_anticipo_por_linea.py`, `frontend/src/lib/pesos.js`, `frontend/tests/test_pesos.mjs`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`


### U24 — Anticipo grande y claro en el pedido de venta

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** En el pedido de venta, el resumen de dinero va a mostrar en letra grande, en tres recuadros: cuánto anticipo se pedía, cuánto ya pagó el cliente y cuánto falta. Debajo, una barra con «Pagado $X de $Y». Si el cliente pagó menos anticipo del que tocaba, aparece un aviso amarillo con lo que todavía debe.

**Para el usuario:** El resumen financiero del pedido deja de esconder el anticipo en letra pequeña. Arriba va el total del pedido y debajo tres recuadros del mismo tamaño: «Anticipo requerido (60%)», «Pagado (verificado)» y «Saldo pendiente». Si el saldo es 0 dice «Pagado completo», y si el cliente quedó con plata a favor dice «Saldo a favor del cliente». La barra de progreso lleva un texto legible con lo pagado y el porcentaje. Si el anticipo se pagó solo en parte, un aviso amarillo dice cuánto falta del anticipo. En pantallas angostas los recuadros se ponen uno debajo del otro.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
N1 (punto 11: Resumen Financiero con Pagado verificado, Anticipo requerido y lista de pagos; get_pedido expone pagos, anticipo_requerido y anticipo_pendiente), R4 (Anticipo pendiente), R6 (pago TRASLADO en la lista), H42 (formatoPesos/redondearPeso), H44+N6 y H45 (chip de PXP en la cabecera del mismo archivo: no se toca). Va después de la T10.
```

**Cambios (diseño):**

```text
FRONTEND
1) Nuevo frontend/src/lib/resumen-pago.js (JS puro, testeable con node), export resumenPagoPedido(p): usa redondearPeso de pesos.js y devuelve {total, pagado, saldo, saldoAFavor, requerido, anticipoPct, anticipoPendiente, pctPagado}:
   - total = redondearPeso(p.total_cop); saldoBruto = redondearPeso(p.saldo_cop); pagado = total − saldoBruto (lo mismo que get_pedido).
   - saldo = max(0, saldoBruto); saldoAFavor = saldoBruto < 0 ? −saldoBruto : 0 (crédito por re-cotización a la baja).
   - requerido = redondearPeso(p.anticipo_requerido); anticipoPct = p.anticipo_pct ?? null.
   - anticipoPendiente = max(0, redondearPeso(p.anticipo_pendiente ?? (requerido − pagado))).
   - pctPagado = total > 0 ? min(100, max(0, Math.round(pagado×100/total))) : 0.
2) frontend/src/app/dashboard/ventas/venta/[id]/page.tsx, sección 'Resumen Financiero' (la que deja el Bloque 1 con N1 punto 11 y R4): reemplazar el contenido de la tarjeta por:
   - Contenedor de la tarjeta con la clase @container (Tailwind v4 trae container queries).
   - Encabezado: label 'Total del pedido' (text-xs font-bold uppercase text-slate-500) y valor text-3xl font-black.
   - Grilla 'grid grid-cols-1 @md:grid-cols-3 gap-3' con tres recuadros (rounded-xl border p-4; label text-xs font-bold uppercase tracking-wider; valor text-2xl font-black; subtítulo text-sm):
     · 'Anticipo requerido · {formatoPct(anticipoPct)}' en índigo, con fCOP(requerido).
     · 'Pagado (verificado)' en esmeralda, con fCOP(pagado).
     · Tercer recuadro según el caso: 'Saldo pendiente' en rojo con fCOP(saldo) si saldo > 0; 'Pagado completo' en esmeralda con $0 si saldo == 0 y no hay saldo a favor; 'Saldo a favor del cliente' en ámbar con fCOP(saldoAFavor) si es > 0.
   - Barra de progreso h-3 con width pctPagado% (ya no anticipo_cop/total). Debajo, <p className='text-sm font-bold text-slate-600'>'Pagado {fCOP(pagado)} de {fCOP(total)} ({pctPagado}%)'.
   - Si anticipoPendiente > 0 (R4): recuadro ámbar (bg-amber-50 border-amber-200, text-sm font-bold text-amber-800): 'Anticipo pendiente: {fCOP(anticipoPendiente)}. El cliente todavía debe esta parte del anticipo.'
   - La lista de pagos de N1 (pedido.pagos) sigue debajo, con text-sm en lugar de text-xs. Se conservan la etiqueta 'Registrado automáticamente, sin verificar' de los pagos CONVERSION_COTIZACION y el pago 'TRASLADO' de R6.
   - Se elimina el <p className='text-xs …'>Anticipo: …</p> y cualquier texto 'Anticipo requerido' en text-xs que haya dejado T10.
3) frontend/package.json, script 'test': agregar '&& node tests/test_resumen_pago.mjs' (stagear solo el propio hunk).
```

**Comportamiento esperado:**

```text
- Valores grandes y legibles: total en 3xl y los tres recuadros en 2xl. Nada del dinero va en text-xs.
- Pagado = total − saldo; se actualiza con cada pago registrado, no solo con el anticipo inicial.
- Crédito (anticipo 0%): 'Anticipo requerido · 0%' muestra $0 y no hay aviso de anticipo pendiente.
- Pago parcial (R4): con pagado < requerido aparece el aviso ámbar con la diferencia exacta.
- Saldo negativo (re-cotización a la baja con anticipo ya pagado): 'Saldo a favor del cliente' y la barra al 100%.
- Con el contenido a menos de 448 px (por ejemplo a 1024 px con el panel de actividad abierto), los recuadros se apilan.
- Ejemplo del recorrido con el Bloque 1: total 1.840.614, 60/40, pagado 1.104.368 → Anticipo requerido 60% $1.104.368 · Pagado $1.104.368 · Saldo pendiente $736.246 · 'Pagado $1.104.368 de $1.840.614 (60%)'.
```

**Pruebas (diseño):**

```text
FRONTEND, nuevo frontend/tests/test_resumen_pago.mjs (node:assert/strict, estilo test_pesos.mjs):
- Caso normal: {total_cop:1840614, saldo_cop:736246, anticipo_requerido:1104368, anticipo_pendiente:0, anticipo_pct:60} → pagado 1104368, saldo 736246, pctPagado 60, anticipoPendiente 0.
- Pago parcial: saldo 1340614 y requerido 1104368 → pagado 500000, anticipoPendiente 604368 (con anticipo_pendiente ausente se calcula requerido − pagado).
- Crédito: requerido 0 y saldo == total → pagado 0, anticipoPendiente 0, pctPagado 0.
- Saldo negativo: total 1000000 y saldo −50000 → saldo 0, saldoAFavor 50000, pctPagado 100.
- Total 0 o campos ausentes: todo 0, sin NaN.
- Decimales viejos: total 2786923.08 → total 2786923.
Luego npm test y npx tsc --noEmit. Revisión manual a 1440 y 1024 px: PVEN 60/40 completo, PVEN con pago parcial y PVEN a crédito.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No cambia datos. Los PVEN viejos con el pago automático CONVERSION_COTIZACION (sin verificar) muestran ese monto como pagado mientras no se corrijan en la T14 del Bloque 1 (N1). La lista de pagos los sigue marcando 'sin verificar'.
```

**Riesgos:**

```text
- El Bloque 4 estandariza KPIs en toda la app (U3) y podría cambiar el estilo de estos recuadros. Por eso se usan clases simples y no un componente nuevo de KPI, para que el Bloque 4 los reemplace por su tarjeta estándar si quiere.
- Si la T10 del Bloque 1 deja la sección con otra estructura, se reemplaza completa. La lista de pagos y las etiquetas de N1/R6 se conservan tal cual.
```

**Archivos (diseño):** `frontend/src/lib/resumen-pago.js`, `frontend/tests/test_resumen_pago.mjs`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `frontend/package.json`


### H40 — Aviso antes de anular la confirmación del cliente al re-cotizar

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Al re-cotizar una cotización que el cliente ya confirmó, ¿qué se pide para seguir? → **Escribir la razón del cambio (queda en la Actividad)** (igual a la recomendada)

**Lo que notará el usuario:** Si abres la calculadora de una cotización que el cliente ya confirmó (o que está esperando su confirmación), arriba verás un aviso amarillo: cambiar precios, cantidades, descuento o fecha anula esa confirmación. Si de verdad cambias algo de eso, el sistema no guarda de una vez: te muestra qué cambió y te pide confirmar y escribir la razón. Después de guardar, la cotización te recuerda que debes enviársela de nuevo al cliente.

**Para el usuario:** Hoy, si re-cotizas una cotización ya confirmada, el sistema anula la confirmación del cliente sin avisar. Con este cambio: (1) la calculadora avisa desde que se abre; (2) si al guardar cambia algo que el cliente ya vio (productos, cantidades, precios, total, descuento, TRM o fecha de entrega), el servidor no guarda: la calculadora te dice qué cambió y te pide confirmar con la razón del cambio, que queda en la Actividad; (3) cambiar solo las notas, ajustar el anticipo o vincular un producto al catálogo no anula nada y no pregunta nada; (4) si la cotización ya tiene un pedido de venta vigente, sigue la pregunta de siempre de actualizar el pedido; (5) después de anular, la cotización muestra un aviso para enviarla de nuevo. La regla la hace cumplir el servidor, así que ninguna otra pantalla puede anular una confirmación sin este paso.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
H46+U25 (pvenVigente en cotizacion/[id] y _pven_vigente_de_cotizacion en ya_tiene_pven de update_cotizacion; su prueba 6 se ajusta), H36+H43 (el anticipo ya no está en PRICE_FREEZE_FIELDS; ajustar el anticipo no pregunta nada), H42 (_redondear_montos_del_body antes de comparar; la parte de 'redondeo' de H40 la resolvió H42), H50/N4/N7 (bloque único de guardas de estado en update_cotizacion: la guarda nueva NO va ahí, va después de calcular rompe_congelamiento), H7+H41 (texto del renglón de paso a Borrador, al que se le agrega la razón), H23 (apiFetch en api.ts).
```

**Cambios (diseño):**

```text
Diseño con la opción recomendada (razón obligatoria). Si el usuario elige 'solo casilla', se omiten el 422 del punto 1c y el texto de la razón, y la casilla reemplaza al campo de texto.

BACKEND, backend/app/api/v1/erp_ventas.py update_cotizacion
1) Donde hoy se calcula hubo_cambio_de_precio = any(...) sobre PRICE_FREEZE_FIELDS, calcular primero campos_congelados_cambiados = [k for k in PRICE_FREEZE_FIELDS if _freeze_cmp(k, getattr(cot, k)) != _freeze_cmp(k, old_price_values[k])] y luego hubo_cambio_de_precio = bool(campos_congelados_cambiados). Mapa nuevo de etiquetas: productos→'Productos, cantidades o precios'; total_cop y subtotal_cop→'Total'; descuento_pct→'Descuento'; trm_rate→'TRM'; fecha_entrega_estimada→'Fecha de entrega'; sc_id→'Solicitud de origen'. cambios = etiquetas sin repetir, en ese orden.
   a) Justo después de calcular rompe_congelamiento y ANTES de 'if rompe_congelamiento: cot.estado = BORRADOR', definir cambia_estado_explicito = bool(body.get('estado')) and body['estado'] != old_estado.
   b) Si rompe_congelamiento y no cambia_estado_explicito y no body.get('anular_confirmacion'): db.rollback() (descarta los setattr y el recálculo del anticipo ya hechos en la sesión) y raise HTTPException(409, detail={'codigo': 'ANULA_CONFIRMACION', 'estado': old_estado, 'cambios': cambios, 'mensaje': texto}). texto con CONFIRMADA: 'El cliente ya confirmó esta cotización. Si guardas estos cambios ({lista}), su confirmación se anula: la cotización vuelve a Borrador y tendrás que enviársela de nuevo.' Con PENDIENTE_CONFIRMACION: 'Esta cotización está esperando la confirmación del cliente. Si guardas estos cambios ({lista}), el enlace que tiene el cliente deja de servir: la cotización vuelve a Borrador y tendrás que enviársela de nuevo.'
   c) Si rompe_congelamiento y anular_confirmacion es verdadero: motivo = str(body.get('motivo_recotizacion') or '').strip(); si len(motivo) < 5: db.rollback() y HTTPException(422, 'Escribe la razón del cambio (mínimo 5 caracteres): queda en la Actividad de la cotización.').
   d) La llave es motivo_recotizacion y NO 'motivo': _registrar_cambios usa body['motivo'] para reemplazar el título del renglón de re-cotización. anular_confirmacion y motivo_recotizacion no van en allowed.
2) El _log ESTADO_CHANGED de la rama 'elif rompe_congelamiento' (paso a BORRADOR) agrega al final de su descripción (la que deje H7+H41) f' Razón: {motivo}.' y extra_data={'motivo': motivo, 'cambios': [{'etiqueta': 'Cambió', 'despues': ', '.join(cambios)}, {'etiqueta': 'Razón', 'despues': motivo}]}, sin la llave 'campo' (así CambiosDeActividad no pinta '—' tachado). user_name = body.get('updated_by') or getattr(user, 'email', None).
3) La respuesta agrega 'confirmacion_anulada': bool(rompe_congelamiento).

FRONTEND
4) Nuevo frontend/src/lib/api-error.js, export errorDeRespuesta(status, body): d = body?.detail. Mensaje: si d es string, d; si es objeto con mensaje string, d.mensaje; si es lista (422 de pydantic), los msg unidos con '; '; si no, body?.message o 'HTTP {status}'. Devuelve un Error con .status = status y .detail = d ?? null. En frontend/src/lib/api.ts apiFetch, la línea 'throw new Error(errBody.detail || errBody.message || ...)' pasa a 'throw errorDeRespuesta(res.status, errBody)'. El mensaje no cambia cuando detail es texto, que es el caso de hoy.
5) frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx CalculadorModal, props nuevas opcionales: estadoConfirmacion ('CONFIRMADA' | 'PENDIENTE_CONFIRMACION' | null), anulacion ({mensaje, cambios, estado} | null), onDescartarAnulacion y saving.
   - Refactor: armarPayload() devuelve el objeto que hoy arma handleSave; handleSave(extra = {}) valida igual que hoy y llama onSave({...armarPayload(), ...extra}).
   - Con estadoConfirmacion, recuadro ámbar al inicio del cuerpo (antes de TRM). CONFIRMADA: 'El cliente ya confirmó esta cotización. Cambiar productos, cantidades, precios, descuento, TRM o la fecha de entrega anula su confirmación y habrá que enviársela de nuevo. Cambiar solo las notas no la anula.' PENDIENTE: lo mismo, pero dice que el enlace que tiene el cliente deja de servir.
   - Con anulacion, el footer cambia por un panel rosa: título 'Vas a anular la confirmación del cliente', anulacion.mensaje, 'Cambia: {cambios}', textarea 'Razón del cambio (queda en la Actividad)' (mínimo 5 caracteres) y botones 'Seguir editando' (onDescartarAnulacion) y 'Guardar y anular la confirmación' (Button color='rose', deshabilitado si la razón tiene menos de 5 caracteres o si saving) → handleSave({anular_confirmacion: true, motivo_recotizacion: razon}). Se vuelve a enviar el payload actual y el servidor lo evalúa de nuevo.
6) frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx:
   - Estados nuevos calcAnulacion y avisoAnulada.
   - estadoConfirmacionCalc = (['CONFIRMADA','PENDIENTE_CONFIRMACION'].includes(estadoActual) && !pvenVigente) ? estadoActual : null, con el pvenVigente de H46+U25.
   - commitCalcSave: guardar la respuesta del PATCH; si r?.confirmacion_anulada, setAvisoAnulada('Se anuló la confirmación del cliente porque cambiaste la cotización. Envíasela de nuevo para que la confirme.'). En el catch: si err?.status === 409 && err?.detail?.codigo === 'ANULA_CONFIRMACION', setCalcAnulacion(err.detail) y no se cierra la calculadora; si no, el manejo de error de siempre.
   - Al cerrar la calculadora o guardar bien, setCalcAnulacion(null).
   - Pasar estadoConfirmacion, anulacion, onDescartarAnulacion y saving={savingCalc} a <CalculadorModal>.
   - avisoAnulada: recuadro ámbar con botón cerrar, encima de renderSiguientePaso() en Acciones.
   - Bajo el botón 'Re-Cotizar — Actualizar Precios', si estadoConfirmacionCalc: <p className='text-[11px] text-amber-700'>'Cambiar precios anula la confirmación del cliente.'
7) frontend/package.json 'test': agregar '&& node tests/test_api_error.mjs'.
```

**Comportamiento esperado:**

```text
- COT CONFIRMADA sin pedido vigente, o PENDIENTE_CONFIRMACION, más un PATCH que cambia lo que el cliente vio sin anular_confirmacion → 409 ANULA_CONFIRMACION; no se guarda nada y el enlace pendiente sigue vivo.
- Con anular_confirmacion y razón válida → se guarda, la COT pasa a BORRADOR, se revoca el enlace y se limpia gate2 (como hoy). La Actividad registra la re-cotización y luego el paso a Borrador con 'Razón: …'. Respuesta con confirmacion_anulada: true.
- Con anular_confirmacion y razón de menos de 5 caracteres → 422, sin cambios.
- No pregunta nada: cambiar solo notas, ajustar el anticipo a mano (R3), vincular una línea al catálogo (sku_id/es_libre), COT en BORRADOR, RECHAZADA, VENCIDA o ENVIADA (vieja), COT con pedido vigente (sigue el modal 'Actualizar Pedido de Venta'), y un PATCH que cambia el estado de forma explícita.
- La calculadora avisa desde que se abre en esos estados. El 409 es la red que no depende de que el navegador adivine qué cambió.
```

**Pruebas (diseño):**

```text
BACKEND, archivo nuevo backend/tests/test_recotizar_confirmada.py (runner de ROLLBACK: python tests/rollback_runner.py test_recotizar_confirmada). Helper _cot(db, numero, estado, total) con productos [{'product_name':'Cuna','qty':1,'unit_price_cop':total,'total_cop':total}] y gate2_confirmed_at=utcnow() si está CONFIRMADA.
1) test_recotizar_confirmada_sin_aceptar_responde_409_y_no_guarda: PATCH con precio 1200 (productos, subtotal, total) y recotizacion True → 409; detail['codigo'] == 'ANULA_CONFIRMACION'; 'Total' y 'Productos, cantidades o precios' en detail['cambios']. Tras db.refresh: estado CONFIRMADA, total 1000, gate2 no nulo, ningún ActivityLog COT nuevo.
2) test_recotizar_pendiente_sin_aceptar_deja_vivo_el_enlace: COT con precio → POST /enviar-confirmacion (token del link) → PATCH de precio → 409; GET /confirmar/ver con ese token → 200.
3) test_aceptar_con_razon_anula_y_registra_la_razon: anular_confirmacion True y motivo_recotizacion 'Proveedor subió el precio' → 200, confirmacion_anulada True, estado BORRADOR, gate2 None; el último ESTADO_CHANGED contiene 'Razón: Proveedor subió el precio'.
4) test_aceptar_sin_razon_responde_422: motivo 'x' → 422; estado CONFIRMADA.
5) test_cambiar_solo_notas_no_pregunta: PATCH {'notas':'x'} → 200, confirmacion_anulada False, sigue CONFIRMADA.
6) test_con_pedido_vigente_no_pregunta: SaleOrder PENDIENTE_COMPRA con cot_id + PATCH de precio → 200, confirmacion_anulada False, sigue CONFIRMADA.
7) test_borrador_no_pregunta: BORRADOR + PATCH de precio → 200, False.
8) test_vincular_sku_no_pregunta: CONFIRMADA + mismas líneas con sku_id → 200.
9) test_cambio_de_estado_explicito_no_pregunta: CONFIRMADA + PATCH {'estado':'BORRADOR', total distinto} → 200 (sin pedido vigente).
Ajustar pruebas existentes que re-cotizan una COT congelada (agregar anular_confirmacion True y motivo_recotizacion 'Prueba de cambio'): test_confirmacion_cotizacion.py::test_editar_precio_mientras_pendiente_confirmacion_reinicia_a_borrador y ::test_editar_precio_mientras_confirmada_sin_pven_reinicia_y_limpia_marcador; test_actividad_cambios_documentos.py::test_recotizar_una_cot_pendiente_de_confirmacion_registra_primero_la_recotizacion_y_luego_el_estado; test_anticipo_modalidad.py::test_cambiar_el_total_de_una_cot_confirmada_si_invalida_la_confirmacion; y la prueba 6 de H46+U25 (test_pedido_cancelado_reabre_cotizacion.py::test_recotizar_confirmada_con_pedido_cancelado_rompe_congelamiento). Antes de cerrar, buscar con grep otros PATCH de precio sobre COT CONFIRMADA/PENDIENTE y correr con el runner: test_confirmacion_cotizacion, test_actividad_cambios_documentos, test_anticipo_modalidad, test_pesos_enteros, test_pedido_cancelado_reabre_cotizacion, test_sincronizacion_estado_solicitud_cotizacion, test_crm_lead_movimiento_automatico y test_fecha_entrega_actividad_log_cot.
FRONTEND: nuevo tests/test_api_error.mjs: detail texto → message igual y .status; detail objeto {codigo, mensaje} → message == mensaje y .detail.codigo; detail lista [{msg:'a'},{msg:'b'}] → 'a; b'; body vacío → 'HTTP 500'. Luego npm test y npx tsc --noEmit. Revisión manual: COT confirmada → Re-Cotizar → aviso ámbar; cambiar un margen → Guardar → panel rosa con 'Total'; razón corta → botón deshabilitado; guardar → Borrador y aviso 'Envíasela de nuevo'.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No aplica: solo cambia el comportamiento al guardar.
```

**Riesgos:**

```text
- Cambia el contrato del PATCH de COT: un llamador que re-cotiza una COT congelada sin la bandera recibe 409. En la UI, el único que cambia precios es la calculadora, y se adapta aquí. Hay que ajustar cinco pruebas existentes (listadas).
- api.ts lo toca también H23 del Bloque 1 (T13, rama 401). Este cambio va en la rama de otros errores y solo agrega .status y .detail. Además, el mensaje de un 422 de pydantic deja de verse '[object Object]'.
- El db.rollback() antes del 409 o el 422 descarta lo que el PATCH ya aplicó en la sesión. Nada se había confirmado, porque el commit viene después.
- Si el Bloque 3 muestra el anticipo al cliente, anticipo_cop debe volver a PRICE_FREEZE_FIELDS (aviso de H36), y el mapa de etiquetas agrega 'Anticipo'.
- El catch sigue usando alert() para los demás errores. Reemplazarlo es del grupo de diálogos (H49).
```

**Archivos (diseño):** `backend/app/api/v1/erp_ventas.py`, `backend/tests/test_recotizar_confirmada.py`, `backend/tests/test_confirmacion_cotizacion.py`, `backend/tests/test_actividad_cambios_documentos.py`, `backend/tests/test_anticipo_modalidad.py`, `backend/tests/test_pedido_cancelado_reabre_cotizacion.py`, `frontend/src/lib/api-error.js`, `frontend/src/lib/api.ts`, `frontend/tests/test_api_error.mjs`, `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/package.json`


### H37 — Cotización y pedido bien vistos en pantallas medianas, con un solo botón de volver

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** En una pantalla más pequeña (como un portátil de 1024 px), la cotización y el pedido se reacomodan: el nombre del cliente ya no se parte palabra por palabra, los nombres de los productos se leen completos, las etiquetas «Vinculado a catálogo» no se montan y el precio baja debajo del nombre cuando no cabe. Arriba queda un solo botón de volver, que dice a dónde te lleva («Volver a la solicitud», «Volver a cotizaciones»…).

**Para el usuario:** Se arreglan los problemas de la cotización a 1024 px y, de paso, los mismos del pedido de venta. El panel de Actividad arranca más angosto en pantallas medianas (se puede seguir arrastrando). Los datos de arriba (Cliente, Origen, Entrega) se ponen en una columna cuando no caben en tres. Los productos muestran el nombre completo y el precio pasa a la siguiente línea si hace falta. Desaparece el doble «volver» (flecha más el enlace «← Volver»): queda un solo botón que te lleva a donde venías o, si entraste directo, a la lista. En el pedido, ese botón ya no te manda a la cotización: te manda a la lista de pedidos, y la cotización sigue a un clic en «Origen».

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
H46+U25 (borra el banner verde permanente de la COT; ya no hay que adaptarlo), H35+H48 (recuadros 'Nota de la solicitud'/'Nota de la cotización' que reciben break-words), N10 (stepper del PVEN, que no se toca), H44+N6/H45 (botones de la cabecera del PVEN, que no se tocan), H42 (tarjetas con formatoPesos). Ninguno de estos ítems cubre H37: se aplica encima de la T10.
```

**Cambios (diseño):**

```text
FRONTEND
1) Nuevo frontend/src/lib/detalle-layout.js (JS puro):
   - destinoVolver(returnToSaneado, porDefecto): returnToSaneado || porDefecto. Recibe el valor ya validado por returnToSeguro o sanitizeReturnTo.
   - etiquetaVolver(href): sin query ni hash. /dashboard/ventas/solicitud/{id} → 'Volver a la solicitud'; /dashboard/ventas/solicitud → 'Volver a solicitudes'; /cotizacion/{id} → 'Volver a la cotización'; /cotizacion → 'Volver a cotizaciones'; /venta/{id} → 'Volver al pedido'; /venta → 'Volver a pedidos'; /dashboard/ventas → 'Volver al Hub de Ventas'; cualquier otra → 'Volver'.
   - anchoInicialPanel(anchoVentana): Math.min(400, Math.max(300, Math.round(anchoVentana × 0,3))); 400 si no es un número finito.
2) frontend/src/app/dashboard/ventas/flujo.tsx: export function BotonVolver({ href }) → un solo <Link> con ArrowLeft más el texto etiquetaVolver(href) (text-sm font-bold text-slate-500, hover:bg-slate-100, rounded-lg px-2 py-2), con title y aria-label iguales a la etiqueta. Lo puede reutilizar el grupo detalle-sc en solicitud/[id].
3) frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx:
   - Cabecera: reemplazar el <Link> de ArrowLeft más el '← Volver' condicional por <BotonVolver href={destinoVolver(safeReturnTo, '/dashboard/ventas/cotizacion')} />.
   - Panel derecho: useEffect(() => setRightWidth(anchoInicialPanel(window.innerWidth)), []). El useState(400) no se toca, para no romper la hidratación.
   - Envoltorio 'max-w-5xl mx-auto': agregar la clase @container.
   - Grilla Cliente/Origen/Entrega: 'grid grid-cols-3 gap-6' → 'grid grid-cols-1 @2xl:grid-cols-3 gap-6'. Caja Cliente con break-words.
   - Tarjeta de producto: 'flex items-center gap-4' → 'flex flex-wrap items-center gap-x-4 gap-y-2'. Bloque del nombre: 'flex-1 min-w-0' → 'grow basis-48 min-w-0'. Nombre: quitar truncate y poner break-words con title={nombre}. Chips 'Vinculado a catálogo' y 'Texto libre': agregar whitespace-nowrap. Bloque de precio: 'text-right shrink-0' → 'ml-auto text-right shrink-0' (cuando no cabe, baja a la línea siguiente alineado a la derecha).
   - TOTALES: 'w-72' → 'w-full @md:w-72'.
   - Acciones: 'grid grid-cols-1 sm:grid-cols-2' → 'grid grid-cols-1 @lg:grid-cols-2'.
   - Recuadros de notas (los de H35+H48): break-words y whitespace-pre-wrap.
4) frontend/src/app/dashboard/ventas/venta/[id]/page.tsx:
   - Cabecera: reemplazar el ArrowLeft (que hoy va a la COT) más el '← Volver' por <BotonVolver href={destinoVolver(safeReturnTo, '/dashboard/ventas/venta')} />.
   - Mismo useEffect de anchoInicialPanel y @container en 'max-w-5xl mx-auto space-y-8'.
   - Grilla Cliente/Origen/Entrega → 'grid grid-cols-1 @2xl:grid-cols-3 gap-6'.
   - Formulario de edición y la grilla dirección/notas: 'grid grid-cols-2' → 'grid grid-cols-1 @lg:grid-cols-2'; 'col-span-2' → '@lg:col-span-2'.
   - Tabla de productos: envoltorio con overflow-x-auto; celda del nombre con break-words y min-w-40.
5) frontend/src/app/dashboard/ventas/page.tsx (Hub), panel rápido: los router.push a /cotizacion/{id} y /venta/{id} pasan ?return_to=%2Fdashboard%2Fventas, para que 'Volver al Hub de Ventas' funcione. Opcional y chico; el Hub tiene muchos dueños (Bloques 1 y 4).
6) frontend/package.json 'test': agregar '&& node tests/test_detalle_layout.mjs'.
```

**Comportamiento esperado:**

```text
- A 1024 px (menú de 256 px y panel de 307 px), el contenido izquierdo queda en unos 390 px: Cliente/Origen/Entrega en una columna, nombres completos, precio debajo del nombre y chips en una sola línea.
- A 1440 px se ve como hoy (tres columnas y precio a la derecha), con el panel en 400 px.
- El panel de Actividad se puede seguir arrastrando entre 300 y 800 px. Como el reacomodo depende del ancho real del contenido (container queries), también responde al arrastre.
- Un solo control de volver, con su destino escrito. Si viene un return_to válido, va ahí; si no, a la lista del documento.
- PVEN: sin return_to, volver lleva a la lista de pedidos (antes iba a la COT).
```

**Pruebas (diseño):**

```text
FRONTEND, nuevo frontend/tests/test_detalle_layout.mjs (node:assert/strict):
- destinoVolver('', '/dashboard/ventas/cotizacion') devuelve el valor por defecto; con '/dashboard/ventas/solicitud/5' devuelve ese.
- etiquetaVolver para los 8 casos de la tabla, incluido '/dashboard/ventas/cotizacion/3?return_to=x' → 'Volver a la cotización' y '/dashboard/otra' → 'Volver'.
- anchoInicialPanel(1024) === 307, (1440) === 400, (800) === 300, (NaN) === 400.
Luego npm test y npx tsc --noEmit. Revisión visual con capturas a 1024×768 y 1440×1000 (como el recorrido de Playwright del scratchpad): COT con las 3 líneas DEMO llegando desde la SC (con return_to) y desde la lista (sin él), y PVEN igual. Verificar: un solo botón de volver con la etiqueta correcta, nombres completos, chips sin montarse y sin scroll horizontal.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No aplica.
```

**Riesgos:**

```text
- Es el primer uso de container queries (@container) en el proyecto. Vienen en Tailwind v4, que es la versión instalada, y no requieren configuración, pero hay que verlo en el navegador.
- Cambia el destino por defecto de volver en el PVEN (a la lista y no a la COT).
- El grupo chatter (U12: pestañas Actividad/Chatter/IA con Acciones adentro) puede reorganizar el panel derecho de estas mismas páginas. Conviene que H37 vaya primero o que un solo dueño toque cada página.
- solicitud/[id] tiene el mismo doble volver: es del grupo detalle-sc, que puede usar BotonVolver.
- venta/[id] y solicitud/[id] tienen hunks sin commitear de otra sesión (sanitizeReturnTo): stagear solo lo propio.
```

**Archivos (diseño):** `frontend/src/lib/detalle-layout.js`, `frontend/tests/test_detalle_layout.mjs`, `frontend/src/app/dashboard/ventas/flujo.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/package.json`


### H30 — Copiar el enlace siempre funciona o te dice qué hacer

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** Cuando le das «Copiar enlace» y el navegador no deja copiar solo, ya no pasa nada en silencio: el enlace queda seleccionado y aparece un aviso que dice «cópialo con Ctrl+C» (o mantén presionado en el celular). Cuando sí se copia, el botón dice «Copiado».

**Para el usuario:** En la ventana del enlace de confirmación (solicitud y cotización, y también la del Hub), el botón «Copiar enlace» intenta copiar de dos formas. Si ninguna funciona, por ejemplo porque el navegador no da permiso, deja el enlace seleccionado y muestra un aviso amarillo con cómo copiarlo a mano. Así el asesor nunca pega en WhatsApp algo viejo creyendo que pegó el enlace.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
H27+H39 (EnlaceConfirmacionModal recibe correo y canal y muestra el recuadro de aviso del correo; este cambio va en el mismo componente, debajo del input, y se aplica encima de la T8). El modal del Hub que agrega H27 recibe el arreglo sin cambios propios.
```

**Cambios (diseño):**

```text
FRONTEND
1) Nuevo frontend/src/lib/copiar.js (JS puro), export async function copiarTexto(texto, { portapapeles, copiarSeleccion } = {}) → 'copiado' | 'manual':
   - Si portapapeles?.writeText es una función: try { await portapapeles.writeText(texto); return 'copiado' } catch {}.
   - try { if (copiarSeleccion && copiarSeleccion()) return 'copiado' } catch {}.
   - return 'manual'.
2) frontend/src/app/dashboard/ventas/flujo.tsx EnlaceConfirmacionModal:
   - inputRef = useRef<HTMLInputElement>(null) en el <input readOnly>.
   - Estado estadoCopia: 'idle' | 'copiado' | 'manual' (reemplaza copiado).
   - copiar(): r = await copiarTexto(link, { portapapeles: typeof navigator !== 'undefined' ? navigator.clipboard : undefined, copiarSeleccion: () => { const el = inputRef.current; if (!el) return false; el.focus(); el.select(); el.setSelectionRange(0, el.value.length); return document.execCommand('copy'); } }). Si r es 'copiado': setEstadoCopia('copiado') y volver a 'idle' a los 2 s. Si es 'manual': setEstadoCopia('manual'), y volver a enfocar y seleccionar el input.
   - Botón: 'Copiado' con Check si estadoCopia es 'copiado'; si no, 'Copiar enlace'.
   - Si estadoCopia es 'manual': borde ámbar en el input y, debajo, <p role='status' className='text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2'> 'No se pudo copiar automáticamente. El enlace quedó seleccionado: cópialo con Ctrl+C (en el celular, mantén presionado y elige Copiar) y pégalo en el mensaje al cliente.'
   - Se quita el comentario del catch vacío.
   - El recuadro de correo que agrega H27+H39 (props correo/canal) queda donde lo pone ese diseño, antes del párrafo. Este aviso va después del input, así que no se pisan.
3) frontend/package.json 'test': agregar '&& node tests/test_copiar.mjs'.
```

**Comportamiento esperado:**

```text
- Con permiso de portapapeles: copia y el botón dice 'Copiado' por 2 s (como hoy).
- Sin navigator.clipboard (HTTP con IP o dominio) o con permiso negado: intenta copiar la selección del input. Si funciona, 'Copiado'.
- Si las dos formas fallan: el enlace queda seleccionado y aparece el aviso ámbar. Ya nunca falla en silencio.
- Sirve igual en SC, COT y en el modal del Hub que agrega H27, porque todos usan EnlaceConfirmacionModal.
```

**Pruebas (diseño):**

```text
FRONTEND, nuevo frontend/tests/test_copiar.mjs (node:assert/strict, con objetos falsos):
1) portapapeles que resuelve → 'copiado'; writeText recibió el texto y copiarSeleccion no se llamó.
2) portapapeles que rechaza más copiarSeleccion que da true → 'copiado'.
3) portapapeles undefined más copiarSeleccion true → 'copiado'.
4) portapapeles que rechaza más copiarSeleccion false → 'manual'.
5) copiarSeleccion que lanza → 'manual'.
6) sin opciones → 'manual'.
Luego npm test y npx tsc --noEmit. Revisión manual: abrir el frontend por la IP de la red (http://192.168.x.x:5100, contexto no seguro, sin navigator.clipboard) → Enviar para confirmación → Copiar enlace → se copia por la selección o aparece el aviso.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No aplica.
```

**Riesgos:**

```text
- document.execCommand('copy') está marcado como obsoleto, pero sigue funcionando en los navegadores actuales y solo se usa como segundo intento. tsc lo acepta (lib.dom).
- asistente_omnicanal/page.tsx y marketing/campanas/page.tsx tienen el mismo patrón sin manejo de error. Están fuera de Ventas y no se tocan aquí, pero pueden reutilizar copiarTexto.
```

**Archivos (diseño):** `frontend/src/lib/copiar.js`, `frontend/tests/test_copiar.mjs`, `frontend/src/app/dashboard/ventas/flujo.tsx`, `frontend/package.json`


### H49+H34 — Avisos y confirmaciones dentro del sistema

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** Los errores y las preguntas de '¿seguro?' de Ventas ya no salen en las ventanitas grises del navegador. Ahora aparecen dentro del sistema y todas se ven igual: los avisos salen en una tarjeta abajo a la derecha (los de error duran más y se pueden cerrar) y las confirmaciones en una ventana con botones claros, por ejemplo 'Eliminar definitivamente' en rojo. Los errores dicen en español qué pasó, por ejemplo 'Motivo: debe tener al menos 5 caracteres', en vez de un texto raro. Si una ventana pide un motivo, el botón se activa solo cuando el motivo está completo, y si algo falla el error aparece en esa misma ventana sin borrar lo que escribiste. En la Papelera, 'Eliminar permanentemente' pide su propia confirmación y solo lo ve un administrador.

**Para el usuario:** Todas las pantallas de Ventas (Hub, solicitudes, cotizaciones y pedidos) dejan de usar las ventanas propias del navegador para avisar errores o pedir confirmación. Esas ventanas no se veían en el navegador integrado ni en las capturas. En su lugar hay un aviso propio del sistema (tarjeta abajo a la derecha) y una ventana de confirmación con el estilo de la aplicación. Los mensajes de error del servidor se traducen a frases claras, también cuando no hay conexión. Las ventanas que piden un motivo no dejan confirmar hasta que tiene 5 caracteres o más, que es lo mismo que exige el sistema. 'Eliminar permanentemente' en la Papelera pide confirmación propia, muestra cliente y motivo, y solo lo ve un administrador, que es el único que puede hacerlo.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
Sí. N2 y N5 agregan window.confirm para 'Facturado'; aquí pasan a confirmar(). N3 y N4 quitan handleBulkDelete y los confirm de CANCELADA (Hub, solicitud-client.changeEstado, solicitud/[id].changeEstado), y el modal con motivo de N3 no cambia. N7 cambia el texto del confirm de Rechazada en cotizacion/[id]; aquí se usa ese texto. N1: handleConfirmarVenta abre el modal de anticipo con su propio error; aquí solo cambian el aviso 'sin productos' y el error del camino sin anticipo. H44 cambia handleCrearPxp (body {}); aquí solo su aviso. H27: en el handleDrop del Hub, confirmar() va antes del envío y del modal de enlace. H23: AvisosProvider va en layout.tsx junto a SessionKeeper, textoDeDetalle entra en el apiFetch reescrito y el modal de sesión (z-[100]) queda encima. N4-Papelera: Eliminar permanente se oculta si tiene_documentos y su 409 se muestra en el aviso. H45 y H46 agregan textos al modal de cancelar el PVEN, que se conservan. Implementar después de T9–T11 y H23.
```

**Cambios (diseño):**

```text
FRONTEND — BASE NUEVA (reutilizable en toda la app)
1) NUEVO frontend/src/lib/avisos.js (JS puro, probado con node, como pricing.js o busqueda.js):
   - MENSAJE_SIN_CONEXION = 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.' y MENSAJE_GENERICO = 'Ocurrió un error inesperado. Intenta de nuevo.'
   - ETIQUETAS_CAMPO = {razon:'Motivo', motivo:'Motivo', cancellation_reason:'Motivo de la cancelación', referencia:'Referencia', monto:'Monto', metodo_pago:'Método de pago', fecha_pago:'Fecha del pago', customer_name:'Cliente', first_name:'Nombre', name:'Nombre', email:'Correo', phone:'Teléfono'}.
   - textoDeDetalle(detail, status):
     · Un string no vacío se devuelve tal cual.
     · Un arreglo (el 422 de FastAPI/pydantic, que hoy llega como '[object Object]') se recorre error por error, con {type, loc, msg, ctx}. campo = ETIQUETAS_CAMPO[último string de loc] ?? ese string. Según el type:
       'string_too_short' → `${campo}: debe tener al menos ${ctx.min_length} caracteres.`
       'string_too_long' → `${campo}: máximo ${ctx.max_length} caracteres.`
       'missing' → `Falta el dato «${campo}».`
       'greater_than' o 'greater_than_equal' → `${campo}: debe ser mayor que ${ctx.gt ?? ctx.ge}.`
       cualquier otro → `${campo}: ${msg}`.
       Los textos se unen con un espacio.
     · Un objeto con message o detail devuelve ese texto.
     · Si no hay nada: `El servidor respondió con un error (${status}). Intenta de nuevo.`
   - textoDeError(err, prefijo?):
     · msg = el string, o err.message, o ''. Se quita el 'Error: ' inicial.
     · 'Failed to fetch', 'NetworkError…' o 'Load failed' → MENSAJE_SIN_CONEXION.
     · Vacío o con '[object Object]' → MENSAJE_GENERICO.
     · Con prefijo → `${prefijo}: ${msg}`, sin repetir el prefijo si msg ya empieza por él.
   - duracionAviso(tono, texto): 'ok' e 'info' → 4000 ms; 'error' → min(15000, max(7000, 60 × largo del texto)).
   - agregarAviso(lista, aviso, max=3): si ya hay uno con el mismo texto y tono, lo reemplaza (id nuevo, al final). Recorta a los últimos max.
2) frontend/src/lib/api.ts, apiFetch: `throw new Error(textoDeDetalle(errBody.detail ?? errBody.message, res.status))`, importando con ruta RELATIVA `import { textoDeDetalle } from './avisos.js'`. El test_apifetch_401.mjs reescrito por H23 importa api.ts con node, y node no resuelve '@/'.
3) frontend/src/components/ui/Modal.tsx:
   - Prop opcional `capa?: 'base'|'encima'` (z-50 | z-[60]).
   - role="dialog" y aria-modal="true" en el contenedor.
   frontend/src/components/ui/Button.tsx: prop opcional `autoFocus`, que se pasa al <button>.
   Los usos actuales de los dos no cambian.
4) NUEVO frontend/src/components/ui/Avisos.tsx ('use client'), exportado en ui/index.ts:
   - AvisosProvider({children}): guarda la lista de avisos (con agregarAviso) y una cola de confirmaciones [{opciones, resolver}].
   - El contexto ofrece:
     · avisar(texto, {tono='ok'|'error'|'info', accion?:{texto, href}}).
     · avisarError(err, prefijo?): hace avisar(textoDeError(err, prefijo), {tono:'error'}) y console.error(err).
     · confirmar(opciones): Promise<boolean>.
     OpcionesConfirmar = {titulo, mensaje, efectos?: string[], textoConfirmar='Confirmar', textoCancelar='Volver', peligro?: boolean, color?: AccentColor}.
   - Avisos en pantalla:
     · Pila `fixed bottom-6 right-6 z-[90] flex flex-col items-end gap-2 max-w-sm`, por debajo del modal de sesión de H23 (z-[100]).
     · Mismo estilo de ui/Toast: emerald (ok), red (error) o slate-800 (info), con icono, texto con saltos de línea, la acción como next/link y botón cerrar.
     · role="alert" si es error y role="status" si no.
     · Se cierra a los duracionAviso() ms; el temporizador se pausa con el puntero encima.
   - Confirmación (la primera de la cola): <Modal capa="encima" maxWidth="md" color={peligro?'red':(color||'indigo')} icon={peligro?AlertTriangle:HelpCircle} title={titulo} onClose={()=>resolver(false)}>.
     · Cuerpo: el mensaje y la lista de efectos.
     · Footer: Button secondary textoCancelar (autoFocus si peligro) y Button variant={peligro?'danger':'primary'} textoConfirmar (autoFocus si no es peligro).
     · Escape resuelve false; role="alertdialog".
   - useAvisos(): devuelve el contexto. Sin proveedor devuelve un respaldo: avisar escribe console.warn y confirmar resuelve false. Nunca usa window.alert ni window.confirm.
5) frontend/src/app/dashboard/layout.tsx: envolver lo que va dentro de <AuthGuard> con <AvisosProvider>, junto al <SessionKeeper/> de H23.

FRONTEND — REEMPLAZOS (inventario completo)
Inventario: hoy hay 38 llamadas nativas en las 6 pantallas del flujo: venta/[id] 10, cotizacion/[id] 10, solicitud/[id] 10, solicitud-client 4, Hub 3 y venta-client 1. Hay 4 más en páginas de simulación. El Bloque 1 quita 4 y agrega 2 window.confirm (N2 y N5).
Reglas:
- Error de una acción de la página → avisarError(err, '<qué falló>').
- Error de una acción hecha dentro de una ventana → mensaje en una caja rose dentro de esa ventana, sin cerrarla ni borrar lo escrito.
- Éxito que antes era alert → avisar(..., {tono:'ok'}).
- Confirmación → `if (!(await confirmar({...}))) return;`.
6) dashboard/ventas/page.tsx (Hub):
   - Toast local → adaptador `const { avisar, confirmar } = useAvisos(); const setToast = (t) => { if (t) avisar(t.msg, {tono: t.type}); };`. Se quitan el useState y el <Toast/> local. Todas las llamadas a setToast, incluidas las nuevas de N2, N3 y N5, siguen funcionando.
   - handleDrop, ramas de envío de COT y de SC: window.confirm → confirmar({titulo:`Enviar ${numero} al cliente`, mensaje:'Se genera un enlace de confirmación real y se le envía al cliente.', textoConfirmar:'Enviar enlace'}). El modal de enlace de H27 se muestra después.
   - Panel rápido VEN de N2, 'Marcar como Facturado': window.confirm → confirmar({titulo:`Marcar ${numero} como Facturado`, mensaje:'Después de esto el estado del pedido ya no se puede cambiar.', textoConfirmar:'Marcar como Facturado'}).
   - handleBulkChangeEstado de N5 con FACTURADO: la misma confirmación, con el título `Marcar ${n} pedidos como Facturado`.
   - El confirm de handleBulkDelete desaparece con N3.
7) solicitud/solicitud-client.tsx:
   - NewClientModal.save, en el catch: setError(textoDeError(err,'No se pudo crear el cliente')), mostrado en una caja rose sobre el formulario y borrado al editar. asistente_omnicanal también usa este modal.
   - showToast → adaptador a avisar ('err'→'error'). Se quita <SharedToast/>.
   - enviarAPapelera: confirm → confirmar({titulo:`Enviar ${numero} a la papelera`, mensaje:'La solicitud ya está cancelada. Desde la papelera se puede restaurar.', textoConfirmar:'Enviar a la papelera', peligro:true}).
   - eliminarPermanente (H34), que ahora recibe la fila:
     · confirm → confirmar({titulo:`Eliminar ${sc.numero} definitivamente`, mensaje:'La solicitud se borra para siempre y no se puede recuperar.', efectos:[`Cliente: ${sc.customer_name||'—'}`, `Motivo de la cancelación: ${sc.razon_cancelacion||'—'}`], textoConfirmar:'Eliminar definitivamente', peligro:true}).
     · Éxito: avisar(`${sc.numero} eliminada definitivamente`).
     · Error: avisarError; el 409 de N4-Papelera explica el motivo.
   - Fila de la Papelera: 'Eliminar permanentemente' solo si esAdministrador(getUsuarioActual().role) && !sc.tiene_documentos. Hoy un asesor ve el botón y recibe 403.
   - Modal 'Cancelar Solicitud': botón deshabilitado hasta cancelRazon.trim().length >= 5, con la ayuda 'Mínimo 5 caracteres (llevas N)'. Hoy solo exige que no esté vacío y el backend responde 422 '[object Object]'. cancelWithReason, que N4 convierte en lote, sigue informando por aviso.
   - changeEstado: si aún quedara la rama CANCELADA con window.confirm (N4 la quita), se elimina.
8) solicitud/[id]/page.tsx:
   - avisarError en saveEdit ('No se pudieron guardar los cambios'), changeEstado ('No se pudo cambiar el estado'), changeEstadoSoporte ('No se pudo cambiar el estado de soporte'), asignarAsesor ('No se pudo asignar el asesor') y enviarParaConfirmacion ('No se pudo enviar la solicitud al cliente').
   - confirmarSC: el alert de éxito pasa a avisar(`Cotización ${cotNum} creada`); el catch, a avisarError(err,'No se pudo crear la cotización').
   - cancelWithReason: botón activo desde 5 caracteres y error dentro del modal (errorCancelacion), conservando el texto.
9) cotizacion/[id]/page.tsx:
   - avisarError en confirmarEnvio ('No se pudo enviar la cotización'), commitCalcSave ('No se pudo guardar la cotización'), changeEstado ('No se pudo cambiar el estado'), deleteCot ('No se pudo eliminar la cotización'), handleQuickCreateProduct ('No se pudo crear el producto') y enviarChatter ('No se pudo registrar el mensaje').
   - handleConfirmarVenta:
     · Alert 'No hay productos ni notas…' → avisar(..., {tono:'error'}).
     · window.confirm sin productos → confirmar({titulo:'Crear el pedido sin productos', mensaje:'La cotización no tiene productos; solo las notas los mencionan.', textoConfirmar:'Crear pedido de todas formas'}).
     · Catch del camino sin anticipo → avisarError(err,'No se pudo crear el pedido'). El modal de anticipo de N1 muestra su propio error.
   - Select 'Cambiar estado': onChange async. Para RECHAZADA, confirmar({titulo:`Marcar ${numero} como Rechazada`, mensaje: texto de N7 con sc_numero, textoConfirmar:'Marcar como Rechazada', peligro:true}).
10) venta/[id]/page.tsx:
   - handleCrearPxp: éxito avisar(`Orden de pago ${d.data.numero} creada`); error avisarError(err,'No se pudo crear la orden de pago').
   - handleRegistrarNota y handleEnviarWhatsApp: avisarError con 'No se pudo registrar la nota' o 'No se pudo registrar el mensaje'. El texto se queda en la caja.
   - handleAgregarLista: éxito avisar('Productos agregados a la lista de compras') (hoy no dice nada); error con avisarError.
   - handleSaveEdit: avisarError(err,'No se pudieron guardar los cambios').
   - handleCrearPEC:
     · Botón 'Crear PEC' deshabilitado sin proveedor, con la ayuda 'Selecciona un proveedor o crea uno nuevo'.
     · Error dentro del modal.
     · Éxito: avisar(`PEC ${numero} creado y vinculado al pedido`, {accion:{texto:'Ver PEC', href:`/dashboard/compras/pedidos/${id}`}}).
   - handleCancelarPedido: botón deshabilitado hasta 5 caracteres y error dentro del modal.
11) venta/venta-client.tsx:
   - NewSupplierModal.save: error dentro del modal.
   - showToast/setToast → adaptador a avisar; se quita <Toast/>.
12) flujo.tsx: `export function esAdministrador(role?: string|null): boolean` (lower/trim === 'admin', igual que normalize_role).
13) exportar-dia, exportar-rango, proyecciones y validacion-odoo: alert → avisar(texto, {tono:'info'}). Siguen siendo simulaciones.
14) frontend/package.json: agregar `&& node tests/test_avisos.mjs && node tests/test_sin_dialogos_nativos.mjs` al script test, en el cambio consolidado del package.json.
BACKEND: sin cambios.
```

**Comportamiento esperado:**

```text
- En src/app/dashboard/ventas no queda ningún alert(), confirm() ni prompt() nativo. Una prueba guardián lo vigila, incluso si después alguien agrega uno.
- Avisos:
  - Los de éxito e información duran 4 s.
  - Los de error duran entre 7 y 15 s según su largo.
  - Se pausan con el puntero encima y se pueden cerrar.
  - Se ven como máximo 3 a la vez; un aviso repetido no se duplica.
  - Aparecen encima de cualquier ventana de la página y debajo del modal de sesión vencida (H23).
- Confirmaciones:
  - Se abren encima de cualquier ventana de la página y no ejecutan nada hasta que se confirme.
  - Escape, la X o 'Volver' equivalen a 'no'.
  - En las acciones peligrosas el botón es rojo y el foco inicial queda en 'Volver'.
  - Si se piden dos confirmaciones seguidas, se muestran en orden.
- Errores del servidor:
  - Un 422 de validación se lee como 'Motivo: debe tener al menos 5 caracteres.'.
  - Sin conexión: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.'.
  - Nunca sale '[object Object]' ni 'Error: Error: …'.
- Lo que falla dentro de una ventana (cancelar con motivo, crear cliente, crear proveedor, crear PEC) se informa dentro de esa ventana. La ventana no se cierra y lo escrito se conserva.
- Las ventanas con motivo exigen 5 caracteres o más, la misma regla del backend (CancelarSolicitudBody min_length=5 y N2), y muestran el conteo.
- Papelera:
  - 'Eliminar permanentemente' solo lo ve un administrador, y no aparece si la solicitud tiene documentos (N4-Papelera).
  - Pide una confirmación roja con número, cliente y motivo.
  - Al terminar dice '<SC> eliminada definitivamente'.
- Las ventanas de confirmación ahora salen en las capturas automáticas (Playwright); antes no se veían.
```

**Pruebas (diseño):**

```text
FRONTEND (node, sin vitest):
1) NUEVO frontend/tests/test_avisos.mjs (node:assert/strict, estilo test_busqueda.mjs):
   - textoDeDetalle('No se puede…', 409) devuelve el mismo texto.
   - textoDeDetalle([{type:'string_too_short', loc:['body','razon'], msg:'String should have at least 5 characters', ctx:{min_length:5}}], 422) === 'Motivo: debe tener al menos 5 caracteres.'.
   - textoDeDetalle([{type:'missing', loc:['body','referencia'], msg:'Field required'}], 422) === 'Falta el dato «Referencia».'.
   - Con dos errores, los textos se unen con un espacio.
   - Un type desconocido usa msg.
   - textoDeDetalle({message:'x'}) === 'x'.
   - textoDeDetalle(undefined, 500) contiene '(500)'.
   - textoDeError(new Error('Failed to fetch')) === MENSAJE_SIN_CONEXION.
   - textoDeError(new Error('[object Object]')) === MENSAJE_GENERICO.
   - textoDeError(new Error('Error: algo'), 'No se pudo X') === 'No se pudo X: algo'.
   - textoDeError('texto') === 'texto'.
   - textoDeError(null) === MENSAJE_GENERICO.
   - duracionAviso('ok','x') === 4000; duracionAviso('error','x') === 7000; duracionAviso('error','x'.repeat(400)) === 15000.
   - agregarAviso: el cuarto aviso deja 3; un texto y tono repetidos no duplican y quedan al final.
2) NUEVO frontend/tests/test_sin_dialogos_nativos.mjs:
   - Recorre src/app/dashboard/ventas/**/*.{ts,tsx,js} y quita comentarios /*…*/ y // (sin tocar 'http://').
   - Falla con archivo:línea si encuentra /(^|[^\w.$])(?:window\.)?(?:alert|confirm|prompt)\s*\(/.
   - Autoprueba del patrón: detecta 'window.confirm(' y ' alert(', y no detecta 'confirmar(', 'setAlertDias(', 'chatPrompt(' ni 'handleConfirmarVenta('.
3) `npm test` completo y `npx tsc --noEmit`, filtrando la salida a los archivos tocados (next.config tiene ignoreBuildErrors): no debe aparecer ningún error nuevo.
BACKEND: no aplica.
MANUAL, con datos DEMO y capturas con Playwright:
- Papelera: el admin ve la ventana roja al eliminar; un asesor no ve el botón.
- Cancelar una SC con 3 letras: el botón queda deshabilitado.
- Con el backend detenido, guardar una edición de SC: sale 'No se pudo conectar…'.
- COT > Cambiar estado > Rechazada: abre la ventana de confirmación.
- Hub: arrastrar una COT a 'En Gestión' abre 'Enviar enlace'.
- PVEN > Crear PEC sin proveedor: el botón queda deshabilitado.
- Crear un PEC: sale el aviso con 'Ver PEC'.
- Forzar el 401 de H23: la ventana de sesión queda encima de los avisos.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
No aplica: solo cambia el frontend, sin datos ni migraciones.
```

**Riesgos:**

```text
- Toca los mismos archivos que el Bloque 1 (Hub, solicitud-client, solicitud/[id], cotizacion/[id], venta/[id], venta-client, flujo, layout y api.ts). Debe ir DESPUÉS de las tareas de frontend del Bloque 1 (T9–T11 y H23) y ANTES de los demás grupos del Bloque 2 que reescriben handlers con alert: chatter, detalle-sc (saveEdit y datos del cliente), formulario-nueva-sc (NewClientModal) y estados-sc-y-cotizar (confirmarSC). Así esos grupos usan useAvisos desde el principio, y el test guardián los frena si dejan un alert.
- Pasar de confirm a confirmar() vuelve async los manejadores, por ejemplo el onChange del select de estado de la COT. Hay que conservar value="" para que no quede seleccionada una opción mientras la ventana está abierta.
- Los adaptadores setToast/showToast dependen de la firma actual ({msg,type}). Si el Bloque 1 lee la variable `toast` en otro lugar, hay que revisarlo al implementar.
- ui/Toast.tsx sigue existiendo y lo usan otros módulos. En Ventas deja de usarse, para que no haya dos pilas de avisos superpuestas.
- api.ts debe importar './avisos.js' con ruta relativa. Con el alias '@/' fallaría la prueba de node que H23 escribe sobre el apiFetch real.
- Fuera de alcance: unas 45 llamadas nativas en otros módulos (compras, inventario, CRM, marketing, calendario, chat). El proveedor es global, así que migrarlas después es mecánico. Las 4 páginas de simulación (exportar-día, exportar-rango, proyecciones, validación Odoo) solo cambian el aviso, no la función.
```

**Archivos (diseño):** `frontend/src/lib/avisos.js`, `frontend/src/components/ui/Avisos.tsx`, `frontend/src/components/ui/index.ts`, `frontend/src/components/ui/Modal.tsx`, `frontend/src/components/ui/Button.tsx`, `frontend/src/lib/api.ts`, `frontend/src/app/dashboard/layout.tsx`, `frontend/src/app/dashboard/ventas/page.tsx`, `frontend/src/app/dashboard/ventas/flujo.tsx`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, `frontend/src/app/dashboard/ventas/venta/venta-client.tsx`, `frontend/src/app/dashboard/ventas/exportar-dia/page.tsx`, `frontend/src/app/dashboard/ventas/exportar-rango/page.tsx`, `frontend/src/app/dashboard/ventas/proyecciones/page.tsx`, `frontend/src/app/dashboard/ventas/validacion-odoo/page.tsx`, `frontend/tests/test_avisos.mjs`, `frontend/tests/test_sin_dialogos_nativos.mjs`, `frontend/package.json`


### U18+H33 — Cancelar y restaurar, completos en la Actividad

**Decisiones del usuario:**
- Marcado por el usuario: **bien**
- Pregunta quitada por el crítico: Hoy el motivo de una cancelación también se escribe dentro de las Notas de la solicitud ('[CANCELADA] Razón: …'), y esas notas pasan después a la cotización y al pedido. ¿Qué hacemos? → decisión: **Guardarlo solo en la Actividad y en el aviso de 'Solicitud cancelada', y limpiar también las notas viejas que ya lo tienen (con respaldo)** (opción recomendada; regla R3).

**Lo que notará el usuario:** Al cancelar una solicitud, la Actividad muestra todo: el motivo, quién la canceló, si se anuló el enlace que tenía el cliente, si el cliente quedó como perdido en el CRM y hasta cuándo queda en la Papelera. El motivo ya no se mezcla con las Notas de la solicitud. Al restaurarla, el aviso dice el estado real en el que queda (por ejemplo 'queda Asignada porque tiene asesor') y trae un botón para abrirla. La Actividad explica por qué quedó así y que hay que volver a enviársela al cliente. Si el cliente estaba como perdido en el CRM, vuelve a 'Nuevo Lead'. Eliminar una solicitud para siempre, a mano o a los 30 días, también deja rastro.

**Para el usuario:** Pediste que todo quede registrado en la Actividad. Hoy el motivo de la cancelación se pega dentro de las Notas, y esas notas viajan después a la cotización y al pedido. Restaurar desde la Papelera dice 'restaurada a Borrador' aunque la solicitud queda Asignada, y no deja claro qué falta para seguir. Con este arreglo la cancelación queda en la Actividad con todo su detalle y las Notas quedan como las escribió el asesor. Restaurar deja la solicitud en el estado correcto y lo dice: Asignada si tiene asesor, Borrador si no, o el estado de su cotización si todavía tiene una activa. También explica que hay que reenviarla al cliente, y devuelve al cliente a 'Nuevo Lead' en el CRM. Restaurar una solicitud que no está cancelada ya no se permite, porque hoy la reinicia.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
Sí. N4: cancelar_solicitud ya trae with_for_update, bloqueo por documentos activos, la rama SENT_TO_TRASH y el lead a 'Perdido'; aquí se agregan el detalle y la vuelta del lead al restaurar, y se reutiliza _documentos_activos_de_solicitud. N4-Papelera: aquí se reutiliza su helper de referencias, y la purga y eliminar_permanente reciben el rastro DELETED/PURGED. H7+H41: etiqueta_estado para 'Solicitud restaurada a Asignada' y el 409. H35+H48: la nota de la SC llega a la COT y al PVEN, por eso no debe llevar '[CANCELADA] Razón'. N7: _MAPA_ESTADO_COTIZACION_A_SOLICITUD ya sin RECHAZADA. H49 (este mismo bloque): useAvisos para el aviso de restaurar.
```

**Cambios (diseño):**

```text
BACKEND — backend/app/api/v1/erp_ventas.py
1) Helpers nuevos:
   - _detalle(etiqueta, texto) devuelve {'campo':'detalle','etiqueta':etiqueta,'antes':None,'despues':texto}.
   - _lead_de_solicitud(db, sc_id): `from app.models.sales import SalesOrder as LeadCRM` (alias para no confundirlo con SaleOrder). Devuelve el primer lead con canonical_customer_request_id == sc_id.
   - _texto_papelera(db, sc):
     · Calcula refs = _referencias_de_solicitud(db, sc.id) (cotizaciones, pedidos y lead; es el helper de N4-Papelera. Si N4 dejó esa lógica solo en SQL dentro de get_papelera y eliminar_permanente, se extrae aquí y la usan los tres).
     · Con referencias: 'Se conserva como historial (tiene cotización COT-…, …)'.
     · Sin referencias: f'Se elimina definitivamente el {fecha} si nadie la restaura'. fecha es (eliminada_at UTC + 30 días) llevada a America/Bogota, en formato dd/mm/aaaa.
2) cancelar_solicitud (sobre la versión de N4: with_for_update, bloqueo por documentos activos, rama SENT_TO_TRASH y lead a CANCELLED):
   - Según la respuesta a motivo_en_notas: se elimina `sc.notas = f"{sc.notas or ''}\n[CANCELADA] Razón: {razon}".strip()`. El motivo queda en razon_cancelacion y en la Actividad. Con la opción 3 esa línea se deja.
   - enlaces = contar_tokens_vigentes(db,'SC',sc.id), contado ANTES de revocar.
   - Se revoca ANTES de escribir el log; hoy se hace al revés.
   - lead_perdido = había lead y mover_lead_de_solicitud(…,'CANCELLED') de N4 no falló.
   - _log CANCELLED con description f'Solicitud cancelada. Motivo: {razon}' (antes 'Cancelada: {razon}'), old→CANCELADA, el mismo user_name y extra_data={'motivo': razon, 'cambios':[...]}. Los cambios son:
     · _detalle('Motivo', razon).
     · _detalle('Enlace de confirmación', 'Anulado: el cliente ya no puede confirmar con el enlace que se le envió'), solo si enlaces > 0.
     · _detalle('Cliente en el CRM', 'Marcado como perdido'), solo si lead_perdido.
     · _detalle('Papelera', _texto_papelera(db, sc)).
   - La rama de N4 'ya estaba CANCELADA → SENT_TO_TRASH' agrega extra_data con _detalle('Papelera', …).
3) backend/app/core/confirmation_tokens.py: nuevo `contar_tokens_vigentes(db, document_type, document_id) -> int`, con un COUNT de los que tienen used_at IS NULL y expires_at > utcnow(). revoke_pending_tokens no cambia.
4) restaurar_solicitud (H33):
   - Cargar con .with_for_update(); 404 si no existe.
   - Si sc.estado != 'CANCELADA' → 409 f'La solicitud {numero} no está cancelada (está {etiqueta_estado("SC", sc.estado)}); no hay nada que restaurar.' Hoy acepta cualquier estado, la reinicia a BORRADOR/ASIGNADA y revoca su enlace.
   - El estado final se calcula ANTES de escribir, con cots, pvens = _documentos_activos_de_solicitud(db, sc.id) (helper de N4):
     · Si hay COT activa: _MAPA_ESTADO_COTIZACION_A_SOLICITUD.get(cot_mas_reciente.estado, 'COTIZADA'), con motivo f'tiene la cotización {cot.numero} activa'. Solo pasa con datos viejos, porque N4 ya impide cancelar en ese caso.
     · Si no, y hay advisor_user_id: 'ASIGNADA', con motivo f'tiene asesor asignado ({sc.advisor_name or "asesor"})'.
     · Si no: 'BORRADOR', con motivo 'no tiene asesor asignado'.
   - Una sola escritura del estado:
     · había_confirmación = sc.gate1_confirmed_at is not None.
     · sc.estado = final; sc.eliminada_at = None; sc.updated_at = utcnow; sc.gate1_confirmed_at = None; commit.
     · Se eliminan el UPDATE crudo a 'BORRADOR' con su try/except y el segundo commit. Hoy la SC pasa un instante por BORRADOR con asesor.
   - enlaces = contar_tokens_vigentes(...); luego revoke_pending_tokens(db,'SC',id), como hoy.
   - Lead: si existe y lead.status == 'CANCELLED', mover_lead_de_solicitud(sc.id, 'QUOTATION' si hay COT activa, si no 'DRAFT', db) dentro de try/except con logger.warning. Hoy N4 deja el lead en 'Perdido' al cancelar y nada lo devuelve al restaurar.
   - _log RESTORED con description f'Solicitud restaurada a {etiqueta_estado("SC", final)}' (H7), CANCELADA→final, user=email. En extra_data.cambios:
     · _detalle(f'Queda {etiqueta}', motivo).
     · _detalle('Motivo de la cancelación', sc.razon_cancelacion), si existe.
     · _detalle('Confirmación del cliente', 'Hay que volver a enviársela al cliente'), si había_confirmación o enlaces > 0.
     · _detalle('Cliente en el CRM', 'Vuelve a Nuevo Lead' o 'Vuelve a Cotización Enviada'), si se movió.
   - Respuesta: {'id', 'numero', 'estado': final, 'estado_label': etiqueta, 'mensaje': f'{numero} restaurada: queda {etiqueta} porque {motivo}.'}.
5) eliminar_permanente, después del chequeo de referencias de N4-Papelera: db.add(ActivityLog(entity_type='SC', entity_id=sc.id, entity_numero=sc.numero, action='DELETED', description=f'Solicitud {numero} eliminada definitivamente de la Papelera', old_estado='CANCELADA', user_name=email, extra_data={'cliente': sc.customer_name, 'motivo_cancelacion': sc.razon_cancelacion})).
   - Va en el MISMO commit que db.delete(sc). No se usa _log, que hace commit aparte: si el borrado fallara quedaría un rastro falso.
6) get_papelera, sobre la purga de N4-Papelera: `DELETE … RETURNING id, numero, customer_name, razon_cancelacion`.
   - Por cada fila, db.add(ActivityLog(..., action='PURGED', description='Solicitud eliminada automáticamente: llevaba más de 30 días en la Papelera', old_estado='CANCELADA', user_name='Sistema', extra_data={...})), en el mismo commit de la purga.
7) Solo con la opción 1 de motivo_en_notas: NUEVO backend/scripts/limpiar_notas_cancelacion.py, con el patrón de scripts/backfill_cotizacion_sc_numero.py y del script de H7.
   - quitar_marca_cancelacion(notas), pura: aplica la regex r'\s*\[CANCELADA\] Razón: [^\n]*' → '' y luego strip. '' → None. Devuelve None si no cambió.
   - limpiar(db, aplicar=False, ids=None, tabla_respaldo='customer_requests_respaldo_notas'):
     · Valida el nombre de la tabla con ^[a-z_][a-z0-9_]*$.
     · Solo toca SC con razon_cancelacion no vacía, así el motivo no se pierde.
     · Respaldo en (id, notas_original, notas_nueva, corregido_at) y `UPDATE customer_requests SET notas=:nueva WHERE id=:id AND notas=:original`.
     · Todo en una transacción.
   - DRY-RUN por defecto; --aplicar escribe. Imprime la BD enmascarada, el conteo y ejemplos. El docstring trae el SQL para restaurar.
FRONTEND
8) flujo.tsx, CambiosDeActividad: el campo 'detalle' se muestra como las líneas de producto, solo 'Etiqueta: texto', sin '—' ni flecha: `['productos','productos_sku','mas','detalle']`. Sirve en la SC, la COT, el PVEN y el panel del Hub.
9) solicitud-client.tsx, restaurarSC:
   - `const d = await apiFetch(...); const r = d?.data ?? d;`.
   - avisar(r?.mensaje || `Solicitud restaurada: queda ${ESTADOS_SC[r?.estado]?.label || r?.estado}`, {tono:'ok', accion:{texto:'Ver solicitud', href:`/dashboard/ventas/solicitud/${id}`}}), con useAvisos de H49.
   - Luego loadPapelera() y load(), como hoy.
10) solicitud/[id]/page.tsx: ACTIVITY_STYLE, ACTIVITY_TYPE_LABELS y ACTIVITY_TYPE_ORDER agregan SENT_TO_TRASH (icono Trash2, rose, 'Papelera'), el renglón que crea N4.
```

**Comportamiento esperado:**

```text
- Cancelar una SC, desde el detalle, la lista, el Hub (N3) o en lote (N4), deja un renglón 'Solicitud cancelada. Motivo: X' con el autor, el cambio de estado y el detalle:
  - Motivo.
  - Enlace de confirmación anulado, solo si había uno vigente.
  - Cliente marcado como perdido en el CRM, solo si tenía lead.
  - Papelera: 'Se elimina definitivamente el dd/mm/aaaa si nadie la restaura' o 'Se conserva como historial (tiene …)'.
- Con la opción 1 o 2, las Notas de la SC ya no reciben '[CANCELADA] Razón: …'. Esas notas tampoco llegan a la COT ni al PVEN (H35+H48).
- Restaurar:
  - Solo funciona sobre una SC CANCELADA; en otro estado responde 409 con mensaje claro.
  - Queda Asignada si tiene asesor y Borrador si no. Si conserva una COT activa (dato viejo), toma el estado que corresponde a esa COT.
  - Siempre: eliminada_at vacío, confirmación anterior anulada y enlaces pendientes revocados, como hoy.
  - El lead del CRM que estaba en 'Perdido' vuelve a 'Nuevo Lead', o a 'Cotización Enviada' si hay COT activa.
  - El aviso dice el estado real y por qué, con 'Ver solicitud'. La Actividad lo explica y pide reenviarla al cliente cuando había confirmación o enlace.
- Eliminar definitivamente, a mano o por la purga de 30 días, deja un renglón DELETED o PURGED en activity_logs con número, cliente y motivo. Es un rastro de auditoría: la SC ya no existe, así que ninguna pantalla lo muestra hoy.
- Los renglones CANCELLED viejos no se reescriben, porque contienen el motivo escrito por el usuario.
```

**Pruebas (diseño):**

```text
Archivo nuevo backend/tests/test_cancelar_restaurar_actividad.py, con el estilo de test_actividad_cambios_documentos.py: auth(), _actividades() y fixtures app_client, db, admin_token, user_admin. Correr SOLO con el runner de ROLLBACK, desde el backend del worktree: `C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe tests/rollback_runner.py test_cancelar_restaurar_actividad`. Sin parametrize.
1) test_cancelar_registra_motivo_enlace_y_papelera:
   - Preparación: SC ASIGNADA con advisor_user_id=user_admin.id, productos, customer_email y notas 'Entregar en obra'. POST /enviar-confirmacion (crea un token vigente).
   - POST /cancelar {razon:'El cliente ya no la necesita', user_name:'asesor@test'} → 200.
   - db.refresh: notas == 'Entregar en obra' (opción 1/2) y razon_cancelacion guardada.
   - El último CANCELLED tiene description 'Solicitud cancelada. Motivo: El cliente ya no la necesita'.
   - Sus etiquetas de extra_data.cambios incluyen 'Motivo', 'Enlace de confirmación' y 'Papelera'; 'Papelera' empieza por 'Se elimina definitivamente el '.
2) test_cancelar_sin_enlace_no_menciona_el_enlace: SC BORRADOR sin token → los cambios no tienen 'Enlace de confirmación'.
3) test_restaurar_con_asesor_queda_asignada_y_lo_explica:
   - SC CANCELADA con asesor, razon 'Prueba restaurar' y eliminada_at=utcnow.
   - POST /restaurar → 200, data.estado 'ASIGNADA' y 'Asignada' en data.mensaje.
   - db: eliminada_at None y gate1 None.
   - RESTORED con description 'Solicitud restaurada a Asignada' y 'Motivo de la cancelación' en los cambios.
4) test_restaurar_sin_asesor_queda_borrador: estado 'BORRADOR' y mensaje con 'Borrador'.
5) test_restaurar_una_solicitud_que_no_esta_cancelada_da_409: SC ASIGNADA → 409; el estado no cambia y no hay renglón RESTORED.
6) test_restaurar_con_cotizacion_activa_toma_su_estado: SC CANCELADA + COT BORRADOR con sc_id → estado 'COTIZADA'.
7) test_restaurar_devuelve_el_lead_a_nuevo:
   - Customer DEMO + SalesOrder del CRM (customer_id, status='CANCELLED', canonical_customer_request_id=sc.id, lead_source='SC').
   - Restaurar → lead.status == 'DRAFT' y 'Cliente en el CRM' en los cambios.
8) test_eliminar_definitivamente_deja_rastro: SC CANCELADA sin referencias → DELETE /permanente → 200; existe ActivityLog SC 'DELETED' con entity_id del borrado y el número en la descripción.
9) test_purga_automatica_deja_rastro: SC CANCELADA con eliminada_at de hace 40 días y sin referencias → GET /papelera; la fila ya no existe y hay ActivityLog 'PURGED' para ese id. Borra de verdad dentro de la transacción: solo con el runner de ROLLBACK.
10) test_limpiar_notas_respalda_y_es_idempotente (solo opción 1):
   - SC con notas 'Entregar en obra\n[CANCELADA] Razón: Ya no' y razon_cancelacion 'Ya no'.
   - limpiar(db, aplicar=True, ids=[id], tabla_respaldo='customer_requests_respaldo_notas_test') → notas == 'Entregar en obra'.
   - Una SC sin razon_cancelacion no se toca.
   - Una segunda corrida da 0.
   - En finally: DROP TABLE IF EXISTS de la tabla de prueba.
Deben seguir pasando: test_confirmacion_solicitud.py::test_restaurar_solicitud_con_asesor_todavia_puesto_vuelve_a_asignada y test_pill_cancelar_restaurar_reenviar_revoca_token_viejo (la versión ajustada por N4).
FRONTEND: `npx tsc --noEmit`, filtrando a flujo.tsx, solicitud-client.tsx y solicitud/[id]/page.tsx.
MANUAL:
- Cancelar SC DEMO → la Actividad muestra el detalle y las Notas quedan limpias.
- Restaurar desde la Papelera → aviso 'queda Asignada porque…' con 'Ver solicitud'.
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
Consultas de solo lectura hechas en erp_test (transacción READ ONLY):
- 2 SC, ambas CANCELADA, tienen '[CANCELADA] Razón:' en las notas.
- Hay 3 renglones CANCELLED y 1 RESTORED, con el texto 'Solicitud restaurada a ASIGNADA'. Ese código de estado lo corrige el script de H7+H41.
Consultas para revisar con el usuario:
(a) Notas con la marca: SELECT id, numero, estado, razon_cancelacion, notas FROM customer_requests WHERE notas LIKE '%[CANCELADA] Razón:%';
    Solo con la opción 1 y con el OK del usuario: correr limpiar_notas_cancelacion.py en dry-run, mostrar el resultado y después --aplicar en erp_test. En producción, el mismo proceso con su propio OK.
(b) Leads que quedaron 'Perdido' con la SC ya restaurada (informativa): SELECT l.id, cr.numero, cr.estado FROM sales_orders l JOIN customer_requests cr ON cr.id=l.canonical_customer_request_id WHERE l.status='CANCELLED' AND cr.estado<>'CANCELADA';
    Con OK, se mueven a DRAFT o QUOTATION con mover_lead_de_solicitud.
No hay migración.
```

**Riesgos:**

```text
- Quitar el motivo de las Notas depende de H31 (grupo detalle-sc): el detalle de una SC cancelada debe mostrar el motivo en su aviso. Mientras tanto se ve en la Actividad, en la Papelera y en la pestaña 'Canceladas' (razon_cancelacion). getRazonCancelacion conserva la lectura desde las notas para datos viejos.
- restaurar_solicitud empieza a responder 409 si la SC no está cancelada. Hoy solo la llama la Papelera.
- revoke_pending_tokens y mover_lead_de_solicitud hacen commit por su cuenta: la restauración no es una única transacción. Se mantiene igual que hoy; si H29 deja un parámetro commit=False, conviene usarlo.
- Los renglones DELETED y PURGED no tienen pantalla: son rastro de auditoría.
- La fecha de purga se calcula con eliminada_at (UTC sin zona) y la purga usa NOW() de la base. Puede haber un día de diferencia; es preexistente y la fecha se muestra en hora de Colombia.
- mover_lead_de_solicitud puede crear las etapas estándar del CRM si faltan (_asegurar_etapas_estandar), igual que hoy.
```

**Archivos (diseño):** `backend/app/api/v1/erp_ventas.py`, `backend/app/core/confirmation_tokens.py`, `backend/scripts/limpiar_notas_cancelacion.py`, `backend/tests/test_cancelar_restaurar_actividad.py`, `frontend/src/app/dashboard/ventas/flujo.tsx`, `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`


### H26 — Solicitud sin precios en la Actividad

**Decisiones del usuario:**
- Marcado por el usuario: **bien**

**Lo que notará el usuario:** En la Actividad de una solicitud, los productos agregados o quitados aparecen sin precio ('Nivel láser ×1'), porque una solicitud todavía no tiene precios. En las cotizaciones y los pedidos los precios siguen apareciendo como hoy.

**Para el usuario:** Cuando se agregan o se quitan productos de una solicitud, la Actividad decía 'Producto agregado: Nivel láser DEMO ×1 a $0'. Ese '$0' confunde, porque en la solicitud nadie ha puesto precios. Ahora dice 'Producto agregado: Nivel láser DEMO ×1'. Los cambios de cantidad siguen registrándose. En la cotización y en el pedido no cambia nada: ahí el precio sí importa y se sigue mostrando.

**Depende del Bloque 1 (texto del diseño; "Tn" = B1-Tn):**

```text
No. Solo copia el patrón del script de datos de H7+H41 (backend/scripts/corregir_textos_actividad.py) para corregir las actividades viejas, con una tabla de respaldo propia.
```

**Cambios (diseño):**

```text
BACKEND — backend/app/core/cambios_documento.py
1) `_SIN_PRECIO = {"SC"}`, con un comentario: en una Solicitud el cliente pide productos y los precios aparecen en la Cotización. Las líneas de la SC llegan con unit_price_cop 0 desde solicitud-client y productos-solicitud.
2) `_resumen_linea(linea, con_precio=True)`: agrega ' a $X' solo si con_precio y el precio no es None.
3) `_cambios_productos(antes, despues, con_precio=True)`:
   - Pasa con_precio a _resumen_linea en 'Producto agregado' y en 'Producto eliminado'.
   - Sin precio no se comparan '— precio unitario' ni '— total'; sí la cantidad y el vínculo al catálogo (productos_sku).
4) `comparar(...)`: `_cambios_productos(a, d, con_precio=entidad not in _SIN_PRECIO)`.
5) `cambian_productos` no cambia: sigue comparando con precio, porque lo usa la invalidación de Gate 1 en update_solicitud.
6) Nueva función pura `limpiar_precios_sc(cambios) -> list | None`:
   - Trabaja sobre una copia.
   - En las entradas campo 'productos' con etiqueta 'Producto agregado' o 'Producto eliminado', quita de antes y despues el sufijo que calza con `_PRECIO_AL_FINAL = re.compile(r" a -?\$[\d.]+(?:,\d+)?$")`.
   - Quita las entradas de productos cuya etiqueta termina en ' — precio unitario' o ' — total'.
   - Devuelve None si nada cambió.
7) NUEVO backend/scripts/corregir_actividad_sc_sin_precio.py, con el patrón del script de H7+H41 (sys.path, SessionLocal, _mask_url):
   - corregir(db, aplicar=False, ids=None, tabla_respaldo='activity_logs_respaldo_sc_precio'). El nombre de la tabla se valida con ^[a-z_][a-z0-9_]*$.
   - Selecciona los ActivityLog con entity_type='SC' y jsonb_typeof(extra_data->'cambios')='array' (y id ∈ ids si se pasa), y calcula limpiar_precios_sc.
   - Con aplicar:
     · CREATE TABLE IF NOT EXISTS <tabla>(id INTEGER PRIMARY KEY, extra_data_original JSONB NOT NULL, extra_data_nueva JSONB NOT NULL, corregido_at TIMESTAMP NOT NULL DEFAULT (now() at time zone 'utc')).
     · INSERT … ON CONFLICT (id) DO NOTHING.
     · UPDATE activity_logs SET extra_data = CAST(:nueva AS jsonb) WHERE id = :id AND extra_data = CAST(:original AS jsonb).
     · Todo en una sola transacción, con rollback ante cualquier error.
   - Sin aplicar: rollback.
   - Devuelve {candidatas, corregidas, ejemplos}.
   - main(): DRY-RUN por defecto; --aplicar escribe. Imprime la BD enmascarada, el conteo y hasta 50 ejemplos 'antes → después'.
   - El docstring trae el SQL para deshacer: UPDATE activity_logs a SET extra_data = r.extra_data_original FROM <tabla> r WHERE a.id = r.id AND a.extra_data = r.extra_data_nueva.
FRONTEND: nada. CambiosDeActividad muestra lo que guarda el backend.
```

**Comportamiento esperado:**

```text
- Al guardar productos de una SC, la Actividad registra 'Producto agregado: X ×N', 'Producto eliminado: X ×N' y 'X — cantidad: 1 → 3', sin '$'.
- Un cambio que solo toca el precio de una línea de la SC no se registra. En una SC no hay precios, así que es ruido.
- COT y PVEN no cambian: siguen con 'Coche ×1 a $70.000', '— precio unitario' y '— total'.
- Se sigue invalidando la confirmación del cliente cuando cambian los productos de la SC: cambian_productos no cambia.
- El script solo toca entradas de productos generadas por el sistema en renglones de SC. Nunca toca notas, chatter ni motivos.
```

**Pruebas (diseño):**

```text
Archivo nuevo backend/tests/test_actividad_sc_sin_precio.py (sin parametrize; primero las pruebas puras y luego las de API y base). Correr SOLO con el runner de ROLLBACK: `C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe tests/rollback_runner.py test_actividad_sc_sin_precio`, desde el backend del worktree.
1) test_sc_producto_agregado_sin_precio: cd.comparar('SC', {'productos': []}, {'productos':[{'product_name':'Nivel laser','qty':1,'unit_price_cop':0}]}) == [{'campo':'productos','etiqueta':'Producto agregado','antes':None,'despues':'Nivel laser ×1'}].
2) test_sc_eliminado_y_cantidad_sin_precio:
   - antes = [Nivel ×1 $0, Taladro ×2 $0]; despues = [Taladro ×3 $0].
   - Etiquetas == ['Taladro — cantidad', 'Producto eliminado'].
   - El 'antes' del eliminado == 'Nivel laser ×1'.
   - Ningún antes ni despues contiene '$'.
3) test_sc_cambio_solo_de_precio_no_registra_nada: misma línea con unit_price_cop 0 → 5000 → comparar('SC') == [], y cd.cambian_productos(...) sigue en True.
4) test_cot_y_ven_siguen_mostrando_precio: comparar('COT', …) y comparar('VEN', …) siguen con 'Coche ×1 a $70.000'.
5) test_limpiar_precios_sc:
   - [{'campo':'productos','etiqueta':'Producto agregado','antes':None,'despues':'Nivel laser DEMO ×1 a $0'}] → 'Nivel laser DEMO ×1'.
   - Aplicarla de nuevo devuelve None.
   - Una entrada 'Notas' no se toca.
6) test_patch_productos_de_la_sc_registra_la_actividad_sin_precio:
   - SC BORRADOR por ORM, sin productos.
   - PATCH /ventas/solicitudes/{id} {'productos':[{'product_name':'Nivel laser DEMO','qty':1,'unit_price_cop':0}], 'updated_by':'t'} → 200.
   - En GET /solicitudes/{id}, el renglón UPDATED tiene extra_data.cambios[0]['despues'] == 'Nivel laser DEMO ×1'.
7) test_script_corrige_respalda_y_es_idempotente:
   - Insertar 2 ActivityLog: uno de SC con 'a $0' y uno de COT con 'a $70.000'.
   - corregir(db, aplicar=True, ids=ids, tabla_respaldo='activity_logs_respaldo_sc_precio_test') → corregidas == 1.
   - El de COT queda intacto y el respaldo tiene el original.
   - Una segunda corrida da 0.
   - En finally: DROP TABLE IF EXISTS de la tabla de prueba.
8) test_script_en_modo_reporte_no_escribe: aplicar=False → candidatas == 1 y la fila sigue igual.
Debe seguir pasando test_actividad_cambios_documentos.py completo (los casos de COT con precio no cambian).
```

**Datos existentes:** (solo T12, con OK del usuario)

```text
Consulta de solo lectura hecha en erp_test: hay 1 renglón de Actividad de SC (1 solicitud) con ' a $' en extra_data.cambios. Consulta para el usuario:
SELECT a.id, a.entity_numero, a.created_at FROM activity_logs a WHERE a.entity_type='SC' AND jsonb_typeof(a.extra_data->'cambios')='array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(a.extra_data->'cambios') c WHERE c->>'campo'='productos' AND (coalesce(c->>'antes','') ~ ' a \$[0-9.,]+$' OR coalesce(c->>'despues','') ~ ' a \$[0-9.,]+$'));
El usuario decidió corregir las actividades viejas. Procedimiento: dry-run en erp_test, mostrar el resultado y, con su OK, --aplicar. En producción, lo mismo con un OK aparte. La tabla de respaldo se borra cuando el usuario lo decida.
```

**Riesgos:**

```text
- Bajo. Solo cambia la presentación de los cambios de productos de la SC. COT y PVEN quedan igual, y la invalidación de Gate 1 no se toca.
- Si algún día una SC llega a tener precios propios, habría que quitar 'SC' de _SIN_PRECIO.
- El script escribe en activity_logs. Lleva respaldo, es idempotente, el UPDATE exige que el valor siga igual y se corre solo con el OK del usuario en cada base.
```

**Archivos (diseño):** `backend/app/core/cambios_documento.py`, `backend/scripts/corregir_actividad_sc_sin_precio.py`, `backend/tests/test_actividad_sc_sin_precio.py`


