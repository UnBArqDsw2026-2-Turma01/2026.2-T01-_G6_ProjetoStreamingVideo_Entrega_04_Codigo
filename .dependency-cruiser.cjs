/**
 * Fitness functions da Visão Lógica (#18) — regra 2 do guia (#1).
 *
 * - Um contexto (`packages/<contexto>`) só conhece o próprio código e o
 *   `@g6/shared-kernel`; nunca outro contexto nem um app.
 * - O `shared-kernel` não depende de nada do monorepo.
 * - Só `apps/*` compõem módulos reais e ficam livres dessas restrições.
 *
 * Os caminhos usam `(?:^|/)packages/` para valerem também na violação
 * proposital de `scripts/arquitetura/violacao-proposital/`, que reproduz a
 * mesma estrutura de pastas e precisa fazer o comando falhar.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'contexto-so-importa-shared-kernel',
      severity: 'error',
      comment:
        'Um contexto só pode importar @g6/shared-kernel. A integração entre contextos acontece em apps/* (guia #1, regra 2).',
      from: {
        path: '(?:^|/)packages/([^/]+)/',
        pathNot: '(?:^|/)packages/shared-kernel/',
      },
      to: {
        path: '(?:^|/)(?:packages|apps)/',
        pathNot: ['(?:^|/)packages/$1/', '(?:^|/)packages/shared-kernel/'],
      },
    },
    {
      name: 'shared-kernel-isolado',
      severity: 'error',
      comment:
        'O shared-kernel é o contrato comum e não pode depender de nenhum contexto nem app do monorepo.',
      from: {
        path: '(?:^|/)packages/shared-kernel/',
      },
      to: {
        path: '(?:^|/)(?:packages|apps)/',
        pathNot: '(?:^|/)packages/shared-kernel/',
      },
    },
    {
      // As regras acima comparam o caminho resolvido. Um `@g6/*` que não
      // resolve (ex.: sem `npm ci` na raiz, sem os symlinks do workspace)
      // fica com o nome cru e escaparia delas, dando um falso verde.
      name: 'g6-nao-resolvido',
      severity: 'error',
      comment:
        'Todo import @g6/* precisa resolver para packages/* ou apps/*; senão as regras acima não conseguem verificá-lo. Rode `npm ci` na raiz antes.',
      from: {},
      to: {
        couldNotResolve: true,
        path: '^@g6/',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: '(?:^|/)(?:node_modules|dist)/',
    },
    // `import type` também conta: um tipo de outro contexto já é acoplamento.
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
    // `@g6/*` chega a `packages/*` pelos symlinks do workspace; seguir o
    // caminho real é o que permite às regras enxergarem o pacote de destino.
    preserveSymlinks: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      // Todas as extensões que o parser lê; sem elas, um import sem extensão
      // para um `.tsx`/`.cts`/... de outro pacote não resolveria e escaparia.
      extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'],
    },
    // Grafo da Visão de Implementação (`npm run grafo`): um nó por pacote/app.
    reporterOptions: {
      dot: {
        collapsePattern: '^(?:packages|apps)/[^/]+',
        theme: {
          graph: {
            rankdir: 'TB',
            splines: 'true',
            fontname: 'Helvetica',
            label: 'Grupo 06 · CA-01 — dependências entre pacotes',
            labelloc: 't',
          },
          node: {
            shape: 'box',
            style: 'rounded,filled',
            fontname: 'Helvetica',
            fillcolor: '#ffffff',
            color: '#555555',
          },
          edge: { color: '#555555', arrowhead: 'vee' },
          modules: [
            {
              criteria: { source: '^packages/shared-kernel' },
              attributes: { fillcolor: '#fde68a', color: '#b45309', penwidth: '2' },
            },
            {
              criteria: { source: '^packages/' },
              attributes: { fillcolor: '#dbeafe', color: '#1d4ed8' },
            },
            {
              criteria: { source: '^apps/' },
              attributes: { fillcolor: '#dcfce7', color: '#15803d' },
            },
          ],
        },
      },
    },
  },
};
