import assert from 'node:assert/strict';
import { test } from 'node:test';
import { providerFull } from './providers.ts';

const emp = (provider_id: number | null) => ({ provider_id });

test('nativo (sem provedor) é ilimitado, mesmo com o slot cheio', () => {
  assert.equal(providerFull([emp(1), emp(1), emp(1)], null, 1), false);
});

test('provedor bloqueia ao atingir o teto e libera o resto', () => {
  assert.equal(providerFull([], 2, 2), false);
  assert.equal(providerFull([emp(2)], 2, 2), false);
  assert.equal(providerFull([emp(2), emp(2)], 2, 2), true);
});

test('conta só o próprio provedor e não confunde com outro', () => {
  assert.equal(providerFull([emp(1), emp(3)], 2, 1), false);
  assert.equal(providerFull([emp(1), emp(2)], 2, 1), true);
});

test('limite 1 serializa, mas o segundo não trava o primeiro', () => {
  // A já roda no provedor; B só enfileira. B (consulta) não entra na fila, então o A nunca trava.
  assert.equal(providerFull([emp(1)], 1, 1), true);
  assert.equal(providerFull([], 1, 1), false);
});
