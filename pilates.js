(() => {
  // Animación al aparecer
  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach((el, i) => {
      el.style.transitionDelay = `${(i % 4) * 90}ms`;
      io.observe(el);
    });
  } else {
    items.forEach(el => el.classList.add('is-in'));
  }

  // Cuenta regresiva al sábado 14 de noviembre de 2026, 8:00 h (hora del centro de México)
  const box = document.getElementById('countdown');
  if (!box) return;
  const start = new Date('2026-11-14T08:00:00-06:00').getTime();
  const d = box.querySelector('[data-d]');
  const h = box.querySelector('[data-h]');
  const m = box.querySelector('[data-m]');
  const pad = n => String(n).padStart(2, '0');

  const tick = () => {
    const diff = start - Date.now();
    if (diff <= 0) {
      box.hidden = true;
      return false;
    }
    const mins = Math.floor(diff / 60000);
    d.textContent = Math.floor(mins / 1440);
    h.textContent = pad(Math.floor((mins % 1440) / 60));
    m.textContent = pad(mins % 60);
    box.hidden = false;
    return true;
  };

  if (tick()) setInterval(tick, 30000);
})();

// ---------- Compra y boleto ----------
(() => {
  const PRICE = 350;
  const STORE_KEY = "pilates-party-boleto";
  const form = document.getElementById("buyForm");
  if (!form) return;

  const section = document.getElementById("comprar");
  const nameInput = document.getElementById("buyName");
  const phoneInput = document.getElementById("buyPhone");
  const qtyOut = document.getElementById("qtyValue");
  const totalOut = document.getElementById("buyTotal");
  const stockOut = document.getElementById("buyStock");
  const errorOut = document.getElementById("buyError");
  const payButton = document.getElementById("buyButton");
  const haveTicket = document.getElementById("haveTicket");
  const stepButtons = form.querySelectorAll(".qty-btn");

  let qty = 1;
  let maxQty = 10;
  let available = null;
  let slots = [];
  const slotInputs = [...form.querySelectorAll('input[name="slot"]')];
  const selectedSlot = () => slotInputs.find((input) => input.checked)?.value || "";
  const slotInfo = (id) => slots.find((slot) => slot.id === id);
  const money = (n) => `$${Number(n).toLocaleString("es-MX")}`;

  const store = {
    get() { try { return localStorage.getItem(STORE_KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(STORE_KEY, v); } catch (e) { /* sin almacenamiento */ } },
    clear() { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* sin almacenamiento */ } }
  };

  function renderQty() {
    const info = slotInfo(selectedSlot());
    const free = info ? info.available : available;
    const limit = free === null || free === undefined ? maxQty : Math.max(1, Math.min(maxQty, free));
    qty = Math.min(Math.max(1, qty), limit);
    qtyOut.textContent = String(qty);
    totalOut.textContent = money(qty * PRICE);
    stepButtons[0].disabled = qty <= 1;
    stepButtons[1].disabled = qty >= limit;
  }

  [nameInput, phoneInput].forEach((input) => input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    showError("");
  }));

  stepButtons.forEach((button) => button.addEventListener("click", () => {
    qty += Number(button.dataset.step);
    renderQty();
  }));

  slotInputs.forEach((input) => input.addEventListener("change", () => {
    showError("");
    renderQty();
  }));

  function showError(message) {
    errorOut.textContent = message;
    errorOut.hidden = !message;
  }

  async function loadAvailability() {
    try {
      const response = await fetch("/api/pilates/availability", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      maxQty = data.maxPerOrder || maxQty;
      available = data.available;
      slots = Array.isArray(data.slots) ? data.slots : [];
      slotInputs.forEach((input) => {
        const info = slotInfo(input.value);
        const left = form.querySelector(`[data-left="${input.value}"]`);
        if (!info || !left) return;
        const soldOut = info.available <= 0;
        input.disabled = soldOut;
        if (soldOut && input.checked) input.checked = false;
        input.closest(".slot-opt").classList.toggle("is-soldout", soldOut);
        left.textContent = soldOut ? "Agotado" : info.available === 1 ? "Queda 1 lugar" : `Quedan ${info.available} lugares`;
      });
      stockOut.hidden = true;
      if (data.salesClosed || data.available <= 0) {
        section.classList.add("is-soldout");
        payButton.disabled = true;
        payButton.textContent = data.salesClosed ? "Venta cerrada" : "Entradas agotadas";
      }
      renderQty();
    } catch (e) {
      /* si falla, el servidor valida al pagar */
    }
  }

  function validate() {
    const name = nameInput.value.replace(/\s+/g, " ").trim();
    const digits = phoneInput.value.replace(/\D/g, "");
    nameInput.setAttribute("aria-invalid", String(name.length < 2));
    phoneInput.setAttribute("aria-invalid", String(digits.length < 10 || digits.length > 15));
    if (name.length < 2) { nameInput.focus(); return "Escribe tu nombre completo."; }
    if (digits.length < 10 || digits.length > 15) { phoneInput.focus(); return "Escribe tu celular a 10 dígitos."; }
    if (!selectedSlot()) { (slotInputs.find((input) => !input.disabled) || slotInputs[0]).focus(); return "Elige el horario de tu clase."; }
    return "";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const problem = validate();
    showError(problem);
    if (problem) return;

    payButton.disabled = true;
    const label = payButton.textContent;
    payButton.textContent = "Conectando con Mercado Pago…";
    try {
      const response = await fetch("/api/pilates/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput.value, phone: phoneInput.value, quantity: qty, slot: selectedSlot() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.checkoutUrl) throw new Error(data.error || "No pudimos iniciar el pago. Intenta de nuevo.");
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      showError(error.message);
      payButton.disabled = false;
      payButton.textContent = label;
      loadAvailability();
    }
  });

  // ----- Ventana del boleto -----
  const modal = document.getElementById("ticketModal");
  const box = modal.querySelector(".ticket");
  const el = (id) => document.getElementById(id);
  const stateBox = el("ticketState");
  const body = el("ticketBody");
  const retry = el("ticketRetry");
  let pollTimer = null;
  let lastFocus = null;

  function openModal() {
    if (modal.hidden) lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add("has-modal");
    box.focus();
  }
  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("has-modal");
    clearTimeout(pollTimer);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  function showState(kicker, title, message, { spinner = false, canRetry = false } = {}) {
    el("ticketKicker").textContent = kicker;
    el("ticketTitle").textContent = title;
    el("ticketMsg").textContent = message;
    modal.setAttribute("aria-labelledby", "ticketTitle");
    el("ticketSpinner").hidden = !spinner;
    stateBox.hidden = false;
    body.hidden = true;
    retry.hidden = !canRetry;
    openModal();
  }

  function ticketLink(token) {
    return `${location.origin}/pilates?boleto=${encodeURIComponent(token)}`;
  }

  // Quien ya compró ve su boleto en lugar del formulario (puede abrirlo para comprar más).
  function showHaveTicket(order) {
    const count = order.quantity === 1 ? "1 entrada" : `${order.quantity} entradas`;
    document.getElementById("haveTicketInfo").textContent = `${order.name} · ${count} · ${order.slotLabel || "Horario por confirmar"}`;
    form.hidden = true;
    haveTicket.hidden = false;
  }

  document.getElementById("haveTicketOpen").addEventListener("click", () => {
    const token = store.get();
    if (token) openSavedTicket(token);
  });
  document.getElementById("buyMore").addEventListener("click", () => {
    haveTicket.hidden = true;
    form.hidden = false;
    nameInput.focus();
  });

  function showTicket(order, fresh = false) {
    const token = order.ticketToken;
    const qr = `/api/pilates/qr/${encodeURIComponent(token)}`;
    el("ticketQr").src = qr;
    el("ticketDownload").href = `${qr}?descargar=1`;
    el("ticketCount").textContent = order.quantity === 1 ? "Vale por 1 entrada" : `Vale por ${order.quantity} entradas`;
    el("ticketSlot").textContent = order.slotLabel || "Horario por confirmar";
    el("ticketName").textContent = order.name;
    const used = el("ticketUsed");
    if (order.checkedIn > 0) {
      used.textContent = order.remaining > 0
        ? `Ya ingresaron ${order.checkedIn} · faltan ${order.remaining}`
        : "Todas las entradas ya se usaron";
      used.hidden = false;
    } else {
      used.hidden = true;
    }
    const when = order.slot ? `${(order.slotLabel || "").toLowerCase()}, sábado 14 de noviembre` : "sábado 14 de noviembre";
    const count = order.quantity === 1 ? "1 entrada" : `${order.quantity} entradas`;
    const text = `Boleto de Pilates Party (${when}), vale por ${count}. Ábrelo y muestra el QR al llegar: ${ticketLink(token)}`;
    el("ticketReadyTitle").textContent = fresh ? "¡Pago realizado!" : "Tu boleto";
    el("ticketPaidMsg").textContent = fresh ? "Descarga tu QR y preséntalo al llegar." : "Muestra este QR al llegar.";
    el("ticketWhatsApp").href = `https://wa.me/?text=${encodeURIComponent(text)}`;
    modal.setAttribute("aria-labelledby", "ticketReadyTitle");
    stateBox.hidden = true;
    retry.hidden = true;
    body.hidden = false;
    store.set(token);
    showHaveTicket(order);
    history.replaceState(null, "", `/pilates?boleto=${encodeURIComponent(token)}`);
    openModal();
  }

  const validPaymentId = (value) => (/^\d{6,30}$/.test(String(value || "")) ? String(value) : "");

  function showNotCompleted(returnToken) {
    // Libera el lugar apartado si no hubo ningún pago.
    fetch("/api/pilates/order/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: returnToken })
    }).catch(() => {}).finally(() => loadAvailability());
    history.replaceState(null, "", "/pilates#comprar");
    showState("Tu pago", "El pago no se completó", "No se realizó ningún cargo. Puedes intentarlo de nuevo.", { canRetry: true });
  }

  async function checkReturn(returnToken, paymentId, attempt = 0, failed = false) {
    const url = new URL("/api/pilates/order", location.origin);
    url.searchParams.set("t", returnToken);
    if (paymentId) url.searchParams.set("payment_id", paymentId);
    try {
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No pudimos revisar tu pago.");
      if (data.approved && data.ticketToken) return showTicket(data, true);
      if (failed && data.status !== "pending") return showNotCompleted(returnToken);
      if (["reserved", "pending"].includes(data.status) && attempt < 24) {
        showState("Tu pago", "Confirmando tu pago…", data.status === "pending"
          ? "Mercado Pago está revisando tu pago. En cuanto se apruebe, aquí aparecerá tu QR."
          : "Esto tarda unos segundos. No cierres esta página.", { spinner: true });
        pollTimer = setTimeout(() => checkReturn(returnToken, paymentId, attempt + 1, failed), 5000);
        return;
      }
      if (data.status === "pending") {
        return showState("Tu pago", "Tu pago sigue en revisión", "Conserva esta página. Cuando Mercado Pago lo apruebe, vuelve a abrirla y aparecerá tu QR.");
      }
      return showState("Tu pago", "El pago no se completó", "No se realizó ningún cargo. Puedes intentarlo de nuevo.", { canRetry: true });
    } catch (error) {
      showState("Tu pago", "No pudimos revisar tu pago", `${error.message} Si ya pagaste, recarga esta página en unos minutos.`, { canRetry: true });
    }
  }

  async function openSavedTicket(token) {
    showState("Tu boleto", "Cargando tu boleto…", "", { spinner: true });
    try {
      const response = await fetch(`/api/pilates/ticket?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No encontramos este boleto.");
      if (data.approved && data.ticketToken) return showTicket(data);
      showState("Tu boleto", "Este boleto ya no es válido", data.status === "refunded" ? "La compra fue reembolsada." : "La compra no está pagada.");
    } catch (error) {
      showState("Tu boleto", "No pudimos abrir tu boleto", error.message);
    }
  }

  const params = new URLSearchParams(location.search);
  const returnToken = params.get("t");
  const boleto = params.get("boleto");
  const saved = store.get();

  if (returnToken && params.get("pago")) {
    const paymentId = validPaymentId(params.get("payment_id")) || validPaymentId(params.get("collection_id"));
    const failed = params.get("pago") === "error";
    if (failed && !paymentId) {
      showNotCompleted(returnToken);
    } else {
      showState("Tu pago", "Confirmando tu pago…", "Esto tarda unos segundos. No cierres esta página.", { spinner: true });
      checkReturn(returnToken, paymentId, 0, failed);
    }
  } else if (boleto) {
    openSavedTicket(boleto);
  } else if (saved) {
    // Revisa en silencio que el boleto guardado siga siendo válido.
    fetch(`/api/pilates/ticket?token=${encodeURIComponent(saved)}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data && data.approved) showHaveTicket(data);
        else if (data) store.clear();
      })
      .catch(() => {});
  }

  renderQty();
  loadAvailability();
})();

// ---------- Menú superior ----------
(() => {
  const nav = document.getElementById("topnav");
  if (!nav) return;
  const update = () => nav.classList.toggle("is-solid", window.scrollY > 40);
  update();
  window.addEventListener("scroll", update, { passive: true });

  const links = [...nav.querySelectorAll(".topnav-links a")];
  if (!("IntersectionObserver" in window)) return;
  const byId = new Map(links.map((a) => [a.hash.slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((a) => a.classList.remove("is-active"));
      byId.get(entry.target.id)?.classList.add("is-active");
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  byId.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
})();

