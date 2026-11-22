// Contexto de conteúdo gerado pelo usuário (Factory Method) · reage a LiveEncerrada.
// Ponto de entrada público do pacote: exporte aqui só o que outros módulos podem usar.
// Implementação: #9.
export {
  CONFIGURACAO_PADRAO,
  ConteudoDeLive,
  type ConfiguracaoDaLive,
  type DependenciasConteudoDeLive,
} from "./conteudo-de-live";
export {
  type ContentRepository,
  ContentVisibility,
  InMemoryContentRepository,
  LatencyMode,
  LiveStream,
  LiveStreamStatus,
  ModerationResult,
  type PolicyService,
  ProcessingStatus,
  PublicationStatus,
  RecordedVideo,
  UserContent,
} from "./factory-method";
