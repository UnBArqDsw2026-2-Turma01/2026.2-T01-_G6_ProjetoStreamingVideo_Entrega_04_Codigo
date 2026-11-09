import * as pacote from '../../src/index';

// Teste de fumaça do scaffold (#2): só prova que o pacote resolve e carrega.
// Apague quando o pacote tiver testes reais.
test('o pacote monetizacao carrega', () => {
  expect(typeof pacote).toBe('object');
});
