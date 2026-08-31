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

interface AnalisisComprasProps {
  rawData: any[];
}

export function AnalisisCompras({ rawData }: AnalisisComprasProps) {
  const enrichedData = rawData;

  // Chart and Metric State
  const [chartType, setChartType] = useState<'line' | 'bar' | 'pie'>('line');
  const [metricY, setMetricY] = useState<'inversion' | 'unidades'>('inversion');
  const [granularity, setGranularity] = useState<'D' | 'M' | 'Y'>('D'); 
  
  // Filters State
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedEstado, setSelectedEstado] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Products Multi-select State
  const allProducts = useMemo(() => Array.from(new Set(enrichedData.map(d => d.name).filter(Boolean))).sort(), [enrichedData]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set(allProducts));
  const [productSearch, setProductSearch] = useState('');

  // Top Products View Mode
  const [productViewMode, setProductViewMode] = useState('top5');

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
    setSelectedProducts(new Set(allProducts));
  }, [allProducts]);

  useEffect(() => {
    if (enrichedData.length > 0 && !dateFrom && !dateTo) {
      handleQuickView('7D');
    }
    
    // Register zoom plugin dynamically
    import('chartjs-plugin-zoom').then((plugin) => {
      ChartJS.register(plugin.default);
    }).catch(err => console.error('Failed to load chartjs-plugin-zoom:', err));
  }, [enrichedData.length]);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{role: 'ai' | 'user', text: string}[]>([
    { role: 'ai', text: 'Hola, estoy listo para analizar las métricas de compras. Presiona "Hacer Análisis" o pregúntame algo.' }
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
  const estados = useMemo(() => Array.from(new Set(enrichedData.map(d => d.status).filter(Boolean))).sort(), [enrichedData]);

  // Aplicar Filtros Globales
  const filteredData = useMemo(() => {
    return enrichedData.filter((item) => {
      const itemCat = item.Categoría || item.Categoria || 'Otros';
      if (selectedCategory !== 'ALL' && itemCat !== selectedCategory) return false;
      if (selectedEstado !== 'ALL' && item.status !== selectedEstado) return false;
      if (item.name && !selectedProducts.has(item.name)) return false;
      
      let isoDate = '';
      if (item.date) {
        if (item.date.includes('/')) {
            const parts = item.date.split('/');
            if (parts.length === 3) isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        } else if (item.date.includes('-')) {
            isoDate = item.date;
        }
      }

      if (dateFrom && isoDate < dateFrom) return false;
      if (dateTo && isoDate > dateTo) return false;
      return true;
    });
  }, [enrichedData, selectedCategory, selectedEstado, dateFrom, dateTo, selectedProducts]);

  // KPIs
  const { totalInversion, totalUnidades } = useMemo(() => {
    let inversion = 0;
    let unidades = 0;
    filteredData.forEach(d => {
      inversion += (parseFloat(d.price) || 0) * (parseInt(d.qty) || 1);
      unidades += parseInt(d.qty) || 1;
    });
    return { totalInversion: inversion, totalUnidades: unidades };
  }, [filteredData]);

  const costoPromedio = totalUnidades > 0 ? totalInversion / totalUnidades : 0;
  const formatMoney = (val: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);

  // Análisis de Productos (Instead of Clientes for Compras)
  const productsAnalysis = useMemo(() => {
    const map: Record<string, {inversion: number, unidades: number, categorias: Set<string>, dias: Set<string>}> = {};
    
    filteredData.forEach(d => {
      const c = d.name || 'Desconocido';
      if (!map[c]) map[c] = { inversion: 0, unidades: 0, categorias: new Set(), dias: new Set() };
      
      map[c].inversion += (parseFloat(d.price) || 0) * (parseInt(d.qty) || 1);
      map[c].unidades += parseInt(d.qty) || 1;
      const itemCat = d.Categoría || d.Categoria || 'Otros';
      if (itemCat) map[c].categorias.add(itemCat);
      
      let isoDate = '';
      if (d.date) {
        if (d.date.includes('/')) {
            const parts = d.date.split('/');
            if (parts.length === 3) isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        } else if (d.date.includes('-')) {
            isoDate = d.date;
        }
      }
      if (isoDate) map[c].dias.add(isoDate);
    });

    let result = Object.entries(map).map(([producto, stats]) => ({
      producto,
      inversion: stats.inversion,
      unidades: stats.unidades,
      categorias: Array.from(stats.categorias).join(', '),
      dias: Array.from(stats.dias).sort().join(', ')
    }));

    if (productViewMode === 'top5') result = result.sort((a, b) => b.inversion - a.inversion).slice(0, 5);
    else if (productViewMode === 'top10') result = result.sort((a, b) => b.inversion - a.inversion).slice(0, 10);
    else if (productViewMode === 'gt_500k') result = result.filter(r => r.inversion > 500000).sort((a, b) => b.inversion - a.inversion);

    return result;
  }, [filteredData, productViewMode]);

  // Gráficas
  const chartData = useMemo(() => {
    const groups: Record<string, number> = {};

    if (chartType === 'pie') {
      filteredData.forEach(d => {
        const cat = d.Categoría || d.Categoria || 'Otros';
        groups[cat] = (groups[cat] || 0) + (metricY === 'unidades' ? (parseInt(d.qty) || 1) : ((parseFloat(d.price) || 0) * (parseInt(d.qty) || 1)));
      });
    } else {
      filteredData.forEach(d => {
        if (!d.date) return;
        
        let isoDate = "";
        if (d.date.includes('/')) {
            const parts = d.date.split('/');
            if (parts.length === 3) isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        } else if (d.date.includes('-')) {
            isoDate = d.date;
        }

        let key = isoDate || d.date;
        if (isoDate && isoDate.includes('-')) {
            const [year, month, day] = isoDate.split('-');
            if (granularity === 'M') key = `${year}-${month}`;
            else if (granularity === 'Y') key = year;
            else key = isoDate;
        }

        groups[key] = (groups[key] || 0) + (metricY === 'unidades' ? (parseInt(d.qty) || 1) : ((parseFloat(d.price) || 0) * (parseInt(d.qty) || 1)));
      });
    }

    const labels = Object.keys(groups).sort();
    const values = labels.map(l => groups[l]);
    
    const pastelColors = ['#BAFFC9', '#BAE1FF', '#E6B3FF', '#FFB3BA', '#FFDFBA', '#FFFFBA', '#FFB3E6', '#E2F0CB', '#FFD1DC', '#F0E68C'];

    return {
      labels,
      datasets: [
        {
          label: chartType === 'pie' ? 'Distribución por Categoría' : (metricY === 'unidades' ? 'Unidades Compradas' : 'Inversión Total'),
          data: values,
          borderColor: chartType === 'pie' ? '#ffffff' : '#10b981',
          backgroundColor: chartType === 'pie' ? pastelColors : (chartType === 'bar' ? '#10b981' : 'rgba(16, 185, 129, 0.15)'),
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
      x: { grid: { color: "rgba(0,0,0,0.03)" } },
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
            if (context.parsed.y !== null) label += metricY === 'inversion' ? formatMoney(context.parsed.y) : context.parsed.y;
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
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[700px]">
      
      {/* Columna Izquierda: Filtros Globales y Configuraciones */}
      <div className="lg:col-span-3 flex flex-col gap-4">
        
        {/* Panel de Filtros Globales */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm h-full">
          <h3 className="font-bold text-slate-700 mb-4 pb-2 border-b border-slate-200 text-sm flex items-center">
            <span className="w-1.5 h-4 bg-emerald-500 rounded-full mr-2"></span>
            Filtros Globales de Gráfica
          </h3>
          
          <div className="space-y-4">
            
            {/* Vistas Rápidas */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2">Vistas Rápidas (Fecha de Compra)</label>
              <div className="flex flex-wrap gap-1.5">
                {['7D', '1M', '3M', '6M', '1Y'].map(v => (
                  <button key={v} onClick={() => handleQuickView(v)} className="px-2 py-1 text-[10px] font-bold bg-white border border-slate-200 rounded text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors">
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Desde</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs shadow-sm focus:border-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Hasta</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs shadow-sm focus:border-emerald-500 outline-none" />
              </div>
            </div>

            <button onClick={() => {setDateFrom(''); setDateTo(''); setSelectedCategory('ALL'); setSelectedEstado('ALL'); setSelectedProducts(new Set(allProducts));}} className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold py-2 rounded-lg transition-colors shadow-sm">
              Limpiar Filtros
            </button>

            <hr className="border-slate-200" />

            {/* Dimensiones */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Categoría</label>
              <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500 shadow-sm">
                <option value="ALL">Todas</option>
                {categories.map((c: any) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Estado</label>
              <select value={selectedEstado} onChange={e => setSelectedEstado(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500 shadow-sm">
                <option value="ALL">Todos los Estados</option>
                {estados.map((c: any) => <option key={c} value={c}>{c}</option>)}
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
                className="w-full px-3 py-1.5 mb-2 bg-white border border-slate-200 rounded-md text-xs outline-none focus:border-emerald-500 shadow-sm" 
              />
              <div className="border border-slate-200 rounded-md p-2 bg-white max-h-40 overflow-y-auto text-xs space-y-1 shadow-inner">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700 pb-1 border-b border-slate-100">
                  <input type="checkbox" checked={selectedProducts.size === allProducts.length && allProducts.length > 0} onChange={toggleAllProducts} className="rounded text-emerald-500 focus:ring-emerald-500" />
                  (Seleccionar Todos)
                </label>
                {allProducts.filter(p => p.toLowerCase().includes(productSearch.toLowerCase())).map((p: any) => (
                  <label key={p} className="flex items-center gap-2 cursor-pointer text-slate-600 truncate hover:bg-slate-50 px-1 rounded transition-colors" title={p}>
                    <input type="checkbox" checked={selectedProducts.has(p)} onChange={() => toggleProduct(p)} className="rounded text-emerald-500 focus:ring-emerald-500" />
                    <span className="truncate">{p}</span>
                  </label>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Tipo de Gráfica Default</label>
              <select value={chartType} onChange={(e) => setChartType(e.target.value as any)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500 shadow-sm">
                <option value="line">Área / Líneas (Evolución)</option>
                <option value="bar">Barras (Comparación)</option>
                <option value="pie">Torta (Distribución)</option>
              </select>
            </div>

          </div>
        </div>

      </div>

      {/* Main Analysis Area */}
      <div className="lg:col-span-9 flex flex-col gap-4">
        
        {/* Panel de Métricas / KPIs (Context-Aware) */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Inversión (Filtro)</p>
            <p className="text-2xl font-black text-emerald-700">{formatMoney(totalInversion)}</p>
          </div>
          <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Unidades</p>
            <p className="text-2xl font-black text-slate-800">{new Intl.NumberFormat('es-CO').format(totalUnidades)}</p>
          </div>
          <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Costo Promedio / Ud</p>
            <p className="text-2xl font-black text-blue-600">{formatMoney(costoPromedio)}</p>
          </div>
        </div>

        {/* Panel Central: Gráfica Interactiva */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex-1 min-h-[400px] flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-800">Visualización de Datos</h2>
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button onClick={() => setMetricY('inversion')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${metricY === 'inversion' ? 'bg-white shadow-sm text-emerald-700' : 'text-slate-500 hover:text-slate-700'}`}>Inversión</button>
              <button onClick={() => setMetricY('unidades')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${metricY === 'unidades' ? 'bg-white shadow-sm text-emerald-700' : 'text-slate-500 hover:text-slate-700'}`}>Unidades</button>
            </div>
          </div>
          
          <div className="flex-1 relative w-full h-[350px]">
            {chartData.labels.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                <p>No hay datos para graficar con los filtros actuales.</p>
              </div>
            ) : chartType === 'pie' ? (
              <Pie data={chartData} options={{...chartOptions, maintainAspectRatio: false}} />
            ) : chartType === 'bar' ? (
              <Bar data={chartData} options={chartOptions} />
            ) : (
              <Line data={chartData} options={chartOptions} />
            )}
          </div>
          
          {chartType !== 'pie' && (
            <div className="mt-4 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-slate-500">Agrupar Eje X:</span>
                <select value={granularity} onChange={e => setGranularity(e.target.value as any)} className="bg-slate-50 border border-slate-200 text-xs px-2 py-1 rounded outline-none text-slate-700">
                  <option value="D">Diario</option>
                  <option value="M">Mensual</option>
                  <option value="Y">Anual</option>
                </select>
              </div>
              <p className="text-[10px] text-slate-400">Puedes hacer zoom con el scroll del mouse sobre la gráfica.</p>
            </div>
          )}
        </div>

        {/* Panel Inferior: Chat IA y Análisis Secundario */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[400px]">
          
          {/* Chat con Datos Contextuales */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-full overflow-hidden">
            <div className="bg-slate-900 p-3 flex justify-between items-center">
              <h3 className="text-sm font-bold text-white flex items-center">
                <Bot className="w-4 h-4 mr-2 text-emerald-400" /> Analista IA (Context-Aware)
              </h3>
              <div className="flex items-center gap-2">
                <select value={aiModel} onChange={e => setAiModel(e.target.value)} className="text-[10px] bg-slate-800 text-slate-300 border-none rounded outline-none">
                  <option value="gpt-4o">GPT-4o (Recomendado)</option>
                  <option value="claude-3.5-sonnet">Claude 3.5</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                </select>
              </div>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto bg-slate-50 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'ai' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'ai' ? 'bg-white border border-slate-200 text-slate-700 shadow-sm rounded-tl-none' : 'bg-emerald-600 text-white shadow-sm rounded-tr-none'}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> <span className="text-xs text-slate-500">Analizando datos...</span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-3 border-t border-slate-200 bg-white">
              <div className="flex gap-2">
                <button 
                  onClick={() => handleSendChat("Haz un análisis ejecutivo sobre estos datos. Encuentra tendencias importantes de compra y recomienda qué re-stockear.")}
                  className="px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold rounded-lg border border-emerald-200 transition-colors whitespace-nowrap"
                >
                  Hacer Análisis
                </button>
                <div className="flex-1 relative">
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                    placeholder="Pregúntale algo sobre las compras..." 
                    className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500 transition-colors"
                  />
                  <button onClick={() => handleSendChat()} disabled={!chatInput || isChatLoading} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-600 disabled:opacity-50">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Top Productos Rank */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-800">Ranking de Productos</h3>
              <select value={productViewMode} onChange={e => setProductViewMode(e.target.value)} className="text-xs border border-slate-200 rounded p-1 outline-none">
                <option value="top5">Top 5 Inversiones</option>
                <option value="top10">Top 10 Inversiones</option>
                <option value="gt_500k">Compras &gt; $500k</option>
              </select>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-2">
              {productsAnalysis.length === 0 ? (
                <div className="text-center text-sm text-slate-400 py-10">No hay datos en el filtro actual.</div>
              ) : (
                productsAnalysis.map((p, i) => (
                  <div key={i} className="flex justify-between items-center p-3 hover:bg-slate-50 border border-transparent hover:border-slate-100 rounded-lg transition-colors group">
                    <div className="overflow-hidden">
                      <p className="text-sm font-bold text-slate-700 truncate">{p.producto}</p>
                      <p className="text-[10px] text-slate-500 truncate">Cat: {p.categorias || 'N/A'}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-sm font-black text-emerald-600">{formatMoney(p.inversion)}</p>
                      <p className="text-[10px] text-slate-500 font-medium">{p.unidades} Unds.</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
