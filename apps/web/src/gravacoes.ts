// Gravação das lives (VOD assistível). O navegador do criador grava o que transmite (MediaRecorder) e
// envia os pedaços para cá enquanto a live está no ar; o servidor guarda cada trecho em disco e serve
// de volta para quem abrir a gravação em "Transmissões anteriores".
//
// Os arquivos são TEMPORÁRIOS: ficam numa pasta do próprio app (ignorada pelo git) e são apagados
// quando o servidor sobe e quando ele é encerrado (Ctrl+C, SIGTERM ou saída normal).
import { createReadStream, existsSync, rmSync, statSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LiveId } from '@g6/shared-kernel';
import type { App, Requisicao, Resposta } from './http/app';
import type { Contexto } from './rotas';

export const PASTA_PADRAO_VODS = process.env.CA01_PASTA_VODS ?? fileURLToPath(new URL('../.vods-temporarios/', import.meta.url));

const TIPOS: Record<string, string> = { 'video/webm': 'webm', 'video/mp4': 'mp4' };
const MAX_PEDACO = 16 * 1024 * 1024;
const MAX_BYTES_POR_LIVE = 1024 * 1024 * 1024;
const MAX_PARTES_POR_LIVE = 50;

export interface ParteGravada {
  readonly parte: number;
  readonly tipo: string;
  readonly arquivo: string;
  readonly criador: string;
  bytes: number;
}

export class Gravacoes {
  private readonly lives = new Map<string, ParteGravada[]>();

  constructor(readonly pasta: string = PASTA_PADRAO_VODS) {}

  /** Apaga a pasta e esquece tudo. Só o `servidor.ts` chama, ao subir: criar a aplicação (ex.: nos testes) não apaga nada. */
  limpar(): void {
    rmSync(this.pasta, { recursive: true, force: true });
    this.lives.clear();
  }

  async iniciarParte(live: string, criador: string, tipo: string): Promise<ParteGravada | undefined> {
    const extensao = TIPOS[tipo];
    const partes = this.lives.get(live) ?? [];
    if (!extensao || partes.length >= MAX_PARTES_POR_LIVE) return undefined;
    await mkdir(this.pasta, { recursive: true });
    const parte: ParteGravada = { parte: partes.length, tipo, criador, bytes: 0, arquivo: join(this.pasta, `${live}-${partes.length}.${extensao}`) };
    this.lives.set(live, [...partes, parte]);
    return parte;
  }

  parte(live: string, numero: number): ParteGravada | undefined {
    return this.lives.get(live)?.[numero];
  }

  partes(live: string): ParteGravada[] {
    return this.lives.get(live) ?? [];
  }

  totalBytes(live: string): number {
    return this.partes(live).reduce((soma, p) => soma + p.bytes, 0);
  }

  async anexar(parte: ParteGravada, dados: Buffer): Promise<void> {
    parte.bytes += dados.length; // reserva antes de escrever: pedaços simultâneos não furam o limite
    await appendFile(parte.arquivo, dados);
  }

  resumo(): Record<string, { parte: number; tipo: string }[]> {
    const saida: Record<string, { parte: number; tipo: string }[]> = {};
    for (const [live, partes] of this.lives) {
      const com = partes.filter((p) => p.bytes > 0).map(({ parte, tipo }) => ({ parte, tipo }));
      if (com.length) saida[live] = com;
    }
    return saida;
  }
}

/** Apaga as gravações ao encerrar: Ctrl+C, SIGTERM, fechamento do terminal e saída normal. */
export function apagarGravacoesAoEncerrar(gravacoes: Gravacoes): void {
  let feito = false;
  const apagar = () => {
    if (feito) return;
    feito = true;
    try { rmSync(gravacoes.pasta, { recursive: true, force: true }); } catch { /* melhor esforço */ }
  };
  process.on('exit', apagar);
  for (const sinal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sinal, () => {
      apagar();
      process.exit(0);
    });
  }
}

const ok = (corpo?: unknown): Resposta => ({ status: 200, corpo });
const erro = (status: number, codigo: string, mensagem: string): Resposta => ({ status, corpo: { codigo, mensagem } });
const tipoLimpo = (v: unknown) => (typeof v === 'string' ? v.split(';')[0]!.trim().toLowerCase() : '');

export function registrarRotasGravacao(app: App, ctx: Contexto, gravacoes: Gravacoes): void {
  const aberta = (id: string) => ctx.servico.livesAbertas().find((l) => l.live === (id as LiveId));
  const doCriador = (req: Requisicao, criador: string) => ctx.sessaoDe(req)?.usuarioId === criador;

  // O criador abre um trecho (cada vez que liga a câmera) e recebe o número dele.
  app.rota('POST', '/api/lives/:id/gravacao', async (req) => {
    const live = aberta(req.params.id!);
    if (!live) return erro(404, 'NAO_ENCONTRADA', 'Live não encontrada ou já encerrada');
    const sessao = ctx.sessaoDe(req);
    if (!sessao) return erro(401, 'NAO_AUTENTICADO', 'Entre como criador');
    if (sessao.usuarioId !== live.criador) return erro(403, 'ACESSO_NEGADO', 'Só o criador da live grava');
    const tipo = tipoLimpo((req.corpo as { tipo?: unknown } | undefined)?.tipo);
    const parte = await gravacoes.iniciarParte(live.live, live.criador, tipo);
    if (!parte) return erro(400, 'ENTRADA_INVALIDA', 'Tipo de vídeo não aceito (use video/webm ou video/mp4) ou limite de trechos atingido');
    return ok({ parte: parte.parte });
  });

  // Pedaços do vídeo em ordem, em bytes crus.
  app.rota('POST', '/api/lives/:id/gravacao/:parte', async (req) => {
    const parte = gravacoes.parte(req.params.id!, Number(req.params.parte));
    if (!parte) return erro(404, 'NAO_ENCONTRADA', 'Trecho de gravação inexistente');
    if (!doCriador(req, parte.criador)) return erro(403, 'ACESSO_NEGADO', 'Só o criador da live grava');
    const dados = req.corpo as Buffer;
    if (!dados.length) return ok({ bytes: parte.bytes });
    if (gravacoes.totalBytes(req.params.id!) + dados.length > MAX_BYTES_POR_LIVE) return erro(413, 'GRAVACAO_GRANDE_DEMAIS', 'Limite de 1 GB por live atingido');
    await gravacoes.anexar(parte, dados);
    return ok({ bytes: parte.bytes });
  }, { corpo: 'bruto', limiteBytes: MAX_PEDACO });

  // Quais lives encerradas têm vídeo para assistir (a página junta isso à lista de VODs).
  app.rota('GET', '/api/vods/gravacoes', () => ok(gravacoes.resumo()));

  // Leitura aberta, como a live e o chat. Aceita Range (o <video> usa para avançar).
  app.rota('GET', '/api/vods/:live/video/:parte', (req) => {
    const parte = gravacoes.parte(req.params.live!, Number(req.params.parte));
    if (!parte || parte.bytes === 0 || !existsSync(parte.arquivo)) return erro(404, 'NAO_ENCONTRADA', 'Gravação inexistente');
    const total = statSync(parte.arquivo).size;
    const faixa = /^bytes=(\d*)-(\d*)$/.exec(String(req.cabecalhos.range ?? ''));
    let inicio = 0;
    let fim = total - 1;
    if (faixa && (faixa[1] || faixa[2])) {
      if (faixa[1]) { inicio = Number(faixa[1]); if (faixa[2]) fim = Math.min(Number(faixa[2]), total - 1); }
      else { inicio = Math.max(0, total - Number(faixa[2])); }
      if (inicio >= total || inicio > fim) return { fluxo: (res) => { res.writeHead(416, { 'content-range': `bytes */${total}` }); res.end(); } };
    }
    const parcial = inicio !== 0 || fim !== total - 1;
    return {
      fluxo: (res) => {
        res.writeHead(parcial ? 206 : 200, {
          'content-type': parte.tipo,
          'content-length': fim - inicio + 1,
          'accept-ranges': 'bytes',
          'cache-control': 'no-store',
          ...(parcial ? { 'content-range': `bytes ${inicio}-${fim}/${total}` } : {}),
        });
        const leitura = createReadStream(parte.arquivo, { start: inicio, end: fim });
        leitura.on('error', () => res.destroy());
        res.on('close', () => leitura.destroy());
        leitura.pipe(res);
      },
    };
  });
}
