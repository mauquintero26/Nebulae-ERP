'use client';
import { useState } from 'react';
import { Link2, Copy, Check, ExternalLink, ArrowRight } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import type { AccentColor } from '@/components/ui';

// Piezas compartidas por las tres paginas de detalle del flujo SC -> COT -> PVEN, para
// que cada estado le diga al usuario cual es su siguiente paso en vez de dejar una
// pantalla sin acciones.

// El rol real en users.role puede ser legacy ("Admin", "Vendedor") o canonico ("ADMIN",
// "ASESOR") -- ver normalize_role en backend/app/api/dependencies.py. Comparar
// case-insensitive evita que un usuario con rol canonico (p.ej. el admin de QA) quede
// fuera de los selectores de asesor.
export function esAsesorElegible(role?: string | null): boolean {
  const r = (role || '').toLowerCase().trim();
  return r === 'admin' || r === 'vendedor' || r === 'asesor';
}

export type UsuarioActual = { id: number | null; email: string; name: string; role: string };

// Lo escribe AuthGuard tras validar la sesion (/auth/me).
export function getUsuarioActual(): UsuarioActual {
  if (typeof window === 'undefined') return { id: null, email: '', name: '', role: '' };
  const idRaw = Number(localStorage.getItem('user_id'));
  return {
    id: Number.isFinite(idRaw) && idRaw > 0 ? idRaw : null,
    email: localStorage.getItem('user_email') || '',
    name: localStorage.getItem('user_name') || '',
    role: localStorage.getItem('user_role') || '',
  };
}

// "Volver al origen": solo se confia en return_to si es una ruta interna del dashboard
// que no cambia de origen al resolverla. Un simple startsWith('/') no basta -- el
// parser de URL trata "\" como "/" y recorta tab/CR/LF, asi que "/\evil.com" escapa
// del origen aunque empiece con un solo "/".
export function returnToSeguro(raw?: string | null): string {
  if (typeof raw !== 'string' || !raw.startsWith('/dashboard/')) return '';
  try {
    if (new URL(raw, 'http://localhost').origin !== 'http://localhost') return '';
  } catch {
    return '';
  }
  return raw;
}

type Tone = 'amber' | 'indigo' | 'blue' | 'emerald' | 'slate' | 'rose';

const TONE_CLASSES: Record<Tone, { box: string; title: string; text: string }> = {
  amber:   { box: 'bg-amber-50 border-amber-200',     title: 'text-amber-800',   text: 'text-amber-700' },
  indigo:  { box: 'bg-indigo-50 border-indigo-200',   title: 'text-indigo-800',  text: 'text-indigo-700' },
  blue:    { box: 'bg-blue-50 border-blue-200',       title: 'text-blue-800',    text: 'text-blue-700' },
  emerald: { box: 'bg-emerald-50 border-emerald-200', title: 'text-emerald-800', text: 'text-emerald-700' },
  slate:   { box: 'bg-slate-50 border-slate-200',     title: 'text-slate-700',   text: 'text-slate-500' },
  rose:    { box: 'bg-rose-50 border-rose-200',       title: 'text-rose-800',    text: 'text-rose-700' },
};

export function NextStepCard({ tone, title, children, actions }: {
  tone: Tone;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const t = TONE_CLASSES[tone];
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${t.box}`}>
      <div>
        <p className={`text-[10px] font-black uppercase tracking-wider opacity-70 ${t.title}`}>Siguiente paso</p>
        <p className={`text-sm font-black ${t.title}`}>{title}</p>
        {children && <p className={`text-xs mt-1 leading-relaxed ${t.text}`}>{children}</p>}
      </div>
      {actions && <div className="space-y-2 [&>button]:w-full">{actions}</div>}
    </div>
  );
}

// El token crudo solo existe en la respuesta del envio (en la base se guarda su hash),
// asi que este es el unico momento en que el asesor puede ver/copiar el enlace. Sin esto,
// con el canal "Email"/"Otro" -- o sin SMTP configurado -- el enlace no llegaba a ningun
// lado y el cliente nunca podia confirmar.
export function EnlaceConfirmacionModal({ documento, link, color = 'indigo', onClose }: {
  documento: string;
  link: string;
  color?: AccentColor;
  onClose: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el input de arriba ya queda seleccionable.
    }
  }

  return (
    <Modal
      title="Enlace de confirmación listo"
      subtitle={`El cliente confirma ${documento} desde este enlace`}
      icon={Link2}
      color={color}
      maxWidth="lg"
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <p className="text-sm text-slate-600">
        Envíale este enlace al cliente por el canal que prefieras. Es de un solo uso y vence en 2 días;
        cuando el cliente lo abra y confirme, esta pantalla te mostrará el siguiente paso.
      </p>
      <input
        readOnly
        value={link}
        onFocus={e => e.currentTarget.select()}
        className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2.5 text-xs font-mono text-slate-700 outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <Button color={color} icon={copiado ? Check : Copy} onClick={copiar}>
          {copiado ? 'Copiado' : 'Copiar enlace'}
        </Button>
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl font-bold flex items-center justify-center gap-2 px-5 py-2.5 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 bg-white"
        >
          <ExternalLink size={14} /> Abrir como cliente
        </a>
      </div>
      <p className="text-[11px] text-slate-400">
        Solo el cliente debería confirmar: si abres el enlace y confirmas tú, queda registrado como la confirmación del cliente.
      </p>
    </Modal>
  );
}

type CambioActividad = { campo?: string; etiqueta: string; antes?: string | null; despues?: string | null };

// Detalle de lo que cambio en una edicion o re-cotizacion. El backend lo guarda en
// extra_data.cambios (ver backend/app/core/cambios_documento.py) y lo muestran las lineas
// de tiempo de Actividad de SC, COT, PVEN y el panel del Hub.
export function CambiosDeActividad({ extra }: { extra?: any }) {
  const cambios: CambioActividad[] = Array.isArray(extra?.cambios) ? extra.cambios : [];
  if (cambios.length === 0) return null;
  return (
    <ul className="mb-2 space-y-1">
      {cambios.map((c, i) => {
        // Un campo suelto (Notas, Total...) siempre muestra antes y despues, con "—" si estaba
        // vacio. Las lineas de producto (agregado, eliminado, cantidad...) solo lo que traen.
        const esCampo = !!c.campo && !['productos', 'productos_sku', 'mas'].includes(c.campo);
        const antes = c.antes ?? (esCampo ? '—' : null);
        const despues = c.despues ?? (esCampo ? '—' : null);
        return (
          <li key={i} className="text-xs text-slate-600 flex flex-wrap items-baseline gap-x-1.5">
            <span className="font-bold text-slate-700">{c.etiqueta}{antes || despues ? ':' : ''}</span>
            {antes && <span className="text-slate-400 line-through">{antes}</span>}
            {antes && despues && <ArrowRight size={10} className="text-slate-300 self-center" />}
            {despues && <span className="font-semibold text-slate-800">{despues}</span>}
          </li>
        );
      })}
    </ul>
  );
}
