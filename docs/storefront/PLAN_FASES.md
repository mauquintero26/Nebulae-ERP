# Plan de Fases — WEB-0 a WEB-7

**Fecha:** 2026-09-08  
**Nota:** Cada fase requiere autorización expresa del usuario antes de iniciar.

---

## WEB-0 — Auditoría y Arquitectura ✅ (Esta fase)

**Objetivo:** Inventariar, diagnosticar y planificar todo el trabajo.  
**Duración estimada:** 1 sesión de agente  
**Entregables:**
- Rama `feature/storefront-ecommerce` + worktree
- Inventario de pantallas
- Inventario de componentes
- Diagnóstico visual
- Análisis de duplicidades
- Matriz de APIs
- Arquitectura propuesta
- Modelo comercial
- Constructor IA (diseño)
- Seguridad (estrategia)
- Estrategia de pruebas
- Plan de fases
- Documentación publicada en la rama
- RESUMEN_WEB_0.md

**Restricciones:** Solo lectura + documentación. Sin modificar pantallas ni backend.

---

## WEB-1 — Organización y Mejora Visual

**Objetivo:** Consolidar el código existente, corregir inconsistencias y preparar la base para las fases funcionales.  
**Duración estimada:** 2-3 sesiones  
**Requisito previo:** Aprobación expresa del usuario + respuestas a preguntas de marca

### Tareas incluidas:

#### Consolidación de Componentes
- [ ] Extraer `ProductCard` a `components/store/ProductCard.tsx`
- [ ] Unificar `Toast` a `components/Toast.tsx`
- [ ] Extraer `AvailabilityBadge` y `ModalityBadge`

#### Corrección de Rutas
- [ ] Redirect 301: `/store/product/[id]` → `/store/producto/[id]`
- [ ] Normalizar URLs: `Catálogo` → `catalogo` en todos los fetch
- [ ] Verificar y corregir link de búsqueda (actualmente va a `/store/catalogo`)

#### Mejoras del Layout Tienda
- [ ] Sidebar de filtros en móvil (drawer completo)
- [ ] Footer compartido extraído del layout
- [ ] Imagen hero desde config (en vez de hardcodeada)

#### Sistema de Diseño
- [ ] Agregar tokens de store a `design-system.ts`
- [ ] Documentar tokens en Storybook (opcional)

#### Pruebas de Caracterización
- [ ] `npm run build` sin errores
- [ ] TypeScript sin errores
- [ ] Smoke test todas las rutas

**Criterio de cierre WEB-1:**
- Build exitoso
- Todas las rutas funcionales
- Sin duplicados de componentes
- Sin URLs con tildes en fetch

---

## WEB-2 — Catálogo Funcional

**Objetivo:** Conectar el catálogo con el backend real y mejorar la experiencia de búsqueda.  
**Duración estimada:** 2-4 sesiones

### Tareas incluidas:

#### Capa API Centralizada
- [ ] Crear `lib/store-api.ts` con todas las funciones de tienda
- [ ] Migrar todos los `fetch()` directos a `store-api.ts`
- [ ] Variables de entorno por ambiente

#### Catálogo Mejorado
- [ ] Paginación server-side (cursor o offset)
- [ ] Búsqueda con debounce
- [ ] Filtros server-side (mover de cliente a servidor)
- [ ] Ordenamiento: precio asc/desc, novedad, relevancia
- [ ] Badge de disponibilidad dinámico
- [ ] Badge de modalidad ("Entrega inmediata" / "Por pedido")

#### SEO Básico
- [ ] Metadata por página (title, description, og:image)
- [ ] ISR para catálogo y producto (revalidate 60s)
- [ ] URLs canónicas

#### Formulario de Contacto
- [ ] Conectar formulario a endpoint real o servicio de email

**Criterio de cierre WEB-2:**
- Catálogo funcional con datos reales
- Búsqueda y filtros operativos
- SEO básico en todas las rutas

---

## WEB-3 — Carrito y Checkout

**Objetivo:** Hacer funcional el flujo completo de compra hasta creación del pedido.  
**Duración estimada:** 4-6 sesiones (la más compleja)

### Tareas incluidas:

#### Carrito Persistente
- [ ] Persistir carrito en `localStorage`
- [ ] Merge de carrito al iniciar sesión (si aplica)
- [ ] Actualizar cantidad dentro del carrito
- [ ] Revalidar stock antes de mostrar carrito

#### Checkout Funcional
- [ ] Generar `idempotency_key` (UUID v4) en el cliente
- [ ] Refactorizar para enviar `sku_id` + `sku` por ítem
- [ ] Revalidar disponibilidad antes del submit
- [ ] Manejar error 409 (stock insuficiente) con mensaje claro
- [ ] Manejar error 422 (validación) con campos específicos
- [ ] Estado de éxito con número PWEB

#### Auth Cliente B2C
- [ ] Endpoints: `POST /auth/customer/register` + `POST /auth/customer/login`
- [ ] JWT httpOnly cookie
- [ ] "Mis pedidos" en /store/cuenta

#### Reservas
- [ ] Entender que la reserva la crea el backend al confirmar pago
- [ ] Mostrar al cliente que el pedido está "pendiente de pago"

**Criterio de cierre WEB-3:**
- Flujo completo hasta pedido PENDIENTE_PAGO sin errores
- Idempotencia verificada (doble submit = un solo pedido)
- Stock validado en checkout
- Auth B2C funcional

---

## WEB-4 — Pagos

**Objetivo:** Integrar pasarela de pago real en modo sandbox, luego producción.  
**Duración estimada:** 3-5 sesiones

### Tareas incluidas:

#### Diseño de Integración
- [ ] Seleccionar pasarela: Wompi / PayU / Epayco (decisión del usuario)
- [ ] Implementar interfaz desacoplada de pasarelas
- [ ] Checkout alojado (hosted payment page)

#### Backend
- [ ] Endpoint `POST /ecommerce/payments/initiate` → URL de pago
- [ ] Webhook `POST /ecommerce/payments/webhook` con firma HMAC
- [ ] Idempotencia en webhooks
- [ ] Estados: PENDING → APPROVED / FAILED / EXPIRED
- [ ] Reserva de inventario SOLO tras APPROVED
- [ ] Liberación de reserva tras EXPIRED

#### Frontend
- [ ] Redirigir a pasarela en checkout
- [ ] Página de retorno `/store/checkout/resultado`
- [ ] Manejo de estados: aprobado / rechazado / pendiente
- [ ] Seguimiento de pedido público (con email + PWEB#)

#### Flujo de Anticipo (Por Pedido)
- [ ] Calcular anticipo según config
- [ ] Cobrar anticipo en checkout
- [ ] Mostrar saldo pendiente
- [ ] Notificación al cliente para cobro de saldo

**Criterio de cierre WEB-4:**
- Sandbox completo funcionando end-to-end
- Webhooks firmados y validados
- Reservas creadas correctamente
- Sin pagos reales activados sin autorización

---

## WEB-5 — Constructor con IA

**Objetivo:** Hacer funcional el constructor del sitio con IA real.  
**Duración estimada:** 4-6 sesiones

### Tareas incluidas:

#### Backend del Constructor
- [ ] API de versiones: GET/POST `/web-builder/versions`
- [ ] API de rollback: `POST /web-builder/rollback/{version_id}`
- [ ] Endpoint proxy LLM: `POST /ecommerce/ai/suggest`
- [ ] Validación de JSON: `POST /web-builder/validate`
- [ ] Schema extendido de config (páginas, secciones, bloques)

#### Integración LLM
- [ ] Conectar a Gemini API (backend proxy, nunca en frontend)
- [ ] System prompt de Nebulae
- [ ] Validar output del LLM contra schema
- [ ] Sanitizar contenido generado

#### Frontend Constructor
- [ ] Fusionar UI de `/dashboard/website` (canvas, capas) en `/dashboard/sitio-web`
- [ ] Vista previa real del sitio (iframe o render)
- [ ] Panel de bloques con drag & drop
- [ ] Historial de versiones con rollback
- [ ] Flujo: borrador → vista previa → aprobación → publicar

#### Blog con CMS
- [ ] CRUD de artículos desde el dashboard
- [ ] Conectar `/store/blog` a datos reales
- [ ] Artículos individuales `/store/blog/[slug]`

**Criterio de cierre WEB-5:**
- Constructor funcional con IA real
- Vista previa correcta
- Versionado y rollback operativos
- Blog con CMS funcional

---

## WEB-6 — Integración Integral con ERP

**Objetivo:** Conectar la tienda con todos los módulos del ERP.  
**Duración estimada:** 6-10 sesiones

### Integraciones:
- [ ] Sincronización bidireccional catálogo ERP ↔ catálogo web
- [ ] Stock en tiempo real desde `InventoryOwnerBalance`
- [ ] CRM: cliente web ↔ cliente ERP (unificación)
- [ ] Agenda: reservas de citas desde la tienda (si aplica)
- [ ] WhatsApp: notificaciones de pedido
- [ ] Marketing: campañas conectadas al catálogo
- [ ] Logística: tracking desde el ERP hacia el cliente
- [ ] Devoluciones: flujo de reversa de inventario
- [ ] Finanzas: conciliación de pagos web

**Criterio de cierre WEB-6:**
- Tests E2E completos del flujo
- Datos reales sin mocks
- Notificaciones WhatsApp activas (con autorización)

---

## WEB-7 — Merge y Despliegue

**Objetivo:** Integrar con main y desplegar a producción.  
**Duración estimada:** 1-2 sesiones

### Tareas:
- [ ] `git fetch origin main`
- [ ] Resolver conflictos con la rama del otro agente ERP
- [ ] Ejecutar suite de regresión completa
- [ ] Preparar PR con descripción completa
- [ ] Revisión visual en staging
- [ ] Solicitar autorización expresa del usuario
- [ ] Merge controlado
- [ ] Despliegue gradual (feature flags si es posible)
- [ ] Monitoreo post-deploy 24 horas

**Criterio de cierre WEB-7:**
- main actualizado
- Sin regresiones en ERP
- Sitio en producción y funcionando
- Monitoreo activo

---

## Estimación de Esfuerzo Total

| Fase | Sesiones estimadas | Complejidad |
|------|--------------------|-------------|
| WEB-0 | 1 | Baja |
| WEB-1 | 2-3 | Baja |
| WEB-2 | 2-4 | Media |
| WEB-3 | 4-6 | Alta |
| WEB-4 | 3-5 | Alta |
| WEB-5 | 4-6 | Muy Alta |
| WEB-6 | 6-10 | Muy Alta |
| WEB-7 | 1-2 | Media |
| **Total** | **23-37 sesiones** | — |

*Cada "sesión" = 1 ejecución de agente de aproximadamente 30-90 minutos*

---

## Dependencias entre Fases

```
WEB-0 → WEB-1 → WEB-2 → WEB-3 → WEB-4 → WEB-7
                       ↘                ↗
                        WEB-5 → WEB-6 ↗
```

WEB-5 puede ejecutarse en paralelo con WEB-3/WEB-4 si hay recursos.  
WEB-6 requiere que WEB-3, WEB-4 y WEB-5 estén completos.
