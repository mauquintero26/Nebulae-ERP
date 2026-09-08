# Estrategia de Pruebas — WEB-0

**Fecha:** 2026-09-08

---

## 1. Pruebas de Caracterización (WEB-0 — Solo lectura)

### 1.1 Build y TypeScript
```bash
# Verificar que el build no falla
cd frontend && npm run build

# TypeScript
npm run type-check

# Lint
npm run lint
```

**Estado actual esperado:**
- Build: Probablemente pasa con warnings (imágenes externas, tipos any)
- TypeScript: Posibles errores por `any` implícito en algunos hooks
- Lint: Posibles warnings por `useEffect` dependencies

### 1.2 Rutas Existentes (smoke test manual)
| Ruta | Verifica |
|------|---------|
| `/store` | Carga sin error, muestra hero |
| `/store/catalogo` | Carga, muestra filtros, llama API |
| `/store/producto/1` | Carga, muestra skeleton, llama API |
| `/store/checkout` | Carga, muestra formulario |
| `/store/cuenta` | Carga, muestra tabs |
| `/store/contacto` | Carga, muestra formulario |
| `/store/blog` | Carga, muestra artículos mock |
| `/dashboard/ecommerce` | Requiere JWT, redirige si no |
| `/dashboard/sitio-web` | Requiere JWT |
| `/dashboard/website` | Requiere JWT |

---

## 2. Pruebas Visuales (WEB-1)

### 2.1 Herramientas propuestas
- **Playwright** — E2E y capturas visuales
- **Chromatic** — Comparación visual automatizada (opcional)
- **next/image** — Ya incluido en Next.js para imágenes optimizadas

### 2.2 Matriz de dispositivos de prueba
| Dispositivo | Resolución | Prioridad |
|-------------|-----------|-----------|
| iPhone 14 Pro | 390×844 | 🔴 ALTA |
| Samsung Galaxy S21 | 360×800 | 🔴 ALTA |
| iPad Air | 820×1180 | 🟡 MEDIA |
| MacBook 13" | 1280×800 | 🟡 MEDIA |
| Desktop FHD | 1920×1080 | 🟢 NORMAL |

### 2.3 Capturas por ruta (WEB-1)
Para cada ruta:
- Desktop (1280px)
- Tablet (820px)
- Móvil (390px)
- Estado loading (skeleton)
- Estado vacío (sin productos)
- Estado error (API caída)

---

## 3. Pruebas Funcionales (por Fase)

### WEB-2 — Catálogo
```
[ ] GET /ecommerce/catalogo devuelve array de productos
[ ] Filtro por categoría funciona
[ ] Filtro por precio (min/max) funciona
[ ] Búsqueda por texto funciona
[ ] Limpieza de filtros restablece la lista
[ ] ProductCard muestra precio formateado en COP
[ ] ProductCard muestra badge de descuento si descuento_pct > 0
[ ] ProductCard "Agotado" si stock_disponible == 0
[ ] Botón táctil funciona en móvil (sin hover)
[ ] Link a /store/producto/{id} correcto
```

### WEB-3 — Carrito y Checkout
```
[ ] Agregar producto al carrito actualiza badge en header
[ ] Carrito slide-over muestra ítems correctamente
[ ] Eliminar ítem del carrito lo remueve
[ ] Total del carrito suma correctamente
[ ] Carrito persiste al recargar (localStorage)
[ ] Checkout con carrito vacío muestra error
[ ] Formulario de checkout valida campos requeridos
[ ] Checkout envía idempotency_key al backend
[ ] Checkout envía sku_id correcto por ítem
[ ] Backend devuelve PWEB-XXXX en éxito
[ ] Página de éxito muestra número de pedido
[ ] Doble clic en "Pagar" no crea dos pedidos (idempotencia)
```

### WEB-3 — Casos críticos
```
[ ] Producto agotado: botón "Agregar" deshabilitado
[ ] Variante sin stock: botón deshabilitado o no seleccionable
[ ] Stock cambia entre "agregar" y "checkout": error 409 manejado
[ ] Dos clientes compitiendo por última unidad: uno recibe 409
[ ] Pago duplicado (webhook 2x): segundo procesado idempotentemente
[ ] Checkout repetido con misma key: respuesta 200 idempotent_replay
[ ] Error de red en checkout: mantener carrito + mostrar error
[ ] API caída en catálogo: estado de error visual
```

### WEB-4 — Pagos
```
[ ] Iniciar pago redirige a pasarela
[ ] Webhook APPROVED actualiza pedido a PENDIENTE_DESPACHO
[ ] Webhook FAILED no actualiza pedido
[ ] Webhook sin firma rechazado
[ ] Webhook duplicado manejado idempotentemente
[ ] Reserva creada solo después de pago confirmado
[ ] Reserva liberada si pago expira
[ ] Anticipo calculado correctamente para POR_PEDIDO
```

### WEB-5 — Constructor IA
```
[ ] JSON de config válido se aplica correctamente
[ ] JSON inválido muestra error y NO se aplica
[ ] Bloque custom_script bloqueado
[ ] Bloque custom_html bloqueado
[ ] Output del LLM con XSS es sanitizado
[ ] Publicar sin aprobación bloqueado
[ ] Borrador guardado correctamente
[ ] Rollback a versión anterior restaura config
[ ] Vista previa en móvil/tablet/desktop funciona
[ ] Historial de versiones muestra últimas 10
```

---

## 4. Criterios de Aceptación por Fase

### WEB-1 — Organización Visual
- [ ] Build exitoso sin errores TypeScript
- [ ] Todas las rutas cargan sin error 500
- [ ] Componente ProductCard extraído y reutilizado
- [ ] Toast unificado
- [ ] Sidebar móvil del catálogo funcional
- [ ] Imágenes con loading skeleton en todas las rutas
- [ ] Estado vacío en catálogo, producto y checkout
- [ ] Redirect `/store/product/[id]` → `/store/producto/[id]`
- [ ] URLs normalizadas (sin tildes en paths)

### WEB-2 — Catálogo Funcional
- [ ] Catálogo con paginación (server-side)
- [ ] Búsqueda funcional
- [ ] Filtros de categoría y precio en server
- [ ] Categoría dinámica desde backend
- [ ] Producto detalle carga en < 2 segundos (P95)
- [ ] Badge de disponibilidad correcto
- [ ] Badge de modalidad visible

### WEB-3 — Carrito y Checkout
- [ ] Carrito persiste en localStorage
- [ ] Checkout con `idempotency_key` correcto
- [ ] Checkout con `sku_id` por ítem
- [ ] Validación de stock en checkout
- [ ] Creación de pedido PENDIENTE_PAGO
- [ ] Página de confirmación con PWEB número
- [ ] 0% de doble pedido en tests de concurrencia

### WEB-4 — Pagos
- [ ] Flujo completo sandbox exitoso
- [ ] Webhook signature verificada
- [ ] Reserva creada DESPUÉS del pago confirmado
- [ ] Anticipo calculado y cobrado
- [ ] Saldo comunicado al cliente

---

## 5. Pruebas de Accesibilidad

| Check | Herramienta | Fase |
|-------|-------------|------|
| Contraste de colores (WCAG AA) | axe DevTools | WEB-1 |
| Labels en formularios | Manual | WEB-1 |
| Focus keyboard navigation | Manual | WEB-1 |
| ARIA roles en botones | axe | WEB-1 |
| Alt texts en imágenes | Manual | WEB-1 |
| Screen reader flow | NVDA/VoiceOver | WEB-3 |

---

## 6. Pruebas de Rendimiento

| Métrica | Target | Herramienta |
|---------|--------|-------------|
| LCP (Largest Contentful Paint) | < 2.5s | Lighthouse |
| CLS (Cumulative Layout Shift) | < 0.1 | Lighthouse |
| FID/INP | < 200ms | Lighthouse |
| Time to First Byte | < 800ms | Lighthouse |
| Bundle size JS inicial | < 250KB gzip | next/bundle-analyzer |

---

## 7. Pruebas de Seguridad

| Test | Tipo | Fase |
|------|------|------|
| Manipulación de precio en checkout | Manual/automatizado | WEB-3 |
| Enviar `owner: "MAU"` en checkout | Manual | WEB-3 |
| XSS en campos de texto | OWASP ZAP | WEB-3 |
| CSRF en formularios | Manual | WEB-3 |
| Inyección SQL via params | OWASP ZAP | WEB-2 |
| Firma webhook inválida | Test de integración | WEB-4 |
| Enumerar pedidos | Manual | WEB-3 |
| Prompt injection en constructor | Manual | WEB-5 |
