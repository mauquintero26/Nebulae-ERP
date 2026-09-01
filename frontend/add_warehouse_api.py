import os

path = 'src/lib/api.ts'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

new_api = """
// --- WAREHOUSES ---
export async function getWarehouses() {
  const res = await fetch(`${API_URL}/catalog/warehouses`, { headers: getHeaders() });
  return handleResponse(res);
}

export async function createWarehouse(name: string, location: string = '') {
  const res = await fetch(`${API_URL}/catalog/warehouses`, { 
    method: 'POST', 
    headers: getHeaders(), 
    body: JSON.stringify({ name, location }) 
  });
  return handleResponse(res);
}
"""

with open(path, 'a', encoding='utf-8') as f:
    f.write(new_api)

print("Added warehouse endpoints to api.ts")
