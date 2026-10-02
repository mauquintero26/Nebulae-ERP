# Trazabilidad de Fecha de Entrega + Confirmación del Cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sola fuente de fecha de entrega estimada propagada SC→COT→PVEN→PEC (con trazabilidad de ediciones manuales y comparación con 1 día de tolerancia al recibir en bodega), más dos confirmaciones secuenciales del cliente por link público (Solicitud antes de cotizar, Cotización antes de crear el Pedido de Venta), más una alerta visible de documentos atrasados.

**Architecture:** Backend FastAPI (`backend/app/api/v1/erp_ventas.py` principalmente, más `erp_compras.py`), frontend Next.js/TypeScript. Reusa infraestructura ya existente: el mecanismo de sincronización `Cotización→Solicitud` (`_sincronizar_estado_solicitud_desde_cotizacion`) y movimiento de Lead de CRM, ya construidos en una sesión anterior — este plan completa las transiciones que esa tabla ya anticipaba pero que ningún código disparaba. También reusa el patrón de token seguro (`secrets.token_urlsafe` + SHA-256 + expiración + un solo uso) ya construido para el reset de contraseña.

**Tech Stack:** FastAPI + SQLAlchemy + Alembic (backend), Next.js 16/TypeScript/Tailwind (frontend), Postgres.

**Spec:** `docs/superpowers/specs/2026-10-01-trazabilidad-fechas-y-confirmacion-cliente-design.md` (incluye una corrección post-aprobación — léela completa, no solo el cuerpo original).

## Global Constraints

- Nunca romper la sincronización existente `_sincronizar_estado_solicitud_desde_cotizacion` (`erp_ventas.py:613-624`) ni el movimiento de Lead de CRM (`mover_lead_de_solicitud`, disparado desde `update_cotizacion`) — ambos ya funcionan, este plan los alimenta con transiciones nuevas, no los reemplaza.
- `CONFIRMADA` (en Solicitud y en Cotización) deja de ser alcanzable por PATCH manual/pastilla de un clic — solo por su acción dedicada correspondiente. Esto es un requisito de seguridad, no solo de UX (cierra los hallazgos ⚠️⚠️ de la sesión del 2026-09-30/10-01).
- El token crudo de confirmación nunca se persiste ni se loguea — solo su hash SHA-256 (mismo patrón que `password_reset_tokens`).
- Ningún PATCH existente a `CustomerRequest`/`SalesQuotation` cambia de forma para los campos que YA acepta hoy — solo se agregan validaciones/efectos nuevos.
- Toda migración Alembic nueva debe aplicar limpio contra `erp_test` con un solo head resultante (verificar con `alembic heads` antes de dar la tarea por completa).
- Advertencia obligatoria en cada dispatch de subagente que vaya a correr pytest: el teardown de `conftest.py` trunca ~40 tablas (incluida `users`) **incluso en una corrida de un solo archivo** — correr cualquier verificación manual en vivo ANTES de correr pytest, no después, o evitarlo si no es estrictamente necesario para la tarea puntual.

---

## Task 1: Fecha de entrega — Solicitud y Cotización

**Files:**
- Modify: `backend/app/models/erp_documents.py:54-86` (clase `CustomerRequest`)
- Create: `backend/alembic/versions/<nueva_revision>_fecha_entrega_sc_modalidad.py`
- Modify: `backend/app/api/v1/erp_ventas.py:287-338` (`create_solicitud`), `backend/app/api/v1/erp_ventas.py:423-470` (`confirmar_solicitud`)
- Test: `backend/tests/test_fecha_entrega_sc_cotizacion.py` (nuevo)

**Interfaces:**
- Produces: `CustomerRequest.fecha_entrega_estimada` (DateTime, nullable), `CustomerRequest.modalidad_entrega` (String, default `'NORMAL'`). Constante `DIAS_ENTREGA_DEFAULT = {"NORMAL": 18, "INMEDIATA": 3}` en `erp_ventas.py`, usada también por Task 2.
- Consumes: ninguno nuevo — usa `tipo_solicitud` ya existente en `CustomerRequest`.

- [ ] **Step 1: Agregar los campos al modelo**

En `backend/app/models/erp_documents.py`, dentro de `class CustomerRequest(Base):` (línea 54), agregar junto a los demás campos (después de `fecha_vencimiento` o donde ya estén agrupados los campos de fecha — revisar el archivo real y colocarlo junto a sus pares):

```python
    fecha_entrega_estimada = Column(DateTime, nullable=True)
    modalidad_entrega      = Column(String(20), nullable=False, default="NORMAL")
    # 'NORMAL' (15-18 dias) o 'INMEDIATA' (2-3 dias), derivado de tipo_solicitud
    # al crear la Solicitud. Ver DIAS_ENTREGA_DEFAULT en erp_ventas.py.
```

- [ ] **Step 2: Migración Alembic**

```bash
cd backend && alembic revision -m "fecha_entrega_sc_modalidad"
```

Editar el archivo generado (ajustar `down_revision` al head real actual, confirmarlo con `alembic heads` antes de escribir el valor):

```python
def upgrade() -> None:
    op.add_column('customer_requests', sa.Column('fecha_entrega_estimada', sa.DateTime(), nullable=True))
    op.add_column('customer_requests', sa.Column('modalidad_entrega', sa.String(length=20), nullable=False, server_default='NORMAL'))

def downgrade() -> None:
    op.drop_column('customer_requests', 'modalidad_entrega')
    op.drop_column('customer_requests', 'fecha_entrega_estimada')
```

- [ ] **Step 3: Aplicar la migración y confirmar un solo head**

```bash
cd backend && alembic upgrade head && alembic heads
```

Expected: `alembic heads` imprime exactamente una revisión (la nueva).

- [ ] **Step 4: Test que falla — modalidad derivada de tipo_solicitud al crear**

`backend/tests/test_fecha_entrega_sc_cotizacion.py`:

```python
import pytest
from datetime import datetime, timedelta

def test_crear_solicitud_normal_deriva_modalidad_normal(client, db_session, auth_headers):
    resp = client.post("/api/v1/ventas/solicitudes", json={
        "customer_name": "Cliente Prueba", "tipo_solicitud": "Cotizacion de Producto",
        "advisor_name": "Asesor Prueba", "created_by": "test",
    }, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["data"]["modalidad_entrega"] == "NORMAL"

def test_crear_solicitud_inmediata_deriva_modalidad_inmediata(client, db_session, auth_headers):
    resp = client.post("/api/v1/ventas/solicitudes", json={
        "customer_name": "Cliente Prueba", "tipo_solicitud": "Pedido Inmediato",
        "advisor_name": "Asesor Prueba", "created_by": "test",
    }, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["data"]["modalidad_entrega"] == "INMEDIATA"

def test_confirmar_solicitud_calcula_fecha_segun_modalidad(client, db_session, auth_headers):
    sc_resp = client.post("/api/v1/ventas/solicitudes", json={
        "customer_name": "Cliente Prueba", "tipo_solicitud": "Pedido Inmediato",
        "advisor_name": "Asesor Prueba", "created_by": "test",
    }, headers=auth_headers)
    sc_id = sc_resp.json()["data"]["id"]
    # Fuerza el estado a CONFIRMADA directo en el test (el gate real via token es Task 4)
    from app.models.erp_documents import CustomerRequest
    sc = db_session.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    sc.estado = "CONFIRMADA"
    db_session.commit()

    confirm_resp = client.post(f"/api/v1/ventas/solicitudes/{sc_id}/confirmar", json={"user_name": "test"}, headers=auth_headers)
    assert confirm_resp.status_code == 200
    cot = confirm_resp.json()["data"]["cotizacion"]
    sc_after = confirm_resp.json()["data"]["sc"]
    assert sc_after["fecha_entrega_estimada"] is not None
    expected = datetime.utcnow() + timedelta(days=3)
    actual = datetime.fromisoformat(sc_after["fecha_entrega_estimada"].replace("Z", ""))
    assert abs((actual - expected).total_seconds()) < 60  # tolerancia de reloj del test
    assert cot["fecha_entrega_estimada"] == sc_after["fecha_entrega_estimada"]  # heredada, no recalculada
```

Nota: el tercer test asume que `confirmar_solicitud` ya exige `estado == "CONFIRMADA"` — **eso lo cambia Task 4**. Para este Task 1, si `confirmar_solicitud` todavía acepta `BORRADOR`/`PENDIENTE_CONFIRMACION` (su precondición de hoy, sin tocar todavía), el test debe setear el estado a uno de esos dos en vez de `CONFIRMADA`, y se ajusta en Task 4 cuando la precondición cambie. Usa el estado que la precondición ACTUAL acepte en el momento de escribir este test — confirma leyendo `erp_ventas.py:430` antes de escribir la última línea del setup.

- [ ] **Step 5: Correr el test, confirmar que falla**

```bash
cd backend && ./run_tests.sh tests/test_fecha_entrega_sc_cotizacion.py -v
```
Expected: FAIL (modalidad_entrega no existe aún en el dict de respuesta / fecha_entrega_estimada no se calcula).

- [ ] **Step 6: Implementar — `create_solicitud` deriva modalidad**

En `erp_ventas.py`, cerca del inicio del archivo (junto a otras constantes de módulo), agregar:

```python
DIAS_ENTREGA_DEFAULT = {"NORMAL": 18, "INMEDIATA": 3}
```

Dentro de `create_solicitud` (línea ~287+, donde se construye el objeto `CustomerRequest` antes de `db.add`), agregar antes de la construcción:

```python
    modalidad_entrega = "INMEDIATA" if body.get("tipo_solicitud") == "Pedido Inmediato" else "NORMAL"
```

Y pasar `modalidad_entrega=modalidad_entrega` en el constructor de `CustomerRequest(...)`.

- [ ] **Step 7: Implementar — `confirmar_solicitud` calcula fecha real en vez de hardcode**

En `confirmar_solicitud` (línea 423+), reemplazar la línea 447 (`entrega_est = datetime.datetime.utcnow() + datetime.timedelta(days=15)`) por:

```python
    dias = DIAS_ENTREGA_DEFAULT.get(sc.modalidad_entrega, DIAS_ENTREGA_DEFAULT["NORMAL"])
    entrega_est = datetime.datetime.utcnow() + datetime.timedelta(days=dias)
    sc.fecha_entrega_estimada = entrega_est
```

(la variable `entrega_est` ya se usa más abajo para `cot.fecha_entrega_estimada=entrega_est` en el constructor de `SalesQuotation` — no cambia esa línea, solo de dónde sale el valor). Agregar `sc.fecha_entrega_estimada = entrega_est` ANTES del `db.commit()` de la línea 438 (el mismo commit que ya persiste `sc.estado`), para que quede en la misma transacción.

- [ ] **Step 8: Confirmar que `_sc_dict`/`_cot_dict` ya serializan los campos nuevos**

Revisar `_sc_dict` y `_cot_dict` (buscar sus definiciones en `erp_ventas.py`) — si construyen el dict campo por campo (no con un helper genérico tipo `vars(obj)`), agregar `"fecha_entrega_estimada": sc.fecha_entrega_estimada.isoformat() if sc.fecha_entrega_estimada else None` y `"modalidad_entrega": sc.modalidad_entrega` en `_sc_dict` si no están ya (son campos nuevos, no existían antes de este task).

- [ ] **Step 9: Correr el test, confirmar que pasa**

```bash
cd backend && ./run_tests.sh tests/test_fecha_entrega_sc_cotizacion.py -v
```
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/app/models/erp_documents.py backend/alembic/versions/*fecha_entrega_sc_modalidad.py backend/app/api/v1/erp_ventas.py backend/tests/test_fecha_entrega_sc_cotizacion.py
git commit -m "feat(ventas): fecha de entrega real segun modalidad, reemplaza hardcode de 15 dias"
```

---

## Task 2: PEC hereda fecha del PVEN + trazabilidad de ediciones manuales

**Files:**
- Modify: `backend/app/api/v1/erp_compras.py:605-670` (`create_pec`)
- Modify: `backend/app/api/v1/erp_ventas.py` (`update_solicitud` línea ~395-420, `update_cotizacion` línea ~627-660), `erp_ventas_fase4.py` (PATCH de PVEN — localizar su handler de update), `erp_compras.py` (PATCH de PEC — localizar su handler de update)
- Test: `backend/tests/test_pec_hereda_fecha_pven.py` (nuevo), `backend/tests/test_fecha_entrega_actividad_log.py` (nuevo)

**Interfaces:**
- Consumes: `SaleOrder.fecha_entrega_estimada` (ya existe, `erp_documents.py:138`), `DIAS_ENTREGA_DEFAULT` (Task 1).
- Produces: ninguna interfaz nueva — solo comportamiento.

- [ ] **Step 1: Test que falla — PEC con ven_id hereda la fecha real del PVEN**

`backend/tests/test_pec_hereda_fecha_pven.py`:

```python
from datetime import datetime, timedelta

def test_pec_con_ven_id_hereda_fecha_del_pven(client, db_session, auth_headers):
    from app.models.erp_documents import SaleOrder
    ven = SaleOrder(numero="PVEN-TEST001", customer_name="Cliente Prueba",
                     fecha_entrega_estimada=datetime.utcnow() + timedelta(days=7),
                     estado="PENDIENTE_COMPRA", productos=[])
    db_session.add(ven); db_session.commit(); db_session.refresh(ven)

    resp = client.post("/api/v1/compras/pedidos", json={
        "supplier_name": "Proveedor Prueba", "ven_id": ven.id, "ven_numero": ven.numero,
        "dias_entrega": 15,  # debe ser IGNORADO porque hay ven_id con fecha propia
        "productos": [{"nombre": "Producto X", "unit_price_cop": 1000}],
    }, headers=auth_headers)
    assert resp.status_code == 201
    pec_fecha = resp.json()["data"]["fecha_entrega_estimada"]
    assert pec_fecha == ven.fecha_entrega_estimada.isoformat()

def test_pec_sin_ven_id_usa_dias_entrega_manual(client, db_session, auth_headers):
    resp = client.post("/api/v1/compras/pedidos", json={
        "supplier_name": "Proveedor Prueba", "dias_entrega": 20,
        "productos": [{"nombre": "Producto X", "unit_price_cop": 1000}],
    }, headers=auth_headers)
    assert resp.status_code == 201
    # Sin ven_id, se mantiene el comportamiento actual (fecha_compra + dias_entrega)
    assert resp.json()["data"]["fecha_entrega_estimada"] is not None
```

- [ ] **Step 2: Correr, confirmar que el primer test falla**

```bash
cd backend && ./run_tests.sh tests/test_pec_hereda_fecha_pven.py -v
```

- [ ] **Step 3: Implementar — `create_pec` hereda cuando hay `ven_id`**

En `erp_compras.py`, dentro de `create_pec` (línea 605+), reemplazar las líneas 609-611:

```python
    days = body.dias_entrega
    entrega_est = datetime.datetime.utcnow() + datetime.timedelta(days=days)
    alerta = entrega_est
```

por:

```python
    entrega_est = None
    if body.ven_id:
        ven = db.query(SaleOrder).filter(SaleOrder.id == body.ven_id).first()
        if ven and ven.fecha_entrega_estimada:
            entrega_est = ven.fecha_entrega_estimada
    if entrega_est is None:
        # Sin ven_id, o el PVEN no tiene fecha propia todavia (caso raro): comportamiento actual
        entrega_est = datetime.datetime.utcnow() + datetime.timedelta(days=body.dias_entrega)
    alerta = entrega_est
```

Confirmar que `SaleOrder` ya está importado en este archivo (revisar imports al inicio de `erp_compras.py`; si no lo está, agregar `from app.models.erp_documents import SaleOrder` junto a los demás imports de modelos de ese mismo archivo).

- [ ] **Step 4: Correr, confirmar que pasa**

```bash
cd backend && ./run_tests.sh tests/test_pec_hereda_fecha_pven.py -v
```

- [ ] **Step 5: Test que falla — editar la fecha manualmente deja actividad con diferencia en días**

`backend/tests/test_fecha_entrega_actividad_log.py` (cubre SC; el mismo patrón se replica para COT/PVEN/PEC en los Steps 7-9, no se repite el archivo completo por brevedad — un archivo de test por entidad, mismo patrón):

```python
from datetime import datetime, timedelta

def test_editar_fecha_entrega_sc_registra_actividad(client, db_session, auth_headers):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TEST001", customer_name="Cliente Prueba",
                          estado="BORRADOR", fecha_entrega_estimada=datetime.utcnow() + timedelta(days=15))
    db_session.add(sc); db_session.commit(); db_session.refresh(sc)
    fecha_vieja = sc.fecha_entrega_estimada
    fecha_nueva = fecha_vieja + timedelta(days=5)

    resp = client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "fecha_entrega_estimada": fecha_nueva.isoformat(), "updated_by": "test",
    }, headers=auth_headers)
    assert resp.status_code == 200

    log_resp = client.get(f"/api/v1/ventas/solicitudes/{sc.id}").json()["data"]
    actividades = log_resp.get("actividades", [])
    cambio = next((a for a in actividades if a["action"] == "FECHA_ENTREGA_MODIFICADA"), None)
    assert cambio is not None
    assert "+5" in cambio["description"] or "5 día" in cambio["description"]
```

- [ ] **Step 6: Correr, confirmar que falla**

- [ ] **Step 7: Implementar — `update_solicitud` registra el cambio de fecha**

En `erp_ventas.py`, dentro de `update_solicitud` (la función con el bloque `allowed = [...]` visto en línea ~400-420), ANTES del `for k in allowed:` loop, capturar el valor viejo si `fecha_entrega_estimada` viene en el body:

```python
    fecha_vieja = sc.fecha_entrega_estimada if "fecha_entrega_estimada" in body else None
```

Y DESPUÉS del bloque que ya loguea `ESTADO_CHANGED` (después de la línea 419 `user_name=body.get("updated_by"))`), agregar:

```python
    if fecha_vieja is not None and sc.fecha_entrega_estimada and sc.fecha_entrega_estimada != fecha_vieja:
        diff_dias = (sc.fecha_entrega_estimada - fecha_vieja).days
        signo = "+" if diff_dias >= 0 else ""
        _log(db, "SC", sc.id, sc.numero, "FECHA_ENTREGA_MODIFICADA",
             f"Fecha de entrega modificada: {fecha_vieja.strftime('%d/%m/%Y')} -> "
             f"{sc.fecha_entrega_estimada.strftime('%d/%m/%Y')} ({signo}{diff_dias} día{'s' if abs(diff_dias)!=1 else ''})",
             user_name=body.get("updated_by"))
```

- [ ] **Step 8: Correr, confirmar que pasa**

- [ ] **Step 9: Replicar el mismo patrón (capturar valor viejo antes del loop de `allowed`, loguear `FECHA_ENTREGA_MODIFICADA` después) en:**
  - `update_cotizacion` (`erp_ventas.py:627-660`) — ya tiene `fecha_entrega_estimada` en su propio `allowed` (línea 638), mismo patrón exacto.
  - El handler PATCH de `SaleOrder` (PVEN) en `erp_ventas_fase4.py` — localizarlo (buscar `@router.patch` cerca de donde vive `SaleOrder`), confirmar que ya acepta `fecha_entrega_estimada` en su propio `allowed`/lista de campos; si no la acepta todavía, agregarla.
  - El handler PATCH de `PurchaseOrderFull` (PEC) en `erp_compras.py` — mismo patrón.
  
  Para cada uno, escribir su propio test siguiendo el patrón exacto del Step 5 (mismo nombre de archivo con sufijo `_cot`/`_pven`/`_pec`), confirmar que falla, implementar, confirmar que pasa — no se repite el código completo de cada test aquí por brevedad, pero cada uno es una copia directa del test de SC cambiando el endpoint y el modelo.

- [ ] **Step 10: Commit**

```bash
git add backend/app/api/v1/erp_compras.py backend/app/api/v1/erp_ventas.py backend/app/api/v1/erp_ventas_fase4.py backend/tests/test_pec_hereda_fecha_pven.py backend/tests/test_fecha_entrega_actividad_log*.py
git commit -m "feat(compras,ventas): PEC hereda fecha real del PVEN; registra cambios manuales de fecha en Actividad"
```

---

## Task 3: Recepciones — comparación estimado vs. real con 1 día de tolerancia

**Decisión de alcance (ver nota en la spec):** `confirmar_recepcion` (`erp_compras.py:1773+`) es una función con manejo de idempotencia de 2 transacciones ya muy sensible — se evita tocar su interior. En vez de persistir `dias_retraso` al confirmar, se calcula **al leer** (en el serializador `_gr_dict`), comparando `GoodsReceipt.fecha_recepcion` (ya existe, ya se persiste) contra `PurchaseOrderFull.fecha_entrega_estimada` del PEC vinculado (join simple por `pec_id`). Sin migración nueva, sin tocar la transacción de confirmación.

**Files:**
- Modify: `backend/app/api/v1/erp_compras.py` (función `_gr_dict`, buscar su definición — es el serializador de `GoodsReceipt`, análogo a `_pec_dict`/`_log_dict` ya vistos en este archivo)
- Test: `backend/tests/test_recepcion_dias_retraso.py` (nuevo)

**Interfaces:**
- Consumes: `PurchaseOrderFull.fecha_entrega_estimada` (ya existe).
- Produces: campo de respuesta `dias_retraso` (no persistido) en el dict que devuelve `GET /recepciones/{id}` y `GET /recepciones`.

- [ ] **Step 1: Test que falla**

```python
from datetime import datetime, timedelta

def test_recepcion_a_tiempo_no_marca_retraso(client, db_session, auth_headers):
    from app.models.erp_documents import PurchaseOrderFull, GoodsReceipt
    pec = PurchaseOrderFull(numero="PEC-TEST001", supplier_name="Proveedor Prueba",
                             estado="RECIBIDO", fecha_entrega_estimada=datetime.utcnow() - timedelta(days=1),
                             tracking_stages=[], productos=[])
    db_session.add(pec); db_session.commit(); db_session.refresh(pec)
    gr = GoodsReceipt(numero="ENINV-TEST001", pec_id=pec.id, pec_numero=pec.numero,
                       fecha_recepcion=datetime.utcnow(), productos=[])  # llegó el mismo día + tolerancia
    db_session.add(gr); db_session.commit(); db_session.refresh(gr)

    resp = client.get(f"/api/v1/compras/recepciones/{gr.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["dias_retraso"] is None

def test_recepcion_tardia_marca_dias_retraso(client, db_session, auth_headers):
    from app.models.erp_documents import PurchaseOrderFull, GoodsReceipt
    pec = PurchaseOrderFull(numero="PEC-TEST002", supplier_name="Proveedor Prueba",
                             estado="RECIBIDO", fecha_entrega_estimada=datetime.utcnow() - timedelta(days=5),
                             tracking_stages=[], productos=[])
    db_session.add(pec); db_session.commit(); db_session.refresh(pec)
    gr = GoodsReceipt(numero="ENINV-TEST002", pec_id=pec.id, pec_numero=pec.numero,
                       fecha_recepcion=datetime.utcnow(), productos=[])  # 5 dias despues del estimado (+1 tolerancia = 4 de retraso real)
    db_session.add(gr); db_session.commit(); db_session.refresh(gr)

    resp = client.get(f"/api/v1/compras/recepciones/{gr.id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["dias_retraso"] == 4
```

- [ ] **Step 2: Correr, confirmar que falla** (`dias_retraso` no existe en la respuesta todavía).

- [ ] **Step 3: Implementar en `_gr_dict`**

Localizar la función `_gr_dict` en `erp_compras.py` (serializador de `GoodsReceipt`, junto a `_pec_dict`). Agregar, antes del `return {...}`:

```python
    dias_retraso = None
    if gr.pec_id and gr.fecha_recepcion:
        pec_ref = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == gr.pec_id).first()
        if pec_ref and pec_ref.fecha_entrega_estimada:
            limite_con_tolerancia = pec_ref.fecha_entrega_estimada + datetime.timedelta(days=1)
            delta = (gr.fecha_recepcion - limite_con_tolerancia).days
            if delta > 0:
                dias_retraso = delta
```

y agregar `"dias_retraso": dias_retraso` al dict devuelto. **Nota:** si `_gr_dict` no recibe `db` como parámetro hoy, agregarlo a su firma y a todos sus call-sites dentro del mismo archivo (debería ser un cambio mecánico de pocas líneas — confirmar cuántos call-sites tiene con `grep -n "_gr_dict(" backend/app/api/v1/erp_compras.py` antes de decidir la forma final).

- [ ] **Step 4: Correr, confirmar que pasa.**

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/erp_compras.py backend/tests/test_recepcion_dias_retraso.py
git commit -m "feat(compras): Recepciones expone dias_retraso comparando contra la fecha prometida del PEC, con 1 dia de tolerancia"
```

---

## Task 4: Infraestructura de confirmación por link + Gate 1 (Solicitud)

**Files:**
- Create: `backend/app/models/confirmation.py` (o agregar a `erp_documents.py` — decidir según dónde vivan ya los modelos de SC/COT, para mantenerlos cerca)
- Create: `backend/alembic/versions/<rev>_document_confirmation_tokens.py`
- Create: `backend/app/core/confirmation_tokens.py`
- Modify: `backend/app/api/v1/erp_ventas.py` (nuevo router `/confirmar`, nueva acción `enviar_para_confirmacion`, `update_solicitud` para auto-promover `ASIGNADA`, `confirmar_solicitud` cambia precondición)
- Modify: `backend/main.py` (registrar el nuevo router, sin autenticación)
- Modify: `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx` (`ESTADOS_SC_MANUALES` reducido), `frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx` (botón "Enviar para confirmación")
- Create: `frontend/src/app/confirmar/[token]/page.tsx`
- Test: `backend/tests/test_confirmacion_solicitud.py` (nuevo)

**Interfaces:**
- Produces: `create_confirmation_token(db, document_type, document_id) -> str`, `verify_and_consume_token(db, token) -> tuple[str, int] | None` (ambas en `confirmation_tokens.py`, consumidas también por Task 5).
- Consumes: `send_email` (`backend/app/core/email.py`, ya existe del trabajo de reset de contraseña).

- [ ] **Step 1: Confirmar cómo quedó el patrón de token del reset de contraseña**

Leer `backend/app/api/v1/auth.py` (las secciones `forgot_password`/`reset_password`, ya implementadas) y `backend/app/models/users.py` (`PasswordResetToken`) completos antes de escribir el modelo nuevo — si el hashing/expiración quedó como lógica inline en `auth.py` (no como función reusable), este Task **duplica el patrón exacto** (mismo uso de `secrets.token_urlsafe(32)` + `hashlib.sha256`) en el módulo nuevo en vez de importar desde `auth.py` — no se refactoriza `auth.py` para extraer un helper compartido, eso sería tocar código ya probado y comiteado sin necesidad.

- [ ] **Step 2: Modelo `DocumentConfirmationToken`**

```python
# backend/app/models/confirmation.py
from sqlalchemy import Column, Integer, String, DateTime
from app.db.database import Base
from datetime import datetime

class DocumentConfirmationToken(Base):
    __tablename__ = "document_confirmation_tokens"
    id              = Column(Integer, primary_key=True, index=True)
    document_type   = Column(String(10), nullable=False)   # 'SC' | 'COT'
    document_id     = Column(Integer, nullable=False)
    token_hash      = Column(String(64), nullable=False, index=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    expires_at      = Column(DateTime, nullable=False)
    used_at         = Column(DateTime, nullable=True)
```

Registrar en `backend/app/models/__init__.py` junto a los demás imports de modelos.

- [ ] **Step 3: Migración**

```bash
cd backend && alembic revision -m "document_confirmation_tokens"
```

```python
def upgrade() -> None:
    op.create_table('document_confirmation_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('document_type', sa.String(length=10), nullable=False),
        sa.Column('document_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_document_confirmation_tokens_token_hash', 'document_confirmation_tokens', ['token_hash'])
    op.create_index('ix_document_confirmation_tokens_doc', 'document_confirmation_tokens', ['document_type', 'document_id'])

def downgrade() -> None:
    op.drop_table('document_confirmation_tokens')
```

Aplicar (`alembic upgrade head`), confirmar un solo head.

- [ ] **Step 4: Módulo compartido de tokens**

```python
# backend/app/core/confirmation_tokens.py
import secrets, hashlib
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.confirmation import DocumentConfirmationToken

TOKEN_TTL_DAYS = 2  # mismo umbral que la alerta de 2 dias ya configurable

def create_confirmation_token(db: Session, document_type: str, document_id: int) -> str:
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    row = DocumentConfirmationToken(
        document_type=document_type, document_id=document_id, token_hash=token_hash,
        created_at=datetime.utcnow(), expires_at=datetime.utcnow() + timedelta(days=TOKEN_TTL_DAYS),
    )
    db.add(row); db.commit()
    return raw_token

def verify_and_consume_token(db: Session, token: str) -> tuple[str, int] | None:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.token_hash == token_hash
    ).first()
    if not row or row.used_at is not None or row.expires_at < datetime.utcnow():
        return None
    row.used_at = datetime.utcnow()
    db.commit()
    return (row.document_type, row.document_id)

def peek_token(db: Session, token: str) -> tuple[str, int] | None:
    """Como verify_and_consume_token pero NO marca usado -- para el GET de solo lectura."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = db.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.token_hash == token_hash
    ).first()
    if not row or row.used_at is not None or row.expires_at < datetime.utcnow():
        return None
    return (row.document_type, row.document_id)
```

- [ ] **Step 5: Test que falla — enviar para confirmación + confirmar vía link**

```python
# backend/tests/test_confirmacion_solicitud.py
def test_enviar_sc_para_confirmacion_requiere_asesor(client, db_session, auth_headers):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF1", customer_name="Cliente Prueba", estado="BORRADOR")
    db_session.add(sc); db_session.commit(); db_session.refresh(sc)

    resp = client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "test"}, headers=auth_headers)
    assert resp.status_code == 400  # sin asesor asignado todavia

def test_asignar_asesor_promueve_a_asignada(client, db_session, auth_headers):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF2", customer_name="Cliente Prueba", estado="BORRADOR")
    db_session.add(sc); db_session.commit(); db_session.refresh(sc)

    resp = client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"advisor_user_id": 1, "updated_by": "test"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["estado"] == "ASIGNADA"

def test_enviar_y_confirmar_via_link(client, db_session, auth_headers):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF3", customer_name="Cliente Prueba",
                          customer_email="cliente@test.com", estado="ASIGNADA", advisor_user_id=1)
    db_session.add(sc); db_session.commit(); db_session.refresh(sc)

    resp = client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"user_name": "test"}, headers=auth_headers)
    assert resp.status_code == 200
    db_session.refresh(sc)
    assert sc.estado == "PENDIENTE_CONFIRMACION"

    from app.models.confirmation import DocumentConfirmationToken
    token_row = db_session.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.document_type == "SC", DocumentConfirmationToken.document_id == sc.id
    ).order_by(DocumentConfirmationToken.id.desc()).first()
    assert token_row is not None
    # El token crudo no esta persistido -- lo generamos de nuevo con el mismo mecanismo para simular el link real
    import hashlib, secrets
    # (en un test real end-to-end se interceptaria send_email; aqui se prueba la consulta GET/POST con un token minteado igual que en el agente de reset de password)
    from app.core.confirmation_tokens import create_confirmation_token, verify_and_consume_token
    raw = create_confirmation_token(db_session, "SC", sc.id)

    get_resp = client.get(f"/api/v1/confirmar/{raw}")
    assert get_resp.status_code == 200
    assert get_resp.json()["data"]["numero"] == "SC-TESTCONF3"

    post_resp = client.post(f"/api/v1/confirmar/{raw}", headers={"Idempotency-Key": "test-key-1"})
    assert post_resp.status_code == 200
    db_session.refresh(sc)
    assert sc.estado == "CONFIRMADA"

    # Reintento con el mismo token ya usado
    post_resp2 = client.post(f"/api/v1/confirmar/{raw}", headers={"Idempotency-Key": "test-key-2"})
    assert post_resp2.status_code == 400

def test_confirmar_solicitud_exige_confirmada(client, db_session, auth_headers):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero="SC-TESTCONF4", customer_name="Cliente Prueba", estado="ASIGNADA")
    db_session.add(sc); db_session.commit(); db_session.refresh(sc)
    resp = client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "test"}, headers=auth_headers)
    assert resp.status_code == 400
```

- [ ] **Step 6: Correr, confirmar que fallan.**

- [ ] **Step 7: Implementar — auto-promoción a `ASIGNADA` en `update_solicitud`**

En `update_solicitud` (`erp_ventas.py`, el bloque visto en líneas 395-420), ANTES del loop `for k in allowed:`, capturar si se está asignando asesor por primera vez:

```python
    promueve_asignada = (
        "advisor_user_id" in body and body.get("advisor_user_id")
        and not sc.advisor_user_id and sc.estado == "BORRADOR"
    )
```

Después de aplicar el loop `for k in allowed:` (línea 411) pero ANTES de `sc.updated_at = ...` (línea 412), agregar:

```python
    if promueve_asignada:
        sc.estado = "ASIGNADA"
```

(esto hace que el `old_estado != sc.estado` check de la línea 415 ya existente detecte el cambio y lo loguee automáticamente como `ESTADO_CHANGED` — no hace falta un `_log` adicional aquí).

- [ ] **Step 8: Implementar — endpoint `enviar_para_confirmacion`**

En `erp_ventas.py`, cerca de `confirmar_solicitud`:

```python
@router.post("/solicitudes/{sc_id}/enviar-confirmacion")
def enviar_solicitud_para_confirmacion(sc_id: int, body: dict,
        user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    sc = db.query(CustomerRequest).filter(CustomerRequest.id == sc_id).first()
    if not sc:
        raise HTTPException(404, "Solicitud no encontrada")
    if sc.estado != "ASIGNADA":
        raise HTTPException(400, f"La solicitud debe estar Asignada antes de enviar para confirmación (estado actual: {sc.estado})")

    from app.core.confirmation_tokens import create_confirmation_token
    from app.core.email import send_email
    import os

    raw_token = create_confirmation_token(db, "SC", sc.id)
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5100").rstrip("/")
    link = f"{frontend_url}/confirmar/{raw_token}"

    old_estado = sc.estado
    sc.estado = "PENDIENTE_CONFIRMACION"
    sc.updated_at = datetime.datetime.utcnow()
    db.commit()
    _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED", "Enviada para confirmación del cliente",
         old_estado=old_estado, new_estado="PENDIENTE_CONFIRMACION", user_name=body.get("user_name"))

    if sc.customer_email:
        send_email(sc.customer_email, f"Confirma tu solicitud {sc.numero} - Nebulae",
                    f'<p>Por favor confirma tu solicitud haciendo clic aquí: <a href="{link}">{link}</a></p>')

    return {"status": "success", "data": _sc_dict(sc), "link_confirmacion": link}
```

- [ ] **Step 9: Implementar — router público `/confirmar`**

Nuevo archivo `backend/app/api/v1/confirmacion_publica.py`:

```python
from fastapi import APIRouter, HTTPException, Depends, Header
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.core.confirmation_tokens import peek_token, verify_and_consume_token

router = APIRouter()

GENERIC_ERROR = "El enlace no es válido o ya expiró."

@router.get("/confirmar/{token}")
def ver_confirmacion(token: str, db: Session = Depends(get_db)):
    resolved = peek_token(db, token)
    if not resolved:
        raise HTTPException(400, GENERIC_ERROR)
    document_type, document_id = resolved
    if document_type == "SC":
        from app.api.v1.erp_ventas import CustomerRequest, _sc_dict
        doc = db.query(CustomerRequest).filter(CustomerRequest.id == document_id).first()
        if not doc:
            raise HTTPException(400, GENERIC_ERROR)
        return {"status": "success", "data": _sc_dict(doc)}
    elif document_type == "COT":
        from app.api.v1.erp_ventas import SalesQuotation, _cot_dict
        doc = db.query(SalesQuotation).filter(SalesQuotation.id == document_id).first()
        if not doc:
            raise HTTPException(400, GENERIC_ERROR)
        return {"status": "success", "data": _cot_dict(doc)}
    raise HTTPException(400, GENERIC_ERROR)

@router.post("/confirmar/{token}")
def confirmar_via_token(token: str, idempotency_key: str = Header(..., alias="Idempotency-Key"), db: Session = Depends(get_db)):
    resolved = verify_and_consume_token(db, token)
    if not resolved:
        raise HTTPException(400, GENERIC_ERROR)
    document_type, document_id = resolved
    if document_type == "SC":
        from app.api.v1.erp_ventas import CustomerRequest, _log
        import datetime
        sc = db.query(CustomerRequest).filter(CustomerRequest.id == document_id).first()
        if not sc:
            raise HTTPException(400, GENERIC_ERROR)
        old_estado = sc.estado
        sc.estado = "CONFIRMADA"
        sc.updated_at = datetime.datetime.utcnow()
        db.commit()
        _log(db, "SC", sc.id, sc.numero, "ESTADO_CHANGED", "Confirmada por el cliente vía enlace",
             old_estado=old_estado, new_estado="CONFIRMADA", user_name="Cliente (confirmación por link)")
        return {"status": "success", "message": "Solicitud confirmada. Gracias."}
    elif document_type == "COT":
        # Implementado en Task 5 -- este bloque se completa ahí, no antes.
        raise HTTPException(501, "Confirmación de Cotización aún no implementada (Task 5)")
    raise HTTPException(400, GENERIC_ERROR)
```

Nota: la rama `document_type == "COT"` queda con un `501` explícito hasta Task 5 — **no es un placeholder prohibido por la skill de planes** porque es código real, que compila, se prueba (nadie llama esta rama todavía porque Task 4 nunca crea tokens `COT`) y documenta honestamente que Task 5 lo completa — no es un "TODO" vago sin contenido.

Registrar el router en `backend/main.py` (buscar dónde se incluyen los demás `app.include_router(...)`, agregar sin prefix de autenticación, ej. `app.include_router(confirmacion_publica.router, prefix="/api/v1", tags=["confirmacion-publica"])`).

- [ ] **Step 10: Implementar — `confirmar_solicitud` exige `CONFIRMADA`**

En `confirmar_solicitud` (línea 430), cambiar:
```python
    if sc.estado not in ("BORRADOR", "PENDIENTE_CONFIRMACION"):
```
por:
```python
    if sc.estado != "CONFIRMADA":
```

- [ ] **Step 11: Correr todos los tests de este task, confirmar que pasan.**

```bash
cd backend && ./run_tests.sh tests/test_confirmacion_solicitud.py tests/test_fecha_entrega_sc_cotizacion.py -v
```

(se incluye el de Task 1 porque su test #3 depende de la precondición que este task acaba de cambiar — ajustar ese test si hace falta, usando `CONFIRMADA` ahora que ya es la precondición real).

- [ ] **Step 12: Frontend — reducir `ESTADOS_SC_MANUALES`**

En `frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx:58-60`, cambiar:
```typescript
export const ESTADOS_SC_MANUALES: Record<string, {label:string; color:string; bg:string; border:string}> = Object.fromEntries(
  Object.entries(ESTADOS_SC).filter(([k]) => ['BORRADOR','PENDIENTE_CONFIRMACION','CONFIRMADA','CANCELADA'].includes(k))
);
```
por:
```typescript
export const ESTADOS_SC_MANUALES: Record<string, {label:string; color:string; bg:string; border:string}> = Object.fromEntries(
  Object.entries(ESTADOS_SC).filter(([k]) => ['BORRADOR','CANCELADA'].includes(k))
);
```

- [ ] **Step 13: Frontend — botón "Enviar para confirmación" en `solicitud/[id]/page.tsx`**

En el tab "Acciones" (sección `canConfirmarSC` ya existente, lines ~392-407 según el estado actual del archivo tras la Mejora 2), agregar un botón hermano que se muestre cuando `solicitud?.estado === 'ASIGNADA'`:

```tsx
{solicitud?.estado === 'ASIGNADA' && (
  <Button color="indigo" size="lg" icon={Send} loading={sendingConfirmacion} onClick={enviarParaConfirmacion}>
    Enviar para Confirmación
  </Button>
)}
```

Con su handler:
```tsx
async function enviarParaConfirmacion() {
  if (!solicitud) return;
  setSendingConfirmacion(true);
  try {
    await apiFetch(`/ventas/solicitudes/${solicitud.id}/enviar-confirmacion`, { method: 'POST', body: JSON.stringify({ user_name: currentUser }) });
    await loadSolicitud();
  } catch (err: any) {
    alert('Error: ' + err.message);
  }
  setSendingConfirmacion(false);
}
```
(agregar `sendingConfirmacion`/`setSendingConfirmacion` como nuevo `useState(false)`, e importar `Send` de `lucide-react` si no está ya importado).

- [ ] **Step 14: Frontend — página pública `/confirmar/[token]`**

```tsx
// frontend/src/app/confirmar/[token]/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function ConfirmarPublicoPage() {
  const params = useParams();
  const token = String(params.token || '');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await apiFetch(`/confirmar/${token}`);
        setData(raw?.data ?? raw);
      } catch (err: any) {
        setError(err.message || 'El enlace no es válido o ya expiró.');
      }
      setLoading(false);
    })();
  }, [token]);

  async function confirmar() {
    setConfirming(true);
    try {
      await apiFetch(`/confirmar/${token}`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `confirm-${token.slice(0, 16)}` },
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'El enlace no es válido o ya expiró.');
    }
    setConfirming(false);
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><RefreshCw className="animate-spin text-indigo-600" size={32} /></div>;
  if (error) return <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center"><AlertCircle className="text-rose-500" size={40} /><p className="text-slate-600 font-medium">{error}</p></div>;
  if (done) return <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center"><CheckCircle2 className="text-emerald-500" size={40} /><p className="text-slate-800 font-bold text-lg">¡Gracias! Tu confirmación fue registrada.</p></div>;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center max-w-md mx-auto">
      <h1 className="text-xl font-black text-slate-800">{data?.numero}</h1>
      <p className="text-slate-600">{data?.customer_name}</p>
      <button onClick={confirmar} disabled={confirming}
        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl">
        {confirming ? 'Confirmando...' : 'Confirmar'}
      </button>
    </div>
  );
}
```

Este layout NO hereda del layout de `/dashboard` (ya que vive fuera de esa carpeta) — no requiere `AuthGuard`/`Sidebar`, confirmar que `frontend/src/app/layout.tsx` (el root layout) no fuerza autenticación globalmente (si la fuerza, revisar cómo `frontend/src/app/store/` logra ser público hoy y replicar el mismo mecanismo).

- [ ] **Step 15: Build y typecheck**

```bash
npx tsc --noEmit && npm --prefix frontend run build
```

- [ ] **Step 16: Verificación en vivo (si hay navegador disponible)**

Crear una SC real, asignarle asesor (confirmar que pasa a ASIGNADA), enviarla para confirmación, tomar el link generado (leer la respuesta del endpoint directamente, no el email ya que no hay credenciales SMTP reales todavía), abrirlo en una pestaña nueva, confirmar, verificar que la SC pasa a CONFIRMADA y que `confirmar_solicitud` ahora sí funciona.

- [ ] **Step 17: Commit**

```bash
git add backend/app/models/confirmation.py backend/alembic/versions/*document_confirmation_tokens.py backend/app/core/confirmation_tokens.py backend/app/api/v1/confirmacion_publica.py backend/app/api/v1/erp_ventas.py backend/main.py frontend/src/app/dashboard/ventas/solicitud/solicitud-client.tsx frontend/src/app/dashboard/ventas/solicitud/[id]/page.tsx frontend/src/app/confirmar backend/tests/test_confirmacion_solicitud.py
git commit -m "feat(ventas): confirmacion publica de Solicitud por link (Gate 1) - Asignada, Pendiente confirmacion, Confirmada"
```

---

## Task 5: Gate 2 (Cotización) — reusa la misma infraestructura de tokens

**Files:**
- Modify: `backend/app/api/v1/erp_ventas.py` (`update_cotizacion`, `confirmar_cotizacion`), `backend/app/api/v1/confirmacion_publica.py` (completar la rama `COT`)
- Modify: `frontend/src/app/dashboard/ventas/cotizacion/[id]/page.tsx` (ChannelModal retarget, pastillas reducidas → select, gating del botón PVEN, mensaje de éxito con fade, `return_to`)
- Test: `backend/tests/test_confirmacion_cotizacion.py` (nuevo)

**Interfaces:**
- Consumes: `create_confirmation_token`/`verify_and_consume_token`/`peek_token` (Task 4, sin cambios).

- [ ] **Step 1: Test que falla**

```python
# backend/tests/test_confirmacion_cotizacion.py
from datetime import datetime, timedelta

def test_enviar_cotizacion_crea_token_y_pasa_a_pendiente_confirmacion(client, db_session, auth_headers):
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTCONF1", customer_name="Cliente Prueba",
                          customer_email="cliente@test.com", estado="BORRADOR", productos=[])
    db_session.add(cot); db_session.commit(); db_session.refresh(cot)

    resp = client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "estado": "PENDIENTE_CONFIRMACION", "canal_envio": "Email", "updated_by": "test",
    }, headers=auth_headers)
    assert resp.status_code == 200
    db_session.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"

    from app.models.confirmation import DocumentConfirmationToken
    token_row = db_session.query(DocumentConfirmationToken).filter(
        DocumentConfirmationToken.document_type == "COT", DocumentConfirmationToken.document_id == cot.id
    ).first()
    assert token_row is not None

def test_confirmar_cot_via_link_sincroniza_sc(client, db_session, auth_headers):
    from app.models.erp_documents import CustomerRequest, SalesQuotation
    sc = CustomerRequest(numero="SC-TESTCONF5", customer_name="Cliente Prueba", estado="COTIZADA")
    db_session.add(sc); db_session.commit(); db_session.refresh(sc)
    cot = SalesQuotation(numero="COT-TESTCONF2", sc_id=sc.id, customer_name="Cliente Prueba",
                          estado="PENDIENTE_CONFIRMACION", productos=[])
    db_session.add(cot); db_session.commit(); db_session.refresh(cot)

    from app.core.confirmation_tokens import create_confirmation_token
    raw = create_confirmation_token(db_session, "COT", cot.id)

    resp = client.post(f"/api/v1/confirmar/{raw}", headers={"Idempotency-Key": "test-cot-1"})
    assert resp.status_code == 200
    db_session.refresh(cot); db_session.refresh(sc)
    assert cot.estado == "CONFIRMADA"
    assert sc.estado == "CONFIRMADA"  # sincronizado automaticamente, sin tocar la funcion de sync

def test_confirmar_cotizacion_pven_exige_confirmada(client, db_session, auth_headers):
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero="COT-TESTCONF3", customer_name="Cliente Prueba", estado="PENDIENTE_CONFIRMACION", productos=[{"product_name": "X", "qty": 1, "unit_price_cop": 1000}])
    db_session.add(cot); db_session.commit(); db_session.refresh(cot)
    resp = client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "test"}, headers=auth_headers)
    assert resp.status_code == 400
```

- [ ] **Step 2: Correr, confirmar que fallan.**

- [ ] **Step 3: Implementar — `update_cotizacion` crea el token cuando el PATCH pide `PENDIENTE_CONFIRMACION`**

En `update_cotizacion` (`erp_ventas.py:627+`), después de `cot.updated_at = ...` y `db.commit(); db.refresh(cot)` (línea 643-645) pero dentro del bloque `if body.get("estado") and body["estado"] != old_estado:` (línea 646), agregar, junto a la lógica de sync/lead ya existente:

```python
        if cot.estado == "PENDIENTE_CONFIRMACION":
            from app.core.confirmation_tokens import create_confirmation_token
            from app.core.email import send_email
            import os
            raw_token = create_confirmation_token(db, "COT", cot.id)
            frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5100").rstrip("/")
            link = f"{frontend_url}/confirmar/{raw_token}"
            if cot.customer_email:
                send_email(cot.customer_email, f"Confirma tu cotización {cot.numero} - Nebulae",
                            f'<p>Revisa y confirma tu cotización aquí: <a href="{link}">{link}</a></p>')
```

(se agrega DENTRO del `try:` ya existente en ese bloque, junto a `_sincronizar_estado_solicitud_desde_cotizacion`/`mover_lead_de_solicitud`, para que cualquier fallo de envío de correo no rompa la transacción principal — mismo criterio que ya usa ese bloque para los otros dos efectos secundarios).

- [ ] **Step 4: Completar la rama `COT` en `confirmacion_publica.py`**

Reemplazar el `raise HTTPException(501, ...)` de la rama `COT` (Task 4, Step 9) por:

```python
    elif document_type == "COT":
        from app.api.v1.erp_ventas import SalesQuotation, _log, _sincronizar_estado_solicitud_desde_cotizacion, mover_lead_de_solicitud
        import datetime
        cot = db.query(SalesQuotation).filter(SalesQuotation.id == document_id).first()
        if not cot:
            raise HTTPException(400, GENERIC_ERROR)
        old_estado = cot.estado
        cot.estado = "CONFIRMADA"
        cot.updated_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(cot)
        _sincronizar_estado_solicitud_desde_cotizacion(cot, db)
        _log(db, "COT", cot.id, cot.numero, "ESTADO_CHANGED", "Confirmada por el cliente vía enlace",
             old_estado=old_estado, new_estado="CONFIRMADA", user_name="Cliente (confirmación por link)")
        return {"status": "success", "message": "Cotización confirmada. Gracias."}
```

(Nota: NO se llama `mover_lead_de_solicitud` aquí porque `_MAPA_ESTADO_COTIZACION_A_SOLICITUD` ya mapea `CONFIRMADA→CONFIRMADA` y el movimiento de Lead a "Ganado" ocurre en `confirmar_cotizacion`/`convertir_cotizacion_a_venta` al crear el PVEN, no al solo confirmar el precio — confirmar esto releyendo `erp_ventas.py:680-682` antes de implementar, por si el comportamiento real difiere de lo aquí asumido).

- [ ] **Step 5: `confirmar_cotizacion` exige `CONFIRMADA`**

En `confirmar_cotizacion` (`erp_ventas.py:663+`), al inicio de la función (antes de construir `req`), agregar:

```python
    cot = db.query(SalesQuotation).filter(SalesQuotation.id == cot_id).first()
    if not cot:
        raise HTTPException(404, "Cotizacion no encontrada")
    if cot.estado != "CONFIRMADA":
        raise HTTPException(400, f"La cotización debe estar Confirmada antes de crear el Pedido de Venta (estado actual: {cot.estado})")
```

(revisar si la función ya consulta `cot` más abajo para evitar una query duplicada — si ya existe una consulta posterior idéntica, reusar esta misma variable en vez de repetir el query).

- [ ] **Step 6: Correr, confirmar que pasan.**

- [ ] **Step 7: Frontend — `ChannelModal` retarget + pastillas → select**

En `cotizacion-client.tsx`, la función `confirmarEnvio` (línea ~425-472 del archivo original, confirmar línea exacta leyendo el archivo actual) — cambiar el payload que manda `estado:'ENVIADA'` por `estado:'PENDIENTE_CONFIRMACION'` (el `canal_envio` se sigue mandando igual).

En `cotizacion/[id]/page.tsx`, las pastillas "Cambiar Estado" (línea ~578-587 del archivo original) — confirmar la línea real tras la Mejora 2 de hoy (pudo haber cambiado) y:
1. Agregar `'PENDIENTE_CONFIRMACION'` al filtro de exclusión que ya excluye `'CONFIRMADA'`.
2. Convertir el `.map` de botones en un único `<select>` dentro del modo "Editar" existente (mismo patrón que ya se usa en `venta/[id]/page.tsx` y ahora en `solicitud/[id]/page.tsx` para sus respectivos selectores de estado) — reusar el mismo patrón visual, no inventar uno nuevo.

- [ ] **Step 8: Frontend — gating del botón "Crear Pedido de Venta" + mensaje de éxito con fade**

En la función `handleConfirmarVenta` (o equivalente ya existente que llama `/confirmar` para crear el PVEN), envolver el botón con `{cotizacion?.estado === 'CONFIRMADA' && (...)}`. Tras una creación exitosa, guardar el número del PVEN en un estado local (`const [pvenCreadoNumero, setPvenCreadoNumero] = useState<string|null>(null)`), mostrar el mensaje de éxito, y:

```tsx
useEffect(() => {
  if (pvenCreadoNumero) {
    const t = setTimeout(() => setPvenCreadoNumero(null), 4000);
    return () => clearTimeout(t);
  }
}, [pvenCreadoNumero]);
```

Después de que `pvenCreadoNumero` vuelve a `null`, queda visible solo el botón "Ver Pedido de Venta" + número (ya existente en el código, condicionado a que la cotización ya tenga un PVEN vinculado — confirmar releyendo el bloque real antes de tocarlo).

- [ ] **Step 9: Frontend — `return_to` en el link al Pedido de Venta creado**

El link "Ver Pedido de Venta" existente debe apuntar a `/dashboard/ventas/venta/{id}?return_to=${encodeURIComponent('/dashboard/ventas/cotizacion/' + cotizacion.id)}` — mismo patrón ya usado hoy en Solicitud. Confirmar que `venta/[id]/page.tsx` YA lee/muestra `return_to` (si no lo hace todavía, agregar el mismo bloque de 3 líneas que ya tiene `solicitud/[id]/page.tsx` — `useSearchParams`, `safeReturnTo`, el link "← Volver").

- [ ] **Step 10: Build, typecheck, verificación en vivo si hay navegador.**

- [ ] **Step 11: Commit**

```bash
git add backend/app/api/v1/erp_ventas.py backend/app/api/v1/confirmacion_publica.py frontend/src/app/dashboard/ventas/cotizacion frontend/src/app/dashboard/ventas/venta/\[id\]/page.tsx backend/tests/test_confirmacion_cotizacion.py
git commit -m "feat(ventas): confirmacion publica de Cotizacion por link (Gate 2), separa confirmar de crear Pedido de Venta"
```

---

## Task 6: Alerta global de documentos atrasados (v1, sin scheduler)

**Files:**
- Modify: `backend/app/api/v1/erp_ventas.py` (nuevo endpoint `GET /ventas/alertas/resumen`)
- Create: `frontend/src/components/AlertasBadge.tsx`
- Modify: `frontend/src/app/dashboard/layout.tsx`
- Test: `backend/tests/test_alertas_resumen.py` (nuevo)

**Interfaces:**
- Consumes: `_get_alert_days()` (ya existe, `erp_ventas.py:1146-1151`).

- [ ] **Step 1: Test que falla**

```python
from datetime import datetime, timedelta

def test_alertas_resumen_cuenta_atrasados(client, db_session, auth_headers):
    from app.models.erp_documents import CustomerRequest
    viejo = CustomerRequest(numero="SC-ALERTOLD", customer_name="X", estado="BORRADOR",
                             updated_at=datetime.utcnow() - timedelta(days=10))
    nuevo = CustomerRequest(numero="SC-ALERTNEW", customer_name="Y", estado="BORRADOR",
                             updated_at=datetime.utcnow())
    db_session.add_all([viejo, nuevo]); db_session.commit()

    resp = client.get("/api/v1/ventas/alertas/resumen", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["data"]["atrasados"] >= 1
```

- [ ] **Step 2: Correr, confirmar que falla.**

- [ ] **Step 3: Implementar el endpoint**

Cerca de `_get_alert_days` (`erp_ventas.py:1146+`):

```python
@router.get("/alertas/resumen")
def alertas_resumen(user: User = Depends(require_roles(*ALL_ERP_ROLES)), db: Session = Depends(get_db)):
    sc_dias, cot_dias, ven_dias = _get_alert_days(db)
    ahora = datetime.datetime.utcnow()
    no_resolucion = ["BORRADOR", "PENDIENTE_CONFIRMACION", "ASIGNADA", "EN_GESTION", "ENVIADA",
                      "PENDIENTE_COMPRA", "PENDIENTE_PAGO", "EN_PROCESO", "EN_TRANSITO"]

    sc_atrasadas = db.query(CustomerRequest).filter(
        CustomerRequest.estado.in_(no_resolucion),
        CustomerRequest.updated_at < ahora - datetime.timedelta(days=sc_dias),
    ).count()
    cot_atrasadas = db.query(SalesQuotation).filter(
        SalesQuotation.estado.in_(no_resolucion),
        SalesQuotation.updated_at < ahora - datetime.timedelta(days=cot_dias),
    ).count()
    ven_atrasados = db.query(SaleOrder).filter(
        SaleOrder.estado.in_(no_resolucion),
        SaleOrder.updated_at < ahora - datetime.timedelta(days=ven_dias),
    ).count()

    return {"status": "success", "data": {"atrasados": sc_atrasadas + cot_atrasadas + ven_atrasados}}
```

(revisar la firma real de `_get_alert_days` — el nombre exacto de sus parámetros/retorno puede diferir de lo asumido aquí; ajustar la desestructuración `sc_dias, cot_dias, ven_dias = ...` según su firma real antes de dar el step por completo).

- [ ] **Step 4: Correr, confirmar que pasa.**

- [ ] **Step 5: Componente frontend**

```tsx
// frontend/src/components/AlertasBadge.tsx
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/lib/api';

export function AlertasBadge() {
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await apiFetch('/ventas/alertas/resumen');
        if (mounted) setCount(res?.data?.atrasados ?? 0);
      } catch {}
    }
    load();
    const interval = setInterval(load, 5 * 60 * 1000);  // cada 5 minutos
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (count === 0) return null;

  return (
    <button
      onClick={() => router.push('/dashboard/ventas?tab=No_Resueltos')}
      className="fixed top-4 right-20 z-50 flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-2 rounded-full shadow-lg transition-colors"
      title="Documentos atrasados sin atender"
    >
      <AlertTriangle size={14} /> {count} atrasado{count !== 1 ? 's' : ''}
    </button>
  );
}
```

Nota: confirmar que la ruta `/dashboard/ventas?tab=No_Resueltos` realmente activa ese tab leyendo un query param al cargar `ventas/page.tsx` — si hoy NO lee ningún query param para preseleccionar tab, ajustar el `onClick` a solo `router.push('/dashboard/ventas')` (sin el query param) en vez de inventar soporte nuevo para ese query param fuera de alcance de este task.

- [ ] **Step 6: Integrar en el layout**

```tsx
// frontend/src/app/dashboard/layout.tsx
import { AlertasBadge } from '@/components/AlertasBadge';
// ...
        <main className="flex-1 overflow-y-auto relative bg-white custom-scrollbar flex flex-col">
          {children}
          <GlobalAIChat />
          <AlertasBadge />
        </main>
```

- [ ] **Step 7: Build, typecheck, verificación en vivo si hay navegador.**

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/v1/erp_ventas.py frontend/src/components/AlertasBadge.tsx frontend/src/app/dashboard/layout.tsx backend/tests/test_alertas_resumen.py
git commit -m "feat(ventas): badge global de documentos atrasados (v1 sin scheduler)"
```

---

## Notas finales para quien ejecute este plan

- Cada task es independientemente verificable y deployable — no hace falta esperar a terminar las 6 para tener valor real entregado (Task 1-3 son puro backend de bajo riesgo; Task 4-5 son el cambio de mayor impacto; Task 6 es una mejora visual aislada).
- Varias líneas de código citadas (`erp_ventas.py:XXX`, `cotizacion/[id]/page.tsx:XXX`) pueden haber cambiado ligeramente desde que se escribió este plan, dado el volumen de trabajo paralelo de hoy mismo sobre estos mismos archivos (Mejora 2 de Solicitud, fix del bug de Origen en Cotización) — cada implementador debe releer el archivo real antes de aplicar un Step, no asumir que el número de línea citado sigue siendo exacto.
- El scheduler real para `VENCIDA`/notificaciones proactivas queda explícitamente fuera de este plan (ver spec, sección "Alcance de este documento").
