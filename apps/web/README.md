# @g6/web

Página integrada do CA-01 (login em `src/auth`, #17).

- **Issue(s):** #16, #17
- **Pode importar:** qualquer pacote `@g6/*` — é aqui que os módulos reais são compostos.

## Rodar

```bash
npm run web          # na raiz; http://localhost:3000 (PORT=4000 para trocar)
npm test -w @g6/web  # CA-01 de ponta a ponta pela API HTTP
```

Entre como **criador** (abre e encerra a live) e como **espectador** (recarrega, doa e usa o chat; o chat e o VOD aparecem para os dois). O login fica salvo no navegador (uma sessão por papel), então dá para manter criador e espectador em abas diferentes.

### Criador e espectador ao mesmo tempo

```bash
npm run dev          # a mesma aplicação em duas portas: 3000 e 3001 (PORT=4000 → 4000 e 4001)
npm run totp         # código do autenticador do criador (vale 30 s)
```

Abra **http://localhost:3000** e entre como criador (senha + código do autenticador); abra **http://localhost:3001** e entre como espectador. Cada porta é uma origem diferente para o navegador, então cada uma guarda o próprio login, e as duas compartilham lives, chat, vídeo e gravações (é um só servidor escutando em duas portas). Abra a live e ative a câmera em uma; na outra, a live aparece em **Lives no ar**, é só clicar para assistir.

O espectador nunca vê o formulário de abrir live: sem live escolhida ele vê a lista de lives no ar; ao entrar em uma, o player e o chat, com **← Lives no ar** para voltar. Alternativas: `/demo.html` mostra as duas telas na mesma janela e `/?papel=criador` ou `/?papel=espectador` fixam o papel de uma aba.

### Câmera, tela e webcam

Com a live aberta, o criador escolhe:

- **Ativar câmera**: transmite a webcam.
- **Compartilhar tela**: transmite a tela (ou uma janela/aba). Depois, **Adicionar webcam** coloca a webcam por cima da tela; arraste-a na prévia, use os botões de canto (↖ ↗ ↙ ↘) e o seletor de tamanho. Ligar, mover ou tirar a webcam não interrompe a transmissão.

Quem abre a página vê a imagem em tempo real, com **Ativar som** no canto do player. A câmera só funciona em `http://localhost` ou HTTPS. É WebRTC ponto a ponto: o servidor (`src/video.ts`) só repassa as descrições SDP por HTTP e o vídeo não passa por ele. Sem sinal do criador por 6 s, a transmissão volta a "Aguardando…".

### Gravação (VOD)

Enquanto transmite, o navegador do criador grava (`MediaRecorder`) e envia pedaços ao servidor (`src/gravacoes.ts`). Ao encerrar a live, o cartão em **Transmissões anteriores** ganha **Assistir** para criador e espectador. Os arquivos ficam em `apps/web/.vods-temporarios/` (ignorada pelo git, limite de 1 GB por live) e são **apagados quando o servidor sobe e quando ele é encerrado** (Ctrl+C, SIGTERM). `CA01_PASTA_VODS` troca a pasta.

## Estrutura

| Arquivo | Papel |
| --- | --- |
| `src/servidor.ts` | Monta a aplicação, registra as rotas, chama o ponto de extensão `registrarRotas` e sobe em uma ou mais portas |
| `src/dev.ts` | `npm run dev`: a mesma aplicação em duas portas |
| `src/ca01.ts` | *Composition root* (`compor()`) e casos de uso do CA-01 (`ServicoCA01`) |
| `src/rotas.ts` | Rotas HTTP finas; definem `Contexto` e `RegistrarRotas` |
| `src/video.ts` | Sinalização WebRTC da câmera (`/api/lives/:id/video/*`) |
| `src/gravacoes.ts` | Gravação temporária das lives (VOD assistível) |
| `src/http/app.ts` | Servidor `node:http` mínimo, sem dependências |
| `public/` | Página (HTML, CSS e JS puro, sem build); `video.js` é a câmera, `composicao.js` junta tela + webcam, `gravacao.js` grava o VOD, `demo.html` mostra criador e espectador lado a lado |

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

- **Recarga: real.** `compor()` usa o `RecargaService` de `@g6/monetizacao` (#10), com o catálogo, os descontos e o imposto dele. "Confirmar pagamento simulado" aprova no processador simulado e entrega o aviso assinado ao Proxy (`receberAviso`), que credita e publica `RecargaConcluida`. O seletor "Pagar com" lista os meios disponíveis: o simulado sempre; Mercado Pago e Stripe só com credencial de **teste** no `.env` da raiz (lido por `npm run web`/`npm run dev`, nunca versionado). Nos meios reais, a página abre o checkout de teste e o crédito depende do aviso do processador. As peças internas que o pacote ainda não exporta (processador simulado, carteiras) são importadas por caminho relativo, como no `apps/cli-demo`.

- Mensagem destacada: `montarDestaque` em `ca01.ts` espelha as faixas de `FaixaDestaque` (#12) até `@g6/monetizacao` exportar `montarMensagemDestacada` no `index.ts`.
- Saldo e VOD: ficam em memória no `ServicoCA01` até a doação (#11) e o `conteudo` (#9) assumirem.
