'use client';

import { useState, useMemo, useEffect } from 'react';
import { Bot, Send, Loader2, RotateCcw } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

import { Line, Bar, Pie } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface AnalisisVentasProps {
  rawData: any[];
}



export function AnalisisVentas({ rawData }: AnalisisVentasProps) {
  // Usar rawData que ya viene enriquecido desde page.tsx
  const enrichedData = rawData;

  // Chart and Metric State
  const [chartType, setChartType] = useState<'line' | 'bar' | 'pie'>('line');
  const [metricY, setMetricY] = useState<'ingresos' | 'unidades'>('ingresos');
  const [granularity, setGranularity] = useState<'D' | 'M' | 'Y'>('D'); 
  
  // Filters State
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedClient, setSelectedClient] = useState('ALL');
  const [selectedTipoVenta, setSelectedTipoVenta] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Products Multi-select State
  const allProducts = useMemo(() => Array.from(new Set(enrichedData.map(d => d.Producto).filter(Boolean))).sort(), [enrichedData]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set(allProducts));
  const [productSearch, setProductSearch] = useState('');

  // Top Clientes View Mode
  const [clientViewMode, setClientViewMode] = useState('top5');

  // Vistas Rápidas Logic
  const handleQuickView = (view: string) => {
    if (!view) return;
    const now = new Date();
    const to = now.toISOString().split('T')[0];
    let fromDate = new Date();
    
    if (view === '7D') fromDate.setDate(now.getDate() - 7);
    if (view === '1M') fromDate.setMonth(now.getMonth() - 1);
    if (view === '3M') fromDate.setMonth(now.getMonth() - 3);
    if (view === '6M') fromDate.setMonth(now.getMonth() - 6);
    if (view === '1Y') fromDate.setFullYear(now.getFullYear() - 1);
    
    setDateFrom(fromDate.toISOString().split('T')[0]);
    setDateTo(to);
  };

  useEffect(() => {
    // Auto-select all products when data changes
    setSelectedProducts(new Set(allProducts));
  }, [allProducts]);

  useEffect(() => {
    // Default to 7D view on first load if we have data
    if (enrichedData.length > 0 && !dateFrom && !dateTo) {
      handleQuickView('7D');
    }
    
    // Register zoom plugin dynamically
    import('chartjs-plugin-zoom').then((plugin) => {
      ChartJS.register(plugin.default);
    }).catch(err => console.error('Failed to load chartjs-plugin-zoom:', err));
  }, [enrichedData.length]); // Solo ejecutar cuando lleguen datos nuevos por primera vez

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{role: 'ai' | 'user', text: string}[]>([
    { role: 'ai', text: 'Hola, estoy listo para analizar la gráfica actual. Presiona "Hacer Análisis" o pregúntame lo que necesites.' }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState('openai');
  const [aiModel, setAiModel] = useState('gpt-4o');

  // Dimensiones
  const categories = [
    "Ropa", "Calzado", "Maternidad", "Esenciales (Salud y Cremas)", 
    "Vitaminas y Suplementos", "Juguetes", "Disfraces", "Accesorios", 
    "Otros", "Mas"
  ];
  const clients = useMemo(() => Array.from(new Set(enrichedData.map(d => d.Cliente).filter(Boolean))).sort(), [enrichedData]);

  // Aplicar Filtros Globales
  const filteredData = useMemo(() => {
    return enrichedData.filter((item) => {
      const itemCat = item.Categoría || item.Categoria || 'Otros';
      if (selectedCategory !== 'ALL' && itemCat !== selectedCategory) return false;
      if (selectedClient !== 'ALL' && item.Cliente !== selectedClient) return false;
      const itemTipoVenta = (item.Tipo_Venta || '').toUpperCase().trim();
      if (selectedTipoVenta !== 'ALL' && itemTipoVenta !== selectedTipoVenta) return false;
      if (item.Producto && !selectedProducts.has(item.Producto)) return false;
      
      let isoDate = '';
      if (item.Fecha) {
        if (item.Fecha.includes('/')) {
            const parts = item.Fecha.split('/');
            if (parts.length === 3) isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        } else if (item.Fecha.includes('-')) {
            isoDate = item.Fecha;
        }
      }

      if (dateFrom && isoDate < dateFrom) return false;
      if (dateTo && isoDate > dateTo) return false;
      return true;
    });
  }, [enrichedData, selectedCategory, selectedClient, dateFrom, dateTo, selectedProducts]);

  // KPIs
  const { totalIngresos, totalUnidades } = useMemo(() => {
    let ingresos = 0;
    let unidades = 0;
    filteredData.forEach(d => {
      ingresos += parseFloat(d.Valor_Total) || 0;
      unidades += parseInt(d.Cantidad) || 1;
    });
    return { totalIngresos: ingresos, totalUnidades: unidades };
  }, [filteredData]);

  const ticketPromedio = totalUnidades > 0 ? totalIngresos / totalUnidades : 0;
  const formatMoney = (val: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

  // Análisis de Clientes
  const clientsAnalysis = useMemo(() => {
    const map: Record<string, {ingresos: number, unidades: number, categorias: Set<string>, dias: Set<string>}> = {};
    
    filteredData.forEach(d => {
      const c = d.Cliente || 'Desconocido';
      if (!map[c]) map[c] = { ingresos: 0, unidades: 0, categorias: new Set(), dias: new Set() };
      
      map[c].ingresos += parseFloat(d.Valor_Total) || 0;
      map[c].unidades += parseInt(d.Cantidad) || 1;
      if (d.Categoría) map[c].categorias.add(d.Categoría);
      
      let isoDate = '';
      if (d.Fecha) {
        if (d.Fecha.includes('/')) {
            const parts = d.Fecha.split('/');
            if (parts.length === 3) isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        } else if (d.Fecha.includes('-')) {
            isoDate = d.Fecha;
        }
      }
      if (isoDate) map[c].dias.add(isoDate);
    });

    let result = Object.entries(map).map(([cliente, stats]) => ({
      cliente,
      ingresos: stats.ingresos,
      unidades: stats.unidades,
      categorias: Array.from(stats.categorias).join(', '),
      dias: Array.from(stats.dias).sort().join(', ')
    }));

    if (clientViewMode === 'top5') result = result.sort((a, b) => b.ingresos - a.ingresos).slice(0, 5);
    else if (clientViewMode === 'top10') result = result.sort((a, b) => b.ingresos - a.ingresos).slice(0, 10);
    else if (clientViewMode === 'one_purchase_day') result = result.filter(r => r.dias.split(', ').length === 1).sort((a, b) => b.ingresos - a.ingresos);
    else if (clientViewMode === 'one_purchase_item') result = result.filter(r => r.unidades === 1).sort((a, b) => b.ingresos - a.ingresos);
    else if (clientViewMode === 'gt_500k') result = result.filter(r => r.ingresos > 500000).sort((a, b) => b.ingresos - a.ingresos);
    else if (clientViewMode === 'gt_1m') result = result.filter(r => r.ingresos > 1000000).sort((a, b) => b.ingresos - a.ingresos);

    return result;
  }, [filteredData, clientViewMode]);

  // Gráficas
  const chartData = useMemo(() => {
    const groups: Record<string, number> = {};

    if (chartType === 'pie') {
      filteredData.forEach(d => {
        const cat = d.Categoría || 'Desconocido';
        groups[cat] = (groups[cat] || 0) + (metricY === 'unidades' ? (parseInt(d.Cantidad) || 1) : (parseFloat(d.Valor_Total) || 0));
      });
    } else {
      filteredData.forEach(d => {
        if (!d.Fecha) return;
        
        // Robust Date Normalization for Chart X-Axis
        let isoDate = "";
        if (d.Fecha.includes('/')) {
            const parts = d.Fecha.split('/');
            if (parts.length === 3) isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        } else if (d.Fecha.includes('-')) {
            isoDate = d.Fecha; // YYYY-MM-DD
        }

        let key = isoDate || d.Fecha;
        if (isoDate && isoDate.includes('-')) {
            const [year, month, day] = isoDate.split('-');
            if (granularity === 'M') key = `${year}-${month}`;
            else if (granularity === 'Y') key = year;
            else key = isoDate;
        }

        groups[key] = (groups[key] || 0) + (metricY === 'unidades' ? (parseInt(d.Cantidad) || 1) : (parseFloat(d.Valor_Total) || 0));
      });
    }

    const labels = Object.keys(groups).sort();
    const values = labels.map(l => groups[l]);
    
    const pastelColors = ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E6B3FF', '#FFB3E6', '#E2F0CB', '#FFD1DC', '#F0E68C'];

    return {
      labels,
      datasets: [
        {
          label: chartType === 'pie' ? 'Distribución por Categoría' : (metricY === 'unidades' ? 'Unidades Vendidas' : 'Ingresos Totales'),
          data: values,
          borderColor: chartType === 'pie' ? '#ffffff' : '#3b82f6',
          backgroundColor: chartType === 'pie' ? pastelColors : (chartType === 'bar' ? '#3b82f6' : 'rgba(59, 130, 246, 0.15)'),
          borderWidth: chartType === 'pie' ? 1 : 2.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: chartType === 'line',
          tension: 0.4, 
        }
      ]
    };
  }, [filteredData, chartType, metricY, granularity]);

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { color: "rgba(0,0,0,0.03)" }
      },
      y: {
        grid: { color: "rgba(0,0,0,0.03)" },
        ticks: {
          callback: function(value: any) {
            if (metricY === 'unidades') return value;
            if (value >= 1000000) return (value / 1000000) + 'M';
            if (value >= 1000) return (value / 1000) + 'K';
            return value;
          }
        }
      }
    },
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        titleColor: "#1e293b",
        bodyColor: "#334155",
        borderColor: "#e2e8f0",
        borderWidth: 1,
        padding: 12,
        usePointStyle: true,
        callbacks: {
          label: function(context: any) {
            let label = context.dataset.label || '';
            if (label) label += ': ';
            if (context.parsed.y !== null) label += metricY === 'ingresos' ? formatMoney(context.parsed.y) : context.parsed.y;
            return label;
          }
        }
      },
      zoom: {
        pan: { enabled: true, mode: 'x' },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
      }
    }
  };

  const toggleProduct = (prod: string) => {
    const newSet = new Set(selectedProducts);
    if (newSet.has(prod)) newSet.delete(prod);
    else newSet.add(prod);
    setSelectedProducts(newSet);
  };
  
  const toggleAllProducts = () => {
    if (selectedProducts.size === allProducts.length) setSelectedProducts(new Set());
    else setSelectedProducts(new Set(allProducts));
  };

  const handleSendChat = async (overridePrompt?: string) => {
    const textToSend = overridePrompt || chatInput.trim();
    if (!textToSend || isChatLoading) return;
    if (!overridePrompt) setChatInput('');
    
    setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setIsChatLoading(true);

    try {
      const apiKey = localStorage.getItem('ai_api_key') || '';
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Provider': aiProvider,
          'X-Model': aiModel,
          'X-Api-Key': apiKey
        },
        body: JSON.stringify({ context: filteredData, question: textToSend })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.response || 'No recibí respuesta válida del servidor.' }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'ai', text: '❌ Error de conexión con FastAPI. Verifica que el servidor python esté en ejecución.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-[900px] bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200">
      
      {/* Sidebar Filters */}
      <div className="w-full lg:w-72 bg-slate-50/50 border-r border-slate-200 flex flex-col h-[900px]">
        <div className="p-5 border-b border-slate-200 bg-white">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center">
            <FilterIcon className="w-4 h-4 mr-2" /> Filtros Avanzados
          </h3>
        </div>
        
        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {/* Vistas Rápidas */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Vistas Rápidas</label>
            <select onChange={e => handleQuickView(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 shadow-sm">
              <option value="">Seleccione un periodo...</option>
              <option value="7D">Últimos 7 días</option>
              <option value="1M">Último mes</option>
              <option value="3M">Últimos 3 meses</option>
              <option value="6M">Últimos 6 meses</option>
              <option value="1Y">Último año</option>
            </select>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Desde</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs shadow-sm focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Hasta</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs shadow-sm focus:border-blue-500 outline-none" />
            </div>
          </div>

          <button onClick={() => {setDateFrom(''); setDateTo(''); setSelectedCategory('ALL'); setSelectedClient('ALL'); setSelectedTipoVenta('ALL'); setSelectedProducts(new Set(allProducts));}} className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold py-2 rounded-lg transition-colors shadow-sm">
            Limpiar Filtros
          </button>

          <hr className="border-slate-200" />

          {/* Dimensiones */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Categoría</label>
            <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 shadow-sm">
              <option value="ALL">Todas</option>
              {categories.map((c: any) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Cliente</label>
            <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 shadow-sm">
              <option value="ALL">Todos los Clientes</option>
              {clients.map((c: any) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo de Venta</label>
            <select value={selectedTipoVenta} onChange={e => setSelectedTipoVenta(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 shadow-sm">
              <option value="ALL">Todo Tipo de Venta</option>
              <option value="POR PEDIDO">POR PEDIDO</option>
              <option value="ENTREGA INMEDIATA">ENTREGA INMEDIATA</option>
            </select>
          </div>
          
          {/* Multi-Select de Productos */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Filtrar por Producto</label>
            <input 
              type="text" 
              placeholder="Buscar producto..." 
              value={productSearch}
              onChange={e => setProductSearch(e.target.value)}
              className="w-full px-3 py-1.5 mb-2 bg-white border border-slate-200 rounded-md text-xs outline-none focus:border-blue-500 shadow-sm" 
            />
            <div className="border border-slate-200 rounded-md p-2 bg-white max-h-40 overflow-y-auto text-xs space-y-1 shadow-inner">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700 pb-1 border-b border-slate-100">
                <input type="checkbox" checked={selectedProducts.size === allProducts.length && allProducts.length > 0} onChange={toggleAllProducts} className="rounded text-blue-500 focus:ring-blue-500" />
                (Seleccionar Todos)
              </label>
              {allProducts.filter(p => p.toLowerCase().includes(productSearch.toLowerCase())).map((p: any) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer text-slate-600 truncate hover:bg-slate-50 px-1 rounded transition-colors" title={p}>
                  <input type="checkbox" checked={selectedProducts.has(p)} onChange={() => toggleProduct(p)} className="rounded text-blue-500 focus:ring-blue-500" />
                  <span className="truncate">{p}</span>
                </label>
              ))}
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo de Gráfica Default</label>
            <select value={chartType} onChange={(e) => setChartType(e.target.value as any)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 shadow-sm">
              <option value="line">Área / Líneas (Evolución)</option>
              <option value="bar">Barras (Comparación)</option>
              <option value="pie">Torta (Distribución)</option>
            </select>
          </div>

        </div>
      </div>

      {/* Main Analysis Area */}
      <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto h-[900px] bg-slate-50/20">
        
        {/* Top KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-shrink-0">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <p className="text-xs font-bold text-slate-500 uppercase mb-1">Ingresos Totales (Selección)</p>
            <h4 className="text-3xl font-extrabold text-slate-900 truncate tracking-tight">{formatMoney(totalIngresos)}</h4>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <p className="text-xs font-bold text-slate-500 uppercase mb-1">Unidades Vendidas</p>
            <h4 className="text-3xl font-extrabold text-slate-900 truncate tracking-tight">{totalUnidades}</h4>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
            <p className="text-xs font-bold text-slate-500 uppercase mb-1">Ticket Promedio</p>
            <h4 className="text-3xl font-extrabold text-slate-900 truncate tracking-tight">{formatMoney(ticketPromedio)}</h4>
          </div>
        </div>

        {/* Chart Row */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col relative min-h-[350px] flex-shrink-0">
          <div className="absolute top-4 left-4 z-10 flex gap-2">
            <button 
              onClick={() => setMetricY(m => m === 'ingresos' ? 'unidades' : 'ingresos')}
              className="text-xs bg-white text-slate-700 px-3 py-1.5 rounded-lg font-medium border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors flex items-center"
            >
              <span className="text-blue-500 mr-1">Y:</span> {metricY === 'ingresos' ? 'Ingresos ($)' : 'Unidades (#)'}
            </button>
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
            {chartType !== 'pie' && (
              <button 
                onClick={() => setGranularity(g => g === 'M' ? 'D' : (g === 'D' ? 'Y' : 'M'))}
                className="text-xs bg-white text-slate-700 px-4 py-1.5 rounded-full font-medium border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors flex items-center"
              >
                <span className="text-blue-500 mr-1">Eje X:</span> {granularity === 'M' ? 'Meses' : (granularity === 'D' ? 'Días' : 'Años')}
              </button>
            )}
          </div>
          <div className="absolute top-4 right-4 z-10">
              <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm flex items-center gap-1">
                <RotateCcw className="w-3 h-3 text-blue-500" /> Usa scroll para Zoom In/Out
              </span>
          </div>
          
          <div className="w-full flex-1 pt-12 pb-8 min-h-[280px]">
            {chartType === 'line' && <Line data={chartData} options={chartOptions} />}
            {chartType === 'bar' && <Bar data={chartData} options={chartOptions} />}
            {chartType === 'pie' && <Pie data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />}
          </div>
        </div>

        {/* Análisis de Clientes (Table) */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col flex-shrink-0 min-h-[250px] overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-4">
            <h3 className="text-sm font-bold text-slate-800">Análisis de Clientes</h3>
            <select 
              value={clientViewMode} 
              onChange={e => setClientViewMode(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-md text-sm outline-none focus:border-blue-500 shadow-sm"
            >
                <option value="top5">Top 5 Clientes (Monto)</option>
                <option value="top10">Top 10 Clientes (Monto)</option>
                <option value="one_purchase_day">Clientes con 1 sola compra (Único día)</option>
                <option value="one_purchase_item">Clientes con 1 solo artículo comprado</option>
                <option value="gt_500k">Clientes con compras &gt; $500.000</option>
                <option value="gt_1m">Clientes con compras &gt; $1.000.000</option>
            </select>
          </div>
          <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white text-slate-500 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">Cliente</th>
                  <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider"># Artículos</th>
                  <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">Categorías</th>
                  <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider">Días de Compra</th>
                  <th className="px-4 py-3 font-semibold uppercase text-xs tracking-wider text-right">Total Comprado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clientsAnalysis.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Sin datos para este filtro</td></tr>
                ) : clientsAnalysis.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{c.cliente}</td>
                    <td className="px-4 py-3 text-slate-600">{c.unidades}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-[150px]" title={c.categorias}>{c.categorias}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-[200px]" title={c.dias}>{c.dias}</td>
                    <td className="px-4 py-3 font-extrabold text-slate-900 text-right">{formatMoney(c.ingresos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AI Chat Integration */}
        <div className="bg-white border border-blue-200 rounded-xl shadow-sm overflow-hidden flex flex-col flex-1 min-h-[300px] flex-shrink-0">
          <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold text-blue-900 flex items-center">
              <Bot className="w-5 h-5 mr-2 text-blue-600" />
              Chat Analista (Contexto: Datos Filtrados)
            </h3>
            
            <div className="flex items-center gap-2 text-xs">
              <div className="flex flex-col">
                <label className="text-[10px] text-blue-800 font-semibold mb-0.5">Proveedor IA</label>
                <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} className="px-2 py-1 rounded border border-blue-200 bg-white text-slate-700 outline-none">
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] text-blue-800 font-semibold mb-0.5">Modelo</label>
                <select value={aiModel} onChange={e => setAiModel(e.target.value)} className="px-2 py-1 rounded border border-blue-200 bg-white text-slate-700 outline-none w-28">
                  {aiProvider === 'openai' && <><option value="gpt-4o">GPT-4o</option><option value="gpt-4o-mini">GPT-4o-mini</option></>}
                  {aiProvider === 'anthropic' && <><option value="claude-3-5-sonnet">Sonnet 3.5</option><option value="claude-3-haiku">Haiku</option></>}
                  {aiProvider === 'gemini' && <><option value="gemini-1.5-pro">Pro 1.5</option><option value="gemini-1.5-flash">Flash 1.5</option></>}
                </select>
              </div>
              
              <button 
                onClick={() => handleSendChat('Por favor, analiza la gráfica y las ventas de este periodo actual. Dime qué conclusiones importantes sacas, patrones de clientes, y si notas anomalías o recomendaciones.')}
                className="ml-2 mt-3 bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded transition-colors shadow-sm flex items-center"
              >
                📊 Hacer Análisis
              </button>
            </div>
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto bg-slate-50/50 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex items-start ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-slate-200 ml-3' : 'bg-blue-600 mr-3'}`}>
                  {msg.role === 'user' ? <span className="text-xs font-bold text-slate-500">Tú</span> : <Bot className="w-4 h-4 text-white" />}
                </div>
                <div className={`border rounded-2xl px-4 py-2 text-sm shadow-sm max-w-[85%] whitespace-pre-wrap ${
                  msg.role === 'user' 
                    ? 'bg-slate-800 text-white border-slate-900 rounded-tr-none' 
                    : 'bg-white text-slate-700 border-slate-200 rounded-tl-none leading-relaxed'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex items-start">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center mr-3 flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-2 text-sm text-slate-500 shadow-sm flex items-center">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin text-blue-600" /> Analizando contexto en el backend...
                </div>
              </div>
            )}
          </div>

          <div className="p-3 border-t border-slate-200 bg-white flex gap-2">
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                placeholder="Escribe tu consulta analítica específica aquí..."
                className="w-full bg-slate-50 border border-slate-300 rounded-lg py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
              <button 
                onClick={() => handleSendChat()}
                disabled={isChatLoading || !chatInput.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-blue-600 disabled:opacity-50 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

function FilterIcon(props: any) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  );
}
