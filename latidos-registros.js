(() => {
  const TOKEN_KEY = "latidos-scanner-token";
  const USER_KEY = "latidos-scanner-user";
  const loginSection = document.querySelector("#records-login");
  const loginForm = document.querySelector("#records-login-form");
  const loginFeedback = document.querySelector("#login-feedback");
  const appSection = document.querySelector("#records-app");
  const userLabel = document.querySelector("#records-user");
  const logoutButton = document.querySelector("#records-logout");
  const refreshButton = document.querySelector("#refresh-records");
  const exportButton = document.querySelector("#export-records");
  const filtersForm = document.querySelector("#records-filters");
  const searchInput = document.querySelector("#records-search");
  const experienceFilter = document.querySelector("#experience-filter");
  const registrationFilter = document.querySelector("#registration-filter");
  const paymentFilter = document.querySelector("#payment-filter");
  const tableWrap = document.querySelector("#records-table-wrap");
  const tableBody = document.querySelector("#records-table-body");
  const statusLabel = document.querySelector("#records-status");
  const summaryCompleted = document.querySelector("#summary-completed");
  const summaryPending = document.querySelector("#summary-pending");
  const summaryTickets = document.querySelector("#summary-tickets");
  const summaryRevenue = document.querySelector("#summary-revenue");
  const currencyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
  const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });
  let orders = [];
  let visibleOrders = [];

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function setSession(token, user) {
    if (token && user) {
      sessionStorage.setItem(TOKEN_KEY, token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    }
  }

  function getUser() {
    try {
      return JSON.parse(sessionStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  }

  async function apiFetch(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {})
      }
    });
    if (response.status === 401) {
      setSession(null, null);
      showLogin("Tu sesión terminó. Vuelve a iniciar sesión.");
    }
    return response;
  }

  function showLogin(message = "") {
    loginSection.hidden = false;
    appSection.hidden = true;
    loginFeedback.hidden = !message;
    loginFeedback.textContent = message;
  }

  async function showApp(user) {
    if (user.role !== "admin") {
      setSession(null, null);
      showLogin("Esta página solo está disponible para administradores.");
      return;
    }
    loginSection.hidden = true;
    appSection.hidden = false;
    userLabel.textContent = `${user.name} (Administrador)`;
    await loadRecords();
  }

  async function restoreSession() {
    const user = getUser();
    if (!getToken() || !user) return showLogin();
    const response = await apiFetch("/api/session", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return showLogin();
    const data = await response.json();
    setSession(getToken(), data.user);
    await showApp(data.user);
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = loginForm.querySelector("button[type='submit']");
    const data = new FormData(loginForm);
    submit.disabled = true;
    loginFeedback.hidden = true;

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.get("username"), password: data.get("password") })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No fue posible iniciar sesión");
      if (payload.user?.role !== "admin") throw new Error("Esta página solo está disponible para administradores");
      setSession(payload.token, payload.user);
      loginForm.reset();
      await showApp(payload.user);
    } catch (error) {
      loginFeedback.textContent = error.message;
      loginFeedback.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });

  logoutButton.addEventListener("click", async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setSession(null, null);
    showLogin();
  });

  function formatDate(value) {
    if (!value) return "Sin fecha";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Sin fecha" : dateFormatter.format(date);
  }

  function statusText(status) {
    return ({ approved: "Aprobado", refunded: "Reembolsado", cancelled: "Cancelado" })[status] || status;
  }

  function businessTypeText(value) {
    return ({ industria: "Industria", comercio: "Comercio", servicio: "Servicio" })[value] || "Sin especificar";
  }

  function createBadge(text, className) {
    const badge = document.createElement("span");
    badge.className = `records-badge ${className}`;
    badge.textContent = text;
    return badge;
  }

  function appendText(parent, value, tagName = "small") {
    if (value === undefined || value === null || value === "") return;
    const element = document.createElement(tagName);
    element.textContent = String(value);
    parent.append(element);
  }

  function createCell(label) {
    const cell = document.createElement("td");
    cell.dataset.label = label;
    return cell;
  }

  function renderRow(order) {
    const row = document.createElement("tr");
    const registrationCell = createCell("Registro");
    const buyerCell = createCell("Comprador");
    const contactCell = createCell("Contacto");
    const experienceCell = createCell("Experiencia");
    const ticketCell = createCell("Boletos");
    const paymentCell = createCell("Pago");
    const dateCell = createCell("Fecha");

    registrationCell.append(createBadge(
      order.registration ? "Completo" : "Pendiente",
      order.registration ? "is-complete" : "is-pending"
    ));

    if (order.registration) {
      appendText(buyerCell, order.registration.name, "strong");
      appendText(buyerCell, order.registration.origin);
      appendText(buyerCell, `${order.registration.age} años · ${businessTypeText(order.registration.businessType)}`);

      appendText(contactCell, order.registration.contactName, "strong");
      const email = document.createElement("a");
      email.href = `mailto:${order.registration.email}`;
      email.textContent = order.registration.email;
      const phone = document.createElement("a");
      phone.href = `tel:${order.registration.phone.replace(/[^\d+]/g, "")}`;
      phone.textContent = order.registration.phone;
      contactCell.append(email, phone);
    } else {
      appendText(buyerCell, "Pago aprobado sin formulario", "strong");
      appendText(buyerCell, "Aún no contamos con sus datos");
      appendText(contactCell, "Sin datos de contacto");
    }

    appendText(experienceCell, order.experienceName, "strong");
    appendText(experienceCell, `${order.quantity} ${order.quantity === 1 ? "lugar" : "lugares"}`);

    appendText(ticketCell, `${order.tickets.issued} emitidos`, "strong");
    appendText(ticketCell, `${order.tickets.used} utilizados · ${order.tickets.active} pendientes`);
    if (order.tickets.cancelled) appendText(ticketCell, `${order.tickets.cancelled} cancelados`);

    appendText(paymentCell, currencyFormatter.format(order.total), "strong");
    paymentCell.append(createBadge(statusText(order.paymentStatus), `is-${order.paymentStatus}`));
    appendText(paymentCell, order.paymentId ? `MP: ${order.paymentId}` : "Sin identificador de pago");

    appendText(dateCell, formatDate(order.paidAt), "strong");
    if (order.registration?.createdAt) appendText(dateCell, `Registro: ${formatDate(order.registration.createdAt)}`);

    row.append(registrationCell, buyerCell, contactCell, experienceCell, ticketCell, paymentCell, dateCell);
    return row;
  }

  function updateSummary() {
    const completed = orders.filter((order) => order.registration).length;
    const pending = orders.length - completed;
    const ticketCount = orders.reduce((sum, order) => sum + order.tickets.issued, 0);
    const revenue = orders
      .filter((order) => order.paymentStatus === "approved")
      .reduce((sum, order) => sum + order.total, 0);
    summaryCompleted.textContent = String(completed);
    summaryPending.textContent = String(pending);
    summaryTickets.textContent = String(ticketCount);
    summaryRevenue.textContent = currencyFormatter.format(revenue);
  }

  function applyFilters() {
    const search = searchInput.value.trim().toLocaleLowerCase("es-MX");
    visibleOrders = orders.filter((order) => {
      const registrationState = order.registration ? "completed" : "pending";
      const searchable = [
        order.paymentId,
        order.experienceName,
        order.registration?.name,
        order.registration?.contactName,
        order.registration?.email,
        order.registration?.phone,
        order.registration?.origin
      ].filter(Boolean).join(" ").toLocaleLowerCase("es-MX");
      return (!search || searchable.includes(search)) &&
        (!experienceFilter.value || order.experience === experienceFilter.value) &&
        (!registrationFilter.value || registrationState === registrationFilter.value) &&
        (!paymentFilter.value || order.paymentStatus === paymentFilter.value);
    });

    tableBody.replaceChildren(...visibleOrders.map(renderRow));
    tableWrap.hidden = visibleOrders.length === 0;
    statusLabel.hidden = visibleOrders.length > 0;
    statusLabel.textContent = orders.length === 0
      ? "Todavía no hay pagos confirmados."
      : "No hay registros que coincidan con los filtros.";
    exportButton.disabled = visibleOrders.length === 0;
  }

  async function loadRecords() {
    refreshButton.disabled = true;
    statusLabel.hidden = false;
    statusLabel.textContent = "Cargando registros...";
    tableWrap.hidden = true;
    try {
      const response = await apiFetch("/api/latidos/registrations", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No fue posible cargar los registros");
      orders = Array.isArray(data.orders) ? data.orders : [];
      updateSummary();
      applyFilters();
    } catch (error) {
      orders = [];
      updateSummary();
      tableBody.replaceChildren();
      tableWrap.hidden = true;
      statusLabel.hidden = false;
      statusLabel.textContent = error.message;
      exportButton.disabled = true;
    } finally {
      refreshButton.disabled = false;
    }
  }

  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    if (!visibleOrders.length) return;
    const header = ["Registro", "Nombre o razón social", "Procedencia", "Contacto", "Edad", "Correo", "Teléfono", "Giro", "Experiencia", "Boletos comprados", "Boletos emitidos", "Ingresaron", "Pendientes", "Total", "Estado del pago", "ID de Mercado Pago", "Fecha de pago", "Fecha de registro"];
    const rows = visibleOrders.map((order) => [
      order.registration ? "Completo" : "Pendiente",
      order.registration?.name || "",
      order.registration?.origin || "",
      order.registration?.contactName || "",
      order.registration?.age ?? "",
      order.registration?.email || "",
      order.registration?.phone || "",
      order.registration ? businessTypeText(order.registration.businessType) : "",
      order.experienceName,
      order.quantity,
      order.tickets.issued,
      order.tickets.used,
      order.tickets.active,
      order.total.toFixed(2),
      statusText(order.paymentStatus),
      order.paymentId || "",
      formatDate(order.paidAt),
      order.registration?.createdAt ? formatDate(order.registration.createdAt) : ""
    ]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `registros-latidos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  filtersForm.addEventListener("input", applyFilters);
  filtersForm.addEventListener("change", applyFilters);
  refreshButton.addEventListener("click", loadRecords);
  exportButton.addEventListener("click", exportCsv);
  restoreSession();
})();
