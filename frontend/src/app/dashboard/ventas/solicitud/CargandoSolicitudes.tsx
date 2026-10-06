import { LOADING } from '@/lib/design-system';

/**
 * H9: esqueleto liviano, sin datos, de la lista de solicitudes: la barra del título, dos filas grises y el spinner
 * «Cargando…». Lo muestran loading.tsx (apenas empieza la navegación), el fallback del Suspense de solicitud/page.tsx y
 * /solicitud/nueva (enlaces viejos). El texto es genérico: loading.tsx también cubre el detalle /solicitud/[id].
 * Sin hooks ni 'use client': sirve en el servidor (loading.tsx, page.tsx) y en el cliente (nueva/page.tsx).
 */
export function CargandoSolicitudes() {
  return (
    <div className="w-full bg-slate-50 min-h-full">
      <div className="p-8 max-w-[1600px] mx-auto space-y-8">
        <div aria-hidden="true" className="flex items-center gap-4">
          <div className="h-14 w-14 shrink-0 rounded-2xl bg-slate-200 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-7 w-72 max-w-full rounded-lg bg-slate-200 animate-pulse" />
            <div className="h-4 w-96 max-w-full rounded-lg bg-slate-200/70 animate-pulse" />
          </div>
        </div>
        <div aria-hidden="true" className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {[0, 1].map((fila) => (
            <div key={fila} className="flex items-center gap-4 px-6 py-5">
              <div className="h-4 w-28 shrink-0 rounded bg-slate-200 animate-pulse" />
              <div className="h-4 flex-1 rounded bg-slate-100 animate-pulse" />
              <div className="h-4 w-20 shrink-0 rounded bg-slate-200 animate-pulse" />
            </div>
          ))}
        </div>
        <div role="status" className={`${LOADING.wrapper} gap-3 text-sm font-medium text-slate-500`}>
          <div aria-hidden="true" className={LOADING.spinner} />
          Cargando…
        </div>
      </div>
    </div>
  );
}
