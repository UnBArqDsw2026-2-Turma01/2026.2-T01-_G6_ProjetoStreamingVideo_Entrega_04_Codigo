// monetizacao/destaque: Decorator da mensagem destacada (#12).
// Ponto de entrada público da pasta: exporte aqui só o que o resto da monetização pode usar.
// As classes do Decorator são detalhe interno; a doação (#11) usa `montarMensagemDestacada`.
export { montarMensagemDestacada } from "./montarMensagemDestacada";
export type { OrigemMensagem } from "./montarMensagemDestacada";
export { FaixaDestaque } from "./FaixaDestaque";
export type { PropriedadesFaixa } from "./FaixaDestaque";
export { ErroDestaque } from "./ErroDestaque";
export type { CodigoErroDestaque } from "./ErroDestaque";
