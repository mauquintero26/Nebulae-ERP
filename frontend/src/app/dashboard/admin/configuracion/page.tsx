"use client";

import { useState, type KeyboardEvent } from 'react';
import {
  Settings, Building2, Paintbrush, Globe2, TerminalSquare,
  Barcode, ShieldAlert, KeyRound
} from 'lucide-react';
import { SubNav, PageHeader } from '@/components/ui';
import { pestanaConTecla } from '@/lib/pestanas';
import { ADM_NAV } from '../adm-nav';
import { FormEmpresa } from './empresa-form';
import { FormDocumentos } from './documentos-form';

const TABS = [
  { id: 'empresa', label: 'Información de la empresa', icon: Building2 },
  { id: 'diseno', label: 'Diseño de documentos', icon: Paintbrush },
  { id: 'localizacion', label: 'Localización & Unidades', icon: Globe2 },
  { id: 'api', label: 'Nuestra API & OAuth', icon: TerminalSquare },
  { id: 'seguridad', label: 'Seguridad & SSO', icon: KeyRound },
  { id: 'barcode', label: 'BBDD Códigos de Barras', icon: Barcode },
];

export default function ConfiguracionHub() {
  const [activeTab, setActiveTab] = useState('empresa');
  // Revisión final B3 (F2, M15): las flechas, Inicio y Fin cambian de pestaña y le pasan el foco (lib/pestanas.js).
  function alTeclear(e: KeyboardEvent<HTMLButtonElement>) {
    const siguiente = pestanaConTecla(TABS.map(t => t.id), activeTab, e.key);
    if (!siguiente) return;
    e.preventDefault();
    setActiveTab(siguiente);
    document.getElementById(`tab-${siguiente}`)?.focus();
  }

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden animate-in fade-in">
      
      <SubNav label="Admin" items={ADM_NAV} currentPath="/dashboard/admin/configuracion" color="red" />

      {/* Warning Banner */}
      <div className="bg-red-50 border-b border-red-200 px-4 sm:px-8 py-3 flex items-center gap-3 shrink-0">
        <ShieldAlert className="text-red-600 shrink-0" size={20} />
        <span className="text-red-800 font-bold text-sm">ZONA RESTRINGIDA: CONFIGURACIÓN GENERAL DEL SISTEMA.</span>
      </div>

      {/* Top Header */}
      <div className="bg-white px-4 sm:px-8 py-6 sm:py-8 border-b border-slate-200 shrink-0">
        <PageHeader icon={Settings} color="red"
          title="Configuración General"
          subtitle="Personaliza el comportamiento global, marca blanca y llaves maestras de Nebulae." />
      </div>

      {/* En el celular las pestañas van arriba, en una fila que se desliza; desde md, a la izquierda. */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* Sidebar Menu inside Config */}
        <div className="w-full md:w-64 bg-slate-50/50 border-b md:border-b-0 md:border-r border-slate-200 p-2 md:p-4 shrink-0 overflow-x-auto md:overflow-y-auto">
          {/* Patrón ARIA de pestañas (r1): aria-controls solo apunta a un panel que está en la página (las dos de la
              empresa siempre; las demás cuando están abiertas). F2 (M15): solo la activa en el orden del Tab. */}
          <ul role="tablist" aria-label="Secciones de Configuración General" className="flex gap-1 md:block md:space-y-1">
            {TABS.map(tab => (
              <li key={tab.id} role="presentation" className="shrink-0">
                <button
                  type="button"
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                  aria-controls={tab.id === 'empresa' || tab.id === 'diseno' || activeTab === tab.id ? `panel-${tab.id}` : undefined}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onKeyDown={alTeclear}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap md:whitespace-normal text-left transition-colors ${
                    activeTab === tab.id 
                      ? 'bg-slate-800 text-white shadow-md' 
                      : 'text-slate-600 hover:bg-slate-200/50'
                  }`}
                >
                  <tab.icon size={18} className={activeTab === tab.id ? 'text-slate-300' : 'text-slate-400'} />
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Content Area */}
        {/* @container (r1): los formularios miden este espacio, no la ventana (a 1024 px quedan ~430 px entre las dos
            barras). */}
        <div className="@container flex-1 bg-white p-4 sm:p-6 lg:p-10 overflow-y-auto custom-scrollbar">
          <div className="max-w-4xl mx-auto">

            {/* Las dos pestañas de la empresa quedan montadas (ocultas cuando no están a la vista): cambiar de
                pestaña no borra lo que se escribió y no se guardó. */}
            <div id="panel-empresa" role="tabpanel" aria-labelledby="tab-empresa"
              className={activeTab === 'empresa' ? 'animate-in slide-in-from-right-4' : 'hidden'}>
              <FormEmpresa activo={activeTab === 'empresa'} />
            </div>
            <div id="panel-diseno" role="tabpanel" aria-labelledby="tab-diseno"
              className={activeTab === 'diseno' ? 'animate-in slide-in-from-right-4' : 'hidden'}>
              <FormDocumentos activo={activeTab === 'diseno'} />
            </div>

            {activeTab === 'api' && (
              <div id="panel-api" role="tabpanel" aria-labelledby="tab-api" className="space-y-8 animate-in slide-in-from-right-4">
                <h2 className="text-2xl font-black text-slate-800 border-b border-slate-100 pb-4">API de Nebulae & Autenticación</h2>
                <p className="text-slate-500 font-medium">Permite que aplicaciones externas (Terceros) se conecten directamente a tu ERP a través de nuestra API pública y OAuth.</p>
                
                <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                  <TerminalSquare className="absolute -right-10 -bottom-10 w-64 h-64 text-slate-800 opacity-50 pointer-events-none" />
                  
                  <h3 className="font-bold text-emerald-400 mb-6 flex items-center gap-2">
                    <KeyRound size={20} /> Credenciales de Desarrollo (OAuth 2.0)
                  </h3>
                  
                  <div className="space-y-4 relative z-10">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Client ID</label>
                      <div className="bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 font-mono text-sm">
                        nebulae_live_pk_9f8d7e6c5b4a3...
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Client Secret</label>
                      <div className="bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 font-mono text-sm blur-[3px] hover:blur-none transition-all cursor-pointer">
                        nebulae_sk_112233445566778899...
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-8 flex gap-3 relative z-10">
                    <button className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 px-5 py-2.5 rounded-xl font-bold transition-colors">
                      Rotar Llaves Secretas
                    </button>
                    <button className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl font-bold transition-colors border border-slate-700">
                      Ver Documentación de API
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab !== 'empresa' && activeTab !== 'diseno' && activeTab !== 'api' && (
               <div id={`panel-${activeTab}`} role="tabpanel" aria-labelledby={`tab-${activeTab}`}
                 className="flex flex-col items-center justify-center py-32 text-slate-400">
                  <Settings size={48} className="mb-4 opacity-20" />
                  <p className="font-bold">Contenido de "{TABS.find(t=>t.id === activeTab)?.label}" en construcción.</p>
               </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
