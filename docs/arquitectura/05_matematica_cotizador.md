# Matemática del Cotizador (Ingeniería Inversa del Excel)

**Proyecto:** Nebulae ERP & CRM
**Módulo:** Motor de Ingresos / Cotizador
**Fuente:** `Cotiza 2025.xlsx` (Hoja: General y Datos)
**Estado:** Extraído y Documentado

---

## 1. Variables Globales (Configuración del Sistema)
Estas variables solían vivir en la hoja `Datos` del Excel. Ahora vivirán en la base de datos (tabla de configuraciones) o se ingresarán en la interfaz del CRM al momento de cotizar.

* **`TRM_Dia`** (ej. 3157.43)
* **`Ajuste_TRM`** (ej. +50 pesos): Colchón de seguridad para fluctuaciones bancarias.
* **`TRM_Efectiva`** = `TRM_Dia` + `Ajuste_TRM`
* **`Tax_Rate`** (Datos!C12): Impuesto en origen (ej. 7% en USA).
* **`Costo_Libra_COP`** (Datos!C6): Cuánto cuesta traer una libra de peso a Colombia (convertido a pesos).
* **`Target_Margin`** (Datos!C9): Margen de ganancia esperado por defecto (ej. 40% o 0.40).

## 2. Variables de Entrada del Producto (SKU)
Al momento de cotizar, el sistema leerá los siguientes datos de la base de datos de productos (o del link extraído):

* **`Costo_USD`**: Precio base en la tienda de origen (Ej. Aliexpress/Amazon).
* **`Descuento`**: Porcentaje de descuento aplicado en tienda (si aplica).
* **`Envio_Origen_USD`**: Costo de envío interno en el país de origen (muchas veces es $0).
* **`Peso_Libras`**: Peso estimado del producto para calcular la traída a Colombia.

## 3. El Algoritmo de Costeo (Paso a Paso)

El backend de FastAPI deberá ejecutar exactamente esta secuencia matemática al crear o recalcular una Cotización:

### Paso 1: Costo en Origen (Dólares)
1. `Costo_Neto_USD` = `Costo_USD` * (1 - `Descuento`)
2. `Tax_USD` = `Costo_Neto_USD` * `Tax_Rate`
3. `Total_Origen_USD` = `Costo_Neto_USD` + `Tax_USD` + `Envio_Origen_USD`

### Paso 2: Conversión a Pesos (COP) y Logística
4. `Costo_Base_COP` = `Total_Origen_USD` * `TRM_Efectiva`
5. `Costo_Traida_COP` = `Peso_Libras` * `Costo_Libra_COP`
6. **`Costo_Total_COP`** = `Costo_Base_COP` + `Costo_Traida_COP`

*(Este `Costo_Total_COP` es lo que realmente le cuesta a Nebulae tener el producto en sus manos listo para entregar).*

### Paso 3: Cálculo de Venta y Margen
7. **`Precio_Sugerido_Formula`** = `Costo_Total_COP` / (1 - `Target_Margin`)
*(Esta fórmula garantiza que el margen se calcule "por arriba" sobre el precio de venta final, que es la forma financieramente correcta).*

8. **`Precio_Publicado` (Final):** El sistema arroja el `Precio_Sugerido_Formula`, pero permite al asesor o administrador **redondearlo o ajustarlo manualmente** (ej. de $41,342 a $41,900).

9. **`Margen_Real`**: Una vez el asesor define el `Precio_Publicado` final, el sistema recalcula el margen real de la transacción así:
   `Margen_Real` = (`Precio_Publicado` - `Costo_Total_COP`) / `Precio_Publicado`

---

## 4. Anticipos
El Excel revela que se cobra un "Anticipo" (`Datos!C11`). El sistema de cotizaciones en Next.js deberá mostrarle al cliente:
* Valor Total: `Precio_Publicado`
* Valor a Pagar Hoy (Anticipo): `Precio_Publicado` * `% de Anticipo parametrizado`.
