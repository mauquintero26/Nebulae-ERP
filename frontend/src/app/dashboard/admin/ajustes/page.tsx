"use client";

import { useState } from 'react';
import { 
  SlidersHorizontal, Search, Settings2, ShieldAlert
} from 'lucide-react';

const MODULES = ['CRM', 'Ventas', 'Compras', 'Inventario', 'Marketing', 'E-Commerce'];

export default function AjustesHub() {
  const [activeModule, setActiveModule] = useState('Ventas');

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden animate-in fade-in">
      
      {/* Warning Banner */}
      <div className="bg-red-50 border-b border-red-200 px-8 py-3 flex items-center gap-3">
        <ShieldAlert className="text-red-600" size={20} />
        <span className="text-red-800 font-bold text-sm">ZONA RESTRINGIDA: CONFIGURACIONES POR DEFECTO DEL NÚCLEO.</span>
      </div>

      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <SlidersHorizontal className="text-pink-600" size={24} /> Ajustes por Módulo
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Configura las variables y comportamientos por defecto de cada bloque.</p>
        </div>
        <button className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-colors">
          Guardar Cambios Globales
        </button>
      </div>

      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* Left Column: Module List */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col z-10 shrink-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-800 uppercase text-xs tracking-wider">Módulos del Sistema</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {MODULES.map(mod => (
              <button 
                key={mod}
                onClick={() => setActiveModule(mod)}
                className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition-colors flex items-center gap-3 ${activeModule === mod ? 'bg-pink-50 text-pink-700 shadow-sm border border-pink-100' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}
              >
                <Settings2 size={18} className={activeModule === mod ? 'text-pink-500' : 'text-slate-400'}/> {mod}
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Dynamic Settings */}
        <div className="flex-1 bg-slate-50 overflow-y-auto custom-scrollbar p-8">
          <div className="max-w-3xl mx-auto">
            
            <h2 className="text-2xl font-black text-slate-800 mb-6">Ajustes: {activeModule}</h2>
            
            {activeModule === 'Ventas' && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-4">Impuestos y Financieros</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Impuesto por Defecto (IVA)</label>
                      <input type="text" defaultValue="19%" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 outline-none focus:border-pink-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Moneda Base</label>
                      <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 outline-none focus:border-pink-500">
                        <option>COP - Peso Colombiano</option>
                        <option>USD - Dólar Estadounidense</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-4">Ciclo de Venta</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Días validez de cotización</label>
                      <input type="number" defaultValue={15} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 outline-none focus:border-pink-500" />
                    </div>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" defaultChecked className="w-4 h-4 text-pink-600 rounded" />
                      <span className="text-sm font-medium text-slate-700">Requerir aprobación gerencial para descuentos &gt; 10%</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeModule !== 'Ventas' && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Settings2 size={48} className="mb-4 opacity-20" />
                <p className="font-bold">Cargando esquema de ajustes de {activeModule}...</p>
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
