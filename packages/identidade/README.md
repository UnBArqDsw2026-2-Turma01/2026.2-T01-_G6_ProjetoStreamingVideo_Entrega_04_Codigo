# @g6/identidade

Contexto de identidade e acesso (Chain of Responsibility) · AutenticacaoPort.

- **Issue(s):** #5 · **Testes:** `node:test` via `tsx --test`
- **Pode importar:** `@g6/shared-kernel` (nunca outro contexto)

```bash
npm test -w @g6/identidade
npm run typecheck -w @g6/identidade
```

## Implementação da issue #5

A cadeia original da E03 foi importada literalmente de
`g6-streaming-entrega03-subgrupo03-codigo@8afea561e7415c66524898e30301ccd16644a6ef`
no primeiro commit. O segundo adiciona `AutenticacaoService implements AutenticacaoPort`,
as conversões para `Sessao`, `UsuarioId` e `Resultado`, testes de contrato e exemplos.
O domínio interno da E03 permanece separado do contrato público; nenhum outro contexto é importado.

```ts
import { criarAutenticacaoExemplo } from '@g6/identidade';

const { autenticacao, senha, codigoCriador } = criarAutenticacaoExemplo();
const espectador = await autenticacao.login({ email: 'espectador@ca01.test', senha });
const criador = await autenticacao.login({
  email: 'criador@ca01.test', senha, codigoTotp: codigoCriador(),
});
```

`senha` é `Exemplo-CA01!`. Estes usuários e o segredo TOTP são públicos e exclusivos
da demonstração. O código TOTP é calculado para o instante atual; sua reutilização,
inclusive no step-up após login, é recusada. Aguarde o próximo intervalo de 30 segundos.
Cada montagem cria estado independente. Contas próprias podem ser fornecidas a
`criarAutenticacao(contas)` ou através das dependências de `AutenticacaoService`.

### Adaptação ao contrato congelado

- Login usa os sete elos originais, incluindo hash scrypt, status da conta e MFA.
  Desafios e recusas voltam como `Resultado` sem emissão de sessão.
- `Credenciais` não contém IP, navegador ou atestação. O adaptador usa `local`,
  `@g6/identidade` e uma prova de trabalho gerada localmente. Isso mantém a cadeia
  executável, mas **não comprova integridade do navegador nem impede automação remota**.
  O limite por IP é compartilhado por todos os clientes desta instância. Uma
  integração HTTP com metadados reais exige acordo sobre a evolução do contrato.
- `FatorAdicional` contém apenas TOTP, sem senha. O step-up verifica o token assinado,
  a sessão emitida por esta instância, validade, revogação e campos do contrato.
  Depois executa RateLimit → AccountStatus → TwoFactor (obrigatório) → StepUpGrant.
  O primeiro fator é a sessão existente; nenhuma senha é guardada pelo adaptador.
- Como o port não informa a ação sensível, o desafio interno usa
  `WALLET_PAYOUT_REQUEST` (fluxo CA-01). A resposta é uma nova cópia da sessão,
  sem alterar a original. O contrato não possui campo de nível de autenticação;
  a conclusão vale para a chamada e não cria autorização persistente de outra ação.
- Sessões e auditoria padrão ficam em memória, sem persistência, replicação ou
  limpeza automática das sessões emitidas. Reiniciar a instância invalida o estado.
  As chaves HMAC são aleatórias por montagem, sem segredo fixo de produção.

## Validação e revisão

A suíte inclui os testes originais de domínio, handlers e cadeias, os três casos
`casosAutenticacaoPort` contra a implementação real, e testes de MFA, replay,
expiração, revogação, adulteração, suspensão e contas de exemplo.

Revisão solicitada pela issue: Eduardo Lôbo Moreira. Origem da autenticação da E03
e implementação desta adaptação: Hugo Freitas Silva. A integração de login web
continua na issue #17 e não faz parte deste pacote.
