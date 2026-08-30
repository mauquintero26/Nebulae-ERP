"use client";

import { 
  Archive, PackagePlus, PackageMinus, RefreshCw, 
  Settings2, ShoppingCart, Warehouse, MapPin, Truck,
  ArrowUpRight, AlertTriangle, BarChart3, TrendingUp, Search, Users2
} from 'lucide-react';
import Link from 'next/link';

export default function InventarioDashboard() {

  const MODULES = [
    { name: 'Recepciones', desc: 'Ingreso de mercancía por compras o devoluciones', path: '/dashboard/compras/recepciones', icon: PackagePlus, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { name: 'Entregas', desc: 'Despacho de mercancía hacia clientes (Ventas)', path: '/dashboard/inventario/entregas', icon: PackageMinus, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { name: 'Traslados Internos', path: '/dashboard/inventario/traslados', desc: 'Movimientos entre bodegas y tiendas', icon: RefreshCw, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
    { name: 'Ajustes de Inventario', path: '/dashboard/inventario/ajustes', desc: 'Registro de mermas, daños, faltantes o sobrantes', icon: Settings2, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    { name: 'Abastecimiento', path: '/dashboard/inventario/abastecimiento', desc: 'Lógica de reposición automática y puntos de reorden', icon: ShoppingCart, color: 'text-purple-600 bg-purple-50 border-purple-200' },
    { name: 'Gestión de Almacenes', path: '/dashboard/inventario/almacenes', desc: 'Estructura de bodegas, zonas y permisos', icon: Warehouse, color: 'text-slate-600 bg-slate-50 border-slate-200' },
    { name: 'Ubicaciones', path: '/dashboard/inventario/ubicaciones', desc: 'Mapeo de pasillos, racks y estantes', icon: MapPin, color: 'text-rose-600 bg-rose-50 border-rose-200' },
    { name: 'Rutas', path: '/dashboard/inventario/rutas', desc: 'Gestión de flotas y rutas de distribución', icon: Truck, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
    { name: 'Inventario Compartido', path: '/dashboard/inventario/compartido', desc: 'Gestión de inventario compartido (Próximamente)', icon: Users2, color: 'text-fuchsia-600 bg-fuchsia-50 border-fuchsia-200' },
  ];

  return (
    <div className="w-full bg-slate-50 flex flex-col px-8 py-8 min-h-max animate-in fade-in custom-scrollbar">
      
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <div className="bg-slate-800 text-white p-2 rounded-xl shadow-sm"><Archive size={24} /></div>
            Centro de Control de Inventarios
          </h1>
          <p className="text-slate-500 mt-2 font-medium max-w-2xl">
            Gestión integral de la cadena de suministro. Supervisa el flujo de mercancía, optimiza el almacenamiento y controla el abastecimiento desde una única vista.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar SKU, lote o movimiento..." 
            className="w-80 bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm font-medium focus:border-slate-800 focus:ring-1 focus:ring-slate-800 outline-none shadow-sm transition-all"
          />
        </div>
      </div>

      {/* Alertas Globales de Inventario */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex items-start gap-4 shadow-sm">
          <div className="bg-rose-100 text-rose-600 p-2.5 rounded-full shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-rose-800 font-black mb-1">Stock Crítico (Quiebre de Inventario)</h3>
            <p className="text-rose-700 text-sm mb-3">Existen 12 SKUs que han caído por debajo de su punto de reorden y requieren abastecimiento urgente.</p>
            <Link href="/dashboard/inventario/abastecimiento" className="inline-flex items-center gap-1.5 bg-white text-rose-700 border border-rose-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-rose-100 transition-colors">
              Ejecutar Reposición <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4 shadow-sm">
          <div className="bg-amber-100 text-amber-600 p-2.5 rounded-full shrink-0">
            <RefreshCw size={20} />
          </div>
          <div>
            <h3 className="text-amber-800 font-black mb-1">Ajustes Pendientes por Conciliar</h3>
            <p className="text-amber-700 text-sm mb-3">Se reportaron 3 novedades (daños/faltantes) en la Bodega Norte que requieren autorización contable.</p>
            <Link href="/dashboard/inventario/ajustes" className="inline-flex items-center gap-1.5 bg-white text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors">
              Revisar Ajustes <ArrowUpRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* KPIs Rápidos */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Valor Total Inventario</p>
          <h3 className="text-3xl font-black text-slate-800">$1.2M</h3>
          <p className="text-xs font-bold text-emerald-500 flex items-center mt-2"><TrendingUp size={12} className="mr-1"/> +2.4% vs mes anterior</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Artículos Totales (SKUs)</p>
          <h3 className="text-3xl font-black text-slate-800">4,520</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Rotación Mensual</p>
          <h3 className="text-3xl font-black text-slate-800">8.5%</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Capacidad Ocupada (Bodega 1)</p>
          <h3 className="text-3xl font-black text-slate-800">82%</h3>
          <div className="w-full bg-slate-100 h-1.5 mt-3 rounded-full overflow-hidden"><div className="bg-slate-800 h-full w-[82%]"></div></div>
        </div>
      </div>

      {/* Grid de Módulos */}
      <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
        <BarChart3 className="text-slate-400" size={20} /> Operaciones Logísticas
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 pb-10">
        {MODULES.map((mod, idx) => (
          <Link key={idx} href={mod.path} className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer relative overflow-hidden">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 border transition-transform group-hover:scale-110 ${mod.color}`}>
              <mod.icon size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2 group-hover:text-slate-900">{mod.name}</h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">{mod.desc}</p>
            <div className="absolute top-6 right-6 text-slate-300 group-hover:text-slate-800 transition-colors">
              <ArrowUpRight size={20} />
            </div>
          </Link>
        ))}
      </div>

    </div>
  );
}
