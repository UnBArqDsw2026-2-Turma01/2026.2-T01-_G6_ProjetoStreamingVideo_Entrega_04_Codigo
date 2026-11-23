// Servidor da página integrada do CA-01 (`npm run web`).
// Login fica em src/auth e é plugado por `registrarRotas` (#17), sem editar este arquivo.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gatewaysDoAmbiente, type GatewaysDoAmbiente } from '@g6/monetizacao';
import { Aplicacao } from './http/app';
import { compor } from './ca01';
import { criarContexto, registrarRotasCA01, type RegistrarRotas } from './rotas';
import * as auth from './auth';
import { registrarRotasVideo } from './video';
import { Gravacoes, apagarGravacoesAoEncerrar, registrarRotasGravacao } from './gravacoes';

export interface OpcoesAplicacao {
  /** Pasta das gravações temporárias (padrão: `apps/web/.vods-temporarios`; testes usam uma pasta própria). */
  readonly pastaVods?: string;
  /** Meios de pagamento da recarga (padrão: só o simulado). `subir` lê os do `.env` da raiz. */
  readonly pagamentos?: GatewaysDoAmbiente;
}

export function criarAplicacao(opcoes: OpcoesAplicacao = {}): { app: Aplicacao; servico: ReturnType<typeof compor>; gravacoes: Gravacoes } {
  const servico = compor(opcoes.pagamentos);
  const contexto = criarContexto(servico);
  const app = new Aplicacao();

  registrarRotasCA01(app, contexto);
  registrarRotasVideo(app, contexto);
  const gravacoes = new Gravacoes(opcoes.pastaVods);
  registrarRotasGravacao(app, contexto, gravacoes);

  // Ponto de extensão: se `src/auth` exportar `registrarRotas(app, contexto)`, ele é chamado aqui.
  const extensao = auth as { registrarRotas?: RegistrarRotas };
  extensao.registrarRotas?.(app, contexto);

  return { app, servico, gravacoes };
}

/**
 * Sobe a aplicação em uma ou mais portas. Todas as portas servem a MESMA aplicação (mesmas lives, chat e
 * gravações); como cada porta é uma origem diferente para o navegador, cada uma guarda o próprio login.
 * Isso permite abrir `localhost:3000` como criador e `localhost:3001` como espectador.
 */
export async function subir(portas: readonly number[]): Promise<void> {
  // Mercado Pago e Stripe só entram com credencial de TESTE no `.env` da raiz (que nunca é versionado);
  // sem ela, só o meio simulado. Mesma regra do `RecargaService` (#10).
  const env = fileURLToPath(new URL('../../../.env', import.meta.url));
  if (existsSync(env)) process.loadEnvFile(env);
  const pagamentos = await gatewaysDoAmbiente(process.env);
  for (const aviso of pagamentos.avisos) console.log(`Pagamentos: ${aviso}`);
  const { app, gravacoes } = criarAplicacao({ pagamentos });
  // Gravações das lives são temporárias: começa limpo e apaga tudo ao encerrar (Ctrl+C incluso).
  gravacoes.limpar();
  apagarGravacoesAoEncerrar(gravacoes);
  for (const porta of portas) {
    const servidor = app.criarServidor();
    servidor.on('error', (erro: NodeJS.ErrnoException) => {
      console.error(erro.code === 'EADDRINUSE'
        ? `Porta ${porta} em uso (outro \`npm run web\`/\`npm run dev\` aberto?). Encerre-o com Ctrl+C ou use outra porta: PORT=4000 npm run dev`
        : erro.message);
      process.exit(1);
    });
    servidor.listen(porta, () => console.log(`CA-01 no navegador: http://localhost:${porta}`));
  }
}

const ehPrincipal = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (ehPrincipal) void subir([Number(process.env.PORT ?? 3000)]);
