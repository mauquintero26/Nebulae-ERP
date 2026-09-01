import os

path_api = 'src/lib/api.ts'
with open(path_api, 'r', encoding='utf-8') as f:
    text = f.read()

new_exports = """
// --- SALES (SOLICITUD / COTIZACION / PEDIDO) ---
export async function getSalesOrders() {
  const res = await fetch(`${API_URL}/sales`, { headers: getHeaders() });
  return handleResponse(res);
}

export async function createSalesOrder(orderData: any) {
  const res = await fetch(`${API_URL}/sales`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(orderData)
  });
  return handleResponse(res);
}

export async function invoiceSalesOrder(orderId: number) {
  const res = await fetch(`${API_URL}/sales/${orderId}/invoice`, {
    method: 'POST',
    headers: getHeaders()
  });
  return handleResponse(res);
}

export async function updateSalesOrderStatus(orderId: number, status: string) {
  // Using generic PATCH or updating via full object (mocking for now if not explicitly supported)
  const res = await fetch(`${API_URL}/sales/${orderId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ status })
  });
  return handleResponse(res);
}
"""

with open(path_api, 'a', encoding='utf-8') as f:
    f.write(new_exports)

print('Updated api.ts')
