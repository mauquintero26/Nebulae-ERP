'use client';

import { useRef } from 'react';
import { FileText } from 'lucide-react';
import { SubNav, PageHeader, FranjaKpis, TarjetaKpi } from '@/components/ui';
import { BarraTabla, TablaEstandar, usePreferenciasTabla } from '@/components/tabla';
import { BannerFlujo } from '@/components/flujo';
import { TABLE } from '@/lib/design-system';
import { estadoTablaInicial } from '@/lib/tabla';
import { pasosDeLista, textoRegla } from '@/lib/flujo-ventas';
import { opcionesEstadosSolicitudes } from '@/lib/kanban-ventas';
import { VEN_NAV } from '../ven-nav';
import {
  AccionesCabecera, COLUMNAS_TABLA_SC, CONTENEDOR_LISTA, ID_SC, INICIAL_SC, pestanasDeLaLista,
} from './solicitud-client';

/**
 * H9: el esqueleto de la lista de solicitudes, sin datos. Lo muestran el fallback del Suspense de solicitud/page.tsx y
 * /solicitud/nueva (enlaces viejos, mientras redirige a la lista). Revisión final (F6): ya no solicitud/loading.tsx, que
 * también envuelve al detalle /solicitud/[id] y por eso es una carga neutra.
 * B4 T8 r1 (A2): la geometría nueva de la lista, con las MISMAS piezas que su esqueleto (así, al llegar la lista, no
 * salta nada):
 *  - la barra de submódulos;
 *  - la franja del flujo cargando (las 5 cajas con «Estás aquí» en Solicitud);
 *  - el contenedor de la lista (CONTENEDOR_LISTA);
 *  - la cabecera con sus botones, invisibles;
 *  - las 4 tarjetas con sus barras grises;
 *  - la barra y la tabla estándar con sus 8 renglones grises y el pie «Cargando…».
 * Todo va inerte (inert): nada se puede tocar mientras carga. Es un componente de cliente (usa las piezas de la lista); el
 * page.tsx del servidor lo pinta igual como fallback.
 */
const ESTADO_CARGANDO = estadoTablaInicial(INICIAL_SC);
const PESTANAS_CARGANDO = pestanasDeLaLista(null);
const SIN_FILAS: never[] = [];
const nada = () => {};

export function CargandoSolicitudes() {
  const prefs = usePreferenciasTabla(ID_SC, COLUMNAS_TABLA_SC);
  const anchoTablaRef = useRef<number | null>(null);
  return (
    <div className="w-full bg-slate-50 min-h-full flex flex-col">
      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas/solicitud" color="indigo" hub={{ href: '/dashboard/ventas' }} />
      <div inert>
        <BannerFlujo
          titulo="Flujo comercial"
          idPreferencia={ID_SC}
          regla={textoRegla(undefined)}
          semaforo={{ atrasados: null, filtro: 'todos', onFiltrar: nada }}
          pasos={pasosDeLista(null, 'SC')}
          cargando
        />
      </div>
      <div className={CONTENEDOR_LISTA}>
        {/* Lo inerte no llega al lector de pantalla: el aviso de la carga va aparte (fuera del flujo, no mueve nada). */}
        <p role="status" className="sr-only">Cargando las solicitudes…</p>
        <PageHeader
          icon={FileText} color="indigo"
          title="Solicitudes de Cliente"
          subtitle="Lo que te piden los clientes, antes de cotizar."
          actions={<div inert className="invisible"><AccionesCabecera onActualizar={nada} actualizando={false} onNueva={nada} /></div>} />
        <div inert>
          <FranjaKpis estado="cargando" titulo="Solicitudes">
            <TarjetaKpi kpi="sc_activas" valor={null} activo onClick={nada} />
            <TarjetaKpi kpi="sc_confirmadas" valor={null} onClick={nada} />
            <TarjetaKpi kpi="sc_canceladas" valor={null} onClick={nada} />
            <TarjetaKpi kpi="sc_total" valor={null} />
          </FranjaKpis>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <section inert className={TABLE.tarjeta}>
            <BarraTabla
              estado={ESTADO_CARGANDO}
              onEstado={nada}
              pestanas={PESTANAS_CARGANDO}
              estadoConteos="cargando"
              placeholder="Buscar por número, cliente, asesor o producto…"
              opcionesEstados={opcionesEstadosSolicitudes}
              ajustes={{ columnas: COLUMNAS_TABLA_SC, preferencias: prefs, anchoRef: anchoTablaRef }}
              kanbanDisponible
              pantallaCompleta={{ completa: false, alternar: nada }}
              total={null}
              estadoTotal="cargando"
            />
            <TablaEstandar
              id={ID_SC}
              modo="servidor"
              columnas={COLUMNAS_TABLA_SC}
              preferencias={prefs}
              anchoRef={anchoTablaRef}
              estado={ESTADO_CARGANDO}
              onEstado={nada}
              filas={SIN_FILAS}
              total={null}
              cargando
              seleccion={SIN_FILAS}
              onSeleccion={nada}
              etiqueta="Solicitudes de cliente"
            />
          </section>
        </div>
      </div>
    </div>
  );
}
