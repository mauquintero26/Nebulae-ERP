import os

# 1. Marketing Dashboard
dashboard_path = 'src/app/dashboard/marketing/page.tsx'
dashboard_content = """"use client";

import { 
  Megaphone, Network, Sparkles, Target, Users, 
  ArrowUpRight, BarChart3, TrendingUp, MousePointerClick, Eye
} from 'lucide-react';
import Link from 'next/link';

export default function MarketingDashboard() {

  const MODULES = [
    { name: 'Flujos (Redes Sociales)', desc: 'Automatización y flujos de contenido por red (Sin capas modales).', path: '/dashboard/marketing/flujos', icon: Network, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { name: 'Historias & Publicaciones', desc: 'Programación e historial de publicaciones e historias.', path: '/dashboard/marketing/historias', icon: Sparkles, color: 'text-purple-600 bg-purple-50 border-purple-200' },
    { name: 'Campañas', path: '/dashboard/marketing/campanas', desc: 'Definición integral de campañas de mercadeo y sus canales.', icon: Target, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
    { name: 'Visitantes & Leads', path: '/dashboard/marketing/visitantes', desc: 'Analítica de tráfico web, páginas visitadas y etiquetado CRM.', icon: Users, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  ];

  return (
    <div className="w-full bg-slate-50 flex flex-col px-8 py-8 min-h-max animate-in fade-in custom-scrollbar">
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <div className="bg-slate-800 text-white p-2 rounded-xl shadow-sm"><Megaphone size={24} /></div>
            Centro de Marketing & Crecimiento
          </h1>
          <p className="text-slate-500 mt-2 font-medium max-w-2xl">
            Atrae, convierte y fideliza. Controla el contenido de tus redes sociales, el impacto de tus campañas y analiza el tráfico de tus visitantes web.
          </p>
        </div>
      </div>

      {/* KPIs Rápidos */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tráfico Web (Mes)</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-slate-800 flex items-center gap-2"><Eye size={24} className="text-blue-500"/> 24,500</h3>
          </div>
          <p className="text-xs font-bold text-emerald-500 flex items-center mt-2"><TrendingUp size={12} className="mr-1"/> +12.4% vs mes anterior</p>
        </div>
        
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Leads Capturados</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-slate-800">1,240</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Campañas Activas</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-slate-800">5</h3>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-5 rounded-2xl shadow-sm text-white relative overflow-hidden">
          <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-80">Engagement Rate</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black">4.8%</h3>
          </div>
          <p className="text-xs font-medium opacity-80 mt-2 flex items-center gap-1"><MousePointerClick size={14}/> Interacciones globales</p>
        </div>
      </div>

      <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
        <BarChart3 className="text-slate-400" size={20} /> Entornos de Marketing
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 pb-10">
        {MODULES.map((mod, idx) => (
          <Link key={idx} href={mod.path} className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer relative overflow-hidden flex flex-col">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 border transition-transform group-hover:scale-110 ${mod.color}`}>
              <mod.icon size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2 group-hover:text-slate-900">{mod.name}</h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed flex-1">{mod.desc}</p>
            <div className="absolute top-6 right-6 text-slate-300 group-hover:text-slate-800 transition-colors">
              <ArrowUpRight size={20} />
            </div>
          </Link>
        ))}
      </div>

    </div>
  );
}
"""
with open(dashboard_path, 'w', encoding='utf-8') as f:
    f.write(dashboard_content)


# 2. Screens
screens = [
    {
        "id": "flujos",
        "title": "Flujos de Redes Sociales",
        "desc": "Configuración y mapeo de flujos para cada red social (Instagram, TikTok, LinkedIn). Navegación fluida sin popups obstructivos.",
        "icon": "Network",
        "columns": ["Red Social", "Nombre del Flujo", "Gatillo (Trigger)", "Acciones", "Estado", "Conversiones"]
    },
    {
        "id": "historias",
        "title": "Historias y Publicaciones",
        "desc": "Planificador de contenido. Programa, visualiza y audita el historial de publicaciones e historias.",
        "icon": "Sparkles",
        "columns": ["Contenido", "Tipo", "Canal", "Fecha Programada", "Alcance", "Estado"]
    },
    {
        "id": "campanas",
        "title": "Campañas de Mercadeo",
        "desc": "Define objetivos, presupuestos, canales (Email, Ads, Social) y traza el ROI de toda la campaña.",
        "icon": "Target",
        "columns": ["ID Campaña", "Nombre", "Canales", "Presupuesto", "Leads Generados", "Estado"]
    },
    {
        "id": "visitantes",
        "title": "Visitantes & Leads",
        "desc": "Analítica de tráfico. Observa quién visita qué páginas, captura leads y asígnales una etiqueta en el CRM.",
        "icon": "Users",
        "columns": ["Visitante / IP", "Páginas Visitadas", "Sesiones", "Lead CRM Generado", "Etiqueta/Canal", "Última Visita"]
    }
]

template = """\"use client\";

import { useState } from 'react';
import { 
  Search, Filter, LayoutGrid, List, ChevronDown, Plus,
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
            <{icon} className="text-purple-600" size={28} /> {title}
          </h1>
          <p className="text-slate-500 mt-1 font-medium">{desc}</p>
        </div>
        <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-colors">
          <Plus size={18} /> Crear Nuevo
        </button>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white py-3 px-4 border border-slate-200 rounded-t-2xl">
        <div className="flex-1 flex items-center gap-3 w-full">
          <div className="relative flex-1 max-w-2xl flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500 transition-all">
            <Search className="text-slate-400 shrink-0 mr-2" size={18} />
            <input 
              type="text" 
              placeholder="Buscar registros..." 
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
          <button onClick={() => setActiveView('list')} className={`p-1.5 rounded-lg transition-colors ${activeView === 'list' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
            <List size={18} />
          </button>
          <button onClick={() => setActiveView('grid')} className={`p-1.5 rounded-lg transition-colors ${activeView === 'grid' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
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
                    Aún no hay datos. Comienza creando un nuevo registro.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12">
            <LayoutGrid size={48} className="mb-4 opacity-20" />
            <p className="font-bold text-lg text-slate-500">Vista de cuadrícula</p>
          </div>
        )}
      </div>
    </div>
  );
}
"""

base_dir = "src/app/dashboard/marketing"

for s in screens:
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
    file_path = os.path.join(base_dir, s['id'], "page.tsx")
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(file_content)
    print(f"Created {s['id']} module")

print("Marketing module generated.")
