import type { MensagemEmCamadas } from "./MensagemEmCamadas";

/**
 * Decorator: é uma `MensagemEmCamadas` e tem uma `MensagemEmCamadas` (a que ele envolve).
 * Por padrão apenas delega; cada subclasse acrescenta a sua camada de destaque
 * sobre o resultado da camada interna.
 */
export abstract class MensagemDecorator implements MensagemEmCamadas {
  protected readonly interna: MensagemEmCamadas;

  protected constructor(interna: MensagemEmCamadas) {
    this.interna = interna;
  }

  cabecalho(): string {
    return this.interna.cabecalho();
  }

  texto(): string {
    return this.interna.texto();
  }

  cor(): string | null {
    return this.interna.cor();
  }

  tempoFixacaoMin(): number {
    return this.interna.tempoFixacaoMin();
  }

  descrever(): string {
    return this.interna.descrever();
  }
}
