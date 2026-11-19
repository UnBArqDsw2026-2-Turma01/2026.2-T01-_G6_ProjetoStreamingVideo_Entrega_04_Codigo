import type { Cancelamento, EventBus, EventoDe, LiveId, TransmissaoPort } from "@g6/shared-kernel";
import {
  BlocklistPolicyService,
  type ContentRepository,
  ContentVisibility,
  InMemoryContentRepository,
  LatencyMode,
  type LiveStream,
  type LiveStreamConfig,
  LiveStreamCreator,
  LiveStreamStatus,
  ModerationResult,
  type PolicyService,
  type RecordedVideo,
  RecordedVideoCreator,
} from "./factory-method";

/**
 * Campos da live que `LiveResumo` não traz: visibilidade, latência e gravação são
 * decididas pelo Builder em `@g6/transmissao` e não atravessam o contrato.
 */
export type ConfiguracaoDaLive = Omit<LiveStreamConfig, "title">;

/** Padrão do CA-01: live pública, latência padrão e gravação automática ligada. */
export const CONFIGURACAO_PADRAO: ConfiguracaoDaLive = {
  visibility: ContentVisibility.PUBLIC,
  latencyMode: LatencyMode.STANDARD,
  recordAutomatically: true,
};

/** O que a composição (apps/*) entrega ao conteúdo. */
export interface DependenciasConteudoDeLive {
  readonly eventos: EventBus;
  /** Dono e título da live: `LiveIniciada` só traz os ids. */
  readonly transmissao: TransmissaoPort;
  readonly repositorio?: ContentRepository;
  /** Moderação do conteúdo. Padrão: aprova tudo o que está no repositório. */
  readonly politica?: PolicyService;
  readonly configuracao?: ConfiguracaoDaLive;
  readonly novoId?: () => string;
  readonly agora?: () => Date;
}

/**
 * Client do Factory Method no monorepo (#9): cria o conteúdo da live a partir dos eventos,
 * sem conhecer o pacote `transmissao`.
 *
 * - `LiveIniciada`: consulta dono e título em `TransmissaoPort`, cria a `LiveStream` pelo
 *   `LiveStreamCreator`, coloca no ar e publica se a moderação aprovou.
 * - `LiveEncerrada`: encerra a `LiveStream` e cria o VOD pelo `RecordedVideoCreator`.
 *
 * O `RecordedVideoCreator` exige a `LiveStream` de origem encerrada no repositório (F2), e
 * `LiveEncerrada` não traz dono nem título. Por isso a live é registrada já no início, e a
 * consulta é feita nesse momento: depois do encerramento, `consultar` devolve erro.
 *
 * O `EventBus` entrega de forma síncrona e `consultar` é assíncrono, então o encerramento
 * espera a mesma tarefa do início: um `LiveEncerrada` que chega antes de a consulta
 * terminar não se perde. Falhas não sobem para o publicador do evento; ficam em `falhas`.
 *
 * O VOD nasce em `PROCESSING` e fora do ar, como na E03: o evento `RecordingAvailable`
 * (`markReady`) não faz parte do contrato do CA-01.
 */
export class ConteudoDeLive {
  private readonly repositorio: ContentRepository;
  private readonly criadorDeLive: LiveStreamCreator;
  private readonly criadorDeGravacao: RecordedVideoCreator;
  private readonly configuracao: ConfiguracaoDaLive;
  /** Live do contrato → `LiveStream` registrada no início (ou `undefined` se falhou). */
  private readonly lives = new Map<LiveId, Promise<LiveStream | undefined>>();
  private readonly emAndamento = new Set<Promise<void>>();
  private readonly erros: unknown[] = [];

  constructor(private readonly dependencias: DependenciasConteudoDeLive) {
    this.repositorio = dependencias.repositorio ?? new InMemoryContentRepository();
    const criacao = {
      repository: this.repositorio,
      policy: dependencias.politica ?? new BlocklistPolicyService(this.repositorio, []),
      ...(dependencias.novoId ? { newId: dependencias.novoId } : {}),
      ...(dependencias.agora ? { now: dependencias.agora } : {}),
    };
    this.criadorDeLive = new LiveStreamCreator(criacao);
    this.criadorDeGravacao = new RecordedVideoCreator(criacao);
    this.configuracao = dependencias.configuracao ?? CONFIGURACAO_PADRAO;
  }

  /** Assina `LiveIniciada` e `LiveEncerrada`. O cancelamento desfaz as duas inscrições. */
  assinar(): Cancelamento {
    const { eventos } = this.dependencias;
    const cancelamentos = [
      eventos.assinar("LiveIniciada", (evento) => this.aoIniciar(evento)),
      eventos.assinar("LiveEncerrada", (evento) => this.aoEncerrar(evento)),
    ];
    return () => {
      for (const cancelar of cancelamentos) cancelar();
    };
  }

  /** A `LiveStream` registrada para a live, depois de `ocioso()`. */
  async liveDe(live: LiveId): Promise<LiveStream | undefined> {
    return this.lives.get(live);
  }

  /** O VOD da live, se ela já foi encerrada e gravada. */
  async gravacaoDe(live: LiveId): Promise<RecordedVideo | undefined> {
    const origem = await this.lives.get(live);
    return origem === undefined ? undefined : this.repositorio.findRecordingByStream(origem.id);
  }

  /** Erros das reações aos eventos, na ordem em que aconteceram. */
  get falhas(): readonly unknown[] {
    return this.erros;
  }

  /** Espera as reações em andamento terminarem (para testes e para a composição). */
  async ocioso(): Promise<void> {
    while (this.emAndamento.size > 0) {
      await Promise.all(this.emAndamento);
    }
  }

  private aoIniciar(evento: EventoDe<"LiveIniciada">): void {
    // `TransmissaoPort` publica `LiveIniciada` uma vez por live; repetir não cria outra.
    if (this.lives.has(evento.live)) return;

    const tarefa = this.registrarLive(evento).catch((erro: unknown) => {
      this.erros.push(erro);
      return undefined;
    });
    this.lives.set(evento.live, tarefa);
    this.acompanhar(tarefa.then(() => undefined));
  }

  private aoEncerrar(evento: EventoDe<"LiveEncerrada">): void {
    const inicio = this.lives.get(evento.live);
    // Live aberta antes de o pacote assinar: não há origem para a gravação.
    if (inicio === undefined) return;

    this.acompanhar(
      inicio
        .then((live) => {
          if (live === undefined || live.status !== LiveStreamStatus.LIVE) return;
          live.finish(evento.em);
          this.repositorio.save(live);
          this.criadorDeGravacao.submit({ streamId: live.id });
        })
        .catch((erro: unknown) => {
          this.erros.push(erro);
        }),
    );
  }

  private async registrarLive(evento: EventoDe<"LiveIniciada">): Promise<LiveStream | undefined> {
    const resumo = await this.dependencias.transmissao.consultar(evento.live);
    if (!resumo.ok) {
      throw new Error(
        `LiveIniciada ${evento.live}: consultar falhou (${resumo.erro.codigo}: ${resumo.erro.mensagem})`,
      );
    }

    const live = this.criadorDeLive.submit({
      ownerId: resumo.valor.criador,
      channelId: evento.canal,
      config: { ...this.configuracao, title: resumo.valor.titulo },
    });
    live.markLive(evento.em);
    if (live.moderationStatus === ModerationResult.APPROVED) {
      live.publish();
    }
    this.repositorio.save(live);
    return live;
  }

  private acompanhar(tarefa: Promise<void>): void {
    this.emAndamento.add(tarefa);
    void tarefa.finally(() => this.emAndamento.delete(tarefa));
  }
}
