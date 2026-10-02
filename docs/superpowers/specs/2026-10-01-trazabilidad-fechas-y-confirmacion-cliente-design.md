# Trazabilidad de Fecha de Entrega + Confirmación del Cliente — Design Spec

**Fecha:** 2026-10-01
**Estado:** Aprobado por el usuario en chat (forma de resolverlo); este documento es el detalle técnico completo antes de pasar a plan de implementación.

## Contexto y motivación

El usuario pidió, en mensajes separados pero relacionados, el mismo mecanismo subyacente para Solicitud de Cliente y para Cotización: una máquina de estados con una etapa "pendiente de confirmación" en la que se envía un enlace al cliente (WhatsApp/email) para que confirme sin necesitar cuenta, más alertas automáticas de 2 días si nadie atiende el documento, más — solo para Cotización — que la fecha de entrega estimada se herede correctamente desde la Solicitud y que cualquier modificación posterior quede trazada, y que ese compromiso de fecha se sostenga hasta que la mercancía realmente llegue a bodega (con 1 día de tolerancia).

Investigación de código previa (no repetir, ya confirmada por lectura directa) estableció:

- La fecha de entrega estimada existe en 4+ modelos con nombres distintos y se calcula de forma independiente en cada paso: SC→COT hoy **hardcodea 15 días siempre** (`erp_ventas.py:447`, ignora `tipo_solicitud`); COT→PVEN sí copia correctamente (`erp_ventas_fase4.py:2751`); PVEN→PEC es **completamente independiente** (`schemas_compras.py:123`, `dias_entrega` manual default 15, nunca lee el PVEN).
- Hay dos sistemas de tracking paralelos sin relación: `tracking_stages` JSON en PEC (alertas calculadas en vivo, `erp_compras.py:128-168`) y el modelo `Shipment` en logística (`fase2.py`, `erp_logistica.py:1784-1855`) que sí compara fecha estimada vs. real pero vive aislado. Recepciones (`GoodsReceipt`) no tiene ningún concepto de atraso hoy.
- Cero infraestructura de scheduler/cron en todo el backend (grep exhaustivo sin resultados para APScheduler/Celery/cron). Las alertas de hoy (`admin_config`, `/ventas/config`) son 100% client-side/pull.
- El campo `link_confirmacion` (`erp_ventas.py:1427`, endpoint `GET /ventas/solicitudes/{id}/formato-confirmacion`) ya apunta a `/confirmar/{numero}` — **una ruta que nunca se construyó**, ni en frontend ni backend. Es la prueba de que esta necesidad ya se había anticipado.
- Dos patrones reusables ya existen en el código: autenticación dual staff/cliente (`chat.py:770-841`, hoy solo lectura) y endpoints públicos de escritura protegidos con idempotency-key (`store.py:69-74`, `ecommerce.py:603`).
- El agente que está construyendo el reset de contraseña (en curso, commit separado) ya implementa exactamente el patrón de token seguro que este diseño necesita: `secrets.token_urlsafe(32)`, hash SHA-256 almacenado (nunca el token crudo), expiración, marca de uso único, y un helper `send_email()` desacoplado del proveedor SMTP. **Este diseño reutiliza esa infraestructura en vez de duplicarla.**

## Alcance de este documento

Cubre: Solicitud de Cliente (SC) y Cotización (COT). Pedido de Venta (PVEN) y Pedido de Compra (PEC) participan solo en la parte de fecha de entrega (heredar/propagar), no se les agrega máquina de estados nueva ni confirmación por link en esta iteración — el usuario no lo pidió para esos documentos todavía.

Explícitamente fuera de alcance de esta iteración (se deja anotado para cuándo se retome):
- Notificaciones proactivas reales (email/push cuando un documento lleva 2 días sin atención) — requiere construir infraestructura de scheduler (APScheduler o similar) que hoy no existe. Esta iteración entrega la versión "ahora" (badge visible mientras el sistema está abierto); la versión con scheduler queda para una iteración futura explícita.
- OTP/2FA en la confirmación del cliente — el usuario lo pidió explícitamente para después.
- Unificar los dos sistemas de tracking (`tracking_stages` del PEC vs. `Shipment` de logística) en uno solo — se conecta el extremo necesario (PEC → fecha heredada, Recepción → comparación con tolerancia) sin rediseñar ninguno de los dos sistemas por completo.

## 1. Fuente única de fecha de entrega estimada

### Dónde nace

Hoy `CustomerRequest` (SC) no tiene ningún campo de fecha de entrega — nace recién en la Cotización. Se agrega:

- `CustomerRequest.fecha_entrega_estimada` (DateTime, nullable — se calcula al confirmar, no al crear, porque antes de confirmar no se sabe si de verdad procederá).
- `CustomerRequest.modalidad_entrega` (String, default `'NORMAL'`, valores `'NORMAL'` | `'INMEDIATA'`). Se deriva automáticamente de `tipo_solicitud` al crear: si `tipo_solicitud == 'Pedido Inmediato'` → `'INMEDIATA'`, cualquier otro valor → `'NORMAL'`. No se agrega un selector nuevo — se reutiliza el campo `tipo_solicitud` que ya existe y ya tiene esa opción en el dropdown (hoy cosmética, `asistente_omnicanal/page.tsx:855-858`).

### Cálculo por defecto

Al confirmar la Solicitud (`confirmar_solicitud`, donde hoy se hardcodean 15 días):

```python
DIAS_ENTREGA_DEFAULT = {"NORMAL": 18, "INMEDIATA": 3}  # límite superior del rango dado por el usuario (15-18 y 2-3) -- se promete la fecha más conservadora, no la más optimista
```

`fecha_entrega_estimada = fecha_confirmacion + timedelta(days=DIAS_ENTREGA_DEFAULT[modalidad_entrega])`. Esto reemplaza el hardcode de 15 días existente — fix directo del bug ya confirmado, no solo una feature nueva.

### Propagación (herencia, no recálculo)

- **SC → COT** (`confirmar_solicitud`, ya crea la Cotización ahí mismo): `cot.fecha_entrega_estimada = sc.fecha_entrega_estimada` (copia directa, ya no hardcodea).
- **COT → PVEN** (`convertir_cotizacion_a_venta`): ya copia correctamente hoy (`erp_ventas_fase4.py:2751`) — sin cambios.
- **PVEN → PEC** (`create_pec`, `erp_compras.py`): si el PEC se crea con `ven_id` presente, `fecha_entrega_estimada = ven.fecha_entrega_estimada` directo (reemplaza el cálculo independiente `fecha_compra + dias_entrega`). Si no hay `ven_id` (PEC sin origen de venta, caso raro pero posible), se mantiene el comportamiento actual (`dias_entrega` manual, default 15) — no hay de dónde heredar.
- El campo `dias_entrega` del formulario de creación de PEC se mantiene visible pero pasa a ser de **solo ajuste manual explícito** cuando hay `ven_id` — si el usuario no lo toca, se ignora en favor de la fecha heredada.

### Edición manual y trazabilidad (punto 9 del usuario)

Cualquier cambio posterior a `fecha_entrega_estimada` en SC, COT, PVEN o PEC (vía su respectivo PATCH) debe registrar una entrada de actividad usando el patrón `_log(...)` ya existente en cada módulo, con esta forma:

```
action: "FECHA_ENTREGA_MODIFICADA"
description: "Fecha de entrega modificada: {fecha_vieja} → {fecha_nueva} ({+/-N días})"
old_estado / new_estado: no aplica (se reusa old_valor/new_valor si el logger lo soporta, o se formatea todo en description)
```

El cálculo de diferencia en días es `(fecha_nueva - fecha_vieja).days`, mostrado con signo (retraso positivo, adelanto negativo).

### Cierre del ciclo hasta Recepción

`GoodsReceipt` (recepciones) no tiene hoy ningún campo de atraso. Se agrega, calculado **una sola vez al confirmar la recepción** (no recalculado después, es un dato histórico):

- `GoodsReceipt.fecha_entrega_comprometida` (DateTime, copiada del PEC vinculado al momento de confirmar).
- `GoodsReceipt.dias_retraso` (Integer, nullable — `None` si llegó a tiempo o antes). Calculado en `confirmar_recepcion`: `dias_retraso = (fecha_real_recepcion - (pec.fecha_entrega_estimada + timedelta(days=1))).days` — si el resultado es `<= 0`, se guarda `None` (a tiempo, con el día de tolerancia ya aplicado); si es positivo, se guarda ese número.

Este es el mismo patrón de comparación que ya existe y funciona en `Shipment`/alertas-transito (`erp_logistica.py:1784-1855`) — no se inventa una fórmula nueva, se replica la que ya está probada, aplicada al punto donde hoy no existe (Recepciones).

## 2. Máquina de estados + confirmación por link (genérica, compartida)

### Infraestructura compartida (nueva)

Una sola tabla y un solo conjunto de funciones, usados por SC y COT (y extensible a futuros tipos de documento sin cambiar el esquema):

```python
# Tabla nueva: document_confirmation_tokens
id, document_type (String: 'SC' | 'COT'), document_id (Integer),
token_hash (String, SHA-256 del token crudo — mismo patrón que password_reset_tokens),
created_at, expires_at (created_at + 2 días, mismo valor que el umbral de alerta ya configurable),
used_at (nullable)
```

Funciones compartidas en un módulo nuevo `backend/app/core/confirmation_tokens.py`:
- `create_confirmation_token(db, document_type, document_id) -> str` (token crudo, para incluir en el email/WhatsApp — nunca se persiste crudo).
- `verify_and_consume_token(db, token) -> tuple[document_type, document_id] | None` (hashea, busca, valida expiración y uso único, marca usado).

Reusa exactamente el mismo patrón que el agente de reset de contraseña ya está construyendo (`secrets.token_urlsafe(32)`, SHA-256, expiración, un solo uso) — se factoriza ahí mismo si ya quedó como helper genérico, o se duplica el patrón de forma mínima si quedó inline en `auth.py` (decisión que toma el implementador según cómo haya quedado ese código, documentada en el plan).

### Endpoint público (sin autenticación, con idempotency-key — mismo patrón que `store.py`/`ecommerce.py`)

- `GET /confirmar/{token}` — devuelve un resumen de solo lectura del documento (número, cliente, productos, total, fecha estimada) para que el cliente vea qué está confirmando antes de hacer clic. Token inválido/expirado/usado → mensaje genérico, no revela detalle del documento.
- `POST /confirmar/{token}` (requiere header `Idempotency-Key`, mismo patrón que checkout) — consume el token, transiciona el documento a `CONFIRMADA`, registra actividad con `user_name: "Cliente (confirmación por link)"`.

Frontend: página pública nueva `frontend/src/app/confirmar/[token]/page.tsx`, fuera del layout de `/dashboard` (sin sidebar, sin requerir sesión) — mismo patrón de layout público que ya usa `frontend/src/app/store/`.

### Envío al cliente

Reusa `send_email()` del trabajo de reset de contraseña para el correo. Para WhatsApp, es un simple `wa.me` con el mismo link de confirmación como texto prellenado — no requiere backend nuevo, mismo patrón que ya se usa en media docena de lugares de la app hoy.

El campo `link_confirmacion` (`erp_ventas.py:1427`) se actualiza para apuntar a la URL real (`{FRONTEND_URL}/confirmar/{token}`) en vez del valor ficticio `/confirmar/{numero}` que nunca existió.

### Estados — Solicitud de Cliente

Se mantienen los valores internos ya existentes donde es seguro (evita romper filtros/badges/color-maps que ya referencian estos strings en el resto de la app), agregando solo lo genuinamente nuevo:

| Valor interno (sin cambio) | Etiqueta nueva mostrada al usuario | Notas |
|---|---|---|
| `BORRADOR` | **Nueva** | Se crea siempre en este estado |
| *(nuevo)* `ASIGNADA` | **Asignada** | Solo alcanzable si `advisor_user_id` ya está seteado — validación server-side, rechaza la transición si no hay asesor asignado |
| `PENDIENTE_CONFIRMACION` | **Pendiente por confirmación** | Ahora solo alcanzable enviando el link al cliente (no como botón rápido suelto) |
| `CONFIRMADA` | **Confirmada** | Ahora **solo** alcanzable vía `POST /confirmar/{token}` — ya no aparece en los botones rápidos de cambio manual |
| `CANCELADA` | Cancelada | Sin cambios |

**Cambio de seguridad que esto arregla de raíz:** hoy `ESTADOS_SC_MANUALES` permite saltar a `CONFIRMADA` con un clic sin pasar por `confirmarSC()` (hallazgo ⚠️⚠️2 del levantamiento de hoy — una Solicitud puede quedar "Confirmada" sin Cotización real). Con este diseño, `CONFIRMADA` deja de estar en la lista de botones rápidos — el único camino para llegar ahí es el link del cliente. Mismo criterio para `PENDIENTE_CONFIRMACION`: se quita de los botones rápidos, solo se alcanza enviando el link de verdad.

### Estados — Cotización

| Valor interno (a confirmar contra el enum real al implementar) | Etiqueta nueva | Notas |
|---|---|---|
| `BORRADOR` | **Pendiente por cotizar** | Alerta de 2 días si no se ha cotizado (ya existe `alerta_cot_dias` configurable) |
| `ENVIADA` | **Pendiente por confirmación** | Ya solo alcanzable enviando el link al cliente (hoy el botón dedicado "Enviar al Cliente" ya hace esto bien — ver siguiente punto) |
| `CONFIRMADA` | **Confirmada** | Ya excluida de las pastillas de cambio rápido hoy (`[id]/page.tsx:578-587` ya filtra `k !== 'CONFIRMADA'`) — este diseño solo cierra el hueco que falta: la pastilla "Enviada al cliente" (⚠️⚠️ hallazgo de hoy, dos caminos con payload distinto) se elimina, dejando el botón dedicado como único camino |

Cotización ya estaba parcialmente protegida (CONFIRMADA ya excluida de las pastillas); este diseño corrige el hallazgo pendiente (la pastilla "Enviada al cliente" duplicada) como parte natural del mismo cambio, no como un parche aparte.

### Botón de Estado como selector (punto 8 del usuario, Cotización)

Se reemplazan las pastillas sueltas por un `<select>` dentro del modo "Editar" (mismo patrón ya usado en Pedido de Venta y ahora en Solicitud) — con las mismas exclusiones de arriba (no se puede seleccionar `CONFIRMADA` manualmente; `ENVIADA`/"Pendiente por confirmación" tampoco, para forzar que pase por el envío real).

### Crear Pedido de Venta desde Cotización (puntos 6-7 del usuario)

- El botón "Crear Pedido de Venta" se muestra **solo** si `estado === 'CONFIRMADA'` (hoy no hay ninguna restricción de estado para esto — se agrega).
- Mensaje de éxito "PVEN-xxxx creado exitosamente" se muestra con un `setTimeout` de ~4 segundos, después queda solo el botón "Ver Pedido de Venta" + el número — patrón puramente de frontend, sin cambios de backend.
- El link resultante usa la convención `return_to` ya implementada hoy en Solicitud (`?return_to=` url-encoded) para que el Pedido de Venta creado pueda volver a esta Cotización — mismo mecanismo, no uno nuevo.

## 3. Alertas — versión "ahora" (sin scheduler)

Un badge persistente en el layout principal del dashboard (no solo dentro del Hub Ventas), alimentado por un endpoint liviano nuevo `GET /ventas/alertas/resumen` que devuelve solo un conteo (`{atrasados: N}`), reusando la misma regla de "más de X días sin cambio de estado" ya configurable vía `/ventas/config` — evita traer los 200 registros completos solo para mostrar un número. Se actualiza al cargar cualquier página del dashboard y cada N minutos mientras el usuario tiene una pestaña abierta (polling simple, no WebSocket nuevo). Clic en el badge navega al Hub Ventas con el filtro "No Resueltos" ya activo.

La versión con notificación real (email/push sin que nadie tenga el sistema abierto) queda explícitamente para una iteración futura que primero resuelva la infraestructura de scheduler — no se construye en esta.

## 4. Cambios de datos (migraciones Alembic)

1. `customer_requests`: agregar `fecha_entrega_estimada` (DateTime, nullable), `modalidad_entrega` (String, default `'NORMAL'`).
2. Agregar valor `ASIGNADA` donde el estado de SC esté restringido por un CHECK constraint, si existe uno (confirmar al implementar — `ESTADOS_SC_MANUALES` hoy vive solo en el frontend según el levantamiento previo, pero el backend podría tener su propia validación).
3. Tabla nueva `document_confirmation_tokens` (ver sección 2).
4. `purchase_orders_full` (PEC): sin cambio de esquema — solo cambia la LÓGICA de cálculo en `create_pec`.
5. `goods_receipts`: agregar `fecha_entrega_comprometida` (DateTime, nullable), `dias_retraso` (Integer, nullable).

## 5. Qué NO cambia

- `Shipment`/logística de tránsito: sin cambios, sigue siendo un sistema aparte. Este diseño no lo unifica con PEC todavía.
- `tracking_stages` del PEC: sin cambios estructurales.
- Ningún endpoint ecommerce/WEB recibe fecha de entrega en esta iteración (confirmado que hoy nunca la setean — se deja anotado como hallazgo, no se arregla aquí por no estar pedido).

## Auto-revisión (placeholder scan, consistencia, ambigüedad)

- Sin placeholders — todos los nombres de campo, endpoints y valores por defecto están especificados en concreto.
- Los valores 18 y 3 días (límite superior de los rangos 15-18 y 2-3 que dio el usuario) son una decisión de diseño explícita (conservador: promete la fecha más lejana del rango) — si el usuario prefiere el límite inferior o un punto medio, es un cambio de una constante, no de arquitectura.
- Los valores internos exactos del enum de Cotización (`BORRADOR`/`ENVIADA`/`CONFIRMADA`) están marcados "a confirmar contra el enum real al implementar" porque el levantamiento de hoy los infirió del comportamiento del frontend, no los citó literalmente del modelo backend — el plan de implementación debe verificarlos contra `backend/app/models/erp_documents.py` antes de escribir código, no asumirlos de este documento.
- Reutilización explícita de la infraestructura de tokens que el agente de reset de contraseña ya está construyendo en paralelo — el plan de implementación debe verificar en qué forma exacta quedó esa infraestructura (función compartida vs. código inline) antes de decidir si se factoriza o se duplica mínimamente.
