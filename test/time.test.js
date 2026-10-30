import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkTiming } from '../src/time.js';

test('checkTiming rejeita início igual ao término e aceita virada de noite', () => {
  assert.equal(checkTiming({ date: '2026-11-01', start: '18:00', end: '18:00' }), 'início e término não podem ser iguais');
  assert.equal(checkTiming({ date: '2026-11-01', start: '22:00', end: '01:00' }), null);
  assert.equal(checkTiming({ date: '2026-11-01', start: '22:00', end: '01:00', endDate: '2026-11-01' }), 'término não pode ser anterior ao início');
  assert.equal(checkTiming({ date: '2026-02-30', start: '18:00', end: '20:00' }), 'data inválida');
});
