// Servidor da página integrada do CA-01 (`npm run web`).
// Login fica em src/auth e é plugado por `registrarRotas` (#17), sem editar este arquivo.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gatewaysDoAmbiente, type GatewaysDoAmbiente } from '@g6/monetizacao';
import { Aplicacao } from './http/app';
import { compor } from './ca01';
import { criarContexto, registrarRotasCA01, type RegistrarRotas } from './rotas';
import * as auth from './auth';

export function criarAplicacao(pagamentos?: GatewaysDoAmbiente): { app: Aplicacao; servico: ReturnType<typeof compor> } {
  const servico = compor(pagamentos);
  const contexto = criarContexto(servico);
  const app = new Aplicacao();

  registrarRotasCA01(app, contexto);

  // Ponto de extensão: se `src/auth` exportar `registrarRotas(app, contexto)`, ele é chamado aqui.
  const extensao = auth as { registrarRotas?: RegistrarRotas };
  extensao.registrarRotas?.(app, contexto);

  return { app, servico };
}

const ehPrincipal = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (ehPrincipal) {
  // O .env fica na raiz do repositório e é opcional: sem ele, só o processador simulado (guia, regra 8).
  const env = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(env)) process.loadEnvFile(env);
  const porta = Number(process.env.PORT ?? 3000);
  const urlPublica = process.env.URL_PUBLICA ?? `http://localhost:${porta}`;
  const pagamentos = await gatewaysDoAmbiente(process.env, undefined, `${urlPublica}/recarga/concluida`);
  console.log('Meios de pagamento:\n  Simulado: sempre disponível');
  for (const linha of pagamentos.avisos) console.log(`  ${linha}`);
  criarAplicacao(pagamentos)
    .app.criarServidor()
    .listen(porta, () => console.log(`CA-01 no navegador: http://localhost:${porta}`));
}
