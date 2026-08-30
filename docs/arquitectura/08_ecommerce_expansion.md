# Reglas de Negocio: Expansión E-Commerce (Fase 5)

**Proyecto:** Nebulae ERP & CRM
**Módulo:** Canal de Ventas Web Público
**Estado:** Planeación Futura

---

## 1. Visión General (El Anti-Shopify)
La Fase 5 consta de construir una tienda virtual pública (Página Web) para clientes finales. La ventaja competitiva estructural de Nebulae es que **no usaremos plataformas de terceros (como Shopify o WooCommerce) que requieran sincronización.** 

La página web leerá y escribirá directamente en nuestra Base de Datos Central (`01_base_de_datos.md`). 

* **Inventario Real:** Si un producto se vende por WhatsApp en el CRM, desaparece de la página web instantáneamente.
* **Cero APIs Intermedias:** No hay retrasos ni fallas de sincronización de stock.

## 2. Experiencia del Cliente B2C
* **Catálogo Dinámico:** La web mostrará únicamente los productos (`PRODUCTS` y `PRODUCT_SKUS`) marcados con `is_active = true` y cuyo `INVENTORY_LEVELS` sea mayor a 0.
* **Carrito y Checkout:** Creación de carritos de compra que generen automáticamente una cotización temporal. Al pagar, se convierte en una `SALES_ORDER`.
* **Pasarela de Pagos:** Integración con Wompi, MercadoPago, Stripe o ePayco (a definir en su momento) para recaudos automáticos.

## 3. Conexión con el Ecosistema Nebulae
La magia de esta fase ocurre en el backend, donde el E-Commerce se fusiona con las Fases 2, 3 y 4:

1. **Impacto Logístico:** Una venta web generará automáticamente un movimiento de inventario (`OUT_SALE`) y alertará a la bodega para su despacho.
2. **Impacto Financiero:** El dinero de la venta entra directamente a la fórmula de Ingresos Brutos en el Dashboard Financiero, descontando automáticamente el costo de envío e impuestos.
3. **Impacto en el CRM (Asistente IA):** 
   * La página web será tratada como un "Canal" más (igual que WhatsApp o Instagram).
   * **Carrito Abandonado:** Si un cliente se registra en la web, añade productos al carrito pero no paga, la IA del CRM creará un "Lead" y le sugerirá al asesor humano enviarle un mensaje por WhatsApp ofreciéndole ayuda para cerrar esa venta.
   * **Re-compra:** El CRM sabrá que el cliente de WhatsApp es el mismo que compró por la web anoche, unificando su LTV (Valor de Vida del Cliente).

## 4. Stack Tecnológico de la Web
* **Frontend:** Next.js (App Router), optimizado para SEO (Posicionamiento en Google) usando Server Side Rendering.
* **Diseño:** Tailwind CSS + UI moderna orientada a móviles (Mobile First), dado que el nicho (maternidad, juventud) compra mayoritariamente desde el celular.
