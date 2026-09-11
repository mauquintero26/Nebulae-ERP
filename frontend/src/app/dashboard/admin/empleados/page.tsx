'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, ShieldAlert, UserPlus, Search, ShieldCheck,
  UserMinus, Mail, MapPin, Building, Key, RefreshCw,
  CheckCircle2, AlertCircle, X, Shield, Lock
} from 'lucide-react';
import { apiFetch as _apiFetch, API_URL } from '@/lib/api';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error en la solicitud');
  return data.data ?? data;
}

const ROLES_DISPONIBLES = [
  { id: 'admin',    label: 'Administrador General', desc: 'Acceso total a configuración, finanzas y auditoría', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { id: 'asesor',   label: 'Asesor Comercial (CRM)', desc: 'Gestión de clientes, cotizaciones y pedidos', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'compras',  label: 'Analista de Compras',  desc: 'Gestión de PECs, proveedores y tracking internacional', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  { id: 'bodega',   label: 'Operario de Bodega',    desc: 'Recepciones físicas, stock y entregas', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { id: 'finanzas', label: 'Auditor Financiero',   desc: 'Validación de pagos, anticipos y saldos', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
];

export default function EmpleadosHub() {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'error' } | null>(null);

  // Formulario nuevo usuario
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('asesor');

  const showToast = (msg: string, type: 'ok' | 'error' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/auth/users').catch(() => []);
      const userList = Array.isArray(res) ? res : (res?.data ?? []);
      setUsers(userList);
      if (userList.length > 0 && !selectedUser) {
        setSelectedUser(userList[0]);
      } else if (selectedUser) {
        const found = userList.find((u: any) => u.id === selectedUser.id);
        if (found) setSelectedUser(found);
      }
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [selectedUser]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleUpdateRole = async (userId: number, role: string) => {
    setSaving(true);
    try {
      await apiFetch(`/auth/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role })
      });
      showToast('Rol de usuario actualizado exitosamente');
      await loadUsers();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword) {
      showToast('Completa todos los campos obligatorios', 'error');
      return;
    }
    if (newPassword.length < 8) {
      showToast('La contraseña debe tener al menos 8 caracteres', 'error');
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role: newRole
        })
      });
      showToast('Empleado registrado exitosamente');
      setShowModal(false);
      setNewEmail('');
      setNewPassword('');
      setNewRole('asesor');
      await loadUsers();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const term = search.toLowerCase();
    return !search || (u.email || '').toLowerCase().includes(term) || (u.role || '').toLowerCase().includes(term);
  });

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden animate-in fade-in">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold flex items-center gap-2 ${
          toast.type === 'ok' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.type === 'ok' ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
          {toast.msg}
        </div>
      )}

      {/* Warning Banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-8 py-2.5 flex items-center gap-3">
        <ShieldAlert className="text-amber-600" size={18} />
        <span className="text-amber-900 font-bold text-xs">
          ZONA DE CONTROL DE ACCESOS: Los cambios de roles alteran permisos de lectura y escritura en todo el ERP Nebulae.
        </span>
      </div>

      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Users className="text-indigo-600" size={22} /> Empleados, Roles & Permisos
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Control de cuentas de acceso y asignación de perfiles funcionales.</p>
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={loadUsers}
            className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-3.5 py-2 rounded-xl font-bold text-xs shadow-sm transition-colors flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold shadow-sm transition-colors text-xs flex items-center gap-1.5"
          >
            <UserPlus size={15} /> Nuevo Empleado
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-row overflow-hidden">
        {/* Left Column: Master List */}
        <div className="w-[360px] bg-white border-r border-slate-200 flex flex-col z-10 shrink-0">
          <div className="p-3.5 border-b border-slate-100 bg-slate-50">
            <div className="relative flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 focus-within:border-indigo-500 transition-all">
              <Search className="text-slate-400 shrink-0 mr-2" size={15} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por email o rol..."
                className="w-full bg-transparent border-none text-xs font-medium text-slate-700 outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <RefreshCw size={20} className="animate-spin text-indigo-500 mx-auto mb-2" />
                Cargando empleados...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No hay usuarios encontrados
              </div>
            ) : (
              filteredUsers.map(user => {
                const isSelected = selectedUser?.id === user.id;
                const roleObj = ROLES_DISPONIBLES.find(r => r.id === user.role) || { label: user.role, color: 'bg-slate-100 text-slate-700 border-slate-200' };
                const namePart = (user.email || '').split('@')[0];

                return (
                  <div
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className={`p-4 border-b border-slate-100 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-indigo-50/60 border-l-4 border-l-indigo-600'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-slate-800 text-xs capitalize">{namePart}</h4>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${roleObj.color}`}>
                        {user.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono truncate">{user.email}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Detail & Role Config */}
        <div className="flex-1 bg-slate-50 overflow-y-auto p-8">
          {selectedUser ? (
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Header Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center justify-between gap-6">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-2xl uppercase border border-indigo-200">
                    {(selectedUser.email || 'U').substring(0, 2)}
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-800 capitalize">
                      {(selectedUser.email || '').split('@')[0]}
                    </h2>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedUser.email}</p>
                    <p className="text-[10px] text-slate-400 mt-1">ID de Usuario: #{selectedUser.id}</p>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase block mb-1">Rol Actual</span>
                  <span className="px-3 py-1 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase shadow-sm">
                    {selectedUser.role}
                  </span>
                </div>
              </div>

              {/* Selector de Rol Funcional */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                    Asignar Rol Funcional
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Selecciona el perfil de acceso autorizado para este usuario.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {ROLES_DISPONIBLES.map(r => {
                    const isCurrent = selectedUser.role === r.id;
                    return (
                      <div
                        key={r.id}
                        onClick={() => !isCurrent && handleUpdateRole(selectedUser.id, r.id)}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                          isCurrent
                            ? 'border-indigo-600 bg-indigo-50/40 shadow-sm'
                            : 'border-slate-200 hover:border-indigo-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-xs text-slate-800">{r.label}</span>
                          {isCurrent && (
                            <span className="p-1 bg-indigo-600 text-white rounded-full">
                              <CheckCircle2 size={12} />
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 leading-snug">{r.desc}</p>
                        <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400">
                          <span>Código: <strong className="font-mono text-slate-700">{r.id}</strong></span>
                          {!isCurrent && (
                            <span className="text-indigo-600 font-bold hover:underline">Asignar →</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-center text-slate-400">
              <div>
                <Users size={40} className="mx-auto mb-2 opacity-30" />
                <p className="font-bold">Selecciona un empleado para ver su configuración</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Nuevo Empleado */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-black text-lg text-slate-800">Registrar Nuevo Empleado</h3>
                <p className="text-xs text-slate-400 mt-0.5">Crea la credencial de acceso para el equipo</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1">Correo Electrónico *</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="empleado@nebulae.com"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1">Contraseña Temporal * (mín. 8 caracteres)</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1">Rol Inicial</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-indigo-300 bg-white font-medium"
                >
                  {ROLES_DISPONIBLES.map(r => (
                    <option key={r.id} value={r.id}>{r.label} ({r.id})</option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Crear Empleado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
