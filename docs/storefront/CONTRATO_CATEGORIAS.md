# Contrato de Categorías — WEB-1

**Fecha:** 2026-09-08  
**Rama:** `feature/storefront-ecommerce`

---

## 1. Endpoint Actual

```
GET /api/v1/ecommerce/categorias
Authorization: No requerida (público)
```

### Respuesta actual observada

```json
[
  {
    "nombre": "Ropa",
    "sub_categorias": ["Niño", "Niña", "Hombre", "Mujer"]
  },
  {
    "nombre": "Calzado",
    "sub_categorias": ["Niño", "Niña", "Hombre", "Mujer"]
  }
]
```

### Limitaciones de la respuesta actual

| Limitación | Impacto |
|-----------|---------|
| Sin campo `id` | No se puede referenciar categorías por ID estable |
| Sin campo `slug` | El frontend genera slugs con `encodeURIComponent(nombre)` — propenso a errores con caracteres especiales |
| Sin campo `orden` | El orden del menú depende del orden del array |
| Sin campo `activa` | No se puede desactivar una categoría sin eliminarla |
| Sin campo `visible_en_menu` | No se puede ocultar del menú sin eliminar |
| `sub_categorias` es `string[]` | Sin ID, slug, orden ni estado para subcategorías |
| Sin campo `parent_id` | No soporta jerarquía mayor a 2 niveles |

---

## 2. Contrato Requerido (WEB-2)

El frontend ya tiene el normalizador `lib/categoryTree.ts` preparado para este contrato.

```json
{
  "data": [
    {
      "id": 1,
      "nombre": "Ropa",
      "slug": "ropa",
      "orden": 1,
      "activa": true,
      "visible_en_menu": true,
      "parent_id": null,
      "sub_categorias": [
        {
          "id": 10,
          "nombre": "Niño",
          "slug": "ropa-nino",
          "orden": 1,
          "activa": true
        },
        {
          "id": 11,
          "nombre": "Niña",
          "slug": "ropa-nina",
          "orden": 2,
          "activa": true
        }
      ]
    }
  ]
}
```

### Campos requeridos por el frontend

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `id` | number / string | Sí | Identificador estable |
| `nombre` | string | Sí | Nombre a mostrar |
| `slug` | string | Sí | URL-safe, sin tildes |
| `orden` | number | Sí | Para ordenar en el menú |
| `activa` | boolean | Sí | Solo mostrar si `true` |
| `visible_en_menu` | boolean | Recomendado | Separar "activa" de "visible en menú" |
| `parent_id` | number / null | Recomendado | Para jerarquía > 2 niveles |
| `sub_categorias[].id` | number / string | Sí | ID estable de subcategoría |
| `sub_categorias[].slug` | string | Sí | URL-safe |
| `sub_categorias[].orden` | number | Sí | Orden en el dropdown |
| `sub_categorias[].activa` | boolean | Sí | Solo mostrar si `true` |

---

## 3. Jerarquía de Navegación Inicial

La siguiente jerarquía debe poder representarse desde la API:

```
Esenciales
Ropa
  ├── Niño
  ├── Niña
  ├── Hombre
  └── Mujer
Calzado
  ├── Niño
  ├── Niña
  ├── Hombre
  └── Mujer
Juguetes
Bienestar y Salud
Promociones  ← colección configurable, no enlace fijo
```

### Reglas

1. Identificar categorías por `slug` o `id`, NO por texto visible
2. "Promociones" debe ser una categoría o colección configurable en el admin — nunca hardcodeada
3. Un ítem de categoría nuevo debe aparecer automáticamente en el menú si `activa=true` y `visible_en_menu=true`
4. El orden del menú está definido por `orden`, no por el orden del array

---

## 4. Comportamiento Actual del Frontend (WEB-1)

### Normalizador
- Ubicación: `lib/categoryTree.ts`
- Input: respuesta actual (nombre + sub_categorias string[])
- Output: árbol de `NavNode` compatible con jerarquías futuras
- Es **retrocompatible** con el contrato extendido requerido

### Comportamiento si la API devuelve array vacío
- Mega-menú muestra: "Ver todo el catálogo →"
- Menú móvil no muestra subcategorías expandibles

### Comportamiento si la API falla
- Menú carga sin categorías
- Link "Catálogo" sigue funcionando

---

## 5. Trabajo Pendiente (WEB-2)

| Tarea | Responsable |
|-------|------------|
| Agregar `id`, `slug`, `orden`, `activa` a `/ecommerce/categorias` | Backend |
| Agregar `visible_en_menu` | Backend |
| Subcategorías con ID y slug propio | Backend |
| `parent_id` para soporte > 2 niveles | Backend (futuro) |
| Filtros del catálogo usando `slug` en lugar de `nombre` | Frontend WEB-2 |
| URL canónica de categoría: `/store/categoria/[slug]` | Frontend WEB-2 |

---

## 6. Filtrado por Categoría

### Comportamiento actual (WEB-1)
```
GET /ecommerce/catalogo?categoria=Ropa&publicado=true
```
El parámetro `categoria` usa el **nombre** de la categoría (string).

### Comportamiento deseado (WEB-2)
```
GET /ecommerce/catalogo?categoria_slug=ropa&publicado=true
```
o por ID:
```
GET /ecommerce/catalogo?categoria_id=1&publicado=true
```

Esto evita errores con nombres que incluyen tildes, mayúsculas o espacios.
