# Ventas B2.1: decisiones de la revisión del Bloque 2 (plan de implementación)

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:subagent-driven-development. Pasos con casillas (`- [ ]`).

**Objetivo:** aplicar los 7 cambios que el usuario decidió en la página de revisión del Bloque 2 (2026-10-15). Son
fallas que existían antes del bloque, más dos reglas del flujo.

**Arquitectura:** cambios acotados en el backend (FastAPI) y el frontend (Next.js 16), con TDD y el runner de rollback.
Sin migraciones.

**Stack:** FastAPI + SQLAlchemy + PostgreSQL (erp_test) · Next.js 16 · pruebas node (`frontend/tests/*.mjs`).

**Spec:** la sección «Decisiones del usuario» de abajo es la especificación. Las preguntas, opciones y respuestas
están en el db de la página https://claude.ai/artifact/2XmU8TJJrLU2NAWNTScuUN (colección `decisiones`, doc
`general`), copiadas aquí literalmente. El mapa del código (archivo:línea de cada sitio) está en
`.superpowers/sdd/2026-10-15-ventas-b2-1-decisiones/mapa-codigo.md`.

## Decisiones del usuario (vinculantes)

| Clave | Pregunta | Respuesta |
|---|---|---|
| registro | Hoy cualquiera puede crear una cuenta en el ERP desde internet (el registro es público). | **Cerrarlo: solo un administrador crea cuentas** |
| purga_papelera | Abrir la Papelera borra para siempre las solicitudes canceladas hace más de 30 días. | **Que el borrado lo haga una tarea programada (o un botón del administrador), no el solo hecho de abrir la Papelera** |
| pedido_directo | Existe una ruta interna que crea pedidos sin pasar por la cotización confirmada. | **Exigir la cotización confirmada, como en las pantallas** |
| chat_produccion | El asistente flotante se conecta al servidor de producción aunque la app sea la de pruebas. | **Que use el servidor configurado (el de pruebas en pruebas)** |
| correo_tienda | La tienda web guarda el correo del cliente sin revisar que sea un correo válido. | **Validar el formato en el servidor** |
| motivo_ciclo | Si una solicitud se cancela y se restaura, retomar su cotización temprana reutiliza el motivo del ciclo anterior. | **Pedir un motivo nuevo al retomarla** |
| modalidad_cr | Cualquier modalidad de pago que empiece por «cr» se cobra sin anticipo (por ejemplo, «Cruce de cuentas»). | **Usar solo la lista exacta de modalidades a crédito** |

Se quedan como están, por decisión del usuario: enlace_crudo, clientes_por_rol, borrar_cliente, montos_360 y
autor_falso.

## Reglas del controlador (rulings)

- **D1 — Registro.**
  - `POST /auth/register` exige sesión de ADMIN (`require_roles(*ROLE_ADMIN)`). Sin sesión responde 401 y con otro
    rol, 403.
  - El rol pedido se normaliza y debe estar en `ALL_ERP_ROLES`; si no, 422 legible. ADMIN sigue prohibido (403), como
    hoy.
  - La pantalla de Empleados (`admin/empleados`) ya llama a esa ruta con la sesión del administrador y no cambia.
  - En el frontend:
    - `/register` deja de tener formulario y muestra «Las cuentas las crea un administrador del ERP», con un
      enlace a «Iniciar sesión». Se permite reescribir más del 30 % de `app/register/page.tsx` (excepción R14
      registrada: es una página pública sin lógica de negocio).
    - `login/page.tsx` quita el enlace a `/register`.
    - `register()` de `lib/api.ts` se borra si nadie más la usa.
- **D2 — Papelera.**
  - `GET /ventas/papelera` solo lista y nunca borra.
  - Se agrega `POST /ventas/papelera/purgar`, solo para ADMIN.
    - Hace la misma purga de hoy: SC CANCELADA con `eliminada_at` de hace más de 30 días y sin documentos, y su
      renglón `PURGED`, todo en el mismo commit.
    - El autor del renglón es la sesión (`nombre_de_usuario(user)`).
    - Responde `{purgadas: n, numeros: [...]}`.
    - Si falla, hace rollback y responde 500 legible, sin borrar nada a medias.
  - En la pestaña Papelera, el ADMIN ve el botón «Vaciar las vencidas». Pide confirmación con `confirmar()` y avisa
    cuántas borró.
  - Las filas con `dias_restantes <= 0` dicen «Vencida: se borra cuando un administrador vacíe la Papelera».
  - La tarea programada queda para B3-T10 («Revisión automática cada 10 minutos»): ahí se agrega la purga al ciclo.
    Nota de traspaso para el B3.
- **D3 — Pedido directo.** `POST /ventas/pedidos/canonico`:
  - pasa a solo ADMIN;
  - exige `cot_id` de una COT en estado CONFIRMADA con `gate2_confirmed_at`: 400 si no tiene la confirmación, igual
    que `convertir_cotizacion_a_venta`;
  - responde 409 si la COT ya tiene un PVEN vigente (`_pven_vigente_de_cotizacion`);
  - exige que `customer_id` sea el de la COT y que `sc_id`, si viene, sea el de la COT: 422 si no;
  - consume la marca (`gate2_confirmed_at = None`) en el mismo commit del pedido.
  - Las líneas y los precios siguen saliendo del cuerpo. Es residual documentado, porque la ruta ahora es solo de
    ADMIN, igual que el «pedido suelto» de `create_pedido`.
  - Las pruebas de `test_fase4_*` que usan esta ruta para preparar sus datos pasan por un helper de prueba nuevo,
    `backend/tests/_cot_confirmada.py::cot_confirmada_para_canonico(db, customer_id) -> cot_id`. El helper crea en la
    transacción de la prueba una COT CONFIRMADA con la marca y le pasa el `cot_id` al cuerpo.
  - Ninguna prueba se borra: solo cambia su preparación.
- **D4 — Asistente flotante.**
  - Un solo helper `urlWebSocket(ruta)` en `frontend/src/lib/api.ts` deriva la URL del WebSocket de `API_URL`: quita
    `/api/v1` del final y pasa `http`→`ws` y `https`→`wss`.
  - `GlobalAIChat.tsx` lo usa para `/ws/chat/global` y usa `API_URL` en su respaldo REST, en vez de
    `localhost:5000`.
  - `solicitud/[id]/page.tsx:1380` (`apiBase` del panel IA) usa `API_URL` en vez de la URL de producción escrita a
    mano.
  - Prueba node del helper.
  - No se arregla la ruta inexistente `/chat/message` ni los `NEXT_PUBLIC_API_URL + '/api/...'` de Análisis y
    Proyecciones: son del Bloque 5 y del Bloque 4. Se anotan.
- **D5 — Correo de la tienda.**
  - `app/core/clientes.py` gana `CORREO_VALIDO` (el mismo patrón de `erp_ventas._CORREO_VALIDO`) y
    `correo_valido(texto) -> bool`. `erp_ventas` usa ese patrón, sin una copia propia.
  - `POST /ecommerce/pedidos`, `POST /ecommerce/carritos` (si trae correo) y `POST /store/checkout` responden 422
    «El correo «x» no es válido.» con un correo mal formado, antes de escribir nada.
  - El correo se recorta (`strip`). No se cambia la búsqueda del cliente por correo.
- **D6 — Motivo al retomar.**
  - Al retomar una COT RECHAZADA por la excepción de la puerta B (`_validar_cambio_de_estado_cotizacion`), si la SC
    tiene un renglón `RESTORED` posterior a `cot.sin_confirmacion_sc_at`, la marca es de un ciclo anterior. En ese
    caso el PATCH exige `motivo_sin_confirmacion`:
    - si falta, responde 409 con
      `{codigo: 'MOTIVO_NUEVO', mensaje: 'La solicitud se canceló y se restauró después de esta cotización: escribe un motivo nuevo para retomarla sin la confirmación del cliente.'}`;
    - el motivo nuevo se valida con las reglas de S5 (`_motivo_limpio` y `_error_del_motivo`), con 422 legible;
    - si es válido, actualiza `sin_confirmacion_sc_at` (ahora) y `sin_confirmacion_sc_motivo` en el mismo commit, y
      el renglón del cambio de estado lo nombra («Motivo nuevo: …»).
  - Sin restauración posterior, nada cambia.
  - En el detalle de la COT, el 409 `MOTIVO_NUEVO` abre la misma ventana de motivo de «Cotizar sin confirmación»
    (contador, `errorMotivoSinConfirmacion`) y reintenta el PATCH con el motivo.
- **D7 — Modalidades a crédito.**
  - Crédito = el texto normalizado (`_sin_tildes`) es exactamente uno de `credito 30 dias` o `credito 60 dias` (las
    modalidades a crédito de `MODALIDADES_PAGO`). Se agrega también `credito`, por si alguien la escribe así.
  - `pct_anticipo_de_modalidad` (backend) y `esModalidadCredito` / `pctAnticipoDeModalidad` (frontend) usan esa
    lista. «Cruce de cuentas», «Pago a credito», «Credito 2 cuotas» y «cr. 90 dias» dejan de ser crédito y caen en
    el valor por defecto.
  - Las pruebas de paridad y de anticipo se actualizan a la regla nueva.
  - Datos: erp_test tiene solo las 3 modalidades estándar (consulta de solo lectura del 2026-10-15), así que ningún
    documento cambia su anticipo. Antes de producción hay que repetir la consulta.

## Global Constraints

- **Worktree:** `C:\Users\jmqui\Nebulae_ERP_Work\Mirror\.worktrees\ventas-b2-1-decisiones`, rama
  `ventas-b2-1-decisiones`, desde main `c760100`.
  - `frontend/node_modules` es junction a `Mirror\frontend\node_modules`.
  - `backend/.env` y `frontend/.env.local` son copias: no se leen, no se imprimen, no se versionan.
  - No tocar el checkout principal `Mirror` ni otros worktrees.
  - No tocar los servidores de los puertos 8000, 5000 y 5100. Los de 8020 y 3000 corren del worktree del B2: no los
    toques.
- **Python:** `C:\Users\jmqui\Nebulae_ERP_Work\Mirror\backend\venv\Scripts\python.exe`, desde `<worktree>\backend`.
- **Pruebas del backend:** SOLO con el runner de rollback, `tests/rollback_runner.py <modulo>`, UN módulo por vez.
  NUNCA pytest. Cada salida termina en «Base intacta». Falla preexistente conocida: `test_fase4_ventas_lineas_estados`
  (PendingRollbackError).
- **Regresión al cerrar cada tarea de backend:** los módulos que toca la tarea más:
  - test_estados_solicitud, test_cotizar_sin_confirmacion, test_cancelacion_solicitud_actividad y
    test_cancelar_solicitud_con_documentos;
  - test_confirmacion_cotizacion y test_anticipo_modalidad;
  - test_anticipo_verificado y test_auth_register_role;
  - test_fase5_security_hardening y test_fase5_integracion_erp;
  - test_fase4_cancelaciones y test_fase4_pagos_politicas.
- **Frontend:**
  - `npx tsc --noEmit` = 22 errores, la misma lista de base;
  - `npm test` = 0;
  - los .mjs nuevos van en la línea `test` de `package.json`.
- **Estilo:**
  - Textos en español con tildes.
  - Estados siempre con su etiqueta.
  - `useAvisos` y `confirmar()`: nada de alert, confirm ni prompt.
  - R14: en los .tsx existentes, solo ediciones parciales, con la excepción de D1.
- **Datos:** no se modifican fuera de la transacción de prueba. No tocar SC-20260731, COT-20260449, PVEN-20262799 ni
  SC-20260746.
- **Credenciales:** nunca en código, chat ni prompts.
- **Commits:** en español (`fix(ventas): …`, `fix(auth): …`, `test(...)`), terminando con la línea
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sin push. Los implementadores no despachan subagentes.

---

### Task 1: Backend: registro solo de administrador, purga de la Papelera por botón y correo de la tienda (D1, D2, D5)

**Files:**
- Modificar: `backend/app/api/v1/auth.py` (`register_user`), `backend/app/api/v1/erp_ventas.py` (`get_papelera` y un
  endpoint nuevo `purgar_papelera`; `_CORREO_VALIDO` → `clientes`), `backend/app/core/clientes.py`,
  `backend/app/api/v1/ecommerce.py` (pedidos, carritos), `backend/app/api/v1/store.py` (checkout).
- Pruebas: `backend/tests/test_auth_register_role.py`, `backend/tests/test_cancelar_solicitud_con_documentos.py`,
  `backend/tests/test_cancelacion_solicitud_actividad.py` y un módulo nuevo,
  `backend/tests/test_b21_correo_tienda.py`.

**Interfaces:**
- Produce: `POST /api/v1/ventas/papelera/purgar` → `{status:'success', data:{purgadas:int, numeros:[str]}}` (ADMIN).
  `clientes.correo_valido(texto) -> bool`.

- [ ] **Paso 1: pruebas ROJAS.**
  - **Registro:**
    - sin sesión → 401;
    - ASESOR → 403;
    - ADMIN con rol «Asesor» → 201;
    - ADMIN con rol «Inventado» → 422;
    - ADMIN con rol «admin» → 403;
    - la prueba vieja `test_register_allows_non_admin_role` se ajusta para mandar la sesión de ADMIN.
  - **Papelera:**
    - el GET ya no borra: una SC de 31 días sin documentos sigue en la base y en el listado;
    - `POST /purgar` como ASESOR → 403;
    - como ADMIN, borra esa SC, deja `PURGED` con el autor de la sesión en un solo commit y responde con `numeros`;
    - si falla, no borra nada (monkeypatch del `DELETE` o del commit, como en
      `test_un_fallo_al_purgar_no_vacia_la_papelera`).
    - Ajusta `test_purga_automatica_deja_rastro` y las pruebas de Papelera que hoy esperan la purga al hacer el GET.
  - **Correo de la tienda:**
    - `POST /ecommerce/pedidos` con `customer_email='no-es-correo'` → 422, sin `Customer` ni `SaleOrder` nuevos;
    - lo mismo en `/store/checkout` y en `/ecommerce/carritos`;
    - un correo válido con espacios alrededor se guarda recortado.
- [ ] **Paso 2: implementar** (D1, D2, D5).
- [ ] **Paso 3: VERDE** de los módulos tocados más la regresión de las Global Constraints.
- [ ] **Paso 4: commits**, uno por decisión.

### Task 2: Reglas del flujo: lista exacta de modalidades a crédito y motivo nuevo al retomar (D7, D6 backend)

**Files:**
- Modificar: `backend/app/core/ventas_dinero.py` (`pct_anticipo_de_modalidad`),
  `frontend/src/lib/etiquetas-ventas.js` (`esModalidadCredito`), `frontend/src/lib/etiquetas-solicitud.js`
  (`pctAnticipoDeModalidad`, `MODALIDADES_PAGO` como fuente de la lista), `backend/app/api/v1/erp_ventas.py`
  (`_validar_cambio_de_estado_cotizacion` y `update_cotizacion`).
- Pruebas:
  - `backend/tests/test_anticipo_modalidad.py` y `backend/tests/test_estados_solicitud.py` (paridad, `_MODALIDADES`);
  - `frontend/tests/test_etiquetas_solicitud.mjs`, `frontend/tests/test_etiquetas_ventas.mjs` y
    `frontend/tests/test_dinero_ventas.mjs`;
  - `backend/tests/test_cotizar_sin_confirmacion.py` (casos nuevos de D6).

**Interfaces:**
- Produce: PATCH `/ventas/cotizaciones/{id}` acepta `motivo_sin_confirmacion` (solo se usa en el caso de D6). 409
  `{detail:{codigo:'MOTIVO_NUEVO', mensaje}}`.

- [ ] **Paso 1: pruebas ROJAS.**
  - **D7:**
    - «Cruce de cuentas», «Pago a credito», «Credito 2 cuotas» y «cr. 90 dias» → `None` (backend y frontend, con
      paridad);
    - «Credito 30 dias», «Crédito 60 días», «CREDITO 30 DIAS» y «credito» → 0;
    - «Contado» → 100;
    - 60/40 → 60.
  - **D6:**
    1. Crear una COT temprana.
    2. Rechazarla.
    3. Cancelar la SC.
    4. Restaurar la SC.
    5. PATCH `{estado: BORRADOR}` sin motivo → 409 `MOTIVO_NUEVO`.
    6. Con un motivo de 3 letras → 422 con el texto de S5.
    7. Con un motivo válido → 200, la marca y el motivo nuevos, y el renglón dice «Motivo nuevo: …».

    Sin cancelar ni restaurar, el retomar de hoy sigue funcionando sin pedir motivo (la prueba S4 existente sigue
    verde).
- [ ] **Paso 2: implementar** D7 (una sola lista por lado y paridad) y D6 (consulta del último `RESTORED` de la SC,
  posterior a la marca).
- [ ] **Paso 3: VERDE** + regresión + `npm test` + `tsc`.
- [ ] **Paso 4: commits.**

### Task 3: Pedido directo con cotización confirmada (D3)

**Files:**
- Modificar: `backend/app/api/v1/erp_ventas_fase4.py` (`create_sale_order_canonical`, ~:347-497).
- Crear: `backend/tests/_cot_confirmada.py` (el helper de preparación).
- Pruebas:
  - las de `backend/tests/test_fase4_*.py` y `backend/tests/test_textos_actividad.py` que llaman a
    `/ventas/pedidos/canonico`: solo cambia su preparación;
  - un módulo nuevo, `backend/tests/test_b21_pedido_directo.py`.

- [ ] **Paso 1: pruebas ROJAS** en `test_b21_pedido_directo.py`:
  - ASESOR → 403;
  - ADMIN sin `cot_id` → 422;
  - COT en BORRADOR → 400;
  - COT CONFIRMADA sin la marca → 400;
  - COT con un PVEN vigente → 409;
  - `customer_id` distinto del de la COT → 422;
  - con todo correcto → 201 y la marca queda consumida (`gate2_confirmed_at` None) en un solo commit.
- [ ] **Paso 2: implementar** las guardas de D3 y el helper.
  - Cambia la preparación de los módulos que usan la ruta para que pasen por el helper. Primero lista con grep cada
    llamada y anótala en el reporte.
  - No cambies lo que esas pruebas afirman.
- [ ] **Paso 3: VERDE**, uno por uno: cada `test_fase4_*` que usa la ruta, `test_textos_actividad` y la regresión.
  `test_fase4_ventas_lineas_estados` debe seguir con solo su falla conocida.
- [ ] **Paso 4: commit.**

### Task 4: Frontend de las decisiones (D1, D2, D4, D6)

**Files:**
- Modificar:
  - `frontend/src/app/register/page.tsx` (excepción R14 de D1) y `frontend/src/app/login/page.tsx` (enlace);
  - `frontend/src/lib/api.ts` (`urlWebSocket`; `register()` si queda sin uso);
  - `frontend/src/components/GlobalAIChat.tsx` y `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx`
    (`apiBase`);
  - `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx` (botón «Vaciar las vencidas» y texto de las
    filas vencidas);
  - `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx` (ventana de motivo con el 409 `MOTIVO_NUEVO`).
- Pruebas: `frontend/tests/test_b21_decisiones.mjs`, con el helper `urlWebSocket` y guardias de texto y clases. Va
  en la línea `test`.

- [ ] **Paso 1: guardias y pruebas ROJAS.**
  - `urlWebSocket('/ws/chat/global')` da:
    - con `https://api.x.com/api/v1` → `wss://api.x.com/ws/chat/global`;
    - con `http://localhost:8020/api/v1` → `ws://localhost:8020/ws/chat/global`.
  - Ninguna URL `api.nebulaekids.com` escrita a mano en `GlobalAIChat.tsx` ni en `solicitud/[id]/page.tsx`.
  - `/register` sin formulario.
  - `login` sin enlace a `/register`.
  - El botón de vaciar solo con `esAdministrador`.
- [ ] **Paso 2: implementar.**
  - Papelera: el botón llama a `POST /ventas/papelera/purgar` después de `confirmar()`, avisa «Se borraron N
    solicitudes vencidas» y recarga la Papelera.
  - COT: con el 409 `MOTIVO_NUEVO`, abre la ventana del motivo y reintenta el PATCH con `motivo_sin_confirmacion`.
- [ ] **Paso 3:** `npm test` = 0 y `tsc` = 22.
- [ ] **Paso 4: commit.**

### Task 5: Verificación final y cierre

- [ ] Regresión completa del backend con el runner (la lista de 48 módulos de la regresión final del B2, más los
  módulos nuevos).
- [ ] Build de producción del frontend con `NEXT_PUBLIC_API_URL=http://localhost:8020/api/v1`.
- [ ] Revisión final de toda la rama (`c760100..HEAD`).
- [ ] Ledger. El controlador presenta al usuario las opciones de merge.
