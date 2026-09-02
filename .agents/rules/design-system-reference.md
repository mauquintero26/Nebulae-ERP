---
trigger: always_on
---

# Sistema de Diseño Nebulae ERP

## Archivo base de estilos
`frontend/src/lib/design-system.ts`

Toda modificación visual DEBE importar desde este archivo en lugar de escribir clases Tailwind a mano.

```typescript
import { BTN, TABLE, KPI_CARD, DETAIL_PANEL, TABS_BAR, getEstadoClass, fCOP, fDate } from '@/lib/design-system';
```

---

## Estructura de página estándar (obligatoria)

Toda página del dashboard sigue esta estructura de secciones en orden:

```
1. Sub-module nav  (sticky top, z-30)
2. Alert banner    (solo si hay alertas — bg-red-50)
3. Page header     (bg-white, border-b, px-8 py-6)
   ├── Ícono del módulo  (p-3 rounded-2xl, bg-{color}-50 text-{color}-600)
   ├── Título (text-3xl font-black text-gray-900)
   ├── Subtítulo (text-sm text-gray-400)
   └── Botones top-right (Actualizar + acción principal)
4. KPI cards       (bg-white border-b, grid 2x4 md:4)
5. Tabs + Search   (bg-white border-b, flex justify-between)
6. Tabla / Kanban  (px-8 py-4, rounded-2xl border)
7. Footer          (contador de registros)
```

---

## Componentes y sus tokens

### Sub-module nav
```tsx
// Usar NAV.* del design-system
<div className={NAV.wrapper}>
  <span className={NAV.label}>MÓDULO:</span>
  {SUB_MODULES.map(m => (
    <Link className={`${NAV.pill} ${activo ? NAV.pillActive : NAV.pillInactive}`}>
      {m.label}
    </Link>
  ))}
</div>
```

### Page Header
```tsx
<div className={PAGE_HEADER.wrapper}>
  <div className={PAGE_HEADER.inner}>
    <div className="flex items-center gap-4">
      <div className={`${PAGE_HEADER.iconWrapper} bg-indigo-50 text-indigo-600`}>
        <Icono size={30}/>
      </div>
      <div>
        <h1 className={PAGE_HEADER.title}>Título de Página</h1>
        <p className={PAGE_HEADER.subtitle}>NUM-YYYY#### • Pipeline: A → B → C</p>
      </div>
    </div>
    <div className={PAGE_HEADER.actions}>
      <button className={BTN.secondary}><RefreshCw size={14}/> Actualizar</button>
      <button className={BTN.primary}><Plus size={15}/> Nueva Acción</button>
    </div>
  </div>
</div>
```

### KPI Card (4 en grid)
```tsx
// KPI_COLOR_MAP['indigo' | 'amber' | 'emerald' | 'purple' | 'orange' | 'red']
const c = KPI_COLOR_MAP[color];
<div className={`${KPI_CARD.wrapper} ${c.bg} ${c.border}`}>
  <div className={`${KPI_CARD.icon} ${c.iconBg} ${c.iconText}`}><Icono size={20}/></div>
  <p className={KPI_CARD.label}>ETIQUETA</p>
  <p className={KPI_CARD.value}>{valor}</p>
  <p className={`${KPI_CARD.sub} ${ok ? KPI_CARD.subOk : KPI_CARD.subWarn}`}>
    <Icono size={11}/> Texto informativo
  </p>
</div>
```

### Tabs de estado (estilo Solicitudes/Venta — amber)
```tsx
<div className={TABS_BAR.wrapper}>
  <div className="flex items-center gap-1 overflow-x-auto">
    {TABS.map(tab => (
      <button className={activeTab===tab ? TABS_BAR.tabActiveAmber : TABS_BAR.tabInactiveAmber}>
        {tab} <span>{count}</span>
      </button>
    ))}
  </div>
  {/* Search derecha */}
  <div className={SEARCH_BAR.pill}>
    <Search size={14}/>
    <input className={SEARCH_BAR.input} placeholder="Buscar..."/>
  </div>
</div>
```

### Tabs de módulo (estilo Hub — indigo)
```tsx
<div className={TABS_BAR.group}>
  {TABS.map(tab => (
    <button className={activeTab===tab ? TABS_BAR.tabActive : TABS_BAR.tabInactive}>
      {tab}
    </button>
  ))}
</div>
```

### Badge de Estado
```tsx
<span className={`${BADGE.base} ${getEstadoClass(item.estado)}`}>
  {item.estado}
</span>
```

### Tabla estándar
```tsx
<div className={TABLE.wrapper}>
  <table>
    <thead className={TABLE.thead}>
      <tr>
        <th className={TABLE.thFirst}><input type="checkbox"/></th>
        <th className={TABLE.th}>COLUMNA</th>
      </tr>
    </thead>
    <tbody className={TABLE.tbody}>
      {rows.map(r => (
        <tr className={TABLE.tr}>
          <td className={TABLE.tdFirst}>...</td>
          <td className={TABLE.td}>...</td>
        </tr>
      ))}
    </tbody>
  </table>
  <div className={TABLE.footer}>
    <span>{filtered.length} de {total} registros</span>
  </div>
</div>
```

### Detail Panel (full-width)
```tsx
<div className={DETAIL_PANEL.overlay} style={DETAIL_PANEL.overlayStyle}>
  <div className={DETAIL_PANEL.header}>...</div>
  <div className={DETAIL_PANEL.body}>
    <div className={DETAIL_PANEL.leftPane}>   {/* 45% */}
      <section className={DETAIL_PANEL.section}>
        <h3 className={DETAIL_PANEL.sectionTitle}>SECCIÓN</h3>
        ...
      </section>
    </div>
    <div className={DETAIL_PANEL.rightPane}> {/* 55% */}
      ...
    </div>
  </div>
</div>
```

### Activity / Chatter tabs
```tsx
<div className={ACTIVITY_TABS.wrapper}>
  <div className={ACTIVITY_TABS.tabBar}>
    <button className={tab==='actividad' ? ACTIVITY_TABS.tabActive : ACTIVITY_TABS.tabInactive}>
      Actividad y Notas
    </button>
    <button className={tab==='chatter' ? ACTIVITY_TABS.tabActive : ACTIVITY_TABS.tabInactive}>
      Chatter
    </button>
  </div>
  <div className={ACTIVITY_TABS.body}>
    {/* Chatter bubble */}
    <div className={ACTIVITY_TABS.chatterBubble}>
      <p className={ACTIVITY_TABS.chatterText}>{msg}</p>
      <p className={ACTIVITY_TABS.chatterMeta}>{user} — {fecha}</p>
    </div>
    {/* Activity item */}
    <div className={ACTIVITY_TABS.activityItem}>
      <div className={ACTIVITY_TABS.activityDot} style={{backgroundColor: getActivityColor(a.action)}}/>
      <div className={ACTIVITY_TABS.activityCard}>...</div>
    </div>
  </div>
  <div className={ACTIVITY_TABS.inputRow}>
    <input className={ACTIVITY_TABS.input}/>
    <button className={BTN.whatsapp}><MessageCircle/></button>
    <button className={ACTIVITY_TABS.sendBtn}>Registrar</button>
  </div>
</div>
```

---

## Reglas Tailwind críticas (NUNCA romper)

- ❌ NUNCA `text-${variable}` ni `bg-${variable}` — Tailwind no purga clases dinámicas
- ✅ SIEMPRE clases hardcoded o `style={{ color: variable }}`
- ❌ Íconos Lucide que NO existen: `Instagram`, `Facebook`, `Wifi`, `XCircle`
- ✅ WhatsApp = `MessageCircle` (no `MessageSquare`)
- ✅ `style={{ left: '240px' }}` para paneles full-width (sidebar = 240px)

## Fuente de verdad — colores por módulo

| Módulo | Primary | Accent | Fondo KPIs | Nav pill activo |
|--------|---------|--------|------------|----------------|
| Ventas | indigo-600 | amber | indigo-50 | bg-indigo-600 text-white |
| Compras | blue-600 | cyan | blue-50 | bg-blue-600 text-white |
| Inventario | teal-600 | emerald | teal-50 | bg-teal-600 text-white |
| CRM | violet-600 | purple | violet-50 | bg-violet-600 text-white |
| Finanzas | emerald-600 | green | emerald-50 | bg-emerald-600 text-white |
