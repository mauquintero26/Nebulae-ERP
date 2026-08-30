# Arquitectura de la API (Fase 1)

**Proyecto:** Nebulae ERP & CRM
**Módulo:** Cimientos / Core Architecture
**Tecnología Principal:** FastAPI (Python) + PostgreSQL
**Estado:** Aprobado / Listo para Desarrollo

---

## 1. Patrón Arquitectónico
Se utilizará una arquitectura basada en capas (Layered Architecture) para separar las responsabilidades, lo cual facilita la escalabilidad y el mantenimiento del código.

La estructura de carpetas sugerida para el backend en FastAPI es la siguiente:

```text
backend/
├── app/
│   ├── api/             # Controladores (Routers y Endpoints de FastAPI)
│   │   ├── v1/          # Versionamiento de la API
│   │   └── dependencies.py # Inyección de dependencias (ej. obtener usuario actual)
│   ├── core/            # Configuraciones globales, seguridad (JWT), settings
│   ├── db/              # Conexión a la base de datos (Engine, Session)
│   ├── models/          # Modelos de Base de Datos (SQLAlchemy/SQLModel)
│   ├── schemas/         # Esquemas de Pydantic (Validación de entrada y salida)
│   ├── services/        # Lógica de Negocio (Donde ocurre la magia de las Cotizaciones/TRM)
│   └── main.py          # Punto de entrada de la aplicación FastAPI
├── requirements.txt     # Dependencias del proyecto
└── .env                 # Variables de entorno (Credenciales de BD)
```

## 2. Estandarización de Respuestas

Para que el Frontend (Next.js) y futuros módulos se comuniquen fácilmente, todas las respuestas de la API seguirán un formato estándar (JSend format):

**Éxito (200 OK / 201 Created):**
```json
{
  "status": "success",
  "data": {
    "id": 1,
    "name": "Camiseta Materna"
  }
}
```

**Error (400 Bad Request / 404 Not Found / 500 Internal Error):**
```json
{
  "status": "error",
  "message": "Stock insuficiente para el SKU 12345."
}
```

## 3. Autenticación y Seguridad (SSO)
* **Estándar:** JWT (JSON Web Tokens).
* **Flujo:** 
  1. El usuario (Vendedor/Admin) envía sus credenciales a `/api/v1/auth/login`.
  2. La API devuelve un token JWT con el `role` y el `user_id`.
  3. El Frontend envía este token en el header `Authorization: Bearer <token>` en cada petición.
  4. La API verifica los permisos del rol antes de ejecutar la acción.

## 4. Endpoints Principales Iniciales (Fase 1)

Basado en nuestro esquema de base de datos (`01_base_de_datos.md`), los primeros módulos de la API serán:

### Auth & Users
* `POST /auth/login`: Iniciar sesión.
* `GET /users/me`: Obtener perfil actual.

### Catálogo (Products, Brands, Categories, SKUs)
* `GET /products/`: Listar productos (con filtros por categoría y marca).
* `POST /products/`: Crear nuevo producto general.
* `POST /products/{id}/skus`: Agregar una variante (SKU) a un producto.

### Cotizaciones (El motor de precios)
* `POST /quotations/`: Crear nueva cotización (Aquí el backend consultará la TRM y el costo del SKU).
* `GET /quotations/{id}`: Ver el detalle para imprimir o enviar.

### Inventario (Logística)
* `GET /inventory/levels`: Ver stock actual.
* `POST /inventory/movements`: Registrar entrada (compra) o salida (venta/ajuste).

## 5. Decisiones Técnicas (Stack)
1. **Framework API:** FastAPI (Por su velocidad y autogeneración de documentación Swagger).
2. **ORM (Object-Relational Mapping):** SQLAlchemy 2.0 o SQLModel (Facilita la escritura de consultas SQL en Python).
3. **Migraciones de BD:** Alembic (Para tener un control de versiones de los cambios en las tablas).
4. **Base de Datos:** PostgreSQL.

---

## 6. Siguientes Pasos
El equipo de desarrollo iniciará inicializando el proyecto de FastAPI, configurando la conexión a la base de datos PostgreSQL, y creando los Modelos (Tablas) definidos en la Arquitectura de Base de Datos.
