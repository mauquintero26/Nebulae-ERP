import os

os.makedirs('src/app/dashboard/ecommerce', exist_ok=True)

content = """"use client";

import { useState } from 'react';
import { 
  ShoppingCart, TrendingUp, Users, AlertCircle, 
  Package, Search, Filter, Check, Globe, CreditCard,
  Truck, Settings, ArrowUpRight, ArrowDownRight, Tag
} from 'lucide-react';

const MOCK_PRODUCTS = [
  { id: 'PRD-001', name: 'Auriculares Inalámbricos Pro', sku: 'AUDIO-01', stock: 145, price: '$450.000', published: true },
  { id: 'PRD-002', name: 'Teclado Mecánico RGB', sku: 'PER-02', stock: 32, price: '$280.000', published: true },
  { id: 'PRD-003', name: 'Mouse Ergonómico Vertical', sku: 'PER-03', stock: 0, price: '$150.000', published: false },
  { id: 'PRD-004', name: 'Monitor 27" 4K', sku: 'MON-01', stock: 12, price: '$1.200.000', published: true },
];

export default function EcommercePage() {
  const [activeTab, setActiveTab] = useState('Panel de Rendimiento');

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-5 overflow-y-auto animate-in fade-in custom-scrollbar">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center text-purple-600">
            <ShoppingCart size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">E-Commerce Center</h1>
            <p className="text-slate-500 text-sm mt-1">Gestión de ventas web, catálogo digital y configuración de pasarelas.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
            <Globe size={18} /> Ver Tienda Pública
          </button>
          <button className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
            <Settings size={18} /> Configurar Tienda
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 gap-6">
        {['Panel de Rendimiento', 'Catálogo Digital', 'Pagos y Envíos'].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 font-bold text-sm border-b-2 transition-colors ${activeTab === tab ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        
        {/* VIEW 1: Panel de Rendimiento */}
        {activeTab === 'Panel de Rendimiento' && (
          <div className="space-y-6">
            
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><Users size={48} /></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Visitas Hoy</p>
                <h3 className="text-3xl font-black text-slate-800">2,450</h3>
                <p className="text-xs font-bold text-emerald-500 mt-2 flex items-center gap-1"><ArrowUpRight size={14}/> +12% vs ayer</p>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp size={48} /></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tasa de Conversión</p>
                <h3 className="text-3xl font-black text-slate-800">3.8%</h3>
                <p className="text-xs font-bold text-emerald-500 mt-2 flex items-center gap-1"><ArrowUpRight size={14}/> +0.5% vs ayer</p>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10"><ShoppingCart size={48} /></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Ventas del Día</p>
                <h3 className="text-3xl font-black text-slate-800">$4.2M</h3>
                <p className="text-xs font-bold text-emerald-500 mt-2 flex items-center gap-1"><ArrowUpRight size={14}/> 15 pedidos nuevos</p>
              </div>

              <div className="bg-gradient-to-br from-rose-500 to-rose-600 p-5 rounded-2xl shadow-sm text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 text-black"><AlertCircle size={48} /></div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-90">Carritos Abandonados</p>
                <h3 className="text-3xl font-black">24</h3>
                <p className="text-xs font-bold mt-2 opacity-90">$1.8M en fuga potencial</p>
              </div>
            </div>

            {/* Content Split */}
            <div className="flex gap-6 flex-1 min-h-0">
              
              {/* Carritos Abandonados */}
              <div className="w-1/3 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <AlertCircle className="text-rose-500" size={18}/> Recuperación de Carritos
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="border border-slate-100 p-4 rounded-xl hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold text-slate-800 text-sm">usuario{i}@gmail.com</p>
                          <p className="text-[10px] text-slate-400">Hace {i * 2} horas</p>
                        </div>
                        <span className="text-sm font-black text-slate-700">${(i * 120).toFixed(3)}</span>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold py-2 rounded-lg transition-colors border border-rose-100">
                          Enviar Email (10% Dcto)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ultimos Pedidos Web */}
              <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <h3 className="font-bold text-slate-800">Últimos Pedidos Web</h3>
                  <button className="text-xs font-bold text-purple-600 hover:underline">Ver en Ventas CRM</button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wider">
                        <th className="px-6 py-4 font-bold">Orden</th>
                        <th className="px-6 py-4 font-bold">Cliente</th>
                        <th className="px-6 py-4 font-bold">Total</th>
                        <th className="px-6 py-4 font-bold">Estado Logístico</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {[1, 2, 3, 4, 5].map(i => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-800">#WEB-{900 + i}</td>
                          <td className="px-6 py-4 text-slate-600">Comprador Web Anónimo</td>
                          <td className="px-6 py-4 font-bold text-slate-800">${(450 * i).toFixed(3)}</td>
                          <td className="px-6 py-4">
                            <span className="bg-amber-100 text-amber-700 font-bold px-2.5 py-1 rounded-md text-xs border border-amber-200">Por Despachar</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* VIEW 2: Catálogo Digital */}
        {activeTab === 'Catálogo Digital' && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input type="text" placeholder="Buscar en inventario..." className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm w-80 outline-none focus:border-purple-600" />
                </div>
                <button className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"><Filter size={18} /></button>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">Mostrando</span>
                <span className="font-bold text-slate-800">4 de 120</span>
                <span className="text-slate-500">productos</span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-4 font-bold">Producto</th>
                    <th className="px-6 py-4 font-bold">SKU</th>
                    <th className="px-6 py-4 font-bold">Stock</th>
                    <th className="px-6 py-4 font-bold">Precio Web</th>
                    <th className="px-6 py-4 font-bold text-center">Visible en Tienda</th>
                    <th className="px-6 py-4 font-bold text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {MOCK_PRODUCTS.map(prod => (
                    <tr key={prod.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg border border-slate-200"></div>
                        {prod.name}
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium">{prod.sku}</td>
                      <td className="px-6 py-4">
                        <span className={`font-bold ${prod.stock > 10 ? 'text-emerald-600' : prod.stock > 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {prod.stock} unids
                        </span>
                      </td>
                      <td className="px-6 py-4 font-black text-slate-800">{prod.price}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" defaultChecked={prod.published} />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                          </label>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button className="text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-colors border border-purple-100">
                          Editar SEO IA
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW 3: Pagos y Envíos */}
        {activeTab === 'Pagos y Envíos' && (
          <div className="flex gap-6 h-full min-h-0">
            
            {/* Pasarelas de Pago */}
            <div className="w-1/2 flex flex-col gap-6">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 flex-1">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
                  <CreditCard size={18} className="text-purple-600"/> Pasarelas de Pago
                </h3>
                
                <div className="space-y-4">
                  <div className="border border-emerald-200 bg-emerald-50/30 rounded-2xl p-5 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center font-black text-blue-600 border border-slate-100">Stripe</div>
                      <div>
                        <h4 className="font-bold text-slate-800">Stripe Checkout</h4>
                        <p className="text-xs text-slate-500 mt-1">Tarjetas de crédito y Apple Pay.</p>
                      </div>
                    </div>
                    <span className="bg-emerald-100 text-emerald-700 font-bold px-3 py-1 rounded text-xs flex items-center gap-1">
                      <Check size={12}/> Conectado
                    </span>
                  </div>

                  <div className="border border-slate-200 bg-white rounded-2xl p-5 flex justify-between items-center hover:border-purple-300 transition-colors cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center font-black text-sky-600 border border-slate-100 text-xs">Mercado<br/>Pago</div>
                      <div>
                        <h4 className="font-bold text-slate-800">Mercado Pago</h4>
                        <p className="text-xs text-slate-500 mt-1">Efecty, PSE y tarjetas locales.</p>
                      </div>
                    </div>
                    <button className="text-xs font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 px-4 py-2 rounded-lg transition-colors border border-purple-100">
                      Vincular Cuenta
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Reglas de Envío */}
            <div className="w-1/2 flex flex-col gap-6">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 flex-1">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-2">
                  <Truck size={18} className="text-purple-600"/> Reglas de Logística (Entrega Inmediata)
                </h3>
                
                <div className="space-y-4">
                  <div className="border border-slate-200 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-bold text-slate-800">Envío Local (Misma Ciudad)</h4>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-500">Tarifa Plana:</span>
                      <input type="text" defaultValue="$12.000" className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold w-24 text-slate-800" />
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-bold text-slate-800">Envío Nacional</h4>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-500">Tarifa Plana:</span>
                      <input type="text" defaultValue="$25.000" className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold w-24 text-slate-800" />
                    </div>
                  </div>

                  <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 flex gap-3 items-start">
                    <Tag className="text-purple-600 mt-0.5" size={16} />
                    <div>
                      <h4 className="font-bold text-purple-900 text-sm">Regla Automática Activa</h4>
                      <p className="text-xs text-purple-700 mt-1">Cualquier pedido web superior a $200.000 aplicará envío gratuito y entrará directamente a Ventas como "Por Despachar".</p>
                    </div>
                  </div>

                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
"""

with open('src/app/dashboard/ecommerce/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Ecommerce mockup created")
