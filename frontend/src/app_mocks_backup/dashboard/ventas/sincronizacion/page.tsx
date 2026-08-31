'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Database, Link2, KeyRound, User, Settings2, CheckCircle2 } from 'lucide-react';

export default function SincronizacionPage() {
  const [odooUrl, setOdooUrl] = useState('');
  const [odooDb, setOdooDb] = useState('');
  const [odooUser, setOdooUser] = useState('');
  const [odooApiKey, setOdooApiKey] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setOdooUrl(localStorage.getItem('odoo_url') || '');
    setOdooDb(localStorage.getItem('odoo_db') || '');
    setOdooUser(localStorage.getItem('odoo_user') || '');
    setOdooApiKey(localStorage.getItem('odoo_api_key') || '');
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('odoo_url', odooUrl);
    localStorage.setItem('odoo_db', odooDb);
    localStorage.setItem('odoo_user', odooUser);
    localStorage.setItem('odoo_api_key', odooApiKey);
    
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full">
      <div className="flex flex-col items-start justify-between">
        <Link href="/dashboard/ventas" className="flex items-center text-sm font-semibold text-slate-500 hover:text-slate-800 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Ventas
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings2 className="w-6 h-6 text-slate-700" /> Configuración Integración Odoo / Postgres
          </h1>
          <p className="text-sm text-slate-500 mt-1">Esta sección permite conectar Nebulae Hub directamente con tu base de datos Odoo o tu réplica en Postgres.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Instructions Panel */}
        <div className="md:col-span-1 bg-blue-50/50 border border-blue-100 rounded-xl p-6 shadow-sm h-fit">
          <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" /> Pre-requisitos
          </h3>
          <ul className="text-sm text-blue-800 space-y-4">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">1</span>
              <div>
                <strong>Habilitar API XML-RPC en Odoo:</strong> Asegúrate de que tu instancia de Odoo permite conexiones externas por XML-RPC o REST.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">2</span>
              <div>
                <strong>Credenciales de Odoo:</strong> Necesitaremos la URL de tu Odoo, el nombre de la Base de Datos, tu Usuario (email) y un API Key.
              </div>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">3</span>
              <div>
                <strong>Seguridad:</strong> Estas credenciales se guardan localmente en tu navegador por seguridad.
              </div>
            </li>
          </ul>
        </div>

        {/* Configuration Form */}
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6">Credenciales de Acceso</h3>
          
          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Link2 className="w-4 h-4 text-slate-400" /> URL de Odoo
              </label>
              <input 
                type="url" 
                value={odooUrl}
                onChange={e => setOdooUrl(e.target.value)}
                placeholder="ej. https://mi-empresa.odoo.com" 
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-slate-400" /> Nombre de la Base de Datos
              </label>
              <input 
                type="text" 
                value={odooDb}
                onChange={e => setOdooDb(e.target.value)}
                placeholder="ej. produccion_db" 
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-slate-400" /> Usuario (Email)
                </label>
                <input 
                  type="email" 
                  value={odooUser}
                  onChange={e => setOdooUser(e.target.value)}
                  placeholder="admin@empresa.com" 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-slate-400" /> Odoo API Key / Contraseña
                </label>
                <input 
                  type="password" 
                  value={odooApiKey}
                  onChange={e => setOdooApiKey(e.target.value)}
                  placeholder="Tu API Key de Odoo" 
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  required
                />
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-slate-100 mt-6">
              <span className="text-sm text-slate-500">
                {isSaved && (
                  <span className="flex items-center text-green-600 font-semibold animate-pulse">
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Configuración Guardada
                  </span>
                )}
              </span>
              <button 
                type="submit"
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-6 rounded-lg transition-colors shadow-sm"
              >
                Guardar Configuración Odoo
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  );
}
