# Benchmark do CA-01 integrado (extra E8)

Scripts e dados brutos referentes a issue [#21](https://github.com/UnBArqDsw2026-2-Turma01/2026.2-T01-_G6_ProjetoStreamingVideo_Entrega_04_Codigo/issues/21), utilizados para alimentar a secao `1.1.1.10. Tamanho e Desempenho` do DAS.

## O que e medido

1. **CA-01 ponta a ponta:** executa 100 rodadas de aquecimento (descartadas) e 1.000 repeticoes medidas do fluxo completo (criacao da configuracao com `@g6/transmissao`, abertura de live, recarga simulada e confirmacao, doacao destacada, envio no chat, encerramento da live e criacao real de VOD pelo `ConteudoDeLive` de `@g6/conteudo` reagindo a `LiveEncerrada` no `EventBusEmMemoria`).
2. **Entrega da mensagem destacada com N inscritos:** mede a latencia de `ServicoCA01.doar` com mensagem destacada para `N = 10, 100, 1000, 5000` ouvintes inscritos no chat (50 rodadas de aquecimento e 300 medicoes por `N`).

## Como reproduzir

Na raiz do monorepo:

```bash
npx tsx bench/ca01-benchmark.ts
```

Os arquivos gerados ficam em `bench/resultados/`:

- `resumo.json`: ambiente da execucao e metricas agregadas (`min`, `p50`, `p95`, `p99`, `max`, `media`).
- `ca01-latencia-brutos.csv`: as 1.000 amostras brutas (em ms) do fluxo ponta a ponta.
- `ca01-chat-brutos.csv`: as 300 amostras brutas (em ms) para cada valor de `N` inscritos.
- `relatorio.md`: tabela pronta para conferencia contra a secao `1.1.1.10` do DAS.
