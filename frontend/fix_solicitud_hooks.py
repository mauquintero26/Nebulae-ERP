import os

path = 'src/app/dashboard/ventas/solicitud/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

hook_injection = '''import { getSalesOrders, updateSalesOrderStatus } from '@/lib/api';
import toast from 'react-hot-toast';

export default function SolicitudesClientePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState('list');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
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

text = text.replace("export default function SolicitudesClientePage() {\n  const [searchTerm, setSearchTerm] = useState('');\n  const [activeView, setActiveView] = useState('list'); // list, kanban, calendar, analysis\n  const [selectedRows, setSelectedRows] = useState<string[]>([]);", hook_injection)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('Done')
