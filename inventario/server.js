require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const SESSION_DURATION_MS = 1000 * 60 * 60 * 8;
let initPromise;

const demoProducts = [
  ["Laptop Pro 14", "TEC-LP14", "Equipo portatil para administracion", "Tecnologia", "Pieza", "Norte Digital", 18, 6, 14200, 18999, "Almacen A / Rack 1"],
  ["Monitor 27 QHD", "TEC-M27Q", "Pantalla para punto de venta", "Tecnologia", "Pieza", "Pixel Mayorista", 5, 8, 3600, 5299, "Almacen A / Rack 3"],
  ["Cafe molido 1 kg", "ALI-CF1K", "Bolsa de cafe molido de kilo", "Alimentos", "Kilogramo", "Tostadores MX", 42, 15, 118, 189, "Almacen B / Seco"],
  ["Botella acero 750 ml", "HOG-B750", "Botella reutilizable de acero", "Hogar", "Pieza", "Casa Linea", 0, 10, 95, 169, "Almacen C / Pasillo 2"],
  ["Cuaderno premium", "OFI-CP01", "Cuaderno para oficina", "Oficina", "Pieza", "Papelera Central", 66, 20, 38, 79, "Almacen B / Estante 5"],
  ["Silla ergonomica", "OFI-SE22", "Silla para escritorio", "Oficina", "Pieza", "Mobiliario Uno", 7, 7, 1780, 2899, "Showroom / Piso"]
];

app.use(express.json({ limit: "2mb" }));

function hashPassword(password, salt) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(value) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || process.env.DATABASE_URL || "inventario_querendona-dev-secret";
}

function signPayload(payload) {
  return base64UrlEncode(crypto.createHmac("sha256", getSessionSecret()).update(payload).digest());
}

function createSessionToken(user) {
  const payload = base64UrlEncode(JSON.stringify({
    user,
    expiresAt: Date.now() + SESSION_DURATION_MS
  }));
  return `${payload}.${signPayload(payload)}`;
}

function readSessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;

  const expected = signPayload(payload);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload));
    if (!session.user || Number(session.expiresAt) < Date.now()) return null;
    return session.user;
  } catch (error) {
    return null;
  }
}

function userDto(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    label: user.label
  };
}

function productDto(row) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    description: row.description,
    category: row.category,
    unit: row.unit || "Unidad",
    supplier: row.supplier,
    stock: Number(row.stock),
    minStock: Number(row.min_stock),
    cost: Number(row.cost),
    price: Number(row.price),
    location: row.location,
    updatedAt: row.updated_at
  };
}

function movementDto(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    quantity: Number(row.quantity),
    note: row.note,
    createdAt: row.created_at
  };
}

function stockAlertDto(row) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    sku: row.sku,
    message: row.message,
    status: row.status,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at
  };
}

function formatDateOnly(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value || "").slice(0, 10);
}

function formatTimeOnly(value) {
  return String(value || "").slice(0, 5);
}

function reservationDto(row) {
  return {
    id: row.id,
    customerNumber: row.customer_number,
    branch: row.branch,
    name: row.name,
    email: row.email,
    phone: row.phone,
    date: formatDateOnly(row.reservation_date),
    time: formatTimeOnly(row.reservation_time),
    celebrationType: row.celebration_type,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function query(text, params = []) {
  return pool.query(text, params);
}

async function ensureSchema() {
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
      label TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'Unidad',
      supplier TEXT NOT NULL DEFAULT '',
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
      cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
      price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
      location TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'Unidad'`);
  await query(`
    CREATE TABLE IF NOT EXISTS movements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      sku TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      note TEXT NOT NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS stock_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      sku TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS reservations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_number TEXT NOT NULL UNIQUE,
      branch TEXT NOT NULL DEFAULT 'Tepeapulco, Hidalgo',
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      reservation_date DATE NOT NULL,
      reservation_time TIME NOT NULL,
      celebration_type TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS branch TEXT NOT NULL DEFAULT 'Tepeapulco, Hidalgo'`);
  await query(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_movements_created_at ON movements(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_alerts_status ON stock_alerts(status, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_reservations_date_time ON reservations(reservation_date, reservation_time)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status, created_at DESC)`);
}

async function seedUsers() {
  const users = [
    { username: "admin", password: "admin123", name: "Administrador", role: "admin", label: "Admin total" },
    { username: "capturista", password: "alta123", name: "Capturista", role: "staff", label: "Solo altas" }
  ];

  for (const user of users) {
    const salt = crypto.randomBytes(16).toString("hex");
    await query(
      `INSERT INTO users (username, password_hash, salt, name, role, label)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (username) DO NOTHING`,
      [user.username, hashPassword(user.password, salt), salt, user.name, user.role, user.label]
    );
  }
}

async function seedProducts() {
  const count = await query(`SELECT COUNT(*)::int AS count FROM products`);
  if (count.rows[0].count > 0) return;

  for (const product of demoProducts) {
    await query(
      `INSERT INTO products (name, sku, description, category, unit, supplier, stock, min_stock, cost, price, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (sku) DO NOTHING`,
      product
    );
  }
}

function getInitPromise() {
  if (!process.env.DATABASE_URL) {
    const error = new Error("Falta DATABASE_URL. Configura la variable de entorno en Vercel.");
    error.status = 500;
    return Promise.reject(error);
  }

  if (!initPromise) {
    initPromise = ensureSchema()
      .then(seedUsers)
      .then(seedProducts)
      .catch((error) => {
        initPromise = null;
        throw error;
      });
  }

  return initPromise;
}

function isReservationCreateRequest(req) {
  return req.method === "POST" && req.originalUrl.split("?")[0] === "/api/reservations";
}

app.use("/api", async (req, res, next) => {
  if (!process.env.DATABASE_URL && isReservationCreateRequest(req)) {
    next();
    return;
  }

  try {
    await getInitPromise();
    next();
  } catch (error) {
    next(error);
  }
});

async function recordMovement(client, product, quantity, note, userId) {
  await client.query(
    `INSERT INTO movements (product_id, product_name, sku, quantity, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [product.id, product.name, product.sku, quantity, note, userId]
  );
}

function authRequired(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const user = readSessionToken(token);
  if (!user) {
    res.status(401).json({ error: "Sesion no valida" });
    return;
  }
  req.token = token;
  req.user = user;
  next();
}

function adminRequired(req, res, next) {
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Solo admin puede realizar esta accion" });
    return;
  }
  next();
}

function sanitizeReservation(input = {}) {
  const reservation = {
    branch: String(input.branch || "").trim(),
    name: String(input.name || "").trim(),
    email: String(input.email || "").trim().toLowerCase(),
    phone: String(input.phone || "").trim(),
    date: String(input.date || "").trim(),
    time: String(input.time || "").trim(),
    celebrationType: String(input.celebrationType || "").trim(),
    message: String(input.message || "").trim().slice(0, 1000)
  };

  if (!reservation.branch || !reservation.name || !reservation.email || !reservation.phone || !reservation.date || !reservation.time || !reservation.celebrationType) {
    const error = new Error("Completa sucursal, nombre, correo, telefono, fecha, hora y tipo de celebracion");
    error.status = 400;
    throw error;
  }

  if (!["Tepeapulco, Hidalgo", "Ciudad Sahagún, Hidalgo"].includes(reservation.branch)) {
    const error = new Error("Sucursal invalida");
    error.status = 400;
    throw error;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservation.email)) {
    const error = new Error("Correo electronico invalido");
    error.status = 400;
    throw error;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(reservation.date)) {
    const error = new Error("Fecha invalida");
    error.status = 400;
    throw error;
  }

  if (!/^\d{2}:\d{2}$/.test(reservation.time)) {
    const error = new Error("Hora invalida");
    error.status = 400;
    throw error;
  }

  const [hours, minutes] = reservation.time.split(":").map(Number);
  const selectedDate = new Date(`${reservation.date}T00:00:00`);

  if (Number.isNaN(selectedDate.getTime()) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    const error = new Error("Fecha u hora invalida");
    error.status = 400;
    throw error;
  }

  return reservation;
}

async function getNextReservationCustomerNumber(client, date) {
  const compactDate = date.replace(/-/g, "");

  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`reservations:${date}`]);

  const result = await client.query(
    `SELECT customer_number
     FROM reservations
     WHERE customer_number LIKE $1
     ORDER BY customer_number DESC
     LIMIT 1`,
    [`CL-${compactDate}-%`]
  );
  const lastNumber = result.rows[0]?.customer_number || "";
  const match = lastNumber.match(/-(\d+)$/);
  const nextSequence = match ? Number(match[1]) + 1 : 1;

  return `CL-${compactDate}-${String(nextSequence).padStart(3, "0")}`;
}

function createWhatsAppReservation(reservation) {
  const now = new Date();
  const compactDate = reservation.date.replace(/-/g, "");
  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
  const randomPart = String(crypto.randomInt(100, 1000));

  return {
    id: null,
    customerNumber: `CL-${compactDate}-${timePart}${randomPart}`,
    branch: reservation.branch,
    name: reservation.name,
    email: reservation.email,
    phone: reservation.phone,
    date: reservation.date,
    time: reservation.time,
    celebrationType: reservation.celebrationType,
    message: reservation.message,
    status: "pending",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    stored: false
  };
}

app.post("/api/reservations", async (req, res, next) => {
  let client;

  try {
    const reservation = sanitizeReservation(req.body);

    if (!process.env.DATABASE_URL) {
      res.status(202).json({
        mode: "whatsapp-only",
        reservation: createWhatsAppReservation(reservation)
      });
      return;
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const customerNumber = await getNextReservationCustomerNumber(client, reservation.date);
    const result = await client.query(
      `INSERT INTO reservations (customer_number, branch, name, email, phone, reservation_date, reservation_time, celebration_type, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        customerNumber,
        reservation.branch,
        reservation.name,
        reservation.email,
        reservation.phone,
        reservation.date,
        reservation.time,
        reservation.celebrationType,
        reservation.message
      ]
    );

    await client.query("COMMIT");

    res.status(201).json({ reservation: reservationDto(result.rows[0]) });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }
    next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

app.get("/api/reservations", authRequired, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT *
       FROM reservations
       ORDER BY reservation_date DESC, reservation_time DESC, created_at DESC
       LIMIT 120`
    );

    res.json({ reservations: result.rows.map(reservationDto) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/reservations/:id/status", authRequired, adminRequired, async (req, res, next) => {
  try {
    const status = String(req.body.status || "").trim();

    if (!["pending", "confirmed", "cancelled"].includes(status)) {
      res.status(400).json({ error: "Estado de reservacion invalido" });
      return;
    }

    const result = await query(
      `UPDATE reservations
       SET status = $1, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [status, req.params.id]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Reservacion no encontrada" });
      return;
    }

    res.json({ reservation: reservationDto(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { username = "", password = "" } = req.body;
    const result = await query(`SELECT * FROM users WHERE username = $1`, [String(username).trim().toLowerCase()]);
    const user = result.rows[0];

    if (!user || hashPassword(password, user.salt) !== user.password_hash) {
      res.status(401).json({ error: "Usuario o contrasena incorrectos" });
      return;
    }

    const safeUser = userDto(user);
    res.json({ token: createSessionToken(safeUser), user: safeUser });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", authRequired, (req, res) => {
  res.json({ ok: true });
});

app.get("/api/session", authRequired, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/products", authRequired, async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM products ORDER BY updated_at DESC, name ASC`);
    res.json({ products: result.rows.map(productDto) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/products", authRequired, async (req, res, next) => {
  try {
    const product = sanitizeProduct(req.body);
    const result = await query(
      `INSERT INTO products (name, sku, description, category, unit, supplier, stock, min_stock, cost, price, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      product
    );
    const saved = productDto(result.rows[0]);
    await query(
      `INSERT INTO movements (product_id, product_name, sku, quantity, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [saved.id, saved.name, saved.sku, saved.stock, "Alta de producto", req.user.id]
    );
    res.status(201).json({ product: saved });
  } catch (error) {
    next(error);
  }
});

app.put("/api/products/:id", authRequired, adminRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const product = sanitizeProduct(req.body);
    await client.query("BEGIN");
    const previousResult = await client.query(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!previousResult.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    const previous = previousResult.rows[0];
    const result = await client.query(
      `UPDATE products
       SET name = $1, sku = $2, description = $3, category = $4, unit = $5, supplier = $6, stock = $7, min_stock = $8,
           cost = $9, price = $10, location = $11, updated_at = now()
       WHERE id = $12
       RETURNING *`,
      [...product, req.params.id]
    );
    const saved = productDto(result.rows[0]);
    const diff = saved.stock - Number(previous.stock);
    if (diff !== 0) {
      await recordMovement(client, result.rows[0], diff, "Ajuste por edicion", req.user.id);
    }
    await client.query("COMMIT");
    res.json({ product: saved });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.delete("/api/products/:id", authRequired, adminRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [req.params.id]);
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }
    const product = result.rows[0];
    await recordMovement(client, product, -Number(product.stock), "Producto eliminado", req.user.id);
    await client.query(`DELETE FROM products WHERE id = $1`, [req.params.id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/products/:id/adjust", authRequired, adminRequired, async (req, res, next) => {
  const amount = Number(req.body.amount);
  if (!Number.isInteger(amount) || amount === 0) {
    res.status(400).json({ error: "Cantidad invalida" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(`SELECT * FROM products WHERE id = $1 FOR UPDATE`, [req.params.id]);
    const product = current.rows[0];
    if (!product) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    const nextStock = Math.max(0, Number(product.stock) + amount);
    const applied = nextStock - Number(product.stock);
    if (applied === 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "El stock ya esta en cero" });
      return;
    }

    const updated = await client.query(
      `UPDATE products SET stock = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [nextStock, req.params.id]
    );
    await recordMovement(client, updated.rows[0], applied, applied > 0 ? "Entrada rapida" : "Salida rapida", req.user.id);
    await client.query("COMMIT");
    res.json({ product: productDto(updated.rows[0]) });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/products/:id/stock-alert", authRequired, async (req, res, next) => {
  try {
    const productResult = await query(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
    const product = productResult.rows[0];
    if (!product) {
      res.status(404).json({ error: "Producto no encontrado" });
      return;
    }

    const message = String(req.body.message || "Producto agotado o sin existencia en inventario.").trim().slice(0, 240);
    const existing = await query(
      `SELECT id FROM stock_alerts WHERE product_id = $1 AND status = 'open' LIMIT 1`,
      [product.id]
    );

    if (existing.rows[0]) {
      res.status(409).json({ error: "Ya existe un aviso abierto para este producto" });
      return;
    }

    const result = await query(
      `INSERT INTO stock_alerts (product_id, product_name, sku, message, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [product.id, product.name, product.sku, message, req.user.id]
    );
    res.status(201).json({ alert: stockAlertDto(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/stock-alerts", authRequired, adminRequired, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT stock_alerts.*, users.name AS created_by_name
       FROM stock_alerts
       LEFT JOIN users ON users.id = stock_alerts.created_by
       ORDER BY stock_alerts.created_at DESC`
    );
    res.json({ alerts: result.rows.map(stockAlertDto) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/stock-alerts/:id/resolve", authRequired, adminRequired, async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE stock_alerts
       SET status = 'resolved', resolved_by = $1, resolved_at = now()
       WHERE id = $2
       RETURNING *`,
      [req.user.id, req.params.id]
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: "Aviso no encontrado" });
      return;
    }

    res.json({ alert: stockAlertDto(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/restock-suggested", authRequired, adminRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`SELECT * FROM products WHERE stock <= min_stock FOR UPDATE`);
    for (const product of result.rows) {
      const amount = Math.max(Number(product.min_stock) * 2 - Number(product.stock), 1);
      const updated = await client.query(
        `UPDATE products SET stock = stock + $1, updated_at = now() WHERE id = $2 RETURNING *`,
        [amount, product.id]
      );
      await recordMovement(client, updated.rows[0], amount, "Reposicion sugerida", req.user.id);
    }
    await client.query("COMMIT");
    res.json({ updated: result.rowCount });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/api/movements", authRequired, async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM movements ORDER BY created_at DESC LIMIT 60`);
    res.json({ movements: result.rows.map(movementDto) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/movements", authRequired, adminRequired, async (req, res, next) => {
  try {
    await query(`DELETE FROM movements`);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/export", authRequired, adminRequired, async (req, res, next) => {
  try {
    const [products, movements, alerts] = await Promise.all([
      query(`SELECT * FROM products ORDER BY name ASC`),
      query(`SELECT * FROM movements ORDER BY created_at DESC`),
      query(`SELECT * FROM stock_alerts ORDER BY created_at DESC`)
    ]);
    res.json({
      products: products.rows.map(productDto),
      movements: movements.rows.map(movementDto),
      alerts: alerts.rows.map(stockAlertDto)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/import", authRequired, adminRequired, async (req, res, next) => {
  const products = Array.isArray(req.body.products) ? req.body.products : [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM stock_alerts`);
    await client.query(`DELETE FROM movements`);
    await client.query(`DELETE FROM products`);
    for (const item of products) {
      await client.query(
        `INSERT INTO products (name, sku, description, category, unit, supplier, stock, min_stock, cost, price, location)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        sanitizeProduct(item)
      );
    }
    await client.query("COMMIT");
    res.json({ imported: products.length });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/reset-demo", authRequired, adminRequired, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM stock_alerts`);
    await client.query(`DELETE FROM movements`);
    await client.query(`DELETE FROM products`);
    for (const product of demoProducts) {
      await client.query(
        `INSERT INTO products (name, sku, description, category, unit, supplier, stock, min_stock, cost, price, location)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        product
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

function sanitizeProduct(input) {
  const product = {
    name: String(input.name || "").trim(),
    sku: String(input.sku || "").trim().toUpperCase(),
    description: String(input.description || "").trim(),
    category: String(input.category || "").trim(),
    unit: String(input.unit || "Unidad").trim() || "Unidad",
    supplier: String(input.supplier || "").trim(),
    stock: Number(input.stock),
    minStock: Number(input.minStock),
    cost: Number(input.cost),
    price: Number(input.price),
    location: String(input.location || "").trim()
  };

  if (!product.name || !product.sku || !product.category) {
    const error = new Error("Nombre, SKU y categoria son obligatorios");
    error.status = 400;
    throw error;
  }

  for (const field of ["stock", "minStock"]) {
    if (!Number.isInteger(product[field]) || product[field] < 0) {
      const error = new Error("Stock y minimo deben ser enteros positivos");
      error.status = 400;
      throw error;
    }
  }

  for (const field of ["cost", "price"]) {
    if (!Number.isFinite(product[field]) || product[field] < 0) {
      const error = new Error("Costo y precio deben ser positivos");
      error.status = 400;
      throw error;
    }
  }

  return [
    product.name,
    product.sku,
    product.description,
    product.category,
    product.unit,
    product.supplier,
    product.stock,
    product.minStock,
    product.cost,
    product.price,
    product.location
  ];
}

if (require.main === module) {
  app.use(express.static(__dirname));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
  });
}

app.use((error, req, res, next) => {
  if (error.code === "23505") {
    res.status(409).json({ error: "Ya existe un registro con ese SKU o usuario" });
    return;
  }
  res.status(error.status || 500).json({ error: error.message || "Error interno" });
});

async function start() {
  await getInitPromise();

  app.listen(port, () => {
    console.log(`inventario_querendona listo en http://localhost:${port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("No se pudo iniciar el servidor:", error);
    process.exit(1);
  });
}

module.exports = app;
