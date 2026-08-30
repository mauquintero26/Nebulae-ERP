'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, FileText, CheckCircle2, AlertCircle, ArrowRight, Table2, CloudDownload, Calendar, History, FolderOpen, X } from 'lucide-react';

export default function ExportarRangoPage() {
  const [file, setFile] = useState<File | null>(null);
  const [fechaIni, setFechaIni] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [salesData, setSalesData] = useState<any[]>([]);

  // History states
  const [showHistory, setShowHistory] = useState(false);
  const [historyFiles, setHistoryFiles] = useState<any[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Por favor selecciona un archivo de chat .txt');
      return;
    }
    if (!fechaIni || !fechaFin) {
      setError('Por favor define la fecha de inicio y fin.');
      return;
    }

    setIsLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('tipo', 'perso');
    formData.append('fecha_ini', fechaIni);
    formData.append('fecha_fin', fechaFin);

    try {
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/ventas/upload_chat', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Error en el servidor al procesar el archivo.');

      const data = await res.json();
      
      if (data.status === 'error') {
        throw new Error(data.message || 'Error al procesar.');
      }

      if (data.data && data.data.length > 0) {
        setSalesData(data.data);
      } else {
        setError('El archivo fue procesado pero no se encontraron ventas en este rango de fechas.');
        setSalesData([]);
      }

    } catch (err: any) {
      setError(err.message || 'Ocurrió un error inesperado.');
      setSalesData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/history');
      if (res.ok) {
        const data = await res.json();
        setHistoryFiles(data.files || []);
        setShowHistory(true);
      }
    } catch (err) {
      setError('No se pudo cargar el historial.');
    }
  };

  const loadHistoryFile = async (filename: string) => {
    setIsLoading(true);
    setShowHistory(false);
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/history/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames: [filename] })
      });
      const data = await res.json();
      if (data.data) {
        setSalesData(data.data || []);
      } else {
        setError('Error al cargar el archivo.');
      }
    } catch (err) {
      setError('Error de conexión.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportOdoo = () => {
    alert(`Exportación de ${salesData.length} ventas generada (Simulación). El formato Excel se descargará automáticamente cuando proveas la estructura final de Odoo.`);
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full">
      <div className="flex flex-col items-start justify-between">
        <Link href="/dashboard/ventas" className="flex items-center text-sm font-semibold text-slate-500 hover:text-purple-600 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Ventas
        </Link>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Upload className="w-6 h-6 text-purple-600" /> Exportar Ventas (Rango Personalizado)
          </h1>
          <p className="text-sm text-slate-500 mt-1">Sube el chat y define el rango exacto de fechas a exportar. El sistema verificará duplicados.</p>
        </div>
      </div>

      {!salesData.length ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm flex flex-col items-center justify-center min-h-[400px]">
          {showHistory ? (
            <div className="w-full max-w-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <History className="w-5 h-5 text-purple-600" /> Historial de Extracciones
                </h3>
                <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid gap-3 max-h-[300px] overflow-y-auto">
                {historyFiles.map(f => (
                  <div key={f.filename} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors cursor-pointer" onClick={() => loadHistoryFile(f.filename)}>
                    <div className="flex items-center gap-3">
                      <FolderOpen className="w-5 h-5 text-purple-400" />
                      <div>
                        <p className="font-bold text-sm text-slate-700">{f.filename}</p>
                        <p className="text-xs text-slate-500">Rango: {f.rango} • {f.count} registros</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">{f.upload_date}</span>
                  </div>
                ))}
                {historyFiles.length === 0 && <p className="text-center text-slate-500 py-4">No hay historial disponible.</p>}
              </div>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-4">
                <Calendar className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Define las Fechas y Selecciona el Chat</h3>
              <p className="text-sm text-slate-500 mb-6 text-center max-w-md">
                El sistema procesará el archivo <span className="font-mono bg-slate-100 px-1 rounded">.txt</span> y filtrará únicamente los registros de WhatsApp que estén dentro del periodo seleccionado.
              </p>

              <div className="flex flex-col items-center gap-4 w-full max-w-sm">
                
                <div className="grid grid-cols-2 gap-3 w-full">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1 text-left">Fecha Inicio</label>
                    <input 
                      type="date" 
                      value={fechaIni}
                      onChange={(e) => setFechaIni(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1 text-left">Fecha Fin</label>
                    <input 
                      type="date" 
                      value={fechaFin}
                      onChange={(e) => setFechaFin(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                </div>

                <input 
                  type="file" 
                  accept=".txt" 
                  onChange={handleFileChange}
                  className="block w-full mt-2 text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 transition-colors"
                />
                
                {error && (
                  <div className="text-red-600 text-sm flex items-center gap-1 mt-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> <span className="flex-1">{error}</span>
                  </div>
                )}

                <div className="flex w-full gap-2 mt-2">
                  <button 
                    onClick={handleUpload}
                    disabled={isLoading || !file || !fechaIni || !fechaFin}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    {isLoading ? 'Extrayendo...' : <><ArrowRight className="w-4 h-4" /> Extraer</>}
                  </button>
                  <button 
                    onClick={fetchHistory}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <History className="w-4 h-4" /> Historial
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <div>
                <h4 className="font-bold text-green-900">Extracción Exitosa</h4>
                <p className="text-sm text-green-700">Se encontraron {salesData.length} registros cargados.</p>
              </div>
            </div>
            <button onClick={() => setSalesData([])} className="text-sm font-semibold text-green-800 hover:text-green-900 underline">
              Subir otro archivo
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Table2 className="w-4 h-4 text-purple-600" /> Vista Previa (Rango Personalizado)
              </h3>
            </div>
            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-white text-slate-500 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Fecha</th>
                    <th className="px-4 py-2 font-semibold">Tipo</th>
                    <th className="px-4 py-2 font-semibold">Cliente</th>
                    <th className="px-4 py-2 font-semibold">Producto</th>
                    <th className="px-4 py-2 font-semibold">Cant.</th>
                    <th className="px-4 py-2 font-semibold">Precio Neto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesData.map((v, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-600">{v.Fecha}</td>
                      <td className="px-4 py-2 text-slate-600">{v.Tipo}</td>
                      <td className="px-4 py-2 font-semibold text-slate-800">{v.Cliente || 'N/A'}</td>
                      <td className="px-4 py-2 text-slate-600">{v.Producto}</td>
                      <td className="px-4 py-2 text-slate-600">{v.Cantidad}</td>
                      <td className="px-4 py-2 font-bold text-slate-900">${v.Precio_Neto_Odoo || v.Valor_Total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 bg-pink-50/50 flex items-center justify-between">
              <h3 className="font-bold text-pink-700 flex items-center gap-2">
                <CloudDownload className="w-4 h-4" /> Formato Odoo (Exportación Rango)
              </h3>
              <button 
                onClick={handleExportOdoo}
                className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm transition-colors"
              >
                Exportar Rango a Odoo
              </button>
            </div>
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-pink-50/30 text-slate-600 border-b border-pink-100 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 font-semibold">ID Externo</th>
                    <th className="px-4 py-2 font-semibold">Ref. Pedido</th>
                    <th className="px-4 py-2 font-semibold">Cliente</th>
                    <th className="px-4 py-2 font-semibold">Fecha Real</th>
                    <th className="px-4 py-2 font-semibold">Producto</th>
                    <th className="px-4 py-2 font-semibold">Cantidad</th>
                    <th className="px-4 py-2 font-semibold">Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesData.map((v, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-500 text-xs">{v.ID_Externo || `ext_${i}`}</td>
                      <td className="px-4 py-2 text-slate-500 text-xs">{v.Referencia_Pedido || ''}</td>
                      <td className="px-4 py-2 font-medium text-slate-800">{v.Cliente || 'N/A'}</td>
                      <td className="px-4 py-2 text-slate-600">{v.Fecha}</td>
                      <td className="px-4 py-2 text-slate-600">{v.Producto}</td>
                      <td className="px-4 py-2 text-slate-600">{v.Cantidad || 1}</td>
                      <td className="px-4 py-2 font-bold text-slate-900">${v.Precio_Odoo || v.Valor_Total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
