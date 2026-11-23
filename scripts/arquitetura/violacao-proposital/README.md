# Violação proposital (#18)

Mini-monorepo que reproduz `packages/<contexto>/src` e `apps/<app>/src` só para provar que as fitness
functions de `.dependency-cruiser.cjs` falham quando a Visão Lógica é quebrada. Não é
código do produto e fica fora da verificação normal, que só analisa `packages` e `apps`.

| Arquivo | Import proibido | Regra que dispara |
| --- | --- | --- |
| `packages/chat/src/index.ts` | `chat` → `monetizacao` | `contexto-so-importa-shared-kernel` |
| `packages/shared-kernel/src/index.ts` | `shared-kernel` → `chat` | `shared-kernel-isolado` |
| `packages/conteudo/src/index.ts` | `conteudo` → `@g6/pacote-inexistente` (não resolve) | `g6-nao-resolvido` |
| `packages/identidade/src/index.ts` | `identidade` → `compartilhado/ponte.ts`, fora de `packages/` | `contexto-so-importa-shared-kernel` |
| `packages/shared-kernel/src/fora-do-kernel.ts` | `shared-kernel` → `compartilhado/ponte.ts`, fora de `packages/` | `shared-kernel-isolado` |
| `packages/transmissao/src/index.ts` | `transmissao` → `conteudo/src/packages/transmissao/` (pasta aninhada com o nome do próprio contexto) | `contexto-so-importa-shared-kernel` |
| `packages/transmissao/src/configuracao/receita.ts` | `configuracao` → `canal` | `rd6-configuracao-nao-importa-canal` |
| `packages/transmissao/src/canal/canal.ts` | `canal` → `configuracao` | `rd6-canal-nao-importa-configuracao` |
| `packages/moderacao/src/index.ts` | `src/` de produção → `shared-kernel/src/testing` (fake no lugar do módulo real) | `rd7-testing-so-em-testes` |
| `apps/web/src/index.ts` | app → `../../../packages/monetizacao/src/index` (caminho relativo, fora do ponto de entrada) | `app-so-pela-api-publica` |

`chat` → `shared-kernel` é permitido e aparece de propósito, para mostrar que a regra não
gera falso positivo no caminho válido.

```bash
npm install --prefix scripts/arquitetura   # uma vez: dependency-cruiser + typescript 6

# deve falhar (código de saída 10) com as 10 violações da tabela
npm run violacao --prefix scripts/arquitetura

# deve passar na base real
npm run verificar --prefix scripts/arquitetura
```

O `scripts/arquitetura/package.json` fica fora das workspaces porque o dependency-cruiser
só lê TypeScript com `typescript < 7`, e o monorepo usa o 7. Sem o 6, ele ignora os `.ts`
e devolve um falso "no dependency violations found".
