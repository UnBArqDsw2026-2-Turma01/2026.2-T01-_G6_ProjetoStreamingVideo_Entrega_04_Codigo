import type { MoedaVirtual } from './comuns';
import type { LiveId, PacoteId, UsuarioId } from './ids';

/** Processador escolhido para pagar a recarga (E03 SG2: adaptadores de `GatewayPagamento`). */
export type MeioPagamento = 'simulado' | 'mercadopago' | 'stripe';

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
