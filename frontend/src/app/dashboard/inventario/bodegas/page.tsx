"use client";

import { Warehouse, Plus, Search, Filter, MapPin, Box, ArrowRight } from 'lucide-react';

const BODEGAS_MOCK = [
  { id: 'BOD-01', nombre: 'Bodega Central', tipo: 'Principal', ubicacion: 'Calle 123 #45-67, Zona Industrial', capacidad: '85%', estado: 'Activa' },
  { id: 'BOD-02', nombre: 'Bodega Norte (Satélite)', tipo: 'Secundaria', ubicacion: 'Av. Norte #89-01, Centro', capacidad: '42%', estado: 'Activa' },
  { id: 'BOD-03', nombre: 'Punto de Venta 1', tipo: 'Tienda', ubicacion: 'C.C. Plaza, Local 101', capacidad: '95%', estado: 'Activa' },
  { id: 'BOD-04', nombre: 'Bodega Mantenimiento', tipo: 'Cuarentena', ubicacion: 'Calle 123 #45-67, Interior 2', capacidad: '10%', estado: 'Inactiva' },
];

export default function BodegasPage() {
  return (
    <div className="p-8 h-full overflow-y-auto space-y-6 animate-in fade-in duration-500 custom-scrollbar bg-slate-50">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-md shadow-indigo-200">
              <Warehouse size={24} />
            </div>
            Bodegas y Ubicaciones
          </h1>
          <p className="text-slate-500 mt-1">Gestión de almacenes centrales, sucursales y puntos de venta.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar bodega..." 
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64 shadow-sm"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold text-sm shadow-md shadow-indigo-200 transition-colors">
            <Plus size={16} /> Nueva Bodega
          </button>
        </div>
      </div>

      {/* Grid de Bodegas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        {BODEGAS_MOCK.map((bodega) => (
          <div key={bodega.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-10 transition-transform group-hover:scale-150 ${bodega.estado === 'Activa' ? 'bg-indigo-500' : 'bg-slate-400'}`} />
            
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-xs font-bold text-slate-400 mb-1 block">{bodega.id}</span>
                <h3 className="text-lg font-extrabold text-slate-800">{bodega.nombre}</h3>
              </div>
              <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${bodega.estado === 'Activa' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {bodega.estado}
              </span>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex items-center text-sm text-slate-600 font-medium">
                <Box size={16} className="mr-2 text-indigo-400" />
                Tipo: <span className="ml-1 text-slate-800 font-semibold">{bodega.tipo}</span>
              </div>
              <div className="flex items-start text-sm text-slate-600 font-medium">
                <MapPin size={16} className="mr-2 text-indigo-400 flex-shrink-0 mt-0.5" />
                <span>{bodega.ubicacion}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-500 mb-1">Capacidad Usada</div>
                <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${parseInt(bodega.capacidad) > 90 ? 'bg-red-500' : parseInt(bodega.capacidad) > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                    style={{ width: bodega.capacidad }}
                  />
                </div>
              </div>
              <button className="flex items-center text-indigo-600 font-bold text-sm hover:text-indigo-800 transition-colors">
                Ver Stock <ArrowRight size={16} className="ml-1" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
