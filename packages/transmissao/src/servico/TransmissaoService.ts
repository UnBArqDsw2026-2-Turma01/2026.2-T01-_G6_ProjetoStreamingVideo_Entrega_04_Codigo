import { randomUUID } from 'node:crypto';
import {
  canalId,
  liveId,
  type CanalId,
  type ErroDominio,
  type EventBus,
  type LiveId,
  type LiveResumo,
  type PresetTransmissao,
  type Resultado,
  type Sessao,
  type TransmissaoPort,
  type UsuarioId,
} from '@g6/shared-kernel';
import { StreamChannel } from '../canal';
import { criarConfiguracao, InvalidStreamConfigError } from '../configuracao';

/** Opções do serviço. Só `eventBus` é obrigatório; o resto existe para teste e para os apps. */
export interface TransmissaoServiceOpcoes {
  /** Barramento único da aplicação: o canal publica `LiveIniciada` e `LiveEncerrada` nele. */
  readonly eventBus: EventBus;
  /**
   * Chamado com o canal recém-criado, antes de a live entrar no ar. É por aqui que os apps
   * anexam observadores (notificações, moderação), já que o canal não é exposto.
   */
  readonly configurarCanal?: (canal: StreamChannel, criador: Sessao) => void;
  /** Gerador de `LiveId`. O padrão é `live_<uuid>`; os testes injetam um determinístico. */
  readonly gerarLiveId?: () => LiveId;
}

interface LiveNoAr {
  readonly resumo: LiveResumo;
  readonly canal: StreamChannel;
}

const falha = (codigo: string, mensagem: string): { ok: false; erro: ErroDominio } => ({
  ok: false,
  erro: { codigo, mensagem },
});

/** O canal de um criador é derivado do id dele: um criador, um canal. */
const canalDoCriador = (criador: UsuarioId): CanalId => canalId(`canal_${criador}`);

/**
 * Ciclo de vida da live: liga a configuração (Builder + Director) ao canal (Observer).
 *
 * Fluxo de `abrir`: confere o papel → monta a `StreamConfig` do preset → cria o
 * `StreamChannel` com ela e o `EventBus` → `goLive`, que despacha aos observadores e
 * publica `LiveIniciada`. `encerrar` faz o caminho inverso e o canal publica
 * `LiveEncerrada`. O serviço não publica evento nenhum: a garantia de "uma vez cada" é do
 * canal, e o serviço só garante que chama `goLive`/`endLive` uma vez por live.
 *
 * Duas regras além do contrato do port, para o canal nunca ficar em estado inconsistente:
 * um criador tem no máximo uma live no ar (`LIVE_JA_ABERTA`), e uma live só é encerrada
 * uma vez. O token da sessão não é revalidado aqui (o kernel diz que nenhum pacote o faz).
 */
export class TransmissaoService implements TransmissaoPort {
  private readonly eventBus: EventBus;
  private readonly configurarCanal: ((canal: StreamChannel, criador: Sessao) => void) | undefined;
  private readonly gerarLiveId: () => LiveId;

  private readonly noAr = new Map<LiveId, LiveNoAr>();
  /** Criadores com live no ar ou em abertura: fecha a janela de corrida entre dois `abrir`. */
  private readonly criadoresOcupados = new Set<UsuarioId>();
  /** Lives com `encerrar` em andamento: impede publicar `LiveEncerrada` duas vezes. */
  private readonly encerrando = new Set<LiveId>();

  constructor(opcoes: TransmissaoServiceOpcoes) {
    this.eventBus = opcoes.eventBus;
    this.configurarCanal = opcoes.configurarCanal;
    this.gerarLiveId = opcoes.gerarLiveId ?? (() => liveId(`live_${randomUUID()}`));
  }

  async abrir(criador: Sessao, preset: PresetTransmissao): Promise<Resultado<LiveResumo>> {
    if (criador.papel !== 'criador') {
      return falha('ACESSO_NEGADO', 'Somente criadores podem abrir lives');
    }

    let config;
    try {
      config = criarConfiguracao(preset);
    } catch (erro) {
      if (erro instanceof InvalidStreamConfigError) {
        return falha('CONFIGURACAO_INVALIDA', erro.violations.join('; '));
      }
      throw erro;
    }

    if (this.criadoresOcupados.has(criador.usuarioId)) {
      return falha('LIVE_JA_ABERTA', 'Este criador já tem uma live no ar');
    }
    this.criadoresOcupados.add(criador.usuarioId);

    const canalDaLive = canalDoCriador(criador.usuarioId);
    try {
      const live = this.gerarLiveId();
      const canal = new StreamChannel(
        canalDaLive,
        criador.usuarioId,
        'TWITCH',
        undefined,
        undefined,
        this.eventBus,
        config,
      );
      this.configurarCanal?.(canal, criador);

      const resumo: LiveResumo = {
        live,
        canal: canalDaLive,
        criador: criador.usuarioId,
        // `config.title` já passou pelo trim do builder; `preset.titulo` pode ter espaços.
        titulo: config.title,
        // Instante do serviço: o `startedAt` do canal só existe dentro do `goLive`, tarde
        // demais para o resumo já estar consultável. Difere de `LiveIniciada.em` por ms.
        iniciadaEm: new Date(),
      };
      // A live precisa ser consultável antes de o canal publicar `LiveIniciada`: o EventBus
      // entrega ao assinante de forma síncrona, dentro do `goLive`, e quem reage ao evento
      // (o `conteudo`) chama `consultar` nesse mesmo instante para saber dono e título.
      // Limites: se o `goLive` falhar depois de publicar, o serviço desfaz o próprio estado,
      // mas assinantes que já reagiram ao evento não são desfeitos; e, como o id já é público
      // no evento, um assinante poderia chamar `encerrar` ainda durante a abertura.
      this.noAr.set(live, { resumo, canal });
      try {
        await canal.goLive(config, undefined, undefined, undefined, live);
      } catch (erro) {
        this.noAr.delete(live);
        throw erro;
      }
      return { ok: true, valor: resumo };
    } catch (erro) {
      this.criadoresOcupados.delete(criador.usuarioId);
      return falha('FALHA_AO_ABRIR', erro instanceof Error ? erro.message : String(erro));
    }
  }

  async encerrar(criador: Sessao, live: LiveId): Promise<Resultado<void>> {
    const entrada = this.noAr.get(live);
    if (!entrada) {
      return falha('NAO_ENCONTRADA', 'Live inexistente ou já encerrada');
    }
    if (entrada.resumo.criador !== criador.usuarioId) {
      return falha('ACESSO_NEGADO', 'Apenas o criador que abriu a live pode encerrá-la');
    }
    if (this.encerrando.has(live)) {
      return falha('NAO_ENCONTRADA', 'Live inexistente ou já encerrada');
    }

    this.encerrando.add(live);
    try {
      await entrada.canal.endLive();
      this.noAr.delete(live);
      this.criadoresOcupados.delete(entrada.resumo.criador);
      return { ok: true, valor: undefined };
    } catch (erro) {
      return falha('FALHA_AO_ENCERRAR', erro instanceof Error ? erro.message : String(erro));
    } finally {
      this.encerrando.delete(live);
    }
  }

  async consultar(live: LiveId): Promise<Resultado<LiveResumo>> {
    const entrada = this.noAr.get(live);
    if (!entrada || this.encerrando.has(live)) {
      return falha('NAO_ENCONTRADA', 'Live inexistente ou encerrada');
    }
    return { ok: true, valor: entrada.resumo };
  }
}
