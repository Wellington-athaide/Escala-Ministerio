import { DEFAULT_MIN_GAP, findConflicts } from './conflicts.js';
import { normalizeText } from './csv-import.js';

const PROPOSAL_ID = '__proposta__';

// Funções que a pessoa sabe fazer. "tudo" cobre qualquer função.
export function canPerform(skills, role) {
  const normalized = skills.map(normalizeText);
  return normalized.includes('tudo') || normalized.includes(normalizeText(role));
}

// Conflitos entre um horário candidato e os compromissos já existentes da pessoa.
export function checkAvailability(personId, slot, items, { minGap = DEFAULT_MIN_GAP } = {}) {
  const candidate = { ...slot, id: PROPOSAL_ID, kind: 'escala', status: 'confirmada', people: [{ personId }] };
  const related = items.filter(
    (item) => item.kind !== 'evento' && (item.people ?? []).some((p) => p.personId === personId),
  );
  return findConflicts([...related, candidate], { minGap })
    .filter((c) => c.first.commitmentId === PROPOSAL_ID || c.second.commitmentId === PROPOSAL_ID)
    .map((c) => ({ ...c, other: c.first.commitmentId === PROPOSAL_ID ? c.second : c.first }));
}

// Monta a equipe de um horário. Quem tem conflito bloqueante com escala confirmada
// ou indisponibilidade é removido ANTES de receber qualquer função. Conflitos suaves
// (com escalas provisórias) não impedem, mas deixam quem os tem por último e geram aviso.
// Cada função só recebe quem sabe fazê-la (`skillsOf`); sem `skillsOf`, qualquer um serve.
export function proposeTeam({ slot, roles, candidateIds, items, minGap, skillsOf = null }) {
  if (!Array.isArray(items)) {
    throw new TypeError('o gerador precisa do calendário de todos os ministérios');
  }
  const canDo = (personId, role) => !skillsOf || canPerform(skillsOf(personId), role);

  const excluded = [];
  const eligible = [];
  for (const personId of candidateIds) {
    const issues = checkAvailability(personId, slot, items, { minGap });
    const blocking = issues.filter((issue) => issue.severity === 'bloqueante');
    if (blocking.length) {
      excluded.push({ personId, motivos: blocking.map(({ type, other, gapMinutes }) => ({ type, other, gapMinutes })) });
      continue;
    }
    eligible.push({ personId, issues });
  }

  // Sort é estável: em empate, mantém a ordem recebida.
  eligible.sort((a, b) => a.issues.length - b.issues.length);
  const pool = [...eligible];

  const people = [];
  const unfilled = [];
  const warnings = [];
  for (const { role, count } of roles) {
    let missing = 0;
    for (let k = 0; k < count; k++) {
      const index = pool.findIndex((candidate) => canDo(candidate.personId, role));
      if (index < 0) {
        missing++;
        continue;
      }
      const [next] = pool.splice(index, 1);
      people.push({ personId: next.personId, role });
      for (const issue of next.issues) warnings.push({ personId: next.personId, ...issue });
    }
    if (missing) unfilled.push({ role, faltam: missing });
  }

  return { people, unfilled, warnings, excluded };
}
