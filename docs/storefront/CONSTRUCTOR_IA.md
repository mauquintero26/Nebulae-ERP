# Constructor Web con IA — WEB-0: Diseño

**Fecha:** 2026-09-08

---

## 1. Principio Fundamental de Seguridad

> **La IA propone. El humano aprueba. El sistema publica.**

La IA jamás puede:
- Ejecutar código JavaScript arbitrario en producción
- Publicar contenido sin aprobación humana explícita
- Modificar inventario, precios o pedidos
- Acceder a secretos del sistema
- Eliminar contenido en producción
- Modificar datos directamente en PostgreSQL

---

## 2. Flujo de Publicación Controlado

```
[Usuario] Instrucción en lenguaje natural
     ↓
[IA] Genera propuesta estructurada (JSON)
     ↓
[Sistema] Valida JSON contra schema permitido
     ↓ Si JSON inválido o contiene bloques no autorizados → Error
[Usuario] Revisa cambios propuestos (vista previa)
     ↓
[Usuario] Aprueba o rechaza
     ↓ Si rechaza → feedback → nueva propuesta
[Sistema] Guarda como BORRADOR con versión
     ↓
[Usuario] Confirma publicación
     ↓
[Sistema] Publica + guarda versión anterior para rollback
```

---

## 3. Schema JSON de la Config del Sitio

### Estructura base (ya existe en backend)
```json
{
  "hero": {
    "title": "Comodidad que se adapta a ti.",
    "subtitle": "Ropa maternal y para bebé.",
    "cta_text": "Explorar Colección",
    "bg_image": "https://..."
  },
  "contact": {
    "phone": "+57 604 000 0000",
    "whatsapp": "573001234567",
    "email": "hola@nebulaekids.com",
    "address": "Medellín, Colombia"
  },
  "colors": {
    "primary": "#10b981",
    "secondary": "#0f172a"
  }
}
```

### Schema extendido propuesto (WEB-5)
```json
{
  "version": "2.0",
  "published_at": "2026-09-08T18:00:00Z",
  "hero": { ... },
  "contact": { ... },
  "colors": { ... },
  "pages": [
    {
      "slug": "home",
      "title": "Inicio",
      "sections": [
        {
          "type": "hero_banner",
          "props": { "title": "...", "subtitle": "...", "cta_text": "...", "bg_image": "..." }
        },
        {
          "type": "product_grid",
          "props": { "title": "Recién Llegados", "limit": 8, "categoria": null }
        },
        {
          "type": "cta_banner",
          "props": { "text": "¿Primera vez?", "button_text": "Registrarse", "href": "/store/cuenta" }
        }
      ]
    }
  ],
  "navigation": {
    "show_search": true,
    "show_cart": true,
    "links": [
      { "label": "Catálogo", "href": "/store/catalogo" },
      { "label": "Blog", "href": "/store/blog" },
      { "label": "Contacto", "href": "/store/contacto" }
    ]
  },
  "seo": {
    "site_name": "Nebulae Kids",
    "default_title": "Nebulae Kids — Ropa Maternal y Bebé",
    "default_description": "...",
    "og_image": "https://..."
  }
}
```

---

## 4. Catálogo de Bloques Permitidos

### Bloques de contenido (puede usar la IA)

| Tipo | Descripción | Props |
|------|-------------|-------|
| `hero_banner` | Banner principal con imagen y CTA | title, subtitle, cta_text, cta_href, bg_image |
| `product_grid` | Grid de productos | title, limit, categoria, coleccion |
| `product_featured` | Producto destacado | product_id, layout |
| `cta_banner` | Banner de llamado a acción | text, subtext, button_text, href, bg_color |
| `text_block` | Bloque de texto | title, body (markdown) |
| `image_gallery` | Galería de imágenes | images[], layout |
| `category_grid` | Grid de categorías | categorias[], layout |
| `testimonials` | Testimonios | items[] |
| `blog_preview` | Vista previa del blog | limit, categoria |
| `contact_form` | Formulario de contacto | — |
| `collection_banner` | Banner de colección | title, description, image, href |
| `brand_logos` | Logos de marcas | brands[] |
| `announcement_bar` | Barra de anuncio | text, bg_color, link |
| `spacer` | Separador de espacio | height |

### Bloques NO permitidos (bloqueados)

| Tipo bloqueado | Razón |
|----------------|-------|
| `custom_html` | Riesgo XSS |
| `custom_script` | Ejecución arbitraria |
| `custom_css` | Posible inyección |
| `iframe_embed` | Sin whitelist de dominios |
| `inventory_widget` | Acceso directo a datos internos |
| `price_override` | Manipulación de precios |

---

## 5. Capacidades de la IA

### La IA podrá:
- Proponer texto para títulos, descripciones y CTAs
- Recomendar disposición de secciones en una página
- Seleccionar bloques del catálogo permitido
- Generar metadata SEO (title, description, keywords)
- Recomendar productos para colecciones
- Proponer paleta de colores
- Crear borradores de artículos de blog (texto únicamente)
- Programar fechas de publicación
- Sugerir keywords para categorías
- Generar variaciones de copy para pruebas A/B

### La IA NO podrá:
- Generar código JavaScript para ejecutar
- Modificar precios, stock o inventario
- Confirmar o cancelar pedidos
- Publicar directamente sin aprobación
- Acceder a datos de clientes (emails, teléfonos)
- Crear usuarios del sistema
- Eliminar páginas o secciones en producción
- Generar contenido ofensivo o engañoso
- Crear bloques no autorizados

---

## 6. Estrategia de Prompts (WEB-5)

### System prompt base para el constructor
```
Eres el Arquitecto Web de Nebulae Kids, una tienda de ropa maternal y bebé colombiana.
Tu misión es ayudar a crear páginas web atractivas y funcionales para la tienda.

REGLAS:
1. Solo puedes proponer cambios usando los bloques del catálogo autorizado
2. Nunca generes código ejecutable
3. Siempre responde con JSON estructurado según el schema
4. Si el usuario pide algo fuera de tu alcance, explica qué no puedes hacer
5. Los precios, el inventario y los pedidos NO son de tu incumbencia
6. Toda propuesta es un borrador — el usuario aprueba antes de publicar

CONTEXTO DE MARCA:
- Colores: emerald (#10b981) + slate (#0f172a)
- Tono: Cálido, maternal, moderno, colombiano
- Audiencia: Mamás colombianas 25-40 años
- Valores: Comodidad, calidad, diseño, precio justo
```

### Medidas anti-prompt injection
- Sanitizar inputs del usuario antes de enviar al LLM
- Máximo 1000 caracteres de input por mensaje
- Filtrar palabras clave sospechosas (javascript, exec, eval, etc.)
- Validar output JSON del LLM contra schema antes de mostrar al usuario
- No permitir valores de props como `<script>` o `javascript:`

---

## 7. Versionado y Rollback

### Sistema de versiones propuesto
```sql
CREATE TABLE site_versions (
    id SERIAL PRIMARY KEY,
    version_number INTEGER NOT NULL,
    config JSONB NOT NULL,
    created_by VARCHAR(150),
    created_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP,
    is_active BOOLEAN DEFAULT FALSE,
    comment TEXT
);
```

### Reglas de versionado
1. Cada "Publicar" crea una nueva versión
2. Solo puede haber una versión activa (`is_active = TRUE`)
3. Las últimas 10 versiones se conservan
4. El rollback solo requiere cambiar `is_active`
5. El historial de versiones es auditable

---

## 8. Permisos del Constructor

| Acción | Admin | Asesor | Bodega |
|--------|-------|--------|--------|
| Ver editor | ✅ | ✅ (solo lectura) | ❌ |
| Crear borrador | ✅ | ❌ | ❌ |
| Editar borrador | ✅ | ❌ | ❌ |
| Publicar | ✅ | ❌ | ❌ |
| Rollback | ✅ | ❌ | ❌ |
| Ver historial | ✅ | ✅ | ❌ |

---

## 9. Integración con Fases del ERP

| Dato ERP | Cómo lo usará el constructor |
|----------|------------------------------|
| Catálogo de productos | Bloque `product_grid` mostrará productos reales |
| Categorías | Bloque `category_grid` con categorías del ERP |
| Colecciones (a crear) | Bloque `collection_banner` |
| Stock | NO — El constructor no toca inventario |
| Precios | NO — El constructor no modifica precios |

---

## 10. APIs Backend Necesarias para el Constructor (WEB-5)

| Función | Método | Endpoint | Estado actual |
|---------|--------|----------|--------------|
| Obtener config actual | GET | `/ecommerce/web-builder/config` | ✅ Disponible |
| Guardar borrador | PUT | `/ecommerce/web-builder/config` | ✅ Disponible |
| Publicar | POST | `/ecommerce/web-builder/publish` | ✅ Disponible |
| Listar versiones | GET | `/ecommerce/web-builder/versions` | 🔴 Faltante |
| Rollback a versión | POST | `/ecommerce/web-builder/rollback/{id}` | 🔴 Faltante |
| Chat IA (proxy LLM) | POST | `/ecommerce/ai/suggest` | 🔴 Faltante |
| Validar JSON | POST | `/ecommerce/web-builder/validate` | 🔴 Faltante |
| Listar secciones | GET | `/ecommerce/web-builder/sections` | ✅ Disponible |
