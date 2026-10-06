import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildServer} from '../src/server.js';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

test('API, database persistence, deletion, search, CORS, and invalid input', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'calculator-test-'));
  const settings = {databasePath: join(directory, 'history.sqlite'), allowedOrigins: ['http://localhost:5173']};
  let server = buildServer(settings);
  let base = await listen(server);
  const request = async (path, options) => {
    const response = await fetch(base + path, options);
    const body = response.status === 204 ? null : await response.json();
    return {status: response.status, body, headers: response.headers};
  };
  const calculate = (expression) => request('/api/calculate', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({expression}),
  });
  try {
    assert.equal((await request('/api/health')).status, 200);
    const created = await calculate('(1+2)*3');
    assert.equal(created.status, 201);
    assert.equal(created.body.result, '9');
    assert.ok(created.body.id > 0);
    assert.ok(!Number.isNaN(Date.parse(created.body.created_at)));
    assert.equal((await calculate('0.1+0.2')).body.result, '0.3');
    assert.equal((await calculate('1/0')).status, 400);
    assert.equal((await calculate('process.exit()')).status, 400);
    assert.equal((await request('/api/history')).body.total, 2);
    assert.equal((await request('/api/history?search=0.1')).body.total, 1);
    assert.equal((await request('/api/history?limit=1&page=2')).body.items[0].id, created.body.id);
    assert.equal((await request('/api/history?page=0')).status, 400);
    assert.equal((await request('/api/history?limit=101')).status, 400);
    assert.equal((await request('/api/history?search=%27%20OR%201%3D1')).body.total, 0);
    const cors = await request('/api/history', {headers: {Origin: 'http://localhost:5173'}});
    assert.equal(cors.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal((await request('/api/history', {headers: {Origin: 'https://untrusted.example'}})).status, 403);
    const preflight = await request('/api/calculate', {method: 'OPTIONS', headers: {Origin: 'http://localhost:5173'}});
    assert.equal(preflight.status, 204);
    assert.equal((await request('/api/calculate', {method: 'POST', body: '{}'})).status, 415);
    assert.equal((await request('/api/calculate', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{'})).status, 400);
    assert.equal((await request('/api/calculate', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '[]'})).status, 400);
    assert.equal((await request('/api/calculate', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({expression: '1', padding: 'x'.repeat(5000)})})).status, 413);
    await close(server);
    server = buildServer(settings);
    base = await listen(server);
    assert.equal((await request('/api/history')).body.total, 2, 'rows survive server restart');
    assert.equal((await request(`/api/history/${created.body.id}`, {method: 'DELETE'})).status, 200);
    assert.equal((await request('/api/history')).body.total, 1);
    assert.equal((await request(`/api/history/${created.body.id}`, {method: 'DELETE'})).status, 404);
    await close(server);
    server = buildServer(settings);
    base = await listen(server);
    assert.equal((await request('/api/history')).body.total, 1, 'deletion survives server restart');
    assert.equal((await request('/unknown')).status, 404);
  } finally {
    await close(server);
    rmSync(directory, {recursive: true, force: true});
  }
});
