/**
 * store-api/types.ts
 *
 * Tipos TypeScript que reflejan exactamente las respuestas reales del backend.
 * Fuente: backend/app/api/v1/ecommerce.py (revisado 2026-09-09).
 *
 * NO inventar campos que el backend no devuelve.
 * Usar `unknown` para campos no inspeccionados.
 */

// ─── Backend response envelope ────────────────────────────────────────────────

export type ApiEnvelope<T> = {
  status: 'success' | 'error';
  data?: T;
  total?: number;
  error?: string;
};

// ─── Catalog / Product ────────────────────────────────────────────────────────

/**
 * Producto tal como lo devuelve GET /ecommerce/catalogo y /ecommerce/catalogo/{id}.
 * NOTA: el backend devuelve `modalidad_disponible` (calculado en servidor),
 * no `modalidad`. El campo `modalidad` sigue existiendo para compatibilidad
 * con datos legados del campo manual.
 */
export type BackendProduct = {
  id: number;
  nombre: string;
  descripcion: string | null;
  descripcion_larga?: string | null;
  sku: string | null;
  precio_venta: number;
  precio_comparacion: number;
  descuento_pct: number;
  impuesto_pct: number;
  categoria: string | null;
  sub_categoria: string | null;
  marca: string | null;
  tipo_producto: string | null;
  imagenes: string[];
  atributos: BackendProductAtributo[];
  variantes: BackendProductVariante[];
  stock_disponible: number;
  /** Calculado por el servidor en tiempo real */
  modalidad_disponible?: 'ENTREGA_INMEDIATA' | 'POR_PEDIDO';
  /** Campo legacy/manual — prefer modalidad_disponible */
  modalidad?: 'ENTREGA_INMEDIATA' | 'POR_PEDIDO';
  alerta_stock_minimo: number;
  publicado_web: boolean;
  rastrear_inventario: boolean;
  seo_titulo: string | null;
  seo_descripcion?: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Solo en list endpoint — calculado por servidor */
  is_low_stock?: boolean;
};

export type BackendProductAtributo = {
  nombre: string;
  valor: string | string[];
};

export type BackendProductVariante = {
  /** ID is stored as string to match ProductVariante in @/types/store */
  id?: string;
  sku?: string;
  atributos?: Record<string, string>;
  precio_venta?: number;
  stock?: number;
};

export type CatalogListResponse = ApiEnvelope<BackendProduct[]> & {
  total: number;
};

// ─── Categories ───────────────────────────────────────────────────────────────

/**
 * Categoría tal como la devuelve GET /ecommerce/categorias.
 * Extensible para jerarquías futuras.
 */
export type BackendCategoria = {
  id?: string | number | null;
  nombre: string;
  slug?: string | null;
  sub_categorias?: (string | BackendSubCategoria)[];
  children?: BackendCategoria[];
  orden?: number | null;
  activa?: boolean | null;
  visible_en_menu?: boolean | null;
  parent_id?: string | number | null;
};

export type BackendSubCategoria = {
  id?: string | number | null;
  nombre: string;
  slug?: string | null;
  orden?: number | null;
  activa?: boolean | null;
  children?: BackendSubCategoria[];
  sub_categorias?: (string | BackendSubCategoria)[];
};

export type CategoriasResponse = BackendCategoria[] | ApiEnvelope<BackendCategoria[]>;

// ─── Site Config ──────────────────────────────────────────────────────────────

export type BackendWebConfig = {
  hero?: {
    title?: string;
    subtitle?: string;
    cta_text?: string;
    cta_href?: string;
    bg_image?: string;
    badge_text?: string;
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
  featured_categories?: Array<{
    slug: string;
    label: string;
    emoji?: string;
    href?: string;
  }>;
};

export type WebConfigResponse = ApiEnvelope<BackendWebConfig> & {
  data?: BackendWebConfig;
};

// ─── Catalog query params ─────────────────────────────────────────────────────

/**
 * Parámetros de consulta soportados por el backend real.
 * NOTA: el backend NO soporta offset/page — solo limit (máx 500).
 * La paginación real es un GAP documentado en WEB2A_GAPS_BACKEND.md.
 */
export type CatalogQueryParams = {
  /** Búsqueda por nombre, SKU o descripción (ILIKE) */
  search?: string;
  /** Filtrar por categoría (ILIKE) */
  categoria?: string;
  /** Solo productos publicados en web */
  publicado?: boolean;
  /** Máximo 500 — único mecanismo de "paginación" disponible */
  limit?: number;
};

// ─── Normalized product (frontend) ───────────────────────────────────────────

/**
 * Producto normalizado para uso en el frontend.
 * Garantiza que campos críticos no sean null/undefined.
 */
export type NormalizedProduct = {
  id: string;
  nombre: string;
  descripcion: string;
  descripcion_larga: string;
  sku: string;
  precio_venta: number;
  precio_comparacion: number;
  descuento_pct: number;
  impuesto_pct: number;
  categoria: string;
  sub_categoria: string;
  marca: string;
  tipo_producto: string;
  imagenes: string[];
  atributos: BackendProductAtributo[];
  variantes: BackendProductVariante[];
  stock_disponible: number;
  modalidad: 'ENTREGA_INMEDIATA' | 'POR_PEDIDO';
  alerta_stock_minimo: number;
  publicado_web: boolean;
  rastrear_inventario: boolean;
  seo_titulo: string;
  seo_descripcion: string;
  created_at: string;
  updated_at: string;
  is_low_stock: boolean;
  /** True si precio_comparacion > precio_venta (oferta real) */
  tiene_descuento: boolean;
};

// ─── Pagination state (client-side) ──────────────────────────────────────────

export type PaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

// ─── Filter state (URL-persistent) ───────────────────────────────────────────

export type CatalogFilterState = {
  /** URL param: q */
  search: string;
  /** URL param: categoria */
  categoria: string;
  /** URL param: subcategoria */
  subcategoria: string;
  /** URL param: marca */
  marca: string;
  /** URL param: precioMin */
  precioMin: string;
  /** URL param: precioMax */
  precioMax: string;
  /** URL param: modalidad (ENTREGA_INMEDIATA | POR_PEDIDO | '') */
  modalidad: string;
  /** URL param: disponibilidad */
  disponibilidad: string;
  /** URL param: talla */
  talla: string;
  /** URL param: color */
  color: string;
  /** URL param: page */
  page: number;
  /** URL param: ordenar */
  ordenar: string;
};

export const EMPTY_FILTERS: CatalogFilterState = {
  search: '',
  categoria: '',
  subcategoria: '',
  marca: '',
  precioMin: '',
  precioMax: '',
  modalidad: '',
  disponibilidad: '',
  talla: '',
  color: '',
  page: 1,
  ordenar: '',
};
