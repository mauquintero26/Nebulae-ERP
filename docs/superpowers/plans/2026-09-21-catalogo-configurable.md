# Catálogo Configurable — Categorías, Variantes y Migración — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer real y usable el catálogo canónico ya existente (`backend/app/models/catalog.py`): categorías jerárquicas administrables, un asistente para crear productos con variantes reales, y una migración de los productos legacy (`ecommerce_products`) al modelo canónico.

**Architecture:** Todo se construye sobre el modelo canónico existente sin tocar el mecanismo de doble-escritura de TD-03 ni el flag `CATALOGO_LECTURA` (que permanece apagado en todos los entornos compartidos durante este trabajo). Backend FastAPI + SQLAlchemy + Alembic; frontend Next.js.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Pydantic, Postgres, Next.js/React, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-21-catalogo-configurable-design.md`

## Global Constraints

- No activar `CATALOGO_LECTURA=canonico` en ningún `.env` compartido ni de producción durante este plan — solo se prueba localmente.
- El script de migración (Task 3) es idempotente: correrlo dos veces sobre los mismos datos no debe crear filas duplicadas.
- La comparación de nombres de categoría/marca durante la migración (Task 3) ignora mayúsculas/minúsculas para evitar duplicados ("Ropa" y "ropa" son la misma).
- Ninguna migración de Alembic debe incluir GRANTs ni tocar roles (patrón de seguridad ya establecido en este proyecto — ver migraciones `fa6_*` existentes).
- Todas las rutas nuevas bajo `/api/v1/products`, `/api/v1/categories` exigen rol autenticado vía `require_roles(*ALL_ERP_ROLES)` (mismo patrón que el resto de `catalog.py`).

---

### Task 1: Categorías — jerarquía y API de edición/borrado

**Files:**
- Modify: `backend/app/models/catalog.py` (clase `Category`)
- Modify: `backend/app/schemas/catalog.py` (esquemas de Category)
- Modify: `backend/app/api/v1/catalog.py` (endpoints de categorías)
- Create: `backend/alembic/versions/fa6_014_category_hierarchy.py`
- Create: `backend/tests/test_catalogo_configurable_categorias.py`

**Interfaces:**
- Produces: `Category.parent_id` (Optional[int]); `GET /categories` devuelve `[{id, name, parent_id}]`; `PUT /categories/{id}` body `{name?: str, parent_id?: int|null}`; `DELETE /categories/{id}`.
- Consumes: nada de tareas anteriores (es la primera).

- [ ] **Step 1: Escribir el modelo con la relación jerárquica**

Editar `backend/app/models/catalog.py`, reemplazar la clase `Category` completa:

```python
class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True)

    products = relationship("Product", back_populates="category")
    parent = relationship("Category", remote_side=[id], back_populates="children")
    children = relationship("Category", back_populates="parent")
```

- [ ] **Step 2: Crear la migración de Alembic**

Primero, verificar la cabeza actual: `cd backend && ALEMBIC_ENV=testing python -m alembic heads` (debe mostrar `fa6_013`).

Crear `backend/alembic/versions/fa6_014_category_hierarchy.py`:

```python
"""
fa6_014 - Jerarquia de categorias (categoria padre / subcategoria)

Agrega parent_id a categories para soportar categoria/subcategoria como
el mismo concepto (una subcategoria es una categoria cuyo padre es otra).

Revision ID: fa6_014
Revises: fa6_013
Create Date: 2026-09-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_014"
down_revision: Union[str, Sequence[str], None] = "fa6_013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES categories(id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_categories_parent_id ON categories(parent_id)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_categories_parent_id"))
    conn.execute(sa.text("ALTER TABLE categories DROP COLUMN IF EXISTS parent_id"))
```

- [ ] **Step 3: Aplicar la migración en la base de pruebas**

Run: `cd backend && ALEMBIC_ENV=testing DATABASE_URL="$TEST_DATABASE_URL" python -m alembic upgrade head`
Expected: corre limpio, termina en `fa6_014 (head)`.

- [ ] **Step 4: Actualizar los esquemas Pydantic**

Editar `backend/app/schemas/catalog.py`, reemplazar el bloque `# Category` completo:

```python
# Category
class CategoryBase(BaseModel):
    name: str
    parent_id: Optional[int] = None

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None

class CategoryResponse(CategoryBase):
    id: int
    model_config = {"from_attributes": True}
```

- [ ] **Step 5: Escribir las pruebas que fallan primero**

Crear `backend/tests/test_catalogo_configurable_categorias.py`. Usa el fixture `admin_token` ya existente en `conftest.py` (un JWT), pasado como header en cada llamada — mismo patrón que `test_catalog_auth.py`:

```python
import uuid
import pytest


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _crear_categoria(client, admin_token, name, parent_id=None):
    body = {"name": name}
    if parent_id is not None:
        body["parent_id"] = parent_id
    return client.post("/api/v1/categories", json=body, headers=_headers(admin_token))


class TestCategoriasJerarquia:

    def test_crear_categoria_de_primer_nivel(self, app_client, admin_token):
        r = _crear_categoria(app_client, admin_token, f"Ropa-{uuid.uuid4().hex[:6]}")
        assert r.status_code == 201
        assert r.json()["data"]["parent_id"] is None

    def test_crear_subcategoria_con_padre(self, app_client, admin_token):
        padre = _crear_categoria(app_client, admin_token, f"Calzado-{uuid.uuid4().hex[:6]}").json()["data"]
        hija = _crear_categoria(app_client, admin_token, f"Botas-{uuid.uuid4().hex[:6]}", parent_id=padre["id"])
        assert hija.status_code == 201
        assert hija.json()["data"]["parent_id"] == padre["id"]

    def test_editar_categoria_cambia_nombre_y_padre(self, app_client, admin_token):
        a = _crear_categoria(app_client, admin_token, f"Electronica-{uuid.uuid4().hex[:6]}").json()["data"]
        b = _crear_categoria(app_client, admin_token, f"Celulares-{uuid.uuid4().hex[:6]}").json()["data"]
        r = app_client.put(f"/api/v1/categories/{b['id']}", json={"parent_id": a["id"]}, headers=_headers(admin_token))
        assert r.status_code == 200
        assert r.json()["data"]["parent_id"] == a["id"]

    def test_no_permite_categoria_como_su_propio_padre(self, app_client, admin_token):
        a = _crear_categoria(app_client, admin_token, f"Hogar-{uuid.uuid4().hex[:6]}").json()["data"]
        r = app_client.put(f"/api/v1/categories/{a['id']}", json={"parent_id": a["id"]}, headers=_headers(admin_token))
        assert r.status_code == 400

    def test_no_permite_ciclo_de_dos_niveles(self, app_client, admin_token):
        a = _crear_categoria(app_client, admin_token, f"Deportes-{uuid.uuid4().hex[:6]}").json()["data"]
        b = _crear_categoria(app_client, admin_token, f"Ciclismo-{uuid.uuid4().hex[:6]}", parent_id=a["id"]).json()["data"]
        r = app_client.put(f"/api/v1/categories/{a['id']}", json={"parent_id": b["id"]}, headers=_headers(admin_token))
        assert r.status_code == 400

    def test_no_borra_categoria_con_subcategorias(self, app_client, admin_token):
        a = _crear_categoria(app_client, admin_token, f"Muebles-{uuid.uuid4().hex[:6]}").json()["data"]
        _crear_categoria(app_client, admin_token, f"Sillas-{uuid.uuid4().hex[:6]}", parent_id=a["id"])
        r = app_client.delete(f"/api/v1/categories/{a['id']}", headers=_headers(admin_token))
        assert r.status_code == 409

    def test_no_borra_categoria_con_productos(self, app_client, admin_token, brand):
        cat = _crear_categoria(app_client, admin_token, f"Juguetes-{uuid.uuid4().hex[:6]}").json()["data"]
        r = app_client.post("/api/v1/products", json={
            "brand_id": brand.id, "category_id": cat["id"], "name": "Producto Test",
            "type": "Fisico", "base_currency": "COP",
        }, headers=_headers(admin_token))
        assert r.status_code == 201
        r = app_client.delete(f"/api/v1/categories/{cat['id']}", headers=_headers(admin_token))
        assert r.status_code == 409

    def test_borra_categoria_vacia_sin_problema(self, app_client, admin_token):
        a = _crear_categoria(app_client, admin_token, f"CategoriaVacia-{uuid.uuid4().hex[:6]}").json()["data"]
        r = app_client.delete(f"/api/v1/categories/{a['id']}", headers=_headers(admin_token))
        assert r.status_code == 200
```

Nota: `brand` es un fixture ya existente en `conftest.py` (crea una marca de prueba con nombre único) — se reutiliza en vez de crear una marca nueva a mano.

- [ ] **Step 6: Correr las pruebas y verificar que fallan**

Run: `cd backend && pytest tests/test_catalogo_configurable_categorias.py -v`
Expected: fallan porque `PUT`/`DELETE /categories/{id}` no existen todavía (404/405).

- [ ] **Step 7: Implementar los endpoints de editar y borrar**

Editar `backend/app/api/v1/catalog.py`, reemplazar el bloque `# --- CATEGORIES ---` completo:

```python
# --- CATEGORIES ---
@router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_category(category: schemas.CategoryCreate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    db_category = Category(**category.model_dump())
    try:
        db.add(db_category)
        db.commit()
        db.refresh(db_category)
        return {"status": "success", "data": schemas.CategoryResponse.model_validate(db_category).model_dump()}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Category already exists")

@router.get("/categories")
def list_categories(db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    categories = db.query(Category).all()
    return {"status": "success", "data": [schemas.CategoryResponse.model_validate(c).model_dump() for c in categories]}

def _es_descendiente(db: Session, categoria_id: int, posible_ancestro_id: int) -> bool:
    """True si posible_ancestro_id aparece en la cadena de padres de categoria_id (o es el mismo)."""
    actual_id = categoria_id
    visitados = set()
    while actual_id is not None:
        if actual_id == posible_ancestro_id:
            return True
        if actual_id in visitados:
            return False  # ciclo ya existente, no seguir para siempre
        visitados.add(actual_id)
        fila = db.query(Category.parent_id).filter(Category.id == actual_id).first()
        actual_id = fila[0] if fila else None
    return False

@router.put("/categories/{category_id}")
def update_category(category_id: int, body: schemas.CategoryUpdate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    db_category = db.query(Category).filter(Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")

    if body.parent_id is not None:
        if body.parent_id == category_id:
            raise HTTPException(status_code=400, detail="Una categoria no puede ser su propio padre")
        nuevo_padre = db.query(Category).filter(Category.id == body.parent_id).first()
        if not nuevo_padre:
            raise HTTPException(status_code=400, detail="La categoria padre indicada no existe")
        if _es_descendiente(db, body.parent_id, category_id):
            raise HTTPException(status_code=400, detail="Esto crearia un ciclo de categorias")
        db_category.parent_id = body.parent_id

    if body.name is not None:
        db_category.name = body.name

    try:
        db.commit()
        db.refresh(db_category)
        return {"status": "success", "data": schemas.CategoryResponse.model_validate(db_category).model_dump()}
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Ya existe una categoria con ese nombre")

@router.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    db_category = db.query(Category).filter(Category.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")

    hijos = db.query(Category).filter(Category.parent_id == category_id).count()
    if hijos > 0:
        raise HTTPException(status_code=409, detail=f"No se puede borrar: tiene {hijos} subcategoria(s)")

    productos = db.query(Product).filter(Product.category_id == category_id).count()
    if productos > 0:
        raise HTTPException(status_code=409, detail=f"No se puede borrar: tiene {productos} producto(s) asociado(s)")

    db.delete(db_category)
    db.commit()
    return {"status": "success"}
```

- [ ] **Step 8: Correr las pruebas y verificar que pasan**

Run: `cd backend && pytest tests/test_catalogo_configurable_categorias.py -v`
Expected: PASS los 8 tests.

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/catalog.py backend/app/schemas/catalog.py backend/app/api/v1/catalog.py backend/alembic/versions/fa6_014_category_hierarchy.py backend/tests/test_catalogo_configurable_categorias.py
git commit -m "feat: jerarquia de categorias (padre/subcategoria) con edicion y borrado"
```

---

### Task 2: Categorías — pantalla de administración

**Files:**
- Create: `frontend/src/app/dashboard/inventario/categorias/page.tsx`
- Modify: donde viva el menú lateral de Inventario (buscar el patrón de enlaces existente, ej. `frontend/src/components/Sidebar.tsx`, y agregar un enlace a `/dashboard/inventario/categorias` junto a los de Productos)

**Interfaces:**
- Consumes: `GET /categories` → `[{id, name, parent_id}]`; `POST /categories` `{name, parent_id?}`; `PUT /categories/{id}` `{name?, parent_id?}`; `DELETE /categories/{id}` (de Task 1).
- Produces: nada que otras tareas consuman directamente (Task 5 consume el mismo `GET /categories`, no esta pantalla).

- [ ] **Step 1: Crear la pantalla de administración de categorías**

Crear `frontend/src/app/dashboard/inventario/categorias/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tag, Plus, Pencil, Trash2, ChevronRight, ChevronDown, X } from 'lucide-react';
import { apiFetch as _apiFetch } from '@/lib/api';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

type Categoria = { id: number; name: string; parent_id: number | null };

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandidas, setExpandidas] = useState<Set<number>>(new Set());
  const [modal, setModal] = useState<{ modo: 'crear' | 'editar'; parentId: number | null; categoria?: Categoria } | null>(null);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch('/categories');
      setCategorias(Array.isArray(d) ? d : (d?.data ?? []));
    } catch { setCategorias([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const raiz = categorias.filter(c => c.parent_id === null);
  const hijasDe = (id: number) => categorias.filter(c => c.parent_id === id);

  function abrirCrear(parentId: number | null) {
    setModal({ modo: 'crear', parentId });
    setNombre('');
    setError('');
  }

  function abrirEditar(categoria: Categoria) {
    setModal({ modo: 'editar', parentId: categoria.parent_id, categoria });
    setNombre(categoria.name);
    setError('');
  }

  async function guardar() {
    setError('');
    try {
      if (modal?.modo === 'crear') {
        await apiFetch('/categories', { method: 'POST', body: JSON.stringify({ name: nombre, parent_id: modal.parentId }) });
      } else if (modal?.modo === 'editar' && modal.categoria) {
        await apiFetch(`/categories/${modal.categoria.id}`, { method: 'PUT', body: JSON.stringify({ name: nombre }) });
      }
      setModal(null);
      load();
    } catch (err: any) { setError(err.message); }
  }

  async function borrar(categoria: Categoria) {
    if (!confirm(`¿Borrar "${categoria.name}"?`)) return;
    try {
      await apiFetch(`/categories/${categoria.id}`, { method: 'DELETE' });
      load();
    } catch (err: any) { alert(err.message); }
  }

  function toggleExpandida(id: number) {
    setExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function renderNodo(categoria: Categoria) {
    const hijas = hijasDe(categoria.id);
    const expandida = expandidas.has(categoria.id);
    return (
      <div key={categoria.id} className="border-b border-slate-50 last:border-0">
        <div className="flex items-center justify-between py-3 px-4 hover:bg-slate-50/60">
          <div className="flex items-center gap-2">
            {hijas.length > 0 ? (
              <button onClick={() => toggleExpandida(categoria.id)} className="text-slate-400">
                {expandida ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : <span className="w-4" />}
            <Tag size={14} className="text-purple-500" />
            <span className="font-semibold text-slate-800">{categoria.name}</span>
            {hijas.length > 0 && <span className="text-xs text-slate-400">({hijas.length})</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => abrirCrear(categoria.id)} title="Agregar subcategoria"
              className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg">
              <Plus size={15} />
            </button>
            <button onClick={() => abrirEditar(categoria)} title="Editar"
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
              <Pencil size={14} />
            </button>
            <button onClick={() => borrar(categoria)} title="Borrar"
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {expandida && hijas.length > 0 && (
          <div className="pl-8 bg-slate-50/30">
            {hijas.map(h => renderNodo(h))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col p-5 overflow-y-auto">
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-slate-200 flex items-center justify-center text-purple-600">
            <Tag size={24} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Categorías</h1>
            <p className="text-slate-500 text-sm mt-1">{categorias.length} categorías y subcategorías</p>
          </div>
        </div>
        <button onClick={() => abrirCrear(null)}
          className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm flex items-center gap-2">
          <Plus size={18} /> Nueva Categoría
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center pt-16 text-slate-400">Cargando...</div>
        ) : raiz.length === 0 ? (
          <div className="text-center pt-16 text-slate-400">
            <Tag size={48} className="mx-auto mb-4 opacity-20" />
            <p>Sin categorías. Crea la primera.</p>
          </div>
        ) : raiz.map(c => renderNodo(c))}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-lg text-slate-800">
                {modal.modo === 'crear' ? (modal.parentId ? 'Nueva Subcategoría' : 'Nueva Categoría') : 'Editar Categoría'}
              </h2>
              <button onClick={() => setModal(null)} className="text-slate-400"><X size={18} /></button>
            </div>
            <input autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
              placeholder="Nombre"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400 mb-3" />
            {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm">Cancelar</button>
              <button onClick={guardar} disabled={!nombre.trim()}
                className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold text-sm disabled:opacity-50">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Agregar el enlace en el menú de Inventario**

Buscar en `frontend/src/components/Sidebar.tsx` el enlace existente a `/dashboard/inventario/productos` y agregar uno equivalente a `/dashboard/inventario/categorias` justo al lado (mismo estilo/estructura que el enlace de Productos — copiar su bloque JSX y cambiar `href` y el texto a "Categorías").

- [ ] **Step 3: Verificación manual**

Con el backend y frontend locales corriendo (`CATALOGO_LECTURA` puede quedar en cualquier valor, esta pantalla no depende del flag), entrar a `/dashboard/inventario/categorias`, crear una categoría, crear una subcategoría dentro de ella, editar un nombre, intentar borrar la categoría padre (debe fallar con el mensaje de "tiene subcategorías"), borrar la subcategoría y luego la categoría (debe funcionar).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/dashboard/inventario/categorias/page.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat: pantalla de administracion de categorias jerarquicas"
```

---

### Task 3: Migración de catálogo legacy a canónico

**Files:**
- Modify: `backend/app/models/catalog.py` (clase `Product`)
- Create: `backend/alembic/versions/fa6_015_product_migration_tracking.py`
- Create: `backend/scripts/migrate_legacy_catalog.py`
- Create: `backend/tests/test_catalogo_configurable_migracion.py`

**Interfaces:**
- Consumes: `Category` con `parent_id` (Task 1).
- Produces: `Product.legacy_ecommerce_product_id`, `Product.necesita_revision` — usados por Task 6 (filtro "Requiere revisión").

- [ ] **Step 1: Agregar las columnas de seguimiento de migración**

Editar `backend/app/models/catalog.py`, en la clase `Product`, agregar estas dos líneas después de `is_active = Column(Boolean, default=True)`:

```python
    legacy_ecommerce_product_id = Column(Integer, unique=True, nullable=True, index=True)
    necesita_revision = Column(Boolean, nullable=False, default=False)
```

- [ ] **Step 2: Crear la migración de Alembic**

Crear `backend/alembic/versions/fa6_015_product_migration_tracking.py`:

```python
"""
fa6_015 - Columnas de seguimiento para migracion de catalogo legacy

legacy_ecommerce_product_id permite que el script de migracion sea
idempotente (sabe que fila de ecommerce_products ya se migro).
necesita_revision marca productos migrados cuyas variantes libres no
se pudieron traducir automaticamente a atributos reales.

Revision ID: fa6_015
Revises: fa6_014
Create Date: 2026-09-21
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fa6_015"
down_revision: Union[str, Sequence[str], None] = "fa6_014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS legacy_ecommerce_product_id INTEGER UNIQUE"
    ))
    conn.execute(sa.text(
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS necesita_revision BOOLEAN NOT NULL DEFAULT false"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_products_legacy_id ON products(legacy_ecommerce_product_id)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_products_legacy_id"))
    conn.execute(sa.text("ALTER TABLE products DROP COLUMN IF EXISTS necesita_revision"))
    conn.execute(sa.text("ALTER TABLE products DROP COLUMN IF EXISTS legacy_ecommerce_product_id"))
```

- [ ] **Step 3: Aplicar la migración en la base de pruebas**

Run: `cd backend && ALEMBIC_ENV=testing DATABASE_URL="$TEST_DATABASE_URL" python -m alembic upgrade head`
Expected: termina en `fa6_015 (head)`.

- [ ] **Step 4: Escribir las pruebas del script de migración (deben fallar primero)**

Crear `backend/tests/test_catalogo_configurable_migracion.py`:

```python
import datetime
import pytest
from sqlalchemy import text
from scripts.migrate_legacy_catalog import run_migration
from app.models.catalog import Product, Category, Brand


def _crear_producto_legacy(db, nombre, categoria, sub_categoria, marca, precio, stock, variantes):
    db.execute(text("""
        INSERT INTO ecommerce_products
            (nombre, sku, precio_venta, categoria, sub_categoria, marca, stock_disponible, variantes, created_at, updated_at)
        VALUES (:nombre, :sku, :precio, :categoria, :sub_categoria, :marca, :stock, CAST(:variantes AS jsonb), :now, :now)
    """), {
        "nombre": nombre, "sku": f"LEG-{nombre[:10]}", "precio": precio, "categoria": categoria,
        "sub_categoria": sub_categoria, "marca": marca, "stock": stock, "variantes": variantes,
        "now": datetime.datetime.utcnow(),
    })
    db.commit()


class TestMigracionCatalogoLegacy:

    def test_producto_simple_sin_variantes_migra_completo(self, db):
        _crear_producto_legacy(db, "Termo Basico", "Hogar", None, "GenericaHogar", 45000, 10, "[]")
        stats = run_migration(db)
        assert stats["migrados"] >= 1
        prod = db.query(Product).filter(Product.name == "Termo Basico").first()
        assert prod is not None
        assert prod.necesita_revision is False
        assert prod.category.name.lower() == "hogar"
        assert prod.skus[0].sale_price == 45000

    def test_producto_con_variantes_queda_marcado_para_revision(self, db):
        _crear_producto_legacy(db, "Camiseta Variada", "Ropa", "Camisetas", "MarcaTest", 30000, 5,
                                '[{"talla":"M","color":"Rojo"}]')
        run_migration(db)
        prod = db.query(Product).filter(Product.name == "Camiseta Variada").first()
        assert prod.necesita_revision is True

    def test_categoria_y_subcategoria_quedan_jerarquicas(self, db):
        _crear_producto_legacy(db, "Bota Cuero", "Calzado", "Botas", "MarcaTest", 90000, 3, "[]")
        run_migration(db)
        prod = db.query(Product).filter(Product.name == "Bota Cuero").first()
        assert prod.category.name.lower() == "botas"
        assert prod.category.parent is not None
        assert prod.category.parent.name.lower() == "calzado"

    def test_categoria_con_distintas_mayusculas_no_duplica(self, db):
        _crear_producto_legacy(db, "Producto A", "Electronica", None, "MarcaX", 10000, 1, "[]")
        _crear_producto_legacy(db, "Producto B", "electronica", None, "MarcaX", 20000, 1, "[]")
        run_migration(db)
        categorias = db.query(Category).filter(Category.name.ilike("electronica")).all()
        assert len(categorias) == 1

    def test_reejecutar_migracion_no_duplica(self, db):
        _crear_producto_legacy(db, "Producto Idempotente", "Deportes", None, "MarcaY", 15000, 2, "[]")
        run_migration(db)
        total_antes = db.query(Product).filter(Product.name == "Producto Idempotente").count()
        run_migration(db)
        total_despues = db.query(Product).filter(Product.name == "Producto Idempotente").count()
        assert total_antes == 1
        assert total_despues == 1
```

- [ ] **Step 5: Correr las pruebas y verificar que fallan**

Run: `cd backend && pytest tests/test_catalogo_configurable_migracion.py -v`
Expected: fallan con `ModuleNotFoundError: No module named 'scripts'` (el script todavía no existe).

- [ ] **Step 6: Escribir el script de migración**

Crear `backend/scripts/migrate_legacy_catalog.py`:

```python
"""
Migra productos de ecommerce_products (legacy) al catalogo canonico
(Product/ProductSKU/ProductWebListing/Category/Brand).

Uso manual: python -m scripts.migrate_legacy_catalog
Idempotente: usa Product.legacy_ecommerce_product_id para no duplicar
en re-ejecuciones.
"""
import json
import sys
import pathlib
from sqlalchemy import text
from sqlalchemy.orm import Session

_BACKEND = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(_BACKEND))

from app.models.catalog import Brand, Category, Product, ProductSKU, ProductWebListing
from app.models.inventory import Warehouse, InventoryLevel


def _resolver_o_crear_categoria(db: Session, nombre: str, parent_id: int | None) -> Category | None:
    if not nombre or not nombre.strip():
        return None
    existente = db.query(Category).filter(Category.name.ilike(nombre.strip())).first()
    if existente:
        return existente
    nueva = Category(name=nombre.strip(), parent_id=parent_id)
    db.add(nueva)
    db.flush()
    return nueva


def _resolver_o_crear_marca(db: Session, nombre: str) -> Brand:
    nombre = (nombre or "Sin Marca").strip() or "Sin Marca"
    existente = db.query(Brand).filter(Brand.name.ilike(nombre)).first()
    if existente:
        return existente
    nueva = Brand(name=nombre)
    db.add(nueva)
    db.flush()
    return nueva


def _bodega_por_defecto(db: Session) -> Warehouse:
    bodega = db.query(Warehouse).first()
    if bodega:
        return bodega
    bodega = Warehouse(name="Bodega Principal", location_type="Central")
    db.add(bodega)
    db.flush()
    return bodega


def _tiene_variantes_reales(variantes_raw) -> bool:
    if not variantes_raw:
        return False
    if isinstance(variantes_raw, str):
        try:
            variantes_raw = json.loads(variantes_raw)
        except (json.JSONDecodeError, TypeError):
            return bool(variantes_raw.strip())
    if isinstance(variantes_raw, list):
        return len(variantes_raw) > 0
    if isinstance(variantes_raw, dict):
        return len(variantes_raw) > 0
    return False


def run_migration(db: Session) -> dict:
    filas = db.execute(text("""
        SELECT id, nombre, descripcion, sku, precio_venta, categoria, sub_categoria,
               marca, stock_disponible, variantes
        FROM ecommerce_products
    """)).fetchall()

    migrados = 0
    saltados = 0

    for fila in filas:
        ya_existe = db.query(Product).filter(Product.legacy_ecommerce_product_id == fila.id).first()
        if ya_existe:
            saltados += 1
            continue

        categoria_padre = _resolver_o_crear_categoria(db, fila.categoria, None)
        categoria_final = categoria_padre
        if fila.sub_categoria and categoria_padre:
            categoria_final = _resolver_o_crear_categoria(db, fila.sub_categoria, categoria_padre.id)
        if categoria_final is None:
            categoria_final = _resolver_o_crear_categoria(db, "Sin Categoria", None)

        marca = _resolver_o_crear_marca(db, fila.marca)

        producto = Product(
            legacy_ecommerce_product_id=fila.id,
            brand_id=marca.id,
            category_id=categoria_final.id,
            name=fila.nombre or f"Producto legacy #{fila.id}",
            description=fila.descripcion,
            type="Fisico",
            base_currency="COP",
            necesita_revision=_tiene_variantes_reales(fila.variantes),
        )
        db.add(producto)
        db.flush()

        sku = ProductSKU(
            product_id=producto.id,
            sku=fila.sku or f"LEGACY-{fila.id}",
            sale_price=fila.precio_venta or 0,
        )
        db.add(sku)
        db.flush()

        db.add(ProductWebListing(sku_id=sku.id))

        stock = fila.stock_disponible or 0
        if stock > 0:
            bodega = _bodega_por_defecto(db)
            db.add(InventoryLevel(sku_id=sku.id, warehouse_id=bodega.id, quantity=stock))

        migrados += 1

    db.commit()
    return {"migrados": migrados, "saltados": saltados}


if __name__ == "__main__":
    import os
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    url = os.environ["DATABASE_URL"]
    engine = create_engine(url)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    try:
        resultado = run_migration(session)
        print(f"Migracion completa: {resultado['migrados']} migrados, {resultado['saltados']} ya existian")
    finally:
        session.close()
```

- [ ] **Step 7: Correr las pruebas y verificar que pasan**

Run: `cd backend && pytest tests/test_catalogo_configurable_migracion.py -v`
Expected: PASS los 5 tests.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/catalog.py backend/alembic/versions/fa6_015_product_migration_tracking.py backend/scripts/migrate_legacy_catalog.py backend/tests/test_catalogo_configurable_migracion.py
git commit -m "feat: script de migracion de catalogo legacy a canonico (idempotente)"
```

---

### Task 4: Creación masiva de SKUs con variantes (backend)

**Files:**
- Modify: `backend/app/schemas/catalog.py`
- Modify: `backend/app/api/v1/catalog.py`
- Create: `backend/tests/test_catalogo_configurable_variantes.py`

**Interfaces:**
- Consumes: `Product`, `Attribute`, `AttributeValue`, `ProductSKU` (ya existentes).
- Produces: `POST /products/{product_id}/skus/bulk`, body:
  ```json
  {
    "warehouse_id": 1,
    "skus": [
      {"sku": "CAM-S-ROJO", "sale_price": 50000, "cost_price": 30000, "initial_stock": 10,
       "attributes": [{"attribute_name": "Talla", "value": "S"}, {"attribute_name": "Color", "value": "Rojo"}]}
    ]
  }
  ```
  Respuesta: `{"status": "success", "data": {"created": N, "sku_ids": [...]}}`. Usado por Task 5.

- [ ] **Step 1: Agregar los esquemas de la creación masiva**

Editar `backend/app/schemas/catalog.py`, agregar al final del archivo:

```python
# Bulk SKU creation (para el asistente de variantes)
class SKUAttributePair(BaseModel):
    attribute_name: str
    value: str

class BulkSKUItem(BaseModel):
    sku: str
    barcode: Optional[str] = None
    sale_price: Decimal
    cost_price: Optional[Decimal] = None
    initial_stock: Optional[int] = 0
    attributes: List[SKUAttributePair] = []

class BulkSKUCreate(BaseModel):
    warehouse_id: Optional[int] = None
    skus: List[BulkSKUItem]
```

- [ ] **Step 2: Escribir las pruebas que fallan primero**

Crear `backend/tests/test_catalogo_configurable_variantes.py`. Reutiliza el fixture `product` ya existente en `conftest.py` (crea un producto de prueba con su `brand`/`category` propios) en vez de crear uno a mano:

```python
import uuid


def _headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


class TestCreacionMasivaSKUs:

    def test_crea_combinaciones_en_una_transaccion(self, app_client, admin_token, product):
        body = {
            "skus": [
                {"sku": f"CAM-S-ROJO-{uuid.uuid4().hex[:6]}", "sale_price": 50000, "attributes": [
                    {"attribute_name": "Talla", "value": "S"}, {"attribute_name": "Color", "value": "Rojo"}]},
                {"sku": f"CAM-M-ROJO-{uuid.uuid4().hex[:6]}", "sale_price": 50000, "attributes": [
                    {"attribute_name": "Talla", "value": "M"}, {"attribute_name": "Color", "value": "Rojo"}]},
            ]
        }
        r = app_client.post(f"/api/v1/products/{product.id}/skus/bulk", json=body, headers=_headers(admin_token))
        assert r.status_code == 201
        assert r.json()["data"]["created"] == 2

    def test_reusa_atributos_y_valores_existentes(self, app_client, admin_token, product, db):
        from app.models.catalog import Attribute
        sufijo = uuid.uuid4().hex[:6]
        body = {"skus": [{"sku": f"CAM-L1-{sufijo}", "sale_price": 50000,
                           "attributes": [{"attribute_name": f"Talla{sufijo}", "value": "L"}]}]}
        app_client.post(f"/api/v1/products/{product.id}/skus/bulk", json=body, headers=_headers(admin_token))
        body2 = {"skus": [{"sku": f"CAM-L2-{sufijo}", "sale_price": 50000,
                            "attributes": [{"attribute_name": f"Talla{sufijo}", "value": "L"}]}]}
        r = app_client.post(f"/api/v1/products/{product.id}/skus/bulk", json=body2, headers=_headers(admin_token))
        assert r.status_code == 201
        atributos = db.query(Attribute).filter(Attribute.name == f"Talla{sufijo}").all()
        assert len(atributos) == 1

    def test_rechaza_sku_duplicado_dentro_del_mismo_lote(self, app_client, admin_token, product):
        dup = f"CAM-DUP-{uuid.uuid4().hex[:6]}"
        body = {"skus": [
            {"sku": dup, "sale_price": 50000, "attributes": []},
            {"sku": dup, "sale_price": 50000, "attributes": []},
        ]}
        r = app_client.post(f"/api/v1/products/{product.id}/skus/bulk", json=body, headers=_headers(admin_token))
        assert r.status_code == 400

    def test_rollback_total_si_una_combinacion_falla(self, app_client, admin_token, product, db):
        from app.models.catalog import ProductSKU
        existente = f"CAM-EXISTENTE-{uuid.uuid4().hex[:6]}"
        nuevo_ok = f"CAM-NUEVO-OK-{uuid.uuid4().hex[:6]}"
        app_client.post(f"/api/v1/products/{product.id}/skus/bulk",
                         json={"skus": [{"sku": existente, "sale_price": 1000, "attributes": []}]},
                         headers=_headers(admin_token))
        body = {"skus": [
            {"sku": nuevo_ok, "sale_price": 1000, "attributes": []},
            {"sku": existente, "sale_price": 1000, "attributes": []},
        ]}
        r = app_client.post(f"/api/v1/products/{product.id}/skus/bulk", json=body, headers=_headers(admin_token))
        assert r.status_code == 400
        assert db.query(ProductSKU).filter(ProductSKU.sku == nuevo_ok).first() is None

    def test_crea_stock_inicial_cuando_se_indica(self, app_client, admin_token, product, db):
        from app.models.inventory import InventoryLevel
        from app.models.catalog import ProductSKU
        sku_code = f"CAM-CON-STOCK-{uuid.uuid4().hex[:6]}"
        body = {"skus": [{"sku": sku_code, "sale_price": 1000, "initial_stock": 25, "attributes": []}]}
        r = app_client.post(f"/api/v1/products/{product.id}/skus/bulk", json=body, headers=_headers(admin_token))
        assert r.status_code == 201
        sku = db.query(ProductSKU).filter(ProductSKU.sku == sku_code).first()
        nivel = db.query(InventoryLevel).filter(InventoryLevel.sku_id == sku.id).first()
        assert nivel is not None
        assert nivel.quantity == 25
```

- [ ] **Step 3: Correr las pruebas y verificar que fallan**

Run: `cd backend && pytest tests/test_catalogo_configurable_variantes.py -v`
Expected: fallan con 404 (el endpoint `/skus/bulk` no existe todavía).

- [ ] **Step 4: Implementar el endpoint**

Editar `backend/app/api/v1/catalog.py`. Agregar el import de `Warehouse`/`InventoryLevel` al inicio del archivo:

```python
from app.models.inventory import Warehouse, InventoryLevel
```

Agregar al final del archivo (después de `create_sku`):

```python
@router.post("/products/{product_id}/skus/bulk", status_code=status.HTTP_201_CREATED)
def create_skus_bulk(product_id: int, body: schemas.BulkSKUCreate, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")

    codigos_en_lote = [item.sku for item in body.skus]
    if len(codigos_en_lote) != len(set(codigos_en_lote)):
        raise HTTPException(status_code=400, detail="Hay codigos de SKU repetidos en el mismo lote")

    warehouse = None
    if body.warehouse_id:
        warehouse = db.query(Warehouse).filter(Warehouse.id == body.warehouse_id).first()
        if not warehouse:
            raise HTTPException(status_code=400, detail="La bodega indicada no existe")

    sku_ids = []
    try:
        for item in body.skus:
            attr_values = []
            for par in item.attributes:
                attr = db.query(Attribute).filter(Attribute.name.ilike(par.attribute_name)).first()
                if not attr:
                    attr = Attribute(name=par.attribute_name)
                    db.add(attr)
                    db.flush()
                val = db.query(AttributeValue).filter(
                    AttributeValue.attribute_id == attr.id, AttributeValue.value.ilike(par.value)
                ).first()
                if not val:
                    val = AttributeValue(attribute_id=attr.id, value=par.value)
                    db.add(val)
                    db.flush()
                attr_values.append(val)

            db_sku = ProductSKU(
                product_id=product_id, sku=item.sku, barcode=item.barcode,
                sale_price=item.sale_price, cost_price=item.cost_price,
            )
            db_sku.attribute_values.extend(attr_values)
            db.add(db_sku)
            db.flush()
            sku_ids.append(db_sku.id)

            if item.initial_stock and item.initial_stock > 0:
                if warehouse is None:
                    warehouse = db.query(Warehouse).first()
                    if warehouse is None:
                        warehouse = Warehouse(name="Bodega Principal", location_type="Central")
                        db.add(warehouse)
                        db.flush()
                db.add(InventoryLevel(sku_id=db_sku.id, warehouse_id=warehouse.id, quantity=item.initial_stock))

        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Uno o mas codigos de SKU o codigos de barras ya existen")

    return {"status": "success", "data": {"created": len(sku_ids), "sku_ids": sku_ids}}
```

- [ ] **Step 5: Correr las pruebas y verificar que pasan**

Run: `cd backend && pytest tests/test_catalogo_configurable_variantes.py -v`
Expected: PASS los 5 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/catalog.py backend/app/api/v1/catalog.py backend/tests/test_catalogo_configurable_variantes.py
git commit -m "feat: endpoint de creacion masiva de SKUs con variantes (todo o nada)"
```

---

### Task 5: Asistente de creación de producto con variantes (frontend)

**Files:**
- Modify: `frontend/src/app/dashboard/inventario/productos/page.tsx`

**Interfaces:**
- Consumes: `GET /categories` (Task 1, ya jerárquico), `POST /products` (ya existente), `POST /products/{id}/skus/bulk` (Task 4), `GET /inventory/warehouses` (ya existente, ya se carga en este archivo pero no se usaba).

- [ ] **Step 1: Agregar el estado del asistente de variantes**

En `frontend/src/app/dashboard/inventario/productos/page.tsx`, dentro de `ProductosPage`, agregar junto a los demás `useState`:

```tsx
  const [pasoVariantes, setPasoVariantes] = useState<'atributos' | 'combinaciones'>('atributos');
  const [atributosElegidos, setAtributosElegidos] = useState<{ nombre: string; valores: string }[]>([{ nombre: '', valores: '' }]);
  const [combinaciones, setCombinaciones] = useState<{ clave: string; atributos: Record<string, string>; sku: string; sale_price: string; cost_price: string; initial_stock: string }[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [productoRecienCreadoId, setProductoRecienCreadoId] = useState<number | null>(null);
```

- [ ] **Step 2: Generar combinaciones (producto cartesiano) a partir de los atributos**

Agregar esta función dentro de `ProductosPage`, cerca de `saveProduct`:

```tsx
  function generarCombinaciones() {
    const atributosValidos = atributosElegidos
      .filter(a => a.nombre.trim() && a.valores.trim())
      .map(a => ({ nombre: a.nombre.trim(), valores: a.valores.split(',').map(v => v.trim()).filter(Boolean) }));

    if (atributosValidos.length === 0) {
      setCombinaciones([]);
      return;
    }

    let filas: Record<string, string>[] = [{}];
    for (const attr of atributosValidos) {
      const nuevasFilas: Record<string, string>[] = [];
      for (const fila of filas) {
        for (const valor of attr.valores) {
          nuevasFilas.push({ ...fila, [attr.nombre]: valor });
        }
      }
      filas = nuevasFilas;
    }

    setCombinaciones(filas.map(fila => {
      const sufijo = Object.values(fila).join('-').toUpperCase().replace(/\s+/g, '');
      const base = (form.name || 'SKU').toUpperCase().replace(/\s+/g, '').slice(0, 10);
      return { clave: Object.values(fila).join('|'), atributos: fila, sku: `${base}-${sufijo}`, sale_price: form.sale_price || '', cost_price: form.cost_price || '', initial_stock: '' };
    }));
    setPasoVariantes('combinaciones');
  }

  function aplicarATodas(campo: 'sale_price' | 'cost_price' | 'initial_stock', valor: string) {
    setCombinaciones(prev => prev.map(c => ({ ...c, [campo]: valor })));
  }

  async function guardarVariantes(productId: number) {
    if (combinaciones.length === 0) return;
    const body = {
      warehouse_id: warehouseId ? Number(warehouseId) : undefined,
      skus: combinaciones.map(c => ({
        sku: c.sku,
        sale_price: Number(c.sale_price) || 0,
        cost_price: c.cost_price ? Number(c.cost_price) : undefined,
        initial_stock: c.initial_stock ? Number(c.initial_stock) : 0,
        attributes: Object.entries(c.atributos).map(([attribute_name, value]) => ({ attribute_name, value })),
      })),
    };
    await apiFetch(`/products/${productId}/skus/bulk`, { method: 'POST', body: JSON.stringify(body) });
  }
```

- [ ] **Step 3: Conectar el guardado del producto con la creación de variantes**

Reemplazar la función `saveProduct` existente por esta versión (guarda el producto y, si es nuevo y hay combinaciones armadas, crea los SKUs a continuación):

```tsx
  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, is_published: isPublished };
      if (isNew) {
        const nuevo = await apiFetch('/products', { method: 'POST', body: JSON.stringify(body) });
        if (combinaciones.length > 0) {
          await guardarVariantes(nuevo.id);
        }
      } else {
        await apiFetch(`/products/${selectedProduct.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        if (combinaciones.length > 0) {
          await guardarVariantes(selectedProduct.id);
        }
      }
      setSelectedProduct(null);
      setCombinaciones([]);
      setAtributosElegidos([{ nombre: '', valores: '' }]);
      setPasoVariantes('atributos');
      load();
    } catch (err: any) { alert(err.message); }
    setSaving(false);
  }
```

- [ ] **Step 4: Reemplazar el contenido de la pestaña "SKUs y Variantes" con el asistente**

Reemplazar el bloque `{activeTab === 'SKUs y Variantes' && (...)}` completo por:

```tsx
        {activeTab === 'SKUs y Variantes' && (
          <div className="max-w-4xl">
            {!isNew && selectedProduct?.skus?.length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50"><tr className="text-xs text-slate-400 uppercase">
                    <th className="px-4 py-3 text-left">SKU</th><th className="px-4 py-3 text-left">Variantes</th>
                    <th className="px-4 py-3 text-right">Costo</th><th className="px-4 py-3 text-right">Precio</th>
                  </tr></thead>
                  <tbody>
                    {selectedProduct.skus.map((s: any) => (
                      <tr key={s.id} className="border-t border-slate-50">
                        <td className="px-4 py-3 font-mono text-sm">{s.sku}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {(s.attribute_values || []).map((av: any) => av.value).join(', ') || '-'}
                        </td>
                        <td className="px-4 py-3 text-right">${Number(s.cost_price||0).toLocaleString('es-CO')}</td>
                        <td className="px-4 py-3 text-right">${Number(s.sale_price||0).toLocaleString('es-CO')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {pasoVariantes === 'atributos' ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="font-black text-sm text-slate-700 mb-1">Variantes (opcional)</h3>
                <p className="text-xs text-slate-400 mb-4">Ej: Talla con valores "S, M, L" y Color con valores "Rojo, Azul". Deja vacio si el producto no tiene variantes.</p>
                {atributosElegidos.map((a, i) => (
                  <div key={i} className="grid grid-cols-2 gap-3 mb-2">
                    <input placeholder="Atributo (ej: Talla)" value={a.nombre}
                      onChange={e => setAtributosElegidos(prev => prev.map((x, idx) => idx === i ? { ...x, nombre: e.target.value } : x))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400" />
                    <input placeholder="Valores separados por coma (ej: S, M, L)" value={a.valores}
                      onChange={e => setAtributosElegidos(prev => prev.map((x, idx) => idx === i ? { ...x, valores: e.target.value } : x))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400" />
                  </div>
                ))}
                <button type="button" onClick={() => setAtributosElegidos(prev => [...prev, { nombre: '', valores: '' }])}
                  className="text-xs font-bold text-purple-600 mt-1">+ Agregar otro atributo</button>
                <div className="mt-4">
                  <button type="button" onClick={generarCombinaciones}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-bold text-sm">
                    Generar combinaciones
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-black text-sm text-slate-700">{combinaciones.length} combinaciones generadas</h3>
                  <button type="button" onClick={() => setPasoVariantes('atributos')} className="text-xs font-bold text-slate-500">← Cambiar atributos</button>
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Bodega para el stock inicial</label>
                  <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
                    className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400">
                    <option value="">Seleccionar...</option>
                    {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-slate-400 uppercase">
                    <th className="text-left py-2">Variante</th><th className="text-left py-2">SKU</th>
                    <th className="text-right py-2">Precio <button type="button" className="text-purple-600 font-bold ml-1" onClick={() => aplicarATodas('sale_price', combinaciones[0]?.sale_price || '')}>(aplicar a todas)</button></th>
                    <th className="text-right py-2">Costo</th><th className="text-right py-2">Stock inicial</th>
                  </tr></thead>
                  <tbody>
                    {combinaciones.map((c, i) => (
                      <tr key={c.clave} className="border-t border-slate-50">
                        <td className="py-2">{Object.values(c.atributos).join(' / ')}</td>
                        <td className="py-2">
                          <input value={c.sku} onChange={e => setCombinaciones(prev => prev.map((x, idx) => idx === i ? { ...x, sku: e.target.value } : x))}
                            className="w-32 border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono" />
                        </td>
                        <td className="py-2 text-right">
                          <input type="number" value={c.sale_price} onChange={e => setCombinaciones(prev => prev.map((x, idx) => idx === i ? { ...x, sale_price: e.target.value } : x))}
                            className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-xs text-right" />
                        </td>
                        <td className="py-2 text-right">
                          <input type="number" value={c.cost_price} onChange={e => setCombinaciones(prev => prev.map((x, idx) => idx === i ? { ...x, cost_price: e.target.value } : x))}
                            className="w-24 border border-slate-200 rounded-lg px-2 py-1 text-xs text-right" />
                        </td>
                        <td className="py-2 text-right">
                          <input type="number" value={c.initial_stock} onChange={e => setCombinaciones(prev => prev.map((x, idx) => idx === i ? { ...x, initial_stock: e.target.value } : x))}
                            className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-xs text-right" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-slate-400 mt-3">Las combinaciones se crean al guardar el producto con el botón "Guardar" de arriba.</p>
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 5: Actualizar el selector de Categoría para mostrar la jerarquía**

Reemplazar el `<select>` de Categoría (dentro de la pestaña "Informacion General") por:

```tsx
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Categoria</label>
                  <select value={form.category_id} onChange={e=>setForm(f=>({...f,category_id:e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-400">
                    <option value="">Seleccionar...</option>
                    {categories.filter((c:any) => !c.parent_id).map((c:any) => (
                      <optgroup key={c.id} label={c.name}>
                        <option value={c.id}>{c.name}</option>
                        {categories.filter((h:any) => h.parent_id === c.id).map((h:any) => (
                          <option key={h.id} value={h.id}>&nbsp;&nbsp;{h.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
```

- [ ] **Step 6: Verificación manual**

Con backend y frontend locales corriendo: crear un producto nuevo, en la pestaña "SKUs y Variantes" escribir Talla="S, M" y Color="Rojo, Azul", generar combinaciones (deben salir 4 filas), poner precio y stock, guardar el producto completo, y confirmar en la lista que el producto aparece y que sus SKUs se crearon (reabrirlo y ver la tabla de SKUs con las 4 variantes).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/dashboard/inventario/productos/page.tsx
git commit -m "feat: asistente de variantes en la creacion de producto (categoria jerarquica + SKUs masivos)"
```

---

### Task 6: Indicador "Requiere revisión" para productos migrados

**Files:**
- Modify: `backend/app/api/v1/catalog.py` (filtro en `list_products`)
- Modify: `frontend/src/app/dashboard/inventario/productos/page.tsx` (columna/filtro)

**Interfaces:**
- Consumes: `Product.necesita_revision` (Task 3), asistente de variantes (Task 5, para completar el producto marcado).

- [ ] **Step 1: Agregar el filtro en el backend**

En `backend/app/api/v1/catalog.py`, reemplazar la función `list_products`:

```python
@router.get("/products")
def list_products(brand_id: Optional[int] = None, category_id: Optional[int] = None, necesita_revision: Optional[bool] = None, db: Session = Depends(get_db), _user=Depends(require_roles(*ALL_ERP_ROLES))):
    query = db.query(Product)
    if brand_id:
        query = query.filter(Product.brand_id == brand_id)
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if necesita_revision is not None:
        query = query.filter(Product.necesita_revision == necesita_revision)

    products = query.all()
    return {"status": "success", "data": [schemas.ProductResponse.model_validate(p).model_dump() for p in products]}
```

Y en `backend/app/schemas/catalog.py`, agregar `necesita_revision: bool = False` a `ProductBase` (para que venga en las respuestas):

```python
class ProductBase(BaseModel):
    brand_id: int
    category_id: int
    name: str
    description: Optional[str] = None
    type: str
    base_currency: str
    uom: Optional[str] = None
    is_active: bool = True
    necesita_revision: bool = False
```

- [ ] **Step 2: Escribir una prueba rápida del filtro**

Agregar al final de `backend/tests/test_catalogo_configurable_migracion.py`:

```python
    def test_filtro_necesita_revision_en_listado(self, app_client, admin_token):
        r = app_client.get("/api/v1/products?necesita_revision=true",
                            headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        for p in r.json()["data"]:
            assert p["necesita_revision"] is True
```

- [ ] **Step 3: Correr las pruebas**

Run: `cd backend && pytest tests/test_catalogo_configurable_migracion.py -v`
Expected: PASS (incluyendo el nuevo test).

- [ ] **Step 4: Agregar el filtro y la insignia en el frontend**

En `frontend/src/app/dashboard/inventario/productos/page.tsx`, agregar un estado para el filtro junto a `search`:

```tsx
  const [soloRevision, setSoloRevision] = useState(false);
```

Actualizar `load` para incluir el filtro:

```tsx
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (soloRevision) params.set('necesita_revision', 'true');
      const d = await apiFetch(`/products?${params}&limit=100`);
      setProducts(Array.isArray(d) ? d : (d?.data ?? d?.products ?? []));
      setTotal(d?.total ?? (Array.isArray(d) ? d.length : 0));
    } catch { setProducts([]); }
    finally { setLoading(false); }
  }, [search, soloRevision]);
```

Agregar el botón de filtro junto al buscador (dentro del bloque que ya tiene el input de búsqueda y el botón de refrescar):

```tsx
              <button onClick={() => setSoloRevision(v => !v)}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${soloRevision ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-slate-200 text-slate-500'}`}>
                Requiere revisión
              </button>
```

Agregar la insignia en la fila de la tabla (dentro de la celda del nombre del producto, después del `<div className="text-xs text-slate-400">Ref: ...` existente):

```tsx
                        {p.necesita_revision && (
                          <span className="inline-block mt-1 text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Requiere revisión</span>
                        )}
```

- [ ] **Step 5: Verificación manual**

Con datos migrados localmente (correr `python -m scripts.migrate_legacy_catalog` contra la base local de prueba), abrir la pantalla de Productos, activar el filtro "Requiere revisión", confirmar que solo aparecen los migrados con variantes libres, abrir uno y completar sus variantes reales con el asistente de la Task 5.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/catalog.py backend/app/schemas/catalog.py backend/tests/test_catalogo_configurable_migracion.py frontend/src/app/dashboard/inventario/productos/page.tsx
git commit -m "feat: filtro e insignia de productos migrados que requieren revision de variantes"
```
