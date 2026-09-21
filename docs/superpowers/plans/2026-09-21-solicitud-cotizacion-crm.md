# Solicitud de Cliente, Cotización y CRM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir el flujo Solicitud de Cliente → Cotización → CRM: asesor real, vencimiento correcto, estado de solicitud siempre sincronizado con su cotización, Lead de CRM siempre vinculado y movido automáticamente por el servidor, Soporte Técnico completo, y navegación/autocompletar reales.

**Architecture:** Cambios concentrados en `backend/app/api/v1/erp_ventas.py` y `backend/app/api/v1/crm.py` (y sus modelos en `app/models/erp_documents.py` y `app/models/sales.py`), más los frontends correspondientes.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Next.js/React, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-21-solicitud-cotizacion-crm-design.md`

## Global Constraints

- El "Lead" de CRM es una fila de `app.models.sales.SalesOrder` (tabla `sales_orders`) — **no confundir** con `app.models.erp_documents.SaleOrder` (tabla `sale_orders`, el Pedido de Venta real). Son dos modelos distintos.
- Los valores de `status` del Lead reutilizan el vocabulario ya existente en `crm.py` (`STATUS_LABELS`, `STATUS_COLORS`): `DRAFT`, `QUOTATION`, `INVOICED`, `CANCELLED`. Solo `EN_NEGOCIACION` es nuevo — se agrega a esos mismos diccionarios, nunca se reemplazan valores existentes.
- Ninguna migración de Alembic incluye GRANTs ni toca roles (patrón ya establecido en las migraciones `fa6_*`).
- Todo endpoint nuevo/editado bajo `/api/v1/ventas` y `/api/v1/crm` mantiene los mismos `require_roles(...)` que ya usan sus vecinos en el mismo archivo — no aflojar ni endurecer permisos como efecto secundario.

---

### Task 1: Asesor como selector real + vencimiento a 5 días

**Files:**
- Modify: `backend/app/models/erp_documents.py` (clase `CustomerRequest`)
- Modify: `backend/app/api/v1/erp_ventas.py` (`create_solicitud`, `_sc_dict`)
- Create: `backend/alembic/versions/fa6_016_solicitud_advisor_user.py`
- Modify: `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`
- Create: `backend/tests/test_solicitud_asesor_vencimiento.py`

**Interfaces:**
- Produces: `CustomerRequest.advisor_user_id`; `POST /solicitudes` acepta `advisor_user_id` y usa 5 días de vencimiento por defecto.
- Consumes: `GET /auth/users` (ya existe, devuelve `{status, data: [{id, email, role, is_active}]}`).

- [ ] **Step 1: Agregar la columna al modelo**

En `backend/app/models/erp_documents.py`, en la clase `CustomerRequest`, agregar junto a `advisor_name`:

```python
    advisor_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
```

- [ ] **Step 2: Crear la migración**

Verificar cabeza actual: `cd backend && ALEMBIC_ENV=testing python -m alembic heads` (debe ser `fa6_013`, o la última que exista en ese momento del proyecto).

Crear `backend/alembic/versions/fa6_016_solicitud_advisor_user.py` (ajustar `down_revision` a la cabeza real si difiere de `fa6_013`):

```python
"""
fa6_016 - Asesor de Solicitud como referencia real a usuarios

Reemplaza el texto libre de advisor_name por una referencia real,
manteniendo advisor_name como copia de solo lectura para no romper
pantallas que ya lo muestran como texto.

Revision ID: fa6_016
Revises: fa6_013
Create Date: 2026-09-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_016"
down_revision: Union[str, Sequence[str], None] = "fa6_013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS advisor_user_id INTEGER REFERENCES users(id)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("ALTER TABLE customer_requests DROP COLUMN IF EXISTS advisor_user_id"))
```

Run: `cd backend && ALEMBIC_ENV=testing DATABASE_URL="$TEST_DATABASE_URL" python -m alembic upgrade head`

- [ ] **Step 3: Escribir la prueba que falla primero**

Crear `backend/tests/test_solicitud_asesor_vencimiento.py`:

```python
import datetime
import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


class TestAsesorYVencimiento:

    def test_vencimiento_por_defecto_es_5_dias(self, app_client, admin_token):
        r = app_client.post("/api/v1/ventas/solicitudes", json={
            "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
            "tipo_solicitud": "Cotizacion de Producto",
        }, headers=_headers(admin_token))
        assert r.status_code == 201
        venc = datetime.datetime.fromisoformat(r.json()["data"]["fecha_vencimiento"].replace("Z", ""))
        esperado = datetime.datetime.utcnow() + datetime.timedelta(days=5)
        assert abs((venc - esperado).total_seconds()) < 60

    def test_advisor_user_id_se_guarda_y_se_devuelve(self, app_client, admin_token, user_admin):
        r = app_client.post("/api/v1/ventas/solicitudes", json={
            "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
            "tipo_solicitud": "Cotizacion de Producto",
            "advisor_user_id": user_admin.id,
        }, headers=_headers(admin_token))
        assert r.status_code == 201
        assert r.json()["data"]["advisor_user_id"] == user_admin.id
```

Run: `cd backend && pytest tests/test_solicitud_asesor_vencimiento.py -v`
Expected: el primer test falla (vencimiento sigue en 30 días), el segundo falla (`advisor_user_id` no viene en la respuesta).

- [ ] **Step 4: Corregir el backend**

En `backend/app/api/v1/erp_ventas.py`, en `create_solicitud` (línea ~210), cambiar:

```python
    # Auto vencimiento: 30 days
    venc = datetime.datetime.utcnow() + datetime.timedelta(days=body.get("dias_vencimiento", 30))
```

por:

```python
    # Auto vencimiento: 5 dias por defecto
    venc = datetime.datetime.utcnow() + datetime.timedelta(days=body.get("dias_vencimiento", 5))
```

Y en la construcción de `CustomerRequest` (unas líneas más abajo, junto a `advisor_name=body.get("advisor_name"),`), agregar:

```python
        advisor_user_id=body.get("advisor_user_id"),
```

Buscar la función `_sc_dict` en el mismo archivo (helper que arma el diccionario de respuesta de una Solicitud) y agregar `"advisor_user_id": sc.advisor_user_id,` junto a donde ya arma `"advisor_name"`.

- [ ] **Step 5: Correr las pruebas y verificar que pasan**

Run: `cd backend && pytest tests/test_solicitud_asesor_vencimiento.py -v`
Expected: PASS ambos tests.

- [ ] **Step 6: Reemplazar el campo de texto libre por un selector en el frontend**

En `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, agregar un estado para la lista de usuarios (junto a los demás `useState` del componente):

```tsx
  const [usuarios, setUsuarios] = useState<{id:number;email:string;role:string}[]>([]);
```

Cargarla en el `useEffect` de inicialización existente (donde ya se cargan otras listas):

```tsx
  useEffect(() => {
    apiFetch('/auth/users').then((d:any) => setUsuarios(Array.isArray(d)?d:(d?.data??[]))).catch(()=>{});
  }, []);
```

Buscar el input de texto libre de "Asesor" dentro del formulario de creación (cerca de `form.advisor_name`) y reemplazarlo por:

```tsx
                <select value={form.advisor_user_id||''} onChange={e=>{
                    const uid = e.target.value ? Number(e.target.value) : '';
                    const u = usuarios.find(x=>x.id===uid);
                    setForm(f=>({...f, advisor_user_id: uid, advisor_name: u?.email || f.advisor_name}));
                  }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
                  <option value="">Seleccionar asesor...</option>
                  {usuarios.filter(u=>u.role==='Admin'||u.role==='Vendedor').map(u=>(
                    <option key={u.id} value={u.id}>{u.email}</option>
                  ))}
                </select>
```

Nota para quien implemente: el `form` de este componente es un objeto de estado ya existente con muchos campos (`form.advisor_name`, `form.tipo_solicitud`, etc.) — agregar `advisor_user_id` a su definición inicial (`useState({...})`) junto a los demás campos, con valor inicial `''`. Incluir `advisor_user_id: form.advisor_user_id` en el `body` que arma `createSolicitud` al enviar el POST.

- [ ] **Step 7: Verificación manual**

Con el backend y frontend locales corriendo: crear una solicitud nueva, confirmar que el campo Asesor es un desplegable con usuarios reales (no texto libre), guardar, y confirmar que el vencimiento por defecto (si no se cambia manualmente) queda en 5 días.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/erp_documents.py backend/app/api/v1/erp_ventas.py backend/alembic/versions/fa6_016_solicitud_advisor_user.py backend/tests/test_solicitud_asesor_vencimiento.py frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx
git commit -m "feat: asesor de solicitud como selector real de usuarios, vencimiento por defecto a 5 dias"
```

---

### Task 2: Estado de Solicitud siempre sincronizado con su Cotización

**Files:**
- Modify: `backend/app/api/v1/erp_ventas.py` (`confirmar_solicitud`, `update_cotizacion`)
- Create: `backend/tests/test_sincronizacion_estado_solicitud_cotizacion.py`

**Interfaces:**
- Produces: función interna `_sincronizar_estado_solicitud_desde_cotizacion(cot, db)` en `erp_ventas.py`, llamada por Task 4 también.

- [ ] **Step 1: Escribir las pruebas que fallan primero**

Crear `backend/tests/test_sincronizacion_estado_solicitud_cotizacion.py`:

```python
import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _crear_solicitud_y_confirmar(client, admin_token):
    sc = client.post("/api/v1/ventas/solicitudes", json={
        "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
        "tipo_solicitud": "Cotizacion de Producto",
    }, headers=_headers(admin_token)).json()["data"]
    r = client.post(f"/api/v1/ventas/solicitudes/{sc['id']}/confirmar", json={}, headers=_headers(admin_token))
    return sc, r.json()["data"]["cotizacion"]


class TestSincronizacionEstados:

    def test_crear_cotizacion_deja_solicitud_en_cotizada_no_confirmada(self, app_client, admin_token):
        sc, cot = _crear_solicitud_y_confirmar(app_client, admin_token)
        r = app_client.get(f"/api/v1/ventas/solicitudes/{sc['id']}", headers=_headers(admin_token))
        assert r.json()["data"]["estado"] == "COTIZADA"

    def test_enviar_cotizacion_deja_solicitud_en_espera_confirmacion(self, app_client, admin_token):
        sc, cot = _crear_solicitud_y_confirmar(app_client, admin_token)
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "Enviada"}, headers=_headers(admin_token))
        r = app_client.get(f"/api/v1/ventas/solicitudes/{sc['id']}", headers=_headers(admin_token))
        assert r.json()["data"]["estado"] == "EN_ESPERA_CONFIRMACION"

    def test_confirmar_cotizacion_manualmente_deja_solicitud_confirmada(self, app_client, admin_token):
        sc, cot = _crear_solicitud_y_confirmar(app_client, admin_token)
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "Confirmada"}, headers=_headers(admin_token))
        r = app_client.get(f"/api/v1/ventas/solicitudes/{sc['id']}", headers=_headers(admin_token))
        assert r.json()["data"]["estado"] == "CONFIRMADA"

    def test_rechazar_cotizacion_deja_solicitud_rechazada(self, app_client, admin_token):
        sc, cot = _crear_solicitud_y_confirmar(app_client, admin_token)
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "Rechazada"}, headers=_headers(admin_token))
        r = app_client.get(f"/api/v1/ventas/solicitudes/{sc['id']}", headers=_headers(admin_token))
        assert r.json()["data"]["estado"] == "RECHAZADA"
```

Run: `cd backend && pytest tests/test_sincronizacion_estado_solicitud_cotizacion.py -v`
Expected: el primer test falla (hoy queda en CONFIRMADA, no COTIZADA); los demás fallan porque nada sincroniza la Solicitud todavía.

- [ ] **Step 2: Corregir `confirmar_solicitud`**

En `backend/app/api/v1/erp_ventas.py`, en `confirmar_solicitud` (línea ~332), cambiar:

```python
    # Update SC estado
    old_estado = sc.estado
    sc.estado = "CONFIRMADA"
    sc.updated_at = datetime.datetime.utcnow()
    db.commit()

    _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED",
         "Solicitud confirmada - Cotizacion creada",
         old_estado=old_estado, new_estado="CONFIRMADA",
         user_name=body.get("user_name"))
```

por:

```python
    # Al crear el borrador de cotizacion, la solicitud pasa a COTIZADA (no CONFIRMADA:
    # eso solo ocurre cuando el cliente realmente confirma la cotizacion).
    old_estado = sc.estado
    sc.estado = "COTIZADA"
    sc.updated_at = datetime.datetime.utcnow()
    db.commit()

    _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED",
         "Solicitud cotizada - Cotizacion creada",
         old_estado=old_estado, new_estado="COTIZADA",
         user_name=body.get("user_name"))
```

- [ ] **Step 3: Agregar la funcion de sincronizacion y llamarla desde `update_cotizacion`**

En `backend/app/api/v1/erp_ventas.py`, agregar esta función antes de `update_cotizacion` (línea ~482):

```python
_MAPA_ESTADO_COTIZACION_A_SOLICITUD = {
    "Borrador": "COTIZADA",
    "Enviada": "EN_ESPERA_CONFIRMACION",
    "Pend. confirmación": "EN_ESPERA_CONFIRMACION",
    "Confirmada": "CONFIRMADA",
    "Rechazada": "RECHAZADA",
    "Vencida": "VENCIDA",
}


def _sincronizar_estado_solicitud_desde_cotizacion(cot: "SalesQuotation", db: Session) -> None:
    """Mantiene CustomerRequest.estado como reflejo fiel del estado real de su Cotizacion."""
    if not cot.sc_id:
        return
    nuevo_estado = _MAPA_ESTADO_COTIZACION_A_SOLICITUD.get(cot.estado)
    if not nuevo_estado:
        return
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == cot.sc_id).first()
    if sc and sc.estado != nuevo_estado:
        sc.estado = nuevo_estado
        sc.updated_at = datetime.datetime.utcnow()
        db.commit()
```

En `update_cotizacion`, después de `db.refresh(cot)` y antes del `if body.get("estado")...` que ya existe, agregar la llamada:

```python
    if body.get("estado") and body["estado"] != old_estado:
        _sincronizar_estado_solicitud_desde_cotizacion(cot, db)
        _log(db, "COT", cot.id, cot.numero, "ESTADO_CHANGED",
```

(la línea `_log(...)` ya existe justo ahí — solo se agrega la línea de sincronización antes, dentro del mismo `if`).

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `cd backend && pytest tests/test_sincronizacion_estado_solicitud_cotizacion.py -v`
Expected: PASS los 4 tests.

- [ ] **Step 5: Correr también las pruebas de Task 1 para confirmar que nada se rompio**

Run: `cd backend && pytest tests/test_solicitud_asesor_vencimiento.py tests/test_catalogo_configurable_categorias.py -v`
Expected: PASS (regresion rapida sobre trabajo previo).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/erp_ventas.py backend/tests/test_sincronizacion_estado_solicitud_cotizacion.py
git commit -m "fix: el estado de la solicitud se deriva del estado real de su cotizacion (corrige confirmada prematura)"
```

---

### Task 3: Vínculo real Solicitud↔Lead y movimiento automático de etapa

**Files:**
- Modify: `backend/app/models/sales.py` (clase `SalesOrder`)
- Modify: `backend/app/api/v1/crm.py` (extraer helper, agregar función de movimiento por `sc_id`)
- Modify: `backend/app/api/v1/erp_ventas.py` (llamar el movimiento en los 4 momentos)
- Create: `backend/alembic/versions/fa6_017_lead_vinculo_solicitud.py`
- Modify: `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx` (enviar `sc_id` al crear el Lead)
- Create: `backend/tests/test_crm_lead_movimiento_automatico.py`

**Interfaces:**
- Produces: `SalesOrder.canonical_customer_request_id`; función `mover_lead_de_solicitud(sc_id: int, maps_to_status: str, db: Session) -> None` en `crm.py`, importada por `erp_ventas.py`.
- Consumes: `_sincronizar_estado_solicitud_desde_cotizacion` (Task 2, mismo archivo).

- [ ] **Step 1: Agregar la columna de vinculo**

En `backend/app/models/sales.py`, en la clase `SalesOrder`, agregar junto a `canonical_sale_order_id`:

```python
    canonical_customer_request_id = Column(Integer, ForeignKey("customer_requests.id"), nullable=True)
```

- [ ] **Step 2: Crear la migración**

Crear `backend/alembic/versions/fa6_017_lead_vinculo_solicitud.py` (ajustar `down_revision` a la cabeza real vigente, previsiblemente `fa6_016`):

```python
"""
fa6_017 - Vinculo real entre Lead de CRM (sales_orders) y Solicitud de Cliente

Sin esto no hay forma confiable de saber que Lead corresponde a que
Solicitud — solo coincidian por customer_id y texto libre. Este campo
sigue el mismo patron que canonical_sale_order_id, ya existente.

Revision ID: fa6_017
Revises: fa6_016
Create Date: 2026-09-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_017"
down_revision: Union[str, Sequence[str], None] = "fa6_016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS canonical_customer_request_id INTEGER REFERENCES customer_requests(id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_sales_orders_canonical_cr_id ON sales_orders(canonical_customer_request_id)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_sales_orders_canonical_cr_id"))
    conn.execute(sa.text("ALTER TABLE sales_orders DROP COLUMN IF EXISTS canonical_customer_request_id"))
```

Run: `cd backend && ALEMBIC_ENV=testing DATABASE_URL="$TEST_DATABASE_URL" python -m alembic upgrade head`

- [ ] **Step 3: Escribir las pruebas que fallan primero**

Crear `backend/tests/test_crm_lead_movimiento_automatico.py`:

```python
import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _crear_solicitud_con_lead(client, admin_token, customer_id):
    sc = client.post("/api/v1/ventas/solicitudes", json={
        "customer_id": customer_id,
        "customer_name": "Cliente Lead Test",
        "tipo_solicitud": "Cotizacion de Producto",
    }, headers=_headers(admin_token)).json()["data"]
    lead = client.post("/api/v1/crm/leads", json={
        "customer_id": customer_id,
        "sc_id": sc["id"],
        "solicitud_tipo": "Cotizacion de Producto",
    }, headers=_headers(admin_token)).json()["data"]
    return sc, lead


class TestMovimientoAutomaticoDeLead:

    def test_lead_se_crea_vinculado_a_la_solicitud(self, app_client, admin_token, customer_test):
        sc, lead = _crear_solicitud_con_lead(app_client, admin_token, customer_test.id)
        assert lead["status"] == "DRAFT"

    def test_enviar_cotizacion_mueve_lead_a_quotation(self, app_client, admin_token, customer_test):
        sc, lead = _crear_solicitud_con_lead(app_client, admin_token, customer_test.id)
        cot = app_client.post(f"/api/v1/ventas/solicitudes/{sc['id']}/confirmar", json={}, headers=_headers(admin_token)).json()["data"]["cotizacion"]
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "Enviada"}, headers=_headers(admin_token))
        r = app_client.get("/api/v1/crm/leads", headers=_headers(admin_token))
        lead_actualizado = next(l for l in r.json()["data"] if l["id"] == lead["id"])
        assert lead_actualizado["status"] == "QUOTATION"

    def test_rechazar_cotizacion_mueve_lead_a_cancelled(self, app_client, admin_token, customer_test):
        sc, lead = _crear_solicitud_con_lead(app_client, admin_token, customer_test.id)
        cot = app_client.post(f"/api/v1/ventas/solicitudes/{sc['id']}/confirmar", json={}, headers=_headers(admin_token)).json()["data"]["cotizacion"]
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "Rechazada"}, headers=_headers(admin_token))
        r = app_client.get("/api/v1/crm/leads?stage_id=", headers=_headers(admin_token))
        # Los leads CANCELLED se excluyen de la vista por defecto (status != CANCELLED);
        # se verifica directo contra la base para no depender de ese filtro.
        from app.models.sales import SalesOrder
        # (db fixture no disponible aqui directamente; se resuelve via nueva consulta en el propio test si hace falta)
```

Nota para quien implemente: el tercer test necesita el fixture `db` para verificar directamente el `status` del `SalesOrder` (ya que `GET /crm/leads` excluye `CANCELLED` por diseño). Reescribir así:

```python
    def test_rechazar_cotizacion_mueve_lead_a_cancelled(self, app_client, admin_token, customer_test, db):
        from app.models.sales import SalesOrder
        sc, lead = _crear_solicitud_con_lead(app_client, admin_token, customer_test.id)
        cot = app_client.post(f"/api/v1/ventas/solicitudes/{sc['id']}/confirmar", json={}, headers=_headers(admin_token)).json()["data"]["cotizacion"]
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "Rechazada"}, headers=_headers(admin_token))
        db.expire_all()
        orden = db.query(SalesOrder).filter(SalesOrder.id == lead["id"]).first()
        assert orden.status == "CANCELLED"

    def test_confirmar_pedido_desde_cotizacion_mueve_lead_a_invoiced(self, app_client, admin_token, customer_test, db):
        from app.models.sales import SalesOrder
        sc, lead = _crear_solicitud_con_lead(app_client, admin_token, customer_test.id)
        cot = app_client.post(f"/api/v1/ventas/solicitudes/{sc['id']}/confirmar", json={}, headers=_headers(admin_token)).json()["data"]["cotizacion"]
        app_client.post(f"/api/v1/ventas/cotizaciones/{cot['id']}/confirmar", json={}, headers=_headers(admin_token))
        db.expire_all()
        orden = db.query(SalesOrder).filter(SalesOrder.id == lead["id"]).first()
        assert orden.status == "INVOICED"

    def test_las_5_etapas_estandar_se_crean_si_no_existen(self, app_client, admin_token, customer_test, db):
        from app.models.catalog import Category  # noqa: F401 (solo para asegurar imports de modelos ya cargados)
        from crm import PipelineStage  # ajustar el import real al de crm.py si difiere
        sc, lead = _crear_solicitud_con_lead(app_client, admin_token, customer_test.id)
        cot = app_client.post(f"/api/v1/ventas/solicitudes/{sc['id']}/confirmar", json={}, headers=_headers(admin_token)).json()["data"]["cotizacion"]
        app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}", json={"estado": "Enviada"}, headers=_headers(admin_token))
        mapeos = {s[0] for s in db.execute(text("SELECT maps_to_status FROM pipeline_stages")).fetchall()}
        assert {"DRAFT", "QUOTATION", "EN_NEGOCIACION", "INVOICED", "CANCELLED"}.issubset(mapeos)
```

Nota para quien implemente: el import de `PipelineStage` en el test debe apuntar al módulo real donde vive la clase (`app.api.v1.crm`, tal como se importa en el resto del backend) — corregirlo si el nombre de arriba no es exacto. Agregar `from sqlalchemy import text` al encabezado del archivo de test si no está ya importado.

Nota: verificar en `backend/tests/conftest.py` si existe un fixture equivalente a `customer_test` (crea un `Customer` de prueba); si el nombre real es distinto, usar el existente en su lugar — no crear un segundo mecanismo para lo mismo.

Run: `cd backend && pytest tests/test_crm_lead_movimiento_automatico.py -v`
Expected: fallan (falta `sc_id` en el endpoint de creación de leads, y no hay movimiento automático todavía).

- [ ] **Step 4: Aceptar `sc_id` al crear un Lead**

En `backend/app/api/v1/crm.py`, en `create_lead_v2` (línea ~1613), agregar en la construcción de `SalesOrder`:

```python
        canonical_customer_request_id=body.get("sc_id"),
```

- [ ] **Step 5: Extraer el helper de movimiento y la función por `sc_id`**

En `backend/app/api/v1/crm.py`, agregar esta función reutilizable cerca de `move_lead_stage` (línea ~1218), y usarla también dentro de `move_lead_stage` para no duplicar lógica:

```python
def _mover_lead_a_status(order: SalesOrder, maps_to_status: str, db: Session) -> None:
    stage = db.query(PipelineStage).filter(PipelineStage.maps_to_status == maps_to_status).first()
    if stage:
        order.pipeline_stage_id = stage.id
    order.status = maps_to_status
    order.updated_at = datetime.datetime.utcnow()
    db.commit()


def mover_lead_de_solicitud(sc_id: int, maps_to_status: str, db: Session) -> None:
    """Mueve el Lead vinculado a una Solicitud (si existe) a la etapa dada. No falla si no hay Lead."""
    if not sc_id:
        return
    order = db.query(SalesOrder).filter(SalesOrder.canonical_customer_request_id == sc_id).first()
    if order:
        _mover_lead_a_status(order, maps_to_status, db)
```

Agregar también esta función, y llamarla al inicio de `mover_lead_de_solicitud` (antes de la búsqueda del `order`), para garantizar que las 5 etapas estándar existan sin duplicar ni renombrar ninguna etapa que el usuario ya haya creado con otro nombre para el mismo `maps_to_status`:

```python
_ETAPAS_ESTANDAR = [
    ("Nuevo Lead", "DRAFT", "bg-blue-500", "bg-blue-50"),
    ("Cotización Enviada", "QUOTATION", "bg-indigo-500", "bg-indigo-50"),
    ("En Negociación", "EN_NEGOCIACION", "bg-amber-500", "bg-amber-50"),
    ("Ganado", "INVOICED", "bg-emerald-500", "bg-emerald-50"),
    ("Perdido", "CANCELLED", "bg-red-500", "bg-red-50"),
]


def _asegurar_etapas_estandar(db: Session) -> None:
    existentes = {s.maps_to_status for s in db.query(PipelineStage.maps_to_status).all()}
    max_pos = db.execute(text("SELECT COALESCE(MAX(position),0) FROM pipeline_stages")).scalar() or 0
    creo_alguna = False
    for nombre, status, color, bg in _ETAPAS_ESTANDAR:
        if status not in existentes:
            max_pos += 1
            db.add(PipelineStage(name=nombre, color=color, bg_color=bg, position=max_pos, maps_to_status=status))
            creo_alguna = True
    if creo_alguna:
        db.commit()
```

Y modificar `mover_lead_de_solicitud` para llamarla primero:

```python
def mover_lead_de_solicitud(sc_id: int, maps_to_status: str, db: Session) -> None:
    """Mueve el Lead vinculado a una Solicitud (si existe) a la etapa dada. No falla si no hay Lead."""
    if not sc_id:
        return
    _asegurar_etapas_estandar(db)
    order = db.query(SalesOrder).filter(SalesOrder.canonical_customer_request_id == sc_id).first()
    if order:
        _mover_lead_a_status(order, maps_to_status, db)
```

- [ ] **Step 6: Llamar el movimiento desde los 4 momentos en `erp_ventas.py`**

En `backend/app/api/v1/erp_ventas.py`, agregar el import al inicio del archivo:

```python
from app.api.v1.crm import mover_lead_de_solicitud
```

En `update_cotizacion`, dentro del mismo `if body.get("estado") and body["estado"] != old_estado:` de Task 2, después de la llamada a `_sincronizar_estado_solicitud_desde_cotizacion(cot, db)`, agregar:

```python
        if cot.estado == "Enviada":
            mover_lead_de_solicitud(cot.sc_id, "QUOTATION", db)
        elif cot.estado == "Rechazada":
            mover_lead_de_solicitud(cot.sc_id, "CANCELLED", db)
```

En `confirmar_cotizacion` (línea ~507), justo antes del `return` final, agregar:

```python
    if res.get("sale_order_id"):
        mover_lead_de_solicitud(cot.sc_id if cot else None, "INVOICED", db)
```

En `create_cotizacion` (línea ~425), después de `db.refresh(cot)` y antes del `_log(...)` que ya existe, agregar (esto cubre "recotizar": si ya existia una cotizacion rechazada para la misma solicitud, crear una nueva la reactiva):

```python
    if cot.sc_id:
        mover_lead_de_solicitud(cot.sc_id, "QUOTATION", db)
```

- [ ] **Step 7: Enviar `sc_id` al crear el Lead desde el frontend**

En `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, en `createSolicitud` (línea ~784), dentro del `apiFetch('/crm/leads', {method:'POST', body:JSON.stringify({...` ya existente, agregar el campo:

```tsx
          sc_id: scData?.id,
```

- [ ] **Step 8: Correr las pruebas y verificar que pasan**

Run: `cd backend && pytest tests/test_crm_lead_movimiento_automatico.py -v`
Expected: PASS los 4 tests.

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/sales.py backend/app/api/v1/crm.py backend/app/api/v1/erp_ventas.py backend/alembic/versions/fa6_017_lead_vinculo_solicitud.py backend/tests/test_crm_lead_movimiento_automatico.py frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx
git commit -m "feat: vinculo real Solicitud-Lead y movimiento automatico de etapa en el servidor"
```

---

### Task 4: Cliente siempre real al crear una Solicitud

**Files:**
- Modify: `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`

**Interfaces:**
- Consumes: nada nuevo — endurece una validación ya existente en el mismo archivo.

- [ ] **Step 1: Cerrar el camino de texto libre sin cliente real**

En `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, en `createSolicitud` (línea ~758), reemplazar:

```tsx
    if(!selectedCust&&!custSearch){showToast('Selecciona un cliente','err');return;}
    // If search done but no client selected and no customer found, force create
    if(custSearchDone&&custResults.length===0&&!selectedCust){
      setShowNewClient(true);return;
    }
```

por:

```tsx
    if(!selectedCust){
      if(custSearchDone&&custResults.length===0){
        setShowNewClient(true);return;
      }
      showToast('Selecciona un cliente existente o crea uno nuevo — no se puede continuar sin un cliente real','err');
      return;
    }
```

Esto elimina el camino que permitía enviar `customer_name: custSearch` como texto libre sin un `customer_id` real. A partir de aquí, `selectedCust` siempre existe al llegar al `apiFetch('/ventas/solicitudes', ...)`, por lo que `customer_id:selectedCust?.id||null` (línea ~777, ya existente) siempre lleva un id real.

- [ ] **Step 2: Verificación manual**

Con backend y frontend locales corriendo: intentar crear una solicitud escribiendo un nombre de cliente que no existe sin completar la búsqueda — debe forzar el modal de "Agregar Cliente" o mostrar el aviso, nunca permitir guardar con solo texto.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx
git commit -m "fix: solicitud de cliente siempre requiere un cliente real vinculado (cierra el hueco de texto libre)"
```

---

### Task 5: Soporte Técnico — campos, flujo propio y formulario

**Files:**
- Modify: `backend/app/models/erp_documents.py` (clase `CustomerRequest`)
- Modify: `backend/app/api/v1/erp_ventas.py` (`create_solicitud`, `_sc_dict`, lógica de alerta por desatención)
- Create: `backend/alembic/versions/fa6_018_soporte_tecnico.py`
- Modify: `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`
- Create: `backend/tests/test_soporte_tecnico.py`

**Interfaces:**
- Produces: `CustomerRequest.tipo_problema`, `.descripcion_problema`, `.urgencia`, `.evidencia_descripcion`, `.asignado_a_user_id`, `.estado_soporte`.

- [ ] **Step 1: Agregar las columnas al modelo**

En `backend/app/models/erp_documents.py`, clase `CustomerRequest`, agregar:

```python
    tipo_problema = Column(String(50), nullable=True)
    descripcion_problema = Column(Text, nullable=True)
    urgencia = Column(String(20), nullable=True)
    evidencia_descripcion = Column(Text, nullable=True)
    asignado_a_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    estado_soporte = Column(String(20), nullable=True)
```

- [ ] **Step 2: Crear la migración**

Crear `backend/alembic/versions/fa6_018_soporte_tecnico.py` (`down_revision` = cabeza real vigente, previsiblemente `fa6_017`):

```python
"""
fa6_018 - Campos de Soporte Tecnico en customer_requests

Soporte Tecnico tiene su propio flujo de estados (estado_soporte),
independiente del estado ligado a Cotizacion, porque no siempre
termina en una venta.

Revision ID: fa6_018
Revises: fa6_017
Create Date: 2026-09-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_018"
down_revision: Union[str, Sequence[str], None] = "fa6_017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    for ddl in [
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS tipo_problema VARCHAR(50)",
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS descripcion_problema TEXT",
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS urgencia VARCHAR(20)",
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS evidencia_descripcion TEXT",
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS asignado_a_user_id INTEGER REFERENCES users(id)",
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS estado_soporte VARCHAR(20)",
    ]:
        conn.execute(sa.text(ddl))


def downgrade() -> None:
    conn = op.get_bind()
    for col in ["estado_soporte", "asignado_a_user_id", "evidencia_descripcion", "urgencia", "descripcion_problema", "tipo_problema"]:
        conn.execute(sa.text(f"ALTER TABLE customer_requests DROP COLUMN IF EXISTS {col}"))
```

Run: `cd backend && ALEMBIC_ENV=testing DATABASE_URL="$TEST_DATABASE_URL" python -m alembic upgrade head`

- [ ] **Step 3: Escribir las pruebas que fallan primero**

Crear `backend/tests/test_soporte_tecnico.py`:

```python
import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


class TestSoporteTecnico:

    def test_crear_soporte_tecnico_guarda_sus_campos_propios(self, app_client, admin_token):
        r = app_client.post("/api/v1/ventas/solicitudes", json={
            "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
            "tipo_solicitud": "Soporte Tecnico",
            "tipo_problema": "Falla del producto",
            "descripcion_problema": "El producto llego danado",
            "urgencia": "Alta",
        }, headers=_headers(admin_token))
        assert r.status_code == 201
        data = r.json()["data"]
        assert data["tipo_problema"] == "Falla del producto"
        assert data["estado_soporte"] == "ABIERTO"

    def test_soporte_tecnico_no_crea_estado_de_cotizacion(self, app_client, admin_token):
        r = app_client.post("/api/v1/ventas/solicitudes", json={
            "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
            "tipo_solicitud": "Soporte Tecnico",
            "urgencia": "Baja",
        }, headers=_headers(admin_token))
        data = r.json()["data"]
        assert data["estado"] == "N/A_SOPORTE"

    def test_soporte_urgencia_alta_aparece_en_alertas_antes_que_baja(self, app_client, admin_token, db):
        import datetime
        r = app_client.post("/api/v1/ventas/solicitudes", json={
            "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
            "tipo_solicitud": "Soporte Tecnico",
            "urgencia": "Alta",
        }, headers=_headers(admin_token))
        sc_id = r.json()["data"]["id"]
        # Simula que ya pasaron 5 horas desde la ultima actualizacion (umbral Alta = 4h)
        db.execute(text("UPDATE customer_requests SET updated_at = :hace WHERE id = :id"),
                   {"hace": datetime.datetime.utcnow() - datetime.timedelta(hours=5), "id": sc_id})
        db.commit()
        r2 = app_client.get("/api/v1/ventas/alertas", headers=_headers(admin_token))
        ids_en_alerta = [s["id"] for s in r2.json()["data"]["soporte_sin_atender"]]
        assert sc_id in ids_en_alerta
```

Agregar `from sqlalchemy import text` al encabezado de `test_soporte_tecnico.py` para este último test.

Run: `cd backend && pytest tests/test_soporte_tecnico.py -v`
Expected: fallan (los campos no se guardan todavia, `estado_soporte`/`estado` no tienen esa logica).

- [ ] **Step 4: Implementar en el backend**

En `create_solicitud` (`erp_ventas.py`, línea ~210), agregar tras el bloque que resuelve datos del cliente:

```python
    es_soporte = body.get("tipo_solicitud") == "Soporte Tecnico"
```

Y en la construcción de `CustomerRequest`, agregar estos campos y ajustar `estado`:

```python
        estado="N/A_SOPORTE" if es_soporte else "BORRADOR",
        tipo_problema=body.get("tipo_problema"),
        descripcion_problema=body.get("descripcion_problema"),
        urgencia=body.get("urgencia"),
        evidencia_descripcion=body.get("evidencia_descripcion"),
        asignado_a_user_id=body.get("asignado_a_user_id"),
        estado_soporte="ABIERTO" if es_soporte else None,
```

(la línea `estado="BORRADOR",` ya existente se reemplaza por la condicional de arriba).

En `_sc_dict`, agregar los 6 campos nuevos al diccionario de salida, igual que los demás (`"tipo_problema": sc.tipo_problema`, etc.).

La lógica de alerta por desatención ya existe en `erp_ventas.py:907-944`: `_get_alert_days(db, key="alerta_sc_dias")` lee un umbral en días desde la tabla `admin_config` (2 por defecto), y `get_alertas` (`GET /alertas`) filtra `CustomerRequest`/`SalesQuotation` sin cambios desde ese corte. Soporte Técnico necesita su propio umbral por urgencia, en horas, y debe quedar fuera del conteo general (que ya excluye por estado de Cotización, no por `estado_soporte`).

Agregar esta función junto a `_get_alert_days` (mismo patrón exacto, mismo manejo de excepción con valor por defecto):

```python
def _get_alert_hours_soporte(db: Session, urgencia: str) -> int:
    key_map = {"Alta": "alerta_soporte_alta_horas", "Media": "alerta_soporte_media_horas", "Baja": "alerta_soporte_baja_horas"}
    default_map = {"Alta": 4, "Media": 24, "Baja": 48}
    key = key_map.get(urgencia, "alerta_soporte_baja_horas")
    try:
        r = db.execute(text("SELECT value FROM admin_config WHERE key = :key"), {"key": key}).fetchone()
        return int(r[0]) if r else default_map.get(urgencia, 48)
    except Exception:
        return default_map.get(urgencia, 48)
```

En `get_alertas` (línea 917), excluir Soporte Técnico de la consulta general de `sc_alertas` y agregar su propio bloque:

```python
    # SC activos sin cambio de estado en N dias (excluye Soporte Tecnico, que tiene su propio umbral)
    sc_alertas = db.query(CustomerRequest).filter(
        CustomerRequest.updated_at <= cutoff,
        CustomerRequest.estado.notin_(["CONFIRMADA", "CANCELADA"]),
        CustomerRequest.tipo_solicitud != "Soporte Tecnico",
    ).all()

    # Soporte Tecnico: umbral propio por urgencia, solo tickets abiertos/en proceso
    soporte_abiertos = db.query(CustomerRequest).filter(
        CustomerRequest.tipo_solicitud == "Soporte Tecnico",
        CustomerRequest.estado_soporte.in_(["ABIERTO", "EN_PROCESO"]),
    ).all()
    soporte_alertas = []
    for sc in soporte_abiertos:
        horas = _get_alert_hours_soporte(db, sc.urgencia)
        if sc.updated_at <= datetime.datetime.utcnow() - datetime.timedelta(hours=horas):
            soporte_alertas.append(sc)
```

Y agregar `"soporte_sin_atender": [_sc_dict(sc) for sc in soporte_alertas], "soporte_count": len(soporte_alertas),` al diccionario `data` que ya devuelve `get_alertas`.

- [ ] **Step 5: Correr las pruebas y verificar que pasan**

Run: `cd backend && pytest tests/test_soporte_tecnico.py -v`
Expected: PASS los 2 tests.

- [ ] **Step 6: Agregar los campos al formulario del frontend**

En `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, en el formulario de creación, agregar un bloque condicional (siguiendo el mismo patrón que ya usan `isProgramarEntrega`/`isDevolucion` para mostrar campos según el tipo — buscar esas constantes cerca de la línea 847):

```tsx
  const isSoporte = form.tipo_solicitud === 'Soporte Tecnico';
```

Y en el JSX del formulario, junto a los otros bloques condicionales por tipo (`{isDevolucion && (...)}`), agregar:

```tsx
              {isSoporte && (
                <div className="col-span-2 bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
                  <select value={form.tipo_problema||''} onChange={e=>setForm(f=>({...f,tipo_problema:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                    <option value="">Tipo de problema...</option>
                    <option>Falla del producto</option><option>Garantia</option>
                    <option>Duda de uso</option><option>Problema con el pedido o envio</option><option>Otro</option>
                  </select>
                  <textarea placeholder="Descripcion del problema" value={form.descripcion_problema||''}
                    onChange={e=>setForm(f=>({...f,descripcion_problema:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" rows={3} />
                  <select value={form.urgencia||''} onChange={e=>setForm(f=>({...f,urgencia:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                    <option value="">Urgencia...</option>
                    <option>Baja</option><option>Media</option><option>Alta</option>
                  </select>
                  <textarea placeholder="Descripcion de la evidencia (fotos recibidas por fuera del sistema, etc.)"
                    value={form.evidencia_descripcion||''} onChange={e=>setForm(f=>({...f,evidencia_descripcion:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" rows={2} />
                </div>
              )}
```

Agregar `tipo_problema`, `descripcion_problema`, `urgencia`, `evidencia_descripcion` al objeto `form` inicial (mismo lugar que `advisor_user_id` de Task 1) e incluirlos en el `body` del POST en `createSolicitud`.

- [ ] **Step 7: Verificación manual**

Crear una solicitud tipo "Soporte Tecnico", confirmar que aparecen los campos propios, guardarla, y confirmar que NO aparece en la pestaña de cotizaciones/confirmadas (su estado es `N/A_SOPORTE`, no participa de ese flujo).

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/erp_documents.py backend/app/api/v1/erp_ventas.py backend/alembic/versions/fa6_018_soporte_tecnico.py backend/tests/test_soporte_tecnico.py frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx
git commit -m "feat: Soporte Tecnico con campos y flujo de estados propio, plazos de alerta por urgencia"
```

---

### Task 6: Autocompletar producto en Cotización

**Files:**
- Modify: `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`

**Interfaces:**
- Consumes: `GET /crm/products/search?q=...` (ya existe, ya usado en `solicitud-client.tsx:180`).

- [ ] **Step 1: Leer la sección actual de "Cotizar/Calcular Precios"**

Antes de editar, leer `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx` completo (es un archivo que no se ha abierto todavía en este plan) para ubicar exactamente dónde se agrega una línea de producto a la cotización y cómo está estructurado el estado de líneas — el patrón de autocompletar a copiar es el mismo ya usado en `solicitud-client.tsx` (función de búsqueda con debounce, cerca de su línea 180, y su lista de resultados desplegable).

- [ ] **Step 2: Implementar el autocompletar con fallback**

Agregar un campo de búsqueda de producto que, al escribir, llame `apiFetch('/crm/products/search?q=...')` (mismo endpoint, mismo patrón de debounce que ya existe en `solicitud-client.tsx`). Si la búsqueda no encuentra resultados tras completarse, mostrar un aviso con dos opciones: "Agregar como comentario" (guarda el texto escrito directamente como nombre de producto en la línea, marcado internamente como `es_libre: true`, sin bloquear la cotización) o, si más adelante existe el asistente de creación de producto de la spec de Catálogo Configurable, un enlace para crear el producto ahí.

- [ ] **Step 3: Verificación manual**

Abrir una cotización, buscar un producto que sí existe (debe autocompletar), buscar uno que no existe (debe ofrecer las dos opciones sin bloquear).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx
git commit -m "feat: autocompletar producto desde catalogo en Cotizar/Calcular Precios, con fallback a texto libre"
```

---

### Task 7: Enviar al Cliente con selección de canal

**Files:**
- Modify: `backend/app/models/erp_documents.py` (clase `SalesQuotation`)
- Create: `backend/alembic/versions/fa6_019_cotizacion_canal_envio.py`
- Modify: `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`
- Create: `backend/tests/test_cotizacion_canal_envio.py`

**Interfaces:**
- Produces: `SalesQuotation.canal_envio`.

- [ ] **Step 1: Agregar la columna**

En `backend/app/models/erp_documents.py`, clase `SalesQuotation`, agregar:

```python
    canal_envio = Column(String(20), nullable=True)
```

- [ ] **Step 2: Crear la migración**

Crear `backend/alembic/versions/fa6_019_cotizacion_canal_envio.py` (`down_revision` = cabeza real vigente, previsiblemente `fa6_018`):

```python
"""
fa6_019 - Canal de envio de la cotizacion al cliente

Revision ID: fa6_019
Revises: fa6_018
Create Date: 2026-09-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_019"
down_revision: Union[str, Sequence[str], None] = "fa6_018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.get_bind().execute(sa.text(
        "ALTER TABLE sales_quotations ADD COLUMN IF NOT EXISTS canal_envio VARCHAR(20)"
    ))


def downgrade() -> None:
    op.get_bind().execute(sa.text("ALTER TABLE sales_quotations DROP COLUMN IF EXISTS canal_envio"))
```

Run: `cd backend && ALEMBIC_ENV=testing DATABASE_URL="$TEST_DATABASE_URL" python -m alembic upgrade head`

- [ ] **Step 3: Escribir la prueba que falla primero**

Crear `backend/tests/test_cotizacion_canal_envio.py`:

```python
import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_actualizar_cotizacion_guarda_canal_envio(app_client, admin_token):
    cot = app_client.post("/api/v1/ventas/cotizaciones", json={
        "customer_name": f"Cliente-{uuid.uuid4().hex[:6]}",
    }, headers=_headers(admin_token)).json()["data"]
    r = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot['id']}",
                          json={"estado": "Enviada", "canal_envio": "WhatsApp"},
                          headers=_headers(admin_token))
    assert r.status_code == 200
    assert r.json()["data"]["canal_envio"] == "WhatsApp"
```

Run: `cd backend && pytest tests/test_cotizacion_canal_envio.py -v`
Expected: falla (canal_envio no está en la lista `allowed` de `update_cotizacion` todavía).

- [ ] **Step 4: Permitir el campo en `update_cotizacion`**

En `backend/app/api/v1/erp_ventas.py`, en `update_cotizacion` (línea ~482), agregar `"canal_envio"` a la lista `allowed` existente.

Y en `_cot_dict` (helper de respuesta de Cotización, buscar su definición igual que se hizo con `_sc_dict`), agregar `"canal_envio": cot.canal_envio,`.

- [ ] **Step 5: Correr la prueba y verificar que pasa**

Run: `cd backend && pytest tests/test_cotizacion_canal_envio.py -v`
Expected: PASS.

- [ ] **Step 6: Agregar el selector de canal en el frontend**

En `frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx`, en la función que hoy marca la cotización como "Enviada" (líneas ~410-424 según el descubrimiento), anteponer un modal/prompt que pida el canal (WhatsApp / Email / Otro) antes de hacer el PATCH. Si el canal es WhatsApp y la cotización tiene un teléfono de cliente, abrir en una pestaña nueva:

```tsx
window.open(`https://wa.me/${telefono.replace(/\D/g,'')}?text=${encodeURIComponent('Hola, aqui esta tu cotizacion '+numero)}`, '_blank');
```

Incluir `canal_envio` en el body del PATCH que marca la cotización como Enviada.

- [ ] **Step 7: Verificación manual**

Marcar una cotización como enviada, confirmar que pide el canal, y que al elegir WhatsApp abre la ventana con el mensaje y número correctos.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/erp_documents.py backend/app/api/v1/erp_ventas.py backend/alembic/versions/fa6_019_cotizacion_canal_envio.py backend/tests/test_cotizacion_canal_envio.py frontend/src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx
git commit -m "feat: seleccionar canal de envio (WhatsApp/Email/Otro) al enviar una cotizacion al cliente"
```

---

### Task 8: Navegación real a Cotización/Pedido y pantalla de detalle real

**Files:**
- Modify: `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`
- Modify: `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /cotizaciones/{id}` (ya existe, línea 464 de `erp_ventas.py`).

- [ ] **Step 1: Corregir los enlaces de "Ver Cotización" / "Ver Pedido de Venta"**

En `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx`, líneas ~1810 y ~1853-1854 (según el descubrimiento: botones que hoy enlazan a la lista general), cambiar el destino para que incluya el id específico, siguiendo el mismo patrón `?id=` que ya funciona para abrir el detalle de una Solicitud (línea ~606-609 de este mismo archivo). Leer esas líneas exactas primero para ver el `href`/`router.push` actual antes de cambiarlo, y apuntar a `/dashboard/ventas/cotizacion/{id}` (ruta de detalle individual) en vez de `/dashboard/ventas/cotizacion` (lista general) — usando el id real de la cotización/pedido de la fila correspondiente, no un valor fijo.

- [ ] **Step 2: Reemplazar los datos de ejemplo por datos reales en la pantalla de detalle**

Leer `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx` completo (mockup con cliente y productos de ejemplo fijos, según el descubrimiento). Reemplazar los datos fijos por una carga real:

```tsx
  const params = useParams();
  const [cotizacion, setCotizacion] = useState<any>(null);
  useEffect(() => {
    apiFetch(`/cotizaciones/${params.id}`).then((d:any) => setCotizacion(d?.data ?? d));
  }, [params.id]);
```

Ajustar el resto del componente para leer del estado `cotizacion` en vez de las constantes de ejemplo (mismo patrón `apiFetch` ya usado en el resto de esta carpeta — copiar el wrapper `apiFetch` local que ya usan `solicitud-client.tsx`/`cotizacion-client.tsx` si este archivo no lo tiene todavía).

- [ ] **Step 3: Verificación manual**

Desde una Solicitud con cotización, hacer clic en "Ver Cotización" — debe abrir el detalle de esa cotización específica con sus datos reales, no una maqueta ni la lista general.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx
git commit -m "fix: navegacion real al detalle de cotizacion/pedido, pantalla de detalle deja de ser una maqueta"
```
