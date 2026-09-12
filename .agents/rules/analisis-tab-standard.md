---
trigger: always_on
---

# Estándar Canónico: Tab de Análisis en Nebulae ERP

Toda pestaña u opción de **Análisis** en cualquier módulo o sub-módulo del ERP Nebulae (Ventas, Solicitudes, Cotizaciones, Pedidos, Compras, Inventario, CRM, etc.) DEBE implementar la estructura canónica homologada en `solicitud-client.tsx`.

No está permitido utilizar librerías externas de gráficos pesadas (como Chart.js o Recharts) si comprometen el bundle o generan inconsistencia visual; los gráficos deben ser **SVG nativos responsivos y puros** de React/Tailwind, siguiendo este patrón de renderizado.

---

## Estructura Jerárquica del Tab

```tsx
{activeTab === 'Analisis' && (
  <div className="p-6 space-y-8">
    {/* 1. FILA DE KPIS ANALÍTICOS (4 TARJETAS CON GRADIENTE) */}
    {/* 2. GRILLA DE GRÁFICAS: TENDENCIA TEMPORAL (LÍNEAS) + DISTRIBUCIÓN (DONUT) */}
    {/* 3. DISTRIBUCIÓN CATEGÓRICA (BARRAS DE PROGRESO) */}
    {/* 4. RANKING DE TOP ENTIDADES CON SELECTOR (TOP 5, 10, 20, 50) */}
    {/* 5. ASISTENTE IA EN VIVO (CARD DARK GRADIENT CON PROMPTS + CHAT) */}
  </div>
)}
```

---

## 1. Fila de KPIs Analíticos (4 Tarjetas con Gradiente Sutil)

Se ubica al inicio del tab con un grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5`:

| Posición | Propósito | Gradiente / Borde | Ícono | Formato del Valor |
| :--- | :--- | :--- | :--- | :--- |
| **KPI 1** | **Efectividad / Conversión Principal** | `from-indigo-50 to-white border-indigo-100` | `<TrendingUp size={16}/>` | Porcentaje (`XX.X%`) + Subtítulo de ratio |
| **KPI 2** | **Volumen Activo / En Proceso** | `from-amber-50 to-white border-amber-100` | `<Clock size={16}/>` | Entero grande + Alerta condicional de estancamiento |
| **KPI 3** | **Tasa de Excepciones / Descarte** | `from-rose-50 to-white border-rose-100` | `<AlertTriangle size={16}/>` | Entero grande + Porcentaje de descarte global |
| **KPI 4** | **Volumen Total Acumulado** | `from-emerald-50 to-white border-emerald-100` | `<CheckCircle2 size={16}/>` | Total histórico + Leyenda descriptiva del módulo |

### Patrón de Código de Tarjeta KPI:
```tsx
<div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl p-5 border border-indigo-100 shadow-sm">
  <div className="flex items-center justify-between mb-2">
    <span className="text-xs font-black text-indigo-600 uppercase tracking-wider">{label}</span>
    <span className="p-2 rounded-xl bg-indigo-100 text-indigo-600">{icon}</span>
  </div>
  <h3 className="text-3xl font-black text-slate-900">{valor}</h3>
  <p className="text-xs text-slate-500 font-semibold mt-1">{subtitulo}</p>
</div>
```

---

## 2. Diagrama de Líneas: Tendencia Temporal (SVG Nativo)

- **Layout:** Contenedor de 2 columnas (`lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between`).
- **Vector:** `viewBox="0 0 600 180"` con `h-48 w-full select-none`.
- **Ejes & Rejilla:** Líneas horizontales discontinuas en ratios `[0, 0.5, 1]` con `stroke="#f1f5f9" strokeDasharray="4 4" strokeWidth="1"`.
- **Relleno de Área:** Gradiente `<linearGradient id="areaGrad">` de `rgba(79, 70, 229, 0.3)` a transparente.
- **Trazado:** `<polyline fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>`.
- **Nodos Interactivos:** `<circle r="5" fill="#fff" stroke="#4f46e5" strokeWidth="2.5" className="transition-all hover:scale-125"/>` con valor numérico flotante y fecha formateada en eje X (`toLocaleDateString('es-CO', {month:'short', day:'numeric'})`).

---

## 3. Diagrama Donut / Torta: Distribución con Toggle de Modos

- **Layout:** Contenedor de 1 columna (`lg:col-span-1 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between`).
- **Selector de Modo:** Botones píldora compactos en header para alternar la dimensión de análisis (ej. `[Estados] [Canceladas/Motivos]`).
- **Vector:** `viewBox="0 0 42 42"` con `className="w-36 h-36 transform -rotate-90"`.
  - Base de fondo: `<circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#f1f5f9" strokeWidth="5"/>`.
  - Segmentos: Cálculo acumulativo de `strokeDasharray="${pct} ${100 - pct}"` y `strokeDashoffset={-accumulatedPercent}`.
- **Centro del Donut:** Contador numérico total (`text-xl font-black text-slate-800`) con subtítulo `TOTAL` en `text-[9px] uppercase font-black text-slate-400`.
- **Leyenda Vertical:** Bullets de color (`w-2.5 h-2.5 rounded-full`), texto truncado con `title` y cálculo `{count} ({Math.round((count / sum) * 100)}%)`.

---

## 4. Diagrama de Barras Categóricas

- **Layout:** Card completa con grid responsivo `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`.
- **Items:** Tarjetas individuales en `bg-slate-50 border border-slate-100 rounded-xl p-4 hover:border-indigo-200 transition-colors`.
- **Barra de Progreso:**
  ```tsx
  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-2">
    <div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pctOfAll * 2.5, 100)}%` }}/>
  </div>
  ```
- **Métricas:** Muestra el conteo absoluto en badge superior, el `% del pipeline global` y la `tasa de éxito / conversión a siguiente fase`.

---

## 5. Ranking de Top Entidades con Selector Interactivo

- **Selector de Límite Dinámico:** Botones píldora para alternar entre **`Top 5` | `Top 10` | `Top 20` | `Top 50`**.
- **Entidad según Módulo:**
  - Ventas / Solicitudes / Cotizaciones: **Top Clientes** o **Top Asesores**.
  - Compras: **Top Proveedores**.
  - Inventario: **Top Productos**.
- **Medallas de Posición:**
  - #1: `bg-amber-100 text-amber-800` (Oro).
  - #2: `bg-slate-200 text-slate-700` (Plata).
  - #3: `bg-orange-100 text-orange-800` (Bronce).
  - #4+: `bg-slate-100 text-slate-500`.
- **Columnas Requeridas:**
  1. Posición / Medalla
  2. Nombre de la Entidad
  3. Datos de Contacto / Identificador
  4. Total Acumulado (Badge destacado `bg-indigo-50 text-indigo-700 font-black`)
  5. Desglose de Estados con micro-badges de colores
  6. Barra de Efectividad visual (`bg-emerald-500`) + Porcentaje numérico alineado a la derecha.

---

## 6. Asistente IA en Vivo (Nebulae AI Analyst Card)

- **Contenedor:**
  `bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-indigo-900/50`
- **Header:**
  - Avatar con ícono de robot (`<Bot size={22} className="text-indigo-300 animate-pulse"/>`).
  - Badge `"En Vivo"` (`bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full`).
  - Botón de reinicio de conversación (`<RotateCcw size={12}/> Limpiar`).
- **Consultas Rápidas Recomendadas (Chips):**
  - Mínimo 4 chips predeterminados específicos para las preguntas más críticas del negocio en ese módulo.
- **Ventana de Chat:**
  - `bg-black/30 rounded-2xl p-4 max-h-[360px] overflow-y-auto space-y-4 border border-white/10`.
  - Mensajes de usuario alineados a la derecha (`bg-indigo-600 text-white font-semibold`).
  - Mensajes de IA con badge distintivo, formato Markdown (listas con viñetas, negritas, emojis) y cálculo dinámico sobre el dataset en memoria.
- **Caja de Entrada:**
  - Input oscuro (`bg-white/10 border-white/20 text-white placeholder-slate-400`).
  - Botón "Preguntar" (`bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5`).

---

## Matriz de Adaptación por Sub-módulo

Al replicar este diseño en otros módulos, mantén exactamente la misma estructura y clases, adaptando únicamente las entidades de datos:

| Módulo | KPI 1 (Efectividad) | Toggle Donut | Categorías en Barras | Ranking Entidades |
| :--- | :--- | :--- | :--- | :--- |
| **Solicitudes (SC)** | % SC → COT | Estados vs Motivos Cancelación | Tipos de Solicitud | Top Clientes por Solicitudes |
| **Cotizaciones (COT)** | % COT → VEN (Aprobación) | Estados vs Motivos Rechazo | Modalidad de Pago / Tipo Entrega | Top Clientes por Monto Cotizado |
| **Pedidos de Venta (VEN)** | % Cumplimiento Entrega | Estados vs Transportadoras | Tipo de Venta / Canal | Top Clientes por Facturación |
| **Compras / Órdenes (OC)** | % Entregas a Tiempo | Estados vs Tipos de Insumo | Categorías de Proveedor | Top Proveedores por Monto / Lead Time |
| **Inventario** | % Cobertura de Stock | Categorías vs Estados Stock | Familias de Producto | Top Productos de Mayor Rotación |
| **CRM Leads** | % Lead → SC | Origen (Canal) vs Estado | Tipos de Interés | Top Asesores por Conversión |