import os

path_api = 'src/lib/api.ts'
with open(path_api, 'r', encoding='utf-8') as f:
    text_api = f.read()

new_api = """
// --- PURCHASES ---
export async function getPurchases() {
  const res = await fetch(`${API_URL}/purchases`, { headers: getHeaders() });
  return handleResponse(res);
}

export async function receivePurchase(id: number) {
  const res = await fetch(`${API_URL}/purchases/${id}/receive`, {
    method: 'POST',
    headers: getHeaders()
  });
  return handleResponse(res);
}
"""

with open(path_api, 'a', encoding='utf-8') as f:
    f.write(new_api)

print("Added purchases endpoints to api.ts")
