(() => {
  const form = document.getElementById('posadaForm');
  const date = document.getElementById('eventDate');

  if (!form || !date) return;

  const today = new Date();
  date.min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const values = new FormData(form);
    const [year, month, day] = values.get('eventDate').split('-');
    const services = values.getAll('services');
    const menu = values.getAll('menu');
    const budget = values.get('eventBudget');
    const notes = values.get('eventNotes').trim();

    const message = [
      'Hola, La Querendona Restaurante/Bar. Quiero cotizar un evento.',
      `Tipo de evento: ${values.get('eventType')}.`,
      `Fecha deseada: ${day}/${month}/${year}.`,
      `Personas aproximadas: ${values.get('eventGuests')} (hasta 150).`,
      `Presupuesto estimado por persona: ${budget ? `$${budget} MXN` : 'por definir'} (rango de $0 a $1,000 MXN).`,
      `Servicios de interés: ${services.length ? services.join(', ') : 'por definir'}.`,
      `Menú de interés: ${menu.length ? menu.join(', ') : 'por definir'}.`,
      notes ? `Comentarios: ${notes}` : '',
      '¿Me ayudan con la propuesta, sede y disponibilidad?'
    ].filter(Boolean).join('\n');

    window.location.assign(`https://wa.me/527751051325?text=${encodeURIComponent(message)}`);
  });
})();
