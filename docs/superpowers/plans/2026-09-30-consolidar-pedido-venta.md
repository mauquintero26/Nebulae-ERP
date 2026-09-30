# Consolidar Pedido de Venta y Cerrar Ventas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar la auditoría funcional de Ventas: eliminar el último duplicado de página (Pedido de Venta) portando su funcionalidad real a la página canónica, y confirmar el estado real de Exportar Día/Rango/Proyecciones — dejando Ventas en el mismo nivel de terminación que Cotización tras la sesión anterior.

**Architecture:** Mismo método que la consolidación de Cotización: `venta/[id]/page.tsx` pasa a ser la única página de detalle (ya tiene stepper, Actividad real, contacto, PXP); se le porta toda la funcionalidad real que hoy solo vive en el panel lateral de `venta-client.tsx` (decisión de compra directa/pool, cancelación, edición, chatter real). Luego `venta-client.tsx` retira ese panel duplicado — igual que ya se hizo con `cotizacion-client.tsx` — y su ruta `?id=` redirige a la canónica.

**Tech Stack:** Next.js/TypeScript (frontend puro — este plan no toca backend).

**Spec:** `docs/superpowers/specs/2026-09-30-cadena-ventas-compras-inventario-design.md` (Componente 1)

## Global Constraints

- **Sin arnés de pruebas de frontend:** este proyecto no tiene ningún archivo `*.test.tsx` fuera de `node_modules` (confirmado). Las tareas de este plan son 100% frontend, así que cada "prueba" es una verificación manual en el navegador con pasos exactos (URL, clics, resultado esperado) — no se inventa infraestructura de testing nueva para esto.
- Login QA para verificar: `admin@nebulae-qa.com` / `PruebaLocal2026!` en `http://localhost:5100/login`. La sesión expira seguido — si aparece "Tu sesión venció", reintentar el login antes de continuar.
- Servidores: backend puerto 5000 (`nebulae-mirror-backend`), frontend puerto 5100 (`nebulae-mirror-frontend`), vía `preview_start`.
- Cada commit termina con `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Nunca usar `git commit --amend`.
- Todos los cambios son en `C:\Users\jmqui\Nebulae_ERP_Work\Mirror` (Mirror), nunca en el repo primario.

---

### Task 1: Portar la decisión de compra (PEC directo / Lista de Compras) a la página canónica

**Files:**
- Modify: `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`
- Modify: `frontend/src/app/dashboard/ventas/venta/venta-client.tsx:93-124` (exportar `NewSupplierModal`)

**Interfaces:**
- Consumes: `POST /compras/proveedores/search?q=...` (ya existe), `POST /compras/pedidos` (crea PEC), `POST /compras/lista-compras` (agrega a pool) — los tres ya están en uso real en `venta-client.tsx`, ningún endpoint nuevo.
- Produces: nada que otra tarea de este plan consuma directamente.

- [ ] **Step 1: Exportar `NewSupplierModal` desde `venta-client.tsx`**

En `frontend/src/app/dashboard/ventas/venta/venta-client.tsx:93`, cambiar:
```tsx
function NewSupplierModal({onSave, onClose}: {onSave:(s:any)=>void; onClose:()=>void}) {
```
por:
```tsx
export function NewSupplierModal({onSave, onClose}: {onSave:(s:any)=>void; onClose:()=>void}) {
```

- [ ] **Step 2: Verificar manualmente que no rompió nada**

`npm --prefix frontend run build` debe compilar sin error de TypeScript (exportar una función no cambia su uso local).

- [ ] **Step 3: Agregar imports y estado a `venta/[id]/page.tsx`**

En `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`, el import actual de lucide-react es:
```tsx
import {
  ArrowLeft, DollarSign, MessageCircle, Phone, Mail, CheckCircle2, Circle,
  ShoppingCart, RefreshCw, AlertCircle, ListChecks, ExternalLink, Send,
  Activity, FileText,
} from 'lucide-react';
```
Reemplazar por (agrega `X`, `Edit2`, `Save`):
```tsx
import {
  ArrowLeft, DollarSign, MessageCircle, Phone, Mail, CheckCircle2, Circle,
  ShoppingCart, RefreshCw, AlertCircle, ListChecks, ExternalLink, Send,
  Activity, FileText, X, Edit2, Save,
} from 'lucide-react';
```

Agregar el import de `Modal` (ya importa `Button`):
```tsx
import { Button, Modal } from '@/components/ui';
```

Agregar el import de `NewSupplierModal`:
```tsx
import { NewSupplierModal } from '../venta-client';
```

Agregar este bloque de estado justo después de `const [sendingNota, setSendingNota] = useState(false);`:
```tsx
  const [showPecModal, setShowPecModal] = useState(false);
  const [pecSaving, setPecSaving] = useState(false);
  const [pecForm, setPecForm] = useState({ dias_entrega: 15, modalidad_pago: 'Contado', notas: '' });
  const [supplierSearch, setSupplierSearch] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [listaSaving, setListaSaving] = useState(false);
  const supplierTimer = useRef<any>(null);
```

- [ ] **Step 4: Portar los handlers**

Agregar después de `handleRegistrarNota` (antes del `if (loading)` de la función):
```tsx
  function onSupplierSearch(q: string) {
    setSupplierSearch(q); setSelectedSupplier(null);
    if (supplierTimer.current) clearTimeout(supplierTimer.current);
    if (!q.trim()) { setSuppliers([]); return; }
    supplierTimer.current = setTimeout(async () => {
      const d = await apiFetch(`/compras/proveedores/search?q=${encodeURIComponent(q)}`).catch(() => ({ data: [] }));
      const arr = Array.isArray(d) ? d : (d?.data ?? []);
      setSuppliers(arr);
      if (arr.length === 0) setShowNewSupplier(true);
    }, 300);
  }

  async function handleCrearPEC() {
    if (!pedido) return;
    if (!selectedSupplier) { alert('Selecciona un proveedor (o crea uno nuevo) antes de crear el PEC'); return; }
    setPecSaving(true);
    try {
      const productosPec = (pedido.productos || []).map((p: any) => {
        const qty = Number(p.qty || p.cantidad || 1);
        const unitPrice = Number(p.unit_price_cop ?? p.precio_unitario ?? (p.total_cop ? p.total_cop / qty : 0));
        return {
          producto_nombre: p.product_name || p.nombre || p.descripcion || p.producto_nombre || 'Producto',
          qty,
          unit_price_cop: unitPrice,
        };
      });
      const totalPec = productosPec.reduce((s: number, p: any) => s + p.qty * p.unit_price_cop, 0);
      const pec = await apiFetch('/compras/pedidos', {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: selectedSupplier.id,
          supplier_name: selectedSupplier.name,
          ven_id: pedido.id,
          ven_numero: pedido.numero,
          dias_entrega: pecForm.dias_entrega,
          modalidad_pago: pecForm.modalidad_pago,
          notas: pecForm.notas,
          productos: productosPec,
          subtotal_cop: totalPec,
          total_cop: totalPec,
          created_by: currentUser,
        }),
      });
      const pecObj = pec?.data ?? pec;
      setShowPecModal(false);
      await loadPedido();
      alert(`PEC ${pecObj.numero || ''} creado y vinculado al pedido`);
    } catch (err: any) {
      alert('Error al crear PEC: ' + err.message);
    }
    setPecSaving(false);
  }

  async function handleAgregarLista() {
    if (!pedido) return;
    setListaSaving(true);
    try {
      await apiFetch('/compras/lista-compras', {
        method: 'POST',
        body: JSON.stringify({
          pven_id: pedido.id,
          pven_numero: pedido.numero,
          productos: (pedido.productos || []).map((p: any) => ({
            producto_nombre: p.product_name || p.nombre || p.descripcion || p.producto_nombre || 'Sin nombre',
            qty: p.qty || p.cantidad || 1,
          })),
          notas: `PVEN: ${pedido.numero} — Cliente: ${pedido.customer_name || ''}`,
          created_by: currentUser,
        }),
      });
      await loadPedido();
    } catch (err: any) {
      alert('Error al agregar a la lista de compras: ' + err.message);
    }
    setListaSaving(false);
  }
```

- [ ] **Step 5: Reemplazar el bloque "Pendiente de Compra" de solo-lectura por la versión interactiva**

Ubicar en el mismo archivo (dentro del `estadoActual === 'PENDIENTE_COMPRA'` del bloque "Compra vinculada"):
```tsx
            ) : estadoActual === 'PENDIENTE_COMPRA' && (
              <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-5">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart size={18} className="text-orange-600" />
                  <h3 className="text-sm font-black text-orange-800 uppercase tracking-wide">Pendiente de Compra</h3>
                </div>
                <p className="text-xs text-orange-600 mb-4">
                  Este pedido requiere la compra de {productos.length} producto(s). Gestiona la compra desde el panel de Pedidos de Venta.
                </p>
                <Link href={`/dashboard/ventas/venta?id=${pedido.id}`} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-orange-300 rounded-xl text-sm font-black text-orange-800 hover:bg-orange-100 transition-colors">
                  <ListChecks size={16} /> Ir a Crear Pedido de Compra / Lista de Compras
                </Link>
              </div>
            )}
```
Reemplazar por:
```tsx
            ) : estadoActual === 'PENDIENTE_COMPRA' && (
              <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-5">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart size={18} className="text-orange-600" />
                  <h3 className="text-sm font-black text-orange-800 uppercase tracking-wide">Pendiente de Compra</h3>
                </div>
                <p className="text-xs text-orange-600 mb-4">
                  Este pedido requiere la compra de {productos.length} producto(s). Selecciona cómo proceder:
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setSupplierSearch(''); setSelectedSupplier(null); setSuppliers([]);
                      setPecForm({ dias_entrega: 15, modalidad_pago: 'Contado', notas: `Pedido de compra para PVEN ${pedido.numero} — ${pedido.customer_name || ''}` });
                      setShowPecModal(true);
                    }}
                    className="flex flex-col items-start gap-2 p-4 bg-white border-2 border-orange-300 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-all text-left shadow-sm">
                    <div className="bg-purple-100 text-purple-600 p-2 rounded-xl"><ShoppingCart size={18} /></div>
                    <div>
                      <p className="text-sm font-black text-slate-900">Crear Pedido de Compra</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-tight">Genera un PEC vinculado directamente a este PVEN</p>
                    </div>
                  </button>
                  <button
                    onClick={handleAgregarLista}
                    disabled={listaSaving}
                    className="flex flex-col items-start gap-2 p-4 bg-white border-2 border-orange-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left shadow-sm disabled:opacity-50">
                    <div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                      {listaSaving ? <RefreshCw size={18} className="animate-spin" /> : <ListChecks size={18} />}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">Agregar a Lista de Compras</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-tight">Envía los productos a la lista pendiente de comprar (pool)</p>
                    </div>
                  </button>
                </div>
              </div>
            )}
```
Nota: esto elimina el import ahora-innecesario de `Link` en esa sección solo si `Link` no se usa en otra parte del archivo — `Link` sigue en uso (Origen, Ver Pedido de Compra, etc.), no se toca el import.

- [ ] **Step 6: Agregar el Modal de creación de PEC y el NewSupplierModal al render**

Justo antes del `</div>` final del componente (donde hoy solo está `{showChannelModal && ...}` — nota: Pedido de Venta no tiene `showChannelModal`, ese es de Cotización; agregar antes del cierre del `return (...)`, después del `</div>` que cierra el layout principal):
```tsx
      {showPecModal && pedido && (
        <Modal title="Crear Pedido de Compra" icon={ShoppingCart} color="purple"
          subtitle={`Vinculado a ${pedido.numero} — ${pedido.customer_name}`}
          onClose={() => setShowPecModal(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowPecModal(false)}>Cancelar</Button>
              <Button color="purple" icon={ShoppingCart} loading={pecSaving} onClick={handleCrearPEC}>Crear PEC</Button>
            </>
          )}>
          {(pedido.productos || []).length > 0 && (
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos a comprar</p>
              <div className="space-y-1">
                {(pedido.productos || []).slice(0, 5).map((p: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs text-slate-700">
                    <span className="truncate max-w-[260px]">{p.product_name || p.descripcion || p.producto_nombre}</span>
                    <span className="font-bold ml-2 shrink-0">× {p.qty ?? p.cantidad}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Proveedor</label>
            <input value={supplierSearch} onChange={e => onSupplierSearch(e.target.value)}
              placeholder="Buscar proveedor..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200" />
            {suppliers.length > 0 && (
              <div className="border border-slate-200 rounded-xl shadow-lg mt-1 max-h-36 overflow-y-auto z-10">
                {suppliers.map((s: any) => (
                  <button key={s.id} onClick={() => { setSelectedSupplier(s); setSupplierSearch(s.name); setSuppliers([]); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm font-medium border-b last:border-0">
                    {s.name} {s.city && <span className="text-slate-400">· {s.city}</span>}
                  </button>
                ))}
              </div>
            )}
            {selectedSupplier && (
              <p className="text-xs text-purple-700 font-bold mt-1 flex items-center gap-1">
                <CheckCircle2 size={12} /> {selectedSupplier.name} seleccionado
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Días Entrega Estimada</label>
              <input type="number" min="1" value={pecForm.dias_entrega} onChange={e => setPecForm(f => ({ ...f, dias_entrega: Number(e.target.value) }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Modalidad de Pago</label>
              <select value={pecForm.modalidad_pago} onChange={e => setPecForm(f => ({ ...f, modalidad_pago: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200">
                {['Contado', 'Credito 30d', 'Credito 60d', 'Adelanto 50%', 'Contra entrega'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Notas</label>
            <textarea value={pecForm.notas} onChange={e => setPecForm(f => ({ ...f, notas: e.target.value }))}
              rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-purple-200" />
          </div>
        </Modal>
      )}
      {showNewSupplier && (
        <NewSupplierModal
          onSave={(s) => { setSelectedSupplier(s); setSupplierSearch(s.name); setSuppliers([]); setShowNewSupplier(false); }}
          onClose={() => setShowNewSupplier(false)}
        />
      )}
```

- [ ] **Step 7: Verificar manualmente en el navegador**

1. `preview_start` backend y frontend, login QA.
2. Buscar en `/dashboard/ventas/venta` (lista, sigue funcionando por ahora) un pedido en estado `PENDIENTE_COMPRA` sin `pec_numero` ni `lista_compras_items` (o crear uno nuevo confirmando una cotización sin stock).
3. Navegar directo a `/dashboard/ventas/venta/{id}` de ese pedido.
4. Verificar que aparecen los dos botones "Crear Pedido de Compra" y "Agregar a Lista de Compras" (antes solo había un link that redirigía a la página vieja).
5. Click "Agregar a Lista de Compras" → verificar que la página recarga sus datos y ahora muestra el bloque "Agregado a Lista de Compras" con el producto listado.
6. En otro pedido pendiente de compra, click "Crear Pedido de Compra" → buscar un proveedor real, llenar días/modalidad, click "Crear PEC" → verificar que el bloque cambia a "Pedido de Compra Creado" con un link a el PEC, y que ese PEC existe de verdad en `/dashboard/compras/pedidos`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/dashboard/ventas/venta/venta-client.tsx frontend/src/app/dashboard/ventas/venta/\[id\]/page.tsx
git commit -m "feat(ventas): portar decision PEC directo / Lista de Compras a Pedido de Venta canonico

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Portar cancelación de pedido con motivo

**Files:**
- Modify: `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`

**Interfaces:**
- Consumes: `PATCH /ventas/pedidos/{id}` con `{estado: 'CANCELADO', cancellation_reason, cancellation_authorized_by, cancelled_at}` — mismo endpoint que ya usa `handleRegistrarNota`, ya existe.

- [ ] **Step 1: Agregar estado**

Después del bloque de estado agregado en la Task 1:
```tsx
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelRazon, setCancelRazon] = useState('');
  const [cancelling, setCancelling] = useState(false);
```

- [ ] **Step 2: Agregar el handler**

```tsx
  async function handleCancelarPedido() {
    if (!pedido) return;
    if (cancelRazon.trim().length < 5) { alert('La razón de cancelación debe tener al menos 5 caracteres'); return; }
    setCancelling(true);
    try {
      await apiFetch(`/ventas/pedidos/${pedido.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          estado: 'CANCELADO',
          cancellation_reason: cancelRazon.trim(),
          cancellation_authorized_by: currentUser,
          cancelled_at: new Date().toISOString(),
        }),
      });
      setShowCancelModal(false);
      setCancelRazon('');
      await loadPedido();
    } catch (err: any) {
      alert('Error al cancelar: ' + err.message);
    }
    setCancelling(false);
  }
```

- [ ] **Step 3: Agregar el botón "Cancelar Pedido" junto a "Crear PXP" en el header**

Ubicar el bloque del header (dentro de `<div className="flex items-center gap-3">`, después del botón "Crear PXP" / badge de PXP):
```tsx
          {pedido?.pxp_numero && (
            <span className="flex items-center gap-1.5 px-5 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-sm">
              <CheckCircle2 size={16} /> PXP: {pedido.pxp_numero}
            </span>
          )}
        </div>
      </div>
```
Insertar un botón de cancelar antes del `</div>` que cierra ese grupo (solo si el pedido no está ya en un estado terminal):
```tsx
          {pedido?.pxp_numero && (
            <span className="flex items-center gap-1.5 px-5 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-sm">
              <CheckCircle2 size={16} /> PXP: {pedido.pxp_numero}
            </span>
          )}
          {!['ENTREGADO', 'FACTURADO', 'CANCELADO'].includes(estadoActual) && (
            <Button variant="danger" icon={X} onClick={() => setShowCancelModal(true)}>Cancelar Pedido</Button>
          )}
        </div>
      </div>
```

- [ ] **Step 4: Agregar el Modal de cancelación al render**

Junto a los otros modales agregados en la Task 1 (Step 6):
```tsx
      {showCancelModal && (
        <Modal title="Cancelar Pedido de Venta" icon={AlertCircle} color="red" maxWidth="md"
          onClose={() => setShowCancelModal(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowCancelModal(false)}>Volver</Button>
              <Button variant="danger" icon={X} loading={cancelling} onClick={handleCancelarPedido}>Confirmar Cancelación</Button>
            </>
          )}>
          <p className="text-sm text-slate-500">Esta acción marca el pedido como <strong>CANCELADO</strong>. Indica el motivo (mínimo 5 caracteres).</p>
          <textarea value={cancelRazon} onChange={e => setCancelRazon(e.target.value)} rows={3} autoFocus
            placeholder="Ej: Cliente desistió de la compra, error en el pedido, etc."
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-200 resize-none" />
        </Modal>
      )}
```

- [ ] **Step 5: Verificar manualmente en el navegador**

1. Abrir un pedido en estado distinto de ENTREGADO/FACTURADO/CANCELADO.
2. Click "Cancelar Pedido" → escribir menos de 5 caracteres → click "Confirmar" → debe alertar el mínimo y no cerrar el modal.
3. Escribir un motivo válido → confirmar → el badge de estado debe pasar a "Cancelado" y el botón "Cancelar Pedido" debe desaparecer.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/dashboard/ventas/venta/\[id\]/page.tsx
git commit -m "feat(ventas): portar cancelacion de Pedido de Venta con motivo a la pagina canonica

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Portar modo edición (estado manual, notas, dirección, fecha, PEC manual)

**Files:**
- Modify: `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`

**Interfaces:**
- Consumes: `PATCH /ventas/pedidos/{id}` con campos de edición libre — mismo endpoint ya usado en las tareas anteriores.

- [ ] **Step 1: Agregar estado**

```tsx
  const [isEditMode, setIsEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
```

- [ ] **Step 2: Inicializar `editForm` cuando carga el pedido**

En `loadPedido` (dentro del `try`, después de `setPedido(raw?.data ?? raw)`), agregar:
```tsx
      const d = raw?.data ?? raw;
      setPedido(d);
      setEditForm({
        estado: d.estado,
        notas: d.notas || '',
        fecha_entrega_estimada: d.fecha_entrega_estimada ? d.fecha_entrega_estimada.split('T')[0] : '',
        direccion_entrega: d.direccion_entrega || '',
        pec_numero: d.pec_numero || '',
      });
```
(reemplaza la línea `setPedido(raw?.data ?? raw);` existente por las líneas de arriba).

- [ ] **Step 3: Agregar el handler de guardado**

```tsx
  async function handleSaveEdit() {
    if (!pedido) return;
    try {
      await apiFetch(`/ventas/pedidos/${pedido.id}`, { method: 'PATCH', body: JSON.stringify(editForm) });
      setIsEditMode(false);
      await loadPedido();
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    }
  }
```

- [ ] **Step 4: Agregar el botón de editar en el header, y la vista de edición en la sección "Entrega Estimada"**

Botón de editar, junto al botón de cancelar agregado en la Task 2:
```tsx
          <button onClick={() => setIsEditMode(!isEditMode)}
            className={`p-2.5 rounded-xl border transition-colors ${isEditMode ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
            <Edit2 size={18} />
          </button>
```

Reemplazar el bloque actual (solo-lectura) de "Entrega Estimada":
```tsx
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Entrega Estimada</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700">
                  {fDate(pedido?.fecha_entrega_estimada)}
                </div>
              </div>
```
por una versión que alterna entre lectura y edición:
```tsx
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Entrega Estimada</label>
                {isEditMode ? (
                  <input type="date" value={editForm.fecha_entrega_estimada} onChange={e => setEditForm((f: any) => ({ ...f, fecha_entrega_estimada: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-200" />
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700">
                    {fDate(pedido?.fecha_entrega_estimada)}
                  </div>
                )}
              </div>
```

Agregar, justo debajo del grid de Cliente/Origen/Entrega, un bloque de edición para dirección + notas + PEC manual + guardar (solo visible en modo edición):
```tsx
            {isEditMode && (
              <div className="grid grid-cols-2 gap-6 mb-10">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Dirección de Entrega</label>
                  <input type="text" value={editForm.direccion_entrega} onChange={e => setEditForm((f: any) => ({ ...f, direccion_entrega: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">PEC Número (manual)</label>
                  <input type="text" value={editForm.pec_numero} onChange={e => setEditForm((f: any) => ({ ...f, pec_numero: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Notas</label>
                  <textarea value={editForm.notas} onChange={e => setEditForm((f: any) => ({ ...f, notas: e.target.value }))} rows={3}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div className="col-span-2 flex justify-end">
                  <Button color="indigo" icon={Save} onClick={handleSaveEdit}>Guardar Cambios</Button>
                </div>
              </div>
            )}
```

- [ ] **Step 5: Verificar manualmente en el navegador**

1. Abrir un pedido cualquiera, click el ícono de editar.
2. Cambiar la fecha de entrega y agregar una nota, click "Guardar Cambios".
3. Verificar que el modo edición se cierra y los nuevos valores se ven reflejados en la vista de lectura.
4. Recargar la página completa (F5 / navigate) y confirmar que los cambios persistieron (vinieron del backend, no solo del estado local).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/dashboard/ventas/venta/\[id\]/page.tsx
git commit -m "feat(ventas): portar modo edicion de Pedido de Venta a la pagina canonica

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Unificar Chatter + IA con el mismo patrón ya estandarizado en Cotización

**Files:**
- Modify: `frontend/src/app/dashboard/ventas/venta/[id]/page.tsx`

**Interfaces:**
- Consumes: `POST /ventas/pedidos/{id}/actividad` con `{action:'CHATTER', description, user_name}` — mismo endpoint que ya usa `handleRegistrarNota` con `action:'UPDATED'`.

**Contexto:** hoy esta página tiene un solo compose box ("Registrar Nota") sin botones de contacto ni distinción de Chatter, mientras que Cotización (consolidada la sesión anterior) ya tiene el patrón estándar: WhatsApp/Llamar/Email arriba del compose box, y el mensaje se registra como actividad tipo `CHATTER`. Esta tarea lleva Pedido de Venta al mismo patrón — **no** se porta el panel `IAPanelVenta` de `venta-client.tsx` tal cual (depende de un endpoint `/ia-analisis` que no se confirmó que exista y ya tiene su propio fallback local ad-hoc); en su lugar se agrega una pestaña "IA" idéntica en forma a la que ya existe en Cotización (resumen generado en el cliente, sin depender de un endpoint), para que las tres vistas (Solicitud, Cotización, Pedido de Venta) sean indistinguibles en este bloque.

- [ ] **Step 1: Agregar estado**

```tsx
  const [panelTab, setPanelTab] = useState<'actividad' | 'ia'>('actividad');
  const [iaAnalisis, setIaAnalisis] = useState('');
```

- [ ] **Step 2: Reemplazar el bloque completo "BLOQUE 2: Actividades" (panel derecho)**

Ubicar el bloque actual completo (desde el comentario `{/* BLOQUE 2: Actividades */}` hasta el `</div>` que lo cierra, justo antes del `</div>` que cierra el layout de split-pane):
```tsx
        {/* BLOQUE 2: Actividades */}
        <div style={{ width: rightWidth }} className="bg-white flex flex-col overflow-hidden shrink-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">
          <div className="p-5 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10 shrink-0">
            <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg">
              <Activity className="text-slate-400" size={20} /> Actividades
            </h3>
          </div>

          <div className="p-5 border-b border-slate-200 bg-slate-50 z-10 shrink-0">
            <div className="relative">
              <textarea rows={3} value={nota} onChange={e => setNota(e.target.value)}
                placeholder="Registra una nota interna..."
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none transition-colors shadow-sm" />
              <button onClick={handleRegistrarNota} disabled={sendingNota || !nota.trim()}
                className="absolute bottom-3 right-3 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg shadow-sm transition-colors disabled:opacity-50">
                <Send size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Linea Temporal</h4>
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {[...actividades].reverse().map((a: any, i: number) => (
                <div key={i} className="relative flex items-start gap-4 group animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-white shadow-sm shrink-0 z-10"
                    style={{ color: ACTIVITY_STYLE[a.action] || '#94a3b8' }}>
                    <Activity size={14} />
                  </div>
                  <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-800 text-sm">{a.description || a.action}</span>
                      <span className="text-[10px] font-bold text-slate-400">{fDate(a.created_at)}</span>
                    </div>
                    <p className="text-xs font-medium text-slate-500">{a.user_name || 'Sistema'}</p>
                  </div>
                </div>
              ))}
            </div>
            {actividades.length === 0 && <p className="text-xs text-slate-400 italic text-center py-8">Sin actividad registrada todavia.</p>}
          </div>
        </div>
```
Reemplazar por:
```tsx
        {/* BLOQUE 2: Actividades */}
        <div style={{ width: rightWidth }} className="bg-white flex flex-col overflow-hidden shrink-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">
          <div className="p-5 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10 shrink-0">
            <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg">
              <Activity className="text-slate-400" size={20} /> Actividades
            </h3>
          </div>

          <div className="flex border-b border-slate-200 bg-slate-50/50 shrink-0">
            <button onClick={() => setPanelTab('actividad')} className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors ${panelTab === 'actividad' ? 'text-indigo-700 border-indigo-600 bg-white' : 'text-slate-500 border-transparent hover:text-slate-700'}`}>Actividad</button>
            <button onClick={() => setPanelTab('ia')} className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors ${panelTab === 'ia' ? 'text-indigo-700 border-indigo-600 bg-white' : 'text-slate-500 border-transparent hover:text-slate-700'}`}>IA</button>
          </div>

          {panelTab === 'ia' && (
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50/30 space-y-4">
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl p-4 border border-indigo-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-indigo-600 rounded-lg px-2 py-1 text-white font-black text-xs">AI</div>
                    <div><p className="font-extrabold text-indigo-900 text-sm">Análisis de Pedido</p><p className="text-[10px] text-indigo-500">Nebulae Analytics</p></div>
                  </div>
                  <Button size="sm" color="indigo" disabled={!pedido} onClick={() => {
                    const prods = pedido?.productos || [];
                    const txt = `ANÁLISIS DE PEDIDO\n\nEstado: ${estadoCfg.label}\nTotal: ${fCOP(pedido?.total_cop)}\nAnticipo: ${fCOP(pedido?.anticipo_cop)}\nSaldo: ${fCOP(pedido?.saldo_cop)}\n\nProductos: ${prods.length} línea(s)\n${prods.map((p: any) => `- ${p.product_name || p.descripcion || 'Producto'} x${p.qty ?? p.cantidad ?? 0}`).join('\n')}\n\nActividad: ${actividades.length} evento(s) registrados.`;
                    setIaAnalisis(txt);
                  }}>Analizar</Button>
                </div>
                {!iaAnalisis && <p className="text-xs text-indigo-700 italic text-center py-3">Genera un análisis con los montos, productos y estado del pedido.</p>}
                {iaAnalisis && <pre className="text-xs text-slate-800 whitespace-pre-wrap font-medium leading-relaxed bg-white/70 rounded-xl p-3 border border-indigo-100 mt-2">{iaAnalisis}</pre>}
              </div>
            </div>
          )}

          {panelTab === 'actividad' && (
            <>
              <div className="p-5 border-b border-slate-200 bg-slate-50 z-10 shrink-0 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => { if (pedido?.customer_phone) window.open(`https://wa.me/57${pedido.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(nota || `Hola, somos Nebulae. Su pedido ${pedido.numero}...`)}`, '_blank'); }}
                    disabled={!pedido?.customer_phone}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-[#25D366] text-white rounded-xl text-xs font-bold hover:bg-[#1ebe5d] transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
                    <MessageCircle size={14} /> WhatsApp
                  </button>
                  <a href={pedido?.customer_phone ? `tel:${pedido.customer_phone}` : undefined}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-colors ${pedido?.customer_phone ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-50 text-slate-300 pointer-events-none'}`}>
                    <Phone size={14} /> Llamar
                  </a>
                  <a href={pedido?.customer_email ? `mailto:${pedido.customer_email}` : undefined}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-colors ${pedido?.customer_email ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-50 text-slate-300 pointer-events-none'}`}>
                    <Mail size={14} /> Email
                  </a>
                </div>
                <div className="relative">
                  <textarea rows={3} value={nota} onChange={e => setNota(e.target.value)}
                    placeholder="Escribe un mensaje o registra una nota interna..."
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none transition-colors shadow-sm" />
                  <button onClick={handleRegistrarNota} disabled={sendingNota || !nota.trim()}
                    className="absolute bottom-3 right-3 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg shadow-sm transition-colors disabled:opacity-50">
                    {sendingNota ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Linea Temporal</h4>
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                  {[...actividades].reverse().map((a: any, i: number) => (
                    <div key={i} className="relative flex items-start gap-4 group animate-in fade-in slide-in-from-bottom-2">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-white shadow-sm shrink-0 z-10"
                        style={{ color: ACTIVITY_STYLE[a.action] || '#94a3b8' }}>
                        <Activity size={14} />
                      </div>
                      <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-slate-800 text-sm">{a.description || a.action}</span>
                          <span className="text-[10px] font-bold text-slate-400">{fDate(a.created_at)}</span>
                        </div>
                        <p className="text-xs font-medium text-slate-500">{a.user_name || 'Sistema'}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {actividades.length === 0 && <p className="text-xs text-slate-400 italic text-center py-8">Sin actividad registrada todavia.</p>}
              </div>
            </>
          )}
        </div>
```
`handleRegistrarNota` no cambia (ya llama `/actividad` con `action:'UPDATED'`). `ACTIVITY_STYLE`, `actividades`, `estadoCfg`, `fCOP`, `fDate`, `rightWidth` ya existen en el archivo, sin cambios.

- [ ] **Step 3: Eliminar el bloque "Contactar Cliente" del cuerpo principal (ahora vive en el Chatter)**

Eliminar por completo esta sección (ya no hace falta, el contacto vive en el panel derecho):
```tsx
            {/* Contactar cliente */}
            <div>
              <p className="text-xs font-black text-slate-400 uppercase mb-3">Contactar Cliente</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => { if (pedido?.customer_phone) window.open(`https://wa.me/57${pedido.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent('Hola, somos Nebulae. Su pedido ' + pedido.numero + '...')}`, '_blank'); }}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 bg-[#25D366] text-white rounded-xl text-sm font-bold hover:bg-[#1ebe5d] shadow-sm">
                  <MessageCircle size={14} /> WhatsApp
                </button>
                <a href={pedido?.customer_phone ? `tel:${pedido.customer_phone}` : undefined} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200">
                  <Phone size={14} /> Llamar
                </a>
                <a href={pedido?.customer_email ? `mailto:${pedido.customer_email}` : undefined} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200">
                  <Mail size={14} /> Email
                </a>
              </div>
            </div>
```

- [ ] **Step 4: Verificar manualmente en el navegador**

1. Abrir un pedido con `customer_phone` real.
2. En el panel derecho, confirmar que aparecen WhatsApp/Llamar/Email arriba del compose box, y que WhatsApp abre `wa.me` con el número correcto.
3. Escribir una nota y enviarla → confirmar que aparece en la Línea Temporal (ya funcionaba, no debe regresionar).
4. Click en la pestaña "IA" → click "Analizar" → confirmar que genera un resumen de texto con los datos reales del pedido.
5. Confirmar que la sección "Contactar Cliente" ya no aparece duplicada en el cuerpo principal.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/ventas/venta/\[id\]/page.tsx
git commit -m "feat(ventas): estandarizar Chatter + IA de Pedido de Venta igual que Cotizacion

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Retirar el panel duplicado de `venta-client.tsx`

**Files:**
- Modify: `frontend/src/app/dashboard/ventas/venta/venta-client.tsx`

**Interfaces:**
- Consumes: ninguno nuevo.
- Produces: la ruta `/dashboard/ventas/venta?id={id}` sigue funcionando (redirige), para cualquier enlace externo que aún use esa forma.

- [ ] **Step 1: Convertir el auto-open por `?id=` en una redirección a la página canónica**

Ubicar:
```tsx
  // Auto-open detail if navigated here with ?id= from Hub
  useEffect(()=>{
    const idParam = searchParams?.get('id');
    if(idParam){
      const numId = Number(idParam);
      if(!isNaN(numId)) fetchDetail(numId);
    }
  },[searchParams]);
```
Reemplazar por (agregar `useRouter` al import de `next/navigation`, que hoy solo trae `useSearchParams`):
```tsx
  const router = useRouter();

  // Compatibilidad con enlaces antiguos que abrian el detalle con ?id=:
  // redirige a la pagina canonica en vez de duplicar la vista aqui.
  useEffect(()=>{
    const idParam = searchParams?.get('id');
    if(idParam){
      const numId = Number(idParam);
      if(!isNaN(numId)) router.replace(`/dashboard/ventas/venta/${numId}`);
    }
  },[searchParams, router]);
```

- [ ] **Step 2: Cambiar los clics de fila y menú para navegar a la ruta canónica**

Reemplazar cada `fetchDetail(p.id)` usado como `onClick` de navegación (las celdas de la fila de la tabla y el ítem "Ver Detalle"/"Editar" del menú) por `router.push(\`/dashboard/ventas/venta/${p.id}\`)`. Dejar `fetchDetail` y `selectedPedido` sin usar por ahora (se eliminan en el Step 3).

- [ ] **Step 3: Eliminar el panel de detalle duplicado y su estado/handlers ya no usados**

Eliminar del componente: el bloque JSX completo `{selectedPedido && (...)}` (panel lateral, líneas ~598-893 del archivo original), el bloque `{showPecModal && ...}` `Modal` de crear PEC, `{showNewSupplier && ...}`, `{showCancelModal && ...}` (ya migrados a la página canónica en las Tasks 1-2), y el estado/handlers que solo ellos usaban: `selectedPedido`, `isEditMode`, `editForm`, `panelTab`, `chatterMsg`, `chatterSending`, `showPecModal`, `pecSaving`, `pecForm`, `supplierSearch`, `suppliers`, `selectedSupplier`, `showNewSupplier`, `listaSaving`, `supplierTimer`, `showCancelModal`, `cancelTargetId`, `cancelRazon`, `cancelling`, `openMenu` (si solo controlaba el menú de la fila — verificar si `openMenu` también controla otra cosa antes de borrarlo), y las funciones `fetchDetail`, `handleSaveEdit`, `handleCrearPXP`, `openCancelModal`, `handleCancelarPedido`, `onSupplierSearch`, `handleCrearPEC`, `handleAgregarLista`, `handleSendChatter`, y el componente `IAPanelVenta` completo (ya no se usa en ninguna parte).

Quitar del import de lucide-react los íconos que queden sin uso tras el borrado (verificar uno por uno con una búsqueda de texto en el archivo resultante antes de quitar cada uno, no asumir).

- [ ] **Step 4: Verificar manualmente en el navegador**

1. `npm --prefix frontend run build` compila sin errores de "variable declarada pero no usada" ni de tipos.
2. Navegar a `/dashboard/ventas/venta` (lista) → click en una fila → debe navegar a `/dashboard/ventas/venta/{id}` (URL cambia), no abrir un panel lateral en la misma URL.
3. Navegar directo a `/dashboard/ventas/venta?id={id}` de un pedido real → debe redirigir automáticamente a `/dashboard/ventas/venta/{id}`.
4. Repetir la verificación de las Tasks 1, 2, 3 y 4 sobre la página ya consolidada, para confirmar que nada se rompió al borrar el duplicado.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/ventas/venta/venta-client.tsx
git commit -m "refactor(ventas): retirar panel duplicado de Pedido de Venta, ?id= redirige a la pagina canonica

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Auditar Exportar Día, Exportar Rango y Proyecciones

**Files:**
- Modify: `frontend/src/app/dashboard/ventas/exportar-dia/page.tsx`
- Modify: `frontend/src/app/dashboard/ventas/exportar-rango/page.tsx` (mismo patrón que exportar-dia — confirmar en el momento si su `handleUpload` es idéntico antes de replicar el cambio)

**Interfaces:**
- Consumes: nada nuevo — `/ventas/upload_chat` sigue sin existir en el backend (confirmado en la investigación previa: cero referencias en todo `backend/app/`). Este task NO construye ese endpoint (el usuario ya pidió explícitamente dejarlo así en la sesión anterior); solo deja de fallar en silencio.

- [ ] **Step 1: Reemplazar el fallo silencioso de `handleUpload` por un mensaje honesto**

En `frontend/src/app/dashboard/ventas/exportar-dia/page.tsx`, ubicar `handleUpload` (usa `fetch(process.env.NEXT_PUBLIC_API_URL + '/api/ventas/upload_chat', ...)`). Antes del `try`, agregar una verificación explícita en vez de dejar que el `fetch` falle de forma confusa:
```tsx
  const handleUpload = async () => {
    if (!file) {
      setError('Por favor selecciona un archivo de chat .txt');
      return;
    }

    setError('Esta función (extraer ventas desde un chat de WhatsApp) todavía no está conectada al servidor — está pendiente de construirse. Usa "Historial" para cargar una extracción ya guardada anteriormente.');
  };
```
Esto reemplaza por completo el cuerpo anterior de la función (el `FormData`, el `fetch` a `/api/ventas/upload_chat`, y su manejo de respuesta) — no se deja código muerto detrás.

- [ ] **Step 2: Repetir en Exportar Rango**

`frontend/src/app/dashboard/ventas/exportar-rango/page.tsx` tiene el mismo `handleUpload` con la misma llamada rota a `/api/ventas/upload_chat` (confirmado por lectura directa en la sesión del bug-fix de `/history`, 2026-09-29). Aplicar el mismo reemplazo del Step 1 ahí: localizar su `handleUpload`, reemplazar todo su cuerpo por la verificación de archivo + el mismo mensaje de `setError(...)` indicando que la función no está conectada al servidor. Antes de guardar, releer el archivo completo una vez para confirmar que su firma de `handleUpload` y el nombre del estado de error (`setError` vs otro) coinciden con lo asumido aquí — si divergen, ajustar el nombre de la función invocada, no el mensaje.

- [ ] **Step 3: Confirmar Proyecciones**

Abrir `frontend/src/app/dashboard/ventas/proyecciones/page.tsx` (ya migrado a `apiFetch` en el bug-fix de `/history` de la sesión anterior) y verificar en vivo: cargar la página, confirmar que el histórico carga (o falla de forma clara si no hay archivo previo, sin romper la pantalla), y que "Recalcular Proyección" funciona con datos reales — sin cambiar código si ya funciona, solo documentar el resultado en el mensaje de cierre de esta tarea.

- [ ] **Step 4: Verificar manualmente en el navegador**

1. `/dashboard/ventas/exportar-dia` → seleccionar cualquier archivo `.txt` → click "Extraer" → debe mostrar el mensaje honesto, no un error de red ni una pantalla en blanco.
2. Repetir en Exportar Rango si se modificó.
3. `/dashboard/ventas/proyecciones` → confirmar el comportamiento descrito en el Step 3.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/ventas/exportar-dia/page.tsx frontend/src/app/dashboard/ventas/exportar-rango/page.tsx
git commit -m "fix(ventas): reemplazar fallo silencioso de carga de chat por mensaje honesto (backend pendiente)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Cierre de este plan

Al terminar la Task 6, Ventas queda en el mismo nivel de terminación que Cotización: una sola página por documento, sin datos de relleno, con Actividad+Chatter+Progreso estandarizados en los tres documentos (Solicitud, Cotización, Pedido de Venta). El siguiente plan (Componente 2 de la spec — Compras) se escribe por separado una vez este quede verificado.
