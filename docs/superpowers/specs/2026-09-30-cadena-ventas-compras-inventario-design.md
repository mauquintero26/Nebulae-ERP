# Cadena Ventas → Compras → Inventario (el "juego del inventario") — Design

## Contexto

Después de consolidar el flujo Solicitud → Cotización → Pedido de Venta en Ventas (sesión 2026-09-29/30, ver historial de commits en `frontend/src/app/dashboard/ventas/`), el usuario pidió reordenar la prioridad del programa de auditoría/estandarización app-wide: antes de tocar el resto de los hubs (Finanzas, Marketing, E-Commerce, Admin), primero se completa y verifica de punta a punta el ciclo operativo central — Ventas → Compras → Inventario — porque es el que sostiene el negocio real (venta, compra e inventario). CRM/Agenda entra en esta misma primera fase porque su función es dar trazabilidad de contacto sobre ese mismo ciclo. Todo lo demás en la aplicación se evalúa, en la Fase 2 (fuera de esta spec), por si conecta a este núcleo.

Una investigación de código (2026-09-30, agente de exploración, sin escribir nada) estableció el estado real de cada tramo — algunos ya funcionan correctamente y solo necesitan verificación en vivo; otros no existen en absoluto y son capacidad nueva. Esta spec distingue explícitamente unos de otros.

## Decisiones ya confirmadas con el usuario

1. **Orden:** terminar Ventas (lo que falta) → Compras → Inventario → CRM/Agenda, antes de continuar con el resto de los hubs.
2. **Datos falsos/mock encontrados en el camino se conectan a datos reales**, no solo se señalan (aplica también fuera de esta spec, en Fase 2).
3. **El patrón Actividad-principal + Chatter conectado + indicador de Progreso del Flujo** (ya construido en Cotización/Solicitud de Ventas) se extiende activamente a Compras e Inventario donde haya un documento con etapas — no se pospone a una segunda pasada.
4. **Factura y Orden de Envío:** se construyen como documentos PDF reales y numerados. El canal de envío es un link `wa.me` con el mensaje listo (igual patrón que ya existe para cotizaciones) — el usuario adjunta el PDF manualmente. El envío automatizado real (WhatsApp Business API adjuntando el archivo, o email transaccional) queda explícitamente fuera de alcance — no existe infraestructura de email en el backend hoy y la integración de WhatsApp Business API está en modo sombra, solo-entrada.

## Estado real por tramo (de la investigación de código)

**Ya funciona, solo necesita verificación en vivo + aplicar el patrón de Progreso/Chatter:**
- Lista de Compras → Pedido de Compra (PEC): vínculo real, incluido el caso de un PEC que consolida varios Pedidos de Venta (pool) — `SaleOrder.pec_id`/`pec_numero` es la fuente de verdad que ya usa `GET /pedidos/{pec_id}` para devolver todos los PVEN agrupados.
- PEC → Mercancía en Tránsito (`Shipment.pec_id`, FK real) → Recepciones (`GoodsReceipt.pec_id`/`.shipment_id`, FK real, con líneas que registran cantidad esperada/recibida/rechazada/cuarentena).
- El cruce de mercancía recibida contra inventario ya ocurre al confirmar una Recepción (genera `InventoryMovement` reales) — vive en el backend de Compras, no hace falta construirlo en Inventario.
- La cola de despacho y cobro del saldo del 40% en modalidad 60/40 ya existe como pantalla real (`inventario/entregas`), bloqueando el despacho hasta que `saldo_cop` llegue a 0.
- Navegación cruzada entre las 4 pantallas de Compras ya existe (mismo patrón que Ventas).
- CRM/Agenda: el perfil de cliente y proveedor ya trae historial real vía `/crm/customers/{id}/profile-360`, no mock.

**Existe pero incompleto — se corrige en esta spec:**
- Ajustes de inventario (`inventario/ajustes`): el motivo es texto libre concatenado dentro de una nota (`InventoryOperation.notas`), no un campo estructurado; "Faltante" no está en la lista de motivos (usa "Merma" en su lugar).
- Perfil de cliente en Agenda: las cotizaciones del cliente se cuentan pero nunca se listan.
- Perfil de proveedor en Agenda: no muestra sus Recepciones, solo sus PEC.
- `inventario/bodegas` y `inventario/operaciones` son 100% mock (arrays hardcodeados); `inventario/compartido` es un placeholder vacío.
- Ventas: el listado de Pedido de Venta (`venta-client.tsx`) tiene el mismo problema de página-duplicada que tenía Cotización antes de esta sesión — compite con `venta/[id]/page.tsx`. Exportar Día/Rango y Proyecciones solo tuvieron el pase visual, no esta auditoría funcional.

**No existe — capacidad nueva:**
- Factura: no hay documento, PDF ni numeración. `FACTURADO` es un valor de estado que nadie llena.
- Orden de Envío: no existe como documento independiente (lo más cercano es la pantalla de despacho de `entregas`, que no genera un documento).

## Arquitectura

```
PVEN confirmado, sin stock
  └─► Lista de Compras (pool, puede agrupar varios PVEN)
        └─► Pedido de Compra (PEC) ──► Mercancía en Tránsito ──► Recepción
              └─► confirmar Recepción: cruza contra inventario (InventoryMovement), YA EXISTE
                    └─► saldo 40% pendiente (si modalidad 60/40) ──► Cola de Despacho (entregas), YA EXISTE
                          └─► saldo llega a $0 ──► [NUEVO] genera Factura (PDF, numerada FACT-YYYY####)
                                └─► [NUEVO] genera Orden de Envío (PDF, numerada ENV-YYYY####)
                                      └─► [NUEVO] botón "Enviar por WhatsApp" (wa.me + mensaje listo, mismo patrón que Cotización)

Agenda (cliente/proveedor) ──► perfil-360 ──► debe listar, no solo contar, cada documento de esta cadena
```

## Componente 1 — Cerrar Ventas

**Consolidar Pedido de Venta** con el mismo método usado en Cotización esta sesión: `venta/[id]/page.tsx` como página canónica (ya tiene stepper, Actividad real, contacto, vínculo a PEC/Lista de Compras); `venta-client.tsx` retira su panel lateral duplicado y su ruta `?id=` redirige a la canónica, igual que se hizo en `cotizacion-client.tsx`.

**Exportar Día/Rango y Proyecciones:** auditoría funcional (no solo visual) — confirmar que cada acción hace lo que dice, sin datos de relleno ni endpoints inexistentes (recordar el hallazgo ya conocido de `/ventas/upload_chat` sin ruta backend, dejado pendiente a propósito en la sesión anterior — se revisita aquí).

## Componente 2 — Compras

La trazabilidad de fondo ya es real. El trabajo aquí es: verificar en vivo cada hop con un caso real de punta a punta (un PVEN sin stock → Lista de Compras → PEC → Tránsito → Recepción), y aplicar el patrón de Progreso del Flujo (mismo componente visual que Ventas) a las 4 pantallas para que se vea el avance igual que en Ventas. Cualquier bug real que aparezca durante la verificación en vivo se corrige con el mismo método de esta sesión (causa raíz, no parche cosmético).

## Componente 3 — Inventario

**Ajustes con motivo estructurado:** agregar una columna real (`reason_code`) a `InventoryOperation` — el registro que hoy concatena el motivo como texto libre en `notas` — con un enum cerrado: `SOBRANTE`, `FALTANTE`, `MERMA`, `CONTEO_FISICO`, `CORRECCION_ERROR`, `DANO_BODEGA`, `VENCIMIENTO`, `OTRO` (agrega el `FALTANTE` que falta hoy, conserva los motivos ya existentes). Migración Alembic sin GRANTs, patrón `fa6_*` ya establecido. Si al implementar se confirma que `InventoryMovement` también necesita su propio motivo independiente (no solo heredado de la operación que lo originó), se decide en el plan de implementación, no aquí.

**`bodegas` y `operaciones`:** conectar a datos reales (ya existen endpoints de almacenes/ubicaciones reales en el mismo hub — confirmar si son reutilizables o si falta un endpoint específico) o, si la funcionalidad real no tiene aún un home claro, fusionar con la pantalla real más cercana en vez de dejar una ruta muerta. `compartido`: definir con el usuario qué va aquí antes de construir nada (hoy no tiene ni siquiera una especificación mínima).

**Factura y Orden de Envío (documento nuevo):**
- Modelos nuevos `Invoice` (`FACT-YYYY####`) y `ShippingOrder` (`ENV-YYYY####`), cada uno con FK real a `SaleOrder`, numeración secuencial igual que COT/PVEN/PEC, generación de PDF en el servidor (librería `reportlab`, pura Python, sin dependencias de sistema — apta para el despliegue actual).
- Trigger: se habilitan cuando el PVEN llega a `saldo_cop = 0` (mismo punto donde hoy `entregas` ya desbloquea el despacho) — un botón explícito "Generar Factura" / "Generar Orden de Envío" en esa misma pantalla, no automático, para que el usuario controle el momento exacto.
- Botón "Enviar por WhatsApp" junto a cada PDF generado: mismo patrón `wa.me` + mensaje pre-armado que ya usa Cotización — el archivo se adjunta manualmente en WhatsApp. Envío real automatizado queda fuera de alcance (ver abajo).

## Componente 4 — CRM / Agenda

**Perfil de cliente:** renderizar la lista real de Cotizaciones (el dato `customer360.quotations` ya se trae, solo falta la lista en pantalla, mismo patrón que "Historial Comercial" ya usa para Solicitudes/Pedidos).

**Perfil de proveedor:** agregar sus Recepciones (`GET /compras/recepciones?supplier_id=...` o el filtro equivalente que ya exista), junto a los PEC que ya se muestran.

## Pruebas automatizadas requeridas

- Ventas: `venta/[id]` consolidado responde igual que antes para los escenarios ya cubiertos por los tests existentes de Pedido de Venta; la ruta `?id=` redirige.
- Inventario: ajuste con `reason_code=FALTANTE` se guarda y se puede filtrar/reportar por motivo; motivos existentes (sobrante, merma, etc.) siguen funcionando sin regresión.
- Factura/Orden de Envío: no se puede generar ninguna de las dos si `saldo_cop > 0`; numeración secuencial sin huecos ni colisiones; PDF generado contiene los datos reales del pedido (cliente, productos, montos).
- Agenda: perfil de cliente incluye sus cotizaciones reales; perfil de proveedor incluye sus recepciones reales.

## Fuera de alcance (explícito)

- Envío automatizado real de Factura/Orden de Envío por WhatsApp Business API o email transaccional — no existe infraestructura de email hoy y la integración de WhatsApp está en modo sombra (solo-entrada); construir cualquiera de las dos es un sub-proyecto propio con sus propias decisiones (proveedor de email, activar modo de envío de WhatsApp Business API), no un detalle de esta spec.
- Completar Finanzas, Marketing, E-Commerce y Admin respecto a este núcleo — es la Fase 2, con su propia spec una vez esta fase esté terminada y verificada.
- `inventario/compartido` — no se construye nada hasta tener una especificación mínima de qué es.
- Cualquier cambio al roadmap de backend ya existente (TD-03/TD-05/Fase A-E) — esta spec es independiente de ese programa y no lo bloquea ni depende de él.
