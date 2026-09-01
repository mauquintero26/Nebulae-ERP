import os
import re

path = 'src/app/dashboard/ventas/venta/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'const MOCK_VENTAS = Array\.from\(\{ length: 24 \}, \(\_, i\) => \{.*?\n\}\);', '', text, flags=re.DOTALL)

hook_injection = '''import { getSalesOrders, invoiceSalesOrder } from '@/lib/api';

export default function VentasHubPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState('list');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [ventasData, setVentasData] = useState<any[]>([]);

  useEffect(() => {
    fetchVentas();
  }, []);

  const fetchVentas = async () => {
    try {
      const data = await getSalesOrders();
      const realSales = data.sales || data;
      if (Array.isArray(realSales)) {
        // Pedidos de Venta ya facturados/aprobados
        const ventas = realSales.filter(s => s.status === 'INVOICED').map(s => ({
          id: `VEN-0${s.id}`,
          realId: s.id,
          cliente: `Cliente #${s.customer_id}`,
          origen: `COT-0${s.id}`,
          monto: `$${(s.total_amount || 0).toLocaleString()}`,
          fecha: new Date(s.created_at || Date.now()).toLocaleDateString(),
          estado: 'Pagado',
          logistica: 'Por Despachar',
          ultimaAct: '2 min',
          responsable: 'Tú',
          alerta: false
        }));
        setVentasData(ventas);
      }
    } catch(e) {
      console.error(e);
    }
  };

  const MOCK_VENTAS = ventasData;
'''

text = text.replace("export default function VentasHubPage() {\n  const [searchTerm, setSearchTerm] = useState('');\n  const [activeView, setActiveView] = useState('list');\n  const [selectedRows, setSelectedRows] = useState<string[]>([]);", hook_injection)

if "import { useState } from 'react';" in text:
    text = text.replace("import { useState } from 'react';", "import { useState, useEffect } from 'react';")
elif "import { useState, " not in text:
    text = text.replace("import React, { useState }", "import React, { useState, useEffect }")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Done Ventas')
