'use client';

import { useState, useMemo } from 'react';
import { Search, Download, Sparkles, StickyNote, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

interface TablaComprasProps {
  rawData: any[];
}

export function TablaCompras({ rawData }: TablaComprasProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedEstado, setSelectedEstado] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [itemsPerPage, setItemsPerPage] = useState(25);

  const categories = [
    "Ropa", "Calzado", "Maternidad", "Esenciales (Salud y Cremas)", 
    "Vitaminas y Suplementos", "Juguetes", "Disfraces", "Accesorios", 
    "Otros", "Mas"
  ];

  const estados = useMemo(() => {
    const sts = new Set(rawData.map(d => d.status).filter(Boolean));
    return Array.from(sts).sort();
  }, [rawData]);

  // Lógica de filtrado
  const filteredData = useMemo(() => {
    return rawData.filter((item) => {
      // Filtro de Búsqueda (Producto)
      const matchesSearch = 
        (item.name?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      
      if (!matchesSearch) return false;

      // Filtro Categoría
      const itemCat = item.Categoría || item.Categoria || 'Otros';
      if (selectedCategory !== 'ALL' && itemCat !== selectedCategory) return false;

      // Filtro Estado
      if (selectedEstado !== 'ALL' && item.status !== selectedEstado) return false;

      // Filtro Fechas
      if (dateFrom && item.date) {
        const [d, m, y] = item.date.includes('/') ? item.date.split('/') : [];
        const isoDate = y ? `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}` : item.date;
        if (isoDate < dateFrom) return false;
      }
      if (dateTo && item.date) {
        const [d, m, y] = item.date.includes('/') ? item.date.split('/') : [];
        const isoDate = y ? `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}` : item.date;
        if (isoDate > dateTo) return false;
      }

      return true;
    });
  }, [rawData, searchTerm, selectedCategory, selectedEstado, dateFrom, dateTo]);

  // Paginación
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const currentData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const formatMoney = (val: number | string) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(num || 0);
  };

  return (
    <div className="p-6 space-y-6">
      
      {/* Top Cards (AI & Notes) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-emerald-50/50 border border-emerald-200/60 rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-emerald-700 flex items-center">
              <Sparkles className="w-4 h-4 mr-2" />
              Alertas y Consultas IA
            </h3>
          </div>
          <ul className="text-sm text-emerald-900/80 space-y-2 list-disc pl-5">
            <li>El historial maestro ha sido cargado con {rawData.length} registros de compra.</li>
          </ul>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col">
          <h3 className="text-sm font-bold text-slate-700 flex items-center mb-2">
            <StickyNote className="w-4 h-4 mr-2" />
            Notas y Pendientes
          </h3>
          <textarea 
            className="w-full flex-1 bg-transparent border-none resize-none text-sm text-slate-600 focus:ring-0 p-0 placeholder:text-slate-400"
            placeholder="Escribe notas rápidas de proveedores o faltantes aquí..."
          />
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <h3 className="text-base font-bold text-slate-800">
            Histórico Consolidado <span className="text-slate-500 font-normal text-sm">({filteredData.length} productos)</span>
          </h3>
          <button className="inline-flex items-center justify-center px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors shadow-sm w-fit">
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </button>
        </div>

        {/* Filters Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center bg-white">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar productos..." 
              value={searchTerm}
              onChange={(e) => {setSearchTerm(e.target.value); setCurrentPage(1);}}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
            />
          </div>
          
          <div className="flex flex-wrap gap-2 items-center">
            <select 
              value={selectedEstado} 
              onChange={(e) => {setSelectedEstado(e.target.value); setCurrentPage(1);}}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-emerald-500"
            >
              <option value="ALL">Todos los Estados</option>
              {estados.map((s: any) => <option key={s} value={s}>{s}</option>)}
            </select>

            <select 
              value={selectedCategory} 
              onChange={(e) => {setSelectedCategory(e.target.value); setCurrentPage(1);}}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-emerald-500"
            >
              <option value="ALL">Todas las Categorías</option>
              {categories.map((c: any) => <option key={c} value={c}>{c}</option>)}
            </select>
            
            <div className="flex items-center space-x-2">
              <span className="text-xs font-medium text-slate-500">Desde:</span>
              <input type="date" value={dateFrom} onChange={e => {setDateFrom(e.target.value); setCurrentPage(1);}} className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700" />
              <span className="text-xs font-medium text-slate-500">Hasta:</span>
              <input type="date" value={dateTo} onChange={e => {setDateTo(e.target.value); setCurrentPage(1);}} className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700" />
            </div>
          </div>
        </div>

        {/* Table Wrapper */}
        <div className="overflow-x-auto h-[600px] overflow-y-auto relative bg-white">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">ID Orden</th>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">Fecha</th>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">Producto</th>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">Categoría</th>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">Atributos</th>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap text-center">Cant.</th>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap text-right">Precio Unit.</th>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {currentData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <Filter className="w-8 h-8 text-slate-300 mb-3" />
                      <p className="font-medium text-slate-600">No hay datos que coincidan con los filtros</p>
                    </div>
                  </td>
                </tr>
              ) : (
                currentData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{row.id}</td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{row.date}</td>
                    <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate" title={row.name || 'Desconocido'}>{row.name || 'Desconocido'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="bg-slate-100 px-2 py-1 rounded text-xs font-medium border border-slate-200">
                        {row.Categoría || row.Categoria || 'Otros'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-500 max-w-[150px] truncate" title={row.attrs}>{row.attrs}</td>
                    <td className="px-4 py-2 text-slate-700 text-center font-medium">{row.qty}</td>
                    <td className="px-4 py-2 font-bold text-slate-800 text-right">{formatMoney(row.price)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        row.status.toLowerCase() === 'pendiente' || row.status.toLowerCase() === 'pending'
                          ? 'bg-amber-100 text-amber-700' 
                          : row.status.toLowerCase() === 'completado' || row.status.toLowerCase() === 'completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-400">{filteredData.length} registros</span>
            <select value={itemsPerPage} onChange={e=>{setItemsPerPage(Number(e.target.value));setCurrentPage(1);}} className="text-xs border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-600 outline-none focus:ring-1 focus:ring-indigo-200">
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
            </select>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button disabled={currentPage===1} onClick={()=>setCurrentPage(1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">«</button>
              <button disabled={currentPage===1} onClick={()=>setCurrentPage(p=>p-1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">‹</button>
              {Array.from({length:Math.min(5,totalPages)},(_,i)=>{
                let page=i+1;
                if(totalPages>5){const half=2;const start=Math.max(1,Math.min(currentPage-half,totalPages-4));page=start+i;}
                return <button key={page} onClick={()=>setCurrentPage(page)} className={`px-2.5 py-1 text-xs font-bold border rounded-lg ${currentPage===page?'bg-emerald-600 text-white border-emerald-600':'border-slate-200 hover:bg-slate-100'}`}>{page}</button>;
              })}
              <button disabled={currentPage===totalPages} onClick={()=>setCurrentPage(p=>p+1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">›</button>
              <button disabled={currentPage===totalPages} onClick={()=>setCurrentPage(totalPages)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">»</button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
