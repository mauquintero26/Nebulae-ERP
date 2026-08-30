'use client';

import { useState, useMemo } from 'react';
import { Search, Download, Sparkles, StickyNote, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

interface TablaVentasProps {
  rawData: any[];
}

export function TablaVentas({ rawData }: TablaVentasProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedClient, setSelectedClient] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedTipoVenta, setSelectedTipoVenta] = useState('ALL');

  const itemsPerPage = 50;

  const categories = [
    "Ropa", "Calzado", "Maternidad", "Esenciales (Salud y Cremas)", 
    "Vitaminas y Suplementos", "Juguetes", "Disfraces", "Accesorios", 
    "Otros", "Mas"
  ];

  const clients = useMemo(() => {
    const cls = new Set(rawData.map(d => d.Cliente).filter(Boolean));
    return Array.from(cls).sort();
  }, [rawData]);

  // Lógica de filtrado
  const filteredData = useMemo(() => {
    return rawData.filter((item) => {
      // Filtro de Búsqueda (Producto o Referencia)
      const matchesSearch = 
        (item.Producto?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (item.Referencia?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      
      if (!matchesSearch) return false;

      // Filtro Categoría
      const itemCat = item.Categoría || item.Categoria || 'Otros';
      if (selectedCategory !== 'ALL' && itemCat !== selectedCategory) return false;

      // Filtro Cliente
      if (selectedClient !== 'ALL' && item.Cliente !== selectedClient) return false;

      // Filtro Tipo Venta
      const itemTipoVenta = (item.Tipo_Venta || '').toUpperCase().trim();
      if (selectedTipoVenta !== 'ALL' && itemTipoVenta !== selectedTipoVenta) return false;

      // Filtro Fechas
      // Asumiendo formato DD/MM/YYYY o YYYY-MM-DD, simplificado para propósitos prácticos:
      if (dateFrom && item.Fecha) {
        // En tu backend actual, podrías necesitar estandarizar el parseo de fechas.
        // Asumimos formato YYYY-MM-DD para una comparación simple de strings si así lo retorna.
        const [d, m, y] = item.Fecha.includes('/') ? item.Fecha.split('/') : [];
        const isoDate = y ? `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}` : item.Fecha;
        if (isoDate < dateFrom) return false;
      }
      if (dateTo && item.Fecha) {
        const [d, m, y] = item.Fecha.includes('/') ? item.Fecha.split('/') : [];
        const isoDate = y ? `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}` : item.Fecha;
        if (isoDate > dateTo) return false;
      }

      return true;
    });
  }, [rawData, searchTerm, selectedCategory, selectedClient, dateFrom, dateTo]);

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
        <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-amber-700 flex items-center">
              <Sparkles className="w-4 h-4 mr-2" />
              Alertas y Consultas IA
            </h3>
          </div>
          <ul className="text-sm text-amber-900/80 space-y-2 list-disc pl-5">
            <li>El historial maestro ha sido cargado con {rawData.length} registros.</li>
          </ul>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col">
          <h3 className="text-sm font-bold text-slate-700 flex items-center mb-2">
            <StickyNote className="w-4 h-4 mr-2" />
            Notas y Pendientes
          </h3>
          <textarea 
            className="w-full flex-1 bg-transparent border-none resize-none text-sm text-slate-600 focus:ring-0 p-0 placeholder:text-slate-400"
            placeholder="Escribe tus notas rápidas aquí..."
          />
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <h3 className="text-base font-bold text-slate-800">
            Histórico Consolidado <span className="text-slate-500 font-normal text-sm">({filteredData.length} registros filtrados)</span>
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
              placeholder="Buscar productos o referencias..." 
              value={searchTerm}
              onChange={(e) => {setSearchTerm(e.target.value); setCurrentPage(1);}}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all"
            />
          </div>
          
          <div className="flex flex-wrap gap-2 items-center">
            <select 
              value={selectedClient} 
              onChange={(e) => {setSelectedClient(e.target.value); setCurrentPage(1);}}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-purple-500"
            >
              <option value="ALL">Todos los Clientes</option>
              {clients.map((c: any) => <option key={c} value={c}>{c}</option>)}
            </select>

            <select 
              value={selectedCategory} 
              onChange={(e) => {setSelectedCategory(e.target.value); setCurrentPage(1);}}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-purple-500"
            >
              <option value="ALL">Todas las Categorías</option>
              {categories.map((c: any) => <option key={c} value={c}>{c}</option>)}
            </select>

            <select 
              value={selectedTipoVenta} 
              onChange={(e) => {setSelectedTipoVenta(e.target.value); setCurrentPage(1);}}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 outline-none focus:border-purple-500"
            >
              <option value="ALL">Todo Tipo de Venta</option>
              <option value="POR PEDIDO">POR PEDIDO</option>
              <option value="ENTREGA INMEDIATA">ENTREGA INMEDIATA</option>
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
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">Fecha</th>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">Cantidad</th>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">Producto</th>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">Categoría</th>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">Cliente</th>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">Tipo Venta</th>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">Anticipo</th>
                <th className="px-4 py-3 font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap text-right">Valor Total</th>
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
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{row.Fecha}</td>
                    <td className="px-4 py-2 text-slate-600">{row.Cantidad || 1}</td>
                    <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate" title={row.Producto || 'Desconocido'}>{row.Producto || 'Desconocido'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="bg-slate-100 px-2 py-1 rounded text-xs font-medium border border-slate-200">
                        {row.Categoría || row.Categoria || 'Otros'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{row.Cliente || 'Consumidor Final'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${(row.Tipo_Venta || '').toUpperCase().trim() === 'POR PEDIDO' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {row.Tipo_Venta || 'N/A'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{formatMoney(row.Anticipo)}</td>
                    <td className="px-4 py-2 font-bold text-slate-800 text-right">{formatMoney(row.Valor_Total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          <span className="text-xs text-slate-500 font-medium">
            Mostrando {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredData.length)} de {filteredData.length}
          </span>
          <div className="flex space-x-1">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 border border-slate-200 rounded-md text-slate-500 hover:bg-white disabled:opacity-50 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-3 py-1 text-sm font-medium text-slate-700">Pág {currentPage} / {totalPages}</span>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 border border-slate-200 rounded-md text-slate-500 hover:bg-white disabled:opacity-50 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
