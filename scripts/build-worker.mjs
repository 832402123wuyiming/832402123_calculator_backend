import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';

// The hosted artifact is a dependency-free, single-file ES module.
const parser = readFileSync(new URL('../src/service/calculator.js', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8')
    .replace(/^import .*?;\r?\n/, '');
mkdirSync(new URL('../worker/', import.meta.url), {recursive: true});
writeFileSync(new URL('../worker/index.js', import.meta.url), `${parser}\n${adapter}`);
console.log('Built worker/index.js from the shared parser and D1 adapter.');
