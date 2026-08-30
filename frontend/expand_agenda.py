import re

with open('src/app/dashboard/agenda/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# I will replace the entire file with the expanded functionality since it's a major refactor.
new_page_content = """"use client";

import { useState } from 'react';
import { 
  Search, Filter, LayoutGrid, List, Plus, 
  ChevronLeft, Calendar, MessageSquare, Settings, 
  Upload, ChevronDown, CheckCircle2, FileText, User,
  DollarSign, ShoppingBag, MapPin, Tag, Activity,
  Phone, Mail
} from 'lucide-react';

const MOCK_CLIENTS = [
  {
    id: 'CLI-001', name: 'Carlos Mendoza', email: 'carlos.m@empresa.com', phone: '+57 300 123 4567',
    type: 'Empleado', sector: 'Salud', source: 'Repositorio', initial: 'C',
    document: 'CC 1020304050', address: 'Calle 123 #45-67', city: 'Bogotá', country: 'Cundinamarca, Colombia',
    category: 'VIP', tags: ['Frecuente', 'Envío Rápido']
  },
  {
    id: 'CLI-002', name: 'Laura Jiménez', email: 'laura.j@gmail.com', phone: '+57 310 987 6543',
    type: 'Pyme', sector: 'Prestación de servicios', source: 'Ana Gómez', initial: 'L',
    document: 'NIT 900.123.456-7', address: 'Carrera 15 #80-11', city: 'Medellín', country: 'Antioquia, Colombia',
    category: 'Regular', tags: ['Corporativo']
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
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="text-slate-900"><User size={32} /></div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Agenda de Clientes</h1>
              <p className="text-slate-500 text-sm mt-1">Base de datos de tus prospectos y clientes activos.</p>
            </div>
          </div>
          <button 
            onClick={() => {
              setSelectedClient('NEW');
              setActiveTab('Información y Bitácora');
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2"
          >
            <Plus size={18} /> Nuevo Cliente
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 mb-6 flex justify-between items-center">
          <div className="flex items-center">
            <button className="px-4 py-2 font-bold text-sm border-b-2 border-purple-600 text-purple-700">
              Todos mis clientes
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input type="text" placeholder="Buscar..." className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-64 outline-none focus:border-purple-600" />
            </div>
            <button className="p-2 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"><Filter size={18} /></button>
          </div>
        </div>

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
                <tr key={client.id} onClick={() => setSelectedClient(client)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold">{client.initial}</div>
                      <span className="font-bold text-slate-800">{client.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-slate-800">{client.email}</p>
                    <p className="text-sm text-slate-500">{client.phone}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded-md text-xs border border-blue-100">{client.type}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 font-medium">{client.sector}</td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-slate-800">{client.source}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const isNew = selectedClient === 'NEW';
  const clientData = isNew ? {
    id: 'Nuevo', name: 'Nuevo Cliente', initial: 'N', source: 'Tú',
    email: '', phone: '', document: '', address: '', city: '', country: '', category: '', tags: []
  } : selectedClient;

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-8 overflow-y-auto animate-in fade-in custom-scrollbar">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setSelectedClient(null)} className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-50 shadow-sm">
            <ChevronLeft size={20} />
          </button>
          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-xl">
            {clientData.initial}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{clientData.name}</h1>
            <p className="text-slate-500 text-sm">
              Ingresado por: <span className="text-amber-600 font-bold">{clientData.source}</span>
            </p>
          </div>
        </div>

        {!isNew && (
          <div className="flex items-center gap-3">
            <button className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
              <Calendar size={16} /> Agendar
            </button>
            <button className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
              <MessageSquare size={16} /> Contactar
            </button>
            <button className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-sm transition-colors flex items-center gap-2">
              <Plus size={16} /> Nuevo Negocio
            </button>
            <button className="bg-white border border-slate-200 p-2.5 rounded-lg text-slate-500 hover:bg-slate-50 shadow-sm"><Settings size={18} /></button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 gap-8 overflow-x-auto custom-scrollbar">
        {['Información y Bitácora', 'Contactos Adicionales', 'Historial de Compra'].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 font-bold text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex gap-6 items-start">
        {/* LEFT COLUMN: Dynamic Tab Content */}
        <div className="flex-1 space-y-6">
          
          {activeTab === 'Información y Bitácora' && (
            <>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-6">
                <div className="w-24 h-24 bg-slate-100 rounded-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-300">
                  <User size={32} className="mb-1 opacity-50" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Fotografía / Logo</h3>
                  <p className="text-xs text-slate-500 mb-3">Sube una imagen para identificar rápidamente al cliente.</p>
                  <button className="text-sm font-bold border border-slate-300 px-4 py-1.5 rounded-lg text-slate-700 hover:bg-slate-50">Subir imagen</button>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-6">Información Básica</h3>
                
                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Entidad</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button onClick={() => setEntityType('Individuo')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${entityType === 'Individuo' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Individuo</button>
                      <button onClick={() => setEntityType('Compañía')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${entityType === 'Compañía' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>Compañía</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Nombre Completo / Razón Social</label>
                    <input type="text" defaultValue={clientData.name} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Identificación (CC/NIT/Pasaporte)</label>
                    <input type="text" defaultValue={clientData.document} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Categorización</label>
                    <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-purple-600">
                      <option>Prospecto</option>
                      <option>Cliente Regular</option>
                      <option>VIP</option>
                      <option>Inactivo</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Correo Electrónico</label>
                    <input type="email" defaultValue={clientData.email} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Teléfono / WhatsApp</label>
                    <input type="text" defaultValue={clientData.phone} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-6 mb-6">
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-slate-500 mb-2">Ciudad</label>
                    <input type="text" defaultValue={clientData.city} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-2">Dirección de Facturación / Entrega</label>
                    <input type="text" defaultValue={clientData.address} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-xs font-bold text-slate-500 mb-2">Etiquetas (Tags)</label>
                  <input type="text" placeholder="Ej. Corporativo, Mayorista..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:border-purple-600" />
                </div>

                <button 
                  onClick={() => {
                    if (isNew) {
                      alert('Cliente creado exitosamente');
                      setSelectedClient(null);
                    } else {
                      alert('Cambios guardados');
                    }
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-sm transition-colors"
                >
                  {isNew ? 'Crear Cliente' : 'Guardar Cambios'}
                </button>
              </div>
            </>
          )}

          {activeTab === 'Contactos Adicionales' && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 min-h-[400px]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Contactos Relacionados</h3>
                <button className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 hover:bg-slate-200 transition-colors">
                  <Plus size={14}/> Agregar Contacto
                </button>
              </div>
              {!isNew ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-slate-200 rounded-xl p-4">
                    <h4 className="font-bold text-slate-800">María Camila (Asistente)</h4>
                    <p className="text-sm text-slate-500 mt-1 flex items-center gap-2"><Phone size={14}/> +57 311 222 3344</p>
                    <p className="text-sm text-slate-500 mt-1 flex items-center gap-2"><Mail size={14}/> camila@empresa.com</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-10">Guarda el cliente primero para agregar contactos.</p>
              )}
            </div>
          )}

          {activeTab === 'Historial de Compra' && (
            <div className="space-y-6">
              {/* KPIs Financieros */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 rounded-2xl text-white shadow-md">
                  <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">Total Comprado</p>
                  <h2 className="text-3xl font-black">$4.250.000</h2>
                  <p className="text-sm opacity-90 mt-2">En 4 transacciones</p>
                </div>
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><DollarSign size={14}/> Ganancia / LTV</p>
                  <h2 className="text-2xl font-black text-slate-800">$1.850.000</h2>
                  <p className="text-xs font-bold text-emerald-500 mt-2 flex items-center gap-1">+24% vs año anterior</p>
                </div>
                <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><ShoppingBag size={14}/> Ticket Promedio</p>
                  <h2 className="text-2xl font-black text-slate-800">$1.062.500</h2>
                  <p className="text-xs font-bold text-slate-500 mt-2">Cliente VIP</p>
                </div>
              </div>

              {/* Lista de Compras */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Detalle de Compras</h3>
                </div>
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                      <th className="px-6 py-3 font-bold">Orden / Fecha</th>
                      <th className="px-6 py-3 font-bold">Artículos</th>
                      <th className="px-6 py-3 font-bold">Total</th>
                      <th className="px-6 py-3 font-bold">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    <tr className="hover:bg-slate-50 cursor-pointer">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">#ORD-902</div>
                        <div className="text-slate-500 text-xs">15 Ago 2026</div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">Extractor Eléctrico Doble (x1)</td>
                      <td className="px-6 py-4 font-bold text-slate-800">$850.000</td>
                      <td className="px-6 py-4"><span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded text-xs">Entregado</span></td>
                    </tr>
                    <tr className="hover:bg-slate-50 cursor-pointer">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">#ORD-850</div>
                        <div className="text-slate-500 text-xs">02 Jul 2026</div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">Coche Paseador Premium (x1)</td>
                      <td className="px-6 py-4 font-bold text-slate-800">$3.400.000</td>
                      <td className="px-6 py-4"><span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded text-xs">Entregado</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN: Bitácora de Actividad */}
        <div className="w-[450px] bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col min-h-[600px] overflow-hidden sticky top-0">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Activity className="text-purple-600" size={18}/> Bitácora de Actividad
            </h3>
            <button className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg font-bold text-xs shadow-sm transition-colors flex items-center gap-2">
              <FileText size={14} /> Nota
            </button>
          </div>

          {!isNew ? (
            <>
              {/* Resumen de Estados Activos CRM */}
              <div className="p-6 border-b border-slate-100 bg-white space-y-3">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Trámites Activos (CRM)</h4>
                
                <div className="flex justify-between items-center bg-indigo-50/50 border border-indigo-100 p-3 rounded-xl">
                  <div>
                    <p className="text-xs font-bold text-indigo-900">Cotización #095</p>
                    <p className="text-[10px] text-indigo-600 mt-0.5">Cotizado - pdte confirmación</p>
                  </div>
                  <button className="text-xs font-bold bg-white text-indigo-600 px-2 py-1 rounded border border-indigo-200">Ver</button>
                </div>

                <div className="flex justify-between items-center bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl">
                  <div>
                    <p className="text-xs font-bold text-emerald-900">Pedido #089</p>
                    <p className="text-[10px] text-emerald-600 mt-0.5">Procesando orden</p>
                  </div>
                  <button className="text-xs font-bold bg-white text-emerald-600 px-2 py-1 rounded border border-emerald-200">Ver</button>
                </div>
              </div>

              {/* Trazabilidad Timeline */}
              <div className="flex-1 p-6 relative overflow-y-auto custom-scrollbar bg-slate-50/30">
                <div className="absolute left-[31px] top-6 bottom-6 w-0.5 bg-slate-200"></div>
                
                <div className="space-y-8 relative">
                  
                  {/* Event: Pedido */}
                  <div className="relative pl-10">
                    <div className="absolute left-[-5px] top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-sm ring-4 ring-emerald-100"></div>
                    <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm hover:border-emerald-200 transition-colors cursor-pointer">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-slate-800 text-sm">Pedido de Venta Creado</h4>
                        <span className="text-xs text-slate-400 font-medium">Hace 2 horas</span>
                      </div>
                      <p className="text-xs text-slate-600">El pago fue validado y la orden pasó a logística.</p>
                    </div>
                  </div>

                  {/* Event: Pago */}
                  <div className="relative pl-10">
                    <div className="absolute left-[-5px] top-1 w-3 h-3 rounded-full bg-amber-500 border-2 border-white shadow-sm"></div>
                    <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-slate-800 text-sm">Pago Recibido</h4>
                        <span className="text-xs text-slate-400 font-medium">Ayer, 11:30 AM</span>
                      </div>
                      <p className="text-xs text-slate-600 mb-3">Transferencia verificada por finanzas.</p>
                    </div>
                  </div>

                  {/* Event: Cotización */}
                  <div className="relative pl-10 opacity-75">
                    <div className="absolute left-[-5px] top-1 w-3 h-3 rounded-full bg-indigo-500 border-2 border-white shadow-sm"></div>
                    <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-slate-800 text-sm">Cotización Enviada</h4>
                        <span className="text-xs text-slate-400 font-medium">Hace 3 días</span>
                      </div>
                      <p className="text-xs text-slate-600 mb-3">Cotización #095 por WhatsApp.</p>
                      <button className="text-[10px] font-bold text-indigo-600 border border-indigo-200 px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 transition-colors">
                        Ver Documento
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
              <Activity className="text-slate-300 mb-3" size={48} />
              <p className="text-slate-500 font-medium text-sm">Guarda la información básica del cliente para habilitar la bitácora de CRM y trazabilidad.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
"""

with open('src/app/dashboard/agenda/page.tsx', 'w', encoding='utf-8') as f:
    f.write(new_page_content)
print("Agenda page heavily expanded")
