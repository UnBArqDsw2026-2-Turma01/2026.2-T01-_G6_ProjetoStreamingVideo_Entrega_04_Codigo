import { ErroDestaque } from "./ErroDestaque";
import type { MensagemEmCamadas } from "./MensagemEmCamadas";
import { MensagemDecorator } from "./MensagemDecorator";

/**
 * ConcreteDecorator: garante, na exibição, o limite de caracteres da faixa (SC02).
 *
 * Uma mensagem acima do limite não vira `MensagemDestacada`: o erro sobe para quem
 * pediu a montagem. O limite vale só para o corpo da mensagem, nunca para o cabeçalho.
 */
export class ComLimiteCaracteres extends MensagemDecorator {
  private readonly limite: number;

  constructor(interna: MensagemEmCamadas, limite: number) {
    super(interna);
    if (!Number.isInteger(limite) || limite <= 0) {
      throw new ErroDestaque(`O limite de caracteres deve ser um número inteiro positivo: ${limite}`);
    }
    this.limite = limite;
  }

  override texto(): string {
    const texto = this.interna.texto();
    // Array.from conta caracteres reais, inclusive emojis, e não unidades UTF-16.
    const tamanho = Array.from(texto).length;
    if (tamanho > this.limite) {
      throw new ErroDestaque(
        `A mensagem tem ${tamanho} caracteres e excede o limite de ${this.limite} da faixa (SC02).`,
        "MENSAGEM_ACIMA_DO_LIMITE",
      );
    }
    return texto;
  }

  override descrever(): string {
    return `${this.interna.descrever()} → limite de ${this.limite} caracteres`;
  }
}
