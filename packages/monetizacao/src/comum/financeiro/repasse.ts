import { Dinheiro } from "../dominio";

/**
 * Quanto o criador recebe em dinheiro por moeda doada (F2): R$ 0,02, fixo.
 * Fica abaixo do menor preço efetivo de venda (R$ 0,0251 no pacote de R$ 1000,
 * com bônus e promoção), para a plataforma nunca repassar mais do que recebeu.
 * Um teste do catálogo garante isso sempre que pacotes ou promoção mudarem.
 *
 * Fonte única: a doação aplica o valor e a recarga o usa para conferir o catálogo.
 */
export const REPASSE_POR_MOEDA = Dinheiro.deCentavos(2);
