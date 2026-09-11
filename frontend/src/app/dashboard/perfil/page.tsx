'use client';

import { useState, useEffect } from 'react';
import {
  UserCircle, Lock, Eye, EyeOff, CheckCircle2, AlertCircle,
  ArrowLeft, Shield, Clock, KeyRound, LogOut, Check
} from 'lucide-react';
import Link from 'next/link';
import { apiFetch as _apiFetch, API_URL } from '@/lib/api';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error en la solicitud');
  return data.data ?? data;
}

const fDate = (d: any) => d ? new Date(d).toLocaleDateString('es-CO', { month: 'long', day: 'numeric', year: 'numeric' }) : '-';

export default function PerfilPage() {
  const [user, setUser] = useState<any | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [form, setForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loadingPass, setLoadingPass] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      setLoadingUser(true);
      try {
        const res = await apiFetch('/auth/me');
        setUser(res?.data || res);
      } catch {
        // Fallback a localStorage
        const email = localStorage.getItem('user_email') || localStorage.getItem('user_name') || 'Usuario Nebulae';
        const role = localStorage.getItem('user_role') || 'asesor';
        setUser({ email, role });
      } finally {
        setLoadingUser(false);
      }
    };
    loadProfile();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);

    if (form.new_password !== form.confirm_password) {
      setResult({ type: 'error', message: 'Las contraseñas nuevas no coinciden.' });
      return;
    }
    if (form.new_password.length < 8) {
      setResult({ type: 'error', message: 'La nueva contraseña debe tener al menos 8 caracteres.' });
      return;
    }

    setLoadingPass(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: form.current_password,
          new_password: form.new_password,
        }),
      });

      setResult({ type: 'success', message: '¡Contraseña actualizada correctamente!' });
      setForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err: any) {
      setResult({ type: 'error', message: err.message || 'Error al cambiar la contraseña.' });
    } finally {
      setLoadingPass(false);
    }
  };

  const passwordStrength = (pwd: string) => {
    if (pwd.length === 0) return null;
    if (pwd.length < 8) return { label: 'Muy corta', color: 'bg-red-500', width: 'w-1/4' };
    if (pwd.length < 12) return { label: 'Aceptable', color: 'bg-amber-500', width: 'w-2/4' };
    if (pwd.match(/[A-Z]/) && pwd.match(/[0-9]/) && pwd.match(/[^A-Za-z0-9]/))
      return { label: 'Fuerte', color: 'bg-emerald-500', width: 'w-full' };
    return { label: 'Buena', color: 'bg-blue-500', width: 'w-3/4' };
  };

  const strength = passwordStrength(form.new_password);

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10 animate-in fade-in">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Breadcrumb / Back */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors bg-white px-3 py-1.5 rounded-xl border border-slate-200"
          >
            <ArrowLeft size={14} />
            Volver al Dashboard
          </Link>
        </div>

        {/* Tarjeta de Identidad y Rol */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-black text-2xl uppercase shadow-md shadow-indigo-100">
              {(user?.email || 'U').substring(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-800 capitalize">
                  {(user?.email || '').split('@')[0] || 'Mi Perfil'}
                </h1>
                <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-black rounded-full uppercase">
                  {user?.role || 'Usuario'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{user?.email}</p>
              {user?.created_at && (
                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                  <Clock size={11} /> Miembro desde: {fDate(user.created_at)}
                </p>
              )}
            </div>
          </div>

          <div className="flex sm:flex-col items-center sm:items-end gap-2 w-full sm:w-auto border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
            <div className="text-right hidden sm:block">
              <span className="text-[10px] font-black text-slate-400 uppercase">Estado de Sesión</span>
              <p className="text-xs font-bold text-emerald-600 flex items-center gap-1 justify-end">
                <CheckCircle2 size={13} /> Activo & Autenticado
              </p>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('token');
                localStorage.removeItem('user_role');
                window.location.href = '/login';
              }}
              className="w-full sm:w-auto px-4 py-2 border border-slate-200 hover:border-red-200 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
            >
              <LogOut size={13} /> Cerrar Sesión
            </button>
          </div>
        </div>

        {/* Sección de Seguridad y Contraseña */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <KeyRound size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                Seguridad & Cambio de Contraseña
              </h2>
              <p className="text-xs text-slate-400">Actualiza tu clave de acceso al sistema</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {result && (
              <div
                className={`p-4 rounded-2xl flex items-center gap-3 text-xs font-bold ${
                  result.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {result.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                {result.message}
              </div>
            )}

            <div>
              <label className="block text-xs font-black text-slate-500 uppercase mb-1">
                Contraseña Actual *
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  name="current_password"
                  value={form.current_password}
                  onChange={handleChange}
                  required
                  placeholder="••••••••••••"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-indigo-300 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1">
                  Nueva Contraseña * (mín. 8 caracteres)
                </label>
                <div className="relative">
                  <input
                    type={showNew ? 'text' : 'password'}
                    name="new_password"
                    value={form.new_password}
                    onChange={handleChange}
                    required
                    placeholder="••••••••••••"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-indigo-300 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1">
                  Confirmar Nueva Contraseña *
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    name="confirm_password"
                    value={form.confirm_password}
                    onChange={handleChange}
                    required
                    placeholder="••••••••••••"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:ring-2 focus:ring-indigo-300 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </div>

            {strength && (
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[11px] font-bold text-slate-400">
                  <span>Seguridad:</span>
                  <span className="text-slate-600 font-bold">{strength.label}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full ${strength.color} ${strength.width} transition-all duration-300`} />
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={loadingPass}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                {loadingPass ? 'Actualizando...' : 'Actualizar Contraseña'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
