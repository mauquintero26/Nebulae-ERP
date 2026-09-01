import os
import re

path = 'src/app/dashboard/ventas/cotizacion/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'const MOCK_COTIZACIONES = \[.*?\];', '', text, flags=re.DOTALL)

hook_injection = '''import { getSalesOrders, updateSalesOrderStatus } from '@/lib/api';

export default function CotizacionesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState('list');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [cotizacionesData, setCotizacionesData] = useState<any[]>([]);

  useEffect(() => {
    fetchCotizaciones();
  }, []);

  const fetchCotizaciones = async () => {
    try {
      const data = await getSalesOrders();
      const realSales = data.sales || data;
      if (Array.isArray(realSales)) {
        // Asumiendo que QUOTATION u otros estados intermedios
        const cotizaciones = realSales.filter(s => s.status === 'QUOTATION' || s.status === 'TO_INVOICE').map(s => ({
          id: `COT-0${s.id}`,
          realId: s.id,
          origen_sc: `SC-0${s.id}`,
          cliente: `Cliente #${s.customer_id}`,
          monto: `$${(s.total_amount || 0).toLocaleString()}`,
          fecha: new Date(s.created_at || Date.now()).toLocaleDateString(),
          estado: s.status === 'TO_INVOICE' ? 'Cotización Confirmada' : 'Pendiente por Cotizar',
          ultimaAct: '2 min',
          responsable: 'Tú',
          desatendida: false
        }));
        setCotizacionesData(cotizaciones);
      }
    } catch(e) {
      console.error(e);
    }
  };

  const MOCK_COTIZACIONES = cotizacionesData;
'''

text = text.replace("export default function CotizacionesPage() {\n  const [searchTerm, setSearchTerm] = useState('');\n  const [activeView, setActiveView] = useState('list');\n  const [selectedRows, setSelectedRows] = useState<string[]>([]);", hook_injection)

if "import { useState } from 'react';" in text:
    text = text.replace("import { useState } from 'react';", "import { useState, useEffect } from 'react';")
elif "import { useState, " not in text:
    text = text.replace("import React, { useState }", "import React, { useState, useEffect }")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Done Cotizaciones')
