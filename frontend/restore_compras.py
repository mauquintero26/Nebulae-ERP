import os
import re

path = 'src/app/dashboard/compras/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'const MOCK_COMPRAS = \[.*?\];', '', text, flags=re.DOTALL)

hook_injection = '''import { getHeaders } from '@/lib/api';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';

export default function ComprasHub() {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState('Pendientes');
  const [comprasData, setComprasData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompras = async () => {
      try {
        const res = await fetch(`${API_URL}/purchases`, { headers: getHeaders() });
        const data = await res.json().catch(() => ({}));
        const realPurchases = data.data || data;
        
        if (Array.isArray(realPurchases)) {
          const mapped = realPurchases.map((p:any) => ({
            id: `PCOM-${p.id}`,
            realId: p.id,
            proveedor: `Proveedor #${p.supplier_id}`,
            date: new Date(p.created_at || Date.now()).toISOString().split('T')[0],
            amount: p.total_amount || 0,
            type: 'Local',
            status: p.status === 'DRAFT' || p.status === 'SENT' ? 'Pendiente' : (p.status === 'IN_TRANSIT' ? 'En Tránsito' : 'Recibido'),
            urgency: 'medium',
            solicitante: `Usuario #${p.user_id || 1}`
          }));
          setComprasData(mapped);
        }
      } catch(e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchCompras();
  }, []);

  const handleReceive = async (id: number) => {
    try {
      await fetch(`${API_URL}/purchases/${id}/receive`, { method: 'POST', headers: getHeaders() });
      toast.success('Inventario Asentado');
      window.location.reload();
    } catch (e) {
      toast.error('Error al asentar');
    }
  }

  const MOCK_COMPRAS = comprasData;
'''

text = text.replace("export default function ComprasHub() {\n  const pathname = usePathname();\n  const [activeTab, setActiveTab] = useState('Pendientes');", hook_injection)
text = text.replace("import { useState } from 'react';", "import { useState, useEffect } from 'react';")

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Done Compras')
