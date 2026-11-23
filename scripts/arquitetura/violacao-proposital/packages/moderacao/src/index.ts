// VIOLAÇÃO PROPOSITAL (RD7): código de produção usando o fake do kit de testes.
// Deve disparar a regra `rd7-testing-so-em-testes`.
import { FakeModeracao } from '../../shared-kernel/src/testing/index';

export const moderacao = new FakeModeracao();
