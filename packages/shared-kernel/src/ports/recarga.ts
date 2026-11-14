import type {
  CheckoutPendente,
  ErroRecarga,
  MeioPagamento,
  OfertaRecarga,
  PacoteId,
  Resultado,
  Sessao,
  SituacaoRecarga,
} from '../tipos';

/**
 * Compra de moeda virtual.
 *
 * - **Provê:** `@g6/monetizacao` (Decorator no preço, Adapter no gateway, Proxy na confirmação).
 * - **Consome:** `apps/*`.
 * - **Garante:** a recarga tem dois tempos. `recarregar` só cria o checkout e **não credita**;
 *   a moeda entra na carteira depois, quando um aviso de pagamento autêntico passa pelo Proxy,
 *   e só então `consultar` devolve `concluida`. Pagamento recusado aparece em `consultar`
 *   como `cancelada`, nunca em `recarregar`.
 *
 * O recebimento do aviso (webhook) fica fora do contrato: formato e assinatura são de cada
 * processador, então pertencem à monetização, e `apps/*` só ligam a rota a ela.
 */
export interface RecargaPort {
  /** Pacotes à venda com preço riscado e promocional, para o modal de recarga. */
  ofertas(sessao: Sessao): Promise<Resultado<OfertaRecarga[]>>;
  /**
   * Cria a recarga e o checkout no meio escolhido. Se ele estiver indisponível e sobrar um
   * único outro, segue nesse (ver `CheckoutPendente.meio`); se sobrarem vários, devolve
   * `MEIO_INDISPONIVEL` com as alternativas.
   */
  recarregar(
    sessao: Sessao,
    pacote: PacoteId,
    meio: MeioPagamento,
  ): Promise<Resultado<CheckoutPendente, ErroRecarga>>;
  /** Situação de uma recarga da própria sessão. Recarga inexistente ou de outro usuário é erro. */
  consultar(sessao: Sessao, recargaId: string): Promise<Resultado<SituacaoRecarga>>;
}
