'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Package, Plus, ChevronLeft, Save,
  Globe, Tag, Layers, DollarSign, RefreshCw
} from 'lucide-react';
// B4 T18: Productos en la tabla estándar, en modo servidor (R5, R11; RP47 a RP49): el buscador por fin filtra (q), la página es de
// 25 o 50 (antes, limit=100 y un total mal leído), «Requiere revisión» y «Sin tarifa de IVA» (B3-T8) son filtros de la barra
// que van al servidor, el enlace ?id= pide /products?id= (antes solo buscaba en lo cargado) y el tablero solo para ver agrupa
// por categoría (R11). La ficha (formulario, variantes, stock y E-Commerce) y el guardado son los de B1 a B3, sin cambios.
import { apiFetch as _apiFetch, API_URL } from '@/lib/api';
import { SubNav, PageHeader, Badge, Button, TableroKanban, useAvisos, useTableroKanban } from '@/components/ui';
import { AvisoDeError } from '@/components/ui/AvisoFuente';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { ColumnaTabla } from '@/components/tabla';
import { TARIFAS_IVA, etiquetaTarifaCatalogo, normalizarTarifaIva, sinTarifaIva } from '@/lib/iva';
import { accionesDeFiltros, dependenciasTablero, estadoDelTotal, filtrosDePantalla, normalizarRespuesta } from '@/lib/tabla';
import { textoDeError } from '@/lib/avisos';
import {
  TEXTO_SOLO_VER_PRODUCTOS, abrirEnlaceProducto, columnasProductos, consultaColumnaProducto, costoDeProducto, estadoReintento, extraProductos,
  precioDeProducto, tarjetaProducto, textoVacioProductos,
} from '@/lib/estados-compras';
import { INV_NAV } from '../inv-nav';
import { CONTENEDOR, FOCOS, SelectorCatalogo, pesos, useCatalogo } from '../piezas-inventario';
import { AvisoCatalogoViejo } from '../aviso-catalogo';
import { RESERVA_BOTON_IA } from '@/lib/design-system';

/** Un producto de GET /products (ProductResponse + precio_venta, costo y publicado de T13, RP91). Los nombres son los del servidor. */
type Producto = {
  id: number;
  name?: string | null;
  type?: string | null;
  tarifa_iva?: string | null;
  necesita_revision?: boolean | null;
  is_active?: boolean | null;
  category?: { id: number; name?: string | null } | null;
  skus?: { id: number; sku?: string | null }[] | null;
  precio_venta?: number | string | null;
  costo?: number | string | null;
  publicado?: boolean | null;
  // La ficha lee más campos del producto (descripción, marca, unidad…): se pasan tal cual a openEdit.
  [campo: string]: unknown;
};
/** Los filtros extra de la barra (B3-T8, RP48; T18 r1, m4): van al servidor como necesita_revision, sin_tarifa_iva y category_id. */
type FiltrosProductos = { revision: boolean; sinTarifa: boolean; categoria: string };

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_PRODUCTOS = 'inventario.productos';
const INICIAL_PRODUCTOS = {};
const SIN_FILTROS: FiltrosProductos = { revision: false, sinTarifa: false, categoria: '' };
const BOTON_FILTRO = `rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${FOCOS.purple}`;

/**
 * La tabla (TABLA-inventario punto 7; R26, D41): las columnas de hoy (Producto, Tipo, Precio venta, Costo, E-Commerce y
 * Activo), con la insignia de la tarifa de IVA y la de «Requiere revisión» (B3-T8) bajo el nombre. Solo se ordena por lo que
 * /products acepta (nombre, tipo). Precio y Costo son los de sus SKU (precio_venta y costo de T13): el costo 0 de quick-create
 * es «sin costo» (RP91), como en las existencias. R26: a 1024 px con el menú abierto la caja deja 704 px; Categoría va oculta
 * por defecto. Una constante: estable (D40).
 */
const COLUMNAS_TABLA_PRODUCTOS: ColumnaTabla<Producto>[] = [
  { id: 'producto', titulo: 'Producto', ancho: 140, clave: true, flexible: true, ordenable: 'nombre', titleCelda: (p) => p.name || 'Sin nombre',
    celda: (p) => (
      <span className="flex min-w-0 flex-col items-start gap-1">
        <span className="max-w-full truncate text-xs font-bold text-slate-800">{p.name || 'Sin nombre'}</span>
        <span className="flex flex-wrap gap-1">
          <Badge tone={sinTarifaIva(p) ? 'warning' : 'neutral'}>{etiquetaTarifaCatalogo(p.tarifa_iva)}</Badge>
          {p.necesita_revision && <Badge tone="warning">Requiere revisión</Badge>}
        </span>
      </span>
    ) },
  { id: 'tipo', titulo: 'Tipo', ancho: 88, ordenable: true, titleCelda: (p) => p.type || 'Sin tipo',
    celda: (p) => <Badge tone="neutral">{p.type || '—'}</Badge> },
  { id: 'categoria', titulo: 'Categoría', ancho: 120, ocultaPorDefecto: true, titleCelda: (p) => p.category?.name || 'Sin categoría',
    celda: (p) => <span className="block truncate text-xs text-slate-600">{p.category?.name || '—'}</span> },
  { id: 'precio', titulo: 'Precio venta', ancho: 108, clave: true, alinear: 'derecha',
    titleCelda: (p) => (precioDeProducto(p) === null ? 'Sin precio de venta' : `${pesos(precioDeProducto(p))} (el menor de sus SKU)`),
    celda: (p) => <span className="text-xs font-bold text-slate-800">{precioDeProducto(p) === null ? '—' : pesos(precioDeProducto(p))}</span> },
  { id: 'costo', titulo: 'Costo', ancho: 100, alinear: 'derecha',
    titleCelda: (p) => (costoDeProducto(p) === null ? 'Sin costo registrado' : `${pesos(costoDeProducto(p))} (el menor de sus SKU)`),
    celda: (p) => <span className="text-xs text-slate-600">{costoDeProducto(p) === null ? '—' : pesos(costoDeProducto(p))}</span> },
  { id: 'publicado', titulo: 'E-Commerce', ancho: 128, alinear: 'centro', titleCelda: (p) => (p.publicado ? 'Publicado en la tienda web' : 'No publicado'),
    celda: (p) => <Badge tone={p.publicado ? 'success' : 'neutral'} icon={Globe}>{p.publicado ? 'Publicado' : 'No publicado'}</Badge> },
  { id: 'activo', titulo: 'Activo', ancho: 72, alinear: 'centro', titleCelda: (p) => (p.is_active ? 'Activo' : 'Inactivo'),
    celda: (p) => (
      <span className="inline-flex items-center">
        <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${p.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
        <span className="sr-only">{p.is_active ? 'Activo' : 'Inactivo'}</span>
      </span>
    ) },
];

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

const TABS = ['Informacion General', 'SKUs y Variantes', 'Stock', 'E-Commerce'];

/** Bajo un selector de la ficha: si su catálogo falló sin nada antes, lo dice con el detalle del servidor y «Reintentar» (no una lista vacía falsa). */
function AvisoCatalogo({ catalogo, fallo, onReintentar }: { catalogo: { filas: unknown[] | null; error: unknown }; fallo: string; onReintentar: () => void }) {
  if (!catalogo.error || catalogo.filas) return null;
  return (
    <p role="alert" className="mt-1 text-xs font-semibold text-rose-800">
      {textoDeError(catalogo.error, fallo)}.{' '}
      <button type="button" onClick={onReintentar} className={`rounded font-bold underline ${FOCOS.purple}`}>Reintentar</button>
    </p>
  );
}

export default function ProductosPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { avisar, avisarError } = useAvisos();
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [saving, setSaving] = useState(false);

  const [pasoVariantes, setPasoVariantes] = useState<'atributos' | 'combinaciones'>('atributos');
  const [atributosElegidos, setAtributosElegidos] = useState<{ nombre: string; valores: string }[]>([{ nombre: '', valores: '' }]);
  const [combinaciones, setCombinaciones] = useState<{ clave: string; atributos: Record<string, string>; sku: string; sale_price: string; cost_price: string; initial_stock: string }[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [productoRecienCreadoId, setProductoRecienCreadoId] = useState<number | null>(null);

  const [canSell, setCanSell] = useState(true);
  const [canBuy, setCanBuy] = useState(true);
  const [isPublished, setIsPublished] = useState(false);

  const isNew = selectedProduct === 'NEW';

  const [form, setForm] = useState({
    name: '', description: '', type: 'Fisico', base_currency: 'COP',
    uom: 'Unidad', brand_id: '', category_id: '',
    sale_price: '', cost_price: '', tarifa_iva: '', reference: '',
    track_inventory: true, auto_replenish: false, is_active: true,
    is_published: false, ecommerce_category: '', low_stock_alert: 0,
  });

  // ── B4 T18, bloque 1: la carga del servidor (TABLA-inventario punto 7; R5, RP47, RP48; D40) ──
  // El estado ÚNICO de la pantalla (búsqueda q, orden, página y tamaño 25 o 50) y los filtros extra de la barra (B3-T8):
  // «Requiere revisión» y «Sin tarifa de IVA» van al servidor (necesita_revision y sin_tarifa_iva); cada cambio vuelve a la
  // página 1 en el mismo evento. El modo (Lista o Kanban) se guarda en vista:inventario.productos.
  const [estado, despachar, listo] = useEstadoTabla(ID_PRODUCTOS, INICIAL_PRODUCTOS);
  const enKanban = estado.modo === 'kanban';
  // B4 T24 f4 (F39): «Requiere revisión», «Sin tarifa de IVA» y la categoría son filtros del estado único: vuelven con la sesión y su página.
  const filtros = useMemo(() => filtrosDePantalla(estado.filtros, SIN_FILTROS) as FiltrosProductos, [estado.filtros]);
  // Los catálogos de la ficha y del tablero, con su error y «Reintentar» (antes, tres .catch(() => {}) y listas vacías falsas).
  const { catalogo: categorias, recargar: recargarCategorias } = useCatalogo('/categories');
  const { catalogo: marcas, recargar: recargarMarcas } = useCatalogo('/brands');
  const { catalogo: bodegas, recargar: recargarBodegas } = useCatalogo('/inventory/warehouses');
  const categories = categorias.filas ?? [];
  const brands = marcas.filas ?? [];
  const warehouses = bodegas.filas ?? [];
  const extraLista = useMemo(() => ({ ...extraProductos(filtros), vista: null }), [filtros]);
  // GET /products con q, orden, limit y offset del estado: SIEMPRE limit y offset (sin offset, /products devuelve todo: RP47).
  // esperar: !listo (D40): el esqueleto, nunca «vacío». En Kanban no pide la lista (activo: false, RP35).
  const listado = useListado<Producto>({
    ruta: '/products', estado, esperar: !listo, despachar, activo: !enKanban, extra: extraLista,
  });

  // El tablero solo para ver, en modo servidor (R11, C4, D39): una columna por categoría de /categories (12 como máximo; el resto
  // se ve en la lista, con su aviso). Una consulta por columna (consultaColumnaProducto: category_id, la búsqueda y el orden del
  // MISMO estado, y los filtros de la barra). El orden del hook ('sin_movimiento') NO se manda: /products responde 422.
  // r1 (F93): con una categoría elegida, el tablero muestra solo su columna (aunque esté fuera de las 12).
  const { columnas: columnasTablero, aviso: avisoCategorias } = useMemo(
    () => columnasProductos(categorias.filas, undefined, { elegida: filtros.categoria }), [categorias.filas, filtros.categoria]);
  const tablero = useTableroKanban<Producto>({
    pantalla: ID_PRODUCTOS,
    modo: 'servidor',
    columnas: columnasTablero,
    activo: listo && enKanban && categorias.filas !== null,
    porColumna: estado.tamano,
    dependencias: [...dependenciasTablero(estado), filtros.revision, filtros.sinTarifa, filtros.categoria],
    cargar: async (columna, { offset, limit, signal }) => {
      const consulta = consultaColumnaProducto(estado, columna, filtros, { limit, offset });
      if (consulta === null) return { filas: [], total: 0 };
      return normalizarRespuesta(await _apiFetch(`/products?${consulta}`, { signal }));
    },
  });

  // «Actualizar» y lo que sigue a guardar: la lista, el tablero y los catálogos. Ninguna recarga vacía lo que se ve.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarTablero } = tablero;
  const recargarTodo = useCallback(() => {
    recargarListado();
    recargarTablero();
    recargarCategorias();
    recargarMarcas();
    recargarBodegas();
  }, [recargarListado, recargarTablero, recargarCategorias, recargarMarcas, recargarBodegas]);

  // ── bloque 2: la tabla (R5, R26; D40, D41) ──
  const prefs = usePreferenciasTabla(ID_PRODUCTOS, COLUMNAS_TABLA_PRODUCTOS);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa (el conmutador sigue a la vista y el tablero no queda tapado).
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  // F39: una acción {tipo: 'filtro'} por clave (el reductor la mezcla con los otros y vuelve a la página 1, en el mismo evento).
  const cambiarFiltros = useCallback((cambio: Partial<FiltrosProductos>) => {
    for (const accion of accionesDeFiltros(cambio)) despachar(accion);
  }, [despachar]);
  // m8 de T15: el «vacío» memoizado dice qué lo deja vacío (la búsqueda, los filtros de la barra o nada).
  // El nombre de la categoría elegida, para el vacío (si el catálogo todavía no llegó, el id).
  // r1 (m16, como F85 en el Hub): sin el catálogo, «la categoría elegida» (true), nunca el id crudo.
  const nombreCategoria = filtros.categoria ? (categorias.filas?.find((c) => String(c.id) === filtros.categoria)?.name ?? true) : null;
  const vacio = useMemo(() => {
    const texto = textoVacioProductos({ q: estado.q, revision: filtros.revision, sinTarifa: filtros.sinTarifa, categoria: nombreCategoria });
    return (
      <div>
        <p className="font-semibold text-slate-600">{texto.titulo}</p>
        {texto.ayuda && <p className="mt-1 text-xs text-slate-500">{texto.ayuda}</p>}
      </div>
    );
  }, [estado.q, filtros.revision, filtros.sinTarifa, nombreCategoria]);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    total: listado.total,
    estadoTotal: estadoDelTotal({ total: listado.total, cargando: listado.cargandoInicial, recargando: listado.recargando, error: listado.error }),
  };

  function generarCombinaciones() {
    const atributosValidos = atributosElegidos
      .filter(a => a.nombre.trim() && a.valores.trim())
      .map(a => ({ nombre: a.nombre.trim(), valores: a.valores.split(',').map(v => v.trim()).filter(Boolean) }));

    if (atributosValidos.length === 0) {
      setCombinaciones([]);
      return;
    }

    let filas: Record<string, string>[] = [{}];
    for (const attr of atributosValidos) {
      const nuevasFilas: Record<string, string>[] = [];
      for (const fila of filas) {
        for (const valor of attr.valores) {
          nuevasFilas.push({ ...fila, [attr.nombre]: valor });
        }
      }
      filas = nuevasFilas;
    }

    setCombinaciones(filas.map(fila => {
      const sufijo = Object.values(fila).join('-').toUpperCase().replace(/\s+/g, '');
      const base = (form.name || 'SKU').toUpperCase().replace(/\s+/g, '').slice(0, 10);
      return { clave: Object.values(fila).join('|'), atributos: fila, sku: `${base}-${sufijo}`, sale_price: form.sale_price || '', cost_price: form.cost_price || '', initial_stock: '' };
    }));
    setPasoVariantes('combinaciones');
  }

  function aplicarATodas(campo: 'sale_price' | 'cost_price' | 'initial_stock', valor: string) {
    setCombinaciones(prev => prev.map(c => ({ ...c, [campo]: valor })));
  }

  async function guardarVariantes(productId: number, skus: typeof combinaciones) {
    if (skus.length === 0) return;
    const body = {
      warehouse_id: warehouseId ? Number(warehouseId) : undefined,
      skus: skus.map(c => ({
        sku: c.sku,
        sale_price: Number(c.sale_price) || 0,
        cost_price: c.cost_price ? Number(c.cost_price) : undefined,
        initial_stock: c.initial_stock ? Number(c.initial_stock) : 0,
        attributes: Object.entries(c.atributos).map(([attribute_name, value]) => ({ attribute_name, value })),
      })),
    };
    await apiFetch(`/products/${productId}/skus/bulk`, { method: 'POST', body: JSON.stringify(body) });
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // brand_id/category_id are '' when nothing is picked (e.g. the dropdown
      // has no options yet because no brands/categories exist) — the backend
      // expects Optional[int] and 400s on an empty string, so null them out.
      const body = {
        ...form,
        brand_id: form.brand_id ? Number(form.brand_id) : null,
        category_id: form.category_id ? Number(form.category_id) : null,
        is_published: isPublished,
        // IVA-PRODUCTO: '' = «Sin definir» (null: usa la tarifa por defecto de Configuración). Ya no se manda tax_rate.
        tarifa_iva: form.tarifa_iva || null,
      };
      let productId: number;
      if (isNew) {
        const nuevo = await apiFetch('/products', { method: 'POST', body: JSON.stringify(body) });
        productId = nuevo.id;
        // Flip out of "isNew" as soon as the product exists, so that if the SKU step
        // below fails, a retry PATCHes this real product instead of POSTing a duplicate.
        setSelectedProduct(nuevo);
      } else {
        await apiFetch(`/products/${selectedProduct.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        productId = selectedProduct.id;
      }

      // A product with no variants (the common case — "Variantes (opcional)"
      // tells the user to leave that step empty) otherwise saves with zero
      // SKUs: no stock, and nothing Compras/Ventas/Inventario can reference,
      // even though Precio de Venta/Costo were filled in right here. Create
      // the one implicit SKU it needs, same as a single-row combinaciones.
      const skuPayload = combinaciones.length > 0
        ? combinaciones
        : (isNew && form.sale_price ? [{
            clave: '', atributos: {},
            sku: (form.reference || form.name || 'SKU').toUpperCase().replace(/\s+/g, '').slice(0, 20),
            sale_price: form.sale_price, cost_price: form.cost_price, initial_stock: '',
          }] : []);

      if (skuPayload.length > 0) {
        try {
          await guardarVariantes(productId, skuPayload);
        } catch (skuErr: any) {
          // The product itself was already created/updated successfully; only the SKU
          // step failed. Keep the user on the form (don't reset/close) so "Guardar"
          // retries just the SKU step against the now-existing product, instead of
          // creating a second, duplicate product.
          avisar(`El producto se guardó, pero ocurrió un error creando las variantes: ${skuErr.message}. Vuelve a presionar "Guardar" para reintentar solo las variantes.`, { tono: 'error' });
          setSaving(false);
          return;
        }
      }

      setSelectedProduct(null);
      setCombinaciones([]);
      setAtributosElegidos([{ nombre: '', valores: '' }]);
      setPasoVariantes('atributos');
      recargarTodo();
    } catch (err) { avisarError(err, 'No se pudo guardar el producto'); } // p. ej. el 422 de la tarifa de IVA
    setSaving(false);
  }

  function openNew() {
    // Reset any abandoned variants-wizard state from a previous, unsaved attempt
    // (e.g. Nuevo Producto -> generate combinations -> go back without saving).
    // Otherwise those leftover combinations would silently ride along and get
    // bulk-attached to whichever product is opened next.
    setCombinaciones([]);
    setAtributosElegidos([{ nombre: '', valores: '' }]);
    setPasoVariantes('atributos');
    setWarehouseId('');
    setForm({ name: '', description: '', type: 'Fisico', base_currency: 'COP', uom: 'Unidad',
      brand_id: '', category_id: '', sale_price: '', cost_price: '', tarifa_iva: '', reference: '',
      track_inventory: true, auto_replenish: false, is_active: true, is_published: false, ecommerce_category: '', low_stock_alert: 0 });
    setIsPublished(false);
    setActiveTab(TABS[0]);
    setSelectedProduct('NEW');
  }

  function openEdit(p: any) {
    // Same reset as openNew(): don't let leftover wizard state from a previous,
    // unsaved product attempt attach bogus SKUs to this unrelated existing product.
    setCombinaciones([]);
    setAtributosElegidos([{ nombre: '', valores: '' }]);
    setPasoVariantes('atributos');
    setWarehouseId('');
    setForm({
      name: p.name || '', description: p.description || '', type: p.type || 'Fisico',
      base_currency: p.base_currency || 'COP', uom: p.uom || 'Unidad',
      brand_id: p.brand_id || '', category_id: p.category_id || '',
      // T18 r1 (m23): las claves REALES de /products (precio_venta, costo y publicado: el menor de sus SKU), no las viejas.
      sale_price: p.precio_venta ?? '', cost_price: p.costo ?? '', tarifa_iva: normalizarTarifaIva(p.tarifa_iva) ?? '',
      reference: p.reference || '', track_inventory: p.track_inventory ?? true,
      auto_replenish: p.auto_replenish ?? false, is_active: p.is_active ?? true,
      is_published: p.publicado ?? false, ecommerce_category: p.ecommerce_category || '',
      low_stock_alert: p.low_stock_alert || 0,
    });
    setIsPublished(p.publicado ?? false);
    setActiveTab(TABS[0]);
    setSelectedProduct(p);
  }

  function closeProduct() {
    setSelectedProduct(null);
    if (searchParams.get('id') || searchParams.get('sku')) router.replace(pathname);
  }

  // El enlace profundo (RP49): Abastecimiento enlaza con ?sku=<código> («Ver producto»; stock-tabla no trae el id del producto) y
  // otras pantallas con ?id=<product_id>. Como la tabla ya pagina en el servidor, el producto se pide por /products?id= (o por
  // su SKU) en lugar de buscarlo entre los cargados; si no existe o falla, se dice. La marca se pone cuando la respuesta LLEGÓ,
  // nunca antes del fetch: si el efecto se aborta, queda libre y el siguiente render vuelve a pedir (pedirEnlaceProducto).
  const idDeLaUrl = searchParams.get('id');
  const skuDeLaUrl = searchParams.get('sku');
  const enlaceAtendido = useRef<string | null>(null);
  // B4 T24 f3 (B40-f): el error del enlace queda a la vista con «Reintentar» (AvisoDeError: un 403 no lo ofrece); reintentar sube la vuelta.
  // r1 (m18): el efecto vive en la lib (abrirEnlaceProducto) y la carga se lee con estadoReintento: mientras se reintenta, el aviso sigue
  // montado con «Reintentando…» (m36: el foco no cae al <body>).
  const [enlace, setEnlace] = useState<{ vuelta: number; error: unknown }>({ vuelta: 0, error: null });
  const [vueltaEnlace, setVueltaEnlace] = useState(0);
  const cargaEnlace = estadoReintento(enlace, vueltaEnlace);
  useEffect(() => abrirEnlaceProducto({
    marca: enlaceAtendido, idDeLaUrl, skuDeLaUrl, pedir: _apiFetch,
    // r2 (m36): el enlace abre la ficha (la lista y su aviso se van): el foco va a su título, nunca al <body>.
    abrir: (p) => { openEdit(p); requestAnimationFrame(() => document.getElementById('ficha-producto-titulo')?.focus()); },
    avisar: (texto) => avisar(texto, { tono: 'info' }),
    alError: (error) => setEnlace({ vuelta: vueltaEnlace, error }),
  }), [idDeLaUrl, skuDeLaUrl, avisar, vueltaEnlace]);

  // ─── PRODUCT LIST ───
  if (!selectedProduct) {
    return (
      <div className="w-full bg-slate-50 min-h-full animate-in fade-in">
        <SubNav label="Inventario" items={INV_NAV} currentPath="/dashboard/inventario/productos" color="purple" />

        <div className={CONTENEDOR}>
          <PageHeader icon={Package} color="purple"
            title="Catálogo de Productos"
            subtitle="Catálogo sincronizado con E-commerce"
            actions={(
              <div className="flex flex-wrap items-center gap-2.5">
                <button type="button" onClick={recargarTodo}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-xs shadow-sm transition-colors ${FOCOS.purple}`}>
                  <RefreshCw size={13} aria-hidden="true" className={listado.recargando ? 'animate-spin' : ''} /> Actualizar
                </button>
                <button type="button" onClick={openNew}
                  className={`text-white px-6 py-3 rounded-xl font-bold shadow-md flex items-center gap-2 transition-colors bg-purple-700 hover:bg-purple-800 ${FOCOS.purple}`}>
                  <Plus size={18} aria-hidden="true" /> Nuevo Producto
                </button>
              </div>
            )} />

          {/* r2 (m36 completo): montado siempre (regionFoco): si el reintento sale bien, el foco va a su región, nunca al <body>. */}
          <AvisoDeError error={cargaEnlace.error} fallo="No se pudo abrir el producto del enlace" acento="purple" reintentando={cargaEnlace.reintentando}
            onReintentar={() => setVueltaEnlace((n) => n + 1)} />

          {/* B4 T18, bloques 2 y 3 (TABLA-inventario punto 7, KANBAN-resto): la barra con la búsqueda (q) y los filtros de B3-T8, y
              la tabla estándar en el servidor, o el tablero solo para ver por categoría con el MISMO estado. */}
          <div className="flex min-w-0 flex-col gap-4">
            {capa}
            <section ref={refTarjeta} className={claseTarjeta}>
              <BarraTabla
                estado={estado}
                onEstado={despachar}
                placeholder="Buscar por nombre, descripción o SKU…"
                filtros={(
                  <>
                    <button type="button" aria-pressed={filtros.revision} onClick={() => cambiarFiltros({ revision: !filtros.revision })}
                      className={`${BOTON_FILTRO} ${filtros.revision ? 'bg-amber-100 border-amber-300 text-amber-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      Requiere revisión
                    </button>
                    <button type="button" aria-pressed={filtros.sinTarifa} onClick={() => cambiarFiltros({ sinTarifa: !filtros.sinTarifa })}
                      className={`${BOTON_FILTRO} ${filtros.sinTarifa ? 'bg-amber-100 border-amber-300 text-amber-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      Sin tarifa de IVA
                    </button>
                    {/* m4: sin esto, el aviso «N categorías más: usa la lista» no se podía seguir. */}
                    <SelectorCatalogo etiqueta="Categoría" todas="Todas las categorías" cargando="Cargando categorías…"
                      fallo="No se pudieron cargar las categorías" catalogo={categorias} valor={filtros.categoria}
                      onCambiar={(categoria) => cambiarFiltros({ categoria })} onReintentar={recargarCategorias} icono={Layers} acento="purple" />
                    {/* r2 (F81): si «Actualizar» falla con el catálogo ya cargado, se dice junto al selector (la vuelta, en useCatalogo). */}
                    <AvisoCatalogoViejo catalogo={categorias} fallo="No se pudieron actualizar las categorías" onReintentar={recargarCategorias} acento="purple" />
                  </>
                )}
                ajustes={{ columnas: COLUMNAS_TABLA_PRODUCTOS, preferencias: prefs, anchoRef: anchoTablaRef }}
                kanbanDisponible
                pantallaCompleta={enKanban ? undefined : { completa, alternar }}
                color="purple"
                {...totalDeLaBarra}
              />
              {/* La tabla estándar en el servidor: la paginación (25 o 50) y el orden (nombre, tipo) son de la tabla; un clic en la
                  fila abre la ficha. */}
              {!enKanban && (
                <TablaEstandar
                  id={ID_PRODUCTOS}
                  modo="servidor"
                  columnas={COLUMNAS_TABLA_PRODUCTOS}
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
                  onFila={openEdit}
                  vacio={vacio}
                  etiqueta="Catálogo de productos"
                />
              )}
            </section>
            {enKanban ? (
              /* KANBAN-resto: una columna por categoría (12 como máximo, con su aviso), solo para ver: sin regla, con su motivo. El
                 clic abre la ficha. Sin las categorías no hay columnas: se dice (con «Reintentar» si fallaron). */
              categorias.filas === null ? (
                categorias.error ? (
                  <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                    {textoDeError(categorias.error, 'No se pudieron cargar las categorías')}
                    <button type="button" onClick={recargarCategorias}
                      className={`inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 ${FOCOS.purple}`}>
                      <RefreshCw size={13} aria-hidden="true" /> Reintentar
                    </button>
                  </div>
                ) : (
                  <div role="status" aria-busy="true" className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">Cargando las categorías…</div>
                )
              ) : columnasTablero.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-600">Todavía no hay categorías: crea una para ver el tablero.</div>
              ) : (
                <TableroKanban
                  tablero={tablero}
                  soloLectura={TEXTO_SOLO_VER_PRODUCTOS}
                  tarjetaDe={tarjetaProducto}
                  onAbrir={openEdit}
                  color="purple"
                  vacio="Sin productos en esta categoría"
                  aviso={avisoCategorias
                    ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">{avisoCategorias}</p>
                    : undefined}
                />
              )
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ─── PRODUCT FORM ───
  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col overflow-hidden">
      <SubNav label="Inventario" items={INV_NAV} currentPath="/dashboard/inventario/productos" color="purple" />
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center gap-4 flex-shrink-0">
        <button onClick={closeProduct} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 id="ficha-producto-titulo" tabIndex={-1} className="font-extrabold text-xl text-slate-900">{isNew ? 'Nuevo Producto' : form.name}</h1>
          {!isNew && selectedProduct?.reference && <p className="text-xs text-slate-400">Ref: {selectedProduct.reference}</p>}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={canSell} onChange={e=>setCanSell(e.target.checked)} className="w-4 h-4" />
            <span className="font-medium text-slate-600">Se puede vender</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={canBuy} onChange={e=>setCanBuy(e.target.checked)} className="w-4 h-4" />
            <span className="font-medium text-slate-600">Se puede comprar</span>
          </label>
          <Button color="purple" icon={Save} loading={saving} onClick={saveProduct}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-100 px-6 flex-shrink-0">
        <div className="flex gap-0">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === tab ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* r1 (m17 + m45, F44-a): la ficha se desplaza sola y llega a la esquina del botón de la IA: la reserva al fondo. */}
      <form onSubmit={saveProduct} className={`flex-1 overflow-y-auto px-6 pt-6 ${RESERVA_BOTON_IA}`}>
        {activeTab === 'Informacion General' && (
          <div className="grid grid-cols-3 gap-6 max-w-5xl">
            <div className="col-span-2 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Nombre del Producto *</label>
                <input required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Descripcion</label>
                <textarea rows={3} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Tipo</label>
                  <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
                    <option>Fisico</option><option>Servicio</option><option>Experiencia</option><option>Digital</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Unidad de Medida</label>
                  <select value={form.uom} onChange={e=>setForm(f=>({...f,uom:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
                    <option>Unidad</option><option>Kg</option><option>Lb</option><option>Metro</option><option>Litro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Categoria</label>
                  <select value={form.category_id} onChange={e=>setForm(f=>({...f,category_id:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
                    <option value="">Seleccionar...</option>
                    {categories.filter((c:any) => !c.parent_id).map((c:any) => (
                      <optgroup key={c.id} label={c.name}>
                        <option value={c.id}>{c.name}</option>
                        {categories.filter((h:any) => h.parent_id === c.id).map((h:any) => (
                          <option key={h.id} value={h.id}>&nbsp;&nbsp;{h.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <AvisoCatalogo catalogo={categorias} fallo="No se pudieron cargar las categorías" onReintentar={recargarCategorias} />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Marca</label>
                  <select value={form.brand_id} onChange={e=>setForm(f=>({...f,brand_id:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
                    <option value="">Seleccionar...</option>
                    {brands.map((b:any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <AvisoCatalogo catalogo={marcas} fallo="No se pudieron cargar las marcas" onReintentar={recargarMarcas} />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Referencia Interna</label>
                  <input value={form.reference} onChange={e=>setForm(f=>({...f,reference:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Moneda Base</label>
                  <select value={form.base_currency} onChange={e=>setForm(f=>({...f,base_currency:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
                    <option>COP</option><option>USD</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <h3 className="font-black text-sm text-slate-700 mb-3 flex items-center gap-2"><DollarSign size={14} className="text-indigo-500" /> Precios</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Precio de Venta</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                      <input type="number" value={form.sale_price} onChange={e=>setForm(f=>({...f,sale_price:e.target.value}))}
                        className="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 text-sm outline-none focus:border-purple-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Costo</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                      <input type="number" value={form.cost_price} onChange={e=>setForm(f=>({...f,cost_price:e.target.value}))}
                        className="w-full border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 text-sm outline-none focus:border-purple-400" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="producto-tarifa-iva" className="block text-xs text-slate-500 mb-1">Tarifa de IVA</label>
                    <select id="producto-tarifa-iva" value={form.tarifa_iva} onChange={e=>setForm(f=>({...f,tarifa_iva:e.target.value}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
                      <option value="">Sin definir (usa la de Configuración)</option>
                      {TARIFAS_IVA.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <h3 className="font-black text-sm text-slate-700 mb-3 flex items-center gap-2"><Layers size={14} className="text-purple-500" /> Inventario</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.track_inventory}
                      onChange={e=>setForm(f=>({...f,track_inventory:e.target.checked}))} className="w-4 h-4" />
                    <span className="text-sm text-slate-600">Rastrear inventario</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.auto_replenish}
                      onChange={e=>setForm(f=>({...f,auto_replenish:e.target.checked}))} className="w-4 h-4" />
                    <span className="text-sm text-slate-600">Reabastecimiento automatico</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_active}
                      onChange={e=>setForm(f=>({...f,is_active:e.target.checked}))} className="w-4 h-4" />
                    <span className="text-sm text-slate-600">Activo</span>
                  </label>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Alerta stock minimo</label>
                    <input type="number" value={form.low_stock_alert} min={0}
                      onChange={e=>setForm(f=>({...f,low_stock_alert:parseInt(e.target.value)||0}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'SKUs y Variantes' && (
          <div className="max-w-4xl">
            {!isNew && selectedProduct?.skus?.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50"><tr className="text-xs text-slate-400 uppercase">
                    <th className="px-4 py-3 text-left">SKU</th><th className="px-4 py-3 text-left">Variantes</th>
                    <th className="px-4 py-3 text-right">Costo</th><th className="px-4 py-3 text-right">Precio</th>
                  </tr></thead>
                  <tbody>
                    {selectedProduct.skus.map((s: any) => (
                      <tr key={s.id} className="border-t border-slate-50">
                        <td className="px-4 py-3 font-mono text-sm">{s.sku}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {(s.attribute_values || []).map((av: any) => av.value).join(', ') || '-'}
                        </td>
                        <td className="px-4 py-3 text-right">${Number(s.cost_price||0).toLocaleString('es-CO')}</td>
                        <td className="px-4 py-3 text-right">${Number(s.sale_price||0).toLocaleString('es-CO')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {pasoVariantes === 'atributos' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="font-black text-sm text-slate-700 mb-1">Variantes (opcional)</h3>
                <p className="text-xs text-slate-400 mb-4">Ej: Talla con valores "S, M, L" y Color con valores "Rojo, Azul". Deja vacio si el producto no tiene variantes.</p>
                {atributosElegidos.map((a, i) => (
                  <div key={i} className="grid grid-cols-2 gap-3 mb-2">
                    <input placeholder="Atributo (ej: Talla)" value={a.nombre}
                      onChange={e => setAtributosElegidos(prev => prev.map((x, idx) => idx === i ? { ...x, nombre: e.target.value } : x))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400" />
                    <input placeholder="Valores separados por coma (ej: S, M, L)" value={a.valores}
                      onChange={e => setAtributosElegidos(prev => prev.map((x, idx) => idx === i ? { ...x, valores: e.target.value } : x))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400" />
                  </div>
                ))}
                <button type="button" onClick={() => setAtributosElegidos(prev => [...prev, { nombre: '', valores: '' }])}
                  className="text-xs font-bold text-purple-600 mt-1">+ Agregar otro atributo</button>
                <div className="mt-4">
                  <button type="button" onClick={generarCombinaciones}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-bold text-sm">
                    Generar combinaciones
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-black text-sm text-slate-700">{combinaciones.length} combinaciones generadas</h3>
                  <button type="button" onClick={() => setPasoVariantes('atributos')} className="text-xs font-bold text-slate-500">← Cambiar atributos</button>
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Bodega para el stock inicial</label>
                  <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400">
                    <option value="">Seleccionar...</option>
                    {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  <AvisoCatalogo catalogo={bodegas} fallo="No se pudieron cargar las bodegas" onReintentar={recargarBodegas} />
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-slate-400 uppercase">
                    <th className="text-left py-2">Variante</th><th className="text-left py-2">SKU</th>
                    <th className="text-right py-2">Precio <button type="button" className="text-purple-600 font-bold ml-1" onClick={() => aplicarATodas('sale_price', combinaciones[0]?.sale_price || '')}>(aplicar a todas)</button></th>
                    <th className="text-right py-2">Costo</th><th className="text-right py-2">Stock inicial</th>
                  </tr></thead>
                  <tbody>
                    {combinaciones.map((c, i) => (
                      <tr key={c.clave} className="border-t border-slate-50">
                        <td className="py-2">{Object.values(c.atributos).join(' / ')}</td>
                        <td className="py-2">
                          <input value={c.sku} onChange={e => setCombinaciones(prev => prev.map((x, idx) => idx === i ? { ...x, sku: e.target.value } : x))}
                            className="w-32 border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono" />
                        </td>
                        <td className="py-2 text-right">
                          <input type="number" value={c.sale_price} onChange={e => setCombinaciones(prev => prev.map((x, idx) => idx === i ? { ...x, sale_price: e.target.value } : x))}
                            className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-xs text-right" />
                        </td>
                        <td className="py-2 text-right">
                          <input type="number" value={c.cost_price} onChange={e => setCombinaciones(prev => prev.map((x, idx) => idx === i ? { ...x, cost_price: e.target.value } : x))}
                            className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-xs text-right" />
                        </td>
                        <td className="py-2 text-right">
                          <input type="number" value={c.initial_stock} onChange={e => setCombinaciones(prev => prev.map((x, idx) => idx === i ? { ...x, initial_stock: e.target.value } : x))}
                            className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-xs text-right" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-slate-400 mt-3">Las combinaciones se crean al guardar el producto con el botón "Guardar" de arriba.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'Stock' && (
          <div className="max-w-3xl">
            {!isNew && selectedProduct?.inventory_levels?.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50"><tr className="text-xs text-slate-400 uppercase">
                    <th className="px-4 py-3 text-left">Bodega</th><th className="px-4 py-3 text-right">Stock</th>
                  </tr></thead>
                  <tbody>
                    {selectedProduct.inventory_levels.map((l: any) => (
                      <tr key={l.id} className="border-t border-slate-50">
                        <td className="px-4 py-3">{l.warehouse_name || `Bodega #${l.warehouse_id}`}</td>
                        <td className="px-4 py-3 text-right font-bold">{l.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-2xl p-8 text-center text-slate-400">
                <Package size={32} className="mx-auto mb-3 opacity-30" />
                <p>Sin stock registrado. El stock se actualiza automaticamente cuando se confirma una Recepcion (ENINV).</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'E-Commerce' && (
          <div className="max-w-2xl space-y-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-black text-slate-700 flex items-center gap-2"><Globe size={14} className="text-emerald-500" /> Estado de Publicacion</h3>
                <button type="button" onClick={() => setIsPublished(!isPublished)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isPublished ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isPublished ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <p className={`text-sm font-bold ${isPublished ? 'text-emerald-600' : 'text-slate-400'}`}>
                {isPublished ? 'Publicado en la tienda web' : 'No publicado'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h3 className="font-black text-slate-700 flex items-center gap-2"><Tag size={14} className="text-indigo-500" /> Configuracion E-Commerce</h3>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Categoria en Tienda</label>
                <input value={form.ecommerce_category} onChange={e=>setForm(f=>({...f,ecommerce_category:e.target.value}))}
                  placeholder="Ej: Accesorios, Electronica, Ropa..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Alerta de stock bajo</label>
                <input type="number" min={0} value={form.low_stock_alert}
                  onChange={e=>setForm(f=>({...f,low_stock_alert:parseInt(e.target.value)||0}))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
                <p className="text-xs text-slate-400 mt-1">Alerta cuando el stock caiga por debajo de este numero</p>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
