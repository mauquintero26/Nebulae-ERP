"use client";

import { useState } from 'react';
import { 
  Webhook, Plus, Search, Filter, Key, Code, Globe, 
  ArrowLeft, CheckCircle2, Copy
} from 'lucide-react';
import Link from 'next/link';

const MOCK_APIS = [
  { id: 'INT-001', name: 'WhatsApp Business Cloud', type: 'API Rest', auth: 'Bearer Token', endpoint: 'https://graph.facebook.com/v19.0/...', status: 'Activo' },
  { id: 'INT-002', name: 'Stripe Events', type: 'Webhook', auth: 'Secret Signature', endpoint: '/api/webhooks/stripe', status: 'Activo' },
  { id: 'INT-003', name: 'ERP Legacy Sync', type: 'GraphQL', auth: 'API Key', endpoint: 'https://legacy.empresa.com/graphql', status: 'Pausado' }
];

export default function ApisHub() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden animate-in fade-in">
      
      <div className="bg-white px-8 py-6 border-b border-slate-200 shadow-sm shrink-0">
        <Link href="/dashboard/integraciones" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-blue-600 transition-colors mb-3">
          <ArrowLeft size={16} /> Volver al Centro de Integraciones
        </Link>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Webhook className="text-blue-600" size={28} /> APIs & Webhooks
            </h1>
            <p className="text-slate-500 mt-1 font-medium">Gestiona conexiones REST, GraphQL y escucha de eventos entrantes.</p>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-colors flex items-center gap-2">
            <Plus size={18} /> Nueva Conexión
          </button>
        </div>
      </div>

      <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          
          <div className="flex gap-4">
            <div className="relative flex-1 flex items-center bg-white border border-slate-200 rounded-xl px-4 py-2 focus-within:border-blue-500 transition-all shadow-sm">
              <Search className="text-slate-400 shrink-0 mr-2" size={18} />
              <input 
                type="text" 
                placeholder="Buscar integración..." 
                className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 outline-none"
              />
            </div>
            <button className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 shadow-sm flex items-center gap-2">
              <Filter size={16} /> Filtrar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {MOCK_APIS.map(api => (
              <div key={api.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                      {api.type === 'Webhook' ? <Globe size={20}/> : <Code size={20}/>}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 leading-tight">{api.name}</h3>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">{api.type}</p>
                    </div>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full ${api.status === 'Activo' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                </div>

                <div className="flex flex-col gap-3 flex-1 mt-2">
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Método de Autenticación</p>
                    <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Key size={14} className="text-amber-500"/> {api.auth}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1">Endpoint (URL Base)</p>
                    <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
                      <p className="text-xs font-mono text-slate-600 truncate mr-2">{api.endpoint}</p>
                      <button className="text-slate-400 hover:text-blue-600 transition-colors"><Copy size={14}/></button>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 pt-4 border-t border-slate-100 flex gap-2">
                  <button className="flex-1 py-2 bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                    Configurar
                  </button>
                  <button className="flex-1 py-2 bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                    Ver Logs
                  </button>
                </div>
              </div>
            ))}
            
            {/* Card Nueva Integracion */}
            <button className="border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50/50 transition-all min-h-[250px]">
              <Plus size={32} className="mb-3" />
              <p className="font-bold">Añadir Integración</p>
              <p className="text-xs font-medium text-center mt-1 px-4">Conecta un nuevo servicio REST, GraphQL o Webhook</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
