import os

path = 'src/app/dashboard/ventas/cotizacion/[id]/page.tsx'

content = """"use client";

import { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, Save, Send, Paperclip, MessageSquare, 
  Mail, Phone, FileText, CheckCircle2, Circle, 
  Image as ImageIcon, Box, Plus, Search, DollarSign,
  Calculator, Percent, Trash2
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

export default function CotizacionDetallePage() {
  const params = useParams();
  const isNew = params.id === 'nueva';
  
  // Status and Timeline State
  const [currentStatus, setCurrentStatus] = useState('Pendiente por Cotizar');
  const [timeline, setTimeline] = useState([
    { id: 1, type: 'status', title: 'Cotización Borrador Creada', date: '26 Ago 2026, 09:35 AM', user: 'Sistema', icon: FileText, color: 'text-purple-500 bg-purple-50' },
    { id: 2, type: 'origin', title: 'Derivada de Solicitud SC-0021', desc: 'Productos y cantidades importados automáticamente desde la solicitud del cliente.', date: '26 Ago 2026, 09:35 AM', user: 'Sistema', icon: Box, color: 'text-blue-500 bg-blue-50' },
  ]);

  const [ventaGenerada, setVentaGenerada] = useState(false);

  // Line items state
  const [items, setItems] = useState([
    { id: 1, name: 'Laptop Dell Latitude 5420', variant: '16GB RAM, 512GB SSD', qty: 2, price: 0, discount: 0 },
    { id: 2, name: 'Monitor Dell 24"', variant: '1080p, 60Hz', qty: 2, price: 0, discount: 0 }
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

  const updateItemPrice = (id: number, price: number) => {
    setItems(items.map(i => i.id === id ? { ...i, price } : i));
  };
  
  const updateItemDiscount = (id: number, discount: number) => {
    setItems(items.map(i => i.id === id ? { ...i, discount } : i));
  };

  const addItem = () => {
    setItems([...items, { id: Date.now(), name: '', variant: '', qty: 1, price: 0, discount: 0 }]);
  };

  const removeItem = (id: number) => {
    setItems(items.filter(i => i.id !== id));
  };

  // Calculations
  const subtotal = items.reduce((acc, item) => acc + (item.price * item.qty * (1 - item.discount / 100)), 0);
  const taxes = subtotal * 0.19; // 19% IVA (example)
  const total = subtotal + taxes;

  const handleEnviarCotizacion = () => {
    setCurrentStatus('Cotizado - Pendiente Conf.');
    setTimeline([...timeline, {
      id: Date.now(), type: 'email', title: 'Cotización Enviada al Cliente', 
      desc: 'Se envió el PDF con los valores finales al correo del cliente.', 
      date: 'Ahora mismo', user: 'Ana Gómez', icon: Mail, color: 'text-amber-500 bg-amber-50'
    }]);
  };

  const handleConfirmarVenta = () => {
    setCurrentStatus('Confirmada');
    setVentaGenerada(true);
    setTimeline([...timeline, {
      id: Date.now() + 1, type: 'success', title: 'Venta Creada (VEN-0105)', 
      desc: 'El cliente aceptó la cotización. Se ha generado la orden de venta.', 
      date: 'Ahora mismo', user: 'Sistema', icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-50'
    }]);
  };

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
      
      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/ventas/cotizacion" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-800">
                {isNew ? 'Nueva Cotización' : String(params.id).toUpperCase()}
              </h1>
              {!isNew && (
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  currentStatus === 'Confirmada' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 
                  currentStatus === 'Cotizado - Pendiente Conf.' ? 'bg-amber-100 text-amber-700 border-amber-200' : 
                  'bg-slate-100 text-slate-700 border-slate-200'
                }`}>
                  {currentStatus}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {currentStatus === 'Pendiente por Cotizar' && (
            <>
              <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-xl font-bold text-sm transition-colors shadow-sm">
                <Save size={16} /> Guardar
              </button>
              <button onClick={handleEnviarCotizacion} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors shadow-sm">
                <Send size={16} /> Enviar al Cliente
              </button>
            </>
          )}
          {currentStatus === 'Cotizado - Pendiente Conf.' && (
            <button onClick={handleConfirmarVenta} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors shadow-sm">
              <CheckCircle2 size={16} /> Cliente Aceptó (Generar Venta)
            </button>
          )}
        </div>
      </div>

      {/* Main Content Layout (Split Pane) */}
      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* BLOQUE 1: Información de la Cotización (Formulario sin límites) */}
        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-white relative">
          
          {ventaGenerada && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-8 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm"><CheckCircle2 size={20}/></div>
                <div>
                  <h3 className="font-black text-emerald-900">¡Venta VEN-0105 Creada Exitosamente!</h3>
                  <p className="text-sm text-emerald-700">La cotización fue aprobada y ya pasó a operaciones/logística.</p>
                </div>
              </div>
              <Link href="/dashboard/ventas/venta" className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-emerald-700 transition-colors">
                Ir al Hub de Ventas
              </Link>
            </div>
          )}

          {/* Status Tracker */}
          {!isNew && (
            <div className="bg-white p-6 border-b border-slate-100 mb-8 flex justify-between relative">
              <div className="absolute top-1/2 left-10 right-10 h-1 bg-slate-100 -translate-y-1/2 z-0" />
              
              <div className={`absolute top-1/2 left-10 h-1 transition-all duration-500 z-0 ${
                currentStatus === 'Confirmada' ? 'bg-emerald-500 right-10' :
                currentStatus === 'Cotizado - Pendiente Conf.' ? 'bg-blue-500 right-1/2' :
                'bg-slate-300 right-[80%]'
              }`} />
              
              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className={`w-8 h-8 rounded-full text-white flex items-center justify-center font-bold shadow-md ${
                  currentStatus === 'Confirmada' || currentStatus === 'Cotizado - Pendiente Conf.' ? 'bg-blue-600 shadow-blue-200' : 'bg-slate-800 shadow-slate-200'
                }`}><CheckCircle2 size={16} /></div>
                <span className="text-xs font-bold text-slate-800">Borrador (Valorizando)</span>
              </div>
              
              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-colors ${
                  currentStatus === 'Confirmada' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' :
                  currentStatus === 'Cotizado - Pendiente Conf.' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 
                  'bg-white border-2 border-slate-200 text-slate-300'
                }`}>
                  {currentStatus === 'Confirmada' ? <CheckCircle2 size={16} /> : <Circle size={16} fill={currentStatus === 'Cotizado - Pendiente Conf.' ? 'currentColor' : 'transparent'} />}
                </div>
                <span className={`text-xs font-bold ${
                  currentStatus === 'Confirmada' ? 'text-emerald-700' :
                  currentStatus === 'Cotizado - Pendiente Conf.' ? 'text-blue-700' : 'text-slate-400'
                }`}>Cotizado al Cliente</span>
              </div>

              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-colors ${
                  currentStatus === 'Confirmada' ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' : 'bg-white border-2 border-slate-200 text-slate-300'
                }`}>
                  {currentStatus === 'Confirmada' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                </div>
                <span className={`text-xs font-bold ${currentStatus === 'Confirmada' ? 'text-emerald-700' : 'text-slate-400'}`}>Confirmado (Venta)</span>
              </div>
            </div>
          )}

          {/* Área de Formulario Abierta */}
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-2">
              <FileText className="text-blue-600" size={24} /> Datos de la Cotización
            </h2>

            <div className="grid grid-cols-3 gap-6 mb-10">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Cliente</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800">
                  Empresa XYZ
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Origen</label>
                <Link href="/dashboard/ventas/solicitud/sc-0021" className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-3 text-sm font-bold hover:bg-blue-100 transition-colors">
                  <Search size={16} /> SC-0021
                </Link>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Validez hasta</label>
                <input type="date" defaultValue="2026-09-10" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-blue-500 outline-none text-slate-700" />
              </div>
            </div>

            {/* ARTÍCULOS Y PRECIOS */}
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Calculator className="text-blue-600" size={20} /> Valorización de Artículos
                </h3>
                <button onClick={addItem} className="text-blue-600 text-sm font-bold hover:text-blue-800 transition-colors flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-lg">
                  <Plus size={16} /> Agregar línea
                </button>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Producto / Descripción</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-24 text-center">Cant.</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-36">Precio Unit.</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-28">Desc %</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-36 text-right">Subtotal</th>
                      <th className="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <input type="text" value={item.name} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, name: e.target.value} : i))} className="w-full bg-transparent font-bold text-slate-800 text-sm focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-2 py-1" placeholder="Nombre del producto..." />
                          <input type="text" value={item.variant} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, variant: e.target.value} : i))} className="w-full bg-transparent text-slate-500 text-xs focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 mt-1" placeholder="Variantes o notas..." />
                        </td>
                        <td className="px-4 py-3">
                          <input type="number" min="1" value={item.qty} onChange={(e) => setItems(items.map(i => i.id === item.id ? {...i, qty: Number(e.target.value)} : i))} className="w-full bg-white border border-slate-200 rounded px-2 py-1.5 text-sm font-bold text-center focus:border-blue-500 outline-none" />
                        </td>
                        <td className="px-4 py-3 relative">
                          <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                          <input type="number" value={item.price || ''} onChange={(e) => updateItemPrice(item.id, Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded pl-6 pr-2 py-1.5 text-sm font-bold focus:border-blue-500 outline-none" placeholder="0.00" />
                        </td>
                        <td className="px-4 py-3 relative">
                          <input type="number" max="100" value={item.discount || ''} onChange={(e) => updateItemDiscount(item.id, Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded pr-6 pl-2 py-1.5 text-sm font-bold focus:border-blue-500 outline-none" placeholder="0" />
                          <Percent size={14} className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400" />
                        </td>
                        <td className="px-4 py-3 font-black text-slate-800 text-right">
                          ${((item.price * item.qty) * (1 - item.discount / 100)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => removeItem(item.id)} className="text-slate-400 hover:text-rose-500 transition-colors p-1">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* TOTAles */}
              <div className="flex justify-end mt-6">
                <div className="w-72 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-bold text-slate-500">Subtotal</span>
                    <span className="font-bold text-slate-800">${subtotal.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-bold text-slate-500">IVA (19%)</span>
                    <span className="font-bold text-slate-800">${taxes.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                  <div className="h-px w-full bg-slate-200 mb-4" />
                  <div className="flex justify-between items-center">
                    <span className="text-base font-black text-slate-800">TOTAL</span>
                    <span className="text-xl font-black text-blue-600">${total.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Resizer Handle */}
        <div 
          onMouseDown={handleMouseDown}
          className="w-1.5 bg-slate-200 hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors z-30"
          title="Arrastrar para ajustar panel de actividades"
        />

        {/* BLOQUE 2: Actividades y Bitácora (Chatter) */}
        <div style={{ width: rightWidth }} className="bg-white flex flex-col overflow-hidden shrink-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">
          
          <div className="p-5 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10 shrink-0">
            <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg">
              <MessageSquare className="text-slate-400" size={20} /> Actividades
            </h3>
          </div>

          {/* Activity Input Area */}
          <div className="p-5 border-b border-slate-200 bg-slate-50 z-10 shrink-0">
            <div className="flex gap-2 mb-4">
              <button className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm">
                <MessageSquare size={16} /> Nota
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm">
                <Mail size={16} /> Correo
              </button>
            </div>
            
            <div className="relative">
              <textarea 
                rows={3} 
                placeholder="Escribe un mensaje o registra una nota interna..." 
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none transition-colors shadow-sm"
              />
              <div className="absolute bottom-3 left-3 flex gap-2">
                <button className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"><Paperclip size={18} /></button>
              </div>
              <button className="absolute bottom-3 right-3 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg shadow-sm transition-colors">
                <Send size={16} />
              </button>
            </div>
          </div>

          {/* Timeline / Bitácora */}
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
                      <span className="text-[10px] font-bold text-slate-400">{item.date}</span>
                    </div>
                    {item.desc && <p className="text-sm text-slate-600 mb-3 leading-relaxed">{item.desc}</p>}
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-600 border border-slate-300">
                        {item.user.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className="text-xs font-medium text-slate-500">{item.user}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="text-center mt-8">
              <span className="text-xs font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
                Fin del historial
              </span>
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

print("Detalle de Cotizacion page created successfully")
