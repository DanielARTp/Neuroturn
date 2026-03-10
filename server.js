/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║   NeuroTurn — Servidor de Producción v2.1                       ║
 * ║   Neurocoop Healthcare                                           ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║   Stack : Node.js · SQL Server · JWT · bcryptjs · SSE           ║
 * ║   BD    : (localdb)\PANACEA-DIDACTI  →  base "Neuroturn"        ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║   INSTALACIÓN (una sola vez):                                    ║
 * ║     npm install                                                  ║
 * ║                                                                  ║
 * ║   INICIAR:                                                       ║
 * ║     node server.js                                               ║
 * ║                                                                  ║
 * ║   VARIABLES .env:                                                ║
 * ║     PORT=3000                                                    ║
 * ║     DB_SERVER=(localdb)\PANACEA-DIDACTI                         ║
 * ║     DB_NAME=Neuroturn                                            ║
 * ║     JWT_SECRET=<cadena aleatoria larga>                         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   1. IMPORTS ESTÁNDAR
═══════════════════════════════════════════════════════════════════ */
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const url    = require('url');
const crypto = require('crypto');

/* ═══════════════════════════════════════════════════════════════════
   2. IMPORTS EXTERNOS  (npm install)
═══════════════════════════════════════════════════════════════════ */
let sql, bcrypt, jwt;
try {
  sql    = require('mssql');
  bcrypt = require('bcryptjs');
  jwt    = require('jsonwebtoken');
} catch (e) {
  console.error('\n❌  Dependencias faltantes. Ejecuta:\n\n    npm install\n');
  console.error('    Necesitas: mssql  bcryptjs  jsonwebtoken\n');
  process.exit(1);
}

/* ═══════════════════════════════════════════════════════════════════
   3. LEER .env  (sin dotenv — solo Node.js puro)
═══════════════════════════════════════════════════════════════════ */
(function cargarEnv() {
  const ruta = path.join(__dirname, '.env');
  if (!fs.existsSync(ruta)) return;
  fs.readFileSync(ruta, 'utf8')
    .split(/\r?\n/)
    .forEach(linea => {
      linea = linea.trim();
      if (!linea || linea.startsWith('#')) return;
      const pos = linea.indexOf('=');
      if (pos < 1) return;
      const k = linea.slice(0, pos).trim();
      const v = linea.slice(pos + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    });
})();

/* ═══════════════════════════════════════════════════════════════════
   4. CONSTANTES DE CONFIGURACIÓN
═══════════════════════════════════════════════════════════════════ */
const PORT       = parseInt(process.env.PORT || '3002', 10);
const HOST       = '0.0.0.0';   // acepta conexiones desde CUALQUIER PC de la red
const DB_SERVER  = process.env.DB_SERVER || String.raw`(localdb)\PANACEA-DIDACTI`;
const DB_NAME    = process.env.DB_NAME   || 'Neuroturn';
const JWT_SECRET = process.env.JWT_SECRET
  || 'nt_dev_' + crypto.randomBytes(24).toString('hex');
const JWT_EXPIRY = '10h';

/* ═══════════════════════════════════════════════════════════════════
   5. SQL SERVER — CONFIGURACIÓN
   ─────────────────────────────────────────────────────────────────
   LocalDB requiere el driver nativo msnodesqlv8.
   Si no está disponible, intentamos con tedious (driver JS puro).
═══════════════════════════════════════════════════════════════════ */
function construirConfigDB(driver) {
  if (driver === 'msnodesqlv8') {
    /* msnodesqlv8 — driver nativo Windows para SQL Server LocalDB */
    return {
      server:   DB_SERVER,
      database: DB_NAME,
      driver:   'msnodesqlv8',
      options: {
        trustedConnection:      true,
        trustServerCertificate: true,
        enableArithAbort:       true,
      },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
      requestTimeout: 20000,
    };
  }
  /* tedious — driver JS puro, funciona también con SQL Express en red */
  return {
    server:   DB_SERVER,
    database: DB_NAME,
    options: {
      trustedConnection:      true,
      trustServerCertificate: true,
      enableArithAbort:       true,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: 20000,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   6. POOL GLOBAL Y FUNCIÓN DE CONEXIÓN
═══════════════════════════════════════════════════════════════════ */
let pool    = null;
let dbReady = false;

async function conectarDB() {
  /* Detectar si msnodesqlv8 está instalado */
  let tieneNativo = false;
  try { require('msnodesqlv8'); tieneNativo = true; } catch (_) {}

  const drivers = tieneNativo ? ['msnodesqlv8', 'tedious'] : ['tedious'];

  for (const driver of drivers) {
    try {
      console.log(`   Probando driver: ${driver}...`);
      const cfg = construirConfigDB(driver);
      pool    = await sql.connect(cfg);
      dbReady = true;
      console.log(`✅ SQL Server conectado [${driver}]  →  ${DB_SERVER} / ${DB_NAME}`);
      await inicializarEsquema();
      return;                       // éxito — salir del loop
    } catch (err) {
      console.warn(`   ✗ ${driver}: ${err.message}`);
      try { if (pool) await pool.close(); } catch (_) {}
      pool = null;
    }
  }

  /* Ningún driver conectó */
  dbReady = false;
  console.warn('\n⚠️  No se pudo conectar a SQL Server.');
  console.warn('   El servidor inicia en MODO MEMORIA (los datos NO persisten).\n');
  console.warn('   Diagnóstico (ejecutar en CMD):');
  console.warn(`     sqllocaldb info ${DB_SERVER.replace(/[()\\]/g, '').split('\\').pop() || 'PANACEA-DIDACTI'}`);
  console.warn(`     sqllocaldb start ${DB_SERVER.replace(/[()\\]/g, '').split('\\').pop() || 'PANACEA-DIDACTI'}\n`);
}

/* ═══════════════════════════════════════════════════════════════════
   7. INICIALIZAR ESQUEMA  (tablas + datos base)
═══════════════════════════════════════════════════════════════════ */
async function inicializarEsquema() {
  const r = pool.request();

  await r.query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='usuarios' AND xtype='U')
    CREATE TABLE usuarios (
      id            INT IDENTITY(1,1) PRIMARY KEY,
      nombre        NVARCHAR(120)  NOT NULL,
      username      NVARCHAR(60)   NOT NULL UNIQUE,
      password_hash NVARCHAR(120)  NOT NULL,
      rol           NVARCHAR(40)   NOT NULL DEFAULT 'Recepcionista',
      modulo        NVARCHAR(60)   NOT NULL DEFAULT 'Sin módulo',
      email         NVARCHAR(120)  NULL,
      activo        BIT            NOT NULL DEFAULT 1,
      color         NVARCHAR(12)   NOT NULL DEFAULT '#3B72F2',
      creado_en     DATETIME2      NOT NULL DEFAULT SYSDATETIME()
    );
  `);

  await r.query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='servicios' AND xtype='U')
    CREATE TABLE servicios (
      id      INT IDENTITY(1,1) PRIMARY KEY,
      nombre  NVARCHAR(80)  NOT NULL,
      prefijo NVARCHAR(5)   NOT NULL UNIQUE,
      color   NVARCHAR(12)  NOT NULL DEFAULT '#3B72F2',
      activo  BIT           NOT NULL DEFAULT 1
    );
  `);

  await r.query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='modulos' AND xtype='U')
    CREATE TABLE modulos (
      id       INT IDENTITY(1,1) PRIMARY KEY,
      nombre   NVARCHAR(80) NOT NULL UNIQUE,
      servicio NVARCHAR(80) NULL,
      activo   BIT          NOT NULL DEFAULT 1
    );
  `);

  await r.query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='turnos' AND xtype='U')
    CREATE TABLE turnos (
      id           INT IDENTITY(1,1) PRIMARY KEY,
      codigo       NVARCHAR(20)  NOT NULL,
      paciente     NVARCHAR(120) NOT NULL,
      documento    NVARCHAR(30)  NULL,
      servicio     NVARCHAR(80)  NULL,
      modulo       NVARCHAR(80)  NOT NULL DEFAULT '-',
      estado       NVARCHAR(30)  NOT NULL DEFAULT 'En fila',
      atendido_por NVARCHAR(120) NULL,
      nota         NVARCHAR(500) NULL,
      llamadas     INT           NOT NULL DEFAULT 0,
      ts_creado    BIGINT        NOT NULL,
      ts_llamado   BIGINT        NULL,
      ts_atendido  BIGINT        NULL,
      ts_fin       BIGINT        NULL
    );
  `);

  await r.query(`
    IF NOT EXISTS (SELECT 1 FROM sysobjects WHERE name='config' AND xtype='U')
    CREATE TABLE config (
      clave NVARCHAR(60)  PRIMARY KEY,
      valor NVARCHAR(500) NOT NULL
    );
  `);

  /* Datos iniciales */
  await r.query(`
    IF NOT EXISTS (SELECT 1 FROM servicios)
    INSERT INTO servicios (nombre, prefijo, color) VALUES
      (N'Neurología',   'N', '#3B72F2'),
      (N'Psiquiatría',  'P', '#8B5CF6'),
      (N'Kinesiología', 'K', '#22C55E'),
      (N'General',      'G', '#F59E0B'),
      (N'Laboratorio',  'L', '#EF4444');
  `);

  await r.query(`
    IF NOT EXISTS (SELECT 1 FROM modulos)
    INSERT INTO modulos (nombre, servicio) VALUES
      (N'Módulo 01', N'Neurología'),
      (N'Módulo 02', N'General'),
      (N'Módulo 03', N'Psiquiatría'),
      (N'Módulo 04', N'Neurología'),
      (N'Módulo 05', N'Kinesiología'),
      (N'Módulo 06', N'Laboratorio'),
      (N'Módulo 07', N'Psiquiatría'),
      (N'Módulo 08', N'General');
  `);

  await r.query(`
    IF NOT EXISTS (SELECT 1 FROM config WHERE clave='contador')
    INSERT INTO config VALUES ('contador', '100');
  `);

  console.log('✅ Esquema verificado/creado correctamente.');
}

/* ═══════════════════════════════════════════════════════════════════
   8. HELPER DE CONSULTAS PARAMETRIZADAS
═══════════════════════════════════════════════════════════════════ */
async function dbQ(queryStr, params) {
  if (!dbReady || !pool) throw new Error('Base de datos no disponible');
  const req = pool.request();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === undefined)    req.input(k, sql.NVarChar,  null);
      else if (typeof v === 'bigint')       req.input(k, sql.BigInt,    v);
      else if (Number.isInteger(v))         req.input(k, sql.Int,       v);
      else if (typeof v === 'boolean')      req.input(k, sql.Bit,       v ? 1 : 0);
      else                                  req.input(k, sql.NVarChar,  String(v));
    }
  }
  return req.query(queryStr);
}

/* ═══════════════════════════════════════════════════════════════════
   9. MODO MEMORIA  (fallback sin BD)
═══════════════════════════════════════════════════════════════════ */
const mem = { usuarios: [], turnos: [], contador: 100 };

/* ═══════════════════════════════════════════════════════════════════
   10. CONTADOR ATÓMICO DE TURNOS
═══════════════════════════════════════════════════════════════════ */
async function siguienteNumero() {
  if (dbReady) {
    const r = await dbQ(`
      UPDATE config
      SET    valor = CAST(CAST(valor AS INT) + 1 AS NVARCHAR(20))
      OUTPUT INSERTED.valor
      WHERE  clave = 'contador'
    `);
    return parseInt(r.recordset[0].valor, 10);
  }
  return ++mem.contador;
}

/* ═══════════════════════════════════════════════════════════════════
   11. SERVER-SENT EVENTS  (tiempo real para todos los navegadores)
═══════════════════════════════════════════════════════════════════ */
const clientesSSE = new Set();

function emitir(tipo, datos) {
  const msg = `data: ${JSON.stringify({ tipo, ...datos })}\n\n`;
  for (const res of clientesSSE) {
    try { res.write(msg); } catch (_) { clientesSSE.delete(res); }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   12. JWT
═══════════════════════════════════════════════════════════════════ */
const firmarToken  = p  => jwt.sign(p, JWT_SECRET, { expiresIn: JWT_EXPIRY });
const verificarJWT = t  => { try { return jwt.verify(t, JWT_SECRET); } catch (_) { return null; } };
const extraerToken = req => {
  const auth = req.headers['authorization'] || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
};
const autenticar   = req => verificarJWT(extraerToken(req));

/* ═══════════════════════════════════════════════════════════════════
   13. UTILIDADES HTTP
═══════════════════════════════════════════════════════════════════ */
function leerBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 2e6) reject(new Error('Payload muy grande')); });
    req.on('end',  () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (_) { resolve({}); } });
    req.on('error', reject);
  });
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ...CORS });
  res.end(JSON.stringify(data));
};

/* MIME types para archivos estáticos */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function servirEstatico(res, pathname) {
  const bases = [path.join(__dirname, 'public'), __dirname];
  let fp = null;
  for (const base of bases) {
    const candidato = path.join(base, pathname === '/' ? 'index.html' : pathname);
    if (fs.existsSync(candidato) && fs.statSync(candidato).isFile()) { fp = candidato; break; }
  }
  if (!fp) {
    for (const base of bases) {
      const idx = path.join(base, 'index.html');
      if (fs.existsSync(idx)) { fp = idx; break; }
    }
  }
  if (!fp) { res.writeHead(404); res.end('404 Not Found'); return; }

  const ext   = path.extname(fp).toLowerCase();
  const mime  = MIME[ext] || 'application/octet-stream';
  const cache = ext === '.html' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=86400';
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(500); res.end('Error'); return; }
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': cache });
    res.end(data);
  });
}

/* ═══════════════════════════════════════════════════════════════════
   14. ROUTER PRINCIPAL
═══════════════════════════════════════════════════════════════════ */
async function manejar(req, res) {
  const { pathname, query } = url.parse(req.url, true);
  const ruta   = (pathname || '/').replace(/\/+$/, '') || '/';
  const metodo = req.method.toUpperCase();

  /* CORS preflight */
  if (metodo === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }

  /* SSE */
  if (ruta === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', ...CORS });
    res.write(': conectado\n\n');
    res.write(`data: ${JSON.stringify({ tipo: 'conectado', ts: Date.now() })}\n\n`);
    clientesSSE.add(res);
    const hb = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (_) { clearInterval(hb); clientesSSE.delete(res); }
    }, 25000);
    req.on('close', () => { clearInterval(hb); clientesSSE.delete(res); });
    return;
  }

  /* API */
  if (ruta.startsWith('/api/')) {
    try { await routerAPI(req, res, ruta, metodo, query); }
    catch (err) {
      console.error(`[API] ${metodo} ${ruta}:`, err.message);
      if (!res.headersSent) json(res, 500, { error: 'Error interno', detalle: err.message });
    }
    return;
  }

  /* Archivos estáticos — prevenir path traversal */
  const safeRuta = '/' + ruta.replace(/\.\./g, '').replace(/^\/+/, '');
  servirEstatico(res, safeRuta);
}

/* ═══════════════════════════════════════════════════════════════════
   15. ROUTER DE API
═══════════════════════════════════════════════════════════════════ */
async function routerAPI(req, res, ruta, metodo, qp) {

  /* ── Rutas PÚBLICAS (sin token) ─────────────────────────────── */
  if (ruta === '/api/auth/login'    && metodo === 'POST') { await login(req, res);    return; }
  if (ruta === '/api/auth/registro' && metodo === 'POST') { await registro(req, res); return; }
  if (ruta === '/api/estado'        && metodo === 'GET')  {
    json(res, 200, { ok: true, version: '2.1.0', db: dbReady ? 'ok' : 'sin_bd', uptime: Math.floor(process.uptime()), sse: clientesSSE.size });
    return;
  }

  /* ── Autenticación requerida ────────────────────────────────── */
  const usuario = autenticar(req);
  if (!usuario) { json(res, 401, { error: 'Token inválido o expirado. Inicia sesión nuevamente.' }); return; }

  /* /api/auth/me */
  if (ruta === '/api/auth/me' && metodo === 'GET') { json(res, 200, { ok: true, usuario }); return; }

  /* Turnos */
  if (ruta === '/api/turnos'           && metodo === 'GET')  { await getTurnos(res);                        return; }
  if (ruta === '/api/turnos'           && metodo === 'POST') { await crearTurno(req, res, usuario);         return; }
  if (ruta === '/api/turnos/siguiente' && metodo === 'POST') { await siguienteTurno(res, usuario);          return; }

  const mTurno = ruta.match(/^\/api\/turnos\/(\d+)$/);
  if (mTurno && metodo === 'PATCH') { await actualizarTurno(req, res, parseInt(mTurno[1], 10), usuario); return; }

  /* Datos de referencia */
  if (ruta === '/api/servicios' && metodo === 'GET') { await getServicios(res); return; }
  if (ruta === '/api/modulos'   && metodo === 'GET') { await getModulos(res);   return; }
  if (ruta === '/api/dashboard' && metodo === 'GET') { await getDashboard(res); return; }
  if (ruta === '/api/historial' && metodo === 'GET') { await getHistorial(res, qp); return; }

  json(res, 404, { error: `Ruta no encontrada: ${metodo} ${ruta}` });
}

/* ═══════════════════════════════════════════════════════════════════
   16. AUTH — REGISTRO
═══════════════════════════════════════════════════════════════════ */
async function registro(req, res) {
  const b = await leerBody(req);
  const { nombre, username, password, rol, email } = b;

  if (!nombre?.trim())     return json(res, 400, { error: 'El nombre es obligatorio.' });
  if (!username?.trim())   return json(res, 400, { error: 'El nombre de usuario es obligatorio.' });
  if (!password)           return json(res, 400, { error: 'La contraseña es obligatoria.' });
  if (password.length < 6) return json(res, 400, { error: 'Mínimo 6 caracteres en la contraseña.' });

  const nom  = nombre.trim().slice(0, 120);
  const user = username.trim().toLowerCase().slice(0, 60);
  const rolV = ['Administrador','Médico','Enfermero','Recepcionista','Administrativo'].includes(rol)
               ? rol : 'Recepcionista';
  const color = '#' + crypto.randomBytes(3).toString('hex');
  const hash  = await bcrypt.hash(password, 12);   // factor 12 = ~250ms, seguro

  if (dbReady) {
    const dup = await dbQ(`SELECT 1 FROM usuarios WHERE username = @u`, { u: user });
    if (dup.recordset.length) return json(res, 409, { error: 'El nombre de usuario ya está en uso.' });

    const ins = await dbQ(`
      INSERT INTO usuarios (nombre, username, password_hash, rol, email, color)
      OUTPUT INSERTED.id, INSERTED.nombre, INSERTED.username, INSERTED.rol,
             INSERTED.modulo, INSERTED.color
      VALUES (@nom, @user, @hash, @rol, @email, @color)
    `, { nom, user, hash, rol: rolV, email: email?.trim() || null, color });

    const u = ins.recordset[0];
    const token = firmarToken({ id: u.id, nombre: u.nombre, username: u.username, rol: u.rol, modulo: u.modulo, color: u.color });
    return json(res, 201, { ok: true, token, usuario: u });
  }

  if (mem.usuarios.find(u => u.username === user))
    return json(res, 409, { error: 'El nombre de usuario ya está en uso.' });

  const id = mem.usuarios.length + 1;
  const u  = { id, nombre: nom, username: user, password_hash: hash, rol: rolV, modulo: 'Sin módulo', email: email || null, activo: true, color };
  mem.usuarios.push(u);
  const token = firmarToken({ id, nombre: nom, username: user, rol: rolV, modulo: 'Sin módulo', color });
  return json(res, 201, { ok: true, token, usuario: { id, nombre: nom, username: user, rol: rolV, modulo: 'Sin módulo', color } });
}

/* ═══════════════════════════════════════════════════════════════════
   17. AUTH — LOGIN
═══════════════════════════════════════════════════════════════════ */
async function login(req, res) {
  const b = await leerBody(req);
  const { username, password } = b;

  if (!username || !password) return json(res, 400, { error: 'Usuario y contraseña son obligatorios.' });

  const user = username.trim().toLowerCase();
  let fila;

  if (dbReady) {
    const r = await dbQ(`
      SELECT id, nombre, username, password_hash, rol, modulo, activo, color
      FROM   usuarios WHERE username = @u
    `, { u: user });
    fila = r.recordset[0];
  } else {
    fila = mem.usuarios.find(u => u.username === user);
  }

  /* Mensaje genérico — no revelar si el usuario existe */
  if (!fila)        return json(res, 401, { error: 'Credenciales incorrectas.' });
  if (!fila.activo) return json(res, 403, { error: 'Cuenta desactivada. Contacta al administrador.' });

  const ok = await bcrypt.compare(password, fila.password_hash);
  if (!ok) return json(res, 401, { error: 'Credenciales incorrectas.' });

  const payload = { id: fila.id, nombre: fila.nombre, username: fila.username, rol: fila.rol, modulo: fila.modulo, color: fila.color };
  return json(res, 200, { ok: true, token: firmarToken(payload), usuario: payload });
}

/* ═══════════════════════════════════════════════════════════════════
   18. TURNOS — GET todos los del día
═══════════════════════════════════════════════════════════════════ */
async function getTurnos(res) {
  if (dbReady) {
    const r = await dbQ(`
      SELECT id, codigo, paciente, documento, servicio, modulo, estado,
             atendido_por, nota, llamadas, ts_creado, ts_llamado, ts_atendido, ts_fin
      FROM   turnos
      WHERE  CAST(DATEADD(SECOND, ts_creado/1000, '19700101') AS DATE) = CAST(GETDATE() AS DATE)
      ORDER  BY ts_creado ASC
    `);
    return json(res, 200, { ok: true, turnos: r.recordset });
  }
  json(res, 200, { ok: true, turnos: mem.turnos });
}

/* ═══════════════════════════════════════════════════════════════════
   19. TURNOS — CREAR
═══════════════════════════════════════════════════════════════════ */
async function crearTurno(req, res, usuario) {
  const b = await leerBody(req);
  const { paciente, documento, servicio } = b;

  if (!paciente?.trim()) return json(res, 400, { error: 'Nombre del paciente es obligatorio.' });
  if (!servicio?.trim()) return json(res, 400, { error: 'Servicio es obligatorio.' });

  let prefijo = 'T';
  if (dbReady) {
    const r = await dbQ(`SELECT prefijo FROM servicios WHERE nombre = @n`, { n: servicio });
    if (r.recordset.length) prefijo = r.recordset[0].prefijo;
  } else {
    const P = { Neurología:'N', Psiquiatría:'P', Kinesiología:'K', General:'G', Laboratorio:'L' };
    prefijo = P[servicio] || 'T';
  }

  const num    = await siguienteNumero();
  const codigo = `${prefijo}-${num}`;
  const ts     = Date.now();

  if (dbReady) {
    const ins = await dbQ(`
      INSERT INTO turnos (codigo, paciente, documento, servicio, ts_creado)
      OUTPUT INSERTED.id, INSERTED.codigo, INSERTED.paciente, INSERTED.documento,
             INSERTED.servicio, INSERTED.modulo, INSERTED.estado, INSERTED.ts_creado
      VALUES (@codigo, @paciente, @doc, @servicio, @ts)
    `, { codigo, paciente: paciente.trim(), doc: documento?.trim() || null, servicio, ts });

    const t = ins.recordset[0];
    emitir('turno_nuevo', { turno: t });
    return json(res, 201, { ok: true, turno: t });
  }

  const t = { id: mem.turnos.length + 1, codigo, paciente: paciente.trim(), documento: documento || null,
              servicio, modulo: '-', estado: 'En fila', atendido_por: null, nota: null,
              llamadas: 0, ts_creado: ts, ts_llamado: null, ts_atendido: null, ts_fin: null };
  mem.turnos.push(t);
  emitir('turno_nuevo', { turno: t });
  return json(res, 201, { ok: true, turno: t });
}

/* ═══════════════════════════════════════════════════════════════════
   20. TURNOS — ACTUALIZAR ESTADO  PATCH /api/turnos/:id
═══════════════════════════════════════════════════════════════════ */
async function actualizarTurno(req, res, id, usuario) {
  const b = await leerBody(req);
  const { estado, nota, modulo } = b;
  const ahora = Date.now();

  const sets = [];
  const p    = { id };

  if (estado) {
    sets.push('estado = @estado'); p.estado = estado;
    if (estado === 'Llamando') {
      sets.push('ts_llamado = @ahora', 'llamadas = llamadas + 1', 'atendido_por = @op');
      p.ahora = ahora; p.op = usuario.nombre;
      if (modulo) { sets.push('modulo = @modulo'); p.modulo = modulo; }
    }
    if (estado === 'Atendiendo') {
      sets.push('ts_atendido = @ahora'); p.ahora = ahora;
      if (!p.op) { sets.push('atendido_por = @op'); p.op = usuario.nombre; }
    }
    if (['Finalizado','Cancelado','No atendido'].includes(estado)) {
      sets.push('ts_fin = @ahora'); p.ahora = ahora;
    }
  }
  if (nota !== undefined) { sets.push('nota = @nota'); p.nota = nota; }

  if (!sets.length) return json(res, 400, { error: 'Sin cambios.' });

  if (dbReady) {
    const r = await dbQ(`
      UPDATE turnos SET ${sets.join(', ')}
      OUTPUT INSERTED.id, INSERTED.codigo, INSERTED.paciente, INSERTED.servicio,
             INSERTED.estado, INSERTED.modulo, INSERTED.atendido_por,
             INSERTED.ts_llamado, INSERTED.ts_atendido, INSERTED.ts_fin, INSERTED.nota
      WHERE id = @id
    `, p);
    if (!r.recordset.length) return json(res, 404, { error: 'Turno no encontrado.' });
    const t = r.recordset[0];
    emitir('turno_actualizado', { turno: t });
    return json(res, 200, { ok: true, turno: t });
  }

  const t = mem.turnos.find(x => x.id === id);
  if (!t) return json(res, 404, { error: 'Turno no encontrado.' });
  if (estado) t.estado = estado;
  if (nota !== undefined) t.nota = nota;
  if (modulo) t.modulo = modulo;
  if (estado === 'Llamando')  { t.ts_llamado  = ahora; t.atendido_por = usuario.nombre; t.llamadas++; }
  if (estado === 'Atendiendo'){ t.ts_atendido = ahora; if (!t.atendido_por) t.atendido_por = usuario.nombre; }
  if (['Finalizado','Cancelado','No atendido'].includes(estado)) t.ts_fin = ahora;
  emitir('turno_actualizado', { turno: t });
  return json(res, 200, { ok: true, turno: t });
}

/* ═══════════════════════════════════════════════════════════════════
   21. TURNOS — LLAMAR SIGUIENTE  POST /api/turnos/siguiente
═══════════════════════════════════════════════════════════════════ */
async function siguienteTurno(res, usuario) {
  const modOp = (usuario.modulo && usuario.modulo !== 'Sin módulo') ? usuario.modulo : 'Módulo 01';
  const ahora = Date.now();

  if (dbReady) {
    const next = await dbQ(`
      SELECT TOP 1 id FROM turnos
      WHERE  estado = 'En fila'
        AND  CAST(DATEADD(SECOND, ts_creado/1000, '19700101') AS DATE) = CAST(GETDATE() AS DATE)
      ORDER  BY ts_creado ASC
    `);
    if (!next.recordset.length) return json(res, 200, { ok: false, mensaje: 'No hay turnos en espera.' });

    const { id } = next.recordset[0];
    const upd = await dbQ(`
      UPDATE turnos
      SET    estado='Llamando', ts_llamado=@ahora, modulo=@mod,
             atendido_por=@op, llamadas=llamadas+1
      OUTPUT INSERTED.id, INSERTED.codigo, INSERTED.paciente, INSERTED.servicio,
             INSERTED.estado, INSERTED.modulo, INSERTED.atendido_por, INSERTED.ts_llamado
      WHERE  id = @id
    `, { ahora, mod: modOp, op: usuario.nombre, id });

    const t = upd.recordset[0];
    emitir('turno_llamado', { turno: t });
    return json(res, 200, { ok: true, turno: t });
  }

  const idx = mem.turnos.findIndex(t => t.estado === 'En fila');
  if (idx < 0) return json(res, 200, { ok: false, mensaje: 'No hay turnos en espera.' });

  const t = mem.turnos[idx];
  t.estado = 'Llamando'; t.ts_llamado = ahora;
  t.modulo = modOp; t.atendido_por = usuario.nombre; t.llamadas++;
  emitir('turno_llamado', { turno: t });
  return json(res, 200, { ok: true, turno: t });
}

/* ═══════════════════════════════════════════════════════════════════
   22. SERVICIOS  /  MÓDULOS  /  DASHBOARD  /  HISTORIAL
═══════════════════════════════════════════════════════════════════ */
async function getServicios(res) {
  if (dbReady) {
    const r = await dbQ(`SELECT id, nombre, prefijo, color FROM servicios WHERE activo=1 ORDER BY nombre`);
    return json(res, 200, { ok: true, servicios: r.recordset });
  }
  json(res, 200, { ok: true, servicios: [
    { nombre:'Neurología',prefijo:'N',color:'#3B72F2' },
    { nombre:'Psiquiatría',prefijo:'P',color:'#8B5CF6' },
    { nombre:'Kinesiología',prefijo:'K',color:'#22C55E' },
    { nombre:'General',prefijo:'G',color:'#F59E0B' },
    { nombre:'Laboratorio',prefijo:'L',color:'#EF4444' },
  ]});
}

async function getModulos(res) {
  if (dbReady) {
    const r = await dbQ(`SELECT id, nombre, servicio FROM modulos WHERE activo=1 ORDER BY nombre`);
    return json(res, 200, { ok: true, modulos: r.recordset });
  }
  json(res, 200, { ok: true, modulos: [] });
}

async function getDashboard(res) {
  if (!dbReady) return json(res, 200, { ok: true, stats: {}, turnos: [] });
  const [s, u] = await Promise.all([
    dbQ(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN estado='En fila'      THEN 1 ELSE 0 END) AS en_fila,
        SUM(CASE WHEN estado IN ('Atendiendo','Llamando') THEN 1 ELSE 0 END) AS atendiendo,
        SUM(CASE WHEN estado='Finalizado'   THEN 1 ELSE 0 END) AS finalizados,
        SUM(CASE WHEN estado='Cancelado'    THEN 1 ELSE 0 END) AS cancelados,
        AVG(CASE WHEN ts_atendido IS NOT NULL
                 THEN CAST(ts_atendido - ts_creado AS FLOAT)/60000.0 ELSE NULL END) AS promedio_espera_min
      FROM turnos
      WHERE CAST(DATEADD(SECOND, ts_creado/1000,'19700101') AS DATE) = CAST(GETDATE() AS DATE)
    `),
    dbQ(`
      SELECT TOP 10 codigo, paciente, servicio, estado, modulo, atendido_por,
                    ts_creado, ts_llamado, ts_atendido, ts_fin
      FROM  turnos
      WHERE CAST(DATEADD(SECOND, ts_creado/1000,'19700101') AS DATE) = CAST(GETDATE() AS DATE)
      ORDER BY ts_creado DESC
    `),
  ]);
  json(res, 200, { ok: true, stats: s.recordset[0], turnos: u.recordset });
}

async function getHistorial(res, qp) {
  if (!dbReady) return json(res, 200, { ok: true, turnos: [] });
  const conds = [`estado IN ('Finalizado','Cancelado','No atendido')`];
  const p     = {};
  if (qp.servicio) { conds.push(`servicio     =  @srv`);    p.srv    = qp.servicio; }
  if (qp.estado)   { conds.push(`estado       =  @est`);    p.est    = qp.estado; }
  if (qp.operador) { conds.push(`atendido_por LIKE @op`);   p.op     = `%${qp.operador}%`; }
  if (qp.buscar)   { conds.push(`(paciente LIKE @q OR codigo LIKE @q OR documento LIKE @q)`); p.q = `%${qp.buscar}%`; }
  if (qp.desde)    { conds.push(`ts_creado >= @desde`);     p.desde  = parseInt(qp.desde, 10); }
  if (qp.hasta)    { conds.push(`ts_creado <= @hasta`);     p.hasta  = parseInt(qp.hasta, 10); }

  const r = await dbQ(`
    SELECT TOP 200 id, codigo, paciente, documento, servicio, modulo, estado,
                   atendido_por, nota, ts_creado, ts_llamado, ts_atendido, ts_fin
    FROM  turnos WHERE ${conds.join(' AND ')}
    ORDER BY ts_creado DESC
  `, p);
  json(res, 200, { ok: true, turnos: r.recordset });
}

/* ═══════════════════════════════════════════════════════════════════
   23. SERVIDOR HTTP Y ARRANQUE
═══════════════════════════════════════════════════════════════════ */
const servidor = http.createServer((req, res) => {
  manejar(req, res).catch(err => {
    console.error('[FATAL]', err);
    if (!res.headersSent) json(res, 500, { error: 'Error interno' });
  });
});

function ipsLocales() {
  const ips = [];
  for (const iface of Object.values(os.networkInterfaces()))
    for (const a of iface)
      if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  return ips;
}

async function arrancar() {
  console.log('\n┌────────────────────────────────────────────────────────────┐');
  console.log('│         NeuroTurn v2.1 — iniciando servidor...             │');
  console.log('└────────────────────────────────────────────────────────────┘');

  await conectarDB();

  servidor.listen(PORT, HOST, () => {
    const ips      = ipsLocales();
    const estadoDB = dbReady
      ? `✅  SQL Server  →  ${DB_SERVER} / ${DB_NAME}`
      : '⚠️   Sin BD (modo memoria — datos no persisten)';

    const L = txt => `║  ${txt.padEnd(60)}║`;

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║          NeuroTurn v2.1 — Servidor de Producción             ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log(L(`BD:    ${estadoDB}`));
    console.log('║                                                               ║');
    console.log(L(`Local: http://localhost:${PORT}`));
    for (const ip of ips)
      console.log(L(`Red:   http://${ip}:${PORT}   ← compartir con clientes`));
    console.log('║                                                               ║');
    console.log(L('API REST:  /api/*'));
    console.log(L('Tiempo real (SSE):  GET /events'));
    console.log(L('Estado:   GET /api/estado'));
    console.log('║                                                               ║');
    console.log(L('Ctrl+C para detener'));
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  });
}

arrancar();

servidor.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌  Puerto ${PORT} en uso. Usa: PORT=3001 node server.js\n`);
  } else console.error('Error del servidor:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\n🛑  Cerrando...');
  try { if (pool) await pool.close(); } catch (_) {}
  process.exit(0);
});

process.on('unhandledRejection', reason => console.error('[UnhandledRejection]', reason));
