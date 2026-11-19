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

const executar = promisify(execFile);
const opcoes = { cwd: raiz, maxBuffer: 16 * 1024 * 1024 };

// As regras rodam antes, sobre o conjunto completo, como em `npm run verificar`. O
// `--include-only` do grafo descarta os `@g6/*` não resolvidos antes de aplicar as
// regras: sem esta etapa, faltando o `npm ci` na raiz, o SVG sairia sem essas arestas
// e o comando terminaria com sucesso.
try {
  await executar(process.execPath, [depcruise, '--config', '.dependency-cruiser.cjs', 'packages', 'apps'], opcoes);
} catch (erro) {
  process.stdout.write(erro.stdout ?? '');
  process.stderr.write(erro.stderr ?? '');
  console.error('grafo não gerado: as regras de arquitetura falharam (veja `npm run verificar`).');
  process.exit(1);
}

// Só o código de produção: testes e módulos nativos do Node não entram no grafo.
const { stdout: dot } = await executar(
  process.execPath,
  [
    depcruise,
    '--config', '.dependency-cruiser.cjs',
    '--output-type', 'dot',
    '--include-only', '^(packages|apps)/',
    '--exclude', '(^|/)(test|node_modules|dist)/',
    'packages', 'apps',
  ],
  opcoes,
);

const svg = (await instance()).renderString(dot, { format: 'svg', engine: 'dot' });

await mkdir(dirname(saida), { recursive: true });
await writeFile(saida, svg);
console.log(`grafo gerado em ${relative(raiz, saida)}`);
