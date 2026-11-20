// VIOLAÇÃO PROPOSITAL (#18): o shared-kernel importando um módulo fora de `packages/`.
// Deve disparar a regra `shared-kernel-isolado`.
import { ponte } from '../../../compartilhado/ponte';

export const foraDoKernel = ponte;
