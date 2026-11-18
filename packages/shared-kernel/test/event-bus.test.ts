import { test } from 'node:test';
import { EventBusEmMemoria } from '../src/eventbus';
import { casosEventBus } from '../src/testing/suites/event-bus.suite';

const casos = casosEventBus(() => new EventBusEmMemoria());
for (const caso of casos) {
  test(`Contrato EventBus: ${caso.nome}`, caso.executar);
}