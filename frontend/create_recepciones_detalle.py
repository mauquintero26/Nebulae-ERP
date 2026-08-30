import os

path = 'src/app/dashboard/compras/recepciones/[id]/page.tsx'

content = """"use client";

import { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, Save, FileText, 
  Box, Search, PackageCheck, AlertTriangle, MessageSquareWarning, ShieldCheck, Link as LinkIcon
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function RecepcionDetallePage() {
  const params = useParams();
  
  // Status State
  const [status, setStatus] = useState('Pendiente de Conteo'); // Pendiente de Conteo | Discrepancia | Validado (Facturable)
  const [nota, setNota] = useState('');

  // Items (Conteo ciego / Validación vs PEC)
  const [items, setItems] = useState([
    { id: 1, name: 'Laptop Dell Latitude 5420', category: 'Equipos IT', expected: 10, received: 0, notes: '' },
    { id: 2, name: 'Monitor Dell 24"', category: 'Periféricos', expected: 15, received: 0, notes: '' }
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

  const updateReceived = (id: number, val: number) => {
    setItems(items.map(i => i.id === id ? { ...i, received: val } : i));
  };

  const validateConteo = () => {
    const hasDiscrepancy = items.some(i => i.expected !== i.received);
    if (hasDiscrepancy) {
      setStatus('Discrepancia');
    } else {
      setStatus('Validado (Facturable)');
    }
  };

  const totalExpected = items.reduce((acc, i) => acc + i.expected, 0);
  const totalReceived = items.reduce((acc, i) => acc + i.received, 0);
  const hasDiscrepancy = items.some(i => i.expected !== i.received);

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
      
      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/compras/recepciones" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-800">
                {String(params.id).toUpperCase()}
              </h1>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                status === 'Pendiente de Conteo' ? 'bg-slate-100 text-slate-700 border-slate-200' : 
                status === 'Discrepancia' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                'bg-emerald-100 text-emerald-700 border-emerald-200'
              }`}>
                {status === 'Validado (Facturable)' && <ShieldCheck size={14} />}
                {status === 'Discrepancia' && <MessageSquareWarning size={14} />}
                {status}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-xl font-bold text-sm transition-colors shadow-sm">
            <Save size={16} /> Guardar Borrador
          </button>
          <button onClick={validateConteo} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors shadow-sm">
            <PackageCheck size={16} /> Cerrar y Validar Conteo
          </button>
        </div>
      </div>

      {/* Main Content Layout (Split Pane) */}
      <div className="flex-1 flex flex-row overflow-hidden">
        
        {/* BLOQUE 1: Información de Recepción (Formulario Principal) */}
        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-white relative">

          {status === 'Discrepancia' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-8 flex items-center justify-between shadow-sm animate-in fade-in max-w-6xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-amber-600 shadow-sm"><AlertTriangle size={20}/></div>
                <div>
                  <h3 className="font-black text-amber-900">Alerta de Discrepancia en Conteo Físico</h3>
                  <p className="text-sm text-amber-700">Las cantidades ingresadas no coinciden con la Orden de Compra. Finanzas bloqueará el pago hasta resolverse.</p>
                </div>
              </div>
            </div>
          )}

          {status === 'Validado (Facturable)' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-8 flex items-center justify-between shadow-sm animate-in fade-in max-w-6xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm"><ShieldCheck size={20}/></div>
                <div>
                  <h3 className="font-black text-emerald-900">Mercancía Recibida Satisfactoriamente (3-Way Match)</h3>
                  <p className="text-sm text-emerald-700">El stock ha sido ingresado al sistema. El Pedido de Compra (PEC) y el Pedido de Venta (PVEN) han sido notificados para facturación y despacho al cliente final.</p>
                </div>
              </div>
            </div>
          )}

          <div className="max-w-6xl mx-auto space-y-10">
            
            {/* Cabecera del Documento Origen */}
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                <FileText className="text-emerald-600" size={24} /> Documentos de Origen (Trazabilidad)
              </h2>
              
              <div className="grid grid-cols-4 gap-6 bg-slate-50 border border-slate-200 rounded-2xl p-6">
                
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Orden de Compra (Asociada)</label>
                  <Link href="/dashboard/compras/pedidos/pec-0001" className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-black hover:bg-emerald-100 transition-colors w-max shadow-sm">
                    <LinkIcon size={16} /> PEC-0001
                  </Link>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Pedido de Venta (Cliente Final)</label>
                  <Link href="/dashboard/ventas/venta/pven-0105" className="flex items-center gap-2 bg-purple-50 border border-purple-200 text-purple-700 rounded-xl px-4 py-3 text-sm font-black hover:bg-purple-100 transition-colors w-max shadow-sm">
                    <LinkIcon size={16} /> PVEN-0105
                  </Link>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Proveedor</label>
                  <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800">
                    Global Tech Suppliers Ltd.
                  </div>
                </div>

                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Bodega Receptora</label>
                  <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800">
                    Principal (Nebulae)
                  </div>
                </div>
                
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Fecha de Recepción</label>
                  <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800">
                    26 Ago 2026
                  </div>
                </div>

              </div>
            </div>

            {/* ARTÍCULOS - Conteo Físico */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                  <Box className="text-emerald-600" size={24} /> Conteo Físico / Validación
                </h3>
                <div className="flex gap-4">
                  <div className="text-sm">
                    <span className="text-slate-500 font-bold mr-2">Esperado:</span>
                    <span className="bg-slate-100 text-slate-800 px-2 py-1 rounded font-black">{totalExpected} u.</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-slate-500 font-bold mr-2">Contado:</span>
                    <span className={`px-2 py-1 rounded font-black ${totalExpected !== totalReceived ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {totalReceived} u.
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm">
                <table className="w-full text-left whitespace-nowrap min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Producto (Referencia PEC)</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center bg-slate-100 border-x border-slate-200 w-32">Cant. Esperada</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center bg-emerald-50 border-r border-emerald-100 w-32">Cant. Recibida</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center w-24">Diferencia</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-48">Observaciones Físicas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map(item => {
                      const diff = item.received - item.expected;
                      const isError = diff !== 0;
                      return (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-4 py-4">
                            <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                            <div className="text-slate-500 text-xs">{item.category}</div>
                          </td>
                          <td className="px-4 py-4 text-center font-black text-slate-500 bg-slate-50 border-x border-slate-100">
                            {item.expected}
                          </td>
                          <td className="px-4 py-4 bg-emerald-50/30 border-r border-emerald-50">
                            <input 
                              type="number" 
                              min="0"
                              value={item.received || ''} 
                              onChange={(e) => updateReceived(item.id, parseInt(e.target.value) || 0)}
                              className={`w-full bg-white border rounded-lg px-2 py-2 text-center font-black outline-none transition-colors ${
                                isError && item.received !== 0 ? 'border-amber-400 focus:ring-1 focus:ring-amber-500 text-amber-700' : 'border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-emerald-700'
                              }`} 
                            />
                          </td>
                          <td className="px-4 py-4 text-center font-black">
                            {item.received === 0 ? (
                              <span className="text-slate-300">-</span>
                            ) : (
                              <span className={diff === 0 ? 'text-emerald-500' : 'text-amber-500 bg-amber-50 px-2 py-1 rounded'}>
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <input 
                              type="text" 
                              placeholder="Ej: Cajas dañadas..." 
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:border-emerald-500 outline-none"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>

        {/* Resizer Handle */}
        <div 
          onMouseDown={handleMouseDown}
          className="w-1.5 bg-slate-200 hover:bg-emerald-500 cursor-col-resize shrink-0 transition-colors z-30"
          title="Arrastrar para ajustar panel de firmas"
        />

        {/* BLOQUE 2: Firmas y Control Documental */}
        <div style={{ width: rightWidth }} className="bg-white flex flex-col overflow-hidden shrink-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">
          
          <div className="p-5 border-b border-slate-200 bg-slate-800 flex items-center justify-between shadow-sm z-10 shrink-0">
            <h3 className="font-black text-white flex items-center gap-2 text-lg">
              <FileText className="text-slate-400" size={20} /> Inspección y Calidad
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50 space-y-6">
            
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Estado Visual de la Carga</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="estado_carga" className="text-emerald-600 focus:ring-emerald-500" defaultChecked />
                  <span className="text-sm font-bold text-slate-700">Óptimo (Sin daños visibles)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="estado_carga" className="text-amber-600 focus:ring-amber-500" />
                  <span className="text-sm font-bold text-slate-700">Daños Menores (Empaques golpeados)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="estado_carga" className="text-rose-600 focus:ring-rose-500" />
                  <span className="text-sm font-bold text-slate-700">Crítico (Mercancía expuesta/rota)</span>
                </label>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Notas de Recepción</label>
              <textarea 
                rows={4} 
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Indique si el transportista dejó alguna novedad..." 
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
              />
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <label className="block text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Firma Responsable</label>
              <div className="h-24 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 font-medium">
                Área para firma digital del bodeguero
              </div>
              <p className="text-xs text-slate-400 text-center mt-2">Firmado por: Carlos (Bodega Principal)</p>
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

print("Detalle de Recepcion page created successfully")
