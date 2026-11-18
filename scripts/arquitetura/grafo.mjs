// Gera o grafo de dependências entre pacotes (Visão de Implementação, #18).
// depcruise --output-type dot → Graphviz em WASM (@viz-js/viz) → SVG, sem
// exigir o Graphviz instalado no sistema.
//
// Uso: npm run grafo --prefix scripts/arquitetura
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { instance } from '@viz-js/viz';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..', '..');
const saida = join(aqui, 'grafo', 'dependencias.svg');
// Chama o CLI pelo próprio `node` em vez de `node_modules/.bin/depcruise`,
// que no Windows é um `.cmd` e não roda via execFile.
const depcruise = join(aqui, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruiser.mjs');

if (!existsSync(depcruise)) {
  console.error('dependency-cruiser não instalado: rode `npm ci --prefix scripts/arquitetura`.');
  process.exit(1);
}

// Só o código de produção: testes e módulos nativos do Node não entram no grafo.
const { stdout: dot } = await promisify(execFile)(
  process.execPath,
  [
    depcruise,
    '--config', '.dependency-cruiser.cjs',
    '--output-type', 'dot',
    '--include-only', '^(packages|apps)/',
    '--exclude', '(^|/)(test|node_modules|dist)/',
    'packages', 'apps',
  ],
  { cwd: raiz, maxBuffer: 16 * 1024 * 1024 },
);

const svg = (await instance()).renderString(dot, { format: 'svg', engine: 'dot' });

await mkdir(dirname(saida), { recursive: true });
await writeFile(saida, svg);
console.log(`grafo gerado em ${relative(raiz, saida)}`);
