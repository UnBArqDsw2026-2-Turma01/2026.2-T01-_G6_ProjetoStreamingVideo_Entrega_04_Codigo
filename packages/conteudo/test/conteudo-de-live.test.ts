import { canalId, EventBusEmMemoria, liveId, type Sessao, usuarioId } from "@g6/shared-kernel";
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
} from "../src/factory-method";
import { ConteudoDeLive } from "../src/index";

const criadora: Sessao = {
  usuarioId: usuarioId("criadora"),
  papel: "criador",
  token: "token",
  expiraEm: new Date("2026-12-31T00:00:00Z"),
};
const canal = canalId("canal-da-criadora");
const inicio = new Date("2026-11-19T20:00:00Z");
const fim = new Date("2026-11-19T21:00:00Z");

function setup(opcoes: { bloqueados?: readonly string[] } = {}) {
  const eventos = new EventBusEmMemoria();
  const transmissao = new FakeTransmissao();
  const repositorio = new InMemoryContentRepository();
  let sequencia = 0;
  const conteudo = new ConteudoDeLive({
    eventos,
    transmissao,
    repositorio,
    politica: new BlocklistPolicyService(repositorio, opcoes.bloqueados ?? []),
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

  it("LiveEncerrada publicado antes de a consulta do início terminar não se perde", async () => {
    const ctx = setup();
    const aberta = await ctx.transmissao.abrir(criadora, { preset: "movel", titulo: "Rápida" });
    if (!aberta.ok) throw new Error(aberta.erro.mensagem);
    const { live } = aberta.valor;

    // Os dois eventos no mesmo tique: a consulta de LiveIniciada ainda está pendente.
    ctx.eventos.publicar({ tipo: "LiveIniciada", live, canal, em: inicio });
    ctx.eventos.publicar({ tipo: "LiveEncerrada", live, canal, em: fim });
    await ctx.conteudo.ocioso();

    expect(await ctx.conteudo.gravacaoDe(live)).toBeInstanceOf(RecordedVideo);
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
