/**
 * Nebulae Storefront — Design Tokens
 *
 * Paleta oficial suministrada por el usuario (imagen de referencia en
 * docs/storefront/evidencias/paleta.png).
 *
 * REGLA: No escribir valores HEX a mano en los componentes.
 * Importar siempre desde este archivo o usar las clases CSS de Tailwind
 * que referencian estos tokens.
 *
 * Blanco (#FFFFFF) y negro (#1C1C1E) se utilizan para texto, contraste,
 * bordes y elementos de apoyo — nunca como color de marca principal.
 */

// ─── Colores de Marca (Paleta Nebulae) ────────────────────────────────────────

export const BRAND = {
  /** Rosa saturado — CTA principal, botones de acción, links activos */
  primary:       '#ED87B6',
  /** Rosa claro — hover suave, fondos de tarjetas, chips */
  pink:          '#F6BAD6',
  /** Azul pastel — elementos secundarios, iconos, hover */
  blue:          '#B5E1F6',
  /** Púrpura pastel — badges especiales, acentos */
  purple:        '#D1BADB',
  /** Amarillo pastel — highlights, badges de oferta */
  yellow:        '#FFEE83',
  /** Naranja pastel — alertas suaves, precio comparación, advertencias */
  orange:        '#F9BF92',
  /** Verde pastel — success, disponibilidad, badges de stock */
  accent:        '#C2D987',
} as const;

// ─── Tokens Semánticos ────────────────────────────────────────────────────────

export const TOKENS = {
  // Marca
  'brand-primary':    BRAND.primary,   // #ED87B6
  'brand-secondary':  BRAND.blue,      // #B5E1F6
  'brand-accent':     BRAND.accent,    // #C2D987
  'brand-yellow':     BRAND.yellow,    // #FFEE83
  'brand-purple':     BRAND.purple,    // #D1BADB
  'brand-orange':     BRAND.orange,    // #F9BF92
  'brand-pink':       BRAND.pink,      // #F6BAD6

  // Superficies
  'surface':          '#FFFFFF',
  'surface-muted':    '#FFF5FA',       // blanco rosado muy suave
  'surface-accent':   '#F0F9FF',       // blanco azulado muy suave
  'surface-warm':     '#FFFDF5',       // blanco cálido

  // Texto
  'text-primary':     '#1C1C1E',       // casi negro
  'text-secondary':   '#4A4A4A',       // gris oscuro
  'text-muted':       '#8A8A8E',       // gris medio
  'text-inverse':     '#FFFFFF',       // blanco (sobre fondos de color)

  // Bordes
  'border':           '#F0E0EC',       // borde rosa muy suave
  'border-strong':    '#D1BAD0',       // borde visible

  // Estados funcionales
  'success':          BRAND.accent,    // #C2D987
  'warning':          BRAND.orange,    // #F9BF92
  'error':            '#E55B8A',       // rosa más oscuro para errores (legible)
  'info':             BRAND.blue,      // #B5E1F6

  // Interacción
  'hover-primary':    '#E06FA3',       // primary oscurecido ~10%
  'hover-secondary':  '#93CEF0',       // blue oscurecido ~10%
  'hover-accent':     '#AECB74',       // accent oscurecido ~10%
  'focus-ring':       '#ED87B6',       // igual que primary
} as const;

// ─── Tailwind CSS Custom Classes ──────────────────────────────────────────────
// Estas son las clases que se usan directamente en los componentes.
// Corresponden a los tokens semánticos de arriba.

export const CLS = {
  // Botones principales
  btnPrimary:   'bg-[#ED87B6] hover:bg-[#E06FA3] text-white font-bold rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ED87B6]',
  btnSecondary: 'bg-[#B5E1F6] hover:bg-[#93CEF0] text-[#1C1C1E] font-bold rounded-full transition-all',
  btnOutline:   'border-2 border-[#ED87B6] text-[#ED87B6] hover:bg-[#FFF5FA] font-bold rounded-full transition-all',
  btnGhost:     'hover:bg-[#FFF5FA] text-[#4A4A4A] font-bold rounded-lg transition-all',
  btnDanger:    'bg-[#E55B8A] hover:bg-[#C44A77] text-white font-bold rounded-full transition-all',

  // Tarjetas
  card:         'bg-white rounded-2xl border border-[#F0E0EC] shadow-sm hover:shadow-md transition-shadow',
  cardHover:    'bg-white rounded-2xl border border-[#F0E0EC] shadow-sm hover:shadow-lg hover:border-[#ED87B6] transition-all',

  // Badges / Chips
  badgePrimary: 'bg-[#FFF0F7] text-[#ED87B6] border border-[#F6BAD6] font-bold rounded-full px-3 py-1 text-xs',
  badgeAccent:  'bg-[#F4FAE6] text-[#7A9A40] border border-[#C2D987] font-bold rounded-full px-3 py-1 text-xs',
  badgeWarning: 'bg-[#FFF5EC] text-[#C47A3A] border border-[#F9BF92] font-bold rounded-full px-3 py-1 text-xs',
  badgeError:   'bg-[#FFEEF4] text-[#E55B8A] border border-[#F6BAD6] font-bold rounded-full px-3 py-1 text-xs',
  badgeInfo:    'bg-[#EBF7FF] text-[#3A8FC4] border border-[#B5E1F6] font-bold rounded-full px-3 py-1 text-xs',

  // Links
  link:         'text-[#ED87B6] hover:text-[#E06FA3] font-bold transition-colors underline-offset-2 hover:underline',
  linkSubtle:   'text-[#4A4A4A] hover:text-[#ED87B6] transition-colors',

  // Focus accesible
  focusRing:    'focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2 focus-visible:outline-none',

  // Inputs
  input:        'border border-[#F0E0EC] rounded-xl px-4 py-2.5 text-sm text-[#1C1C1E] placeholder:text-[#8A8A8E] focus:outline-none focus:ring-2 focus:ring-[#ED87B6] focus:border-transparent transition-all',

  // Skeleton
  skeleton:     'bg-[#F9ECF4] animate-pulse rounded-2xl',

  // Gradientes
  gradHero:     'bg-gradient-to-br from-[#F6BAD6] via-[#D1BADB] to-[#B5E1F6]',
  gradCategory: 'bg-gradient-to-r from-[#ED87B6] to-[#D1BADB]',
  gradAccent:   'bg-gradient-to-r from-[#C2D987] to-[#B5E1F6]',

  // Backgrounds
  bgMuted:      'bg-[#FFF5FA]',
  bgAccent:     'bg-[#F0F9FF]',
  bgWarm:       'bg-[#FFFDF5]',
} as const;

// ─── Availability Status Classes ──────────────────────────────────────────────

export const AVAILABILITY_CLS = {
  available:    { label: 'Disponible',        cls: 'bg-[#F4FAE6] text-[#7A9A40] border-[#C2D987]' },
  low_stock:    { label: 'Últimas unidades',  cls: 'bg-[#FFF5EC] text-[#C47A3A] border-[#F9BF92]' },
  out_of_stock: { label: 'Agotado',           cls: 'bg-[#FFEEF4] text-[#E55B8A] border-[#F6BAD6]' },
  by_order:     { label: 'Por pedido',        cls: 'bg-[#EBF7FF] text-[#3A8FC4] border-[#B5E1F6]' },
} as const;

// ─── Modality Classes ─────────────────────────────────────────────────────────

export const MODALITY_CLS = {
  ENTREGA_INMEDIATA: { label: 'Entrega inmediata', cls: 'bg-[#F4FAE6] text-[#7A9A40] border-[#C2D987]' },
  POR_PEDIDO:        { label: 'Por pedido',         cls: 'bg-[#EBF7FF] text-[#3A8FC4] border-[#B5E1F6]' },
} as const;
