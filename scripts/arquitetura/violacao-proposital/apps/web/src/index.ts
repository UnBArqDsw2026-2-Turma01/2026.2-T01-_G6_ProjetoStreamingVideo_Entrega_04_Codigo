// VIOLAÇÃO PROPOSITAL (RD1): um app importando o interior de um pacote por caminho relativo,
// em vez do ponto de entrada público `@g6/monetizacao`. Deve disparar `app-so-pela-api-publica`.
import { valorDaDoacao } from '../../../packages/monetizacao/src/index';

export const doacao = valorDaDoacao;
