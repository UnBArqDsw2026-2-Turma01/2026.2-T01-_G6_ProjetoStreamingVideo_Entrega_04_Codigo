# @g6/shared-kernel

Contrato de integração: tipos comuns, ports, eventos de domínio e EventBus.

- **Issue(s):** #3, #4 · **Testes:** `node:test` via `tsx --test`
- **Pode importar:** nada do monorepo

```bash
npm test -w @g6/shared-kernel
npm run typecheck -w @g6/shared-kernel
```

## Usando Fakes e Suítes de Contrato em outros pacotes

Para testar a integração dos seus pacotes isoladamente, utilize os fakes exportados de `@g6/shared-kernel/testing`. Eles imitam os ports vizinhos e gravam o histórico de chamadas em memória para as suas assertions.

### Exemplo 1: Teste isolado utilizando Fake

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeTransmissao } from '@g6/shared-kernel/testing';
import { liveId, usuarioId, canalId } from '@g6/shared-kernel';

test('Exemplo usando Fake em teste isolado', async () => {
  const fakeTransmissao = new FakeTransmissao();
  
  // Injeta estado inicial no fake para o cenário do teste
  const id = liveId('live_123');
  fakeTransmissao.livesAbertas.set(id, { 
    live: id, 
    criador: usuarioId('usr_abc'), 
    titulo: 'Jogatina',
    canal: canalId('cnl_123'),
    iniciadaEm: new Date(),
  });
  
  // Executa chamada através do port simulado
  const resultado = await fakeTransmissao.consultar(id);
  
  // Valida retorno e inspeciona se a chamada foi gravada
  assert.equal(resultado.ok, true);
  assert.equal(fakeTransmissao.chamadas.length, 1);
  assert.equal(fakeTransmissao.chamadas[0].metodo, 'consultar');
});
```

### Exemplo 2: Executando a Suíte de Contrato contra uma implementação real

Se você está implementando um módulo real que provê um contrato, garanta a fidelidade executando a suíte de contrato contra a sua implementação:

```typescript
import { test } from 'node:test';
import { casosModeracaoPort } from '@g6/shared-kernel/testing';
import { MinhaModeracaoReal } from './minha-moderacao-real';

// As suítes são independentes de runner e retornam [{ nome, executar }]
const casosContrato = casosModeracaoPort(() => new MinhaModeracaoReal());

for (const caso of casosContrato) {
  test(`Contrato Real de Moderação: ${caso.nome}`, caso.executar);
}
```