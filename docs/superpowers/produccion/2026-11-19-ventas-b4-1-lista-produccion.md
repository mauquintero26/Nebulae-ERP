# Lista de producción del Bloque 4.1 de Ventas

Se hace solo al promover, y cada paso con el OK del usuario. Nada de esto se corre ahora.

## 1. Qué incluye

El B4.1 se promueve junto con el B4 (su rama sale de 6caf56b). Este documento solo agrega lo del B4.1 a la lista del B4
(FINAL-C1, V1, B49-f…), que sigue vigente.

Documentos reales que ningún paso toca: SC-20260731, COT-20260449, PVEN-20262799, SC-20260746 y PXP-20260010.

## 2. Respaldo

Respaldo de erpdb antes de todo. Lo hace el usuario o el controlador con su OK; nunca se escribe una credencial.

## 3. A6: filas con updated_at vacío

```
cd backend
python scripts/datos_bloque4_1.py updated_at_nulos --listar
```

Contra producción, de solo lectura (no tiene `--aplicar`). Antes de seguir, mira la línea `SELECT current_database() -> `
y el aviso de producción. El resultado se le dice al usuario antes de continuar: si hay filas con updated_at vacío, la
pastilla de atrasados puede subir al promover (coalesce de M6, ver V1).

## 4. Migraciones

`alembic upgrade head`, con el procedimiento de producción de `alembic/env.py`.

- **fa6_034** crea el índice de pedidos por solicitud (A5). `sale_orders` tiene miles de filas y CREATE INDEX la bloquea para
  escribir unos instantes: se hace fuera del horario de pedidos.
- **fa6_035** agrega dos columnas nulas al instante (moneda y plazo de entrega del proveedor).

## 5. Despliegue

Primero el backend y después el frontend. El frontend del B4.1 lee `atrasados_por_vista`, `editable_en_tienda`,
`currency`/`lead_time_days` y `observaciones`; con un backend viejo, P4 queda gris («—») y el resto sale como hoy.

## 6. A1-b: ids del catálogo de la tienda

1. Listar, solo lectura:

   ```
   python scripts/datos_bloque4_1.py catalogo_ids --listar
   ```

   Muestra las URL de la tienda que cambian de `/store/producto/n` a `/store/producto/-n` y las historias de Marketing que
   apuntaban a una fila SKU, cada una con su clase (`sku`, `tienda` o `dudosa`).

2. **Qué ids se aprueban.** El comando de `--aplicar` se arma solo con las historias de clase `sku` que el usuario apruebe.
   Las `dudosa` se le muestran aparte y las decide él: el comando que imprime el listado ya NO las incluye (una nota las
   nombra); si aprueba alguna, se suma a `--ids` a mano. Las de clase `tienda` no se tocan.

   **`--aplicar` de A1-b es opcional (cosmético).** `social_posts.producto_id` no tiene lector en el repositorio (solo el
   INSERT y el `<select>` del formulario de Marketing): lo que cambia de verdad son las URL `/store/producto/n`. Si el
   usuario no quiere tocar las historias, no se aplica y no pasa nada visible.

3. **Hueco conocido del listado.** El listado de hoy no ve las historias de un SKU que SÍ tiene espejo en la tienda y que en
   el listado heredado de la tienda (los 200 primeros publicados) salió con el id n (despublicado o fuera de ese límite). Es un hueco conocido que se revisa antes de aplicar: se mira a
   mano en `social_posts` si alguna historia apunta a un SKU con espejo y se decide con el usuario.

4. Con el OK de los ids:

   ```
   python scripts/datos_bloque4_1.py catalogo_ids --aplicar --base erpdb --ids <ids aprobados> --respaldo <carpeta persistente>
   ```

   `--respaldo` va con una carpeta persistente que el usuario elija (no el disco efímero del contenedor): el JSON de respaldo es la única forma de deshacer.

5. **Cómo deshacerlo:** el `UPDATE` por fila del JSON de respaldo:
   `UPDATE social_posts SET producto_id = <producto_id> WHERE id = <id>;`

6. **Aviso para el usuario:** lo que haya compartido o indexado con la URL vieja de una fila SKU ahora da 404 u otra fila.
   Esa URL ya abría otro producto o 404.

## 6b. Vencimientos de SC viejas (I1)

El vencimiento de la SC es un día de negocio (los 10 primeros caracteres, `diaDeNegocio`). Las SC viejas que guardaron un
instante (`utcnow + 5`, o el mediodía de T8A) corren un día de noche. Se normalizan una vez en los datos. Va después de las
migraciones (§4) y antes de la Comprobación.

1. Listar, solo lectura, contra producción:

   ```
   python scripts/datos_bloque4_1.py vencimientos_sc --listar
   ```

   Da cada SC con hora distinta de 00:00:00, su valor guardado, el día que muestra hoy y el que tendrá, el total y cuántas
   CAMBIAN de día. Marca y excluye SC-20260731 y SC-20260746 (protegidas). El resultado se le dice al usuario antes de seguir.

2. Con el OK de los ids:

   ```
   python scripts/datos_bloque4_1.py vencimientos_sc --aplicar --base erpdb --ids <ids aprobados> --respaldo <carpeta persistente>
   ```

   `--respaldo` va con una carpeta persistente que el usuario elija (no el disco efímero del contenedor): el JSON (id, numero, valor anterior) se escribe ANTES del UPDATE y es la única forma
   de deshacer. Una protegida en `--ids` aborta sin escribir.
   Si `--aplicar` termina en «ABORTADO» porque una SC no coincidió (su vencimiento cambió desde que se listó), no se
   escribió nada: se vuelve a correr `--listar` y se piden de nuevo los ids.

3. **Cómo deshacerlo:** por cada fila del JSON de respaldo,
   `UPDATE customer_requests SET fecha_vencimiento = <valor_anterior> WHERE id = <id>;`

4. **Nota:** chat.py (H9) sigue creando instantes (`utcnow + 30`) hasta que se lleve a la regla de creación. Mientras tanto,
   una SC creada por el chat de noche vuelve a correrse un día y el listado la mostrará.

## 7. Comprobación después de promover

- `GET /api/v1/ecommerce/catalogo?publicado=true&limit=5`, sin sesión, trae los ids de las filas SKU en negativo.
- `/store/producto/-n` abre.
- Un PATCH a `-n` desde E-Commerce responde el 404 de TEXTO_FILA_DEL_ERP.
- El aviso «N vencidas» de Solicitudes coincide con lo que se ve en la lista.

## 8. Lo que NO se hace en producción

No se corren en producción: las pruebas, el runner, ni el script con `--aplicar` sin `--ids`.
