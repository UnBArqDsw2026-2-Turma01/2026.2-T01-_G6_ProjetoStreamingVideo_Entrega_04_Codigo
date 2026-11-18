/**
 * Identificadores com marca de tipo.
 *
 * Em tempo de execução são `string` comuns. A marca existe só para o compilador:
 * impede passar um `CanalId` onde se espera um `UsuarioId`.
 */
export type UsuarioId = string & { readonly __marca: 'UsuarioId' };
export type CanalId = string & { readonly __marca: 'CanalId' };
export type LiveId = string & { readonly __marca: 'LiveId' };
/** Pacote do catálogo de recarga (E03 SG2: `Pacote.id`, ex.: `"p10"`). */
export type PacoteId = string & { readonly __marca: 'PacoteId' };

// Construtores de ids: a única exceção à regra "nenhuma implementação" do contrato (#3).
// Só aplicam a marca; não validam formato.
export const usuarioId = (valor: string): UsuarioId => valor as UsuarioId;
export const canalId = (valor: string): CanalId => valor as CanalId;
export const liveId = (valor: string): LiveId => valor as LiveId;
export const pacoteId = (valor: string): PacoteId => valor as PacoteId;
