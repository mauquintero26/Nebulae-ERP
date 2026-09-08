# RESUMEN EJECUTIVO — WEB-0

**Fase:** WEB-0 — Auditoría, Arquitectura y Plan de Integración  
**Rama:** `feature/storefront-ecommerce`  
**Worktree:** `c:/Users/jmqui/OneDrive/Documents/Nebulae/storefront-wt`  
**Commit base (origin/main):** `81d70b54bffb6d81415dd445061d25ee2e67cffd`  
**Fecha:** 2026-09-08  
**Auditor:** Antigravity WEB-0

---

## Porcentaje de Preparación para WEB-1

**83% preparado para iniciar WEB-1**

| Área | Preparación |
|------|------------|
| Rama y worktree | ✅ 100% |
| Inventario de pantallas | ✅ 100% |
| Diagnóstico visual | ✅ 90% (sin capturas reales — servidor no levantado) |
| Inventario de componentes | ✅ 100% |
| Análisis de duplicidades | ✅ 100% |
| Matriz de APIs | ✅ 100% |
| Arquitectura propuesta | ✅ 100% |
| Modelo comercial | ✅ 100% |
| Constructor IA (diseño) | ✅ 100% |
| Estrategia de seguridad | ✅ 100% |
| Estrategia de pruebas | ✅ 100% |
| Plan de fases | ✅ 100% |
| Decisiones arquitectónicas | ✅ 100% |
| Capturas desktop/móvil | ❌ 0% (requiere frontend levantado) |
| Backend intacto | ✅ 100% confirmado |
| BD intacta | ✅ 100% confirmado |

---

## Lo que Existe y Está Bien

### Tienda Pública
1. **Layout completo** — Header, mega-menú dinámico, carrito slide-over, menú móvil
2. **Catálogo funcional** — Búsqueda, filtros, grid de productos con skeleton y estado vacío
3. **Detalle de producto** — Galería, atributos dinámicos, selector de cantidad, stock visible
4. **Checkout parcial** — UI completa, llama al backend (pero con errores de contrato)
5. **Identidad visual sólida** — Paleta emerald/slate consistente, tipografía, bordes redondeados

### Admin Ecommerce
6. **Dashboard más completo** — CRUD de productos, gestión de pedidos, stats reales, configuración del sitio
7. **ProductModal** — Formulario completo con 5 tabs (General, Imágenes, Atributos, SEO, Notas)
8. **Constructor v1** — Lee y guarda config real en backend (hero, contacto, colores)

### Backend
9. **API robusta** — Validación de precios, idempotencia, anti-manipulación, stock real
10. **Reservas correctas** — No se reserva al agregar al carrito; solo al confirmar pago
11. **Separación patrimonial** — NEBULAE/MAU completamente diferenciados

---

## Los Problemas Críticos que Deben Resolverse

### 🔴 CRÍTICO — Checkout roto en producción

El checkout actual (`store/checkout/page.tsx`) enviará errores 422 en producción porque:
1. No envía `idempotency_key` (requerido por backend)
2. No envía `sku_id` ni `sku` por ítem (solo el nombre)
3. No hay pasarela de pago real conectada

**Impacto:** Ningún cliente puede completar una compra hoy.  
**Solución:** WEB-3 — Refactor completo del checkout.

---

### 🔴 DUPLICIDAD — `/store/product/[id]` es código muerto

Este archivo (111 líneas) es un mock completo no enlazado desde ningún lugar. Consume espacio y puede confundir.  
**Solución:** Eliminar en WEB-1 con redirect 301.

---

### 🟡 RIESGO — `stock_disponible` puede estar desactualizado

El campo `stock_disponible` en `ecommerce_products` es manual. Si alguien vende desde el ERP sin actualizar este campo, el cliente verá "Disponible" pero el checkout fallará con 409.  
**Solución:** Sincronización o cálculo en tiempo real en WEB-3.

---

### 🟡 FRAGMENTACIÓN — Tienda no usa `lib/api.ts`

La tienda hace fetch directos con URL hardcodeada en múltiples archivos. Cambiar el endpoint de la API requiere editar 5+ archivos.  
**Solución:** Crear `lib/store-api.ts` en WEB-2.

---

### 🟡 SIDEBAR MÓVIL INCOMPLETO — Catálogo

El botón de filtros en móvil existe pero el panel de filtros no se renderiza al hacer clic.  
**Solución:** WEB-1 — Implementar drawer de filtros en móvil.

---

## Mapa de Navegación Confirmado

```
/store (Home — conectado parcial)
├── /store/catalogo (Catálogo — conectado)
├── /store/categoria/[slug] (Categoría — conectado)
├── /store/producto/[id] (Producto — conectado, CANÓNICA)
├── /store/product/[id] (Producto — MOCK, eliminar)
├── /store/checkout (Checkout — roto en prod)
├── /store/cuenta (Cuenta — mock total)
├── /store/contacto (Contacto — parcial)
└── /store/blog (Blog — mock total)

/dashboard/ecommerce (Admin — muy conectado)
/dashboard/sitio-web (Constructor v1 — conectado, CANÓNICA)
/dashboard/website (Constructor v2 — mock, fusionar en WEB-5)
```

---

## APIs Backend — Estado de Integración

| Área | APIs disponibles | APIs faltantes |
|------|-----------------|----------------|
| Catálogo web | ✅ CRUD completo | — |
| Categorías | ✅ CRUD completo | — |
| Pedidos PWEB | ✅ List + Get + Create + Update | — |
| Stats ecommerce | ✅ Completo | — |
| Web builder | ✅ Config, publish, sections | Versiones, rollback |
| Carritos abandonados | ✅ Disponible | — |
| Pagos | 🔴 No existe | Toda la integración de pagos |
| Auth cliente B2C | 🔴 No existe | Register, login, refresh |
| Seguimiento cliente | 🔴 No existe | Estado pedido por PWEB# |
| Blog CMS | 🔴 No existe | CRUD artículos |
| Formulario contacto | 🔴 No existe | Envío de mensajes |
| Búsqueda avanzada | ⚠️ Solo por nombre | Full-text, sinónimos |
| Reseñas | 🔴 No existe | — |

---

## Preguntas al Usuario (Información Requerida)

Para completar WEB-1 y las fases siguientes, se necesita la siguiente información:

### Marca e Identidad Visual
1. ¿Hay un logo de Nebulae en formato SVG/PNG que reemplace el texto "NEBULAE."?
2. ¿Los colores emerald/slate son los definitivos o hay una paleta de marca diferente?
3. ¿Hay tipografía personalizada o se usa la fuente del sistema?
4. ¿Hay referencias visuales de tiendas que te gusten o con las que te identifiques?
5. ¿Hay pantallas actuales que definitivamente NO te gustan?

### Contenido y Estructura
6. ¿Cuál es el menú de navegación definitivo (categorías, nombres)?
7. ¿Qué categorías y marcas destacadas debe mostrar la home?
8. ¿Hay banner(s) de promoción o colección para la home?
9. ¿Cuáles son las políticas de envío, devolución y garantía?
10. ¿Hay dominio definitivo de la tienda? (¿nebulaekids.com o otro?)

### Comercial
11. ¿Qué pasarela de pago se usará? ¿Wompi? ¿PayU? ¿Epayco?
12. ¿El envío es gratis? ¿Desde qué monto?
13. ¿Cuál es el porcentaje de anticipo para productos por pedido?
14. ¿Cuántos días tiene el cliente para pagar el saldo de un pedido por pedido?
15. ¿Hay política de cambios/devoluciones definida?

### Contacto y Redes
16. ¿Cuál es el número de WhatsApp de la tienda?
17. ¿Cuál es el email de atención al cliente?
18. ¿Cuáles son las redes sociales activas?
19. ¿Cuál es la dirección física (si aplica)?
20. ¿Cuáles son los horarios de atención?

### Técnico
21. ¿El stock del catálogo web debe sincronizarse automáticamente con el ERP o manualmente?
22. ¿Se necesita soporte para múltiples idiomas (es/en)?
23. ¿Hay fotografías propias de productos para las tarjetas?

---

## Recomendación sobre WEB-1

**✅ Se recomienda iniciar WEB-1** una vez que el usuario:
1. Haya revisado este resumen
2. Haya respondido las preguntas mínimas: 1 (logo), 2 (colores), 6 (menú), 11 (pasarela)
3. Haya dado aprobación expresa

WEB-1 no requiere las respuestas completas — puede iniciarse con lo que hay y ajustar.

---

## Declaraciones de Cierre

> ✅ La rama `feature/storefront-ecommerce` fue creada desde `origin/main` commit `81d70b5`  
> ✅ El worktree está en `c:/Users/jmqui/OneDrive/Documents/Nebulae/storefront-wt`  
> ✅ `main` no fue modificada  
> ✅ No se modificó ninguna pantalla visual  
> ✅ No se modificó el backend  
> ✅ No se tocó ninguna base de datos  
> ✅ No se conectaron pagos reales  
> ✅ No se activó WhatsApp productivo  
> ✅ No se hizo merge  
> ✅ No se desplegó nada  
> ✅ No se inició la Fase 7 del ERP  
> ✅ No se inició WEB-1  

**Esperando autorización expresa del usuario para proceder con WEB-1.**

---

## Evidencia Git

```
Rama activa (worktree):   feature/storefront-ecommerce
Commit HEAD worktree:     81d70b54bffb6d81415dd445061d25ee2e67cffd
Commit origin/main:       81d70b54bffb6d81415dd445061d25ee2e67cffd
Commit base WEB-0:        81d70b54bffb6d81415dd445061d25ee2e67cffd
Archivos creados:         docs/storefront/ (14 archivos .md)
Archivos modificados:     0
Archivos eliminados:      0
Backend modificado:       NO
Base de datos:            NO TOCADA
```
