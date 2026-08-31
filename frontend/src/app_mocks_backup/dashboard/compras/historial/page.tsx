'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Table2, History, FolderOpen, X, Download, CloudDownload, Filter, Search, Loader2 } from 'lucide-react';

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

  const exportCSV = () => alert("Exportación CSV en construcción");
  const exportJSON = () => alert("Exportación JSON en construcción");
  const exportOdoo = () => alert("Exportación Odoo en construcción");

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
        <div className="overflow-x-auto max-h-[600px]">
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
                  tableRows.map((r, i) => (
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

      </div>
    </div>
  );
}
