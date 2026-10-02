'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';

const fCOP = (v: any) => { const n = Number(v) || 0; return n > 0 ? '$' + n.toLocaleString('es-CO') : '$0'; };
const fDate = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

export default function ConfirmarPublicoPage() {
  const params = useParams();
  const token = String(params.token || '');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Round 7: el token va en el body JSON, nunca en la URL de la API (la URL de
        // ESTA pagina si lo lleva -- params.token, inevitable, igual que
        // /reset-password?token= -- lo que cambia es solo como esta pagina habla con
        // el backend, para que un access log de uvicorn nunca vea el token crudo).
        const raw = await apiFetch(`/confirmar/ver`, {
          method: 'POST',
          body: JSON.stringify({ token }),
        });
        setData(raw?.data ?? raw);
      } catch (err: any) {
        setError(err.message || 'El enlace no es válido o ya expiró.');
      }
      setLoading(false);
    })();
  }, [token]);

  async function confirmar() {
    setConfirming(true);
    try {
      await apiFetch(`/confirmar/confirmar`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `confirm-${token.slice(0, 16)}` },
        body: JSON.stringify({ token }),
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'El enlace no es válido o ya expiró.');
    }
    setConfirming(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><RefreshCw className="animate-spin text-indigo-600" size={32} /></div>;
  if (error) return <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center"><AlertCircle className="text-rose-500" size={40} /><p className="text-slate-600 font-medium">{error}</p></div>;
  if (done) return <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center"><CheckCircle2 className="text-emerald-500" size={40} /><p className="text-slate-800 font-bold text-lg">¡Gracias! Tu confirmación fue registrada.</p></div>;

  // Hallazgo #4 (adversarial review): antes esta pagina solo mostraba el numero y el
  // nombre del cliente -- nunca el precio que se le pedia confirmar. /confirmar/ver ya
  // devuelve productos/total_cop/fecha_entrega_estimada (para SC y COT); esta pagina
  // simplemente no los renderizaba. Todo es condicional a que el campo venga presente
  // en la respuesta -- SC hoy no trae total_cop (no tiene un campo agregado propio),
  // asi que esa seccion simplemente no se muestra para SC, sin necesidad de ramificar
  // por tipo de documento.
  const productos = Array.isArray(data?.productos) ? data.productos : [];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center max-w-md mx-auto">
      <h1 className="text-xl font-black text-slate-800">{data?.numero}</h1>
      <p className="text-slate-600">{data?.customer_name}</p>

      {productos.length > 0 && (
        <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-left">
          <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos</p>
          <div className="space-y-1.5">
            {productos.map((p: any, i: number) => (
              <div key={i} className="flex justify-between gap-3 text-sm text-slate-700">
                <span className="truncate">{p.product_name}{p.qty ? ` × ${p.qty}` : ''}</span>
                {/* Round 3 (adversarial review, hallazgo #4): los productos de una
                    Solicitud (SC, Gate 1) genuinamente no tienen precio por linea todavia
                    (unit_price_cop viene en 0 por diseno -- el precio recien existe cuando
                    se crea la Cotizacion) -- mostrar "$0" junto a cada producto en esa
                    pagina se veia como un error. Se omite el precio cuando no es > 0, en
                    vez de ramificar esta pagina por tipo de documento. */}
                {Number(p.unit_price_cop) > 0 && (
                  <span className="font-bold shrink-0">{fCOP(p.unit_price_cop)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!!data?.total_cop && (
        <div className="w-full flex justify-between items-center bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
          <span className="text-sm font-bold text-indigo-700">Total</span>
          <span className="text-lg font-black text-indigo-800">{fCOP(data.total_cop)}</span>
        </div>
      )}

      {data?.fecha_entrega_estimada && (
        <p className="text-xs text-slate-500">Entrega estimada: {fDate(data.fecha_entrega_estimada)}</p>
      )}

      <button onClick={confirmar} disabled={confirming}
        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl">
        {confirming ? 'Confirmando...' : 'Confirmar'}
      </button>
    </div>
  );
}
