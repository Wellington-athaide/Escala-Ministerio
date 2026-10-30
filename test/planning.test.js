import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datesOfMonth, planServices } from '../src/planning.js';
import { formatDay, formatTime, toWhatsappText } from '../src/format.js';
import { emptyDb } from '../src/seed.js';
import * as service from '../src/service.js';

test('datesOfMonth lista todos os domingos de novembro de 2026', () => {
  assert.deepEqual(datesOfMonth('2026-11', 0), ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
  assert.equal(datesOfMonth('2026-02', 6).length, 4);
});

test('planServices não escala a mesma pessoa em dois cultos que se encontram', () => {
  const requests = [
    { title: 'Culto A', roles: [{ role: 'Som', count: 1 }], slot: { date: '2026-11-01', start: '18:00', end: '19:00', endDate: null, ministryId: 'midia' } },
    { title: 'Culto B', roles: [{ role: 'Som', count: 1 }], slot: { date: '2026-11-01', start: '19:30', end: '21:00', endDate: null, ministryId: 'midia' } },
  ];
  const [first, second] = planServices(requests, { candidateIds: ['ana'], items: [] });
  assert.equal(first.people[0].personId, 'ana');
  // Ana está no culto A às 18h-19h. O culto B começa 30 min depois: intervalo insuficiente, então não pode.
  assert.deepEqual(second.people, []);
  assert.equal(second.unfilled[0].role, 'Som');
});

test('planServices distribui quem tem menos escalas no lote', () => {
  const requests = ['2026-11-01', '2026-11-08'].map((date) => ({
    title: 'Culto',
    roles: [{ role: 'Som', count: 1 }],
    slot: { date, start: '18:00', end: '20:00', endDate: null, ministryId: 'midia' },
  }));
  const planned = planServices(requests, { candidateIds: ['ana', 'joao'], items: [] });
  assert.equal(planned[0].people[0].personId, 'ana');
  assert.equal(planned[1].people[0].personId, 'joao');
});

test('formatação de horários e datas para o WhatsApp', () => {
  assert.equal(formatTime('18:00'), '18h');
  assert.equal(formatTime('18:30'), '18h30');
  assert.equal(formatDay('2026-11-01'), 'Domingo, 01/11');
});

test('texto do WhatsApp agrupa funções e marca faltas', () => {
  const text = toWhatsappText({
    month: '2026-11',
    services: [{
      title: 'Culto de Domingo',
      slot: { date: '2026-11-01', start: '18:00', end: '20:00' },
      roles: [{ role: 'Câmera', count: 2 }, { role: 'Som', count: 1 }],
      people: [{ role: 'Câmera', personName: 'Arthur Lima' }],
      unfilled: [{ role: 'Câmera', faltam: 1 }, { role: 'Som', faltam: 1 }],
    }],
  });
  assert.match(text, /^\*Escala da Mídia – Novembro de 2026\*/);
  assert.match(text, /\*Domingo, 01\/11 · 18h às 20h\*/);
  assert.match(text, /• Câmera: Arthur Lima, _faltam 1_/);
  assert.match(text, /• Som: _faltam 1_/);
});

test('generateMonth gera todos os cultos do mês e o texto final', () => {
  const db = emptyDb();
  for (const name of ['Ana', 'Joao', 'Maely']) service.createPerson(db, { name });
  const result = service.generateMonth(db, {
    month: '2026-11',
    templates: [
      { weekday: 0, start: '18:00', end: '20:00', title: 'Culto de Domingo', roles: [{ role: 'Som', count: 1 }] },
      { weekday: 3, start: '19:30', end: '21:00', title: 'Culto de Quarta', roles: [{ role: 'Som', count: 1 }] },
    ],
  });
  assert.equal(result.services.length, 5 + 4);
  assert.ok(result.services.every((s) => s.people.length === 1));
  assert.match(result.markdown, /Domingo, 01\/11/);
  assert.match(result.markdown, /Quarta-feira, 04\/11/);
});

test('generateMonth rejeita mês inválido e culto sem funções', () => {
  const db = emptyDb();
  service.createPerson(db, { name: 'Ana' });
  assert.throws(() => service.generateMonth(db, { month: '2026-13', templates: [] }), (e) => e.status === 400);
  assert.throws(() => service.generateMonth(db, { month: '2026-11', templates: [{ weekday: 0, start: '18:00', end: '20:00', roles: [] }] }), (e) => e.status === 400);
});
