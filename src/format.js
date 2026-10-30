// Texto pronto para copiar e colar no WhatsApp (negrito com *, itálico com _).

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// "18:00" -> "18h", "18:30" -> "18h30"
export function formatTime(hhmm) {
  const [hours, minutes] = hhmm.split(':');
  return minutes === '00' ? `${Number(hours)}h` : `${Number(hours)}h${minutes}`;
}

// "2026-11-01" -> "Domingo, 01/11"
export function formatDay(date) {
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${capitalize(weekday)}, ${date.slice(8)}/${date.slice(5, 7)}`;
}

export function toWhatsappText({ month, services, heading = 'Escala da Mídia' }) {
  const title = month
    ? `${heading} – ${capitalize(MONTHS[Number(month.slice(5)) - 1])} de ${month.slice(0, 4)}`
    : heading;
  const lines = [`*${title}*`, ''];

  for (const service of services) {
    const { slot, roles, people, unfilled } = service;
    lines.push(`*${formatDay(slot.date)} · ${formatTime(slot.start)} às ${formatTime(slot.end)}*`);
    lines.push(`_${service.title}_`);
    for (const { role } of roles) {
      const names = people.filter((p) => p.role === role).map((p) => p.personName);
      const missing = unfilled.find((u) => u.role === role)?.faltam ?? 0;
      if (missing) names.push(`_faltam ${missing}_`);
      lines.push(`• ${role}: ${names.join(', ') || '_sem pessoa disponível_'}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
