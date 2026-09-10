/**
 * Nebulae Storefront — Shared TypeScript Types
 * Source of truth for all store-facing data shapes.
 *
 * WEB-1 (rev 2): RawCategoria extended for arbitrary-depth hierarchy and
 * flat parent_id assembly. RawSubCategoria is now fully compatible with
 * RawCategoria (same fields) to enable uniform recursive processing.
 */

// ─── Category / Navigation ────────────────────────────────────────────────────

/**
 * Raw shape returned by GET /api/v1/ecommerce/categorias.
 *
 * Supports three API response shapes simultaneously:
 *   1. Legacy string-only sub_categorias: ["Niño", "Niña"]
 *   2. Object sub_categorias with minimal fields
 *   3. Full hierarchical objects with children, parent_id, id, slug
 *   4. Flat lists related by parent_id (assembled by normalizeCategories)
 */
export type RawCategoria = {
  id?: string | number | null;
  nombre: string;
  slug?: string | null;
  /** Legacy: string[] or richer object sub_categorias */
  sub_categorias?: (string | RawSubCategoria)[];
  /** Full recursive children — supersedes sub_categorias when present */
  children?: RawCategoria[];
  orden?: number | null;
  activa?: boolean | null;
  visible_en_menu?: boolean | null;
  /** Flat-list parent reference; used by normalizeCategories to build tree */
  parent_id?: string | number | null;
};

/**
 * A subcategory node in the API response.
 * May itself carry children for 3+ level hierarchies.
 */
export type RawSubCategoria = {
  id?: string | number | null;
  nombre: string;
  slug?: string | null;
  orden?: number | null;
  activa?: boolean | null;
  visible_en_menu?: boolean | null;
  /** Nested children for ≥3 level support */
  children?: RawSubCategoria[];
  sub_categorias?: (string | RawSubCategoria)[];
};

/** Normalized tree node used by the frontend — depth-independent */
export type NavNode = {
  id: string;
  label: string;
  slug: string;
  href: string;
  children: NavNode[];
  orden: number;
};

// ─── Product ──────────────────────────────────────────────────────────────────

export type Product = {
  id: string;
  nombre: string;
  descripcion: string;
  descripcion_larga?: string;
  sku?: string;
  precio_venta: number;
  precio_comparacion?: number;
  descuento_pct?: number;
  impuesto_pct?: number;
  imagenes: string[];
  atributos?: ProductAtributo[];
  variantes?: ProductVariante[];
  stock_disponible: number;
  alerta_stock_minimo?: number;
  categoria: string;
  sub_categoria?: string;
  marca: string;
  tipo_producto?: string;
  publicado_web?: boolean;
  rastrear_inventario?: boolean;
  modalidad?: 'ENTREGA_INMEDIATA' | 'POR_PEDIDO' | 'DISPONIBILIDAD_POR_CONFIRMAR';
  seo_titulo?: string;
  seo_descripcion?: string;
  created_at?: string;
  updated_at?: string;
};

export type ProductAtributo = {
  nombre: string;
  valor: string | string[];
};

export type ProductVariante = {
  id?: string;
  sku?: string;
  atributos?: Record<string, string>;
  precio_venta?: number;
  stock?: number;
};

// ─── Cart ─────────────────────────────────────────────────────────────────────

export type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
  variant: string;
  img: string;
  sku?: string;
  modalidad?: 'ENTREGA_INMEDIATA' | 'POR_PEDIDO' | 'DISPONIBILIDAD_POR_CONFIRMAR';
  /** WEB-2B.1: FK canónico a product_skus.id para procesamiento de órdenes */
  sku_id?: number;
  /** WEB-2B.1: ID de variante específica si aplica */
  variant_id?: string;
};


export type CartContextType = {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (id: string, variant?: string) => void;
  updateQty: (id: string, variant: string, qty: number) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  cartTotal: number;
  cartCount: number;
};

// ─── Site Config (Web Builder) ────────────────────────────────────────────────

/**
 * A featured category entry from web builder config.
 * Allows the admin to pin specific categories on the home page.
 */
export type FeaturedCategory = {
  /** Stable category slug from the ERP */
  slug: string;
  label: string;
  emoji?: string;
  href?: string;
};

export type WebConfig = {
  hero?: {
    title?: string;
    subtitle?: string;
    cta_text?: string;
    cta_href?: string;
    bg_image?: string;
    badge_text?: string;
    /** Informational bar displayed above / below hero */
    info_bar?: string;
  };
  contact?: {
    phone?: string;
    whatsapp?: string;
    email?: string;
    address?: string;
    horarios?: string;
  };
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
  logo_url?: string;
  seo?: {
    site_name?: string;
    default_title?: string;
    default_description?: string;
  };
  /** Pinned categories to highlight on the home page */
  featured_categories?: FeaturedCategory[];
};

// ─── Availability ─────────────────────────────────────────────────────────────

export type AvailabilityStatus =
  | 'available'       // stock_disponible > alerta_stock_minimo AND modalidad canónica ENTREGA_INMEDIATA
  | 'low_stock'       // 0 < stock_disponible <= alerta_stock_minimo AND modalidad canónica ENTREGA_INMEDIATA
  | 'out_of_stock'    // stock_disponible == 0
  | 'by_order'        // modalidad == POR_PEDIDO (no depende de stock local)
  | 'unconfirmed';    // modalidad no pudo verificarse como canónica — stock puede ser manual


// ─── Filter State ─────────────────────────────────────────────────────────────

export type FilterState = {
  search: string;
  categoria: string;
  subcategoria: string;
  marca: string;
  precioMin: string;
  precioMax: string;
  modalidad: string;
  disponibilidad: string;
  talla: string;
  color: string;
};
