import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';

// B2.1 D1 (decisión del usuario): el registro deja de ser público. Las cuentas las crea un administrador desde
// Administración > Empleados (POST /auth/register con su sesión); esta página ya no tiene formulario y solo lleva a
// iniciar sesión. Reescrita por la excepción R14 de D1 (página pública sin lógica de negocio).
export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-200/50 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-200/50 blur-[120px]" />

      <div className="w-full max-w-md z-10">
        <div className="bg-white/70 backdrop-blur-2xl border border-white rounded-3xl p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex justify-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <ShieldCheck className="text-white w-7 h-7" />
              </div>
            </div>

            <h1 className="text-3xl font-extrabold text-slate-900 text-center mb-2 tracking-tight">Crear cuenta</h1>
            <p className="text-slate-700 text-center text-base font-bold">Las cuentas las crea un administrador del ERP.</p>
            <p className="text-slate-500 text-center mt-3 mb-8 text-sm font-medium leading-relaxed">
              Si necesitas acceso, pídeselo a un administrador: él crea tu cuenta con tu rol y te dice cómo entrar.
            </p>

            <Link
              href="/login"
              className="group w-full flex justify-center items-center py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all shadow-md tracking-wide"
            >
              Iniciar sesión
              <ArrowRight className="ml-2 h-4 w-4 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
