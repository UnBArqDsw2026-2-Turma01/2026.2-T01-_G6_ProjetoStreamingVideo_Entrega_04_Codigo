import { compor } from './composicao';
import { FalhaNoRoteiro, executarCA01 } from './roteiro';

// Ponto de entrada de `npm run demo`: compõe os módulos reais e executa o CA-01 (live com
// doação destacada) no terminal. Não usa rede. Implementação: #15.
async function main(): Promise<void> {
  console.log('CA-01 — Live com doação destacada');
  console.log('Composição: identidade, transmissão, conteúdo, monetização, chat e moderação reais.');
  const sistema = await compor();
  await executarCA01(sistema, console.log);
}

main().catch((erro: unknown) => {
  if (erro instanceof FalhaNoRoteiro) {
    console.error(`\n${erro.message}`);
  } else {
    console.error(erro);
  }
  process.exitCode = 1;
});
