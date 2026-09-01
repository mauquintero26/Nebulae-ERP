import os

path = 'src/app/dashboard/agenda/page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

profile_state = """
  const [customer360, setCustomer360] = useState<any>(null);

  useEffect(() => {
    if (selectedClient && selectedClient !== 'NEW') {
      const fetchProfile = async () => {
        try {
          const res = await fetch(`${API_URL}/crm/customers/${selectedClient.realId}/profile-360`, { headers: getHeaders() });
          const data = await handleResponse(res);
          setCustomer360(data.data);
        } catch(e) {
          console.error(e);
        }
      };
      fetchProfile();
    } else {
      setCustomer360(null);
    }
  }, [selectedClient]);
"""

if "const [customer360" not in text:
    text = text.replace("const [formData, setFormData] = useState<any>({});", "const [formData, setFormData] = useState<any>({});\n" + profile_state)
    
    # Needs API_URL and getHeaders and handleResponse
    # wait, they are in api.ts?
    if "import { getCustomers" in text:
        text = text.replace("import { getCustomers, createCustomer } from '@/lib/api';", "import { getCustomers, createCustomer, getHeaders, API_URL, handleResponse } from '@/lib/api';")

# Now inject customer360 data into Historial de Compra!
# KPI Total Comprado -> $4.250.000 -> customer360?.ltv
old_ltv = '<h2 className="text-3xl font-black">$4.250.000</h2>'
new_ltv = '<h2 className="text-3xl font-black">${(customer360?.ltv || 0).toLocaleString()}</h2>'
text = text.replace(old_ltv, new_ltv)

old_transactions = '<p className="text-sm opacity-90 mt-2">En 4 transacciones</p>'
new_transactions = '<p className="text-sm opacity-90 mt-2">En {customer360?.active_orders?.length || 0} transacciones</p>'
text = text.replace(old_transactions, new_transactions)

old_table_body = """<tbody className="divide-y divide-slate-100 text-sm">
                    <tr className="hover:bg-slate-50 cursor-pointer">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">#ORD-902</div>
                        <div className="text-slate-500 text-xs">15 Ago 2026</div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">Extractor ElǸctrico Doble (x1)</td>
                      <td className="px-6 py-4 font-bold text-slate-800">$850.000</td>
                      <td className="px-6 py-4"><span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded text-xs">Entregado</span></td>
                    </tr>
                    <tr className="hover:bg-slate-50 cursor-pointer">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">#ORD-850</div>
                        <div className="text-slate-500 text-xs">02 Jul 2026</div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">Coche Paseador Premium (x1)</td>
                      <td className="px-6 py-4 font-bold text-slate-800">$3.400.000</td>
                      <td className="px-6 py-4"><span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded text-xs">Entregado</span></td>
                    </tr>
                  </tbody>"""

new_table_body = """<tbody className="divide-y divide-slate-100 text-sm">
                    {customer360?.active_orders?.length > 0 ? customer360.active_orders.map((order: any) => (
                      <tr key={order.id} className="hover:bg-slate-50 cursor-pointer">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800">#ORD-0{order.id}</div>
                          <div className="text-slate-500 text-xs">{new Date(order.created_at).toLocaleDateString()}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">Varios Artículos</td>
                        <td className="px-6 py-4 font-bold text-slate-800">${order.total.toLocaleString()}</td>
                        <td className="px-6 py-4"><span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded text-xs">{order.status}</span></td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} className="text-center py-8 text-slate-400">No hay historial de compras</td></tr>
                    )}
                  </tbody>"""

text = text.replace(old_table_body, new_table_body)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Injected customer360 profile into UI")
