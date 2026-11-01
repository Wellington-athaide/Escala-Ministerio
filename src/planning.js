import { proposeTeam, checkAvailability, canPerform } from './scheduling.js';
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

// Dias de intervalo mínimo entre duas escalas reservadas da mesma pessoa.
const MIN_DAYS_BETWEEN_RESERVED = 7;
const daysBetween = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;

// Monta a equipe de cada culto em sequência. Cada escolha entra no calendário usado pelos
// cultos seguintes, então ninguém fica em dois cultos que se sobrepõem ou quase. A mesma
// pessoa pode voltar em outros cultos. Entre candidatos empatados, quem tem menos escalas
// no lote vem primeiro. Quem faz tudo fica sempre por último, como reserva.
//
// `minimums` (personId -> n) garante que a pessoa seja escalada pelo menos n vezes no lote:
// esses cultos são reservados antes, em ordem cronológica, respeitando funções, dias e conflitos.
export function planServices(requests, { candidateIds, items, minGap, skillsOf = null, allowedOn = () => true, minimums = new Map() }) {
  const canDo = (personId, role) => !skillsOf || canPerform(skillsOf(personId), role);
  const isGeneralist = (personId) => (skillsOf?.(personId) ?? []).some((s) => normalizeText(s) === 'tudo');

  // 1) Reserva os cultos de quem tem mínimo, espaçados de pelo menos 7 dias.
  // Só aceita datas mais próximas se não houver outra opção.
  const reserved = requests.map(() => []);
  const reservedItems = [];
  for (const [personId, wanted] of minimums) {
    const reservedDates = [];
    let placed = 0;
    for (const strictSpacing of [true, false]) {
      for (let index = 0; index < requests.length && placed < wanted; index++) {
        const request = requests[index];
        const tooClose = reservedDates.some((d) => daysBetween(d, request.slot.date) < MIN_DAYS_BETWEEN_RESERVED);
        if (strictSpacing && tooClose) continue;
        if (reserved[index].some((r) => r.personId === personId)) continue;
        if (!allowedOn(personId, request.slot.date)) continue;
        const role = request.roles.find((r) => !reserved[index].some((x) => x.role === r.role) && canDo(personId, r.role));
        if (!role) continue;
        const clash = checkAvailability(personId, request.slot, [...items, ...reservedItems], { minGap });
        if (clash.some((c) => c.severity === 'bloqueante')) continue;
        reserved[index].push({ personId, role: role.role });
        reservedItems.push({ ...request.slot, id: `reservado-${index}-${personId}`, kind: 'escala', title: request.title, status: 'confirmada', people: [{ personId }] });
        reservedDates.push(request.slot.date);
        placed++;
      }
    }
  }

  // 2) Monta os demais cultos. Quem já está reservado num culto não entra de novo nele.
  const working = [...items, ...reservedItems];
  const load = new Map();
  return requests.map((request, index) => {
    const pre = reserved[index];
    const roles = request.roles.filter((r) => !pre.some((p) => p.role === r.role));
    const ordered = [...candidateIds]
      .filter((id) => !pre.some((p) => p.personId === id))
      .sort((a, b) => Number(isGeneralist(a)) - Number(isGeneralist(b)) || (load.get(a) ?? 0) - (load.get(b) ?? 0));
    const result = proposeTeam({ slot: request.slot, roles, candidateIds: ordered, items: working, minGap, skillsOf, allowedOn });
    const people = [...pre, ...result.people];
    for (const { personId } of people) load.set(personId, (load.get(personId) ?? 0) + 1);
    working.push({
      ...request.slot,
      id: `planejado-${index}`,
      kind: 'escala',
      title: request.title,
      status: 'confirmada',
      people: result.people.map(({ personId, role }) => ({ personId, role })),
    });
    return { ...request, ...result, people };
  });
}
