'use client';

/**
 * ProductoDetailPage — WEB-1
 *
 * Reescritura completa del detalle de producto.
 *
 * Cambios vs. versión anterior:
 * - Usa getProducto() desde @/lib/store-api (sin fetch() directo, sin URL hardcodeada)
 * - AbortController en useEffect (cancela al desmontar)
 * - Tipos correctos: StoreError, NormalizedProduct, CartItem
 * - Colores Nebulae (#ED87B6, etc.) — sin emerald/slate
 * - Muestra modalidad con ModalityBadge
 * - Disponibilidad con AvailabilityBadge + getAvailabilityStatus
 * - Estado 404 diferenciado (NOT_FOUND)
 * - Estado de error con botón de reintentar
 * - Breadcrumb completo
 * - Galería con miniaturas clicables
 * - Precios: sin $0, descuento solo si tiene_descuento
 * - Atributos: campo valor (string | string[]) correcto
 * - Validación de atributos requeridos antes de agregar al carrito
 * - Selector de cantidad: max = stock (ENTREGA_INMEDIATA) | 99 (POR_PEDIDO)
 * - Payload de carrito incluye modalidad
 * - Focus-visible en todos los interactivos
 * - aria-labels semánticos
 * - prefers-reduced-motion respetado en animaciones
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { use } from 'react';
import Link from 'next/link';
import {
  ShoppingCart,
  Package,
  ChevronRight,
  Minus,
  Plus,
  Check,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useCart } from '../../layout';
import {
  getProducto,
  getProductAvailability,
  getProductVariantes,
  formatCOP,
  isStoreError,
} from '@/lib/store-api';
import { AvailabilityBadge, getAvailabilityStatus } from '@/components/store/AvailabilityBadge';
import { ModalityBadge } from '@/components/store/ModalityBadge';
import { VariantSelector } from '@/components/store/VariantSelector';
import type { NormalizedProduct, ProductAvailability, ProductVariantReal, ProductVariantesResponse } from '@/lib/store-api';


// ─── Types ────────────────────────────────────────────────────────────────────

type PageState =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'error'; message: string; retryable: boolean }
  | { status: 'success'; product: NormalizedProduct };

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ProductSkeleton() {
  return (
    <div
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12"
      aria-label="Cargando producto…"
      aria-busy="true"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Image column */}
        <div className="space-y-4">
          <div className="w-full aspect-square bg-[#F6BAD6]/30 rounded-3xl motion-safe:animate-pulse" />
          <div className="flex gap-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="w-20 h-20 bg-[#F6BAD6]/30 rounded-xl motion-safe:animate-pulse"
              />
            ))}
          </div>
        </div>

        {/* Info column */}
        <div className="space-y-4 pt-4">
          <div className="h-5 bg-[#F6BAD6]/30 rounded-full motion-safe:animate-pulse w-24" />
          <div className="h-10 bg-[#F6BAD6]/30 rounded-xl motion-safe:animate-pulse w-3/4" />
          <div className="h-7 bg-[#F6BAD6]/30 rounded-xl motion-safe:animate-pulse w-1/3" />
          <div className="h-20 bg-[#F6BAD6]/30 rounded-xl motion-safe:animate-pulse" />
          <div className="h-12 bg-[#F6BAD6]/30 rounded-2xl motion-safe:animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ─── Not Found ────────────────────────────────────────────────────────────────

function NotFoundState() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
      <div className="inline-flex items-center justify-center w-24 h-24 bg-[#FFF5FA] rounded-full mb-6">
        <Package size={48} className="text-[#F6BAD6]" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-black text-[#1C1C1E] mb-2">
        Producto no encontrado
      </h1>
      <p className="text-[#8A8A8E] mb-8">
        Este producto no existe o ya no está disponible.
      </p>
      <Link
        href="/store/catalogo"
        className="inline-block px-6 py-3 bg-[#ED87B6] text-white font-bold rounded-2xl
          hover:bg-[#E06FA3] transition-colors shadow-md shadow-[#ED87B6]/30
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2"
      >
        Volver al catálogo
      </Link>
    </div>
  );
}

// ─── Error State ──────────────────────────────────────────────────────────────

function ErrorState({
  message,
  retryable,
  onRetry,
}: {
  message: string;
  retryable: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
      <div className="inline-flex items-center justify-center w-24 h-24 bg-[#FFF5FA] rounded-full mb-6">
        <AlertTriangle size={48} className="text-[#F9BF92]" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-black text-[#1C1C1E] mb-2">
        No pudimos cargar este producto
      </h1>
      <p className="text-[#8A8A8E] mb-8 max-w-md mx-auto">{message}</p>
      <div className="flex items-center justify-center gap-4 flex-wrap">
        {retryable && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#ED87B6] text-white font-bold rounded-2xl
              hover:bg-[#E06FA3] transition-colors shadow-md shadow-[#ED87B6]/30
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2"
            aria-label="Reintentar carga del producto"
          >
            <RefreshCw size={18} aria-hidden="true" />
            Reintentar
          </button>
        )}
        <Link
          href="/store/catalogo"
          className="inline-block px-6 py-3 bg-white text-[#ED87B6] font-bold rounded-2xl
            border-2 border-[#ED87B6] hover:bg-[#FFF5FA] transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2"
        >
          Ver catálogo
        </Link>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { addToCart } = useCart();

  // ── State ──
  const [pageState, setPageState] = useState<PageState>({ status: 'loading' });
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  /** Map of atributo nombre → selected valor (only for array-valued attrs) */
  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});
  const [added, setAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WEB-2B.1: Real-time availability state
  const [availabilityState, setAvailabilityState] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ok'; data: ProductAvailability }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  // WEB-2B.2: Variantes reales
  const [variantsData, setVariantsData] = useState<ProductVariantesResponse | null>(null);
  const [variantLoading, setVariantLoading] = useState(false);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariantReal | null>(null);

  // ── Fetch product ──
  const fetchProduct = useCallback(() => {
    const controller = new AbortController();

    setPageState({ status: 'loading' });
    setAvailabilityState({ status: 'idle' });
    setActiveImg(0);
    setQty(1);
    setSelectedAttrs({});
    // WEB-2B.2: Reset variant state
    setVariantsData(null);
    setVariantLoading(false);
    setVariantError(null);
    setSelectedVariant(null);

    getProducto(id, { signal: controller.signal })
      .then((product) => {
        setPageState({ status: 'success', product });
        // WEB-2B.1: Fetch availability right after loading product
        if (product.purchasable && product.sku_id) {
          setAvailabilityState({ status: 'loading' });
          getProductAvailability(product.id)
            .then((avail) => setAvailabilityState({ status: 'ok', data: avail }))
            .catch(() => setAvailabilityState({
              status: 'error',
              message: 'No pudimos confirmar disponibilidad',
            }));
        }
        // WEB-2B.2: Fetch real variants
        const numId = Number(product.id);
        if (Number.isInteger(numId) && numId > 0) {
          setVariantLoading(true);
          getProductVariantes(numId, { signal: controller.signal })
            .then((vr) => {
              setVariantsData(vr);
              setVariantLoading(false);
            })
            .catch((err: unknown) => {
              if (isStoreError(err) && err.isAborted) return;
              setVariantLoading(false);
              setVariantError('No se pudieron cargar las variantes');
            });
        }
      })

      .catch((err: unknown) => {
        if (isStoreError(err) && err.isAborted) return;
        if (isStoreError(err) && err.code === 'NOT_FOUND') {
          setPageState({ status: 'not_found' });
          return;
        }
        setPageState({
          status: 'error',
          message: isStoreError(err) ? err.publicMessage : 'Ocurrió un error inesperado.',
          retryable: isStoreError(err) ? err.isRetryable() : true,
        });
      });

    return controller;
  }, [id]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const controller = fetchProduct();
    return () => controller.abort();
  }, [fetchProduct]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Cleanup added timer on unmount
  useEffect(() => {
    return () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    };
  }, []);

  // ── Render: non-success states ──
  if (pageState.status === 'loading') return <ProductSkeleton />;
  if (pageState.status === 'not_found') return <NotFoundState />;
  if (pageState.status === 'error')
    return (
      <ErrorState
        message={pageState.message}
        retryable={pageState.retryable}
        onRetry={fetchProduct}
      />
    );

  // ── Success ──
  const { product } = pageState;

  const images = product.imagenes.length > 0 ? product.imagenes : [];
  const isPorPedido = product.modalidad === 'POR_PEDIDO';

  // WEB-2B.1: maxQty from real availability API (max_orderable=null means no ceiling)
  const apiMaxOrdeable =
    availabilityState.status === 'ok' ? availabilityState.data.max_orderable : null;
  const maxQty = apiMaxOrdeable != null
    ? apiMaxOrdeable
    : isPorPedido
    ? 999
    : Math.max(product.stock_disponible, 1);

  /** Atributos with array valor — user must select one */
  const selectableAttrs = (product.atributos ?? []).filter(
    (a) => Array.isArray(a.valor)
  );
  /** All selectable attrs must have a selection */
  const allAttrsSelected =
    selectableAttrs.length === 0 ||
    selectableAttrs.every((a) => selectedAttrs[a.nombre] !== undefined);

  const availabilityStatus = getAvailabilityStatus(
    product.stock_disponible,
    product.alerta_stock_minimo,
    product.modalidad
  );

  // WEB-2B.1: Strict AND — not purchasable or no sku_id → disabled
  const availabilityLoading = availabilityState.status === 'loading';
  const availabilityError = availabilityState.status === 'error';
  const isNotPurchasable = !product.purchasable || !product.sku_id;

  // WEB-2B.2: If product has real variants, a variant must be selected and purchasable
  const hasRealVariants = variantsData?.has_variants === true;
  const variantSelectionRequired = hasRealVariants && !selectedVariant;
  const variantNotPurchasable = hasRealVariants && selectedVariant ? !selectedVariant.disponible : false;

  const isCartDisabled =
    isNotPurchasable ||
    !allAttrsSelected ||
    availabilityLoading ||
    availabilityError ||
    variantSelectionRequired ||
    variantNotPurchasable ||
    (availabilityState.status === 'ok' && !availabilityState.data.disponible);

  // Cart button tooltip for "Consultar" state
  const isConsultar = product.requires_configuration ||
    product.modalidad_disponible === 'DISPONIBILIDAD_POR_CONFIRMAR';

  const handleAddToCart = async () => {
    if (isCartDisabled) return;

    // WEB-2B.1: Re-check availability immediately before adding to cart
    if (product.sku_id) {
      setAvailabilityState({ status: 'loading' });
      try {
        const freshAvail = await getProductAvailability(product.id);
        setAvailabilityState({ status: 'ok', data: freshAvail });
        if (!freshAvail.disponible) {
          // Availability changed — do not add
          return;
        }
      } catch {
        setAvailabilityState({
          status: 'error',
          message: 'No pudimos confirmar disponibilidad',
        });
        return;
      }
    }

    const variantLabel = Object.entries(selectedAttrs)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');

    // WEB-2B.2: use real selectedVariant sku_id and id if available;
    // fallback to legacy attr-matching for products without real variants
    const effectiveSkuId = selectedVariant?.sku_id ?? product.sku_id ?? undefined;
    const effectiveVariantId = selectedVariant?.id != null
      ? String(selectedVariant.id)
      : (() => {
        const legacyV = product.variantes?.find((v) => {
          if (typeof v !== 'object' || !v) return false;
          const vObj = v as Record<string, unknown>;
          const attrs = (vObj['atributos'] ?? {}) as Record<string, unknown>;
          return Object.entries(selectedAttrs).every(
            ([k, val]) => attrs[k] === val || vObj[k] === val
          );
        }) as Record<string, unknown> | undefined;
        return legacyV?.['variant_id'] as string | undefined;
      })();

    // WEB-2B.2: Use variant price if selected variant has a different price
    const effectivePrice = selectedVariant?.precio_venta ?? product.precio_venta;

    addToCart({
      id: product.id,
      name: product.nombre,
      price: effectivePrice,
      qty,
      variant: variantLabel,
      img: images[0] ?? '',
      modalidad: selectedVariant?.modalidad ?? product.modalidad,
      // WEB-2B.1+2B.2: canonical identifiers for order processing
      sku_id: effectiveSkuId,
      variant_id: effectiveVariantId,
    });

    setAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAdded(false), 2500);
  };









  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

      {/* ── Breadcrumb ── */}
      <nav
        className="flex items-center gap-1.5 text-sm text-[#8A8A8E] mb-8 flex-wrap"
        aria-label="Ruta de navegación"
      >
        <Link
          href="/store"
          className="font-medium hover:text-[#ED87B6] transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6] rounded"
        >
          Inicio
        </Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link
          href="/store/catalogo"
          className="font-medium hover:text-[#ED87B6] transition-colors
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6] rounded"
        >
          Catálogo
        </Link>
        {product.categoria && (
          <>
            <ChevronRight size={14} aria-hidden="true" />
            <Link
              href={`/store/catalogo?categoria=${encodeURIComponent(product.categoria)}`}
              className="font-medium hover:text-[#ED87B6] transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6] rounded"
            >
              {product.categoria}
            </Link>
          </>
        )}
        <ChevronRight size={14} aria-hidden="true" />
        <span className="text-[#1C1C1E] font-bold truncate max-w-[200px] sm:max-w-xs">
          {product.nombre}
        </span>
      </nav>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">

        {/* ── Image Gallery ── */}
        <div className="space-y-4">
          {/* Main image */}
          <div className="w-full aspect-square bg-[#FFF5FA] rounded-3xl overflow-hidden border border-[#F0E0EC]">
            {images.length > 0 && images[activeImg] ? (
              <img
                src={images[activeImg]}
                alt={`${product.nombre} — imagen ${activeImg + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#F6BAD6]">
                <Package size={80} aria-hidden="true" />
              </div>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-3 flex-wrap" role="list" aria-label="Imágenes del producto">
              {images.map((img, i) => (
                <button
                  key={i}
                  role="listitem"
                  onClick={() => setActiveImg(i)}
                  aria-label={`Ver imagen ${i + 1}`}
                  aria-pressed={activeImg === i}
                  className="w-20 h-20 rounded-xl overflow-hidden border-2 transition-all flex-shrink-0
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6]"
                  style={{
                    borderColor: activeImg === i ? '#ED87B6' : '#F0E0EC',
                    background: activeImg === i ? '#FFF5FA' : 'white',
                  }}
                >
                  {img ? (
                    <img src={img} alt="" className="w-full h-full object-cover" aria-hidden="true" />
                  ) : (
                    <div className="w-full h-full bg-[#FFF5FA] flex items-center justify-center">
                      <Package size={20} className="text-[#F6BAD6]" aria-hidden="true" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Product Info ── */}
        <div className="space-y-5">

          {/* Marca badge */}
          {product.marca && (
            <span className="inline-block text-xs font-black uppercase tracking-widest text-[#C44A77] bg-[#FFF5FA] border border-[#F6BAD6] px-3 py-1 rounded-full">
              {product.marca}
            </span>
          )}

          {/* Name */}
          <h1 className="text-3xl font-black text-[#1C1C1E] leading-tight">
            {product.nombre}
          </h1>

          {/* Price */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-4xl font-black text-[#1C1C1E]">
              {/* WEB-2B.2: Show variant price if selected, otherwise product price */}
              {(selectedVariant?.precio_venta ?? product.precio_venta) > 0
                ? formatCOP(selectedVariant?.precio_venta ?? product.precio_venta)
                : '—'}
            </span>
            {product.tiene_descuento && product.precio_comparacion > 0 && (
              <span className="text-xl text-[#8A8A8E] line-through">
                {formatCOP(product.precio_comparacion)}
              </span>
            )}
            {product.tiene_descuento && product.descuento_pct > 0 && (
              <span className="bg-[#ED87B6] text-white text-sm font-black px-3 py-1 rounded-full">
                -{product.descuento_pct}%
              </span>
            )}
          </div>

          {/* Modality + Availability */}
          <div className="flex items-center gap-2 flex-wrap">
            <ModalityBadge modalidad={product.modalidad} />
            <AvailabilityBadge
              status={availabilityStatus}
              count={
                availabilityStatus === 'low_stock'
                  ? product.stock_disponible
                  : undefined
              }
            />
          </div>

          {/* Stock note */}
          {isPorPedido ? (
            <p className="text-sm text-[#8A8A8E] leading-relaxed">
              Este producto se adquiere bajo pedido previo.{' '}
              <span className="font-bold text-[#4A4A4A]">
                No requiere stock en bodega.
              </span>
            </p>
          ) : product.stock_disponible > 0 ? (
            <p className="text-sm text-[#8A8A8E]">
              {product.stock_disponible} unidades disponibles{' '}
              <span className="text-xs text-[#8A8A8E]/70">
                * Disponibilidad sujeta a confirmación
              </span>
            </p>
          ) : null}

          {/* Short description */}
          {product.descripcion && (
            <p className="text-[#4A4A4A] leading-relaxed">{product.descripcion}</p>
          )}

          {/* Atributos */}
          {product.atributos && product.atributos.length > 0 && (
            <div className="space-y-4" role="group" aria-label="Opciones del producto">
              {product.atributos.map((attr) => {
                const isArray = Array.isArray(attr.valor);
                return (
                  <div key={attr.nombre}>
                    <p className="text-sm font-bold text-[#1C1C1E] mb-2">
                      {attr.nombre}
                      {isArray && (
                        <span className="ml-1 text-[#8A8A8E] font-normal">
                          {selectedAttrs[attr.nombre]
                            ? `— ${selectedAttrs[attr.nombre]}`
                            : '— Selecciona una opción'}
                        </span>
                      )}
                    </p>

                    {isArray ? (
                      /* Selectable buttons */
                      <div className="flex flex-wrap gap-2" role="group" aria-label={attr.nombre}>
                        {(attr.valor as string[]).map((val) => {
                          const isSelected = selectedAttrs[attr.nombre] === val;
                          return (
                            <button
                              key={val}
                              onClick={() =>
                                setSelectedAttrs((prev) => ({
                                  ...prev,
                                  [attr.nombre]: val,
                                }))
                              }
                              aria-pressed={isSelected}
                              aria-label={`${attr.nombre}: ${val}`}
                              className="px-3 py-1.5 rounded-xl text-sm font-bold border-2 transition-all
                                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6]"
                              style={{
                                borderColor: isSelected ? '#ED87B6' : '#F0E0EC',
                                background: isSelected ? '#FFF5FA' : 'white',
                                color: isSelected ? '#C44A77' : '#4A4A4A',
                              }}
                            >
                              {val}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      /* Static text */
                      <span className="text-sm text-[#4A4A4A] font-medium">
                        {String(attr.valor)}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Validation hint */}
              {!allAttrsSelected && (
                <p className="text-xs text-[#E55B8A] font-medium" role="alert">
                  Selecciona todas las opciones antes de agregar al carrito.
                </p>
              )}
            </div>
          )}

          {/* WEB-2B.2: VariantSelector — real variants from ecommerce_product_variants */}
          {(variantsData?.has_variants || variantLoading || variantError) && (
            <div>
              <h3 className="text-sm font-bold text-[#1C1C1E] mb-3">Variante</h3>
              <VariantSelector
                variants={variantsData?.data ?? []}
                selectedVariantId={selectedVariant?.id ?? null}
                onVariantChange={setSelectedVariant}
                loading={variantLoading}
                error={variantError}
                onRetry={() => {
                  const numId = Number(product.id);
                  if (!Number.isInteger(numId) || numId <= 0) return;
                  setVariantLoading(true);
                  setVariantError(null);
                  getProductVariantes(numId)
                    .then((vr) => { setVariantsData(vr); setVariantLoading(false); })
                    .catch(() => { setVariantLoading(false); setVariantError('No se pudieron cargar las variantes'); });
                }}
              />
              {/* Variant selection required hint */}
              {hasRealVariants && !selectedVariant && !variantLoading && (
                <p className="text-xs text-[#E55B8A] font-medium mt-2" role="alert">
                  Selecciona una variante antes de agregar al carrito.
                </p>
              )}
              {/* Agotado */}
              {hasRealVariants && selectedVariant && !selectedVariant.disponible && (
                <p className="text-xs text-[#E55B8A] font-medium mt-2" role="alert">
                  Esta variante está agotada.
                </p>
              )}
            </div>
          )}

          {/* Consultar message for products without configuration */}
          {isConsultar && (
            <div className="rounded-xl bg-[#FFF5FA] border border-[#F6BAD6] px-4 py-3">
              <p className="text-sm text-[#C44A77] font-medium">
                Este producto requiere confirmación de disponibilidad.{' '}
                <span className="font-bold">Contáctanos para asesorarte.</span>
              </p>
            </div>
          )}

          {/* Quantity selector */}
          <div>
            <label className="block text-sm font-bold text-[#1C1C1E] mb-2" id="qty-label">
              Cantidad
            </label>
            <div className="flex items-center gap-3" aria-labelledby="qty-label">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label="Reducir cantidad"
                className="w-10 h-10 rounded-xl bg-[#FFF5FA] border border-[#F0E0EC] flex items-center justify-center
                  text-[#4A4A4A] hover:bg-[#F6BAD6]/30 hover:text-[#C44A77] transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6]"
              >
                <Minus size={16} aria-hidden="true" />
              </button>

              <span
                className="w-12 text-center font-black text-lg text-[#1C1C1E]"
                aria-live="polite"
                aria-atomic="true"
              >
                {qty}
              </span>

              <button
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                disabled={qty >= maxQty}
                aria-label="Aumentar cantidad"
                className="w-10 h-10 rounded-xl bg-[#FFF5FA] border border-[#F0E0EC] flex items-center justify-center
                  text-[#4A4A4A] hover:bg-[#F6BAD6]/30 hover:text-[#C44A77] transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6]"
              >
                <Plus size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Add to cart */}

          {/* WEB-2B.1: Availability error message */}
          {availabilityError && (
            <p role="alert" className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-center">
              No pudimos confirmar disponibilidad. Intente de nuevo antes de agregar al carrito.
            </p>
          )}
          {isNotPurchasable && (
            <p className="text-sm text-[#8A8A8E] bg-[#FFF5FA] rounded-xl px-4 py-2 text-center">
              Este producto requiere configuración. Contáctanos para más información.
            </p>
          )}

          <button
            onClick={handleAddToCart}
            disabled={isCartDisabled}
            aria-label={
              added
                ? 'Producto agregado al carrito'
                : availabilityLoading
                ? 'Verificando disponibilidad...'
                : availabilityError
                ? 'No pudimos confirmar disponibilidad'
                : isNotPurchasable
                ? 'Este producto no está disponible para compra en línea'
                : isCartDisabled
                ? 'Selecciona las opciones requeridas para agregar al carrito'
                : `Agregar ${product.nombre} al carrito`
            }
            className="w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3
              transition-all shadow-lg
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2
              disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: added ? '#C2D987' : isCartDisabled ? '#D1BADB' : '#ED87B6',
              color: 'white',
              boxShadow: added
                ? '0 8px 24px rgba(194,217,135,0.35)'
                : isCartDisabled
                ? 'none'
                : '0 8px 24px rgba(237,135,182,0.35)',
            }}
          >
            {added ? (
              <>
                <Check size={22} aria-hidden="true" />
                ¡Agregado al Carrito!
              </>
            ) : availabilityLoading ? (
              <>
                <RefreshCw size={22} className="animate-spin" aria-hidden="true" />
                Verificando disponibilidad...
              </>
            ) : (
              <>
                <ShoppingCart size={22} aria-hidden="true" />
                Agregar al Carrito
              </>
            )}
          </button>

          {/* Meta info */}
          <div className="pt-4 border-t border-[#F0E0EC] space-y-2 text-sm">
            {product.sku && (
              <div className="flex gap-2">
                <span className="text-[#8A8A8E] w-24 shrink-0">SKU:</span>
                <span className="font-medium text-[#4A4A4A]">{product.sku}</span>
              </div>
            )}
            {product.categoria && (
              <div className="flex gap-2">
                <span className="text-[#8A8A8E] w-24 shrink-0">Categoría:</span>
                <Link
                  href={`/store/catalogo?categoria=${encodeURIComponent(product.categoria)}`}
                  className="font-medium text-[#ED87B6] hover:text-[#C44A77] hover:underline transition-colors
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ED87B6] rounded"
                >
                  {product.categoria}
                </Link>
              </div>
            )}
            {product.marca && (
              <div className="flex gap-2">
                <span className="text-[#8A8A8E] w-24 shrink-0">Marca:</span>
                <span className="font-medium text-[#4A4A4A]">{product.marca}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Long Description ── */}
      {product.descripcion_larga && (
        <section
          className="bg-white rounded-3xl border border-[#F0E0EC] p-8 shadow-sm"
          aria-labelledby="desc-heading"
        >
          <h2
            id="desc-heading"
            className="text-xl font-black text-[#1C1C1E] mb-4"
          >
            Descripción del Producto
          </h2>
          <div className="text-[#4A4A4A] leading-relaxed whitespace-pre-wrap max-w-prose">
            {product.descripcion_larga}
          </div>
        </section>
      )}
    </div>
  );
}
