# Plan de Despliegue VPS (Producción)
**Dominio:** api.nebulaekids.com
**VPS IP:** [REDACTED_HOST]

## Paso 1: Configuración de DNS (Acción del Usuario)
Antes de tocar el servidor, necesitamos que el mundo sepa a dónde apuntar.
1. Entra al proveedor donde compraste `nebulaekids.com` (Ej. GoDaddy, Hostinger, Namecheap).
2. Ve a la zona de gestión de **DNS**.
3. Crea un nuevo **Registro A (A Record)**:
   - **Nombre/Host:** `api`
   - **Apunta a (IP):** `[REDACTED_HOST]`
   - **TTL:** Automático o el más bajo posible.

## Paso 2: Preparación del VPS (Instalación de Dependencias)
Una vez dentro del servidor por SSH (`ssh root@[REDACTED_HOST]`), ejecutaremos:

```bash
# Actualizar el sistema
apt update && apt upgrade -y

# Instalar Nginx y Certbot (Para el candado verde SSL)
apt install nginx certbot python3-certbot-nginx -y

# Instalar Docker y Docker Compose
apt install docker.io docker-compose -y
systemctl enable docker
systemctl start docker
```

## Paso 3: Configuración de Nginx (Reverse Proxy)
Crearemos un archivo para decirle a Nginx que todo el tráfico que llegue a `api.nebulaekids.com` lo envíe al puerto `8000` de nuestro Docker.

```bash
nano /etc/nginx/sites-available/api.nebulaekids.com
```
*Contenido del archivo:*
```nginx
server {
    listen 80;
    server_name api.nebulaekids.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Soporte para WebSockets (Vital para el Omnicanal)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Luego lo activamos:
```bash
ln -s /etc/nginx/sites-available/api.nebulaekids.com /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

## Paso 4: Seguridad SSL (Let's Encrypt)
Este es el paso fundamental para que WhatsApp / Meta acepte nuestros Webhooks.

```bash
certbot --nginx -d api.nebulaekids.com
```
*Certbot modificará automáticamente el archivo de Nginx para añadir los certificados HTTPS.*

## Paso 5: Despliegue del Código Backend
Finalmente, clonaremos el repositorio (o subiremos los archivos) al VPS dentro de una carpeta `/var/www/nebulae-backend` y ejecutaremos:
```bash
docker-compose up -d --build
```
La API estará viva en `https://api.nebulaekids.com/docs`.
