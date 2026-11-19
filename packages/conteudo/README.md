# @g6/conteudo

Contexto de conteúdo gerado pelo usuário (Factory Method) · reage a LiveEncerrada.

- **Issue(s):** #9 · **Testes:** Vitest
- **Pode importar:** `@g6/shared-kernel` (nunca outro contexto)

```bash
npm test -w @g6/conteudo
npm run typecheck -w @g6/conteudo
```

## O que tem aqui

- `src/factory-method/`: o Factory Method da E03 (`UserContent`, `LiveStream`, `RecordedVideo`, `Clip` e os três ConcreteCreators), importado de `g6-streaming-entrega03-subgrupo01-codigo@be019ec`. Detalhes no [README do padrão](src/factory-method/README.md).
- `src/conteudo-de-live.ts`: `ConteudoDeLive`, o Client do padrão no monorepo. Assina os eventos da live no `EventBus`:
  - `LiveIniciada` → consulta dono e título em `TransmissaoPort.consultar`, cria a `LiveStream` pelo `LiveStreamCreator` e a coloca no ar;
  - `LiveEncerrada` → encerra a `LiveStream` e cria o VOD (`RecordedVideo`) pelo `RecordedVideoCreator`.

```ts
const conteudo = new ConteudoDeLive({ eventos, transmissao });
const cancelar = conteudo.assinar();
// ... a live abre e encerra ...
await conteudo.ocioso();
const vod = await conteudo.gravacaoDe(live); // RecordedVideo em PROCESSING
```

## Decisões e limites

- **Por que `LiveIniciada` também.** O `RecordedVideoCreator` só cria a gravação a partir de uma `LiveStream` encerrada que já está no repositório (regra F2), e `LiveEncerrada` traz só `live`, `canal` e `em`. A live é registrada no início, quando `consultar` ainda a encontra (depois do encerramento, devolve erro).
- **Ordem assíncrona.** O `EventBus` é síncrono e `consultar` é assíncrono; o encerramento espera a tarefa do início, então um `LiveEncerrada` que chega antes de a consulta terminar não se perde. `ocioso()` espera as reações em andamento.
- **Falhas** (consulta recusada, regra violada) não sobem para quem publicou o evento: ficam em `falhas`.
- **Campos fora do contrato.** `LiveResumo` não traz visibilidade, latência nem gravação; vale `CONFIGURACAO_PADRAO` (pública, latência padrão, gravação ligada), substituível por `configuracao`.
- **Moderação.** O `PolicyService` da E03 modera conteúdo por id e não corresponde ao `ModeracaoPort` (que avalia mensagens de chat). O padrão é o `BlocklistPolicyService` da E03 sem termos bloqueados; a composição pode injetar outro em `politica`.
- **VOD em processamento.** O VOD nasce em `PROCESSING` e fora do ar, como na E03: `RecordingAvailable` (`markReady`) não faz parte do contrato do CA-01.
