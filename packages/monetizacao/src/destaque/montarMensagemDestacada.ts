import type {
  MensagemDestacada as MensagemDestacadaDto,
  MoedaVirtual,
  UsuarioId,
} from "@g6/shared-kernel";
import { ComFaixaCor } from "./ComFaixaCor";
import { ComFixacao } from "./ComFixacao";
import { ComLimiteCaracteres } from "./ComLimiteCaracteres";
import { ErroDestaque } from "./ErroDestaque";
import { FaixaDestaque } from "./FaixaDestaque";
import { MensagemBase } from "./MensagemBase";
import type { MensagemDestacada } from "./MensagemDestacada";

/**
 * O que o Decorator não calcula e o DTO do shared-kernel exige: quem escreveu a
 * mensagem, o identificador dela e o instante. Vem de quem pede o destaque
 * (o Mediator da doação).
 */
export interface OrigemMensagem {
  readonly id: string;
  readonly autor: UsuarioId;
  readonly nomeAutor: string;
  readonly em: Date;
}

/**
 * Monta a pilha de decoradores a partir da faixa do valor doado (SC01, SC02):
 * limite de caracteres → cor da faixa → fixação (só nas faixas que fixam).
 *
 * É o Client do Decorator, papel que na E03 era do `Chat`: usa o resultado sem
 * saber quantas camadas ele tem.
 */
export function empilharDestaques(
  nomeAutor: string,
  texto: string,
  valor: MoedaVirtual,
): MensagemDestacada {
  const faixa = FaixaDestaque.paraQuantidade(valor);

  let mensagem: MensagemDestacada = new MensagemBase(nomeAutor, texto, valor);
  mensagem = new ComLimiteCaracteres(mensagem, faixa.limiteCaracteres);
  mensagem = new ComFaixaCor(mensagem, faixa.cor);
  if (faixa.tempoFixacaoMin > 0) {
    mensagem = new ComFixacao(mensagem, faixa.tempoFixacaoMin);
  }
  return mensagem;
}

/**
 * Transforma o valor doado e o texto no DTO `MensagemDestacada` do shared-kernel,
 * com a cor e o tempo de fixação já resolvidos. O chat só exibe; as regras de valor
 * ficam aqui.
 *
 * A saída é sempre um DTO válido. Quando não dá para montar um, lança `ErroDestaque`:
 * valor abaixo da faixa mínima, texto vazio ou texto acima do limite da faixa.
 */
export function montarMensagemDestacada(
  valor: MoedaVirtual,
  texto: string,
  origem: OrigemMensagem,
): MensagemDestacadaDto {
  if (texto.trim().length === 0) {
    throw new ErroDestaque("A mensagem destacada não pode estar vazia.", "MENSAGEM_VAZIA");
  }

  const mensagem = empilharDestaques(origem.nomeAutor, texto, valor);

  return {
    id: origem.id,
    autor: origem.autor,
    nomeAutor: origem.nomeAutor,
    // Ler o texto pela pilha é o que aplica o limite de caracteres da faixa.
    texto: mensagem.texto(),
    em: origem.em,
    valor,
    cor: mensagem.cor(),
    tempoFixacaoMin: mensagem.tempoFixacaoMin(),
  };
}
