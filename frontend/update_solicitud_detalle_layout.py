import re

path = 'src/app/dashboard/ventas/solicitud/[id]/page.tsx'

content = """"use client";

import { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, Save, Send, Paperclip, MessageSquare, 
  Mail, Phone, FileText, CheckCircle2, Circle, 
  Image as ImageIcon, HelpCircle, Package, Archive, Box
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function SolicitudDetallePage() {
  const params = useParams();
  const isNew = params.id === 'nueva';
  
  // State for conditional rendering
  const [tipoSolicitud, setTipoSolicitud] = useState('cotizacion');
  
  // Resizable Right Pane Logic
  const [rightWidth, setRightWidth] = useState(400); // px
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
    const delta = startX.current - e.clientX; // Moving mouse left increases right width
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

  // Mock Timeline Data
  const timeline = [
    { id: 1, type: 'status', title: 'Solicitud Creada', date: '26 Ago 2026, 09:30 AM', user: 'Ana Gómez', icon: FileText, color: 'text-blue-500 bg-blue-50' },
    { id: 2, type: 'note', title: 'Nota Interna', desc: 'El cliente solicita validación urgente por parte de almacén.', date: '26 Ago 2026, 10:15 AM', user: 'Carlos Ruiz', icon: MessageSquare, color: 'text-amber-500 bg-amber-50' },
    { id: 3, type: 'email', title: 'Correo Enviado', desc: 'Acuse de recibo enviado al cliente automáticamente.', date: '26 Ago 2026, 10:16 AM', user: 'Sistema', icon: Mail, color: 'text-purple-500 bg-purple-50' },
  ];

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
      
      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/ventas/solicitud" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-800">
                {isNew ? 'Nueva Solicitud' : String(params.id).toUpperCase()}
              </h1>
              {!isNew && (
                <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">
                  En Proceso
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-xl font-bold text-sm transition-colors shadow-sm">
            <Save size={16} /> Guardar Borrador
          </button>
          <button className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm transition-colors shadow-sm">
            <CheckCircle2 size={16} /> Guardar y Confirmar
          </button>
        </div>
      </div>

      {/* Main Content Layout (Split Pane) */}
      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* BLOQUE 1: Información de la Solicitud (Formulario sin límites) */}
        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-white">
          
          {/* Status Tracker */}
          {!isNew && (
            <div className="bg-white p-6 border-b border-slate-100 mb-8 flex justify-between relative">
              <div className="absolute top-1/2 left-10 right-10 h-1 bg-slate-100 -translate-y-1/2 z-0" />
              <div className="absolute top-1/2 left-10 right-1/2 h-1 bg-purple-600 -translate-y-1/2 z-0" />
              
              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold shadow-md shadow-purple-200"><CheckCircle2 size={16} /></div>
                <span className="text-xs font-bold text-slate-800">Nuevo</span>
              </div>
              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold shadow-md shadow-purple-200"><Circle size={16} fill="currentColor" /></div>
                <span className="text-xs font-bold text-purple-700">En Proceso</span>
              </div>
              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white border-2 border-slate-200 text-slate-300 flex items-center justify-center font-bold"><Circle size={16} /></div>
                <span className="text-xs font-bold text-slate-400">Esperando Cliente</span>
              </div>
              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white border-2 border-slate-200 text-slate-300 flex items-center justify-center font-bold"><CheckCircle2 size={16} /></div>
                <span className="text-xs font-bold text-slate-400">Resuelto</span>
              </div>
            </div>
          )}

          {/* Área de Formulario Abierta (Sin Caja) */}
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-2">
              <FileText className="text-purple-600" size={24} /> Información Principal
            </h2>

            <div className="grid grid-cols-2 gap-8 mb-10">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Cliente</label>
                <input type="text" defaultValue={isNew ? '' : 'Empresa XYZ'} placeholder="Buscar cliente..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Fecha de Creación</label>
                <input type="date" defaultValue="2026-08-26" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all text-slate-700" />
              </div>
              
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-4 uppercase tracking-wider">Tipo de Solicitud</label>
                <div className="grid grid-cols-3 gap-4">
                  <button 
                    onClick={() => setTipoSolicitud('cotizacion')}
                    className={`flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all ${tipoSolicitud === 'cotizacion' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <Box size={28} />
                    <span className="text-sm font-bold">Por Cotización</span>
                  </button>
                  <button 
                    onClick={() => setTipoSolicitud('seguimiento')}
                    className={`flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all ${tipoSolicitud === 'seguimiento' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <HelpCircle size={28} />
                    <span className="text-sm font-bold">Por Seguimiento</span>
                  </button>
                  <button 
                    onClick={() => setTipoSolicitud('devolucion')}
                    className={`flex flex-col items-center justify-center gap-3 p-5 rounded-2xl border-2 transition-all ${tipoSolicitud === 'devolucion' ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <Archive size={28} />
                    <span className="text-sm font-bold">Por Devolución</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="h-px w-full bg-slate-200 mb-10" />

            {/* Condicionales por Tipo de Solicitud */}
            
            {tipoSolicitud === 'cotizacion' && (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                <h3 className="text-base font-black text-slate-800 mb-6 flex items-center gap-2">
                  <Box className="text-purple-600" size={20} /> Requerimientos de Cotización
                </h3>
                <div className="grid grid-cols-12 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                  <div className="col-span-5">
                    <label className="block text-xs font-bold text-slate-500 mb-2">Producto / Servicio</label>
                    <input type="text" placeholder="Ej. Laptops Dell Latitude..." className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-purple-500 outline-none" />
                  </div>
                  <div className="col-span-5">
                    <label className="block text-xs font-bold text-slate-500 mb-2">Atributos / Variantes</label>
                    <input type="text" placeholder="Ej. 16GB RAM, 512GB SSD" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-purple-500 outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-500 mb-2">Cantidad</label>
                    <input type="number" min="1" defaultValue="1" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:border-purple-500 outline-none text-center font-bold" />
                  </div>
                  <div className="col-span-12 mt-2">
                    <button className="text-purple-600 text-sm font-bold hover:text-purple-800 transition-colors flex items-center gap-2 bg-purple-50 px-4 py-2 rounded-lg w-fit">
                      <Plus size={16} /> Agregar otro producto
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tipoSolicitud === 'seguimiento' && (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                <h3 className="text-base font-black text-slate-800 mb-6 flex items-center gap-2">
                  <HelpCircle className="text-purple-600" size={20} /> Referencia de Seguimiento
                </h3>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 max-w-2xl">
                  <label className="block text-xs font-bold text-slate-500 mb-3">ID de la Solicitud, Cotización o Venta a seguir</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="Ej. COT-0045, VEN-0102..." className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-sm font-bold text-slate-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none uppercase" />
                  </div>
                  <p className="text-xs text-slate-500 mt-3 font-medium">El sistema enlazará automáticamente el historial del documento ingresado.</p>
                </div>
              </div>
            )}

            {tipoSolicitud === 'devolucion' && (
              <div className="animate-in fade-in slide-in-from-bottom-4">
                <h3 className="text-base font-black text-slate-800 mb-6 flex items-center gap-2">
                  <Archive className="text-purple-600" size={20} /> Expediente de Devolución
                </h3>
                
                <div className="space-y-6 bg-slate-50 p-6 rounded-2xl border border-slate-200">
                  <div className="max-w-md">
                    <label className="block text-xs font-bold text-slate-500 mb-2">ID de la Venta a devolver <span className="text-rose-500">*</span></label>
                    <input type="text" placeholder="Ej. VEN-0012" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-purple-500 outline-none uppercase" />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Descripción y Motivos de la Devolución <span className="text-rose-500">*</span></label>
                    <textarea rows={4} placeholder="Detalla aquí las razones expuestas por el cliente..." className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-purple-500 outline-none resize-none"></textarea>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2">Adjuntar Pruebas (Imágenes/Documentos)</label>
                    <div className="border-2 border-dashed border-slate-300 rounded-2xl bg-white p-8 flex flex-col items-center justify-center text-slate-500 hover:border-purple-400 hover:bg-purple-50 transition-colors cursor-pointer group">
                      <ImageIcon size={40} className="text-slate-300 group-hover:text-purple-500 mb-3 transition-colors" />
                      <p className="text-base font-bold text-slate-700 group-hover:text-purple-700">Haz clic o arrastra las fotos aquí</p>
                      <p className="text-sm mt-2 font-medium text-slate-400">Archivos PNG, JPG o PDF soportados (Máx. 10MB)</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Resizer Handle */}
        <div 
          onMouseDown={handleMouseDown}
          className="w-1.5 bg-slate-200 hover:bg-purple-500 cursor-col-resize shrink-0 transition-colors z-30"
          title="Arrastrar para ajustar panel de actividades"
        />

        {/* BLOQUE 2: Actividades y Bitácora (Chatter) */}
        <div style={{ width: rightWidth }} className="bg-white flex flex-col overflow-hidden shrink-0">
          
          <div className="p-5 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10 shrink-0">
            <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg">
              <MessageSquare className="text-slate-400" size={20} /> Actividades
            </h3>
          </div>

          {/* Activity Input Area */}
          <div className="p-5 border-b border-slate-200 bg-slate-50 z-10 shrink-0">
            <div className="flex gap-2 mb-4">
              <button className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm">
                <MessageSquare size={16} /> Registrar Nota
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white border border-purple-700 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm">
                <Mail size={16} /> Enviar al Cliente
              </button>
            </div>
            
            <div className="relative">
              <textarea 
                rows={3} 
                placeholder="Escribe un mensaje o registra una nota interna..." 
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none resize-none transition-colors shadow-sm"
              />
              <div className="absolute bottom-3 left-3 flex gap-2">
                <button className="p-1.5 text-slate-400 hover:text-purple-600 rounded-md hover:bg-purple-50 transition-colors"><Paperclip size={18} /></button>
                <button className="p-1.5 text-slate-400 hover:text-purple-600 rounded-md hover:bg-purple-50 transition-colors"><ImageIcon size={18} /></button>
              </div>
              <button className="absolute bottom-3 right-3 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-lg shadow-sm transition-colors">
                <Send size={16} />
              </button>
            </div>
          </div>

          {/* Timeline / Bitácora */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Línea Temporal</h4>
            
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {timeline.map((item) => (
                <div key={item.id} className="relative flex items-start gap-4 group">
                  {/* Icon */}
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-white shadow-sm shrink-0 z-10 ${item.color}`}>
                    <item.icon size={14} />
                  </div>
                  
                  {/* Card */}
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

            {!isNew && (
              <div className="text-center mt-8">
                <span className="text-xs font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
                  Fin del historial
                </span>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
"""

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated Solicitud Detalle page with resizable pane and unbounded form")
