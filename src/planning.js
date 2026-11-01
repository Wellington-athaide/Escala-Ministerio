import { proposeTeam } from './scheduling.js';
import { normalizeText } from './text.js';

// Todas as datas (AAAA-MM-DD) de um mês (AAAA-MM) que caem no dia da semana informado (0 = domingo).
export function datesOfMonth(month, weekday) {
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dates = [];
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(Date.UTC(year, monthNumber - 1, day));
    if (date.getUTCDay() === weekday) dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

// Monta a equipe de cada culto em sequência. Cada escolha entra no calendário usado pelos
// cultos seguintes, então ninguém fica em dois cultos que se sobrepõem ou quase. A mesma
// pessoa pode voltar em outros cultos. Entre candidatos empatados, quem tem menos escalas
// no lote vem primeiro. Quem faz tudo fica sempre por último, como reserva.
export function planServices(requests, { candidateIds, items, minGap, skillsOf = null, allowedOn = () => true }) {
  const working = [...items];
  const load = new Map();
  const isGeneralist = (personId) => (skillsOf?.(personId) ?? []).some((s) => normalizeText(s) === 'tudo');

  return requests.map((request, index) => {
    const ordered = [...candidateIds].sort(
      (a, b) => Number(isGeneralist(a)) - Number(isGeneralist(b)) || (load.get(a) ?? 0) - (load.get(b) ?? 0),
    );
    const result = proposeTeam({ slot: request.slot, roles: request.roles, candidateIds: ordered, items: working, minGap, skillsOf, allowedOn });
    for (const { personId } of result.people) load.set(personId, (load.get(personId) ?? 0) + 1);
    working.push({
      ...request.slot,
      id: `planejado-${index}`,
      kind: 'escala',
      title: request.title,
      status: 'confirmada',
      people: result.people.map(({ personId, role }) => ({ personId, role })),
    });
    return { ...request, ...result };
  });
}
