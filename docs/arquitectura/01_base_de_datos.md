# Arquitectura de Base de Datos Central (Fase 1)

**Proyecto:** Nebulae ERP & CRM
**Módulo:** Cimientos / Core Architecture
**Inspiración:** Arquitectura tipo Odoo (Flexible y Escalable)
**Estado:** Evolutivo (Actualizado con Inventario Logístico Avanzado)

---

## 1. Gestión de Accesos (Usuarios y Permisos)
* **ROLES:** `Administrador`, `Vendedor`, `Gestión Interna (ERP)`, `Finanzas`, `Mercadeo`.
* **PERMISOS:** Control granular a través de `ROLE_PERMISSIONS`.

## 2. Catálogo Robusto (Estilo Odoo)
* Motor de atributos dinámicos (`ATTRIBUTES`, `ATTRIBUTE_VALUES`, `SKU_ATTRIBUTE_VALUES`) para permitir infinitas variaciones de producto (Color, Talla, Sabor, etc.).
* Múltiples imágenes HD por producto.

## 3. Logística e Inventario Avanzado (Operaciones Físicas)
Para soportar la complejidad logística de entregas, paquetes y reposiciones, el inventario funciona en 3 capas:
1. **Bodegas y Rutas (`WAREHOUSES`):** Control de bodegas centrales y remotas.
2. **Operaciones Logísticas (`INVENTORY_OPERATIONS`):** El documento físico (Albarán). Agrupa los movimientos y define si es una Recepción, Traslado Interno o Entrega. Aquí se define el **Método de Envío** y el **Tracking**.
3. **Movimientos / Kardex (`INVENTORY_MOVEMENTS`):** El detalle línea por línea (SKU y Cantidad) que pertenece a una Operación.
4. **Niveles y Reposición:** `INVENTORY_LEVELS` (Stock actual) y `STOCK_REPLENISHMENT_RULES` (Reglas de máximos y mínimos para re-abastecimiento automático).

## 4. Diagrama Entidad-Relación (ERD Avanzado)

```mermaid
erDiagram
    %% SEGURIDAD Y USUARIOS
    USERS {
        int id PK
        string email
        string role "Admin, Vendedor, ERP..."
    }

    %% CATÁLOGO ROBUSTO
    PRODUCTS {
        int id PK
        string name
        string type "Fisico, Servicio"
        string base_currency
    }
    PRODUCT_SKUS {
        int id PK
        int product_id FK
        string sku
        decimal cost_price
        decimal sale_price
    }

    %% INVENTARIO, BODEGAS Y REPOSICIÓN
    WAREHOUSES {
        int id PK
        string name
        string location_type "Central, Remota"
    }
    INVENTORY_LEVELS {
        int id PK
        int sku_id FK
        int warehouse_id FK
        int quantity
    }
    STOCK_REPLENISHMENT_RULES {
        int id PK
        int sku_id FK
        int warehouse_id FK
        int min_quantity
        int max_quantity
    }

    %% OPERACIONES LOGÍSTICAS (RECEPCIONES, ENTREGAS, TRASLADOS)
    SHIPPING_METHODS {
        int id PK
        string name "FedEx, Interrapidisimo, Moto"
        decimal base_cost
    }
    INVENTORY_OPERATIONS {
        int id PK
        int source_warehouse_id FK
        int dest_warehouse_id FK
        int shipping_method_id FK
        string operation_type "RECEIPT, DELIVERY, TRANSFER, PHYSICAL_INVENTORY"
        string tracking_number
        string package_type "Caja Pequeña, Bolsa, Estiba"
        string status "DRAFT, READY, DONE, CANCELLED"
    }
    INVENTORY_MOVEMENTS {
        int id PK
        int operation_id FK
        int sku_id FK
        int quantity
    }

    %% TRANSACCIONAL
    QUOTATIONS {
        int id PK
        decimal total_amount
    }
    SALES_ORDERS {
        int id PK
        int customer_id FK
        string status
    }

    %% RELACIONES CLAVE INVENTARIO
    PRODUCT_SKUS ||--o{ INVENTORY_LEVELS : "tiene stock en"
    WAREHOUSES ||--o{ INVENTORY_LEVELS : "almacena"
    
    PRODUCT_SKUS ||--o{ STOCK_REPLENISHMENT_RULES : "reglas de"
    
    INVENTORY_OPERATIONS ||--|{ INVENTORY_MOVEMENTS : "contiene lineas"
    SHIPPING_METHODS ||--o{ INVENTORY_OPERATIONS : "usado en"
    
    PRODUCT_SKUS ||--o{ INVENTORY_MOVEMENTS : "movido en"
```
