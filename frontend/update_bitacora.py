import os
import re

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace "Trámites Activos" and the boxes
pattern_tramites = re.compile(r'<div className="p-5 border-b border-slate-100 bg-white space-y-3">.*?Ver Tracking\s*</button>\s*</div>\s*</div>', re.DOTALL)

new_tramites = '''<div className="p-5 border-b border-slate-100 bg-white space-y-3">
                <div className="flex justify-between items-center mb-1">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trámites Activos (CRM)</h4>
                </div>
                
                {customer360?.active_orders?.length > 0 ? (
                  customer360.active_orders.map((order: any, idx: number) => (
                    <div key={order.id} className="flex justify-between items-center border p-3 rounded-xl transition-all bg-indigo-50/30 border-indigo-100">
                      <div>
                        <p className="text-xs font-bold text-indigo-900">Trámite #0{order.id}</p>
                        <p className="text-[10px] text-indigo-600 mt-0.5">{order.status}</p>
                      </div>
                      <button className="text-xs font-bold bg-white text-indigo-600 px-3 py-1.5 rounded border border-indigo-200 hover:bg-indigo-50">
                        Ver Tracking
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">No hay trámites activos en este momento.</p>
                )}
              </div>'''

text = pattern_tramites.sub(new_tramites, text)

# Replace the Timeline items
pattern_timeline = re.compile(r'<div className="space-y-6 relative">.*?<h4 className="font-bold text-slate-800 text-sm">Pedido de Venta Creado</h4>.*?<div className="text-slate-400 text-xs mt-0\.5">Hace 2 horas</div>\s*</div>\s*</div>\s*</div>\s*\)\}\s*</div>', re.DOTALL)

new_timeline = '''<div className="space-y-6 relative">
                
                {customer360?.active_orders?.length > 0 ? (
                  customer360.active_orders.map((order: any) => (
                    <div key={`tl-${order.id}`} className="relative pl-8">
                      <div className="absolute left-[-5px] top-1 w-3 h-3 rounded-full bg-indigo-500 border-2 border-white shadow-sm ring-4 ring-indigo-100"></div>
                      <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm hover:border-indigo-200 transition-colors cursor-pointer">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-bold text-slate-800 text-sm">Trámite {order.status}</h4>
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{new Date(order.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-slate-600 text-xs">Total de la orden: ${order.total.toLocaleString()}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="relative pl-8">
                    <div className="absolute left-[-5px] top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-sm ring-4 ring-emerald-100"></div>
                    <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm hover:border-emerald-200 transition-colors cursor-pointer">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-bold text-slate-800 text-sm">Cliente Creado</h4>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Hoy</span>
                      </div>
                      <p className="text-slate-600 text-xs">Ficha del cliente registrada en el sistema.</p>
                    </div>
                  </div>
                )}
                
              </div>'''

text = pattern_timeline.sub(new_timeline, text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Updated bitacora UI")
