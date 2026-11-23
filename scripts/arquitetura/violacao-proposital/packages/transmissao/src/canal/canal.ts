// VIOLAÇÃO PROPOSITAL (RD6): o canal importando a configuração.
// Deve disparar a regra `rd6-canal-nao-importa-configuracao`.
import { receita } from '../configuracao/receita';

export const canalAberto = true;
export const configuracaoDoCanal = receita;
