'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

export function AlertasBadge() {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await apiFetch('/ventas/alertas/resumen');
        if (mounted) setCount(res?.data?.atrasados ?? 0);
      } catch {}
    }
    load();
    const interval = setInterval(load, 5 * 60 * 1000);  // cada 5 minutos
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (count === 0) return null;

  return (
    <button
      onClick={() => router.push('/dashboard/ventas')}
      className="fixed top-4 right-20 z-50 flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-2 rounded-full shadow-lg transition-colors"
      title="Documentos atrasados sin atender"
    >
      <AlertTriangle size={14} /> {count} atrasado{count !== 1 ? 's' : ''}
    </button>
  );
}
