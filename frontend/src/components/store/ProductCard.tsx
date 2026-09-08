"use client";

/**
 * ProductCard — Componente unificado de tarjeta de producto
 *
 * Reemplaza las 3 definiciones locales duplicadas en:
 * - store/page.tsx
 * - store/catalogo/page.tsx
 * - store/categoria/[slug]/page.tsx
 *
 * Cumple con WEB-1:
 * - Acción "Agregar al carrito" visible en dispositivos táctiles (no solo hover)
 * - Badges de disponibilidad y modalidad
 * - Contraste WCAG AA
 * - Focus visible para navegación con teclado
 */

import Link from 'next/link';
import { ShoppingCart, Package } from 'lucide-react';
import { AvailabilityBadge, getAvailabilityStatus } from './AvailabilityBadge';
import { ModalityBadge } from './ModalityBadge';
import type { Product } from '@/types/store';

const formatCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(v);

type OnAddToCart = (item: {
  id: string; name: string; price: number;
  qty: number; variant: string; img: string;
}) => void;

type Props = {
  product: Product;
  onAddToCart?: OnAddToCart;
  /** 'grid' (default) or 'list' */
  layout?: 'grid' | 'list';
};

export function ProductCard({ product, onAddToCart, layout = 'grid' }: Props) {
  const img        = product.imagenes?.[0] ?? '';
  const hasDiscount = (product.descuento_pct ?? 0) > 0;
  const availability = getAvailabilityStatus(
    product.stock_disponible,
    product.alerta_stock_minimo ?? 5,
    product.modalidad,
  );
  const canAdd = availability !== 'out_of_stock';

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!canAdd || !onAddToCart) return;
    onAddToCart({
      id:      product.id,
      name:    product.nombre,
      price:   product.precio_venta,
      qty:     1,
      variant: '',
      img,
    });
  };

  if (layout === 'list') {
    return (
      <div className="flex gap-4 bg-white rounded-2xl border border-[#F0E0EC] p-4 hover:shadow-md transition-shadow">
        <Link href={`/store/producto/${product.id}`} className="flex-shrink-0 focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none rounded-xl">
          <div className="w-24 h-24 bg-[#FFF5FA] rounded-xl overflow-hidden">
            {img
              ? <img src={img} alt={product.nombre} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-[#F6BAD6]"><Package size={28} /></div>
            }
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/store/producto/${product.id}`} className="block group focus-visible:outline-none">
            <h3 className="font-bold text-[#1C1C1E] text-sm leading-tight group-hover:text-[#ED87B6] transition-colors line-clamp-2">{product.nombre}</h3>
          </Link>
          <p className="text-xs text-[#8A8A8E] mt-0.5 mb-2">{product.marca}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <AvailabilityBadge status={availability} count={product.stock_disponible} />
            {product.modalidad && <ModalityBadge modalidad={product.modalidad} />}
          </div>
        </div>
        <div className="flex flex-col items-end justify-between flex-shrink-0">
          <div className="text-right">
            <p className="font-black text-[#1C1C1E] text-sm">{formatCOP(product.precio_venta)}</p>
            {product.precio_comparacion && product.precio_comparacion > product.precio_venta && (
              <p className="text-xs text-[#8A8A8E] line-through">{formatCOP(product.precio_comparacion)}</p>
            )}
          </div>
          {onAddToCart && (
            <button
              onClick={handleAdd}
              disabled={!canAdd}
              aria-label={`Agregar ${product.nombre} al carrito`}
              className="p-2 rounded-full bg-[#ED87B6] text-white hover:bg-[#E06FA3] disabled:opacity-40 disabled:cursor-not-allowed transition-all focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <ShoppingCart size={16} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Grid layout (default)
  return (
    <div className="group flex flex-col">
      <Link
        href={`/store/producto/${product.id}`}
        className="block focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:ring-offset-2 focus-visible:outline-none rounded-2xl"
      >
        {/* Image container */}
        <div className="relative w-full aspect-[4/5] bg-[#FFF5FA] rounded-2xl overflow-hidden mb-3">
          {img ? (
            <img
              src={img}
              alt={product.nombre}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#F6BAD6]">
              <Package size={48} aria-hidden="true" />
            </div>
          )}

          {/* Discount badge */}
          {hasDiscount && (
            <span className="absolute top-3 left-3 bg-[#ED87B6] text-white text-xs font-black px-2 py-1 rounded-full shadow-sm">
              -{product.descuento_pct}%
            </span>
          )}

          {/* Add to cart button — ALWAYS visible on mobile, hover on desktop */}
          {onAddToCart && (
            <div
              className={`
                absolute inset-x-0 bottom-0 p-3
                translate-y-0 opacity-100
                sm:translate-y-full sm:opacity-0
                sm:group-hover:translate-y-0 sm:group-hover:opacity-100
                transition-all duration-300
                bg-gradient-to-t from-black/40 to-transparent
              `}
            >
              <button
                onClick={handleAdd}
                disabled={!canAdd}
                aria-label={`Agregar ${product.nombre} al carrito`}
                className="w-full py-2.5 bg-white/95 backdrop-blur-sm text-[#1C1C1E] font-bold rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-[#FFF5FA] disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:ring-2 focus-visible:ring-[#ED87B6] focus-visible:outline-none shadow-sm"
              >
                <ShoppingCart size={15} aria-hidden="true" />
                {availability === 'out_of_stock' ? 'Agotado' : 'Agregar al Carrito'}
              </button>
            </div>
          )}
        </div>
      </Link>

      {/* Info */}
      <Link href={`/store/producto/${product.id}`} className="block focus-visible:outline-none">
        <p className="text-xs text-[#8A8A8E] font-medium uppercase tracking-wide mb-1">{product.marca}</p>
        <h3 className="font-bold text-[#1C1C1E] text-sm leading-tight mb-1.5 group-hover:text-[#ED87B6] transition-colors line-clamp-2">
          {product.nombre}
        </h3>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <p className="font-black text-[#1C1C1E] text-sm">{formatCOP(product.precio_venta)}</p>
          {product.precio_comparacion && product.precio_comparacion > product.precio_venta && (
            <p className="text-xs text-[#8A8A8E] line-through">{formatCOP(product.precio_comparacion)}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <AvailabilityBadge status={availability} count={product.stock_disponible} />
          {product.modalidad && <ModalityBadge modalidad={product.modalidad} />}
        </div>
      </Link>
    </div>
  );
}
