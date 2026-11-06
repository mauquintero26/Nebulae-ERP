'use client';

import { useRef } from 'react';
import { ShoppingCart } from 'lucide-react';
import { SubNav, PageHeader, FranjaKpis, TarjetaKpi } from '@/components/ui';
import { BarraTabla, TablaEstandar, usePreferenciasTabla } from '@/components/tabla';
import { BannerFlujo } from '@/components/flujo';
import { TABLE } from '@/lib/design-system';
import { estadoTablaInicial } from '@/lib/tabla';
import { pasosDePedidos, textoRegla } from '@/lib/flujo-ventas';
import { opcionesEstadosPedidos } from '@/lib/kanban-ventas';
import { VEN_NAV } from '../ven-nav';
import {
  AccionesCabecera, COLUMNAS_TABLA_PEDIDOS, CONTENEDOR_LISTA, ID_PEDIDOS, INICIAL_PEDIDOS, pestanasDeLaLista,
} from './venta-client';

/**
 * B4 T10 (el patrón de CargandoSolicitudes de T8 r1 y CargandoCotizaciones de T9 r1): el esqueleto de la lista de
 * Pedidos de venta, sin datos. Lo muestra el fallback del Suspense de venta/page.tsx (antes un «Cargando...» centrado en
 * h-screen, que saltaba al llegar la lista). Tiene la geometría de la lista mientras carga, con sus MISMAS piezas:
 *  - la barra de submódulos;
 *  - la franja del flujo cargando (las 5 cajas con «Estás aquí» en Pedido de venta);
 *  - el contenedor de la lista (CONTENEDOR_LISTA);
 *  - la cabecera con sus botones, invisibles;
 *  - las 4 tarjetas con sus barras grises (la del total, activa: la vista inicial es Todos);
 *  - la barra y la tabla estándar con sus 8 renglones grises y el pie «Cargando…».
 * Todo va inerte (inert): nada se puede tocar mientras carga. El aviso de la carga va aparte, en una región viva solo
 * para el lector de pantalla. Es un componente de cliente (usa las piezas de la lista); el page.tsx del servidor lo pinta
 * igual como fallback.
 */
const ESTADO_CARGANDO = estadoTablaInicial(INICIAL_PEDIDOS);
const PESTANAS_CARGANDO = pestanasDeLaLista(null);
const SIN_FILAS: never[] = [];
const nada = () => {};

export function CargandoPedidos() {
  const prefs = usePreferenciasTabla(ID_PEDIDOS, COLUMNAS_TABLA_PEDIDOS);
  const anchoTablaRef = useRef<number | null>(null);
  return (
    <div className="w-full bg-slate-50 min-h-full flex flex-col">
      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas/venta" color="indigo" hub={{ href: '/dashboard/ventas' }} />
      <div inert>
        <BannerFlujo
          titulo="Flujo comercial"
          idPreferencia={ID_PEDIDOS}
          regla={textoRegla(undefined)}
          semaforo={{ atrasados: null, filtro: 'todos', onFiltrar: nada }}
          pasos={pasosDePedidos(null, INICIAL_PEDIDOS.vista)}
          cargando
          onSeleccionarPaso={nada}
        />
      </div>
      <div className={CONTENEDOR_LISTA}>
        {/* Lo inerte no llega al lector de pantalla: el aviso de la carga va aparte (fuera del flujo, no mueve nada). */}
        <p role="status" className="sr-only">Cargando los pedidos de venta…</p>
        <PageHeader
          icon={ShoppingCart} color="indigo"
          title="Pedidos de Venta"
          subtitle="Pedidos confirmados por tus clientes"
          actions={<div inert className="invisible"><AccionesCabecera onActualizar={nada} actualizando={false} /></div>} />
        <div inert>
          <FranjaKpis estado="cargando" titulo="Pedidos de venta">
            <TarjetaKpi kpi="pven_total" valor={null} activo onClick={nada} />
            <TarjetaKpi kpi="pven_monto_vendido" valor={null} />
            <TarjetaKpi kpi="pven_pendiente_compra" valor={null} onClick={nada} />
            <TarjetaKpi kpi="pven_saldo_por_cobrar" valor={null} variacion={{ actual: null, anterior: null, es_foto: true }} />
          </FranjaKpis>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <section inert className={TABLE.tarjeta}>
            <BarraTabla
              estado={ESTADO_CARGANDO}
              onEstado={nada}
              pestanas={PESTANAS_CARGANDO}
              estadoConteos="cargando"
              placeholder="Buscar por número, cliente, asesor, solicitud, cotización o producto…"
              opcionesEstados={opcionesEstadosPedidos}
              ajustes={{ columnas: COLUMNAS_TABLA_PEDIDOS, preferencias: prefs, anchoRef: anchoTablaRef }}
              kanbanDisponible
              pantallaCompleta={{ completa: false, alternar: nada }}
              total={null}
              estadoTotal="cargando"
            />
            <TablaEstandar
              id={ID_PEDIDOS}
              modo="servidor"
              columnas={COLUMNAS_TABLA_PEDIDOS}
              preferencias={prefs}
              anchoRef={anchoTablaRef}
              estado={ESTADO_CARGANDO}
              onEstado={nada}
              filas={SIN_FILAS}
              total={null}
              cargando
              seleccion={SIN_FILAS}
              onSeleccion={nada}
              etiqueta="Pedidos de venta"
            />
          </section>
        </div>
      </div>
    </div>
  );
}
