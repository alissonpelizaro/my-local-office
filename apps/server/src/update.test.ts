import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

process.env.OFFICE_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'office-test-'));
const { newer } = await import('./update.ts');

test('compara versões numericamente e ignora sufixo', () => {
  assert.equal(newer('1.10.0', '1.9.3'), true);
  assert.equal(newer('v2.0.0', '1.99.99'), true);
  assert.equal(newer('1.2.3', '1.2.3'), false);
  assert.equal(newer('1.2.3', '1.2.4'), false);
  assert.equal(newer('1.3.0', '1.3.0-dev'), false);
});
