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
