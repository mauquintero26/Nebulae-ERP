"use client";

import { useState } from 'react';
import { 
  Package, Search, Filter, Plus, ChevronLeft, Save, 
  Image as ImageIcon, Globe, Tag, Layers, ShoppingCart, 
  DollarSign, Truck, FileText, CheckCircle2, Sparkles, AlertCircle
} from 'lucide-react';

const MOCK_PRODUCTS = [
  { id: 'PRD-001', name: 'Auriculares Inalámbricos Pro', sku: 'AUDIO-01', stock: 145, price: '$450.000', cost: '$200.000', category: 'Electrónica', published: true },
  { id: 'PRD-002', name: 'Teclado Mecánico RGB', sku: 'PER-02', stock: 32, price: '$280.000', cost: '$120.000', category: 'Periféricos', published: true },
  { id: 'PRD-003', name: 'Mouse Ergonómico Vertical', sku: 'PER-03', stock: 0, price: '$150.000', cost: '$60.000', category: 'Periféricos', published: false },
  { id: 'PRD-004', name: 'Monitor 27" 4K', sku: 'MON-01', stock: 12, price: '$1.200.000', cost: '$800.000', category: 'Monitores', published: true },
];

export default function ProductosPage() {
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('Información General');
  
  // Form Checkboxes Header
  const [canSell, setCanSell] = useState(true);
  const [canBuy, setCanBuy] = useState(true);
  const [canExpense, setCanExpense] = useState(false);

  // E-commerce states inside form
  const [isPublished, setIsPublished] = useState(false);

  const isNew = selectedProduct === 'NEW';

  // --- VISTA 1: LISTADO DE PRODUCTOS (Unificado con E-Commerce) ---
  if (!selectedProduct) {
    return (
      <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-5 overflow-y-auto animate-in fade-in custom-scrollbar">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center text-purple-600">
              <Package size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Catálogo de Productos</h1>
              <p className="text-slate-500 text-sm mt-1">Sincronizado en tiempo real con el E-commerce y Módulo de Ventas.</p>
            </div>
          </div>
          
          <button 
            onClick={() => { setSelectedProduct('NEW'); setIsPublished(false); setActiveTab('Información General'); }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2"
          >
            <Plus size={18} /> Nuevo Producto
          </button>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex-1 flex flex-col overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input type="text" placeholder="Buscar producto por nombre, SKU, código..." className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm w-96 outline-none focus:border-purple-600" />
              </div>
              <button className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"><Filter size={18} /></button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Total:</span>
              <span className="font-bold text-slate-800">1,204 productos</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                  <th className="px-6 py-4 font-bold">Producto</th>
                  <th className="px-6 py-4 font-bold">Categoría</th>
                  <th className="px-6 py-4 font-bold">Precio</th>
                  <th className="px-6 py-4 font-bold">Coste</th>
                  <th className="px-6 py-4 font-bold text-center">Stock Físico</th>
                  <th className="px-6 py-4 font-bold text-center">Web E-Commerce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {MOCK_PRODUCTS.map(prod => (
                  <tr key={prod.id} onClick={() => setSelectedProduct(prod)} className="hover:bg-purple-50/50 transition-colors cursor-pointer group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center text-slate-300">
                          <ImageIcon size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 group-hover:text-purple-700 transition-colors">{prod.name}</p>
                          <p className="text-xs text-slate-400">{prod.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">{prod.category}</td>
                    <td className="px-6 py-4 font-black text-slate-800">{prod.price}</td>
                    <td className="px-6 py-4 text-slate-500">{prod.cost}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`font-bold ${prod.stock > 10 ? 'text-emerald-600' : prod.stock > 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {prod.stock}
                      </span>
                    </td>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" defaultChecked={prod.published} />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                        </label>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // --- VISTA 2: FORMULARIO DETALLADO DE PRODUCTO ---
  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col overflow-y-auto animate-in fade-in custom-scrollbar">
      
      {/* Fixed Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-20 shadow-sm flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <div className="flex items-start gap-4 flex-1">
            <button onClick={() => setSelectedProduct(null)} className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-50 shadow-sm flex-shrink-0 mt-1">
              <ChevronLeft size={20} />
            </button>
            <div className="flex-1 max-w-2xl">
              <input 
                type="text" 
                placeholder="Nombre del Producto..." 
                defaultValue={!isNew ? selectedProduct.name : ''}
                className="w-full text-3xl font-black text-slate-900 outline-none placeholder-slate-300 bg-transparent border-b border-transparent focus:border-slate-200 transition-colors pb-1"
              />
              <div className="flex gap-6 mt-3">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={canSell} onChange={(e) => setCanSell(e.target.checked)} className="rounded text-purple-600 focus:ring-purple-500" />
                  <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Puede ser vendido</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={canBuy} onChange={(e) => setCanBuy(e.target.checked)} className="rounded text-purple-600 focus:ring-purple-500" />
                  <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Puede ser comprado</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={canExpense} onChange={(e) => setCanExpense(e.target.checked)} className="rounded text-purple-600 focus:ring-purple-500" />
                  <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Puede ser un gasto</span>
                </label>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-6 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors">
              Descartar
            </button>
            <button className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
              <Save size={18} /> Guardar Producto
            </button>
          </div>
        </div>
      </div>

      {/* Content Canvas */}
      <div className="p-6 max-w-6xl w-full mx-auto flex-1">
        
        {/* Navigation Tabs */}
        <div className="flex overflow-x-auto custom-scrollbar border-b border-slate-200 mb-6 pb-2">
          {[
            { name: 'Información General', icon: FileText },
            { name: 'Atributos y Variantes', icon: Layers },
            { name: 'Ventas y E-Commerce', icon: Globe },
            { name: 'Precios', icon: Tag },
            { name: 'Compra', icon: ShoppingCart },
            { name: 'Inventario', icon: Truck },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button 
                key={tab.name}
                onClick={() => setActiveTab(tab.name)}
                className={`px-4 py-2 font-bold text-sm rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap mr-2 ${activeTab === tab.name ? 'bg-white shadow-sm border border-slate-200 text-purple-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
              >
                <Icon size={16} className={activeTab === tab.name ? 'text-purple-600' : 'text-slate-400'} /> {tab.name}
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 min-h-[500px]">
          
          {/* TAB: INFORMACIÓN GENERAL */}
          {activeTab === 'Información General' && (
            <div className="flex gap-10 items-start">
              
              <div className="flex-1 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Tipo de Producto</label>
                    <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-purple-600 focus:bg-white transition-colors">
                      <option>Bienes (Almacenable)</option>
                      <option>Servicio</option>
                      <option>E-Learning / Digital</option>
                      <option>Combinado (Kit)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Categoría</label>
                    <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-purple-600 focus:bg-white transition-colors">
                      <option>Selecciona una categoría...</option>
                      <option selected={!isNew}>Electrónica</option>
                      <option>Periféricos</option>
                      <option>Monitores</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Precio de Venta</label>
                      <input type="text" defaultValue={!isNew ? selectedProduct.price : ''} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-purple-600" />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Impuestos de Venta</label>
                      <input type="text" defaultValue="IVA 19%" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-purple-600" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Coste (Unitario)</label>
                      <input type="text" defaultValue={!isNew ? selectedProduct.cost : ''} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-purple-600" />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Impuestos de Compra</label>
                      <input type="text" defaultValue="No Aplica" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-purple-600" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Referencia Interna (SKU)</label>
                      <input type="text" defaultValue={!isNew ? selectedProduct.sku : ''} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-purple-600" />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Código de Barras</label>
                      <input type="text" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-purple-600" />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Marca</label>
                      <input type="text" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-purple-600" />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Unidad de Medida (UOM)</label>
                      <select className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-purple-600 bg-white">
                        <option>Unidades (U)</option>
                        <option>Docenas</option>
                        <option>Kilogramos (Kg)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Image Upload Area */}
              <div className="w-72 flex flex-col items-center">
                <div className="w-full aspect-square border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center bg-slate-50 text-slate-400 hover:bg-slate-100 hover:border-purple-300 transition-all cursor-pointer overflow-hidden group">
                  <ImageIcon size={48} className="mb-2 group-hover:text-purple-400 transition-colors" />
                  <span className="font-bold text-sm">Subir Imagen</span>
                  <span className="text-xs font-medium mt-1">1024x1024 recomendado</span>
                </div>
                
                <div className="mt-6 w-full p-4 border border-purple-100 bg-purple-50/50 rounded-2xl flex items-start gap-3">
                  <input type="checkbox" defaultChecked className="mt-1 rounded text-purple-600" />
                  <div>
                    <h4 className="font-bold text-purple-900 text-sm">Rastreo de Inventario</h4>
                    <p className="text-xs text-purple-700/80 mt-1">Activa esta opción para contabilizar stock, recepciones y entregas de este bien material.</p>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB: ATRIBUTOS Y VARIANTES */}
          {activeTab === 'Atributos y Variantes' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-slate-500">Agrega atributos como Talla o Color para crear múltiples variantes (Ej. Camiseta - Roja - Talla M).</p>
                <button className="text-sm font-bold text-purple-600 bg-purple-50 px-4 py-2 rounded-lg border border-purple-100 hover:bg-purple-100 transition-colors">
                  + Añadir Atributo
                </button>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Atributo</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Valores</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-4 py-3">
                        <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold w-full bg-white outline-none">
                          <option>Color</option>
                          <option>Talla</option>
                          <option>Material</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 flex-wrap">
                          <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 border border-slate-200">Rojo <button className="hover:text-red-500">x</button></span>
                          <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 border border-slate-200">Negro <button className="hover:text-red-500">x</button></span>
                          <input type="text" placeholder="Añadir valor..." className="text-xs px-2 py-1 outline-none border-b border-dashed border-slate-300 w-24 focus:border-purple-500 bg-transparent" />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button className="text-slate-400 hover:text-red-500">x</button>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3">
                        <select className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold w-full bg-white outline-none">
                          <option>Talla</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 flex-wrap">
                          <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 border border-slate-200">S <button className="hover:text-red-500">x</button></span>
                          <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 border border-slate-200">M <button className="hover:text-red-500">x</button></span>
                          <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 border border-slate-200">L <button className="hover:text-red-500">x</button></span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button className="text-slate-400 hover:text-red-500">x</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 items-start mt-4">
                <AlertCircle className="text-amber-500 shrink-0" size={18} />
                <p className="text-sm font-medium text-amber-800">Has definido 2 atributos. Esto generará <strong>6 variantes</strong> (2 Colores × 3 Tallas). Deberás configurar códigos de barras y precios individuales si difieren de la base.</p>
              </div>
            </div>
          )}

          {/* TAB: VENTAS Y E-COMMERCE */}
          {activeTab === 'Ventas y E-Commerce' && (
            <div className="grid grid-cols-2 gap-10">
              
              {/* Sección Web */}
              <div className="space-y-6">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Globe size={18} className="text-purple-600"/> Publicación en Tienda Web
                </h3>
                
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-slate-800">Publicado en Sitio Web</h4>
                    <p className="text-xs text-slate-500 mt-1">Sincroniza y muestra este producto en tu E-Commerce.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer scale-110">
                    <input type="checkbox" className="sr-only peer" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                <div className="space-y-4 pt-2">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input type="checkbox" defaultChecked className="mt-1 rounded text-purple-600" />
                    <div>
                      <span className="text-sm font-bold text-slate-800 block">Vender cuando esté agotado (Bajo Pedido)</span>
                      <span className="text-xs text-slate-500 block">Permite comprar aunque el stock físico sea cero.</span>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input type="checkbox" defaultChecked className="mt-1 rounded text-purple-600" />
                    <div>
                      <span className="text-sm font-bold text-slate-800 block">Mostrar cantidad disponible en la web</span>
                      <span className="text-xs text-slate-500 block">Ej. "¡Solo quedan 3 unidades!" para generar urgencia.</span>
                    </div>
                  </label>
                </div>
                
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Mensaje por falta de stock</label>
                  <input type="text" placeholder="Ej: Agotado temporalmente. Déjanos tu correo." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                </div>
              </div>

              {/* Cross-sell / Upsell */}
              <div className="space-y-6">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <ShoppingCart size={18} className="text-indigo-600"/> Cross-Selling & Accesorios
                  </h3>
                  <button className="text-[10px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-1 rounded flex items-center gap-1 hover:bg-indigo-100 transition-colors">
                    <Sparkles size={10} /> Auto-Completar IA
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">Productos Opcionales (Upsell - Checkout)</label>
                  <input type="text" placeholder="Buscar productos para sugerir en el carrito..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">Productos de Accesorio (Página de Producto)</label>
                  <input type="text" placeholder="Buscar estuches, cables, garantías..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">Productos Alternativos</label>
                  <input type="text" placeholder="Buscar productos similares si este no convence..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                </div>
              </div>

            </div>
          )}

          {/* TAB: PRECIOS */}
          {activeTab === 'Precios' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-slate-500">Reglas de lista de precios, descuentos por volumen y promociones.</p>
                <button className="text-sm font-bold text-purple-600 bg-purple-50 px-4 py-2 rounded-lg border border-purple-100 hover:bg-purple-100 transition-colors">
                  + Añadir Regla de Precio
                </button>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Tarifa / Audiencia</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Cantidad Mín.</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Precio Unitario</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Descuento (%)</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Vigencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-4 py-3 font-bold text-slate-700 text-sm">Mayoristas VIP</td>
                      <td className="px-4 py-3 text-sm text-slate-600">10</td>
                      <td className="px-4 py-3 font-bold text-slate-800 text-sm">$380.000</td>
                      <td className="px-4 py-3 text-sm text-emerald-600 font-bold">15%</td>
                      <td className="px-4 py-3 text-xs text-slate-400">Siempre</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-bold text-slate-700 text-sm">Black Friday Web</td>
                      <td className="px-4 py-3 text-sm text-slate-600">1</td>
                      <td className="px-4 py-3 font-bold text-slate-800 text-sm">$400.000</td>
                      <td className="px-4 py-3 text-sm text-emerald-600 font-bold">11%</td>
                      <td className="px-4 py-3 text-xs text-slate-400">20/11/26 - 30/11/26</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: COMPRA */}
          {activeTab === 'Compra' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-slate-500">Gestiona los proveedores que suministran este producto, precios pactados y divisas.</p>
                <button className="text-sm font-bold text-purple-600 bg-purple-50 px-4 py-2 rounded-lg border border-purple-100 hover:bg-purple-100 transition-colors">
                  + Añadir Proveedor
                </button>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden mb-6">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Proveedor</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Plazo Entrega</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Moneda</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Precio Unitario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-4 py-3 font-bold text-slate-700 text-sm flex items-center gap-2"><Truck size={14}/> Shenzhen Tech Ltd.</td>
                      <td className="px-4 py-3 text-sm text-slate-600">15 días</td>
                      <td className="px-4 py-3 text-sm text-slate-600">USD</td>
                      <td className="px-4 py-3 font-bold text-slate-800 text-sm">$45.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Descripción para Pedidos de Compra</label>
                  <textarea rows={4} placeholder="Texto que aparecerá impreso en la Órden de Compra al proveedor..." className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600 resize-none"></textarea>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-2">Facturas de Proveedores (Notas)</label>
                  <textarea rows={4} placeholder="Notas contables para la recepción de facturas..." className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600 resize-none"></textarea>
                </div>
              </div>
            </div>
          )}

          {/* TAB: INVENTARIO */}
          {activeTab === 'Inventario' && (
            <div className="grid grid-cols-2 gap-10">
              
              {/* Logística */}
              <div className="space-y-6">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Truck size={18} className="text-purple-600"/> Operaciones y Rutas
                </h3>
                
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">Rutas (Selecciona las aplicables)</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" defaultChecked className="rounded" /> <span className="text-sm text-slate-700">Comprar</span></label>
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded" /> <span className="text-sm text-slate-700">Bajo Pedido (MTO)</span></label>
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded" /> <span className="text-sm text-slate-700">Fabricar</span></label>
                    <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded" /> <span className="text-sm text-slate-700">Drop-Shipping</span></label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2">Responsable Logístico</label>
                    <input type="text" defaultValue="Juan Pérez" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2">Plazo Entrega a Cliente</label>
                    <input type="text" defaultValue="3 días" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2">Peso (Kg)</label>
                    <input type="text" defaultValue="0.45" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-2">Volumen (m³)</label>
                    <input type="text" defaultValue="0.001" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800" />
                  </div>
                </div>
              </div>

              {/* Descripciones Logísticas */}
              <div className="space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <FileText size={18} className="text-slate-500"/> Notas para Remisiones
                </h3>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Descripción para Recepciones</label>
                  <textarea rows={2} placeholder="Nota al recibir del proveedor..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 resize-none"></textarea>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Descripción para Órdenes de Entrega</label>
                  <textarea rows={2} placeholder="Nota para el empacador o repartidor..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 resize-none"></textarea>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Descripción para Traslados Internos</label>
                  <textarea rows={2} placeholder="Nota al mover entre bodegas..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 resize-none"></textarea>
                </div>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
