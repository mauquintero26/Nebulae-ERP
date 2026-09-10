/**
 * store-api/types.ts
 *
 * Tipos TypeScript que reflejan exactamente las respuestas reales del backend.
 * Fuente: backend/app/api/v1/ecommerce.py
 * Última revisión: WEB-2B.1 (2026-09-10)
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
 *
 * WEB-2B.1 adds:
 *   - sku_id: FK a product_skus.id (null = sin vínculo canónico)
 *   - purchasable: true solo si el producto tiene sku_id válido y modalidad configurada
 *   - requires_configuration: true para productos ERP sin ficha ecommerce
 *   - availability_source: REAL | MANUAL | UNCONFIRMED
 *   - modalidad: política de entrega configurada explícitamente en ecommerce_products
 *   - modalidad_disponible: ENTREGA_INMEDIATA | POR_PEDIDO | DISPONIBILIDAD_POR_CONFIRMAR
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
  /**
   * Modalidad honesta calculada por el servidor.
   * WEB-2B.1: ahora incluye DISPONIBILIDAD_POR_CONFIRMAR para productos sin vínculo canónico.
   */
  modalidad_disponible?: 'ENTREGA_INMEDIATA' | 'POR_PEDIDO' | 'DISPONIBILIDAD_POR_CONFIRMAR';
  /** Política de entrega configurada explícitamente en ecommerce_products */
  modalidad?: 'ENTREGA_INMEDIATA' | 'POR_PEDIDO' | 'DISPONIBILIDAD_POR_CONFIRMAR';
  alerta_stock_minimo: number;
  publicado_web: boolean;
  rastrear_inventario: boolean;
  seo_titulo: string | null;
  seo_descripcion?: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Solo en list endpoint — calculado por servidor */
  is_low_stock?: boolean;
  // ── WEB-2B.1: SKU link y contrato de disponibilidad ─────────────────────────
  /** FK a product_skus.id. null = sin vínculo canónico (stock es MANUAL) */
  sku_id?: number | null;
  /** true solo si tiene sku_id válido y está configurado para venta */
  purchasable?: boolean;
  /** true para productos ERP sin ficha ecommerce completa */
  requires_configuration?: boolean;
  /** Fuente del stock reportado: REAL | MANUAL | UNCONFIRMED */
  availability_source?: 'REAL' | 'MANUAL' | 'UNCONFIRMED';
};

export type BackendProductAtributo = {
  nombre: string;
  valor: string | string[];
};

export type BackendProductVariante = {
  /** ID is stored as string to match ProductVariante in @/types/store */
  id?: string;
  sku?: string;
  /** WEB-2B.1: canonical sku_id link to product_skus.id */
  sku_id?: number;
  atributos?: Record<string, string>;
  precio_venta?: number;
  stock?: number;
};

export type CatalogListResponse = ApiEnvelope<BackendProduct[]> & {
  total: number;
};

// ─── Disponibilidad endpoint (WEB-2B.1) ──────────────────────────────────────

/**
 * Respuesta de GET /ecommerce/catalogo/{id}/disponibilidad.
 * Endpoint público, Cache-Control: no-store.
 * No expone costos, propietarios internos, proveedores ni márgenes.
 */
export type ProductAvailability = {
  product_id: number;
  /** FK a product_skus.id. null = sin vínculo canónico */
  sku_id: number | null;
  sku: string | null;
  /** Unidades vendibles reales: InventoryOwnerBalance(NEBULAE) - InventoryReservation(ACTIVE) */
  stock_vendible: number;
  /** Máximo orderable: boundado por stock si ENTREGA_INMEDIATA, 99 si POR_PEDIDO */
  max_orderable: number;
  /** true si hay stock o si no se rastrea inventario o si es POR_PEDIDO */
  disponible: boolean;
  /** Política de entrega configurada en ecommerce_products */
  modalidad: 'ENTREGA_INMEDIATA' | 'POR_PEDIDO' | 'DISPONIBILIDAD_POR_CONFIRMAR';
  /** Modalidad honesta — nunca inferida de stock solo */
  modalidad_disponible: 'ENTREGA_INMEDIATA' | 'POR_PEDIDO' | 'DISPONIBILIDAD_POR_CONFIRMAR';
  /** true = listo para agregar al carrito y comprar */
  purchasable: boolean;
  /** true = necesita configuración adicional en panel admin */
  requires_configuration: boolean;
  /** true si no es ENTREGA_INMEDIATA directa */
  requires_supplier_confirmation: boolean;
  /** REAL = stock del ERP | MANUAL = stock manual | UNCONFIRMED = sin vínculo */
  availability_source: 'REAL' | 'MANUAL' | 'UNCONFIRMED';
  alerta_stock_minimo: number;
  /** Siempre null — el frontend no conoce warehouse_id */
  warehouse_id: null;
  /** ISO 8601 timestamp del cálculo */
  timestamp: string;
};

export type AvailabilityResponse = ApiEnvelope<ProductAvailability>;

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
 *
 * WEB-2B.1: añade sku_id, purchasable, requires_configuration, availability_source.
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
  /**
   * Modalidad de entrega resuelta para el frontend.
   * - ENTREGA_INMEDIATA: confirmado por modalidad_disponible del servidor.
   * - POR_PEDIDO: confirmado por modalidad_disponible o legacy modalidad del servidor.
   * - DISPONIBILIDAD_POR_CONFIRMAR: no existe modalidad canónica verificable;
   *   el stock puede ser un valor manual. Ver GAP-004.
   */
  modalidad: 'ENTREGA_INMEDIATA' | 'POR_PEDIDO' | 'DISPONIBILIDAD_POR_CONFIRMAR';
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
  // ── WEB-2B.1: SKU link y contrato de disponibilidad ─────────────────────────
  /** FK a product_skus.id. null = sin vínculo canónico */
  sku_id: number | null;
  /** true solo si tiene sku_id válido y está configurado para venta */
  purchasable: boolean;
  /** true para productos ERP sin ficha ecommerce completa */
  requires_configuration: boolean;
  /** Fuente del stock reportado: REAL | MANUAL | UNCONFIRMED */
  availability_source: 'REAL' | 'MANUAL' | 'UNCONFIRMED';
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
