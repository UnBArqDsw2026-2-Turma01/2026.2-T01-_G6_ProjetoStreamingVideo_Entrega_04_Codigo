// VIOLAÇÃO PROPOSITAL (RD6): a configuração importando o canal.
// Deve disparar a regra `rd6-configuracao-nao-importa-canal`.
import { canalAberto } from '../canal/canal';

export const receita = { canal: canalAberto };
