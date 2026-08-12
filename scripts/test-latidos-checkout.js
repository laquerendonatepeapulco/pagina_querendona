const assert = require("assert");
const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

process.env.MERCADO_PAGO_ACCESS_TOKEN = "TEST-token";
process.env.PUBLIC_SITE_URL = "https://laquerendonacg.com";

const paymentReference = "latidos:gastronomica:3:47ef7852-a2ce-4fb7-9061-f88261a66763";
const mercadoPagoCalls = [];

global.fetch = async (url, options = {}) => {
  mercadoPagoCalls.push({ url, options });

  if (url.endsWith("/checkout/preferences")) {
    return {
      ok: true,
      status: 201,
      json: async () => ({
        id: "pref-test",
        init_point: "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-test"
      })
    };
  }

  if (url.endsWith("/v1/payments/123456789")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 123456789,
        status: "approved",
        transaction_amount: 1797,
        currency_id: "MXN",
        external_reference: paymentReference,
        date_approved: "2026-08-12T12:00:00.000-06:00"
      })
    };
  }

  throw new Error(`Solicitud inesperada: ${url}`);
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
    const checkout = await request(server, "POST", "/api/latidos/checkout", {
      experience: "gastronomica",
      quantity: 3
    });
    assert.strictEqual(checkout.status, 201);
    assert.strictEqual(checkout.body.total, 1797);
    assert.ok(checkout.body.checkoutUrl.startsWith("https://www.mercadopago.com.mx/"));

    const preferenceBody = JSON.parse(mercadoPagoCalls[0].options.body);
    assert.strictEqual(preferenceBody.items[0].unit_price, 599);
    assert.strictEqual(preferenceBody.items[0].quantity, 3);
    assert.strictEqual(preferenceBody.auto_return, "approved");
    assert.ok(preferenceBody.back_urls.success.includes("payment=success"));

    const payment = await request(server, "GET", "/api/latidos/payment?payment_id=123456789");
    assert.strictEqual(payment.status, 200);
    assert.strictEqual(payment.body.approved, true);
    assert.strictEqual(payment.body.experience, "gastronomica");
    assert.strictEqual(payment.body.quantity, 3);
    assert.strictEqual(payment.body.amount, 1797);

    const invalid = await request(server, "POST", "/api/latidos/checkout", {
      experience: "tradicional",
      quantity: 51
    });
    assert.strictEqual(invalid.status, 400);

    console.log("Checkout de Latidos: pruebas completadas correctamente");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
