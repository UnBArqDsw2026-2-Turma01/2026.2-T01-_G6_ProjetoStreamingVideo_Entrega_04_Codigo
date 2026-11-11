import type { MensagemChat, VereditoModeracao } from '../tipos';

/**
 * Moderação automática de mensagens.
 *
 * - **Provê:** `@g6/moderacao` (AutoMod + Strategy da E03).
 * - **Consome:** `@g6/chat`.
 * - **Garante:** sempre responde com um veredito; não entrega, não guarda e não altera
 *   a mensagem. O que fazer com cada decisão é responsabilidade do chat.
 */
export interface ModeracaoPort {
  /** Aceita também `MensagemDestacada`, que é uma `MensagemChat`. */
  avaliar(mensagem: MensagemChat): Promise<VereditoModeracao>;
}
