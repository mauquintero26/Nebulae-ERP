# Arquitectura del Frontend (Fase 1)

**Proyecto:** Nebulae ERP & CRM
**Módulo:** Cimientos / Core Architecture
**Tecnología Principal:** Next.js (React) + TypeScript + Tailwind CSS
**Estado:** Aprobado / Listo para Desarrollo

---

## 1. Patrón Arquitectónico (Migración e Integración)
La estrategia principal para el Frontend NO es comenzar desde cero absoluto. Se migrará, reutilizará y potenciará el código existente en `C:\Users\jmqui\OneDrive\Documents\CHAT-Structure\frontend`. 

* **Objetivo:** Mantener el Dashboard y la UI/UX actual que ya es funcional, pero "reconectando los cables" internos para que consuman nuestra nueva API robusta de FastAPI y el motor de Base de Datos de la Fase 1.
* **Tecnología Heredada y Confirmada:** Next.js con el App Router (`app/`), TypeScript y Tailwind CSS.

La estructura de carpetas en nuestro nuevo entorno mantendrá la base heredada, organizada lógicamente así:

```text
frontend/
├── src/
│   ├── app/                # Rutas de la aplicación (App Router)
│   │   ├── (auth)/         # Grupo de rutas: login, recuperar clave
│   │   ├── dashboard/      # Layout principal post-login
│   │   │   ├── crm/        # Fase 2: CRM y Chat
│   │   │   ├── ventas/     # Fase 2: Cotizador y Órdenes
│   │   │   ├── logistica/  # Fase 3: Inventario y Compras
│   │   │   └── finanzas/   # Fase 4: Opex y Dashboards
│   │   ├── layout.tsx      # Layout global
│   │   └── page.tsx        # Landing / Redirección
│   ├── components/         # Componentes reutilizables (Botones, Tablas, Modales)
│   ├── lib/                # Utilidades, configuración de Axios/Fetch
│   ├── services/           # Llamadas a la API de FastAPI (separadas por módulo)
│   ├── store/              # Manejo de estado global (Zustand o Context API)
│   └── types/              # Interfaces y tipos de TypeScript compartidos
├── tailwind.config.ts      # Configuración de estilos
├── package.json            # Dependencias
└── .env.local              # Variables de entorno (NEXT_PUBLIC_API_URL)
```

## 2. Comunicación con el Backend (API)
Toda comunicación con la API de FastAPI se centralizará en la carpeta `src/services/`.
* Se usará una instancia configurada de `Axios` (o la API Fetch nativa) en `lib/api.ts` que interceptará todas las peticiones para adjuntar el **Token JWT** automáticamente en los headers (`Authorization: Bearer <token>`).
* Si el token expira (Error 401), el interceptor redirigirá automáticamente al usuario a la pantalla de `/login`.

## 3. Manejo de Estado
* **Estado Local:** `useState` y `useReducer` para componentes individuales (ej. abrir un modal).
* **Estado Global:** Se recomienda **Zustand** para manejar la sesión del usuario (quién está logueado), notificaciones globales y el carrito del cotizador, por ser más ligero y rápido que Redux.
* **Caché y Mutaciones de Datos:** Se recomienda **React Query (TanStack Query)** o la caché nativa de Next.js para manejar las peticiones a la API, estados de carga (loading) y revalidación de datos (ej. actualizar la tabla de stock tras registrar una venta).

## 4. UI / UX y Estilos
* **Framework CSS:** Tailwind CSS.
* **Librería de Componentes:** Se recomienda **shadcn/ui** o **Material UI** para tener tablas, botones y formularios profesionales listos para usar, acelerando el desarrollo.

---

## 5. Siguientes Pasos
El equipo de desarrollo (o el chat encargado del Frontend) iniciará ejecutando `npx create-next-app@latest` en la raíz del proyecto para crear la carpeta `frontend/`, configurando Tailwind y construyendo el sistema de inicio de sesión (Login) conectado al Backend.
