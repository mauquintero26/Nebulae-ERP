import os

os.makedirs('src/app/dashboard/integraciones/apis', exist_ok=True)
os.makedirs('src/app/dashboard/integraciones/mcp', exist_ok=True)

# 1. Hub
hub_path = 'src/app/dashboard/integraciones/page.tsx'
hub_content = """"use client";

import { 
  Puzzle, Webhook, Bot, Activity, CheckCircle2, AlertTriangle, Link as LinkIcon, Lock
} from 'lucide-react';
import Link from 'next/link';

export default function IntegracionesHub() {
  const MODULES = [
    { name: 'APIs & Webhooks', desc: 'Gestiona conexiones con terceros, llaves API y endpoints.', path: '/dashboard/integraciones/apis', icon: Webhook, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { name: 'MCP Agents (IA)', desc: 'Servidores Model Context Protocol y Agentes Autónomos.', path: '/dashboard/integraciones/mcp', icon: Bot, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  ];

  const ACTIVE_INTEGRATIONS = [
    { name: 'WhatsApp Business', type: 'API Oficial', status: 'healthy', icon: '💬' },
    { name: 'Instagram Graph API', type: 'API Meta', status: 'healthy', icon: '📸' },
    { name: 'Facebook Pages', type: 'API Meta', status: 'healthy', icon: '📘' },
    { name: 'Stripe Payments', type: 'Webhook', status: 'warning', icon: '💳' },
  ];

  return (
    <div className="w-full bg-slate-50 flex flex-col px-8 py-8 min-h-max animate-in fade-in custom-scrollbar">
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <div className="bg-slate-800 text-white p-2 rounded-xl shadow-sm"><Puzzle size={24} /></div>
            Centro de Integraciones
          </h1>
          <p className="text-slate-500 mt-2 font-medium max-w-2xl">
            Conecta Nebulae con el mundo exterior. Centraliza y orquesta APIs de terceros, Webhooks y Agentes de Inteligencia Artificial (MCP).
          </p>
        </div>
      </div>

      {/* KPIs Rápidos */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Conexiones Activas</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-slate-800 flex items-center gap-2"><LinkIcon size={24} className="text-blue-500"/> 12</h3>
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Peticiones (Últ. 24h)</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-black text-slate-800">45.2K</h3>
          </div>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 rounded-2xl shadow-sm text-white relative overflow-hidden">
          <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-90">Webhooks Procesados</p>
          <h3 className="text-3xl font-black">99.8%</h3>
          <p className="text-xs font-bold mt-2 opacity-90 text-emerald-100 flex items-center gap-1"><CheckCircle2 size={14}/> Success Rate</p>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Seguridad</p>
          <h3 className="text-xl font-black text-slate-800 mt-2 flex items-center gap-2"><Lock size={18} className="text-emerald-500"/> Encriptado Extremo</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Sub-Módulos */}
        <div className="lg:col-span-2">
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
            Gestión Técnica
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {MODULES.map((mod, idx) => (
              <Link key={idx} href={mod.path} className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer relative overflow-hidden flex flex-col">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 border transition-transform group-hover:scale-110 ${mod.color}`}>
                  <mod.icon size={24} />
                </div>
                <h3 className="text-lg font-black text-slate-800 mb-2 group-hover:text-slate-900">{mod.name}</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed flex-1">{mod.desc}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Ecosistema Actual */}
        <div className="lg:col-span-1">
          <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
            <Activity className="text-slate-400" size={20} /> Ecosistema Activo
          </h2>
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            {ACTIVE_INTEGRATIONS.map((int, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{int.icon}</span>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">{int.name}</h4>
                    <p className="text-xs font-medium text-slate-500">{int.type}</p>
                  </div>
                </div>
                {int.status === 'healthy' ? (
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] flex items-center justify-center relative group cursor-help">
                    <AlertTriangle size={12} className="absolute opacity-0 group-hover:opacity-100 text-amber-600 scale-150 transition-opacity" />
                  </div>
                )}
              </div>
            ))}
            <button className="w-full py-3 mt-2 border-2 border-dashed border-slate-200 text-slate-500 font-bold rounded-xl text-sm hover:border-blue-500 hover:text-blue-600 transition-colors">
              Explorar Directorio de Apps
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
"""
with open(hub_path, 'w', encoding='utf-8') as f:
    f.write(hub_content)


# 2. APIs
apis_path = 'src/app/dashboard/integraciones/apis/page.tsx'
apis_content = """"use client";

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
"""
with open(apis_path, 'w', encoding='utf-8') as f:
    f.write(apis_content)


# 3. MCP
mcp_path = 'src/app/dashboard/integraciones/mcp/page.tsx'
mcp_content = """"use client";

import { useState } from 'react';
import { 
  Bot, Plus, Search, TerminalSquare, Cpu, Server, 
  ArrowLeft, BrainCircuit, Play, Square, Activity
} from 'lucide-react';
import Link from 'next/link';

const MOCK_MCP = [
  { id: 'MCP-01', name: 'Analista de Base de Datos', tools: 12, memory: '1.2 GB', type: 'Local', status: 'running' },
  { id: 'MCP-02', name: 'Agente de Investigación Web', tools: 4, memory: '540 MB', type: 'Cloud', status: 'running' },
  { id: 'MCP-03', name: 'Conciliador Contable AI', tools: 8, memory: '-', type: 'Serverless', status: 'stopped' }
];

export default function McpHub() {
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden animate-in fade-in">
      
      <div className="bg-white px-8 py-6 border-b border-slate-200 shadow-sm shrink-0">
        <Link href="/dashboard/integraciones" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-purple-600 transition-colors mb-3">
          <ArrowLeft size={16} /> Volver al Centro de Integraciones
        </Link>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              <Bot className="text-purple-600" size={28} /> MCP Agents (Model Context Protocol)
            </h1>
            <p className="text-slate-500 mt-1 font-medium">Despliega y administra sub-agentes IA que interactúan de forma autónoma con el ERP.</p>
          </div>
          <button className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-colors flex items-center gap-2">
            <Plus size={18} /> Crear Agente MCP
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Column: Server List */}
        <div className="w-[380px] bg-white border-r border-slate-200 flex flex-col z-10 shrink-0">
          <div className="p-4 border-b border-slate-100 flex items-center">
            <div className="relative flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus-within:border-purple-500 transition-all">
              <Search className="text-slate-400 shrink-0 mr-2" size={16} />
              <input 
                type="text" 
                placeholder="Buscar agente..." 
                className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 outline-none"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {MOCK_MCP.map(mcp => (
              <div key={mcp.id} className="p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                      <BrainCircuit size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">{mcp.name}</h4>
                      <p className="text-[10px] uppercase font-black text-slate-400 mt-0.5 tracking-wider">{mcp.id} • {mcp.type}</p>
                    </div>
                  </div>
                  {mcp.status === 'running' ? (
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                  ) : (
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-300"></span>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <span className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600">
                    <TerminalSquare size={14}/> {mcp.tools} Tools
                  </span>
                  <span className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600">
                    <Cpu size={14}/> {mcp.memory}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Active Terminal / Detail */}
        <div className="flex-1 bg-slate-900 flex flex-col relative">
          <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
          
          <div className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6 z-10 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-slate-300">
              <Server size={18} className="text-purple-400"/>
              <span className="font-mono text-sm font-bold">mcp-db-analyst-v2 (Online)</span>
            </div>
            <div className="flex gap-2">
              <button className="p-1.5 bg-slate-800 hover:bg-red-900/50 text-slate-400 hover:text-red-400 rounded-lg transition-colors" title="Detener Agente">
                <Square size={16} fill="currentColor" />
              </button>
            </div>
          </div>

          <div className="flex-1 p-6 z-10 overflow-y-auto font-mono text-sm">
            <div className="text-slate-500 mb-4">Conectado al servidor MCP interno. Escuchando instrucciones...</div>
            <div className="text-emerald-400 mb-2">» [10:45:22] Agente Inicializado. Capacidades cargadas: 12.</div>
            <div className="text-slate-300 mb-2">» [10:46:01] Tarea recibida: "Cruzar tabla de ventas con inventario crítico"</div>
            <div className="text-purple-400 mb-2">» [10:46:02] Llamando herramienta: get_database_schema(tables=['sales', 'inventory'])</div>
            <div className="text-slate-300 mb-2">» [10:46:05] Análisis completado. Generando reporte de cruce.</div>
            <div className="text-blue-400 mb-2">» [10:46:06] Mensaje enviado al orquestador.</div>
            <div className="text-emerald-400/50 mt-8 flex items-center gap-2">
              <Activity size={16} className="animate-pulse" /> Agente inactivo, en espera...
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
"""
with open(mcp_path, 'w', encoding='utf-8') as f:
    f.write(mcp_content)

print("Integraciones Hub, APIs, and MCP pages created.")
