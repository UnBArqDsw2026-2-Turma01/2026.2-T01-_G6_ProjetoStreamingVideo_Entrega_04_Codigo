// Servidor HTTP mínimo (node:http, sem dependências) e o ponto de extensão `registrarRotas`.
// Quem plugar rotas (ex.: o login da #17) usa só a interface `App`; este arquivo não muda.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface Requisicao {
  readonly params: Readonly<Record<string, string>>;
  readonly corpo: unknown;
  readonly cabecalhos: IncomingMessage['headers'];
}

export type Resposta =
  | { readonly status: number; readonly corpo?: unknown }
  | { readonly fluxo: (res: ServerResponse) => void };

export type Tratador = (req: Requisicao) => Promise<Resposta> | Resposta;

/** O que um módulo plugado enxerga do servidor. */
export interface App {
  rota(metodo: Metodo, caminho: string, tratador: Tratador): void;
}

interface Rota {
  readonly metodo: Metodo;
  readonly padrao: RegExp;
  readonly chaves: string[];
  readonly tratador: Tratador;
}

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

const LIMITE_CORPO = 64 * 1024;
const PASTA_PUBLICA = fileURLToPath(new URL('../../public/', import.meta.url));

export class Aplicacao implements App {
  private readonly rotas: Rota[] = [];

  rota(metodo: Metodo, caminho: string, tratador: Tratador): void {
    const chaves: string[] = [];
    const fonte = caminho.replace(/:([a-zA-Z]+)/g, (_, chave: string) => {
      chaves.push(chave);
      return '([^/]+)';
    });
    this.rotas.push({ metodo, padrao: new RegExp(`^${fonte}$`), chaves, tratador });
  }

  criarServidor(): Server {
    return createServer((req, res) => {
      this.atender(req, res).catch((erro) => {
        console.error(erro);
        if (!res.headersSent) responderJson(res, 500, { codigo: 'ERRO_INTERNO', mensagem: 'Erro interno' });
        else res.end();
      });
    });
  }

  private async atender(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const metodo = (req.method ?? 'GET') as Metodo;
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');

    for (const rota of this.rotas) {
      if (rota.metodo !== metodo) continue;
      const casou = rota.padrao.exec(pathname);
      if (!casou) continue;
      const params = Object.fromEntries(rota.chaves.map((chave, i) => [chave, decodeURIComponent(casou[i + 1]!)]));
      let corpo: unknown;
      try {
        corpo = metodo === 'GET' ? undefined : await lerCorpo(req);
      } catch {
        return responderJson(res, 400, { codigo: 'CORPO_INVALIDO', mensagem: 'JSON inválido ou grande demais' });
      }
      const resposta = await rota.tratador({ params, corpo, cabecalhos: req.headers });
      if ('fluxo' in resposta) return resposta.fluxo(res);
      return responderJson(res, resposta.status, resposta.corpo);
    }

    if (metodo === 'GET' && !pathname.startsWith('/api/')) return servirEstatico(pathname, res);
    responderJson(res, 404, { codigo: 'NAO_ENCONTRADA', mensagem: 'Rota inexistente' });
  }
}

async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of req) {
    total += (parte as Buffer).length;
    if (total > LIMITE_CORPO) throw new Error('corpo grande demais');
    partes.push(parte as Buffer);
  }
  if (total === 0) return undefined;
  return JSON.parse(Buffer.concat(partes).toString('utf8'));
}

function responderJson(res: ServerResponse, status: number, corpo?: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
}

async function servirEstatico(pathname: string, res: ServerResponse): Promise<void> {
  const relativo = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const arquivo = resolve(PASTA_PUBLICA, relativo);
  if (!arquivo.startsWith(PASTA_PUBLICA.replace(/[\\/]$/, '') + sep)) {
    return responderJson(res, 403, { codigo: 'ACESSO_NEGADO', mensagem: 'Caminho inválido' });
  }
  try {
    const conteudo = await readFile(arquivo);
    res.writeHead(200, { 'content-type': TIPOS[extname(arquivo)] ?? 'application/octet-stream' });
    res.end(conteudo);
  } catch {
    responderJson(res, 404, { codigo: 'NAO_ENCONTRADA', mensagem: 'Arquivo inexistente' });
  }
}
