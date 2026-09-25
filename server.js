require("dotenv").config();
const express   = require("express");
const cors      = require("cors");
const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt    = require("bcryptjs");
const jwt       = require("jsonwebtoken");
const { Pool }  = require("pg");

const app  = express();
const PORT = process.env.PORT || 3000;

/* ════════════════════════════════════════════
   VALIDACIÓN DE VARIABLES DE ENTORNO
   El servidor no arranca si falta algo crítico.
════════════════════════════════════════════ */
const REQUIRED_ENV = ["DB_HOST","DB_PORT","DB_NAME","DB_USER","DB_PASSWORD","JWT_SECRET"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Variable de entorno faltante: ${key}`);
    process.exit(1);
  }
}
if (process.env.JWT_SECRET.length < 32) {
  console.error("❌ JWT_SECRET debe tener al menos 32 caracteres.");
  process.exit(1);
}

/* ════════════════════════════════════════════
   CONEXIÓN A POSTGRESQL
════════════════════════════════════════════ */
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max:      10,               // máximo de conexiones simultáneas en el pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Error al conectar con PostgreSQL:", err.message);
    process.exit(1);
  }
  release();
  console.log("✅ Conectado a PostgreSQL:", process.env.DB_NAME);
});

/* ════════════════════════════════════════════
   SEGURIDAD — HEADERS, CORS, RATE LIMIT
════════════════════════════════════════════ */

// Headers de seguridad HTTP (X-Frame-Options, CSP, etc.)
app.use(helmet());

// CORS: solo acepta requests del origen configurado o localhost
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5500")
  .split(",")
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Permite requests sin origin (Tailscale directo, curl, apps móviles nativas).
    // No se acepta el Origin literal "null": lo envían tanto file:// (que en este
    // proyecto no llama a la API, solo corre en modo demo) como cualquier iframe
    // sandboxeado, y aceptarlo ampliaba la superficie de ataque sin habilitar
    // ningún flujo real.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error("Origen no permitido por CORS"));
  },
  methods:     ["GET","POST","PATCH","OPTIONS"],
  credentials: true,
}));

// Rate limit general: 200 requests por IP cada 15 minutos
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { ok: false, mensaje: "Demasiadas solicitudes. Esperá unos minutos." },
}));

// Rate limit estricto solo para login: 10 intentos cada 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { ok: false, mensaje: "Demasiados intentos de login. Esperá 15 minutos." },
});

// Las evidencias fotográficas viajan en base64 → límite generoso
app.use(express.json({ limit: "25mb" }));

/* ════════════════════════════════════════════
   MIDDLEWARES DE AUTENTICACIÓN Y AUTORIZACIÓN
════════════════════════════════════════════ */

// Verifica que el request tenga un JWT válido
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, mensaje: "Autenticación requerida." });
  }
  try {
    req.user = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch (err) {
    const msg = err.name === "TokenExpiredError"
      ? "Sesión expirada. Volvé a iniciar sesión."
      : "Token inválido.";
    res.status(401).json({ ok: false, mensaje: msg });
  }
}

// Verifica que el usuario tenga uno de los roles permitidos
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ ok: false, mensaje: "No tenés permisos para esta acción." });
    }
    next();
  };
}

// Helpers de validación rápida
const isPositiveInt = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const isString      = (v, min = 1, max = 20000) =>
  typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
const isValidLat    = (v) => v == null || (typeof v === "number" && Number.isFinite(v) && v >= -90  && v <= 90);
const isValidLng    = (v) => v == null || (typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180);
const isValidDate   = (v) => v == null || !Number.isNaN(new Date(v).getTime());

// La geocerca que vale se calcula en el servidor; nunca se confía en el booleano del cliente.
function distanciaMetros(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const isValidPrecision = (v) =>
  v == null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000);

/* ════════════════════════════════════════════
   POST /api/login
   Pública — rate limit estricto
   Body: { username, password }
════════════════════════════════════════════ */
app.post("/api/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!isString(username) || !isString(password)) {
    return res.status(400).json({ ok: false, mensaje: "Usuario y contraseña requeridos." });
  }

  try {
    const result = await pool.query(
      "SELECT id, nombre, rol, password_hash FROM usuarios WHERE username = $1 AND activo = TRUE",
      [username.trim()]
    );

    const user = result.rows[0];

    // Siempre hace la comparación (evita timing attack de enumeración de usuarios)
    const hashToCompare = user?.password_hash || "$2b$10$invalidhashpadding000000000000000000000000000000000000";
    const valid = await bcrypt.compare(password, hashToCompare);

    if (!user || !valid) {
      // Mensaje genérico: no revelar si el usuario existe o no
      return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos." });
    }

    // PRD §10 — expiración de 8 horas (una jornada de supervisión)
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      ok: true,
      token,
      usuario: { id: user.id, nombre: user.nombre, rol: user.rol },
    });

  } catch (err) {
    console.error("[login] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error interno del servidor." });
  }
});

/* ════════════════════════════════════════════
   GET /api/inicializar
   Requiere: cualquier rol autenticado
   Devuelve todo lo que la app necesita para operar:
   objetivos (con visitas del mes), vigiladores, checklist
   configurable y catálogo de observaciones.
════════════════════════════════════════════ */
app.get("/api/inicializar", requireAuth, async (req, res) => {
  try {
    const [objetivos, vigiladores, secciones, items, ajustes, observaciones] = await Promise.all([
      // Objetivos + contador de visitas del mes en curso (PRD §7)
      pool.query(`
        SELECT o.id, o.nombre, o.tipo, o.subtipo, o.modalidad, o.direccion,
               o.lat, o.lng, o.radio_geocerca_m, o.visitas_meta_mes, o.activo,
               COUNT(r.id)::int AS visitas_mes
        FROM objetivos o
        LEFT JOIN rondas_actas r
          ON r.objetivo_id = o.id
         AND date_trunc('month', r.fecha_hora) = date_trunc('month', NOW())
        WHERE o.activo = TRUE
        GROUP BY o.id
        ORDER BY o.nombre
      `),

      // Vigiladores con perfil completo (PRD §9)
      pool.query(`
        SELECT v.id, v.legajo, v.nombre, v.dni, v.puesto,
               v.credencial_numero, v.credencial_venc,
               v.es_chofer, v.licencia_cat, v.licencia_venc, v.armado, v.estado,
               v.telefono, v.domicilio, v.fecha_nacimiento, v.nacionalidad,
               v.convenio, v.tiene_radio, v.foto_url,
               o.nombre AS objetivo_asignado
        FROM vigiladores v
        LEFT JOIN objetivos o ON v.objetivo_asignado_id = o.id
        ORDER BY v.nombre
      `),

      pool.query("SELECT id, clave, nombre, color, orden FROM checklist_secciones ORDER BY orden"),

      pool.query(`
        SELECT i.id, i.seccion_id, s.clave AS seccion_clave,
               i.titulo_corto, i.criterio_completo, i.area_responsable,
               i.tipos_objetivo, i.orden
        FROM checklist_items i
        JOIN checklist_secciones s ON i.seccion_id = s.id
        WHERE i.activo = TRUE
        ORDER BY s.orden, i.orden
      `),

      // Diferencias del checklist respecto de la plantilla del tipo de objetivo
      pool.query("SELECT objetivo_id, item_id, incluido, nota FROM objetivo_checklist"),

      pool.query("SELECT id, area, texto FROM observaciones_catalogo ORDER BY area, texto"),
    ]);

    res.json({
      ok:            true,
      objetivos:     objetivos.rows,
      vigiladores:   vigiladores.rows,
      secciones:     secciones.rows,
      checklist:     items.rows,
      ajustes:       ajustes.rows,
      observaciones: observaciones.rows,
    });

  } catch (err) {
    console.error("[inicializar] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al cargar los datos iniciales." });
  }
});

/* ════════════════════════════════════════════
   POST /api/rondas
   Requiere: rol supervisor
   Guarda el acta completa en una transacción atómica.
   Body: {
     objetivo_id, tipo, lat, lng, precision_gps_m,
     justificacion_fuera, sincronizado_offline, hora_inicio, hora_fin,
     vigiladores:  [{ id, firma_base64, nego_firmar }],
     checklist:    [{ item_id, pregunta, valoracion, observacion_pred, observacion_libre }],
     incidencias:  [{ item_id, item_titulo, valoracion, vigilador_id,
                      area_responsable, categoria, descripcion }],
     evidencias:   [{ imagen_base64, lat, lng }]
   }
════════════════════════════════════════════ */
app.post("/api/rondas", requireAuth, requireRole("supervisor"), async (req, res) => {
  const {
    objetivo_id,
    tipo                 = "presencial",
    lat,
    lng,
    precision_gps_m,
    justificacion_fuera,
    sincronizado_offline = false,
    hora_inicio,
    hora_fin,
    checklist            = [],
    incidencias          = [],
    evidencias           = [],
    ausencias            = [],
  } = req.body;

  // Acepta `vigiladores` (formato nuevo, con firma por persona) o `vigilador_ids` (legacy)
  const vigiladoresRaw = Array.isArray(req.body.vigiladores) && req.body.vigiladores.length > 0
    ? req.body.vigiladores
    : (req.body.vigilador_ids || []);

  // Normaliza a { id, firma_base64, nego_firmar, motivo_negativa, aviso_registrado } acepte números u objetos
  const vigiladores = vigiladoresRaw
    .map(v => (typeof v === "object" && v !== null)
      ? {
          id: v.id,
          firma_base64: v.firma_base64 || null,
          nego_firmar: Boolean(v.nego_firmar),
          motivo_negativa: isString(v.motivo_negativa, 1, 2000) ? v.motivo_negativa.trim() : null,
          aviso_registrado: Boolean(v.aviso_registrado),
        }
      : { id: v, firma_base64: null, nego_firmar: false, motivo_negativa: null, aviso_registrado: false })
    .filter(v => isPositiveInt(v.id));

  // Ausencias — vigiladores esperados del objetivo que no se marcaron presentes (Step2)
  const ausenciasValidas = (Array.isArray(ausencias) ? ausencias : [])
    .filter(a => isPositiveInt(a?.vigilador_id) && ["franco","licencia","relevo","ausente_sin_aviso"].includes(a?.motivo));

  // Validación de inputs
  if (!isPositiveInt(objetivo_id)) {
    return res.status(400).json({ ok: false, mensaje: "objetivo_id inválido." });
  }
  if (vigiladores.length === 0) {
    return res.status(400).json({ ok: false, mensaje: "Se requiere al menos un vigilador válido." });
  }
  if (!["presencial","remota"].includes(tipo)) {
    return res.status(400).json({ ok: false, mensaje: "tipo debe ser 'presencial' o 'remota'." });
  }
  if (tipo === "remota" && !isString(justificacion_fuera, 10, 2000)) {
    return res.status(400).json({ ok: false, mensaje: "Justificación obligatoria para ronda remota (mínimo 10 caracteres)." });
  }
  if (!isValidLat(lat)) {
    return res.status(400).json({ ok: false, mensaje: "lat inválida (debe estar entre -90 y 90)." });
  }
  if (!isValidLng(lng)) {
    return res.status(400).json({ ok: false, mensaje: "lng inválida (debe estar entre -180 y 180)." });
  }
  if (!isValidPrecision(precision_gps_m)) {
    return res.status(400).json({ ok: false, mensaje: "precision_gps_m inválida (debe estar entre 0 y 1000 metros)." });
  }
  if (!isValidDate(hora_inicio)) {
    return res.status(400).json({ ok: false, mensaje: "hora_inicio inválida." });
  }
  if (!isValidDate(hora_fin)) {
    return res.status(400).json({ ok: false, mensaje: "hora_fin inválida." });
  }
  // PRD §5.2 — no se guarda un acta sin al menos una firma o una negativa registrada
  if (!vigiladores.some(v => v.firma_base64 || v.nego_firmar)) {
    return res.status(400).json({ ok: false, mensaje: "Se requiere al menos una firma o una negativa registrada." });
  }
  for (const v of vigiladores) {
    if (v.firma_base64 && !String(v.firma_base64).startsWith("data:image/")) {
      return res.status(400).json({ ok: false, mensaje: `Firma inválida para el vigilador ${v.id}.` });
    }
  }

  const supervisor_id = req.user.id; // viene del JWT, no del body — no se puede falsificar
  const objRes = await pool.query(
    "SELECT lat, lng, radio_geocerca_m FROM objetivos WHERE id = $1 AND activo = TRUE",
    [objetivo_id]
  );
  if (objRes.rowCount === 0) {
    return res.status(400).json({ ok: false, mensaje: "El objetivo no existe o está inactivo." });
  }

  const objetivo = objRes.rows[0];
  let distanciaM = null;
  let enGeocerca = false;
  if (lat != null && lng != null && objetivo.lat != null && objetivo.lng != null) {
    distanciaM = distanciaMetros(lat, lng, objetivo.lat, objetivo.lng);
    const margen = precision_gps_m != null ? precision_gps_m : 0;
    enGeocerca = (distanciaM - margen) <= (objetivo.radio_geocerca_m || 0);
  }

  if (tipo === "presencial") {
    if (distanciaM == null) {
      return res.status(400).json({
        ok: false,
        mensaje: "Una ronda presencial requiere coordenadas GPS verificables. Registrala como supervisión remota si no hay señal.",
      });
    }
    if (!enGeocerca) {
      return res.status(400).json({
        ok: false,
        mensaje: `Fuera del geocerco: ${Math.round(distanciaM)} m del objetivo (radio permitido ${objetivo.radio_geocerca_m} m).`,
        distancia_m: Math.round(distanciaM),
        radio_m: objetivo.radio_geocerca_m,
      });
    }
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Código de acta: se genera DESPUÉS de insertar usando el ID (sin race condition)
    const actaResult = await client.query(
      `INSERT INTO rondas_actas
         (supervisor_id, objetivo_id, tipo, en_geocerca, lat, lng,
          distancia_geocerca_m, precision_gps_m,
          justificacion_fuera, sincronizado_offline, hora_inicio, hora_fin)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        supervisor_id, objetivo_id, tipo,
        enGeocerca,
        lat ?? null,
        lng ?? null,
        distanciaM != null ? Math.round(distanciaM) : null,
        precision_gps_m ?? null,
        justificacion_fuera || null,
        Boolean(sincronizado_offline),
        hora_inicio || null,
        hora_fin    || null,
      ]
    );
    const rondaId = actaResult.rows[0].id;

    // Código basado en el ID — garantiza unicidad sin race condition
    const now       = new Date();
    const codigoActa = `ACTA-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${String(rondaId).padStart(6,"0")}`;
    await client.query("UPDATE rondas_actas SET codigo_acta = $1 WHERE id = $2", [codigoActa, rondaId]);

    // 2. Una fila por vigilador inspeccionado, con su firma individual (PRD §5.2)
    for (const v of vigiladores) {
      await client.query(
        `INSERT INTO ronda_vigiladores
           (ronda_id, vigilador_id, firma_base64, nego_firmar, motivo_negativa, aviso_registrado)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [rondaId, v.id, v.firma_base64, v.nego_firmar, v.motivo_negativa, v.aviso_registrado]
      );
    }

    // 2b. Ausencias — vigiladores esperados del objetivo que no se presentaron
    for (const a of ausenciasValidas) {
      await client.query(
        `INSERT INTO ronda_ausencias (ronda_id, vigilador_id, motivo, nota)
         VALUES ($1,$2,$3,$4)`,
        [rondaId, parseInt(a.vigilador_id), a.motivo, isString(a.nota, 1, 500) ? a.nota.trim() : null]
      );
    }

    // 3. Insertar respuestas del checklist
    for (const item of checklist) {
      if (!item.item_id && !item.pregunta) continue;
      await client.query(
        `INSERT INTO checklist_respuestas
           (ronda_id, item_id, pregunta_texto, valoracion, observacion_pred, observacion_libre)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          rondaId,
          isPositiveInt(item.item_id) ? parseInt(item.item_id) : null,
          isString(item.pregunta, 1, 300) ? item.pregunta.trim() : null,
          ["B","R","M"].includes(item.valoracion) ? item.valoracion : "B",
          isString(item.observacion_pred, 1, 2000)  ? item.observacion_pred.trim()  : null,
          isString(item.observacion_libre, 1, 2000) ? item.observacion_libre.trim() : null,
        ]
      );
    }

    // 4. Evidencia fotográfica con marca de agua GPS (PRD §8 paso 5)
    for (const foto of evidencias) {
      if (!isString(foto.imagen_base64) || !foto.imagen_base64.startsWith("data:image/")) continue;
      if (!isValidLat(foto.lat) || !isValidLng(foto.lng)) continue;
      await client.query(
        `INSERT INTO evidencias_fotos (ronda_id, imagen_base64, lat, lng)
         VALUES ($1,$2,$3,$4)`,
        [rondaId, foto.imagen_base64, foto.lat ?? null, foto.lng ?? null]
      );
    }

    // 5. Tickets — código generado desde el ID (sin race condition)
    const ticketsCreados = [];
    for (const inc of incidencias) {
      if (!isString(inc.descripcion, 1, 2000)) continue;

      // Severidad y SLA derivados de la valoración (M=malo → crítica/24h, R=regular → media/72h)
      const valoracion = ["R","M"].includes(inc.valoracion) ? inc.valoracion : null;
      const severidad  = valoracion === "M" ? "critica" : "media";
      const slaHoras   = valoracion === "M" ? 24 : 72;

      const ticketResult = await client.query(
        `INSERT INTO tickets_incidencias
           (ronda_id, area_responsable, categoria, descripcion,
            checklist_item_id, item_titulo, valoracion, vigilador_id,
            severidad, sla_horas, sla_venc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW() + ($10 || ' hours')::INTERVAL)
         RETURNING id`,
        [
          rondaId,
          isString(inc.area_responsable, 1, 100) ? inc.area_responsable.trim() : "Operaciones",
          isString(inc.categoria, 1, 100)         ? inc.categoria.trim()        : "General",
          inc.descripcion.trim(),
          isPositiveInt(inc.item_id)      ? parseInt(inc.item_id)      : null,
          isString(inc.item_titulo, 1, 200) ? inc.item_titulo.trim() : null,
          valoracion,
          isPositiveInt(inc.vigilador_id) ? parseInt(inc.vigilador_id) : null,
          severidad,
          slaHoras,
        ]
      );
      const ticketId     = ticketResult.rows[0].id;
      const mes          = String(now.getMonth()+1).padStart(2,"0");
      const codigoTicket = `INC-${now.getFullYear()}${mes}-${String(ticketId).padStart(4,"0")}`;

      await client.query(
        "UPDATE tickets_incidencias SET codigo_ticket = $1 WHERE id = $2",
        [codigoTicket, ticketId]
      );
      ticketsCreados.push({ id: ticketId, codigo_ticket: codigoTicket, item_titulo: inc.item_titulo || null });
    }

    await client.query("COMMIT");

    res.status(201).json({
      ok:          true,
      mensaje:     "Acta guardada correctamente.",
      ronda_id:    rondaId,
      codigo_acta: codigoActa,
      tickets:     ticketsCreados,
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[rondas] ROLLBACK ejecutado:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al guardar el acta. Operación revertida." });
  } finally {
    client.release();
  }
});

/* ════════════════════════════════════════════
   GET /api/tickets
   Requiere: admin o dueno
   Query opcional: ?estado=ABIERTO|RESUELTO&objetivo_id=X&area=RRHH&limite=50&pagina=1
════════════════════════════════════════════ */
app.get("/api/tickets", requireAuth, requireRole("admin","dueno"), async (req, res) => {
  const { estado, objetivo_id, area, severidad, asignado_a, orden } = req.query;
  const limite = Math.min(parseInt(req.query.limite) || 50, 200);
  const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
  const offset = (pagina - 1) * limite;

  try {
    const params  = [];
    const wheres  = [];

    if (estado && ["ABIERTO","RESUELTO","RECHAZADO","DUPLICADO"].includes(estado.toUpperCase())) {
      params.push(estado.toUpperCase());
      wheres.push(`t.estado = $${params.length}`);
    }
    if (isPositiveInt(objetivo_id)) {
      params.push(parseInt(objetivo_id));
      wheres.push(`r.objetivo_id = $${params.length}`);
    }
    if (isString(area)) {
      params.push(area.trim());
      wheres.push(`t.area_responsable = $${params.length}`);
    }
    if (severidad && ["critica","alta","media","baja"].includes(severidad)) {
      params.push(severidad);
      wheres.push(`t.severidad = $${params.length}`);
    }
    if (asignado_a === "sin_asignar") {
      wheres.push(`t.asignado_a IS NULL`);
    } else if (isPositiveInt(asignado_a)) {
      params.push(parseInt(asignado_a));
      wheres.push(`t.asignado_a = $${params.length}`);
    }

    const whereClause = wheres.length ? "WHERE " + wheres.join(" AND ") : "";
    const ordenSQL = orden === "urgencia"
      ? `ORDER BY (t.estado = 'ABIERTO' AND t.sla_venc < NOW()) DESC, t.sla_venc ASC NULLS LAST`
      : `ORDER BY t.fecha_creacion DESC`;

    params.push(limite, offset);
    const query = `
      SELECT
        t.id, t.codigo_ticket, t.area_responsable, t.categoria, t.descripcion,
        t.estado, t.resolucion, t.fecha_creacion, t.fecha_resolucion,
        t.item_titulo, t.valoracion, t.severidad, t.sla_venc,
        (t.estado = 'ABIERTO' AND t.sla_venc < NOW())                          AS sla_vencido,
        (t.estado = 'ABIERTO' AND t.sla_venc >= NOW() AND t.sla_venc < NOW() + INTERVAL '24 hours') AS sla_vence_hoy,
        t.asignado_a, ua.nombre AS asignado_nombre,
        u.nombre  AS supervisor,
        o.nombre  AS objetivo,
        v.nombre  AS vigilador,
        r.tipo    AS tipo_ronda,
        r.codigo_acta,
        r.en_geocerca,
        (SELECT COUNT(*) FROM tickets_incidencias t2
          WHERE t2.checklist_item_id = t.checklist_item_id
            AND t2.id <> t.id
            AND EXISTS (
              SELECT 1 FROM rondas_actas r2
              WHERE r2.id = t2.ronda_id AND r2.objetivo_id = r.objetivo_id
            )
            AND t2.fecha_creacion >= NOW() - INTERVAL '90 days'
        )::int AS reincidencias_90d
      FROM tickets_incidencias t
      JOIN rondas_actas r ON t.ronda_id      = r.id
      JOIN usuarios     u ON r.supervisor_id = u.id
      JOIN objetivos    o ON r.objetivo_id   = o.id
      LEFT JOIN vigiladores v ON t.vigilador_id = v.id
      LEFT JOIN usuarios ua   ON t.asignado_a   = ua.id
      ${whereClause}
      ${ordenSQL}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const [tickets, total] = await Promise.all([
      pool.query(query, params),
      pool.query(
        `SELECT COUNT(*) FROM tickets_incidencias t
         JOIN rondas_actas r ON t.ronda_id = r.id
         ${whereClause}`,
        params.slice(0, -2)
      ),
    ]);

    res.json({
      ok:      true,
      tickets: tickets.rows,
      paginacion: {
        total:   parseInt(total.rows[0].count),
        pagina,
        limite,
        paginas: Math.ceil(parseInt(total.rows[0].count) / limite),
      },
    });

  } catch (err) {
    console.error("[tickets] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al obtener los tickets." });
  }
});

/* ════════════════════════════════════════════
   PATCH /api/tickets/:id/resolver
   Requiere: admin
   Body: { resolucion }
════════════════════════════════════════════ */
app.patch("/api/tickets/:id/resolver", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { resolucion, tipo_solucion, verificar_proxima_ronda } = req.body;

  if (!isPositiveInt(id)) {
    return res.status(400).json({ ok: false, mensaje: "ID de ticket inválido." });
  }
  if (!isString(resolucion, 30)) {
    return res.status(400).json({ ok: false, mensaje: "Contá qué se hizo (mínimo 30 caracteres) — esto lo lee el cliente y el supervisor." });
  }

  try {
    const result = await pool.query(
      `UPDATE tickets_incidencias
       SET estado = 'RESUELTO',
           resolucion = $1,
           tipo_solucion = $2,
           verificar_proxima_ronda = $3,
           fecha_resolucion = NOW(),
           resuelto_por = $4
       WHERE id = $5 AND estado = 'ABIERTO'
       RETURNING id, codigo_ticket, estado`,
      [
        resolucion.trim(),
        isString(tipo_solucion, 1, 100) ? tipo_solucion.trim() : null,
        Boolean(verificar_proxima_ronda),
        req.user.id,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Ticket no encontrado o ya estaba resuelto." });
    }

    res.json({ ok: true, mensaje: "Incidencia resuelta correctamente.", ticket: result.rows[0] });

  } catch (err) {
    console.error("[tickets/resolver] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al cerrar el ticket." });
  }
});

/* ════════════════════════════════════════════
   PATCH /api/tickets/:id/asignar
   Requiere: admin
   Body: { a_usuario_id }
════════════════════════════════════════════ */
app.patch("/api/tickets/:id/asignar", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { a_usuario_id } = req.body;

  if (!isPositiveInt(id))            return res.status(400).json({ ok: false, mensaje: "ID de ticket inválido." });
  if (!isPositiveInt(a_usuario_id))  return res.status(400).json({ ok: false, mensaje: "Elegí a quién asignar la incidencia." });

  try {
    const result = await pool.query(
      `UPDATE tickets_incidencias SET asignado_a = $1
       WHERE id = $2 AND estado = 'ABIERTO'
       RETURNING id, codigo_ticket, asignado_a`,
      [parseInt(a_usuario_id), id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Ticket no encontrado o ya cerrado." });
    }
    res.json({ ok: true, mensaje: "Incidencia asignada.", ticket: result.rows[0] });
  } catch (err) {
    console.error("[tickets/asignar] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al asignar la incidencia." });
  }
});

/* ════════════════════════════════════════════
   PATCH /api/tickets/:id/reasignar
   Requiere: admin
   Body: { a_usuario_id, nota }
   El SLA no se reinicia al reasignar — solo cambia el responsable.
════════════════════════════════════════════ */
app.patch("/api/tickets/:id/reasignar", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { a_usuario_id, nota } = req.body;

  if (!isPositiveInt(id))           return res.status(400).json({ ok: false, mensaje: "ID de ticket inválido." });
  if (!isPositiveInt(a_usuario_id)) return res.status(400).json({ ok: false, mensaje: "Elegí a quién reasignar la incidencia." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const actual = await client.query(
      "SELECT asignado_a FROM tickets_incidencias WHERE id = $1 AND estado = 'ABIERTO' FOR UPDATE",
      [id]
    );
    if (actual.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, mensaje: "Ticket no encontrado o ya cerrado." });
    }

    await client.query(
      "UPDATE tickets_incidencias SET asignado_a = $1 WHERE id = $2",
      [parseInt(a_usuario_id), id]
    );
    await client.query(
      `INSERT INTO tickets_reasignaciones (ticket_id, de_usuario_id, a_usuario_id, nota)
       VALUES ($1,$2,$3,$4)`,
      [id, actual.rows[0].asignado_a, parseInt(a_usuario_id), isString(nota, 1, 1000) ? nota.trim() : null]
    );

    await client.query("COMMIT");
    res.json({ ok: true, mensaje: "Incidencia reasignada. El SLA sigue corriendo desde la creación original." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[tickets/reasignar] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al reasignar la incidencia." });
  } finally {
    client.release();
  }
});

/* ════════════════════════════════════════════
   PATCH /api/tickets/:id/rechazar
   Requiere: admin
   Body: { motivo, duplicado_de? }
   Rechazar/marcar duplicada exige motivo obligatorio; notifica al supervisor (fuera de alcance del prototipo).
════════════════════════════════════════════ */
app.patch("/api/tickets/:id/rechazar", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { motivo, duplicado_de } = req.body;

  if (!isPositiveInt(id))         return res.status(400).json({ ok: false, mensaje: "ID de ticket inválido." });
  if (!isString(motivo, 10, 2000)) return res.status(400).json({ ok: false, mensaje: "El motivo es obligatorio (mínimo 10 caracteres)." });

  const esDuplicado = isPositiveInt(duplicado_de);
  try {
    const result = await pool.query(
      `UPDATE tickets_incidencias
       SET estado = $1, motivo_rechazo = $2, duplicado_de = $3,
           fecha_resolucion = NOW(), resuelto_por = $4
       WHERE id = $5 AND estado = 'ABIERTO'
       RETURNING id, codigo_ticket, estado`,
      [esDuplicado ? "DUPLICADO" : "RECHAZADO", motivo.trim(), esDuplicado ? parseInt(duplicado_de) : null, req.user.id, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: "Ticket no encontrado o ya cerrado." });
    }
    res.json({ ok: true, mensaje: "Incidencia rechazada.", ticket: result.rows[0] });
  } catch (err) {
    console.error("[tickets/rechazar] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al rechazar la incidencia." });
  }
});

/* ════════════════════════════════════════════
   GET /api/usuarios
   Requiere: admin
   Query opcional: ?rol=admin — lista para asignar incidencias.
════════════════════════════════════════════ */
app.get("/api/usuarios", requireAuth, requireRole("admin"), async (req, res) => {
  const { rol } = req.query;
  try {
    const params = [];
    let where = "WHERE activo = TRUE";
    if (rol && ["supervisor","admin","dueno"].includes(rol)) {
      params.push(rol);
      where += ` AND rol = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT id, nombre, rol,
              (SELECT COUNT(*) FROM tickets_incidencias WHERE asignado_a = usuarios.id AND estado = 'ABIERTO')::int AS carga_actual
       FROM usuarios ${where} ORDER BY nombre`,
      params
    );
    res.json({ ok: true, usuarios: result.rows });
  } catch (err) {
    console.error("[usuarios] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al obtener los usuarios." });
  }
});

/* ════════════════════════════════════════════
   AUDITORÍA DE ACTAS — solo lectura, nunca se editan
════════════════════════════════════════════ */

// GET /api/actas — bandeja con filtros por señales (remota, GPS impreciso, negativa a firmar, fuera de horario)
app.get("/api/actas", requireAuth, requireRole("admin","dueno"), async (req, res) => {
  const { senal, objetivo_id } = req.query;
  const limite = Math.min(parseInt(req.query.limite) || 50, 200);
  const pagina = Math.max(parseInt(req.query.pagina) || 1, 1);
  const offset = (pagina - 1) * limite;

  try {
    const params = [];
    const wheres = [];
    if (isPositiveInt(objetivo_id)) {
      params.push(parseInt(objetivo_id));
      wheres.push(`r.objetivo_id = $${params.length}`);
    }
    if (senal === "remota")           wheres.push(`r.tipo = 'remota'`);
    if (senal === "fuera_geocerca")   wheres.push(`r.en_geocerca = FALSE`);
    if (senal === "negativa_firmar")  wheres.push(`EXISTS (SELECT 1 FROM ronda_vigiladores rv WHERE rv.ronda_id = r.id AND rv.nego_firmar = TRUE)`);

    const whereClause = wheres.length ? "WHERE " + wheres.join(" AND ") : "";
    params.push(limite, offset);

    const [actas, total] = await Promise.all([
      pool.query(`
        SELECT r.id, r.codigo_acta, r.tipo, r.en_geocerca, r.fecha_hora, r.hora_inicio, r.hora_fin,
               u.nombre AS supervisor, o.nombre AS objetivo,
               (SELECT COUNT(*) FROM ronda_vigiladores rv WHERE rv.ronda_id = r.id AND rv.nego_firmar = TRUE)::int AS negativas,
               (SELECT COUNT(*) FROM tickets_incidencias t WHERE t.ronda_id = r.id)::int AS incidencias,
               (SELECT COUNT(*) FROM actas_notas_auditoria n WHERE n.ronda_id = r.id)::int AS notas_auditoria
        FROM rondas_actas r
        JOIN usuarios  u ON r.supervisor_id = u.id
        JOIN objetivos o ON r.objetivo_id   = o.id
        ${whereClause}
        ORDER BY r.fecha_hora DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params),
      pool.query(`SELECT COUNT(*) FROM rondas_actas r ${whereClause}`, params.slice(0, -2)),
    ]);

    res.json({
      ok: true,
      actas: actas.rows,
      paginacion: { total: parseInt(total.rows[0].count), pagina, limite, paginas: Math.ceil(parseInt(total.rows[0].count) / limite) },
    });
  } catch (err) {
    console.error("[actas] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al obtener las actas." });
  }
});

// GET /api/actas/:id — acta original completa (misma vista para Administración y Gerencia, sin edición)
app.get("/api/actas/:id", requireAuth, requireRole("admin","dueno"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!isPositiveInt(id)) return res.status(400).json({ ok: false, mensaje: "ID de acta inválido." });

  try {
    const acta = await pool.query(`
      SELECT r.*, u.nombre AS supervisor, o.nombre AS objetivo, o.direccion, o.lat AS objetivo_lat, o.lng AS objetivo_lng
      FROM rondas_actas r
      JOIN usuarios  u ON r.supervisor_id = u.id
      JOIN objetivos o ON r.objetivo_id   = o.id
      WHERE r.id = $1
    `, [id]);
    if (acta.rows.length === 0) return res.status(404).json({ ok: false, mensaje: "Acta no encontrada." });

    const [firmantes, respuestas, fotos, tickets, notas] = await Promise.all([
      pool.query(`
        SELECT rv.firma_base64, rv.nego_firmar, rv.motivo_negativa, rv.aviso_registrado, v.nombre, v.legajo
        FROM ronda_vigiladores rv JOIN vigiladores v ON rv.vigilador_id = v.id
        WHERE rv.ronda_id = $1`, [id]),
      pool.query(`SELECT * FROM checklist_respuestas WHERE ronda_id = $1`, [id]),
      pool.query(`SELECT id, imagen_base64, lat, lng, tomada_en FROM evidencias_fotos WHERE ronda_id = $1 ORDER BY tomada_en`, [id]),
      pool.query(`SELECT id, codigo_ticket, item_titulo, valoracion, estado, severidad FROM tickets_incidencias WHERE ronda_id = $1`, [id]),
      pool.query(`
        SELECT n.nota, n.fecha, u.nombre AS autor
        FROM actas_notas_auditoria n JOIN usuarios u ON n.usuario_id = u.id
        WHERE n.ronda_id = $1 ORDER BY n.fecha DESC`, [id]),
    ]);

    res.json({
      ok: true,
      acta: acta.rows[0],
      firmantes: firmantes.rows,
      respuestas: respuestas.rows,
      fotos: fotos.rows,
      tickets: tickets.rows,
      notas_auditoria: notas.rows,
    });
  } catch (err) {
    console.error("[actas/:id] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al obtener el acta." });
  }
});

// POST /api/actas/:id/nota-auditoria — aclaración firmada; el acta original queda intacta
app.post("/api/actas/:id/nota-auditoria", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { nota } = req.body;
  if (!isPositiveInt(id))     return res.status(400).json({ ok: false, mensaje: "ID de acta inválido." });
  if (!isString(nota, 5, 2000)) return res.status(400).json({ ok: false, mensaje: "La nota es obligatoria (mínimo 5 caracteres)." });

  try {
    const result = await pool.query(
      `INSERT INTO actas_notas_auditoria (ronda_id, usuario_id, nota) VALUES ($1,$2,$3) RETURNING id, fecha`,
      [id, req.user.id, nota.trim()]
    );
    res.status(201).json({ ok: true, mensaje: "Nota de auditoría agregada.", nota: result.rows[0] });
  } catch (err) {
    console.error("[actas/nota-auditoria] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al agregar la nota de auditoría." });
  }
});

/* ════════════════════════════════════════════
   GESTIÓN DE OBJETIVOS — Requiere: admin
════════════════════════════════════════════ */

app.get("/api/objetivos", requireAuth, requireRole("admin","dueno"), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*,
             COUNT(r.id)::int AS visitas_mes,
             (SELECT COUNT(*) FROM objetivo_checklist oc WHERE oc.objetivo_id = o.id)::int AS ajustes_checklist
      FROM objetivos o
      LEFT JOIN rondas_actas r ON r.objetivo_id = o.id
        AND date_trunc('month', r.fecha_hora) = date_trunc('month', NOW())
      GROUP BY o.id
      ORDER BY o.nombre
    `);
    res.json({ ok: true, objetivos: result.rows });
  } catch (err) {
    console.error("[objetivos] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al obtener los objetivos." });
  }
});

app.post("/api/objetivos", requireAuth, requireRole("admin"), async (req, res) => {
  const {
    nombre, tipo, subtipo, modalidad, direccion, lat, lng,
    radio_geocerca_m, visitas_meta_mes, permite_remota, cliente,
  } = req.body;

  if (!isString(nombre, 3, 200))  return res.status(400).json({ ok: false, mensaje: "El nombre del objetivo es obligatorio." });
  if (!["Barrios","Industrias","Locales"].includes(tipo)) return res.status(400).json({ ok: false, mensaje: "Tipo de objetivo inválido." });
  if (!isValidLat(lat) || !isValidLng(lng) || lat == null || lng == null) {
    return res.status(400).json({ ok: false, mensaje: "La geocerca es obligatoria: no se puede activar un objetivo sin ubicación." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO objetivos
         (nombre, tipo, subtipo, modalidad, direccion, lat, lng, radio_geocerca_m, visitas_meta_mes,
          permite_remota, cliente, estado_config)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'borrador')
       RETURNING *`,
      [
        nombre.trim(), tipo, subtipo || "barrio_unipersonal", modalidad || "unipersonal",
        isString(direccion, 1, 300) ? direccion.trim() : null, lat, lng,
        isPositiveInt(radio_geocerca_m) ? parseInt(radio_geocerca_m) : 150,
        isPositiveInt(visitas_meta_mes) ? parseInt(visitas_meta_mes) : 0,
        Boolean(permite_remota),
        isString(cliente, 1, 200) ? cliente.trim() : null,
      ]
    );
    res.status(201).json({ ok: true, mensaje: "Objetivo creado en borrador.", objetivo: result.rows[0] });
  } catch (err) {
    console.error("[objetivos/crear] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al crear el objetivo." });
  }
});

app.patch("/api/objetivos/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!isPositiveInt(id)) return res.status(400).json({ ok: false, mensaje: "ID de objetivo inválido." });

  const campos = ["nombre","tipo","subtipo","modalidad","direccion","lat","lng",
    "radio_geocerca_m","visitas_meta_mes","permite_remota","cliente"];
  const sets = [];
  const params = [];
  for (const campo of campos) {
    if (req.body[campo] !== undefined) {
      params.push(req.body[campo]);
      sets.push(`${campo} = $${params.length}`);
    }
  }
  if (sets.length === 0) return res.status(400).json({ ok: false, mensaje: "No se enviaron cambios." });

  params.push(id);
  try {
    const result = await pool.query(
      `UPDATE objetivos SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ ok: false, mensaje: "Objetivo no encontrado." });
    res.json({ ok: true, mensaje: "Objetivo actualizado.", objetivo: result.rows[0] });
  } catch (err) {
    console.error("[objetivos/editar] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al actualizar el objetivo." });
  }
});

// PATCH /api/objetivos/:id/estado — activar exige geocerca + al menos un ítem de checklist resuelto
app.patch("/api/objetivos/:id/estado", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  const { estado_config } = req.body;
  if (!isPositiveInt(id)) return res.status(400).json({ ok: false, mensaje: "ID de objetivo inválido." });
  if (!["activo","borrador","suspendido"].includes(estado_config)) {
    return res.status(400).json({ ok: false, mensaje: "Estado inválido." });
  }

  try {
    const objetivo = await pool.query("SELECT lat, lng, radio_geocerca_m FROM objetivos WHERE id = $1", [id]);
    if (objetivo.rows.length === 0) return res.status(404).json({ ok: false, mensaje: "Objetivo no encontrado." });

    if (estado_config === "activo" && (objetivo.rows[0].lat == null || objetivo.rows[0].lng == null)) {
      return res.status(400).json({ ok: false, mensaje: "No se puede activar sin checklist ni geocerca configurados." });
    }

    const result = await pool.query(
      "UPDATE objetivos SET estado_config = $1, activo = $2 WHERE id = $3 RETURNING *",
      [estado_config, estado_config !== "suspendido", id]
    );
    res.json({ ok: true, mensaje: "Estado del objetivo actualizado.", objetivo: result.rows[0] });
  } catch (err) {
    console.error("[objetivos/estado] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al cambiar el estado del objetivo." });
  }
});

/* ════════════════════════════════════════════
   EDITOR DE CHECKLIST — Requiere: admin
   Publicar versiona en vez de sobrescribir (6d).
════════════════════════════════════════════ */

app.get("/api/checklist/items", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const [secciones, items] = await Promise.all([
      pool.query("SELECT id, clave, nombre, color, orden FROM checklist_secciones ORDER BY orden"),
      pool.query(`
        SELECT i.*, s.clave AS seccion_clave
        FROM checklist_items i JOIN checklist_secciones s ON i.seccion_id = s.id
        ORDER BY s.orden, i.orden`),
    ]);
    res.json({ ok: true, secciones: secciones.rows, items: items.rows });
  } catch (err) {
    console.error("[checklist/items] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al obtener el checklist." });
  }
});

app.post("/api/checklist/items", requireAuth, requireRole("admin"), async (req, res) => {
  const { seccion_id, titulo_corto, criterio_completo, area_responsable, tipos_objetivo, foto_requerida_en, auto_incidencia } = req.body;

  if (!isPositiveInt(seccion_id))          return res.status(400).json({ ok: false, mensaje: "Sección inválida." });
  if (!isString(titulo_corto, 3, 200))     return res.status(400).json({ ok: false, mensaje: "El título es obligatorio." });
  if (!isString(criterio_completo, 5, 2000)) return res.status(400).json({ ok: false, mensaje: "El criterio completo es obligatorio." });
  if (!isString(area_responsable, 1, 100)) return res.status(400).json({ ok: false, mensaje: "El área responsable es obligatoria." });

  try {
    const result = await pool.query(
      `INSERT INTO checklist_items
         (seccion_id, titulo_corto, criterio_completo, area_responsable, tipos_objetivo, foto_requerida_en, auto_incidencia)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        parseInt(seccion_id), titulo_corto.trim(), criterio_completo.trim(), area_responsable.trim(),
        Array.isArray(tipos_objetivo) ? tipos_objetivo : [],
        ["nunca","R","M"].includes(foto_requerida_en) ? foto_requerida_en : "M",
        auto_incidencia !== false,
      ]
    );
    res.status(201).json({ ok: true, mensaje: "Ítem creado (queda en borrador hasta publicar).", item: result.rows[0] });
  } catch (err) {
    console.error("[checklist/items/crear] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al crear el ítem." });
  }
});

app.patch("/api/checklist/items/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!isPositiveInt(id)) return res.status(400).json({ ok: false, mensaje: "ID de ítem inválido." });

  const campos = ["titulo_corto","criterio_completo","area_responsable","tipos_objetivo","foto_requerida_en","auto_incidencia","activo"];
  const sets = [];
  const params = [];
  for (const campo of campos) {
    if (req.body[campo] !== undefined) {
      params.push(req.body[campo]);
      sets.push(`${campo} = $${params.length}`);
    }
  }
  if (sets.length === 0) return res.status(400).json({ ok: false, mensaje: "No se enviaron cambios." });

  params.push(id);
  try {
    const result = await pool.query(
      `UPDATE checklist_items SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ ok: false, mensaje: "Ítem no encontrado." });
    res.json({ ok: true, mensaje: "Ítem actualizado (queda en borrador hasta publicar).", item: result.rows[0] });
  } catch (err) {
    console.error("[checklist/items/editar] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al actualizar el ítem." });
  }
});

// POST /api/checklist/publicar — snapshotea el estado actual de todos los ítems como nueva versión
app.post("/api/checklist/publicar", requireAuth, requireRole("admin"), async (req, res) => {
  const { notas_cambio } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ultima = await client.query("SELECT COALESCE(MAX(numero), 0) AS n FROM checklist_versiones");
    const numero = ultima.rows[0].n + 1;

    await client.query(
      `INSERT INTO checklist_versiones (numero, notas_cambio, publicado_por) VALUES ($1,$2,$3)`,
      [numero, isString(notas_cambio, 1, 1000) ? notas_cambio.trim() : null, req.user.id]
    );

    const items = await client.query("SELECT * FROM checklist_items");
    for (const item of items.rows) {
      await client.query(
        `INSERT INTO checklist_items_historial
           (item_id, version, titulo_corto, criterio_completo, area_responsable, tipos_objetivo, activo)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [item.id, numero, item.titulo_corto, item.criterio_completo, item.area_responsable, item.tipos_objetivo, item.activo]
      );
    }
    await client.query("UPDATE checklist_items SET version = $1", [numero]);

    await client.query("COMMIT");
    res.status(201).json({ ok: true, mensaje: `Checklist publicado como versión v${numero}.`, version: numero });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[checklist/publicar] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al publicar el checklist." });
  } finally {
    client.release();
  }
});

/* ════════════════════════════════════════════
   GESTIÓN DE VIGILADORES — Requiere: admin
════════════════════════════════════════════ */

app.post("/api/vigiladores", requireAuth, requireRole("admin"), async (req, res) => {
  const {
    legajo, nombre, dni, puesto, credencial_numero, credencial_venc,
    es_chofer, licencia_cat, licencia_venc, armado,
    telefono, domicilio, fecha_nacimiento, nacionalidad, convenio, tiene_radio, objetivo_asignado_id,
  } = req.body;

  if (!isPositiveInt(legajo))    return res.status(400).json({ ok: false, mensaje: "Legajo inválido." });
  if (!isString(nombre, 3, 200)) return res.status(400).json({ ok: false, mensaje: "El nombre es obligatorio." });
  if (!isValidDate(credencial_venc)) return res.status(400).json({ ok: false, mensaje: "Fecha de vencimiento de credencial inválida." });

  try {
    const result = await pool.query(
      `INSERT INTO vigiladores
         (legajo, nombre, dni, puesto, credencial_numero, credencial_venc,
          es_chofer, licencia_cat, licencia_venc, armado,
          telefono, domicilio, fecha_nacimiento, nacionalidad, convenio, tiene_radio, objetivo_asignado_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        parseInt(legajo), nombre.trim(),
        isString(dni, 1, 20) ? dni.trim() : null,
        isString(puesto, 1, 100) ? puesto.trim() : null,
        isString(credencial_numero, 1, 50) ? credencial_numero.trim() : null,
        credencial_venc || null,
        Boolean(es_chofer),
        isString(licencia_cat, 1, 10) ? licencia_cat.trim() : null,
        licencia_venc || null,
        Boolean(armado),
        isString(telefono, 1, 30) ? telefono.trim() : null,
        isString(domicilio, 1, 300) ? domicilio.trim() : null,
        fecha_nacimiento || null,
        isString(nacionalidad, 1, 100) ? nacionalidad.trim() : "Argentina",
        isString(convenio, 1, 50) ? convenio.trim() : "UPSRA",
        Boolean(tiene_radio),
        isPositiveInt(objetivo_asignado_id) ? parseInt(objetivo_asignado_id) : null,
      ]
    );
    res.status(201).json({ ok: true, mensaje: "Vigilador dado de alta.", vigilador: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ ok: false, mensaje: "Ya existe un vigilador con ese legajo." });
    console.error("[vigiladores/crear] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al dar de alta al vigilador." });
  }
});

app.patch("/api/vigiladores/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const id = parseInt(req.params.id);
  if (!isPositiveInt(id)) return res.status(400).json({ ok: false, mensaje: "ID de vigilador inválido." });

  const campos = ["nombre","dni","puesto","credencial_numero","credencial_venc","es_chofer","licencia_cat",
    "licencia_venc","armado","telefono","domicilio","fecha_nacimiento","nacionalidad","convenio","tiene_radio",
    "objetivo_asignado_id","estado"];
  const sets = [];
  const params = [];
  for (const campo of campos) {
    if (req.body[campo] !== undefined) {
      params.push(req.body[campo]);
      sets.push(`${campo} = $${params.length}`);
    }
  }
  if (sets.length === 0) return res.status(400).json({ ok: false, mensaje: "No se enviaron cambios." });

  params.push(id);
  try {
    const result = await pool.query(
      `UPDATE vigiladores SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ ok: false, mensaje: "Vigilador no encontrado." });
    res.json({ ok: true, mensaje: "Vigilador actualizado.", vigilador: result.rows[0] });
  } catch (err) {
    console.error("[vigiladores/editar] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al actualizar el vigilador." });
  }
});

/* ════════════════════════════════════════════
   PLANIFICACIÓN DE RONDAS — Requiere: admin
   Grilla semanal objetivo × día × supervisor/turno (6f).
════════════════════════════════════════════ */

app.get("/api/planificacion", requireAuth, requireRole("admin"), async (req, res) => {
  const { desde, hasta } = req.query;
  if (!isValidDate(desde) || !isValidDate(hasta) || !desde || !hasta) {
    return res.status(400).json({ ok: false, mensaje: "Se requiere un rango de fechas (desde, hasta)." });
  }
  try {
    const result = await pool.query(
      `SELECT p.*, o.nombre AS objetivo, u.nombre AS supervisor
       FROM planificacion_rondas p
       JOIN objetivos o ON p.objetivo_id = o.id
       LEFT JOIN usuarios u ON p.supervisor_id = u.id
       WHERE p.fecha BETWEEN $1 AND $2
       ORDER BY p.fecha, o.nombre`,
      [desde, hasta]
    );
    res.json({ ok: true, planificacion: result.rows });
  } catch (err) {
    console.error("[planificacion] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al obtener la planificación." });
  }
});

app.post("/api/planificacion", requireAuth, requireRole("admin"), async (req, res) => {
  const { objetivo_id, supervisor_id, fecha, turno } = req.body;
  if (!isPositiveInt(objetivo_id)) return res.status(400).json({ ok: false, mensaje: "Objetivo inválido." });
  if (!isValidDate(fecha) || !fecha) return res.status(400).json({ ok: false, mensaje: "Fecha inválida." });
  if (!["dia","noche"].includes(turno)) return res.status(400).json({ ok: false, mensaje: "Turno inválido." });

  try {
    const result = await pool.query(
      `INSERT INTO planificacion_rondas (objetivo_id, supervisor_id, fecha, turno, estado)
       VALUES ($1,$2,$3,$4, CASE WHEN $2 IS NULL THEN 'sin_cubrir' ELSE 'planificada' END)
       ON CONFLICT (objetivo_id, fecha, turno) DO UPDATE SET
         supervisor_id = EXCLUDED.supervisor_id,
         estado = CASE WHEN EXCLUDED.supervisor_id IS NULL THEN 'sin_cubrir' ELSE 'planificada' END
       RETURNING *`,
      [parseInt(objetivo_id), isPositiveInt(supervisor_id) ? parseInt(supervisor_id) : null, fecha, turno]
    );
    res.status(201).json({ ok: true, mensaje: "Planificación guardada.", planificacion: result.rows[0] });
  } catch (err) {
    console.error("[planificacion/crear] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al guardar la planificación." });
  }
});

app.patch("/api/planificacion/publicar", requireAuth, requireRole("admin"), async (req, res) => {
  const { desde, hasta } = req.body;
  if (!isValidDate(desde) || !isValidDate(hasta) || !desde || !hasta) {
    return res.status(400).json({ ok: false, mensaje: "Se requiere un rango de fechas (desde, hasta)." });
  }
  try {
    const result = await pool.query(
      `UPDATE planificacion_rondas SET publicada = TRUE WHERE fecha BETWEEN $1 AND $2 RETURNING id`,
      [desde, hasta]
    );
    res.json({ ok: true, mensaje: `Planificación publicada (${result.rows.length} turnos).` });
  } catch (err) {
    console.error("[planificacion/publicar] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al publicar la planificación." });
  }
});

/* ════════════════════════════════════════════
   GET /api/kpis
   Requiere: admin o dueno
   Devuelve: métricas del mes actual
════════════════════════════════════════════ */
app.get("/api/kpis", requireAuth, requireRole("admin","dueno"), async (req, res) => {
  try {
    const [rondas, rondasMesAnterior, ticketsAbiertos, ticketsPorArea, cumplimiento, tiempoResolucion, objetivosEnRiesgo, reincidencias] = await Promise.all([

      // Total de rondas del mes actual
      pool.query(`
        SELECT COUNT(*) AS total_rondas,
               COUNT(*) FILTER (WHERE tipo = 'presencial') AS presenciales,
               COUNT(*) FILTER (WHERE tipo = 'remota')     AS remotas
        FROM rondas_actas
        WHERE date_trunc('month', fecha_hora) = date_trunc('month', NOW())
      `),

      // Tickets abiertos — 'criticos' son los de valoración MALO
      pool.query(`
        SELECT COUNT(*) AS abiertos,
               COUNT(*) FILTER (WHERE valoracion = 'M') AS criticos,
               COUNT(*) FILTER (WHERE fecha_creacion >= NOW() - INTERVAL '48 hours') AS ultimas_48h
        FROM tickets_incidencias
        WHERE estado = 'ABIERTO'
      `),

      // Tickets abiertos agrupados por área responsable
      pool.query(`
        SELECT area_responsable, COUNT(*) AS cantidad
        FROM tickets_incidencias
        WHERE estado = 'ABIERTO'
        GROUP BY area_responsable
        ORDER BY cantidad DESC
      `),

      // Rondas completadas vs meta por objetivo este mes
      pool.query(`
        SELECT o.id, o.nombre, o.tipo, o.subtipo, o.visitas_meta_mes,
               COUNT(r.id)::int AS rondas_realizadas
        FROM objetivos o
        LEFT JOIN rondas_actas r
          ON r.objetivo_id = o.id
          AND date_trunc('month', r.fecha_hora) = date_trunc('month', NOW())
        WHERE o.activo = TRUE
        GROUP BY o.id, o.nombre, o.tipo, o.subtipo, o.visitas_meta_mes
        ORDER BY o.nombre
      `),

      // Tiempo promedio de resolución de tickets (días)
      pool.query(`
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (fecha_resolucion - fecha_creacion))/86400)::numeric, 1)
               AS dias_promedio_resolucion
        FROM tickets_incidencias
        WHERE estado = 'RESUELTO'
          AND fecha_resolucion >= date_trunc('month', NOW())
      `),

      // Rondas del mes anterior — comparación para "ningún número sin comparación" (7d)
      pool.query(`
        SELECT COUNT(*) AS total_rondas
        FROM rondas_actas
        WHERE date_trunc('month', fecha_hora) = date_trunc('month', NOW() - INTERVAL '1 month')
      `),

      // Objetivos en riesgo: incumplen frecuencia pactada Y tienen incidencias críticas abiertas
      pool.query(`
        SELECT o.id, o.nombre,
               COUNT(r.id)::int AS rondas_realizadas, o.visitas_meta_mes,
               (SELECT COUNT(*) FROM tickets_incidencias t
                 JOIN rondas_actas r2 ON t.ronda_id = r2.id
                 WHERE r2.objetivo_id = o.id AND t.estado = 'ABIERTO')::int AS incidencias_abiertas
        FROM objetivos o
        LEFT JOIN rondas_actas r ON r.objetivo_id = o.id
          AND date_trunc('month', r.fecha_hora) = date_trunc('month', NOW())
        WHERE o.activo = TRUE
        GROUP BY o.id, o.nombre, o.visitas_meta_mes
        HAVING COUNT(r.id) < o.visitas_meta_mes * 0.8
           AND (SELECT COUNT(*) FROM tickets_incidencias t
                 JOIN rondas_actas r2 ON t.ronda_id = r2.id
                 WHERE r2.objetivo_id = o.id AND t.estado = 'ABIERTO') > 0
        ORDER BY rondas_realizadas ASC
      `),

      // Ítems de checklist reincidentes (mismo ítem, mismo objetivo, últimos 90 días)
      pool.query(`
        SELECT t.item_titulo, o.nombre AS objetivo, COUNT(*)::int AS repeticiones
        FROM tickets_incidencias t
        JOIN rondas_actas r ON t.ronda_id = r.id
        JOIN objetivos o    ON r.objetivo_id = o.id
        WHERE t.checklist_item_id IS NOT NULL
          AND t.fecha_creacion >= NOW() - INTERVAL '90 days'
        GROUP BY t.item_titulo, o.nombre
        HAVING COUNT(*) > 1
        ORDER BY repeticiones DESC
        LIMIT 10
      `),
    ]);

    const r = rondas.rows[0];
    const t = ticketsAbiertos.rows[0];

    // Total de tickets cerrados este mes (para el panel del dueño)
    const cerrados = await pool.query(`
      SELECT COUNT(*) AS cerrados FROM tickets_incidencias
      WHERE estado = 'RESUELTO'
        AND date_trunc('month', fecha_resolucion) = date_trunc('month', NOW())
    `);

    res.json({
      ok: true,
      kpis: {
        rondas: {
          total_mes:      parseInt(r.total_rondas),
          presenciales:   parseInt(r.presenciales),
          remotas:        parseInt(r.remotas),
          mes_anterior:   parseInt(rondasMesAnterior.rows[0].total_rondas),
        },
        objetivos_en_riesgo: objetivosEnRiesgo.rows,
        reincidencias:       reincidencias.rows,
        tickets: {
          abiertos:       parseInt(t.abiertos),
          criticos:       parseInt(t.criticos),
          cerrados:       parseInt(cerrados.rows[0].cerrados),
          ultimas_48h:    parseInt(t.ultimas_48h),
          por_area:       ticketsPorArea.rows,
          dias_promedio_resolucion: parseFloat(tiempoResolucion.rows[0].dias_promedio_resolucion) || 0,
        },
        cumplimiento_objetivos: cumplimiento.rows,
      },
    });

  } catch (err) {
    console.error("[kpis] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al calcular los KPIs." });
  }
});

/* ════════════════════════════════════════════
   GET /api/kpis/evolucion
   Requiere: admin o dueno
   Serie de 6 meses de cumplimiento — alimenta el TrendChart del dueño (7b).
════════════════════════════════════════════ */
app.get("/api/kpis/evolucion", requireAuth, requireRole("admin","dueno"), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT date_trunc('month', meses.mes) AS mes,
             COUNT(r.id)::int AS rondas_realizadas,
             COALESCE(SUM(o.visitas_meta_mes), 0)::int AS meta_total
      FROM generate_series(
        date_trunc('month', NOW()) - INTERVAL '5 months',
        date_trunc('month', NOW()),
        INTERVAL '1 month'
      ) AS meses(mes)
      CROSS JOIN objetivos o
      LEFT JOIN rondas_actas r
        ON r.objetivo_id = o.id
       AND date_trunc('month', r.fecha_hora) = date_trunc('month', meses.mes)
      WHERE o.activo = TRUE
      GROUP BY meses.mes
      ORDER BY meses.mes
    `);
    res.json({ ok: true, evolucion: result.rows });
  } catch (err) {
    console.error("[kpis/evolucion] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al obtener la evolución mensual." });
  }
});

/* ════════════════════════════════════════════
   GET /api/actividad
   Requiere: admin o dueno
   Últimas rondas registradas — alimenta el feed en vivo.
════════════════════════════════════════════ */
app.get("/api/actividad", requireAuth, requireRole("admin","dueno"), async (req, res) => {
  const limite = Math.min(parseInt(req.query.limite) || 8, 50);
  try {
    const result = await pool.query(`
      SELECT r.id, r.codigo_acta, r.tipo, r.en_geocerca, r.fecha_hora,
             u.nombre AS supervisor,
             o.nombre AS objetivo,
             COUNT(t.id)::int AS tickets
      FROM rondas_actas r
      JOIN usuarios  u ON r.supervisor_id = u.id
      JOIN objetivos o ON r.objetivo_id   = o.id
      LEFT JOIN tickets_incidencias t ON t.ronda_id = r.id
      GROUP BY r.id, u.nombre, o.nombre
      ORDER BY r.fecha_hora DESC
      LIMIT $1
    `, [limite]);

    res.json({ ok: true, actividad: result.rows });
  } catch (err) {
    console.error("[actividad] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al obtener la actividad reciente." });
  }
});

/* ════════════════════════════════════════════
   GET /api/vigilador/:legajo
   Requiere: supervisor
   Perfil completo del vigilador (PRD §9): datos personales,
   características, historial de actas, sanciones e incidencias.
════════════════════════════════════════════ */
app.get("/api/vigilador/:legajo", requireAuth, requireRole("supervisor"), async (req, res) => {
  const legajo = parseInt(req.params.legajo);
  if (!isPositiveInt(legajo)) {
    return res.status(400).json({ ok: false, mensaje: "Legajo inválido." });
  }

  try {
    const vigilador = await pool.query(
      `SELECT v.id, v.legajo, v.nombre, v.dni, v.puesto,
              v.credencial_numero, v.credencial_venc,
              v.es_chofer, v.licencia_cat, v.licencia_venc, v.armado, v.estado,
              v.telefono, v.domicilio, v.fecha_nacimiento, v.nacionalidad,
              v.convenio, v.tiene_radio, v.foto_url,
              o.nombre AS objetivo_asignado
       FROM vigiladores v
       LEFT JOIN objetivos o ON v.objetivo_asignado_id = o.id
       WHERE v.legajo = $1`,
      [legajo]
    );

    if (vigilador.rows.length === 0) {
      return res.status(404).json({ ok: false, mensaje: `No se encontró el legajo ${legajo}.` });
    }

    const vigId = vigilador.rows[0].id;

    const [historial, sanciones, incidencias] = await Promise.all([
      pool.query(
        `SELECT tipo, descripcion, fecha
         FROM historial_vigiladores
         WHERE vigilador_id = $1
         ORDER BY fecha DESC LIMIT 10`,
        [vigId]
      ),
      pool.query(
        `SELECT id, descripcion, estado, fecha
         FROM sanciones
         WHERE vigilador_id = $1
         ORDER BY fecha DESC`,
        [vigId]
      ),
      pool.query(
        `SELECT t.codigo_ticket, t.descripcion, t.estado, t.valoracion,
                t.item_titulo, t.fecha_creacion, o.nombre AS objetivo
         FROM tickets_incidencias t
         JOIN rondas_actas r ON t.ronda_id    = r.id
         JOIN objetivos    o ON r.objetivo_id = o.id
         WHERE t.vigilador_id = $1
         ORDER BY t.fecha_creacion DESC LIMIT 10`,
        [vigId]
      ),
    ]);

    res.json({
      ok:          true,
      vigilador:   vigilador.rows[0],
      historial:   historial.rows,
      sanciones:   sanciones.rows,
      incidencias: incidencias.rows,
    });

  } catch (err) {
    console.error("[vigilador] Error interno:", err.message);
    res.status(500).json({ ok: false, mensaje: "Error al buscar el vigilador." });
  }
});

/* ════════════════════════════════════════════
   GET / — Health check (pública)
════════════════════════════════════════════ */
app.get("/", (req, res) => {
  res.json({
    ok:      true,
    sistema: "Argentina Seguridad Integral — API v3.0",
    estado:  "Servidor activo",
    endpoints: [
      "POST  /api/login",
      "GET   /api/inicializar             [auth]",
      "POST  /api/rondas                  [supervisor]",
      "GET   /api/vigilador/:legajo       [supervisor]",
      "GET   /api/tickets                 [admin, dueno]",
      "PATCH /api/tickets/:id/resolver    [admin]",
      "PATCH /api/tickets/:id/asignar     [admin]",
      "PATCH /api/tickets/:id/reasignar   [admin]",
      "PATCH /api/tickets/:id/rechazar    [admin]",
      "GET   /api/usuarios                [admin]",
      "GET   /api/actas                   [admin, dueno]",
      "GET   /api/actas/:id               [admin, dueno]",
      "POST  /api/actas/:id/nota-auditoria [admin]",
      "GET   /api/objetivos               [admin, dueno]",
      "POST  /api/objetivos               [admin]",
      "PATCH /api/objetivos/:id           [admin]",
      "PATCH /api/objetivos/:id/estado    [admin]",
      "GET   /api/checklist/items         [admin]",
      "POST  /api/checklist/items         [admin]",
      "PATCH /api/checklist/items/:id     [admin]",
      "POST  /api/checklist/publicar      [admin]",
      "POST  /api/vigiladores             [admin]",
      "PATCH /api/vigiladores/:id         [admin]",
      "GET   /api/planificacion           [admin]",
      "POST  /api/planificacion           [admin]",
      "PATCH /api/planificacion/publicar  [admin]",
      "GET   /api/kpis                    [admin, dueno]",
      "GET   /api/kpis/evolucion          [admin, dueno]",
      "GET   /api/actividad               [admin, dueno]",
    ],
  });
});

/* ════════════════════════════════════════════
   MANEJO GLOBAL DE ERRORES
════════════════════════════════════════════ */
app.use((err, req, res, _next) => {
  console.error("[error global]", err.message);
  res.status(500).json({ ok: false, mensaje: "Error interno del servidor." });
});

/* ════════════════════════════════════════════
   INICIO
════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor ASI v3.0 — http://localhost:${PORT}`);
  console.log(`🔐 JWT 8h · Rate limiting activo · CORS restringido`);
  console.log(`📋 Checklist configurable · Evidencia fotográfica · Firmas múltiples\n`);
});
