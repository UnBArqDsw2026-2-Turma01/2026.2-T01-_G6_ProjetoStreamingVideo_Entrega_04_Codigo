import type {
  Cancelamento,
  LiveId,
  MensagemChat,
  MensagemDestacada,
  MensagemEntregue,
  Resultado,
} from '../tipos';

/**
 * Chat em tempo real de uma live.
 *
 * - **Provê:** `@g6/chat` (Observer do `ChatRoom`).
 * - **Consome:** `@g6/monetizacao` (o Mediator da doação publica a mensagem destacada) e `apps/*`.
 * - **Garante:** toda mensagem passa pelo `ModeracaoPort` antes da entrega; só a aprovada
 *   chega aos ouvintes, na ordem de publicação, e gera `MensagemPublicada`.
 *   Mensagem em quarentena ou bloqueada volta como erro para quem publicou.
 */
export interface ChatPort {
  publicar(live: LiveId, mensagem: MensagemChat): Promise<Resultado<void>>;
  publicarDestacada(live: LiveId, mensagem: MensagemDestacada): Promise<Resultado<void>>;
  /** Passa a receber as mensagens entregues na live a partir de agora; não reenvia histórico. */
  inscrever(live: LiveId, ouvinte: (mensagem: MensagemEntregue) => void): Cancelamento;
}
