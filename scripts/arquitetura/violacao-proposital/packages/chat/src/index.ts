// VIOLAÇÃO PROPOSITAL (#18): um contexto importando outro contexto.
// Deve disparar a regra `contexto-so-importa-shared-kernel`.
import { valorDaDoacao } from '../../monetizacao/src/index';
import type { Contrato } from '../../shared-kernel/src/index';

export const mensagem: Contrato = { id: String(valorDaDoacao) };
