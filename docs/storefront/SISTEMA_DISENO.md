# Sistema de Diseño — WEB-1

**Fecha:** 2026-09-08  
**Rama:** `feature/storefront-ecommerce`  
**Fuente:** Paleta oficial proporcionada por el usuario (imagen en `docs/storefront/evidencias/paleta.png`)

---

## 1. Logo

### Archivo actual
- **Ubicación:** `frontend/public/logo.png`
- **Formato:** PNG con fondo transparente
- **Descripción:** Letras burbuja multicolor con colores pasteles. Tagline: "La energía que conecta el mundo"

### Cómo reemplazar el logo

**Opción A — Sin redeploy (recomendada):**
1. Ir a `Dashboard → Sitio Web → Configuración`
2. En el campo "Logo URL" ingresar la URL pública de la nueva imagen
3. Guardar — el cambio se refleja en tiempo real

**Opción B — Reemplazar el archivo:**
1. Subir el nuevo archivo como `frontend/public/logo.png` (mantener el mismo nombre)
2. Hacer commit + push + redeploy

**Componente:** [`StoreLogo.tsx`](file:///c:/Users/jmqui/OneDrive/Documents/Nebulae/storefront-wt/frontend/src/components/store/StoreLogo.tsx)  
**Prioridad de fuente:** `config.logo_url` → `/logo.png` → fallback tipográfico

---

## 2. Paleta de Colores

### Colores de marca (paleta oficial Nebulae)

| Token semántico | HEX | Nombre | Uso principal |
|----------------|-----|--------|--------------|
| `brand-primary` | `#ED87B6` | Rosa saturado | CTAs, botones principales, hover, links activos |
| `brand-pink` | `#F6BAD6` | Rosa claro | Hover suave, fondos de tarjetas, chips |
| `brand-blue` | `#B5E1F6` | Azul pastel | Elementos secundarios, info badges, íconos |
| `brand-purple` | `#D1BADB` | Púrpura pastel | Badges especiales, acentos decorativos |
| `brand-yellow` | `#FFEE83` | Amarillo pastel | Highlights, badges de oferta, alertas suaves |
| `brand-orange` | `#F9BF92` | Naranja pastel | Warning, precio comparación, alertas |
| `brand-accent` | `#C2D987` | Verde pastel | Success, disponibilidad, "Entrega inmediata" |

### Colores de soporte

| Token | HEX | Uso |
|-------|-----|-----|
| `text-primary` | `#1C1C1E` | Textos principales, títulos |
| `text-secondary` | `#4A4A4A` | Subtítulos, cuerpo |
| `text-muted` | `#8A8A8E` | Placeholders, ayuda, meta |
| `text-inverse` | `#FFFFFF` | Texto sobre fondos de color |
| `surface` | `#FFFFFF` | Fondo de tarjetas y contenedores |
| `surface-muted` | `#FFF5FA` | Fondos hover, paneles laterales |
| `border` | `#F0E0EC` | Bordes de tarjetas, separadores |
| `border-strong` | `#D1BAD0` | Bordes visibles, focus |
| `error` | `#E55B8A` | Errores, out-of-stock (rosa más oscuro) |

### Reglas de uso

> ⚠️ **REGLA DE ORO:** Los colores de la paleta pastel son para elementos de marca y decoración. Para texto sobre fondo blanco, usar siempre `text-primary (#1C1C1E)` o `text-secondary (#4A4A4A)`. Blanco y negro son para tipografía, contraste y bordes.

1. **Nunca usar emerald/teal/green** de Tailwind — usar `#C2D987` (brand-accent) para verde
2. **Nunca usar rose/pink** de Tailwind para CTAs — usar `#ED87B6` (brand-primary)
3. **Los valores HEX se importan desde** `lib/design-tokens.ts` — no escribir HEX a mano
4. **Ratio de contraste mínimo:** 4.5:1 para texto normal (WCAG AA)
5. **No usar colores pasteles para texto** sobre fondo blanco — ratio insuficiente

---

## 3. Tipografía

### Fuente actual
- **Sistema:** Font stack del sistema (`font-sans`)
- **WEB-2:** Evaluar Google Fonts personalizada (Nunito, Quicksand u otra redondeada)

### Escala de texto

| Uso | Clase Tailwind | Peso |
|-----|---------------|------|
| Título principal | `text-4xl / text-5xl` | `font-black (900)` |
| Subtítulo | `text-2xl / text-3xl` | `font-black (900)` |
| Card title | `text-sm` | `font-bold (700)` |
| Cuerpo | `text-base` | `font-normal` |
| Meta / Helper | `text-xs` | `font-medium / font-bold` |
| Badge / Chip | `text-xs` | `font-bold (700)` |

---

## 4. Espaciado

- **Container máximo:** `max-w-7xl` (1280px)
- **Padding horizontal:** `px-4 sm:px-6 lg:px-8`
- **Gap de grid:** `gap-4 lg:gap-6`
- **Border radius:** `rounded-2xl` (16px) tarjetas; `rounded-full` botones y badges

---

## 5. Componentes — Referencia

| Componente | Archivo | Uso |
|-----------|---------|-----|
| `ProductCard` | `components/store/ProductCard.tsx` | Grid y lista de productos |
| `AvailabilityBadge` | `components/store/AvailabilityBadge.tsx` | Estado de stock |
| `ModalityBadge` | `components/store/ModalityBadge.tsx` | Entrega inmediata / por pedido |
| `StoreLogo` | `components/store/StoreLogo.tsx` | Logo dinámico |
| `StoreFooter` | `components/store/StoreFooter.tsx` | Footer compartido |
| `FilterDrawer` | `components/store/FilterDrawer.tsx` | Filtros en móvil |
| `Toast` | `components/Toast.tsx` | Notificaciones |
| `EmptyState` | `components/store/States.tsx` | Pantallas vacías |
| `ErrorState` | `components/store/States.tsx` | Pantallas de error |
| `ProductGridSkeleton` | `components/store/States.tsx` | Loading de productos |

---

## 6. Badges de Estado

### Disponibilidad

| Estado | Color | Cuando mostrar |
|--------|-------|----------------|
| `available` | Verde `#C2D987` | stock > alerta_minimo |
| `low_stock` | Naranja `#F9BF92` | 0 < stock ≤ alerta_minimo |
| `out_of_stock` | Rosa `#F6BAD6` | stock == 0 |
| `by_order` | Azul `#B5E1F6` | modalidad == POR_PEDIDO |

### Modalidad

| Modalidad | Color | Ícono |
|-----------|-------|-------|
| ENTREGA_INMEDIATA | Verde `#C2D987` | 🚛 Truck |
| POR_PEDIDO | Azul `#B5E1F6` | 🕐 Clock |

---

## 7. Accesibilidad

- **Focus visible:** `focus-visible:ring-2 focus-visible:ring-[#ED87B6]` en todos los controles
- **ARIA labels:** Presentes en botones sin texto (ícono only)
- **ARIA live:** `role="alert" aria-live="assertive"` en Toast
- **Skip link:** Pendiente WEB-2 (`#main-content` ya existe como target)
- **Reduced motion:** Filtros de animación CSS en FilterDrawer y Toast

---

## 8. Tokens de código

**Archivo central:** [`lib/design-tokens.ts`](file:///c:/Users/jmqui/OneDrive/Documents/Nebulae/storefront-wt/frontend/src/lib/design-tokens.ts)

```typescript
// Importar en cualquier componente:
import { BRAND, TOKENS, CLS, AVAILABILITY_CLS, MODALITY_CLS } from '@/lib/design-tokens';

// Usar clases predefinidas:
<button className={CLS.btnPrimary}>Comprar</button>
<span className={CLS.badgeAccent}>Nuevo</span>
```

---

## 9. ¿Cómo actualizar la paleta en el futuro?

1. Editar los valores HEX en `lib/design-tokens.ts` en las secciones `BRAND` y `TOKENS`
2. Revisar que el ratio de contraste sigue siendo ≥ 4.5:1 para texto
3. Ejecutar `npm run build` para verificar que no hay errores
4. Actualizar este documento con los nuevos valores
5. Tomar capturas de comparación antes/después
