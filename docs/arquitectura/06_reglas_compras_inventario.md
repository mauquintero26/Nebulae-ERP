# Reglas de Negocio: Compras, Logística e Inventario (Fase 3)

**Proyecto:** Nebulae ERP & CRM
**Módulo:** Motor de Egresos y Logística
**Estado:** Borrador (En revisión)

---

## 1. El Ciclo de Compras (Órdenes de Compra)
A diferencia de empresas tradicionales que compran a mayoristas (B2B), Nebulae se abastece principalmente en tiendas Retail / Online (AliExpress, Amazon, etc.).

**Flujo Operativo:**
1. **Creación de la Orden (PO):** El administrador o encargado de compras registra una Orden de Compra (`PURCHASE_ORDERS`) en el sistema vinculada a un `Proveedor` (ej. Aliexpress).
2. **Registro Financiero:** Se asienta el pago real efectuado (en USD o COP) y el método de pago utilizado.
3. **Detalle de la Orden (`Lines`):** Se agregan los SKUs exactos que fueron comprados y la cantidad esperada. Esto crea un inventario "En Tránsito".

## 2. Trazabilidad Logística (Importación)
Dado que los productos viajan internacionalmente pagando flete por peso (Libras), el sistema debe permitir rastrear el paquete a través de múltiples estados antes de que pueda ser vendido a un cliente.

**Estados sugeridos para una Orden de Compra:**
* `Comprado` (Se pasó la tarjeta en la tienda).
* `En Casillero / Miami` (Entregado por el carrier local de USA/China).
* `En Tránsito a Colombia` (Volando hacia el país).
* `En Aduana` (Proceso de desaduanamiento).
* `Recibido en Bodega` (Cierre del ciclo de logística).

*Requisito Técnico:* La Orden de Compra debe tener un campo de `Tracking_Number` (Guía) para facilitar la labor del equipo de logística.

## 3. Logística Avanzada (Operaciones y Kardex)
Para lograr el nivel de detalle de un ERP empresarial (como Odoo), dividimos la logística en dos capas: el "Albarán/Guía" y el "Movimiento exacto".

### 3.1. Operaciones Logísticas (`INVENTORY_OPERATIONS`)
Es el documento "padre" que agrupa la caja o el envío físico. Contiene:
* **Tipos de Operación:** 
  * `RECEIPT` (Recepción de Compras).
  * `DELIVERY` (Entrega a Clientes).
  * `TRANSFER` (Traslado entre bodegas propias).
  * `PHYSICAL_INVENTORY` (Ajuste por conteo físico/auditoría).
* **Gestión de Envío:** Cada entrega podrá asociarse a un `SHIPPING_METHOD` (Ej. FedEx, Interrapidísimo, Moto propia), llevar un `tracking_number` y definir un `package_type` (Caja, Bolsa).

### 3.2. Movimientos Línea a Línea (`INVENTORY_MOVEMENTS`)
Cada Operación Logística contiene internamente las líneas exactas de los SKUs que se movieron (El Kardex puro). Esto actualiza el nivel de inventario en tiempo real al marcar la Operación como `DONE` (Completada).

## 4. Reposición de Stock Automática (Re-ordering Rules)
El sistema contará con la tabla `STOCK_REPLENISHMENT_RULES` para definir mínimos y máximos por cada SKU en una bodega específica.
* Si el stock de un producto estrella cae por debajo del `min_quantity` tras una Venta, el sistema generará una alerta o una Orden de Compra en borrador (`DRAFT`) de forma automática para evitar el quiebre de stock.

---

## 4. Re-costeo de Importación (Landed Cost)
Es común que al momento de cotizar (Fase 2) se estimen ciertos costos de envío, pero al recibir físicamente la mercancía en Colombia, las transportadoras cobren tarifas distintas (envío por volumen, aranceles variables).

* **Momento de Recepción:** Cuando el usuario marca la Orden de Compra como `Recibida en Bodega`, el sistema abrirá un modal de **"Re-costeo"**.
* **Ajuste de Margen:** El usuario podrá ingresar el costo real facturado del flete e impuestos. El sistema actualizará el `cost_price` del SKU en el inventario, recalculando el margen real que va a dejar la venta de ese lote de productos.

## 5. Arquitectura Multi-Bodega
Nebulae no opera bajo una única locación estática. Para soportar la escala del negocio, el sistema implementará un esquema Multi-Ubicación.

* **Tipos de Bodega:**
  1. `Central` (Bodega principal de acopio).
  2. `Remotas` (Bodegas satélites o locales físicos).
  3. `Asociaciones / Consignación` (Inventario compartido con terceros o aliados).
* **Transferencias:** El libro mayor de inventario (`INVENTORY_MOVEMENTS`) tendrá un tipo de movimiento especial (`TRANSFER`) para documentar cuando la mercancía se mueve de la bodega central a una remota.
* **Impacto en BD:** Se requerirá agregar la entidad `WAREHOUSES` (Bodegas) a la base de datos, y enlazarla a las tablas de niveles y movimientos de inventario.
