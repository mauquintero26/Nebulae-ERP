"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { use } from 'react';
import { ShoppingCart, Package, ChevronRight, Minus, Plus, Check } from 'lucide-react';
import { useCart } from '../../layout';

const API = 'https://api.nebulaekids.com/api/v1';

const formatCOP = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);

type Atributo = { nombre: string; valores: string[] };
type Product = {
  id: string; nombre: string; descripcion: string; descripcion_larga?: string;
  precio_venta: number; precio_comparacion?: number; descuento_pct?: number;
  imagenes: string[]; stock_disponible: number; categoria: string; marca: string;
  sku: string; atributos?: Atributo[];
};

export default function ProductoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { addToCart } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});
  const [added, setAdded] = useState(false);

  useEffect(() => {
    fetch(API+'/ecommerce/catalogo/'+id)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setProduct(d?.data || d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [id]);

  const handleAddToCart = () => {
    if (!product) return;
    const variant = Object.entries(selectedAttrs).map(([k,v]) => k+': '+v).join(', ');
    addToCart({
      id: product.id,
      name: product.nombre,
      price: product.precio_venta,
      qty,
      variant,
      img: product.imagenes?.[0] || '',
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  if (loading) return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="space-y-4">
          <div className="w-full aspect-square bg-slate-200 rounded-3xl animate-pulse" />
          <div className="flex gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="w-20 h-20 bg-slate-200 rounded-xl animate-pulse" />)}
          </div>
        </div>
        <div className="space-y-4 pt-4">
          <div className="h-8 bg-slate-200 rounded animate-pulse w-3/4" />
          <div className="h-6 bg-slate-200 rounded animate-pulse w-1/2" />
          <div className="h-10 bg-slate-200 rounded animate-pulse w-1/3" />
          <div className="h-32 bg-slate-200 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );

  if (error || !product) return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center text-slate-400">
      <Package size={48} className="mx-auto mb-4 opacity-30" />
      <p className="font-medium text-lg">Producto no encontrado.</p>
      <Link href="/store/catalogo" className="mt-4 inline-block text-emerald-600 font-bold hover:underline">Volver al catalogo</Link>
    </div>
  );

  const hasDiscount = product.descuento_pct && product.descuento_pct > 0;
  const images = product.imagenes?.length > 0 ? product.imagenes : [''];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-8 flex-wrap">
        <Link href="/store" className="hover:text-emerald-600 transition-colors font-medium">Inicio</Link>
        <ChevronRight size={14} />
        <Link href="/store/catalogo" className="hover:text-emerald-600 transition-colors font-medium">Catalogo</Link>
        {product.categoria && (
          <>
            <ChevronRight size={14} />
            <Link href={'/store/categoria/'+encodeURIComponent(product.categoria)} className="hover:text-emerald-600 transition-colors font-medium">{product.categoria}</Link>
          </>
        )}
        <ChevronRight size={14} />
        <span className="text-slate-900 font-bold truncate max-w-xs">{product.nombre}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
        {/* Image Gallery */}
        <div className="space-y-4">
          <div className="w-full aspect-square bg-slate-100 rounded-3xl overflow-hidden">
            {images[activeImg] ? (
              <img src={images[activeImg]} alt={product.nombre} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-300">
                <Package size={80} />
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-3 flex-wrap">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className="w-20 h-20 rounded-xl overflow-hidden border-2 transition-all flex-shrink-0 border-slate-200 hover:border-emerald-400"
                  style={{ borderColor: activeImg === i ? '#10b981' : '' }}
                >
                  {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-100 flex items-center justify-center"><Package size={20} className="text-slate-300" /></div>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="space-y-6">
          {product.marca && (
            <span className="inline-block text-xs font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">{product.marca}</span>
          )}
          <h1 className="text-3xl font-black text-slate-900 leading-tight">{product.nombre}</h1>

          {/* Price */}
          <div className="flex items-center gap-4">
            <span className="text-4xl font-black text-slate-900">{formatCOP(product.precio_venta)}</span>
            {product.precio_comparacion && product.precio_comparacion > product.precio_venta && (
              <span className="text-xl text-slate-400 line-through">{formatCOP(product.precio_comparacion)}</span>
            )}
            {hasDiscount && (
              <span className="bg-rose-500 text-white text-sm font-black px-3 py-1 rounded-full">-{product.descuento_pct}%</span>
            )}
          </div>

          {/* Short description */}
          {product.descripcion && (
            <p className="text-slate-600 leading-relaxed">{product.descripcion}</p>
          )}

          {/* Attributes */}
          {product.atributos && product.atributos.length > 0 && (
            <div className="space-y-4">
              {product.atributos.map((attr) => (
                <div key={attr.nombre}>
                  <label className="block text-sm font-bold text-slate-700 mb-2">{attr.nombre}</label>
                  <div className="flex flex-wrap gap-2">
                    {attr.valores.map((val) => (
                      <button
                        key={val}
                        onClick={() => setSelectedAttrs((prev) => ({ ...prev, [attr.nombre]: val }))}
                        className="px-3 py-1.5 rounded-xl text-sm font-bold border-2 transition-all border-slate-200 text-slate-700 hover:border-emerald-400"
                        style={{ borderColor: selectedAttrs[attr.nombre] === val ? '#10b981' : '', background: selectedAttrs[attr.nombre] === val ? '#ecfdf5' : '', color: selectedAttrs[attr.nombre] === val ? '#065f46' : '' }}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Cantidad</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
              >
                <Minus size={16} />
              </button>
              <span className="w-12 text-center font-black text-lg text-slate-900">{qty}</span>
              <button
                onClick={() => setQty(Math.min(product.stock_disponible || 99, qty + 1))}
                className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
              >
                <Plus size={16} />
              </button>
              {product.stock_disponible > 0 && (
                <span className="text-xs text-slate-500 font-medium">{product.stock_disponible} disponibles</span>
              )}
            </div>
          </div>

          {/* Add to cart */}
          <button
            onClick={handleAddToCart}
            disabled={product.stock_disponible === 0}
            className="w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all shadow-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-slate-900/20"
          >
            {added ? (
              <><Check size={22} className="text-emerald-400" /> Agregado al Carrito</>
            ) : product.stock_disponible === 0 ? (
              'Sin Stock'
            ) : (
              <><ShoppingCart size={22} /> Agregar al Carrito</>
            )}
          </button>

          {/* Meta info */}
          <div className="pt-4 border-t border-slate-100 space-y-2 text-sm">
            {product.sku && <div className="flex gap-2"><span className="text-slate-500 w-24">SKU:</span><span className="font-medium text-slate-800">{product.sku}</span></div>}
            {product.categoria && <div className="flex gap-2"><span className="text-slate-500 w-24">Categoria:</span><Link href={'/store/categoria/'+encodeURIComponent(product.categoria)} className="font-medium text-emerald-600 hover:underline">{product.categoria}</Link></div>}
            {product.marca && <div className="flex gap-2"><span className="text-slate-500 w-24">Marca:</span><span className="font-medium text-slate-800">{product.marca}</span></div>}
          </div>
        </div>
      </div>

      {/* Long Description */}
      {product.descripcion_larga && (
        <div className="bg-white rounded-3xl border border-slate-100 p-8">
          <h2 className="text-xl font-black text-slate-900 mb-4">Descripcion del Producto</h2>
          <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed whitespace-pre-wrap">{product.descripcion_larga}</div>
        </div>
      )}
    </div>
  );
}
