import { test } from 'node:test';
import { casosModeracaoPort } from '@g6/shared-kernel/testing';
import { ModeracaoService } from '../src/index.js';

const casos = casosModeracaoPort(() => new ModeracaoService());
for (const caso of casos) {
  test(`Contrato ModeracaoPort: ${caso.nome}`, caso.executar);
}
