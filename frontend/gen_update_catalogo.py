import os

path = 'src/app/dashboard/inventario/catalogo/page.tsx'

content = """"use client";

import { useState, useEffect } from 'react';
import { Layers, Plus, Tag, Box, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  getBrands, createBrand, 
  getCategories, createCategory,
  getAttributes, createAttribute
} from '@/lib/api';

export default function CatalogHub() {
  const [activeTab, setActiveTab] = useState('Categorías');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  
  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'Categorías') setItems(await getCategories());
      if (activeTab === 'Marcas') setItems(await getBrands());
      if (activeTab === 'Atributos') setItems(await getAttributes());
    } catch (err: any) {
      toast.error('Error cargando ' + activeTab);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newItemName.trim()) return;
    try {
      toast.loading(`Creando ${activeTab}...`, { id: 'create' });
      if (activeTab === 'Categorías') await createCategory(newItemName);
      if (activeTab === 'Marcas') await createBrand(newItemName);
      if (activeTab === 'Atributos') await createAttribute(newItemName);
      
      toast.success('Creado exitosamente', { id: 'create' });
      setNewItemName('');
      fetchData(); // Reload
    } catch (err: any) {
      toast.error(err.message, { id: 'create' });
    }
  };

  return (
    <div className="w-full bg-slate-50 min-h-screen p-8 custom-scrollbar">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl"><Layers size={24} /></div>
              Gestión de Catálogo
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Administra Marcas, Categorías y Atributos de productos (SKUs).</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex gap-4">
            {['Categorías', 'Marcas', 'Atributos'].map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === tab ? 'bg-white shadow-sm border border-slate-200 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="p-8 space-y-6">
            <div className="flex items-center gap-4">
              <input 
                type="text" 
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
                placeholder={`Nuevo nombre de ${activeTab.slice(0, -1)}...`}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-medium"
              />
              <button onClick={handleCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center gap-2">
                <Plus size={18} /> Crear
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase">ID</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase">Nombre</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-500 uppercase text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loading ? (
                    <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400"><Loader2 className="animate-spin mx-auto"/></td></tr>
                  ) : items.length === 0 ? (
                    <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400">No hay {activeTab.toLowerCase()} registradas.</td></tr>
                  ) : (
                    items.map((item: any) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-black text-indigo-700">#{item.id}</td>
                        <td className="px-6 py-4 font-bold text-slate-800">{item.name}</td>
                        <td className="px-6 py-4 text-right">
                          <button className="text-slate-400 hover:text-indigo-600 font-medium text-xs">Editar</button>
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
    </div>
  );
}
"""

with open('update_catalogo.py', 'w', encoding='utf-8') as script:
    script.write(f'''
import os
with open("{path}", "w", encoding="utf-8") as f:
    f.write("""{content}""")
''')
print("Created script to create Catalog Hub.")
