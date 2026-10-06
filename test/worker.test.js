import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';

test('Hosted adapter uses SQLite queries for calculation, history, and deletion', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_calculation_history.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      return {
        bind(...parameters) { values = parameters; return this; },
        async first() { return statement.get(...values) || null; },
        async all() { return {results: statement.all(...values)}; },
        async run() { return {meta: statement.run(...values)}; },
      };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.all())); },
  };
  const request = async (path, method = 'GET', body, origin) => {
    const headers = body === undefined ? {} : {'Content-Type': 'application/json'};
    if (origin) headers.Origin = origin;
    const response = await worker.fetch(new Request(`https://api.example${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    }), {DB});
    return {status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers};
  };
  try {
    assert.equal((await request('/api/health')).body.database, 'cloudflare-d1-sqlite');
    const created = await request('/api/calculate', 'POST', {expression: '(1+2)*3'});
    assert.equal(created.status, 201);
    assert.equal(created.body.result, '9');
    assert.equal((await request('/api/calculate', 'POST', {expression: '0.1+0.2'})).body.result, '0.3');
    assert.equal((await request('/api/calculate', 'POST', {expression: '1/0'})).status, 400);
    assert.equal((await request('/api/history')).body.total, 2);
    assert.equal((await request('/api/history?search=0.1')).body.total, 1);
    assert.equal((await request('/api/history?page=0')).status, 400);
    assert.equal((await request('/api/history?limit=1&page=2')).body.items[0].id, created.body.id);
    const cors = await request('/api/history', 'GET', undefined, 'https://832402123wuyiming.github.io');
    assert.equal(cors.headers.get('access-control-allow-origin'), 'https://832402123wuyiming.github.io');
    assert.equal((await request('/api/history', 'GET', undefined, 'https://untrusted.example')).status, 403);
    assert.equal((await request('/api/calculate', 'OPTIONS')).status, 204);
    assert.equal((await request('/api/history/' + created.body.id, 'DELETE')).status, 200);
    assert.equal((await request('/api/history/' + created.body.id, 'DELETE')).status, 404);
    assert.equal((await request('/api/history')).body.total, 1);
    const missing = await worker.fetch(new Request('https://api.example/api/health'), {});
    assert.equal(missing.status, 503);
  } finally { sqlite.close(); }
});
