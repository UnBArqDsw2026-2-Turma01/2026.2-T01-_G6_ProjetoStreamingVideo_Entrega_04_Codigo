// VIOLAÇÃO PROPOSITAL (#18): um `@g6/*` que não resolve.
// Sem a regra `g6-nao-resolvido`, ele ficaria com o nome cru e escaparia das
// outras regras (é o que acontece quando falta o `npm ci` na raiz).
import { ehVod } from '@g6/pacote-inexistente';

export const vod = ehVod;
