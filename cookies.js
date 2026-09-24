(() => {
const KEY = 'laQuerendonaConsentV1';
const AGE = 180 * 24 * 60 * 60 * 1000;
let preference = null;
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved?.version === 1 && typeof saved.external === 'boolean' && typeof saved.metrics === 'boolean' && Date.now() - saved.time < AGE) preference = saved;
} catch {}
function applyConsent() {
  document.querySelectorAll('iframe[data-consent-src]').forEach(frame => {
    if (preference?.external) {
      if (frame.getAttribute('src') !== frame.dataset.consentSrc) frame.src = frame.dataset.consentSrc;
    }
    else frame.removeAttribute('src');
    frame.hidden = !preference?.external;
    const placeholder = frame.parentElement.querySelector('.cookie-placeholder');
    if (placeholder) placeholder.hidden = !!preference?.external;
  });
  document.querySelectorAll('link[data-consent-href]').forEach(link => {
    if (preference?.external) link.href = link.dataset.consentHref;
    else link.removeAttribute('href');
  });
  if (preference?.metrics && document.querySelector('meta[name="cookie-performance-enabled"]') && !document.getElementById('consented-speed-insights')) {
    const script = document.createElement('script');
    script.id = 'consented-speed-insights';
    script.src = '/_vercel/speed-insights/script.js';
    document.head.append(script);
  }
}
window.querendonaConsent = { refresh: applyConsent };
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('iframe[data-consent-src]').forEach(frame => {
    const placeholder = document.createElement('div');
    placeholder.className = 'cookie-placeholder';
    placeholder.innerHTML = '<p>Este contenido de YouTube o Google Maps está desactivado.</p><button type="button" data-cookie-settings>Configurar cookies para verlo</button>';
    frame.parentElement.append(placeholder);
  });
  const panel = document.createElement('section');
  panel.className = 'cookie-banner';
  panel.setAttribute('aria-label', 'Preferencias de cookies');
  panel.innerHTML = '<h2>Tú eliges cómo navegar</h2><p>Usamos almacenamiento necesario para el sitio. Puedes permitir contenido externo (videos, mapas y fuentes de Google) y medición de rendimiento de Vercel por separado.</p><a href="/cookies.html">Política de cookies</a><div class="cookie-actions"><button type="button" data-cookie-reject>Rechazar opcionales</button><button type="button" data-cookie-accept>Aceptar todas</button><button type="button" data-cookie-settings>Configurar</button></div>';
  panel.hidden = !!preference;
  document.body.append(panel);
  const dialog = document.createElement('dialog');
  dialog.className = 'cookie-dialog';
  dialog.setAttribute('aria-labelledby', 'cookie-dialog-title');
  dialog.innerHTML = '<h2 id="cookie-dialog-title">Preferencias de cookies</h2><p>Las funciones necesarias permanecen activas. Las opciones siguientes están desactivadas hasta que las permitas.</p><label><input type="checkbox" checked disabled> Necesarias: preferencias y funciones del sitio</label><label><input type="checkbox" id="cookie-external"> Contenido externo: YouTube, mapas y fuentes de Google</label><label><input type="checkbox" id="cookie-metrics"> Rendimiento: Vercel Speed Insights</label><p><a href="/cookies.html">Consultar la política de cookies</a></p><div class="cookie-actions"><button type="button" data-cookie-save>Guardar elección</button><button type="button" data-cookie-reject>Rechazar opcionales</button><button type="button" data-cookie-close>Cerrar</button></div>';
  document.body.append(dialog);
  function save(external, metrics) {
    const revokeMetrics = preference?.metrics && !metrics;
    preference = {version: 1, external, metrics, time: Date.now()};
    try { localStorage.setItem(KEY, JSON.stringify(preference)); } catch {}
    panel.hidden = true;
    dialog.close();
    applyConsent();
    // Reload removes an already running performance script when consent is revoked.
    if (revokeMetrics) location.reload();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-cookie-settings')) {
      dialog.querySelector('#cookie-external').checked = !!preference?.external;
      dialog.querySelector('#cookie-metrics').checked = !!preference?.metrics;
      dialog.showModal();
    }
    if (button.hasAttribute('data-cookie-close')) dialog.close();
    if (button.hasAttribute('data-cookie-accept')) save(true, true);
    if (button.hasAttribute('data-cookie-reject')) save(false, false);
    if (button.hasAttribute('data-cookie-save')) save(dialog.querySelector('#cookie-external').checked, dialog.querySelector('#cookie-metrics').checked);
  });
  window.addEventListener('storage', event => { if (event.key === KEY) location.reload(); });
  applyConsent();
});

})();
