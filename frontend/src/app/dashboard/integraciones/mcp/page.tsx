"use client";

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
