'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, AlertTriangle, Edit2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui';
import { ProductSearch } from '../solicitud-client';

type Linea = { product_name?: string; qty?: number; sku_id?: number | null; [k: string]: any };

const nombreDe = (p: Linea) => String(p?.product_name || p?.nombre || p?.name || '').trim();

// Productos de la Solicitud: son lo que el cliente confirma (Gate 1) y lo que hereda la
// Cotizacion. Sin ellos la SC no se puede enviar al cliente ni cotizar (el backend lo exige),
// asi que aqui se ven, se agregan y se corrigen mientras la SC todavia no tiene cotizacion.
export function ProductosSolicitud({
  scId, productos, editable, motivoBloqueo, anulaConfirmacion, editando, setEditando, currentUser, onGuardado,
}: {
  scId: number;
  productos: Linea[];
  editable: boolean;           // false cuando ya hay cotizacion o la SC esta cancelada
  motivoBloqueo?: string;      // por que no se puede editar
  anulaConfirmacion: boolean;  // enlace pendiente o ya confirmado: guardar obliga a reenviar
  editando: boolean;
  setEditando: (v: boolean) => void;
  currentUser: string;
  // H29: recibe la SC que devuelve el PATCH (`data`) para pintarla de inmediato; la pagina refresca el resto despues.
  onGuardado: (sc?: any) => void;
}) {
  const [borrador, setBorrador] = useState<Linea[]>([]);
  const [nombre, setNombre] = useState('');
  const [skuId, setSkuId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const lista = (productos || []).filter(p => nombreDe(p));

  // Al abrir el editor se parte de los productos guardados.
  useEffect(() => {
    if (!editando) return;
    setBorrador(lista.map(p => ({ ...p })));
    setNombre(''); setSkuId(null); setQty(1); setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando]);

  const lineaEscrita = (): Linea => ({ product_name: nombre.trim(), qty: Math.max(1, Number(qty) || 1), sku_id: skuId, unit_price_cop: 0 });

  function agregar() {
    if (!nombre.trim()) return;
    setBorrador(b => [...b, lineaEscrita()]);
    setNombre(''); setSkuId(null); setQty(1);
  }

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      // Lo que quedo escrito sin pulsar "Agregar" tambien se guarda (igual que al crear la SC).
      const lineas = nombre.trim() ? [...borrador, lineaEscrita()] : borrador;
      const r = await apiFetch(`/ventas/solicitudes/${scId}`, {
        method: 'PATCH',
        body: JSON.stringify({ productos: lineas, updated_by: currentUser }),
      });
      // H29: el editor se cierra al terminar el PATCH (sin esperar la recarga de la pagina).
      setEditando(false);
      onGuardado(r?.data);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron guardar los productos.');
    }
    setGuardando(false);
  }

  return (
    <div id="productos-solicitud" className="scroll-mt-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Productos a cotizar</p>
        {editable && !editando && lista.length > 0 && (
          <button type="button" onClick={() => setEditando(true)} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">
            <Edit2 size={12} /> Editar productos
          </button>
        )}
      </div>

      {editando ? (
        <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-3 space-y-3">
          {borrador.length > 0 ? (
            <div className="space-y-1.5">
              {borrador.map((p, i) => (
                <div key={i} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                  <span className="flex-1 min-w-0 text-sm font-bold text-slate-700 truncate">
                    {nombreDe(p)}
                    {!p.sku_id && <span className="ml-1.5 text-[10px] font-bold text-slate-400 uppercase">texto libre</span>}
                  </span>
                  <label className="text-[11px] text-slate-400">Cant.</label>
                  <input
                    type="number" min={1} value={p.qty ?? 1}
                    onChange={e => setBorrador(b => b.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))}
                    className="w-16 border border-slate-200 rounded-md px-2 py-1 text-sm text-center font-bold outline-none focus:ring-1 focus:ring-indigo-200"
                  />
                  <button type="button" title="Quitar" onClick={() => setBorrador(b => b.filter((_, j) => j !== i))} className="text-rose-400 hover:text-rose-600">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Todavía no hay productos en la lista.</p>
          )}

          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <ProductSearch
                value={nombre}
                onChange={v => { setNombre(v); setSkuId(null); }}
                onSelect={p => { setNombre(p.product_name || p.name || ''); setSkuId(p.id ?? null); }}
              />
            </div>
            <input
              type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value))} title="Cantidad"
              className="w-16 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center font-bold outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <Button variant="secondary" size="sm" icon={Plus} disabled={!nombre.trim()} onClick={agregar}>Agregar</Button>
          </div>
          <p className="text-[11px] text-slate-400">Busca en el catálogo o escribe el nombre: si no existe, se agrega como texto libre.</p>

          {anulaConfirmacion && (
            <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
              Si cambias los productos, la confirmación del cliente deja de valer y tendrás que reenviarle la solicitud.
            </p>
          )}
          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditando(false)}>Cancelar</Button>
            <Button
              color="indigo" size="sm" icon={Save} loading={guardando}
              disabled={borrador.length === 0 && !nombre.trim() && lista.length === 0}
              onClick={guardar}
            >
              Guardar productos
            </Button>
          </div>
        </div>
      ) : lista.length > 0 ? (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-400 uppercase font-black">
              <tr><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Cant.</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {lista.map((p, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 font-medium text-slate-700">
                    {nombreDe(p)}
                    {!p.sku_id && <span className="ml-1.5 text-[10px] font-bold text-slate-400 uppercase">texto libre</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">{p.qty ?? 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="flex items-start gap-2 text-sm font-bold text-amber-800">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> Esta solicitud no tiene productos
          </p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            Sin productos no hay nada que el cliente pueda confirmar ni que cotizar. Agrégalos para poder enviarla al cliente y crear la cotización.
          </p>
          {editable && (
            <div className="mt-3">
              <Button color="amber" size="sm" icon={Plus} onClick={() => setEditando(true)}>Agregar productos</Button>
            </div>
          )}
        </div>
      )}

      {!editable && motivoBloqueo && <p className="text-[11px] text-slate-400 mt-1.5">{motivoBloqueo}</p>}
    </div>
  );
}
