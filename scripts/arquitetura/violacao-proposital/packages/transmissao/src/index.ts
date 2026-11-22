// VIOLAÇÃO PROPOSITAL (#18): `transmissao` importando `conteudo` por uma pasta cujo
// caminho contém `packages/transmissao/`. Deve disparar `contexto-so-importa-shared-kernel`:
// com os caminhos sem âncora, o trecho passaria por "o próprio contexto".
import { aninhado } from '../../conteudo/src/packages/transmissao/index';

export const vizinho = aninhado;
