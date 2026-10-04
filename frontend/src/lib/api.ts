export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';

/** Returns the JWT stored by login/page.tsx under key 'token'. */
export const getToken = (): string | null =>
  typeof window !== 'undefined' ? localStorage.getItem('token') : null;

export const getHeaders = () => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

// Guard against repeated redirects when multiple requests fail with 401 concurrently
let isRedirectingToLogin = false;

/** Error de las peticiones rechazadas por sesion vencida (401). */
export class SesionVencidaError extends Error {
  status = 401;

  constructor() {
    super('Tu sesión venció. Inicia sesión nuevamente para continuar.');
    this.name = 'SesionVencidaError';
  }
}

// H23: dentro del dashboard SessionKeeper registra un manejador que abre la ventana de re-ingreso. Un 401 espera a
// que el usuario vuelva a entrar y reintenta UNA vez, en lugar de recargar la pagina y perder lo escrito.
let manejadorReautenticacion: (() => Promise<void>) | null = null;
let reautenticacionEnCurso: Promise<void> | null = null;

/** SessionKeeper registra (al montar) o quita (null, al desmontar) el manejador que abre la ventana de re-ingreso. */
export function registrarReautenticacion(fn: (() => Promise<void>) | null): void {
  manejadorReautenticacion = fn;
}

/**
 * Pide al usuario que vuelva a entrar. Mientras este pendiente, todas las llamadas comparten la misma promesa
 * (una sola ventana). Sin manejador registrado la rechaza con SesionVencidaError.
 */
export function pedirReautenticacion(): Promise<void> {
  if (reautenticacionEnCurso) return reautenticacionEnCurso;
  const manejador = manejadorReautenticacion;
  if (!manejador) return Promise.reject(new SesionVencidaError());
  // El manejador corre en un microtask: la promesa ya esta registrada como pendiente cuando se abre la ventana.
  const promesa = Promise.resolve().then(() => manejador());
  reautenticacionEnCurso = promesa;
  const limpiar = () => {
    if (reautenticacionEnCurso === promesa) reautenticacionEnCurso = null;
  };
  promesa.then(limpiar, limpiar);
  return promesa;
}

export function hayReautenticacionPendiente(): boolean {
  return reautenticacionEnCurso !== null;
}

type ResultadoRenovacion = 'ok' | 'no-autorizado' | 'error';
let renovacionEnCurso: Promise<ResultadoRenovacion> | null = null;

/**
 * Renueva la sesion con POST /auth/refresh (fetch directo, no apiFetch, para no entrar en recursion).
 * Una sola renovacion en curso. 'ok' guarda el token nuevo (o el token ya cambio por otro re-ingreso); 'no-autorizado'
 * (401 o sin token) y 'error' (red, 404 de un backend viejo, 500) no tocan nada: decide SessionKeeper.
 */
export function renovarSesion(): Promise<ResultadoRenovacion> {
  if (renovacionEnCurso) return renovacionEnCurso;
  const promesa = (async (): Promise<ResultadoRenovacion> => {
    const token = getToken();
    if (!token) return 'no-autorizado';
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.status === 401) {
        // Si mientras tanto otra peticion re-ingreso o renovo, el 401 era del token viejo: la sesion sigue.
        const actual = getToken();
        return actual && actual !== token ? 'ok' : 'no-autorizado';
      }
      if (!res.ok) return 'error';
      const data = await res.json();
      if (!data || typeof data.access_token !== 'string' || !data.access_token) return 'error';
      // Si mientras tanto el token cambio (re-ingreso en la ventana), no se pisa con el renovado del viejo.
      if (getToken() === token) localStorage.setItem('token', data.access_token);
      return 'ok';
    } catch {
      return 'error';
    }
  })();
  renovacionEnCurso = promesa;
  promesa.then(() => {
    if (renovacionEnCurso === promesa) renovacionEnCurso = null;
  });
  return promesa;
}

/**
 * Canonical authenticated fetch helper.
 * Returns the parsed JSON response body directly (not the raw Response).
 * All callers in the codebase use the result as JSON (e.g. d?.data, Array.isArray(d)).
 * Always uses the correct auth key `'token'` via getToken().
 *
 * Ante un 401 (H23): si el token ya cambio mientras tanto, reintenta UNA vez con el nuevo; si no, con SessionKeeper
 * montado espera el re-ingreso y reintenta UNA vez con el token nuevo (el 401 garantiza que el servidor no ejecuto
 * nada); un reintento que vuelve a dar 401 lanza SesionVencidaError sin redirigir; fuera del dashboard (sin
 * manejador) borra el token, guarda returnUrl y redirige una sola vez a /login.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
  _reintento = false
): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    if (res.status === 401) {
      if (_reintento) throw new SesionVencidaError();
      // El token cambio mientras la peticion iba en camino (otra peticion re-ingreso o renovo): el 401 era del
      // token viejo. Se reintenta una vez con el nuevo, sin pedir re-ingreso.
      const tokenActual = getToken();
      if (tokenActual && tokenActual !== token) return apiFetch(path, options, true);
      if (manejadorReautenticacion) {
        try {
          await pedirReautenticacion();
        } catch {
          throw new SesionVencidaError();
        }
        return apiFetch(path, options, true);
      }
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        const currentPath = window.location.pathname + window.location.search;
        if (currentPath && !currentPath.startsWith('/login')) {
          sessionStorage.setItem('returnUrl', currentPath);
        }
        if (!isRedirectingToLogin) {
          isRedirectingToLogin = true;
          // Redirect once to login page with reason parameter
          window.location.replace('/login?reason=session-expired');
        }
      }
      throw new SesionVencidaError();
    }

    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.detail || errBody.message || `HTTP ${res.status}`);
  }
  const parsed = await res.json().catch(() => ({}));
  if (parsed && typeof parsed === 'object') {
    try {
      if (!('ok' in parsed)) {
        Object.defineProperty(parsed, 'ok', { value: true, writable: true, configurable: true });
      }
      if (!('status' in parsed)) {
        Object.defineProperty(parsed, 'status', { value: res.status, writable: true, configurable: true });
      }
      if (!('json' in parsed)) {
        Object.defineProperty(parsed, 'json', { value: async () => parsed, writable: true, configurable: true });
      }
    } catch {}
  }
  return parsed;
}


export async function handleResponse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === 'error' || data.status === 'fail') {
    // El status HTTP viaja en el error (p. ej. la ventana de re-ingreso distingue 401 = contraseña incorrecta).
    const error: Error & { status?: number } = new Error(data.message || data.detail || 'Error en la petición a Producción');
    error.status = res.status;
    throw error;
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

export async function forgotPassword(email: string) {
  const res = await fetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  return handleResponse(res);
}

export async function resetPassword(token: string, newPassword: string) {
  const res = await fetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, new_password: newPassword }),
  });

  return handleResponse(res);
}

export async function updateUsername(username: string) {
  const res = await fetch(`${API_URL}/auth/username`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ username }),
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

// ── CALENDAR EVENTS ──────────────────────────────────────────────────────────
export async function getCalendarEvents(month?: number, year?: number) {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (year)  params.set('year', String(year));
  const res = await fetch(`${API_URL}/crm/events?${params}`, { headers: getHeaders() });
  return handleResponse(res);
}

export async function getCustomerCalendarEvents(customerId: number) {
  const res = await fetch(`${API_URL}/crm/events/customer/${customerId}`, { headers: getHeaders() });
  return handleResponse(res);
}

export async function createCalendarEvent(data: any) {
  const res = await fetch(`${API_URL}/crm/events`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) });
  return handleResponse(res);
}

export async function updateCalendarEvent(eventId: number, data: any) {
  const res = await fetch(`${API_URL}/crm/events/${eventId}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) });
  return handleResponse(res);
}

export async function deleteCalendarEvent(eventId: number) {
  const res = await fetch(`${API_URL}/crm/events/${eventId}`, { method: 'DELETE', headers: getHeaders() });
  return handleResponse(res);
}
