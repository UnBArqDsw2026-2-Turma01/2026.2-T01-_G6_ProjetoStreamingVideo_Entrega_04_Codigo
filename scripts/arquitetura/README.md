# Fitness functions da arquitetura (#18)

Verifica no código as regras da Visão Lógica definidas em `.dependency-cruiser.cjs`
(raiz) e gera o grafo de dependências da Visão de Implementação.

```bash
npm ci                                    # raiz: cria os symlinks @g6/* que as regras seguem
npm ci --prefix scripts/arquitetura       # dependency-cruiser + typescript 6

npm run verificar --prefix scripts/arquitetura   # regras em packages/ e apps/ (falha se houver violação)
npm run violacao  --prefix scripts/arquitetura   # violação proposital: deve falhar com 10 erros
npm run grafo     --prefix scripts/arquitetura   # verifica as regras e gera grafo/dependencias.svg
```

| Regra | O que proíbe |
| --- | --- |
| `contexto-so-importa-shared-kernel` | `packages/<contexto>` importar qualquer módulo local fora dele e do shared-kernel: outro contexto, um app ou outra pasta do repositório |
| `shared-kernel-isolado` | `packages/shared-kernel` importar qualquer módulo local fora dele |
| `rd6-configuracao-nao-importa-canal` · `rd6-canal-nao-importa-configuracao` | `transmissao/src/configuracao` e `transmissao/src/canal` se importarem, em qualquer direção; só `transmissao/src/servico` liga os dois (RD6, ADR-009) |
| `rd7-testing-so-em-testes` | `src/` de produção de um pacote ou app importar `@g6/shared-kernel/testing` (fakes e suítes de contrato ficam em `test/`) (RD7) |
| `app-so-pela-api-publica` | `apps/*` importarem um pacote por caminho relativo até `packages/<x>/src`, em vez do ponto de entrada `@g6/<x>` (RD1) |
| `g6-nao-resolvido` | import `@g6/*` que não resolve (sem `npm ci` na raiz, as outras regras não o veriam) |

As regras de contexto e de kernel liberam só dependências npm (`node_modules`) e módulos do Node, e
os caminhos são ancorados em `packages/` da raiz (ou da violação proposital): uma pasta
aninhada como `conteudo/src/packages/chat/` não passa por `chat`.

O grafo roda as regras antes (como `verificar`) e só é gerado se elas passarem: o filtro
`--include-only` do grafo descartaria os `@g6/*` não resolvidos sem acusar erro. Ele agrupa os módulos por pacote, considera só o código de produção (sem `test/`) e é
renderizado com o Graphviz em WASM (`@viz-js/viz`), sem precisar do Graphviz instalado.
Cores: amarelo = shared-kernel, azul = contextos, verde = apps.

Este pacote fica fora das workspaces porque o dependency-cruiser só lê TypeScript com
`typescript < 7`, e o monorepo usa o 7. Sem o 6, ele ignora os `.ts` e devolve um falso
"no dependency violations found".
