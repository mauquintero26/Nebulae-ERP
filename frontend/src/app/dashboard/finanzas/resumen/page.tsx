"use client";

import { Activity } from 'lucide-react';
import { SubNav, PageHeader } from '@/components/ui';
import { PanelAnalisisPerezoso } from '@/components/analisis';
import { FIN_NAV } from '../fin-nav';

// B4 T22 (ANALISIS-finanzas puntos 3 y 4; R2, R13, R16, R17, RP69): el Resumen de Finanzas con la pestaña Análisis estándar y
// los datos reales de GET /finance/analisis (solo ADMIN y FINANZAS: a un rol sin permiso el panel le dice «No tienes permiso
// para ver este análisis.»). Se fueron la cascada de cifras en dólares, los gráficos de ejemplo y las alertas fijas del «CFO
// Virtual»: este queda como la tarjeta del asistente que pinta el panel (sin respuestas). chart.js solo entra por el panel.

/** RP69: el asistente de Finanzas es «CFO Virtual» (con V mayúscula, como lo vio el usuario). */
const ASISTENTE_FINANZAS = {
  titulo: 'CFO Virtual',
  ejemplos: ['¿Cuánto gasté este mes por categoría?', '¿Qué clientes me deben más?'],
};

export default function ResumenFinancieroPage() {
  return (
    <div className="w-full h-full overflow-y-auto animate-in fade-in duration-500 custom-scrollbar bg-slate-50">
      <SubNav label="Finanzas" items={FIN_NAV} currentPath="/dashboard/finanzas/resumen" color="blue" />

      {/* pb-24 deja libre, con la página al fondo, la esquina del botón flotante de la IA (T7 r1b). */}
      <div className="px-4 xl:px-8 pt-6 pb-24 max-w-[1600px] mx-auto w-full min-w-0 space-y-6">
        <PageHeader icon={Activity} color="blue"
          title="Dashboard P&L (Pérdidas y Ganancias)"
          subtitle="Ventas, dinero recibido, gastos y utilidad estimada del período, con datos reales." />

        <PanelAnalisisPerezoso
          modulo="finanzas"
          endpoint="/finance/analisis"
          acento="blue"
          mejorLinea="sube"
          asistente={ASISTENTE_FINANZAS}
        />
      </div>
    </div>
  );
}
