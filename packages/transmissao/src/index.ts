// Contexto de transmissão: configuração (Builder) e canal (Observer) · TransmissaoPort.
// Ponto de entrada público do pacote: exporte aqui só o que outros módulos podem usar.
// Os apps compõem o serviço e, por `configurarCanal`, anexam observadores ao canal.
export { TransmissaoService, type TransmissaoServiceOpcoes } from './servico';
export type { StreamChannel, IObserver, StreamEvent } from './canal';
