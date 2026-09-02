---
trigger: always_on
---

# Regla: No Reescribir Páginas TSX Completas

## NUNCA hagas esto sin autorización explícita del usuario:
- Ejecutar un script Python que sobreescriba un archivo `.tsx` completo
- Delegar a un subagente la reescritura de una página entera
- Usar `write_to_file` sobre una página `.tsx` que ya existe en el proyecto
- Reemplazar más del 30% de las líneas de una página en una sola operación

## SIEMPRE haz esto para mejorar páginas existentes:
1. Leer el archivo actual con `view_file` primero
2. Identificar la sección exacta a modificar (líneas específicas)
3. Usar `replace_file_content` con el bloque mínimo necesario
4. Si el cambio afecta más de 2 secciones no contiguas, explicar el plan al usuario antes de ejecutar

## Frases que autorizan reescritura total (únicas excepciones):
- "reescribe completamente"
- "borra todo y rehaz desde cero"
- "ignora el diseño anterior"
- "nueva versión desde cero"

## Páginas con diseño aprobado — máxima protección:
- `frontend/src/app/dashboard/ventas/page.tsx` — Hub de Ventas v5
- `frontend/src/app/dashboard/ventas/venta/page.tsx` — Pedidos de Venta v2
- `frontend/src/app/dashboard/ventas/solicitud/page.tsx` — Solicitudes de Cliente
- `frontend/src/app/dashboard/ventas/cotizacion/page.tsx` — Cotizaciones
- `frontend/src/app/dashboard/crm/page.tsx` — CRM Hub
- `frontend/src/app/dashboard/compras/page.tsx` — Compras Hub

## Antes de cualquier cambio a una pantalla existente:
Preguntarse internamente: ¿Puedo resolver esto con `replace_file_content` en menos de 3 bloques?
- Si SÍ → proceder con edits quirúrgicos
- Si NO → explicar al usuario qué secciones se verán afectadas y pedir confirmación
