import os
import re

path = 'src/app/dashboard/ventas/solicitud/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Delete MOCK_SOLICITUDES
text = re.sub(r'const MOCK_SOLICITUDES = \[.*?\];', '', text, flags=re.DOTALL)

hook_injection = '''import { getSalesOrders, updateSalesOrderStatus } from '@/lib/api';
import toast from 'react-hot-toast';

export default function SolicitudesCliente() {
  const [activeView, setActiveView] = useState('list');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [salesData, setSalesData] = useState<any[]>([]);

  useEffect(() => {
    fetchSolicitudes();
  }, []);

  const fetchSolicitudes = async () => {
    try {
      const data = await getSalesOrders();
      const realSales = data.sales || data;
      if (Array.isArray(realSales)) {
        // Filtrar solo las que sean solicitudes (estado inicial)
        const solicitudes = realSales.filter(s => s.status === 'DRAFT' || s.status === 'SOLICITUD' || s.status === 'TO_INVOICE').map(s => ({
          id: `SC-0${s.id}`,
          realId: s.id,
          date: new Date(s.created_at || Date.now()).toLocaleDateString(),
          client: `Cliente #${s.customer_id}`,
          type: s.sale_type || 'B2B',
          status: s.status === 'TO_INVOICE' ? 'Evaluación' : 'Pendiente',
          lastUpdate: '2 min',
          assigned: 'Tú',
          desatendida: false
        }));
        setSalesData(solicitudes);
      }
    } catch(e) {
      console.error(e);
    }
  };

  const MOCK_SOLICITUDES = salesData;
'''

text = text.replace("export default function SolicitudesCliente() {\n  const [activeView, setActiveView] = useState('list');\n  const [selectedRows, setSelectedRows] = useState<string[]>([]);\n  const [isFormOpen, setIsFormOpen] = useState(false);", hook_injection)

# Add create flow logic to the form if it exists. Wait, I'll just map the UI array first to avoid breaking UI.
if "import { useState } from 'react';" in text:
    text = text.replace("import { useState } from 'react';", "import { useState, useEffect } from 'react';")
elif "import { useState, " not in text:
    text = text.replace("import React, { useState }", "import React, { useState, useEffect }")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Done Solicitudes')
