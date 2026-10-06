'use client';

// U7+U8+H12+H13 con H25 (choque C2): el buscador de productos del catálogo. Lo usan el formulario de nueva solicitud
// (lista y Asistente Omnicanal, con onAgregarTexto) y el editor de productos del detalle (solicitud/[id]); por eso
// solicitud-client.tsx lo reexporta. Todos los botones son type="button" y el Enter nunca envía el <form> en el que vive.

import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { textoDeError } from '@/lib/avisos';
import { nombreLinea, resolverTextoEscrito, resultadosSirven, resolverConBusqueda } from '@/lib/lineas-solicitud';

const buscarEnCatalogo = (q: string) => apiFetch(`/crm/products/search?q=${encodeURIComponent(q)}&limit=8`);

export function ProductSearch({ value, onChange, onSelect, onAgregarTexto, inputRef, agregarRef, onOcupado }: {
  value: string;
  onChange: (v: string) => void;
  /** Producto elegido del catálogo (sin info) o creado con quick-create (info.creado false = ya existía con ese nombre;
   * info.texto = lo que se envió a crear: el formulario limpia el buscador solo si todavía dice eso). */
  onSelect: (p: any, info?: { creado: boolean; texto?: string }) => void;
  /** Si viene: botón '+ Agregar' y Enter agregan lo escrito (con el producto del catálogo que coincide exacto, o null).
   * info.sinComprobar: la búsqueda para comprobarlo falló y entra como texto libre sin saber si está en el catálogo. */
  onAgregarTexto?: (texto: string, coincidencia: any | null, info?: { sinComprobar?: boolean }) => void;
  /** Para devolver el foco al buscador después de agregar. */
  inputRef?: React.Ref<HTMLInputElement>;
  /** T8B (H25): el padre pone su propio botón «Agregar» (el editor del detalle, debajo y junto a la cantidad) y lo
   * conecta aquí: agregarRef.current() hace lo mismo que Enter (comprueba lo escrito en el catálogo y llama
   * onAgregarTexto). Con agregarRef no se pinta el '+ Agregar' de al lado del buscador. */
  agregarRef?: React.RefObject<(() => void) | null>;
  /** T8B ronda 1: avisa si el buscador está ocupado (creando el producto o comprobando lo escrito en el catálogo), para
   * que el «Agregar» del padre espere. Pasar una función estable (un setState). */
  onOcupado?: (ocupado: boolean) => void;
}) {
  const [results, setResults] = useState<any[]>([]);
  // A4: el texto (recortado) para el que se pidieron los resultados que se tienen.
  const [resultsDe, setResultsDe] = useState('');
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorCrear, setErrorCrear] = useState('');
  // C6: un error al buscar se dice (no se disfraza de «no está en el catálogo») y entonces no se ofrece crear.
  const [errorBusqueda, setErrorBusqueda] = useState('');
  // C6: hay un temporizador o una petición de búsqueda en curso («Buscando…»).
  const [buscando, setBuscando] = useState(false);
  // A4: búsqueda en el acto tras Enter o '+ Agregar'; el ref evita agregar dos veces con dos Enter seguidos.
  const [comprobando, setComprobando] = useState(false);
  const comprobandoRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Contador de peticiones: la respuesta de una búsqueda anterior ya no pinta resultados.
  const reqId = useRef(0);
  const contenedor = useRef<HTMLDivElement>(null);

  // Al desmontar: sin temporizador, y una comprobación en vuelo ya no llama onAgregarTexto (ronda 2: sube reqId).
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    reqId.current += 1;
  }, []);

  // C9: la lista se cierra al hacer clic fuera (mousedown fuera del buscador, como el menú de fila).
  useEffect(() => {
    if (!open) return;
    const alPulsar = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', alPulsar);
    return () => document.removeEventListener('mousedown', alPulsar);
  }, [open]);

  // T8B: el «Agregar» del padre (agregarRef) usa siempre la versión vigente de agregarTexto, la misma de Enter.
  useEffect(() => {
    if (!agregarRef) return;
    agregarRef.current = () => { void agregarTexto(); };
    return () => { agregarRef.current = null; };
  });

  // T8B ronda 1: el padre sabe cuándo el buscador está ocupado (también al montar: arranca libre).
  useEffect(() => {
    onOcupado?.(creating || comprobando);
  }, [creating, comprobando, onOcupado]);

  // Si el texto queda vacío (p. ej. el formulario lo limpia al agregar), no reaparece una lista vieja.
  // Va en un efecto porque el padre limpia `value` sin pasar por handle().
  useEffect(() => {
    if (value) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    reqId.current += 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el padre limpia `value` sin pasar por handle()
    setResults([]); setResultsDe(''); setOpen(false); setSearched(false); setErrorCrear(''); setErrorBusqueda(''); setBuscando(false);
  }, [value]);

  function handle(v: string) {
    onChange(v); setOpen(false); setSearched(false); setErrorCrear(''); setErrorBusqueda('');
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const id = ++reqId.current;
    const q = v.trim();
    if (!q) { setResults([]); setResultsDe(''); setBuscando(false); return; }
    setBuscando(true);
    timer.current = setTimeout(async () => {
      timer.current = null;
      let list: any[] = [];
      let error = '';
      try {
        const d = await buscarEnCatalogo(q);
        list = Array.isArray(d) ? d : (d?.data ?? []);
      } catch (err) { error = textoDeError(err, 'No se pudo buscar'); }
      if (id !== reqId.current) return;
      setResults(list); setResultsDe(error ? '' : q); setErrorBusqueda(error); setBuscando(false);
      setOpen(!error); setSearched(!error);
    }, 300);
  }

  async function crearNuevo() {
    const nombre = value.trim();
    if (!nombre || creating || comprobandoRef.current) return;
    setCreating(true);
    setErrorCrear('');
    try {
      const r = await apiFetch('/crm/products/quick-create', { method: 'POST', body: JSON.stringify({ name: nombre, sale_price: 0 }) });
      const p = r?.data ?? r;
      setOpen(false); setSearched(false);
      // C8: `texto` = lo que se envió: si el buscador ya dice otra cosa, el formulario no lo borra.
      onSelect(p, { creado: p?.creado !== false, texto: nombre });
    } catch (err) {
      // T5: el servidor ya responde en español (422 precio o código, 409 repetido, 400 genérico): su texto tal cual.
      const msg = textoDeError(err);
      setErrorCrear(`${/[.!?]$/.test(msg) ? msg : `${msg}.`} Puedes agregarlo como texto libre con «${onAgregarTexto && !agregarRef ? '+ Agregar' : 'Agregar'}».`);
    }
    setCreating(false);
  }

  async function agregarTexto() {
    const texto = value.trim();
    if (!onAgregarTexto || !texto || creating || comprobandoRef.current) return;
    if (resultadosSirven(texto, resultsDe, timer.current !== null || buscando)) {
      onAgregarTexto(texto, resolverTextoEscrito(texto, results));
      return;
    }
    // A4: los resultados son de otro texto o la búsqueda no ha vuelto (se escribió de corrido y se pulsó Enter): se busca
    // en el acto y se resuelve contra esa respuesta; si no, un producto que existe entraría como texto libre.
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const id = ++reqId.current;
    comprobandoRef.current = true;
    // Ronda 2: sin resultsDe, un Enter que llegue antes de que el formulario limpie el buscador no toma el camino
    // síncrono de arriba (no se agrega la línea dos veces).
    setComprobando(true); setOpen(false); setBuscando(false); setResultsDe('');
    const r = await resolverConBusqueda(texto, buscarEnCatalogo);
    comprobandoRef.current = false;
    setComprobando(false);
    if (id !== reqId.current) return;
    onAgregarTexto(texto, r.coincidencia, r.comprobado ? undefined : { sinComprobar: true });
  }

  const escrito = value.trim();
  const sinCoincidenciaExacta = escrito !== '' && !resolverTextoEscrito(escrito, results);
  const listaAbierta = open && results.length > 0;

  return (
    <div className="relative" ref={contenedor}>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => handle(e.target.value)}
          // C8 / A4: mientras se crea el producto o se comprueba lo escrito, el texto no cambia.
          readOnly={creating || comprobando}
          // El buscador vive dentro del <form> de la solicitud: el Enter nunca la envía (envío implícito). Con
          // onAgregarTexto agrega lo escrito, igual que '+ Agregar'. Escape cierra la lista abierta.
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); void agregarTexto(); }
            else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
          }}
          placeholder="Buscar producto en el catálogo…"
          aria-label="Buscar producto en el catálogo"
          className="flex-1 min-w-0 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none read-only:bg-slate-50"
        />
        {onAgregarTexto && !agregarRef && (
          <button type="button" onClick={() => { void agregarTexto(); }} disabled={!escrito || creating || comprobando}
            className="shrink-0 bg-indigo-100 text-indigo-700 px-3 py-2 rounded-xl text-xs font-bold hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1">
            <Plus size={12} />Agregar
          </button>
        )}
      </div>
      {listaAbierta && (
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
      {(buscando || comprobando) && (
        <p role="status" className="mt-1.5 text-xs text-slate-500">{comprobando ? 'Buscando en el catálogo…' : 'Buscando…'}</p>
      )}
      {errorBusqueda && (
        <p role="alert" className="mt-1.5 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 break-words">{errorBusqueda}</p>
      )}
      {open && searched && !errorBusqueda && results.length === 0 && escrito.length > 2 && (
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
