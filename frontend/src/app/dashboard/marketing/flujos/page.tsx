"use client";

import { useState } from 'react';
import Link from 'next/link';
import { 
  Network, Save, MessageCircle, Mail, MousePointer2, Plus, 
  ArrowRight, Trash2, Camera, Monitor, Zap
, ArrowLeft } from 'lucide-react';

export default function FlujosHub() {
  const [selectedNetwork, setSelectedNetwork] = useState('instagram');
  const [flujoName, setFlujoName] = useState('Auto-Respuesta Reel Producto');
  
  const [nodes, setNodes] = useState([
    { id: 1, type: 'trigger', text: 'Usuario comenta la palabra "INFO"', icon: MessageCircle, color: 'text-purple-600 bg-purple-50' },
    { id: 2, type: 'action', text: 'Enviar Mensaje Directo (DM) con link', icon: MousePointer2, color: 'text-blue-600 bg-blue-50' },
    { id: 3, type: 'action', text: 'Etiquetar en CRM como "Lead Caliente"', icon: Save, color: 'text-emerald-600 bg-emerald-50' }
  ]);

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden animate-in fade-in">
      
      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div>
        <Link href="/dashboard/marketing" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors mb-2">
          <ArrowLeft size={16} /> Volver al Hub de Marketing
        </Link>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Network className="text-blue-600" size={24} /> Flujos de Automatización
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Diseña reglas para redes sociales sin ventanas emergentes.</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-colors flex items-center gap-2">
          <Save size={18} /> Guardar Flujo
        </button>
      </div>

      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* Left Column: Selector de Redes (No Modals) */}
        <div className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-[5px_0_15px_-10px_rgba(0,0,0,0.05)] z-10 shrink-0">
          <div className="p-5 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 uppercase text-xs tracking-wider">Canal del Flujo</h3>
          </div>
          <div className="p-4 flex flex-col gap-2">
            <button 
              onClick={() => setSelectedNetwork('instagram')}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all font-bold text-sm ${selectedNetwork === 'instagram' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <Camera size={18} /> Instagram
            </button>
            <button 
              onClick={() => setSelectedNetwork('linkedin')}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all font-bold text-sm ${selectedNetwork === 'linkedin' ? 'bg-blue-700 text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <Monitor size={18} /> LinkedIn
            </button>
            <button 
              onClick={() => setSelectedNetwork('email')}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all font-bold text-sm ${selectedNetwork === 'email' ? 'bg-amber-500 text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
            >
              <Mail size={18} /> Email Marketing
            </button>
          </div>

          <div className="p-5 border-t border-slate-100 mt-auto">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h4 className="font-bold text-blue-800 text-xs uppercase mb-1">Métricas de este flujo</h4>
              <p className="text-2xl font-black text-blue-600">1,240 <span className="text-sm text-blue-500 font-medium">ejecuciones</span></p>
            </div>
          </div>
        </div>

        {/* Right Column: Canvas/Constructor Inline */}
        <div className="flex-1 bg-slate-50/50 p-8 overflow-y-auto custom-scrollbar relative">
          
          {/* Background Grid Pattern */}
          <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, black 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

          <div className="max-w-3xl mx-auto relative z-10">
            <input 
              type="text" 
              value={flujoName}
              onChange={(e) => setFlujoName(e.target.value)}
              className="text-3xl font-black text-slate-800 bg-transparent border-none focus:ring-0 outline-none w-full mb-8"
            />

            <div className="flex flex-col gap-4">
              {nodes.map((node, idx) => (
                <div key={node.id} className="flex flex-col items-center">
                  <div className="w-full bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${node.color}`}>
                        <node.icon size={24} />
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                          {node.type === 'trigger' ? 'Gatillo / Disparador' : 'Acción Automática'}
                        </span>
                        <p className="font-bold text-slate-800">{node.text}</p>
                      </div>
                    </div>
                    <button className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 size={18} />
                    </button>
                  </div>

                  {idx < nodes.length - 1 && (
                    <div className="h-8 w-px bg-slate-300 my-2 relative">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-400">
                        <ArrowRight size={12} className="rotate-90" />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div className="mt-6 flex justify-center">
                <button className="flex items-center gap-2 bg-white border-2 border-dashed border-slate-300 hover:border-blue-500 hover:text-blue-600 text-slate-500 px-6 py-3 rounded-xl font-bold transition-colors">
                  <Plus size={18} /> Añadir Nodo de Acción
                </button>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
