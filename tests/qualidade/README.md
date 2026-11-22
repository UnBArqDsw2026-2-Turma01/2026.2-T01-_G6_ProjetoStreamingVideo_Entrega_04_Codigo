# Cenários de qualidade — extra E10 / issue #23

Sete cenários com os mesmos IDs QA-01 a QA-07 da seção 1.1.1.11 do DAS
([PR documental #39](https://github.com/UnBArqDsw2026-2-Turma01/2026.2-T01-_G6_ProjetoStreamingVideo_Entrega_04/pull/39)).

```bash
npm ci
npm ci --prefix scripts/arquitetura
npm run qualidade
```

O comando verifica dependências reais, confere tipos de todos os testes e executa
os sete cenários. Qualquer erro de asserção, compilação ou dependência produz saída
não zero. Não há cenários ignorados automaticamente quando falta implementação.

## Dependências e estado

A branch está baseada em `feat/identidade-autenticacao` (PR de código #40).
ChatService (PR #38) e ModeracaoService (PR #30) ainda precisam entrar na base.
Após o merge dessas dependências, alterar a base do PR para main e reexecutar.
Enquanto estiverem pendentes, `npm run qualidade` na branch isolada deve falhar
com a indicação das implementações ausentes. Não é um resultado de aprovação.

A validação inicial usa um worktree temporário com o commit `e5d8fdc` de identidade,
o diretório `packages/chat` do commit `69ccef1` e `packages/moderacao` do commit
`bd78b8a`. Essa montagem é somente de teste; não faz merge de PRs na main.

A CLI real (#15), da qual a issue #23 depende, ainda não compõe os serviços.
A suíte faz sua própria composição de componentes, não declara concluídos os seis
passos do CA-01 nem testa o ponto de entrada da CLI. Sua integração definitiva e a
reexecução após #15 continuam como dependência de aceite.

## Correspondência com o DAS

| ID | Serviço real e medida observável |
| --- | --- |
| QA-01 | Identidade: senha errada e conta inexistente geram a mesma recusa; zero sessões emitidas. |
| QA-02 | Identidade: MFA de criador obrigatório; step-up só aceita código novo e sessão reconhecida; rejeita replay; não altera a sessão original. |
| QA-03 | Identidade e limitador: cinco erros bloqueiam a sexta tentativa; relógio controlado avança 15 minutos, sem sleep. |
| QA-04 | AutoMod + ChatService reais: quatro vereditos, quarentena retida, só mensagem aprovada chega aos inscritos e a entrada não muda. |
| QA-05 | Identidade + doação/financeiro + chat/AutoMod + EventBus reais: controle com destaque entregue e falha injetada mantêm débito de 500, repasse de 1000 centavos e um evento de confirmação. |
| QA-06 | Pipeline real aceita troca de estratégia; fitness functions aprovam os contextos reais e rejeitam a fixture de violações por regras conhecidas. |
| QA-07 | EventBus real entrega em ordem apesar de publicação reentrante; erro de um assinante é reportado após entrega aos demais. |

## Limites e decisões de montagem

- QA-05 usa uma fixture que apenas resolve uma live preexistente por `TransmissaoPort`.
  Não usa FakeDoacao, FakeChat ou FakeModeracao. A fixture não implementa abrir/encerrar
  e lança erro se essas operações forem chamadas; esse ciclo depende de #15/#8.
- A indisponibilidade do chat é injetada por um decorador que devolve erro do port
  em `publicarDestacada`, antes da entrega. Não comprova tolerância a uma exceção
  lançada pelo chat ou a uma falha de rede real. O caso de controle passa pelo
  ChatService e AutoMod reais para verificar que o destaque seria entregue.
- O custo scrypt e a dificuldade de PoW são reduzidos somente na montagem de teste.
  O relógio e o segredo TOTP são fixtures públicas e determinísticas. Isso mantém
  o teste rápido e não altera os padrões de segurança das montagens de produção.
- Alguns construtores de infraestrutura de identidade e a fábrica da doação ainda
  não são exportados pela raiz de seus pacotes. A composição importa esses módulos
  diretamente; nenhum contexto passa a importar outro contexto. Uma API pública
  de montagem poderá substituir esses imports quando disponibilizada.
- `tsconfig.json` próprio inclui os testes; o typecheck padrão das workspaces não
  inclui automaticamente o diretório `tests/qualidade`. O script qualidade garante
  essa checagem sem modificar o tsconfig global ou o workflow existente.
- A única edição fora de `tests/qualidade/**` é o script `qualidade` no package.json
  raiz, necessário para cumprir o comando expressamente pedido na issue. Não há
  dependência nova nem alteração do lockfile.
- A duração exibida pelo executor é tempo de teste, não latência p50/p95 de serviço.
  A suíte não mede throughput, acurácia de moderação ou comportamento em produção.

Autoria da suíte: Hugo Freitas Silva. Serviços de chat/moderação mantêm a autoria
de seus PRs originais; não são copiados nem incluídos nos commits desta contribuição.
Revisão prevista na issue: Eduardo Lôbo Moreira.

## Reprodução da integração temporária

Com as branches/commits dos PRs já disponíveis no clone, a partir desta branch:

```bash
git worktree add --detach /tmp/qa-e10-validacao feat/qualidade-ca01
git -C /tmp/qa-e10-validacao restore --source=69ccef1 -- packages/chat
git -C /tmp/qa-e10-validacao restore --source=bd78b8a -- packages/moderacao
npm ci --prefix /tmp/qa-e10-validacao
npm ci --prefix /tmp/qa-e10-validacao/scripts/arquitetura
npm run qualidade --prefix /tmp/qa-e10-validacao
```

Isso mantém esta branch intacta e usa as implementações dos commits indicados, não
simuladores. O worktree terá modificações locais de dependências por intenção;
esses diretórios não devem ser incluídos no commit desta suíte.

## Registro de validação — 22/11/2026

Na montagem temporária descrita acima:

- `npm run qualidade`: sete testes passaram, zero falhas, zero ignorados; inclui
  checagem de tipos dos testes e a prova positiva/negativa de arquitetura em QA-06.
- `npm run typecheck`: todas as workspaces passaram.
- `npm test`: 269 testes existentes passaram (104 de node:test e 165 de Jest),
  sem falhas. Os sete de qualidade são uma execução separada desse total.
- Na branch isolada com apenas identidade integrada, o preflight retornou código 1
  e identificou ChatService e os exports de moderação ausentes, como esperado.
  Também orientou instalar a ferramenta de arquitetura quando ausente.

Esses resultados se referem à montagem temporária, não demonstram que a main ou
a CLI #15 já integrou os componentes. O aceite definitivo depende dessa integração.
