'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Plus, Save, AlertTriangle, Edit2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { textoDeError } from '@/lib/avisos';
import { Button } from '@/components/ui';
import {
  agregarLinea, cantidadValida, lineaDesdeCatalogo, lineaTextoLibre, lineasParaEnviar, nombreLinea, textoAvisoLinea,
} from '@/lib/lineas-solicitud';
import { ProductSearch } from '../solicitud-client';
import { LineasProducto } from '../lineas-producto';

type Linea = { product_name?: string; qty?: number | ''; sku_id?: number | null; [k: string]: any };
// De dónde vino la línea que se agrega: el aviso verde lo dice (el mismo del formulario de nueva solicitud).
type OrigenLinea = 'catalogo' | 'creado' | 'existente' | 'texto' | 'texto-sin-comprobar';

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
  // Copia síncrona del borrador (como en el formulario de nueva SC): lo escrito se agrega después de comprobarlo en el
  // catálogo (un await) y no debe sumarse sobre una lista vieja.
  const borradorRef = useRef<Linea[]>([]);
  const [nombre, setNombre] = useState('');
  const [skuId, setSkuId] = useState<number | null>(null);
  // Lo que está en el buscador salió del alta rápida: true = se creó, false = ya existía con ese nombre; null = elegido
  // de la lista o escrito.
  const [creado, setCreado] = useState<boolean | null>(null);
  // H25: '' mientras se escribe; al salir del campo, al agregar y al guardar pasa a un entero >= 1 (cantidadValida).
  const [qty, setQty] = useState<number | ''>(1);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<{ texto: string; indice: number } | null>(null);
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);
  // El «Agregar» de abajo hace lo mismo que Enter en el buscador: ProductSearch conecta aquí su acción.
  const agregarRef = useRef<(() => void) | null>(null);
  const cantidadId = useId();

  const lista = (productos || []).filter(p => nombreLinea(p));

  function cambiarBorrador(lineas: Linea[]) {
    borradorRef.current = lineas;
    setBorrador(lineas);
  }

  function quitarAviso() {
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    avisoTimer.current = null;
    setAviso(null);
  }
  useEffect(() => () => { if (avisoTimer.current) clearTimeout(avisoTimer.current); }, []);

  // Al abrir el editor se parte de los productos guardados.
  useEffect(() => {
    if (!editando) return;
    cambiarBorrador(lista.map(p => ({ ...p })));
    setNombre(''); setSkuId(null); setCreado(null); setQty(1); setError(''); quitarAviso();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando]);

  // Lo que está en el buscador como línea: el producto elegido (o creado) del catálogo con su SKU, o texto libre; con la
  // cantidad escrita.
  const lineaEscrita = (): Linea => ({
    product_name: nombre.trim(), qty: cantidadValida(qty), sku_id: skuId, unit_price_cop: 0,
    _nuevo: skuId !== null && creado === true,
  });
  const origenElegido = (): OrigenLinea => (creado === null ? 'catalogo' : creado ? 'creado' : 'existente');

  // U7+U8 en el editor (ruling de T8B): agrega (o suma a la línea igual) y lo explica con el mismo aviso verde (6 s) del
  // formulario de nueva solicitud; limpia el buscador si todavía dice lo que se agregó, vuelve a cantidad 1 y le
  // devuelve el foco. Una línea en blanco no se agrega (agregarLinea da indice -1).
  function agregarAlBorrador(linea: Linea, origen: OrigenLinea, textoUsado: string) {
    const r = agregarLinea(borradorRef.current, linea);
    if (r.indice < 0) return;
    cambiarBorrador(r.lineas);
    setNombre(actual => (actual.trim() === textoUsado ? '' : actual));
    setSkuId(null); setCreado(null); setQty(1);
    buscadorRef.current?.focus();
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    setAviso({ texto: textoAvisoLinea(r, origen), indice: r.indice });
    avisoTimer.current = setTimeout(() => { avisoTimer.current = null; setAviso(null); }, 6000);
  }

  // Enter en el buscador (o «Agregar» con algo escrito): ProductSearch ya lo comprobó en el catálogo (U7: si coincide
  // exacto, se vincula). Si lo que está escrito es el producto elegido de la lista, va ese SKU.
  function agregarEscrito(texto: string, coincidencia: any | null, info?: { sinComprobar?: boolean }) {
    if (skuId !== null && texto === nombre.trim()) { agregarAlBorrador(lineaEscrita(), origenElegido(), texto); return; }
    const linea = coincidencia ? lineaDesdeCatalogo(coincidencia) : lineaTextoLibre(texto);
    agregarAlBorrador({ ...linea, qty: cantidadValida(qty) },
      coincidencia ? 'catalogo' : info?.sinComprobar ? 'texto-sin-comprobar' : 'texto', texto);
  }

  // «Agregar» (debajo, junto a la cantidad): el producto elegido de la lista entra tal cual; lo escrito, igual que con
  // Enter (se comprueba en el catálogo antes de agregarlo).
  function agregar() {
    const texto = nombre.trim();
    if (!texto) return;
    if (skuId !== null) { agregarAlBorrador(lineaEscrita(), origenElegido(), texto); return; }
    agregarRef.current?.();
  }

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      // Lo que quedo escrito sin pulsar "Agregar" tambien se guarda (igual que al crear la SC), con su SKU si se eligio
      // del catalogo y la cantidad escrita (ruling 1 de T8B: lineaEscrita); lineasParaEnviar solo quita las claves '_'
      // y normaliza las cantidades.
      const lineas = lineasParaEnviar(nombre.trim() ? [...borradorRef.current, lineaEscrita()] : borradorRef.current, '');
      const r = await apiFetch(`/ventas/solicitudes/${scId}`, {
        method: 'PATCH',
        body: JSON.stringify({ productos: lineas, updated_by: currentUser }),
      });
      // H29: el editor se cierra al terminar el PATCH (sin esperar la recarga de la pagina).
      setEditando(false);
      onGuardado(r?.data);
    } catch (e) {
      setError(textoDeError(e, 'No se pudieron guardar los productos'));
    }
    setGuardando(false);
  }

  return (
    <div>
      {/* U13: tarjeta propia, justo debajo del cliente. El editor y el aviso sin productos van dentro (el bloque no salta
          de tamaño) y el motivo del bloqueo, debajo. El ancla la usa abrirEditorProductos de la página. Sin
          overflow-hidden (T8A ronda 1): recortaba el desplegable del buscador del editor. */}
      <div id="productos-solicitud" className="scroll-mt-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
        <p className="text-sm font-black text-slate-800">
          Productos a cotizar <span className="font-bold text-slate-400">({lista.length})</span>
        </p>
        {editable && !editando && lista.length > 0 && (
          <button type="button" onClick={() => setEditando(true)} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">
            <Edit2 size={12} /> Editar productos
          </button>
        )}
      </div>

      {/* El editor solo mientras se puede editar: si la SC se cancela o recibe una cotización con el editor abierto, se ve
          la lista guardada (T8A ronda 1). */}
      {editando && editable ? (
        <div className="m-4 border border-indigo-200 bg-indigo-50/40 rounded-xl p-3 space-y-3">
          {/* H25 (C2): la misma lista del formulario de nueva solicitud, en tono neutro: nombre completo, Catálogo o Texto
              libre, cantidad editable (−/+) y quitar. Al quitar una línea se quita el aviso (el resaltado cambiaría de
              producto). */}
          <LineasProducto tono="neutro" lineas={borrador} resaltada={aviso?.indice ?? null}
            onChange={l => { if (l.length !== borradorRef.current.length) quitarAviso(); cambiarBorrador(l); }} />

          {/* H25: el buscador en su propia línea, a todo el ancho (su lista y el aviso de «no está en el catálogo» también),
              y debajo la cantidad y «Agregar». Enter en el buscador agrega lo escrito, comprobado en el catálogo (U7). */}
          <div className="space-y-2">
            <ProductSearch
              value={nombre}
              onChange={v => { setNombre(v); setSkuId(null); setCreado(null); }}
              onSelect={(p, info) => { setNombre(nombreLinea(p)); setSkuId(p?.id ?? null); setCreado(info ? info.creado : null); }}
              onAgregarTexto={agregarEscrito}
              inputRef={buscadorRef}
              agregarRef={agregarRef}
            />
            <div className="flex items-center gap-2">
              <label htmlFor={cantidadId} className="text-xs font-bold text-slate-500">Cantidad</label>
              <input
                id={cantidadId} type="number" min={1} step={1} value={qty}
                onChange={e => setQty(e.target.value === '' ? '' : cantidadValida(e.target.value))}
                onBlur={() => setQty(q => cantidadValida(q))}
                className="w-20 border border-slate-200 rounded-xl px-2 py-2 text-sm text-center font-bold outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <Button variant="secondary" size="sm" icon={Plus} disabled={!nombre.trim()} onClick={agregar}>Agregar</Button>
            </div>
            <div role="status" aria-live="polite">
              {aviso?.texto && <p className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 break-words">{aviso.texto}</p>}
            </div>
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
        // U13: nombre completo (nunca cortado), si es del catálogo o texto libre, y la cantidad en grande.
        <table className="w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-[11px] text-slate-400 uppercase font-black">
            <tr>
              <th className="w-10 px-4 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="w-28 px-4 py-2 text-right">Cantidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.map((p, i) => (
              <tr key={i}>
                <td className="px-4 py-3 align-top font-bold text-slate-400">{i + 1}</td>
                <td className="px-3 py-3 align-top">
                  <p className="text-[15px] font-semibold text-slate-800 break-words">{nombreLinea(p)}</p>
                  <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${p.sku_id ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {p.sku_id ? 'Catálogo' : 'Texto libre'}
                  </span>
                </td>
                <td className="px-4 py-3 align-top text-right text-lg font-black text-slate-800 tabular-nums">{p.qty ?? 1}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : editable ? (
        <div className="m-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="flex items-start gap-2 text-sm font-bold text-amber-800">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> Esta solicitud no tiene productos
          </p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            Sin productos no hay nada que el cliente pueda confirmar ni que cotizar. Agrégalos para poder enviarla al cliente y crear la cotización.
          </p>
          <div className="mt-3">
            <Button color="amber" size="sm" icon={Plus} onClick={() => setEditando(true)}>Agregar productos</Button>
          </div>
        </div>
      ) : (
        // U18+H31: si no se puede editar (cancelada o con cotización activa) no se pide agregarlos: texto neutro y, debajo
        // de la tarjeta, el motivo del bloqueo.
        <p className="px-4 py-3 text-sm text-slate-400">Sin productos.</p>
      )}
      </div>

      {!editable && motivoBloqueo && <p className="text-[11px] text-slate-400 mt-1.5">{motivoBloqueo}</p>}
    </div>
  );
}
