import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as shared_kernel from '@g6/shared-kernel';
import * as identidade from '@g6/identidade';
import * as transmissao from '@g6/transmissao';
import * as conteudo from '@g6/conteudo';
import * as monetizacao from '@g6/monetizacao';
import * as chat from '@g6/chat';
import * as moderacao from '@g6/moderacao';

// Teste de fumaça do scaffold (#2): prova que o app enxerga todos os pacotes do workspace.
test('o app resolve todos os pacotes @g6/*', () => {
  for (const pacote of [shared_kernel, identidade, transmissao, conteudo, monetizacao, chat, moderacao]) assert.equal(typeof pacote, 'object');
});
