/**
 * Fitness functions da Visão Lógica (#18) — regra 2 do guia (#1).
 *
 * - Um contexto (`packages/<contexto>`) só conhece o próprio código e o
 *   `@g6/shared-kernel`; nunca outro contexto nem um app.
 * - O `shared-kernel` não depende de nada do monorepo.
 * - Só `apps/*` compõem módulos reais, e pelo ponto de entrada público de cada
 *   pacote (`@g6/<pacote>`), nunca por caminho relativo até `packages/<x>/src` (RD1).
 * - Dentro de `transmissao`, `configuracao` e `canal` não se importam (RD6).
 * - `src/` de produção não importa `@g6/shared-kernel/testing` (RD7).
 *
 * Os caminhos são ancorados na raiz do monorepo ou na da violação proposital
 * (`scripts/arquitetura/violacao-proposital/`, que reproduz a mesma estrutura
 * de pastas e precisa fazer o comando falhar). Sem a âncora, uma pasta
 * aninhada como `conteudo/src/packages/chat/` passaria por `chat`.
 *
 * As duas primeiras regras proíbem qualquer destino local resolvido fora do
 * próprio pacote e do shared-kernel, e não só `packages/` e `apps/`: um módulo
 * em `scripts/` ou em outra pasta da raiz serviria de ponte entre contextos.
 * Ficam livres as dependências npm (`node_modules`) e os módulos do Node.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
const raiz = '^(?:scripts/arquitetura/violacao-proposital/)?';
const npm = '(?:^|/)node_modules/';

module.exports = {
  forbidden: [
    {
      name: 'contexto-so-importa-shared-kernel',
      severity: 'error',
      comment:
        'Um contexto só pode importar o próprio código, @g6/shared-kernel e dependências npm. A integração entre contextos acontece em apps/* (guia #1, regra 2).',
      from: {
        path: `${raiz}packages/([^/]+)/`,
        pathNot: `${raiz}packages/shared-kernel/`,
      },
      to: {
        couldNotResolve: false,
        dependencyTypesNot: ['core'],
        pathNot: [`${raiz}packages/$1/`, `${raiz}packages/shared-kernel/`, npm],
      },
    },
    {
      name: 'shared-kernel-isolado',
      severity: 'error',
      comment:
        'O shared-kernel é o contrato comum e não pode depender de nada do monorepo fora dele (contexto, app ou outra pasta).',
      from: {
        path: `${raiz}packages/shared-kernel/`,
      },
      to: {
        couldNotResolve: false,
        dependencyTypesNot: ['core'],
        pathNot: [`${raiz}packages/shared-kernel/`, npm],
      },
    },
    {
      // RD6 (Visão Lógica; ADR-009): `transmissao` tem dois donos. A configuração (Builder,
      // SubEquipe_01) e o canal (Observer, SubEquipe_03) não se importam; só `servico` liga os dois.
      name: 'rd6-configuracao-nao-importa-canal',
      severity: 'error',
      comment:
        'transmissao/src/configuracao não pode importar transmissao/src/canal: só transmissao/src/servico liga os dois (RD6, ADR-009).',
      from: { path: `${raiz}packages/transmissao/src/configuracao/` },
      to: { path: `${raiz}packages/transmissao/src/canal/` },
    },
    {
      name: 'rd6-canal-nao-importa-configuracao',
      severity: 'error',
      comment:
        'transmissao/src/canal não pode importar transmissao/src/configuracao: recebe a StreamConfig por tipagem estrutural, e só transmissao/src/servico liga os dois (RD6, ADR-009).',
      from: { path: `${raiz}packages/transmissao/src/canal/` },
      to: { path: `${raiz}packages/transmissao/src/configuracao/` },
    },
    {
      // RD7: fakes e suítes de contrato (`@g6/shared-kernel/testing`) são kit de teste. Código de
      // produção (`src/` de um pacote ou app) que os importe roda com fakes no lugar dos módulos reais.
      name: 'rd7-testing-so-em-testes',
      severity: 'error',
      comment:
        'src/ de produção não pode importar @g6/shared-kernel/testing: fakes e suítes de contrato ficam em test/ (RD7).',
      from: {
        path: `${raiz}(?:packages|apps)/[^/]+/src/`,
        pathNot: `${raiz}packages/shared-kernel/src/testing/`,
      },
      to: { path: `${raiz}packages/shared-kernel/src/testing/` },
    },
    {
      // RD1: apps compõem os módulos pelo ponto de entrada público de cada pacote (`@g6/<pacote>`,
      // que o depcruise marca como "undetermined"). Um caminho relativo até `packages/<x>/src/...`
      // (tipo "local") contorna o `exports` do package.json e acopla o app ao interior do contexto.
      name: 'app-so-pela-api-publica',
      severity: 'error',
      comment:
        'apps/* só importam um pacote por @g6/<pacote> (ponto de entrada público), nunca por caminho relativo até packages/<pacote>/src (RD1).',
      from: { path: `${raiz}apps/` },
      to: {
        dependencyTypes: ['local'],
        path: `${raiz}packages/`,
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
