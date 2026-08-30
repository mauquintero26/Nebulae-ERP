import os

screens = [
    {
        "id": "entregas",
        "title": "Entregas (Despachos)",
        "desc": "Gestión de salidas de almacén para cumplir con pedidos de venta.",
        "icon": "PackageMinus",
        "columns": ["ID Entrega", "Pedido Venta (PVEN)", "Cliente", "Fecha Despacho", "Estado"]
    },
    {
        "id": "traslados",
        "title": "Traslados Internos",
        "desc": "Movimientos de mercancía entre bodegas, sucursales y ubicaciones.",
        "icon": "RefreshCw",
        "columns": ["ID Traslado", "Origen", "Destino", "Fecha", "Estado"]
    },
    {
        "id": "ajustes",
        "title": "Ajustes de Inventario",
        "desc": "Regularización de stock por mermas, daños, faltantes o sobrantes.",
        "icon": "Settings2",
        "columns": ["ID Ajuste", "Motivo", "Bodega", "Costo Afectado", "Aprobación"]
    },
    {
        "id": "abastecimiento",
        "title": "Abastecimiento",
        "desc": "Sugerencias de compra y reposición basadas en puntos de reorden y alertas.",
        "icon": "ShoppingCart",
        "columns": ["SKU", "Producto", "Stock Actual", "Punto Reorden", "Sugerencia Compra"]
    },
    {
        "id": "almacenes",
        "title": "Gestión de Almacenes",
        "desc": "Administración de bodegas principales y centros de distribución.",
        "icon": "Warehouse",
        "columns": ["ID Bodega", "Nombre", "Ubicación Geográfica", "Capacidad", "Responsable"]
    },
    {
        "id": "ubicaciones",
        "title": "Ubicaciones Físicas",
        "desc": "Mapeo detallado de zonas, pasillos, racks y estantes dentro de bodegas.",
        "icon": "MapPin",
        "columns": ["Código", "Bodega", "Zona", "Rack/Estante", "Estado de Ocupación"]
    },
    {
        "id": "rutas",
        "title": "Rutas de Distribución",
        "desc": "Asignación de vehículos y planificación logística de entregas.",
        "icon": "Truck",
        "columns": ["ID Ruta", "Vehículo/Chofer", "Destinos", "Hora Salida", "Estado"]
    },
    {
        "id": "compartido",
        "title": "Inventario Compartido",
        "desc": "Gestión colaborativa de stock. Esperando especificaciones...",
        "icon": "Users2",
        "columns": ["ID Recurso", "Entidad", "Stock Compartido", "Condiciones", "Estado"]
    }
]

template = """\"use client\";

import { useState } from 'react';
import { 
  Search, Filter, LayoutGrid, List, ChevronDown,
  {icon}
} from 'lucide-react';
import { ResizableHeader } from '@/components/ResizableHeader';

export default function {CamelName}Hub() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState('list');

  return (
    <div className="w-full bg-slate-50 flex flex-col px-8 py-6 min-h-max animate-in fade-in">
      
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <{icon} className="text-emerald-600" size={28} /> {title}
          </h1>
          <p className="text-slate-500 mt-1 font-medium">{desc}</p>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white py-3 px-4 border border-slate-200 rounded-t-2xl">
        <div className="flex-1 flex items-center gap-3 w-full">
          <div className="relative flex-1 max-w-2xl flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all">
            <Search className="text-slate-400 shrink-0 mr-2" size={18} />
            <input 
              type="text" 
              placeholder="Buscar..." 
              className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm shrink-0">
            <Filter size={16} /> Filtros <ChevronDown size={14}/>
          </button>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl shrink-0 border border-slate-200">
          <button onClick={() => setActiveView('list')} className={`p-1.5 rounded-lg transition-colors ${activeView === 'list' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <List size={18} />
          </button>
          <button onClick={() => setActiveView('grid')} className={`p-1.5 rounded-lg transition-colors ${activeView === 'grid' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <LayoutGrid size={18} />
          </button>
        </div>
      </div>

      {/* Tabla Dinámica */}
      <div className="bg-white flex flex-col border border-t-0 border-slate-200 rounded-b-2xl overflow-hidden shadow-sm">
        {activeView === 'list' ? (
          <div className="w-full">
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                  {headers}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                <tr className="hover:bg-slate-50">
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400 font-bold">
                    No hay datos registrados aún.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12">
            <LayoutGrid size={48} className="mb-4 opacity-20" />
            <p className="font-bold text-lg text-slate-500">Vista de cuadrícula en construcción</p>
          </div>
        )}
      </div>
    </div>
  );
}
"""

base_dir = "src/app/dashboard/inventario"

for s in screens:
    # Create directory
    dir_path = os.path.join(base_dir, s['id'])
    os.makedirs(dir_path, exist_ok=True)
    
    # Generate headers
    headers = "\n                  ".join([f"<ResizableHeader>{col}</ResizableHeader>" for col in s['columns']])
    
    # Format template
    camel_name = "".join([word.capitalize() for word in s['id'].split('_')])
    file_content = template.replace("{CamelName}", camel_name)
    file_content = file_content.replace("{icon}", s['icon'])
    file_content = file_content.replace("{title}", s['title'])
    file_content = file_content.replace("{desc}", s['desc'])
    file_content = file_content.replace("{headers}", headers)
    
    # Save file
    file_path = os.path.join(dir_path, "page.tsx")
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(file_content)
    print(f"Created {s['id']} module")

print("All inventory modules created successfully.")
