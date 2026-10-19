"use client";

import { useState, useEffect } from 'react';
import { Calculator, ArrowRight, DollarSign, Percent, Scale, TrendingUp, User, Plus, FileText, CheckCircle2 } from 'lucide-react';
import { getCustomers, apiFetch, API_URL, getHeaders } from '@/lib/api';
import { computeMarginPrice, MARGIN_PCT_CAP } from '@/lib/pricing';
import toast from 'react-hot-toast';
import Link from 'next/link';
// B3 T17 (IVA punto 13): el IVA de la línea, con la misma regla del servidor (lib/iva.js) y la tarifa de Configuración.
import { intentarTotalesCotizacion, etiquetaCortaTarifaIva, TARIFA_IVA_POR_DEFECTO } from '@/lib/iva';
import { tarifaIvaDeConfig } from '@/lib/listas-ventas';
import { porcentajeDePesos } from '@/lib/dinero-ventas';
import { SelectTarifaIva, pesosOGuion } from '../ventas/cotizacion/calculadora-iva';

function formatCOP(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);
}

export default function CotizaPage() {
  const [productName, setProductName] = useState('');
  const [costUsd, setCostUsd] = useState<number>(100);
  const [fleteUsd, setFleteUsd] = useState<number>(15);
  const [discountPct, setDiscountPct] = useState<number>(0);
  const [margenPct, setMargenPct] = useState<number>(30);
  const [trm, setTrm] = useState<number>(4200);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [isCreatingCot, setIsCreatingCot] = useState(false);
  // B3 T17 (IVA punto 13): arranca en iva_tarifa_defecto de /ventas/config; lo que elija el asesor no lo pisa esa lectura.
  const [tarifaConfig, setTarifaConfig] = useState<string>(TARIFA_IVA_POR_DEFECTO);
  const [tarifaElegida, setTarifaElegida] = useState<string | null>(null);
  const tarifaIva = tarifaElegida ?? tarifaConfig;

  useEffect(() => {
    getCustomers().then(res => {
      const list = res.data || res;
      if (Array.isArray(list)) setCustomers(list);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let vigente = true;
    apiFetch('/ventas/config').then(cfg => { if (vigente) setTarifaConfig(tarifaIvaDeConfig(cfg)); }).catch(() => {});
    return () => { vigente = false; };
  }, []);

  // Live calculation
  const costAfterDiscountUsd = costUsd * (1 - (discountPct || 0) / 100);
  const totalCostUsd = costAfterDiscountUsd + (fleteUsd || 0);
  const costCop = costAfterDiscountUsd * trm;
  const fleteCop = (fleteUsd || 0) * trm;
  const totalCostCop = totalCostUsd * trm;

  const { totalCop: precioVentaCopRaw, unitPriceCop: unitPriceCopRaw } = computeMarginPrice(totalCostCop, margenPct, 1);
  const precioVentaCop = Math.round(precioVentaCopRaw);
  const unitPriceCop = Math.round(unitPriceCopRaw);
  const utilidadCop = Math.max(0, precioVentaCop - totalCostCop);
  // B3 T17 (IVA punto 13, R8): el precio calculado es sin IVA y el IVA va encima; el 60/40 es sobre el total con IVA. Las
  // cifras salen de lib/iva.js (la regla del servidor); con un precio no válido no se cae: el motivo en línea y «—».
  const ivaRapido = intentarTotalesCotizacion([{ product_name: productName.trim() || 'el producto', qty: 1,
    unit_price_cop: unitPriceCop, iva_tarifa: tarifaIva }], 0);
  const lineaIva = ivaRapido.totales?.lineas[0] ?? null;
  const totalConIva = ivaRapido.totales ? ivaRapido.totales.total_cop : null;
  const anticipo60 = totalConIva === null ? null : porcentajeDePesos(totalConIva, 60);
  const saldo40 = totalConIva === null || anticipo60 === null ? null : totalConIva - anticipo60;
  // r1: el mismo pesosOGuion de la calculadora, con el formato de moneda que ya usa esta página.
  const montoOGuion = (v: number | null) => pesosOGuion(v, formatCOP);

  const handleCrearCotizacionDirecta = async () => {
    if (!selectedCustomerId) {
      toast.error('Selecciona un cliente para crear la cotización');
      return;
    }
    if (!productName.trim()) {
      toast.error('Ingresa el nombre del producto');
      return;
    }
    // B3 T17: con un precio no válido el botón está deshabilitado y el motivo se ve junto al IVA.
    if (!ivaRapido.totales || !lineaIva) return;

    setIsCreatingCot(true);
    const tid = toast.loading('Creando cotización formal...');
    try {
      const clientObj = customers.find(c => String(c.id) === String(selectedCustomerId));
      const body = {
        customer_id: Number(selectedCustomerId),
        customer_name: `${clientObj?.first_name || ''} ${clientObj?.last_name || ''}`.trim(),
        customer_phone: clientObj?.phone || '',
        customer_email: clientObj?.email || '',
        customer_address: clientObj?.address || '',
        trm_rate: trm,
        // B3 T17 (IVA punto 13): subtotal y total (con IVA) de lib/iva.js y la tarifa en la línea; el servidor recalcula.
        subtotal_cop: ivaRapido.totales.subtotal_cop,
        total_cop: ivaRapido.totales.total_cop,
        anticipo_cop: anticipo60,
        productos: [{
          product_name: productName.trim(),
          qty: 1,
          cost_usd: costUsd,
          flete_usd: fleteUsd,
          margen_pct: margenPct,
          unit_price_cop: unitPriceCop,
          total_cop: lineaIva.total_cop,
          iva_tarifa: lineaIva.iva_tarifa
        }],
        // B3 T17 r1 (R3/C19): sin notas. Las «Notas» de la COT le llegan al cliente (documento, PDF y correo); el margen
        // y la TRM ya quedan en la línea y en trm_rate, que el cliente no ve.
      };

      const res = await fetch(`${API_URL}/ventas/cotizaciones`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error creando cotización');

      const cotId = data.data?.id || data.id;
      toast.success(`¡Cotización ${data.data?.numero || ''} creada!`, { id: tid });
      // B3 T17: assign() en vez de asignar href (lo mismo; el compilador de React marcaba la asignación al global).
      window.location.assign(`/dashboard/ventas/cotizacion?id=${cotId}`);
    } catch (e: any) {
      toast.error(e.message || 'Error al crear cotización', { id: tid });
    } finally {
      setIsCreatingCot(false);
    }
  };

  return (
    <div className="p-8 h-full overflow-y-auto space-y-6 bg-[#f8f9fa] animate-in fade-in duration-500 custom-scrollbar">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 text-white rounded-xl shadow-md flex items-center justify-center">
              <Calculator size={22} />
            </div>
            Cotizador Rápido de Productos
          </h1>
          <p className="text-slate-500 text-xs mt-1">Calcula costos de importación, margen real de ganancia y división 60/40.</p>
        </div>
        <Link
          href="/dashboard/ventas/cotizacion"
          className="text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-4 py-2 rounded-xl transition-colors inline-flex items-center gap-1.5"
        >
          <FileText size={14} /> Ver Cotizaciones en Ventas
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Card: Input Parameters */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Parámetros del Producto</h3>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Nombre del Producto *</label>
            <input
              type="text"
              value={productName}
              onChange={e => setProductName(e.target.value)}
              placeholder="Ej. Cuna Colecho Premium Bebé"
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-purple-200 focus:border-purple-600 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Costo Base Tienda (USD) *</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costUsd}
                  onChange={e => setCostUsd(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-4 py-2.5 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-purple-200 focus:border-purple-600 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Flete Internacional (USD)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fleteUsd}
                  onChange={e => setFleteUsd(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-4 py-2.5 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-purple-200 focus:border-purple-600 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Descuento (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={discountPct}
                onChange={e => setDiscountPct(parseFloat(e.target.value) || 0)}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-purple-200 focus:border-purple-600 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Margen Deseado (%)</label>
              <input
                type="number"
                min="0"
                max={MARGIN_PCT_CAP}
                value={margenPct}
                onChange={e => setMargenPct(Math.min(MARGIN_PCT_CAP, Math.max(0, parseFloat(e.target.value) || 0)))}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-purple-200 focus:border-purple-600 outline-none font-bold text-purple-700"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">TRM (COP/USD)</label>
              <input
                type="number"
                min="1000"
                step="10"
                value={trm}
                onChange={e => setTrm(parseFloat(e.target.value) || 4200)}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-purple-200 focus:border-purple-600 outline-none"
              />
            </div>
          </div>

          {/* B3 T17 (IVA punto 13): la tarifa de IVA del producto; arranca en la de Configuración. */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="cotiza-tarifa-iva" className="block text-xs font-bold text-slate-600 mb-1">IVA</label>
              <SelectTarifaIva id="cotiza-tarifa-iva" valor={tarifaIva} onCambio={setTarifaElegida}
                className="w-full min-w-0 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-purple-200 focus:border-purple-600 outline-none" />
            </div>
          </div>

          {/* Customer Selection for direct conversion */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h4 className="text-xs font-black text-slate-600 uppercase tracking-wider">Asignar a Cliente (Opcional)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={selectedCustomerId}
                onChange={e => setSelectedCustomerId(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-200 focus:border-purple-600 outline-none"
              >
                <option value="">-- Seleccionar cliente --</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name} ({c.phone || c.email || 'Sin contacto'})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleCrearCotizacionDirecta}
                disabled={isCreatingCot || !selectedCustomerId || !ivaRapido.totales}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus size={14} /> Crear Cotización Formal
              </button>
            </div>
          </div>
        </div>

        {/* Right Card: Financial Breakdown & 60/40 */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-600" /> Desglose Comercial y Utilidad
            </h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl text-xs">
                <span className="font-semibold text-slate-500">Costo Base Importación</span>
                <span className="font-bold text-slate-800">{formatCOP(costCop)} ({costAfterDiscountUsd.toFixed(2)} USD)</span>
              </div>

              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl text-xs">
                <span className="font-semibold text-slate-500">Flete Estimado</span>
                <span className="font-bold text-slate-800">{formatCOP(fleteCop)} ({fleteUsd.toFixed(2)} USD)</span>
              </div>

              <div className="flex justify-between items-center p-3.5 bg-slate-100 rounded-xl text-xs">
                <span className="font-bold text-slate-700">Costo Total Compra</span>
                <span className="font-black text-slate-900 text-sm">{formatCOP(totalCostCop)}</span>
              </div>

              <div className="flex justify-between items-center p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs">
                <span className="font-bold text-emerald-800">Utilidad Bruta Proyectada</span>
                <span className="font-black text-emerald-700 text-sm">+{formatCOP(utilidadCop)} ({margenPct}%)</span>
              </div>
            </div>

            {/* Final Sale Price */}
            <div className="mt-5 p-5 bg-purple-50 border border-purple-200 rounded-2xl">
              <span className="text-xs font-black text-purple-700 uppercase tracking-wider block mb-1">Precio de Venta Sugerido</span>
              <h2 className="text-3xl font-black text-purple-900">{formatCOP(precioVentaCop)}</h2>
            </div>

            {/* B3 T17 (IVA punto 13): el IVA de la línea y el total con IVA, que es lo que paga el cliente. */}
            <div className="mt-3 space-y-2">
              <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl text-xs">
                <span className="font-semibold text-slate-500">IVA ({etiquetaCortaTarifaIva(tarifaIva)})</span>
                <span className="font-bold text-slate-800">{montoOGuion(lineaIva ? lineaIva.iva_cop : null)}</span>
              </div>
              <div className="flex justify-between items-center p-3.5 bg-purple-100 rounded-xl text-xs">
                <span className="font-bold text-purple-800">Total con IVA</span>
                <span className="font-black text-purple-900 text-sm">{montoOGuion(totalConIva)}</span>
              </div>
              {ivaRapido.error && <p role="alert" className="text-xs font-bold text-red-600">{ivaRapido.error}</p>}
            </div>

            {/* 60/40 Split */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl">
                <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider block">Anticipo (60%)</span>
                <h4 className="text-lg font-black text-blue-900 mt-0.5">{montoOGuion(anticipo60)}</h4>
                <p className="text-[10px] text-blue-600 mt-1">Para realizar la compra</p>
              </div>

              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl">
                <span className="text-[10px] font-black text-rose-700 uppercase tracking-wider block">Saldo Contra Entrega (40%)</span>
                <h4 className="text-lg font-black text-rose-900 mt-0.5">{montoOGuion(saldo40)}</h4>
                <p className="text-[10px] text-rose-600 mt-1">Al llegar a Barranquilla</p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 text-center">
            Motor Financiero Nebulae · Fórmulas validadas para pedidos por encargo.
          </div>
        </div>
      </div>
    </div>
  );
}
