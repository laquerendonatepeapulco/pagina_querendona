const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const pg = require("pg");

process.env.DATABASE_URL = "postgres://database-simulada/sin-red";
process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-token-simulado";
process.env.PUBLIC_SITE_URL = "https://laquerendonacg.com";

const experiences = new Map([
  ["tradicional", { id: "tradicional", name: "Buffet de antojitos mexicanos", capacity: 60, price: 349 }],
  ["gastronomica", { id: "gastronomica", name: "Cena mexicana de gala", capacity: 40, price: 599 }]
]);
const orders = [];
const registrations = [];
let nextOrderId = 1;
let nextRegistrationId = 1;

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

  if (/FROM latidos_experiences e/i.test(query)) {
    const rows = [...experiences.values()].map((experience) => {
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
    const order = {
      id: `order-${nextOrderId++}`,
      external_reference: params[0],
      experience_id: params[1],
      quantity: Number(params[2]),
      unit_price: Number(params[3]),
      total: Number(params[4]),
      status: "reserved",
      reserved_until: params[5],
      mercadopago_preference_id: null,
      mercadopago_payment_id: null,
      paid_at: null
    };
    orders.push(order);
    return { rows: [{ id: order.id }], rowCount: 1 };
  }

  if (/SET mercadopago_preference_id = \$1/i.test(query)) {
    const order = orders.find((item) => item.id === params[1]);
    if (order) order.mercadopago_preference_id = params[0];
    return { rows: [], rowCount: order ? 1 : 0 };
  }

  if (/SET status = 'cancelled'/i.test(query)) {
    const order = orders.find((item) => item.id === params[0] && item.status === "reserved");
    if (order) order.status = "cancelled";
    return { rows: [], rowCount: order ? 1 : 0 };
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

  if (/INSERT INTO latidos_registrations/i.test(query)) {
    let registration = registrations.find((item) => item.order_id === params[0]);
    if (!registration) {
      registration = { id: `registration-${nextRegistrationId++}`, order_id: params[0] };
      registrations.push(registration);
    }
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

function request(server, method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const payload = body ? JSON.stringify(body) : "";
    const req = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path: requestPath,
      method,
      headers: payload
        ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
        : {}
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => {
        resolve({ status: res.statusCode, body: JSON.parse(responseBody) });
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
}

async function run() {
  validateInlineScripts();
  const server = app.listen(0);

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

    const preferenceCall = mercadoPagoCalls.find((call) => call.url.endsWith("/checkout/preferences"));
    const preferenceBody = JSON.parse(preferenceCall.options.body);
    assert.strictEqual(preferenceBody.items[0].unit_price, 599);
    assert.strictEqual(preferenceBody.items[0].quantity, 3);
    assert.strictEqual(preferenceBody.auto_return, "approved");
    assert.strictEqual(preferenceBody.expires, true);
    assert.ok(preferenceBody.expiration_date_to);
    assert.strictEqual(preferenceBody.notification_url, "https://laquerendonacg.com/api/latidos/webhook");
    assert.ok(preferenceBody.back_urls.success.includes("payment=success"));

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

    const updatedRegistration = await request(server, "POST", "/api/latidos/registration", {
      ...registrationPayload,
      origin: "Pachuca, Hidalgo"
    });
    assert.strictEqual(updatedRegistration.status, 201);
    assert.strictEqual(registrations.length, 1);
    assert.strictEqual(registrations[0].origin, "Pachuca, Hidalgo");

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

    const availabilityAfterRefund = await request(server, "GET", "/api/latidos/availability");
    assert.strictEqual(availabilityAfterRefund.body.experiences.gastronomica.sold, 0);
    assert.strictEqual(availabilityAfterRefund.body.experiences.gastronomica.available, 40);

    const ignoredWebhook = await request(server, "POST", "/api/latidos/webhook", {
      type: "merchant_order",
      data: { id: "111111111" }
    });
    assert.strictEqual(ignoredWebhook.status, 200);
    assert.strictEqual(ignoredWebhook.body.processed, false);

    console.log("Latidos: checkout, cupos, pagos, webhook y registro verificados con simulaciones");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
