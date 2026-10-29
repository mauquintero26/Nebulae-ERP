---
trigger: always_on
---

# Estándar Canónico: Pestaña Análisis en Nebulae ERP

Toda pestaña Análisis de un Hub (Ventas, Compras, Inventario, CRM y Finanzas › Resumen) DEBE ser un `PanelAnalisisPerezoso` importado de `@/components/analisis`. Es la misma pestaña en todo el sistema: el selector de período, de 3 a 5 indicadores con su variación contra el período anterior, una línea en el tiempo, una dona, los movimientos recientes, un ranking, un gráfico de barras y, al final, el asistente «En construcción». Entre módulos solo cambian los datos que manda su endpoint y el acento del Hub, no la estructura.

La pantalla no arma nada de esto a mano: ni tarjetas de KPI propias, ni SVG o `<canvas>` propios, ni listas de ranking, ni un chat de IA propio.

---

## Reglas (resumen)

SIEMPRE:
- Una pestaña Análisis = `PanelAnalisisPerezoso` de `@/components/analisis` (sección 2). Nunca `PanelAnalisis` ni los gráficos directo.
- Una pestaña por Hub, más el botón «Ver análisis» en sus listas (sección 1).
- Los datos salen de `GET /<módulo>/analisis`, agregados en el servidor (sección 4).
- Los gráficos son los de `components/analisis`, con Chart.js (sección 5).
- El asistente es la tarjeta «En construcción» de `AsistenteEnConstruccion`, que `PanelAnalisis` ya pinta al final (sección 6).
- Una cifra que no llegó se ve «—», nunca 0 ni un número de respaldo; mientras carga se ve el esqueleto (sección 7).
- Las fechas van en hora de Colombia y los textos en español con tildes (sección 7).

NUNCA:
- Importar `chart.js` ni `react-chartjs-2` fuera de `components/analisis` (`frontend/tests/test_graficos_centralizados.mjs` lo vigila).
- Dibujar gráficos con SVG a mano ni con otra librería.
- Escribir cifras de ejemplo, de respaldo o calculadas en el navegador sobre listas completas.
- Responder preguntas del asistente en el cliente (texto fijo, `setTimeout`) ni llamar a `/ventas/ai-chat`, que no existe.
- Escribir en una pantalla su propio aviso de «En construcción».

---

## 1. Una pestaña por Hub, con «Ver análisis» en las listas

| Hub | `modulo` | `endpoint` | `acento` | Foco |
| :--- | :--- | :--- | :--- | :--- |
| Ventas | `'ventas'` | `/ventas/analisis` | `'indigo'` | Selector Todo / Solicitudes / Cotizaciones / Pedidos (`FOCOS_VENTAS` de `@/lib/analisis`) |
| Compras | `'compras'` | `/compras/analisis` | `'purple'` | Sin selector |
| Inventario | `'inventario'` | `/inventory/analisis` | `'teal'` | Sin selector (la bodega entra como `controlesExtra`) |
| CRM | `'crm'` | `/crm/analisis` | `'purple'` | Sin selector |
| Finanzas › Resumen | `'finanzas'` | `/finance/analisis` | `'blue'` | Sin selector |

- `modulo` es un `ModuloAnalisis` (`MODULOS_ANALISIS` de `@/lib/analisis`) y da la clave de preferencias `analisis:<modulo>`. En Ventas el foco va DENTRO de `analisis:ventas`; no existen `analisis:ventas-sc`, `analisis:ventas-cot` ni `analisis:ventas-pven`.
- Las listas de Solicitudes, Cotizaciones y Pedidos de venta NO llevan pestaña Análisis propia: llevan un botón «Ver análisis» que abre el del Hub ya enfocado: `/dashboard/ventas?tab=analisis&foco=sc`, `foco=cot` o `foco=pven`. Pedidos de compra, Lista de compras y Traslados hacen lo mismo hacia `/dashboard/compras?tab=analisis`. El botón es un `<Link>` con `BTN.secondary` (`@/lib/design-system`).
- Todavía no tienen Análisis E-commerce, Marketing, Logística ni el Dashboard General. No se les agrega uno sin que el usuario lo pida.
- `acento` es un `AccentColor` (`components/ui/colors.ts`) y el de esta tabla es el que vale para el Hub. No es el de `MODULE_COLORS` de `design-system.ts`, que es legado.

---

## 2. Cómo se usa: `PanelAnalisisPerezoso`

`PanelAnalisisPerezoso` carga `PanelAnalisis` (y con él `chart.js` y `react-chartjs-2`) en su propio chunk, recién cuando se pinta la pestaña (`next/dynamic` con `ssr: false`). Mientras llega, muestra el mismo esqueleto del panel, así que nada salta. Por eso `@/components/analisis` (su `index.ts`) NO reexporta `PanelAnalisis`, `GraficoLinea`, `GraficoDona`, `GraficoBarras` ni `registro.ts`: si una pantalla los importa, `chart.js` entra al chunk de la pantalla y la guarda de `test_graficos_centralizados.mjs` falla.

### Hub de Ventas (con foco)

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { PanelAnalisisPerezoso } from '@/components/analisis';
import { FOCOS_VENTAS } from '@/lib/analisis';

export function AnalisisVentas({ focoDeLaUrl }: { focoDeLaUrl: string | null }) {
  const router = useRouter();
  return (
    <PanelAnalisisPerezoso
      modulo="ventas"
      endpoint="/ventas/analisis"
      acento="indigo"
      focos={FOCOS_VENTAS}
      focoInicial={focoDeLaUrl}
      alCambiarFoco={(foco) => router.replace(`?tab=analisis&foco=${foco}`)}
      mejorLinea="sube"
      busquedaProducto
      asistente={{
        titulo: 'Copilot de Ventas',
        ejemplos: ['¿Qué cotizaciones llevan más días sin respuesta?', '¿Cuánto vendimos este mes frente al anterior?'],
      }}
    />
  );
}
```

### Hub sin foco, con un control propio (Inventario)

```tsx
'use client';

import { useState } from 'react';
import { PanelAnalisisPerezoso } from '@/components/analisis';

export function AnalisisInventario({ bodegas }: { bodegas: { id: number; nombre: string }[] }) {
  const [bodega, setBodega] = useState('');
  return (
    <PanelAnalisisPerezoso
      modulo="inventario"
      endpoint="/inventory/analisis"
      acento="teal"
      mejorLinea="neutro"
      params={{ bodega }}
      controlesExtra={(
        <select
          aria-label="Bodega"
          value={bodega}
          onChange={(e) => setBodega(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
        >
          <option value="">Todas las bodegas</option>
          {bodegas.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
      )}
      asistente={{ titulo: 'Copilot de Inventario', ejemplos: ['¿Qué referencias están por agotarse?'] }}
    />
  );
}
```

### Lo que no dice el JSDoc de `PropsPanelAnalisis`

| Prop | Regla |
| :--- | :--- |
| `acento` | El acento del Hub (tabla de la sección 1). Pinta la serie principal, la barra del ranking y las tarjetas cuyo id no está en `CATALOGO_KPI`. |
| `mejorLinea` | `'sube'`, `'baja'` o `'neutro'`. Pásalo SIEMPRE de forma explícita: sin él y con una cifra ambigua, el chip sale gris (`'neutro'`), nunca con un verde inventado. |
| `focoInicial`, `alCambiarFoco` | `focoInicial` (el `?foco=` de «Ver análisis») gana sobre el guardado hasta que el usuario elige otro, y no se guarda. `alCambiarFoco` mantiene `?foco=` al día con `router.replace`. |
| `params` | El panel solo pisa lo que maneja: `foco`, si hay `focos`, y `producto`, si hay `busquedaProducto` (400 ms y 2 letras o más). Lo demás llega tal cual. `controlesExtra` se pinta también, inerte, en el esqueleto. |
| `etiquetar` | `(bloque, clave, etiqueta) => string`. Debe devolver la etiqueta recibida cuando no conoce la clave. |
| `alAbrirMovimiento` | Sin él, cada fila es un `<Link>` a `enlaceDocumento(doc_tipo, doc_id)`, que no conoce LEAD (devuelve `null`): los movimientos del CRM se abren con `alAbrirMovimiento`, por `doc_id`. |
| `asistente` | `{ titulo, ejemplos }` de la tarjeta «En construcción» (sección 6). Por defecto, `{ titulo: 'Asistente con IA', ejemplos: [] }`. |

---

## 3. Qué trae la pestaña, de arriba abajo

El orden y la grilla son fijos (`GRILLA_ANALISIS` de `@/lib/analisis`). La raíz del panel es `@container/analisis`: las columnas dependen del ancho del PANEL, no del de la pantalla.

```text
Selector de foco        solo si hay `focos` (Ventas: Todo / Solicitudes / Cotizaciones / Pedidos)
Selector de período     7 días · 30 días · 90 días · Este mes · 12 meses · Personalizado, y debajo «Comparado con …»
  Producto · controlesExtra · Actualizar · «Actualizado hace …»
Avisos del servidor     caja ámbar, solo si el endpoint manda `avisos`
FilaKpis                FranjaKpis con 3 a 5 TarjetaKpi, cada una con su variación contra el período anterior
Fila 2                  línea (con su total y su variación) · dona · movimientos recientes
Fila 3                  ranking Top 5 / 10 / 25 · barras
pie                     opcional, de la pantalla
AsistenteEnConstruccion siempre al final
```

- Un bloque que el módulo no tiene (`null`) no deja celda vacía: la grilla se cierra.
- Movimientos: se ven 4 desde `@2xl` del panel, con la línea «y N movimientos más»; por debajo, los 8.
- Los movimientos abren su documento con `enlaceDocumento` (SC, COT, PVEN o VEN, PEC, ENINV, GASTO y KARDEX) o con `alAbrirMovimiento`.

---

## 4. Datos del servidor: `GET /<módulo>/analisis`

El servidor agrega; el navegador solo pinta. Nunca se traen filas para sumarlas en el cliente.

```text
GET /<módulo>/analisis?periodo=30d&top=5[&desde=AAAA-MM-DD&hasta=AAAA-MM-DD][&foco=…][&producto=…][&bodega=…]

{ "status": "success",
  "data": { "periodo", "kpis", "linea", "donas", "barras", "movimientos", "ranking", "filtros", "avisos", "generado_en" } }
```

- **Un solo contrato** (`backend/app/core/analisis.py`): `kpi(...)`, `segmentos(...)` y las claves exactas de cada bloque (`CLAVES_ANALISIS`…). Un bloque con claves de más o de menos es un `ErrorDeContrato` (500), no se esconde. En el navegador, `normalizarAnalisis` completa lo que falte con `null` o `[]` y nunca rellena una cifra.
- **Un solo resolver de períodos** (`backend/app/core/periodos.py`): `7d`, `30d`, `90d`, `mes`, `12m` y `personalizado`, en días calendario de Colombia, con la comparación contra el período anterior y sus textos de error en español (422). El navegador valida con `validarPeriodo` y `errorPeriodo` de `@/lib/analisis`, que dicen lo mismo. `top` es 5, 10 o 25 (`validar_top`); otro valor da 422.
- **Agregado en SQL** (`GROUP BY`, `SUM`, `COUNT`, `LIMIT`): como máximo 14 consultas por llamada (las pruebas lo miden con la fixture `contador_sql`). Dinero en pesos enteros (`dinero()`), fechas de las cubetas `AAAA-MM-DD` de Colombia y `generado_en` ISO con `Z`.
- **Cada cifra usa la regla única del sistema** (por ejemplo, «Vendido»: los pedidos creados en el período, sin cancelados ni devueltos; igual en las tarjetas, el Dashboard General y el Análisis). Qué indicadores, dona y ranking trae cada módulo lo decide su endpoint: la pantalla no calcula, no completa y no renombra cifras.

---

## 5. Gráficos: solo desde `components/analisis`

`chart.js` y `react-chartjs-2` solo se importan en `components/analisis`: `registro.ts` (el ÚNICO `ChartJS.register`) y los tres gráficos `GraficoLinea`, `GraficoDona` y `GraficoBarras`. Las excepciones de `test_graficos_centralizados.mjs` (`ventas/proyecciones`, `compras/proyecciones`, `finanzas/resumen` hasta que pase a `PanelAnalisisPerezoso`, y `app_mocks_backup`) son una lista blanca que se va vaciando.

- **Registro:** los valores globales de Chart.js son solo la fuente de la app y la animación de 400 ms, que pasa a 0 con `prefers-reduced-motion`. El color de los ejes (`COLOR_EJES`, slate-600) y el estilo de los tooltips (`ESTILO_TOOLTIP`) van en las opciones de cada gráfico, no en `ChartJS.defaults`.
- **Tooltips:** pesos colombianos y fechas en español, con `formatearValor` y `etiquetaFecha` de `@/lib/analisis`.
- **Accesibilidad:** cada `<canvas>` lleva `role="img"` y `aria-label` con `resumenAccesible`. Los datos también van en una tabla para lectores de pantalla, como `<div className="sr-only"><table>…</table></div>` y NO como `<table className="sr-only">`, que desplaza la página de lado. El `<caption>` es genérico («Datos del gráfico») y la tabla va dentro de la región que nombra el `<h3>` del gráfico.

### Colores

- La serie principal usa el acento del Hub (`colorDeAcento(acento)`, el -600 del `AccentColor`); la del período anterior, `COLOR_ANTERIOR` (gris).
- Las series de línea y de barras salen de `PALETA_SERIES` (contraste de 3:1 o más). La dona usa `PALETA`, cuyos colores no llegan a 3:1; se acepta porque la leyenda nombra cada segmento con texto.
- Una serie `'_otros'` sale en gris (`GRIS_OTROS`, 1,48:1). Úsala solo si la leyenda o la tabla dicen «Otros».
- El verde y el rojo se usan SOLO para subir y bajar, y siempre con flecha y texto, no solo con color.
- Con el acento `amber`, la barra del ranking queda en 2,91:1 contra su pista `slate-100`.

### Tonos de las series de barras

- `tono: 'negativo'` significa una SALIDA: se dibuja hacia abajo, y el eje, el tooltip, la tabla `sr-only` y el resumen accesible la leen como `-|v|`, mande el servidor la magnitud o el valor con signo.
- `tono: 'positivo'` es una ENTRADA y se pinta en `POSITIVO` (emerald-600).
- Para algo «malo» que no es una salida (por ejemplo, «con retraso» en las barras apiladas de Compras) usa `'neutro'` o no pongas tono; si no, la barra se dibuja hacia abajo y se lee «-3».
- Con el acento `teal` (Inventario), la serie principal neutra se parece a `POSITIVO`. Si un gráfico mezcla una serie neutra con una `'positivo'`, ponle tono a todas, o deja la neutra fuera de la primera posición.

---

## 6. Asistente IA: tarjeta «En construcción», sin respuestas simuladas, hasta el Bloque 5

`PanelAnalisis` pinta `AsistenteEnConstruccion` al final de TODA pestaña Análisis. La pantalla solo le da el título y las preguntas de ejemplo con la prop `asistente` de `PanelAnalisisPerezoso` (ejemplos de la sección 2).

- La tarjeta lleva el título del asistente, la pastilla ámbar «En construcción», el aviso que anuncia el Bloque 5 (su texto está solo en `AsistenteEnConstruccion.tsx`), las preguntas de ejemplo como chips deshabilitados y la caja de texto deshabilitada.
- NO llama a ningún endpoint, NO usa `setTimeout`, NO responde nada (ni un texto fijo ni uno simulado) y NO tiene estado.
- El aviso «En construcción» de la IA vive SOLO en `AsistenteEnConstruccion.tsx`. Ninguna pantalla escribe el suyo: el Bloque 5 lo cambia en un solo lugar y se detiene si encuentra otro.
- Los ejemplos son preguntas reales de la pantalla, en español, sin códigos crudos ni emojis.
- Ninguna pantalla llama a `/ventas/ai-chat` (el endpoint no existe) ni simula un chat con `setTimeout`: `test_graficos_centralizados.mjs` falla si un archivo de `src/app` contiene `/ventas/ai-chat` fuera de su lista blanca temporal.
- Fuera de alcance: el Copilot del Dashboard General (`/chat/copilot/query`) y `GlobalAIChat`, que no son pestañas Análisis.

---

## 7. Cifras, estados y textos

Formatos, textos, tildes, foco y `dark:` valen para toda la app: ver «Indicadores» y «Reglas Tailwind críticas» en `design-system-reference.md`.

- Una cifra que el servidor no manda se ve «—» (`valor: null`), nunca 0, nunca un número de respaldo (`|| 12450`), nunca `Math.random()` ni datos de ejemplo.
- `pesosCorto` (`lib/analisis.js`, `$4,9 M`) es solo para los ejes de los gráficos; las cifras van completas con `formatoPesos` (`lib/pesos.js`).
- Cada variación dice contra qué se compara: `vs 5 ago – 3 sept`, el `periodo.comparado` del servidor.
- **Cargando:** el esqueleto (`EsqueletoAnalisis`), nunca ceros, también mientras se leen las preferencias (a lo sumo 4 s; no sale ninguna petición hasta tener el período guardado). Al cambiar de foco se ve el esqueleto, nunca las cifras del foco anterior.
- **Recargando** (otro período, producto, bodega o «Actualizar»): los datos anteriores se ven al 90 % y la región lleva `aria-busy`. Si cambias varias veces seguidas, solo cuenta la última consulta.
- **Sin datos:** el bloque dice «Sin datos en este período». La dona y las barras no se dibujan vacías.
- **Error:** «No pudimos cargar el análisis. Revisa tu conexión y vuelve a intentarlo.» con «Reintentar», y los últimos datos buenos sin atenuar. Sin permiso (403): «No tienes permiso para ver este análisis.», sin botón. Un 422 muestra el texto del servidor, sin botón.
- Las fechas del API vienen en UTC sin zona y se muestran en hora de Colombia (`diaColombia()`, `hace(iso)`, `fechaHoraLarga(iso)` de `lib/fechas-colombia.js`). Una fecha `AAAA-MM-DD` no se corre de día.

---

## 8. Lo que recuerda la pestaña

`analisis:<modulo>`: el período, el Top del ranking y el foco, cada pieza por separado (`usePreferenciaParte`). Si el navegador no deja guardar, la pestaña funciona igual con 30 días y Top 5. Producto, bodega y los demás `params` no se guardan.

---

## 9. Antes de dar por terminada una pantalla con Análisis

- `grep -rn "chart.js\|react-chartjs-2" frontend/src` solo encuentra `components/analisis` y la lista blanca.
- Capturas a 375 px con el menú plegado y a 768, 1024 y 1440 px con el menú abierto: que nada salte del esqueleto a los datos, que el foco se vea en los campos de fecha y que el total de la línea quepa en tarjetas angostas. El atenuado al 90 % es transitorio y deja algunos textos por debajo de 4,5:1 mientras `aria-busy` está activo.
- A 375 px con el menú lateral abierto (`w-64`) el panel queda en unos 71 px y la página se desplaza de lado: es del menú, no del panel.
- `npm test` y `npx tsc --noEmit` en `frontend/`.
