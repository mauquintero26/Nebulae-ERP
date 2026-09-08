# Estrategia de Seguridad — WEB-0

**Fecha:** 2026-09-08

---

## 1. Principios Fundamentales

1. **Backend como fuente de verdad** — Precios, stock, descuentos y propietario se validan siempre en el servidor
2. **Frontend no confía en sí mismo** — Todo dato crítico pasa por el backend
3. **Principio de mínimo privilegio** — Cada rol accede solo a lo que necesita
4. **Defense in depth** — Múltiples capas de protección
5. **Idempotencia** — Acciones críticas protegidas contra double-submit
6. **Audit trail** — Toda acción crítica queda registrada

---

## 2. Autenticación

### ERP Dashboard (actual)
| Aspecto | Implementación |
|---------|----------------|
| Mecanismo | JWT Bearer token |
| Almacenamiento | localStorage (dashboard) |
| Expiración | Configurar máx 8 horas |
| Refresh | No implementado todavía |
| Roles | admin, asesor, bodega, finanzas |

**⚠️ Riesgo:** JWT en localStorage es vulnerable a XSS. Migrar a httpOnly cookie en WEB-6.

### Tienda B2C (a implementar en WEB-3)
| Aspecto | Implementación propuesta |
|---------|--------------------------|
| Mecanismo | JWT + Refresh token |
| Almacenamiento | httpOnly cookie (más seguro) |
| Expiración | Access token: 1 hora; Refresh: 30 días |
| Refresh | Automático en middleware Next.js |
| Separación | JWT B2C completamente separado del JWT ERP |

### Endpoints públicos (sin auth)
- `GET /ecommerce/catalogo` — Solo productos publicados
- `GET /ecommerce/catalogo/{id}` — Solo si existe y `publicado_web=true`
- `GET /ecommerce/categorias`
- `GET /ecommerce/web-builder/config`
- `POST /ecommerce/pedidos` — Público (pero validado severamente)

---

## 3. Validación de Precios e Inventario

### Backend ya implementa:
✅ Precio recalculado en servidor (ignora precio del cliente)  
✅ Descuento arbitrario rechazado (422)  
✅ Manipulación de total rechazada (422)  
✅ Owner MAU rechazado (403)  
✅ Bodega no autorizada rechazada (400)  
✅ Stock real calculado: `balance_NEBULAE - reservas_activas`  
✅ Cuarentena excluida del stock vendible  
✅ `idempotency_key` requerido con fingerprint  

### Frontend debe garantizar:
- No permitir enviar `owner = "MAU"` en ningún formulario
- Nunca cachear precios por más de 60 segundos
- Revalidar stock justo antes del submit del checkout
- Enviar `idempotency_key` único (UUID v4) generado en el cliente

---

## 4. Protección XSS

### Riesgos actuales identificados
| Riesgo | Ubicación | Severidad |
|--------|-----------|-----------|
| Render directo de `product.descripcion_larga` | `store/producto/[id]/page.tsx` con `whitespace-pre-wrap` | 🟡 MEDIA — No usa dangerouslySetInnerHTML |
| Config del sitio renderizada como texto | `store/page.tsx` | 🟢 BAJA — No como HTML |
| Chat IA (futuro) | `dashboard/sitio-web/page.tsx` | 🔴 ALTA — Futuro con LLM |
| Blog hardcodeado | `store/blog/page.tsx` | 🟢 BAJA — Datos estáticos |

### Mitigaciones recomendadas
- No usar `dangerouslySetInnerHTML` para contenido del backend
- Para descripción larga con HTML: usar biblioteca DOMPurify antes de renderizar
- CSP (Content Security Policy) headers en `next.config.ts`:
```js
headers: [{ key: 'Content-Security-Policy', value: "default-src 'self'; img-src *; ..." }]
```
- Sanitizar output del LLM antes de renderizar en el constructor

---

## 5. Protección CSRF

### Situación actual
- Dashboard ERP: Sin CSRF explícito (JWT en headers es CSRF-safe)
- Tienda pública: Sin auth, sin CSRF necesario para endpoints públicos
- Checkout: `POST /ecommerce/pedidos` — público — el `idempotency_key` actúa como CSRF implícito

### WEB-3 — Con auth B2C
- Usar httpOnly cookie con `SameSite=Strict` → CSRF no viable
- Si se usa cookie `SameSite=Lax`, agregar CSRF token doble-submit

---

## 6. Rate Limiting

### Actualmente no implementado en frontend  
**Recomendaciones para el backend (WEB-2+):**

| Endpoint | Límite |
|----------|--------|
| `POST /ecommerce/pedidos` | 3 requests/minuto por IP |
| `GET /ecommerce/catalogo` | 60 requests/minuto por IP |
| `POST /auth/customer/login` | 5 intentos/10 min por email |
| `POST /ecommerce/carts` | 10 requests/minuto por IP |
| `POST /ecommerce/ai/suggest` | 20 requests/hora por usuario |

---

## 7. Seguridad del Constructor IA

| Amenaza | Mitigación |
|---------|-----------|
| Prompt injection | Sanitizar input; max 1000 chars; filtrar keywords |
| Output malicioso del LLM | Validar JSON contra schema antes de usar |
| XSS vía contenido IA | DOMPurify en renderizado de texto generado |
| Publicación sin aprobación | Flujo: borrador → aprobación → publicar |
| Código JS en bloques | `custom_script` no existe en catálogo permitido |
| Datos sensibles en prompts | System prompt no incluye datos de clientes |

---

## 8. Secretos y Variables de Entorno

### Regla de oro
**Ningún secreto en el código fuente ni en la documentación.**

### Variables necesarias (WEB-2+)
```env
# backend/.env (nunca committear)
DATABASE_URL=postgresql://...
SECRET_KEY=...
ECOMMERCE_AUTHORIZED_WAREHOUSE_IDS=1,2
ECOMMERCE_DEFAULT_WAREHOUSE_ID=1

# frontend/.env.local (nunca committear)
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
# WEB-4:
WOMPI_PUBLIC_KEY=pub_test_...
# WEB-5:
GEMINI_API_KEY=... (backend only, nunca en frontend)
```

**Reglas:**
- `NEXT_PUBLIC_*` se expone al cliente — nunca poner secretos aquí
- Keys de LLM van SOLO en el backend — el frontend habla con un proxy
- No loggear tokens ni datos de tarjeta

---

## 9. Seguridad de Webhooks (WEB-4)

| Aspecto | Implementación |
|---------|----------------|
| Verificación de firma | HMAC-SHA256 con clave secreta de la pasarela |
| Idempotencia | `event_id` de la pasarela almacenado — rechazar duplicados |
| Reintentos | Lógica de retry con exponential backoff |
| Timeout | Responder < 5 segundos o la pasarela reintentará |
| Acceso | Endpoint protegido con IP whitelist de la pasarela |
| Logging | Loggear todos los webhooks recibidos con timestamp y event_type |

---

## 10. Privacidad de Datos

| Dato del Cliente | Manejo |
|-----------------|--------|
| Email | Solo para pedidos y notificaciones; no en logs |
| Teléfono | Solo para contacto; no en logs de debug |
| Dirección | Encriptada en tránsito (HTTPS); access logging |
| Datos de tarjeta | NUNCA en el sistema — solo pasan por pasarela |
| Historial de pedidos | Solo visible al cliente autenticado o a admin |

---

## 11. Enumeración de Pedidos

**Problema actual potencial:** Si el número de pedido es secuencial (`PWEB-20261`, `PWEB-20262`...), un atacante puede enumerar pedidos.

**Mitigación (WEB-3):**
- Para consulta pública de estado: requerir email del cliente + número de pedido
- Para el endpoint de admin: JWT requerido
- Nunca exponer `customer_email` en endpoints públicos

---

## 12. Checklist de Seguridad por Fase

| Check | WEB-1 | WEB-2 | WEB-3 | WEB-4 |
|-------|-------|-------|-------|-------|
| HTTPS en producción | ✅ | ✅ | ✅ | ✅ |
| CSP headers | 📋 | 📋 | ✅ | ✅ |
| idempotency_key en checkout | — | — | ✅ | ✅ |
| Rate limiting en API | — | ✅ | ✅ | ✅ |
| Auth B2C (httpOnly cookie) | — | — | ✅ | ✅ |
| Webhook firma verificada | — | — | — | ✅ |
| DOMPurify en contenido dinámico | — | ✅ | ✅ | ✅ |
| Audit log de pedidos | — | — | ✅ | ✅ |
| Sanitización prompts IA | — | — | — | ✅ (WEB-5) |
