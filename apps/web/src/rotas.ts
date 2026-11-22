// Rotas HTTP do CA-01. Cada rota só valida a entrada e chama `ServicoCA01`.
import type { ErroDominio, LiveId, MeioPagamento, MensagemEntregue, Papel, PacoteId, PresetTransmissao, Resultado, Sessao } from '@g6/shared-kernel';
import type { App, Requisicao, Resposta } from './http/app';
import type { ServicoCA01 } from './ca01';

/** O que o servidor entrega a quem plugar rotas (ex.: login da #17). */
export interface Contexto {
  readonly servico: ServicoCA01;
  /** Sessão do usuário da requisição (cabeçalho `Authorization: Bearer <token>`), se válida. */
  sessaoDe(req: Requisicao): Sessao | undefined;
  /** Registra uma sessão emitida (ex.: após login) para que `sessaoDe` a reconheça. */
  emitirSessao(sessao: Sessao): void;
}

/** Contrato do ponto de extensão: `apps/web/src/auth/index.ts` pode exportar uma função com esta forma. */
export type RegistrarRotas = (app: App, contexto: Contexto) => void;

export function criarContexto(servico: ServicoCA01): Contexto {
  const sessoes = new Map<string, Sessao>();
  return {
    servico,
    emitirSessao: (sessao) => void sessoes.set(sessao.token, sessao),
    sessaoDe: (req) => {
      const token = /^Bearer (.+)$/.exec(String(req.cabecalhos.authorization ?? ''))?.[1];
      const sessao = token ? sessoes.get(token) : undefined;
      return sessao && sessao.expiraEm.getTime() > Date.now() ? sessao : undefined;
    },
  };
}

const STATUS_POR_CODIGO: Record<string, number> = {
  ACESSO_NEGADO: 403,
  NAO_ENCONTRADA: 404,
  RECARGA_NAO_ENCONTRADA: 404,
  RECARGA_INEXISTENTE: 404,
  PROCESSADOR_INDISPONIVEL: 502,
  SALDO_INSUFICIENTE: 409,
  LIVE_ENCERRADA: 409,
};

const ok = (corpo?: unknown): Resposta => ({ status: 200, corpo });
const erro = (status: number, codigo: string, mensagem: string): Resposta => ({ status, corpo: { codigo, mensagem } });
const deResultado = <T>(r: Resultado<T, ErroDominio>, mapear: (v: T) => unknown = (v) => v): Resposta =>
  r.ok ? ok(mapear(r.valor)) : erro(STATUS_POR_CODIGO[r.erro.codigo] ?? 422, r.erro.codigo, r.erro.mensagem);

const campo = (corpo: unknown, nome: string): unknown => (corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>)[nome] : undefined);
const texto = (corpo: unknown, nome: string): string | undefined => {
  const v = campo(corpo, nome);
  return typeof v === 'string' ? v : undefined;
};

export function registrarRotasCA01(app: App, ctx: Contexto): void {
  const { servico } = ctx;
  const comSessao = (tratador: (sessao: Sessao, req: Requisicao) => Promise<Resposta> | Resposta) => (req: Requisicao) => {
    const sessao = ctx.sessaoDe(req);
    return sessao ? tratador(sessao, req) : erro(401, 'NAO_AUTENTICADO', 'Entre como criador ou espectador');
  };

  app.rota('GET', '/api/saude', () => ok({ status: 'ok' }));
  app.rota('GET', '/api/faixas', () => ok(servico.faixas()));

  // Sessão de demonstração, enquanto o login real (#17) não é plugado.
  app.rota('POST', '/api/demo/sessao', (req) => {
    const papel = texto(req.corpo, 'papel');
    if (papel !== 'criador' && papel !== 'espectador') return erro(400, 'PAPEL_INVALIDO', 'Use "criador" ou "espectador"');
    const sessao = servico.sessaoDemo(papel as Papel);
    ctx.emitirSessao(sessao);
    return ok({ token: sessao.token, papel: sessao.papel, usuario: sessao.usuarioId });
  });

  // Transmissão
  app.rota('GET', '/api/lives', () => ok(servico.livesAbertas()));
  app.rota('POST', '/api/lives', comSessao(async (sessao, req) => {
    const preset = texto(req.corpo, 'preset');
    const titulo = texto(req.corpo, 'titulo')?.trim();
    if (!['baixa-latencia', 'alta-qualidade', 'movel'].includes(preset ?? '') || !titulo) {
      return erro(400, 'ENTRADA_INVALIDA', 'Informe título e preset (baixa-latencia, alta-qualidade ou movel)');
    }
    return deResultado(await servico.abrirLive(sessao, { preset, titulo } as PresetTransmissao));
  }));
  app.rota('POST', '/api/lives/:id/encerrar', comSessao(async (sessao, req) =>
    deResultado(await servico.encerrarLive(sessao, req.params.id as LiveId), () => ({ encerrada: true }))));
  app.rota('GET', '/api/vods', () => ok(servico.vodsDisponiveis()));

  // Recarga
  app.rota('GET', '/api/saldo', comSessao((sessao) => ok({ moeda: servico.saldo(sessao.usuarioId) })));
  app.rota('GET', '/api/recarga/meios', () => ok(servico.meiosPagamento()));
  app.rota('GET', '/api/recarga/ofertas', comSessao(async (sessao) => deResultado(await servico.ofertas(sessao))));
  app.rota('POST', '/api/recarga', comSessao(async (sessao, req) => {
    const pacote = texto(req.corpo, 'pacote');
    const meio = texto(req.corpo, 'meio') ?? 'simulado';
    if (!pacote) return erro(400, 'ENTRADA_INVALIDA', 'Informe o pacote');
    if (!['simulado', 'mercadopago', 'stripe'].includes(meio)) {
      return erro(400, 'ENTRADA_INVALIDA', 'Meio de pagamento inválido (simulado, mercadopago ou stripe)');
    }
    return deResultado(await servico.recarregar(sessao, pacote as PacoteId, meio as MeioPagamento));
  }));
  // Retorno do checkout do Stripe (success_url): a aba do pagamento mostra um aviso e pode ser fechada.
  app.rota('GET', '/recarga/concluida', () => ({
    fluxo: (res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>Pagamento enviado</title>'
        + '<p style="font-family:sans-serif">Pagamento enviado. Volte à aba do CA-01: o saldo é atualizado quando o processador confirmar.</p>');
    },
  }));
  // Verifica o pagamento: no simulado, paga na hora; nos reais, a página chama enquanto a recarga está pendente.
  app.rota('POST', '/api/recarga/:id/confirmar', comSessao(async (sessao, req) =>
    deResultado(await servico.confirmarRecarga(sessao, req.params.id!))));

  // Doação e chat
  app.rota('POST', '/api/lives/:id/doacoes', comSessao(async (sessao, req) => {
    const valor = campo(req.corpo, 'valor');
    if (typeof valor !== 'number') return erro(400, 'ENTRADA_INVALIDA', 'Informe o valor da doação');
    return deResultado(await servico.doar(sessao, req.params.id as LiveId, valor, texto(req.corpo, 'mensagem')));
  }));
  app.rota('POST', '/api/lives/:id/chat', comSessao(async (sessao, req) =>
    deResultado(await servico.enviarMensagem(sessao, req.params.id as LiveId, texto(req.corpo, 'texto') ?? ''), () => ({ enviada: true }))));

  // Chat ao vivo (Server-Sent Events). Leitura aberta: o navegador não envia cabeçalhos no EventSource.
  app.rota('GET', '/api/lives/:id/chat/stream', (req) => ({
    fluxo: (res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': conectado\n\n');
      const cancelar = servico.portas.chat.inscrever(req.params.id as LiveId, (m: MensagemEntregue) => {
        res.write(`data: ${JSON.stringify(m)}\n\n`);
      });
      res.on('close', cancelar);
    },
  }));
}
