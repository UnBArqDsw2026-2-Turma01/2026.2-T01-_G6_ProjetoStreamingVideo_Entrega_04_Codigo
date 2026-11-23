// Servidor HTTP mínimo (node:http, sem dependências) e o ponto de extensão `registrarRotas`.
// Quem plugar rotas (ex.: o login da #17) usa só a interface `App`; este arquivo não muda.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface Requisicao {
  readonly params: Readonly<Record<string, string>>;
  /** JSON já interpretado; um `Buffer` nas rotas registradas com `corpo: 'bruto'`. */
  readonly corpo: unknown;
  readonly cabecalhos: IncomingMessage['headers'];
}

export type Resposta =
  | { readonly status: number; readonly corpo?: unknown }
  | { readonly fluxo: (res: ServerResponse) => void };

export type Tratador = (req: Requisicao) => Promise<Resposta> | Resposta;

/** Opções de uma rota: por padrão o corpo é JSON de até 64 KB; `bruto` entrega os bytes (ex.: pedaços de vídeo). */
export interface OpcoesRota {
  readonly corpo?: 'json' | 'bruto';
  readonly limiteBytes?: number;
}

/** O que um módulo plugado enxerga do servidor. */
export interface App {
  rota(metodo: Metodo, caminho: string, tratador: Tratador, opcoes?: OpcoesRota): void;
}

interface Rota {
  readonly metodo: Metodo;
  readonly padrao: RegExp;
  readonly chaves: string[];
  readonly tratador: Tratador;
  readonly opcoes: OpcoesRota;
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

  rota(metodo: Metodo, caminho: string, tratador: Tratador, opcoes: OpcoesRota = {}): void {
    const chaves: string[] = [];
    const fonte = caminho.replace(/:([a-zA-Z]+)/g, (_, chave: string) => {
      chaves.push(chave);
      return '([^/]+)';
    });
    this.rotas.push({ metodo, padrao: new RegExp(`^${fonte}$`), chaves, tratador, opcoes });
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
        if (metodo === 'GET') corpo = undefined;
        else if (rota.opcoes.corpo === 'bruto') corpo = await lerBruto(req, rota.opcoes.limiteBytes ?? LIMITE_CORPO);
        else corpo = await lerCorpo(req);
      } catch {
        return rota.opcoes.corpo === 'bruto'
          ? responderJson(res, 413, { codigo: 'CORPO_GRANDE_DEMAIS', mensagem: 'Corpo grande demais' })
          : responderJson(res, 400, { codigo: 'CORPO_INVALIDO', mensagem: 'JSON inválido ou grande demais' });
      }
      const resposta = await rota.tratador({ params, corpo, cabecalhos: req.headers });
      if ('fluxo' in resposta) return resposta.fluxo(res);
      return responderJson(res, resposta.status, resposta.corpo);
    }

    if (metodo === 'GET' && !pathname.startsWith('/api/')) return servirEstatico(pathname, res);
    responderJson(res, 404, { codigo: 'NAO_ENCONTRADA', mensagem: 'Rota inexistente' });
  }
}

/** Lê os bytes do corpo. Acima do limite, descarta o resto (até 2×) para o cliente receber o 413 em vez de a conexão cair. */
async function lerBruto(req: IncomingMessage, limite: number): Promise<Buffer> {
  const partes: Buffer[] = [];
  let total = 0;
  for await (const parte of req) {
    total += (parte as Buffer).length;
    if (total > limite * 2) { req.destroy(); throw new Error('corpo grande demais'); }
    if (total <= limite) partes.push(parte as Buffer);
  }
  if (total > limite) throw new Error('corpo grande demais');
  return Buffer.concat(partes);
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
