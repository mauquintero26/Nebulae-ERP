import os

path = 'src/app/dashboard/inventario/bodegas/page.tsx'

content = """"use client";

import { useState, useEffect } from 'react';
import { Warehouse, Plus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getWarehouses, createWarehouse } from '@/lib/api';

export default function BodegasCRUD() {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await getWarehouses();
      setWarehouses(data);
    } catch (err: any) {
      toast.error('Error cargando bodegas: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      toast.loading('Creando bodega...', { id: 'create-wh' });
      await createWarehouse(newName, newLocation);
      toast.success('Bodega creada', { id: 'create-wh' });
      setNewName('');
      setNewLocation('');
      fetchData();
    } catch (err: any) {
      toast.error(err.message, { id: 'create-wh' });
    }
  };

  return (
    <div className="w-full bg-slate-50 min-h-screen p-8 custom-scrollbar">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl"><Warehouse size={24} /></div>
              Gestión de Bodegas
            </h1>
            <p className="text-slate-500 mt-2 font-medium">CRUD de Almacenes y Bodegas Físicas conectado a la API de Producción.</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <input 
              type="text" 
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nombre de la Bodega (Ej. Bodega Principal)"
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-medium"
            />
            <input 
              type="text" 
              value={newLocation}
              onChange={e => setNewLocation(e.target.value)}
              placeholder="Ubicación / Dirección"
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-medium"
            />
            <button onClick={handleCreate} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2">
              <Plus size={18} /> Añadir Bodega
            </button>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase">ID</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase">Nombre</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase">Ubicación</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400"><Loader2 className="animate-spin mx-auto"/></td></tr>
                ) : warehouses.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-400">No hay bodegas registradas.</td></tr>
                ) : (
                  warehouses.map((wh: any) => (
                    <tr key={wh.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-black text-emerald-700">WH-{wh.id}</td>
                      <td className="px-6 py-4 font-bold text-slate-800">{wh.name}</td>
                      <td className="px-6 py-4 font-medium text-slate-500">{wh.location || 'N/A'}</td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-slate-400 hover:text-emerald-600 font-medium text-xs">Editar</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
"""

with open('update_bodegas.py', 'w', encoding='utf-8') as script:
    script.write(f'''
import os
with open("{path}", "w", encoding="utf-8") as f:
    f.write("""{content}""")
''')
print("Created script to create Bodegas CRUD.")
