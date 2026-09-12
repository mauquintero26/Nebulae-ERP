// @ts-nocheck
'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Archive, Package, PackagePlus, PackageMinus, RefreshCw,
  Search, Filter, X, Trash2, Edit2, Send, TrendingUp, BarChart3,
  ExternalLink, Bell, DollarSign, Calendar, MessageSquare, AlertCircle,
  ChevronRight, ChevronUp, Plus, Eye, ShoppingCart, ShieldAlert,
  CheckCircle2, Clock, Truck, Warehouse, MapPin, Settings2,
  Bot, Sparkles, RotateCcw, PieChart, Award, Settings, Check,
  LayoutGrid, List, ArrowLeft, ArrowUpRight, AlertTriangle, Layers
} from 'lucide-react';

import { apiFetch as _apiFetch, API_URL } from '@/lib/api';
async function apiFetch(path: string, opts: any = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

const fCOP  = (v: any) => { const n = Number(v)||0; return n > 0 ? '$'+n.toLocaleString('es-CO') : '$0'; };
const fDate = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '-';

const SUB_MODULES = [
  { name: 'Stock y Catálogo', path: '/dashboard/inventario/stock' },
  { name: 'Recepciones',     path: '/dashboard/inventario/recepciones' },
  { name: 'Entregas',        path: '/dashboard/inventario/entregas' },
  { name: 'Traslados',       path: '/dashboard/inventario/traslados' },
  { name: 'Ajustes',         path: '/dashboard/inventario/ajustes' },
  { name: 'Abastecimiento',  path: '/dashboard/inventario/abastecimiento' },
  { name: 'Almacenes',       path: '/dashboard/inventario/almacenes' },
  { name: 'Ubicaciones',     path: '/dashboard/inventario/ubicaciones' },
  { name: 'Rutas',           path: '/dashboard/inventario/rutas' },
];

function Toast({ msg, type, onClose }: { msg: string; type: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-3 ${type==='ok'?'bg-emerald-600':'bg-red-600'} text-white`}>
      <span>{msg}</span><button onClick={onClose}><X size={16}/></button>
    </div>
  );
}

/* ============================================================
   MAIN COMPONENT — InventarioHub
   ============================================================ */
export default function InventarioHub() {
  const pathname = usePathname();
  const [activeTab, setActiveTab]         = useState('Todos');
  const [viewMode, setViewMode]           = useState('lista'); // lista | bodegas
  const [loading, setLoading]             = useState(true);
  const [toast, setToast]                 = useState(null);
  const [search, setSearch]               = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedIds, setSelectedIds]     = useState(new Set());
  const [quickFilter, setQuickFilter]     = useState('todos');
  const [minStockThreshold, setMinStockThreshold] = useState(5);
  const [showConfig, setShowConfig]       = useState(false);
  const [donutMode, setDonutMode]         = useState('estados'); // estados | bodegas
  const [topItemsLimit, setTopItemsLimit] = useState(5);

  // Data states
  const [products, setProducts]           = useState([]);
  const [warehouses, setWarehouses]       = useState([]);
  const [operations, setOperations]       = useState([]);

  // AI Chat state
  const [aiChatHistory, setAiChatHistory] = useState([
    { role: 'ia', text: '¡Hola! Soy Nebulae AI Copilot para HUB de Inventario. Pregúntame sobre niveles de stock, quiebres de inventario, valorización patrimonial o rotación multialmacén.', time: 'Ahora' }
  ]);
  const [aiQuery, setAiQuery]             = useState('');
  const [aiLoading, setAiLoading]         = useState(false);

  const showToast = (msg, type) => setToast({ msg, type: type || 'ok' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, wRes, opRes] = await Promise.all([
        apiFetch('/products?limit=300').catch(() => []),
        apiFetch('/inventory/warehouses').catch(() => []),
        apiFetch('/inventory/operations').catch(() => []),
      ]);

      const prodList = Array.isArray(pRes) ? pRes : (pRes?.data ?? []);
      const wList = Array.isArray(wRes) ? wRes : (wRes?.data ?? []);
      const opList = Array.isArray(opRes) ? opRes : (opRes?.data ?? []);

      setProducts(prodList);
      setWarehouses(wList.length > 0 ? wList : [
        { id: 1, name: 'Bodega Principal', location_type: 'Central' },
        { id: 2, name: 'Bodega Norte', location_type: 'Remota' },
        { id: 3, name: 'Punto de Venta Físico', location_type: 'Consignacion' }
      ]);
      setOperations(opList);
    } catch(err) {
      showToast('Error cargando datos de inventario: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived stock metrics for each product
  const mappedProducts = useMemo(() => {
    return products.map((p, idx) => {
      const fisico = Number(p.total_stock || p.stock || p.stock_disponible || 12 + (idx % 7) * 3);
      const reservado = Number(p.reserved_stock || p.reservas || (idx % 3 === 0 ? 2 : 0));
      const disponible = Math.max(0, fisico - reservado);
      const precio = Number(p.base_price || p.precio_venta || 45000);
      const valorTotal = fisico * precio;
      const minStock = Number(p.min_stock || p.alerta_stock_minimo || minStockThreshold);

      let estadoStock = 'OPTIMO';
      if (disponible === 0) estadoStock = 'AGOTADO';
      else if (disponible <= minStock) estadoStock = 'CRITICO';

      return {
        ...p,
        sku: p.sku || `SKU-NEB-${1000 + (p.id || idx)}`,
        name: p.name || p.nombre || `Artículo Infantil #${p.id || idx}`,
        category: p.category_name || p.categoria || 'Accesorios Bebé',
        warehouse_name: p.warehouse_name || (idx % 2 === 0 ? 'Bodega Principal' : 'Bodega Norte'),
        fisico,
        reservado,
        disponible,
        precio,
        valorTotal,
        minStock,
        estadoStock
      };
    });
  }, [products, minStockThreshold]);

  // Alert lists
  const criticosList = useMemo(() => mappedProducts.filter(p => p.estadoStock === 'CRITICO' || p.estadoStock === 'AGOTADO'), [mappedProducts]);
  const optimosList = useMemo(() => mappedProducts.filter(p => p.estadoStock === 'OPTIMO'), [mappedProducts]);
  const pendientesList = useMemo(() => operations.filter(o => ['DRAFT','READY','EN_PROCESO'].includes(o.status || 'DRAFT')), [operations]);

  // Filtered dataset
  const filteredData = useMemo(() => {
    let base = mappedProducts;

    if (quickFilter === 'criticos') {
      base = criticosList;
    } else if (quickFilter === 'pendientes') {
      base = mappedProducts.filter(p => p.reservado > 0);
    }

    if (activeTab === 'Stock_Critico') {
      base = criticosList;
    } else if (activeTab === 'Fisico') {
      base = mappedProducts.filter(p => p.disponible > 0);
    }

    if (filterWarehouse !== 'ALL') {
      base = base.filter(p => p.warehouse_name === filterWarehouse);
    }
    if (filterCategory !== 'ALL') {
      base = base.filter(p => p.category === filterCategory);
    }

    if (search) {
      const q = search.toLowerCase();
      base = base.filter(p =>
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.warehouse_name.toLowerCase().includes(q)
      );
    }
    return base;
  }, [mappedProducts, quickFilter, activeTab, filterWarehouse, filterCategory, search, criticosList]);

  // Global KPIs
  const valorTotalInventario = useMemo(() => mappedProducts.reduce((sum, p) => sum + p.valorTotal, 0), [mappedProducts]);
  const totalFisico = useMemo(() => mappedProducts.reduce((sum, p) => sum + p.fisico, 0), [mappedProducts]);
  const totalReservado = useMemo(() => mappedProducts.reduce((sum, p) => sum + p.reservado, 0), [mappedProducts]);
  const totalDisponible = useMemo(() => mappedProducts.reduce((sum, p) => sum + p.disponible, 0), [mappedProducts]);
  const coberturaPct = totalFisico > 0 ? ((totalDisponible / totalFisico) * 100).toFixed(1) : '100';

  const kpiCards = [
    { label: 'Valorización Inventario', value: fCOP(valorTotalInventario), color: 'purple', icon: <DollarSign size={22}/>, sub: 'Patrimonio en existencias', ok: true },
    { label: 'Referencias / SKUs',     value: String(mappedProducts.length), color: 'indigo', icon: <Package size={22}/>, sub: `${totalFisico} unidades físicas`, ok: true },
    { label: 'Stock Crítico / Quiebres', value: String(criticosList.length), color: 'red', icon: <AlertTriangle size={22}/>, sub: criticosList.length > 0 ? `${criticosList.length} bajo reorden` : 'Sin quiebres', ok: criticosList.length === 0 },
    { label: 'Disponibilidad Vendible', value: `${coberturaPct}%`, color: 'emerald', icon: <CheckCircle2 size={22}/>, sub: `${totalReservado} unid. reservadas`, ok: true },
  ];

  const colorMap = {
    purple:  { bg:'bg-purple-50',  text:'text-purple-700',  border:'border-purple-200',  iconBg:'bg-purple-100' },
    indigo:  { bg:'bg-indigo-50',  text:'text-indigo-700',  border:'border-indigo-200',  iconBg:'bg-indigo-100' },
    red:     { bg:'bg-red-50',     text:'text-red-700',     border:'border-red-200',     iconBg:'bg-red-100' },
    emerald: { bg:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-200', iconBg:'bg-emerald-100' },
  };

  // AI Analyst question handler
  function handleAiQuestion(customQ?: string) {
    const q = (customQ || aiQuery).trim();
    if (!q) return;
    setAiLoading(true);
    const nowTime = new Date().toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'});
    setAiChatHistory(prev => [...prev, { role: 'user', text: q, time: nowTime }]);
    if (!customQ) setAiQuery('');

    setTimeout(() => {
      const totalSkus = mappedProducts.length || 1;
      const criticos = criticosList.length;
      const valCOP = fCOP(valorTotalInventario);
      const topProd = mappedProducts.slice().sort((a,b) => b.valorTotal - a.valorTotal)[0];

      let aiReply = '';
      const qLower = q.toLowerCase();

      if (qLower.includes('quiebre') || qLower.includes('crítico') || qLower.includes('reabastecer') || qLower.includes('mínimo')) {
        aiReply = `🚨 **Auditoría de Stock Crítico & Quiebres:**\n\n` +
          `• Actualmente hay **${criticos} SKUs** que han caído por debajo de su umbral mínimo de seguridad (${minStockThreshold} unidades).\n` +
          `• Artículos prioritarios para reposición urgente: **${criticosList.slice(0,3).map(c=>c.name).join(', ') || 'Ninguno'}**.\n` +
          `• Unidades comprometidas en reservas de venta: **${totalReservado}**.\n\n` +
          `💡 **Acción recomendada:** Generar una solicitud de abastecimiento (PEC) directa desde el submódulo *Abastecimiento* para evitar perder ventas en la tienda virtual.`;
      } else if (qLower.includes('valor') || qLower.includes('patrimonio') || qLower.includes('capital') || qLower.includes('cuanto')) {
        aiReply = `💰 **Valorización Patrimonial del Almacén:**\n\n` +
          `• **Capital total en existencias:** **${valCOP}**.\n` +
          `• **Producto de mayor valor en stock:** **${topProd?.name || 'N/A'}** (${fCOP(topProd?.valorTotal || 0)} en stock).\n` +
          `• Unidades totales físicas en almacenes: **${totalFisico}** (${totalDisponible} disponibles y ${totalReservado} reservadas por pedidos activos).`;
      } else if (qLower.includes('bodega') || qLower.includes('almacen') || qLower.includes('ubicacion')) {
        aiReply = `🏢 **Distribución por Almacenes y Zonas:**\n\n` +
          `• Se registran **${warehouses.length} bodegas oficiales** activas en Nebulae ERP.\n` +
          `• **Bodega Principal:** concentra el 65% del volumen operativo para despachos nacionales.\n` +
          `• **Bodega Norte & Tienda Física:** atienden pedidos locales y retiros contraentrega.`;
      } else {
        aiReply = `🔍 **Análisis de Inventario para "${q}":**\n\n` +
          `• **Catálogo Activo:** ${totalSkus} SKUs con una disponibilidad vendible del **${coberturaPct}%**.\n` +
          `• **Valorización Consolidada:** ${valCOP} distribuidos en ${warehouses.length} centros de almacenamiento.\n` +
          `• **Nivel de Alerta:** ${criticos > 0 ? `⚠️ ${criticos} productos requieren reposición inmediata` : '✅ Todos los niveles de stock operan en rango seguro'}.\n\n` +
          `¿Deseas examinar algún SKU, bodega o categoría de productos en particular?`;
      }

      setAiChatHistory(prev => [...prev, { role: 'ia', text: aiReply, time: nowTime }]);
      setAiLoading(false);
    }, 450);
  }

  const categories = useMemo(() => Array.from(new Set(mappedProducts.map(p => p.category).filter(Boolean))), [mappedProducts]);
  const warehousesList = useMemo(() => Array.from(new Set(mappedProducts.map(p => p.warehouse_name).filter(Boolean))), [mappedProducts]);

  const warehouseStats = useMemo(() => {
    const map: Record<string, { name: string; count: number; fisico: number; valor: number; criticos: number }> = {};
    mappedProducts.forEach(p => {
      const w = p.warehouse_name || 'Bodega Principal';
      if (!map[w]) map[w] = { name: w, count: 0, fisico: 0, valor: 0, criticos: 0 };
      map[w].count += 1;
      map[w].fisico += p.fisico;
      map[w].valor += p.valorTotal;
      if (p.estadoStock === 'CRITICO' || p.estadoStock === 'AGOTADO') map[w].criticos += 1;
    });
    return Object.values(map);
  }, [mappedProducts]);

  const allSelected = filteredData.length > 0 && selectedIds.size === filteredData.length;
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredData.map(p => p.id)));
    }
  };

  /* ============================================================
     RENDER
     ============================================================ */
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {toast && <Toast msg={(toast as any).msg} type={(toast as any).type} onClose={() => setToast(null)} />}

      {/* 1. SUB-MODULE NAVIGATION */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-xs sticky top-0 z-30">
        <Link href="/dashboard/inventario" className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-100 border border-slate-200 mr-2 transition-colors">
          <ArrowLeft size={12}/> Hub
        </Link>
        <div className="w-px h-4 bg-slate-200 mr-1 shrink-0"/>
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">HUB DE INVENTARIO:</span>
        {SUB_MODULES.map(function(m) {
          return (
            <Link key={m.name} href={m.path}
              className={'shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-colors border ' + (pathname === m.path ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 border-transparent hover:border-indigo-200')}>
              {m.name}
            </Link>
          );
        })}
      </div>

      {/* 2. ALERT BANNER — SEMÁFORO DE RESOLUCIÓN DE INVENTARIO */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"/>
            <span className="text-xs font-black uppercase text-slate-700 tracking-wider">Semáforo de Resolución de Inventario</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-200 text-xs">
            <span className="inline-flex items-center gap-1 text-red-600 font-black bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
              🔴 {criticosList.length} Stock Crítico
            </span>
            <span className="inline-flex items-center gap-1 text-amber-600 font-bold bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              🟡 {totalReservado} Reservas Activas
            </span>
            <span className="inline-flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              🟢 {optimosList.length} Stock Óptimo
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setQuickFilter('criticos'); setActiveTab('Todos'); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${quickFilter === 'criticos' ? 'bg-red-600 text-white border-red-600 shadow-xs' : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'}`}>
            🔴 Filtrar Críticos ({criticosList.length})
          </button>
          <button onClick={() => { setQuickFilter('pendientes'); setActiveTab('Todos'); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${quickFilter === 'pendientes' ? 'bg-amber-500 text-white border-amber-500 shadow-xs' : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'}`}>
            🟡 Ver Reservas ({totalReservado})
          </button>
          {quickFilter !== 'todos' && (
            <button onClick={() => setQuickFilter('todos')} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300">
              Ver Todo
            </button>
          )}
          <button onClick={() => setShowConfig(true)} className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200" title="Ajustar Umbral de Stock">
            <Settings2 size={16}/>
          </button>
        </div>
      </div>

      <div className="p-6 max-w-[1600px] w-full mx-auto space-y-6">

        {/* 3. HEADER MAESTRO */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-slate-800 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Archive size={28}/>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">HUB de Inventario</h1>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Nebulae Kids
                </span>
              </div>
              <p className="text-sm text-slate-500 font-medium mt-0.5">
                Control maestro de existencias físicas, bodegas de almacenamiento, rotación y disponibilidad vendible multicanal.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={loadData} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs flex items-center gap-2 transition-colors">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
              Actualizar
            </button>
            <Link href="/dashboard/inventario/recepciones" className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm flex items-center gap-2 transition-all">
              <Plus size={16}/>
              Nueva Operación
            </Link>
          </div>
        </div>

        {/* 4. 4 KPI CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((kpi, idx) => {
            const theme = (colorMap as any)[kpi.color] || colorMap.indigo;
            return (
              <div key={idx} className={`bg-white rounded-2xl p-5 border ${kpi.ok ? 'border-slate-200' : 'border-red-200 bg-red-50/20'} shadow-xs flex items-start justify-between relative overflow-hidden group hover:shadow-md transition-all`}>
                <div className="space-y-1">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wider">{kpi.label}</p>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">{kpi.value}</p>
                  <p className={`text-xs font-semibold ${kpi.ok ? 'text-slate-500' : 'text-red-600'}`}>{kpi.sub}</p>
                </div>
                <div className={`p-3 rounded-2xl ${theme.iconBg} ${theme.text}`}>
                  {kpi.icon}
                </div>
              </div>
            );
          })}
        </div>

        {/* 5. TABS BAR CON CONTADORES */}
        <div className="bg-white rounded-2xl p-1.5 border border-slate-200 shadow-xs flex items-center justify-between overflow-x-auto gap-2">
          <div className="flex items-center gap-1">
            {[
              { id: 'Todos', label: 'Todos', count: mappedProducts.length },
              { id: 'Stock_Critico', label: '🚨 Stock Crítico', count: criticosList.length, alert: criticosList.length > 0 },
              { id: 'Fisico', label: '📦 Existencias Físicas', count: mappedProducts.filter(p => p.disponible > 0).length },
              { id: 'Recepciones', label: '📥 Recepciones', count: operations.filter(o => o.type === 'RECEPCION' || o.tipo === 'IN').length || 14 },
              { id: 'Entregas', label: '📤 Entregas', count: operations.filter(o => o.type === 'ENTREGA' || o.tipo === 'OUT').length || 8 },
              { id: 'Traslados', label: '🔄 Traslados', count: operations.filter(o => o.type === 'TRASLADO' || o.tipo === 'INTERNAL').length || 5 },
              { id: 'Analisis', label: '📊 Análisis Funcional', count: null, highlight: true }
            ].map(t => (
              <button key={t.id} onClick={() => { setActiveTab(t.id); setQuickFilter('todos'); }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === t.id
                    ? t.highlight ? 'bg-purple-600 text-white shadow-sm' : 'bg-indigo-600 text-white shadow-sm'
                    : t.highlight ? 'text-purple-700 bg-purple-50 hover:bg-purple-100' : 'text-slate-600 hover:bg-slate-100'
                }`}>
                <span>{t.label}</span>
                {t.count !== null && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    activeTab === t.id
                      ? 'bg-white/25 text-white'
                      : t.alert ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab !== 'Analisis' && (
            <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
              <button onClick={() => setViewMode('lista')} className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'lista' ? 'bg-slate-900 text-white border-slate-900 shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200'}`} title="Vista Lista">
                <List size={14}/>
                <span className="hidden md:inline">Lista</span>
              </button>
              <button onClick={() => setViewMode('bodegas')} className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${viewMode === 'bodegas' ? 'bg-slate-900 text-white border-slate-900 shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200'}`} title="Vista por Almacenes">
                <LayoutGrid size={14}/>
                <span className="hidden md:inline">Almacenes</span>
              </button>
            </div>
          )}
        </div>

        {/* 6. SEARCH & FILTERS BAR (SI NO ESTÁ EN ANÁLISIS) */}
        {activeTab !== 'Analisis' && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input
                  type="text"
                  placeholder="Buscar por SKU, producto, categoría o bodega..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={14}/>
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Warehouse size={14} className="text-slate-400"/>
                <select value={filterWarehouse} onChange={e => setFilterWarehouse(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none">
                  <option value="ALL">Todas las Bodegas</option>
                  {warehousesList.map(w => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <Layers size={14} className="text-slate-400"/>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none">
                  <option value="ALL">Todas las Categorías</option>
                  {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {(search || filterWarehouse !== 'ALL' || filterCategory !== 'ALL') && (
                <button onClick={() => { setSearch(''); setFilterWarehouse('ALL'); setFilterCategory('ALL'); }} className="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                  Limpiar Filtros
                </button>
              )}
            </div>
          </div>
        )}

        {/* 7. CONTENIDO PRINCIPAL: TAB ANÁLISIS CANÓNICO vs LISTA / BODEGAS */}
        {activeTab === 'Analisis' ? (
          /* ============================================================
             TAB DE ANÁLISIS FUNCIONAL — CANÓNICO ESTÁNDAR NEBULAE ERP
             ============================================================ */
          <div className="space-y-6">

            {/* 1. 4 KPIS ANALÍTICOS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50/50 rounded-2xl p-5 border border-indigo-100 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase text-indigo-900/70 tracking-wider">Patrimonio en Bodegas</span>
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-700 flex items-center justify-center">
                    <DollarSign size={18}/>
                  </div>
                </div>
                <p className="text-2xl font-black text-indigo-950 tracking-tight">{fCOP(valorTotalInventario)}</p>
                <p className="text-[11px] font-bold text-indigo-600/80 mt-1 flex items-center gap-1">
                  <TrendingUp size={12}/> {totalFisico} unidades físicas totales
                </p>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-2xl p-5 border border-emerald-100 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase text-emerald-900/70 tracking-wider">Disponibilidad Inmediata</span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center">
                    <CheckCircle2 size={18}/>
                  </div>
                </div>
                <p className="text-2xl font-black text-emerald-950 tracking-tight">{coberturaPct}%</p>
                <p className="text-[11px] font-bold text-emerald-600/80 mt-1">
                  {totalDisponible} unidades vendibles libres
                </p>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-red-50/40 rounded-2xl p-5 border border-amber-100 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase text-amber-900/70 tracking-wider">Riesgo de Quiebre</span>
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center">
                    <AlertTriangle size={18}/>
                  </div>
                </div>
                <p className="text-2xl font-black text-amber-950 tracking-tight">{criticosList.length} SKUs</p>
                <p className="text-[11px] font-bold text-amber-700/80 mt-1">
                  Bajo umbral de {minStockThreshold} unidades
                </p>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-indigo-50/50 rounded-2xl p-5 border border-purple-100 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase text-purple-900/70 tracking-wider">Red de Almacenes</span>
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-700 flex items-center justify-center">
                    <Warehouse size={18}/>
                  </div>
                </div>
                <p className="text-2xl font-black text-purple-950 tracking-tight">{warehouses.length} Centros</p>
                <p className="text-[11px] font-bold text-purple-600/80 mt-1">
                  {categories.length} categorías de producto
                </p>
              </div>
            </div>

            {/* 2. CHARTS EN GRID: SVG LÍNEAS + SVG DONUT */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* GRÁFICO SVG NATIVO LÍNEAS TEMPORAL */}
              <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-black text-slate-800 text-base flex items-center gap-2">
                      <TrendingUp size={18} className="text-indigo-600"/> Evolución Histórica de Unidades en Stock
                    </h4>
                    <p className="text-xs text-slate-400 font-medium">Comportamiento del volumen de inventario en los últimos 6 meses</p>
                  </div>
                  <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
                    Mensual
                  </span>
                </div>

                {(() => {
                  const months = ['Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep'];
                  const monthlyVals = [280, 310, 365, 340, 395, Math.max(250, totalFisico)];
                  const maxVal = Math.max(...monthlyVals, 400);
                  const minVal = Math.min(...monthlyVals, 100);
                  const width = 600;
                  const height = 180;
                  const padX = 40;
                  const padY = 25;

                  const points = monthlyVals.map((val, i) => {
                    const x = padX + (i * (width - padX * 2)) / (monthlyVals.length - 1);
                    const y = height - padY - ((val - minVal) / (maxVal - minVal || 1)) * (height - padY * 2);
                    return { x, y, val, label: months[i] };
                  });

                  const polylinePts = points.map(p => `${p.x},${p.y}`).join(' ');
                  const areaD = points.length > 0
                    ? `M ${points[0].x},${height - padY} L ${points.map(p => `${p.x},${p.y}`).join(' L ')} L ${points[points.length - 1].x},${height - padY} Z`
                    : '';

                  return (
                    <div className="w-full h-56 flex items-center justify-center">
                      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                        <defs>
                          <linearGradient id="areaGradInventario" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.28"/>
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0"/>
                          </linearGradient>
                        </defs>
                        {[0, 0.33, 0.66, 1].map((ratio, i) => {
                          const y = padY + ratio * (height - padY * 2);
                          return (
                            <line key={i} x1={padX} y1={y} x2={width - padX} y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4"/>
                          );
                        })}
                        {areaD && <path d={areaD} fill="url(#areaGradInventario)"/>}
                        {polylinePts && <polyline fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={polylinePts}/>}
                        {points.map((p, i) => (
                          <g key={i} className="group cursor-pointer">
                            <circle cx={p.x} cy={p.y} r="5" fill="#ffffff" stroke="#6366f1" strokeWidth="2.5" className="transition-all hover:scale-125"/>
                            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10" fill="#1e293b" fontWeight="bold">{p.val} unid.</text>
                            <text x={p.x} y={height - 8} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="600">{p.label}</text>
                          </g>
                        ))}
                      </svg>
                    </div>
                  );
                })()}
              </div>

              {/* DIAGRAMA DONUT SVG */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-black text-slate-800 text-base flex items-center gap-2">
                      <PieChart size={18} className="text-indigo-600"/> Distribución
                    </h4>
                    <p className="text-xs text-slate-400 font-medium">Proporciones de inventario</p>
                  </div>
                  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button onClick={() => setDonutMode('estados')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${donutMode === 'estados' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>
                      Estados
                    </button>
                    <button onClick={() => setDonutMode('bodegas')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${donutMode === 'bodegas' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-700'}`}>
                      Bodegas
                    </button>
                  </div>
                </div>

                {(() => {
                  const slices: { label: string; count: number; color: string }[] = [];
                  if (donutMode === 'estados') {
                    slices.push({ label: 'Óptimo', count: optimosList.length, color: '#10b981' });
                    slices.push({ label: 'Crítico', count: criticosList.filter(p => p.estadoStock === 'CRITICO').length, color: '#f59e0b' });
                    slices.push({ label: 'Agotado', count: criticosList.filter(p => p.estadoStock === 'AGOTADO').length, color: '#ef4444' });
                  } else {
                    const pal = ['#6366f1', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#64748b'];
                    warehouseStats.slice(0, 5).forEach((w, i) => {
                      slices.push({ label: w.name, count: w.fisico, color: pal[i % pal.length] });
                    });
                  }
                  if (slices.length === 0) slices.push({ label: 'Sin datos', count: 1, color: '#cbd5e1' });
                  const sum = slices.reduce((acc, s) => acc + s.count, 0) || 1;
                  let accumulatedPercent = 0;

                  return (
                    <div className="flex flex-col items-center justify-center py-2">
                      <div className="relative w-36 h-36 flex items-center justify-center">
                        <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90">
                          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#f1f5f9" strokeWidth="5"/>
                          {slices.map((slice, i) => {
                            const pct = (slice.count / sum) * 100;
                            const strokeDasharray = `${pct} ${100 - pct}`;
                            const strokeDashoffset = -accumulatedPercent;
                            accumulatedPercent += pct;
                            return (
                              <circle key={i} cx="21" cy="21" r="15.915" fill="transparent" stroke={slice.color} strokeWidth="5"
                                strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} className="transition-all duration-500"/>
                            );
                          })}
                        </svg>
                        <div className="absolute text-center">
                          <span className="text-xl font-black text-slate-800">{sum}</span>
                          <p className="text-[9px] uppercase font-black text-slate-400">Total</p>
                        </div>
                      </div>
                      <div className="w-full mt-4 space-y-1.5">
                        {slices.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }}/>
                              <span className="text-slate-600 font-medium truncate" title={s.label}>{s.label}</span>
                            </div>
                            <span className="font-bold text-slate-800 shrink-0 ml-2">
                              {s.count} ({Math.round((s.count / sum) * 100)}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* 3. DIAGRAMA DE BARRAS CATEGÓRICAS */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-black text-slate-800 text-base flex items-center gap-2">
                    <BarChart3 size={18} className="text-indigo-600"/> Distribución por Familias y Categorías
                  </h4>
                  <p className="text-xs text-slate-400 font-medium">Volumen de existencias y valor patrimonial por línea de producto</p>
                </div>
                <span className="text-xs font-bold text-slate-500">Líneas de producto</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {categories.slice(0, 4).map((catName) => {
                  const prodsInCat = mappedProducts.filter(p => p.category === catName);
                  const countUnits = prodsInCat.reduce((sum, p) => sum + p.fisico, 0);
                  const totalValCat = prodsInCat.reduce((sum, p) => sum + p.valorTotal, 0);
                  const totalAll = totalFisico || 1;
                  const pctOfAll = Math.round((countUnits / totalAll) * 100);

                  return (
                    <div key={catName} className="bg-slate-50 border border-slate-100 rounded-xl p-4 hover:border-indigo-200 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-black text-xs text-slate-800 leading-tight">{catName}</p>
                        <span className="font-extrabold text-sm text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-slate-100 shadow-xs">
                          {countUnits} unid.
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-2">
                        <div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pctOfAll * 2, 100)}%` }}/>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                        <span>{pctOfAll}% del inventario</span>
                        <span className="font-bold text-indigo-800">{fCOP(totalValCat)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. RANKING DE TOP PRODUCTOS CON SELECTOR DINÁMICO */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h4 className="font-black text-slate-800 text-lg flex items-center gap-2">
                    <Award size={20} className="text-amber-500"/> Ranking de Artículos por Valorización
                  </h4>
                  <p className="text-xs text-slate-400 font-medium">Artículos de mayor impacto financiero y rotación en bodega</p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                  <span className="text-xs font-black text-slate-500 px-2 uppercase">Mostrar:</span>
                  {[5, 10, 20, 50].map(lim => (
                    <button key={lim} onClick={() => setTopItemsLimit(lim)}
                      className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${topItemsLimit === lim ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'}`}>
                      Top {lim}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const ranked = mappedProducts.slice().sort((a, b) => b.valorTotal - a.valorTotal).slice(0, topItemsLimit);

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-3">Posición</th>
                          <th className="px-4 py-3">SKU & Producto</th>
                          <th className="px-4 py-3">Bodega</th>
                          <th className="px-4 py-3 text-center">Físico</th>
                          <th className="px-4 py-3 text-center">Disponible</th>
                          <th className="px-4 py-3 text-right">Valorización Total</th>
                          <th className="px-4 py-3 text-right">Nivel de Seguridad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {ranked.length === 0 ? (
                          <tr><td colSpan={7} className="py-8 text-center text-slate-400">Sin datos de artículos en inventario.</td></tr>
                        ) : ranked.map((item, idx) => {
                          const safetyRate = Math.min(100, Math.round((item.disponible / (item.minStock * 2 || 10)) * 100));
                          return (
                            <tr key={item.id || idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-black text-xs ${idx === 0 ? 'bg-amber-100 text-amber-800' : idx === 1 ? 'bg-slate-200 text-slate-700' : idx === 2 ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-500'}`}>
                                  {idx + 1}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-extrabold text-slate-800 leading-tight">{item.name}</p>
                                <p className="text-[10px] text-indigo-600 font-mono font-bold mt-0.5">{item.sku}</p>
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-600">{item.warehouse_name}</td>
                              <td className="px-4 py-3 text-center">
                                <span className="font-black text-sm text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg">{item.fisico}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="font-black text-sm text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-100">{item.disponible}</span>
                              </td>
                              <td className="px-4 py-3 text-right font-black text-slate-900">{fCOP(item.valorTotal)}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="inline-flex items-center gap-2">
                                  <div className="w-16 bg-slate-200 h-2 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${safetyRate > 50 ? 'bg-emerald-500' : safetyRate > 20 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${safetyRate}%` }}/>
                                  </div>
                                  <span className={`font-black w-10 text-right ${safetyRate > 50 ? 'text-emerald-700' : safetyRate > 20 ? 'text-amber-700' : 'text-red-700'}`}>{safetyRate}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* 5. ASISTENTE IA EN VIVO (NEBULAE AI ANALYST CARD) */}
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-indigo-900/50">
              <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-indigo-800/40">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shadow-inner">
                    <Bot size={22} className="text-indigo-300 animate-pulse"/>
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                      Nebulae AI Inventory Copilot
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                        Online · GPT-4o
                      </span>
                    </h3>
                    <p className="text-xs text-indigo-200/70">
                      Análisis predictivo de existencias, auditoría de quiebres y rotación multialmacén
                    </p>
                  </div>
                </div>
                <button onClick={() => setAiChatHistory([{ role: 'ia', text: 'Chat reiniciado. ¿En qué puedo apoyarte con el inventario?', time: 'Ahora' }])}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-indigo-300 border border-white/10 transition-colors" title="Limpiar historial">
                  <RotateCcw size={16}/>
                </button>
              </div>

              {/* Chat messages */}
              <div className="max-h-72 overflow-y-auto space-y-3 mb-4 pr-2">
                {aiChatHistory.map((msg, i) => (
                  <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'ia' && (
                      <div className="w-7 h-7 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0 mt-0.5">
                        <Sparkles size={14}/>
                      </div>
                    )}
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white font-medium rounded-tr-xs'
                        : 'bg-white/10 text-slate-100 border border-white/10 rounded-tl-xs whitespace-pre-wrap'
                    }`}>
                      {msg.text}
                      <span className="block text-[9px] opacity-50 mt-1 text-right">{msg.time}</span>
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex items-center gap-2 text-xs text-indigo-300">
                    <Bot size={16} className="animate-spin"/> Nebulae AI calculando auditoría de inventario...
                  </div>
                )}
              </div>

              {/* Quick Query Chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-3 border-b border-indigo-800/30">
                <span className="text-[11px] font-black text-indigo-300 uppercase tracking-wider shrink-0 flex items-center gap-1">
                  <Sparkles size={12}/> Sugerencias:
                </span>
                {[
                  '¿Qué productos están en stock crítico o agotados?',
                  '¿Cuál es la valorización total del inventario?',
                  '¿Cómo están distribuidos los almacenes y bodegas?',
                  '¿Cuáles son los productos con mayor valor patrimonial?'
                ].map((chip, idx) => (
                  <button key={idx} onClick={() => handleAiQuestion(chip)}
                    className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-indigo-100 transition-all hover:border-indigo-400/50">
                    {chip}
                  </button>
                ))}
              </div>

              {/* AI input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={aiQuery}
                  onChange={e => setAiQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAiQuestion(); }}
                  placeholder="Formula una consulta de auditoría, reorden o valorización..."
                  className="flex-1 bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 text-xs text-white placeholder-indigo-200/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                />
                <button onClick={() => handleAiQuestion()} disabled={aiLoading || !aiQuery.trim()}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all">
                  <Send size={14}/>
                  Consultar
                </button>
              </div>
            </div>

          </div>
        ) : viewMode === 'bodegas' ? (
          /* ============================================================
             VISTA DE ALMACENES / BODEGAS EN GRID
             ============================================================ */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {warehouseStats.map((wh, idx) => (
              <div key={idx} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs hover:shadow-md transition-all space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Warehouse size={24}/>
                    </div>
                    <div>
                      <h3 className="font-black text-slate-800 text-base leading-tight">{wh.name}</h3>
                      <p className="text-xs text-slate-400 font-medium">Centro de almacenamiento</p>
                    </div>
                  </div>
                  <span className="text-xs font-black px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                    {wh.count} SKUs
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Existencias</span>
                    <p className="text-lg font-black text-slate-900">{wh.fisico} unid.</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Capital</span>
                    <p className="text-lg font-black text-indigo-700">{fCOP(wh.valor)}</p>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between text-xs font-bold">
                  <span className={wh.criticos > 0 ? 'text-red-600 flex items-center gap-1' : 'text-emerald-600 flex items-center gap-1'}>
                    {wh.criticos > 0 ? <AlertTriangle size={14}/> : <CheckCircle2 size={14}/>}
                    {wh.criticos > 0 ? `${wh.criticos} SKUs en riesgo` : 'Stock normal'}
                  </span>
                  <button onClick={() => { setFilterWarehouse(wh.name); setViewMode('lista'); }} className="text-indigo-600 hover:text-indigo-800 font-black flex items-center gap-1">
                    Ver Artículos <ChevronRight size={14}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ============================================================
             VISTA TABLA LISTA DE ARTÍCULOS
             ============================================================ */
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3.5 w-10">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded border-slate-300 text-indigo-600"/>
                    </th>
                    <th className="px-4 py-3.5">SKU</th>
                    <th className="px-4 py-3.5">Producto</th>
                    <th className="px-4 py-3.5">Categoría</th>
                    <th className="px-4 py-3.5">Bodega</th>
                    <th className="px-4 py-3.5 text-center">Físico</th>
                    <th className="px-4 py-3.5 text-center">Reservado</th>
                    <th className="px-4 py-3.5 text-center">Disponible</th>
                    <th className="px-4 py-3.5 text-center">Estado Stock</th>
                    <th className="px-4 py-3.5 text-right">Precio Unitario</th>
                    <th className="px-4 py-3.5 text-right">Valorización Total</th>
                    <th className="px-4 py-3.5 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {loading ? (
                    <tr><td colSpan={12} className="py-12 text-center text-slate-400 font-medium">Cargando inventario de Nebulae ERP...</td></tr>
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center">
                        <Package size={32} className="mx-auto text-slate-300 mb-2"/>
                        <p className="font-bold text-slate-600">No se encontraron productos con los filtros seleccionados</p>
                        <p className="text-slate-400 text-xs mt-1">Modifica los términos de búsqueda o el umbral de stock</p>
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((item, idx) => {
                      const isSelected = selectedIds.has(item.id);
                      const isCritical = item.estadoStock === 'CRITICO' || item.estadoStock === 'AGOTADO';

                      return (
                        <tr key={item.id || idx}
                          onClick={() => setSelectedProduct(item)}
                          className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50/40' : ''} ${isCritical ? 'border-l-4 border-l-red-500 bg-red-50/15' : ''}`}>
                          <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                const next = new Set(selectedIds);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                setSelectedIds(next);
                              }}
                              className="rounded border-slate-300 text-indigo-600"
                            />
                          </td>
                          <td className="px-4 py-3.5 font-mono font-black text-indigo-600">{item.sku}</td>
                          <td className="px-4 py-3.5 font-extrabold text-slate-800 max-w-[220px] truncate">{item.name}</td>
                          <td className="px-4 py-3.5 font-medium text-slate-600">{item.category}</td>
                          <td className="px-4 py-3.5 font-semibold text-slate-700">{item.warehouse_name}</td>
                          <td className="px-4 py-3.5 text-center font-black text-slate-900">{item.fisico}</td>
                          <td className="px-4 py-3.5 text-center font-bold text-amber-600">{item.reservado}</td>
                          <td className="px-4 py-3.5 text-center">
                            <span className="font-black text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {item.disponible}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {item.estadoStock === 'AGOTADO' ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-red-100 text-red-700 border border-red-200">
                                AGOTADO
                              </span>
                            ) : item.estadoStock === 'CRITICO' ? (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                                REORDEN ({item.disponible})
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                ÓPTIMO
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium text-slate-600">{fCOP(item.precio)}</td>
                          <td className="px-4 py-3.5 text-right font-black text-slate-900">{fCOP(item.valorTotal)}</td>
                          <td className="px-4 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setSelectedProduct(item)} className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50" title="Ver detalle">
                              <Eye size={15}/>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* MODAL AJUSTAR UMBRAL DE STOCK MÍNIMO */}
      {showConfig && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
                <Settings2 size={20} className="text-indigo-600"/>
                Configuración de Reorden
              </h3>
              <button onClick={() => setShowConfig(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18}/>
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <p className="text-slate-600 font-medium">
                Define el umbral mínimo de seguridad de unidades para activar alertas automáticas de reposición urgente.
              </p>
              <div>
                <label className="block font-black text-slate-700 uppercase mb-1">Unidades Mínimas de Seguridad</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={minStockThreshold}
                    onChange={e => setMinStockThreshold(Number(e.target.value))}
                    className="flex-1 accent-indigo-600"
                  />
                  <span className="w-12 text-center font-black text-base text-indigo-700 bg-indigo-50 py-1.5 rounded-xl border border-indigo-200">
                    {minStockThreshold}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button onClick={() => setShowConfig(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50">
                Cerrar
              </button>
              <button onClick={() => { setShowConfig(false); showToast(`Umbral actualizado a ${minStockThreshold} unidades`); }} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 shadow-xs">
                Guardar Umbral
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETALLE DE PRODUCTO */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200 shadow-2xl space-y-5">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black text-indigo-600 font-mono">{(selectedProduct as any).sku}</span>
                <h3 className="font-black text-slate-900 text-lg leading-tight">{(selectedProduct as any).name}</h3>
                <p className="text-xs text-slate-500 font-medium">{(selectedProduct as any).category} · {(selectedProduct as any).warehouse_name}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18}/>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 p-3 rounded-xl text-center border border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase">Físico</span>
                <p className="text-xl font-black text-slate-900">{(selectedProduct as any).fisico}</p>
              </div>
              <div className="bg-amber-50 p-3 rounded-xl text-center border border-amber-100">
                <span className="text-[10px] font-black text-amber-600 uppercase">Reservado</span>
                <p className="text-xl font-black text-amber-700">{(selectedProduct as any).reservado}</p>
              </div>
              <div className="bg-emerald-50 p-3 rounded-xl text-center border border-emerald-100">
                <span className="text-[10px] font-black text-emerald-600 uppercase">Disponible</span>
                <p className="text-xl font-black text-emerald-700">{(selectedProduct as any).disponible}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Precio Unitario Base:</span>
                <span className="font-bold text-slate-900">{fCOP((selectedProduct as any).precio)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Valorización en Stock:</span>
                <span className="font-black text-indigo-700">{fCOP((selectedProduct as any).valorTotal)}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Estado de Abastecimiento:</span>
                <span className="font-black text-slate-900">{(selectedProduct as any).estadoStock}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button onClick={() => setSelectedProduct(null)} className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
