'use client';

// H11: el cliente de la solicitud. Un solo selector para la lista de Solicitudes y el Asistente Omnicanal: busca en el
// CRM y, si el cliente no está (o los parecidos no son), abre el alta ENCIMA de la solicitud con lo que se escribió en
// el buscador, sin cerrarla ni perder lo que ya tenía (productos, notas, asesor).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, X } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { textoDeError } from '@/lib/avisos';
import { Modal, Button } from '@/components/ui';
import { datosInicialesCliente, nombreCliente } from '@/lib/cliente-desde-busqueda';

const CAMPO = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200';
const ETIQUETA = 'text-xs font-bold text-slate-500 mb-1 block';

// ── Alta de un cliente nuevo ────────────────────────────────────────────────────────────────────────────────────────
// Se dibuja en un portal (document.body) con capa 'encima' (z-[60]): queda sobre la ventana de la solicitud (z-50) y su
// <form> no queda anidado dentro del de la solicitud. Ojo: en React el submit SÍ burbujea por el portal hasta el <form>
// de la solicitud, por eso save() hace stopPropagation (sin eso, guardar el cliente crearía la solicitud).
export function NewClientModal({ onSave, onClose, textoInicial }: {
  onSave: (c: any) => void;
  onClose: () => void;
  /** Lo escrito en el buscador: nombre, teléfono o correo (datosInicialesCliente). */
  textoInicial?: string;
}) {
  const [inicial] = useState(() => datosInicialesCliente(textoInicial));
  const [form, setForm] = useState(() => ({ ...inicial, address: '', city: '' }));
  const [saving, setSaving] = useState(false);
  // H49 (T1B): el error se muestra dentro de la ventana, sin cerrarla ni borrar lo escrito; se borra al editar.
  const [error, setError] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    // C7 (ronda 1): un nombre de solo espacios pasa el 'required' del navegador: se dice en la ventana.
    const nombre = form.first_name.trim();
    if (!nombre) { setError('Escribe el nombre del cliente.'); return; }
    setSaving(true);
    setError('');
    try {
      const d = await apiFetch('/crm/customers', { method: 'POST', body: JSON.stringify({ ...form, first_name: nombre }) });
      onSave(d?.data ?? d);
    } catch (err: any) { setError(textoDeError(err, 'No se pudo crear el cliente')); }
    setSaving(false);
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    // C9 (ronda 1): Escape cierra el alta si no está guardando, sin llegar a la ventana de la solicitud (stopPropagation).
    <div onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); if (!saving) onClose(); } }}>
    <Modal title="Nuevo cliente" subtitle="Completa los datos del cliente nuevo para continuar." icon={UserPlus} color="indigo"
      capa="encima"
      // Mientras guarda no se cierra (ni la X ni 'Cancelar'): el resultado siempre llega a una ventana abierta.
      onClose={() => { if (!saving) onClose(); }} bloquearCierre={saving}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="sc-new-client-form" color="indigo" icon={UserPlus} loading={saving}>Guardar cliente</Button>
        </>
      )}>
      <form id="sc-new-client-form" onSubmit={save} onChange={() => { if (error) setError(''); }} className="space-y-3">
        {error && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="nc-nombre" className={ETIQUETA}>Nombre *</label>
            <input id="nc-nombre" required autoFocus value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} className={CAMPO} />
            {inicial.first_name && <p className="text-[11px] text-slate-500 mt-1">Tomado del buscador: puedes separarlo en nombre y apellido.</p>}
          </div>
          <div><label htmlFor="nc-apellido" className={ETIQUETA}>Apellido</label>
            <input id="nc-apellido" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className={CAMPO} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="nc-telefono" className={ETIQUETA}>Teléfono</label>
            <input id="nc-telefono" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={CAMPO} /></div>
          <div><label htmlFor="nc-correo" className={ETIQUETA}>Correo</label>
            <input id="nc-correo" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={CAMPO} /></div>
        </div>
        <div><label htmlFor="nc-direccion" className={ETIQUETA}>Dirección</label>
          <input id="nc-direccion" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={CAMPO} /></div>
        <div><label htmlFor="nc-ciudad" className={ETIQUETA}>Ciudad</label>
          <input id="nc-ciudad" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={CAMPO} /></div>
      </form>
    </Modal>
    </div>,
    document.body,
  );
}

// ── Selector de cliente de la solicitud ─────────────────────────────────────────────────────────────────────────────
// Sin cliente: el buscador y sus resultados, con una última fila para crear uno nuevo con lo escrito (aunque haya
// parecidos) o, si no hay resultados, el recuadro ámbar 'Agregar cliente'. Con cliente: solo la tarjeta índigo (X para
// cambiarlo). Todos los botones son type="button": viven dentro del <form> de la solicitud.
export function SelectorClienteSC({ cliente, onCliente }: {
  cliente: any | null;
  /** info.nuevo: el cliente se acaba de crear con el alta (para avisarlo). null: se quitó el cliente. */
  onCliente: (c: any | null, info?: { nuevo?: boolean }) => void;
}) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [buscado, setBuscado] = useState(false);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  // C9 (ronda 1): la lista de resultados se cierra con Escape o con un clic fuera.
  const [abierta, setAbierta] = useState(false);
  // C6 (ronda 1): temporizador o petición en curso («Buscando…») y error de la búsqueda (no se disfraza de «no está»).
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Contador de peticiones: una respuesta de una búsqueda anterior ya no pinta nada.
  const reqId = useRef(0);
  const contenedor = useRef<HTMLDivElement>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);
  const cambiarRef = useRef<HTMLButtonElement>(null);
  // C9: a dónde va el foco después del próximo render: la X de la tarjeta (cliente elegido o creado), el buscador (se
  // quitó el cliente) o quien abrió el alta (se cerró sin guardar; si ya no está, el buscador).
  const focoPendiente = useRef<'tarjeta' | 'buscador' | 'abridor' | null>(null);
  const abridorAlta = useRef<HTMLElement | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    const destino = focoPendiente.current;
    if (!destino) return;
    focoPendiente.current = null;
    const abridor = abridorAlta.current?.isConnected ? abridorAlta.current : null;
    const el = destino === 'tarjeta' ? cambiarRef.current : destino === 'abridor' ? (abridor ?? buscadorRef.current) : buscadorRef.current;
    el?.focus();
  });

  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener('mousedown', alPulsar);
    return () => document.removeEventListener('mousedown', alPulsar);
  }, [abierta]);

  function limpiarBusqueda() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    reqId.current += 1;
    setTexto(''); setResultados([]); setBuscado(false); setAbierta(false); setBuscando(false); setErrorBusqueda('');
  }

  function buscar(q: string) {
    setTexto(q);
    setBuscado(false);
    setErrorBusqueda('');
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const id = ++reqId.current;
    if (!q.trim()) { setResultados([]); setAbierta(false); setBuscando(false); return; }
    setBuscando(true);
    timer.current = setTimeout(async () => {
      timer.current = null;
      let lista: any[] = [];
      let error = '';
      try {
        const d = await apiFetch(`/crm/customers/search?q=${encodeURIComponent(q.trim())}`);
        lista = Array.isArray(d) ? d : (d?.data ?? []);
      } catch (err) { error = textoDeError(err, 'No se pudo buscar'); }
      if (id !== reqId.current) return;
      setResultados(lista); setErrorBusqueda(error); setBuscado(!error); setBuscando(false); setAbierta(lista.length > 0);
    }, 300);
  }

  function elegir(c: any) {
    focoPendiente.current = 'tarjeta';
    limpiarBusqueda();
    onCliente(c);
  }

  function abrirAlta(e: React.MouseEvent<HTMLElement>) {
    abridorAlta.current = e.currentTarget;
    setMostrarAlta(true);
  }

  const escrito = texto.trim();
  const listaAbierta = abierta && resultados.length > 0;

  return (
    <div>
      {cliente ? (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-indigo-700 break-words">{nombreCliente(cliente) || 'Cliente sin nombre'}</p>
            {(cliente.phone || cliente.email) && <p className="text-[11px] text-indigo-500 break-words">{cliente.phone || cliente.email}</p>}
          </div>
          <button type="button" ref={cambiarRef} onClick={() => { focoPendiente.current = 'buscador'; onCliente(null); }}
            title="Cambiar cliente" aria-label="Cambiar cliente"
            className="shrink-0 text-indigo-400 hover:text-indigo-700"><X size={14} /></button>
        </div>
      ) : (
        <div className="relative" ref={contenedor}>
          <input type="text" ref={buscadorRef} value={texto} onChange={e => buscar(e.target.value)} placeholder="Buscar por nombre, teléfono o correo…"
            aria-label="Buscar cliente"
            // Vive dentro del <form> de la solicitud: el Enter no la envía (todavía no hay cliente elegido). Escape cierra
            // la lista abierta; al volver al buscador, la lista reaparece.
            onKeyDown={e => {
              if (e.key === 'Enter') e.preventDefault();
              else if (e.key === 'Escape' && listaAbierta) { e.preventDefault(); e.stopPropagation(); setAbierta(false); }
            }}
            onFocus={() => { if (resultados.length > 0) setAbierta(true); }}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
          {listaAbierta && (
            <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-56 overflow-y-auto">
              {resultados.map((c: any) => (
                <button key={c.id} type="button" onClick={() => elegir(c)}
                  className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 text-sm border-b border-slate-50 break-words">
                  <span className="font-bold text-slate-800">{nombreCliente(c) || 'Cliente sin nombre'}</span>
                  {(c.phone || c.email) && <span className="ml-2 text-xs text-slate-400">{c.phone || c.email}</span>}
                </button>
              ))}
              {escrito && (
                <button type="button" onClick={abrirAlta}
                  className="w-full text-left px-3 py-2.5 hover:bg-amber-50 text-sm font-bold text-amber-700 flex items-center gap-1.5 break-words">
                  <UserPlus size={13} className="shrink-0" />+ Agregar «{escrito}» como cliente nuevo
                </button>
              )}
            </div>
          )}
          {buscando && <p role="status" className="mt-1.5 text-xs text-slate-500">Buscando…</p>}
          {errorBusqueda && (
            <p role="alert" className="mt-2 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 break-words">{errorBusqueda}</p>
          )}
          {buscado && !errorBusqueda && resultados.length === 0 && escrito && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-amber-700 flex-1 min-w-[10rem] break-words">No encontramos «{escrito}». ¿Es un cliente nuevo?</p>
              <button type="button" onClick={abrirAlta}
                className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                <UserPlus size={12} />Agregar cliente
              </button>
            </div>
          )}
        </div>
      )}
      {mostrarAlta && (
        <NewClientModal
          textoInicial={texto}
          onSave={(c) => {
            focoPendiente.current = 'tarjeta';
            setMostrarAlta(false);
            limpiarBusqueda();
            onCliente(c?.data ?? c, { nuevo: true });
          }}
          onClose={() => { focoPendiente.current = 'abridor'; setMostrarAlta(false); }}
        />
      )}
    </div>
  );
}
