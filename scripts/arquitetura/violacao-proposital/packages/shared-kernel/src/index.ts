// VIOLAÇÃO PROPOSITAL (#18): o shared-kernel importando um contexto.
// Deve disparar a regra `shared-kernel-isolado`.
import type { mensagem } from '../../chat/src/index';

export interface Contrato {
  id: string;
}

export type MensagemDoChat = typeof mensagem;
