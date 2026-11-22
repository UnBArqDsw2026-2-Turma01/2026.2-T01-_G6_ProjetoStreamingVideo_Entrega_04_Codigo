# @g6/monetizacao

Contexto de monetização: recarga (Decorator · Adapter · Proxy), doação (Facade + Mediator) e mensagem destacada (Decorator).

- **Issue(s):** #10, #11, #12 · **Testes:** Jest + @swc/jest
- **Pode importar:** `@g6/shared-kernel` (nunca outro contexto)

| Pasta | Conteúdo | Issue dona |
| --- | --- | --- |
| `src/comum` | Base de domínio da E03 compartilhada por recarga e doação: `dominio` (`Usuario`, `Carteira`, `Dinheiro`, `Transacao`…), `financeiro` (`ServicoFinanceiro`) e `compartilhado` (`RepositorioEmMemoria`, `GeradorId`) | #10 |
| `src/recarga` | Recarga de moeda virtual e `RecargaService`, que implementa o `RecargaPort` | #10 |
| `src/doacao` | Doação com mensagem e repasse | #11 |
| `src/destaque` | Mensagem destacada | #12 |

```bash
npm test -w @g6/monetizacao               # testes do pacote
npm run typecheck -w @g6/monetizacao      # checagem de tipos
npm run demo:recarga -w @g6/monetizacao   # recarga no terminal, sem internet
```

O `tsx` e o `@swc/jest` executam o código sem checar tipos: rode o `typecheck` antes de cada commit.

## Recarga (#10)

Código importado da F1 da Entrega 03 ([`SubEquipe02_Codigo@95a6743`](https://github.com/UnBArqDsw2026-2-Turma01/2026.2-T01-_G6_ProjetoStreamingVideo_SubEquipe02_Codigo/tree/95a6743/src/f1-recarga)) e exposto pelo `RecargaPort` do kernel.

| Padrão | Onde | O que resolve |
| --- | --- | --- |
| Decorator | `preco/` | Preço do pacote em camadas: desconto → taxa fixa → imposto |
| Adapter | `pagamento/` | Mercado Pago, Stripe e simulado atrás de `GatewayPagamento` |
| Proxy | `confirmacao/` | Aviso de pagamento falso (O14) ou repetido (O11) não credita |

### Demonstração

```bash
npm run demo:recarga -w @g6/monetizacao
```

Roda sem internet e sem credenciais, passando pelo `RecargaService`: lista as ofertas do modal (Decorator), tenta comprar com o simulado fora do ar e depois compra de novo (Adapter), e envia quatro avisos de pagamento: falsificado, antes do pagamento, após o pagamento e reenviado (Proxy). Saída esperada, em resumo:

```text
[Adapter] Simulado fora do ar:
  MEIO_INDISPONIVEL: Simulado indisponível no momento e não há outro meio de pagamento
[Proxy] Avisos de pagamento:
  aviso falsificado (O14): NAO_AUTENTICO
  aviso antes do pagamento: AGUARDANDO
  aviso após o pagamento: CREDITADO
  reenvio do mesmo aviso (O11): DUPLICADO
consultar(recarga-2): concluida
eventos publicados: RecargaConcluida
saldo final: 210 de moeda virtual
```

### Como usar em um app

A recarga tem dois tempos: `recarregar` só cria o checkout; a moeda entra quando um aviso de pagamento autêntico passa pelo Proxy. O aviso (webhook) **não faz parte do `RecargaPort`**, porque o formato é próprio de cada processador: o app liga a rota a `receberAviso`.

```ts
import { RecargaService, gatewaysDoAmbiente } from "@g6/monetizacao";

process.loadEnvFile?.(".env");                                  // opcional
const { gateways, avisos } = await gatewaysDoAmbiente(process.env);
avisos.forEach((linha) => console.log(linha));                  // quais meios reais conectaram

const recarga = new RecargaService({ gateways, financeiro, usuarios, eventos });

await recarga.ofertas(sessao);                                  // modal: preços em centavos
await recarga.recarregar(sessao, pacote, "simulado");           // CheckoutPendente; nada creditado
await recarga.consultar(sessao, recargaId);                     // pendente | concluida | cancelada
await recarga.receberAviso("simulado", notificacao);            // rota do webhook → Proxy → crédito
```

- `financeiro` e `usuarios` vêm de `src/comum` e são os **mesmos** da doação: a moeda creditada aqui é a que a doação debita.
- `receberAviso` publica `RecargaConcluida` no `EventBus` quando credita.
- Usuário sem carteira no repositório recebe `USUARIO_INEXISTENTE`.

### Processadores reais (opcional, só em modo de teste)

`gatewaysDoAmbiente` sempre inclui o **simulado**. Mercado Pago e Stripe entram só com credencial **de teste** em um `.env` na raiz do repositório, que é ignorado pelo git. Credencial de produção é sempre recusada (regra 8 do guia).

| Variável | Obrigatória | O que é |
| --- | --- | --- |
| `MERCADO_PAGO_ACCESS_TOKEN` | para o Mercado Pago | Credencial `TEST-...` ou token `APP_USR-...` do **vendedor de teste** |
| `MERCADO_PAGO_WEBHOOK_SECRET` | não | Segredo da assinatura do aviso que passa pelo Proxy |
| `STRIPE_SECRET_KEY` | para o Stripe | Chave secreta de teste (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | não | Segredo da assinatura do aviso que passa pelo Proxy |

**Mercado Pago (Checkout Pro)**

1. No [painel de desenvolvedores](https://www.mercadopago.com.br/developers/panel/app), em [Contas de teste](https://www.mercadopago.com.br/developers/panel/test-users), crie um **vendedor** e um **comprador** de teste.
2. Entre com o vendedor de teste, crie uma aplicação e copie o *access token* de produção dela (`APP_USR-...`). Como a conta é de teste, os links também são.
3. Cole em `MERCADO_PAGO_ACCESS_TOKEN`. Não use o token da sua conta pessoal: `gatewaysDoAmbiente` consulta a conta dona do token e recusa contas que não sejam de teste.

**Stripe (Checkout Session)**

1. No [dashboard do Stripe](https://dashboard.stripe.com/test/apikeys), ative o modo de teste e copie a *Secret key* (`sk_test_...`).
2. Cole em `STRIPE_SECRET_KEY`. Chaves `sk_live_` são recusadas.

Para conferir, rode `npm run demo:recarga -w @g6/monetizacao`: as linhas de "Meios de pagamento" dizem se cada processador conectou, não foi usado ou foi recusado.

### Testes

| Arquivo | O que verifica |
| --- | --- |
| `test/recarga/RecargaService.test.ts` | A suíte de contrato `casosRecargaPort` do kernel e a tradução da E03 para o contrato |
| `test/recarga/gatewaysDoAmbiente.test.ts` | Simulado sempre; reais só com credencial de teste (sem rede) |
| `test/recarga/preco.test.ts`, `pagamento/`, `confirmacao.test.ts`… | Os 82 testes da F1 da E03, um conjunto por padrão |
| `test/comum/` | Os 26 testes da base de domínio |

### Limitações

- O aviso que passa pelo Proxy é **gerado por nós**, com assinatura HMAC própria; com processador real, a aprovação é detectada por consulta, como na E03. O webhook real de cada processador ficaria no adaptador dele, sem mudar o Proxy.
- Os pagamentos já creditados ficam **em memória**; em produção seriam uma tabela com restrição de unicidade.
