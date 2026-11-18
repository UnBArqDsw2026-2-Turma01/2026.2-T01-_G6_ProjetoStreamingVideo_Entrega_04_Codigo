# Violação proposital (#18)

Mini-monorepo que reproduz `packages/<contexto>/src` só para provar que as fitness
functions de `.dependency-cruiser.cjs` falham quando a Visão Lógica é quebrada. Não é
código do produto e fica fora da verificação normal, que só analisa `packages` e `apps`.

| Arquivo | Import proibido | Regra que dispara |
| --- | --- | --- |
| `packages/chat/src/index.ts` | `chat` → `monetizacao` | `contexto-so-importa-shared-kernel` |
| `packages/shared-kernel/src/index.ts` | `shared-kernel` → `chat` | `shared-kernel-isolado` |
| `packages/conteudo/src/index.ts` | `conteudo` → `@g6/pacote-inexistente` (não resolve) | `g6-nao-resolvido` |

`chat` → `shared-kernel` é permitido e aparece de propósito, para mostrar que a regra não
gera falso positivo no caminho válido.

```bash
npm install --prefix scripts/arquitetura   # uma vez: dependency-cruiser + typescript 6

# deve falhar (código de saída 3) com as 3 violações da tabela
npm run violacao --prefix scripts/arquitetura

# deve passar na base real
npm run verificar --prefix scripts/arquitetura
```

O `scripts/arquitetura/package.json` fica fora das workspaces porque o dependency-cruiser
só lê TypeScript com `typescript < 7`, e o monorepo usa o 7. Sem o 6, ele ignora os `.ts`
e devolve um falso "no dependency violations found".
