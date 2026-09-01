import os

path_api = 'src/lib/api.ts'
with open(path_api, 'r', encoding='utf-8') as f:
    text = f.read()

new_exports = """
// --- CRM (AGENDA DE CLIENTES) ---
export async function getCustomers() {
  const res = await fetch(`${API_URL}/crm/customers`, { headers: getHeaders() });
  return handleResponse(res);
}

export async function createCustomer(customerData: any) {
  const res = await fetch(`${API_URL}/crm/customers`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(customerData)
  });
  return handleResponse(res);
}
"""

with open(path_api, 'a', encoding='utf-8') as f:
    f.write(new_exports)

print('Updated api.ts with CRM endpoints')
