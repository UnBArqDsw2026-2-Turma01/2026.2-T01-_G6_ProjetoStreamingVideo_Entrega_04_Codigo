import {
  canalId,
  EventBusEmMemoria,
  type LiveId,
  type LiveResumo,
  liveId,
  type Resultado,
  type Sessao,
  type TransmissaoPort,
  usuarioId,
} from "@g6/shared-kernel";
import { FakeTransmissao } from "@g6/shared-kernel/testing";
import { describe, expect, it } from "vitest";
import {
  BlocklistPolicyService,
  InMemoryContentRepository,
  LiveStream,
  LiveStreamStatus,
  ModerationResult,
  ProcessingStatus,
  PublicationStatus,
  RecordedVideo,
  type UserContent,
} from "../src/factory-method";
import { CONFIGURACAO_PADRAO, type ConfiguracaoDaLive, ConteudoDeLive } from "../src/index";

const criadora: Sessao = {
  usuarioId: usuarioId("criadora"),
  papel: "criador",
  token: "token",
  expiraEm: new Date("2026-12-31T00:00:00Z"),
};
const canal = canalId("canal-da-criadora");
const inicio = new Date("2026-11-19T20:00:00Z");
const fim = new Date("2026-11-19T21:00:00Z");

/** `TransmissaoPort` com a consulta controlada pelo teste: pode atrasar a leitura ou falhar. */
class TransmissaoControlada implements TransmissaoPort {
  private readonly resumos = new Map<LiveId, LiveResumo>();
  private portao: Promise<void> | undefined;
  private abrirPortao = () => {};
  private falhar = false;

  abrirLive(titulo: string): LiveId {
    const live = liveId(`live-${this.resumos.size + 1}`);
    this.resumos.set(live, { live, canal, criador: criadora.usuarioId, titulo, iniciadaEm: inicio });
    return live;
  }

  encerrarLive(live: LiveId): void {
    this.resumos.delete(live);
  }

  /** As próximas consultas só leem a live depois de `liberarLeitura()`. */
  adiarLeitura(): void {
    this.portao = new Promise((liberar) => {
      this.abrirPortao = liberar;
    });
  }

  liberarLeitura(): void {
    this.abrirPortao();
  }

  falharProximaConsulta(): void {
    this.falhar = true;
  }

  async abrir(): Promise<Resultado<LiveResumo>> {
    throw new Error("não usado: o teste abre a live com abrirLive()");
  }

  async encerrar(): Promise<Resultado<void>> {
    throw new Error("não usado: o teste encerra a live com encerrarLive()");
  }

  async consultar(live: LiveId): Promise<Resultado<LiveResumo>> {
    if (this.portao) await this.portao;
    if (this.falhar) {
      this.falhar = false;
      return { ok: false, erro: { codigo: "INDISPONIVEL", mensagem: "transmissão indisponível" } };
    }
    const resumo = this.resumos.get(live);
    return resumo
      ? { ok: true, valor: resumo }
      : { ok: false, erro: { codigo: "NAO_ENCONTRADA", mensagem: "Live inexistente ou encerrada" } };
  }
}

/** Repositório em memória que lança uma vez ao salvar uma live no status escolhido. */
class RepositorioQueFalhaUmaVez extends InMemoryContentRepository {
  private falharEm: LiveStreamStatus | undefined;

  falharNoProximoSaveDeLive(status: LiveStreamStatus): void {
    this.falharEm = status;
  }

  override save(content: UserContent): void {
    if (content instanceof LiveStream && content.status === this.falharEm) {
      this.falharEm = undefined;
      throw new Error("repositório indisponível");
    }
    super.save(content);
  }

  lives(): LiveStream[] {
    return [...Array(this.size).keys()]
      .map((i) => this.findContentById(`conteudo-${i + 1}`))
      .filter((conteudo) => conteudo instanceof LiveStream);
  }
}

interface Opcoes {
  readonly bloqueados?: readonly string[];
  readonly repositorio?: InMemoryContentRepository;
  readonly configuracao?: ConfiguracaoDaLive;
}

function setup(opcoes: Opcoes = {}) {
  return montar(new FakeTransmissao(), opcoes);
}

function setupCom(transmissao: TransmissaoControlada) {
  return montar(transmissao, {});
}

function montar<T extends TransmissaoPort>(transmissao: T, opcoes: Opcoes) {
  const eventos = new EventBusEmMemoria();
  const repositorio = opcoes.repositorio ?? new InMemoryContentRepository();
  let sequencia = 0;
  const conteudo = new ConteudoDeLive({
    eventos,
    transmissao,
    repositorio,
    politica: new BlocklistPolicyService(repositorio, opcoes.bloqueados ?? []),
    configuracao: opcoes.configuracao,
    novoId: () => `conteudo-${++sequencia}`,
  });
  const cancelar = conteudo.assinar();
  return { eventos, transmissao, repositorio, conteudo, cancelar };
}

/** Abre a live no fake e publica `LiveIniciada`, como `TransmissaoPort.abrir` faria. */
async function abrirLive(ctx: ReturnType<typeof setup>, titulo = "Show ao vivo") {
  const aberta = await ctx.transmissao.abrir(criadora, { preset: "alta-qualidade", titulo });
  if (!aberta.ok) throw new Error(aberta.erro.mensagem);
  const { live } = aberta.valor;
  ctx.eventos.publicar({ tipo: "LiveIniciada", live, canal, em: inicio });
  return live;
}

/** Encerra no fake e publica `LiveEncerrada`: depois disso, `consultar` já devolve erro. */
async function encerrarLive(ctx: ReturnType<typeof setup>, live: ReturnType<typeof liveId>) {
  await ctx.transmissao.encerrar(criadora, live);
  ctx.eventos.publicar({ tipo: "LiveEncerrada", live, canal, em: fim });
}

describe("ConteudoDeLive (Client do Factory Method)", () => {
  it("publicar LiveEncerrada cria um VOD (RecordedVideo) da live", async () => {
    const ctx = setup();
    const live = await abrirLive(ctx);

    await encerrarLive(ctx, live);
    await ctx.conteudo.ocioso();

    const vod = await ctx.conteudo.gravacaoDe(live);
    expect(vod).toBeInstanceOf(RecordedVideo);
    expect(vod?.ownerId).toBe("criadora");
    expect(vod?.title).toBe("Show ao vivo");
    expect(vod?.processingStatus).toBe(ProcessingStatus.PROCESSING);
    expect(vod?.publicationStatus).toBe(PublicationStatus.UNPUBLISHED);
    expect(ctx.conteudo.falhas).toEqual([]);
  });

  it("LiveIniciada registra a LiveStream no ar e publicada", async () => {
    const ctx = setup();
    const live = await abrirLive(ctx);
    await ctx.conteudo.ocioso();

    const stream = await ctx.conteudo.liveDe(live);
    expect(stream).toBeInstanceOf(LiveStream);
    expect(stream?.status).toBe(LiveStreamStatus.LIVE);
    expect(stream?.channelId).toBe(canal);
    expect(stream?.startedAt).toEqual(inicio);
    expect(stream?.isPublished()).toBe(true);
    expect(ctx.repositorio.findContentById(stream?.id ?? "")).toBe(stream);
  });

  it("encerra a LiveStream no instante do evento e a tira do ar", async () => {
    const ctx = setup();
    const live = await abrirLive(ctx);

    await encerrarLive(ctx, live);
    await ctx.conteudo.ocioso();

    const stream = await ctx.conteudo.liveDe(live);
    expect(stream?.status).toBe(LiveStreamStatus.ENDED);
    expect(stream?.endedAt).toEqual(fim);
    expect(stream?.isPublished()).toBe(false);
    expect((await ctx.conteudo.gravacaoDe(live))?.sourceStreamId).toBe(stream?.id);
  });

  it("LiveEncerrada que chega com a consulta do início pendente espera por ela", async () => {
    const ctx = setup();
    const aberta = await ctx.transmissao.abrir(criadora, { preset: "movel", titulo: "Rápida" });
    if (!aberta.ok) throw new Error(aberta.erro.mensagem);
    const { live } = aberta.valor;

    // Tudo no mesmo tique: a consulta de LiveIniciada ainda não resolveu quando a live é
    // encerrada no fake e LiveEncerrada chega. O fake lê a live no momento da chamada.
    ctx.eventos.publicar({ tipo: "LiveIniciada", live, canal, em: inicio });
    void ctx.transmissao.encerrar(criadora, live);
    ctx.eventos.publicar({ tipo: "LiveEncerrada", live, canal, em: fim });
    await ctx.conteudo.ocioso();

    expect(ctx.transmissao.livesAbertas.has(live)).toBe(false);
    expect(await ctx.conteudo.gravacaoDe(live)).toBeInstanceOf(RecordedVideo);
  });

  it("limite declarado: sem VOD se consultar lê depois de um await e a live encerra antes", async () => {
    const transmissao = new TransmissaoControlada();
    const ctx = setupCom(transmissao);
    const live = transmissao.abrirLive("Encerrada às pressas");
    transmissao.adiarLeitura();

    ctx.eventos.publicar({ tipo: "LiveIniciada", live, canal, em: inicio });
    transmissao.encerrarLive(live);
    ctx.eventos.publicar({ tipo: "LiveEncerrada", live, canal, em: fim });
    transmissao.liberarLeitura();
    await ctx.conteudo.ocioso();

    expect(await ctx.conteudo.gravacaoDe(live)).toBeUndefined();
    expect(String(ctx.conteudo.falhas[0])).toMatch(/NAO_ENCONTRADA/);
  });

  it("retoma o encerramento que falhou depois de finish() num LiveEncerrada repetido", async () => {
    const repositorio = new RepositorioQueFalhaUmaVez();
    const ctx = setup({ repositorio });
    const live = await abrirLive(ctx);
    repositorio.falharNoProximoSaveDeLive(LiveStreamStatus.ENDED);

    await encerrarLive(ctx, live);
    await ctx.conteudo.ocioso();
    expect((await ctx.conteudo.liveDe(live))?.status).toBe(LiveStreamStatus.ENDED);
    expect(await ctx.conteudo.gravacaoDe(live)).toBeUndefined();
    expect(ctx.conteudo.falhas).toHaveLength(1);

    ctx.eventos.publicar({ tipo: "LiveEncerrada", live, canal, em: fim });
    await ctx.conteudo.ocioso();

    expect(await ctx.conteudo.gravacaoDe(live)).toBeInstanceOf(RecordedVideo);
    expect(ctx.conteudo.falhas).toHaveLength(1);
  });

  it("guarda a live que falhou no último save do início, sem criar outra nem deixá-la no ar", async () => {
    const repositorio = new RepositorioQueFalhaUmaVez();
    const ctx = setup({ repositorio });
    repositorio.falharNoProximoSaveDeLive(LiveStreamStatus.LIVE);

    const live = await abrirLive(ctx);
    await ctx.conteudo.ocioso();
    expect((await ctx.conteudo.liveDe(live))?.status).toBe(LiveStreamStatus.LIVE);
    expect(ctx.conteudo.falhas).toHaveLength(1);

    ctx.eventos.publicar({ tipo: "LiveIniciada", live, canal, em: inicio });
    await encerrarLive(ctx, live);
    await ctx.conteudo.ocioso();

    expect(repositorio.lives()).toHaveLength(1);
    expect(repositorio.lives().filter((stream) => stream.isPublished())).toEqual([]);
    expect(await ctx.conteudo.gravacaoDe(live)).toBeInstanceOf(RecordedVideo);
  });

  it("encerra sem VOD e sem falha a live sem gravação automática", async () => {
    const ctx = setup({
      configuracao: { ...CONFIGURACAO_PADRAO, recordAutomatically: false },
    });
    const live = await abrirLive(ctx);

    await encerrarLive(ctx, live);
    ctx.eventos.publicar({ tipo: "LiveEncerrada", live, canal, em: fim });
    await ctx.conteudo.ocioso();

    expect((await ctx.conteudo.liveDe(live))?.status).toBe(LiveStreamStatus.ENDED);
    expect(await ctx.conteudo.gravacaoDe(live)).toBeUndefined();
    expect(ctx.conteudo.falhas).toEqual([]);
  });

  it("esquece o início que falhou, e um LiveIniciada repetido tenta de novo", async () => {
    const transmissao = new TransmissaoControlada();
    const ctx = setupCom(transmissao);
    const live = transmissao.abrirLive("Segunda tentativa");
    transmissao.falharProximaConsulta();

    ctx.eventos.publicar({ tipo: "LiveIniciada", live, canal, em: inicio });
    await ctx.conteudo.ocioso();
    expect(await ctx.conteudo.liveDe(live)).toBeUndefined();

    ctx.eventos.publicar({ tipo: "LiveIniciada", live, canal, em: inicio });
    await ctx.conteudo.ocioso();

    expect((await ctx.conteudo.liveDe(live))?.title).toBe("Segunda tentativa");
    expect(ctx.conteudo.falhas).toHaveLength(1);
  });

  it("LiveEncerrada repetido não cria uma segunda gravação", async () => {
    const ctx = setup();
    const live = await abrirLive(ctx);

    await encerrarLive(ctx, live);
    ctx.eventos.publicar({ tipo: "LiveEncerrada", live, canal, em: fim });
    await ctx.conteudo.ocioso();

    const gravacoes = [...Array(ctx.repositorio.size).keys()]
      .map((i) => ctx.repositorio.findContentById(`conteudo-${i + 1}`))
      .filter((conteudo) => conteudo instanceof RecordedVideo);
    expect(gravacoes).toHaveLength(1);
    expect(ctx.conteudo.falhas).toEqual([]);
  });

  it("LiveEncerrada de uma live que não foi vista no início é ignorado", async () => {
    const ctx = setup();

    ctx.eventos.publicar({ tipo: "LiveEncerrada", live: liveId("desconhecida"), canal, em: fim });
    await ctx.conteudo.ocioso();

    expect(ctx.repositorio.size).toBe(0);
    expect(ctx.conteudo.falhas).toEqual([]);
  });

  it("registra a falha, sem lançar ao publicador, quando consultar devolve erro", async () => {
    const ctx = setup();
    const live = liveId("nao-aberta");

    expect(() => ctx.eventos.publicar({ tipo: "LiveIniciada", live, canal, em: inicio })).not.toThrow();
    ctx.eventos.publicar({ tipo: "LiveEncerrada", live, canal, em: fim });
    await ctx.conteudo.ocioso();

    expect(await ctx.conteudo.gravacaoDe(live)).toBeUndefined();
    expect(ctx.repositorio.size).toBe(0);
    expect(ctx.conteudo.falhas).toHaveLength(1);
    expect(String(ctx.conteudo.falhas[0])).toMatch(/NAO_ENCONTRADA/);
  });

  it("deixa a live recusada pela moderação no ar, mas fora da publicação", async () => {
    const ctx = setup({ bloqueados: ["spoiler"] });
    const live = await abrirLive(ctx, "Spoiler do final");

    await encerrarLive(ctx, live);
    await ctx.conteudo.ocioso();

    const stream = await ctx.conteudo.liveDe(live);
    expect(stream?.moderationStatus).toBe(ModerationResult.REJECTED);
    expect(stream?.publicationStatus).toBe(PublicationStatus.UNPUBLISHED);
    expect((await ctx.conteudo.gravacaoDe(live))?.moderationStatus).toBe(ModerationResult.REJECTED);
  });

  it("não reage mais depois do cancelamento", async () => {
    const ctx = setup();
    ctx.cancelar();

    await abrirLive(ctx);
    await ctx.conteudo.ocioso();

    expect(ctx.repositorio.size).toBe(0);
  });
});
