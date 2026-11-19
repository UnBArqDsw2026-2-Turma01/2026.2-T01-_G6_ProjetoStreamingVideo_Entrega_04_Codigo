/**
 * Vocabulário de domínio do conteúdo gerado pelo usuário (UGC).
 *
 * As quatro enumerações aparecem com estes nomes e constantes no diagrama de classes v3
 * da Entrega 02 (componente "Conteúdo gerado pelo usuário"). Foram declaradas como `enum`
 * do TypeScript pelo mesmo motivo do Builder: cada constante do modelo vira uma constante
 * nomeada no código, e os dois artefatos podem ser conferidos lado a lado.
 *
 * `ContentVisibility` e `LatencyMode` vinham da API pública do Builder (`../builder`) na
 * E03. No monorepo o Builder está em `@g6/transmissao`, que este pacote não pode importar
 * (regra 2 do guia), então as duas são declaradas aqui, com as mesmas constantes. Não há
 * mais `StreamConfig` do Builder alimentando a `LiveStream` diretamente: a live chega por
 * evento e `TransmissaoPort`, e quem a converte é `ConteudoDeLive`.
 */

/** Modo de latência da transmissão ao vivo (diagrama v3 da Entrega 02). */
export enum LatencyMode {
  STANDARD = "STANDARD",
  LOW = "LOW",
  ULTRA_LOW = "ULTRA_LOW",
}

/** Visibilidade do conteúdo publicado (diagrama v3 da Entrega 02). */
export enum ContentVisibility {
  PUBLIC = "PUBLIC",
  UNLISTED = "UNLISTED",
  PRIVATE = "PRIVATE",
}

/** Situação de publicação de um `UserContent` (diagrama v3). */
export enum PublicationStatus {
  UNPUBLISHED = "UNPUBLISHED",
  PUBLISHED = "PUBLISHED",
}

/** Veredito de moderação devolvido por `PolicyService.moderate` (diagrama v3, DE09). */
export enum ModerationResult {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  NEEDS_REVIEW = "NEEDS_REVIEW",
}

/** Estado da transmissão ao vivo (diagrama v3). */
export enum LiveStreamStatus {
  CREATED = "CREATED",
  LIVE = "LIVE",
  ENDED = "ENDED",
  FAILED = "FAILED",
}

/** Estado de processamento da gravação (diagrama v3). */
export enum ProcessingStatus {
  PROCESSING = "PROCESSING",
  READY = "READY",
  FAILED = "FAILED",
}
