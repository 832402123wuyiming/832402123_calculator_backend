import {calculateExpression, CalculationError} from '../service/calculator.js';

function reply(response, status, body) {
  response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
    const error = new CalculationError('Use Content-Type: application/json.', 'INVALID_CONTENT_TYPE');
    error.status = 415;
    throw error;
  }
  let size = 0;
  const parts = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4096) {
      const error = new CalculationError('The request body is too large.', 'PAYLOAD_TOO_LARGE');
      error.status = 413;
      throw error;
    }
    parts.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
    return body;
  } catch {
    throw new CalculationError('The request must contain a valid JSON object.', 'INVALID_JSON');
  }
}

function positiveInteger(value, fallback, maximum) {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) {
    throw new CalculationError('Pagination values must be positive integers within the supported range.');
  }
  return Number(value);
}

export function createApi(history, allowedOrigins) {
  return async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    const origin = request.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      reply(response, 403, {success: false, code: 'ORIGIN_NOT_ALLOWED', message: 'This front-end origin is not allowed.'});
      return;
    }
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
    }
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/api/health') {
        reply(response, 200, {success: true, service: 'calculator-backend', database: 'sqlite', status: 'ready'});
      } else if (request.method === 'POST' && url.pathname === '/api/calculate') {
        const body = await readJson(request);
        const calculation = calculateExpression(body.expression);
        const record = history.add(calculation.expression, calculation.result);
        reply(response, 201, {success: true, ...record});
      } else if (request.method === 'GET' && url.pathname === '/api/history') {
        const page = positiveInteger(url.searchParams.get('page'), 1, 1000000);
        const limit = positiveInteger(url.searchParams.get('limit'), 10, 100);
        const search = url.searchParams.get('search') || '';
        if (search.length > 256) throw new CalculationError('Search must contain at most 256 characters.');
        reply(response, 200, {success: true, ...history.list({page, limit, search})});
      } else if (request.method === 'DELETE' && /^\/api\/history\/[1-9]\d*$/.test(url.pathname)) {
        const id = Number(url.pathname.split('/').pop());
        if (!Number.isSafeInteger(id) || !history.remove(id)) {
          reply(response, 404, {success: false, code: 'NOT_FOUND', message: 'The history record does not exist.'});
        } else {
          reply(response, 200, {success: true, deletedId: id});
        }
      } else {
        reply(response, 404, {success: false, code: 'NOT_FOUND', message: 'The API route does not exist.'});
      }
    } catch (error) {
      if (!(error instanceof CalculationError)) console.error('Request failed:', error);
      reply(response, error.status || 500, {
        success: false,
        code: error.code || 'INTERNAL_ERROR',
        message: error instanceof CalculationError ? error.message : 'The server could not complete the request.',
      });
    }
  };
}
