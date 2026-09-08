/**
 * Nebulae Storefront — Shared TypeScript Types
 * Source of truth for all store-facing data shapes.
 */

// ─── Category / Navigation ────────────────────────────────────────────────────

/** Raw shape returned by GET /api/v1/ecommerce/categorias */
export type RawCategoria = {
  id?: string | number;
  nombre: string;
  slug?: string;
  sub_categorias?: string[] | RawSubCategoria[];
  orden?: number;
  activa?: boolean;
  visible_en_menu?: boolean;
  parent_id?: string | number | null;
};

export type RawSubCategoria = {
  id?: string | number;
  nombre: string;
  slug?: string;
  orden?: number;
  activa?: boolean;
};

/** Normalized tree node used by the frontend */
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
  modalidad?: 'ENTREGA_INMEDIATA' | 'POR_PEDIDO';
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
  modalidad?: 'ENTREGA_INMEDIATA' | 'POR_PEDIDO';
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

export type WebConfig = {
  hero?: {
    title?: string;
    subtitle?: string;
    cta_text?: string;
    cta_href?: string;
    bg_image?: string;
    badge_text?: string;
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
};

// ─── Availability ─────────────────────────────────────────────────────────────

export type AvailabilityStatus =
  | 'available'       // stock_disponible > alerta_stock_minimo
  | 'low_stock'       // 0 < stock_disponible <= alerta_stock_minimo
  | 'out_of_stock'    // stock_disponible == 0
  | 'by_order';       // modalidad == POR_PEDIDO

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
