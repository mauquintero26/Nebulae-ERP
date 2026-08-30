# Reglas de Negocio: Inteligencia Financiera y Dashboard (Fase 4)

**Proyecto:** Nebulae ERP & CRM
**Módulo:** Light Accounting & OPEX
**Estado:** Definido (Iterativo)

---

## 1. Control de Gastos Operativos (OPEX)
La tabla `OPERATIONAL_EXPENSES` será el corazón de las salidas de dinero que no están directamente atadas a la compra de mercancía.

**Categorías Base Iniciales:**
* Nómina (Salarios y Bonos)
* Arriendo (Bodegas / Locales)
* Equipos (Hardware / Mantenimiento)
* Pauta Digital (Meta Ads, Google)
* Suscripciones de Software (Servidores, Herramientas, ERPs)
* Servicios Públicos e Internet.
* *Nota Técnica:* El sistema tendrá una interfaz de **Categorías Dinámicas** para que el administrador pueda agregar, editar o archivar nuevos tipos de gastos a medida que el negocio escale, sin necesidad de reprogramar el sistema.

**Tipos de Gasto:**
* *Recurrentes:* Arriendo, Suscripciones (El sistema los puede auto-generar cada mes).
* *Variables:* Publicidad, Bonos, Mantenimiento.

## 2. El Dashboard Financiero (El "P&G" en Tiempo Real)
El objetivo de Nebulae no es solo vender, sino saber cuánto dinero real queda en el banco. El Dashboard principal calculará automáticamente el "Estado de Pérdidas y Ganancias" (P&L) usando esta fórmula maestra:

1. **Ingresos Brutos:** Sumatoria de todas las `SALES_ORDERS` pagadas en el mes.
2. **(-) Costo de Ventas (COGS):** Sumatoria del costo de importación real (`cost_price` re-costeado en Fase 3) de los productos vendidos.
3. **(=) UTILIDAD BRUTA:** El margen real que dejó la venta de los productos.
4. **(-) OPEX:** Sumatoria de los Gastos Operativos del mes.
5. **(=) UTILIDAD NETA ANTES DE IMPUESTOS:** El dinero real que ganó Nebulae.

## 3. Sugerencia de Innovación: El Asistente IA Financiero (CFO Virtual)
Ya que tenemos un Asistente de IA leyendo los chats en la Fase 2, le daremos permisos de lectura sobre este módulo financiero para que actúe como tu CFO (Director Financiero) personal. 

**Capacidades Sugeridas para la IA:**
* **Alerta de Anomalías Publicitarias:** La IA cruzará el gasto de *Pauta Digital* vs los *Leads Frescos* del CRM. Si detecta que estás gastando más en Ads pero los chats no suben, te enviará una alerta.
* **Predicción de Flujo de Caja (Cashflow):** La IA sumará tus gastos recurrentes (Nómina, Arriendo) y las compras internacionales en tránsito (`PURCHASE_ORDERS`), y te avisará si las ventas actuales cubren esos compromisos a fin de mes.
* **Rentabilidad por Categoría:** La IA analizará qué *Marca* o *Categoría* (ej. Maternidad vs Juguetes) deja la mayor Utilidad Bruta vs el tiempo que pasa estancada en bodega, sugiriéndote qué productos volver a importar y cuáles descontinuar.

---
*Este módulo está diseñado para ser flexible. Se agregarán más KPIs a medida que la operación lo dicte.*
