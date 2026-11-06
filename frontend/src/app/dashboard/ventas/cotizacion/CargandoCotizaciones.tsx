'use client';

import { useRef } from 'react';
import { FileText } from 'lucide-react';
import { SubNav, PageHeader, FranjaKpis, TarjetaKpi } from '@/components/ui';
import { BarraTabla, TablaEstandar, usePreferenciasTabla } from '@/components/tabla';
import { BannerFlujo } from '@/components/flujo';
import { TABLE } from '@/lib/design-system';
import { estadoTablaInicial } from '@/lib/tabla';
import { pasosDeLista, textoRegla } from '@/lib/flujo-ventas';
import { opcionesEstadosCotizaciones } from '@/lib/kanban-ventas';
import { VEN_NAV } from '../ven-nav';
import {
  AccionesCabecera, COLUMNAS_TABLA_COT, CONTENEDOR_LISTA, ID_COT, INICIAL_COT, pestanasDeLaLista,
} from './cotizacion-client';

/**
 * B4 T9 r1 (A2, el patrón de CargandoSolicitudes de T8 r1): el esqueleto de la lista de Cotizaciones, sin datos. Lo
 * muestra el fallback del Suspense de cotizacion/page.tsx (antes un «Cargando...» centrado en h-screen, que saltaba al
 * llegar la lista). Tiene la geometría de la lista mientras carga, con sus MISMAS piezas:
 *  - la barra de submódulos;
 *  - la franja del flujo cargando (las 5 cajas con «Estás aquí» en Cotización), con el renglón de sus avisos reservado
 *    (reservarAvisos, m6 de r1: la lista también lo reserva hasta que responde);
 *  - el contenedor de la lista (CONTENEDOR_LISTA);
 *  - la cabecera con sus botones, invisibles;
 *  - las 4 tarjetas con sus barras grises;
 *  - la barra y la tabla estándar con sus 8 renglones grises y el pie «Cargando…».
 * Todo va inerte (inert): nada se puede tocar mientras carga. Es un componente de cliente (usa las piezas de la lista); el
 * page.tsx del servidor lo pinta igual como fallback.
 */
const ESTADO_CARGANDO = estadoTablaInicial(INICIAL_COT);
const PESTANAS_CARGANDO = pestanasDeLaLista(null);
const SIN_FILAS: never[] = [];
const nada = () => {};

export function CargandoCotizaciones() {
  const prefs = usePreferenciasTabla(ID_COT, COLUMNAS_TABLA_COT);
  const anchoTablaRef = useRef<number | null>(null);
  return (
    <div className="w-full bg-slate-50 min-h-full flex flex-col">
      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas/cotizacion" color="amber" hub={{ href: '/dashboard/ventas' }} />
      <div inert>
        <BannerFlujo
          titulo="Flujo comercial"
          idPreferencia={ID_COT}
          regla={textoRegla(undefined)}
          semaforo={{ atrasados: null, filtro: 'todos', onFiltrar: nada }}
          pasos={pasosDeLista(null, 'COT')}
          reservarAvisos
          cargando
        />
      </div>
      <div className={CONTENEDOR_LISTA}>
        {/* Lo inerte no llega al lector de pantalla: el aviso de la carga va aparte (fuera del flujo, no mueve nada). */}
        <p role="status" className="sr-only">Cargando las cotizaciones…</p>
        <PageHeader
          icon={FileText} color="amber"
          title="Cotizaciones"
          subtitle="Precios y anticipo para el cliente; al confirmar se crea el pedido."
          actions={<div inert className="invisible"><AccionesCabecera onActualizar={nada} actualizando={false} /></div>} />
        <div inert>
          <FranjaKpis estado="cargando" titulo="Cotizaciones">
            <TarjetaKpi kpi="cot_activas" valor={null} activo onClick={nada} />
            <TarjetaKpi kpi="cot_confirmadas" valor={null} onClick={nada} />
            <TarjetaKpi kpi="cot_monto_confirmado" valor={null} onClick={nada} />
            <TarjetaKpi kpi="cot_total" valor={null} />
          </FranjaKpis>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <section inert className={TABLE.tarjeta}>
            <BarraTabla
              estado={ESTADO_CARGANDO}
              onEstado={nada}
              pestanas={PESTANAS_CARGANDO}
              estadoConteos="cargando"
              placeholder="Buscar por número, cliente, cotizador, solicitud, pedido o producto…"
              opcionesEstados={opcionesEstadosCotizaciones}
              ajustes={{ columnas: COLUMNAS_TABLA_COT, preferencias: prefs, anchoRef: anchoTablaRef }}
              kanbanDisponible
              pantallaCompleta={{ completa: false, alternar: nada }}
              total={null}
              estadoTotal="cargando"
            />
            <TablaEstandar
              id={ID_COT}
              modo="servidor"
              columnas={COLUMNAS_TABLA_COT}
              preferencias={prefs}
              anchoRef={anchoTablaRef}
              estado={ESTADO_CARGANDO}
              onEstado={nada}
              filas={SIN_FILAS}
              total={null}
              cargando
              etiqueta="Cotizaciones"
            />
          </section>
        </div>
      </div>
    </div>
  );
}
