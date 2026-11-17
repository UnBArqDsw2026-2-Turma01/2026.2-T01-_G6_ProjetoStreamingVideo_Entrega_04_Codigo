import type { Cancelamento } from '../tipos';
import type { EventoDe, EventoDominio, TipoEvento } from './evento-dominio';

/**
 * Barramento de eventos em memória, compartilhado pelos pacotes.
 *
 * - **Provê:** `@g6/shared-kernel` (`EventBusEmMemoria`, #4); `apps/*` criam a instância única.
 * - **Consome:** qualquer pacote, para publicar os próprios eventos e assinar os dos outros.
 * - **Garante:** entrega síncrona, na ordem de assinatura, só a quem assinou aquele `tipo`.
 */
export interface EventBus {
  publicar(evento: EventoDominio): void;
  assinar<T extends TipoEvento>(tipo: T, tratador: (evento: EventoDe<T>) => void): Cancelamento;
}
