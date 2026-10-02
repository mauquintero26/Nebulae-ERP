'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';

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
        const raw = await apiFetch(`/confirmar/${token}`);
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
      await apiFetch(`/confirmar/${token}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `confirm-${token.slice(0, 16)}` },
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center max-w-md mx-auto">
      <h1 className="text-xl font-black text-slate-800">{data?.numero}</h1>
      <p className="text-slate-600">{data?.customer_name}</p>
      <button onClick={confirmar} disabled={confirming}
        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl">
        {confirming ? 'Confirmando...' : 'Confirmar'}
      </button>
    </div>
  );
}
