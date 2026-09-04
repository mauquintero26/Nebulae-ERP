# Incidente de Seguridad — Credenciales Expuestas en Historial

**Fecha de detección:** 2026-09-04  
**Severidad:** CRÍTICA  
**Estado:** Credenciales removidas de HEAD. Historial pendiente de reescritura con autorización.

---

## ¿Qué ocurrió?

Cadenas de conexión con credenciales reales de base de datos PostgreSQL fueron
commiteadas en el repositorio público `mauquintero26/Nebulae-ERP`.

## Archivos afectados en HEAD (ya limpiados)

| Archivo | Tipo de exposición | Estado |
|---|---|---|
| `backend/migrate_erp_v2.py` | URL completa con password hardcoded | ✅ Limpiado |
| `backend/tests/conftest.py` | IP de VPS hardcoded (sin password) | ✅ Limpiado |
| `docs/RESUMEN_SESION_2026-09-03.txt` | URL completa en texto | ✅ Redactado |
| `docs/RESUMEN_SESION_2026-09-04.txt` | URL completa en texto | ✅ Redactado |
| `docs/handoff/06_despliegue_vps.md` | URL en documentación | ✅ Redactado |

## Commits con credenciales en historial

Los siguientes commits contienen versiones de los archivos afectados.
El historial tiene 91 commits. Los commits que tocaron archivos críticos:

- `86d8bd2` - First commit (migrate_erp_v2.py original)
- `4ed0c92` - feat(erp): ventas, compras e inventario
- `265f577` - fix(fase-1a-v3)
- `66608c6` - Fase 1A: 27/27 tests
- `7564eb4` - docs: resumen sesion Fase 1A
- `9f1f5a6` - Fase 1B: 10 tablas
- `220c665` - fix(tests)
- `5e5e4f2` - Fase 1B final
- `087fcf3` - docs: RESUMEN_SESSION
- `000b9e9` - docs: actualizar RESUMEN_SESSION
- `19be084` - docs: RESUMEN_SESSION (5 bloqueos)
- `c8202b9` - docs: sobreescribir RESUMEN_SESSION

**La contraseña debe considerarse comprometida.** Eliminar del historial
NO sustituye la rotación de credenciales.

---

## ⚠️ Acción inmediata requerida

### 1. ROTAR CREDENCIALES (URGENTE — hacer AHORA)

Cambiar la contraseña del usuario `nebulae` en PostgreSQL:
```sql
-- Ejecutar como superusuario en el servidor PostgreSQL
ALTER USER nebulae WITH PASSWORD 'nueva_contraseña_fuerte_aquí';
```

Crear usuarios separados con privilegios mínimos:
```sql
-- Usuario para producción (privilegios mínimos)
CREATE USER nebulae_prod WITH PASSWORD 'prod_password_here';
GRANT CONNECT ON DATABASE erpdb TO nebulae_prod;
GRANT USAGE ON SCHEMA public TO nebulae_prod;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nebulae_prod;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nebulae_prod;

-- Usuario para tests (solo erp_test)
CREATE USER nebulae_test WITH PASSWORD 'test_password_here';
GRANT CONNECT ON DATABASE erp_test TO nebulae_test;
GRANT USAGE ON SCHEMA public TO nebulae_test;
GRANT ALL PRIVILEGES ON DATABASE erp_test TO nebulae_test;
```

### 2. Actualizar variables de entorno

En el servidor y en las máquinas de desarrollo:
```bash
export DATABASE_URL="postgresql://nebulae_prod:nueva_password@host:port/erpdb?sslmode=require"
export TEST_DATABASE_URL="postgresql://nebulae_test:test_password@host:port/erp_test?sslmode=require"
export PROD_VPS_HOST="your.vps.host"
```

---

## Procedimiento de limpieza del historial (requiere autorización)

> ⚠️ NO ejecutar sin autorización explícita. Es una operación destructiva
> que requiere que todos los colaboradores rehagan sus clones locales.

### Prerrequisitos
```bash
pip install git-filter-repo
```

### Pasos (ejecutar en rama temporal primero para validar)

```bash
# 1. Hacer backup del repositorio
git clone --mirror https://github.com/mauquintero26/Nebulae-ERP nebulae-erp-backup.git

# 2. Crear rama de prueba
git checkout -b security/remove-credentials

# 3. Reescribir historial eliminando la contraseña de todos los commits
# Reemplazar CREDENCIAL_REAL por el texto exacto a eliminar
git filter-repo --replace-text <(echo "CREDENCIAL_REAL==>postgresql://[REDACTED]:[REDACTED]@[HOST]:[PORT]/[DB]")

# Alternativamente, usando expresiones regulares con --path-rename o --blob-callback:
git filter-repo --replace-text credenciales_a_remover.txt

# Archivo credenciales_a_remover.txt (NO commitear este archivo):
# postgresql://nebulae:PASS@HOST:PORT/erpdb==>postgresql://[DB_USER]:[DB_PASS]@[DB_HOST]:[DB_PORT]/erpdb

# 4. Verificar que el historial ya no contiene la cadena
git log --all -p | grep -c "Admin123"
# Debe retornar 0

# 5. SOLO CON AUTORIZACIÓN: force push
git push --force origin main

# 6. Notificar a todos los colaboradores para que rehagan sus clones:
# git fetch --all && git reset --hard origin/main
```

### Nota sobre GitHub
Después del force push, GitHub puede tener cached versions. Solicitar al
equipo de GitHub Support que purgue las cachés, o esperar ~24h.

---

## Estado actual

| Acción | Estado |
|---|---|
| Credenciales removidas de HEAD | ✅ Commit pendiente |
| .env.example creado | ✅ Hecho |
| .gitignore actualizado | ✅ Hecho |
| Rotación de credenciales | ❌ **Requiere acción del usuario** |
| Limpieza de historial git | ❌ **Requiere autorización explícita** |
| Force push | ❌ **No ejecutar sin autorización** |

