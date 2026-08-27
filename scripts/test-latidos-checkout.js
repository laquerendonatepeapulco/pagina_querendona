const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const pg = require("pg");

process.env.DATABASE_URL = "postgres://database-simulada/sin-red";
process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-token-simulado";
process.env.PUBLIC_SITE_URL = "https://laquerendonacg.com";
process.env.SESSION_SECRET = "secreto-seguro-para-pruebas-automatizadas-latidos";
const googleWalletKeys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const googleWalletPrivateKey = googleWalletKeys.privateKey.export({ type: "pkcs8", format: "pem" });
process.env.GOOGLE_WALLET_ISSUER_ID = "1234567890123456789";
process.env.GOOGLE_WALLET_CLASS_ID = "1234567890123456789.latidos_mexico_2026";
process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "wallet-test@latidos.invalid",
  private_key: googleWalletPrivateKey
});

const experiences = new Map([
  ["tradicional", { id: "tradicional", name: "Buffet de antojitos mexicanos", capacity: 60, price: 349 }],
  ["gastronomica", { id: "gastronomica", name: "Cena mexicana de gala", capacity: 40, price: 599 }],
  ["cortesia", { id: "cortesia", name: "Acceso especial de cortesia", capacity: 0, price: 0 }],
  ["expositor", { id: "expositor", name: "Acceso especial de expositor", capacity: 0, price: 0 }]
]);
const orders = [];
const registrations = [];
const tickets = [];
const testTickets = [];
let nextOrderId = 1;
let nextRegistrationId = 1;
let nextTicketId = 1;
let nextTestTicketId = 1;
const testUserSalt = "salt-de-prueba";
const testUser = {
  id: "00000000-0000-4000-8000-000000000001",
  username: "staff-test",
  password_hash: crypto.createHash("sha256").update(`${testUserSalt}:entrada-segura`).digest("hex"),
  salt: testUserSalt,
  name: "Personal de acceso",
  role: "admin",
  label: "Control de boletos"
};

function activeOrder(order) {
  return order.status === "approved" || (
    order.status === "reserved" && new Date(order.reserved_until).getTime() > Date.now()
  );
}

function databaseQuery(sql, params = []) {
  const query = String(sql).replace(/\s+/g, " ").trim();

  if (/SELECT COUNT\(\*\)::int AS count FROM products/i.test(query)) {
    return { rows: [{ count: 1 }], rowCount: 1 };
  }

  if (/UPDATE latidos_orders SET status = 'expired'/i.test(query)) {
    let updated = 0;
    for (const order of orders) {
      if (order.status === "reserved" && new Date(order.reserved_until).getTime() < Date.now()) {
        order.status = "expired";
        updated += 1;
      }
    }
    return { rows: [], rowCount: updated };
  }

  if (/COUNT\(t\.id\).*AS issued/i.test(query)) {
    const rows = [...experiences.values()].map((experience) => {
      const relatedOrderIds = new Set(orders.filter((order) => order.experience_id === experience.id).map((order) => order.id));
      const related = tickets.filter((ticket) => relatedOrderIds.has(ticket.order_id));
      return {
        id: experience.id,
        name: experience.name,
        issued: related.length,
        active: related.filter((ticket) => ticket.status === "active").length,
        used: related.filter((ticket) => ticket.status === "used").length,
        cancelled: related.filter((ticket) => ticket.status === "cancelled").length
      };
    });
    return { rows, rowCount: rows.length };
  }

  if (/FROM latidos_experiences e/i.test(query)) {
    const publicOnly = /WHERE e\.id IN \('tradicional', 'gastronomica'\)/i.test(query);
    const rows = [...experiences.values()].filter((experience) => (
      !publicOnly || ["tradicional", "gastronomica"].includes(experience.id)
    )).map((experience) => {
      const related = orders.filter((order) => order.experience_id === experience.id);
      return {
        ...experience,
        sold: related.filter((order) => order.status === "approved").reduce((sum, order) => sum + order.quantity, 0),
        reserved: related.filter((order) => order.status === "reserved" && activeOrder(order)).reduce((sum, order) => sum + order.quantity, 0)
      };
    });
    return { rows, rowCount: rows.length };
  }

  if (/SELECT \* FROM latidos_experiences WHERE id = \$1 FOR UPDATE/i.test(query)) {
    const experience = experiences.get(params[0]);
    return { rows: experience ? [experience] : [], rowCount: experience ? 1 : 0 };
  }

  if (/AS occupied FROM latidos_orders/i.test(query)) {
    const occupied = orders
      .filter((order) => order.experience_id === params[0] && activeOrder(order))
      .reduce((sum, order) => sum + order.quantity, 0);
    return { rows: [{ occupied }], rowCount: 1 };
  }

  if (/INSERT INTO latidos_orders/i.test(query)) {
    const isCourtesy = /'approved'/i.test(query);
    const order = {
      id: `order-${nextOrderId++}`,
      external_reference: params[0],
      experience_id: params[1],
      quantity: Number(params[2]),
      unit_price: isCourtesy ? 0 : Number(params[3]),
      total: isCourtesy ? 0 : Number(params[4]),
      status: isCourtesy ? "approved" : "reserved",
      reserved_until: isCourtesy ? null : params[5],
      mercadopago_preference_id: null,
      mercadopago_payment_id: null,
      paid_at: isCourtesy ? new Date().toISOString() : null,
      created_at: new Date().toISOString()
    };
    orders.push(order);
    return { rows: [isCourtesy ? { ...order } : { id: order.id }], rowCount: 1 };
  }

  if (/SET mercadopago_preference_id = \$1/i.test(query)) {
    const order = orders.find((item) => item.id === params[1]);
    if (order) order.mercadopago_preference_id = params[0];
    return { rows: [], rowCount: order ? 1 : 0 };
  }

  if (/UPDATE latidos_orders SET status = 'cancelled'/i.test(query)) {
    const order = orders.find((item) => item.id === params[0] && item.status === "reserved");
    if (order) order.status = "cancelled";
    return { rows: [], rowCount: order ? 1 : 0 };
  }

  if (/SELECT mercadopago_payment_id, status FROM latidos_orders WHERE id = \$1/i.test(query)) {
    const order = orders.find((item) => item.id === params[0]);
    return {
      rows: order ? [{ mercadopago_payment_id: order.mercadopago_payment_id, status: order.status }] : [],
      rowCount: order ? 1 : 0
    };
  }

  if (/SELECT \* FROM latidos_orders WHERE id = \$1 FOR UPDATE/i.test(query)) {
    const order = orders.find((item) => item.id === params[0]);
    return { rows: order ? [{ ...order }] : [], rowCount: order ? 1 : 0 };
  }

  if (/FROM latidos_orders WHERE external_reference = \$1 FOR UPDATE/i.test(query)) {
    const order = orders.find((item) => item.external_reference === params[0]);
    return { rows: order ? [{ ...order }] : [], rowCount: order ? 1 : 0 };
  }

  if (/SET mercadopago_payment_id = \$1/i.test(query)) {
    const order = orders.find((item) => item.id === params[3]);
    if (!order) return { rows: [], rowCount: 0 };
    order.mercadopago_payment_id = params[0];
    order.status = params[1];
    if (params[1] === "approved") order.paid_at = params[2] || new Date().toISOString();
    if (["approved", "cancelled", "refunded"].includes(params[1])) order.reserved_until = null;
    return { rows: [{ ...order }], rowCount: 1 };
  }

  if (/UPDATE latidos_registrations SET/i.test(query)) {
    const registration = registrations.find((item) => item.order_id === params[0]);
    if (!registration) return { rows: [], rowCount: 0 };
    Object.assign(registration, {
      name: params[1],
      origin: params[2],
      contact_name: params[3],
      age: Number(params[4]),
      email: params[5],
      phone: params[6],
      business_type: params[7]
    });
    return { rows: [{ id: registration.id }], rowCount: 1 };
  }

  if (/INSERT INTO latidos_registrations/i.test(query)) {
    const registration = {
      id: `registration-${nextRegistrationId++}`,
      order_id: params[0],
      created_at: new Date().toISOString(),
      name: params[1],
      origin: params[2],
      contact_name: params[3],
      age: Number(params[4]),
      email: params[5],
      phone: params[6],
      business_type: params[7]
    };
    registrations.push(registration);
    return { rows: [{ id: registration.id }], rowCount: 1 };
  }

  if (/INSERT INTO latidos_tickets/i.test(query)) {
    let ticket = tickets.find((item) => item.order_id === params[0] && item.sequence === Number(params[1]));
    if (!ticket) {
      ticket = {
        id: `00000000-0000-4000-8000-${String(nextTicketId++).padStart(12, "0")}`,
        order_id: params[0],
        sequence: Number(params[1]),
        ticket_number: params[2],
        experience_id: params[3],
        display_name: null,
        status: "active",
        used_at: null,
        checked_in_by: null
      };
      tickets.push(ticket);
    }
    return { rows: [], rowCount: 1 };
  }

  if (/INSERT INTO latidos_test_tickets/i.test(query)) {
    const ticket = {
      id: `10000000-0000-4000-8000-${String(nextTestTicketId++).padStart(12, "0")}`,
      ticket_number: params[0],
      status: "active",
      used_at: null,
      checked_in_by: null,
      created_by: params[1]
    };
    testTickets.push(ticket);
    return { rows: [{ ...ticket }], rowCount: 1 };
  }

  if (/SELECT id FROM latidos_test_tickets WHERE id = \$1/i.test(query)) {
    const ticket = testTickets.find((item) => item.id === params[0]);
    return { rows: ticket ? [{ id: ticket.id }] : [], rowCount: ticket ? 1 : 0 };
  }

  if (/SELECT \* FROM latidos_test_tickets WHERE id = \$1\s*$/i.test(query.trim())) {
    const ticket = testTickets.find((item) => item.id === params[0]);
    return { rows: ticket ? [{ ...ticket }] : [], rowCount: ticket ? 1 : 0 };
  }

  if (/SELECT \* FROM latidos_test_tickets WHERE id = \$1 FOR UPDATE/i.test(query)) {
    const ticket = testTickets.find((item) => item.id === params[0]);
    return { rows: ticket ? [{ ...ticket }] : [], rowCount: ticket ? 1 : 0 };
  }

  if (/UPDATE latidos_test_tickets SET status = 'used'/i.test(query)) {
    const ticket = testTickets.find((item) => item.id === params[1] && item.status === "active");
    if (!ticket) return { rows: [], rowCount: 0 };
    ticket.status = "used";
    ticket.used_at = new Date().toISOString();
    ticket.checked_in_by = params[0];
    return { rows: [{ ...ticket }], rowCount: 1 };
  }

  if (/SELECT \* FROM latidos_tickets WHERE order_id = \$1 ORDER BY sequence/i.test(query)) {
    const rows = tickets.filter((ticket) => ticket.order_id === params[0]).sort((a, b) => a.sequence - b.sequence).map((ticket) => ({ ...ticket }));
    return { rows, rowCount: rows.length };
  }

  if (/UPDATE latidos_tickets SET display_name = \$1/i.test(query)) {
    const ticket = tickets.find((item) => item.order_id === params[1] && item.sequence === Number(params[2]));
    if (!ticket) return { rows: [], rowCount: 0 };
    ticket.display_name = params[0] || null;
    return { rows: [], rowCount: 1 };
  }

  if (/FROM latidos_orders o JOIN latidos_experiences e ON e\.id = o\.experience_id LEFT JOIN latidos_registrations r/i.test(query)) {
    const rows = orders
      .filter((order) => order.paid_at)
      .sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at))
      .map((order) => {
        const experience = experiences.get(order.experience_id);
        const registration = registrations.find((item) => item.order_id === order.id);
        const relatedTickets = tickets.filter((ticket) => ticket.order_id === order.id);
        return {
          order_id: order.id,
          mercadopago_payment_id: order.mercadopago_payment_id,
          experience_id: order.experience_id,
          experience_name: experience.name,
          quantity: order.quantity,
          unit_price: order.unit_price,
          total: order.total,
          payment_status: order.status,
          paid_at: order.paid_at,
          order_created_at: order.created_at,
          registration_id: registration?.id || null,
          registration_name: registration?.name || null,
          registration_origin: registration?.origin || null,
          registration_contact_name: registration?.contact_name || null,
          registration_age: registration?.age ?? null,
          registration_email: registration?.email || null,
          registration_phone: registration?.phone || null,
          registration_business_type: registration?.business_type || null,
          registration_created_at: registration?.created_at || null,
          tickets_issued: relatedTickets.length,
          tickets_active: relatedTickets.filter((ticket) => ticket.status === "active").length,
          tickets_used: relatedTickets.filter((ticket) => ticket.status === "used").length,
          tickets_cancelled: relatedTickets.filter((ticket) => ticket.status === "cancelled").length
        };
      });
    return { rows, rowCount: rows.length };
  }

  if (/FROM latidos_orders o JOIN latidos_experiences e/i.test(query)) {
    const order = orders.find((item) => item.id === params[0]);
    const registration = registrations.find((item) => item.order_id === params[0]);
    const experience = order ? experiences.get(order.experience_id) : null;
    if (!order || !registration || !experience) return { rows: [], rowCount: 0 };
    return {
      rows: [{
        ...order,
        experience_name: experience.name,
        registration_name: registration.name,
        registration_email: registration.email,
        registration_phone: registration.phone
      }],
      rowCount: 1
    };
  }

  if (/SELECT id(?:, experience_id)? FROM latidos_tickets WHERE id = \$1/i.test(query)) {
    const ticket = tickets.find((item) => item.id === params[0]);
    return {
      rows: ticket ? [{ id: ticket.id, experience_id: ticket.experience_id }] : [],
      rowCount: ticket ? 1 : 0
    };
  }

  if (/FROM latidos_tickets t JOIN latidos_orders o/i.test(query)) {
    const ticket = tickets.find((item) => item.id === params[0]);
    const order = ticket ? orders.find((item) => item.id === ticket.order_id) : null;
    const experience = order ? experiences.get(order.experience_id) : null;
    const registration = order ? registrations.find((item) => item.order_id === order.id) : null;
    if (!ticket || !order || !experience || !registration) return { rows: [], rowCount: 0 };
    return {
      rows: [{
        ...ticket,
        order_status: order.status,
        order_quantity: order.quantity,
        experience_id: experience.id,
        experience_name: experience.name,
        registration_name: registration.name
      }],
      rowCount: 1
    };
  }

  if (/UPDATE latidos_tickets SET status = 'used'/i.test(query)) {
    const ticket = tickets.find((item) => item.id === params[1] && item.status === "active");
    if (!ticket) return { rows: [], rowCount: 0 };
    ticket.status = "used";
    ticket.used_at = new Date().toISOString();
    ticket.checked_in_by = params[0];
    return { rows: [{ ...ticket }], rowCount: 1 };
  }

  if (/UPDATE latidos_tickets SET status = 'cancelled'/i.test(query)) {
    let count = 0;
    tickets.forEach((ticket) => {
      if (ticket.order_id === params[0] && ticket.status === "active") {
        ticket.status = "cancelled";
        count += 1;
      }
    });
    return { rows: [], rowCount: count };
  }

  if (/SELECT \* FROM users WHERE username = \$1/i.test(query)) {
    const found = params[0] === testUser.username ? testUser : null;
    return { rows: found ? [{ ...found }] : [], rowCount: found ? 1 : 0 };
  }

  return { rows: [], rowCount: 0 };
}

class FakePool {
  async query(sql, params) {
    return databaseQuery(sql, params);
  }

  async connect() {
    return {
      query: async (sql, params) => databaseQuery(sql, params),
      release() {}
    };
  }
}

pg.Pool = FakePool;

let latestReference = "";
let paymentAmount = 1797;
let paymentStatus = "approved";
let failNextPreference = false;
const mercadoPagoCalls = [];

global.fetch = async (url, options = {}) => {
  mercadoPagoCalls.push({ url: String(url), options });

  if (String(url).endsWith("/checkout/preferences")) {
    if (failNextPreference) {
      failNextPreference = false;
      return { ok: false, status: 500, json: async () => ({ message: "fallo simulado" }) };
    }

    const body = JSON.parse(options.body);
    latestReference = body.external_reference;
    return {
      ok: true,
      status: 201,
      json: async () => ({
        id: `pref-test-${orders.length}`,
        init_point: "https://example.invalid/checkout-simulado"
      })
    };
  }

  if (/\/v1\/payments\/\d+$/.test(String(url))) {
    const id = String(url).split("/").pop();
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id,
        status: paymentStatus,
        transaction_amount: paymentAmount,
        currency_id: "MXN",
        external_reference: latestReference,
        date_approved: paymentStatus === "approved" ? "2026-08-20T12:00:00.000-06:00" : null
      })
    };
  }

  throw new Error(`Solicitud externa inesperada: ${url}`);
};

const app = require("../inventario/server");

function request(server, method, requestPath, body, options = {}) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const payload = body ? JSON.stringify(body) : "";
    const req = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path: requestPath,
      method,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...(options.headers || {})
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => { chunks.push(Buffer.from(chunk)); });
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const contentType = String(res.headers["content-type"] || "");
        const responseBody = contentType.includes("application/json") ? JSON.parse(buffer.toString("utf8")) : buffer;
        resolve({ status: res.statusCode, body: responseBody, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function validateInlineScripts() {
  const htmlPath = path.resolve(__dirname, "..", "latidos-de-mexico.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const scripts = [...html.matchAll(/<script(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length >= 2, "Deben existir los scripts de animacion y checkout");
  scripts.forEach((match, index) => new vm.Script(match[1], { filename: `latidos-inline-${index + 1}.js` }));
  assert.ok(html.includes("latidosPaymentRecovery"), "El pago aprobado debe poder recuperarse despues de recargar");
  assert.ok(html.includes("collection_status"), "El regreso debe reconocer el estado oficial de Mercado Pago");
  assert.ok(html.includes("/api/latidos/payment-return"), "El regreso debe tener recuperacion por orden firmada");
  assert.ok(html.includes('id="payment-success-heading"'), "El regreso aprobado debe mostrar un encabezado de confirmacion");
  assert.ok(html.includes("PAGO EXITOSO"), "El regreso aprobado debe confirmar el pago de forma visible");
  assert.ok(html.includes("LLENA EL FORMULARIO PARA QUE SE OTORGUE SU BOLETO DE ACCESO (QR)"), "La confirmacion debe indicar que el formulario genera los boletos QR");
  assert.ok(html.includes("paymentSuccessHeading.scrollIntoView"), "El regreso aprobado debe llevar directamente al formulario");
  assert.ok(html.includes("fragmentParams"), "Los regresos antiguos deben recuperar parametros ubicados despues del fragmento");
  assert.ok(html.includes("google-wallet-button"), "Cada boleto debe mostrar la opcion de Google Wallet cuando esta configurada");
  assert.ok(fs.existsSync(path.resolve(__dirname, "..", "img", "google-wallet-es419.svg")), "Debe usarse el boton oficial de Google Wallet");
}

function validateScannerScript() {
  const scriptPath = path.resolve(__dirname, "..", "latidos-scanner.js");
  const htmlPath = path.resolve(__dirname, "..", "latidos-scanner.html");
  new vm.Script(fs.readFileSync(scriptPath, "utf8"), { filename: "latidos-scanner.js" });
  assert.ok(fs.readFileSync(htmlPath, "utf8").includes('id="photo-scanner"'), "El escaner debe ofrecer captura por fotografia");
  assert.ok(fs.readFileSync(htmlPath, "utf8").includes("latidos-registros.html"), "El administrador debe poder abrir los registros desde el escaner");

  const recordsScriptPath = path.resolve(__dirname, "..", "latidos-registros.js");
  const recordsHtmlPath = path.resolve(__dirname, "..", "latidos-registros.html");
  const recordsHtml = fs.readFileSync(recordsHtmlPath, "utf8");
  new vm.Script(fs.readFileSync(recordsScriptPath, "utf8"), { filename: "latidos-registros.js" });
  assert.ok(recordsHtml.includes('name="robots" content="noindex,nofollow,noarchive"'), "La pagina de registros no debe indexarse");
  assert.ok(recordsHtml.includes('id="export-records"'), "La pagina de registros debe permitir exportar CSV");
  const recordsScript = fs.readFileSync(recordsScriptPath, "utf8");
  assert.ok(recordsScript.includes("/api/latidos/registrations"), "La pagina debe consultar la API privada de registros");
  assert.ok(recordsScript.includes("URL.createObjectURL"), "La pagina debe generar el archivo CSV localmente");
  assert.ok(recordsScript.includes("if (/^[=+\\-@]/.test(text))"), "La exportacion CSV debe neutralizar formulas peligrosas");
}

function validateLegacyDatabaseCompatibility() {
  const serverSource = fs.readFileSync(path.resolve(__dirname, "..", "inventario", "server.js"), "utf8");
  assert.ok(!serverSource.includes("ON CONFLICT (order_id, sequence)"), "La emision debe funcionar aunque la tabla antigua no tenga UNIQUE(order_id, sequence)");
  assert.ok(!serverSource.includes("ON CONFLICT (order_id)"), "El registro debe funcionar aunque la tabla antigua no tenga UNIQUE(order_id)");
  assert.ok(/INSERT INTO latidos_tickets[\s\S]*?experience_id[\s\S]*?SELECT \$1, \$2, \$3, 'active', \$4/.test(serverSource), "La emision debe completar experience_id requerido por la tabla antigua");
  assert.ok(serverSource.includes("DROP CONSTRAINT IF EXISTS latidos_tickets_status_check"), "La migracion debe reemplazar la restriccion historica de estados");
}

async function run() {
  validateInlineScripts();
  validateScannerScript();
  validateLegacyDatabaseCompatibility();
  const previewPort = Number.parseInt(process.env.LATIDOS_TEST_PREVIEW_PORT || "0", 10);
  if (process.env.LATIDOS_TEST_KEEP_OPEN === "1") {
    app.use(require("express").static(path.resolve(__dirname, "..")));
  }
  const server = app.listen(Number.isInteger(previewPort) ? previewPort : 0);

  try {
    const initialAvailability = await request(server, "GET", "/api/latidos/availability");
    assert.strictEqual(initialAvailability.status, 200);
    assert.strictEqual(initialAvailability.body.experiences.tradicional.available, 60);
    assert.strictEqual(initialAvailability.body.experiences.gastronomica.available, 40);

    const checkout = await request(server, "POST", "/api/latidos/checkout", {
      experience: "gastronomica",
      quantity: 3
    });
    assert.strictEqual(checkout.status, 201);
    assert.strictEqual(checkout.body.total, 1797);
    assert.strictEqual(checkout.body.checkoutUrl, "https://example.invalid/checkout-simulado");
    assert.ok(checkout.body.returnToken.startsWith("lt1."));

    const preferenceCall = mercadoPagoCalls.find((call) => call.url.endsWith("/checkout/preferences"));
    const preferenceBody = JSON.parse(preferenceCall.options.body);
    assert.strictEqual(preferenceBody.items[0].unit_price, 599);
    assert.strictEqual(preferenceBody.items[0].quantity, 3);
    assert.strictEqual(preferenceBody.auto_return, "approved");
    assert.strictEqual(preferenceBody.expires, true);
    assert.ok(preferenceBody.expiration_date_to);
    assert.strictEqual(preferenceBody.notification_url, "https://laquerendonacg.com/api/latidos/webhook");
    assert.ok(preferenceBody.back_urls.success.includes("payment=success"));
    assert.ok(preferenceBody.back_urls.success.includes("order_token="));
    assert.ok(!preferenceBody.back_urls.success.includes("#"));

    const pendingReturn = await request(
      server,
      "GET",
      `/api/latidos/payment-return?order_token=${encodeURIComponent(checkout.body.returnToken)}`
    );
    assert.strictEqual(pendingReturn.status, 200);
    assert.strictEqual(pendingReturn.body.approved, false);
    assert.strictEqual(pendingReturn.body.status, "pending");

    const invalidReturn = await request(server, "GET", "/api/latidos/payment-return?order_token=lt1.alterado.falso");
    assert.strictEqual(invalidReturn.status, 400);

    const reservedAvailability = await request(server, "GET", "/api/latidos/availability");
    assert.strictEqual(reservedAvailability.body.experiences.gastronomica.reserved, 3);
    assert.strictEqual(reservedAvailability.body.experiences.gastronomica.available, 37);

    const overCapacity = await request(server, "POST", "/api/latidos/checkout", {
      experience: "gastronomica",
      quantity: 38
    });
    assert.strictEqual(overCapacity.status, 409);

    const invalid = await request(server, "POST", "/api/latidos/checkout", {
      experience: "tradicional",
      quantity: 51
    });
    assert.strictEqual(invalid.status, 400);

    const payment = await request(server, "GET", "/api/latidos/payment?payment_id=123456789");
    assert.strictEqual(payment.status, 200);
    assert.strictEqual(payment.body.approved, true);
    assert.strictEqual(payment.body.experience, "gastronomica");
    assert.strictEqual(payment.body.quantity, 3);
    assert.strictEqual(payment.body.amount, 1797);
    assert.strictEqual(orders[0].status, "approved");
    assert.strictEqual(orders[0].reserved_until, null);

    const recoveredPayment = await request(
      server,
      "GET",
      `/api/latidos/payment-return?order_token=${encodeURIComponent(checkout.body.returnToken)}`
    );
    assert.strictEqual(recoveredPayment.status, 200);
    assert.strictEqual(recoveredPayment.body.approved, true);
    assert.strictEqual(recoveredPayment.body.paymentId, "123456789");
    assert.strictEqual(recoveredPayment.body.quantity, 3);

    const soldAvailability = await request(server, "GET", "/api/latidos/availability");
    assert.strictEqual(soldAvailability.body.experiences.gastronomica.sold, 3);
    assert.strictEqual(soldAvailability.body.experiences.gastronomica.reserved, 0);
    assert.strictEqual(soldAvailability.body.experiences.gastronomica.available, 37);

    const webhook = await request(server, "POST", "/api/latidos/webhook", {
      type: "payment",
      data: { id: "123456789" }
    });
    assert.strictEqual(webhook.status, 200);
    assert.strictEqual(webhook.body.processed, true);
    assert.strictEqual(orders.length, 1);

    const unauthorizedRegistrations = await request(server, "GET", "/api/latidos/registrations");
    assert.strictEqual(unauthorizedRegistrations.status, 401);

    testUser.role = "staff";
    const staffLogin = await request(server, "POST", "/api/auth/login", {
      username: "staff-test",
      password: "entrada-segura"
    });
    testUser.role = "admin";
    const staffRegistrations = await request(server, "GET", "/api/latidos/registrations", null, {
      headers: { Authorization: `Bearer ${staffLogin.body.token}` }
    });
    assert.strictEqual(staffRegistrations.status, 403);
    const staffCourtesy = await request(server, "POST", "/api/latidos/courtesy-batches", {
      batchKey: "cortesia-premium-2026",
      quantity: 20
    }, { headers: { Authorization: `Bearer ${staffLogin.body.token}` } });
    assert.strictEqual(staffCourtesy.status, 403);
    const staffExhibitor = await request(server, "POST", "/api/latidos/exhibitor-batches", {
      batchKey: "expositores-premium-2026",
      quantity: 20
    }, { headers: { Authorization: `Bearer ${staffLogin.body.token}` } });
    assert.strictEqual(staffExhibitor.status, 403);
    const staffExhibitorLabels = await request(server, "PUT", "/api/latidos/exhibitor-batches/expositores-premium-2026/labels", {
      labels: ["Bajo Cero"]
    }, { headers: { Authorization: `Bearer ${staffLogin.body.token}` } });
    assert.strictEqual(staffExhibitorLabels.status, 403);

    const login = await request(server, "POST", "/api/auth/login", {
      username: "staff-test",
      password: "entrada-segura"
    });
    assert.strictEqual(login.status, 200);
    assert.ok(login.body.token);
    const authHeaders = { Authorization: `Bearer ${login.body.token}` };

    const pendingRegistrationList = await request(server, "GET", "/api/latidos/registrations", null, { headers: authHeaders });
    assert.strictEqual(pendingRegistrationList.status, 200);
    assert.strictEqual(pendingRegistrationList.body.orders.length, 1);
    assert.strictEqual(pendingRegistrationList.body.orders[0].paymentStatus, "approved");
    assert.strictEqual(pendingRegistrationList.body.orders[0].registration, null);
    assert.strictEqual(pendingRegistrationList.body.orders[0].tickets.issued, 0);

    const registrationPayload = {
      paymentId: "123456789",
      name: "Cliente de prueba",
      origin: "Tepeapulco, Hidalgo",
      contactName: "Contacto de prueba",
      age: 35,
      email: "prueba@example.com",
      phone: "7711234567",
      businessType: "servicio"
    };
    const registration = await request(server, "POST", "/api/latidos/registration", registrationPayload);
    assert.strictEqual(registration.status, 201);
    assert.strictEqual(registration.body.ok, true);
    assert.strictEqual(registrations.length, 1);
    assert.strictEqual(registration.body.tickets.length, 3);
    assert.strictEqual(new Set(registration.body.tickets.map((ticket) => ticket.ticketNumber)).size, 3);
    assert.ok(registration.body.pdfUrl.startsWith("/api/latidos/tickets/pdf?token="));
    assert.strictEqual(tickets.length, 3);

    const completedRegistrationList = await request(server, "GET", "/api/latidos/registrations", null, { headers: authHeaders });
    assert.strictEqual(completedRegistrationList.status, 200);
    assert.ok(String(completedRegistrationList.headers["cache-control"]).includes("no-store"));
    assert.strictEqual(completedRegistrationList.body.orders[0].registration.name, "Cliente de prueba");
    assert.strictEqual(completedRegistrationList.body.orders[0].registration.phone, "7711234567");
    assert.strictEqual(completedRegistrationList.body.orders[0].tickets.issued, 3);

    const qr = await request(server, "GET", registration.body.tickets[0].qrUrl);
    assert.strictEqual(qr.status, 200);
    assert.strictEqual(qr.headers["content-type"], "image/png");
    assert.deepStrictEqual([...qr.body.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

    assert.ok(registration.body.tickets[0].walletUrl.endsWith("/wallet"));
    const wallet = await request(server, "GET", registration.body.tickets[0].walletUrl);
    assert.strictEqual(wallet.status, 302);
    assert.ok(wallet.headers.location.startsWith("https://pay.google.com/gp/v/save/"));
    assert.ok(wallet.headers.location.length < 1800);
    assert.ok(wallet.headers.location.length < 1800, "El enlace de Google Wallet debe mantenerse dentro del largo seguro");

    const walletToken = wallet.headers.location.split("/").at(-1);
    const [walletHeader, walletPayload, walletSignature] = walletToken.split(".");
    const walletClaims = JSON.parse(Buffer.from(walletPayload, "base64url").toString("utf8"));
    assert.ok(crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${walletHeader}.${walletPayload}`),
      googleWalletKeys.publicKey,
      Buffer.from(walletSignature, "base64url")
    ));
    assert.strictEqual(walletClaims.iss, "wallet-test@latidos.invalid");
    assert.strictEqual(walletClaims.aud, "google");
    assert.strictEqual(walletClaims.typ, "savetowallet");
    assert.deepStrictEqual(walletClaims.origins, ["laquerendonacg.com"]);
    assert.strictEqual(walletClaims.payload.eventTicketObjects.length, 1);
    assert.strictEqual(walletClaims.payload.eventTicketObjects[0].ticketNumber, registration.body.tickets[0].ticketNumber);
    assert.strictEqual(walletClaims.payload.eventTicketObjects[0].barcode.value, registration.body.tickets[0].token);
    assert.strictEqual(walletClaims.payload.eventTicketObjects[0].ticketHolderName, "Cliente de prueba");
    assert.strictEqual(walletClaims.payload.eventTicketObjects[0].seatInfo.section.defaultValue.value, "Cena mexicana de gala");
    assert.strictEqual(walletClaims.payload.eventTicketObjects[0].seatInfo.row.defaultValue.value, "General");
    assert.strictEqual(walletClaims.payload.eventTicketObjects[0].seatInfo.seat.defaultValue.value, "1");

    const pdf = await request(server, "GET", registration.body.pdfUrl);
    assert.strictEqual(pdf.status, 200);
    assert.ok(String(pdf.headers["content-type"]).includes("application/pdf"));
    assert.strictEqual(pdf.body.subarray(0, 4).toString("ascii"), "%PDF");
    if (process.env.LATIDOS_TEST_PDF_OUTPUT) {
      fs.mkdirSync(path.dirname(process.env.LATIDOS_TEST_PDF_OUTPUT), { recursive: true });
      fs.writeFileSync(process.env.LATIDOS_TEST_PDF_OUTPUT, pdf.body);
    }

    const updatedRegistration = await request(server, "POST", "/api/latidos/registration", {
      ...registrationPayload,
      origin: "Pachuca, Hidalgo"
    });
    assert.strictEqual(updatedRegistration.status, 201);
    assert.strictEqual(registrations.length, 1);
    assert.strictEqual(tickets.length, 3);
    assert.strictEqual(registrations[0].origin, "Pachuca, Hidalgo");

    const mercadoPagoCallsBeforeCourtesy = mercadoPagoCalls.length;
    const courtesy = await request(server, "POST", "/api/latidos/courtesy-batches", {
      batchKey: "cortesia-premium-2026",
      quantity: 20
    }, { headers: authHeaders });
    assert.strictEqual(courtesy.status, 201);
    assert.strictEqual(courtesy.body.created, true);
    assert.strictEqual(courtesy.body.quantity, 20);
    assert.strictEqual(courtesy.body.tickets.length, 20);
    assert.strictEqual(new Set(courtesy.body.tickets.map((ticket) => ticket.ticketNumber)).size, 20);
    assert.ok(courtesy.body.tickets.every((ticket) => ticket.ticketNumber.startsWith("LDM-C-")));
    assert.strictEqual(orders.length, 2);
    assert.strictEqual(registrations.length, 2);
    assert.strictEqual(tickets.length, 23);
    assert.strictEqual(mercadoPagoCalls.length, mercadoPagoCallsBeforeCourtesy);

    const repeatedCourtesy = await request(server, "POST", "/api/latidos/courtesy-batches", {
      batchKey: "cortesia-premium-2026",
      quantity: 20
    }, { headers: authHeaders });
    assert.strictEqual(repeatedCourtesy.status, 200);
    assert.strictEqual(repeatedCourtesy.body.created, false);
    assert.deepStrictEqual(
      repeatedCourtesy.body.tickets.map((ticket) => ticket.ticketNumber),
      courtesy.body.tickets.map((ticket) => ticket.ticketNumber)
    );
    assert.strictEqual(tickets.length, 23);

    const availabilityAfterCourtesy = await request(server, "GET", "/api/latidos/availability");
    assert.deepStrictEqual(Object.keys(availabilityAfterCourtesy.body.experiences).sort(), ["gastronomica", "tradicional"]);
    assert.strictEqual(availabilityAfterCourtesy.body.experiences.tradicional.available, 60);
    assert.strictEqual(availabilityAfterCourtesy.body.experiences.gastronomica.available, 37);

    const courtesyQr = await request(server, "GET", courtesy.body.tickets[0].qrUrl);
    assert.strictEqual(courtesyQr.status, 200);
    assert.strictEqual(courtesyQr.headers["content-type"], "image/png");
    assert.deepStrictEqual([...courtesyQr.body.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

    const courtesyPdf = await request(server, "GET", courtesy.body.pdfUrl);
    assert.strictEqual(courtesyPdf.status, 200);
    assert.ok(String(courtesyPdf.headers["content-type"]).includes("application/pdf"));
    assert.ok(String(courtesyPdf.headers["content-disposition"]).includes("cortesias-premium"));
    assert.strictEqual(courtesyPdf.body.subarray(0, 4).toString("ascii"), "%PDF");
    if (process.env.LATIDOS_TEST_COURTESY_PDF_OUTPUT) {
      fs.mkdirSync(path.dirname(process.env.LATIDOS_TEST_COURTESY_PDF_OUTPUT), { recursive: true });
      fs.writeFileSync(process.env.LATIDOS_TEST_COURTESY_PDF_OUTPUT, courtesyPdf.body);
    }

    const courtesyCheckIn = await request(server, "POST", "/api/latidos/check-in", {
      ticketToken: courtesy.body.tickets[0].token
    }, { headers: authHeaders });
    assert.strictEqual(courtesyCheckIn.status, 200);
    assert.strictEqual(courtesyCheckIn.body.valid, true);
    assert.strictEqual(courtesyCheckIn.body.ticket.experience, "cortesia");
    assert.strictEqual(courtesyCheckIn.body.ticket.customerName, "Cortesía");

    const duplicateCourtesyCheckIn = await request(server, "POST", "/api/latidos/check-in", {
      ticketToken: courtesy.body.tickets[0].token
    }, { headers: authHeaders });
    assert.strictEqual(duplicateCourtesyCheckIn.status, 409);
    assert.strictEqual(duplicateCourtesyCheckIn.body.reason, "used");

    const mercadoPagoCallsBeforeExhibitors = mercadoPagoCalls.length;
    const exhibitors = await request(server, "POST", "/api/latidos/exhibitor-batches", {
      batchKey: "expositores-premium-2026",
      quantity: 20
    }, { headers: authHeaders });
    assert.strictEqual(exhibitors.status, 201);
    assert.strictEqual(exhibitors.body.created, true);
    assert.strictEqual(exhibitors.body.quantity, 20);
    assert.strictEqual(exhibitors.body.tickets.length, 20);
    assert.strictEqual(new Set(exhibitors.body.tickets.map((ticket) => ticket.ticketNumber)).size, 20);
    assert.ok(exhibitors.body.tickets.every((ticket) => ticket.ticketNumber.startsWith("LDM-E-")));
    assert.strictEqual(orders.length, 3);
    assert.strictEqual(registrations.length, 3);
    assert.strictEqual(tickets.length, 43);

    const exhibitorNames = [
      "Bajo Cero",
      "Capital Mujer",
      "CEOM (Clínica de Especialidades Odontológicas y Médicas)",
      "Hannae",
      "La Querendona",
      "Teen Universe Hidalgo",
      "Zinzino",
      "Ex Hacienda El Zoquital"
    ];
    const originalExhibitorTokens = exhibitors.body.tickets.map((ticket) => ticket.token);
    const originalExhibitorNumbers = exhibitors.body.tickets.map((ticket) => ticket.ticketNumber);
    const labeledExhibitors = await request(server, "PUT", "/api/latidos/exhibitor-batches/expositores-premium-2026/labels", {
      labels: exhibitorNames
    }, { headers: authHeaders });
    assert.strictEqual(labeledExhibitors.status, 200);
    assert.strictEqual(labeledExhibitors.body.quantity, 20);
    assert.strictEqual(labeledExhibitors.body.updated, 8);
    assert.deepStrictEqual(labeledExhibitors.body.tickets.slice(0, 8).map((ticket) => ticket.displayName), exhibitorNames);
    assert.ok(labeledExhibitors.body.tickets.slice(8).every((ticket) => ticket.displayName === null));
    assert.deepStrictEqual(labeledExhibitors.body.tickets.map((ticket) => ticket.token), originalExhibitorTokens);
    assert.deepStrictEqual(labeledExhibitors.body.tickets.map((ticket) => ticket.ticketNumber), originalExhibitorNumbers);
    assert.strictEqual(orders.length, 3);
    assert.strictEqual(tickets.length, 43);
    assert.strictEqual(mercadoPagoCalls.length, mercadoPagoCallsBeforeExhibitors);

    const repeatedExhibitors = await request(server, "POST", "/api/latidos/exhibitor-batches", {
      batchKey: "expositores-premium-2026",
      quantity: 20
    }, { headers: authHeaders });
    assert.strictEqual(repeatedExhibitors.status, 200);
    assert.strictEqual(repeatedExhibitors.body.created, false);
    assert.deepStrictEqual(
      repeatedExhibitors.body.tickets.map((ticket) => ticket.ticketNumber),
      exhibitors.body.tickets.map((ticket) => ticket.ticketNumber)
    );
    assert.strictEqual(tickets.length, 43);

    const availabilityAfterExhibitors = await request(server, "GET", "/api/latidos/availability");
    assert.deepStrictEqual(Object.keys(availabilityAfterExhibitors.body.experiences).sort(), ["gastronomica", "tradicional"]);
    assert.strictEqual(availabilityAfterExhibitors.body.experiences.tradicional.available, 60);
    assert.strictEqual(availabilityAfterExhibitors.body.experiences.gastronomica.available, 37);

    const exhibitorQr = await request(server, "GET", exhibitors.body.tickets[0].qrUrl);
    assert.strictEqual(exhibitorQr.status, 200);
    assert.strictEqual(exhibitorQr.headers["content-type"], "image/png");
    assert.deepStrictEqual([...exhibitorQr.body.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

    const exhibitorPdf = await request(server, "GET", labeledExhibitors.body.pdfUrl);
    assert.strictEqual(exhibitorPdf.status, 200);
    assert.ok(String(exhibitorPdf.headers["content-type"]).includes("application/pdf"));
    assert.ok(String(exhibitorPdf.headers["content-disposition"]).includes("expositores-premium"));
    assert.strictEqual(exhibitorPdf.body.subarray(0, 4).toString("ascii"), "%PDF");
    if (process.env.LATIDOS_TEST_EXHIBITOR_PDF_OUTPUT) {
      fs.mkdirSync(path.dirname(process.env.LATIDOS_TEST_EXHIBITOR_PDF_OUTPUT), { recursive: true });
      fs.writeFileSync(process.env.LATIDOS_TEST_EXHIBITOR_PDF_OUTPUT, exhibitorPdf.body);
    }

    const exhibitorCheckIn = await request(server, "POST", "/api/latidos/check-in", {
      ticketToken: exhibitors.body.tickets[0].token
    }, { headers: authHeaders });
    assert.strictEqual(exhibitorCheckIn.status, 200);
    assert.strictEqual(exhibitorCheckIn.body.valid, true);
    assert.strictEqual(exhibitorCheckIn.body.ticket.experience, "expositor");
    assert.strictEqual(exhibitorCheckIn.body.ticket.customerName, "Expositor");

    const duplicateExhibitorCheckIn = await request(server, "POST", "/api/latidos/check-in", {
      ticketToken: exhibitors.body.tickets[0].token
    }, { headers: authHeaders });
    assert.strictEqual(duplicateExhibitorCheckIn.status, 409);
    assert.strictEqual(duplicateExhibitorCheckIn.body.reason, "used");

    const mercadoPagoCallsBeforeTestTicket = mercadoPagoCalls.length;
    const testTicket = await request(server, "POST", "/api/latidos/test-ticket", {}, { headers: authHeaders });
    assert.strictEqual(testTicket.status, 201);
    assert.strictEqual(testTicket.body.ticket.isTest, true);
    assert.strictEqual(testTicket.body.ticket.status, "active");
    assert.ok(testTicket.body.ticket.walletUrl.endsWith("/wallet"));
    assert.strictEqual(testTickets.length, 1);
    assert.strictEqual(mercadoPagoCalls.length, mercadoPagoCallsBeforeTestTicket);

    const testQr = await request(server, "GET", testTicket.body.ticket.qrUrl);
    assert.strictEqual(testQr.status, 200);
    assert.strictEqual(testQr.headers["content-type"], "image/png");
    assert.deepStrictEqual([...testQr.body.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

    const testWallet = await request(server, "GET", testTicket.body.ticket.walletUrl);
    assert.strictEqual(testWallet.status, 302);
    assert.ok(testWallet.headers.location.startsWith("https://pay.google.com/gp/v/save/"));
    assert.ok(testWallet.headers.location.length < 1800);
    const testWalletToken = testWallet.headers.location.split("/").at(-1);
    const testWalletPayload = testWalletToken.split(".")[1];
    const testWalletClaims = JSON.parse(Buffer.from(testWalletPayload, "base64url").toString("utf8"));
    assert.strictEqual(testWalletClaims.payload.eventTicketObjects[0].ticketNumber, testTicket.body.ticket.ticketNumber);
    assert.strictEqual(testWalletClaims.payload.eventTicketObjects[0].ticketHolderName, "Boleto de prueba");
    assert.strictEqual(testWalletClaims.payload.eventTicketObjects[0].barcode.value, testTicket.body.ticket.token);
    assert.strictEqual(testWalletClaims.payload.eventTicketObjects[0].seatInfo.section.defaultValue.value, "Acceso de demostracion");
    assert.strictEqual(testWalletClaims.payload.eventTicketObjects[0].seatInfo.row.defaultValue.value, "General");
    assert.strictEqual(testWalletClaims.payload.eventTicketObjects[0].seatInfo.seat.defaultValue.value, "1");
    assert.strictEqual(mercadoPagoCalls.length, mercadoPagoCallsBeforeTestTicket);

    const testCheckIn = await request(server, "POST", "/api/latidos/check-in", {
      ticketToken: testTicket.body.ticket.token
    }, { headers: authHeaders });
    assert.strictEqual(testCheckIn.status, 200);
    assert.strictEqual(testCheckIn.body.reason, "test");
    assert.strictEqual(testCheckIn.body.ticket.isTest, true);
    assert.strictEqual(testTickets[0].status, "used");

    const duplicateTestCheckIn = await request(server, "POST", "/api/latidos/check-in", {
      ticketToken: testTicket.body.ticket.token
    }, { headers: authHeaders });
    assert.strictEqual(duplicateTestCheckIn.status, 409);
    assert.strictEqual(duplicateTestCheckIn.body.reason, "used");

    const firstCheckIn = await request(server, "POST", "/api/latidos/check-in", {
      ticketToken: registration.body.tickets[0].token
    }, { headers: authHeaders });
    assert.strictEqual(firstCheckIn.status, 200);
    assert.strictEqual(firstCheckIn.body.valid, true);
    assert.strictEqual(tickets[0].status, "used");

    const duplicateCheckIn = await request(server, "POST", "/api/latidos/check-in", {
      ticketToken: registration.body.tickets[0].token
    }, { headers: authHeaders });
    assert.strictEqual(duplicateCheckIn.status, 409);
    assert.strictEqual(duplicateCheckIn.body.reason, "used");

    const invalidCheckIn = await request(server, "POST", "/api/latidos/check-in", {
      ticketToken: "codigo-alterado"
    }, { headers: authHeaders });
    assert.strictEqual(invalidCheckIn.status, 400);
    assert.strictEqual(invalidCheckIn.body.reason, "invalid");

    const summary = await request(server, "GET", "/api/latidos/check-in/summary", null, { headers: authHeaders });
    assert.strictEqual(summary.status, 200);
    const gastronomicaSummary = summary.body.experiences.find((item) => item.id === "gastronomica");
    assert.strictEqual(gastronomicaSummary.issued, 3);
    assert.strictEqual(gastronomicaSummary.used, 1);
    assert.strictEqual(gastronomicaSummary.active, 2);
    const courtesySummary = summary.body.experiences.find((item) => item.id === "cortesia");
    assert.strictEqual(courtesySummary.issued, 20);
    assert.strictEqual(courtesySummary.used, 1);
    assert.strictEqual(courtesySummary.active, 19);
    const exhibitorSummary = summary.body.experiences.find((item) => item.id === "expositor");
    assert.strictEqual(exhibitorSummary.issued, 20);
    assert.strictEqual(exhibitorSummary.used, 1);
    assert.strictEqual(exhibitorSummary.active, 19);

    paymentAmount = 1;
    const mismatchedPayment = await request(server, "GET", "/api/latidos/payment?payment_id=987654321");
    assert.strictEqual(mismatchedPayment.status, 400);
    assert.strictEqual(orders[0].status, "approved");
    paymentAmount = 1797;

    failNextPreference = true;
    const failedCheckout = await request(server, "POST", "/api/latidos/checkout", {
      experience: "tradicional",
      quantity: 1
    });
    assert.strictEqual(failedCheckout.status, 502);
    assert.strictEqual(orders.at(-1).status, "cancelled");

    const availabilityAfterFailure = await request(server, "GET", "/api/latidos/availability");
    assert.strictEqual(availabilityAfterFailure.body.experiences.tradicional.available, 60);

    latestReference = orders[0].external_reference;
    paymentStatus = "refunded";
    const refundWebhook = await request(server, "POST", "/api/latidos/webhook", {
      type: "payment",
      data: { id: "123456789" }
    });
    assert.strictEqual(refundWebhook.status, 200);
    assert.strictEqual(refundWebhook.body.processed, true);
    assert.strictEqual(orders[0].status, "refunded");
    assert.strictEqual(tickets.filter((ticket) => ticket.status === "cancelled").length, 2);
    assert.strictEqual(tickets.filter((ticket) => ticket.status === "used").length, 3);

    const cancelledCheckIn = await request(server, "POST", "/api/latidos/check-in", {
      ticketToken: registration.body.tickets[1].token
    }, { headers: authHeaders });
    assert.strictEqual(cancelledCheckIn.status, 409);
    assert.strictEqual(cancelledCheckIn.body.reason, "cancelled");

    const availabilityAfterRefund = await request(server, "GET", "/api/latidos/availability");
    assert.strictEqual(availabilityAfterRefund.body.experiences.gastronomica.sold, 0);
    assert.strictEqual(availabilityAfterRefund.body.experiences.gastronomica.available, 40);

    const ignoredWebhook = await request(server, "POST", "/api/latidos/webhook", {
      type: "merchant_order",
      data: { id: "111111111" }
    });
    assert.strictEqual(ignoredWebhook.status, 200);
    assert.strictEqual(ignoredWebhook.body.processed, false);

    console.log("Latidos: checkout, registros privados, pagos simulados, Google Wallet, QR, PDF y acceso unico verificados");
  } finally {
    if (process.env.LATIDOS_TEST_KEEP_OPEN === "1") {
      orders.length = 0;
      registrations.length = 0;
      tickets.length = 0;
      testTickets.length = 0;
      latestReference = `latidos:tradicional:2:${crypto.randomUUID()}`;
      paymentStatus = "approved";
      paymentAmount = 698;
      orders.push({
        id: "20000000-0000-4000-8000-000000000001",
        external_reference: latestReference,
        experience_id: "tradicional",
        quantity: 2,
        unit_price: 349,
        total: 698,
        status: "approved",
        reserved_until: null,
        mercadopago_preference_id: "pref-demo-visible",
        mercadopago_payment_id: "175180982204",
        paid_at: "2026-08-24T10:48:00.000-06:00",
        created_at: "2026-08-24T10:45:00.000-06:00"
      });
      console.log(`Vista local disponible en http://localhost:${server.address().port}/latidos-registros.html`);
      console.log(`Regreso aprobado simulado en http://localhost:${server.address().port}/latidos-de-mexico.html?payment=success&payment_id=175180982204`);
    } else {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
