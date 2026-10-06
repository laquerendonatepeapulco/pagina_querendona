(() => {
  const form = document.getElementById('posadaForm');
  const date = document.getElementById('eventDate');
  const today = new Date();
  const localDay = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  date.min = localDay;
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const [year,month,day] = values.get('eventDate').split('-');
    const message = ['Hola, La Querendona. Me interesa organizar una posada o reunión de fin de año.', `Grupo: ${values.get('eventType')}.`, `Fecha deseada: ${day}/${month}/${year}.`, `Personas aproximadas: ${values.get('eventGuests')}.`, values.get('eventNotes').trim() ? `Comentarios: ${values.get('eventNotes').trim()}` : '', '¿Me pueden compartir los paquetes, opciones de sede y disponibilidad?'].filter(Boolean).join('\n');
    window.location.assign('https://wa.me/527751051325?text=' + encodeURIComponent(message));
  });
})();
