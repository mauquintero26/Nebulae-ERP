import os

path = 'src/app/dashboard/scrapper/page.tsx'

content = """"use client";

import { useState } from 'react';
import { 
  Globe, Search, Play, Pause, Settings, RefreshCw, 
  ExternalLink, Tag, TrendingDown, Percent, Box, Plus, Image as ImageIcon
} from 'lucide-react';

const TARGET_STORES = [
  { id: 1, name: 'Amazon B2B', url: 'https://amazon.com/...', status: 'Active', lastSync: 'Hace 10 min', itemsFound: 124 },
  { id: 2, name: 'Distribuidor Mayorista', url: 'https://mayorista.com/...', status: 'Paused', lastSync: 'Hace 2 d\u00edas', itemsFound: 45 },
  { id: 3, name: 'Competencia Directa', url: 'https://competidor.com/...', status: 'Active', lastSync: 'Hace 1 hora', itemsFound: 89 },
];

const SCRAPED_PROMOS = [
  { id: 'P001', product: 'Monitor Dell 27"', image: 'https://images.unsplash.com/photo-1527443224154-c4a3942d4aff?auto=format&fit=crop&w=150&q=80', store: 'Amazon B2B', originalPrice: 250, promoPrice: 190, discount: 24, matchSku: 'MON-DELL-27' },
  { id: 'P002', product: 'Silla Ergonomica Herman Miller', image: 'https://images.unsplash.com/photo-1592078615290-033ee584e267?auto=format&fit=crop&w=150&q=80', store: 'Distribuidor Mayorista', originalPrice: 1200, promoPrice: 850, discount: 29, matchSku: 'S-HM-01' },
  { id: 'P003', product: 'Teclado Mecanico Keychron', image: 'https://images.unsplash.com/photo-1595225476474-87563907a212?auto=format&fit=crop&w=150&q=80', store: 'Competencia Directa', originalPrice: 100, promoPrice: 85, discount: 15, matchSku: 'TEC-K-M' },
  { id: 'P004', product: 'Webcam Logitech Brio', image: 'https://images.unsplash.com/photo-1621077759885-c1955fb6f1c7?auto=format&fit=crop&w=150&q=80', store: 'Amazon B2B', originalPrice: 180, promoPrice: 120, discount: 33, matchSku: 'CAM-LOG-B' },
];

export default function ScrapperHub() {
  const [activeTab, setActiveTab] = useState('Resultados');

  return (
    <div className="w-full bg-slate-50 min-h-max pb-12 animate-in fade-in custom-scrollbar">
      
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6 sticky top-0 z-30 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <div className="bg-blue-100 text-blue-600 p-2 rounded-xl shadow-inner"><Globe size={24} /></div>
            Scrapper de Promociones
          </h1>
          <p className="text-slate-500 mt-2 font-medium">Motor de extracci\u00f3n aut\u00f3noma para monitoreo de precios, im\u00e1genes y ofertas de competidores y distribuidores.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="bg-white border border-slate-300 text-slate-700 px-4 py-2.5 rounded-xl font-bold shadow-sm transition-colors hover:bg-slate-50 flex items-center gap-2">
            <Settings size={16} /> Reglas
          </button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md transition-colors flex items-center gap-2">
            <Play size={16} fill="currentColor" /> Ejecutar Todos
          </button>
        </div>
      </div>

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">
        
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-3 group-hover:scale-110 transition-transform">
              <RefreshCw size={20} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Fuentes Activas</p>
            <h2 className="text-2xl font-black text-slate-800">12 URLs</h2>
            <p className="text-[11px] font-bold text-emerald-500 mt-1 flex items-center gap-1">Monitoreo cada hora</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 mb-3 group-hover:scale-110 transition-transform">
              <Tag size={20} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Promos Detectadas Hoy</p>
            <h2 className="text-2xl font-black text-slate-800">45</h2>
            <p className="text-[11px] font-bold text-slate-500 mt-1 flex items-center gap-1">Precios por debajo de mercado</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-3 group-hover:scale-110 transition-transform">
              <TrendingDown size={20} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Descuento Promedio</p>
            <h2 className="text-2xl font-black text-slate-800">22%</h2>
            <p className="text-[11px] font-bold text-amber-600 mt-1 flex items-center gap-1">Oportunidad de compra mayorista</p>
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden group">
            <div className="absolute right-0 top-0 opacity-20"><Percent size={80} /></div>
            <p className="text-xs font-black text-blue-200 uppercase tracking-wider mb-1 relative z-10">Match con nuestro Stock</p>
            <h2 className="text-3xl font-black text-white relative z-10">14 SKUs</h2>
            <p className="text-[11px] font-bold text-emerald-300 mt-1 flex items-center gap-1 relative z-10">Recomendado actualizar precio de venta</p>
          </div>
        </div>

        {/* Workspace */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex gap-4">
            <button 
              onClick={() => setActiveTab('Resultados')}
              className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'Resultados' ? 'bg-white shadow-sm border border-slate-200 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Resultados del Scraping
            </button>
            <button 
              onClick={() => setActiveTab('Fuentes')}
              className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'Fuentes' ? 'bg-white shadow-sm border border-slate-200 text-blue-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Fuentes y Tiendas (URLs)
            </button>
          </div>

          {activeTab === 'Resultados' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4 w-16 text-center">Imagen</th>
                    <th className="px-6 py-4">Producto Scrapeado</th>
                    <th className="px-6 py-4">Tienda / Fuente</th>
                    <th className="px-6 py-4">Precio Orig.</th>
                    <th className="px-6 py-4">Precio Promo</th>
                    <th className="px-6 py-4">Descuento</th>
                    <th className="px-6 py-4">Match (SKU Interno)</th>
                    <th className="px-6 py-4 text-center">Acci\u00f3n</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {SCRAPED_PROMOS.map(promo => (
                    <tr key={promo.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3">
                        <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 flex shrink-0 items-center justify-center">
                          {promo.image ? (
                            <img src={promo.image} alt={promo.product} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon size={16} className="text-slate-400" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-800">{promo.product}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold">
                          <Globe size={10}/> {promo.store}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-400 line-through">${promo.originalPrice}</td>
                      <td className="px-6 py-4 font-black text-emerald-600">${promo.promoPrice}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-black ${promo.discount >= 30 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          -{promo.discount}%
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md w-max">
                          <Box size={12}/> {promo.matchSku}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button className="bg-slate-800 text-white hover:bg-slate-700 px-3 py-1.5 rounded text-xs font-bold transition-colors">
                            Distribuir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'Fuentes' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-black text-slate-800">URLs y Reglas de Extracci\u00f3n</h3>
                <button className="bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2">
                  <Plus size={14}/> A\u00f1adir Nueva Tienda
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {TARGET_STORES.map(store => (
                  <div key={store.id} className="border border-slate-200 rounded-xl p-4 flex flex-col">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-bold text-slate-800 flex items-center gap-2">
                          {store.name} 
                          <a href="#" className="text-blue-500 hover:text-blue-700"><ExternalLink size={12}/></a>
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">{store.url}</p>
                      </div>
                      <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${store.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {store.status === 'Active' ? 'Activo' : 'Pausado'}
                      </span>
                    </div>
                    <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center">
                      <div className="text-xs font-medium text-slate-500">
                        <span className="font-bold text-slate-700">{store.itemsFound}</span> productos en radar
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                        <Clock size={10}/> \u00dalt. Sync: {store.lastSync}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
"""

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Scrapper page updated with images.")
