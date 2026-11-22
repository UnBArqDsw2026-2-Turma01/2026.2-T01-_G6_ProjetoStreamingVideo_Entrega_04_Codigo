# Benchmark do CA-01 integrado (extra E8)

- **Data:** 2026-11-22T02:13:50.628Z
- **CPU:** 13th Gen Intel(R) Core(TM) i7-13620H (16 threads logicas)
- **Sistema:** linux 7.3.4-1-cachyos (x64)
- **Node.js:** v24.18.1
- **Comando:** `npx tsx bench/ca01-benchmark.ts`

## Composicao medida

- **Reais:** `EventBusEmMemoria` (`@g6/shared-kernel`), `criarConfiguracao` (`@g6/transmissao`), `ConteudoDeLive` e `InMemoryContentRepository` (`@g6/conteudo`), orquestracao `ServicoCA01` (`apps/web/src/ca01.ts`).
- **Fakes do contrato:** `FakeAutenticacao`, `FakeTransmissao`, `RecargaDemo`/`FakeRecarga`, `FakeDoacao`, `FakeChat` e `FakeModeracao`, pois as issues `#5`, `#7`, `#8`, `#13`, `#14` e `#15` ainda nao entraram na `main`.

## 1. Latencia do CA-01 ponta a ponta

| Aquecimento | Repeticoes | Min (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) | Media (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | 1000 | 0.0089 | 0.0245 | 0.0709 | 0.1892 | 1.7402 | 0.0346 |

## 2. Entrega da mensagem destacada com N inscritos no chat

| Inscritos (N) | Aquecimento | Repeticoes | p50 (ms) | p95 (ms) | p99 (ms) | Media (ms) | Entregas/s (p50) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 50 | 300 | 0.0038 | 0.0105 | 0.0434 | 0.0070 | 2631579 |
| 100 | 50 | 300 | 0.0045 | 0.0075 | 0.0119 | 0.0051 | 22222222 |
| 1000 | 50 | 300 | 0.0250 | 0.0599 | 0.4261 | 0.0358 | 40000000 |
| 5000 | 50 | 300 | 0.0304 | 0.0466 | 0.0496 | 0.0315 | 164473684 |
