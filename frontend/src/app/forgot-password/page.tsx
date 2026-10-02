'use client';

import { useState } from 'react';
import { Mail, ArrowRight, Loader2, Sparkles, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { forgotPassword } from '@/lib/api';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const data = await forgotPassword(email);
      // Mostramos siempre el mensaje genérico que devuelve el backend tal cual
      // (nunca uno propio: filtraría si el correo existe o no).
      setMessage(data?.message || 'Si el correo existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.');
    } catch (err: any) {
      // Incluso ante un error de red mostramos el mismo mensaje genérico:
      // no hay forma de distinguir "no existe" de "falló el envío" desde aquí,
      // y no se debe sugerir ninguna de las dos.
      setMessage('Si el correo existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background gradients (Light mode variations) */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-200/50 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-200/50 blur-[120px]" />

      <div className="w-full max-w-md z-10">
        <div className="bg-white/70 backdrop-blur-2xl border border-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">

          <div className="relative z-10">
            <div className="flex justify-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                <Sparkles className="text-white w-7 h-7" />
              </div>
            </div>

            <h1 className="text-3xl font-extrabold text-slate-900 text-center mb-2 tracking-tight">¿Olvidaste tu contraseña?</h1>
            <p className="text-slate-500 text-center mb-8 text-sm font-medium">
              Ingresa tu correo y te enviaremos un enlace para restablecerla.
            </p>

            {message ? (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl text-sm mb-6 text-center font-semibold flex items-start justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{message}</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-11 pr-3 py-3 border border-slate-200 rounded-xl leading-5 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all sm:text-sm shadow-sm"
                      placeholder="tu@correo.com"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all shadow-md disabled:opacity-70 disabled:cursor-not-allowed overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                    <span className="relative flex items-center tracking-wide">
                      {loading ? (
                        <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
                      ) : (
                        "Enviar enlace"
                      )}
                      {!loading && <ArrowRight className="ml-2 h-4 w-4 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />}
                    </span>
                  </button>
                </div>
              </form>
            )}

            <div className="mt-8 text-center">
              <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900 hover:text-purple-600 transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Volver a Iniciar Sesión
              </Link>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
