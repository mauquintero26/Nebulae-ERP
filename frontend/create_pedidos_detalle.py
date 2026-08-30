import os

path = 'src/app/dashboard/compras/pedidos/[id]/page.tsx'

content = """"use client";

import { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, Save, Send, Paperclip, MessageSquare, 
  MapPin, Clock, CheckCircle2, Circle, 
  Box, Search, Truck, AlertTriangle, PackageCheck, FileText, Link as LinkIcon
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

export default function PedidoCompraDetallePage() {
  const params = useParams();
  const isNew = params.id === 'nueva';
  
  // Status State
  const [pedidoStatus, setPedidoStatus] = useState(isNew ? 'Pedido Compra Creado' : 'Pedido pendiente por entrega');
  const [trackingStatus, setTrackingStatus] = useState(isNew ? 'Proveedor -> Casillero' : 'Casillero -> Aduana');
  const [eta] = useState('2026-08-30'); // Simulated ETA
  
  const [timeline, setTimeline] = useState([
    { id: 1, type: 'success', title: 'Pedido Compra Creado', desc: 'Generado. Timer logístico activado (15 días ETA).', date: '26 Ago 2026, 08:00 AM', user: 'Sistema', icon: FileText, color: 'text-emerald-500 bg-emerald-50' },
    { id: 2, type: 'tracking', title: 'Tracking: Proveedor -> Casillero', desc: 'Mercancía enviada por el proveedor vía FedEx.', date: '26 Ago 2026, 11:30 AM', user: 'Sistema', icon: Truck, color: 'text-blue-500 bg-blue-50' },
  ]);

  // Resizable Right Pane Logic
  const [rightWidth, setRightWidth] = useState(450);
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
    const newWidth = Math.min(Math.max(350, startWidth.current + delta), 800);
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

  const [recepcionGenerada, setRecepcionGenerada] = useState(false);

  const avanzarTracking = () => {
    if (trackingStatus === 'Proveedor -> Casillero') {
      setTrackingStatus('Casillero -> Aduana');
      setPedidoStatus('Pedido pendiente por entrega');
      setTimeline([...timeline, { id: Date.now(), type: 'tracking', title: 'Tracking: Casillero -> Aduana', desc: 'La mercancía ha llegado al PO Box y está en tránsito aduanero. Timer activado.', date: 'Ahora', user: 'Sistema', icon: Truck, color: 'text-indigo-500 bg-indigo-50' }]);
    } else if (trackingStatus === 'Casillero -> Aduana') {
      setTrackingStatus('Aduana -> Bodega');
      setTimeline([...timeline, { id: Date.now(), type: 'tracking', title: 'Tracking: Aduana -> Bodega', desc: 'Mercancía liberada por aduana. En ruta a bodega Nebulae. Timer activado.', date: 'Ahora', user: 'Sistema', icon: Truck, color: 'text-purple-500 bg-purple-50' }]);
    } else if (trackingStatus === 'Aduana -> Bodega') {
      setTrackingStatus('Completado');
      setPedidoStatus('Entregado en bodega');
      setRecepcionGenerada(true);
      setTimeline([...timeline, { id: Date.now(), type: 'success', title: 'Recepción Creada (ENINV-0001)', desc: 'Mercancía entregada en bodega. El equipo de inventario debe validar las cantidades.', date: 'Ahora', user: 'Sistema', icon: PackageCheck, color: 'text-emerald-500 bg-emerald-50' }]);
    }
  };

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
      
      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/compras/pedidos" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-800">
                {isNew ? 'Nuevo Pedido de Compra' : String(params.id).toUpperCase()}
              </h1>
              {!isNew && (
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  pedidoStatus === 'Entregado en bodega' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'
                }`}>
                  {pedidoStatus}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-xl font-bold text-sm transition-colors shadow-sm">
            <Save size={16} /> Guardar Cambios
          </button>
        </div>
      </div>

      {/* Main Content Layout (Split Pane) */}
      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* BLOQUE 1: Información del Pedido de Compra */}
        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-white relative">
          
          {recepcionGenerada && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-8 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 max-w-6xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm"><PackageCheck size={20}/></div>
                <div>
                  <h3 className="font-black text-emerald-900">Mercancía Entregada. Recepción ENINV-0001 Generada.</h3>
                  <p className="text-sm text-emerald-700">El departamento de inventario debe realizar el conteo ciego de la recepción.</p>
                </div>
              </div>
              <button className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-emerald-700 transition-colors">
                Ver Recepción (Inventario)
              </button>
            </div>
          )}

          <div className="max-w-6xl mx-auto space-y-10">
            
            {/* Cabecera del Pedido */}
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                <FileText className="text-emerald-600" size={24} /> Información de Compra
              </h2>
              
              <div className="grid grid-cols-4 gap-6 bg-slate-50 border border-slate-200 rounded-2xl p-6">
                
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Proveedor</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input type="text" defaultValue={isNew ? '' : 'Global Tech Suppliers Ltd.'} className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-bold text-slate-800 focus:border-emerald-500 outline-none" />
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Ref. Proveedor (Factura/Quote)</label>
                  <input type="text" defaultValue="INV-992384" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:border-emerald-500 outline-none" />
                </div>

                <div className="col-span-4">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Dirección Proveedor / Origen</label>
                  <div className="flex items-center gap-3">
                    <input type="text" defaultValue="123 Industrial Park, Shenzhen, China" className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:border-emerald-500 outline-none" />
                    <input type="text" defaultValue="+86 123 4567" placeholder="Teléfono/Número" className="w-48 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:border-emerald-500 outline-none" />
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Fecha de Compra</label>
                  <input type="date" defaultValue="2026-08-20" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:border-emerald-500 outline-none" />
                </div>

                <div className="col-span-2 relative">
                  <label className="block text-xs font-bold text-rose-500 mb-2 uppercase tracking-wider flex items-center gap-1">
                    <Clock size={14} /> Fecha Estimada de Entrega (ETA)
                  </label>
                  <input type="date" defaultValue={eta} className="w-full bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 text-sm font-bold text-rose-700 focus:border-rose-500 outline-none" />
                  <span className="absolute right-3 top-[38px] text-[10px] font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded">Activa Timers</span>
                </div>

              </div>
            </div>

            {/* Bloque Logístico (Rutas y Tracking) */}
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                <Truck className="text-blue-600" size={24} /> Logística y Tracking
              </h2>
              
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                
                <div className="grid grid-cols-3 gap-6 mb-8">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider flex items-center gap-1">
                      <MapPin size={14} /> Ubicación de Entrega Final
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input type="text" defaultValue="Bodega Principal (Nebulae)" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-bold text-slate-800 focus:border-blue-500 outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Carrier / Transportadora</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input type="text" defaultValue="FedEx International" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-bold text-slate-800 focus:border-blue-500 outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">N° Tracking (Guía)</label>
                    <div className="flex items-center gap-2">
                      <input type="text" defaultValue="FX-9982312001" className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black text-slate-800 focus:border-blue-500 outline-none uppercase" />
                      <button className="bg-slate-100 p-2.5 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Rastrear en web del carrier">
                        <LinkIcon size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tracker de Estados Logísticos */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-sm font-bold text-slate-700">Progreso de la Importación/Ruta</span>
                    {!recepcionGenerada && (
                      <button onClick={avanzarTracking} className="text-xs font-bold bg-blue-600 text-white px-3 py-1.5 rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                        Simular Avance Logístico
                      </button>
                    )}
                  </div>
                  
                  <div className="flex justify-between relative max-w-3xl mx-auto mt-2">
                    <div className="absolute top-1/2 left-4 right-4 h-1 bg-slate-200 -translate-y-1/2 z-0" />
                    
                    {/* Progress Fill */}
                    <div className={`absolute top-1/2 left-4 h-1 bg-blue-500 -translate-y-1/2 z-0 transition-all duration-700 ${
                      trackingStatus === 'Completado' ? 'right-4' :
                      trackingStatus === 'Aduana -> Bodega' ? 'right-[20%]' :
                      trackingStatus === 'Casillero -> Aduana' ? 'right-[50%]' :
                      'right-[80%]'
                    }`} />
                    
                    <div className="relative z-10 flex flex-col items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-200"><CheckCircle2 size={12} /></div>
                      <span className="text-xs font-bold text-slate-800">Proveedor</span>
                    </div>
                    
                    <div className="relative z-10 flex flex-col items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold transition-colors ${
                        trackingStatus !== 'Proveedor -> Casillero' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white border-2 border-slate-300 text-slate-300'
                      }`}>
                        {trackingStatus !== 'Proveedor -> Casillero' ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                      </div>
                      <span className={`text-xs font-bold ${trackingStatus !== 'Proveedor -> Casillero' ? 'text-blue-700' : 'text-slate-400'}`}>Casillero</span>
                    </div>

                    <div className="relative z-10 flex flex-col items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold transition-colors ${
                        trackingStatus === 'Aduana -> Bodega' || trackingStatus === 'Completado' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white border-2 border-slate-300 text-slate-300'
                      }`}>
                        {trackingStatus === 'Aduana -> Bodega' || trackingStatus === 'Completado' ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                      </div>
                      <span className={`text-xs font-bold ${trackingStatus === 'Aduana -> Bodega' || trackingStatus === 'Completado' ? 'text-blue-700' : 'text-slate-400'}`}>Aduana</span>
                    </div>

                    <div className="relative z-10 flex flex-col items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold transition-colors ${
                        trackingStatus === 'Completado' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' : 'bg-white border-2 border-slate-300 text-slate-300'
                      }`}>
                        {trackingStatus === 'Completado' ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                      </div>
                      <span className={`text-xs font-bold ${trackingStatus === 'Completado' ? 'text-emerald-700' : 'text-slate-400'}`}>Bodega (Entregado)</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* ARTÍCULOS */}
            <div>
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-6">
                <Box className="text-emerald-600" size={24} /> Productos Requeridos
              </h3>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm">
                <table className="w-full text-left whitespace-nowrap min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Nombre / Atributos</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Categoría</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">Cant.</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Precio Unit.</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Estado Interno</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Total Neto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800 text-sm">Laptop Dell Latitude 5420</div>
                        <div className="text-slate-500 text-xs">16GB RAM, 512GB SSD</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 font-medium">Equipos IT</td>
                      <td className="px-4 py-3 text-center font-bold text-slate-700">10</td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right font-medium">$850.00</td>
                      <td className="px-4 py-3">
                        <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded text-[10px] font-bold uppercase">Transito Exterior</span>
                      </td>
                      <td className="px-4 py-3 font-black text-slate-800 text-right">$8,500.00</td>
                    </tr>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800 text-sm">Monitor Dell 24"</div>
                        <div className="text-slate-500 text-xs">1080p, 60Hz</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 font-medium">Periféricos</td>
                      <td className="px-4 py-3 text-center font-bold text-slate-700">15</td>
                      <td className="px-4 py-3 text-sm text-slate-700 text-right font-medium">$120.00</td>
                      <td className="px-4 py-3">
                        <span className="bg-amber-100 text-amber-700 border border-amber-200 px-2 py-1 rounded text-[10px] font-bold uppercase">Transito Exterior</span>
                      </td>
                      <td className="px-4 py-3 font-black text-slate-800 text-right">$1,800.00</td>
                    </tr>
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-right font-bold text-slate-500 uppercase text-xs">Gran Total del Pedido</td>
                      <td className="px-4 py-4 text-right font-black text-emerald-600 text-xl">$10,300.00</td>
                    </tr>
                  </tfoot>
                </table>
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

        {/* BLOQUE 2: Actividades y Bitácora (Historial) */}
        <div style={{ width: rightWidth }} className="bg-white flex flex-col overflow-hidden shrink-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">
          
          <div className="p-5 border-b border-slate-200 bg-slate-800 flex items-center justify-between shadow-sm z-10 shrink-0">
            <h3 className="font-black text-white flex items-center gap-2 text-lg">
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
                placeholder="Registra una incidencia de transporte o aduana..." 
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none transition-colors shadow-sm"
              />
              <button className="absolute bottom-3 right-3 bg-slate-800 hover:bg-slate-900 text-white p-2 rounded-lg shadow-sm transition-colors">
                <Send size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Línea Temporal</h4>
            
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {timeline.map((item) => (
                <div key={item.id} className="relative flex items-start gap-4 group animate-in fade-in slide-in-from-bottom-2">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-white shadow-sm shrink-0 z-10 ${item.color}`}>
                    <item.icon size={14} />
                  </div>
                  
                  <div className="flex-1 bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
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

print("Detalle de Pedido Compra page created successfully")
