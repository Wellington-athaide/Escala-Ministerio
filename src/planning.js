import { proposeTeam } from './scheduling.js';

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
// cultos seguintes, então ninguém é escalado em dois cultos que se encontram. Entre
// candidatos empatados, quem tem menos escalas no lote vem primeiro.
export function planServices(requests, { candidateIds, items, minGap }) {
  const working = [...items];
  const load = new Map();
  return requests.map((request, index) => {
    const ordered = [...candidateIds].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0));
    const result = proposeTeam({ slot: request.slot, roles: request.roles, candidateIds: ordered, items: working, minGap });
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
