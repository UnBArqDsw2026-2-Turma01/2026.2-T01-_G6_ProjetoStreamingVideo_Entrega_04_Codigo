import type { MeioPagamento, PacoteId, Recibo, Resultado, Sessao } from '../tipos';

/**
 * Compra de moeda virtual.
 *
 * - **Provê:** `@g6/monetizacao` (Decorator no preço, Adapter no gateway, Proxy na confirmação).
 * - **Consome:** `apps/*`.
 * - **Garante:** o `Recibo` só é devolvido com o pagamento confirmado e a moeda creditada;
 *   pagamento recusado ou meio indisponível voltam como erro e não creditam nada.
 */
export interface RecargaPort {
  recarregar(sessao: Sessao, pacote: PacoteId, meio: MeioPagamento): Promise<Resultado<Recibo>>;
}
