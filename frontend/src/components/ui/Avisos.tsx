'use client';

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle, Info, X } from 'lucide-react';
import { agregarAviso, duracionAviso, normalizarTono, textoDeError } from '@/lib/avisos';
import { hayReautenticacionPendiente } from '@/lib/api';
import type { AccentColor } from './colors';
import { Modal } from './Modal';
import { Button } from './Button';

/**
 * H49 (Bloque 2, T1A): avisos y confirmaciones dentro del sistema, en lugar de window.alert / window.confirm.
 * AvisosProvider va una sola vez en dashboard/layout.tsx; las pantallas usan useAvisos():
 *   const { avisar, avisarError, confirmar } = useAvisos();
 *   avisar('Cotización COT-1 creada');                       // tono 'ok' por defecto
 *   avisarError(err, 'No se pudo guardar la cotización');     // texto legible + console.error
 *   if (!(await confirmar({ titulo: '…', mensaje: '…', peligro: true }))) return;
 * Capas: confirmaciones z-[60] (sobre los modales de la página, z-50), avisos z-[90], Toaster de react-hot-toast
 * z-95 y el modal de sesión vencida de SessionKeeper z-[100], que queda encima de todo.
 */

export type TonoAviso = 'ok' | 'error' | 'info';
export type AccionAviso = { texto: string; href: string };
export type OpcionesAviso = { tono?: TonoAviso; accion?: AccionAviso };
export type OpcionesConfirmar = {
  titulo: string;
  mensaje: string;
  /** Lista de consecuencias o datos a revisar antes de confirmar (p. ej. 'Cliente: …'). */
  efectos?: string[];
  /** Por defecto 'Confirmar'. */
  textoConfirmar?: string;
  /** Por defecto 'Volver'. */
  textoCancelar?: string;
  /** Botón rojo, icono de advertencia y foco inicial en 'Volver'. */
  peligro?: boolean;
  color?: AccentColor;
};
export type ContextoAvisos = {
  avisar: (texto: string, opciones?: OpcionesAviso) => void;
  avisarError: (err: unknown, prefijo?: string) => void;
  /**
   * Resuelve true solo con el botón de confirmar; Escape, la X o 'Volver' dan false. Cada confirmación recuerda la
   * ruta en la que se pidió: al cambiar de pantalla, las pedidas en otra ruta se responden false y se descartan. Una
   * pedida por la pantalla nueva al montar (o justo después de navegar) ya lleva la ruta nueva y sigue en pie.
   */
  confirmar: (opciones: OpcionesConfirmar) => Promise<boolean>;
};

type Aviso = { id: number; texto: string; tono: TonoAviso; accion?: AccionAviso };
type Confirmacion = { id: number; opciones: OpcionesConfirmar; resolver: (valor: boolean) => void; ruta: string };

// Lo que puede tener foco dentro de la ventana de confirmación (para el ciclo de Tab).
const ENFOCABLES =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ESTILO_TONO: Record<TonoAviso, string> = {
  ok: 'bg-emerald-600',
  error: 'bg-red-600',
  info: 'bg-slate-800',
};
const ICONO_TONO: Record<TonoAviso, React.ComponentType<{ size?: number; className?: string }>> = {
  ok: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

// Sin proveedor (fuera del dashboard): nunca window.alert ni window.confirm.
const RESPALDO: ContextoAvisos = {
  avisar: (texto) => {
    console.warn(texto);
  },
  avisarError: (err, prefijo) => {
    console.error(err);
    console.warn(textoDeError(err, prefijo));
  },
  confirmar: () => Promise.resolve(false),
};

const AvisosContext = createContext<ContextoAvisos | null>(null);

export function useAvisos(): ContextoAvisos {
  return useContext(AvisosContext) ?? RESPALDO;
}

export function AvisosProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [cola, setCola] = useState<Confirmacion[]>([]);
  // Copia síncrona de la cola: responder() resuelve fuera del setState y una respuesta repetida no hace nada.
  const colaRef = useRef<Confirmacion[]>([]);
  const siguienteId = useRef(0);
  // Elemento que tenía el foco cuando se abrió la primera confirmación; lo recupera al cerrarse la última.
  const focoPrevio = useRef<HTMLElement | null>(null);

  // Ruta vigente, actualizada en un efecto de layout: corre antes de los efectos (pasivos) de la página nueva, así que
  // un confirmar() que esa página pida al montar ya queda con la ruta nueva (ver el efecto de pathname más abajo).
  const rutaRef = useRef(pathname);
  useLayoutEffect(() => {
    rutaRef.current = pathname;
  }, [pathname]);

  const cambiarCola = useCallback((nueva: Confirmacion[]) => {
    colaRef.current = nueva;
    setCola(nueva);
  }, []);

  const avisar = useCallback((texto: string, opciones?: OpcionesAviso) => {
    // 'err' -> 'error'; un tono desconocido cae en 'info' con un console.warn (no rompe el render del dashboard).
    const tono: TonoAviso = normalizarTono(opciones?.tono);
    const aviso: Aviso = { id: ++siguienteId.current, texto, tono, accion: opciones?.accion };
    setAvisos((lista) => agregarAviso(lista, aviso));
  }, []);

  const avisarError = useCallback(
    (err: unknown, prefijo?: string) => {
      console.error(err);
      avisar(textoDeError(err, prefijo), { tono: 'error' });
    },
    [avisar],
  );

  const cerrarAviso = useCallback((id: number) => {
    setAvisos((lista) => lista.filter((a) => a.id !== id));
  }, []);

  const confirmar = useCallback(
    (opciones: OpcionesConfirmar) =>
      new Promise<boolean>((resolver) => {
        if (!colaRef.current.length && typeof document !== 'undefined') {
          const activo = document.activeElement;
          focoPrevio.current = activo instanceof HTMLElement && activo !== document.body ? activo : null;
        }
        const confirmacion = { id: ++siguienteId.current, opciones, resolver, ruta: rutaRef.current };
        cambiarCola([...colaRef.current, confirmacion]);
      }),
    [cambiarCola],
  );

  const responder = useCallback(
    (id: number, valor: boolean) => {
      const confirmacion = colaRef.current.find((c) => c.id === id);
      if (!confirmacion) return;
      cambiarCola(colaRef.current.filter((c) => c.id !== id));
      confirmacion.resolver(valor);
    },
    [cambiarCola],
  );

  // Al cambiar de pantalla, las confirmaciones pedidas en otra ruta se responden 'no' y se descartan (las de la ruta
  // nueva siguen); los avisos se quedan.
  useEffect(() => {
    const deOtraRuta = colaRef.current.filter((c) => c.ruta !== pathname);
    if (!deOtraRuta.length) return;
    cambiarCola(colaRef.current.filter((c) => c.ruta === pathname));
    deOtraRuta.forEach((c) => c.resolver(false));
  }, [pathname, cambiarCola]);

  // Si el proveedor se desmonta (salir del dashboard), ninguna promesa queda colgada.
  useEffect(
    () => () => {
      const pendientes = colaRef.current;
      colaRef.current = [];
      pendientes.forEach((c) => c.resolver(false));
    },
    [],
  );

  const actual = cola[0];
  const hayConfirmacion = cola.length > 0;

  // Al cerrarse la última confirmación, el foco vuelve a donde estaba (si ese elemento sigue en la página).
  useEffect(() => {
    if (hayConfirmacion) return;
    const foco = focoPrevio.current;
    focoPrevio.current = null;
    if (foco?.isConnected) foco.focus();
  }, [hayConfirmacion]);

  const valor = useMemo<ContextoAvisos>(() => ({ avisar, avisarError, confirmar }), [avisar, avisarError, confirmar]);

  return (
    <AvisosContext.Provider value={valor}>
      {children}
      {/* R24: los toast() de react-hot-toast (CRM, Agenda, Cotizador, Calendario, Finanzas) no tenían dónde verse. */}
      <Toaster position="top-center" containerStyle={{ zIndex: 95 }} />
      {/* bottom-24: no tapa el botón del Chat IA (bottom-6 right-6). */}
      <div className="fixed bottom-24 right-6 z-[90] flex flex-col items-end gap-2 max-w-sm pointer-events-none">
        {avisos.map((aviso) => (
          <TarjetaAviso key={aviso.id} aviso={aviso} onCerrar={cerrarAviso} />
        ))}
      </div>
      {/* key = id: cada confirmación monta su propia ventana y el autoFocus se aplica en cada una. */}
      {actual && <VentanaConfirmacion key={actual.id} confirmacion={actual} onResponder={responder} />}
    </AvisosContext.Provider>
  );
}

/** Un aviso: se cierra solo a los duracionAviso() ms; el tiempo se pausa con el puntero encima. */
function TarjetaAviso({ aviso, onCerrar }: { aviso: Aviso; onCerrar: (id: number) => void }) {
  const [pausado, setPausado] = useState(false);
  const restante = useRef(duracionAviso(aviso.tono, aviso.texto));

  useEffect(() => {
    if (pausado) return;
    const inicio = Date.now();
    const temporizador = window.setTimeout(() => onCerrar(aviso.id), Math.max(0, restante.current));
    return () => {
      window.clearTimeout(temporizador);
      restante.current -= Date.now() - inicio;
    };
  }, [pausado, aviso.id, onCerrar]);

  const Icono = ICONO_TONO[aviso.tono];
  return (
    <div
      role={aviso.tono === 'error' ? 'alert' : 'status'}
      onPointerEnter={() => setPausado(true)}
      onPointerLeave={() => setPausado(false)}
      className={`pointer-events-auto px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold flex items-start gap-2 ${ESTILO_TONO[aviso.tono]}`}
    >
      <Icono size={16} className="shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-line break-words">{aviso.texto}</p>
        {aviso.accion && (
          <Link
            href={aviso.accion.href}
            onClick={() => onCerrar(aviso.id)}
            className="mt-1 inline-block underline underline-offset-2 hover:opacity-90"
          >
            {aviso.accion.texto}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={() => onCerrar(aviso.id)}
        aria-label="Cerrar aviso"
        className="ml-1 shrink-0 opacity-80 hover:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function VentanaConfirmacion({
  confirmacion,
  onResponder,
}: {
  confirmacion: Confirmacion;
  onResponder: (id: number, valor: boolean) => void;
}) {
  const { id, opciones } = confirmacion;
  const { titulo, mensaje, efectos, textoConfirmar = 'Confirmar', textoCancelar = 'Volver', peligro = false, color } = opciones;
  const mensajeId = useId();
  const no = () => onResponder(id, false);

  // Teclado mientras esta ventana está visible, en fase de captura:
  // - Escape responde 'no' y no se propaga (no cierra además una ventana de la página que esté debajo).
  // - Tab / Shift+Tab dan la vuelta dentro de la ventana (el foco no se va a la página de atrás).
  // Con la ventana de sesión vencida abierta (z-[100], encima) el teclado es de ella: no se toca.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (hayReautenticacionPendiente()) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onResponder(id, false);
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = document.getElementById(mensajeId)?.closest<HTMLElement>('[aria-modal="true"]');
      const enfocables = panel ? Array.from(panel.querySelectorAll<HTMLElement>(ENFOCABLES)) : [];
      if (!panel || !enfocables.length) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const activo = document.activeElement;
      const dentro = activo instanceof Node && panel.contains(activo);
      const destino = e.shiftKey
        ? !dentro || activo === primero ? ultimo : null
        : !dentro || activo === ultimo ? primero : null;
      if (destino) {
        e.preventDefault();
        destino.focus();
      }
    };
    window.addEventListener('keydown', alTeclear, true);
    return () => window.removeEventListener('keydown', alTeclear, true);
  }, [id, mensajeId, onResponder]);

  return (
    <Modal
      capa="encima"
      role="alertdialog"
      describedBy={mensajeId}
      maxWidth="md"
      color={peligro ? 'red' : color || 'indigo'}
      icon={peligro ? AlertTriangle : HelpCircle}
      title={titulo}
      onClose={no}
      footer={
        <>
          <Button variant="secondary" autoFocus={peligro} onClick={no}>
            {textoCancelar}
          </Button>
          <Button
            variant={peligro ? 'danger' : 'primary'}
            color={color || 'indigo'}
            autoFocus={!peligro}
            onClick={() => onResponder(id, true)}
          >
            {textoConfirmar}
          </Button>
        </>
      }
    >
      <p id={mensajeId} className="text-sm text-slate-700 whitespace-pre-line">
        {mensaje}
      </p>
      {efectos && efectos.length > 0 && (
        <ul className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 list-disc list-inside">
          {efectos.map((efecto, i) => (
            <li key={i}>{efecto}</li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
