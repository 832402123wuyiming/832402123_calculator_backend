import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createApi} from './controller/api.js';
import {openHistory} from './model/history.js';

export function buildServer({databasePath = './data/calculator.sqlite', allowedOrigins = []} = {}) {
  const history = openHistory(databasePath);
  const server = createServer(createApi(history, allowedOrigins));
  server.on('close', () => history.close());
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
      .split(',').map((origin) => origin.trim()).filter(Boolean);
  const server = buildServer({databasePath: process.env.DB_PATH || './data/calculator.sqlite', allowedOrigins});
  server.listen(port, host, () => console.log(`Calculator API listening on http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
