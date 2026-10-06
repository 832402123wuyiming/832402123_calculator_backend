import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

export function openHistory(databasePath) {
  if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), {recursive: true});
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS calculation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expression TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
  `);
  const insert = database.prepare(
      'INSERT INTO calculation_history (expression, result, created_at) VALUES (?, ?, ?)');
  const find = database.prepare('SELECT * FROM calculation_history WHERE id = ?');
  const count = database.prepare(
      "SELECT COUNT(*) AS total FROM calculation_history WHERE instr(expression, ?) > 0 OR instr(result, ?) > 0");
  const list = database.prepare(
      'SELECT * FROM calculation_history WHERE instr(expression, ?) > 0 OR instr(result, ?) > 0 ORDER BY id DESC LIMIT ? OFFSET ?');
  const remove = database.prepare('DELETE FROM calculation_history WHERE id = ?');
  return {
    add(expression, result) {
      const createdAt = new Date().toISOString();
      const record = insert.run(expression, result, createdAt);
      return find.get(Number(record.lastInsertRowid));
    },
    list({page = 1, limit = 10, search = ''} = {}) {
      return {
        items: list.all(search, search, limit, (page - 1) * limit),
        total: count.get(search, search).total,
        page,
        limit,
      };
    },
    remove(id) { return remove.run(id).changes > 0; },
    close() { database.close(); },
  };
}
