---
trigger: always_on
---

# Estándar Canónico: Pestaña Análisis en Nebulae ERP

Toda pestaña Análisis de un Hub (Ventas, Compras, Inventario, CRM y Finanzas › Resumen) DEBE ser un `PanelAnalisisPerezoso` importado de `@/components/analisis`. Es la misma pestaña en todo el sistema: el selector de período, de 3 a 5 indicadores con su variación contra el período anterior, una línea en el tiempo, una dona, los movimientos recientes, un ranking, un gráfico de barras y, al final, el asistente «En construcción». Entre módulos solo cambian los datos que manda su endpoint y el color del módulo, no la estructura.

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

| Hub | `modulo` | `endpoint` | Foco |
| :--- | :--- | :--- | :--- |
| Ventas | `'ventas'` | `/ventas/analisis` | Selector Todo / Solicitudes / Cotizaciones / Pedidos (`FOCOS_VENTAS` de `@/lib/analisis`) |
| Compras | `'compras'` | `/compras/analisis` | Sin selector |
| Inventario | `'inventario'` | `/inventory/analisis` | Sin selector (la bodega entra como `controlesExtra`) |
| CRM | `'crm'` | `/crm/analisis` | Sin selector |
| Finanzas › Resumen | `'finanzas'` | `/finance/analisis` | Sin selector |

- `modulo` es un `ModuloAnalisis` (`MODULOS_ANALISIS` de `@/lib/analisis`) y da la clave de preferencias `analisis:<modulo>`. En Ventas el foco va DENTRO de `analisis:ventas`; no existen `analisis:ventas-sc`, `analisis:ventas-cot` ni `analisis:ventas-pven`.
- Las listas de Solicitudes, Cotizaciones y Pedidos de venta NO llevan pestaña Análisis propia: llevan un botón «Ver análisis» que abre el del Hub ya enfocado: `/dashboard/ventas?tab=analisis&foco=sc`, `foco=cot` o `foco=pven`. Pedidos de compra, Lista de compras y Traslados hacen lo mismo hacia `/dashboard/compras?tab=analisis`.
- Todavía no tienen Análisis E-commerce, Marketing, Logística ni el Dashboard General. No se les agrega uno sin que el usuario lo pida.

```tsx
import Link from 'next/link';
import { BTN } from '@/lib/design-system';

export function VerAnalisisCotizaciones() {
  return (
    <Link href="/dashboard/ventas?tab=analisis&foco=cot" className={BTN.secondary}>
      Ver análisis
    </Link>
  );
}
```

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

### Props de `PropsPanelAnalisis`

| Prop | Qué hace |
| :--- | :--- |
| `modulo` (requerida) | El `ModuloAnalisis`: da la clave de preferencias `analisis:<modulo>`. |
| `endpoint` (requerida) | La ruta del API sin el prefijo `/api/v1`: `GET /<módulo>/analisis`. |
| `acento` | Un `AccentColor` de `components/ui/colors.ts`: el color del módulo. Pinta la serie principal de los gráficos, la barra del ranking y las tarjetas cuyo id no está en `CATALOGO_KPI`. |
| `mejorLinea` | `'sube'`, `'baja'` o `'neutro'`: si subir es bueno para la cifra de la línea. Pásalo SIEMPRE de forma explícita. Sin él y con una cifra ambigua, el chip sale gris (`'neutro'`), nunca con un verde inventado. |
| `focos`, `focoInicial`, `alCambiarFoco` | El selector de foco (Ventas: `FOCOS_VENTAS`). `focoInicial` es el `?foco=` de la URL («Ver análisis») y gana sobre el guardado hasta que el usuario elige otro. `alCambiarFoco` mantiene `?foco=` al día con `router.replace`. El foco de la URL no se guarda en las preferencias. |
| `params` | Parámetros propios del endpoint (por ejemplo `{ bodega }`). El panel solo pisa lo que maneja: `foco`, si hay `focos`, y `producto`, si hay `busquedaProducto`. Lo demás llega tal cual al servidor. |
| `busquedaProducto` | El campo «Producto»: manda `producto=` 400 ms después de la última tecla y solo con 2 letras o más. |
| `controlesExtra` | Controles de la pantalla junto a «Actualizar» (su valor entra por `params`). Se pintan también, inertes, en el esqueleto. |
| `etiquetar` | `(bloque, clave, etiqueta) => string`: renombra los segmentos de la dona, las filas del ranking y las series y categorías de las barras. Debe devolver la etiqueta recibida cuando no conoce la clave. |
| `alAbrirMovimiento` | Abre un movimiento a su manera. Sin él, cada fila es un `<Link>` a `enlaceDocumento(doc_tipo, doc_id)`. |
| `pie` | Algo de la pantalla debajo de la grilla, antes del asistente. |
| `asistente` | `{ titulo, ejemplos }` de la tarjeta «En construcción» (sección 6). Sin él: `{ titulo: 'Asistente con IA', ejemplos: [] }`. |

`etiquetar` y `alAbrirMovimiento` con los tipos reales:

```tsx
import { PanelAnalisisPerezoso } from '@/components/analisis';
import { enlaceDocumento } from '@/lib/analisis';
import type { Etiquetar, FilaMovimiento } from '@/lib/analisis';
import { etiquetaTipoSC } from '@/lib/etiquetas-solicitud';

const etiquetar: Etiquetar = (bloque, clave, etiqueta) => {
  if (bloque !== 'dona') return etiqueta;
  const tipo = etiquetaTipoSC(clave);
  return tipo && tipo !== clave ? tipo : etiqueta; // si no la conoce, la etiqueta que llegó
};

export function AnalisisCrm({ abrir }: { abrir: (ruta: string) => void }) {
  const alAbrirMovimiento = (fila: FilaMovimiento) => {
    const ruta = enlaceDocumento(fila.doc_tipo, fila.doc_id);
    if (ruta) abrir(ruta);
  };
  return (
    <PanelAnalisisPerezoso
      modulo="crm"
      endpoint="/crm/analisis"
      acento="purple"
      mejorLinea="sube"
      etiquetar={etiquetar}
      alAbrirMovimiento={alAbrirMovimiento}
    />
  );
}
```

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

- **Selector de período:** píldoras en el ancho del panel desde `@xl` y un `<select>` en anchos chicos. «Personalizado» abre dos fechas (Desde y Hasta, a lo sumo hoy en Colombia) con «Aplicar». Las fechas inválidas no se aplican y el aviso usa el mismo texto que daría el servidor (`errorPeriodo`).
- **Indicadores:** son `TarjetaKpi` dentro de `FranjaKpis` (`FilaKpis`), las mismas tarjetas del resto de la app (ver `design-system-reference.md`). Nunca tarjetas con gradiente propio.
- **Fila 2:** la línea va a todo el ancho hasta `@5xl`; desde ahí la línea ocupa 6/12, la dona 3/12 y los movimientos 3/12. Entre `@2xl` y `@5xl`, la dona y los movimientos van lado a lado debajo de la línea. En una sola columna se ven todos los movimientos (hasta 8); desde `@2xl`, 4 y debajo «y N movimientos más». Con 2 o más donas hay píldoras para cambiar entre ellas.
- **Fila 3:** el ranking (5/12) y las barras (7/12) lado a lado desde `@5xl`. El ranking trae `Top 5`, `Top 10` y `Top 25`; las tres primeras filas llevan medalla (oro, plata y bronce) y cada fila una barra proporcional al mayor.
- Un bloque que el módulo no tiene (`null`) no deja celda vacía: la grilla se cierra.
- Los movimientos abren su documento con un `<Link>` a `enlaceDocumento` (SC, COT, PVEN o VEN, PEC, ENINV, GASTO y KARDEX) o con `alAbrirMovimiento`.

---

## 4. Datos del servidor: `GET /<módulo>/analisis`

El servidor agrega; el navegador solo pinta. Nunca se traen filas para sumarlas en el cliente.

```text
GET /<módulo>/analisis?periodo=30d&top=5[&desde=AAAA-MM-DD&hasta=AAAA-MM-DD][&foco=…][&producto=…][&bodega=…]

{ "status": "success",
  "data": { "periodo", "kpis", "linea", "donas", "barras", "movimientos", "ranking", "filtros", "avisos", "generado_en" } }
```

- **Un solo contrato** (`backend/app/core/analisis.py`): `kpi(...)`, `segmentos(...)` y las claves exactas de cada bloque (`CLAVES_ANALISIS`, `CLAVES_KPI`, `CLAVES_LINEA`…). Un bloque con claves de más o de menos es un `ErrorDeContrato` (500 con su traceback), no se esconde. En el navegador, `normalizarAnalisis` completa lo que falte con `null` o `[]` y nunca rellena una cifra.
- **Un solo resolver de períodos** (`backend/app/core/periodos.py`): `7d`, `30d`, `90d`, `mes`, `12m` y `personalizado`, en días calendario de Colombia, con la comparación contra el período anterior y los seis textos de error en español (422). El navegador valida con `validarPeriodo` y `errorPeriodo` de `@/lib/analisis`, que dicen lo mismo.
- **Ranking:** `top` es 5, 10 o 25 (`validar_top`); cualquier otro valor da 422.
- **Agregado en SQL:** `GROUP BY`, `SUM`, `COUNT` y `LIMIT`; como máximo 14 consultas por llamada (las pruebas del endpoint lo miden con la fixture `contador_sql`).
- **Dinero** en pesos enteros (`dinero()`), fechas de las cubetas como `AAAA-MM-DD` de Colombia y `generado_en` como ISO con `Z`.
- **Cada cifra se calcula con la regla única del sistema.** Ejemplo: «Vendido» son los pedidos creados en el período, sin cancelados ni devueltos; el Dashboard General, las tarjetas y el Análisis dicen lo mismo.
- Lo que muestra cada módulo (qué indicadores, qué dona, qué ranking) lo decide su endpoint. La pantalla no calcula, no completa y no renombra cifras.

---

## 5. Gráficos: solo desde `components/analisis`

`chart.js` y `react-chartjs-2` solo se importan en `components/analisis`: `registro.ts` (el ÚNICO `ChartJS.register`) y los tres gráficos `GraficoLinea`, `GraficoDona` y `GraficoBarras`. Las excepciones de `test_graficos_centralizados.mjs` (`ventas/proyecciones`, `compras/proyecciones`, `finanzas/resumen` hasta que pase a `PanelAnalisisPerezoso`, y `app_mocks_backup`) son una lista blanca que se va vaciando.

- **Línea:** el título, el total en grande con su variación (`ChipVariacion`) y el gráfico (256 px de alto, a lo sumo 8 marcas en el eje X). La serie del período lleva el color del módulo con un área en degradado; la del período anterior, gris punteada.
- **Dona:** el total va en el centro (la letra se achica con el largo) y la leyenda es HTML con color, etiqueta, valor y porcentaje.
- **Barras:** con eje `'fechas'` van verticales; con `'categorias'`, horizontales con la etiqueta recortada en el eje y completa en el tooltip y en la tabla. `apiladas` las apila.
- **Registro:** los valores globales de Chart.js son solo la fuente de la app y la animación de 400 ms, que pasa a 0 con `prefers-reduced-motion`. El color de los ejes (`COLOR_EJES`, slate-600) y el estilo de los tooltips (`ESTILO_TOOLTIP`) van en las opciones de cada gráfico, no en `ChartJS.defaults`.
- **Tooltips:** pesos colombianos y fechas en español, con `formatearValor` y `etiquetaFecha` de `@/lib/analisis`.
- **Accesibilidad:** cada `<canvas>` lleva `role="img"` y `aria-label` con `resumenAccesible`. Los datos también van en una tabla para lectores de pantalla, como `<div className="sr-only"><table>…</table></div>` y NO como `<table className="sr-only">`, que desplaza la página de lado. El `<caption>` es genérico («Datos del gráfico») y la tabla va dentro de la región que nombra el `<h3>` del gráfico.

### Colores

- La serie principal usa el color del módulo (`colorDeAcento(acento)`, el -600 del `AccentColor`); la del período anterior, `COLOR_ANTERIOR` (gris).
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

`PanelAnalisis` pinta `AsistenteEnConstruccion` al final de TODA pestaña Análisis. La pantalla solo le da el título y las preguntas de ejemplo con la prop `asistente` de `PanelAnalisisPerezoso`:

```tsx
import { PanelAnalisisPerezoso } from '@/components/analisis';

export function AnalisisCompras() {
  return (
    <PanelAnalisisPerezoso
      modulo="compras"
      endpoint="/compras/analisis"
      acento="purple"
      mejorLinea="neutro"
      asistente={{
        titulo: 'Copilot de Compras',
        ejemplos: ['¿Qué pedidos de compra llegan tarde?', '¿Qué proveedor tiene más pedidos en tránsito?'],
      }}
    />
  );
}
```

- La tarjeta lleva el título del asistente, la pastilla ámbar «En construcción», el texto «El asistente con IA llega en el Bloque 5: responderá con los datos reales de esta pantalla.», las preguntas de ejemplo como chips deshabilitados y la caja de texto deshabilitada.
- NO llama a ningún endpoint, NO usa `setTimeout`, NO responde nada (ni un texto fijo ni uno simulado) y NO tiene estado.
- El aviso «En construcción» de la IA vive SOLO en `AsistenteEnConstruccion.tsx`. Ninguna pantalla escribe el suyo: el Bloque 5 lo cambia en un solo lugar y se detiene si encuentra otro.
- Los ejemplos son preguntas reales de la pantalla, en español, sin códigos crudos ni emojis.
- Ninguna pantalla llama a `/ventas/ai-chat` (el endpoint no existe) ni simula un chat con `setTimeout`: `test_graficos_centralizados.mjs` falla si un archivo de `src/app` contiene `/ventas/ai-chat` fuera de su lista blanca temporal.
- Fuera de alcance: el Copilot del Dashboard General (`/chat/copilot/query`) y `GlobalAIChat`, que no son pestañas Análisis.

---

## 7. Cifras, estados y textos

### Sin cifras inventadas

- Una cifra que el servidor no manda se ve «—» (`valor: null`), nunca 0, nunca un número de respaldo (`|| 12450`), nunca `Math.random()` ni datos de ejemplo.
- Los formatos son los de `lib/kpis.js`: montos completos con `formatoPesos` (`$4.927.538`; la letra se achica, no se abrevia), porcentaje `45,2 %` (coma decimal y un espacio antes del `%`) y variación `+12,5 %`, `−8 %`, `Nuevo`, `Sin cambio` o `—`. Una cifra «de hoy» (`es_foto`, por ejemplo el saldo por cobrar) dice `Hoy` y no se compara. `pesosCorto` (`$4,9 M`) es solo para los ejes de los gráficos.
- Cada variación dice contra qué se compara: `vs 5 ago – 3 sept`, el `periodo.comparado` del servidor.

### Estados

- **Cargando:** el esqueleto (`EsqueletoAnalisis`), nunca ceros. También mientras se leen las preferencias (a lo sumo 4 s), sin que salga ninguna petición hasta tener el período guardado.
- **Recargando** (otro período, foco, producto o «Actualizar»): los datos anteriores se ven al 90 % y la región lleva `aria-busy`. Si cambias varias veces seguidas, solo cuenta la última consulta.
- **Sin datos:** el bloque dice «Sin datos en este período». La dona y las barras no se dibujan vacías.
- **Error:** «No pudimos cargar el análisis. Revisa tu conexión y vuelve a intentarlo.» con el botón «Reintentar», y los últimos datos buenos sin atenuar. Sin permiso (403): «No tienes permiso para ver este análisis.», sin botón. Un 422 muestra el texto del servidor, sin botón.

### Fechas y textos

- Las fechas del API vienen en UTC sin zona. Se muestran en hora de Colombia con `fechas-colombia.js`: `diaColombia()`, `hace(iso)` («hace 2 horas»), `fechaHoraLarga(iso)`. Una fecha de calendario (`AAAA-MM-DD`) no se corre de día.
- Etiquetas, avisos y botones en español con tildes; los estados con su etiqueta (nunca el código crudo) y sin emojis.
- Foco visible en todo control. Clases de Tailwind literales y sin `dark:` (la app es siempre clara).

---

## 8. Lo que recuerda la pestaña

`analisis:<modulo>` (preferencias del usuario, iguales en cualquier computador): el período, el Top del ranking y el foco, cada pieza por separado (`usePreferenciaParte`). Nada se escribe antes de tener lo guardado. Si el navegador no deja guardar, la pestaña funciona igual con 30 días y Top 5. Producto, bodega y los demás `params` no se guardan.

---

## 9. Antes de dar por terminada una pantalla con Análisis

- `grep -rn "chart.js\|react-chartjs-2" frontend/src` solo encuentra `components/analisis` y la lista blanca.
- Revisa capturas a 375 px con el menú plegado y a 768, 1024 y 1440 px con el menú abierto. Mira que nada salte del esqueleto a los datos, que el foco se vea en los campos de fecha y que el total de la línea quepa en tarjetas angostas. El atenuado al 90 % es transitorio: algunos textos quedan por debajo de 4,5:1 mientras `aria-busy` está activo.
- A 375 px con el menú lateral abierto (`w-64`) el panel queda en unos 71 px y la página se desplaza de lado: el menú no se adapta, no es del panel.
- Corre `npm test` y `npx tsc --noEmit` en `frontend/`.
