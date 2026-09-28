'use client';

import { useState } from 'react';
import { Cloud, FileSpreadsheet, ShieldAlert } from 'lucide-react';
import { SubNav, PageHeader, Button } from '@/components/ui';
import { VEN_NAV } from '../ven-nav';

export default function ValidacionOdooPage() {
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleValidate = () => {
    if (!file) return;
    alert('Función de validación estructural de columnas Odoo en construcción. La interfaz está lista para conectarse al validador Python.');
  };

  return (
    <div className="w-full h-full flex flex-col">
      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas/validacion-odoo" color="indigo" hub={{ href: '/dashboard/ventas' }} />

      <div className="flex flex-col gap-6 w-full p-6 pb-10">
        <PageHeader
          icon={Cloud} color="indigo"
          title="Validación Formato Odoo"
          subtitle="Sube el Excel con el formato Odoo para validarlo estructuralmente antes de subir a producción."
        />

        <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
            <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">Validador de Integridad</h3>
          <p className="text-sm text-slate-500 mb-6 text-center max-w-md">
            Asegúrate de que el archivo generado no contenga errores de tipeo, columnas faltantes o IDs externos duplicados antes de impactar tu ERP.
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 max-w-md flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-amber-900">En Construcción</h4>
              <p className="text-xs text-amber-800 mt-1">La validación algorítmica de los headers será conectada próximamente en el backend. Puedes subir el archivo para simular el proceso.</p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 w-full max-w-sm">
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 transition-colors"
            />

            <Button onClick={handleValidate} disabled={!file} color="indigo" size="lg">
              Validar Archivo Odoo
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
