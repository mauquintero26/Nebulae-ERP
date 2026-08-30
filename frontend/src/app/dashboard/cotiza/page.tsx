"use client";

import { useState } from 'react';
import { Calculator, ArrowRight } from 'lucide-react';
import { calculateQuotation } from '@/lib/api';

export default function CotizaPage() {
  const [quoteForm, setQuoteForm] = useState({
    costUsd: '',
    discount: '0',
    weightLb: '1',
    trm: '4000'
  });
  const [quoteResult, setQuoteResult] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCalculating(true);
    setQuoteResult(null);
    try {
      const result = await calculateQuotation(
        parseFloat(quoteForm.costUsd),
        parseFloat(quoteForm.discount),
        parseFloat(quoteForm.weightLb),
        parseFloat(quoteForm.trm)
      );
      setQuoteResult(result);
    } catch (err) {
      console.error(err);
      alert("Error al calcular la cotización. Asegúrate de que el backend esté corriendo.");
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div className="p-8 h-full overflow-y-auto space-y-6 animate-in fade-in duration-500 custom-scrollbar">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-purple-600 text-white rounded-lg shadow-md shadow-purple-200">
              <Calculator size={24} />
            </div>
            Cotizador Avanzado
          </h1>
          <p className="text-slate-500 mt-1">Calcula costos de importación, impuestos y precios sugeridos usando el Motor Financiero.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col md:flex-row min-h-[500px]">
        <div className="p-8 md:w-1/2 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/50">
          <form onSubmit={handleCalculate} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">Costo Base del Producto (USD) *</label>
              <input 
                type="number" step="0.01" required
                value={quoteForm.costUsd}
                onChange={e => setQuoteForm({...quoteForm, costUsd: e.target.value})}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all shadow-sm"
                placeholder="Ej. 120.00"
              />
            </div>
            
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1.5">Descuento del Proveedor (%)</label>
              <input 
                type="number" step="0.1"
                value={quoteForm.discount}
                onChange={e => setQuoteForm({...quoteForm, discount: e.target.value})}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all shadow-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1.5">Peso (Libras) *</label>
                <input 
                  type="number" step="0.1" required
                  value={quoteForm.weightLb}
                  onChange={e => setQuoteForm({...quoteForm, weightLb: e.target.value})}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1.5">TRM del día *</label>
                <input 
                  type="number" step="0.01" required
                  value={quoteForm.trm}
                  onChange={e => setQuoteForm({...quoteForm, trm: e.target.value})}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 focus:ring-4 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all shadow-sm"
                />
              </div>
            </div>
            
            <button 
              type="submit" 
              disabled={isCalculating}
              className="w-full bg-purple-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-purple-200 hover:bg-purple-700 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 mt-4"
            >
              {isCalculating ? 'Calculando matriz...' : 'Generar Cotización Matemática'} <ArrowRight size={18} />
            </button>
          </form>
        </div>

        <div className="p-8 md:w-1/2 flex flex-col justify-center bg-white relative overflow-hidden">
          {quoteResult ? (
            <div className="relative z-10 animate-in fade-in slide-in-from-right-4 duration-500">
              <h3 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-8 h-1 bg-purple-500 rounded-full inline-block" />
                Resumen Financiero
              </h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <span className="font-bold text-slate-500">Costo Total de Importación</span>
                  <span className="text-lg font-extrabold text-slate-800">
                    ${quoteResult.total_cost_cop?.toLocaleString('es-CO')} COP
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-5 rounded-2xl bg-purple-50 border border-purple-100 shadow-inner">
                  <span className="font-bold text-purple-700">Precio Sugerido Venta</span>
                  <span className="text-2xl font-black text-purple-700">
                    ${quoteResult.suggested_price_cop?.toLocaleString('es-CO')} COP
                  </span>
                </div>
                
                <div className="flex justify-between items-center p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                  <span className="font-bold text-emerald-700">Anticipo Requerido (60%)</span>
                  <span className="text-lg font-extrabold text-emerald-700">
                    ${quoteResult.advance_payment_cop?.toLocaleString('es-CO')} COP
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-400">
              <Calculator size={48} className="mx-auto mb-4 opacity-20" />
              <p className="font-medium">Ingresa los datos del producto para visualizar el desglose matemático y márgenes de ganancia.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
