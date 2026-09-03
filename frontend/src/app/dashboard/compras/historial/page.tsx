'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Table2, History, FolderOpen, X, Download, CloudDownload, Filter, Search, Loader2, RefreshCw } from 'lucide-react';

export default function ComprasHistorialPage() {
  const [comprasData, setComprasData] = useState<any[]>([]);
  const [filteredData, setFilteredData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [historyFiles, setHistoryFiles] = useState<any[]>([]);

  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProduct, setFilterProduct] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Tabs
  const [activeTab, setActiveTab] = useState('Historial');

  // AI Analysis
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiChat, setAiChat] = useState<any[]>([]);
  const [aiInput, setAiInput] = useState('');

  useEffect(() => {
    // Try auto-loading history
    const loadRecentHistory = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/history/compras');
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
            setFilteredData(loadData.data);
          }
        }
      } catch (err) {
        console.error('Error auto-loading history:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadRecentHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/history/compras');
      if (res.ok) {
        const data = await res.json();
        setHistoryFiles(data.files || []);
        setShowHistory(true);
      }
    } catch (err) {
      setError('No se pudo cargar la lista de historial.');
    }
  };

  const loadHistoryFile = async (filename: string) => {
    setIsLoading(true);
    setShowHistory(false);
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/history/compras/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: [filename] })
      });
      const data = await res.json();
      if (data.data) {
        setComprasData(data.data);
        setFilteredData(data.data);
        setFilterDate('');
        setFilterStatus('');
        setFilterProduct('');
      } else {
        setError('Error al cargar el archivo.');
      }
    } catch (err) {
      setError('Error de conexión.');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter effect
  useEffect(() => {
    let temp = [...comprasData];
    const qDate = filterDate.toLowerCase();
    const qStatus = filterStatus.toLowerCase();
    const qProd = filterProduct.toLowerCase();

    if (qDate || qStatus || qProd) {
      temp = temp.filter(p => {
        const matchDate = !qDate || (p.Fecha || p.date || '').toLowerCase().includes(qDate);
        const matchStatus = !qStatus || (p.Estado || p.status || '').toLowerCase().includes(qStatus);
        
        let matchProduct = !qProd;
        if (qProd) {
          if (p.Producto) {
             matchProduct = p.Producto.toLowerCase().includes(qProd);
          } else if (p.products && Array.isArray(p.products)) {
             matchProduct = p.products.some((prod: any) => 
               (prod.name || '').toLowerCase().includes(qProd) || 
               (prod.attributes || '').toLowerCase().includes(qProd)
             );
          }
        }
        return matchDate && matchStatus && matchProduct;
      });
    }
    setFilteredData(temp);
  }, [filterDate, filterStatus, filterProduct, comprasData]);

  const flattenProducts = (dataList: any[]) => {
    const flat: any[] = [];
    dataList.forEach(p => {
      // Si ya está plano (por ejemplo de OCR)
      if (p.Producto) {
        flat.push({
          order: p.Orden_ID || p.order_number || '-',
          date: p.Fecha || p.date || '-',
          status: p.Estado || p.status || 'N/A',
          name: p.Producto,
          attrs: p.Atributos || '-',
          qty: p.Cantidad || 1,
          price: parseFloat(String(p.Precio_Unitario || p.Valor_Total || 0).replace(/[^0-9.-]+/g, ''))
        });
      } 
      // Si viene anidado del formulario manual
      else if (p.products && Array.isArray(p.products)) {
        p.products.forEach((prod: any) => {
          flat.push({
            order: p.order_number || p.Orden_ID || '-',
            date: p.date || p.Fecha || '-',
            status: p.status || p.Estado || 'N/A',
            name: prod.name,
            attrs: prod.attributes || '-',
            qty: prod.quantity || 1,
            price: prod.price || 0
          });
        });
      }
    });
    return flat;
  };

  const tableRows = flattenProducts(filteredData);
  const totalItems = tableRows.length;

  const exportCSV = () => alert("Exportación CSV en construcción");
  const exportJSON = () => alert("Exportación JSON en construcción");
  const exportOdoo = () => alert("Exportación Odoo en construcción");

  async function handleAIAnalysis() {
    setAiLoading(true);
    const summary = `Datos de Historial de Compras: ${filteredData.length} registros. Top items: ${filteredData.slice(0,3).map((r:any)=>r.Producto||r.order_number||'item').join(', ')}.`;
    setAiAnalysis(`📊 ANÁLISIS DE HISTORIAL DE COMPRAS — ${new Date().toLocaleDateString('es-CO')}\n\n${summary}\n\nPuede consultar más detalles usando el chat de abajo.`);
    setAiLoading(false);
  }

  async function sendAIChat() {
    if(!aiInput.trim()) return;
    const msg=aiInput; setAiInput('');
    setAiChat(h=>[...h,{role:'user',text:msg}]);
    setAiChat(h=>[...h,{role:'ia',text:`Con base en los datos actuales: ${msg}. El análisis muestra ${filteredData.length} registros disponibles.`}]);
  }

  return (
    <div className="flex flex-col gap-6 w-full h-full pb-10">
      <div className="flex flex-col items-start justify-between">
        <Link href="/dashboard/compras" className="flex items-center text-sm font-semibold text-slate-500 hover:text-emerald-600 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Dashboard Compras
        </Link>
        <div className="flex items-center justify-between w-full">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
              <Table2 className="w-6 h-6 text-emerald-600" /> Historial de Compras
            </h1>
            <p className="text-sm text-slate-500 mt-1">Explora la base de datos de órdenes procesadas y expórtalas al formato requerido.</p>
          </div>
          <button 
            onClick={fetchHistory}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
          >
            <History className="w-4 h-4" /> Historial DB
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative mb-2">
          <button onClick={() => setShowHistory(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-emerald-600" /> Archivos de Historial (Compras)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[300px] overflow-y-auto pr-2">
            {historyFiles.map(f => (
              <div key={f.filename} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-emerald-300 hover:bg-emerald-50 transition-colors cursor-pointer" onClick={() => loadHistoryFile(f.filename)}>
                <div className="flex items-center gap-3">
                  <FolderOpen className="w-6 h-6 text-emerald-400" />
                  <div>
                    <p className="font-bold text-xs text-slate-700 truncate w-32" title={f.filename}>{f.filename}</p>
                    <p className="text-[10px] text-slate-500">{f.upload_date}</p>
                  </div>
                </div>
              </div>
            ))}
            {historyFiles.length === 0 && <p className="text-sm text-slate-500 col-span-3">No hay historiales guardados.</p>}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">

        {/* Tab Nav */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-100">
          {['Historial', 'Analisis'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors ${activeTab === tab ? 'border-emerald-500 text-emerald-700 bg-emerald-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {tab === 'Analisis' ? 'Análisis' : tab}
            </button>
          ))}
        </div>

        {activeTab === 'Historial' && (
          <>
            {/* Toolbar */}
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row gap-4 justify-between items-center">
              <div className="flex items-center gap-2 w-full md:w-auto">
                <button onClick={exportCSV} className="text-xs font-bold bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded hover:bg-slate-100 transition-colors flex items-center gap-1"><Download className="w-3 h-3"/> CSV</button>
                <button onClick={exportJSON} className="text-xs font-bold bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded hover:bg-slate-100 transition-colors flex items-center gap-1"><Download className="w-3 h-3"/> JSON</button>
                <button onClick={exportOdoo} className="text-xs font-bold bg-[#714B67] text-white px-3 py-1.5 rounded hover:bg-[#5b3c53] transition-colors flex items-center gap-1 shadow-sm"><CloudDownload className="w-3 h-3"/> Formato Odoo</button>
              </div>

              <div className="flex flex-1 gap-3 w-full md:w-auto justify-end">
                <div className="relative max-w-[150px]">
                  <input type="text" placeholder="Filtro Fecha" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-full text-xs pl-8 pr-2 py-1.5 border border-slate-200 rounded outline-none focus:border-emerald-500" />
                  <Filter className="w-3 h-3 text-slate-400 absolute left-2.5 top-2" />
                </div>
                <div className="relative max-w-[150px]">
                  <input type="text" placeholder="Filtro Estado" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full text-xs pl-8 pr-2 py-1.5 border border-slate-200 rounded outline-none focus:border-emerald-500" />
                  <Filter className="w-3 h-3 text-slate-400 absolute left-2.5 top-2" />
                </div>
                <div className="relative max-w-[150px]">
                  <input type="text" placeholder="Filtro Producto" value={filterProduct} onChange={e => setFilterProduct(e.target.value)} className="w-full text-xs pl-8 pr-2 py-1.5 border border-slate-200 rounded outline-none focus:border-emerald-500" />
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2" />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p>Cargando datos...</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-4 py-3 font-bold text-xs uppercase">Orden</th>
                      <th className="px-4 py-3 font-bold text-xs uppercase">Fecha</th>
                      <th className="px-4 py-3 font-bold text-xs uppercase">Estado</th>
                      <th className="px-4 py-3 font-bold text-xs uppercase">Producto</th>
                      <th className="px-4 py-3 font-bold text-xs uppercase">Atributos</th>
                      <th className="px-4 py-3 font-bold text-xs uppercase text-center">Cant.</th>
                      <th className="px-4 py-3 font-bold text-xs uppercase text-right">Precio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tableRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          No hay compras que coincidan con los filtros o no se han cargado datos.
                        </td>
                      </tr>
                    ) : (
                      tableRows.slice((currentPage-1)*pageSize, currentPage*pageSize).map((r, i) => (
                        <tr key={i} className="hover:bg-emerald-50/50 transition-colors">
                          <td className="px-4 py-2.5 font-semibold text-slate-800">{r.order}</td>
                          <td className="px-4 py-2.5 text-slate-600">{r.date}</td>
                          <td className="px-4 py-2.5">
                            <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                              {r.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">{r.name}</td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{r.attrs}</td>
                          <td className="px-4 py-2.5 text-slate-700 text-center font-medium">{r.qty}</td>
                          <td className="px-4 py-2.5 font-bold text-slate-900 text-right">
                            ${r.price.toLocaleString('es-CO', { maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* PAGINATION */}
            {totalItems > 0 && (
              <div className="border-t border-slate-100 px-6 py-3 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400">{totalItems} registros</span>
                  <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setCurrentPage(1);}} className="text-xs border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-600 outline-none">
                    <option value={25}>25 por página</option>
                    <option value={50}>50 por página</option>
                  </select>
                </div>
                {Math.ceil(totalItems/pageSize) > 1 && (
                  <div className="flex items-center gap-1">
                    <button disabled={currentPage===1} onClick={()=>setCurrentPage(1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">«</button>
                    <button disabled={currentPage===1} onClick={()=>setCurrentPage(p=>p-1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">‹</button>
                    {Array.from({length:Math.min(5,Math.ceil(totalItems/pageSize))},(_,i)=>{
                      const tp=Math.ceil(totalItems/pageSize); let page=i+1;
                      if(tp>5){const half=2;const start=Math.max(1,Math.min(currentPage-half,tp-4));page=start+i;}
                      return <button key={page} onClick={()=>setCurrentPage(page)} className={`px-2.5 py-1 text-xs font-bold border rounded-lg ${currentPage===page?'bg-emerald-600 text-white border-emerald-600':'border-slate-200 hover:bg-slate-100'}`}>{page}</button>;
                    })}
                    <button disabled={currentPage===Math.ceil(totalItems/pageSize)} onClick={()=>setCurrentPage(p=>p+1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">›</button>
                    <button disabled={currentPage===Math.ceil(totalItems/pageSize)} onClick={()=>setCurrentPage(Math.ceil(totalItems/pageSize))} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">»</button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === 'Analisis' && (
          <div className="p-6 space-y-4">
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-blue-600 rounded-xl p-2 text-white font-black text-sm">AI</div>
                <div>
                  <p className="font-extrabold text-blue-900">Análisis de Historial de Compras</p>
                  <p className="text-xs text-blue-500">Nebulae Analytics</p>
                </div>
                <button onClick={handleAIAnalysis} disabled={aiLoading} className="ml-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2">
                  {aiLoading ? <RefreshCw size={14} className="animate-spin"/> : null} Generar Análisis
                </button>
              </div>
              {aiAnalysis && (
                <pre className="text-sm text-slate-700 whitespace-pre-wrap bg-white/70 rounded-xl p-4 border border-blue-100 leading-relaxed">{aiAnalysis}</pre>
              )}
              {!aiAnalysis && !aiLoading && (
                <p className="text-sm text-blue-700 italic text-center py-4">Haz clic en "Generar Análisis" para obtener insights sobre los datos actuales.</p>
              )}
            </div>
            {/* Chat */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="font-bold text-slate-700 text-sm mb-3">Consultar al Asistente</p>
              <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
                {aiChat.map((m:any,i:number)=>(
                  <div key={i} className={`flex ${m.role==='user'?'justify-end':''}`}>
                    <div className={`rounded-xl px-3 py-2 text-xs max-w-[80%] ${m.role==='user'?'bg-blue-600 text-white':'bg-slate-100 text-slate-700'}`}>{m.text}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendAIChat()} placeholder="Pregunta sobre los datos..." className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-200"/>
                <button onClick={sendAIChat} disabled={!aiInput.trim()} className="bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50">Enviar</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
