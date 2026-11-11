import type { CanalId, LiveId, MoedaVirtual, UsuarioId } from '../tipos';

/**
 * Fatos já acontecidos que um pacote anuncia aos outros sem conhecê-los.
 * `tipo` discrimina a união; `em` é o instante do fato, não o da entrega.
 */
export type EventoDominio =
  /** Publicado por `@g6/transmissao` ao abrir a live. */
  | { readonly tipo: 'LiveIniciada'; readonly live: LiveId; readonly canal: CanalId; readonly em: Date }
  /** Publicado por `@g6/transmissao` ao encerrar; `@g6/conteudo` reage criando o VOD. */
  | { readonly tipo: 'LiveEncerrada'; readonly live: LiveId; readonly canal: CanalId; readonly em: Date }
  /** Publicado por `@g6/monetizacao` depois do repasse, mesmo que o chat falhe (D05). */
  | {
      readonly tipo: 'DoacaoConfirmada';
      readonly live: LiveId;
      readonly doador: UsuarioId;
      readonly valor: MoedaVirtual;
      readonly em: Date;
    }
  /** Publicado por `@g6/chat` para cada mensagem aprovada e entregue. */
  | {
      readonly tipo: 'MensagemPublicada';
      readonly live: LiveId;
      readonly autor: UsuarioId;
      readonly destacada: boolean;
      readonly em: Date;
    };

/** Nomes dos eventos, para tipar `EventBus.assinar`. */
export type TipoEvento = EventoDominio['tipo'];

/** O evento de um tipo específico: `EventoDe<'LiveIniciada'>`. */
export type EventoDe<T extends TipoEvento> = Extract<EventoDominio, { tipo: T }>;
