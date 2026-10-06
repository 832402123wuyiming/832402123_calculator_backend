# Calculator Back End

**Author:** WuYiming · **Student ID:** 832402123

**Live API:** https://wuyiming-832402123-calculator-api.sleek-ibex-2403.chatgpt.site  
**Health check:** https://wuyiming-832402123-calculator-api.sleek-ibex-2403.chatgpt.site/api/health  
**Front end:** https://wuyiming-832402123-calculator.sleek-ibex-2403.chatgpt.site

A standalone HTTP/JSON calculator API. The server parses arithmetic expressions, calculates results, and persists successful calculations in SQLite. The separate front end never supplies a calculated result.

## Technology and runtime

- Node.js 24 or later; built-in HTTP server and `node:sqlite`.
- SQLite database on disk; no database server required.
- A handwritten recursive descent parser with exact `BigInt` fractions.
- No third-party runtime dependencies. Runs on Windows, macOS, and Linux.

The public deployment uses Cloudflare Workers and persistent D1 SQLite through Sites. `src/worker.js` is the HTTP/D1 adapter; it imports the same parser as the local Node.js API. The schema-only migration in `drizzle/0000_calculation_history.sql` initializes the hosted database during deployment. Local Node.js uses a SQLite file and initializes its table at startup.

Install Node.js 24, download this repository, and open a terminal in its root. There are no packages to install; `npm install` is unnecessary.

## Start

```sh
node --env-file-if-exists=.env src/server.js
```

Or run `npm start`. Copy `.env.example` to `.env` if configuration is needed. The API defaults to `http://localhost:3000`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | API port |
| `HOST` | `0.0.0.0` | Listening address |
| `DB_PATH` | `./data/calculator.sqlite` | Persistent SQLite file |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated front-end origins, without paths or trailing slashes |

The first start creates the database directory and table automatically. Preserve the database file and its volume across restarts and redeployments. Database files and `.env` are excluded from Git.

## Connect the front end

Run the separate `832402123_calculator_frontend` repository on port 5173. Its `src/config.js` should contain this API's base URL, without `/api`. For a deployed front end, set `ALLOWED_ORIGINS` to its exact HTTPS origin and use an HTTPS API URL in the client configuration.

## API

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/health` | Service readiness |
| POST | `/api/calculate` | Parse, calculate, save; returns HTTP 201 |
| GET | `/api/history?page=1&limit=10&search=` | Newest-first database history and matching total |
| DELETE | `/api/history/{id}` | Delete one database row; returns HTTP 200 or 404 |

Send JSON with `Content-Type: application/json`:

```json
{"expression":"(1+2)*3"}
```

Example successful response (the ID and timestamp vary):

```json
{
  "success": true,
  "id": 1,
  "expression": "(1+2)*3",
  "result": "9",
  "created_at": "2026-10-06T16:00:00.000Z"
}
```

Results are decimal strings to preserve their formatting and avoid introducing floating-point error when encoding JSON. Decimal results are rounded to at most 12 fractional places, with halfway cases rounded away from zero. Intermediate arithmetic uses exact fractions. Limits: 256 expression characters, 30 digits per numeric literal, and 120 characters in each reduced numerator or denominator. Scientific notation, implicit multiplication, exponentiation, and functions are outside this version's grammar.

Example error:

```json
{"success":false,"code":"DIVISION_BY_ZERO","message":"Division by zero is not allowed."}
```

Malformed expressions/JSON return 400, disallowed browser origins return 403, unknown records/routes return 404, oversized bodies return 413, and incorrect content types return 415. Unexpected internal failures return 500 without revealing database internals. Failed calculations are not saved.

History uses literal substring search, bound SQL parameters, pages starting at 1, and limits from 1 to 100. UTC ISO timestamps are converted to local time by the client.

## Database

```sql
CREATE TABLE calculation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expression TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
```

`src/model/history.js` owns all queries. WAL mode and a five-second busy timeout support the small single-instance application. This coursework demo has shared history and no user authentication; user-isolated history would require accounts and additional schema fields.

## Tests

```sh
node --test
```

The suite checks arithmetic, grammar rejection, numeric limits, division by zero, HTTP status codes, CORS, parameter binding, search, pagination, persistence after restart, and durable deletion. It uses an isolated temporary database.

## Deploy

The public Sites deployment is complete. Its D1 binding is named `DB`, and the migration is applied before the worker is published. The deployed front end and API have separate HTTPS origins. The allowed origins in `src/worker.js` include the live front end.

Build the dependency-free hosted worker entrypoint with:

```sh
node scripts/build-worker.mjs
```

This combines the shared parser and production adapter into `worker/index.js`. The Node.js server and the hosted worker use the same grammar, arithmetic, result format, and API contract. The hosted service remains available independently of the local computer.

The following Docker procedure is an alternative for an existing server:

Use the included `Dockerfile` on an existing Docker-capable server:

```sh
docker build -t calculator-api .
docker run -d --name calculator-api -p 3000:3000 -v calculator-data:/app/data -e ALLOWED_ORIGINS=https://YOUR_FRONTEND_ORIGIN calculator-api
```

Provide HTTPS through a reverse proxy and keep the service running during grading. `YOUR_FRONTEND_ORIGIN` must be replaced before running the command. Ensure the volume is writable by container UID 1000. Only one instance should write to this SQLite database.

`render.yaml` is an optional deployment blueprint for a service with a persistent disk. It specifies a paid plan; review the provider's billing before using it. It has not been deployed from this workspace. Do not host SQLite on an ephemeral filesystem. See [Render persistent disks](https://render.com/docs/disks).

## Structure

```text
src/
  controller/api.js       HTTP validation, CORS, responses
  service/calculator.js   Tokenizer, parser, rational arithmetic
  model/history.js        SQLite initialization and CRUD
  server.js               Service configuration and lifecycle
  worker.js               Public Cloudflare HTTP/D1 adapter
drizzle/                  Hosted database migration
worker/index.js           Generated dependency-free Worker entrypoint
test/                    Parser and HTTP/database tests
codestyle.md             Code standards
```

See [Node.js SQLite documentation](https://nodejs.org/docs/latest-v24.x/api/sqlite.html) and [code standards](codestyle.md).
