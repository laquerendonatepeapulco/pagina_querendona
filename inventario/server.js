require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const { Pool } = require("pg");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");

const app = express();
const port = Number(process.env.PORT || 3000);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const SESSION_DURATION_MS = 1000 * 60 * 60 * 8;
const LATIDOS_MAX_TICKETS = 50;
const LATIDOS_RESERVATION_MINUTES = 15;
const LATIDOS_EXPERIENCES = Object.freeze({
  tradicional: Object.freeze({
    id: "tradicional",
    title: "Experiencia tradicional - Buffet de antojitos mexicanos",
    unitPrice: 349,
    capacity: 60
  }),
  gastronomica: Object.freeze({
    id: "gastronomica",
    title: "Experiencia gastronomica - Cena mexicana de gala",
    unitPrice: 599,
    capacity: 40
  })
});
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
    partySize: row.party_size,
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

async function expireLatidosReservations(client = pool) {
  await client.query(
    "UPDATE latidos_orders SET status = 'expired', updated_at = now() WHERE status = 'reserved' AND reserved_until IS NOT NULL AND reserved_until < now()"
  );
}

async function getLatidosAvailability(client = pool) {
  await expireLatidosReservations(client);

  const result = await client.query(`
    SELECT
      e.id,
      e.name,
      e.capacity,
      e.price,

      COALESCE(
        SUM(
          CASE
            WHEN o.status = 'approved'
            THEN o.quantity
            ELSE 0
          END
        ),
        0
      )::INTEGER AS sold,

      COALESCE(
        SUM(
          CASE
            WHEN o.status = 'reserved'
              AND o.reserved_until > now()
            THEN o.quantity
            ELSE 0
          END
        ),
        0
      )::INTEGER AS reserved

    FROM latidos_experiences e

    LEFT JOIN latidos_orders o
      ON o.experience_id = e.id

    GROUP BY
      e.id,
      e.name,
      e.capacity,
      e.price

    ORDER BY e.id
  `);

  const experiences = {};

  for (const row of result.rows) {
    const capacity = Number(row.capacity);
    const sold = Number(row.sold);
    const reserved = Number(row.reserved);

    experiences[row.id] = {
      id: row.id,
      name: row.name,
      capacity,
      sold,
      reserved,
      available: Math.max(
        0,
        capacity - sold - reserved
      ),
      price: Number(row.price)
    };
  }

  return experiences;
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
      party_size INTEGER NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 100),
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
  await query(`ALTER TABLE reservations ADD COLUMN IF NOT EXISTS party_size INTEGER NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 100)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_movements_created_at ON movements(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_stock_alerts_status ON stock_alerts(status, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_reservations_date_time ON reservations(reservation_date, reservation_time)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status, created_at DESC)`);
  
  await query(`
    CREATE TABLE IF NOT EXISTS latidos_experiences (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity >= 0),
      price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`
  CREATE TABLE IF NOT EXISTS latidos_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    external_reference TEXT NOT NULL UNIQUE,

    mercadopago_preference_id TEXT,
    mercadopago_payment_id TEXT UNIQUE,

    experience_id TEXT NOT NULL
      REFERENCES latidos_experiences(id),

    quantity INTEGER NOT NULL
      CHECK (quantity > 0),

    unit_price NUMERIC(12, 2) NOT NULL
      CHECK (unit_price >= 0),

    total NUMERIC(12, 2) NOT NULL
      CHECK (total >= 0),

    status TEXT NOT NULL DEFAULT 'reserved'
      CHECK (
        status IN (
          'reserved',
          'approved',
          'expired',
          'cancelled',
          'refunded'
        )
      ),

    reserved_until TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    paid_at TIMESTAMPTZ
  )
`);

  await query(`
    CREATE TABLE IF NOT EXISTS latidos_registrations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL UNIQUE
        REFERENCES latidos_orders(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      origin TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      age INTEGER NOT NULL CHECK (age BETWEEN 0 AND 120),
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      business_type TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS latidos_tickets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL
        REFERENCES latidos_orders(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL CHECK (sequence > 0),
      ticket_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'used', 'cancelled')),
      used_at TIMESTAMPTZ,
      checked_in_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (order_id, sequence)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS latidos_test_tickets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'used')),
      used_at TIMESTAMPTZ,
      checked_in_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Compatibilidad con instalaciones que ya tenian una primera version de la tabla.
  await query(`
    ALTER TABLE latidos_tickets
      ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES latidos_orders(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS sequence INTEGER,
      ADD COLUMN IF NOT EXISTS ticket_number TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS checked_in_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()
  `);

  await query(`
    WITH ranked AS (
      SELECT
        ctid,
        ROW_NUMBER() OVER (
          PARTITION BY order_id
          ORDER BY sequence NULLS LAST, created_at NULLS LAST, id
        ) AS migrated_sequence
      FROM latidos_tickets
      WHERE order_id IS NOT NULL
    )
    UPDATE latidos_tickets AS ticket
    SET sequence = ranked.migrated_sequence
    FROM ranked
    WHERE ticket.ctid = ranked.ctid
      AND ticket.sequence IS NULL
  `);

  await query(`
    UPDATE latidos_tickets
    SET ticket_number = CONCAT(
      'LDM-M-',
      UPPER(SUBSTRING(MD5(id::text || random()::text) FROM 1 FOR 10))
    )
    WHERE ticket_number IS NULL
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_latidos_orders_experience_status
    ON latidos_orders(experience_id, status)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_latidos_orders_reserved_until
    ON latidos_orders(reserved_until)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_latidos_registrations_created_at
    ON latidos_registrations(created_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_latidos_tickets_status
    ON latidos_tickets(status, created_at)
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_latidos_tickets_order
    ON latidos_tickets(order_id, sequence)
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_latidos_tickets_number
    ON latidos_tickets(ticket_number)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_latidos_test_tickets_status
    ON latidos_test_tickets(status, created_at DESC)
  `);

  await query(`
    INSERT INTO latidos_experiences (
      id, 
      name, 
      capacity, 
      price
    )
    VALUES 
      ($1, $2, $3, $4),
      ($5, $6, $7, $8)

      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        capacity = EXCLUDED.capacity,
        price = EXCLUDED.price,
        updated_at = now()
    `,
    [
      "tradicional",
      "Buffet de antojitos mexicanos",
      60,
      349,

      "gastronomica",
      "Cena mexicana de gala",
      40,
      599
    ]
  );

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

function isLatidosPaymentRequest(req) {
  const requestPath = req.originalUrl.split("?")[0];

  return (
    (req.method === "POST" && requestPath === "/api/latidos/checkout") ||
    (req.method === "GET" && requestPath === "/api/latidos/payment") ||
    (req.method === "POST" && requestPath === "/api/latidos/webhook") ||
    (req.method === "POST" && requestPath === "/api/latidos/registration")
  );
}

app.use("/api", async (req, res, next) => {
  if (isLatidosPaymentRequest(req) || (!process.env.DATABASE_URL && isReservationCreateRequest(req))) {
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

function getMercadoPagoToken() {
  const token = String(process.env.MERCADO_PAGO_ACCESS_TOKEN || "").trim();

  if (!token) {
    const error = new Error("El pago en linea esta temporalmente fuera de servicio. Intenta nuevamente mas tarde.");
    error.status = 503;
    throw error;
  }

  return token;
}

function sanitizeLatidosSelection(input = {}) {
  const experienceId = String(input.experience || "").trim();
  const experience = LATIDOS_EXPERIENCES[experienceId];
  const quantity = Number.parseInt(String(input.quantity || ""), 10);

  if (!experience) {
    const error = new Error("Selecciona una experiencia valida");
    error.status = 400;
    throw error;
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > LATIDOS_MAX_TICKETS) {
    const error = new Error(`La cantidad debe ser de 1 a ${LATIDOS_MAX_TICKETS} boletos`);
    error.status = 400;
    throw error;
  }

  return { experience, quantity, total: experience.unitPrice * quantity };
}

function getPublicSiteUrl() {
  const configuredUrl = String(process.env.PUBLIC_SITE_URL || "https://laquerendonacg.com").trim();

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "https:") throw new Error("invalid protocol");
    return url.origin;
  } catch (cause) {
    const error = new Error("PUBLIC_SITE_URL debe ser una URL publica con HTTPS");
    error.status = 500;
    throw error;
  }
}

function createLatidosReference(experienceId, quantity) {
  return `latidos:${experienceId}:${quantity}:${crypto.randomUUID()}`;
}

function parseLatidosReference(reference) {
  const match = /^latidos:(tradicional|gastronomica):(\d{1,2}):[0-9a-f-]{36}$/i.exec(String(reference || ""));
  if (!match) return null;

  try {
    return sanitizeLatidosSelection({ experience: match[1].toLowerCase(), quantity: match[2] });
  } catch (error) {
    return null;
  }
}

function sanitizeLatidosPaymentId(value) {
  const paymentId = String(value || "").trim();

  if (!/^\d{6,30}$/.test(paymentId)) {
    const error = new Error("Identificador de pago invalido");
    error.status = 400;
    throw error;
  }

  return paymentId;
}

function sanitizeLatidosRegistration(input = {}) {
  function requiredText(value, label, maxLength = 180) {
    const result = String(value || "").trim();
    if (!result || result.length > maxLength) {
      const error = new Error(`${label} es obligatorio y debe tener maximo ${maxLength} caracteres`);
      error.status = 400;
      throw error;
    }
    return result;
  }

  const name = requiredText(input.name, "El nombre", 180);
  const origin = requiredText(input.origin, "El lugar de procedencia", 180);
  const contactName = requiredText(input.contactName, "El nombre del contacto", 180);
  const age = Number.parseInt(String(input.age ?? ""), 10);
  const email = requiredText(input.email, "El correo electronico", 254).toLowerCase();
  const phone = requiredText(input.phone, "El numero de celular", 30);
  const phoneDigits = phone.replace(/\D/g, "");
  const businessType = String(input.businessType || "").trim().toLowerCase();

  if (!Number.isInteger(age) || age < 0 || age > 120) {
    const error = new Error("La edad debe ser un numero entre 0 y 120");
    error.status = 400;
    throw error;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("Ingresa un correo electronico valido");
    error.status = 400;
    throw error;
  }

  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    const error = new Error("Ingresa un numero de celular valido");
    error.status = 400;
    throw error;
  }

  if (!["", "industria", "comercio", "servicio"].includes(businessType)) {
    const error = new Error("Selecciona un giro de empresa valido");
    error.status = 400;
    throw error;
  }

  return {
    name,
    origin,
    contactName,
    age,
    email,
    phone,
    businessType
  };
}

function createLatidosSignedToken(kind, id) {
  const payload = base64UrlEncode(JSON.stringify({ version: 1, kind, id }));
  return `lt1.${payload}.${signPayload(`latidos:${payload}`)}`;
}

function readLatidosSignedToken(token, expectedKind) {
  const [prefix, payload, signature] = String(token || "").trim().split(".");
  if (prefix !== "lt1" || !payload || !signature) return null;

  const expected = signPayload(`latidos:${payload}`);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  try {
    const value = JSON.parse(base64UrlDecode(payload));
    if (value.version !== 1 || value.kind !== expectedKind || !value.id) return null;
    return value;
  } catch (error) {
    return null;
  }
}

function createLatidosTicketNumber(experienceId) {
  const prefix = experienceId === "gastronomica" ? "G" : "T";
  return `LDM-${prefix}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

function latidosTicketDto(ticket) {
  const token = createLatidosSignedToken("ticket", ticket.id);
  const encodedToken = encodeURIComponent(token);

  return {
    ticketNumber: ticket.ticket_number,
    sequence: Number(ticket.sequence),
    status: ticket.status,
    usedAt: ticket.used_at || null,
    token,
    qrUrl: `/api/latidos/tickets/${encodedToken}/qr`
  };
}

function latidosTestTicketDto(ticket) {
  const token = createLatidosSignedToken("test-ticket", ticket.id);
  const encodedToken = encodeURIComponent(token);

  return {
    ticketNumber: ticket.ticket_number,
    status: ticket.status,
    usedAt: ticket.used_at || null,
    token,
    qrUrl: `/api/latidos/test-tickets/${encodedToken}/qr`,
    isTest: true
  };
}

async function ensureLatidosTickets(client, order) {
  for (let sequence = 1; sequence <= Number(order.quantity); sequence += 1) {
    await client.query(
      `
        INSERT INTO latidos_tickets (
          order_id,
          sequence,
          ticket_number,
          status
        )
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (order_id, sequence) DO NOTHING
      `,
      [order.id, sequence, createLatidosTicketNumber(order.experience_id)]
    );
  }

  const result = await client.query(
    `
      SELECT *
      FROM latidos_tickets
      WHERE order_id = $1
      ORDER BY sequence
    `,
    [order.id]
  );

  return result.rows;
}

async function getLatidosTicketBundle(client, orderId) {
  const orderResult = await client.query(
    `
      SELECT
        o.*,
        e.name AS experience_name,
        r.name AS registration_name,
        r.email AS registration_email,
        r.phone AS registration_phone
      FROM latidos_orders o
      JOIN latidos_experiences e ON e.id = o.experience_id
      JOIN latidos_registrations r ON r.order_id = o.id
      WHERE o.id = $1
    `,
    [orderId]
  );
  const order = orderResult.rows[0];
  if (!order) return null;

  const ticketResult = await client.query(
    `
      SELECT *
      FROM latidos_tickets
      WHERE order_id = $1
      ORDER BY sequence
    `,
    [orderId]
  );

  return { order, tickets: ticketResult.rows };
}

async function renderLatidosTicketsPdf(res, bundle) {
  const { order, tickets } = bundle;
  const qrBuffers = await Promise.all(
    tickets.map((ticket) => QRCode.toBuffer(createLatidosSignedToken("ticket", ticket.id), {
      type: "png",
      width: 720,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#1e3323", light: "#fffdf8" }
    }))
  );
  const document = new PDFDocument({
    size: "A4",
    margin: 0,
    autoFirstPage: false,
    info: {
      Title: "Boletos Latidos de Mexico",
      Author: "La Querendona",
      Subject: "Acceso al evento Latidos de Mexico"
    }
  });
  const logoPath = path.join(__dirname, "..", "img", "latidos-logo.png");
  const paper = "#f5f0e8";
  const ink = "#1e3323";
  const wine = "#a44143";
  const ochre = "#b2905a";

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="boletos-latidos-de-mexico.pdf"');
  res.setHeader("Cache-Control", "private, no-store");
  document.pipe(res);

  tickets.forEach((ticket, index) => {
    document.addPage();
    const pageWidth = document.page.width;
    const pageHeight = document.page.height;

    document.rect(0, 0, pageWidth, pageHeight).fill(paper);
    document.lineWidth(1.5).strokeColor(ochre).roundedRect(34, 34, pageWidth - 68, pageHeight - 68, 18).stroke();
    document.fillColor(wine).font("Helvetica-Bold").fontSize(10).text(
      "BOLETO DIGITAL - LATIDOS DE MEXICO",
      62,
      62,
      { width: pageWidth - 124, align: "center", characterSpacing: 1.5 }
    );

    if (fs.existsSync(logoPath)) {
      document.image(logoPath, pageWidth / 2 - 54, 92, { fit: [108, 125], align: "center" });
    }

    document.fillColor(ink).font("Times-Roman").fontSize(28).text(
      order.experience_name,
      62,
      222,
      { width: pageWidth - 124, align: "center" }
    );
    document.fillColor(wine).font("Helvetica-Bold").fontSize(12).text(
      `Boleto ${Number(ticket.sequence)} de ${Number(order.quantity)}`,
      62,
      266,
      { width: pageWidth - 124, align: "center" }
    );

    document.image(qrBuffers[index], pageWidth / 2 - 112, 304, { width: 224, height: 224 });
    document.fillColor(ink).font("Helvetica-Bold").fontSize(13).text(
      ticket.ticket_number,
      62,
      538,
      { width: pageWidth - 124, align: "center", characterSpacing: 1 }
    );
    document.fillColor(ink).font("Helvetica").fontSize(11).text(
      "12 de septiembre de 2026 | Restaurante La Querendona, Tepeapulco",
      62,
      574,
      { width: pageWidth - 124, align: "center" }
    );
    document.font("Helvetica").fontSize(10).text(
      `Titular de la compra: ${order.registration_name}`,
      62,
      606,
      { width: pageWidth - 124, align: "center" }
    );

    document.moveTo(78, 650).lineTo(pageWidth - 78, 650).strokeColor(ochre).lineWidth(0.8).stroke();
    document.fillColor("#526052").font("Helvetica").fontSize(9).text(
      "Presenta este codigo QR al ingresar. Cada boleto permite un solo acceso y quedara invalidado despues de su primer escaneo.",
      82,
      670,
      { width: pageWidth - 164, align: "center", lineGap: 3 }
    );

    if (ticket.status === "cancelled") {
      document.save();
      document.rotate(-24, { origin: [pageWidth / 2, pageHeight / 2] });
      document.fillColor(wine).opacity(0.28).font("Helvetica-Bold").fontSize(64).text(
        "CANCELADO",
        72,
        pageHeight / 2 - 34,
        { width: pageWidth - 144, align: "center" }
      );
      document.restore();
      document.opacity(1);
    }

    document.fillColor(wine).font("Helvetica-Bold").fontSize(9).text(
      "LA QUERENDONA - 2026",
      62,
      pageHeight - 74,
      { width: pageWidth - 124, align: "center", characterSpacing: 1 }
    );
  });

  document.end();
}

async function mercadoPagoRequest(pathname, options = {}) {
  const response = await fetch(`https://api.mercadopago.com${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getMercadoPagoToken()}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error("Mercado Pago no pudo procesar la solicitud. Intenta nuevamente.");
    error.status = response.status >= 400 && response.status < 500 ? 400 : 502;
    error.mercadoPagoCause = payload;
    throw error;
  }

  return payload;
}

async function syncLatidosPayment(paymentIdInput) {
  const paymentId = sanitizeLatidosPaymentId(paymentIdInput);

  await getInitPromise();

  const payment = await mercadoPagoRequest(`/v1/payments/${paymentId}`);
  const selection = parseLatidosReference(payment.external_reference);

  if (!selection) {
    const error = new Error("Este pago no corresponde a Latidos de Mexico");
    error.status = 400;
    throw error;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      `
        SELECT *
        FROM latidos_orders
        WHERE external_reference = $1
        FOR UPDATE
      `,
      [payment.external_reference]
    );
    const order = orderResult.rows[0];

    if (!order) {
      const error = new Error("No encontramos el apartado relacionado con este pago");
      error.status = 404;
      throw error;
    }

    const amount = Number(payment.transaction_amount);
    const orderTotal = Number(order.total);
    const amountMatches = Number.isFinite(amount) && Math.abs(amount - orderTotal) < 0.01;
    const currencyMatches = String(payment.currency_id || "").toUpperCase() === "MXN";
    const referenceMatches =
      order.experience_id === selection.experience.id &&
      Number(order.quantity) === selection.quantity &&
      Math.abs(Number(order.unit_price) - selection.experience.unitPrice) < 0.01;

    if (!amountMatches || !currencyMatches || !referenceMatches) {
      const error = new Error("Los datos del pago no coinciden con el apartado de Latidos de Mexico");
      error.status = 400;
      throw error;
    }

    const mercadoPagoStatus = String(payment.status || "unknown").toLowerCase();
    let orderStatus = String(order.status || "reserved");

    if (mercadoPagoStatus === "approved") {
      orderStatus = "approved";
    } else if (["refunded", "charged_back"].includes(mercadoPagoStatus)) {
      orderStatus = "refunded";
    } else if (["rejected", "cancelled"].includes(mercadoPagoStatus) && orderStatus !== "approved") {
      orderStatus = "cancelled";
    }

    const paidAt = mercadoPagoStatus === "approved" ? payment.date_approved || null : null;
    const updatedResult = await client.query(
      `
        UPDATE latidos_orders
        SET
          mercadopago_payment_id = $1,
          status = $2,
          paid_at = CASE
            WHEN $2 = 'approved' THEN COALESCE($3::timestamptz, paid_at, now())
            ELSE paid_at
          END,
          reserved_until = CASE
            WHEN $2 IN ('approved', 'cancelled', 'refunded') THEN NULL
            ELSE reserved_until
          END,
          updated_at = now()
        WHERE id = $4
        RETURNING *
      `,
      [String(payment.id), orderStatus, paidAt, order.id]
    );
    const updatedOrder = updatedResult.rows[0] || { ...order, status: orderStatus };

    if (["cancelled", "refunded"].includes(orderStatus)) {
      await client.query(
        `
          UPDATE latidos_tickets
          SET status = 'cancelled', updated_at = now()
          WHERE order_id = $1 AND status = 'active'
        `,
        [order.id]
      );
    }

    await client.query("COMMIT");

    return {
      approved: updatedOrder.status === "approved" && mercadoPagoStatus === "approved",
      status: mercadoPagoStatus,
      paymentId: String(payment.id),
      experience: updatedOrder.experience_id,
      experienceTitle: selection.experience.title,
      quantity: Number(updatedOrder.quantity),
      unitPrice: Number(updatedOrder.unit_price),
      amount,
      currency: String(payment.currency_id || ""),
      paidAt: payment.date_approved || updatedOrder.paid_at || null,
      orderId: updatedOrder.id
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}


app.get("/api/latidos/availability", async (req, res, next) => {
  try {
    await getInitPromise();

    const experiences = await getLatidosAvailability();

    res.json({
      experiences
    });
  } catch (error) {
    next(error);
  }
});


app.post("/api/latidos/checkout", async (req, res, next) => {
  let orderId = null;

  try {
    await getInitPromise();

    const selection = sanitizeLatidosSelection(req.body);

    const siteUrl = getPublicSiteUrl();
    const returnPage = `${siteUrl}/latidos-de-mexico.html`;

    const selectedExperience = selection.experience;
    const quantity = selection.quantity;
    const unitPrice = selectedExperience.unitPrice;
    const total = selection.total;

    const externalReference = createLatidosReference(
      selectedExperience.id,
      quantity
    );
    const reservationExpiresAt = new Date(
      Date.now() + LATIDOS_RESERVATION_MINUTES * 60 * 1000
    ).toISOString();

    // 1. Crear el apartado en PostgreSQL
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await expireLatidosReservations(client);

      const experienceResult = await client.query(
        `
          SELECT *
          FROM latidos_experiences
          WHERE id = $1
          FOR UPDATE
        `,
        [selectedExperience.id]
      );

      if (!experienceResult.rows.length) {
        const error = new Error("Experiencia no encontrada.");
        error.status = 404;
        throw error;
      }

      const capacity =
        Number(experienceResult.rows[0].capacity);

      const occupiedResult = await client.query(
        `
          SELECT
            COALESCE(SUM(quantity), 0)::INTEGER AS occupied
          FROM latidos_orders
          WHERE experience_id = $1
            AND (
              status = 'approved'
              OR (
                status = 'reserved'
                AND reserved_until > now()
              )
            )
        `,
        [selectedExperience.id]
      );

      const occupied =
        Number(occupiedResult.rows[0].occupied);

      const available =
        Math.max(0, capacity - occupied);

      if (quantity > available) {
        const error = new Error(
          available === 0
            ? "Esta experiencia está agotada."
            : `Solo quedan ${available} lugares disponibles.`
        );

        error.status = 409;
        throw error;
      }

      const orderResult = await client.query(
        `
          INSERT INTO latidos_orders (
            external_reference,
            experience_id,
            quantity,
            unit_price,
            total,
            status,
            reserved_until
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            'reserved',
            $6::timestamptz
          )
          RETURNING id
        `,
        [
          externalReference,
          selectedExperience.id,
          quantity,
          unitPrice,
          total,
          reservationExpiresAt
        ]
      );

      orderId = orderResult.rows[0].id;

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    // 2. Crear preferencia en Mercado Pago
    const preference = await mercadoPagoRequest(
      "/checkout/preferences",
      {
        method: "POST",

        headers: {
          "X-Idempotency-Key": crypto.randomUUID()
        },

        body: JSON.stringify({
          items: [
            {
              id: `latidos-${selectedExperience.id}`,
              title: selectedExperience.title,
              description:
                "Acceso a Latidos de Mexico - 12 de septiembre de 2026",
              category_id: "tickets",
              quantity,
              currency_id: "MXN",
              unit_price: unitPrice
            }
          ],

          external_reference: externalReference,

          metadata: {
            event: "latidos-de-mexico-2026",
            experience: selectedExperience.id,
            quantity
          },

          notification_url: `${siteUrl}/api/latidos/webhook`,

          expires: true,
          expiration_date_to: reservationExpiresAt,

          back_urls: {
            success:
              `${returnPage}?payment=success#registro`,
            pending:
              `${returnPage}?payment=pending#registro`,
            failure:
              `${returnPage}?payment=failure#registro`
          },

          auto_return: "approved",
          statement_descriptor: "LA QUERENDONA"
        })
      }
    );

    if (!preference.init_point) {
      const error = new Error(
        "Mercado Pago no devolvio un enlace de pago valido"
      );

      error.status = 502;
      throw error;
    }

    // 3. Guardar preference_id en la orden
    await query(
      `
        UPDATE latidos_orders
        SET
          mercadopago_preference_id = $1,
          updated_at = now()
        WHERE id = $2
      `,
      [
        preference.id,
        orderId
      ]
    );

    res.status(201).json({
      checkoutUrl: preference.init_point,
      preferenceId: preference.id,
      total
    });

  } catch (error) {

    // Si Mercado Pago falla después de crear el apartado,
    // liberamos ese apartado.
    if (orderId) {
      try {
        await query(
          `
            UPDATE latidos_orders
            SET
              status = 'cancelled',
              updated_at = now()
            WHERE id = $1
              AND status = 'reserved'
          `,
          [orderId]
        );
      } catch (cancelError) {
        console.error(
          "No fue posible cancelar el apartado de Latidos:",
          cancelError
        );
      }
    }

    next(error);
  }
});

app.get("/api/latidos/payment", async (req, res, next) => {
  try {
    const payment = await syncLatidosPayment(req.query.payment_id);
    const { orderId, ...publicPayment } = payment;
    res.json(publicPayment);
  } catch (error) {
    next(error);
  }
});

app.post("/api/latidos/webhook", async (req, res, next) => {
  const notificationType = String(
    req.body?.type || req.query.type || req.query.topic || ""
  ).toLowerCase();
  const paymentId = req.body?.data?.id || req.query["data.id"] || req.query.id;

  if (notificationType && notificationType !== "payment") {
    res.json({ received: true, processed: false });
    return;
  }

  if (!paymentId) {
    res.json({ received: true, processed: false });
    return;
  }

  try {
    const payment = await syncLatidosPayment(paymentId);
    res.json({ received: true, processed: true, approved: payment.approved });
  } catch (error) {
    if ([400, 404].includes(error.status)) {
      console.warn("Notificacion de Latidos ignorada:", error.message);
      res.json({ received: true, processed: false });
      return;
    }

    next(error);
  }
});

app.post("/api/latidos/registration", async (req, res, next) => {
  let client;

  try {
    const registration = sanitizeLatidosRegistration(req.body);
    const payment = await syncLatidosPayment(req.body.paymentId);

    if (!payment.approved) {
      const error = new Error("El pago todavia no esta aprobado");
      error.status = 409;
      throw error;
    }

    client = await pool.connect();
    await client.query("BEGIN");

    const orderResult = await client.query(
      `SELECT * FROM latidos_orders WHERE id = $1 FOR UPDATE`,
      [payment.orderId]
    );
    const order = orderResult.rows[0];

    if (!order || order.status !== "approved") {
      const error = new Error("No encontramos una orden aprobada para generar los boletos");
      error.status = 409;
      throw error;
    }

    const registrationResult = await client.query(
      `
        INSERT INTO latidos_registrations (
          order_id,
          name,
          origin,
          contact_name,
          age,
          email,
          phone,
          business_type
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (order_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          origin = EXCLUDED.origin,
          contact_name = EXCLUDED.contact_name,
          age = EXCLUDED.age,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          business_type = EXCLUDED.business_type,
          updated_at = now()
        RETURNING id
      `,
      [
        payment.orderId,
        registration.name,
        registration.origin,
        registration.contactName,
        registration.age,
        registration.email,
        registration.phone,
        registration.businessType
      ]
    );

    const tickets = await ensureLatidosTickets(client, order);
    await client.query("COMMIT");

    const orderToken = createLatidosSignedToken("order", order.id);
    const ticketDtos = tickets.map(latidosTicketDto);

    res.setHeader("Cache-Control", "private, no-store");
    res.status(201).json({
      ok: true,
      registrationId: registrationResult.rows[0].id,
      tickets: ticketDtos,
      pdfUrl: `/api/latidos/tickets/pdf?token=${encodeURIComponent(orderToken)}`
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    if (client) client.release();
  }
});

app.post("/api/latidos/test-ticket", authRequired, adminRequired, async (req, res, next) => {
  try {
    await getInitPromise();
    const result = await query(
      `
        INSERT INTO latidos_test_tickets (ticket_number, created_by)
        VALUES ($1, $2)
        RETURNING *
      `,
      [`LDM-PRUEBA-${crypto.randomBytes(5).toString("hex").toUpperCase()}`, req.user.id]
    );
    const ticket = latidosTestTicketDto(result.rows[0]);

    res.setHeader("Cache-Control", "private, no-store");
    res.status(201).json({
      ok: true,
      message: "Boleto de prueba creado. No autoriza el ingreso al evento.",
      ticket
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/latidos/test-tickets/:token/qr", async (req, res, next) => {
  try {
    await getInitPromise();
    const testTicketToken = readLatidosSignedToken(req.params.token, "test-ticket");

    if (!testTicketToken) {
      const error = new Error("El boleto de prueba no es valido");
      error.status = 400;
      throw error;
    }

    const ticketResult = await query(
      `SELECT id FROM latidos_test_tickets WHERE id = $1`,
      [testTicketToken.id]
    );
    if (!ticketResult.rows[0]) {
      const error = new Error("Boleto de prueba no encontrado");
      error.status = 404;
      throw error;
    }

    const image = await QRCode.toBuffer(req.params.token, {
      type: "png",
      width: 720,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#1e3323", light: "#fffdf8" }
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", image.length);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(image);
  } catch (error) {
    next(error);
  }
});

app.get("/api/latidos/tickets/:token/qr", async (req, res, next) => {
  try {
    await getInitPromise();
    const ticketToken = readLatidosSignedToken(req.params.token, "ticket");

    if (!ticketToken) {
      const error = new Error("El boleto no es valido");
      error.status = 400;
      throw error;
    }

    const ticketResult = await query(
      `SELECT id FROM latidos_tickets WHERE id = $1`,
      [ticketToken.id]
    );
    if (!ticketResult.rows[0]) {
      const error = new Error("Boleto no encontrado");
      error.status = 404;
      throw error;
    }

    const image = await QRCode.toBuffer(req.params.token, {
      type: "png",
      width: 720,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#1e3323", light: "#fffdf8" }
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Length", image.length);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(image);
  } catch (error) {
    next(error);
  }
});

app.get("/api/latidos/tickets/pdf", async (req, res, next) => {
  try {
    await getInitPromise();
    const orderToken = readLatidosSignedToken(req.query.token, "order");

    if (!orderToken) {
      const error = new Error("El enlace de descarga no es valido");
      error.status = 400;
      throw error;
    }

    const bundle = await getLatidosTicketBundle(pool, orderToken.id);
    if (!bundle || !bundle.tickets.length) {
      const error = new Error("No encontramos boletos para esta compra");
      error.status = 404;
      throw error;
    }

    await renderLatidosTicketsPdf(res, bundle);
  } catch (error) {
    next(error);
  }
});

app.post("/api/latidos/check-in", authRequired, async (req, res, next) => {
  const testTicketToken = readLatidosSignedToken(req.body.ticketToken, "test-ticket");

  if (testTicketToken) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT * FROM latidos_test_tickets WHERE id = $1 FOR UPDATE`,
        [testTicketToken.id]
      );
      const ticket = result.rows[0];

      if (!ticket) {
        await client.query("ROLLBACK");
        res.status(404).json({ valid: false, reason: "not_found", error: "Boleto de prueba no encontrado" });
        return;
      }

      const publicTicket = {
        ticketNumber: ticket.ticket_number,
        customerName: "Prueba del sistema",
        experienceName: "Validacion del escaner",
        status: ticket.status,
        usedAt: ticket.used_at || null,
        isTest: true
      };

      if (ticket.status === "used") {
        await client.query("ROLLBACK");
        res.status(409).json({
          valid: false,
          reason: "used",
          error: "Esta prueba ya fue utilizada",
          ticket: publicTicket
        });
        return;
      }

      const updated = await client.query(
        `
          UPDATE latidos_test_tickets
          SET
            status = 'used',
            used_at = now(),
            checked_in_by = $1,
            updated_at = now()
          WHERE id = $2 AND status = 'active'
          RETURNING *
        `,
        [req.user.id, ticket.id]
      );

      if (!updated.rows[0]) {
        await client.query("ROLLBACK");
        res.status(409).json({ valid: false, reason: "used", error: "Esta prueba ya fue utilizada" });
        return;
      }

      await client.query("COMMIT");
      res.setHeader("Cache-Control", "private, no-store");
      res.json({
        valid: true,
        reason: "test",
        message: "Prueba completada. El QR y el escaner funcionan; este codigo no autoriza el ingreso.",
        ticket: { ...publicTicket, status: "used", usedAt: updated.rows[0].used_at }
      });
      return;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      next(error);
      return;
    } finally {
      client.release();
    }
  }

  const ticketToken = readLatidosSignedToken(req.body.ticketToken, "ticket");
  if (!ticketToken) {
    res.status(400).json({ valid: false, reason: "invalid", error: "El codigo QR no es valido" });
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `
        SELECT
          t.*,
          o.status AS order_status,
          o.quantity AS order_quantity,
          o.experience_id,
          e.name AS experience_name,
          r.name AS registration_name
        FROM latidos_tickets t
        JOIN latidos_orders o ON o.id = t.order_id
        JOIN latidos_experiences e ON e.id = o.experience_id
        JOIN latidos_registrations r ON r.order_id = o.id
        WHERE t.id = $1
        FOR UPDATE OF t
      `,
      [ticketToken.id]
    );
    const ticket = result.rows[0];

    if (!ticket) {
      await client.query("ROLLBACK");
      res.status(404).json({ valid: false, reason: "not_found", error: "Boleto no encontrado" });
      return;
    }

    const publicTicket = {
      ticketNumber: ticket.ticket_number,
      sequence: Number(ticket.sequence),
      quantity: Number(ticket.order_quantity),
      experience: ticket.experience_id,
      experienceName: ticket.experience_name,
      customerName: ticket.registration_name,
      status: ticket.status,
      usedAt: ticket.used_at || null
    };

    if (ticket.order_status !== "approved" || ticket.status === "cancelled") {
      await client.query("ROLLBACK");
      res.status(409).json({
        valid: false,
        reason: "cancelled",
        error: "Este boleto fue cancelado o reembolsado",
        ticket: publicTicket
      });
      return;
    }

    if (ticket.status === "used") {
      await client.query("ROLLBACK");
      res.status(409).json({
        valid: false,
        reason: "used",
        error: "Este boleto ya fue utilizado",
        ticket: publicTicket
      });
      return;
    }

    const updated = await client.query(
      `
        UPDATE latidos_tickets
        SET
          status = 'used',
          used_at = now(),
          checked_in_by = $1,
          updated_at = now()
        WHERE id = $2 AND status = 'active'
        RETURNING *
      `,
      [req.user.id, ticket.id]
    );

    if (!updated.rows[0]) {
      await client.query("ROLLBACK");
      res.status(409).json({ valid: false, reason: "used", error: "Este boleto ya fue utilizado" });
      return;
    }

    await client.query("COMMIT");
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      valid: true,
      reason: "admitted",
      message: "Acceso autorizado",
      ticket: { ...publicTicket, status: "used", usedAt: updated.rows[0].used_at }
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

app.get("/api/latidos/check-in/summary", authRequired, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        e.id,
        e.name,
        COUNT(t.id)::INTEGER AS issued,
        COUNT(t.id) FILTER (WHERE t.status = 'active')::INTEGER AS active,
        COUNT(t.id) FILTER (WHERE t.status = 'used')::INTEGER AS used,
        COUNT(t.id) FILTER (WHERE t.status = 'cancelled')::INTEGER AS cancelled
      FROM latidos_experiences e
      LEFT JOIN latidos_orders o ON o.experience_id = e.id
      LEFT JOIN latidos_tickets t ON t.order_id = o.id
      GROUP BY e.id, e.name
      ORDER BY e.id
    `);

    res.setHeader("Cache-Control", "private, no-store");
    res.json({ experiences: result.rows });
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
    partySize: Number.parseInt(String(input.partySize || ""), 10),
    date: String(input.date || "").trim(),
    time: String(input.time || "").trim(),
    celebrationType: String(input.celebrationType || "").trim(),
    message: String(input.message || "").trim().slice(0, 1000)
  };

  if (!reservation.branch || !reservation.name || !reservation.phone || !Number.isInteger(reservation.partySize) || !reservation.date || !reservation.time || !reservation.celebrationType) {
    const error = new Error("Completa sucursal, nombre, telefono, numero de personas, fecha, hora y tipo de celebracion");
    error.status = 400;
    throw error;
  }

  if (!["Tepeapulco, Hidalgo", "Ciudad Sahagún, Hidalgo"].includes(reservation.branch)) {
    const error = new Error("Sucursal invalida");
    error.status = 400;
    throw error;
  }

  if (reservation.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservation.email)) {
    const error = new Error("Correo electronico invalido");
    error.status = 400;
    throw error;
  }

  if (reservation.partySize < 1 || reservation.partySize > 100) {
    const error = new Error("Numero de personas invalido");
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

  if (Number.isNaN(selectedDate.getTime()) || hours < 9 || hours > 21 || minutes < 0 || minutes > 59 || (hours === 21 && minutes > 0)) {
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
    partySize: reservation.partySize,
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
      `INSERT INTO reservations (customer_number, branch, name, email, phone, party_size, reservation_date, reservation_time, celebration_type, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        customerNumber,
        reservation.branch,
        reservation.name,
        reservation.email,
        reservation.phone,
        reservation.partySize,
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
  const rootDir = path.join(__dirname, "..");

  app.use(express.static(rootDir));

  app.get("*", (req, res) => {
    res.sendFile(path.join(rootDir, "index.html"));
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
