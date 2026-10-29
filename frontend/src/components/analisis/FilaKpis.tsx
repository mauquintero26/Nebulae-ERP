'use client';

import { FranjaKpis, TarjetaKpi } from '@/components/ui/TarjetaKpi';
import type { IdKpi } from '@/components/ui/TarjetaKpi';
import type { AccentColor } from '@/components/ui/colors';
import { tarjetaKpiAnalisis } from '@/lib/analisis';
import type { KpiAnalisis } from '@/lib/analisis';
import type { EstadoKpi } from '@/lib/kpis';

/**
 * ANALISIS-base punto 2 (Bloque 4, T5C; R7, R12, C12, RP27 y D43): la fila de indicadores de la pestaña Análisis. Es la
 * TARJETA ESTÁNDAR (TarjetaKpi de components/ui) con su variación, dentro de FranjaKpis (D43, M2): la grilla es la de
 * clasesFranja(n) (2 columnas desde @sm y 4 desde @4xl, la misma del esqueleto); aquí no se arma otra.
 *  - Cada kpi del contrato pasa por tarjetaKpiAnalisis de lib/analisis.js: la etiqueta del servidor, el valor completo
 *    (nunca 0 si no vino: '—'), la variación contra el período anterior con la regla única de RP27 (infoVariacion dentro
 *    de TarjetaKpi: '+12,5 %', '−8 %', 'Nuevo', 'Sin cambio' o '—', con los tonos bien, mal y neutro) y, al lado,
 *    `comparado` (periodo.comparado del servidor, 'vs 5 ago – 3 sept'). La ayuda va en el title de la tarjeta. Una foto
 *    (es_foto) no lleva variación: dice 'Cifra de hoy, sin comparación'.
 *  - El ícono y el color: los de CATALOGO_KPI si la clave es un id del catálogo; si no, el ícono por formato y el color
 *    del módulo (`acento`).
 *  - `estado` llega a las tarjetas (FranjaKpis): 'cargando' las pinta como esqueleto (barras grises, nunca ceros; sin
 *    kpis todavía, `cuantas` tarjetas), 'actualizando' las atenúa.
 * Sin kpis (y sin cargar), no pinta nada. Clases de Tailwind literales, sin variantes de modo oscuro.
 */

export type PropsFilaKpis = {
  /** Los kpis del contrato (normalizarAnalisis); de 3 a 5 en cada módulo. */
  kpis: ReadonlyArray<KpiAnalisis> | null | undefined;
  /** El de FranjaKpis (por defecto 'listo'). */
  estado?: EstadoKpi;
  /** periodo.comparado del servidor ('vs 5 ago – 3 sept'), al lado de la variación. */
  comparado?: string | null;
  /** El color del módulo para las tarjetas que no están en CATALOGO_KPI. */
  acento?: AccentColor;
  /** Cuántas tarjetas esqueleto mientras carga sin kpis (por defecto 4, como EsqueletoAnalisis). */
  cuantas?: number;
};

// Sin periodo.comparado no se usa el de TarjetaKpi por defecto ('vs 30 días antes'): el período puede ser otro.
const SIN_COMPARADO = 'vs período anterior';

export function FilaKpis({ kpis, estado = 'listo', comparado, acento, cuantas = 4 }: PropsFilaKpis) {
  const lista = kpis ?? [];
  if (!lista.length) {
    if (estado !== 'cargando') return null;
    const n = Math.min(6, Math.max(1, Math.trunc(cuantas) || 4));
    return (
      <FranjaKpis estado="cargando" titulo="Indicadores del período">
        {Array.from({ length: n }, (_, i) => <TarjetaKpi key={i} etiqueta="" valor={null} color={acento} />)}
      </FranjaKpis>
    );
  }
  return (
    <FranjaKpis estado={estado} titulo="Indicadores del período">
      {lista.map((k, i) => {
        const t = tarjetaKpiAnalisis(k);
        return (
          <TarjetaKpi
            key={`${t.clave}-${i}`}
            kpi={(t.kpi ?? undefined) as IdKpi | undefined}
            etiqueta={t.etiqueta}
            icono={t.icono ?? undefined}
            color={t.kpi ? undefined : acento}
            formato={t.formato}
            valor={t.valor}
            variacion={t.variacion}
            textoPeriodo={comparado || SIN_COMPARADO}
            ayuda={t.ayuda ?? undefined}
            titulo={t.titulo ?? undefined}
          />
        );
      })}
    </FranjaKpis>
  );
}
