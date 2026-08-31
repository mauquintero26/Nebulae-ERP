'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, Calculator, AlertCircle, Loader2 } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function ComprasProyeccionesPage() {
  const [comprasData, setComprasData] = useState<any[]>([]);
  const [forecastData, setForecastData] = useState<any[]>([]);
  
  const [months, setMonths] = useState('6');
  const [freq, setFreq] = useState('M');
  const [metric, setMetric] = useState('Valor_Total');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load history data to send to forecast API
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/history/compras');
        if (res.ok) {
          const data = await res.json();
          if (data.files && data.files.length > 0) {
            const latestFile = data.files[0].filename;
            const loadRes = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/history/compras/load', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filenames: [latestFile] })
            });
            const loadData = await loadRes.json();
            if (loadData.data) {
              setComprasData(loadData.data);
            }
          }
        }
      } catch (err) {
        console.error('Error loading history for compras forecast:', err);
      }
    };
    fetchHistory();
  }, []);

  const handleCalculate = async () => {
    if (comprasData.length === 0) {
      setError('No hay datos históricos de compras cargados para proyectar. Ve a Registro o a Historial.');
      return;
    }
    
    setIsLoading(true);
    setError('');

    try {
      // The API expects DataPayload: { data: list, months: int, freq: str, target_metric: str }
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          data: comprasData,
          months: parseInt(months),
          freq: freq,
          target_metric: metric
        })
      });
      
      const data = await res.json();
      if (data.forecast) {
        setForecastData(data.forecast);
      } else {
        throw new Error(data.message || 'Error calculando proyecciones.');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión con FastAPI.');
    } finally {
      setIsLoading(false);
    }
  };

  // Chart Data
  const chartData = useMemo(() => {
    if (forecastData.length === 0) return { labels: [], datasets: [] };
    
    return {
      labels: forecastData.map(d => d.fecha),
      datasets: [
        {
          label: `Proyección de ${metric === 'Valor_Total' ? 'Inversión' : 'Unidades'}`,
          data: forecastData.map(d => parseFloat(d.prediccion)),
          borderColor: '#10b981', // emerald-500
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          borderWidth: 3,
          borderDash: [5, 5],
          pointRadius: 4,
          pointBackgroundColor: '#10b981',
          fill: true,
          tension: 0.4,
        }
      ]
    };
  }, [forecastData, metric]);

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        ticks: {
          callback: function(value: any) {
            if (metric === 'Cantidad') return value;
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
        callbacks: {
          label: function(context: any) {
            if (metric === 'Cantidad') return context.parsed.y + ' Unid.';
            return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(context.parsed.y);
          }
        }
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10">
      <div className="flex flex-col items-start justify-between">
        <Link href="/dashboard/compras" className="flex items-center text-sm font-semibold text-slate-500 hover:text-emerald-600 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Dashboard Compras
        </Link>
        <div className="flex items-center justify-between w-full">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-emerald-600" /> Proyecciones de Compras
            </h1>
            <p className="text-sm text-slate-500 mt-1">Calcula tendencias y pronósticos de futuras inversiones en inventario o volumen de unidades.</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Proyección a (Meses)</label>
          <select value={months} onChange={e => setMonths(e.target.value)} className="w-40 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500 font-medium">
            <option value="3">3 Meses</option>
            <option value="6">6 Meses</option>
            <option value="12">12 Meses</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Agrupar Por</label>
          <select value={freq} onChange={e => setFreq(e.target.value)} className="w-40 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500 font-medium">
            <option value="Y">Año</option>
            <option value="M">Mes</option>
            <option value="W">Semana</option>
            <option value="D">Día</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Métrica Objetivo</label>
          <select value={metric} onChange={e => setMetric(e.target.value)} className="w-40 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-emerald-500 font-medium">
            <option value="Valor_Total">Inversión ($)</option>
            <option value="Cantidad">Unidades</option>
          </select>
        </div>
        
        <button 
          onClick={handleCalculate}
          disabled={isLoading || comprasData.length === 0}
          className="ml-auto bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-2.5 px-6 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
        >
          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Calculando...</> : <><Calculator className="w-4 h-4" /> Generar Proyección</>}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 p-4 rounded-lg flex items-center gap-2 text-sm font-medium">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      {forecastData.length === 0 && !isLoading && !error && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm flex flex-col items-center justify-center text-center mt-2">
          <TrendingUp className="w-12 h-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-700 mb-2">Aún no has generado un forecast</h3>
          <p className="text-sm text-slate-500 max-w-md mb-6">
            Ajusta los parámetros arriba y presiona "Generar Proyección" para estimar tus futuras compras.
          </p>
        </div>
      )}

      {forecastData.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm min-h-[450px] mt-2">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            Gráfica de Tendencia Futura
          </h3>
          <div className="w-full h-[350px]">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      )}
    </div>
  );
}
