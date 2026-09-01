import os
import re

path = 'src/app/dashboard/inventario/stock/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'const STOCK_MOCK = \[.*?\];', '', text, flags=re.DOTALL)

hook_injection = '''import { getHeaders } from '@/lib/api';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';

export default function StockPage() {
  const [stockData, setStockData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStock = async () => {
      try {
        const res = await fetch(`${API_URL}/products`, { headers: getHeaders() });
        const data = await res.json().catch(() => ({}));
        const realProducts = data.data || data;
        
        if (Array.isArray(realProducts)) {
          const mapped = realProducts.map((p:any) => ({
            sku: p.internal_ref || `PRD-${p.id}`,
            producto: p.name,
            categoria: `Categoría #${p.category_id || 'N/A'}`,
            central: p.total_stock || 0,
            sucursal1: 0,
            total: p.total_stock || 0,
            minimo: 10,
            estado: (p.total_stock || 0) > 10 ? 'ok' : 'alert'
          }));
          setStockData(mapped);
        }
      } catch(e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchStock();
  }, []);

  const STOCK_MOCK = stockData;
'''

text = text.replace("export default function StockPage() {", hook_injection)
# Aadir useState useEffect
if "import { useState" not in text:
    text = "import { useState, useEffect } from 'react';\n" + text

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Done Stock')
