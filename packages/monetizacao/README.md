# @g6/monetizacao

Contexto de monetização: recarga (Decorator · Adapter · Proxy), doação (Facade + Mediator) e mensagem destacada (Decorator).

- **Issue(s):** #10, #11, #12 · **Testes:** Jest + @swc/jest
- **Pode importar:** `@g6/shared-kernel` (nunca outro contexto)

| Pasta | Issue dona |
| --- | --- |
| `src/recarga` | #10 |
| `src/doacao` | #11 |
| `src/destaque` | #12 |

```bash
npm test -w @g6/monetizacao
npm run typecheck -w @g6/monetizacao
```
