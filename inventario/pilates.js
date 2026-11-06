"use strict";

// Pilates Party · venta de entradas con Mercado Pago y un QR por compra.
// Módulo independiente: no comparte tablas ni boletos con Latidos de México.

const crypto = require("crypto");

const PILATES = Object.freeze({
  event: "pilates-party-2026",
  title: "Pilates Party",
  description: "Sábado 14 de noviembre de 2026",
  unitPrice: 350,
  maxPerOrder: 10,
  reservationMinutes: 15,
  pendingHoldHours: 48,
  salesEndAt: "2026-11-14T14:00:00-06:00"
});

// Horarios de clase. Cada uno tiene su propio cupo y juntos no rebasan el cupo total.
const PILATES_SLOTS = Object.freeze([
  Object.freeze({ id: "08", label: "Clase de 8:00 a 9:00", short: "8:00 – 9:00", envKey: "PILATES_CAPACITY_08" }),
  Object.freeze({ id: "09", label: "Clase de 9:00 a 10:00", short: "9:00 – 10:00", envKey: "PILATES_CAPACITY_09" })
]);
const SLOT_BY_ID = new Map(PILATES_SLOTS.map((slot) => [slot.id, slot]));
const UNASSIGNED_LABEL = "Horario por asignar";

function readCapacity(key, fallback) {
  const value = Number.parseInt(String(process.env[key] || fallback), 10);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function getPilatesCapacity() {
  return readCapacity("PILATES_CAPACITY", 40);
}

function getSlotCapacity(slot) {
  return readCapacity(slot.envKey, 20);
}

function slotLabel(id) {
  return SLOT_BY_ID.get(id)?.label || UNASSIGNED_LABEL;
}

function arePilatesSalesClosed(now = Date.now()) {
  const flag = String(process.env.PILATES_SALES_CLOSED || "").trim().toLowerCase();
  if (["true", "1", "si", "sí", "yes", "on"].includes(flag)) return true;
  return now >= Date.parse(PILATES.salesEndAt);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sanitizeCheckout(input = {}) {
  const name = String(input.name || "").replace(/\s+/g, " ").trim();
  const phone = String(input.phone || "").trim();
  const phoneDigits = phone.replace(/\D/g, "");
  const quantity = Number.parseInt(String(input.quantity ?? "1"), 10);
  const slot = String(input.slot || "").trim();

  if (name.length < 2 || name.length > 120) throw httpError(400, "Escribe tu nombre completo");
  if (phoneDigits.length < 10 || phoneDigits.length > 15) throw httpError(400, "Escribe un número de celular válido de 10 dígitos");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > PILATES.maxPerOrder) {
    throw httpError(400, `Puedes comprar de 1 a ${PILATES.maxPerOrder} entradas por compra`);
  }

  if (!SLOT_BY_ID.has(slot)) throw httpError(400, "Elige el horario de tu clase");

  return { name, phone: phoneDigits, quantity, slot, total: quantity * PILATES.unitPrice };
}

function createReference(slot, quantity) {
  return `pilates:${slot}:${quantity}:${crypto.randomUUID()}`;
}

// Acepta el formato con horario (pilates:08:2:uuid) y el anterior sin horario (pilates:2:uuid).
function parseReference(reference) {
  const text = String(reference || "");
  const withSlot = /^pilates:(\d{2}):(\d{1,2}):[0-9a-f-]{36}$/i.exec(text);
  const legacy = withSlot ? null : /^pilates:(\d{1,2}):[0-9a-f-]{36}$/i.exec(text);
  const match = withSlot || legacy;
  if (!match) return null;
  const slot = withSlot ? withSlot[1] : null;
  if (slot && !SLOT_BY_ID.has(slot)) return null;
  const quantity = Number(withSlot ? withSlot[2] : legacy[1]);
  if (quantity < 1 || quantity > PILATES.maxPerOrder) return null;
  return { quantity, slot };
}

function maskPhone(phone) {
  const digits = String(phone || "");
  return digits.length > 4 ? `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}` : digits;
}

function registerPilatesRoutes(app, deps) {
  const {
    pool,
    query,
    getInitPromise,
    signPayload,
    base64UrlEncode,
    base64UrlDecode,
    mercadoPagoRequest,
    getPublicSiteUrl,
    authRequired,
    adminRequired,
    QRCode
  } = deps;

  function createToken(kind, id) {
    const payload = base64UrlEncode(JSON.stringify({ v: 1, kind, id }));
    return `pp1.${payload}.${signPayload(`pilates:${payload}`)}`;
  }

  function readToken(token, expectedKind) {
    const [prefix, payload, signature] = String(token || "").trim().split(".");
    if (prefix !== "pp1" || !payload || !signature) return null;
    const expected = Buffer.from(signPayload(`pilates:${payload}`));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
    try {
      const value = JSON.parse(base64UrlDecode(payload));
      if (value.v !== 1 || value.kind !== expectedKind || !value.id) return null;
      return value;
    } catch (error) {
      return null;
    }
  }

  async function expireReservations(client = pool) {
    await client.query(`
      UPDATE pilates_orders
      SET status = 'expired', updated_at = now()
      WHERE status IN ('reserved', 'pending')
        AND reserved_until IS NOT NULL
        AND reserved_until < now()
    `);
  }

  async function getOccupied(client = pool) {
    const result = await client.query(`
      SELECT
        COALESCE(slot, '') AS slot,
        COALESCE(SUM(quantity) FILTER (WHERE status = 'approved'), 0)::INTEGER AS sold,
        COALESCE(SUM(quantity) FILTER (WHERE status IN ('reserved', 'pending') AND reserved_until > now()), 0)::INTEGER AS held,
        COALESCE(SUM(checked_in) FILTER (WHERE status = 'approved'), 0)::INTEGER AS checked_in,
        COUNT(*) FILTER (WHERE status = 'approved')::INTEGER AS orders
      FROM pilates_orders
      WHERE NOT is_test
      GROUP BY COALESCE(slot, '')
    `);
    const empty = () => ({ sold: 0, held: 0, checkedIn: 0, orders: 0 });
    const groups = new Map([["", empty()], ...PILATES_SLOTS.map((slot) => [slot.id, empty()])]);
    for (const row of result.rows) {
      const key = groups.has(row.slot) ? row.slot : "";
      const group = groups.get(key);
      group.sold += Number(row.sold || 0);
      group.held += Number(row.held || 0);
      group.checkedIn += Number(row.checked_in || 0);
      group.orders += Number(row.orders || 0);
    }
    const totals = empty();
    for (const group of groups.values()) {
      totals.sold += group.sold; totals.held += group.held; totals.checkedIn += group.checkedIn; totals.orders += group.orders;
    }
    return { totals, groups };
  }

  async function getAvailability(client = pool) {
    await expireReservations(client);
    const capacity = getPilatesCapacity();
    const { totals, groups } = await getOccupied(client);
    const totalFree = Math.max(0, capacity - totals.sold - totals.held);
    const slots = PILATES_SLOTS.map((slot) => {
      const group = groups.get(slot.id);
      const slotCapacity = getSlotCapacity(slot);
      return {
        id: slot.id,
        label: slot.label,
        short: slot.short,
        capacity: slotCapacity,
        sold: group.sold,
        held: group.held,
        checkedIn: group.checkedIn,
        orders: group.orders,
        available: Math.max(0, Math.min(slotCapacity - group.sold - group.held, totalFree))
      };
    });
    const unassigned = groups.get("");
    const available = Math.min(totalFree, slots.reduce((sum, slot) => sum + slot.available, 0));
    return { capacity, ...totals, available, slots, unassigned };
  }

  function publicOrder(order) {
    const approved = order.status === "approved";
    const quantity = Number(order.quantity);
    const checkedIn = Number(order.checked_in || 0);
    return {
      status: order.status,
      approved,
      name: order.customer_name,
      quantity,
      slot: order.slot || null,
      slotLabel: slotLabel(order.slot),
      checkedIn,
      remaining: Math.max(0, quantity - checkedIn),
      total: Number(order.total),
      ticketToken: approved ? createToken("ticket", order.id) : null,
      isTest: order.is_test === true || order.is_test === "t"
    };
  }

  // Aplica el estado de un pago de Mercado Pago a su orden.
  async function syncPayment(payment) {
    const selection = parseReference(payment.external_reference);
    if (!selection) throw httpError(400, "Este pago no corresponde a Pilates Party");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const orderResult = await client.query(
        "SELECT * FROM pilates_orders WHERE external_reference = $1 FOR UPDATE",
        [payment.external_reference]
      );
      const order = orderResult.rows[0];
      if (!order) throw httpError(404, "No encontramos la compra relacionada con este pago");

      const amount = Number(payment.transaction_amount);
      const amountMatches = Number.isFinite(amount) && Math.abs(amount - Number(order.total)) < 0.01;
      const currencyMatches = String(payment.currency_id || "").toUpperCase() === "MXN";
      const quantityMatches = Number(order.quantity) === selection.quantity;
      if (!amountMatches || !currencyMatches || !quantityMatches) {
        throw httpError(400, "Los datos del pago no coinciden con la compra");
      }

      const mpStatus = String(payment.status || "unknown").toLowerCase();
      const paymentId = String(payment.id || "");
      let nextStatus = order.status;
      let updatePaymentId = true;

      if (mpStatus === "approved") {
        nextStatus = "approved";
      } else if (["refunded", "charged_back"].includes(mpStatus)) {
        // Solo un reembolso del pago que aprobó la orden la cancela.
        if (order.status !== "approved" || !order.mercadopago_payment_id || order.mercadopago_payment_id === paymentId) {
          nextStatus = "refunded";
        } else {
          updatePaymentId = false;
        }
      } else if (order.status === "approved") {
        // Un intento rechazado posterior no debe tocar una compra ya pagada.
        updatePaymentId = false;
      } else if (["pending", "in_process", "authorized"].includes(mpStatus)) {
        nextStatus = "pending";
      } else if (["rejected", "cancelled"].includes(mpStatus)) {
        // Se conserva el apartado para que la persona pueda reintentar el pago.
        nextStatus = order.status === "pending" ? "reserved" : order.status;
      }

      const updated = await client.query(
        `
          UPDATE pilates_orders
          SET
            mercadopago_payment_id = CASE WHEN $5 THEN $1 ELSE mercadopago_payment_id END,
            status = $2,
            paid_at = CASE WHEN $2 = 'approved' THEN COALESCE(paid_at, $3::timestamptz, now()) ELSE paid_at END,
            reserved_until = CASE
              WHEN $2 IN ('approved', 'cancelled', 'refunded') THEN NULL
              WHEN $2 = 'pending' THEN GREATEST(COALESCE(reserved_until, now()), now() + make_interval(hours => $6))
              ELSE reserved_until
            END,
            updated_at = now()
          WHERE id = $4
          RETURNING *
        `,
        [paymentId, nextStatus, payment.date_approved || null, order.id, updatePaymentId && Boolean(paymentId), PILATES.pendingHoldHours]
      );
      await client.query("COMMIT");
      return updated.rows[0];
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function syncPaymentById(paymentId) {
    const id = String(paymentId || "").trim();
    if (!/^\d{6,30}$/.test(id)) throw httpError(400, "Identificador de pago inválido");
    const payment = await mercadoPagoRequest(`/v1/payments/${id}`);
    return { payment, order: await syncPayment(payment) };
  }

  async function refreshOrderFromMercadoPago(order) {
    const search = await mercadoPagoRequest(
      `/v1/payments/search?external_reference=${encodeURIComponent(order.external_reference)}&sort=date_created&criteria=desc&limit=10`
    );
    const results = Array.isArray(search.results) ? search.results : [];
    const payment = results.find((item) => item.status === "approved") || results[0];
    return payment ? syncPayment(payment) : order;
  }

  async function findOrder(id) {
    const result = await query("SELECT * FROM pilates_orders WHERE id = $1", [id]);
    return result.rows[0] || null;
  }

  // ---------- Rutas públicas ----------

  app.get("/api/pilates/availability", async (req, res, next) => {
    try {
      const availability = await getAvailability();
      const salesClosed = arePilatesSalesClosed();
      res.setHeader("Cache-Control", "no-store");
      res.json({
        salesClosed,
        price: PILATES.unitPrice,
        maxPerOrder: PILATES.maxPerOrder,
        capacity: availability.capacity,
        available: salesClosed ? 0 : availability.available,
        slots: availability.slots.map((slot) => ({
          id: slot.id,
          label: slot.label,
          short: slot.short,
          capacity: slot.capacity,
          available: salesClosed ? 0 : slot.available
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/pilates/checkout", async (req, res, next) => {
    let orderId = null;
    try {
      if (arePilatesSalesClosed()) throw httpError(409, "La venta de entradas ya cerró.");
      const checkout = sanitizeCheckout(req.body);
      const siteUrl = getPublicSiteUrl();
      const slot = SLOT_BY_ID.get(checkout.slot);
      const reference = createReference(slot.id, checkout.quantity);
      const reservedUntil = new Date(Date.now() + PILATES.reservationMinutes * 60 * 1000).toISOString();

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('pilates_party_checkout'))");
        const availability = await getAvailability(client);
        const free = availability.slots.find((item) => item.id === slot.id).available;
        if (checkout.quantity > free) {
          const lower = slot.label.charAt(0).toLowerCase() + slot.label.slice(1);
          throw httpError(409, free === 0
            ? `La ${lower} está agotada.`
            : `Solo quedan ${free} ${free === 1 ? "lugar" : "lugares"} en la ${lower}.`);
        }
        const inserted = await client.query(
          `
            INSERT INTO pilates_orders (external_reference, customer_name, phone, quantity, unit_price, total, status, reserved_until, slot)
            VALUES ($1, $2, $3, $4, $5, $6, 'reserved', $7::timestamptz, $8)
            RETURNING id
          `,
          [reference, checkout.name, checkout.phone, checkout.quantity, PILATES.unitPrice, checkout.total, reservedUntil, slot.id]
        );
        orderId = inserted.rows[0].id;
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }

      const returnToken = createToken("return", orderId);
      const backUrl = (status) => `${siteUrl}/pilates?pago=${status}&t=${encodeURIComponent(returnToken)}`;

      const preference = await mercadoPagoRequest("/checkout/preferences", {
        method: "POST",
        headers: { "X-Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          items: [{
            id: `pilates-party-${slot.id}`,
            title: `${PILATES.title} · ${slot.label}`,
            description: PILATES.description,
            category_id: "tickets",
            quantity: checkout.quantity,
            currency_id: "MXN",
            unit_price: PILATES.unitPrice
          }],
          payer: { name: checkout.name },
          external_reference: reference,
          metadata: { event: PILATES.event, quantity: checkout.quantity, slot: slot.id },
          notification_url: `${siteUrl}/api/pilates/webhook`,
          expires: true,
          expiration_date_to: reservedUntil,
          payment_methods: {
            excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
            installments: 1
          },
          back_urls: { success: backUrl("ok"), pending: backUrl("pendiente"), failure: backUrl("error") },
          auto_return: "approved",
          statement_descriptor: "PILATES PARTY"
        })
      });

      if (!preference.init_point) throw httpError(502, "Mercado Pago no devolvió un enlace de pago válido");

      await query(
        "UPDATE pilates_orders SET mercadopago_preference_id = $1, updated_at = now() WHERE id = $2",
        [preference.id, orderId]
      );

      res.status(201).json({ checkoutUrl: preference.init_point, returnToken, total: checkout.total });
    } catch (error) {
      if (orderId) {
        await query(
          "UPDATE pilates_orders SET status = 'cancelled', reserved_until = NULL, updated_at = now() WHERE id = $1 AND status = 'reserved'",
          [orderId]
        ).catch((cancelError) => console.error("No fue posible liberar el apartado de Pilates:", cancelError));
      }
      next(error);
    }
  });

  // Regreso desde Mercado Pago: confirma el pago y entrega el boleto.
  app.get("/api/pilates/order", async (req, res, next) => {
    try {
      const access = readToken(req.query.t, "return");
      if (!access) throw httpError(403, "El enlace de tu compra no es válido.");
      let order = await findOrder(access.id);
      if (!order) throw httpError(404, "No encontramos tu compra.");

      const paymentId = String(req.query.payment_id || "").trim();
      if (order.status !== "approved") {
        if (/^\d{6,30}$/.test(paymentId)) {
          const payment = await mercadoPagoRequest(`/v1/payments/${paymentId}`);
          if (payment.external_reference !== order.external_reference) throw httpError(403, "El pago no corresponde a esta compra.");
          order = await syncPayment(payment);
        } else {
          order = await refreshOrderFromMercadoPago(order);
        }
      }

      res.setHeader("Cache-Control", "private, no-store");
      res.json(publicOrder(order));
    } catch (error) {
      next(error);
    }
  });

  // Quien regresa de Mercado Pago sin pagar libera su apartado de inmediato.
  app.post("/api/pilates/order/cancel", async (req, res, next) => {
    try {
      const access = readToken(req.body?.t, "return");
      if (!access) throw httpError(403, "El enlace de tu compra no es válido.");
      const updated = await query(
        `
          UPDATE pilates_orders
          SET status = 'cancelled', reserved_until = NULL, updated_at = now()
          WHERE id = $1 AND status = 'reserved' AND mercadopago_payment_id IS NULL
          RETURNING status
        `,
        [access.id]
      );
      const order = updated.rows[0] || await findOrder(access.id);
      if (!order) throw httpError(404, "No encontramos tu compra.");
      res.json({ status: order.status });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/pilates/ticket", async (req, res, next) => {
    try {
      const access = readToken(req.query.token, "ticket");
      if (!access) throw httpError(403, "El boleto no es válido.");
      const order = await findOrder(access.id);
      if (!order) throw httpError(404, "No encontramos este boleto.");
      res.setHeader("Cache-Control", "private, no-store");
      res.json(publicOrder(order));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/pilates/qr/:token", async (req, res, next) => {
    try {
      const access = readToken(req.params.token, "ticket");
      if (!access) throw httpError(400, "El boleto no es válido.");
      const image = await QRCode.toBuffer(req.params.token, {
        type: "png",
        width: 720,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#24150d", light: "#f6ece0" }
      });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Length", image.length);
      res.setHeader("Cache-Control", "private, max-age=86400");
      if (req.query.descargar) res.setHeader("Content-Disposition", 'attachment; filename="boleto-pilates-party.png"');
      res.send(image);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/pilates/webhook", async (req, res, next) => {
    const type = String(req.body?.type || req.query.type || req.query.topic || "").toLowerCase();
    const paymentId = req.body?.data?.id || req.query["data.id"] || req.query.id;
    if ((type && type !== "payment") || !paymentId) {
      res.json({ received: true, processed: false });
      return;
    }
    try {
      const { order } = await syncPaymentById(paymentId);
      res.json({ received: true, processed: true, approved: order.status === "approved" });
    } catch (error) {
      if ([400, 404].includes(error.status)) {
        console.warn("Notificación de Pilates ignorada:", error.message);
        res.json({ received: true, processed: false });
        return;
      }
      next(error);
    }
  });

  // ---------- Rutas del personal ----------

  function resolveOrderId(body) {
    if (body.ticketToken) {
      const access = readToken(body.ticketToken, "ticket");
      if (!access) throw httpError(400, "Este QR no es una entrada de Pilates Party.");
      return access.id;
    }
    const orderId = String(body.orderId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw httpError(400, "Compra no válida.");
    return orderId;
  }

  function staffOrder(order, isAdmin) {
    const base = publicOrder(order);
    return {
      id: order.id,
      status: base.status,
      name: base.name,
      phone: isAdmin ? order.phone : maskPhone(order.phone),
      quantity: base.quantity,
      slot: base.slot,
      slotLabel: base.slotLabel,
      checkedIn: base.checkedIn,
      remaining: base.remaining,
      total: base.total,
      isTest: base.isTest,
      paidAt: order.paid_at || null,
      lastCheckInAt: order.last_check_in_at || null,
      paymentId: isAdmin ? order.mercadopago_payment_id || null : undefined
    };
  }

  // Sin "count" solo consulta; con "count" registra la llegada de esas personas.
  app.post("/api/pilates/check-in", authRequired, async (req, res, next) => {
    const client = await pool.connect().catch(next);
    if (!client) return;
    try {
      const orderId = resolveOrderId(req.body || {});
      const count = req.body?.count === undefined ? 0 : Number.parseInt(String(req.body.count), 10);
      if (!Number.isInteger(count) || count < 0 || count > PILATES.maxPerOrder) throw httpError(400, "Número de personas no válido.");
      const isAdmin = req.user.role === "admin";

      await client.query("BEGIN");
      const result = await client.query("SELECT * FROM pilates_orders WHERE id = $1 FOR UPDATE", [orderId]);
      const order = result.rows[0];
      if (!order) {
        await client.query("ROLLBACK");
        res.status(404).json({ valid: false, reason: "not_found", error: "No encontramos esta entrada." });
        return;
      }
      if (order.status !== "approved") {
        await client.query("ROLLBACK");
        res.status(409).json({
          valid: false,
          reason: order.status === "refunded" ? "refunded" : "unpaid",
          error: order.status === "refunded" ? "Esta compra fue reembolsada." : "Esta compra no está pagada.",
          order: staffOrder(order, isAdmin)
        });
        return;
      }

      const remaining = Number(order.quantity) - Number(order.checked_in);
      if (count === 0) {
        await client.query("ROLLBACK");
        res.json({ valid: remaining > 0, reason: remaining > 0 ? "ok" : "used", order: staffOrder(order, isAdmin) });
        return;
      }
      if (count > remaining) {
        await client.query("ROLLBACK");
        res.status(409).json({
          valid: false,
          reason: "used",
          error: remaining === 0 ? "Todas las entradas de esta compra ya se usaron." : `Solo quedan ${remaining} entradas en esta compra.`,
          order: staffOrder(order, isAdmin)
        });
        return;
      }

      const updated = await client.query(
        `
          UPDATE pilates_orders
          SET checked_in = checked_in + $2, last_check_in_at = now(), updated_at = now()
          WHERE id = $1
          RETURNING *
        `,
        [order.id, count]
      );
      await client.query(
        "INSERT INTO pilates_check_ins (order_id, count, user_id) VALUES ($1, $2, $3)",
        [order.id, count, req.user.id]
      );
      await client.query("COMMIT");
      res.json({ valid: true, reason: "admitted", admitted: count, order: staffOrder(updated.rows[0], isAdmin) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });

  // Corrección de llegadas registradas por error (solo administradores).
  app.post("/api/pilates/check-in/undo", authRequired, adminRequired, async (req, res, next) => {
    try {
      const orderId = resolveOrderId(req.body || {});
      const count = Number.parseInt(String(req.body?.count ?? "1"), 10);
      if (!Number.isInteger(count) || count < 1 || count > PILATES.maxPerOrder) throw httpError(400, "Número de personas no válido.");
      const updated = await query(
        `
          UPDATE pilates_orders
          SET checked_in = checked_in - $2, updated_at = now()
          WHERE id = $1 AND checked_in >= $2
          RETURNING *
        `,
        [orderId, count]
      );
      if (!updated.rows[0]) throw httpError(409, "No hay tantas llegadas registradas en esta compra.");
      await query("INSERT INTO pilates_check_ins (order_id, count, user_id) VALUES ($1, $2, $3)", [orderId, -count, req.user.id]);
      res.json({ ok: true, order: staffOrder(updated.rows[0], true) });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/pilates/orders", authRequired, async (req, res, next) => {
    try {
      const isAdmin = req.user.role === "admin";
      const availability = await getAvailability();
      const result = await query(`
        SELECT *
        FROM pilates_orders
        WHERE status IN ('approved', 'refunded')
           OR (status = 'pending' AND reserved_until > now())
        ORDER BY customer_name ASC, created_at ASC
      `);
      res.setHeader("Cache-Control", "private, no-store");
      res.json({
        summary: {
          capacity: availability.capacity,
          sold: availability.sold,
          available: availability.available,
          checkedIn: availability.checkedIn,
          orders: availability.orders,
          revenue: availability.sold * PILATES.unitPrice,
          slots: availability.slots.map((slot) => ({
            id: slot.id, label: slot.label, short: slot.short, capacity: slot.capacity,
            sold: slot.sold, checkedIn: slot.checkedIn, available: slot.available
          })),
          unassigned: { sold: availability.unassigned.sold, orders: availability.unassigned.orders, checkedIn: availability.unassigned.checkedIn }
        },
        orders: result.rows.map((order) => staffOrder(order, isAdmin))
      });
    } catch (error) {
      next(error);
    }
  });

  // Asignar o cambiar el horario de una compra (solo administradores).
  app.post("/api/pilates/orders/:id/slot", authRequired, adminRequired, async (req, res, next) => {
    const client = await pool.connect().catch(next);
    if (!client) return;
    try {
      const orderId = String(req.params.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw httpError(400, "Compra no válida.");
      const slot = SLOT_BY_ID.get(String(req.body?.slot || ""));
      if (!slot) throw httpError(400, "Horario no válido.");

      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('pilates_party_checkout'))");
      const found = await client.query("SELECT * FROM pilates_orders WHERE id = $1 FOR UPDATE", [orderId]);
      const order = found.rows[0];
      if (!order) throw httpError(404, "No encontramos esta compra.");
      if (order.slot !== slot.id) {
        const availability = await getAvailability(client);
        const target = availability.slots.find((item) => item.id === slot.id);
        // Al moverla, la compra deja libre su lugar actual; el cupo total no cambia.
        const freeInSlot = getSlotCapacity(slot) - target.sold - target.held;
        if (Number(order.quantity) > freeInSlot) {
          throw httpError(409, `No hay lugar suficiente en la ${slot.label.toLowerCase()} (quedan ${Math.max(0, freeInSlot)}).`);
        }
        await client.query("UPDATE pilates_orders SET slot = $2, updated_at = now() WHERE id = $1", [orderId, slot.id]);
      }
      const updated = await client.query("SELECT * FROM pilates_orders WHERE id = $1", [orderId]);
      await client.query("COMMIT");
      res.json({ ok: true, order: staffOrder(updated.rows[0], true) });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });

  // Boletos de prueba: mismo QR, boleto y escáner, sin cobro y sin ocupar lugares.
  app.post("/api/pilates/test-ticket", authRequired, adminRequired, async (req, res, next) => {
    try {
      const slot = SLOT_BY_ID.get(String(req.body?.slot || "08")) || PILATES_SLOTS[0];
      const quantity = Math.min(Math.max(Number.parseInt(String(req.body?.quantity ?? "2"), 10) || 2, 1), PILATES.maxPerOrder);
      const inserted = await query(
        `
          INSERT INTO pilates_orders (external_reference, customer_name, phone, quantity, unit_price, total, status, slot, paid_at, is_test)
          VALUES ($1, 'Boleto de prueba', '0000000000', $2, 0, 0, 'approved', $3, now(), true)
          RETURNING *
        `,
        [`prueba:${crypto.randomUUID()}`, quantity, slot.id]
      );
      const order = inserted.rows[0];
      const token = createToken("ticket", order.id);
      res.status(201).json({ ticketToken: token, ticketUrl: `${getPublicSiteUrl()}/pilates?boleto=${encodeURIComponent(token)}`, order: staffOrder(order, true) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/pilates/test-ticket/clear", authRequired, adminRequired, async (req, res, next) => {
    try {
      const removed = await query("DELETE FROM pilates_orders WHERE is_test RETURNING id");
      res.json({ removed: removed.rows.length });
    } catch (error) {
      next(error);
    }
  });

  return { createToken, readToken, syncPayment, getAvailability };
}

async function ensurePilatesSchema(query) {
  await query(`
    CREATE TABLE IF NOT EXISTS pilates_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_reference TEXT NOT NULL UNIQUE,
      mercadopago_preference_id TEXT,
      mercadopago_payment_id TEXT UNIQUE,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
      total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),
      status TEXT NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'pending', 'approved', 'expired', 'cancelled', 'refunded')),
      reserved_until TIMESTAMPTZ,
      checked_in INTEGER NOT NULL DEFAULT 0 CHECK (checked_in >= 0 AND checked_in <= quantity),
      last_check_in_at TIMESTAMPTZ,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS pilates_check_ins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES pilates_orders(id) ON DELETE CASCADE,
      count INTEGER NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_pilates_orders_status ON pilates_orders(status, reserved_until)`);
  await query(`ALTER TABLE pilates_orders ADD COLUMN IF NOT EXISTS slot TEXT CHECK (slot IN ('08', '09'))`);
  await query(`ALTER TABLE pilates_orders ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false`);

  // Cuenta de administrador para el control de acceso de Pilates Party.
  // Solo se crea si no existe; si luego se cambia la contraseña con
  // scripts/set-staff-account.js, este bloque no la sobrescribe.
  await query(
    `INSERT INTO users (username, password_hash, salt, name, role, label)
     VALUES ('pilates', $1, $2, 'Pilates Party', 'admin', 'admin')
     ON CONFLICT (username) DO NOTHING`,
    ["91e8222b492feba575eb6e4becbee4268c1ea3c5de0e16e848b370733188a42e68659f48b6c21ecb347e9555858d64ed4c628755636553103c56d6640d265184", "scrypt:1f11259d9085f47376a08ff94a130dd9b7880af930e016b7"]
  );
}

module.exports = { registerPilatesRoutes, ensurePilatesSchema, PILATES, PILATES_SLOTS, sanitizeCheckout, parseReference, getPilatesCapacity };
