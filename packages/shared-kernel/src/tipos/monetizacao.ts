import type { ErroDominio, MoedaVirtual } from './comuns';
import type { LiveId, PacoteId, UsuarioId } from './ids';

/** Processador escolhido para pagar a recarga (E03 SG2: adaptadores de `GatewayPagamento`). */
export type MeioPagamento = 'simulado' | 'mercadopago' | 'stripe';

/**
 * Oferta de um pacote no modal de recarga, com os preços montados pela cadeia de
 * Decorator da monetização (E03 SG2: `OfertaPacote`). Valores em centavos de real.
 */
export interface OfertaRecarga {
  readonly pacote: PacoteId;
  readonly moeda: MoedaVirtual;
  /** Preço fora da promoção, já com taxa e imposto. É o valor riscado no modal. */
  readonly precoSemDescontoCentavos: number;
  /** Preço final, com a cadeia completa de decoradores. */
  readonly precoCentavos: number;
  readonly descontoPercentual?: number;
  /** Camadas aplicadas, ex.: "pacote de 210 (R$ 10,00) → desconto de 8% → imposto de 5%". */
  readonly composicao: string;
}

/** Recarga criada e aguardando o pagamento. Nada foi creditado ainda. */
export interface CheckoutPendente {
  readonly recargaId: string;
  readonly pacote: PacoteId;
  /** Meio efetivamente usado; pode diferir do escolhido se ele estava indisponível (O07). */
  readonly meio: MeioPagamento;
  readonly valorCobradoCentavos: number;
  readonly moedaACreditar: MoedaVirtual;
  /** Link do checkout (Mercado Pago, Stripe) ou instrução do processador simulado. */
  readonly instrucoes: string;
}

/** Prova de uma recarga concluída: a moeda já foi creditada na carteira. */
export interface Recibo {
  readonly recargaId: string;
  readonly pacote: PacoteId;
  readonly moedaCreditada: MoedaVirtual;
  /** Valor cobrado em centavos de real, já com desconto, taxa e imposto. */
  readonly valorCobradoCentavos: number;
  readonly meio: MeioPagamento;
  readonly em: Date;
}

/**
 * Prova de uma doação concluída: o repasse ao criador já aconteceu.
 *
 * `destaqueEntregue: false` significa que a doação tinha mensagem e o chat falhou
 * ao exibi-la. A doação continua válida (E03, Ata S2_02, D05); `aviso` explica a falha.
 */
export interface ComprovanteDoacao {
  readonly doacaoId: string;
  readonly live: LiveId;
  readonly doador: UsuarioId;
  readonly valor: MoedaVirtual;
  readonly destaqueEntregue: boolean;
  readonly aviso?: string;
  readonly em: Date;
}

/** Em que ponto a recarga está. Só `concluida` significa moeda creditada. */
export type SituacaoRecarga =
  | { readonly situacao: 'pendente'; readonly checkout: CheckoutPendente }
  | { readonly situacao: 'concluida'; readonly recibo: Recibo }
  /**
   * Não ocorre no fluxo atual: falhas ao criar o checkout voltam como erro em `recarregar`,
   * e recusa ou expiração mantêm `pendente`. Reservada para um checkout expirado,
   * se a monetização passar a cancelá-lo.
   */
  | { readonly situacao: 'cancelada'; readonly recargaId: string; readonly motivo: string };

/**
 * Erro de `RecargaPort.recarregar`. Com o código `MEIO_INDISPONIVEL`, `alternativas`
 * traz os meios que estão respondendo, para o modal oferecer ao espectador (O07).
 */
export interface ErroRecarga extends ErroDominio {
  readonly alternativas?: readonly MeioPagamento[];
}
