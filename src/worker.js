import {calculateExpression, CalculationError} from './service/calculator.js';

/** Cloudflare deployment adapter. Arithmetic is shared with the Node.js API. */
const ALLOWED_ORIGINS = [
  'https://wuyiming-832402123-calculator.sleek-ibex-2403.chatgpt.site',
  'https://832402123wuyiming.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function inputError(message, code, status = 400) {
  const error = new CalculationError(message, code);
  error.status = status;
  return error;
}

async function readBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) {
    throw inputError('Use Content-Type: application/json.', 'INVALID_CONTENT_TYPE', 415);
  }
  if (!request.body) throw inputError('The request must contain a valid JSON object.', 'INVALID_JSON');
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 4096) {
      await reader.cancel();
      throw inputError('The request body is too large.', 'PAYLOAD_TOO_LARGE', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
    return body;
  } catch { throw inputError('The request must contain a valid JSON object.', 'INVALID_JSON'); }
}

function integer(value, fallback, maximum) {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) {
    throw inputError('Pagination values must be positive integers within the supported range.', 'INVALID_PAGINATION');
  }
  return Number(value);
}

export default {
  async fetch(request, env) {
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    const origin = request.headers.get('Origin');
    const respond = (status, body) => new Response(JSON.stringify(body), {status, headers});
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return respond(403, {success: false, code: 'ORIGIN_NOT_ALLOWED', message: 'This front-end origin is not allowed.'});
    }
    if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers.Vary = 'Origin'; }
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
    try {
      if (!env.DB) throw inputError('The database is not configured.', 'DATABASE_UNAVAILABLE', 503);
      const url = new URL(request.url);
      if (request.method === 'GET' && ['/', '/api/health'].includes(url.pathname)) {
        await env.DB.prepare('SELECT id FROM calculation_history LIMIT 1').first();
        return respond(200, {success: true, service: 'calculator-backend', database: 'cloudflare-d1-sqlite', status: 'ready'});
      }
      if (request.method === 'POST' && url.pathname === '/api/calculate') {
        const body = await readBody(request);
        const {expression, result} = calculateExpression(body.expression);
        const record = await env.DB.prepare(
            'INSERT INTO calculation_history (expression, result, created_at) VALUES (?, ?, ?) RETURNING id, expression, result, created_at')
            .bind(expression, result, new Date().toISOString()).first();
        return respond(201, {success: true, ...record});
      }
      if (request.method === 'GET' && url.pathname === '/api/history') {
        const page = integer(url.searchParams.get('page'), 1, 1000000);
        const limit = integer(url.searchParams.get('limit'), 10, 100);
        const search = url.searchParams.get('search') || '';
        if (search.length > 256) throw inputError('Search must contain at most 256 characters.', 'INVALID_SEARCH');
        const [records, count] = await env.DB.batch([
          env.DB.prepare('SELECT * FROM calculation_history WHERE instr(expression, ?) > 0 OR instr(result, ?) > 0 ORDER BY id DESC LIMIT ? OFFSET ?')
              .bind(search, search, limit, (page - 1) * limit),
          env.DB.prepare('SELECT COUNT(*) AS total FROM calculation_history WHERE instr(expression, ?) > 0 OR instr(result, ?) > 0')
              .bind(search, search),
        ]);
        return respond(200, {success: true, items: records.results, total: count.results[0].total, page, limit});
      }
      if (request.method === 'DELETE' && /^\/api\/history\/[1-9]\d*$/.test(url.pathname)) {
        const id = Number(url.pathname.split('/').pop());
        if (!Number.isSafeInteger(id)) throw inputError('Invalid record ID.', 'INVALID_ID');
        const removed = await env.DB.prepare('DELETE FROM calculation_history WHERE id = ?').bind(id).run();
        if (!removed.meta.changes) return respond(404, {success: false, code: 'NOT_FOUND', message: 'The history record does not exist.'});
        return respond(200, {success: true, deletedId: id});
      }
      return respond(404, {success: false, code: 'NOT_FOUND', message: 'The API route does not exist.'});
    } catch (error) {
      if (!(error instanceof CalculationError)) console.error('Request failed:', error);
      return respond(error.status || 500, {
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error instanceof CalculationError ? error.message : 'The server could not complete the request.',
      });
    }
  },
};
