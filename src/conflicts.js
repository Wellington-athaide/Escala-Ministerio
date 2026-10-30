import { intervalOf } from './time.js';

// Intervalo mínimo, em minutos, entre dois compromissos consecutivos da mesma pessoa.
export const DEFAULT_MIN_GAP = 60;

export function isConfirmed(item) {
  return item.kind === 'indisponibilidade' || (item.status ?? 'confirmada') === 'confirmada';
}

export function summarize(item) {
  return {
    commitmentId: item.id,
    kind: item.kind ?? 'escala',
    ministryId: item.ministryId ?? null,
    title: item.title,
    date: item.date,
    start: item.start,
    end: item.end,
    endDate: item.endDate ?? null,
    status: item.status ?? 'confirmada',
  };
}

// Encontra todos os conflitos de cada pessoa cruzando os compromissos de todos os ministérios.
// Compromissos de evento não têm pessoas escaladas, então não entram na comparação.
export function findConflicts(items, { minGap = DEFAULT_MIN_GAP } = {}) {
  const byPerson = new Map();
  for (const item of items) {
    if (item.kind === 'evento') continue;
    const { start, end } = intervalOf(item);
    for (const { personId } of item.people ?? []) {
      if (!byPerson.has(personId)) byPerson.set(personId, []);
      byPerson.get(personId).push({ item, start, end });
    }
  }

  const conflicts = [];
  for (const [personId, entries] of byPerson) {
    entries.sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        // Como a lista está ordenada, nenhum compromisso seguinte entra em conflito com `a`.
        if (b.start >= a.end + minGap) break;
        const found = classify(a, b, minGap);
        if (found) conflicts.push({ personId, date: a.item.date, ...found });
      }
    }
  }

  return conflicts.sort((x, y) => x.date.localeCompare(y.date) || x.first.start.localeCompare(y.first.start));
}

function classify(a, b, minGap) {
  if (a.item.id === b.item.id) return null;

  const bothUnavailable = a.item.kind === 'indisponibilidade' && b.item.kind === 'indisponibilidade';
  const eitherUnavailable = a.item.kind === 'indisponibilidade' || b.item.kind === 'indisponibilidade';
  const overlaps = b.start < a.end;

  let type;
  let gapMinutes = null;
  if (overlaps) {
    if (bothUnavailable) return null;
    if (eitherUnavailable) type = 'indisponivel';
    else type = a.start === b.start && a.end === b.end ? 'mesmo_horario' : 'sobreposicao_parcial';
  } else {
    if (eitherUnavailable) return null;
    gapMinutes = b.start - a.end;
    if (gapMinutes >= minGap) return null;
    type = 'intervalo_insuficiente';
  }

  const ministries = [...new Set([a.item.ministryId, b.item.ministryId].filter(Boolean))];
  return {
    type,
    severity: isConfirmed(a.item) && isConfirmed(b.item) ? 'bloqueante' : 'atencao',
    ministries,
    crossMinistry: ministries.length > 1,
    gapMinutes,
    first: summarize(a.item),
    second: summarize(b.item),
  };
}
