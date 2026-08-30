import os

os.makedirs('src/app/dashboard/admin/empleados', exist_ok=True)
os.makedirs('src/app/dashboard/admin/ajustes', exist_ok=True)
os.makedirs('src/app/dashboard/admin/configuracion', exist_ok=True)

# 1. Empleados
empleados_path = 'src/app/dashboard/admin/empleados/page.tsx'
empleados_content = """"use client";

import { useState } from 'react';
import { 
  Users, ShieldAlert, UserPlus, Search, ShieldCheck, 
  UserMinus, Mail, MapPin, Building, Key
} from 'lucide-react';
import { ResizableHeader } from '@/components/ResizableHeader';

const MOCK_EMPLEADOS = [
  { id: 'EMP-001', name: 'Laura Gómez', role: 'Gerente Ventas', dept: 'Ventas', status: 'Activo', email: 'laura@nebulae.com' },
  { id: 'EMP-002', name: 'Carlos Ruíz', role: 'Jefe de Bodega', dept: 'Logística', status: 'Activo', email: 'carlos@nebulae.com' },
  { id: 'EMP-003', name: 'Ana Martínez', role: 'Marketing Lead', dept: 'Marketing', status: 'Inactivo', email: 'ana@nebulae.com' }
];

export default function EmpleadosHub() {
  const [selectedEmp, setSelectedEmp] = useState(MOCK_EMPLEADOS[0]);

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden animate-in fade-in">
      
      {/* Warning Banner */}
      <div className="bg-red-50 border-b border-red-200 px-8 py-3 flex items-center gap-3">
        <ShieldAlert className="text-red-600" size={20} />
        <span className="text-red-800 font-bold text-sm">ZONA RESTRINGIDA: SOLO MODIFICABLE POR EL ADMINISTRADOR PRINCIPAL.</span>
      </div>

      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Users className="text-indigo-600" size={24} /> Empleados, Roles & Permisos
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Alta, baja y control de accesos de los usuarios de la empresa.</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2.5 rounded-xl font-bold shadow-sm transition-colors text-sm flex items-center gap-2">
            Formulario Contratación
          </button>
          <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-colors flex items-center gap-2">
            <UserPlus size={18} /> Nuevo Empleado
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* Left Column: Master List */}
        <div className="w-[400px] bg-white border-r border-slate-200 flex flex-col z-10 shrink-0 shadow-[5px_0_15px_-10px_rgba(0,0,0,0.05)]">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <div className="relative flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-500 transition-all">
              <Search className="text-slate-400 shrink-0 mr-2" size={16} />
              <input 
                type="text" 
                placeholder="Buscar empleado..." 
                className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 outline-none"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {MOCK_EMPLEADOS.map(emp => (
              <div 
                key={emp.id}
                onClick={() => setSelectedEmp(emp)}
                className={`p-5 border-b border-slate-100 cursor-pointer transition-colors ${selectedEmp.id === emp.id ? 'bg-indigo-50/50 border-l-4 border-l-indigo-500' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-bold text-slate-800">{emp.name}</h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${emp.status === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {emp.status}
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-500 mb-2">{emp.role}</p>
                <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-3">
                  <span className="flex items-center gap-1"><Building size={12}/> {emp.dept}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Detail Pane */}
        <div className="flex-1 bg-slate-50 overflow-y-auto custom-scrollbar">
          <div className="p-8 max-w-4xl mx-auto space-y-8">
            
            {/* Header Detail */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex justify-between items-start">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-2xl uppercase border-2 border-indigo-200">
                  {selectedEmp.name.substring(0, 2)}
                </div>
                <div>
                  <h2 className="text-3xl font-black text-slate-800">{selectedEmp.name}</h2>
                  <div className="flex items-center gap-4 mt-2 text-sm font-medium text-slate-500">
                    <span className="flex items-center gap-1.5"><Mail size={16}/> {selectedEmp.email}</span>
                    <span className="flex items-center gap-1.5"><Building size={16}/> {selectedEmp.dept}</span>
                  </div>
                </div>
              </div>
              <div>
                <button className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-2 rounded-xl font-bold transition-colors text-sm flex items-center gap-2">
                  <UserMinus size={16} /> Dar de Baja
                </button>
              </div>
            </div>

            {/* Roles & Permissions */}
            <div>
              <h3 className="font-black text-slate-800 text-lg flex items-center gap-2 mb-4">
                <ShieldCheck className="text-indigo-600" size={20} /> Matriz de Permisos
              </h3>
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3">Módulo ERP</th>
                      <th className="px-6 py-3 text-center">Solo Lectura</th>
                      <th className="px-6 py-3 text-center">Escritura</th>
                      <th className="px-6 py-3 text-center">Admin Local</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                    <tr className="hover:bg-slate-50">
                      <td className="px-6 py-4 flex items-center gap-2"><Key size={16} className="text-slate-400"/> CRM & Ventas</td>
                      <td className="px-6 py-4 text-center"><input type="checkbox" className="w-4 h-4 text-indigo-600" /></td>
                      <td className="px-6 py-4 text-center"><input type="checkbox" className="w-4 h-4 text-indigo-600" defaultChecked={selectedEmp.dept === 'Ventas'} /></td>
                      <td className="px-6 py-4 text-center"><input type="checkbox" className="w-4 h-4 text-indigo-600" /></td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-6 py-4 flex items-center gap-2"><Key size={16} className="text-slate-400"/> Logística e Inventario</td>
                      <td className="px-6 py-4 text-center"><input type="checkbox" className="w-4 h-4 text-indigo-600" defaultChecked /></td>
                      <td className="px-6 py-4 text-center"><input type="checkbox" className="w-4 h-4 text-indigo-600" defaultChecked={selectedEmp.dept === 'Logística'} /></td>
                      <td className="px-6 py-4 text-center"><input type="checkbox" className="w-4 h-4 text-indigo-600" defaultChecked={selectedEmp.dept === 'Logística'} /></td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-6 py-4 flex items-center gap-2"><Key size={16} className="text-slate-400"/> Marketing & Leads</td>
                      <td className="px-6 py-4 text-center"><input type="checkbox" className="w-4 h-4 text-indigo-600" /></td>
                      <td className="px-6 py-4 text-center"><input type="checkbox" className="w-4 h-4 text-indigo-600" /></td>
                      <td className="px-6 py-4 text-center"><input type="checkbox" className="w-4 h-4 text-indigo-600" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Formularios & Contratos */}
            <div>
              <h3 className="font-black text-slate-800 text-lg flex items-center gap-2 mb-4">
                <Building className="text-indigo-600" size={20} /> Documentación Legal & Contratos
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-indigo-300 transition-colors cursor-pointer">
                  <h4 className="font-bold text-slate-800 mb-1">Acta de Ingreso (Contratación)</h4>
                  <p className="text-xs text-slate-500">Firmado el 12 Oct 2024. Ver documento.</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5 hover:border-indigo-300 transition-colors cursor-pointer">
                  <h4 className="font-bold text-slate-800 mb-1">Generar Terminación de Contrato</h4>
                  <p className="text-xs text-slate-500">Plantilla de despido legal pre-llenada.</p>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
"""
with open(empleados_path, 'w', encoding='utf-8') as f:
    f.write(empleados_content)

# 2. Ajustes
ajustes_path = 'src/app/dashboard/admin/ajustes/page.tsx'
ajustes_content = """"use client";

import { useState } from 'react';
import { 
  SlidersHorizontal, Search, Settings2, ShieldAlert
} from 'lucide-react';

const MODULES = ['CRM', 'Ventas', 'Compras', 'Inventario', 'Marketing', 'E-Commerce'];

export default function AjustesHub() {
  const [activeModule, setActiveModule] = useState('Ventas');

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden animate-in fade-in">
      
      {/* Warning Banner */}
      <div className="bg-red-50 border-b border-red-200 px-8 py-3 flex items-center gap-3">
        <ShieldAlert className="text-red-600" size={20} />
        <span className="text-red-800 font-bold text-sm">ZONA RESTRINGIDA: CONFIGURACIONES POR DEFECTO DEL NÚCLEO.</span>
      </div>

      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <SlidersHorizontal className="text-pink-600" size={24} /> Ajustes por Módulo
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Configura las variables y comportamientos por defecto de cada bloque.</p>
        </div>
        <button className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-colors">
          Guardar Cambios Globales
        </button>
      </div>

      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* Left Column: Module List */}
        <div className="w-72 bg-white border-r border-slate-200 flex flex-col z-10 shrink-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-800 uppercase text-xs tracking-wider">Módulos del Sistema</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {MODULES.map(mod => (
              <button 
                key={mod}
                onClick={() => setActiveModule(mod)}
                className={`w-full text-left px-4 py-3 rounded-xl font-bold text-sm transition-colors flex items-center gap-3 ${activeModule === mod ? 'bg-pink-50 text-pink-700 shadow-sm border border-pink-100' : 'text-slate-600 hover:bg-slate-50 border border-transparent'}`}
              >
                <Settings2 size={18} className={activeModule === mod ? 'text-pink-500' : 'text-slate-400'}/> {mod}
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Dynamic Settings */}
        <div className="flex-1 bg-slate-50 overflow-y-auto custom-scrollbar p-8">
          <div className="max-w-3xl mx-auto">
            
            <h2 className="text-2xl font-black text-slate-800 mb-6">Ajustes: {activeModule}</h2>
            
            {activeModule === 'Ventas' && (
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-4">Impuestos y Financieros</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Impuesto por Defecto (IVA)</label>
                      <input type="text" defaultValue="19%" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 outline-none focus:border-pink-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Moneda Base</label>
                      <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 outline-none focus:border-pink-500">
                        <option>COP - Peso Colombiano</option>
                        <option>USD - Dólar Estadounidense</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-800 mb-4">Ciclo de Venta</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Días validez de cotización</label>
                      <input type="number" defaultValue={15} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 outline-none focus:border-pink-500" />
                    </div>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" defaultChecked className="w-4 h-4 text-pink-600 rounded" />
                      <span className="text-sm font-medium text-slate-700">Requerir aprobación gerencial para descuentos > 10%</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {activeModule !== 'Ventas' && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Settings2 size={48} className="mb-4 opacity-20" />
                <p className="font-bold">Cargando esquema de ajustes de {activeModule}...</p>
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
"""
with open(ajustes_path, 'w', encoding='utf-8') as f:
    f.write(ajustes_content)

# 3. Configuracion
config_path = 'src/app/dashboard/admin/configuracion/page.tsx'
config_content = """"use client";

import { useState } from 'react';
import { 
  Settings, Building2, Paintbrush, Globe2, TerminalSquare, 
  Barcode, ShieldAlert, KeyRound
} from 'lucide-react';

const TABS = [
  { id: 'empresa', label: 'Info de la Empresa', icon: Building2 },
  { id: 'diseno', label: 'Diseño & Documentos', icon: Paintbrush },
  { id: 'localizacion', label: 'Localización & Unidades', icon: Globe2 },
  { id: 'api', label: 'Nuestra API & OAuth', icon: TerminalSquare },
  { id: 'seguridad', label: 'Seguridad & SSO', icon: KeyRound },
  { id: 'barcode', label: 'BBDD Códigos de Barras', icon: Barcode },
];

export default function ConfiguracionHub() {
  const [activeTab, setActiveTab] = useState('empresa');

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden animate-in fade-in">
      
      {/* Warning Banner */}
      <div className="bg-red-50 border-b border-red-200 px-8 py-3 flex items-center gap-3 shrink-0">
        <ShieldAlert className="text-red-600" size={20} />
        <span className="text-red-800 font-bold text-sm">ZONA RESTRINGIDA: CONFIGURACIÓN GENERAL DEL SISTEMA.</span>
      </div>

      {/* Top Header */}
      <div className="bg-white px-8 py-8 border-b border-slate-200 shrink-0">
        <h1 className="text-3xl font-black text-slate-800 flex items-center gap-3">
          <Settings className="text-slate-800" size={32} /> Configuración General
        </h1>
        <p className="text-slate-500 mt-2 font-medium">Personaliza el comportamiento global, marca blanca y llaves maestras de Nebulae.</p>
      </div>

      <div className="flex-1 flex overflow-hidden">
        
        {/* Sidebar Menu inside Config */}
        <div className="w-64 bg-slate-50/50 border-r border-slate-200 p-4 shrink-0 overflow-y-auto">
          <ul className="space-y-1">
            {TABS.map(tab => (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-colors ${
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
        <div className="flex-1 bg-white p-10 overflow-y-auto custom-scrollbar">
          <div className="max-w-4xl mx-auto">
            
            {activeTab === 'empresa' && (
              <div className="space-y-8 animate-in slide-in-from-right-4">
                <h2 className="text-2xl font-black text-slate-800 border-b border-slate-100 pb-4">Información de la Compañía</h2>
                
                <div className="flex gap-8">
                  <div className="w-40 h-40 border-2 border-dashed border-slate-300 rounded-3xl flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 transition-colors cursor-pointer shrink-0">
                    <Building2 size={32} className="mb-2 opacity-50" />
                    <span className="text-xs font-bold">Subir Logo</span>
                  </div>
                  
                  <div className="flex-1 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Razón Social</label>
                        <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:border-slate-800" defaultValue="Nebulae Corp S.A.S" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">NIT / ID Fiscal</label>
                        <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:border-slate-800" defaultValue="900.123.456-7" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Dirección Principal</label>
                      <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:border-slate-800" defaultValue="Av Siempre Viva 123, Bogotá" />
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-3 rounded-xl font-bold shadow-sm transition-colors">Guardar Información</button>
                </div>
              </div>
            )}

            {activeTab === 'api' && (
              <div className="space-y-8 animate-in slide-in-from-right-4">
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

            {activeTab !== 'empresa' && activeTab !== 'api' && (
               <div className="flex flex-col items-center justify-center py-32 text-slate-400">
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
"""
with open(config_path, 'w', encoding='utf-8') as f:
    f.write(config_content)

print("Admin screens created")
