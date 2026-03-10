# NeuroTurn v2.1 — Guía de Instalación y Configuración
**Neurocoop Healthcare · Node.js + SQL Server + JWT + SSE**

---

## Archivos del paquete

| Archivo | Descripción |
|---------|-------------|
| `server.js` | Servidor Node.js completo (822 líneas) |
| `index.html` | Frontend SPA (se sirve automáticamente) |
| `package.json` | Dependencias npm |
| `.env.example` | Plantilla de configuración |
| `INICIAR.bat` | Doble clic para iniciar en Windows |
| `configurar-firewall.ps1` | Abre el puerto 3000 en Windows Firewall |
| `README.md` | Esta guía |

---

## Paso 1 — Instalar Node.js

1. Ir a **https://nodejs.org** → descargar versión **LTS** (22.x o 20.x)
2. Instalar con todas las opciones por defecto
3. Verificar en CMD:
   ```cmd
   node --version
   ```
   Debe mostrar `v20.x.x` o superior.

---

## Paso 2 — Preparar SQL Server LocalDB

Abre **CMD como Administrador** y ejecuta:

```cmd
:: Ver si la instancia existe
sqllocaldb info PANACEA-DIDACTI

:: Si no existe, crearla:
sqllocaldb create PANACEA-DIDACTI

:: Iniciarla:
sqllocaldb start PANACEA-DIDACTI

:: Verificar que está corriendo:
sqllocaldb info PANACEA-DIDACTI
:: Debe mostrar: State: Running
```

Luego abre **SQL Server Management Studio 22** y conéctate a:
- Servidor: `(localdb)\PANACEA-DIDACTI`
- Autenticación: Windows Authentication

Ejecuta:
```sql
-- Crear la base de datos (si no existe)
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'Neuroturn')
    CREATE DATABASE Neuroturn;
GO
```

> **Las tablas se crean automáticamente** cuando el servidor arranca.

---

## Paso 3 — Instalar dependencias

Abre CMD en la carpeta del proyecto:

```cmd
cd C:\ruta\a\neuroturn-prod
npm install
```

Esto instala:

| Paquete | Para qué sirve |
|---------|----------------|
| `mssql` | Conexión a SQL Server |
| `msnodesqlv8` | Driver nativo Windows para LocalDB |
| `bcryptjs` | Hashing seguro de contraseñas |
| `jsonwebtoken` | Tokens JWT de sesión |

> Si `msnodesqlv8` falla al instalar, es normal — el servidor usará el driver
> `tedious` automáticamente. Solo necesitas el **ODBC Driver 17 for SQL Server**
> instalado (viene con SSMS 22).

---

## Paso 4 — Configurar variables de entorno

```cmd
copy .env.example .env
```

Abre `.env` con el Bloc de Notas:

```env
PORT=3000
DB_SERVER=(localdb)\PANACEA-DIDACTI
DB_NAME=Neuroturn
JWT_SECRET=pon-aqui-una-cadena-muy-larga-y-aleatoria
```

Para generar un JWT_SECRET seguro:
```cmd
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Paso 5 — Abrir el puerto 3000 en el Firewall

**Opción A — Automático (recomendado):**

1. Click derecho en `configurar-firewall.ps1`
2. → **Ejecutar con PowerShell** (como Administrador)
3. Aceptar el UAC si aparece

**Opción B — Manual en CMD (como Administrador):**

```cmd
netsh advfirewall firewall add rule ^
  name="NeuroTurn-3000" ^
  dir=in ^
  action=allow ^
  protocol=TCP ^
  localport=3000
```

---

## Paso 6 — Iniciar el servidor

**Opción A — Doble clic en `INICIAR.bat`**

**Opción B — CMD:**
```cmd
node server.js
```

Salida esperada:
```
╔═══════════════════════════════════════════════════════════════╗
║          NeuroTurn v2.1 — Servidor de Producción             ║
╠═══════════════════════════════════════════════════════════════╣
║  BD:    ✅  SQL Server  →  (localdb)\PANACEA-DIDACTI / Neuroturn ║
║                                                               ║
║  Local: http://localhost:3000                                 ║
║  Red:   http://192.168.1.105:3000   ← compartir con clientes ║
╚═══════════════════════════════════════════════════════════════╝
```

---

## Paso 7 — Acceder desde otros PCs de la red

### En el PC servidor:
- Anotar la dirección **"Red:"** de la consola
- Ejemplo: `http://192.168.1.105:3000`

### En cada PC cliente:
1. Abrir Chrome o Edge
2. Escribir en la barra de direcciones: `http://192.168.1.105:3000`
3. Aparecerá la pantalla de **login** (campos vacíos)

---

## Primer inicio — Crear el primer usuario

**No hay usuarios predefinidos** — el primer acceso requiere registrarse:

1. En la pantalla de login, clic en **"Registrarse"**
2. Completar:
   - Nombre completo
   - Nombre de usuario (ej: `jperez`)
   - Contraseña (mínimo 6 caracteres)
   - Rol: seleccionar **Administrador** para el primer usuario
3. Clic en **"Crear cuenta"**
4. Entrarás automáticamente al sistema

El usuario se guarda en SQL Server con la contraseña hasheada (bcrypt factor 12).

---

## Verificar que todo funciona

Abre en el navegador:
```
http://localhost:3000/api/estado
```

Respuesta esperada:
```json
{
  "ok": true,
  "version": "2.1.0",
  "db": "ok",
  "uptime": 42,
  "sse": 0
}
```

Si `"db": "sin_bd"` aparece, revisar la conexión a SQL Server (ver Troubleshooting).

---

## Arquitectura del sistema

```
Navegadores (cualquier PC de la red)
         │
         │  HTTP / JSON / SSE
         ▼
┌──────────────────────────────────┐
│     Node.js  server.js           │
│                                  │
│  GET  /              → index.html│
│  POST /api/auth/login            │
│  POST /api/auth/registro         │
│  GET  /api/turnos                │
│  POST /api/turnos                │
│  PATCH /api/turnos/:id           │
│  POST /api/turnos/siguiente      │
│  GET  /events    (SSE push)      │
│  GET  /api/dashboard             │
│  GET  /api/historial             │
└──────────┬───────────────────────┘
           │  mssql / msnodesqlv8
           ▼
┌──────────────────────────────────┐
│  SQL Server LocalDB              │
│  (localdb)\PANACEA-DIDACTI       │
│  Base: Neuroturn                 │
│                                  │
│  tablas: usuarios, turnos,       │
│          servicios, modulos,     │
│          config                  │
└──────────────────────────────────┘
```

---

## Seguridad implementada

| Aspecto | Implementación |
|---------|---------------|
| Contraseñas | bcrypt, factor 12 (~250ms/hash) |
| Sesiones | JWT firmado, expira en 10h |
| Rutas protegidas | Todas las `/api/*` (excepto login/registro) |
| Sin usuarios hardcoded | El primer usuario debe registrarse |
| Mensaje genérico en login | No revela si el username existe |
| Path traversal | Prevenido en servidor estático |
| CORS | Headers configurados |

---

## SSE — Tiempo Real

El sistema usa **Server-Sent Events** en `/events`. No requiere WebSocket ni librerías extra. El navegador mantiene una conexión HTTP abierta y recibe:

| Evento | Cuándo se emite |
|--------|-----------------|
| `turno_nuevo` | Al crear un turno |
| `turno_llamado` | Al llamar siguiente |
| `turno_actualizado` | Al cambiar estado |
| `conectado` | Al conectar al stream |

El Panel de Atención y la Ventana Televisor se actualizan automáticamente en todos los PCs sin necesidad de recargar.

---

## Módulos actuales vs futuros

### ✅ Con backend completo
- Login / Registro (JWT + bcrypt + SQL Server)
- Gestión de Turnos (CRUD)
- Panel de Atención (SSE tiempo real)
- Historial (filtros + búsqueda)
- Ventana Televisor (SSE tiempo real)
- Dashboard (KPIs del día)

### 🔜 Próximamente (tablas ya creadas en BD)
- Gestión de Usuarios — tabla `usuarios` lista
- Servicios Médicos — tabla `servicios` lista
- Gestión de Módulos — tabla `modulos` lista
- Reportes — endpoints de dashboard base ya funciona

---

## Troubleshooting

### ❌ "No se pudo conectar a SQL Server"

```cmd
:: 1. Ver estado de la instancia
sqllocaldb info PANACEA-DIDACTI

:: 2. Si dice "Stopped", iniciar:
sqllocaldb start PANACEA-DIDACTI

:: 3. Probar conexión manual en SSMS:
::    Servidor: (localdb)\PANACEA-DIDACTI
::    Auth: Windows Authentication
::    → Si conecta en SSMS pero no en Node.js, revisar el .env

:: 4. Verificar que la BD existe:
::    En SSMS: SELECT name FROM sys.databases WHERE name='Neuroturn'
::    Si no existe: CREATE DATABASE Neuroturn
```

Si la instancia se llama diferente:
```cmd
sqllocaldb info
:: Lista todas las instancias disponibles
```
Luego actualizar `DB_SERVER` en `.env`.

### ❌ "Puerto 3000 en uso"
```cmd
:: Ver qué proceso usa el puerto:
netstat -ano | findstr :3000

:: Usar otro puerto:
set PORT=3001 && node server.js
```

### ❌ "Cannot find module 'mssql'"
```cmd
npm install
```

### ❌ La pantalla de TV no se actualiza sola
- Verificar que el servidor esté corriendo
- Verificar que `/api/estado` devuelva `"db": "ok"`
- El SSE requiere que el navegador soporte EventSource (Chrome/Edge modernos ✓)

### ❌ "Credenciales incorrectas" en primer login
- El primer usuario debe crearse por **Registro**, no por login
- Los datos se guardan en SQL Server — no en localStorage
- Si usas modo memoria (sin BD), los usuarios se pierden al reiniciar

---

*NeuroTurn v2.1 — Neurocoop Healthcare*
