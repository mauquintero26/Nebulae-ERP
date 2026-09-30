'use client';

import { useState } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, ArrowRight, Table2, CloudDownload, History, FolderOpen, X } from 'lucide-react';
import { SubNav, PageHeader, Button, EmptyState } from '@/components/ui';
import { VEN_NAV } from '../ven-nav';
import { apiFetch } from '@/lib/api';

export default function ExportarDiaPage() {
  const [file, setFile] = useState<File | null>(null);
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

    setError('Esta función (extraer ventas desde un chat de WhatsApp) todavía no está conectada al servidor — está pendiente de construirse. Usa "Historial" para cargar una extracción ya guardada anteriormente.');
  };

  const fetchHistory = async () => {
    try {
      const data = await apiFetch('/history');
      setHistoryFiles(data.files || []);
      setShowHistory(true);
    } catch (err) {
      setError('No se pudo cargar el historial.');
    }
  };

  const loadHistoryFile = async (filename: string) => {
    setIsLoading(true);
    setShowHistory(false);
    try {
      const data = await apiFetch('/history/load', {
        method: 'POST',
        body: JSON.stringify({ filenames: [filename] })
      });
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
    <div className="w-full h-full flex flex-col">
      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas/exportar-dia" color="indigo" hub={{ href: '/dashboard/ventas' }} />

      <div className="flex flex-col gap-6 w-full p-6 pb-10">
        <PageHeader
          icon={Upload} color="indigo"
          title="Exportar Ventas del Día"
          subtitle="Sube el chat de WhatsApp. El sistema filtrará automáticamente la fecha actual."
        />

        {!salesData.length ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm flex flex-col items-center justify-center min-h-[400px]">
            {showHistory ? (
              <div className="w-full max-w-2xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <History className="w-5 h-5 text-blue-600" /> Historial de Extracciones
                  </h3>
                  <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="grid gap-3 max-h-[300px] overflow-y-auto">
                  {historyFiles.map(f => (
                    <div key={f.filename} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => loadHistoryFile(f.filename)}>
                      <div className="flex items-center gap-3">
                        <FolderOpen className="w-5 h-5 text-blue-400" />
                        <div>
                          <p className="font-bold text-sm text-slate-700">{f.filename}</p>
                          <p className="text-xs text-slate-500">Rango: {f.rango} • {f.count} registros</p>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400">{f.upload_date}</span>
                    </div>
                  ))}
                  {historyFiles.length === 0 && <EmptyState icon={FolderOpen} message="No hay historial disponible." />}
                </div>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                  <FileText className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Selecciona el chat exportado</h3>
                <p className="text-sm text-slate-500 mb-6 text-center max-w-md">
                  Sube el archivo <span className="font-mono bg-slate-100 px-1 rounded">.txt</span> generado por WhatsApp. Extraeremos automáticamente los clientes, productos y montos.
                </p>

                <div className="flex flex-col items-center gap-4 w-full max-w-sm">
                  <input
                    type="file"
                    accept=".txt"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition-colors"
                  />

                  {error && (
                    <div className="text-red-600 text-sm flex items-center gap-1 mt-2">
                      <AlertCircle className="w-4 h-4" /> {error}
                    </div>
                  )}

                  <div className="flex w-full gap-2 mt-2">
                    <div className="flex-1">
                      <Button onClick={handleUpload} disabled={!file} loading={isLoading} color="indigo" icon={ArrowRight}>
                        {isLoading ? 'Extrayendo...' : 'Extraer'}
                      </Button>
                    </div>
                    <div className="flex-1">
                      <Button onClick={fetchHistory} variant="secondary" icon={History}>
                        Historial
                      </Button>
                    </div>
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
                  <Table2 className="w-4 h-4 text-blue-600" /> Vista Previa (Extraída)
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
                  <CloudDownload className="w-4 h-4" /> Formato Odoo (Presupuestos)
                </h3>
                <Button onClick={handleExportOdoo} color="indigo" size="sm">
                  Exportar Ventas del Día a Odoo
                </Button>
              </div>
              <div className="overflow-x-auto max-h-[300px]">
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
    </div>
  );
}
