# WEB2A — Contratos API Verificados

**Fecha:** 2026-09-09  
**Fuente:** `backend/app/api/v1/ecommerce.py` (origin/main — lectura directa del código)  
**Base URL:** `${NEXT_PUBLIC_API_URL}/ecommerce/`

---

## Tabla de Contratos Verificados

| Función | Método | Endpoint Real | Parámetros | Respuesta | Estado |
|---------|--------|--------------|------------|-----------|--------|
| Listar productos del catálogo | GET | `/ecommerce/catalogo` | `search` (str), `categoria` (str, ILIKE), `publicado` (bool), `limit` (int, max 500) | `{status, total, data: BackendProduct[]}` | DISPONIBLE |
| Obtener producto por ID | GET | `/ecommerce/catalogo/{id}` | — (path param: int) | `BackendProduct` o envelope | DISPONIBLE |
| Listar categorías web | GET | `/ecommerce/categorias` | — | Array de BackendCategoria | DISPONIBLE |
| Configuración del sitio | GET | `/ecommerce/web-builder/config` | — | `{status, data: WebConfig}` | DISPONIBLE |
| Listar carritos abandonados | GET | `/ecommerce/carritos` | — | Array | DISPONIBLE (requiere auth) |
| Crear/actualizar carrito | POST | `/ecommerce/carritos` | `{session_id, productos, total_cop}` | OK | DISPONIBLE (público) |
| Stats ecommerce | GET | `/ecommerce/stats` | — | Stats object | BLOQUEADO (JWT admin) |
| Listar pedidos web | GET | `/ecommerce/pedidos` | `estado, search, limit, offset` | `{status, total, data}` | BLOQUEADO (JWT admin) |
| Crear pedido (checkout) | POST | `/ecommerce/pedidos` | Ver cuerpo | `SaleOrder` | NO IMPLEMENTADO en WEB-2A |
| Media | GET/POST | `/ecommerce/media` | — | — | BLOQUEADO (JWT admin) |
| Pagos config | GET/PATCH | `/ecommerce/pagos/config` | — | — | VERIFICAR auth |
| Envíos config | GET/PATCH | `/ecommerce/envios/config` | — | — | VERIFICAR auth |
| Fulfillment config | GET/PATCH | `/ecommerce/fulfillment/config` | — | — | VERIFICAR auth |
| Clientes sync | POST | `/ecommerce/clientes/sync-agenda` | — | — | BLOQUEADO (JWT) |

---

## Detalle: GET /ecommerce/catalogo

### Parámetros soportados (verificados en código)

```python
def list_catalogo(
    search: Optional[str] = None,      # ILIKE nombre, SKU, descripcion
    categoria: Optional[str] = None,   # ILIKE categoria
    publicado: Optional[bool] = None,  # = publicado_web
    limit: int = Query(100, le=500),   # máximo 500
    db: Session = Depends(get_db)
):
```

### Respuesta real

```json
{
  "status": "success",
  "total": 42,
  "data": [
    {
      "id": 1,
      "nombre": "Producto X",
      "descripcion": "...",
      "sku": "NEB-001",
      "precio_venta": 50000.0,
      "precio_comparacion": 60000.0,
      "descuento_pct": 16.67,
      "impuesto_pct": 0.0,
      "categoria": "Ropa",
      "sub_categoria": "Blusas",
      "marca": "MarcaA",
      "tipo_producto": "Fisico",
      "imagenes": ["https://..."],
      "atributos": [{"nombre": "Talla", "valor": ["S", "M", "L"]}],
      "variantes": [],
      "stock_disponible": 10.0,
      "modalidad_disponible": "ENTREGA_INMEDIATA",
      "alerta_stock_minimo": 5,
      "publicado_web": true,
      "rastrear_inventario": true,
      "seo_titulo": "...",
      "created_at": "2026-01-01T00:00:00",
      "updated_at": "2026-02-01T00:00:00",
      "is_low_stock": false
    }
  ]
}
```

### Notas críticas

1. **`modalidad_disponible`** (no `modalidad`): Calculado en tiempo real por el servidor.
   Puede ser `"ENTREGA_INMEDIATA"` o `"POR_PEDIDO"` según el stock real NEBULAE.

2. **`stock_disponible`** en la respuesta: Calculado desde `_get_real_sellable_stock()` si existe un `ProductSKU` con el mismo SKU. Si no hay SKU vinculado, usa el campo manual de `ecommerce_products`.

3. **Sin paginación real**: Solo `limit` (máx 500). No hay `offset`, `page`, ni cursor.
   → Ver GAP-001 en `WEB2A_GAPS_BACKEND.md`.

4. **Autenticación**: Ninguna para GET `/catalogo` — endpoint completamente público.

5. **Orden**: `ORDER BY nombre` (alfabético). No hay parámetro de ordenamiento del servidor.
   → Ver GAP-003 en `WEB2A_GAPS_BACKEND.md`.

---

## Detalle: GET /ecommerce/categorias

### Respuesta real

Array de objetos con estructura anidada:
```json
[
  {
    "id": 1,
    "nombre": "Ropa",
    "slug": null,
    "sub_categorias": ["Blusas", "Pantalones"],
    "activa": true,
    "orden": 1
  }
]
```

Compatible con el normalizador `normalizeCategories()` del WEB-1 que maneja:
- `sub_categorias: string[]` (legacy)
- `sub_categorias: Object[]` (anidado)
- `children: Object[]` (árbol)
- `parent_id` (plano)

---

## Detalle: GET /ecommerce/web-builder/config

### Respuesta real

```json
{
  "status": "success",
  "data": {
    "hero": {
      "title": "Bienvenidos a Nebulae",
      "subtitle": "Tu tienda online de confianza",
      "cta_text": "Explorar",
      "info_bar": "Envíos a toda Colombia"
    },
    "contact": {
      "phone": "...",
      "whatsapp": "..."
    },
    "logo_url": "https://...",
    "seo": {
      "site_name": "Nebulae",
      "default_title": "...",
      "default_description": "..."
    }
  }
}
```

---

## Capa store-api Implementada (WEB-2A)

```
frontend/src/lib/store-api/
  errors.ts      — StoreError, fromHttpStatus, fromNetworkError
  types.ts       — BackendProduct, NormalizedProduct, CatalogFilterState, etc.
  client.ts      — HTTP cliente con timeout, AbortController, errores tipados
  query.ts       — URL↔FilterState, client filters, sorting, pagination, formatCOP
  catalog.ts     — listProductos, getProducto, normalizeProduct
  categories.ts  — listCategorias, getSiteConfig
  index.ts       — re-exports
```

### Páginas migradas

| Página | Antes | Después |
|--------|-------|---------|
| `/store` (home) | `fetch()` directo | `listProductos`, `listCategorias`, `getSiteConfig` |
| `/store/catalogo` | `fetch()` directo | `useCatalog` hook |
| `/store/categoria/[slug]` | `fetch()` directo | `useCatalog` hook con `initialCategoria` |
| `/store/producto/[id]` | `fetch()` directo | `getProducto` |
| `store/layout.tsx` | `fetch()` directo | `listCategorias`, `getSiteConfig` |

### Hooks creados

| Hook | Propósito |
|------|-----------|
| `useDebounce` | Retrasa valor para búsquedas (350ms) |
| `useCatalog` | Estado completo del catálogo: filtros URL, debounce, abort, paginación |
