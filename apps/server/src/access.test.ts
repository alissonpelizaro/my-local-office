import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.OFFICE_HOST = '0.0.0.0';
process.env.OFFICE_TOKEN = 'token-de-teste-1234';
const { access, SESSION_COOKIE } = await import('./access.ts');
const cookie = SESSION_COOKIE.split(';')[0];
const lan = { remote: '10.0.0.50', host: '10.0.0.132:4410' };

test('loopback só aceita a própria origem', () => {
  assert.equal(access({ remote: '127.0.0.1', host: '127.0.0.1:4410' }), 'ok');
  assert.equal(access({ remote: '::1', host: 'localhost:4410', origin: 'http://localhost:4410' }), 'ok');
  assert.equal(access({ remote: '127.0.0.1', host: 'evil.com:4410' }), 'forbidden');
  assert.equal(access({ remote: '127.0.0.1', host: '127.0.0.1:4410', origin: 'http://evil.com' }), 'forbidden');
});

test('rede exige token: ?token= vira login, cookie libera', () => {
  assert.equal(access(lan), 'unauthorized');
  assert.equal(access({ ...lan, token: 'errado' }), 'unauthorized');
  assert.equal(access({ ...lan, token: 'token-de-teste-1234' }), 'login');
  assert.equal(access({ ...lan, cookie: `a=1; ${cookie}` }), 'ok');
  assert.equal(access({ ...lan, cookie: 'office_session=abc' }), 'unauthorized');
  assert.equal(access({ ...lan, cookie, origin: 'http://evil.com' }), 'forbidden');
});
