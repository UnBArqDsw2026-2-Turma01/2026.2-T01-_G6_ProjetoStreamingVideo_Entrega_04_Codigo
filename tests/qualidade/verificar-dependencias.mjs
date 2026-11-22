import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const requisitos = [
  ['@g6/identidade', ['AutenticacaoService'], '#40 / issue #5'],
  ['@g6/chat', ['ChatService'], '#38 / issue #13'],
  ['@g6/moderacao', ['ModeracaoService', 'AutoModPipelineConcreto', 'EstrategiaToxicidade'], '#30 / issue #14'],
];
let pendente = false;
for (const [pacote, exports, origem] of requisitos) {
  const modulo = await import(pacote);
  for (const nome of exports) {
    if (typeof modulo[nome] !== 'function') {
      console.error(`Qualidade: ${pacote} ainda não exporta ${nome}. Dependência: PR ${origem}.`);
      pendente = true;
    }
  }
}
const arquitetura = fileURLToPath(new URL('../../scripts/arquitetura/node_modules/dependency-cruiser/package.json', import.meta.url));
if (!existsSync(arquitetura)) {
  console.error('Qualidade: instale as regras de arquitetura com npm ci --prefix scripts/arquitetura.');
  pendente = true;
}
if (pendente) {
  console.error('A suíte exige componentes reais: não substitui dependências pendentes por fakes nem ignora cenários.');
  process.exitCode = 1;
}
