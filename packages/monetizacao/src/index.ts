// Contexto de monetização: recarga (Decorator · Adapter · Proxy), doação (Facade + Mediator) e mensagem destacada (Decorator).
// Ponto de entrada público do pacote: exporte aqui só o que outros módulos podem usar.
// Implementação: #10, #11, #12.
export {
  RecargaService,
  gatewaysDoAmbiente,
  assinarNotificacao,
  type DependenciasRecargaService,
  type GatewaysDoAmbiente,
  type NotificacaoPagamento,
} from "./recarga";

// Composição em apps/*: o que o cli-demo e a web precisam para montar a doação e a
// recarga com os módulos reais. Os apps importam daqui, e não de `src/<pasta>`, para que
// o pacote só seja acessado pelo seu ponto de entrada (regra `app-so-pela-api-publica`).
export {
  AdaptadorProcessadorSimulado,
  ProcessadorSimulado,
  type RespostaSimulada,
} from "./recarga/pagamento";
export { montarDoacao } from "./doacao";
export { FaixaDestaque, type PropriedadesFaixa } from "./destaque";
export { RepositorioEmMemoria } from "./comum/compartilhado";
export { Usuario } from "./comum/dominio";
export { ServicoFinanceiro } from "./comum/financeiro";
