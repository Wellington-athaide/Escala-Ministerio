const MINUTES_PER_DAY = 24 * 60;
const MAX_SPAN_MINUTES = 2 * MINUTES_PER_DAY;

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// Minutos desde a época (UTC). UTC evita problemas de horário de verão.
function toMinutes(date, time) {
  const [hours, minutes] = time.split(':').map(Number);
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 60000) + hours * 60 + minutes;
}

// Intervalo absoluto de um compromisso. Sem data de término, horário final
// anterior ao inicial significa que o compromisso atravessa a meia-noite.
export function intervalOf({ date, start, endDate, end }) {
  const startMinutes = toMinutes(date, start);
  let endMinutes = toMinutes(endDate || date, end);
  if (!endDate && endMinutes <= startMinutes) endMinutes += MINUTES_PER_DAY;
  return { start: startMinutes, end: endMinutes };
}

export function checkTiming(item) {
  if (!isValidDate(item.date)) return 'data inválida';
  if (!isValidTime(item.start)) return 'horário de início inválido';
  if (!isValidTime(item.end)) return 'horário de término inválido';
  if (item.endDate && !isValidDate(item.endDate)) return 'data de término inválida';
  if (item.start === item.end && !item.endDate) return 'início e término não podem ser iguais';
  const { start, end } = intervalOf(item);
  if (end <= start) return 'término não pode ser anterior ao início';
  if (end - start > MAX_SPAN_MINUTES) return 'duração acima de 48 horas';
  return null;
}
