# Referência do shared-kernel (extra E9, #22)

Gera com [TypeDoc](https://typedoc.org/) a referência do contrato comum `@g6/shared-kernel`
(tipos, *ports*, eventos, `EventBusEmMemoria` e o kit de testes `@g6/shared-kernel/testing`) a
partir do TSDoc “Provê / Consome / Garante” de cada arquivo. A saída é Markdown, para ser lida
direto no GitHub: [`packages/shared-kernel/docs/api`](../../packages/shared-kernel/docs/api/README.md).

```bash
npm ci --prefix scripts/documentacao                 # TypeDoc + typescript 6
npm run kernel --prefix scripts/documentacao         # regenera packages/shared-kernel/docs/api
npm run kernel:conferir --prefix scripts/documentacao  # falha se a referência commitada estiver desatualizada
```

O CI roda `kernel:conferir` em cada PR: quem muda o contrato precisa regenerar a referência no
mesmo PR. Avisos do TypeDoc (por exemplo, um tipo público sem exportação) também fazem o comando
falhar.

Este pacote fica fora das workspaces pelo mesmo motivo de `scripts/arquitetura`: o TypeDoc só lê
TypeScript até a 6, e o monorepo usa o 7.
