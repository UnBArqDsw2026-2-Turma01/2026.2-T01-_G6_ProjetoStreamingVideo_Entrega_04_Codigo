# @g6/web

Página integrada do CA-01 (login em `src/auth`, #17).

- **Issue(s):** #16, #17
- **Pode importar:** qualquer pacote `@g6/*` — é aqui que os módulos reais são compostos.

## Rodar

```bash
npm run web          # na raiz; http://localhost:3000 (PORT=4000 para trocar)
npm test -w @g6/web  # CA-01 de ponta a ponta pela API HTTP
```

Entre como **criador** (abre e encerra a live) e como **espectador** (recarrega, doa e usa o chat; o chat e o VOD aparecem para os dois).

## Estrutura

| Arquivo | Papel |
| --- | --- |
| `src/servidor.ts` | Monta a aplicação, registra as rotas e chama o ponto de extensão `registrarRotas` |
| `src/ca01.ts` | *Composition root* (`compor()`) e casos de uso do CA-01 (`ServicoCA01`) |
| `src/rotas.ts` | Rotas HTTP finas; definem `Contexto` e `RegistrarRotas` |
| `src/http/app.ts` | Servidor `node:http` mínimo, sem dependências |
| `public/` | Página (HTML, CSS e JS puro, sem build) |

## Front-end (`public/`)

HTML, CSS e JS puros, sem build. `estilo.css` é organizado em seções:

1. **Tokens** em `:root`: superfícies (`--superficie`, `--superficie-campo`…), texto (`--texto`, `--texto-suave`), estados (`--erro`, `--sucesso`, `--ao-vivo`, `--desconto`), raios (`--raio-p` a `--raio-total`), espaços (`--espaco-1` a `--espaco-6`) e tipografia.
2. **Faixas**: as classes `AZUL`, `VERDE`, `LARANJA`, `ROSA` e `VERMELHO` (os mesmos nomes que a API devolve em `cor`) definem `--cor`, `--brilho` e `--fundo-destacado` no elemento.
3. **Componentes base**: `button` (acento), `button.sec`, `button.icone`, `button.principal`, campos, slider, `.avatar`.
4. **Painéis**: player, recarga, VOD, chat, mensagem destacada (`.sc`), pílulas fixadas e diálogo de doação.

Para uma tela nova (ex.: login), use só os tokens e os componentes base; não escreva cor ou raio fixos.

## Ponto de extensão para o login (#17)

`src/auth/index.ts` pode exportar `registrarRotas(app, contexto)`; o servidor o chama sozinho, sem edição em `servidor.ts`:

```ts
import type { RegistrarRotas } from '../rotas';

export const registrarRotas: RegistrarRotas = (app, { emitirSessao }) => {
  app.rota('POST', '/api/login', async (req) => { /* AutenticacaoPort.login → emitirSessao(sessao) */ });
};
```

`contexto.sessaoDe(req)` devolve a sessão (cabeçalho `Authorization: Bearer <token>`). Enquanto o login não existe, os botões da página usam `POST /api/demo/sessao`.

## Composição provisória

Hoje `compor()` usa os fakes do shared-kernel para todos os ports. Quando cada pacote real entrar na `main`, troque a linha correspondente em `compor()`; rotas e telas não mudam.

- Mensagem destacada: `montarDestaque` em `ca01.ts` espelha as faixas de `FaixaDestaque` (#12) até `@g6/monetizacao` exportar `montarMensagemDestacada` no `index.ts`.
- Saldo e VOD: ficam em memória no `ServicoCA01` até a doação (#11) e o `conteudo` (#9) assumirem.
