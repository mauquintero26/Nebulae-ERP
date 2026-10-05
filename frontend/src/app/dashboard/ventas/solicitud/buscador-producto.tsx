'use client';

// U7+U8+H12+H13 con H25 (choque C2): el buscador de productos del catálogo. Lo usan el formulario de nueva solicitud
// (lista y Asistente Omnicanal, con onAgregarTexto) y el editor de productos del detalle (solicitud/[id]); por eso
// solicitud-client.tsx lo reexporta. Todos los botones son type="button" y el Enter nunca envía el <form> en el que vive.

import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { textoDeError } from '@/lib/avisos';
import { nombreLinea, resolverTextoEscrito } from '@/lib/lineas-solicitud';

export function ProductSearch({ value, onChange, onSelect, onAgregarTexto, inputRef }: {
  value: string;
  onChange: (v: string) => void;
  /** Producto elegido del catálogo (sin info) o creado con quick-create (info.creado false = ya existía con ese nombre). */
  onSelect: (p: any, info?: { creado: boolean }) => void;
  /** Si viene: botón '+ Agregar' y Enter agregan lo escrito (con el producto del catálogo que coincide exacto, o null). */
  onAgregarTexto?: (texto: string, coincidencia: any | null) => void;
  /** Para devolver el foco al buscador después de agregar. */
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorCrear, setErrorCrear] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Contador de peticiones: la respuesta de una búsqueda anterior ya no pinta resultados.
  const reqId = useRef(0);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Si el texto queda vacío (p. ej. el formulario lo limpia al agregar), no reaparece una lista vieja.
  useEffect(() => {
    if (value) return;
    if (timer.current) clearTimeout(timer.current);
    reqId.current += 1;
    setResults([]); setOpen(false); setSearched(false); setErrorCrear('');
  }, [value]);

  function handle(v: string) {
    onChange(v); setOpen(false); setSearched(false); setErrorCrear('');
    if (timer.current) clearTimeout(timer.current);
    const id = ++reqId.current;
    if (!v.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      let list: any[] = [];
      try {
        const d = await apiFetch(`/crm/products/search?q=${encodeURIComponent(v)}&limit=8`);
        list = Array.isArray(d) ? d : (d?.data ?? []);
      } catch { list = []; }
      if (id !== reqId.current) return;
      setResults(list);
      setOpen(true); setSearched(true);
    }, 300);
  }

  async function crearNuevo() {
    const nombre = value.trim();
    if (!nombre || creating) return;
    setCreating(true);
    setErrorCrear('');
    try {
      const r = await apiFetch('/crm/products/quick-create', { method: 'POST', body: JSON.stringify({ name: nombre, sale_price: 0 }) });
      const p = r?.data ?? r;
      setOpen(false); setSearched(false);
      onSelect(p, { creado: p?.creado !== false });
    } catch (err) {
      // T5: el servidor ya responde en español (422 precio o código, 409 repetido, 400 genérico): su texto tal cual.
      const msg = textoDeError(err);
      setErrorCrear(`${/[.!?]$/.test(msg) ? msg : `${msg}.`} Puedes agregarlo como texto libre con «${onAgregarTexto ? '+ Agregar' : 'Agregar'}».`);
    }
    setCreating(false);
  }

  function agregarTexto() {
    const texto = value.trim();
    if (!onAgregarTexto || !texto || creating) return;
    onAgregarTexto(texto, resolverTextoEscrito(texto, results));
  }

  const escrito = value.trim();
  const sinCoincidenciaExacta = escrito !== '' && !resolverTextoEscrito(escrito, results);

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => handle(e.target.value)}
          // El buscador vive dentro del <form> de la solicitud: el Enter nunca la envía (envío implícito). Con
          // onAgregarTexto agrega lo escrito, igual que '+ Agregar'.
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarTexto(); } }}
          placeholder="Buscar producto en el catálogo…"
          aria-label="Buscar producto en el catálogo"
          className="flex-1 min-w-0 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none"
        />
        {onAgregarTexto && (
          <button type="button" onClick={agregarTexto} disabled={!escrito || creating}
            className="shrink-0 bg-indigo-100 text-indigo-700 px-3 py-2 rounded-xl text-xs font-bold hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
            <Plus size={12} />Agregar
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-56 overflow-y-auto">
          {results.map((p: any) => (
            <button key={p.id ?? nombreLinea(p)} type="button" onClick={() => { setOpen(false); onSelect(p); }}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm border-b border-slate-50 break-words">
              <span className="font-bold text-slate-800">{nombreLinea(p)}</span>
              {p.sku && <span className="ml-2 text-xs text-slate-400">SKU: {p.sku}</span>}
            </button>
          ))}
          {sinCoincidenciaExacta && (
            <button type="button" onClick={crearNuevo} disabled={creating}
              className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm font-bold text-amber-700 break-words disabled:opacity-50">
              {creating ? 'Creando…' : `+ Crear «${escrito}» en el catálogo`}
            </button>
          )}
        </div>
      )}
      {open && searched && results.length === 0 && escrito.length > 2 && (
        <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex flex-wrap items-center gap-2">
          <span className="text-xs text-amber-700 flex-1 min-w-[10rem] break-words">Este producto no está en el catálogo.</span>
          <button type="button" onClick={crearNuevo} disabled={creating}
            className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50">
            {creating ? 'Creando…' : '+ Crear producto nuevo'}
          </button>
        </div>
      )}
      {errorCrear && (
        <p role="alert" className="mt-1.5 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 break-words">{errorCrear}</p>
      )}
    </div>
  );
}
