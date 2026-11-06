(() => {
  const TOKEN_KEY = "pilates-acceso-token";
  const USER_KEY = "pilates-acceso-user";
  const JSQR_URL = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
  const $ = (id) => document.getElementById(id);

  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { /* nada */ } }
  };
  let token = ss.get(TOKEN_KEY) || "";
  let user = null;
  try { user = JSON.parse(ss.get(USER_KEY) || "null"); } catch (e) { user = null; }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { logout(); throw new Error("Tu sesión terminó. Vuelve a entrar."); }
    return { ok: response.ok, status: response.status, data };
  }

  // ---------- Sesión ----------
  function showLogin() { $("login").hidden = false; $("app").hidden = true; stopCamera(); }
  function logout() { token = ""; user = null; ss.set(TOKEN_KEY, null); ss.set(USER_KEY, null); showLogin(); }
  async function showApp() {
    $("login").hidden = true; $("app").hidden = false;
    $("who").textContent = `${user.name} · ${user.role === "admin" ? "Administrador" : "Personal"}`;
    await loadOrders();
  }

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    $("loginError").hidden = true;
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No fue posible entrar");
      token = data.token; user = data.user;
      ss.set(TOKEN_KEY, token); ss.set(USER_KEY, JSON.stringify(user));
      event.target.reset();
      await showApp();
    } catch (error) {
      $("loginError").textContent = error.message;
      $("loginError").hidden = false;
    }
  });
  $("logout").addEventListener("click", logout);

  // ---------- Lista y resumen ----------
  let orders = [];
  async function loadOrders() {
    try {
      const { ok, data } = await api("/api/pilates/orders");
      if (!ok) throw new Error(data.error || "No se pudo cargar la lista");
      orders = data.orders || [];
      $("statIn").textContent = data.summary.checkedIn;
      $("statLeft").textContent = Math.max(0, data.summary.sold - data.summary.checkedIn);
      $("statSold").textContent = data.summary.sold;
      renderSlotStats(data.summary);
      renderList();
    } catch (error) {
      $("listEmpty").textContent = error.message;
      $("listEmpty").hidden = false;
    }
  }

  const SHORT = { "08": "8:00 – 9:00", "09": "9:00 – 10:00" };
  let filter = "all";

  function renderSlotStats(summary) {
    const box = $("slotStats");
    box.replaceChildren();
    (summary.slots || []).forEach((slot) => {
      const row = document.createElement("p");
      const time = document.createElement("b");
      time.textContent = slot.short;
      row.append(time, ` · ingresaron ${slot.checkedIn} de ${slot.sold} · ${slot.available} libres`);
      box.append(row);
    });
    const pending = summary.unassigned && summary.unassigned.sold;
    $("filterNone").hidden = !pending;
    if (!pending && filter === "none") {
      filter = "all";
      $("filters").querySelectorAll("[data-f]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === "all")));
    }
    if (pending) {
      const row = document.createElement("p");
      row.className = "warn-row";
      row.textContent = `${pending} ${pending === 1 ? "entrada" : "entradas"} sin horario asignado`;
      box.append(row);
    }
  }

  $("filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-f]");
    if (!button) return;
    filter = button.dataset.f;
    $("filters").querySelectorAll("[data-f]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    renderList();
  });

  function renderList() {
    const term = $("search").value.trim().toLowerCase();
    const list = $("list");
    list.replaceChildren();
    const bySlot = (o) => filter === "all" || (filter === "none" ? !o.slot : o.slot === filter);
    const visible = orders.filter((o) => o.status === "approved" && bySlot(o) && (!term || o.name.toLowerCase().includes(term) || String(o.phone).replace(/\D/g, "").endsWith(term.replace(/\D/g, "") || "~")));
    visible.forEach((order) => {
      const li = document.createElement("li");
      if (order.remaining === 0) li.className = "done";
      const info = document.createElement("div");
      const name = document.createElement("b");
      name.textContent = order.name;
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = `${order.checkedIn}/${order.quantity}`;
      name.append(pill);
      const phone = document.createElement("small");
      phone.textContent = `${order.slot ? SHORT[order.slot] : "Sin horario"} · ${order.phone}`;
      if (!order.slot) phone.className = "no-slot";
      info.append(name, phone);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = order.remaining === 0 ? "Ver" : "Registrar";
      button.addEventListener("click", () => lookup({ orderId: order.id }));
      li.append(info, button);
      list.append(li);
    });
    $("listEmpty").textContent = "No hay compras que coincidan.";
    $("listEmpty").hidden = visible.length > 0;
  }
  $("search").addEventListener("input", renderList);

  document.querySelectorAll("[data-tab]").forEach((tab) => tab.addEventListener("click", () => {
    const isScan = tab.dataset.tab === "scan";
    $("tabScan").setAttribute("aria-selected", String(isScan));
    $("tabList").setAttribute("aria-selected", String(!isScan));
    $("panelScan").hidden = !isScan;
    $("panelList").hidden = isScan;
    if (!isScan) { stopCamera(); loadOrders(); }
  }));

  // ---------- Hoja de resultado ----------
  let current = null;
  let admitQty = 1;
  function openSheet(kind, label, title, sub) {
    const card = $("sheetCard");
    card.className = `sheet-card is-${kind}`;
    $("sheetLabel").textContent = label;
    $("sheetTitle").textContent = title;
    $("sheetSub").textContent = sub || "";
    $("sheetClose").textContent = kind === "check" ? "Cancelar" : "Escanear siguiente";
    $("sheet").hidden = false;
    card.focus();
  }
  function closeSheet() {
    $("sheet").hidden = true;
    current = null;
    if (!$("panelScan").hidden) startCamera();
  }
  $("sheet").addEventListener("click", (event) => { if (event.target.closest("[data-close]")) closeSheet(); });

  function renderCounts(order) {
    const box = $("sheetCounts");
    box.replaceChildren();
    [[`${order.quantity} ${order.quantity === 1 ? "entrada" : "entradas"}`], [`Ingresaron ${order.checkedIn}`], [`Faltan ${order.remaining}`]].forEach(([text]) => {
      const span = document.createElement("span"); span.textContent = text; box.append(span);
    });
  }
  function renderAdmitQty() {
    $("admitQty").textContent = String(admitQty);
    const [minus, plus] = $("sheetAdmit").querySelectorAll("[data-step]");
    minus.disabled = admitQty <= 1;
    plus.disabled = !current || admitQty >= current.order.remaining;
    $("admitBtn").textContent = admitQty === 1 ? "Registrar 1 entrada" : `Registrar ${admitQty} entradas`;
  }
  $("sheetAdmit").querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
    admitQty += Number(b.dataset.step); renderAdmitQty();
  }));

  function renderSlot(order) {
    const tag = $("sheetSlot");
    tag.hidden = !order;
    if (!order) { $("sheetAssign").hidden = true; return; }
    tag.textContent = order.slot ? `Clase ${SHORT[order.slot]}` : "Horario por asignar";
    tag.classList.toggle("is-missing", !order.slot);
    const isAdmin = user && user.role === "admin";
    $("sheetAssign").hidden = !isAdmin;
    $("sheetAssign").querySelectorAll("[data-assign]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.assign === order.slot)));
  }

  $("sheetAssign").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-assign]");
    if (!button || !current || button.dataset.assign === current.order.slot) return;
    button.disabled = true;
    try {
      const { ok, data } = await api(`/api/pilates/orders/${current.order.id}/slot`, { method: "POST", body: JSON.stringify({ slot: button.dataset.assign }) });
      if (!ok) throw new Error(data.error || "No se pudo cambiar el horario.");
      current.order = { ...current.order, slot: data.order.slot, slotLabel: data.order.slotLabel };
      renderSlot(current.order);
      loadOrders();
    } catch (error) {
      $("sheetSub").textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  function showOrder(payload, ref) {
    const order = payload.order;
    renderSlot(order);
    $("undoBtn").hidden = !(user && user.role === "admin" && order && order.checkedIn > 0);
    if (!order) {
      $("sheetCounts").replaceChildren();
      $("sheetAdmit").hidden = true;
      openSheet("bad", "Acceso rechazado", "No válido", payload.error || "Este código no es una entrada de Pilates Party.");
      return;
    }
    current = { order, ref };
    renderCounts(order);
    if (payload.valid && order.remaining > 0) {
      admitQty = order.remaining;
      $("sheetAdmit").hidden = false;
      renderAdmitQty();
      openSheet("check", "Entrada pagada", order.name, `${order.phone} · confirma cuántas personas entran.`);
    } else {
      $("sheetAdmit").hidden = true;
      const used = payload.reason === "used";
      openSheet("bad", used ? "Ya utilizado" : "Acceso rechazado", order.name, payload.error || (used ? "Todas las entradas de esta compra ya se usaron." : "Esta compra no es válida."));
    }
  }

  async function lookup(ref) {
    stopCamera();
    try {
      const { data } = await api("/api/pilates/check-in", { method: "POST", body: JSON.stringify(ref) });
      showOrder(data, ref);
    } catch (error) {
      $("sheetAdmit").hidden = true; $("undoBtn").hidden = true; $("sheetCounts").replaceChildren(); renderSlot(null);
      openSheet("bad", "Sin conexión", "No se pudo validar", error.message);
    }
  }

  $("admitBtn").addEventListener("click", async () => {
    if (!current) return;
    $("admitBtn").disabled = true;
    try {
      const { ok, data } = await api("/api/pilates/check-in", { method: "POST", body: JSON.stringify({ ...current.ref, count: admitQty }) });
      if (!ok) { showOrder(data, current.ref); return; }
      current.order = data.order;
      renderCounts(data.order);
      $("sheetAdmit").hidden = true;
      $("undoBtn").hidden = !(user && user.role === "admin");
      openSheet("ok", "Acceso autorizado", data.admitted === 1 ? "Pasa 1 persona" : `Pasan ${data.admitted} personas`, `${data.order.name}${data.order.remaining ? ` · quedan ${data.order.remaining} por llegar` : " · compra completa"}`);
      loadOrders();
    } catch (error) {
      openSheet("bad", "Sin conexión", "No se registró", error.message);
    } finally {
      $("admitBtn").disabled = false;
    }
  });

  $("undoBtn").addEventListener("click", async () => {
    if (!current) return;
    const { ok, data } = await api("/api/pilates/check-in/undo", { method: "POST", body: JSON.stringify({ ...current.ref, count: 1 }) });
    if (!ok) { $("sheetSub").textContent = data.error || "No se pudo corregir."; return; }
    await lookup(current.ref);
    loadOrders();
  });

  // ---------- Cámara ----------
  let stream = null; let frame = null; let detector = null; let busy = false;
  const video = $("video");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  function loadJsQr() {
    if (window.jsQR) return Promise.resolve(window.jsQR);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = JSQR_URL; script.async = true;
      script.onload = () => resolve(window.jsQR);
      script.onerror = () => reject(new Error("No se pudo cargar el lector de QR"));
      document.head.append(script);
    });
  }
  async function getDecoder() {
    if ("BarcodeDetector" in window) {
      try {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (formats.includes("qr_code")) {
          detector = detector || new BarcodeDetector({ formats: ["qr_code"] });
          return async (source) => (await detector.detect(source))[0]?.rawValue || "";
        }
      } catch (e) { /* usar jsQR */ }
    }
    const jsQR = await loadJsQr();
    return async (source) => {
      const w = source.videoWidth || source.naturalWidth || source.width;
      const h = source.videoHeight || source.naturalHeight || source.height;
      if (!w || !h) return "";
      const scale = Math.min(1, 900 / Math.max(w, h));
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data || "";
    };
  }
  let decode = null;

  async function startCamera() {
    if (stream || !$("sheet").hidden) return;
    try {
      decode = decode || await getDecoder();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      video.srcObject = stream;
      await video.play();
      $("camera").classList.add("on");
      $("startCam").hidden = true;
      frame = requestAnimationFrame(loop);
    } catch (error) {
      $("cameraMsg").textContent = `No se pudo activar la cámara (${error.message}). Usa "Tomar foto del QR".`;
    }
  }
  function stopCamera() {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; video.srcObject = null;
    $("camera").classList.remove("on");
    $("startCam").hidden = false;
  }
  async function loop() {
    if (!stream) return;
    if (!busy) {
      busy = true;
      try {
        const value = await decode(video);
        if (value) { busy = false; await lookup({ ticketToken: value.trim() }); return; }
      } catch (e) { /* cuadros iniciales */ }
      busy = false;
    }
    frame = requestAnimationFrame(loop);
  }
  $("startCam").addEventListener("click", startCamera);

  $("photoBtn").addEventListener("click", () => $("photoInput").click());
  $("photoInput").addEventListener("change", async () => {
    const file = $("photoInput").files?.[0];
    if (!file) return;
    stopCamera();
    $("cameraMsg").textContent = "Leyendo la foto…";
    try {
      decode = decode || await getDecoder();
      const image = await createImageBitmap(file);
      const value = await decode(image);
      if (!value) throw new Error("No encontramos un QR en la foto. Intenta de nuevo, más cerca y enfocado.");
      $("cameraMsg").textContent = "Activa la cámara y apunta al QR.";
      await lookup({ ticketToken: value.trim() });
    } catch (error) {
      $("cameraMsg").textContent = error.message;
    } finally {
      $("photoInput").value = "";
    }
  });

  $("manualForm").addEventListener("submit", (event) => {
    event.preventDefault();
    lookup({ ticketToken: $("manualCode").value.trim() });
  });
  window.addEventListener("pagehide", stopCamera);

  // ---------- Inicio ----------
  (async () => {
    if (!token || !user) return showLogin();
    try {
      const { ok, data } = await api("/api/session");
      if (!ok) return showLogin();
      user = data.user; ss.set(USER_KEY, JSON.stringify(user));
      await showApp();
    } catch (e) {
      showLogin();
    }
  })();
})();
