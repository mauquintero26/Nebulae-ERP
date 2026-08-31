'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, Calculator, Send, AlertCircle, Loader2 } from 'lucide-react';
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

export default function ProyeccionesPage() {
  const [rawData, setRawData] = useState<any[]>([]);
  const [forecastData, setForecastData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [investment, setInvestment] = useState(5000000);
  const [chatPrompt, setChatPrompt] = useState('');

  // Load history data to send to forecast API
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/history/load', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: 'ventas', force: false })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'success' && data.data) {
            setRawData(data.data);
          }
        }
      } catch (err) {
        console.error('Error loading history for forecast:', err);
      }
    };
    fetchHistory();
  }, []);

  const handleCalculate = async () => {
    if (rawData.length === 0) {
      setError('No hay datos históricos cargados para proyectar. Ve a Exportar Ventas del Día.');
      return;
    }
    
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: rawData })
      });
      
      const data = await res.json();
      if (data.status === 'success') {
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

  useEffect(() => {
    const formatted = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(investment);
    setChatPrompt(`Tengo una inversión de ${formatted}. Basado en estas proyecciones, elabora un plan financiero de crecimiento distribuyendo estas compras en productos de entrega inmediata para las categorías específicas de: niños, cuidado y salud, cremas, maternidad y bebés. Sugiéreme estratégicamente cómo y dónde distribuir esta inversión en el inventario.`);
  }, [investment]);

  // Chart Data
  const chartData = useMemo(() => {
    if (forecastData.length === 0) return { labels: [], datasets: [] };
    
    return {
      labels: forecastData.map(d => d.fecha),
      datasets: [
        {
          label: 'Proyección de Ingresos',
          data: forecastData.map(d => parseFloat(d.prediccion)),
          borderColor: '#8b5cf6', // purple-500
          backgroundColor: 'rgba(139, 92, 246, 0.15)',
          borderWidth: 3,
          borderDash: [5, 5],
          pointRadius: 4,
          pointBackgroundColor: '#8b5cf6',
          fill: true,
          tension: 0.4,
        }
      ]
    };
  }, [forecastData]);

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        ticks: {
          callback: function(value: any) {
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
            return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(context.parsed.y);
          }
        }
      }
    }
  };

  const executeInvestmentPlan = () => {
    alert(`Enviando prompt al IA:\n\n${chatPrompt}\n\nNota: La integración completa del Chat IA en esta vista se realizará al unificar el módulo del Asistente IA.`);
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full">
      <div className="flex flex-col items-start justify-between">
        <Link href="/dashboard/ventas" className="flex items-center text-sm font-semibold text-slate-500 hover:text-purple-600 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Ventas
        </Link>
        <div className="flex items-center justify-between w-full">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-purple-600" /> Proyecciones Matemáticas de Ventas
          </h1>
          <p className="text-sm text-slate-500 mt-1">Calcula tendencias y pronósticos de ventas futuras basados en la serie de tiempo histórica.</p>
        </div>
        <button 
          onClick={handleCalculate}
          disabled={isLoading || rawData.length === 0}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white font-bold py-2.5 px-6 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
        >
          {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Calculando...</> : <><Calculator className="w-4 h-4" /> Recalcular Proyección</>}
        </button>
      </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 p-4 rounded-lg flex items-center gap-2 text-sm font-medium">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      {forecastData.length === 0 && !isLoading && !error && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 shadow-sm flex flex-col items-center justify-center text-center">
          <TrendingUp className="w-12 h-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-700 mb-2">No hay proyecciones generadas</h3>
          <p className="text-sm text-slate-500 max-w-md mb-6">
            Presiona el botón "Recalcular Proyección" para enviar el histórico actual al motor de pronósticos.
          </p>
        </div>
      )}

      {forecastData.length > 0 && (
        <div className="flex flex-col gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm min-h-[400px]">
            <h3 className="font-bold text-slate-800 mb-6">Gráfica de Tendencia Futura (Próximos días)</h3>
            <div className="w-full h-[320px]">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>

          <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-blue-600" /> Plan Financiero (IA)
            </h3>
            <p className="text-sm text-blue-800 mb-4">Ingresa el monto de inversión que deseas analizar y la Inteligencia Artificial te recomendará dónde invertir el inventario según esta proyección.</p>
            
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-blue-900 mb-1">Monto de Inversión Inicial (COP)</label>
                <div className="flex gap-4">
                  <input 
                    type="number" 
                    value={investment}
                    onChange={(e) => setInvestment(Number(e.target.value))}
                    className="w-48 px-3 py-2 bg-white border border-blue-300 rounded-lg outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all font-mono"
                  />
                  <div className="flex-1">
                    <input 
                      type="text" 
                      value={new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(investment)}
                      disabled
                      className="w-full px-3 py-2 bg-slate-100/50 border border-slate-200 rounded-lg text-slate-500 font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-blue-900 mb-1">Prompt Generado para la IA</label>
                <textarea 
                  value={chatPrompt}
                  onChange={(e) => setChatPrompt(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-3 bg-white border border-blue-300 rounded-lg text-sm text-slate-700 outline-none focus:border-blue-600 transition-all resize-none"
                />
              </div>

              <div className="flex justify-end">
                <button 
                  onClick={executeInvestmentPlan}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Send className="w-4 h-4" /> Generar Plan con IA
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
