'use client';

// U8 + H13 con H25 (choque C2): la lista de productos de una solicitud, con la cantidad editable de cada línea. Un solo
// componente: tono 'morado' en el formulario de creación (tarjetas como la del cliente elegido) y 'neutro' en el editor
// del detalle. La lógica vive en lib/lineas-solicitud.js (probada con node). Todos los botones son type="button" y el
// Enter en la cantidad no envía el <form> en el que vive.

import { Minus, Plus, Trash2, X } from 'lucide-react';

import { cambiarCantidad, cantidadValida, nombreLinea, quitarLinea } from '@/lib/lineas-solicitud';

const TONOS = {
  morado: {
    tarjeta: 'bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2',
    nombre: 'text-sm font-bold text-indigo-700 break-words',
    quitar: 'text-indigo-400 hover:text-indigo-700',
  },
  neutro: {
    tarjeta: 'bg-white border border-slate-200 rounded-lg px-3 py-2',
    nombre: 'text-sm font-bold text-slate-800 break-words',
    quitar: 'text-rose-400 hover:text-rose-600',
  },
} as const;

const PASTILLA = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border';

function Pastilla({ linea }: { linea: any }) {
  const sinSku = linea?.sku_id === null || linea?.sku_id === undefined || linea?.sku_id === '';
  if (sinSku) {
    return <span className={`${PASTILLA} bg-amber-50 text-amber-700 border-amber-200`} title="No está en el catálogo; quien cotice puede vincularlo">Texto libre</span>;
  }
  if (linea?._nuevo) return <span className={`${PASTILLA} bg-emerald-50 text-emerald-700 border-emerald-200`}>Nuevo en catálogo</span>;
  return <span className={`${PASTILLA} bg-slate-50 text-slate-500 border-slate-200`}>Catálogo</span>;
}

export function LineasProducto({ lineas, onChange, tono = 'neutro', resaltada = null }: {
  lineas: any[];
  onChange: (lineas: any[]) => void;
  tono?: 'morado' | 'neutro';
  /** Índice de la línea recién agregada o sumada: se resalta unos segundos. */
  resaltada?: number | null;
}) {
  const t = TONOS[tono];
  const lista = Array.isArray(lineas) ? lineas : [];

  if (lista.length === 0) {
    return tono === 'neutro' ? <p className="text-xs text-slate-400 italic">Todavía no hay productos en la lista.</p> : null;
  }

  // Al salir del campo (o con Enter) una cantidad vacía o inválida pasa a un entero >= 1.
  const normalizar = (i: number) => {
    const actual = lista[i]?.qty;
    if (actual !== cantidadValida(actual)) onChange(cambiarCantidad(lista, i, cantidadValida(actual)));
  };

  return (
    <ul className="space-y-1.5">
      {lista.map((linea, i) => {
        const nombre = nombreLinea(linea) || 'Producto sin nombre';
        const qty = linea?.qty;
        const n = cantidadValida(qty);
        return (
          <li key={i}
            className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2 ${t.tarjeta} ${resaltada === i ? 'ring-2 ring-emerald-300' : ''}`}>
            <div className="min-w-0 space-y-1">
              <p className={t.nombre}>{nombre}</p>
              <Pastilla linea={linea} />
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => onChange(cambiarCantidad(lista, i, n - 1))} disabled={n <= 1}
                title={`Una unidad menos de ${nombre}`} aria-label={`Una unidad menos de ${nombre}`}
                className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                <Minus size={12} />
              </button>
              <input
                type="number" min={1} step={1}
                // H25: se puede borrar el número y escribir otro sin que salte a 1 ('' mientras se escribe).
                value={qty === '' ? '' : n}
                onChange={e => onChange(cambiarCantidad(lista, i, e.target.value))}
                onBlur={() => normalizar(i)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); normalizar(i); } }}
                aria-label={`Cantidad de ${nombre}`}
                className="w-14 border border-slate-200 rounded-lg px-1 py-1 text-sm text-center font-bold bg-white outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <button type="button" onClick={() => onChange(cambiarCantidad(lista, i, n + 1))}
                title={`Una unidad más de ${nombre}`} aria-label={`Una unidad más de ${nombre}`}
                className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-slate-50">
                <Plus size={12} />
              </button>
            </div>
            <button type="button" onClick={() => onChange(quitarLinea(lista, i))}
              title={`Quitar ${nombre}`} aria-label={`Quitar ${nombre}`}
              className={`p-1 mt-0.5 ${t.quitar}`}>
              {tono === 'morado' ? <X size={14} /> : <Trash2 size={14} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
