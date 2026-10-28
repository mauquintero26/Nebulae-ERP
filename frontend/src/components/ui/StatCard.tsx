'use client';
import { AccentColor } from './colors';
import { TarjetaKpi } from './TarjetaKpi';

/**
 * @deprecated Usa TarjetaKpi (con kpi='…' de CATALOGO_KPI, lib/kpis.js) dentro de FranjaKpis.
 * Bloque 4, T4A (R12 y C13): adaptador de TarjetaKpi con la firma de siempre, para que compilen y tomen el tamaño
 * nuevo las pantallas que todavía no se migran.
 *  - label -> etiqueta; value -> valor con formato 'texto' (se ve tal como lo arma la pantalla); hint -> ayuda;
 *    color -> color; onClick -> onClick (la tarjeta pasa a ser un botón).
 *  - tone 'success' / 'danger' -> tono 'bien' / 'alerta', con el ícono en verde o rojo como antes.
 *  - cargando -> estado 'cargando': barras grises en lugar del valor y sin hint (H6).
 *  - variant='gradient' se ignora: ya no hay tarjetas con fondo de color.
 */
export function StatCard({
  icon, label, value, hint, color = 'amber', tone, onClick, cargando,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: React.ReactNode;
  hint?: string;
  color?: AccentColor;
  tone?: 'success' | 'danger';
  onClick?: () => void;
  /** Se ignora: ya no hay tarjetas con fondo de color. */
  variant?: 'default' | 'gradient';
  /** true mientras carga (estado 'cargando' de TarjetaKpi). */
  cargando?: boolean;
}) {
  return (
    <TarjetaKpi
      icono={icon}
      etiqueta={label}
      valor={value}
      formato="texto"
      ayuda={hint}
      color={tone === 'success' ? 'emerald' : tone === 'danger' ? 'rose' : color}
      tono={tone === 'success' ? 'bien' : tone === 'danger' ? 'alerta' : 'normal'}
      onClick={onClick}
      estado={cargando ? 'cargando' : undefined}
    />
  );
}
