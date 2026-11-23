// Sinalização da câmera da live (WebRTC), sem dependências: o criador transmite do navegador e cada
// espectador recebe uma conexão ponto a ponto. O servidor só repassa as descrições SDP (oferta do
// espectador → resposta do criador); o vídeo em si nunca passa por aqui.
//
// Fluxo, todo por HTTP simples:
//   1. criador liga a câmera:   POST /api/lives/:id/video/camera {ativa:true} e passa a consultar
//                               GET  /api/lives/:id/video/ofertas (cada consulta é também o "estou aqui")
//   2. espectador vê a live:    GET  /api/lives/:id/video/estado → {ativa}
//   3. espectador pede o vídeo: POST /api/lives/:id/video/ofertas {sdp} → {id}
//   4. criador responde:        POST /api/lives/:id/video/respostas {id, sdp}
//   5. espectador recebe:       GET  /api/lives/:id/video/respostas/:id → {sdp}
import { randomUUID } from 'node:crypto';
import type { LiveId } from '@g6/shared-kernel';
import type { App, Requisicao, Resposta } from './http/app';
import type { Contexto } from './rotas';

/** Sem consulta do criador por este tempo, a câmera é tratada como desligada (aba fechada, rede caiu). */
export const TOLERANCIA_SINAL_MS = 6_000;
const VALIDADE_PENDENTE_MS = 60_000;
const MAX_PENDENTES = 100;
const MAX_SDP = 48 * 1024;

interface Oferta { readonly id: string; readonly sdp: string; readonly em: number }
interface RespostaSdp { readonly sdp: string; readonly em: number }

class SalaVideo {
  ativa = false;
  /** Muda a cada vez que a câmera liga; o espectador reconecta quando a versão muda. */
  versao = 0;
  ultimoSinal = 0;
  readonly ofertas = new Map<string, Oferta>();
  readonly respostas = new Map<string, RespostaSdp>();

  get noAr(): boolean {
    return this.ativa && Date.now() - this.ultimoSinal < TOLERANCIA_SINAL_MS;
  }

  limpar(): void {
    this.ofertas.clear();
    this.respostas.clear();
  }

  podar(agora = Date.now()): void {
    for (const [id, o] of this.ofertas) if (agora - o.em > VALIDADE_PENDENTE_MS) this.ofertas.delete(id);
    for (const [id, r] of this.respostas) if (agora - r.em > VALIDADE_PENDENTE_MS) this.respostas.delete(id);
  }
}

const ok = (corpo?: unknown): Resposta => ({ status: 200, corpo });
const erro = (status: number, codigo: string, mensagem: string): Resposta => ({ status, corpo: { codigo, mensagem } });
const campo = (corpo: unknown, nome: string): unknown =>
  corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>)[nome] : undefined;
const sdpValido = (v: unknown): v is string => typeof v === 'string' && v.startsWith('v=0') && v.length <= MAX_SDP;

export function registrarRotasVideo(app: App, ctx: Contexto): void {
  const salas = new Map<string, SalaVideo>();
  const sala = (live: string): SalaVideo => {
    let s = salas.get(live);
    if (!s) salas.set(live, (s = new SalaVideo()));
    return s;
  };
  const liveAberta = (id: string) => ctx.servico.livesAbertas().find((l) => l.live === (id as LiveId));

  /** Valida live aberta + sessão do criador dono dela; devolve a sala ou a resposta de erro. */
  const comoCriador = (req: Requisicao): SalaVideo | Resposta => {
    const id = req.params.id!;
    const live = liveAberta(id);
    if (!live) return erro(404, 'NAO_ENCONTRADA', 'Live não encontrada ou já encerrada');
    const sessao = ctx.sessaoDe(req);
    if (!sessao) return erro(401, 'NAO_AUTENTICADO', 'Entre como criador');
    if (sessao.usuarioId !== live.criador) return erro(403, 'ACESSO_NEGADO', 'Só o criador da live controla a câmera');
    return sala(id);
  };
  const ehErro = (v: SalaVideo | Resposta): v is Resposta => !(v instanceof SalaVideo);

  app.rota('GET', '/api/lives/:id/video/estado', (req) => {
    const id = req.params.id!;
    if (!liveAberta(id)) { salas.delete(id); return ok({ ativa: false, versao: 0 }); }
    const s = sala(id);
    return ok({ ativa: s.noAr, versao: s.versao });
  });

  app.rota('POST', '/api/lives/:id/video/camera', (req) => {
    const s = comoCriador(req);
    if (ehErro(s)) return s;
    const ativa = campo(req.corpo, 'ativa');
    if (typeof ativa !== 'boolean') return erro(400, 'ENTRADA_INVALIDA', 'Informe ativa: true ou false');
    s.limpar();
    s.ativa = ativa;
    if (ativa) { s.versao += 1; s.ultimoSinal = Date.now(); }
    return ok({ ativa: s.noAr, versao: s.versao });
  });

  // Consulta do criador: devolve as ofertas pendentes (uma só vez) e renova o "estou aqui".
  app.rota('GET', '/api/lives/:id/video/ofertas', (req) => {
    const s = comoCriador(req);
    if (ehErro(s)) return s;
    s.podar();
    if (s.ativa) s.ultimoSinal = Date.now();
    const pendentes = [...s.ofertas.values()].map(({ id, sdp }) => ({ id, sdp }));
    s.ofertas.clear();
    return ok({ ativa: s.noAr, ofertas: pendentes });
  });

  app.rota('POST', '/api/lives/:id/video/respostas', (req) => {
    const s = comoCriador(req);
    if (ehErro(s)) return s;
    const id = campo(req.corpo, 'id');
    const sdp = campo(req.corpo, 'sdp');
    if (typeof id !== 'string' || !sdpValido(sdp)) return erro(400, 'ENTRADA_INVALIDA', 'Informe id e sdp da resposta');
    s.respostas.set(id, { sdp, em: Date.now() });
    return ok({ enviada: true });
  });

  // Lado do espectador: leitura aberta, como o chat. Não há nada além de SDP, e só com a câmera ligada.
  app.rota('POST', '/api/lives/:id/video/ofertas', (req) => {
    const id = req.params.id!;
    if (!liveAberta(id)) return erro(404, 'NAO_ENCONTRADA', 'Live não encontrada ou já encerrada');
    const s = sala(id);
    if (!s.noAr) return erro(409, 'CAMERA_DESLIGADA', 'O criador ainda não ligou a câmera');
    const sdp = campo(req.corpo, 'sdp');
    if (!sdpValido(sdp)) return erro(400, 'ENTRADA_INVALIDA', 'Informe o sdp da oferta');
    s.podar();
    if (s.ofertas.size >= MAX_PENDENTES) return erro(429, 'MUITAS_OFERTAS', 'Tente novamente em instantes');
    const oferta = { id: randomUUID(), sdp, em: Date.now() };
    s.ofertas.set(oferta.id, oferta);
    return ok({ id: oferta.id });
  });

  app.rota('GET', '/api/lives/:id/video/respostas/:oferta', (req) => {
    const id = req.params.id!;
    const s = salas.get(id);
    const resposta = s?.respostas.get(req.params.oferta!);
    if (!s || !resposta) return ok({ pronta: false });
    s.respostas.delete(req.params.oferta!);
    return ok({ pronta: true, sdp: resposta.sdp });
  });
}
