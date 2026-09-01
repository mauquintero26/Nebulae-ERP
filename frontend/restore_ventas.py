import os
import re

path = 'src/app/dashboard/ventas/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Borrar el MOCK_SALES entero usando regex
text = re.sub(r'const MOCK_SALES = \[.*?\];', '', text, flags=re.DOTALL)

# Inyectar
hook_injection = '''import { getHeaders } from '@/lib/api';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';

export default function VentasHub() {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState('Pendientes');
  const [salesData, setSalesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSales = async () => {
      try {
        const res = await fetch(`${API_URL}/sales`, { headers: getHeaders() });
        const data = await res.json().catch(() => ({}));
        const realSales = data.data || data;
        
        if (Array.isArray(realSales)) {
          const mapped = realSales.map((s:any) => ({
            id: `PVEN-${s.id}`,
            realId: s.id,
            client: `Cliente #${s.customer_id}`,
            date: new Date(s.created_at || Date.now()).toISOString().split('T')[0],
            amount: s.total_amount || 0,
            type: s.sale_type || 'B2B',
            status: s.status === 'TO_INVOICE' ? 'Pendiente' : (s.status === 'INVOICED' ? 'Facturado' : s.status),
            risk: 'low',
            quoteId: `COT-${s.id}`
          }));
          setSalesData(mapped);
        }
      } catch(e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchSales();
  }, []);

  const MOCK_SALES = salesData;
'''

text = text.replace("export default function VentasHub() {\n  const pathname = usePathname();\n  const [activeTab, setActiveTab] = useState('Pendientes');", hook_injection)

text = text.replace("import { useState } from 'react';", "import { useState, useEffect } from 'react';")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Done Ventas')
