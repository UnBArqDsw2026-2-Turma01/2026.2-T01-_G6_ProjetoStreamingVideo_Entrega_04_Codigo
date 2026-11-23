# @g6/cli-demo

Roteiro do CA-01 (live com doação destacada) no terminal, compondo os módulos reais.

- **Issue(s):** #15
- **Pode importar:** qualquer pacote `@g6/*` — é aqui que os módulos reais são compostos.

## Como rodar

Na raiz do repositório:

```bash
npm install
npm run demo   # executa os seis passos do CA-01 e sai com código 0
npm test       # inclui o teste de ponta a ponta do CA-01 (apps/cli-demo/test/ca01.test.ts)
```

Não precisa de credenciais nem de variáveis de ambiente: o pagamento é só o processador simulado
(`compor` não lê o `.env`) e a identidade usa as contas de demonstração do pacote. A execução leva
de 10 a 15 s, quase todos no hash de senha da `@g6/identidade`.

## O que o roteiro faz

| # | Passo | Chamado pelo roteiro | Padrão em ação |
| --- | --- | --- | --- |
| 1 | Criador e espectador fazem login | `AutenticacaoPort.login` | Chain of Responsibility |
| 2 | Criador abre a live por preset; o seguidor é notificado | `TransmissaoPort.abrir` (o roteiro imprime a configuração do Director, a estratégia de despacho e o que o seguidor recebeu) | Builder + Director → Observer + Strategy |
| 3 | Espectador recarrega moeda virtual | `RecargaPort.ofertas`, `recarregar` e `consultar`; o aviso do processador entra por `RecargaService.receberAviso`, fora do port | Decorator · Adapter · Proxy |
| 4 | Espectador doa com mensagem; o repasse ocorre | `DoacaoPort.doar` | Facade + Mediator · Decorator |
| 5 | A mensagem destacada passa pela moderação e chega ao chat | `ChatPort.inscrever` (quem chama `publicarDestacada` e `ModeracaoPort.avaliar` é o `doar` do passo 4) | AutoMod + Strategy · Observer |
| 6 | Criador encerra a live, que vira VOD | `TransmissaoPort.encerrar` → `LiveEncerrada` | Factory Method |

Cada passo imprime o padrão e o resultado, e cada resultado impresso é conferido: o login recusa a senha
errada e o criador sem segundo fator, o Proxy barra o aviso falsificado e ignora o reenvio, e o repasse
tem o valor esperado. Ao final aparece a ordem dos eventos publicados:
`LiveIniciada → RecargaConcluida → MensagemPublicada → DoacaoConfirmada → LiveEncerrada`.
Um passo que não dá o resultado esperado encerra o processo com código 1 e diz qual foi.

## Organização

| Arquivo | Papel |
| --- | --- |
| `src/composicao.ts` | *Composition root*: cria o `EventBus` e os serviços reais e liga cada port. Único lugar que conhece as implementações. |
| `src/roteiro.ts` | Os seis passos, chamando os ports (e, onde o contrato deixa de fora, o serviço). Escreve no `escrever` recebido, então o teste roda o mesmo roteiro em silêncio. |
| `src/main.ts` | Ponto de entrada de `npm run demo`. |
| `test/ca01.test.ts` | Teste de ponta a ponta com os módulos reais, conferindo cada passo, a ordem dos eventos e que `fetch` não é chamado. |
| `test/integracao/doacao-com-chat.test.ts` | Integração da doação com o `ChatService` real (PR #38). |

## Importações pela fonte do pacote

`@g6/monetizacao` ainda não exporta a montagem da doação, o serviço financeiro nem as entidades
de apoio. Por isso `composicao.ts` importa essas quatro peças direto de `packages/monetizacao/src`,
como já faz o teste de integração da doação. Quando o pacote exportá-las no `index.ts`, basta
trocar as importações.
