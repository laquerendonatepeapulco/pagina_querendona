(() => {
  const TOKEN_KEY = "latidos-scanner-token";
  const USER_KEY = "latidos-scanner-user";
  const loginSection = document.querySelector("#scanner-login");
  const loginForm = document.querySelector("#scanner-login-form");
  const loginFeedback = document.querySelector("#login-feedback");
  const appSection = document.querySelector("#scanner-app");
  const userLabel = document.querySelector("#scanner-user");
  const logoutButton = document.querySelector("#scanner-logout");
  const summaryGrid = document.querySelector("#scanner-summary-grid");
  const refreshButton = document.querySelector("#refresh-summary");
  const startButton = document.querySelector("#start-scanner");
  const nextButton = document.querySelector("#next-ticket");
  const camera = document.querySelector("#scanner-camera");
  const video = document.querySelector("#scanner-video");
  const cameraPlaceholder = document.querySelector("#camera-placeholder");
  const manualForm = document.querySelector("#manual-ticket-form");
  const manualInput = document.querySelector("#manual-ticket-token");
  const resultPanel = document.querySelector("#scanner-result");
  const resultLabel = document.querySelector("#scanner-result-label");
  const resultTitle = document.querySelector("#scanner-result-title");
  const resultMessage = document.querySelector("#scanner-result-message");
  const resultDetails = document.querySelector("#scanner-result-details");
  let stream = null;
  let scanFrame = null;
  let detector = null;
  let isValidating = false;

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
      showLogin();
    }
    return response;
  }

  function showLogin() {
    stopCamera();
    loginSection.hidden = false;
    appSection.hidden = true;
  }

  async function showApp(user) {
    loginSection.hidden = true;
    appSection.hidden = false;
    userLabel.textContent = `${user.name} (${user.role === "admin" ? "Administrador" : "Personal"})`;
    await loadSummary();
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

  logoutButton.addEventListener("click", () => {
    setSession(null, null);
    showLogin();
  });

  async function loadSummary() {
    summaryGrid.textContent = "Cargando resumen...";
    try {
      const response = await apiFetch("/api/latidos/check-in/summary", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No fue posible cargar el resumen");
      summaryGrid.replaceChildren();
      data.experiences.forEach((experience) => {
        const card = document.createElement("article");
        card.className = "scanner-summary-card";
        const heading = document.createElement("h3");
        heading.textContent = experience.name;
        const numbers = document.createElement("div");
        numbers.className = "scanner-summary-numbers";
        [["Ingresaron", experience.used], ["Pendientes", experience.active], ["Emitidos", experience.issued]].forEach(([label, value]) => {
          const item = document.createElement("span");
          const strong = document.createElement("strong");
          strong.textContent = String(value);
          item.append(strong, label);
          numbers.append(item);
        });
        card.append(heading, numbers);
        summaryGrid.append(card);
      });
    } catch (error) {
      summaryGrid.textContent = error.message;
    }
  }

  refreshButton.addEventListener("click", loadSummary);

  async function startCamera() {
    clearResult();
    if (!("BarcodeDetector" in window)) {
      cameraPlaceholder.textContent = "Este navegador no permite escanear directamente. Usa Chrome o ingresa el código manualmente.";
      cameraPlaceholder.hidden = false;
      return;
    }

    try {
      const supported = await BarcodeDetector.getSupportedFormats();
      if (!supported.includes("qr_code")) throw new Error("Este dispositivo no permite leer códigos QR");
      detector = new BarcodeDetector({ formats: ["qr_code"] });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      video.srcObject = stream;
      await video.play();
      camera.classList.add("is-active");
      cameraPlaceholder.hidden = true;
      startButton.hidden = true;
      nextButton.hidden = true;
      scanFrame = requestAnimationFrame(scanLoop);
    } catch (error) {
      cameraPlaceholder.textContent = `No se pudo activar la cámara: ${error.message}. Puedes ingresar el código manualmente.`;
      cameraPlaceholder.hidden = false;
    }
  }

  async function scanLoop() {
    if (!stream || isValidating) return;
    try {
      const codes = await detector.detect(video);
      if (codes[0]?.rawValue) {
        await validateTicket(codes[0].rawValue);
        return;
      }
    } catch {
      // Algunos dispositivos fallan durante los primeros cuadros de video.
    }
    scanFrame = requestAnimationFrame(scanLoop);
  }

  function stopCamera() {
    if (scanFrame) cancelAnimationFrame(scanFrame);
    scanFrame = null;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    camera.classList.remove("is-active");
  }

  function clearResult() {
    resultPanel.hidden = true;
    resultPanel.className = "scanner-result";
    resultDetails.replaceChildren();
  }

  function appendDetail(label, value) {
    if (!value) return;
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    wrapper.append(term, detail);
    resultDetails.append(wrapper);
  }

  function showResult(payload) {
    const valid = Boolean(payload.valid);
    const ticket = payload.ticket || {};
    resultPanel.hidden = false;
    resultPanel.className = `scanner-result ${valid ? "is-valid" : "is-invalid"}`;
    resultLabel.textContent = valid ? "Boleto válido" : "Acceso rechazado";
    resultTitle.textContent = valid ? "Acceso autorizado" : payload.reason === "used" ? "Ya utilizado" : "No válido";
    resultMessage.textContent = payload.message || payload.error || "No fue posible validar este boleto";
    resultDetails.replaceChildren();
    appendDetail("Boleto", ticket.ticketNumber);
    appendDetail("Titular", ticket.customerName);
    appendDetail("Experiencia", ticket.experienceName);
    appendDetail("Acceso", ticket.sequence && ticket.quantity ? `${ticket.sequence} de ${ticket.quantity}` : "");
    if (!valid && ticket.usedAt) appendDetail("Utilizado", new Date(ticket.usedAt).toLocaleString("es-MX"));
    nextButton.hidden = false;
    startButton.hidden = true;
  }

  async function validateTicket(ticketToken) {
    if (isValidating) return;
    isValidating = true;
    stopCamera();
    try {
      const response = await apiFetch("/api/latidos/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketToken: String(ticketToken || "").trim() })
      });
      const payload = await response.json().catch(() => ({ valid: false, error: "Respuesta no válida del servidor" }));
      showResult(payload);
      if (response.ok) await loadSummary();
    } catch (error) {
      showResult({ valid: false, reason: "network", error: `Sin conexión: ${error.message}` });
    } finally {
      isValidating = false;
    }
  }

  startButton.addEventListener("click", startCamera);
  nextButton.addEventListener("click", () => {
    clearResult();
    manualInput.value = "";
    startButton.hidden = false;
    nextButton.hidden = true;
    cameraPlaceholder.textContent = "Presiona el botón para activar la cámara.";
    cameraPlaceholder.hidden = false;
  });
  manualForm.addEventListener("submit", (event) => {
    event.preventDefault();
    validateTicket(manualInput.value);
  });
  window.addEventListener("pagehide", stopCamera);

  restoreSession();
})();
