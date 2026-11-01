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
  for (const name of ['Ana', 'Joao', 'Maely']) service.createPerson(db, { name, skills: ['Som'] });
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
  service.createPerson(db, { name: 'Ana', skills: ['Som'] });
  assert.throws(() => service.generateMonth(db, { month: '2026-13', templates: [] }), (e) => e.status === 400);
  assert.throws(() => service.generateMonth(db, { month: '2026-11', templates: [{ weekday: 0, start: '18:00', end: '20:00', roles: [] }] }), (e) => e.status === 400);
});

test('só recebe a função quem sabe fazê-la', () => {
  const requests = [{ title: 'Culto', roles: [{ role: 'Projeção', count: 1 }], slot: { date: '2026-11-01', start: '18:00', end: '20:00', endDate: null, ministryId: 'midia' } }];
  const skillsOf = (id) => ({ kaique: ['Câmera'], paulo: ['Projeção'] })[id] ?? [];
  const [planned] = planServices(requests, { candidateIds: ['kaique', 'paulo'], items: [], skillsOf });
  assert.deepEqual(planned.people.map((p) => p.personId), ['paulo']);
});

test('quem faz tudo é o reserva: só entra quando os especialistas estão ocupados', () => {
  const skillsOf = (id) => ({ eu: ['tudo'], kaique: ['Câmera'] })[id] ?? [];
  const requests = [1, 2].map((n) => ({ title: 'Culto', roles: [{ role: 'Câmera', count: 1 }], slot: { date: '2026-11-0' + n, start: '18:00', end: '20:00', endDate: null, ministryId: 'midia' } }));
  const planned = planServices(requests, { candidateIds: ['eu', 'kaique'], items: [], skillsOf });
  assert.deepEqual(planned.map((s) => s.people[0].personId), ['kaique', 'kaique']);
});

test('a mesma pessoa pode voltar em cultos diferentes do mês', () => {
  const skillsOf = () => ['Câmera'];
  const requests = [1, 8].map((n) => ({ title: 'Culto', roles: [{ role: 'Câmera', count: 1 }], slot: { date: '2026-11-0' + n, start: '18:00', end: '20:00', endDate: null, ministryId: 'midia' } }));
  const planned = planServices(requests, { candidateIds: ['renata'], items: [], skillsOf });
  assert.equal(planned[0].people[0].personId, 'renata');
  assert.equal(planned[1].people[0].personId, 'renata');
});

test('cada função recebe exatamente uma pessoa, mesmo se pedida mais de uma vez', () => {
  const db = emptyDb();
  for (const name of ['Ana', 'Joao', 'Maely']) service.createPerson(db, { name, skills: ['Câmera'] });
  const result = service.generateMediaTeam(db, {
    title: 'Culto',
    date: '2026-11-01',
    start: '18:00',
    end: '20:00',
    roles: [{ role: 'Câmera', count: 3 }],
  });
  assert.equal(result.people.length, 1);
  assert.deepEqual(result.unfilled, []);
});

test('culto sem horário vale o dia inteiro e bloqueia quem está num bloco da data', () => {
  const db = emptyDb();
  for (const name of ['Ana', 'Joao']) service.createPerson(db, { name, skills: ['Câmera'] });
  const result = service.generateMonth(db, {
    month: '2026-11',
    templates: [{ weekday: 0, title: 'Culto de Domingo', roles: [{ role: 'Câmera' }] }],
    externalText: '01/11\nAna',
  });
  assert.equal(result.services[0].slot.endDate, '2026-11-02');
  assert.equal(result.services[0].people[0].personName, 'Joao');
});

test('culto do dia inteiro aparece só com a data no texto', () => {
  const text = toWhatsappText({
    services: [{ title: 'Culto', slot: { date: '2026-11-01', start: '00:00', end: '00:00', endDate: '2026-11-02' }, roles: [{ role: 'Som' }], people: [{ role: 'Som', personName: 'Ana' }], unfilled: [] }],
  });
  assert.match(text, /\*Domingo, 01\/11\*/);
  assert.doesNotMatch(text, /0h às 0h/);
});

test('eventos: cada data escolhida vira um evento de dia inteiro com o nome informado', () => {
  const db = emptyDb();
  for (const name of ['Ana', 'Joao']) service.createPerson(db, { name, skills: ['Câmera'] });
  const result = service.generateEvents(db, {
    title: 'Encontro de Jovens',
    dates: ['2026-11-07', '2026-11-06'],
    roles: [{ role: 'Câmera' }],
    externalText: '06/11\nAna',
  });
  assert.deepEqual(result.services.map((s) => s.slot.date), ['2026-11-06', '2026-11-07']);
  assert.equal(result.services[0].people[0].personName, 'Joao');
  assert.match(result.markdown, /^\*Encontro de Jovens\*/);
  assert.match(result.markdown, /_Encontro de Jovens_/);
});

test('eventos: exige pelo menos uma data válida', () => {
  const db = emptyDb();
  service.createPerson(db, { name: 'Ana', skills: ['Câmera'] });
  assert.throws(() => service.generateEvents(db, { dates: [], roles: [{ role: 'Câmera' }] }), (e) => e.status === 400);
  assert.throws(() => service.generateEvents(db, { dates: ['2026-02-30'], roles: [{ role: 'Câmera' }] }), (e) => e.status === 400);
});
