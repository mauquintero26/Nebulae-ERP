import { SubNav } from '@/components/ui/SubNav';
import { LOADING } from '@/lib/design-system';
import { VEN_NAV } from '../ven-nav';

/**
 * H9: esqueleto liviano, sin datos, de la lista de solicitudes: la barra de submódulos (la real), la barra del título,
 * dos filas grises y el spinner «Cargando…». Lo muestran loading.tsx (apenas empieza la navegación), el fallback del
 * Suspense de solicitud/page.tsx y /solicitud/nueva (enlaces viejos). El detalle /solicitud/[id] tiene su propia carga.
 * Sin hooks ni 'use client': sirve en el servidor (loading.tsx, page.tsx) y en el cliente (nueva/page.tsx).
 * T9B r1: la misma geometría de la lista (SubNav, contenedor p-8 y PageHeader), así al llegar la página no salta nada.
 */
export function CargandoSolicitudes() {
  return (
    <div className="w-full bg-slate-50 min-h-full">
      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas/solicitud" color="indigo" hub={{ href: '/dashboard/ventas' }} />
      <div className="p-8 max-w-[1600px] mx-auto space-y-8">
        {/* PageHeader: ícono (p-2 + 24 px = h-10), título text-3xl (h-9) y subtítulo text-sm con mt-2. */}
        <div aria-hidden="true">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-200 animate-pulse" />
            <div className="h-9 w-72 max-w-full rounded-lg bg-slate-200 animate-pulse" />
          </div>
          <div className="mt-2 h-5 w-96 max-w-full rounded-lg bg-slate-200/70 animate-pulse" />
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
        {/* Región viva montada desde el primer render. */}
        <div role="status" aria-live="polite" className={`${LOADING.wrapper} gap-3 text-sm font-medium text-slate-500`}>
          <div aria-hidden="true" className={LOADING.spinner} />
          Cargando…
        </div>
      </div>
    </div>
  );
}
