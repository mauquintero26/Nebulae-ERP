import os

path = 'src/app/dashboard/ventas/venta/[id]/page.tsx'

content = """"use client";

import { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, Save, Send, Paperclip, MessageSquare, 
  Mail, FileText, CheckCircle2, Circle, 
  Box, Search, Truck, DollarSign, Wallet, FileDigit, ShieldCheck
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function PedidoVentaDetallePage() {
  const params = useParams();
  
  // Status and Timeline State
  const [currentStatus, setCurrentStatus] = useState('Pendiente de Pago');
  const [logisticsStatus, setLogisticsStatus] = useState('Por Despachar');
  const [pagoRegistrado, setPagoRegistrado] = useState(false);
  const [facturaEmitida, setFacturaEmitida] = useState(false);
  const [despachado, setDespachado] = useState(false);

  const [timeline, setTimeline] = useState([
    { id: 1, type: 'success', title: 'Pedido de Venta Creado', desc: 'Generado automáticamente al confirmarse la cotización COT-0005.', date: '26 Ago 2026, 10:00 AM', user: 'Sistema', icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-50' },
  ]);

  // Resizable Right Pane Logic
  const [rightWidth, setRightWidth] = useState(400);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = rightWidth;
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const delta = startX.current - e.clientX; 
    const newWidth = Math.min(Math.max(300, startWidth.current + delta), 800);
    setRightWidth(newWidth);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleRegistrarPago = () => {
    setPagoRegistrado(true);
    setCurrentStatus('Pagado');
    setTimeline([...timeline, {
      id: Date.now(), type: 'money', title: 'Pago Registrado ($6,000.00)', 
      desc: 'El pago por transferencia bancaria ha sido conciliado en finanzas.', 
      date: 'Ahora mismo', user: 'Laura (Finanzas)', icon: Wallet, color: 'text-emerald-600 bg-emerald-100'
    }]);
  };

  const handleEmitirFactura = () => {
    setFacturaEmitida(true);
    setTimeline([...timeline, {
      id: Date.now() + 1, type: 'invoice', title: 'Factura Electrónica Emitida', 
      desc: 'Factura F-2026-990 enviada al cliente y a la autoridad tributaria.', 
      date: 'Ahora mismo', user: 'Sistema ERP', icon: FileDigit, color: 'text-blue-500 bg-blue-50'
    }]);
  };

  const handleDespachar = () => {
    setDespachado(true);
    setLogisticsStatus('Entregado');
    setTimeline([...timeline, {
      id: Date.now() + 2, type: 'logistics', title: 'Pedido Despachado y Entregado', 
      desc: 'Guía de remisión generada y mercancía entregada por logística.', 
      date: 'Ahora mismo', user: 'Carlos (Bodega)', icon: Truck, color: 'text-indigo-500 bg-indigo-50'
    }]);
  };

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
      
      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/ventas/venta" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-800">
                {String(params.id).toUpperCase()}
              </h1>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                currentStatus === 'Pagado' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'
              }`}>
                Financiero: {currentStatus}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                logisticsStatus === 'Entregado' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}>
                Logística: {logisticsStatus}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-xl font-bold text-sm transition-colors shadow-sm">
            <Save size={16} /> Modificar Pedido
          </button>
        </div>
      </div>

      {/* Main Content Layout (Split Pane) */}
      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* BLOQUE 1: Información del Pedido */}
        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-white relative">

          {/* Status Tracker Financiero y Logístico combinados */}
          <div className="bg-white p-6 border-b border-slate-100 mb-8 flex justify-between relative max-w-4xl mx-auto">
            <div className="absolute top-1/2 left-10 right-10 h-1 bg-slate-100 -translate-y-1/2 z-0" />
            
            <div className={`absolute top-1/2 left-10 h-1 transition-all duration-500 z-0 ${
              despachado ? 'bg-emerald-500 right-10' :
              pagoRegistrado ? 'bg-emerald-500 right-1/2' :
              'bg-emerald-500 right-[80%]'
            }`} />
            
            <div className="relative z-10 flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-200"><CheckCircle2 size={16} /></div>
              <span className="text-xs font-bold text-slate-800">Pedido Generado</span>
            </div>
            
            <div className="relative z-10 flex flex-col items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-colors ${
                pagoRegistrado ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' : 'bg-white border-2 border-slate-200 text-slate-300'
              }`}>
                {pagoRegistrado ? <CheckCircle2 size={16} /> : <Circle size={16} />}
              </div>
              <span className={`text-xs font-bold ${pagoRegistrado ? 'text-emerald-700' : 'text-slate-400'}`}>Pago Recibido</span>
            </div>

            <div className="relative z-10 flex flex-col items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-colors ${
                despachado ? 'bg-indigo-500 text-white shadow-md shadow-indigo-200' : 'bg-white border-2 border-slate-200 text-slate-300'
              }`}>
                {despachado ? <CheckCircle2 size={16} /> : <Circle size={16} />}
              </div>
              <span className={`text-xs font-bold ${despachado ? 'text-indigo-700' : 'text-slate-400'}`}>Mercancía Entregada</span>
            </div>
          </div>

          <div className="max-w-4xl mx-auto space-y-10">
            
            {/* Cabecera del Pedido */}
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                <FileText className="text-emerald-600" size={24} /> Resumen del Pedido
              </h2>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Cliente</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800">
                    Empresa XYZ
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Origen</label>
                  <Link href="/dashboard/ventas/cotizacion/cot-0005" className="flex items-center gap-2 bg-purple-50 border border-purple-200 text-purple-700 rounded-xl px-4 py-3 text-sm font-bold hover:bg-purple-100 transition-colors">
                    <Search size={16} /> COT-0005
                  </Link>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Fecha de Venta</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800">
                    26 Ago 2026
                  </div>
                </div>
              </div>
            </div>

            {/* ARTÍCULOS (Solo Lectura) */}
            <div>
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-4">
                <Box className="text-emerald-600" size={20} /> Artículos Facturados
              </h3>
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Producto</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">Cant.</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800 text-sm">Laptop Dell Latitude 5420</div>
                        <div className="text-slate-500 text-xs">16GB RAM, 512GB SSD</div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-slate-700">2</td>
                      <td className="px-4 py-3 font-black text-slate-800 text-right">$4,500.00</td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800 text-sm">Monitor Dell 24"</div>
                        <div className="text-slate-500 text-xs">1080p, 60Hz</div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-slate-700">2</td>
                      <td className="px-4 py-3 font-black text-slate-800 text-right">$1,500.00</td>
                    </tr>
                  </tbody>
                  <tfoot className="bg-slate-50">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-right font-bold text-slate-500 uppercase text-xs">Total Pedido</td>
                      <td className="px-4 py-3 text-right font-black text-emerald-600 text-lg">$6,000.00</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Controles de Ejecución de Venta */}
            <div className="grid grid-cols-2 gap-6">
              
              {/* Finanzas */}
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-6">
                <h3 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
                  <Wallet className="text-emerald-600" size={20} /> Finanzas y Facturación
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-bold text-slate-500">Monto Facturado</span>
                    <span className="font-black text-slate-800">$6,000.00</span>
                  </div>
                  <div className="flex justify-between items-center text-sm pb-3 border-b border-emerald-100">
                    <span className="font-bold text-slate-500">Pagado</span>
                    <span className={`font-black ${pagoRegistrado ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {pagoRegistrado ? '$6,000.00' : '$0.00'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-1">
                    <span className="font-black text-slate-800">Saldo Pendiente</span>
                    <span className={`font-black ${pagoRegistrado ? 'text-slate-400' : 'text-rose-600'}`}>
                      {pagoRegistrado ? '$0.00' : '$6,000.00'}
                    </span>
                  </div>
                  
                  <div className="pt-4 flex gap-2">
                    {!pagoRegistrado ? (
                      <button onClick={handleRegistrarPago} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-2">
                        <DollarSign size={16} /> Registrar Pago
                      </button>
                    ) : !facturaEmitida ? (
                      <button onClick={handleEmitirFactura} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-2">
                        <FileDigit size={16} /> Emitir Factura Electrónica
                      </button>
                    ) : (
                      <div className="flex-1 bg-emerald-100 text-emerald-700 border border-emerald-200 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                        <ShieldCheck size={16} /> Factura F-2026-990 Emitida
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Logística */}
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-6">
                <h3 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
                  <Truck className="text-indigo-600" size={20} /> Logística y Despacho
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Bodega de Origen</label>
                    <select className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none" disabled={despachado}>
                      <option>Bodega Principal - Centro</option>
                      <option>Bodega Norte</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Responsable de Entrega</label>
                    <select className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none" disabled={despachado}>
                      <option>Flota Interna (Camión 1)</option>
                      <option>FedEx Courier</option>
                    </select>
                  </div>
                  
                  <div className="pt-2">
                    {!despachado ? (
                      <button 
                        onClick={handleDespachar} 
                        disabled={!pagoRegistrado}
                        className={`w-full py-2 rounded-lg text-sm font-bold shadow-sm transition-colors flex items-center justify-center gap-2 ${
                          pagoRegistrado ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        <Truck size={16} /> Generar Guía y Despachar
                      </button>
                    ) : (
                      <div className="w-full bg-indigo-100 text-indigo-700 border border-indigo-200 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                        <CheckCircle2 size={16} /> Despachado y Entregado
                      </div>
                    )}
                    {!pagoRegistrado && <p className="text-xs text-rose-500 font-bold mt-2 text-center">Requiere registrar pago antes de despachar</p>}
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>

        {/* Resizer Handle */}
        <div 
          onMouseDown={handleMouseDown}
          className="w-1.5 bg-slate-200 hover:bg-emerald-500 cursor-col-resize shrink-0 transition-colors z-30"
          title="Arrastrar para ajustar panel de actividades"
        />

        {/* BLOQUE 2: Actividades y Bitácora */}
        <div style={{ width: rightWidth }} className="bg-white flex flex-col overflow-hidden shrink-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">
          
          <div className="p-5 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10 shrink-0">
            <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg">
              <MessageSquare className="text-slate-400" size={20} /> Actividades del Pedido
            </h3>
          </div>

          <div className="p-5 border-b border-slate-200 bg-slate-50 z-10 shrink-0">
            <div className="flex gap-2 mb-4">
              <button className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm">
                <MessageSquare size={16} /> Nota
              </button>
            </div>
            <div className="relative">
              <textarea 
                rows={3} 
                placeholder="Registra una novedad logística o financiera..." 
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none transition-colors shadow-sm"
              />
              <button className="absolute bottom-3 right-3 bg-slate-800 hover:bg-slate-900 text-white p-2 rounded-lg shadow-sm transition-colors">
                <Send size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Línea Temporal</h4>
            
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {timeline.map((item) => (
                <div key={item.id} className="relative flex items-start gap-4 group animate-in fade-in slide-in-from-bottom-2">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-white shadow-sm shrink-0 z-10 ${item.color}`}>
                    <item.icon size={14} />
                  </div>
                  
                  <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-800 text-sm">{item.title}</span>
                    </div>
                    {item.desc && <p className="text-sm text-slate-600 mb-3 leading-relaxed">{item.desc}</p>}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-600 border border-slate-300">
                          {item.user.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="text-xs font-medium text-slate-500">{item.user}</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">{item.date}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
"""

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Detalle de Pedido Venta page created successfully")
