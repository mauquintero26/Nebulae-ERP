# Walkthrough de Usuario (UX/UI Flow) - Nebulae

Este documento describe la experiencia de los diferentes usuarios (Clientes, Asesores, Logística y Gerencia) a través de la plataforma unificada.

## 1. El Cliente (Flujo Público B2C)
1. El cliente ingresa a `/store` (Landing B2C) desde un anuncio de Instagram.
2. Navega por el catálogo mobile-first, ve el detalle de un "Extractor de Leche", elige variantes y lo añade al *Slide-over Cart*.
3. Pasa al `/store/checkout` (One-Page Checkout). Deja sus datos, paga y el sistema le muestra confirmación.
4. *Fondo:* Esta orden viaja instantáneamente al backend, creando el Lead y la Orden en el CRM.

## 2. El Asesor de Ventas (Asistente Omnicanal)
1. El asesor recibe un WhatsApp del cliente preguntando por su pago.
2. Abre `/dashboard/asistente_omnicanal`. En el panel ve el chat de WhatsApp unificado.
3. El **Buscador/Perfil 360°** de la columna derecha identifica automáticamente al cliente.
4. El asesor ve el *Acordeón de Órdenes*, donde dice "Orden #002 - Pendiente de Pago".
5. Si el cliente compra algo más por el chat, el asesor da clic en "+ Nueva Venta" o usa la IA para "Subir última venta automáticamente" a partir de la conversación.

## 3. Operador Logístico (Ventas e Inventario)
1. Entra a `/dashboard/ventas`. En los bloques superiores nota una **Alerta Roja** de que un pedido ON_DEMAND está a 24 hrs de su fecha de entrega.
2. Va a la vista de **Kanban Logístico** y arrastra la tarjeta de "Por Facturar" a "En Despacho".
3. Le da clic a la tarjeta, abriendo el **Modal Slide-over de Venta**.
4. Allí visualiza el *Stepper de Progreso*, las direcciones de entrega, y hace clic en "Registrar Actividad: Mercancía empacada".
5. Si no hay existencias, navega a `/dashboard/inventario/stock` para confirmar la alerta de bajo stock y generar una Orden de Compra desde `/dashboard/inventario/operaciones`.

## 4. El Gerente Financiero (P&L y Análisis)
1. A fin de mes, el CFO entra a `/dashboard/finanzas/resumen`.
2. Revisa la gráfica de cascada que muestra cómo las ventas (del módulo de ventas) se reducen por el Costo de Ventas (COGS del Inventario) y los gastos (registrados en OPEX), dando la utilidad neta.
3. El **CFO Virtual (IA)** lanza una alerta en la barra lateral oscura advirtiendo que el costo de pauta en Facebook Ads subió, afectando el margen del producto "Coche Paseador".
