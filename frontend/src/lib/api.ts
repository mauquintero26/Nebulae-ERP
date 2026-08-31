export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';

export const getHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export async function handleResponse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === 'error' || data.status === 'fail') {
    throw new Error(data.message || data.detail || 'Error en la petición a Producción');
  }
  // Standard JSend: { status: 'success', data: { ... } }
  return data.data !== undefined ? data.data : data;
}

export async function login(email: string, password: string) {
  const formData = new URLSearchParams();
  formData.append('username', email); // OAuth2 expects 'username'
  formData.append('password', password);

  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  return handleResponse(res);
}

export async function register(email: string, password: string, fullName: string = '') {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, role: 'admin', full_name: fullName }),
  });

  return handleResponse(res);
}

export async function calculateQuotation(cost_usd: number, discount: number, weight_lb: number, trm: number) {
  const res = await fetch(`${API_URL}/quotations/calculate`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ cost_usd, discount, weight_lb, trm }),
  });

  return handleResponse(res);
}

// --- BRANDS ---
export async function getBrands() {
  const res = await fetch(`${API_URL}/brands`, { headers: getHeaders() });
  return handleResponse(res);
}

export async function createBrand(name: string) {
  const res = await fetch(`${API_URL}/brands`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ name }) });
  return handleResponse(res);
}

// --- CATEGORIES ---
export async function getCategories() {
  const res = await fetch(`${API_URL}/categories`, { headers: getHeaders() });
  return handleResponse(res);
}

export async function createCategory(name: string) {
  const res = await fetch(`${API_URL}/categories`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ name }) });
  return handleResponse(res);
}

// --- ATTRIBUTES ---
export async function getAttributes() {
  const res = await fetch(`${API_URL}/attributes`, { headers: getHeaders() });
  return handleResponse(res);
}

export async function createAttribute(name: string) {
  const res = await fetch(`${API_URL}/attributes`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ name }) });
  return handleResponse(res);
}

export async function getAttributeValues(attributeId: number) {
  const res = await fetch(`${API_URL}/attributes/${attributeId}/values`, { headers: getHeaders() });
  return handleResponse(res);
}

export async function createAttributeValue(attributeId: number, value: string) {
  const res = await fetch(`${API_URL}/attributes/${attributeId}/values`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ value }) });
  return handleResponse(res);
}

// --- PRODUCTS & SKUS ---
export async function getProducts(brandId?: number, categoryId?: number) {
  let url = `${API_URL}/products`;
  const params = new URLSearchParams();
  if (brandId) params.append('brand_id', brandId.toString());
  if (categoryId) params.append('category_id', categoryId.toString());
  if (params.toString()) url += `?${params.toString()}`;
  
  const res = await fetch(url, { headers: getHeaders() });
  return handleResponse(res);
}

export async function createProduct(product: any) {
  const res = await fetch(`${API_URL}/products`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(product) });
  return handleResponse(res);
}

export async function createSku(productId: number, sku: any) {
  const res = await fetch(`${API_URL}/products/${productId}/skus`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(sku) });
  return handleResponse(res);
}

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

export async function updateCustomer(id: number, customerData: any) {
  const res = await fetch(`${API_URL}/crm/customers/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(customerData)
  });
  return handleResponse(res);
}

export async function deleteCustomer(id: number) {
  const res = await fetch(`${API_URL}/crm/customers/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  return handleResponse(res);
}

export async function createClienteSolicitud(customerId: number, solicitudData: any) {
  const res = await fetch(`${API_URL}/crm/customers/${customerId}/solicitudes`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(solicitudData)
  });
  return handleResponse(res);
}

export async function getSolicitudTipos(): Promise<string[]> {
  try {
    const res = await fetch(`${API_URL}/crm/solicitud-tipos`, { headers: getHeaders() });
    const data = await handleResponse(res);
    return Array.isArray(data) ? data : data.data || [];
  } catch {
    // Fallback defaults if backend unavailable
    return [
      'Solicitud de Cotización',
      'Solicitud de Seguimiento',
      'Solicitud de Devolución / Garantía',
      'Solicitud de Soporte Técnico',
    ];
  }
}

// ── CRM PIPELINE — STAGES ────────────────────────────────────────────────────
export async function getPipelineStages() {
  const res = await fetch(`${API_URL}/crm/pipeline-stages`, { headers: getHeaders() });
  return handleResponse(res);
}
export async function createPipelineStage(data: any) {
  const res = await fetch(`${API_URL}/crm/pipeline-stages`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) });
  return handleResponse(res);
}
export async function updatePipelineStage(id: number, data: any) {
  const res = await fetch(`${API_URL}/crm/pipeline-stages/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) });
  return handleResponse(res);
}
export async function deletePipelineStage(id: number) {
  const res = await fetch(`${API_URL}/crm/pipeline-stages/${id}`, { method: 'DELETE', headers: getHeaders() });
  return handleResponse(res);
}

// ── CRM PIPELINE — LEADS ────────────────────────────────────────────────────
export async function getLeads() {
  const res = await fetch(`${API_URL}/crm/leads`, { headers: getHeaders() });
  return handleResponse(res);
}
export async function createLead(data: any) {
  const res = await fetch(`${API_URL}/crm/leads`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) });
  return handleResponse(res);
}
export async function updateLeadStage(leadId: number, pipelineStageId: number) {
  const res = await fetch(`${API_URL}/crm/leads/${leadId}/stage`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ pipeline_stage_id: pipelineStageId }) });
  return handleResponse(res);
}
export async function updateLead(leadId: number, data: any) {
  const res = await fetch(`${API_URL}/crm/leads/${leadId}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(data) });
  return handleResponse(res);
}
export async function deleteLead(leadId: number) {
  const res = await fetch(`${API_URL}/crm/leads/${leadId}`, { method: 'DELETE', headers: getHeaders() });
  return handleResponse(res);
}
