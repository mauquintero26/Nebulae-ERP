import os

path = 'src/app/dashboard/inventario/stock/page.tsx'

content = """"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Layers, Search, Filter, Download, AlertCircle, CheckCircle2, Plus, Settings, Box, Warehouse } from 'lucide-react';
import toast from 'react-hot-toast';
import { getProducts } from '@/lib/api';

export default function StockPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const data = await getProducts();
        setProducts(data);
      } catch (error: any) {
        toast.error('Error al cargar inventario: ' + error.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  return (
    <div className="p-8 h-full overflow-y-auto space-y-6 animate-in fade-in duration-500 custom-scrollbar bg-slate-50">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-md shadow-indigo-200">
              <Layers size={24} />
            </div>
            Inventario General
          </h1>
          <p className="text-slate-500 mt-1">Conectado a Producción (Catálogo y SKUs).</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Link href="/dashboard/inventario/catalogo" className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors">
            <Settings size={16} /> Admin Catálogo
          </Link>
          <Link href="/dashboard/inventario/bodegas" className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors">
            <Warehouse size={16} /> Bodegas
          </Link>
          <Link href="/dashboard/inventario/productos" className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold text-sm shadow-md transition-colors">
            <Plus size={16} /> Nuevo Producto
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Buscar SKU, producto..." 
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
          />
        </div>
        <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors">
          <Filter size={16} /> Filtrar
        </button>
      </div>

      {/* Tabla Stock */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                <th className="p-4 pl-6">ID / Referencia</th>
                <th className="p-4">Producto</th>
                <th className="p-4">Precio Base</th>
                <th className="p-4 text-center bg-indigo-50/30 text-indigo-800">Stock (Unidades)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-400">Cargando inventario desde producción...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-400">No hay productos creados aún. Ve a "Nuevo Producto".</td></tr>
              ) : (
                products.map((item: any, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 pl-6">
                      <div className="font-bold text-indigo-600 mb-0.5">PRD-{item.id}</div>
                      <div className="text-xs font-mono font-semibold text-slate-400">{item.internal_ref || 'Sin Ref'}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-slate-800">{item.name}</div>
                      <div className="text-[11px] text-slate-500">{item.description}</div>
                    </td>
                    <td className="p-4 font-bold text-slate-700">
                      ${(item.base_price || 0).toLocaleString()}
                    </td>
                    <td className="p-4 text-center font-black text-indigo-700 bg-indigo-50/30 text-lg">
                      {/* Asumiendo que item.stock u otra data viene en producción. Por defecto 0 si no lo trae. */}
                      {item.total_stock || 0}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
"""

with open('update_stock.py', 'w', encoding='utf-8') as script:
    script.write(f'''
import os
with open("{path}", "w", encoding="utf-8") as f:
    f.write("""{content}""")
''')

print("Created script to update Stock page.")
