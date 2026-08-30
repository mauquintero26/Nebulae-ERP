import os

os.makedirs('src/app/dashboard/agenda', exist_ok=True)

content = """"use client";

import { useState } from 'react';
import { 
  Search, Filter, LayoutGrid, List, Plus, 
  ChevronLeft, Calendar, MessageSquare, Settings, 
  Upload, ChevronDown, CheckCircle2, FileText, User
} from 'lucide-react';

const MOCK_CLIENTS = [
  {
    id: 'CLI-001',
    name: 'Carlos Mendoza',
    email: 'carlos.m@empresa.com',
    phone: '+57 300 123 4567',
    type: 'Empleado',
    sector: 'Salud',
    source: 'Repositorio',
    initial: 'C'
  },
  {
    id: 'CLI-002',
    name: 'Laura Jiménez',
    email: 'laura.j@gmail.com',
    phone: '+57 310 987 6543',
    type: 'Pyme',
    sector: 'Prestación de servicios',
    source: 'Ana Gómez',
    initial: 'L'
  },
  {
    id: 'CLI-003',
    name: 'Constructora Alfa',
    email: 'compras@alfa.co',
    phone: '+57 320 456 7890',
    type: 'Enterprise',
    sector: 'Portuario',
    source: 'Juan Pérez',
    initial: 'C'
  }
];

export default function AgendaPage() {
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('Información y Bitácora');
  const [entityType, setEntityType] = useState('Individuo');

  // VIEW 1: LIST
  if (!selectedClient) {
    return (
      <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-8 overflow-y-auto animate-in fade-in">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="text-[#1a3822]">
              <User size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#1a3822]">Agenda de Clientes</h1>
              <p className="text-slate-500 text-sm mt-1">Base de datos de tus prospectos y clientes activos.</p>
            </div>
          </div>
          <button className="bg-[#2a4d33] hover:bg-[#1a3822] text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
            <Plus size={18} /> Nuevo Cliente
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 mb-6 flex justify-between items-center">
          <div className="flex items-center">
            <button className="px-4 py-2 font-bold text-sm border-b-2 border-[#1a3822] text-[#1a3822]">
              Todos mis clientes
            </button>
            <button className="px-4 py-2 font-bold text-sm text-slate-500 flex items-center gap-2">
              Nuevas Asignaciones <span className="bg-rose-100 text-rose-500 px-2 py-0.5 rounded-full text-xs">3</span>
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Buscar..." 
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-64 outline-none focus:border-[#2a4d33]"
              />
            </div>
            <button className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">
              <Filter size={18} />
            </button>
            <div className="flex border border-slate-200 rounded-lg overflow-hidden">
              <button className="p-2 bg-slate-50 text-slate-700 border-r border-slate-200"><List size={18}/></button>
              <button className="p-2 bg-white text-slate-400"><LayoutGrid size={18}/></button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Contacto</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Rubro</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Ingresado Por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_CLIENTS.map((client) => (
                <tr 
                  key={client.id} 
                  onClick={() => setSelectedClient(client)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold">
                        {client.initial}
                      </div>
                      <span className="font-bold text-slate-800">{client.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-slate-800">{client.email}</p>
                    <p className="text-sm text-slate-500">{client.phone}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded-md text-xs border border-blue-100">
                      {client.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                    {client.sector}
                  </td>
                  <td className="px-6 py-4">
                    {client.source === 'Repositorio' ? (
                      <span className="bg-amber-50 text-amber-700 font-bold px-3 py-1 rounded-md text-xs border border-amber-100">
                        {client.source}
                      </span>
                    ) : (
                      <span className="text-sm font-bold text-slate-800">{client.source}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // VIEW 2: DETAIL
  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-8 overflow-y-auto animate-in fade-in custom-scrollbar">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setSelectedClient(null)}
            className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-50 shadow-sm"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xl">
            {selectedClient.initial}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#1a3822]">{selectedClient.name}</h1>
            <p className="text-slate-500 text-sm">
              Ingresado por: <span className="text-amber-600 font-bold">{selectedClient.source}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
            <Calendar size={16} /> Agendar
          </button>
          <button className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
            <MessageSquare size={16} /> Contactar
          </button>
          <button className="bg-[#2a4d33] hover:bg-[#1a3822] text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
            <Plus size={16} /> Nuevo Negocio
          </button>
          <button className="bg-white border border-slate-200 p-2.5 rounded-lg text-slate-500 hover:bg-slate-50 shadow-sm">
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 gap-8">
        {['Información y Bitácora', 'Contactos Adicionales', 'Historial de Compra', 'Historial de Renting', 'Historial de Prospectación'].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 font-bold text-sm border-b-2 transition-colors ${activeTab === tab ? 'border-[#1a3822] text-[#1a3822]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex gap-6 items-start">
        {/* Left Column: Form */}
        <div className="flex-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
            <div className="w-24 h-24 bg-slate-100 rounded-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-300">
              <User size={32} className="mb-1 opacity-50" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Fotografía / Logo</h3>
              <p className="text-xs text-slate-500 mb-3">Sube una imagen para identificar rápidamente al cliente.</p>
              <button className="text-sm font-bold border border-slate-300 px-4 py-1.5 rounded-lg text-slate-700 hover:bg-slate-50">
                Subir imagen
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-6">Información Básica</h3>
            
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">Entidad</label>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button 
                    onClick={() => setEntityType('Individuo')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${entityType === 'Individuo' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Individuo
                  </button>
                  <button 
                    onClick={() => setEntityType('Compañía')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${entityType === 'Compañía' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Compañía
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">Tipo de Cliente</label>
                <div className="relative">
                  <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 appearance-none focus:outline-none focus:border-[#2a4d33]">
                    <option>Empleado</option>
                    <option>Pyme</option>
                    <option>Enterprise</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 mb-2">Nombre Completo / Razón Social</label>
              <input 
                type="text" 
                defaultValue={selectedClient.name}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-[#2a4d33]"
              />
            </div>

            <button className="bg-[#2a4d33] hover:bg-[#1a3822] text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors">
              Guardar Cambios
            </button>
          </div>
        </div>

        {/* Right Column: Bitácora */}
        <div className="w-[450px] bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col min-h-[600px] overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <ActivityIcon /> Bitácora de Actividad
            </h3>
            <button className="bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm transition-colors flex items-center gap-2">
              <FileText size={14} /> Registrar Nota
            </button>
          </div>

          <div className="px-6 py-4 border-b border-slate-100 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Negocios (CRM)</p>
              <p className="font-black text-slate-800"><span className="text-xl">2</span> cerrados</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Renting Activos</p>
              <p className="font-black text-[#2a4d33]"><span className="text-xl">1</span> contrato</p>
            </div>
          </div>

          <div className="flex-1 p-6 relative">
            <div className="absolute left-[31px] top-6 bottom-6 w-0.5 bg-slate-100"></div>
            
            <div className="space-y-8 relative">
              
              {/* Event 1 */}
              <div className="relative pl-10">
                <div className="absolute left-[-5px] top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-sm"></div>
                <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-slate-800 text-sm">Reunión Agendada</h4>
                    <span className="text-xs text-slate-400 font-medium">Hoy, 10:45 AM</span>
                  </div>
                  <p className="text-sm text-slate-600">Se agendó reunión virtual para presentación de flota Renting.</p>
                </div>
              </div>

              {/* Event 2 */}
              <div className="relative pl-10">
                <div className="absolute left-[-5px] top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-sm"></div>
                <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold text-slate-800 text-sm">Cotización Enviada</h4>
                    <span className="text-xs text-slate-400 font-medium">Ayer, 04:30 PM</span>
                  </div>
                  <p className="text-sm text-slate-600 mb-3">Se envió cotización formal #COT-456.</p>
                  <button className="text-xs font-bold text-emerald-600 border border-emerald-200 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 transition-colors">
                    Ver Documento
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function ActivityIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  );
}
"""

with open('src/app/dashboard/agenda/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Agenda page created")
