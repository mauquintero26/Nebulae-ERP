"use client";

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
