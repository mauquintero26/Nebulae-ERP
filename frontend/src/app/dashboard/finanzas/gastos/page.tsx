"use client";

import { CreditCard, Search, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import toast from 'react-hot-toast';
import { SubNav, PageHeader, Modal, Button, EmptyState } from '@/components/ui';
import { FIN_NAV } from '../fin-nav';

const CATEGORIAS = ['Pauta Digital', 'Nómina', 'Arriendo', 'Suscripciones', 'Equipos', 'Servicios Públicos', 'Transporte', 'Otro'];

function formatMonto(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount) || 0);
}

function formatFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

export default function GastosPage() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: CATEGORIAS[0], description: '', amount: '', incurred_date: '', is_recurring: false });

  async function loadExpenses() {
    setLoading(true);
    try {
      const data = await apiFetch('/finance/expenses');
      const list = Array.isArray(data) ? data : (data?.data ?? []);
      setExpenses(list.sort((a, b) => new Date(b.incurred_date) - new Date(a.incurred_date)));
    } catch (e) {
      toast.error('Error cargando gastos: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadExpenses(); }, []);

  async function handleCreate() {
    if (!form.category || !form.amount) { toast.error('Categoría y monto son obligatorios.'); return; }
    setSaving(true);
    try {
      await apiFetch('/finance/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category: form.category,
          description: form.description || null,
          amount: parseFloat(form.amount),
          incurred_date: form.incurred_date ? new Date(form.incurred_date).toISOString() : null,
          is_recurring: form.is_recurring,
        }),
      });
      toast.success('Gasto registrado');
      setShowModal(false);
      setForm({ category: CATEGORIAS[0], description: '', amount: '', incurred_date: '', is_recurring: false });
      loadExpenses();
    } catch (e) {
      toast.error('Error al registrar gasto: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  const filtered = expenses.filter(g => {
    const q = search.toLowerCase();
    return !q || (g.category || '').toLowerCase().includes(q) || (g.description || '').toLowerCase().includes(q);
  });

  return (
    <div className="w-full h-full overflow-y-auto animate-in fade-in duration-500 custom-scrollbar bg-slate-50">
      <SubNav label="Finanzas" items={FIN_NAV} currentPath="/dashboard/finanzas/gastos" color="rose" />

      <div className="p-8 space-y-6">

      {/* Header */}
      <PageHeader icon={CreditCard} color="rose"
        title="Control de Gastos (OPEX)"
        subtitle="Gestión de nómina, pauta, arriendos y otros gastos operativos."
        actions={(
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar gasto..."
                className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 outline-none w-64 shadow-sm"
              />
            </div>
            <Button color="rose" icon={Plus} onClick={() => setShowModal(true)}>Añadir Gasto</Button>
          </div>
        )} />

      {/* Tabla OPEX */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                <th className="p-4 pl-6">ID / Fecha</th>
                <th className="p-4">Categoría</th>
                <th className="p-4">Concepto</th>
                <th className="p-4">Tipo</th>
                <th className="p-4 pr-6 text-right">Monto (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading && (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">Cargando...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={5}><EmptyState icon={CreditCard} message="Sin gastos registrados." /></td></tr>
              )}
              {!loading && filtered.map((gasto) => (
                <tr key={gasto.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 pl-6">
                    <div className="font-bold text-slate-800 font-mono">EXP-{gasto.id}</div>
                    <div className="text-xs text-slate-500">{formatFecha(gasto.incurred_date)}</div>
                  </td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-bold border border-slate-200">
                      {gasto.category}
                    </span>
                  </td>
                  <td className="p-4 font-medium text-slate-600">{gasto.description || '—'}</td>
                  <td className="p-4">
                    <span className={`text-xs font-bold ${gasto.is_recurring ? 'text-blue-600' : 'text-amber-600'}`}>
                      {gasto.is_recurring ? 'Recurrente' : 'Variable'}
                    </span>
                  </td>
                  <td className="p-4 pr-6 text-right font-black text-slate-800 text-base">{formatMonto(gasto.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Añadir Gasto */}
      {showModal && (
        <Modal title="Añadir Gasto" icon={CreditCard} color="rose" onClose={() => setShowModal(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button color="rose" loading={saving} onClick={handleCreate}>Guardar Gasto</Button>
            </>
          )}>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Categoría *</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-500">
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Concepto</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Ej. Salarios 1ra Quincena" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-500" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Monto (USD) *</label>
                <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Fecha</label>
                <input type="date" value={form.incurred_date} onChange={e => setForm(f => ({ ...f, incurred_date: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-rose-500" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.is_recurring} onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))} />
              Gasto recurrente
            </label>
        </Modal>
      )}
      </div>
    </div>
  );
}
