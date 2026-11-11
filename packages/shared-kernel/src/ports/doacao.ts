import type { ComprovanteDoacao, LiveId, MoedaVirtual, Resultado, Sessao } from '../tipos';

/**
 * Doação a uma live, com ou sem mensagem destacada.
 *
 * - **Provê:** `@g6/monetizacao` (Facade + Mediator).
 * - **Consome:** `apps/*`.
 * - **Garante:** saldo insuficiente e doação ao próprio canal voltam como erro, sem débito.
 *   Com a doação concluída, publica `DoacaoConfirmada`. **Falha no chat não desfaz a doação**
 *   (E03, Ata S2_02, D05): o resultado continua `ok`, com `destaqueEntregue: false`.
 */
export interface DoacaoPort {
  /** Com `mensagem`, a doação vira mensagem destacada e é entregue pelo `ChatPort`. */
  doar(
    sessao: Sessao,
    live: LiveId,
    valor: MoedaVirtual,
    mensagem?: string,
  ): Promise<Resultado<ComprovanteDoacao>>;
}
