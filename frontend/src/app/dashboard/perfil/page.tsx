"use client";

import { useState } from "react";
import { UserCircle, Lock, Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function PerfilPage() {
  const [form, setForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);

    if (form.new_password !== form.confirm_password) {
      setResult({ type: "error", message: "Las contraseñas nuevas no coinciden." });
      return;
    }
    if (form.new_password.length < 8) {
      setResult({ type: "error", message: "La nueva contraseña debe tener al menos 8 caracteres." });
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: form.current_password,
          new_password: form.new_password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ type: "error", message: data.detail || "Error al cambiar la contraseña." });
      } else {
        setResult({ type: "success", message: "¡Contraseña actualizada correctamente!" });
        setForm({ current_password: "", new_password: "", confirm_password: "" });
      }
    } catch {
      setResult({ type: "error", message: "Error de conexión. Intenta de nuevo." });
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = (pwd: string) => {
    if (pwd.length === 0) return null;
    if (pwd.length < 8) return { label: "Muy corta", color: "bg-red-500", width: "w-1/4" };
    if (pwd.length < 12) return { label: "Aceptable", color: "bg-amber-500", width: "w-2/4" };
    if (pwd.match(/[A-Z]/) && pwd.match(/[0-9]/) && pwd.match(/[^A-Za-z0-9]/))
      return { label: "Fuerte", color: "bg-emerald-500", width: "w-full" };
    return { label: "Buena", color: "bg-blue-500", width: "w-3/4" };
  };

  const strength = passwordStrength(form.new_password);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft size={16} />
            Volver al Dashboard
          </Link>
        </div>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg">
            <UserCircle className="text-white w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Mi Perfil</h1>
            <p className="text-slate-500 text-sm">Gestiona tu cuenta y seguridad</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
              <Lock className="text-purple-600 w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Cambiar Contraseña</h2>
              <p className="text-xs text-slate-500">Actualiza tu contraseña de acceso al sistema</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Contraseña actual
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? "text" : "password"}
                  name="current_password"
                  value={form.current_password}
                  onChange={handleChange}
                  required
                  placeholder="Ingresa tu contraseña actual"
                  className="w-full px-4 py-2.5 pr-11 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Nueva contraseña
              </label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  name="new_password"
                  value={form.new_password}
                  onChange={handleChange}
                  required
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-4 py-2.5 pr-11 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {strength && (
                <div className="mt-2">
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${strength.color} ${strength.width}`} />
                  </div>
                  <p className={`text-xs mt-1 font-medium ${
                    strength.color === "bg-red-500" ? "text-red-500"
                    : strength.color === "bg-amber-500" ? "text-amber-500"
                    : strength.color === "bg-blue-500" ? "text-blue-500"
                    : "text-emerald-600"
                  }`}>
                    {strength.label}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Confirmar nueva contraseña
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  name="confirm_password"
                  value={form.confirm_password}
                  onChange={handleChange}
                  required
                  placeholder="Repite la nueva contraseña"
                  className={`w-full px-4 py-2.5 pr-11 border rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent transition ${
                    form.confirm_password && form.confirm_password !== form.new_password
                      ? "border-red-300 bg-red-50/30"
                      : "border-slate-200"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.confirm_password && form.confirm_password !== form.new_password && (
                <p className="text-xs text-red-500 mt-1">Las contraseñas no coinciden</p>
              )}
            </div>

            {result && (
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
                  result.type === "success"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {result.type === "success" ? (
                  <CheckCircle size={18} className="flex-shrink-0" />
                ) : (
                  <AlertCircle size={18} className="flex-shrink-0" />
                )}
                {result.message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-semibold rounded-xl shadow-sm hover:from-purple-700 hover:to-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Actualizando..." : "Actualizar Contraseña"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Por seguridad, usa una contraseña de al menos 12 caracteres con mayúsculas, números y símbolos.
        </p>
      </div>
    </div>
  );
}
