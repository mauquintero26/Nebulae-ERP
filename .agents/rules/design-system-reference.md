---
trigger: always_on
---

# Sistema de Diseño Nebulae ERP

## Archivo base de estilos
`frontend/src/lib/design-system.ts`

Toda modificación visual DEBE importar los TOKENS de este archivo en lugar de escribir clases Tailwind a mano. Los formatos no salen de aquí.

```typescript
import {
  NAV, PAGE_HEADER, BTN, TABLE, BADGE, TABS_BAR, DETAIL_PANEL, ACTIVITY_TABS, getEstadoClass, getActivityColor,
} from '@/lib/design-system';
```

Las tarjetas de indicadores YA NO son un token: no hay `KPI_CARD`. Son el componente `TarjetaKpi` (sección «Indicadores»). `KPI_COLOR_MAP` sigue en `design-system.ts` porque lo importa `components/AlertasBadge.tsx`; las pantallas nuevas no lo usan.

`fCOP` y `fDate` quedan por compatibilidad con pantallas viejas; en código nuevo, `formatoPesos` (`lib/pesos.js`) y `lib/fechas-colombia.js`.

---

## Piezas compartidas: qué usar en cada caso

NUNCA armes a mano lo que ya existe aquí. Cada pieza tiene un solo dueño; si te falta algo, se agrega a la pieza, no se copia en la pantalla.

| Necesitas | Usa | Está en |
| :--- | :--- | :--- |
| Barra de submódulos del Hub | `SubNav` | `@/components/ui` |
| Encabezado de la página | `PageHeader` | `@/components/ui` |
| Tarjetas de indicadores y números que cargan | `FranjaKpis`, `TarjetaKpi`, `useEstadoKpi` y `Contador` | `@/components/ui` |
| Lista con tabla | `TablaEstandar` y `BarraTabla`, con el token `TABLE` | `@/components/tabla` |
| El estado de una lista | `useEstadoTabla`, `usePreferenciasTabla`, `useListado` (o `useListadoCliente`) y `usePantallaCompleta` | `@/components/tabla` |
| Tablero Kanban | `useTableroKanban`, `TableroKanban` y `TarjetaKanban` | `@/components/ui` |
| Botón Lista / Kanban, menú ⋯ y motivo de una cancelación | `ConmutadorVista` (o `useVistaGuardada` sin tabla estándar), `MenuFila` y `ModalMotivo` | `@/components/ui` |
| Franja del flujo de un Hub o lista | `BannerFlujo` y `useResumenFlujo` | `@/components/flujo` |
| Pasos de un documento | `CadenaDocumentos` y `PasosFlujo` | `@/components/flujo` |
| Pestaña Análisis | `PanelAnalisisPerezoso` (ver `analisis-tab-standard.md`) | `@/components/analisis` |
| Recordar algo del usuario, avisos y confirmaciones | `usePreferencia`, `usePreferenciaParte` y `useAvisos` (`avisar`, `avisarError`, `confirmar`) | `@/components/ui` |

`StatCard` es un adaptador `@deprecated` de `TarjetaKpi`: en pantallas nuevas usa `TarjetaKpi`.

---

## Estructura de página estándar (obligatoria)

Toda página del dashboard sigue esta estructura de secciones en orden:

```
1. Sub-module nav  (sticky top, z-30)
2. Franja del flujo (BannerFlujo, solo si la pantalla tiene flujo) y/o Alert banner (solo si hay alertas — bg-red-50)
3. Page header     (bg-white, border-b, px-8 py-6)
   ├── Ícono del módulo  (p-3 rounded-2xl, bg-{color}-50 text-{color}-600)
   ├── Título (text-3xl font-black text-gray-900)
   ├── Subtítulo (text-sm text-gray-400): una frase sobre la pantalla, sin flechas ni «Pipeline: A → B → C»
   └── Botones top-right (Actualizar + acción principal)
4. Indicadores     (FranjaKpis con 1 a 6 TarjetaKpi; las columnas las decide el ancho de la franja)
5. Barra de la lista (BarraTabla: pestañas con Contador, búsqueda, filtro de estados, Ajustar tabla, Lista / Kanban, Pantalla completa)
6. Tabla (TablaEstandar) o Tablero (TableroKanban)
7. Pie             (el de TablaEstandar: «Mostrando 1–25 de 134» y la paginación; el tablero lleva el total en cada columna)
```

El flujo (Solicitud → Cotización → Pedido…) se dibuja SOLO con la franja del flujo o la cadena de documentos, nunca con un subtítulo de texto.

---

## Componentes y sus tokens

Las pantallas usan `SubNav` y `PageHeader` de `@/components/ui` (el color es un `AccentColor`). Los tokens `NAV` y `PAGE_HEADER` y los dos ejemplos de marcado a mano que siguen son SOLO para cuando no hay componente.

### Sub-module nav (marcado a mano, solo si no hay componente)
```tsx
// Usar NAV.* del design-system
<div className={NAV.wrapper}>
  <span className={NAV.label}>MÓDULO:</span>
  {SUB_MODULES.map(m => (
    <Link key={m.href} href={m.href} className={`${NAV.pill} ${m.href === rutaActual ? NAV.pillActive : NAV.pillInactive}`}>
      {m.label}
    </Link>
  ))}
</div>
```

### Page Header (marcado a mano, solo si no hay componente)
```tsx
<div className={PAGE_HEADER.wrapper}>
  <div className={PAGE_HEADER.inner}>
    <div className="flex items-center gap-4">
      <div className={`${PAGE_HEADER.iconWrapper} bg-indigo-50 text-indigo-600`}>
        <Icono size={30}/>
      </div>
      <div>
        <h1 className={PAGE_HEADER.title}>Título de Página</h1>
        <p className={PAGE_HEADER.subtitle}>Solicitudes, cotizaciones y pedidos de tus clientes en un solo lugar.</p>
      </div>
    </div>
    <div className={PAGE_HEADER.actions}>
      <button className={BTN.secondary}><RefreshCw size={14}/> Actualizar</button>
      <button className={BTN.primary}><Plus size={15}/> Nueva Acción</button>
    </div>
  </div>
</div>
```

### Indicadores: `FranjaKpis` y `TarjetaKpi`

Una sola tarjeta de indicadores para toda la app. Ícono a la izquierda, el nombre arriba, el valor grande y UNA línea debajo (la variación contra el período anterior o, si no hay, la ayuda). NUNCA tarjetas con fondo de color, con `text-4xl` ni hechas a mano en la pantalla.

El ejemplo completo está en «Una pantalla con lista y tablero» (más abajo).

- `kpi="…"` es un id de `CATALOGO_KPI` (`@/lib/kpis`): la ÚNICA fuente de nombres, ícono, color, formato y de si subir es mejor. Un indicador nuevo se agrega al catálogo, no en la pantalla. `etiqueta`, `icono`, `color` y `formato` lo sobrescriben solo cuando no hay un id (por ejemplo una etapa del CRM). El ícono toma el color del catálogo: el acento del Hub no lo pisa.
- `FranjaKpis` acepta de 1 a 6 tarjetas y decide las columnas por el ancho de SU contenedor (container queries), no por el de la pantalla. Una tarjeta condicional (`{cond && <TarjetaKpi …/>}`) no deja hueco.
- **Valor y carga:** completo y sin centavos (`$4.927.538`); si no cabe, la letra se achica y la cifra completa va en el `title`. Un valor que no llegó (`null`) se ve «—». `useEstadoKpi(loading, error)` da el estado: `'cargando'` pinta barras grises (nunca 0 ni «Todas al día»), `'actualizando'` atenúa lo que ya se veía y `'error'` dice «—» y «No se pudo cargar».
- **Variación:** solo si la cifra es de un período: `variacion={{ actual, anterior }}` pinta la flecha, el texto (`+12,5 %`, `−8 %`, `Nuevo`, `Sin cambio`) y «vs 30 días antes» (`PERIODO_KPI`: 30 días contra los 30 anteriores). Una cifra de hoy sin comparación (el saldo por cobrar) lleva `variacion={{ actual, anterior: null, es_foto: true }}` y dice «Hoy» (`es_foto` va DENTRO de `variacion`), o no lleva `variacion`. `mejorSiSube` sale del catálogo (con `null`, la variación va en gris). La flecha y el texto van siempre: el color nunca va solo. La variación va en -700 y el «vs …» en slate-600 (también en `StatCard`, que usa `TarjetaKpi`).
- **Pulsable:** con `onClick` es un `<button>` (`aria-pressed` = `activo`, con el anillo del color). Solo si equivale a una vista existente de la pantalla: su clic despacha `accionPestana(estado, vista, opcionesEstados)` al estado único, igual que un clic en la pestaña. Lo mismo vale para las cajas de la franja del flujo que cambian de vista.
- `tono="alerta"` pinta la tarjeta con borde y fondo rosa; `tono="bien"`, la ayuda en verde. Un número suelto (pestañas, pastillas, columnas del tablero) se pinta con `<Contador valor={n} estado={estado} />`: con `valor` `null` es una barra gris, nunca 0; con `estado="error"`, «—».

### Franja del flujo: `BannerFlujo`

UNA sola franja arriba, igual en Ventas, Compras y en las listas: el semáforo («Con atraso», «No resueltos» y «Ver todo»), los pasos con su conteo y, a la derecha, «¿Cómo funciona?» y «Ocultar flujo» (el modo compacto se recuerda en `flujo:<idPreferencia>`). Se usa EN LUGAR DEL subtítulo «Pipeline: A → B → C» y de los semáforos hechos a mano. Va directo en el `<main>`, sin otro padding horizontal alrededor, y necesita un padre con ancho definido.

```tsx
'use client';

import { BannerFlujo, useResumenFlujo } from '@/components/flujo';
import type { FiltroSemaforo } from '@/components/flujo';
import type { DespacharTabla, EstadoTabla, OpcionesEstados } from '@/components/tabla';
import { alternarSeleccion, pasosConConteos } from '@/lib/flujo';
import { PASOS_FLUJO_VENTAS, conteosDesdeResumen, tabHubDePaso, textoRegla } from '@/lib/flujo-ventas';
import { accionPestana } from '@/lib/tabla';

type Props = { estado: EstadoTabla; despachar: DespacharTabla; recargaFlujo: number; opcionesEstados: OpcionesEstados };

export function FranjaFlujoVentas({ estado, despachar, recargaFlujo, opcionesEstados }: Props) {
  const flujo = useResumenFlujo('/ventas/flujo', recargaFlujo); // atado al usuario del token, como useListado
  const filtro: FiltroSemaforo =
    estado.semaforo === 'atrasados' || estado.semaforo === 'no_resueltos' ? estado.semaforo : 'todos';
  return (
    <BannerFlujo
      titulo="Flujo comercial"
      idPreferencia="ventas"
      regla={textoRegla(flujo.datos?.dias_alerta)}
      semaforo={{
        atrasados: flujo.datos?.semaforo?.atrasados ?? null,
        noResueltos: flujo.datos?.semaforo?.no_resueltos, // undefined si la pantalla no tiene ese botón
        filtro,
        onFiltrar: (f) => despachar({ tipo: 'semaforo', valor: f === 'todos' ? null : f }),
      }}
      pasos={pasosConConteos(PASOS_FLUJO_VENTAS, conteosDesdeResumen(flujo.datos), {
        seleccionado: estado.paso,
        cargando: !flujo.datos,
      })}
      cargando={flujo.cargando}
      error={flujo.error}
      onReintentar={flujo.recargar}
      onSeleccionarPaso={(clave) => {
        const paso = alternarSeleccion(estado.paso, clave); // tocarlo otra vez lo quita
        despachar({ tipo: 'paso', valor: paso });
        const vista = paso ? tabHubDePaso(paso) : null; // 'sc', 'cot' o 'ven'
        if (vista) despachar(accionPestana(estado, vista, opcionesEstados));
      }}
    />
  );
}
```

- Otras props: `regla` (`textoRegla` en Ventas, `textoReglaCompras` en Compras), `avisos`, `accionAjustar` («Ajustar tiempos», solo administradores) y `mostrarAntiguedad`.
- **Los pasos** salen de `pasosConConteos(definicion, conteos, { actual, seleccionado, cargando })`: `PASOS_FLUJO_VENTAS` con `conteosDesdeResumen(flujo.datos)` en Ventas, o `PASOS_FLUJO_COMPRAS` (`@/lib/flujo-compras`) con `conteosDePasos(flujo.datos)` (`@/lib/flujo`) en Compras.
- **Tocar un paso o un botón del semáforo** pone ese filtro en el estado único (`paso` o `semaforo`) y tocarlo otra vez lo quita. Si cambia la vista, usa `accionPestana`.
- **Conteos que no vienen:** pásalos `undefined`, nunca `null`. Un `null` con los datos ya cargados deja la barra gris para siempre (`null` es «todavía carga»). Compras no tiene «No resueltos»: no pases `noResueltos` (ni como `null` mientras carga).
- **Con error:** toda la franja muestra «—» y una línea con «Reintentar» (`onReintentar={flujo.recargar}`); la pantalla no hace nada más.
- **En una lista** (Solicitudes, Cotizaciones, Pedidos) la caja de la pantalla es `actual` («Estás aquí»), no lleva `href`; las demás llevan el `href` de su lista:

```tsx
import { pasosConConteos } from '@/lib/flujo';
import { PASOS_FLUJO_VENTAS, conteosDesdeResumen } from '@/lib/flujo-ventas';
import type { DatosFlujo } from '@/components/flujo';

export function pasosDeSolicitudes(datos: DatosFlujo | null) {
  return pasosConConteos(PASOS_FLUJO_VENTAS, conteosDesdeResumen(datos), { actual: 'SC', cargando: !datos })
    .map((p) => (p.esEste ? p : { ...p, href: p.ruta }));
}
```

#### Cadena de documentos

En el detalle de un documento y en el panel rápido, los pasos Solicitud → Cotización → Pedido de venta (→ Compra) los pinta `CadenaDocumentos`. Las etiquetas de estado salen de `infoEstadoSolicitud`, `infoEstadoCotizacion` e `infoEstadoPedido`; la pantalla no las pasa. Necesita un padre con ancho definido.

```tsx
import { CadenaDocumentos } from '@/components/flujo';

type Documento = { id: number; numero: string; estado: string };

export function CadenaDelPedido({ pedido, fila }: { pedido: Documento; fila: Documento }) {
  return (
    <>
      <CadenaDocumentos doc={pedido} tipo="PVEN" />
      {/* El panel rápido: solo los números; las cajas caídas conservan su palabra (Cancelado, Rechazada). */}
      <CadenaDocumentos doc={fila} tipo="VEN" compacta />
    </>
  );
}
```

`PasosFlujo` (variantes `banner`, `barra` y `mini`) es la única forma de dibujar pasos; los de un documento llegan armados con `pasosConProgreso` (`@/lib/flujo`) o `pasosDeTracking` (`@/lib/flujo-compras`).

### Tabla estándar: `TablaEstandar` y `BarraTabla`

Toda lista con tabla usa `TablaEstandar` (`@/components/tabla`) con su barra `BarraTabla`. No se arma un `<table>` a mano para una lista. El token `TABLE` de `design-system.ts` trae SOLO las clases de estas piezas; ya no existen `TABLE.wrapper`, `thead`, `th`, `thFirst`, `tbody`, `tr`, `td`, `tdFirst` ni `footer`.

#### Una pantalla con lista y tablero

Un estado por pantalla (`useEstadoTabla`): las tarjetas pulsables, las pestañas, el semáforo, las cajas del flujo, los filtros, la tabla y el tablero despachan acciones a ese estado y no hay otro estado de lista.

```tsx
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FranjaKpis, MenuFila, ModalMotivo, TableroKanban, TarjetaKpi, useEstadoKpi, useTableroKanban,
} from '@/components/ui';
import type { DatosTarjetaKanban } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { ColumnaTabla, OpcionEstado, PestanaTabla } from '@/components/tabla';
import { apiFetch } from '@/lib/api';
import { TABLE } from '@/lib/design-system';
import { infoEstadoPedido } from '@/lib/estados-pedido';
import { COLUMNAS_PEDIDO, estadoDeTarjeta, reglaSoltarPedido } from '@/lib/kanban-ventas';
import { formatoPesos } from '@/lib/pesos';
import { accionPestana, dependenciasTablero, estadoDelTotal, normalizarRespuesta, queryListado } from '@/lib/tabla';

type Pedido = { id: number; numero: string; cliente: string; estado: string; total_cop: number; atrasado: boolean };

const ID = 'ventas.pedidos'; // el MISMO id en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban
const INICIAL = { vista: 'todos', orden: 'atencion' };
const ESTADOS: OpcionEstado[] = [
  { valor: 'EN_PROCESO', etiqueta: 'En proceso' },
  { valor: 'ENTREGADO', etiqueta: 'Entregado' },
];

// claseFila: solo tonos OPACOS de TABLE (filaAlerta, filaAviso, filaInfo, filaApagada); estable (módulo).
const claseDeFila = (p: Pedido) => (p.atrasado ? TABLE.filaAlerta : null);

const tarjetaDe = (p: Pedido): DatosTarjetaKanban => ({
  numero: p.numero,
  tipo: 'PVEN',
  titulo: p.cliente,
  monto: p.total_cop,
  estado: estadoDeTarjeta('PVEN', p.estado),
  atrasada: p.atrasado,
});

// stats: las cifras de período (GET /ventas/stats); el resto sale del listado.
export function PedidosDeVenta({ stats }: { stats: { vendido: number | null; vendido_anterior: number | null } | null }) {
  const router = useRouter();
  const abrir = useCallback((p: Pedido) => router.push(`/dashboard/ventas/venta/${p.id}`), [router]);

  const [estado, despachar, listo] = useEstadoTabla(ID, INICIAL);

  // Las columnas: estables (useMemo o una constante); sus celdas solo dependen de la fila.
  const columnas = useMemo<ColumnaTabla<Pedido>[]>(() => [
    { id: 'numero', titulo: 'Pedido', ancho: 150, clave: true, fija: 'izquierda', ordenable: true, celda: (p) => p.numero },
    { id: 'cliente', titulo: 'Cliente', ancho: 160, flexible: true, ordenable: 'cliente', celda: (p) => p.cliente },
    { id: 'estado', titulo: 'Estado', ancho: 140, celda: (p) => infoEstadoPedido(p.estado).label },
    { id: 'total', titulo: 'Total', ancho: 130, alinear: 'derecha', ordenable: 'total_cop', celda: (p) => formatoPesos(p.total_cop) },
    {
      id: 'acciones', titulo: 'Acciones', ancho: 64, fija: 'derecha',
      celda: (p) => <MenuFila items={[{ etiqueta: 'Abrir', onClick: () => abrir(p) }]} />,
    },
  ], [abrir]);

  const prefs = usePreferenciasTabla(ID, columnas); // UNA sola vez por id: la tabla y «Ajustar tabla» la comparten
  const listado = useListado<Pedido>({
    ruta: '/ventas/pedidos', estado, esperar: !listo, despachar, conConteos: true, conResumen: true,
  });
  const anchoTablaRef = useRef<number | null>(null);
  const pantalla = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa: el conmutador sigue visible dentro de la tarjeta.
  useEffect(() => { if (estado.modo === 'kanban') pantalla.salir(); }, [estado.modo, pantalla.salir]);
  const estadoKpis = useEstadoKpi(listado.cargandoInicial || listado.recargando, listado.error);

  // El tablero: el mismo id, el mismo tamaño y los mismos filtros que la tabla; solo carga en modo Kanban.
  const tablero = useTableroKanban<Pedido>({
    pantalla: ID,
    modo: 'servidor',
    columnas: COLUMNAS_PEDIDO,
    activo: listo && estado.modo === 'kanban',
    porColumna: estado.tamano,
    dependencias: dependenciasTablero(estado),
    ordenDe: (c) => (c.cerrada ? '-creado' : 'atencion'),
    cargar: async (columna, { offset, limit, orden, signal }) => normalizarRespuesta(
      await apiFetch(`/ventas/pedidos?${queryListado(estado, { columna: columna.clave, orden, limit, offset })}`, { signal }),
    ),
  });
  const [cancelando, setCancelando] = useState<{ pedido: Pedido; origen: string; destino: string } | null>(null);

  const pestanas: PestanaTabla[] = [
    { id: 'todos', etiqueta: 'Todos', conteo: listado.conteos?.todos ?? null },
    { id: 'en_curso', etiqueta: 'En curso', conteo: listado.conteos?.en_curso ?? null },
  ];

  return (
    <div className="flex flex-col gap-4">
      <FranjaKpis estado={estadoKpis}>
        <TarjetaKpi
          kpi="vendido_periodo"
          valor={stats?.vendido ?? null}
          variacion={{ actual: stats?.vendido ?? null, anterior: stats?.vendido_anterior ?? null }}
        />
        <TarjetaKpi kpi="pven_saldo_por_cobrar" valor={listado.resumen?.saldo_cop ?? null} ayuda="Pedidos con saldo pendiente" />
        <TarjetaKpi
          kpi="pven_en_curso"
          valor={listado.conteos?.en_curso ?? null}
          activo={estado.vista === 'en_curso'}
          onClick={() => despachar(accionPestana(estado, 'en_curso', ESTADOS))}
        />
      </FranjaKpis>

      {pantalla.capa}
      <section ref={pantalla.refTarjeta} className={pantalla.claseTarjeta}>
        <BarraTabla
          estado={estado}
          onEstado={despachar}
          pestanas={pestanas}
          estadoConteos={estadoKpis}
          opcionesEstados={ESTADOS}
          ajustes={{ columnas, preferencias: prefs, anchoRef: anchoTablaRef }}
          kanbanDisponible
          pantallaCompleta={estado.modo === 'lista' ? pantalla : undefined}
          total={listado.total}
          estadoTotal={estadoDelTotal({
            total: listado.total, cargando: listado.cargandoInicial, recargando: listado.recargando, error: listado.error,
          })}
        />
        {estado.modo === 'lista' && (
          <TablaEstandar
            id={ID}
            modo="servidor"
            columnas={columnas}
            preferencias={prefs}
            anchoRef={anchoTablaRef}
            estado={estado}
            onEstado={despachar}
            filas={listado.filas}
            total={listado.total}
            cargando={listado.cargandoInicial}
            recargando={listado.recargando}
            error={listado.error}
            onReintentar={listado.recargar}
            aviso={listado.avisoOrden}
            onFila={abrir}
            claseFila={claseDeFila}
            etiqueta="Pedidos de venta"
          />
        )}
      </section>

      {estado.modo === 'kanban' && (
        <TableroKanban
          tablero={tablero}
          regla={reglaSoltarPedido}
          tarjetaDe={tarjetaDe}
          onAbrir={abrir}
          onCambio={async (p, resultado) => {
            await apiFetch(`/ventas/pedidos/${p.id}`, {
              method: 'PATCH', body: JSON.stringify({ estado: resultado.estado, ...resultado.cuerpo }),
            });
          }}
          onAccion={(p, resultado, origen, destino) => {
            // Cada acción que devuelve la regla necesita su manejador (reglaSoltarPedido también da 'facturar').
            if (resultado.accion === 'cancelar') setCancelando({ pedido: p, origen, destino });
          }}
          color="indigo"
        />
      )}

      {cancelando && (
        <ModalMotivo
          titulo={`Cancelar ${cancelando.pedido.numero}`}
          efectos={['El pedido pasa a Cancelado.']}
          textoConfirmar="Cancelar pedido"
          onConfirmar={async (motivo) => {
            await apiFetch(`/ventas/pedidos/${cancelando.pedido.id}`, {
              method: 'PATCH', body: JSON.stringify({ estado: 'CANCELADO', cancellation_reason: motivo }),
            });
            tablero.recargar([cancelando.origen, cancelando.destino]);
          }}
          onCerrar={() => setCancelando(null)}
        />
      )}
    </div>
  );
}
```

##### Estado y datos (los hooks de `components/tabla`)

- `useEstadoTabla(id, inicial)` devuelve `[estado, despachar, listo]`. El estado es `{ vista, modo, semaforo, paso, estados, q, orden, pagina, tamano }`; todo cambio que no sea de página vuelve a la página 1 y limpia la selección. La sesión (`tabla-sesion:{id}`) guarda pestaña, página, búsqueda, orden, semáforo, paso y estados para volver a lo mismo al regresar de un documento; el modo va en `vista:{id}` y el tamaño (25 o 50) en `tabla:{id}`.
- `usePreferenciasTabla(id, columnas)` recuerda el orden, el ancho y las columnas ocultas del usuario. Se llama UNA sola vez por id y su resultado se pasa por props a `TablaEstandar` y a `ajustes` de `BarraTabla`: dos instancias se pisarían los anchos. `columnas` tiene que ser estable (una constante o `useMemo`).
- `useListado({ ruta, estado, esperar, despachar, conConteos, conResumen, extra, activo })` pide la página al servidor con los parámetros de `core/listados.py`. Pásale siempre `esperar: !listo` (sin petición hasta tener las preferencias, a lo sumo 4 s, y con el esqueleto a la vista; NUNCA `activo: listo`, que pintaría «vacío») y el `despachar`: un 422 «No se puede ordenar por…» vuelve solo al orden por defecto y `avisoOrden` trae el mensaje. `activo: false` es para una pestaña oculta: conserva lo último. `estado` tiene que ser el de `useEstadoTabla`, sin derivar.
- `useListadoCliente(filas, estado, accesores)` es para endpoints chicos que devuelven todo: filtra, ordena y pagina en el navegador. Sus accesores tienen que ser estables. La tabla va con `modo="cliente"` y `cargando={!listo || cliente.cargandoInicial}`.

##### Columnas (`ColumnaTabla<T>`)

- `id`, `titulo` y `celda(fila)` son obligatorios. `ancho`, `anchoMin` y `anchoMax` en px, `alinear`, `ordenable` (`true` ordena por el id; un texto es el campo de orden del servidor), `valorOrden` (modo cliente), `titleCelda` y `ocultaPorDefecto` (las columnas de poco uso salen ocultas y se muestran con «Ajustar tabla»).
- `clave: true` va en la columna del número del documento (nunca se oculta). `fija: 'izquierda' | 'derecha'` la deja pegada al lado.
- `flexible: true` va en UNA sola columna, Cliente o Proveedor: toma el espacio que sobra. A 1024 px con el menú abierto las columnas clave tienen que caber sin correr la tabla; si no caben, baja primero el ancho por defecto de esta columna (hasta 120). Con el asa no pasa de su `anchoMax`; si la pantalla quiere poder ensancharla en monitores anchos, que le dé un `anchoMax` mayor.
- `celda` y `claseFila` solo dependen de la fila y de lo que esté en las dependencias del `useMemo` de `columnas` (o de la identidad de `claseFila`), porque el cuerpo de la tabla está memoizado.

##### Filas y tonos (`TABLE`)

- `claseFila` solo da tonos OPACOS de `TABLE`: `filaAlerta`, `filaAviso`, `filaInfo` o `filaApagada`. NUNCA un tinte translúcido (`bg-red-50/40`): las columnas fijas heredan el fondo de la fila (`bg-inherit`) y un `/NN` deja ver lo que pasa debajo. Los tintes translúcidos de las pantallas viejas (`bg-purple-50/30`…) se cambian por el token opaco más parecido.
- `onFila(fila)` abre la fila con un clic o con Enter (no si el clic cae en un enlace, un botón, una casilla o el menú ⋯). Otras props: `claveFila`, `grupoFila` y `tituloGrupo` (separadores «Atrasados · 3»), `seleccion`, `onSeleccion` y `seleccionable` (casillas), `vacio` y `pie`.
- Estados: cargando (esqueleto, nunca ceros), recargando (filas atenuadas), error con «Reintentar» (sin filas viejas) y sin filas (`vacio`). `aviso` (el `avisoOrden`) es un aviso ámbar sobre la tabla que no tapa las filas.
- La tarjeta que encierra la barra y la tabla la pone `usePantallaCompleta()`: `pantalla.claseTarjeta` (`TABLE.tarjeta`, o `TABLE.tarjetaCompleta` en «Pantalla completa»), `pantalla.capa` (`TABLE.capaCompleta`), `pantalla.refTarjeta` y `pantalla.salir()`.
- Tablas de detalle dentro de un documento: `modo="simple"`, sin estado, paginación, orden ni selección; no recuerda nada salvo que le pases `preferencias`.

```tsx
import { TablaEstandar } from '@/components/tabla';
import type { ColumnaTabla } from '@/components/tabla';
import { formatoPesos } from '@/lib/pesos';

type Linea = { id: number; producto: string; cantidad: number; total_cop: number };

const COLUMNAS_LINEAS: ColumnaTabla<Linea>[] = [
  { id: 'producto', titulo: 'Producto', ancho: 240, flexible: true, celda: (l) => l.producto },
  { id: 'cantidad', titulo: 'Cant.', ancho: 80, alinear: 'derecha', celda: (l) => l.cantidad },
  { id: 'total', titulo: 'Total', ancho: 130, alinear: 'derecha', celda: (l) => formatoPesos(l.total_cop) },
];

export function LineasDelPedido({ lineas }: { lineas: Linea[] }) {
  return <TablaEstandar id="ventas.pedido.lineas" modo="simple" columnas={COLUMNAS_LINEAS} filas={lineas} etiqueta="Productos del pedido" />;
}
```

##### La barra (`BarraTabla`)

`FiltroEstados`, `MenuAjustes`, `Paginacion` y `Esqueleto` son parte de la barra y de la tabla: ellas los pintan.

- Pestañas `{ id, etiqueta, conteo, alerta? }`: la activa es `estado.vista`. El número va en `Contador` (`conteo: null` mientras carga, nunca 0; `estadoConteos` en `'error'` pinta «—»). Sin emojis.
- Búsqueda y filtro de estados (`opcionesEstados`: un arreglo o una función de la vista) con etiquetas legibles, nunca el código crudo; el filtro muestra, marcados, los estados que queden filtrados aunque la pestaña no los tenga, para poder quitarlos. `filtros` es un espacio para filtros propios de la pantalla.
- «Ajustar tabla» (solo en Lista y solo con `ajustes`), `ConmutadorVista` (solo con `kanbanDisponible`), «Pantalla completa» (solo con `pantallaCompleta`; en Kanban no se pasa: es de la tabla) y «N resultados» (con `total` va siempre `estadoTotal`, de `estadoDelTotal`).
- Al pasar a Kanban, sal de la pantalla completa (`pantalla.salir()`, el efecto del ejemplo): el conmutador sigue visible dentro de la tarjeta a pantalla completa y, sin la salida, el tablero queda tapado.
- Todo despacha al estado único; al cambiar de pestaña, `accionPestana` quita los estados filtrados que la pestaña nueva no tiene.

### Tablero Kanban: `TableroKanban`

Un solo tablero para toda la app (Hub de Ventas, listas, Compras, Entregas, Leads del CRM…). Cada módulo define sus columnas y su regla de soltar en su librería (`COLUMNAS_PEDIDO` y `reglaSoltarPedido` en `lib/kanban-ventas.js`, `COLUMNAS_ENTREGA` en `lib/entregas.js`, `columnasDesdeEtapas` en `lib/crm-etapas.js`…). El ejemplo de arriba es la forma de conectarlo.

- **Datos** con `useTableroKanban`: `modo: 'servidor'` hace una consulta por columna (`cargar(columna, { offset, limit, orden, signal })`) y `modo: 'cliente'` agrupa los `items` en el navegador. `items` y `columnas` tienen que ser estables. `pantalla` es el mismo id de `useEstadoTabla`; `activo = listo && estado.modo === 'kanban'`, `porColumna = estado.tamano` y `dependencias = dependenciasTablero(estado)`.
- **Columnas:** `{ clave, titulo, tono, estados?, cerrada?, ayuda? }` (`definirColumnas`). Las `cerrada` salen plegadas la primera vez; las plegadas se recuerdan en `kanban:<pantalla>`. Una columna que falla muestra «Reintentar»; vacía, «Sin documentos aquí» (`vacio`).
- **Regla de soltar** `(item, origen, destino) => ResultadoSoltar`: `'ninguno'`, `'bloqueado'` (con su motivo), `'cambio'` (mueve la tarjeta, llama `onCambio` y, si falla, la devuelve y avisa) o `'accion'` (se la pasa a `onAccion`: la pantalla abre su ventana y, al terminar, llama `tablero.recargar([origen, destino])`). Sin `regla` o con `soloLectura`, el tablero es solo para ver.
- **Arrastre** con pointer events (con 6 px o más; menos es un clic que llama `onAbrir`). Con el teclado y en el celular, el menú ⋯ trae «Abrir», «Mover a …» por columna (las bloqueadas, deshabilitadas con su motivo) y las `accionesTarjeta(item)` de la pantalla.
- **Cancelar o rechazar** pide el motivo con `ModalMotivo` (nunca `prompt`): se confirma con 5 caracteres o más, y si falla el error queda en la ventana sin borrar lo escrito.
- **Tarjeta** (`TarjetaKanban`): `tarjetaDe(item)` devuelve `{ numero, tipo, titulo, subtitulo, monto, estado, chips, tiempo, atrasada, accionPrincipal }`; el estado con `estadoDeTarjeta(tipo, estado)` (`lib/kanban-ventas.js`) y `accionPrincipal` con `href: null` es solo texto. Para una tarjeta propia, `renderTarjeta`.
- El tablero ocupa todo el ancho del contenido, SIN una tarjeta que lo encierre; los contadores de columna son `Contador`.

### Botón de vista, menú de fila y motivo

```tsx
import { ConmutadorVista, useVistaGuardada } from '@/components/ui';

// Solo para pantallas SIN tabla estándar: con tabla, el dueño de vista:<id> es useEstadoTabla (BarraTabla pinta el botón).
export function VistaDeLeads() {
  const [modo, setModo, listo] = useVistaGuardada('crm.leads', 'kanban');
  return listo ? <ConmutadorVista modo={modo} onCambiar={setModo} color="purple" /> : null;
}
```

- `ConmutadorVista` es el ÚNICO botón «Lista / Kanban» (controlado: recibe `modo` y `onCambiar`). Con `kanbanDisponible={false}` no pinta nada.
- `MenuFila` es el ÚNICO menú ⋯ (filas y tarjetas). Ítems `{ etiqueta, icono?, onClick, peligro?, oculto?, deshabilitado?, titulo? }`; `ModalMotivo` es la ÚNICA ventana de motivo (ver el tablero).
- Preferencias del usuario: `usePreferencia(clave, porDefecto)` devuelve `[valor, guardar, listo]`; nada se escribe antes de `listo` y la clave es `tabla:`, `vista:`, `kanban:`, `flujo:` o `analisis:` más el id. `vista:<id>` la escribe un solo hook, `useEstadoTabla`: por eso en una pantalla con tabla no se usa `useVistaGuardada`.

### Capturas: qué revisar

- **Franja del flujo:** crece cuando llegan los datos (de unos 177 a 253 px en el Hub); es aceptado, pero mide el CLS a 1024 y 1440 px (si pasa de 0,1, avísalo). A 1024 px con el menú abierto las 5 cajas tienen que caber por encima de `@2xl`; a 1280 y 1366 px los chips de aviso se recortan (con `title`).
- **Tabla:** a 1024 px con el menú abierto, las columnas clave sin correr la tabla. En pantalla completa el botón flotante de la IA asoma unos 14 px sobre el pie, aunque su esquina ya está reservada (`pr-20`); fuera de ella puede tapar el pie de una tabla al fondo de la página.
- **Kanban:** pasar a Kanban desde la pantalla completa deja el tablero a la vista.
- **Análisis:** ver la sección 9 de `analisis-tab-standard.md`.

### Tabs de módulo (estilo Hub — indigo)
```tsx
<div className={TABS_BAR.group}>
  {TABS.map(tab => (
    <button key={tab} className={activeTab===tab ? TABS_BAR.tabActive : TABS_BAR.tabInactive}>
      {tab}
    </button>
  ))}
</div>
```
Las pestañas de ESTADO de una lista (con su búsqueda) son las de `BarraTabla`; ya no se arman con `TABS_BAR.tabActiveAmber` ni con `SEARCH_BAR`.

### Badge de Estado
```tsx
const info = infoEstadoPedido(item.estado); // infoEstadoCotizacion o infoEstadoPec según el tipo
<span className={`${BADGE.base} ${info.clases.bg} ${info.clases.text}`}>{info.label}</span>
```
El estado se ve SIEMPRE con su etiqueta y sus clases de la librería de su tipo (`lib/estados-pedido.js`, `estados-cotizacion.js`, `estados-compras.js`), nunca con el código crudo. `infoEstadoSolicitud` (`estados-solicitud.js`) trae `color`, `bg` y `border` en hex: van con `style`. `getEstadoClass` es el mapa legado de `design-system.ts`.

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

### Pestaña Análisis
Toda pestaña Análisis es `PanelAnalisisPerezoso` de `@/components/analisis`; las cifras, los gráficos y el asistente «En construcción» están en `analisis-tab-standard.md`. Sus indicadores son las mismas `TarjetaKpi` de arriba.

---

## Reglas Tailwind críticas (NUNCA romper)

- ❌ NUNCA `text-${variable}` ni `bg-${variable}` — Tailwind no purga clases dinámicas
- ✅ SIEMPRE clases hardcoded o `style={{ color: variable }}`
- ❌ Íconos Lucide que NO existen en la versión instalada (1.31): `Instagram`, `Facebook`
- ✅ WhatsApp = `MessageCircle` (no `MessageSquare`)
- ✅ El menú lateral mide 256 px (`w-64`) abierto y `w-20` plegado. El `left: '240px'` de `DETAIL_PANEL.overlayStyle` es un valor viejo.
- NUNCA variantes `dark:`: la app es siempre clara (`test_tema_claro.mjs` lo vigila). Las clases de las piezas nuevas son literales, sin `dark:`.
- NUNCA `alert()`, `confirm()` ni `prompt()` del navegador: los avisos y las confirmaciones van por `useAvisos()` y los motivos por `ModalMotivo` (`test_sin_dialogos_nativos.mjs` lo vigila).
- NUNCA un cero ni un texto de «todo en orden» mientras algo carga: `Contador`, `TarjetaKpi` y el esqueleto de la tabla pintan barras grises; una cifra que no llegó es «—».
- SIEMPRE los montos completos, en pesos enteros y con puntos de miles (`$1.062.523`, `formatoPesos` de `lib/pesos.js`); porcentajes `45,2 %`; fechas en hora de Colombia (`lib/fechas-colombia.js`).
- SIEMPRE textos en español con tildes, estados con su etiqueta (nunca el código crudo) y sin emojis en pestañas ni botones. Todo control interactivo tiene foco visible.

## Fuente de verdad — colores por módulo

| Módulo | Acento (`AccentColor`) | Nav pill activo (`ACCENTS[acento].navActive`) | `MODULE_COLORS` (legado, sin uso) |
|--------|------------------------|-----------------------------------------------|-----------------------------------|
| Ventas | indigo | bg-indigo-600 text-white | indigo + amber |
| Compras | purple | bg-purple-600 text-white | blue + cyan |
| Inventario | teal | bg-teal-600 text-white | teal + emerald |
| CRM | purple | bg-purple-600 text-white | violet + purple |
| Finanzas | blue | bg-blue-600 text-white | emerald + green |

El acento de un Hub es el de `analisis-tab-standard.md`, sección 1. El ícono de una `TarjetaKpi` toma el color de su id en `CATALOGO_KPI`; el acento no lo pisa. `cyan`, `violet` y `green` no son un `AccentColor`.
