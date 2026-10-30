(() => {
  const deco = document.querySelector('.hero-flores');
  const hero = document.querySelector('.posada-hero');
  if (!deco || !hero) return;
  const fit = () => {
    const bottom = hero.getBoundingClientRect().bottom + window.scrollY;
    deco.style.setProperty('--hero-h', `${Math.max(0, bottom - deco.offsetTop)}px`);
  };
  fit();
  window.addEventListener('load', fit);
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(hero);
  else window.addEventListener('resize', fit);
})();

(() => {
  const form = document.getElementById('posadaForm');
  const date = document.getElementById('eventDate');

  if (!form || !date) return;

  const today = new Date();
  date.min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const guests = document.getElementById('eventGuests');
  const budget = document.getElementById('eventBudget');
  const sim = document.getElementById('budgetSim');
  const simTotal = document.getElementById('budgetTotal');
  const simDetail = document.getElementById('budgetDetail');
  const money = value => `$${value.toLocaleString('es-MX')} MXN`;

  const estimate = () => {
    const people = Math.min(Math.max(parseInt(guests.value, 10) || 0, 0), 150);
    const perPerson = Math.min(Math.max(parseInt(budget.value, 10) || 0, 0), 1000);
    if (!people || budget.value === '') return null;
    return { people, perPerson, total: people * perPerson };
  };

  const updateEstimate = () => {
    if (!sim) return;
    const result = estimate();
    sim.hidden = !result;
    if (!result) return;
    simTotal.textContent = money(result.total);
    simDetail.textContent = `${result.people} ${result.people === 1 ? 'persona' : 'personas'} × ${money(result.perPerson)} por persona`;
  };

  const range = document.getElementById('eventBudgetRange');
  const valueOut = document.getElementById('budgetValue');
  const hint = document.getElementById('budgetHint');
  const clearBtn = document.getElementById('budgetClear');

  const paintBudget = value => {
    if (!range) return;
    const empty = value === null;
    range.classList.toggle('is-empty', empty);
    valueOut.classList.toggle('is-empty', empty);
    valueOut.textContent = empty ? 'Por definir' : money(value);
    if (!empty) range.value = value;
    range.style.setProperty('--fill', `${(empty ? 0 : value) / 10}%`);
    range.setAttribute('aria-valuetext', empty ? 'Por definir' : `${money(value)} por persona`);
    if (hint) hint.hidden = !empty;
    if (clearBtn) clearBtn.hidden = empty;
  };

  if (range) {
    const fromRange = () => {
      budget.value = range.value;
      paintBudget(Number(range.value));
      updateEstimate();
    };
    range.addEventListener('input', fromRange);
    range.addEventListener('change', fromRange);
    range.addEventListener('pointerup', fromRange);

    budget.addEventListener('input', () => {
      const raw = budget.value.trim();
      paintBudget(raw === '' ? null : Math.min(Math.max(parseInt(raw, 10) || 0, 0), 1000));
      updateEstimate();
    });
    budget.addEventListener('blur', () => {
      if (budget.value.trim() === '') return;
      budget.value = Math.min(Math.max(parseInt(budget.value, 10) || 0, 0), 1000);
    });

    clearBtn?.addEventListener('click', () => {
      budget.value = '';
      range.value = 500;
      paintBudget(null);
      updateEstimate();
      range.focus();
    });

    paintBudget(budget.value.trim() === '' ? null : Number(budget.value));
  } else {
    budget.addEventListener('input', updateEstimate);
  }

  guests.addEventListener('input', updateEstimate);

  const updateCounts = () => {
    form.querySelectorAll('.service-option').forEach(group => {
      const count = group.querySelectorAll('input:checked').length;
      const badge = group.querySelector('.service-count');
      if (badge) badge.textContent = count ? `${count} ${count === 1 ? 'elegido' : 'elegidos'}` : '';
    });
  };

  form.addEventListener('change', event => {
    if (event.target.name === 'services') updateCounts();
  });

  const servicesSummary = () => {
    const groups = new Map();
    form.querySelectorAll('input[name="services"]:checked').forEach(input => {
      const group = input.dataset.group || 'Otros';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(input.value);
    });
    if (!groups.size) return 'Servicios de interés: por definir.';
    return ['Servicios de interés:', ...[...groups].map(([group, items]) => `• ${group}: ${items.join(', ')}.`)].join('\n');
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const values = new FormData(form);
    const [year, month, day] = values.get('eventDate').split('-');
    const menu = values.getAll('menu');
    const perPerson = values.get('eventBudget');
    const notes = values.get('eventNotes').trim();
    const result = estimate();

    const message = [
      'Hola, La Querendona Restaurante/Bar. Quiero cotizar un evento.',
      `Tipo de evento: ${values.get('eventType')}.`,
      `Fecha deseada: ${day}/${month}/${year}.`,
      `Personas aproximadas: ${values.get('eventGuests')} (hasta 150).`,
      `Presupuesto estimado por persona: ${perPerson ? money(Number(perPerson)) : 'por definir'} (rango de $0 a $1,000 MXN).`,
      result ? `Total estimado del simulador: ${money(result.total)} (no es un precio real).` : '',
      servicesSummary(),
      `Menú de interés: ${menu.length ? menu.join(', ') : 'por definir'}.`,
      notes ? `Comentarios: ${notes}` : '',
      '¿Me ayudan con la propuesta, sede y disponibilidad?'
    ].filter(Boolean).join('\n');

    window.location.assign(`https://wa.me/527751051325?text=${encodeURIComponent(message)}`);
  });
})();
