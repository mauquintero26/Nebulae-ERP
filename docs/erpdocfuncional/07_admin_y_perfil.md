# Nebulae ERP HUB — Módulo Administración, Roles y Perfil

## 1. Contexto y Propósito Funcional
El sistema de seguridad y administración de Nebulae asegura que cada miembro del equipo acceda únicamente a las funcionalidades y datos pertinentes a su rol, garantizando la integridad de los datos comerciales, inventarios y finanzas.

---

## 2. Pantallas y Rutas del Módulo

### 2.1 Empleados, Roles & Permisos (`/dashboard/admin/empleados`)
- **Ruta:** `/dashboard/admin/empleados`
- **Componente:** `frontend/src/app/dashboard/admin/empleados/page.tsx`
- **Endpoints Backend Consumidos:**
  - `GET /auth/users`: Listado maestro de cuentas registradas en el sistema.
  - `POST /auth/register`: Creación de nuevas cuentas de empleados con asignación de rol inicial.
  - `PATCH /auth/users/{user_id}/role`: Actualización dinámica de rol funcional (restringido a usuarios con rol `admin`).
- **Matriz de Roles Funcionales:**
  1. **Administrador General (`admin`):** Control total del sistema, configuración de etapas CRM, creación y modificación de roles, auditoría financiera.
  2. **Asesor Comercial (`asesor`):** Gestión de agenda 360, tablero CRM, creación de Solicitudes de Cliente (`SC`), Cotizaciones (`COT`) y Pedidos de Venta (`PVEN`).
  3. **Analista de Compras (`compras`):** Gestión de la Lista de Compras, creación de Órdenes de Compra (`PEC`), seguimiento de tracking internacional y casillero.
  4. **Operario de Bodega (`bodega`):** Recepciones físicas en mesa (`ENINV`), conteo y verificación unitaria, traslados y cola de despacho.
  5. **Auditor Financiero (`finanzas`):** Validación de anticipos del 60%, cobro del 40% saldo y liquidación de costos de importación.

### 2.2 Mi Perfil y Seguridad (`/dashboard/perfil`)
- **Ruta:** `/dashboard/perfil`
- **Componente:** `frontend/src/app/dashboard/perfil/page.tsx`
- **Endpoints Backend Consumidos:**
  - `GET /auth/me`: Consulta de la identidad del usuario logueado, correo, rol activo y fecha de registro.
  - `POST /auth/change-password`: Cambio seguro de contraseña mediante validación de contraseña actual y cálculo de fortaleza (mínimo 8 caracteres, mayúsculas, números y símbolos).
- **Gestión de Sesión:** Información visual del estado de la sesión activa y botón de cierre seguro de sesión que limpia el almacenamiento local.
