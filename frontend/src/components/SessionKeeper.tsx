'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Lock, LogOut } from 'lucide-react';
import { getToken, login, pedirReautenticacion, registrarReautenticacion, renovarSesion } from '@/lib/api';
import { estadoSesion, leerPayload } from '@/lib/session';
import { Button } from '@/components/ui/Button';

// Uso real del usuario: solo clics, teclas, rueda y toques (las consultas automaticas no cuentan).
const EVENTOS_DE_USO = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
const ESCRIBIR_ACTIVIDAD_CADA_MS = 30 * 1000;
const REVISAR_CADA_MS = 60 * 1000;
const CLAVE_ULTIMA_ACTIVIDAD = 'last_activity'; // compartida entre pestanas

type Pendiente = { res: () => void; rej: (motivo: unknown) => void };

function leerActividadCompartida(): number {
  try {
    return Number(localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD)) || 0;
  } catch {
    return 0;
  }
}

function subDelToken(token: string | null): string | null {
  const sub = leerPayload(token)?.sub;
  return sub === undefined || sub === null ? null : String(sub);
}

/**
 * H23: mantiene la sesion viva mientras se usa y, si vence, abre encima de la pantalla una ventana para volver a
 * escribir la contrasena sin perder lo escrito.
 * - Renueva el token (POST /auth/refresh) como maximo cada 10 minutos y solo si hubo uso real despues de emitirse.
 * - Revisa cada 60 s, al volver a la pestana y con el uso (como maximo cada 30 s); un token vencido abre la ventana
 *   antes de que el usuario intente guardar.
 * - Un 401 de apiFetch espera en la ventana: al entrar, la peticion se reintenta una vez con el token nuevo.
 * El campo de usuario esta bloqueado (misma cuenta); la contrasena solo vive en el input y va al login.
 */
export function SessionKeeper() {
  const router = useRouter();
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const abiertoRef = useRef(false);
  const pendientes = useRef<Pendiente[]>([]);
  const ultimaActividad = useRef(0);
  const ultimaEscritura = useRef(0);
  const usuarioSesion = useRef('');
  const subSesion = useRef<string | null>(null);
  const claveRef = useRef<HTMLInputElement>(null);

  const abrirVentana = useCallback(() => {
    if (abiertoRef.current) return;
    abiertoRef.current = true;
    let correo = usuarioSesion.current;
    if (!correo) {
      try {
        correo = localStorage.getItem('user_email') || '';
      } catch {}
    }
    setUsuario(correo);
    setError('');
    setAbierto(true);
  }, []);

  const cerrarYResolver = useCallback(() => {
    const lista = pendientes.current;
    pendientes.current = [];
    abiertoRef.current = false;
    setAbierto(false);
    setError('');
    lista.forEach((p) => p.res());
  }, []);

  const rechazarPendientes = useCallback(() => {
    const lista = pendientes.current;
    pendientes.current = [];
    lista.forEach((p) => p.rej(new Error('Sesión cerrada')));
  }, []);

  // Al montar: el usuario de esta sesion y el manejador que usa apiFetch ante un 401.
  useEffect(() => {
    ultimaActividad.current = Date.now();
    try {
      usuarioSesion.current = localStorage.getItem('user_email') || '';
    } catch {}
    subSesion.current = subDelToken(getToken());
    registrarReautenticacion(
      () =>
        new Promise<void>((res, rej) => {
          pendientes.current.push({ res, rej });
          abrirVentana();
        }),
    );
    return () => {
      registrarReautenticacion(null);
      rechazarPendientes();
    };
  }, [abrirVentana, rechazarPendientes]);

  const revisar = useCallback(async () => {
    if (abiertoRef.current) return;
    const actividad = Math.max(ultimaActividad.current, leerActividadCompartida());
    const estado = estadoSesion(leerPayload(getToken()), Date.now(), actividad);
    if (estado === 'vencida' || estado === 'sin-token') {
      // Sin ninguna peticion: abre la ventana (comparte la reautenticacion con los 401 que lleguen).
      pedirReautenticacion().catch(() => {});
      return;
    }
    if (estado === 'renovar') {
      const resultado = await renovarSesion();
      if (resultado === 'no-autorizado' && !abiertoRef.current) pedirReautenticacion().catch(() => {});
      // 'error' (red caida o backend sin /auth/refresh): se reintenta en el siguiente ciclo.
    }
  }, []);

  useEffect(() => {
    const alUsar = () => {
      const ahora = Date.now();
      ultimaActividad.current = ahora;
      if (ahora - ultimaEscritura.current < ESCRIBIR_ACTIVIDAD_CADA_MS) return;
      ultimaEscritura.current = ahora;
      try {
        localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(ahora));
      } catch {}
      void revisar();
    };
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') void revisar();
    };
    // Otra pestana volvio a entrar: si el token nuevo esta vigente y es de la misma cuenta, se cierra la ventana y
    // las peticiones pendientes se reintentan.
    const alCambiarAlmacen = (e: StorageEvent) => {
      if (e.key !== 'token' || !abiertoRef.current) return;
      const estado = estadoSesion(leerPayload(e.newValue), Date.now(), 0);
      if (estado === 'vencida' || estado === 'sin-token') return;
      const sub = subDelToken(e.newValue);
      if (subSesion.current !== null && sub !== subSesion.current) return;
      cerrarYResolver();
    };
    const opciones: AddEventListenerOptions = { passive: true, capture: true };
    EVENTOS_DE_USO.forEach((evento) => window.addEventListener(evento, alUsar, opciones));
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('storage', alCambiarAlmacen);
    const intervalo = window.setInterval(() => void revisar(), REVISAR_CADA_MS);
    return () => {
      EVENTOS_DE_USO.forEach((evento) => window.removeEventListener(evento, alUsar, opciones));
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('storage', alCambiarAlmacen);
      window.clearInterval(intervalo);
    };
  }, [revisar, cerrarYResolver]);

  const continuar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const campo = claveRef.current;
    if (enviando || !campo || !campo.value || !usuario) return;
    setEnviando(true);
    setError('');
    try {
      const data = await login(usuario, campo.value);
      const token = data?.access_token;
      if (typeof token !== 'string' || !token) throw new Error('Respuesta sin token');
      const ahora = Date.now();
      localStorage.setItem('token', token);
      localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(ahora));
      ultimaActividad.current = ahora;
      ultimaEscritura.current = ahora;
      subSesion.current = subDelToken(token) ?? subSesion.current;
      campo.value = '';
      cerrarYResolver();
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      setError(status === 401 ? 'Contraseña incorrecta.' : 'No se pudo conectar con el servidor. Intenta de nuevo.');
      campo.value = '';
      campo.focus();
    } finally {
      setEnviando(false);
    }
  };

  const salir = () => {
    rechazarPendientes();
    try {
      localStorage.removeItem('token');
      sessionStorage.setItem('returnUrl', (pathname || '/dashboard') + window.location.search);
    } catch {}
    router.replace('/login?reason=session-expired');
  };

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sesion-cerrada-titulo"
    >
      <form onSubmit={continuar} className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b bg-gradient-to-r from-purple-50 to-white">
          <h3 id="sesion-cerrada-titulo" className="font-extrabold text-xl text-slate-900 flex items-center gap-2">
            <Lock size={20} /> Tu sesión se cerró
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            Vuelve a escribir tu contraseña para continuar. Lo que tienes en pantalla no se pierde.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="sesion-usuario" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Usuario
            </label>
            <input
              id="sesion-usuario"
              type="text"
              value={usuario}
              readOnly
              autoComplete="username"
              className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-600 text-sm cursor-not-allowed"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="sesion-clave" className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Contraseña
            </label>
            <input
              id="sesion-clave"
              ref={claveRef}
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              className="block w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
              {error}
            </p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <Button variant="secondary" icon={LogOut} onClick={salir} disabled={enviando}>
            Salir
          </Button>
          <Button type="submit" color="purple" icon={Lock} loading={enviando} disabled={!usuario}>
            Continuar
          </Button>
        </div>
      </form>
    </div>
  );
}
