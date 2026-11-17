import type { ErroDominio } from "@g6/shared-kernel";

/** Códigos estáveis das recusas do destaque, para quem trata o erro em código. */
export type CodigoErroDestaque =
  | "VALOR_ABAIXO_DO_MINIMO"
  | "MENSAGEM_VAZIA"
  | "MENSAGEM_ACIMA_DO_LIMITE"
  | "DESTAQUE_INVALIDO";

/**
 * Erro lançado quando uma regra da mensagem destacada é violada.
 * Era o `ErroDominio` da E03; aqui ele também satisfaz o `ErroDominio` do shared-kernel
 * (`codigo` e `mensagem`), então quem chama pode devolvê-lo direto num `Resultado`.
 */
export class ErroDestaque extends Error implements ErroDominio {
  readonly codigo: CodigoErroDestaque;
  readonly mensagem: string;

  constructor(mensagem: string, codigo: CodigoErroDestaque = "DESTAQUE_INVALIDO") {
    super(mensagem);
    this.name = "ErroDestaque";
    this.codigo = codigo;
    this.mensagem = mensagem;
  }
}
