// Servidor da página integrada do CA-01 (`npm run web`).
// Login fica em src/auth e é plugado por `registrarRotas` (#17), sem editar este arquivo.
import { fileURLToPath } from 'node:url';
import { Aplicacao } from './http/app';
import { compor } from './ca01';
import { criarContexto, registrarRotasCA01, type RegistrarRotas } from './rotas';
import * as auth from './auth';
import { registrarRotasVideo } from './video';

export function criarAplicacao(): { app: Aplicacao; servico: ReturnType<typeof compor> } {
  const servico = compor();
  const contexto = criarContexto(servico);
  const app = new Aplicacao();

  registrarRotasCA01(app, contexto);
  registrarRotasVideo(app, contexto);

  // Ponto de extensão: se `src/auth` exportar `registrarRotas(app, contexto)`, ele é chamado aqui.
  const extensao = auth as { registrarRotas?: RegistrarRotas };
  extensao.registrarRotas?.(app, contexto);

  return { app, servico };
}

const ehPrincipal = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (ehPrincipal) {
  const porta = Number(process.env.PORT ?? 3000);
  criarAplicacao()
    .app.criarServidor()
    .listen(porta, () => console.log(`CA-01 no navegador: http://localhost:${porta}`));
}
