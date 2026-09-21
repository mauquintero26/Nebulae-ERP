'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tag, Plus, Pencil, Trash2, ChevronRight, ChevronDown, X } from 'lucide-react';
import { apiFetch as _apiFetch } from '@/lib/api';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

type Categoria = { id: number; name: string; parent_id: number | null };

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandidas, setExpandidas] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<{ modo: 'crear' | 'editar'; parentId: number | null; categoria?: Categoria } | null>(null);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch('/categories');
      setCategorias(Array.isArray(d) ? d : (d?.data ?? []));
    } catch { setCategorias([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const raiz = categorias.filter(c => c.parent_id === null);
  const hijasDe = (id: number) => categorias.filter(c => c.parent_id === id);

  function abrirCrear(parentId: number | null) {
    setModal({ modo: 'crear', parentId });
    setNombre('');
    setError('');
  }

  function abrirEditar(categoria: Categoria) {
    setModal({ modo: 'editar', parentId: categoria.parent_id, categoria });
    setNombre(categoria.name);
    setError('');
  }

  async function guardar() {
    setError('');
    try {
      if (modal?.modo === 'crear') {
        await apiFetch('/categories', { method: 'POST', body: JSON.stringify({ name: nombre, parent_id: modal.parentId }) });
      } else if (modal?.modo === 'editar' && modal.categoria) {
        await apiFetch(`/categories/${modal.categoria.id}`, { method: 'PUT', body: JSON.stringify({ name: nombre }) });
      }
      setModal(null);
      load();
    } catch (err: any) { setError(err.message); }
  }

  async function borrar(categoria: Categoria) {
    if (!confirm(`¿Borrar "${categoria.name}"?`)) return;
    try {
      await apiFetch(`/categories/${categoria.id}`, { method: 'DELETE' });
      load();
    } catch (err: any) { alert(err.message); }
  }

  function toggleExpandida(id: number) {
    setExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function renderNodo(categoria: Categoria) {
    const hijas = hijasDe(categoria.id);
    const expandida = expandidas.has(categoria.id);
    return (
      <div key={categoria.id} className="border-b border-slate-50 last:border-0">
        <div className="flex items-center justify-between py-3 px-4 hover:bg-slate-50/60">
          <div className="flex items-center gap-2">
            {hijas.length > 0 ? (
              <button onClick={() => toggleExpandida(categoria.id)} className="text-slate-400">
                {expandida ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : <span className="w-4" />}
            <Tag size={14} className="text-purple-500" />
            <span className="font-semibold text-slate-800">{categoria.name}</span>
            {hijas.length > 0 && <span className="text-xs text-slate-400">({hijas.length})</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => abrirCrear(categoria.id)} title="Agregar subcategoria"
              className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg">
              <Plus size={15} />
            </button>
            <button onClick={() => abrirEditar(categoria)} title="Editar"
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
              <Pencil size={14} />
            </button>
            <button onClick={() => borrar(categoria)} title="Borrar"
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {expandida && hijas.length > 0 && (
          <div className="pl-8 bg-slate-50/30">
            {hijas.map(h => renderNodo(h))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-5 overflow-y-auto">
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center text-purple-600">
            <Tag size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Categorías</h1>
            <p className="text-slate-500 text-sm mt-1">{categorias.length} categorías y subcategorías</p>
          </div>
        </div>
        <button onClick={() => abrirCrear(null)}
          className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm flex items-center gap-2">
          <Plus size={18} /> Nueva Categoría
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center pt-16 text-slate-400">Cargando...</div>
        ) : raiz.length === 0 ? (
          <div className="text-center pt-16 text-slate-400">
            <Tag size={48} className="mx-auto mb-4 opacity-20" />
            <p>Sin categorías. Crea la primera.</p>
          </div>
        ) : raiz.map(c => renderNodo(c))}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg text-slate-800">
                {modal.modo === 'crear' ? (modal.parentId ? 'Nueva Subcategoría' : 'Nueva Categoría') : 'Editar Categoría'}
              </h2>
              <button onClick={() => setModal(null)} className="text-slate-400"><X size={18} /></button>
            </div>
            <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Nombre"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 mb-3" />
            {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm">Cancelar</button>
              <button onClick={guardar} disabled={!nombre.trim()}
                className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold text-sm disabled:opacity-50">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
