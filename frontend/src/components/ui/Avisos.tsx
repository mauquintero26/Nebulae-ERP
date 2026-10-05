'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle, Info, X } from 'lucide-react';
import { agregarAviso, duracionAviso, textoDeError } from '@/lib/avisos';
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
  /** Resuelve true solo con el botón de confirmar; Escape, la X, 'Volver' o cambiar de pantalla dan false. */
  confirmar: (opciones: OpcionesConfirmar) => Promise<boolean>;
};

type Aviso = { id: number; texto: string; tono: TonoAviso; accion?: AccionAviso };
type Confirmacion = { id: number; opciones: OpcionesConfirmar; resolver: (valor: boolean) => void };

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

  const cambiarCola = useCallback((nueva: Confirmacion[]) => {
    colaRef.current = nueva;
    setCola(nueva);
  }, []);

  const avisar = useCallback((texto: string, opciones?: OpcionesAviso) => {
    // Un tono desconocido (llamador JS) cae en 'ok' en vez de romper el render de todo el dashboard.
    const tono: TonoAviso = opciones?.tono === 'error' || opciones?.tono === 'info' ? opciones.tono : 'ok';
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
        cambiarCola([...colaRef.current, { id: ++siguienteId.current, opciones, resolver }]);
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

  // Al cambiar de pantalla las confirmaciones pendientes se responden 'no' y se descartan; los avisos se quedan.
  useEffect(() => {
    const pendientes = colaRef.current;
    if (!pendientes.length) return;
    cambiarCola([]);
    pendientes.forEach((c) => c.resolver(false));
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

  // Escape responde 'no' a la confirmación visible (solo mientras hay una). En captura y sin propagar: Escape
  // contesta solo la ventana de arriba, no cierra además una ventana de la página que esté debajo.
  useEffect(() => {
    if (!actual) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      responder(actual.id, false);
    };
    window.addEventListener('keydown', alTeclear, true);
    return () => window.removeEventListener('keydown', alTeclear, true);
  }, [actual, responder]);

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
  const no = () => onResponder(id, false);
  return (
    <Modal
      capa="encima"
      role="alertdialog"
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
      <p className="text-sm text-slate-700 whitespace-pre-line">{mensaje}</p>
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
