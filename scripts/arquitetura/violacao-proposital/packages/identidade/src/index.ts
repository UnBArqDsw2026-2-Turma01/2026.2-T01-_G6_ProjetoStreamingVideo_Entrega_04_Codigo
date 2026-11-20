// VIOLAÇÃO PROPOSITAL (#18): um contexto importando um módulo fora de `packages/`.
// Deve disparar a regra `contexto-so-importa-shared-kernel`: a regra não olha só
// `packages/` e `apps/`, porque uma pasta da raiz serviria de ponte entre contextos.
import { ponte } from '../../../compartilhado/ponte';

export const origem = ponte;
