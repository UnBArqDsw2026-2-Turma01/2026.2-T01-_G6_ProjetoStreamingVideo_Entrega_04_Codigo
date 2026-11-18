import type { MoedaVirtual } from './comuns';
import type { LiveId, UsuarioId } from './ids';

/** Mensagem comum de chat (E03 SG3: `ChatMessage`). */
export interface MensagemChat {
  readonly id: string;
  readonly autor: UsuarioId;
  readonly nomeAutor: string;
  readonly texto: string;
  readonly em: Date;
}

/**
 * Mensagem paga, com os destaques já resolvidos pelo Decorator da monetização
 * (E03 SG2: `MensagemDestacada`). O chat só exibe; não recalcula faixa.
 */
export interface MensagemDestacada extends MensagemChat {
  /** Quanto foi doado junto com a mensagem. */
  readonly valor: MoedaVirtual;
  /** Cor da faixa de destaque; `null` quando não há cor. */
  readonly cor: string | null;
  /** Minutos fixada no topo do chat; `0` quando não fixa. */
  readonly tempoFixacaoMin: number;
}

/** O que cada ouvinte de `ChatPort.inscrever` recebe: só mensagens aprovadas pela moderação. */
export type MensagemEntregue =
  | { readonly live: LiveId; readonly destacada: false; readonly mensagem: MensagemChat }
  | { readonly live: LiveId; readonly destacada: true; readonly mensagem: MensagemDestacada };
