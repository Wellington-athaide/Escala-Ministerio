import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findConflicts } from '../src/conflicts.js';
import { checkAvailability, proposeTeam } from '../src/scheduling.js';

const base = { date: '2026-11-01', endDate: null };
const esc = (id, ministryId, start, end, people, extra = {}) => ({
  id,
  kind: 'escala',
  ministryId,
  title: id,
  ...base,
  start,
  end,
  status: 'confirmada',
  people: people.map((personId) => ({ personId })),
  ...extra,
});

test('mesmo horário em ministérios diferentes é conflito bloqueante', () => {
  const items = [
    esc('mid', 'midia', '18:00', '19:30', ['renata']),
    esc('rec', 'recepcao', '18:00', '19:30', ['renata']),
  ];
  const [conflict] = findConflicts(items);
  assert.equal(conflict.personId, 'renata');
  assert.equal(conflict.type, 'mesmo_horario');
  assert.equal(conflict.severity, 'bloqueante');
  assert.equal(conflict.crossMinistry, true);
  assert.deepEqual(conflict.ministries.sort(), ['midia', 'recepcao']);
});

test('sobreposição parcial de horários', () => {
  const items = [
    esc('mid', 'midia', '18:00', '19:30', ['maely']),
    esc('jun', 'juniores', '19:00', '20:30', ['maely']),
  ];
  const [conflict] = findConflicts(items);
  assert.equal(conflict.type, 'sobreposicao_parcial');
});

test('compromissos consecutivos com intervalo insuficiente', () => {
  // Arthur: mídia termina às 19h e louvor começa às 19h — sem intervalo.
  const items = [
    esc('mid', 'midia', '18:00', '19:00', ['arthur']),
    esc('lou', 'louvor', '19:00', '21:00', ['arthur']),
  ];
  const [conflict] = findConflicts(items, { minGap: 60 });
  assert.equal(conflict.type, 'intervalo_insuficiente');
  assert.equal(conflict.gapMinutes, 0);
});

test('intervalo suficiente não gera conflito', () => {
  const items = [
    esc('mid', 'midia', '18:00', '19:00', ['arthur']),
    esc('lou', 'louvor', '20:00', '21:00', ['arthur']),
  ];
  assert.deepEqual(findConflicts(items, { minGap: 60 }), []);
});

test('escala provisória gera conflito de atenção, não bloqueante', () => {
  const items = [
    esc('mid', 'midia', '18:00', '19:30', ['renata'], { status: 'provisoria' }),
    esc('rec', 'recepcao', '18:00', '19:30', ['renata']),
  ];
  assert.equal(findConflicts(items)[0].severity, 'atencao');
});

test('indisponibilidade bloqueia a pessoa no período', () => {
  const items = [
    { id: 'ind', kind: 'indisponibilidade', ministryId: null, title: 'Viagem', ...base, start: '17:00', end: '23:00', status: 'confirmada', people: [{ personId: 'renata' }] },
    esc('mid', 'midia', '18:00', '19:30', ['renata']),
  ];
  const [conflict] = findConflicts(items);
  assert.equal(conflict.type, 'indisponivel');
  assert.equal(conflict.severity, 'bloqueante');
});

test('evento da igreja não entra na comparação de pessoas', () => {
  const items = [
    { id: 'ev', kind: 'evento', ministryId: null, title: 'Retiro', ...base, start: '18:00', end: '19:30', status: 'confirmada', people: [] },
    esc('mid', 'midia', '18:00', '19:30', ['renata']),
  ];
  assert.deepEqual(findConflicts(items), []);
});

test('turno que atravessa a meia-noite é comparado corretamente', () => {
  const items = [
    esc('mid', 'midia', '22:00', '01:00', ['renata']),
    { ...esc('lou', 'louvor', '00:30', '02:00', ['renata']), date: '2026-11-02' },
  ];
  assert.equal(findConflicts(items).length, 1);
});

test('gerador exclui quem tem escala confirmada no horário antes de atribuir funções', () => {
  const items = [esc('rec', 'recepcao', '18:00', '19:30', ['renata'])];
  const slot = { date: '2026-11-01', start: '18:00', end: '20:00', endDate: null, ministryId: 'midia' };
  const result = proposeTeam({
    slot,
    roles: [{ role: 'Câmera', count: 1 }, { role: 'Som', count: 1 }],
    candidateIds: ['renata', 'joao', 'ana'],
    items,
  });
  assert.ok(!result.people.some((p) => p.personId === 'renata'));
  assert.equal(result.excluded[0].personId, 'renata');
  assert.deepEqual(result.people.map((p) => p.personId), ['joao', 'ana']);
  assert.deepEqual(result.unfilled, []);
});

test('gerador prefere quem não tem conflito suave e informa vagas não preenchidas', () => {
  const items = [esc('prov', 'louvor', '18:00', '19:00', ['ana'], { status: 'provisoria' })];
  const slot = { date: '2026-11-01', start: '18:30', end: '20:00', endDate: null, ministryId: 'midia' };
  const result = proposeTeam({ slot, roles: [{ role: 'Câmera', count: 2 }], candidateIds: ['ana', 'joao'], items });
  assert.deepEqual(result.people.map((p) => p.personId), ['joao', 'ana']);
  assert.equal(result.warnings.length, 1);

  const short = proposeTeam({ slot, roles: [{ role: 'Câmera', count: 3 }], candidateIds: ['ana', 'joao'], items });
  assert.deepEqual(short.unfilled, [{ role: 'Câmera', faltam: 1 }]);
});

test('checkAvailability retorna apenas conflitos com o horário candidato', () => {
  const items = [esc('rec', 'recepcao', '18:00', '19:30', ['renata']), esc('x', 'louvor', '08:00', '09:00', ['renata'])];
  const issues = checkAvailability('renata', { date: '2026-11-01', start: '18:00', end: '19:00', endDate: null, ministryId: 'midia' }, items);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].other.commitmentId, 'rec');
});
