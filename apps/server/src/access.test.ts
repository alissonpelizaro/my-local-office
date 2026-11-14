import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

process.env.OFFICE_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'office-test-'));
process.env.OFFICE_HOST = '0.0.0.0';
process.env.OFFICE_TOKEN = 'token-de-teste-1234';
const { access, createToken, deleteToken, sessionCookie } = await import('./access.ts');
const cookie = sessionCookie('token-de-teste-1234').split(';')[0];
const lan = { remote: '10.0.0.50', host: '10.0.0.132:4410' };

test('loopback só aceita a própria origem', () => {
  assert.equal(access({ remote: '127.0.0.1', host: '127.0.0.1:4410' }), 'ok');
  assert.equal(access({ remote: '::1', host: 'localhost:4410', origin: 'http://localhost:4410' }), 'ok');
  assert.equal(access({ remote: '127.0.0.1', host: '127.0.0.1:4410', origin: 'http://evil.com' }), 'forbidden');
});

test('loopback com Host externo (túnel ou DNS rebinding) cai na regra do token', () => {
  const tunnel = { remote: '127.0.0.1', host: 'x.ngrok-free.dev', origin: 'https://x.ngrok-free.dev' };
  assert.equal(access(tunnel), 'unauthorized');
  assert.equal(access({ ...tunnel, cookie }), 'ok');
  assert.equal(access({ ...tunnel, cookie, origin: 'http://evil.com' }), 'forbidden');
});

test('rede exige token: ?token= vira login, cookie libera', () => {
  assert.equal(access(lan), 'unauthorized');
  assert.equal(access({ ...lan, token: 'errado' }), 'unauthorized');
  assert.equal(access({ ...lan, token: 'token-de-teste-1234' }), 'login');
  assert.equal(access({ ...lan, cookie: `a=1; ${cookie}` }), 'ok');
  assert.equal(access({ ...lan, cookie: 'office_session=abc' }), 'unauthorized');
  assert.equal(access({ ...lan, cookie, origin: 'http://evil.com' }), 'forbidden');
});

test('token criado na UI entra e, revogado, derruba a sessão', () => {
  const { id, token } = createToken('celular');
  const session = sessionCookie(token).split(';')[0];
  assert.equal(access({ ...lan, token }), 'login');
  assert.equal(access({ ...lan, cookie: session }), 'ok');
  deleteToken(id);
  assert.equal(access({ ...lan, token }), 'unauthorized');
  assert.equal(access({ ...lan, cookie: session }), 'unauthorized');
});
